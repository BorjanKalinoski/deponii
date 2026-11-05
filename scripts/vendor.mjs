// Copy the vendored third-party files from node_modules into assets/.
//
// The site has no build step: GitHub Pages serves assets/ as committed, so a
// new npm version of MapLibre GL JS or IBM Plex Sans only reaches visitors once
// its files are copied here. This script is the only way those files change.
//
//   node scripts/vendor.mjs           copy files that differ; print what changed
//   node scripts/vendor.mjs --check   change nothing; exit 1 if any vendored file
//                                     differs from node_modules, or node_modules
//                                     does not match package-lock.json
//
// Run `npm ci` first. Exit codes: 0 ok, 1 drift (--check) or a problem that
// stopped the copy (missing package, missing source file, version mismatch).
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PLEX_SUBSETS = ['cyrillic', 'latin', 'latin-ext'];
const PLEX_WEIGHTS = [400, 500, 600];

/** Every vendored file: [path inside the npm package, path in the repo]. */
export const VENDORED = [
  {
    name: 'maplibre-gl',
    files: [
      ['dist/maplibre-gl.js', 'assets/vendor/maplibre-gl.js'],
      ['dist/maplibre-gl.css', 'assets/vendor/maplibre-gl.css'],
      ['LICENSE.txt', 'assets/vendor/maplibre-LICENSE.txt'],
    ],
  },
  {
    name: '@fontsource/ibm-plex-sans',
    files: [
      ...PLEX_SUBSETS.flatMap((subset) => PLEX_WEIGHTS.map((weight) => {
        const file = `ibm-plex-sans-${subset}-${weight}-normal.woff2`;
        return [`files/${file}`, `assets/fonts/${file}`];
      })),
      ['LICENSE', 'assets/fonts/OFL.txt'],
    ],
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function readOrNull(path) {
  try { return await readFile(path); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

async function readJson(path) {
  const buf = await readOrNull(path);
  return buf ? JSON.parse(buf.toString('utf8')) : null;
}

const isExact = (spec) => /^\d+\.\d+\.\d+$/.test(spec || '');

/**
 * Compare every vendored file with its source in node_modules. Never writes.
 * Returns { ok, packages: [{name, declared, locked, installed}], files: [...], problems: [...] }.
 * A file's status is "same", "differs", "missing" (not in assets/) or "no-source"
 * (not in the installed package, e.g. a new major renamed it).
 */
export async function inspectVendored(root = ROOT) {
  const pkg = await readJson(join(root, 'package.json'));
  const lock = await readJson(join(root, 'package-lock.json'));
  const problems = [];
  const packages = [];
  const files = [];
  for (const { name, files: pairs } of VENDORED) {
    const declared = pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? null;
    const locked = lock?.packages?.[`node_modules/${name}`]?.version ?? null;
    const installed = (await readJson(join(root, 'node_modules', name, 'package.json')))?.version ?? null;
    packages.push({ name, declared, locked, installed });
    if (!declared) problems.push(`${name} is not in package.json`);
    if (!installed) {
      problems.push(`${name} is not installed in node_modules (run npm ci)`);
    } else {
      if (locked && installed !== locked) problems.push(`${name}: node_modules has ${installed} but package-lock.json has ${locked} (run npm ci)`);
      if (isExact(declared) && locked && declared !== locked) problems.push(`${name}: package.json pins ${declared} but package-lock.json has ${locked} (run npm install)`);
    }
    for (const [from, to] of pairs) {
      const source = join('node_modules', name, from);
      const src = installed ? await readOrNull(join(root, source)) : null;
      const dest = await readOrNull(join(root, to));
      let status;
      if (!src) status = 'no-source';
      else if (!dest) status = 'missing';
      else status = src.equals(dest) ? 'same' : 'differs';
      if (installed && !src) problems.push(`${name}@${installed} has no ${from}; the vendored layout no longer matches this version (needs a code change, see docs/maintenance.md)`);
      files.push({
        package: name, source, path: to, status,
        sourceSha256: src ? sha256(src) : null,
        vendoredSha256: dest ? sha256(dest) : null,
      });
    }
  }
  const ok = problems.length === 0 && files.every((f) => f.status === 'same');
  return { ok, packages, files, problems };
}

/** Copy every differing vendored file. Refuses to copy anything if a problem was found. */
export async function vendor(root = ROOT) {
  const report = await inspectVendored(root);
  if (report.problems.length) return { ...report, changed: [] };
  const changed = [];
  for (const f of report.files) {
    if (f.status === 'same') continue;
    await mkdir(dirname(join(root, f.path)), { recursive: true });
    await copyFile(join(root, f.source), join(root, f.path));
    changed.push(f.path);
  }
  return { ...(await inspectVendored(root)), changed };
}

function printPackages(report, out) {
  for (const p of report.packages) {
    out(`${p.name} ${p.installed ?? '(not installed)'}  (package.json ${p.declared ?? '-'}, lock ${p.locked ?? '-'})`);
  }
}

async function main(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(' ')}\nUsage: node scripts/vendor.mjs [--check]`);
    return 2;
  }
  if (check) {
    const report = await inspectVendored();
    printPackages(report, console.log);
    for (const problem of report.problems) console.error(`PROBLEM  ${problem}`);
    const bad = report.files.filter((f) => f.status !== 'same');
    for (const f of bad) console.error(`${f.status.toUpperCase().padEnd(9)}${f.path}  (from ${f.source})`);
    if (report.ok) {
      console.log(`OK: all ${report.files.length} vendored files match node_modules.`);
      return 0;
    }
    console.error(`FAIL: vendored files are out of step with node_modules. Run \`npm ci && npm run vendor\` and commit the result.`);
    return 1;
  }
  const report = await vendor();
  printPackages(report, console.log);
  if (report.problems.length) {
    for (const problem of report.problems) console.error(`PROBLEM  ${problem}`);
    console.error('Nothing was copied.');
    return 1;
  }
  for (const f of report.files) console.log(`${report.changed.includes(f.path) ? 'updated  ' : 'unchanged'}  ${f.path}`);
  console.log(report.changed.length
    ? `${report.changed.length} vendored file(s) updated. Review and commit them with package.json and package-lock.json.`
    : 'No vendored files changed.');
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
