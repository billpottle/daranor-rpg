#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootArgumentIndex = process.argv.indexOf("--root");
const ROOT = path.resolve(
  rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : process.env.GAME_ROOT || path.resolve(__dirname, "..")
);
const DATA_JS = path.join(ROOT, "js", "game-data.js");
const GAME_JS = path.join(ROOT, "js", "game.js");

function stripQuery(value) {
  return String(value || "").split("?")[0];
}

function loadGameData() {
  const dataSource = fs.readFileSync(DATA_JS, "utf8");
  const gameSource = fs.readFileSync(GAME_JS, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(dataSource, sandbox, { filename: DATA_JS });
  const factory = sandbox.window.DreamQuestGameDataFactory;
  if (typeof factory !== "function") {
    throw new Error("Could not load DreamQuestGameDataFactory from js/game-data.js.");
  }
  const data = factory();
  data.knownFlagNames = knownFlagNames(data);
  data.knownCompletedEventIds = knownCompletedEventIds(data);
  return { source: `${dataSource}\n${gameSource}`, gameSource, data };
}

function knownFlagNames(data) {
  return new Set([
    ...(data.creatorRouteFlags || []),
    ...(data.knownExtraFlagNames || [])
  ]);
}

function knownCompletedEventIds(data) {
  const ids = new Set(data.knownBaseCompletedEventIds || []);
  Object.keys(data.areas).forEach((id) => ids.add(`visit_${id}`));
  Object.values(data.areas).forEach((areaConfig) => {
    (areaConfig.events || []).forEach((event) => {
      if (event?.id) ids.add(event.id);
    });
  });
  return ids;
}

function hasSaveMigration(source, version) {
  const start = source.indexOf("  const saveMigrations = {");
  const end = source.indexOf("  function freshState", start);
  if (start < 0 || end < 0) return false;
  const migrations = source.slice(start, end);
  return new RegExp(`\\n\\s*${version}\\s*:`).test(migrations);
}

const blockedChars = new Set(["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c", "~"]);

function inBounds(area, x, y) {
  return Boolean(area && y >= 0 && y < area.map.length && x >= 0 && x < (area.map[y] || "").length);
}

function tileAt(area, x, y) {
  return (area.map[y] || "")[x];
}

function passable(area, x, y) {
  return inBounds(area, x, y) && !blockedChars.has(tileAt(area, x, y));
}

function reachableTileKeys(area) {
  const [startX, startY] = area.start || [];
  if (!passable(area, startX, startY)) return new Set();
  const seen = new Set([`${startX},${startY}`]);
  const queue = [{ x: startX, y: startY }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || !passable(area, x, y)) return;
      seen.add(key);
      queue.push({ x, y });
    });
  }
  return seen;
}

function exitSourceTiles(area, edge) {
  const width = area.map[0]?.length || 0;
  const height = area.map.length;
  if (edge === "north") return Array.from({ length: width }, (_, x) => ({ x, y: 0 }));
  if (edge === "south") return Array.from({ length: width }, (_, x) => ({ x, y: height - 1 }));
  if (edge === "west") return Array.from({ length: height }, (_, y) => ({ x: 0, y }));
  if (edge === "east") return Array.from({ length: height }, (_, y) => ({ x: width - 1, y }));
  return [];
}

function add(issueList, type, detail) {
  issueList.push({ type, ...detail });
}

function assetKeyForSrc(data, src) {
  const clean = stripQuery(src);
  return Object.entries(data.assets).find(([, value]) => stripQuery(value) === clean)?.[0] || "";
}

function assetExists(data, key) {
  return Boolean(key && data.assets[key] && fs.existsSync(path.join(ROOT, stripQuery(data.assets[key]))));
}

function worldAreaId(data, id) {
  return data.areaWorldParents[id] || id;
}

function tileSheetKeyForArea(data, areaId) {
  if (worldAreaId(data, areaId) === "marhynCastle") return "tilesheetCastle";
  if (areaId === "merfolkShoals" || areaId === "tideCavern") return "tilesheetShoals";
  return "tilesheet";
}

function battleBackgroundKeyForArea(data, areaId) {
  const areaSpecific = data.battleBackgroundByArea[areaId] || data.battleBackgroundByArea[worldAreaId(data, areaId)];
  if (areaSpecific) return areaSpecific;
  const area = data.areas[areaId];
  if (!area) return "battleMeadow";
  if (area.theme === "floor" || areaId === "darhynCastle" || worldAreaId(data, areaId) === "marhynCastle" || areaId === "rathskeller") return "battleCastle";
  if (area.theme === "water" || area.theme === "sand") return "battleShoals";
  if (area.theme === "mountain") return "battleMountain";
  return "battleMeadow";
}

function npcSpriteByIcon(icon) {
  if (icon === "Y") return "yvonne";
  if (icon === "V") return "valena";
  if (icon === "D") return "dalin";
  if (icon === "Z") return "zelin";
  if (icon === "S") return "scribe";
  if (icon === "K") return "kingGarkin";
  if (icon === "E" || icon === "U") return "elvenKing";
  if (icon === "M") return "martha";
  return "derlin";
}

function npcSpriteForEvent(data, event) {
  if (event.id === "tustor_grave") return "chairmanEor";
  return data.npcSpriteByEventId[event.id] || npcSpriteByIcon(event.icon);
}

function eventSpriteKind(data, event) {
  if (event?.boss && event.disguiseUntilItem) return "npc";
  if (event?.boss) return "boss";
  return data.eventSpriteKind[event?.icon] || "marker";
}

function collectKnownItems(data, source) {
  const items = new Set([
    ...Object.values(data.battleItemCatalog).map((item) => item.inventory),
    ...Object.keys(data.weaponCatalog),
    ...Object.keys(data.armorCatalog),
    ...Object.keys(data.accessoryCatalog),
    ...Object.keys(data.creatorGear)
  ]);

  Object.values(data.guideData).flat().forEach((entry) => {
    if (entry?.name) items.add(entry.name);
  });
  Object.values(data.shops).forEach((shop) => {
    (shop.items || []).forEach((offer) => items.add(offer.item));
  });
  Object.values(data.areas).forEach((area) => {
    (area.events || []).forEach((event) => {
      (event.itemRewards || []).forEach((reward) => {
        if (reward?.name) items.add(reward.name);
      });
    });
  });
  for (const match of source.matchAll(/addItem\("([^"]+)"/g)) {
    items.add(match[1]);
  }
  for (const match of source.matchAll(/setCreatorItemMinimum\("([^"]+)"/g)) {
    items.add(match[1]);
  }
  return items;
}

function validate() {
  const { source, gameSource, data } = loadGameData();
  const errors = [];
  const warnings = [];
  const knownItems = collectKnownItems(data, source);

  if (!Number.isInteger(data.gameConfig.saveVersion) || data.gameConfig.saveVersion < 1) {
    add(errors, "invalid-save-version", { version: data.gameConfig.saveVersion });
  }
  for (let version = 1; version < data.gameConfig.saveVersion; version += 1) {
    if (!hasSaveMigration(gameSource, version)) {
      add(errors, "missing-save-migration", { version });
    }
  }
  if (!data.areas[data.gameConfig.startAreaId]) {
    add(errors, "missing-start-area", { area: data.gameConfig.startAreaId });
  }
  (data.gameConfig.startPartyIds || []).forEach((id) => {
    if (!data.partyTemplates[id]) add(errors, "missing-start-party-member", { member: id });
  });
  Object.keys(data.gameConfig.startInventory || {}).forEach((name) => {
    if (!knownItems.has(name)) add(errors, "unknown-start-inventory-item", { item: name });
  });

  Object.entries(data.assets).forEach(([key, value]) => {
    const assetPath = path.join(ROOT, stripQuery(value));
    if (!fs.existsSync(assetPath)) add(errors, "missing-asset", { key, path: stripQuery(value) });
  });

  Object.entries(data.cutsceneImages).forEach(([id, scene]) => {
    if (!data.assets[scene.assetKey]) add(errors, "missing-cutscene-asset-key", { id, assetKey: scene.assetKey });
  });

  Object.entries(data.battleBackgroundByArea).forEach(([areaId, key]) => {
    if (!data.areas[areaId] && !Object.values(data.areaWorldParents).includes(areaId)) {
      add(errors, "battle-background-missing-area", { area: areaId, assetKey: key });
    }
    if (!assetExists(data, key)) add(errors, "battle-background-missing-asset", { area: areaId, assetKey: key });
  });

  Object.entries(data.areas).forEach(([id, area]) => {
    if (!Array.isArray(area.map) || !area.map.length) {
      add(errors, "empty-map", { area: id });
      return;
    }
    const widths = area.map.map((row) => row.length);
    const uniqueWidths = [...new Set(widths)];
    if (uniqueWidths.length > 1) {
      add(errors, "ragged-map", { area: id, widths: uniqueWidths });
    }
    const [startX, startY] = area.start || [];
    if (!inBounds(area, startX, startY)) {
      add(errors, "start-out-of-bounds", { area: id, start: [startX, startY] });
    } else if (!passable(area, startX, startY)) {
      add(errors, "start-blocked", { area: id, start: [startX, startY], tile: tileAt(area, startX, startY) });
    }
    if (area.art && !fs.existsSync(path.join(ROOT, stripQuery(area.art)))) {
      add(errors, "missing-area-art", { area: id, art: stripQuery(area.art) });
    }
    if (area.art && !assetKeyForSrc(data, area.art)) {
      add(errors, "area-art-not-in-assets", { area: id, art: stripQuery(area.art) });
    }
    [tileSheetKeyForArea(data, id), battleBackgroundKeyForArea(data, id), "chestSprite"].forEach((assetKey) => {
      if (!assetExists(data, assetKey)) add(errors, "missing-runtime-area-asset", { area: id, assetKey });
    });
    (area.encounters || []).forEach((enemyId) => {
      const enemy = data.enemies[enemyId];
      if (!enemy) {
        add(errors, "missing-encounter-enemy", { area: id, enemy: enemyId });
      } else if (enemy.boss) {
        add(errors, "boss-encounter-enemy", { area: id, enemy: enemyId });
      }
    });
    (area.events || []).forEach((event) => {
      if (!event.id) add(errors, "event-missing-id", { area: id, x: event.x, y: event.y });
      if (!inBounds(area, event.x, event.y)) {
        add(errors, "event-out-of-bounds", { area: id, event: event.id, position: [event.x, event.y] });
      }
      if (event.boss && !data.enemies[event.boss]) add(errors, "missing-boss-enemy", { area: id, event: event.id, enemy: event.boss });
      if ((eventSpriteKind(data, event) === "npc" || event.disguiseUntilItem) && !data.characterSheetKeys[npcSpriteForEvent(data, event)]) {
        add(errors, "missing-npc-sprite-key", { area: id, event: event.id, sprite: npcSpriteForEvent(data, event) });
      }
      (event.battleEnemies || []).forEach((enemyId) => {
        if (!data.enemies[enemyId]) add(errors, "missing-battle-enemy", { area: id, event: event.id, enemy: enemyId });
      });
      ["requires", "hideWhenFlag"].forEach((field) => {
        if (event[field] && !data.knownFlagNames.has(event[field])) {
          add(errors, "unknown-event-flag", { area: id, event: event.id, field, flag: event[field] });
        }
      });
      if (event.requiresItem && !knownItems.has(event.requiresItem)) {
        add(errors, "unknown-event-required-item", { area: id, event: event.id, item: event.requiresItem });
      }
      if (event.hideWhenCompleted && !data.knownCompletedEventIds.has(event.hideWhenCompleted)) {
        add(errors, "unknown-event-completion-ref", { area: id, event: event.id, completedEvent: event.hideWhenCompleted });
      }
    });
    const reachable = reachableTileKeys(area);
    (area.exits || []).forEach((exit) => {
      const sourceTiles = exitSourceTiles(area, exit.edge).filter(({ x, y }) => passable(area, x, y));
      if (!sourceTiles.length) {
        add(errors, "exit-source-missing", { area: id, edge: exit.edge, to: exit.to });
      } else if (!sourceTiles.some(({ x, y }) => reachable.has(`${x},${y}`))) {
        add(errors, "exit-source-unreachable", { area: id, edge: exit.edge, to: exit.to, sources: sourceTiles.map(({ x, y }) => [x, y]) });
      }
      const target = data.areas[exit.to];
      if (!target) {
        add(errors, "exit-missing-area", { area: id, to: exit.to });
        return;
      }
      const targetX = exit.x ?? target.start?.[0];
      const targetY = exit.y ?? target.start?.[1];
      if (!inBounds(target, targetX, targetY)) {
        add(errors, "exit-target-out-of-bounds", { area: id, to: exit.to, target: [targetX, targetY] });
      } else if (!passable(target, targetX, targetY)) {
        add(errors, "exit-target-blocked", { area: id, to: exit.to, target: [targetX, targetY], tile: tileAt(target, targetX, targetY) });
      }
      ["requires"].forEach((field) => {
        if (exit[field] && !data.knownFlagNames.has(exit[field])) {
          add(errors, "unknown-exit-flag", { area: id, to: exit.to, field, flag: exit[field] });
        }
      });
      if (exit.requiresItem && !knownItems.has(exit.requiresItem)) {
        add(errors, "unknown-exit-required-item", { area: id, to: exit.to, item: exit.requiresItem });
      }
      if (exit.requiresParty && !data.partyTemplates[exit.requiresParty]) {
        add(errors, "unknown-exit-party-member", { area: id, to: exit.to, party: exit.requiresParty });
      }
    });
  });

  data.areaOrder.forEach((id) => {
    if (!data.areas[id]) add(errors, "area-order-missing-area", { area: id });
    if (!data.bookWorldPoints[id]) add(errors, "missing-world-point", { area: id });
  });
  Object.keys(data.areas).forEach((id) => {
    if (!data.areaOrder.includes(id) && !data.areaWorldParents[id]) {
      add(warnings, "area-not-on-world-route", { area: id });
    }
  });
  Object.entries(data.areaWorldParents).forEach(([child, parent]) => {
    if (!data.areas[child]) add(errors, "world-parent-missing-child-area", { child, parent });
    if (!data.areas[parent]) add(errors, "world-parent-missing-parent-area", { child, parent });
  });
  Object.entries(data.areaMiniMapGroups).forEach(([groupId, group]) => {
    if (!data.areas[groupId]) add(errors, "minimap-group-missing-area", { group: groupId });
    Object.entries(group.boards || {}).forEach(([boardId, board]) => {
      if (!data.areas[boardId]) add(errors, "minimap-board-missing-area", { group: groupId, board: boardId });
      (board.links || []).forEach((link) => {
        if (!group.boards[link]) add(errors, "minimap-link-missing-board", { group: groupId, board: boardId, link });
      });
    });
  });

  Object.entries(data.partySkillLists).forEach(([memberId, skillIds]) => {
    if (!data.partyTemplates[memberId]) add(errors, "skill-list-missing-party-member", { member: memberId });
    skillIds.forEach((skillId) => {
      if (!data.skillCatalog[skillId]) add(errors, "skill-list-missing-skill", { member: memberId, skill: skillId });
    });
  });
  Object.entries(data.skillCatalog).forEach(([skillId, skill]) => {
    if (skill.requiresFlag && !data.knownFlagNames.has(skill.requiresFlag)) {
      add(errors, "skill-requires-unknown-flag", { skill: skillId, flag: skill.requiresFlag });
    }
    if (skill.requiresItem && !knownItems.has(skill.requiresItem)) {
      add(errors, "skill-requires-unknown-item", { skill: skillId, item: skill.requiresItem });
    }
  });

  Object.entries(data.shops).forEach(([shopId, shop]) => {
    (shop.items || []).forEach((offer) => {
      if (!knownItems.has(offer.item)) add(errors, "shop-offers-unknown-item", { shop: shopId, item: offer.item });
    });
  });

  Object.entries(data.guideData).forEach(([section, entries]) => {
    if (!Array.isArray(entries) || !entries.length) add(warnings, "guide-section-empty", { section });
    entries.forEach((entry) => {
      const [kind, id] = String(entry.image || "").split(":");
      if (!entry.name) add(errors, "guide-entry-missing-name", { section, image: entry.image });
      if (kind === "cover") {
        if (!data.coverImageKeys[id]) add(errors, "guide-cover-missing-key", { section, entry: entry.name, cover: id });
        else if (!assetExists(data, data.coverImageKeys[id])) add(errors, "guide-cover-missing-asset", { section, entry: entry.name, cover: id, assetKey: data.coverImageKeys[id] });
      } else if (kind === "portrait") {
        const hasPortrait = data.portraitAtlasCells[id] || data.customPortraitKeys[id] || data.characterSheetKeys[id];
        if (!hasPortrait) add(errors, "guide-portrait-missing-source", { section, entry: entry.name, portrait: id });
      } else if (kind === "hero" || kind === "heroWalk") {
        if (!data.characterSheetKeys[id]) add(errors, "guide-hero-missing-sprite", { section, entry: entry.name, hero: id });
      } else if (kind === "enemy") {
        if (!data.enemies[id]) add(errors, "guide-enemy-missing-enemy", { section, entry: entry.name, enemy: id });
      } else if (kind === "route") {
        if (!data.routeGuideImageKeys[id]) add(errors, "guide-route-missing-key", { section, entry: entry.name, route: id });
        else if (!assetExists(data, data.routeGuideImageKeys[id])) add(errors, "guide-route-missing-asset", { section, entry: entry.name, route: id, assetKey: data.routeGuideImageKeys[id] });
      } else if (kind === "sidequest") {
        if (!data.sidequestGuideImageKeys[id]) add(errors, "guide-sidequest-missing-key", { section, entry: entry.name, sidequest: id });
        else if (!assetExists(data, data.sidequestGuideImageKeys[id])) add(errors, "guide-sidequest-missing-asset", { section, entry: entry.name, sidequest: id, assetKey: data.sidequestGuideImageKeys[id] });
      } else if (kind === "area") {
        if (!data.areas[id]) add(errors, "guide-area-missing-area", { section, entry: entry.name, area: id });
      } else if (kind === "art") {
        const art = data.generatedGuideArt?.[id];
        if (!art?.assetKey) add(errors, "guide-art-missing-key", { section, entry: entry.name, art: id });
        else if (!assetExists(data, art.assetKey)) add(errors, "guide-art-missing-asset", { section, entry: entry.name, art: id, assetKey: art.assetKey });
      } else if (kind === "item" && id === "relic") {
        if (!assetExists(data, "vsLogo")) add(errors, "guide-relic-missing-asset", { section, entry: entry.name });
      } else if (["item", "weapon", "armor", "accessory", "spell"].includes(kind)) {
        if (!assetExists(data, "guideIcons")) add(errors, "guide-icons-missing-asset", { section, entry: entry.name });
      } else {
        add(errors, "guide-entry-unknown-image-kind", { section, entry: entry.name, image: entry.image });
      }
    });
  });

  const result = {
    game: data.gameConfig.title,
    areas: Object.keys(data.areas).length,
    assets: Object.keys(data.assets).length,
    errors,
    warnings
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
}

validate();
