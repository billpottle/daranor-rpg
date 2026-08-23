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
