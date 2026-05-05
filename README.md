# Documentation Governor

`documentation-governor` is a standalone Codex plugin repository for keeping project documentation synchronized with code changes and project inventory changes.

GitHub repository: [solovision24/documentation-governor](https://github.com/solovision24/documentation-governor)

It provides four things:

- A Codex skill for documentation refresh work.
- A deterministic governance script that CI can enforce.
- Templates and install tooling so the same process can be reused on multiple machines.
- Repo-local hook and watcher templates so future projects get active local documentation checks, not just a final CI gate.

## What it enforces

The plugin is designed around an explicit process rather than agent memory:

1. Discover the current project folders that should be documented.
2. Update human-readable docs after code changes.
3. Regenerate the project catalog when new projects appear.
4. Update a documentation status stamp.
5. Run project-specific stale-reference checks before the governor, when a repo needs them.
6. Install a local pre-commit hook that blocks commits when `docs:check` fails.
7. Provide a local watcher that reruns `docs:check` after saved file changes during active implementation.
8. Fail CI if code changed but docs, catalog, or stamp were not refreshed.

That gives you a consistent workflow across machines, immediate local feedback while editing, a commit gate inside each checkout, and a hard merge gate inside CI.

## Files

- `skills/documentation-governor/SKILL.md`: Codex workflow for documentation refreshes.
- `scripts/docs-governor.mjs`: Catalog, status stamp, and CI enforcement logic.
- `scripts/install-home-local.mjs`: Copies the plugin into your home-local Codex plugins directory and updates the local marketplace file.
- `schemas/documentation-governor.schema.json`: JSON schema for repo config files.
- `templates/repo.documentation-governor.example.json`: Example repo config.
- `templates/project-scripts/`: Repo-local scripts future projects should copy or adapt for `docs:check`, hook installation, and active docs watching.

## Repository contents

This repo is the source of truth for the plugin itself. Project repos should not copy the plugin source into their own trees. Instead, each project repo should:

- install the plugin home-local on each Codex machine
- keep a repo-local `./.documentation-governor.json`
- keep repo-local governance artifacts under `docs/maintenance/`
- keep repo-local scripts for the portable wrapper, `docs:check`, pre-commit hook installation, and `docs:watch`
- wire package scripts so `docs:check`, `docs:hook:install`, and `docs:watch` exist in every governed project
- wire CI to install this repo and run the docs check

## Install on a Codex machine

From the root of this repo:

```bash
node ./scripts/install-home-local.mjs
```

That copies the plugin to `~/plugins/documentation-governor`, updates `~/.agents/plugins/marketplace.json`, and enables the plugin in `~/.codex/config.toml`.

After installing, restart Codex to pick up the plugin.

## Use from a project repo

The required modern project setup is the portable workflow in [PORTABLE_PROJECT_SETUP.md](PORTABLE_PROJECT_SETUP.md). In short, each governed project should expose repo-local scripts like this:

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

The intended workflow inside a project repo is:

1. Run `pnpm docs:governor:bootstrap`.
2. Run `pnpm docs:hook:install`.
3. Run `pnpm docs:watch` during active implementation sessions. If a watcher cannot stay open, run `pnpm docs:check` immediately after edits and before final handoff.
4. Refresh the actual docs in `docs/`.
5. Run `pnpm docs:governor:refresh -- --note "Describe the documentation refresh"`.
6. Run `pnpm docs:check`.

The PowerShell wrappers remain available for older Windows CI and constrained environments. New projects should prefer the repo-local Node wrapper from the portable setup guide because it searches the installed plugin paths, includes untracked files in checks, and gives a single package-script interface across machines.

## CI wiring

Project repos should install this repo during CI before running `pnpm docs:check`. A practical pattern is:

1. Set a repository variable such as `DOCUMENTATION_GOVERNOR_REPO` to the clone URL of this repo.
2. Clone the repo in CI to a temp directory.
3. Run `node ./scripts/install-home-local.mjs --force` from that checkout.
4. Run the governed repo's `pnpm docs:check`.

## What this does not guarantee

The plugin can guarantee that documentation refreshes are required by process. It cannot guarantee that a human or model wrote perfect prose. The strongest setup is still:

- Plugin for shared workflow
- Repo config for local scope
- Local pre-commit hook for commit-time enforcement
- Local watcher for active editing feedback
- CI gate for enforcement
- Optional Codex automation for scheduled sweeps
