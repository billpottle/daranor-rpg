#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { run } from "./run-command.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
build();
for (const gameId of ["dreamquest", "prophecy-sword"]) {
  console.log(`\nValidating ${gameId}...`);
  run(process.execPath, ["tools/validate_game_data.cjs", "--root", `dist/${gameId}`], { cwd: repoRoot });
}

console.log("\nRunning dreamquest functional tests...");
run(process.execPath, ["tests/dreamquest/run_functional_tests.cjs", "--root", "dist/dreamquest"], { cwd: repoRoot });

const prophecySuite = "tests/prophecy-sword/run_functional_tests.cjs";
const prophecyRoot = ["--root", "dist/prophecy-sword"];
const prophecyPhases = [
  ["core gameplay", ["--group", "core"]],
  ["Kitrina battle visuals", ["--filter", "Kitrina chase"]],
  ["Persericax battle visuals", ["--filter", "Persericax final"]],
  ["guide and generated art", ["--group", "guide"]]
];
for (const [label, args] of prophecyPhases) {
  console.log(`\nRunning prophecy-sword ${label} tests...`);
  run(process.execPath, [prophecySuite, ...prophecyRoot, ...args], { cwd: repoRoot });
}
