# Daily maintenance runbook

Once a day, four agents keep the site's dependencies patched: a **Checker**, an
**Implementer**, a **Tester** and a **Releaser**, run one after another. Each is a
separate agent with its own clone. They pass work along only through **handoff
files**. GitHub Pages serves `main` as it is, so whatever the Releaser pushes is live
within minutes. Every rule below exists to keep a bad update off `main`.

Each role reads **Shared setup**, **Policy**, **Guardrails** and its own section.
Every role ends by writing its handoff file, whose first line is the machine-readable
verdict the next role checks before it starts.

| Role | Starts when | Writes | Continue only if |
|---|---|---|---|
| Checker | the run starts | `security.json`, `checker.md` | `DECISION: update` or `DECISION: security-fix` |
| Implementer | Checker says continue | branch `maint/<DATE>` in its clone, `implementer.md` | `RESULT: ready` |
| Tester | Implementer is ready | `tester.md`, logs | `RESULT: pass` |
| Releaser | Tester passed | `releaser.md` | (last role) |

After the last role that runs, the orchestrator writes `report.md` (see **Run
report**) and ends the run.

## Shared setup

Shell state does not carry over between commands, so **start every command with
`. "$HOME/deponii-maint-runs/env.sh"`** and use absolute paths or `git -C`/`npm --prefix`.
The Checker creates that file. Its variables are:

| Variable | Value |
|---|---|
| `DATE` | the run's UTC date, `YYYY-MM-DD`, fixed for the whole run |
| `WORK` | `$HOME/deponii-maint-runs/$DATE`, outside every repository |
| `HANDOFF` | `$WORK/handoff`: the handoff files and logs |
| `BRANCH` | `maint/$DATE` |
| `REPO_URL` | the `origin` URL of the repository clone the run was given |
| `GH_REPO` | `BorjanKalinoski/deponii` (`gh` reads it, so `gh run list` needs no `-R`) |

Clones: `$WORK/checker`, `$WORK/implementer`, `$WORK/tester`, `$WORK/releaser`.
Each role writes only in its own clone and in `$HANDOFF`.

**Allowed paths.** A maintenance branch may change only these files:
`package.json`, `package-lock.json`, `assets/vendor/*`, `assets/fonts/*`,
`.github/workflows/*`. This check prints the files outside that list. It must print
nothing (`<base>` is the commit the branch started from):

```sh
git diff --name-only <base> HEAD | grep -Ev '^(package\.json|package-lock\.json|assets/vendor/|assets/fonts/|\.github/workflows/)' || true
```

**Commit trailer.** Every commit the routine makes ends with `Maint-Run: <DATE>`
(then any attribution trailers the session requires). The Checker uses the trailer to
see whether today's run already happened.

## Policy: what gets updated

The plan is computed by `npm run security` (`scripts/security-check.mjs`) and lives in
`security.json` under `plan`. The Implementer carries it out and makes no updates of
its own.

- **npm, patch and minor**: every direct dependency moves to the newest release in its
  current major (`plan.npm`, `kind` `patch` or `minor`).
- **npm, major**: only when a high or critical advisory needs it (`plan.npm`, `kind`
  `major`, `fixes` non-empty). A major with no such advisory is listed in
  `plan.skipped` and stays where it is.
- **Transitive advisories**: `npm audit fix` without `--force`, when
  `plan.npmAuditFix` is `true`.
- **Vendored packages** (`maplibre-gl`, `@fontsource/ibm-plex-sans`): the site loads
  committed copies from `assets/vendor` and `assets/fonts`, never `node_modules`. An
  update reaches the site only through `npm run vendor`, which goes in the same commit
  as `package.json` and `package-lock.json`. `npm run vendor:check` (CI and Tester)
  fails whenever the copies and the installed packages differ.
- **GitHub Actions**: an action moves only to a newer version of the same action (same
  `owner/repo`), with the same pin style (a major tag such as `v5` becomes `v7`). Every
  workflow uses the same version of a given action (`plan.actions`).
- **Code changes are out of scope.** If an update only works with changes to app code,
  `index.html`, tests or `data/`, it is skipped and reported. When the security check
  sees that a vendored package's new version no longer ships a file the site loads, it
  already lists that version in `plan.skipped` with `needsCodeChanges: true`.
- **Blocked.** If a high or critical advisory in production dependencies stays unfixed
  under this policy (`plan.unfixed`), the decision is `blocked`. The Tester's audit
  gate would reject any branch, so the run stops after the Checker and the report asks
  a person to act.

## Guardrails

These hold for every role, every day:

1. Only the Releaser pushes, and it pushes only `main`, only as a fast-forward:
   `git push origin main`. Force pushes (`--force`, `--force-with-lease`, `+refspec`)
   and history rewrites on `main` are forbidden. Mistakes on `main` are undone with
   `git revert` commits.
2. A branch changes only the allowed paths. `data/`, `index.html`, `assets/app.js`,
   `assets/lib/`, `assets/styles.css`, `test/`, `e2e/`, `playwright.config.mjs` and
   `scripts/` stay byte-identical.
3. Test commands run exactly as written here, against the whole suite. Filtering,
   skipping or editing a test, changing timeouts or retries, or updating snapshots to
   get a pass is forbidden. A red test means the update is rejected.
4. Nothing is pushed unless every earlier step of the run passed. When anything fails
   unexpectedly, the role stops, records the command and its output in its handoff
   file, and the run ends with the report.
5. The Google Sheet, repository settings (Pages, branch protection, secrets, Actions
   settings) and the "Update data" workflow stay untouched: never trigger, cancel or
   re-run it.
6. Secrets stay secret. Never print tokens, `gh auth token`, credential helpers,
   credentials inside a remote URL, `.npmrc` contents or the whole environment. Handoff files and the report contain
   no secret values.
7. One run per day. The Checker stops with `already-done` when today's run already
   reached `main`. A run never starts a second Implementer for the same `DATE`.
8. If the Checker decides anything other than `update` or `security-fix`, the run
   stops after the Checker and the report says why.
9. `npm audit fix --force` and blanket `npm update` are forbidden. Installs use
   exactly the `install` commands from the plan.

## Checker

Input: the path of the repository clone the run was given (call it `<attached>`).

1. If `$HOME/deponii-maint-runs/$(date -u +%F)/handoff/checker.md` exists, today's run
   already started in this environment: change nothing and report
   `DECISION: already-done` to the orchestrator. Otherwise create the run's
   directories and `env.sh` in one command (replace `<attached>` with the clone's
   absolute path):
   ```sh
   DATE=$(date -u +%F); WORK="$HOME/deponii-maint-runs/$DATE"
   mkdir -p "$WORK/handoff"
   cat > "$HOME/deponii-maint-runs/env.sh" <<EOF
   export DATE=$DATE WORK=$WORK HANDOFF=$WORK/handoff BRANCH=maint/$DATE
   export REPO_URL=$(git -C "<attached>" remote get-url origin) GH_REPO=BorjanKalinoski/deponii
   EOF
   ```
2. Make a fresh clone and record the commit you check:
   ```sh
   . "$HOME/deponii-maint-runs/env.sh"
   git clone --quiet "$REPO_URL" "$WORK/checker"
   git -C "$WORK/checker" rev-parse origin/main
   ```
3. Today's run already happened if `main` carries today's trailer:
   ```sh
   git -C "$WORK/checker" log origin/main --format='%h %s' --grep="^Maint-Run: $DATE$"
   ```
   Any output means `DECISION: already-done`. Go to step 6.
4. Install exactly what the lockfile says, then run the check:
   ```sh
   cd "$WORK/checker" && npm ci
   cd "$WORK/checker" && npm run security -- --out "$HANDOFF/security.json"
   ```
   `npm ci` must exit 0. The check exits 0 when it produced a report, even if it
   found problems. Exit 2 means the check itself failed: `DECISION: error`, with the
   `errors` array in `checker.md`.
5. Take the decision from `security.json`'s `.decision`:
   - `nothing-to-do`: everything is current, or only majors with no advisory exist.
   - `update`: patch/minor updates, vendored refresh or action bumps, with no
     advisory fixed.
   - `security-fix`: the plan fixes at least one advisory.
   - `blocked`: a high/critical production advisory can't be fixed under the policy.
     Copy `plan.unfixed` into `checker.md`.
   Then confirm the plan follows **Policy**: every `plan.npm` entry with `kind: major`
   has non-empty `fixes` with a high or critical severity. If it doesn't, decide
   `error` and say why.
6. Write `$HANDOFF/checker.md`. First line: `DECISION: <decision>`. Then the checked
   `origin/main` commit, `status`, the audit counts (prod and dev), the human summary
   the check printed on stderr, and `recommendedActions`.

Done when `checker.md` exists with a valid first line and, unless the decision is
`already-done`, `security.json` parses as JSON.

## Implementer

Input: `checker.md` with `DECISION: update` or `security-fix`, and
`$HANDOFF/security.json`. Anything else: stop.

1. Fresh clone, new branch from the latest `origin/main`, clean install:
   ```sh
   . "$HOME/deponii-maint-runs/env.sh"
   git clone --quiet "$REPO_URL" "$WORK/implementer"
   git -C "$WORK/implementer" switch -c "$BRANCH" origin/main
   git -C "$WORK/implementer" rev-parse HEAD          # this is <base>
   cd "$WORK/implementer" && npm ci
   cd "$WORK/implementer" && npx playwright install chromium   # see Environment notes
   ```
   Then run the **gate** once on `<base>`, before changing anything:
   `node --test`, `npm run vendor:check` and `npx playwright test`, all from
   `$WORK/implementer`. All three must exit 0. If `<base>` is already red, no update
   can be judged: stop with `RESULT: error` and the failing output.
2. For each entry of `plan.npm`, one package at a time, in order:
   1. Run its `install` command exactly (it keeps the `package.json` pin style:
      `--save-exact` for exact pins).
   2. If the entry has `vendored: true`, run `npm run vendor`. A non-zero exit
      (a file the site loads is missing) means the update needs code changes.
   3. Run the gate again. All three commands must exit 0.
   4. Gate green: commit `package.json`, `package-lock.json` and any changed files in
      `assets/vendor/` and `assets/fonts/`, with the message format below.
      Gate red, or step 2 failed: discard this package with
      `git -C "$WORK/implementer" reset --hard HEAD && npm --prefix "$WORK/implementer" ci`,
      record it as skipped with the failing command and the end of its output, and
      continue with the next entry. Never edit code or tests to make it pass.
   5. `@playwright/test` only: if its new version's browser can't be installed here
      (`npx playwright install chromium` fails and the tests report a missing
      executable), skip it as "browser download blocked in this environment".
3. If `plan.npmAuditFix` is `true`: run `npm audit fix` (never `--force`), apply the
   same gate, and commit as `deps: npm audit fix (transitive)`, listing each changed
   package `old → new` from the `package-lock.json` diff.
4. For each entry of `plan.actions`: in every file under `.github/workflows/`,
   replace `uses: <action>@<from>` with `uses: <action>@<to>`, and change nothing
   else. Read the release notes between the two versions (`gh release list -R
   <action>` or the repository's releases page). If they describe a breaking change to
   an input our workflows set (`node-version`, `cache`, the upload `with:` keys) or to
   how `actions/checkout` stores credentials for `git push`, skip that bump. If you
   couldn't read them, apply the bump and say "release notes not read" in
   `implementer.md`. Commit all action bumps together as `ci: ...`.
5. Run the allowed-paths check against `<base>`. It must print nothing. Then
   `git log --format='%h %s' <base>..HEAD` lists the branch's commits.
6. Write `$HANDOFF/implementer.md`. First line: `RESULT: ready` (at least one
   commit), `RESULT: nothing-applied` (everything skipped, so the run ends) or
   `RESULT: error`. Then `<base>`, the branch head (`git rev-parse HEAD`), every
   change applied `old → new`, every advisory fixed, and every skipped item with its
   reason. The branch stays local; nothing is pushed.

Commit message format (one commit per npm package, one for all action bumps):

```
deps: maplibre-gl 5.23.0 → 5.24.0

- maplibre-gl 5.23.0 → 5.24.0 (minor); vendored files refreshed with npm run vendor:
  assets/vendor/maplibre-gl.js, assets/vendor/maplibre-gl.css
- Advisories fixed: GHSA-xxxx-xxxx-xxxx (high) <title>   (or: none)

Maint-Run: 2026-11-05
```

Done when every `plan.npm` and `plan.actions` entry is either committed or listed as
skipped with a reason, the allowed-paths check prints nothing, and `implementer.md`
exists.

## Tester

Input: `implementer.md` with `RESULT: ready`. Anything else: stop. The Tester works
independently: it uses its own clone and install, and it re-runs every check itself
instead of trusting the Implementer's results.

1. Clone the branch from the Implementer's clone and confirm it is the commit
   `implementer.md` names:
   ```sh
   . "$HOME/deponii-maint-runs/env.sh"
   git clone --quiet --branch "$BRANCH" "$WORK/implementer" "$WORK/tester"
   git -C "$WORK/tester" rev-parse HEAD          # must equal the head in implementer.md
   cd "$WORK/tester" && npm ci
   ```
2. Run each command from `$WORK/tester`, in order, even after a failure. Save the
   output to `$HANDOFF/tester-<n>.log` and record the exit code:
   1. `node --test`
   2. `npm run vendor:check`
   3. `npx playwright install chromium`. This may fail where browser downloads are
      blocked and a browser is preinstalled (`PLAYWRIGHT_BROWSERS_PATH`). That is fine
      only if step 4 then runs.
   4. `npx playwright test`. This runs the desktop and phone projects. If
      `playwright.config.mjs` is missing, or a browser executable is missing, the site
      wasn't verified, and that counts as a failure.
   5. `npm audit --audit-level=high --omit=dev`
   6. The allowed-paths check against `<base>` from `implementer.md` (must print
      nothing).
3. Confirm the e2e run loaded the site and the map drew its markers. The step 4 log
   must show passed tests whose titles mention markers, in both the `desktop` and
   `phone` projects (now `danger colours on the map › each marker uses its site's
   severity colour…` and `site details › clicking a marker on the map opens that
   site`), and its summary must report 0 failed and 0 flaky.
4. Write `$HANDOFF/tester.md`. First line: `RESULT: pass` only if every command
   exited 0 and step 3 holds. Otherwise `RESULT: fail`. Then the tested commit,
   and for each command its exit code and the last lines of its output (the
   evidence). Any failure rejects the whole day's update. Nothing is released.

Done when `tester.md` names the tested commit and has an exit code for each of the
six commands.

## Releaser

Input: `tester.md` with `RESULT: pass`, whose tested commit equals the head in
`implementer.md`. Anything else: stop.

1. Fresh clone, fetch the tested branch, and confirm it is the tested commit:
   ```sh
   . "$HOME/deponii-maint-runs/env.sh"
   git clone --quiet "$REPO_URL" "$WORK/releaser"
   git -C "$WORK/releaser" fetch --quiet "$WORK/implementer" "$BRANCH:$BRANCH"
   git -C "$WORK/releaser" rev-parse "$BRANCH"     # must equal the tested commit
   ```
2. Catch up with `main`. Bot commits ("Data check …") may have landed since `<base>`:
   ```sh
   git -C "$WORK/releaser" fetch origin
   git -C "$WORK/releaser" diff --name-only <base> origin/main | grep -v '^data/' || true
   ```
   Any output means `main` gained non-data changes the Tester didn't test. Stop
   with `RESULT: not-released`; tomorrow's run starts fresh.
3. Rebase and re-test:
   ```sh
   git -C "$WORK/releaser" switch "$BRANCH"
   git -C "$WORK/releaser" rebase origin/main
   cd "$WORK/releaser" && npm ci && node --test && npm run vendor:check
   ```
   On a conflict, run `git rebase --abort` and stop with `RESULT: not-released`.
   Re-run the allowed-paths check against `origin/main`.
4. Fast-forward and push. `switch -C` points the local `main` at the `origin/main`
   just fetched (local only), so the merge is a pure fast-forward:
   ```sh
   git -C "$WORK/releaser" rev-parse origin/main                 # <previous>
   git -C "$WORK/releaser" switch -C main origin/main
   git -C "$WORK/releaser" merge --ff-only "$BRANCH"
   git -C "$WORK/releaser" push origin main
   git -C "$WORK/releaser" rev-parse HEAD                        # <released>
   ```
   If the push is rejected because `main` moved, go back to step 2. Give up with
   `RESULT: not-released` after three attempts. Never force.
5. Wait for the three runs of `<released>`: "CI", "Update data" (its push run only
   runs the tests) and "pages-build-deployment". Run this loop as a background
   command or with your harness's wait tool, never as a long foreground `sleep`. It
   gives up after 30 minutes:
   ```sh
   . "$HOME/deponii-maint-runs/env.sh"; SHA=<released>
   for i in $(seq 60); do
     gh run list --commit "$SHA" --json workflowName,status \
       --jq '[.[] | select(.workflowName == "CI" or .workflowName == "Update data" or .workflowName == "pages-build-deployment") | select(.status == "completed")] | unique_by(.workflowName) | length' | grep -qx 3 && break
     sleep 30
   done
   gh run list --commit "$SHA" --json workflowName,status,conclusion,url,databaseId
   gh run view <CI databaseId> --json jobs --jq '.jobs[] | [.name, .conclusion] | @tsv'
   ```
   Pages builds only the newest commit, so a later data commit can supersede the
   `pages-build-deployment` run for `<released>`. In that case, use the newest Pages
   run whose commit contains `<released>`
   (`git merge-base --is-ancestor <released> <that commit>`). A run still missing
   after 30 minutes counts as a failure.
6. Judge the runs. CI's "Tests" job, the "Update data" run and
   `pages-build-deployment` must all conclude `success`. CI's "Audit production
   dependencies" job must succeed too, with one exception. If only that job failed,
   run `npm audit --audit-level=high --omit=dev` on `<previous>` (in a scratch clone).
   If that fails as well, the advisory was published after the Tester ran and the
   release didn't cause it: keep the release and flag the advisory in the report.
   Any other failure: revert the release with new commits, then push:
   ```sh
   git -C "$WORK/releaser" fetch origin && git -C "$WORK/releaser" merge --ff-only origin/main
   git -C "$WORK/releaser" revert --no-commit <previous>..<released>
   git -C "$WORK/releaser" commit -m "Revert maintenance $DATE: <failed run and reason>" -m "Maint-Run: $DATE"
   git -C "$WORK/releaser" push origin main
   ```
   The release was a fast-forward, so there is no merge commit. Reverting the range
   `<previous>..<released>` undoes exactly the routine's commits and leaves data
   commits alone. If the revert push is rejected, run `git pull --rebase origin main`
   and push again. `RESULT: reverted`.
7. After a successful release, delete the branch everywhere it exists:
   ```sh
   git -C "$WORK/releaser" branch -D "$BRANCH"; git -C "$WORK/implementer" switch --detach && git -C "$WORK/implementer" branch -D "$BRANCH"
   git -C "$WORK/releaser" ls-remote --exit-code --heads origin "$BRANCH" && git -C "$WORK/releaser" push origin --delete "$BRANCH"
   ```
   For any other outcome, leave the local clones in `$WORK` for inspection. Nothing
   of theirs was pushed.
8. Write `$HANDOFF/releaser.md`. First line: `RESULT: released`, `not-released` or
   `reverted`. Then `<previous>`, `<released>`, each run's conclusion and URL, and,
   if a workflow file changed, the note "watch the next scheduled Update data run
   (04:17 UTC); push runs don't exercise its data steps."

Done when `releaser.md` exists and, for `released` or `reverted`, every run in step 5
has a conclusion.

## Run report

The orchestrator writes `$HANDOFF/report.md` from the handoff files and gives it as
the run's final answer. It uses these headings, with every section filled ("none" is
a valid answer):

```
# Deponii maintenance <DATE>
Outcome: released <sha> | nothing to do | blocked: needs a person | already done today | rejected by Tester | not released: <reason> | released, then reverted | error: <role and step>

## Checked
origin/main <sha>; security status <status>; decision <decision>
npm audit: prod <counts>, dev <counts>
Outdated: <name current → latest (kind)> …
Vendored files: <ok | drift>
GitHub Actions: <action ref → latest, or "couldn't check">

## Updated
- <package or action> <old> → <new> (<kind>)        (or: none)

## Advisories fixed
- <GHSA id> (<severity>) <package>: <title>           (or: none)

## Skipped / needs a person
- <item>: <reason>                                     (plan.skipped, plan.unfixed, Implementer skips)

## Tests
<each Tester command: pass/fail, exit code>; e2e projects run; marker tests

## Main
<released commit and the CI / Update data / pages-build-deployment conclusions with URLs>
(or: nothing pushed, because <reason>)
```

## Environment notes

- **GitHub API through the sandbox proxy.** `gh api` works for this repository but is
  blocked (HTTP 403) for other repositories such as `actions/checkout`. The security
  check then reads release tags with `git ls-remote` and records
  `"source": "git tags"`. If both fail, it reports "couldn't check" for that action,
  and that alone is no reason to stop.
- **Playwright browsers.** Browser downloads may be blocked. A preinstalled browser in
  `PLAYWRIGHT_BROWSERS_PATH` works only for the Playwright version it was installed
  for. This is why a `@playwright/test` bump can be "skipped: browser download
  blocked" (Implementer), and why a missing executable fails the Tester. GitHub
  Actions installs the browser itself (`npx playwright install --with-deps chromium`).
- **`npm run security` prints an npm banner on stdout.** Use `--out <file>` for a
  clean JSON file. The file must be outside the repository: the check refuses to write
  inside it.
- **Scripts.** `npm run security` (read-only check), `npm run vendor` (copy vendored
  files from `node_modules`), `npm run vendor:check` (fail on any difference). Their
  header comments describe their output and exit codes.
