(() => {
  "use strict";

  const dataFactory = window.DreamQuestGameDataFactory;
  if (typeof dataFactory !== "function") {
    throw new Error("DreamQuestGameDataFactory must load before game.js.");
  }

  const gameData = dataFactory({
    addGold,
    addItem,
    addParty,
    flag,
    hasFlag,
    openShop,
    playCorizazDrainTransition,
    playTustorResurrection,
    playWaterOrbTransition,
    removeParty,
    say,
    setMode,
    setParty,
    showCutscene,
    showEndingScene,
    startYvonneYvetteBattle,
    stayAtInn,
    stealTealsburgLoot,
    travelTo
  });
  window.DreamQuestData = gameData;

  const {
    gameConfig,
    assets,
    cutsceneImages,
    endingCredits,
    endingSideQuests,
    tileInfo,
    tileSheet,
    battleBackgroundByArea,
    spriteStyle,
    enemyStyle,
    heroAtlasCells,
    characterSheetKeys,
    characterSheetGrid,
    defaultCharacterSheetCrop,
    characterSheetCrop,
    characterSheetDisplayScale,
    characterSheetFrameNudges,
    mirroredSideWalkIds,
    mirroredRightIdleIds,
    characterSheetBattleSideIdleIds = new Set(),
    characterSheetDirectionalRows = new Set(),
    spriteSheetHeadshotIds,
    transientNpcEventIds,
    repeatLinesByEventId,
    enemyAtlasCells,
    enemyAtlasCellCrop,
    portraitAtlasCells,
    customPortraitKeys,
    guideIconAtlas,
    generatedGuideArt = {},
    generatedEnemyArt = {},
    spellAtlasCells: configuredSpellAtlasCells,
    spellAtlasGrid: configuredSpellAtlasGrid,
    coverImageKeys,
    routeGuideImageKeys,
    sidequestGuideImageKeys,
    creatorDefaults,
    creatorGear,
    regularInventoryHiddenItems,
    creatorRouteFlags,
    knownExtraFlagNames,
    knownBaseCompletedEventIds,
    eventSpriteKind,
    npcSpriteByEventId,
    stationaryNpcEventIds,
    speakerPortraits,
    partyTemplates,
    skillCatalog,
    partySkillLists,
    battleItemCatalog,
    weaponCatalog,
    defaultWeaponByMember,
    armorCatalog,
    defaultArmorByMember,
    accessoryCatalog,
    defaultAccessoryByMember,
    shops,
    enemies,
    activeEnemyIds = null,
    guideData,
    musicTrackSources,
    musicTrackThemeMap,
    musicTrackThemePlaylists = {},
    musicTrackVolumes,
    areaOrder,
    optionalAreaIds,
    bookMapSize,
    bookWorldPoints,
    areaWorldParents,
    areaMiniMapGroups,
    areas
  } = gameData;

  const SAVE_KEY = gameConfig.saveKey;
  const CREATOR_SAVE_KEY = `${SAVE_KEY}-creator`;
  const VERSION = gameConfig.saveVersion;
  const STORY_REWARD_REPAIR_VERSION = 7;

  const $ = (id) => document.getElementById(id);

  const artImages = {};
  const assetLoadPromises = {};
  const assetKeyBySrc = Object.fromEntries(Object.entries(assets).map(([key, src]) => [src, key]));
  const spellAtlasCells = configuredSpellAtlasCells || {
    water: [0, 0],
    wind: [1, 0],
    heal: [2, 0],
    dragon: [0, 1],
    charm: [1, 1],
    bell: [2, 1],
    flare: [0, 2],
    light: [1, 2],
    rune: [2, 2]
  };
  const spellAtlasGrid = configuredSpellAtlasGrid || { cols: 3, rows: 3 };

  const TILE = 64;
  let WALK_MS = 140;
  const WALK_EASE_BLEND = 0.18;
  const NPC_DIALOGUE_RELEASE_PAUSE_MS = 420;
  const NPC_WALK_ANIMATION_DIVISOR = 7.5;
  const RANDOM_ENCOUNTER_SAFE_STEPS = 4;
  const ENCOUNTER_DIAL_ITEM = "Encounter Dial";
  const ENCOUNTER_DIAL_DEFAULT_STEPS = 24;
  const ENCOUNTER_DIAL_MIN_STEPS = 4;
  const ENCOUNTER_DIAL_MAX_STEPS = 999;
  const ACTIVE_PARTY_LIMIT = 4;
  const ENCOUNTER_RATE_MULTIPLIER = 1 / 7;
  const MAP_W = 15;
  const MAP_H = 11;
  const DIRS = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };
  const MOVE_KEY_DELTAS = {
    ArrowUp: [0, -1],
    w: [0, -1],
    W: [0, -1],
    ArrowDown: [0, 1],
    s: [0, 1],
    S: [0, 1],
    ArrowLeft: [-1, 0],
    a: [-1, 0],
    A: [-1, 0],
    ArrowRight: [1, 0],
    d: [1, 0],
    D: [1, 0]
  };
  const MERFOLK_SPRITE_IDS = new Set(["chairmanEor", "merwizard"]);
  const wideStrideDirectionalSheetIds = new Set(["garseon", "latson"]);
  const MINI_MAP_MAX_LOCAL_BOARDS = 5;
  const MINI_MAP_LOCAL_MARGIN = 0.12;

  let state = null;
  let activePlayStartedAt = 0;
  let dialogueQueue = [];
  let dialogueDone = null;
  let dialogueTypingTimer = null;
  let dialogueFullText = "";
  const coachingQueue = [];
  const managedDialogIds = ["menu-modal", "guide-modal", "creator-modal", "dialogue", "battle", "item-modal", "coach-modal", "ending-scene", "cutscene"];
  let activeManagedDialogId = "";
  let dialogReturnFocus = null;
  let activeNpcDialogueLock = null;
  const npcMotionTimeOffsets = new Map();
  const npcDialogueReleaseLocks = new Map();
  let lastBattleStep = Number.NEGATIVE_INFINITY;
  let activeBattle = null;
  let lastSaveMessage = "";
  let renderLoopStarted = false;
  let renderLoopTimer = null;
  let areaLoadToken = 0;
  let adjacentPrefetchHandle = null;
  const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  let battleSpeed = 1.4;
  let autoBattleEnabled = false;
  let autoBattleTimer = null;
  let creatorMessage = "";
  let menuMessage = "";
  const pendingRecruitNames = [];
  let activeShopId = null;
  let activeInnOffer = null;
  let activeMenuTab = "inventory";
  let activeGuideSection = gameConfig.defaultGuideSection;
  let shopMessage = "";
  let lastBlockedHint = { key: "", at: 0 };
  const blockedHintSeenTypes = new Set();
  let lastMoveInputAt = 0;
  let heldMoveKey = "";
  let heldMoveDx = 0;
  let heldMoveDy = 0;
  let cutsceneActive = false;
  let activeCutsceneTimer = null;
  let screenTransitionTimer = null;
  let activeCutsceneToken = 0;
  let cutsceneDone = null;
  let mapEffect = null;
  let tileRenderAreaId = null;
  let itemModalResolve = null;
  let itemModalEquipAction = null;
  let equipmentOfferTimer = null;
  const pendingEquipmentOffers = [];
  const renderDirty = {
    map: true,
    world: true,
    battle: true,
    guide: true
  };
  const customEnemyImageKeys = {
    corizaz: "corizazEnemy",
    hano: "hanoEnemy"
  };
  const villageTileAreaIds = new Set(["krendon", "krendonStable", "krendonShop", "freeton", "tealsburg", "marketMaze", "tealsburgShop", "breshen"]);
  const imageAlphaBoundsCache = new Map();
  const jokeLevels = ["low", "normal", "high"];
  const coachingTips = {
    movement: ["Movement", "Move with Arrow keys or WASD. On touch screens, use the compass rail at the bottom."],
    interaction: ["Bump to interact", "Walk into NPCs, doors, chests, signs, and marked objects. You do not need a separate interact button."],
    dialogue: ["Dialogue controls", "Use Next, Enter, Space, or a movement key to advance dialogue. Escape closes optional overlays, not story dialogue."],
    battle: ["Queue the round", "Choose one action and target for every active character. Use Undo to revise a choice, then select Execute Round."],
    equipment: ["Equipment", "New upgrades offer Equip now. You can compare every owned weapon, armor piece, and accessory from Menu → Equipment."],
    inns: ["Inns", "Inns restore the whole available party. The price is shown before you confirm, and the stay creates a safe checkpoint."],
    autosave: ["Autosaving", "Travel, story progress, purchases, lineup changes, and settings save automatically. The HUD shows the latest save time."],
    party: ["Active and reserve", "Only four characters fight at once. Extra recruits become reserves, still earn catch-up XP, and can be swapped from Menu → Characters."]
  };
  const jokeLevelLabels = {
    low: "Grounded",
    normal: "Default",
    high: "Playful"
  };
  const jokeLevelDescriptions = {
    low: "Main-story dialogue stays grounded; meta jokes and treasure asides are reduced.",
    normal: "Default DreamQuest flavor.",
    high: "Treasure, flavor text, and comic asides lean into extra jokes."
  };
  const lowToneDialogueOverrides = new Map([
    ["After many long trials, Tarthur finally stands inside Darhyn's castle. The Death Lord awaits. Probably.", "In the dream, Tarthur stands inside Darhyn's castle. The Death Lord waits beyond the sealed chamber."],
    ["This is exactly how heroic destiny starts: confused, indoors, and underleveled.", "If this is destiny, I will face it—even if I do not yet understand it."],
    ["A blue seal bars the orb chamber. Darhyn's extremely fragile authority still counts as authority.", "A blue seal bars the chamber holding the Water Orb clue. Darhyn's magic sustains it."],
    ["So first I defeat the throne-room problem, then I loot the mystical water thing. Standard hero order.", "Then Darhyn must fall before I can learn what the chamber contains."],
    ["No! My one hit point! My only weakness!", "No. This dream cannot end me."],
    ["That was either destiny or a tutorial with self-esteem problems.", "The seal is breaking. Whatever called me here is beyond it."],
    ["That means the prophecy is working.", "The dream felt real, Derlin. I brought something back from it."],
    ["Derlin joined the party. He brought a red cloak and absolutely no adult supervision.", "Derlin joins Tarthur. Whatever the dream means, Tarthur will not face it alone."],
    ["Can the merfolk also explain why the cow has boss music?", "Then the merfolk are our best hope of understanding what the spell showed us."],
    ["Old Betsy is in the southwest stable. She respects only turn-based combat.", "Before you leave, Judith needs help with Old Betsy in the southwest stable."],
    ["I am Lithar Lifehater. My armor has blades because subtlety lost a committee vote.", "I am Lithar Lifehater. You have crossed Queen Marhyn's land for the last time."],
    ["Separate cells. Separate hopes. It is tidier that way.", "Separate them. No voices through the walls, and no hope of escape."],
    ["Welcome to solitary confinement. It is like an inn, but every amenity is a lock.", "You are beneath my castle now. No one will hear you, and no one will come."],
    ["Your decorator really committed to blue-black stone.", "This place was built to crush hope."],
    ["It hides stains and optimism.", "That is precisely its purpose."],
    ["Tarthur wakes alone. Somewhere deeper in the dungeon, someone is still breathing loudly enough to become a quest objective.", "Tarthur wakes alone. Somewhere deeper in the dungeon, a familiar voice echoes through the stone."],
    ["The dungeon passage sealed behind us. Marhyn dislikes loose endings.", "The dungeon passage sealed behind us. There is no road back through Marhyn's castle."],
    ["That is unfortunate. I had several loose complaints.", "Then we keep moving. We cannot let her take anyone else."],
    ["It is easier to fight wizards when they are asleep. Less monologuing, for one thing.", "If we must wake him, we should be ready before he opens his eyes."],
    ["You win the Light Sword. It ignores armor, excuses, and most municipal paperwork.", "Tarthur claims the Light Sword. Its edge passes through armor as if no defense stood there."],
    ["I still hate life, but I respect your DPS.", "You have strength, but Darhyn will break what remains of you."],
    ["Put that on a plaque.", "Then step aside. This ends with Darhyn."],
    ["Impossible. The Power of Air! My second-only weakness!", "Impossible. The Power of Air was lost."],
    ["The player-triggered Power of Air still fills the chamber. Yan holds the spell together until Darhyn's broken shadow finally disperses.", "The Power of Air fills the chamber. Yan holds the spell together until Darhyn's broken shadow finally disperses."],
    ["Daranor is safe enough for the credits, which is different from safe enough to ignore every suspicious side path.", "Daranor is safe, but grief and unfinished promises remain beyond the castle road."],
    ["Daranor is safe enough for the credits.", "Daranor is safe, though the cost of victory will not be forgotten."],
    ["Someone important is missing. The plot refuses to proceed without them.", "The party cannot continue without the companion this road requires."]
  ]);
  const menuTabs = [
    ["inventory", "Inventory"],
    ["characters", "Characters"],
    ["equipment", "Equipment"],
    ["quest", "Quest"],
    ["settings", "Settings"],
    ["map", "Map"]
  ];
  const zoomDestinations = gameConfig.zoomDestinations || [
    { id: "krendon", label: "Krendon" },
    { id: "merfolkShoals", label: "Merfolk Shoals" },
    { id: "freeton", label: "Freeton" },
    { id: "tealsburg", label: "Tealsburg" },
    { id: "breshen", label: "Breshen" },
    { id: "rathskeller", label: "Castle Rathskeller" }
  ];
  const zoomSkillId = "zoom";
  const zoomItemName = "Zoom Shell";
  const sideQuestById = new Map(endingSideQuests.map((quest) => [quest.id, quest]));
  const battleSkillTypes = new Set(["damage", "heal", "healAll", "revive"]);
  const battleItemTypes = new Set(["heal", "mp", "revive", "stun", "kokhor"]);
  const audioState = {
    context: null,
    master: null,
    sfxBus: null,
    delay: null,
    delayWet: null,
    delayFeedback: null,
    reverb: null,
    reverbWet: null,
    compressor: null,
    trackAudio: null,
    trackKey: "",
    trackElements: {},
    trackFailures: new Set(),
    playlist: [],
    playlistIndex: -1,
    themeTrackKeys: {},
    enabled: true,
    playing: false,
    theme: "title"
  };

  const SAVE_LIMITS = {
    maxGold: 999999,
    maxSteps: 999999,
    maxLevel: 99,
    maxStat: 999,
    maxHpMp: 9999,
    maxInventoryCount: 999,
    maxTrail: 12,
    maxTimestamp: 4102444800000
  };

  const saveMigrations = {
    1: (save) => ({ ...save, version: 2 }),
    2: (save) => ({ ...save, version: 3 }),
    3: (save) => ({ ...save, version: 4 }),
    4: (save) => ({ ...save, version: 5 }),
    5: (save) => ({ ...save, version: 6 }),
    6: (save) => ({ ...save, version: 7 }),
    7: (save) => ({ ...save, version: 8, playTimeMs: 0 })
  };

  const rosterStatuses = new Set(["active", "available", "captured", "unavailable"]);
  const safeCheckpointAreaIds = new Set([
    "krendon", "krendonRoad", "oldMill", "hawkMountains", "hawkSwitchback", "merfolkShoals",
    "grassland", "forest", "deepForest", "freeton", "kingsHighway", "tealsburg", "northernPath",
    "breshen", "savannah", "rathskellerApproach"
  ]);
  (gameConfig.safeCheckpointAreaIds || []).forEach((areaId) => safeCheckpointAreaIds.add(areaId));
  const endingTransitionId = gameConfig.endingTransitionId || "";
  const criticalTransitions = {
    water_orb: { type: "travel", areaId: "krendon", x: 15, y: 15 },
    lithar_ambush: { type: "travel", areaId: "marhynCastle", x: 3, y: 14 },
    darhyn_final: { type: "ending" }
  };
  if (endingTransitionId && !criticalTransitions[endingTransitionId]) {
    criticalTransitions[endingTransitionId] = { type: "ending" };
  }

  function defaultPartyId() {
    return (gameConfig.startPartyIds || []).find((id) => partyTemplates[id]) || Object.keys(partyTemplates)[0] || "";
  }

  function defaultSpriteId() {
    return defaultPartyId() || Object.keys(spriteStyle)[0] || "";
  }

  function defaultGuideSection() {
    return guideData[gameConfig.defaultGuideSection] ? gameConfig.defaultGuideSection : Object.keys(guideData)[0];
  }

  function freshState() {
    const startAreaId = areas[gameConfig.startAreaId] ? gameConfig.startAreaId : areaOrder[0];
    const startArea = areas[startAreaId];
    const configuredPartyIds = (gameConfig.startPartyIds || []).filter((id) => partyTemplates[id]);
    const fallbackPartyId = defaultPartyId();
    const startPartyIds = configuredPartyIds.length ? configuredPartyIds : (fallbackPartyId ? [fallbackPartyId] : []);
    const startingParty = startPartyIds.map(cloneParty);
    const nextState = {
        version: VERSION,
        gameId: gameConfig.id,
        areaId: startAreaId,
        x: startArea.start[0],
        y: startArea.start[1],
      party: startingParty,
      roster: startingParty.map((member) => ({ id: member.id, status: "active", member: structuredClone(member) })),
      activePartyIds: startPartyIds.slice(0, ACTIVE_PARTY_LIMIT),
      inventory: { ...(gameConfig.startInventory || {}) },
      equipment: {},
      gold: gameConfig.startGold || 0,
      flags: {},
      completedEvents: {},
      questJournal: { discovered: {}, trackedId: null },
      steps: 0,
      sideWalkFoot: 1,
      facing: "down",
      movedAt: Date.now(),
      partyTrail: [],
      startedAt: Date.now(),
      playTimeMs: 0,
      updatedAt: Date.now(),
      saveSlot: "adventure",
      mode: "play",
      settings: playerSettings(),
      coaching: { enabled: true, seen: {} },
      lastBattleStep: null,
      encounterStepInterval: null,
      shopPurchases: {},
      shopServices: {},
      creator: creatorState()
    };
    nextState.checkpoint = { areaId: startAreaId, x: startArea.start[0], y: startArea.start[1] };
    nextState.pendingTransition = null;
    markAreaVisited(startAreaId, nextState);
    normalizeEquipment(nextState);
    return nextState;
  }

  function cloneParty(id) {
    return structuredClone(partyTemplates[id]);
  }

  function creatorState(overrides = {}) {
    return { ...creatorDefaults, ...overrides };
  }

  function playerSettings(overrides = {}) {
    return {
      jokeLevel: "normal",
      movementMs: 140,
      battleSpeed: 1.4,
      fastBattle: false,
      musicVolume: 0.72,
      musicMuted: false,
      sfxVolume: 0.85,
      sfxMuted: false,
      reducedEffects: false,
      textSpeed: "instant",
      ...overrides
    };
  }

  function reducedMotionEnabled() {
    return Boolean(state?.settings?.reducedEffects || reducedMotionQuery?.matches);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function numberInRange(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(Math.trunc(numeric), min, max);
  }

  function safeBooleanMap(input, allowed = null) {
    const output = {};
    if (!isPlainObject(input)) return output;
    Object.keys(input).forEach((key) => {
      if (allowed && !allowed.has(key)) return;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return;
      if (key === "__proto__" || key === "prototype" || key === "constructor") return;
      output[key] = Boolean(input[key]);
    });
    return output;
  }

  function sanitizeJokeLevel(input) {
    return jokeLevels.includes(input) ? input : "normal";
  }

  function sanitizeSettings(input) {
    if (!isPlainObject(input)) return playerSettings();
    return playerSettings({
      jokeLevel: sanitizeJokeLevel(input.jokeLevel),
      movementMs: numberInRange(input.movementMs, 80, 240, 140),
      battleSpeed: clamp(Number.isFinite(Number(input.battleSpeed)) ? Number(input.battleSpeed) : 1.4, 0.8, 3),
      fastBattle: Boolean(input.fastBattle),
      musicVolume: clamp(Number.isFinite(Number(input.musicVolume)) ? Number(input.musicVolume) : 0.72, 0, 1),
      musicMuted: Boolean(input.musicMuted),
      sfxVolume: clamp(Number.isFinite(Number(input.sfxVolume)) ? Number(input.sfxVolume) : 0.85, 0, 1),
      sfxMuted: Boolean(input.sfxMuted),
      reducedEffects: Boolean(input.reducedEffects),
      textSpeed: ["instant", "standard", "relaxed"].includes(input.textSpeed) ? input.textSpeed : "instant"
    });
  }

  function sanitizeCoaching(input) {
    return {
      enabled: input?.enabled !== false,
      seen: safeBooleanMap(input?.seen)
    };
  }

  function sanitizeShopMap(input) {
    const output = {};
    if (!isPlainObject(input)) return output;
    const validKeys = new Set(Object.entries(shops).flatMap(([shopId, shop]) => {
      return (shop.items || []).map((offer) => `${shopId}:${offer.item}`);
    }));
    Object.entries(input).forEach(([key, value]) => {
      if (!validKeys.has(key)) return;
      output[key] = numberInRange(value, 0, 99, 0);
    });
    return output;
  }

  function sanitizeQuestJournal(input) {
    const allowedIds = new Set(endingSideQuests.map((quest) => quest.id));
    const discovered = safeBooleanMap(input?.discovered, allowedIds);
    const trackedId = typeof input?.trackedId === "string" && allowedIds.has(input.trackedId) ? input.trackedId : null;
    return { discovered, trackedId };
  }

  function knownInventoryNames() {
    return new Set([
      ...Object.values(battleItemCatalog).map((item) => item.inventory),
      ...Object.keys(weaponCatalog),
      ...Object.keys(armorCatalog),
      ...Object.keys(accessoryCatalog).filter((name) => !accessoryCatalog[name].starter),
      ...Object.keys(creatorGear)
    ]);
  }

  function knownFlagNames() {
    return new Set([
      ...creatorRouteFlags,
      ...knownExtraFlagNames
    ]);
  }

  function knownCompletedEventIds() {
    const ids = new Set(knownBaseCompletedEventIds);
    Object.keys(areas).forEach((id) => ids.add(`visit_${id}`));
    Object.values(areas).forEach((areaConfig) => {
      (areaConfig.events || []).forEach((event) => {
        if (event?.id) ids.add(event.id);
      });
    });
    return ids;
  }

  function markAreaVisited(areaId, targetState = state) {
    if (!targetState || !areas[areaId]) return;
    targetState.completedEvents ||= {};
    targetState.completedEvents[`visit_${areaId}`] = true;
    const parentAreaId = worldAreaId(areaId);
    if (parentAreaId !== areaId && areas[parentAreaId]) {
      targetState.completedEvents[`visit_${parentAreaId}`] = true;
    }
    syncQuestJournal(targetState);
  }

  function sanitizeInventory(input) {
    const output = {};
    if (!isPlainObject(input)) return output;
    const allowed = knownInventoryNames();
    Object.entries(input).forEach(([name, count]) => {
      if (!allowed.has(name)) return;
      const safeCount = numberInRange(count, 0, SAVE_LIMITS.maxInventoryCount, 0);
      if (safeCount > 0) output[name] = safeCount;
    });
    return output;
  }

  function sanitizePartyMember(member) {
    if (!isPlainObject(member) || !hasOwn(partyTemplates, member.id)) return null;
    const template = cloneParty(member.id);
    template.level = numberInRange(member.level, 1, SAVE_LIMITS.maxLevel, template.level);
    template.maxHp = numberInRange(member.maxHp, 1, SAVE_LIMITS.maxHpMp, template.maxHp);
    template.maxMp = numberInRange(member.maxMp, 0, SAVE_LIMITS.maxHpMp, template.maxMp);
    template.hp = numberInRange(member.hp, 0, template.maxHp, Math.min(template.hp, template.maxHp));
    template.mp = numberInRange(member.mp, 0, template.maxMp, Math.min(template.mp, template.maxMp));
    template.atk = numberInRange(member.atk, 0, SAVE_LIMITS.maxStat, template.atk);
    template.def = numberInRange(member.def, 0, SAVE_LIMITS.maxStat, template.def);
    template.xp = numberInRange(member.xp, 0, SAVE_LIMITS.maxGold, template.xp);
    return template;
  }

  function sanitizeParty(input) {
    const seen = new Set();
    const party = [];
    if (Array.isArray(input)) {
      input.forEach((member) => {
        const safe = sanitizePartyMember(member);
        if (!safe || seen.has(safe.id)) return;
        seen.add(safe.id);
        party.push(safe);
      });
    }
    if (!party.length && defaultPartyId()) party.push(cloneParty(defaultPartyId()));
    return party.slice(0, Object.keys(partyTemplates).length);
  }

  function sanitizeActivePartyIds(input, safeParty) {
    const partyIds = new Set(safeParty.map((member) => member.id));
    const seen = new Set();
    const active = [];
    if (Array.isArray(input)) {
      input.forEach((id) => {
        if (!partyIds.has(id) || seen.has(id)) return;
        seen.add(id);
        active.push(id);
      });
    }
    safeParty.forEach((member) => {
      if (active.length >= ACTIVE_PARTY_LIMIT || seen.has(member.id)) return;
      seen.add(member.id);
      active.push(member.id);
    });
    return active.slice(0, ACTIVE_PARTY_LIMIT);
  }

  function sanitizeRoster(input, safeParty) {
    const records = new Map();
    if (Array.isArray(input)) {
      input.forEach((record) => {
        if (!isPlainObject(record)) return;
        const member = sanitizePartyMember(record.member || record);
        if (!member || records.has(member.id)) return;
        records.set(member.id, {
          id: member.id,
          status: rosterStatuses.has(record.status) ? record.status : "unavailable",
          member
        });
      });
    }
    safeParty.forEach((member) => {
      records.set(member.id, { id: member.id, status: "available", member: structuredClone(member) });
    });
    return [...records.values()];
  }

  function equipmentMembersForState(targetState = state) {
    if (!targetState) return [];
    const members = new Map();
    (targetState.party || []).forEach((member) => members.set(member.id, member));
    (targetState.roster || []).forEach((record) => {
      if (!record?.member || record.status === "unavailable" || members.has(record.id)) return;
      members.set(record.id, record.member);
    });
    return [...members.values()];
  }

  function sanitizeCheckpoint(input, fallbackAreaId, fallbackX, fallbackY) {
    const legacyFallbacks = {
      tideCavern: "merfolkShoals", moonMarsh: "grassland", marhynCastle: "grassland", marhynHalls: "grassland",
      marhynWestCells: "grassland", marhynDerlinTower: "grassland", marhynVault: "grassland", marhynArmory: "grassland",
      corizazLair: "freeton", marketMaze: "tealsburg", tealsburgShop: "tealsburg", glassCaves: "savannah",
      rathskeller: "rathskellerApproach"
    };
    const defaultAreaId = safeCheckpointAreaIds.has(fallbackAreaId) ? fallbackAreaId : (legacyFallbacks[fallbackAreaId] || fallbackAreaId);
    const areaId = isPlainObject(input) && areas[input.areaId] ? input.areaId : defaultAreaId;
    const targetArea = areas[areaId];
    const start = targetArea.start || (areaId === fallbackAreaId ? [fallbackX, fallbackY] : [7, 7]);
    const x = numberInRange(input?.x, 0, targetArea.map[0].length - 1, start[0]);
    const y = numberInRange(input?.y, 0, targetArea.map.length - 1, start[1]);
    return coordinatePassable(areaId, x, y) ? { areaId, x, y } : { areaId, x: start[0], y: start[1] };
  }

  function sanitizePendingTransition(input) {
    if (!isPlainObject(input)) return null;
    if (input.eventId === "zoom_travel") {
      const destination = zoomDestinations.find((entry) => entry.id === input.areaId);
      if (!destination || !areas[destination.id]) return null;
      return {
        eventId: "zoom_travel",
        type: "travel",
        phase: "departing",
        areaId: destination.id,
        source: input.source === "spell" ? "spell" : "item",
        casterId: typeof input.casterId === "string" && partyTemplates[input.casterId] ? input.casterId : ""
      };
    }
    if (!criticalTransitions[input.eventId]) return null;
    const definition = criticalTransitions[input.eventId];
    return {
      eventId: input.eventId,
      type: definition.type,
      phase: typeof input.phase === "string" ? input.phase.slice(0, 32) : "pending",
      ...(definition.type === "travel" ? { areaId: definition.areaId, x: definition.x, y: definition.y } : {})
    };
  }

  function sanitizeEquipment(input, safeParty, safeInventory) {
    const output = {};
    if (!isPlainObject(input)) return output;
    const partyState = { party: safeParty, inventory: safeInventory };
    safeParty.forEach((member) => {
      const wanted = input[member.id];
      const wantedEntry = typeof wanted === "string" ? { weapon: wanted } : isPlainObject(wanted) ? wanted : {};
      const safeEntry = {};
      const availableWeapons = weaponsForMember(member, partyState).map((weapon) => weapon.name);
      const availableArmor = armorForMember(member, partyState).map((armor) => armor.name);
      const availableAccessories = accessoriesForMember(member, partyState).map((accessory) => accessory.name);
      if (availableWeapons.includes(wantedEntry.weapon)) safeEntry.weapon = wantedEntry.weapon;
      if (availableArmor.includes(wantedEntry.armor)) safeEntry.armor = wantedEntry.armor;
      if (availableAccessories.includes(wantedEntry.accessory)) safeEntry.accessory = wantedEntry.accessory;
      if (Object.keys(safeEntry).length) output[member.id] = safeEntry;
    });
    return output;
  }

  function sanitizePartyTrail(input, areaId) {
    if (!Array.isArray(input)) return [];
    const trailArea = areas[areaId];
    const width = trailArea?.map?.[0]?.length || MAP_W;
    const height = trailArea?.map?.length || MAP_H;
    return input
      .filter((step) => isPlainObject(step) && step.areaId === areaId && Number.isFinite(Number(step.x)) && Number.isFinite(Number(step.y)))
      .map((step) => ({
        x: numberInRange(step.x, 0, width - 1, 0),
        y: numberInRange(step.y, 0, height - 1, 0),
        facing: hasOwn(DIRS, step.facing) ? step.facing : "down",
        areaId,
        movedAt: numberInRange(step.movedAt, 0, SAVE_LIMITS.maxTimestamp, Date.now())
      }))
      .slice(0, SAVE_LIMITS.maxTrail);
  }

  function sanitizeCreator(input) {
    const output = creatorState();
    if (!isPlainObject(input)) return output;
    Object.keys(creatorDefaults).forEach((key) => {
      output[key] = Boolean(input[key]);
    });
    return output;
  }

  function sanitizeEncounterStepInterval(input) {
    if (input === null || input === undefined || input === "" || input === "normal") return null;
    const numeric = Number(input);
    if (!Number.isFinite(numeric)) return null;
    const value = Math.trunc(numeric);
    if (value <= 0) return 0;
    return clamp(value, ENCOUNTER_DIAL_MIN_STEPS, ENCOUNTER_DIAL_MAX_STEPS);
  }

  function migrateSaveVersion(save) {
    if (!isPlainObject(save)) {
      throw new Error(`Invalid ${gameConfig.title} save file.`);
    }
    let version = Number(save.version);
    if (!Number.isInteger(version)) version = 1;
    if (version < 1 || version > VERSION) {
      throw new Error(`Invalid ${gameConfig.title} save file.`);
    }
    let migrated = { ...save, version };
    while (migrated.version < VERSION) {
      const migrate = saveMigrations[migrated.version];
      if (!migrate) throw new Error(`Unsupported ${gameConfig.title} save version.`);
      migrated = migrate(migrated);
    }
    return migrated;
  }

  const completedEventFlagRepairs = {
    dream_darhyn: ["dreamDarhynDefeated"],
    water_orb: ["waterSpellDream"],
    zelin: ["metZelin"],
    betsy: ["milkedBetsy"],
    mill_martha: ["millQuest"],
    dust_knight: ["millSaved"],
    hawk_switchback_view: ["switchbackSurveyed"],
    star_shrine_voice: ["skyShrineSolved"],
    tustor_grave: ["tustorRaised"],
    tide_priest: ["tideQuest"],
    river_slime_regent: ["tideRegentDefeated"],
    lithar_ambush: ["capturedByLithar"],
    marsh_jester: ["marshQuest"],
    marsh_wisp: ["marshBookRecovered"],
    yan_escape: ["yanFreed"],
    marhyn_keyring: ["marhynKeyring"],
    forest_yan_missing: ["yanVanished"],
    eagle_rune_sword: ["runeSword"],
    freeton_mayor: ["heardCorizaz"],
    freeton_townsgirl: ["heardCorizaz", "corizazLairRevealed"],
    corizaz_door: ["lightSword"],
    corizaz_sleeping: ["lightSword"],
    yan_returns: ["yanReturned"],
    fear_creature: ["escapedFear"],
    king_garkin: ["metKing"],
    yvonne_decoy: ["yvonneDecoyChased"],
    market_scribe: ["marketQuest"],
    paper_mimic: ["marketLedgerRecovered"],
    northern_scout: ["reachedBreshenPath"],
    valena: ["valenaJoined"],
    hano: ["hanoDefeated"],
    elven_king: ["rathskellerKnown"],
    savannah_camp: ["readyForRathskeller"],
    glass_miner: ["glassQuest"],
    crystal_mole: ["glassCavesCalmed"],
    ten_doors: ["windSpell"],
    lithar_final: ["litharDone"],
    darhyn_final: ["gameComplete", "yanSacrificed"]
  };

  const storyRewardItemRepairs = [
    { events: ["water_orb"], flags: ["waterSpellDream"], items: { "Water Orb Spell": 1, "Water Orb Focus": 1 } },
    { events: ["dust_knight"], flags: ["millSaved"], items: { "Befuddling Bell": 1 } },
    { events: ["star_shrine_voice"], flags: ["skyShrineSolved"], items: { "Sky Charm": 1 } },
    { events: ["tustor_grave"], flags: ["tustorRaised"], items: { "Water Scroll": 1 } },
    { events: ["marsh_wisp"], flags: ["marshBookRecovered"], items: { "Marsh Joke Book": 1 } },
    { events: ["derlin_cell_key"], items: { "Derlin Cell Key": 1, "Old Yan's Knotted Staff": 1 } },
    { events: ["eagle_rune_sword"], flags: ["runeSword"], items: { "Rune Sword": 1, "Road Cloak": 1 } },
    { events: ["corizaz_door", "corizaz_sleeping"], flags: ["lightSword"], items: { "Light Sword": 1, "Apprentice Guard": 1 } },
    { events: ["paper_mimic"], flags: ["marketLedgerRecovered"], items: { "Scribe Pass": 1 } },
    { events: ["ten_doors"], flags: ["windSpell"], items: { "Wind Spell": 1, "Wind Dragon Staff": 1, "Dragon Scale Mantle": 1 } }
  ];

  function repairCompletedEventFlags(normalized) {
    Object.entries(completedEventFlagRepairs).forEach(([eventId, flagNames]) => {
      if (!normalized.completedEvents[eventId]) return;
      flagNames.forEach((flagName) => {
        normalized.flags[flagName] = true;
      });
    });
  }

  function repairStoryRewardItems(normalized) {
    storyRewardItemRepairs.forEach((repair) => {
      const earnedByEvent = (repair.events || []).some((eventId) => normalized.completedEvents[eventId]);
      const earnedByFlag = (repair.flags || []).some((flagName) => normalized.flags[flagName]);
      if (!earnedByEvent && !earnedByFlag) return;
      Object.entries(repair.items).forEach(([name, count]) => {
        normalized.inventory[name] = Math.max(Number(normalized.inventory[name]) || 0, count);
      });
    });
  }

  function applyStoryMigrations(normalized, options = {}) {
    repairCompletedEventFlags(normalized);

    const earlyYanReturn = normalized.completedEvents.yan_escape && !normalized.completedEvents.yan_returns && !normalized.flags.escapedFear;
    if (earlyYanReturn) {
      delete normalized.flags.yanReturned;
      if (normalized.flags.lightSword) normalized.flags.yanVanished = true;
      if (normalized.flags.yanVanished) {
        normalized.party = normalized.party.filter((member) => member.id !== "yan" && member.id !== "yanOld");
      } else {
        const youngYanIndex = normalized.party.findIndex((member) => member.id === "yan");
        const hasOldYan = normalized.party.some((member) => member.id === "yanOld");
        if (youngYanIndex >= 0 && !hasOldYan) {
          normalized.party[youngYanIndex] = cloneParty("yanOld");
        } else if (youngYanIndex >= 0) {
          normalized.party.splice(youngYanIndex, 1);
        } else if (normalized.flags.yanFreed && !hasOldYan) {
          normalized.party.push(cloneParty("yanOld"));
        }
      }
    }

    if (normalized.completedEvents.rune_sword && !normalized.completedEvents.eagle_rune_sword && !normalized.flags.lightSword) {
      delete normalized.flags.runeSword;
      delete normalized.inventory["Rune Sword"];
      delete normalized.completedEvents.rune_sword;
    }

    if (normalized.flags.lightSword) {
      normalized.flags.heardCorizaz = true;
      normalized.flags.corizazLairRevealed = true;
    }

    if (options.repairRewardItems) repairStoryRewardItems(normalized);
  }

  function normalizeState(save, options = {}) {
    if (save?.gameId && save.gameId !== gameConfig.id) {
      throw new Error(`That save belongs to ${save.gameId}, not ${gameConfig.title}.`);
    }
    const sourceVersion = Number.isInteger(Number(save?.version)) ? Number(save.version) : 1;
    save = migrateSaveVersion(save);
    if (typeof save.areaId !== "string" || !hasOwn(areas, save.areaId)) {
      throw new Error(`Invalid ${gameConfig.title} save file.`);
    }

    const currentArea = areas[save.areaId];
    const start = currentArea.start || [7, 7];
      const normalized = {
        version: VERSION,
        gameId: gameConfig.id,
        areaId: save.areaId,
        x: numberInRange(save.x, 0, (currentArea.map?.[0]?.length || MAP_W) - 1, start[0]),
        y: numberInRange(save.y, 0, (currentArea.map?.length || MAP_H) - 1, start[1]),
        party: sanitizeParty(save.party),
        roster: [],
        activePartyIds: [],
        inventory: sanitizeInventory(save.inventory),
      equipment: {},
      gold: numberInRange(save.gold, 0, SAVE_LIMITS.maxGold, 0),
      flags: safeBooleanMap(save.flags, knownFlagNames()),
      completedEvents: safeBooleanMap(save.completedEvents, knownCompletedEventIds()),
      questJournal: sanitizeQuestJournal(save.questJournal),
      steps: numberInRange(save.steps, 0, SAVE_LIMITS.maxSteps, 0),
      sideWalkFoot: numberInRange(save.sideWalkFoot, 0, 1, 1),
      facing: hasOwn(DIRS, save.facing) ? save.facing : "down",
      movedAt: numberInRange(save.movedAt, 0, SAVE_LIMITS.maxTimestamp, Date.now()),
      partyTrail: sanitizePartyTrail(save.partyTrail, save.areaId),
      startedAt: numberInRange(save.startedAt, 0, SAVE_LIMITS.maxTimestamp, Date.now()),
      playTimeMs: numberInRange(save.playTimeMs, 0, SAVE_LIMITS.maxTimestamp, 0),
      updatedAt: numberInRange(save.updatedAt, 0, SAVE_LIMITS.maxTimestamp, Date.now()),
      saveSlot: options.saveSlot === "creator" || options.saveSlot === "adventure"
        ? options.saveSlot
        : (save.saveSlot === "creator" || save.saveSlot === "adventure" ? save.saveSlot : (save.creator?.enabled ? "creator" : "adventure")),
      mode: save.mode === "complete" ? "complete" : "play",
      settings: sanitizeSettings(save.settings),
      coaching: sanitizeCoaching(save.coaching),
      shopPurchases: sanitizeShopMap(save.shopPurchases),
      shopServices: safeBooleanMap(save.shopServices),
      lastBattleStep: save.lastBattleStep !== null && save.lastBattleStep !== undefined && Number.isFinite(Number(save.lastBattleStep))
        ? numberInRange(save.lastBattleStep, 0, numberInRange(save.steps, 0, SAVE_LIMITS.maxSteps, 0), 0)
        : null,
      encounterStepInterval: sanitizeEncounterStepInterval(save.encounterStepInterval),
      creator: sanitizeCreator(save.creator)
    };

    if (!coordinatePassable(normalized.areaId, normalized.x, normalized.y)) {
      if (options.strictCoordinates) throw new Error("Save position is on an impassable tile.");
      normalized.x = start[0];
      normalized.y = start[1];
    }

    markAreaVisited(normalized.areaId, normalized);
    normalized.activePartyIds = sanitizeActivePartyIds(save.activePartyIds, normalized.party);
    normalized.roster = sanitizeRoster(save.roster, normalized.party);
    normalized.checkpoint = sanitizeCheckpoint(save.checkpoint, normalized.areaId, normalized.x, normalized.y);
    normalized.pendingTransition = sanitizePendingTransition(save.pendingTransition);
    applyStoryMigrations(normalized, { repairRewardItems: sourceVersion < STORY_REWARD_REPAIR_VERSION });
    normalizeActiveParty(normalized);
    normalized.equipment = sanitizeEquipment(save.equipment, equipmentMembersForState(normalized), normalized.inventory);
    normalizeEquipment(normalized);
    syncRosterFromParty(normalized);
    syncQuestJournal(normalized);
    return normalized;
  }

  function creatorFlag(name) {
    return Boolean(state?.creator?.enabled && state.creator[name]);
  }

  function jokeLevel() {
    return sanitizeJokeLevel(state?.settings?.jokeLevel);
  }

  function setJokeLevel(level) {
    if (!state) return false;
    const safeLevel = sanitizeJokeLevel(level);
    state.settings = sanitizeSettings({ ...state.settings, jokeLevel: safeLevel });
    menuMessage = `Story Tone set to ${jokeLevelLabels[safeLevel]}.`;
    saveLocal();
    return true;
  }

  function coach(id) {
    if (!state?.coaching?.enabled || state?.creator?.enabled || !coachingTips[id] || state.coaching.seen[id] || coachingQueue.includes(id)) return false;
    coachingQueue.push(id);
    setTimeout(tryShowCoach, 0);
    return true;
  }

  function tryShowCoach() {
    if (!coachingQueue.length || !state?.coaching?.enabled) return;
    if (activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || modalOpen()) {
      setTimeout(tryShowCoach, 300);
      return;
    }
    const id = coachingQueue.shift();
    const [title, text] = coachingTips[id];
    state.coaching.seen[id] = true;
    $("coach-title").textContent = title;
    $("coach-text").textContent = text;
    $("coach-modal").dataset.coachId = id;
    showManagedDialog("coach-modal", "#coach-close");
    saveLocal();
  }

  function closeCoach(disable = false) {
    if (disable && state) {
      state.coaching.enabled = false;
      coachingQueue.length = 0;
      saveLocal();
    }
    hideManagedDialog("coach-modal");
    setTimeout(tryShowCoach, 0);
  }

  function dialogueTextForCurrentJokeLevel(text) {
    const level = jokeLevel();
    const resolved = isPlainObject(text)
      ? String(text[level] ?? text.normal ?? text.low ?? text.high ?? "")
      : String(text ?? "");
    return level === "low" ? (lowToneDialogueOverrides.get(resolved) || resolved) : resolved;
  }

  function resolveDialogueLine(line) {
    if (Array.isArray(line)) {
      return [line[0] || "Narrator", dialogueTextForCurrentJokeLevel(line[1])];
    }
    if (isPlainObject(line)) {
      return [line.speaker || line.name || "Narrator", dialogueTextForCurrentJokeLevel(line.text ?? line)];
    }
    return ["Narrator", dialogueTextForCurrentJokeLevel(line)];
  }

  function resolveDialogueLines(lines) {
    const source = Array.isArray(lines) ? lines : [["Narrator", ""]];
    return source
      .map(resolveDialogueLine)
      .filter(([, text]) => text);
  }

  function dialogueSpeaker(line) {
    if (Array.isArray(line)) return line[0] || "Narrator";
    if (isPlainObject(line)) return line.speaker || line.name || "Narrator";
    return "Narrator";
  }

  function flag(name) {
    state.flags[name] = true;
    syncQuestJournal();
  }

  function hasFlag(name) {
    return !name || Boolean(state.flags[name]);
  }

  function syncQuestJournal(targetState = state) {
    if (!targetState) return;
    targetState.questJournal = sanitizeQuestJournal(targetState.questJournal);
    endingSideQuests.forEach((quest) => {
      const discoveredByArea = (quest.discoverAreas || [quest.areaId]).some((areaId) => targetState.completedEvents?.[`visit_${areaId}`]);
      const discoveredByProgress = Boolean(targetState.flags?.[quest.startFlag] || targetState.flags?.[quest.flag]);
      if (targetState.flags?.gameComplete || discoveredByArea || discoveredByProgress) {
        targetState.questJournal.discovered[quest.id] = true;
      }
    });
    if (targetState.questJournal.trackedId && !targetState.questJournal.discovered[targetState.questJournal.trackedId]) {
      targetState.questJournal.trackedId = null;
    }
  }

  function questIsDiscovered(quest, targetState = state) {
    syncQuestJournal(targetState);
    return Boolean(targetState?.questJournal?.discovered?.[quest.id]);
  }

  function sideQuestStatus(quest, targetState = state) {
    if (targetState.flags?.[quest.flag]) return "completed";
    if (!questIsDiscovered(quest, targetState)) return "undiscovered";
    const flags = targetState.flags || {};
    const inventory = targetState.inventory || {};
    if (quest.id === "oldMill" && flags.millQuest && !inventory["Rune Sword"]) return "blocked";
    if (quest.id === "tideCavern" && !inventory["Water Scroll"]) return "blocked";
    if (quest.id === "glassCaves" && !inventory["Scribe Pass"]) return "blocked";
    const active = Boolean(flags[quest.startFlag]) || targetState.areaId === quest.areaId || Boolean(targetState.completedEvents?.[`visit_${quest.areaId}`]);
    return active ? "active" : "discovered";
  }

  function sideQuestGuidance(quest, targetState = state) {
    const flags = targetState.flags || {};
    const inventory = targetState.inventory || {};
    if (flags[quest.flag]) return `Completed — ${quest.summary}`;
    if (quest.id === "oldMill") {
      if (!flags.millQuest) return "Speak with Martha inside the Old Mill.";
      return inventory["Rune Sword"] ? "Challenge the Dust Knight in the gear room." : "Return after obtaining the Rune Sword. Martha's Zoom Shell can take you back to Krendon.";
    }
    if (quest.id === "starShrine") {
      if (!flags.starWestObserved || !flags.starEastObserved) return "Observe both star niches, then compare their light and shadows at the central shrine.";
      return "Return to the central shrine with both observations.";
    }
    if (quest.id === "tideCavern") {
      if (!inventory["Water Scroll"]) return "Tustor's Water Scroll opens the western current from the Merfolk Shoals.";
      if (!flags.tideQuest) return "Speak with the Tide Priest.";
      if (!flags.tideWestSluice || !flags.tideEastSluice) return "Open the western and eastern sluices to break the Regent's wards.";
      return "Challenge the River Slime Regent.";
    }
    if (quest.id === "moonMarsh") {
      if (!flags.marshQuest) return "Speak with the Marsh Jester.";
      if (!flags.marshBlueReeds || !flags.marshSilverReeds) return "Inspect both reed caches and compare how they react to the wisps.";
      return "Use the reed clues to identify and confront the real Marsh Wisp.";
    }
    if (quest.id === "marketMaze") return flags.marketQuest ? "Find and defeat the Paper Mimic in the central market lanes." : "Ask the Market Scribe about the missing ledger.";
    if (quest.id === "glassCaves") {
      if (!inventory["Scribe Pass"]) return "Recover the Scribe Pass from the Tealsburg Market Maze.";
      if (!flags.glassQuest) return "Show the pass to the Glass Miner.";
      if (!flags.glassLowResonator || !flags.glassHighResonator) return "Tune the low western and high southern crystal resonators.";
      return "Confront the Crystal Mole after both resonators agree.";
    }
    return quest.summary;
  }

  function setTrackedSideQuest(id) {
    if (!state || (id && !sideQuestById.has(id))) return false;
    syncQuestJournal();
    if (id && !state.questJournal.discovered[id]) return false;
    state.questJournal.trackedId = id || null;
    menuMessage = id ? `Tracking ${sideQuestById.get(id).name}.` : "Sidequest tracking cleared.";
    saveLocal();
    render();
    return true;
  }

  function hasParty(id) {
    return state.party.some((member) => member.id === id);
  }

  function hasItem(name) {
    return !name || (state.inventory[name] || 0) > 0;
  }

  function hasEncounterDial(targetState = state) {
    return Boolean((targetState?.inventory?.[ENCOUNTER_DIAL_ITEM] || 0) > 0);
  }

  function encounterDialInterval() {
    if (!hasEncounterDial()) return null;
    return sanitizeEncounterStepInterval(state.encounterStepInterval);
  }

  function encounterDialStatus() {
    const interval = encounterDialInterval();
    if (interval === null) return "Normal";
    if (interval === 0) return "Off";
    return `Every ${interval} steps`;
  }

  function controlledEncounterStepCount() {
    if (!Number.isFinite(lastBattleStep)) {
      lastBattleStep = state?.steps || 0;
      return 0;
    }
    return stepsSinceLastBattle();
  }

  function setEncounterStepInterval(value) {
    if (!state || !hasEncounterDial()) return false;
    const interval = sanitizeEncounterStepInterval(value);
    state.encounterStepInterval = interval;
    lastBattleStep = state.steps;
    state.lastBattleStep = lastBattleStep;
    if (interval === null) menuMessage = "Encounter Dial returned to normal random encounters.";
    else if (interval === 0) menuMessage = "Encounter Dial turned random encounters off.";
    else menuMessage = `Encounter Dial set to every ${interval} steps.`;
    render();
    saveLocal();
    return true;
  }

  function activePartyMaxLevel() {
    return Math.max(0, ...activePartyMembers().map((member) => member.level || 1));
  }

  function memberById(id, sourceState = state) {
    return sourceState?.party?.find((member) => member.id === id) || null;
  }

  function syncRosterFromParty(targetState = state) {
    if (!targetState) return [];
    const records = new Map((targetState.roster || []).map((record) => [record.id, record]));
    const activeIds = new Set(targetState.activePartyIds || []);
    (targetState.party || []).forEach((member) => {
      records.set(member.id, {
        id: member.id,
        status: activeIds.has(member.id) ? "active" : "available",
        member: structuredClone(member)
      });
    });
    targetState.roster = [...records.values()];
    return targetState.roster;
  }

  function rosterMember(id) {
    const record = state?.roster?.find((entry) => entry.id === id);
    return record?.member ? structuredClone(record.member) : null;
  }

  function setRosterStatus(id, status) {
    if (!state || !rosterStatuses.has(status)) return;
    syncRosterFromParty();
    const record = state.roster.find((entry) => entry.id === id);
    if (record) record.status = status;
  }

  function normalizeActiveParty(targetState = state) {
    if (!targetState) return [];
    targetState.activePartyIds = sanitizeActivePartyIds(targetState.activePartyIds, targetState.party || []);
    return targetState.activePartyIds;
  }

  function activePartyMembers(sourceState = state) {
    const ids = normalizeActiveParty(sourceState);
    return ids.map((id) => memberById(id, sourceState)).filter(Boolean);
  }

  function reservePartyMembers(sourceState = state) {
    const activeIds = new Set(normalizeActiveParty(sourceState));
    return (sourceState?.party || []).filter((member) => !activeIds.has(member.id));
  }

  function isActivePartyMember(id) {
    return normalizeActiveParty().includes(id);
  }

  function switchActivePartyMember(outId, inId, options = {}) {
    if (!state || (activeBattle?.busy && !options.allowBusy)) return false;
    const outMember = memberById(outId);
    const inMember = memberById(inId);
    const activeIds = normalizeActiveParty();
    const outIndex = activeIds.indexOf(outId);
    if (!outMember || !inMember || outIndex < 0 || activeIds.includes(inId)) return false;
    if (activeBattle?.choices?.[outId] && !options.allowQueued) return false;
    activeIds[outIndex] = inId;
    state.activePartyIds = activeIds;
    loadArtAssets([...characterAssetKeysForIds([inId])]);
    if (activeBattle?.choices) delete activeBattle.choices[outId];
    menuMessage = `${inMember.name} switches in for ${outMember.name}.`;
    if (!options.silent) {
      render();
      saveLocal();
    }
    return true;
  }

  function promoteLivingReserve() {
    const reserves = reservePartyMembers().filter((member) => member.hp > 0);
    if (!reserves.length) return false;
    const activeIds = normalizeActiveParty();
    const replaceIndex = activeIds.findIndex((id) => (memberById(id)?.hp || 0) <= 0);
    if (replaceIndex < 0) return false;
    activeIds[replaceIndex] = reserves[0].id;
    state.activePartyIds = activeIds;
    if (activeBattle) activeBattle.choices = {};
    return true;
  }

  function promoteLivingReserves() {
    const promoted = [];
    let nextReserve = reservePartyMembers().find((member) => member.hp > 0);
    while (nextReserve && promoteLivingReserve()) {
      promoted.push(nextReserve);
      nextReserve = reservePartyMembers().find((member) => member.hp > 0);
    }
    return promoted;
  }

  function addParty(id) {
    if (!hasParty(id)) {
      const lineupWasFull = normalizeActiveParty().length >= ACTIVE_PARTY_LIMIT;
      const rosterRecord = state.roster?.find((entry) => entry.id === id);
      const returningMember = rosterMember(id) || cloneParty(id);
      if (rosterRecord?.status === "captured" && returningMember.hp <= 0) returningMember.hp = 1;
      state.party.push(returningMember);
      normalizeActiveParty();
      syncRosterFromParty();
      normalizeEquipment();
      loadArtAssets([...characterAssetKeysForIds([id])]);
      if (lineupWasFull && !creatorFlag("enabled")) {
        state.coaching.seen.party = true;
        pendingRecruitNames.push(memberById(id)?.name || partyTemplates[id]?.name || id);
        setTimeout(promptForRecruitLineup, 0);
      }
    }
  }

  function promptForRecruitLineup() {
    if (!pendingRecruitNames.length) return;
    if (activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || modalOpen()) {
      setTimeout(promptForRecruitLineup, 350);
      return;
    }
    const names = [...new Set(pendingRecruitNames.splice(0))];
    menuMessage = `${names.join(" and ")} joined as ${names.length > 1 ? "reserves" : "a reserve"}. Only four characters can be active; choose an active member's Switch control if you want to change the lineup.`;
    openMenu("characters");
  }

  function setParty(ids) {
    syncRosterFromParty();
    const existing = new Map(state.party.map((member) => [member.id, member]));
    const wanted = new Set(ids);
    state.party.forEach((member) => {
      const record = state.roster.find((entry) => entry.id === member.id);
      if (!wanted.has(member.id) && record) record.status = "captured";
    });
    const seen = new Set();
    state.party = ids
      .filter((id) => hasOwn(partyTemplates, id) && !seen.has(id) && seen.add(id))
      .map((id) => existing.get(id) || rosterMember(id) || cloneParty(id));
    normalizeActiveParty();
    syncRosterFromParty();
    normalizeEquipment();
  }

  function removeParty(id, rosterStatus = "unavailable") {
    syncRosterFromParty();
    setRosterStatus(id, rosterStatus);
    state.party = state.party.filter((member) => member.id !== id);
    normalizeActiveParty();
  }

  function addItem(name, count, options = {}) {
    state.inventory[name] = (state.inventory[name] || 0) + count;
    if (options.announce !== false) queueEquipmentOffer(name, options);
  }

  function addGold(count) {
    state.gold = numberInRange((state.gold || 0) + count, 0, SAVE_LIMITS.maxGold, state.gold || 0);
  }

  function setMode(mode) {
    state.mode = mode === "complete" ? "complete" : "play";
  }

  function grantConfiguredItemRewards(rewards = []) {
    return rewards
      .map((reward) => {
        const name = reward?.name;
        const count = Math.max(1, Number.parseInt(reward?.count || 1, 10) || 1);
        if (!name) return null;
        addItem(name, count, { announce: false });
        return {
          name,
          count,
          key: Boolean(reward.key),
          image: reward.image || inventoryItemImageKey(name),
          text: reward.text || inventoryItemText(name)
        };
      })
      .filter(Boolean);
  }

  function guideInventoryEntry(name) {
    return [
      ...(guideData.items || []),
      ...(guideData.weapons || []),
      ...(guideData.armor || []),
      ...(guideData.accessories || []),
      ...(guideData.spells || [])
    ].find((entry) => entry.name === name);
  }

  function inventoryItemImageKey(name) {
    const guideEntry = guideInventoryEntry(name);
    if (guideEntry?.image) return guideEntry.image;
    const catalogEntry = Object.values(battleItemCatalog).find((item) => item.inventory === name);
    if (catalogEntry?.id) return `item:${catalogEntry.id}`;
    if (weaponCatalog[name]) return equipmentItemImageKey("weapon", name);
    if (armorCatalog[name]) return equipmentItemImageKey("armor", name);
    if (accessoryCatalog[name]) return equipmentItemImageKey("accessory", name);
    return "item:gold";
  }

  function inventoryItemText(name) {
    const guideEntry = guideInventoryEntry(name);
    return guideEntry?.text || "Added to inventory.";
  }

  function equipmentItemImageKey(slot, name) {
    const guideEntry = guideInventoryEntry(name);
    if (guideEntry?.image) return guideEntry.image;
    const weaponImages = {
      "Training Sword": "sword",
      "Elven Bow": "longbow",
      "Walking Staff": "staff",
      "Dragon Staff": "dragonstaff",
      "Thief Crossbow": "crossbow",
      "Sacred Branch": "branch",
      "Rune Sword": "rune",
      "Light Sword": "light",
      "Derlin's Redblade": "redblade",
      "Breshen Longbow": "longbow",
      "Old Yan's Knotted Staff": "staff",
      "Wind Dragon Staff": "dragonstaff",
      "Yvonne's Crossbow": "crossbow",
      "Tealsburg Repeater": "repeater",
      "Moonbranch Scepter": "branch",
      "Hano's Hammer": "hammer"
    };
    const armorImages = {
      "Travel Clothes": "clothes",
      "Road Cloak": "cloak",
      "Apprentice Guard": "guard",
      "Blue-Black Coat": "bluecoat",
      "Derlin's Red Cloak": "derlinCloak",
      "Elven Leafmail": "leafmail",
      "Old Yan's Grey Robe": "greyrobe",
      "Skyweave Robe": "skyweave",
      "Dragon Scale Mantle": "dragonmantle",
      "VS Armor": "vs",
      "Valena's Branch Guard": "branch"
    };
    const accessoryImages = {
      "No Accessory": "none",
      "Glass Flute": "flute",
      "Befuddling Bell": "bell",
      "Sky Charm": "charm",
      "Tide Pearl": "pearl",
      "Moonthread Ring": "ring",
      "Water Orb Focus": "orb"
    };
    if (slot === "armor") return `armor:${armorImages[name] || "clothes"}`;
    if (slot === "accessory") return `accessory:${accessoryImages[name] || "ring"}`;
    return `weapon:${weaponImages[name] || "sword"}`;
  }

  function useItem(name) {
    if (!state.inventory[name]) return false;
    state.inventory[name] -= 1;
    if (state.inventory[name] <= 0) delete state.inventory[name];
    return true;
  }

  function stealTealsburgLoot() {
    if (hasFlag("yvonneBumped")) return;
    if (useItem("Potion")) {
      flag("yvonneStolePotion");
    } else if (useItem("Ether Leaf")) {
      flag("yvonneStoleEther");
    } else if (state.gold >= 12) {
      state.gold -= 12;
      flag("yvonneStoleGold");
    }
    flag("yvonneBumped");
  }

  function returnTealsburgLoot() {
    if (hasFlag("yvonneStolePotion")) addItem("Potion", 1);
    if (hasFlag("yvonneStoleEther")) addItem("Ether Leaf", 1);
    if (hasFlag("yvonneStoleGold")) state.gold += 12;
  }

  function startYvonneYvetteBattle() {
    startBattle("yvette", () => {
      state.completedEvents.yvette_reveal = true;
      returnTealsburgLoot();
      addParty("yvonne");
      addItem("Yvonne's Crossbow", 1);
      flag("yvonneJoined");
      say([
        ["Yvonne", "Fine. Your pack gets its dramatic return, plus one professional apology."],
        ["Yvette", "You kept up better than the cows. That is rare praise in this town."],
        ["Derlin", "I will cherish that compliment by forgetting it immediately."],
        ["Yvonne", "I join the quest. Yvette handles the exit applause."]
      ]);
    });
  }

  function weaponsForMember(member, sourceState = state) {
    if (!member) return [];
    const inventory = sourceState?.inventory || {};
    return Object.entries(weaponCatalog)
      .filter(([name, weapon]) => weapon.users.includes(member.id) && (weapon.starter || gearCopyAvailable(name, "weapon", member.id, sourceState)))
      .map(([name, weapon]) => ({ name, ...weapon }))
      .sort((a, b) => (b.bonus || 0) - (a.bonus || 0));
  }

  function armorForMember(member, sourceState = state) {
    if (!member) return [];
    const inventory = sourceState?.inventory || {};
    return Object.entries(armorCatalog)
      .filter(([name, armor]) => armor.users.includes(member.id) && (armor.starter || gearCopyAvailable(name, "armor", member.id, sourceState)))
      .map(([name, armor]) => ({ name, ...armor }))
      .sort((a, b) => (b.defBonus || 0) - (a.defBonus || 0));
  }

  function accessoriesForMember(member, sourceState = state) {
    if (!member) return [];
    const inventory = sourceState?.inventory || {};
    return Object.entries(accessoryCatalog)
      .filter(([name, accessory]) => accessory.users.includes(member.id) && (accessory.starter || gearCopyAvailable(name, "accessory", member.id, sourceState)))
      .map(([name, accessory]) => ({ name, ...accessory }));
  }

  function catalogForSlot(slot) {
    if (slot === "armor") return armorCatalog;
    if (slot === "accessory") return accessoryCatalog;
    return weaponCatalog;
  }

  function equippedGearCount(itemName, slot, sourceState = state, excludeMemberId = "") {
    return Object.entries(sourceState?.equipment || {}).reduce((count, [memberId, entry]) => {
      if (memberId === excludeMemberId) return count;
      const gear = typeof entry === "string" ? { weapon: entry } : entry;
      return count + (gear?.[slot] === itemName ? 1 : 0);
    }, 0);
  }

  function gearCopyAvailable(itemName, slot, memberId, sourceState = state) {
    const catalogItem = catalogForSlot(slot)[itemName];
    if (!catalogItem) return false;
    if (catalogItem.starter) return true;
    const owned = sourceState?.inventory?.[itemName] || 0;
    const usedElsewhere = equippedGearCount(itemName, slot, sourceState, memberId);
    const currentlyEquipped = sourceState?.equipment?.[memberId]?.[slot] === itemName;
    return currentlyEquipped || owned > usedElsewhere;
  }

  function gearForMember(member, slot, sourceState = state) {
    if (slot === "armor") return armorForMember(member, sourceState);
    if (slot === "accessory") return accessoriesForMember(member, sourceState);
    return weaponsForMember(member, sourceState);
  }

  function defaultGearName(member, slot) {
    if (slot === "armor") return defaultArmorByMember[member.id] || "Travel Clothes";
    if (slot === "accessory") return defaultAccessoryByMember[member.id] || "No Accessory";
    return defaultWeaponByMember[member.id] || "Training Sword";
  }

  function normalizeEquipment(targetState = state) {
    if (!targetState) return {};
    targetState.equipment ||= {};
    const allocated = { weapon: new Map(), armor: new Map(), accessory: new Map() };
    const equipmentMembers = equipmentMembersForState(targetState);
    equipmentMembers.forEach((member) => {
      const existing = targetState.equipment[member.id];
      const entry = typeof existing === "string" ? { weapon: existing } : isPlainObject(existing) ? { ...existing } : {};
      ["weapon", "armor", "accessory"].forEach((slot) => {
        const catalog = catalogForSlot(slot);
        const current = entry[slot];
        const item = catalog[current];
        const alreadyAllocated = allocated[slot].get(current) || 0;
        const owned = item?.starter ? Infinity : (targetState.inventory?.[current] || 0);
        const currentValid = Boolean(item?.users?.includes(member.id) && alreadyAllocated < owned);
        if (!currentValid) {
          const available = Object.entries(catalog)
            .filter(([name, option]) => option.users.includes(member.id) && (option.starter || (targetState.inventory?.[name] || 0) > (allocated[slot].get(name) || 0)))
            .map(([name, option]) => ({ name, ...option }))
            .sort((a, b) => ((b.bonus || b.defBonus || 0) - (a.bonus || a.defBonus || 0)));
          entry[slot] = available[0]?.name || defaultGearName(member, slot);
        }
        allocated[slot].set(entry[slot], (allocated[slot].get(entry[slot]) || 0) + 1);
      });
      targetState.equipment[member.id] = entry;
    });
    const equipmentMemberIds = new Set(equipmentMembers.map((member) => member.id));
    Object.keys(targetState.equipment).forEach((id) => {
      if (!equipmentMemberIds.has(id)) delete targetState.equipment[id];
    });
    return targetState.equipment;
  }

  function equipmentEntry(member, sourceState = state) {
    if (!member) return {};
    normalizeEquipment(sourceState);
    const entry = sourceState?.equipment?.[member.id];
    return isPlainObject(entry) ? entry : {};
  }

  function equippedWeaponName(member) {
    if (!member) return "Training Sword";
    normalizeEquipment();
    return equipmentEntry(member).weapon || defaultWeaponByMember[member.id] || "Training Sword";
  }

  function equippedWeapon(member) {
    const name = equippedWeaponName(member);
    return { name, ...(weaponCatalog[name] || { bonus: 0, text: "Uncatalogued but probably pointy." }) };
  }

  function equippedArmorName(member) {
    if (!member) return "Travel Clothes";
    normalizeEquipment();
    return equipmentEntry(member).armor || defaultArmorByMember[member.id] || "Travel Clothes";
  }

  function equippedArmor(member) {
    const name = equippedArmorName(member);
    return { name, ...(armorCatalog[name] || { defBonus: 0, text: "Uncatalogued but probably protective." }) };
  }

  function equippedAccessoryName(member) {
    if (!member) return "No Accessory";
    normalizeEquipment();
    return equipmentEntry(member).accessory || defaultAccessoryByMember[member.id] || "No Accessory";
  }

  function equippedAccessory(member) {
    const name = equippedAccessoryName(member);
    return { name, ...(accessoryCatalog[name] || { text: "Uncatalogued but probably shiny." }) };
  }

  function weaponBonus(member) {
    const weapon = equippedWeapon(member);
    return weapon.bonus || 0;
  }

  function armorDefenseBonus(member) {
    const armor = equippedArmor(member);
    const accessory = equippedAccessory(member);
    return (armor.defBonus || 0) + (accessory.defBonus || 0);
  }

  function equipmentEffectText(name, slot = equipmentSlotForItem(name)) {
    const item = catalogForSlot(slot)[name];
    if (!item) return "";
    const effects = [];
    if (item.bonus) effects.push(`+${item.bonus} ATK`);
    if (item.defBonus) effects.push(`+${item.defBonus} DEF`);
    if (item.armorPenetration) effects.push("ignores enemy DEF");
    if (item.mpCostReduction) effects.push(`-${item.mpCostReduction} MP cost`);
    if (item.potionBonus) effects.push(`+${item.potionBonus} potion HP`);
    if (item.etherBonus) effects.push(`+${item.etherBonus} ether MP`);
    if (item.enemySkipChance) effects.push(`${Math.round(item.enemySkipChance * 100)}% distraction (boss-resistant)`);
    if (item.encounterRateMultiplier) effects.push(`${Math.round((1 - item.encounterRateMultiplier) * 100)}% fewer encounters`);
    const eligible = (item.users || []).map((id) => partyTemplates[id]?.name || id).join(", ");
    const baseline = slot === "weapon"
      ? "+0 ATK"
      : slot === "armor"
        ? "+0 DEF"
        : "No passive stat effect";
    return `${effects.join("; ") || baseline}. Eligible: ${eligible}.`;
  }

  function skillEstimateText(member, skill) {
    if (!member || !skill) return "";
    if (skill.type === "healAll" || skill.type === "heal") {
      const heal = (skill.heal || 0) + Math.ceil(member.level / (skill.type === "healAll" ? 5 : 4));
      return `Est. ${heal} HP${skill.type === "healAll" ? " to all living allies" : " to one ally"}`;
    }
    if (skill.type === "revive") return `Revives one ally at about ${Math.round((skill.revive || 0.5) * 100)}% HP`;
    if (skill.type === "damage") {
      const weapon = equippedWeapon(member);
      const low = Math.max(1, Math.round((member.atk + 1) * (skill.power || 1) + (skill.flat || 0) + (weapon.bonus || 0)));
      const high = Math.max(low, Math.round((member.atk + 6) * (skill.power || 1) + (skill.flat || 0) + (weapon.bonus || 0)));
      const stun = skill.stunChance ? `; ${Math.round(skill.stunChance * 100)}% base stun before resistance` : "";
      return `Est. ${low}–${high} damage before DEF${weapon.armorPenetration ? " (DEF ignored)" : ""}${stun}`;
    }
    return skill.text || "";
  }

  function partyAccessoryTotal(effect, members = state.party) {
    return (members || []).reduce((sum, member) => sum + (equippedAccessory(member)[effect] || 0), 0);
  }

  function partyAccessoryMax(effect, members = state.party) {
    return Math.max(0, ...(members || []).map((member) => equippedAccessory(member)[effect] || 0));
  }

  function partyAccessoryBestMultiplier(effect, members = state.party) {
    return Math.min(1, ...(members || []).map((member) => equippedAccessory(member)[effect] || 1));
  }

  function skillMpCost(member, skill) {
    const base = Math.max(0, skill?.mp || 0);
    const finalEnemy = activeBattle?.enemies?.find((enemy) => enemy.mechanic === "windFinal" && enemy.hp > 0);
    if (skill?.id === "windSpell" && finalEnemy?.hp <= 55) return 0;
    if (!member) return base;
    const reduction = equippedAccessory(member).mpCostReduction || 0;
    return Math.max(0, base - reduction);
  }

  function equipGear(memberId, slot, itemName) {
    const member = state.party.find((entry) => entry.id === memberId);
    if (!member) return;
    const item = gearForMember(member, slot).find((entry) => entry.name === itemName);
    if (!item || !gearCopyAvailable(itemName, slot, memberId)) {
      menuMessage = `That ${slot || "gear"} is not currently available for that party member.`;
      renderMenuContent();
      return;
    }
    state.equipment ||= {};
    const entry = equipmentEntry(member);
    entry[slot] = item.name;
    state.equipment[member.id] = entry;
    menuMessage = slot === "accessory" && item.name === "No Accessory"
      ? `${member.name} removes their accessory.`
      : `${member.name} equips ${item.name}.`;
    render();
    saveLocal();
  }

  function equipWeapon(memberId, weaponName) {
    equipGear(memberId, "weapon", weaponName);
  }

  function skillKnown(member, skill) {
    if (!member || !skill) return false;
    if ((skill.level || 1) > member.level) return false;
    if (skill.requiresFlag && !hasFlag(skill.requiresFlag)) return false;
    if (skill.requiresItem && !state.inventory[skill.requiresItem]) return false;
    return true;
  }

  function availableSkills(member) {
    return (partySkillLists[member?.id] || [])
      .map((id) => ({ id, ...skillCatalog[id] }))
      .filter((skill) => skillKnown(member, skill));
  }

  function battleSkills(member) {
    return availableSkills(member).filter((skill) => battleSkillTypes.has(skill.type || "damage"));
  }

  function skillCanPay(member, skill) {
    return Boolean(skill && (creatorFlag("infiniteMp") || (member?.mp || 0) >= skillMpCost(member, skill)));
  }

  function defaultSkill(member) {
    const skills = battleSkills(member);
    return skills.find((skill) => skillCanPay(member, skill)) || skills[0] || null;
  }

  function battleItemEntries() {
    return Object.entries(battleItemCatalog)
      .map(([id, item]) => ({ id, ...item }))
      .filter((item) => battleItemTypes.has(item.type))
      .filter((item) => state.inventory[item.inventory] > 0);
  }

  function defaultBattleItem() {
    return battleItemEntries()[0] || null;
  }

  function queuedItemCount(inventoryName, excludeMemberId = "") {
    if (!activeBattle) return 0;
    return Object.entries(activeBattle.choices || {}).reduce((count, [memberId, choice]) => {
      if (memberId === excludeMemberId) return count;
      const item = battleChoiceItem(choice);
      return count + (item?.consume && item.inventory === inventoryName ? 1 : 0);
    }, 0);
  }

  function remainingQueuedItemCount(item, excludeMemberId = "") {
    return Math.max(0, (state.inventory[item.inventory] || 0) - queuedItemCount(item.inventory, excludeMemberId));
  }

  function queuedReserveIds(excludeMemberId = "") {
    return new Set(Object.entries(activeBattle?.choices || {})
      .filter(([memberId, choice]) => memberId !== excludeMemberId && normalizeBattleChoice(choice).type === "switch")
      .map(([, choice]) => normalizeBattleChoice(choice).memberId));
  }

  function enemyByInstance(instanceId) {
    return livingEnemies().find((enemy) => enemy.instanceId === instanceId) || null;
  }

  function selectedAlly(choice, predicate = () => true) {
    return activePartyMembers().find((member) => member.id === choice?.targetId && predicate(member))
      || activePartyMembers().find(predicate)
      || null;
  }

  function bellCooldownRemaining() {
    if (!activeBattle?.bellReadyTurn) return 0;
    return Math.max(0, activeBattle.bellReadyTurn - activeBattle.turn);
  }

  function enemyStunChance(enemy, baseChance) {
    const bossMultiplier = enemy.final ? 0.18 : enemy.boss ? 0.42 : 1;
    const attempts = enemy.stunAttempts || 0;
    return clamp(baseChance * bossMultiplier * Math.pow(0.62, attempts), 0.04, 0.85);
  }

  function attemptEnemyStun(enemy, baseChance) {
    if (!enemy) return { worked: false, chance: 0, immune: false };
    if (activeBattle.turn <= (enemy.stunImmuneThrough || 0)) {
      return { worked: false, chance: 0, immune: true };
    }
    const chance = enemyStunChance(enemy, baseChance);
    enemy.stunAttempts = (enemy.stunAttempts || 0) + 1;
    const worked = Math.random() < chance;
    if (worked) {
      enemy.stunnedTurns = Math.max(1, enemy.stunnedTurns || 0);
      enemy.stunImmuneThrough = activeBattle.turn + 1;
    }
    return { worked, chance, immune: false };
  }

  function normalizeBattleChoice(choice, member) {
    if (!choice || typeof choice === "string") {
      if (choice === "skill") {
        const skill = defaultSkill(member);
        return skill ? { type: "skill", skillId: skill.id } : { type: "skill" };
      }
      if (choice === "item") {
        const item = defaultBattleItem();
        return item ? { type: "item", itemId: item.id } : { type: "item" };
      }
      return { type: choice || "attack" };
    }
    return choice;
  }

  function buildBattleChoice(member, action, options = {}) {
    if (action === "switch") {
      const reserved = queuedReserveIds(member.id);
      const target = reservePartyMembers().find((entry) => entry.id === options.switchId && entry.hp > 0 && !reserved.has(entry.id));
      if (!target) return { error: "No reserve member is ready to switch in." };
      return { choice: { type: "switch", memberId: target.id } };
    }
    if (action === "skill") {
      const skills = battleSkills(member);
      const skill = skills.find((entry) => entry.id === options.skillId) || defaultSkill(member);
      if (!skill) return { error: `${member.name} has no learned skills ready yet.` };
      if (!skillCanPay(member, skill)) return { error: `${member.name} needs ${skillMpCost(member, skill)} MP for ${skill.name}.` };
      return { choice: { type: "skill", skillId: skill.id, targetId: options.targetId || null } };
    }
    if (action === "item") {
      const item = battleItemEntries().find((entry) => entry.id === options.itemId) || defaultBattleItem();
      if (!item) return { error: "No usable battle items. The inventory looks away." };
      if (item.id === "befuddlingBell" && bellCooldownRemaining() > 0) return { error: `Befuddling Bell is recovering for ${bellCooldownRemaining()} more round${bellCooldownRemaining() === 1 ? "" : "s"}.` };
      if (item.consume && remainingQueuedItemCount(item, member.id) <= 0) return { error: `${item.name} is already reserved by another queued action.` };
      return { choice: { type: "item", itemId: item.id, targetId: options.targetId || null } };
    }
    return { choice: { type: action || "attack", targetId: options.targetId || null } };
  }

  function battleChoiceSkill(choice, member) {
    const normalized = normalizeBattleChoice(choice, member);
    if (normalized.type !== "skill") return null;
    const skill = skillCatalog[normalized.skillId];
    return skill ? { id: normalized.skillId, ...skill } : null;
  }

  function battleChoiceItem(choice) {
    const normalized = normalizeBattleChoice(choice);
    if (normalized.type !== "item") return null;
    const item = battleItemCatalog[normalized.itemId];
    return item ? { id: normalized.itemId, ...item } : null;
  }

  function battleTargetMembers() {
    return activeBattle ? activePartyMembers() : state.party;
  }

  function lowestMpMember() {
    const members = battleTargetMembers();
    const candidates = members.filter((member) => member.hp > 0 && member.maxMp > 0);
    if (!candidates.length) return members.find((member) => member.hp > 0) || members[0] || state.party[0];
    return [...candidates].sort((a, b) => a.mp / a.maxMp - b.mp / b.maxMp)[0];
  }

  function fallenPartyMember() {
    return battleTargetMembers().find((member) => member.hp <= 0) || null;
  }

  function lowestLivingHpMember() {
    const candidates = battleTargetMembers().filter((member) => member.hp > 0);
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  function etherRestoreAmount() {
    return 10 + partyAccessoryMax("etherBonus", battleTargetMembers());
  }

  function newlyLearnedSkills(member, newLevel) {
    return (partySkillLists[member?.id] || [])
      .map((id) => ({ id, ...skillCatalog[id] }))
      .filter((skill) => skill.level === newLevel && skillKnown(member, skill));
  }

  function healParty(amount) {
    state.party.forEach((member) => {
      if (amount >= 1) {
        member.hp = member.maxHp;
        member.mp = member.maxMp;
        return;
      }
      member.hp = Math.min(member.maxHp, Math.ceil(member.hp + member.maxHp * amount));
      member.mp = Math.min(member.maxMp, Math.ceil(member.mp + member.maxMp * amount));
    });
  }

  function revivePartyAfterDefeat() {
    state.party.forEach((member) => {
      member.hp = Math.max(1, Math.ceil(member.maxHp * 0.5));
      member.mp = Math.ceil(member.maxMp * 0.5);
    });
  }

  function restoreCreatorVitals() {
    if (!state?.creator?.enabled) return;
    state.party.forEach((member) => {
      if (state.creator.infiniteHp) member.hp = member.maxHp;
      if (state.creator.infiniteMp) member.mp = member.maxMp;
    });
  }

  function area() {
    return areas[state.areaId];
  }

  function currentEvents() {
    return area().events || [];
  }

  function eventKind(event) {
    if (event?.boss && event.disguiseUntilItem && !hasItem(event.disguiseUntilItem)) return "npc";
    if (event?.boss) return "boss";
    return eventSpriteKind[event?.icon] || "marker";
  }

  function eventRequirementsMet(event) {
    if (event.requires && !hasFlag(event.requires)) return false;
    if (event.requiresParty && !hasParty(event.requiresParty)) return false;
    if (event.hideWhenParty && hasParty(event.hideWhenParty)) return false;
    if (event.hideWhenFlag && hasFlag(event.hideWhenFlag)) return false;
    if (event.hideWhenCompleted && state.completedEvents[event.hideWhenCompleted]) return false;
    return true;
  }

  function eventGateLines(event) {
    if (!hasItem(event.gateItem)) return event.gateLines || [["Narrator", `You need ${event.gateItem} before this side quest can move forward.`]];
    if (event.gateFlags?.some((flagName) => !hasFlag(flagName))) {
      return event.gateLines || [["Narrator", "More clues or mechanisms must be found before this challenge is ready."]];
    }
    if (event.gateMinLevel && activePartyMaxLevel() < event.gateMinLevel) {
      return event.gateLines || [["Narrator", `This looks too dangerous. Come back when someone active reaches level ${event.gateMinLevel}.`]];
    }
    return null;
  }

  function eventPersistsAfterComplete(event) {
    return Boolean(event?.persistAfterComplete || (event && !event.boss && eventKind(event) === "npc" && !transientNpcEventIds.has(event.id)));
  }

  function eventShouldRender(event) {
    if (!eventRequirementsMet(event)) return false;
    if (state.completedEvents[event.id] && !eventPersistsAfterComplete(event)) return false;
    return true;
  }

  function eventTile(event) {
    const completedPosition = state?.completedEvents?.[event?.id] && event?.completedPosition;
    const [x, y] = completedPosition || [event?.x, event?.y];
    return { x, y };
  }

  function visibleEventAt(x, y) {
    return currentEvents().find((event) => {
      if (!eventCoversTile(event, x, y)) return false;
      return eventShouldRender(event);
    });
  }

  function tileHasDoorEvent(x, y) {
    return currentEvents().some((event) => {
      return event.hidden && typeof event.action === "function" && eventCoversTile(event, x, y);
    });
  }

  function adjacentEventAt(x, y) {
    return visibleEventAt(x, y);
  }

  function eventCoversTile(event, x, y) {
    if (eventKind(event) === "npc" && npcCanWander(event)) {
      const motion = npcMotion(event);
      if (motion.occupiedTiles?.some((tile) => tile.x === x && tile.y === y)) return true;
      return motion.tileX === x && motion.tileY === y;
    }
    const tile = eventTile(event);
    return tile.x === x && tile.y === y;
  }

  function setScreen(screen) {
    if (screen !== "game") setFocusMode(false, false);
    $("title-screen").classList.toggle("is-hidden", screen !== "title");
    $("game-screen").classList.toggle("is-hidden", screen !== "game");
    updateFocusButton();
    updateMusicForContext();
  }

  function applyGameMetadata() {
    const shell = gameConfig.shell || {};
    document.title = gameConfig.title;
    const titleScreen = $("title-screen");
    if (titleScreen) titleScreen.setAttribute("aria-label", `${gameConfig.title} title screen`);
    const gameScreen = $("game-screen");
    if (gameScreen) gameScreen.setAttribute("aria-label", `${gameConfig.title} game screen`);
    const favicon = $("game-favicon") || document.querySelector('link[rel~="icon"]');
    if (favicon && shell.favicon) {
      favicon.href = shell.favicon;
      favicon.type = shell.faviconType || "image/png";
    }
    const setArtworkVariable = (name, src) => {
      if (!src) return;
      const absoluteSrc = new URL(String(src), document.baseURI).href;
      const escaped = absoluteSrc.replace(/["\\\n\r]/g, (char) => `\\${char}`);
      document.documentElement.style.setProperty(name, `url("${escaped}")`);
    };
    setArtworkVariable("--game-title-art", shell.titleArt);
    setArtworkVariable("--game-title-art-mobile", shell.titleArtMobile || shell.titleArt);
    setArtworkVariable("--game-ending-art", shell.endingArt);
    const titleCopy = document.querySelector(".title-copy");
    if (titleCopy) {
      const kicker = titleCopy.querySelector(".kicker");
      const heading = titleCopy.querySelector("h1");
      const tagline = titleCopy.querySelector(".tagline");
      if (kicker) kicker.textContent = gameConfig.rolePlayingLabel;
      if (heading) heading.textContent = gameConfig.title;
      if (tagline) tagline.textContent = gameConfig.tagline;
      const wordmark = $("title-wordmark");
      if (wordmark) {
        if (shell.titleWordmark) {
          wordmark.src = shell.titleWordmark;
          wordmark.classList.remove("is-hidden");
          heading?.classList.add("sr-only");
        } else {
          wordmark.removeAttribute("src");
          wordmark.classList.add("is-hidden");
          heading?.classList.remove("sr-only");
        }
      }
      const trilogyStrip = $("trilogy-strip");
      if (trilogyStrip && Array.isArray(shell.titleCovers)) {
        trilogyStrip.replaceChildren(...shell.titleCovers.map((cover) => {
          const image = document.createElement("img");
          image.src = cover.src;
          image.alt = cover.alt || "Trilogy cover art";
          image.width = cover.width || 240;
          image.height = cover.height || 360;
          image.decoding = "async";
          return image;
        }));
      }
    }
    const ending = shell.ending || {};
    if ($("ending-kicker") && ending.kicker) $("ending-kicker").textContent = ending.kicker;
    if ($("ending-title") && ending.title) $("ending-title").textContent = ending.title;
    if ($("ending-copy") && ending.copy) $("ending-copy").textContent = ending.copy;
    const guideModal = $("guide-modal");
    if (guideModal) guideModal.setAttribute("aria-label", `${gameConfig.title} guide`);
    const guideHeading = document.querySelector("#guide-modal h2");
    if (guideHeading) guideHeading.textContent = gameConfig.guideTitle;
  }

  function isFocusMode() {
    return Boolean($("game-screen")?.classList.contains("is-focus-mode"));
  }

  function setFocusMode(enabled, useNativeFullscreen = false) {
    const screen = $("game-screen");
    if (!screen) return;
    screen.classList.toggle("is-focus-mode", enabled);
    updateFocusButton();
    const fullscreenTarget = $("app") || screen;
    if (useNativeFullscreen && enabled && fullscreenTarget.requestFullscreen) {
      fullscreenTarget.requestFullscreen().catch(() => {});
    } else if (useNativeFullscreen && !enabled && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    if (!enabled && state) render();
    markRenderDirty("map");
    setTimeout(renderVisibleSurfaces, 30);
  }

  function toggleFocusMode() {
    setFocusMode(!isFocusMode(), true);
  }

  function updateFocusButton() {
    const button = $("focus-toggle");
    if (!button) return;
    const focused = isFocusMode();
    button.textContent = focused ? "Show UI" : "Full Screen";
    button.setAttribute("aria-pressed", focused ? "true" : "false");
  }

  function saveKeyForState(targetState = state) {
    return targetState?.saveSlot === "creator" ? CREATOR_SAVE_KEY : SAVE_KEY;
  }

  function currentPlayTimeMs(now = Date.now()) {
    const saved = numberInRange(state?.playTimeMs, 0, SAVE_LIMITS.maxTimestamp, 0);
    const session = activePlayStartedAt ? Math.max(0, now - activePlayStartedAt) : 0;
    return clamp(saved + session, 0, SAVE_LIMITS.maxTimestamp);
  }

  function commitActivePlayTime(now = Date.now()) {
    if (!state) {
      activePlayStartedAt = 0;
      return 0;
    }
    state.playTimeMs = currentPlayTimeMs(now);
    activePlayStartedAt = document.hidden ? 0 : now;
    return state.playTimeMs;
  }

  function resumeActivePlayTime() {
    if (state && !document.hidden && !activePlayStartedAt) activePlayStartedAt = Date.now();
  }

  function savedTimestamp(saveKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(saveKey) || "null");
      return Number.isFinite(Number(parsed?.updatedAt)) ? Number(parsed.updatedAt) : null;
    } catch {
      return null;
    }
  }

  function confirmSlotReplacement(saveKey, label) {
    if (!localStorage.getItem(saveKey)) return true;
    const timestamp = savedTimestamp(saveKey);
    const savedWhen = timestamp ? ` from ${new Date(timestamp).toLocaleString()}` : "";
    return window.confirm(`${label} will replace the existing save${savedWhen}. Continue?`);
  }

  function resetRuntimeForLoadedState() {
    clearAutoBattleTimer();
    clearHeldMove();
    activeBattle = null;
    activeShopId = null;
    activeInnOffer = null;
    activeNpcDialogueLock = null;
    npcDialogueReleaseLocks.clear();
    mapEffect = null;
    dialogueQueue = [];
    dialogueDone = null;
    if (dialogueTypingTimer) clearInterval(dialogueTypingTimer);
    dialogueTypingTimer = null;
    dialogueFullText = "";
    cutsceneActive = false;
    cutsceneDone = null;
    if (activeCutsceneTimer) clearTimeout(activeCutsceneTimer);
    activeCutsceneTimer = null;
    if (screenTransitionTimer) clearTimeout(screenTransitionTimer);
    screenTransitionTimer = null;
    if (equipmentOfferTimer) clearTimeout(equipmentOfferTimer);
    equipmentOfferTimer = null;
    pendingEquipmentOffers.length = 0;
    itemModalResolve = null;
    itemModalEquipAction = null;
    ["battle", "dialogue", "menu-modal", "creator-modal", "guide-modal", "item-modal", "coach-modal", "ending-scene", "cutscene"].forEach((id) => {
      $(id)?.classList.add("is-hidden");
      if (managedDialogIds.includes(id)) $(id)?.setAttribute("aria-hidden", "true");
    });
    coachingQueue.length = 0;
    activeManagedDialogId = "";
    dialogReturnFocus = null;
    const screenEffect = $("screen-effect");
    if (screenEffect) screenEffect.className = "screen-effect is-hidden";
    refreshDialogInertness();
    activePlayStartedAt = document.hidden ? 0 : Date.now();
    lastMoveInputAt = 0;
    lastBattleStep = Number.NEGATIVE_INFINITY;
    lastBlockedHint = { key: "", at: 0 };
  }

  function initializeLoadedGame(message) {
    resetRuntimeForLoadedState();
    lastBattleStep = Number.isFinite(state?.lastBattleStep) ? state.lastBattleStep : Number.NEGATIVE_INFINITY;
    applyPlayerSpeedSettings();
    setScreen("game");
    loadAreaAssets();
    startMusicIfEnabled();
    render();
    if (resumePendingTransition()) return;
    if (message) say([["System", message]]);
  }

  function startNewGame(options = {}) {
    const creator = Boolean(options.creator);
    const slotKey = creator ? CREATOR_SAVE_KEY : SAVE_KEY;
    if (options.confirmOverwrite !== false && !confirmSlotReplacement(slotKey, creator ? "New Creator game" : "New Game")) return false;
    const titleMusicMuted = !audioState.enabled;
    state = freshState();
    state.saveSlot = creator ? "creator" : "adventure";
    state.creator.enabled = creator;
    state.settings = sanitizeSettings({ ...state.settings, musicMuted: titleMusicMuted });
    initializeLoadedGame();
    if (!creator) triggerEvent(visibleEventAt(state.x, state.y));
    saveLocal(slotKey);
    if (!creator) coach("movement");
    return true;
  }

  function continueGame() {
    const loaded = loadLocal();
    if (!loaded) {
      startNewGame();
      return;
    }
    state = loaded;
    initializeLoadedGame("Browser save loaded. Your quest resumes from " + area().name + ".");
  }

  function saveLocal(saveKey = saveKeyForState()) {
    const activeSlotKey = saveKeyForState();
    if (saveKey !== activeSlotKey) saveKey = activeSlotKey;
    syncRosterFromParty();
    state.lastBattleStep = Number.isFinite(lastBattleStep) ? lastBattleStep : null;
    const now = Date.now();
    commitActivePlayTime(now);
    state.updatedAt = now;
    localStorage.setItem(saveKey, JSON.stringify(state));
    lastSaveMessage = `Saved ${saveKey === CREATOR_SAVE_KEY ? "creator" : "adventure"} slot at ${new Date(state.updatedAt).toLocaleTimeString()}.`;
    const saveStatus = $("save-status");
    if (saveStatus) saveStatus.textContent = `Saved ${new Date(state.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const mobileSaveStatus = $("mobile-save-status");
    if (mobileSaveStatus) mobileSaveStatus.textContent = `Saved ${new Date(state.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (visibleElement("menu-modal")) renderMenuContent();
  }

  function saveManualCheckpoint() {
    if (!state) return false;
    state.checkpoint = sanitizeCheckpoint(
      { areaId: state.areaId, x: state.x, y: state.y },
      state.areaId,
      state.x,
      state.y
    );
    saveLocal();
    return true;
  }

  function loadLocal(saveKey = SAVE_KEY) {
    try {
      const raw = localStorage.getItem(saveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeState(parsed, { saveSlot: saveKey === CREATOR_SAVE_KEY ? "creator" : "adventure" });
    } catch {
      return null;
    }
  }

  function visibleElement(id) {
    const el = $(id);
    return Boolean(el && !el.classList.contains("is-hidden"));
  }

  function sidePanelVisible() {
    const panel = document.querySelector(".side-panel");
    if (!panel || !visibleElement("game-screen") || isFocusMode()) return false;
    return getComputedStyle(panel).display !== "none";
  }

  function markRenderDirty(...surfaces) {
    const keys = surfaces.length ? surfaces : Object.keys(renderDirty);
    keys.forEach((key) => {
      if (key in renderDirty) renderDirty[key] = true;
    });
    requestRenderLoop();
  }

  function renderVisibleSurfaces() {
    if (state && visibleElement("game-screen")) {
      if (renderDirty.map) {
        renderMap();
        renderDirty.map = false;
      }
      if (renderDirty.world && visibleElement("menu-modal") && activeMenuTab === "map") {
        renderWorldMap("menu-world-canvas");
        renderDirty.world = false;
      }
      if (renderDirty.battle && activeBattle && visibleElement("battle")) {
        drawBattleStage();
        renderDirty.battle = false;
      }
    }
    if (renderDirty.guide && visibleElement("guide-modal")) {
      drawGuideImages();
      renderDirty.guide = false;
    }
  }

  function exportSave() {
    if (!state) return;
    const now = Date.now();
    commitActivePlayTime(now);
    state.updatedAt = now;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gameConfig.exportFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importSave(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = normalizeState(parsed, { strictCoordinates: true });
        const creatorImport = imported.saveSlot === "creator";
        const slotKey = creatorImport ? CREATOR_SAVE_KEY : SAVE_KEY;
        if (!confirmSlotReplacement(slotKey, `Importing this ${creatorImport ? "Creator" : "adventure"} save`)) return;
        state = imported;
        initializeLoadedGame("External save loaded. The matching browser slot was updated too.");
        saveLocal(slotKey);
      } catch (error) {
        say([["System", error.message || "Could not load that save file."]]);
      }
    };
    reader.readAsText(file);
  }

  function render() {
    if (!state) return;
    normalizeEquipment();
    restoreCreatorVitals();
    const a = area();
    $("location-name").textContent = a.name;
    $("gold").textContent = state.gold;
    if ($("steps")) $("steps").textContent = state.steps;
    $("creator-badge")?.classList.toggle("is-hidden", state.saveSlot !== "creator");
    const bannerArt = areaBannerArt(state.areaId, a);
    $("scene-banner").style.backgroundImage = bannerArt
      ? `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.44)), url("${bannerArt}")`
      : "linear-gradient(180deg, rgba(20,35,58,0.72), rgba(2,4,10,0.94))";
    renderFieldDock(a);
    markRenderDirty("map", "world", "battle");
    if (sidePanelVisible()) {
      renderParty();
      renderInventory();
      renderQuest();
    }
    if (visibleElement("menu-modal")) renderMenuContent();
    if (!$("creator-modal")?.classList.contains("is-hidden")) renderCreatorContent();
    updateMusicForContext();
    updateMusicButtons();
    renderVisibleSurfaces();
  }

  function areaBannerArt(areaId = state?.areaId || "", currentArea = areas[areaId]) {
    const directory = String(gameConfig.areaBannerDirectory || "").replace(/\/$/, "");
    if (directory) return `${directory}/${areaId}.jpg`;
    const routeKey = routeGuideImageKeys[areaId] || routeGuideImageKeys[worldAreaId(areaId)];
    return (routeKey && assets[routeKey]) || currentArea?.art || assets.vista || "";
  }

  function renderFieldDock(currentArea = area()) {
    const location = $("dock-location");
    const quest = $("dock-quest");
    if (location) location.textContent = currentArea.name;
    if (quest) quest.textContent = questText();
  }

  function prepareHiDPICanvas(canvas) {
    if (canvas.id === "map-canvas") syncMapCanvasLogicalSize(canvas);
    if (!canvas.dataset.logicalWidth) {
      canvas.dataset.logicalWidth = String(Number(canvas.getAttribute("width")) || canvas.width || 1);
      canvas.dataset.logicalHeight = String(Number(canvas.getAttribute("height")) || canvas.height || 1);
    }
    const width = Number(canvas.dataset.logicalWidth);
    const height = Number(canvas.dataset.logicalHeight);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height, dpr };
  }

  function syncMapCanvasLogicalSize(canvas) {
    const phoneLayout = window.matchMedia?.("(max-width: 560px)")?.matches;
    const width = phoneLayout ? 480 : 960;
    const viewportWidth = Math.max(1, Number(window.visualViewport?.width) || window.innerWidth || width);
    const viewportHeight = Math.max(1, Number(window.visualViewport?.height) || window.innerHeight || 816);
    const height = phoneLayout ? Math.max(816, Math.round(width * viewportHeight / viewportWidth)) : 704;
    canvas.dataset.logicalWidth = String(width);
    canvas.dataset.logicalHeight = String(height);
  }

  function logicalCanvasSize(canvas) {
    return {
      width: Number(canvas?.dataset?.logicalWidth) || Number(canvas?.getAttribute?.("width")) || canvas?.width || 1,
      height: Number(canvas?.dataset?.logicalHeight) || Number(canvas?.getAttribute?.("height")) || canvas?.height || 1
    };
  }

  function renderMap() {
    const canvas = $("map-canvas");
    if (!canvas || !state) return;
    const { ctx, width, height } = prepareHiDPICanvas(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    const rows = area().map;
    const camera = mapCamera(canvas);
    const startX = Math.max(0, Math.floor(camera.x / TILE) - 1);
    const startY = Math.max(0, Math.floor(camera.y / TILE) - 1);
    const endX = Math.min(mapWidth(), Math.ceil((camera.x + width) / TILE) + 1);
    const endY = Math.min(mapHeight(), Math.ceil((camera.y + height) / TILE) + 1);
    ctx.fillStyle = "#020203";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    for (let y = startY; y < endY; y += 1) {
      const row = rows[y] || "";
      for (let x = startX; x < endX; x += 1) {
        const char = row[x] || ".";
        const info = tileInfo[char] || tileInfo[area().theme === "floor" ? "_" : "."];
        drawTile(ctx, info[0], x * TILE, y * TILE, TILE, x, y, char, rows);
      }
    }
    drawTileOverlays(ctx, rows);
    drawRoomEdgeCues(ctx, rows);
    drawAreaDecor(ctx);
    drawSceneActors(ctx);
    drawMapEffects(ctx);
    ctx.restore();
    renderMiniMap();
  }

  function renderMiniMap() {
    const canvas = $("mini-map-canvas");
    if (!canvas || !state) return;
    const { ctx, width: w, height: h } = prepareHiDPICanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    fillRoundRect(ctx, 0, 0, w, h, 12, "rgba(7, 10, 13, 0.9)", "rgba(255, 221, 154, 0.34)");
    ctx.fillStyle = "rgba(255, 233, 122, 0.92)";
    ctx.font = "bold 12px Trebuchet MS, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(miniMapTitle(), 10, 8);

    const group = areaMiniMapGroupFor(state.areaId);
    if (group) drawMiniMapAreaAtlas(ctx, group, 8, 24, w - 16, h - 32);
    else drawMiniMapLocalBoard(ctx, 10, 26, w - 20, h - 36);
    ctx.restore();
    const objectiveText = localObjectiveDirection();
    const direction = $("objective-direction");
    if (direction) direction.textContent = objectiveText;
    const textAlternative = $("map-text-alternative");
    if (textAlternative) textAlternative.textContent = localMapTextAlternative(objectiveText);
  }

  function localMapTextAlternative(objectiveText = localObjectiveDirection()) {
    const currentArea = area();
    const exits = (currentArea.exits || []).map((exit) => `${exit.edge} to ${areas[exit.to]?.name || exit.to}`);
    const nearby = currentEvents().filter((event) => {
      if (event.hidden || !eventShouldRender(event)) return false;
      const tile = eventTile(event);
      return Math.abs(tile.x - state.x) + Math.abs(tile.y - state.y) <= 2;
    }).map((event) => {
      const tile = eventTile(event);
      const dx = tile.x - state.x;
      const dy = tile.y - state.y;
      const direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : dy > 0 ? "south" : "here");
      const kind = event.boss ? "boss" : eventKind(event);
      return `${kind} ${direction}`;
    });
    return `${currentArea.name}. ${objectiveText}. ${exits.length ? `Exits: ${exits.join(", ")}.` : "No edge exits."} ${nearby.length ? `Nearby interactions: ${nearby.join(", ")}.` : "No nearby interactions."}`;
  }

  function activeObjectiveEventIds() {
    switch (state.areaId) {
      case "darhynCastle":
        if (!hasFlag("dreamDarhynDefeated")) return ["dream_darhyn"];
        return hasFlag("waterSpellDream") ? [] : ["water_orb"];
      case "krendon":
        if (!hasFlag("metZelin")) return ["zelin"];
        return hasFlag("milkedBetsy") ? [] : ["krendon_stable_door"];
      case "krendonStable":
        return hasFlag("milkedBetsy") ? [] : ["betsy"];
      case "krendonShop":
      case "krendonRoad":
      case "tealsburgShop":
        return [];
      case "oldMill":
        if (hasFlag("millSaved")) return [];
        if (!hasFlag("millQuest")) return ["mill_martha"];
        return hasItem("Rune Sword") ? ["dust_knight"] : [];
      case "hawkMountains":
        return hasParty("dalin") ? [] : ["dalin_join"];
      case "hawkSwitchback":
        return hasFlag("switchbackSurveyed") ? [] : ["hawk_switchback_view"];
      case "skyShrine":
        if (hasFlag("skyShrineSolved")) return [];
        if (!hasFlag("starWestObserved") || !hasFlag("starEastObserved")) {
          return [
            !hasFlag("starWestObserved") && "star_cache_west",
            !hasFlag("starEastObserved") && "star_cache_east"
          ].filter(Boolean);
        }
        return ["star_shrine_voice"];
      case "merfolkShoals":
        return hasFlag("tustorRaised") ? [] : ["tustor_grave"];
      case "tideCavern":
        if (hasFlag("tideRegentDefeated")) return [];
        if (!hasFlag("tideQuest")) return ["tide_priest"];
        if (!hasFlag("tideWestSluice") || !hasFlag("tideEastSluice")) {
          return [
            !hasFlag("tideWestSluice") && "tide_west_sluice",
            !hasFlag("tideEastSluice") && "tide_east_sluice"
          ].filter(Boolean);
        }
        return ["river_slime_regent"];
      case "grassland":
        return hasFlag("capturedByLithar") ? [] : ["lithar_ambush"];
      case "moonMarsh":
        if (hasFlag("marshBookRecovered")) return [];
        if (!hasFlag("marshQuest")) return ["marsh_jester"];
        if (!hasFlag("marshBlueReeds") || !hasFlag("marshSilverReeds")) {
          return [
            !hasFlag("marshBlueReeds") && "marsh_cache_west",
            !hasFlag("marshSilverReeds") && "marsh_cache_east"
          ].filter(Boolean);
        }
        return ["marsh_wisp"];
      case "marhynCastle":
        return hasParty("derlin") ? [] : ["lower_cells_to_halls"];
      case "marhynHalls":
        if (!hasFlag("yanFreed")) return ["halls_to_west_cells"];
        if (!hasFlag("marhynKeyring")) return ["halls_to_armory"];
        if (!hasItem("Derlin Cell Key")) return ["halls_to_vault"];
        return hasParty("derlin") ? [] : ["halls_to_derlin_tower"];
      case "marhynWestCells":
        return hasFlag("yanFreed") ? [] : ["yan_escape"];
      case "marhynArmory":
        if (!hasFlag("yanFreed")) return ["armory_to_halls"];
        return hasFlag("marhynKeyring") ? ["armory_to_halls"] : ["marhyn_keyring"];
      case "marhynVault":
        if (!hasFlag("yanFreed") || !hasFlag("marhynKeyring")) return ["vault_to_halls"];
        return hasItem("Derlin Cell Key") ? ["vault_to_halls"] : ["derlin_cell_key"];
      case "marhynDerlinTower":
        if (!hasFlag("yanFreed") || !hasItem("Derlin Cell Key")) return [];
        return hasParty("derlin") ? [] : ["derlin_cell_door"];
      case "forest":
        return hasFlag("yanVanished") ? [] : ["forest_yan_missing"];
      case "deepForest":
        if (hasFlag("runeSword")) return [];
        return state.completedEvents.deep_forest_marker ? ["eagle_rune_sword"] : ["deep_forest_marker"];
      case "freeton":
        if (!hasFlag("corizazLairRevealed")) return ["freeton_townsgirl"];
        return hasFlag("lightSword") ? [] : ["corizaz_entrance"];
      case "corizazLair":
        return hasFlag("lightSword") ? [] : ["corizaz_sleeping"];
      case "kingsHighway":
        if (!hasFlag("yanReturned")) return ["yan_returns"];
        return hasFlag("escapedFear") ? [] : ["fear_creature"];
      case "tealsburg":
        if (!hasFlag("metKing")) return ["king_garkin"];
        if (hasFlag("yvonneJoined")) return [];
        if (!hasFlag("yvonneBumped")) return ["yvonne_bump"];
        if (!hasFlag("yvonneDecoyChased")) return ["yvonne_decoy"];
        return ["yvette_reveal"];
      case "marketMaze":
        if (hasFlag("marketLedgerRecovered")) return [];
        return hasFlag("marketQuest") ? ["paper_mimic"] : ["market_scribe"];
      case "northernPath":
        return hasFlag("reachedBreshenPath") ? [] : ["northern_scout"];
      case "breshen":
        if (!hasFlag("valenaJoined")) return ["valena"];
        return hasFlag("hanoDefeated") ? [] : ["hano"];
      case "savannah":
        return hasFlag("readyForRathskeller") ? [] : ["savannah_camp"];
      case "glassCaves":
        if (hasFlag("glassCavesCalmed")) return [];
        if (!hasItem("Scribe Pass")) return [];
        if (!hasFlag("glassQuest")) return ["glass_miner"];
        if (!hasFlag("glassLowResonator") || !hasFlag("glassHighResonator")) {
          return [
            !hasFlag("glassLowResonator") && "glass_cache_west",
            !hasFlag("glassHighResonator") && "glass_cache_south"
          ].filter(Boolean);
        }
        return ["crystal_mole"];
      case "rathskellerApproach":
        return state.completedEvents.approach_camp ? [] : ["approach_camp"];
      case "rathskeller":
        if (!hasFlag("windSpell")) return ["ten_doors"];
        if (!hasFlag("litharDone")) return ["lithar_final"];
        return hasFlag("gameComplete") ? [] : ["darhyn_final"];
      default:
        return null;
    }
  }

  function objectiveEventReady(event) {
    if (!event || !eventShouldRender(event) || state.completedEvents[event.id]) return false;
    return !eventGateLines(event);
  }

  function objectiveTargetTile(event) {
    if (eventKind(event) === "npc" && npcCanWander(event)) {
      const motion = npcMotion(event);
      if (Number.isInteger(motion?.tileX) && Number.isInteger(motion?.tileY)) {
        return { x: motion.tileX, y: motion.tileY };
      }
    }
    return eventTile(event);
  }

  function localRouteToEvent(event) {
    const target = objectiveTargetTile(event);
    const blockers = currentEvents()
      .filter((candidate) => candidate !== event && eventShouldRender(candidate))
      .map((candidate, index) => {
        const occupied = eventKind(candidate) === "npc" && npcCanWander(candidate)
          ? npcMotion(candidate).occupiedTiles || [eventTile(candidate)]
          : [eventTile(candidate)];
        return {
          bit: 1 << index,
          clearable: Boolean(candidate.once && !candidate.boss && !candidate.action && !eventPersistsAfterComplete(candidate) && !eventGateLines(candidate)),
          tiles: occupied.map((tile) => ({ x: tile.x, y: tile.y }))
        };
      });
    const clearAdjacentEvents = (x, y, initialMask) => {
      let mask = initialMask;
      let changed = true;
      while (changed) {
        changed = false;
        blockers.forEach((blocker) => {
          if (!blocker.clearable || (mask & blocker.bit)) return;
          if (!blocker.tiles.some((tile) => Math.abs(tile.x - x) + Math.abs(tile.y - y) <= 1)) return;
          mask |= blocker.bit;
          changed = true;
        });
      }
      return mask;
    };
    const eventTileBlocked = (x, y, clearedMask) => blockers.some((blocker) => {
      if (blocker.clearable && (clearedMask & blocker.bit)) return false;
      return blocker.tiles.some((tile) => tile.x === x && tile.y === y);
    });
    const startMask = clearAdjacentEvents(state.x, state.y, 0);
    const start = { x: state.x, y: state.y, distance: 0, firstDx: 0, firstDy: 0, clearedMask: startMask };
    const seen = new Set([`${start.x},${start.y},${startMask}`]);
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (Math.abs(current.x - target.x) + Math.abs(current.y - target.y) <= 1) {
        return {
          distance: current.distance,
          firstDx: current.firstDx,
          firstDy: current.firstDy
        };
      }
      Object.values(DIRS).forEach(([dx, dy]) => {
        const currentChar = area().map[current.y]?.[current.x];
        if (waterBridgeAt(area().map, current.x, current.y, currentChar) && !bridgeExitAllowed(area().map, current.x, current.y, dx, dy)) return;
        const nextX = current.x + dx;
        const nextY = current.y + dy;
        if (!tilePassable(nextX, nextY, dx, dy)) return;
        if (eventTileBlocked(nextX, nextY, current.clearedMask)) return;
        const clearedMask = clearAdjacentEvents(nextX, nextY, current.clearedMask);
        const key = `${nextX},${nextY},${clearedMask}`;
        if (seen.has(key)) return;
        seen.add(key);
        queue.push({
          x: nextX,
          y: nextY,
          distance: current.distance + 1,
          firstDx: current.distance ? current.firstDx : dx,
          firstDy: current.distance ? current.firstDy : dy,
          clearedMask
        });
      });
    }
    return null;
  }

  function genericObjectiveEvents() {
    const events = currentEvents().filter((event) => objectiveEventReady(event) && !event.hidden && eventKind(event) !== "chest");
    return [
      ...events.filter((event) => (event.icon === "!" || event.icon === "?") && event.once),
      ...events.filter((event) => event.boss),
      ...events.filter((event) => event.once && eventKind(event) === "npc")
    ];
  }

  function localObjectiveResult() {
    if (trackedSideQuestAwayFromCurrentArea()) return null;
    const activeIds = activeObjectiveEventIds();
    const candidates = activeIds === null
      ? genericObjectiveEvents()
      : activeIds.map((id) => currentEvents().find((event) => event.id === id)).filter(objectiveEventReady);
    return candidates
      .map((event, order) => ({ event, route: localRouteToEvent(event), order }))
      .filter((entry) => entry.route)
      .sort((left, right) => left.route.distance - right.route.distance || left.order - right.order)[0]
      || null;
  }

  function localObjectiveTarget() {
    return localObjectiveResult()?.event || null;
  }

  function localObjectiveDirection() {
    const objective = localObjectiveResult();
    if (!objective) {
      const tracked = trackedSideQuestAwayFromCurrentArea();
      return tracked ? `${tracked.name} is elsewhere · follow a labeled exit` : "Follow a labeled exit";
    }
    const { distance, firstDx, firstDy } = objective.route;
    if (distance === 0) return "Objective beside you";
    const direction = firstDx < 0 ? "west" : firstDx > 0 ? "east" : firstDy < 0 ? "north" : "south";
    return `Objective ${direction} · ${distance} step${distance === 1 ? "" : "s"}`;
  }

  function trackedSideQuestAwayFromCurrentArea() {
    syncQuestJournal();
    const tracked = sideQuestById.get(state.questJournal?.trackedId);
    if (!tracked || sideQuestStatus(tracked) === "completed" || state.areaId === tracked.areaId) return null;
    return sideQuestText() ? null : tracked;
  }

  function miniMapTitle() {
    const group = areaMiniMapGroupFor(state.areaId);
    if (group) return group.title;
    return "Area map";
  }

  function miniMapAreaVisited(id) {
    return id === state.areaId || id === worldAreaId(state.areaId) || Boolean(state.completedEvents[`visit_${id}`]);
  }

  function drawMiniMapAreaAtlas(ctx, group, x, y, w, h) {
    const allBoardEntries = Object.entries(group.boards || {});
    const boardEntries = miniMapVisibleBoardEntries(group, state.areaId);
    const normalizedEntries = boardEntries.length < allBoardEntries.length ? normalizeMiniMapBoardEntries(boardEntries) : boardEntries;
    const points = Object.fromEntries(normalizedEntries.map(([id, node]) => [id, {
      ...node,
      id,
      px: x + node.x * w,
      py: y + node.y * h
    }]));
    const boardW = group.boardWidth || Math.min(52, Math.max(34, w * 0.27));
    const boardH = group.boardHeight || Math.min(38, Math.max(26, h * 0.27));
    const drawn = new Set();
    ctx.save();
    Object.values(points).forEach((node) => {
      (node.links || []).forEach((targetId) => {
        const target = points[targetId];
        if (!target) return;
        const key = [node.id, targetId].sort().join(":");
        if (drawn.has(key)) return;
        drawn.add(key);
        const known = miniMapAreaVisited(node.id) || miniMapAreaVisited(targetId);
        ctx.strokeStyle = known ? "rgba(126, 215, 255, 0.6)" : "rgba(255, 221, 154, 0.14)";
        ctx.lineWidth = known ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(node.px, node.py);
        ctx.lineTo(target.px, target.py);
        ctx.stroke();
      });
    });
    Object.values(points).forEach((node) => {
      const active = node.id === state.areaId;
      const visited = miniMapAreaVisited(node.id);
      const bx = clamp(node.px - boardW / 2, x, x + w - boardW);
      const by = clamp(node.py - boardH / 2, y, y + h - boardH);
      drawMiniMapBoard(ctx, node.id, bx, by, boardW, boardH, {
        active,
        dim: !active && !visited,
        showEvents: active || visited,
        showPlayer: active,
        minCell: 1
      });
    });
    ctx.restore();
  }

  function miniMapVisibleBoardEntries(group, activeAreaId = state?.areaId || "") {
    const boards = group?.boards || {};
    const entries = Object.entries(boards);
    if (entries.length <= MINI_MAP_MAX_LOCAL_BOARDS) return entries;
    const activeId = miniMapActiveBoardId(group, activeAreaId);
    if (!activeId) return entries.slice(0, MINI_MAP_MAX_LOCAL_BOARDS);
    const selected = new Set([activeId]);
    addMiniMapLinkedBoards(selected, group, activeId);
    if (selected.size < MINI_MAP_MAX_LOCAL_BOARDS) {
      [...selected].forEach((id) => {
        if (id !== activeId) addMiniMapLinkedBoards(selected, group, id);
      });
    }
    return [...selected]
      .filter((id) => boards[id])
      .slice(0, MINI_MAP_MAX_LOCAL_BOARDS)
      .map((id) => [id, boards[id]]);
  }

  function miniMapActiveBoardId(group, activeAreaId = state?.areaId || "") {
    const boards = group?.boards || {};
    const worldId = worldAreaId(activeAreaId);
    if (boards[activeAreaId]) return activeAreaId;
    if (boards[worldId]) return worldId;
    return Object.keys(boards)[0] || "";
  }

  function addMiniMapLinkedBoards(selected, group, sourceId) {
    const boards = group?.boards || {};
    const source = boards[sourceId];
    if (!source) return;
    (source.links || [])
      .filter((id) => boards[id])
      .sort((a, b) => miniMapLinkDistance(source, boards[a]) - miniMapLinkDistance(source, boards[b]))
      .some((id) => {
        selected.add(id);
        return selected.size >= MINI_MAP_MAX_LOCAL_BOARDS;
      });
  }

  function miniMapLinkDistance(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function normalizeMiniMapBoardEntries(entries) {
    if (entries.length <= 1) return entries.map(([id, node]) => [id, { ...node, x: 0.5, y: 0.5 }]);
    const xs = entries.map(([, node]) => node.x || 0);
    const ys = entries.map(([, node]) => node.y || 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const scale = 1 - MINI_MAP_LOCAL_MARGIN * 2;
    return entries.map(([id, node]) => [id, {
      ...node,
      x: spanX < 0.001 ? 0.5 : MINI_MAP_LOCAL_MARGIN + ((node.x - minX) / spanX) * scale,
      y: spanY < 0.001 ? 0.5 : MINI_MAP_LOCAL_MARGIN + ((node.y - minY) / spanY) * scale
    }]);
  }

  function drawMiniMapLocalBoard(ctx, x, y, w, h) {
    drawMiniMapBoard(ctx, state.areaId, x, y, w, h, {
      active: true,
      showEvents: true,
      showPlayer: true
    });
  }

  function drawMiniMapBoard(ctx, areaId, x, y, w, h, options = {}) {
    const areaConfig = areas[areaId];
    const rows = areaConfig?.map || [];
    const cols = Math.max(1, ...rows.map((row) => row.length));
    const rowCount = Math.max(1, rows.length);
    const cell = Math.max(options.minCell ?? 2, Math.min(w / cols, h / rowCount));
    const mapW = cols * cell;
    const mapH = rowCount * cell;
    const ox = x + (w - mapW) / 2;
    const oy = y + (h - mapH) / 2;
    ctx.save();
    if (options.dim) ctx.globalAlpha = 0.42;
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(ox - 2, oy - 2, mapW + 4, mapH + 4);
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < cols; tx += 1) {
        const char = row[tx] || "#";
        ctx.fillStyle = miniMapTileColor(char, areaConfig?.theme);
        ctx.fillRect(ox + tx * cell, oy + ty * cell, Math.ceil(cell), Math.ceil(cell));
      }
    });
    const objective = options.active ? localObjectiveTarget() : null;
    if (options.showEvents) {
      (areaConfig?.events || []).forEach((event) => {
        const isObjective = objective?.id && objective.id === event.id;
        if ((event.hidden && !isObjective) || !eventShouldRender(event)) return;
        const tile = isObjective ? objectiveTargetTile(event) : eventTile(event);
        const px = ox + (tile.x + 0.5) * cell;
        const py = oy + (tile.y + 0.5) * cell;
        const kind = eventKind(event);
        const radius = Math.max(1.8, cell * 0.46);
        ctx.fillStyle = isObjective ? "#ff79d1" : kind === "chest" ? "#f1c35a" : kind === "door" ? "#78d7ff" : event.boss ? "#f06c61" : "#dff7ff";
        ctx.beginPath();
        if (isObjective) {
          for (let point = 0; point < 10; point += 1) {
            const angle = -Math.PI / 2 + point * Math.PI / 5;
            const distance = point % 2 ? radius * 0.45 : radius;
            const sx = px + Math.cos(angle) * distance;
            const sy = py + Math.sin(angle) * distance;
            if (!point) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          }
          ctx.closePath();
          ctx.fill();
        } else if (kind === "chest") {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
          ctx.restore();
        } else if (event.boss) {
          ctx.moveTo(px, py - radius);
          ctx.lineTo(px + radius, py + radius);
          ctx.lineTo(px - radius, py + radius);
          ctx.closePath();
          ctx.fill();
        } else if (kind === "door") {
          ctx.fillRect(px - radius * 0.75, py - radius, radius * 1.5, radius * 2);
        } else {
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#182027";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.8, radius * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    if (options.showPlayer) {
      const playerX = ox + (state.x + 0.5) * cell;
      const playerY = oy + (state.y + 0.5) * cell;
      ctx.fillStyle = "#ffe97a";
      ctx.strokeStyle = "#121116";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(playerX, playerY, Math.max(2.4, cell * 0.62), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = options.active ? "#ffe97a" : "rgba(126, 215, 255, 0.48)";
    ctx.lineWidth = options.active ? 2.2 : 1.2;
    ctx.strokeRect(ox - 2, oy - 2, mapW + 4, mapH + 4);
    if (options.active && areaConfig?.exits?.length) {
      ctx.font = "bold 8px Trebuchet MS, sans-serif";
      ctx.textBaseline = "middle";
      areaConfig.exits.forEach((exit) => {
        const label = `${exit.edge === "north" ? "↑" : exit.edge === "south" ? "↓" : exit.edge === "west" ? "←" : "→"} ${areas[exit.to]?.name || exit.to}`;
        const tx = exit.edge === "west" ? ox + 2 : exit.edge === "east" ? ox + mapW - 2 : ox + mapW / 2;
        const ty = exit.edge === "north" ? oy + 5 : exit.edge === "south" ? oy + mapH - 5 : oy + mapH / 2;
        ctx.textAlign = exit.edge === "west" ? "left" : exit.edge === "east" ? "right" : "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(label, tx, ty);
        ctx.fillStyle = "#fff0b4";
        ctx.fillText(label, tx, ty);
      });
    }
    ctx.restore();
  }

  function miniMapTileColor(char, theme = currentTheme()) {
    if (char === "#") return "#252d31";
    if (char === "~") return "#166c93";
    if (char === "=" || char === "+" || char === "@") return theme === "floor" ? "#647a88" : "#b98655";
    if (char === "s") return "#d1b565";
    if (char === "_") return "#7f8780";
    if (char === "^") return "#4b5052";
    if (char === "T" || char === "t" || char === "p") return "#1f5f36";
    if (char === "H" || char === "r" || char === "w" || char === "d" || char === "x") return "#7b4a2d";
    if (char === "c" || char === "q" || char === "f") return "#69472e";
    if (char === "g" || char === "," || char === ".") return "#4f8746";
    if (char === "b") return "#2f6a38";
    if (char === "C") return "#957443";
    return theme === "floor" ? "#7f8780" : "#5f8d4b";
  }

  function mapWidth() {
    return area().map[0]?.length || MAP_W;
  }

  function mapHeight() {
    return area().map.length || MAP_H;
  }

  function leaderVisualTile() {
    const elapsed = Date.now() - (state.movedAt || 0);
    const progress = clamp(elapsed / WALK_MS, 0, 1);
    const eased = progress < 1 ? mapTravelEase(progress) : 1;
    const leadFrom = (state.partyTrail || []).find((step) => step.areaId === state.areaId);
    const x = leadFrom && progress < 1 ? lerp(leadFrom.x, state.x, eased) : state.x;
    const y = leadFrom && progress < 1 ? lerp(leadFrom.y, state.y, eased) : state.y;
    return { x, y, elapsed, progress, eased };
  }

  function heldMoveMatchesFacing(facing) {
    return (heldMoveDx < 0 && facing === "left") ||
      (heldMoveDx > 0 && facing === "right") ||
      (heldMoveDy < 0 && facing === "up") ||
      (heldMoveDy > 0 && facing === "down");
  }

  function mapWalkAnimationState(facing, progress, elapsed) {
    const holding = heldMoveKey && heldMoveMatchesFacing(facing);
    if (progress < 1) return { walkElapsed: elapsed, walkProgress: progress };
    if (holding) return { walkElapsed: WALK_MS - 1, walkProgress: 0.999 };
    return { walkElapsed: 9999, walkProgress: null };
  }

  function mapCamera(canvas) {
    return mapCameraForLead(canvas, leaderVisualTile());
  }

  function mapCameraForLead(canvas, lead) {
    const { width, height } = logicalCanvasSize(canvas);
    const mapPixelWidth = mapWidth() * TILE;
    const mapPixelHeight = mapHeight() * TILE;
    const edgePad = TILE;
    const minX = -edgePad;
    const minY = -edgePad;
    const maxX = Math.max(minX, mapPixelWidth - width + edgePad);
    const maxY = Math.max(minY, mapPixelHeight - height + edgePad);
    const x = clamp(lead.x * TILE + TILE / 2 - width / 2, minX, maxX);
    const y = clamp(lead.y * TILE + TILE / 2 - height / 2, minY, maxY);
    return {
      x,
      y
    };
  }

  function mapCanvasPointForTile(canvas, tile) {
    const camera = mapCameraForLead(canvas, tile);
    const { width, height } = logicalCanvasSize(canvas);
    const scaleX = canvas.getBoundingClientRect().width / width;
    const scaleY = canvas.getBoundingClientRect().height / height;
    return {
      x: (tile.x * TILE + TILE / 2 - camera.x) * scaleX,
      y: (tile.y * TILE + TILE / 2 - camera.y) * scaleY
    };
  }

  function elementVisible(el) {
    return Boolean(el && !el.classList.contains("is-hidden") && el.getClientRects().length > 0);
  }

  function viewportBoundsForMapPoint(pointX) {
    const xPad = 48;
    let top = 32;
    let bottom = window.innerHeight - 32;
    ["field-dock", "mobile-controls", "mini-map-canvas", "focus-toggle"].forEach((id) => {
      const el = $(id);
      if (!elementVisible(el)) return;
      const style = getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "sticky") return;
      const rect = el.getBoundingClientRect();
      const overlapsX = rect.left - xPad <= pointX && rect.right + xPad >= pointX;
      if (!overlapsX) return;
      if (rect.top > window.innerHeight / 2) bottom = Math.min(bottom, rect.top - 18);
      else if (rect.bottom < window.innerHeight / 2) top = Math.max(top, rect.bottom + 18);
    });
    return { top, bottom: Math.max(top + 80, bottom) };
  }

  function keepMapPlayerInViewport(tile = state) {
    if (!state || isFocusMode()) return;
    const canvas = $("map-canvas");
    if (!canvas || !elementVisible(canvas)) return;
    const rect = canvas.getBoundingClientRect();
    const point = mapCanvasPointForTile(canvas, tile);
    const viewportX = rect.left + point.x;
    const viewportY = rect.top + point.y;
    const bounds = viewportBoundsForMapPoint(viewportX);
    let deltaY = 0;
    if (viewportY > bounds.bottom) deltaY = viewportY - bounds.bottom;
    else if (viewportY < bounds.top) deltaY = viewportY - bounds.top;
    if (Math.abs(deltaY) < 1) return;
    window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
  }

  function mapTravelEase(progress) {
    const t = clamp(progress, 0, 1);
    return lerp(t, smoothStep(t), WALK_EASE_BLEND);
  }

  function renderWorldMap(canvasId = "world-canvas") {
    const canvas = $(canvasId);
    if (!canvas || !state) return;
    const { ctx, width, height } = prepareHiDPICanvas(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    drawWorldTerrain(ctx, width, height);
    const points = worldPoints(width, height);
    const byId = Object.fromEntries(points.map((point) => [point.id, point]));
    worldLinks().forEach((route) => {
      const [from, to, via = []] = route;
      const a = byId[from];
      const b = byId[to];
      if (!a || !b) return;
      const optional = optionalAreaIds.has(from) || optionalAreaIds.has(to);
      const known = isAreaKnown(from) || isAreaKnown(to);
      if (!known) return;
      const path = [a, ...via.map((coord) => projectBookCoord(coord, width, height)), b];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = optional ? 6 : 8;
      ctx.strokeStyle = "rgba(29, 21, 14, 0.28)";
      ctx.setLineDash(optional ? [4, 8] : [10, 8]);
      ctx.beginPath();
      path.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.lineWidth = optional ? 2.5 : 3.5;
      ctx.strokeStyle = optional ? "rgba(31, 132, 166, 0.82)" : "rgba(182, 89, 46, 0.86)";
      ctx.beginPath();
      path.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const activeWorldAreaId = worldAreaId(state.areaId);
    points.forEach((point) => {
      const active = point.id === activeWorldAreaId;
      const known = isAreaKnown(point.id);
      ctx.fillStyle = active ? "#ffe97a" : known ? (optionalAreaIds.has(point.id) ? "#7edbff" : "#f7ead5") : "rgba(54, 53, 52, 0.82)";
      ctx.strokeStyle = active ? "#2b1b0d" : "rgba(22, 21, 26, 0.92)";
      ctx.lineWidth = active ? 5 : 2.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, active ? 12 : optionalAreaIds.has(point.id) ? 7 : 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    const active = points.find((point) => point.id === activeWorldAreaId);
    if (active) {
      const label = areas[active.id].name;
      const labelW = Math.min(260, label.length * 9 + 26);
      const labelX = clamp(active.x + 16, 8, width - labelW - 8);
      const labelY = clamp(active.y - 19, 8, height - 34);
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      fillRoundRect(ctx, labelX, labelY, labelW, 28, 5, "rgba(0, 0, 0, 0.6)", "rgba(255, 233, 122, 0.38)");
      ctx.fillStyle = "#ffe97a";
      ctx.font = "bold 16px Trebuchet MS, sans-serif";
      ctx.fillText(label, labelX + 12, labelY + 19);
    }
    drawWorldLegend(ctx, width, height);
  }

  function pickTileCell(seed, cells) {
    return cells[seed % cells.length];
  }

  function currentAreaId() {
    return tileRenderAreaId || state?.areaId || "";
  }

  function worldAreaId(id = currentAreaId()) {
    return areaWorldParents[id] || id;
  }

  function areaMiniMapGroupFor(id = state?.areaId || "") {
    const worldId = worldAreaId(id);
    if (areaMiniMapGroups[worldId]) return areaMiniMapGroups[worldId];
    return Object.values(areaMiniMapGroups).find((group) => {
      const boards = group.boards || {};
      return Boolean(boards[id] || boards[worldId]);
    }) || null;
  }

  function currentTheme() {
    const id = currentAreaId();
    return id && areas[id] ? areas[id].theme : "";
  }

  function activeTileSheetKey() {
    return tileSheetKeyForAreaId(currentAreaId());
  }

  function worldMapFrame(w, h) {
    const ratio = bookMapSize.width / bookMapSize.height;
    const drawW = Math.min(w, h * ratio);
    const drawH = drawW / ratio;
    return {
      x: (w - drawW) / 2,
      y: (h - drawH) / 2,
      w: drawW,
      h: drawH
    };
  }

  function projectBookPoint(point, w, h) {
    const frame = worldMapFrame(w, h);
    return {
      ...point,
      x: frame.x + (point.sx / bookMapSize.width) * frame.w,
      y: frame.y + (point.sy / bookMapSize.height) * frame.h
    };
  }

  function projectBookCoord(coord, w, h) {
    return projectBookPoint({ sx: coord[0], sy: coord[1] }, w, h);
  }

  function eventBaseTileCell(theme, seed, raw, tx, ty, rows) {
    const areaId = currentAreaId();
    const worldId = worldAreaId(areaId);
    const nearWater = Boolean(rows && neighbor(rows, tx, ty, "~"));
    if (worldId === "marhynCastle" && theme === "floor") return "cleanStone";
    if (areaId === "merfolkShoals" && theme === "water") {
      if (waterBridgeAt(rows, tx, ty, raw)) return "bridge";
      return nearWater ? "shore" : "sand";
    }
    if (theme === "floor") return smoothFloorCellName(areaId, seed, tx, ty, rows);
    if (theme === "water") return waterBridgeAt(rows, tx, ty, raw) ? "bridge" : (nearWater ? "shore" : "shoal");
    if (theme === "mountain") return "calmMeadow";
    if (theme === "tree") return "forestFloor";
    if (theme === "town") return "calmMeadow";
    if (theme === "sand") return "sand";
    return "calmGrass";
  }

  function smoothFloorCellName(areaId, seed, tx, ty, rows = null) {
    const nearWall = rows && neighbor(rows, tx, ty, "#");
    const edgeDetail = rows && surfaceBoundary(rows, tx, ty);
    const worldId = worldAreaId(areaId);
    if (worldId === "marhynCastle" || areaId === "rathskeller" || areaId === "darhynCastle") return "cleanStone";
    if (areaId === "merfolkShoals" || areaId === "tideCavern") {
      return edgeDetail && hash(areaId, tx, ty, "ruin-edge") % 7 === 0 ? "ruinFloor" : "cleanStone";
    }
    if (currentTheme() === "floor") {
      if (nearWall && edgeDetail && hash(areaId, tx, ty, "wall-edge") % 12 === 0) return "quietStone";
      return "cleanStone";
    }
    return "cleanStone";
  }

  function surfaceBoundary(rows, tx, ty) {
    const raw = rows?.[ty]?.[tx];
    if (!raw) return false;
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
      const other = rows?.[ty + dy]?.[tx + dx];
      return other && other !== raw;
    });
  }

  function sparseEdgeVariant(rows, tx, ty, seed, base, variants, rate = 9) {
    if (!rows || !surfaceBoundary(rows, tx, ty)) return base;
    if (hash(currentAreaId(), tx, ty, seed, "surface-edge") % rate !== 0) return base;
    return variants[hash(seed, tx, ty, "variant") % variants.length] || base;
  }

  function waterBridgeAt(rows, tx, ty, raw = rows?.[ty]?.[tx]) {
    if (currentTheme() !== "water" || !rows) return false;
    if (!(raw === "=" || raw === "@" || raw === "+" || (!tileInfo[raw] && eventMarkerHasPathUnderlay(raw, rows, tx, ty)))) return false;
    if (neighbor(rows, tx, ty, "~")) return true;
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
      const char = rows[ty + dy]?.[tx + dx];
      return isBridgePathChar(char) && neighbor(rows, tx + dx, ty + dy, "~");
    });
  }

  function isBridgePathChar(char) {
    return char === "=" || char === "@" || char === "+";
  }

  function bridgePathNeighbor(rows, tx, ty, dx, dy) {
    const char = rows?.[ty + dy]?.[tx + dx];
    if (isBridgePathChar(char)) return true;
    return Boolean(char && !tileInfo[char] && eventMarkerHasPathUnderlay(char, rows, tx + dx, ty + dy));
  }

  function bridgeLandingNeighbor(rows, tx, ty, dx, dy) {
    const char = rows?.[ty + dy]?.[tx + dx];
    return Boolean(char && char !== "~" && !isBlockedTileChar(char));
  }

  function bridgeOrientation(rows, tx, ty) {
    const path = {
      up: bridgePathNeighbor(rows, tx, ty, 0, -1),
      down: bridgePathNeighbor(rows, tx, ty, 0, 1),
      left: bridgePathNeighbor(rows, tx, ty, -1, 0),
      right: bridgePathNeighbor(rows, tx, ty, 1, 0)
    };
    const horizontal = Number(path.left) + Number(path.right);
    const vertical = Number(path.up) + Number(path.down);
    if (horizontal > vertical) return "horizontal";
    if (vertical > horizontal) return "vertical";
    const water = {
      up: rows?.[ty - 1]?.[tx] === "~",
      down: rows?.[ty + 1]?.[tx] === "~",
      left: rows?.[ty]?.[tx - 1] === "~",
      right: rows?.[ty]?.[tx + 1] === "~"
    };
    const waterHorizontal = Number(water.left) + Number(water.right);
    const waterVertical = Number(water.up) + Number(water.down);
    if (waterVertical > waterHorizontal) return "horizontal";
    if (waterHorizontal > waterVertical) return "vertical";
    return "cross";
  }

  function bridgeArms(rows, tx, ty) {
    const orientation = bridgeOrientation(rows, tx, ty);
    const allowHorizontal = orientation === "horizontal" || orientation === "cross";
    const allowVertical = orientation === "vertical" || orientation === "cross";
    return {
      up: bridgePathNeighbor(rows, tx, ty, 0, -1) || (allowVertical && (ty === 0 || bridgeLandingNeighbor(rows, tx, ty, 0, -1))),
      down: bridgePathNeighbor(rows, tx, ty, 0, 1) || (allowVertical && ((rows ? ty === rows.length - 1 : false) || bridgeLandingNeighbor(rows, tx, ty, 0, 1))),
      left: bridgePathNeighbor(rows, tx, ty, -1, 0) || (allowHorizontal && (tx === 0 || bridgeLandingNeighbor(rows, tx, ty, -1, 0))),
      right: bridgePathNeighbor(rows, tx, ty, 1, 0) || (allowHorizontal && ((rows?.[ty] ? tx === rows[ty].length - 1 : false) || bridgeLandingNeighbor(rows, tx, ty, 1, 0)))
    };
  }

  function bridgeTravelAllowed(rows, tx, ty, dx, dy) {
    const arms = bridgeArms(rows, tx, ty);
    if (dx > 0) return arms.left;
    if (dx < 0) return arms.right;
    if (dy > 0) return arms.up;
    if (dy < 0) return arms.down;
    return true;
  }

  function bridgeExitAllowed(rows, tx, ty, dx, dy) {
    const arms = bridgeArms(rows, tx, ty);
    if (dx > 0) return arms.right;
    if (dx < 0) return arms.left;
    if (dy > 0) return arms.down;
    if (dy < 0) return arms.up;
    return true;
  }

  function tileSheetCellName(kind, raw, tx, ty, rows, seed) {
    const theme = currentTheme();
    const areaId = currentAreaId();
    const worldId = worldAreaId(areaId);
    const rawChar = raw || ".";
    const isEventMarker = !tileInfo[rawChar] && rawChar !== "=" && rawChar !== "+" && rawChar !== "@";
    if (rawChar === "@" || isEventMarker) return eventBaseTileCell(theme, seed, rawChar, tx, ty, rows);
    if (rawChar === "H") return "roof";
    if (rawChar === "r" || kind === "roof") return "roof";
    if (rawChar === "w" || kind === "house") return "town";
    if (rawChar === "x" || kind === "houseSide") return "houseSide";
    if (rawChar === "d" || kind === "door") return "door";
    if (rawChar === "f" || kind === "fence") return "fence";
    if (rawChar === "g" || kind === "garden") return "garden";
    if (rawChar === "q" || kind === "threshold") return "threshold";
    if (rawChar === "c" || kind === "counter") return "wood";
    if (kind === "grass") {
      if (rawChar === ",") return sparseEdgeVariant(rows, tx, ty, seed, "calmMeadow", ["meadow", "flowerGrass"], 11);
      if (theme === "tree") return sparseEdgeVariant(rows, tx, ty, seed, "forestFloor", ["calmGrass"], 12);
      if (theme === "town") return sparseEdgeVariant(rows, tx, ty, seed, "calmMeadow", ["flowerGrass"], 14);
      return sparseEdgeVariant(rows, tx, ty, seed, "calmGrass", ["grass", "quietGrass"], 12);
    }
    if (kind === "path") {
      if (theme === "floor") return "stonePath";
      if (theme === "water") return waterBridgeAt(rows, tx, ty, rawChar) ? "bridge" : "shoal";
      if (theme === "sand") return "sand";
      if (theme === "town") return "stonePath";
      return "path";
    }
    if (kind === "water") {
      if (areaId === "merfolkShoals" || areaId === "tideCavern") {
        const frame = Math.floor(Date.now() / 620) % 4;
        return ["calmWater", "water", "calmWater", "water2"][frame];
      }
      const frame = Math.floor(Date.now() / 520) % 4;
      return ["calmWater", "water", "water2", "water3"][frame];
    }
    if (kind === "wall") {
      if (theme === "water") return areaId === "tideCavern" ? "castleWall" : "wall";
      if (worldId === "marhynCastle") {
        const edgeWall = rows ? ty === 0 || ty === rows.length - 1 || tx === 0 || tx === rows[ty].length - 1 : false;
        return edgeWall ? "castleWall" : "wall";
      }
      if (theme === "floor" || areaId === "darhynCastle" || areaId === "rathskeller") {
        return "castleWall";
      }
      return "wall";
    }
    if (kind === "mountain") return sparseEdgeVariant(rows, tx, ty, seed, "mountain", ["mountain2", "cliff"], 8);
    if (kind === "tree") {
      if (rawChar === "t") return "broadleaf";
      if (rawChar === "p") return "pine";
      return sparseEdgeVariant(rows, tx, ty, seed, "tree", ["tree2", "broadleaf", "pine"], 9);
    }
    if (kind === "bush") return "bush";
    if (kind === "town") return "town";
    if (kind === "door") return "door";
    if (kind === "floor") {
      return smoothFloorCellName(areaId, seed, tx, ty, rows);
    }
    if (kind === "sand") {
      if (areaId === "merfolkShoals") {
        if (rows && neighbor(rows, tx, ty, "~")) return "shore";
        if (rows && neighbor(rows, tx, ty, "=")) return "shoal";
        return "sand";
      }
      if (theme === "water") return rows && neighbor(rows, tx, ty, "~") ? "shore" : "shoal";
      return sparseEdgeVariant(rows, tx, ty, seed, "sand", ["shoal"], 10);
    }
    return null;
  }

  function drawTileFromSheet(ctx, kind, size, tx, ty, raw, rows, seed) {
    let sheetKey = activeTileSheetKey();
    if (!imageReady(sheetKey)) sheetKey = tileSheet.key;
    if (!imageReady(sheetKey)) return false;
    const img = artImages[sheetKey];
    const sw = img.naturalWidth / tileSheet.cols;
    const sh = img.naturalHeight / tileSheet.rows;
    const inset = Math.max(1, Math.min(sw, sh) * 0.012);
    const cellName = tileSheetCellName(kind, raw, tx, ty, rows, seed);
    if (waterBridgeAt(rows, tx, ty, raw)) {
      const frame = Math.floor(Date.now() / 620) % 4;
      const waterCell = ["calmWater", "water", "calmWater", "water2"][frame];
      drawSheetCell(ctx, img, sw, sh, inset, size, tileSheet.cells[waterCell], 0);
      drawConnectedBridgeTile(ctx, size, bridgeArms(rows, tx, ty), seed);
      return true;
    }
    if (eventMarkerHasPathUnderlay(raw, rows, tx, ty)) {
      drawDirectionalPathTileFromSheet(ctx, img, sw, sh, inset, size, currentTheme() === "water" ? "shoal" : currentTheme() === "floor" ? "cleanStone" : "path", tx, ty, rows, seed);
      return true;
    }
    const cell = tileSheet.cells[cellName];
    if (!cell) return false;
    if (kind === "path") {
      drawDirectionalPathTileFromSheet(ctx, img, sw, sh, inset, size, cellName, tx, ty, rows, seed);
      return true;
    }
    drawSheetCell(ctx, img, sw, sh, inset, size, cell, 0);
    return true;
  }

  function drawSheetCell(ctx, img, sw, sh, inset, size, cell, rotation = 0) {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    if (rotation) ctx.rotate(rotation);
    ctx.drawImage(img, cell[0] * sw + inset, cell[1] * sh + inset, sw - inset * 2, sh - inset * 2, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawDirectionalPathTileFromSheet(ctx, img, sw, sh, inset, size, cellName, tx, ty, rows, seed) {
    const baseCell = tileSheet.cells[pathBaseCellName(seed)];
    const arms = pathArms(rows, tx, ty);
    const count = Object.values(arms).filter(Boolean).length;
    if (baseCell) drawSheetCell(ctx, img, sw, sh, inset, size, baseCell, 0);
    else drawGrassTile(ctx, size, seed, ".");
    drawConnectedPathRibbon(ctx, size, count ? arms : { up: false, down: false, left: false, right: false }, seed);
  }

  function drawConnectedBridgeTile(ctx, size, arms, seed) {
    const band = size * 0.54;
    const radius = size * 0.055;
    const hasVertical = arms.up || arms.down;
    const hasHorizontal = arms.left || arms.right;

    ctx.save();
    traceConnectedPathRibbon(ctx, size, arms, band, radius);
    ctx.clip();
    const deck = ctx.createLinearGradient(0, 0, size, size);
    deck.addColorStop(0, "#8a6740");
    deck.addColorStop(0.46, "#5b3f26");
    deck.addColorStop(1, "#2e2218");
    ctx.fillStyle = deck;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(28, 19, 13, 0.5)";
    ctx.lineWidth = 2;
    if (hasVertical) {
      for (let y = -4; y < size + 8; y += 10) {
        ctx.beginPath();
        ctx.moveTo(size * 0.25, y + rand(seed + y) * 1.4);
        ctx.lineTo(size * 0.75, y - rand(seed + y + 3) * 1.4);
        ctx.stroke();
      }
    }
    if (hasHorizontal) {
      for (let x = -4; x < size + 8; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x + rand(seed + x) * 1.4, size * 0.25);
        ctx.lineTo(x - rand(seed + x + 3) * 1.4, size * 0.75);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(26, 18, 12, 0.72)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const railInset = size * 0.18;
    const railOutset = size * 0.08;
    if (hasVertical) {
      if (arms.up || arms.down) {
        ctx.beginPath();
        ctx.moveTo(railInset, arms.up ? -railOutset : size * 0.5);
        ctx.lineTo(railInset, arms.down ? size + railOutset : size * 0.5);
        ctx.moveTo(size - railInset, arms.up ? -railOutset : size * 0.5);
        ctx.lineTo(size - railInset, arms.down ? size + railOutset : size * 0.5);
        ctx.stroke();
      }
      for (let y = arms.up ? 2 : size * 0.5; y < (arms.down ? size : size * 0.55); y += 15) {
        ctx.fillStyle = "rgba(40, 26, 15, 0.86)";
        ctx.fillRect(railInset - 3, y, 6, 8);
        ctx.fillRect(size - railInset - 3, y, 6, 8);
      }
    }
    if (hasHorizontal) {
      if (arms.left || arms.right) {
        ctx.beginPath();
        ctx.moveTo(arms.left ? -railOutset : size * 0.5, railInset);
        ctx.lineTo(arms.right ? size + railOutset : size * 0.5, railInset);
        ctx.moveTo(arms.left ? -railOutset : size * 0.5, size - railInset);
        ctx.lineTo(arms.right ? size + railOutset : size * 0.5, size - railInset);
        ctx.stroke();
      }
      for (let x = arms.left ? 2 : size * 0.5; x < (arms.right ? size : size * 0.55); x += 15) {
        ctx.fillStyle = "rgba(40, 26, 15, 0.86)";
        ctx.fillRect(x, railInset - 3, 8, 6);
        ctx.fillRect(x, size - railInset - 3, 8, 6);
      }
    }
    ctx.strokeStyle = "rgba(236, 205, 132, 0.2)";
    ctx.lineWidth = 1.5;
    traceConnectedPathRibbon(ctx, size, arms, band, radius);
    ctx.stroke();
    ctx.restore();
  }

  function drawConnectedPathRibbon(ctx, size, arms, seed) {
    const band = size * 0.46;
    const start = (size - band) / 2;
    const half = size / 2;
    const radius = size * 0.1;
    const hasArms = Object.values(arms).some(Boolean);
    const palette = connectedPathPalette();

    ctx.save();
    traceConnectedPathRibbon(ctx, size, arms, band, radius);
    ctx.clip();
    const dirt = ctx.createLinearGradient(0, 0, size, size);
    dirt.addColorStop(0, palette.top);
    dirt.addColorStop(0.45, palette.mid);
    dirt.addColorStop(1, palette.bottom);
    ctx.fillStyle = dirt;
    ctx.fillRect(0, 0, size, size);

    const speckles = palette.speckles ?? 24;
    for (let i = 0; i < speckles; i += 1) {
      const n = rand(hash(seed, "path-speck", i));
      const m = rand(hash(seed, "path-pebble", i));
      const px = n * size;
      const py = m * size;
      ctx.fillStyle = i % 3 === 0 ? palette.lightSpeck : palette.darkSpeck;
      ctx.beginPath();
      ctx.ellipse(px, py, 1.2 + rand(hash(seed, "path-rx", i)) * 2.1, 0.8 + rand(hash(seed, "path-ry", i)) * 1.6, n * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    if (palette.fiber) {
      ctx.strokeStyle = palette.fiber;
      ctx.lineWidth = 1;
      for (let y = start + 7; y < start + band; y += 9) {
        ctx.beginPath();
        ctx.moveTo(start + 3, y + rand(hash(seed, "fiber", y)) * 1.2);
        ctx.lineTo(start + band - 3, y - rand(hash(seed, "fiber-b", y)) * 1.2);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = palette.shadow || "rgba(76, 47, 25, 0.16)";
    if (hasArms) {
      if (arms.up || arms.down) ctx.fillRect(start + band * 0.1, arms.up ? 0 : half, band * 0.24, arms.up && arms.down ? size : half);
      if (arms.left || arms.right) ctx.fillRect(arms.left ? 0 : half, start + band * 0.64, arms.left && arms.right ? size : half, band * 0.18);
    }
    ctx.restore();

    ctx.save();
    traceConnectedPathRibbon(ctx, size, arms, band, radius);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, size * 0.055);
    ctx.strokeStyle = palette.edge;
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, size * 0.018);
    ctx.strokeStyle = palette.highlight;
    ctx.stroke();
    ctx.restore();
  }

  function connectedPathPalette() {
    const theme = currentTheme();
    const areaId = currentAreaId();
    const worldId = worldAreaId(areaId);
    if (theme === "floor") {
      if (areaId === "rathskeller") {
        return {
          top: "#9b1421",
          mid: "#7a101a",
          bottom: "#4d0b12",
          lightSpeck: "rgba(246, 190, 126, 0.18)",
          darkSpeck: "rgba(35, 7, 12, 0.16)",
          edge: "rgba(239, 209, 126, 0.72)",
          highlight: "rgba(255, 236, 176, 0.42)",
          shadow: "rgba(43, 8, 13, 0.12)",
          fiber: "rgba(255, 218, 156, 0.11)",
          speckles: 5
        };
      }
      if (worldId === "marhynCastle") {
        return {
          top: "#2f5d91",
          mid: "#244a79",
          bottom: "#17365f",
          lightSpeck: "rgba(184, 222, 255, 0.16)",
          darkSpeck: "rgba(9, 20, 38, 0.18)",
          edge: "rgba(231, 208, 109, 0.64)",
          highlight: "rgba(223, 238, 255, 0.3)",
          shadow: "rgba(18, 34, 58, 0.1)",
          fiber: "rgba(212, 234, 255, 0.1)",
          speckles: 4
        };
      }
      return {
        top: "#aeb6ae",
        mid: "#8a948d",
        bottom: "#66716c",
        lightSpeck: "rgba(238, 244, 218, 0.18)",
        darkSpeck: "rgba(27, 34, 31, 0.16)",
        edge: "rgba(30, 38, 36, 0.28)",
        highlight: "rgba(239, 246, 218, 0.22)",
        shadow: "rgba(39, 50, 46, 0.08)",
        speckles: 6
      };
    }
    if (theme === "sand" || theme === "water") {
      return {
        top: "#ebd383",
        mid: "#c4a85f",
        bottom: "#8d7743",
        lightSpeck: "rgba(255, 238, 166, 0.34)",
        darkSpeck: "rgba(94, 74, 36, 0.22)",
        edge: "rgba(85, 67, 33, 0.36)",
        highlight: "rgba(255, 241, 175, 0.2)"
      };
    }
    return {
      top: "#d5a76a",
      mid: "#a9723f",
      bottom: "#6f4b2f",
      lightSpeck: "rgba(246, 217, 152, 0.36)",
      darkSpeck: "rgba(44, 31, 20, 0.2)",
      edge: "rgba(49, 35, 22, 0.34)",
      highlight: "rgba(246, 218, 162, 0.18)"
    };
  }

  function traceConnectedPathRibbon(ctx, size, arms, band, radius) {
    const start = (size - band) / 2;
    const half = size / 2;
    ctx.beginPath();
    if (arms.up) ctx.rect(start, 0, band, half);
    if (arms.down) ctx.rect(start, half, band, half);
    if (arms.left) ctx.rect(0, start, half, band);
    if (arms.right) ctx.rect(half, start, half, band);
    appendRoundRectPath(ctx, start, start, band, band, radius);
  }

  function appendRoundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function pathBaseCellName(seed) {
    const theme = currentTheme();
    if (theme === "floor") return "cleanStone";
    if (theme === "water") return "shoal";
    if (theme === "sand") return "sand";
    if (theme === "town") return "calmMeadow";
    if (theme === "tree") return "forestFloor";
    return "calmGrass";
  }

  function pathArms(rows, tx, ty) {
    return {
      up: pathConnects(rows, tx, ty, 0, -1) || ty === 0,
      down: pathConnects(rows, tx, ty, 0, 1) || (rows ? ty === rows.length - 1 : false),
      left: pathConnects(rows, tx, ty, -1, 0) || tx === 0,
      right: pathConnects(rows, tx, ty, 1, 0) || (rows?.[ty] ? tx === rows[ty].length - 1 : false)
    };
  }

  function pathConnects(rows, tx, ty, dx, dy) {
    const char = rows?.[ty + dy]?.[tx + dx];
    return char === "=" || char === "@" || char === "+";
  }

  function eventMarkerHasPathUnderlay(raw, rows, tx, ty) {
    if (!raw || tileInfo[raw] || raw === "=" || raw === "+" || raw === "@") return false;
    const arms = pathArms(rows, tx, ty);
    return (arms.left && arms.right) || (arms.up && arms.down) || Object.values(arms).filter(Boolean).length >= 3;
  }

  function drawTile(ctx, kind, px, py, size, tx, ty, raw, rows) {
    const seed = hash(tx, ty, currentAreaId() || "title");
    ctx.save();
    ctx.translate(px, py);
    const usedSheet = drawTileFromSheet(ctx, kind, size, tx, ty, raw, rows, seed);
    if (!usedSheet) {
      if (kind === "grass") drawGrassTile(ctx, size, seed, raw);
      else if (kind === "path") drawPathTile(ctx, size, seed, tx, ty, rows);
      else if (kind === "water") drawWaterTile(ctx, size, seed, tx, ty, rows);
      else if (kind === "wall") drawWallTile(ctx, size, seed);
      else if (kind === "mountain") drawMountainTile(ctx, size, seed);
      else if (kind === "tree") drawForestTile(ctx, size, seed, raw);
      else if (kind === "bush") drawBushTile(ctx, size, seed);
      else if (kind === "town") drawTownTile(ctx, size, seed);
      else if (kind === "door") drawDoorTile(ctx, size, seed);
      else if (kind === "roof" || kind === "house" || kind === "houseSide") drawTownTile(ctx, size, seed);
      else if (kind === "counter") drawCounterTile(ctx, size, seed);
      else if (kind === "fence") drawPathTile(ctx, size, seed, tx, ty, rows);
      else if (kind === "garden") drawGrassTile(ctx, size, seed, ",");
      else if (kind === "floor") drawFloorTile(ctx, size, seed);
      else if (kind === "sand") drawSandTile(ctx, size, seed);
    }
    ctx.strokeStyle = usedSheet ? "rgba(0,0,0,0.065)" : "rgba(0,0,0,0.34)";
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    if (kind === "counter") drawCounterDetails(ctx, size, seed);
    ctx.restore();
  }

  function drawGrassTile(ctx, size, seed, raw) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, raw === "," ? "#87ad5c" : "#579957");
    gradient.addColorStop(0.48, raw === "," ? "#6f9a50" : "#3f7d46");
    gradient.addColorStop(1, raw === "," ? "#547c43" : "#2e6039");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 46; i += 1) {
      const x = rand(seed + i * 11) * size;
      const y = rand(seed + i * 17) * size;
      ctx.strokeStyle = i % 3 === 0 ? "#a3cb6d" : i % 3 === 1 ? "#2f6138" : "#4f8a44";
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x | 0, (y + 5) | 0);
      ctx.lineTo((x + rand(seed + i * 23) * 4 - 2) | 0, y | 0);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      const x = (rand(seed + i * 101) * (size - 8)) | 0;
      const y = (rand(seed + i * 107) * (size - 8)) | 0;
      ctx.fillStyle = i % 2 ? "#d7cf75" : "#d98980";
      ctx.beginPath();
      ctx.arc(x + 4, y + 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, size, 5);
  }

  function drawPathTile(ctx, size, seed, tx, ty, rows) {
    ctx.fillStyle = area().theme === "sand" ? "#bfa95f" : area().theme === "floor" ? "#3d4337" : "#3f7d46";
    ctx.fillRect(0, 0, size, size);
    if (area().theme === "sand") drawSandTile(ctx, size, seed);
    else if (area().theme === "floor") drawFloorTile(ctx, size, seed);
    else drawGrassTile(ctx, size, seed, ".");
    const road = ctx.createLinearGradient(0, 0, 0, size);
    road.addColorStop(0, "#d0af75");
    road.addColorStop(0.5, "#a77745");
    road.addColorStop(1, "#6c4f32");
    ctx.fillStyle = road;
    const connected = (dx, dy) => {
      const c = rows?.[ty + dy]?.[tx + dx];
      return c === "=" || c === "@" || c === "+";
    };
    const arms = {
      up: connected(0, -1) || ty === 0,
      down: connected(0, 1) || (rows ? ty === rows.length - 1 : false),
      left: connected(-1, 0) || tx === 0,
      right: connected(1, 0) || (rows?.[ty] ? tx === rows[ty].length - 1 : false)
    };
    fillRoundRect(ctx, 18, 18, 28, 28, 9, road, null);
    if (arms.up) fillRoundRect(ctx, 18, -2, 28, 35, 8, road, null);
    if (arms.down) fillRoundRect(ctx, 18, 31, 28, 35, 8, road, null);
    if (arms.left) fillRoundRect(ctx, -2, 18, 35, 28, 8, road, null);
    if (arms.right) fillRoundRect(ctx, 31, 18, 35, 28, 8, road, null);
    ctx.strokeStyle = "rgba(54, 36, 23, 0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(19, 19, 26, 26);
    for (let i = 0; i < 24; i += 1) {
      const x = (rand(seed + i) * size) | 0;
      const y = (rand(seed + i * 7) * size) | 0;
      const nearCenter = Math.abs(x - size / 2) < 24 || Math.abs(y - size / 2) < 24;
      if (!nearCenter) continue;
      ctx.fillStyle = i % 2 ? "#6b5132" : "#d8bb82";
      ctx.fillRect(x, y, 3, 2);
    }
    ctx.strokeStyle = "rgba(255, 240, 190, 0.16)";
    ctx.beginPath();
    ctx.moveTo(6, 18 + rand(seed) * 10);
    ctx.lineTo(size - 6, 39 + rand(seed + 3) * 10);
    ctx.stroke();
  }

  function drawWaterTile(ctx, size, seed, tx, ty, rows) {
    const t = reducedMotionEnabled() ? 0 : Date.now() / 360;
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#2a9dc2");
    gradient.addColorStop(0.45, "#155d83");
    gradient.addColorStop(1, "#0b314f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#71d4ff";
    ctx.lineWidth = 3;
    for (let y = 8; y < size; y += 14) {
      const off = Math.sin(t + seed + y) * 6;
      ctx.beginPath();
      ctx.moveTo(off - 8, y);
      ctx.quadraticCurveTo(off + 10, y - 5, off + 27, y);
      ctx.quadraticCurveTo(off + 41, y + 5, off + 58, y + 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(185,240,255,0.22)";
    ctx.fillRect(0, 0, size, 6);
    const touchesLand = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
      const c = rows?.[ty + dy]?.[tx + dx];
      return c && c !== "~";
    });
    if (touchesLand) {
      ctx.strokeStyle = "rgba(238, 217, 135, 0.28)";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, size - 4, size - 4);
    }
  }

  function drawWallTile(ctx, size, seed) {
    const back = ctx.createLinearGradient(0, 0, 0, size);
    back.addColorStop(0, "#6f7a66");
    back.addColorStop(0.38, "#424d3f");
    back.addColorStop(1, "#1d2421");
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, size, size);
    const colors = ["#6e7b68", "#9aa58c", "#465246", "#798570"];
    for (let y = 0; y < size; y += 12) {
      for (let x = (y / 12) % 2 ? -18 : 0; x < size; x += 30) {
        ctx.fillStyle = colors[(hash(x, y, seed) % colors.length + colors.length) % colors.length];
        ctx.fillRect(x + 1, y + 1, 28, 10);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x + 2, y + 2, 25, 2);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 2, y + 9, 26, 2);
      }
    }
    ctx.fillStyle = "rgba(12, 14, 13, 0.36)";
    for (let y = 11; y < size; y += 12) ctx.fillRect(0, y, size, 2);
    for (let i = 0; i < 22; i += 1) {
      const x = (rand(seed + i * 53) * size) | 0;
      const y = (rand(seed + i * 59) * size) | 0;
      ctx.fillStyle = i % 2 ? "rgba(214, 224, 188, 0.22)" : "rgba(10, 12, 10, 0.24)";
      ctx.fillRect(x, y, 2 + (i % 3), 1 + (i % 2));
    }
    ctx.fillStyle = "rgba(76, 124, 68, 0.48)";
    ctx.fillRect(0, size - 10, size, 5);
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect((rand(seed + i * 61) * size) | 0, (rand(seed + i * 67) * size) | 0, 3, 8 + (i % 3));
    }
  }

  function drawMountainTile(ctx, size, seed) {
    const back = ctx.createLinearGradient(0, 0, size, size);
    back.addColorStop(0, "#5c684f");
    back.addColorStop(0.55, "#394348");
    back.addColorStop(1, "#20262a");
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#757768";
    ctx.beginPath();
    ctx.moveTo(4, size - 4);
    ctx.lineTo(size * 0.42, 8 + rand(seed) * 12);
    ctx.lineTo(size - 5, size - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a8a994";
    ctx.beginPath();
    ctx.moveTo(size * 0.42, 8 + rand(seed) * 12);
    ctx.lineTo(size * 0.58, size - 6);
    ctx.lineTo(size * 0.31, size - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d0d1bf";
    ctx.fillRect(size * 0.38, 13, 10, 7);
  }

  function drawForestTile(ctx, size, seed, raw = "T") {
    drawGrassTile(ctx, size, seed, ".");
    if (raw === "t") {
      const crowns = [
        [19, 26, 19],
        [41, 23, 21],
        [31, 39, 23]
      ];
      crowns.forEach(([x, y, r], i) => {
        ctx.fillStyle = "#5a3d27";
        ctx.fillRect(x - 3, y + 12, 7, 26);
        const green = i % 2 ? "#2f7f42" : "#245f36";
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lighten(green, 0.2);
        ctx.beginPath();
        ctx.arc(x - 6, y - 7, r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }
    const trunks = raw === "p" ? [12, 27, 42, 55] : [13, 29, 45, 55];
    trunks.forEach((x, i) => {
      ctx.fillStyle = "#5a3d27";
      ctx.fillRect(x - 3, 31 + i, 7, 25);
      const green = raw === "p" ? (i % 2 ? "#193f31" : "#20563a") : (i % 2 ? "#1f5732" : "#2d7440");
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.moveTo(x, 4 + rand(seed + i) * 7);
      ctx.lineTo(x - (raw === "p" ? 16 : 19), 38);
      ctx.lineTo(x + (raw === "p" ? 16 : 19), 38);
      ctx.closePath();
      ctx.fill();
      if (raw === "p") {
        ctx.beginPath();
        ctx.moveTo(x, 18 + rand(seed + i * 5) * 5);
        ctx.lineTo(x - 20, 50);
        ctx.lineTo(x + 20, 50);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = lighten(green, 0.22);
      ctx.beginPath();
      ctx.moveTo(x - 1, 10);
      ctx.lineTo(x - 10, 29);
      ctx.lineTo(x + 4, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x - 8, 20, 4, 4);
    });
  }

  function drawBushTile(ctx, size, seed) {
    drawGrassTile(ctx, size, seed, ",");
    const clusters = [
      [15, 36, 14],
      [34, 30, 18],
      [49, 42, 13]
    ];
    clusters.forEach(([x, y, r], i) => {
      const green = i % 2 ? "#3e8443" : "#2f6d3e";
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + 7, y + 2, r * 0.72, 0, Math.PI * 2);
      ctx.arc(x - 7, y + 3, r * 0.66, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lighten(green, 0.22);
      ctx.beginPath();
      ctx.arc(x - 4, y - 5, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i % 2 ? "#d9c15c" : "#c95d6c";
      ctx.beginPath();
      ctx.arc(12 + rand(seed + i * 43) * 42, 22 + rand(seed + i * 47) * 28, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTownTile(ctx, size, seed) {
    drawGrassTile(ctx, size, seed, ".");
    ctx.fillStyle = "rgba(82, 54, 34, 0.38)";
    ctx.fillRect(8, 44, 48, 12);
    ctx.fillStyle = "#6d4630";
    ctx.fillRect(12, 26, 40, 30);
    const roof = ctx.createLinearGradient(8, 10, 56, 28);
    roof.addColorStop(0, "#d85d43");
    roof.addColorStop(1, "#70271f");
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(8, 28);
    ctx.lineTo(32, 10);
    ctx.lineTo(56, 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9b55d";
    ctx.fillRect(18, 34, 9, 8);
    ctx.fillRect(39, 34, 8, 8);
    ctx.fillStyle = "#2b1e18";
    ctx.fillRect(29, 40, 9, 16);
  }

  function drawDoorTile(ctx, size, seed) {
    drawFloorTile(ctx, size, seed);
    ctx.fillStyle = "#312857";
    ctx.fillRect(10, 5, 44, 54);
    ctx.strokeStyle = "#bca85f";
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 8, 36, 49);
    ctx.fillStyle = "#6fb5e8";
    ctx.fillRect(29, 30, 6, 6);
  }

  function drawCounterTile(ctx, size, seed) {
    drawFloorTile(ctx, size, seed);
    drawCounterDetails(ctx, size, seed);
  }

  function drawCounterDetails(ctx, size, seed) {
    const wood = ctx.createLinearGradient(0, 6, 0, size - 6);
    wood.addColorStop(0, "#ad7845");
    wood.addColorStop(0.52, "#7b4c2b");
    wood.addColorStop(1, "#402719");
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(3, size - 10, size - 6, 7);
    fillRoundRect(ctx, 5, 10, size - 10, size - 19, 5, wood, "rgba(35, 20, 12, 0.7)");
    ctx.fillStyle = "rgba(255, 231, 168, 0.18)";
    ctx.fillRect(9, 14, size - 18, 5);
    ctx.strokeStyle = "rgba(43, 25, 15, 0.58)";
    ctx.lineWidth = 2;
    for (let x = 16; x < size - 8; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x + (seed % 3), 14);
      ctx.lineTo(x - 3, size - 12);
      ctx.stroke();
    }
  }

  function drawFloorTile(ctx, size, seed) {
    const back = ctx.createLinearGradient(0, 0, size, size);
    back.addColorStop(0, "#69715f");
    back.addColorStop(0.52, "#424a3d");
    back.addColorStop(1, "#272c24");
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 12) {
      for (let x = 0; x < size; x += 12) {
        const w = 11 + ((hash(seed, x, y, "w") % 3 + 3) % 3);
        const h = 10 + ((hash(seed, x, y, "h") % 3 + 3) % 3);
        ctx.fillStyle = (x + y + seed) % 4 === 0 ? "#65705d" : (x + seed) % 3 === 0 ? "#4c5548" : "#566050";
        ctx.fillRect(x + 1, y + 1, Math.min(w, size - x - 2), Math.min(h, size - y - 2));
        ctx.fillStyle = "rgba(224,232,195,0.12)";
        ctx.fillRect(x + 2, y + 2, Math.min(w - 3, size - x - 4), 2);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(x + 1, y + Math.min(h, size - y - 2), Math.min(w, size - x - 2), 2);
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo((rand(seed + i * 11 + 1) * size) | 0, (rand(seed + i * 13 + 2) * size) | 0);
      ctx.lineTo((rand(seed + i * 17 + 3) * size) | 0, (rand(seed + i * 19 + 4) * size) | 0);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? "rgba(214, 222, 184, 0.22)" : "rgba(0, 0, 0, 0.18)";
      ctx.fillRect((rand(seed + i * 23) * size) | 0, (rand(seed + i * 29) * size) | 0, 2 + (i % 3), 2);
    }
  }

  function drawSandTile(ctx, size, seed) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#e1ca78");
    gradient.addColorStop(0.52, "#bfa95f");
    gradient.addColorStop(1, "#8d7743");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i += 1) {
      ctx.fillStyle = i % 2 ? "#d8c878" : "#8f7c45";
      ctx.fillRect((rand(seed + i * 3) * size) | 0, (rand(seed + i * 9) * size) | 0, 5, 2);
    }
  }

  function drawTileOverlays(ctx, rows) {
    rows.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const px = x * TILE;
        const py = y * TILE;
        if (char === "~") drawWaterEdgeBlend(ctx, rows, x, y, px, py);
        if (char === "s") drawShoreEdgeBlend(ctx, rows, x, y, px, py);
        if (isBlockedTileChar(char)) drawBlockedTileRim(ctx, px, py, char);
        if (shouldDrawWalkableTileCue(char, rows, x, y)) {
          drawWalkableTileCue(ctx, px, py, char);
        }
        if (char === "#" && rows[y + 1]?.[x] && rows[y + 1][x] !== "#") {
          drawWallLedge(ctx, px, py);
        }
        if (char === "_" && y > 0 && rows[y - 1][x] === "#") {
          drawWallShadow(ctx, px, py);
        }
        if ((char === "_" || char === "+") && neighbor(rows, x, y, "#")) {
          drawFloorEdgeTrim(ctx, rows, x, y, px, py);
        }
      });
    });
  }

  function drawRoomEdgeCues(ctx, rows) {
    const exits = (area().exits || []).filter((exit) => ["north", "south", "west", "east"].includes(exit.edge));
    if (currentTheme() !== "floor" || !exits.length || !rows?.length) return;
    const width = mapWidth() * TILE;
    const height = mapHeight() * TILE;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255, 224, 138, 0.18)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(255, 221, 154, 0.42)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(4, 7, 10, 0.72)";
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 7, width - 14, height - 14);
    exits.forEach((exit) => drawRoomExitCue(ctx, rows, exit.edge));
    ctx.restore();
  }

  function drawRoomExitCue(ctx, rows, edge) {
    roomExitRuns(rows, edge).forEach((run) => {
      const horizontal = edge === "north" || edge === "south";
      const start = run.start * TILE;
      const length = (run.end - run.start + 1) * TILE;
      const fixed = run.fixed * TILE;
      const cx = horizontal ? start + length / 2 : fixed + TILE / 2;
      const cy = horizontal ? fixed + TILE / 2 : start + length / 2;
      const bandInset = 9;
      ctx.save();
      ctx.shadowColor = "rgba(255, 224, 138, 0.32)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "rgba(255, 221, 154, 0.18)";
      ctx.strokeStyle = "rgba(255, 232, 153, 0.84)";
      ctx.lineWidth = 3;
      if (edge === "south") {
        fillRoundRect(ctx, start + bandInset, fixed + TILE - 15, Math.max(18, length - bandInset * 2), 14, 7, "rgba(255, 221, 154, 0.18)", "rgba(255, 232, 153, 0.72)");
        drawExitChevron(ctx, cx, fixed + TILE + 17, edge);
      } else if (edge === "north") {
        fillRoundRect(ctx, start + bandInset, fixed + 1, Math.max(18, length - bandInset * 2), 14, 7, "rgba(255, 221, 154, 0.18)", "rgba(255, 232, 153, 0.72)");
        drawExitChevron(ctx, cx, fixed - 17, edge);
      } else if (edge === "east") {
        fillRoundRect(ctx, fixed + TILE - 15, start + bandInset, 14, Math.max(18, length - bandInset * 2), 7, "rgba(255, 221, 154, 0.18)", "rgba(255, 232, 153, 0.72)");
        drawExitChevron(ctx, fixed + TILE + 17, cy, edge);
      } else if (edge === "west") {
        fillRoundRect(ctx, fixed + 1, start + bandInset, 14, Math.max(18, length - bandInset * 2), 7, "rgba(255, 221, 154, 0.18)", "rgba(255, 232, 153, 0.72)");
        drawExitChevron(ctx, fixed - 17, cy, edge);
      }
      ctx.restore();
    });
  }

  function roomExitRuns(rows, edge) {
    const cols = mapWidth();
    const rowCount = mapHeight();
    const passable = [];
    const addTile = (x, y, dx, dy) => {
      const char = rows[y]?.[x];
      if (char && tilePassable(x, y, dx, dy)) passable.push(edge === "north" || edge === "south" ? x : y);
    };
    if (edge === "north") {
      for (let x = 0; x < cols; x += 1) addTile(x, 0, 0, -1);
      return contiguousRuns(passable, 0);
    }
    if (edge === "south") {
      for (let x = 0; x < cols; x += 1) addTile(x, rowCount - 1, 0, 1);
      return contiguousRuns(passable, rowCount - 1);
    }
    if (edge === "west") {
      for (let y = 0; y < rowCount; y += 1) addTile(0, y, -1, 0);
      return contiguousRuns(passable, 0);
    }
    if (edge === "east") {
      for (let y = 0; y < rowCount; y += 1) addTile(cols - 1, y, 1, 0);
      return contiguousRuns(passable, cols - 1);
    }
    return [];
  }

  function contiguousRuns(values, fixed) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const runs = [];
    sorted.forEach((value) => {
      const last = runs[runs.length - 1];
      if (last && value === last.end + 1) last.end = value;
      else runs.push({ start: value, end: value, fixed });
    });
    return runs;
  }

  function drawExitChevron(ctx, cx, cy, edge) {
    const sign = edge === "south" || edge === "east" ? 1 : -1;
    const horizontal = edge === "east" || edge === "west";
    ctx.save();
    ctx.strokeStyle = "rgba(255, 232, 153, 0.92)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 2; i += 1) {
      const offset = sign * i * 10;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(cx - sign * 8 + offset, cy - 13);
        ctx.lineTo(cx + sign * 5 + offset, cy);
        ctx.lineTo(cx - sign * 8 + offset, cy + 13);
      } else {
        ctx.moveTo(cx - 13, cy - sign * 8 + offset);
        ctx.lineTo(cx, cy + sign * 5 + offset);
        ctx.lineTo(cx + 13, cy - sign * 8 + offset);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function shouldDrawWalkableTileCue(char, rows, x, y) {
    if (currentTheme() === "floor") {
      return char === "@" || (char && !tileInfo[char] && eventMarkerHasPathUnderlay(char, rows, x, y));
    }
    if ((state.areaId === "merfolkShoals" || state.areaId === "tideCavern") && char === "s") return false;
    return isPathLikeTileChar(char) || (isWalkableTileCharForCue(char) && neighborBlockedTile(rows, x, y));
  }

  function waterEdgeTouchesLand(rows, x, y) {
    const char = rows?.[y]?.[x];
    if (!char || char === "~") return false;
    if (waterBridgeAt(rows, x, y, char)) return false;
    return true;
  }

  function drawWaterEdgeBlend(ctx, rows, x, y, px, py) {
    const sides = [
      [0, -1, "top"],
      [1, 0, "right"],
      [0, 1, "bottom"],
      [-1, 0, "left"]
    ];
    ctx.save();
    sides.forEach(([dx, dy, side]) => {
      if (!waterEdgeTouchesLand(rows, x + dx, y + dy)) return;
      const foam = ctx.createLinearGradient(
        px,
        py,
        px + (side === "left" ? 10 : side === "right" ? TILE - 10 : 0),
        py + (side === "top" ? 10 : side === "bottom" ? TILE - 10 : 0)
      );
      foam.addColorStop(0, "rgba(244, 232, 164, 0.46)");
      foam.addColorStop(1, "rgba(244, 232, 164, 0)");
      ctx.fillStyle = foam;
      if (side === "top") ctx.fillRect(px, py, TILE, 9);
      if (side === "bottom") ctx.fillRect(px, py + TILE - 9, TILE, 9);
      if (side === "left") ctx.fillRect(px, py, 9, TILE);
      if (side === "right") ctx.fillRect(px + TILE - 9, py, 9, TILE);
    });
    ctx.restore();
  }

  function drawShoreEdgeBlend(ctx, rows, x, y, px, py) {
    const sides = [
      [0, -1, "top"],
      [1, 0, "right"],
      [0, 1, "bottom"],
      [-1, 0, "left"]
    ];
    ctx.save();
    ctx.fillStyle = "rgba(78, 159, 178, 0.24)";
    sides.forEach(([dx, dy, side]) => {
      if (rows?.[y + dy]?.[x + dx] !== "~") return;
      if (side === "top") ctx.fillRect(px, py, TILE, 7);
      if (side === "bottom") ctx.fillRect(px, py + TILE - 7, TILE, 7);
      if (side === "left") ctx.fillRect(px, py, 7, TILE);
      if (side === "right") ctx.fillRect(px + TILE - 7, py, 7, TILE);
    });
    ctx.restore();
  }

    function drawAreaDecor(ctx) {
      const id = state.areaId;
    if (id === "darhynCastle") {
      drawCarpet(ctx, 9, 8, 7, 10, "#7b1018");
      drawCarpet(ctx, 12, 6, 1, 3, "#651018");
      drawOrbPool(ctx, 12, 3);
      drawThrone(ctx, 12, 9);
      [[10, 1], [14, 1], [8, 7], [16, 7]].forEach(([x, y]) => drawDarhynFlameBrazier(ctx, x, y));
      [[5, 9], [19, 9]].forEach(([x, y]) => drawStatue(ctx, x, y, "angel"));
      [[7, 12], [17, 12], [7, 15], [17, 15]].forEach(([x, y]) => drawColumn(ctx, x, y));
      [[11, 19], [13, 19]].forEach(([x, y]) => drawStairs(ctx, x, y));
      } else if (id === "marhynHalls") {
        drawCarpet(ctx, 11, 6, 1, 9, "rgba(23, 52, 93, 0.72)");
        drawCarpet(ctx, 10, 7, 3, 1, "rgba(23, 52, 93, 0.72)");
        [[4, 3], [18, 3], [4, 13], [18, 13]].forEach(([x, y]) => drawColumn(ctx, x, y));
        [[7, 5], [15, 5], [7, 11], [15, 11]].forEach(([x, y]) => drawTorch(ctx, x, y, "#54b8ff"));
        [[5, 7], [17, 7]].forEach(([x, y]) => drawStatue(ctx, x, y, "beast"));
      } else if (worldAreaId(id) === "marhynCastle") {
        [[4, 3], [18, 3], [4, 13], [18, 13]].forEach(([x, y]) => drawTorch(ctx, x, y, "#54b8ff"));
        } else if (id === "rathskeller") {
          drawCarpet(ctx, 15, 1, 1, 21, "rgba(140, 15, 24, 0.76)");
          drawCarpet(ctx, 9, 20, 13, 1, "rgba(140, 15, 24, 0.66)");
          [[3, 3], [27, 3], [11, 7], [19, 7], [3, 17], [27, 17]].forEach(([x, y]) => drawColumn(ctx, x, y));
          [[7, 3], [23, 3], [7, 7], [23, 7], [8, 17], [22, 17]].forEach(([x, y]) => drawTorch(ctx, x, y, "#ff5638"));
          [[5, 13], [25, 13]].forEach(([x, y]) => drawStatue(ctx, x, y, "beast"));
    } else if (id === "merfolkShoals") {
      drawOrbPool(ctx, 11, 2);
      [[6, 5], [16, 5], [6, 12], [16, 12]].forEach(([x, y]) => drawCoral(ctx, x, y));
    } else if (id === "skyShrine") {
      drawSkyShrineDecor(ctx);
    } else if (id === "tealsburg") {
      drawCarpet(ctx, 8, 3, 7, 3, "#7b1018");
      [[6, 4], [16, 4], [6, 12], [16, 12]].forEach(([x, y]) => drawColumn(ctx, x, y));
        [[5, 8], [17, 8]].forEach(([x, y]) => drawBanner(ctx, x, y, "#c42130"));
      } else if (id === "breshen") {
        drawCarpet(ctx, 8, 4, 5, 2, "#55783a");
        [[6, 4], [16, 4], [6, 12], [16, 12]].forEach(([x, y]) => drawColumn(ctx, x, y));
        [[5, 8], [17, 8]].forEach(([x, y]) => drawBanner(ctx, x, y, "#78a64f"));
      } else if (id === "freeton") {
        [[4, 5], [18, 5], [7, 13], [15, 13]].forEach(([x, y]) => drawBarrel(ctx, x, y));
        drawRuneCircle(ctx, 11, 8);
      }
      }

  function drawSkyShrineDecor(ctx) {
    drawSkyShrineTerrace(ctx, 11, 8);
    drawSkyShrineArch(ctx, 11, 7);
    [[7, 7], [15, 7], [7, 9], [15, 9]].forEach(([x, y]) => drawSkyShrineBrazier(ctx, x, y));
    [[5, 7], [17, 7], [5, 9], [17, 9]].forEach(([x, y]) => drawSkyShrineRailingPost(ctx, x, y));
  }

  function drawSkyShrineTerrace(ctx, tx, ty) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const now = Date.now();
    const pulse = Math.sin(now / 900) * 0.5 + 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "source-over";
    drawSoftShadow(ctx, 0, 38, 260, 26);
    const slab = ctx.createRadialGradient(0, -16, 30, 0, 0, 292);
    slab.addColorStop(0, "#f1eee0");
    slab.addColorStop(0.48, "#c9c5b4");
    slab.addColorStop(1, "rgba(105, 111, 110, 0.62)");
    ctx.fillStyle = slab;
    ctx.beginPath();
    ctx.ellipse(0, 10, 300, 104, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 232, 153, 0.82)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 10, 286, 94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(30, 42, 54, 0.35)";
    ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 56, -72);
      ctx.quadraticCurveTo(i * 38, 10, i * 56, 90);
      ctx.stroke();
    }
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 10, 88 + i * 76, 28 + i * 24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawSkyShrineStar(ctx, 0, 8, 72, pulse);
    ctx.restore();
  }

  function drawSkyShrineStar(ctx, x, y, radius, pulse) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, radius * 1.28);
    glow.addColorStop(0, `rgba(191, 244, 255, ${0.34 + pulse * 0.14})`);
    glow.addColorStop(0.44, "rgba(91, 190, 255, 0.18)");
    glow.addColorStop(1, "rgba(91, 190, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(24, 77, 119, 0.9)";
    ctx.fillStyle = "rgba(75, 154, 206, 0.74)";
    ctx.lineWidth = 3;
    drawStarPath(ctx, 0, 0, radius, radius * 0.33, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 232, 153, 0.92)";
    ctx.lineWidth = 4;
    drawStarPath(ctx, 0, 0, radius * 0.82, radius * 0.24, 8);
    ctx.stroke();
    ctx.fillStyle = "#f7edb0";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStarPath(ctx, x, y, outerRadius, innerRadius, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 ? innerRadius : outerRadius;
      const angle = -Math.PI / 2 + i * Math.PI / points;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawSkyShrineArch(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.save();
    ctx.translate(x, y);
    drawSoftShadow(ctx, 0, 38, 72, 12);
    ctx.strokeStyle = "rgba(33, 52, 67, 0.84)";
    ctx.lineWidth = 21;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-46, 34);
    ctx.lineTo(-46, -10);
    ctx.quadraticCurveTo(0, -72, 46, -10);
    ctx.lineTo(46, 34);
    ctx.stroke();
    ctx.strokeStyle = "#ddd7c5";
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-46, 34);
    ctx.lineTo(-46, -10);
    ctx.quadraticCurveTo(0, -68, 46, -10);
    ctx.lineTo(46, 34);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 232, 153, 0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-47, 35);
    ctx.lineTo(-47, -8);
    ctx.quadraticCurveTo(0, -59, 47, -8);
    ctx.lineTo(47, 35);
    ctx.stroke();
    drawSkyShrineStar(ctx, 0, -70, 22, Math.sin(Date.now() / 700) * 0.5 + 0.5);
    ctx.restore();
  }

  function drawSkyShrineBrazier(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    const seed = hash("sky-shrine-brazier", tx, ty);
    const now = Date.now();
    const flicker = Math.sin(now / 130 + seed) * 0.18;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, -13, 4, 0, -13, 44 + flicker * 8);
    glow.addColorStop(0, "rgba(222, 251, 255, 0.58)");
    glow.addColorStop(0.48, "rgba(84, 198, 255, 0.2)");
    glow.addColorStop(1, "rgba(84, 198, 255, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, -13, 42, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    drawSoftShadow(ctx, 0, 26, 20, 5);
    fillRoundRect(ctx, -13, 6, 26, 18, 5, "#bfb9a5", "rgba(31, 42, 51, 0.72)");
    fillRoundRect(ctx, -19, -2, 38, 12, 5, "#d9d2be", "rgba(31, 42, 51, 0.72)");
    ctx.fillStyle = "#53c9ff";
    ctx.beginPath();
    ctx.moveTo(flicker * 8, -34);
    ctx.bezierCurveTo(-16, -20, -10, 1, -2, 5);
    ctx.bezierCurveTo(15, -2, 14, -21, flicker * 8, -34);
    ctx.fill();
    ctx.fillStyle = "#effdff";
    ctx.beginPath();
    ctx.moveTo(-2, -25);
    ctx.bezierCurveTo(-7, -13, -5, -2, 0, 2);
    ctx.bezierCurveTo(7, -4, 5, -15, -2, -25);
    ctx.fill();
    ctx.restore();
  }

  function drawSkyShrineRailingPost(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.save();
    ctx.translate(x, y);
    drawSoftShadow(ctx, 0, 24, 18, 5);
    fillRoundRect(ctx, -10, -15, 20, 39, 4, "#d7d1c1", "rgba(28, 41, 52, 0.76)");
    ctx.fillStyle = "rgba(255, 232, 153, 0.72)";
    ctx.fillRect(-13, -18, 26, 5);
    ctx.fillRect(-13, 5, 26, 4);
    ctx.fillStyle = "rgba(81, 168, 224, 0.55)";
    ctx.fillRect(-5, -8, 10, 16);
    ctx.restore();
  }

  function tileCenter(tx, ty) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  function drawColumn(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 21, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c8ccb6";
    ctx.fillRect(-9, -18, 18, 38);
    ctx.fillStyle = "#8f987f";
    ctx.fillRect(-15, -24, 30, 8);
    ctx.fillRect(-15, 17, 30, 8);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-5, -17, 4, 34);
    ctx.restore();
  }

    function drawTorch(ctx, tx, ty, flame) {
      const { x, y } = tileCenter(tx, ty);
      const seed = hash(state.areaId, tx, ty, "torch");
      const now = Date.now();
      const flicker = Math.sin(now / 115 + seed) * 0.18 + Math.sin(now / 67 + seed * 0.3) * 0.1;
      const blueFlame = flame !== "#ff5638";
      ctx.save();
      ctx.translate(x, y);
      const glow = ctx.createRadialGradient(0, -10, 2, 0, -10, 33 + flicker * 8);
      glow.addColorStop(0, blueFlame ? "rgba(218, 251, 255, 0.52)" : "rgba(255, 229, 154, 0.52)");
      glow.addColorStop(0.42, colorWithAlpha(flame, 0.2));
      glow.addColorStop(1, colorWithAlpha(flame, 0));
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, -10, 33 + flicker * 6, 30 + flicker * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      drawSoftShadow(ctx, 0, 23, 16, 4);
      ctx.fillStyle = "rgba(10, 7, 5, 0.28)";
      ctx.beginPath();
      ctx.ellipse(0, -3, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#1d1712";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-13, 3);
      ctx.lineTo(13, 3);
      ctx.moveTo(-10, 8);
      ctx.lineTo(10, 8);
      ctx.stroke();

      const handle = ctx.createLinearGradient(-5, 2, 7, 25);
      handle.addColorStop(0, "#6b4326");
      handle.addColorStop(0.55, "#3e2416");
      handle.addColorStop(1, "#1c120c");
      ctx.strokeStyle = handle;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-5, 7);
      ctx.lineTo(4, 24);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 217, 141, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, 8);
      ctx.lineTo(1, 22);
      ctx.stroke();

      const cup = ctx.createLinearGradient(0, -4, 0, 8);
      cup.addColorStop(0, "#d0b277");
      cup.addColorStop(0.5, "#705131");
      cup.addColorStop(1, "#241811");
      fillRoundRect(ctx, -12, -5, 24, 13, 4, cup, "rgba(17, 11, 8, 0.78)");
      ctx.fillStyle = "rgba(255, 239, 178, 0.32)";
      ctx.fillRect(-8, -3, 16, 2);

      const outer = ctx.createLinearGradient(0, -34, 0, 9);
      outer.addColorStop(0, lighten(flame, 0.36));
      outer.addColorStop(0.45, flame);
      outer.addColorStop(1, darken(flame, 0.58));
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.moveTo(flicker * 7, -36);
      ctx.bezierCurveTo(-15 - flicker * 5, -23, -13, -4, -5, 7);
      ctx.quadraticCurveTo(0, 13, 6, 7);
      ctx.bezierCurveTo(17 + flicker * 4, -5, 12, -24, flicker * 7, -36);
      ctx.fill();

      const inner = ctx.createLinearGradient(0, -26, 0, 7);
      inner.addColorStop(0, blueFlame ? "#effdff" : "#fff1a6");
      inner.addColorStop(0.58, blueFlame ? "#9eefff" : "#ffc35d");
      inner.addColorStop(1, colorWithAlpha(flame, 0.35));
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.moveTo(-2 - flicker * 4, -25);
      ctx.bezierCurveTo(-8, -16, -7, -3, -2, 5);
      ctx.quadraticCurveTo(2, 8, 5, 4);
      ctx.bezierCurveTo(9, -6, 6, -18, -2 - flicker * 4, -25);
      ctx.fill();

      ctx.fillStyle = blueFlame ? "rgba(218, 251, 255, 0.9)" : "rgba(255, 239, 167, 0.9)";
      for (let i = 0; i < 3; i += 1) {
        const sparkSeed = seed + i * 97;
        const sx = (rand(sparkSeed) - 0.5) * 26 + Math.sin(now / (180 + i * 30)) * 3;
        const sy = -25 - rand(sparkSeed + 11) * 15 + Math.sin(now / 120 + i) * 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4 + i * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

  function drawDarhynFlameBrazier(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    const seed = hash(state.areaId, tx, ty, "darhyn-flame");
    const now = Date.now();
    const flicker = Math.sin(now / 92 + seed) * 0.16 + Math.sin(now / 47 + seed * 0.2) * 0.1;
    ctx.save();
    ctx.translate(x, y);

    const aura = ctx.createRadialGradient(0, -14, 4, 0, -14, 48 + flicker * 12);
    aura.addColorStop(0, "rgba(238, 253, 255, 0.58)");
    aura.addColorStop(0.34, "rgba(105, 216, 255, 0.28)");
    aura.addColorStop(1, "rgba(60, 129, 255, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, -14, 43 + flicker * 9, 38 + flicker * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    drawSoftShadow(ctx, 0, 25, 24, 5);
    ctx.strokeStyle = "#0a0c12";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    [[-13, 9, -19, 25], [13, 9, 19, 25], [0, 10, 0, 27]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    const bowl = verticalGradient(ctx, -6, 12, "#59606b", "#08090f");
    ctx.fillStyle = bowl;
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(218, 236, 255, 0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#05070b";
    [-16, 0, 16].forEach((barX) => fillRoundRect(ctx, barX - 2, -7, 4, 12, 2, "#05070b", null));

    const flameShapes = [
      { color: "#44bfff", alpha: 0.95, w: 20, h: 41, y: -7, sway: flicker * 8 },
      { color: "#8df4ff", alpha: 0.86, w: 13, h: 32, y: -5, sway: -flicker * 5 },
      { color: "#f2ffff", alpha: 0.78, w: 7, h: 23, y: -3, sway: flicker * 3 }
    ];
    flameShapes.forEach((flame) => {
      const gradient = ctx.createLinearGradient(0, flame.y - flame.h, 0, flame.y + 8);
      gradient.addColorStop(0, colorWithAlpha(flame.color, flame.alpha));
      gradient.addColorStop(0.62, colorWithAlpha(flame.color, flame.alpha * 0.74));
      gradient.addColorStop(1, "rgba(28, 76, 142, 0.2)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(flame.sway, flame.y - flame.h);
      ctx.bezierCurveTo(-flame.w, flame.y - flame.h * 0.64, -flame.w * 0.7, flame.y - flame.h * 0.1, -4, flame.y + 6);
      ctx.quadraticCurveTo(0, flame.y + 12, 5, flame.y + 6);
      ctx.bezierCurveTo(flame.w * 0.75, flame.y - flame.h * 0.08, flame.w * 0.56, flame.y - flame.h * 0.68, flame.sway, flame.y - flame.h);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(219, 253, 255, 0.82)";
    for (let i = 0; i < 5; i += 1) {
      const sparkSeed = seed + i * 83;
      const drift = Math.sin(now / (160 + i * 19) + sparkSeed) * 4;
      const sx = (rand(sparkSeed) - 0.5) * 28 + drift;
      const sy = -24 - rand(sparkSeed + 7) * 23;
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + rand(sparkSeed + 17) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStatue(ctx, tx, ty, type) {
    const { x, y } = tileCenter(tx, ty);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-20, 19, 40, 7);
    ctx.fillStyle = type === "beast" ? "#596250" : "#80a0a3";
    ctx.fillRect(-14, -24, 28, 42);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(-10, -20, 5, 32);
    if (type === "angel") {
      ctx.fillRect(-24, -12, 12, 20);
      ctx.fillRect(12, -12, 12, 20);
    } else {
      ctx.fillRect(-22, -5, 10, 7);
      ctx.fillRect(12, -5, 10, 7);
    }
    ctx.restore();
  }

  function drawStairs(ctx, tx, ty) {
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "#171719";
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(px + 8, py + 10 + i * 9, 48, 5);
      ctx.fillStyle = i % 2 ? "#2c2c2e" : "#171719";
    }
  }

  function drawMapEffects(ctx) {
    if (!mapEffect || mapEffect.areaId !== state?.areaId) return;
    const elapsed = Date.now() - mapEffect.startedAt;
    const progress = clamp(elapsed / mapEffect.duration, 0, 1);
    if (progress >= 1) {
      mapEffect = null;
      return;
    }
    if (mapEffect.type === "tustorResurrection") drawTustorResurrectionEffect(ctx, mapEffect, progress, elapsed);
  }

  function drawTustorResurrectionEffect(ctx, effect, progress, elapsed) {
    const { x, y } = tileCenter(effect.x, effect.y);
    const pulse = Math.sin(elapsed / 80) * 0.5 + 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y + 8);

    ctx.strokeStyle = `rgba(172, 246, 255, ${0.72 * (1 - progress * 0.35)})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      const radius = 16 + i * 15 + progress * 52;
      ctx.beginPath();
      ctx.ellipse(0, -4, radius, radius * 0.34, Math.sin(elapsed / 420 + i) * 0.16, 0, Math.PI * 2);
      ctx.stroke();
    }

    const beam = ctx.createLinearGradient(0, 28, 0, -132);
    beam.addColorStop(0, "rgba(77, 205, 255, 0)");
    beam.addColorStop(0.42, `rgba(116, 229, 255, ${0.34 + pulse * 0.18})`);
    beam.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-18 - pulse * 6, 26);
    ctx.lineTo(18 + pulse * 6, 26);
    ctx.lineTo(8 + pulse * 8, -132);
    ctx.lineTo(-8 - pulse * 8, -132);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 32; i += 1) {
      const seed = hash(effect.startedAt, i, "tustor");
      const angle = rand(seed) * Math.PI * 2 + progress * 5.4;
      const radius = 10 + rand(seed + 1) * 84 * (0.35 + progress);
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius * 0.42 - progress * 54 + rand(seed + 2) * 12;
      const alpha = Math.max(0, 1 - progress) * (0.25 + rand(seed + 3) * 0.6);
      ctx.fillStyle = `rgba(${170 + Math.round(rand(seed + 4) * 70)}, ${232 + Math.round(rand(seed + 5) * 20)}, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2 + rand(seed + 6) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (progress > 0.26 && !hasFlag("tustorRaised") && characterSheetReady("merwizard")) {
      ctx.save();
      ctx.globalAlpha = clamp((progress - 0.26) / 0.36, 0, 0.78);
      ctx.globalCompositeOperation = "source-over";
      drawCharacterFrame(ctx, x, y + 42 - progress * 36, "merwizard", "down", elapsed, 1.02, "map", { action: "cast", progress });
      ctx.restore();
    }
  }

  function drawCarpet(ctx, tx, ty, tw, th, color) {
    ctx.fillStyle = color;
    ctx.fillRect(tx * TILE + 8, ty * TILE + 8, tw * TILE - 16, th * TILE - 16);
    ctx.strokeStyle = "#d3bd65";
    ctx.lineWidth = 4;
    ctx.strokeRect(tx * TILE + 12, ty * TILE + 12, tw * TILE - 24, th * TILE - 24);
  }

  function drawThrone(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    const pulse = Math.sin(Date.now() / 640) * 0.5 + 0.5;
    ctx.save();
    ctx.translate(x, y);
    drawSoftShadow(ctx, 0, 28, 38, 9);

    const aura = ctx.createRadialGradient(0, -12, 8, 0, -12, 70);
    aura.addColorStop(0, `rgba(93, 210, 255, ${0.14 + pulse * 0.08})`);
    aura.addColorStop(1, "rgba(93, 210, 255, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, -12, 58, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = verticalGradient(ctx, -60, 34, "#252734", "#07070c");
    ctx.beginPath();
    ctx.moveTo(-35, 22);
    ctx.lineTo(-35, -31);
    ctx.quadraticCurveTo(-35, -43, -25, -49);
    ctx.lineTo(-11, -39);
    ctx.quadraticCurveTo(-6, -58, 0, -64);
    ctx.quadraticCurveTo(6, -58, 11, -39);
    ctx.lineTo(25, -49);
    ctx.quadraticCurveTo(35, -43, 35, -31);
    ctx.lineTo(35, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.84)";
    ctx.lineWidth = 3;
    ctx.stroke();

    fillRoundRect(ctx, -24, -38, 48, 57, 8, verticalGradient(ctx, -38, 19, "#9d1420", "#410910"), "rgba(232, 193, 90, 0.64)");
    ctx.strokeStyle = "rgba(255, 225, 128, 0.64)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.quadraticCurveTo(-15, -24, 0, -34);
    ctx.quadraticCurveTo(15, -24, 18, 10);
    ctx.stroke();

    fillRoundRect(ctx, -44, -4, 19, 32, 5, verticalGradient(ctx, -4, 28, "#2b2e3d", "#08080d"), "rgba(209, 174, 77, 0.5)");
    fillRoundRect(ctx, 25, -4, 19, 32, 5, verticalGradient(ctx, -4, 28, "#2b2e3d", "#08080d"), "rgba(209, 174, 77, 0.5)");
    fillRoundRect(ctx, -30, 14, 60, 20, 6, verticalGradient(ctx, 14, 34, "#c41a28", "#540911"), "rgba(238, 199, 92, 0.72)");

    ctx.fillStyle = "#d8b75e";
    ctx.fillRect(-36, 26, 72, 7);
    ctx.fillRect(-31, 30, 10, 19);
    ctx.fillRect(21, 30, 10, 19);
    ctx.fillStyle = "rgba(255, 240, 180, 0.26)";
    ctx.fillRect(-18, -28, 5, 34);
    ctx.fillRect(-2, -31, 4, 39);

    ctx.fillStyle = `rgba(142, 239, 255, ${0.52 + pulse * 0.22})`;
    [-20, 0, 20].forEach((runeX, index) => {
      ctx.beginPath();
      ctx.arc(runeX, -45 + Math.abs(index - 1) * 7, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = `rgba(142, 239, 255, ${0.34 + pulse * 0.16})`;
    ctx.lineWidth = 1.5;
    [-27, 27].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side, -22);
      ctx.lineTo(side * 0.72, 6);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawOrbPool(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#165a85";
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#93e6ff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    for (let i = -25; i <= 25; i += 12) {
      ctx.beginPath();
      ctx.moveTo(-35, i + Math.sin(Date.now() / 220 + i) * 4);
      ctx.lineTo(35, i - Math.sin(Date.now() / 220 + i) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = "#e0a24a";
    ctx.fillRect(-14, -18, 28, 25);
    ctx.fillStyle = "#fff1a8";
    ctx.fillRect(-9, -14, 18, 5);
    ctx.restore();
  }

  function drawCoral(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.strokeStyle = "#d85d78";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x, y - 18);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - 12, y - 16);
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + 12, y - 10);
    ctx.stroke();
    ctx.fillStyle = "#6ad0c8";
    ctx.fillRect(x - 18, y + 15, 36, 5);
  }

  function drawBanner(ctx, tx, ty, color) {
    const { x, y } = tileCenter(tx, ty);
    ctx.fillStyle = "#3a2518";
    ctx.fillRect(x - 2, y - 24, 4, 50);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y - 22, 24, 34);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 6, y - 18, 5, 25);
  }

  function drawBarrel(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.fillStyle = "#815329";
    ctx.fillRect(x - 13, y - 18, 26, 36);
    ctx.strokeStyle = "#d0a65b";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 13, y - 13, 26, 9);
    ctx.strokeRect(x - 13, y + 4, 26, 9);
  }

  function drawRuneCircle(ctx, tx, ty) {
    const { x, y } = tileCenter(tx, ty);
    ctx.strokeStyle = "rgba(126, 215, 255, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 29 + Math.sin(Date.now() / 260) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(232, 208, 100, 0.8)";
    ctx.strokeRect(x - 22, y - 22, 44, 44);
  }

  function drawWallShadow(ctx, px, py) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(px, py, TILE, 10);
  }

  function isBlockedTileChar(char) {
    if (char === "~") return area().theme !== "water";
    return char === "#" || char === "^" || char === "T" || char === "t" || char === "p" || char === "b" || char === "H" || char === "r" || char === "w" || char === "d" || char === "f" || char === "g" || char === "x" || char === "q" || char === "c";
  }

  function isPathLikeTileChar(char) {
    return char === "=" || char === "@" || char === "+" || char === "_" || char === "s";
  }

  function isWalkableTileCharForCue(char) {
    return Boolean(char) && !isBlockedTileChar(char) && char !== "~";
  }

  function neighborBlockedTile(rows, x, y) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
      const char = rows[y + dy]?.[x + dx];
      return Boolean(char) && isBlockedTileChar(char);
    });
  }

  function drawBlockedTileRim(ctx, px, py, char) {
    const structure = ["r", "w", "d", "x", "q", "f", "g"].includes(char);
    ctx.save();
    if (structure) {
      ctx.fillStyle = char === "q" ? "rgba(0, 0, 0, 0.18)" : "rgba(0, 0, 0, 0.14)";
      ctx.fillRect(px, py + TILE - 7, TILE, 7);
      ctx.strokeStyle = char === "d" ? "rgba(248, 216, 139, 0.34)" : "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = char === "d" ? 2 : 1.25;
      ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
      ctx.restore();
      return;
    }
    ctx.fillStyle = char === "~" ? "rgba(3, 16, 27, 0.28)" : "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(px, py + TILE - 8, TILE, 8);
    ctx.strokeStyle = char === "H" ? "rgba(248, 216, 139, 0.34)" : "rgba(0, 0, 0, 0.34)";
    ctx.lineWidth = char === "H" ? 3 : 2;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
    if (char === "H") {
      ctx.fillStyle = "rgba(255, 238, 176, 0.72)";
      ctx.fillRect(px + 27, py + 50, 10, 4);
    }
    ctx.restore();
  }

  function drawWalkableTileCue(ctx, px, py, char) {
    ctx.save();
    ctx.strokeStyle = char === "@" ? "rgba(126, 215, 255, 0.5)" : isPathLikeTileChar(char) ? "rgba(255, 240, 190, 0.28)" : "rgba(255, 240, 190, 0.16)";
    ctx.lineWidth = char === "@" ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(px + 13, py + TILE - 12);
    ctx.lineTo(px + TILE - 13, py + TILE - 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawWallLedge(ctx, px, py) {
    const y = py + TILE - 18;
    const ledge = ctx.createLinearGradient(px, y, px, py + TILE);
    ledge.addColorStop(0, "rgba(181, 190, 160, 0.72)");
    ledge.addColorStop(0.42, "rgba(84, 96, 78, 0.7)");
    ledge.addColorStop(1, "rgba(15, 18, 17, 0.72)");
    ctx.fillStyle = ledge;
    ctx.fillRect(px, y, TILE, 18);
    ctx.strokeStyle = "rgba(230, 238, 198, 0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, y + 1);
    ctx.lineTo(px + TILE, y + 1);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.36)";
    ctx.lineWidth = 1;
    for (let x = px + 8; x < px + TILE; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x + 8, y + 16);
      ctx.stroke();
    }
  }

  function drawFloorEdgeTrim(ctx, rows, tx, ty, px, py) {
    ctx.save();
    ctx.strokeStyle = "rgba(201, 209, 174, 0.25)";
    ctx.lineWidth = 3;
    if (rows[ty - 1]?.[tx] === "#") {
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 4);
      ctx.lineTo(px + TILE - 4, py + 4);
      ctx.stroke();
    }
    if (rows[ty]?.[tx - 1] === "#") {
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 6);
      ctx.lineTo(px + 4, py + TILE - 6);
      ctx.stroke();
    }
    if (rows[ty]?.[tx + 1] === "#") {
      ctx.beginPath();
      ctx.moveTo(px + TILE - 4, py + 6);
      ctx.lineTo(px + TILE - 4, py + TILE - 6);
      ctx.stroke();
    }
    if (rows[ty + 1]?.[tx] === "#") {
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.moveTo(px + 4, py + TILE - 4);
      ctx.lineTo(px + TILE - 4, py + TILE - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSceneActors(ctx) {
    const actors = [...eventDrawActors(), ...partyDrawActors()];
    actors
      .sort((a, b) => a.baseline - b.baseline || a.priority - b.priority || a.sortX - b.sortX)
      .forEach((actor) => actor.draw(ctx));
  }

  function drawEvents(ctx) {
    eventDrawActors()
      .sort((a, b) => a.baseline - b.baseline || a.priority - b.priority || a.sortX - b.sortX)
      .forEach((actor) => actor.draw(ctx));
  }

  function eventDrawActors() {
    return currentEvents().flatMap((event) => {
      if (event.hidden) return [];
      if (!eventShouldRender(event)) return [];
      const kind = eventKind(event);
      if (kind === "npc") {
        const motion = npcMotion(event);
        return [{
          baseline: motion.y,
          sortX: motion.x,
          priority: 1,
          draw: (ctx) => drawNpcSprite(ctx, event, motion)
        }];
      }
      const tile = eventTile(event);
      return [{
        baseline: tile.y * TILE + 56,
        sortX: tile.x * TILE + 32,
        priority: kind === "chest" || kind === "door" ? 0 : 2,
        draw: (ctx) => drawEventSprite(ctx, event)
      }];
    });
  }

  function drawEventSprite(ctx, event, motion) {
    const tile = eventTile(event);
    const px = tile.x * TILE;
    const py = tile.y * TILE;
    const kind = eventKind(event);
    if (kind === "chest") drawChest(ctx, px, py, event.id);
    else if (kind === "door") drawRuneGate(ctx, px, py);
    else if (kind === "shopSign") drawShopSign(ctx, px, py, event);
    else if (kind === "boss") drawMapBoss(ctx, px, py, event);
    else if (kind === "npc") drawNpcSprite(ctx, event, motion);
    else drawMarker(ctx, px, py, event.icon || "!");
  }

  function drawPlayer(ctx) {
    partyDrawActors()
      .sort((a, b) => a.baseline - b.baseline || a.priority - b.priority || a.sortX - b.sortX)
      .forEach((actor) => actor.draw(ctx));
  }

  function partyDrawActors() {
    const lead = leaderVisualTile();
    const { elapsed, progress, eased } = lead;
    const leadX = lead.x;
    const leadY = lead.y;
    const visualParty = mapVisiblePartyMembers();
    const leadId = visualParty[0]?.id || defaultSpriteId();
    const leadFacing = state.facing || "down";
    const leadWalk = mapWalkAnimationState(leadFacing, progress, elapsed);
    const leadPos = { x: leadX, y: leadY };
    const actors = visualParty.slice(1, 4).map((member, index) => {
      const pos = followerPosition(index, eased, progress);
      const nudge = partyFormationNudge(index, pos, leadPos);
      const followBob = pos.walking && !characterSheetReady(member.id) ? Math.sin(progress * Math.PI) * 3.2 : 0;
      const x = pos.x * TILE + 32 + nudge.x;
      const y = pos.y * TILE + 52 + nudge.y - followBob;
      const facing = pos.facing || state.facing || "down";
      return {
        baseline: y,
        sortX: x,
        priority: 3 + index,
        draw: (ctx) => {
          const walkElapsed = pos.walking ? elapsed + index * 55 : 9999;
          const walkProgress = pos.walking && progress < 1 ? progress : null;
          return drawCharacterFrame(ctx, x, y, member.id, facing, walkElapsed, 1.08, "map", {
            walkProgress,
            walkStepParity: (state.steps + index + 1) % 2
          });
        }
      };
    });
    const leadBob = progress < 1 && !characterSheetReady(leadId) ? Math.sin(progress * Math.PI) * 3.8 : 0;
    const leadXpx = leadX * TILE + 32;
    const leadYpx = leadY * TILE + 52 - leadBob;
    actors.push({
      baseline: leadYpx,
      sortX: leadXpx,
      priority: 3,
      draw: (ctx) => {
        return drawCharacterFrame(ctx, leadXpx, leadYpx, leadId, leadFacing, leadWalk.walkElapsed, 1.08, "map", {
          walkProgress: leadWalk.walkProgress,
          walkStepParity: state.steps % 2
        });
      }
    });
    return actors;
  }

  function mapVisiblePartyMembers() {
    const active = activePartyMembers();
    const living = active.filter((member) => member.hp > 0);
    return living.length ? living : active;
  }

  function partyFormationNudge(index, pos, leadPos) {
    const sameColumn = Math.abs(pos.x - leadPos.x) < 0.18 && Math.abs(pos.y - leadPos.y) <= 1.12;
    if (sameColumn) return { x: index % 2 === 0 ? -16 : 16, y: 0 };
    const sameRow = Math.abs(pos.y - leadPos.y) < 0.18 && Math.abs(pos.x - leadPos.x) <= 1.12;
    if (sameRow) return { x: 0, y: index % 2 === 0 ? 4 : -4 };
    return { x: 0, y: 0 };
  }

  function followerPosition(index, eased, progress) {
    const trail = (state.partyTrail || []).filter((step) => step.areaId === state.areaId);
    const target = trail[index];
    const from = trail[index + 1];
    if (target) {
      if (from && progress < 1) {
        return {
          x: lerp(from.x, target.x, eased),
          y: lerp(from.y, target.y, eased),
          facing: target.facing,
          walking: true
        };
      }
      return { ...target, walking: progress < 1 };
    }
    const [dx, dy] = DIRS[state.facing || "down"] || DIRS.down;
    return {
      x: clamp(state.x - dx * (index + 1), 0, mapWidth() - 1),
      y: clamp(state.y - dy * (index + 1), 0, mapHeight() - 1),
      facing: state.facing || "down",
      walking: false
    };
  }

  function drawHeroSprite(ctx, x, y, id, facing, elapsed, scale = 1, options = {}) {
    const style = spriteStyle[id] || spriteStyle[defaultSpriteId()] || Object.values(spriteStyle)[0];
    const isWalking = typeof elapsed === "number" && elapsed < WALK_MS + 100;
    const t = isWalking ? elapsed : 0;
    const walk = isWalking ? Math.sin(t / 46) : 0;
    const lift = isWalking ? Math.abs(Math.sin(t / 46)) * 2 : 0;
    const side = facing === "left" ? -1 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawSoftShadow(ctx, 0, 8, 20, 6);

    if (facing === "up") {
      drawHeroLegs(ctx, walk, "up");
      drawHeroArm(ctx, style, -19, -25 + lift - walk * 4, 12, 7, "up");
      drawHeroArm(ctx, style, 8, -25 + lift + walk * 4, 12, 7, "up");
      drawHeroCloak(ctx, style, -14, -33 + lift, 28, 38, true);
      drawHeroBody(ctx, style, -11, -31 + lift, 22, 29, false);
      drawHeroHair(ctx, style, -14, -51 + lift, 28, 22, "back");
      if (!options.hideWeapon) drawHeroWeapon(ctx, id, facing, t);
    } else if (facing === "left" || facing === "right") {
      ctx.scale(side, 1);
      drawHeroLegs(ctx, walk, "side");
      drawHeroCloak(ctx, style, -16, -34 + lift, 29, 38, false);
      drawHeroArm(ctx, style, -15, -26 + lift - walk * 4.5, 13, 7, "side");
      drawHeroBody(ctx, style, -10, -31 + lift, 22, 31, true);
      drawHeroArm(ctx, style, 8, -24 + lift + walk * 5.5, 14, 7, "side");
      drawHeroHead(ctx, style, -7, -48 + lift, 21, 20, "side");
      if (!options.hideWeapon) drawHeroWeapon(ctx, id, "right", t);
    } else {
      drawHeroLegs(ctx, walk, "down");
      drawHeroCloak(ctx, style, -15, -34 + lift, 30, 38, false);
      drawHeroBody(ctx, style, -12, -31 + lift, 24, 31, true);
      drawHeroArm(ctx, style, -20, -24 + lift - walk * 5, 12, 7, "down");
      drawHeroArm(ctx, style, 8, -24 + lift + walk * 5, 12, 7, "down");
      drawHeroHead(ctx, style, -11, -49 + lift, 22, 21, "front");
      if (!options.hideWeapon) drawHeroWeapon(ctx, id, facing, t);
    }
    ctx.restore();
  }

  function drawCharacterFrame(ctx, x, y, id, facing, elapsed, scale = 1, mode = "map", options = {}) {
    // This is the runtime sprite-sheet seam: every state goes through the same
    // character renderer so idle, walk, and attack never swap art styles.
    if (drawCharacterSheetFrame(ctx, x, y, id, facing, elapsed, scale, mode, options)) return true;
    const adjustedScale = mode === "battle" ? scale * 1.04 : scale;
    drawHeroSprite(ctx, x, y, id, facing, elapsed, adjustedScale, options);
    return true;
  }

  function characterSheetReady(id) {
    const key = characterSheetKeys[id];
    return Boolean(key && imageReady(key));
  }

  function drawCharacterSheetFrame(ctx, x, y, id, facing, elapsed, scale = 1, mode = "map", options = {}) {
    const key = characterSheetKeys[id];
    if (!key || !imageReady(key)) return false;
    const img = artImages[key];
    const [col, row, baseMirrorFrame = false] = characterSheetCell(id, facing, elapsed, { ...options, mode });
    const mirrorFrame = characterSheetFrameMirrored(id, facing, col, row, baseMirrorFrame);
    const sw = img.naturalWidth / characterSheetGrid.cols;
    const sh = img.naturalHeight / characterSheetGrid.rows;
    const crop = characterSheetCropFor(id, row, col);
    const sx = col * sw + crop.left;
    const sy = row * sh + crop.top;
    const sourceW = sw - crop.left - crop.right;
    const sourceH = sh - crop.top - crop.bottom;
    const walking = ((typeof options.walkProgress === "number") || (typeof elapsed === "number" && elapsed < WALK_MS + 140)) && !options.action;
    const sideMapWalking = walking && mode === "map" && (facing === "left" || facing === "right");
    const pulse = walking ? Math.sin(elapsed / 70) : 0;
    const mapBob = sideMapWalking ? 0.12 : 0.45;
    const bob = walking ? Math.abs(pulse) * (mode === "map" ? mapBob : 2.4) : Math.sin(Date.now() / 430) * (mode === "map" ? 0.18 : 1.3);
    const destH = characterSheetDisplayHeight(mode, scale, id);
    const destW = destH * (sourceW / sourceH);
    const frameNudge = characterSheetFrameNudge(id, col, row, destH);
    const drawX = x + frameNudge.x;
    const drawY = y + frameNudge.y;
    const shadowY = drawY + (mode === "map" ? 2 : 4);

    drawSoftShadow(ctx, drawX, shadowY, Math.max(14, destW * 0.2), Math.max(5, destH * 0.045));
    if (mode === "map" && walking) drawMapFootfalls(ctx, drawX, drawY + 2, facing, destH, elapsed);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (walking && mode === "map") {
      const sideLean = facing === "left" ? -1 : facing === "right" ? 1 : 0.35;
      const leanScale = id === "yanOld" ? 0.35 : sideMapWalking ? 0.3 : 1;
      ctx.translate(drawX + Math.sin(elapsed / 92) * 0.55 * leanScale, drawY - bob);
      ctx.rotate(Math.sin(elapsed / 110) * 0.006 * sideLean * leanScale);
    } else if (options.action === "attack") {
      const attackDirection = facing === "left" ? -1 : 1;
      ctx.translate(drawX + Math.sin((options.progress || 0) * Math.PI) * 5 * attackDirection, drawY - bob);
    } else {
      ctx.translate(drawX, drawY - bob);
    }
    if (mirrorFrame) {
      ctx.scale(-1, 1);
    }
    const clipBottom = characterSheetFrameClipBottom(id, row, mode, destH);
    if (clipBottom > 0) {
      ctx.beginPath();
      ctx.rect(-destW / 2 - 6, -destH - 6, destW + 12, destH - clipBottom + 6);
      ctx.clip();
    }
    ctx.drawImage(img, sx, sy, sourceW, sourceH, -destW / 2, -destH, destW, destH);
    ctx.restore();
    return true;
  }

  function characterSheetFrameClipBottom(id, row, mode, destH) {
    if ((id === "derlin" || id === "valena") && row === 3) return destH * 0.1;
    return 0;
  }

  function characterSheetFrameMirrored(id, facing, col, row, baseMirrorFrame = false) {
    return Boolean(baseMirrorFrame || (facing === "right" && row === 0 && col === 2 && mirroredRightIdleIds.has(id)));
  }

  function characterSheetCropFor(id, row, col = 0) {
    if (MERFOLK_SPRITE_IDS.has(id) && row === 2) return { top: 16, right: 6, bottom: 20, left: 6 };
    if (id === "gerthoud" && row === 2) return { top: 0, right: 6, bottom: 52, left: 34 };
    if (id === "yanOld" && row > 2) return defaultCharacterSheetCrop;
    if (id === "valena") {
      const crop = { ...defaultCharacterSheetCrop, bottom: 2 };
      if (row === 1 && (col === 4 || col === 6)) crop.right = 24;
      return crop;
    }
    if (id === "dalin" && row === 0 && col === 6) {
      return { ...(characterSheetCrop[id] || defaultCharacterSheetCrop), left: 9 };
    }
    return characterSheetCrop[id] || defaultCharacterSheetCrop;
  }

  function characterSheetDisplayHeight(mode, scale, id) {
    const base = mode === "battle" ? 176 : mode === "guide" ? 186 : 116;
    const idScale = characterSheetDisplayScale[id]?.[mode] || 1;
    return base * scale * idScale;
  }

  function characterSheetFrameNudge(id, col, row, destH) {
    const nudge = characterSheetFrameNudges[id]?.[`${col}:${row}`];
    if (!nudge) return { x: 0, y: 0 };
    const nudgeScale = destH / (116 * (characterSheetDisplayScale[id]?.map || 1));
    return { x: nudge[0] * nudgeScale, y: nudge[1] * nudgeScale };
  }

  function characterSheetCell(id, facing, elapsed, options = {}) {
    if (id === "gerthoud") return gerthoudCharacterSheetCell(facing, elapsed, options);
    if (id === "tivuCloudwalker") return tivuCloudwalkerCharacterSheetCell(facing, elapsed, options);
    const usesDirectionalRows = characterSheetDirectionalRows.has(id);
    if (options.action === "hurt") {
      if (usesDirectionalRows) return [0, 4];
      if (id === "valena") return [1, 0, true];
      if (id === "yan") return [2, 0];
      return [6, 0];
    }
    if (options.action === "victory") return usesDirectionalRows ? [2, 4] : id === "valena" ? [6, 0] : [7, 0];
    if (options.action === "attack") {
      const progress = typeof options.progress === "number" ? options.progress : ((elapsed || 0) % 560) / 560;
      const attackFrame = Math.min(5, Math.floor(clamp(progress, 0, 0.999) * 6));
      if (usesDirectionalRows) return facing === "left" ? [attackFrame, 3, true] : [attackFrame, 3];
      if (id === "yanOld") return [2, 0];
      if (id === "yvonne" || id === "yvette") {
        const yvonneFrames = [0, 1, 2, 3, 2, 1];
        return [yvonneFrames[attackFrame], 3, facing === "left"];
      }
      if (id === "dalin" || id === "yan") return [attackFrame, 3, facing === "left"];
      if (id === "valena") return [attackFrame, 3, facing === "right"];
      return facing === "left" ? [attackFrame, 4] : [attackFrame, 3];
    }
    if (options.action === "cast" || options.effectType === "heal" || options.effectType === "potion" || options.effectType === "dragonSpell" || options.effectType === "charmShot") {
      const castFrame = Math.floor(((options.progress ?? 0) * 2 + Date.now() / 180) % 2);
      if (usesDirectionalRows) return [4 + castFrame, 3];
      if (id === "dalin" && options.effectType === "heal") return [castFrame ? 4 : 1, 4];
      if (id === "yan" && options.effectType === "dragonSpell") return [castFrame ? 4 : 1, 4];
      if ((id === "yvonne" || id === "yvette") && facing === "down") return [0, 0];
      if (id === "valena" && facing === "down") return [5 + castFrame, 4];
      if (id === "valena") return [castFrame ? 4 : 1, 3, facing === "right"];
      return [6 + castFrame, 4];
    }
    const walking = (typeof options.walkProgress === "number") || (typeof elapsed === "number" && elapsed < WALK_MS + 140);
    if (walking) {
      const walkElapsed = Number.isFinite(elapsed) ? elapsed : 0;
      const phaseOffset = Number.isFinite(options.walkCycleOffset) ? options.walkCycleOffset : 0;
      const frame = typeof options.walkProgress === "number"
        ? (Math.min(3, Math.floor(clamp(options.walkProgress, 0, 0.999) * 4)) + phaseOffset) % 4
        : (Math.min(3, Math.floor(clamp(walkElapsed / Math.max(1, WALK_MS), 0, 0.999) * 4)) + phaseOffset) % 4;
      const stepParity = Math.abs(options.walkStepParity || 0) % 2;
      const stepFrame = typeof options.walkProgress === "number" ? Math.min(1, Math.floor(clamp(options.walkProgress, 0, 0.999) * 2)) : frame % 2;
      if (usesDirectionalRows) {
        if (facing === "up") return [frame, 2];
        const sideFrame = wideStrideDirectionalSheetIds.has(id) ? [0, 2, 4, 6][frame] : frame;
        if (facing === "left") return [sideFrame, 1];
        if (facing === "right") return [sideFrame, 1, true];
        return [frame, 0];
      }
      if (id === "morty" && facing === "up") {
        if (frame === 1) return [7, 1];
        if (frame === 3) return [7, 1, true];
        return [3, 0];
      }
      if (id === "morty" && facing === "down") {
        if (frame === 1) return [1, 1];
        if (frame === 3) return [2, 1];
        return [0, 1];
      }
      if (id === "valena" && facing === "up") {
        return [frame % 2 ? 6 : 4, 1];
      }
      if (id === "valena" && (facing === "left" || facing === "right")) {
        const valenaSideFrames = [4, 6, 4, 6];
        return [valenaSideFrames[frame], 2, facing === "right"];
      }
      if (facing === "down") {
        const contactCol = stepParity === 0 ? 0 : 2;
        return [contactCol + stepFrame, 1];
      }
      if (facing === "up") {
        const contactCol = stepParity === 0 ? 4 : 6;
        return [contactCol + stepFrame, 1];
      }
      if (mirroredSideWalkIds.has(id) && (facing === "left" || facing === "right")) {
        if (id === "morty") return facing === "left" ? [4 + frame, 2] : [frame, 2];
        const contactCol = stepParity === 0 ? 0 : 2;
        if (facing === "left") return stepFrame === 0 ? [contactCol, 2, true] : [1, 0];
        return stepFrame === 0 ? [contactCol, 2] : [2, 0];
      }
      if ((id === "dalin" || id === "yan" || id === "yanOld") && (facing === "left" || facing === "right")) {
        if (id === "dalin") {
          const dalinSideFrames = facing === "left" ? [6, 7, 6, 7] : [1, 2, 1, 2];
          return [dalinSideFrames[frame], 2];
        }
        if (id === "yanOld") return facing === "left" ? [4 + frame, 2] : [frame, 2, true];
        const sideCol = facing === "left" ? 4 + frame : frame;
        return [sideCol, 2];
      }
      if (MERFOLK_SPRITE_IDS.has(id) && (facing === "left" || facing === "right")) {
        const sideCol = facing === "left" ? 4 + frame : frame;
        return [sideCol, 2];
      }
      if (facing === "left") {
        const contactCol = stepParity === 0 ? 4 : 6;
        return stepFrame === 0 ? [contactCol, 2] : [1, 0];
      }
      if (facing === "right") {
        const contactCol = stepParity === 0 ? 0 : 2;
        return stepFrame === 0 ? [contactCol, 2] : [2, 0];
      }
      return [frame, 1];
    }
    if (usesDirectionalRows) {
      if (options.mode === "battle" && (facing === "left" || facing === "right")) {
        if (characterSheetBattleSideIdleIds.has(id)) return facing === "right" ? [0, 1, true] : [0, 1];
        return facing === "left" ? [0, 3, true] : [0, 3];
      }
      if (facing === "up") return [0, 2];
      if (facing === "left") return [0, 1];
      if (facing === "right") return [0, 1, true];
      return [0, 0];
    }
    if (id === "valena") {
      if (facing === "up") return [4, 1];
      if (facing === "down") return [0, 1];
      if (facing === "right") return [1, 0, true];
      return [1, 0];
    }
    if (facing === "up") return [3, 0];
    if (id === "dalin" && facing === "left") return [2, 0, true];
    if (facing === "left") return [1, 0];
    if (facing === "right") return [2, 0];
    return [0, 0];
  }

  function gerthoudCharacterSheetCell(facing, elapsed, options = {}) {
    if (options.action === "hurt") return [5, 3];
    if (options.action === "victory") return [7, 4];
    if (options.action === "attack" || options.action === "cast") return [6, 4];
    const walking = (typeof options.walkProgress === "number") || (typeof elapsed === "number" && elapsed < WALK_MS + 140);
    if (walking) {
      const walkElapsed = Number.isFinite(elapsed) ? elapsed : 0;
      const frame = typeof options.walkProgress === "number"
        ? Math.min(3, Math.floor(clamp(options.walkProgress, 0, 0.999) * 4))
        : Math.min(3, Math.floor(clamp(walkElapsed / Math.max(1, WALK_MS), 0, 0.999) * 4));
      const stepParity = Math.abs(options.walkStepParity || 0) % 2;
      const stepFrame = typeof options.walkProgress === "number" ? Math.min(1, Math.floor(clamp(options.walkProgress, 0, 0.999) * 2)) : frame % 2;
      const verticalCol = stepParity * 2 + stepFrame;
      if (facing === "up") return [verticalCol, 1];
      if (facing === "left") return [frame, 2];
      if (facing === "right") return [frame, 2, true];
      return [verticalCol, 0];
    }
    if (facing === "up") return [0, 1];
    if (facing === "left") return [0, 2];
    if (facing === "right") return [0, 2, true];
    return [0, 0];
  }

  function tivuCloudwalkerCharacterSheetCell(facing, elapsed, options = {}) {
    if (options.action === "hurt") return [2, 3];
    if (options.action === "victory") return [7, 4];
    if (options.action === "attack" || options.action === "cast") return [4, 4];
    const walking = (typeof options.walkProgress === "number") || (typeof elapsed === "number" && elapsed < WALK_MS + 140);
    if (walking) {
      const walkElapsed = Number.isFinite(elapsed) ? elapsed : 0;
      const frame = typeof options.walkProgress === "number"
        ? Math.min(3, Math.floor(clamp(options.walkProgress, 0, 0.999) * 4))
        : Math.min(3, Math.floor(clamp(walkElapsed / Math.max(1, WALK_MS), 0, 0.999) * 4));
      if (facing === "up") return [frame * 2, 1];
      if (facing === "left") return [frame, 2];
      if (facing === "right") return [frame, 2, true];
      return [frame * 2, 0];
    }
    if (facing === "up") return [0, 1];
    if (facing === "left") return [0, 2];
    if (facing === "right") return [0, 2, true];
    return [0, 0];
  }

  function drawSoftShadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = "rgba(0,0,0,0.42)") {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    }
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function verticalGradient(ctx, y1, y2, top, bottom) {
    const gradient = ctx.createLinearGradient(0, y1, 0, y2);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    return gradient;
  }

  function drawHeroCloak(ctx, style, x, y, w, h, back) {
    const cloak = verticalGradient(ctx, y, y + h, lighten(style.cloak, 0.18), darken(style.cloak, 0.56));
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 2);
    ctx.quadraticCurveTo(x + w / 2, y - 4, x + w - 4, y + 2);
    ctx.lineTo(x + w, y + h - 2);
    ctx.quadraticCurveTo(x + w / 2, y + h + 6, x, y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(x + (back ? 8 : 6), y + 7);
    ctx.quadraticCurveTo(x + w / 2, y + h * 0.48, x + w - (back ? 9 : 7), y + h - 3);
    ctx.stroke();
  }

  function drawHeroBody(ctx, style, x, y, w, h, trim) {
    fillRoundRect(ctx, x, y, w, h, 5, verticalGradient(ctx, y, y + h, lighten(style.tunic, 0.22), darken(style.tunic, 0.7)));
    ctx.fillStyle = darken(style.tunic, 0.42);
    ctx.fillRect(x + 4, y + h - 10, w - 8, 4);
    ctx.fillStyle = "#d7b45d";
    ctx.fillRect(x + w / 2 - 2, y + h - 11, 4, 6);
    if (trim) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 4);
      ctx.lineTo(x + w - 5, y + 4);
      ctx.stroke();
    }
  }

  function drawHeroArm(ctx, style, x, y, w, h) {
    fillRoundRect(ctx, x, y, w, h, 4, verticalGradient(ctx, y, y + h, lighten(style.skin, 0.1), darken(style.skin, 0.78)));
  }

  function drawHeroLegs(ctx, walk, facing) {
    const step = walk * 5;
    const stride = Math.abs(walk) * 3;
    const leftY = facing === "side" ? -stride : step;
    const rightY = facing === "side" ? stride : -step;
    const leftX = facing === "side" ? -10 - walk * 3 : -9;
    const rightX = facing === "side" ? 2 + walk * 3 : 3;
    fillRoundRect(ctx, leftX, -3, 7, 21 + leftY, 3, "#2f2630", null);
    fillRoundRect(ctx, rightX, -3, 7, 21 + rightY, 3, "#231d25", null);
    fillRoundRect(ctx, leftX - 3 - (facing === "side" ? stride : 0), 15 + leftY, 12, 5, 3, "#141116", null);
    fillRoundRect(ctx, rightX - 2 + (facing === "side" ? stride : 0), 15 + rightY, 12, 5, 3, "#141116", null);
  }

  function drawHeroHair(ctx, style, x, y, w, h, mode) {
    fillRoundRect(ctx, x, y, w, h, 8, verticalGradient(ctx, y, y + h, lighten(style.hair, 0.2), darken(style.hair, 0.52)));
    ctx.fillStyle = darken(style.hair, 0.42);
    if (mode === "back") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - 2, w * 0.42, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHeroHead(ctx, style, x, y, w, h, mode) {
    fillRoundRect(ctx, x, y + 5, w, h - 2, 8, verticalGradient(ctx, y, y + h, lighten(style.skin, 0.12), darken(style.skin, 0.72)));
    if (mode === "side") {
      drawHeroHair(ctx, style, x - 2, y, w + 2, 12, "side");
      ctx.fillStyle = style.skin;
      ctx.beginPath();
      ctx.ellipse(x + w - 1, y + 15, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d1a20";
      ctx.beginPath();
      ctx.arc(x + w - 5, y + 13, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawHeroHair(ctx, style, x - 2, y, w + 4, 12, "front");
      ctx.fillStyle = darken(style.hair, 0.45);
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 13, 4, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w - 1, y + 13, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d1a20";
      ctx.beginPath();
      ctx.arc(x + 7, y + 14, 1.8, 0, Math.PI * 2);
      ctx.arc(x + w - 7, y + 14, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(66,34,30,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + h + 1);
      ctx.quadraticCurveTo(x + w / 2, y + h + 4, x + w - 8, y + h + 1);
      ctx.stroke();
    }
  }

  function drawHeroWeapon(ctx, id, facing, elapsed) {
    ctx.save();
    if (facing === "left") ctx.scale(-1, 1);
    const lift = Math.sin(elapsed / 120) * 2;
    if (id === "yvonne") {
      ctx.strokeStyle = "#6f4b2d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(13, -25 + lift);
      ctx.lineTo(37, -26 + lift);
      ctx.stroke();
      ctx.strokeStyle = "#d8c06b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(28, -35 + lift);
      ctx.lineTo(36, -26 + lift);
      ctx.lineTo(28, -17 + lift);
      ctx.stroke();
    } else if (id === "dalin" || id === "valena" || id === "yan") {
      ctx.strokeStyle = "#8e6a36";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(15, -35 + lift);
      ctx.lineTo(18, 2 + lift);
      ctx.stroke();
      ctx.fillStyle = id === "yan" ? "#85d7ff" : "#bde077";
      ctx.beginPath();
      ctx.arc(14, -38 + lift, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (facing === "up") {
      ctx.fillStyle = "#d9c46a";
      fillRoundRect(ctx, 12, -35 + lift, 4, 37, 2, "#d9c46a", null);
      ctx.fillStyle = "#f1e7a6";
      ctx.beginPath();
      ctx.moveTo(14, -45 + lift);
      ctx.lineTo(7, -34 + lift);
      ctx.lineTo(21, -34 + lift);
      ctx.closePath();
      ctx.fill();
    } else if (facing === "right" || facing === "left") {
      fillRoundRect(ctx, 12, -26 + lift, 30, 5, 2, "#d9c46a", null);
      ctx.fillStyle = "#f1e7a6";
      ctx.beginPath();
      ctx.moveTo(44, -24 + lift);
      ctx.lineTo(34, -31 + lift);
      ctx.lineTo(35, -18 + lift);
      ctx.closePath();
      ctx.fill();
    } else {
      fillRoundRect(ctx, 14, -28 + lift, 4, 32, 2, "#d9c46a", null);
      ctx.fillStyle = "#f1e7a6";
      ctx.beginPath();
      ctx.moveTo(16, -38 + lift);
      ctx.lineTo(9, -27 + lift);
      ctx.lineTo(23, -27 + lift);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function darken(hex, amount) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 255) * amount) | 0;
    const g = Math.max(0, ((n >> 8) & 255) * amount) | 0;
    const b = Math.max(0, (n & 255) * amount) | 0;
    return `rgb(${r}, ${g}, ${b})`;
  }

  function lighten(hex, amount) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255);
    const g = ((n >> 8) & 255);
    const b = (n & 255);
    return `rgb(${Math.min(255, r + (255 - r) * amount) | 0}, ${Math.min(255, g + (255 - g) * amount) | 0}, ${Math.min(255, b + (255 - b) * amount) | 0})`;
  }

  function colorWithAlpha(color, alpha) {
    const a = clamp(alpha, 0, 1);
    if (typeof color === "string" && color.startsWith("#")) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split("").map((part) => part + part).join("");
      const n = Number.parseInt(hex, 16);
      if (Number.isFinite(n)) {
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
      }
    }
    return `rgba(255, 233, 122, ${a})`;
  }

  function npcCanWander(event) {
    return Boolean(event && eventKind(event) === "npc" && !stationaryNpcEventIds.has(event.id));
  }

  function npcPatrolTiles(event) {
    const home = eventTile(event);
    if (!npcCanWander(event)) return [home];
    const seed = hash(event.id, state?.areaId || "", "npc-patrol");
    let candidates = npcCandidatePatrolTiles(home, npcPatrolMaxDist(event))
      .map((tile, index) => ({ ...tile, score: hash(seed, index, tile.x, tile.y) }))
      .filter((tile) => (tile.x === home.x || tile.y === home.y) && npcCanUsePatrolTile(tile.x, tile.y, event.id) && npcPatrolSegmentClear(home, tile, event.id))
      .sort((a, b) => a.score - b.score);
    const preferredAxis = npcPreferredPatrolAxis(event);
    if (preferredAxis) {
      const preferred = candidates.filter((tile) => preferredAxis === "vertical" ? tile.x === home.x && tile.y !== home.y : tile.y === home.y && tile.x !== home.x);
      if (preferred.length) candidates = preferred;
    }
    candidates = candidates.slice(0, npcPatrolDestinationCount(event));
    if (!candidates.length) return [home];
    return candidates.flatMap((tile) => [home, { x: tile.x, y: tile.y }]);
  }

  function npcPatrolMaxDist(event) {
    return npcUsesGentlePatrol(event) ? 1 : 2;
  }

  function npcPatrolDestinationCount(event) {
    return npcUsesGentlePatrol(event) ? 1 : 2;
  }

  function npcPreferredPatrolAxis(event) {
    return npcUsesGentlePatrol(event) ? "vertical" : "";
  }

  function npcUsesGentlePatrol(event) {
    return npcSpriteForEvent(event) === "chairmanEor" && (state?.areaId === "merfolkShoals" || state?.areaId === "tideCavern");
  }

  function npcCandidatePatrolTiles(home, maxDist = 2) {
    const seen = new Set([`${home.x},${home.y}`]);
    const candidates = [];
    const queue = [{ x: home.x, y: home.y, dist: 0 }];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      if (current.dist >= maxDist) continue;
      Object.values(DIRS).forEach(([dx, dy]) => {
        const next = { x: current.x + dx, y: current.y + dy, dist: current.dist + 1 };
        const key = `${next.x},${next.y}`;
        if (seen.has(key) || !npcCanStandOnTile(next.x, next.y)) return;
        seen.add(key);
        queue.push(next);
        candidates.push(next);
      });
    }
    return candidates;
  }

  function npcCanUsePatrolTile(x, y, exceptId) {
    return npcCanStandOnTile(x, y) && !partyOccupiesTile(x, y) && !visibleStaticEventAt(x, y, exceptId);
  }

  function npcPatrolSegmentClear(from, to, exceptId) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + dx * step;
      const y = from.y + dy * step;
      if (!npcCanUsePatrolTile(x, y, exceptId)) return false;
    }
    return true;
  }

  function npcCanStandOnTile(x, y) {
    if (!tilePassable(x, y)) return false;
    const char = area().map[y]?.[x];
    if (char === "~" && area().theme !== "water") return false;
    return Boolean(char);
  }

  function partyOccupiesTile(x, y) {
    if (!state) return false;
    if (state.x === x && state.y === y) return true;
    return (state.partyTrail || [])
      .filter((step) => step.areaId === state.areaId)
      .slice(0, Math.max(1, activePartyMembers().length))
      .some((step) => step.x === x && step.y === y);
  }

  function visibleStaticEventAt(x, y, exceptId) {
    return currentEvents().some((event) => {
      if (event.id === exceptId || !eventShouldRender(event)) return false;
      const tile = eventTile(event);
      return tile.x === x && tile.y === y;
    });
  }

  function activeNpcDialogueMotion(event) {
    if (!activeNpcDialogueLock || !event || activeNpcDialogueLock.eventId !== event.id || activeNpcDialogueLock.areaId !== state?.areaId) return null;
    return activeNpcDialogueLock.motion;
  }

  function releasedNpcDialogueMotion(event) {
    const key = npcMotionClockKey(state?.areaId, event?.id);
    const releaseLock = npcDialogueReleaseLocks.get(key);
    if (!releaseLock) return null;
    if (Date.now() < releaseLock.releaseAt) return releaseLock.motion;
    if (Number.isFinite(releaseLock.frozenNow)) {
      npcMotionTimeOffsets.set(key, Math.max(0, Date.now() - releaseLock.frozenNow));
    }
    npcDialogueReleaseLocks.delete(key);
    return null;
  }

  function npcMotionClockKey(areaId, eventId) {
    return `${areaId || ""}:${eventId || ""}`;
  }

  function npcMotionNow(event) {
    const key = npcMotionClockKey(state?.areaId, event?.id);
    return Date.now() - (npcMotionTimeOffsets.get(key) || 0);
  }

  function lockNpcDialogueMotion(event) {
    if (!state || !event || eventKind(event) !== "npc") {
      clearNpcDialogueMotion();
      return;
    }
    const frozenNow = npcMotionNow(event);
    activeNpcDialogueLock = null;
    npcDialogueReleaseLocks.delete(npcMotionClockKey(state.areaId, event.id));
    const motion = npcMotion(event, frozenNow);
    const facing = event.staticPose
      ? npcDefaultFacing(event)
      : directionTowardPoint((motion.x - 32) / TILE, (motion.y - 50) / TILE, state.x, state.y);
    activeNpcDialogueLock = {
      eventId: event.id,
      areaId: state.areaId,
      frozenNow,
      motion: {
        ...motion,
        occupiedTiles: (motion.occupiedTiles || [{ x: motion.tileX, y: motion.tileY }]).map((tile) => ({ ...tile })),
        facing,
        elapsed: 9999,
        moving: false
      }
    };
    markRenderDirty("map");
  }

  function clearNpcDialogueMotion() {
    if (!activeNpcDialogueLock) return;
    const { areaId, eventId, frozenNow, motion } = activeNpcDialogueLock;
    const key = npcMotionClockKey(areaId, eventId);
    npcDialogueReleaseLocks.set(key, {
      frozenNow,
      releaseAt: Date.now() + NPC_DIALOGUE_RELEASE_PAUSE_MS,
      motion: {
        ...motion,
        occupiedTiles: (motion.occupiedTiles || []).map((tile) => ({ ...tile }))
      }
    });
    activeNpcDialogueLock = null;
    markRenderDirty("map");
  }

  function npcMotion(event, nowOverride = null) {
    const lockedMotion = activeNpcDialogueMotion(event);
    if (lockedMotion) return lockedMotion;
    const releasedMotion = releasedNpcDialogueMotion(event);
    if (releasedMotion) return releasedMotion;
    const seed = hash(event.id, "npc-motion");
    const home = eventTile(event);
    if (reducedMotionEnabled()) {
      return {
        x: home.x * TILE + 32,
        y: home.y * TILE + 50,
        tileX: home.x,
        tileY: home.y,
        occupiedTiles: [home],
        facing: npcDefaultFacing(event),
        elapsed: 9999,
        moving: false
      };
    }
    const now = Number.isFinite(nowOverride) ? nowOverride : npcMotionNow(event);
    const walkElapsed = ((now / NPC_WALK_ANIMATION_DIVISOR) + seed) % WALK_MS;
    if (!npcCanWander(event)) {
      return {
        x: home.x * TILE + 32,
        y: home.y * TILE + 50,
        tileX: home.x,
        tileY: home.y,
        occupiedTiles: [home],
        facing: npcDefaultFacing(event),
        elapsed: 9999,
        moving: false
      };
    }

    const points = npcPatrolTiles(event);
    if (points.length < 2) {
      return {
        x: home.x * TILE + 32,
        y: home.y * TILE + 50,
        tileX: home.x,
        tileY: home.y,
        occupiedTiles: [home],
        facing: npcDefaultFacing(event),
        elapsed: 9999,
        moving: false
      };
    }

    const timing = npcMotionTiming(event, seed);
    const segmentMs = timing.segmentMs;
    const pauseMs = timing.pauseMs;
    const stepMs = segmentMs + pauseMs;
    const cycle = points.length * stepMs;
    const tick = (now + seed) % cycle;
    const index = Math.floor(tick / stepMs);
    const local = tick - index * stepMs;
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const moving = local < segmentMs;
    const t = moving ? smoothStep(local / segmentMs) : 1;
    const x = lerp(from.x, to.x, t);
    const y = lerp(from.y, to.y, t);
    const tileX = moving && t < 0.5 ? from.x : to.x;
    const tileY = moving && t < 0.5 ? from.y : to.y;
    const occupiedTiles = moving ? [from, to] : [to];
    return {
      x: x * TILE + 32,
      y: y * TILE + 50,
      tileX,
      tileY,
      occupiedTiles,
      facing: moving ? directionFromDelta(to.x - from.x, to.y - from.y) : npcDefaultFacing(event),
      elapsed: moving ? walkElapsed : 9999,
      moving
    };
  }

  function npcMotionTiming(event, seed) {
    if (npcUsesGentlePatrol(event)) {
      return {
        segmentMs: 5200 + (seed % 1200),
        pauseMs: 3600 + (seed % 1600)
      };
    }
    return {
      segmentMs: 2800 + (seed % 900),
      pauseMs: 850 + (seed % 450)
    };
  }

  function npcDefaultFacing(event) {
    const tile = eventTile(event);
    if (state?.completedEvents?.[event.id] && event.completedFacing) return event.completedFacing;
    if (event.facePlayer && state?.areaId === areaIdForEvent(event)) return directionTowardPoint(tile.x, tile.y, state.x, state.y);
    if (event.facing) return event.facing;
    if (event.icon === "Y") return "left";
    if (event.icon === "V" || event.icon === "E" || event.icon === "K") return "down";
    if (event.icon === "T" || event.icon === "Z") return "down";
    return "down";
  }

  function directionTowardPoint(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    if (dy < 0) return "up";
    return "down";
  }

  function areaIdForEvent(target) {
    const activeArea = area();
    return activeArea?.events?.includes(target) ? state.areaId : "";
  }

  function drawNpcSprite(ctx, event, motion = npcMotion(event)) {
    const npcId = npcSpriteForEvent(event);
    if (event.id === "king_garkin") {
      drawKingGarkinThroneSprite(ctx, motion, npcId);
      return;
    }
    drawCharacterFrame(ctx, motion.x, motion.y, npcId, motion.facing, motion.elapsed, 0.98, "map");
  }

  function drawKingGarkinThroneSprite(ctx, motion, npcId) {
    const x = motion.x;
    const y = motion.y;
    if (!imageReady("tealsburgThrone")) {
      drawCharacterFrame(ctx, x, y, npcId, "down", 9999, 0.88, "map");
      return;
    }

    const throne = artImages.tealsburgThrone;
    const throneH = TILE * 2.68;
    const throneW = throneH * (throne.naturalWidth / throne.naturalHeight);
    const throneBottom = y + 24;
    const throneTop = throneBottom - throneH;
    const throneLeft = x - throneW / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(throne, throneLeft, throneTop, throneW, throneH);
    ctx.restore();

    drawCharacterFrame(ctx, x, y + 18, npcId, "down", 9999, 0.82, "map");

    const frontStart = throne.naturalHeight * 0.88;
    const frontH = throne.naturalHeight - frontStart;
    const destFrontY = throneTop + throneH * 0.88;
    const destFrontH = throneH * 0.12;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      throne,
      0,
      frontStart,
      throne.naturalWidth,
      frontH,
      throneLeft,
      destFrontY,
      throneW,
      destFrontH
    );
    ctx.restore();
  }

  function npcSpriteForEvent(event) {
    if (event.id === "tustor_grave") return state && hasFlag("tustorRaised") ? "merwizard" : "chairmanEor";
    return npcSpriteByEventId[event.id] || npcSpriteByIcon(event.icon);
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

  function drawChest(ctx, px, py, id) {
    if (imageReady("chestSprite")) {
      const img = artImages.chestSprite;
      ctx.save();
      ctx.drawImage(img, px + 3, py + 2, TILE - 6, TILE - 6);
      ctx.restore();
      return;
    }
    let sheetKey = activeTileSheetKey();
    if (!imageReady(sheetKey)) sheetKey = tileSheet.key;
    if (imageReady(sheetKey) && tileSheet.cells.crate) {
      const img = artImages[sheetKey];
      const cell = tileSheet.cells.crate;
      const sw = img.naturalWidth / tileSheet.cols;
      const sh = img.naturalHeight / tileSheet.rows;
      const inset = Math.max(1, Math.min(sw, sh) * 0.012);
      ctx.save();
      ctx.drawImage(img, cell[0] * sw + inset, cell[1] * sh + inset, sw - inset * 2, sh - inset * 2, 2, 2, TILE - 4, TILE - 4);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(px + 15, py + 24);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(2, 27, 32, 7);
    ctx.fillStyle = "#7a3f1f";
    ctx.fillRect(0, 12, 36, 22);
    ctx.fillStyle = "#b96e32";
    ctx.fillRect(2, 14, 32, 8);
    ctx.fillStyle = "#d9bb59";
    ctx.fillRect(16, 12, 5, 22);
    ctx.fillRect(0, 21, 36, 4);
    ctx.fillStyle = "#201816";
    ctx.fillRect(17, 23, 3, 5);
    ctx.restore();
  }

  function drawRuneGate(ctx, px, py) {
    ctx.fillStyle = "#7b67b6";
    ctx.fillRect(px + 18, py + 8, 28, 48);
    ctx.strokeStyle = "#ebd06f";
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 20, py + 10, 24, 44);
    ctx.fillStyle = "#71d4ff";
    ctx.fillRect(px + 30, py + 28, 5, 5);
  }

  function drawShopSign(ctx, px, py, event) {
    const sway = Math.sin(Date.now() / 460 + hash(event.id, "sign")) * 1.3;
    ctx.save();
    ctx.translate(px + 32, py + 54);
    ctx.rotate(sway * 0.012);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4b2d1b";
    ctx.fillRect(-3, -26, 6, 30);
    fillRoundRect(ctx, -25, -49, 50, 25, 4, "#b9783e", "rgba(38, 22, 13, 0.78)");
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-19, -44, 38, 4);
    if (event.signIcon === "stable") {
      drawStableSignIcon(ctx);
    } else {
      ctx.fillStyle = "#25170e";
      ctx.font = "bold 12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(event.signText || "SHOP", 0, -36);
    }
    ctx.fillStyle = "#e7c365";
    ctx.beginPath();
    ctx.arc(-17, -36, 2.5, 0, Math.PI * 2);
    ctx.arc(17, -36, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStableSignIcon(ctx) {
    ctx.save();
    ctx.translate(0, -36);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#25170e";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 1, 9, Math.PI * 0.16, Math.PI * 0.84, true);
    ctx.stroke();
    ctx.fillStyle = "#25170e";
    [-6, 6].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, 8, 1.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = "#e8c96d";
    ctx.lineWidth = 1.5;
    [-12, -8, 8, 12].forEach((x, index) => {
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + (index < 2 ? 4 : -4), -5);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawMapBoss(ctx, px, py, event) {
    const icon = event.icon;
    const id = event.id;
    const y = py + 64 + Math.sin(Date.now() / 290 + hash(id, icon, "boss")) * 3;
    if (event.boss === "darhyn" || event.boss === "dreamDarhyn") {
      drawDarhynMapBoss(ctx, px + 32, y, event.boss);
      return;
    }
    if (event.boss === "corizaz" && drawCustomEnemyImage(ctx, event.boss, px + 32, y + 4, 0.42, { facing: "right", mode: "map" })) {
      return;
    }
    if (event.boss === "corizaz") {
      drawCorizazSprite(ctx, px + 32, y + 4, 0.62, "map", "down");
      return;
    }
    if (event.boss === "yvette") {
      drawTwinThievesModel(ctx, px + 32, y - 2, 0.44, "map");
      return;
    }
    if (event.boss === "hano" && drawCustomEnemyImage(ctx, event.boss, px + 32, y, 0.38, { facing: "right", mode: "map" })) {
      return;
    }
    if (event.boss === "hano") {
      drawHanoSprite(ctx, px + 32, y, 0.62, "map");
      return;
    }
    if (event.boss && drawGeneratedEnemyModel(ctx, event.boss, px + 32, y, mapBossScale(event.boss), { facing: "right" })) return;
    if (icon === "B") drawCow(ctx, px + 32, y - 17, event.boss === "oldBetsy" ? 0.76 : 0.55);
    else if (icon === "D") drawDarhyn(ctx, px + 32, y - 17, event.boss ? 0.72 : 0.45, event.boss === "darhyn" || event.boss === "dreamDarhyn");
    else if (icon === "L") drawKnight(ctx, px + 32, y - 17, 0.48);
    else if (icon === "F") drawFear(ctx, px + 32, y - 17, 0.45);
    else if (icon === "R") drawSlime(ctx, px + 32, y - 17, 0.58);
    else if (icon === "P") drawWizard(ctx, px + 32, y - 17, 0.48);
    else if (icon === "W") drawFear(ctx, px + 32, y - 17, 0.48);
    else if (icon === "X") drawMole(ctx, px + 32, y - 17, 0.58);
    else drawKnight(ctx, px + 32, y, 0.45);
  }

  function mapBossScale(enemyId) {
    if (enemyId === "darhyn") return 1.18;
    if (enemyId === "dreamDarhyn") return 1.04;
    if (enemyId === "oldBetsy") return 0.56;
    if (enemyId === "lithar1" || enemyId === "lithar2" || enemyId === "hano") return 0.42;
    if (enemies[enemyId]?.boss) return 0.38;
    return 0.34;
  }

  function drawDarhynMapBoss(ctx, x, y, enemyId) {
    if (imageReady("enemyAtlas")) {
      const img = artImages.enemyAtlas;
      const cell = enemyAtlasCells[enemyId] || enemyAtlasCells.darhyn;
      const sw = img.naturalWidth / 4;
      const sh = img.naturalHeight / 2;
      const crop = enemyAtlasCellCrop[enemyId] || {};
      const sourceX = cell[0] * sw + (crop.left || 0);
      const sourceY = cell[1] * sh + (crop.top || 0);
      const sourceW = sw - (crop.left || 0) - (crop.right || 0);
      const sourceH = sh - (crop.top || 0) - (crop.bottom || 0);
      const height = enemyId === "darhyn" ? 220 : 198;
      const width = height * (sw / sh);
      const drawW = width * (sourceW / sw);
      const drawH = height * (sourceH / sh);
      const breathing = 1 + Math.sin(Date.now() / 330) * 0.014;
      drawSoftShadow(ctx, x, y + 5, width * 0.34, Math.max(7, height * 0.04));
      ctx.save();
      ctx.translate(x, y + Math.sin(Date.now() / 280) * 1.4);
      ctx.scale(-breathing, 1 / breathing);
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
      return true;
    }
    drawDarhyn(ctx, x, y - 4, enemyId === "darhyn" ? 1.62 : 1.46, true);
    return true;
  }

  function drawMarker(ctx, px, py, icon) {
    ctx.fillStyle = "#ffe97a";
    ctx.beginPath();
    ctx.arc(px + 32, py + 24 + Math.sin(Date.now() / 180) * 3, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#21160c";
    ctx.font = "bold 20px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(icon, px + 32, py + 31);
  }

  function drawWorldTerrain(ctx, w, h) {
    const frame = worldMapFrame(w, h);
    ctx.fillStyle = "#d8c493";
    ctx.fillRect(0, 0, w, h);
    if (imageReady("daranorMap")) {
      const img = artImages.daranorMap;
      ctx.save();
      ctx.filter = "sepia(0.42) saturate(1.18) contrast(1.2) brightness(1.08)";
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h);
      ctx.fillStyle = "rgba(120, 76, 33, 0.08)";
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    } else {
      const grd = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h);
      grd.addColorStop(0, "#efe0b6");
      grd.addColorStop(0.55, "#d4bd86");
      grd.addColorStop(1, "#b99761");
      ctx.fillStyle = grd;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      drawRiver(ctx, [
        [frame.x + frame.w * 0.25, frame.y + frame.h * 0.21],
        [frame.x + frame.w * 0.49, frame.y + frame.h * 0.42],
        [frame.x + frame.w * 0.7, frame.y + frame.h * 0.51],
        [frame.x + frame.w * 0.82, frame.y + frame.h * 0.86]
      ], 11);
    }
    ctx.save();
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.8);
    vignette.addColorStop(0, "rgba(255,255,255,0)");
    vignette.addColorStop(1, "rgba(45,24,10,0.24)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(62, 38, 21, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(frame.x + 1.5, frame.y + 1.5, frame.w - 3, frame.h - 3);
    ctx.strokeStyle = "rgba(255, 245, 204, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(frame.x + 7.5, frame.y + 7.5, frame.w - 15, frame.h - 15);
    ctx.restore();
  }

  function drawRiver(ctx, points, width) {
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2d83ac";
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(190,240,255,0.55)";
    ctx.stroke();
  }

  function drawWorldLegend(ctx, w, h) {
    const x = 14;
    const y = h - 68;
    ctx.save();
    fillRoundRect(ctx, x, y, 228, 52, 6, "rgba(24, 17, 12, 0.62)", "rgba(255, 233, 122, 0.24)");
    ctx.font = "bold 12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#f7ead5";
    ctx.fillText("Book map routes", x + 12, y + 18);
    drawLegendDot(ctx, x + 18, y + 36, "#ffe97a", "Current");
    drawLegendDot(ctx, x + 92, y + 36, "#f7ead5", "Known");
    drawLegendDot(ctx, x + 160, y + 36, "#7edbff", "Side");
    ctx.restore();
  }

  function drawLegendDot(ctx, x, y, color, label) {
    ctx.fillStyle = color;
    ctx.strokeStyle = "#16151a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d9cdb7";
    ctx.font = "11px Trebuchet MS, sans-serif";
    ctx.fillText(label, x + 10, y);
  }

  function worldPoints(w = 900, h = 624) {
    return areaOrder
      .map((id) => {
        const point = bookWorldPoints[id];
        return point ? projectBookPoint({ id, ...point }, w, h) : null;
      })
      .filter(Boolean);
  }

  function worldLinks() {
    return [
      ["darhynCastle", "krendon", [[333, 70], [264, 68], [191, 78], [126, 76]]],
      ["krendon", "krendonRoad", [[96, 70]]],
      ["krendonRoad", "hawkMountains", [[78, 74], [55, 65]]],
      ["krendon", "oldMill", [[67, 69]]],
      ["hawkMountains", "hawkSwitchback", [[34, 78], [42, 98]]],
      ["hawkSwitchback", "merfolkShoals", [[83, 139], [140, 168], [214, 214], [292, 254]]],
      ["hawkMountains", "skyShrine", [[49, 43]]],
      ["merfolkShoals", "grassland", [[302, 253], [265, 228], [226, 191]]],
      ["merfolkShoals", "tideCavern", [[317, 266]]],
      ["grassland", "marhynCastle", [[172, 166], [112, 139], [70, 121]]],
      ["grassland", "moonMarsh", [[192, 184]]],
      ["marhynCastle", "forest", [[89, 112], [140, 100], [198, 78]]],
      ["forest", "deepForest", [[273, 68]]],
      ["deepForest", "freeton", [[273, 110], [234, 165], [180, 220], [130, 248]]],
      ["freeton", "kingsHighway", [[132, 248], [164, 236]]],
      ["kingsHighway", "tealsburg", [[178, 194], [153, 157]]],
      ["tealsburg", "northernPath", [[166, 107], [214, 93]]],
      ["tealsburg", "marketMaze", [[139, 131]]],
      ["northernPath", "breshen", [[288, 86]]],
      ["breshen", "savannah", [[334, 107], [340, 124]]],
      ["savannah", "rathskellerApproach", [[345, 122], [348, 106]]],
      ["rathskellerApproach", "rathskeller", [[364, 77]]],
      ["savannah", "glassCaves", [[321, 171], [292, 221]]]
    ];
  }

  function isAreaKnown(id) {
    if (creatorFlag("revealWorld")) return true;
    if (!state) return id === "krendon" || id === "darhynCastle";
    if (id === state.areaId || id === worldAreaId(state.areaId) || state.completedEvents[`visit_${id}`]) return true;
    if (id === "darhynCastle" || id === "krendon") return true;
    return worldLinks().some(([from, to]) => {
      if (to !== id && from !== id) return false;
      const other = from === id ? to : from;
      return other === state.areaId || state.completedEvents[`visit_${other}`];
    });
  }

  function isAreaVisited(id) {
    if (!state || !areas[id]) return false;
    return id === state.areaId || id === worldAreaId(state.areaId) || Boolean(state.completedEvents[`visit_${id}`]);
  }

  function neighbor(rows, x, y, char) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => rows[y + dy]?.[x + dx] === char);
  }

  function hash(...parts) {
    const str = parts.join("|");
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rand(seed) {
    const x = Math.sin(seed * 999.17) * 10000;
    return x - Math.floor(x);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function smoothStep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function assetKeyForSrc(src) {
    return assetKeyBySrc[src] || "";
  }

  function loadArtAssets(keys) {
    return Promise.all([...new Set(keys || [])].map(loadArtAsset).filter(Boolean));
  }

  function loadArtAsset(key) {
    const src = assets[key];
    if (!key || !src || artImages[key]) return assetLoadPromises[key] || null;
    const img = new Image();
    img.decoding = "async";
    assetLoadPromises[key] = new Promise((resolve) => {
      img.onload = () => {
        handleArtAssetLoaded(key);
        resolve(img);
      };
      img.onerror = () => resolve(null);
    });
    img.src = src;
    artImages[key] = img;
    return assetLoadPromises[key];
  }

  function handleArtAssetLoaded(key) {
    const characterSheetAssetKeys = new Set(Object.values(characterSheetKeys));
    const generatedEnemyAssetKeys = new Set(Object.values(generatedEnemyArt).map((art) => art?.assetKey).filter(Boolean));
    const customEnemyAssetKeys = new Set(Object.values(customEnemyImageKeys));
    if (
      key.startsWith("battle")
      || key === "enemyAtlas"
      || key === "spellAtlas"
      || characterSheetAssetKeys.has(key)
      || generatedEnemyAssetKeys.has(key)
      || customEnemyAssetKeys.has(key)
      || key === "yanDragon"
    ) {
      markRenderDirty("battle");
    }
    if (key === "daranorMap") {
      markRenderDirty("world");
    }
    if (key.startsWith("tilesheet") || key === "chestSprite" || key === "tealsburgThrone" || characterSheetAssetKeys.has(key) || generatedEnemyAssetKeys.has(key) || customEnemyAssetKeys.has(key)) {
      markRenderDirty("map");
    }
    if (visibleElement("guide-modal")) markRenderDirty("guide");
    if (visibleElement("dialogue")) drawDialoguePortrait($("speaker")?.textContent || "Narrator");
    if (key === "guideIcons") {
      drawInventoryIcons(document);
      drawShopItemIcons();
      drawBattleRewardItemIcons();
    }
    if (visibleElement("menu-modal")) {
      drawInventoryIcons($("menu-content"));
      drawShopItemIcons();
      drawBattleRewardItemIcons();
    }
    const itemCanvas = $("item-modal-image");
    if (itemCanvas && visibleElement("item-modal")) drawInventoryItemCanvas(itemCanvas, itemCanvas.dataset.itemModalImage || "item:gold");
    renderVisibleSurfaces();
  }

  function tileSheetKeyForAreaId(areaId) {
    if (worldAreaId(areaId) === "marhynCastle") return "tilesheetCastle";
    if (areaId === "merfolkShoals" || areaId === "tideCavern") return "tilesheetShoals";
    if (villageTileAreaIds.has(areaId)) return "tilesheetVillage";
    const theme = areas[areaId]?.theme;
    if (["grass", "path", "tree", "sand", "mountain"].includes(theme)) return "tilesheetWilds";
    return tileSheet.key;
  }

  function battleBackgroundKeyForAreaId(areaId) {
    const areaSpecific = battleBackgroundByArea[areaId] || battleBackgroundByArea[worldAreaId(areaId)];
    if (areaSpecific) return areaSpecific;
    const a = areas[areaId];
    if (!a) return "battleMeadow";
    if (a.theme === "floor" || areaId === "darhynCastle" || worldAreaId(areaId) === "marhynCastle" || areaId === "rathskeller") return "battleCastle";
    if (a.theme === "water" || a.theme === "sand") return "battleShoals";
    if (a.theme === "mountain") return "battleMountain";
    return "battleMeadow";
  }

  function connectedAreaIds(areaId) {
    const ids = new Set();
    if (!areaId || !areas[areaId]) return ids;
    ids.add(areaId);
    ids.add(worldAreaId(areaId));
    (areas[areaId].exits || []).forEach((exit) => {
      if (areas[exit.to]) ids.add(exit.to);
    });
    const group = areaMiniMapGroups[worldAreaId(areaId)];
    if (group) Object.keys(group.boards || {}).forEach((id) => ids.add(id));
    return ids;
  }

  function characterAssetKeysForIds(ids) {
    const keys = new Set();
    ids.forEach((id) => {
      const key = characterSheetKeys[id];
      if (key) keys.add(key);
    });
    return keys;
  }

  function enemyAssetKeysForIds(ids) {
    const keys = new Set();
    if (ids.some(Boolean)) keys.add("enemyAtlas");
    ids.forEach((id) => {
      const customKey = customEnemyImageKeys[id];
      if (customKey) keys.add(customKey);
      const generated = generatedEnemyArt[id];
      if (generated?.assetKey) keys.add(generated.assetKey);
      if (id === "corizaz") keys.add("corizazSheet");
      if (id === "yvette") {
        keys.add("yvonneSheet");
        keys.add("yvetteSheet");
      }
    });
    return keys;
  }

  function eventAssetKeysForAreaId(areaId) {
    const keys = new Set();
    (areas[areaId]?.events || []).forEach((event) => {
      const kind = state ? eventKind(event) : (eventSpriteKind[event?.icon] || "marker");
      if (kind === "npc" || event.disguiseUntilItem) {
        const npcId = npcSpriteForEvent(event);
        if (npcId === "corizaz" && generatedEnemyArt.corizazAwake) enemyAssetKeysForIds(["corizazAwake"]).forEach((key) => keys.add(key));
        else characterAssetKeysForIds([npcId]).forEach((key) => keys.add(key));
        if (event.id === "tustor_grave") characterAssetKeysForIds(["merwizard"]).forEach((key) => keys.add(key));
        if (event.id === "king_garkin") keys.add("tealsburgThrone");
      }
      if (event.boss) {
        enemyAssetKeysForIds([event.boss, ...(event.battleEnemies || [])]).forEach((key) => keys.add(key));
      }
    });
    return keys;
  }

  function areaAssetKeys(areaId, options = {}) {
    if (!areas[areaId]) return new Set();
    const keys = new Set(["chestSprite", tileSheetKeyForAreaId(areaId)]);
    if (options.includeBattle) keys.add(battleBackgroundKeyForAreaId(areaId));
    (areas[areaId]?.encounters || []).forEach((id) => enemyAssetKeysForIds([id]).forEach((key) => keys.add(key)));
    eventAssetKeysForAreaId(areaId).forEach((key) => keys.add(key));
    return keys;
  }

  function loadAreaAssets(areaId = state?.areaId, options = {}) {
    if (!areaId || !areas[areaId]) return Promise.resolve([]);
    const keys = areaAssetKeys(areaId);
    if (state) characterAssetKeysForIds(state.party.map((member) => member.id)).forEach((key) => keys.add(key));
    const token = ++areaLoadToken;
    if (options.loading !== false && areaId === state?.areaId) setAreaLoading(true, areas[areaId].name);
    const critical = Promise.all([
      loadArtAssets([...keys]),
      preloadAreaBanner(areaId)
    ]).finally(() => {
      if (token === areaLoadToken && areaId === state?.areaId) {
        setAreaLoading(false);
        markRenderDirty("map", "battle");
      }
    });
    if (options.prefetch !== false) critical.then(() => scheduleAdjacentAreaPrefetch(areaId));
    return critical;
  }

  function preloadAreaBanner(areaId) {
    const src = areaBannerArt(areaId, areas[areaId]);
    if (!src) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = () => resolve(image);
      image.src = src;
    });
  }

  function setAreaLoading(visible, areaName = "") {
    const loading = $("area-loading");
    if (!loading) return;
    loading.textContent = visible ? `Loading ${areaName || "current area"}…` : "";
    loading.classList.toggle("is-hidden", !visible);
  }

  function scheduleAdjacentAreaPrefetch(areaId) {
    if (adjacentPrefetchHandle !== null) {
      if (window.cancelIdleCallback && typeof adjacentPrefetchHandle === "number") window.cancelIdleCallback(adjacentPrefetchHandle);
      else clearTimeout(adjacentPrefetchHandle);
    }
    const prefetch = () => {
      adjacentPrefetchHandle = null;
      if (document.hidden || areaId !== state?.areaId) return;
      const keys = new Set();
      keys.add(battleBackgroundKeyForAreaId(areaId));
      connectedAreaIds(areaId).forEach((id) => {
        if (id !== areaId) areaAssetKeys(id, { includeBattle: true }).forEach((key) => keys.add(key));
      });
      loadArtAssets([...keys]);
    };
    adjacentPrefetchHandle = window.requestIdleCallback
      ? window.requestIdleCallback(prefetch, { timeout: 1800 })
      : window.setTimeout(prefetch, 650);
  }

  function loadBattleAssets(enemyIds = []) {
    const keys = new Set([battleBackgroundKey(), "spellAtlas", ...enemyAssetKeysForIds(enemyIds)]);
    if (state) characterAssetKeysForIds(activePartyMembers().map((member) => member.id)).forEach((key) => keys.add(key));
    if (enemyIds.includes("darhyn")) keys.add("yanDragon");
    loadArtAssets([...keys]);
  }

  function guideImageAssetKeys(image) {
    const [kind, id] = String(image || "").split(":");
    const keys = new Set();
    if (kind === "cover") {
      const key = coverImageKeys[id];
      if (key) keys.add(key);
    } else if (kind === "portrait") {
      keys.add("portraitAtlas");
      const customKey = customPortraitKeys[id];
      if (customKey) keys.add(customKey);
      characterAssetKeysForIds([id]).forEach((key) => keys.add(key));
    } else if (kind === "hero" || kind === "heroWalk") {
      characterAssetKeysForIds([id]).forEach((key) => keys.add(key));
    } else if (kind === "enemy") {
      enemyAssetKeysForIds([id]).forEach((key) => keys.add(key));
    } else if (kind === "route") {
      const key = routeGuideImageKeys[id];
      if (key) keys.add(key);
    } else if (kind === "sidequest") {
      const key = sidequestGuideImageKeys[id];
      if (key) keys.add(key);
    } else if (kind === "art") {
      const art = generatedGuideArt[id];
      if (art?.assetKey) keys.add(art.assetKey);
    } else if (kind === "area") {
      if (areas[id]) {
        keys.add(tileSheetKeyForAreaId(id));
      }
    } else if (kind === "spell") {
      keys.add("spellAtlas");
    } else if (kind === "armor" && id === "vs") {
      keys.add("vsArmorIcon");
    } else if (kind === "item" && id === "relic") {
      keys.add("vsLogo");
    } else {
      keys.add("guideIcons");
    }
    return keys;
  }

  function loadGuideSectionAssets(section = activeGuideSection) {
    const keys = new Set();
    (guideData[section] || []).forEach((entry) => {
      guideImageAssetKeys(entry.image).forEach((key) => keys.add(key));
    });
    loadArtAssets([...keys]);
  }

  function imageReady(key) {
    const img = artImages[key];
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }

  function imageSourceAlphaBounds(img, sx, sy, sw, sh) {
    const key = `${img.currentSrc || img.src}:${sx}:${sy}:${sw}:${sh}`;
    if (imageAlphaBoundsCache.has(key)) return imageAlphaBoundsCache.get(key);
    const fallback = { sx, sy, sw, sh };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(sw));
      canvas.height = Math.max(1, Math.ceil(sh));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha <= 12) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) {
        imageAlphaBoundsCache.set(key, fallback);
        return fallback;
      }
      const pad = 2;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.width - 1, maxX + pad);
      maxY = Math.min(canvas.height - 1, maxY + pad);
      const scaleX = sw / canvas.width;
      const scaleY = sh / canvas.height;
      const bounds = {
        sx: sx + minX * scaleX,
        sy: sy + minY * scaleY,
        sw: (maxX - minX + 1) * scaleX,
        sh: (maxY - minY + 1) * scaleY
      };
      imageAlphaBoundsCache.set(key, bounds);
      return bounds;
    } catch {
      imageAlphaBoundsCache.set(key, fallback);
      return fallback;
    }
  }

  function drawAtlasCell(ctx, img, cols, rows, cell, x, y, size, mirror = false, crop = {}) {
    if (!img || !cell) return false;
    const sw = img.naturalWidth / cols;
    const sh = img.naturalHeight / rows;
    const [col, row] = cell;
    const sourceX = col * sw + (crop.left || 0);
    const sourceY = row * sh + (crop.top || 0);
    const sourceW = sw - (crop.left || 0) - (crop.right || 0);
    const sourceH = sh - (crop.top || 0) - (crop.bottom || 0);
    const drawW = size * (sourceW / sw);
    const drawH = size * (sourceH / sh);
    ctx.save();
    if (mirror) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, -drawW / 2, y - drawH, drawW, drawH);
    } else {
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, x - drawW / 2, y - drawH, drawW, drawH);
    }
    ctx.restore();
    return true;
  }

  function drawGeneratedHero(ctx, x, y, id, facing = "down", elapsed = 0, scale = 1, mode = "battle") {
    if (!imageReady("heroAtlas")) return false;
    const cell = heroAtlasCells[id] || heroAtlasCells[defaultSpriteId()] || Object.values(heroAtlasCells)[0];
    const img = artImages.heroAtlas;
    const walking = typeof elapsed === "number" && elapsed < WALK_MS + 140;
    const pulse = walking ? Math.sin(elapsed / 48) : Math.sin(Date.now() / 320);
    const bob = walking ? Math.abs(pulse) * (mode === "map" ? 2.6 : 3.2) : Math.sin(Date.now() / 360) * 1.5;
    const squash = walking ? 1 + Math.abs(pulse) * (mode === "map" ? 0.018 : 0.025) : 1;
    const base = mode === "guide" ? 122 : mode === "map" ? 84 : 192;
    const size = base * scale;
    const mirror = facing === "left";
    drawSoftShadow(ctx, x, y + 3, Math.max(14, size * 0.16), Math.max(5, size * 0.045));
    if (mode === "map" && walking) drawMapFootfalls(ctx, x, y + 2, facing, size, elapsed);
    ctx.save();
    const sway = mode === "map" && walking ? Math.sin(elapsed / 74) * 1.8 : 0;
    const lean = mode === "map" && walking ? Math.sin(elapsed / 82) * 0.035 : 0;
    ctx.translate(x + sway, y - bob);
    if (mode === "map") {
      if (facing === "left") ctx.rotate(-lean);
      else if (facing === "right") ctx.rotate(lean);
      else ctx.rotate(lean * 0.35);
    }
    ctx.scale(squash, 1 / squash);
    drawAtlasCell(ctx, img, 3, 2, cell, 0, 0, size, mirror);
    ctx.restore();
    return true;
  }

  function drawMapFootfalls(ctx, x, y, facing, size, elapsed) {
    const phase = Math.sin(elapsed / 48);
    const step = Math.abs(phase);
    const spread = size * 0.13;
    const reach = size * 0.08 * step;
    ctx.save();
    ctx.fillStyle = "rgba(21, 17, 13, 0.36)";
    if (facing === "left" || facing === "right") {
      const dir = facing === "left" ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(x - dir * (spread * 0.2 + reach), y - 4, 6, 3, -0.1, 0, Math.PI * 2);
      ctx.ellipse(x + dir * (spread * 0.45 + reach * 0.4), y - 2, 6, 3, 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(x - spread * 0.55, y - 2 - reach, 5, 3, -0.15, 0, Math.PI * 2);
      ctx.ellipse(x + spread * 0.55, y - 2 + reach * 0.5, 5, 3, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGeneratedEnemyModel(ctx, enemyId, sx, sy, scale = 1, options = {}) {
    if (drawCustomEnemyImage(ctx, enemyId, sx, sy, scale, options)) return true;
    if (!imageReady("enemyAtlas")) return false;
    const cell = enemyAtlasCells[enemyId];
    if (!cell) return false;
    const img = artImages.enemyAtlas;
    const boss = enemies[enemyId]?.boss;
    const size = (boss ? 232 : 196) * scale;
    const breathing = 1 + Math.sin(Date.now() / 330) * 0.018;
    const mirror = options.mirror ?? options.facing === "right";
    drawSoftShadow(ctx, sx, sy + 5, Math.max(16, size * 0.18), Math.max(6, size * 0.05));
    ctx.save();
    ctx.translate(sx, sy + Math.sin(Date.now() / 280) * 1.5);
    ctx.scale(breathing, 1 / breathing);
    drawAtlasCell(ctx, img, 4, 2, cell, 0, 0, size, mirror, enemyAtlasCellCrop[enemyId] || {});
    ctx.restore();
    return true;
  }

  function drawCustomEnemyImage(ctx, enemyId, sx, sy, scale = 1, options = {}) {
    const key = customEnemyImageKeys[enemyId];
    if (key && imageReady(key)) {
      const img = artImages[key];
      const baseHeight = enemyId === "corizaz" ? 224 : 248;
      const modeScale = options.mode === "map" ? 0.64 : 1;
      const drawH = baseHeight * scale * modeScale;
      const drawW = drawH * (img.naturalWidth / img.naturalHeight);
      const breathing = 1 + Math.sin(Date.now() / 330) * (options.mode === "map" ? 0.01 : 0.014);
      const mirror = options.mirror ?? options.facing === "right";
      drawSoftShadow(ctx, sx, sy + 5, Math.max(16, drawW * 0.22), Math.max(6, drawH * 0.04));
      ctx.save();
      if (!ctx.filter || ctx.filter === "none") ctx.filter = "saturate(0.84) contrast(1.08) sepia(0.06)";
      ctx.translate(sx, sy + Math.sin(Date.now() / 280) * 1.2);
      ctx.scale(mirror ? -breathing : breathing, 1 / breathing);
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
      return true;
    }
    const generated = generatedEnemyArt[enemyId];
    if (!generated?.assetKey || !imageReady(generated.assetKey)) return false;
    const img = artImages[generated.assetKey];
    const baseSize = generated.size || (enemies[enemyId]?.boss ? 250 : 210);
    const modeScale = options.mode === "map" ? 0.58 : 1;
    const size = baseSize * scale * modeScale;
    const breathing = 1 + Math.sin(Date.now() / 330) * (options.mode === "map" ? 0.01 : 0.014);
    const mirror = options.mirror ?? options.facing === "right";
    drawSoftShadow(ctx, sx, sy + 5, Math.max(16, size * 0.18), Math.max(6, size * 0.05));
    ctx.save();
    ctx.translate(sx, sy + Math.sin(Date.now() / 280) * 1.2);
    ctx.scale(breathing, 1 / breathing);
    drawAtlasCell(ctx, img, generated.cols || 1, generated.rows || 1, generated.cell || [0, 0], 0, 0, size, mirror, generated.crop || {});
    ctx.restore();
    return true;
  }

  function enemyBaseBattleScale(enemyId, enemy, count = 1) {
    const base = enemyId === "oldBetsy" ? 1.38 : enemy?.boss ? 1.12 : 1.02;
    if (count <= 1) return base;
    const generatedSize = generatedEnemyArt[enemyId]?.size || 0;
    const largeGenerated = generatedSize >= 280;
    const countScale = count >= 4
      ? (largeGenerated ? 0.5 : 0.58)
      : count >= 3
        ? (largeGenerated ? 0.58 : 0.68)
        : (largeGenerated ? 0.76 : enemy?.boss ? 0.82 : 0.86);
    return base * countScale;
  }

  function enemyBattleDrawSize(enemyId, scale = 1) {
    const generated = generatedEnemyArt[enemyId];
    if (generated?.assetKey && imageReady(generated.assetKey)) {
      const img = artImages[generated.assetKey];
      const cols = generated.cols || 1;
      const rows = generated.rows || 1;
      const sw = img.naturalWidth / cols;
      const sh = img.naturalHeight / rows;
      const crop = generated.crop || {};
      const sourceW = sw - (crop.left || 0) - (crop.right || 0);
      const sourceH = sh - (crop.top || 0) - (crop.bottom || 0);
      const size = (generated.size || (enemies[enemyId]?.boss ? 250 : 210)) * scale;
      return { width: size * (sourceW / sw), height: size * (sourceH / sh) };
    }
    const customKey = customEnemyImageKeys[enemyId];
    if (customKey && imageReady(customKey)) {
      const img = artImages[customKey];
      const height = (enemyId === "corizaz" ? 224 : 248) * scale;
      return { width: height * (img.naturalWidth / img.naturalHeight), height };
    }
    const size = (enemies[enemyId]?.boss ? 232 : 196) * scale;
    return { width: size, height: size };
  }

  function enemyBattleGroundY(frame, count, index, enemyId, enemy) {
    if (count <= 1) return frame.height - (enemyId === "oldBetsy" ? 62 : enemy?.boss ? 72 : 76);
    const base = frame.height - (count >= 3 ? 155 : 124);
    const offsets = count >= 3 ? [0, 24, 44, 58] : [0, 34];
    return base + (offsets[index % offsets.length] || 0) + Math.floor(index / offsets.length) * 14;
  }

  function battleEnemyLayouts(frame, visibleEnemies, action = "idle", effect = currentBattleEffect()) {
    const count = visibleEnemies.length;
    if (!count) return [];
    const laneLeft = count >= 4 ? frame.width * 0.56 : count >= 3 ? frame.width * 0.59 : count === 2 ? frame.width * 0.64 : 0;
    const laneRight = count >= 2 ? frame.width - 140 : 0;
    const spacing = count > 1 ? Math.max(1, (laneRight - laneLeft) / Math.max(1, count - 1)) : 0;
    return visibleEnemies.map((battleEnemy, index) => {
      const enemyId = battleEnemy.id || activeBattle?.id || "goblin";
      const enemy = enemies[enemyId] || battleEnemy || {};
      let scale = enemyBaseBattleScale(enemyId, enemy, count);
      let drawSize = enemyBattleDrawSize(enemyId, scale);
      if (count > 1) {
        const maxWidth = spacing * 1.12;
        if (drawSize.width > maxWidth) {
          scale *= maxWidth / drawSize.width;
          drawSize = enemyBattleDrawSize(enemyId, scale);
        }
      }
      const singleX = frame.width - (enemyId === "oldBetsy" ? 260 : enemy?.boss ? 235 : 210);
      const formationX = count > 1 ? laneLeft + spacing * index : singleX;
      const enemySleepShift = enemyId === "corizaz" && effect?.type === "sleepRoll" ? Math.sin(effect.progress * Math.PI * 2) * 14 : 0;
      const isActingEnemy = activeBattle?.enemy === battleEnemy;
      const enemyAttackShift = (action === "attack" || (activeBattle?.enemyAction && isActingEnemy)) ? -54 : 0;
      const enemyImpactShift = effect?.affectsEnemy && isActingEnemy ? Math.sin(effect.progress * Math.PI) * 12 : 0;
      const x = formationX + enemyAttackShift + enemyImpactShift + enemySleepShift;
      const y = enemyBattleGroundY(frame, count, index, enemyId, enemy)
        + Math.sin(Date.now() / 280 + index) * 2.5
        + (enemyId === "corizaz" && effect?.type === "sleepSnore" ? Math.sin(effect.progress * Math.PI) * 3 : 0);
      return {
        battleEnemy,
        enemyId,
        isActingEnemy,
        x,
        y,
        scale,
        width: drawSize.width,
        height: drawSize.height,
        left: x - drawSize.width / 2,
        right: x + drawSize.width / 2,
        top: y - drawSize.height,
        bottom: y
      };
    });
  }

  function drawEnemySprite(enemyId, action = "idle") {
    drawBattleStage(action, enemyId);
  }

  function drawBattlePartySprites() {
    drawBattleStage();
  }

  function drawBattleStage(action = "idle", enemyOverride) {
    const canvas = $("battle-stage");
    if (!canvas || !state) return;
    const { ctx, width, height } = prepareHiDPICanvas(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    drawBattleGround(ctx, width, height, "stage");
    const effect = currentBattleEffect();
    const visibleEnemies = enemyOverride
      ? [{ id: enemyOverride, ...(enemies[enemyOverride] || enemies.goblin), hp: 1, maxHp: enemies[enemyOverride]?.hp || 1 }]
      : livingEnemies();
    let effectEnemyX = width - 235;
    let effectEnemyY = height - 72;
    if (!activeBattle?.reward) {
      battleEnemyLayouts({ width, height }, visibleEnemies, action, effect).forEach((layout, index) => {
        if (layout.isActingEnemy || index === 0) {
          effectEnemyX = layout.x;
          effectEnemyY = layout.y;
        }
        drawEnemyModel(ctx, layout.enemyId, layout.x, layout.y, layout.scale, { facing: "left" });
      });
    }

    const formation = [
      [132, 306],
      [258, 402],
      [386, 298],
      [512, 394]
    ];
    const renderedPartyActions = [];
    activePartyMembers().slice(0, ACTIVE_PARTY_LIMIT).map((member, index) => {
      const row = index % 2;
      const [baseX, baseY] = formation[index] || [124 + Math.floor(index / 2) * 174, 310 + row * 95];
      return { member, index, row, baseX, baseY };
    }).sort((a, b) => a.baseY - b.baseY || a.index - b.index).forEach(({ member, index, row, baseX, baseY }) => {
      const fallen = member.hp <= 0;
      const effectActor = effect?.actorId === member.id;
      const actionPush = effectActor && effect?.affectsEnemy ? Math.sin(effect.progress * Math.PI) * 52 : 0;
      const target = activeBattle?.targetId === member.id
        || effect?.targetId === member.id
        || (isEnemyDamageEffect(effect?.type) && Array.isArray(effect?.targetIds) && effect.targetIds.includes(member.id));
      const hurtTarget = target && (activeBattle?.enemyAction || isEnemyDamageEffect(effect?.type));
      const helpfulTarget = !effectActor && isHelpfulBattleEffectTarget(effect, member.id);
      const x = baseX + actionPush;
      const y = baseY - (effectActor ? Math.sin(effect.progress * Math.PI) * 7 : 0) + (hurtTarget ? Math.sin(Date.now() / 35) * 3 : 0);
      const facing = effectActor && (effect?.type === "heal" || effect?.type === "potion") ? "down" : "right";
      const weaponAction = effectActor && (isSwordEffect(effect.type) || isRangedBattleEffect(effect.type, member));
      const swordAction = effectActor && isSwordEffect(effect.type);
      const battleAction = fallen ? "hurt" : activeBattle?.reward ? "victory" : effectActor ? (weaponAction ? "attack" : "cast") : hurtTarget ? "hurt" : "";
      renderedPartyActions.push(`${member.id}:${battleAction || "idle"}`);
      const spriteEffectType = effectActor ? effect?.type : null;
      const yanDragonTransform = effectActor && member.id === "yan" && effect?.type === "dragonSpell";
      if (yanDragonTransform) {
        const humanFade = 1 - smoothStep(clamp((effect.progress || 0) / 0.28, 0, 1));
        if (humanFade > 0.02) {
          ctx.save();
          ctx.globalAlpha = humanFade;
          drawCharacterFrame(ctx, x, y, member.id, facing, effect.elapsed, 1.02, "battle", {
            action: battleAction,
            effectType: spriteEffectType,
            progress: effect?.progress
          });
          ctx.restore();
        }
        if (!drawYanDragonBattleSprite(ctx, x, y, effect, 1)) {
          drawCharacterFrame(ctx, x, y, member.id, facing, effect.elapsed, 1.02, "battle", {
            action: battleAction,
            effectType: spriteEffectType,
            progress: effect?.progress
          });
        }
      } else {
        drawCharacterFrame(ctx, x, y, member.id, facing, effectActor ? effect.elapsed : Date.now() + index * 90, effectActor ? 1.02 : 0.94, "battle", {
          action: battleAction,
          effectType: spriteEffectType,
          hideWeapon: swordAction,
          progress: effect?.progress
        });
      }
      if (fallen) drawPartyKoMarker(ctx, x, y);
      if (effectActor) drawPartyActionEffect(ctx, x, y, member, effect);
      if (hurtTarget) {
        if (isCorizazSleepEffect(effect?.type)) drawPartySleepEffect(ctx, x, y, effect);
        else drawPartyImpactEffect(ctx, x, y, effect);
      } else if (helpfulTarget) {
        drawPartyHealBubbles(ctx, x, y, effect, index);
      }
    });
    canvas.dataset.partyActions = renderedPartyActions.join(",");
    drawEnemyBattleEffect(ctx, effect, effectEnemyX, effectEnemyY, width, height);
  }

  function drawPartyKoMarker(ctx, x, y) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    fillRoundRect(ctx, x - 25, y - 94, 50, 24, 7, "rgba(19, 16, 18, 0.72)", "rgba(255, 232, 170, 0.62)");
    ctx.fillStyle = "#ffe08a";
    ctx.font = "bold 16px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("KO", x, y - 82);
    ctx.restore();
  }

  function drawEnemyModel(ctx, enemyId, sx, sy, scale = 1, options = {}) {
    const style = enemyStyle[enemyId] || enemyStyle.goblin;
    const facing = options.facing || "left";
    ctx.save();
    ctx.filter = "saturate(0.84) contrast(1.08) sepia(0.06)";
    if (drawGeneratedEnemyModel(ctx, enemyId, sx, sy, scale, { ...options, facing })) {
      ctx.restore();
      return;
    }
    if (enemyId === "corizaz") {
      drawCorizazSprite(ctx, sx, sy, 1.1 * scale, "battle", facing);
      ctx.restore();
      return;
    }
    if (style.kind === "cow") drawCow(ctx, sx, sy, 1.45 * scale);
    else if (style.kind === "darhyn") drawDarhyn(ctx, sx, sy, 1.3 * scale, enemyId === "darhyn" || enemyId === "dreamDarhyn");
    else if (style.kind === "mole") drawMole(ctx, sx, sy, 1.5 * scale);
    else if (style.kind === "chomonster") drawChomonster(ctx, sx, sy, 1.35 * scale);
    else if (style.kind === "slime") drawSlime(ctx, sx, sy, 1.35 * scale);
    else if (style.kind === "goblin") drawGoblin(ctx, sx, sy, 1.4 * scale);
    else if (style.kind === "guard") drawKnight(ctx, sx, sy, 1.25 * scale, style.body, style.accent);
    else if (style.kind === "wizard") drawWizard(ctx, sx, sy, 1.3 * scale);
    else if (style.kind === "fear") drawFear(ctx, sx, sy, 1.35 * scale);
    else if (style.kind === "thieves") {
      drawTwinThievesModel(ctx, sx, sy, scale, "battle", facing);
    } else if (style.kind === "hano") {
      drawHanoSprite(ctx, sx, sy, 1.08 * scale, "battle");
    } else if (style.kind === "hammer") drawHammerElf(ctx, sx, sy, 1.3 * scale);
    else drawKnight(ctx, sx, sy, 1.25 * scale, style.body, style.accent);
    ctx.restore();
  }

  function drawTwinThievesModel(ctx, sx, sy, scale = 1, mode = "battle", facing = "left") {
    const p = (Date.now() % 680) / 680;
    if (mode === "map") {
      drawCharacterFrame(ctx, sx - 18 * scale, sy, "yvonne", "right", Date.now(), 1.05 * scale, "map");
      drawCharacterFrame(ctx, sx + 18 * scale, sy - 1, "yvette", "left", Date.now() + 140, 1.05 * scale, "map");
      return;
    }
    drawCharacterFrame(ctx, sx - 42 * scale, sy + 5 * scale, "yvonne", facing, Date.now(), 0.78 * scale, "battle", {
      action: "attack",
      progress: p
    });
    drawCharacterFrame(ctx, sx + 42 * scale, sy, "yvette", facing, Date.now() + 140, 0.78 * scale, "battle", {
      action: "attack",
      progress: (p + 0.48) % 1
    });
  }

  function battleBackgroundKey() {
    const areaId = activeBattle?.areaId || state?.areaId;
    return battleBackgroundKeyForAreaId(areaId);
  }

  function drawBattleBackgroundImage(ctx, key, w, h, side) {
    if (!imageReady(key)) return false;
    const img = artImages[key];
    const targetRatio = w / h;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (imageRatio > targetRatio) {
      sw = img.naturalHeight * targetRatio;
      const focus = side === "party" ? 0.42 : side === "enemy" ? 0.58 : 0.5;
      sx = clamp(img.naturalWidth * focus - sw / 2, 0, img.naturalWidth - sw);
    } else {
      sh = img.naturalWidth / targetRatio;
      sy = clamp(img.naturalHeight * 0.56 - sh / 2, 0, img.naturalHeight - sh);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return true;
  }

  function isSwordEffect(type) {
    return type === "slash" || type === "runeSlash" || type === "redSlash";
  }

  function isRangedBattleEffect(type, member) {
    if (type !== "charmShot") return false;
    const weapon = equippedWeapon(member);
    return Boolean(weapon && /bow|crossbow/i.test(weapon.name));
  }

  function isCorizazSleepEffect(type) {
    return type === "sleepSnore" || type === "sleepRoll";
  }

  function isEnemyDamageEffect(type) {
    return type === "enemyStrike" || type === "capture" || isCorizazSleepEffect(type);
  }

  function spellIdForBattleEffect(effect) {
    if (!effect) return "";
    if (effect.spellId && spellAtlasCells[effect.spellId]) return effect.spellId;
    const color = String(effect.color || "").toLowerCase();
    if (effect.type === "heal" || effect.type === "potion") return "heal";
    if (effect.type === "dragonSpell") {
      if (color === "#baffcf") return "wind";
      if (color === "#69d8ff" || color === "#78d7ff") return "water";
      return "dragon";
    }
    if (effect.type === "charmShot") return color === "#f2d977" ? "bell" : "charm";
    if (effect.type === "redSlash") return "flare";
    if (effect.type === "runeSlash") return color === "#fff7c8" ? "light" : "rune";
    return "";
  }

  function drawSpellAtlasCell(ctx, id, x, y, size, options = {}) {
    const cell = spellAtlasCells[id];
    if (!cell || !imageReady("spellAtlas")) return false;
    const img = artImages.spellAtlas;
    const sw = img.naturalWidth / spellAtlasGrid.cols;
    const sh = img.naturalHeight / spellAtlasGrid.rows;
    ctx.save();
    ctx.globalCompositeOperation = options.composite || "source-over";
    ctx.globalAlpha = options.alpha ?? 1;
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    const drawW = size * (options.scaleX || 1);
    const drawH = size * (options.scaleY || 1);
    ctx.drawImage(img, cell[0] * sw, cell[1] * sh, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    return true;
  }

  function drawBattleSpellAtlasEffect(ctx, id, x, y, progress, size, options = {}) {
    if (!id) return false;
    const flash = Math.sin(progress * Math.PI);
    const t = smoothStep(progress);
    const scale = options.grow ? 0.68 + t * 0.48 : 0.88 + flash * 0.16;
    const alpha = (options.alpha ?? 0.92) * (0.18 + flash * 0.82);
    const rotation = (options.rotation || 0) + (options.spin || 0) * (progress - 0.5);
    return drawSpellAtlasCell(ctx, id, x, y, size * scale, {
      alpha,
      rotation,
      composite: options.composite || "screen",
      scaleX: options.scaleX,
      scaleY: options.scaleY
    });
  }

  function drawPartyActionEffect(ctx, x, y, member, effect) {
    if (!effect) return;
    const color = effect.color || "#ffe97a";
    const spellId = spellIdForBattleEffect(effect);
    if (effect.type === "heal" || effect.type === "potion") {
      drawBattleSpellAtlasEffect(ctx, spellId, x, y - 84, effect.progress, 108, { grow: true, alpha: 0.78 });
      drawMagicRings(ctx, x, y - 74, color, effect.progress, 58);
      drawSparkBurst(ctx, x, y - 98, color, effect.progress, 10, 54, hash(member.id, effect.startedAt));
      return;
    }
    if (effect.type === "dragonSpell") {
      const dragonOrigin = member.id === "yan" ? { x: x + 70, y: y - 106 } : { x: x + 14, y: y - 112 };
      drawBattleSpellAtlasEffect(ctx, spellId, dragonOrigin.x + 52, dragonOrigin.y + 2, effect.progress, member.id === "yan" ? 126 : 112, { alpha: 0.72 });
      drawDragonSpellCast(ctx, dragonOrigin.x, dragonOrigin.y, color, effect.progress);
      return;
    }
    if (effect.type === "charmShot") {
      drawBattleSpellAtlasEffect(ctx, spellId, x + 42, y - 92, effect.progress, 82, { alpha: 0.72, rotation: -0.18 });
      drawCharmShot(ctx, x + 12, y - 92, color, effect.progress, effect.startedAt || 5);
      return;
    }
    drawBattleSpellAtlasEffect(ctx, spellId, x + 30, y - 84, effect.progress, 94, { alpha: 0.74, rotation: -0.55, spin: 0.18 });
    drawSwordSwing(ctx, x + 20, y - 82, color, effect.progress, effect.type, !characterSheetReady(member.id));
  }

  function drawSwordSwing(ctx, x, y, color, progress, type, includeBlade = true) {
    const t = smoothStep(progress);
    const flash = Math.sin(progress * Math.PI);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.72 * flash);
    ctx.lineWidth = type === "slash" ? 7 : 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(4, 4, 58, -1.15 + t * 1.4, -0.15 + t * 1.45);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.65 * flash);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(7, 0, 49, -1.05 + t * 1.4, -0.15 + t * 1.45);
    ctx.stroke();

    if (!includeBlade) {
      ctx.restore();
      return;
    }

    ctx.rotate(-0.82 + t * 1.75);
    fillRoundRect(ctx, 3, -4, 72, 8, 4, "#f6e5a4", null);
    fillRoundRect(ctx, -11, -6, 18, 12, 3, "#7a4a2b", null);
    ctx.fillStyle = "#fff7d1";
    ctx.beginPath();
    ctx.moveTo(84, 0);
    ctx.lineTo(72, -8);
    ctx.lineTo(72, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDragonSpellCast(ctx, x, y, color, progress) {
    const t = smoothStep(progress);
    const headX = x + 150 * t;
    const headY = y - 18 + Math.sin(progress * Math.PI * 2) * 10;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.7);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 10);
    ctx.bezierCurveTo(x + 34, y - 48, x + 78, y + 38, headX, headY);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.45 * Math.sin(progress * Math.PI));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 2, 24 + 18 * progress, progress * Math.PI * 3, progress * Math.PI * 3 + Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.78);
    ctx.beginPath();
    ctx.moveTo(headX + 18, headY);
    ctx.lineTo(headX - 6, headY - 12);
    ctx.lineTo(headX - 1, headY + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colorWithAlpha("#ffffff", 0.9);
    ctx.beginPath();
    ctx.arc(headX + 5, headY - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawYanDragonBattleSprite(ctx, x, y, effect, scale = 1) {
    if (!imageReady("yanDragon")) return false;
    const img = artImages.yanDragon;
    const progress = effect?.progress || 0;
    const elapsed = effect?.elapsed || 0;
    const emerge = smoothStep(clamp(progress / 0.28, 0, 1));
    const flash = Math.sin(progress * Math.PI);
    const lunge = Math.sin(progress * Math.PI) * 24;
    const breathe = 1 + Math.sin(elapsed / 135) * 0.018;
    const drawW = 346 * scale * (0.94 + emerge * 0.08);
    const drawH = drawW * (img.naturalHeight / img.naturalWidth);
    const drawX = x - drawW * 0.5 + lunge;
    const drawY = y - drawH + 18 - Math.sin(progress * Math.PI) * 9;

    ctx.save();
    ctx.globalAlpha = 0.18 + emerge * 0.82;
    drawSoftShadow(ctx, x + 8 + lunge, y + 6, Math.max(44, drawW * 0.28), Math.max(9, drawH * 0.055));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(x + 44 + lunge, y - 104, 8, x + 44 + lunge, y - 104, 132);
    aura.addColorStop(0, colorWithAlpha(effect?.color || "#91f6ff", 0.52 * flash));
    aura.addColorStop(0.58, colorWithAlpha("#ff6b4a", 0.18 * flash));
    aura.addColorStop(1, "rgba(68, 16, 14, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(x + 44 + lunge, y - 104, 132, 82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
    ctx.scale(1 + flash * 0.025, breathe);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    return true;
  }

  function drawCharmShot(ctx, x, y, color, progress, seed) {
    const t = smoothStep(progress);
    const endX = 352;
    const endY = y - 6;
    const boltX = lerp(x, endX, t);
    const boltY = lerp(y, endY, t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.62);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(boltX, boltY);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(boltX, boltY);
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.9);
    ctx.beginPath();
    ctx.moveTo(boltX + 16, boltY);
    ctx.lineTo(boltX - 9, boltY - 7);
    ctx.lineTo(boltX - 6, boltY + 7);
    ctx.closePath();
    ctx.fill();
    drawSparkBurst(ctx, x + 4, y, color, progress, 7, 28, seed);
    ctx.restore();
  }

  function drawPartyHealEffect(ctx, x, y, effect) {
    const color = effect?.color || "#9ff0a4";
    drawMagicRings(ctx, x, y - 66, color, effect?.progress || 0, 52);
    drawSparkBurst(ctx, x, y - 94, color, effect?.progress || 0, 9, 46, effect?.startedAt || 3);
  }

  function drawPartyHealBubbles(ctx, x, y, effect, seedOffset = 0) {
    const progress = effect?.progress || 0;
    const flash = Math.sin(progress * Math.PI);
    const color = effect?.color || "#9ff0a4";
    const seed = (effect?.startedAt || 11) + seedOffset * 37;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const drift = (progress + i * 0.17 + rand(seed + i) * 0.2) % 1;
      const spread = -28 + i * 8 + Math.sin(progress * 5 + i) * 5;
      const bx = x + spread * (0.75 + rand(seed + i * 3) * 0.4);
      const by = y - 24 - drift * 82;
      const r = 4 + rand(seed + i * 7) * 6;
      const alpha = (1 - drift) * 0.46 * Math.max(0.35, flash);
      ctx.strokeStyle = colorWithAlpha(color, alpha);
      ctx.fillStyle = colorWithAlpha("#d7ffaf", alpha * 0.18);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function isHelpfulBattleEffectTarget(effect, memberId) {
    if (!effect || (effect.type !== "heal" && effect.type !== "potion")) return false;
    if (Array.isArray(effect.targetIds)) return effect.targetIds.includes(memberId);
    return effect.targetId === memberId;
  }

  function drawPartyImpactEffect(ctx, x, y, effect) {
    const progress = effect?.progress || 0;
    const flash = Math.sin(progress * Math.PI);
    const color = effect?.color || "#ff6651";
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.82 * flash);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 34, y - 95);
    ctx.lineTo(x + 30, y - 44);
    ctx.moveTo(x + 27, y - 98);
    ctx.lineTo(x - 21, y - 36);
    ctx.stroke();
    drawSparkBurst(ctx, x, y - 74, "#ffd8a1", progress, 9, 42, effect?.startedAt || 2);
    ctx.restore();
  }

  function drawPartySleepEffect(ctx, x, y, effect) {
    const progress = effect?.progress || 0;
    const flash = Math.sin(progress * Math.PI);
    const color = effect?.color || "#a8ff93";
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (effect?.type === "sleepRoll") {
      ctx.strokeStyle = colorWithAlpha(color, 0.74 * flash);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y - 66, 38 + progress * 20, Math.PI * 0.08, Math.PI * 1.36);
      ctx.stroke();
      drawSparkBurst(ctx, x + 4, y - 58, "#dfff9f", progress, 8, 34, effect?.startedAt || 8);
    } else {
      ctx.strokeStyle = colorWithAlpha(color, 0.62 * flash);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i += 1) {
        const yOffset = y - 92 + i * 16;
        ctx.beginPath();
        ctx.moveTo(x - 45 - progress * 10, yOffset);
        ctx.bezierCurveTo(x - 18, yOffset - 12, x + 18, yOffset + 12, x + 45 + progress * 10, yOffset);
        ctx.stroke();
      }
      drawSparkBurst(ctx, x, y - 76, "#f2ffd2", progress, 7, 30, effect?.startedAt || 6);
    }
    ctx.restore();
  }

  function drawEnemyBattleEffect(ctx, effect, sx, sy, w, h) {
    if (!effect) return;
    if (effect.type === "capture") {
      drawCaptureEffect(ctx, effect, sx, sy, w, h);
      return;
    }
    if (effect.type === "enemyStrike") {
      drawEnemyLungeTrail(ctx, effect, sx, sy);
      return;
    }
    if (effect.type === "sleepSnore") {
      drawMagicRings(ctx, sx, sy - 86, effect.color || "#a8ff93", effect.progress, 64);
      drawSparkBurst(ctx, sx - 16, sy - 120, "#eaffb8", effect.progress, 9, 54, effect.startedAt || 7);
      return;
    }
    if (effect.type === "sleepRoll") {
      drawSparkBurst(ctx, sx - 24, sy - 44, effect.color || "#dfff9f", effect.progress, 10, 62, effect.startedAt || 9);
      return;
    }
    if (!effect.affectsEnemy) return;
    const color = effect.color || "#ffe97a";
    const cx = sx;
    const cy = sy - 98;
    const spellId = spellIdForBattleEffect(effect);
    if (spellId) {
      const size = effect.type === "dragonSpell" ? 170 : effect.type === "charmShot" ? 136 : 128;
      drawBattleSpellAtlasEffect(ctx, spellId, cx, cy, effect.progress, size, {
        grow: effect.type !== "charmShot",
        alpha: effect.type === "dragonSpell" ? 0.82 : 0.72,
        rotation: effect.type === "redSlash" ? -0.35 : 0
      });
    }
    if (effect.type === "dragonSpell") {
      drawEnemyDragonImpact(ctx, cx, cy, color, effect.progress);
    } else if (effect.type === "charmShot") {
      drawEnemyCharmImpact(ctx, cx, cy, color, effect.progress, w);
    } else {
      drawEnemySlashImpact(ctx, cx, cy, color, effect.progress, effect.type);
    }
    drawSparkBurst(ctx, cx, cy, color, effect.progress, effect.type === "dragonSpell" ? 16 : 10, 70, effect.startedAt || 1);
  }

  function drawCaptureEffect(ctx, effect, sx, sy, w, h) {
    const progress = effect?.progress || 0;
    const flash = Math.sin(progress * Math.PI);
    const color = effect?.color || "#8fdcff";
    const originX = sx - 28;
    const originY = sy - 126;
    const targets = [
      [132, 236],
      [258, 332],
      [386, 228],
      [512, 324]
    ];
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    fillRoundRect(ctx, 62, 170, Math.min(510, w - 120), Math.min(264, h - 188), 22, `rgba(8, 12, 24, ${0.08 + flash * 0.18})`, null);
    ctx.globalCompositeOperation = "lighter";
    targets.forEach(([targetX, targetY], index) => {
      const local = clamp((progress - index * 0.055) / 0.72, 0, 1);
      if (local <= 0) return;
      const t = smoothStep(local);
      const endX = lerp(originX, targetX, t);
      const endY = lerp(originY, targetY - 78, t);
      const alpha = 0.2 + Math.sin(local * Math.PI) * 0.58;
      ctx.strokeStyle = colorWithAlpha(color, alpha);
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.quadraticCurveTo(
        lerp(originX, targetX, 0.54),
        lerp(originY, targetY - 132, 0.54) - 36,
        endX,
        endY
      );
      ctx.stroke();
      ctx.strokeStyle = colorWithAlpha("#ffffff", alpha * 0.62);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const dx = endX - originX;
      const dy = endY - originY;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      for (let link = 24; link < length; link += 26) {
        const linkT = link / Math.max(1, length);
        const curveX = lerp(originX, endX, linkT);
        const curveY = lerp(originY, endY, linkT) - Math.sin(linkT * Math.PI) * 28;
        ctx.save();
        ctx.translate(curveX, curveY);
        ctx.rotate(angle + (index % 2 ? 0.12 : -0.12));
        ctx.strokeStyle = colorWithAlpha("#d9f4ff", alpha * 0.82);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const ringAlpha = clamp((local - 0.58) / 0.42, 0, 1) * (0.4 + flash * 0.42);
      if (ringAlpha > 0) {
        ctx.strokeStyle = colorWithAlpha(color, ringAlpha);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(targetX, targetY - 72, 34 + flash * 5, 15, 0.08, 0, Math.PI * 2);
        ctx.ellipse(targetX, targetY - 48, 27 + flash * 4, 13, -0.12, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    drawSparkBurst(ctx, originX, originY, "#d9f4ff", progress, 13, 78, effect?.startedAt || 13);
    ctx.restore();
  }

  function drawEnemySlashImpact(ctx, x, y, color, progress, type) {
    const t = smoothStep(progress);
    const flash = Math.sin(progress * Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.85 * flash);
    ctx.lineWidth = type === "slash" ? 8 : 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 72 + t * 16, y - 54);
    ctx.lineTo(x + 62 - t * 16, y + 38);
    ctx.moveTo(x + 58, y - 48 + t * 18);
    ctx.lineTo(x - 54, y + 36 - t * 14);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.7 * flash);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 48, y - 42);
    ctx.lineTo(x + 44, y + 26);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemyDragonImpact(ctx, x, y, color, progress) {
    const t = smoothStep(progress);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawMagicRings(ctx, x, y + 6, color, progress, 84);
    ctx.strokeStyle = colorWithAlpha(color, 0.72);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 84, y + 28);
    ctx.bezierCurveTo(x - 38, y - 54, x + 26, y + 66, x + 76 * t, y - 16);
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.75 * Math.sin(progress * Math.PI));
    ctx.beginPath();
    ctx.ellipse(x, y, 46 + progress * 20, 34 + progress * 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyCharmImpact(ctx, x, y, color, progress, width) {
    const t = smoothStep(progress);
    const boltX = lerp(0, x, t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.68);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, y - 8);
    ctx.lineTo(boltX, y);
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.74 * Math.sin(progress * Math.PI));
    for (let i = 0; i < 5; i += 1) {
      const angle = i * 1.256 + progress * 2;
      const r = 22 + i * 6 + progress * 24;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemyLungeTrail(ctx, effect, x, y) {
    const flash = Math.sin(effect.progress * Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha("#ff6651", 0.48 * flash);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x - 42 - i * 14, y - 132 + i * 28);
      ctx.lineTo(x - 96 - i * 18, y - 92 + i * 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagicRings(ctx, x, y, color, progress, radius) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i += 1) {
      const phase = (progress + i * 0.24) % 1;
      const r = radius * (0.28 + phase * 0.72);
      const alpha = (1 - phase) * 0.58;
      ctx.strokeStyle = colorWithAlpha(color, alpha);
      ctx.lineWidth = 3 - i * 0.35;
      ctx.beginPath();
      ctx.ellipse(x, y + i * 12, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSparkBurst(ctx, x, y, color, progress, count, radius, seed) {
    const flash = Math.sin(progress * Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, 0.72 * flash);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + rand(seed + i * 17) * 0.7;
      const length = radius * (0.2 + progress * 0.8) * (0.65 + rand(seed + i * 31) * 0.55);
      const inner = length * 0.62;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBattleGround(ctx, w, h, side) {
    const backgroundKey = battleBackgroundKey();
    if (drawBattleBackgroundImage(ctx, backgroundKey, w, h, side)) {
      const tint = backgroundKey === "battleCastle"
        ? "rgba(8, 12, 22, 0.25)"
        : backgroundKey === "battleShoals"
          ? "rgba(3, 42, 62, 0.12)"
          : "rgba(8, 15, 12, 0.1)";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      const ground = ctx.createLinearGradient(0, h * 0.58, 0, h);
      ground.addColorStop(0, "rgba(255, 255, 255, 0)");
      ground.addColorStop(0.5, side === "party" ? "rgba(47, 59, 44, 0.16)" : side === "enemy" ? "rgba(32, 25, 35, 0.18)" : "rgba(42, 42, 37, 0.16)");
      ground.addColorStop(1, "rgba(8, 8, 10, 0.5)");
      ctx.fillStyle = ground;
      ctx.fillRect(0, h * 0.54, w, h * 0.46);
      ctx.strokeStyle = "rgba(255, 246, 204, 0.13)";
      ctx.lineWidth = 2;
      for (let x = -30; x < w; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, h - 48);
        ctx.lineTo(x + 62, h);
        ctx.stroke();
      }
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, side === "party" ? "#1f2c25" : side === "enemy" ? "#2b1d2f" : "#20242b");
    gradient.addColorStop(1, "#121116");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = side === "party" ? "#4c6f4a" : side === "enemy" ? "#4a4049" : "#4d5f55";
    ctx.fillRect(0, h - 48, w, 48);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 2;
    for (let x = -20; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h - 47);
      ctx.lineTo(x + 48, h);
      ctx.stroke();
    }
  }

  function drawCow(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillRoundRect(ctx, -30, -31, 54, 30, 13, verticalGradient(ctx, -34, 2, "#f0ead2", "#afa88f"));
    fillRoundRect(ctx, 11, -43, 30, 28, 11, verticalGradient(ctx, -43, -14, "#efe4c8", "#bfb197"));
    ctx.fillStyle = "#3a2d2b";
    ctx.beginPath();
    ctx.ellipse(-15, -25, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(3, -18, 7, 5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(19, -35, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, 21, -27, 20, 10, 5, "#e5b2a1", "rgba(0,0,0,0.22)");
    ctx.fillStyle = "#211916";
    ctx.beginPath();
    ctx.arc(29, -33, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5e4730";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-22, -4);
    ctx.lineTo(-23, 16);
    ctx.moveTo(9, -4);
    ctx.lineTo(11, 16);
    ctx.stroke();
    ctx.strokeStyle = "#1c1514";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-24, 16);
    ctx.lineTo(-16, 17);
    ctx.moveTo(8, 16);
    ctx.lineTo(16, 16);
    ctx.stroke();
    ctx.fillStyle = "#f2e6c4";
    ctx.beginPath();
    ctx.moveTo(16, -37);
    ctx.lineTo(8, -48);
    ctx.lineTo(24, -39);
    ctx.moveTo(31, -38);
    ctx.lineTo(42, -48);
    ctx.lineTo(36, -35);
    ctx.fill();
    ctx.restore();
  }

  function drawDarhyn(ctx, x, y, scale = 1, final = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawSoftShadow(ctx, 0, 5, 30, 8);

    const cloakTop = final ? "#3b2454" : "#3f315f";
    const cloakBottom = final ? "#130d1b" : "#1b1630";
    const gold = final ? "#d8ad53" : "#bca05f";
    ctx.fillStyle = final ? "rgba(80, 34, 114, 0.22)" : "rgba(58, 47, 106, 0.2)";
    ctx.beginPath();
    ctx.ellipse(0, -47, 50, 68, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = verticalGradient(ctx, -94, 4, cloakTop, cloakBottom);
    ctx.beginPath();
    ctx.moveTo(-44, -2);
    ctx.quadraticCurveTo(-38, -46, -18, -82);
    ctx.lineTo(-5, -98);
    ctx.lineTo(8, -98);
    ctx.quadraticCurveTo(31, -70, 48, -4);
    ctx.lineTo(31, -16);
    ctx.lineTo(23, 3);
    ctx.lineTo(8, -10);
    ctx.lineTo(0, 8);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-25, 2);
    ctx.lineTo(-31, -17);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(215, 173, 83, 0.58)";
    ctx.lineWidth = 2;
    [-29, -14, 0, 14, 29].forEach((offset) => {
      ctx.beginPath();
      ctx.moveTo(offset * 0.34, -76);
      ctx.quadraticCurveTo(offset, -38, offset * 0.82, -4);
      ctx.stroke();
    });

    const robeGradient = verticalGradient(ctx, -78, -8, "#231a34", "#0e0b14");
    fillRoundRect(ctx, -16, -75, 32, 68, 6, robeGradient, "rgba(218, 184, 97, 0.42)");
    ctx.strokeStyle = "#d8cfb8";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const yy = -60 + i * 10;
      ctx.beginPath();
      ctx.moveTo(-8, yy);
      ctx.quadraticCurveTo(0, yy + 4, 8, yy);
      ctx.stroke();
    }
    ctx.fillStyle = "#cfc5ad";
    ctx.fillRect(-2, -66, 4, 50);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(-9 + i * 9, -18 + i * 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#40304d";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-17, -70);
    ctx.lineTo(-40, -50);
    ctx.moveTo(17, -70);
    ctx.lineTo(43, -48);
    ctx.stroke();
    ctx.fillStyle = "#d8cfb8";
    ctx.beginPath();
    ctx.arc(-42, -49, 5, 0, Math.PI * 2);
    ctx.arc(43, -48, 5, 0, Math.PI * 2);
    ctx.fill();

    fillRoundRect(ctx, -14, -104, 28, 28, 9, verticalGradient(ctx, -104, -76, "#efe9dc", "#9c927f"), "rgba(28, 19, 16, 0.7)");
    ctx.fillStyle = "#171014";
    ctx.beginPath();
    ctx.arc(-6, -94, 3.2, 0, Math.PI * 2);
    ctx.arc(6, -94, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6c35";
    ctx.beginPath();
    ctx.arc(-6, -94, 1.5, 0, Math.PI * 2);
    ctx.arc(6, -94, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1114";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, -84);
    ctx.quadraticCurveTo(0, -81, 5, -84);
    ctx.stroke();

    ctx.strokeStyle = gold;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-18, -108);
    ctx.lineTo(-7, -101);
    ctx.lineTo(0, -116);
    ctx.lineTo(7, -101);
    ctx.lineTo(18, -108);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -104, 17, Math.PI, 0);
    ctx.stroke();

    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(47, -12);
    ctx.lineTo(47, -92);
    ctx.stroke();
    ctx.fillStyle = "#101016";
    ctx.beginPath();
    ctx.arc(47, -100, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#87653b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(47, -100, 14, -0.4, Math.PI * 1.55);
    ctx.moveTo(38, -110);
    ctx.lineTo(32, -118);
    ctx.moveTo(57, -91);
    ctx.lineTo(65, -86);
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(94, 207, 255, 0.42)";
    ctx.beginPath();
    ctx.arc(-45, -58, 13 + Math.sin(Date.now() / 160) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8df0ff";
    ctx.beginPath();
    ctx.moveTo(-45, -74);
    ctx.lineTo(-53, -53);
    ctx.lineTo(-38, -55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (final) {
      ctx.strokeStyle = "rgba(115, 204, 255, 0.72)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -52, 56, 0, Math.PI * 1.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKnight(ctx, x, y, scale = 1, body = "#2b2c35", accent = "#b9b9c9") {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillRoundRect(ctx, -19, -55, 38, 54, 7, verticalGradient(ctx, -55, -1, lighten(body, 0.18), darken(body, 0.62)));
    fillRoundRect(ctx, -15, -68, 30, 20, 6, verticalGradient(ctx, -68, -48, lighten(accent, 0.22), darken(accent, 0.72)));
    fillRoundRect(ctx, -25, -39, 9, 34, 4, verticalGradient(ctx, -39, -5, lighten(accent, 0.12), darken(accent, 0.7)));
    fillRoundRect(ctx, 16, -39, 9, 34, 4, verticalGradient(ctx, -39, -5, lighten(accent, 0.12), darken(accent, 0.7)));
    ctx.fillStyle = "#0c0c10";
    fillRoundRect(ctx, -9, -61, 18, 4, 2, "#0c0c10", null);
    ctx.strokeStyle = "#d0d0d7";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(22, -58);
    ctx.lineTo(23, 5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -49);
    ctx.lineTo(-8, -4);
    ctx.moveTo(8, -49);
    ctx.lineTo(8, -4);
    ctx.stroke();
    ctx.fillStyle = "#a74f3c";
    fillRoundRect(ctx, -25, -65, 8, 12, 3, "#a74f3c", null);
    fillRoundRect(ctx, 18, -65, 8, 12, 3, "#a74f3c", null);
    ctx.restore();
  }

  function drawMole(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = verticalGradient(ctx, -43, -2, "#8a6654", "#4c352c");
    ctx.beginPath();
    ctx.ellipse(0, -23, 31, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, -8, -31, 16, 10, 6, "#d7b291", "rgba(0,0,0,0.24)");
    ctx.fillStyle = "#1e1512";
    ctx.beginPath();
    ctx.arc(-11, -32, 2.2, 0, Math.PI * 2);
    ctx.arc(11, -32, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d8c7a3";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-25, -18);
    ctx.lineTo(-39, -15);
    ctx.moveTo(25, -18);
    ctx.lineTo(39, -15);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -25, 20, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  function drawChomonster(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(255,209,95,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, -24, 36, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = verticalGradient(ctx, -62, 5, "#59bf92", "#28634f");
    ctx.beginPath();
    ctx.ellipse(0, -29, 27, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd15f";
    ctx.beginPath();
    ctx.arc(-10, -43, 5, 0, Math.PI * 2);
    ctx.arc(10, -43, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a2220";
    ctx.beginPath();
    ctx.arc(-10, -42, 1.8, 0, Math.PI * 2);
    ctx.arc(10, -42, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2f6a58";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-23, -30);
    ctx.quadraticCurveTo(-39, -28, -42, -16);
    ctx.moveTo(23, -30);
    ctx.quadraticCurveTo(39, -28, 42, -16);
    ctx.stroke();
    ctx.fillStyle = "#1b2b25";
    ctx.beginPath();
    ctx.arc(0, -17, 8, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function drawSlime(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(151,229,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, -10, 35, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = verticalGradient(ctx, -54, 2, "#79d8f2", "#2f7894");
    ctx.beginPath();
    ctx.moveTo(-31, -2);
    ctx.quadraticCurveTo(-27, -38, -5, -54);
    ctx.quadraticCurveTo(23, -42, 32, -2);
    ctx.quadraticCurveTo(0, 9, -31, -2);
    ctx.fill();
    ctx.strokeStyle = "rgba(184,245,255,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#10252d";
    ctx.beginPath();
    ctx.arc(-9, -28, 2.8, 0, Math.PI * 2);
    ctx.arc(10, -28, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.46)";
    ctx.beginPath();
    ctx.ellipse(10, -40, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGoblin(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillRoundRect(ctx, -16, -55, 32, 27, 8, verticalGradient(ctx, -55, -28, "#83c86d", "#447f39"));
    ctx.fillStyle = "#83c86d";
    ctx.beginPath();
    ctx.moveTo(-14, -46);
    ctx.lineTo(-31, -51);
    ctx.lineTo(-18, -35);
    ctx.moveTo(14, -46);
    ctx.lineTo(31, -51);
    ctx.lineTo(18, -35);
    ctx.fill();
    fillRoundRect(ctx, -19, -30, 38, 31, 7, verticalGradient(ctx, -30, 1, "#a8633d", "#4f2b21"));
    ctx.fillStyle = "#25311f";
    ctx.beginPath();
    ctx.arc(-7, -45, 2.2, 0, Math.PI * 2);
    ctx.arc(7, -45, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8a063";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(21, -40);
    ctx.lineTo(24, 3);
    ctx.stroke();
    ctx.fillStyle = "#d9c77f";
    ctx.beginPath();
    ctx.moveTo(23, -49);
    ctx.lineTo(16, -38);
    ctx.lineTo(30, -39);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWizard(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(117, 216, 143, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, -4, 36, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = verticalGradient(ctx, -74, -4, "#7aa87a", "#354b45");
    ctx.beginPath();
    ctx.moveTo(-26, -4);
    ctx.quadraticCurveTo(-14, -44, 0, -74);
    ctx.quadraticCurveTo(14, -44, 26, -4);
    ctx.closePath();
    ctx.fill();
    fillRoundRect(ctx, -11, -64, 22, 18, 8, "#c8e7b3", "rgba(0,0,0,0.28)");
    fillRoundRect(ctx, -20, -76, 40, 10, 4, "#392d50", "rgba(255,255,255,0.08)");
    ctx.strokeStyle = "#bbf292";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(21, -60);
    ctx.lineTo(31, -10);
    ctx.stroke();
    ctx.fillStyle = "#e4ffb7";
    ctx.beginPath();
    ctx.arc(20, -62, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCorizazSprite(ctx, x, y, scale = 1, mode = "battle", facing = "left") {
    if (!characterSheetReady("corizaz")) {
      drawSleepingCorizaz(ctx, x, y, scale);
      return false;
    }
    const now = Date.now();
    const pulse = Math.sin(now / 520);
    const auraScale = mode === "map" ? 0.72 : 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(x, y - 94 * scale, 10 * scale, x, y - 76 * scale, 96 * scale * auraScale);
    aura.addColorStop(0, "rgba(225, 255, 177, 0.5)");
    aura.addColorStop(0.42, "rgba(70, 233, 120, 0.24)");
    aura.addColorStop(1, "rgba(14, 73, 44, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(x, y - 72 * scale, 64 * scale * auraScale, (88 + pulse * 5) * scale * auraScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(169, 255, 156, ${0.24 + pulse * 0.06})`;
    ctx.lineWidth = Math.max(1.2, 2.6 * scale);
    ctx.beginPath();
    ctx.ellipse(x, y - 42 * scale, 38 * scale * auraScale, 12 * scale * auraScale, -0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawCharacterFrame(ctx, x, y, "corizaz", facing, 9999, scale, mode, { hideWeapon: true });
    return true;
  }

  function drawSleepingCorizaz(ctx, x, y, scale = 1) {
    const now = Date.now();
    const pulse = Math.sin(now / 520);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.fillStyle = "rgba(4, 18, 10, 0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 62, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(0, -82, 8, 0, -82, 112);
    aura.addColorStop(0, "rgba(217, 255, 182, 0.62)");
    aura.addColorStop(0.34, "rgba(88, 230, 132, 0.34)");
    aura.addColorStop(0.72, "rgba(22, 129, 94, 0.2)");
    aura.addColorStop(1, "rgba(9, 42, 30, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, -78, 76 + pulse * 4, 106 + pulse * 7, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i += 1) {
      const phase = (now / 1300 + i * 0.33) % 1;
      ctx.strokeStyle = `rgba(170, 255, 166, ${0.22 * (1 - phase)})`;
      ctx.lineWidth = 3 - i * 0.4;
      ctx.beginPath();
      ctx.ellipse(0, -72, 42 + phase * 42, 14 + phase * 18, -0.12 + i * 0.17, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = 0; i < 7; i += 1) {
      const drift = ((now / (1200 + i * 140)) + i * 0.19) % 1;
      const side = i % 2 ? 1 : -1;
      const startX = side * (14 + i * 4);
      const startY = -28 - i * 8;
      ctx.strokeStyle = `rgba(151, 255, 181, ${0.23 * (1 - drift) + 0.05})`;
      ctx.lineWidth = 4.2 - i * 0.22;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(
        startX + side * (18 + drift * 16),
        startY - 24,
        startX - side * (24 + drift * 12),
        startY - 47,
        startX + side * (8 + drift * 24),
        startY - 76 - drift * 24
      );
      ctx.stroke();
    }
    ctx.restore();

    const body = verticalGradient(ctx, -95, 2, "#195b3e", "#071c15");
    const robe = verticalGradient(ctx, -88, 4, "#3aa96a", "#0b2d20");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-37, 0);
    ctx.quadraticCurveTo(-31, -45, -12, -81);
    ctx.quadraticCurveTo(0, -104, 14, -81);
    ctx.quadraticCurveTo(33, -45, 38, 0);
    ctx.quadraticCurveTo(0, 12, -37, 0);
    ctx.fill();

    ctx.strokeStyle = "rgba(236, 229, 143, 0.52)";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-31, -2);
    ctx.quadraticCurveTo(-14, 6, 0, 7);
    ctx.quadraticCurveTo(17, 6, 32, -2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(136, 255, 157, 0.36)";
    ctx.lineWidth = 1.7;
    for (let i = 0; i < 5; i += 1) {
      const runeX = -19 + i * 9.5;
      ctx.beginPath();
      ctx.moveTo(runeX, -21);
      ctx.lineTo(runeX + 3, -16);
      ctx.lineTo(runeX - 2, -12);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(191, 255, 186, 0.52)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-23, -10);
    ctx.quadraticCurveTo(-15, -46, 0, -82);
    ctx.quadraticCurveTo(15, -46, 24, -10);
    ctx.stroke();

    ctx.strokeStyle = "#0b2b20";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-18, -48);
    ctx.quadraticCurveTo(-37, -38, -45, -19);
    ctx.moveTo(18, -49);
    ctx.quadraticCurveTo(37, -40, 45, -20);
    ctx.stroke();
    ctx.fillStyle = "#d9f1b8";
    ctx.beginPath();
    ctx.ellipse(-46, -17, 6, 5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(46, -18, 6, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    fillRoundRect(ctx, -19, -73, 38, 32, 12, robe, "rgba(209, 255, 179, 0.34)");
    ctx.fillStyle = "rgba(5, 18, 12, 0.62)";
    ctx.beginPath();
    ctx.ellipse(0, -56, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, -13, -64, 26, 22, 9, "#d9f1b8", "rgba(9, 31, 21, 0.52)");
    ctx.fillStyle = "#eef8cf";
    ctx.beginPath();
    ctx.moveTo(-8, -42);
    ctx.quadraticCurveTo(0, -32, 9, -42);
    ctx.quadraticCurveTo(2, -36, -8, -42);
    ctx.fill();
    ctx.strokeStyle = "#22352b";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-6, -52);
    ctx.quadraticCurveTo(-2, -49, 2, -52);
    ctx.moveTo(7, -52);
    ctx.quadraticCurveTo(11, -49, 15, -52);
    ctx.moveTo(2, -49);
    ctx.quadraticCurveTo(4, -46, 1, -44);
    ctx.stroke();

    ctx.fillStyle = verticalGradient(ctx, -104, -71, "#7cf299", "#236344");
    ctx.beginPath();
    ctx.moveTo(-30, -73);
    ctx.quadraticCurveTo(-20, -101, 0, -118);
    ctx.quadraticCurveTo(22, -99, 30, -73);
    ctx.quadraticCurveTo(0, -61, -30, -73);
    ctx.fill();
    ctx.strokeStyle = "rgba(218, 255, 178, 0.5)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(246, 235, 142, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, -78);
    ctx.quadraticCurveTo(0, -66, 18, -78);
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(182, 255, 156, 0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(31, -78);
    ctx.lineTo(44, -3);
    ctx.stroke();
    const crystal = ctx.createRadialGradient(34, -83, 1, 34, -83, 19);
    crystal.addColorStop(0, "rgba(244, 255, 207, 0.95)");
    crystal.addColorStop(0.45, "rgba(143, 255, 164, 0.72)");
    crystal.addColorStop(1, "rgba(49, 169, 101, 0)");
    ctx.fillStyle = crystal;
    ctx.beginPath();
    ctx.arc(34, -83, 19 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#e7ffbf";
    ctx.beginPath();
    ctx.arc(34, -83, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFear(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(216,228,239,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, -31, 36, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = verticalGradient(ctx, -77, 1, "#2a2a38", "#090910");
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.quadraticCurveTo(-20, -43, 0, -78);
    ctx.quadraticCurveTo(20, -43, 28, 0);
    ctx.closePath();
    ctx.fill();
    fillRoundRect(ctx, -10, -60, 20, 15, 7, "#d8e4ef", null);
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-5, -55, 2, 0, Math.PI * 2);
    ctx.arc(5, -55, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(216,228,239,0.42)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, -30, 20 + i * 10, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHanoSprite(ctx, x, y, scale = 1, mode = "battle") {
    const pulse = Math.sin(Date.now() / 310);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawSoftShadow(ctx, 0, 8, mode === "map" ? 23 : 31, mode === "map" ? 6 : 9);

    ctx.fillStyle = "rgba(179, 33, 44, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, -42, 42 + pulse * 2, 52, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5f3925";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(31, -95);
    ctx.lineTo(41, 3);
    ctx.stroke();
    fillRoundRect(ctx, 10, -104, 46, 20, 5, verticalGradient(ctx, -104, -84, "#d0c8b4", "#58534c"), "rgba(0,0,0,0.48)");
    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ctx.fillRect(17, -100, 27, 3);

    ctx.fillStyle = verticalGradient(ctx, -84, 9, "#d7323e", "#5e0b12");
    ctx.beginPath();
    ctx.moveTo(-30, -66);
    ctx.quadraticCurveTo(-46, -34, -36, 8);
    ctx.lineTo(35, 8);
    ctx.quadraticCurveTo(46, -35, 30, -66);
    ctx.quadraticCurveTo(0, -82, -30, -66);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = 2;
    ctx.stroke();

    fillRoundRect(ctx, -16, -43, 32, 42, 6, verticalGradient(ctx, -43, -1, "#5c2d28", "#201111"), "rgba(0,0,0,0.42)");
    ctx.fillStyle = "#d3ad5f";
    ctx.fillRect(-17, -17, 34, 5);
    fillRoundRect(ctx, -4, -20, 8, 10, 2, "#9e712e", "rgba(0,0,0,0.32)");

    fillRoundRect(ctx, -19, -2, 11, 19, 4, "#231719", null);
    fillRoundRect(ctx, 7, -2, 11, 19, 4, "#191113", null);
    fillRoundRect(ctx, -23, 13, 18, 6, 3, "#0d0b0c", null);
    fillRoundRect(ctx, 4, 13, 18, 6, 3, "#0d0b0c", null);

    fillRoundRect(ctx, -34, -47, 13, 40, 5, verticalGradient(ctx, -47, -7, "#b4212d", "#501016"), "rgba(0,0,0,0.36)");
    fillRoundRect(ctx, 21, -47, 13, 40, 5, verticalGradient(ctx, -47, -7, "#b4212d", "#501016"), "rgba(0,0,0,0.36)");
    fillRoundRect(ctx, -37, -9, 14, 11, 5, verticalGradient(ctx, -9, 2, "#dfaa80", "#8b543f"), "rgba(0,0,0,0.32)");
    fillRoundRect(ctx, 23, -9, 14, 11, 5, verticalGradient(ctx, -9, 2, "#dfaa80", "#8b543f"), "rgba(0,0,0,0.32)");

    fillRoundRect(ctx, -21, -88, 42, 31, 12, verticalGradient(ctx, -88, -57, "#9f1520", "#4c080f"), "rgba(0,0,0,0.42)");
    fillRoundRect(ctx, -13, -79, 26, 25, 8, verticalGradient(ctx, -79, -54, "#e0ad84", "#986045"), "rgba(0,0,0,0.34)");
    ctx.fillStyle = "#211414";
    ctx.beginPath();
    ctx.ellipse(0, -78, 17, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#140d0e";
    ctx.beginPath();
    ctx.moveTo(-16, -75);
    ctx.lineTo(-7, -82);
    ctx.lineTo(-2, -74);
    ctx.lineTo(4, -83);
    ctx.lineTo(13, -74);
    ctx.lineTo(16, -67);
    ctx.lineTo(-16, -67);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#211414";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-10, -66);
    ctx.lineTo(-3, -68);
    ctx.moveTo(10, -66);
    ctx.lineTo(3, -68);
    ctx.stroke();
    ctx.fillStyle = "#0e0b0c";
    ctx.beginPath();
    ctx.arc(-7, -63, 1.7, 0, Math.PI * 2);
    ctx.arc(7, -63, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(61, 17, 17, 0.82)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -54);
    ctx.quadraticCurveTo(0, -57, 7, -54);
    ctx.stroke();

    ctx.strokeStyle = "#6b4328";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-26, -48);
    ctx.lineTo(-38, -7);
    ctx.stroke();
    fillRoundRect(ctx, -51, -20, 29, 16, 4, verticalGradient(ctx, -20, -4, "#c8c2ae", "#59544c"), "rgba(0,0,0,0.46)");

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, -55);
    ctx.quadraticCurveTo(-8, -26, -18, 5);
    ctx.moveTo(18, -55);
    ctx.quadraticCurveTo(8, -28, 17, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawHammerElf(ctx, x, y, scale = 1) {
    drawHanoSprite(ctx, x, y, scale, "battle");
  }

  function renderParty() {
    const list = $("party-list");
    if (!list || !state) return;
    list.innerHTML = "";
    activePartyMembers().forEach((member) => {
      const card = document.createElement("article");
      const dead = member.hp <= 0;
      card.className = `party-card is-active-party ${dead ? "is-fallen" : ""}`;
      const hpPct = Math.max(0, Math.round((member.hp / member.maxHp) * 100));
      const mpPct = member.maxMp ? Math.max(0, Math.round((member.mp / member.maxMp) * 100)) : 0;
      const skills = availableSkills(member).map((skill) => skill.name).join(", ");
      const weapon = equippedWeapon(member);
      const armor = equippedArmor(member);
      const accessory = equippedAccessory(member);
      card.innerHTML = `
        <header><strong>${member.name}</strong><span>${dead ? "KO" : `Lv ${member.level}`}</span></header>
        <div class="mini-meter hp-meter" role="progressbar" aria-label="${member.name} health" aria-valuemin="0" aria-valuemax="${member.maxHp}" aria-valuenow="${Math.max(0, member.hp)}"><span style="width:${hpPct}%"></span></div>
        <div class="mini-meter mp-meter" role="progressbar" aria-label="${member.name} magic" aria-valuemin="0" aria-valuemax="${member.maxMp}" aria-valuenow="${Math.max(0, member.mp)}"><span style="width:${mpPct}%"></span></div>
        <p>${member.role} | HP ${Math.max(0, member.hp)}/${member.maxHp} | MP ${member.mp}/${member.maxMp}</p>
        <p>Weapon: ${weapon.name}${weapon.bonus ? ` (+${weapon.bonus})` : ""}</p>
        <p>Armor: ${armor.name}${armor.defBonus ? ` (+${armor.defBonus})` : ""} | Accessory: ${accessory.name}</p>
        <p>Skills: ${skills || "Attack, then sincere concern"}</p>
      `;
      list.appendChild(card);
    });
  }

  function renderInventory() {
    const list = $("inventory-list");
    if (!list || !state) return;
    list.innerHTML = "";
    const entries = Object.entries(state.inventory).filter(([name, count]) => count > 0 && !regularInventoryHiddenItems.has(name));
    if (!entries.length) {
      list.innerHTML = `<p class="quest-text">Empty, which is bold for an RPG.</p>`;
      return;
    }
    entries.forEach(([name, count]) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <canvas class="item-row-icon" width="42" height="42" data-inventory-icon="${inventoryItemImageKey(name)}" aria-hidden="true"></canvas>
        <span><strong>${name}</strong><small>${inventoryItemText(name)}</small></span>
        <strong>x${count}</strong>
      `;
      list.appendChild(row);
    });
    drawInventoryIcons(list);
  }

  function drawInventoryIcons(root = document) {
    root.querySelectorAll("canvas[data-inventory-icon]").forEach((canvas) => {
      drawInventoryItemCanvas(canvas, canvas.dataset.inventoryIcon || "item:gold");
    });
  }

  function renderQuest() {
    const q = $("quest-text");
    if (!q || !state) return;
    q.textContent = questText();
  }

  function questText() {
    if (typeof gameConfig.questText === "function") return gameConfig.questText(state);
    const side = sideQuestText();
    if (side) return side;
    syncQuestJournal();
    const tracked = sideQuestById.get(state.questJournal?.trackedId);
    if (tracked && sideQuestStatus(tracked) !== "completed") return `Tracked: ${tracked.name} — ${sideQuestGuidance(tracked)} Location: ${tracked.hint}.`;
    if (state.flags.gameComplete) return state.flags.yanSacrificed
      ? "Darhyn is defeated. Yan sacrificed himself in dragon form to end the fight. Track an unfinished sidequest from the Quest Journal."
      : "Darhyn is defeated. Open the Quest Journal to choose unfinished business.";
    if (state.areaId === "darhynCastle" && !state.flags.waterSpellDream) return "Defeat the suspiciously fragile Darhyn and find the Water Orb Spell.";
    if (!state.flags.metZelin) return "Talk to Zelin in Krendon after Derlin wakes you up.";
    if (!state.flags.milkedBetsy) return "Find Old Betsy in Krendon's southwest stable and finish the milk chore.";
    if (!state.flags.switchbackSurveyed && (state.areaId === "hawkSwitchback" || state.areaId === "hawkMountains")) return "Follow the main switchback until Dalin can read the pale-stone fork.";
    if (!state.flags.tustorRaised) return "Reach the northern shrine in the Merfolk Shoals and use the dream-born Water Orb Spell.";
    if (!state.flags.capturedByLithar) return "Return across the grassland toward Tealsburg and ask King Garkin about Darhyn.";
    if (!state.flags.yanFreed) return "Find Old Yan in Marhyn's west cells and break out together.";
    if (!state.flags.marhynKeyring) return "Search Marhyn's armory for the prison keyring. It opens both the lower vault and the east tower.";
    if (!state.inventory["Derlin Cell Key"]) return "Use the armory keyring to enter Marhyn's lower vault, then search the decorative alcove for Derlin's separate cell key.";
    if (!hasParty("derlin")) return "Take Derlin's cell key to the east tower and unlock his cell before leaving Marhyn's castle.";
    if (!state.flags.yanVanished) return "Escape Marhyn's castle and follow the forest road.";
    if (!state.flags.runeSword) return state.areaId === "deepForest"
      ? "Follow the feather scratches along Deep Forest's center trail."
      : "Continue through Deep Forest until the eagles deliver the Rune Sword.";
    if (!state.flags.lightSword && !state.flags.corizazLairRevealed) return "Find the Freeton townsgirl; the Rune Sword is pulling toward her.";
    if (!state.flags.lightSword) return "Enter Corizaz's hidden lair under Freeton and defeat the sleeping wizard.";
    if (!state.flags.escapedFear) return "Fight through the Skull Knights on King's Highway until Yan finds the only winning move.";
    if (!state.flags.yvonneJoined) return "Meet the king in Tealsburg, then catch the Tealsburg thief twins.";
    if (!state.flags.reachedBreshenPath) return "Follow Northern Path until Yvonne can interpret the paired-tree trail marks.";
    if (!state.flags.valenaJoined) return "Reach Breshen, reunite with Dalin, and meet his sister Valena.";
    if (!state.flags.hanoDefeated) return "Challenge Hano and defend Valena's right to choose her own path.";
    if (!state.flags.readyForRathskeller) return "Compare the standards, wind, and patrol tracks at the Savannah's main crossing.";
    if (!state.flags.windSpell) return "Find the Wind Spell inside the ten doors.";
    if (!state.flags.litharDone) return "Defeat Lithar one last time.";
    return "Face Death Lord Darhyn with Yan's Wind Spell.";
  }

  function sideQuestText() {
    if (state.areaId === "oldMill" && !state.flags.millSaved) {
      if (!state.flags.millQuest) return "Talk to Martha in the Old Mill and investigate the missing bell clapper.";
      return state.inventory["Rune Sword"]
        ? "Use the Rune Sword to defeat the Dust Knight in the Old Mill gear room."
        : "The Dust Knight is too enchanted for ordinary steel. Return after you earn the Rune Sword.";
    }
    if (state.areaId === "skyShrine" && !state.flags.skyShrineSolved) {
      if (!state.flags.starWestObserved || !state.flags.starEastObserved) return "Observe both star niches, then compare their light and shadows at the central shrine.";
      return "Return to the central Star Shrine with both observations.";
    }
    if (state.areaId === "tideCavern" && !state.flags.tideRegentDefeated) {
      if (!state.flags.tideQuest) return "Speak with the Tide Priest about the slime monarchy.";
      if (!state.flags.tideWestSluice || !state.flags.tideEastSluice) return "Open both Tide Cavern sluices to collapse the Regent's pressure wards.";
      return "Defeat the River Slime Regent in Tide Cavern.";
    }
    if (state.areaId === "moonMarsh" && !state.flags.marshBookRecovered) {
      if (!state.flags.marshQuest) return "Find the Marsh Jester in Moon Marsh.";
      if (!state.flags.marshBlueReeds || !state.flags.marshSilverReeds) return "Inspect the blue and silver reed caches to identify the real wisp.";
      return "Beat the real Marsh Wisp and recover the joke book.";
    }
    if (state.areaId === "marketMaze" && !state.flags.marketLedgerRecovered) {
      return state.flags.marketQuest ? "Defeat the Paper Mimic in the Tealsburg Market Maze." : "Ask the Market Scribe about the missing ledger.";
    }
    if (state.areaId === "glassCaves" && !state.flags.glassCavesCalmed) {
      if (!state.inventory["Scribe Pass"]) return "The Glass Miner wants written proof from the Market Maze before opening this side quest.";
      if (!state.flags.glassQuest) return "Talk to the Glass Miner about the cave's sandwich problem.";
      if (!state.flags.glassLowResonator || !state.flags.glassHighResonator) return "Tune the low and high crystal resonators before confronting the mole.";
      return "Defeat the Crystal Mole in the Glass Caves.";
    }
    return "";
  }

    function tilePassable(x, y, dx = 0, dy = 0) {
      const rows = area().map;
      if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return false;
      const char = rows[y][x];
      if (waterBridgeAt(rows, x, y, char)) return bridgeTravelAllowed(rows, x, y, dx, dy);
      if (char === "~") return false;
      return !["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c"].includes(char);
    }

  function coordinatePassable(areaId, x, y) {
    const rows = areas[areaId]?.map;
    const char = rows?.[y]?.[x];
    if (!char || char === "~") return false;
    return !["#", "^", "T", "t", "p", "b", "H", "r", "w", "d", "f", "g", "x", "q", "c"].includes(char);
  }

  function modalOpen() {
    return ["menu-modal", "guide-modal", "creator-modal", "item-modal", "coach-modal", "ending-scene"].some((id) => {
      const el = $(id);
      return el && !el.classList.contains("is-hidden");
    });
  }

  function transitionPending() {
    return Boolean(state?.pendingTransition);
  }

  function dialogFocusables(root) {
    return [...root.querySelectorAll('button:not([disabled]):not(.is-hidden), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length && !element.closest("[inert]"));
  }

  function refreshDialogInertness() {
    const active = activeManagedDialogId ? $(activeManagedDialogId) : null;
    [$("title-screen"), $("game-screen"), ...managedDialogIds.map($)].filter(Boolean).forEach((element) => {
      element.inert = Boolean(active && element !== active);
    });
  }

  function showManagedDialog(id, initialFocus = "button:not([disabled])") {
    const dialog = $(id);
    if (!dialog) return false;
    const activeStoryDialog = ["dialogue", "cutscene"].includes(activeManagedDialogId)
      && visibleElement(activeManagedDialogId);
    if (activeStoryDialog && activeManagedDialogId !== id) return false;
    if (!activeManagedDialogId && !dialogReturnFocus) {
      dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    managedDialogIds.forEach((otherId) => {
      if (otherId === id) return;
      const other = $(otherId);
      if (!other?.classList.contains("is-hidden")) {
        other.classList.add("is-hidden");
        other.setAttribute("aria-hidden", "true");
      }
    });
    activeManagedDialogId = id;
    dialog.classList.remove("is-hidden");
    dialog.setAttribute("aria-hidden", "false");
    refreshDialogInertness();
    requestAnimationFrame(() => {
      const target = typeof initialFocus === "string" ? dialog.querySelector(initialFocus) : initialFocus;
      (target || dialogFocusables(dialog)[0])?.focus?.({ preventScroll: true });
    });
    return true;
  }

  function restoreManagedDialogFocus() {
    const target = dialogReturnFocus;
    dialogReturnFocus = null;
    requestAnimationFrame(() => {
      if (activeManagedDialogId) return;
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
      else $("map-canvas")?.focus({ preventScroll: true });
    });
  }

  function hideManagedDialog(id, restoreFocus = true) {
    const dialog = $(id);
    dialog?.classList.add("is-hidden");
    dialog?.setAttribute("aria-hidden", "true");
    if (activeManagedDialogId === id) activeManagedDialogId = "";
    refreshDialogInertness();
    if (restoreFocus) restoreManagedDialogFocus();
  }

  function trapDialogFocus(event) {
    if (event.key !== "Tab" || !activeManagedDialogId) return false;
    const dialog = $(activeManagedDialogId);
    const controls = dialog ? dialogFocusables(dialog) : [];
    if (!controls.length) return false;
    const current = controls.indexOf(document.activeElement);
    const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next].focus();
    return true;
  }

  function move(dx, dy) {
    if (!state || cutsceneActive || transitionPending() || activeBattle || !$("dialogue").classList.contains("is-hidden") || modalOpen()) return;
    const nextFacing = directionFromDelta(dx, dy);
    state.facing = nextFacing;
    const nx = state.x + dx;
    const ny = state.y + dy;
    const exit = exitFor(nx, ny);
    if (exit) {
      render();
      tryExit(exit);
      return;
    }
    const adjacentEvent = adjacentEventAt(nx, ny);
    if (adjacentEvent) {
      render();
      triggerEvent(adjacentEvent);
      return;
    }
    const rows = area().map;
    const currentChar = rows[state.y]?.[state.x];
    if (waterBridgeAt(rows, state.x, state.y, currentChar) && !bridgeExitAllowed(rows, state.x, state.y, dx, dy)) {
      render();
      describeBlockedTile(nx, ny);
      return;
    }
    if (!tilePassable(nx, ny, dx, dy)) {
      render();
      describeBlockedTile(nx, ny);
      return;
    }
    pushPartyTrail(state.x, state.y, nextFacing);
    state.x = nx;
    state.y = ny;
    state.movedAt = Date.now();
    state.steps += 1;
    if (state.steps === 1) coach("interaction");
    render();
    keepMapPlayerInViewport({ x: nx, y: ny });
    const event = visibleEventAt(nx, ny);
    if (event) {
      triggerEvent(event);
      return;
    }
    maybeEncounter();
  }

  function mapMovementAvailable() {
    return Boolean(state && !$("game-screen").classList.contains("is-hidden") && !cutsceneActive && !transitionPending() && !activeBattle && $("dialogue").classList.contains("is-hidden") && !modalOpen());
  }

  function trackMoveKeyDown(key, dx, dy) {
    if (!mapMovementAvailable()) return;
    heldMoveKey = key;
    heldMoveDx = dx;
    heldMoveDy = dy;
  }

  function trackMoveKeyUp(key) {
    if (!heldMoveKey || key !== heldMoveKey) return;
    heldMoveKey = "";
    heldMoveDx = 0;
    heldMoveDy = 0;
  }

  function clearHeldMove() {
    heldMoveKey = "";
    heldMoveDx = 0;
    heldMoveDy = 0;
  }

  function setTouchMove(dir) {
    const delta = DIRS[dir];
    if (!delta) {
      clearHeldMove();
      return;
    }
    heldMoveKey = "touch";
    heldMoveDx = delta[0];
    heldMoveDy = delta[1];
  }

  function requestMove(dx, dy) {
    if (!state) return;
    const now = Date.now();
    const stillAnimating = state.steps > 0 && now - (state.movedAt || 0) < WALK_MS;
    const coolingDown = now - lastMoveInputAt < WALK_MS;
    if (stillAnimating || coolingDown) return;
    lastMoveInputAt = now;
    move(dx, dy);
  }

  function resetCompass(controls) {
    if (!controls) return;
    controls.classList.remove("is-pressed");
    controls.style.setProperty("--stick-x", "0px");
    controls.style.setProperty("--stick-y", "0px");
    controls.querySelectorAll(".compass-button").forEach((button) => button.classList.remove("is-active"));
    clearHeldMove();
  }

  function updateCompassFromPointer(controls, event) {
    const rect = controls.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const max = rect.width * 0.28;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > max ? max / distance : 1;
    const stickX = rawX * scale;
    const stickY = rawY * scale;
    controls.style.setProperty("--stick-x", `${stickX}px`);
    controls.style.setProperty("--stick-y", `${stickY}px`);

    if (distance < rect.width * 0.12) {
      controls.querySelectorAll(".compass-button").forEach((button) => button.classList.remove("is-active"));
      clearHeldMove();
      return;
    }
    const dir = Math.abs(rawX) > Math.abs(rawY)
      ? (rawX > 0 ? "right" : "left")
      : (rawY > 0 ? "down" : "up");
    controls.querySelectorAll(".compass-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.dir === dir);
    });
    if (advanceDialogueWithMove()) {
      resetCompass(controls);
      return;
    }
    setTouchMove(dir);
    requestMove(heldMoveDx, heldMoveDy);
  }

  function describeBlockedTile(x, y) {
    const char = area().map[y]?.[x];
    const key = `${state.areaId}:${x}:${y}:${char}`;
    if (tileHasDoorEvent(x, y)) return;
    if (char === "H" || char === "r" || char === "w" || char === "d" || char === "x") {
      if (!shouldShowBlockedHint("scenery-door", key)) return;
      say([
        ["Narrator", "You try the door. The house remains convincingly house-shaped."],
        ["Narrator", "If a building has an errand inside, it will have a person, chest, or obvious marker. Otherwise it is scenery with a mortgage."]
      ]);
    } else if (char === "f") {
      if (!shouldShowBlockedHint("fence", key)) return;
      say([["Narrator", "A fence blocks the way. It is doing one job and, frankly, doing it well."]]);
    } else if (char === "c") {
      if (!shouldShowBlockedHint("counter", key)) return;
      say([["Narrator", "The counter blocks the way. Capitalism has excellent collision detection."]]);
    }
  }

  function shouldShowBlockedHint(type, key) {
    const now = Date.now();
    if (lastBlockedHint.key === key && now - lastBlockedHint.at < 2600) return false;
    lastBlockedHint = { key, at: now };
    if (!blockedHintSeenTypes.has(type)) {
      blockedHintSeenTypes.add(type);
      return true;
    }
    return Math.random() < 0.1;
  }

  function pushPartyTrail(x, y, facing) {
    state.partyTrail = [
      { x, y, facing, areaId: state.areaId, movedAt: Date.now() },
      ...(state.partyTrail || []).filter((step) => step.areaId === state.areaId)
    ].slice(0, 12);
  }

  function directionFromDelta(dx, dy) {
    if (dx < 0) return "left";
    if (dx > 0) return "right";
    if (dy < 0) return "up";
    return "down";
  }

  function exitFor(x, y) {
    if (!area().exits) return null;
    if (y < 0) return area().exits.find((exit) => exit.edge === "north");
    if (y >= area().map.length) return area().exits.find((exit) => exit.edge === "south");
    if (x < 0) return area().exits.find((exit) => exit.edge === "west");
    if (x >= area().map[0].length) return area().exits.find((exit) => exit.edge === "east");
    return null;
  }

  function tryExit(exit) {
    if (exit.requires && !hasFlag(exit.requires)) {
      say(exit.blockedLines || [["Narrator", "The way is not ready yet. " + questText()]]);
      return;
    }
    if (exit.requiresItem && !hasItem(exit.requiresItem)) {
      say(exit.blockedLines || [["Narrator", `The way is not ready yet. You need ${exit.requiresItem}.`]]);
      return;
    }
    if (exit.requiresParty && !hasParty(exit.requiresParty)) {
      say([["Narrator", "Someone important is missing. The plot refuses to proceed without them."]]);
      return;
    }
    travelTo(exit.to, exit.x, exit.y);
  }

  function beginPendingTransition(eventId, phase = "pending") {
    const definition = criticalTransitions[eventId];
    if (!definition) return false;
    state.pendingTransition = { eventId, type: definition.type, phase, ...definition };
    saveLocal();
    return true;
  }

  function completePendingTransition(eventId) {
    if (!eventId || state.pendingTransition?.eventId !== eventId) return;
    state.completedEvents[eventId] = true;
    state.pendingTransition = null;
  }

  function resumePendingTransition() {
    const pending = state?.pendingTransition;
    if (!pending) return false;
    if (pending.eventId === "zoom_travel") {
      const destination = zoomDestinations.find((entry) => entry.id === pending.areaId);
      if (!destination) {
        state.pendingTransition = null;
        saveLocal();
        return false;
      }
      const caster = pending.source === "spell" ? memberById(pending.casterId) : null;
      const speaker = caster?.name || (pending.source === "item" ? zoomItemName : "Zoom");
      const line = pending.source === "item"
        ? `The interrupted ${zoomItemName} trip finishes pulling the party to ${destination.label}.`
        : `The interrupted Zoom spell finishes carrying the party to ${destination.label}.`;
      state.pendingTransition = null;
      travelTo(destination.id);
      say([[speaker, line]]);
      return true;
    }
    if (pending.eventId === "water_orb") {
      state.inventory["Water Orb Spell"] = Math.max(1, state.inventory["Water Orb Spell"] || 0);
      state.inventory["Water Orb Focus"] = Math.max(1, state.inventory["Water Orb Focus"] || 0);
      flag("waterSpellDream");
      travelTo("krendon", 15, 15, true);
      say([["Narrator", "The interrupted Water Orb Spell finishes folding the dream castle into a morning in Krendon. The focus survives the crossing; the true Orb remains elsewhere."]]);
      return true;
    }
    if (pending.eventId === "lithar_ambush") {
      flag("capturedByLithar");
      setParty(["tarthur"]);
      travelTo("marhynCastle", 3, 14, true);
      say([["Narrator", "The interrupted capture resumes beneath Marhyn's castle. The separated party remains safely recorded in the roster."]]);
      return true;
    }
    if (endingTransitionId && pending.eventId === endingTransitionId) {
      if (gameConfig.endingReplay === "dreamquest") playEndingSequence();
      else showEndingScene();
      return true;
    }
    return false;
  }

  function travelTo(areaId, x, y, forceIntro = false) {
    const firstVisit = forceIntro || !state.completedEvents[`visit_${areaId}`];
    state.areaId = areaId;
    const next = areas[areaId];
    const start = next.start || [7, 7];
    state.x = x ?? start[0];
    state.y = y ?? start[1];
    state.partyTrail = [];
    state.facing = "down";
    state.movedAt = Date.now();
    lastMoveInputAt = 0;
    state.steps += forceIntro ? 0 : 1;
    markAreaVisited(areaId);
    if (safeCheckpointAreaIds.has(areaId)) {
      state.checkpoint = { areaId, x: state.x, y: state.y };
    }
    if (state.pendingTransition?.type === "travel" && state.pendingTransition.areaId === areaId) {
      completePendingTransition(state.pendingTransition.eventId);
    }
    loadAreaAssets(areaId);
    render();
    saveLocal();
    if (!state.coaching.seen.autosave) coach("autosave");
    if (firstVisit) {
      say([[next.name, areaIntro(areaId)]], () => {
        const event = visibleEventAt(state.x, state.y);
        if (event) triggerEvent(event);
      }, { advanceWithMove: true });
    }
  }

  async function waitForCutsceneImage(image) {
    const loaded = image.complete
      ? image.naturalWidth > 0
      : await new Promise((resolve) => {
          image.addEventListener("load", () => resolve(true), { once: true });
          image.addEventListener("error", () => resolve(false), { once: true });
        });
    if (!loaded) return false;
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // A decoded frame is ideal, but a successfully loaded image is still safe to show.
      }
    }
    return image.complete && image.naturalWidth > 0;
  }

  function showCutscene(id, done, options = {}) {
    const scene = cutsceneImages[id];
    const src = scene ? assets[scene.assetKey] : "";
    const overlay = $("cutscene");
    const image = $("cutscene-image");
    if (!src || !overlay || !image) {
      if (done) done();
      return;
    }
    loadArtAssets([scene.assetKey]);
    if (activeCutsceneTimer) {
      clearTimeout(activeCutsceneTimer);
      activeCutsceneTimer = null;
    }
    const token = ++activeCutsceneToken;
    cutsceneActive = true;
    cutsceneDone = done || null;
    image.alt = scene.alt || "";
    const cutsceneDuration = options.duration || scene.duration || 2600;
    const playbackDuration = reducedMotionEnabled() ? Math.max(450, cutsceneDuration * 0.25) : cutsceneDuration;
    overlay.style.setProperty("--cutscene-duration", `${playbackDuration}ms`);
    overlay.classList.remove("is-ready", "is-load-error");
    overlay.classList.add("is-loading");
    const status = $("cutscene-status");
    if (status) status.textContent = "Loading scene...";
    showManagedDialog("cutscene", "#cutscene-skip");
    image.src = src;
    void waitForCutsceneImage(image).then((loaded) => {
      if (!cutsceneActive || token !== activeCutsceneToken) return;
      overlay.classList.remove("is-loading");
      overlay.classList.toggle("is-load-error", !loaded);
      overlay.classList.add("is-ready");
      if (status) status.textContent = loaded ? "Scene ready." : (scene.alt ? `Scene artwork unavailable. ${scene.alt}` : "Scene artwork unavailable.");
      const frame = overlay.querySelector(".cutscene-frame");
      if (frame) {
        frame.style.animation = "none";
        void frame.offsetHeight;
        frame.style.animation = "";
      }
      activeCutsceneTimer = setTimeout(finishCutscene, playbackDuration);
    });
  }

  function finishCutscene() {
    if (!cutsceneActive && !cutsceneDone) return;
    activeCutsceneToken += 1;
    if (activeCutsceneTimer) {
      clearTimeout(activeCutsceneTimer);
      activeCutsceneTimer = null;
    }
    hideManagedDialog("cutscene", false);
    cutsceneActive = false;
    const done = cutsceneDone;
    cutsceneDone = null;
    if (done) done();
    if (!activeManagedDialogId) restoreManagedDialogFocus();
    render();
  }

  function endingSceneVisible() {
    const scene = $("ending-scene");
    return Boolean(scene && !scene.classList.contains("is-hidden"));
  }

  function renderEndingSceneContent() {
    const creditList = $("ending-credit-list");
    const sidequestList = $("ending-sidequest-list");
    const sidequestCount = $("ending-sidequest-count");
    if (creditList) {
      creditList.innerHTML = endingCredits.map(([role, name]) => `
        <article>
          <span>${role}</span>
          <strong>${name}</strong>
        </article>
      `).join("");
    }
    if (!sidequestList || !sidequestCount) return;
    syncQuestJournal();
    const completeCount = endingSideQuests.filter((quest) => sideQuestStatus(quest) === "completed").length;
    sidequestCount.textContent = `${completeCount}/${endingSideQuests.length} cleared`;
    sidequestList.innerHTML = endingSideQuests.map((quest) => {
      const complete = sideQuestStatus(quest) === "completed";
      return `
        <li class="${complete ? "is-complete" : ""}">
          <span>${complete ? "Cleared" : quest.hint}</span>
          <strong>${quest.name}</strong>
        </li>
      `;
    }).join("");
  }

  function showEndingScene() {
    const scene = $("ending-scene");
    if (!scene) {
      openMenu("quest");
      return;
    }
    if (endingTransitionId) {
      if (!state.pendingTransition || state.pendingTransition.eventId !== endingTransitionId) beginPendingTransition(endingTransitionId, "credits");
      else state.pendingTransition.phase = "credits";
    }
    closeMenu();
    renderEndingSceneContent();
    setCreditsPaused(reducedMotionEnabled());
    showManagedDialog("ending-scene", "#ending-continue");
    playSfx("victory");
    setMusicTheme("victory");
    saveLocal();
    requestAnimationFrame(() => $("ending-continue")?.focus({ preventScroll: true }));
  }

  function setCreditsPaused(paused) {
    const scroll = $("ending-scroll");
    const button = $("credits-toggle");
    scroll?.classList.toggle("is-paused", Boolean(paused));
    if (button) {
      button.setAttribute("aria-pressed", String(Boolean(paused)));
      button.textContent = paused ? "Resume Credits" : "Pause Credits";
    }
  }

  function toggleCreditsPaused() {
    setCreditsPaused(!$("ending-scroll")?.classList.contains("is-paused"));
  }

  function closeEndingScene(openQuestLog = false) {
    const scene = $("ending-scene");
    if (!scene || scene.classList.contains("is-hidden")) return;
    hideManagedDialog("ending-scene", !openQuestLog);
    state.flags.endingCreditsSeen = true;
    if (endingTransitionId) completePendingTransition(endingTransitionId);
    render();
    saveLocal();
    if (openQuestLog) {
      openMenu("quest");
    } else {
      requestAnimationFrame(() => $("map-canvas")?.focus({ preventScroll: true }));
    }
  }

  function playWaterOrbTransition(done) {
    const effect = $("screen-effect");
    if (screenTransitionTimer) clearTimeout(screenTransitionTimer);
    clearHeldMove();
    cutsceneActive = true;
    const finish = () => {
      screenTransitionTimer = null;
      if (effect) effect.className = "screen-effect is-hidden";
      cutsceneActive = false;
      if (done) done();
    };
    if (!effect) return finish();
    playSfx("spell");
    effect.className = "screen-effect is-water-orb";
    screenTransitionTimer = setTimeout(finish, 1500);
  }

  async function playCorizazDrainTransition(done) {
    const effect = $("screen-effect");
    clearHeldMove();
    cutsceneActive = true;
    playSfx("suspense");
    if (effect) {
      effect.className = "screen-effect is-hidden";
      void effect.offsetWidth;
      effect.className = "screen-effect is-corizaz-drain";
    }
    await rawDelay(reducedMotionEnabled() ? 470 : 2350);
    cutsceneActive = false;
    if (effect) effect.className = "screen-effect is-morning-wake";
    done?.();
    playSfx("wake");
    window.setTimeout(() => {
      if (effect?.classList.contains("is-morning-wake")) effect.className = "screen-effect is-hidden";
    }, reducedMotionEnabled() ? 380 : 1900);
  }

  function playEndingSequence() {
    flag("gameComplete");
    flag("yanSacrificed");
    removeParty("yan");
    removeParty("yanOld");
    setMode("complete");
    if (endingTransitionId) beginPendingTransition(endingTransitionId, "cutscene");
    showCutscene("darhynFalls", () => {
      say([
        ["Darhyn", "Impossible. The Power of Air! My second-only weakness!"],
        ["Yan", "Tarthur, keep the Orb safe. Tell Daranor I chose this."],
        ["Narrator", "Yan becomes wind and dragonfire, holds the blast until Darhyn breaks, and leaves the Water Orb in Tarthur's care."],
        ["Derlin", "He saved all of us."],
        ["Narrator", "Daranor is safe enough for the credits."]
      ], showEndingScene);
    });
  }

  function playTustorResurrection() {
    cutsceneActive = true;
    loadArtAssets([...characterAssetKeysForIds(["merwizard"])]);
    playSfx("spell");
    setMusicTheme("water");
    mapEffect = {
      type: "tustorResurrection",
      areaId: state.areaId,
      x: 11,
      y: 2,
      startedAt: Date.now(),
      duration: 2400
    };
    const effect = $("screen-effect");
    if (effect) effect.className = "screen-effect is-resurrection";
    render();

    setTimeout(() => {
      flag("tustorRaised");
      state.completedEvents.tustor_grave = true;
      addItem("Water Scroll", 1);
      playSfx("heal");
      render();
      saveLocal();
    }, 980);

    setTimeout(() => {
      if (effect) effect.className = "screen-effect is-hidden";
      mapEffect = null;
      cutsceneActive = false;
      say([
        ["Narrator", "The dream-born Water Orb Spell pulls blue light from the shoals. The focus channels an echo of the true Orb, and the tide rises around Tustor."],
        ["Tustor", "You carry the Orb's spell and focus, not the Orb. The true Water Orb is outside the world. Darhyn has hidden the path to it."],
        ["Dalin", "Could we get directions less ominous than 'outside the world'?"],
        ["Tustor", "Do not climb back into the Hawk Mountains. Leave the shoals to the south, cross the grassland, and tell King Garkin in Tealsburg what I have told you."]
      ], () => {
        saveLocal();
        render();
      });
    }, 2450);
  }

  function areaIntro(areaId) {
    if (gameConfig.areaIntros?.[areaId]) return gameConfig.areaIntros[areaId];
    const intros = {
      krendon: "Morning in Krendon smells like forge smoke, mountain air, and a cow with combat options.",
      krendonStable: "The southwest stable smells like hay, old wood, and an animal fully aware she is a boss encounter.",
      krendonShop: "The supply counter smells like dried herbs, floor polish, and controlled margins.",
      krendonRoad: "The south road out of Krendon rolls through farms, old signs, and exactly enough danger to justify packing snacks.",
      oldMill: "The Old Mill creaks west of Krendon, which is either charming or a warning from architecture.",
      hawkMountains: "The Hawk Mountains rise in crooked layers. Every ledge looks like it was approved by Jason's backflip committee.",
      hawkSwitchback: "The switchback path cuts down toward the coast. The view is incredible, and so is the chance of ankle betrayal.",
      skyShrine: "The Star Shrine hangs above the mountain road, quiet enough to make everyone's bad ideas audible.",
      merfolkShoals: "The shoals shimmer with coral halls and mourning songs. The merfolk have excellent acoustics and terrible news.",
      tideCavern: "Tide Cavern glows blue under the shoals. Something inside is taking royal titles too seriously.",
      grassland: "The grassland opens wide on the long road toward King Garkin's banners.",
      moonMarsh: "Moon Marsh bubbles under silver reeds. The frogs have unionized and the jokes are missing.",
      marhynCastle: "Marhyn's fortress is cold, blue-black, and aggressively locked.",
      marhynHalls: "The central keep folds around Marhyn's cells, armory, and locked east tower.",
      marhynWestCells: "The west cells turn in on themselves. Somewhere inside, Old Yan is waiting with opinions.",
      marhynArmory: "Marhyn's armory is all counters, key hooks, and bad intentions filed alphabetically.",
      marhynDerlinTower: "The east tower keeps its prisoner behind enough locks to qualify as architecture.",
      marhynVault: "The lower vault is a side route for supplies, greed, and getting briefly lost on purpose.",
      forest: "The forest path twists toward Freeton. The trees seem normal. That is how they get you.",
      deepForest: "The deep forest bends around old stones, old roots, and one path that clearly enjoys confusing people.",
      freeton: "Freeton looks pleasant enough, which in RPG terms means somebody is hiding a wizard under it.",
      corizazLair: "Corizaz's hidden lair is quiet, smoky, and professionally asleep.",
      kingsHighway: "The King's Highway is broad, official, and still somehow full of things that want a fight.",
      tealsburg: "Tealsburg rises in banners, towers, and palace gossip.",
      marketMaze: "Tealsburg's market alleys fold around spice stalls, roof ladders, and paperwork with teeth.",
      tealsburgShop: "The market stall interior is smaller than its price confidence.",
      northernPath: "The northern path narrows toward the elven trees of Breshen.",
      breshen: "Breshen lifts into the branches, sacred and airy, with bridges that judge your balance.",
      savannah: "The Savannah Plain stretches hot and bright before the final castle.",
      glassCaves: "The Glass Caves ring under the savannah. Every tunnel reflects the party's most dramatic angle.",
      rathskellerApproach: "The road to Rathskeller is all dust, broken standards, and the feeling that Darhyn has finally read the manual.",
      rathskeller: "Castle Rathskeller waits behind ten concentric doors. Darhyn has finally read a defense manual.",
      darhynCastle: "The dream opens in the last place a level-one hero should be."
    };
    const lowToneIntros = {
      darhynCastle: "The dream opens inside Darhyn's castle, where blue light marks a sealed chamber ahead.",
      merfolkShoals: "The shoals shimmer around coral halls and mourning songs for Tustor.",
      grassland: "The grassland opens on the long road toward King Garkin's banners, with no shelter from watching eyes.",
      marhynCastle: "Marhyn's fortress is cold, blue-black, and built to isolate its prisoners.",
      marhynHalls: "The central keep connects Marhyn's cells, armory, vault, and east tower.",
      marhynWestCells: "The west cells turn inward through damp stone. Old Yan is somewhere beyond them.",
      marhynArmory: "Marhyn's armory holds weapons, keys, and the records of her prisoners.",
      marhynDerlinTower: "The east tower holds its prisoner behind layers of iron and stone.",
      marhynVault: "The lower vault descends beneath the main prison halls.",
      forest: "The forest path turns toward Freeton as Old Yan's strength begins to fail.",
      deepForest: "Old stones and feather marks lead through the deep forest toward Freeton.",
      freeton: "Freeton appears peaceful, but the Rune Sword pulls toward something hidden beneath it.",
      kingsHighway: "The King's Highway runs toward Tealsburg through a line of gathering enemies.",
      rathskellerApproach: "Broken standards and patrol fires mark the final road to Rathskeller.",
      rathskeller: "Castle Rathskeller waits behind ten concentric doors and Darhyn's last defenses."
    };
    if (jokeLevel() === "low" && lowToneIntros[areaId]) return lowToneIntros[areaId];
    return intros[areaId] || "The quest continues.";
  }

  function repeatEventLines(event) {
    if (event.repeatLines) return event.repeatLines;
    if (event.id === "mill_martha" && !hasFlag("millSaved")) return hasItem("Rune Sword")
      ? [["Martha", "The Rune Sword is reacting to the gear room. The Dust Knight cannot hide now."]]
      : [["Martha", "The gear-room enchantment needs a Rune Sword. Keep the Zoom Shell; return here from Krendon when you find one."]];
    if (event.id === "tide_priest" && !hasFlag("tideRegentDefeated")) return (!hasFlag("tideWestSluice") || !hasFlag("tideEastSluice"))
      ? [["Tide Priest", "Open both side sluices. Their pressure wards are what make the Regent feel constitutionally invincible."]]
      : [["Tide Priest", "Both wards are down. The Regent can be challenged at the central channel."]];
    if (event.id === "marsh_jester" && !hasFlag("marshBookRecovered")) return (!hasFlag("marshBlueReeds") || !hasFlag("marshSilverReeds"))
      ? [["Marsh Jester", "Study both reed beds before choosing a wisp. False glows hate being observed carefully."]]
      : [["Marsh Jester", "Blue bends away, silver reflects twice. Find the glow that satisfies both clues."]];
    if (event.id === "market_scribe" && !hasFlag("marketLedgerRecovered")) return [["Market Scribe", "The Paper Mimic is still in the central lanes. Look for paperwork pretending not to breathe."]];
    if (event.id === "glass_miner" && !hasFlag("glassCavesCalmed")) return (!hasFlag("glassLowResonator") || !hasFlag("glassHighResonator"))
      ? [["Glass Miner", "Tune the low western resonator and the high southern resonator before approaching the mole."]]
      : [["Glass Miner", "The echo is balanced. The Crystal Mole's shield should be gone."]];
    if (repeatLinesByEventId[event.id]) return repeatLinesByEventId[event.id];
    const speaker = dialogueSpeaker(event.lines?.find((line) => dialogueSpeaker(line) !== "Narrator")) || "Narrator";
    if (eventKind(event) === "npc") {
      return [[speaker, "No new quest marker today. Just atmospheric standing, light pacing, and excellent commitment to the role."]];
    }
    return event.lines || [["Narrator", "Nothing else happens here. The area seems satisfied with its contribution."]];
  }

  function triggerEvent(event) {
    if (!event) return;
    const completed = Boolean(state.completedEvents[event.id]);
    if (state.completedEvents[event.id] && event.persistAfterComplete) {
      say(repeatEventLines(event), null, { event });
      return;
    }
    if (!completed) {
      const gateLines = eventGateLines(event);
      if (gateLines) {
        say(gateLines, null, { event });
        return;
      }
    }
    if (!completed && event.cutscene) {
      showCutscene(event.cutscene, () => triggerEvent({ ...event, cutscene: null }), { duration: event.cutsceneDuration });
      return;
    }
    if (event.boss) {
      if (!completed && event.preBattleLines?.length) {
        say(event.preBattleLines, () => triggerEvent({ ...event, preBattleLines: null }), { event });
        return;
      }
      startBattle(event.boss, () => {
        const transactional = beginPendingTransition(event.id);
        if (!transactional) state.completedEvents[event.id] = true;
        if (event.after) event.after();
      }, { itemRewards: event.itemRewards || [], enemies: event.battleEnemies });
      return;
    }
    if (event.action && !event.lines) {
      const transactional = beginPendingTransition(event.id);
      if (event.once && !transactional) state.completedEvents[event.id] = true;
      event.action();
      const grantedItems = grantConfiguredItemRewards(event.itemRewards || []);
      render();
      saveLocal();
      if (grantedItems.length) void showItemRewardModals(grantedItems);
      return;
    }
    const persistent = eventPersistsAfterComplete(event);
    const lines = completed && persistent ? repeatEventLines(event) : event.lines || [["Narrator", "Nothing happens, but it happens with confidence."]];
    say(lines, () => {
      if (!completed) {
        const transactional = beginPendingTransition(event.id);
        if (event.action) event.action();
        if (event.after) event.after();
        const grantedItems = grantConfiguredItemRewards(event.itemRewards || []);
        if ((event.once || persistent) && !event.deferComplete && !transactional) state.completedEvents[event.id] = true;
        if (grantedItems.length) void showItemRewardModals(grantedItems);
      }
      render();
      saveLocal();
    }, { event });
  }

  function maybeEncounter() {
    if (transitionPending()) return;
    if (creatorFlag("noEnemies")) return;
    const a = area();
    if (a.theme === "town") return;
    if (!a.encounterRate || !a.encounters) return;
    const controlledInterval = encounterDialInterval();
    if (controlledInterval !== null) {
      if (controlledInterval <= 0) return;
      if (controlledEncounterStepCount() < controlledInterval) return;
      const encounterGroup = randomEncounterGroup(a.encounters);
      if (encounterGroup.length) startBattle(encounterGroup);
      return;
    }
    if (randomEncounterBufferActive()) return;
    const rate = a.encounterRate * ENCOUNTER_RATE_MULTIPLIER * partyAccessoryBestMultiplier("encounterRateMultiplier");
    if (!rate || Math.random() > rate) return;
    const encounterGroup = randomEncounterGroup(a.encounters);
    if (encounterGroup.length) startBattle(encounterGroup);
  }

  function stepsSinceLastBattle() {
    if (!state || !Number.isFinite(lastBattleStep)) return Infinity;
    return Math.max(0, state.steps - lastBattleStep);
  }

  function randomEncounterBufferActive() {
    return stepsSinceLastBattle() <= RANDOM_ENCOUNTER_SAFE_STEPS;
  }

  function randomEncounterGroup(encounterIds) {
    const eligibleIds = encounterIds.filter((id) => enemies[id] && !enemies[id].boss);
    if (!eligibleIds.length) return [];
    const countRoll = Math.random();
    const count = countRoll > 0.82 ? 3 : countRoll > 0.42 ? 2 : 1;
    return Array.from({ length: count }, () => eligibleIds[Math.floor(Math.random() * eligibleIds.length)]);
  }

  function battleGroupFrom(enemyRef, options = {}) {
    const refs = options.enemies || (Array.isArray(enemyRef) ? enemyRef : [enemyRef]);
    return refs.map((id, index) => {
      const template = enemies[id] || enemies.goblin;
      return {
        ...structuredClone(template),
        id,
        instanceId: `${id}-${index}-${Date.now()}`,
        maxHp: template.hp
      };
    });
  }

  function livingEnemies() {
    return activeBattle?.enemies?.filter((enemy) => enemy.hp > 0) || [];
  }

  function syncActiveEnemy() {
    if (!activeBattle) return null;
    activeBattle.enemy = livingEnemies()[0] || activeBattle.enemies?.[0] || activeBattle.enemy;
    activeBattle.id = activeBattle.enemy?.id || activeBattle.id;
    activeBattle.maxHp = activeBattle.enemy?.maxHp || activeBattle.maxHp;
    return activeBattle.enemy;
  }

    function enemyGroupName(enemiesToName = activeBattle?.enemies || []) {
      const living = enemiesToName.filter((enemy) => enemy.hp > 0);
      const list = living.length ? living : enemiesToName;
      if (list.length <= 1) return list[0]?.name || "Enemy";
    const groups = new Map();
    list.forEach((enemy) => {
      const key = enemy.id || enemy.name || "enemy";
      if (!groups.has(key)) groups.set(key, { enemy, count: 0 });
      groups.get(key).count += 1;
    });
    if (groups.size === 1) {
      const [{ enemy, count }] = groups.values();
      return `${count} ${enemyPluralName(enemy, count)}`;
    }
      if (list.length === 2) return `${list[0].name} and ${list[1].name}`;
      return `${list[0].name} and ${list.length - 1} more`;
    }

    function fearBattleActive() {
      return Boolean(activeBattle?.enemies?.some((enemy) => enemy.id === "fear"));
    }

    function isSkullKnight(enemy) {
      return enemy?.id === "skullKnight" || enemy?.reassembles;
    }

    function skullKnightReassemblyResult(member, enemy, options = {}) {
      if (enemy) enemy.hp = enemy.maxHp || enemy.hp || 1;
      const weapon = options.weapon || "weapon";
      const ranged = /bow|crossbow|repeater/i.test(weapon);
      return {
        damage: 999,
        effect: options.effect || (ranged ? "charmShot" : "slash"),
        color: options.color || (member.id === "derlin" ? "#ff816a" : "#f7e391"),
        duration: options.duration || 620,
        message: ranged
          ? `${member.name} shoots the Skull Knight's head clean off for 999 damage.`
          : `${member.name} knocks the Skull Knight's head clean off for 999 damage.`,
        extraMessages: ["The Skull Knight just picks up his head."]
      };
    }

    async function maybeFearYanRunWarning() {
      if (!activeBattle || !fearBattleActive() || activeBattle.yanRunWarningShown) return false;
      activeBattle.yanRunWarningShown = true;
      if (!hasFlag("yanReturned")) {
        removeParty("yanOld");
        addParty("yan");
        flag("yanReturned");
        state.completedEvents.yan_returns = true;
        activeBattle.actorId = "yan";
        startBattleEffect("dragonSpell", { actorId: "yan", affectsEnemy: false, duration: 900, color: "#a8ff93" });
        playSfx("spell");
        renderBattle();
        await battleMessage("Yan tears into the battle in a flash of dragon-light.", 820, 260);
        if (!activeBattle) return true;
        activeBattle.actorId = null;
        activeBattle.effect = null;
        renderBattle();
      }
      await battleMessage("Yan: The Skull Knights will keep getting up. The Fear Creature cannot be beaten here. Run!", 1120, 360);
      return true;
    }

    function enemyPluralName(enemy, count = 2) {
    const name = enemy?.name || "Enemy";
    if (count === 1 || enemy?.plural) return name;
    if (enemy?.pluralName) return enemy.pluralName;
    if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
    return `${name}s`;
  }

  function startBattle(enemyId, afterWin, options = {}) {
    if (transitionPending() && !options.allowDuringTransition) return false;
    const group = battleGroupFrom(enemyId, options);
    const template = group[0];
    normalizeActiveParty();
    if (creatorFlag("noEnemies")) {
      grantConfiguredItemRewards(options.itemRewards || []);
      if (afterWin) afterWin();
      render();
      saveLocal();
      return;
    }
    const bossBattle = group.some((enemy) => enemy.boss);
    const bossAutoPaused = bossBattle && autoBattleEnabled;
    if (bossBattle) autoBattleEnabled = false;
    lastBattleStep = state?.steps ?? lastBattleStep;
    if (state) state.lastBattleStep = Number.isFinite(lastBattleStep) ? lastBattleStep : null;
    activeBattle = {
      id: template.id,
      areaId: state.areaId,
      enemies: group,
      enemy: group[0],
      maxHp: template.maxHp,
      afterWin,
      itemRewards: options.itemRewards || [],
      turn: 1,
      busy: false,
      auto: autoBattleEnabled,
      actorId: null,
      targetId: null,
      enemyAction: false,
      effect: null,
      partyPanelOpen: false,
      choices: {}
    };
    loadBattleAssets(group.map((enemy) => enemy.id));
    showManagedDialog("battle", ".battle-party-card button:not([disabled])");
      if (group.some((enemy) => enemy.id === "fear")) {
        $("battle-log").textContent = "The Fear Creature arrives with Skull Knights. This is a boss fight, technically.";
    } else if (template.scriptedLoss) {
      const scriptedLossBlockVerb = group.length === 1 && !template.plural ? "blocks" : "block";
      $("battle-log").textContent = `${enemyGroupName(group)} ${scriptedLossBlockVerb} the road. This fight feels unfair on purpose.`;
    } else if (group.length > 1) {
      $("battle-log").textContent = `${enemyGroupName(group)} appear!`;
    } else {
      $("battle-log").textContent = `${template.name} ${template.plural ? "appear" : "appears"}!`;
    }
    if (state.coaching.enabled && !state.coaching.seen.battle) {
      state.coaching.seen.battle = true;
      $("battle-log").textContent = "First battle: queue one action and target for every active character. Use Undo to revise, then Execute Round.";
    }
    if (bossAutoPaused) $("battle-log").textContent += " Auto was paused for this boss; turn it back on when you are ready.";
    setBattleControls(true);
    renderBattle();
    playSfx("battleStart");
    updateMusicForContext();
    if (activeBattle.auto) scheduleAutoBattle();
  }

  function renderBattle() {
    if (!activeBattle) return;
    const enemy = syncActiveEnemy();
    const finalPhase = Boolean(enemy?.mechanic === "windFinal" && enemy.hp <= 55);
    document.querySelector(".battle-box")?.classList.toggle("is-final-phase", finalPhase);
    $("enemy-name").textContent = finalPhase ? `${enemy.name} — Void Crown` : enemyGroupName();
    drawBattleStage();
    $("enemy-hp-bar").style.width = `${Math.max(0, Math.round((enemy.hp / activeBattle.maxHp) * 100))}%`;
    const enemyMeter = $("enemy-hp-meter");
    enemyMeter?.setAttribute("aria-label", `${enemy.name} health`);
    enemyMeter?.setAttribute("aria-valuemax", String(activeBattle.maxHp));
    enemyMeter?.setAttribute("aria-valuenow", String(Math.max(0, enemy.hp)));
    if (activeBattle.reward) {
      renderBattleReward();
      return;
    }
    setBattleActionMode("normal");
    const autoButton = $("auto-battle");
    if (autoButton) {
      autoButton.textContent = activeBattle.auto ? "Auto On" : "Auto";
      autoButton.classList.toggle("is-active", Boolean(activeBattle.auto));
      autoButton.setAttribute("aria-pressed", String(Boolean(activeBattle.auto)));
    }
    const partyButton = document.querySelector('.battle-actions button[data-action="party"]');
    partyButton?.classList.toggle("is-active", Boolean(activeBattle.partyPanelOpen));
    partyButton?.setAttribute("aria-expanded", String(Boolean(activeBattle.partyPanelOpen)));
    const executeButton = $("execute-round");
    if (executeButton) executeButton.disabled = activeBattle.busy || !allActionsQueued();
    const undoButton = $("undo-round");
    if (undoButton) undoButton.disabled = activeBattle.busy || !Object.keys(activeBattle.choices || {}).length;
    const party = $("battle-party");
    party.innerHTML = "";
    const reserves = reservePartyMembers().filter((member) => member.hp > 0);
    const activeMembers = activePartyMembers();
    const firstActionableId = activeMembers.find((member) => member.hp > 0 && !activeBattle.choices?.[member.id])?.id || activeMembers[0]?.id;
    const compactBattle = Boolean(window.matchMedia?.("(max-width: 560px)").matches);
    activeMembers.forEach((member) => {
      const hpPct = Math.max(0, Math.round((member.hp / member.maxHp) * 100));
      const mpPct = member.maxMp ? Math.max(0, Math.round((member.mp / member.maxMp) * 100)) : 0;
      const rawChoice = activeBattle.choices?.[member.id] || "";
      const choice = rawChoice ? normalizeBattleChoice(rawChoice, member) : null;
      const dead = member.hp <= 0;
      const busy = activeBattle.busy;
      const skills = battleSkills(member);
      const items = battleItemEntries();
      const canSkill = skills.some((skill) => skillCanPay(member, skill));
      const canItem = items.length > 0;
      const defaultSkillId = defaultSkill(member)?.id;
      const skillOptions = skills.map((skill) => `<option value="${skill.id}" ${skill.id === defaultSkillId ? "selected" : ""} ${!skillCanPay(member, skill) ? "disabled" : ""}>${skill.name} (${skillMpCost(member, skill)} MP) — ${skillEstimateText(member, skill)}</option>`).join("");
      const itemOptions = items.map((item) => {
        const count = item.consume ? remainingQueuedItemCount(item, member.id) : (state.inventory[item.inventory] || 0);
        const bellCooldown = item.id === "befuddlingBell" ? bellCooldownRemaining() : 0;
        return `<option value="${item.id}" ${(item.consume && count <= 0) || bellCooldown ? "disabled" : ""}>${item.name}${item.consume ? ` x${count} free` : bellCooldown ? ` — cooldown ${bellCooldown}` : ""}</option>`;
      }).join("");
      const enemyOptions = livingEnemies().map((target, index) => `<option value="${target.instanceId}">${target.name}${livingEnemies().length > 1 ? ` ${index + 1}` : ""} — ${Math.max(0, target.hp)}/${target.maxHp} HP</option>`).join("");
      const allyOptions = activePartyMembers().map((target) => `<option value="${target.id}">${target.name} — ${target.hp <= 0 ? "KO" : `${target.hp}/${target.maxHp} HP`}</option>`).join("");
      const statusLabel = kokhorStatusLabel(member);
      const card = document.createElement("details");
      card.open = !compactBattle || member.id === firstActionableId;
      card.className = `party-card battle-party-card ${choice ? "is-chosen" : ""} ${activeBattle.actorId === member.id ? "is-acting" : ""} ${dead ? "is-fallen" : ""}`;
      const disabled = (name) => dead || busy || Boolean(choice) || (name === "skill" && !canSkill) || (name === "item" && !canItem);
      card.innerHTML = `
        <summary><header><strong>${member.name}</strong><span>${dead ? "KO" : statusLabel ? `${statusLabel} | Lv ${member.level}` : member.level ? `Lv ${member.level}` : ""}</span></header>
        <div class="battle-vitals">
          <span>HP ${Math.max(0, member.hp)}/${member.maxHp}</span>
          <div class="mini-meter hp-meter" role="progressbar" aria-label="${member.name} health" aria-valuemin="0" aria-valuemax="${member.maxHp}" aria-valuenow="${Math.max(0, member.hp)}"><span style="width:${hpPct}%"></span></div>
          <span>MP ${member.mp}/${member.maxMp}</span>
          <div class="mini-meter mp-meter" role="progressbar" aria-label="${member.name} magic" aria-valuemin="0" aria-valuemax="${member.maxMp}" aria-valuenow="${Math.max(0, member.mp)}"><span style="width:${mpPct}%"></span></div>
        </div></summary>
        <div class="member-actions" aria-label="${member.name} battle actions">
          ${choice ? `<span class="queued-action">${battleActionLabel(choice, member)}</span><button data-member-id="${member.id}" data-member-action="undo" type="button" ${busy ? "disabled" : ""}>Undo</button>` : `
            <label><span>Enemy</span><select data-enemy-target-select="${member.id}" aria-label="${member.name} enemy target">${enemyOptions}</select></label>
            <label><span>Ally</span><select data-ally-target-select="${member.id}" aria-label="${member.name} ally target">${allyOptions}</select></label>
            <button data-member-id="${member.id}" data-member-action="attack" type="button" ${disabled("attack") ? "disabled" : ""}>Fight</button>
            <select data-skill-select="${member.id}" aria-label="${member.name} skill" ${disabled("skill") ? "disabled" : ""}>${skillOptions || `<option>No skills</option>`}</select>
            <button data-member-id="${member.id}" data-member-action="skill" type="button" ${disabled("skill") ? "disabled" : ""}>Skill</button>
            <select data-item-select="${member.id}" aria-label="${member.name} item" ${disabled("item") ? "disabled" : ""}>${itemOptions || `<option>No items</option>`}</select>
            <button data-member-id="${member.id}" data-member-action="item" type="button" ${disabled("item") ? "disabled" : ""}>Item</button>
          `}
        </div>`;
      party.appendChild(card);
    });
    if (activeBattle.partyPanelOpen) {
      party.insertAdjacentHTML("beforeend", renderBattlePartySwitchPanel(reserves));
    }
    syncBattleFocus();
  }

  function renderBattlePartySwitchPanel(reserves) {
    if (!reserves.length) {
      return `
        <section class="battle-party-switch-panel" aria-label="Party switching">
          <header><strong>Party</strong><span>No reserves ready</span></header>
          <p>Everyone available is already in the front line.</p>
        </section>
      `;
    }
    const reserved = queuedReserveIds();
    const reserveOptions = reserves.filter((member) => !reserved.has(member.id)).map((member) => `<option value="${member.id}">${member.name}</option>`).join("");
    const rows = activePartyMembers().map((member) => {
      const rawChoice = activeBattle.choices?.[member.id] || "";
      const choice = rawChoice ? normalizeBattleChoice(rawChoice, member) : null;
      const dead = member.hp <= 0;
      const disabled = activeBattle.busy || Boolean(choice);
      const status = choice ? battleActionLabel(choice, member) : dead ? "KO" : "Ready";
      return `
        <article class="battle-switch-row">
          <div>
            <strong>${member.name}</strong>
            <small>${status}</small>
          </div>
          <select data-battle-switch-select="${member.id}" aria-label="Switch ${member.name} with reserve" ${disabled ? "disabled" : ""}>
            ${reserveOptions}
          </select>
          <button data-battle-switch="${member.id}" type="button" ${disabled ? "disabled" : ""}>Switch</button>
        </article>
      `;
    }).join("");
    return `
      <section class="battle-party-switch-panel" aria-label="Party switching">
        <header><strong>Party</strong><span>Choose who falls back</span></header>
        <div class="battle-switch-list">${rows}</div>
      </section>
    `;
  }

  function renderBattleReward() {
    const reward = activeBattle?.reward;
    if (!reward) return;
    loadArtAssets(["guideIcons"]);
    setBattleActionMode("reward");
    $("battle-log").textContent = "Victory. Review the spoils, then continue.";
    const party = $("battle-party");
    const listedItemRewards = (reward.itemRewards || []).filter((item) => !item.key);
    party.innerHTML = `
      <article class="battle-reward-card">
        <header>
          <strong>${reward.enemyName} defeated</strong>
          <span>Battle Complete</span>
        </header>
        <div class="battle-reward-grid">
          <div><span>XP</span><strong>${reward.xp ? `+${reward.xp} active${reward.reserveRecipientIds?.length ? ` / +${reward.reserveXp} reserve` : ""}` : "+0"}</strong></div>
          <div class="battle-reward-gold">
            <canvas width="40" height="40" data-reward-item-image="item:gold" aria-label="Gold icon"></canvas>
            <span>Gold</span>
            <strong>${reward.gold ? `+${reward.gold}` : "+0"}</strong>
          </div>
        </div>
        ${listedItemRewards.length ? `
          <div class="battle-reward-items">
            ${listedItemRewards.map(renderBattleRewardItem).join("")}
          </div>
        ` : ""}
        ${reward.levelMessages.length ? `<ul>${reward.levelMessages.map((entry) => `<li>${entry}</li>`).join("")}</ul>` : `<p>No level-ups this time.</p>`}
        <div class="battle-reward-party">
          ${reward.memberIds.map((id) => memberById(id)).filter(Boolean).map(renderRewardMemberXp).join("")}
        </div>
      </article>
    `;
    drawBattleRewardItemIcons();
    syncBattleFocus();
  }

  function renderBattleRewardItem(item) {
    const label = item.key ? "Key Item" : `Item x${item.count}`;
    return `
      <article class="battle-reward-item ${item.key ? "is-key" : ""}">
        <canvas width="96" height="96" data-reward-item-image="${item.image}" aria-label="${item.name} image"></canvas>
        <div>
          <span>${label}</span>
          <strong>${item.name}${!item.key && item.count > 1 ? ` x${item.count}` : ""}</strong>
        </div>
      </article>
    `;
  }

  function drawBattleRewardItemIcons() {
    document.querySelectorAll("canvas[data-reward-item-image]").forEach((canvas) => {
      drawInventoryItemCanvas(canvas, canvas.dataset.rewardItemImage || "item:gold");
    });
  }

  function drawInventoryItemCanvas(canvas, imageKey) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    loadArtAssets([...guideImageAssetKeys(imageKey)]);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [kind, id] = String(imageKey || "item:gold").split(":");
    if (kind === "spell") drawGuideSpell(ctx, canvas.width, canvas.height, id);
    else if (kind === "weapon") drawGuideWeapon(ctx, canvas.width, canvas.height, id);
    else if (kind === "armor") drawGuideArmor(ctx, canvas.width, canvas.height, id);
    else if (kind === "accessory") drawGuideAccessory(ctx, canvas.width, canvas.height, id);
    else if (kind === "art") drawGeneratedGuideArt(ctx, canvas.width, canvas.height, id);
    else drawGuideItem(ctx, canvas.width, canvas.height, id || "gold");
  }

  async function showItemRewardModals(items = []) {
    for (const item of items) {
      await showItemRewardModal(item);
    }
  }

  function showKeyItemRewardModals(items = []) {
    return showItemRewardModals(items.filter((entry) => entry.key));
  }

  function showItemRewardModal(item) {
    return new Promise((resolve) => {
      const modal = $("item-modal");
      const canvas = $("item-modal-image");
      if (!modal || !canvas) {
        resolve();
        return;
      }
      itemModalResolve = resolve;
      itemModalEquipAction = null;
      $("item-modal-equip")?.classList.add("is-hidden");
      $("item-modal-kicker").textContent = item.key ? "Key Item Acquired" : "Item Acquired";
      $("item-modal-name").textContent = item.name;
      $("item-modal-text").textContent = item.text || "Added to inventory.";
      canvas.dataset.itemModalImage = item.image || "item:gold";
      drawInventoryItemCanvas(canvas, canvas.dataset.itemModalImage);
      showManagedDialog("item-modal", "#item-modal-close");
    });
  }

  function closeItemRewardModal() {
    const modal = $("item-modal");
    if (modal) hideManagedDialog("item-modal");
    const resolve = itemModalResolve;
    itemModalResolve = null;
    itemModalEquipAction = null;
    $("item-modal-equip")?.classList.add("is-hidden");
    if (resolve) resolve();
    scheduleEquipmentOffer();
  }

  function equipmentSlotForItem(name) {
    if (weaponCatalog[name]) return "weapon";
    if (armorCatalog[name]) return "armor";
    if (accessoryCatalog[name] && !accessoryCatalog[name].starter) return "accessory";
    return "";
  }

  function bestEquipmentRecipient(name, slot) {
    const item = catalogForSlot(slot)[name];
    if (!item) return null;
    const score = (gear) => gear?.bonus || gear?.defBonus || gear?.mpCostReduction || 0;
    return state.party
      .filter((member) => item.users.includes(member.id) && gearCopyAvailable(name, slot, member.id))
      .map((member) => {
        const currentName = equipmentEntry(member)[slot] || defaultGearName(member, slot);
        const current = catalogForSlot(slot)[currentName];
        const personal = name.toLowerCase().includes(member.name.toLowerCase());
        return { member, improvement: score(item) - score(current), personal, active: isActivePartyMember(member.id) };
      })
      .filter((entry) => entry.improvement > 0)
      .sort((a, b) => Number(b.personal) - Number(a.personal)
        || Number(b.active) - Number(a.active)
        || b.improvement - a.improvement)[0]?.member || null;
  }

  function queueEquipmentOffer(name, options = {}) {
    const slot = equipmentSlotForItem(name);
    if (!state || creatorFlag("enabled")) return;
    const notable = slot || ["Water Orb Spell", "Water Orb Focus", "Water Scroll", "Scribe Pass", "Derlin Cell Key", "Wind Spell", "Marsh Joke Book", "Glass Flute", "Befuddling Bell", "Encounter Dial", "Honest Milk", "VS Relic"].includes(name);
    if (!notable) return;
    const groupId = typeof options.offerGroup === "string" ? options.offerGroup : "";
    if (groupId) {
      const existing = pendingEquipmentOffers.find((offer) => offer.groupId === groupId);
      if (existing) existing.items.push({ name, slot });
      else pendingEquipmentOffers.push({
        groupId,
        title: options.offerTitle || "New Recruit Loadout",
        recruitId: options.recruitId || "",
        items: [{ name, slot }]
      });
    } else {
      pendingEquipmentOffers.push({ name, slot });
    }
    scheduleEquipmentOffer();
  }

  function scheduleEquipmentOffer(delay = 0) {
    if (equipmentOfferTimer) clearTimeout(equipmentOfferTimer);
    equipmentOfferTimer = setTimeout(() => {
      equipmentOfferTimer = null;
      tryShowNextEquipmentOffer();
    }, delay);
  }

  function equipmentLoadoutAssignments(offers = []) {
    const score = (gear) => gear?.bonus || gear?.defBonus || gear?.mpCostReduction || 0;
    const claimedSlots = new Set();
    const orderedOffers = offers
      .filter((offer) => offer.slot && catalogForSlot(offer.slot)[offer.name])
      .map((offer) => {
        const item = catalogForSlot(offer.slot)[offer.name];
        const personal = item.users.some((id) => offer.name.toLowerCase().includes((partyTemplates[id]?.name || "").toLowerCase()));
        return { ...offer, item, personal };
      })
      .sort((a, b) => Number(b.personal) - Number(a.personal)
        || a.item.users.length - b.item.users.length
        || score(b.item) - score(a.item));
    const assignments = [];
    orderedOffers.forEach((offer) => {
      const recipient = state.party
        .filter((member) => offer.item.users.includes(member.id)
          && !claimedSlots.has(`${member.id}:${offer.slot}`)
          && gearCopyAvailable(offer.name, offer.slot, member.id))
        .map((member) => {
          const currentName = equipmentEntry(member)[offer.slot] || defaultGearName(member, offer.slot);
          const current = catalogForSlot(offer.slot)[currentName];
          return {
            member,
            improvement: score(offer.item) - score(current),
            personal: offer.name.toLowerCase().includes(member.name.toLowerCase()),
            active: isActivePartyMember(member.id)
          };
        })
        .filter((entry) => entry.improvement > 0)
        .sort((a, b) => Number(b.personal) - Number(a.personal)
          || Number(b.active) - Number(a.active)
          || b.improvement - a.improvement)[0]?.member;
      if (!recipient) return;
      claimedSlots.add(`${recipient.id}:${offer.slot}`);
      assignments.push({ memberId: recipient.id, memberName: recipient.name, slot: offer.slot, name: offer.name });
    });
    return assignments;
  }

  function itemNameList(names = []) {
    if (names.length < 2) return names[0] || "equipment";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  }

  function equipmentLoadoutSummary(assignments = []) {
    const byMember = new Map();
    assignments.forEach((assignment) => {
      if (!byMember.has(assignment.memberName)) byMember.set(assignment.memberName, []);
      byMember.get(assignment.memberName).push(assignment.name);
    });
    return [...byMember.entries()].map(([memberName, names]) => `${memberName}: ${itemNameList(names)}`).join("; ");
  }

  function equipEquipmentLoadout(assignments = []) {
    const applied = [];
    state.equipment ||= {};
    assignments.forEach((assignment) => {
      const member = memberById(assignment.memberId);
      if (!member || !gearCopyAvailable(assignment.name, assignment.slot, assignment.memberId)) return;
      const existing = state.equipment[assignment.memberId];
      const entry = typeof existing === "string" ? { weapon: existing } : isPlainObject(existing) ? { ...existing } : {};
      entry[assignment.slot] = assignment.name;
      state.equipment[assignment.memberId] = entry;
      applied.push(assignment);
    });
    normalizeEquipment();
    if (applied.length) menuMessage = `Equipped recommended loadout: ${equipmentLoadoutSummary(applied)}.`;
    render();
    saveLocal();
  }

  function showGroupedEquipmentOffer(offer, modal, canvas) {
    const assignments = equipmentLoadoutAssignments(offer.items);
    const names = offer.items.map((item) => item.name);
    const recruitName = partyTemplates[offer.recruitId]?.name || "";
    const featured = offer.items.find((item) => recruitName && item.name.toLowerCase().includes(recruitName.toLowerCase()))
      || offer.items.find((item) => catalogForSlot(item.slot)[item.name]?.users?.includes(offer.recruitId))
      || offer.items[0];
    $("item-modal-kicker").textContent = "Recruit Loadout";
    $("item-modal-name").textContent = offer.title;
    $("item-modal-text").textContent = assignments.length
      ? `${itemNameList(names)} were added to inventory. Recommended loadout — ${equipmentLoadoutSummary(assignments)}. Equip it now or keep the current gear.`
      : `${itemNameList(names)} were added to inventory.`;
    canvas.dataset.itemModalImage = featured.slot ? equipmentItemImageKey(featured.slot, featured.name) : inventoryItemImageKey(featured.name);
    drawInventoryItemCanvas(canvas, canvas.dataset.itemModalImage);
    const equipButton = $("item-modal-equip");
    if (assignments.length) {
      state.coaching.seen.equipment = true;
      equipButton.textContent = "Equip recommended";
      equipButton.classList.remove("is-hidden");
      itemModalEquipAction = () => equipEquipmentLoadout(assignments);
    } else {
      equipButton.classList.add("is-hidden");
      itemModalEquipAction = null;
    }
    showManagedDialog("item-modal", assignments.length ? "#item-modal-equip" : "#item-modal-close");
  }

  function tryShowNextEquipmentOffer() {
    if (!pendingEquipmentOffers.length) return;
    if (activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || modalOpen()) {
      scheduleEquipmentOffer(350);
      return;
    }
    const offer = pendingEquipmentOffers.shift();
    const modal = $("item-modal");
    const canvas = $("item-modal-image");
    if (!modal || !canvas) return;
    if (offer.items?.length) {
      showGroupedEquipmentOffer(offer, modal, canvas);
      return;
    }
    const member = offer.slot ? bestEquipmentRecipient(offer.name, offer.slot) : null;
    $("item-modal-kicker").textContent = member ? "Equipment Upgrade" : (offer.slot ? "Equipment Acquired" : "Key Item Acquired");
    $("item-modal-name").textContent = offer.name;
    $("item-modal-text").textContent = member
      ? `${offer.name} is an upgrade for ${member.name}. Equip it now or keep the current loadout.`
      : inventoryItemText(offer.name);
    canvas.dataset.itemModalImage = offer.slot ? equipmentItemImageKey(offer.slot, offer.name) : inventoryItemImageKey(offer.name);
    drawInventoryItemCanvas(canvas, canvas.dataset.itemModalImage);
    const equipButton = $("item-modal-equip");
    if (member) {
      state.coaching.seen.equipment = true;
      equipButton.textContent = `Equip on ${member.name}`;
      equipButton.classList.remove("is-hidden");
      itemModalEquipAction = () => equipGear(member.id, offer.slot, offer.name);
    } else {
      equipButton.classList.add("is-hidden");
      itemModalEquipAction = null;
    }
    showManagedDialog("item-modal", member ? "#item-modal-equip" : "#item-modal-close");
  }

  function xpForNextLevel(member) {
    return member.level * 24;
  }

  function renderRewardMemberXp(member) {
    const needed = xpForNextLevel(member);
    const pct = needed ? clamp((member.xp / needed) * 100, 0, 100) : 100;
    return `
      <article class="battle-reward-xp">
        <header><strong>${member.name}</strong><span>Lv ${member.level}</span></header>
        <div class="xp-meter" role="progressbar" aria-label="${member.name} experience" aria-valuemin="0" aria-valuemax="${needed}" aria-valuenow="${Math.min(member.xp, needed)}"><span style="width:${pct}%"></span></div>
        <small>${member.xp}/${needed} XP to next level</small>
      </article>
    `;
  }

  function setBattleActionMode(mode) {
    $("battle")?.classList.toggle("is-reward", mode === "reward");
    const labels = { run: "Run", auto: activeBattle?.auto ? "Auto On" : "Auto", party: "Party", undo: "Undo", execute: "Execute Round" };
    document.querySelectorAll(".battle-actions button").forEach((button) => {
      const action = button.dataset.action;
      button.classList.remove("is-reward-continue");
      button.classList.remove("is-active");
      button.classList.toggle("is-hidden", mode === "reward" && action !== "party");
      if (mode === "reward" && action === "party") {
        button.textContent = "Continue";
        button.disabled = false;
        button.classList.add("is-reward-continue");
      } else {
        button.textContent = labels[action] || button.textContent;
      }
    });
  }

  function battleActionLabel(action, member) {
    const choice = normalizeBattleChoice(action, member);
    if (choice.type === "attack") return "Fight queued";
    if (choice.type === "skill") {
      const skill = battleChoiceSkill(choice, member);
      return `${skill?.name || "Skill"} queued`;
    }
    if (choice.type === "item") {
      const item = battleChoiceItem(choice);
      return `${item?.name || "Item"} queued`;
    }
    if (choice.type === "switch") {
      const target = memberById(choice.memberId);
      return `Switch to ${target?.name || "reserve"} queued`;
    }
    return "Queued";
  }

  async function battleAction(action) {
    if (!activeBattle) return;
    if (activeBattle.reward) {
      confirmBattleReward();
      return;
    }
    if (action === "auto") {
      toggleAutoBattle();
      return;
    }
    if (activeBattle.busy) return;
    if (action === "undo") {
      undoLastQueuedAction();
      return;
    }
    if (action === "party") {
      toggleBattlePartyPanel();
      return;
    }
    if (action === "execute") {
      if (!allActionsQueued()) {
        $("battle-log").textContent = "Choose an action for every living frontliner before executing the round.";
        return;
      }
      executeBattleTurn();
      return;
    }
    if (action === "run") {
      clearAutoBattleTimer();
      activeBattle.busy = true;
      setBattleControls(false);
      await executeRunAction();
      return;
    }
    const member = nextPendingMember();
    if (!member) return;
    queueMemberAction(member.id, action);
  }

  function toggleBattlePartyPanel() {
    if (!activeBattle || activeBattle.busy || activeBattle.reward) return;
    activeBattle.partyPanelOpen = !activeBattle.partyPanelOpen;
    renderBattle();
  }

  function queueMemberAction(memberId, action, options = {}) {
    if (!activeBattle || activeBattle.busy) return;
    const member = activePartyMembers().find((entry) => entry.id === memberId);
    if (!member || (member.hp <= 0 && action !== "switch") || activeBattle.choices?.[memberId]) return;
    const built = buildBattleChoice(member, action, options);
    if (built.error) {
      $("battle-log").textContent = built.error;
      renderBattle();
      return;
    }
    if (member.hp <= 0 && action === "switch") {
      const target = memberById(built.choice.memberId);
      if (target && switchActivePartyMember(member.id, target.id, { allowBusy: true, allowQueued: true, silent: true })) {
        $("battle-log").textContent = `${member.name} is moved out of the KO slot. ${target.name} joins the front line and can act this round.`;
        activeBattle.partyPanelOpen = false;
        renderBattle();
      }
      return;
    }
    activeBattle.choices ||= {};
    activeBattle.choices[memberId] = built.choice;
    const next = nextPendingMember();
    $("battle-log").textContent = next ? `${member.name} queues ${battleActionName(built.choice, member)}. Choose ${next.name}'s action.` : "The round is set. Review targets or Undo, then press Execute Round.";
    renderBattle();
  }

  function undoMemberAction(memberId) {
    if (!activeBattle || activeBattle.busy || !activeBattle.choices?.[memberId]) return;
    const member = memberById(memberId);
    delete activeBattle.choices[memberId];
    $("battle-log").textContent = `${member?.name || "That character"}'s queued action was cleared.`;
    renderBattle();
  }

  function undoLastQueuedAction() {
    if (!activeBattle || activeBattle.busy || activeBattle.reward) return false;
    const queuedIds = Object.keys(activeBattle.choices || {});
    const memberId = queuedIds.at(-1);
    if (!memberId) return false;
    const member = memberById(memberId);
    delete activeBattle.choices[memberId];
    $("battle-log").textContent = `${member?.name || "The last character"}'s queued action was cleared.`;
    renderBattle();
    return true;
  }

  function battleActionName(action, member) {
    const choice = normalizeBattleChoice(action, member);
    if (choice.type === "skill") {
      const skill = battleChoiceSkill(choice, member);
      return skill ? skill.name : "a skill";
    }
    if (choice.type === "item") {
      const item = battleChoiceItem(choice);
      return item ? item.name : "an item";
    }
    if (choice.type === "switch") {
      const target = memberById(choice.memberId);
      return target ? `a switch to ${target.name}` : "a switch";
    }
    return "an attack";
  }

  function nextPendingMember() {
    if (!activeBattle) return null;
    return activePartyMembers().find((member) => member.hp > 0 && !activeBattle.choices?.[member.id]) || null;
  }

  function allActionsQueued() {
    if (!activeBattle) return false;
    const alive = activePartyMembers().filter((member) => member.hp > 0);
    return alive.length > 0 && alive.every((member) => activeBattle.choices?.[member.id]);
  }

    async function executeRunAction() {
      if (!activeBattle) return;
      clearAutoBattleTimer();
      const enemy = syncActiveEnemy();
      const bossBattle = activeBattle.enemies?.some((entry) => entry.boss);
      const mustRun = activeBattle.enemies?.some((entry) => entry.mustRun);
      if (fearBattleActive() && !activeBattle.yanRunWarningShown) {
        await battleMessage("The party tries to run, but the Fear Creature folds the road back under their feet.");
        await maybeFearYanRunWarning();
        finishBattleTurn();
        return;
      }
      if (bossBattle && !mustRun) {
        await battleMessage("Boss battles have a strict no-jogging policy.");
        await enemyAttackSequence();
        finishBattleTurn();
      return;
    }
    await battleMessage(enemy.mustRun || mustRun ? "The party runs on the correct beat. It finally works." : "The party escapes.");
    const done = activeBattle?.afterWin;
    activeBattle = null;
    hideManagedDialog("battle");
    updateMusicForContext();
    if (done) done();
    render();
    saveLocal();
  }

  async function executeBattleTurn() {
    if (!activeBattle || activeBattle.busy) return;
    clearAutoBattleTimer();
    activeBattle.busy = true;
    setBattleControls(false);
    const enemy = syncActiveEnemy();
    const autoSelect = Boolean(activeBattle.auto);

      if (enemy.mustRun && !fearBattleActive()) {
        await battleMessage("Attacks pass through the Fear Creature. The Skull Knights politely reassemble themselves.");
        await enemyAttackSequence(0.7);
        finishBattleTurn();
        return;
    }

    const actors = activePartyMembers().filter((member) => member.hp > 0 || normalizeBattleChoice(activeBattle.choices?.[member.id]).type === "switch");
    for (const member of actors) {
      if (!activeBattle) return;
      let plannedChoice = activeBattle.choices?.[member.id];
      if (!plannedChoice && autoSelect) {
        plannedChoice = chooseAutoAction(member);
        activeBattle.choices = { [member.id]: plannedChoice };
        activeBattle.actorId = member.id;
        $("battle-log").textContent = `${member.name} readies ${battleActionName(plannedChoice, member)}.`;
        renderBattle();
        await delay(260, 180);
      }
      const action = normalizeBattleChoice(plannedChoice || "attack", member);
      activeBattle.actorId = member.id;
      const result = action.type === "item" ? memberItemAction(member, action) : memberBattleAction(member, action);
      if (result.targetId) activeBattle.targetId = result.targetId;
      if (result.effect) {
        startBattleEffect(result.effect, {
          actorId: member.id,
          targetId: result.targetId || null,
          targetIds: result.targetIds || null,
          affectsEnemy: result.affectsEnemy ?? result.damage > 0,
          color: result.color,
          spellId: result.spellId || null,
          duration: autoSelect ? Math.max(result.duration || (action.type === "skill" ? 760 : 500), 760) : result.duration || (action.type === "skill" ? 760 : 500)
        });
      }
      playBattleActionSfx(result.effect, result.damage);
      renderBattle();
      if (result.damage > 0) {
        pulseBattle("player");
        hitEnemySprite();
      }
      if (result.effect) {
        const effectWait = Math.max(activeBattle.effect?.duration || 0, autoSelect ? 620 : 120);
        await rawDelay(effectWait + (autoSelect ? 120 : 0));
      }
      if (!activeBattle) return;
      activeBattle.effect = null;
      activeBattle.actorId = null;
      if (result.targetId) activeBattle.targetId = null;
      if (result.targetIds) activeBattle.targetId = null;
      if (autoSelect && activeBattle.choices) delete activeBattle.choices[member.id];
        renderBattle();
        await battleMessage(result.message, autoSelect ? 720 : 700, autoSelect ? 280 : 90);
        if (Array.isArray(result.extraMessages)) {
          for (const extraMessage of result.extraMessages) {
            if (!activeBattle) return;
            await battleMessage(extraMessage, autoSelect ? 720 : 620, autoSelect ? 260 : 90);
          }
        }
        if (!activeBattle) return;
      await delay(autoSelect ? 220 : 180, autoSelect ? 150 : 90);
      if (await tryScriptedLossBattle(enemy)) return;
      syncActiveEnemy();
      if (!livingEnemies().length) {
        await finishBattleWin(`${enemyGroupName(activeBattle.enemies)} defeated.`);
        return;
      }
    }

    if (await tryScriptedLossBattle(enemy)) return;

      await enemyAttackSequence(fearBattleActive() && !activeBattle.yanRunWarningShown ? 0.45 : 1);
      if (await maybeFearYanRunWarning()) {
        finishBattleTurn();
        return;
      }

    finishBattleTurn();
  }

  function scriptedLossTriggerEnemy(preferredEnemy = null) {
    if (!activeBattle) return null;
    const candidates = [preferredEnemy, ...(activeBattle.enemies || [])].filter(Boolean);
    const seen = new Set();
    return candidates.find((enemy) => {
      const key = enemy.instanceId || enemy.id || enemy.name;
      if (seen.has(key)) return false;
      seen.add(key);
      const maxHp = Math.max(1, enemy.maxHp || activeBattle.maxHp || enemy.hp || 1);
      return Boolean(enemy.scriptedLoss && enemy.hp <= maxHp * 0.42);
    }) || null;
  }

  async function tryScriptedLossBattle(preferredEnemy = null) {
    const enemy = scriptedLossTriggerEnemy(preferredEnemy);
    if (!enemy) return false;
    await executeScriptedLossMove(enemy);
    return true;
  }

  async function executeScriptedLossMove(enemy) {
    if (!activeBattle || !enemy) return;
    clearAutoBattleTimer();
    activeBattle.busy = true;
    activeBattle.actorId = null;
    activeBattle.targetId = null;
    activeBattle.enemy = enemy;
    activeBattle.id = enemy.id;
    activeBattle.maxHp = enemy.maxHp || activeBattle.maxHp;
    activeBattle.enemyAction = true;
    activeBattle.choices = {};
    const moveName = enemy.scriptedLossMove || "Capture";
    const targetIds = activePartyMembers().filter((member) => member.hp > 0).map((member) => member.id);
    startBattleEffect("capture", { targetIds, affectsEnemy: false, duration: 920, color: "#8fdcff" });
    playSfx("spell");
    renderBattle();
    await battleMessage(`${enemy.name} uses ${moveName}.`, 820, 240);
    if (!activeBattle) return;
    await rawDelay(Math.max(120, (activeBattle.effect?.duration || 0) - 520));
    if (!activeBattle) return;
    activeBattle.effect = null;
    activeBattle.enemyAction = false;
    renderBattle();
    await battleMessage(enemy.scriptedLossMessage || `${moveName} ends the battle. The party is captured.`, 980, 280);
    finishScriptedLossBattle();
  }

  function finishScriptedLossBattle() {
    if (!activeBattle) return;
    const done = activeBattle.afterWin;
    clearAutoBattleTimer();
    activeBattle = null;
    hideManagedDialog("battle");
    updateMusicForContext();
    if (done) done();
    render();
    saveLocal();
  }

  function finishBattleTurn() {
    if (!activeBattle) return;
    activeBattle.busy = false;
    activeBattle.actorId = null;
    activeBattle.targetId = null;
    activeBattle.enemyAction = false;
    activeBattle.choices = {};
    activeBattle.turn += 1;
    setBattleControls(true);
    renderBattle();
    if (activeBattle.auto) scheduleAutoBattle();
  }

  function toggleAutoBattle() {
    if (!activeBattle) return;
    autoBattleEnabled = !activeBattle.auto;
    activeBattle.auto = autoBattleEnabled;
    if (activeBattle.auto) scheduleAutoBattle();
    else clearAutoBattleTimer();
    renderBattle();
  }

  function scheduleAutoBattle() {
    clearAutoBattleTimer();
    if (!activeBattle || !activeBattle.auto || activeBattle.busy || modalOpen()) return;
    autoBattleTimer = setTimeout(() => {
      autoBattleTimer = null;
      if (!activeBattle || !activeBattle.auto || activeBattle.busy || modalOpen()) return;
      queueAutoBattleTurn();
    }, Math.max(fastBattleEnabled() ? 22 : 70, 240 / effectiveBattleSpeed()));
  }

  function clearAutoBattleTimer() {
    if (autoBattleTimer) {
      clearTimeout(autoBattleTimer);
      autoBattleTimer = null;
    }
  }

    function queueAutoBattleTurn() {
      if (!activeBattle || activeBattle.busy) return;
      if (activeBattle.enemies?.some((enemy) => enemy.mustRun) && activeBattle.yanRunWarningShown) {
        battleAction("run");
        return;
      }
    activeBattle.choices = {};
    renderBattle();
    executeBattleTurn();
  }

    function chooseAutoAction(member) {
      if (!activeBattle) return "attack";
      const enemy = syncActiveEnemy();
      if (activeBattle.enemies?.some((entry) => entry.mustRun) && activeBattle.yanRunWarningShown) return "run";
      if (enemy.mustRun) return "run";
    const affordableSkills = battleSkills(member).filter((skill) => skillCanPay(member, skill));
    const finalWindSpell = affordableSkills.find((skill) => enemy.mechanic === "windFinal" && enemy.hp <= 55 && skill.id === "windSpell");
    if (finalWindSpell) return { type: "skill", skillId: finalWindSpell.id };
    const fallen = fallenPartyMember();
    if (fallen) {
      const reviveSkill = affordableSkills
        .filter((skill) => skill.type === "revive")
        .sort((a, b) => (b.revive || 0) - (a.revive || 0))[0];
      if (reviveSkill) return { type: "skill", skillId: reviveSkill.id };
      if (state.inventory["Wake Leaf"]) return { type: "item", itemId: "wakeLeaf" };
    }
    const weakest = lowestLivingHpMember();
    const potion = state.inventory.Potion ? { type: "item", itemId: "potion" } : null;
    if (weakest && weakest.hp / weakest.maxHp < 0.42 && potion && member === activePartyMembers().find((entry) => entry.hp > 0)) return potion;
    const healSkill = affordableSkills
      .filter((skill) => skill.type === "heal" || skill.type === "healAll")
      .sort((a, b) => (b.heal || 0) - (a.heal || 0))[0];
    if (healSkill && weakest && weakest.hp / weakest.maxHp < 0.72) return { type: "skill", skillId: healSkill.id };
    const damageSkill = affordableSkills
      .filter((skill) => skill.type === "damage" && !(enemy.mechanic === "windFinal" && enemy.hp > 55 && skill.id === "windSpell"))
      .sort((a, b) => ((b.power || 1) * 10 + (b.flat || 0)) - ((a.power || 1) * 10 + (a.flat || 0)))[0];
    if (damageSkill && (enemy.boss || enemy.hp > activeBattle.maxHp * 0.42)) return { type: "skill", skillId: damageSkill.id };
    return "attack";
  }

  function kokhorBattleStatus(member) {
    const boostTurn = activeBattle?.kokhor?.[member?.id]?.boostTurn;
    if (!boostTurn) return "";
    if (activeBattle.turn === boostTurn) return "boosted";
    if (activeBattle.turn > boostTurn) return "hungover";
    return "warming";
  }

  function kokhorStatusLabel(member) {
    const status = kokhorBattleStatus(member);
    if (status === "boosted") return "Kokhor";
    if (status === "hungover") return "Hung over";
    if (status === "warming") return "Kokhor next";
    return "";
  }

  function applyKokhorDamageModifier(member, damage) {
    const status = kokhorBattleStatus(member);
    if (status === "boosted") {
      return {
        damage: Math.max(1, Math.round(damage * 3)),
        text: " Kokhor turns the hit ridiculous."
      };
    }
    if (status === "hungover") {
      return {
        damage: Math.max(1, Math.floor(damage * 0.45)),
        text: " The Kokhor hangover drags the swing sideways."
      };
    }
    return { damage, text: "" };
  }

  function kokhorIncomingDamageMultiplier(member) {
    return kokhorBattleStatus(member) === "hungover" ? 1.25 : 1;
  }

  function startBattleEffect(type, options = {}) {
    if (!activeBattle) return;
    const reducedMultiplier = reducedMotionEnabled() ? 0.2 : 1;
    const duration = Math.max(fastBattleEnabled() || reducedMotionEnabled() ? 45 : 140, ((options.duration || 560) * reducedMultiplier) / effectiveBattleSpeed());
    activeBattle.effect = {
      ...options,
      type,
      duration,
      startedAt: Date.now()
    };
  }

  function currentBattleEffect() {
    const effect = activeBattle?.effect;
    if (!effect) return null;
    const elapsed = Date.now() - effect.startedAt;
    if (elapsed > effect.duration + 90) {
      activeBattle.effect = null;
      return null;
    }
    return { ...effect, elapsed, progress: clamp(elapsed / effect.duration, 0, 1) };
  }

  function playBattleActionSfx(effect, damage = 0) {
    if (effect === "heal" || effect === "potion") playSfx("heal");
    else if (effect === "dragonSpell" || effect === "charmShot") playSfx("spell");
    else if (damage > 0) playSfx("slash");
  }

  function memberItemAction(member, choice) {
    const item = battleChoiceItem(choice);
    if (!item || !state.inventory[item.inventory]) {
      return {
        damage: 0,
        effect: null,
        duration: 280,
        message: `${member.name} reaches for an item, but the inventory has achieved emptiness.`
      };
    }
    if (item.type === "revive") {
      const target = selectedAlly(choice, (entry) => entry.hp <= 0);
      if (!target) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} holds up ${item.name}, but everyone is already standing.`
        };
      }
      if (item.consume && !useItem(item.inventory)) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} reaches for ${item.name}, but someone filed it under wishful thinking.`
        };
      }
      const restored = reviveHpAmount(target, item);
      target.hp = restored;
      return {
        damage: 0,
        targetId: target.id,
        effect: item.effect,
        color: item.color,
        duration: 720,
        message: `${member.name} uses ${item.name}. ${target.name} gets back up with ${restored} HP.`
      };
    }
    if (item.type === "kokhor") {
      const target = selectedAlly(choice, (entry) => entry.hp > 0) || member;
      activeBattle.kokhor ||= {};
      if (activeBattle.kokhor[target.id]) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${target.name} considers more Kokhor. Everyone nearby vetoes the experiment.`
        };
      }
      if (item.consume && !useItem(item.inventory)) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} reaches for ${item.name}, but someone filed it under wishful thinking.`
        };
      }
      activeBattle.kokhor[target.id] = { boostTurn: activeBattle.turn + 1 };
      return {
        damage: 0,
        targetId: target.id,
        effect: item.effect,
        color: item.color,
        duration: 720,
        message: `${member.name} gives ${target.name} Kokhor. Next round they hit like a siege engine; after that, the hangover starts.`
      };
    }
    if (item.consume && !useItem(item.inventory)) {
      return {
        damage: 0,
        effect: null,
        duration: 280,
        message: `${member.name} reaches for ${item.name}, but someone filed it under wishful thinking.`
      };
    }
    if (item.type === "mp") {
      const target = selectedAlly(choice, (entry) => entry.hp > 0 && entry.maxMp > 0) || lowestMpMember();
      const restored = etherRestoreAmount();
      target.mp = Math.min(target.maxMp, target.mp + restored);
      return {
        damage: 0,
        targetId: target.id,
        effect: item.effect,
        color: item.color,
        duration: 560,
        message: `${member.name} uses ${item.name}. ${target.name} recovers ${restored} MP.`
      };
    }
    if (item.type === "stun") {
      const enemy = enemyByInstance(choice.targetId) || syncActiveEnemy();
      const baseChance = item.id === "befuddlingBell" ? 0.58 : 0.5;
      const result = attemptEnemyStun(enemy, baseChance);
      const worked = result.worked;
      if (item.id === "befuddlingBell") activeBattle.bellReadyTurn = activeBattle.turn + 3;
      const chanceText = result.immune ? "temporary stun immunity" : `${Math.round(result.chance * 100)}% adjusted chance`;
      return {
        damage: 0,
        affectsEnemy: true,
        effect: item.effect,
        color: item.color,
        duration: 620,
        message: worked
          ? `${member.name} uses ${item.name}. ${enemy.name} loses track of the plot (${chanceText}).`
          : `${member.name} uses ${item.name}. ${enemy.name} resists (${chanceText}).`
      };
    }
    const target = selectedAlly(choice, (entry) => entry.hp > 0) || lowestLivingHpMember();
    if (!target) {
      return {
        damage: 0,
        effect: null,
        duration: 280,
        message: `${member.name} reaches for ${item.name}, but nobody standing can use it.`
      };
    }
    const heal = potionHealAmount();
    target.hp = Math.min(target.maxHp, target.hp + heal);
    return {
      damage: 0,
      targetId: target.id,
      effect: item.effect,
      color: item.color,
      duration: 560,
      message: `${member.name} tosses ${target.name} a ${item.name} for ${heal} HP.`
    };
  }

  function memberBattleAction(member, choice) {
    const action = normalizeBattleChoice(choice, member);
    const enemy = enemyByInstance(action.targetId) || syncActiveEnemy();
    activeBattle.enemy = enemy;
    if (action.type === "switch") {
      const target = memberById(action.memberId);
      const switched = target && switchActivePartyMember(member.id, target.id, { allowBusy: true, allowQueued: true, silent: true });
      return {
        damage: 0,
        effect: null,
        duration: 320,
        message: switched
          ? `${member.name} falls back. ${target.name} joins the front line.`
          : `${member.name} tries to switch, but the lineup refuses to cooperate.`
      };
    }
    const equipped = equippedWeapon(member);
    const equippedBonus = weaponBonus(member);
    const enemyDefense = equipped.armorPenetration ? 0 : enemy.def;
    let damage = Math.max(1, member.atk + equippedBonus + random(1, 6) - enemyDefense);
    if (action.type === "skill") {
      const skill = battleChoiceSkill(action, member) || defaultSkill(member);
      if (!skill) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} tries to use a skill, but the menu has become philosophical.`
        };
      }
      if (!battleSkillTypes.has(skill.type || "damage")) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} cannot use ${skill.name} in battle.`
        };
      }
      if (!skillCanPay(member, skill)) {
        return {
          damage: 0,
          effect: null,
          duration: 280,
          message: `${member.name} needs ${skillMpCost(member, skill)} MP for ${skill.name}.`
        };
      }
      const mpCost = skillMpCost(member, skill);
      if (skill.type === "revive") {
        const target = selectedAlly(action, (entry) => entry.hp <= 0);
        if (!target) {
          return {
            damage: 0,
            effect: null,
            duration: 280,
            message: `${member.name} starts ${skill.name}, but nobody is down.`
          };
        }
        if (mpCost > 0 && !creatorFlag("infiniteMp")) member.mp -= mpCost;
        const restored = reviveHpAmount(target, skill, member);
        target.hp = restored;
        return {
          damage: 0,
          targetId: target.id,
          effect: skill.effect,
          color: skill.color,
          duration: 840,
          message: `${member.name} uses ${skill.name}. ${target.name} returns with ${restored} HP.`
        };
      }
      if (mpCost > 0 && !creatorFlag("infiniteMp")) member.mp -= mpCost;
      if (skill.type === "heal") {
        const target = selectedAlly(action, (entry) => entry.hp > 0) || lowestLivingHpMember();
        if (!target) {
          return {
            damage: 0,
            effect: null,
            duration: 280,
            message: `${member.name} starts ${skill.name}, but nobody standing can receive it.`
          };
        }
        const heal = (skill.heal || 18) + Math.ceil(member.level / 4);
        target.hp = Math.min(target.maxHp, target.hp + heal);
        return {
          damage: 0,
          targetId: target.id,
          effect: skill.effect,
          color: skill.color,
          duration: 760,
          message: `${member.name} uses ${skill.name}. ${target.name} recovers ${heal} HP.`
        };
      }
        if (skill.type === "healAll") {
          const heal = (skill.heal || 12) + Math.ceil(member.level / 5);
          const targets = activePartyMembers().filter((entry) => entry.hp > 0);
          targets.forEach((target) => {
          target.hp = Math.min(target.maxHp, target.hp + heal);
        });
        return {
          damage: 0,
          targetId: member.id,
          targetIds: targets.map((target) => target.id),
          effect: skill.effect,
          color: skill.color,
          duration: 860,
            message: `${member.name} uses ${skill.name}. Everyone recovers ${heal} HP and briefly acts professional.`
          };
        }
        if (isSkullKnight(enemy)) {
          return skullKnightReassemblyResult(member, enemy, {
            weapon: skill.name,
            effect: skill.effect || "runeSlash",
            color: skill.color || "#ffe97a",
            duration: skill.effect === "dragonSpell" ? 860 : 720
          });
        }
        if (creatorFlag("oneHitEnemies")) {
          damage = Math.max(1, enemy.hp);
          enemy.hp = 0;
          return { damage, effect: skill.effect || "runeSlash", color: skill.color || "#ffe97a", duration: 680, message: `${member.name} uses ${skill.name}. Creator mode deletes ${enemy.name}'s argument.` };
        }
      const skillDefense = equipped.armorPenetration ? 0 : Math.floor(enemy.def * 0.72);
      damage = Math.max(1, Math.round((member.atk + random(1, 6) - skillDefense) * (skill.power || 1) + (skill.flat || 0)));
      const stunResult = skill.stunChance ? attemptEnemyStun(enemy, skill.stunChance) : null;
      const stunned = Boolean(stunResult?.worked);
      damage += equippedBonus;
      damage += Math.ceil(member.level / 3);
      const kokhor = applyKokhorDamageModifier(member, damage);
      damage = kokhor.damage;
      if (enemy.mechanic === "windFinal" && skill.id === "windSpell" && enemy.hp <= 55) {
        damage = enemy.hp;
        enemy.hp = 0;
        activeBattle.finalWindUsed = true;
        return { damage, effect: "dragonSpell", color: "#baffcf", duration: 1100, message: `${member.name} unleashes the Wind Spell. The Power of Air tears through Darhyn's final shadow phase for ${damage} damage.`, extraMessages: ["Darhyn's void crown shatters. The final blow happens inside the battle, where it belongs."] };
      }
      if (enemy.mechanic === "windFinal" && enemy.hp - damage < 55) {
        damage = Math.max(0, enemy.hp - 55);
        enemy.hp = 55;
        return { damage, effect: skill.effect || "runeSlash", color: skill.color || "#ffe97a", duration: 820, message: `${member.name} uses ${skill.name} for ${damage} damage. Darhyn anchors himself at the edge of defeat.`, extraMessages: ["Darhyn raises the Void Crown. Ordinary attacks cannot finish him—Yan must cast Wind Spell."] };
      }
      enemy.hp -= damage;
      const stunText = stunned ? ` ${enemy.name} is stunned.` : "";
      return { damage, effect: skill.effect || "runeSlash", color: skill.color || "#ffe97a", duration: skill.effect === "dragonSpell" ? 860 : 720, message: `${member.name} uses ${skill.name} with ${equipped.name} for ${damage} damage.${stunText}${kokhor.text}` };
    }
      if (isSkullKnight(enemy)) {
        return skullKnightReassemblyResult(member, enemy, {
          weapon: equipped.name,
          effect: /bow|crossbow/i.test(equipped.name) ? "charmShot" : "slash",
          color: /bow|crossbow/i.test(equipped.name) ? (member.id === "dalin" ? "#9ee9a3" : "#f2d977") : (member.id === "derlin" ? "#ff816a" : "#f7e391"),
          duration: /bow|crossbow/i.test(equipped.name) ? 620 : 500
        });
      }
      if (creatorFlag("oneHitEnemies")) {
        damage = Math.max(1, enemy.hp);
        enemy.hp = 0;
        return { damage, effect: "slash", color: "#ffe97a", duration: 560, message: `${member.name} lands a creator-grade hit for ${damage}.` };
      }
    const kokhor = applyKokhorDamageModifier(member, damage);
    damage = kokhor.damage;
    if (enemy.mechanic === "windFinal" && enemy.hp - damage < 55) {
      damage = Math.max(0, enemy.hp - 55);
      enemy.hp = 55;
      return { damage, effect: "slash", color: "#baffcf", duration: 700, message: `${member.name} drives Darhyn to his final shadow phase for ${damage} damage.`, extraMessages: ["The Void Crown locks Darhyn at 55 HP. Yan's Wind Spell is the only finishing action."] };
    }
    enemy.hp -= damage;
    if (/bow|crossbow/i.test(equipped.name)) {
      return { damage, effect: "charmShot", color: member.id === "dalin" ? "#9ee9a3" : "#f2d977", duration: 620, message: `${member.name} attacks with ${equipped.name} for ${damage}.${kokhor.text}` };
    }
    return { damage, effect: "slash", color: member.id === "derlin" ? "#ff816a" : "#f7e391", duration: 500, message: `${member.name} attacks with ${equipped.name} for ${damage}.${kokhor.text}` };
  }

  async function enemyAttackSequence(scale = 1) {
    if (!activeBattle) return false;
    for (const enemy of livingEnemies()) {
      syncActiveEnemy();
      activeBattle.enemy = enemy;
      activeBattle.id = enemy.id;
      activeBattle.maxHp = enemy.maxHp;
      if (enemy.id === "corizaz") {
        const ok = await corizazSleepSequence(scale);
        if (!ok) return false;
        continue;
      }
      const accessoryBaseChance = partyAccessoryMax("enemySkipChance", activePartyMembers());
      const accessoryChance = accessoryBaseChance * (enemy.final ? 0.18 : enemy.boss ? 0.4 : 1);
      if (activeBattle.turn > (enemy.accessoryDistractImmuneThrough || 0) && Math.random() < accessoryChance) {
        enemy.accessoryDistractImmuneThrough = activeBattle.turn + 1;
        await battleMessage(`${enemy.name} loses a turn listening for a bell that may not be there.`);
        continue;
      }
      if ((enemy.stunnedTurns || 0) > 0) {
        enemy.stunnedTurns -= 1;
        await battleMessage(`${enemy.name} loses a turn wondering if Yvonne meant that smile.`);
        continue;
      }
      if (await enemySupportAction(enemy)) continue;
      if (await enemyBossMechanic(enemy, scale)) continue;
      const attacks = enemy.attacks || 1;
      for (let i = 0; i < attacks; i += 1) {
        const alive = activePartyMembers().filter((member) => member.hp > 0);
        if (!alive.length) {
          if (!promoteLivingReserve()) {
            await partyDefeated();
            return false;
          }
          continue;
        }
        const target = alive[Math.floor(Math.random() * alive.length)];
        const defenseBonus = armorDefenseBonus(target);
        let damage = Math.max(1, Math.floor((enemy.atk + random(0, 5) - target.def - defenseBonus) * scale));
        damage = Math.max(1, Math.floor(damage * kokhorIncomingDamageMultiplier(target)));
        if (creatorFlag("infiniteHp")) damage = 0;
        activeBattle.targetId = target.id;
        activeBattle.enemyAction = true;
        startBattleEffect("enemyStrike", { targetId: target.id, affectsEnemy: false, duration: 520, color: "#ff6651" });
        playSfx("enemy");
        pulseBattle("enemy");
        renderBattle();
        await delay(240);
        target.hp = creatorFlag("infiniteHp") ? target.maxHp : target.hp - damage;
        playSfx("enemyHit");
        await battleMessage(`${enemy.name} hits ${target.name} for ${damage}.`, 720);
        activeBattle.targetId = null;
        activeBattle.enemyAction = false;
        renderBattle();
        await delay(180);
        if (state.party.every((member) => member.hp <= 0)) {
          await partyDefeated();
          return false;
        }
        if (activePartyMembers().every((member) => member.hp <= 0) && promoteLivingReserve()) {
          await battleMessage(`${activePartyMembers().find((member) => member.hp > 0)?.name || "A reserve"} steps into the front line.`, 520);
        }
      }
    }
    syncActiveEnemy();
    return true;
  }

  async function bossDamageParty(enemy, amount, message, color = "#b98cff") {
    let targets = activePartyMembers().filter((member) => member.hp > 0);
    if (!targets.length) {
      const promoted = promoteLivingReserves();
      if (!promoted.length) {
        await partyDefeated();
        return false;
      }
      const names = promoted.map((member) => member.name).join(" and ");
      await battleMessage(`${names} ${promoted.length === 1 ? "steps" : "step"} in from reserve.`, 620, 180);
      targets = activePartyMembers().filter((member) => member.hp > 0);
    }
    targets.forEach((target) => {
      const defense = Math.floor((target.def + armorDefenseBonus(target)) * 0.25);
      const damage = creatorFlag("infiniteHp") ? 0 : Math.max(1, Math.floor((amount + random(0, 4) - defense) * kokhorIncomingDamageMultiplier(target)));
      target.hp = creatorFlag("infiniteHp") ? target.maxHp : target.hp - damage;
    });
    activeBattle.enemyAction = true;
    startBattleEffect("dragonSpell", { targetIds: targets.map((target) => target.id), affectsEnemy: false, duration: 820, color });
    playSfx("spell");
    renderBattle();
    await battleMessage(message, 920, 260);
    activeBattle.enemyAction = false;
    activeBattle.effect = null;
    if (state.party.every((member) => member.hp <= 0)) {
      await partyDefeated();
      return false;
    }
    if (activePartyMembers().every((member) => member.hp <= 0)) {
      const promoted = promoteLivingReserves();
      if (!promoted.length) {
        await partyDefeated();
        return false;
      }
      const names = promoted.map((member) => member.name).join(" and ");
      await battleMessage(`${names} ${promoted.length === 1 ? "steps" : "step"} in from reserve.`, 620, 180);
    }
    return true;
  }

  async function enemyBossMechanic(enemy, scale = 1) {
    if (!enemy?.mechanic) return false;
    if (enemy.mechanic === "windFinal") {
      if (enemy.hp <= 55) {
        await battleMessage("Darhyn's Void Crown gathers a black cyclone. Wind Spell is flashing in Yan's command list.", 880, 260);
        await bossDamageParty(enemy, Math.floor(17 * scale), "Darhyn releases Void Crown: every active hero is struck by shadow wind.", "#b275ff");
        return true;
      }
      if (activeBattle.turn % 3 === 0) {
        await bossDamageParty(enemy, Math.floor(13 * scale), "Darhyn casts Orb Eclipse. The whole front line is caught in the blast.", "#7bdcff");
        return true;
      }
      return false;
    }
    if (enemy.mechanic === "hammerCharge") {
      if (!enemy.chargedMove && activeBattle.turn % 2 === 1) {
        enemy.chargedMove = true;
        await battleMessage("Hano raises the ceremonial hammer. Heavy Impact is telegraphed for next turn—stun him or prepare.", 860, 240);
        return true;
      }
      if (enemy.chargedMove) {
        enemy.chargedMove = false;
        await bossDamageParty(enemy, Math.floor(18 * scale), "Hano's Heavy Impact crashes across the entire line.", "#ffbf68");
        return true;
      }
    }
    if (enemy.mechanic === "lifeDrain" && activeBattle.turn % 3 === 0) {
      const before = enemy.hp;
      await bossDamageParty(enemy, Math.floor(14 * scale), "Lithar invokes Lifehater's Due, draining the front line.", "#ff668a");
      enemy.hp = Math.min(enemy.maxHp, before + 22);
      await battleMessage("The stolen vitality restores 22 HP to Lithar.", 620, 180);
      return true;
    }
    if (enemy.mechanic === "twinVolley" && activeBattle.turn % 2 === 0) {
      await bossDamageParty(enemy, Math.floor(11 * scale), "Yvonne and Yvette cross their sights. Twin Volley tags the whole front line.", "#ff9bd5");
      return true;
    }
    if (enemy.mechanic === "stampede" && activeBattle.turn % 2 === 0) {
      await bossDamageParty(enemy, Math.floor(9 * scale), "Old Betsy uses Barnyard Stampede. Chore difficulty escalates sharply.", "#e8c585");
      return true;
    }
    return false;
  }

  async function enemySupportAction(enemy) {
    const support = enemy.support;
    if (!support || support.type !== "healAll" || Math.random() > (support.chance || 0.25)) return false;
    const targets = livingEnemies().filter((entry) => entry.hp < entry.maxHp);
    if (!targets.length) return false;
    const heal = support.heal || 12;
    targets.forEach((target) => {
      target.hp = Math.min(target.maxHp, target.hp + heal);
    });
    activeBattle.enemyAction = true;
    startBattleEffect("heal", { affectsEnemy: true, duration: 720, color: "#a8ff93" });
    playSfx("heal");
    renderBattle();
    await battleMessage(`${enemy.name} patches up the enemy group for ${heal} HP.`, 760);
    activeBattle.enemyAction = false;
    activeBattle.effect = null;
    renderBattle();
    await delay(180);
    return true;
  }

  async function corizazSleepSequence(scale = 1) {
    if (!activeBattle) return false;
    const corizaz = activeBattle.enemy;
    if ((corizaz?.stunnedTurns || 0) > 0) {
      corizaz.stunnedTurns -= 1;
      await battleMessage("Sleeping Corizaz snores straight through the distraction.");
      return true;
    }
    const alive = activePartyMembers().filter((member) => member.hp > 0);
    if (!alive.length) {
      if (!promoteLivingReserve()) {
        await partyDefeated();
        return false;
      }
      return true;
    }

    const sleepRoll = Math.random();
    if (sleepRoll < 0.25) {
      activeBattle.effect = null;
      playSfx("snore");
      await battleMessage("Sleeping Corizaz mumbles about another five centuries and keeps sleeping.");
      return true;
    }

    const target = alive[Math.floor(Math.random() * alive.length)];
    const defenseBonus = armorDefenseBonus(target);
    const rollOver = sleepRoll > 0.66;
    const base = rollOver ? 9 + random(0, 5) : 5 + random(0, 4);
    let damage = Math.max(1, Math.floor((base - Math.floor((target.def + defenseBonus) * 0.16)) * scale));
    damage = Math.max(1, Math.floor(damage * kokhorIncomingDamageMultiplier(target)));
    if (creatorFlag("infiniteHp")) damage = 0;
    const effectType = rollOver ? "sleepRoll" : "sleepSnore";
    const color = rollOver ? "#dfff9f" : "#a8ff93";
    activeBattle.targetId = target.id;
    startBattleEffect(effectType, { targetId: target.id, affectsEnemy: false, duration: rollOver ? 620 : 700, color });
    playSfx("snore");
    renderBattle();
    await delay(260);
    target.hp = creatorFlag("infiniteHp") ? target.maxHp : target.hp - damage;
    const message = rollOver
      ? `Sleeping Corizaz rolls over in his sleep. ${target.name} is clipped for ${damage}.`
      : `Sleeping Corizaz lets out a thunderous snore. ${target.name} takes ${damage} from the shockwave.`;
    await battleMessage(message, 780);
    activeBattle.targetId = null;
    renderBattle();
    await delay(180);
    if (state.party.every((member) => member.hp <= 0)) {
      await partyDefeated();
      return false;
    }
    if (activePartyMembers().every((member) => member.hp <= 0) && promoteLivingReserve()) {
      await battleMessage(`${activePartyMembers().find((member) => member.hp > 0)?.name || "A reserve"} steps into the front line.`, 520);
    }
    return true;
  }

  async function finishBattleWin(message) {
    if (!activeBattle) return;
    const enemy = activeBattle.enemy;
    await battleMessage(message, 760);
    const done = activeBattle.afterWin;
    const reward = grantBattleRewards(enemy, done, activeBattle.itemRewards || []);
    clearAutoBattleTimer();
    activeBattle.busy = true;
    activeBattle.actorId = null;
    activeBattle.targetId = null;
    activeBattle.enemyAction = false;
    activeBattle.effect = null;
    activeBattle.choices = {};
    activeBattle.reward = reward;
    playSfx("victory");
    setMusicTheme("victory");
    renderBattle();
    await waitForBattleRewardConfirmation();
    if (!activeBattle) return;
    await showKeyItemRewardModals(reward.itemRewards);
    if (!activeBattle) return;
    activeBattle = null;
    hideManagedDialog("battle");
    setBattleActionMode("normal");
    if (done) done();
    render();
    saveLocal();
  }

  function grantBattleRewards(enemy, done, itemRewards = []) {
    const defeatedEnemies = activeBattle?.enemies || [enemy];
    const xp = defeatedEnemies.reduce((sum, entry) => sum + (entry.xp || 0), 0);
    const gold = defeatedEnemies.reduce((sum, entry) => sum + (entry.gold || 0), 0);
    const levelMessages = [];
    const grantedItems = grantConfiguredItemRewards(itemRewards);
    const activeIds = new Set(activePartyMembers().map((member) => member.id));
    const rewardedMembers = state.party.slice();
    const reserveXp = Math.ceil(xp * 0.6);
    const reserveRecipientIds = [];
    state.gold += gold;
    for (const member of rewardedMembers) {
      const active = activeIds.has(member.id);
      const earnedXp = active ? xp : reserveXp;
      if (!active && earnedXp > 0 && member.level < SAVE_LIMITS.maxLevel) reserveRecipientIds.push(member.id);
      member.xp += earnedXp;
      let needed = member.level * 24;
      while (member.level < SAVE_LIMITS.maxLevel && member.xp >= needed) {
        member.xp -= needed;
        member.level += 1;
        const learned = newlyLearnedSkills(member, member.level);
        member.maxHp += 5;
        member.maxMp += member.maxMp > 0 ? 2 : 0;
        member.atk += 2;
        member.def += 1;
        levelMessages.push(`${member.name} reaches level ${member.level}.`);
        if (learned.length) {
          levelMessages.push(`${member.name} learns ${learned.map((skill) => skill.name).join(", ")}.`);
        }
        needed = member.level * 24;
      }
      if (member.level >= SAVE_LIMITS.maxLevel) member.xp = 0;
    }
    return {
      done,
      enemyName: enemyGroupName(defeatedEnemies),
      xp,
      reserveXp,
      reserveRecipientIds,
      gold,
      memberIds: rewardedMembers.map((member) => member.id),
      itemRewards: grantedItems,
      levelMessages,
      resolve: null
    };
  }

  function waitForBattleRewardConfirmation() {
    return new Promise((resolve) => {
      if (!activeBattle?.reward) {
        resolve();
        return;
      }
      activeBattle.reward.resolve = resolve;
    });
  }

  function confirmBattleReward() {
    if (!activeBattle?.reward) return;
    const reward = activeBattle.reward;
    if (reward.confirmed) return;
    reward.confirmed = true;
    document.querySelectorAll(".battle-actions button").forEach((button) => {
      button.disabled = true;
    });
    if (reward.resolve) reward.resolve();
  }

  async function battleMessage(message, ms = 700, minMs = 90) {
    $("battle-log").textContent = message;
    renderBattle();
    await delay(ms, minMs);
  }

  function delay(ms, minMs = 90) {
    const minimum = fastBattleEnabled() ? Math.min(40, minMs) : minMs;
    return new Promise((resolve) => setTimeout(resolve, Math.max(minimum, ms / effectiveBattleSpeed())));
  }

  function rawDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  function setBattleControls(enabled) {
    document.querySelectorAll(".battle-actions button").forEach((button) => {
      if (button.dataset.action === "auto") button.disabled = !activeBattle;
      else if (button.dataset.action === "execute") button.disabled = !enabled || !allActionsQueued();
      else if (button.dataset.action === "undo") button.disabled = !enabled || !Object.keys(activeBattle?.choices || {}).length;
      else button.disabled = !enabled;
    });
  }

  function pulseBattle(side) {
    const box = document.querySelector(".battle-box");
    const canvas = $("battle-stage");
    if (!box || !canvas) return;
    if (side === "player") {
      box.classList.remove("is-player-attacking");
      void box.offsetWidth;
      box.classList.add("is-player-attacking");
    } else {
      box.classList.remove("is-enemy-attacking");
      canvas.classList.remove("is-attacking");
      void box.offsetWidth;
      box.classList.add("is-enemy-attacking");
      canvas.classList.add("is-attacking");
      drawBattleStage("attack");
      setTimeout(() => drawBattleStage(), Math.max(fastBattleEnabled() ? 35 : 90, 280 / effectiveBattleSpeed()));
    }
  }

  function hitEnemySprite() {
    const canvas = $("battle-stage");
    if (!canvas) return;
    playSfx("hit");
    canvas.classList.remove("is-hit");
    void canvas.offsetWidth;
    canvas.classList.add("is-hit");
  }

  function endBattle() {
    clearAutoBattleTimer();
    activeBattle = null;
    hideManagedDialog("battle");
    updateMusicForContext();
  }

  async function playPartyDefeatEffect() {
    const effect = $("screen-effect");
    const battleBox = document.querySelector(".battle-box");
    $("battle-log").textContent = "The party falls.";
    if (activeBattle) {
      activeBattle.actorId = null;
      activeBattle.targetId = null;
      activeBattle.enemyAction = false;
      renderBattle();
    }
    playSfx("defeat");
    document.body.classList.remove("is-party-defeat");
    battleBox?.classList.remove("is-party-defeat");
    if (effect) effect.className = "screen-effect is-party-defeat";
    void document.body.offsetWidth;
    document.body.classList.add("is-party-defeat");
    battleBox?.classList.add("is-party-defeat");
    await rawDelay(1550);
    document.body.classList.remove("is-party-defeat");
    battleBox?.classList.remove("is-party-defeat");
    if (effect) effect.className = "screen-effect is-hidden";
  }

  async function partyDefeated() {
    if (creatorFlag("infiniteHp")) {
      healParty(1);
      say([["Creator", "Infinite HP caught the defeat and put everyone back on their feet."]]);
      render();
      saveLocal();
      return;
    }
    await playPartyDefeatEffect();
    state.gold = Math.floor(state.gold * 0.75);
    revivePartyAfterDefeat();
    endBattle();
    const checkpoint = sanitizeCheckpoint(state.checkpoint, gameConfig.startAreaId, areas[gameConfig.startAreaId].start[0], areas[gameConfig.startAreaId].start[1]);
    state.areaId = checkpoint.areaId;
    state.x = checkpoint.x;
    state.y = checkpoint.y;
    state.partyTrail = [];
    state.facing = "down";
    state.movedAt = Date.now();
    markAreaVisited(checkpoint.areaId);
    loadAreaAssets(checkpoint.areaId);
    say([
      ["Narrator", "The party wakes at the last safe road marker, lighter in gold and heavier in humility."],
      ["Derlin", "That was not a defeat. That was forced research."]
    ]);
    render();
    saveLocal();
  }

  function reviveHpAmount(target, source, caster = null) {
    const percent = source?.revive || 0.5;
    const casterBonus = caster ? Math.ceil(caster.level / 8) : 0;
    return clamp(Math.ceil(target.maxHp * percent) + casterBonus, 1, target.maxHp);
  }

  function potionHealAmount() {
    return 32 + partyAccessoryMax("potionBonus", battleTargetMembers());
  }

  function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function say(lines, done, options = {}) {
    dialogueQueue = resolveDialogueLines(lines);
    dialogueDone = done || null;
    if (options.event) lockNpcDialogueMotion(options.event);
    else clearNpcDialogueMotion();
    showManagedDialog("dialogue", "#dialogue-next");
    nextDialogue();
  }

  function dialogueVisible() {
    return !$("dialogue").classList.contains("is-hidden");
  }

  function advanceDialogueWithMove() {
    if (!dialogueVisible()) return false;
    nextDialogue();
    return true;
  }

  function nextDialogue() {
    if (dialogueTypingTimer) {
      clearInterval(dialogueTypingTimer);
      dialogueTypingTimer = null;
      $("dialogue-text").textContent = dialogueFullText;
      return;
    }
    if (!dialogueQueue.length) {
      hideManagedDialog("dialogue");
      clearNpcDialogueMotion();
      const done = dialogueDone;
      dialogueDone = null;
      if (done) done();
      render();
      if (state?.coaching?.enabled && !state.coaching.seen.dialogue) coach("dialogue");
      if (state) {
        const followup = visibleEventAt(state.x, state.y);
        if (!transitionPending() && followup && followup.once && !state.completedEvents[followup.id]) triggerEvent(followup);
      }
      return;
    }
    const [speaker, text] = dialogueQueue.shift();
    $("speaker").textContent = speaker;
    dialogueFullText = text;
    const textDelay = { instant: 0, standard: 18, relaxed: 34 }[state?.settings?.textSpeed] || 0;
    if (!textDelay) $("dialogue-text").textContent = text;
    else {
      let index = 0;
      $("dialogue-text").textContent = "";
      dialogueTypingTimer = setInterval(() => {
        index += 1;
        $("dialogue-text").textContent = text.slice(0, index);
        if (index >= text.length) {
          clearInterval(dialogueTypingTimer);
          dialogueTypingTimer = null;
        }
      }, textDelay);
    }
    loadDialoguePortraitAssets(speaker);
    drawDialoguePortrait(speaker);
    $("dialogue-next").textContent = dialogueQueue.length ? "Next" : "Done";
  }

  function dialoguePortraitFor(speaker) {
    if (speakerPortraits[speaker]) return speakerPortraits[speaker];
    if (/darhyn/i.test(speaker)) return { type: "enemy", id: "darhyn" };
    if (/lithar/i.test(speaker)) return { type: "enemy", id: "lithar2" };
    if (/corizaz/i.test(speaker)) return { type: "enemy", id: "corizaz" };
    if (/hano/i.test(speaker)) return { type: "enemy", id: "hano" };
    if (/yan/i.test(speaker)) return { type: "hero", id: "yan" };
    if (/king|priest|scribe|shrine/i.test(speaker)) return { type: "hero", id: "scribe" };
    return { type: "narrator" };
  }

  function loadDialoguePortraitAssets(speaker) {
    const portrait = dialoguePortraitFor(speaker);
    const keys = new Set();
    if (portrait.type === "hero") {
      keys.add("portraitAtlas");
      const customKey = customPortraitKeys[portrait.id];
      if (customKey) keys.add(customKey);
      characterAssetKeysForIds([portrait.id]).forEach((key) => keys.add(key));
    } else if (portrait.type === "enemy") {
      enemyAssetKeysForIds([portrait.id]).forEach((key) => keys.add(key));
    } else {
      keys.add("narratorIcon");
    }
    loadArtAssets([...keys]);
  }

  function drawDialoguePortrait(speaker) {
    const canvas = $("dialogue-portrait");
    if (!canvas) return;
    const { ctx, width, height } = prepareHiDPICanvas(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(46, 38, 58, 0.96)");
    gradient.addColorStop(1, "rgba(9, 8, 12, 0.96)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 221, 154, 0.08)";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 52, 0, Math.PI * 2);
    ctx.fill();
    const portrait = dialoguePortraitFor(speaker);
    if (portrait.type === "hero") {
      drawCharacterPortrait(ctx, width, height, portrait.id);
    } else if (portrait.type === "enemy") {
      drawEnemyModel(ctx, portrait.id, width / 2, height + 18, portrait.id === "darhyn" || portrait.id === "dreamDarhyn" ? 0.88 : 0.76);
    } else {
      drawNarratorPortrait(ctx, width, height);
    }
    ctx.strokeStyle = "rgba(255, 221, 154, 0.26)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
    if (portrait.type === "enemy") drawPortraitOverlay(ctx, width, height);
  }

  function openMenu(tab = "inventory") {
    if (!state || activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || modalOpen()) return false;
    activeShopId = null;
    activeInnOffer = null;
    activeMenuTab = menuTabs.some(([id]) => id === tab) ? tab : "inventory";
    showManagedDialog("menu-modal", "#close-menu");
    renderMenuContent();
    return true;
  }

  function closeMenu(restoreFocus = true) {
    activeShopId = null;
    activeInnOffer = null;
    hideManagedDialog("menu-modal", restoreFocus);
  }

  function openShop(shopId) {
    if (!shops[shopId]) return;
    activeShopId = shopId;
    activeInnOffer = null;
    shopMessage = shops[shopId].greeting;
    showManagedDialog("menu-modal", "#close-menu");
    renderMenuContent();
  }

  function buyShopItem(itemName) {
    const shop = shops[activeShopId];
    if (!shop) return;
    const offer = shop.items.find((entry) => entry.item === itemName);
    if (!offer) return;
    const purchaseKey = `${activeShopId}:${offer.item}`;
    const bought = state.shopPurchases[purchaseKey] || 0;
    if (offer.stock && bought >= offer.stock) {
      shopMessage = `${offer.item} is sold out. Limited stock means the sign finally told the truth.`;
      renderMenuContent();
      return;
    }
    if (state.gold < offer.cost) {
      shopMessage = `You need ${offer.cost} gold for ${offer.item}. Current purse status: ${state.gold} gold and a brave face.`;
      renderMenuContent();
      return;
    }
    state.gold -= offer.cost;
    addItem(offer.item, 1);
    state.shopPurchases[purchaseKey] = bought + 1;
    shopMessage = `Bought ${offer.item}. The shopkeeper accepts this as evidence of a functioning economy.`;
    render();
    saveLocal();
  }

  function shopSellValue(itemName) {
    const listed = Object.values(shops).flatMap((shop) => shop.items || []).filter((offer) => offer.item === itemName).map((offer) => offer.cost);
    if (listed.length) return Math.max(1, Math.floor(Math.max(...listed) * 0.45));
    const item = weaponCatalog[itemName] || armorCatalog[itemName] || accessoryCatalog[itemName];
    const stat = item?.bonus || item?.defBonus || item?.mpCostReduction || 1;
    const battleItem = Object.values(battleItemCatalog).find((entry) => entry.inventory === itemName);
    return battleItem?.consume ? 7 : Math.max(8, stat * 12);
  }

  function unequippedInventoryCount(itemName) {
    const slot = equipmentSlotForItem(itemName);
    const equipped = slot ? equippedGearCount(itemName, slot) : 0;
    return Math.max(0, (state.inventory[itemName] || 0) - equipped);
  }

  function sellableShopItems() {
    return Object.keys(state.inventory).filter((name) => {
      if (unequippedInventoryCount(name) <= 0 || regularInventoryHiddenItems.has(name)) return false;
      const battleItem = Object.values(battleItemCatalog).find((entry) => entry.inventory === name);
      if (battleItem) return Boolean(battleItem.consume);
      const gear = weaponCatalog[name] || armorCatalog[name] || accessoryCatalog[name];
      return Boolean(gear && !gear.starter);
    });
  }

  function sellShopItem(itemName) {
    if (!activeShopId || !sellableShopItems().includes(itemName)) return;
    const value = shopSellValue(itemName);
    state.inventory[itemName] -= 1;
    if (state.inventory[itemName] <= 0) delete state.inventory[itemName];
    state.gold += value;
    shopMessage = `Sold ${itemName} for ${value} gold. Equipped copies and key items stay protected.`;
    render();
    saveLocal();
  }

  function buyShopService(serviceId) {
    const shop = shops[activeShopId];
    const service = shop?.services?.find((entry) => entry.id === serviceId);
    if (!service || state.shopServices[service.id]) return;
    if (state.gold < service.cost) {
      shopMessage = `You need ${service.cost} gold for ${service.name}.`;
      renderMenuContent();
      return;
    }
    state.gold -= service.cost;
    if (service.id === "forgeTune") state.party.forEach((member) => { member.atk += 1; });
    if (service.id === "armorFitting") state.party.forEach((member) => { member.def += 1; });
    if (service.id === "tideBlessing") state.party.filter((member) => member.maxMp > 0).forEach((member) => { member.maxMp += 2; member.mp += 2; });
    if (service.id === "royalTraining") {
      const targetLevel = Math.max(1, Math.max(...state.party.map((member) => member.level)) - 1);
      state.party.forEach((member) => {
        while (member.level < targetLevel) {
          member.level += 1;
          member.maxHp += 5;
          if (member.maxMp > 0) member.maxMp += 2;
          member.atk += 2;
          member.def += 1;
        }
        member.hp = member.maxHp;
        member.mp = member.maxMp;
      });
    }
    state.shopServices[service.id] = true;
    shopMessage = `${service.name} completed. This permanent service is now marked purchased.`;
    render();
    saveLocal();
  }

  function restorePartyAtInn(inn) {
    const cost = Math.max(0, inn?.cost || 0);
    if (state.gold < cost) return false;
    state.gold -= cost;
    healParty(1);
    state.checkpoint = { areaId: state.areaId, x: state.x, y: state.y };
    return true;
  }

  function restAtShopInn(shopId) {
    const shop = shops[shopId];
    const inn = shop?.inn;
    if (!inn) return;
    if (!restorePartyAtInn(inn)) {
      shopMessage = `${inn.name} costs ${inn.cost} gold. Current purse status: ${state.gold} gold and a disappointed pillow.`;
      renderMenuContent();
      return;
    }
    shopMessage = inn.cost
      ? `Stayed at ${inn.name} for ${inn.cost} gold. HP and MP restored.`
      : `Rested at ${inn.name}. HP and MP restored.`;
    render();
    saveLocal();
  }

  function openInnPrompt(name, cost = 0) {
    activeShopId = null;
    const firstTip = state.coaching.enabled && !state.coaching.seen.inns;
    if (firstTip) state.coaching.seen.inns = true;
    activeInnOffer = { name, cost: Math.max(0, cost || 0), message: firstTip ? "Inn coaching: confirm the shown price to restore the available party and create a safe checkpoint." : "" };
    showManagedDialog("menu-modal", "#close-menu");
    renderMenuContent();
  }

  function stayAtInn(name, cost = 0) {
    if (state.gold < Math.max(0, cost || 0)) {
      say([["Innkeeper", `${name} costs ${cost} gold. Come back when the coin purse stops echoing.`]]);
      return;
    }
    openInnPrompt(name, cost);
  }

  function confirmInnStay() {
    const inn = activeInnOffer;
    if (!inn) return;
    if (!restorePartyAtInn(inn)) {
      activeInnOffer = {
        ...inn,
        message: `${inn.name} costs ${inn.cost} gold. Current purse status: ${state.gold} gold and a disappointed pillow.`
      };
      renderMenuContent();
      return;
    }
    activeInnOffer = null;
    closeMenu();
    say([
      [inn.name, inn.cost ? `The party stays the night for ${inn.cost} gold.` : "The party takes a real rest."],
      ["Narrator", "HP and MP restored."]
    ], () => {
      render();
      saveLocal();
    });
    render();
    saveLocal();
  }

  function cancelInnStay() {
    activeInnOffer = null;
    closeMenu();
    render();
  }

  function useFieldItem(itemId, memberId) {
    const item = battleItemCatalog[itemId];
    const target = state.party.find((member) => member.id === memberId);
    if (!item || !target) return;
    if (!item.consume || !state.inventory[item.inventory]) {
      menuMessage = `${item?.name || "That item"} is not available right now.`;
      renderMenuContent();
      return;
    }
    if (item.type === "revive") {
      if (target.hp > 0) {
        menuMessage = `${target.name} is already standing.`;
        renderMenuContent();
        return;
      }
      useItem(item.inventory);
      const restored = reviveHpAmount(target, item);
      target.hp = restored;
      menuMessage = `${target.name} gets back up with ${restored} HP from ${item.name}.`;
      render();
      saveLocal();
      return;
    }
    if (item.type === "mp") {
      if (!target.maxMp) {
        menuMessage = `${target.name} studies the Ether Leaf and decides this is not their lane.`;
        renderMenuContent();
        return;
      }
      if (target.mp >= target.maxMp) {
        menuMessage = `${target.name}'s MP is already full.`;
        renderMenuContent();
        return;
      }
      useItem(item.inventory);
      const restored = etherRestoreAmount();
      target.mp = Math.min(target.maxMp, target.mp + restored);
      menuMessage = `${target.name} recovers ${restored} MP from ${item.name}.`;
      render();
      saveLocal();
      return;
    }
    if (item.type === "heal") {
      if (target.hp <= 0) {
        menuMessage = `${target.name} needs a Wake Leaf or revive skill. Potions cannot revive KO'd party members.`;
        renderMenuContent();
        return;
      }
      if (target.hp >= target.maxHp) {
        menuMessage = `${target.name}'s HP is already full.`;
        renderMenuContent();
        return;
      }
      useItem(item.inventory);
      const heal = potionHealAmount();
      target.hp = Math.min(target.maxHp, target.hp + heal);
      menuMessage = `${target.name} drinks a ${item.name} for ${heal} HP.`;
      render();
      saveLocal();
    }
  }

  function zoomSpellFor(member) {
    return availableSkills(member).find((skill) => skill.id === zoomSkillId && skill.type === "fieldTravel") || null;
  }

  function zoomSpellMember() {
    return state.party.find((member) => member.hp > 0 && zoomSpellFor(member)) || null;
  }

  function zoomSpellCaster() {
    return state.party.find((member) => {
      const skill = member.hp > 0 ? zoomSpellFor(member) : null;
      return skill && skillCanPay(member, skill);
    }) || null;
  }

  function knownZoomDestinations() {
    return zoomDestinations.filter((destination) => areas[destination.id] && isAreaVisited(destination.id));
  }

  function performZoomTravel(areaId, source) {
    const destination = zoomDestinations.find((entry) => entry.id === areaId);
    if (!destination || !areas[areaId] || !isAreaVisited(areaId)) {
      menuMessage = "Fast travel unlocks only after the party has actually visited that destination.";
      renderMenuContent();
      return;
    }
    if (worldAreaId(state.areaId) === areaId) {
      menuMessage = `The party is already in ${destination.label}.`;
      renderMenuContent();
      return;
    }

    let speaker = zoomItemName;
    let line = `The ${zoomItemName} cracks open and pulls the party back to ${destination.label}.`;
    let casterId = "";
    if (source === "spell") {
      const caster = zoomSpellCaster();
      const skill = caster ? zoomSpellFor(caster) : null;
      if (!caster || !skill) {
        menuMessage = "No one can cast Zoom right now.";
        renderMenuContent();
        return;
      }
      const cost = skillMpCost(caster, skill);
      if (cost > 0 && !creatorFlag("infiniteMp")) caster.mp -= cost;
      casterId = caster.id;
      speaker = caster.name;
      line = `${caster.name} casts Zoom. The route snaps back to ${destination.label}.`;
    } else if (!useItem(zoomItemName)) {
      menuMessage = `${zoomItemName} is not in the pack.`;
      renderMenuContent();
      return;
    }

    menuMessage = "";
    state.pendingTransition = {
      eventId: "zoom_travel",
      type: "travel",
      phase: "departing",
      areaId: destination.id,
      source: source === "spell" ? "spell" : "item",
      casterId
    };
    closeMenu();
    render();
    saveLocal();
    playWaterOrbTransition(() => {
      if (state.pendingTransition?.eventId === "zoom_travel") state.pendingTransition = null;
      travelTo(areaId);
      say([[speaker, line]]);
    });
  }

  function renderShopContent(shopId) {
    const shop = shops[shopId];
    if (!shop) return false;
    $("menu-content").innerHTML = `
      <div class="menu-note shop-note">
        <strong>${shop.name}</strong>
        <p>${shopMessage || shop.greeting}</p>
        <p class="shop-gold-total"><span>Gold</span>${shopGoldAmountMarkup(state.gold, "purse")}</p>
      </div>
      ${shop.inn ? `
        <div class="shop-list">
          <div class="shop-row shop-row-rest">
            <span class="shop-item-copy"><strong>${shop.inn.name}</strong><small>Stay the night to restore HP and MP.</small></span>
            <span class="shop-owned">${shop.inn.cost ? shopGoldAmountMarkup(shop.inn.cost, "price") : "Free"}</span>
            <button data-shop-rest="${shopId}" type="button">Rest</button>
          </div>
        </div>
      ` : ""}
      <div class="shop-list">
        ${shop.items.map((offer) => {
          const itemText = shopItemText(offer.item);
          const owned = state.inventory[offer.item] || 0;
          const bought = state.shopPurchases[`${shopId}:${offer.item}`] || 0;
          const remaining = offer.stock ? Math.max(0, offer.stock - bought) : null;
          return `
            <div class="shop-row">
              <canvas class="shop-item-icon" width="58" height="58" data-shop-icon="${shopItemIconKey(offer.item)}" aria-hidden="true"></canvas>
              <span class="shop-item-copy"><strong>${offer.item}</strong><small>${itemText}</small></span>
              <span class="shop-owned">Owned ${owned}${remaining !== null ? ` | Stock ${remaining}` : ""}</span>
              <button data-shop-buy="${offer.item}" type="button" aria-label="Buy ${offer.item} for ${offer.cost} gold" ${remaining === 0 ? "disabled" : ""}>${remaining === 0 ? "Sold out" : shopGoldAmountMarkup(offer.cost, "price")}</button>
            </div>
          `;
        }).join("")}
      </div>
      ${(shop.services || []).length ? `
        <div class="menu-note shop-note"><strong>Permanent Services</strong><p>One-time roster upgrades and catch-up training.</p></div>
        <div class="shop-list">${shop.services.map((service) => `
          <div class="shop-row shop-row-rest">
            <span class="shop-item-copy"><strong>${service.name}</strong><small>${service.text}</small></span>
            <span class="shop-owned">${state.shopServices[service.id] ? "Completed" : shopGoldAmountMarkup(service.cost, "price")}</span>
            <button data-shop-service="${service.id}" type="button" ${state.shopServices[service.id] ? "disabled" : ""}>${state.shopServices[service.id] ? "Purchased" : "Buy service"}</button>
          </div>`).join("")}</div>
      ` : ""}
      <div class="menu-note shop-note"><strong>Sell</strong><p>Sell unequipped consumables and gear. Equipped copies and key items are protected.</p></div>
      <div class="shop-list">
        ${sellableShopItems().map((name) => `
          <div class="shop-row">
            <canvas class="shop-item-icon" width="58" height="58" data-shop-icon="${shopItemIconKey(name)}" aria-hidden="true"></canvas>
            <span class="shop-item-copy"><strong>${name}</strong><small>${shopItemText(name)}</small></span>
            <span class="shop-owned">Available ${unequippedInventoryCount(name)}</span>
            <button data-shop-sell="${name}" type="button">Sell ${shopSellValue(name)}g</button>
          </div>`).join("") || `<p class="quest-text">Nothing unequipped is available to sell.</p>`}
      </div>
    `;
    drawShopItemIcons();
    syncShopFocus();
    return true;
  }

  function renderInnPromptContent() {
    const inn = activeInnOffer;
    if (!inn) return false;
    const affordable = state.gold >= inn.cost;
    $("menu-content").innerHTML = `
      <div class="menu-note shop-note">
        <strong>${inn.name}</strong>
        <p>${inn.message || "Stay the night to restore the party's HP and MP?"}</p>
        <p class="shop-gold-total"><span>Gold</span>${shopGoldAmountMarkup(state.gold, "purse")}</p>
      </div>
      <div class="shop-list">
        <div class="shop-row shop-row-rest">
          <span class="shop-item-copy">
            <strong>${inn.name}</strong>
            <small>${inn.cost ? `A full rest costs ${inn.cost} gold.` : "A full rest is free."}</small>
          </span>
          <span class="shop-owned">${inn.cost ? shopGoldAmountMarkup(inn.cost, "price") : "Free"}</span>
          <span class="inn-actions">
            <button data-inn-stay type="button" ${affordable ? "" : "disabled"}>Stay</button>
            <button data-inn-cancel type="button">Leave</button>
          </span>
        </div>
      </div>
    `;
    syncInnFocus();
    return true;
  }

  function shopGoldAmountMarkup(amount, variant = "price") {
    const value = Math.max(0, Number.parseInt(amount, 10) || 0);
    const unit = variant === "purse" ? "gold" : "g";
    return `
      <span class="shop-gold-amount shop-gold-amount-${variant}" aria-label="${value} gold">
        <canvas class="shop-gold-icon" width="28" height="28" data-shop-icon="item:gold" aria-hidden="true"></canvas>
        <span>${value}</span><span aria-hidden="true">${unit}</span>
      </span>
    `;
  }

  function shopItemIconKey(itemName) {
    return inventoryItemImageKey(itemName);
  }

  function shopItemText(itemName) {
    const battleItem = Object.values(battleItemCatalog).find((entry) => entry.inventory === itemName);
    if (battleItem?.text) return battleItem.text;
    const slot = equipmentSlotForItem(itemName);
    if (slot) return `${equipmentEffectText(itemName, slot)} ${catalogForSlot(slot)[itemName]?.text || ""}`;
    const guideEntry = guideInventoryEntry(itemName);
    if (guideEntry?.text) return guideEntry.text;
    return weaponCatalog[itemName]?.text
      || armorCatalog[itemName]?.text
      || accessoryCatalog[itemName]?.text
      || "Useful RPG thing.";
  }

  function drawShopItemIcons() {
    document.querySelectorAll("canvas[data-shop-icon]").forEach((canvas) => {
      drawInventoryItemCanvas(canvas, canvas.dataset.shopIcon || "item:gold");
    });
  }

  function renderMenuPartyRows() {
    const activeIds = new Set(normalizeActiveParty());
    const reserves = reservePartyMembers();
    return state.party.map((member) => {
      const dead = member.hp <= 0;
      const active = activeIds.has(member.id);
      const hpPct = Math.max(0, Math.round((member.hp / member.maxHp) * 100));
      const mpPct = member.maxMp ? Math.max(0, Math.round((member.mp / member.maxMp) * 100)) : 0;
      const weapon = equippedWeapon(member);
      const armor = equippedArmor(member);
      const accessory = equippedAccessory(member);
      const switchOptions = reserves.map((reserve) => `<option value="${reserve.id}">${reserve.name}${reserve.hp <= 0 ? " (KO)" : ""}</option>`).join("");
      const skillDetails = availableSkills(member).map((skill) => `<li><strong>${skill.name}</strong> — ${skillEstimateText(member, skill)}; ${skillMpCost(member, skill)} MP. ${skill.text}</li>`).join("");
      return `
        <div class="menu-party-row ${active ? "is-active-party" : "is-reserve"}">
          <div>
            <strong>${member.name}</strong>
            <small>${active ? "Active" : "Reserve"} | ${dead ? "KO" : `Lv ${member.level}`} ${member.role}</small>
          </div>
          <div class="menu-vitals">
            <span>HP ${Math.max(0, member.hp)}/${member.maxHp}</span>
            <div class="mini-meter hp-meter" role="progressbar" aria-label="${member.name} health" aria-valuemin="0" aria-valuemax="${member.maxHp}" aria-valuenow="${Math.max(0, member.hp)}"><span style="width:${hpPct}%"></span></div>
            <span>MP ${member.mp}/${member.maxMp}</span>
            <div class="mini-meter mp-meter" role="progressbar" aria-label="${member.name} magic" aria-valuemin="0" aria-valuemax="${member.maxMp}" aria-valuenow="${Math.max(0, member.mp)}"><span style="width:${mpPct}%"></span></div>
          </div>
          <div class="menu-party-controls">
            <em>${weapon.name}${weapon.bonus ? ` +${weapon.bonus}` : ""}</em>
            <em>${armor.name}${armor.defBonus ? ` +${armor.defBonus} DEF` : ""}</em>
            <em>${accessory.name}</em>
            ${active && reserves.length ? `
              <label>
                <span>Switch</span>
                <select data-party-switch-select="${member.id}" aria-label="Switch ${member.name} with reserve">${switchOptions}</select>
              </label>
              <button data-party-switch="${member.id}" type="button">Apply</button>
            ` : ""}
          </div>
          <div class="menu-skill-info"><strong>Skills & estimates</strong><ul>${skillDetails || "<li>No learned skills yet.</li>"}</ul></div>
        </div>
      `;
    }).join("");
  }

  function renderEquipmentRows() {
    const gearButton = (member, slot, item, current) => {
      const currentItem = catalogForSlot(slot)[current] || {};
      const score = (entry) => entry.bonus || entry.defBonus || entry.mpCostReduction || 0;
      const delta = score(item) - score(currentItem);
      return `
        <button data-equip-member="${member.id}" data-equip-slot="${slot}" data-equip-name="${item.name}" type="button" ${item.name === current ? "disabled" : ""}>
          <strong>${item.name}</strong>
          <small>${equipmentEffectText(item.name, slot)} ${item.name === current ? "Currently equipped." : `Change: ${delta >= 0 ? "+" : ""}${delta} primary stat.`}</small>
        </button>
      `;
    };
    return state.party.map((member) => {
      const currentWeapon = equippedWeaponName(member);
      const currentArmor = equippedArmorName(member);
      const currentAccessory = equippedAccessoryName(member);
      const weapons = weaponsForMember(member);
      const armor = armorForMember(member);
      const accessories = accessoriesForMember(member);
      return `
        <div class="equipment-row">
          <header>
            <strong>${member.name}</strong>
            <span>${currentWeapon} | ${currentArmor} | ${currentAccessory}</span>
          </header>
          <div class="equipment-visuals" aria-label="${member.name} equipped gear">
            <figure>
              <canvas class="equipment-icon" width="70" height="70" data-inventory-icon="${equipmentItemImageKey("weapon", currentWeapon)}" aria-hidden="true"></canvas>
              <figcaption>${currentWeapon}</figcaption>
            </figure>
            <figure>
              <canvas class="equipment-icon" width="70" height="70" data-inventory-icon="${equipmentItemImageKey("armor", currentArmor)}" aria-hidden="true"></canvas>
              <figcaption>${currentArmor}</figcaption>
            </figure>
            <figure>
              <canvas class="equipment-icon" width="70" height="70" data-inventory-icon="${equipmentItemImageKey("accessory", currentAccessory)}" aria-hidden="true"></canvas>
              <figcaption>${currentAccessory}</figcaption>
            </figure>
          </div>
          <div class="equipment-slot">
            <b>Weapons</b>
            <div class="equipment-buttons">${weapons.map((weapon) => gearButton(member, "weapon", weapon, currentWeapon)).join("")}</div>
          </div>
          <div class="equipment-slot">
            <b>Armor</b>
            <div class="equipment-buttons">${armor.map((piece) => gearButton(member, "armor", piece, currentArmor)).join("")}</div>
          </div>
          <div class="equipment-slot">
            <b>Accessories</b>
            <div class="equipment-buttons">${accessories.map((accessory) => gearButton(member, "accessory", accessory, currentAccessory)).join("")}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderFieldItemRows() {
    const fieldItems = Object.entries(battleItemCatalog)
      .filter(([, item]) => ["heal", "mp", "revive"].includes(item.type))
      .map(([id, item]) => ({ id, ...item }));
    return state.party.map((member) => `
      <div class="field-item-row">
        <strong>${member.name}</strong>
        <div>
          ${fieldItems.map((item) => {
            const count = state.inventory[item.inventory] || 0;
            const unavailable = item.type === "mp"
              ? member.mp >= member.maxMp || !member.maxMp
              : item.type === "revive"
                ? member.hp > 0
                : member.hp <= 0 || member.hp >= member.maxHp;
            return `
              <button data-field-item="${item.id}" data-field-target="${member.id}" type="button" ${count <= 0 || unavailable ? "disabled" : ""}>
                <canvas class="field-item-icon" width="24" height="24" data-inventory-icon="item:${item.id}" aria-hidden="true"></canvas>
                <span>${item.name} x${count}</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderEncounterDialPanel() {
    if (!hasEncounterDial()) return "";
    const interval = encounterDialInterval();
    const stepValue = interval && interval > 0 ? interval : ENCOUNTER_DIAL_DEFAULT_STEPS;
    return `
      <section class="menu-note encounter-dial-note">
        <div class="menu-section-head">
          <strong>Encounter Dial</strong>
          <span>${encounterDialStatus()}</span>
        </div>
        <div class="encounter-dial-controls">
          <button class="${interval === null ? "is-active" : ""}" data-encounter-dial-mode="normal" type="button" aria-pressed="${interval === null}">Normal</button>
          <button class="${interval === 0 ? "is-active" : ""}" data-encounter-dial-mode="off" type="button" aria-pressed="${interval === 0}">Off</button>
          <label for="encounter-dial-steps">
            <span>Every</span>
            <input id="encounter-dial-steps" type="number" min="${ENCOUNTER_DIAL_MIN_STEPS}" max="${ENCOUNTER_DIAL_MAX_STEPS}" step="1" value="${stepValue}">
            <span>steps</span>
          </label>
          <button data-encounter-dial-apply type="button">Apply</button>
        </div>
      </section>
    `;
  }

  function renderZoomTravelPanel() {
    const spellMember = zoomSpellMember();
    const caster = zoomSpellCaster();
    const skill = spellMember ? zoomSpellFor(spellMember) : null;
    const spellCost = skill && spellMember ? skillMpCost(spellMember, skill) : 0;
    const itemCount = state.inventory[zoomItemName] || 0;
    if (!spellMember && itemCount <= 0) return "";
    const destinations = knownZoomDestinations();
    const currentWorld = worldAreaId(state.areaId);
    return `
      <section class="menu-note">
        <div class="menu-section-head">
          <strong>Zoom Travel</strong>
          <span>${spellMember ? `${spellMember.name} ${spellCost} MP` : "No caster"} | ${zoomItemName} x${itemCount}</span>
        </div>
        <div class="zoom-travel-list">
          ${destinations.map((destination) => {
            const current = currentWorld === destination.id;
            return `
              <div class="zoom-travel-row">
                <span><strong>${destination.label}</strong><small>${current ? "Current region" : "Marked"}</small></span>
                <button data-zoom-spell="${destination.id}" type="button" ${!caster || current ? "disabled" : ""}>Zoom</button>
                <button data-zoom-item="${destination.id}" type="button" ${itemCount <= 0 || current ? "disabled" : ""}>Shell</button>
              </div>
            `;
          }).join("") || `<p class="quest-text">No destinations marked yet.</p>`}
        </div>
      </section>
    `;
  }

  function renderSettingsPanel() {
    const currentLevel = jokeLevel();
    return `
      <div class="menu-tab-panel">
        <section class="menu-note settings-note">
          <div class="menu-section-head">
            <strong>Settings</strong>
            <span>Saved per game</span>
          </div>
          <div class="settings-row">
            <div>
              <strong>Story Tone</strong>
              <small>${jokeLevelDescriptions[currentLevel]}</small>
            </div>
            <div class="setting-choice-controls" role="group" aria-label="Story tone">
              ${jokeLevels.map((level) => `
                <button class="${currentLevel === level ? "is-active" : ""}" data-joke-level="${level}" type="button" aria-pressed="${currentLevel === level ? "true" : "false"}">
                  ${jokeLevelLabels[level]}
                </button>
              `).join("")}
            </div>
          </div>
          <div class="settings-row">
            <div><strong>Movement Speed</strong><small>How quickly each field step resolves.</small></div>
            <div class="setting-choice-controls" role="group" aria-label="Movement speed">
              ${[[100, "Fast"], [140, "Normal"], [190, "Relaxed"]].map(([ms, label]) => `<button data-movement-ms="${ms}" type="button" class="${state.settings.movementMs === ms ? "is-active" : ""}">${label}</button>`).join("")}
            </div>
          </div>
          <div class="settings-row">
            <div><strong>Battle Speed</strong><small>Animation and message pacing. Current: ${state.settings.battleSpeed.toFixed(1)}x.</small></div>
            <div class="setting-choice-controls" role="group" aria-label="Battle speed">
              ${[[1, "Cinematic"], [1.4, "Normal"], [2, "Quick"]].map(([speed, label]) => `<button data-battle-speed-setting="${speed}" type="button" class="${state.settings.battleSpeed === speed ? "is-active" : ""}">${label}</button>`).join("")}
            </div>
          </div>
          <div class="settings-row">
            <div><strong>Fast Results</strong><small>Approximately 3–4× effective sequencing speed for routine fights.</small></div>
            <div class="setting-choice-controls"><button data-fast-battle type="button" class="${fastBattleEnabled() ? "is-active" : ""}" aria-pressed="${fastBattleEnabled()}">${fastBattleEnabled() ? "On" : "Off"}</button></div>
          </div>
          <div class="settings-row">
            <div><strong>Music Volume</strong><small>Music level is saved with this game.</small></div>
            <label class="settings-slider">${Math.round(state.settings.musicVolume * 100)}%<input data-setting-range="musicVolume" type="range" min="0" max="1" step="0.05" value="${state.settings.musicVolume}"></label>
          </div>
          <div class="settings-row">
            <div><strong>SFX Volume</strong><small>Battle, menu, and movement sound effects.</small></div>
            <label class="settings-slider">${state.settings.sfxMuted ? "Muted" : `${Math.round(state.settings.sfxVolume * 100)}%`}<input data-setting-range="sfxVolume" type="range" min="0" max="1" step="0.05" value="${state.settings.sfxVolume}" ${state.settings.sfxMuted ? "disabled" : ""}></label>
            <button data-setting-toggle="sfxMuted" type="button" class="${state.settings.sfxMuted ? "is-active" : ""}">${state.settings.sfxMuted ? "Unmute SFX" : "Mute SFX"}</button>
          </div>
          <div class="settings-row">
            <div><strong>Reduced Motion</strong><small>Stops continuous scenery, shaking, flashing, and automatic credit scrolling. Your system preference is also respected.</small></div>
            <button data-setting-toggle="reducedEffects" type="button" class="${state.settings.reducedEffects ? "is-active" : ""}" aria-pressed="${state.settings.reducedEffects}">${state.settings.reducedEffects ? "On" : "Off"}</button>
          </div>
          <div class="settings-row">
            <div><strong>Text Speed</strong><small>How quickly dialogue text appears.</small></div>
            <div class="setting-choice-controls" role="group" aria-label="Text speed">
              ${[["instant", "Instant"], ["standard", "Standard"], ["relaxed", "Relaxed"]].map(([value, label]) => `<button data-text-speed="${value}" type="button" class="${state.settings.textSpeed === value ? "is-active" : ""}">${label}</button>`).join("")}
            </div>
          </div>
          <section class="settings-help">
            <strong>Control Help</strong>
            <ul>
              <li><b>Move:</b> Arrow keys, WASD, or the mobile compass.</li>
              <li><b>Interact:</b> Walk into an NPC, chest, door, or marker.</li>
              <li><b>Dialogue:</b> Enter, Space, movement, or the visible Next button.</li>
              <li><b>Close or Menu:</b> Escape closes the top optional overlay; from the field it opens the Menu.</li>
              <li><b>Focus mode:</b> F toggles the distraction-free full-screen view.</li>
              <li><b>Battle:</b> Queue one action per active character, choose targets, then Execute Round. Undo changes a queued action.</li>
              <li><b>Party:</b> Four characters can be active; reserves still gain catch-up XP and can be swapped from Characters.</li>
              <li><b>Save:</b> Travel, story progress, settings, and purchases autosave. Save creates an immediate checkpoint.</li>
            </ul>
            <button data-setting-toggle="coaching" type="button" class="${state.coaching.enabled ? "is-active" : ""}">${state.coaching.enabled ? "First-use tips on" : "First-use tips off"}</button>
          </section>
          <details class="settings-advanced">
            <summary>Advanced & File Tools</summary>
            <div class="setting-choice-controls">
              <button data-advanced-action="export" type="button">Export Save</button>
              <button data-advanced-action="import" type="button">Import Save</button>
              <button data-advanced-action="creator" type="button">Creator Tools</button>
              <button data-advanced-action="restart" type="button">Restart Game</button>
            </div>
          </details>
        </section>
      </div>
    `;
  }

  function openCreator() {
    const openedFromMenu = visibleElement("menu-modal");
    if (activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || (!openedFromMenu && modalOpen())) return false;
    if (state?.saveSlot === "adventure") saveLocal();
    if (!state || state.saveSlot !== "creator") {
      const loaded = loadLocal(CREATOR_SAVE_KEY);
      if (loaded) {
        state = loaded;
        initializeLoadedGame();
        creatorMessage = `Creator slot resumed from ${area().name}.`;
      } else {
        if (!startNewGame({ creator: true })) return;
        creatorMessage = "Creator game started in its own slot. Intro dialogue is skipped so you can begin testing immediately.";
      }
    } else {
      creatorMessage = "Creator tools are editing the separate Creator slot; the adventure slot is unchanged.";
    }
    restoreCreatorVitals();
    renderCreatorContent();
    if (openedFromMenu) closeMenu(false);
    showManagedDialog("creator-modal", "#close-creator");
    if (openedFromMenu) dialogReturnFocus = $("menu-btn");
    render();
    return true;
  }

  function closeCreator() {
    hideManagedDialog("creator-modal");
  }

  function returnToAdventure() {
    if (!state || state.saveSlot !== "creator") {
      closeCreator();
      return false;
    }
    const adventure = loadLocal(SAVE_KEY);
    if (!adventure) {
      creatorMessage = "No adventure save exists yet. Start a New Game from the title screen first.";
      renderCreatorContent();
      return false;
    }
    saveLocal();
    state = adventure;
    creatorMessage = "";
    initializeLoadedGame("Adventure slot loaded. Creator progress remains in its separate slot.");
    return true;
  }

  function renderCreatorContent() {
    const content = $("creator-content");
    if (!content) return;
    const cfg = state?.creator || creatorState();
    const toggle = (key, label, help) => `
      <label class="creator-toggle">
        <input type="checkbox" data-creator-toggle="${key}" ${cfg[key] ? "checked" : ""}>
        <span><strong>${label}</strong><small>${help}</small></span>
      </label>
    `;
    const areaOptions = areaOrder.map((id) => `<option value="${id}" ${state?.areaId === id ? "selected" : ""}>${areas[id].name}</option>`).join("");
    const itemOptions = [...knownInventoryNames()].sort().map((name) => `<option value="${name}">${name}</option>`).join("");
    const creatorEnemyEntries = activeEnemyIds
      ? [...activeEnemyIds].filter((id) => enemies[id]).map((id) => [id, enemies[id]])
      : Object.entries(enemies);
    const enemyOptions = creatorEnemyEntries.map(([id, enemy]) => `<option value="${id}" ${areas[state?.areaId]?.encounters?.includes(id) ? "selected" : ""}>${enemy.name}${enemy.boss ? " (Boss)" : ""}</option>`).join("");
    const currentRate = areas[state?.areaId]?.encounterRate || 0;
    const encounterLine = state ? `${areas[state.areaId].name} encounter rate: ${Math.round(currentRate * ENCOUNTER_RATE_MULTIPLIER * 1000) / 10}% per step before accessories.` : "";
    content.innerHTML = `
      <div class="creator-status">
        <strong>${cfg.enabled ? "Creator Mode On" : "Creator Mode Off"}</strong>
        <span>${creatorMessage || encounterLine || "These tools are saved with browser and exported save files."}</span>
      </div>
      <div class="creator-grid">
        ${toggle("enabled", "Enable Creator Mode", "Master switch for the debug cheats below.")}
        ${toggle("noEnemies", "No Enemies", "Random fights never trigger; boss events auto-complete when touched.")}
        ${toggle("infiniteHp", "Infinite HP", "Party HP stays full and defeat is ignored.")}
        ${toggle("infiniteMp", "Infinite MP", "Skills stay available while testing.")}
        ${toggle("oneHitEnemies", "One-Hit Enemies", "Any damaging party action drops the target immediately.")}
        ${toggle("revealWorld", "Reveal World Map", "Shows every route and optional area on the world strip.")}
      </div>
      <div class="creator-tools">
        <button data-creator-action="returnAdventure" type="button" ${localStorage.getItem(SAVE_KEY) ? "" : "disabled"}>Return to Adventure</button>
        <button data-creator-action="grantGear" type="button">Grant All Gear</button>
        <button data-creator-action="recruitParty" type="button">Recruit Full Party</button>
        <button data-creator-action="maxParty" type="button">Max Party</button>
        <button data-creator-action="openGates" type="button">Open Story Gates</button>
        <button data-creator-action="healParty" type="button">Heal Party</button>
        <button data-creator-action="addGold" type="button">Add 999 Gold</button>
      </div>
      <div class="creator-row">
        <label for="creator-level-input">Party Level</label>
        <input id="creator-level-input" type="number" min="1" max="${SAVE_LIMITS.maxLevel}" value="${activePartyMaxLevel() || 1}">
        <span></span>
        <button data-creator-action="setLevel" type="button">Set</button>
      </div>
      <div class="creator-row">
        <label for="creator-gold-input">Gold</label>
        <input id="creator-gold-input" type="number" min="0" max="${SAVE_LIMITS.maxGold}" value="${state?.gold || 0}">
        <span></span>
        <button data-creator-action="setGold" type="button">Set</button>
      </div>
      <div class="creator-row">
        <label for="creator-item-select">Inventory</label>
        <select id="creator-item-select">${itemOptions}</select>
        <input id="creator-item-count" type="number" min="0" max="${SAVE_LIMITS.maxInventoryCount}" value="1" aria-label="Inventory count">
        <button data-creator-action="setItem" type="button">Set</button>
      </div>
      <div class="creator-row">
        <label for="creator-battle-select">Battle</label>
        <select id="creator-battle-select">${enemyOptions}</select>
        <span>${encounterLine}</span>
        <button data-creator-action="forceBattle" type="button">Start</button>
      </div>
      <div class="creator-row">
        <label for="creator-teleport-select">Teleport</label>
        <select id="creator-teleport-select">${areaOptions}</select>
        <label class="creator-fix-story" for="creator-teleport-fix">
          <input id="creator-teleport-fix" type="checkbox">
          <span>Fix Story</span>
        </label>
        <button data-creator-action="teleport" type="button">Go</button>
      </div>
    `;
  }

  function setCreatorMessage(message) {
    creatorMessage = message;
    renderCreatorContent();
  }

  function grantCreatorGear() {
    Object.entries(creatorGear).forEach(([name, count]) => {
      state.inventory[name] = Math.max(state.inventory[name] || 0, count);
    });
    state.gold = Math.max(state.gold, 999);
    setCreatorMessage("All guide gear, key spells, sidequest rewards, potions, and 999 gold are now in inventory.");
  }

  function recruitCreatorParty(maxed = false) {
    const ids = ["tarthur", "derlin", "dalin", "yan", "yvonne", "valena"];
    state.party = ids.map((id) => cloneParty(id));
    state.activePartyIds = ids.slice(0, ACTIVE_PARTY_LIMIT);
    if (maxed) {
      state.party.forEach((member) => {
        member.level = 30;
        member.maxHp += 120;
        member.hp = member.maxHp;
        member.maxMp += 80;
        member.mp = member.maxMp;
        member.atk += 36;
        member.def += 24;
        member.xp = 0;
      });
    }
    restoreCreatorVitals();
    setCreatorMessage(maxed ? "Full party recruited and maxed for late-game testing." : "Full party recruited.");
  }

  function openCreatorStoryGates() {
    creatorRouteFlags.forEach((name) => flag(name));
    ["derlin", "dalin", "yan", "yvonne", "valena"].forEach(addParty);
    state.completedEvents.visit_krendon = true;
    state.completedEvents.visit_rathskeller = true;
    setCreatorMessage("Main route flags are open. Story exits should no longer block travel.");
  }

  function setCreatorItemMinimum(name, count = 1) {
    state.inventory[name] = Math.max(state.inventory[name] || 0, count);
  }

  function creatorNumberInput(id, min, max, fallback) {
    return numberInRange($(id)?.value, min, max, fallback);
  }

  function creatorSetPartyLevel() {
    const level = creatorNumberInput("creator-level-input", 1, SAVE_LIMITS.maxLevel, activePartyMaxLevel() || 1);
    state.party.forEach((member) => {
      const template = partyTemplates[member.id] || member;
      const delta = level - (template.level || 1);
      member.level = level;
      member.maxHp = clamp((template.maxHp || member.maxHp) + Math.max(0, delta) * 5, 1, SAVE_LIMITS.maxHpMp);
      member.maxMp = clamp((template.maxMp || 0) + ((template.maxMp || 0) > 0 ? Math.max(0, delta) * 2 : 0), 0, SAVE_LIMITS.maxHpMp);
      member.atk = clamp((template.atk || member.atk) + Math.max(0, delta) * 2, 0, SAVE_LIMITS.maxStat);
      member.def = clamp((template.def || member.def) + Math.max(0, delta), 0, SAVE_LIMITS.maxStat);
      member.hp = member.maxHp;
      member.mp = member.maxMp;
      member.xp = 0;
    });
    normalizeEquipment();
    setCreatorMessage(`Party set to level ${level}.`);
  }

  function creatorSetGold() {
    state.gold = creatorNumberInput("creator-gold-input", 0, SAVE_LIMITS.maxGold, state.gold);
    setCreatorMessage(`Gold set to ${state.gold}.`);
  }

  function creatorSetItem() {
    const name = $("creator-item-select")?.value;
    if (!name || !knownInventoryNames().has(name)) return;
    const count = creatorNumberInput("creator-item-count", 0, SAVE_LIMITS.maxInventoryCount, state.inventory[name] || 0);
    if (count > 0) state.inventory[name] = count;
    else delete state.inventory[name];
    normalizeEquipment();
    setCreatorMessage(`${name} set to ${count}.`);
  }

  function creatorForceBattle() {
    const enemyId = $("creator-battle-select")?.value;
    if (!enemyId || !enemies[enemyId]) return;
    closeCreator();
    startBattle(enemyId);
  }

  function applyCreatorStoryFix(areaId) {
    const targetIndex = areaOrder.indexOf(areaId);
    if (targetIndex < 0) return "";
    const milestones = [
      {
        at: "krendon",
        flags: ["dreamDarhynDefeated", "waterSpellDream"],
        party: ["derlin"],
        items: { "Water Orb Spell": 1 },
        events: ["dream_darhyn", "water_orb", "wake_krendon"]
      },
      {
        at: "krendonRoad",
        flags: ["metZelin", "milkQuest", "milkedBetsy"],
        party: ["derlin"],
        items: { "Honest Milk": 1 },
        events: ["zelin", "betsy"]
      },
      {
        at: "hawkSwitchback",
        flags: ["switchbackSurveyed"],
        party: ["dalin"],
        events: ["dalin_join", "hawk_switchback_view"]
      },
      {
        at: "grassland",
        flags: ["tustorRaised"],
        party: ["derlin", "dalin"],
        events: ["tustor_grave"]
      },
      {
        at: "marhynCastle",
        flags: ["capturedByLithar"],
        removeParty: ["dalin"],
        events: ["lithar_ambush", "marhyn_intro"]
      },
      {
        at: "forest",
        flags: ["yanFreed"],
        party: ["derlin", "yanOld"],
        events: ["yan_escape", "free_derlin"]
      },
      {
        at: "deepForest",
        flags: ["yanVanished"],
        removeParty: ["yanOld", "yan"],
        party: ["derlin"],
        events: ["forest_yan_missing"]
      },
      {
        at: "freeton",
        flags: ["runeSword"],
        party: ["derlin"],
        items: { "Rune Sword": 1 },
        events: ["eagle_rune_sword"]
      },
      {
        at: "corizazLair",
        flags: ["runeSword", "heardCorizaz", "corizazLairRevealed"],
        party: ["derlin"],
        items: { "Rune Sword": 1 },
        events: ["eagle_rune_sword", "freeton_mayor", "freeton_townsgirl"]
      },
      {
        at: "kingsHighway",
        flags: ["heardCorizaz", "corizazLairRevealed", "lightSword"],
        party: ["derlin"],
        items: { "Light Sword": 1 },
        events: ["freeton_mayor", "freeton_townsgirl", "corizaz_sleeping"]
      },
      {
        at: "tealsburg",
        flags: ["yanReturned", "escapedFear"],
        party: ["derlin", "yan"],
        events: ["yan_returns", "fear_creature"]
      },
      {
        at: "northernPath",
        flags: ["metKing", "yvonneBumped", "yvonneDecoyChased", "yvonneJoined"],
        party: ["derlin", "yan", "yvonne"],
        events: ["king_garkin", "yvonne_bump", "yvonne_decoy", "yvette_reveal"]
      },
      {
        at: "breshen",
        flags: ["reachedBreshenPath"],
        party: ["derlin", "yan", "yvonne"],
        events: ["northern_scout"]
      },
      {
        at: "savannah",
        flags: ["valenaJoined", "hanoDefeated"],
        party: ["derlin", "dalin", "yan", "yvonne", "valena"],
        events: ["valena", "hano"]
      },
      {
        at: "rathskellerApproach",
        flags: ["readyForRathskeller"],
        party: ["derlin", "dalin", "yan", "yvonne", "valena"],
        events: ["savannah_camp"]
      }
    ];

    milestones.forEach((milestone) => {
      if (areaOrder.indexOf(milestone.at) > targetIndex) return;
      (milestone.flags || []).forEach(flag);
      (milestone.removeParty || []).forEach(removeParty);
      (milestone.party || []).forEach(addParty);
      Object.entries(milestone.items || {}).forEach(([name, count]) => setCreatorItemMinimum(name, count));
      (milestone.events || []).forEach((id) => {
        state.completedEvents[id] = true;
      });
    });
    normalizeEquipment();
    return ` Story fixed through ${areas[areaId].name}.`;
  }

  function teleportCreator() {
    const id = $("creator-teleport-select")?.value;
    if (!id || !areas[id]) return;
    const storyMessage = $("creator-teleport-fix")?.checked ? applyCreatorStoryFix(id) : "";
    state.completedEvents[`visit_${id}`] = true;
    travelTo(id);
    setCreatorMessage(`Teleported to ${areas[id].name}.${storyMessage}`);
  }

  function handleCreatorAction(action) {
    if (!state) return;
    if (action === "returnAdventure") {
      returnToAdventure();
      return;
    }
    state.creator = creatorState(state.creator || {});
    state.creator.enabled = true;
    if (action === "grantGear") grantCreatorGear();
    else if (action === "recruitParty") recruitCreatorParty(false);
    else if (action === "maxParty") recruitCreatorParty(true);
    else if (action === "openGates") openCreatorStoryGates();
    else if (action === "setLevel") creatorSetPartyLevel();
    else if (action === "setGold") creatorSetGold();
    else if (action === "setItem") creatorSetItem();
    else if (action === "forceBattle") creatorForceBattle();
    else if (action === "healParty") {
      healParty(1);
      setCreatorMessage("Party healed.");
    } else if (action === "addGold") {
      state.gold += 999;
      setCreatorMessage("Added 999 gold.");
    } else if (action === "teleport") {
      teleportCreator();
    }
    if (action !== "forceBattle") {
      render();
      saveLocal();
    }
  }

  function renderMenuTabButtons() {
    return `
      <div class="menu-tabs-wrap">
        <div class="menu-tabs" role="tablist" aria-label="Menu sections. Scroll horizontally for more tabs.">
          ${menuTabs.map(([id, label]) => `
            <button id="menu-tab-${id}" class="menu-tab ${activeMenuTab === id ? "is-active" : ""}" data-menu-tab="${id}" type="button" role="tab" aria-selected="${activeMenuTab === id ? "true" : "false"}" aria-controls="menu-panel-${id}" tabindex="${activeMenuTab === id ? "0" : "-1"}">
              ${label}
            </button>
          `).join("")}
        </div>
        <span class="menu-tabs-scroll-hint" aria-hidden="true">Swipe tabs →</span>
      </div>
    `;
  }

  function syncMenuTabOverflow() {
    const tabs = $("menu-content")?.querySelector(".menu-tabs");
    const hint = $("menu-content")?.querySelector(".menu-tabs-scroll-hint");
    const activeTab = $(`menu-tab-${activeMenuTab}`);
    if (!tabs || !hint) return;
    const updateHint = () => {
      const overflows = tabs.scrollWidth > tabs.clientWidth + 2;
      const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 3;
      hint.classList.toggle("is-hidden", !overflows || atEnd);
    };
    tabs.addEventListener("scroll", updateHint, { passive: true });
    requestAnimationFrame(() => {
      activeTab?.scrollIntoView({ block: "nearest", inline: "center" });
      updateHint();
    });
  }

  function renderMenuInventoryCards() {
    const entries = Object.entries(state.inventory).filter(([name, count]) => count > 0 && !regularInventoryHiddenItems.has(name));
    if (!entries.length) return `<p class="quest-text">Empty, which is bold for an RPG.</p>`;
    const categoryOrder = ["Consumables", "Key Items", "Weapons", "Armor", "Accessories", "Relics"];
    const groups = Object.groupBy
      ? Object.groupBy(entries, ([name]) => inventoryCategory(name))
      : entries.reduce((output, entry) => {
          (output[inventoryCategory(entry[0])] ||= []).push(entry);
          return output;
        }, {});
    return categoryOrder.filter((category) => groups[category]?.length).map((category) => `
      <section class="inventory-category">
        <div class="menu-section-head"><strong>${category}</strong><span>${groups[category].length} type${groups[category].length === 1 ? "" : "s"}</span></div>
        <div class="menu-inventory-grid">
        ${groups[category].map(([name, count]) => `
          <article class="menu-inventory-card">
            <canvas class="menu-inventory-icon" width="74" height="74" data-inventory-icon="${inventoryItemImageKey(name)}" aria-hidden="true"></canvas>
            <div>
              <strong>${name}</strong>
              <small>${inventoryItemText(name)}</small>
            </div>
            <span>x${count}</span>
          </article>
        `).join("")}
        </div>
      </section>
    `).join("");
  }

  function inventoryCategory(name) {
    if (weaponCatalog[name]) return "Weapons";
    if (armorCatalog[name]) return "Armor";
    if (accessoryCatalog[name] && !accessoryCatalog[name].starter) return "Accessories";
    if (["VS Relic", "Encounter Dial", "Marsh Joke Book", "Glass Flute", "Befuddling Bell"].includes(name)) return "Relics";
    const battleItem = Object.values(battleItemCatalog).find((item) => item.inventory === name);
    if (battleItem?.consume || name === "Zoom Shell") return "Consumables";
    return "Key Items";
  }

  function sideQuestStatusLabel(status) {
    return { discovered: "Discovered", active: "Active", blocked: "Blocked", completed: "Completed", undiscovered: "Undiscovered" }[status] || status;
  }

  function renderSideQuestJournal() {
    syncQuestJournal();
    const trackedId = state.questJournal.trackedId;
    const visible = endingSideQuests.filter((quest) => questIsDiscovered(quest));
    const counts = ["active", "blocked", "discovered", "completed"].map((status) => {
      const count = visible.filter((quest) => sideQuestStatus(quest) === status).length;
      return `<span><strong>${count}</strong> ${sideQuestStatusLabel(status)}</span>`;
    }).join("");
    if (!visible.length) return `<div class="quest-journal-summary">${counts}</div><p>No sidequest leads discovered yet. Explore named side roads and speak with local residents.</p>`;
    const order = { active: 0, blocked: 1, discovered: 2, completed: 3 };
    const cards = [...visible].sort((a, b) => order[sideQuestStatus(a)] - order[sideQuestStatus(b)]).map((quest) => {
      const status = sideQuestStatus(quest);
      const tracked = trackedId === quest.id;
      return `
        <article class="quest-journal-card is-${status}${tracked ? " is-tracked" : ""}">
          <header><strong>${quest.name}</strong><span>${sideQuestStatusLabel(status)}</span></header>
          <p>${quest.summary}</p>
          <small><strong>Location:</strong> ${quest.hint}</small>
          <small><strong>Next:</strong> ${sideQuestGuidance(quest)}</small>
          ${status !== "completed" ? `<button data-track-quest="${tracked ? "" : quest.id}" type="button" ${tracked ? "class=\"is-active\"" : ""}>${tracked ? "Stop Tracking" : "Track Quest"}</button>` : ""}
        </article>
      `;
    }).join("");
    return `<div class="quest-journal-summary">${counts}</div><div class="quest-journal-list">${cards}</div>`;
  }

  function renderMenuContent() {
    if (!state || !$("menu-content")) return;
    loadArtAssets([
      "guideIcons",
      ...(activeMenuTab === "map" ? ["daranorMap"] : []),
      ...(state.inventory["VS Relic"] ? ["vsLogo"] : [])
    ]);
    if (activeInnOffer && renderInnPromptContent()) return;
    if (activeShopId && renderShopContent(activeShopId)) return;
    if (!menuTabs.some(([id]) => id === activeMenuTab)) activeMenuTab = "inventory";
    const elapsedMin = Math.max(1, Math.round(currentPlayTimeMs() / 60000));
    const unlocked = areaOrder.map((id) => {
      const known = isAreaKnown(id);
      const optional = optionalAreaIds.has(id) ? " *" : "";
      return `<span>${known ? areas[id].name + optional : "???"}</span>`;
    }).join("");
    const statusLine = `<strong>${area().name}</strong> | ${elapsedMin} min | ${state.steps} steps | ${state.gold} gold`;
    const panels = {
      inventory: `
        <div class="menu-tab-panel">
          <section class="menu-note menu-status-note">
            <div class="menu-section-head">
              <strong>Inventory</strong>
              <span>${state.gold} gold</span>
            </div>
            ${renderMenuInventoryCards()}
          </section>
          ${renderEncounterDialPanel()}
          ${renderZoomTravelPanel()}
          <section class="menu-note">
            <div class="menu-section-head">
              <strong>Use Items</strong>
              <span>Field recovery</span>
            </div>
            <div class="field-item-list">${renderFieldItemRows()}</div>
          </section>
        </div>
      `,
      characters: `
        <div class="menu-tab-panel">
          <section class="menu-note menu-status-note">
            <div class="menu-section-head">
              <strong>Characters</strong>
              <span>${activePartyMembers().length}/${ACTIVE_PARTY_LIMIT} active</span>
            </div>
            <p>Only the active four appear on the field and enter battle. Switch reserves in before a fight or during battle when available.</p>
          </section>
          <section class="menu-note">
            <strong>Party Lineup</strong>
            <div class="menu-party-list">${renderMenuPartyRows()}</div>
          </section>
        </div>
      `,
      equipment: `
        <div class="menu-tab-panel">
          <section class="menu-note">
            <div class="menu-section-head">
              <strong>Equipment</strong>
              <span>Weapons | Armor | Accessories</span>
            </div>
            <div class="equipment-list">${renderEquipmentRows()}</div>
          </section>
        </div>
      `,
      quest: `
        <div class="menu-tab-panel menu-tab-panel-split">
          <section class="menu-note">
            <strong>Current quest</strong>
            <p>${questText()}</p>
            <p>${statusLine}</p>
            <p><strong>Save:</strong> ${lastSaveMessage || "No browser save this session yet."}</p>
            ${state.flags.gameComplete ? `<button data-replay-ending type="button">Replay Ending & Credits</button>` : ""}
            ${state.creator?.enabled ? `<p><strong>Creator mode:</strong> ${Object.entries(state.creator).filter(([key, value]) => key !== "enabled" && value).map(([key]) => key).join(", ") || "enabled"}</p>` : ""}
          </section>
          <section class="menu-note">
            <div class="menu-section-head"><strong>Sidequest Journal</strong><span>Select one objective to track</span></div>
            ${renderSideQuestJournal()}
          </section>
          ${state.inventory["VS Relic"] ? `<section class="menu-note vs-note"><strong>Valena's Secret relic found</strong><img src="${assets.vsLogo}" alt="Valena's Secret logo relic" width="119" height="120"></section>` : ""}
        </div>
      `,
      map: `
        <div class="menu-tab-panel">
          <section class="menu-note menu-map-note">
            <div class="menu-section-head">
              <strong>Maps</strong>
              <span>${statusLine}</span>
            </div>
            <canvas id="menu-world-canvas" class="menu-world-canvas" width="900" height="624" aria-label="World map"></canvas>
            <div class="unlock-grid">${unlocked}</div>
          </section>
        </div>
      `,
      settings: renderSettingsPanel()
    };
    $("menu-content").innerHTML = `
      ${menuMessage ? `<div class="menu-note menu-message" role="status" aria-live="polite"><strong>Status:</strong> ${menuMessage}</div>` : ""}
      ${renderMenuTabButtons()}
      <div id="menu-panel-${activeMenuTab}" role="tabpanel" aria-labelledby="menu-tab-${activeMenuTab}" tabindex="0">${panels[activeMenuTab]}</div>
    `;
    drawInventoryIcons($("menu-content"));
    syncMenuTabOverflow();
    if (activeMenuTab === "map") requestAnimationFrame(() => renderWorldMap("menu-world-canvas"));
  }

  function openGuide() {
    const openedFromMenu = visibleElement("menu-modal");
    if (activeBattle || cutsceneActive || transitionPending() || dialogueVisible() || (!openedFromMenu && modalOpen())) return false;
    if (openedFromMenu) closeMenu(false);
    if (!guideData[activeGuideSection]) activeGuideSection = defaultGuideSection();
    loadGuideSectionAssets(activeGuideSection);
    renderGuideContent();
    showManagedDialog("guide-modal", "#close-guide");
    if (openedFromMenu) dialogReturnFocus = $("menu-btn");
    markRenderDirty("guide");
    renderVisibleSurfaces();
    return true;
  }

  function closeGuide() {
    hideManagedDialog("guide-modal");
  }

  function renderGuideContent() {
    const content = $("guide-content");
    if (!content) return;
    if (!guideData[activeGuideSection]) activeGuideSection = defaultGuideSection();
    const entries = guideData[activeGuideSection] || [];
    content.innerHTML = `
      ${renderGuideSectionTabs()}
      <section id="guide-panel-${activeGuideSection}" class="guide-section guide-section-${activeGuideSection}" role="tabpanel" aria-labelledby="guide-tab-${activeGuideSection}" tabindex="0">
        <h3>${guideSectionTitle(activeGuideSection)}</h3>
        <div class="guide-entry-grid">
          ${entries.map((entry) => {
            const isCover = (entry.image || "").startsWith("cover:");
            const isCharacter = (entry.image || "").startsWith("heroWalk:") || (entry.image || "").startsWith("portrait:");
            const isEnemy = (entry.image || "").startsWith("enemy:");
            return `
            <article class="guide-entry${isCover ? " guide-entry-cover" : ""}${isCharacter ? " guide-entry-character" : ""}${isEnemy ? " guide-entry-enemy" : ""}">
              <canvas class="guide-image" width="${isCover ? 180 : isCharacter ? 170 : isEnemy ? 192 : 150}" height="${isCover ? 238 : isCharacter ? 118 : isEnemy ? 192 : 96}" data-guide-image="${entry.image || `item:${section}`}" ${(entry.image || "").startsWith("heroWalk:") ? `data-guide-animated="walk"` : ""} aria-label="${entry.name} artwork"></canvas>
              <div class="guide-entry-copy">
                <header>
                  <strong>${entry.name}</strong>
                  <span>${entry.stat}</span>
                </header>
                <p>${entry.text}</p>
              </div>
            </article>
          `;
          }).join("")}
        </div>
      </section>
    `;
    drawGuideImages();
    renderDirty.guide = false;
  }

  function renderGuideSectionTabs() {
    return `
      <div class="menu-tabs guide-tabs" role="tablist" aria-label="Guide sections">
        ${Object.keys(guideData).map((section) => `
          <button id="guide-tab-${section}" class="menu-tab ${activeGuideSection === section ? "is-active" : ""}" data-guide-section="${section}" type="button" role="tab" aria-selected="${activeGuideSection === section ? "true" : "false"}" aria-controls="guide-panel-${section}" tabindex="${activeGuideSection === section ? "0" : "-1"}">
            ${guideSectionTitle(section)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function guideSectionTitle(section) {
    return {
      spells: "Spells",
      items: "Items",
      weapons: "Weapons",
      armor: "Armor",
      accessories: "Accessories",
      characters: "Party",
      antagonists: "Antagonists",
      enemies: "Enemies",
      sidequests: "Side Quests",
      trilogy: "Trilogy Lore",
      route: "Main Route"
    }[section] || section;
  }

  function drawGuideImages(animatedOnly = false) {
    document.querySelectorAll(".guide-image").forEach((canvas) => {
      const animated = canvas.dataset.guideAnimated === "walk";
      if (animatedOnly && !animated) return;
      const { ctx, width, height } = prepareHiDPICanvas(canvas);
      const image = canvas.dataset.guideImage || "item:potion";
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, width, height);
      const [kind, id] = image.split(":");
      if (kind === "heroWalk") {
        drawBattleGround(ctx, width, height, "party");
        const dirs = ["down", "right", "up", "left"];
        const dirIndex = Math.floor(Date.now() / 2600 + (hash(id, "guide-walk") % dirs.length)) % dirs.length;
        const elapsed = ((Date.now() / 2.35) + hash(id, "walk-frame")) % WALK_MS;
        drawCharacterFrame(ctx, width / 2, height - 6, id, dirs[dirIndex], elapsed, 0.68, "guide");
      } else if (kind === "portrait") {
        drawCharacterPortrait(ctx, width, height, id);
      } else if (kind === "hero") {
        drawBattleGround(ctx, width, height, "party");
        drawCharacterFrame(ctx, width / 2, height - 8, id, id === "derlin" ? "right" : "down", 9999, 0.68, "guide");
      } else if (kind === "enemy") {
        drawGuideEnemyImage(ctx, width, height, id);
      } else if (kind === "route") {
        drawGuideRouteImage(ctx, width, height, id);
      } else if (kind === "sidequest") {
        drawGuideSidequestImage(ctx, width, height, id);
      } else if (kind === "art") {
        drawGeneratedGuideArt(ctx, width, height, id);
      } else if (kind === "area") {
        drawGuideArea(ctx, width, height, id);
      } else if (kind === "cover") {
        drawGuideCover(ctx, width, height, id);
      } else if (kind === "spell") {
        drawGuideSpell(ctx, width, height, id);
      } else if (kind === "weapon") {
        drawGuideWeapon(ctx, width, height, id);
      } else if (kind === "armor") {
        drawGuideArmor(ctx, width, height, id);
      } else if (kind === "accessory") {
        drawGuideAccessory(ctx, width, height, id);
      } else {
        drawGuideItem(ctx, width, height, id);
      }
    });
  }

  function drawGuideCover(ctx, w, h, id) {
    const key = coverImageKeys[id];
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#211a23");
    gradient.addColorStop(1, "#0d0b10");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    if (!imageReady(key)) {
      ctx.strokeStyle = "rgba(255, 221, 154, 0.45)";
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 12, w - 28, h - 24);
      ctx.fillStyle = "#ffe97a";
      ctx.font = "bold 18px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText({
        dreamquest: "DreamQuest",
        prophecyquest: "ProphecyQuest",
        swordquest: "SwordQuest"
      }[id] || id, w / 2, h / 2);
      return;
    }
    const img = artImages[key];
    const imageRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (imageRatio > targetRatio) {
      sw = img.naturalHeight * targetRatio;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / targetRatio;
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.strokeStyle = "rgba(255, 221, 154, 0.38)";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  const guideEnemyProfiles = {
    default: { scale: 0.68, ground: 0.93, fill: 1 },
    darhyn: { scale: 0.58, ground: 0.92, fill: 1 },
    dreamDarhyn: { scale: 0.58, ground: 0.92, fill: 1 },
    oldBetsy: { scale: 0.7, ground: 0.92, fill: 0.98 },
    corizaz: { scale: 0.58, ground: 0.93, fill: 1 },
    yvette: { scale: 0.86, ground: 0.93, fill: 1 },
    hano: { scale: 0.62, ground: 0.93, fill: 1 },
    lithar1: { scale: 0.62, ground: 0.93, fill: 1 },
    lithar2: { scale: 0.62, ground: 0.93, fill: 1 },
    marhynGuard: { scale: 0.62, ground: 0.93, fill: 1 },
    dustKnight: { scale: 0.62, ground: 0.93, fill: 1 },
    riverSlime: { scale: 0.74, ground: 0.92, fill: 1 },
    paperMimic: { scale: 0.62, ground: 0.93, fill: 1 },
    mole: { scale: 0.76, ground: 0.92, fill: 1.05 },
    crystalMole: { scale: 0.76, ground: 0.92, fill: 1.05 }
  };

  function drawGuideEnemyImage(ctx, w, h, id) {
    drawBattleGround(ctx, w, h, "enemy");
    const profile = guideEnemyProfiles[id] || guideEnemyProfiles.default;
    if (!drawGuideEnemyCroppedImage(ctx, w, h, id, profile)) {
      drawEnemyModel(ctx, id, w / 2, h * profile.ground, profile.scale, { facing: "left" });
    }
    drawPortraitOverlay(ctx, w, h);
  }

  function drawGuideEnemyCroppedImage(ctx, w, h, id, profile) {
    const customKey = customEnemyImageKeys[id];
    if (customKey && imageReady(customKey)) {
      const img = artImages[customKey];
      drawGuideEnemyCroppedSource(ctx, img, 0, 0, img.naturalWidth, img.naturalHeight, w, h, profile);
      return true;
    }
    const generated = generatedEnemyArt[id];
    if (generated?.assetKey && imageReady(generated.assetKey)) {
      const img = artImages[generated.assetKey];
      const cols = generated.cols || 1;
      const rows = generated.rows || 1;
      const cell = generated.cell || [0, 0];
      const sw = img.naturalWidth / cols;
      const sh = img.naturalHeight / rows;
      drawGuideEnemyCroppedSource(ctx, img, cell[0] * sw, cell[1] * sh, sw, sh, w, h, profile);
      return true;
    }
    if (!imageReady("enemyAtlas")) return false;
    const cell = enemyAtlasCells[id];
    if (!cell) return false;
    const img = artImages.enemyAtlas;
    const sw = img.naturalWidth / 4;
    const sh = img.naturalHeight / 2;
    const crop = enemyAtlasCellCrop[id] || {};
    const sx = cell[0] * sw + (crop.left || 0);
    const sy = cell[1] * sh + (crop.top || 0);
    const sourceW = sw - (crop.left || 0) - (crop.right || 0);
    const sourceH = sh - (crop.top || 0) - (crop.bottom || 0);
    drawGuideEnemyCroppedSource(ctx, img, sx, sy, sourceW, sourceH, w, h, profile);
    return true;
  }

  function drawGuideEnemyCroppedSource(ctx, img, sx, sy, sw, sh, w, h, profile) {
    const bounds = imageSourceAlphaBounds(img, sx, sy, sw, sh);
    const padding = Math.max(10, Math.round(Math.min(w, h) * 0.06));
    const maxW = w - padding * 2;
    const maxH = h - padding * 2;
    const fit = Math.min(maxW / bounds.sw, maxH / bounds.sh) * (profile.fill || 1);
    const drawW = bounds.sw * fit;
    const drawH = bounds.sh * fit;
    const drawX = (w - drawW) / 2;
    const drawY = h - padding - drawH;
    drawSoftShadow(ctx, w / 2, h - padding + 3, Math.max(16, drawW * 0.22), Math.max(6, h * 0.04));
    ctx.save();
    ctx.filter = "saturate(0.84) contrast(1.08) sepia(0.06)";
    ctx.drawImage(img, bounds.sx, bounds.sy, bounds.sw, bounds.sh, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  function drawGuideRouteImage(ctx, w, h, id) {
    const key = routeGuideImageKeys[id];
    if (key && imageReady(key)) {
      drawImageCover(ctx, artImages[key], 0, 0, w, h);
      drawPortraitOverlay(ctx, w, h);
      return true;
    }
    drawGuideArea(ctx, w, h, id);
    return false;
  }

  function drawGeneratedGuideArt(ctx, w, h, id) {
    const art = generatedGuideArt[id];
    drawGuideCardBg(ctx, w, h, "#17131a", "#25202b");
    if (!art?.assetKey || !imageReady(art.assetKey)) {
      drawGuideItem(ctx, w, h, "potion");
      return false;
    }
    const img = artImages[art.assetKey];
    if (art.cell) {
      drawImageCellCover(ctx, img, art.cols || 1, art.rows || 1, art.cell, 0, 0, w, h, art.focusX ?? 0.5, art.focusY ?? 0.5);
    } else {
      drawImageCover(ctx, img, 0, 0, w, h, art.focusX ?? 0.5, art.focusY ?? 0.5);
    }
    drawPortraitOverlay(ctx, w, h);
    return true;
  }

  function drawGuideSidequestImage(ctx, w, h, id) {
    const key = sidequestGuideImageKeys[id];
    if (key && imageReady(key)) {
      drawImageCover(ctx, artImages[key], 0, 0, w, h);
      drawPortraitOverlay(ctx, w, h);
      return true;
    }
    drawGuideArea(ctx, w, h, id);
    return false;
  }

  function drawGuideArea(ctx, w, h, id) {
    const a = areas[id];
    const kind = a?.theme === "water" ? "water" : a?.theme === "floor" ? "floor" : a?.theme === "mountain" ? "mountain" : a?.theme === "tree" ? "tree" : a?.theme === "town" ? "town" : a?.theme === "sand" ? "sand" : "grass";
    const tile = 24;
    const previousTileRenderAreaId = tileRenderAreaId;
    tileRenderAreaId = id;
    for (let y = 0; y < Math.ceil(h / tile); y += 1) {
      for (let x = 0; x < Math.ceil(w / tile); x += 1) {
        drawTile(ctx, kind, x * tile, y * tile, tile, x, y, ".");
      }
    }
    tileRenderAreaId = previousTileRenderAreaId;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, h - 22, w, 22);
    ctx.fillStyle = "#ffe97a";
    ctx.font = "bold 11px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(a?.name || id, w / 2, h - 8);
  }

  function drawCharacterPortrait(ctx, w, h, id) {
    drawGuideCardBg(ctx, w, h, "#102c34", "#172630");
    const customKey = customPortraitKeys[id];
    if (customKey && imageReady(customKey)) {
      drawImageCover(ctx, artImages[customKey], 0, 0, w, h, 0.48, 0.28);
      drawPortraitOverlay(ctx, w, h);
      return true;
    }
    if (spriteSheetHeadshotIds.has(id) && drawCharacterSheetHeadshot(ctx, w, h, id)) return true;
    if (!imageReady("portraitAtlas") || !portraitAtlasCells[id]) {
      drawCharacterFrame(ctx, w / 2, h - 8, id, "down", 9999, 0.68, "guide");
      return false;
    }
    const img = artImages.portraitAtlas;
    drawImageCellCover(ctx, img, 4, 3, portraitAtlasCells[id], 0, 0, w, h, 0.46, 0.42);
    drawPortraitOverlay(ctx, w, h);
    return true;
  }

  function drawCharacterSheetHeadshot(ctx, w, h, id) {
    const key = characterSheetKeys[id];
    if (!key || !imageReady(key)) return false;
    const img = artImages[key];
    const sw = img.naturalWidth / characterSheetGrid.cols;
    const sh = img.naturalHeight / characterSheetGrid.rows;
    const crop = characterSheetCrop[id] || defaultCharacterSheetCrop;
    const sourceW = sw - crop.left - crop.right;
    const sourceH = sh - crop.top - crop.bottom;
    const sx = crop.left + sourceW * 0.2;
    const sy = crop.top + sourceH * 0.03;
    const headW = sourceW * 0.6;
    const headH = sourceH * 0.46;
    const sourceRatio = headW / headH;
    const targetRatio = w / h;
    let drawW = headW;
    let drawH = headH;
    let drawX = sx;
    let drawY = sy;
    if (sourceRatio > targetRatio) {
      drawW = headH * targetRatio;
      drawX = sx + (headW - drawW) * 0.5;
    } else {
      drawH = headW / targetRatio;
      drawY = sy + (headH - drawH) * 0.28;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH, 0, 0, w, h);
    drawPortraitOverlay(ctx, w, h);
    return true;
  }

  function drawNarratorPortrait(ctx, w, h) {
    drawGuideCardBg(ctx, w, h, "#102c34", "#172630");
    if (imageReady("narratorIcon")) {
      drawImageCover(ctx, artImages.narratorIcon, 0, 0, w, h, 0.5, 0.5);
      drawPortraitOverlay(ctx, w, h);
      return true;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    fillRoundRect(ctx, -32, -29, 64, 54, 8, verticalGradient(ctx, -29, 25, "#e9d69c", "#8d6f3f"), "rgba(0,0,0,0.42)");
    ctx.fillStyle = "#2a211a";
    for (let i = -18; i <= 18; i += 12) ctx.fillRect(i, -18, 4, 32);
    ctx.fillStyle = "#70d9ff";
    ctx.beginPath();
    ctx.arc(0, -44, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawPortraitOverlay(ctx, w, h);
    return false;
  }

  function drawImageCellCover(ctx, img, cols, rows, cell, dx, dy, dw, dh, focusX = 0.5, focusY = 0.5) {
    const sw = img.naturalWidth / cols;
    const sh = img.naturalHeight / rows;
    const sx = cell[0] * sw;
    const sy = cell[1] * sh;
    drawImageCover(ctx, img, dx, dy, dw, dh, focusX, focusY, sx, sy, sw, sh);
  }

  function drawImageCover(ctx, img, dx, dy, dw, dh, focusX = 0.5, focusY = 0.5, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) {
    const targetRatio = dw / dh;
    const sourceRatio = sw / sh;
    let cropX = sx;
    let cropY = sy;
    let cropW = sw;
    let cropH = sh;
    if (sourceRatio > targetRatio) {
      cropW = sh * targetRatio;
      cropX = sx + clamp(sw * focusX - cropW / 2, 0, sw - cropW);
    } else {
      cropH = sw / targetRatio;
      cropY = sy + clamp(sh * focusY - cropH / 2, 0, sh - cropH);
    }
    ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  }

  function drawPortraitOverlay(ctx, w, h) {
    const glow = ctx.createRadialGradient(w * 0.52, h * 0.2, 8, w * 0.52, h * 0.45, Math.max(w, h) * 0.72);
    glow.addColorStop(0, "rgba(255, 245, 196, 0.14)");
    glow.addColorStop(0.58, "rgba(255, 245, 196, 0)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0.32)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255, 221, 154, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  function drawHeart(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.7);
    ctx.bezierCurveTo(-size * 1.15, 0, -size, -size * 0.9, -size * 0.28, -size * 0.72);
    ctx.bezierCurveTo(0, -size * 1.05, size * 0.28, -size * 0.72, size * 0.28, -size * 0.72);
    ctx.bezierCurveTo(size, -size * 0.9, size * 1.15, 0, 0, size * 0.7);
    ctx.fill();
    ctx.restore();
  }

  function drawGuideSpell(ctx, w, h, id) {
    const palettes = {
      water: ["#0f3658", "#1c8ec3", "#b8f5ff"],
      wind: ["#183f38", "#91d7a3", "#efffd9"],
      heal: ["#1d3c2a", "#6dba70", "#d7ffaf"],
      dragon: ["#17223e", "#2a756e", "#8df5ff"],
      charm: ["#3d213d", "#a05b87", "#ffd0ef"],
      bell: ["#3b3016", "#ad8430", "#fff0a0"],
      flare: ["#3b171d", "#b94335", "#ffc18a"],
      light: ["#3a3518", "#d8bc54", "#fff7c8"],
      rune: ["#28284f", "#5d61ae", "#cfe8ff"]
    };
    const [top, bottom, accent] = palettes[id] || palettes.water;
    drawGuideCardBg(ctx, w, h, top, bottom);
    if (drawSpellAtlasCell(ctx, id, w / 2, h / 2, Math.min(w, h) * 1.24, { composite: "screen", alpha: 0.96 })) {
      ctx.strokeStyle = "rgba(255, 221, 154, 0.28)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      return;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = "lighter";

    if (id === "water") {
      ctx.strokeStyle = colorWithAlpha(accent, 0.85);
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-54, i * 13);
        ctx.bezierCurveTo(-24, -18 + i * 9, 8, 20 + i * 8, 54, -8 + i * 9);
        ctx.stroke();
      }
      ctx.fillStyle = colorWithAlpha("#d7fbff", 0.9);
      ctx.beginPath();
      ctx.ellipse(0, -5, 18, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "wind") {
      ctx.strokeStyle = colorWithAlpha(accent, 0.9);
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-16 + i * 18, -5 + i * 7, 24 + i * 5, Math.PI * 1.04, Math.PI * 2.02);
        ctx.stroke();
      }
      ctx.fillStyle = "#c4ffb0";
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.translate(-42 + i * 28, 24 - i * 8);
        ctx.rotate(-0.7 + i * 0.34);
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (id === "heal") {
      ctx.strokeStyle = colorWithAlpha(accent, 0.82);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, -4, 24 + i * 12, 9 + i * 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#d7ffaf";
      fillRoundRect(ctx, -8, -34, 16, 60, 6, "#d7ffaf", null);
      fillRoundRect(ctx, -30, -12, 60, 16, 6, "#d7ffaf", null);
      ctx.fillStyle = "#7ad778";
      ctx.beginPath();
      ctx.ellipse(-35, 25, 8, 17, -0.75, 0, Math.PI * 2);
      ctx.ellipse(34, 22, 8, 17, 0.75, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "dragon") {
      ctx.strokeStyle = colorWithAlpha(accent, 0.9);
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-55, 26);
      ctx.bezierCurveTo(-20, -36, 22, 34, 48, -22);
      ctx.stroke();
      ctx.fillStyle = "#8df5ff";
      ctx.beginPath();
      ctx.moveTo(52, -23);
      ctx.lineTo(29, -38);
      ctx.lineTo(35, -15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(42, -26, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "charm") {
      ctx.strokeStyle = colorWithAlpha("#ffd0ef", 0.9);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-55, 14);
      ctx.lineTo(42, -16);
      ctx.stroke();
      ctx.fillStyle = "#ffd0ef";
      ctx.beginPath();
      ctx.moveTo(55, -20);
      ctx.lineTo(31, -29);
      ctx.lineTo(38, -6);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 3; i += 1) drawHeart(ctx, -30 + i * 23, -18 + i * 10, 9, "#ff8ad1");
    } else if (id === "bell") {
      fillRoundRect(ctx, -18, -24, 36, 42, 11, verticalGradient(ctx, -24, 18, "#fff0a0", "#ad8430"), "rgba(0,0,0,0.35)");
      ctx.fillStyle = "#fff0a0";
      ctx.beginPath();
      ctx.arc(0, 23, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colorWithAlpha("#fff0a0", 0.72);
      ctx.lineWidth = 3;
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 2; i += 1) {
          ctx.beginPath();
          ctx.arc(side * 16, -2, 24 + i * 14, side < 0 ? Math.PI * 0.6 : -Math.PI * 0.1, side < 0 ? Math.PI * 1.42 : Math.PI * 0.32);
          ctx.stroke();
        }
      });
    } else if (id === "flare") {
      ctx.strokeStyle = colorWithAlpha("#ffcf96", 0.9);
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 6, 50, -1.25, 0.7);
      ctx.stroke();
      ctx.strokeStyle = colorWithAlpha("#ff5744", 0.9);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-4, 4, 34, -1.5, 0.85);
      ctx.stroke();
      drawSparkBurst(ctx, 16, -9, "#ffcf96", 0.62, 9, 38, hash(id, "guide"));
    } else if (id === "light" || id === "rune") {
      ctx.rotate(-0.62);
      fillRoundRect(ctx, -5, -45, 10, 72, 4, id === "light" ? "#fff7c8" : "#cfe8ff", null);
      ctx.fillStyle = id === "light" ? "#ffffff" : "#78d7ff";
      ctx.beginPath();
      ctx.moveTo(0, -61);
      ctx.lineTo(-13, -39);
      ctx.lineTo(13, -39);
      ctx.closePath();
      ctx.fill();
      fillRoundRect(ctx, -23, 20, 46, 8, 4, "#806036", null);
      ctx.restore();
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = colorWithAlpha(accent, 0.76);
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, 18 + i * 8, i * 0.55, i * 0.55 + Math.PI * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGuideWeapon(ctx, w, h, id) {
    const useProceduralWeapon = id === "crossbow" || id === "repeater";
    if (!useProceduralWeapon && drawGuideAtlasIcon(ctx, w, h, "weapon", id)) return;
    const bg = id === "light" ? ["#2b2716", "#71662a"]
      : id === "rune" ? ["#1a2035", "#4b5f8a"]
        : id === "crossbow" ? ["#251a15", "#66442c"]
          : id === "repeater" ? ["#191d20", "#58616c"]
            : id === "longbow" ? ["#251a15", "#66442c"]
              : id === "hammer" ? ["#211916", "#5b3c2d"]
                : id === "redblade" ? ["#2b1619", "#7f3339"]
                  : id === "staff" || id === "dragonstaff" || id === "branch" ? ["#17261d", "#45634a"]
                    : ["#14242f", "#437382"];
    drawGuideCardBg(ctx, w, h, bg[0], bg[1]);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (useProceduralWeapon) {
      const weaponIconScale = Math.min(w / 150, h / 96);
      ctx.scale(weaponIconScale, weaponIconScale);
    }
    if (id === "hammer") {
      ctx.rotate(-0.46);
      fillRoundRect(ctx, -5, -30, 10, 72, 4, verticalGradient(ctx, -30, 42, "#8b5d36", "#3d2418"), null);
      fillRoundRect(ctx, -34, -43, 68, 24, 6, verticalGradient(ctx, -43, -19, "#d4d0bd", "#68665f"), "rgba(0,0,0,0.55)");
      fillRoundRect(ctx, -27, -38, 54, 8, 3, "rgba(255,255,255,0.24)", null);
      ctx.fillStyle = "#b43f34";
      ctx.fillRect(-7, -18, 14, 18);
    } else if (id === "crossbow") {
      ctx.rotate(-0.16);
      fillRoundRect(ctx, -6, -34, 12, 70, 5, verticalGradient(ctx, -34, 36, "#9a6439", "#3d2418"), null);
      fillRoundRect(ctx, -41, -4, 82, 9, 5, "#7a4e2b", "rgba(0,0,0,0.44)");
      ctx.strokeStyle = "#d8bd70";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-50, -30);
      ctx.quadraticCurveTo(-20, 0, -50, 30);
      ctx.moveTo(50, -30);
      ctx.quadraticCurveTo(20, 0, 50, 30);
      ctx.stroke();
      ctx.strokeStyle = "#f7efd6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-50, -30);
      ctx.lineTo(0, 0);
      ctx.lineTo(50, -30);
      ctx.moveTo(-50, 30);
      ctx.lineTo(0, 0);
      ctx.lineTo(50, 30);
      ctx.stroke();
      ctx.fillStyle = "#ffd0ef";
      ctx.beginPath();
      ctx.moveTo(42, 0);
      ctx.lineTo(13, -5);
      ctx.lineTo(13, 5);
      ctx.closePath();
      ctx.fill();
      fillRoundRect(ctx, -12, 8, 24, 8, 4, "#56351f", "rgba(0,0,0,0.28)");
    } else if (id === "repeater") {
      ctx.rotate(0.12);
      fillRoundRect(ctx, -44, -7, 88, 14, 5, verticalGradient(ctx, -7, 7, "#d0c3a5", "#5d6062"), "rgba(0,0,0,0.5)");
      fillRoundRect(ctx, -9, -29, 18, 64, 5, verticalGradient(ctx, -29, 35, "#7d4e2a", "#281a14"), null);
      fillRoundRect(ctx, -24, -23, 48, 17, 5, "#443229", "rgba(0,0,0,0.44)");
      fillRoundRect(ctx, -17, -33, 34, 12, 4, "#b28b48", "rgba(0,0,0,0.38)");
      ctx.strokeStyle = "#c9d2dc";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-50, -24);
      ctx.quadraticCurveTo(-18, 2, -48, 25);
      ctx.moveTo(50, -24);
      ctx.quadraticCurveTo(18, 2, 48, 25);
      ctx.stroke();
      ctx.strokeStyle = "#f1ead7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-50, -24);
      ctx.lineTo(0, 2);
      ctx.lineTo(50, -24);
      ctx.moveTo(-48, 25);
      ctx.lineTo(0, 2);
      ctx.lineTo(48, 25);
      ctx.stroke();
      fillRoundRect(ctx, 11, -3, 37, 7, 3, "#24272b", null);
      ctx.fillStyle = "#ffefaa";
      ctx.beginPath();
      ctx.moveTo(55, 0);
      ctx.lineTo(41, -6);
      ctx.lineTo(41, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#d3a34f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-26, 15, 8, 0, Math.PI * 1.65);
      ctx.stroke();
    } else if (id === "longbow") {
      ctx.rotate(0.34);
      ctx.strokeStyle = "#d8bd70";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 54, Math.PI * 0.64, Math.PI * 1.36);
      ctx.stroke();
      ctx.strokeStyle = "#f7efd6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-34, -42);
      ctx.lineTo(-34, 42);
      ctx.stroke();
      ctx.rotate(-1.0);
      fillRoundRect(ctx, -4, -43, 8, 78, 4, "#9ee9a3", null);
      ctx.fillStyle = "#efffd9";
      ctx.beginPath();
      ctx.moveTo(0, -57);
      ctx.lineTo(-12, -39);
      ctx.lineTo(12, -39);
      ctx.closePath();
      ctx.fill();
    } else if (id === "staff" || id === "dragonstaff" || id === "branch") {
      ctx.rotate(-0.38);
      ctx.strokeStyle = id === "branch" ? "#7b4b2c" : "#6b4b33";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-26, 45);
      ctx.quadraticCurveTo(-6, 0, 16, -48);
      ctx.stroke();
      ctx.fillStyle = id === "dragonstaff" ? "#8df5ff" : id === "branch" ? "#d7ffaf" : "#d8d0be";
      ctx.beginPath();
      ctx.arc(19, -50, id === "branch" ? 10 : 13, 0, Math.PI * 2);
      ctx.fill();
      if (id === "dragonstaff") {
        ctx.strokeStyle = "#8df5ff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(25, -42, 22, Math.PI * 0.92, Math.PI * 1.86);
        ctx.stroke();
      } else if (id === "branch") {
        [[2, -28, -0.8], [28, -28, 0.75], [4, -5, -0.45]].forEach(([x, y, r]) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(r);
          ctx.beginPath();
          ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    } else if (id === "flute") {
      ctx.rotate(-0.32);
      fillRoundRect(ctx, -50, -8, 100, 16, 8, verticalGradient(ctx, -8, 8, "#dffcff", "#73cce2"), "rgba(0,0,0,0.34)");
      ctx.fillStyle = "rgba(255,255,255,0.52)";
      ctx.fillRect(-42, -5, 72, 3);
      ctx.fillStyle = "#24505d";
      [-24, -8, 8, 24].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      drawSparkBurst(ctx, 42, -12, "#dffcff", 0.72, 7, 22, hash(id, "flute"));
    } else if (id === "redblade") {
      ctx.rotate(-0.55);
      fillRoundRect(ctx, -6, -43, 12, 74, 4, verticalGradient(ctx, -43, 31, "#ffe1d6", "#d14e54"), null);
      ctx.fillStyle = "#ffb39f";
      ctx.beginPath();
      ctx.moveTo(0, -64);
      ctx.lineTo(-14, -41);
      ctx.lineTo(14, -41);
      ctx.closePath();
      ctx.fill();
      fillRoundRect(ctx, -28, 27, 56, 10, 4, "#d8b75e", null);
      fillRoundRect(ctx, -7, 30, 14, 26, 5, "#64242c", null);
    } else {
      ctx.rotate(id === "light" ? -0.75 : -0.55);
      fillRoundRect(ctx, -6, -43, 12, 74, 4, id === "light" ? verticalGradient(ctx, -43, 31, "#ffffff", "#e6c96e") : verticalGradient(ctx, -43, 31, "#dff5ff", "#6d93d5"), null);
      ctx.strokeStyle = id === "light" ? "rgba(255,255,255,0.8)" : "rgba(157,224,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-1, -38);
      ctx.lineTo(-1, 24);
      ctx.stroke();
      ctx.fillStyle = id === "light" ? "#fff7c8" : "#93e4ff";
      ctx.beginPath();
      ctx.moveTo(0, -64);
      ctx.lineTo(-14, -41);
      ctx.lineTo(14, -41);
      ctx.closePath();
      ctx.fill();
      fillRoundRect(ctx, -28, 27, 56, 10, 4, id === "light" ? "#c79e42" : "#5848a8", null);
      fillRoundRect(ctx, -7, 30, 14, 26, 5, "#5f3824", null);
      ctx.restore();
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.globalCompositeOperation = "lighter";
      drawSparkBurst(ctx, id === "light" ? 22 : -20, id === "light" ? -18 : 15, id === "light" ? "#fff7c8" : "#93e4ff", 0.72, 10, 34, hash(id, "weapon"));
    }
    ctx.restore();
  }

  function drawGuideArmor(ctx, w, h, id) {
    const useGeneratedArmor = id === "vs";
    if (!useGeneratedArmor && drawGuideAtlasIcon(ctx, w, h, "armor", id)) return;
    const bg = id === "cloak" ? ["#261018", "#74303a"]
      : id === "branch" || id === "leafmail" ? ["#1c3020", "#607841"]
        : id === "charm" || id === "skyweave" ? ["#102b42", "#4b8dc0"]
          : id === "vs" ? ["#211626", "#5c385f"]
            : id === "dragonmantle" ? ["#17232b", "#335f61"]
              : id === "bluecoat" ? ["#101825", "#24385f"]
                : ["#141922", "#2d3445"];
    drawGuideCardBg(ctx, w, h, bg[0], bg[1]);
    if (useGeneratedArmor) {
      loadArtAssets(["vsArmorIcon"]);
      const img = artImages.vsArmorIcon;
      if (imageReady("vsArmorIcon")) {
        const inset = Math.min(w, h) * 0.03;
        const targetW = w - inset * 2;
        const targetH = h - inset * 2;
        const sourceRatio = img.naturalWidth / img.naturalHeight;
        const targetRatio = targetW / targetH;
        let drawW = targetW;
        let drawH = targetH;
        if (sourceRatio > targetRatio) drawH = drawW / sourceRatio;
        else drawW = drawH * sourceRatio;
        ctx.drawImage(img, inset + (targetW - drawW) / 2, inset + (targetH - drawH) / 2, drawW, drawH);
      }
      return;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2 + 5);
    if (id === "clothes") {
      ctx.fillStyle = verticalGradient(ctx, -38, 40, "#d7c39c", "#5e4630");
      ctx.beginPath();
      ctx.moveTo(-25, -36);
      ctx.quadraticCurveTo(0, -47, 25, -36);
      ctx.lineTo(34, 28);
      ctx.quadraticCurveTo(0, 43, -34, 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 238, 191, 0.42)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-13, -29);
      ctx.lineTo(0, 0);
      ctx.lineTo(13, -29);
      ctx.moveTo(-20, 15);
      ctx.lineTo(20, 15);
      ctx.stroke();
    } else if (id === "cloak") {
      ctx.fillStyle = verticalGradient(ctx, -42, 38, "#d84d54", "#4a131d");
      ctx.beginPath();
      ctx.moveTo(-20, -36);
      ctx.quadraticCurveTo(0, -48, 20, -36);
      ctx.lineTo(40, 34);
      ctx.quadraticCurveTo(0, 48, -40, 34);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 218, 165, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-13, -28);
      ctx.quadraticCurveTo(-1, 3, -26, 34);
      ctx.moveTo(13, -28);
      ctx.quadraticCurveTo(0, 4, 27, 34);
      ctx.stroke();
      fillRoundRect(ctx, -16, -41, 32, 12, 6, "#d8b75e", null);
    } else if (id === "branch" || id === "leafmail") {
      fillRoundRect(ctx, -25, -32, 50, 54, 13, verticalGradient(ctx, -32, 22, "#c7dc83", "#4f6a38"), "rgba(0,0,0,0.55)");
      ctx.strokeStyle = "#7b4b2c";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-9, 22);
      ctx.bezierCurveTo(-3, -6, 14, -18, 12, -36);
      ctx.stroke();
      ctx.fillStyle = "#d7ffaf";
      [[-16, -10, -0.7], [16, -17, 0.7], [4, 2, 0.2]].forEach(([x, y, r]) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r);
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      if (id === "leafmail") {
        ctx.strokeStyle = "rgba(255,255,255,0.36)";
        ctx.lineWidth = 2;
        [-12, 0, 12].forEach((x) => {
          ctx.beginPath();
          ctx.moveTo(x, -27);
          ctx.lineTo(x - 10, 14);
          ctx.stroke();
        });
      }
    } else if (id === "charm") {
      ctx.strokeStyle = "#d7f3ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -16, 34, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.fillStyle = verticalGradient(ctx, -27, 26, "#fff7c8", "#61c7ff");
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? 29 : 13;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius + 8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      drawSparkBurst(ctx, 0, 4, "#d7f3ff", 0.75, 8, 40, hash(id, "charm"));
    } else if (id === "skyweave") {
      ctx.fillStyle = verticalGradient(ctx, -38, 42, "#dff7ff", "#4b8dc0");
      ctx.beginPath();
      ctx.moveTo(-18, -38);
      ctx.quadraticCurveTo(0, -48, 18, -38);
      ctx.lineTo(38, 36);
      ctx.quadraticCurveTo(0, 47, -38, 36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.62)";
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-27, i * 14);
        ctx.bezierCurveTo(-8, -7 + i * 8, 7, 9 + i * 8, 27, -8 + i * 8);
        ctx.stroke();
      }
    } else if (id === "dragonmantle") {
      ctx.fillStyle = verticalGradient(ctx, -38, 38, "#8df5ff", "#1d4950");
      ctx.beginPath();
      ctx.moveTo(-22, -36);
      ctx.quadraticCurveTo(0, -48, 22, -36);
      ctx.lineTo(42, 35);
      ctx.quadraticCurveTo(0, 46, -42, 35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(12, 42, 45, 0.72)";
      for (let y = -16; y <= 22; y += 14) {
        for (let x = -22; x <= 22; x += 22) {
          ctx.beginPath();
          ctx.arc(x, y, 11, Math.PI, 0);
          ctx.fill();
        }
      }
    } else if (id === "guard" || id === "bluecoat") {
      const color = id === "bluecoat" ? "#425b89" : "#d8e4ef";
      fillRoundRect(ctx, -28, -34, 56, 58, 10, verticalGradient(ctx, -34, 24, lighten(color, 0.12), darken(color, 0.48)), "rgba(0,0,0,0.55)");
      fillRoundRect(ctx, -37, -25, 17, 26, 6, darken(color, 0.2), null);
      fillRoundRect(ctx, 20, -25, 17, 26, 6, darken(color, 0.2), null);
      ctx.strokeStyle = id === "bluecoat" ? "#5aa7df" : "#e9b949";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, -18);
      ctx.lineTo(0, 10);
      ctx.lineTo(16, -18);
      ctx.stroke();
    } else {
      const color = "#d8e4ef";
      fillRoundRect(ctx, -25, -33, 50, 56, 10, verticalGradient(ctx, -33, 23, lighten(color, 0.16), darken(color, 0.58)), "rgba(0,0,0,0.55)");
      fillRoundRect(ctx, -14, -24, 28, 38, 7, verticalGradient(ctx, -24, 14, "#ffffff", "#8da7c0"), null);
      ctx.strokeStyle = "#e9b949";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-15, -17);
      ctx.lineTo(0, 12);
      ctx.lineTo(15, -17);
      ctx.stroke();
      ctx.fillStyle = "#2b1b3e";
      ctx.font = "bold 13px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("VS", 0, 2);
    }
    ctx.restore();
  }

  function drawGuideAccessory(ctx, w, h, id) {
    if (drawGuideAtlasIcon(ctx, w, h, "accessory", id)) return;
    if (id === "none") {
      drawGuideCardBg(ctx, w, h, "#1f2228", "#34313a");
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = "rgba(255, 221, 154, 0.62)";
      ctx.lineWidth = 5;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      ctx.arc(0, 4, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(-14, -10);
      ctx.lineTo(14, 18);
      ctx.moveTo(14, -10);
      ctx.lineTo(-14, 18);
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (id === "flute") {
      drawGuideWeapon(ctx, w, h, "flute");
      return;
    }
    if (id === "bell" || id === "pearl") {
      drawGuideItem(ctx, w, h, id);
      return;
    }
    if (id === "charm") {
      drawGuideArmor(ctx, w, h, "charm");
      return;
    }
    drawGuideCardBg(ctx, w, h, id === "orb" ? "#17243d" : "#241c35", id === "orb" ? "#356a8c" : "#5b4372");
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (id === "orb") {
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
      glow.addColorStop(0, "rgba(216, 250, 255, 0.94)");
      glow.addColorStop(0.5, "rgba(99, 207, 255, 0.58)");
      glow.addColorStop(1, "rgba(99, 207, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d8faff";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30, Math.PI * 0.18, Math.PI * 0.82);
      ctx.arc(0, 0, 30, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#f7e6b5";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 4, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#a77bd5";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 4, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#dff7ff";
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(10, -19);
      ctx.lineTo(0, -11);
      ctx.lineTo(-10, -19);
      ctx.closePath();
      ctx.fill();
      drawSparkBurst(ctx, 22, -22, "#dff7ff", 0.62, 7, 24, hash(id, "ring"));
    }
    ctx.restore();
  }

  function drawGuideGoldPieces(ctx, w, h) {
    drawGuideCardBg(ctx, w, h, "#24190c", "#5c421c");
    ctx.save();
    ctx.translate(w / 2, h / 2 + Math.min(w, h) * 0.04);
    const scale = Math.min(w / 74, h / 74);
    const coins = [
      [-15, 6, 19, -0.22],
      [8, 8, 20, 0.18],
      [0, -10, 18, 0.04]
    ];
    coins.forEach(([x, y, size, rotation], index) => {
      ctx.save();
      ctx.translate(x * scale, y * scale);
      ctx.rotate(rotation);
      const rx = size * scale;
      const ry = size * 0.68 * scale;
      const shine = ctx.createRadialGradient(-rx * 0.36, -ry * 0.46, rx * 0.08, 0, 0, rx * 1.08);
      shine.addColorStop(0, "#fff4a8");
      shine.addColorStop(0.42, index === 1 ? "#f3c94f" : "#ffd75d");
      shine.addColorStop(1, "#9d681e");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5d3515";
      ctx.lineWidth = Math.max(1.3, 2.2 * scale);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 250, 188, 0.82)";
      ctx.lineWidth = Math.max(1, 1.6 * scale);
      ctx.beginPath();
      ctx.ellipse(-rx * 0.1, -ry * 0.06, rx * 0.58, ry * 0.38, 0, Math.PI * 1.1, Math.PI * 1.82);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 218, 0.72)";
      ctx.beginPath();
      ctx.ellipse(-rx * 0.36, -ry * 0.34, rx * 0.16, ry * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawSparkBurst(ctx, w * 0.69, h * 0.3, "#fff0a0", 0.68, 6, Math.min(w, h) * 0.18, hash("gold", "coins"));
    ctx.restore();
  }

  function drawGuideItem(ctx, w, h, id) {
    if (id === "gold") {
      drawGuideGoldPieces(ctx, w, h);
      return;
    }
    if (id === "potion") {
      loadArtAssets(["guideIcons"]);
      if (drawGuideAtlasIcon(ctx, w, h, "item", id)) return;
      drawGuideCardBg(ctx, w, h, "#142024", "#324c4d");
      return;
    }
    if (drawGuideAtlasIcon(ctx, w, h, "item", id)) return;
    drawGuideCardBg(ctx, w, h, "#142024", "#324c4d");
    if (id === "relic") {
      const img = artImages.vsLogo;
      if (imageReady("vsLogo")) {
        const pad = 7;
        ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
        fillRoundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 8, "#f7f3ec", "rgba(0,0,0,0.45)");
        const scale = Math.min((w - pad * 4) / img.naturalWidth, (h - pad * 4) / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#dfe9ff";
        ctx.font = "bold 30px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("VS", w / 2, h / 2 + 10);
      }
      return;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (id === "potion") {
      fillRoundRect(ctx, -13, -12, 26, 33, 7, "#d86372", "rgba(0,0,0,0.5)");
      fillRoundRect(ctx, -8, -25, 16, 12, 4, "#b9dff0", "rgba(0,0,0,0.45)");
    } else if (id === "ether") {
      ctx.rotate(-0.25);
      ctx.fillStyle = "#7fd3ff";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#dff7ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, 24);
      ctx.quadraticCurveTo(10, 2, -8, -23);
      ctx.stroke();
    } else if (id === "wakeLeaf") {
      ctx.rotate(-0.24);
      ctx.fillStyle = verticalGradient(ctx, -34, 32, "#d8ff8f", "#4f9f42");
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#244f2f";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#efffb9";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, 28);
      ctx.quadraticCurveTo(8, 2, -8, -27);
      ctx.stroke();
      ctx.strokeStyle = "rgba(36, 79, 47, 0.58)";
      ctx.lineWidth = 2;
      [[-11, -7, -22], [9, -1, 14], [-8, 12, -15], [7, 15, 13]].forEach(([x, y, endY]) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(x, endY);
        ctx.stroke();
      });
    } else if (id === "smoke") {
      ctx.fillStyle = "#8a6b45";
      ctx.beginPath();
      ctx.arc(0, 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d7d7c0";
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.arc(i * 12, -10 - i * 3, 10 + Math.abs(i) * 4, Math.PI * 0.2, Math.PI * 1.6);
        ctx.stroke();
      }
    } else if (id === "zoomShell") {
      ctx.fillStyle = verticalGradient(ctx, -28, 30, "#dffcff", "#4aa3cc");
      ctx.beginPath();
      ctx.moveTo(-28, 12);
      ctx.quadraticCurveTo(-18, -24, 8, -28);
      ctx.quadraticCurveTo(30, -12, 24, 14);
      ctx.quadraticCurveTo(4, 30, -28, 12);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(27, 90, 124, 0.75)";
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-4 + i * 8, 4, 14 + i * 8, Math.PI * 1.05, Math.PI * 1.88);
        ctx.stroke();
      }
    } else if (id === "kokhor") {
      fillRoundRect(ctx, -15, -29, 30, 50, 8, verticalGradient(ctx, -29, 21, "#f0c767", "#8f3f20"), "rgba(0,0,0,0.5)");
      fillRoundRect(ctx, -9, -40, 18, 13, 5, "#6bd1d7", "rgba(0,0,0,0.42)");
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(-9, -19, 18, 4);
      drawSparkBurst(ctx, 18, -16, "#ffd676", 0.74, 7, 28, hash(id, "kokhor"));
    } else if (id === "bell") {
      fillRoundRect(ctx, -16, -7, 32, 28, 8, "#d7b94d", "rgba(0,0,0,0.55)");
      ctx.fillStyle = "#f6e38a";
      ctx.beginPath();
      ctx.arc(0, -19, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6a4a2b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-21, 18);
      ctx.lineTo(21, 18);
      ctx.stroke();
    } else if (id === "milk") {
      fillRoundRect(ctx, -15, -27, 30, 48, 6, "#f3ead0", "rgba(0,0,0,0.45)");
      ctx.fillStyle = "#6f4d35";
      ctx.fillRect(-10, -8, 20, 10);
    } else if (id === "pearl" || id === "charm") {
      ctx.fillStyle = id === "pearl" ? "#d7fbff" : "#ffe97a";
      ctx.beginPath();
      ctx.arc(0, -2, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (id === "book") {
      fillRoundRect(ctx, -22, -25, 44, 50, 5, "#7f3f51", "rgba(0,0,0,0.5)");
      ctx.fillStyle = "#e8cf63";
      ctx.fillRect(-3, -24, 6, 48);
    } else if (id === "flute") {
      ctx.rotate(-0.35);
      fillRoundRect(ctx, -31, -5, 62, 10, 5, "#d8f2ff", "rgba(0,0,0,0.45)");
      ctx.fillStyle = "#5a9edb";
      for (let i = -16; i <= 18; i += 10) {
        ctx.beginPath();
        ctx.arc(i, 0, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "encounterDial") {
      ctx.fillStyle = verticalGradient(ctx, -35, 34, "#18314c", "#0b111d");
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d8b85d";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = "rgba(120, 215, 255, 0.86)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22, Math.PI * 0.05, Math.PI * 1.55);
      ctx.stroke();
      ctx.save();
      ctx.rotate(-0.62);
      fillRoundRect(ctx, -3, -24, 6, 27, 3, "#ffe08a", "rgba(0,0,0,0.42)");
      ctx.restore();
      drawSparkBurst(ctx, 18, -22, "#78d7ff", 0.72, 8, 26, hash(id, "dial"));
    } else {
      ctx.fillStyle = "#e9b949";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGuideAtlasIcon(ctx, w, h, kind, id) {
    if (!imageReady("guideIcons")) return false;
    const cell = guideIconAtlas.cells[`${kind}:${id}`];
    if (!cell) return false;
    drawImageCellCover(ctx, artImages.guideIcons, guideIconAtlas.cols, guideIconAtlas.rows, cell, 0, 0, w, h, 0.5, 0.5);
    ctx.strokeStyle = "rgba(255, 221, 154, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    return true;
  }

  function drawGuideCardBg(ctx, w, h, top, bottom) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, w, 5);
  }

  function ensureAudio() {
    if (audioState.context) return audioState.context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioState.context = new AudioContext();

    audioState.master = audioState.context.createGain();
    audioState.master.gain.value = 0.18;

    audioState.sfxBus = audioState.context.createGain();
    audioState.sfxBus.gain.value = state?.settings?.sfxMuted ? 0 : (state?.settings?.sfxVolume ?? 0.85);
    audioState.sfxBus.connect(audioState.master);

    audioState.delay = audioState.context.createDelay(1);
    audioState.delay.delayTime.value = 0.24;
    audioState.delayFeedback = audioState.context.createGain();
    audioState.delayFeedback.gain.value = 0.22;
    audioState.delayWet = audioState.context.createGain();
    audioState.delayWet.gain.value = 0.14;
    audioState.delay.connect(audioState.delayFeedback);
    audioState.delayFeedback.connect(audioState.delay);
    audioState.delay.connect(audioState.delayWet);
    audioState.delayWet.connect(audioState.master);

    audioState.reverb = audioState.context.createConvolver();
    audioState.reverb.buffer = createReverbImpulse(audioState.context, 1.7, 2.6);
    audioState.reverbWet = audioState.context.createGain();
    audioState.reverbWet.gain.value = 0.18;
    audioState.reverb.connect(audioState.reverbWet);
    audioState.reverbWet.connect(audioState.master);

    audioState.compressor = audioState.context.createDynamicsCompressor();
    audioState.compressor.threshold.value = -18;
    audioState.compressor.knee.value = 16;
    audioState.compressor.ratio.value = 4;
    audioState.compressor.attack.value = 0.008;
    audioState.compressor.release.value = 0.18;
    audioState.master.connect(audioState.compressor);
    audioState.compressor.connect(audioState.context.destination);
    return audioState.context;
  }

  function toggleMusic() {
    setMusicEnabled(!audioState.enabled);
  }

  function fastBattleEnabled() {
    return Boolean(state?.settings?.fastBattle);
  }

  function effectiveBattleSpeed() {
    return Math.max(0.8, battleSpeed * (fastBattleEnabled() ? 2.6 : 1));
  }

  function movementSpeedLabel(ms = WALK_MS) {
    if (ms <= 90) return "Very Fast";
    if (ms <= 120) return "Fast";
    if (ms <= 160) return "Normal";
    if (ms <= 200) return "Relaxed";
    return "Slow";
  }

  function applyPlayerSpeedSettings() {
    if (!state) return;
    state.settings = sanitizeSettings(state.settings);
    WALK_MS = state.settings.movementMs;
    battleSpeed = state.settings.battleSpeed;
    updateWalkDebugControl();
    const battleControl = $("battle-speed");
    if (battleControl) battleControl.value = String(battleSpeed);
    if ($("battle-speed-value")) $("battle-speed-value").textContent = `${battleSpeed.toFixed(1)}x${fastBattleEnabled() ? " Fast" : ""}`;
    document.body.classList.toggle("reduced-effects", reducedMotionEnabled());
    audioState.enabled = !state.settings.musicMuted;
    applyAudioSettings();
  }

  function applyAudioSettings() {
    if (!state) return;
    const settings = sanitizeSettings(state.settings);
    if (audioState.sfxBus) audioState.sfxBus.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
    Object.values(audioState.trackElements).forEach((audio) => {
      if (audio) audio.volume = musicTrackVolume(audioState.theme);
    });
  }

  function syncWalkDebugControl(event) {
    const next = Number(event.currentTarget?.value);
    if (!Number.isFinite(next)) return;
    WALK_MS = clamp(next, 80, 240);
    if (state) {
      state.settings = sanitizeSettings({ ...state.settings, movementMs: WALK_MS });
      saveLocal();
    }
    updateWalkDebugControl();
  }

  function updateWalkDebugControl() {
    const control = $("walk-ms");
    const label = $("walk-ms-value");
    if (control) control.value = String(WALK_MS);
    if (label) label.textContent = movementSpeedLabel();
  }

  function setMusicEnabled(enabled) {
    audioState.enabled = enabled;
    if (state) {
      state.settings = sanitizeSettings({ ...state.settings, musicMuted: !enabled });
      saveLocal();
    }
    if (enabled) startMusic();
    else stopMusic();
    updateMusicButtons();
  }

  function startMusicIfEnabled() {
    if (audioState.enabled) startMusic();
    else updateMusicButtons();
  }

  function startMusic() {
    if (audioState.playing) return;
    const context = ensureAudio();
    audioState.enabled = true;
    context?.resume?.();
    audioState.playing = true;
    setMusicTheme(currentMusicTheme());
    updateMusicButtons();
  }

  function stopMusic() {
    pauseMusicTracksExcept();
    audioState.playing = false;
    updateMusicButtons();
  }

  function updateMusicButtons() {
    const enabled = audioState.enabled;
    const label = enabled ? "On" : "Off";
    ["music-title", "music-btn"].forEach((id) => {
      const control = $(id);
      if (!control) return;
      control.setAttribute("aria-checked", enabled ? "true" : "false");
      const switchRoot = control.classList.contains("music-switch") ? control : control.closest?.(".music-switch");
      switchRoot?.classList.toggle("is-active", enabled);
      const stateLabel = switchRoot?.querySelector(".music-switch-state");
      if (stateLabel) stateLabel.textContent = label;
    });
  }

  function updateMusicForContext() {
    if (!audioState.playing) {
      updateMusicButtons();
      return;
    }
    setMusicTheme(currentMusicTheme());
  }

  function currentMusicTheme() {
    if (activeBattle) {
      if (activeBattle.enemies?.some((enemy) => enemy.final)) return "finalBattle";
      if (activeBattle.enemies?.some((enemy) => enemy.mustRun)) return "escape";
      if (activeBattle.enemies?.some((enemy) => enemy.boss)) return "boss";
      return "battle";
    }
    if (endingSceneVisible()) return "victory";
    if (!state || $("game-screen").classList.contains("is-hidden")) return "title";
    if (["krendon", "breshen"].includes(state.areaId)) return "town";
    if (["krendonShop", "tealsburgShop"].includes(state.areaId)) return "shop";
    if (["tealsburg", "marketMaze"].includes(state.areaId)) return "market";
    if (["krendonRoad", "oldMill", "kingsHighway", "northernPath"].includes(state.areaId)) return "road";
    if (state.areaId === "skyShrine") return "shrine";
    if (state.areaId === "moonMarsh") return "marsh";
    if (state.areaId === "deepForest") return "deepForest";
    if (state.areaId === "glassCaves") return "glass";
    if (state.areaId === "rathskellerApproach") return "approach";
    if (worldAreaId(state.areaId) === "marhynCastle" || state.areaId === "rathskeller") return "dungeon";

    const terrain = areas[state.areaId]?.theme;
    if (terrain === "town") return "town";
    if (terrain === "mountain") return "mountain";
    if (terrain === "water") return "water";
    if (terrain === "tree") return "forest";
    if (terrain === "sand") return "sand";
    if (terrain === "path") return "road";
    if (terrain === "floor" || ["darhynCastle", "rathskeller"].includes(state.areaId) || worldAreaId(state.areaId) === "marhynCastle") return "castle";
    return "field";
  }

  function setMusicTheme(themeName) {
    const nextTheme = musicTrackThemeMap?.[themeName] ? themeName : "field";
    const preserveCurrent = audioState.theme === nextTheme;
    if (preserveCurrent && audioState.trackAudio && !audioState.trackAudio.paused) return;
    audioState.theme = nextTheme;
    if (!audioState.playing) return;
    startThemeTrack(nextTheme, preserveCurrent);
  }

  function startThemeTrack(themeName, preserveCurrent = false) {
    audioState.playlist = musicPlaylistForTheme(themeName);
    const preferredKey = preserveCurrent ? audioState.trackKey : audioState.themeTrackKeys[themeName];
    const preferredIndex = audioState.playlist.indexOf(preferredKey);
    audioState.playlistIndex = preferredIndex >= 0 ? preferredIndex : 0;
    const trackKey = audioState.playlist[audioState.playlistIndex];
    return playMusicTrack(trackKey, themeName);
  }

  function musicPlaylistForTheme(themeName) {
    const fallback = musicTrackThemeMap?.[themeName] || musicTrackThemeMap?.field;
    const configured = musicTrackThemePlaylists?.[themeName];
    const keys = Array.isArray(configured) ? configured : [fallback];
    return [...new Set([fallback, ...keys].filter((key) => key && musicTrackSources?.[key] && !audioState.trackFailures.has(key)))];
  }

  function advanceMusicPlaylist() {
    if (!audioState.playing) return false;
    const playlist = musicPlaylistForTheme(audioState.theme);
    if (!playlist.length) return false;
    const previousKey = audioState.trackKey;
    const previousIndex = playlist.indexOf(previousKey);
    const nextIndex = previousIndex >= 0 ? (previousIndex + 1) % playlist.length : 0;
    audioState.playlist = playlist;
    audioState.playlistIndex = nextIndex;
    return playMusicTrack(playlist[nextIndex], audioState.theme, true);
  }

  function playMusicTrack(trackKey, themeName, restartEnded = false) {
    const src = trackKey ? musicTrackSources?.[trackKey] : "";
    if (!src || audioState.trackFailures.has(trackKey)) return false;
    const audio = getMusicTrack(trackKey, src);
    if (!audio) return false;
    pauseMusicTracksExcept(audio);
    const alreadyPlaying = audioState.trackAudio === audio && !audio.paused;
    audioState.trackAudio = audio;
    audioState.trackKey = trackKey;
    audioState.themeTrackKeys[themeName] = trackKey;
    audio.loop = false;
    audio.volume = musicTrackVolume(themeName);
    preloadNextMusicTrack(trackKey);
    if (alreadyPlaying) return true;
    if (restartEnded || audio.ended || !Number.isFinite(audio.currentTime)) audio.currentTime = 0;
    const playResult = audio.play();
    if (playResult?.catch) {
      playResult.catch((error) => {
        if (error?.name !== "NotAllowedError") failMusicTrack(trackKey, audio);
      });
    }
    return true;
  }

  function getMusicTrack(trackKey, src) {
    if (audioState.trackElements[trackKey]) return audioState.trackElements[trackKey];
    const audio = new Audio(src);
    audio.preload = "metadata";
    audio.loop = false;
    audio.addEventListener("ended", () => {
      if (audioState.trackAudio === audio) advanceMusicPlaylist();
    });
    audio.addEventListener("error", () => {
      failMusicTrack(trackKey, audio);
    });
    audioState.trackElements[trackKey] = audio;
    return audio;
  }

  function preloadNextMusicTrack(currentTrackKey) {
    if (audioState.playlist.length < 2) return;
    const currentIndex = Math.max(0, audioState.playlist.indexOf(currentTrackKey));
    for (let offset = 1; offset < audioState.playlist.length; offset += 1) {
      const nextKey = audioState.playlist[(currentIndex + offset) % audioState.playlist.length];
      const src = musicTrackSources?.[nextKey];
      if (!src || audioState.trackFailures.has(nextKey)) continue;
      const nextAudio = getMusicTrack(nextKey, src);
      if (nextAudio) nextAudio.preload = "auto";
      return;
    }
  }

  function failMusicTrack(trackKey, audio) {
    if (!trackKey || !audio) return false;
    audioState.trackFailures.add(trackKey);
    const refreshedPlaylist = musicPlaylistForTheme(audioState.theme);
    audioState.playlist = refreshedPlaylist;
    audioState.playlistIndex = refreshedPlaylist.indexOf(audioState.trackKey);
    if (audioState.trackAudio !== audio) return false;
    audio.pause?.();
    audioState.trackAudio = null;
    audioState.trackKey = "";
    audioState.playlistIndex = -1;
    return audioState.playing ? advanceMusicPlaylist() : false;
  }

  function musicTrackVolume(themeName) {
    const mix = musicTrackVolumes?.[themeName] ?? musicTrackVolumes?.field ?? 0.8;
    return clamp(mix * 0.34 * (state?.settings?.musicVolume ?? 0.72), 0, 0.34);
  }

  function pauseMusicTracksExcept(except = null) {
    Object.values(audioState.trackElements).forEach((audio) => {
      if (!audio || audio === except) return;
      audio.pause?.();
    });
    if (!audioState.trackAudio || audioState.trackAudio === except) return;
    audioState.trackAudio = null;
    audioState.trackKey = "";
  }

  function createReverbImpulse(context, seconds, decay) {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const distance = 1 - i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(distance, decay);
      }
    }
    return impulse;
  }

  function playNoise(duration, gain, options = {}) {
    const context = audioState.context;
    if (!context || !audioState.master) return;
    const seconds = Math.max(0.03, duration / 1000);
    const release = options.release ?? 0.06;
    const start = context.currentTime + Math.max(0, options.delay || 0);
    const bufferSeconds = seconds + release + 0.02;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * bufferSeconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner ? context.createStereoPanner() : null;
    source.buffer = buffer;
    filter.type = options.filterType || "bandpass";
    filter.frequency.setValueAtTime(options.filter || 1200, start);
    filter.Q.value = options.q ?? 0.8;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + (options.attack ?? 0.01));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds + release);
    source.connect(filter);
    filter.connect(envelope);
    if (panner) {
      panner.pan.setValueAtTime(options.pan || 0, start);
      envelope.connect(panner);
      connectAudioOutput(panner, options);
    } else {
      connectAudioOutput(envelope, options);
    }
    source.start(start);
    source.stop(start + bufferSeconds);
  }

  function playTone(frequency, duration, type = "triangle", gain = 0.05, options = {}) {
    const context = audioState.context;
    if (!context || !audioState.master) return;
    const resolvedFrequency = noteFrequency(frequency);
    if (!resolvedFrequency) return;

    const seconds = Math.max(0.035, duration / 1000);
    const start = context.currentTime + Math.max(0, options.delay || 0);
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner ? context.createStereoPanner() : null;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(resolvedFrequency, start);
    if (options.slideTo) {
      const slideFrequency = noteFrequency(options.slideTo);
      if (slideFrequency) oscillator.frequency.exponentialRampToValueAtTime(slideFrequency, start + seconds * 0.85);
    }
    if (options.detune) oscillator.detune.setValueAtTime(options.detune, start);

    filter.type = options.filterType || "lowpass";
    filter.frequency.setValueAtTime(options.filter || 2600, start);
    filter.Q.value = options.q ?? 0.7;

    const attack = options.attack ?? 0.012;
    const release = options.release ?? 0.12;
    const sustain = Math.max(0.0001, gain * (options.sustain ?? 0.68));
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + attack);
    envelope.gain.exponentialRampToValueAtTime(sustain, start + Math.max(attack + 0.012, seconds * 0.55));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds + release);

    oscillator.connect(filter);
    filter.connect(envelope);
    if (panner) {
      panner.pan.setValueAtTime(options.pan || 0, start);
      envelope.connect(panner);
      connectAudioOutput(panner, options);
    } else {
      connectAudioOutput(envelope, options);
    }
    oscillator.start(start);
    oscillator.stop(start + seconds + release + 0.035);
  }

  function connectAudioOutput(output, options = {}) {
    const destination = options.destination || audioState.sfxBus || audioState.master;
    output.connect(destination);
    if (options.delaySend && audioState.delay) {
      const send = audioState.context.createGain();
      send.gain.value = options.delaySend;
      output.connect(send);
      send.connect(audioState.delay);
    }
    if (options.reverbSend && audioState.reverb) {
      const send = audioState.context.createGain();
      send.gain.value = options.reverbSend;
      output.connect(send);
      send.connect(audioState.reverb);
    }
  }

  function noteFrequency(note) {
    if (typeof note === "number") return note;
    if (!note || note === "-") return 0;
    const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
    if (!match) return 0;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]];
    const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    const octave = Number(match[3]);
    const midi = (octave + 1) * 12 + base + accidental;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function playSfx(kind) {
    const context = ensureAudio();
    if (!context || !audioState.master) return;
    context.resume?.();
    const sfx = (options = {}) => ({ destination: audioState.sfxBus || audioState.master, ...options });
    if (kind === "battleStart") {
      playNoise(150, 0.05, sfx({ filterType: "bandpass", filter: 1150, q: 0.9, release: 0.1 }));
      playTone("D2", 190, "sawtooth", 0.078, sfx({ filter: 700, release: 0.12 }));
      setTimeout(() => playTone("A2", 180, "square", 0.064, sfx({ filter: 1250, pan: -0.16, release: 0.1 })), 80);
      setTimeout(() => playTone("D3", 220, "triangle", 0.074, sfx({ filter: 2600, pan: 0.16, delaySend: 0.1, reverbSend: 0.08, release: 0.18 })), 155);
    } else if (kind === "hit") {
      playTone(92, 95, "sawtooth", 0.135, sfx({ filter: 840, release: 0.07 }));
      playTone(58, 135, "square", 0.078, sfx({ filter: 460, release: 0.09 }));
      playNoise(92, 0.052, sfx({ filterType: "bandpass", filter: 1750, q: 1.2, release: 0.07 }));
      setTimeout(() => playNoise(42, 0.024, sfx({ filterType: "highpass", filter: 3600, release: 0.035 })), 34);
    } else if (kind === "slash") {
      playNoise(64, 0.038, sfx({ filterType: "highpass", filter: 4200, pan: -0.25, release: 0.04 }));
      playTone(360, 72, "sawtooth", 0.082, sfx({ filter: 3000, pan: -0.22, release: 0.055 }));
      setTimeout(() => playTone(152, 88, "square", 0.068, sfx({ filter: 950, pan: 0.2, release: 0.06 })), 34);
    } else if (kind === "spell") {
      [392, 587, 784].forEach((note, index) => {
        setTimeout(() => playTone(note, 150, "triangle", 0.058, sfx({ filter: 4800, delaySend: 0.18, reverbSend: 0.24, pan: index * 0.12 - 0.12 })), index * 45);
      });
    } else if (kind === "heal") {
      [523, 659, 880].forEach((note, index) => {
        setTimeout(() => playTone(note, 160, "sine", 0.05, sfx({ filter: 5200, reverbSend: 0.26, release: 0.17 })), index * 55);
      });
    } else if (kind === "enemy") {
      playNoise(100, 0.04, sfx({ filterType: "bandpass", filter: 880, pan: 0.18, release: 0.06 }));
      playTone(72, 105, "sawtooth", 0.095, sfx({ filter: 660, pan: 0.12, release: 0.06 }));
      setTimeout(() => playTone(118, 96, "square", 0.066, sfx({ filter: 1000, pan: -0.1, release: 0.06 })), 36);
    } else if (kind === "enemyHit") {
      playTone(70, 110, "square", 0.09, sfx({ filter: 620, release: 0.07 }));
      playNoise(84, 0.04, sfx({ filterType: "bandpass", filter: 1300, q: 1.1, release: 0.06 }));
    } else if (kind === "snore") {
      playTone(88, 260, "sine", 0.07, sfx({ filter: 360, release: 0.22, pan: 0.16 }));
      setTimeout(() => playTone(66, 240, "triangle", 0.054, sfx({ filter: 300, release: 0.2, pan: -0.08 })), 105);
      playNoise(180, 0.025, sfx({ filterType: "lowpass", filter: 520, release: 0.12 }));
    } else if (kind === "victory") {
      [523, 659, 784].forEach((note, index) => {
        setTimeout(() => playTone(note, 220, "triangle", 0.076, sfx({ filter: 5200, delaySend: 0.16, reverbSend: 0.2, release: 0.18 })), index * 85);
      });
    } else if (kind === "defeat") {
      playNoise(520, 0.085, sfx({ filterType: "lowpass", filter: 760, attack: 0.012, release: 0.28 }));
      [196, 131, 87].forEach((note, index) => {
        setTimeout(() => playTone(note, 320, index === 0 ? "sawtooth" : "square", 0.082 - index * 0.014, sfx({ filter: 980 - index * 180, pan: index % 2 ? -0.18 : 0.18, release: 0.22 })), index * 135);
      });
    } else if (kind === "click") {
      playTone(660, 45, "triangle", 0.035, sfx({ filter: 3600, release: 0.04 }));
    }
  }

  function enabledVisibleControls(root, selector) {
    return Array.from(root.querySelectorAll(selector)).filter((el) => {
      return !el.disabled && !el.classList.contains("is-hidden") && el.getClientRects().length > 0;
    });
  }

  function focusControl(control) {
    if (!control) return;
    requestAnimationFrame(() => control.focus({ preventScroll: true }));
  }

  function focusRelativeControl(controls, step) {
    if (!controls.length) return false;
    const current = controls.indexOf(document.activeElement);
    const next = current >= 0 ? (current + step + controls.length) % controls.length : 0;
    focusControl(controls[next]);
    return true;
  }

  function syncBattleFocus() {
    const battle = $("battle");
    if (!activeBattle || !battle || battle.classList.contains("is-hidden")) return;
    const active = document.activeElement;
    if (active && battle.contains(active) && !active.disabled && active.getClientRects().length > 0) return;
    focusControl(getBattleOptionControls()[0]);
  }

  function getBattleOptionControls() {
    const battle = $("battle");
    if (!battle) return [];
    return enabledVisibleControls(battle, [
      '.member-actions button[data-member-action="attack"]',
      '.member-actions button[data-member-action="skill"]',
      '.member-actions button[data-member-action="item"]',
      '.member-actions button[data-member-action="undo"]',
      ".battle-switch-row button",
      ".battle-actions button"
    ].join(", "));
  }

  function syncShopFocus() {
    const menu = $("menu-modal");
    if (!activeShopId || !menu || menu.classList.contains("is-hidden")) return;
    const active = document.activeElement;
    if (active && menu.contains(active) && (active.dataset?.shopBuy || active.dataset?.shopRest || active.dataset?.shopSell || active.dataset?.shopService) && !active.disabled) return;
    focusControl(getShopOptionControls()[0]);
  }

  function syncInnFocus() {
    const menu = $("menu-modal");
    if (!activeInnOffer || !menu || menu.classList.contains("is-hidden")) return;
    const active = document.activeElement;
    if (active && menu.contains(active) && (active.dataset?.innStay !== undefined || active.dataset?.innCancel !== undefined) && !active.disabled) return;
    focusControl(getInnOptionControls()[0]);
  }

  function getShopOptionControls() {
    const menu = $("menu-content");
    if (!menu) return [];
    return enabledVisibleControls(menu, "button[data-shop-buy], button[data-shop-rest], button[data-shop-sell], button[data-shop-service]");
  }

  function getInnOptionControls() {
    const menu = $("menu-content");
    if (!menu) return [];
    return enabledVisibleControls(menu, "button[data-inn-stay], button[data-inn-cancel]");
  }

  function handleOptionKeyboard(event) {
    if (!$("item-modal").classList.contains("is-hidden")) return false;
    if (event.target?.tagName === "SELECT" || event.target?.tagName === "INPUT") return false;
    if (activeInnOffer && !$("menu-modal").classList.contains("is-hidden")) {
      return handleLinearOptionKeyboard(event, getInnOptionControls());
    }
    if (activeShopId && !$("menu-modal").classList.contains("is-hidden")) {
      return handleLinearOptionKeyboard(event, getShopOptionControls());
    }
    if (activeBattle && !$("battle").classList.contains("is-hidden")) {
      return handleLinearOptionKeyboard(event, getBattleOptionControls());
    }
    return false;
  }

  function handleLinearOptionKeyboard(event, controls) {
    const stepByKey = {
      ArrowUp: -1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowRight: 1
    };
    const step = stepByKey[event.key];
    if (!step) return false;
    event.preventDefault();
    return focusRelativeControl(controls, step);
  }

  function handleTabKeyboard(event) {
    const tab = event.target?.closest?.('[role="tab"]');
    if (!tab) return false;
    const tabList = tab.closest('[role="tablist"]');
    const tabs = Array.from(tabList?.querySelectorAll('[role="tab"]') || []);
    if (!tabs.length) return false;
    const current = Math.max(0, tabs.indexOf(tab));
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return false;
    event.preventDefault();
    const nextId = tabs[next].id;
    tabs[next].click();
    requestAnimationFrame(() => $(nextId)?.focus({ preventScroll: true }));
    return true;
  }

  function bindEvents() {
    $("new-game").addEventListener("click", () => startNewGame());
    $("continue-game").addEventListener("click", continueGame);
    $("guide-title").addEventListener("click", openGuide);
    $("creator-title").addEventListener("click", openCreator);
    $("close-guide").addEventListener("click", closeGuide);
    $("close-creator").addEventListener("click", closeCreator);
    $("guide-content").addEventListener("click", (event) => {
      const sectionButton = event.target?.closest?.("[data-guide-section]");
      const section = sectionButton?.dataset?.guideSection;
      if (!section || !guideData[section] || section === activeGuideSection) return;
      activeGuideSection = section;
      loadGuideSectionAssets(section);
      renderGuideContent();
      requestAnimationFrame(() => $(`guide-tab-${section}`)?.focus({ preventScroll: true }));
    });
    $("music-title").addEventListener("click", toggleMusic);
    $("music-btn").addEventListener("click", toggleMusic);
    $("focus-toggle").addEventListener("click", toggleFocusMode);
    $("import-title").addEventListener("click", () => $("import-file").click());
    $("save-btn").addEventListener("click", () => {
      saveManualCheckpoint();
      say([["System", lastSaveMessage]]);
    });
    $("menu-btn").addEventListener("click", openMenu);
    $("hud-settings")?.addEventListener("click", () => {
      document.querySelector(".hud-more")?.removeAttribute("open");
      openMenu("settings");
    });
    $("mini-map-toggle")?.addEventListener("click", () => {
      const screen = $("game-screen");
      const expanded = !screen?.classList.contains("is-mini-map-expanded");
      screen?.classList.toggle("is-mini-map-expanded", expanded);
      $("mini-map-toggle")?.setAttribute("aria-expanded", String(expanded));
      $("mini-map-toggle").textContent = expanded ? "Collapse Map" : "Expand Map";
      renderMiniMap();
    });
    $("field-menu-btn")?.addEventListener("click", () => openMenu("inventory"));
    $("ending-continue").addEventListener("click", () => closeEndingScene(false));
    $("ending-sidequests").addEventListener("click", () => closeEndingScene(true));
    $("credits-toggle")?.addEventListener("click", toggleCreditsPaused);
    $("ending-scroll")?.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      toggleCreditsPaused();
    });
    $("close-menu").addEventListener("click", closeMenu);
    $("menu-content").addEventListener("click", (event) => {
      const tabButton = event.target?.closest?.("[data-menu-tab]");
      if (tabButton) {
        activeMenuTab = tabButton.dataset.menuTab;
        renderMenuContent();
        requestAnimationFrame(() => $(`menu-tab-${activeMenuTab}`)?.focus({ preventScroll: true }));
        return;
      }
      const questTrackButton = event.target?.closest?.("[data-track-quest]");
      if (questTrackButton) {
        setTrackedSideQuest(questTrackButton.dataset.trackQuest || null);
        renderMenuContent();
        return;
      }
      const jokeButton = event.target?.closest?.("[data-joke-level]");
      const selectedJokeLevel = jokeButton?.dataset?.jokeLevel;
      if (selectedJokeLevel) {
        setJokeLevel(selectedJokeLevel);
        return;
      }
      const movementButton = event.target?.closest?.("[data-movement-ms]");
      if (movementButton) {
        WALK_MS = numberInRange(movementButton.dataset.movementMs, 80, 240, WALK_MS);
        state.settings = sanitizeSettings({ ...state.settings, movementMs: WALK_MS });
        updateWalkDebugControl();
        saveLocal();
        renderMenuContent();
        return;
      }
      const battleSpeedButton = event.target?.closest?.("[data-battle-speed-setting]");
      if (battleSpeedButton) {
        battleSpeed = clamp(Number(battleSpeedButton.dataset.battleSpeedSetting) || 1.4, 0.8, 3);
        state.settings = sanitizeSettings({ ...state.settings, battleSpeed });
        applyPlayerSpeedSettings();
        saveLocal();
        renderMenuContent();
        return;
      }
      if (event.target?.closest?.("[data-fast-battle]")) {
        state.settings = sanitizeSettings({ ...state.settings, fastBattle: !fastBattleEnabled() });
        applyPlayerSpeedSettings();
        saveLocal();
        renderMenuContent();
        return;
      }
      const textSpeedButton = event.target?.closest?.("[data-text-speed]");
      if (textSpeedButton) {
        state.settings = sanitizeSettings({ ...state.settings, textSpeed: textSpeedButton.dataset.textSpeed });
        saveLocal();
        renderMenuContent();
        return;
      }
      const settingToggle = event.target?.closest?.("[data-setting-toggle]")?.dataset?.settingToggle;
      if (settingToggle) {
        if (settingToggle === "coaching") state.coaching.enabled = !state.coaching.enabled;
        else state.settings = sanitizeSettings({ ...state.settings, [settingToggle]: !state.settings[settingToggle] });
        applyPlayerSpeedSettings();
        saveLocal();
        renderMenuContent();
        return;
      }
      const advancedAction = event.target?.closest?.("[data-advanced-action]")?.dataset?.advancedAction;
      if (advancedAction) {
        if (advancedAction === "export") exportSave();
        else if (advancedAction === "import") $("import-file").click();
        else if (advancedAction === "creator") { closeMenu(); openCreator(); }
        else if (advancedAction === "restart") {
          const creatorRestart = state?.saveSlot === "creator";
          if (startNewGame({ creator: creatorRestart })) closeMenu();
        }
        return;
      }
      const shopButton = event.target?.closest?.("[data-shop-buy]");
      const item = shopButton?.dataset?.shopBuy;
      if (item) buyShopItem(item);
      const sellButton = event.target?.closest?.("[data-shop-sell]");
      if (sellButton?.dataset?.shopSell) sellShopItem(sellButton.dataset.shopSell);
      const serviceButton = event.target?.closest?.("[data-shop-service]");
      if (serviceButton?.dataset?.shopService) buyShopService(serviceButton.dataset.shopService);
      const restButton = event.target?.closest?.("[data-shop-rest]");
      const restShop = restButton?.dataset?.shopRest;
      if (restShop) restAtShopInn(restShop);
      const innStay = event.target?.closest?.("[data-inn-stay]");
      if (innStay) {
        confirmInnStay();
        return;
      }
      const innCancel = event.target?.closest?.("[data-inn-cancel]");
      if (innCancel) {
        cancelInnStay();
        return;
      }
      const equipButton = event.target?.closest?.("[data-equip-member][data-equip-slot][data-equip-name]");
      const equipMember = equipButton?.dataset?.equipMember;
      const equipSlot = equipButton?.dataset?.equipSlot;
      const equipName = equipButton?.dataset?.equipName;
      if (equipMember && equipSlot && equipName) equipGear(equipMember, equipSlot, equipName);
      const zoomSpellButton = event.target?.closest?.("[data-zoom-spell]");
      const zoomSpellDestination = zoomSpellButton?.dataset?.zoomSpell;
      if (zoomSpellDestination) {
        performZoomTravel(zoomSpellDestination, "spell");
        return;
      }
      const zoomItemButton = event.target?.closest?.("[data-zoom-item]");
      const zoomItemDestination = zoomItemButton?.dataset?.zoomItem;
      if (zoomItemDestination) {
        performZoomTravel(zoomItemDestination, "item");
        return;
      }
      const encounterModeButton = event.target?.closest?.("[data-encounter-dial-mode]");
      const encounterMode = encounterModeButton?.dataset?.encounterDialMode;
      if (encounterMode) {
        setEncounterStepInterval(encounterMode === "off" ? 0 : null);
        return;
      }
      const encounterApplyButton = event.target?.closest?.("[data-encounter-dial-apply]");
      if (encounterApplyButton) {
        setEncounterStepInterval($("menu-content").querySelector("#encounter-dial-steps")?.value);
        return;
      }
      if (event.target?.closest?.("[data-replay-ending]")) {
        closeMenu();
        playEndingSequence();
        return;
      }
      const fieldButton = event.target?.closest?.("[data-field-item][data-field-target]");
      const fieldItem = fieldButton?.dataset?.fieldItem;
      const fieldTarget = fieldButton?.dataset?.fieldTarget;
      if (fieldItem && fieldTarget) useFieldItem(fieldItem, fieldTarget);
      const switchButton = event.target?.closest?.("[data-party-switch]");
      const partySwitch = switchButton?.dataset?.partySwitch;
      if (partySwitch) {
        const target = $("menu-content").querySelector(`[data-party-switch-select="${partySwitch}"]`)?.value;
        if (target && !switchActivePartyMember(partySwitch, target)) {
          menuMessage = "That lineup switch is not available right now.";
          renderMenuContent();
        }
      }
    });
    $("menu-content").addEventListener("change", (event) => {
      const key = event.target?.dataset?.settingRange;
      if (!key) return;
      state.settings = sanitizeSettings({ ...state.settings, [key]: Number(event.target.value) });
      applyAudioSettings();
      saveLocal();
      renderMenuContent();
    });
    $("menu-guide").addEventListener("click", openGuide);
    $("menu-save").addEventListener("click", () => {
      if (!saveManualCheckpoint()) return;
      const button = $("menu-save");
      button.textContent = "Saved \u2713";
      window.setTimeout(() => {
        if (button) button.textContent = "Save Browser Slot";
      }, 1400);
    });
    $("dialogue-next").addEventListener("click", nextDialogue);
    $("cutscene-skip")?.addEventListener("click", finishCutscene);
    $("item-modal-equip")?.addEventListener("click", () => {
      const equip = itemModalEquipAction;
      itemModalEquipAction = null;
      if (equip) equip();
      closeItemRewardModal();
    });
    $("item-modal-close").addEventListener("click", closeItemRewardModal);
    $("coach-close").addEventListener("click", () => closeCoach(false));
    $("coach-disable").addEventListener("click", () => closeCoach(true));
    $("import-file").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) importSave(file);
      event.target.value = "";
    });
    $("creator-content").addEventListener("change", (event) => {
      const target = event.target;
      if (!target?.dataset?.creatorToggle || !state) return;
      state.creator = creatorState(state.creator || {});
      const key = target.dataset.creatorToggle;
      state.creator[key] = Boolean(target.checked);
      if (key !== "enabled" && target.checked) state.creator.enabled = true;
      if (state.creator.infiniteHp || state.creator.infiniteMp) restoreCreatorVitals();
      creatorMessage = `${target.closest("label")?.querySelector("strong")?.textContent || key} ${target.checked ? "enabled" : "disabled"}.`;
      render();
      saveLocal();
    });
    $("creator-content").addEventListener("click", (event) => {
      const action = event.target?.dataset?.creatorAction;
      if (action) handleCreatorAction(action);
    });
    const mobileControls = $("mobile-controls");
    mobileControls?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      mobileControls.setPointerCapture?.(event.pointerId);
      mobileControls.classList.add("is-pressed");
      updateCompassFromPointer(mobileControls, event);
    });
    mobileControls?.addEventListener("pointermove", (event) => {
      if (!mobileControls.classList.contains("is-pressed")) return;
      event.preventDefault();
      updateCompassFromPointer(mobileControls, event);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      mobileControls?.addEventListener(eventName, (event) => {
        resetCompass(mobileControls);
        if (event.pointerType && event.pointerType !== "mouse") {
          requestAnimationFrame(() => {
            const focused = document.activeElement;
            if (focused?.classList?.contains("compass-button") && mobileControls.contains(focused)) focused.blur();
          });
        }
      });
    });
    document.querySelectorAll(".mobile-controls button").forEach((button) => {
      button.addEventListener("click", () => {
        const dir = button.dataset.dir;
        if (advanceDialogueWithMove()) return;
        const [dx, dy] = DIRS[dir];
        requestMove(dx, dy);
      });
    });
    document.querySelectorAll(".battle-actions button").forEach((button) => {
      button.addEventListener("click", () => battleAction(button.dataset.action));
    });
    $("battle-party").addEventListener("click", (event) => {
      const switchButton = event.target?.closest?.("[data-battle-switch]");
      const switchMemberId = switchButton?.dataset?.battleSwitch;
      if (switchMemberId) {
        const row = switchButton.closest(".battle-switch-row");
        const switchId = row?.querySelector(`[data-battle-switch-select="${switchMemberId}"]`)?.value;
        if (switchId) queueMemberAction(switchMemberId, "switch", { switchId });
        return;
      }
      const action = event.target?.dataset?.memberAction;
      const memberId = event.target?.dataset?.memberId;
      if (action && memberId) {
        if (action === "undo") {
          undoMemberAction(memberId);
          return;
        }
        const card = event.target.closest(".party-card");
        const skillId = card?.querySelector(`[data-skill-select="${memberId}"]`)?.value;
        const itemId = card?.querySelector(`[data-item-select="${memberId}"]`)?.value;
        const skill = skillCatalog[skillId];
        const item = battleItemCatalog[itemId];
        const allyTarget = card?.querySelector(`[data-ally-target-select="${memberId}"]`)?.value;
        const enemyTarget = card?.querySelector(`[data-enemy-target-select="${memberId}"]`)?.value;
        const usesAlly = action === "skill"
          ? ["heal", "revive"].includes(skill?.type)
          : action === "item" && ["heal", "mp", "revive", "kokhor"].includes(item?.type);
        queueMemberAction(memberId, action, { skillId, itemId, targetId: usesAlly ? allyTarget : enemyTarget });
      }
    });
    $("battle-speed").addEventListener("input", (event) => {
      battleSpeed = clamp(Number(event.target.value) || 1.4, 0.8, 3);
      if (state) state.settings = sanitizeSettings({ ...state.settings, battleSpeed });
      $("battle-speed-value").textContent = `${battleSpeed.toFixed(1)}x${fastBattleEnabled() ? " Fast" : ""}`;
      if (state) saveLocal();
      if (activeBattle?.auto) scheduleAutoBattle();
    });
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && isFocusMode()) setFocusMode(false, false);
    });
    window.addEventListener("keydown", (event) => {
      if (handleTabKeyboard(event)) return;
      if (trapDialogFocus(event)) return;
      if (handleOptionKeyboard(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!$("coach-modal").classList.contains("is-hidden")) closeCoach(false);
        else if (!$("item-modal").classList.contains("is-hidden")) closeItemRewardModal();
        else if (endingSceneVisible()) closeEndingScene(false);
        else if (isFocusMode()) setFocusMode(false, true);
        else if (!$("creator-modal").classList.contains("is-hidden")) closeCreator();
        else if (!$("guide-modal").classList.contains("is-hidden")) closeGuide();
        else if (!$("menu-modal").classList.contains("is-hidden")) closeMenu();
        else if (dialogueVisible() || cutsceneActive || transitionPending()) return;
        else if (event.target && ["INPUT", "BUTTON", "SELECT"].includes(event.target.tagName)) return;
        else if (state && $("game-screen").classList.contains("is-hidden") === false) openMenu();
        return;
      }
      if (MOVE_KEY_DELTAS[event.key] && dialogueVisible()) {
        event.preventDefault();
        if (!event.repeat) advanceDialogueWithMove();
        return;
      }
      if (event.target && ["INPUT", "BUTTON", "SELECT"].includes(event.target.tagName)) return;
      if (!$("item-modal").classList.contains("is-hidden") && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        closeItemRewardModal();
        return;
      }
      if (MOVE_KEY_DELTAS[event.key]) {
        event.preventDefault();
        if (advanceDialogueWithMove()) return;
        const [dx, dy] = MOVE_KEY_DELTAS[event.key];
        trackMoveKeyDown(event.key, dx, dy);
        requestMove(dx, dy);
      } else if (event.key === " " || event.key === "Enter") {
        if (activeBattle?.reward) {
          event.preventDefault();
          confirmBattleReward();
        } else if (!$("dialogue").classList.contains("is-hidden")) {
          event.preventDefault();
          nextDialogue();
        }
      } else if (event.key === "f" || event.key === "F") {
        if (state && !$("game-screen").classList.contains("is-hidden")) {
          event.preventDefault();
          toggleFocusMode();
        }
      }
    });
    window.addEventListener("keyup", (event) => {
      if (MOVE_KEY_DELTAS[event.key]) trackMoveKeyUp(event.key);
    });
    window.addEventListener("blur", clearHeldMove);
    window.addEventListener("resize", () => {
      markRenderDirty("map", "world", "battle", "guide");
      renderVisibleSurfaces();
    });
  }

  function init() {
    applyGameMetadata();
    bindEvents();
    const hasSave = Boolean(loadLocal());
    $("continue-game").disabled = !hasSave;
    updateFocusButton();
    updateMusicButtons();
    updateWalkDebugControl();
    startRenderLoop();
    window.DreamQuestDebug = {
      getState: () => structuredClone(state),
      getMapViewport: () => {
        const canvas = $("map-canvas");
        if (!state || !canvas || !elementVisible(canvas)) return null;
        const rect = canvas.getBoundingClientRect();
        const point = mapCanvasPointForTile(canvas, state);
        const x = rect.left + point.x;
        const y = rect.top + point.y;
        return { x, y, scrollY: window.scrollY, ...viewportBoundsForMapPoint(x) };
      },
      getPlayTimeMs: () => currentPlayTimeMs(),
      isTransitionPending: transitionPending,
      getUiRuntime: () => ({
        activeDialog: activeManagedDialogId,
        cutsceneActive,
        dialogueVisible: dialogueVisible(),
        pendingEquipmentOffers: structuredClone(pendingEquipmentOffers)
      }),
      getBattle: () => JSON.parse(JSON.stringify(activeBattle, (key, value) => typeof value === "function" ? undefined : value)),
      getEncounterBuffer: () => ({
        safeSteps: RANDOM_ENCOUNTER_SAFE_STEPS,
        lastBattleStep: Number.isFinite(lastBattleStep) ? lastBattleStep : null,
        stepsSinceLastBattle: stepsSinceLastBattle(),
        active: randomEncounterBufferActive(),
        encounterDial: {
          unlocked: hasEncounterDial(),
          interval: encounterDialInterval(),
          status: encounterDialStatus()
        }
      }),
      travelTo: (id, x = undefined, y = undefined) => travelTo(id, x, y),
      setPartyMembers: (ids) => {
        if (!state || !Array.isArray(ids)) return false;
        setParty(ids);
        render();
        return true;
      },
      setActivePartyIds: (ids) => {
        if (!state || !Array.isArray(ids)) return false;
        state.activePartyIds = sanitizeActivePartyIds(ids, state.party);
        render();
        return true;
      },
      setMemberLevel: (id, level) => {
        const member = memberById(id);
        if (!member) return false;
        member.level = numberInRange(level, 1, SAVE_LIMITS.maxLevel, member.level);
        render();
        return true;
      },
      setMemberXp: (id, xp) => {
        const member = memberById(id);
        if (!member) return false;
        member.xp = numberInRange(xp, 0, SAVE_LIMITS.maxGold, member.xp);
        return true;
      },
      getAvailableSkills: (id) => {
        const member = memberById(id);
        return member ? availableSkills(member).map((skill) => ({ ...skill })) : [];
      },
      getAutoChoice: (id) => {
        const member = memberById(id);
        return member && activeBattle ? structuredClone(normalizeBattleChoice(chooseAutoAction(member), member)) : null;
      },
      startBattle: (id) => startBattle(id),
      triggerFearYanWarning: () => maybeFearYanRunWarning(),
      queueMemberAction,
      undoMemberAction,
      executeBattleTurn,
      equipGear,
      addParty,
      addItem,
      setEnemyHp: (index, hp) => {
        const enemy = activeBattle?.enemies?.[Number(index)];
        if (!enemy) return false;
        enemy.hp = numberInRange(hp, 0, enemy.maxHp, enemy.hp);
        renderBattle();
        return true;
      },
      setEnemyStun: (index, turns = 1) => {
        const enemy = activeBattle?.enemies?.[Number(index)];
        if (!enemy) return false;
        enemy.stunnedTurns = numberInRange(turns, 0, 9, 0);
        renderBattle();
        return true;
      },
      setEnemyDefense: (index, defense) => {
        const enemy = activeBattle?.enemies?.[Number(index)];
        if (!enemy) return false;
        enemy.def = numberInRange(defense, 0, SAVE_LIMITS.maxStat, enemy.def);
        return true;
      },
      partyDefeated,
      endBattle: () => {
        endBattle();
        return true;
      },
      triggerEventById: (id) => {
        const event = currentEvents().find((candidate) => candidate.id === id);
        if (!event) return false;
        triggerEvent(event);
        return true;
      },
      say,
      showCutscene,
      getEventMotion: (id) => {
        const event = currentEvents().find((candidate) => candidate.id === id);
        if (!event || !eventShouldRender(event) || eventKind(event) !== "npc") return null;
        return structuredClone(npcMotion(event));
      },
      getEventPatrolTiles: (id) => {
        const event = currentEvents().find((candidate) => candidate.id === id);
        if (!event || !eventShouldRender(event) || eventKind(event) !== "npc") return null;
        return structuredClone(npcPatrolTiles(event));
      },
      getCharacterFrameDebug: (id, facing = "down", elapsed = 9999, options = {}) => {
        const [col, row, baseMirrored = false] = characterSheetCell(id, facing, elapsed, options);
        return {
          col,
          row,
          mirrored: characterSheetFrameMirrored(id, facing, col, row, baseMirrored),
          crop: { ...characterSheetCropFor(id, row, col) },
          clipBottomRatio: characterSheetFrameClipBottom(id, row, "battle", 100) / 100
        };
      },
      getMiniMapDebug: () => {
        const group = areaMiniMapGroupFor(state?.areaId || "");
        const entries = group ? miniMapVisibleBoardEntries(group, state?.areaId || "") : [[state?.areaId || "", {}]];
        return {
          areaId: state?.areaId || "",
          groupTitle: group?.title || "Area map",
          boardIds: entries.map(([id]) => id),
          totalGroupBoards: group ? Object.keys(group.boards || {}).length : 1
        };
      },
      getBattleEnemyLayoutDebug: () => {
        const canvas = $("battle-stage");
        if (!canvas || !activeBattle) return [];
        return battleEnemyLayouts(logicalCanvasSize(canvas), livingEnemies()).map((layout) => ({
          id: layout.enemyId,
          x: Math.round(layout.x),
          y: Math.round(layout.y),
          scale: Number(layout.scale.toFixed(3)),
          left: Math.round(layout.left),
          right: Math.round(layout.right),
          top: Math.round(layout.top),
          bottom: Math.round(layout.bottom),
          width: Math.round(layout.width),
          height: Math.round(layout.height)
        }));
      },
      isAssetReady: (key) => imageReady(key),
      canReachTile: (targetX, targetY) => {
        if (!state) return false;
        const target = `${Number(targetX)},${Number(targetY)}`;
        const seen = new Set([`${state.x},${state.y}`]);
        const queue = [{ x: state.x, y: state.y }];
        for (let i = 0; i < queue.length; i += 1) {
          const current = queue[i];
          if (`${current.x},${current.y}` === target) return true;
          Object.values(DIRS).forEach(([dx, dy]) => {
            const currentChar = area().map[current.y]?.[current.x];
            if (waterBridgeAt(area().map, current.x, current.y, currentChar) && !bridgeExitAllowed(area().map, current.x, current.y, dx, dy)) return;
            const nextX = current.x + dx;
            const nextY = current.y + dy;
            if (!tilePassable(nextX, nextY, dx, dy)) return;
            const key = `${nextX},${nextY}`;
            if (seen.has(key)) return;
            seen.add(key);
            queue.push({ x: nextX, y: nextY });
          });
        }
        return false;
      },
      getMusicDebug: () => ({
        playing: audioState.playing,
        enabled: audioState.enabled,
        theme: audioState.theme,
        timerActive: false,
        trackKey: audioState.trackKey,
        playlist: [...audioState.playlist],
        playlistIndex: audioState.playlistIndex,
        currentTime: Number(audioState.trackAudio?.currentTime || 0),
        trackVolume: Number(audioState.trackAudio?.volume || 0),
        themeTrackKeys: { ...audioState.themeTrackKeys },
        loadedTrackKeys: Object.keys(audioState.trackElements),
        activeTrackKeys: Object.entries(audioState.trackElements)
          .filter(([, audio]) => audio && !audio.paused)
          .map(([key]) => key),
        advancePlaylist: () => advanceMusicPlaylist(),
        failCurrentTrack: () => failMusicTrack(audioState.trackKey, audioState.trackAudio),
        failTrack: (trackKey) => failMusicTrack(trackKey, audioState.trackElements[trackKey])
      }),
      openMenu,
      closeMenu,
      useFieldItem,
      loadLocal,
      normalizeState,
      setInventoryItem: (name, count) => {
        if (!state || !knownInventoryNames().has(name)) return false;
        if (count > 0) state.inventory[name] = numberInRange(count, 1, SAVE_LIMITS.maxInventoryCount, 1);
        else delete state.inventory[name];
        render();
        return true;
      },
      setPartyVitals: (id, hp, mp = null) => {
        const member = memberById(id);
        if (!member) return false;
        member.hp = numberInRange(hp, 0, member.maxHp, member.hp);
        if (mp !== null) member.mp = numberInRange(mp, 0, member.maxMp, member.mp);
        render();
        return true;
      },
      setCreatorFlags: (flags) => {
        if (!state || !isPlainObject(flags)) return false;
        state.creator = creatorState({
          ...state.creator,
          ...flags,
          enabled: hasOwn(flags, "enabled") ? Boolean(flags.enabled) : true
        });
        restoreCreatorVitals();
        render();
        return true;
      },
      setStoryFlag: (name, enabled = true) => {
        if (!state || typeof name !== "string") return false;
        if (enabled) flag(name);
        else delete state.flags[name];
        render();
        return true;
      },
      setCompletedEvent: (id, completed = true) => {
        if (!state || typeof id !== "string") return false;
        if (completed) state.completedEvents[id] = true;
        else delete state.completedEvents[id];
        render();
        return true;
      },
      setGold: (gold) => {
        if (!state) return false;
        state.gold = numberInRange(gold, 0, SAVE_LIMITS.maxGold, state.gold);
        render();
        return true;
      },
      setEncounterStepInterval,
      getEncounterControl: () => ({
        unlocked: hasEncounterDial(),
        interval: encounterDialInterval(),
        status: encounterDialStatus()
      }),
      setJokeLevel,
      getSettings: () => sanitizeSettings(state?.settings),
      previewDialogueText: dialogueTextForCurrentJokeLevel,
      previewAreaIntro: areaIntro,
      getQuestJournal: () => {
        syncQuestJournal();
        return endingSideQuests.map((quest) => ({ ...quest, status: sideQuestStatus(quest), guidance: sideQuestGuidance(quest), tracked: state.questJournal.trackedId === quest.id, discovered: questIsDiscovered(quest) }));
      },
      getQuestText: questText,
      setTrackedSideQuest,
      setCoachingEnabled: (enabled) => {
        if (!state) return false;
        state.coaching.enabled = Boolean(enabled);
        if (!enabled) {
          coachingQueue.length = 0;
          if (visibleElement("coach-modal")) closeCoach(false);
        }
        saveLocal();
        return true;
      },
      resetCoaching: () => {
        if (!state) return false;
        state.coaching = { enabled: true, seen: {} };
        coachingQueue.length = 0;
        if (visibleElement("coach-modal")) closeCoach(false);
        saveLocal();
        return true;
      },
      showCoach: coach,
      getInventoryCategory: inventoryCategory,
      getLocalObjectiveDirection: localObjectiveDirection,
      getLocalObjectiveDebug: () => {
        const objective = localObjectiveResult();
        if (!objective) return null;
        const { event, route } = objective;
        const target = objectiveTargetTile(event);
        return {
          id: event.id,
          x: target.x,
          y: target.y,
          distance: route.distance,
          firstDirection: route.firstDx < 0 ? "west" : route.firstDx > 0 ? "east" : route.firstDy < 0 ? "north" : route.firstDy > 0 ? "south" : "beside"
        };
      },
      setSettings: (overrides) => {
        if (!state || !isPlainObject(overrides)) return false;
        state.settings = sanitizeSettings({ ...state.settings, ...overrides });
        applyPlayerSpeedSettings();
        render();
        return true;
      },
      getEffectiveBattleSpeed: effectiveBattleSpeed,
      setWalkMs: (ms) => {
        WALK_MS = clamp(Number(ms), 80, 240);
        if (state) state.settings = sanitizeSettings({ ...state.settings, movementMs: WALK_MS });
        updateWalkDebugControl();
      },
      getWalkMs: () => WALK_MS,
      saveLocal,
      freshState
    };
  }

  function mapMovementAnimating() {
    if (!state) return false;
    return state.steps > 0 && Date.now() - (state.movedAt || 0) < WALK_MS + 40;
  }

  function mapEffectAnimating() {
    return Boolean(mapEffect && mapEffect.areaId === state?.areaId);
  }

  function currentAreaHasAnimatedMapSurface() {
    if (!state || reducedMotionEnabled()) return false;
    if (area().map.some((row) => row.includes("~"))) return true;
    return currentEvents().some((event) => {
      if (event.hidden || !eventShouldRender(event)) return false;
      return ["npc", "boss", "shopSign", "door"].includes(eventKind(event));
    });
  }

  function guideHasAnimatedImages() {
    return !reducedMotionEnabled() && Boolean($("guide-content")?.querySelector(".guide-image[data-guide-animated]"));
  }

  function requestRenderLoop(delay = 0) {
    if (document.hidden) return;
    if (renderLoopTimer !== null) {
      if (delay > 0) return;
      clearTimeout(renderLoopTimer);
    }
    renderLoopTimer = window.setTimeout(() => {
      renderLoopTimer = null;
      requestAnimationFrame(renderFrame);
    }, Math.max(0, delay));
  }

  function renderFrame() {
    if (document.hidden) return;
    let nextDelay = null;
    if (state && visibleElement("game-screen")) {
      if ((heldMoveDx || heldMoveDy) && !mapMovementAvailable()) clearHeldMove();
      else if ((heldMoveDx || heldMoveDy) && mapMovementAvailable()) requestMove(heldMoveDx, heldMoveDy);

      const moving = mapMovementAnimating() || Boolean(heldMoveDx || heldMoveDy);
      const mapEffectActive = mapEffectAnimating();
      // Do not spend animation frames on scenery hidden beneath combat or a modal.
      const ambientMap = mapMovementAvailable() && currentAreaHasAnimatedMapSurface();
      if (renderDirty.map || moving || mapEffectActive || ambientMap) {
        renderMap();
        renderDirty.map = false;
      }
      if (renderDirty.world && visibleElement("menu-modal") && activeMenuTab === "map") {
        renderWorldMap("menu-world-canvas");
        renderDirty.world = false;
      }
      const battleAnimating = Boolean(activeBattle && currentBattleEffect());
      if (activeBattle && visibleElement("battle") && (renderDirty.battle || battleAnimating)) {
        drawBattleStage();
        renderDirty.battle = false;
      }
      if (moving || mapEffectActive || battleAnimating) nextDelay = 16;
      else if (ambientMap) nextDelay = 125;
    }
    const animatedGuide = visibleElement("guide-modal") && guideHasAnimatedImages();
    if (visibleElement("guide-modal") && (renderDirty.guide || animatedGuide)) {
      drawGuideImages(!renderDirty.guide);
      renderDirty.guide = false;
    }
    if (animatedGuide && (nextDelay === null || nextDelay > 250)) nextDelay = 250;
    if (nextDelay !== null) requestRenderLoop(nextDelay);
  }

  function startRenderLoop() {
    if (renderLoopStarted) return;
    renderLoopStarted = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        commitActivePlayTime();
        if (renderLoopTimer !== null) {
          clearTimeout(renderLoopTimer);
          renderLoopTimer = null;
        }
      } else if (!document.hidden) {
        resumeActivePlayTime();
        markRenderDirty("map", "world", "battle", "guide");
      }
    });
    reducedMotionQuery?.addEventListener?.("change", () => {
      if (state) applyPlayerSpeedSettings();
      markRenderDirty("map", "battle", "guide");
    });
    requestRenderLoop();
  }

  init();
})();
