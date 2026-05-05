#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

runDocumentationGovernor();

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
