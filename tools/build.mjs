#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { walkFiles } from "./lib/assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const games = ["dreamquest", "prophecy-sword"];

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeAssetManifest(gameRoot) {
  const assetRoot = path.join(gameRoot, "assets");
  const assets = walkFiles(assetRoot)
    .sort()
    .map((filePath) => ({
      path: path.relative(gameRoot, filePath).split(path.sep).join("/"),
      bytes: fs.statSync(filePath).size,
      sha256: sha256(filePath)
    }));
  const bytes = assets.reduce((total, asset) => total + asset.bytes, 0);
  fs.writeFileSync(
    path.join(gameRoot, "asset-manifest.json"),
    `${JSON.stringify({ assets, bytes }, null, 2)}\n`
  );
  return { count: assets.length, bytes };
}

export function build() {
  const distRoot = path.join(repoRoot, "dist");
  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });
  copyDirectory(path.join(repoRoot, "packages/launcher"), distRoot);

  const results = [];
  for (const gameId of games) {
    const gameSource = path.join(repoRoot, "games", gameId);
    const gameOutput = path.join(distRoot, gameId);
    fs.mkdirSync(gameOutput, { recursive: true });
    copyFile(path.join(repoRoot, "packages/ui/index.html"), path.join(gameOutput, "index.html"));
    copyFile(path.join(repoRoot, "packages/ui/style.css"), path.join(gameOutput, "css/style.css"));
    copyFile(path.join(repoRoot, "packages/engine/game.js"), path.join(gameOutput, "js/game.js"));
    copyFile(path.join(gameSource, "game-data.js"), path.join(gameOutput, "js/game-data.js"));
    copyDirectory(path.join(repoRoot, "shared/assets"), path.join(gameOutput, "assets"));
    copyDirectory(path.join(gameSource, "assets"), path.join(gameOutput, "assets"));
    const manifest = writeAssetManifest(gameOutput);
    results.push({ gameId, ...manifest });
  }

  results.forEach(({ gameId, count, bytes }) => {
    console.log(`${gameId}: ${count} assets, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
  });
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build();
