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
const filterArgumentIndex = process.argv.indexOf("--filter");
const TEST_FILTER = filterArgumentIndex >= 0 ? String(process.argv[filterArgumentIndex + 1] || "").toLowerCase() : "";
const groupArgumentIndex = process.argv.indexOf("--group");
const TEST_GROUP = groupArgumentIndex >= 0 ? String(process.argv[groupArgumentIndex + 1] || "").toLowerCase() : "all";
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
  for (let i = 0; i < 80; i += 1) {
    const status = await evalPage(cdp, `(() => ({
      dialogue: !document.querySelector("#dialogue")?.classList.contains("is-hidden"),
      cutscene: !document.querySelector("#cutscene")?.classList.contains("is-hidden"),
      coach: !document.querySelector("#coach-modal")?.classList.contains("is-hidden")
    }))()`);
    if (status.coach) {
      await click(cdp, "#coach-close");
      await sleep(80);
      continue;
    }
    if (status.cutscene) {
      await waitFor(cdp, `document.querySelector("#cutscene")?.classList.contains("is-hidden")`, 5000);
      await sleep(80);
      continue;
    }
    if (!status.dialogue) return;
    await click(cdp, "#dialogue-next");
    await sleep(80);
  }
  throw new Error("Dialogue/cutscene sequence did not close.");
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
      const expectedTitleArt = new URL(window.DreamQuestData.gameConfig.shell.titleArt, document.baseURI).href;
      const titleArtResource = images.find((entry) => entry.name === expectedTitleArt);
      return {
        guideImages: document.querySelectorAll(".guide-image").length,
        totalCanvases: document.querySelectorAll("canvas").length,
        imageCount: images.length,
        gameHidden: document.querySelector("#game-screen").classList.contains("is-hidden"),
        documentTitle: document.title,
        heading: document.querySelector(".title-copy h1")?.textContent || "",
        kicker: document.querySelector(".title-copy .kicker")?.textContent || "",
        tagline: document.querySelector(".title-copy .tagline")?.textContent || "",
        faviconHref: document.querySelector('link[rel="icon"]')?.getAttribute("href") || "",
        faviconType: document.querySelector('link[rel="icon"]')?.getAttribute("type") || "",
        expectedTitleArt,
        titleArtLoaded: Boolean(titleArtResource && titleArtResource.decodedBodySize > 0),
        titleArtVariable: document.documentElement.style.getPropertyValue("--game-title-art"),
        titleArtBackground: getComputedStyle(document.querySelector(".title-art")).backgroundImage,
        homeHref: document.querySelector(".title-home-link")?.getAttribute("href") || "",
        homeLabel: document.querySelector(".title-home-link")?.getAttribute("aria-label") || ""
      };
    })()`);
    assert(result.gameHidden, "Game screen should be hidden on title.");
    assert(result.homeHref === "../" && /all Daranor games/i.test(result.homeLabel), `Title should link back to the shared game chooser, got ${JSON.stringify(result)}.`);
    assert(result.documentTitle === "ProphecyQuest RPG" && result.heading === "ProphecyQuest RPG", `Title screen should be branded as ProphecyQuest RPG, got ${JSON.stringify(result)}.`);
    assert(result.kicker.includes("SwordQuest") && result.tagline.includes("SwordQuest"), `Title screen should still note SwordQuest, got ${JSON.stringify(result)}.`);
    assert(result.titleArtVariable.includes(result.expectedTitleArt), `Title art CSS variable should use an absolute page URL, got ${JSON.stringify(result)}.`);
    assert(result.titleArtBackground.includes(result.expectedTitleArt), `Title art background should resolve to the campaign asset, got ${JSON.stringify(result)}.`);
    assert(result.titleArtLoaded, `Title art should download successfully, got ${JSON.stringify(result)}.`);
    assert(result.titleArtBackground.includes("prophecyquest-title-v1"), `Title screen should use ProphecyQuest-specific art, got ${JSON.stringify(result)}.`);
    assert(result.faviconHref.includes("favicon.png") && result.faviconType === "image/png", `Title shell should use a generated raster favicon, got ${JSON.stringify(result)}.`);
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
    await click(cdp, "#new-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === window.DreamQuestData.gameConfig.startAreaId`);
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
    const prologue = await evalPage(cdp, `(() => {
      if (window.DreamQuestData.gameConfig.id !== "prophecy-sword") return null;
      const state = window.DreamQuestDebug.getState();
      return {
        areaId: state.areaId,
        leader: state.party[0]?.id,
        gerthoudRightWalk: window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "right", 120, { walkProgress: 0.45 }),
        tivuRightWalk: window.DreamQuestDebug.getCharacterFrameDebug("tivuCloudwalker", "right", 120, { walkProgress: 0.45 }),
        tivuPatrol: window.DreamQuestDebug.getEventPatrolTiles("pq_walis_tivu"),
        tivuMotion: window.DreamQuestDebug.getEventMotion("pq_walis_tivu"),
        corizazBeforeTivu: window.DreamQuestDebug.getEventMotion("pq_walis_corizaz")
      };
    })()`);
    if (prologue) {
      assert(
        prologue.areaId === "pqDeguzIntro" &&
          prologue.leader === "gerthoud" &&
          prologue.gerthoudRightWalk.row === 2 &&
          prologue.gerthoudRightWalk.mirrored === true &&
          prologue.gerthoudRightWalk.crop.left >= 34 &&
          prologue.gerthoudRightWalk.crop.bottom >= 52 &&
          prologue.tivuRightWalk.row === 2 &&
          prologue.tivuRightWalk.mirrored === true &&
          prologue.tivuPatrol?.length > 1 &&
          prologue.tivuMotion &&
          prologue.corizazBeforeTivu === null,
        `Walis prologue should start as animated Gerthoud with Tivu moving before Corizaz appears, got ${JSON.stringify(prologue)}.`
      );
    }
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
    await evalPage(cdp, `window.DreamQuestDebug.setCoachingEnabled(false)`);
  });

  test("Corizaz prologue transition advances to Krendon", async () => {
    if (!await evalPage(cdp, `Boolean(window.DreamQuestDebug.getState())`)) {
      await click(cdp, "#new-game");
      await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`);
      await closeDialogue(cdp);
    }
    await evalPage(cdp, `(() => {
      const debug = window.DreamQuestDebug;
      debug.setSettings({ reducedEffects: true });
      debug.setStoryFlag("psTivuSeen", true);
      debug.setStoryFlag("psGerthoudKilled", false);
      debug.setCompletedEvent("pq_walis_corizaz", false);
      debug.travelTo("pqDeguzIntro", 17, 12);
    })()`);
    await closeDialogue(cdp);
    const triggered = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_walis_corizaz")`);
    assert(triggered, "The Corizaz prologue event should be available after Tivu's warning.");
    await closeDialogue(cdp);
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === "pqKrendonFlight" && window.DreamQuestDebug.getState()?.flags?.psGerthoudKilled`, 5000);
    const result = await evalPage(cdp, `(() => {
      const state = window.DreamQuestDebug.getState();
      return {
        areaId: state.areaId,
        flag: Boolean(state.flags.psGerthoudKilled),
        party: state.party.map((member) => member.id)
      };
    })()`);
    assert(result.areaId === "pqKrendonFlight" && result.flag, `Corizaz should advance the prologue into the Krendon flight, got ${JSON.stringify(result)}.`);
    assert(JSON.stringify(result.party) === JSON.stringify(["yvonne", "alahim"]), `Corizaz should hand control to Yvonne and Alahim, got ${JSON.stringify(result.party)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.setSettings({ reducedEffects: false })`);
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
    assert(rewardConfig.guideImage === "art:encounterDial", `Encounter Dial should use generated guide art, got ${JSON.stringify(rewardConfig)}.`);

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
      right: window.DreamQuestDebug.getCharacterFrameDebug("yanOld", "right", 0)
    }))()`);
    assert(result.left.row === 2 && result.left.col === 4 && result.left.mirrored === false, `Old Yan left-walk should use unmirrored left-facing sheet frames, got ${JSON.stringify(result.left)}.`);
    assert(result.right.row === 2 && result.right.col === 0 && result.right.mirrored === true, `Old Yan right-walk should mirror the sheet's side frames, got ${JSON.stringify(result.right)}.`);
  });

  test("Gerthoud walk cycle uses locomotion frames", async () => {
    const result = await evalPage(cdp, `(() => {
      const progress = [0.01, 0.26, 0.51, 0.76];
      const verticalProgress = [0.25, 0.75];
      return {
        downEven: verticalProgress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "down", 0, { walkProgress, walkStepParity: 0 })),
        downOdd: verticalProgress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "down", 0, { walkProgress, walkStepParity: 1 })),
        upEven: verticalProgress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "up", 0, { walkProgress, walkStepParity: 0 })),
        upOdd: verticalProgress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "up", 0, { walkProgress, walkStepParity: 1 })),
        left: progress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "left", 0, { walkProgress })),
        right: progress.map((walkProgress) => window.DreamQuestDebug.getCharacterFrameDebug("gerthoud", "right", 0, { walkProgress }))
      };
    })()`);
    assert(result.downEven.map((frame) => frame.col).join(",") === "0,1" && result.downEven.every((frame) => frame.row === 0), `Gerthoud even down-walk should use the first front step pair, got ${JSON.stringify(result.downEven)}.`);
    assert(result.downOdd.map((frame) => frame.col).join(",") === "2,3" && result.downOdd.every((frame) => frame.row === 0), `Gerthoud odd down-walk should use the second front step pair, got ${JSON.stringify(result.downOdd)}.`);
    assert(result.upEven.map((frame) => frame.col).join(",") === "0,1" && result.upEven.every((frame) => frame.row === 1), `Gerthoud even up-walk should use the first back step pair, got ${JSON.stringify(result.upEven)}.`);
    assert(result.upOdd.map((frame) => frame.col).join(",") === "2,3" && result.upOdd.every((frame) => frame.row === 1), `Gerthoud odd up-walk should use the second back step pair, got ${JSON.stringify(result.upOdd)}.`);
    assert(result.left.map((frame) => frame.col).join(",") === "0,1,2,3" && result.left.every((frame) => frame.row === 2 && !frame.mirrored), `Gerthoud left-walk should use unmirrored side walk frames, got ${JSON.stringify(result.left)}.`);
    assert(result.right.map((frame) => frame.col).join(",") === "0,1,2,3" && result.right.every((frame) => frame.row === 2 && frame.mirrored), `Gerthoud right-walk should mirror side walk frames, got ${JSON.stringify(result.right)}.`);
  });

  test("ProphecyQuest directional sheets use up and side rows", async () => {
    const result = await evalPage(cdp, `(() => ({
      down: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "down", 0),
      up: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "up", 0),
      left: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "left", 0),
      right: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "right", 0),
      idleUp: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "up", 9999),
      battleIdleRight: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "right", 9999, { mode: "battle" }),
      hurt: window.DreamQuestDebug.getCharacterFrameDebug("alahim", "right", 9999, { action: "hurt" }),
      garseonRightStride: [0.01, 0.26, 0.51, 0.76].map((progress) => window.DreamQuestDebug.getCharacterFrameDebug("garseon", "right", 0, { walkProgress: progress })),
      latsonRightStride: [0.01, 0.26, 0.51, 0.76].map((progress) => window.DreamQuestDebug.getCharacterFrameDebug("latson", "right", 0, { walkProgress: progress })),
      garseonBattleRight: window.DreamQuestDebug.getCharacterFrameDebug("garseon", "right", 9999, { mode: "battle" }),
      garseonBattleLeft: window.DreamQuestDebug.getCharacterFrameDebug("garseon", "left", 9999, { mode: "battle" }),
      latsonBattleRight: window.DreamQuestDebug.getCharacterFrameDebug("latson", "right", 9999, { mode: "battle" }),
      latsonBattleLeft: window.DreamQuestDebug.getCharacterFrameDebug("latson", "left", 9999, { mode: "battle" })
    }))()`);
    assert(result.down.row === 0, `Alahim walking down should use the front row, got ${JSON.stringify(result.down)}.`);
    assert(result.up.row === 2, `Alahim walking up should use the back row, got ${JSON.stringify(result.up)}.`);
    assert(result.left.row === 1 && result.left.mirrored === false, `Alahim walking left should use the unmirrored side row, got ${JSON.stringify(result.left)}.`);
    assert(result.right.row === 1 && result.right.mirrored === true, `Alahim walking right should mirror the side row, got ${JSON.stringify(result.right)}.`);
    assert(result.idleUp.row === 2, `Alahim idle-up should use the back row, got ${JSON.stringify(result.idleUp)}.`);
    assert(result.battleIdleRight.row === 1 && result.battleIdleRight.mirrored === true, `Alahim battle idle should face right from the side row, got ${JSON.stringify(result.battleIdleRight)}.`);
    assert(result.hurt.row === 4, `Alahim hurt frames should use the generated action row, got ${JSON.stringify(result.hurt)}.`);
    assert(result.garseonBattleRight.row === 1 && result.garseonBattleRight.mirrored === true, `Garseon battle idle should face right from the side row, got ${JSON.stringify(result.garseonBattleRight)}.`);
    assert(result.latsonBattleRight.row === 1 && result.latsonBattleRight.mirrored === true, `Latson battle idle should face right from the side row, got ${JSON.stringify(result.latsonBattleRight)}.`);
    assert(result.garseonBattleLeft.row === 1 && result.garseonBattleLeft.mirrored === false, `Garseon left battle idle should keep the unmirrored side row, got ${JSON.stringify(result.garseonBattleLeft)}.`);
    assert(result.latsonBattleLeft.row === 1 && result.latsonBattleLeft.mirrored === false, `Latson left battle idle should keep the unmirrored side row, got ${JSON.stringify(result.latsonBattleLeft)}.`);
    assert(result.garseonRightStride.map((frame) => frame.col).join(",") === "0,2,4,6" && result.garseonRightStride.every((frame) => frame.row === 1 && frame.mirrored), `Garseon map walk should use wide side-stride frames, got ${JSON.stringify(result.garseonRightStride)}.`);
    assert(result.latsonRightStride.map((frame) => frame.col).join(",") === "0,2,4,6" && result.latsonRightStride.every((frame) => frame.row === 1 && frame.mirrored), `Latson map walk should use wide side-stride frames, got ${JSON.stringify(result.latsonRightStride)}.`);
    assert(Object.values(result.garseonBattleRight.crop).every((value) => value === 0) && Object.values(result.latsonBattleRight.crop).every((value) => value === 0), `Garseon and Latson battle crops should preserve full generated cells, got ${JSON.stringify(result)}.`);
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

  test("Tide Cavern chest and boss are placed on reachable paths", async () => {
    const result = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("tideCavern");
      window.DreamQuestDebug.setStoryFlag("tideQuest", true);
      const area = window.DreamQuestData.areas.tideCavern;
      const chest = area.events.find((event) => event.id === "tide_cache");
      const boss = area.events.find((event) => event.id === "river_slime_regent");
      return {
        chest,
        boss,
        chestReachable: window.DreamQuestDebug.canReachTile(chest.x, chest.y),
        bossReachable: window.DreamQuestDebug.canReachTile(boss.x, boss.y),
        bossManhattanFromEntry: Math.abs(boss.x - area.start[0]) + Math.abs(boss.y - area.start[1])
      };
    })()`);
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

  test("Old Betsy visit shows Honest Milk as an item reward", async () => {
    const triggered = await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqKrendonStable", 5, 4);
      window.DreamQuestDebug.setStoryFlag("psCottageDone", false);
      window.DreamQuestDebug.setStoryFlag("psOldBetsyDefeated", false);
      window.DreamQuestDebug.setStoryFlag("psVisitedBetsy", false);
      window.DreamQuestDebug.setStoryFlag("psGotBetsyMilk", false);
      window.DreamQuestDebug.setCompletedEvent("pq_old_betsy_visit", false);
      window.DreamQuestDebug.setInventoryItem("Honest Milk", 0);
      return window.DreamQuestDebug.triggerEventById("pq_old_betsy_visit");
    })()`);
    assert(triggered, "Could not trigger Old Betsy's visit event.");
    await closeDialogue(cdp);
    await waitFor(cdp, `!document.querySelector("#item-modal")?.classList.contains("is-hidden")`);
    const reward = await evalPage(cdp, `(() => {
      const canvas = document.querySelector("#item-modal-image");
      return {
        kicker: document.querySelector("#item-modal-kicker")?.textContent || "",
        name: document.querySelector("#item-modal-name")?.textContent || "",
        text: document.querySelector("#item-modal-text")?.textContent || "",
        image: canvas?.dataset.itemModalImage || "",
        milk: window.DreamQuestDebug.getState().inventory["Honest Milk"] || 0,
        visited: Boolean(window.DreamQuestDebug.getState().flags.psVisitedBetsy),
        gotMilk: Boolean(window.DreamQuestDebug.getState().flags.psGotBetsyMilk)
      };
    })()`);
    assert(reward.kicker === "Item Acquired", `Honest Milk should use the normal item reward modal, got ${JSON.stringify(reward)}.`);
    assert(reward.name === "Honest Milk", `Honest Milk reward modal should name the item, got ${JSON.stringify(reward)}.`);
    assert(reward.image === "item:milk", `Honest Milk reward modal should use milk item art, got ${JSON.stringify(reward)}.`);
    assert(reward.text.includes("Old Betsy"), `Honest Milk reward modal should explain the source, got ${JSON.stringify(reward)}.`);
    assert(reward.milk === 1, `Old Betsy visit should add one Honest Milk, got ${JSON.stringify(reward)}.`);
    assert(reward.visited && reward.gotMilk, `Old Betsy visit should keep its story flags, got ${JSON.stringify(reward)}.`);
    await click(cdp, "#item-modal-close");
  });

  test("Krendon roof escape opens forward and blocks backtracking", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqKitrinaCottage", 15, 0);
      window.DreamQuestDebug.setStoryFlag("psKrendonEscaped", true);
      window.DreamQuestDebug.setStoryFlag("psCottageDone", false);
      window.DreamQuestDebug.setStoryFlag("psKrendonBacktrackOpen", false);
    })()`);
    await closeDialogue(cdp);
    await sleep(120);
    await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }));`);
    await waitFor(cdp, `window.DreamQuestDebug.getState().areaId === "pqHawkPass"`, 3000);
    await closeDialogue(cdp);
    const forwardState = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(forwardState.areaId === "pqHawkPass", `Roof north exit should open the solo Hawk Mountain road after the scout fight without requiring psCottageDone, got ${JSON.stringify(forwardState)}.`);

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqHawkPass", 11, 16);
      window.DreamQuestDebug.setStoryFlag("psKrendonBacktrackOpen", false);
    })()`);
    await closeDialogue(cdp);
    await sleep(120);
    await evalPage(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));`);
    await waitFor(cdp, `!document.querySelector("#dialogue").classList.contains("is-hidden")`, 3000);
    const blocked = await evalPage(cdp, `(() => ({
      areaId: window.DreamQuestDebug.getState().areaId,
      speaker: document.querySelector("#speaker")?.textContent || "",
      text: document.querySelector("#dialogue-text")?.textContent || ""
    }))()`);
    assert(blocked.areaId === "pqHawkPass" && /need to leave/i.test(blocked.text), `Backtracking from the Hawk road should be blocked with a clear warning, got ${JSON.stringify(blocked)}.`);
    await closeDialogue(cdp);
  });

  test("Yvonne and Alahim travel alone before Yvette assigns guards", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqHawkPass", 11, 3);
      window.DreamQuestDebug.setPartyMembers(["yvonne", "alahim"]);
      window.DreamQuestDebug.setStoryFlag("psHawkPassDone", false);
      window.DreamQuestDebug.setStoryFlag("psGuardsJoined", false);
    })()`);
    await closeDialogue(cdp);
    const openedSolo = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_hawk_pass_alone")`);
    assert(openedSolo, "Could not trigger the solo Hawk Mountain road event.");
    await closeDialogue(cdp);
    const soloState = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    assert(
      soloState.flags.psHawkPassDone &&
        soloState.party.map((member) => member.id).join(",") === "yvonne,alahim",
      `The Hawk road should keep Yvonne and Alahim alone, got ${JSON.stringify(soloState.party.map((member) => member.id))}.`
    );

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqTealsburgRoad", 15, 8);
      window.DreamQuestDebug.setStoryFlag("psGuardsJoined", false);
    })()`);
    await closeDialogue(cdp);
    const openedYvette = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_yvette_guards")`);
    assert(openedYvette, "Could not trigger Yvette's Tealsburg guard event.");
    await closeDialogue(cdp);
    const tealsburgState = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    const partyIds = tealsburgState.party.map((member) => member.id);
    assert(
      tealsburgState.flags.psGuardsJoined && partyIds.includes("garseon") && partyIds.includes("latson"),
      `Yvette should provide Garseon and Latson in Tealsburg, got ${JSON.stringify(partyIds)}.`
    );
  });

  test("Latson crosses the Isle of the Dead alone before the party follows", async () => {
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqDreadedIsle", 4, 7);
      window.DreamQuestDebug.setPartyMembers(["latson"]);
      window.DreamQuestDebug.setStoryFlag("psLatsonIsleSolo", true);
      window.DreamQuestDebug.setStoryFlag("psDreadedIsleDone", false);
    })()`);
    await closeDialogue(cdp);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_dreaded_isle")`);
    assert(opened, "Could not trigger Latson's Isle of the Dead scene.");
    await closeDialogue(cdp);
    const state = await evalPage(cdp, `window.DreamQuestDebug.getState()`);
    const partyIds = state.party.map((member) => member.id);
    assert(
      state.flags.psDreadedIsleDone &&
        partyIds[0] === "tarthur" &&
        partyIds.includes("latson") &&
        partyIds.includes("uvit") &&
        partyIds.length > 1,
      `Latson's solo isle scene should complete the chapter and restore the main party, got ${JSON.stringify({ flags: state.flags, partyIds })}.`
    );
  });

  test("ProphecyQuest item, shop, and equipment icons use distinct art", async () => {
    const artReadyExpression = (ids) => `(() => {
      const data = window.DreamQuestData;
      return ${JSON.stringify(ids)}.every((id) => {
        const key = data.generatedGuideArt?.[id]?.assetKey;
        return key && window.DreamQuestDebug.isAssetReady(key);
      });
    })()`;
    const iconSnapshotExpression = `(async () => {
      const signature = (canvas) => {
        if (!canvas) return "";
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const stepX = Math.max(1, Math.floor(canvas.width / 8));
        const stepY = Math.max(1, Math.floor(canvas.height / 8));
        const cells = [];
        for (let y = 0; y < canvas.height; y += stepY) {
          for (let x = 0; x < canvas.width; x += stepX) {
            const i = (y * canvas.width + x) * 4;
            cells.push([data[i] >> 4, data[i + 1] >> 4, data[i + 2] >> 4, data[i + 3] >> 6].join(""));
          }
        }
        return cells.join(".");
      };
      const drawImageCover = (ctx, img, dx, dy, dw, dh, focusX = 0.5, focusY = 0.5, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) => {
        const targetRatio = dw / dh;
        const sourceRatio = sw / sh;
        let cropX = sx;
        let cropY = sy;
        let cropW = sw;
        let cropH = sh;
        if (sourceRatio > targetRatio) {
          cropW = sh * targetRatio;
          cropX = sx + Math.min(Math.max(sw * focusX - cropW / 2, 0), sw - cropW);
        } else {
          cropH = sw / targetRatio;
          cropY = sy + Math.min(Math.max(sh * focusY - cropH / 2, 0), sh - cropH);
        }
        ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
      };
      const guideImage = new Image();
      guideImage.src = window.DreamQuestData.assets.guideIcons;
      if (!guideImage.complete) await guideImage.decode().catch(() => {});
      const atlasSignature = (kind, id, w, h) => {
        const atlas = window.DreamQuestData.guideIconAtlas;
        const cell = atlas.cells[\`\${kind}:\${id}\`];
        if (!cell || !guideImage.complete) return "";
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        const sw = guideImage.naturalWidth / atlas.cols;
        const sh = guideImage.naturalHeight / atlas.rows;
        drawImageCover(ctx, guideImage, 0, 0, w, h, 0.5, 0.5, cell[0] * sw, cell[1] * sh, sw, sh);
        ctx.strokeStyle = "rgba(255, 221, 154, 0.28)";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        return signature(canvas);
      };
      const inventory = Object.fromEntries([...document.querySelectorAll(".menu-inventory-card")].map((card) => {
        const name = card.querySelector("strong")?.textContent || "";
        const canvas = card.querySelector("canvas[data-inventory-icon]");
        return [name, {
          key: canvas?.dataset.inventoryIcon || "",
          signature: signature(canvas),
          text: card.querySelector("small")?.textContent || ""
        }];
      }));
      const equipment = Object.fromEntries([...document.querySelectorAll(".equipment-visuals figure")].map((figure) => {
        const name = figure.querySelector("figcaption")?.textContent || "";
        const canvas = figure.querySelector("canvas[data-inventory-icon]");
        return [name, { key: canvas?.dataset.inventoryIcon || "", signature: signature(canvas) }];
      }));
      const shop = Object.fromEntries([...document.querySelectorAll(".shop-row")].map((row) => {
        const name = row.querySelector(".shop-item-copy strong")?.textContent || "";
        const canvas = row.querySelector("canvas.shop-item-icon");
        return [name, { key: canvas?.dataset.shopIcon || "", signature: signature(canvas) }];
      }).filter(([name]) => name));
      return {
        inventory,
        equipment,
        shop,
        atlas: {
          potionInventory: atlasSignature("item", "potion", 74, 74),
          etherInventory: atlasSignature("item", "ether", 74, 74),
          smokeInventory: atlasSignature("item", "smoke", 74, 74),
          potionShop: atlasSignature("item", "potion", 58, 58),
          etherShop: atlasSignature("item", "ether", 58, 58),
          wakeLeafShop: atlasSignature("item", "wakeLeaf", 58, 58),
          smokeShop: atlasSignature("item", "smoke", 58, 58)
        }
      };
    })()`;

    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.setPartyMembers(["yvonne", "alahim", "garseon", "latson"]);
      ["Potion", "Ether Leaf", "Smoke Nut", "Wake Leaf", "Twin Crossbow", "Dawarven Mail", "Dawarven Axe"].forEach((name) => {
        window.DreamQuestDebug.setInventoryItem(name, 1);
      });
      window.DreamQuestDebug.openMenu("inventory");
    })()`);
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector(".menu-inventory-card"))`);
    await waitFor(cdp, `window.DreamQuestDebug.isAssetReady("guideIcons")`, 10000);
    await waitFor(cdp, artReadyExpression(["twinCrossbow", "dawarvenMail", "dawarvenAxe"]), 10000);
    await waitFor(cdp, `(() => {
      const cards = [...document.querySelectorAll(".menu-inventory-card")].filter((card) => ["Potion", "Ether Leaf", "Smoke Nut"].includes(card.querySelector("strong")?.textContent || ""));
      const signatures = cards.map((card) => {
        const canvas = card.querySelector("canvas[data-inventory-icon]");
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 16) sum = (sum + data[i] * 3 + data[i + 1] * 5 + data[i + 2] * 7 + data[i + 3]) % 1000003;
        return String(sum);
      });
      return signatures.length === 3 && new Set(signatures).size === 3;
    })()`, 10000);
    let snapshot = await evalPage(cdp, iconSnapshotExpression);
    assert(snapshot.inventory.Potion?.key === "item:potion", `Potion should use potion art, got ${JSON.stringify(snapshot.inventory.Potion)}.`);
    assert(snapshot.inventory["Ether Leaf"]?.key === "item:ether", `Ether Leaf should use ether art, got ${JSON.stringify(snapshot.inventory["Ether Leaf"])}.`);
    assert(snapshot.inventory["Smoke Nut"]?.key === "item:smoke", `Smoke Nut should use smoke art, got ${JSON.stringify(snapshot.inventory["Smoke Nut"])}.`);
    assert(snapshot.inventory.Potion?.signature === snapshot.atlas.potionInventory, `Potion inventory icon should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.inventory.Potion)}.`);
    assert(snapshot.inventory["Ether Leaf"]?.signature === snapshot.atlas.etherInventory, `Ether Leaf inventory icon should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.inventory["Ether Leaf"])}.`);
    assert(snapshot.inventory["Smoke Nut"]?.signature === snapshot.atlas.smokeInventory, `Smoke Nut inventory icon should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.inventory["Smoke Nut"])}.`);
    assert(!snapshot.inventory["Prophecy Scroll"], `Prophecy Scroll should not be an inventory item, got ${JSON.stringify(snapshot.inventory["Prophecy Scroll"])}.`);
    assert(snapshot.inventory["Twin Crossbow"]?.key === "art:twinCrossbow", `Twin Crossbow inventory icon should use generated crossbow art, got ${JSON.stringify(snapshot.inventory["Twin Crossbow"])}.`);
    assert(snapshot.inventory["Dawarven Mail"]?.key === "art:dawarvenMail", `Dawarven Mail inventory icon should use generated armor art, got ${JSON.stringify(snapshot.inventory["Dawarven Mail"])}.`);
    assert(new Set(["Potion", "Ether Leaf", "Smoke Nut"].map((name) => snapshot.inventory[name]?.signature)).size === 3, `Consumable inventory icons should not duplicate each other, got ${JSON.stringify(snapshot.inventory)}.`);
    assert(snapshot.inventory.Potion?.text !== "Added to inventory.", `Potion should use catalog copy, got ${JSON.stringify(snapshot.inventory.Potion)}.`);

    await click(cdp, '[data-menu-tab="equipment"]');
    await waitFor(cdp, `Boolean([...document.querySelectorAll(".equipment-visuals figcaption")].find((caption) => caption.textContent === "Prophecy Staff"))`);
    await waitFor(cdp, artReadyExpression(["prophecyStaff", "twinCrossbow"]), 10000);
    snapshot = await evalPage(cdp, iconSnapshotExpression);
    assert(snapshot.equipment["Twin Crossbow"]?.key === "art:twinCrossbow", `Twin Crossbow equipment icon should not be a sword, got ${JSON.stringify(snapshot.equipment["Twin Crossbow"])}.`);
    assert(snapshot.equipment["Prophecy Staff"]?.key === "art:prophecyStaff", `Prophecy Staff equipment icon should not be a sword, got ${JSON.stringify(snapshot.equipment["Prophecy Staff"])}.`);
    assert(snapshot.equipment["Twin Crossbow"]?.signature !== snapshot.equipment["Prophecy Staff"]?.signature, `Twin Crossbow and Prophecy Staff should render differently, got ${JSON.stringify(snapshot.equipment)}.`);
    await click(cdp, "#close-menu");

    await evalPage(cdp, `window.DreamQuestDebug.travelTo("pqKrendonFlight")`);
    await closeDialogue(cdp);
    const openedKrendonShop = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_krendon_shop")`);
    assert(openedKrendonShop, "Could not open Krendon flight supplies.");
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector('[data-shop-buy="Wake Leaf"]'))`);
    await waitFor(cdp, `window.DreamQuestDebug.isAssetReady("guideIcons")`, 10000);
    snapshot = await evalPage(cdp, iconSnapshotExpression);
    assert(snapshot.shop.Potion?.signature === snapshot.atlas.potionShop, `Shop Potion should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop.Potion)}.`);
    assert(snapshot.shop["Ether Leaf"]?.signature === snapshot.atlas.etherShop, `Shop Ether Leaf should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop["Ether Leaf"])}.`);
    assert(snapshot.shop["Wake Leaf"]?.signature === snapshot.atlas.wakeLeafShop, `Shop Wake Leaf should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop["Wake Leaf"])}.`);
    assert(snapshot.shop["Smoke Nut"]?.signature === snapshot.atlas.smokeShop, `Shop Smoke Nut should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop["Smoke Nut"])}.`);
    await click(cdp, "#close-menu");

    await evalPage(cdp, `window.DreamQuestDebug.travelTo("pqDwarfRefuge")`);
    await closeDialogue(cdp);
    const opened = await evalPage(cdp, `window.DreamQuestDebug.triggerEventById("pq_dwarf_shop")`);
    assert(opened, "Could not open Dawarven refuge forge.");
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden") && Boolean(document.querySelector('[data-shop-buy="Dawarven Mail"]'))`);
    await waitFor(cdp, `window.DreamQuestDebug.isAssetReady("guideIcons")`, 10000);
    await waitFor(cdp, artReadyExpression(["dawarvenMail", "dawarvenAxe"]), 10000);
    snapshot = await evalPage(cdp, iconSnapshotExpression);
    assert(snapshot.shop.Potion?.key === "item:potion", `Shop Potion should use potion art, got ${JSON.stringify(snapshot.shop.Potion)}.`);
    assert(snapshot.shop["Ether Leaf"]?.key === "item:ether", `Shop Ether Leaf should use ether art, got ${JSON.stringify(snapshot.shop["Ether Leaf"])}.`);
    assert(snapshot.shop.Potion?.signature === snapshot.atlas.potionShop, `Shop Potion should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop.Potion)}.`);
    assert(snapshot.shop["Ether Leaf"]?.signature === snapshot.atlas.etherShop, `Shop Ether Leaf should render the DQ1 raster atlas cell, got ${JSON.stringify(snapshot.shop["Ether Leaf"])}.`);
    assert(snapshot.shop["Dawarven Mail"]?.key === "art:dawarvenMail", `Shop Dawarven Mail should use generated armor art, got ${JSON.stringify(snapshot.shop["Dawarven Mail"])}.`);
    assert(snapshot.shop["Dawarven Axe"]?.key === "art:dawarvenAxe", `Shop Dawarven Axe should use generated axe art, got ${JSON.stringify(snapshot.shop["Dawarven Axe"])}.`);
    assert(snapshot.shop["Dawarven Mail"]?.signature !== snapshot.shop["Dawarven Axe"]?.signature, `Shop gear icons should not duplicate fallback art, got ${JSON.stringify(snapshot.shop)}.`);
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
    assert(result.yan.join(",") === "dragonShape", `Yan should join with only Dragon Shape, got ${result.yan.join(",")}.`);
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
    assert(result.yan.includes("scaleRake") && result.yan.includes("windSpell"), "Yan should unlock later dragon and wind skills by level.");
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

  test("generic scenery hint does not impersonate absent party members", async () => {
    const source = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
    assert(
      !source.includes('["Derlin", "If a building has an errand inside') &&
        source.includes('["Narrator", "If a building has an errand inside'),
      "Blocked building guidance should use the narrator, not Derlin."
    );
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

  test("route minimap shows only the local neighborhood", async () => {
    const isProphecyQuest = await evalPage(cdp, `window.DreamQuestData.gameConfig.id === "prophecy-sword"`);
    if (!isProphecyQuest) return;
    const samples = [];
    for (const areaId of ["pqKrendonFlight", "pqTealsburgRoad", "pqDeguzCouncil", "sqShoals", "sqVolcano"]) {
      await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(areaId)})`);
      await closeDialogue(cdp);
      samples.push(await evalPage(cdp, `window.DreamQuestDebug.getMiniMapDebug()`));
    }
    assert(samples.every((sample) => sample.boardIds.length <= 5), `Route minimap should show at most five local panels, got ${JSON.stringify(samples)}.`);
    samples.forEach((sample) => {
      assert(sample.boardIds.includes(sample.areaId), `Route minimap should include the active area, got ${JSON.stringify(sample)}.`);
      assert(sample.totalGroupBoards > sample.boardIds.length, `Large route groups should be cropped to a local neighborhood, got ${JSON.stringify(sample)}.`);
    });
    const tealsburg = samples.find((sample) => sample.areaId === "pqTealsburgRoad");
    assert(tealsburg.boardIds.includes("pqHawkPass") && tealsburg.boardIds.includes("pqSkullKnightChase") && !tealsburg.boardIds.includes("sqVolcano"), `Tealsburg minimap should show nearby route panels only, got ${JSON.stringify(tealsburg)}.`);
    const volcano = samples.find((sample) => sample.areaId === "sqVolcano");
    assert(volcano.boardIds.includes("sqVolcanoForge") && !volcano.boardIds.includes("pqDeguzIntro"), `Volcano minimap should not show the early ProphecyQuest route, got ${JSON.stringify(volcano)}.`);
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
    await waitFor(cdp, `!document.querySelector("#menu-modal").classList.contains("is-hidden")`);
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

  test("save/load round trip preserves area", async () => {
    const targetAreaId = await evalPage(cdp, `Object.keys(window.DreamQuestData.areas).find((id) => id !== window.DreamQuestData.gameConfig.startAreaId) || window.DreamQuestData.gameConfig.startAreaId`);
    await evalPage(cdp, `window.DreamQuestDebug.travelTo(${JSON.stringify(targetAreaId)}); window.DreamQuestDebug.saveLocal();`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    const enabled = await evalPage(cdp, `!document.querySelector("#continue-game").disabled`);
    assert(enabled, "Continue should be enabled after saving.");
    await click(cdp, "#continue-game");
    await waitFor(cdp, `window.DreamQuestDebug.getState()?.areaId === ${JSON.stringify(targetAreaId)}`, 5000);
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
      canvases: document.querySelectorAll(".guide-image").length,
      tabStrip: (() => {
        const strip = document.querySelector(".guide-tabs");
        const button = strip?.querySelector(".menu-tab");
        if (!strip || !button) return null;
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          height: Math.round(strip.getBoundingClientRect().height),
          buttonHeight: Math.round(rect.height),
          minHeight: parseFloat(getComputedStyle(strip).minHeight),
          hit: hit === button || button.contains(hit)
        };
      })()
    }))()`);
    assert(guide.active === snapshot.config.defaultGuideSection, "Guide should open to the configured default section.");
    assert(guide.sections === 1, "Guide should render one section at a time.");
    assert(guide.entries === snapshot.guideSectionCounts[snapshot.config.defaultGuideSection], "Default guide section should render the configured entries.");
    assert(guide.entries > 0 && guide.canvases === guide.entries, "Guide entries should each have one image canvas.");
    assert(guide.tabStrip?.minHeight >= 52 && guide.tabStrip.height >= guide.tabStrip.buttonHeight && guide.tabStrip.hit, `Guide tabs should remain fully visible and clickable, got ${JSON.stringify(guide.tabStrip)}.`);
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
    await click(cdp, "#close-guide");
    await waitFor(cdp, `document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    await evalPage(cdp, `document.querySelector("#guide-content").replaceChildren()`);
  });

  test("ProphecyQuest generated art replaces reused guide and enemy cells", async () => {
    const dataCheck = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const requiredEnemies = [
        "breswickStalker", "cottageRider", "dreadedIsleWraith", "cloudwalkerAcolyte",
        "gnomeGearTrap", "seaboatLeviathan", "phoenixAshKnight", "forgeCinderKnight",
        "cloudShade", "prophecyHunter", "kitrinaScout", "skullRider", "skullVanguard",
        "dwarfTrial", "kitrinaRider", "mountedSkullKnight", "corizazAgent", "wallKnight",
        "corizazAwake", "darhynEcho", "blackKnight", "blackKnightCaptain", "goblinSpeaker",
        "persericaxMote", "maelirLoyalist", "garkinFallen", "darhynSword", "persericaxCore"
      ];
      const sequelSheetIds = ["alahim", "garseon", "latson", "fientien", "uvit", "addyean", "yvette", "lily", "yonathan", "sora", "viyasa", "polu", "calaie"];
      const reusedTemplateSheets = new Set(["scribeSheet", "marthaSheet", "kingGarkinSheet", "chairmanEorSheet", "merwizardSheet", "elvenKingSheet"]);
      const sequelSheetAssets = Object.fromEntries(sequelSheetIds.map((id) => {
        const assetKey = data.characterSheetKeys[id];
        return [id, { assetKey, src: data.assets[assetKey] || "" }];
      }));
      const skillEntries = Object.entries(data.skillCatalog);
      const skillSpellIds = skillEntries.map(([, skill]) => skill.spellId || "");
      const repeatedSpellIds = [...new Set(skillSpellIds.filter((spellId, index) => spellId && skillSpellIds.indexOf(spellId) !== index))];
      const guideSpellImages = (data.guideData.spells || []).map((entry) => entry.image);
      const mapStats = (id) => {
        const rows = data.areas[id]?.map || [];
        const counts = {};
        rows.forEach((row) => [...row].forEach((char) => {
          counts[char] = (counts[char] || 0) + 1;
        }));
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;
        const dominant = Math.max(...Object.values(counts), 0) / total;
        return { id, unique: Object.keys(counts).length, dominant };
      };
      const complexMapIds = [
        "pqBreswickRoad", "pqKitrinaCottage", "pqHawkPass", "pqTealsburgRoad", "pqSkullKnightChase",
        "pqDwarfRefuge", "pqHigeria", "pqRuf", "pqDreadedIsle", "pqCloudwalkerPass",
        "pqLaiaWall", "sqDeguzRecords", "sqUnityStudy", "sqGnomeTunnel", "sqGoggeogo",
        "sqGoblinCourt", "sqPoy", "sqSeaboatRoute", "sqPhoenixGrove", "sqVolcanoForge", "sqVolcano"
      ];
      const expectedGuideArtAssets = {
        runeSword: "psGuideRuneSword",
        lightSword: "psGuideLightSword",
        swordOfDarkness: "psGuideSwordOfDarkness",
        unityBlade: "psGuideUnityBlade",
        airFeather: "psGuideAirFeather",
        waterOrb: "psGuideWaterOrb",
        earthGrain: "psGuideEarthGrain",
        phoenixKiss: "psGuidePhoenixKiss",
        gnomeAccord: "psGuideGnomeAccord",
        breshenStandard: "psGuideBreshenStandard",
        kandanHand: "psGuideKandanHand",
        prophecyStaff: "psGuideProphecyStaff",
        guardSpear: "psGuideGuardSpear",
        dawarvenAxe: "psGuideDawarvenAxe",
        twinCrossbow: "psGuideTwinCrossbow",
        dawarvenMail: "psGuideDawarvenMail",
        oracleRobe: "psGuideOracleRobe",
        breshenFieldGuard: "psGuideBreshenFieldGuard",
        roadCloak: "psGuideRoadCloak",
        moonthreadRing: "psGuideMoonthreadRing",
        waterOrbFocus: "psGuideWaterOrbFocus",
        tidePearl: "psGuideTidePearl",
        skyCharm: "psGuideSkyCharm",
        encounterDial: "psGuideEncounterDial",
        seaboatWrit: "psGuideSeaboatWrit",
        phoenixGrove: "psGuidePhoenixGrove",
        volcanoForge: "psGuideVolcanoForge"
      };
      const collectStrings = (value, path = "root", seen = new Set()) => {
        if (value == null || typeof value === "function") return [];
        if (typeof value === "string") return [[path, value]];
        if (typeof value !== "object") return [];
        if (seen.has(value)) return [];
        seen.add(value);
        if (Array.isArray(value)) {
          return value.flatMap((entry, index) => collectStrings(entry, path + "[" + index + "]", seen));
        }
        return Object.entries(value).flatMap(([key, entry]) => collectStrings(entry, path + "." + key, seen));
      };
      const preRevealAreaIds = [
        "pqDeguzIntro", "pqBreswickRoad", "pqKrendonFlight", "pqKitrinaCottage",
        "pqHawkPass", "pqTealsburgRoad", "pqSkullKnightChase", "pqDwarfRefuge", "pqHigeria",
        "pqDeguzCouncil", "pqWalis"
      ];
      const publicSpoilerRegex = /mistaken|wrong child|true one|not the true|real one|misread|Alahim's mistake|mistake-shaped|Uvit[^.]{0,40}true/i;
      const publicStorySurfaces = {
        guideTrilogy: data.guideData.trilogy,
        guideCharacters: data.guideData.characters,
        guideItems: data.guideData.items,
        guideSpells: data.guideData.spells,
        guideRoute: data.guideData.route,
        openingCutscenes: {
          prophecyWrongChild: data.cutsceneImages.prophecyWrongChild,
          deguzCouncil: data.cutsceneImages.deguzCouncil
        },
        preRevealAreas: Object.fromEntries(preRevealAreaIds.map((id) => [id, data.areas[id]]))
      };
      const centeredSequelStoryEvents = Object.entries(data.areas)
        .flatMap(([areaId, area]) => (area.events || []).map((event) => ({ areaId, ...event })))
        .filter((event) => /^(pq|sq)_/.test(event.id || "") && (event.once || event.boss) && event.x === 12 && event.y === 12)
        .map((event) => [event.areaId, event.id]);
      const sideRewardEvents = Object.entries(data.areas)
        .flatMap(([areaId, area]) => (area.events || []).map((event) => ({ areaId, ...event })))
        .filter((event) => /^(pq|sq)_/.test(event.id || "") && /(cache|dead_end|side)/.test(event.id || "") && event.x !== 12 && event.y !== 12)
        .map((event) => [event.areaId, event.id, event.x, event.y]);
      const branchPathMapIds = [
        "pqHawkPass", "pqTealsburgRoad", "pqSkullKnightChase", "pqHigeria", "pqWalis",
        "pqDreadedIsle", "pqCloudwalkerPass", "sqPoy", "sqSeaboatRoute",
        "sqPhoenixGrove", "sqVolcanoForge", "sqVolcano"
      ];
      const branchPathStats = branchPathMapIds.map((id) => {
        const rows = data.areas[id]?.map || [];
        let lateralPathTiles = 0;
        rows.forEach((row, y) => [...row].forEach((char, x) => {
          if (char === "=" && x !== 12 && y !== 12) lateralPathTiles += 1;
        }));
        return { id, lateralPathTiles };
      });
      const legacyEnemyIds = [
        "dreamDarhyn", "mole", "chomonster", "goblin", "lithar1", "marhynGuard",
        "corizaz", "fear", "skullKnight", "yvette", "hano", "lithar2", "darhyn",
        "dustKnight", "riverSlime", "marshWisp", "paperMimic", "crystalMole"
      ];
      const guideEnemyIds = (data.guideData.enemies || []).map((entry) => String(entry.image || "").replace(/^enemy:/, ""));
      const activeEnemyIdList = [...(data.activeEnemyIds || [])];
      return {
        routeCount: data.areaOrder.length,
        firstPlayableArea: data.areaOrder[1],
        startPartyIds: data.gameConfig.startPartyIds,
        openingAreaName: data.areas.pqDeguzIntro.name,
        openingMood: data.areas.pqDeguzIntro.mood,
        openingEventIds: data.areas.pqDeguzIntro.events.map((event) => event.id),
        openingCutsceneEvents: data.areas.pqDeguzIntro.events.filter((event) => event.cutscene).map((event) => event.id),
        openingEvent: {
          id: data.areas.pqDeguzIntro.events[0]?.id,
          cutscene: data.areas.pqDeguzIntro.events[0]?.cutscene,
          text: collectStrings(data.areas.pqDeguzIntro.events[0]?.lines || []).map(([, text]) => text).join(" ")
        },
        openingAllText: collectStrings(data.areas.pqDeguzIntro.events.flatMap((event) => event.lines || []))
          .map(([, text]) => text)
          .join(" "),
        openingActors: {
          gerthoudSheet: data.characterSheetKeys.gerthoud,
          gerthoudAsset: data.assets.gerthoudSheet,
          tivuSheet: data.characterSheetKeys.tivuCloudwalker,
          tivuAsset: data.assets.tivuCloudwalkerSheet,
          tivuPortrait: data.customPortraitKeys.tivuCloudwalker,
          corizazPortrait: data.customPortraitKeys.corizazProfile,
          tivuSpeakerPortrait: data.speakerPortraits.Tivu,
          corizazSpeakerPortrait: data.speakerPortraits.Corizaz,
          tivuSprite: data.npcSpriteByEventId.pq_walis_tivu,
          corizazSprite: data.npcSpriteByEventId.pq_walis_corizaz,
          tivuCanWander: !data.stationaryNpcEventIds.has("pq_walis_tivu"),
          corizazCanWander: !data.stationaryNpcEventIds.has("pq_walis_corizaz"),
          corizazRequires: data.areas.pqDeguzIntro.events.find((event) => event.id === "pq_walis_corizaz")?.requires,
          tivuHideFlag: data.areas.pqDeguzIntro.events.find((event) => event.id === "pq_walis_tivu")?.hideWhenFlag
        },
        openingRouteImage: data.routeGuideImageKeys.pqDeguzIntro,
        mortySprite: data.npcSpriteByEventId.pq_krendon_morty,
        neighborSprite: data.npcSpriteByEventId.pq_krendon_neighbor,
        neighborIcon: data.areas.pqKrendonFlight.events.find((event) => event.id === "pq_krendon_neighbor")?.icon,
        neighborPortrait: data.speakerPortraits["Krendon Neighbor"],
        usesKrendonMap: JSON.stringify(data.areas.pqKrendonFlight.map) === JSON.stringify(data.areas.krendon.map),
        krendonHeroHouseExpanded: data.areas.pqKrendonFlight.map.some((row) => row.includes("wwddddww")),
        krendonEscapeExit: data.areas.pqKrendonFlight.exits.find((exit) => exit.edge === "south"),
        krendonOpeningEventIds: data.areas.pqKrendonFlight.events.map((event) => event.id),
        krendonOpeningText: collectStrings([
          ...data.areas.pqKrendonFlight.events.flatMap((event) => event.lines || []),
          ...data.areas.pqYvonneHome.events.flatMap((event) => event.lines || [])
        ]).map(([, text]) => text).join(" "),
        krendonHomeDoorRequiresBetsy: data.areas.pqKrendonFlight.events.find((event) => event.id === "pq_home_door")?.requires,
        betsyVisit: {
          exists: Boolean(data.areas.pqKrendonStable),
          boss: data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_visit")?.boss || null,
          actionText: collectStrings(data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_visit")?.lines || [])
            .map(([, text]) => text)
            .join(" "),
          milkHidden: data.regularInventoryHiddenItems.has("Honest Milk")
        },
        betsySidequest: {
          boss: data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_sidequest")?.boss || null,
          requires: data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_sidequest")?.requires || "",
          hideWhenFlag: data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_sidequest")?.hideWhenFlag || "",
          rewards: data.areas.pqKrendonStable?.events.find((event) => event.id === "pq_old_betsy_sidequest")?.itemRewards?.map((reward) => reward.name) || []
        },
        prophecyScrollSurfaces: {
          guideItem: data.guideData.items.some((entry) => entry.name === "Prophecy Scroll"),
          creatorGear: Boolean(data.creatorGear?.["Prophecy Scroll"]),
          eventReward: Object.values(data.areas).flatMap((area) => area.events || [])
            .some((event) => (event.itemRewards || []).some((reward) => reward.name === "Prophecy Scroll")),
          generatedArt: Boolean(data.generatedGuideArt?.prophecyScroll),
          asset: Boolean(data.assets.psGuideProphecyScroll),
          focusRequiresItem: data.skillCatalog.prophecyFocus?.requiresItem || "",
          focusRequiresFlag: data.skillCatalog.prophecyFocus?.requiresFlag || "",
          focusLearn: data.skillCatalog.prophecyFocus?.learn || ""
        },
        activeEnemyIdList,
        guideEnemyIds,
        legacyActiveEnemyIds: legacyEnemyIds.filter((id) => activeEnemyIdList.includes(id)),
        legacyGuideEnemyIds: legacyEnemyIds.filter((id) => guideEnemyIds.includes(id)),
        homeFlow: {
          hasMain: Boolean(data.areas.pqYvonneHome),
          hasBedroom: Boolean(data.areas.pqYvonneBedroom),
          hasLoft: Boolean(data.areas.pqYvonneLoft),
          homeName: data.areas.pqYvonneHome?.name || "",
          homeSize: [data.areas.pqYvonneHome?.map?.[0]?.length || 0, data.areas.pqYvonneHome?.map?.length || 0],
          bedroomSize: [data.areas.pqYvonneBedroom?.map?.[0]?.length || 0, data.areas.pqYvonneBedroom?.map?.length || 0],
          loftSize: [data.areas.pqYvonneLoft?.map?.[0]?.length || 0, data.areas.pqYvonneLoft?.map?.length || 0],
          homeParent: data.areaWorldParents.pqYvonneHome,
          bedroomParent: data.areaWorldParents.pqYvonneBedroom,
          loftParent: data.areaWorldParents.pqYvonneLoft,
          settleFlag: data.areas.pqYvonneHome?.events.find((event) => event.id === "pq_home_settle")?.hideWhenFlag,
          tiredEvent: data.areas.pqYvonneBedroom?.events.find((event) => event.id === "pq_alahim_tired")?.id,
          arrivalRequires: data.areas.pqYvonneHome?.events.find((event) => event.id === "pq_home_kitrina_arrival")?.requires,
          loftExit: data.areas.pqYvonneLoft?.exits.find((exit) => exit.edge === "north")?.to
        },
        roofFlow: {
          fightBoss: data.areas.pqKitrinaCottage.events.find((event) => event.id === "pq_roof_scout_fight")?.boss,
          fightEnemies: data.areas.pqKitrinaCottage.events.find((event) => event.id === "pq_roof_scout_fight")?.battleEnemies || [],
          jumpRequires: data.areas.pqKitrinaCottage.events.find((event) => event.id === "pq_cottage_roof_rescue")?.requires,
          jumpCutscene: data.areas.pqKitrinaCottage.events.find((event) => event.id === "pq_cottage_roof_rescue")?.cutscene,
          roofSize: [data.areas.pqKitrinaCottage.map[0].length, data.areas.pqKitrinaCottage.map.length],
          southExitRequires: data.areas.pqKitrinaCottage.exits.find((exit) => exit.edge === "south")?.requires,
          southExitBlockText: collectStrings(data.areas.pqKitrinaCottage.exits.find((exit) => exit.edge === "south")?.blockedLines || [])
            .map(([, text]) => text)
            .join(" "),
          northExit: data.areas.pqKitrinaCottage.exits.find((exit) => exit.edge === "north"),
          hawkReturn: data.areas.pqHawkPass.exits.find((exit) => exit.edge === "south"),
          hawkReturnBlockText: collectStrings(data.areas.pqHawkPass.exits.find((exit) => exit.edge === "south")?.blockedLines || [])
            .map(([, text]) => text)
            .join(" ")
        },
        hawkPassFlow: {
          exists: Boolean(data.areas.pqHawkPass),
          name: data.areas.pqHawkPass?.name || "",
          reusesHawkMap: JSON.stringify(data.areas.pqHawkPass?.map) === JSON.stringify(data.areas.hawkMountains.map),
          soloEvent: data.areas.pqHawkPass?.events.find((event) => event.id === "pq_hawk_pass_alone"),
          northExit: data.areas.pqHawkPass?.exits.find((exit) => exit.edge === "north"),
          text: collectStrings(data.areas.pqHawkPass || {}).map(([, text]) => text).join(" ")
        },
        tealsburgFlow: {
          name: data.areas.pqTealsburgRoad?.name || "",
          reusesTealsburgMap: JSON.stringify(data.areas.pqTealsburgRoad?.map) === JSON.stringify(data.areas.tealsburg.map),
          yvetteEvent: data.areas.pqTealsburgRoad?.events.find((event) => event.id === "pq_yvette_guards"),
          yvetteText: collectStrings(data.areas.pqTealsburgRoad?.events.find((event) => event.id === "pq_yvette_guards")?.lines || [])
            .map(([, text]) => text)
            .join(" "),
          northExit: data.areas.pqTealsburgRoad?.exits.find((exit) => exit.edge === "north"),
          southExit: data.areas.pqTealsburgRoad?.exits.find((exit) => exit.edge === "south")
        },
        roadBacktrackLinks: data.areaMiniMapGroups.pqDeguzIntro?.boards?.pqTealsburgRoad?.links || [],
        krendonFlagOrder: ["psGerthoudKilled", "psVisitedBetsy", "psHomeSettled", "psAlahimTired", "psKitrinaArrived", "psKrendonEscaped", "psCottageDone", "psHawkPassDone", "psGuardsJoined"]
          .map((flag) => [flag, data.creatorRouteFlags.indexOf(flag)]),
        centeredSequelStoryEvents,
        sideRewardEvents,
        branchPathStats,
        usesFreetonMap: JSON.stringify(data.areas.sqFreetonSearch.map) === JSON.stringify(data.areas.freeton.map),
        usesTealsburgMap: JSON.stringify(data.areas.sqTealsburgWar.map) === JSON.stringify(data.areas.tealsburg.map),
        usesBreshenMap: JSON.stringify(data.areas.sqBreshen.map) === JSON.stringify(data.areas.breshen.map),
        usesMerfolkShoalsMap: JSON.stringify(data.areas.sqMerfolkCouncil.map) === JSON.stringify(data.areas.merfolkShoals.map) &&
          JSON.stringify(data.areas.sqShoals.map) === JSON.stringify(data.areas.merfolkShoals.map),
        lowComplexityRouteMaps: complexMapIds.map(mapStats).filter((stats) => stats.unique < 3 || stats.dominant > 0.78),
        publicSpoilerHits: collectStrings(publicStorySurfaces)
          .filter(([, text]) => publicSpoilerRegex.test(text))
          .map(([path, text]) => [path, text]),
        hasGerthoudSceneArt: data.cutsceneImages.gerthoudCorizaz?.assetKey === "psSceneGerthoudCorizaz",
        gerthoudFlagBeforeKrendon: data.creatorRouteFlags.indexOf("psGerthoudKilled") > data.creatorRouteFlags.indexOf("psIntroDone") &&
          data.creatorRouteFlags.indexOf("psGerthoudKilled") < data.creatorRouteFlags.indexOf("psKrendonEscaped"),
        dawarvenCutscene: data.cutsceneImages.dawarvenRefuge?.assetKey,
        higeriaCutscene: data.cutsceneImages.higeriaArrival?.assetKey,
        kitrinaCottageCutscene: data.cutsceneImages.kitrinaCottageRoof?.assetKey,
        deguzCouncilCutscene: data.cutsceneImages.deguzCouncil?.assetKey,
        dreadedIsleCutscene: data.cutsceneImages.dreadedIsle?.assetKey,
        seaboatRouteCutscene: data.cutsceneImages.seaboatRoute?.assetKey,
        kitrinaCottageEventCutscene: data.areas.pqKitrinaCottage.events.find((event) => event.id === "pq_cottage_roof_rescue")?.cutscene,
        deguzCouncilEventCutscene: data.areas.pqDeguzCouncil.events.find((event) => event.id === "pq_council_forms")?.cutscene,
        dreadedIsleEventCutscene: data.areas.pqDreadedIsle.events.find((event) => event.id === "pq_dreaded_isle")?.cutscene,
        latsonIsleFlow: {
          areaName: data.areas.pqDreadedIsle?.name || "",
          encounterRate: data.areas.pqDreadedIsle?.encounterRate,
          eventRequires: data.areas.pqDreadedIsle.events.find((event) => event.id === "pq_dreaded_isle")?.requires || "",
          eventText: collectStrings(data.areas.pqDreadedIsle.events.find((event) => event.id === "pq_dreaded_isle")?.lines || [])
            .map(([, text]) => text)
            .join(" "),
          cutsceneAlt: data.cutsceneImages.dreadedIsle?.alt || "",
          routeText: data.guideData.route.find((entry) => entry.image === "route:pqDreadedIsle")?.text || "",
          flagIndex: data.creatorRouteFlags.indexOf("psLatsonIsleSolo"),
          rufFlagIndex: data.creatorRouteFlags.indexOf("psRufDone"),
          doneFlagIndex: data.creatorRouteFlags.indexOf("psDreadedIsleDone")
        },
        seaboatRouteEventCutscene: data.areas.sqSeaboatRoute.events.find((event) => event.id === "sq_seaboat_route")?.cutscene,
        fientienEventCutscene: data.areas.pqDwarfRefuge.events.find((event) => event.id === "pq_fientien_join")?.cutscene,
        higeriaEventCutscene: data.areas.pqHigeria.events.find((event) => event.id === "pq_higeria_arrival")?.cutscene,
        krendonFlightRouteImage: data.routeGuideImageKeys.pqKrendonFlight,
        kitrinaCottageRouteImage: data.routeGuideImageKeys.pqKitrinaCottage,
        hawkPassRouteImage: data.routeGuideImageKeys.pqHawkPass,
        deguzCouncilRouteImage: data.routeGuideImageKeys.pqDeguzCouncil,
        dreadedIsleRouteImage: data.routeGuideImageKeys.pqDreadedIsle,
        seaboatRouteImage: data.routeGuideImageKeys.sqSeaboatRoute,
        prophecySwordRouteImages: data.areaOrder.map((id) => [id, data.routeGuideImageKeys[id]]),
        dawarvenRouteImage: data.routeGuideImageKeys.pqDwarfRefuge,
        higeriaRouteImage: data.routeGuideImageKeys.pqHigeria,
        unityStudyCutscene: data.cutsceneImages.unityStudy?.assetKey,
        gnomeTunnelCutscene: data.cutsceneImages.gnomeTunnel?.assetKey,
        goblinCourtCutscene: data.cutsceneImages.goblinCourt?.assetKey,
        unityStudyEventCutscene: data.areas.sqUnityStudy.events.find((event) => event.id === "sq_unity_study")?.cutscene,
        gnomeTunnelEventCutscene: data.areas.sqGnomeTunnel.events.find((event) => event.id === "sq_gnome_tunnel_entry")?.cutscene,
        goblinCourtEventCutscene: data.areas.sqGoblinCourt.events.find((event) => event.id === "sq_goblin_court")?.cutscene,
        swordQuestRouteImages: ["sqUnityStudy", "sqGnomeTunnel", "sqGoggeogo", "sqGoblinCourt"].map((id) => [id, data.routeGuideImageKeys[id]]),
        unityBladePatternImage: data.guideData.items.find((entry) => entry.name === "Unity Blade Pattern")?.image,
        goblinAccordImage: data.guideData.items.find((entry) => entry.name === "Goblin Accord")?.image,
        goblinAccordRewardImage: data.areas.sqGoggeogo.events.find((event) => event.id === "sq_goblin_debate")?.itemRewards?.find((reward) => reward.name === "Goblin Accord")?.image,
        unityBladePatternArt: data.generatedGuideArt.unityBladePattern?.assetKey,
        goblinAccordArt: data.generatedGuideArt.goblinAccord?.assetKey,
        shoalsWaterOrbCutscene: data.cutsceneImages.shoalsWaterOrb?.assetKey,
        phoenixGroveCutscene: data.cutsceneImages.phoenixGrove?.assetKey,
        volcanoForgeCutscene: data.cutsceneImages.volcanoForge?.assetKey,
        shoalsWaterOrbAfterCutscene: data.areas.sqShoals.events.find((event) => event.id === "sq_water_orb_mote")?.afterCutscene,
        phoenixGroveAfterCutscene: data.areas.sqPhoenixGrove.events.find((event) => event.id === "sq_phoenix_grove")?.afterCutscene,
        volcanoForgeEventCutscene: data.areas.sqVolcanoForge.events.find((event) => event.id === "sq_unity_forge_rite")?.cutscene,
        lateSwordQuestRouteImages: ["sqMerfolkCouncil", "sqShoals", "sqBreshen", "sqPhoenixGrove", "sqVolcanoForge", "sqVolcano"].map((id) => [id, data.routeGuideImageKeys[id]]),
        alahimSheetAsset: data.assets.alahimSheet,
        alahimScale: data.characterSheetDisplayScale.alahim?.map,
        yvonneSheetAsset: data.assets[data.characterSheetKeys.yvonne],
        yvetteSheetAsset: data.assets[data.characterSheetKeys.yvette],
        yvetteSpeakerPortrait: data.speakerPortraits.Yvette,
        yvetteCustomPortrait: data.customPortraitKeys.yvette,
        yvetteGuideImage: data.guideData.characters.find((entry) => entry.name === "Yvette")?.image,
        sequelSheetAssets,
        missingSequelSheets: sequelSheetIds.filter((id) => {
          const assetKey = data.characterSheetKeys[id];
          const src = data.assets[assetKey] || "";
          return !assetKey || reusedTemplateSheets.has(assetKey) || !src.includes("assets/generated/sprites/");
        }),
        missingGeneratedEnemies: requiredEnemies.filter((id) => !data.generatedEnemyArt?.[id]),
        sharedSheetBosses: Object.entries(data.generatedEnemyArt)
          .filter(([id, art]) => data.enemies[id]?.boss && String(art?.assetKey || "").startsWith("psGenerated"))
          .map(([id]) => id),
        sharedSheetEnemies: Object.entries(data.generatedEnemyArt)
          .filter(([, art]) => String(art?.assetKey || "").startsWith("psGenerated"))
          .map(([id]) => id),
        hasGerdeVakEnemy: Boolean(data.enemies.gerdeVak),
        treshinBattleEnemies: data.areas.pqSkullKnightChase.events.find((event) => event.id === "pq_gerde_vak")?.battleEnemies || [],
        regularGeneratedEnemyAssets: Object.fromEntries([
          "breswickStalker", "cottageRider", "dreadedIsleWraith", "cloudwalkerAcolyte", "gnomeGearTrap",
          "forgeCinderKnight", "cloudShade", "prophecyHunter", "wallKnight", "blackKnight"
        ].map((id) => [id, data.generatedEnemyArt[id]?.assetKey])),
        kitrinaScoutAsset: data.generatedEnemyArt.kitrinaScout?.assetKey,
        skullRiderAsset: data.generatedEnemyArt.skullRider?.assetKey,
        skullVanguardAsset: data.generatedEnemyArt.skullVanguard?.assetKey,
        dwarfTrialAsset: data.generatedEnemyArt.dwarfTrial?.assetKey,
        kitrinaRiderAsset: data.generatedEnemyArt.kitrinaRider?.assetKey,
        mountedSkullKnightAsset: data.generatedEnemyArt.mountedSkullKnight?.assetKey,
        corizazAgentAsset: data.generatedEnemyArt.corizazAgent?.assetKey,
        darhynEchoAsset: data.generatedEnemyArt.darhynEcho?.assetKey,
        blackKnightCaptainAsset: data.generatedEnemyArt.blackKnightCaptain?.assetKey,
        goblinSpeakerAsset: data.generatedEnemyArt.goblinSpeaker?.assetKey,
        persericaxMoteAsset: data.generatedEnemyArt.persericaxMote?.assetKey,
        seaboatLeviathanAsset: data.generatedEnemyArt.seaboatLeviathan?.assetKey,
        phoenixAshKnightAsset: data.generatedEnemyArt.phoenixAshKnight?.assetKey,
        maelirLoyalistAsset: data.generatedEnemyArt.maelirLoyalist?.assetKey,
        garkinFallenAsset: data.generatedEnemyArt.garkinFallen?.assetKey,
        corizazAwakeAsset: data.generatedEnemyArt.corizazAwake?.assetKey,
        corizazAwakeAssetSrc: data.assets[data.generatedEnemyArt.corizazAwake?.assetKey],
        darhynSwordAsset: data.generatedEnemyArt.darhynSword?.assetKey,
        persericaxCoreAsset: data.generatedEnemyArt.persericaxCore?.assetKey,
        kitrinaGuideImage: data.guideData.antagonists.find((entry) => entry.name === "Kitrina")?.image,
        persericaxGuideImage: data.guideData.antagonists.find((entry) => entry.name === "Persericax")?.image,
        garseonSheet: data.characterSheetKeys.garseon,
        latsonSheet: data.characterSheetKeys.latson,
        fientienSheet: data.characterSheetKeys.fientien,
        soraSheet: data.characterSheetKeys.sora,
        guideArtifactAssets: Object.fromEntries(Object.keys(expectedGuideArtAssets).map((id) => [id, data.generatedGuideArt[id]?.assetKey])),
        mismatchedGuideArtifacts: Object.entries(expectedGuideArtAssets)
          .filter(([id, assetKey]) => data.generatedGuideArt[id]?.assetKey !== assetKey)
          .map(([id, assetKey]) => [id, assetKey, data.generatedGuideArt[id]?.assetKey]),
        sheetBasedGuideArtifacts: Object.entries(data.generatedGuideArt || {})
          .filter(([, art]) => String(art?.assetKey || "").startsWith("psGenerated") || Boolean(art?.cell || art?.cols || art?.rows))
          .map(([id, art]) => [id, art?.assetKey]),
        hasGeneratedGear: Boolean(data.generatedGuideArt?.guardSpear && data.generatedGuideArt?.encounterDial && data.generatedGuideArt?.volcanoForge),
        hasGeneratedSpellAtlas: data.assets.spellAtlas.includes("prophecy-sword-spell-atlas"),
        spellAtlasAsset: data.assets.spellAtlas,
        skillCount: skillEntries.length,
        guideSpellImageCount: guideSpellImages.length,
        uniqueGuideSpellImageCount: new Set(guideSpellImages).size,
        missingSkillSpellIds: skillEntries.filter(([id, skill]) => !skill.spellId || skill.spellId !== id).map(([id]) => id),
        duplicateSkillSpellIds: repeatedSpellIds
      };
    })()`);
    assert(dataCheck.routeCount >= 28, `ProphecyQuest route should be substantially expanded, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.firstPlayableArea === "pqKrendonFlight", `Main ProphecyQuest opening should start in Krendon after the Walis prologue, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.openingAreaName === "Walis Alley" &&
        dataCheck.openingMood === "night" &&
        dataCheck.startPartyIds[0] === "gerthoud" &&
        ["pq_walis_opening", "pq_walis_tivu", "pq_walis_corizaz"].every((id) => dataCheck.openingEventIds.includes(id)) &&
        dataCheck.openingCutsceneEvents.length === 0 &&
        dataCheck.openingRouteImage === "psSceneGerthoudCorizaz" &&
        dataCheck.openingActors.gerthoudSheet === "gerthoudSheet" &&
        dataCheck.openingActors.gerthoudAsset?.includes("gerthoud-sheet-v2") &&
        dataCheck.openingActors.tivuSprite === "tivuCloudwalker" &&
        dataCheck.openingActors.tivuSheet === "tivuCloudwalkerSheet" &&
        dataCheck.openingActors.tivuAsset?.includes("tivu-cloudwalker-sheet-v1") &&
        dataCheck.openingActors.tivuPortrait === "psPortraitTivuCloudwalker" &&
        dataCheck.openingActors.corizazPortrait === "psPortraitCorizazProfile" &&
        dataCheck.openingActors.tivuSpeakerPortrait?.id === "tivuCloudwalker" &&
        dataCheck.openingActors.corizazSpeakerPortrait?.id === "corizazProfile" &&
        dataCheck.openingActors.corizazSprite === "corizaz" &&
        dataCheck.openingActors.tivuCanWander &&
        dataCheck.openingActors.corizazCanWander &&
        dataCheck.openingActors.corizazRequires === "psTivuSeen" &&
        dataCheck.openingActors.tivuHideFlag === "psTivuSeen" &&
        /What's that/.test(dataCheck.openingAllText) &&
        /three heartbeats/i.test(dataCheck.openingAllText) &&
        /breath lifts from him in pale threads/.test(dataCheck.openingAllText) &&
        /The One now walks the Earth\. My goal has never been closer\./.test(dataCheck.openingAllText) &&
        !/DeGuz Elder|marked child|Alahim, son of Tarthur|prophecy hall/i.test(dataCheck.openingAllText),
      `Opening should be an animated Gerthoud/Tivu/Corizaz map prologue, not a static prophecy exposition scene, got ${JSON.stringify(dataCheck)}.`
    );
    assert(!dataCheck.usesKrendonMap && dataCheck.krendonHeroHouseExpanded, `pqKrendonFlight should upgrade Tarthur's house instead of reusing the modest original map, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.krendonEscapeExit?.to === "pqHawkPass" &&
        dataCheck.krendonEscapeExit?.requires === "psCottageDone",
      `Krendon should have an open south escape path onto the solo Hawk road after the roof sequence, got ${JSON.stringify(dataCheck.krendonEscapeExit)}.`
    );
    assert(
        ["pq_krendon_morty", "pq_krendon_neighbor", "pq_krendon_stable_door", "pq_home_door"].every((id) => dataCheck.krendonOpeningEventIds.includes(id)) &&
        dataCheck.krendonHomeDoorRequiresBetsy === "psVisitedBetsy" &&
        dataCheck.mortySprite === "morty" &&
        dataCheck.neighborSprite === "martha" &&
        dataCheck.neighborIcon !== "Z" &&
        dataCheck.neighborPortrait?.id === "martha" &&
        /Zelin.*DeGuz.*library.*prophecy/i.test(dataCheck.krendonOpeningText) &&
        !/hoofprints north of town|north trail would not take long|trouble learned the road/i.test(dataCheck.krendonOpeningText),
      `Krendon opening should support town wandering before home, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      dataCheck.betsyVisit.exists &&
        dataCheck.betsyVisit.boss === null &&
        /Honest Milk/.test(dataCheck.betsyVisit.actionText) &&
        /not to become anyone's boss fight today/.test(dataCheck.betsyVisit.actionText) &&
        dataCheck.betsyVisit.milkHidden === false &&
        dataCheck.betsySidequest.boss === "oldBetsy" &&
        dataCheck.betsySidequest.requires === "psCottageDone" &&
        dataCheck.betsySidequest.hideWhenFlag === "psOldBetsyDefeated" &&
        dataCheck.betsySidequest.rewards.includes("Honest Milk"),
      `Old Betsy should give milk in the noncombat opening and remain available as a later sidequest fight, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      !dataCheck.prophecyScrollSurfaces.guideItem &&
        !dataCheck.prophecyScrollSurfaces.creatorGear &&
        !dataCheck.prophecyScrollSurfaces.eventReward &&
        !dataCheck.prophecyScrollSurfaces.generatedArt &&
        !dataCheck.prophecyScrollSurfaces.asset &&
        !dataCheck.prophecyScrollSurfaces.focusRequiresItem &&
        dataCheck.prophecyScrollSurfaces.focusRequiresFlag === "psDwarvesReached" &&
        dataCheck.prophecyScrollSurfaces.focusLearn === "Dawarven reading",
      `Prophecy Scroll should be story context, not inventory/guide/creator gear, got ${JSON.stringify(dataCheck.prophecyScrollSurfaces)}.`
    );
    assert(
        dataCheck.homeFlow.hasMain &&
        dataCheck.homeFlow.hasBedroom &&
        dataCheck.homeFlow.hasLoft &&
        dataCheck.homeFlow.homeName === "Tarthur's House" &&
        dataCheck.homeFlow.homeSize[0] >= 21 &&
        dataCheck.homeFlow.homeSize[1] >= 13 &&
        dataCheck.homeFlow.bedroomSize[0] >= 19 &&
        dataCheck.homeFlow.bedroomSize[1] >= 11 &&
        dataCheck.homeFlow.loftSize[0] >= 21 &&
        dataCheck.homeFlow.loftSize[1] >= 13 &&
        dataCheck.homeFlow.homeParent === "pqKrendonFlight" &&
        dataCheck.homeFlow.bedroomParent === "pqKrendonFlight" &&
        dataCheck.homeFlow.loftParent === "pqKrendonFlight" &&
        dataCheck.homeFlow.settleFlag === "psHomeSettled" &&
        dataCheck.homeFlow.tiredEvent === "pq_alahim_tired" &&
        dataCheck.homeFlow.arrivalRequires === "psAlahimTired" &&
        dataCheck.homeFlow.loftExit === "pqKitrinaCottage",
      `Yvonne's house should be a multi-screen scene before the roof escape, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      dataCheck.roofFlow.fightBoss === "kitrinaScout" &&
        dataCheck.roofFlow.fightEnemies.includes("cottageRider") &&
        dataCheck.roofFlow.jumpRequires === "psKrendonEscaped" &&
        dataCheck.roofFlow.jumpCutscene === "kitrinaCottageRoof" &&
        dataCheck.roofFlow.roofSize[0] >= 31 &&
        dataCheck.roofFlow.roofSize[1] >= 19 &&
        dataCheck.roofFlow.southExitRequires === "psKrendonBacktrackOpen" &&
        /need to leave/i.test(dataCheck.roofFlow.southExitBlockText) &&
        dataCheck.roofFlow.northExit?.to === "pqHawkPass" &&
        dataCheck.roofFlow.northExit?.requires === "psKrendonEscaped" &&
        dataCheck.roofFlow.hawkReturn?.to === "pqKrendonFlight" &&
        dataCheck.roofFlow.hawkReturn?.requires === "psKrendonBacktrackOpen" &&
        /need to leave/i.test(dataCheck.roofFlow.hawkReturnBlockText) &&
        dataCheck.roadBacktrackLinks.includes("pqHawkPass") &&
        !dataCheck.roadBacktrackLinks.includes("pqKitrinaCottage"),
      `Roof sequence should fight first, open the escape path, and block backtracking with a clear warning, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      dataCheck.hawkPassFlow.exists &&
        dataCheck.hawkPassFlow.name === "Hawk Mountain Road" &&
        dataCheck.hawkPassFlow.reusesHawkMap &&
        dataCheck.hawkPassFlow.soloEvent?.id === "pq_hawk_pass_alone" &&
        dataCheck.hawkPassFlow.northExit?.to === "pqTealsburgRoad" &&
        dataCheck.hawkPassFlow.northExit?.requires === "psHawkPassDone" &&
        /Yvonne and Alahim|alone|Freeton off the map/i.test(dataCheck.hawkPassFlow.text),
      `Yvonne and Alahim should travel alone through the reused Hawk Mountain road before Tealsburg, got ${JSON.stringify(dataCheck.hawkPassFlow)}.`
    );
    assert(
      dataCheck.tealsburgFlow.name === "Tealsburg" &&
        dataCheck.tealsburgFlow.reusesTealsburgMap &&
        dataCheck.tealsburgFlow.yvetteEvent?.id === "pq_yvette_guards" &&
        /Yvette/.test(dataCheck.tealsburgFlow.yvetteText) &&
        /Garseon/.test(dataCheck.tealsburgFlow.yvetteText) &&
        /Latson/.test(dataCheck.tealsburgFlow.yvetteText) &&
        dataCheck.tealsburgFlow.northExit?.to === "pqSkullKnightChase" &&
        dataCheck.tealsburgFlow.northExit?.requires === "psGuardsJoined" &&
        dataCheck.tealsburgFlow.southExit?.to === "pqHawkPass",
      `Yvette should provide Garseon and Latson only after the party reaches Tealsburg, got ${JSON.stringify(dataCheck.tealsburgFlow)}.`
    );
    assert(
      dataCheck.krendonFlagOrder.every(([, index]) => index >= 0) &&
        dataCheck.krendonFlagOrder.every(([, index], i, list) => i === 0 || index > list[i - 1][1]),
      `Opening flags should preserve the quiet-town-to-roof progression, got ${JSON.stringify(dataCheck.krendonFlagOrder)}.`
    );
    assert(dataCheck.centeredSequelStoryEvents.length <= 3, `Sequel route story events should not mostly sit on the center tile, got ${JSON.stringify(dataCheck.centeredSequelStoryEvents)}.`);
    assert(dataCheck.sideRewardEvents.length >= 8, `Sequel route should include optional side/dead-end rewards, got ${JSON.stringify(dataCheck.sideRewardEvents)}.`);
    assert(dataCheck.branchPathStats.every((stats) => stats.lateralPathTiles >= 20), `Generated sequel route maps should have lateral branch paths, got ${JSON.stringify(dataCheck.branchPathStats)}.`);
    assert(dataCheck.usesFreetonMap && dataCheck.usesTealsburgMap && dataCheck.usesBreshenMap && dataCheck.usesMerfolkShoalsMap, `Returning ProphecyQuest/SwordQuest locations should reuse their DreamQuest maps, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.lowComplexityRouteMaps.length === 0, `New ProphecyQuest/SwordQuest route maps should not be blank open fields, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.publicSpoilerHits.length === 0, `Public guide and pre-Ruf story text should not spoil Alahim's prophecy reveal, got ${JSON.stringify(dataCheck.publicSpoilerHits)}.`);
    assert(dataCheck.hasGerthoudSceneArt && dataCheck.gerthoudFlagBeforeKrendon, `Gerthoud/Corizaz suspense scene should launch the Krendon opening, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.krendonFlightRouteImage === "routeKrendon", `Krendon Flight should use the real Krendon route art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.hawkPassRouteImage === "routeHawkMountains", `The solo road to Tealsburg should intentionally reuse Hawk Mountain route art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.kitrinaCottageCutscene === "psSceneKitrinaCottageRoof" && dataCheck.kitrinaCottageEventCutscene === "kitrinaCottageRoof" && dataCheck.kitrinaCottageRouteImage === "psSceneKitrinaCottageRoof", `Kitrina's cottage roof escape should have dedicated scene and route art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.deguzCouncilCutscene === "psSceneDeguzCouncil" && dataCheck.deguzCouncilEventCutscene === "deguzCouncil" && dataCheck.deguzCouncilRouteImage === "psSceneDeguzCouncil", `DeGuz Council should not reuse Freeton route art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.dreadedIsleCutscene === "psSceneDreadedIsle" && dataCheck.dreadedIsleEventCutscene === "dreadedIsle" && dataCheck.dreadedIsleRouteImage === "psSceneDreadedIsle", `Dreaded Isle should not reuse Merfolk Shoals route art, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.latsonIsleFlow.areaName === "Isle of the Dead" &&
        dataCheck.latsonIsleFlow.encounterRate === 0 &&
        dataCheck.latsonIsleFlow.eventRequires === "psLatsonIsleSolo" &&
        /Latson goes alone up the Isle of the Dead/i.test(dataCheck.latsonIsleFlow.eventText) &&
        /Latson climbs alone/i.test(dataCheck.latsonIsleFlow.cutsceneAlt) &&
        /Latson goes alone up the Isle of the Dead/i.test(dataCheck.latsonIsleFlow.routeText) &&
        dataCheck.latsonIsleFlow.rufFlagIndex >= 0 &&
        dataCheck.latsonIsleFlow.flagIndex > dataCheck.latsonIsleFlow.rufFlagIndex &&
        dataCheck.latsonIsleFlow.doneFlagIndex > dataCheck.latsonIsleFlow.flagIndex,
      `Latson should have a solo Isle of the Dead chapter between Ruf and the party crossing, got ${JSON.stringify(dataCheck.latsonIsleFlow)}.`
    );
    assert(dataCheck.seaboatRouteCutscene === "psSceneSeaboatRoute" && dataCheck.seaboatRouteEventCutscene === "seaboatRoute" && dataCheck.seaboatRouteImage === "psSceneSeaboatRoute", `Sea Boat Route should have dedicated crossing art, got ${JSON.stringify(dataCheck)}.`);
    const routeImagesWithoutIntentionalReuse = dataCheck.prophecySwordRouteImages.filter(([id]) => id !== "pqHawkPass");
    assert(new Set(routeImagesWithoutIntentionalReuse.map(([, key]) => key)).size === routeImagesWithoutIntentionalReuse.length, `Playable ProphecyQuest/SwordQuest route beats should not share route guide art except the intentional Hawk Mountain reuse, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.dawarvenCutscene === "psSceneDawarvenRefuge" && dataCheck.fientienEventCutscene === "dawarvenRefuge", `Dawarven ally reveal should have dedicated scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.higeriaCutscene === "psSceneHigeriaArrival" && dataCheck.higeriaEventCutscene === "higeriaArrival", `Higeria reunion should have dedicated scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.dawarvenRouteImage === "psSceneDawarvenRefuge" && dataCheck.higeriaRouteImage === "psSceneHigeriaArrival", `Key ProphecyQuest route beats should not reuse generic route art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.unityStudyCutscene === "psSceneUnityStudy" && dataCheck.unityStudyEventCutscene === "unityStudy", `Artholeus's study should have dedicated scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.gnomeTunnelCutscene === "psSceneGnomeTunnel" && dataCheck.gnomeTunnelEventCutscene === "gnomeTunnel", `Gnome tunnel entry should have dedicated scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.goblinCourtCutscene === "psSceneGoblinCourt" && dataCheck.goblinCourtEventCutscene === "goblinCourt", `Goblin Court should have dedicated scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(new Set(dataCheck.swordQuestRouteImages.map(([, key]) => key)).size === dataCheck.swordQuestRouteImages.length, `Unity/Goggeogo SwordQuest route beats should not share route images, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.unityBladePatternImage === "art:unityBladePattern" && dataCheck.unityBladePatternArt === "psSceneUnityStudy", `Unity Blade Pattern should use its own study art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.goblinAccordImage === "art:goblinAccord" && dataCheck.goblinAccordRewardImage === "art:goblinAccord" && dataCheck.goblinAccordArt === "psSceneGoblinCourt", `Goblin Accord should not reuse Gnome Accord art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.shoalsWaterOrbCutscene === "psSceneShoalsWaterOrb" && dataCheck.shoalsWaterOrbAfterCutscene === "shoalsWaterOrb", `Shoals Water Orb recovery should have dedicated post-battle scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.phoenixGroveCutscene === "psScenePhoenixGrove" && dataCheck.phoenixGroveAfterCutscene === "phoenixGrove", `Phoenix Grove rite recovery should have dedicated post-battle scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.volcanoForgeCutscene === "psSceneVolcanoForge" && dataCheck.volcanoForgeEventCutscene === "volcanoForge", `Volcano Forge should have dedicated forging scene art, got ${JSON.stringify(dataCheck)}.`);
    assert(new Set(dataCheck.lateSwordQuestRouteImages.map(([, key]) => key)).size === dataCheck.lateSwordQuestRouteImages.length, `Late SwordQuest route beats should not share route images, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.alahimSheetAsset.includes("alahim-sheet-v3") && dataCheck.alahimScale < 0.85, `Alahim should use an encyclopedia-based child sheet and smaller runtime scale, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.yvetteSheetAsset.includes("yvette-sheet.png") && dataCheck.yvetteSheetAsset.includes("yvette-distinct") && dataCheck.yvetteSheetAsset !== dataCheck.yvonneSheetAsset, `Yvette should use her own cache-busted spritesheet, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.yvetteSpeakerPortrait?.id === "yvette" && dataCheck.yvetteCustomPortrait === "psPortraitYvette" && dataCheck.yvetteGuideImage === "portrait:yvette", `Yvette dialogue and guide portraits should not resolve to Yvonne, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.missingSequelSheets.length === 0, `Every new sequel party member should use its own generated spritesheet, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.activeEnemyIdList.includes("oldBetsy") &&
        dataCheck.guideEnemyIds.includes("oldBetsy") &&
        dataCheck.legacyActiveEnemyIds.length === 0 &&
        dataCheck.legacyGuideEnemyIds.length === 0,
      `ProphecyQuest guide/creator enemy roster should keep Old Betsy as optional but not blindly carry DreamQuest enemies, got ${JSON.stringify(dataCheck)}.`
    );
    assert(dataCheck.missingGeneratedEnemies.length === 0, `ProphecyQuest enemies should all have generated art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.sharedSheetBosses.length === 0, `Named ProphecyQuest/SwordQuest bosses should not use shared generated sheet cells, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.sharedSheetEnemies.length === 0, `ProphecyQuest/SwordQuest generated enemies should use dedicated sprites instead of shared sheet cells, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.hasGerdeVakEnemy === false, `Gerde-Vak are Dawarven allies and should not be registered as enemies, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.treshinBattleEnemies.includes("skullVanguard") && !dataCheck.treshinBattleEnemies.includes("gerdeVak"), `Treshin Road should battle Kitrina's vanguard, not Gerde-Vak, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.regularGeneratedEnemyAssets.breswickStalker === "psEnemyBreswickStalker" &&
        dataCheck.regularGeneratedEnemyAssets.cottageRider === "psEnemyCottageRider" &&
        dataCheck.regularGeneratedEnemyAssets.dreadedIsleWraith === "psEnemyDreadedIsleWraith" &&
        dataCheck.regularGeneratedEnemyAssets.cloudwalkerAcolyte === "psEnemyCloudwalkerAcolyte" &&
        dataCheck.regularGeneratedEnemyAssets.gnomeGearTrap === "psEnemyGnomeGearTrap" &&
        dataCheck.regularGeneratedEnemyAssets.forgeCinderKnight === "psEnemyForgeCinderKnight" &&
        dataCheck.regularGeneratedEnemyAssets.cloudShade === "psEnemyCloudShade" &&
        dataCheck.regularGeneratedEnemyAssets.prophecyHunter === "psEnemyProphecyHunter" &&
        dataCheck.regularGeneratedEnemyAssets.wallKnight === "psEnemyWallKnight" &&
        dataCheck.regularGeneratedEnemyAssets.blackKnight === "psEnemyBlackKnight",
      `Regular generated enemies should use dedicated battle sprites, got ${JSON.stringify(dataCheck)}.`
    );
    assert(dataCheck.kitrinaScoutAsset === "psEnemyKitrinaScout" && dataCheck.skullRiderAsset === "psEnemySkullRider" && dataCheck.skullVanguardAsset === "psEnemySkullVanguard", `Key early enemies should use dedicated battle sprites, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.kitrinaRiderAsset === "psEnemyKitrinaRider" && dataCheck.mountedSkullKnightAsset === "psEnemyMountedSkullKnight" && dataCheck.kitrinaGuideImage === "enemy:kitrinaRider", `Kitrina chase bosses should use dedicated battle sprites and guide art, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.dwarfTrialAsset === "psEnemyDwarfTrial" &&
        dataCheck.corizazAgentAsset === "psEnemyCorizazAgent" &&
        dataCheck.darhynEchoAsset === "psEnemyDarhynEcho" &&
        dataCheck.goblinSpeakerAsset === "psEnemyGoblinSpeaker" &&
        dataCheck.persericaxMoteAsset === "psEnemyPersericaxMote" &&
        dataCheck.maelirLoyalistAsset === "psEnemyMaelirLoyalist",
      `Named mid-route bosses should use dedicated battle sprites, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      dataCheck.blackKnightCaptainAsset === "psEnemyBlackKnightCaptain" &&
        dataCheck.seaboatLeviathanAsset === "psEnemySeaboatLeviathan" &&
        dataCheck.phoenixAshKnightAsset === "psEnemyPhoenixAshKnight" &&
        dataCheck.garkinFallenAsset === "psEnemyGarkinFallen",
      `SwordQuest route bosses should use dedicated battle sprites, got ${JSON.stringify(dataCheck)}.`
    );
    assert(
      dataCheck.corizazAwakeAsset === "psEnemyCorizazAwake" &&
        dataCheck.corizazAwakeAssetSrc?.includes("corizaz-awake-battle-v2") &&
        dataCheck.darhynSwordAsset === "psEnemyDarhynSword",
      `Final battle lieutenants should use dedicated battle sprites, got ${JSON.stringify(dataCheck)}.`
    );
    assert(dataCheck.persericaxCoreAsset === "psEnemyPersericaxCore" && dataCheck.persericaxGuideImage === "enemy:persericaxCore", `Persericax final boss should use a dedicated battle sprite in combat and guide art, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.garseonSheet === "garseonSheet" && dataCheck.latsonSheet === "latsonSheet" && dataCheck.fientienSheet === "fientienSheet" && dataCheck.soraSheet === "soraSheet", `New party members should use generated sheets, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.mismatchedGuideArtifacts.length === 0 && dataCheck.sheetBasedGuideArtifacts.length === 0, `Every generated guide art entry should use a dedicated image instead of a sheet cell, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.hasGeneratedGear, `Dedicated gear/sidequest guide art should be registered, got ${JSON.stringify(dataCheck)}.`);
    assert(dataCheck.hasGeneratedSpellAtlas && dataCheck.spellAtlasAsset.includes("prophecy-sword-spell-atlas-v2"), `Expanded generated spell atlas should be active, got ${JSON.stringify(dataCheck)}.`);
    assert(
      dataCheck.missingSkillSpellIds.length === 0 &&
        dataCheck.duplicateSkillSpellIds.length === 0 &&
        dataCheck.guideSpellImageCount === dataCheck.skillCount &&
        dataCheck.uniqueGuideSpellImageCount === dataCheck.skillCount,
      `Every skill should have a distinct spell atlas guide image, got ${JSON.stringify(dataCheck)}.`
    );

    const yvettePixelDiff = await evalPage(cdp, `(async () => {
      const data = window.DreamQuestData;
      const load = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      const [yvonne, yvette] = await Promise.all([
        load(data.assets[data.characterSheetKeys.yvonne]),
        load(data.assets[data.characterSheetKeys.yvette])
      ]);
      const width = Math.min(yvonne.naturalWidth, yvette.naturalWidth);
      const height = Math.min(yvonne.naturalHeight, yvette.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(yvonne, 0, 0, width, height);
      const a = ctx.getImageData(0, 0, width, height).data;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(yvette, 0, 0, width, height);
      const b = ctx.getImageData(0, 0, width, height).data;
      let sampled = 0;
      let changed = 0;
      let delta = 0;
      for (let i = 0; i < a.length; i += 64) {
        const local = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]);
        if (local > 10) changed += 1;
        delta += local;
        sampled += 1;
      }
      return { width, height, sampled, changed, delta };
    })()`);
    assert(yvettePixelDiff.changed > yvettePixelDiff.sampled * 0.02 && yvettePixelDiff.delta > 200000, `Yvette sheet should be visually distinct from Yvonne's sheet, got ${JSON.stringify(yvettePixelDiff)}.`);

    await click(cdp, "#guide-title");
    await waitFor(cdp, `!document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    const guideImageChecks = [
      ["route", "route:pqDwarfRefuge"],
      ["route", "route:pqHigeria"],
      ["route", "route:pqKitrinaCottage"],
      ["route", "route:pqDeguzCouncil"],
      ["route", "route:pqDreadedIsle"],
      ["route", "route:sqUnityStudy"],
      ["route", "route:sqGnomeTunnel"],
      ["route", "route:sqGoblinCourt"],
      ["route", "route:sqShoals"],
      ["route", "route:sqSeaboatRoute"],
      ["route", "route:sqPhoenixGrove"],
      ["route", "route:sqVolcanoForge"],
      ["characters", "portrait:yvette"],
      ["items", "art:waterOrb"],
      ["items", "art:phoenixKiss"],
      ["items", "art:breshenStandard"],
      ["items", "art:gnomeAccord"],
      ["items", "art:seaboatWrit"],
      ["items", "art:encounterDial"],
      ["items", "art:unityBladePattern"],
      ["items", "art:goblinAccord"],
      ["weapons", "art:unityBlade"],
      ["weapons", "art:guardSpear"],
      ["spells", "spell:stealishSlash"],
      ["spells", "spell:weaponizedPunchline"],
      ["spells", "spell:ringSpark"],
      ["spells", "spell:tideCut"],
      ["spells", "spell:unityBladeArc"],
      ["enemies", "enemy:breswickStalker"],
      ["enemies", "enemy:cottageRider"],
      ["enemies", "enemy:dreadedIsleWraith"],
      ["enemies", "enemy:cloudwalkerAcolyte"],
      ["enemies", "enemy:gnomeGearTrap"],
      ["enemies", "enemy:forgeCinderKnight"],
      ["enemies", "enemy:cloudShade"],
      ["enemies", "enemy:prophecyHunter"],
      ["enemies", "enemy:dwarfTrial"],
      ["enemies", "enemy:corizazAgent"],
      ["enemies", "enemy:wallKnight"],
      ["enemies", "enemy:darhynEcho"],
      ["enemies", "enemy:blackKnight"],
      ["enemies", "enemy:blackKnightCaptain"],
      ["enemies", "enemy:goblinSpeaker"],
      ["enemies", "enemy:persericaxMote"],
      ["enemies", "enemy:seaboatLeviathan"],
      ["enemies", "enemy:phoenixAshKnight"],
      ["enemies", "enemy:maelirLoyalist"],
      ["enemies", "enemy:garkinFallen"],
      ["antagonists", "enemy:kitrinaRider"],
      ["antagonists", "enemy:corizazAwake"],
      ["antagonists", "enemy:darhynSword"],
      ["antagonists", "enemy:persericaxCore"],
      ["sidequests", "art:volcanoForge"]
    ];
    for (const section of new Set(guideImageChecks.map(([id]) => id))) {
      const clicked = await evalPage(cdp, `(() => {
        const button = [...document.querySelectorAll("[data-guide-section]")]
          .find((candidate) => candidate.dataset.guideSection === ${JSON.stringify(section)});
        if (!button) return false;
        button.click();
        return true;
      })()`);
      assert(clicked, `Could not click guide section ${section}.`);
      await waitFor(cdp, `document.querySelector("[data-guide-section].is-active")?.dataset.guideSection === ${JSON.stringify(section)}`);
      for (const [, image] of guideImageChecks.filter(([id]) => id === section)) {
        await waitFor(cdp, `Boolean([...document.querySelectorAll(".guide-image")].find((canvas) => canvas.dataset.guideImage === ${JSON.stringify(image)}))`);
        const rendered = await evalPage(cdp, `(() => {
          const canvas = [...document.querySelectorAll(".guide-image")].find((candidate) => candidate.dataset.guideImage === ${JSON.stringify(image)});
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let nonBlank = 0;
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] && (pixels[i - 1] || pixels[i - 2] || pixels[i - 3])) nonBlank += 1;
          }
          return { image: canvas.dataset.guideImage, width: canvas.width, height: canvas.height, nonBlank };
        })()`);
        assert(rendered.nonBlank > 1000, `Generated guide image ${image} should render visibly, got ${JSON.stringify(rendered)}.`);
      }
    }
    await click(cdp, "#close-guide");
    await waitFor(cdp, `document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    await evalPage(cdp, `document.querySelector("#guide-content").replaceChildren()`);
  });

  test("Kitrina chase battle renders dedicated mounted sprites", async () => {
    await cdp.send("Page.navigate", { url: await evalPage(cdp, `location.origin + location.pathname + "?functional-kitrina-battle"`) });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#new-game");
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`, 5000);
    await closeDialogue(cdp);
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("pqHigeria");
      window.DreamQuestDebug.setPartyMembers(["yvonne", "alahim", "tarthur", "latson"]);
    })()`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.startBattle(["kitrinaRider", "skullRider", "mountedSkullKnight"])`);
    await waitFor(cdp, `!document.querySelector("#battle").classList.contains("is-hidden") && window.DreamQuestDebug.getBattle()?.enemies?.[0]?.id === "kitrinaRider"`, 5000);
    await waitFor(cdp, `(() => {
      const canvas = document.querySelector("#battle-stage");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = ctx.getImageData(520, 50, 560, 360).data;
      let purple = 0;
      let cyan = 0;
      let darkArmor = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 85 && b > 105 && b > g * 1.16) purple += 1;
        if (b > 150 && g > 95 && r < 110) cyan += 1;
        if (r < 42 && g < 44 && b < 58) darkArmor += 1;
      }
      return purple > 260 && cyan > 280 && darkArmor > 900;
    })()`, 8000);
    const render = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const canvas = document.querySelector("#battle-stage");
      const stageRect = canvas.getBoundingClientRect();
      const hudRect = document.querySelector(".enemy-hud").getBoundingClientRect();
      const partyRect = document.querySelector("#battle-party").getBoundingClientRect();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = ctx.getImageData(520, 50, 560, 360).data;
      let purple = 0;
      let cyan = 0;
      let darkArmor = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 85 && b > 105 && b > g * 1.16) purple += 1;
        if (b > 150 && g > 95 && r < 110) cyan += 1;
        if (r < 42 && g < 44 && b < 58) darkArmor += 1;
      }
      const layout = window.DreamQuestDebug.getBattleEnemyLayoutDebug();
      const overlaps = [];
      for (let a = 0; a < layout.length; a += 1) {
        for (let b = a + 1; b < layout.length; b += 1) {
          const first = layout[a];
          const second = layout[b];
          const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
          const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
          const area = width * height;
          const firstArea = Math.max(1, first.width * first.height);
          const secondArea = Math.max(1, second.width * second.height);
          overlaps.push({ pair: [first.id, second.id], ratio: area / Math.min(firstArea, secondArea) });
        }
      }
      return {
        assetKeys: {
          kitrinaRider: data.generatedEnemyArt.kitrinaRider?.assetKey,
          skullRider: data.generatedEnemyArt.skullRider?.assetKey,
          mountedSkullKnight: data.generatedEnemyArt.mountedSkullKnight?.assetKey
        },
        battleIds: window.DreamQuestDebug.getBattle()?.enemies?.map((enemy) => enemy.id),
        layout,
        maxOverlap: Math.max(0, ...overlaps.map((entry) => entry.ratio)),
        stageBottom: Math.round(stageRect.bottom),
        hudTop: Math.round(hudRect.top),
        hudBottom: Math.round(hudRect.bottom),
        partyTop: Math.round(partyRect.top),
        hudBelowStage: hudRect.top >= stageRect.bottom + 4,
        hudAboveParty: hudRect.bottom <= partyRect.top - 4,
        purple,
        cyan,
        darkArmor
      };
    })()`);
    assert(render.assetKeys.kitrinaRider === "psEnemyKitrinaRider" && render.assetKeys.skullRider === "psEnemySkullRider" && render.assetKeys.mountedSkullKnight === "psEnemyMountedSkullKnight", `Kitrina chase battle should use dedicated generated assets, got ${JSON.stringify(render)}.`);
    assert(render.layout.length === 3 && render.maxOverlap < 0.22, `Mounted enemy formation should avoid heavy sprite overlap, got ${JSON.stringify(render)}.`);
    assert(render.hudBelowStage && render.hudAboveParty, `Enemy HUD should sit outside the battle canvas without covering sprites or party cards, got ${JSON.stringify(render)}.`);
    assert(render.purple > 260 && render.cyan > 280 && render.darkArmor > 900, `Kitrina chase sprites should render visibly in battle, got ${JSON.stringify(render)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("Persericax final battle renders dedicated boss sprite", async () => {
    await cdp.send("Page.navigate", { url: await evalPage(cdp, `location.origin + location.pathname + "?functional-persericax-battle"`) });
    await waitFor(cdp, `document.readyState === "complete" && Boolean(window.DreamQuestDebug)`, 10000);
    await click(cdp, "#new-game");
    await waitFor(cdp, `Boolean(window.DreamQuestDebug.getState())`, 5000);
    await closeDialogue(cdp);
    await evalPage(cdp, `(() => {
      window.DreamQuestDebug.travelTo("sqVolcano");
      window.DreamQuestDebug.setPartyMembers(["uvit", "yan", "tarthur", "sora"]);
    })()`);
    await closeDialogue(cdp);
    await evalPage(cdp, `window.DreamQuestDebug.startBattle(["persericaxCore", "darhynSword", "corizazAwake"])`);
    await waitFor(cdp, `!document.querySelector("#battle").classList.contains("is-hidden") && window.DreamQuestDebug.getBattle()?.enemies?.[0]?.id === "persericaxCore"`, 5000);
    await waitFor(cdp, `(() => {
      const data = window.DreamQuestData;
      return ["persericaxCore", "darhynSword", "corizazAwake"].every((id) => {
        const key = data.generatedEnemyArt[id]?.assetKey;
        return key && window.DreamQuestDebug.isAssetReady(key);
      });
    })()`, 10000);
    await sleep(160);
    const render = await evalPage(cdp, `(() => {
      const data = window.DreamQuestData;
      const canvas = document.querySelector("#battle-stage");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = ctx.getImageData(500, 40, 420, 380).data;
      let violet = 0;
      let brightCore = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (b > 78 && r > 46 && b > g * 1.18) violet += 1;
        if (r > 145 && b > 170 && g < 110) brightCore += 1;
      }
      return {
        assetKeys: {
          persericaxCore: data.generatedEnemyArt.persericaxCore?.assetKey,
          darhynSword: data.generatedEnemyArt.darhynSword?.assetKey,
          corizazAwake: data.generatedEnemyArt.corizazAwake?.assetKey
        },
        battleIds: window.DreamQuestDebug.getBattle()?.enemies?.map((enemy) => enemy.id),
        violet,
        brightCore
      };
    })()`);
    assert(render.assetKeys.persericaxCore === "psEnemyPersericaxCore" && render.assetKeys.darhynSword === "psEnemyDarhynSword" && render.assetKeys.corizazAwake === "psEnemyCorizazAwake", `Final battle trio should use dedicated generated assets, got ${JSON.stringify(render)}.`);
    assert(render.violet > 1450 && render.brightCore > 20, `Persericax dedicated sprite should render visibly in battle, got ${JSON.stringify(render)}.`);
    await evalPage(cdp, `window.DreamQuestDebug.endBattle()`);
  });

  test("enemy guide thumbnails render as square art", async () => {
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
    await click(cdp, "#close-guide");
    await waitFor(cdp, `document.querySelector("#guide-modal").classList.contains("is-hidden")`);
    await evalPage(cdp, `document.querySelector("#guide-content").replaceChildren()`);
  });

  const finalGuideTests = [
    "guide renders one section at a time",
    "enemy guide thumbnails render as square art",
    "ProphecyQuest generated art replaces reused guide and enemy cells"
  ];
  const finalGuideTestNames = new Set(finalGuideTests);
  const orderedTests = [
    ...tests.filter(({ name }) => !finalGuideTestNames.has(name)),
    ...finalGuideTests.map((name) => tests.find((testCase) => testCase.name === name)).filter(Boolean)
  ];
  const battleVisualTestNames = new Set([
    "Kitrina chase battle renders dedicated mounted sprites",
    "Persericax final battle renders dedicated boss sprite"
  ]);
  const groupedTests = TEST_GROUP === "core"
    ? orderedTests.filter(({ name }) => !battleVisualTestNames.has(name) && !finalGuideTestNames.has(name))
    : TEST_GROUP === "guide"
      ? orderedTests.filter(({ name }) => finalGuideTestNames.has(name))
      : orderedTests;
  const selectedTests = TEST_FILTER
    ? groupedTests.filter(({ name }) => name.toLowerCase().includes(TEST_FILTER))
    : groupedTests;
  assert(selectedTests.length > 0, `No tests matched --filter ${JSON.stringify(TEST_FILTER)}.`);
  for (const { name, fn } of selectedTests) {
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
