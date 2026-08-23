#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectRuntimeAssetPaths,
  isRuntimeAsset,
  loadGameData,
  walkFiles
} from "../lib/assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [dreamQuestArg, prophecySwordArg] = process.argv.slice(2);

if (!dreamQuestArg || !prophecySwordArg) {
  console.error("Usage: node tools/migration/import-legacy-assets.mjs /path/to/dqrpg /path/to/pqrpg");
  process.exit(1);
}

const legacyRoots = {
  dreamquest: path.resolve(dreamQuestArg),
  "prophecy-sword": path.resolve(prophecySwordArg)
};

const gameDefinitions = {
  dreamquest: {
    dataFile: path.join(repoRoot, "games/dreamquest/game-data.js"),
    preferredRoot: legacyRoots.dreamquest,
    fallbackRoot: legacyRoots["prophecy-sword"]
  },
  "prophecy-sword": {
    dataFile: path.join(repoRoot, "games/prophecy-sword/game-data.js"),
    preferredRoot: legacyRoots["prophecy-sword"],
    fallbackRoot: legacyRoots.dreamquest
  }
};

const sharedSourceFiles = [
  path.join(repoRoot, "packages/engine/game.js"),
  path.join(repoRoot, "packages/ui/index.html"),
  path.join(repoRoot, "packages/ui/style.css")
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findLegacyAsset(definition, logicalPath) {
  const candidates = [definition.preferredRoot, definition.fallbackRoot]
    .map((root) => path.join(root, logicalPath));
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function addDynamicAssets(definition, data, paths) {
  const directory = String(data.gameConfig?.areaBannerDirectory || "").replace(/\/$/, "");
  if (!directory.startsWith("assets/")) return;
  const sourceDirectory = [definition.preferredRoot, definition.fallbackRoot]
    .map((root) => path.join(root, directory))
    .find((candidate) => fs.existsSync(candidate));
  if (!sourceDirectory) throw new Error(`Missing dynamic asset directory ${directory}.`);
  walkFiles(sourceDirectory)
    .filter(isRuntimeAsset)
    .forEach((filePath) => paths.add(path.join(directory, path.relative(sourceDirectory, filePath))));
}

const inventories = {};
for (const [gameId, definition] of Object.entries(gameDefinitions)) {
  const data = loadGameData(definition.dataFile);
  const logicalPaths = collectRuntimeAssetPaths(data, [...sharedSourceFiles, definition.dataFile]);
  addDynamicAssets(definition, data, logicalPaths);
  const resolved = new Map();
  const missing = [];
  [...logicalPaths].sort().forEach((logicalPath) => {
    const source = findLegacyAsset(definition, logicalPath);
    if (source) resolved.set(logicalPath, source);
    else missing.push(logicalPath);
  });
  if (missing.length) {
    throw new Error(`${gameId} is missing ${missing.length} runtime assets:\n${missing.join("\n")}`);
  }
  inventories[gameId] = resolved;
}

const commonPaths = new Set();
for (const [logicalPath, dreamSource] of inventories.dreamquest) {
  const prophecySource = inventories["prophecy-sword"].get(logicalPath);
  if (!prophecySource) continue;
  const dreamStat = fs.statSync(dreamSource);
  const prophecyStat = fs.statSync(prophecySource);
  if (dreamStat.size === prophecyStat.size && sha256(dreamSource) === sha256(prophecySource)) {
    commonPaths.add(logicalPath);
  }
}

const sharedAssets = path.join(repoRoot, "shared/assets");
fs.rmSync(sharedAssets, { recursive: true, force: true });
fs.mkdirSync(sharedAssets, { recursive: true });
for (const [gameId, definition] of Object.entries(gameDefinitions)) {
  const gameAssets = path.join(repoRoot, `games/${gameId}/assets`);
  fs.rmSync(gameAssets, { recursive: true, force: true });
  fs.mkdirSync(gameAssets, { recursive: true });
  for (const [logicalPath, source] of inventories[gameId]) {
    if (commonPaths.has(logicalPath)) continue;
    const destination = path.join(gameAssets, logicalPath.slice("assets/".length));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

for (const logicalPath of commonPaths) {
  const source = inventories.dreamquest.get(logicalPath);
  const destination = path.join(sharedAssets, logicalPath.slice("assets/".length));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

for (const [gameId, inventory] of Object.entries(inventories)) {
  const uniqueCount = [...inventory.keys()].filter((logicalPath) => !commonPaths.has(logicalPath)).length;
  console.log(`${gameId}: ${inventory.size} runtime assets (${uniqueCount} game-specific)`);
}
console.log(`shared: ${commonPaths.size} byte-identical runtime assets`);
