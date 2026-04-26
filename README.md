# Documentation Governor

`documentation-governor` is a standalone Codex plugin repository for keeping project documentation synchronized with code changes and project inventory changes.

GitHub repository: [solovision24/documentation-governor](https://github.com/solovision24/documentation-governor)

It provides three things:

- A Codex skill for documentation refresh work.
- A deterministic governance script that CI can enforce.
- Templates and install tooling so the same process can be reused on multiple machines.

## What it enforces

The plugin is designed around an explicit process rather than agent memory:

1. Discover the current project folders that should be documented.
2. Update human-readable docs after code changes.
3. Regenerate the project catalog when new projects appear.
4. Update a documentation status stamp.
5. Fail CI if code changed but docs, catalog, or stamp were not refreshed.

That gives you a consistent workflow across machines and a hard merge gate inside each repo.

## Files

- `skills/documentation-governor/SKILL.md`: Codex workflow for documentation refreshes.
- `scripts/docs-governor.mjs`: Catalog, status stamp, and CI enforcement logic.
- `scripts/install-home-local.mjs`: Copies the plugin into your home-local Codex plugins directory and updates the local marketplace file.
- `schemas/documentation-governor.schema.json`: JSON schema for repo config files.
- `templates/repo.documentation-governor.example.json`: Example repo config.

## Repository contents

This repo is the source of truth for the plugin itself. Project repos should not copy the plugin source into their own trees. Instead, each project repo should:

- install the plugin home-local on each Codex machine
- keep a repo-local `./.documentation-governor.json`
- keep repo-local governance artifacts under `docs/_governance/`
- wire CI to install this repo and run the docs check

## Install on a Codex machine

From the root of this repo:

```bash
node ./scripts/install-home-local.mjs
```

That copies the plugin to `~/plugins/documentation-governor` and updates `~/.agents/plugins/marketplace.json`.

After installing, restart Codex to pick up the plugin.

## Use from a project repo

Typical Windows package scripts in a governed repo call the home-local plugin directly:

```json
{
  "scripts": {
    "docs:catalog": "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& \\\"$HOME\\\\plugins\\\\documentation-governor\\\\scripts\\\\docs-catalog.ps1\\\" -Config ./.documentation-governor.json\"",
    "docs:stamp": "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& \\\"$HOME\\\\plugins\\\\documentation-governor\\\\scripts\\\\docs-stamp.ps1\\\" -Config ./.documentation-governor.json\"",
    "docs:check": "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& \\\"$HOME\\\\plugins\\\\documentation-governor\\\\scripts\\\\docs-check.ps1\\\" -Config ./.documentation-governor.json -BaseRef origin/main\""
  }
}
```

The intended workflow inside a project repo is:

1. Run `pnpm docs:catalog`.
2. Refresh the actual docs in `docs/`.
3. Run `pnpm docs:stamp`.
4. Run `pnpm docs:check`.

The PowerShell wrappers exist because Windows CI and some constrained environments block Node child-process git calls. The wrappers gather changed files with PowerShell/git and then call the core `docs-governor.mjs` logic.

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
- CI gate for enforcement
- Optional Codex automation for scheduled sweeps
