#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = process.cwd();
const debounceMs = Number.parseInt(process.env.DOCUMENTATION_GOVERNOR_WATCH_DEBOUNCE_MS || "900", 10);
const packageManager = detectPackageManager();
const ignoredDirs = new Set([
  ".git",
  ".next",
  ".parcel-cache",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules"
]);

const watchers = new Map();
let timer = null;
let running = false;
let pending = false;

watchTree(root);
scheduleCheck("initial startup");

console.log("Watching repository documentation governance. Press Ctrl+C to stop.");

process.on("SIGINT", () => {
  closeWatchers();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeWatchers();
  process.exit(0);
});

function watchTree(directory) {
  for (const dir of listDirectories(directory)) {
    addWatcher(dir);
  }
}

function listDirectories(directory) {
  const directories = [];
  walk(directory);
  return directories;

  function walk(current) {
    const relative = normalizePath(path.relative(root, current));
    if (relative && isIgnoredDirectory(relative)) {
      return;
    }

    directories.push(current);

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name));
      }
    }
  }
}

function addWatcher(directory) {
  if (watchers.has(directory)) {
    return;
  }

  try {
    const watcher = fs.watch(directory, (eventType, filename) => {
      if (!filename) {
        scheduleCheck("repository change");
        return;
      }

      const changedPath = path.join(directory, filename.toString());
      const relative = normalizePath(path.relative(root, changedPath));
      if (relative && isIgnoredPath(relative)) {
        return;
      }

      if (eventType === "rename") {
        refreshWatchers();
      }

      scheduleCheck(relative || "repository change");
    });

    watchers.set(directory, watcher);
  } catch {
    // Directories can disappear during renames. The next refresh will reconcile watchers.
  }
}

function refreshWatchers() {
  const expected = new Set(listDirectories(root));

  for (const directory of expected) {
    addWatcher(directory);
  }

  for (const [directory, watcher] of watchers) {
    if (!expected.has(directory)) {
      watcher.close();
      watchers.delete(directory);
    }
  }
}

function scheduleCheck(reason) {
  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => runCheck(reason), debounceMs);
}

function runCheck(reason) {
  timer = null;

  if (running) {
    pending = true;
    return;
  }

  running = true;
  pending = false;

  console.log(`\nDocs change detected: ${reason}`);
  const child = spawn(packageManager, ["run", "docs:check"], {
    cwd: root,
    stdio: "inherit"
  });

  child.on("close", (code) => {
    running = false;
    if (code === 0) {
      console.log("Docs guard is clean.");
    } else {
      console.log(`Docs guard failed with exit code ${code}. Update docs, then save again.`);
    }

    if (pending) {
      scheduleCheck("queued file changes");
    }
  });

  child.on("error", (error) => {
    running = false;
    console.error(`Unable to run docs guard: ${error.message}`);
  });
}

function closeWatchers() {
  for (const watcher of watchers.values()) {
    watcher.close();
  }
  watchers.clear();
}

function detectPackageManager() {
  if (process.env.DOCUMENTATION_GOVERNOR_PACKAGE_MANAGER) {
    return process.env.DOCUMENTATION_GOVERNOR_PACKAGE_MANAGER;
  }

  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    return commandName("pnpm");
  }

  if (fs.existsSync(path.join(root, "yarn.lock"))) {
    return commandName("yarn");
  }

  if (fs.existsSync(path.join(root, "bun.lock")) || fs.existsSync(path.join(root, "bun.lockb"))) {
    return commandName("bun");
  }

  return commandName("npm");
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function isIgnoredDirectory(relative) {
  return [...ignoredDirs].some((ignored) => relative === ignored || relative.startsWith(`${ignored}/`));
}

function isIgnoredPath(relative) {
  return isIgnoredDirectory(relative) || /\.(png|jpg|jpeg|gif|webp|ico|map|zip)$/i.test(relative);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
