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

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function offlineCampaign(gameId, gameRoot) {
  const files = walkFiles(gameRoot)
    .sort()
    .map((filePath) => ({
      path: `${gameId}/${path.relative(gameRoot, filePath).split(path.sep).join("/")}`,
      bytes: fs.statSync(filePath).size,
      sha256: sha256(filePath)
    }));
  return {
    id: gameId,
    label: gameId === "dreamquest" ? "DreamQuest" : "ProphecyQuest / SwordQuest",
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    files
  };
}

function writePwaFiles(distRoot, campaigns) {
  const manifest = {
    id: "./",
    name: "Daranor RPG",
    short_name: "Daranor RPG",
    description: "The DreamQuest, ProphecyQuest, and SwordQuest role-playing adventures.",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#0c0d12",
    theme_color: "#0c0d12",
    orientation: "any",
    categories: ["games", "entertainment"],
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  };
  fs.writeFileSync(path.join(distRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const publicManifest = {
    campaigns: Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign]))
  };
  const publicManifestJson = `${JSON.stringify(publicManifest, null, 2)}\n`;
  fs.writeFileSync(path.join(distRoot, "offline-manifest.json"), publicManifestJson);

  const assets = {};
  campaigns.forEach((campaign) => campaign.files.forEach((file) => {
    assets[file.path] = { bytes: file.bytes, sha256: file.sha256 };
  }));
  const shellFiles = [
    "", "index.html", "launcher.css", "pwa.js", "manifest.json", "offline-manifest.json",
    "icons/icon-192.png", "icons/icon-512.png"
  ];
  const shellContentFiles = [
    "dreamquest/assets/generated/dreamquest-title-runtime.webp",
    "dreamquest/assets/generated/title-covers/dreamquest-mobile.jpg",
    "prophecy-sword/assets/generated/title-covers/prophecyquest-mobile.jpg",
    "prophecy-sword/assets/generated/title-covers/swordquest-mobile.jpg"
  ];
  shellContentFiles.forEach((file) => {
    if (!assets[file]) throw new Error(`Missing launcher PWA asset: ${file}`);
  });
  const shellFingerprint = Object.fromEntries(shellFiles.map((file) => [
    file,
    sha256(path.join(distRoot, file || "index.html"))
  ]));
  const buildId = sha256Text(JSON.stringify({
    manifest,
    publicManifest,
    shellFingerprint
  })).slice(0, 12);
  const config = {
    buildId,
    shellFiles,
    shellContentFiles,
    assets,
    campaigns: Object.fromEntries(campaigns.map((campaign) => [campaign.id, {
      id: campaign.id,
      label: campaign.label,
      bytes: campaign.bytes,
      files: campaign.files
    }]))
  };
  const workerTemplate = fs.readFileSync(path.join(repoRoot, "packages/pwa/service-worker.js"), "utf8");
  const placeholder = "__DARANOR_PWA_CONFIG__";
  if (!workerTemplate.includes(placeholder)) throw new Error("PWA service worker template is missing its config placeholder.");
  fs.writeFileSync(path.join(distRoot, "service-worker.js"), workerTemplate.replace(placeholder, JSON.stringify(config)));
}

export function build() {
  const distRoot = path.join(repoRoot, "dist");
  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });
  copyDirectory(path.join(repoRoot, "packages/launcher"), distRoot);
  copyFile(path.join(repoRoot, "packages/pwa/client.js"), path.join(distRoot, "pwa.js"));

  const results = [];
  const offlineCampaigns = [];
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
    offlineCampaigns.push(offlineCampaign(gameId, gameOutput));
  }

  writePwaFiles(distRoot, offlineCampaigns);

  results.forEach(({ gameId, count, bytes }) => {
    console.log(`${gameId}: ${count} assets, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
  });
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build();
