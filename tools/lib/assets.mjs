import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ASSET_EXTENSION = /\.(?:gif|jpe?g|mp3|ogg|opus|png|svg|wav|webp)$/i;
const LITERAL_ASSET = /(?:\.\.\/)?assets\/[A-Za-z0-9_./' -]+\.(?:gif|jpe?g|mp3|ogg|opus|png|svg|wav|webp)/gi;

export function stripQuery(value) {
  return String(value || "").split("?")[0];
}

export function normalizeAssetPath(value) {
  return stripQuery(value).replace(/^(?:\.\.\/)+assets\//, "assets/");
}

export function loadGameData(dataFile) {
  const source = fs.readFileSync(dataFile, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: dataFile });
  const factory = sandbox.window.DreamQuestGameDataFactory;
  if (typeof factory !== "function") {
    throw new Error(`Could not load DreamQuestGameDataFactory from ${dataFile}.`);
  }
  return factory();
}

function collectFromValue(value, target, seen) {
  if (typeof value === "string") {
    const clean = normalizeAssetPath(value);
    if (clean.startsWith("assets/") && ASSET_EXTENSION.test(clean)) target.add(clean);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectFromValue(entry, target, seen));
    return;
  }
  Object.values(value).forEach((entry) => collectFromValue(entry, target, seen));
}

export function collectRuntimeAssetPaths(data, sourceFiles = []) {
  const assets = new Set();
  collectFromValue(data, assets, new Set());
  sourceFiles.forEach((sourceFile) => {
    const source = fs.readFileSync(sourceFile, "utf8");
    for (const match of source.matchAll(LITERAL_ASSET)) {
      assets.add(normalizeAssetPath(match[0]));
    }
  });
  return assets;
}

export function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute) : [absolute];
  });
}

export function isRuntimeAsset(filePath) {
  return ASSET_EXTENSION.test(filePath);
}
