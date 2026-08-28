(() => {
  "use strict";

  const noop = () => {};

  window.DreamQuestGameDataFactory = (engine = {}) => {
    const {
      addGold = noop,
      addItem = noop,
      addParty = noop,
      flag = noop,
      hasFlag = () => false,
      openShop = noop,
      playTustorResurrection = noop,
      playWaterOrbTransition = noop,
      removeParty = noop,
      say = noop,
      setMode = noop,
      setParty = noop,
      showCutscene = noop,
      showEndingScene = noop,
      startYvonneYvetteBattle = noop,
      stayAtInn = noop,
      stealTealsburgLoot = noop,
      travelTo = noop
    } = engine;

    const gameConfig = {
      id: "dreamquest",
      title: "DreamQuest RPG",
      rolePlayingLabel: "DreamQuest Role Playing Game",
      tagline: "A browser quest rebuilt from the 2003 RPG Toolkit plan.",
      guideTitle: "Complete DreamQuest Guide",
      saveKey: "daranor-dreamquest-save-v1",
      saveVersion: 8,
      exportFileName: "dreamquest-save.json",
      startAreaId: "darhynCastle",
      startPartyIds: ["tarthur"],
      startInventory: { Potion: 3 },
      startGold: 0,
      endingTransitionId: "darhyn_final",
      endingReplay: "dreamquest",
      areaBannerDirectory: "assets/generated/banners",
      defaultGuideSection: "route",
      shell: {
        favicon: "assets/generated/favicon.png",
        faviconType: "image/png",
        titleArt: "assets/generated/dreamquest-title-runtime.webp",
        titleArtMobile: "assets/generated/dreamquest-title-mobile-runtime.webp",
        titleWordmark: "assets/generated/dreamquest-wordmark-og-runtime.webp",
        titleCovers: [
          { src: "assets/generated/title-covers/dreamquest-mobile.jpg", alt: "DreamQuest cover art" },
          { src: "assets/generated/title-covers/prophecyquest-mobile.jpg", alt: "ProphecyQuest cover art" },
          { src: "assets/generated/title-covers/swordquest-mobile.jpg", alt: "SwordQuest cover art" }
        ],
        endingArt: "assets/generated/cutscenes/darhyn-falls.jpg",
        ending: {
          kicker: "DreamQuest Complete",
          title: "Darhyn Falls",
          copy: "The Water Orb is safe, Yan's wind still moves over Daranor, and unfinished stories are still waiting off the main road."
        }
      }
    };

    const jokeText = (low, normal, high = normal) => ({ low, normal, high });
    const waterOrbAcquisitionText = jokeText(
      "The chest holds no physical Orb. It contains a Water Orb Spell and the blue focus used to channel it.",
      "The chest holds a Water Orb Spell and matching focus—not the Orb itself. The glowing script feels like an imprint left behind by something far away.",
      "The chest holds a Water Orb Spell and matching focus—not the Orb itself. A note in glowing ink reads: 'Accept no substitute, except temporarily this substitute.'"
    );

    const assets = {
      tilesheet: "assets/generated/dreamquest-tilesheet-v2.png",
      tilesheetVillage: "assets/generated/dreamquest-tilesheet-v3.png",
      tilesheetWilds: "assets/generated/dreamquest-tilesheet-v4.png",
      tilesheetCastle: "assets/generated/dreamquest-tilesheet-castle.png",
      tilesheetShoals: "assets/generated/dreamquest-tilesheet-shoals.png",
      chestSprite: "assets/generated/dreamquest-chest.png",
      battleMeadow: "assets/generated/battle/wide/meadow.jpg",
      battleCastle: "assets/generated/battle/wide/castle.jpg",
      battleShoals: "assets/generated/battle/wide/shoals.jpg",
      battleMountain: "assets/generated/battle/wide/mountain.jpg",
      battleDarhynCastle: "assets/generated/battle/wide/darhynCastle.jpg",
      battleKrendon: "assets/generated/battle/wide/krendon.jpg",
      battleKrendonRoad: "assets/generated/battle/wide/krendonRoad.jpg",
      battleOldMill: "assets/generated/battle/wide/oldMill.jpg",
      battleHawkMountains: "assets/generated/battle/wide/hawkMountains.jpg",
      battleHawkSwitchback: "assets/generated/battle/wide/hawkSwitchback.jpg",
      battleSkyShrine: "assets/generated/battle/wide/skyShrine.jpg",
      battleMerfolkShoals: "assets/generated/battle/wide/merfolkShoals.jpg",
      battleTideCavern: "assets/generated/battle/wide/tideCavern.jpg",
      battleGrassland: "assets/generated/battle/wide/grassland.jpg",
      battleMoonMarsh: "assets/generated/battle/wide/moonMarsh.jpg",
      battleMarhynCastle: "assets/generated/battle/wide/marhynCastle.jpg",
      battleForest: "assets/generated/battle/wide/forest.jpg",
      battleDeepForest: "assets/generated/battle/wide/deepForest.jpg",
      battleFreeton: "assets/generated/battle/wide/freeton.jpg",
      battleKingsHighway: "assets/generated/battle/wide/kingsHighway.jpg",
      battleTealsburg: "assets/generated/battle/wide/tealsburg.jpg",
      battleMarketMaze: "assets/generated/battle/wide/marketMaze.jpg",
      battleNorthernPath: "assets/generated/battle/wide/northernPath.jpg",
      battleBreshen: "assets/generated/battle/wide/breshen.jpg",
      battleSavannah: "assets/generated/battle/wide/savannah.jpg",
      battleGlassCaves: "assets/generated/battle/wide/glassCaves.jpg",
      battleRathskellerApproach: "assets/generated/battle/wide/rathskellerApproach.jpg",
      battleRathskeller: "assets/generated/battle/wide/rathskeller.jpg",
      vsLogo: "assets/og/vs-relic.jpg",
      heroAtlas: "assets/generated/dreamquest-hero-atlas.png",
      enemyAtlas: "assets/generated/dreamquest-enemy-atlas.png?v=20260508-darhyn-clean2",
      hanoEnemy: "assets/generated/enemies/hano.png?v=20260525-lod-reference",
      corizazEnemy: "assets/generated/enemies/corizaz.png?v=20260525-lod-reference",
      guideIcons: "assets/generated/dreamquest-item-atlas.png?v=20260525-item-atlas-grid",
      vsArmorIcon: "assets/generated/vs-armor-icon.png?v=20260525-imagegen",
      spellAtlas: "assets/generated/dreamquest-spell-atlas.png?v=20260525-spell-atlas",
      portraitAtlas: "assets/generated/dreamquest-portrait-atlas.png?v=20260523-encyclopedia-pass",
      marhynPortrait: "assets/generated/characters/marhyn-profile.png?v=20260523-profile",
      litharPortrait: "assets/generated/characters/lithar-profile.png?v=20260525-profile",
      darhynPortrait: "assets/generated/characters/darhyn-profile.png?v=20260525-profile",
      narratorIcon: "assets/generated/dreamquest-narrator-icon.png",
      tealsburgThrone: "assets/generated/props/tealsburg-throne.png?v=20260525-imagegen",
      tarthurSheet: "assets/generated/sprites/tarthur-sheet.png?v=20260522-sprite-cleanup",
      derlinSheet: "assets/generated/sprites/derlin-sheet.png?v=20260522-sprite-cleanup",
      dalinSheet: "assets/generated/sprites/dalin-sheet.png?v=20260525-dalin-overflow-fix",
      yanSheet: "assets/generated/sprites/yan-sheet.png?v=20260525-yan-cloak-fix",
      yanOldSheet: "assets/generated/sprites/yan-old-sheet.png?v=20260525-fringe-clean",
      yvonneSheet: "assets/generated/sprites/yvonne-sheet.png?v=20260522-sprite-cleanup",
      yvetteSheet: "assets/generated/sprites/yvette-sheet.png?v=20260523-encyclopedia-pass",
      yanDragon: "assets/generated/sprites/yan-dragon-red.png?v=20260508-red-dragon",
      valenaSheet: "assets/generated/sprites/valena-sheet.png?v=20260523-encyclopedia-pass",
      zelinSheet: "assets/generated/sprites/zelin-sheet.png?v=20260522-sprite-cleanup",
      mortySheet: "assets/generated/sprites/morty-sheet.png?v=20260522-sprite-cleanup",
      marthaSheet: "assets/generated/sprites/martha-sheet.png?v=20260522-sprite-cleanup",
      scribeSheet: "assets/generated/sprites/scribe-sheet.png?v=20260522-sprite-cleanup",
      minerSheet: "assets/generated/sprites/miner-sheet.png?v=20260522-sprite-cleanup",
      kandanSheet: "assets/generated/sprites/kandan-sheet.png?v=20260522-sprite-cleanup",
      elvenKingSheet: "assets/generated/sprites/elven-king-sheet.png?v=20260522-sprite-cleanup",
      kingGarkinSheet: "assets/generated/sprites/king-garkin-sheet.png?v=20260525-purple-throne",
      sirStephenSheet: "assets/generated/sprites/sir-stephen-sheet.png?v=20260522-sprite-cleanup",
      corizazSheet: "assets/generated/sprites/corizaz-sheet.png?v=20260522-sprite-cleanup",
      chairmanEorSheet: "assets/generated/sprites/chairman-eor-sheet.png?v=20260522-sprite-cleanup",
      merwizardSheet: "assets/generated/sprites/merwizard-sheet-v2.png?v=20260524-blue-skin",
      marhynSheet: "assets/generated/sprites/queen-marhyn-sheet.png?v=20260522-sprite-cleanup",
      daranorMap: "assets/generated/daranor-map-restored.png?v=20260711-retina",
      dreamCover: "assets/generated/title-covers/dreamquest-mobile.jpg",
      prophecyCover: "assets/generated/title-covers/prophecyquest-mobile.jpg",
      swordCover: "assets/generated/title-covers/swordquest-mobile.jpg",
      cutsceneWaterOrbWarp: "assets/generated/cutscenes/water-orb-warp.jpg",
      cutsceneKrendonWake: "assets/generated/cutscenes/krendon-wake.jpg",
      cutsceneTustorResurrection: "assets/generated/cutscenes/tustor-resurrection.jpg",
      cutsceneLitharAmbush: "assets/generated/cutscenes/lithar-ambush.jpg",
      cutsceneMarhynCapture: "assets/generated/cutscenes/marhyn-capture.jpg",
      cutsceneDungeonWake: "assets/generated/cutscenes/dungeon-wake.jpg",
      cutsceneOldYanFree: "assets/generated/cutscenes/old-yan-free.jpg",
      cutsceneYanVanishes: "assets/generated/cutscenes/yan-vanishes.jpg",
      cutsceneRuneSwordEagles: "assets/generated/cutscenes/rune-sword-eagles.jpg",
      cutsceneYanDragonReturn: "assets/generated/cutscenes/yan-dragon-return.jpg",
      cutsceneDerlinValena: "assets/generated/cutscenes/derlin-valena-v2.jpg",
      cutsceneWindSpell: "assets/generated/cutscenes/wind-spell.jpg",
      cutsceneDarhynFalls: "assets/generated/cutscenes/darhyn-falls.jpg",
      routeDarhynCastle: "assets/generated/guide-route/darhyn-castle.jpg?v=20260525-lod-route",
      routeKrendon: "assets/generated/guide-route/krendon.jpg?v=20260525-lod-route",
      routeHawkMountains: "assets/generated/guide-route/hawk-mountains.jpg?v=20260525-lod-route",
      routeMerfolkShoals: "assets/generated/guide-route/merfolk-shoals.jpg?v=20260525-lod-route",
      routeGrassland: "assets/generated/guide-route/grassland.jpg?v=20260525-lod-route",
      routeMarhynCastle: "assets/generated/guide-route/marhyn-castle.jpg?v=20260525-lod-route",
      routeForest: "assets/generated/guide-route/forest.jpg?v=20260525-lod-route",
      routeFreeton: "assets/generated/guide-route/freeton.jpg?v=20260525-lod-route",
      routeKingsHighway: "assets/generated/guide-route/kings-highway.jpg?v=20260525-lod-route",
      routeTealsburg: "assets/generated/guide-route/tealsburg.jpg?v=20260525-lod-route",
      routeNorthernPath: "assets/generated/guide-route/northern-path.jpg?v=20260525-lod-route",
      routeBreshen: "assets/generated/guide-route/breshen.jpg?v=20260525-lod-route",
      routeSavannah: "assets/generated/guide-route/savannah.jpg?v=20260525-lod-route",
      routeRathskeller: "assets/generated/guide-route/rathskeller.jpg?v=20260525-lod-route"
    };

    const cutsceneImages = {
      waterOrbWarp: { assetKey: "cutsceneWaterOrbWarp", alt: "Tarthur reaches a Water Orb spell focus as blue magic erupts from Darhyn's castle chest." },
      krendonWake: { assetKey: "cutsceneKrendonWake", alt: "Tarthur wakes on Krendon's village road beneath a fading water ring in the dawn sky." },
      tustorResurrection: { assetKey: "cutsceneTustorResurrection", alt: "Merwizard Tustor rises from the shoals in a ring of glowing tide magic." },
      litharAmbush: { assetKey: "cutsceneLitharAmbush", alt: "Lithar Lifehater blocks the grassland road before Tarthur's party." },
      marhynCapture: { assetKey: "cutsceneMarhynCapture", alt: "Lithar drags Tarthur beneath Marhyn's castle while Queen Marhyn watches." },
      dungeonWake: { assetKey: "cutsceneDungeonWake", alt: "Tarthur wakes alone in a blue-black dungeon cell under Marhyn's castle." },
      oldYanFree: { assetKey: "cutsceneOldYanFree", alt: "Tarthur finds Old Yan inside a locked cell in Marhyn's dungeon." },
      yanVanishes: { assetKey: "cutsceneYanVanishes", alt: "Old Yan vanishes into fog at the forest edge." },
      runeSwordEagles: { assetKey: "cutsceneRuneSwordEagles", alt: "Two eagles drop the glowing Rune Sword to Tarthur in the deep forest." },
      yanDragonReturn: { assetKey: "cutsceneYanDragonReturn", alt: "Yan returns on the King's Highway with a red dragon-shaped spell arcing behind him." },
      derlinValena: { assetKey: "cutsceneDerlinValena", alt: "Derlin meets radiant elven princess Valena in the treetop village of Breshen." },
      windSpell: { assetKey: "cutsceneWindSpell", alt: "Yan reaches for the Wind Spell focus inside Castle Rathskeller's ten doors." },
      darhynFalls: { assetKey: "cutsceneDarhynFalls", alt: "Yan transforms into a dragon of wind and sacrifices himself to drive Death Lord Darhyn back." }
    };

    const endingCredits = [
      ["Original DreamQuest concept", "Bill Pottle and the 2003 RPG Toolkit crew"],
      ["Story source", "DreamQuest, ProphecyQuest, SwordQuest, and the old Daranor notes"],
      ["Browser rebuild", "Bill Pottle with OpenAI Codex"],
      ["Production engineering", "OpenAI Codex"],
      ["Generated art direction", "Cutscenes, sprites, battle vistas, tiles, and guide illustrations"],
      ["Music system", "Layered Web Audio themes for roads, towns, castles, battles, and victory"],
      ["Final battle testing", "Tarthur, Derlin, Dalin, Yvonne, Valena, and Yan"],
      ["Special thanks", "Everyone who still had unfinished business after the credits"]
    ];

    const endingSideQuests = [
      { id: "oldMill", flag: "millSaved", startFlag: "millQuest", name: "Old Mill Bell", areaId: "oldMill", discoverAreas: ["krendon", "oldMill"], hint: "Old Mill, west of Krendon", summary: "Recover the bell clapper from the enchanted Dust Knight." },
      { id: "starShrine", flag: "skyShrineSolved", startFlag: "starWestObserved", name: "Star Shrine Charm", areaId: "skyShrine", discoverAreas: ["hawkMountains", "skyShrine"], hint: "Star Shrine, east of the Hawk Mountains", summary: "Study the paired star niches and awaken the shrine." },
      { id: "tideCavern", flag: "tideRegentDefeated", startFlag: "tideQuest", name: "Tide Cavern Pearl", areaId: "tideCavern", discoverAreas: ["merfolkShoals", "tideCavern"], hint: "Tide Cavern, west of the Merfolk Shoals", summary: "Open both sluices and depose the River Slime Regent." },
      { id: "moonMarsh", flag: "marshBookRecovered", startFlag: "marshQuest", name: "Moon Marsh Joke Book", areaId: "moonMarsh", discoverAreas: ["grassland", "moonMarsh"], hint: "Moon Marsh, west of the grassland", summary: "Read the marsh signs, identify the real wisp, and recover the joke book." },
      { id: "marketMaze", flag: "marketLedgerRecovered", startFlag: "marketQuest", name: "Market Ledger", areaId: "marketMaze", discoverAreas: ["tealsburg", "marketMaze"], hint: "Tealsburg Market Maze, east of the capital", summary: "Find the Paper Mimic that swallowed the city ledger." },
      { id: "glassCaves", flag: "glassCavesCalmed", startFlag: "glassQuest", name: "Glass Caves Flute", areaId: "glassCaves", discoverAreas: ["savannah", "glassCaves"], hint: "Glass Caves, east of the Savannah Plain", summary: "Tune the cave resonators and calm the Crystal Mole." }
    ];

    const tileInfo = {
      ".": ["grass", "meadow"],
      ",": ["grass", "plain"],
      "b": ["bush", "brush"],
      "=": ["path", "road"],
      "~": ["water", "water"],
      "#": ["wall", "stone wall"],
      "^": ["mountain", "mountain"],
      "T": ["tree", "forest"],
      "t": ["tree", "broadleaf forest"],
      "p": ["tree", "pine forest"],
      "H": ["town", "building"],
      "r": ["roof", "roof"],
      "w": ["house", "house wall"],
      "d": ["door", "house door"],
      "f": ["fence", "fence"],
      "g": ["garden", "garden"],
      "x": ["houseSide", "house side"],
      "q": ["threshold", "threshold"],
      "c": ["counter", "counter"],
      "+": ["door", "rune door"],
      "_": ["floor", "stone floor"],
      "s": ["sand", "shoal"]
    };

    const tileSheet = {
      key: "tilesheet",
      cols: 8,
      rows: 6,
      cells: {
        grass: [0, 0],
        calmGrass: [1, 0],
        meadow: [2, 0],
        calmMeadow: [3, 0],
        flowerGrass: [4, 0],
        bush: [5, 0],
        bush2: [6, 0],
        forestFloor: [7, 0],
        path: [0, 1],
        path2: [1, 1],
        plainDirt: [2, 1],
        stonePath: [3, 1],
        water: [4, 1],
        calmWater: [5, 1],
        water2: [6, 1],
        water3: [7, 1],
        sand: [0, 2],
        shoal: [1, 2],
        shore: [2, 2],
        wall: [3, 2],
        wall2: [4, 2],
        castleWall: [5, 2],
        floor: [6, 2],
        floor2: [7, 2],
        cleanStone: [0, 3],
        darkStone: [1, 3],
        mountain: [2, 3],
        mountain2: [3, 3],
        tree: [4, 3],
        tree2: [5, 3],
        broadleaf: [6, 3],
        pine: [7, 3],
        town: [0, 4],
        door: [1, 4],
        garden: [2, 4],
        ruinFloor: [3, 4],
        bridge: [4, 4],
        wood: [5, 4],
        fence: [6, 4],
        roof: [7, 4],
        crate: [0, 5],
        darkFloor: [1, 5],
        cliff: [2, 5],
        houseSide: [3, 5],
        quietGrass: [4, 5],
        threshold: [5, 5],
        quietDirt: [6, 5],
        quietStone: [7, 5]
      }
    };

    const battleBackgroundByArea = {
      darhynCastle: "battleDarhynCastle",
      krendon: "battleKrendon",
      krendonStable: "battleKrendon",
      krendonRoad: "battleKrendonRoad",
      oldMill: "battleOldMill",
      hawkMountains: "battleHawkMountains",
      hawkSwitchback: "battleHawkSwitchback",
      skyShrine: "battleSkyShrine",
      merfolkShoals: "battleMerfolkShoals",
      tideCavern: "battleTideCavern",
      grassland: "battleGrassland",
      moonMarsh: "battleMoonMarsh",
      marhynCastle: "battleMarhynCastle",
      forest: "battleForest",
      deepForest: "battleDeepForest",
      freeton: "battleFreeton",
      corizazLair: "battleFreeton",
      kingsHighway: "battleKingsHighway",
      tealsburg: "battleTealsburg",
      marketMaze: "battleMarketMaze",
      northernPath: "battleNorthernPath",
      breshen: "battleBreshen",
      savannah: "battleSavannah",
      glassCaves: "battleGlassCaves",
      rathskellerApproach: "battleRathskellerApproach",
      rathskeller: "battleRathskeller"
    };

    const spriteStyle = {
      tarthur: { hair: "#e8cf63", tunic: "#3f8a47", cloak: "#6a4a2c", skin: "#e8b98b" },
      derlin: { hair: "#25202a", tunic: "#384c83", cloak: "#9b3232", skin: "#d49a76" },
      dalin: { hair: "#252b3e", tunic: "#487f50", cloak: "#315d3c", skin: "#e0b388" },
      yanOld: { hair: "#d8d0be", tunic: "#6b6555", cloak: "#504844", skin: "#c99c7d" },
      yan: { hair: "#2f2c38", tunic: "#2d615b", cloak: "#24395c", skin: "#c99b76" },
      yvonne: { hair: "#efcf6a", tunic: "#7c513a", cloak: "#33445d", skin: "#e4ad82" },
      yvette: { hair: "#efcf6a", tunic: "#7c513a", cloak: "#33445d", skin: "#e4ad82" },
      valena: { hair: "#17151b", tunic: "#171820", cloak: "#0c0d13", skin: "#d9a46f" },
      hano: { hair: "#211414", tunic: "#4b2421", cloak: "#b3212c", skin: "#d7a07a" },
      zelin: { hair: "#d8d0be", tunic: "#6b6555", cloak: "#504844", skin: "#c99c7d" },
      marhyn: { hair: "#1c1826", tunic: "#26385f", cloak: "#121522", skin: "#e0b894" }
    };

    const enemyStyle = {
      dreamDarhyn: { kind: "darhyn", body: "#181621", accent: "#ff4c2e" },
      oldBetsy: { kind: "cow", body: "#d7d0bb", accent: "#3b2d2b" },
      mole: { kind: "mole", body: "#7a5846", accent: "#e0c196" },
      chomonster: { kind: "chomonster", body: "#489a7c", accent: "#ffd15f" },
      goblin: { kind: "goblin", body: "#6dad5a", accent: "#9b5132" },
      forestSpider: { kind: "fear", body: "#30213f", accent: "#b68cff" },
      roadBandit: { kind: "guard", body: "#553829", accent: "#e5b66c" },
      bogWisp: { kind: "fear", body: "#183d34", accent: "#79ffc2" },
      duneRaptor: { kind: "chomonster", body: "#b66d32", accent: "#ffe07a" },
      windWraith: { kind: "wizard", body: "#315d73", accent: "#baffcf" },
      shadowHound: { kind: "guard", body: "#211a2d", accent: "#a878ff" },
      lithar1: { kind: "knight", body: "#2b2c35", accent: "#b9b9c9" },
      marhynGuard: { kind: "guard", body: "#24314d", accent: "#5aa7df" },
      corizaz: { kind: "wizard", body: "#5c8065", accent: "#b5f08a" },
      fear: { kind: "fear", body: "#171720", accent: "#d8e4ef" },
      skullKnight: { kind: "guard", body: "#d7d1bc", accent: "#82868f" },
      yvette: { kind: "thieves", body: "#8a5d44", accent: "#efcf6a" },
      hano: { kind: "hano", body: "#4b2421", accent: "#b3212c" },
      lithar2: { kind: "knight", body: "#221f28", accent: "#d9c55c" },
      darhyn: { kind: "darhyn", body: "#181621", accent: "#ff4c2e" },
      dustKnight: { kind: "guard", body: "#4b4236", accent: "#d7c28a" },
      riverSlime: { kind: "slime", body: "#3f9fc0", accent: "#b8f5ff" },
      marshWisp: { kind: "fear", body: "#203827", accent: "#b9f08a" },
      paperMimic: { kind: "wizard", body: "#796448", accent: "#ffe29a" },
      crystalMole: { kind: "mole", body: "#6e7fa4", accent: "#d8f2ff" }
    };

    const heroAtlasCells = {
      tarthur: [0, 0],
      derlin: [1, 0],
      dalin: [2, 0],
      yan: [0, 1],
      yanOld: [0, 1],
      yvonne: [1, 1],
      yvette: [1, 1],
      valena: [2, 1]
    };

    const characterSheetKeys = {
      tarthur: "tarthurSheet",
      derlin: "derlinSheet",
      dalin: "dalinSheet",
      yan: "yanSheet",
      yanOld: "yanOldSheet",
      yvonne: "yvonneSheet",
      yvette: "yvetteSheet",
      valena: "valenaSheet",
      zelin: "zelinSheet",
      morty: "mortySheet",
      martha: "marthaSheet",
      scribe: "scribeSheet",
      miner: "minerSheet",
      kandan: "kandanSheet",
      elvenKing: "elvenKingSheet",
      kingGarkin: "kingGarkinSheet",
      sirStephen: "sirStephenSheet",
      corizaz: "corizazSheet",
      chairmanEor: "chairmanEorSheet",
      merwizard: "merwizardSheet",
      marhyn: "marhynSheet"
    };

    const characterSheetGrid = {
      cols: 8,
      rows: 5
    };

    const defaultCharacterSheetCrop = { top: 6, right: 6, bottom: 8, left: 6 };
    const characterSheetCrop = {
      derlin: { top: 7, right: 6, bottom: 8, left: 6 },
      dalin: { top: 0, right: 4, bottom: 2, left: 4 },
      yanOld: { top: 20, right: 18, bottom: 12, left: 18 }
    };
    const characterSheetDisplayScale = {
      yanOld: { map: 1.12, battle: 1.08, guide: 1.08 }
    };
    const characterSheetFrameNudges = {
      yanOld: {
        "0:0": [-11, 4], "1:0": [-10, 3], "2:0": [-3, 3], "3:0": [-10, 4],
        "4:0": [-10, 5], "5:0": [-2, 5], "6:0": [4, 4], "7:0": [8, 2],
        "0:1": [-6, 10], "1:1": [-8, 11], "2:1": [-9, 10], "3:1": [-6, 11],
        "4:1": [-7, 12], "5:1": [0, 12], "6:1": [10, 12], "7:1": [15, 12],
        "0:2": [0, 22], "1:2": [-8, 21], "2:2": [-6, 21], "3:2": [2, 22],
        "4:2": [7, 21], "5:2": [11, 21], "6:2": [11, 21], "7:2": [20, 21]
      }
    };
    const mirroredSideWalkIds = new Set(["morty"]);
    const mirroredRightIdleIds = new Set(["yanOld"]);
    const characterSheetBattleSideIdleIds = new Set();
    const characterSheetDirectionalRows = new Set();
    const spriteSheetHeadshotIds = new Set(["yvette", "zelin", "kandan", "kingGarkin", "sirStephen", "corizaz", "chairmanEor", "merwizard"]);

    const transientNpcEventIds = new Set([
      "dalin_join",
      "free_derlin",
      "yan_escape",
      "yan_returns",
      "yvonne_bump",
      "yvonne_decoy",
      "yvette_reveal",
      "valena"
    ]);

    const repeatLinesByEventId = {
      morty: [["Morty", "Still here? Good. I am cultivating mystery by standing near this path and judging footwork."]],
      star_shrine_voice: [["Shrine", "The shrine has already dispensed wisdom. Additional wisdom requires exact change."]],
      tustor_grave: [["Tustor", "The dream gave you the Water Orb Spell and its focus. The true Orb still waits outside the world."]],
      uris: [["Uris", "I checked again. Still Pancake. The spellbook is either cursed or hungry."]],
      king_garkin: [["King Garkin", "The royal advice remains: find the Orb, spend modestly, and avoid cow-related diplomacy."]],
      northern_scout: [["Yvonne", "Still dignified envoys. If asked about the cow, we deny choreography."]],
      savannah_camp: [["Derlin", "I have inspected the final castle from here and officially dislike its doors."]],
      approach_camp: [["Derlin", "Complaint update: the castle is still there, and so are my concerns."]],
      zelin: [["Zelin", "The dream still was not a dream. I checked twice, which is the wizard version of paperwork."]],
      mill_martha: [["Martha", "The mill is safer now. It still creaks, but at least it creaks in gratitude."]],
      tide_priest: [["Tide Priest", "The cavern monarchy remains abolished. The slime constitution was mostly bubbles anyway."]],
      marsh_jester: [["Marsh Jester", "The jokes are back. The frogs have requested representation in the next edition."]],
      freeton_mayor: [["Kandan", "Freeton remains normal. Please ignore the wizard-shaped dent in local history."]],
      sir_stephen: [["Sir Stephen", "I remain ready to charge heroically after someone else checks the paperwork."]],
      market_scribe: [["Market Scribe", "The ledger is safer now, though it still looks like it might bite during audits."]],
      elven_king: [["Elven King", "Rathskeller still waits behind ten doors. Elves consider that excessive even for villains."]],
      glass_miner: [["Glass Miner", "The caves are calmer. They still reflect my bad angles, but less aggressively."]]
    };

    const enemyAtlasCells = {
      darhyn: [0, 0],
      dreamDarhyn: [0, 0],
      lithar1: [1, 0],
      lithar2: [1, 0],
      dustKnight: [1, 0],
      marhynGuard: [1, 0],
      oldBetsy: [2, 0],
      fear: [3, 0],
      marshWisp: [3, 0],
      chomonster: [0, 1],
      goblin: [0, 1],
      riverSlime: [1, 1],
      paperMimic: [2, 1],
      mole: [3, 1],
      crystalMole: [3, 1]
    };

    const enemyAtlasCellCrop = {
      darhyn: { right: 18 },
      dreamDarhyn: { right: 18 }
    };

    const portraitAtlasCells = {
      tarthur: [0, 0],
      derlin: [1, 0],
      dalin: [2, 0],
      yanOld: [3, 0],
      yan: [0, 1],
      yvonne: [1, 1],
      valena: [2, 1],
      morty: [3, 1],
      martha: [0, 2],
      scribe: [1, 2],
      miner: [2, 2],
      elvenKing: [3, 2]
    };

    const customPortraitKeys = {
      marhyn: "marhynPortrait",
      lithar: "litharPortrait",
      darhyn: "darhynPortrait"
    };

    const guideIconAtlas = {
      cols: 6,
      rows: 7,
      cells: {
        "weapon:sword": [0, 0],
        "weapon:rune": [1, 0],
        "weapon:light": [2, 0],
        "weapon:redblade": [3, 0],
        "weapon:longbow": [4, 0],
        "weapon:crossbow": [5, 0],
        "weapon:repeater": [0, 1],
        "weapon:staff": [1, 1],
        "weapon:dragonstaff": [2, 1],
        "weapon:branch": [3, 1],
        "weapon:hammer": [4, 1],
        "weapon:flute": [5, 1],
        "accessory:flute": [5, 1],
        "armor:clothes": [0, 2],
        "armor:cloak": [1, 2],
        "armor:derlinCloak": [2, 2],
        "armor:guard": [3, 2],
        "armor:bluecoat": [4, 2],
        "armor:leafmail": [5, 2],
        "armor:greyrobe": [0, 3],
        "armor:skyweave": [1, 3],
        "armor:dragonmantle": [2, 3],
        "armor:branch": [3, 3],
        "armor:vs": [4, 3],
        "accessory:none": [5, 3],
        "item:bell": [0, 4],
        "accessory:bell": [0, 4],
        "armor:charm": [1, 4],
        "accessory:charm": [1, 4],
        "item:charm": [1, 4],
        "item:pearl": [2, 4],
        "accessory:pearl": [2, 4],
        "accessory:ring": [3, 4],
        "accessory:orb": [4, 4],
        "item:potion": [5, 4],
        "item:ether": [0, 5],
        "item:wakeLeaf": [1, 5],
        "item:smoke": [2, 5],
        "item:zoomShell": [3, 5],
        "item:kokhor": [4, 5],
        "item:milk": [5, 5],
        "item:scroll": [0, 6],
        "item:book": [1, 6],
        "item:relic": [2, 6],
        "item:gold": [3, 6],
        "item:scribePass": [4, 6],
        "item:cellKey": [5, 6]
      }
    };

    const spellAtlasCells = {
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
    const spellAtlasGrid = { cols: 3, rows: 3 };

    const coverImageKeys = {
      dreamquest: "dreamCover",
      prophecyquest: "prophecyCover",
      swordquest: "swordCover"
    };

    const routeGuideImageKeys = {
      darhynCastle: "routeDarhynCastle",
      krendon: "routeKrendon",
      hawkMountains: "routeHawkMountains",
      merfolkShoals: "routeMerfolkShoals",
      grassland: "routeGrassland",
      marhynCastle: "routeMarhynCastle",
      forest: "routeForest",
      freeton: "routeFreeton",
      kingsHighway: "routeKingsHighway",
      tealsburg: "routeTealsburg",
      northernPath: "routeNorthernPath",
      breshen: "routeBreshen",
      savannah: "routeSavannah",
      rathskeller: "routeRathskeller"
    };

    const sidequestGuideImageKeys = {
      oldMill: "battleOldMill",
      skyShrine: "battleSkyShrine",
      tideCavern: "battleTideCavern",
      moonMarsh: "battleMoonMarsh",
      marketMaze: "battleMarketMaze",
      glassCaves: "battleGlassCaves"
    };

    const creatorDefaults = {
      enabled: false,
      noEnemies: false,
      infiniteHp: false,
      infiniteMp: false,
      oneHitEnemies: false,
      revealWorld: false
    };

    const creatorGear = {
      Potion: 99,
      "Zoom Shell": 12,
      Kokhor: 12,
      "Encounter Dial": 1,
      "Water Orb Spell": 1,
      "Water Scroll": 1,
      "Rune Sword": 1,
      "Light Sword": 1,
      "Derlin's Redblade": 1,
      "Breshen Longbow": 1,
      "Old Yan's Knotted Staff": 1,
      "Wind Dragon Staff": 1,
      "Wind Spell": 1,
      "Road Cloak": 1,
      "Apprentice Guard": 1,
      "Blue-Black Coat": 1,
      "Derlin's Red Cloak": 1,
      "Elven Leafmail": 1,
      "Skyweave Robe": 1,
      "Dragon Scale Mantle": 1,
      "VS Armor": 1,
      "VS Relic": 1,
      "Honest Milk": 1,
      "Tide Pearl": 1,
      "Moonthread Ring": 1,
      "Water Orb Focus": 1,
      "Marsh Joke Book": 1,
      "Sky Charm": 1,
      "Glass Flute": 1,
      "Befuddling Bell": 1,
      "Ether Leaf": 12,
      "Wake Leaf": 12,
      "Smoke Nut": 12,
      "Scribe Pass": 1,
      "Derlin Cell Key": 1,
      "Yvonne's Crossbow": 1,
      "Tealsburg Repeater": 1,
      "Moonbranch Scepter": 1,
      "Valena's Branch Guard": 1,
      "Hano's Hammer": 1
    };

    const regularInventoryHiddenItems = new Set([
      "Honest Milk"
    ]);

    const creatorRouteFlags = [
      "waterSpellDream",
      "metZelin",
      "milkQuest",
      "milkedBetsy",
      "switchbackSurveyed",
      "tustorRaised",
      "capturedByLithar",
      "yanFreed",
      "yanVanished",
      "runeSword",
      "corizazLairRevealed",
      "lightSword",
      "yanReturned",
      "escapedFear",
      "yvonneJoined",
      "valenaJoined",
      "hanoDefeated",
      "readyForRathskeller",
      "windSpell",
      "litharDone"
    ];

    const knownExtraFlagNames = [
      "dreamDarhynDefeated",
      "milkQuest",
      "millQuest",
      "millSaved",
      "starWestObserved",
      "starEastObserved",
      "skyShrineSolved",
      "tideQuest",
      "tideWestSluice",
      "tideEastSluice",
      "tideRegentDefeated",
      "tustorRaised",
      "marshQuest",
      "marshBlueReeds",
      "marshSilverReeds",
      "marshBookRecovered",
      "yanFreed",
      "marhynKeyring",
      "yanVanished",
      "heardCorizaz",
      "corizazLairRevealed",
      "metKing",
      "yvonneBumped",
      "yvonneStolePotion",
      "yvonneStoleEther",
      "yvonneStoleGold",
      "yvonneDecoyChased",
      "marketQuest",
      "marketLedgerRecovered",
      "reachedBreshenPath",
      "rathskellerKnown",
      "glassQuest",
      "glassLowResonator",
      "glassHighResonator",
      "glassCavesCalmed",
      "gameComplete",
      "yanSacrificed",
      "endingCreditsSeen"
    ];

    const knownBaseCompletedEventIds = ["tustor_grave", "rune_sword"];

    const eventSpriteKind = {
      C: "chest",
      B: "boss",
      D: "npc",
      E: "npc",
      F: "boss",
      H: "boss",
      K: "npc",
      L: "boss",
      M: "npc",
      P: "boss",
      Q: "npc",
      R: "boss",
      S: "npc",
      T: "npc",
      U: "npc",
      V: "npc",
      W: "boss",
      X: "boss",
      Y: "npc",
      Z: "npc",
      "+": "door",
      "$": "shopSign",
      "!": "marker",
      "?": "marker"
    };

    const npcSpriteByEventId = {
      morty: "morty",
      wake_derlin: "derlin",
      free_derlin: "derlin",
      krendon_shopkeeper: "scribe",
      freeton_innkeeper: "martha",
      breshen_innkeeper: "scribe",
      tealsburg_shopkeeper: "scribe",
      merfolk_innkeeper: "chairmanEor",
      chairman_eor: "chairmanEor",
      mill_martha: "martha",
      dust_knight: "scribe",
      marsh_jester: "scribe",
      freeton_mayor: "kandan",
      freeton_townsgirl: "martha",
      market_scribe: "scribe",
      glass_miner: "miner",
      zelin: "zelin",
      king_garkin: "kingGarkin",
      elven_king: "elvenKing",
      sir_stephen: "sirStephen",
      tide_priest: "chairmanEor",
      queen_marhyn: "marhyn",
      yan_escape: "yanOld",
      yan_returns: "yan",
      yvonne_bump: "yvonne",
      yvonne_decoy: "yvonne",
      yvette_reveal: "yvonne"
    };

    const stationaryNpcEventIds = new Set([
      "dalin_join",
      "wake_derlin",
      "krendon_shopkeeper",
      "freeton_innkeeper",
      "freeton_townsgirl",
      "breshen_innkeeper",
      "tealsburg_shopkeeper",
      "merfolk_innkeeper",
      "tide_priest",
      "breshen_armor_seller",
      "tustor_grave",
      "king_garkin",
      "yvonne_bump",
      "yvonne_decoy",
      "yvette_reveal"
    ]);

    const speakerPortraits = {
      Tarthur: { type: "hero", id: "tarthur" },
      Derlin: { type: "hero", id: "derlin" },
      Dalin: { type: "hero", id: "dalin" },
      Yan: { type: "hero", id: "yan" },
      "Old Yan": { type: "hero", id: "yanOld" },
      "Blond Thief": { type: "hero", id: "yvonne" },
      Yvonne: { type: "hero", id: "yvonne" },
      Yvette: { type: "hero", id: "yvonne" },
      Valena: { type: "hero", id: "valena" },
      Morty: { type: "hero", id: "morty" },
      Martha: { type: "hero", id: "martha" },
      Zelin: { type: "hero", id: "zelin" },
      Uris: { type: "hero", id: "scribe" },
      Judith: { type: "hero", id: "martha" },
      Kandan: { type: "hero", id: "kandan" },
      "King Garkin": { type: "hero", id: "kingGarkin" },
      "Sir Stephen": { type: "hero", id: "sirStephen" },
      "Elven King": { type: "hero", id: "elvenKing" },
      "Glass Miner": { type: "hero", id: "miner" },
      "Market Scribe": { type: "hero", id: "scribe" },
      "Marsh Jester": { type: "hero", id: "scribe" },
      "Chairman Eor": { type: "hero", id: "chairmanEor" },
      Tustor: { type: "hero", id: "merwizard" },
      "Merwizard Tustor": { type: "hero", id: "merwizard" },
      "Queen Marhyn": { type: "hero", id: "marhyn" },
      "Tide Priest": { type: "hero", id: "chairmanEor" },
      Darhyn: { type: "enemy", id: "darhyn" },
      "Dream Darhyn": { type: "enemy", id: "dreamDarhyn" },
      "Death Lord Darhyn": { type: "enemy", id: "darhyn" },
      Lithar: { type: "enemy", id: "lithar2" },
      "Sleeping Corizaz": { type: "enemy", id: "corizaz" },
      "Old Betsy": { type: "enemy", id: "oldBetsy" },
      Hano: { type: "enemy", id: "hano" },
      Narrator: { type: "narrator" },
      System: { type: "narrator" },
      Creator: { type: "narrator" }
    };

    const partyTemplates = {
      tarthur: {
        id: "tarthur",
        name: "Tarthur",
        role: "Apprentice hero",
        level: 1,
        maxHp: 32,
        hp: 32,
        maxMp: 8,
        mp: 8,
        atk: 8,
        def: 4,
        xp: 0,
        skill: "Steal-ish Slash"
      },
      derlin: {
        id: "derlin",
        name: "Derlin",
        role: "Red-cloaked friend",
        level: 1,
        maxHp: 34,
        hp: 34,
        maxMp: 4,
        mp: 4,
        atk: 7,
        def: 5,
        xp: 0,
        skill: "Backbeat Run"
      },
      dalin: {
        id: "dalin",
        name: "Dalin",
        role: "Elf prince",
        level: 10,
        maxHp: 48,
        hp: 48,
        maxMp: 24,
        mp: 24,
        atk: 12,
        def: 8,
        xp: 0,
        skill: "Leafmend"
      },
      yanOld: {
        id: "yanOld",
        name: "Old Yan",
        role: "Suspiciously level 99",
        level: 99,
        maxHp: 22,
        hp: 22,
        maxMp: 0,
        mp: 0,
        atk: 1,
        def: 1,
        xp: 0,
        skill: "Point At Exit"
      },
      yan: {
        id: "yan",
        name: "Yan",
        role: "Shapeshifter",
        level: 15,
        maxHp: 62,
        hp: 62,
        maxMp: 30,
        mp: 30,
        atk: 16,
        def: 9,
        xp: 0,
        skill: "Dragon Shape"
      },
      yvonne: {
        id: "yvonne",
        name: "Yvonne",
        role: "Crossbow thief",
        level: 13,
        maxHp: 52,
        hp: 52,
        maxMp: 8,
        mp: 8,
        atk: 15,
        def: 7,
        xp: 0,
        skill: "Charm Shot"
      },
      valena: {
        id: "valena",
        name: "Valena",
        role: "Elven princess",
        level: 14,
        maxHp: 50,
        hp: 50,
        maxMp: 22,
        mp: 22,
        atk: 13,
        def: 9,
        xp: 0,
        skill: "Sacred Branch"
      }
    };

    const skillCatalog = {
      stealishSlash: {
        name: "Steal-ish Slash",
        mp: 2,
        type: "damage",
        power: 1.28,
        flat: 3,
        effect: "runeSlash",
        color: "#ffe97a",
        level: 1,
        learn: "Level 1",
        text: "Tarthur's starter sword skill. Heroic, mostly legal."
      },
      waterOrbEcho: {
        name: "Water Orb Echo",
        mp: 3,
        type: "damage",
        power: 1.52,
        flat: 8,
        effect: "dragonSpell",
        color: "#69d8ff",
        level: 2,
        requiresFlag: "waterSpellDream",
        learn: "Tarthur level 2 + Water Orb Spell",
        text: "A wave spell learned from the dream-born imprint of the Water Orb."
      },
      zoom: {
        name: "Zoom",
        mp: 2,
        type: "fieldTravel",
        effect: "dragonSpell",
        color: "#78d7ff",
        level: 8,
        requiresFlag: "waterSpellDream",
        learn: "Tarthur level 8 + Water Orb Spell",
        text: "A field spell that opens later, returning the party to a town or castle they have already reached."
      },
      heroSpark: {
        name: "Hero Spark",
        mp: 5,
        type: "damage",
        power: 1.8,
        flat: 12,
        effect: "runeSlash",
        color: "#fff2a8",
        level: 4,
        learn: "Tarthur level 4",
        text: "A clean mid-game burst for bosses who have read the manual."
      },
      lightSwordArc: {
        name: "Light Sword Arc",
        mp: 4,
        type: "damage",
        power: 2.05,
        flat: 15,
        effect: "runeSlash",
        color: "#fff7c8",
        level: 10,
        requiresItem: "Light Sword",
        learn: "Tarthur level 10 + Light Sword",
        text: "The Light Sword throws a bright crescent through enemy excuses."
      },
      backbeatRun: {
        name: "Backbeat Run",
        mp: 1,
        type: "damage",
        power: 1.2,
        flat: 2,
        effect: "redSlash",
        color: "#ff816a",
        level: 1,
        learn: "Level 1",
        text: "Derlin attacks on rhythm and implies the monster is off-beat."
      },
      cloakSnap: {
        name: "Cloak Snap",
        mp: 2,
        type: "damage",
        power: 1.42,
        flat: 6,
        effect: "redSlash",
        color: "#ff6d5d",
        stunChance: 0.18,
        level: 3,
        learn: "Derlin level 3",
        text: "A red-cloak feint with a small chance to cost the enemy its turn."
      },
      weaponizedPunchline: {
        name: "Weaponized Punchline",
        mp: 3,
        type: "damage",
        power: 1.65,
        flat: 12,
        effect: "charmShot",
        color: "#ff9d6f",
        stunChance: 0.28,
        level: 8,
        requiresItem: "Marsh Joke Book",
        learn: "Derlin level 8 + Marsh Joke Book",
        text: "Derlin weaponizes comedy. The joke is optional; the damage is not."
      },
      bellRinger: {
        name: "Bell Ringer",
        mp: 2,
        type: "damage",
        power: 1.35,
        flat: 8,
        effect: "charmShot",
        color: "#f2d977",
        stunChance: 0.42,
        level: 5,
        requiresItem: "Befuddling Bell",
        learn: "Derlin level 5 + Befuddling Bell",
        text: "A ringing distraction from the Old Mill that monsters hate reviewing."
      },
      leafmend: {
        name: "Leafmend",
        mp: 3,
        type: "heal",
        heal: 22,
        effect: "heal",
        color: "#93f0ff",
        level: 1,
        learn: "Dalin joins",
        text: "Dalin restores the weakest ally's HP with elven competence."
      },
      princeVolley: {
        name: "Prince Volley",
        mp: 4,
        type: "damage",
        power: 1.62,
        flat: 9,
        effect: "charmShot",
        color: "#9ee9a3",
        level: 11,
        learn: "Dalin level 11",
        text: "A polished elven bow strike that makes the party look organized."
      },
      canopyMend: {
        name: "Canopy Mend",
        mp: 7,
        type: "healAll",
        heal: 16,
        effect: "heal",
        color: "#c6ffa7",
        level: 13,
        learn: "Dalin level 13",
        text: "A group heal for dungeon stretches where everyone has made choices."
      },
      lifeleaf: {
        name: "Lifeleaf",
        mp: 6,
        type: "revive",
        revive: 0.48,
        effect: "heal",
        color: "#d9ff9e",
        level: 12,
        learn: "Dalin level 12",
        text: "Dalin revives one fallen ally with enough HP to rejoin the argument."
      },
      pointAtExit: {
        name: "Point At Exit",
        mp: 0,
        type: "damage",
        power: 0.55,
        flat: 2,
        effect: "redSlash",
        color: "#d6c6a4",
        level: 1,
        learn: "Old Yan joins",
        text: "Old Yan points at a weakness. The weakness is usually the exit."
      },
      dragonShape: {
        name: "Dragon Shape",
        mp: 4,
        type: "damage",
        power: 1.82,
        flat: 14,
        effect: "dragonSpell",
        color: "#78e7ff",
        level: 1,
        learn: "Yan restored",
        text: "Yan shifts into a dragon strike and ruins the enemy's afternoon."
      },
      scaleRake: {
        name: "Scale Rake",
        mp: 3,
        type: "damage",
        power: 1.48,
        flat: 8,
        effect: "runeSlash",
        color: "#87f0d8",
        level: 16,
        learn: "Yan level 16",
        text: "A faster dragon-claw combo for conserving MP."
      },
      windSpell: {
        name: "Wind Spell",
        mp: 6,
        type: "damage",
        power: 2.25,
        flat: 22,
        effect: "dragonSpell",
        color: "#baffcf",
        level: 1,
        requiresItem: "Wind Spell",
        learn: "Yan + Wind Spell acquired",
        text: "The late-game spell Yan needs when Darhyn stops being tutorial fragile."
      },
      charmShot: {
        name: "Charm Shot",
        mp: 2,
        type: "damage",
        power: 1.45,
        flat: 7,
        effect: "charmShot",
        color: "#ff9bd5",
        stunChance: 0.36,
        level: 1,
        learn: "Yvonne joins",
        text: "A crossbow shot with enough style to make an enemy miss a beat."
      },
      lockpickVolley: {
        name: "Lockpick Volley",
        mp: 3,
        type: "damage",
        power: 1.68,
        flat: 10,
        effect: "charmShot",
        color: "#ffc07a",
        level: 14,
        learn: "Yvonne level 14",
        text: "Yvonne fires three bolts and charges the monster a convenience fee."
      },
      royalRefund: {
        name: "Royal Refund",
        mp: 4,
        type: "damage",
        power: 1.9,
        flat: 14,
        effect: "charmShot",
        color: "#ffe38a",
        level: 15,
        requiresItem: "Scribe Pass",
        learn: "Yvonne level 15 + Scribe Pass",
        text: "Paperwork-backed damage. Somehow legal in Tealsburg."
      },
      sacredBranch: {
        name: "Sacred Branch",
        mp: 3,
        type: "heal",
        heal: 26,
        effect: "heal",
        color: "#d3ff93",
        level: 1,
        learn: "Valena joins",
        text: "Valena restores the weakest ally and makes it look ceremonial."
      },
      sacredReturn: {
        name: "Sacred Return",
        mp: 6,
        type: "revive",
        revive: 0.55,
        effect: "heal",
        color: "#efffb0",
        level: 15,
        learn: "Valena level 15",
        text: "Valena calls a fallen ally back to their feet with royal insistence."
      },
      branchBloom: {
        name: "Branch Bloom",
        mp: 7,
        type: "healAll",
        heal: 18,
        effect: "heal",
        color: "#e4ffac",
        level: 16,
        learn: "Valena level 16",
        text: "A party-wide heal for the stretch where every hallway has teeth."
      },
      starleafWard: {
        name: "Starleaf Ward",
        mp: 5,
        type: "healAll",
        heal: 12,
        effect: "heal",
        color: "#bff7ff",
        level: 15,
        requiresItem: "Sky Charm",
        learn: "Valena level 15 + Sky Charm",
        text: "A side-quest ward that patches everyone and calms the panic slightly."
      }
    };

    const partySkillLists = {
      tarthur: ["stealishSlash", "waterOrbEcho", "zoom", "heroSpark", "lightSwordArc"],
      derlin: ["backbeatRun", "cloakSnap", "weaponizedPunchline", "bellRinger"],
      dalin: ["leafmend", "princeVolley", "canopyMend", "lifeleaf"],
      yanOld: ["pointAtExit"],
      yan: ["dragonShape", "scaleRake", "windSpell"],
      yvonne: ["charmShot", "lockpickVolley", "royalRefund"],
      valena: ["sacredBranch", "sacredReturn", "branchBloom", "starleafWard"]
    };

    const battleItemCatalog = {
      potion: {
        name: "Potion",
        inventory: "Potion",
        consume: true,
        type: "heal",
        effect: "potion",
        color: "#9ff0a4",
        text: "Restores HP to the party member in the worst shape."
      },
      etherLeaf: {
        name: "Ether Leaf",
        inventory: "Ether Leaf",
        consume: true,
        type: "mp",
        effect: "heal",
        color: "#8ad7ff",
        text: "Restores MP to the party member running driest."
      },
      wakeLeaf: {
        name: "Wake Leaf",
        inventory: "Wake Leaf",
        consume: true,
        type: "revive",
        revive: 0.5,
        effect: "heal",
        color: "#d8ffa4",
        text: "Revives one fallen party member at half HP."
      },
      smokeNut: {
        name: "Smoke Nut",
        inventory: "Smoke Nut",
        consume: true,
        type: "stun",
        effect: "charmShot",
        color: "#d7d7c0",
        text: "A battle item that can make an enemy lose its next turn."
      },
      zoomShell: {
        name: "Zoom Shell",
        inventory: "Zoom Shell",
        consume: true,
        type: "fieldTravel",
        effect: "dragonSpell",
        color: "#78d7ff",
        text: "Field item that returns the party to a town or castle already marked on the route."
      },
      kokhor: {
        name: "Kokhor",
        inventory: "Kokhor",
        consume: true,
        type: "kokhor",
        effect: "potion",
        color: "#f0c767",
        text: "Merfolk firewater. Next round: huge strength. After that: an ugly battle hangover."
      },
      befuddlingBell: {
        name: "Befuddling Bell",
        inventory: "Befuddling Bell",
        consume: false,
        type: "stun",
        effect: "charmShot",
        color: "#f2d977",
        text: "Side-quest gear that can spend a turn confusing monsters on purpose."
      },
      encounterDial: {
        name: "Encounter Dial",
        inventory: "Encounter Dial",
        consume: false,
        type: "encounterControl",
        effect: "charmShot",
        color: "#78d7ff",
        text: "Postgame device for setting random encounters to normal, off, or a chosen step interval."
      }
    };

    const weaponCatalog = {
      "Training Sword": {
        users: ["tarthur", "derlin"],
        bonus: 0,
        starter: true,
        text: "Reliable, affordable, and emotionally prepared for slimes."
      },
      "Elven Bow": {
        users: ["dalin"],
        bonus: 0,
        starter: true,
        text: "Dalin's standard bow. Polite until fired."
      },
      "Walking Staff": {
        users: ["yanOld"],
        bonus: 0,
        starter: true,
        text: "Old Yan's staff. Mostly for pointing at exits."
      },
      "Dragon Staff": {
        users: ["yan"],
        bonus: 0,
        starter: true,
        text: "Yan's restored focus. It looks like a staff until it does not."
      },
      "Thief Crossbow": {
        users: ["yvonne"],
        bonus: 0,
        starter: true,
        text: "Yvonne's starter crossbow, acquired by methods she calls retail-adjacent."
      },
      "Sacred Branch": {
        users: ["valena"],
        bonus: 0,
        starter: true,
        text: "Valena's ceremonial branch. Heals, bonks, and judges."
      },
      "Rune Sword": {
        users: ["tarthur", "derlin"],
        bonus: 4,
        text: "An Air-forged blade returned by eagles. It points toward exits and regrettable plot twists."
      },
      "Light Sword": {
        users: ["tarthur", "derlin"],
        bonus: 8,
        armorPenetration: true,
        text: "A Freeton prize that cuts through armor and excuses."
      },
      "Derlin's Redblade": {
        users: ["derlin"],
        bonus: 6,
        text: "A red-handled short sword for Derlin when the jokes need a sharper edge."
      },
      "Breshen Longbow": {
        users: ["dalin"],
        bonus: 6,
        text: "A clean elven bow that makes Dalin's volleys feel less ceremonial."
      },
      "Old Yan's Knotted Staff": {
        users: ["yanOld"],
        bonus: 3,
        text: "Old Yan's better staff. Still mostly for pointing, now with consequences."
      },
      "Wind Dragon Staff": {
        users: ["yan"],
        bonus: 8,
        text: "A spell focus that remembers Yan is not strictly limited to human-shaped problems."
      },
      "Yvonne's Crossbow": {
        users: ["yvonne"],
        bonus: 7,
        text: "A sharper crossbow that makes Charm Shot feel less theoretical."
      },
      "Tealsburg Repeater": {
        users: ["yvonne"],
        bonus: 10,
        text: "A market-made repeating crossbow. The paperwork says it is almost certainly legal."
      },
      "Moonbranch Scepter": {
        users: ["valena"],
        bonus: 7,
        text: "A moonlit branch focus for Valena's healing rites and precise royal bonking."
      },
      "Hano's Hammer": {
        users: ["dalin", "yan", "valena"],
        bonus: 10,
        text: "Large, direct, and not interested in subtlety."
      }
    };

    const defaultWeaponByMember = {
      tarthur: "Training Sword",
      derlin: "Training Sword",
      dalin: "Elven Bow",
      yanOld: "Walking Staff",
      yan: "Dragon Staff",
      yvonne: "Thief Crossbow",
      valena: "Sacred Branch"
    };

    const armorCatalog = {
      "Travel Clothes": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        defBonus: 0,
        starter: true,
        text: "Starter travel gear. Better than pajamas, which is the main bar."
      },
      "Road Cloak": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        defBonus: 1,
        text: "A sturdy road cloak for weather, dust, and looking like you had a plan."
      },
      "Apprentice Guard": {
        users: ["tarthur", "derlin"],
        defBonus: 2,
        text: "Light guard gear for apprentices who keep standing next to destiny."
      },
      "Blue-Black Coat": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        defBonus: 3,
        text: "Dungeon-styled protection copied from Marhyn's guards without the loyalty oath."
      },
      "Derlin's Red Cloak": {
        users: ["derlin"],
        defBonus: 4,
        text: "Official party visibility gear. Offers no warranty against cows."
      },
      "Elven Leafmail": {
        users: ["dalin", "valena"],
        defBonus: 4,
        text: "Breshen leafmail, formal enough for court and flexible enough for boss music."
      },
      "Old Yan's Grey Robe": {
        users: ["yanOld"],
        defBonus: 2,
        starter: true,
        text: "Old Yan's robe, with pockets for secrets and suspiciously high stats."
      },
      "Skyweave Robe": {
        users: ["dalin", "yanOld", "yan", "valena"],
        defBonus: 3,
        text: "A light robe threaded for casters who prefer not to get flattened."
      },
      "Dragon Scale Mantle": {
        users: ["yan"],
        defBonus: 5,
        text: "A late-game mantle that fits Yan better after he stops pretending to be ordinary."
      },
      "VS Armor": {
        users: ["yvonne"],
        defBonus: 10,
        text: "A Valena's Secret bikini armor relic. It protects Yvonne because DreamQuest logic insists."
      },
      "Valena's Branch Guard": {
        users: ["valena"],
        defBonus: 4,
        text: "A ceremonial defense that pairs with Sacred Branch."
      }
    };

    const defaultArmorByMember = {
      tarthur: "Travel Clothes",
      derlin: "Travel Clothes",
      dalin: "Travel Clothes",
      yanOld: "Old Yan's Grey Robe",
      yan: "Travel Clothes",
      yvonne: "Travel Clothes",
      valena: "Travel Clothes"
    };

    const accessoryCatalog = {
      "No Accessory": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        starter: true,
        text: "Leaves the accessory slot open."
      },
      "Glass Flute": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        encounterRateMultiplier: 0.78,
        text: "When equipped, the party's random encounters calm down a little."
      },
      "Befuddling Bell": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        enemySkipChance: 0.12,
        text: "When equipped, it can distract enemies at the start of their turn."
      },
      "Sky Charm": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        defBonus: 2,
        text: "A Star Shrine charm that shaves a little damage off enemy attacks."
      },
      "Tide Pearl": {
        users: ["tarthur", "derlin", "dalin", "yanOld", "yan", "yvonne", "valena"],
        potionBonus: 10,
        etherBonus: 2,
        text: "When equipped, potions and ether leaves recover more."
      },
      "Moonthread Ring": {
        users: ["dalin", "yanOld", "yan", "valena"],
        mpCostReduction: 1,
        text: "A caster ring that reduces skill MP costs by 1 for its wearer."
      },
      "Water Orb Focus": {
        users: ["tarthur", "yan", "valena"],
        mpCostReduction: 1,
        text: "A focus paired with the dream-born Water Orb Spell. It is an echo of the true Orb, not the Orb itself."
      }
    };

    const defaultAccessoryByMember = {
      tarthur: "No Accessory",
      derlin: "No Accessory",
      dalin: "No Accessory",
      yanOld: "No Accessory",
      yan: "No Accessory",
      yvonne: "No Accessory",
      valena: "No Accessory"
    };

    const shops = {
      krendon: {
        name: "Krendon Supply Counter",
        greeting: "Judith's cousin sells practical goods and exactly zero destiny insurance.",
        inn: { name: "Krendon Back-Room Cot", cost: 0 },
        items: [
          { item: "Potion", cost: 14 },
          { item: "Ether Leaf", cost: 22 },
          { item: "Wake Leaf", cost: 34 },
          { item: "Smoke Nut", cost: 18 },
          { item: "Road Cloak", cost: 55 },
          { item: "Apprentice Guard", cost: 90, stock: 2 }
        ],
        services: [{ id: "forgeTune", name: "Forge Tune-Up", cost: 80, text: "Permanently adds +1 ATK to the current roster." }]
      },
      tealsburg: {
        name: "Tealsburg Market Stall",
        greeting: "The sign says 'hero discount.' The tiny print says 'hero markup.'",
        inn: { name: "Tealsburg Traveler's Loft", cost: 18 },
        items: [
          { item: "Potion", cost: 16 },
          { item: "Ether Leaf", cost: 20 },
          { item: "Wake Leaf", cost: 32 },
          { item: "Smoke Nut", cost: 20 },
          { item: "Blue-Black Coat", cost: 140, stock: 2 },
          { item: "Yvonne's Crossbow", cost: 220, stock: 1 },
          { item: "Tealsburg Repeater", cost: 420, stock: 1 },
          { item: "Skyweave Robe", cost: 180, stock: 2 }
        ],
        services: [{ id: "armorFitting", name: "Royal Armor Fitting", cost: 120, text: "Permanently adds +1 DEF to the current roster." }]
      },
      breshen: {
        name: "Breshen Royal Armory",
        greeting: "The armorer keeps the special stock behind three receipts and one raised eyebrow.",
        items: [
          { item: "Breshen Longbow", cost: 210, stock: 1 },
          { item: "Elven Leafmail", cost: 180, stock: 2 },
          { item: "Moonbranch Scepter", cost: 260, stock: 1 },
          { item: "Valena's Branch Guard", cost: 190, stock: 1 },
          { item: "VS Armor", cost: 999, stock: 1 }
        ],
        services: [{ id: "royalTraining", name: "Royal Catch-Up Training", cost: 180, text: "Raises lower-level available allies to one level below the party leader." }]
      },
      merfolk: {
        name: "Merfolk Tide Market",
        greeting: "The tide clerk sells things that should probably have warning labels.",
        inn: { name: "Coral Nap Alcove", cost: 12 },
        items: [
          { item: "Zoom Shell", cost: 36 },
          { item: "Kokhor", cost: 58 },
          { item: "Potion", cost: 16 },
          { item: "Ether Leaf", cost: 24 },
          { item: "Wake Leaf", cost: 36 },
          { item: "Moonthread Ring", cost: 160, stock: 1 },
          { item: "Sky Charm", cost: 150, stock: 1 }
        ],
        services: [{ id: "tideBlessing", name: "Tide Blessing", cost: 100, text: "Permanently adds +2 maximum MP to every caster in the current roster." }]
      }
    };

    const enemies = {
      dreamDarhyn: { name: "Dream Darhyn", icon: "D", hp: 1, atk: 0, def: 0, xp: 2, gold: 0, boss: true },
      oldBetsy: { name: "Old Betsy", icon: "B", hp: 44, atk: 8, def: 2, xp: 18, gold: 8, boss: true, mechanic: "stampede" },
      mole: { name: "Court-Appointed Mole", icon: "m", hp: 24, atk: 6, def: 2, xp: 8, gold: 4 },
      chomonster: { name: "Cho Monster", pluralName: "Cho Monsters", icon: "C", hp: 34, atk: 9, def: 3, xp: 12, gold: 7 },
      goblin: { name: "Goblin Intern", icon: "g", hp: 36, atk: 10, def: 4, xp: 16, gold: 8 },
      forestSpider: { name: "Gloomweb Spider", pluralName: "Gloomweb Spiders", icon: "S", hp: 42, atk: 12, def: 4, xp: 19, gold: 9 },
      roadBandit: { name: "Highway Cutpurse", pluralName: "Highway Cutpurses", icon: "B", hp: 52, atk: 15, def: 6, xp: 27, gold: 18 },
      bogWisp: { name: "Bog Lantern", pluralName: "Bog Lanterns", icon: "W", hp: 46, atk: 13, def: 5, xp: 23, gold: 12 },
      duneRaptor: { name: "Savannah Raptor", pluralName: "Savannah Raptors", icon: "R", hp: 76, atk: 21, def: 8, xp: 42, gold: 22 },
      windWraith: { name: "Wind Wraith", pluralName: "Wind Wraiths", icon: "W", hp: 68, atk: 23, def: 6, xp: 46, gold: 20 },
      shadowHound: { name: "Rathskeller Hound", pluralName: "Rathskeller Hounds", icon: "H", hp: 84, atk: 25, def: 9, xp: 54, gold: 26 },
      lithar1: {
        name: "Lithar Lifehater",
        icon: "L",
        hp: 72,
        atk: 16,
        def: 8,
        xp: 0,
        gold: 0,
        boss: true,
        scriptedLoss: true,
        scriptedLossMove: "Capture",
        scriptedLossMessage: "Black chain-light locks around the party. The battle is over. Lithar has captured everyone."
      },
      marhynGuard: { name: "Blue-Black Guard", icon: "G", hp: 48, atk: 13, def: 7, xp: 24, gold: 13 },
      corizaz: { name: "Sleeping Corizaz", icon: "Z", hp: 58, atk: 8, def: 2, xp: 44, gold: 35, boss: true },
      fear: { name: "Fear Creature", icon: "F", hp: 120, atk: 22, def: 12, xp: 0, gold: 0, boss: true, mustRun: true },
      skullKnight: { name: "Skull Knight", pluralName: "Skull Knights", icon: "L", hp: 70, atk: 12, def: 0, xp: 0, gold: 0, reassembles: true },
      yvette: { name: "Yvonne and Yvette", icon: "Y", hp: 96, atk: 18, def: 7, xp: 58, gold: 0, boss: true, plural: true, mechanic: "twinVolley" },
      hano: { name: "Hano, Hammer Fiance", icon: "H", hp: 115, atk: 19, def: 9, xp: 68, gold: 26, boss: true, mechanic: "hammerCharge" },
      lithar2: { name: "Lithar, Still Upset", icon: "L", hp: 150, atk: 24, def: 10, xp: 88, gold: 50, boss: true, mechanic: "lifeDrain" },
      darhyn: { name: "Death Lord Darhyn", icon: "D", hp: 220, atk: 28, def: 13, xp: 200, gold: 0, boss: true, final: true, mechanic: "windFinal" },
      dustKnight: { name: "Dust Knight", icon: "L", hp: 72, atk: 15, def: 8, xp: 42, gold: 28, boss: true },
      riverSlime: { name: "River Slime Regent", icon: "R", hp: 58, atk: 12, def: 5, xp: 34, gold: 22, boss: true },
      marshWisp: { name: "Marsh Wisp Comedian", icon: "W", hp: 96, atk: 18, def: 7, xp: 60, gold: 28, boss: true, support: { type: "healAll", heal: 18, chance: 0.36 } },
      paperMimic: { name: "Paper Mimic", icon: "P", hp: 68, atk: 14, def: 6, xp: 46, gold: 42, boss: true },
      crystalMole: { name: "Crystal Mole", icon: "X", hp: 88, atk: 17, def: 8, xp: 62, gold: 60, boss: true }
    };

    const guideData = {
      trilogy: [
        { name: "DreamQuest", stat: "Book I", image: "cover:dreamquest", text: "Tarthur of Krendon follows a strange dream into Darhyn's shadow, the Water Orb, merfolk ruins, Marhyn's dungeons, Yan's curse, and the first real shape of the War of the Orb." },
        { name: "ProphecyQuest", stat: "Book II", image: "cover:prophecyquest", text: "The sequel opens up the Wall of Glass, Tivu the Cloudwalker, the Power of Air, Tarthur's son Alahim, and a prophecy that makes rescuing Yan much less simple than anyone hoped." },
        { name: "SwordQuest", stat: "Book III", image: "cover:swordquest", text: "The finale pushes the party into darker territory: old leaders are gone, the prophecy is only half fulfilled, Darhyn has returned, and something worse is learning the shape of Daranor." }
      ],
      characters: [
        { name: "Tarthur", stat: "Apprentice hero", image: "portrait:tarthur", text: "Krendon's chore-powered hero. Starts underleveled, over-dreamed, and gradually becomes everybody's problem solver." },
        { name: "Derlin", stat: "Red-cloaked friend", image: "portrait:derlin", text: "Best friend, rhythm runner, complaint specialist, and the only person who can make a joke book count as gear." },
        { name: "Dalin", stat: "Elf prince", image: "portrait:dalin", text: "Valena's brother. Escapes Marhyn through old elven routes, then reunites with the party in Breshen." },
        { name: "Old Yan", stat: "Level 99?", image: "portrait:yanOld", text: "A frail mystery man whose stats are technically impressive and practically suspicious." },
        { name: "Yan", stat: "Shapeshifter", image: "portrait:yan", text: "Once restored, Yan carries the Wind Spell to Darhyn, transforms fully, and is lost saving the party." },
        { name: "Yvonne", stat: "Crossbow thief", image: "portrait:yvonne", text: "Steals the party's money, then joins the party, which is either redemption or advanced budgeting." },
        { name: "Valena", stat: "Elven princess", image: "portrait:valena", text: "Dalin's sister, guardian of Breshen's bridge lamps, and the reason Hano's red-cloaked demands become everyone's problem." }
      ],
      antagonists: [
        { name: "Queen Marhyn", stat: "Dungeon queen", image: "portrait:marhyn", text: "Rules the blue-black dungeons with theatrical menace and enough poise to make captivity feel scheduled." },
        { name: "Lithar Lifehater", stat: "Darhyn's servant", image: "portrait:lithar", text: "A recurring enforcer who turns Marhyn's capture into Darhyn's larger threat." },
        { name: "Death Lord Darhyn", stat: "Final threat", image: "portrait:darhyn", text: "The shadow behind the Water Orb, Rathskeller, and the final shape of DreamQuest's first war." }
      ],
      spells: [
        { name: "Water Orb Spell", stat: "Quest", image: "spell:water", text: "A magical imprint found in the dream castle—not the physical Water Orb. It raises Tustor's spirit and points the party toward the true Orb." },
        ...Object.values(skillCatalog).map((skill) => ({
          name: skill.name,
          stat: `${skill.mp} MP | ${skill.learn}`,
          image: guideSpellImageForSkill(skill),
          text: skill.text
        }))
      ],
      items: [
        { name: "Potion", stat: "32+ HP", image: "item:potion", text: "Battle item that heals the party member in the worst shape. An equipped Tide Pearl makes it stronger." },
        { name: "Ether Leaf", stat: "10+ MP", image: "item:ether", text: "Shop item that restores MP to the party member running driest. Very useful once skills matter." },
        { name: "Wake Leaf", stat: "Revive", image: "item:wakeLeaf", text: "Shop item that revives one fallen party member at half HP as long as someone is still standing to use it." },
        { name: "Smoke Nut", stat: "Stun", image: "item:smoke", text: "Shop item that can make an enemy lose a turn, mostly by making everyone cough with dignity." },
        { name: "Zoom Shell", stat: "Travel", image: "item:zoomShell", text: "Merfolk field item that returns the party to a town or castle already reached." },
        { name: "Kokhor", stat: "Battle", image: "item:kokhor", text: "Merfolk firewater. One round of huge strength, then a harsh hangover for the rest of that battle." },
        { name: "Encounter Dial", stat: "Postgame", image: "item:encounterDial", text: "Prize from the final Darhyn battle. Sets random encounters to normal, off, or a chosen step interval." },
        { name: "Honest Milk", stat: "Quest", image: "item:milk", text: "Awarded after Old Betsy is defeated, because DreamQuest believes in chores." },
        { name: "Water Scroll", stat: "Quest", image: "item:scroll", text: "Merfolk lore that confirms the Water Orb is outside the world." },
        { name: "Scribe Pass", stat: "Quest", image: "item:scribePass", text: "A market pass that proves the party survived Tealsburg bureaucracy with teeth." },
        { name: "Derlin Cell Key", stat: "Quest", image: "item:cellKey", text: "A Marhyn dungeon key with one important job: getting Derlin out of a cell." },
        { name: "VS Relic", stat: "Valena's Secret", image: "item:relic", text: "A Valena's Secret relic from the old DreamQuest site, hidden in Tealsburg for careful explorers." },
        { name: "Marsh Joke Book", stat: "Side", image: "item:book", text: "Optional marsh prize. Derlin's skill hits harder when he weaponizes jokes." }
      ],
      weapons: [
        { name: "Rune Sword", stat: "+4 ATK", image: "weapon:rune", text: "Delivered by eagles on the forest road before Freeton. Opens routes and reveals what ordinary steel cannot." },
        { name: "Light Sword", stat: "+8 ATK", image: "weapon:light", text: "Won in Freeton. Adds bonus damage, especially when Derlin attacks." },
        { name: "Derlin's Redblade", stat: "+6 ATK", image: "weapon:redblade", text: "A red-handled short sword for Derlin when the jokes need a sharper edge." },
        { name: "Breshen Longbow", stat: "+6 ATK", image: "weapon:longbow", text: "A clean elven bow that gives Dalin a real mid-game weapon path." },
        { name: "Old Yan's Knotted Staff", stat: "+3 ATK", image: "weapon:staff", text: "Old Yan's better staff. Still mostly for pointing, now with consequences." },
        { name: "Wind Dragon Staff", stat: "+8 ATK", image: "weapon:dragonstaff", text: "A restored Yan focus that pairs with the Wind Spell." },
        { name: "Yvonne's Crossbow", stat: "+7 ATK", image: "weapon:crossbow", text: "Part of Yvonne's kit. It makes Charm Shot useful against big targets." },
        { name: "Tealsburg Repeater", stat: "+10 ATK", image: "weapon:repeater", text: "A market-made repeating crossbow. The paperwork says it is almost certainly legal." },
        { name: "Moonbranch Scepter", stat: "+7 ATK", image: "weapon:branch", text: "A moonlit branch focus for Valena's healing rites and precise royal bonking." },
        { name: "Hano's Hammer", stat: "+10 ATK", image: "weapon:hammer", text: "Mostly used against you. Large, direct, and not interested in subtlety." }
      ],
      armor: [
        { name: "Road Cloak", stat: "+1 DEF", image: "armor:cloak", text: "A sturdy road cloak for weather, dust, and looking like you had a plan." },
        { name: "Apprentice Guard", stat: "+2 DEF", image: "armor:guard", text: "Light guard gear for Tarthur and Derlin." },
        { name: "Blue-Black Coat", stat: "+3 DEF", image: "armor:bluecoat", text: "Dungeon-styled protection copied from Marhyn's guards without the loyalty oath." },
        { name: "Derlin's Red Cloak", stat: "+4 DEF", image: "armor:derlinCloak", text: "Official party visibility gear. Offers no warranty against cows." },
        { name: "Elven Leafmail", stat: "+4 DEF", image: "armor:leafmail", text: "Breshen leafmail, formal enough for court and flexible enough for boss music." },
        { name: "Skyweave Robe", stat: "+3 DEF", image: "armor:skyweave", text: "A light robe threaded for casters who prefer not to get flattened." },
        { name: "Dragon Scale Mantle", stat: "+5 DEF", image: "armor:dragonmantle", text: "A late-game mantle that fits Yan better after he stops pretending to be ordinary." },
        { name: "Valena's Branch Guard", stat: "+4 DEF", image: "armor:branch", text: "A ceremonial defense that pairs with Sacred Branch." },
        { name: "VS Armor", stat: "+10 DEF", image: "armor:vs", text: "A very expensive Breshen armory special. It protects Yvonne because DreamQuest logic insists." }
      ],
      accessories: [
        { name: "Glass Flute", stat: "Fewer fights", image: "accessory:flute", text: "Optional cave reward. Equip it in an accessory slot to calm random encounters a little." },
        { name: "Befuddling Bell", stat: "Enemy skip", image: "accessory:bell", text: "Old Mill reward. Equip it as an accessory for a chance to distract enemies; carrying it is not enough." },
        { name: "Sky Charm", stat: "+2 DEF", image: "accessory:charm", text: "Optional shrine reward. Equip it to shave damage off enemy attacks." },
        { name: "Tide Pearl", stat: "Better items", image: "accessory:pearl", text: "Optional shoal treasure. Equip it to boost potion and ether recovery." },
        { name: "Moonthread Ring", stat: "-1 MP", image: "accessory:ring", text: "Caster accessory that reduces skill MP costs by 1 for its wearer." },
        { name: "Water Orb Focus", stat: "-1 MP", image: "accessory:orb", text: "The focus paired with the dream-born spell, not the Water Orb itself. Tarthur, Yan, and Valena can equip it to trim skill costs by 1 MP." }
      ],
      enemies: Object.entries(enemies).map(([id, enemy]) => ({
        name: enemy.name,
        stat: enemy.boss ? "Boss" : "Encounter",
        image: `enemy:${id}`,
        text: `HP ${enemy.hp} | ATK ${enemy.atk} | DEF ${enemy.def}`
      })),
      sidequests: [
        { name: "Old Mill", stat: "Krendon West", image: "sidequest:oldMill", text: "Help the miller recover the bell clapper, then return with the Rune Sword to beat the Dust Knight and earn the Befuddling Bell." },
        { name: "Star Shrine", stat: "Hawk East", image: "sidequest:skyShrine", text: "A quiet mountain shrine with a charm for careful explorers and a Cloudwalker mural nobody can fully explain yet." },
        { name: "Tide Cavern", stat: "Shoals West", image: "sidequest:tideCavern", text: "A merfolk side cave that opens after Tustor's Water Scroll and rewards a potion-boosting pearl." },
        { name: "Moon Marsh", stat: "Grassland West", image: "sidequest:moonMarsh", text: "A joke-haunted marsh with a wisp strong enough to warn underleveled parties away." },
        { name: "Market Maze", stat: "Tealsburg East", image: "sidequest:marketMaze", text: "A city side path with a paper mimic and extra supplies." },
        { name: "Glass Caves", stat: "Savannah East", image: "sidequest:glassCaves", text: "A late-game cave that expects the Market Maze's Scribe Pass before its deeper errand opens." }
      ],
      route: [
        { name: "1. Darhyn's Castle", stat: "Dream", image: "route:darhynCastle", text: "The fragile opening boss and a dream-born Water Orb Spell—the first clue to the real Orb's location." },
        { name: "2. Krendon", stat: "Story", image: "route:krendon", text: "Home town, Zelin, Derlin, and Old Betsy's regrettable battle theme." },
        { name: "3. Hawk Mountains", stat: "Story", image: "route:hawkMountains", text: "The road to the merfolk begins through mountain passes." },
        { name: "4. Merfolk Shoals", stat: "Story", image: "route:merfolkShoals", text: "Tustor explains why the quest is much stranger than expected." },
        { name: "5. Grassland", stat: "Story", image: "route:grassland", text: "Open fields, random battles, and Lithar's first unfair entrance." },
        { name: "6. Marhyn's Castle", stat: "Story", image: "route:marhynCastle", text: "Dungeon escape, Old Yan, Derlin, and blue-black guards." },
        { name: "7. Forest", stat: "Story", image: "route:forest", text: "A twisting path where Old Yan vanishes and eagles return the Rune Sword before Freeton." },
        { name: "8. Freeton", stat: "Story", image: "route:freeton", text: "The Rune Sword reveals Corizaz's hidden lair beneath town, where the very asleep wizard guards the Light Sword." },
        { name: "9. King's Highway", stat: "Story", image: "route:kingsHighway", text: "A boss encounter where Skull Knights keep reassembling until Yan appears and tells the party to run." },
        { name: "10. Tealsburg", stat: "Story", image: "route:tealsburg", text: "King Garkin, Yvonne, and royal errands with sharper stakes." },
        { name: "11. Northern Path", stat: "Story", image: "route:northernPath", text: "The route toward the elven city of Breshen." },
        { name: "12. Breshen", stat: "Story", image: "route:breshen", text: "Dalin reunites with his sister Valena, explains his escape, and Hano settles nothing with a hammer." },
        { name: "13. Savannah Plain", stat: "Story", image: "route:savannah", text: "The last open stretch before Darhyn's defenses." },
        { name: "14. Castle Rathskeller", stat: "Final", image: "route:rathskeller", text: "Ten doors, Wind Spell, Lithar, Death Lord Darhyn, and Yan's final transformation." }
      ]
    };

    function guideSpellImageForSkill(skill) {
      if (skill.type?.startsWith("heal") || skill.type === "revive") return "spell:heal";
      if (skill.name === "Wind Spell") return "spell:wind";
      if (skill.effect === "dragonSpell") return "spell:dragon";
      if (skill.effect === "charmShot") return skill.color === "#f2d977" ? "spell:bell" : "spell:charm";
      if (skill.effect === "redSlash") return "spell:flare";
      if (skill.effect === "runeSlash") return skill.requiresItem ? "spell:light" : "spell:rune";
      return "spell:water";
    }

    const musicTrackSources = {
      mainAdventure: "assets/generated/audio/dreamquest-main-adventure.mp3?v=20260525-lyra-main",
      waterMerfolk: "assets/generated/audio/dreamquest-water-merfolk.mp3?v=20260525-lyra",
      wilds: "assets/generated/audio/dreamquest-wilds-v2.mp3?v=20260525-lyra-pass",
      town: "assets/generated/audio/dreamquest-town-v3.mp3?v=20260711-rendered",
      shopMarket: "assets/generated/audio/dreamquest-shop-market-v2.mp3?v=20260525-lyra-pass",
      dungeon: "assets/generated/audio/dreamquest-dungeon-v3.mp3?v=20260525-lyra-pass",
      shrineMystic: "assets/generated/audio/dreamquest-shrine-mystic-v2.mp3?v=20260525-lyra-pass",
      battle: "assets/generated/audio/dreamquest-battle-v3.mp3?v=20260525-lyra-pass",
      bossBattle: "assets/generated/audio/dreamquest-boss-battle-v2.mp3?v=20260525-lyra-pass",
      finalBattle: "assets/generated/audio/dreamquest-final-battle-v2.mp3?v=20260525-lyra-pass",
      escape: "assets/generated/audio/dreamquest-escape.mp3?v=20260711-rendered",
      victory: "assets/generated/audio/dreamquest-victory.mp3?v=20260525-lyra"
    };

    const musicTrackThemeMap = {
      title: "mainAdventure",
      field: "mainAdventure",
      road: "mainAdventure",
      mountain: "wilds",
      forest: "wilds",
      water: "waterMerfolk",
      sand: "wilds",
      town: "town",
      shop: "shopMarket",
      market: "shopMarket",
      shrine: "shrineMystic",
      marsh: "dungeon",
      deepForest: "dungeon",
      castle: "dungeon",
      dungeon: "dungeon",
      glass: "shrineMystic",
      approach: "dungeon",
      battle: "battle",
      boss: "bossBattle",
      finalBattle: "finalBattle",
      escape: "escape",
      victory: "victory"
    };

    const musicTrackThemePlaylists = {
      title: ["mainAdventure", "wilds", "waterMerfolk", "shrineMystic"],
      field: ["mainAdventure", "wilds", "waterMerfolk", "shrineMystic"],
      road: ["mainAdventure", "wilds", "waterMerfolk", "shrineMystic"],
      mountain: ["wilds", "mainAdventure", "waterMerfolk", "shrineMystic"],
      forest: ["wilds", "waterMerfolk", "mainAdventure", "shrineMystic"],
      water: ["waterMerfolk", "shrineMystic", "mainAdventure", "wilds"],
      sand: ["wilds", "mainAdventure", "waterMerfolk", "shrineMystic"],
      town: ["town", "shopMarket", "mainAdventure", "wilds"],
      shop: ["shopMarket", "town", "mainAdventure", "wilds"],
      market: ["shopMarket", "town", "mainAdventure", "wilds"],
      shrine: ["shrineMystic", "waterMerfolk", "dungeon", "wilds"],
      marsh: ["dungeon", "shrineMystic", "wilds", "waterMerfolk"],
      deepForest: ["dungeon", "wilds", "shrineMystic", "waterMerfolk"],
      castle: ["dungeon", "shrineMystic", "wilds", "waterMerfolk"],
      dungeon: ["dungeon", "shrineMystic", "wilds", "waterMerfolk"],
      glass: ["shrineMystic", "waterMerfolk", "dungeon", "wilds"],
      approach: ["dungeon", "wilds", "shrineMystic", "waterMerfolk"],
      battle: ["battle", "escape"],
      boss: ["bossBattle", "battle", "finalBattle"],
      finalBattle: ["finalBattle", "bossBattle", "battle"],
      escape: ["escape", "battle", "wilds"],
      victory: ["victory", "mainAdventure", "town", "shopMarket"]
    };

    const musicTrackVolumes = {
      title: 0.82, field: 0.82, road: 0.82, mountain: 0.78, forest: 0.78, water: 0.8, sand: 0.78,
      town: 0.76, shop: 0.72, market: 0.72, shrine: 0.74, marsh: 0.74, deepForest: 0.74,
      castle: 0.76, dungeon: 0.76, glass: 0.74, approach: 0.76, battle: 0.82, boss: 0.84,
      finalBattle: 0.86, escape: 0.82, victory: 0.82
    };
    const areaOrder = [
      "darhynCastle",
      "krendon",
      "krendonRoad",
      "oldMill",
      "hawkMountains",
      "hawkSwitchback",
      "skyShrine",
      "merfolkShoals",
      "tideCavern",
      "grassland",
      "moonMarsh",
      "marhynCastle",
        "forest",
        "deepForest",
        "freeton",
        "corizazLair",
        "kingsHighway",
      "tealsburg",
      "marketMaze",
      "northernPath",
      "breshen",
      "savannah",
      "glassCaves",
      "rathskellerApproach",
      "rathskeller"
    ];

    const optionalAreaIds = new Set(["oldMill", "skyShrine", "tideCavern", "moonMarsh", "marketMaze", "glassCaves"]);

    const bookMapSize = { width: 433, height: 300 };
    const bookWorldPoints = {
      darhynCastle: { sx: 356, sy: 63 },
      krendon: { sx: 82, sy: 61 },
      krendonRoad: { sx: 111, sy: 81 },
      oldMill: { sx: 55, sy: 80 },
      hawkMountains: { sx: 42, sy: 57 },
      hawkSwitchback: { sx: 55, sy: 115 },
      skyShrine: { sx: 54, sy: 30 },
      merfolkShoals: { sx: 331, sy: 270 },
      tideCavern: { sx: 303, sy: 262 },
      grassland: { sx: 205, sy: 166 },
      moonMarsh: { sx: 178, sy: 204 },
      marhynCastle: { sx: 40, sy: 112 },
      forest: { sx: 249, sy: 62 },
      deepForest: { sx: 298, sy: 78 },
      freeton: { sx: 104, sy: 251 },
      corizazLair: { sx: 116, sy: 258 },
      kingsHighway: { sx: 199, sy: 218 },
      tealsburg: { sx: 128, sy: 123 },
      marketMaze: { sx: 145, sy: 137 },
      northernPath: { sx: 260, sy: 92 },
      breshen: { sx: 324, sy: 82 },
      savannah: { sx: 337, sy: 139 },
      glassCaves: { sx: 263, sy: 253 },
      rathskellerApproach: { sx: 350, sy: 92 },
      rathskeller: { sx: 377, sy: 62 }
    };

    const areaWorldParents = {
      krendonStable: "krendon",
      krendonShop: "krendon",
        tealsburgShop: "tealsburg",
        corizazLair: "freeton",
        marhynHalls: "marhynCastle",
      marhynWestCells: "marhynCastle",
      marhynArmory: "marhynCastle",
      marhynDerlinTower: "marhynCastle",
      marhynVault: "marhynCastle"
    };

    const areaMiniMapGroups = {
      krendon: {
        title: "Krendon Region",
        boardWidth: 42,
        boardHeight: 30,
        boards: {
          krendon: { x: 0.5, y: 0.44, links: ["krendonStable", "krendonShop", "krendonRoad", "oldMill"] },
          krendonStable: { x: 0.18, y: 0.73, links: ["krendon"] },
          krendonShop: { x: 0.78, y: 0.24, links: ["krendon"] },
          oldMill: { x: 0.2, y: 0.44, links: ["krendon"] },
          krendonRoad: { x: 0.74, y: 0.66, links: ["krendon"] }
        }
      },
      hawkMountains: {
        title: "Hawk Mountain Route",
        boardWidth: 42,
        boardHeight: 30,
        boards: {
          krendonRoad: { x: 0.16, y: 0.26, links: ["hawkMountains"] },
          hawkMountains: { x: 0.38, y: 0.38, links: ["krendonRoad", "hawkSwitchback", "skyShrine"] },
          skyShrine: { x: 0.62, y: 0.14, links: ["hawkMountains"] },
          hawkSwitchback: { x: 0.6, y: 0.62, links: ["hawkMountains", "merfolkShoals"] },
          merfolkShoals: { x: 0.84, y: 0.82, links: ["hawkSwitchback"] }
        }
      },
      merfolkShoals: {
        title: "Shoals & Grassland",
        boardWidth: 40,
        boardHeight: 29,
        boards: {
          hawkSwitchback: { x: 0.16, y: 0.22, links: ["merfolkShoals"] },
          merfolkShoals: { x: 0.42, y: 0.38, links: ["hawkSwitchback", "tideCavern", "grassland"] },
          tideCavern: { x: 0.18, y: 0.62, links: ["merfolkShoals"] },
          grassland: { x: 0.66, y: 0.62, links: ["merfolkShoals", "moonMarsh", "marhynCastle"] },
          moonMarsh: { x: 0.5, y: 0.86, links: ["grassland"] },
          marhynCastle: { x: 0.86, y: 0.82, links: ["grassland"] }
        }
      },
      marhynCastle: {
        title: "Marhyn Dungeons",
        boardWidth: 40,
        boardHeight: 29,
        boards: {
          marhynWestCells: { x: 0.18, y: 0.24, links: ["marhynHalls"] },
          marhynArmory: { x: 0.5, y: 0.18, links: ["marhynHalls", "marhynVault"] },
          marhynDerlinTower: { x: 0.82, y: 0.24, links: ["marhynHalls"] },
          marhynHalls: { x: 0.5, y: 0.56, links: ["marhynCastle", "marhynVault", "marhynWestCells", "marhynArmory", "marhynDerlinTower"] },
          marhynCastle: { x: 0.28, y: 0.86, links: ["marhynHalls"] },
          marhynVault: { x: 0.72, y: 0.86, links: ["marhynHalls", "marhynArmory"] }
        }
      },
      forest: {
        title: "Forest Road",
        boardWidth: 42,
        boardHeight: 30,
        boards: {
          marhynCastle: { x: 0.12, y: 0.5, links: ["forest"] },
          forest: { x: 0.34, y: 0.34, links: ["marhynCastle", "deepForest"] },
          deepForest: { x: 0.58, y: 0.5, links: ["forest", "freeton"] },
            freeton: { x: 0.76, y: 0.7, links: ["deepForest", "corizazLair", "kingsHighway"] },
            corizazLair: { x: 0.88, y: 0.78, links: ["freeton"] },
            kingsHighway: { x: 0.9, y: 0.42, links: ["freeton"] }
        }
      },
      tealsburg: {
        title: "Tealsburg Region",
        boardWidth: 42,
        boardHeight: 30,
        boards: {
          kingsHighway: { x: 0.16, y: 0.62, links: ["tealsburg"] },
          tealsburg: { x: 0.44, y: 0.48, links: ["kingsHighway", "tealsburgShop", "marketMaze", "northernPath"] },
          tealsburgShop: { x: 0.78, y: 0.36, links: ["tealsburg"] },
          marketMaze: { x: 0.62, y: 0.72, links: ["tealsburg"] },
          northernPath: { x: 0.66, y: 0.18, links: ["tealsburg", "breshen"] },
          breshen: { x: 0.9, y: 0.16, links: ["northernPath"] }
        }
      },
      breshen: {
        title: "Breshen Frontier",
        boardWidth: 42,
        boardHeight: 30,
        boards: {
          northernPath: { x: 0.12, y: 0.38, links: ["breshen"] },
          breshen: { x: 0.34, y: 0.36, links: ["northernPath", "savannah"] },
          savannah: { x: 0.56, y: 0.55, links: ["breshen", "glassCaves", "rathskellerApproach"] },
          glassCaves: { x: 0.42, y: 0.82, links: ["savannah"] },
          rathskellerApproach: { x: 0.78, y: 0.46, links: ["savannah", "rathskeller"] },
          rathskeller: { x: 0.9, y: 0.18, links: ["rathskellerApproach"] }
        }
      }
    };

    const areas = {
        darhynCastle: {
          name: "Darhyn's Castle",
          start: [12, 17],
          theme: "floor",
          encounterRate: 0,
          map: [
            "#########################",
            "#########_______#########",
            "#########_~~~~~_#########",
            "#########_~~C~~_#########",
            "#########_______#########",
            "#########_______#########",
            "###########___###########",
            "############+############",
            "###___________________###",
            "###__#______#______#__###",
            "###_________B_________###",
            "###___________________###",
            "###____#_________#____###",
            "###___________________###",
            "###___________________###",
            "###____#_________#____###",
            "###___________________###",
            "###_________!_________###",
            "#####_______________#####",
            "#########_______#########",
            "#########################"
          ],
        events: [
          {
              id: "dream_intro",
              x: 12,
              y: 17,
            icon: "!",
            once: true,
            lines: [
              ["Narrator", "After many long trials, Tarthur finally stands inside Darhyn's castle. The Death Lord awaits. Probably."],
              ["Tarthur", "This is exactly how heroic destiny starts: confused, indoors, and underleveled."]
            ]
          },
          {
              id: "orb_seal",
              x: 12,
              y: 7,
            icon: "+",
            hideWhenFlag: "dreamDarhynDefeated",
            lines: [
              ["Narrator", "A blue seal bars the orb chamber. Darhyn's extremely fragile authority still counts as authority."],
              ["Tarthur", "So first I defeat the throne-room problem, then I loot the mystical water thing. Standard hero order."]
            ]
          },
          {
              id: "dream_darhyn",
              x: 12,
              y: 10,
            icon: "D",
            boss: "dreamDarhyn",
            after: () => {
              flag("dreamDarhynDefeated");
              say([
                ["Darhyn", "No! My one hit point! My only weakness!"],
                ["Tarthur", "That was either destiny or a tutorial with self-esteem problems."]
              ]);
            }
          },
          {
              id: "water_orb",
              x: 12,
              y: 3,
            icon: "C",
            requires: "dreamDarhynDefeated",
            once: true,
            cutscene: "waterOrbWarp",
            action: () => {
              addItem("Water Orb Spell", 1);
              addItem("Water Orb Focus", 1);
              flag("waterSpellDream");
              say([
                ["Narrator", waterOrbAcquisitionText],
                ["Tarthur", "This is not the Orb. It is a spell carrying part of its power."],
                ["Narrator", "The focus answers him. The spell erupts, the dream castle folds inward, and morning returns in Krendon."]
              ], () => playWaterOrbTransition(() => showCutscene("krendonWake", () => travelTo("krendon", 15, 15, true))));
            }
          }
        ]
      },
      krendon: {
        name: "Krendon",
        start: [15, 15],
        theme: "grass",
        encounterRate: 0,
        map: [
          "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
          "TppTTT....,,,....TTTpppTTT..TTT",
          "Tt....rrrr....b.....rrrrr....TT",
          "T..b..rxxr....===...rrrrr..b.TT",
          "T.....wddw...=====..wwwww....TT",
          "T..g..wwww....===...wwwww..b.TT",
          "T..gg..ff......=....wwdww....TT",
          "T..............=............T.T",
          "T..rrrr........=........rrrr..T",
          "T..rxxr.....N..=....b...rxxr.TT",
          "T..wddw...=============.wwdw.TT",
          "T..wwww...=....=.....=..wwww.TT",
          "T...ff....=....=.....=....ff.TT",
          "T.........=....=.....=.......TT",
          "=..b......======.....=..b....TT",
          "T......b.......@.....=.......TT",
          "T..............=.....=.......TT",
          "T........N.....=....C=.......TT",
          "T..............=.............TT",
          "T..rrrr....====.====....rrrr.TT",
          "T..wwdw....=.......=....wwdw.TT",
          "T.........==.......==........TT",
          "TTTTTTTTTTTTTTT=TTTTTTTTTTTTTTT"
        ],
        events: [
          {
            id: "wake_krendon",
            x: 15,
            y: 15,
            icon: "!",
            hidden: true,
            once: true,
            lines: [
              ["Derlin", "You shouted 'my only weakness' in your sleep again."],
              ["Tarthur", "That means the prophecy is working."],
              ["Derlin", "It means Darac wants you at the forge and Judith wants someone brave enough to milk Old Betsy."],
              ["Narrator", "Derlin joined the party. He brought a red cloak and absolutely no adult supervision."]
            ],
            after: () => addParty("derlin")
          },
          {
            id: "wake_derlin",
            x: 14,
            y: 15,
            icon: "D",
            facePlayer: true,
            hideWhenParty: "derlin",
            lines: [["Derlin", "I am right here. Finish waking up, then we can go be unsupervised."]]
          },
          {
            id: "zelin",
            x: 12,
            y: 9,
            icon: "Z",
            lines: [
              ["Zelin", "What you carried from the dream is the Water Orb Spell and its focus, not the Orb itself. The true Orb is outside this world, and the merfolk know why."],
              ["Derlin", "Can the merfolk also explain why the cow has boss music?"],
              ["Zelin", "Old Betsy is in the southwest stable. She respects only turn-based combat."]
            ],
            after: () => flag("metZelin")
          },
          {
            id: "krendon_stable_door",
            x: 5,
            y: 20,
            icon: "!",
            hidden: true,
            requires: "metZelin",
            action: () => travelTo("krendonStable", 5, 6)
          },
          {
            id: "krendon_stable_sign",
            x: 4,
            y: 20,
            icon: "$",
            signIcon: "stable",
            lines: [["Stable Sign", "Krendon Stable. Old Betsy accepts hay, patience, and combat initiative."]]
          },
          {
            id: "morty",
            x: 9,
            y: 17,
            icon: "M",
            lines: [
              ["Morty", "My dad says heroes have cheekbones. You have chores."],
              ["Tarthur", "My sword says you are standing inside its personal space."],
              ["Morty", "Fine. Take this potion. I was saving it for when I become interesting."]
            ],
            once: true,
            after: () => addItem("Potion", 1)
          },
          {
            id: "krendon_shop_sign",
            x: 23,
            y: 7,
            icon: "$",
            lines: [["Shop Sign", "Krendon Supply Counter. Door opens inward, prices open upward."]]
          },
          {
            id: "krendon_shop_door",
            x: 22,
            y: 6,
            icon: "!",
            hidden: true,
            action: () => travelTo("krendonShop", 4, 5)
          },
          {
            id: "krendon_chest",
            x: 20,
            y: 17,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The chest contains 18 gold and a potion.",
              "The chest contains 18 gold and a handwritten note: 'For whoever finally cleans the barn.'",
              "The chest contains 18 gold and a handwritten note: 'For whoever finally cleans the barn.' The barn remains undefeated."
            )]],
            after: () => {
              addGold(18);
              addItem("Potion", 1);
            }
          }
        ],
        exits: [
          { edge: "west", to: "oldMill", x: 21, y: 9 },
          { edge: "south", to: "krendonRoad", requires: "milkedBetsy", x: 9, y: 1 }
        ]
      },
      krendonStable: {
        name: "Krendon Stable",
        start: [5, 6],
        theme: "floor",
        encounterRate: 0,
        map: [
          "###########",
          "#___c_____#",
          "#_ff___ff_#",
          "#_f___B_f_#",
          "#_ff___ff_#",
          "#_________#",
          "#____@____#",
          "#####=#####"
        ],
        events: [
          {
            id: "betsy",
            x: 5,
            y: 3,
            icon: "B",
            requires: "metZelin",
            boss: "oldBetsy",
            persistAfterComplete: true,
            repeatLines: [
              ["Old Betsy", "Moo."],
              ["Narrator", "Old Betsy remains in the stable, undefeated in spirit and no longer available for rematches."]
            ],
            itemRewards: [
              { name: "Honest Milk", count: 1, key: true },
              { name: "Potion", count: 2 }
            ],
            after: () => {
              flag("milkedBetsy");
              say([
                ["Old Betsy", "Moo."],
                ["Derlin", "That was not consent. That was grudging respect."],
                ["Narrator", "Chore complete. The Hawk Mountains road opens."]
              ]);
            }
          }
        ],
        exits: [{ edge: "south", to: "krendon", x: 5, y: 21 }]
      },
      krendonShop: {
        name: "Krendon Supply Counter",
        start: [4, 5],
        theme: "floor",
        encounterRate: 0,
        map: [
          "#########",
          "#_______#",
          "#_______#",
          "#_ccccc_#",
          "#_______#",
          "#___@___#",
          "####=####"
        ],
        events: [
          {
            id: "krendon_shopkeeper",
            x: 4,
            y: 2,
            icon: "S",
            facePlayer: true,
            lines: [["Shopkeeper", "Step up to the counter. Retail works best with furniture between us."]]
          },
          {
            id: "krendon_shop_counter",
            x: 4,
            y: 3,
            icon: "!",
            hidden: true,
            action: () => openShop("krendon")
          }
        ],
        exits: [{ edge: "south", to: "krendon", x: 22, y: 7 }]
      },
      krendonRoad: {
        name: "Krendon South Road",
        start: [9, 1],
        theme: "grass",
        encounterRate: 0.08,
        encounters: ["mole"],
        map: [
          "TTTTTTTTT=TTTTTTTTT",
          "T..b....===....b..T",
          "T..p.....=.....t..T",
          "T........=........T",
          "T..rrrr..=..rrrr..T",
          "T..wwdw..=..wwdw..T",
          "T........=........T",
          "T..b...=====...b..T",
          "T......=...=......T",
          "T......=...=..C...T",
          "T......=...=......T",
          "T..b...=N..=...t..T",
          "T......=====......T",
          "T..t.....=.....p..T",
          "T........=........T",
          "T...b....=....b...T",
          "T......=====......T",
          "T......=...=......T",
          "T..p...=...=...t..T",
          "T......=...=......T",
          "T......=====......T",
          "T........=........T",
          "T..b.....=.....b..T",
          "TTTTTTTTT=TTTTTTTTT"
        ],
        events: [
          {
            id: "krendon_road_sign",
            x: 8,
            y: 11,
            icon: "!",
            once: true,
            lines: [
              ["Road Sign", "North: Krendon. South: Hawk Mountains. West: absolutely not a shortcut."],
              ["Derlin", "The sign knows us too well."]
            ]
          },
          {
            id: "road_cache",
            x: 14,
            y: 9,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The roadside stash contains 25 gold.",
              "A roadside stash contains 25 gold and a coupon for one free prophecy clarification. It expired years ago.",
              "A roadside stash contains 25 gold and a coupon for one free prophecy clarification. It expired years ago, which explains the prophecy."
            )]],
            after: () => {
              addGold(25);
            }
          }
        ],
        exits: [
          { edge: "north", to: "krendon", x: 15, y: 21 },
            { edge: "south", to: "hawkMountains", x: 11, y: 1 }
        ]
      },
      oldMill: {
        name: "Old Mill",
        start: [21, 9],
        theme: "path",
        encounterRate: 0.06,
        encounters: ["mole"],
        map: [
          "TTTTTTTTTTTTTTTTTTTTTTT",
          "T....rrrrrr....T......T",
          "T....rxxxxr.C..T......T",
          "T....wddddw....T......T",
          "T....wwwwww....T......T",
          "T..======ff....T......T",
          "T..=..N..=............T",
          "T..=.....=....rrrr....T",
          "T..=..=====...wwdw....=",
          "T..=..=..B=...wwww....=",
          "T..=..=====.........b.T",
          "T..=...........ffff...T",
          "T..====..T...........TT",
          "T....C...T....b......TT",
          "T........T...........TT",
          "T..b.............p...TT",
          "T............b.......TT",
          "TTTTTTTTTTTTTTTTTTTTTTT"
        ],
        events: [
          {
            id: "mill_martha",
            x: 6,
            y: 6,
            icon: "M",
            lines: [
              ["Martha", "The old mill bell lost its clapper. Now the flour is gloomy and the bread tastes like architecture."],
              ["Derlin", "I am not qualified for agriculture, but I am extremely qualified to hit a thief-shaped problem."],
              ["Martha", "Check the dusty gear room. It has been coughing in iambic pentameter."],
              ["Martha", "Ordinary steel will not break the enchantment. If the road carries you forward before you find a Rune Sword, use this Zoom Shell to return to Krendon later."],
              ["Narrator", "Martha gives the party a free Zoom Shell and marks the Old Mill in the sidequest journal."]
            ],
            after: () => {
              flag("millQuest");
              addItem("Zoom Shell", 1);
            }
          },
          {
            id: "dust_knight",
            x: 9,
            y: 9,
            icon: "L",
            requires: "millQuest",
            disguiseUntilItem: "Rune Sword",
            gateItem: "Rune Sword",
            gateLines: [
              ["Dusty Miller", "No clapper here. Just a very ordinary person standing in a gear room for normal flour reasons."],
              ["Tarthur", "The Rune Sword would probably have an opinion about that."],
              ["Martha", "Come back when you have it. The mill has been lying to me in work boots."]
            ],
            boss: "dustKnight",
            preBattleLines: [
              ["Narrator", "The Rune Sword flashes. The dusty miller shape splits apart, revealing armor packed with old gears and bad intentions."],
              ["Dust Knight", "Ah. A Rune Sword. Finally, someone brought punctuation to a clanking debate."],
              ["Derlin", "And because the first warning sounded extremely expensive."]
            ],
            after: () => {
              flag("millSaved");
              addItem("Befuddling Bell", 1);
              say([
                ["Dust Knight", "I was only guarding the clapper because no one appreciates good acoustics."],
                ["Martha", "Take this Befuddling Bell. Equip it if you want monsters distracted and several town committees annoyed."]
              ]);
            }
          },
          {
            id: "mill_cache",
            x: 5,
            y: 13,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The flour-dusted chest holds 22 gold and a potion.",
              "A flour-dusted chest holds 22 gold and a potion that may once have been jam.",
              "A flour-dusted chest holds 22 gold and a potion that may once have been jam. The mill refuses to comment."
            )]],
            after: () => {
              addGold(22);
              addItem("Potion", 1);
            }
          },
          {
            id: "mill_loft",
            x: 12,
            y: 2,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The loft chest contains 2 potions.",
              "The loft chest contains a recipe for heroic biscuits and 2 potions. You keep the useful part.",
              "The loft chest contains a recipe for heroic biscuits and 2 potions. You keep the useful part, which is not the biscuits."
            )]],
            after: () => addItem("Potion", 2)
          }
        ],
        exits: [{ edge: "east", to: "krendon", x: 1, y: 14 }]
      },
          hawkMountains: {
            name: "Hawk Mountains",
          start: [11, 1],
          theme: "mountain",
          encounterRate: 0.16,
          encounters: ["mole", "chomonster"],
          map: [
            "^^^^^^^^^^^=^^^^^^^^^^^",
            "^^^^...^^^^@^^^^...^^^^",
            "^^..===^^^.=.^^^===..^^",
            "^..==..^^..D..^^..==..^",
            "^..=...^^=====^^...=..^",
            "^..=C..^^..=..^^..=...=",
            "^^.===^^^^.=.^^^^===.^^",
            "^^...=....===....=...^^",
            "^^^^.=.^^^...^^^.=.^^^^",
            "^....=.^^^...^^^.=....^",
            "^..===.......===.=.^^^^",
            "^..=..^^^^.^^^^..=....^",
            "^..=.....=.=.....=..b.^",
            "^^.===^^^^=.=^^^^===.^^",
            "^^...=....===....=...^^",
            "^^^^...^^^^=^^^^...^^^^",
            "^^^^^^^^^^^=^^^^^^^^^^^"
          ],
        events: [
          {
              id: "dalin_join",
              x: 11,
              y: 3,
            icon: "D",
            facing: "down",
            once: true,
            lines: [
              ["Dalin", "I am Dalin, prince of the elves. I have healing magic, a longbow, and only moderate concern about your planning."],
              ["Derlin", "We accept all three."],
              ["Narrator", "Dalin joined the party. The average party competence increased sharply."]
            ],
            after: () => addParty("dalin")
          },
          {
              id: "mountain_cache",
              x: 4,
              y: 5,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The hiker's cache holds 2 potions.",
              "A hiker's cache holds 2 potions and a snack labeled 'probably not cursed.'",
              "A hiker's cache holds 2 potions and a snack labeled 'probably not cursed.' This is not a standard safety rating."
            )]],
            after: () => addItem("Potion", 2)
          }
        ],
          exits: [
            { edge: "north", to: "krendonRoad", x: 9, y: 22 },
            { edge: "east", to: "skyShrine", x: 1, y: 8 },
            { edge: "south", to: "hawkSwitchback", requiresParty: "dalin", x: 11, y: 1 }
          ]
        },
        hawkSwitchback: {
          name: "Hawk Switchback",
          start: [11, 1],
          theme: "mountain",
          encounterRate: 0.18,
          encounters: ["mole", "chomonster"],
          map: [
            "^^^^^^^^^^^=^^^^^^^^^^^",
            "^^^^...^^^^@^^^^...^^^^",
            "^^..===^^^.=.^^^....^^^",
            "^..==..^^..=..^^..==..^",
            "^..=...^^=====^^..=C..^",
            "^..=..^^^^...^^^^.=...^",
            "^^.===....=....===.^^^^",
            "^^...=..^^=^^..=...p^^^",
            "^^^^.=..^^=^^..=.^^^^^^",
            "^....=....=....=.....^^",
            "^..=====^^=^^=====...^^",
            "^..=.....=.=.....=..b.^",
            "^..=.^^^^=.=^^^^.=....^",
            "^^.===...=.=...===.^^^^",
            "^^...=....=....=...t^^^",
            "^^^^...^^^^=^^^^...^^^^",
            "^^^^^^^^^^^^^^^^^^=^^^^"
          ],
        events: [
          {
              id: "hawk_switchback_view",
            x: 10,
            y: 7,
            icon: "!",
            once: true,
            lines: [
              ["Dalin", "Stop here. The center descent ends on a false shelf, but the pale stones angle safely toward the shoals."],
              ["Derlin", "A prince who updates the map before we get lost. Keep him."],
              ["Narrator", "Dalin marks the correct fork as the party reaches it. The road to the shoals is now clear."]
            ],
            after: () => flag("switchbackSurveyed")
          },
          {
              id: "switchback_cache",
              x: 19,
              y: 4,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The climber's lockbox contains 2 potions.",
              "A climber's lockbox contains 2 potions and a note reading 'knees are a limited resource.'",
              "A climber's lockbox contains 2 potions and a note reading 'knees are a limited resource.' The mountain agrees too loudly."
            )]],
            after: () => addItem("Potion", 2)
          }
        ],
          exits: [
            { edge: "north", to: "hawkMountains", x: 11, y: 15 },
            {
              edge: "south",
              to: "merfolkShoals",
              requires: "switchbackSurveyed",
              x: 11,
              y: 1,
              blockedLines: [["Dalin", "Not from here. The safe trail drops from the eastern overlook; let me mark the pale stones first."]]
            }
          ]
        },
        skyShrine: {
          name: "Star Shrine",
          start: [1, 8],
          theme: "mountain",
          encounterRate: 0.04,
          encounters: ["mole"],
          map: [
            "^^^^^^^^^^^^^^^^^^^^^^^",
            "^^^^...^^^^=^^^^...^^^^",
            "^^..===^^^.=.^^^===..^^",
            "^..==..^^..=..^^..==..^",
            "^..=..C^^=====^^C..=..^",
            "^..===.^^..=..^^.===..^",
            "^^.....^^^^=^^^^.....^^",
            "^^.========.========.^^",
            "=.....====S====.....^^^",
            "^^.========.========.^^",
            "^^.....^^^^=^^^^.....^^",
            "^..===.^^..=..^^.===..^",
            "^..=...^^=====^^...=..^",
            "^..==..^^..=..^^..==..^",
            "^^..===^^^.=.^^^===..^^",
            "^^^^...^^^^=^^^^...^^^^",
            "^^^^^^^^^^^^^^^^^^^^^^^"
          ],
        events: [
          {
              id: "star_shrine_voice",
              x: 10,
              y: 8,
            icon: "S",
            once: true,
            gateFlags: ["starWestObserved", "starEastObserved"],
            gateLines: [
              ["Shrine", "Two star niches hold the answer. Observe both lights before speaking the sky-name."],
              ["Dalin", "One niche lies west, one east. Their temperatures and shadows should form a pattern."]
            ],
            lines: [
              ["Tarthur", "The cold western star points east. The warm eastern star points west. Both shadows meet at the shrine."],
              ["Shrine", "Observed, compared, understood. That is rarer than guessing correctly."],
              ["Derlin", "We solved a shrine without answering 'prophecy.' Personal growth."]
            ],
            after: () => {
              flag("skyShrineSolved");
              addItem("Sky Charm", 1);
              say([["Narrator", "The Star Shrine gives you a Sky Charm. Equip it as an accessory when enemy attacks need to lose a little confidence."]]);
            }
          },
          {
              id: "star_cache_west",
              x: 6,
              y: 4,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The shrine niche holds 28 gold.",
              "A shrine niche holds 28 gold and a note: 'Do not lick the meteorite.'",
              "A shrine niche holds 28 gold and a note: 'Do not lick the meteorite.' Someone learned this the expensive way."
            )]],
            after: () => {
              flag("starWestObserved");
              addGold(28);
            }
          },
          {
              id: "star_cache_east",
              x: 16,
              y: 4,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The second niche contains 2 potions and a folded robe.",
              "A second niche contains 2 potions and a folded robe. Mountain monks believe in symmetry.",
              "A second niche contains 2 potions and a folded robe. Mountain monks believe in symmetry and suspiciously convenient storage."
            )]],
            after: () => {
              flag("starEastObserved");
              addItem("Potion", 2);
              addItem("Skyweave Robe", 1);
            }
          }
        ],
          exits: [{ edge: "west", to: "hawkMountains", x: 21, y: 5 }]
        },
        merfolkShoals: {
          name: "Shoals of Merfolk",
          start: [11, 1],
          theme: "water",
          encounterRate: 0.08,
        encounters: ["chomonster", "bogWisp"],
          map: [
            "~~~~~~~~~~~=~~~~~~~~~~~",
            "~~~~~~sssss@sssss~~~~~~",
            "~~~~~ssssssNssssss~~~~~",
            "~~~~sssssssssssssss~~~~",
            "~~~sssssss===sssssss~~~",
            "~~~ssssss=====ssssss~~~",
            "~~~~sssss=====sssss~~~~",
            "~~~~~ssss=====ssss~~~~~",
            "=sssssssssssssssssssss~",
            "~~~~~ssss=====ssss~~~~~",
            "~~~~sssss=====sssss~~~~",
            "~~~ssssss=====ssssss~~~",
            "~~~sssssss===sssssss~~~",
            "~~~~ssssssCssssss~~~~~~",
            "~~~~~sssssssssssss~~~~~",
            "~~~~~~sssss=sssss~~~~~~",
            "~~~~~~~~~~~=~~~~~~~~~~~"
          ],
        events: [
          {
              id: "tustor_grave",
              x: 11,
              y: 2,
            icon: "T",
            once: true,
            deferComplete: true,
            completedPosition: [12, 2],
            completedFacing: "left",
            lines: [
              ["Chairman Eor", "Merwizard Tustor is dead, which has made meetings shorter but much less useful."],
              ["Tarthur", "The dream chest gave me a Water Orb Spell and focus, but not the Orb itself."],
              ["Derlin", "That sentence should not solve anything, yet here we are."]
            ],
            after: () => showCutscene("tustorResurrection", () => playTustorResurrection())
          },
          {
              id: "chairman_eor",
              x: 10,
              y: 2,
            icon: "T",
            requires: "tustorRaised",
            lines: [
              ["Chairman Eor", "Tustor is back, which has made meetings longer but much more useful."],
              ["Derlin", "A rare political trade where everyone somehow loses and wins."]
            ]
          },
          {
              id: "shoal_cache",
              x: 10,
              y: 13,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The coral chest contains 30 gold and a potion.",
              "The coral chest opens with a wet pop. You gain 30 gold and a potion that tastes aggressively blue.",
              "The coral chest opens with a wet pop. You gain 30 gold and a potion that tastes aggressively blue, like a color with legal representation."
            )]],
            after: () => {
              addGold(30);
              addItem("Potion", 1);
            }
          },
          {
              id: "merfolk_innkeeper",
              x: 12,
              y: 13,
            icon: "S",
            facing: "down",
            staticPose: true,
            action: () => stayAtInn("Coral Nap Alcove", 12)
          },
          {
              id: "merfolk_tide_market",
              x: 13,
              y: 13,
            icon: "$",
            signIcon: "shell",
            action: () => openShop("merfolk")
          }
        ],
          exits: [
            { edge: "north", to: "hawkSwitchback", x: 11, y: 15 },
            {
              edge: "west",
              to: "tideCavern",
              requiresItem: "Water Scroll",
              blockedLines: [["Tide Priest", "That western current is sealed until Tustor's Water Scroll names you as tide-friends. Please do not make me invent a wetter title."]],
              x: 19,
              y: 8
            },
            { edge: "south", to: "grassland", requires: "tustorRaised", x: 10, y: 1 }
          ]
        },
        tideCavern: {
          name: "Tide Cavern",
          start: [19, 8],
          theme: "water",
          encounterRate: 0.1,
          encounters: ["chomonster"],
          map: [
            "~~~~~~~~~~~~~~~~~~~~~~~",
            "~~sss_____~~~_____sss~~",
            "~ss_###___~_~___###_ss~",
            "~s__#C#___~_~___#C#__s~",
            "~s__###___~_~___###__s~",
            "~ss____====~===_____ss~",
            "~~s_###_~~~~~~~_###_s~~",
            "~~s_#___~~~~~___#Ns~~~~",
            "~~~@___========____@===",
            "~~s_#___~~~=~~~___#_s~~",
            "~~s_###___~=~___###_s~~",
            "~ss____====R====____ss~",
            "~s__###___~=~___###__s~",
            "~s__#C#___~C~___#C#__s~",
            "~ss_###___~_~___###_ss~",
            "~~sss_____~~~_____sss~~",
            "~~~~~~~~~~~~~~~~~~~~~~~"
          ],
        events: [
          {
              id: "tide_priest",
              x: 17,
              y: 7,
            icon: "T",
            lines: [
              ["Tide Priest", "The River Slime Regent has declared this cavern a monarchy."],
              ["Derlin", "Does slime understand government?"],
              ["Tide Priest", "It understands crowns, taxes, and being inconvenient."]
            ],
            after: () => flag("tideQuest")
          },
          {
            id: "river_slime_regent",
              x: 11,
              y: 11,
            icon: "R",
            requires: "tideQuest",
            gateFlags: ["tideWestSluice", "tideEastSluice"],
            gateLines: [["Tide Priest", "The Regent is protected by pressure wards. Open the western and eastern sluices before challenging it."]],
            boss: "riverSlime",
            after: () => {
              flag("tideRegentDefeated");
              addItem("Tide Pearl", 1);
              say([
                ["River Slime Regent", "Gloooorp, abdication."],
                ["Tide Priest", "Take the Tide Pearl. Equip it when potions need to taste less like medicinal regret."]
              ]);
            }
          },
          {
            id: "tide_west_sluice",
            x: 7,
            y: 5,
            icon: "!",
            requires: "tideQuest",
            once: true,
            lines: [["Dalin", "The western sluice is jammed with pearlstone. Together—turn, lift, and do not ask what is dripping."], ["Narrator", "The western channel opens. One pressure ward fades."]],
            after: () => flag("tideWestSluice")
          },
          {
            id: "tide_east_sluice",
            x: 15,
            y: 5,
            icon: "!",
            requires: "tideQuest",
            once: true,
            lines: [["Derlin", "This wheel says clockwise. I distrust its confidence, so I am turning it the other way."], ["Narrator", "The eastern channel opens. The Regent's second pressure ward collapses."]],
            after: () => flag("tideEastSluice")
          },
          {
              id: "tide_cache",
            x: 11,
            y: 13,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The barnacle-locked chest contains 45 gold.",
              "A barnacle-locked chest gives up 45 gold after several damp, impolite minutes with its hinges.",
              "A barnacle-locked chest gives up 45 gold after several damp, impolite minutes with its hinges. The hinges file a grievance."
            )]],
            after: () => {
              addGold(45);
            }
          }
        ],
          exits: [{ edge: "east", to: "merfolkShoals", x: 1, y: 8 }]
        },
        grassland: {
          name: "Grassland",
          start: [10, 1],
          theme: "grass",
          encounterRate: 0.18,
        encounters: ["goblin", "chomonster", "roadBandit"],
          map: [
            ",,,,,,,,,,,=,,,,,,,,,,,",
            ",,TT,,,,,,@,,,,,,TT,,,,",
            ",,T,,,====.====,,,T,,,,",
            ",,,,,,=,,,=,,,=,,,,,,,,",
            ",,b,,,=,,===,,=,,,b,,,,",
            ",,,,===,,TTT,,===,,,,,,",
            ",,,,=,,,,,=,,,,,=,,,,,,",
            ",,T,=,C,,,=,,,b,=,T,,,,",
            "=,,,=====,,,=====,,,,,,",
            ",,,,,,,===L===,,,,,,,,,",
            ",,TT,,,,,=,,,,,TT,,,,,,",
            ",,,,====,=,====,,,,,,,,",
            ",,b,=,,,,=,,,,=,,,b,,,,",
            ",,,,=,,TTTTT,,=,,,,,,,,",
            ",,,,======.======,,,,,,",
            ",,,,,,,,,,=,,,,,,,,,,,,",
            ",,,,,,,,,,,,,,,,,,,,,,,"
          ],
        events: [
          {
              id: "lithar_ambush",
              x: 10,
              y: 9,
            icon: "L",
            once: true,
            cutscene: "litharAmbush",
            boss: "lithar1",
            battleEnemies: ["lithar1", "goblin", "goblin"],
            after: () => {
              flag("capturedByLithar");
              showCutscene("marhynCapture", () => {
                say([
                  ["Lithar", "I am Lithar Lifehater. My armor has blades because subtlety lost a committee vote."],
                  ["Queen Marhyn", "Separate cells. Separate hopes. It is tidier that way."],
                  ["Narrator", "The party is dragged beneath Marhyn's castle. In the chaos, Dalin is separated from the others and hauled away by a second guard detail."]
                ], () => {
                  setParty(["tarthur"]);
                  travelTo("marhynCastle", 3, 14, true);
                });
              });
            }
          },
          {
              id: "grass_cache",
              x: 6,
              y: 7,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The supply bag contains 3 potions.",
              "A supply bag contains 3 potions and a note: 'For travelers with unlucky timing, probably.'",
              "A supply bag contains 3 potions and a note: 'For travelers with unlucky timing, probably.' It knows its target audience."
            )]],
            after: () => addItem("Potion", 3)
          }
        ],
          exits: [
            { edge: "north", to: "merfolkShoals", x: 11, y: 15 },
            { edge: "west", to: "moonMarsh", x: 20, y: 5 }
          ]
        },
        moonMarsh: {
          name: "Moon Marsh",
          start: [20, 5],
          theme: "water",
          encounterRate: 0.14,
        encounters: ["chomonster", "bogWisp"],
          map: [
            "~~~~~~~~~~~~~~~~~~~~~~~",
            "~,,T,,~~~~=~~~~,,T,,~~~",
            "~,T,,====~_~====,,T,,~~",
            "~,,,=,,,~~~~~,=,,C,,,~~",
            "~TT,=,WW~~~WW,=,TT,,,~~",
          "~,,,=,,~~~~~,,====@,,==",
            "~,T,====~_~====,,T,,~~~",
            "~,,,,,,~~W~~,,,,,,T,,~~",
            "~,,TT,,~~=~~,,TT,,,,,~~",
            "~,,,,====_====,,,,,,,~~",
            "~,T,,=,,~~~,,=,,T,,,,~~",
            "~,,,,=,,~~~,,=,,,,,,,~~",
            "~,,T,C====_====C,T,,,~~",
            "~,,,,,,~~M~~,,,,,,,,,~~",
            "~,,TT,,~~~~~,,TT,,,,,~~",
            "~,,,,,,,,=,,,,,,,,,,,~~",
            "~~~~~~~~~~~~~~~~~~~~~~~"
          ],
        events: [
          {
              id: "marsh_jester",
              x: 9,
              y: 13,
            icon: "M",
            lines: [
              ["Marsh Jester", "A wisp stole my joke book. Without it, I can only do tax humor."],
              ["Derlin", "We cannot leave the world like that."],
              ["Marsh Jester", "Find the glowing heckler near the reeds."]
            ],
            after: () => flag("marshQuest")
          },
          {
              id: "marsh_wisp",
              x: 9,
              y: 7,
            icon: "W",
            requires: "marshQuest",
            gateFlags: ["marshBlueReeds", "marshSilverReeds"],
            gateLines: [
              ["Marsh Jester", "Do not swing at the first glow. Read the blue reeds and silver reeds; together they reveal which wisp casts a real reflection."],
              ["Derlin", "An observation puzzle. Finally, violence with editorial standards."]
            ],
            boss: "marshWisp",
            preBattleLines: [
              ["Marsh Wisp", "I have rewritten the joke book with more screaming."],
              ["Derlin", "Then I am issuing an editorial correction."]
            ],
            after: () => {
              flag("marshBookRecovered");
              addItem("Marsh Joke Book", 1);
              say([
                ["Marsh Wisp", "My timing was perfect and my morals were damp."],
                ["Derlin", "I am keeping this book for combat purposes. And morale. Mostly combat."]
              ]);
            }
          },
          {
              id: "marsh_cache_west",
              x: 5,
              y: 12,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The reed basket holds 3 potions.",
              "A reed basket holds 3 potions and one frog coupon you respectfully ignore.",
              "A reed basket holds 3 potions and one frog coupon you respectfully ignore. The frog economy will recover."
            )]],
            after: () => {
              flag("marshBlueReeds");
              addItem("Potion", 3);
              say([["Dalin", "The blue reeds bend away from false wisps. Remember that direction."]]);
            }
          },
          {
              id: "marsh_cache_east",
              x: 17,
              y: 3,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The sunken chest contains 36 gold.",
              "A sunken chest coughs up 36 gold. The marsh immediately charges a small emotional fee.",
              "A sunken chest coughs up 36 gold. The marsh immediately charges a small emotional fee and refuses to itemize it."
            )]],
            after: () => {
              flag("marshSilverReeds");
              addGold(36);
              say([["Yvonne", "Silver reeds reflect the real wisp twice. Now we can identify the thief."]]);
            }
          }
        ],
          exits: [{ edge: "east", to: "grassland", x: 1, y: 8 }]
        },
        marhynCastle: {
          name: "Marhyn's Castle",
          start: [3, 14],
          theme: "floor",
          encounterRate: 0.09,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#_____#_______#_______#",
            "#_###_#_#####_#_###___#",
            "#_#___#___C___#___#___#",
            "#_#_#####_#_#####_#___#",
            "#___#_____#_____#_____#",
            "###_#_#########_#_#####",
            "#___#___________#_____#",
            "#_#######___#######_#_#",
            "#_______#___#_______#_#",
            "#_#####_#___#_#####_#_#",
            "#___#___#___#___#___#_#",
            "###_#_####_####_#_###_#",
            "#___#___________#_____#",
            "#__@______!___________#",
            "#___________+_________#",
            "#######################"
          ],
        events: [
          {
              id: "marhyn_intro",
              x: 3,
              y: 14,
            icon: "!",
            hidden: true,
            once: true,
            cutscene: "dungeonWake",
            lines: [
              ["Queen Marhyn", "Welcome to solitary confinement. It is like an inn, but every amenity is a lock."],
              ["Tarthur", "Your decorator really committed to blue-black stone."],
              ["Queen Marhyn", "It hides stains and optimism."],
              ["Narrator", "Tarthur wakes alone. Somewhere deeper in the dungeon, someone is still breathing loudly enough to become a quest objective."]
            ],
            after: () => {
              setParty(["tarthur"]);
            }
          },
          {
              id: "marhyn_cell_note",
              x: 10,
              y: 14,
            icon: "!",
            lines: [
              ["Narrator", "Scratches in the mortar map the prison in fragments: west cells, armory, east tower, lower vault."],
              ["Tarthur", "That is almost helpful. Suspiciously almost."]
            ]
          },
          {
              id: "marhyn_lower_cache",
              x: 10,
              y: 3,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The loose stone hides 2 potions.",
              "A loose stone hides 2 potions and a key label with no key attached. Marhyn believes in paperwork.",
              "A loose stone hides 2 potions and a key label with no key attached. Marhyn believes in paperwork, even when the paperwork has lost the plot."
            )]],
            after: () => addItem("Potion", 2)
          },
            {
                id: "lower_cells_to_halls",
                x: 12,
                y: 15,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-lower-halls", to: "marhynHalls", x: 10, y: 14 },
            action: () => travelTo("marhynHalls", 10, 14)
            }
          ],
            exits: []
          },
        marhynHalls: {
          name: "Marhyn's Central Keep",
          start: [11, 14],
          theme: "floor",
          encounterRate: 0.12,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#_____#_______#_______#",
            "#_____#_______#_______#",
            "#_____+_______+_______#",
            "#_____#_______#_______#",
            "#######___+___###_#####",
            "#_________#___________#",
            "#_____#####Q#####_____#",
            "#_________#___________#",
            "#####_###_#_###_______#",
            "#_____#___+___#_______#",
            "#_____#_______#_______#",
            "#_____###___###___#####",
            "#_____________________#",
            "#___________@_________#",
            "#_________+___________#",
            "###########=###########"
          ],
        events: [
            {
                id: "halls_to_west_cells",
                x: 6,
                y: 3,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-west-cells", to: "marhynWestCells", x: 21, y: 13 },
              action: () => travelTo("marhynWestCells", 21, 13)
            },
          {
              id: "halls_to_derlin_tower",
              x: 14,
              y: 3,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-derlin-tower", to: "marhynDerlinTower", x: 1, y: 13 },
              action: () => {
                if (hasFlag("marhynKeyring")) travelTo("marhynDerlinTower", 1, 13);
              else say([["Narrator", "Three keyholes stare back from the east-tower lock. Somewhere nearby, Marhyn is being theatrically overprepared."]]);
            }
          },
          {
              id: "halls_to_armory",
              x: 10,
              y: 5,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-armory", to: "marhynArmory", x: 12, y: 13 },
              action: () => travelTo("marhynArmory", 12, 13)
            },
          {
              id: "halls_to_vault",
              x: 10,
              y: 10,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-vault", to: "marhynVault", x: 11, y: 14 },
              action: () => {
                if (hasFlag("marhynKeyring")) travelTo("marhynVault", 11, 14);
              else say([["Narrator", "The lower-vault latch refuses to participate without the prison keyring."]]);
            }
          },
          {
              id: "halls_to_lower_cells",
              x: 10,
              y: 15,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-lower-halls", to: "marhynCastle", x: 12, y: 14 },
            action: () => travelTo("marhynCastle", 12, 14)
            }
          ],
          exits: [{ edge: "south", to: "forest", requiresParty: "derlin", x: 11, y: 1 }]
        },
        marhynWestCells: {
          name: "Marhyn's West Cells",
          start: [21, 13],
          theme: "floor",
          encounterRate: 0.13,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#Y____#_____#_____C___#",
            "#_###_#_###_#_#####_#_#",
            "#___#___#___#_____#_#_#",
            "###_#####_#######_#_#_#",
            "#___#_____#_____#___#_#",
            "#_###_#####_###_#####_#",
            "#_____#_____#___#_____#",
            "#_#####_#####_#_#_###_#",
            "#_____#_______#___#___#",
            "#####_#######_#####_###",
            "#___#_____#___#_______#",
            "#_#_#####_#_#######_#_#",
            "#_#_______#_________#_=",
            "#_###########_#######_#",
            "#_____________________#",
            "#######################"
          ],
        events: [
          {
              id: "yan_escape",
              x: 1,
              y: 1,
            icon: "Y",
            once: true,
            cutscene: "oldYanFree",
            lines: [
              ["Old Yan", "I was starting to wonder whether the outside world was a rumor Marhyn invented to annoy me."],
              ["Tarthur", "It is real enough. Come on, Yan."],
              ["Narrator", "Old Yan joined the party. He is frail, rattled, and still somehow certain which wall is weakest."]
            ],
            after: () => {
              addParty("yanOld");
              flag("yanFreed");
            }
          },
          {
              id: "marhyn_west_cache",
              x: 18,
              y: 1,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The guard locker contains an Ether Leaf and 18 gold.",
              "A guard locker contains an Ether Leaf and 18 gold. It also contains a schedule titled 'lose keys dramatically.'",
              "A guard locker contains an Ether Leaf and 18 gold. It also contains a schedule titled 'lose keys dramatically.' The guards are ahead of schedule."
            )]],
            after: () => {
              addItem("Ether Leaf", 1);
              addGold(18);
            }
          }
        ],
            exits: [{ edge: "east", to: "marhynHalls", x: 7, y: 3, doorLink: { id: "marhyn-halls-west-cells", source: [22, 13] } }]
          },
        marhynArmory: {
          name: "Marhyn's Armory",
          start: [12, 13],
          theme: "floor",
          encounterRate: 0.1,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#_____c_____#_____C___#",
            "#_ccc_c_ccc_#_#####_#_#",
            "#_____c_____#_____#_#_#",
            "#####_#######_###_#_#_#",
            "#_____#_____#___#___#_#",
            "#_###_#_C___###_#####_#",
            "#_#___#_________#_____#",
            "#_#_###########_#_###_#",
            "#___#_____C_____#___#_#",
            "###_#_###########_#_#_#",
            "#___#_____________#___#",
            "#_###############_###_#",
            "#___________@_________#",
            "#___________+_________#",
            "#_____________________#",
            "#######################"
          ],
        events: [
          {
              id: "marhyn_keyring",
              x: 8,
              y: 6,
            icon: "C",
            once: true,
            lines: [
              ["Narrator", jokeText(
                "Inside the iron chest is Marhyn's prison keyring.",
                "Inside the iron chest is Marhyn's prison keyring. It has more keys than a reasonable villain should need.",
                "Inside the iron chest is Marhyn's prison keyring. It has more keys than a reasonable villain should need, plus several for doors that probably just wanted attention."
              )],
              ["Tarthur", "East tower, lower vault. Got it."]
            ],
            after: () => flag("marhynKeyring")
          },
          {
              id: "marhyn_armory_cache",
              x: 10,
              y: 9,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The cracked weapon crate contains 25 gold, one potion, and guard gear.",
              "A cracked weapon crate yields 25 gold, one potion, and guard gear somebody forgot to inventory.",
              "A cracked weapon crate yields 25 gold, one potion, and guard gear somebody forgot to inventory. Bureaucracy has been defeated locally."
            )]],
            after: () => {
              addGold(25);
              addItem("Potion", 1);
              addItem("Blue-Black Coat", 1);
              addItem("Derlin's Redblade", 1);
            }
          },
          {
              id: "marhyn_armory_supply",
              x: 18,
              y: 1,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The high shelf holds a Wake Leaf.",
              "The high shelf holds a Wake Leaf. The guards put useful supplies exactly where short prisoners cannot reach them.",
              "The high shelf holds a Wake Leaf. The guards put useful supplies exactly where short prisoners cannot reach them, because cruelty apparently has shelving guidelines."
            )]],
            after: () => addItem("Wake Leaf", 1)
          },
          {
              id: "armory_to_halls",
              x: 12,
              y: 14,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-armory", to: "marhynHalls", x: 10, y: 4 },
            action: () => travelTo("marhynHalls", 10, 4)
            }
          ],
            exits: []
          },
        marhynDerlinTower: {
          name: "Marhyn's East Tower",
          start: [1, 13],
          theme: "floor",
          encounterRate: 0.13,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#___C_____#_____#___+D#",
            "#_#_#####_#_###_#_###_#",
            "#_#_____#___#___#___#_#",
            "#_#####_#######_#####_#",
            "#_#___#_____#_____#___#",
            "#_#_#_#####_#_###_#_###",
            "#___#_____#___#___#___#",
            "###_#####_#####_#_###_#",
            "#___#_______#___#_____#",
            "#_#####_###_#_#######_#",
            "#_______#___#_____#___#",
            "#_#######_#######_#_#_#",
            "=_________#_______#_#_#",
            "#_#######_#_#########_#",
            "#_____________________#",
            "#######################"
          ],
        events: [
            {
                id: "derlin_locked_cell",
                x: 21,
                y: 1,
              icon: "!",
            hideWhenFlag: "yanFreed",
            lines: [
              ["Derlin", "Tarthur? I am behind a door designed by someone with personal issues."],
                ["Narrator", "The lock is not only locked. It is locked in a language Old Yan would probably complain about."]
              ]
            },
          {
                id: "derlin_cell_door",
                x: 20,
                y: 1,
            icon: "+",
            requires: "yanFreed",
            gateItem: "Derlin Cell Key",
            hideWhenParty: "derlin",
            gateLines: [
              ["Derlin", "That keyring opened the tower, but this cell has its own red-cloak key."],
              ["Old Yan", "Lower vault. Decorative alcove. Marhyn labels everything because control issues require stationery."]
            ],
            once: true,
            lines: [
              ["Derlin", "Took you long enough. I had to talk to a wall, and it had better tactical ideas than us."],
              ["Old Yan", "The wall was not wrong."],
              ["Narrator", "Derlin is free."]
            ],
            after: () => {
              addParty("derlin");
            }
          },
            {
                id: "free_derlin",
                x: 21,
                y: 1,
              icon: "D",
              requires: "yanFreed",
              gateItem: "Derlin Cell Key",
            hideWhenParty: "derlin",
              gateLines: [
                ["Derlin", "Good news: you found me. Bad news: this cell uses a separate key."],
                ["Old Yan", "Lower vault. Decorative alcove. Marhyn labels everything because control issues require stationery."]
              ],
              once: true,
            lines: [
              ["Derlin", "Took you long enough. I had to talk to a wall, and it had better tactical ideas than us."],
              ["Old Yan", "The wall was not wrong."],
              ["Narrator", "Derlin is free."]
            ],
            after: () => {
              addParty("derlin");
            }
          },
          {
              id: "marhyn_tower_cache",
              x: 4,
              y: 1,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The tower chest contains 42 gold.",
              "A tower chest contains 42 gold and a complaint form already signed by Derlin.",
              "A tower chest contains 42 gold and a complaint form already signed by Derlin. The form has excellent pen pressure."
            )]],
            after: () => {
              addGold(42);
            }
          }
        ],
            exits: [{ edge: "west", to: "marhynHalls", x: 13, y: 3, doorLink: { id: "marhyn-halls-derlin-tower", source: [0, 13] } }]
          },
        marhynVault: {
          name: "Marhyn's Lower Vault",
          start: [11, 14],
          theme: "floor",
          encounterRate: 0.11,
          encounters: ["marhynGuard"],
          map: [
            "#######################",
            "#_______#_____#_______#",
            "#_#####_#_C_C_#_#####_#",
            "#_#_____#_____#_____#_#",
            "#_#_#########_#_###_#_#",
            "#___#_____#_____#___#_#",
            "###_#_###_#_###_#_###_#",
            "#___#___#___#___#_____#",
            "#_#####_#####_#######_#",
            "#_______#_____#_____C_#",
            "#_#######_###_#_#####_#",
            "#_____#___#___#_______#",
            "#####_#_###_#########_#",
            "#_______#___________#_#",
            "#__________@__________#",
            "#__________+__________#",
            "#######################"
          ],
        events: [
          {
              id: "marhyn_vault_gold",
              x: 10,
              y: 2,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The vault chest holds 60 gold.",
              "The vault chest holds 60 gold and a note reading 'not bait.' It is absolutely bait, but useful bait.",
              "The vault chest holds 60 gold and a note reading 'not bait.' It is absolutely bait, but useful bait, the most respectable kind."
            )]],
            after: () => {
              addGold(60);
            }
          },
          {
              id: "marhyn_vault_supplies",
              x: 12,
              y: 2,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The second chest contains 2 potions.",
              "A second chest contains 2 potions and enough dust to imply this security plan was mostly decorative.",
              "A second chest contains 2 potions and enough dust to imply this security plan was mostly decorative. The dust is carrying the whole theme."
            )]],
            after: () => addItem("Potion", 2)
          },
          {
                id: "marhyn_vault_far_cache",
                x: 11,
                y: 2,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The side alcove yields an Ether Leaf.",
              "A side alcove yields an Ether Leaf. It hums like it has been waiting for better company.",
              "A side alcove yields an Ether Leaf. It hums like it has been waiting for better company and had realistic expectations."
            )]],
            after: () => addItem("Ether Leaf", 1)
          },
          {
                id: "derlin_cell_key",
                x: 19,
                y: 9,
            icon: "C",
            once: true,
            requiresParty: "yanOld",
            lines: [
              ["Old Yan", "That alcove is pretending to be decorative. Villains love decorative mistakes."],
              ["Narrator", jokeText(
                "Behind the stone lip is Derlin's cell key.",
                "Behind the stone lip is Derlin's cell key, tagged with a tiny red-cloak sketch.",
                "Behind the stone lip is Derlin's cell key, tagged with a tiny red-cloak sketch. The sketch somehow looks impatient."
              )],
              ["Tarthur", "That is either helpful labeling or Marhyn gloating in stationery form."]
            ],
            after: () => {
              addItem("Derlin Cell Key", 1);
              addItem("Old Yan's Knotted Staff", 1);
            }
          },
          {
              id: "vault_to_halls",
              x: 11,
              y: 15,
              icon: "+",
              hidden: true,
            doorLink: { id: "marhyn-halls-vault", to: "marhynHalls", x: 10, y: 11 },
              action: () => travelTo("marhynHalls", 10, 11)
            }
          ],
            exits: []
          },
        forest: {
          name: "Forest",
          start: [11, 1],
          theme: "tree",
          encounterRate: 0.18,
        encounters: ["goblin", "mole", "forestSpider"],
          map: [
            "TTTTTTTTTTT=TTTTTTTTTTT",
            "T..t..TT...@...TT..p..T",
            "T..T..TT.=====.TT..T..T",
            "T..T.....=...=.....T..T",
            "T..TTTtT.=.T.=.TpTTT..T",
            "T....T...=.T.=...T....T",
            "TTTT.=.TT=.T.=TT.=.TTTT",
            "T....=.TT=====TT.=....T",
            "T.TT.=....C....=.TT.TTT",
            "T....====TTTTT====....T",
            "TTTT.T..T.....T..T.TTTT",
            "T....=..T.....T..=....T",
            "T.TT.====..b..====.TT.T",
            "T....T.........T......T",
            "T..p...TT=====TT...t..T",
            "T......TT..=..TT......T",
            "TTTTTTTTTTT=TTTTTTTTTTT"
          ],
        events: [
          {
              id: "forest_yan_missing",
              x: 11,
              y: 15,
            icon: "?",
            once: true,
            cutscene: "yanVanishes",
            lines: [
              ["Old Yan", "The dungeon passage sealed behind us. Marhyn dislikes loose endings."],
              ["Derlin", "That is unfortunate. I had several loose complaints."],
              ["Narrator", "Old Yan slows near the tree line. When the fog clears, he is gone."],
              ["Tarthur", "Then we go forward. The king needs to hear what happened."]
            ],
            after: () => {
              removeParty("yanOld");
              removeParty("yan");
              flag("yanVanished");
            }
          },
          {
              id: "forest_cache",
              x: 10,
              y: 8,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The hollow stump holds 40 gold.",
              "A hollow stump holds 40 gold and a dry sock. You keep the gold. The sock has its own destiny.",
              "A hollow stump holds 40 gold and a dry sock. You keep the gold. The sock has its own destiny, and thankfully it is not your inventory problem."
            )]],
            after: () => {
              addGold(40);
            }
          }
        ],
          exits: [
            { edge: "north", to: "marhynHalls", x: 11, y: 15 },
            { edge: "south", to: "deepForest", requires: "yanVanished", x: 11, y: 1 }
          ]
        },
        deepForest: {
          name: "Deep Forest",
          start: [11, 1],
          theme: "tree",
          encounterRate: 0.2,
        encounters: ["forestSpider", "bogWisp", "goblin"],
          map: [
            "TTpTTtTTTTT=TTtTTpTTTTT",
            "Tt.T..pT...@...T..T.tTT",
            "T..T..Tt.=====.T..T..TT",
            "T..p.....=.b.=.....t.TT",
            "T.b.TTtT.=.T.=.TpTT..TT",
            "TTTp.T...=.T.=...T.tTTT",
            "T....=.TT=.T.=TT.=.b.TT",
            "T.Tt.=....N....=.Tt.TTT",
            "T....====TTTTT====...TT",
            "TTTT.T..T.....T..T.TTTT",
            "T....=..T..b..T..=...TT",
            "T.Tt.====.....====.T.TT",
            "T..C.T....b....T..p..TT",
            "T....T.TT=====TT.T...TT",
            "T..p...TT..=..TT...t.TT",
            "T......TT..=..TT......T",
            "TTtTTTTTTTT=TTpTTTTTTTT"
          ],
        events: [
          {
              id: "deep_forest_marker",
              x: 10,
              y: 7,
            icon: "?",
            once: true,
            lines: [
              ["Tarthur", "This path bends in directions I do not remember approving."],
              ["Derlin", "Forest paths are like prophecies. The trick is to look confident while being wrong."]
            ]
          },
          {
              id: "deep_forest_cache",
              x: 16,
              y: 10,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The mossy chest contains 60 gold.",
              "A mossy chest contains 60 gold and one leaf that looks personally disappointed in you.",
              "A mossy chest contains 60 gold and one leaf that looks personally disappointed in you. The leaf has range."
            )]],
            after: () => {
              addGold(60);
            }
          },
          {
              id: "eagle_rune_sword",
            x: 11,
            y: 14,
            icon: "!",
            requires: "yanVanished",
            hideWhenFlag: "runeSword",
            once: true,
            cutscene: "runeSwordEagles",
            lines: [
              ["Narrator", "Scratches on the north stones become feathers on the center trail, then a woven arrow pointing south. At the final marker, two eagles drop a wrapped blade at Tarthur's feet."],
              ["Derlin", "I am choosing to believe this is normal eagle behavior."],
              ["Narrator", "A shaky note on the cloth says Yan asked them to bring it. Inside is the Rune Sword, glowing toward Freeton."]
            ],
            after: () => {
              addItem("Rune Sword", 1);
              addItem("Road Cloak", 1);
              flag("runeSword");
            }
          }
        ],
          exits: [
            { edge: "north", to: "forest", x: 11, y: 15 },
            { edge: "south", to: "freeton", requires: "runeSword", x: 11, y: 1 }
          ]
        },
        freeton: {
          name: "Freeton",
          start: [11, 1],
          theme: "town",
          encounterRate: 0,
          map: [
            "TTTTTTTTTTT=TTTTTTTTTTT",
            "T.rrr..T...@...T..rrr.T",
            "T.rxxr.T.=====.T.rxxr.T",
            "T.wddw...=...=...wddw.T",
            "T.wwww..N=...=...wwww.T",
            "T..ff..===...===..ff..T",
            "T......=..bbb..=......T",
            "T.rrr..=...+...=..rrr.T",
            "T.rxxr.=..C+C..=.rxxr.T",
            "T.wddw.=========.wddw.T",
            "T.wwww.....=.....wwww.T",
            "T..ff..N...=...N..ff..T",
            "T.......====.====.....T",
            "T..g....=.....=....g..T",
            "T....rrr=.....=rrr....T",
            "T.......=.....=.......T",
            "TTTTTTTTTTT=TTTTTTTTTTT"
          ],
        events: [
            {
                id: "freeton_mayor",
                x: 8,
                y: 4,
              icon: "K",
              lines: [
                ["Kandan", "Freeton is completely normal. If the town square starts snoring, ignore it politely."],
                ["Derlin", "That is somehow still the least normal thing you could have said."]
              ],
              after: () => flag("heardCorizaz")
            },
          {
              id: "freeton_innkeeper",
              x: 8,
              y: 11,
            icon: "S",
              facePlayer: true,
              action: () => stayAtInn("Freeton Road Inn", 10)
            },
            {
                id: "freeton_townsgirl",
                x: 15,
                y: 11,
              icon: "S",
              facePlayer: true,
              gateItem: "Rune Sword",
              once: true,
              lines: [
                ["Townsgirl", "Oh! Your sword brushed my sleeve."],
                ["Narrator", "The Rune Sword flashes green. A thread of smoke peels away from the townsgirl and points toward the town square."],
                ["Townsgirl", "I remember now. I was supposed to lead people away from the wizard under Freeton, but the smoke kept making me forget."],
                ["Derlin", "The sword is now doing crowd control. I respect the initiative."]
              ],
              repeatLines: [["Townsgirl", "The hidden stair is in the middle of town. If it snores, that means you are close."]],
              after: () => {
                flag("heardCorizaz");
                flag("corizazLairRevealed");
              }
            },
            {
                id: "corizaz_entrance",
                x: 11,
                y: 7,
              icon: "+",
              requires: "corizazLairRevealed",
              action: () => travelTo("corizazLair", 7, 9)
            },
          {
              id: "uris",
              x: 16,
              y: 11,
            icon: "U",
            once: true,
            lines: [
              ["Uris", "I meant to teach you Fireball, but I wrote down Pancake."],
              ["Tarthur", "Can Pancake defeat evil?"],
              ["Uris", "It can defeat breakfast."]
            ],
            after: () => addItem("Potion", 2)
          },
          {
              id: "freeton_chest",
              x: 10,
              y: 8,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The chest contains 55 gold.",
              "The chest contains 55 gold and a tiny paper crown for confidence.",
              "The chest contains 55 gold and a tiny paper crown for confidence. It fits the concept of leadership, not your head."
            )]],
            after: () => {
              addGold(55);
            }
          }
        ],
            exits: [
              { edge: "north", to: "deepForest", x: 11, y: 15 },
              { edge: "south", to: "kingsHighway", requires: "lightSword", x: 11, y: 1 }
            ]
          },
        corizazLair: {
          name: "Corizaz's Hidden Lair",
          start: [7, 9],
          theme: "floor",
          encounterRate: 0,
          map: [
            "###############",
            "#_____#_______#",
            "#_###_#_###_#_#",
            "#_#_______#_#_#",
            "#_#_#####_#_#_#",
            "#___#___#___#_#",
            "###_#_Z_#####_#",
            "#___#___#_____#",
            "#_#####_#####_#",
            "#______@______#",
            "#######=#######"
          ],
        events: [
          {
              id: "corizaz_sleeping",
              x: 6,
              y: 6,
            icon: "Z",
            boss: "corizaz",
            preBattleLines: [
              ["Narrator", "Sleeping Corizaz lies in a curl of green smoke, snoring hard enough to rattle the bottles on his shelves."],
              ["Derlin", "It is easier to fight wizards when they are asleep. Less monologuing, for one thing."],
              ["Sleeping Corizaz", "Five more centuries..."]
            ],
            after: () => {
              flag("lightSword");
              addItem("Light Sword", 1);
              addItem("Apprentice Guard", 1);
              say([
                ["Narrator", "The green smoke slips off Corizaz like a defeated blanket, squeezes through a ceiling crack, and leaves Freeton behind."],
                ["Derlin", "I stand by my theory. Sleeping wizards are a very manageable category of wizard."],
                ["Narrator", "You win the Light Sword. It ignores armor, excuses, and most municipal paperwork."]
              ]);
            }
          }
        ],
          exits: [{ edge: "south", to: "freeton", x: 11, y: 8 }]
        },
          kingsHighway: {
          name: "King's Highway",
          start: [11, 1],
          theme: "path",
          encounterRate: 0.14,
        encounters: ["roadBandit", "marhynGuard", "goblin"],
          map: [
            "TTTTTTTTTTT=TTTTTTTTTTT",
            "T..........@..........T",
            "T.===================.T",
            "T.=..TT.....T.....TT=.T",
            "T.=..TT.....F.....TT=.T",
            "T.=..TT.....T.....TT=.T",
            "T.=========.=========.T",
            "T.....N.....=.........T",
            "T.=======..C..=======.T",
            "T.=.....=.....=.....=.T",
            "T.=..TT.=.....=.TT..=.T",
            "T.=..TT.=======.TT..=.T",
            "T.....Y.....=.........T",
            "T.===========.=======.T",
            "T...........=.........T",
            "T...........=.........T",
            "TTTTTTTTTTT=TTTTTTTTTTT"
          ],
        events: [
          {
              id: "yan_returns",
            x: 11,
            y: 2,
            icon: "Y",
            once: true,
            hideWhenFlag: "yanReturned",
            cutscene: "yanDragonReturn",
            lines: [
              ["Yan", "Behold. I am not an old man. I am a shapeshifter with a dragon on retainer."],
              ["Derlin", "So the level 99 thing was foreshadowing?"],
              ["Yan", "It was also hilarious."]
            ],
            after: () => {
              removeParty("yanOld");
              addParty("yan");
              flag("yanReturned");
            }
          },
            {
                id: "fear_creature",
                x: 11,
                y: 4,
              icon: "F",
              boss: "fear",
              battleEnemies: ["skullKnight", "skullKnight", "fear"],
              preBattleLines: [
                ["Narrator", "The road buckles. The Fear Creature rises out of the stones, and two Skull Knights pull themselves together beside it."],
                ["Derlin", "I dislike when the skeletons arrive assembled. I dislike it more when they assemble themselves."]
              ],
              after: () => {
                flag("escapedFear");
                say([
                  ["Yan", "Some battles are won by leaving immediately. This was one of those, loudly."],
                  ["Derlin", "Finally, running to the music works."]
                ]);
              }
            },
          {
              id: "highway_cache",
              x: 11,
              y: 8,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The roadside chest holds 2 potions and 35 gold.",
              "The roadside chest holds 2 potions and 35 gold. Roadside chest economics remain unexplained.",
              "The roadside chest holds 2 potions and 35 gold. Roadside chest economics remain unexplained, but the audit can wait."
            )]],
            after: () => {
              addItem("Potion", 2);
              addGold(35);
            }
          }
        ],
          exits: [
            { edge: "north", to: "freeton", x: 11, y: 15 },
            { edge: "south", to: "tealsburg", requires: "escapedFear", x: 11, y: 1 }
          ]
        },
        tealsburg: {
          name: "Tealsburg",
          start: [11, 1],
          theme: "town",
          encounterRate: 0,
          map: [
            "#######HHHH=HHHH#######",
            "#rrr..w#___@___#w..rrr#",
            "#rxxr.w#_______#w.rxxr#",
            "#wddw..#___K___#..wddw#",
            "#wwww..#_______#..wwww#",
            "#..ff..###_+_###..ff..#",
            "#......=...=.=........#",
            "#..rrr.===...===.rrr..#",
            "#..wdd=..C.Y...=.wdd..=",
            "#..www.=========.www..#",
            "#.......=.....=.......#",
            "#..rrr..=.....=..rrr..#",
            "#..wdd..=..S..=..wdd..#",
            "#..www..=======..www..#",
            "#..rrr......=..rrr....#",
            "#..wdd......=..wdd....#",
            "###########=###########"
          ],
        events: [
          {
              id: "king_garkin",
              x: 11,
              y: 3,
            icon: "K",
            facing: "down",
            staticPose: true,
            once: true,
            lines: [
              ["King Garkin", "Tarthur, retrieve the Water Orb, defeat Darhyn, and try not to bankrupt the capital."],
              ["Warren", "Majesty, he looks rural."],
              ["Derlin", "And you look like a man who alphabetizes betrayal."]
            ],
            after: () => flag("metKing")
          },
          {
              id: "yvonne_bump",
              x: 11,
              y: 8,
            icon: "Y",
            requires: "metKing",
            hideWhenFlag: "yvonneBumped",
            once: true,
            lines: [
              ["Yvonne", "Oof. Sorry. Market lanes, very narrow, elbows everywhere."],
              ["Tarthur", "This street is wider than my whole barn."],
              ["Derlin", "Check your pack before the apology develops a getaway route."]
            ],
            after: () => stealTealsburgLoot()
          },
          {
              id: "yvonne_decoy",
              x: 6,
              y: 8,
            icon: "Y",
            requires: "yvonneBumped",
            hideWhenFlag: "yvonneDecoyChased",
            once: true,
            lines: [
              ["Blond Thief", "Wow, you found me. That usually takes people another three alleys."],
              ["Tarthur", "How did you get clear across the market that fast?"],
              ["Derlin", "Give back whatever you took before your boots invent a fourth direction."],
              ["Blond Thief", "Counteroffer: cardio."]
            ],
            after: () => flag("yvonneDecoyChased")
          },
          {
              id: "yvette_reveal",
              x: 15,
              y: 8,
            icon: "Y",
            requires: "yvonneDecoyChased",
            hideWhenFlag: "yvonneJoined",
            deferComplete: true,
            lines: [
              ["Tarthur", "There. Wait. How is she already over there?"],
              ["Derlin", "Either she is the fastest thief alive, or Tealsburg sells very confusing mirrors."],
              ["Blond Thief", "Fastest thief alive has a nice ring to it."],
              ["Yvonne", "It does, but inaccurate branding hurts repeat business."],
              ["Yvette", "You chased one blond thief and cornered another."],
              ["Derlin", "There are two of them. I hate math when it wears boots."],
              ["Yvette", "Then try to count both of us."]
            ],
            after: () => startYvonneYvetteBattle()
          },
          {
              id: "tealsburg_cache",
              x: 9,
              y: 8,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "You find the VS relic: Valena's Secret.",
              "You find the VS relic: Valena's Secret, a glossy artifact from the old DreamQuest site. It is powerful, mysterious, and somehow has branding guidelines.",
              "You find the VS relic: Valena's Secret, a glossy artifact from the old DreamQuest site. It is powerful, mysterious, and somehow has branding guidelines. The guidelines are winning."
            )]],
            after: () => {
              addItem("VS Relic", 1);
              addGold(70);
            }
          },
          {
              id: "sir_stephen",
              x: 11,
              y: 12,
            icon: "S",
            lines: [
              ["Sir Stephen", "I volunteer to charge ahead heroically."],
              ["Yvonne", "The king specifically asked us to go ahead of the regular army, not become its first dent."]
            ]
          }
        ],
          exits: [
            { edge: "north", to: "kingsHighway", x: 11, y: 15 },
            { edge: "east", to: "marketMaze", x: 1, y: 6 },
            { edge: "south", to: "northernPath", requires: "yvonneJoined", x: 11, y: 1 }
          ]
        },
        marketMaze: {
          name: "Tealsburg Market Maze",
          start: [1, 6],
          theme: "town",
          encounterRate: 0,
          encounters: ["goblin"],
          map: [
            "#######HHHH=HHHH#######",
            "#H..H..=.....=..H..H..#",
            "#..===.===.===.===....#",
            "#..=.....=.=.....=..H.#",
            "#..=C====.=.====C=....#",
            "#..=..H..=.=..H..=....#",
            "=..===..S=.=!$..===...#",
            "#......===.===......H.#",
            "#..H..=....P....=..H..#",
            "#..===.=======.===....#",
            "#..=.....=.=.....=....#",
            "#..=..H..=.=..H..=....#",
            "#..====..=C=..====..H.#",
            "#......===.===.......H#",
            "#H..H.....=.....H..H..#",
            "#..........=..........#",
            "#######HHHH=HHHH#######"
          ],
        events: [
          {
              id: "market_scribe",
              x: 8,
              y: 6,
            icon: "S",
            lines: [
              ["Market Scribe", "A paper mimic ate the city ledger, which is awkward because the ledger owed me lunch."],
              ["Yvonne", "Let me guess. It is hiding where everyone put important documents."],
              ["Market Scribe", "In the alley marked 'Definitely Not Mimics,' yes."]
            ],
            after: () => flag("marketQuest")
          },
          {
              id: "market_shop_door",
              x: 12,
              y: 6,
            icon: "!",
            hidden: true,
            action: () => travelTo("tealsburgShop", 4, 5)
          },
          {
              id: "market_shop_sign",
              x: 13,
              y: 6,
            icon: "$",
            lines: [["Shop Sign", "Tealsburg Market Stall. Hero discount discussed indoors, where witnesses are fewer."]]
          },
          {
              id: "paper_mimic",
              x: 11,
              y: 8,
            icon: "P",
            requires: "marketQuest",
            boss: "paperMimic",
            after: () => {
              flag("marketLedgerRecovered");
              addItem("Scribe Pass", 1);
              addItem("Tealsburg Repeater", 1);
              addItem("Moonthread Ring", 1);
              addGold(85);
              say([
                ["Paper Mimic", "Rustle rustle, legal defeat."],
                ["Market Scribe", "Take this Scribe Pass, the ledger reward, and a few confiscated market curios. It proves you can survive bureaucracy with teeth."]
              ]);
            }
          },
          {
              id: "market_spice_cache",
              x: 4,
              y: 4,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The spice crate contains 2 potions.",
              "A spice crate contains 2 potions and enough paprika to alarm a knight.",
              "A spice crate contains 2 potions and enough paprika to alarm a knight. Somewhere, armor is sneezing."
            )]],
            after: () => addItem("Potion", 2)
          },
          {
              id: "market_rooftop_cache",
              x: 10,
              y: 12,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The rooftop chest holds 48 gold.",
              "A rooftop chest holds 48 gold and a receipt for one heroic ladder.",
              "A rooftop chest holds 48 gold and a receipt for one heroic ladder. The ladder itemizes courage as a surcharge."
            )]],
            after: () => {
              addGold(48);
            }
          }
        ],
          exits: [{ edge: "west", to: "tealsburg", x: 21, y: 8 }]
        },
      tealsburgShop: {
        name: "Tealsburg Market Stall",
        start: [4, 5],
        theme: "floor",
        encounterRate: 0,
        map: [
          "#########",
          "#_______#",
          "#_______#",
          "#_ccccc_#",
          "#_______#",
          "#___@___#",
          "####=####"
        ],
        events: [
          {
            id: "tealsburg_shopkeeper",
            x: 4,
            y: 2,
            icon: "S",
            facePlayer: true,
            lines: [["Shopkeeper", "The counter is here for accounting, bargaining, and emotional distance."]]
          },
          {
            id: "tealsburg_shop_counter",
            x: 4,
            y: 3,
            icon: "!",
            hidden: true,
            action: () => openShop("tealsburg")
          }
        ],
        exits: [{ edge: "south", to: "marketMaze", x: 12, y: 5 }]
      },
        northernPath: {
          name: "Northern Path",
          start: [11, 1],
          theme: "mountain",
          encounterRate: 0.18,
        encounters: ["roadBandit", "windWraith", "marhynGuard"],
          map: [
            "^^^^^^^^^^^=^^^^^^^^^^^",
            "^^^^...^^^^@^^^^...^^^^",
            "^^..===^^^.=.^^^===..^^",
            "^..==..^^..=..^^..==..^",
            "^..=...^^=====^^...=..^",
            "^..=...^^..=..^^...=..^",
            "^^.===^^^^.=.^^^^===.^^",
            "^^...=....=C=....=...^^",
            "^^^^.=.^^^...^^^.=.^^^^",
            "^....=.^^^...^^^.=....^",
            "^..=====^^=^^=====...^^",
            "^..=.....=.=.....=..b.^",
            "^..=.^^^^N.N^^^^.=....^",
            "^^.===...=.=...===.^^^^",
            "^^...=....=....=...p^^^",
            "^^^^...^^^^=^^^^...^^^^",
            "^^^^^^^^^^^=^^^^^^^^^^^"
          ],
        events: [
          {
              id: "northern_scout",
            x: 11,
            y: 12,
            icon: "!",
            once: true,
            lines: [
              ["Yvonne", "These paired trees are an elven map update: the shallow cut means water, the deep cut means Breshen. The direct path is a decoy."],
              ["Derlin", "Naturally. Forest people mark roads by hiding the roads."],
              ["Yvonne", "If the elves ask, we are dignified envoys who found the correct trail on purpose."]
            ],
            after: () => flag("reachedBreshenPath")
          },
          {
              id: "northern_cache",
              x: 15,
              y: 11,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "You find 4 potions.",
              "You find 4 potions wrapped in a map that says 'do not use as wrapping.'",
              "You find 4 potions wrapped in a map that says 'do not use as wrapping.' Cartography has been disrespected."
            )]],
            after: () => addItem("Potion", 4)
          }
        ],
          exits: [
            { edge: "north", to: "tealsburg", x: 11, y: 15 },
            { edge: "south", to: "breshen", requires: "reachedBreshenPath", x: 11, y: 1 }
          ]
        },
        breshen: {
          name: "Breshen",
          start: [11, 1],
          theme: "tree",
          encounterRate: 0,
          map: [
            "TTTTTTTTTTT=TTTTTTTTTTT",
            "T..r..TT...@...TT..r..T",
            "T.rxr.TT.=====.TT.rxr.T",
            "T.wdw....=...=....wdw.T",
            "T..ff..===V===..ff...TT",
            "T......=..bbb..=......T",
            "T.rxr..=.......=..rxr.T",
            "T.wdw..===...===..wdw.T",
            "T..ff....S=.....ff...TT",
            "T..====..B..====.....TT",
            "T.....=.....=........TT",
            "T.rxr.=..N..=..rxr...TT",
            "T.wdw.===E===.wdw....TT",
            "T..ff.....=.....ff...TT",
            "T..p...TT=====TT...t.TT",
            "T......TT..=..TT......T",
            "TTTTTTTTTTT=TTTTTTTTTTT"
          ],
        events: [
          {
              id: "breshen_innkeeper",
              x: 10,
              y: 11,
            icon: "S",
            facePlayer: true,
            action: () => stayAtInn("Breshen Treetop Inn", 16)
          },
          {
              id: "valena",
              x: 10,
              y: 4,
            icon: "V",
            once: true,
            cutscene: "derlinValena",
            lines: [
              ["Valena", "Welcome to Breshen, treetop home of hidden traditions, guarded bridges, and one brother who was supposed to send word sooner."],
              ["Tarthur", "Dalin! You are alive."],
              ["Dalin", "I am. Marhyn's guards took the long road after the ambush. I took the elven one."],
              ["Tarthur", "I thought they still had you. I kept trying to decide whether to be brave or furious."],
              ["Dalin", "Both looked convincing from a distance."],
              ["Valena", "He reached the root tunnels under Breshen with half a cloak, two stolen keys, and the expression he wore whenever Mother caught him climbing palace rafters."],
              ["Dalin", "Marhyn builds cages for people who believe doors are the only exits. Elves are raised with windows, branches, drains, and very opinionated birds."],
              ["Valena", "A hawk brought his leaf-message. I lit the old bridge lamps and hid the patrol markers until he could reach home."],
              ["Tarthur", "I am embarrassingly happy to see you."],
              ["Dalin", "I will accept the embarrassment as a formal greeting."],
              ["Valena", "You helped my brother on the mountain and kept looking for him after Marhyn split you apart. Breshen remembers debts like that."],
              ["Dalin", "Tarthur, this is Valena: princess of Breshen, my sister, and the only person here allowed to say my full name with consequences."],
              ["Valena", "Dalin Everbranch, do not tempt me in front of guests."],
              ["Derlin", "This family reunion is warmer than our usual dungeons."],
              ["Narrator", "Dalin rejoined the party. Valena joined the party."]
            ],
            after: () => {
              addParty("dalin");
              addParty("valena");
              addItem("Breshen Longbow", 1);
              flag("valenaJoined");
            }
          },
          {
              id: "hano",
              x: 9,
              y: 9,
            icon: "H",
            requires: "valenaJoined",
            boss: "hano",
            preBattleLines: [
              ["Hano", "Valena. The bridge bells ring, your brother crawls home, and you answer by collecting road heroes?"],
              ["Valena", "Hano. Still wearing the red cloak. Still mistaking volume for authority."],
              ["Dalin", "Sister, why is he holding the ceremonial hammer like it personally owes him money?"],
              ["Valena", "Because Hano believes an old engagement pledge matters more than my answer."],
              ["Hano", "The pledge binds Breshen. Your brother disgraced the guard, your guests trespass, and I will restore order with iron."],
              ["Tarthur", "I just got Dalin back. I am not letting a cloak with a hammer ruin the reunion."],
              ["Hano", "Then stand still, little hero, and become part of the lesson."]
            ],
            after: () => {
              flag("hanoDefeated");
              const loadoutOffer = { offerGroup: "valena-breshen-loadout", offerTitle: "Valena's Breshen Loadout", recruitId: "valena" };
              addItem("Hano's Hammer", 1, loadoutOffer);
              addItem("Elven Leafmail", 1, loadoutOffer);
              addItem("Valena's Branch Guard", 1, loadoutOffer);
              addItem("Moonbranch Scepter", 1, loadoutOffer);
              say([
                ["Hano", "I concede. Mostly because the hammer is heavy and my feelings are heavier."],
                ["Valena", "Tradition accepts this outcome. My answer remains no."],
                ["Dalin", "That was the shortest royal hearing Breshen has ever survived."],
                ["Tarthur", "I am still happy you are alive, Dalin. Even if your family meetings require boss music."],
                ["Dalin", "For the record, I missed you too. Slightly less loudly."],
                ["Valena", "Then I travel with you. If Marhyn and Darhyn are breaking families apart, Breshen answers as a family."]
              ]);
            }
          },
          {
              id: "breshen_armor_seller",
              x: 9,
              y: 8,
            icon: "S",
            facePlayer: true,
            action: () => openShop("breshen")
          },
          {
              id: "elven_king",
              x: 9,
              y: 12,
            icon: "E",
            lines: [
              ["Elven King", "Darhyn's final fortress is Castle Rathskeller. Ten doors bar the way."],
              ["Yan", "Convenient. I brought a wind spell shaped like a dragon-shaped me."]
            ],
            after: () => flag("rathskellerKnown")
          }
        ],
          exits: [
            { edge: "north", to: "northernPath", x: 11, y: 15 },
            { edge: "south", to: "savannah", requires: "hanoDefeated", x: 10, y: 1 }
          ]
        },
        savannah: {
          name: "Savannah Plain",
          start: [10, 1],
          theme: "sand",
          encounterRate: 0.22,
        encounters: ["duneRaptor", "windWraith", "roadBandit"],
          map: [
            "sssssssssss=sssssssssss",
            "ss...sssss@sssss...ssss",
            "s..=.sss=====sss.=..sss",
            "s..=....s...s....=..sss",
            "s.===ssss...ssss===.sss",
            "s...=..ss...ss..=...sss",
            "sss.=.sss===sss.=.sssss",
            "s...=.....=.....=...sss",
            "s.ss====..C..====ss..=s",
            "s.......=====.......sss",
            "s.ssss....=....ssss.sss",
            "s...=.....=.....=...sss",
            "s...===...=...===...sss",
            "sss...=..sss..=...sssss",
            "ss....=====.=====....ss",
            "ss.........=.........ss",
            "sssssssssss=sssssssssss"
          ],
        events: [
          {
              id: "savannah_camp",
            x: 10,
            y: 8,
            icon: "!",
            once: true,
            lines: [
              ["Tarthur", "Two patrol standards point at different roads. The unburned one faces the wind; the scorched one faces the castle."],
              ["Derlin", "If this turns out to be another one-hit-point Darhyn, I am asking for a refund."],
              ["Yan", "No. This time he brought doors, patrol fires, and a road that bends away from the obvious sand track."],
              ["Narrator", "At the main crossing, the party compares wind, scorch marks, and patrol tracks, then marks the safe route to Rathskeller."]
            ],
            after: () => flag("readyForRathskeller")
          },
          {
              id: "savannah_cache",
            x: 18,
            y: 14,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The chest contains 5 potions and 120 gold.",
              "You find 5 potions and 120 gold. The chest has been saving for retirement.",
              "You find 5 potions and 120 gold. The chest has been saving for retirement and is furious about early withdrawal."
            )]],
            after: () => {
              addItem("Potion", 5);
              addGold(120);
            }
          }
        ],
          exits: [
            { edge: "north", to: "breshen", x: 11, y: 15 },
            { edge: "east", to: "glassCaves", x: 1, y: 8 },
            { edge: "south", to: "rathskellerApproach", requires: "readyForRathskeller", x: 10, y: 1 }
          ]
        },
        glassCaves: {
          name: "Glass Caves",
          start: [1, 8],
        theme: "floor",
          encounterRate: 0.16,
        encounters: ["mole", "windWraith", "shadowHound"],
          map: [
            "#######################",
            "#_____+_________+_____#",
            "#_###___###_###___###_#",
            "#_#C#___#_____#___#C#_#",
            "#_###_#_#_###_#_#_###_#",
            "#_____#___#_#___#_____#",
            "#_#####_###N###_#####_#",
            "#_____#____+____#_____#",
            "=@____+____=____+_____#",
            "#_____#___#X#___#_____#",
            "#_#####_#######_#####_#",
            "#_____#_____#___#_____#",
            "#_###_###_#_#_###_###_#",
            "#_#C______#C#_____#___#",
            "#_###_###########_###_#",
            "#__________=__________#",
            "#######################"
          ],
        events: [
          {
              id: "glass_miner",
              x: 11,
              y: 6,
            icon: "M",
            gateItem: "Scribe Pass",
            gateLines: [
              ["Glass Miner", "The cave union says I cannot send strangers deeper without written proof they survived Tealsburg paperwork."],
              ["Valena", "A Scribe Pass would satisfy the rule?"],
              ["Glass Miner", "That or a committee meeting, and nobody deserves that."]
            ],
            lines: [
              ["Glass Miner", "The cave sings when the Crystal Mole digs. Beautiful, yes. Also it keeps exploding our sandwiches."],
              ["Valena", "A sacred duty calls."],
              ["Derlin", "Protecting sandwiches? Finally, a quest with stakes."]
            ],
            after: () => flag("glassQuest")
          },
          {
              id: "crystal_mole",
              x: 11,
              y: 9,
            icon: "X",
            requires: "glassQuest",
            gateFlags: ["glassLowResonator", "glassHighResonator"],
            gateLines: [["Glass Miner", "The Crystal Mole is shielded by the cave's echo. Tune the low and high resonators in the outer chambers first."]],
            boss: "crystalMole",
            after: () => {
              flag("glassCavesCalmed");
              addItem("Glass Flute", 1);
              say([
                ["Crystal Mole", "Squeak, but refracted."],
                ["Glass Miner", "Take the Glass Flute. Equip it, play it badly, and smaller monsters wander away to judge you elsewhere."]
              ]);
            }
          },
          {
              id: "glass_cache_south",
              x: 11,
              y: 13,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The crystal chest contains 150 gold.",
              "The crystal chest contains 150 gold. It would sparkle more, but it is trying to remain tasteful.",
              "The crystal chest contains 150 gold. It would sparkle more, but it is trying to remain tasteful. This cave considers that restraint."
            )]],
            after: () => {
              flag("glassHighResonator");
              addGold(150);
              say([["Valena", "The high crystal now sings a clear note. One half of the echo is tuned."]]);
            }
          },
          {
              id: "glass_cache_west",
              x: 3,
              y: 13,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The cracked chest holds 4 potions.",
              "A cracked chest holds 4 potions and one extremely reflective spoon.",
              "A cracked chest holds 4 potions and one extremely reflective spoon. The spoon has seen too much."
            )]],
            after: () => {
              flag("glassLowResonator");
              addItem("Potion", 4);
              say([["Dalin", "The low crystal settles into tune. The mole's shield should weaken when both notes agree."]]);
            }
          }
        ],
          exits: [{ edge: "west", to: "savannah", x: 21, y: 8 }]
        },
        rathskellerApproach: {
          name: "Rathskeller Approach",
          start: [10, 1],
          theme: "sand",
          encounterRate: 0.24,
        encounters: ["duneRaptor", "windWraith", "shadowHound"],
          map: [
            "sssssssssss=sssssssssss",
            "ss...sssss@sssss...ssss",
            "s..=.sss=====sss.=..sss",
            "s..=....s...s....=..sss",
            "s.===ssss...ssss===.sss",
            "s...=..ss...ss..=...sss",
            "sss.=.sss===sss.=.sssss",
            "s...=.....=.....=...sss",
            "s.ss====..N..====ss..ss",
            "s.......=====.......sss",
            "s.ssss....=....ssss.sss",
            "s...=.....=.....=...sss",
            "s...===..C=...===...sss",
            "sss...=..sss..=...sssss",
            "ss....=====.=====....ss",
            "ss.........=.........ss",
            "sssssssssss=sssssssssss"
          ],
        events: [
          {
              id: "approach_camp",
              x: 10,
              y: 8,
            icon: "!",
            once: true,
            lines: [
              ["Yan", "The air feels wrong. Darhyn is close."],
              ["Derlin", "Good. I brought several complaints and would like to deliver them personally."]
            ]
          },
          {
              id: "approach_cache",
              x: 9,
              y: 12,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The war-camp chest contains 3 potions and 80 gold.",
              "A war-camp chest contains 3 potions and 80 gold. The label says 'final dungeon panic fund.'",
              "A war-camp chest contains 3 potions and 80 gold. The label says 'final dungeon panic fund.' At last, honest budgeting."
            )]],
            after: () => {
              addItem("Potion", 3);
              addGold(80);
            }
          }
        ],
          exits: [
            { edge: "north", to: "savannah", x: 10, y: 15 },
            { edge: "south", to: "rathskeller", x: 15, y: 1 }
          ]
        },
        rathskeller: {
          name: "Castle Rathskeller",
          start: [15, 1],
          theme: "floor",
          encounterRate: 0.2,
        encounters: ["shadowHound", "windWraith", "marhynGuard"],
          map: [
            "###############=###############",
            "#_____________________________#",
            "###_###########_###########_###",
            "#_______###_________###_______#",
            "###_###_###_###_###_###_###_###",
            "###__C______###_###______C__###",
            "###_###_###_###_###_###_###_###",
            "#_______###_________###_______#",
            "#_#_#######_###_###_#######_#_#",
            "#_#___________#_#___________#_#",
            "#_#######_###_#_#_###_#######_#",
            "#_#######______C______#######_#",
            "#_#######_###_#_#_###_#######_#",
            "#_________###_#_#_###_________#",
            "###_#####_#####_#####_#####_###",
            "###_#__C______#_#______C__#_###",
            "###_###########_###########_###",
            "###_________________________###",
            "###############_###############",
            "#######_________________#######",
            "#########_____L_D_____#########",
            "#########_____________#########",
            "###############################"
          ],
        events: [
          {
              id: "ten_doors",
              x: 15,
              y: 11,
            icon: "C",
            once: true,
            cutscene: "windSpell",
            lines: [
              ["Narrator", jokeText(
                "At the center of ten concentric doors, a chest offers the Wind Spell focus.",
                "At the center of ten concentric doors, a chest offers the Wind Spell focus.",
                "At the center of ten concentric doors, a chest offers the Wind Spell focus. The doors appear to expect applause."
              )],
              ["Yan", "Excellent. I can now become a key item with opinions."]
            ],
            after: () => {
              addItem("Wind Spell", 1);
              addItem("Wind Dragon Staff", 1);
              addItem("Dragon Scale Mantle", 1);
              flag("windSpell");
            }
          },
          {
              id: "rathskeller_west_wing_cache",
              x: 5,
              y: 5,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The west-wing chest holds 2 potions and an Ether Leaf.",
              "A west-wing chest holds 2 potions and an Ether Leaf. Darhyn's filing system briefly helps you.",
              "A west-wing chest holds 2 potions and an Ether Leaf. Darhyn's filing system briefly helps you, which feels like a clerical betrayal."
            )]],
            after: () => {
              addItem("Potion", 2);
              addItem("Ether Leaf", 1);
            }
          },
          {
              id: "rathskeller_east_wing_cache",
              x: 25,
              y: 5,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The east-wing chest contains 140 gold and a Wake Leaf.",
              "An east-wing chest contains 140 gold and a Wake Leaf wrapped in final-battle optimism.",
              "An east-wing chest contains 140 gold and a Wake Leaf wrapped in final-battle optimism. The optimism is crinkly."
            )]],
            after: () => {
              addGold(140);
              addItem("Wake Leaf", 1);
            }
          },
          {
              id: "rathskeller_lower_west_cache",
              x: 7,
              y: 15,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The lower guard cache yields 2 Smoke Nuts and an Ether Leaf.",
              "A lower guard cache yields 2 Smoke Nuts and an Ether Leaf. Even panic has inventory control.",
              "A lower guard cache yields 2 Smoke Nuts and an Ether Leaf. Even panic has inventory control, though its handwriting suffers."
            )]],
            after: () => {
              addItem("Smoke Nut", 2);
              addItem("Ether Leaf", 1);
            }
          },
          {
              id: "rathskeller_lower_east_cache",
              x: 23,
              y: 15,
            icon: "C",
            once: true,
            lines: [["Narrator", jokeText(
              "The last side chest gives up 3 potions and 110 gold.",
              "The last side chest gives up 3 potions and 110 gold. Sensible villainy would have locked it better.",
              "The last side chest gives up 3 potions and 110 gold. Sensible villainy would have locked it better, but sensible villainy rarely gets final castles."
            )]],
            after: () => {
              addItem("Potion", 3);
              addGold(110);
            }
          },
          {
              id: "lithar_final",
              x: 14,
              y: 20,
            icon: "L",
            requires: "windSpell",
            once: true,
            boss: "lithar2",
            after: () => {
              flag("litharDone");
              say([
                ["Lithar", "I still hate life, but I respect your DPS."],
                ["Derlin", "Put that on a plaque."]
              ]);
            }
          },
          {
              id: "darhyn_final",
              x: 16,
              y: 20,
            icon: "D",
            requires: "litharDone",
            boss: "darhyn",
            itemRewards: [
              {
                name: "Encounter Dial",
                key: true,
                image: "item:encounterDial",
                text: "Set random encounters to normal, off, or a chosen step interval from the Inventory menu."
              }
            ],
            preBattleLines: [
              ["Darhyn", "You bring the Water Orb's little friends to my final door."],
              ["Yan", "And the Power of Air. That is the part you should be worried about."],
              ["Darhyn", "You are still hiding inside a mortal shape, old dragon."],
              ["Yan", "Not for much longer."],
              ["Tarthur", "Yan?"],
              ["Yan", "When I change this time, I cannot come back. The spell needs a body, and Darhyn needs an ending."],
              ["Derlin", "There has to be another plan."],
              ["Yan", "There was. It brought all of you here."]
            ],
            after: () => {
              flag("gameComplete");
              flag("yanSacrificed");
              removeParty("yan");
              removeParty("yanOld");
              setMode("complete");
              showCutscene("darhynFalls", () => {
                say([
                  ["Darhyn", "Impossible. The Power of Air! My second-only weakness!"],
                  ["Yan", "The Wind Spell is holding. Tarthur, keep the Orb safe. Tell Daranor I chose this."],
                  ["Tarthur", "Yan, no!"],
                  ["Narrator", "The player-triggered Power of Air still fills the chamber. Yan holds the spell together until Darhyn's broken shadow finally disperses."],
                  ["Narrator", "When the battle light clears, Darhyn has already fallen. Yan is gone."],
                  ["Derlin", "He saved all of us."],
                  ["Valena", "Breshen will remember him among the names spoken to the branches."],
                  ["Narrator", "The Water Orb returns, but the victory is not clean. Yan's sacrifice ends Darhyn's reign and leaves an empty place in the party."],
                  ["Narrator", "Daranor is safe enough for the credits, which is different from safe enough to ignore every suspicious side path."]
                ], showEndingScene);
              });
            }
          }
        ],
          exits: [{ edge: "north", to: "rathskellerApproach", x: 10, y: 15 }]
        }
    };

    return {
      gameConfig,
      waterOrbAcquisitionText,
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
      characterSheetBattleSideIdleIds,
      characterSheetDirectionalRows,
      spriteSheetHeadshotIds,
      transientNpcEventIds,
      repeatLinesByEventId,
      enemyAtlasCells,
      enemyAtlasCellCrop,
      portraitAtlasCells,
      customPortraitKeys,
      guideIconAtlas,
      spellAtlasCells,
      spellAtlasGrid,
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
      guideData,
      musicTrackSources,
      musicTrackThemeMap,
      musicTrackThemePlaylists,
      musicTrackVolumes,
      areaOrder,
      optionalAreaIds,
      bookMapSize,
      bookWorldPoints,
      areaWorldParents,
      areaMiniMapGroups,
      areas
    };
  };
})();
