---
name: documentation-governor
description: Enforce repository documentation refreshes with a governed workflow that updates docs, project inventory, and a status stamp. Use when the user asks to refresh docs, explain a docs gate failure, or keep project documentation current after code changes.
---

# Documentation Governor

This skill is for repositories that use `documentation-governor` to enforce documentation updates in CI.

## Required workflow

1. Read `./.documentation-governor.json`.
2. Run the installed plugin's catalog command. On Windows with a home-local install:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-catalog.ps1\" -Config ./.documentation-governor.json"
```

3. Inspect the current governance status:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-check.ps1\" -Config ./.documentation-governor.json"
```

4. Read the changed code and the existing docs.
5. Update the human-readable docs under `docs/`.
6. Record the refresh:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& \"$HOME\\plugins\\documentation-governor\\scripts\\docs-stamp.ps1\" -Config ./.documentation-governor.json -Note \"Describe the refresh\""
```

7. Re-run the `check` command and leave the repo passing.

## Documentation rules

- Do not update only the status stamp. Human-readable docs must change when governed code changes.
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
