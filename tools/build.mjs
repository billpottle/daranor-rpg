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

function writeVersionedGameData(source, destination, gameOutput) {
  const shellAssetPattern = /(\b(?:favicon|titleArt|titleArtMobile|titleWordmark|endingArt)\s*:\s*)(["'])(assets\/[^"']+)\2/g;
  let replacements = 0;
  const versionedSource = fs.readFileSync(source, "utf8").replace(
    shellAssetPattern,
    (match, prefix, quote, relativePath) => {
      const cleanPath = relativePath.split("?")[0];
      const assetPath = path.join(gameOutput, cleanPath);
      if (!fs.existsSync(assetPath)) throw new Error(`Missing game shell asset: ${relativePath}`);
      replacements += 1;
      return `${prefix}${quote}${cleanPath}?v=${sha256(assetPath).slice(0, 12)}${quote}`;
    }
  );
  if (!replacements) throw new Error(`No game shell assets found in ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, versionedSource);
}

function writeGameShell(gameOutput) {
  const templatePath = path.join(repoRoot, "packages/ui/index.html");
  const versionedFiles = [
    ["href", "css/style.css"],
    ["src", "js/game-data.js"],
    ["src", "js/game.js"]
  ];
  let html = fs.readFileSync(templatePath, "utf8");
  for (const [attribute, relativePath] of versionedFiles) {
    const marker = `${attribute}="${relativePath}"`;
    if (!html.includes(marker)) throw new Error(`Missing game shell asset reference: ${marker}`);
    const version = sha256(path.join(gameOutput, relativePath)).slice(0, 12);
    html = html.replace(marker, `${attribute}="${relativePath}?v=${version}"`);
  }
  fs.writeFileSync(path.join(gameOutput, "index.html"), html);
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
    copyFile(path.join(repoRoot, "packages/ui/style.css"), path.join(gameOutput, "css/style.css"));
    copyFile(path.join(repoRoot, "packages/engine/game.js"), path.join(gameOutput, "js/game.js"));
    copyDirectory(path.join(repoRoot, "shared/assets"), path.join(gameOutput, "assets"));
    copyDirectory(path.join(gameSource, "assets"), path.join(gameOutput, "assets"));
    writeVersionedGameData(path.join(gameSource, "game-data.js"), path.join(gameOutput, "js/game-data.js"), gameOutput);
    writeGameShell(gameOutput);
    const manifest = writeAssetManifest(gameOutput);
    results.push({ gameId, ...manifest });
  }

  results.forEach(({ gameId, count, bytes }) => {
    console.log(`${gameId}: ${count} assets, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
  });
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build();
