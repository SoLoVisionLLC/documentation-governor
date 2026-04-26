#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_CONFIG_PATH = ".documentation-governor.json";
const GIT_BINARY = resolveGitBinary();

function parseArgs(argv) {
  if (argv.length === 0) {
    return { command: "help", options: {} };
  }

  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === "json" || key === "force") {
      options[key] = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return { command, options };
}

function resolveConfigPath(configPath) {
  return path.resolve(process.cwd(), configPath || DEFAULT_CONFIG_PATH);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(glob) {
  const normalized = normalizePath(glob);
  let pattern = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (char === "?") {
      pattern += "[^/]";
      continue;
    }

    if (char === "/") {
      pattern += "/";
      continue;
    }

    pattern += escapeRegExp(char);
  }

  pattern += "$";
  return new RegExp(pattern);
}

function matchesAnyGlobs(filePath, globs) {
  return globs.some((glob) => globToRegExp(glob).test(filePath));
}

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync(GIT_BINARY, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
}

function resolveGitBinary() {
  if (process.env.DOCUMENTATION_GOVERNOR_GIT) {
    return process.env.DOCUMENTATION_GOVERNOR_GIT;
  }

  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env.ProgramFiles || "C:/Program Files", "Git", "cmd", "git.exe"),
      path.join(process.env.ProgramFiles || "C:/Program Files", "Git", "bin", "git.exe"),
      "git.exe"
    ];

    for (const candidate of candidates) {
      if (candidate === "git.exe" || fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "git";
}

function loadConfig(configPath) {
  const resolvedPath = resolveConfigPath(configPath);
  const config = readJson(resolvedPath);
  return {
    config,
    configPath: resolvedPath,
    repoRoot: path.dirname(resolvedPath)
  };
}

function resolveRelative(repoRoot, filePath) {
  return path.resolve(repoRoot, filePath);
}

function listProjects(repoRoot, source) {
  const absoluteRoot = resolveRelative(repoRoot, source.root);
  if (!fs.existsSync(absoluteRoot)) {
    return {
      label: source.label,
      root: normalizePath(source.root),
      projects: []
    };
  }

  const excludedNames = new Set(source.excludeNames || []);
  const projects = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !excludedNames.has(name))
    .sort((left, right) => left.localeCompare(right));

  return {
    label: source.label,
    root: normalizePath(source.root),
    projects
  };
}

function discoverProjects(config, repoRoot) {
  return config.projectDiscovery.map((source) => listProjects(repoRoot, source));
}

function buildCatalogPayload(sources) {
  return {
    generatedAt: new Date().toISOString(),
    generatedBy: "documentation-governor",
    sources
  };
}

function compareCatalog(discoveredSources, catalogPayload) {
  if (!catalogPayload) {
    return ["Catalog file is missing."];
  }

  const catalogSources = Array.isArray(catalogPayload.sources) ? catalogPayload.sources : [];
  const discoveredByRoot = new Map(
    discoveredSources.map((source) => [source.root, source.projects])
  );
  const catalogByRoot = new Map(
    catalogSources.map((source) => [normalizePath(source.root), source.projects || []])
  );

  const issues = [];

  for (const [root, projects] of discoveredByRoot) {
    const catalogProjects = new Set(catalogByRoot.get(root) || []);
    const discoveredProjects = new Set(projects);

    for (const project of projects) {
      if (!catalogProjects.has(project)) {
        issues.push(`Catalog is missing ${root}/${project}.`);
      }
    }

    for (const project of catalogProjects) {
      if (!discoveredProjects.has(project)) {
        issues.push(`Catalog contains removed or renamed project ${root}/${project}.`);
      }
    }
  }

  for (const root of catalogByRoot.keys()) {
    if (!discoveredByRoot.has(root)) {
      issues.push(`Catalog contains unmanaged discovery root ${root}.`);
    }
  }

  return issues;
}

function determineDiffRange(baseRef) {
  if (baseRef) {
    const mergeBase = runGit(["merge-base", baseRef, "HEAD"], { allowFailure: true });
    if (mergeBase) {
      return `${mergeBase}...HEAD`;
    }
  }

  const parent = runGit(["rev-parse", "HEAD~1"], { allowFailure: true });
  if (parent) {
    return `${parent}...HEAD`;
  }

  return "";
}

function getChangedFiles(diffRange) {
  if (!diffRange) {
    return [];
  }

  const output = runGit(
    ["diff", "--name-only", "--diff-filter=ACMR", diffRange],
    { allowFailure: true }
  );

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function getWorkingTreeChanges() {
  const outputs = [
    runGit(["diff", "--name-only", "--diff-filter=ACMR"], { allowFailure: true }),
    runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      allowFailure: true
    })
  ];

  return [...new Set(
    outputs
      .flatMap((output) => output.split(/\r?\n/))
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function loadChangedFilesOverride(options, repoRoot) {
  if (options["files-file"]) {
    const absolutePath = path.resolve(repoRoot, options["files-file"]);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Changed files list not found: ${absolutePath}`);
    }

    return fs
      .readFileSync(absolutePath, "utf8")
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  if (options.files) {
    return options.files
      .split(",")
      .map((entry) => normalizePath(entry.trim()))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  return null;
}

function filterGovernedChanges(changedFiles, config) {
  const ignoreGlobs = config.ignoreGlobs || [];
  const statusFile = normalizePath(config.statusFile);
  const catalogFile = normalizePath(config.catalogFile);

  const relevantFiles = changedFiles.filter((filePath) => !matchesAnyGlobs(filePath, ignoreGlobs));
  const codeChanges = relevantFiles.filter((filePath) => matchesAnyGlobs(filePath, config.codeGlobs));
  const docChanges = relevantFiles.filter((filePath) => matchesAnyGlobs(filePath, config.docGlobs));
  const humanDocChanges = docChanges.filter(
    (filePath) => filePath !== statusFile && filePath !== catalogFile
  );

  return {
    changedFiles: relevantFiles,
    codeChanges,
    docChanges,
    humanDocChanges,
    statusChanged: relevantFiles.includes(statusFile),
    catalogChanged: relevantFiles.includes(catalogFile)
  };
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function buildStatusPayload(config, repoRoot, options) {
  const head = options.head || runGit(["rev-parse", "HEAD"], { allowFailure: true });
  const dirty =
    options.dirty != null
      ? options.dirty === "true"
      : Boolean(runGit(["status", "--porcelain"], { allowFailure: true }));
  const catalogPath = resolveRelative(repoRoot, config.catalogFile);

  return {
    updatedAt: new Date().toISOString(),
    updatedBy: "documentation-governor",
    head,
    dirty,
    catalogFile: normalizePath(config.catalogFile),
    catalogHash: hashFile(catalogPath),
    note: options.note || "Documentation refresh recorded."
  };
}

function printCheckReport(report, asJson) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.ok) {
    console.log("Documentation governance passed.");
    console.log(`Diff range: ${report.diffRange || "none"}`);
    console.log(`Governed code changes: ${report.codeChanges.length}`);
    console.log(`Documentation changes: ${report.docChanges.length}`);
    console.log(`Catalog issues: ${report.inventoryIssues.length}`);
    return;
  }

  console.error("Documentation governance failed.");
  for (const failure of report.failures) {
    console.error(`- ${failure}`);
  }

  if (report.codeChanges.length > 0) {
    console.error("Governed code changes:");
    for (const filePath of report.codeChanges) {
      console.error(`  ${filePath}`);
    }
  }
}

function checkCommand(options) {
  const { config, repoRoot } = loadConfig(options.config);
  process.chdir(repoRoot);

  const diffRange = determineDiffRange(options["base-ref"] || config.baseRef);
  const discoveredSources = discoverProjects(config, repoRoot);
  const catalogPath = resolveRelative(repoRoot, config.catalogFile);
  const catalogPayload = fs.existsSync(catalogPath) ? readJson(catalogPath) : null;
  const inventoryIssues = compareCatalog(discoveredSources, catalogPayload);
  const explicitChangedFiles = loadChangedFilesOverride(options, repoRoot);
  const changedFiles = explicitChangedFiles || [...new Set([
    ...getChangedFiles(diffRange),
    ...getWorkingTreeChanges()
  ])].sort((left, right) => left.localeCompare(right));
  const governedChanges = filterGovernedChanges(changedFiles, config);
  const failures = [...inventoryIssues];

  if (governedChanges.codeChanges.length > 0 && !governedChanges.statusChanged) {
    failures.push(
      `Governed code changed but ${normalizePath(config.statusFile)} was not updated.`
    );
  }

  if (
    governedChanges.codeChanges.length > 0 &&
    config.requireDocFileChange !== false &&
    governedChanges.humanDocChanges.length === 0
  ) {
    failures.push("Governed code changed but no human-readable documentation file changed.");
  }

  const report = {
    ok: failures.length === 0,
    diffRange,
    codeChanges: governedChanges.codeChanges,
    docChanges: governedChanges.docChanges,
    humanDocChanges: governedChanges.humanDocChanges,
    statusChanged: governedChanges.statusChanged,
    catalogChanged: governedChanges.catalogChanged,
    inventoryIssues,
    failures
  };

  printCheckReport(report, options.json);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function writeCatalogCommand(options) {
  const { config, repoRoot } = loadConfig(options.config);
  const payload = buildCatalogPayload(discoverProjects(config, repoRoot));
  const targetPath = resolveRelative(repoRoot, config.catalogFile);
  writeJson(targetPath, payload);
  console.log(`Wrote project catalog: ${normalizePath(path.relative(repoRoot, targetPath))}`);
}

function writeStampCommand(options) {
  const { config, repoRoot } = loadConfig(options.config);
  process.chdir(repoRoot);
  const payload = buildStatusPayload(config, repoRoot, options);
  const targetPath = resolveRelative(repoRoot, config.statusFile);
  writeJson(targetPath, payload);
  console.log(`Wrote documentation status: ${normalizePath(path.relative(repoRoot, targetPath))}`);
}

function printHelp() {
  console.log("Usage:");
  console.log("  node docs-governor.mjs check --config ./.documentation-governor.json");
  console.log("  node docs-governor.mjs check --config ./.documentation-governor.json --files-file ./changed-files.txt");
  console.log("  node docs-governor.mjs write-catalog --config ./.documentation-governor.json");
  console.log("  node docs-governor.mjs write-stamp --config ./.documentation-governor.json --note \"...\"");
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));

    switch (command) {
      case "check":
        checkCommand(options);
        break;
      case "write-catalog":
        writeCatalogCommand(options);
        break;
      case "write-stamp":
        writeStampCommand(options);
        break;
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
