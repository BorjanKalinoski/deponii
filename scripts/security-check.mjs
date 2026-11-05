// Daily security and update check. Read-only: it never modifies files.
//
//   node scripts/security-check.mjs                       (npm run security)
//   node scripts/security-check.mjs --out /path/report.json
//   npm run security -- --out /path/report.json
//
// Prints a JSON report on stdout and a short human summary on stderr. With
// --out it also writes the JSON to that file, which must be outside the
// repository (`npm run` prints a banner on stdout, so use --out when you need
// a clean JSON file). Run `npm ci` first so node_modules matches package-lock.json.
//
// The report covers npm audit (production and dev dependencies), npm outdated,
// the vendored copies in assets/ (scripts/vendor.mjs --check) and the GitHub
// Actions referenced in .github/workflows. It also works out an update plan
// following the policy in docs/maintenance.md:
//   - patch and minor updates for every direct dependency;
//   - a major update only when it is needed to fix a high or critical advisory;
//   - GitHub Actions only to a newer version of the same action.
//
// Exit 0 when the report was produced, whatever it found. Exit 2 when the check
// itself could not run (no node_modules, npm audit or npm outdated failed); the
// JSON is still printed with status "error" and the reason in `errors`.
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { inspectVendored, VENDORED, ROOT } from './vendor.mjs';

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const BLOCKING = new Set(['high', 'critical']);

// ---------- small helpers ----------

function run(cmd, args, { timeout = 120_000, cwd = ROOT } = {}) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error ? (res.error.code === 'ETIMEDOUT' ? `timed out after ${timeout / 1000}s` : res.error.message) : null,
  };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

const firstLine = (s) => String(s || '').trim().split('\n').find(Boolean) || '';

// Minimal semver for plain release versions (x.y.z). Pre-releases are ignored.
const STABLE = /^v?(\d+)\.(\d+)\.(\d+)$/;
function parse(v) {
  const m = STABLE.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmp(a, b) {
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
function diffKind(from, to) {
  const a = parse(from), b = parse(to);
  if (!a || !b || cmp(to, from) <= 0) return null;
  if (a[0] !== b[0]) return 'major';
  // In 0.x a minor bump is breaking (caret semantics), so treat it as major.
  if (a[0] === 0 && a[1] !== b[1]) return 'major';
  return a[1] !== b[1] ? 'minor' : 'patch';
}
const sameMajor = (from, to) => { const k = diffKind(from, to); return k === 'minor' || k === 'patch'; };

// Does `version` fall inside an npm audit range such as "<=6.4.0" or
// ">=1.0.0 <1.2.3 || >=2.0.0 <2.0.5"? Returns null when the range can't be read.
function inRange(version, range) {
  if (!parse(version)) return null;
  if (range === '*') return true;
  let understood = true;
  const hit = String(range).split('||').some((part) => {
    const comparators = part.trim().split(/\s+/).filter(Boolean);
    if (!comparators.length) return false;
    return comparators.every((c) => {
      const m = /^(<=|>=|<|>|=)?v?(\d+\.\d+\.\d+)(?:-[\w.]+)?$/.exec(c);
      if (!m) { understood = false; return false; }
      const d = cmp(version, m[2]);
      switch (m[1]) {
        case '<': return d < 0;
        case '<=': return d <= 0;
        case '>': return d > 0;
        case '>=': return d >= 0;
        default: return d === 0;
      }
    });
  });
  return understood ? hit : null;
}

// ---------- npm audit ----------

function summariseAudit(json) {
  const counts = Object.fromEntries([...SEVERITIES, 'total'].map((s) => [s, json?.metadata?.vulnerabilities?.[s] ?? 0]));
  const packages = Object.values(json?.vulnerabilities || {}).map((v) => ({
    name: v.name,
    severity: v.severity,
    isDirect: !!v.isDirect,
    range: v.range,
    advisories: (v.via || []).filter((x) => typeof x === 'object').map((a) => ({
      id: (/GHSA-[\w-]+/.exec(a.url || '') || [String(a.source)])[0],
      title: a.title,
      severity: a.severity,
      url: a.url,
      range: a.range,
    })),
    via: (v.via || []).filter((x) => typeof x === 'string'),
    fixAvailable: v.fixAvailable,
  }));
  return { counts, packages };
}

function audit(extraArgs) {
  const res = run('npm', ['audit', '--json', ...extraArgs]);
  const json = parseJson(res.stdout);
  if (!json || json.error || !json.metadata) {
    const reason = json?.error?.summary || json?.error?.code || res.error || firstLine(res.stderr) || `exit ${res.code}`;
    return { error: `npm audit ${extraArgs.join(' ')} failed: ${reason}`.replace(/\s+/g, ' ').trim() };
  }
  return summariseAudit(json);
}

// ---------- npm outdated / versions ----------

function npmView(name) {
  const res = run('npm', ['view', name, 'versions', 'dist-tags', '--json'], { timeout: 60_000 });
  const json = parseJson(res.stdout);
  if (!json || json.error) return { error: `npm view ${name} failed: ${json?.error?.summary || res.error || firstLine(res.stderr)}` };
  const versions = Array.isArray(json.versions) ? json.versions : [json.versions].filter(Boolean);
  return { versions: versions.filter((v) => parse(v)), latest: json['dist-tags']?.latest };
}

// Which of the vendored source files does name@version ship? Lists the
// published tarball without unpacking it anywhere (run outside the repo).
function missingVendoredSources(name, version) {
  const entry = VENDORED.find((v) => v.name === name);
  if (!entry) return { missing: [] };
  const res = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', `${name}@${version}`], { timeout: 120_000, cwd: tmpdir() });
  const json = parseJson(res.stdout);
  const files = Array.isArray(json) && json[0]?.files ? new Set(json[0].files.map((f) => f.path)) : null;
  if (!files) return { error: `couldn't list the files of ${name}@${version}: ${res.error || firstLine(res.stderr) || `exit ${res.code}`}` };
  return { missing: entry.files.map(([from]) => from).filter((from) => !files.has(from)) };
}

// ---------- GitHub Actions ----------

async function workflowUses() {
  const dir = join(ROOT, '.github', 'workflows');
  let names = [];
  try { names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n)).sort(); } catch { return []; }
  const refs = [];
  for (const name of names) {
    const lines = (await readFile(join(dir, name), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const m = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?/.exec(line);
      if (!m || m[1].startsWith('./') || m[1].startsWith('docker://')) return;
      const [path, ref = ''] = m[1].split('@');
      const [owner, repo] = path.split('/');
      refs.push({ file: `.github/workflows/${name}`, line: i + 1, uses: m[1], action: path, repo: `${owner}/${repo}`, ref });
    });
  }
  return refs;
}

function latestActionRelease(repo) {
  // 1. The latest GitHub release, via gh. The sandbox proxy blocks the API for
  //    repositories outside this project, which shows up as HTTP 403.
  const gh = run('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name'], { timeout: 30_000 });
  const tag = gh.stdout.trim();
  if (gh.code === 0 && parse(tag)) return { latest: tag, source: 'gh release' };
  const ghProblem = gh.error && /ENOENT/.test(gh.error) ? 'gh not installed'
    : /403|not enabled for this session|blocked/i.test(gh.stdout + gh.stderr) ? 'gh API blocked (HTTP 403)'
    : firstLine(gh.stderr || gh.stdout || gh.error) || `gh exit ${gh.code}`;
  // 2. Fall back to the repository's release tags over plain git.
  const git = run('git', ['ls-remote', '--tags', '--refs', `https://github.com/${repo}.git`], { timeout: 30_000 });
  if (git.code === 0) {
    const all = git.stdout.split('\n').map((l) => l.split('refs/tags/')[1]).filter(Boolean);
    const releases = all.filter((t) => parse(t)).sort(cmp);
    if (releases.length) {
      return { latest: releases.at(-1), source: 'git tags', note: `gh: ${ghProblem}`, majorTags: all.filter((t) => /^v?\d+$/.test(t)) };
    }
  }
  return { latest: null, source: null, note: `couldn't check: ${ghProblem}; git ls-remote: ${firstLine(git.stderr) || git.error || `exit ${git.code}`}` };
}

function compareAction(ref, latest, majorTags) {
  if (!latest) return { status: 'unknown' };
  if (/^[0-9a-f]{40}$/.test(ref)) return { status: 'unknown', note: `pinned to a commit SHA; latest release is ${latest}` };
  const cur = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(ref);
  if (!cur) return { status: 'unknown', note: `can't compare ref "${ref}" with ${latest}` };
  const [lMajor] = parse(latest);
  const curMajor = Number(cur[1]);
  const majorOnly = cur[2] === undefined;
  if (majorOnly) {
    // A major tag like v5 already follows every v5.x.y release.
    if (lMajor <= curMajor) return { status: 'up-to-date' };
    const prefix = ref.startsWith('v') ? 'v' : '';
    const suggested = `${prefix}${lMajor}`;
    const tagExists = majorTags ? majorTags.includes(suggested) : null;
    return { status: 'update-available', updateType: 'major', suggestedRef: tagExists === false ? latest : suggested };
  }
  const full = `${cur[1]}.${cur[2] ?? 0}.${cur[3] ?? 0}`;
  const kind = diffKind(full, latest);
  if (!kind) return { status: 'up-to-date' };
  return { status: 'update-available', updateType: kind, suggestedRef: latest };
}

// ---------- plan ----------

function buildPlan({ deps, auditAll, auditProd, vendored, actions }) {
  const plan = { npm: [], npmAuditFix: false, skipped: [], vendorRefresh: false, actions: [], unfixed: [], attention: [] };
  const byName = new Map(deps.map((d) => [d.name, d]));
  const security = new Map(); // direct dep name -> { to, fixes: [advisory], major }

  for (const v of auditAll.packages || []) {
    if (!v.advisories.length) continue; // only the packages that carry the advisory
    const fix = v.fixAvailable;
    const ids = v.advisories.map((a) => `${a.id} (${a.severity})`).join(', ');
    if (fix === true) {
      plan.npmAuditFix = true;
      continue;
    }
    if (!fix || typeof fix !== 'object') {
      plan.attention.push(`${v.name}: ${ids} has no fix available from npm; nothing to update, recheck tomorrow.`);
      continue;
    }
    const dep = byName.get(fix.name);
    if (!dep) {
      plan.attention.push(`${v.name}: ${ids} is fixed by ${fix.name}@${fix.version}, which is not a direct dependency; needs a person to look at it.`);
      continue;
    }
    const blocking = v.advisories.some((a) => BLOCKING.has(a.severity)) || BLOCKING.has(v.severity);
    if (fix.isSemVerMajor && !blocking) {
      plan.skipped.push({ name: dep.name, from: dep.current, to: fix.version, reason: `major update would fix ${ids}, but only high/critical advisories justify a major` });
      continue;
    }
    const prev = security.get(dep.name);
    const to = prev && cmp(prev.to, fix.version) > 0 ? prev.to : fix.version;
    security.set(dep.name, { to, fixes: [...(prev?.fixes || []), ...v.advisories], major: diffKind(dep.current, to) === 'major' });
  }

  const entry = (dep, to, reason, fixes) => ({
    name: dep.name, type: dep.type, from: dep.current, to, kind: diffKind(dep.current, to), reason, vendored: dep.vendored,
    fixes: fixes.map((a) => ({ id: a.id, severity: a.severity, title: a.title, url: a.url })),
    install: `npm install ${dep.type === 'devDependencies' ? '--save-dev ' : ''}${/^\d+\.\d+\.\d+$/.test(dep.spec) ? '--save-exact ' : ''}${dep.name}@${to}`,
  });
  for (const dep of deps) {
    const sec = security.get(dep.name);
    const minor = dep.latestSameMajor && diffKind(dep.current, dep.latestSameMajor)
      ? entry(dep, dep.latestSameMajor, `${diffKind(dep.current, dep.latestSameMajor)} update`, [])
      : null;
    let to = minor?.to ?? null;
    if (sec && (!minor || cmp(sec.to, minor.to) >= 0)) {
      const reason = sec.major ? 'major update required to fix a high/critical advisory' : 'security fix';
      // Keep the same-major update as a fallback in case the security target can't be used.
      plan.npm.push({ ...entry(dep, sec.to, reason, sec.fixes), ...(minor && cmp(sec.to, minor.to) > 0 ? { fallback: minor } : {}) });
      to = sec.to;
    } else if (minor) {
      plan.npm.push(minor);
    }
    if (dep.latest && diffKind(dep.current, dep.latest) === 'major' && !(to && diffKind(dep.current, to) === 'major') && !plan.skipped.some((s) => s.name === dep.name)) {
      plan.skipped.push({ name: dep.name, from: dep.current, to: dep.latest, reason: 'major update with no high/critical advisory requiring it' });
    }
  }

  // A vendored package must still ship every file the site uses, or the update
  // needs code changes (index.html, app code), which the routine never makes.
  for (let i = 0; i < plan.npm.length; i++) {
    const p = plan.npm[i];
    if (!p.vendored) continue;
    const layout = missingVendoredSources(p.name, p.to);
    if (layout.error) {
      plan.attention.push(`${layout.error}; \`npm run vendor\` will tell (it refuses to copy when a file is missing).`);
    } else if (layout.missing.length) {
      plan.skipped.push({
        name: p.name, from: p.from, to: p.to, needsCodeChanges: true,
        reason: `${p.name}@${p.to} no longer ships ${layout.missing.join(', ')}, which the site loads; the update needs code changes`,
      });
      if (p.fallback) { plan.npm[i] = p.fallback; i--; } // check the same-major update instead
      else { plan.npm.splice(i, 1); i--; }
      continue;
    }
    delete p.fallback;
    plan.vendorRefresh = true;
  }
  for (const p of plan.npm) delete p.fallback;
  if (!vendored.ok) plan.vendorRefresh = true;

  // High/critical production advisories that today's plan leaves in place.
  const fixedIds = new Set(plan.npm.flatMap((p) => p.fixes.map((f) => f.id)));
  for (const v of auditProd.packages || []) {
    for (const a of v.advisories) {
      if (!BLOCKING.has(a.severity) || fixedIds.has(a.id) || v.fixAvailable === true) continue;
      const skip = plan.skipped.find((s) => s.name === (v.fixAvailable?.name ?? v.name));
      plan.unfixed.push({
        package: v.name, id: a.id, severity: a.severity, title: a.title, url: a.url,
        reason: skip ? skip.reason : v.fixAvailable ? `fix is ${v.fixAvailable.name}@${v.fixAvailable.version}` : 'no fixed version published',
      });
    }
  }
  for (const u of plan.unfixed) plan.attention.push(`UNFIXED ${u.severity} ${u.id} in ${u.package} (${u.title}): ${u.reason}. Needs a person.`);

  const seen = new Map();
  for (const a of actions) {
    if (a.status !== 'update-available') {
      if (a.status === 'unknown' && !seen.has(a.repo)) plan.attention.push(`${a.action}@${a.ref}: ${a.note || "couldn't check the latest release"}`);
      seen.set(a.repo, true);
      continue;
    }
    const key = `${a.action}@${a.ref}`;
    const existing = plan.actions.find((x) => x.key === key);
    if (existing) { existing.files.push(`${a.file}:${a.line}`); continue; }
    plan.actions.push({ key, action: a.action, from: a.ref, to: a.suggestedRef, latest: a.latest, updateType: a.updateType, files: [`${a.file}:${a.line}`] });
    seen.set(a.repo, true);
  }
  plan.actions.forEach((x) => delete x.key);
  return plan;
}

function decide(plan) {
  // The Tester's audit gate (npm audit --audit-level=high --omit=dev) would
  // reject any branch while these remain, so there is nothing the routine can release.
  if (plan.unfixed.length) return 'blocked';
  if (plan.npmAuditFix || plan.npm.some((p) => p.fixes.length)) return 'security-fix';
  if (plan.npm.length || plan.vendorRefresh || plan.actions.length) return 'update';
  return 'nothing-to-do';
}

function recommend(plan, vendored) {
  const out = [];
  for (const p of plan.npm) {
    const fixes = p.fixes.length ? `; fixes ${[...new Set(p.fixes.map((f) => `${f.id} (${f.severity})`))].join(', ')}` : '';
    out.push(`Update ${p.name} ${p.from} → ${p.to} (${p.kind}${fixes}): \`${p.install}\`${p.vendored ? ', then `npm run vendor`' : ''}.`);
  }
  if (plan.npmAuditFix) out.push('Run `npm audit fix` (without --force) for vulnerable transitive dependencies.');
  if (!vendored.ok && !plan.npm.some((p) => p.vendored)) out.push('Vendored files differ from node_modules: run `npm run vendor` and commit.');
  for (const a of plan.actions) out.push(`Bump ${a.action} ${a.from} → ${a.to} in ${[...new Set(a.files.map((f) => f.split(':')[0]))].join(', ')}.`);
  for (const s of plan.skipped) out.push(`Skip ${s.name} ${s.from} → ${s.to}: ${s.reason}.`);
  for (const a of plan.attention) out.push(`Attention: ${a}`);
  if (!out.length) out.push('Nothing to do.');
  return out;
}

// ---------- main ----------

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = resolve(argv[++i]);
    else if (argv[i].startsWith('--out=')) args.out = resolve(argv[i].slice(6));
    else throw new Error(`Unknown argument: ${argv[i]}\nUsage: node scripts/security-check.mjs [--out /path/outside/the/repo.json]`);
  }
  if (args.out) {
    const rel = relative(ROOT, args.out);
    if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error(`--out must be outside the repository (got ${args.out}); this check never writes inside it.`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    commit: firstLine(run('git', ['rev-parse', 'HEAD']).stdout) || null,
    node: process.version,
    npm: firstLine(run('npm', ['--version']).stdout) || null,
    status: 'error',
    decision: null,
    audit: null,
    outdated: [],
    vendored: null,
    actions: [],
    plan: null,
    recommendedActions: [],
    errors,
  };

  const vendoredNames = new Set(VENDORED.map((v) => v.name));
  const deps = [];
  for (const type of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(pkg[type] || {})) deps.push({ name, spec, type, vendored: vendoredNames.has(name) });
  }

  let installedOk = true;
  for (const dep of deps) {
    const raw = await readFile(join(ROOT, 'node_modules', dep.name, 'package.json'), 'utf8').catch(() => null);
    dep.current = raw ? JSON.parse(raw).version : null;
    if (!dep.current) installedOk = false;
  }
  if (!installedOk) errors.push(`node_modules is missing ${deps.filter((d) => !d.current).map((d) => d.name).join(', ')}; run \`npm ci\` first.`);

  // npm audit: production only, then everything; dev-only = the difference.
  const prod = audit(['--omit=dev']);
  const all = audit([]);
  for (const r of [prod, all]) if (r.error) errors.push(r.error);
  if (!prod.error && !all.error) {
    const prodNames = new Set(prod.packages.map((p) => p.name));
    const devPackages = all.packages.filter((p) => !prodNames.has(p.name));
    const devCounts = Object.fromEntries([...SEVERITIES, 'total'].map((s) => [s, 0]));
    for (const p of devPackages) { devCounts[p.severity] += 1; devCounts.total += 1; }
    report.audit = { prod, dev: { counts: devCounts, packages: devPackages, note: 'counts are packages only reachable through devDependencies' } };
  }

  // npm outdated, plus the newest release in the current major for each dependency.
  const out = run('npm', ['outdated', '--json']);
  const outdatedJson = parseJson(out.stdout || '{}');
  if (outdatedJson === undefined || outdatedJson?.error) errors.push(`npm outdated failed: ${outdatedJson?.error?.summary || out.error || firstLine(out.stderr)}`);
  for (const dep of deps) {
    if (!dep.current) continue;
    const view = npmView(dep.name);
    if (view.error) { errors.push(view.error); continue; }
    const candidates = view.versions.filter((v) => sameMajor(dep.current, v) || v === dep.current).sort(cmp);
    dep.latestSameMajor = candidates.at(-1) || dep.current;
    dep.latest = view.latest;
    const o = outdatedJson?.[dep.name];
    const latestKind = diffKind(dep.current, dep.latest);
    report.outdated.push({
      name: dep.name, type: dep.type, spec: dep.spec, current: dep.current,
      wanted: o?.wanted ?? dep.current, latest: dep.latest,
      latestSameMajor: dep.latestSameMajor,
      updateType: latestKind, majorAvailable: latestKind === 'major', vendored: dep.vendored,
    });
  }

  // Vendored copies (same check as `npm run vendor:check`).
  report.vendored = await inspectVendored();

  // GitHub Actions.
  const uses = await workflowUses();
  const lookups = new Map();
  for (const u of uses) {
    if (!lookups.has(u.repo)) lookups.set(u.repo, latestActionRelease(u.repo));
    const l = lookups.get(u.repo);
    const c = compareAction(u.ref, l.latest, l.majorTags);
    report.actions.push({
      file: u.file, line: u.line, uses: u.uses, action: u.action, ref: u.ref,
      latest: l.latest, source: l.source, status: c.status,
      ...(c.updateType ? { updateType: c.updateType, suggestedRef: c.suggestedRef } : {}),
      ...(c.note || l.note ? { note: [c.note, l.note].filter(Boolean).join('; ') } : {}),
    });
  }

  const fatal = !installedOk || prod.error || all.error || outdatedJson === undefined;
  if (!fatal) {
    report.plan = buildPlan({ deps, auditAll: all, auditProd: prod, vendored: report.vendored, actions: report.actions });
    report.decision = decide(report.plan);
    const vulnerable = report.audit.prod.counts.total + report.audit.dev.counts.total > 0;
    const updates = report.outdated.some((o) => o.updateType) || report.plan.npm.length || report.plan.actions.length || !report.vendored.ok;
    report.status = vulnerable ? 'vulnerable' : updates ? 'updates-available' : 'ok';
    report.recommendedActions = recommend(report.plan, report.vendored);
  } else {
    report.recommendedActions = ['The check could not run completely; fix the errors above and run it again. Do not update anything today.'];
  }

  const json = JSON.stringify(report, null, 2) + '\n';
  process.stdout.write(json);
  if (args.out) await writeFile(args.out, json);
  printSummary(report);
  if (args.out) process.stderr.write(`report written to ${args.out}\n`);
  return fatal ? 2 : 0;
}

function printSummary(r) {
  const lines = [];
  lines.push(`deponii security check at ${r.commit?.slice(0, 7) ?? '?'} (${r.generatedAt})`);
  lines.push(`status: ${r.status}${r.decision ? `, decision: ${r.decision}` : ''}`);
  if (r.audit) {
    for (const scope of ['prod', 'dev']) {
      const a = r.audit[scope];
      const counts = SEVERITIES.filter((s) => a.counts[s]).map((s) => `${a.counts[s]} ${s}`).join(', ') || 'none';
      lines.push(`npm audit ${scope}: ${counts}`);
      for (const p of a.packages.filter((x) => x.advisories.length)) {
        const fix = p.fixAvailable === true ? 'fix: npm audit fix' : p.fixAvailable ? `fix: ${p.fixAvailable.name}@${p.fixAvailable.version}${p.fixAvailable.isSemVerMajor ? ' (major)' : ''}` : 'no fix';
        lines.push(`  ${p.name} ${p.range}: ${p.advisories.map((x) => `${x.id} ${x.severity}`).join(', ')}; ${fix}`);
      }
    }
  }
  for (const o of r.outdated) {
    lines.push(`${o.name} ${o.current}: latest ${o.latest}${o.updateType ? ` (${o.updateType})` : ' (up to date)'}, newest in major ${o.latestSameMajor}`);
  }
  if (r.vendored) lines.push(`vendored: ${r.vendored.ok ? `ok, ${r.vendored.files.length} files match node_modules` : `DRIFT (${r.vendored.files.filter((f) => f.status !== 'same').map((f) => f.path).join(', ')}) ${r.vendored.problems.join('; ')}`}`);
  const actionSeen = new Set();
  for (const a of r.actions) {
    const key = `${a.action}@${a.ref}`;
    if (actionSeen.has(key)) continue;
    actionSeen.add(key);
    lines.push(`action ${key}: ${a.status === 'update-available' ? `→ ${a.suggestedRef} (latest ${a.latest}, ${a.source})` : a.status === 'up-to-date' ? `up to date (latest ${a.latest}, ${a.source})` : `couldn't check (${a.note || 'unknown'})`}`);
  }
  for (const e of r.errors) lines.push(`ERROR: ${e}`);
  lines.push('recommended:');
  for (const x of r.recommendedActions) lines.push(`  - ${x}`);
  process.stderr.write(lines.join('\n') + '\n');
}

main().then((code) => { process.exitCode = code; }, (err) => {
  console.error(err);
  process.exitCode = 2;
});
