# Portable Project Setup Guide

This document is the copy-forward guide for setting up Documentation Governor in any current or future project. Point an agent at this file when you want a repo to enforce the same process used by SoLoQR:

- documentation changes stay in the same change set as implementation
- a new machine verifies the Documentation Governor plugin before work starts
- a missing skill or plugin causes an immediate user-facing alert
- `docs:check` fails when governed code changed but docs/catalog/status were not refreshed
- untracked files are included in the governed change check
- a local pre-commit hook runs `docs:check` before commits
- `docs:watch` is available for active implementation sessions so saved file changes trigger the same documentation guard locally

The setup below assumes a project uses Node package scripts, but the same files can be adapted to any repo with a shell command runner.

## Core Principle

Do not rely on agent memory. Each governed project must contain its own repo-local guardrails:

1. `./.documentation-governor.json` defines the code, docs, inventory, and status files for that repo.
2. A repo-local wrapper script locates the installed plugin on each machine.
3. Package scripts expose consistent commands such as `docs:governor:bootstrap`, `docs:governor:refresh`, and `docs:check`.
4. A repo-local pre-commit hook installer wires `docs:check` into the commit path.
5. A repo-local watcher reruns `docs:check` after saved file changes during active implementation.
6. Agent instructions require the `documentation-governor` skill and tell agents to alert the user if the skill/plugin is unavailable.
7. A human-readable failsafe doc explains the workflow and failure modes.
8. CI, if available, runs the same `docs:check` command.

## Machine Requirement

Every Codex machine that works on governed repos must have this plugin installed.

From the root of the Documentation Governor plugin repository:

```bash
node ./scripts/install-home-local.mjs
```

Restart Codex after installation so the `documentation-governor` skill is available.

The repo-local wrapper below searches common install paths:

- `DOCUMENTATION_GOVERNOR_SCRIPT=/absolute/path/to/scripts/docs-governor.mjs`
- `DOCUMENTATION_GOVERNOR_HOME=/absolute/path/to/documentation-governor`
- `~/plugins/documentation-governor/scripts/docs-governor.mjs`
- `$CODEX_HOME/plugins/cache/local-plugins/documentation-governor/*/scripts/docs-governor.mjs`
- `~/.codex/plugins/cache/local-plugins/documentation-governor/*/scripts/docs-governor.mjs`
- `./.agents/plugins/documentation-governor/scripts/docs-governor.mjs`

If none are found, the wrapper exits with a loud message telling the agent to alert the user immediately.

## Files To Add To Each Governed Repo

Add or update these files in the target project:

```text
.documentation-governor.json
AGENTS.md
package.json
scripts/documentation-governor.js
scripts/check-docs.js
scripts/install-docs-hook.js
scripts/watch-docs.js
docs/maintenance/documentation-failsafe.md
docs/maintenance/project-catalog.json
docs/maintenance/documentation-governor-status.json
```

If the repo already has equivalents, adapt them instead of creating duplicates.

## 1. Add `.documentation-governor.json`

Start with this and tailor the globs to the repo:

```json
{
  "baseRef": "origin/main",
  "catalogFile": "docs/maintenance/project-catalog.json",
  "statusFile": "docs/maintenance/documentation-governor-status.json",
  "projectDiscovery": [
    {
      "label": "Applications",
      "root": "apps",
      "excludeNames": []
    },
    {
      "label": "Packages",
      "root": "packages",
      "excludeNames": []
    },
    {
      "label": "Services",
      "root": "services",
      "excludeNames": []
    }
  ],
  "codeGlobs": [
    "apps/**",
    "packages/**",
    "services/**",
    "scripts/**",
    "supabase/**",
    "migrations/**",
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.base.json",
    ".env.example"
  ],
  "docGlobs": [
    "README.md",
    "AGENTS.md",
    ".documentation-governor.json",
    "docs/**"
  ],
  "ignoreGlobs": [
    "node_modules/**",
    ".git/**",
    ".next/**",
    ".turbo/**",
    "coverage/**",
    "dist/**",
    "build/**"
  ],
  "requireDocFileChange": true
}
```

Notes:

- Use `origin/main` for normal CI. A local-only repo can use `HEAD`, but that is weaker.
- Keep `catalogFile` and `statusFile` inside the docs tree.
- Include all files where implementation, config, schema, public behavior, environment, or deployment changes can happen.
- Include `AGENTS.md` and the governor config in `docGlobs` so instruction/config updates count as human documentation.
- If a repo has no `apps`, `packages`, or `services`, remove or replace those discovery roots.

## 2. Add `scripts/documentation-governor.js`

This wrapper makes the setup portable across machines. Copy this file into the target repo at `scripts/documentation-governor.js`.

```js
#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = process.cwd();
const configFile = ".documentation-governor.json";
const configPath = path.join(root, configFile);

main();

function main() {
  const [command = "help", ...args] = process.argv.slice(2).filter((argument) => argument !== "--");

  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  assertConfig();

  const governorScript = resolveGovernorScript();

  if (command === "where") {
    console.log(governorScript);
    return;
  }

  if (command === "bootstrap") {
    runGovernor(governorScript, ["write-catalog", ...withConfig(args)]);
    runGovernorCheck(governorScript, args);
    return;
  }

  if (command === "catalog") {
    runGovernor(governorScript, ["write-catalog", ...withConfig(args)]);
    return;
  }

  if (command === "check" || command === "doctor") {
    runGovernorCheck(governorScript, args);
    return;
  }

  if (command === "stamp") {
    requireNote(args, command);
    runGovernor(governorScript, ["write-stamp", ...withConfig(args)]);
    return;
  }

  if (command === "refresh") {
    requireNote(args, command);
    runGovernor(governorScript, ["write-catalog", ...withConfig(args)]);
    runGovernor(governorScript, ["write-stamp", ...withConfig(args)]);
    runGovernorCheck(governorScript, args);
    return;
  }

  fail(`Unknown documentation-governor command: ${command}`);
}

function assertConfig() {
  if (!fs.existsSync(configPath)) {
    fail(`Missing ${configFile}. Documentation governance cannot run for this repository.`);
  }
}

function withConfig(args) {
  if (args.includes("--config")) {
    return args;
  }

  return ["--config", `./${configFile}`, ...args];
}

function requireNote(args, command) {
  const noteIndex = args.indexOf("--note");
  const hasNote = noteIndex >= 0 && args[noteIndex + 1] && !args[noteIndex + 1].startsWith("--");

  if (!hasNote) {
    fail(`docs:governor:${command} requires --note "Describe the documentation refresh".`);
  }
}

function runGovernor(governorScript, args) {
  const result = spawnSync(process.execPath, [governorScript, ...args], {
    cwd: root,
    stdio: "inherit"
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runGovernorCheck(governorScript, args) {
  const checkArgs = withConfig(args);

  if (checkArgs.includes("--files") || checkArgs.includes("--files-file")) {
    runGovernor(governorScript, ["check", ...checkArgs]);
    return;
  }

  const changedFiles = collectChangedFiles();
  const changedFilesPath = path.join(
    os.tmpdir(),
    `documentation-governor-${process.pid}.txt`
  );

  fs.writeFileSync(changedFilesPath, changedFiles.length > 0 ? `${changedFiles.join("\n")}\n` : "");

  try {
    runGovernor(governorScript, [
      "check",
      ...checkArgs,
      "--files-file",
      changedFilesPath
    ]);
  } finally {
    fs.rmSync(changedFilesPath, { force: true });
  }
}

function collectChangedFiles() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const diffRange = determineDiffRange(config.baseRef);
  const outputs = [
    diffRange ? runGit(["diff", "--name-only", "--diff-filter=ACMR", diffRange]) : "",
    runGit(["diff", "--name-only", "--diff-filter=ACMR"]),
    runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]),
    runGit(["ls-files", "--others", "--exclude-standard"])
  ];

  return unique(
    outputs
      .flatMap((output) => output.split(/\r?\n/))
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  ).sort((left, right) => left.localeCompare(right));
}

function determineDiffRange(baseRef) {
  if (baseRef) {
    const mergeBase = runGit(["merge-base", baseRef, "HEAD"]);
    if (mergeBase) {
      return `${mergeBase}...HEAD`;
    }
  }

  const parent = runGit(["rev-parse", "HEAD~1"]);
  if (parent) {
    return `${parent}...HEAD`;
  }

  return "";
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function resolveGovernorScript() {
  const candidates = collectGovernorCandidates();
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (match) {
    return match;
  }

  console.error("Documentation Governor plugin is required for this repository.");
  console.error("");
  console.error("I could not find scripts/docs-governor.mjs in the installed Codex plugin paths.");
  console.error("Alert the user immediately before continuing documentation-governed work.");
  console.error("");
  console.error("Install the Documentation Governor plugin, or set one of these environment variables:");
  console.error("- DOCUMENTATION_GOVERNOR_SCRIPT=/absolute/path/to/scripts/docs-governor.mjs");
  console.error("- DOCUMENTATION_GOVERNOR_HOME=/absolute/path/to/documentation-governor");
  console.error("");
  console.error("Searched:");
  for (const candidate of candidates) {
    console.error(`- ${candidate}`);
  }

  process.exit(1);
}

function collectGovernorCandidates() {
  const candidates = [];
  const home = os.homedir();
  const codexHomes = unique(
    [process.env.CODEX_HOME, home ? path.join(home, ".codex") : ""].filter(Boolean)
  );

  addFileCandidate(candidates, process.env.DOCUMENTATION_GOVERNOR_SCRIPT);

  if (process.env.DOCUMENTATION_GOVERNOR_HOME) {
    addFileCandidate(
      candidates,
      path.join(process.env.DOCUMENTATION_GOVERNOR_HOME, "scripts", "docs-governor.mjs")
    );
  }

  if (home) {
    addFileCandidate(
      candidates,
      path.join(home, "plugins", "documentation-governor", "scripts", "docs-governor.mjs")
    );
  }

  for (const codexHome of codexHomes) {
    addVersionedPluginCandidates(
      candidates,
      path.join(codexHome, "plugins", "cache", "local-plugins", "documentation-governor")
    );
    addVersionedPluginCandidates(
      candidates,
      path.join(codexHome, "plugins", "cache", "documentation-governor")
    );
  }

  addFileCandidate(
    candidates,
    path.join(root, ".agents", "plugins", "documentation-governor", "scripts", "docs-governor.mjs")
  );

  return unique(candidates);
}

function addVersionedPluginCandidates(candidates, pluginRoot) {
  addFileCandidate(candidates, path.join(pluginRoot, "scripts", "docs-governor.mjs"));

  if (!fs.existsSync(pluginRoot)) {
    return;
  }

  const versions = fs
    .readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

  for (const version of versions) {
    addFileCandidate(
      candidates,
      path.join(pluginRoot, version, "scripts", "docs-governor.mjs")
    );
  }
}

function addFileCandidate(candidates, candidate) {
  if (candidate) {
    candidates.push(path.resolve(candidate));
  }
}

function unique(values) {
  return [...new Set(values)];
}

function printUsage() {
  console.log("Usage:");
  console.log("  pnpm docs:governor:bootstrap");
  console.log("  pnpm docs:governor:check");
  console.log("  pnpm docs:governor:catalog");
  console.log("  pnpm docs:governor:stamp -- --note \"Describe the documentation refresh\"");
  console.log("  pnpm docs:governor:refresh -- --note \"Describe the documentation refresh\"");
  console.log("  pnpm docs:governor where");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
```

## 3. Add Package Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "prepare": "node scripts/install-docs-hook.js",
    "docs:hook:install": "node scripts/install-docs-hook.js",
    "docs:watch": "node scripts/watch-docs.js",
    "docs:governor": "node scripts/documentation-governor.js",
    "docs:governor:bootstrap": "node scripts/documentation-governor.js bootstrap",
    "docs:governor:catalog": "node scripts/documentation-governor.js catalog",
    "docs:governor:check": "node scripts/documentation-governor.js check",
    "docs:governor:stamp": "node scripts/documentation-governor.js stamp",
    "docs:governor:refresh": "node scripts/documentation-governor.js refresh",
    "docs:check": "node scripts/check-docs.js"
  }
}
```

If the project already has `docs:check`, keep the existing checks and call `node scripts/documentation-governor.js check` as the final step. If the project already uses `prepare`, merge `node scripts/install-docs-hook.js` into the existing lifecycle script instead of replacing unrelated setup.

## 4. Add Or Update `scripts/check-docs.js`

For a new project without a docs check, copy `templates/project-scripts/check-docs.js` into the target repo or use this minimal version:

```js
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = process.cwd();
const governorScript = path.join(root, "scripts", "documentation-governor.js");
const result = spawnSync(process.execPath, [governorScript, "check"], {
  cwd: root,
  stdio: "inherit"
});

if (result.error) {
  console.error(`Documentation Governor failed to start: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
```

For a project with an existing docs/config drift check, run the existing check first and then add this final step:

```js
function runDocumentationGovernor() {
  const governorScript = path.join(process.cwd(), "scripts", "documentation-governor.js");
  const result = spawnSync(process.execPath, [governorScript, "check"], {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`Documentation Governor failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
```

Call `runDocumentationGovernor()` only after the existing drift checks pass.

## 5. Add Or Update `scripts/install-docs-hook.js`

Every governed project must have a local hook installer. Copy or adapt `templates/project-scripts/install-docs-hook.js` from this plugin repo into the target repo at `scripts/install-docs-hook.js`.

The installer writes `.git/hooks/pre-commit` and adds a guarded block that runs the repo's `docs:check` command. It is intentionally local to each checkout because Git hooks are not committed. The package `prepare` script should call the installer so the hook is restored after dependency installation, and setup docs must also tell agents to run `pnpm docs:hook:install` or the equivalent package-manager command on a fresh clone.

Emergency bypass is available with:

```bash
DOCUMENTATION_GOVERNOR_SKIP_HOOK=1 git commit ...
```

Only use that bypass when the user explicitly accepts the risk, then refresh documentation immediately afterward.

## 6. Add Or Update `scripts/watch-docs.js`

Every governed project must expose an active-session watcher. Copy or adapt `templates/project-scripts/watch-docs.js` from this plugin repo into the target repo at `scripts/watch-docs.js`.

`docs:watch` reruns `docs:check` after saved file changes. It does not replace the final `docs:check`, the pre-commit hook, or CI. It exists to catch drift while work is still in progress, especially during multi-file implementation sessions.

## 7. Add Agent Instructions

Add this block to the root `AGENTS.md`. If the project already has docs rules, merge this into them.

````md
## Documentation Failsafe

Documentation must stay in the same change set as implementation.

Use the `documentation-governor` skill before finalizing any task that:

- Requests documentation, architecture explanation, setup guidance, or launch guidance.
- Changes auth, billing, subscriptions, entitlements, payload behavior, redirect behavior, analytics, deployment, environment variables, database schema, user flows, pricing, or public product behavior.
- Changes production domains, callback URLs, webhook URLs, provider setup, app-store/payment behavior, or other externally visible integration behavior.

If the `documentation-governor` skill or plugin is not available on the current machine, immediately alert the user before continuing documentation-governed work. Do not silently fall back to memory or skip the process.

On a new machine or a fresh clone, run `pnpm docs:governor:bootstrap` and `pnpm docs:hook:install` before implementation work. This locates the installed Documentation Governor plugin, synchronizes the project catalog, checks the current governed status, and installs the local pre-commit documentation guard. If the plugin is installed in a nonstandard location, set `DOCUMENTATION_GOVERNOR_SCRIPT` to the absolute `scripts/docs-governor.mjs` path or `DOCUMENTATION_GOVERNOR_HOME` to the plugin root.

During implementation sessions, run `pnpm docs:watch` in a spare terminal. It reruns the documentation guard after saved file changes and keeps drift visible while work is still in progress. If a watcher cannot stay open, run `pnpm docs:check` immediately after edits and before final handoff.

For implementation work, do a documentation impact check before the final response:

1. Identify whether the change affects docs.
2. Update the relevant docs in the same turn when it does.
3. Run `pnpm docs:governor:refresh -- --note "Describe the documentation refresh"` after governed code and human-readable docs change.
4. Run `pnpm docs:check` after code, docs, config, provider, permission, asset, or build-script changes.
5. Run the relevant typecheck/test command for any code touched.
6. In the final response, list docs updated or explicitly say why docs were not needed.

Never write real secrets, tokens, private keys, webhook signing secrets, or provider credentials into docs, tracked env files, examples, commits, or final responses.
````

## 8. Add Human-Readable Failsafe Docs

Create `docs/maintenance/documentation-failsafe.md`:

````md
# Documentation Failsafe

Documentation is part of the feature, not follow-up work.

## Rule

Any change that affects user-visible behavior, operational setup, production URLs, data shape, auth, billing, redirects, analytics, deployment, or environment variables must update documentation in the same change set.

Agents must use the `documentation-governor` skill for documentation requests and for implementation work that changes documented product or architecture behavior. If that skill or the Documentation Governor plugin is unavailable on the current machine, the agent must alert the user immediately before continuing governed work.

## Pre-Final Checklist

Before a task is called complete:

1. Run a documentation impact check.
2. Update docs or record why no docs were needed.
3. Run `pnpm docs:governor:refresh -- --note "Describe the documentation refresh"` after governed code and human-readable docs change.
4. Run `pnpm docs:check`.
5. Run relevant code verification for touched packages.
6. Summarize changed docs and remaining documentation risks in the final response.

## Automated Local Guards

`pnpm docs:check` is the primary local guard. Run project-specific stale-reference or docs/config drift scans first, then run Documentation Governor through `scripts/documentation-governor.js`.

`pnpm docs:hook:install` installs a local Git pre-commit hook that runs `pnpm docs:check` before commits. The hook is also installed by the package `prepare` lifecycle when dependencies are installed in a Git checkout. This cannot rewrite docs automatically, but it prevents local commits from moving forward when docs drift is detected.

`pnpm docs:watch` is the active-editing guard. It watches repo files and reruns `pnpm docs:check` after saved changes, so documentation drift is visible before the commit boundary.

Use `DOCUMENTATION_GOVERNOR_SKIP_HOOK=1 git commit ...` only for emergency local commits, and follow up with a documentation refresh immediately.

## Documentation Governor

Documentation Governor is initialized for this repo through `.documentation-governor.json`.

Governed artifacts:

- `docs/maintenance/project-catalog.json` records discovered projects.
- `docs/maintenance/documentation-governor-status.json` records the latest governed documentation refresh stamp.

On a new machine or fresh clone, run:

```bash
pnpm docs:governor:bootstrap
pnpm docs:hook:install
```

The wrapper locates `scripts/docs-governor.mjs` from the installed Documentation Governor plugin. If the plugin is missing, the wrapper fails with an explicit alert instead of letting the docs workflow silently pass. During implementation sessions, run `pnpm docs:watch` in a separate terminal, or run `pnpm docs:check` immediately after edits when a watcher cannot stay open.

When implementation changes governed code, update human-readable docs, then run:

```bash
pnpm docs:governor:refresh -- --note "Describe the documentation refresh"
pnpm docs:check
```

Do not satisfy the governor by stamping only. Human-readable docs must change when governed code behavior changes.
````

Add this file to the repo README or handoff docs so future sessions can find it quickly.

## 9. Bootstrap The Repo

After the files above are added:

```bash
pnpm docs:governor where
pnpm docs:governor:bootstrap
pnpm docs:hook:install
```

If `where` or `bootstrap` cannot find the plugin, install the plugin on that machine or set:

```bash
export DOCUMENTATION_GOVERNOR_SCRIPT=/absolute/path/to/scripts/docs-governor.mjs
```

or:

```bash
export DOCUMENTATION_GOVERNOR_HOME=/absolute/path/to/documentation-governor
```

Then run:

```bash
pnpm docs:governor:refresh -- --note "Initialized Documentation Governor."
pnpm docs:check
```

Commit these generated artifacts:

- `docs/maintenance/project-catalog.json`
- `docs/maintenance/documentation-governor-status.json`

## 10. Normal Development Workflow

For every implementation task:

1. Before work on a new machine, run `pnpm docs:governor:bootstrap` and `pnpm docs:hook:install`.
2. Run `pnpm docs:watch` during active implementation sessions. If a watcher cannot stay open, run `pnpm docs:check` immediately after edits and before final handoff.
3. Make the implementation change.
4. Decide whether docs are impacted.
5. Update the relevant human-readable docs when they are impacted.
6. Run `pnpm docs:governor:refresh -- --note "Short note about the docs refresh"`.
7. Run `pnpm docs:check`.
8. Run targeted code verification.
9. In the final response, list docs updated or say docs were not needed.

Do not run `docs:governor:refresh` as a substitute for real documentation. If governed code behavior changed, update human-readable docs first.

Do not treat the watcher as a substitute for `docs:check`; it is a fast feedback loop. `docs:check` remains the required final gate and the pre-commit hook remains the required local commit gate.

## 11. CI Wiring

Use the same repo command in CI. A GitHub Actions pattern:

```yaml
name: Documentation

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 10.17.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Documentation Governor
        run: |
          git clone "${DOCUMENTATION_GOVERNOR_REPO}" /tmp/documentation-governor
          node /tmp/documentation-governor/scripts/install-home-local.mjs --force
        env:
          DOCUMENTATION_GOVERNOR_REPO: ${{ vars.DOCUMENTATION_GOVERNOR_REPO }}

      - name: Check docs
        run: pnpm docs:check
```

If CI should not install home-local plugins, set:

```yaml
env:
  DOCUMENTATION_GOVERNOR_SCRIPT: /tmp/documentation-governor/scripts/docs-governor.mjs
```

and clone the plugin before `pnpm docs:check`.

## 12. Failure Triage

Use this quick map:

| Failure | Meaning | Fix |
| --- | --- | --- |
| Plugin not found | Machine is not ready for governed work | Install plugin, restart Codex, or set `DOCUMENTATION_GOVERNOR_SCRIPT` / `DOCUMENTATION_GOVERNOR_HOME`; alert the user immediately |
| Catalog file is missing | Bootstrap was not run | Run `pnpm docs:governor:bootstrap` |
| Pre-commit hook is missing | Fresh clone, old checkout, or lifecycle script was not run | Run `pnpm docs:hook:install`; keep `prepare` wired to the hook installer |
| `docs:watch` command is missing | Project is missing active local docs feedback | Add `scripts/watch-docs.js` and the `docs:watch` package script |
| Catalog is missing a project | New app/package/service was added | Update docs to mention the new project, then run `pnpm docs:governor:refresh -- --note "..."` |
| Governed code changed but no human-readable documentation file changed | Code/config changed without docs | Update the relevant docs, then refresh |
| Governed code changed but status file was not updated | Docs may be updated but the refresh was not stamped | Run `pnpm docs:governor:refresh -- --note "..."` |
| `pnpm docs:check` passes stale-pattern scan but governor fails | Narrow local docs scan is fine, but governance artifacts are stale | Follow the governor failure message |

## 13. What To Tell Future Agents

When assigning a new repo setup task, use a prompt like this:

```text
Use the Documentation Governor plugin and read PORTABLE_PROJECT_SETUP.md from the plugin root. Set this repo up with the portable Documentation Governor workflow:

- add .documentation-governor.json tailored to this repo
- add scripts/documentation-governor.js
- add scripts/check-docs.js
- add scripts/install-docs-hook.js
- add scripts/watch-docs.js
- wire package scripts for docs:governor:*, docs:hook:install, docs:watch, and docs:check
- wire the package prepare lifecycle to install the docs hook when this repo supports lifecycle scripts
- add AGENTS.md documentation-failsafe rules
- add docs/maintenance/documentation-failsafe.md
- run pnpm docs:governor:bootstrap
- run pnpm docs:hook:install
- update human-readable docs if needed
- run pnpm docs:governor:refresh -- --note "Initialized Documentation Governor."
- run pnpm docs:check

If the documentation-governor skill or plugin is not available, alert me immediately and stop before doing governed implementation work.
```

## 14. Hard Rules

- Do not skip the plugin check on a new machine.
- Do not skip local hook installation in a governed Git checkout.
- Do not silently continue if the skill or plugin is missing.
- Do not rely on hard-coded machine paths in project docs or scripts.
- Do not satisfy the governor by changing only the status stamp.
- Do not commit secrets, tokens, keys, webhook signing secrets, provider credentials, or machine-local auth material.
- Do not ignore untracked files during checks. The wrapper includes them on purpose.
- Do not omit `docs:watch` from new governed projects; it is the required active-session feedback loop.
- Do not treat `docs:check` as a prose-quality guarantee. It enforces process. Humans and agents must still write accurate documentation.
