#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const rootArgumentIndex = process.argv.indexOf("--root");
const ROOT = path.resolve(
  rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : process.env.GAME_ROOT || path.resolve(__dirname, "../..")
);
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium"
].filter(Boolean);

const MIME_TYPES = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChrome() {
  const chrome = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!chrome) {
    throw new Error("Could not find Chrome. Set CHROME_PATH to a Chromium-based browser executable.");
  }
  return chrome;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname);
    const requestPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = path.resolve(ROOT, `.${requestPath}`);
    if (!filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method && this.events.has(message.method)) {
        this.events.get(message.method).forEach((listener) => listener(message.params));
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

async function evalPage(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(detail);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evalPage(cdp, expression)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function click(cdp, selector) {
  const clicked = await evalPage(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${selector}`);
}

async function closeDialogue(cdp) {
  for (let i = 0; i < 20; i += 1) {
    const visible = await evalPage(cdp, `!document.querySelector("#dialogue")?.classList.contains("is-hidden")`);
    if (!visible) return;
    await click(cdp, "#dialogue-next");
    await sleep(80);
  }
  throw new Error("Dialogue did not close.");
}

async function dataSnapshot(cdp) {
  return evalPage(cdp, `(() => {
    const data = window.DreamQuestData;
    return {
      config: data.gameConfig,
      startPartyIds: (data.gameConfig.startPartyIds || []).filter((id) => data.partyTemplates[id]),
      guideSectionCounts: Object.fromEntries(Object.entries(data.guideData).map(([key, entries]) => [key, entries.length]))
    };
  })()`);
}

async function passableMoveFromCurrentTile(cdp) {
  return evalPage(cdp, `(() => {
    const state = window.DreamQuestDebug.getState();
    const area = window.DreamQuestData.areas[state.areaId];
    const blocked = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);
    const moves = [
      { key: "ArrowUp", dx: 0, dy: -1 },
      { key: "ArrowRight", dx: 1, dy: 0 },
      { key: "ArrowDown", dx: 0, dy: 1 },
      { key: "ArrowLeft", dx: -1, dy: 0 }
    ];
    return moves.find((move) => {
      const x = state.x + move.dx;
      const y = state.y + move.dy;
      const row = area.map[y] || "";
      const tile = row[x];
      return typeof tile === "string" && tile && !blocked.has(tile);
    }) || null;
  })()`);
}

async function recoveryFixture(cdp) {
  return evalPage(cdp, `(() => {
    const data = window.DreamQuestData;
    const entries = Object.entries(data.battleItemCatalog);
    const heal = entries.find(([, item]) => item.type === "heal" && item.inventory);
    const revive = entries.find(([, item]) => item.type === "revive" && item.inventory);
    const memberId = (data.gameConfig.startPartyIds || []).find((id) => data.partyTemplates[id]) || Object.keys(data.partyTemplates)[0];
    return {
      healId: heal?.[0] || "",
      healInventory: heal?.[1]?.inventory || "",
      reviveId: revive?.[0] || "",
      reviveInventory: revive?.[1]?.inventory || "",
      memberId
    };
  })()`);
}

async function battleFixture(cdp) {
  return evalPage(cdp, `(() => {
    const data = window.DreamQuestData;
    for (const [areaId, area] of Object.entries(data.areas)) {
      const enemyId = (area.encounters || []).find((id) => data.enemies[id]);
      if (enemyId) return { areaId, enemyId };
    }
    const enemyId = Object.keys(data.enemies)[0] || "";
    return enemyId ? { areaId: data.gameConfig.startAreaId, enemyId } : null;
  })()`);
}

async function resetPage(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
  await evalPage(cdp, `localStorage.clear()`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
}

async function runTests(cdp) {
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  test("startup lazy-loads only title assets", async () => {
    const result = await evalPage(cdp, `(() => {
      const images = performance.getEntriesByType("resource")
        .filter((entry) => /\\.(png|jpe?g|webp|svg)(\\?|$)/i.test(entry.name));
      return {
        guideImages: document.querySelectorAll(".guide-image").length,
        totalCanvases: document.querySelectorAll("canvas").length,
        imageCount: images.length,
        gameHidden: document.querySelector("#game-screen").classList.contains("is-hidden")
      };
    })()`);
    assert(result.gameHidden, "Game screen should be hidden on title.");
    assert(result.guideImages === 0, "Guide canvases should not exist before opening the guide.");
    assert(result.imageCount <= 6, `Expected <= 6 startup images, saw ${result.imageCount}.`);
    assert(result.totalCanvases <= 6, `Expected only static canvases on startup, saw ${result.totalCanvases}.`);
  });

  test("random encounter tables exclude boss enemies", async () => {
    const offenders = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      return Object.entries(data.areas).flatMap(([areaId, area]) =>
        (area.encounters || [])
          .filter((enemyId) => data.enemies[enemyId]?.boss)
          .map((enemyId) => \`\${areaId}:\${enemyId}\`)
      );
    })()`);
    assert(offenders.length === 0, `Boss enemies should not be random encounters: ${offenders.join(", ")}.`);
  });

  test("new game initializes state and movement works", async () => {
    const snapshot = await dataSnapshot(cdp);
    await evalPage(cdp, `window.__dqOriginalConfirm = window.confirm; window.__dqConfirmCalls = 0; window.confirm = () => { window.__dqConfirmCalls += 1; return true; }`);
    await click(cdp, "#new-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === window.DreamQuestData.gameConfig.startAreaId`);
    const firstStartConfirmCalls = await evalPage(cdp, `(() => { const calls = window.__dqConfirmCalls; window.confirm = window.__dqOriginalConfirm; delete window.__dqOriginalConfirm; delete window.__dqConfirmCalls; return calls; })()`);
    assert(firstStartConfirmCalls === 0, `A first-ever New Game should start immediately, but confirmation ran ${firstStartConfirmCalls} time(s).`);
    let state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.version === snapshot.config.saveVersion, `Expected save version ${snapshot.config.saveVersion}, got ${state.version}.`);
    assert(
      state.party.length === snapshot.startPartyIds.length && snapshot.startPartyIds.every((id, index) => state.party[index]?.id === id),
      `New game should start with configured party: ${snapshot.startPartyIds.join(", ")}.`
    );
    Object.entries(snapshot.config.startInventory || {}).forEach(([name, count]) => {
      assert(state.inventory[name] === count, `New game should start with ${count} ${name}.`);
    });
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    await evalPage(cdp, `window.DreamQuestDebug.setWalkMs(80)`);
    const before = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    const move = await passableMoveFromCurrentTile(cdp);
    assert(move, "Start area should have at least one passable neighboring tile.");
    await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(move.key)}, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(move.key)}, bubbles: true }));`);
    await waitFor(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return state.x === ${before.x + move.dx} && state.y === ${before.y + move.dy};
    })()`, 3000);
    state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.steps === before.steps + 1, "Movement should increment steps.");
  });

  test("New Game confirms before replacing an existing adventure save", async () => {
    const result = await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const beforeState = window.DreamQuestDebug.getState();
      const beforeSave = localStorage.getItem(key);
      const originalConfirm = window.confirm;
      let calls = 0;
      let message = "";
      window.confirm = (nextMessage) => {
        calls += 1;
        message = String(nextMessage);
        return false;
      };
      document.querySelector("#new-game").click();
      window.confirm = originalConfirm;
      const afterState = window.DreamQuestDebug.getState();
      return {
        calls,
        message,
        sameState: beforeState.startedAt === afterState.startedAt && beforeState.areaId === afterState.areaId && beforeState.x === afterState.x && beforeState.y === afterState.y,
        sameSave: beforeSave === localStorage.getItem(key)
      };
    })()`);
    assert(result.calls === 1, `Replacing an adventure should ask once, got ${JSON.stringify(result)}.`);
    assert(/New Game.*replace the existing save/i.test(result.message), `Overwrite warning should explain the replacement, got ${JSON.stringify(result.message)}.`);
    assert(result.sameState && result.sameSave, `Canceling New Game should preserve the active and stored adventure, got ${JSON.stringify(result)}.`);
  });

  test("the title Music choice carries into a new game", async () => {
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#music-title");
    await evalPage(cdp, `window.__dqOriginalConfirm = window.confirm; window.confirm = () => true`);
    await click(cdp, "#new-game");
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
    const result = await evalPage(cdp, `(() => {
      window.confirm = window.__dqOriginalConfirm;
      delete window.__dqOriginalConfirm;
      return {
        muted: window.DreamQuestDebug.getState().settings.musicMuted,
        enabled: window.DreamQuestDebug.getMusicDebug().enabled
      };
    })()`);
    assert(result.muted && !result.enabled, `New Game should preserve Music Off from the title, got ${JSON.stringify(result)}.`);
    await click(cdp, "#music-btn");
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
  });

  test("random encounters wait at least four steps after a fight", async () => {
    const fixture = await battleFixture(cdp);
    assert(fixture?.areaId, "Test data needs an area with random encounters.");
    await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(fixture.areaId)})`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.setWalkMs(80); window.__dqOriginalRandom = window.__dqOriginalRandom || Math.random; Math.random = () => 0;`);
    try {
      await sleep(120);
      let before = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
      let move = await passableMoveFromCurrentTile(cdp);
      assert(move, "Encounter buffer test needs a passable move.");
      await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(move.key)}, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(move.key)}, bubbles: true }));`);
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle())`, 3000);
      const battleStep = await evalPage(cdp, `window.DreamQuestDebug.getState().steps`);
      await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
      for (let i = 1; i <= 4; i += 1) {
        await sleep(120);
        before = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
        move = await passableMoveFromCurrentTile(cdp);
        assert(move, `Encounter buffer test needs passable move ${i}.`);
        await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(move.key)}, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(move.key)}, bubbles: true }));`);
        await waitFor(cdp, `window.DreamQuestDebug.getState().steps === ${before.steps + 1}`, 3000);
        const buffer = await evalPage(cdp, `window.DreamQuestDebug.getEncounterBuffer()`);
        const battle = await evalPage(cdp, `window.DreamQuestDebug.getBattle()`);
        assert(!battle, `Random encounter fired during ${i}/4 safe buffer steps after battle step ${battleStep}.`);
        assert(buffer.stepsSinceLastBattle === i, `Expected ${i} steps since battle, got ${JSON.stringify(buffer)}.`);
      }
    } finally {
      await evalPage(cdp, `if (window.__dqOriginalRandom) Math.random = window.__dqOriginalRandom;`);
    }
  });

  test("post-battle encounter safety survives save and reload", async () => {
    const fixture = await battleFixture(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(fixture.areaId)}); window.DreamQuestDebug.startBattle(${JSON.stringify(fixture.enemyId)}); window.DreamQuestDebug.endBattle(); window.DreamQuestDebug.saveLocal();`);
    const stored = await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const save = JSON.parse(localStorage.getItem(key));
      return { steps: save.steps, lastBattleStep: save.lastBattleStep };
    })()`);
    assert(stored.lastBattleStep === stored.steps, `Save should retain the encounter safety marker, got ${JSON.stringify(stored)}.`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await closeDialogue(cdp);
    const restored = await evalPage(cdp, `window.DreamQuestDebug.getEncounterBuffer()`);
    assert(restored.active && restored.stepsSinceLastBattle === 0, `Reload should restore the full safety buffer, got ${JSON.stringify(restored)}.`);
  });

  test("Encounter Dial final reward controls encounter spacing", async () => {
    const rewardConfig = await evalPage(cdp, `(() => {
      const event = window.DreamQuestData.areas.rathskeller.events.find((candidate) => candidate.id === "darhyn_final");
      const item = window.DreamQuestData.battleItemCatalog.encounterDial;
      const guide = window.DreamQuestData.guideData.items.find((entry) => entry.name === "Encounter Dial");
      return {
        hasReward: Boolean(event?.itemRewards?.some((reward) => reward.name === "Encounter Dial" && reward.key)),
        itemType: item?.type || "",
        guideImage: guide?.image || ""
      };
    })()`);
    assert(rewardConfig.hasReward, "Final Darhyn should grant the Encounter Dial as a key item.");
    assert(rewardConfig.itemType === "encounterControl", `Encounter Dial should be configured as encounter control, got ${JSON.stringify(rewardConfig)}.`);
    assert(rewardConfig.guideImage === "item:encounterDial", `Encounter Dial should have guide art, got ${JSON.stringify(rewardConfig)}.`);

    const fixture = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const blocked = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);
      const eventKey = (area) => new Set((area.events || []).map((event) => \`\${event.x},\${event.y}\`));
      for (const [areaId, area] of Object.entries(data.areas)) {
        if (!area.encounterRate || !(area.encounters || []).some((id) => data.enemies[id] && !data.enemies[id].boss)) continue;
        const events = eventKey(area);
        for (let y = 1; y < area.map.length - 1; y += 1) {
          for (let x = 1; x < area.map[y].length - 1; x += 1) {
            if (blocked.has(area.map[y][x]) || events.has(\`\${x},\${y}\`)) continue;
            if (!blocked.has(area.map[y][x + 1]) && !events.has(\`\${x + 1},\${y}\`)) {
              return { areaId, enemyId: area.encounters.find((id) => data.enemies[id] && !data.enemies[id].boss), x, y, forward: "ArrowRight", back: "ArrowLeft" };
            }
            if (!blocked.has(area.map[y + 1]?.[x]) && !events.has(\`\${x},\${y + 1}\`)) {
              return { areaId, enemyId: area.encounters.find((id) => data.enemies[id] && !data.enemies[id].boss), x, y, forward: "ArrowDown", back: "ArrowUp" };
            }
          }
        }
      }
      return null;
    })()`);
    assert(fixture?.areaId && fixture?.enemyId, "Encounter Dial test needs a safe two-tile lane in a random encounter area.");
    await evalPage(cdp, `
      window.DreamQuestDebug.setCreatorFlags({ noEnemies: false, oneHitEnemies: false, infiniteHp: false });
      window.DreamQuestDebug.setInventoryItem("Encounter Dial", 1);
      window.DreamQuestDebug.travelTo(${JSON.stringify(fixture.areaId)}, ${fixture.x}, ${fixture.y});
    `);
    await closeDialogue(cdp);
    await evalPage(cdp, `
      window.DreamQuestDebug.startBattle(${JSON.stringify(fixture.enemyId)});
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.openMenu("inventory");
    `);
    await waitFor(cdp, `Boolean(document.querySelector(".encounter-dial-note #encounter-dial-steps"))`);
    await evalPage(cdp, `(() => {
      document.querySelector("#encounter-dial-steps").value = "8";
      document.querySelector("[data-encounter-dial-apply]").click();
    })()`);
    await waitFor(cdp, `window.DreamQuestDebug.getEncounterControl().interval === 8`);
    const control = await evalPage(cdp, `window.DreamQuestDebug.getEncounterControl()`);
    assert(control.status === "Every 8 steps", `Expected Encounter Dial status for 8 steps, got ${JSON.stringify(control)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.__dqOriginalRandom = window.__dqOriginalRandom || Math.random; Math.random = () => 0;`);
    try {
      for (let i = 1; i <= 7; i += 1) {
        await sleep(120);
        const before = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
        const key = i % 2 ? fixture.forward : fixture.back;
        await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(key)}, bubbles: true }));`);
        await waitFor(cdp, `window.DreamQuestDebug.getState().steps === ${before.steps + 1}`, 3000);
        const battle = await evalPage(cdp, `window.DreamQuestDebug.getBattle()`);
        assert(!battle, `Encounter Dial fired before 8 steps at move ${i}.`);
      }
      await sleep(120);
      const before = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
      const key = fixture.back;
      await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(key)}, bubbles: true }));`);
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()) && window.DreamQuestDebug.getState().steps === ${before.steps + 1}`, 3000);
    } finally {
      await evalPage(cdp, `
        if (window.__dqOriginalRandom) Math.random = window.__dqOriginalRandom;
        if (window.DreamQuestDebug.getBattle()) window.DreamQuestDebug.endBattle();
        window.DreamQuestDebug.setEncounterStepInterval(null);
      `);
    }
  });

  test("music transitions keep one active source", async () => {
    const targets = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const themeForArea = (areaId) => {
        if (["krendon", "breshen"].includes(areaId)) return "town";
        if (["krendonShop", "tealsburgShop"].includes(areaId)) return "shop";
        if (["tealsburg", "marketMaze"].includes(areaId)) return "market";
        if (["krendonRoad", "oldMill", "kingsHighway", "northernPath"].includes(areaId)) return "road";
        if (areaId === "skyShrine") return "shrine";
        if (areaId === "moonMarsh") return "marsh";
        if (areaId === "deepForest") return "deepForest";
        if (areaId === "glassCaves") return "glass";
        if (areaId === "rathskellerApproach") return "approach";
        const parent = data.areaWorldParents[areaId] || areaId;
        if (parent === "marhynCastle" || areaId === "rathskeller") return "dungeon";
        const terrain = data.areas[areaId]?.theme;
        if (terrain === "town") return "town";
        if (terrain === "mountain") return "mountain";
        if (terrain === "water") return "water";
        if (terrain === "tree") return "forest";
        if (terrain === "sand") return "sand";
        if (terrain === "path") return "road";
        if (terrain === "floor" || ["darhynCastle", "rathskeller"].includes(areaId) || parent === "marhynCastle") return "castle";
        return "field";
      };
      const seenTracks = new Set();
      const result = [];
      for (const areaId of Object.keys(data.areas)) {
        const theme = themeForArea(areaId);
        const track = data.musicTrackThemeMap[theme];
        if (!track || seenTracks.has(track)) continue;
        seenTracks.add(track);
        result.push(areaId);
        if (result.length >= 5) break;
      }
      return result;
    })()`);
    assert(targets.length >= 3, "Music test needs several area themes with mapped tracks.");
    for (const areaId of targets) {
      await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(areaId)})`);
      await sleep(220);
      const music = await evalPage(cdp, `window.DreamQuestDebug.getMusicDebug()`);
      assert(music.activeTrackKeys.length <= 1, `Expected at most one active music track after traveling to ${areaId}, got ${music.activeTrackKeys.join(", ")}.`);
      assert(!(music.timerActive && music.activeTrackKeys.length > 0), `Synth timer and audio track were both active after traveling to ${areaId}.`);
    }
    await closeDialogue(cdp);
  });

  test("duplicate enemies use counted plural names", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.startBattle(["chomonster", "chomonster"])`);
    await waitFor(cdp, `!document.querySelector("#battle").classList.contains("is-hidden") && Boolean(window.DreamQuestDebug.getBattle())`);
    const labels = await evalPage(cdp, `(() => ({
      enemyName: document.querySelector("#enemy-name")?.textContent || "",
      battleLog: document.querySelector("#battle-log")?.textContent || ""
    }))()`);
    assert(labels.enemyName === "2 Cho Monsters", `Expected counted enemy name, got ${labels.enemyName}.`);
    assert(labels.battleLog === "2 Cho Monsters appear!", `Expected counted battle intro, got ${labels.battleLog}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`);
  });

  test("Lithar uses Capture to end the scripted battle", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true }); window.DreamQuestDebug.startBattle("lithar1")`);
    try {
      await waitFor(cdp, `!document.querySelector("#battle").classList.contains("is-hidden") && Boolean(window.DreamQuestDebug.getBattle())`);
      const queued = await evalPage(cdp, `(() => {
        let count = 0;
        for (let i = 0; i < 6; i += 1) {
          const button = document.querySelector('#battle-party [data-member-action="attack"]:not(:disabled)');
          if (!button) break;
          button.click();
          count += 1;
        }
        return count;
      })()`);
      assert(queued > 0, "Lithar test should queue at least one Fight action.");
      await click(cdp, '.battle-actions [data-action="execute"]');
      await waitFor(cdp, `document.querySelector("#battle-log")?.textContent.includes("uses Capture")`, 6000);
      await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden") && !window.DreamQuestDebug.getBattle()`, 10000);
      const finalLog = await evalPage(cdp, `document.querySelector("#battle-log")?.textContent || ""`);
      assert(/captured/i.test(finalLog), `Lithar scripted loss should say the party was captured, got ${finalLog}.`);
    } finally {
      await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false }); if (window.DreamQuestDebug.getBattle()) window.DreamQuestDebug.endBattle();`);
    }
  });

  test("Derlin rescue uses a visible cell door and the cell key", async () => {
    const result = await evalPage(cdp, `(() => {
      const area = window.DreamQuestData.areas.marhynDerlinTower;
      const derlin = area.events.find((event) => event.id === "free_derlin");
      const cellDoor = area.events.find((event) => event.id === "derlin_cell_door");
      const locked = area.events.find((event) => event.id === "derlin_locked_cell");
      const doorChar = derlin ? area.map[derlin.y]?.[derlin.x - 1] : "";
      const doorKind = window.DreamQuestData.tileInfo[doorChar]?.[0] || "";
      return {
        derlin,
        cellDoor,
        locked: Boolean(locked),
        doorChar,
        doorKind
      };
    })()`);
    assert(result.derlin, "Derlin rescue event should exist in the east tower.");
    assert(result.cellDoor?.x === result.derlin.x - 1 && result.cellDoor?.y === result.derlin.y, `Derlin cell door event should sit in front of him, got ${JSON.stringify(result.cellDoor)}.`);
    assert(result.locked, "Derlin locked-cell event should exist before Old Yan is freed.");
    assert(result.doorChar === "+" && result.doorKind === "door", `Expected a visible door before Derlin's cell, got ${JSON.stringify(result)}.`);

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("marhynDerlinTower", 19, 1);
      window.DreamQuestDebug.setPartyMembers(["tarthur", "yanOld"]);
      window.DreamQuestDebug.setStoryFlag("yanFreed", true);
      window.DreamQuestDebug.setStoryFlag("marhynKeyring", true);
      window.DreamQuestDebug.setInventoryItem("Derlin Cell Key", 0);
      window.DreamQuestDebug.triggerEventById("derlin_cell_door");
    })()`);
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    let text = await evalPage(cdp, `document.querySelector("#dialogue-text")?.textContent || ""`);
    assert(text.includes("keyring opened the tower") || text.includes("separate key"), `Derlin cell door should explain the keyring is not the cell key, got ${JSON.stringify(text)}.`);
    await closeDialogue(cdp);
    let party = await evalPage(cdp, `window.DreamQuestDebug.getState().party.map((member) => member.id)`);
    assert(!party.includes("derlin"), "Derlin should not join until the Derlin Cell Key is found.");

    await evalPage(cdp, `window.DreamQuestDebug.setInventoryItem("Derlin Cell Key", 1); window.DreamQuestDebug.triggerEventById("derlin_cell_door")`);
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    await closeDialogue(cdp);
    party = await evalPage(cdp, `window.DreamQuestDebug.getState().party.map((member) => member.id)`);
    assert(party.includes("derlin"), "Derlin should join after using the Derlin Cell Key on the visible cell door.");
  });

  test("Marhyn dungeon panel doors are unique and reciprocal", async () => {
    const result = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const areaIds = Object.keys(data.areas).filter((id) => id === "marhynCastle" || data.areaWorldParents[id] === "marhynCastle");
      const missingDoorEvents = [];
      const duplicateDestinations = [];
      const badPairs = [];
      const unreachableTargets = [];
      const links = [];
      const destinationCounts = new Map();
      const key = (...parts) => parts.join(":");
      const blocked = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);
      const reachableTiles = (area) => {
        const start = area.start || [1, 1];
        const seen = new Set([key(start[0], start[1])]);
        const queue = [start];
        for (let i = 0; i < queue.length; i += 1) {
          const [x, y] = queue[i];
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            const tile = area.map[ny]?.[nx];
            const tileKey = key(nx, ny);
            if (!tile || blocked.has(tile) || seen.has(tileKey)) return;
            seen.add(tileKey);
            queue.push([nx, ny]);
          });
        }
        return seen;
      };
      const addLink = (link) => {
        links.push(link);
        const destKey = key(link.to, link.x, link.y);
        destinationCounts.set(destKey, (destinationCounts.get(destKey) || 0) + 1);
      };
      areaIds.forEach((areaId) => {
        const area = data.areas[areaId];
        const reachable = reachableTiles(area);
        area.map.forEach((row, y) => {
          [...row].forEach((tile, x) => {
            if (tile !== "+") return;
            const event = (area.events || []).find((candidate) => candidate.icon === "+" && candidate.x === x && candidate.y === y);
            if (!event) missingDoorEvents.push(\`\${areaId}@\${x},\${y}\`);
          });
        });
        (area.events || []).forEach((event) => {
          if (!reachable.has(key(event.x, event.y))) unreachableTargets.push(\`\${areaId}:\${event.id}@\${event.x},\${event.y}\`);
          if (!event.doorLink) return;
          addLink({
            id: event.doorLink.id,
            area: areaId,
            sourceX: event.x,
            sourceY: event.y,
            to: event.doorLink.to,
            x: event.doorLink.x,
            y: event.doorLink.y
          });
        });
        (area.exits || []).forEach((exit) => {
          if (exit.doorLink?.source && !reachable.has(key(exit.doorLink.source[0], exit.doorLink.source[1]))) {
            unreachableTargets.push(\`\${areaId}:exit:\${exit.edge}@\${exit.doorLink.source[0]},\${exit.doorLink.source[1]}\`);
          }
          if (!exit.doorLink) return;
          addLink({
            id: exit.doorLink.id,
            area: areaId,
            sourceX: exit.doorLink.source?.[0],
            sourceY: exit.doorLink.source?.[1],
            to: exit.to,
            x: exit.x,
            y: exit.y
          });
        });
      });
      destinationCounts.forEach((count, dest) => {
        if (count > 1) duplicateDestinations.push(dest);
      });
      const byId = links.reduce((groups, link) => {
        (groups[link.id] ||= []).push(link);
        return groups;
      }, {});
      Object.entries(byId).forEach(([id, group]) => {
        if (group.length !== 2) {
          badPairs.push(\`\${id}: expected 2 links, got \${group.length}\`);
          return;
        }
        group.forEach((link) => {
          const peer = group.find((candidate) => candidate !== link);
          const distance = Math.abs(link.x - peer.sourceX) + Math.abs(link.y - peer.sourceY);
          if (link.to !== peer.area || distance !== 1) {
            badPairs.push(\`\${id}: \${link.area} lands at \${link.to}@\${link.x},\${link.y}, not beside \${peer.area}@\${peer.sourceX},\${peer.sourceY}\`);
          }
        });
      });
      return { missingDoorEvents, duplicateDestinations, badPairs, unreachableTargets, linkCount: links.length };
    })()`);
    assert(result.missingDoorEvents.length === 0, `Every visible Marhyn + door should have an event: ${result.missingDoorEvents.join(", ")}.`);
    assert(result.duplicateDestinations.length === 0, `Different Marhyn doors should not land on the same tile: ${result.duplicateDestinations.join(", ")}.`);
    assert(result.badPairs.length === 0, `Marhyn panel doors should be reciprocal: ${result.badPairs.join("; ")}.`);
    assert(result.unreachableTargets.length === 0, `Marhyn events and exits should be reachable from their panel starts: ${result.unreachableTargets.join(", ")}.`);
    assert(result.linkCount >= 10, `Expected the Marhyn panel graph to cover the dungeon doors, got ${result.linkCount} links.`);
  });

  test("Old Yan right-walk frames face right", async () => {
    const result = await evalPage(cdp, `(() => ({
      left: window.DreamQuestDebug.getCharacterFrameDebug("yanOld", "left", 0),
      right: window.DreamQuestDebug.getCharacterFrameDebug("yanOld", "right", 0),
      idleRight: window.DreamQuestDebug.getCharacterFrameDebug("yanOld", "right", 9999)
    }))()`);
    assert(result.left.row === 2 && result.left.col === 4 && result.left.mirrored === false, `Old Yan left-walk should use unmirrored left-facing sheet frames, got ${JSON.stringify(result.left)}.`);
    assert(result.right.row === 2 && result.right.col === 0 && result.right.mirrored === true, `Old Yan right-walk should mirror the sheet's side frames, got ${JSON.stringify(result.right)}.`);
    assert(result.idleRight.row === 0 && result.idleRight.col === 2 && result.idleRight.mirrored === true, `Old Yan's debug frame should include the renderer's effective right-idle mirror, got ${JSON.stringify(result.idleRight)}.`);
  });

  test("Valena uses complete right-facing battle and walk frames", async () => {
    const result = await evalPage(cdp, `(() => ({
      idle: window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 9999),
      walk: [0.05, 0.3, 0.55, 0.8].map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 40, { walkProgress })),
      attack: window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 80, { action: "attack", progress: 0.4 }),
      cast: window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 80, { action: "cast", progress: 0.4 }),
      heal: window.DreamQuestDebug.getCharacterFrameDebug("valena", "down", 80, { action: "cast", effectType: "heal", progress: 0.4 }),
      hurt: window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 80, { action: "hurt" }),
      victory: window.DreamQuestDebug.getCharacterFrameDebug("valena", "right", 80, { action: "victory" })
    }))()`);
    assert(result.idle.col === 1 && result.idle.row === 0 && result.idle.mirrored, `Valena's right idle should mirror her complete left profile, got ${JSON.stringify(result.idle)}.`);
    assert(result.walk.every((frame) => frame.row === 2 && [4, 6].includes(frame.col) && frame.mirrored), `Valena's right walk should avoid fragment-bearing side cells, got ${JSON.stringify(result.walk)}.`);
    assert(result.attack.row === 3 && result.attack.mirrored, `Valena's right attack should face the enemy, got ${JSON.stringify(result.attack)}.`);
    assert(result.cast.row === 3 && [1, 4].includes(result.cast.col) && result.cast.mirrored, `Valena's right cast should use a complete mirrored magic pose, got ${JSON.stringify(result.cast)}.`);
    assert(result.heal.row === 4 && [5, 6].includes(result.heal.col) && !result.heal.mirrored, `Valena's down-facing heal should stay front-facing, got ${JSON.stringify(result.heal)}.`);
    assert(result.hurt.col === 1 && result.hurt.row === 0 && result.hurt.mirrored, `Valena's hurt pose should stay oriented toward the enemy, got ${JSON.stringify(result.hurt)}.`);
    assert(result.victory.col === 6 && result.victory.row === 0 && result.victory.clipBottomRatio === 0, `Valena's victory pose should use the intact clasped frame without gown clipping, got ${JSON.stringify(result.victory)}.`);
  });

  test("playable battle frame profiles avoid missing and backward actor cells", async () => {
    const result = await evalPage(cdp, `(() => {
      const frame = (id, facing, options) => window.DreamQuestDebug.getCharacterFrameDebug(id, facing, 80, options);
      const phases = [0.01, 0.18, 0.35, 0.51, 0.68, 0.85];
      return {
        yvonneRight: phases.map((progress) => frame("yvonne", "right", { action: "attack", progress })),
        yvonneLeft: phases.map((progress) => frame("yvonne", "left", { action: "attack", progress })),
        yvonnePotion: frame("yvonne", "down", { action: "cast", effectType: "potion", progress: 0.5 }),
        dalinLeftIdle: window.DreamQuestDebug.getCharacterFrameDebug("dalin", "left", 9999),
        dalinLeftAttack: phases.map((progress) => frame("dalin", "left", { action: "attack", progress })),
        dalinHeal: frame("dalin", "down", { action: "cast", effectType: "heal", progress: 0.5 }),
        dalinHurt: frame("dalin", "right", { action: "hurt" }),
        oldYanAttack: frame("yanOld", "right", { action: "attack", progress: 0.5 }),
        yanLeftAttack: phases.map((progress) => frame("yan", "left", { action: "attack", progress })),
        yanHurt: frame("yan", "right", { action: "hurt" }),
        valenaLeftAttack: phases.map((progress) => frame("valena", "left", { action: "attack", progress })),
        valenaUpWalk: phases.slice(0, 4).map((walkProgress) => frame("valena", "up", { walkProgress }))
      };
    })()`);
    assert(result.yvonneRight.map((entry) => entry.col).join(",") === "0,1,2,3,2,1" && result.yvonneRight.every((entry) => entry.row === 3 && !entry.mirrored), `Yvonne's right attack must retain an actor in every frame, got ${JSON.stringify(result.yvonneRight)}.`);
    assert(result.yvonneLeft.map((entry) => entry.col).join(",") === "0,1,2,3,2,1" && result.yvonneLeft.every((entry) => entry.row === 3 && entry.mirrored), `Yvonne's left attack should mirror the complete canonical sequence, got ${JSON.stringify(result.yvonneLeft)}.`);
    assert(result.yvonnePotion.row === 0 && result.yvonnePotion.col === 0, `Yvonne should face front while using a potion, got ${JSON.stringify(result.yvonnePotion)}.`);
    assert(result.dalinLeftIdle.row === 0 && result.dalinLeftIdle.col === 2 && result.dalinLeftIdle.mirrored, `Dalin's duplicate right profile should be mirrored for left idle, got ${JSON.stringify(result.dalinLeftIdle)}.`);
    assert(result.dalinLeftAttack.every((entry) => entry.row === 3 && entry.mirrored), `Dalin's left attacks should mirror his canonical attack row, got ${JSON.stringify(result.dalinLeftAttack)}.`);
    assert(result.dalinHeal.row === 4 && [1, 4].includes(result.dalinHeal.col), `Dalin should use his leaf-heal artwork, got ${JSON.stringify(result.dalinHeal)}.`);
    assert(result.dalinHurt.crop.left === 9, `Dalin's hurt crop should remove the unrelated green sliver, got ${JSON.stringify(result.dalinHurt)}.`);
    assert(result.oldYanAttack.row === 0 && result.oldYanAttack.col === 2 && result.oldYanAttack.mirrored, `Old Yan should use his clean mirrored pointing profile, got ${JSON.stringify(result.oldYanAttack)}.`);
    assert(result.yanLeftAttack.every((entry) => entry.row === 3 && entry.mirrored), `Yan's left attack should mirror his canonical attack row instead of using dragon art, got ${JSON.stringify(result.yanLeftAttack)}.`);
    assert(result.yanHurt.row === 0 && result.yanHurt.col === 2, `Yan's hurt state should keep a complete enemy-facing actor frame, got ${JSON.stringify(result.yanHurt)}.`);
    assert(result.valenaLeftAttack.every((entry) => entry.row === 3 && !entry.mirrored), `Valena's left attack should use her complete source sequence without reversing it, got ${JSON.stringify(result.valenaLeftAttack)}.`);
    assert(result.valenaUpWalk.every((entry) => entry.row === 1 && [4, 6].includes(entry.col) && entry.crop.right === 24), `Valena's up walk should avoid duplicate-body cells and crop the edge fragment, got ${JSON.stringify(result.valenaUpWalk)}.`);
  });

  test("Yan returns once whether the map scene or Fear battle resolves first", async () => {
    const placement = await evalPage(cdp, `(() => {
      const events = window.DreamQuestData.areas.kingsHighway.events;
      const returnEvent = events.find((event) => event.id === "yan_returns");
      const fearEvent = events.find((event) => event.id === "fear_creature");
      return { returnY: returnEvent.y, fearY: fearEvent.y, returnX: returnEvent.x, fearX: fearEvent.x };
    })()`);
    assert(placement.returnX === placement.fearX && placement.returnY < placement.fearY, `Yan's map return should be on the required approach before Fear, got ${JSON.stringify(placement)}.`);

    const alreadyReturned = await evalPage(cdp, `(async () => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "yan"]);
      window.DreamQuestDebug.setStoryFlag("yanReturned", true);
      window.DreamQuestDebug.setCompletedEvent("yan_returns", true);
      window.DreamQuestDebug.startBattle("fear");
      const log = document.querySelector("#battle-log");
      const messages = [];
      const observer = new MutationObserver(() => messages.push(log.textContent));
      observer.observe(log, { childList: true, subtree: true, characterData: true });
      await window.DreamQuestDebug.triggerFearYanWarning();
      observer.disconnect();
      const state = window.DreamQuestDebug.getState();
      window.DreamQuestDebug.endBattle();
      return { messages, yan: state.party.filter((member) => member.id === "yan").length, oldYan: state.party.filter((member) => member.id === "yanOld").length };
    })()`);
    assert(alreadyReturned.yan === 1 && alreadyReturned.oldYan === 0, `An existing Yan return should not duplicate party members, got ${JSON.stringify(alreadyReturned)}.`);
    assert(!alreadyReturned.messages.some((message) => message.includes("tears into the battle")), `Fear should not announce Yan's return twice, got ${JSON.stringify(alreadyReturned.messages)}.`);

    const battleFallback = await evalPage(cdp, `(async () => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "yanOld"]);
      window.DreamQuestDebug.setStoryFlag("yanReturned", false);
      window.DreamQuestDebug.setCompletedEvent("yan_returns", false);
      window.DreamQuestDebug.startBattle("fear");
      await window.DreamQuestDebug.triggerFearYanWarning();
      const state = window.DreamQuestDebug.getState();
      window.DreamQuestDebug.endBattle();
      return { returned: state.flags.yanReturned, completed: state.completedEvents.yan_returns, ids: state.party.map((member) => member.id) };
    })()`);
    assert(battleFallback.returned && battleFallback.completed && battleFallback.ids.includes("yan") && !battleFallback.ids.includes("yanOld"), `Fear fallback should complete the same return milestone, got ${JSON.stringify(battleFallback)}.`);
  });

  test("loaded follower trails retain coordinates on large maps", async () => {
    const result = await evalPage(cdp, `(() => {
      const save = window.DreamQuestDebug.freshState();
      save.areaId = "kingsHighway";
      save.x = 11;
      save.y = 15;
      save.partyTrail = [{ areaId: "kingsHighway", x: 21, y: 15, facing: "left", movedAt: Date.now() }];
      return window.DreamQuestDebug.normalizeState(save).partyTrail[0];
    })()`);
    assert(result.x === 21 && result.y === 15, `Large-map trail coordinates should survive normalization, got ${JSON.stringify(result)}.`);
  });

  test("Tealsburg shop exits beside its market doorway", async () => {
    const result = await evalPage(cdp, `(() => {
      const market = window.DreamQuestData.areas.marketMaze;
      const door = market.events.find((event) => event.id === "market_shop_door");
      const exit = window.DreamQuestData.areas.tealsburgShop.exits.find((entry) => entry.to === "marketMaze");
      return { door: [door.x, door.y], target: [exit.x, exit.y], tile: market.map[exit.y][exit.x] };
    })()`);
    const distance = Math.abs(result.door[0] - result.target[0]) + Math.abs(result.door[1] - result.target[1]);
    assert(distance === 1 && result.tile !== "#", `Shop return should land beside its entrance, got ${JSON.stringify(result)}.`);
  });

  test("Tustor resurrection keeps Chairman Eor visible", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("merfolkShoals")`);
    await closeDialogue(cdp);
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setStoryFlag("tustorRaised", true);
      window.DreamQuestDebug.setCompletedEvent("tustor_grave", true);
      return {
        tustor: window.DreamQuestDebug.getEventMotion("tustor_grave"),
        chairman: window.DreamQuestDebug.getEventMotion("chairman_eor"),
        chairmanPatrol: window.DreamQuestDebug.getEventPatrolTiles("chairman_eor"),
        chairmanStationary: window.DreamQuestData.stationaryNpcEventIds.has("chairman_eor"),
        merwizardLeftWalk: window.DreamQuestDebug.getCharacterFrameDebug("merwizard", "left", 0),
        merwizardRightWalk: window.DreamQuestDebug.getCharacterFrameDebug("merwizard", "right", 0),
        eorLeftWalk: window.DreamQuestDebug.getCharacterFrameDebug("chairmanEor", "left", 0),
        eorRightWalk: window.DreamQuestDebug.getCharacterFrameDebug("chairmanEor", "right", 0)
      };
    })()`);
    assert(result.tustor, "Tustor should remain visible after the resurrection.");
    assert(result.tustor.moving === false && result.tustor.elapsed >= 9999, "Tustor should idle instead of walking in place after resurrection.");
    assert(result.merwizardLeftWalk.row === 2 && result.merwizardLeftWalk.col === 4, `Merwizard left-walk should use swim frames, got ${JSON.stringify(result.merwizardLeftWalk)}.`);
    assert(result.merwizardRightWalk.row === 2 && result.merwizardRightWalk.col === 0, `Merwizard right-walk should use swim frames, got ${JSON.stringify(result.merwizardRightWalk)}.`);
    assert(result.merwizardLeftWalk.crop.top >= 16 && result.merwizardLeftWalk.crop.bottom >= 20, `Merwizard side frames should crop sheet guide lines, got ${JSON.stringify(result.merwizardLeftWalk.crop)}.`);
    assert(result.eorLeftWalk.row === 2 && result.eorLeftWalk.col === 4, `Eor left-walk should use swim frames, got ${JSON.stringify(result.eorLeftWalk)}.`);
    assert(result.eorRightWalk.row === 2 && result.eorRightWalk.col === 0, `Eor right-walk should use swim frames, got ${JSON.stringify(result.eorRightWalk)}.`);
    assert(result.eorLeftWalk.crop.top >= 16 && result.eorLeftWalk.crop.bottom >= 20, `Eor side frames should crop sheet guide lines, got ${JSON.stringify(result.eorLeftWalk.crop)}.`);
    assert(result.chairman, "Chairman Eor should remain visible after Tustor appears.");
    assert(result.chairmanStationary === false, "Chairman Eor should be allowed to wander after Tustor appears.");
    assert(result.chairmanPatrol.length <= 2, "Chairman Eor should use a restrained patrol after Tustor appears.");
    assert(result.chairmanPatrol.every((tile) => tile.x === result.chairmanPatrol[0].x), "Chairman Eor should avoid side-to-side merfolk pacing.");

    await evalPage(cdp, `window.DreamQuestDebug.travelTo("tideCavern")`);
    await closeDialogue(cdp);
    const tidePatrol = await evalPage(cdp, `window.DreamQuestDebug.getEventPatrolTiles("tide_priest")`);
    assert(tidePatrol.length <= 2, "Tide Priest should use a restrained patrol.");
    assert(tidePatrol.every((tile) => tile.x === tidePatrol[0].x), "Tide Priest should avoid side-to-side merfolk pacing.");
  });

  test("Tide Cavern sluices, chest, and boss are reachable with directional bridge travel", async () => {
    const result = await evalPage(cdp, `(() => {
      if (!window.DreamQuestDebug.getState()) document.querySelector("#new-game").click();
      window.DreamQuestDebug.travelTo("tideCavern");
      window.DreamQuestDebug.setStoryFlag("tideQuest", true);
      const area = window.DreamQuestData.areas.tideCavern;
      const westSluice = area.events.find((event) => event.id === "tide_west_sluice");
      const eastSluice = area.events.find((event) => event.id === "tide_east_sluice");
      const chest = area.events.find((event) => event.id === "tide_cache");
      const boss = area.events.find((event) => event.id === "river_slime_regent");
      const priestPatrol = window.DreamQuestDebug.getEventPatrolTiles("tide_priest");
      return {
        westSluice,
        eastSluice,
        chest,
        boss,
        priestPatrol,
        westSluiceReachable: window.DreamQuestDebug.canReachTile(westSluice.x, westSluice.y),
        eastSluiceReachable: window.DreamQuestDebug.canReachTile(eastSluice.x, eastSluice.y),
        chestReachable: window.DreamQuestDebug.canReachTile(chest.x, chest.y),
        bossReachable: window.DreamQuestDebug.canReachTile(boss.x, boss.y),
        bossManhattanFromEntry: Math.abs(boss.x - area.start[0]) + Math.abs(boss.y - area.start[1])
      };
    })()`);
    assert(result.westSluiceReachable, `Tide Cavern western sluice should be reachable at ${result.westSluice.x},${result.westSluice.y}.`);
    assert(result.eastSluiceReachable, `Tide Cavern eastern sluice should be reachable at ${result.eastSluice.x},${result.eastSluice.y}.`);
    assert(result.priestPatrol.length === 1, `Tide Priest should remain at a single shelf tile, got ${JSON.stringify(result.priestPatrol)}.`);
    assert(result.priestPatrol.every((tile) => tile.y !== 8 || tile.x < 7 || tile.x > 14), "Tide Priest should not patrol onto the one-tile central bridge.");
    assert(result.chestReachable, `Tide Cavern chest should be reachable at ${result.chest.x},${result.chest.y}.`);
    assert(result.bossReachable, `River Slime Regent should be reachable at ${result.boss.x},${result.boss.y}.`);
    assert(!(result.boss.x === 11 && result.boss.y === 8), "River Slime Regent should no longer stand on the entrance bridge.");
    assert(result.bossManhattanFromEntry >= 8, "River Slime Regent should require a short walk into Tide Cavern.");
  });

  test("standalone innkeepers ask before charging gold", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("merfolkShoals")`);
    await closeDialogue(cdp);
    const innkeeperMotion = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion("merfolk_innkeeper")`);
    assert(innkeeperMotion?.moving === false, "Merfolk innkeeper should not wander.");
    assert(innkeeperMotion?.elapsed >= 9999, `Merfolk innkeeper should render an idle frame, got ${JSON.stringify(innkeeperMotion)}.`);
    assert(innkeeperMotion?.facing === "down", `Merfolk innkeeper should hold a stable forward pose, got ${innkeeperMotion?.facing}.`);
    await evalPage(cdp, `window.DreamQuestDebug.setGold(20)`);
    const before = await evalPage(cdp, `window.DreamQuestDebug.getState().gold`);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("merfolk_innkeeper")`);
    assert(opened, "Could not trigger the merfolk innkeeper.");
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector("[data-inn-stay]"))`);
    let state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.gold === before, `Talking to the innkeeper should not spend gold before a choice; expected ${before}, got ${state.gold}.`);
    await click(cdp, "[data-inn-cancel]");
    await waitFor(cdp, `document.querySelector("#menu-modal").classList.contains("is-hidden")`);
    state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.gold === before, `Leaving the inn prompt should not spend gold; expected ${before}, got ${state.gold}.`);

    await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("merfolk_innkeeper")`);
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector("[data-inn-stay]"))`);
    await click(cdp, "[data-inn-stay]");
    await waitFor(cdp, `window.DreamQuestDebug.getState().gold === ${before - 12}`);
    await closeDialogue(cdp);
  });

  test("shop prices show gold icons", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("krendonShop")`);
    await closeDialogue(cdp);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("krendon_shop_counter")`);
    assert(opened, "Could not open Krendon shop counter.");
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && document.querySelectorAll("[data-shop-buy]").length > 0`);
    const result = await evalPage(cdp, `(() => {
      const goldCanvases = [...document.querySelectorAll('#menu-content canvas[data-shop-icon="item:gold"]')];
      const buyButtons = [...document.querySelectorAll('#menu-content button[data-shop-buy]')];
      const painted = goldCanvases.some((canvas) => {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true;
        }
        return false;
      });
      return {
        purseIcon: Boolean(document.querySelector(".shop-gold-total canvas[data-shop-icon='item:gold']")),
        buyButtonCount: buyButtons.length,
        buyButtonsWithGold: buyButtons.filter((button) => button.querySelector('canvas[data-shop-icon="item:gold"]')).length,
        painted
      };
    })()`);
    assert(result.purseIcon, "Shop purse total should show the gold icon.");
    assert(result.buyButtonCount > 0 && result.buyButtonsWithGold === result.buyButtonCount, "Every shop buy button should show a gold icon.");
    assert(result.painted, "At least one shop gold icon canvas should be painted.");
    await click(cdp, "#close-menu");
  });

  test("stationary NPCs use idle frames while talking", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("krendonShop")`);
    await closeDialogue(cdp);
    const before = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion("krendon_shopkeeper")`);
    assert(before && before.moving === false, "Krendon shopkeeper should be stationary before dialogue.");
    assert(before.elapsed >= 9999, `Stationary NPC should render idle before dialogue, got elapsed ${before.elapsed}.`);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("krendon_shopkeeper")`);
    assert(opened, "Could not trigger Krendon shopkeeper dialogue.");
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    const during = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion("krendon_shopkeeper")`);
    assert(during && during.moving === false, "Krendon shopkeeper should stay stationary during dialogue.");
    assert(during.elapsed >= 9999, `Stationary NPC should stay on idle frames during dialogue, got elapsed ${during.elapsed}.`);
    await closeDialogue(cdp);
  });

  test("Breshen sells VS Armor as expensive equipment", async () => {
    const dataCheck = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      return {
        breshenPrice: data.shops.breshen?.items.find((offer) => offer.item === "VS Armor")?.cost || 0,
        tealsburgHasVsArmor: Boolean(data.shops.tealsburg?.items.some((offer) => offer.item === "VS Armor")),
        freeVsArmorEvent: Object.values(data.areas).some((area) =>
          (area.events || []).some((event) => event.id === "vs_armor")
        )
      };
    })()`);
    assert(dataCheck.breshenPrice === 999, `VS Armor should cost 999 gold in Breshen, got ${dataCheck.breshenPrice}.`);
    assert(!dataCheck.tealsburgHasVsArmor, "Tealsburg should not sell VS Armor.");
    assert(!dataCheck.freeVsArmorEvent, "VS Armor should not still exist as the old free pickup event.");

    await evalPage(cdp, `window.DreamQuestDebug.travelTo("breshen")`);
    await closeDialogue(cdp);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("breshen_armor_seller")`);
    assert(opened, "Could not open Breshen armor seller.");
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector('[data-shop-buy="VS Armor"]'))`);
    const result = await evalPage(cdp, `(() => {
      const row = [...document.querySelectorAll(".shop-row")]
        .find((candidate) => candidate.querySelector("[data-shop-buy]")?.dataset.shopBuy === "VS Armor");
      const icon = row?.querySelector("canvas.shop-item-icon");
      const data = icon?.getContext("2d").getImageData(0, 0, icon.width, icon.height).data || [];
      let painted = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          painted = true;
          break;
        }
      }
      return {
        title: document.querySelector(".shop-note strong")?.textContent || "",
        copy: row?.querySelector(".shop-item-copy small")?.textContent || "",
        iconKey: icon?.dataset.shopIcon || "",
        aria: row?.querySelector("[data-shop-buy]")?.getAttribute("aria-label") || "",
        painted
      };
    })()`);
    assert(result.title === "Breshen Royal Armory", `Expected Breshen Royal Armory, got ${result.title}.`);
    assert(result.iconKey === "armor:vs", `VS Armor should render as armor art, got ${result.iconKey}.`);
    assert(result.copy.includes("Breshen") || result.copy.includes("Valena's Secret"), `VS Armor should use armor copy, got ${result.copy}.`);
    assert(result.aria.includes("999 gold"), `VS Armor buy button should announce 999 gold, got ${result.aria}.`);
    assert(result.painted, "VS Armor shop icon should be painted.");
    await click(cdp, "#close-menu");
  });

  test("party skills unlock by level and requirements", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("krendon");
      window.DreamQuestDebug.setStoryFlag("waterSpellDream", true);
      window.DreamQuestDebug.setInventoryItem("Zoom Shell", 0);
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.setMemberLevel("tarthur", 1);
      window.DreamQuestDebug.openMenu("inventory");
    })()`);
    let result = await evalPage(cdp, `(() => ({
      skills: window.DreamQuestDebug.getAvailableSkills("tarthur").map((skill) => skill.id),
      zoomPanel: Boolean(document.querySelector(".zoom-travel-list"))
    }))()`);
    assert(result.skills.includes("stealishSlash"), "Tarthur should keep his starter skill.");
    assert(!result.skills.includes("waterOrbEcho"), "Water Orb Echo should not unlock at level 1.");
    assert(!result.skills.includes("zoom"), "Zoom should not unlock at level 1.");
    assert(!result.zoomPanel, "Zoom Travel should stay hidden before the Zoom spell or a Zoom Shell exists.");

    await evalPage(cdp, `window.DreamQuestDebug.setMemberLevel("tarthur", 2)`);
    result = await evalPage(cdp, `window.DreamQuestDebug.getAvailableSkills("tarthur").map((skill) => skill.id)`);
    assert(result.includes("waterOrbEcho"), "Water Orb Echo should unlock once Tarthur reaches level 2 and has the Water Orb Spell.");
    assert(!result.includes("zoom"), "Zoom should wait for its later level gate.");

    await evalPage(cdp, `window.DreamQuestDebug.setMemberLevel("tarthur", 8); window.DreamQuestDebug.openMenu("inventory")`);
    result = await evalPage(cdp, `(() => ({
      skills: window.DreamQuestDebug.getAvailableSkills("tarthur").map((skill) => skill.id),
      zoomPanel: Boolean(document.querySelector(".zoom-travel-list"))
    }))()`);
    assert(result.skills.includes("zoom"), "Zoom should unlock once Tarthur reaches level 8 and has the Water Orb Spell.");
    assert(result.zoomPanel, "Zoom Travel should appear after someone can cast Zoom.");

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["dalin", "yan", "yvonne", "valena"]);
      window.DreamQuestDebug.setMemberLevel("dalin", 10);
      window.DreamQuestDebug.setMemberLevel("yan", 15);
      window.DreamQuestDebug.setMemberLevel("yvonne", 13);
      window.DreamQuestDebug.setMemberLevel("valena", 14);
      window.DreamQuestDebug.setInventoryItem("Wind Spell", 1);
      window.DreamQuestDebug.setInventoryItem("Scribe Pass", 1);
      window.DreamQuestDebug.setInventoryItem("Sky Charm", 1);
    })()`);
    result = await evalPage(cdp, `(() => Object.fromEntries(["dalin", "yan", "yvonne", "valena"].map((id) => [
      id,
      window.DreamQuestDebug.getAvailableSkills(id).map((skill) => skill.id)
    ])))()`);
    assert(result.dalin.join(",") === "leafmend", `Dalin should join with only Leafmend, got ${result.dalin.join(",")}.`);
    assert(result.yan.includes("dragonShape") && result.yan.includes("windSpell"), `Yan should learn Wind Spell immediately when the item is acquired, got ${result.yan.join(",")}.`);
    assert(result.yvonne.join(",") === "charmShot", `Yvonne should join with only Charm Shot, got ${result.yvonne.join(",")}.`);
    assert(result.valena.join(",") === "sacredBranch", `Valena should join with only Sacred Branch, got ${result.valena.join(",")}.`);

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setMemberLevel("dalin", 15);
      window.DreamQuestDebug.setMemberLevel("yan", 18);
      window.DreamQuestDebug.setMemberLevel("yvonne", 16);
      window.DreamQuestDebug.setMemberLevel("valena", 17);
    })()`);
    result = await evalPage(cdp, `(() => Object.fromEntries(["dalin", "yan", "yvonne", "valena"].map((id) => [
      id,
      window.DreamQuestDebug.getAvailableSkills(id).map((skill) => skill.id)
    ])))()`);
    assert(result.dalin.includes("princeVolley") && result.dalin.includes("lifeleaf") && result.dalin.includes("canopyMend"), "Dalin should grow into bow, revive, and group heal skills.");
    assert(result.yan.includes("scaleRake") && result.yan.includes("windSpell"), "Yan should later add Scale Rake while retaining Wind Spell.");
    assert(result.yvonne.includes("lockpickVolley") && result.yvonne.includes("royalRefund"), "Yvonne should unlock stronger crossbow skills by level.");
    assert(result.valena.includes("sacredReturn") && result.valena.includes("starleafWard") && result.valena.includes("branchBloom"), "Valena should unlock revive, ward, and group heal skills by level.");
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(window.DreamQuestData.gameConfig.startPartyIds || ["tarthur"]);
      window.DreamQuestDebug.setMemberLevel("tarthur", 1);
      window.DreamQuestDebug.setInventoryItem("Wind Spell", 0);
      window.DreamQuestDebug.setInventoryItem("Scribe Pass", 0);
      window.DreamQuestDebug.setInventoryItem("Sky Charm", 0);
      window.DreamQuestDebug.closeMenu();
    })()`);
  });

  test("joke level setting changes treasure narration", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("krendon"); window.DreamQuestDebug.setCompletedEvent("krendon_chest", false); window.DreamQuestDebug.openMenu("settings")`);
    await waitFor(cdp, `document.querySelector("[data-menu-tab].is-active")?.dataset.menuTab === "settings"`);
    await click(cdp, '[data-joke-level="low"]');
    await waitFor(cdp, `window.DreamQuestDebug.getSettings().jokeLevel === "low"`);
    await click(cdp, "#close-menu");

    let opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("krendon_chest")`);
    assert(opened, "Could not trigger Krendon chest with low joke setting.");
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    let text = await evalPage(cdp, `document.querySelector("#dialogue-text")?.textContent || ""`);
    assert(text === "The chest contains 18 gold and a potion.", `Low joke level should use direct treasure text, got ${JSON.stringify(text)}.`);
    await closeDialogue(cdp);

    await evalPage(cdp, `window.DreamQuestDebug.setCompletedEvent("krendon_chest", false); window.DreamQuestDebug.setJokeLevel("high")`);
    opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("krendon_chest")`);
    assert(opened, "Could not trigger Krendon chest with high joke setting.");
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    text = await evalPage(cdp, `document.querySelector("#dialogue-text")?.textContent || ""`);
    assert(text.includes("The barn remains undefeated."), `High joke level should use the extra treasure joke, got ${JSON.stringify(text)}.`);
    await closeDialogue(cdp);
  });

  test("Water Orb terminology distinguishes the dream spell and focus from the true Orb", async () => {
    const result = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const spellGuide = data.guideData.spells.find((entry) => entry.name === "Water Orb Spell")?.text || "";
      const focusGuide = data.guideData.accessories.find((entry) => entry.name === "Water Orb Focus")?.text || "";
      return {
        acquisition: data.waterOrbAcquisitionText,
        cutsceneAlt: data.cutsceneImages.waterOrbWarp.alt,
        spellGuide,
        focusGuide
      };
    })()`);
    Object.entries(result.acquisition).forEach(([level, text]) => {
      assert(text.includes("Water Orb Spell") && text.includes("focus"), `${level} acquisition text should name the spell and focus: ${text}`);
      assert(/not the Orb itself|no physical Orb/i.test(text), `${level} acquisition text should deny that the chest contains the true Orb: ${text}`);
    });
    assert(result.cutsceneAlt.includes("spell focus"), `Cutscene alt text should describe a spell focus, got ${result.cutsceneAlt}.`);
    assert(result.spellGuide.includes("not the physical Water Orb") && result.focusGuide.includes("not the Water Orb itself"), `Guide terminology should remain explicit, got ${JSON.stringify(result)}.`);
  });

  test("Low tone rewrites major story and area dialogue beyond treasure text", async () => {
    const serious = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setJokeLevel("low");
      const lines = [
        "I am Lithar Lifehater. My armor has blades because subtlety lost a committee vote.",
        "Tarthur wakes alone. Somewhere deeper in the dungeon, someone is still breathing loudly enough to become a quest objective.",
        "I still hate life, but I respect your DPS.",
        "The player-triggered Power of Air still fills the chamber. Yan holds the spell together until Darhyn's broken shadow finally disperses.",
        "Can the merfolk also explain why the cow has boss music?"
      ];
      return {
        lines: lines.map((line) => window.DreamQuestDebug.previewDialogueText(line)),
        castle: window.DreamQuestDebug.previewAreaIntro("marhynCastle"),
        finalRoad: window.DreamQuestDebug.previewAreaIntro("rathskellerApproach")
      };
    })()`);
    const seriousCopy = serious.lines.join(" ");
    ["committee", "quest objective", "DPS", "player-triggered", "boss music"].forEach((term) => {
      assert(!seriousCopy.includes(term), `Low tone should remove ${term} from major scenes, got ${seriousCopy}.`);
    });
    assert(serious.lines[0].includes("Queen Marhyn") && serious.lines[1].includes("familiar voice") && serious.lines[3].startsWith("The Power of Air"), `Low dialogue should retain story and character intent, got ${JSON.stringify(serious.lines)}.`);
    assert(!serious.castle.includes("aggressively") && !serious.finalRoad.includes("manual"), `Low area introductions should stay grounded, got ${JSON.stringify(serious)}.`);
    const normal = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setJokeLevel("normal");
      return window.DreamQuestDebug.previewDialogueText("I still hate life, but I respect your DPS.");
    })()`);
    assert(normal.includes("DPS"), `Normal tone should retain the default comic voice, got ${normal}.`);
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("settings")`);
    const settingsCopy = await evalPage(cdp, `document.querySelector("#menu-content")?.textContent || ""`);
    assert(settingsCopy.includes("Story Tone") && settingsCopy.includes("Grounded") && settingsCopy.includes("Playful"), `Tone control should use player-facing labels, got ${settingsCopy}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("interior room exits show edge cues", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("krendonShop")`);
    await closeDialogue(cdp);
    await sleep(120);
    const result = await evalPage(cdp, `(() => {
      const area = window.DreamQuestData.areas.krendonShop;
      const state = window.DreamQuestDebug.getState();
      const canvas = document.querySelector("#map-canvas");
      const ctx = canvas.getContext("2d");
      const tile = 64;
      const rows = area.map;
      const blocked = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const mapPixelWidth = rows[0].length * tile;
      const mapPixelHeight = rows.length * tile;
      const minX = -tile;
      const minY = -tile;
      const maxX = Math.max(minX, mapPixelWidth - canvas.width + tile);
      const maxY = Math.max(minY, mapPixelHeight - canvas.height + tile);
      const cameraX = clamp(state.x * tile + tile / 2 - canvas.width / 2, minX, maxX);
      const cameraY = clamp(state.y * tile + tile / 2 - canvas.height / 2, minY, maxY);
      const exitX = [...rows[rows.length - 1]].findIndex((char) => char && !blocked.has(char));
      const sampleX = Math.round(exitX * tile + tile / 2 - cameraX);
      const sampleY = Math.round(rows.length * tile + 17 - cameraY);
      const image = ctx.getImageData(sampleX - 28, sampleY - 24, 56, 48).data;
      let goldPixels = 0;
      for (let i = 0; i < image.length; i += 4) {
        const r = image[i];
        const g = image[i + 1];
        const b = image[i + 2];
        const a = image[i + 3];
        if (a > 80 && r > 170 && g > 135 && b < 130) goldPixels += 1;
      }
      return { sampleX, sampleY, goldPixels };
    })()`);
    assert(result.goldPixels > 12, `Expected visible gold room-exit cue near bottom edge, got ${JSON.stringify(result)}.`);
  });

  test("Star Shrine map renders shrine-specific decor", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("skyShrine")`);
    await closeDialogue(cdp);
    await sleep(160);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const canvas = document.querySelector("#map-canvas");
      const ctx = canvas.getContext("2d");
      const tile = 64;
      const mapPixelWidth = window.DreamQuestData.areas.skyShrine.map[0].length * tile;
      const mapPixelHeight = window.DreamQuestData.areas.skyShrine.map.length * tile;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const cameraX = clamp(state.x * tile + tile / 2 - canvas.width / 2, -tile, Math.max(-tile, mapPixelWidth - canvas.width + tile));
      const cameraY = clamp(state.y * tile + tile / 2 - canvas.height / 2, -tile, Math.max(-tile, mapPixelHeight - canvas.height + tile));
      const sampleX = Math.round(11 * tile + tile / 2 - cameraX);
      const sampleY = Math.round(8 * tile + tile / 2 - cameraY);
      const image = ctx.getImageData(sampleX - 98, sampleY - 86, 196, 172).data;
      let bluePixels = 0;
      let goldPixels = 0;
      let paleStonePixels = 0;
      for (let i = 0; i < image.length; i += 4) {
        const r = image[i];
        const g = image[i + 1];
        const b = image[i + 2];
        const a = image[i + 3];
        if (a > 80 && b > 145 && g > 110 && b > r + 20) bluePixels += 1;
        if (a > 80 && r > 170 && g > 135 && b < 130) goldPixels += 1;
        if (a > 80 && r > 175 && g > 168 && b > 145 && Math.abs(r - g) < 34) paleStonePixels += 1;
      }
      return { sampleX, sampleY, bluePixels, goldPixels, paleStonePixels };
    })()`);
    assert(result.bluePixels > 80, `Star Shrine should include blue shrine accents, got ${JSON.stringify(result)}.`);
    assert(result.goldPixels > 60, `Star Shrine should include gold star trim, got ${JSON.stringify(result)}.`);
    assert(result.paleStonePixels > 900, `Star Shrine should include a pale stone terrace, got ${JSON.stringify(result)}.`);
  });

  test("NPC dialogue freezes the speaking NPC", async () => {
    const fixture = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      for (const [areaId, area] of Object.entries(data.areas)) {
        const event = (area.events || []).find((candidate) => (
          data.eventSpriteKind[candidate.icon] === "npc"
          && !candidate.boss
          && !candidate.hidden
          && !data.stationaryNpcEventIds.has(candidate.id)
          && Array.isArray(candidate.lines)
          && candidate.lines.length > 0
        ));
        if (event) return { areaId, eventId: event.id };
      }
      return null;
    })()`);
    assert(fixture?.areaId && fixture?.eventId, "Test data needs at least one moving NPC with dialogue.");
    await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(fixture.areaId)})`);
    await closeDialogue(cdp);
    const triggered = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById(${JSON.stringify(fixture.eventId)})`);
    assert(triggered, `Could not trigger NPC event ${fixture.eventId}.`);
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`);
    const first = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion(${JSON.stringify(fixture.eventId)})`);
    await sleep(650);
    const second = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion(${JSON.stringify(fixture.eventId)})`);
    assert(first && second, `Could not read NPC motion for ${fixture.eventId}.`);
    assert(second.moving === false, "Speaking NPC should be in an idle state while dialogue is open.");
    assert(
      Math.abs(first.x - second.x) < 0.001
        && Math.abs(first.y - second.y) < 0.001
        && first.tileX === second.tileX
        && first.tileY === second.tileY,
      `Speaking NPC moved during dialogue: ${JSON.stringify({ first, second })}.`
    );
    await closeDialogue(cdp);
    const afterClose = await evalPage(cdp, `window.DreamQuestDebug.getEventMotion(${JSON.stringify(fixture.eventId)})`);
    assert(afterClose, `Could not read NPC motion after dialogue for ${fixture.eventId}.`);
    const jump = Math.hypot(afterClose.x - second.x, afterClose.y - second.y);
    assert(jump < 6, `Speaking NPC jumped after dialogue closed: ${JSON.stringify({ beforeClose: second, afterClose, jump })}.`);
  });

  test("keyboard movement keeps map player in viewport", async () => {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 900,
      height: 520,
      deviceScaleFactor: 1,
      mobile: false
    });
    try {
      await evalPage(cdp, `window.scrollTo(0, 0);`);
      await sleep(120);
      const before = await evalPage(cdp, `(() => {
        const state = window.DreamQuestDebug.getState();
        const area = window.DreamQuestData.areas[state.areaId];
        const tile = area.map[state.y + 1]?.[state.x] || "";
        return {
          scrollY: window.scrollY,
          x: state.x,
          y: state.y,
          canMoveDown: Boolean(tile) && !new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]).has(tile)
        };
      })()`);
      assert(before.canMoveDown, "Scroll test needs a passable tile below the player.");
      await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));`);
      await waitFor(cdp, `(() => {
        const state = window.DreamQuestDebug.getState();
        return state.x === ${before.x} && state.y === ${before.y + 1};
      })()`, 3000);
      const viewport = await evalPage(cdp, `window.DreamQuestDebug.getMapViewport()`);
      assert(viewport, "Could not inspect the player's map viewport position after keyboard movement.");
      assert(
        viewport.y >= viewport.top - 1 && viewport.y <= viewport.bottom + 1,
        `Expected keyboard movement to keep the player inside the safe viewport: ${JSON.stringify(viewport)}.`
      );
    } finally {
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await evalPage(cdp, `window.scrollTo(0, 0);`);
    }
  });

  test("menu opens, KO heal item stays disabled, revive item works", async () => {
    const fixture = await recoveryFixture(cdp);
    assert(fixture.healId && fixture.healInventory, "Test data needs a configured field heal item.");
    assert(fixture.reviveId && fixture.reviveInventory, "Test data needs a configured revive item.");
    assert(fixture.memberId, "Test data needs a configured party member.");
    await evalPage(cdp, `(() => {
      const fixture = ${JSON.stringify(fixture)};
      window.DreamQuestDebug.setInventoryItem(fixture.healInventory, 1);
      window.DreamQuestDebug.setInventoryItem(fixture.reviveInventory, 1);
      window.DreamQuestDebug.setPartyVitals(fixture.memberId, 0, 0);
      window.DreamQuestDebug.openMenu("inventory");
    })()`);
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && document.querySelector("#menu-modal").contains(document.activeElement)`);
    const controls = await evalPage(cdp, `(() => {
      const fixture = ${JSON.stringify(fixture)};
      const buttonFor = (itemId) => [...document.querySelectorAll("[data-field-item][data-field-target]")]
        .find((button) => button.dataset.fieldItem === itemId && button.dataset.fieldTarget === fixture.memberId);
      return {
        healDisabled: buttonFor(fixture.healId)?.disabled,
        reviveDisabled: buttonFor(fixture.reviveId)?.disabled
      };
    })()`);
    assert(controls.healDisabled === true, `${fixture.healInventory} should not be usable on a KO party member.`);
    assert(controls.reviveDisabled === false, `${fixture.reviveInventory} should be usable on a KO party member.`);
    const clicked = await evalPage(cdp, `(() => {
      const fixture = ${JSON.stringify(fixture)};
      const button = [...document.querySelectorAll("[data-field-item][data-field-target]")]
        .find((candidate) => candidate.dataset.fieldItem === fixture.reviveId && candidate.dataset.fieldTarget === fixture.memberId);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(clicked, `Could not click ${fixture.reviveInventory} for ${fixture.memberId}.`);
    await waitFor(cdp, `window.DreamQuestDebug.getState().party.find((member) => member.id === ${JSON.stringify(fixture.memberId)}).hp > 0`);
    const state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert((state.inventory[fixture.reviveInventory] || 0) === 0, `${fixture.reviveInventory} should be consumed.`);
    assert(state.inventory[fixture.healInventory] === 1, `${fixture.healInventory} should not be consumed by revive.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("battle can start, resolve, and award rewards", async () => {
    const fixture = await battleFixture(cdp);
    assert(fixture?.areaId && fixture?.enemyId, "Test data needs at least one battle enemy.");
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true }); window.DreamQuestDebug.travelTo(${JSON.stringify(fixture.areaId)});`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.startBattle(${JSON.stringify(fixture.enemyId)})`);
    await waitFor(cdp, `!document.querySelector("#battle").classList.contains("is-hidden") && Boolean(window.DreamQuestDebug.getBattle())`);
    await waitFor(cdp, `document.activeElement?.matches('#battle-party [data-member-action="attack"]:not(:disabled)')`);
    const battleUi = await evalPage(cdp, `(() => ({
      mainActions: [...document.querySelectorAll(".battle-actions button:not(.is-hidden)")].map((button) => button.dataset.action),
      focusedAction: document.activeElement?.dataset?.memberAction || document.activeElement?.dataset?.action || "",
      memberSwitchButtons: document.querySelectorAll('#battle-party [data-member-action="switch"]').length,
      memberSwitchSelects: document.querySelectorAll("#battle-party [data-switch-select]").length
    }))()`);
    assert(JSON.stringify(battleUi.mainActions) === JSON.stringify(["auto", "run", "party", "undo", "execute"]), "Battle footer should expose Auto, Run, Party, Undo, and Execute Round.");
    assert(battleUi.focusedAction === "attack", "Battle should initially focus the first available Fight button.");
    assert(battleUi.memberSwitchButtons === 0 && battleUi.memberSwitchSelects === 0, "Member cards should not render switch controls.");
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `Boolean(document.querySelector(".battle-party-switch-panel"))`);
    const queued = await evalPage(cdp, `(() => {
      let count = 0;
      for (let i = 0; i < 6; i += 1) {
        const button = document.querySelector('#battle-party [data-member-action="attack"]:not(:disabled)');
        if (!button) break;
        button.click();
        count += 1;
      }
      return count;
    })()`);
    assert(queued > 0, "Battle test should queue at least one Fight action.");
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 8000);
    const reward = await evalPage(cdp, `window.DreamQuestDebug.getBattle().reward`);
    assert(reward.xp > 0 && reward.gold > 0, "Battle reward should include XP and gold.");
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
  });

  test("battle rewards enforce the level-99 cap without repeat stat gains", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["yanOld"]);
      window.DreamQuestDebug.setActivePartyIds(["yanOld"]);
      window.DreamQuestDebug.setMemberLevel("yanOld", 99);
      window.DreamQuestDebug.setMemberXp("yanOld", 2375);
      const member = window.DreamQuestDebug.getState().party.find((entry) => entry.id === "yanOld");
      window.__dqLevelCapStats = { maxHp: member.maxHp, maxMp: member.maxMp, atk: member.atk, def: member.def };
      window.DreamQuestDebug.startBattle("goblin");
      document.querySelector('[data-member-id="yanOld"][data-member-action="attack"]').click();
      document.querySelector('.battle-actions [data-action="execute"]').click();
    })()`);
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 8000);
    const result = await evalPage(cdp, `(() => {
      const member = window.DreamQuestDebug.getState().party.find((entry) => entry.id === "yanOld");
      const reward = window.DreamQuestDebug.getBattle().reward;
      return { level: member.level, xp: member.xp, stats: { maxHp: member.maxHp, maxMp: member.maxMp, atk: member.atk, def: member.def }, before: window.__dqLevelCapStats, levelMessages: reward.levelMessages };
    })()`);
    assert(result.level === 99 && result.xp === 0, `Rewards must stop at level 99, got ${JSON.stringify(result)}.`);
    assert(JSON.stringify(result.stats) === JSON.stringify(result.before), `A capped reward must not grant repeat stats, got ${JSON.stringify(result)}.`);
    assert(!result.levelMessages.some((message) => message.includes("level 100")), `Level 100 must never be announced, got ${JSON.stringify(result.levelMessages)}.`);
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false })`);
  });

  test("queued actions support targets, Undo, and explicit execution", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.startBattle(["goblin", "goblin"]);
      const target = document.querySelector('[data-enemy-target-select="tarthur"]');
      target.value = target.options[1].value;
      document.querySelector('[data-member-id="tarthur"][data-member-action="attack"]').click();
    })()`);
    let battle = await evalPage(cdp, `window.DreamQuestDebug.getBattle()`);
    assert(battle.choices.tarthur.targetId === battle.enemies[1].instanceId, "The queued attack should retain the selected enemy instance.");
    await click(cdp, '.battle-actions [data-action="undo"]');
    battle = await evalPage(cdp, `window.DreamQuestDebug.getBattle()`);
    assert(!battle.choices.tarthur, "The sticky Undo control should clear the most recently queued action.");
    await evalPage(cdp, `(() => {
      const target = document.querySelector('[data-enemy-target-select="tarthur"]');
      target.value = target.options[1].value;
      document.querySelector('[data-member-id="tarthur"][data-member-action="attack"]').click();
    })()`);
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `!window.DreamQuestDebug.getBattle()?.busy && window.DreamQuestDebug.getBattle()?.turn >= 2`, 8000);
    battle = await evalPage(cdp, `window.DreamQuestDebug.getBattle()`);
    assert(battle.enemies[0].hp > 0 && battle.enemies[1].hp <= 0, `The selected second enemy should be defeated first, got ${JSON.stringify(battle.enemies)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle(); window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false })`);
  });

  test("queued consumables reserve their final copy", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin"]);
      window.DreamQuestDebug.setInventoryItem("Potion", 1);
      window.DreamQuestDebug.startBattle("goblin");
      document.querySelector('[data-item-select="tarthur"]').value = "potion";
      document.querySelector('[data-member-id="tarthur"][data-member-action="item"]').click();
    })()`);
    let reserved = await evalPage(cdp, `document.querySelector('[data-item-select="derlin"] option[value="potion"]')?.disabled`);
    assert(reserved === true, "The final Potion should be reserved by the first queued user.");
    await click(cdp, '[data-member-id="tarthur"][data-member-action="undo"]');
    reserved = await evalPage(cdp, `document.querySelector('[data-item-select="derlin"] option[value="potion"]')?.disabled`);
    assert(reserved === false, "Undo should release the Potion reservation.");
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("queued reserve switches cannot claim the same character twice", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena", "yan"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.startBattle("goblin");
      window.DreamQuestDebug.queueMemberAction("tarthur", "switch", { switchId: "valena" });
      window.DreamQuestDebug.queueMemberAction("derlin", "switch", { switchId: "valena" });
      const battle = window.DreamQuestDebug.getBattle();
      const output = { first: battle.choices.tarthur?.memberId, second: battle.choices.derlin?.memberId || null };
      window.DreamQuestDebug.endBattle();
      return output;
    })()`);
    assert(result.first === "valena" && result.second === null, `One reserve cannot be queued twice, got ${JSON.stringify(result)}.`);
  });

  test("executed reserve switches finish the round and re-enable combat", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.startBattle("goblin");
      window.DreamQuestDebug.setEnemyDefense(0, 999);
      window.DreamQuestDebug.queueMemberAction("tarthur", "switch", { switchId: "valena" });
      ["derlin", "dalin", "yvonne"].forEach((id) => window.DreamQuestDebug.queueMemberAction(id, "attack"));
    })()`);
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `!window.DreamQuestDebug.getBattle()?.busy && window.DreamQuestDebug.getBattle()?.turn >= 2`, 8000);
    const result = await evalPage(cdp, `(() => ({
      activeIds: window.DreamQuestDebug.getState().activePartyIds,
      battle: window.DreamQuestDebug.getBattle(),
      cards: [...document.querySelectorAll("#battle-party .battle-party-card strong:first-child")].map((node) => node.textContent),
      executeDisabled: document.querySelector("#execute-round")?.disabled,
      partyDisabled: document.querySelector('[data-action="party"]')?.disabled
    }))()`);
    assert(JSON.stringify(result.activeIds) === JSON.stringify(["valena", "derlin", "dalin", "yvonne"]), `The reserve should replace the outgoing member in place, got ${JSON.stringify(result.activeIds)}.`);
    assert(!result.battle.busy && result.battle.turn >= 2 && Object.keys(result.battle.choices).length === 0, `A switch round must return combat to an idle state, got ${JSON.stringify(result.battle)}.`);
    assert(result.cards.includes("Valena") && !result.cards.includes("Tarthur") && !result.partyDisabled, `The battle UI should rerender the new lineup and restore controls, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle(); window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false })`);
  });

  test("KO frontliners can be replaced immediately", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.setPartyVitals("tarthur", 0, 0);
      window.DreamQuestDebug.startBattle("goblin");
      document.querySelector('.battle-actions [data-action="party"]').click();
      const select = document.querySelector('[data-battle-switch-select="tarthur"]');
      select.value = "valena";
      document.querySelector('[data-battle-switch="tarthur"]').click();
    })()`);
    const result = await evalPage(cdp, `(() => ({
      active: window.DreamQuestDebug.getState().activePartyIds,
      cards: [...document.querySelectorAll("#battle-party .battle-party-card strong:first-child")].map((node) => node.textContent),
      busy: window.DreamQuestDebug.getBattle()?.busy
    }))()`);
    assert(result.active.includes("valena") && !result.active.includes("tarthur"), `Healthy Valena should replace KO Tarthur, got ${JSON.stringify(result.active)}.`);
    assert(result.cards.includes("Valena") && !result.cards.includes("Tarthur") && result.busy === false, `The KO switch should immediately rerender a usable battle, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("victory XP summary omits reserve XP when no reserve receives it", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.startBattle("mole");
      window.DreamQuestDebug.getState().activePartyIds.forEach((id) => window.DreamQuestDebug.queueMemberAction(id, "attack"));
      document.querySelector('.battle-actions [data-action="execute"]').click();
    })()`);
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 8000);
    const summary = await evalPage(cdp, `(() => ({
      text: document.querySelector(".battle-reward-grid > div:first-child strong")?.textContent || "",
      reserveRecipientIds: window.DreamQuestDebug.getBattle().reward.reserveRecipientIds,
      partyActions: document.querySelector("#battle-stage")?.dataset.partyActions || ""
    }))()`);
    assert(!summary.text.includes("reserve") && summary.reserveRecipientIds.length === 0, `Reserve XP should be omitted without an eligible reserve, got ${JSON.stringify(summary)}.`);
    assert(["tarthur", "derlin", "dalin", "yvonne"].every((id) => summary.partyActions.includes(`${id}:victory`)), `Living party members should use their victory poses on the reward screen, got ${JSON.stringify(summary)}.`);
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
  });

  test("reserves gain catch-up XP", async () => {
    const reserveBefore = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: true, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      const state = window.DreamQuestDebug.getState();
      const reserve = state.party.find((member) => !state.activePartyIds.includes(member.id));
      return { id: reserve.id, xp: reserve.xp };
    })()`);
    await evalPage(cdp, `window.DreamQuestDebug.startBattle("mole")`);
    await evalPage(cdp, `window.DreamQuestDebug.getState().activePartyIds.forEach((id) => window.DreamQuestDebug.queueMemberAction(id, "attack"))`);
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 8000);
    const result = await evalPage(cdp, `(() => ({
      xp: window.DreamQuestDebug.getState().party.find((member) => member.id === ${JSON.stringify(reserveBefore.id)}).xp,
      summary: document.querySelector(".battle-reward-grid > div:first-child strong")?.textContent || "",
      reserveRecipientIds: window.DreamQuestDebug.getBattle().reward.reserveRecipientIds
    }))()`);
    assert(result.xp - reserveBefore.xp === Math.ceil(8 * 0.6), `Reserve ${reserveBefore.id} should gain 60% XP, before ${reserveBefore.xp}, after ${result.xp}.`);
    assert(result.summary.includes("reserve") && result.reserveRecipientIds.includes(reserveBefore.id), `Reserve XP should be shown when awarded, got ${JSON.stringify(result)}.`);
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false })`);
  });

  test("equipment offers favor eligible active members over reserves", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "yvonne", "valena"]);
      window.DreamQuestDebug.setInventoryItem("Elven Leafmail", 0);
      window.DreamQuestDebug.equipGear("dalin", "armor", "Travel Clothes");
      window.DreamQuestDebug.equipGear("valena", "armor", "Travel Clothes");
      window.DreamQuestDebug.addItem("Elven Leafmail", 1);
    })()`);
    await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden")`, 5000);
    const offer = await evalPage(cdp, `(() => ({
      name: document.querySelector("#item-modal-name")?.textContent,
      text: document.querySelector("#item-modal-text")?.textContent,
      equipLabel: document.querySelector("#item-modal-equip")?.textContent
    }))()`);
    assert(offer.name === "Elven Leafmail" && offer.equipLabel === "Equip on Valena" && offer.text.includes("Valena"), `Active Valena should be recommended ahead of reserve Dalin, got ${JSON.stringify(offer)}.`);
    await click(cdp, "#item-modal-close");
    await waitFor(cdp, `document.querySelector("#item-modal").classList.contains("is-hidden")`);
  });

  test("Hano recruitment gear uses one loadout summary with a combined equip choice", async () => {
    const rewardNames = ["Hano's Hammer", "Elven Leafmail", "Valena's Branch Guard", "Moonbranch Scepter"];
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena", "yan"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "yvonne", "valena"]);
      ${JSON.stringify(rewardNames)}.forEach((name) => window.DreamQuestDebug.setInventoryItem(name, 0));
      window.DreamQuestDebug.equipGear("dalin", "weapon", "Elven Bow");
      window.DreamQuestDebug.equipGear("dalin", "armor", "Travel Clothes");
      window.DreamQuestDebug.equipGear("valena", "weapon", "Sacred Branch");
      window.DreamQuestDebug.equipGear("valena", "armor", "Travel Clothes");
      const offer = { offerGroup: "valena-breshen-loadout", offerTitle: "Valena's Breshen Loadout", recruitId: "valena" };
      ${JSON.stringify(rewardNames)}.forEach((name) => window.DreamQuestDebug.addItem(name, 1, offer));
    })()`);
    await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden")`, 5000);
    const summary = await evalPage(cdp, `(() => ({
      kicker: document.querySelector("#item-modal-kicker")?.textContent,
      title: document.querySelector("#item-modal-name")?.textContent,
      text: document.querySelector("#item-modal-text")?.textContent || "",
      equipLabel: document.querySelector("#item-modal-equip")?.textContent
    }))()`);
    assert(summary.kicker === "Recruit Loadout" && summary.title === "Valena's Breshen Loadout", `Recruit gear should use one loadout summary, got ${JSON.stringify(summary)}.`);
    assert(rewardNames.every((name) => summary.text.includes(name)), `The loadout summary should list every granted item, got ${JSON.stringify(summary)}.`);
    assert(summary.equipLabel === "Equip recommended", `The grouped reward should preserve a combined equip choice, got ${JSON.stringify(summary)}.`);
    await click(cdp, "#item-modal-equip");
    await waitFor(cdp, `document.querySelector("#item-modal").classList.contains("is-hidden")`);
    await sleep(500);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return {
        modalHidden: document.querySelector("#item-modal").classList.contains("is-hidden"),
        inventory: Object.fromEntries(${JSON.stringify(rewardNames)}.map((name) => [name, state.inventory[name] || 0])),
        valena: state.equipment.valena,
        dalin: state.equipment.dalin
      };
    })()`);
    assert(result.modalHidden, `The grouped loadout should not leave more reward modals queued, got ${JSON.stringify(result)}.`);
    assert(Object.values(result.inventory).every((count) => count === 1), `All Hano rewards should remain granted after equipping, got ${JSON.stringify(result.inventory)}.`);
    assert(result.valena.weapon === "Moonbranch Scepter" && result.valena.armor === "Valena's Branch Guard", `The combined choice should equip Valena's personal loadout, got ${JSON.stringify(result.valena)}.`);
  });

  test("deferred equipment offers do not leak into a newly loaded game", async () => {
    const rewardNames = ["Hano's Hammer", "Elven Leafmail", "Valena's Branch Guard", "Moonbranch Scepter"];
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.say([["Valena", "Hold this dialogue while the old reward offer waits."]]);
      const offer = { offerGroup: "valena-breshen-loadout", offerTitle: "Valena's Breshen Loadout", recruitId: "valena" };
      ${JSON.stringify(rewardNames)}.forEach((name) => window.DreamQuestDebug.addItem(name, 1, offer));
      window.__dqOriginalConfirm = window.confirm;
      window.confirm = () => true;
      document.querySelector("#new-game").click();
      window.confirm = window.__dqOriginalConfirm;
      delete window.__dqOriginalConfirm;
    })()`);
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === window.DreamQuestData.gameConfig.startAreaId`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    await sleep(500);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return {
        modalHidden: document.querySelector("#item-modal").classList.contains("is-hidden"),
        inventory: Object.fromEntries(${JSON.stringify(rewardNames)}.map((name) => [name, state.inventory[name] || 0]))
      };
    })()`);
    assert(result.modalHidden && Object.values(result.inventory).every((count) => count === 0), `A deferred reward offer must be discarded when runtime state changes, got ${JSON.stringify(result)}.`);
  });

  test("Water Orb reward cards wait through the warp and remain in order", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.closeMenu();
      window.DreamQuestDebug.setCreatorFlags({ enabled: false, noEnemies: false });
      window.DreamQuestDebug.travelTo("darhynCastle", 12, 3);
      window.DreamQuestDebug.setStoryFlag("dreamDarhynDefeated", true);
      window.DreamQuestDebug.setCompletedEvent("water_orb", false);
      window.DreamQuestDebug.setInventoryItem("Water Orb Spell", 0);
      window.DreamQuestDebug.setInventoryItem("Water Orb Focus", 0);
      window.DreamQuestDebug.triggerEventById("water_orb");
    })()`);
    await waitFor(cdp, `!document.querySelector("#cutscene").classList.contains("is-hidden")`, 4000);
    await click(cdp, "#cutscene-skip");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.pendingTransition?.eventId === "water_orb" && !document.querySelector("#dialogue").classList.contains("is-hidden")`, 4000);
    await closeDialogue(cdp);
    await sleep(450);
    let result = await evalPage(cdp, `(() => ({
      transition: window.DreamQuestDebug.getState()?.pendingTransition?.eventId,
      effect: document.querySelector("#screen-effect").classList.contains("is-water-orb"),
      itemHidden: document.querySelector("#item-modal").classList.contains("is-hidden")
    }))()`);
    assert(result.transition === "water_orb" && result.effect && result.itemHidden, `Reward cards must not preempt the Water Orb transition, got ${JSON.stringify(result)}.`);
    await waitFor(cdp, `!document.querySelector("#cutscene").classList.contains("is-hidden")`, 3000);
    await click(cdp, "#cutscene-skip");
    await closeDialogue(cdp);
    try {
      await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden")`, 3000);
    } catch {
      const runtime = await evalPage(cdp, `(() => ({ state: window.DreamQuestDebug.getState(), ui: window.DreamQuestDebug.getUiRuntime(), visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => !dialog.classList.contains("is-hidden")).map((dialog) => dialog.id) }))()`);
      throw new Error(`Water Orb rewards did not resume after the warp: ${JSON.stringify(runtime)}`);
    }
    const first = await evalPage(cdp, `document.querySelector("#item-modal-name")?.textContent`);
    assert(first === "Water Orb Spell", `The first deferred reward should be Water Orb Spell, got ${first}.`);
    await click(cdp, "#item-modal-close");
    await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden") && document.querySelector("#item-modal-name")?.textContent === "Water Orb Focus"`, 3000);
    await click(cdp, "#item-modal-close");
    await waitFor(cdp, `document.querySelector("#item-modal").classList.contains("is-hidden")`);
    result = await evalPage(cdp, `(() => ({
      pending: window.DreamQuestDebug.getState().pendingTransition,
      spell: window.DreamQuestDebug.getState().inventory["Water Orb Spell"],
      focus: window.DreamQuestDebug.getState().inventory["Water Orb Focus"]
    }))()`);
    assert(!result.pending && result.spell === 1 && result.focus === 1, `Both Water Orb rewards should remain granted after the ordered cards, got ${JSON.stringify(result)}.`);
  });

  test("equipment copies have one owner and Light Sword ignores defense", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin"]);
      window.DreamQuestDebug.setInventoryItem("Light Sword", 1);
      window.DreamQuestDebug.equipGear("tarthur", "weapon", "Light Sword");
      window.DreamQuestDebug.equipGear("derlin", "weapon", "Light Sword");
    })()`);
    let state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.equipment.tarthur.weapon === "Light Sword" && state.equipment.derlin.weapon !== "Light Sword", `One Light Sword cannot have two wearers: ${JSON.stringify(state.equipment)}.`);
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.startBattle("goblin");
      window.DreamQuestDebug.setEnemyDefense(0, 999);
      document.querySelector('[data-member-action="attack"]').click();
    })()`);
    const hpBefore = await evalPage(cdp, `window.DreamQuestDebug.getBattle().enemies[0].hp`);
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `!window.DreamQuestDebug.getBattle()?.busy && window.DreamQuestDebug.getBattle()?.turn >= 2`, 8000);
    const hpAfter = await evalPage(cdp, `window.DreamQuestDebug.getBattle().enemies[0].hp`);
    assert(hpBefore - hpAfter > 1, `Light Sword should ignore 999 defense, damage was ${hpBefore - hpAfter}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("Darhyn Auto pauses at entry and reserves Wind Spell for the final phase", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false, oneHitEnemies: false, infiniteHp: false });
      window.DreamQuestDebug.setPartyMembers(["yan"]);
      window.DreamQuestDebug.setMemberLevel("yan", 15);
      window.DreamQuestDebug.setInventoryItem("Wind Spell", 1);
      window.DreamQuestDebug.setPartyVitals("yan", 999, 6);
      window.DreamQuestDebug.startBattle("goblin");
      document.querySelector("#auto-battle").click();
      const autoWasOn = window.DreamQuestDebug.getBattle().auto;
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.startBattle("darhyn");
      const bossAuto = window.DreamQuestDebug.getBattle().auto;
      const bossLog = document.querySelector("#battle-log").textContent;
      const earlyChoice = window.DreamQuestDebug.getAutoChoice("yan");
      window.DreamQuestDebug.setEnemyHp(0, 55);
      window.DreamQuestDebug.setPartyVitals("yan", 999, 0);
      const finalChoice = window.DreamQuestDebug.getAutoChoice("yan");
      const windOption = [...document.querySelector('[data-skill-select="yan"]').options]
        .find((option) => option.value === "windSpell");
      const output = {
        autoWasOn,
        bossAuto,
        bossLog,
        earlyChoice,
        finalChoice,
        windDisabled: windOption?.disabled,
        windLabel: windOption?.textContent || ""
      };
      window.DreamQuestDebug.endBattle();
      return output;
    })()`);
    assert(result.autoWasOn && !result.bossAuto, `Boss entry should pause carried Auto, got ${JSON.stringify(result)}.`);
    assert(result.bossLog.includes("Auto was paused for this boss"), `Boss entry should explain the pause, got ${result.bossLog}.`);
    assert(result.earlyChoice?.skillId !== "windSpell", `Auto must reserve Wind Spell above 55 HP, got ${JSON.stringify(result.earlyChoice)}.`);
    assert(result.finalChoice?.skillId === "windSpell", `Auto should prioritize Wind Spell at 55 HP, got ${JSON.stringify(result.finalChoice)}.`);
    assert(result.windDisabled === false && result.windLabel.includes("0 MP"), `The final Wind Spell should be a usable 0-MP story action, got ${JSON.stringify(result)}.`);
  });

  test("Wind Spell is the free player-triggered Darhyn finisher", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["yan"]);
      window.DreamQuestDebug.setMemberLevel("yan", 15);
      window.DreamQuestDebug.setInventoryItem("Wind Spell", 1);
      window.DreamQuestDebug.startBattle("darhyn");
      window.DreamQuestDebug.setEnemyHp(0, 55);
      window.DreamQuestDebug.setPartyVitals("yan", 999, 0);
      document.querySelector('[data-skill-select="yan"]').value = "windSpell";
      document.querySelector('[data-member-id="yan"][data-member-action="skill"]').click();
    })()`);
    const skillPresent = await evalPage(cdp, `window.DreamQuestDebug.getAvailableSkills("yan").some((skill) => skill.id === "windSpell")`);
    assert(skillPresent, "Wind Spell should be available to level-15 Yan once acquired.");
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 10000);
    const result = await evalPage(cdp, `({ battle: window.DreamQuestDebug.getBattle(), yan: window.DreamQuestDebug.getState().party.find((member) => member.id === "yan") })`);
    const battle = result.battle;
    assert(battle.finalWindUsed && battle.enemies[0].hp <= 0, "Wind Spell should explicitly finish Darhyn's Void Crown phase.");
    assert(result.yan.mp === 0, `The mandatory final cast should work without granting or spending MP, got ${result.yan.mp}.`);
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ infiniteHp: false })`);
  });

  test("Darhyn AoE promotes living reserves and Auto reaches victory", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false, oneHitEnemies: false, infiniteHp: false });
      window.DreamQuestDebug.setSettings({ fastBattle: true, battleSpeed: 3 });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne", "valena", "yan"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
      ["tarthur", "derlin", "dalin", "yvonne"].forEach((id) => window.DreamQuestDebug.setPartyVitals(id, 1, 0));
      window.DreamQuestDebug.setPartyVitals("valena", 999, 0);
      window.DreamQuestDebug.setPartyVitals("yan", 999, 0);
      window.DreamQuestDebug.setMemberLevel("yan", 15);
      window.DreamQuestDebug.setInventoryItem("Wind Spell", 1);
      window.DreamQuestDebug.startBattle("darhyn");
      window.DreamQuestDebug.setEnemyHp(0, 55);
      document.querySelector("#auto-battle").click();
    })()`);
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getBattle()?.reward)`, 20000);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const battle = window.DreamQuestDebug.getBattle();
      return {
        activeIds: state.activePartyIds,
        livingActiveIds: state.activePartyIds.filter((id) => state.party.find((member) => member.id === id)?.hp > 0),
        originalFrontHp: ["tarthur", "derlin", "dalin", "yvonne"].map((id) => state.party.find((member) => member.id === id)?.hp),
        finalWindUsed: battle.finalWindUsed,
        enemyHp: battle.enemies[0].hp
      };
    })()`);
    assert(result.originalFrontHp.every((hp) => hp <= 0), `Void Crown should KO the 1-HP front line, got ${JSON.stringify(result)}.`);
    assert(result.activeIds.includes("valena") && result.activeIds.includes("yan"), `Both living reserves should be promoted, got ${JSON.stringify(result.activeIds)}.`);
    assert(result.livingActiveIds.includes("valena") && result.livingActiveIds.includes("yan"), `Promoted reserves should be able to act, got ${JSON.stringify(result)}.`);
    assert(result.finalWindUsed && result.enemyHp <= 0, `Auto should finish instead of looping after reserve promotion, got ${JSON.stringify(result)}.`);
    await click(cdp, '.battle-actions [data-action="party"]');
    await waitFor(cdp, `document.querySelector("#battle").classList.contains("is-hidden")`, 8000);
    await evalPage(cdp, `window.DreamQuestDebug.startBattle("darhyn"); window.DreamQuestDebug.endBattle()`);
  });

  test("new recruits prompt for the four-character lineup", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne"]);
      window.DreamQuestDebug.addParty("valena");
    })()`);
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector('[data-menu-tab="characters"].is-active'))`, 5000);
    const copy = await evalPage(cdp, `document.querySelector(".menu-message")?.textContent || ""`);
    assert(copy.includes("Only four characters can be active") && copy.includes("Valena"), `Recruitment prompt should explain reserves, got ${copy}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("equipment acquisitions offer Equip now", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.setInventoryItem("Rune Sword", 0);
      window.DreamQuestDebug.equipGear("tarthur", "weapon", "Training Sword");
      window.DreamQuestDebug.addItem("Rune Sword", 1);
    })()`);
    await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden") && !document.querySelector("#item-modal-equip").classList.contains("is-hidden")`, 5000);
    await click(cdp, "#item-modal-equip");
    const weapon = await evalPage(cdp, `window.DreamQuestDebug.getState().equipment.tarthur.weapon`);
    assert(weapon === "Rune Sword", `Equip now should equip Rune Sword, got ${weapon}.`);
  });

  test("stun status and boss mechanics are per enemy and distinct", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.startBattle(["goblin", "goblin"]);
      window.DreamQuestDebug.setEnemyStun(0, 1);
      window.DreamQuestDebug.setEnemyStun(1, 0);
      const battle = window.DreamQuestDebug.getBattle();
      const data = window.DreamQuestData;
      return {
        stuns: battle.enemies.map((enemy) => enemy.stunnedTurns || 0),
        mechanics: [data.enemies.hano.mechanic, data.enemies.lithar2.mechanic, data.enemies.darhyn.mechanic],
        savannah: data.areas.savannah.encounters
      };
    })()`);
    assert(JSON.stringify(result.stuns) === JSON.stringify([1, 0]), `Stun must stay on its selected enemy, got ${JSON.stringify(result.stuns)}.`);
    assert(new Set(result.mechanics).size === 3, `Major bosses should have distinct mechanics, got ${JSON.stringify(result.mechanics)}.`);
    assert(result.savannah.includes("duneRaptor") && result.savannah.includes("windWraith") && !result.savannah.includes("chomonster"), `Savannah should use late-game enemies, got ${JSON.stringify(result.savannah)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("Befuddling Bell respects boss resistance, immunity, and cooldown", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ infiniteHp: true });
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.setInventoryItem("Befuddling Bell", 1);
      window.DreamQuestDebug.startBattle("darhyn");
      const targetId = window.DreamQuestDebug.getBattle().enemies[0].instanceId;
      window.DreamQuestDebug.queueMemberAction("tarthur", "item", { itemId: "befuddlingBell", targetId });
    })()`);
    await click(cdp, '.battle-actions [data-action="execute"]');
    await waitFor(cdp, `!window.DreamQuestDebug.getBattle()?.busy && window.DreamQuestDebug.getBattle()?.turn === 2`, 8000);
    const result = await evalPage(cdp, `(() => {
      const battle = window.DreamQuestDebug.getBattle();
      const option = document.querySelector('[data-item-select="tarthur"] option[value="befuddlingBell"]');
      window.DreamQuestDebug.queueMemberAction("tarthur", "item", { itemId: "befuddlingBell", targetId: battle.enemies[0].instanceId });
      return {
        attempts: battle.enemies[0].stunAttempts,
        readyTurn: battle.bellReadyTurn,
        currentTurn: battle.turn,
        disabled: option?.disabled,
        requeued: Boolean(window.DreamQuestDebug.getBattle().choices.tarthur)
      };
    })()`);
    assert(result.attempts === 1, `Bell should record one diminishing-return attempt, got ${JSON.stringify(result)}.`);
    assert(result.readyTurn - result.currentTurn === 2 && result.disabled && !result.requeued, `Bell should have a two-round cooldown, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle(); window.DreamQuestDebug.setCreatorFlags({ infiniteHp: false })`);
  });

  test("speed preferences persist and Fast Results is materially faster", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setSettings({ movementMs: 100, battleSpeed: 1.4, fastBattle: false });
      const normalPace = window.DreamQuestDebug.getEffectiveBattleSpeed();
      window.DreamQuestDebug.setSettings({ fastBattle: true });
      const fastPace = window.DreamQuestDebug.getEffectiveBattleSpeed();
      window.DreamQuestDebug.saveLocal();
      window.DreamQuestDebug.openMenu("settings");
      const key = window.DreamQuestData.gameConfig.saveKey;
      const saved = JSON.parse(localStorage.getItem(key));
      return { normalPace, fastPace, settings: saved.settings, movementLabel: document.querySelector('[data-movement-ms="100"]')?.textContent };
    })()`);
    assert(result.fastPace / result.normalPace >= 2.5, `Fast Results should add a major pacing multiplier, got ${JSON.stringify(result)}.`);
    assert(result.settings.movementMs === 100 && result.settings.battleSpeed === 1.4 && result.settings.fastBattle === true, `Speed preferences should persist, got ${JSON.stringify(result.settings)}.`);
    assert(result.movementLabel === "Fast", `Movement Speed should use a player-facing label, got ${result.movementLabel}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.DreamQuestDebug.setSettings({ movementMs: 140, battleSpeed: 1.4, fastBattle: false })`);
  });

  test("production HUD is decluttered and expanded settings persist", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setSettings({ musicVolume: 0.45, sfxVolume: 0.35, sfxMuted: true, reducedEffects: true, textSpeed: "standard", movementMs: 100, battleSpeed: 2 });
      window.DreamQuestDebug.saveLocal();
      window.DreamQuestDebug.openMenu("settings");
      const key = window.DreamQuestData.gameConfig.saveKey;
      const saved = JSON.parse(localStorage.getItem(key));
      return {
        removedHudControls: ["export-btn", "import-btn", "creator-btn", "walk-ms"].every((id) => !document.getElementById(id)),
        hudText: document.querySelector(".hud")?.textContent || "",
        settingsText: document.querySelector("#menu-content")?.textContent || "",
        advanced: [...document.querySelectorAll("[data-advanced-action]")].map((button) => button.dataset.advancedAction),
        saved: saved.settings,
        reducedClass: document.body.classList.contains("reduced-effects")
      };
    })()`);
    assert(result.removedHudControls && !result.hudText.includes("Export") && !result.hudText.includes("Import") && !result.hudText.includes("Movement Speed"), `Production HUD should be decluttered, got ${JSON.stringify(result)}.`);
    ["Music Volume", "SFX Volume", "Reduced Motion", "Text Speed", "Control Help", "Movement Speed", "Battle Speed"].forEach((label) => assert(result.settingsText.includes(label), `Settings should include ${label}.`));
    assert(["export", "import", "creator", "restart"].every((action) => result.advanced.includes(action)), `Advanced tools should contain file and creator actions, got ${JSON.stringify(result.advanced)}.`);
    assert(result.saved.musicVolume === 0.45 && result.saved.sfxVolume === 0.35 && result.saved.sfxMuted && result.saved.reducedEffects && result.saved.textSpeed === "standard", `Expanded settings should persist, got ${JSON.stringify(result.saved)}.`);
    assert(result.reducedClass, "Reduced Motion should apply a document-level effects class.");
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.DreamQuestDebug.setSettings({ musicVolume: 0.72, sfxVolume: 0.85, sfxMuted: false, reducedEffects: false, textSpeed: "instant", movementMs: 140, battleSpeed: 1.4 })`);
  });

  test("inventory menu separates all six item categories", async () => {
    await evalPage(cdp, `(() => {
      [["Potion", 3], ["Water Scroll", 1], ["Rune Sword", 1], ["Apprentice Guard", 1], ["Sky Charm", 1], ["VS Relic", 1]].forEach(([name, count]) => window.DreamQuestDebug.setInventoryItem(name, count));
      window.DreamQuestDebug.openMenu("inventory");
    })()`);
    const categories = await evalPage(cdp, `[...document.querySelectorAll(".inventory-category > .menu-section-head strong")].map((element) => element.textContent)`);
    ["Consumables", "Key Items", "Weapons", "Armor", "Accessories", "Relics"].forEach((category) => assert(categories.includes(category), `Inventory should include ${category}, got ${JSON.stringify(categories)}.`));
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("notable sidequest rewards use the shared acquisition dialog", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ enabled: false }); window.DreamQuestDebug.addItem("Marsh Joke Book", 1)`);
    await waitFor(cdp, `!document.querySelector("#item-modal").classList.contains("is-hidden") && document.activeElement?.id === "item-modal-close"`, 5000);
    const result = await evalPage(cdp, `(() => ({
      name: document.querySelector("#item-modal-name")?.textContent,
      kicker: document.querySelector("#item-modal-kicker")?.textContent,
      role: document.querySelector("#item-modal")?.getAttribute("role"),
      modal: document.querySelector("#item-modal")?.getAttribute("aria-modal"),
      focused: document.activeElement?.id
    }))()`);
    assert(result.name === "Marsh Joke Book" && result.kicker === "Key Item Acquired", `Sidequest rewards should use the acquisition presentation, got ${JSON.stringify(result)}.`);
    assert(result.role === "dialog" && result.modal === "true" && result.focused === "item-modal-close", `Acquisition dialog should receive accessible focus, got ${JSON.stringify(result)}.`);
    await click(cdp, "#item-modal-close");
  });

  test("first-use coaching persists and Control Help covers core systems", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.resetCoaching(); window.DreamQuestDebug.showCoach("movement")`);
    await waitFor(cdp, `!document.querySelector("#coach-modal").classList.contains("is-hidden") && document.activeElement?.id === "coach-close"`);
    let result = await evalPage(cdp, `(() => ({
      title: document.querySelector("#coach-title")?.textContent,
      focused: document.activeElement?.id,
      gameInert: document.querySelector("#game-screen")?.inert,
      seen: window.DreamQuestDebug.getState().coaching.seen.movement
    }))()`);
    assert(result.title === "Movement" && result.focused === "coach-close" && result.gameInert && result.seen, `Movement coaching should be modal, focused, and persisted, got ${JSON.stringify(result)}.`);
    await click(cdp, "#coach-close");
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("settings")`);
    result = await evalPage(cdp, `document.querySelector(".settings-help")?.textContent || ""`);
    ["Move", "Interact", "Dialogue", "Battle", "Party", "Save"].forEach((topic) => assert(result.includes(topic), `Control Help should teach ${topic}, got ${result}.`));
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.DreamQuestDebug.setCoachingEnabled(false)`);
  });

  test("movement keys advance dialogue while Next is focused", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    const before = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setSettings({ textSpeed: "instant" });
      const state = window.DreamQuestDebug.getState();
      window.DreamQuestDebug.say([["Guide", "First line."], ["Guide", "Second line."]]);
      return { x: state.x, y: state.y };
    })()`);
    await waitFor(cdp, `document.activeElement?.id === "dialogue-next" && document.querySelector("#dialogue-text")?.textContent === "First line."`);
    const result = await evalPage(cdp, `(() => {
      const event = new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true });
      document.querySelector("#dialogue-next").dispatchEvent(event);
      const state = window.DreamQuestDebug.getState();
      return {
        defaultPrevented: event.defaultPrevented,
        text: document.querySelector("#dialogue-text")?.textContent,
        focused: document.activeElement?.id,
        x: state.x,
        y: state.y
      };
    })()`);
    assert(result.defaultPrevented && result.text === "Second line." && result.focused === "dialogue-next", `ArrowRight should advance focused dialogue without its default behavior, got ${JSON.stringify(result)}.`);
    assert(result.x === before.x && result.y === before.y, `Dialogue shortcut should not move the player, got ${JSON.stringify({ before, result })}.`);
    await closeDialogue(cdp);
  });

  test("cutscene playback waits for decode and supports accessible skipping", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    const fixture = await evalPage(cdp, `(() => {
      const id = Object.keys(window.DreamQuestData.cutsceneImages)[0];
      const scene = window.DreamQuestData.cutsceneImages[id];
      const image = document.querySelector("#cutscene-image");
      window.DreamQuestDebug.setSettings({ reducedEffects: false });
      document.querySelector("#menu-btn").focus();
      window.__dqCutsceneDecode = image.decode;
      window.__dqReleaseCutsceneDecode = null;
      Object.defineProperty(image, "decode", {
        configurable: true,
        value: () => new Promise((resolve) => { window.__dqReleaseCutsceneDecode = resolve; })
      });
      window.__dqCutsceneDone = 0;
      window.DreamQuestDebug.showCutscene(id, () => { window.__dqCutsceneDone += 1; }, { duration: 700 });
      return { id, assetKey: scene.assetKey };
    })()`);
    assert(fixture?.id && fixture?.assetKey, "Cutscene test needs a configured scene.");
    await waitFor(cdp, `!document.querySelector("#cutscene").classList.contains("is-hidden") && typeof window.__dqReleaseCutsceneDecode === "function" && document.activeElement?.id === "cutscene-skip"`);
    await sleep(900);
    let result = await evalPage(cdp, `(() => ({
      visible: !document.querySelector("#cutscene").classList.contains("is-hidden"),
      loading: document.querySelector("#cutscene").classList.contains("is-loading"),
      ready: document.querySelector("#cutscene").classList.contains("is-ready"),
      done: window.__dqCutsceneDone,
      role: document.querySelector("#cutscene")?.getAttribute("role"),
      modal: document.querySelector("#cutscene")?.getAttribute("aria-modal"),
      gameInert: document.querySelector("#game-screen")?.inert,
      focused: document.activeElement?.id
    }))()`);
    assert(result.visible && result.loading && !result.ready && result.done === 0, `Cutscene countdown should not run before image decode, got ${JSON.stringify(result)}.`);
    assert(result.role === "dialog" && result.modal === "true" && result.gameInert && result.focused === "cutscene-skip", `Cutscene should be a focused modal with a visible skip control, got ${JSON.stringify(result)}.`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    assert(await evalPage(cdp, `document.activeElement?.id === "cutscene-skip"`), "Cutscene should trap keyboard focus on its available controls.");
    await evalPage(cdp, `window.__dqReleaseCutsceneDecode()`);
    await waitFor(cdp, `document.querySelector("#cutscene").classList.contains("is-ready")`);
    await click(cdp, "#cutscene-skip");
    await waitFor(cdp, `document.querySelector("#cutscene").classList.contains("is-hidden") && window.__dqCutsceneDone === 1 && document.activeElement?.id === "menu-btn"`);

    await evalPage(cdp, `(() => {
      const image = document.querySelector("#cutscene-image");
      delete image.decode;
      const data = window.DreamQuestData;
      const scene = data.cutsceneImages[${JSON.stringify(fixture.id)}];
      window.__dqCutsceneAsset = data.assets[scene.assetKey];
      data.assets[scene.assetKey] = "assets/generated/cutscenes/__missing-functional-test__.jpg";
      window.__dqCutsceneDone = 0;
      window.DreamQuestDebug.showCutscene(${JSON.stringify(fixture.id)}, () => { window.__dqCutsceneDone += 1; }, { duration: 700 });
    })()`);
    await waitFor(cdp, `document.querySelector("#cutscene").classList.contains("is-load-error") && document.querySelector("#cutscene-status")?.textContent.includes("artwork unavailable") && document.activeElement?.id === "cutscene-skip"`);
    result = await evalPage(cdp, `(() => ({ visible: !document.querySelector("#cutscene").classList.contains("is-hidden"), focused: document.activeElement?.id, status: document.querySelector("#cutscene-status")?.textContent }))()`);
    assert(result.visible && result.focused === "cutscene-skip" && result.status.includes("artwork unavailable"), `A failed cutscene image should show a skippable fallback, got ${JSON.stringify(result)}.`);
    await click(cdp, "#cutscene-skip");
    await waitFor(cdp, `window.__dqCutsceneDone === 1 && document.querySelector("#cutscene").classList.contains("is-hidden")`);
    await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const scene = data.cutsceneImages[${JSON.stringify(fixture.id)}];
      data.assets[scene.assetKey] = window.__dqCutsceneAsset;
      delete window.__dqCutsceneAsset;
      delete window.__dqCutsceneDecode;
      delete window.__dqReleaseCutsceneDecode;
      delete window.__dqCutsceneDone;
    })()`);
  });

  test("dialogs trap focus, inert the background, and Guide replaces Menu", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("quest")`);
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && document.querySelector("#menu-modal").contains(document.activeElement)`);
    let result = await evalPage(cdp, `(() => {
      const tabListRect = document.querySelector(".menu-tabs")?.getBoundingClientRect();
      const tabRect = document.querySelector(".menu-tab")?.getBoundingClientRect();
      return {
        role: document.querySelector("#menu-modal")?.getAttribute("role"),
        modal: document.querySelector("#menu-modal")?.getAttribute("aria-modal"),
        inert: document.querySelector("#game-screen")?.inert,
        focusedInside: document.querySelector("#menu-modal")?.contains(document.activeElement),
        tabListHeight: tabListRect?.height || 0,
        tabHeight: tabRect?.height || 0
      };
    })()`);
    assert(result.role === "dialog" && result.modal === "true" && result.inert && result.focusedInside, `Menu should behave as a modal dialog, got ${JSON.stringify(result)}.`);
    assert(result.tabHeight >= 40 && result.tabListHeight >= result.tabHeight, `Menu tabs should remain fully visible in a constrained-height window, got ${JSON.stringify(result)}.`);
    await click(cdp, "#menu-guide");
    await waitFor(cdp, `!document.querySelector("#guide-modal").classList.contains("is-hidden") && document.querySelector("#guide-modal").contains(document.activeElement)`);
    result = await evalPage(cdp, `(() => ({ menuHidden: document.querySelector("#menu-modal").classList.contains("is-hidden"), guideVisible: !document.querySelector("#guide-modal").classList.contains("is-hidden"), focusedInside: document.querySelector("#guide-modal").contains(document.activeElement), openDialogs: [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => !dialog.classList.contains("is-hidden")).map((dialog) => dialog.id) }))()`);
    assert(result.menuHidden && result.guideVisible && result.focusedInside && result.openDialogs.join(",") === "guide-modal", `Guide should replace Menu instead of nesting, got ${JSON.stringify(result)}.`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const trapped = await evalPage(cdp, `document.querySelector("#guide-modal").contains(document.activeElement)`);
    assert(trapped, "Tab focus should remain trapped inside the active Guide dialog.");
    await click(cdp, "#close-guide");
    await waitFor(cdp, `document.activeElement?.id === "menu-btn"`);
  });

  test("story dialogue cannot be replaced by Menu or Escape", async () => {
    await evalPage(cdp, `(() => {
      window.__dqDialogueDone = 0;
      window.DreamQuestDebug.say([["Narrator", "This callback must remain reachable."]], () => { window.__dqDialogueDone += 1; });
      document.body.tabIndex = -1;
      document.body.focus();
      window.__dqMenuOpenedDuringDialogue = window.DreamQuestDebug.openMenu("inventory");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    })()`);
    let result = await evalPage(cdp, `(() => ({
      dialogueVisible: !document.querySelector("#dialogue").classList.contains("is-hidden"),
      menuHidden: document.querySelector("#menu-modal").classList.contains("is-hidden"),
      callbackCount: window.__dqDialogueDone,
      menuResult: window.__dqMenuOpenedDuringDialogue
    }))()`);
    assert(result.dialogueVisible && result.menuHidden && result.callbackCount === 0 && result.menuResult === false, `Dialogue must remain active when Menu or Escape is attempted, got ${JSON.stringify(result)}.`);
    await click(cdp, "#dialogue-next");
    await waitFor(cdp, `window.__dqDialogueDone === 1 && document.querySelector("#dialogue").classList.contains("is-hidden")`);
    await evalPage(cdp, `delete window.__dqDialogueDone; delete window.__dqMenuOpenedDuringDialogue; document.body.removeAttribute("tabindex")`);
  });

  test("Focus Mode exits without legacy sidebar errors", async () => {
    await evalPage(cdp, `(() => {
      window.__dqFocusErrors = [];
      window.__dqFocusErrorHandler = (event) => window.__dqFocusErrors.push(event.error?.message || event.message || "unknown error");
      window.addEventListener("error", window.__dqFocusErrorHandler);
      document.querySelector("#focus-toggle").click();
    })()`);
    await waitFor(cdp, `document.querySelector("#game-screen").classList.contains("is-focus-mode")`);
    await click(cdp, "#focus-toggle");
    await waitFor(cdp, `!document.querySelector("#game-screen").classList.contains("is-focus-mode") && document.querySelector("#focus-toggle").textContent === "Full Screen"`);
    await sleep(80);
    const result = await evalPage(cdp, `(() => {
      window.removeEventListener("error", window.__dqFocusErrorHandler);
      const output = {
        errors: window.__dqFocusErrors,
        pressed: document.querySelector("#focus-toggle").getAttribute("aria-pressed"),
        hudVisible: document.querySelector(".hud").getClientRects().length > 0,
        mapVisible: document.querySelector("#map-canvas").getClientRects().length > 0
      };
      delete window.__dqFocusErrors;
      delete window.__dqFocusErrorHandler;
      return output;
    })()`);
    assert(result.errors.length === 0 && result.pressed === "false" && result.hudVisible && result.mapVisible, `Focus Mode should restore the normal UI without exceptions, got ${JSON.stringify(result)}.`);
  });

  test("local objectives follow quest mechanisms and ignore completed or locked actors", async () => {
    const result = await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      if (!debug.getState()) document.querySelector("#new-game").click();
      const objective = () => debug.getLocalObjectiveDebug()?.id || null;
      const setFlag = (name, enabled) => debug.setStoryFlag(name, enabled);
      const setDone = (id, completed) => debug.setCompletedEvent(id, completed);

      setFlag("metZelin", true);
      setFlag("milkedBetsy", false);
      setDone("zelin", true);
      debug.travelTo("krendon", 15, 15);
      const afterZelin = objective();

      debug.travelTo("krendonStable", 5, 6);
      setDone("betsy", true);
      setFlag("milkedBetsy", true);
      const afterBetsy = objective();

      setFlag("tideQuest", true);
      setFlag("tideRegentDefeated", false);
      setFlag("tideWestSluice", false);
      setFlag("tideEastSluice", false);
      setDone("tide_west_sluice", false);
      setDone("tide_east_sluice", false);
      setDone("river_slime_regent", false);
      debug.travelTo("tideCavern", 19, 8);
      const beforeSluices = objective();
      setFlag("tideWestSluice", true);
      setFlag("tideEastSluice", true);
      const afterSluices = objective();

      setFlag("valenaJoined", false);
      setFlag("hanoDefeated", false);
      setDone("valena", false);
      debug.travelTo("breshen", 11, 1);
      const breshen = objective();

      setFlag("metKing", true);
      setFlag("yvonneJoined", false);
      setFlag("yvonneBumped", false);
      setFlag("yvonneDecoyChased", false);
      setDone("king_garkin", true);
      setDone("yvonne_bump", false);
      debug.travelTo("tealsburg", 11, 1);
      const tealsburgRoute = debug.getLocalObjectiveDebug();
      const tealsburg = tealsburgRoute?.id || null;

      setFlag("windSpell", false);
      setFlag("litharDone", false);
      setDone("ten_doors", false);
      debug.travelTo("rathskeller", 15, 1);
      const rathskeller = objective();

      setFlag("yanFreed", true);
      debug.setInventoryItem("Derlin Cell Key", 0);
      setDone("derlin_locked_cell", false);
      setDone("derlin_cell_door", false);
      debug.travelTo("marhynDerlinTower", 1, 13);
      const lockedTower = objective();

      return { afterZelin, afterBetsy, beforeSluices, afterSluices, breshen, tealsburg, tealsburgRoute, rathskeller, lockedTower };
    })()`);
    assert(result.afterZelin === "krendon_stable_door", `Completed Zelin should yield to the stable objective, got ${JSON.stringify(result)}.`);
    assert(result.afterBetsy === null, `Completed Betsy should not remain a local objective, got ${JSON.stringify(result)}.`);
    assert(["tide_west_sluice", "tide_east_sluice"].includes(result.beforeSluices), `A reachable incomplete sluice should precede the locked Regent, got ${JSON.stringify(result)}.`);
    assert(result.afterSluices === "river_slime_regent", `The Regent should become the objective only after both sluices, got ${JSON.stringify(result)}.`);
    assert(result.breshen === "valena", `Breshen should point to Valena before ambient NPCs, got ${JSON.stringify(result)}.`);
    assert(result.tealsburg === "yvonne_bump", `Completed King Garkin should yield to Yvonne's active sequence, got ${JSON.stringify(result)}.`);
    assert(result.tealsburgRoute.distance === 8, `The route to Yvonne should detour around the completed king's occupied tile, got ${JSON.stringify(result)}.`);
    assert(result.rathskeller === "ten_doors", `Rathskeller should point to the Wind Spell chest in the current room, got ${JSON.stringify(result)}.`);
    assert(result.lockedTower === null, `The east tower should not point at Derlin's cell before its separate key exists, got ${JSON.stringify(result)}.`);
  });

  test("local objective distance follows the walkable labyrinth route", async () => {
    const result = await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      if (!debug.getState()) document.querySelector("#new-game").click();
      debug.setStoryFlag("yanFreed", false);
      debug.setCompletedEvent("yan_escape", false);
      debug.travelTo("marhynWestCells", 21, 13);
      return {
        objective: debug.getLocalObjectiveDebug(),
        copy: debug.getLocalObjectiveDirection()
      };
    })()`);
    assert(result.objective?.id === "yan_escape", `Old Yan should be the west-cell objective, got ${JSON.stringify(result)}.`);
    assert([58, 59, 60].includes(result.objective.distance), `The west-cell maze requires a 58–60-step walkable route as Old Yan paces, not its roughly 32-step Manhattan estimate: ${JSON.stringify(result)}.`);
    assert(result.objective.firstDirection === "south" && new RegExp(`south.*${result.objective.distance} steps`, "i").test(result.copy), `Compass direction and copy should follow the current walkable route, got ${JSON.stringify(result)}.`);
  });

  test("the compass follows a wandering active objective's current tile", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    const result = await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      debug.setStoryFlag("metZelin", false);
      debug.setCompletedEvent("zelin", false);
      debug.travelTo("krendon", 15, 15);
      const motion = debug.getEventMotion("zelin");
      const objective = debug.getLocalObjectiveDebug();
      return { motion, objective };
    })()`);
    assert(result.objective?.id === "zelin", `Zelin should be the active Krendon objective, got ${JSON.stringify(result)}.`);
    assert(result.objective.x === result.motion?.tileX && result.objective.y === result.motion?.tileY, `The compass should target Zelin's current occupied tile, got ${JSON.stringify(result)}.`);
  });

  test("a tracked remote sidequest suppresses conflicting local story objectives", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    const result = await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      debug.setStoryFlag("metKing", true);
      debug.setStoryFlag("yvonneJoined", false);
      debug.setStoryFlag("yvonneBumped", false);
      debug.setStoryFlag("marketLedgerRecovered", false);
      debug.travelTo("tealsburg", 11, 1);
      debug.setTrackedSideQuest("marketMaze");
      const tracked = {
        quest: debug.getQuestText(),
        objective: debug.getLocalObjectiveDebug(),
        direction: debug.getLocalObjectiveDirection()
      };
      debug.setTrackedSideQuest(null);
      return { tracked, untrackedObjective: debug.getLocalObjectiveDebug()?.id || null };
    })()`);
    assert(/Tracked: Market Ledger/i.test(result.tracked.quest), `Quest copy should show the tracked sidequest, got ${JSON.stringify(result)}.`);
    assert(result.tracked.objective === null && /Market Ledger.*follow a labeled exit/i.test(result.tracked.direction), `The compass must not point at Yvonne while Market Maze is tracked, got ${JSON.stringify(result)}.`);
    assert(result.untrackedObjective === "yvonne_bump", `Clearing the tracked quest should restore the local story objective, got ${JSON.stringify(result)}.`);
  });

  test("Marhyn guidance orders the armory keyring before the lower-vault cell key", async () => {
    const result = await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      if (!debug.getState()) document.querySelector("#new-game").click();
      ["metZelin", "milkedBetsy", "tustorRaised", "capturedByLithar"].forEach((flag) => debug.setStoryFlag(flag, true));
      debug.setStoryFlag("yanFreed", false);
      debug.setStoryFlag("marhynKeyring", false);
      debug.setInventoryItem("Derlin Cell Key", 0);
      debug.travelTo("marhynArmory", 12, 13);
      const beforeYan = { quest: debug.getQuestText(), objective: debug.getLocalObjectiveDebug()?.id || null };
      debug.setStoryFlag("yanFreed", true);
      debug.travelTo("marhynHalls", 11, 14);
      const beforeKeyring = { quest: debug.getQuestText(), objective: debug.getLocalObjectiveDebug()?.id || null };
      debug.setStoryFlag("marhynKeyring", true);
      const afterKeyring = { quest: debug.getQuestText(), objective: debug.getLocalObjectiveDebug()?.id || null };
      return { beforeYan, beforeKeyring, afterKeyring };
    })()`);
    assert(/west cells/i.test(result.beforeYan.quest) && result.beforeYan.objective === "armory_to_halls", `Before Yan is freed, an armory detour should point back toward the west cells, got ${JSON.stringify(result)}.`);
    assert(/armory.*keyring/i.test(result.beforeKeyring.quest) && result.beforeKeyring.objective === "halls_to_armory", `Guidance should send the party to the armory keyring first, got ${JSON.stringify(result)}.`);
    assert(/keyring.*lower vault.*cell key/i.test(result.afterKeyring.quest) && result.afterKeyring.objective === "halls_to_vault", `Once acquired, the keyring should lead into the lower vault for the cell key, got ${JSON.stringify(result)}.`);
  });

  test("local navigation exposes a legend and objective direction", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("tideCavern")`);
    await closeDialogue(cdp);
    const result = await evalPage(cdp, `(() => ({
      legend: document.querySelector(".mini-map-legend")?.textContent || "",
      direction: document.querySelector("#objective-direction")?.textContent || "",
      debugDirection: window.DreamQuestDebug.getLocalObjectiveDirection()
    }))()`);
    ["You", "NPC", "Door", "Objective"].forEach((label) => assert(result.legend.includes(label), `Minimap legend should include ${label}, got ${result.legend}.`));
    assert(result.direction && result.direction === result.debugDirection && /Objective|exit/i.test(result.direction), `Local objective direction should be visible, got ${JSON.stringify(result)}.`);
  });

  test("late party skills unlock within the remaining campaign", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["dalin", "yvonne", "valena"]);
      window.DreamQuestDebug.setMemberLevel("dalin", 13);
      window.DreamQuestDebug.setMemberLevel("yvonne", 15);
      window.DreamQuestDebug.setMemberLevel("valena", 16);
      window.DreamQuestDebug.setInventoryItem("Scribe Pass", 1);
      window.DreamQuestDebug.setInventoryItem("Sky Charm", 1);
      return Object.fromEntries(["dalin", "yvonne", "valena"].map((id) => [id, window.DreamQuestDebug.getAvailableSkills(id).map((skill) => skill.id)]));
    })()`);
    assert(result.dalin.includes("lifeleaf") && result.dalin.includes("canopyMend"), `Dalin should complete his kit by level 13, got ${JSON.stringify(result.dalin)}.`);
    assert(result.yvonne.includes("lockpickVolley") && result.yvonne.includes("royalRefund"), `Yvonne should complete her route kit by level 15, got ${JSON.stringify(result.yvonne)}.`);
    assert(result.valena.includes("sacredReturn") && result.valena.includes("starleafWard") && result.valena.includes("branchBloom"), `Valena should complete her kit by level 16, got ${JSON.stringify(result.valena)}.`);
  });

  test("Steal-ish Slash keeps an MP tradeoff after equipping the Water Orb Focus", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      window.DreamQuestDebug.setActivePartyIds(["tarthur"]);
      window.DreamQuestDebug.setInventoryItem("Water Orb Focus", 1);
      window.DreamQuestDebug.equipGear("tarthur", "accessory", "No Accessory");
      window.DreamQuestDebug.startBattle("goblin");
      const normal = document.querySelector('[data-skill-select="tarthur"] option[value="stealishSlash"]')?.textContent || "";
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.equipGear("tarthur", "accessory", "Water Orb Focus");
      window.DreamQuestDebug.startBattle("goblin");
      const focused = document.querySelector('[data-skill-select="tarthur"] option[value="stealishSlash"]')?.textContent || "";
      const baseMp = window.DreamQuestData.skillCatalog.stealishSlash.mp;
      window.DreamQuestDebug.endBattle();
      return { baseMp, normal, focused };
    })()`);
    assert(result.baseMp === 2 && result.normal.includes("(2 MP)") && result.focused.includes("(1 MP)"), `Steal-ish Slash should cost 2 MP normally and 1 MP with the Focus, got ${JSON.stringify(result)}.`);
  });

  test("skill and equipment screens show estimates, eligibility, effects, and deltas", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.setPartyMembers(["tarthur"]); window.DreamQuestDebug.setInventoryItem("Rune Sword", 1); window.DreamQuestDebug.openMenu("characters")`);
    let copy = await evalPage(cdp, `document.querySelector(".menu-skill-info")?.textContent || ""`);
    assert(copy.includes("Est.") && copy.includes("MP"), `Character skill information should include estimates and costs, got ${copy}.`);
    await click(cdp, '[data-menu-tab="equipment"]');
    copy = await evalPage(cdp, `document.querySelector(".equipment-buttons")?.textContent || ""`);
    assert(copy.includes("Eligible:") && copy.includes("Change:"), `Equipment information should include eligibility and current-versus-new changes, got ${copy}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("shops provide tiers, limited stock, selling, and permanent services", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: true });
      window.DreamQuestDebug.setGold(1000);
      window.DreamQuestDebug.setInventoryItem("Potion", 2);
      window.DreamQuestDebug.travelTo("krendonShop");
    })()`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("krendon_shop_counter")`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-shop-buy="Apprentice Guard"]')) && Boolean(document.querySelector('[data-shop-service="forgeTune"]')) && Boolean(document.querySelector('[data-shop-sell="Potion"]'))`, 5000);
    const atkBefore = await evalPage(cdp, `window.DreamQuestDebug.getState().party[0].atk`);
    await click(cdp, '[data-shop-buy="Apprentice Guard"]');
    await click(cdp, '[data-shop-buy="Apprentice Guard"]');
    await click(cdp, '[data-shop-service="forgeTune"]');
    const goldBeforeSell = await evalPage(cdp, `window.DreamQuestDebug.getState().gold`);
    await click(cdp, '[data-shop-sell="Potion"]');
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const normalized = window.DreamQuestDebug.normalizeState(state);
      return {
        stockText: document.querySelector('[data-shop-buy="Apprentice Guard"]')?.textContent,
        stockDisabled: document.querySelector('[data-shop-buy="Apprentice Guard"]')?.disabled,
        normalizedStock: normalized.shopPurchases["krendon:Apprentice Guard"],
        service: state.shopServices.forgeTune,
        atk: state.party[0].atk,
        gold: state.gold,
        potion: state.inventory.Potion
      };
    })()`);
    assert(result.stockDisabled && result.stockText.includes("Sold out"), `Limited stock should sell out, got ${JSON.stringify(result)}.`);
    assert(result.normalizedStock === 2, `Limited stock counters must survive save normalization, got ${JSON.stringify(result)}.`);
    assert(result.service && result.atk === atkBefore + 1, `Forge service should be permanent and one-time, got ${JSON.stringify(result)}.`);
    assert(result.gold > goldBeforeSell && result.potion === 1, `Selling should exchange one unequipped Potion for gold, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.DreamQuestDebug.setCreatorFlags({ enabled: false })`);
  });

  test("sidequest journal persists discovery, status, tracking, and postgame locations", async () => {
    await evalPage(cdp, `(() => {
      ["gameComplete", "millQuest", "millSaved"].forEach((flag) => window.DreamQuestDebug.setStoryFlag(flag, false));
      window.DreamQuestDebug.setInventoryItem("Rune Sword", 0);
      window.DreamQuestDebug.travelTo("krendon");
      window.DreamQuestDebug.setTrackedSideQuest("oldMill");
      window.DreamQuestDebug.saveLocal();
    })()`);
    await closeDialogue(cdp);
    let journal = await evalPage(cdp, `window.DreamQuestDebug.getQuestJournal()`);
    let mill = journal.find((quest) => quest.id === "oldMill");
    assert(mill?.discovered && mill?.tracked && mill.status === "discovered", `Old Mill should be a tracked discovered lead, got ${JSON.stringify(mill)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.setStoryFlag("millQuest", true)`);
    journal = await evalPage(cdp, `window.DreamQuestDebug.getQuestJournal()`);
    mill = journal.find((quest) => quest.id === "oldMill");
    assert(mill.status === "blocked" && mill.guidance.includes("Rune Sword"), `Old Mill should explain its Rune Sword block, got ${JSON.stringify(mill)}.`);
    const persisted = await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const save = JSON.parse(localStorage.getItem(key));
      return window.DreamQuestDebug.normalizeState(save).questJournal;
    })()`);
    assert(persisted.trackedId === "oldMill" && persisted.discovered.oldMill, `Quest tracking should survive save normalization, got ${JSON.stringify(persisted)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.setTrackedSideQuest(null); window.DreamQuestDebug.setStoryFlag("gameComplete", true); window.DreamQuestDebug.openMenu("quest")`);
    const postgame = await evalPage(cdp, `(() => ({
      cards: document.querySelectorAll(".quest-journal-card").length,
      text: document.querySelector("#menu-content")?.textContent || ""
    }))()`);
    assert(postgame.cards === 6, `Postgame journal should reveal all six sidequests, got ${postgame.cards}.`);
    assert(!postgame.text.includes("???") && postgame.text.includes("Old Mill, west of Krendon") && postgame.text.includes("Glass Caves, east of the Savannah Plain"), `Postgame journal should show exact locations, got ${postgame.text}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu(); window.DreamQuestDebug.setStoryFlag("gameComplete", false)`);
  });

  test("sidequest guidance and repeat dialogue remain conditional", async () => {
    await evalPage(cdp, `(() => {
      ["millQuest", "millSaved", "gameComplete", "marshBookRecovered"].forEach((flag) => window.DreamQuestDebug.setStoryFlag(flag, false));
      window.DreamQuestDebug.setCompletedEvent("mill_martha", false);
      window.DreamQuestDebug.setInventoryItem("Rune Sword", 0);
      window.DreamQuestDebug.travelTo("oldMill");
    })()`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("mill_martha")`);
    await closeDialogue(cdp);
    let state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(state.inventory["Zoom Shell"] >= 1, "Martha should provide a free Zoom Shell for later Old Mill backtracking.");
    await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("mill_martha")`);
    const repeat = await evalPage(cdp, `document.querySelector("#dialogue-text")?.textContent || ""`);
    assert(repeat.includes("Rune Sword") && !repeat.includes("safer now"), `Accepted-but-incomplete dialogue should give current guidance, got ${repeat}.`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("moonMarsh"); window.DreamQuestDebug.setStoryFlag("gameComplete", true)`);
    await closeDialogue(cdp);
    const objective = await evalPage(cdp, `window.DreamQuestDebug.getQuestText()`);
    assert(objective.includes("Marsh Jester"), `Local sidequest guidance should override the completion objective, got ${objective}.`);
    await evalPage(cdp, `window.DreamQuestDebug.setStoryFlag("gameComplete", false)`);
  });

  test("sidequest puzzles replace the obsolete marsh level gate and marker hunts", async () => {
    const data = await evalPage(cdp, `(() => {
      const areas = window.DreamQuestData.areas;
      const event = (area, id) => areas[area].events.find((entry) => entry.id === id);
      return {
        marsh: event("moonMarsh", "marsh_wisp"),
        shrine: event("skyShrine", "star_shrine_voice"),
        tide: event("tideCavern", "river_slime_regent"),
        glass: event("glassCaves", "crystal_mole"),
        switchback: event("hawkSwitchback", "hawk_switchback_view"),
        rune: event("deepForest", "eagle_rune_sword"),
        northern: event("northernPath", "northern_scout"),
        savannah: event("savannah", "savannah_camp")
      };
    })()`);
    assert(!data.marsh.gateMinLevel && data.marsh.gateFlags.length === 2, `Moon Marsh should use observations, not a level gate: ${JSON.stringify(data.marsh)}.`);
    assert(data.shrine.gateFlags.length === 2 && data.tide.gateFlags.length === 2 && data.glass.gateFlags.length === 2, "Star Shrine, Tide Cavern, and Glass Caves should have distinct observation/switch mechanics.");
    assert(data.switchback.x === 10 && data.rune.x === 11 && data.northern.x === 11 && data.savannah.x === 10, `Main-route updates should replace off-route marker hunts, got ${JSON.stringify(data)}.`);
  });

  test("side-area entrances can reach their configured east exits", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("tideCavern")`);
    await closeDialogue(cdp);
    const tideReachable = await evalPage(cdp, `window.DreamQuestDebug.canReachTile(22, 8)`);
    assert(tideReachable, "Tide Cavern start should reach the east edge tile.");
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("moonMarsh")`);
    await closeDialogue(cdp);
    const marshReachable = await evalPage(cdp, `window.DreamQuestDebug.canReachTile(22, 5)`);
    assert(marshReachable, "Moon Marsh start should reach the east edge tile.");
  });

  test("captured roster members keep their progression when restored", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin"]);
      window.DreamQuestDebug.setMemberLevel("derlin", 7);
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      const captured = window.DreamQuestDebug.getState().roster.find((entry) => entry.id === "derlin");
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin"]);
      const restored = window.DreamQuestDebug.getState().party.find((member) => member.id === "derlin");
      return { capturedStatus: captured?.status, capturedLevel: captured?.member?.level, restoredLevel: restored?.level };
    })()`);
    assert(result.capturedStatus === "captured", `Expected captured roster status, got ${JSON.stringify(result)}.`);
    assert(result.capturedLevel === 7 && result.restoredLevel === 7, `Derlin progression should survive capture, got ${JSON.stringify(result)}.`);
  });

  test("captured roster members keep equipment through save/load and rejoin alive", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await closeDialogue(cdp);
    }
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin"]);
      window.DreamQuestDebug.setInventoryItem("Derlin's Redblade", 1);
      window.DreamQuestDebug.equipGear("derlin", "weapon", "Derlin's Redblade");
      window.DreamQuestDebug.setPartyVitals("derlin", 0, 0);
      window.DreamQuestDebug.setPartyMembers(["tarthur"]);
      const captured = window.DreamQuestDebug.getState();
      window.DreamQuestDebug.saveLocal();
      const loaded = window.DreamQuestDebug.loadLocal();
      window.DreamQuestDebug.addParty("derlin");
      const restored = window.DreamQuestDebug.getState();
      return {
        capturedStatus: captured.roster.find((entry) => entry.id === "derlin")?.status,
        capturedWeapon: captured.equipment.derlin?.weapon,
        loadedWeapon: loaded?.equipment?.derlin?.weapon,
        restoredWeapon: restored.equipment.derlin?.weapon,
        restoredHp: restored.party.find((member) => member.id === "derlin")?.hp
      };
    })()`);
    assert(result.capturedStatus === "captured", `Expected Derlin to be captured, got ${JSON.stringify(result)}.`);
    assert(result.capturedWeapon === "Derlin's Redblade" && result.loadedWeapon === "Derlin's Redblade" && result.restoredWeapon === "Derlin's Redblade", `Captured equipment should survive capture, normalization, and rescue: ${JSON.stringify(result)}.`);
    assert(result.restoredHp >= 1, `A rescued KO companion should rejoin alive, got ${JSON.stringify(result)}.`);
  });

  test("legacy save repair restores progression-critical reward items", async () => {
    const result = await evalPage(cdp, `(() => {
      const save = window.DreamQuestDebug.freshState();
      save.version = 1;
      save.inventory = {};
      save.flags = {
        waterSpellDream: true,
        tustorRaised: true,
        runeSword: true,
        lightSword: true,
        windSpell: true
      };
      save.completedEvents = {
        water_orb: true,
        tustor_grave: true,
        derlin_cell_key: true,
        eagle_rune_sword: true,
        corizaz_sleeping: true,
        ten_doors: true
      };
      const normalized = window.DreamQuestDebug.normalizeState(save);
      const names = ["Water Orb Spell", "Water Orb Focus", "Water Scroll", "Derlin Cell Key", "Rune Sword", "Light Sword", "Wind Spell"];
      return {
        version: normalized.version,
        expectedVersion: window.DreamQuestData.gameConfig.saveVersion,
        items: Object.fromEntries(names.map((name) => [name, normalized.inventory[name] || 0]))
      };
    })()`);
    assert(result.version === result.expectedVersion, `Legacy save should migrate to ${result.expectedVersion}, got ${JSON.stringify(result)}.`);
    assert(Object.values(result.items).every((count) => count >= 1), `Legacy story rewards should repair their required items, got ${JSON.stringify(result.items)}.`);
  });

  test("story reward migration does not recreate sold bonus gear on later loads", async () => {
    const result = await evalPage(cdp, `(() => {
      const save = window.DreamQuestDebug.freshState();
      save.flags.windSpell = true;
      save.completedEvents.ten_doors = true;
      save.inventory = { "Wind Spell": 1 };
      const normalized = window.DreamQuestDebug.normalizeState(save);
      return {
        windSpell: normalized.inventory["Wind Spell"] || 0,
        staff: normalized.inventory["Wind Dragon Staff"] || 0,
        mantle: normalized.inventory["Dragon Scale Mantle"] || 0
      };
    })()`);
    assert(result.windSpell === 1, `The progression item should survive normalization, got ${JSON.stringify(result)}.`);
    assert(result.staff === 0 && result.mantle === 0, `Current-version loads must not recreate sold reward gear, got ${JSON.stringify(result)}.`);
  });

  test("Zoom destinations require an actual visit", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.travelTo("krendon");
      window.DreamQuestDebug.setCompletedEvent("visit_rathskeller", false);
      window.DreamQuestDebug.setInventoryItem("Zoom Shell", 1);
      window.DreamQuestDebug.openMenu("inventory");
    })()`);
    const rathskellerZoom = await evalPage(cdp, `Boolean(document.querySelector('[data-zoom-item="rathskeller"]'))`);
    assert(!rathskellerZoom, "An adjacent known destination must not appear in Zoom before it is visited.");
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("an interrupted Zoom resumes after reload without charging twice", async () => {
    const hasState = await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`);
    if (!hasState) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.endBattle();
      window.DreamQuestDebug.travelTo("krendon");
      window.DreamQuestDebug.setCompletedEvent("visit_freeton", true);
      window.DreamQuestDebug.setInventoryItem("Zoom Shell", 1);
    })()`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("inventory")`);
    await click(cdp, '[data-zoom-item="freeton"]');
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.pendingTransition?.eventId === "zoom_travel"`);
    const departing = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const blocked = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);
      const rows = window.DreamQuestData.areas[state.areaId].map;
      const candidates = [["ArrowLeft", -1, 0], ["ArrowRight", 1, 0], ["ArrowUp", 0, -1], ["ArrowDown", 0, 1]];
      const movementKey = candidates.find(([, dx, dy]) => rows[state.y + dy]?.[state.x + dx] && !blocked.has(rows[state.y + dy][state.x + dx]))?.[0] || "ArrowLeft";
      document.querySelector("#map-canvas").focus();
      return { areaId: state.areaId, x: state.x, y: state.y, steps: state.steps, shells: state.inventory["Zoom Shell"] || 0, pending: state.pendingTransition, movementKey };
    })()`);
    assert(departing.areaId === "krendon" && departing.shells === 0 && departing.pending.areaId === "freeton", `Zoom should save its paid destination before animating, got ${JSON.stringify(departing)}.`);

    await sleep(220);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: departing.movementKey, code: departing.movementKey });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: departing.movementKey, code: departing.movementKey });
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("inventory"); window.DreamQuestDebug.startBattle("goblin")`);
    await sleep(120);
    const locked = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return { areaId: state.areaId, x: state.x, y: state.y, steps: state.steps, battle: Boolean(window.DreamQuestDebug.getBattle()), menuVisible: !document.querySelector("#menu-modal").classList.contains("is-hidden") };
    })()`);
    assert(locked.areaId === departing.areaId && locked.x === departing.x && locked.y === departing.y && locked.steps === departing.steps && !locked.battle && !locked.menuVisible, `Zoom must lock movement, encounters, battles, and Menu until arrival, got ${JSON.stringify({ departing, locked })}.`);

    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === "freeton" && !window.DreamQuestDebug.getState()?.pendingTransition`, 5000);
    const arrived = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return { areaId: state.areaId, shells: state.inventory["Zoom Shell"] || 0, pending: state.pendingTransition };
    })()`);
    assert(arrived.areaId === "freeton" && arrived.shells === 0 && !arrived.pending, `Reloaded Zoom should finish once without another charge, got ${JSON.stringify(arrived)}.`);
    await closeDialogue(cdp);
  });

  test("combat prevents menu overlays from opening", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.startBattle("goblin"); window.DreamQuestDebug.openMenu("inventory")`);
    const result = await evalPage(cdp, `({
      battle: Boolean(window.DreamQuestDebug.getBattle()),
      menuOpen: !document.querySelector("#menu-modal").classList.contains("is-hidden")
    })`);
    assert(result.battle && !result.menuOpen, `Menu should stay closed during combat, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("strict save normalization rejects impassable coordinates", async () => {
    const rejected = await evalPage(cdp, `(() => {
      const save = window.DreamQuestDebug.getState();
      save.areaId = "tideCavern";
      save.x = 0;
      save.y = 0;
      try {
        window.DreamQuestDebug.normalizeState(save, { strictCoordinates: true });
        return false;
      } catch {
        return true;
      }
    })()`);
    assert(rejected, "Import-grade normalization should reject a bounded water tile.");
  });

  test("both manual Save controls checkpoint the current valid position", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("grassland")`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("rathskeller")`);
    await closeDialogue(cdp);
    const beforeMenuSave = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(beforeMenuSave.checkpoint.areaId !== beforeMenuSave.areaId, `Dungeon travel should not itself replace the safe-road checkpoint, got ${JSON.stringify(beforeMenuSave.checkpoint)}.`);
    await click(cdp, "#menu-save");
    const menuResult = await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const current = window.DreamQuestDebug.getState();
      const stored = JSON.parse(localStorage.getItem(key));
      return {
        current: { areaId: current.areaId, x: current.x, y: current.y },
        checkpoint: current.checkpoint,
        storedCheckpoint: stored.checkpoint,
        accidentalEventKey: localStorage.getItem("[object MouseEvent]")
      };
    })()`);
    assert(JSON.stringify(menuResult.checkpoint) === JSON.stringify(menuResult.current), `Menu Save should checkpoint the current position, got ${JSON.stringify(menuResult)}.`);
    assert(JSON.stringify(menuResult.storedCheckpoint) === JSON.stringify(menuResult.current), `Menu Save should persist the checkpoint in the active browser slot, got ${JSON.stringify(menuResult)}.`);
    assert(menuResult.accidentalEventKey === null, "Menu Save must not use its click event as a localStorage key.");

    await evalPage(cdp, `window.DreamQuestDebug.travelTo("grassland")`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("rathskeller")`);
    await closeDialogue(cdp);
    await click(cdp, "#save-btn");
    const hudResult = await evalPage(cdp, `(() => {
      const current = window.DreamQuestDebug.getState();
      return { current: { areaId: current.areaId, x: current.x, y: current.y }, checkpoint: current.checkpoint };
    })()`);
    assert(JSON.stringify(hudResult.checkpoint) === JSON.stringify(hudResult.current), `HUD Save should checkpoint the current position, got ${JSON.stringify(hudResult)}.`);
    await closeDialogue(cdp);
  });

  test("defeat restores the last safe checkpoint with useful vitals", async () => {
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ enabled: false }); window.DreamQuestDebug.travelTo("grassland")`);
    await closeDialogue(cdp);
    const checkpoint = await evalPage(cdp, `window.DreamQuestDebug.getState().checkpoint`);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo("tideCavern")`);
    await closeDialogue(cdp);
    const memberId = await evalPage(cdp, `window.DreamQuestDebug.getState().party[0].id`);
    await evalPage(cdp, `window.DreamQuestDebug.setPartyVitals(${JSON.stringify(memberId)}, 0, 0); window.DreamQuestDebug.partyDefeated()`);
    await closeDialogue(cdp);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const member = state.party.find((entry) => entry.id === ${JSON.stringify(memberId)});
      return { areaId: state.areaId, x: state.x, y: state.y, hp: member.hp, maxHp: member.maxHp, mp: member.mp, maxMp: member.maxMp };
    })()`);
    assert(result.areaId === checkpoint.areaId && result.x === checkpoint.x && result.y === checkpoint.y, `Defeat should restore ${JSON.stringify(checkpoint)}, got ${JSON.stringify(result)}.`);
    assert(result.hp >= Math.ceil(result.maxHp * 0.5) && result.mp >= Math.ceil(result.maxMp * 0.5), `Defeat should restore half vitals, got ${JSON.stringify(result)}.`);
  });

  test("Creator slot identity survives its master switch and can return to Adventure", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    const result = await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      localStorage.removeItem(key + "-creator");
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.setCompletedEvent("visit_krendon", true);
      window.DreamQuestDebug.setCompletedEvent("wake_krendon", true);
      window.DreamQuestDebug.travelTo("krendon");
      window.DreamQuestDebug.saveLocal();
      document.querySelector("#creator-title").click();
      const created = window.DreamQuestDebug.getState();
      const returnButton = document.querySelector('[data-creator-action="returnAdventure"]');
      const returnLabel = returnButton?.textContent?.trim() || "";
      window.DreamQuestDebug.setCreatorFlags({ enabled: true });
      window.DreamQuestDebug.travelTo("tideCavern");
      window.DreamQuestDebug.setCreatorFlags({ enabled: false });
      window.DreamQuestDebug.saveLocal();
      const disabledCreator = JSON.parse(localStorage.getItem(key + "-creator") || "null");
      document.querySelector('[data-creator-action="returnAdventure"]')?.click();
      const returned = window.DreamQuestDebug.getState();
      document.querySelector("#dialogue-next")?.click();

      window.DreamQuestDebug.setCompletedEvent("visit_grassland", true);
      window.DreamQuestDebug.travelTo("grassland");
      window.DreamQuestDebug.saveLocal();
      document.querySelector("#creator-title").click();
      const resumedCreator = window.DreamQuestDebug.getState();
      document.querySelector('[data-creator-action="returnAdventure"]')?.click();
      const finalAdventure = window.DreamQuestDebug.getState();
      return {
        createdSlot: created.saveSlot,
        returnLabel,
        disabledCreator: {
          areaId: disabledCreator?.areaId,
          saveSlot: disabledCreator?.saveSlot,
          enabled: disabledCreator?.creator?.enabled
        },
        returned: { areaId: returned?.areaId, saveSlot: returned?.saveSlot },
        resumedCreator: { areaId: resumedCreator?.areaId, saveSlot: resumedCreator?.saveSlot, enabled: resumedCreator?.creator?.enabled },
        finalAdventure: { areaId: finalAdventure?.areaId, saveSlot: finalAdventure?.saveSlot },
        normalStored: JSON.parse(localStorage.getItem(key) || "null")?.areaId,
        creatorStored: JSON.parse(localStorage.getItem(key + "-creator") || "null")?.areaId
      };
    })()`);
    assert(result.createdSlot === "creator", `Opening Creator should switch to an explicit Creator slot, got ${JSON.stringify(result)}.`);
    assert(result.returnLabel === "Return to Adventure", `Creator should expose a clear return action, got ${JSON.stringify(result)}.`);
    assert(result.disabledCreator.areaId === "tideCavern" && result.disabledCreator.saveSlot === "creator" && result.disabledCreator.enabled === false, `Turning Creator Mode off must continue saving to the Creator slot, got ${JSON.stringify(result)}.`);
    assert(result.returned.areaId === "krendon" && result.returned.saveSlot === "adventure", `Return to Adventure should restore the untouched adventure, got ${JSON.stringify(result)}.`);
    assert(result.resumedCreator.areaId === "tideCavern" && result.resumedCreator.saveSlot === "creator" && result.resumedCreator.enabled === false, `Reopening Creator should resume its own disabled-mode save instead of copying over it, got ${JSON.stringify(result)}.`);
    assert(result.finalAdventure.areaId === "grassland" && result.finalAdventure.saveSlot === "adventure" && result.normalStored === "grassland" && result.creatorStored === "tideCavern", `Adventure and Creator saves should remain isolated in both directions, got ${JSON.stringify(result)}.`);
    await closeDialogue(cdp);
  });

  test("full-route milestone saves retain progression and visited Zoom gates", async () => {
    const result = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const save = window.DreamQuestDebug.freshState();
      const route = ["darhynCastle", "krendon", "krendonRoad", "hawkMountains", "hawkSwitchback", "merfolkShoals", "grassland", "marhynCastle", "forest", "deepForest", "freeton", "corizazLair", "kingsHighway", "tealsburg", "northernPath", "breshen", "savannah", "rathskellerApproach", "rathskeller"];
      route.forEach((areaId) => { save.completedEvents["visit_" + areaId] = true; });
      data.creatorRouteFlags.forEach((flag) => { save.flags[flag] = true; });
      save.areaId = "rathskeller";
      save.x = data.areas.rathskeller.start[0];
      save.y = data.areas.rathskeller.start[1];
      const normalized = window.DreamQuestDebug.normalizeState(save);
      return {
        missingAreas: route.filter((areaId) => !data.areas[areaId]),
        missingVisits: route.filter((areaId) => !normalized.completedEvents["visit_" + areaId]),
        missingFlags: data.creatorRouteFlags.filter((flag) => !normalized.flags[flag]),
        areaId: normalized.areaId
      };
    })()`);
    assert(result.areaId === "rathskeller" && !result.missingAreas.length && !result.missingVisits.length && !result.missingFlags.length, `Full-route milestone state should normalize intact, got ${JSON.stringify(result)}.`);
  });

  test("story handoffs and the ending resume after interrupted reloads", async () => {
    await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const save = window.DreamQuestDebug.freshState();
      save.pendingTransition = { eventId: "water_orb", phase: "reward" };
      localStorage.setItem(key, JSON.stringify(save));
    })()`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === "krendon"`);
    await closeDialogue(cdp);
    let result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return { pending: state.pendingTransition, spell: state.inventory["Water Orb Spell"], focus: state.inventory["Water Orb Focus"] };
    })()`);
    assert(!result.pending && result.spell === 1 && result.focus === 1, `Water Orb handoff should resume transactionally, got ${JSON.stringify(result)}.`);

    await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const key = data.gameConfig.saveKey;
      const save = window.DreamQuestDebug.freshState();
      const derlin = structuredClone(data.partyTemplates.derlin);
      derlin.level = 7;
      derlin.xp = 19;
      save.party.push(derlin);
      save.activePartyIds.push("derlin");
      save.roster.push({ id: "derlin", status: "active", member: structuredClone(derlin) });
      save.pendingTransition = { eventId: "lithar_ambush", phase: "capture" };
      localStorage.setItem(key, JSON.stringify(save));
    })()`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === "marhynCastle"`);
    await closeDialogue(cdp);
    result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      const derlin = state.roster.find((entry) => entry.id === "derlin");
      return { pending: state.pendingTransition, active: state.party.map((member) => member.id), status: derlin?.status, level: derlin?.member?.level, xp: derlin?.member?.xp };
    })()`);
    assert(!result.pending && !result.active.includes("derlin") && result.status === "captured" && result.level === 7 && result.xp === 19, `Lithar interruption should preserve the captured roster, got ${JSON.stringify(result)}.`);

    await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const key = data.gameConfig.saveKey;
      const save = window.DreamQuestDebug.freshState();
      save.areaId = "rathskeller";
      save.x = data.areas.rathskeller.start[0];
      save.y = data.areas.rathskeller.start[1];
      save.party.push(structuredClone(data.partyTemplates.yan));
      save.activePartyIds.push("yan");
      save.roster.push({ id: "yan", status: "active", member: structuredClone(data.partyTemplates.yan) });
      save.pendingTransition = { eventId: "darhyn_final", phase: "cutscene" };
      save.settings.reducedEffects = true;
      localStorage.setItem(key, JSON.stringify(save));
    })()`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await waitFor(cdp, `!document.querySelector("#cutscene").classList.contains("is-hidden")`, 3000);
    await waitFor(cdp, `document.querySelector("#cutscene").classList.contains("is-hidden") && !document.querySelector("#dialogue").classList.contains("is-hidden")`, 4000);
    await closeDialogue(cdp);
    await waitFor(cdp, `!document.querySelector("#ending-scene").classList.contains("is-hidden")`, 3000);
    result = await evalPage(cdp, `(() => { const state = window.DreamQuestDebug.getState(); return { mode: state.mode, gameComplete: state.flags.gameComplete, pending: state.pendingTransition?.eventId, endingVisible: !document.querySelector("#ending-scene").classList.contains("is-hidden") }; })()`);
    assert(result.mode === "complete" && result.gameComplete && result.pending === "darhyn_final" && result.endingVisible, `Interrupted ending should replay through credits, got ${JSON.stringify(result)}.`);
    await click(cdp, "#ending-continue");
  });

  test("playtime counts active sessions instead of save age", async () => {
    await evalPage(cdp, `(() => {
      const key = window.DreamQuestData.gameConfig.saveKey;
      const save = window.DreamQuestDebug.freshState();
      save.startedAt = Date.now() - 7 * 24 * 60 * 60 * 1000;
      save.playTimeMs = 2 * 60 * 1000;
      localStorage.setItem(key, JSON.stringify(save));
    })()`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#continue-game");
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.openMenu("quest")`);
    const result = await evalPage(cdp, `(() => {
      const legacy = window.DreamQuestDebug.freshState();
      legacy.version = 7;
      legacy.startedAt = Date.now() - 30 * 24 * 60 * 60 * 1000;
      delete legacy.playTimeMs;
      const migrated = window.DreamQuestDebug.normalizeState(legacy);
      return {
        status: document.querySelector("#menu-panel-quest")?.textContent || "",
        activeMs: window.DreamQuestDebug.getPlayTimeMs(),
        migratedVersion: migrated.version,
        migratedPlayTimeMs: migrated.playTimeMs,
        expectedVersion: window.DreamQuestData.gameConfig.saveVersion
      };
    })()`);
    assert(/\b2 min\b/.test(result.status) && result.activeMs < 3 * 60 * 1000, `A week-old save with two active minutes should display about two minutes, got ${JSON.stringify(result)}.`);
    assert(result.migratedVersion === result.expectedVersion && result.migratedPlayTimeMs === 0, `Version-7 saves should migrate to active playtime cleanly, got ${JSON.stringify(result)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
  });

  test("save/load round trip preserves area", async () => {
    const targetAreaId = await evalPage(cdp, `Object.keys(window.DreamQuestData.areas).find((id) => id !== window.DreamQuestData.gameConfig.startAreaId) || window.DreamQuestData.gameConfig.startAreaId`);
    await evalPage(cdp, `window.DreamQuestDebug.setCreatorFlags({ enabled: false }); window.DreamQuestDebug.travelTo(${JSON.stringify(targetAreaId)}); window.DreamQuestDebug.saveLocal();`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    const enabled = await evalPage(cdp, `!document.querySelector("#continue-game").disabled`);
    assert(enabled, "Continue should be enabled after saving.");
    await click(cdp, "#continue-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === ${JSON.stringify(targetAreaId)}`, 5000);
  });

  test("phone controls remain distinct, tappable, and inside the viewport", async () => {
    const gameHidden = await evalPage(cdp, `document.querySelector("#game-screen").classList.contains("is-hidden")`);
    if (gameHidden) {
      const canContinue = await evalPage(cdp, `!document.querySelector("#continue-game").disabled`);
      await click(cdp, canContinue ? "#continue-game" : "#new-game");
    }
    await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    await closeDialogue(cdp);
    const coachVisible = await evalPage(cdp, `!document.querySelector("#coach-modal").classList.contains("is-hidden")`);
    if (coachVisible) await click(cdp, "#coach-close");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    try {
      await evalPage(cdp, `window.dispatchEvent(new Event("resize"))`);
      await sleep(180);
      const result = await evalPage(cdp, `(() => {
        const controls = document.querySelector("#mobile-controls");
        const menu = document.querySelector("#field-menu-btn");
        const dock = document.querySelector(".field-dock");
        const controlRect = controls.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        const overlap = !(controlRect.right <= menuRect.left || menuRect.right <= controlRect.left || controlRect.bottom <= menuRect.top || menuRect.bottom <= controlRect.top);
        const hit = document.elementFromPoint(menuRect.left + menuRect.width / 2, menuRect.top + menuRect.height / 2);
        return {
          overlap,
          menuHit: hit === menu || menu.contains(hit),
          hit: hit ? { tag: hit.tagName, id: hit.id, className: String(hit.className || "") } : null,
          menuSize: [menuRect.width, menuRect.height],
          dock: { left: dockRect.left, right: dockRect.right, bottom: dockRect.bottom },
          viewport: [innerWidth, innerHeight]
        };
      })()`);
      assert(!result.overlap && result.menuHit, `Movement controls must not intercept the phone Menu button, got ${JSON.stringify(result)}.`);
      assert(result.menuSize[0] >= 44 && result.menuSize[1] >= 44, `Phone Menu target should be at least 44px, got ${JSON.stringify(result.menuSize)}.`);
      assert(result.dock.left >= 0 && result.dock.right <= result.viewport[0] && result.dock.bottom <= result.viewport[1], `Phone dock should remain inside the viewport, got ${JSON.stringify(result)}.`);
    } finally {
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await evalPage(cdp, `window.dispatchEvent(new Event("resize"))`);
    }
  });

  test("phone menu exposes labeled controls and keeps active tabs visible", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    try {
      await evalPage(cdp, `window.dispatchEvent(new Event("resize")); window.DreamQuestDebug.openMenu("inventory")`);
      await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector(".menu-tabs-scroll-hint"))`);
      await sleep(80);
      const initial = await evalPage(cdp, `(() => {
        const tabs = document.querySelector("#menu-content .menu-tabs");
        const hint = document.querySelector(".menu-tabs-scroll-hint");
        return {
          musicLabel: document.querySelector("#music-btn").getAttribute("aria-label"),
          menuLabel: document.querySelector("#menu-btn").getAttribute("aria-label"),
          overflows: tabs.scrollWidth > tabs.clientWidth,
          hintVisible: hint.getClientRects().length > 0,
          hintText: hint.textContent
        };
      })()`);
      assert(initial.musicLabel === "Music" && initial.menuLabel === "Open menu", `Collapsed HUD controls need stable accessible names, got ${JSON.stringify(initial)}.`);
      assert(initial.overflows && initial.hintVisible && /Swipe tabs/.test(initial.hintText), `Overflowing phone tabs need a visible scroll affordance, got ${JSON.stringify(initial)}.`);
      for (const tabId of ["quest", "settings", "map"]) {
        await evalPage(cdp, `document.querySelector('[data-menu-tab="${tabId}"]').click()`);
        await waitFor(cdp, `document.querySelector('[data-menu-tab="${tabId}"]')?.classList.contains("is-active")`);
        await sleep(80);
        const visible = await evalPage(cdp, `(() => {
          const list = document.querySelector("#menu-content .menu-tabs").getBoundingClientRect();
          const tab = document.querySelector('[data-menu-tab="${tabId}"]').getBoundingClientRect();
          return { list: { left: list.left, right: list.right }, tab: { left: tab.left, right: tab.right } };
        })()`);
        assert(visible.tab.left >= visible.list.left - 1 && visible.tab.right <= visible.list.right + 1, `Active ${tabId} tab should scroll into view, got ${JSON.stringify(visible)}.`);
      }
      await evalPage(cdp, `window.DreamQuestDebug.closeMenu()`);
    } finally {
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await evalPage(cdp, `window.dispatchEvent(new Event("resize"))`);
    }
  });

  test("short desktop battles keep Execute and Undo in a sticky command dock", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
      await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
    }
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 520, deviceScaleFactor: 1, mobile: false });
    try {
      await evalPage(cdp, `(() => {
        window.dispatchEvent(new Event("resize"));
        window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: true });
        window.DreamQuestDebug.setPartyMembers(["tarthur", "derlin", "dalin", "yvonne"]);
        window.DreamQuestDebug.setActivePartyIds(["tarthur", "derlin", "dalin", "yvonne"]);
        window.DreamQuestDebug.startBattle("goblin");
        ["tarthur", "derlin", "dalin", "yvonne"].forEach((id) => window.DreamQuestDebug.queueMemberAction(id, "attack"));
      })()`);
      await waitFor(cdp, `!document.querySelector("#execute-round").disabled && !document.querySelector("#undo-round").disabled`);
      const result = await evalPage(cdp, `(() => {
        const box = document.querySelector(".battle-box");
        const dock = document.querySelector(".battle-command-dock");
        const measure = () => {
          const boxRect = box.getBoundingClientRect();
          const dockRect = dock.getBoundingClientRect();
          const undo = document.querySelector("#undo-round");
          const execute = document.querySelector("#execute-round");
          const undoRect = undo.getBoundingClientRect();
          const executeRect = execute.getBoundingClientRect();
          const undoHit = document.elementFromPoint(undoRect.left + undoRect.width / 2, undoRect.top + undoRect.height / 2);
          const executeHit = document.elementFromPoint(executeRect.left + executeRect.width / 2, executeRect.top + executeRect.height / 2);
          return {
            dockInside: dockRect.top >= boxRect.top - 1 && dockRect.bottom <= boxRect.bottom + 1,
            undoHit: undoHit === undo || undo.contains(undoHit),
            executeHit: executeHit === execute || execute.contains(executeHit)
          };
        };
        box.scrollTop = 0;
        const top = measure();
        box.scrollTop = box.scrollHeight;
        const bottom = measure();
        return { position: getComputedStyle(dock).position, top, bottom, choices: Object.keys(window.DreamQuestDebug.getBattle().choices) };
      })()`);
      assert(result.position === "sticky" && result.top.dockInside && result.bottom.dockInside && result.top.undoHit && result.top.executeHit && result.bottom.undoHit && result.bottom.executeHit, `The short-height command dock should stay visible and hit-testable, got ${JSON.stringify(result)}.`);
      await click(cdp, "#undo-round");
      const remaining = await evalPage(cdp, `Object.keys(window.DreamQuestDebug.getBattle().choices)`);
      assert(remaining.length === result.choices.length - 1 && !remaining.includes(result.choices.at(-1)), `Global Undo should remove only the last queued action, got ${JSON.stringify({ before: result.choices, remaining })}.`);
      await evalPage(cdp, `window.DreamQuestDebug.endBattle(); window.DreamQuestDebug.setCreatorFlags({ oneHitEnemies: false, infiniteHp: false })`);
    } finally {
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await evalPage(cdp, `window.dispatchEvent(new Event("resize"))`);
    }
  });

  test("guide renders one section at a time", async () => {
    const snapshot = await dataSnapshot(cdp);
    const target = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const section = Object.keys(data.guideData).find((id) => id !== data.gameConfig.defaultGuideSection) || data.gameConfig.defaultGuideSection;
      return { section, entries: data.guideData[section]?.length || 0 };
    })()`);
    await cdp.send("Page.navigate", { url: await evalPage(cdp, `location.origin + location.pathname + "?functional-guide"`) });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#guide-title");
    await waitFor(cdp, `!document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    let guide = await evalPage(cdp, `(() => ({
      active: document.querySelector("[data-guide-section].is-active")?.dataset.guideSection,
      sections: document.querySelectorAll(".guide-section").length,
      entries: document.querySelectorAll(".guide-entry").length,
      canvases: document.querySelectorAll(".guide-image").length
    }))()`);
    assert(guide.active === snapshot.config.defaultGuideSection, "Guide should open to the configured default section.");
    assert(guide.sections === 1, "Guide should render one section at a time.");
    assert(guide.entries === snapshot.guideSectionCounts[snapshot.config.defaultGuideSection], "Default guide section should render the configured entries.");
    assert(guide.entries > 0 && guide.canvases === guide.entries, "Guide entries should each have one image canvas.");
    const totalEntries = Object.values(snapshot.guideSectionCounts).reduce((sum, count) => sum + count, 0);
    if (totalEntries > guide.entries) {
      assert(guide.canvases < totalEntries, `Guide should not render every entry at once, saw ${guide.canvases}.`);
    }
    const targetClicked = await evalPage(cdp, `(() => {
      const target = ${JSON.stringify(target)};
      const button = [...document.querySelectorAll("[data-guide-section]")]
        .find((candidate) => candidate.dataset.guideSection === target.section);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(targetClicked, `Could not click guide section ${target.section}.`);
    await waitFor(cdp, `document.querySelector("[data-guide-section].is-active")?.dataset.guideSection === ${JSON.stringify(target.section)}`);
    guide = await evalPage(cdp, `(() => ({
      sections: document.querySelectorAll(".guide-section").length,
      entries: document.querySelectorAll(".guide-entry").length,
      canvases: document.querySelectorAll(".guide-image").length
    }))()`);
    assert(guide.sections === 1, "Guide tab switch should still render one section.");
    assert(guide.entries === target.entries && guide.canvases === target.entries, "Guide tab should render the configured section entries.");
  });

  test("enemy guide thumbnails render as square art", async () => {
    await cdp.send("Page.navigate", { url: await evalPage(cdp, `location.origin + location.pathname + "?functional-guide-enemies"`) });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#guide-title");
    await waitFor(cdp, `!document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    const clicked = await evalPage(cdp, `(() => {
      const button = [...document.querySelectorAll("[data-guide-section]")]
        .find((candidate) => candidate.dataset.guideSection === "enemies");
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(clicked, "Could not click Enemies guide section.");
    await waitFor(cdp, `document.querySelector("[data-guide-section].is-active")?.dataset.guideSection === "enemies"`);
    await waitFor(cdp, `Boolean(document.querySelector(".guide-entry-enemy .guide-image"))`);
    const result = await evalPage(cdp, `(() => {
      const canvas = document.querySelector(".guide-entry-enemy .guide-image");
      const rect = canvas.getBoundingClientRect();
      return {
        entries: document.querySelectorAll(".guide-entry").length,
        enemyEntries: document.querySelectorAll(".guide-entry-enemy").length,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height)
      };
    })()`);
    assert(result.entries > 0 && result.entries === result.enemyEntries, "Enemies guide should render enemy-specific cards only.");
    assert(result.canvasWidth === result.canvasHeight, `Enemy guide canvas should be square, got ${result.canvasWidth}x${result.canvasHeight}.`);
    assert(result.cssWidth === result.cssHeight, `Enemy guide thumbnail should render square, got ${result.cssWidth}x${result.cssHeight}.`);
    assert(result.cssWidth >= 82, `Enemy guide thumbnail should stay large enough to read, got ${result.cssWidth}px.`);
  });

  const filter = String(process.env.DQRPG_TEST_FILTER || "").toLowerCase();
  for (const { name, fn } of tests) {
    if (filter && !name.toLowerCase().includes(filter)) continue;
    await fn();
    console.log(`ok - ${name}`);
  }
}

async function main() {
  const server = await startStaticServer();
  const appPort = server.address().port;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "dqrpg-chrome-"));
  const url = `http://127.0.0.1:${appPort}/index.html?functional-tests`;
  const chrome = childProcess.spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    url
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, 12000);
    const target = targets.find((entry) => entry.type === "page") || targets[0];
    assert(target?.webSocketDebuggerUrl, "Chrome did not expose a page target.");
    const ws = await connectWebSocket(target.webSocketDebuggerUrl);
    const cdp = new CdpClient(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await resetPage(cdp, url);
    await runTests(cdp);
    ws.close();
  } finally {
    chrome.kill("SIGTERM");
    server.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
    } catch {
      // Chrome may keep a profile file open for a moment after SIGTERM.
    }
  }

  if (stderr.includes("ERROR") && process.env.DQRPG_SHOW_CHROME_STDERR) {
    console.error(stderr);
  }
}

main().catch((error) => {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
});
