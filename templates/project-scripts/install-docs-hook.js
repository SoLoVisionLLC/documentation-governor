#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const hookPath = path.join(root, ".git", "hooks", "pre-commit");
const beginMarker = "# >>> Documentation Governor docs guard >>>";
const endMarker = "# <<< Documentation Governor docs guard <<<";
const packageManager = detectPackageManager();
const checkCommand = `${packageManager} run docs:check`;

if (!fs.existsSync(path.join(root, ".git"))) {
  console.log("Documentation Governor hook not installed because this is not a Git checkout.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(hookPath), { recursive: true });

const current = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, "utf8") : "#!/bin/sh\n";
const withoutExistingBlock = removeExistingBlock(current);
const next = `${withoutExistingBlock.trimEnd()}\n\n${beginMarker}
if [ "\${DOCUMENTATION_GOVERNOR_SKIP_HOOK:-}" = "1" ]; then
  echo "Skipping Documentation Governor docs guard because DOCUMENTATION_GOVERNOR_SKIP_HOOK=1"
else
  echo "Running Documentation Governor docs guard..."
  ${checkCommand}
fi
${endMarker}
`;

fs.writeFileSync(hookPath, next, { mode: 0o755 });
fs.chmodSync(hookPath, 0o755);

console.log(`Installed Documentation Governor pre-commit hook at ${hookPath}`);

function removeExistingBlock(value) {
  const start = value.indexOf(beginMarker);
  const end = value.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    return value;
  }

  return `${value.slice(0, start)}${value.slice(end + endMarker.length)}`;
}

function detectPackageManager() {
  if (process.env.DOCUMENTATION_GOVERNOR_PACKAGE_MANAGER) {
    return process.env.DOCUMENTATION_GOVERNOR_PACKAGE_MANAGER;
  }

  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (fs.existsSync(path.join(root, "yarn.lock"))) {
    return "yarn";
  }

  if (fs.existsSync(path.join(root, "bun.lock")) || fs.existsSync(path.join(root, "bun.lockb"))) {
    return "bun";
  }

  return "npm";
}
