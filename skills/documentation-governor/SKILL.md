---
name: documentation-governor
description: Enforce repository documentation refreshes with a governed workflow that updates docs, project inventory, and a status stamp. Use when the user asks to initialize Documentation Governor in a project, refresh docs, explain a docs gate failure, or keep project documentation current after code changes.
---

# Documentation Governor

This skill is for repositories that use `documentation-governor` to set up and enforce documentation updates in CI.

## New Project Setup

When the user asks to initialize, install, onboard, govern, or add Documentation Governor to a project, first read the portable setup playbook at `../../PORTABLE_PROJECT_SETUP.md` relative to this skill file. Treat that guide as the authoritative source for repo-local setup.

Set up or adapt the target repo so it has the portable guardrails from the guide:

1. Add or update `./.documentation-governor.json` with repo-specific code, docs, inventory, ignore, catalog, and status paths.
2. Add or update the repo-local wrapper scripts, including `scripts/documentation-governor.js`, `scripts/check-docs.js`, `scripts/install-docs-hook.js`, and `scripts/watch-docs.js`, unless equivalent scripts already exist.
3. Wire package scripts such as `docs:governor:bootstrap`, `docs:governor:catalog`, `docs:governor:refresh`, `docs:hook:install`, `docs:watch`, and `docs:check`.
4. Ensure the package install lifecycle installs the local documentation hook when the repo supports lifecycle scripts, for example with `prepare`.
5. Add or merge the `AGENTS.md` documentation failsafe rules so future agents know this skill is required and local docs guards are mandatory.
6. Add or update human-readable maintenance docs and generated governance artifacts under the repo's docs tree.
7. Run the bootstrap, hook install, refresh, and check commands from the target repo, then leave `docs:check` passing.

If the installed plugin cannot be located, immediately alert the user instead of silently skipping governance setup. Prefer adapting existing repo conventions over creating duplicate files or replacing unrelated docs.

## Refresh Workflow

1. Read `./.documentation-governor.json`.
2. Confirm the repo-local automation exists: `scripts/check-docs.js`, `scripts/install-docs-hook.js`, `scripts/watch-docs.js`, package scripts for `docs:check`, `docs:hook:install`, and `docs:watch`, and the local hook installed through `docs:hook:install`. If these are missing, add them before continuing unless the user explicitly asks only for a diagnosis.
3. Run the installed plugin's catalog command. Prefer repo-local `docs:governor:*` scripts when available. Otherwise, on Windows with a home-local install:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-catalog.ps1\" -Config ./.documentation-governor.json"
```

4. Inspect the current governance status. Prefer the repo-local `docs:check` command when available so project-specific stale scans run before the governor:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-check.ps1\" -Config ./.documentation-governor.json"
```

5. Read the changed code and the existing docs.
6. Update the human-readable docs under `docs/`.
7. Record the refresh:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-stamp.ps1\" -Config ./.documentation-governor.json -Note \"Describe the refresh\""
```

8. Re-run the `docs:check` command and leave the repo passing.

## Documentation rules

- Do not update only the status stamp. Human-readable docs must change when governed code changes.
- Do not initialize a project with Documentation Governor unless the local `docs:check` command, pre-commit hook installer, and active-session watcher are also set up or an explicit user-approved exception is documented.
- Treat `docs:check` as the required final gate for governed work and the pre-commit hook as the required local commit gate.
- Keep the project catalog synchronized with discovered project directories. If a new project appears, update the docs to cover it and regenerate the catalog.
- Prefer updating existing docs over creating duplicates.
- When the current docs are too shallow, expand them into a layered set:
  - architecture or principles
  - quick reference or runbook
  - navigation or index
- Be explicit about system boundaries, major flows, operators, and failure modes.

## Failure triage

If the docs gate fails:

1. Run the `check --json` command and identify whether the failure is:
   - missing catalog update
   - missing status stamp
   - missing human-readable docs change
2. Fix the specific missing artifact.
3. Re-run the check and verify the repo passes before stopping.
