#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  return {
    force: argv.includes("--force")
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function upsertEnabledPlugin(configText, pluginKey) {
  const header = `[plugins."${pluginKey}"]`;
  const entry = `${header}\nenabled = true\n`;

  if (!configText.trim()) {
    return `${entry}`;
  }

  if (configText.includes(header)) {
    const blockPattern = new RegExp(
      `\\[plugins\\.\"${pluginKey.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\"\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`,
      "m"
    );
    const existingBlock = configText.match(blockPattern)?.[0] || header;

    if (/^\s*enabled\s*=\s*(true|false)\s*$/m.test(existingBlock)) {
      const nextBlock = existingBlock.replace(/^\s*enabled\s*=\s*(true|false)\s*$/m, "enabled = true");
      return configText.replace(blockPattern, nextBlock);
    }

    return configText.replace(blockPattern, `${existingBlock.trimEnd()}\nenabled = true`);
  }

  return `${configText.trimEnd()}\n\n${entry}`;
}

function enablePlugin(configPath, pluginKey) {
  const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const next = upsertEnabledPlugin(current, pluginKey);
  if (next !== current) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, next.endsWith("\n") ? next : `${next}\n`);
  }
}

function copyPlugin(sourceRoot, destinationRoot, force) {
  if (fs.existsSync(destinationRoot)) {
    if (!force) {
      throw new Error(
        `Destination already exists: ${destinationRoot}. Re-run with --force to replace it.`
      );
    }

    fs.rmSync(destinationRoot, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true,
    force
  });
}

function loadMarketplace(marketplacePath) {
  if (!fs.existsSync(marketplacePath)) {
    return {
      name: "local-plugins",
      interface: {
        displayName: "Local Plugins"
      },
      plugins: []
    };
  }

  return readJson(marketplacePath);
}

function upsertMarketplaceEntry(marketplace, pluginName, category) {
  const nextEntry = {
    name: pluginName,
    source: {
      source: "local",
      path: `./plugins/${pluginName}`
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL"
    },
    category
  };

  if (!Array.isArray(marketplace.plugins)) {
    marketplace.plugins = [];
  }

  const existingIndex = marketplace.plugins.findIndex((entry) => entry?.name === pluginName);
  if (existingIndex >= 0) {
    marketplace.plugins[existingIndex] = nextEntry;
  } else {
    marketplace.plugins.push(nextEntry);
  }

  return marketplace;
}

function main() {
  try {
    const { force } = parseArgs(process.argv.slice(2));
    const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
    const pluginRoot = path.resolve(scriptDirectory, "..");
    const pluginManifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
    const pluginManifest = readJson(pluginManifestPath);
    const pluginName = pluginManifest.name;
    const pluginCategory = pluginManifest.interface?.category || "Productivity";
    const homeDirectory = os.homedir();
    const destinationRoot = path.join(homeDirectory, "plugins", pluginName);
    const marketplacePath = path.join(homeDirectory, ".agents", "plugins", "marketplace.json");
    const codexConfigPath = path.join(homeDirectory, ".codex", "config.toml");

    copyPlugin(pluginRoot, destinationRoot, force);
    const marketplace = loadMarketplace(marketplacePath);
    const pluginKey = `${pluginName}@${marketplace.name}`;
    writeJson(
      marketplacePath,
      upsertMarketplaceEntry(marketplace, pluginName, pluginCategory)
    );
    enablePlugin(codexConfigPath, pluginKey);

    console.log(`Installed plugin to ${destinationRoot}`);
    console.log(`Updated marketplace ${marketplacePath}`);
    console.log(`Enabled plugin in ${codexConfigPath} as ${pluginKey}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
