#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dreamQuestFile = path.join(repoRoot, "games/dreamquest/game-data.js");
const prophecySwordFile = path.join(repoRoot, "games/prophecy-sword/game-data.js");
const overlayMarker = "    // ProphecyQuest + SwordQuest campaign overlay.";
const returnMarker = "\n    return {";

const dreamQuestSource = fs.readFileSync(dreamQuestFile, "utf8");
const prophecySwordSource = fs.readFileSync(prophecySwordFile, "utf8");
const dreamQuestReturn = dreamQuestSource.lastIndexOf(returnMarker);
const overlayStart = prophecySwordSource.indexOf(overlayMarker);

if (dreamQuestReturn < 0) throw new Error("Could not find the DreamQuest data return block.");
if (overlayStart < 0) throw new Error("Could not find the ProphecyQuest/SwordQuest overlay marker.");

const merged = `${dreamQuestSource.slice(0, dreamQuestReturn)}\n${prophecySwordSource.slice(overlayStart)}`;
fs.writeFileSync(prophecySwordFile, merged);
console.log("Refreshed ProphecyQuest/SwordQuest from the current DreamQuest base plus the sequel overlay.");
