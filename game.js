(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const restartButton = document.getElementById("restart");
  const touchButtons = Array.from(document.querySelectorAll("[data-control]"));

  const W = 320;
  const H = 180;
  const RENDER_SCALE = 2;
  const STEP = 1 / 60;
  const TILE = 8;
  const GRAVITY = 560;
  const LEVEL_W = 3200;
  const GROUND_Y = 150;
  const FLIGHT_CEILING_Y = -500;
  const CAMERA_TOP_Y = -600;
  const PLATFORM_SPRING = 88;
  const PLATFORM_DAMPING = 15;

  const MODE = {
    TITLE: 0,
    SELECT: 1,
    EGG: 2,
    HATCH: 3,
    PLAY: 4,
    EVOLVE: 5,
    PAUSE: 6,
    END: 7,
    WIN: 8
  };

  const PAL = {
    black: "#090915",
    night: "#111a33",
    sky: "#1f6b99",
    sky2: "#35a2c6",
    cloud: "#9bd4df",
    cloud2: "#5fa7b7",
    mountain: "#17254a",
    mountain2: "#193d5b",
    ground: "#226447",
    grass: "#52d273",
    darkGrass: "#174b3d",
    gold: "#f7c64a",
    gold2: "#ffe69a",
    blue: "#2fb7ff",
    blue2: "#7be8ff",
    blue3: "#1b55c8",
    red: "#e83f5f",
    red2: "#ff8a65",
    cream: "#f5ead2",
    white: "#fff8d6",
    purple: "#6a4fe3",
    uiDark: "#141728"
  };

  // --- Roster & per-character assets -----------------------------------
  const ROSTER = Array.isArray(window.ALTOS_ROSTER) && window.ALTOS_ROSTER.length
    ? window.ALTOS_ROSTER
    : [{
        id: "altos", name: "ALTOS", locked: false,
        eggSheet: "assets/sprites/egg_hatch_sheet.png",
        stages: Array.isArray(window.ALTOS_CHARACTERS) && window.ALTOS_CHARACTERS.length
          ? window.ALTOS_CHARACTERS
          : [{ id: "altos_01", name: "ALTOS", sheet: "assets/sprites/altos_01_sheet.png" }]
      }];
  const ASSET_VERSION = "vfx-hd-20260722";
  function assetUrl(path) {
    return path + (path.includes("?") ? "&" : "?") + "v=" + ASSET_VERSION;
  }
  const SPRITE_FRAME = 128;
  const FIRE_FRAME_W = 64;
  const FIRE_FRAME_H = 64;
  const FIRE_FRAMES = 8;
  const EGG_FRAME = 128;
  const EGG_HATCH_FRAMES = 14;

  const imageCache = {};
  function loadImg(path) {
    if (!path) return null;
    if (!imageCache[path]) {
      const img = new Image();
      img.src = assetUrl(path);
      imageCache[path] = img;
    }
    return imageCache[path];
  }
  function imgReady(img) {
    return img && img.complete && img.naturalWidth > 0;
  }

  function drawTiledAsset(img, x, y, w, h) {
    if (!imgReady(img) || w <= 0 || h <= 0) return false;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    for (let yy = 0; yy < h; yy += ih) {
      for (let xx = 0; xx < w; xx += iw) {
        ctx.drawImage(img, 0, 0, iw, ih, Math.floor(x + xx), Math.floor(y + yy), Math.min(iw, w - xx), Math.min(ih, h - yy));
      }
    }
    return true;
  }

  function drawFittedAsset(img, x, y, w, h, smooth) {
    if (!imgReady(img) || w <= 0 || h <= 0) return false;
    ctx.save();
    if (smooth) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    ctx.restore();
    return true;
  }

  function drawParallaxStrip(img, offsetX, y) {
    if (!imgReady(img)) return false;
    const iw = img.naturalWidth;
    let x = -((Math.floor(offsetX) % iw) + iw) % iw - iw;
    while (x < W) {
      ctx.drawImage(img, Math.floor(x), Math.floor(y));
      x += iw;
    }
    return true;
  }

  let unlocks = (() => {
    try { return JSON.parse(localStorage.getItem("altos8bitUnlocks") || "{}"); }
    catch (_) { return {}; }
  })();
  function saveUnlocks() {
    try { localStorage.setItem("altos8bitUnlocks", JSON.stringify(unlocks)); } catch (_) {}
  }
  function isUnlocked(ch) {
    return !ch.locked || !!unlocks[ch.id];
  }

  let charIndex = 0;
  let CHARACTERS = ROSTER[0].stages;
  let spriteSheets = [];
  let spriteAtlases = [];
  let charEggSheet = null;
  let charFireSheet = null;
  const defaultEggSheet = loadImg("assets/sprites/egg_hatch_sheet.png");
  function currentChar() {
    return ROSTER[charIndex];
  }
  function setCharacter(i) {
    charIndex = ((i % ROSTER.length) + ROSTER.length) % ROSTER.length;
    const ch = currentChar();
    CHARACTERS = ch.stages;
    spriteSheets = ch.stages.map(s => s.sheet ? loadImg(s.sheet) : null);
    spriteAtlases = ch.stages.map(s => s.atlas ? loadImg(s.atlas) : null);
    charEggSheet = ch.eggSheet ? loadImg(ch.eggSheet) : null;
    charFireSheet = ch.fireSheet ? loadImg(ch.fireSheet) : null;
    stageNames = CHARACTERS.map(s => String(s.name || s.id).toUpperCase());
    stageNeed = CHARACTERS.map((_, idx) => idx >= CHARACTERS.length - 1 ? 999 : 5 + idx * 2);
    try { localStorage.setItem("altos8bitChar", ch.id); } catch (_) {}
  }

  const fireSheet = new Image();
  fireSheet.src = assetUrl("assets/sprites/fire_breath_sheet.png");
  const art = {
    far: loadImg("assets/bg/far.png"),
    mid: loadImg("assets/bg/mid.png"),
    near: loadImg("assets/bg/near.png"),
    ground: loadImg("assets/tiles/ground_tile_v2.png"),
    normal: loadImg("assets/tiles/ledge_normal_v2.png"),
    normalCrystal: loadImg("assets/tiles/ledge_crystal_v2.png"),
    trampoline: loadImg("assets/tiles/ledge_trampoline_v2.png"),
    crumble: loadImg("assets/tiles/ledge_crumble_v2.png"),
    spiketop: loadImg("assets/tiles/ledge_spiketop_v2.png"),
    hazard: loadImg("assets/tiles/hazard_spikes_v2.png"),
    checkpoint: loadImg("assets/sprites/checkpoint_flag.png"),
    crystal: loadImg("assets/sprites/crystal_cluster.png"),
    gem: loadImg("assets/sprites/gem.png"),
    heart: loadImg("assets/sprites/heart.png"),
    pearl: loadImg("assets/sprites/powerup_pearl.png"),
    soul: loadImg("assets/sprites/soul_orb.png"),
    enemyDrake: loadImg("assets/sprites/enemy_drake.png"),
    enemyWisp: loadImg("assets/sprites/enemy_wisp.png"),
    boss: loadImg("assets/sprites/ancient_boss.png")
  };
  const ATTACK_ANIM_TIME = 0.56;
  const HURT_ANIM_TIME = 0.42;
  const JUMP_ANIM_TIME = 0.55;
  const MELT_TIME = 0.9; // Malfoy lava-kill puddle duration

  const keys = Object.create(null);
  const platforms = [];
  const shards = [];
  const fires = [];
  const particles = [];
  const rings = [];       // expanding additive shockwave rings (VFX juice)
  const floatText = [];
  const stars = [];
  const enemies = [];
  const bossFires = [];
  const hazards = [];
  let boss = null;
  let winTimer = 0;

  let mode = MODE.TITLE;
  let prevMode = MODE.TITLE;
  let rafLast = performance.now();
  let accumulator = 0;
  let audio = null;
  let cameraX = 0;
  let cameraY = 0;
  let shake = 0;
  let freeze = 0;
  let time = 0;
  let hatchTimer = 0;
  let warmth = 0;
  let score = 0;
  let best = Number(localStorage.getItem("altos8bitBest") || 0);
  let eggshell = [];
  let fireCooldown = 0;
  let flapHeld = false;
  // Seed-varied ground wave, set by buildWorld and read by groundYAt so that
  // hazards/flags land on the real surface. Defaults match the old fixed curve.
  const groundWave = { p1: 0, p2: 0, a1: 5, a2: 7 };

  // Feel & polish state
  const CHECKPOINTS = [1100, 2200];
  let checkpointX = 56;
  let camXf = 0;          // smooth camera (float); cameraX/Y stay rounded for crisp pixels
  let camYf = 0;
  let damageFlash = 0;    // red screen blink after a hit
  let hpFlash = 0;        // HUD heart blink after hp change
  let gemPulse = 0;       // HUD gem counter pop on pickup
  let comboN = 0;         // consecutive-gem pitch ladder
  let comboT = 0;
  let heartbeatT = 0;     // low-HP pulse SFX
  let bossIntroT = 0;     // letterbox cinematic when the boss wakes
  let shootingStar = null;
  const hearts = [];      // heart pickups dropped by enemies
  const fireflies = [];

  // Evolution is intentionally dramatic. Visual size grows much faster than
  // the forgiving collision body, and the camera lifts to keep adult wings in
  // frame when the dragon is standing on the ground.
  // Cell blit size per stage — NOT the dragon's on-screen size. Each stage's
  // art fills its atlas cell by a different amount: the video-generated poses
  // have wide wingspans, and a cell must be scaled down until its widest pose
  // (flight) fits, which leaves the body smaller inside the cell. These values
  // compensate so the DRAGON's on-screen height follows the original curve
  // (41, 68, 88, 108, 129 px standing). That is why they are not monotonic —
  // GUARDIAN's art is the most wing-dominated, so it needs the largest blit to
  // reach its intended body size.
  // Must be monotonic: every evolution has to make the dragon bigger. SKY LORD
  // used to sit at 170, BELOW GUARDIAN's 181, so evolving into it visibly
  // shrank the dragon.
  const STAGE_DRAW = [48, 70, 113, 181, 195, 220];
  const STAGE_BOX = [
    { w: 22, h: 15 }, { w: 24, h: 17 }, { w: 27, h: 19 },
    { w: 30, h: 21 }, { w: 32, h: 23 }, { w: 34, h: 25 }
  ];

  // The course adapts to how big the dragon has grown, on two separate curves.
  //
  // FIT scales what the dragon physically occupies or has to avoid: ledge
  // width and thickness, enemy and hazard size. A Sky Lord perched on a
  // hatchling-sized plank looks wrong, so this tracks body growth closely.
  //
  // GAP scales spacing, and deliberately barely moves. Jump height and flap
  // power are fixed constants — they do not grow with evolution — so scaling
  // gaps to match the body would quietly make the game harder every time the
  // player earns a reward. Wider ledges and roomier headroom read as "the
  // world makes way for you"; longer jumps would read as punishment.
  const LEVEL_FIT_SCALE = [1.00, 1.12, 1.28, 1.44, 1.60, 1.76];
  const LEVEL_GAP_SCALE = [1.00, 1.03, 1.08, 1.13, 1.18, 1.24];
  // Vertical spacing is even more conservative than horizontal: a ledge that
  // drifts too high stops being reachable from the ground at all.
  const VERTICAL_GAP_BLEND = 0.6;

  function levelFit(stage) {
    return LEVEL_FIT_SCALE[Math.max(0, Math.min(LEVEL_FIT_SCALE.length - 1, stage))];
  }
  function levelGap(stage) {
    return LEVEL_GAP_SCALE[Math.max(0, Math.min(LEVEL_GAP_SCALE.length - 1, stage))];
  }

  const player = {
    x: 56,
    y: GROUND_Y - 15,
    vx: 0,
    vy: 0,
    w: 22,
    h: 15,
    face: 1,
    ground: false,
    stamina: 1,
    hp: 5,
    stage: 0,
    xp: 0,
    invuln: 0,
    fireFlash: 0,
    attackAnim: 0,
    hurtAnim: 0,
    jumpAnim: 0,
    deadAnim: 0
  };

  function playerDrawSize() {
    return STAGE_DRAW[Math.min(player.stage, STAGE_DRAW.length - 1)];
  }

  // Resize the hitbox for the current stage, keeping the feet planted so a
  // mid-run evolution never clips the dragon into the ground or a platform.
  function applyStageBox() {
    const box = STAGE_BOX[Math.min(player.stage, STAGE_BOX.length - 1)];
    const feet = player.y + player.h;
    const cx = player.x + player.w / 2;
    player.w = box.w;
    player.h = box.h;
    player.x = cx - box.w / 2;
    player.y = feet - box.h;
  }

  let stageNames = [];
  let stageNeed = [];
  const DEFAULT_EGG_PALETTE = { shell: PAL.blue, shade: PAL.blue3, light: PAL.blue2, accent: PAL.gold, gem: PAL.purple, spark: PAL.white };

  function reset() {
    clearKeys();
    mode = MODE.TITLE;
    prevMode = MODE.TITLE;
    cameraX = 0;
    cameraY = 0;
    shake = 0;
    freeze = 0;
    time = 0;
    hatchTimer = 0;
    warmth = 0;
    score = 0;
    eggshell = [];
    fires.length = 0;
    particles.length = 0;
    rings.length = 0;
    floatText.length = 0;
    enemies.length = 0;
    bossFires.length = 0;
    hazards.length = 0;
    boss = null;
    winTimer = 0;
    player.x = 56;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.ground = false;
    player.stamina = 1;
    player.hp = 5;
    player.stage = 0;
    applyStageBox();
    player.y = GROUND_Y - player.h;
    player.xp = 0;
    player.invuln = 0;
    player.fireFlash = 0;
    player.attackAnim = 0;
    player.hurtAnim = 0;
    player.jumpAnim = 0;
    player.deadAnim = 0;
    flapHeld = false;
    checkpointX = 56;
    camXf = 0;
    camYf = 0;
    damageFlash = 0;
    hpFlash = 0;
    gemPulse = 0;
    comboN = 0;
    comboT = 0;
    heartbeatT = 0;
    bossIntroT = 0;
    shootingStar = null;
    hearts.length = 0;
    buildWorld();
  }

  // -------------------------------------------------------------------
  //  SEEDED LEVEL GENERATOR
  // -------------------------------------------------------------------
  // Every run rolls a fresh seed: the ledge course is stitched from a
  // shuffled chunk library, the ground wave / gems / enemies / hazards are
  // jittered deterministically from that seed, and a sky theme + music
  // track are picked to match. Spawn (0..260) and boss arena (2880+) stay
  // hand-authored so runs always start gently and end at the Ancient.
  let levelSeed = ((Math.random() * 0xffffffff) >>> 0);
  let runPlayTrack = "play";
  let worldTheme = null;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LEVEL_THEMES = [
    { name: "MOONLIT VALE",   tint: null },
    { name: "EMBER DUSK",     tint: "rgba(255,120,60,0.07)" },
    { name: "EMERALD NIGHT",  tint: "rgba(70,220,150,0.06)" },
    { name: "AMETHYST SKY",   tint: "rgba(160,90,255,0.07)" },
    { name: "FROST GLOW",     tint: "rgba(140,210,255,0.07)" },
  ];

  // Chunk library: repeatable course patterns. Coordinates are relative to
  // the chunk origin; ledge y values stay inside the proven 70..120 band and
  // consecutive gaps stay flap-friendly. w = how much level the chunk spans.
  const LEVEL_CHUNKS = [
    { w: 400, ledges: [[30,116,80],[180,92,72],[320,112,64]], drakes: [210], wisps: [] },                       // gentle rollers
    { w: 420, ledges: [[40,110,64,"trampoline"],[190,74,88],[330,102,64]], drakes: [], wisps: [[290,72]] },     // bounce tower
    { w: 440, ledges: [[30,112,88,"crumble"],[190,90,72,"crumble"],[350,110,72]], drakes: [260], wisps: [] },   // crumble bridge
    { w: 420, ledges: [[50,118,96],[220,96,72,"spiketop"],[350,78,72]], drakes: [], wisps: [[160,84]] },        // spike shelf
    { w: 380, ledges: [[40,104,72],[200,80,88]], drakes: [120], wisps: [[320,64]], spikes: [280] },             // gauntlet
    { w: 400, ledges: [[60,90,110]], drakes: [230], wisps: [[110,70],[330,88]] },                               // wisp alley
    { w: 430, ledges: [[30,114,64],[150,92,64],[280,72,64],[380,96,56]], drakes: [], wisps: [] },               // staircase
    { w: 400, ledges: [[40,86,96],[240,110,88,"trampoline"]], drakes: [320], wisps: [[150,60]] },               // drop-and-pop
    { w: 440, ledges: [[30,108,80,"spiketop"],[190,86,80],[350,112,80,"crumble"]], drakes: [], wisps: [[270,92]], spikes: [120] }, // mixed peril
    { w: 380, ledges: [[80,100,120]], drakes: [], wisps: [] },                                                  // breather
  ];

  let ledgeIdx = 0;

  // Ledges carry `vs` (visual scale) as well as scaled collision, because the
  // ledge art is drawn at fixed pixel heights rather than from p.h.
  function addLedge(x, y, w, type, fit, gap) {
    fit = fit || 1;
    gap = gap || 1;
    // Scale the ledge's height ABOVE THE GROUND, not its screen y, so bigger
    // dragons get more clearance underneath instead of the band sliding.
    const vgap = 1 + (gap - 1) * VERTICAL_GAP_BLEND;
    const above = (GROUND_Y - y) * vgap;
    platforms.push({
      x, y: clamp(Math.round(GROUND_Y - above), 50, 124),
      w: Math.round(w * fit), h: Math.round(8 * fit), vs: fit,
      solid: true, ground: false,
      sink: 0, sinkVel: 0, phase: (ledgeIdx++) * 0.7,
      type: type || "normal", crumbleT: 0, respawnT: 0,
    });
  }

  function addDrake(rng, cx, fit) {
    fit = fit || 1;
    enemies.push({
      type: "drake", x: cx, y: GROUND_Y - Math.round(16 * fit),
      w: Math.round(18 * fit), h: Math.round(14 * fit), vs: fit,
      vx: 34 + rng() * 14, range: 50 + rng() * 40, anchorX: cx,
      hp: 1, hurt: 0, dying: 0, dead: false, t: rng() * 6
    });
  }

  function addWisp(rng, x, y, fit) {
    fit = fit || 1;
    enemies.push({
      type: "wisp", x, y, w: Math.round(14 * fit), h: Math.round(14 * fit), vs: fit,
      anchorX: x, anchorY: y,
      hp: 1, hurt: 0, dying: 0, dead: false, t: rng() * 6
    });
  }

  // Stitch shuffled chunks across the midfield from `startX` to the boss
  // approach. Split out of buildWorld so the course ahead of the player can be
  // re-stitched at a new scale when the dragon evolves mid-run.
  function stitchCourse(rng, startX, fit, gap) {
    const flavor = rng();
    const deck = LEVEL_CHUNKS.map((c) => ({ c, k: rng() }));
    deck.sort((u, v) => u.k - v.k);
    let cursor = startX;
    let di = 0;
    while (cursor < 2760) {
      const chunk = deck[di % deck.length].c;
      di += 1;
      const span = Math.round(chunk.w * gap);
      if (cursor + span > 2860) break;
      for (const L of chunk.ledges) {
        let type = L[3] || "normal";
        if (type === "normal") {
          const roll = rng();
          if (flavor < 0.25 && roll < 0.22) type = "trampoline";
          else if (flavor >= 0.25 && flavor < 0.5 && roll < 0.22) type = "crumble";
          else if (flavor >= 0.5 && flavor < 0.7 && roll < 0.16) type = "spiketop";
        }
        addLedge(cursor + L[0] * gap, L[1] + rng() * 10 - 5, L[2], type, fit, gap);
      }
      for (const dx of (chunk.drakes || [])) {
        const cx = cursor + dx * gap;
        // keep patrols clear of checkpoint flags so respawns are safe
        if (CHECKPOINTS.every((c) => Math.abs(cx - c) > 130)) addDrake(rng, cx, fit);
      }
      for (const wsp of (chunk.wisps || [])) {
        addWisp(rng, cursor + wsp[0] * gap, wsp[1] + rng() * 12 - 6, fit);
      }
      for (const sx of (chunk.spikes || [])) {
        const x = cursor + sx * gap;
        if (CHECKPOINTS.every((c) => Math.abs(x - c) > 130) && x > 400) {
          const h = Math.round(18 * fit);
          hazards.push({ type: "spike", x, y: groundYAt(x) - h, w: Math.round(40 * fit), h, t: 0 });
        }
      }
      cursor += span;
    }
    // Closing ledge on the approach to the boss arena
    addLedge(2850, 76 + rng() * 8, 112, "normal", fit, gap);
  }

  // On evolution, re-stitch the course beyond what the player can see so the
  // world matches the new body size. Everything at or behind the camera edge
  // is left untouched — geometry must never move under or near the player.
  function rescaleWorldAhead() {
    const edge = Math.max(cameraX + W + 120, player.x + 260);
    if (edge >= 2760) return;
    for (let i = platforms.length - 1; i >= 0; i -= 1) {
      if (!platforms[i].ground && platforms[i].x >= edge) platforms.splice(i, 1);
    }
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (enemies[i].x >= edge) enemies.splice(i, 1);
    }
    for (let i = hazards.length - 1; i >= 0; i -= 1) {
      if (hazards[i].x >= edge) hazards.splice(i, 1);
    }
    // Fresh deterministic stream per (seed, stage): the rebuilt stretch is not
    // on screen yet, so a different-but-consistent layout is fine.
    const rng = mulberry32((levelSeed ^ (player.stage * 0x9e3779b1)) >>> 0);
    stitchCourse(rng, Math.max(300, Math.ceil(edge / 20) * 20),
                 levelFit(player.stage), levelGap(player.stage));
  }

  function buildWorld() {
    const rng = mulberry32(levelSeed);
    ledgeIdx = 0;
    platforms.length = 0;
    shards.length = 0;
    hazards.length = 0;
    enemies.length = 0;

    worldTheme = LEVEL_THEMES[Math.floor(rng() * LEVEL_THEMES.length)];
    runPlayTrack = ["play", "play_b", "play_c"][Math.floor(rng() * 3)];

    // Ground: same dual-sine character, seed-varied phase and gentle amps.
    // Persist the wave params so groundYAt() reproduces the SAME surface —
    // otherwise spikes/flags placed via groundYAt float above or sink into the
    // real seed-warped ground the player actually walks on.
    groundWave.p1 = rng() * Math.PI * 2; groundWave.p2 = rng() * Math.PI * 2;
    groundWave.a1 = 4 + rng() * 3; groundWave.a2 = 5 + rng() * 4;
    for (let x = 0; x < LEVEL_W; x += TILE) {
      platforms.push({ x, y: groundYAt(x), w: TILE, h: 40, solid: true, ground: true });
    }

    // Hand-authored gentle spawn zone
    addLedge(180, 112 + rng() * 8 - 4, 72, "normal", 1, 1);

    stitchCourse(rng, 300, levelFit(player.stage), levelGap(player.stage));

    // Gems: a ground strand + a sky strand, phase-shifted per run,
    // plus arcs over trampolines as a reward for bouncing high.
    const gphase = rng() * 40;
    for (let i = 0; i < 46; i += 1) {
      const x = 130 + i * 60 + ((i * 37 + gphase) % 29);
      const y = 56 + ((i * 47 + gphase * 3) % 76);
      shards.push({ x, y, got: false, bob: i * 0.65 });
    }
    for (let i = 0; i < 24; i += 1) {
      const x = 240 + i * 112 + ((i * 41 + gphase * 2) % 35);
      const y = -45 - ((i * 67 + gphase * 5) % 390);
      shards.push({ x, y, got: false, bob: 4 + i * 0.72 });
    }
    for (const p of platforms) {
      if (!p.ground && p.type === "trampoline" && rng() < 0.8) {
        for (let k = 0; k < 3; k += 1) {
          shards.push({ x: p.x + p.w / 2 - 14 + k * 14, y: p.y - 46 - k * 9 + (k === 2 ? 9 : 0), got: false, bob: k * 0.8 });
        }
      }
    }

    // Ambient fireflies (seed-jittered)
    fireflies.length = 0;
    for (let i = 0; i < 44; i += 1) {
      fireflies.push({
        x: 90 + i * 70 + rng() * 38,
        y: GROUND_Y - 8 - rng() * 52,
        phase: i * 1.7,
        drift: 8 + (i % 5) * 3
      });
    }

    // Boss arena stays fixed: the Ancient waits at the end
    boss = {
      x: 3050, y: 70, w: 64, h: 56, baseY: 70,
      hp: 8, maxHp: 8,
      hurt: 0, fireCD: 1.6, dying: 0, dead: false,
      t: 0, charged: 0, awakened: false
    };
    bossFires.length = 0;
  }

  function seedStars() {
    stars.length = 0;
    for (let i = 0; i < 90; i += 1) {
      stars.push({
        x: (i * 47) % W,
        y: 8 + ((i * 31) % 74),
        c: i % 4 === 0 ? PAL.gold2 : PAL.blue2,
        tw: 1.2 + (i % 5) * 0.7,   // twinkle speed
        phase: i * 1.31
      });
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function smoothstep(v) {
    return v * v * (3 - 2 * v);
  }

  function rects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function snap(v) {
    return Math.round(v);
  }

  function ensureAudio() {
    if (audio) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor) {
      audio = new Ctor();
      musicSyncToMode();
    }
  }

  function beep(freq, dur = 0.07, type = "square", gain = 0.035, bend = 1) {
    if (!audio) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * bend), now + dur);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function arpeggio(base) {
    [1, 1.25, 1.5, 2].forEach((m, i) => setTimeout(() => beep(base * m, 0.06, "square", 0.03), i * 42));
  }

  // ---------------------------------------------------------------------
  //  CHIPTUNE MUSIC ENGINE
  // ---------------------------------------------------------------------
  // Web-Audio scheduler with ~100ms lookahead. Each track is a list of
  // `parts`; each part has wave, gain, and a sparse array of `{s,f,d}`
  // (step, freq, duration). Steps are 16th-notes; tracks loop at
  // track.steps. Calling musicSet(name) crossfades to the new track on
  // the next scheduling tick.
  //
  // Keep the music quiet relative to SFX so it never overpowers actions.
  // Master gain ~0.45 makes a square-bass sit just below jump/fire blips.
  let musicEnabled = (() => {
    try { return localStorage.getItem("altos8bitMusic") !== "0"; }
    catch (_) { return true; }
  })();
  let musicTrack = null;
  let musicStep = 0;
  let musicNextTime = 0;
  const MUSIC_MASTER = 0.45;
  const LOOKAHEAD = 0.10; // seconds

  function _n(s, f, d) { return { s: s, f: f, d: d || 0.18 }; }
  // Note frequencies (Hz) for compact reuse below
  const C3=130.81,D3=146.83,E3=164.81,F3=174.61,G3=196.00,A3=220.00,B3=246.94;
  const C4=261.63,D4=293.66,E4=329.63,F4=349.23,G4=392.00,A4=440.00,B4=493.88;
  const C5=523.25,D5=587.33,E5=659.25,F5=698.46,G5=783.99,A5=880.00;
  const E2=82.41,A2=110.00,F2=87.31,G2=98.00;

  const MUSIC_TRACKS = {
    title: {
      bpm: 92, steps: 64,
      parts: [
        { wave: "triangle", gain: 0.030, notes: [
            _n(0,A3,0.6), _n(16,F3,0.6), _n(32,C3,0.6), _n(48,G3,0.6) ]},
        { wave: "square",   gain: 0.020, notes: [
            _n(0,A4,0.5), _n(8,C5,0.4), _n(16,F4,0.5), _n(24,A4,0.4),
            _n(32,C4,0.5), _n(40,E4,0.4), _n(48,G4,0.5), _n(56,B4,0.4) ]},
      ]
    },
    play: {
      bpm: 132, steps: 64,
      parts: [
        // Driving bass: root every quarter note (4 hits/bar, 4 bars)
        { wave: "triangle", gain: 0.034, notes: [
            _n(0,C3,0.18), _n(4,C3,0.18), _n(8,C3,0.18), _n(12,C3,0.18),
            _n(16,A2,0.18), _n(20,A2,0.18), _n(24,A2,0.18), _n(28,A2,0.18),
            _n(32,F2,0.18), _n(36,F2,0.18), _n(40,F2,0.18), _n(44,F2,0.18),
            _n(48,G2,0.18), _n(52,G2,0.18), _n(56,G2,0.18), _n(60,G2,0.18) ]},
        // Lead â€” pentatonic hook, 2-bar phrase repeated
        { wave: "square", gain: 0.022, notes: [
            _n(0,C5,0.22), _n(2,E5,0.18), _n(4,G5,0.22), _n(6,E5,0.18),
            _n(8,A5,0.30), _n(12,G5,0.18), _n(14,E5,0.18),
            _n(16,A4,0.22), _n(18,C5,0.18), _n(20,E5,0.22),
            _n(24,D5,0.18), _n(26,C5,0.18), _n(28,A4,0.30),
            _n(32,F4,0.22), _n(34,A4,0.18), _n(36,C5,0.30),
            _n(40,F5,0.30), _n(44,A5,0.30),
            _n(48,G4,0.22), _n(50,B4,0.18), _n(52,D5,0.22), _n(54,B4,0.18),
            _n(56,G5,0.18), _n(58,B4,0.18), _n(60,D5,0.30) ]},
        // Hi blip on offbeats (echoes of a tambourine)
        { wave: "square", gain: 0.010, notes: [
            _n(2,E5,0.06), _n(6,E5,0.06), _n(10,E5,0.06), _n(14,E5,0.06),
            _n(18,E5,0.06), _n(22,E5,0.06), _n(26,E5,0.06), _n(30,E5,0.06),
            _n(34,E5,0.06), _n(38,E5,0.06), _n(42,E5,0.06), _n(46,E5,0.06),
            _n(50,E5,0.06), _n(54,E5,0.06), _n(58,E5,0.06), _n(62,E5,0.06) ]},
      ]
    },
    boss: {
      bpm: 144, steps: 64,
      parts: [
        // Pulsing bass â€” every 8th note, A minor
        { wave: "sawtooth", gain: 0.030, notes: (() => {
            const arr = []; for (let i = 0; i < 16; i++) arr.push(_n(i*4, A2, 0.20));
            for (let i = 8; i < 16; i++) arr[i] = _n(i*4, F2, 0.20);
            return arr;
          })()},
        // Ominous descending lead
        { wave: "square", gain: 0.024, notes: [
            _n(0,A4,0.24), _n(4,G4,0.24), _n(8,F4,0.24), _n(12,E4,0.24),
            _n(16,A4,0.24), _n(20,G4,0.24), _n(24,F4,0.40),
            _n(32,C5,0.20), _n(36,B4,0.20), _n(40,A4,0.20), _n(44,G4,0.20),
            _n(48,F4,0.40), _n(56,E4,0.40) ]},
        // High tension shimmer
        { wave: "triangle", gain: 0.012, notes: [
            _n(2,E5,0.08), _n(10,F5,0.08), _n(18,E5,0.08), _n(26,F5,0.08),
            _n(34,G5,0.08), _n(42,F5,0.08), _n(50,A5,0.08), _n(58,G5,0.08) ]},
        // Heavy kick on quarters + driving hats on 8ths
        { wave: "kick", gain: 0.055, notes: (() => {
            const arr = []; for (let i = 0; i < 16; i++) arr.push(_n(i * 4, 170, 0.10));
            return arr;
          })()},
        { wave: "noise", gain: 0.010, notes: (() => {
            const arr = []; for (let i = 0; i < 32; i++) arr.push(_n(i * 2 + 1, 0, 0.03));
            return arr;
          })()},
      ]
    },
  };
  // Percussion for the play track (kept out of the literal above so the
  // melodic parts stay readable): kick on quarters, hat on offbeats.
  MUSIC_TRACKS.play.parts.push(
    { wave: "kick", gain: 0.048, notes: (() => {
        const arr = []; for (let i = 0; i < 16; i++) arr.push(_n(i * 4, 150, 0.09));
        return arr;
      })()},
    { wave: "noise", gain: 0.011, notes: (() => {
        const arr = []; for (let i = 0; i < 16; i++) arr.push(_n(i * 4 + 2, 0, 0.035));
        return arr;
      })()}
  );

  // Two more overworld songs; one of the three is picked per run so every
  // adventure has its own soundtrack.
  const B2 = 123.47, Bb2 = 116.54, Bb3 = 233.08, Bb4 = 466.16;

  // "Crystal Caverns" â€” A minor, moodier groove with a walking 8th bass.
  MUSIC_TRACKS.play_b = {
    bpm: 120, steps: 128,
    parts: [
      { wave: "triangle", gain: 0.034, notes: (() => {
          const arr = [];
          const bars = [
            [A2, E3, A3, E3], [A2, E3, A3, E3], [F2, C3, F3, C3], [F2, C3, F3, C3],
            [C3, G3, C4, G3], [G2, D3, G3, D3], [A2, E3, A3, E3], [E2, B2, E3, B2],
          ];
          bars.forEach((b, bar) => {
            for (let k = 0; k < 8; k++) arr.push(_n(bar * 16 + k * 2, b[k % 4], 0.14));
          });
          return arr;
        })()},
      { wave: "square", gain: 0.022, notes: [
          _n(0,A4,0.30), _n(4,C5,0.18), _n(6,E5,0.18), _n(8,A5,0.35), _n(12,G5,0.18), _n(14,E5,0.18),
          _n(16,D5,0.18), _n(18,E5,0.18), _n(20,C5,0.30), _n(24,A4,0.40),
          _n(32,F4,0.30), _n(36,A4,0.18), _n(38,C5,0.18), _n(40,F5,0.35), _n(44,E5,0.18), _n(46,C5,0.18),
          _n(48,D5,0.18), _n(50,C5,0.18), _n(52,A4,0.30), _n(56,F4,0.40),
          _n(64,E5,0.20), _n(66,G5,0.18), _n(68,C5,0.20), _n(70,E5,0.18), _n(72,G4,0.35),
          _n(80,B4,0.20), _n(82,D5,0.18), _n(84,G4,0.30), _n(88,B4,0.20), _n(92,D5,0.30),
          _n(96,A4,0.30), _n(100,C5,0.18), _n(102,E5,0.18), _n(104,A5,0.40),
          _n(112,G5,0.18), _n(114,E5,0.18), _n(116,B4,0.30), _n(120,E5,0.50) ]},
      { wave: "triangle", gain: 0.010, notes: [
          _n(10,E5,0.08), _n(26,C5,0.08), _n(42,F5,0.08), _n(58,A4,0.08),
          _n(74,G5,0.08), _n(90,D5,0.08), _n(106,E5,0.08), _n(122,B4,0.08) ]},
      { wave: "kick", gain: 0.050, notes: (() => {
          const arr = []; for (let i = 0; i < 8; i++) { arr.push(_n(i*16, 150, 0.09)); arr.push(_n(i*16+8, 150, 0.09)); }
          return arr;
        })()},
      { wave: "noise", gain: 0.018, notes: (() => {   // snare on 2 & 4
          const arr = []; for (let i = 0; i < 8; i++) { arr.push(_n(i*16+4, 0, 0.06)); arr.push(_n(i*16+12, 0, 0.06)); }
          return arr;
        })()},
      { wave: "noise", gain: 0.009, notes: (() => {   // offbeat hats
          const arr = []; for (let i = 0; i < 32; i++) arr.push(_n(i*4+2, 0, 0.03));
          return arr;
        })()},
    ]
  };

  // "Cloud Hop" â€” F major, bouncy staccato hops with bell arps.
  MUSIC_TRACKS.play_c = {
    bpm: 138, steps: 128,
    parts: [
      { wave: "triangle", gain: 0.033, notes: (() => {
          const arr = [];
          const bars = [
            [F2, F3], [F2, F3], [D3, D4], [D3, D4],
            [Bb2, Bb3], [Bb2, Bb3], [C3, C4], [C3, C4],
          ];
          bars.forEach((b, bar) => {
            arr.push(_n(bar*16,      b[0], 0.16));
            arr.push(_n(bar*16 + 6,  b[1], 0.12));
            arr.push(_n(bar*16 + 8,  b[0], 0.16));
            arr.push(_n(bar*16 + 14, b[1], 0.10));
          });
          return arr;
        })()},
      { wave: "square", gain: 0.022, notes: [
          _n(0,F4,0.12), _n(2,A4,0.12), _n(4,C5,0.12), _n(6,A4,0.12), _n(8,F5,0.25),
          _n(18,E5,0.12), _n(20,C5,0.12), _n(22,A4,0.12), _n(24,C5,0.25),
          _n(32,D5,0.12), _n(34,F5,0.12), _n(36,A5,0.25), _n(40,F5,0.12), _n(42,D5,0.12),
          _n(48,E5,0.12), _n(50,D5,0.12), _n(52,A4,0.30),
          _n(64,Bb4,0.12), _n(66,D5,0.12), _n(68,F5,0.25), _n(72,D5,0.12), _n(74,Bb4,0.12),
          _n(80,C5,0.12), _n(82,Bb4,0.12), _n(84,G4,0.30),
          _n(96,G4,0.12), _n(98,B4,0.12), _n(100,D5,0.12), _n(102,G5,0.25),
          _n(112,E5,0.12), _n(114,D5,0.12), _n(116,B4,0.12), _n(120,C5,0.40) ]},
      { wave: "triangle", gain: 0.012, notes: [
          _n(0,C5,0.08), _n(16,A4,0.08), _n(32,F5,0.08), _n(48,C5,0.08),
          _n(64,F5,0.08), _n(80,Bb4,0.08), _n(96,D5,0.08), _n(112,G4,0.08) ]},
      { wave: "kick", gain: 0.048, notes: (() => {
          const arr = []; for (let i = 0; i < 8; i++) { arr.push(_n(i*16, 150, 0.09)); arr.push(_n(i*16+10, 145, 0.08)); }
          return arr;
        })()},
      { wave: "noise", gain: 0.017, notes: (() => {
          const arr = []; for (let i = 0; i < 8; i++) { arr.push(_n(i*16+4, 0, 0.055)); arr.push(_n(i*16+12, 0, 0.055)); }
          return arr;
        })()},
      { wave: "noise", gain: 0.008, notes: (() => {
          const arr = []; for (let i = 0; i < 16; i++) { arr.push(_n(i*8+2, 0, 0.03)); arr.push(_n(i*8+6, 0, 0.03)); }
          return arr;
        })()},
    ]
  };

  // One-shot stings â€” same shape but `loop:false`; when one finishes the
  // engine re-syncs to the current mode's track (silence for END/WIN).
  const MUSIC_STINGS = {
    evolve: {
      bpm: 140, steps: 16, loop: false,
      parts: [
        { wave: "triangle", gain: 0.036, notes: [
            _n(0,C4,0.14), _n(2,E4,0.14), _n(4,G4,0.14),
            _n(6,C5,0.20), _n(10,E5,0.34), _n(12,G5,0.50) ]},
        { wave: "square", gain: 0.022, notes: [
            _n(0,C5,0.12), _n(4,E5,0.12), _n(8,G5,0.20), _n(12,A5,0.45) ]},
      ]
    },
    win: {
      bpm: 132, steps: 32, loop: false,
      parts: [
        { wave: "triangle", gain: 0.034, notes: [
            _n(0,C4,0.18), _n(4,E4,0.18), _n(8,G4,0.18),
            _n(12,C5,0.30), _n(20,E5,0.30), _n(28,G5,0.50) ]},
        { wave: "square",   gain: 0.024, notes: [
            _n(0,G4,0.18), _n(4,C5,0.18), _n(8,E5,0.18),
            _n(12,G5,0.30), _n(20,A5,0.40) ]},
      ]
    },
    end: {
      bpm: 100, steps: 32, loop: false,
      parts: [
        { wave: "triangle", gain: 0.030, notes: [
            _n(0,A3,0.30), _n(8,F3,0.30), _n(16,D3,0.30), _n(24,C3,0.60) ]},
        { wave: "square", gain: 0.022, notes: [
            _n(0,A4,0.30), _n(8,F4,0.30), _n(16,D4,0.30), _n(24,C4,0.60) ]},
      ]
    },
  };

  function musicSet(name) {
    if (!audio || !musicEnabled) { musicTrack = null; return; }
    const next = MUSIC_TRACKS[name] || MUSIC_STINGS[name] || null;
    if (!next) { musicTrack = null; return; }
    if (musicTrack && musicTrack.__name === name) return;
    musicTrack = Object.assign({}, next, { __name: name, __loop: !(next.loop === false) });
    musicStep = 0;
    musicNextTime = audio.currentTime + 0.05;
  }

  function musicStop() { musicTrack = null; }

  let noiseBuffer = null;
  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const len = Math.floor(audio.sampleRate * 0.1);
    noiseBuffer = audio.createBuffer(1, len, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function _scheduleNote(part, n, when) {
    const peakGain = Math.max(0.0005, part.gain * MUSIC_MASTER);
    if (part.wave === "noise") {
      // Hi-hat: a short burst of white noise
      const src = audio.createBufferSource();
      src.buffer = getNoiseBuffer();
      const namp = audio.createGain();
      namp.gain.setValueAtTime(peakGain, when);
      namp.gain.exponentialRampToValueAtTime(0.0005, when + n.d);
      src.connect(namp); namp.connect(audio.destination);
      src.start(when); src.stop(when + n.d + 0.02);
      return;
    }
    if (part.wave === "kick") {
      // Kick: a sine that drops fast from n.f to sub range
      const osc = audio.createOscillator();
      const kamp = audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + n.d);
      kamp.gain.setValueAtTime(peakGain, when);
      kamp.gain.exponentialRampToValueAtTime(0.0005, when + n.d);
      osc.connect(kamp); kamp.connect(audio.destination);
      osc.start(when); osc.stop(when + n.d + 0.03);
      return;
    }
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = part.wave;
    osc.frequency.setValueAtTime(n.f, when);
    const dur = n.d;
    const peak = Math.max(0.0005, part.gain * MUSIC_MASTER);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    osc.connect(amp); amp.connect(audio.destination);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function musicTick() {
    if (!audio || !musicTrack || !musicEnabled) return;
    const stepDur = 60 / musicTrack.bpm / 4;
    while (musicNextTime < audio.currentTime + LOOKAHEAD) {
      for (const part of musicTrack.parts) {
        for (const n of part.notes) {
          if (n.s === musicStep) _scheduleNote(part, n, musicNextTime);
        }
      }
      musicNextTime += stepDur;
      musicStep += 1;
      if (musicStep >= musicTrack.steps) {
        if (musicTrack.__loop) musicStep = 0;
        else {
          // Sting finished: fall back to whatever the current mode wants
          // (musicForMode returns null for END/WIN, which stays silent).
          musicTrack = null;
          musicSyncToMode();
          break;
        }
      }
    }
  }

  function musicForMode() {
    if (mode === MODE.TITLE) return "title";
    if (mode === MODE.SELECT || mode === MODE.EGG || mode === MODE.HATCH) return "title";
    if (mode === MODE.PLAY || mode === MODE.PAUSE || mode === MODE.EVOLVE) {
      if (boss && boss.awakened && !boss.dead) return "boss";
      return runPlayTrack; // per-run pick: play / play_b / play_c
    }
    return null;
  }

  function musicSyncToMode() {
    if (!audio) return;
    const m = musicForMode();
    if (m) musicSet(m);
  }

  function musicToggle() {
    musicEnabled = !musicEnabled;
    try { localStorage.setItem("altos8bitMusic", musicEnabled ? "1" : "0"); } catch (_) {}
    if (!musicEnabled) musicStop();
    else musicSyncToMode();
    addText(musicEnabled ? "MUSIC ON" : "MUSIC OFF",
            (cameraX || 0) + 130, 90, PAL.gold2);
    beep(musicEnabled ? 540 : 220, 0.06, "square", 0.025, 1.4);
  }


  function addDust(x, y, n, c = PAL.gold) {
    for (let i = 0; i < n; i += 1) {
      particles.push({
        x,
        y,
        vx: -80 + Math.random() * 160,
        vy: -110 + Math.random() * 85,
        life: 0.25 + Math.random() * 0.35,
        c,
        s: 1 + Math.floor(Math.random() * 3)
      });
    }
  }

  // --- VFX juice: shockwave rings, glowing sparks, additive light bloom ------
  function addRing(x, y, r0, r1, life, color, width) {
    rings.push({ x, y, r0, r1, life, max: life, c: color, w: width || 2 });
  }

  function addSparks(x, y, n, color, spd) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.35 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 24,
        life: 0.26 + Math.random() * 0.42,
        g: 150,
        c: color,
        s: Math.random() > 0.72 ? 2 : 1,
        glow: true
      });
    }
  }

  // A soft additive light blob — the core of the "HD glow over crisp pixels" look.
  function glowBlob(x, y, r, color, alpha) {
    if (r < 1) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
  }

  function addText(text, x, y, c = PAL.gold2) {
    floatText.push({ text, x, y, life: 0.85, c });
  }

  function selectedName() {
    return currentChar().name;
  }

  function selectedEggPalette() {
    return currentChar().eggPalette || DEFAULT_EGG_PALETTE;
  }

  function grantUnlocks(event) {
    for (const ch of ROSTER) {
      if (!ch.locked || unlocks[ch.id] || !ch.unlock) continue;
      const u = ch.unlock;
      const hit = (u.type === "win" && event.type === "win") ||
                  (u.type === "stage" && event.type === "stage" && event.stage >= u.stage);
      if (hit) {
        unlocks[ch.id] = true;
        saveUnlocks();
        addText(ch.name + " UNLOCKED!", cameraX + 90, 56, PAL.gold2);
        arpeggio(523);
      }
    }
  }

  function startSelect() {
    ensureAudio();
    mode = MODE.SELECT;
    hatchTimer = 0;
    particles.length = 0;
    arpeggio(196);
    musicSyncToMode();
  }

  function chooseCharacter(delta) {
    hatchTimer = 0;
    setCharacter(charIndex + delta);
    const x = delta < 0 ? 74 : 246;
    addDust(x, 110, 9, PAL.gold2);
    beep(280 + charIndex * 45, 0.06, "square", 0.025, 1.2);
  }

  function startEgg() {
    ensureAudio();
    const ch = currentChar();
    if (!isUnlocked(ch)) {
      addText("LOCKED!", 140, 70, PAL.red);
      shake = Math.max(shake, 2);
      beep(140, 0.12, "sawtooth", 0.03, 0.6);
      return;
    }
    mode = MODE.EGG;
    warmth = 0;
    hatchTimer = 0;
    particles.length = 0;
    arpeggio(220);
    musicSyncToMode();
  }

  function startHatch() {
    mode = MODE.HATCH;
    hatchTimer = 0;
    shake = 7;
    // Hatch chime â€” rising arpeggio
    [261, 329, 392, 523, 659].forEach((f, i) => setTimeout(() => beep(f, 0.10, "triangle", 0.030, 1.2), i * 80));

    eggshell = [];
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      eggshell.push({
        x: W / 2,
        y: 98,
        vx: Math.cos(a) * (40 + Math.random() * 90),
        vy: Math.sin(a) * (40 + Math.random() * 80) - 95,
        r: 2 + Math.floor(Math.random() * 4),
        c: i % 3 === 0 ? PAL.gold : i % 3 === 1 ? PAL.blue2 : PAL.blue3
      });
    }
    addDust(W / 2, 96, 45, PAL.blue2);
    arpeggio(330);
  }

  function startPlay() {
    // Every run is a new adventure: fresh seed -> fresh course, theme, song
    levelSeed = ((Math.random() * 0xffffffff) >>> 0);
    buildWorld();
    mode = MODE.PLAY;
    musicSyncToMode();
    player.x = 56;
    player.vx = 0;
    player.vy = 0;
    player.hp = 5;
    player.stamina = 1;
    player.stage = 0;
    player.xp = 0;
    applyStageBox();
    player.y = GROUND_Y - player.h;
    player.attackAnim = 0;
    player.hurtAnim = 0;
    player.jumpAnim = 0;
    player.deadAnim = 0;
    checkpointX = 56;
    camXf = 0;
    camYf = clamp(player.y - 88, CAMERA_TOP_Y, 0);
    cameraX = 0;
    cameraY = Math.round(camYf);
    addText(selectedName() + "!", player.x, player.y - 16, PAL.gold2);
    if (worldTheme) addText(worldTheme.name, player.x + 4, player.y - 30, PAL.blue2);
  }

  function continueFromCheckpoint() {
    mode = MODE.PLAY;
    player.hp = 5;
    player.invuln = 2;
    player.hurtAnim = 0;
    player.deadAnim = 0;
    player.x = checkpointX;
    player.y = 40;
    player.vx = 0;
    player.vy = 0;
    player.stamina = 1;
    bossFires.length = 0;
    camXf = clamp(player.x - 92, 0, LEVEL_W - W);
    camYf = clamp(player.y - 88, CAMERA_TOP_Y, 0);
    cameraX = Math.round(camXf);
    cameraY = Math.round(camYf);
    addText("GO!", player.x, player.y - 14, PAL.gold2);
    arpeggio(392);
    musicSyncToMode();
  }

  function evolve() {
    if (player.stage >= CHARACTERS.length - 1) return;
    player.stage += 1;
    player.xp = 0;
    applyStageBox();
    rescaleWorldAhead();
    mode = MODE.EVOLVE;
    hatchTimer = 0;
    shake = 8;
    freeze = 0.08;
    addDust(player.x + 14, player.y + 10, 70, PAL.gold2);
    // evolution burst: twin shockwaves + a fountain of golden sparks
    const ecx = player.x + player.w / 2, ecy = player.y + player.h / 2;
    addRing(ecx, ecy, 6, 96, 0.6, PAL.gold2, 3);
    addRing(ecx, ecy, 6, 62, 0.46, PAL.white, 2);
    addSparks(ecx, ecy, 34, PAL.gold2, 150);
    musicSet("evolve");
    grantUnlocks({ type: "stage", stage: player.stage });
  }

  function update(dt) {
    time += dt;
    fireCooldown = Math.max(0, fireCooldown - dt);
    musicTick();
    player.attackAnim = Math.max(0, player.attackAnim - dt);
    player.hurtAnim = Math.max(0, player.hurtAnim - dt);
    player.jumpAnim = Math.max(0, player.jumpAnim - dt);
    if (mode === MODE.END) player.deadAnim += dt;
    shake = Math.max(0, shake - dt * 16);
    damageFlash = Math.max(0, damageFlash - dt);
    hpFlash = Math.max(0, hpFlash - dt);
    gemPulse = Math.max(0, gemPulse - dt);
    comboT = Math.max(0, comboT - dt);
    bossIntroT = Math.max(0, bossIntroT - dt);

    // Occasional shooting star (any mode with a sky)
    if (shootingStar) {
      shootingStar.t += dt;
      if (shootingStar.t > 0.9) shootingStar = null;
    } else if (Math.random() < dt * 0.10) {
      shootingStar = { x: 60 + Math.random() * (W - 60), y: 8 + Math.random() * 46, t: 0 };
    }

    // A true PAUSE must freeze the world — otherwise crumble/respawn ledge
    // timers keep counting down while paused and a ledge can vanish under the
    // player on resume. Everything else still animates its menu particles.
    if (mode !== MODE.PAUSE) {
      updateParticles(dt);
      updateRings(dt);
      updatePlatforms(dt);
    }

    if (mode === MODE.TITLE) return;
    if (mode === MODE.SELECT) {
      hatchTimer += dt;
      return;
    }
    if (mode === MODE.EGG) {
      warmth = clamp(warmth - dt * 4.2, 0, 100);
      if ((keys.Enter || keys.Space || keys.up || keys.fire || keys.KeyJ || keys.KeyX) && hatchTimer <= 0) {
        warmEgg(10);
        hatchTimer = 0.12;
      }
      hatchTimer = Math.max(0, hatchTimer - dt);
      return;
    }
    if (mode === MODE.HATCH) {
      hatchTimer += dt;
      for (const e of eggshell) {
        e.vy += 210 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      if (hatchTimer > 1.65) startPlay();
      return;
    }
    if (mode === MODE.EVOLVE) {
      hatchTimer += dt;
      player.vx *= 0.88;
      if (hatchTimer > 1.2 && (keys.Enter || keys.Space || keys.KeyJ || keys.KeyX)) {
        mode = MODE.PLAY;
      }
      if (hatchTimer > 2.2) mode = MODE.PLAY;
      return;
    }
    if (mode === MODE.WIN) {
      winTimer += dt;
      player.vx *= 0.9;
      return;
    }
    if (mode !== MODE.PLAY) return;

    player.fireFlash = Math.max(0, player.fireFlash - dt);
    updatePlayer(dt);
    updateFire(dt);
    updateShards(dt);
    updateHearts(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBossFires(dt);
    updateHazards(dt);

    // Checkpoints: passing a flag saves it for END-screen continues
    for (const cx of CHECKPOINTS) {
      if (player.x > cx && checkpointX < cx) {
        checkpointX = cx;
        addText("CHECKPOINT!", cx - 26, player.y - 22, PAL.blue2);
        addDust(cx, groundYAt(cx) - 30, 14, PAL.gold2);
        arpeggio(440);
      }
    }

    // Ambient atmosphere: slow-rising glowing motes drift through the scene
    if (Math.random() < dt * 2.6) {
      particles.push({
        x: cameraX + Math.random() * W,
        y: cameraY + H * 0.45 + Math.random() * H * 0.6,
        vx: -6 + Math.random() * 12,
        vy: -7 - Math.random() * 11,
        life: 1.3 + Math.random() * 1.3,
        g: -10,
        c: Math.random() > 0.5 ? PAL.gold2 : PAL.blue2,
        s: 1,
        glow: true
      });
    }

    // Low-HP heartbeat
    if (player.hp === 1) {
      heartbeatT -= dt;
      if (heartbeatT <= 0) {
        heartbeatT = 0.85;
        beep(72, 0.09, "sine", 0.028, 0.7);
      }
    }

    // Smooth camera: lead the player's facing + velocity, then round for
    // crisp pixels. Floats live in camXf/camYf.
    // The forward lead has to yield as the dragon grows. It used to park the
    // player at a fixed screen x≈66 whatever the sprite size, so ANCIENT --
    // drawn 220px wide on a 320px screen -- lost ~44px of wing off the left
    // edge. Scale the lead by the spare width, then hard-clamp the sprite's
    // draw box inside the viewport.
    const halfDraw = playerDrawSize() / 2;
    const spare = clamp((W - 2 * halfDraw) / W, 0, 1);
    const lead = (player.face * 26 + player.vx * 0.14) * spare;
    let centerX = 92 + player.w / 2 - lead;   // where the sprite centre lands
    const minCenter = halfDraw + 4;
    const maxCenter = W - halfDraw - 4;
    // if it is too wide to fit at all, centring loses the least
    centerX = minCenter > maxCenter ? W / 2 : clamp(centerX, minCenter, maxCenter);
    const lookX = clamp(player.x + player.w / 2 - centerX, 0, LEVEL_W - W);
    const growthLift = Math.max(0, playerDrawSize() - 88) * 0.42;
    const lookY = clamp(player.y - 88 - growthLift + player.vy * 0.10, CAMERA_TOP_Y, 0);
    camXf += (lookX - camXf) * Math.min(1, dt * 5.2);
    camYf += (lookY - camYf) * Math.min(1, dt * 5.0);
    cameraX = Math.round(camXf);
    cameraY = Math.round(camYf);
  }

  function groundYAt(x) {
    return GROUND_Y + Math.sin(x * 0.018 + groundWave.p1) * groundWave.a1
         + Math.sin(x * 0.006 + groundWave.p2) * groundWave.a2;
  }

  function warmEgg(amount) {
    warmth = clamp(warmth + amount, 0, 100);
    addDust(W / 2, 96, 6, Math.random() > 0.5 ? PAL.blue2 : PAL.gold);
    beep(180 + warmth * 4, 0.05, "triangle", 0.025, 1.35);
    if (warmth >= 100) startHatch();
  }

  function updatePlayer(dt) {
    const left = keys.left || keys.ArrowLeft || keys.KeyA;
    const right = keys.right || keys.ArrowRight || keys.KeyD;
    const flap = keys.up || keys.ArrowUp || keys.KeyW || keys.Space;
    const down = keys.down || keys.ArrowDown || keys.KeyS;
    const fire = keys.fire || keys.KeyJ || keys.KeyX || keys.ControlLeft || keys.ControlRight;
    const axis = (right ? 1 : 0) - (left ? 1 : 0);

    if (axis) player.face = axis;
    const accel = player.ground ? 650 : 520;
    const max = 98 + player.stage * 14;
    player.vx += axis * accel * dt;
    if (!axis) player.vx *= player.ground ? 0.78 : 0.95;
    player.vx = clamp(player.vx, -max, max);

    if (flap && !flapHeld && player.stamina > 0.05) {
      player.vy = Math.min(player.vy, 0);
      player.vy -= player.ground ? 152 : 118;
      player.ground = false;
      player.jumpAnim = JUMP_ANIM_TIME;
      player.stamina = clamp(player.stamina - 0.04, 0, 1);
      shake = Math.max(shake, 1.4);
      addDust(player.x + 12, player.y + 18, 8, PAL.blue2);
      beep(260, 0.055, "triangle", 0.025, 1.22);
    }
    if (flap && player.stamina > 0.015) {
      player.vy -= 540 * dt;
      player.ground = false;
      player.stamina = clamp(player.stamina - dt * 0.11, 0, 1);
      if (Math.random() > 0.62) addDust(player.x + 12, player.y + 18, 1, PAL.blue2);
    }
    flapHeld = !!flap;
    if (down) player.vy += 300 * dt;

    player.vy += (flap ? 470 : GRAVITY) * dt;
    if (!player.ground && !flap && !down && player.vy > 30) player.vy -= 115 * dt;
    player.vy = clamp(player.vy, -265, 245);

    player.x += player.vx * dt;
    collideX();
    const prevY = player.y;
    player.y += player.vy * dt;
    collideY(prevY);

    player.x = clamp(player.x, 2, LEVEL_W - 36);
    if (player.y < FLIGHT_CEILING_Y) {
      player.y = FLIGHT_CEILING_Y;
      player.vy = Math.max(20, player.vy);
    }
    if (player.y > H + 40) {
      hurt();
      player.x = Math.max(40, player.x - 70);
      player.y = 20;
      player.vy = 0;
    }

    // Stamina: fast recovery on the ground, slow recovery only while GLIDING.
    // Actively holding flap must NOT regenerate — otherwise the 0.11/s flap
    // drain is cancelled by a 0.13/s air regen (net +0.02/s) and flight is
    // effectively unlimited. Flapping now costs; gliding slowly recovers.
    if (player.ground) player.stamina = clamp(player.stamina + dt * 0.75, 0, 1);
    else if (!flap) player.stamina = clamp(player.stamina + dt * 0.13, 0, 1);

    // Footstep dust while running
    if (player.ground && Math.abs(player.vx) > 46 && Math.random() > 0.85) {
      particles.push({
        x: player.x + 14 - player.face * 8,
        y: player.y + player.h,
        vx: -player.face * (14 + Math.random() * 18),
        vy: -22 - Math.random() * 18,
        life: 0.22 + Math.random() * 0.15,
        g: 140,
        c: "#3f7f63",
        s: 1
      });
    }

    if (fire && fireCooldown <= 0 && player.stamina > 0.09) {
      shootFire();
    }
    player.invuln = Math.max(0, player.invuln - dt);
  }

  function collideX() {
    const box = { x: player.x + 4, y: player.y + 4, w: player.w - 8, h: player.h - 4 };
    for (const p of platforms) {
      if (!p.wall) continue;
      if (!rects(box, p)) continue;
      if (player.vx > 0) player.x = p.x - player.w + 4;
      else if (player.vx < 0) player.x = p.x + p.w - 4;
      player.vx = 0;
      break;
    }
  }

  function collideY(prevY) {
    player.ground = false;
    const box = { x: player.x + 5, y: player.y + 4, w: player.w - 10, h: player.h - 2 };
    const prevBottom = prevY + player.h - 2;
    for (const p of platforms) {
      if (p.solid === false) continue;
      const py = platformCollisionY(p);
      const pbox = { x: p.x, y: py, w: p.w, h: p.h };
      if (!rects(box, pbox)) continue;
      if (player.vy > 0 && prevBottom <= py + 7) {
        const impact = player.vy;
        // Spike-topped platform: hurt + bounce off, don't land
        if (p.type === "spiketop") {
          player.y = py - player.h + 2;
          player.vy = -160;
          hurt();
          continue;
        }
        // Trampoline: super-bounce
        if (p.type === "trampoline") {
          player.y = py - player.h + 2;
          player.vy = -210 - Math.min(60, impact * 0.4);
          bumpPlatform(p, impact * 1.4, false);
          shake = Math.max(shake, 4);
          addDust(player.x + 14, py, 14, PAL.gold2);
          addText("BOING", player.x, py - 8, PAL.gold2);
          beep(540, 0.10, "square", 0.038, 1.6);
          beep(720, 0.08, "square", 0.025, 1.8);
          continue;
        }
        player.y = py - player.h + 2;
        if (!player.ground && impact > 95) {
          bumpPlatform(p, impact, false);
          shake = Math.max(shake, 2.5);
          addDust(player.x + 14, player.y + player.h, 8, PAL.gold);
          beep(80, 0.06, "square", 0.018, 0.65);
        }
        // Crumble: start the timer on landing
        if (p.type === "crumble" && p.crumbleT === 0 && p.respawnT === 0) {
          p.crumbleT = 0.7;
          shake = Math.max(shake, 2);
          beep(180, 0.08, "sawtooth", 0.022, 0.7);
        }
        player.vy = 0;
        player.ground = true;
      } else if (player.vy < 0 && !p.ground) {
        // Ledges are ONE-WAY: solid to land on from above, pass-through from
        // below. They used to bonk the player's head and push them back down,
        // which trapped the larger evolutions — a Sky Lord's box is tall
        // enough that a low ledge could pin it with no way out. The ledge
        // still reacts so the pass-through reads as physical.
        bumpPlatform(p, -player.vy, true);
        addDust(player.x + player.w / 2, py + p.h + 2, 4, PAL.blue2);
      }
      box.y = player.y + 4;
    }
  }

  function platformCollisionY(p) {
    return p.y + (p.ground ? 0 : Math.round(Math.max(0, p.sink || 0)));
  }

  function bumpPlatform(p, impact, fromBelow) {
    if (p.ground) return;
    const force = clamp(impact / 36, 1.4, 6);
    p.sinkVel += fromBelow ? -force : force;
  }

  function playerMouthPoint() {
    const size = playerDrawSize();
    const flying = !player.ground;
    const bob = flying ? Math.round(Math.sin(time * 14) * 2) : 0;
    const anchorX = player.x + player.w / 2;
    const anchorY = player.y + player.h + bob;
    // Mouth level, tuned against the sprites: low enough that grounded
    // shots connect with ground-patrolling enemies.
    return {
      x: anchorX + player.face * size * 0.38,
      y: anchorY - size * (flying ? 0.48 : 0.40)
    };
  }

  function fireBox(f) {
    return { x: f.x - f.w / 2, y: f.y - f.h / 2, w: f.w, h: f.h };
  }

  function shootFire() {
    // Malfoy's special: a molten lava ball that MELTS enemies and burns
    // straight through them instead of popping on the first hit.
    const lava = currentChar().id === "malfoy";
    fireCooldown = lava
      ? Math.max(0.16, 0.30 - player.stage * 0.02)
      : Math.max(0.08, 0.16 - player.stage * 0.015);
    const mouth = playerMouthPoint();
    const w = (22 + player.stage * 5) * (lava ? 1.3 : 1);
    const h = (14 + player.stage * 2) * (lava ? 1.3 : 1);
    const fx = mouth.x + player.face * (w * 0.46);
    const fy = mouth.y;
    fires.push({
      x: fx,
      y: fy,
      vx: player.face * (lava ? 170 + player.stage * 25 : 215 + player.stage * 35),
      // Grounded shots arc downward: a grown dragon's mouth sits high, so the
      // breath must dip to connect with ground-level enemies.
      vy: clamp(player.vy * 0.12, -28, 28) + (player.ground ? 24 + player.stage * 13 : 0),
      age: 0,
      life: lava ? 0.85 : 0.62,
      dir: player.face,
      lava,
      w,
      h
    });
    player.fireFlash = 0.18;
    player.attackAnim = ATTACK_ANIM_TIME;
    addDust(mouth.x, mouth.y, 5, lava ? PAL.gold2 : PAL.red2);
    // muzzle flash: a quick expanding ring + a spray of glowing sparks
    addRing(mouth.x, mouth.y, 3, lava ? 24 : 17, 0.2, lava ? PAL.gold2 : PAL.red2, 2);
    addSparks(mouth.x, mouth.y, lava ? 9 : 5, lava ? PAL.gold2 : PAL.red2, 95);
    if (lava) {
      beep(64, 0.14, "sawtooth", 0.04, 0.4);
      beep(140, 0.10, "triangle", 0.03, 0.5);
    } else {
      beep(96, 0.08, "sawtooth", 0.032, 0.55);
    }
  }

  function enemyBox(e) {
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  }

  function killEnemy(e, scoreBonus) {
    e.dying = 0.45;
    e.dead = true;
    addDust(e.x, e.y - e.h / 2, 24, PAL.red2);
    addDust(e.x, e.y - e.h / 2, 12, PAL.gold2);
    addRing(e.x, e.y - e.h / 2, 4, 32, 0.3, PAL.gold2, 2);
    addSparks(e.x, e.y - e.h / 2, 14, PAL.red2, 130);
    addText("+" + scoreBonus, e.x - 6, e.y - e.h - 4, PAL.gold2);
    score += scoreBonus;
    best = Math.max(best, score);
    localStorage.setItem("altos8bitBest", String(best));
    shake = Math.max(shake, 3);
    freeze = Math.max(freeze, 0.05); // hit-stop: a single juicy frame
    beep(440, 0.08, "square", 0.035, 0.55);
    beep(220, 0.10, "sawtooth", 0.025, 0.45);
    // Wounded dragons get mercy: enemies may drop a heart pickup
    const dropChance = player.hp <= 2 ? 0.65 : player.hp < 5 ? 0.3 : 0;
    if (Math.random() < dropChance) {
      hearts.push({ x: e.x, y: e.y - e.h - 6, t: 0, life: 11 });
    }
  }

  // Malfoy's lava kill: the enemy liquefies into a glowing puddle.
  function meltEnemy(e, scoreBonus) {
    e.dead = true;
    e.melt = true;
    e.dying = MELT_TIME;
    addDust(e.x, e.y - e.h / 2, 18, PAL.gold2);
    addDust(e.x, e.y - 2, 10, PAL.red);
    addRing(e.x, e.y - e.h / 2, 4, 28, 0.34, "#ff7a1f", 2);
    addSparks(e.x, e.y - e.h / 2, 11, PAL.gold2, 95);
    addText("MELTED! +" + scoreBonus, e.x - 14, e.y - e.h - 4, PAL.gold2);
    score += scoreBonus;
    best = Math.max(best, score);
    localStorage.setItem("altos8bitBest", String(best));
    shake = Math.max(shake, 4);
    freeze = Math.max(freeze, 0.05);
    // sizzle: low rumble + descending hiss
    beep(70, 0.22, "sawtooth", 0.04, 0.35);
    beep(300, 0.16, "triangle", 0.025, 0.3);
    const dropChance = player.hp <= 2 ? 0.65 : player.hp < 5 ? 0.3 : 0;
    if (Math.random() < dropChance) {
      hearts.push({ x: e.x, y: e.y - e.h - 6, t: 0, life: 11 });
    }
  }

  function updateHearts(dt) {
    const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = hearts.length - 1; i >= 0; i -= 1) {
      const h = hearts[i];
      h.t += dt;
      h.life -= dt;
      if (h.life <= 0) { hearts.splice(i, 1); continue; }
      const hy = h.y + Math.sin(h.t * 3) * 3;
      if (rects({ x: h.x - 5, y: hy - 5, w: 10, h: 10 }, pbox)) {
        hearts.splice(i, 1);
        if (player.hp < 5) {
          player.hp += 1;
          hpFlash = 0.6;
        }
        addText("+HP", h.x - 6, hy - 10, PAL.red2);
        addDust(h.x, hy, 12, PAL.red2);
        beep(520, 0.09, "triangle", 0.035, 1.5);
        beep(660, 0.09, "triangle", 0.03, 1.4);
      }
    }
  }

  function updateEnemies(dt) {
    const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (e.dead) {
        e.dying -= dt;
        if (e.dying <= 0) enemies.splice(i, 1);
        continue;
      }
      e.t += dt;
      if (e.hurt > 0) e.hurt -= dt;
      if (e.type === "drake") {
        e.x += e.vx * dt;
        if (e.x > e.anchorX + e.range) { e.x = e.anchorX + e.range; e.vx = -Math.abs(e.vx); }
        if (e.x < e.anchorX - e.range) { e.x = e.anchorX - e.range; e.vx =  Math.abs(e.vx); }
      } else if (e.type === "wisp") {
        // Wisps drift their anchor gently toward a nearby dragon
        const dxp = player.x - e.anchorX;
        const dyp = player.y - e.anchorY;
        if (Math.abs(dxp) < 95 && Math.abs(dyp) < 80) {
          e.anchorX += clamp(dxp, -1, 1) * 11 * dt;
          e.anchorY = clamp(e.anchorY + clamp(dyp, -1, 1) * 7 * dt, 24, GROUND_Y - 26);
        }
        e.x = e.anchorX + Math.sin(e.t * 0.9) * 36;
        e.y = e.anchorY + Math.cos(e.t * 1.4) * 12;
      }
      if (rects(pbox, enemyBox(e))) hurt();
      for (let j = fires.length - 1; j >= 0; j -= 1) {
        const f = fires[j];
        const fbox = fireBox(f);
        if (rects(fbox, enemyBox(e))) {
          if (f.lava) {
            // Lava melts instantly and burns straight through to the next enemy
            if (!f.hitIds) f.hitIds = new Set();
            if (f.hitIds.has(e)) continue;
            f.hitIds.add(e);
            meltEnemy(e, e.type === "wisp" ? 4 : 3);
            break;
          }
          fires.splice(j, 1);
          e.hp -= 1;
          e.hurt = 0.18;
          addDust(e.x, e.y - e.h / 2, 6, PAL.red2);
          if (e.hp <= 0) {
            killEnemy(e, e.type === "wisp" ? 3 : 2);
            break;
          } else {
            beep(360, 0.05, "square", 0.025, 0.7);
          }
        }
      }
    }
  }

  function spawnBossFire(targetX, targetY) {
    if (!boss) return;
    const fx = boss.x + (boss.x > player.x ? -boss.w / 2 + 6 : boss.w / 2 - 6);
    const fy = boss.y - 6;
    const dx = targetX - fx;
    const dy = targetY - fy;
    const dist = Math.max(20, Math.hypot(dx, dy));
    const speed = 105;
    bossFires.push({ x: fx, y: fy, vx: dx / dist * speed, vy: dy / dist * speed, life: 2.6, w: 10, h: 8 });
    addDust(fx, fy, 8, PAL.red);
    beep(180, 0.10, "sawtooth", 0.038, 0.6);
  }

  function updateBoss(dt) {
    if (!boss) return;
    if (boss.dead) {
      boss.dying -= dt;
      boss.y -= 18 * dt;
      if (Math.random() > 0.5) addDust(boss.x + (Math.random() - 0.5) * boss.w, boss.y - boss.h / 2, 4, Math.random() > 0.5 ? PAL.gold2 : PAL.red2);
      if (boss.dying <= 0 && mode !== MODE.WIN) triggerWin();
      return;
    }
    boss.t += dt;
    if (boss.hurt > 0) boss.hurt -= dt;
    if (!boss.awakened && player.x > boss.x - 200) {
      boss.awakened = true;
      bossIntroT = 1.8;
      addText("ANCIENT WAKES", boss.x - 32, boss.y - boss.h - 8, PAL.red);
      shake = Math.max(shake, 5);
      arpeggio(110);
      // Boss roar
      beep(60, 0.45, "sawtooth", 0.05, 0.55);
      beep(120, 0.30, "sawtooth", 0.04, 0.65);
      musicSyncToMode();
    }
    // Telegraph: golden sparks converge on the mouth just before a fireball
    if (boss.awakened && boss.fireCD < 0.4 && Math.random() > 0.45) {
      const mx = boss.x + (boss.x > player.x ? -boss.w / 2 + 6 : boss.w / 2 - 6);
      const ox = (Math.random() - 0.5) * 18;
      const oy = (Math.random() - 0.5) * 14;
      particles.push({
        x: mx + ox,
        y: boss.y - 6 + oy,
        vx: -ox * 4,
        vy: -oy * 4,
        life: 0.22,
        g: 0,
        c: PAL.gold2,
        s: 1
      });
    }
    boss.y = boss.baseY + Math.sin(boss.t * 1.4) * 8;
    if (boss.awakened) {
      const targetX = clamp(player.x + 80, 2950, 3140);
      boss.x += clamp((targetX - boss.x) * 0.6, -20, 20) * dt;
    }
    if (boss.awakened) {
      boss.fireCD -= dt;
      if (boss.fireCD <= 0) {
        spawnBossFire(player.x + player.w / 2, player.y + player.h / 2);
        boss.fireCD = 1.55 - Math.min(0.6, (1 - boss.hp / boss.maxHp) * 0.7);
      }
    }
    const bbox = { x: boss.x - boss.w / 2, y: boss.y - boss.h, w: boss.w, h: boss.h };
    const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rects(bbox, pbox)) hurt();
    for (let j = fires.length - 1; j >= 0; j -= 1) {
      const f = fires[j];
      const fbox = fireBox(f);
      if (rects(fbox, bbox)) {
        fires.splice(j, 1);
        boss.hp -= f.lava ? 2 : 1;
        boss.hurt = 0.22;
        shake = Math.max(shake, f.lava ? 5 : 3);
        addDust(f.x, f.y, f.lava ? 18 : 10, PAL.gold2);
        addRing(f.x, f.y, 3, f.lava ? 30 : 22, 0.28, f.lava ? PAL.gold2 : PAL.red2, 2);
        addSparks(f.x, f.y, f.lava ? 12 : 8, PAL.gold2, 110);
        addText(f.lava ? "SCORCH!" : "HIT", f.x - 4, f.y - 8, PAL.gold2);
        beep(f.lava ? 220 : 420, 0.07, "square", 0.035, 0.55);
        if (boss.hp <= 0) {
          boss.dead = true;
          boss.dying = 1.4;
          shake = 9;
          // Lock in the win: the player must survive the 1.4s death animation
          // (updateBoss only runs in PLAY, so dying mid-animation would strand
          // boss.dying and cancel the win — then mis-fire VICTORY on continue).
          player.invuln = Math.max(player.invuln, boss.dying + 0.6);
          bossFires.length = 0;
          for (let k = 0; k < 6; k += 1) {
            setTimeout(() => { if (boss) addDust(boss.x + (Math.random() - 0.5) * boss.w, boss.y - boss.h / 2, 18, PAL.gold2); }, k * 110);
          }
          arpeggio(523);
          break;
        }
      }
    }
  }

  function updateBossFires(dt) {
    const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = bossFires.length - 1; i >= 0; i -= 1) {
      const f = bossFires[i];
      f.life -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.random() > 0.6) addDust(f.x, f.y, 1, Math.random() > 0.5 ? PAL.red : PAL.red2);
      const fbox = { x: f.x - f.w / 2, y: f.y - f.h / 2, w: f.w, h: f.h };
      if (rects(fbox, pbox)) {
        hurt();
        bossFires.splice(i, 1);
        addDust(f.x, f.y, 10, PAL.red);
        continue;
      }
      if (f.life <= 0 || f.y > GROUND_Y - 4 || f.x < cameraX - 30 || f.x > cameraX + W + 30) {
        bossFires.splice(i, 1);
      }
    }
  }

  function triggerWin() {
    mode = MODE.WIN;
    winTimer = 0;
    best = Math.max(best, score);
    localStorage.setItem("altos8bitBest", String(best));
    arpeggio(659);
    musicSet("win");
    grantUnlocks({ type: "win" });
  }

  function updateFire(dt) {
    for (let i = fires.length - 1; i >= 0; i -= 1) {
      const f = fires[i];
      f.life -= dt;
      f.age += dt;
      f.x += f.vx * dt;
      f.y += (f.vy || 0) * dt;
      if (f.y > GROUND_Y + 10) {
        // breath splashes out on the ground
        addDust(f.x, GROUND_Y + 2, f.lava ? 12 : 6, f.lava ? PAL.gold2 : PAL.red2);
        addRing(f.x, GROUND_Y + 2, 2, f.lava ? 22 : 16, 0.24, f.lava ? PAL.gold2 : PAL.red2, 2);
        fires.splice(i, 1);
      } else if (f.life <= 0 || f.x < cameraX - 42 || f.x > cameraX + W + 42 || f.y < cameraY - 42 || f.y > cameraY + H + 42) {
        fires.splice(i, 1);
      } else if (Math.random() > (f.lava ? 0.2 : 0.5)) {
        // Rising ember trail (negative gravity drifts them upward);
        // lava balls also DRIP molten globs that fall like real lava
        const drip = f.lava && Math.random() > 0.5;
        particles.push({
          x: f.x - f.dir * 6,
          y: f.y + 2 - Math.random() * 6,
          vx: -f.dir * (10 + Math.random() * 30),
          vy: drip ? 10 + Math.random() * 20 : -12 + Math.random() * 18,
          life: 0.3 + Math.random() * 0.3,
          g: drip ? 160 : -60,
          c: f.lava ? (Math.random() > 0.4 ? PAL.gold2 : "#ff7a1f") : (Math.random() > 0.5 ? PAL.red2 : PAL.gold2),
          s: drip ? 2 : 1
        });
      }
    }
  }

  function updateShards(dt) {
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    for (const s of shards) {
      if (s.got) continue;
      // Gem magnet: nearby gems drift toward the dragon
      const mdx = pcx - s.x;
      const mdy = pcy - s.y;
      if (Math.abs(mdx) < 38 && Math.abs(mdy) < 38) {
        s.x += mdx * Math.min(1, dt * 6.5);
        s.y += mdy * Math.min(1, dt * 6.5);
      }
      const sy = s.y + Math.sin(time * 4 + s.bob) * 4;
      const box = { x: s.x - 5, y: sy - 5, w: 10, h: 10 };
      const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rects(box, pbox)) {
        s.got = true;
        score += 1;
        best = Math.max(best, score);
        localStorage.setItem("altos8bitBest", String(best));
        player.xp += 1;
        gemPulse = 0.3;
        // Quick pickups climb a pitch ladder
        comboN = comboT > 0 ? comboN + 1 : 0;
        comboT = 1.4;
        addText(comboN >= 3 ? "COMBO x" + (comboN + 1) : "+1", s.x, sy - 10, comboN >= 3 ? PAL.blue2 : PAL.gold2);
        addDust(s.x, sy, 16, PAL.gold2);
        addRing(s.x, sy, 2, 15, 0.24, PAL.gold2, 1);
        addSparks(s.x, sy, 5, PAL.gold2, 60);
        beep(Math.min(1250, 620 + comboN * 55), 0.06, "square", 0.035, 1.45);
        if (player.xp >= stageNeed[player.stage]) evolve();
      }
    }
  }

  function hurt() {
    if (player.invuln > 0) return;
    player.invuln = 1;
    player.hurtAnim = HURT_ANIM_TIME;
    player.hp -= 1;
    shake = 6;
    damageFlash = 0.18;
    hpFlash = 0.6;
    addText("OUCH", player.x, player.y - 8, PAL.red);
    beep(120, 0.13, "sawtooth", 0.04, 0.45);
    if (player.hp <= 0) {
      mode = MODE.END;
      player.deadAnim = 0;
      arpeggio(130);
      musicSet("end");
    }
  }

  function updatePlatforms(dt) {
    for (const p of platforms) {
      if (p.ground) continue;
      p.sinkVel += -p.sink * PLATFORM_SPRING * dt;
      p.sinkVel *= Math.max(0, 1 - PLATFORM_DAMPING * dt);
      p.sink += p.sinkVel * dt;
      p.sink = clamp(p.sink, -3, 5);
      if (Math.abs(p.sink) < 0.02 && Math.abs(p.sinkVel) < 0.02) {
        p.sink = 0;
        p.sinkVel = 0;
      }
      if (p.crumbleT > 0) {
        p.crumbleT -= dt;
        if (p.crumbleT <= 0) {
          p.solid = false;
          p.respawnT = 4.0;
          // shower of dust + a few falling crumbs
          for (let i = 0; i < 16; i++) {
            particles.push({
              x: p.x + Math.random() * p.w,
              y: p.y + p.h,
              vx: -40 + Math.random() * 80,
              vy: 30 + Math.random() * 60,
              life: 0.7 + Math.random() * 0.4,
              c: PAL.gold,
              s: 1 + Math.floor(Math.random() * 3)
            });
          }
          beep(110, 0.18, "sawtooth", 0.03, 0.5);
        }
      }
      if (p.respawnT > 0) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.solid = true;
          p.crumbleT = 0;
          addDust(p.x + p.w / 2, p.y, 10, PAL.gold2);
          beep(540, 0.08, "square", 0.025, 1.4);
        }
      }
    }
  }

  function updateHazards(dt) {
    const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (const h of hazards) {
      h.t += dt;
      if (rects(pbox, { x: h.x, y: h.y, w: h.w, h: h.h })) {
        hurt();
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.vy += (p.g === undefined ? 220 : p.g) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatText.length - 1; i >= 0; i -= 1) {
      const t = floatText[i];
      t.life -= dt;
      t.y -= 24 * dt;
      if (t.life <= 0) floatText.splice(i, 1);
    }
  }

  function draw() {
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const ox = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0;
    const oy = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0;
    ctx.save();
    ctx.translate(ox, oy);
    if (mode === MODE.TITLE) drawTitle();
    else if (mode === MODE.SELECT) drawSelect();
    else if (mode === MODE.EGG) drawEgg();
    else if (mode === MODE.HATCH) drawHatch();
    else {
      drawPlay();
      if (mode === MODE.EVOLVE) drawEvolve();
      if (mode === MODE.PAUSE) drawPause();
      if (mode === MODE.END) drawEnd();
      if (mode === MODE.WIN) drawWin();
    }
    ctx.restore();
  }

  function clear(c = PAL.black) {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    drawSky(time * 7); // slow auto-pan brings the parallax to life
    drawLogo(34, 28);
    // Orbiting sparkles around the logo
    for (let i = 0; i < 7; i += 1) {
      const a = time * 1.6 + i * 0.9;
      const sx = 95 + Math.cos(a) * (74 + (i % 3) * 9);
      const sy = 45 + Math.sin(a * 1.3) * 24;
      rect(sx, sy, 2, 2, i % 2 ? PAL.gold2 : PAL.blue2);
    }
    const bob = Math.sin(time * 1.8) * 3;
    drawDragonSprite(192, 112 + bob, 3, 1, false);
    text("HATCH A DRAGON. FLY. EVOLVE.", 35, 78, PAL.blue2, 1);
    blinkText("PRESS ENTER", 110, 128, PAL.gold2);
    text("NEXT: CHOOSE YOUR DRAGON", 72, 140, PAL.white, 1);
    text("BEST " + best, 132, 154, PAL.white, 1);
    text("ARROWS MOVE  W FLY  J FIRE  M MUSIC", 46, 166, "#7a86b8", 1);
    drawBorder();
  }

  function drawLogo(x, y) {
    text("ALTOS", x + 2, y + 2, "#552340", 4);
    text("ALTOS", x, y, PAL.gold2, 4);
    text("8-BIT QUEST", x + 4, y + 34, PAL.red2, 2);
  }

  function drawSelect() {
    drawSky(time * 4);
    text("CHOOSE YOUR DRAGON", 42, 14, PAL.gold2, 2);
    const ch = currentChar();
    const unlocked = isUnlocked(ch);

    // Side slots: neighbors in the roster carousel
    const prev = ROSTER[(charIndex + ROSTER.length - 1) % ROSTER.length];
    const next = ROSTER[(charIndex + 1) % ROSTER.length];
    drawSideDragonSlot(56, 132, prev);
    drawSideDragonSlot(264, 132, next);

    // Center card
    const cx = 160;
    const platformY = 126;
    const cardW = 84;
    const cardX = cx - cardW / 2;
    rect(cardX, platformY, cardW, 4, PAL.gold2);
    rect(cardX + 2, platformY + 4, cardW - 4, 7, "#7b4b2c");
    for (let tx = 0; tx < cardW; tx += 8) rect(cardX + tx + 3, platformY - 3, 3, 3, PAL.grass);
    rect(cardX - 2, platformY - 2, 2, 15, PAL.blue2);
    rect(cardX + cardW, platformY - 2, 2, 15, PAL.blue2);
    drawSelectionSparks(cx, 91);
    if (unlocked) {
      drawDragonPreview(cx, 124, 0, 80, Math.floor(time * 3) % 2 === 0);
    } else {
      drawSilhouettePreview(cx, platformY - 2, 66, ch);
    }
    const nameW = ch.name.length * 8;
    text(ch.name, cx - nameW / 2, platformY + 16, unlocked ? PAL.gold2 : "#7a86b8", 1);
    if (ch.tagline && unlocked) {
      text(ch.tagline, cx - ch.tagline.length * 4, 34, PAL.blue2, 1);
    }
    if (!unlocked && ch.unlock) {
      text(ch.unlock.label, cx - ch.unlock.label.length * 4, 34, PAL.red2, 1);
    }
    text((charIndex + 1) + "/" + ROSTER.length, 150, 46, "#7a86b8", 1);

    text("<", 30, 96, PAL.gold2, 3);
    text(">", 280, 96, PAL.gold2, 3);
    blinkText(unlocked ? "ENTER TO INCUBATE" : "LOCKED", unlocked ? 88 : 132, 160, unlocked ? PAL.white : PAL.red2);
    drawParticlesScreen();
    drawBorder();
  }

  function drawSideDragonSlot(cx, platformY, ch) {
    const cardW = 52;
    const cardX = cx - cardW / 2;
    rect(cardX, platformY, cardW, 4, PAL.gold);
    rect(cardX + 2, platformY + 4, cardW - 4, 7, "#4c2f27");
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (isUnlocked(ch)) {
      const idx = ROSTER.indexOf(ch);
      drawRosterPreview(idx, cx, platformY - 2, 44);
    } else {
      drawSilhouettePreview(cx, platformY - 2, 46, ch);
    }
    ctx.restore();
    const label = isUnlocked(ch) ? ch.name : "???";
    text(label, cx - label.length * 4, platformY + 16, PAL.white, 1);
  }

  // Draw any roster character's stage-1 preview (not just the selected one)
  function drawRosterPreview(rosterIdx, x, y, size) {
    const ch = ROSTER[rosterIdx];
    const st = ch.stages[0];
    const atlas = st.atlas ? loadImg(st.atlas) : null;
    if (imgReady(atlas) && st.animations) {
      const anim = st.animations.idle;
      const frameW = st.frameWidth || 160;
      const frameH = st.frameHeight || 160;
      const frame = Math.floor(time * (anim.fps || 6)) % Math.max(1, anim.frames || 1);
      ctx.drawImage(atlas, frame * frameW, anim.row * frameH, frameW, frameH,
        Math.floor(x - size / 2), Math.floor(y - size * 0.94), size, size);
      return;
    }
    const sheet = st.sheet ? loadImg(st.sheet) : null;
    if (imgReady(sheet)) {
      const frame = Math.floor(time * 2.2) % 2;
      ctx.drawImage(sheet, frame * SPRITE_FRAME, 0, SPRITE_FRAME, SPRITE_FRAME,
        Math.floor(x - size / 2), Math.floor(y - size * 0.84), size, size);
      return;
    }
    drawMysteryDragonPreview(x, y, size);
  }

  // Silhouettes are cut from the character's own idle frame, so a locked slot
  // teases that dragon's real shape instead of a generic blob. Keyed by
  // atlas+frame+size because re-tinting every draw would cost a canvas op per
  // frame per slot.
  const silhouetteCache = new Map();

  function silhouetteFrame(atlas, sx, sy, sw, sh, size, key) {
    let c = silhouetteCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(atlas, sx, sy, sw, sh, 0, 0, size, size);
    // keep only the sprite's own pixels, repainted as one flat shadow
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#080d1c";
    g.fillRect(0, 0, size, size);
    silhouetteCache.set(key, c);
    return c;
  }

  function drawSilhouettePreview(x, y, size, ch) {
    const st = ch && ch.stages && ch.stages[0];
    const atlas = st && st.atlas ? loadImg(st.atlas) : null;
    if (!imgReady(atlas) || !st.animations || !st.animations.idle) {
      drawMysteryDragonPreview(x, y, size);
      return;
    }
    const anim = st.animations.idle;
    const frameW = st.frameWidth || 160;
    const frameH = st.frameHeight || 160;
    const frame = Math.floor(time * (anim.fps || 6)) % Math.max(1, anim.frames || 1);
    const sil = silhouetteFrame(atlas, frame * frameW, anim.row * frameH, frameW,
      frameH, size, st.atlas + "|" + frame + "|" + size);
    const dx = Math.floor(x - size / 2);
    const dy = Math.floor(y - size * 0.94);
    const a0 = ctx.globalAlpha;
    ctx.save();
    // smeared copies read as a soft edge against the night sky
    ctx.globalAlpha = a0 * 0.34;
    ctx.drawImage(sil, dx - 1, dy);
    ctx.drawImage(sil, dx + 1, dy);
    ctx.drawImage(sil, dx, dy - 1);
    ctx.globalAlpha = a0;
    ctx.drawImage(sil, dx, dy);
    ctx.restore();
    // centred ON the dark body: gold on shadow reads clearly, and unlike a
    // floating mark above the crown it cannot collide with the roster counter
    text("?", x - 8, y - size * 0.55, PAL.gold2, 3);
  }

  // Fallback only: used when a locked character's art has not loaded yet.
  function drawMysteryDragonPreview(x, y, size) {
    const s = size / 64;
    const c = "#060815";
    const edge = "#23304c";
    ctx.save();
    ctx.globalAlpha = 0.86;
    fillPoly([
      [x - 26 * s, y - 12 * s],
      [x - 9 * s, y - 25 * s],
      [x + 13 * s, y - 18 * s],
      [x + 27 * s, y - 22 * s],
      [x + 19 * s, y - 8 * s],
      [x - 14 * s, y - 5 * s]
    ], edge);
    fillPoly([
      [x - 2 * s, y - 27 * s],
      [x - 30 * s, y - 55 * s],
      [x - 20 * s, y - 17 * s]
    ], c);
    fillPoly([
      [x + 3 * s, y - 27 * s],
      [x + 30 * s, y - 52 * s],
      [x + 22 * s, y - 17 * s]
    ], c);
    rect(x - 17 * s, y - 23 * s, 34 * s, 18 * s, c);
    rect(x + 10 * s, y - 34 * s, 23 * s, 12 * s, c);
    rect(x - 33 * s, y - 11 * s, 21 * s, 5 * s, c);
    rect(x - 10 * s, y - 5 * s, 5 * s, 9 * s, c);
    rect(x + 9 * s, y - 5 * s, 5 * s, 9 * s, c);
    rect(x + 19 * s, y - 39 * s, 2 * s, 7 * s, edge);
    rect(x + 27 * s, y - 39 * s, 2 * s, 7 * s, edge);
    ctx.globalAlpha = 1;
    text("?", x - 8, y - 58, PAL.gold2, 3);
    ctx.restore();
  }

  function drawSelectionSparks(x, y) {
    for (let i = 0; i < 8; i += 1) {
      const a = time * 2.4 + i * 0.78;
      const sx = x + Math.cos(a) * (31 + (i % 2) * 4);
      const sy = y + Math.sin(a * 1.2) * 22;
      rect(sx, sy, 2, 2, i % 2 ? PAL.gold2 : PAL.blue2);
    }
  }

  function drawEgg() {
    drawSky(0);
    text("INCUBATE " + selectedName(), 54, 22, PAL.gold2, 2);
    drawIncubationEgg(W / 2, 96, warmth);
    bar(80, 142, 160, 10, warmth / 100, PAL.red, PAL.gold2);
    text(Math.round(warmth) + "% WARM", 124, 156, PAL.blue2, 1);
    drawParticlesScreen();
    drawBorder();
  }

  function drawHatch() {
    drawSky(0);
    const flash = Math.max(0, 1 - hatchTimer * 1.7);
    ctx.fillStyle = flash > 0.4 ? PAL.white : PAL.gold2;
    for (let i = 0; i < 14; i += 1) {
      const a = i * 0.45 + time * 0.4;
      line(W / 2, 96, W / 2 + Math.cos(a) * (30 + hatchTimer * 120), 96 + Math.sin(a) * (20 + hatchTimer * 85), i % 2 ? PAL.blue2 : PAL.gold2);
    }
    const spriteDrawn = drawHatchingEgg(W / 2, 96, hatchTimer);
    if (!spriteDrawn) {
      for (const e of eggshell) {
        rect(e.x, e.y, e.r + 2, e.r, e.c);
        rect(e.x + 1, e.y, e.r, 1, PAL.white);
      }
    }
    if (hatchTimer > 0.86) {
      drawDragonSprite(W / 2 - 15, 114 - Math.sin(time * 9) * 4, 0, 1, true);
      text(selectedName() + " IS BORN!", 72, 36, PAL.gold2, 2);
    }
    drawParticlesScreen();
    drawBorder();
  }

  function drawPlay() {
    drawSky(cameraX, cameraY);
    drawWorld();
    drawShards();
    drawHeartPickups();
    drawEnemies();
    drawBoss();
    drawBossFires();
    drawFires();
    drawDragonSprite(player.x - cameraX, player.y - cameraY, player.stage, player.face, !player.ground);
    drawParticlesWorld();
    drawGlowLayer();     // additive bloom for fire/gems/sparks/rings
    // Per-run atmosphere: a whisper of color over the whole scene (pre-HUD)
    if (worldTheme && worldTheme.tint) {
      ctx.fillStyle = worldTheme.tint;
      ctx.fillRect(0, 0, W, H);
    }
    drawPostFX();        // vignette + top key-light (under the crisp HUD)
    drawHud();
    drawBossBar();

    // Damage blink
    if (damageFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.3, damageFlash * 1.6);
      rect(0, 0, W, H, PAL.red);
      ctx.restore();
    }
    // Last-heart warning vignette
    if (player.hp === 1 && mode === MODE.PLAY) {
      const pulse = 0.14 + Math.sin(time * 5) * 0.07;
      ctx.save();
      ctx.globalAlpha = pulse;
      rect(0, 0, W, 6, PAL.red);
      rect(0, H - 6, W, 6, PAL.red);
      rect(0, 0, 6, H, PAL.red);
      rect(W - 6, 0, 6, H, PAL.red);
      ctx.globalAlpha = pulse * 0.55;
      rect(6, 6, W - 12, 2, PAL.red);
      rect(6, H - 8, W - 12, 2, PAL.red);
      ctx.restore();
    }
    // Boss-intro letterbox
    if (bossIntroT > 0) {
      const k = Math.min(1, (1.8 - bossIntroT) * 4, bossIntroT * 2);
      const bh = Math.round(16 * Math.max(0, k));
      rect(0, 0, W, bh, "#05060b");
      rect(0, H - bh, W, bh, "#05060b");
      if (bossIntroT < 1.5) {
        text("THE ANCIENT AWAKENS", 68, H / 2 - 34, "#552340", 2);
        text("THE ANCIENT AWAKENS", 66, H / 2 - 36, PAL.red, 2);
      }
    }
    drawBorder();
  }

  function drawEnemies() {
    for (const e of enemies) {
      const x = Math.floor(e.x - cameraX);
      if (x < -20 || x > W + 20) continue;
      const y = Math.floor(e.y - cameraY);
      const flash = e.hurt > 0 && Math.floor(e.t * 60) % 2 === 0;
      const alpha = e.dead ? Math.max(0, e.dying / (e.melt ? MELT_TIME : 0.45)) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (e.dead && e.melt) {
        // Lava melt: the body squashes down into a bubbling molten puddle
        const p = 1 - Math.max(0, e.dying) / MELT_TIME; // 0 -> 1
        const bodyH = Math.max(1, Math.round(e.h * (1 - p)));
        const puddleW = Math.round(e.w * (1 + p * 1.4));
        ctx.globalAlpha = Math.min(1, alpha + 0.25);
        // sinking body silhouette
        rect(x - e.w / 2, y - bodyH, e.w, bodyH, "#7a2410");
        rect(x - e.w / 2 + 2, y - Math.max(1, bodyH - 2), e.w - 4, Math.max(1, bodyH - 2), "#b3491c");
        // widening puddle
        rect(x - puddleW / 2, y - 2, puddleW, 4, "#d96820");
        rect(x - puddleW / 2 + 2, y - 1, puddleW - 4, 2, PAL.gold2);
        // bubbles
        if (Math.random() > 0.4) {
          const bx = x + Math.round((Math.random() - 0.5) * puddleW * 0.8);
          rect(bx, y - 4 - Math.round(Math.random() * 3), 2, 2, Math.random() > 0.5 ? PAL.gold2 : "#ff9a3d");
        }
        ctx.restore();
        continue;
      }
      const enemySprite = e.type === "drake" ? art.enemyDrake : art.enemyWisp;
      if (imgReady(enemySprite)) {
        const size = Math.round((e.type === "drake" ? 32 : 30) * (e.vs || 1));
        const dx = Math.floor(x - size / 2);
        const dy = e.type === "drake" ? Math.floor(y - size) : Math.floor(y - size / 2);
        ctx.filter = flash ? "brightness(2.4)" : "none";
        if (e.type === "drake" && e.vx < 0) {
          ctx.translate(dx + size, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(enemySprite, 0, 0, enemySprite.naturalWidth, enemySprite.naturalHeight, 0, 0, size, size);
        } else {
          ctx.drawImage(enemySprite, 0, 0, enemySprite.naturalWidth, enemySprite.naturalHeight, dx, dy, size, size);
        }
        ctx.filter = "none";
        ctx.restore();
        continue;
      }
      if (e.type === "drake") {
        const bodyA = flash ? PAL.white : "#3a1f4a";
        const bodyB = flash ? PAL.white : "#5b3070";
        const face = e.vx > 0 ? 1 : -1;
        rect(x - 9, y - 1, 18, 2, "#0a0a16");
        rect(x - 8, y - 8, 16, 8, bodyA);
        rect(x - 7, y - 11, 14, 4, bodyA);
        rect(x - 5, y - 13, 10, 3, bodyB);
        rect(x + face * 9, y - 5, 4, 3, bodyA);
        rect(x + face * 12, y - 4, 3, 2, bodyB);
        rect(x + face * -10, y - 9, 4, 6, bodyA);
        rect(x + face * -9, y - 8, 2, 2, flash ? PAL.gold2 : PAL.red);
        rect(x - 4, y - 14, 2, 2, PAL.red);
        rect(x + 0, y - 14, 2, 2, PAL.red);
        rect(x + 4, y - 13, 2, 2, PAL.red);
        rect(x - 6, y - 1, 2, 1, "#1a0d24");
        rect(x + 4, y - 1, 2, 1, "#1a0d24");
      } else if (e.type === "wisp") {
        const cy = y;
        rect(x - 8, cy - 4, 16, 8, "#3a1226");
        rect(x - 7, cy - 5, 14, 10, "#5a1a3a");
        rect(x - 5, cy - 3, 10, 6, flash ? PAL.white : "#c63b5a");
        rect(x - 4, cy - 2, 8, 4, flash ? PAL.white : PAL.red2);
        rect(x - 2, cy - 1, 4, 2, PAL.gold2);
        rect(x - 3, cy - 2, 1, 1, flash ? PAL.red : PAL.white);
        rect(x + 2, cy - 2, 1, 1, flash ? PAL.red : PAL.white);
        if (Math.random() > 0.7) addDust(e.x, cy + 4, 1, PAL.red);
      }
      ctx.restore();
    }
  }

  function drawBoss() {
    if (!boss) return;
    const x = Math.floor(boss.x - cameraX);
    if (x < -boss.w * 2 || x > W + boss.w) return;
    const y = Math.floor(boss.y - cameraY);
    const flash = boss.hurt > 0 && Math.floor(boss.t * 40) % 2 === 0;
    const alpha = boss.dead ? Math.max(0, boss.dying / 1.4) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (imgReady(art.boss)) {
      const drawW = 88;
      const drawH = 74;
      const dx = Math.floor(x - drawW / 2);
      const dy = Math.floor(y - 70);
      const facing = boss.x > player.x ? -1 : 1;
      ctx.filter = flash ? "brightness(2.2)" : "none";
      if (facing < 0) {
        ctx.translate(dx + drawW, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(art.boss, 0, 0, art.boss.naturalWidth, art.boss.naturalHeight, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(art.boss, 0, 0, art.boss.naturalWidth, art.boss.naturalHeight, dx, dy, drawW, drawH);
      }
      ctx.filter = "none";
      ctx.restore();
      return;
    }
    const main = flash ? PAL.white : "#241038";
    const accent = flash ? PAL.white : "#5d2a82";
    const eye = flash ? PAL.white : (boss.fireCD < 0.35 ? PAL.gold2 : PAL.red);
    rect(x - boss.w / 2 - 6,  y - boss.h + 4,  6, 26, "#3a1850");
    rect(x + boss.w / 2,      y - boss.h + 4,  6, 26, "#3a1850");
    rect(x - boss.w / 2 - 12, y - boss.h + 8,  6, 18, "#2a0f3a");
    rect(x + boss.w / 2 + 6,  y - boss.h + 8,  6, 18, "#2a0f3a");
    rect(x - boss.w / 2,      y - boss.h, boss.w, boss.h - 6, main);
    rect(x - boss.w / 2 + 4,  y - boss.h + 4, boss.w - 8, boss.h - 14, accent);
    rect(x - boss.w / 2 + 8,  y - 18, boss.w - 16, 8, "#7a4a14");
    rect(x - 10, y - boss.h - 6, 4, 6, PAL.red);
    rect(x - 4,  y - boss.h - 8, 4, 8, PAL.red);
    rect(x + 2,  y - boss.h - 6, 4, 6, PAL.red);
    rect(x + 8,  y - boss.h - 4, 4, 4, PAL.red);
    rect(x - 12, y - boss.h + 12, 4, 4, eye);
    rect(x + 8,  y - boss.h + 12, 4, 4, eye);
    const facing = boss.x > player.x ? -1 : 1;
    rect(x + facing * 16, y - boss.h + 18, 12, 8, main);
    rect(x + facing * 22, y - boss.h + 20, 6, 4, "#ffa040");
    rect(x - boss.w / 2 + 6,  y - 4, 4, 4, "#0a0a14");
    rect(x + boss.w / 2 - 10, y - 4, 4, 4, "#0a0a14");
    ctx.restore();
  }

  function drawBossFires() {
    for (const f of bossFires) {
      const x = Math.floor(f.x - cameraX);
      const y = Math.floor(f.y - cameraY);
      if (x < -16 || x > W + 16) continue;
      rect(x - 5, y - 4, 10, 8, PAL.red);
      rect(x - 4, y - 3, 8, 6, PAL.red2);
      rect(x - 2, y - 2, 4, 4, PAL.gold2);
    }
  }

  function drawBossBar() {
    if (!boss || !boss.awakened || boss.dead) return;
    // Bottom-center so it never collides with the top HUD
    const barW = 120;
    const x = Math.floor((W - barW) / 2);
    const y = H - 12;
    rect(x - 1, y - 1, barW + 2, 6, PAL.uiDark);
    rect(x, y, barW, 4, "#2a0f1c");
    const fill = Math.max(0, Math.floor(barW * (boss.hp / boss.maxHp)));
    rect(x, y, fill, 4, PAL.red);
    rect(x, y, Math.max(0, fill - 1), 1, PAL.red2);
    text("ANCIENT", x + 36, y - 9, PAL.red, 1);
  }

  function drawSky(cam, camY = 0) {
    const altitude = Math.max(0, -camY);
    const hasFar = imgReady(art.far);
    const hasMid = imgReady(art.mid);
    const hasNear = imgReady(art.near);

    if (hasFar) {
      clear(PAL.black);
      // The far layer is the guaranteed opaque base. Drawing one full logical
      // screen prevents transparent parallax layers or wrap offsets from ever
      // exposing the canvas clear color between tiles.
      ctx.drawImage(art.far, 0, 0, art.far.naturalWidth, art.far.naturalHeight, 0, 0, W, H);
      if (hasMid) drawParallaxStrip(art.mid, cam * 0.20, Math.floor(altitude * 0.28));
      if (hasNear) drawParallaxStrip(art.near, cam * 0.38, Math.floor(18 + altitude * 0.36));
    }

    // Vertical gradient: deep space up top, softer indigo at the horizon.
    // Flying higher pushes the bands down so the sky darkens with altitude.
    // Painted darkest-last-on-top so there are no gaps at any altitude.
    if (!hasFar) {
      const bands = ["#0b1026", "#101736", "#141e42", "#18264e", "#1c2c58"];
      const bandH = Math.ceil(H / bands.length);
      const shift = Math.floor(altitude * 0.05);
      clear(bands[bands.length - 1]);
      for (let i = bands.length - 2; i >= 0; i -= 1) {
        rect(0, 0, W, (i + 1) * bandH + shift, bands[i]);
      }
    }

    for (const s of stars) {
      const x = Math.floor((s.x - cam * 0.08 + W * 4) % W);
      const y = Math.floor((s.y + altitude * 0.08) % H);
      const tw = Math.sin(time * s.tw + s.phase);
      if (tw > -0.2) rect(x, y, 1, 1, s.c);
      if (tw > 0.8) {
        // Bright twinkle: a tiny cross flare
        rect(x - 1, y, 1, 1, s.c);
        rect(x + 1, y, 1, 1, s.c);
        rect(x, y - 1, 1, 1, s.c);
        rect(x, y + 1, 1, 1, s.c);
      }
    }

    if (shootingStar) {
      const t = shootingStar.t;
      const sx = shootingStar.x - t * 150;
      const sy = shootingStar.y + t * 55;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 0.9);
      line(sx, sy, sx + 15, sy - 6, PAL.white);
      line(sx + 5, sy - 2, sx + 19, sy - 7, PAL.blue2);
      ctx.restore();
    }

    if (!hasFar) {
      const mx = 250 - (cam * 0.05) % 420;
      const moonY = 20 + altitude * 0.10;
      // Soft glow: cross-stacked translucent rects approximate a round halo
      ctx.save();
      ctx.globalAlpha = 0.03;
      rect(mx - 9, moonY - 3, 28, 20, PAL.gold2);
      rect(mx - 3, moonY - 9, 16, 32, PAL.gold2);
      ctx.globalAlpha = 0.07;
      rect(mx - 4, moonY - 3, 18, 18, PAL.gold2);
      ctx.restore();
      rect(mx, moonY, 10, 10, PAL.gold2);
      rect(mx + 2, moonY - 2, 6, 14, PAL.gold2);
      rect(mx - 4, moonY + 4, 18, 2, PAL.gold2);

      drawCloud(300 - (cam * 0.10) % 420, 58 + altitude * 0.12);
      drawCloud(44 - (cam * 0.16) % 420, 44 + altitude * 0.18);
      drawCloud(180 - (cam * 0.13) % 420, 30 + altitude * 0.14);
    }
    if (!hasMid) drawMountains(cam, altitude);
  }

  function drawCloud(x, y) {
    for (const off of [0, 320, 640]) {
      rect(x + off, y + 5, 44, 8, PAL.cloud2);
      rect(x + off + 8, y, 28, 8, PAL.cloud);
      rect(x + off + 18, y - 5, 24, 8, PAL.cloud);
    }
  }

  function drawMountains(cam, altitude = 0) {
    const base = 120 + altitude * 0.32;
    // Far ridge: slowest parallax, almost sky-colored
    for (let i = -1; i < 7; i += 1) {
      const x = i * 96 - Math.floor((cam * 0.16) % 96);
      tri(x, base + 4, x + 52, 90 + (i % 3) * 7, x + 104, base + 4, "#131c3a");
    }
    for (let i = -1; i < 8; i += 1) {
      const x = i * 72 - Math.floor((cam * 0.28) % 72);
      tri(x, base, x + 36, 70 + (i % 2) * 14, x + 76, base, PAL.mountain);
      tri(x + 24, base, x + 62, 82 + (i % 3) * 8, x + 102, base, PAL.mountain2);
    }
    // Soft fog band where the mountains meet the valley floor
    ctx.save();
    ctx.globalAlpha = 0.13;
    rect(0, base - 6, W, 8, "#4d6fa8");
    ctx.globalAlpha = 0.08;
    rect(0, base - 11, W, 6, "#4d6fa8");
    ctx.restore();
  }

  function drawWorld() {
    for (const p of platforms) {
      const x = Math.floor(p.x - cameraX);
      if (x < -p.w || x > W) continue;
      const y = platformDrawY(p) - cameraY;
      const vs = p.vs || 1;
      if (y < -32 || y > H + 48) continue;
      if (p.ground) {
        if (!drawFittedAsset(art.ground, x, y - 2, p.w + 1, Math.max(42, H - y + 2), true)) {
          rect(x, y, p.w, Math.max(0, H - y), PAL.darkGrass);
          rect(x, y, p.w, 3, PAL.grass);
          if ((p.x / TILE) % 4 === 0) rect(x + 2, y - 3, 2, 3, PAL.grass);
        }
      } else if (p.solid === false) {
        // Crumbled & respawning â€” show ghost outline
        const a = 1 - Math.min(1, p.respawnT / 4);
        if (a > 0.05 && (Math.floor(time * 4) % 2 === 0 || p.respawnT < 1)) {
          rect(x, y, p.w, 1, "#4c2f27");
          rect(x, y + p.h - 1, p.w, 1, "#4c2f27");
          for (let tx = 4; tx < p.w; tx += 10) rect(x + tx, y + 3, 2, 2, "#7b4b2c");
        }
      } else if (p.type === "trampoline") {
        const compress = Math.max(0, p.sink || 0);
        if (!drawFittedAsset(art.trampoline, x, y - Math.round(5 * vs) + compress, p.w, Math.max(20, Math.round(29 * vs) - compress), true)) {
          // Compress visually based on sink (deeper sink = more compressed coil)
          rect(x, y + compress, p.w, 4, "#ff5e87");        // bumper top
          rect(x, y + 4 + compress, p.w, 2, "#ff8aa8");
          // springs (zigzag between top and base)
          for (let tx = 2; tx < p.w; tx += 8) {
            rect(x + tx, y + 6 + compress, 2, p.h - 6 - compress, PAL.gold);
            rect(x + tx + 4, y + 6 + compress, 2, p.h - 6 - compress, "#b8771b");
          }
          rect(x, y + p.h, p.w, 1, "#4c2f27");
        }
      } else if (p.type === "spiketop") {
        if (!drawFittedAsset(art.spiketop, x, y - Math.round(16 * vs), p.w, Math.round(38 * vs), true)) {
          // Wood platform with spike strip on top
          rect(x, y + 2, p.w, p.h - 2, "#7b4b2c");
          rect(x, y + p.h - 1, p.w, 1, "#4c2f27");
          // spikes
          const flash = (Math.floor(time * 4) % 2 === 0) ? "#d8d4e4" : "#f0eaff";
          for (let tx = 0; tx < p.w; tx += 6) {
            rect(x + tx,     y - 3, 6, 3, "#5c5870");
            rect(x + tx + 2, y - 5, 2, 5, flash);
          }
        }
      } else if (p.type === "crumble") {
        if (!drawFittedAsset(art.crumble, x, y - Math.round(4 * vs), p.w, Math.round(27 * vs), true)) {
          // Brown plank with cracks, shakes when crumbleT > 0
          const sx = (p.crumbleT > 0) ? Math.round((Math.random() - 0.5) * 2) : 0;
          rect(x + sx, y, p.w, p.h, "#8a5a2a");
          rect(x + sx, y + 2, p.w, p.h - 2, "#5e3a18");
          rect(x + sx, y + p.h, p.w, 1, "#3a2410");
          // crack lines
          for (let tx = 6; tx < p.w; tx += 14) {
            rect(x + tx + sx, y + 1, 1, p.h - 2, "#3a2410");
            rect(x + tx + 4 + sx, y + 3, 1, 2, "#3a2410");
          }
          // warning glow when crumbling
          if (p.crumbleT > 0 && Math.floor(time * 16) % 2 === 0) {
            rect(x + sx, y - 1, p.w, 1, PAL.red);
          }
        }
      } else {
        const ledgeAsset = Math.floor(p.x / 180) % 2 ? art.normalCrystal : art.normal;
        if (!drawFittedAsset(ledgeAsset, x, y - Math.round(4 * vs), p.w, Math.round(27 * vs), true)) {
          rect(x, y, p.w, p.h, PAL.gold);
          rect(x, y + 2, p.w, p.h - 2, "#7b4b2c");
          rect(x, y + p.h, p.w, 1, "#4c2f27");
          for (let tx = 0; tx < p.w; tx += 8) rect(x + tx + 2, y - 3, 3, 3, PAL.grass);
        }
      }
    }
    drawHazards();
    for (let i = 0; i < 38; i += 1) {
      const wx = i * 82 + 18;
      const x = Math.floor(wx - cameraX);
      if (x < -20 || x > W + 20) continue;
      drawCrystal(x, 135 + Math.sin(wx * 0.04) * 8 - cameraY);
    }
    drawCheckpoints();
    drawFireflies();
  }

  function drawCheckpoints() {
    for (const cx of CHECKPOINTS) {
      const x = Math.floor(cx - cameraX);
      if (x < -24 || x > W + 24) continue;
      const gy = Math.floor(groundYAt(cx) - cameraY);
      const reached = checkpointX >= cx;
      const poleC = reached ? PAL.gold : "#5c688c";
      const flagC = reached ? PAL.gold2 : PAL.blue2;
      if (imgReady(art.checkpoint)) {
        ctx.save();
        ctx.globalAlpha = reached ? 1 : 0.62;
        drawFittedAsset(art.checkpoint, x - 12, gy - 48, 24, 48, true);
        ctx.restore();
        if (reached && Math.floor(time * 3) % 2 === 0) rect(x + 7, gy - 39, 2, 2, PAL.white);
        continue;
      }
      rect(x - 3, gy - 2, 8, 3, "#4c2f27");
      rect(x, gy - 36, 2, 35, poleC);
      rect(x - 1, gy - 37, 4, 2, flagC);
      const wave = Math.sin(time * 4 + cx) * 2;
      tri(x + 2, gy - 35, x + 15 + wave, gy - 31, x + 2, gy - 26, flagC);
      if (reached && Math.floor(time * 3) % 2 === 0) {
        rect(x + 6 + wave, gy - 32, 2, 2, PAL.white);
      }
    }
  }

  function drawFireflies() {
    for (const f of fireflies) {
      const fx = f.x + Math.sin(time * 0.7 + f.phase) * f.drift;
      const x = Math.floor(fx - cameraX);
      if (x < -8 || x > W + 8) continue;
      const fy = f.y + Math.cos(time * 0.9 + f.phase * 1.3) * 6;
      const y = Math.floor(fy - cameraY);
      const glow = 0.5 + Math.sin(time * 2.3 + f.phase) * 0.5;
      if (glow < 0.25) continue;
      ctx.save();
      ctx.globalAlpha = glow * 0.4;
      rect(x - 1, y - 1, 3, 3, "#b8ff9a");
      ctx.globalAlpha = Math.min(1, glow);
      rect(x, y, 1, 1, "#eaffcf");
      ctx.restore();
    }
  }

  function drawHazards() {
    for (const h of hazards) {
      const x = Math.floor(h.x - cameraX);
      if (x < -h.w || x > W) continue;
      const y = Math.floor(h.y - cameraY);
      if (y < -16 || y > H + 16) continue;
      if (drawFittedAsset(art.hazard, x, y - 2, h.w, h.h + 5, true)) continue;
      // Base / mount
      rect(x, y + h.h - 2, h.w, 2, "#3a2814");
      // Spikes
      const flash = (Math.floor(time * 5) % 2 === 0);
      const tip   = flash ? "#fff8d6" : "#d8d4e4";
      const body  = flash ? "#a3a0bc" : "#7d7898";
      for (let tx = 0; tx < h.w; tx += 6) {
        rect(x + tx,     y + 2, 6, h.h - 4, body);
        rect(x + tx + 2, y,     2, h.h - 2, tip);
      }
    }
  }

  function platformDrawY(p) {
    if (p.ground) return Math.floor(p.y);
    const float = Math.sin(time * 2.1 + p.phase) * 0.8;
    return Math.floor(p.y + float + (p.sink || 0));
  }

  function drawCrystal(x, y) {
    if (imgReady(art.crystal)) {
      drawFittedAsset(art.crystal, x - 8, y - 10, 18, 18, true);
      return;
    }
    rect(x, y, 3, 11, PAL.blue2);
    rect(x + 3, y - 5, 3, 16, PAL.blue);
    rect(x + 6, y + 2, 3, 9, PAL.blue3);
    rect(x - 2, y + 10, 14, 2, PAL.white);
    // Passing shimmer
    if (Math.floor(time * 3 + x * 0.7) % 5 === 0) rect(x + 3, y - 4, 1, 5, PAL.white);
  }

  function drawShards() {
    for (const s of shards) {
      if (s.got) continue;
      const x = Math.floor(s.x - cameraX);
      const y = Math.floor(s.y + Math.sin(time * 4 + s.bob) * 4 - cameraY);
      if (x < -12 || x > W + 12 || y < -16 || y > H + 16) continue;
      // Soft glow halo (cross shape reads rounder than a single box)
      ctx.save();
      ctx.globalAlpha = 0.08 + Math.sin(time * 3 + s.bob) * 0.03;
      rect(x - 6, y - 6, 12, 12, PAL.gold);
      rect(x - 4, y - 9, 8, 18, PAL.gold);
      ctx.restore();
      if (imgReady(art.gem)) {
        drawFittedAsset(art.gem, x - 9, y - 11, 18, 22);
        continue;
      }
      rect(x - 3, y - 6, 6, 12, PAL.gold2);
      rect(x - 6, y - 2, 12, 4, PAL.gold);
      rect(x - 2, y - 3, 4, 6, PAL.white);
      // Rotating glint
      const g = Math.floor((time * 5 + s.bob) % 4);
      if (g === 0) rect(x - 4, y - 5, 2, 2, PAL.white);
      else if (g === 2) rect(x + 2, y + 2, 2, 2, PAL.white);
    }
  }

  function drawHeartPickups() {
    for (const h of hearts) {
      const x = Math.floor(h.x - cameraX);
      if (x < -12 || x > W + 12) continue;
      const y = Math.floor(h.y + Math.sin(h.t * 3) * 3 - cameraY);
      if (h.life < 3 && Math.floor(time * 6) % 2 === 0) continue; // expiring blink
      ctx.save();
      ctx.globalAlpha = 0.16;
      rect(x - 7, y - 7, 14, 14, PAL.red);
      ctx.restore();
      if (imgReady(art.heart)) {
        drawFittedAsset(art.heart, x - 10, y - 10, 20, 20);
        continue;
      }
      drawPixelHeart(x, y, PAL.red, PAL.red2);
    }
  }

  function drawPixelHeart(x, y, main, hi) {
    rect(x - 4, y - 4, 3, 3, main);
    rect(x + 1, y - 4, 3, 3, main);
    rect(x - 5, y - 2, 10, 3, main);
    rect(x - 3, y + 1, 6, 2, main);
    rect(x - 1, y + 3, 2, 2, main);
    rect(x - 3, y - 3, 2, 2, hi);
  }

  function drawFires() {
    const sheet = imgReady(charFireSheet) ? charFireSheet : fireSheet;
    for (const f of fires) {
      const x = Math.floor(f.x - cameraX);
      const y = Math.floor(f.y - cameraY);
      if (f.lava) {
        // molten glow halo behind the ball
        const pulse = 1 + Math.sin((f.age || 0) * 22) * 0.15;
        ctx.save();
        ctx.globalAlpha = 0.30;
        rect(x - (f.w * 0.8 * pulse) / 2, y - (f.h * 0.9 * pulse) / 2, f.w * 0.8 * pulse, f.h * 0.9 * pulse, "#ff7a1f");
        ctx.globalAlpha = 0.18;
        rect(x - (f.w * 1.15 * pulse) / 2, y - (f.h * 1.3 * pulse) / 2, f.w * 1.15 * pulse, f.h * 1.3 * pulse, PAL.gold2);
        ctx.restore();
      }
      if (sheet.complete && sheet.naturalWidth > 0) {
        const frame = Math.floor((f.age || 0) * 18) % FIRE_FRAMES;
        const sx = frame * FIRE_FRAME_W;
        const dx = Math.floor(x - f.w / 2);
        const dy = Math.floor(y - f.h / 2);
        ctx.save();
        if ((f.dir || 1) < 0) {
          ctx.translate(dx + f.w, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(sheet, sx, 0, FIRE_FRAME_W, FIRE_FRAME_H, 0, 0, f.w, f.h);
        } else {
          ctx.drawImage(sheet, sx, 0, FIRE_FRAME_W, FIRE_FRAME_H, dx, dy, f.w, f.h);
        }
        ctx.restore();
      } else {
        rect(x - f.w / 2, y - f.h / 2 - 2, f.w, f.h + 4, PAL.red);
        rect(x - f.w / 2 + ((f.dir || 1) > 0 ? 2 : -2), y - f.h / 2, f.w - 2, f.h, PAL.red2);
        rect(x - f.w / 2 + ((f.dir || 1) > 0 ? 6 : -6), y - 1, Math.max(3, f.w - 9), 3, PAL.gold2);
      }
    }
  }

  function drawDragonSprite(x, y, stage, face, flying) {
    const atlas = spriteAtlases[stage];
    if (atlas && atlas.complete && atlas.naturalWidth > 0 && characterAnimations(stage)) {
      drawAtlasDragonSprite(x, y, stage, face, flying, atlas);
      return;
    }
    const img = spriteSheets[stage];
    if (img && img.complete && img.naturalWidth > 0) {
      drawSheetDragonSprite(x, y, stage, face, flying, img);
      return;
    }
    drawBlockDragonSprite(x, y, stage, face, flying);
  }

  function drawDragonPreview(x, y, stage, size, flying) {
    const atlas = spriteAtlases[stage];
    if (atlas && atlas.complete && atlas.naturalWidth > 0 && characterAnimations(stage)) {
      const state = { name: flying ? "flight" : "idle", elapsed: time, loop: true };
      drawAtlasFrame(stage, atlas, state, x, y, size, 1, flying ? 0.86 : 0.94);
      return;
    }
    const img = spriteSheets[stage];
    const frame = flying ? 5 + (Math.floor(time * 8) % 2) : Math.floor(time * 2.2) % 2;
    const visualBottom = flying ? 0.80 : 0.84;
    const dx = Math.floor(x - size / 2);
    const dy = Math.floor(y - size * visualBottom);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, frame * SPRITE_FRAME, 0, SPRITE_FRAME, SPRITE_FRAME, dx, dy, size, size);
      return;
    }
    drawBlockDragonSprite(dx, dy, stage, 1, flying);
  }

  function characterAnimations(stage) {
    const character = CHARACTERS[stage];
    return character && character.animations ? character.animations : null;
  }

  function animationStateFor(stage, flying) {
    const isPlayer = stage === player.stage && (mode === MODE.PLAY || mode === MODE.EVOLVE || mode === MODE.END || mode === MODE.PAUSE);
    if (!isPlayer) return { name: flying ? "flight" : "idle", elapsed: time, loop: true };
    if (mode === MODE.EVOLVE) return { name: flying ? "flight" : "idle", elapsed: time, loop: true };
    if (mode === MODE.END || player.hp <= 0) return { name: "dead", elapsed: player.deadAnim, once: true };
    if (player.hurtAnim > 0) return { name: "hurt", elapsed: HURT_ANIM_TIME - player.hurtAnim, once: true };
    if (player.attackAnim > 0) {
      // Mid-air shots use the dedicated fly-attack row when the atlas has one
      const name = !player.ground ? "flyattack" : "attack";
      return { name, elapsed: ATTACK_ANIM_TIME - player.attackAnim, once: true };
    }
    if (!player.ground) {
      if (player.jumpAnim > 0) return { name: "jump", elapsed: JUMP_ANIM_TIME - player.jumpAnim, once: true };
      return { name: "flight", elapsed: time, loop: true };
    }
    if (Math.abs(player.vx) > 12) return { name: "walk", elapsed: time, loop: true };
    return { name: "idle", elapsed: time, loop: true };
  }

  function drawAtlasDragonSprite(x, y, stage, face, flying, atlas) {
    const state = animationStateFor(stage, flying);
    const size = STAGE_DRAW[Math.min(stage, STAGE_DRAW.length - 1)];
    const bob = state.name === "flight" ? Math.round(Math.sin(time * 14) * 2) : 0;
    const visualBottom = state.name === "flight" || state.name === "jump" ? 0.88 : 0.96;
    drawAtlasFrame(stage, atlas, state, x + player.w / 2, y + player.h + bob, size, face, visualBottom);
  }

  function drawAtlasFrame(stage, atlas, state, x, y, size, face, visualBottom) {
    const character = CHARACTERS[stage];
    const animations = characterAnimations(stage);
    if (!animations) return false;
    const anim = animations[state.name]
      || (state.name === "flyattack" ? animations.attack : null)
      || animations.idle;
    if (!anim) return false;
    const frameW = character.frameWidth || 160;
    const frameH = character.frameHeight || 160;
    const frameCount = Math.max(1, anim.frames || 1);
    const fps = anim.fps || 8;
    const frameFloat = (state.elapsed || 0) * fps;
    const rawFrame = Math.floor(frameFloat);
    const frame = anim.once || state.once ? Math.min(frameCount - 1, rawFrame) : rawFrame % frameCount;
    const sy = anim.row * frameH;
    const dx = Math.floor(x - size / 2);
    const dy = Math.floor(y - size * visualBottom);

    function drawFrame(frameIndex, alpha) {
      const srcX = frameIndex * frameW;
      ctx.globalAlpha = alpha;
      if (face < 0) {
        ctx.drawImage(atlas, srcX, sy, frameW, frameH, 0, 0, size, size);
      } else {
        ctx.drawImage(atlas, srcX, sy, frameW, frameH, dx, dy, size, size);
      }
    }

    ctx.save();
    if (face < 0) {
      ctx.translate(dx + size, dy);
      ctx.scale(-1, 1);
    }
    drawFrame(frame, 1);
    ctx.restore();
    return true;
  }

  function drawSheetDragonSprite(x, y, stage, face, flying, img) {
    const moving = mode === MODE.PLAY && Math.abs(player.vx) > 12 && player.stage === stage;
    let frame = Math.floor(time * 2.2) % 2;
    if (player.fireFlash > 0 && player.stage === stage) frame = 7;
    else if (flying) frame = 5 + (Math.floor(time * 8) % 2);
    else if (moving) frame = 2 + (Math.floor(time * 10) % 3);

    const size = Math.round(STAGE_DRAW[Math.min(stage, STAGE_DRAW.length - 1)] * 0.9);
    const bob = flying ? Math.round(Math.sin(time * 14) * 2) : Math.round(Math.sin(time * 4) * 1);
    const visualBottom = flying ? 0.80 : 0.84;
    const dx = Math.floor(x + player.w / 2 - size / 2);
    const dy = Math.floor(y + player.h - size * visualBottom + bob);

    ctx.save();
    if (face < 0) {
      ctx.translate(dx + size, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * SPRITE_FRAME, 0, SPRITE_FRAME, SPRITE_FRAME, 0, 0, size, size);
    } else {
      ctx.drawImage(img, frame * SPRITE_FRAME, 0, SPRITE_FRAME, SPRITE_FRAME, dx, dy, size, size);
    }
    ctx.restore();
  }

  function blockPalette() {
    const bc = currentChar().bodyColors || {};
    return {
      main: bc.main || PAL.blue,
      light: bc.light || PAL.blue2,
      dark: bc.dark || PAL.blue3,
      wing: bc.wing || PAL.purple
    };
  }

  function drawBlockDragonSprite(x, y, stage, face, flying) {
    const s = stage;
    const flip = face < 0;
    const C = blockPalette();
    const bob = flying ? Math.round(Math.sin(time * 16) * 2) : Math.round(Math.sin(time * 6) * 1);
    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y + bob));
    if (flip) ctx.scale(-1, 1);

    const bodyW = 22 + s * 4;
    const bodyH = 13 + s * 2;
    const wingOpen = flying ? 11 + Math.round(Math.sin(time * 16) * 4) : 7 + Math.round(Math.sin(time * 4) * 1);

    // Tail
    rect(-14 - s * 3, 10, 14 + s * 4, 4, C.dark);
    rect(-20 - s * 4, 8, 8, 3, s >= 2 ? PAL.red : C.main);
    rect(-21 - s * 4, 13, 7, 3, C.main);
    for (let i = 0; i < 4 + s; i += 1) rect(-9 - i * 4, 7 - (i % 2), 2, 2, PAL.gold);

    // Far wing
    drawWing(-2, 4, wingOpen, s, true);

    // Body and belly
    rect(0, 5, bodyW, bodyH, C.main);
    rect(2, 3, bodyW - 5, 4, C.light);
    rect(4, 9, bodyW - 4, bodyH - 4, C.dark);
    rect(bodyW - 7, 6, 7, bodyH - 3, PAL.cream);
    for (let i = 0; i < 4 + s; i += 1) rect(bodyW - 8, 8 + i * 3, 7, 1, "#b9d7d8");
    for (let i = 0; i < 6 + s; i += 1) rect(2 + i * 4, 2 - (i % 2), 2, 3, PAL.gold);

    // Legs
    drawLeg(5, 16, flying, 0);
    drawLeg(bodyW - 6, 16, flying, 1);

    // Neck and head
    rect(bodyW - 1, 0, 7 + s, 6, C.main);
    rect(bodyW + 4 + s, -5, 14 + s * 2, 10, C.light);
    rect(bodyW + 15 + s, -2, 7 + s, 5, C.main);
    rect(bodyW + 19 + s, 2, 3, 2, PAL.black);
    rect(bodyW + 11 + s, -3, 3, 3, PAL.red);
    rect(bodyW + 12 + s, -3, 1, 1, PAL.white);

    // Horns, frills, teeth
    rect(bodyW + 4, -10, 3, 6 + s, PAL.gold2);
    rect(bodyW + 11, -11, 3, 7 + s, s >= 2 ? PAL.red : PAL.gold2);
    rect(bodyW + 2, -1, 4, 3, PAL.red2);
    rect(bodyW + 6, 5, 2, 2, PAL.white);
    rect(bodyW + 12, 5, 2, 2, PAL.white);

    // Near wing and collar gem
    drawWing(3, 5, wingOpen, s, false);
    rect(bodyW - 3, 4, 3, 6, PAL.gold);
    rect(bodyW - 2, 5, 3, 3, PAL.red);
    ctx.restore();
  }

  function drawWing(x, y, open, stage, far) {
    const C = blockPalette();
    const alpha = far ? 0.6 : 1;
    ctx.globalAlpha = alpha;
    rect(x, y - open, 4, open, PAL.gold);
    rect(x - 7 - stage * 2, y - open - 5, 5, open + 3, PAL.gold);
    rect(x - 14 - stage * 3, y - open + 2, 5, open + 7, PAL.gold);
    fillPoly([
      [x, y],
      [x - 7 - stage * 2, y - open - 4],
      [x - 14 - stage * 3, y - open + 2],
      [x - 18 - stage * 4, y + 10],
      [x - 8, y + 7]
    ], stage >= 2 ? C.wing : C.wing);
    rect(x - 10, y - open + 1, 4, 3, C.light);
    ctx.globalAlpha = 1;
  }

  function drawLeg(x, y, flying, phase) {
    const C = blockPalette();
    const lift = flying ? -4 + phase * 2 : Math.round(Math.sin(time * 10 + phase * Math.PI) * 2);
    rect(x, y, 4, 8 + lift, C.dark);
    rect(x - 1, y + 7 + lift, 7, 3, C.main);
    rect(x + 4, y + 8 + lift, 2, 2, PAL.gold2);
  }

  function drawIncubationEgg(x, y, power) {
    const heat = clamp(power / 100, 0, 1);
    const wobble = Math.round(Math.sin(time * 15) * heat * 2);
    const frame = Math.min(5, Math.floor(heat * 5.99));
    if (drawEggHatchFrame(x + wobble, y, frame)) {
      drawEggAura(x + wobble, y, heat, selectedEggPalette());
      return;
    }
    drawPixelEgg(x, y, power);
  }

  function drawHatchingEgg(x, y, timer) {
    const firstOpenFrame = 6;
    const progress = clamp(timer / 0.95, 0, 0.999);
    const frame = Math.min(
      EGG_HATCH_FRAMES - 1,
      firstOpenFrame + Math.floor(progress * (EGG_HATCH_FRAMES - firstOpenFrame))
    );
    return drawEggHatchFrame(x, y, frame);
  }

  function drawEggHatchFrame(x, y, frame) {
    // Prefer the character's own egg sheet; fall back to the default one
    const sheet = imgReady(charEggSheet) ? charEggSheet
      : imgReady(defaultEggSheet) ? defaultEggSheet : null;
    if (!sheet || sheet.naturalWidth < EGG_FRAME) return false;
    const size = 104;
    const dx = Math.floor(x - size / 2);
    const dy = Math.floor(y - 68);
    ctx.drawImage(
      sheet,
      frame * EGG_FRAME,
      0,
      EGG_FRAME,
      EGG_FRAME,
      dx,
      dy,
      size,
      size
    );
    return true;
  }

  function drawPixelEgg(x, y, power) {
    const pal = selectedEggPalette();
    const heat = clamp(power / 100, 0, 1);
    const pulse = Math.round(Math.sin(time * 15) * heat * 2);
    x = Math.floor(x + pulse);

    ctx.save();
    ctx.globalAlpha = 0.20 + heat * 0.42;
    rect(x - 42, y - 40, 84, 82, pal.shade);
    rect(x - 34, y - 48, 68, 98, pal.shell);
    rect(x - 24, y - 55, 48, 110, pal.light);
    ctx.restore();

    drawEggPedestal(x, y + 34, pal);
    drawEggShell(x, y, pal, heat);
    drawEggCracks(x, y, heat, pal);
    drawEggAura(x, y, heat, pal);
  }

  function drawEggPedestal(x, y, pal) {
    rect(x - 42, y, 84, 4, PAL.gold);
    rect(x - 39, y + 4, 78, 8, "#7b4b2c");
    rect(x - 36, y + 12, 72, 3, "#4c2f27");
    for (let i = -34; i <= 34; i += 8) rect(x + i, y - 4, 3, 4, PAL.grass);
    rect(x - 53, y - 1, 10, 3, PAL.white);
    rect(x + 43, y - 1, 10, 3, PAL.white);
    drawCrystal(x - 56, y - 17);
    drawCrystal(x + 47, y - 12);
    rect(x - 14, y - 7, 5, 5, pal.gem);
    rect(x + 10, y - 6, 4, 4, pal.accent);
  }

  function drawEggShell(x, y, pal, heat) {
    const rows = [
      [-34, 7, 3, pal.light],
      [-31, 12, 4, pal.light],
      [-27, 17, 4, pal.shell],
      [-23, 21, 4, pal.shell],
      [-19, 25, 5, pal.shell],
      [-14, 28, 5, pal.shell],
      [-9, 30, 6, pal.shell],
      [-3, 31, 6, pal.shell],
      [3, 31, 6, pal.shell],
      [9, 29, 6, pal.shade],
      [15, 26, 5, pal.shade],
      [20, 22, 5, pal.shade],
      [25, 17, 4, pal.shade],
      [29, 11, 4, pal.shade]
    ];

    for (const [dy, hw, h, color] of rows) {
      rect(x - hw - 3, y + dy - 1, hw * 2 + 6, h + 2, "#071024");
      rect(x - hw, y + dy, hw * 2, h, color);
    }

    rect(x - 17, y - 23, 8, 8, pal.gem);
    rect(x + 10, y - 21, 7, 7, pal.gem);
    rect(x - 20, y - 6, 7, 7, pal.accent);
    rect(x + 14, y + 6, 6, 6, pal.accent);
    rect(x - 5, y - 31, 10, 4, PAL.gold2);
    rect(x - 2, y - 36, 4, 5, PAL.gold2);

    rect(x - 18, y - 28, 20, 3, PAL.white);
    rect(x - 24, y - 20, 8, 3, PAL.white);
    rect(x - 4, y - 16, 13, 2, PAL.white);
    if (heat > 0.35) rect(x - 13, y + 7, 20, 2, pal.spark);
    if (heat > 0.65) rect(x + 6, y - 4, 2, 19, PAL.white);
  }

  function drawEggCracks(x, y, heat, pal) {
    if (heat <= 0.24) return;
    const crack = heat > 0.72 ? PAL.white : PAL.gold2;
    rect(x + 4, y - 26, 2, 8, crack);
    rect(x + 2, y - 18, 4, 2, crack);
    rect(x + 1, y - 16, 2, 8, crack);
    if (heat > 0.48) {
      rect(x - 6, y - 8, 8, 2, crack);
      rect(x - 8, y - 6, 2, 8, crack);
      rect(x - 14, y + 2, 8, 2, crack);
    }
    if (heat > 0.75) {
      rect(x + 8, y + 4, 12, 2, crack);
      rect(x + 18, y + 6, 2, 8, crack);
      rect(x - 2, y + 15, 2, 9, pal.spark);
    }
  }

  function drawEggAura(x, y, heat, pal) {
    const count = 8 + Math.floor(heat * 10);
    for (let i = 0; i < count; i += 1) {
      const a = i * 0.72 + time * (1.4 + heat * 2);
      const r = 34 + (i % 4) * 6 + heat * 12;
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a * 1.15) * (25 + heat * 10);
      const size = i % 3 === 0 ? 2 : 1;
      rect(sx, sy, size, size, i % 2 ? pal.spark : pal.accent);
    }
  }

  function drawParticlesScreen() {
    for (const p of particles) {
      rect(p.x, p.y, p.s, p.s, p.c);
    }
  }

  function drawParticlesWorld() {
    for (const p of particles) {
      rect(p.x - cameraX, p.y - cameraY, p.s, p.s, p.c);
    }
    for (const t of floatText) {
      text(t.text, t.x - cameraX, t.y - cameraY, t.c, 1);
    }
  }

  // Additive light pass: bloom behind fire/gems, glowing sparks, shockwave
  // rings. Smooth light over crisp pixels = "HD, still 8-bit".
  function drawGlowLayer() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of fires) {
      const gx = f.x - cameraX, gy = f.y - cameraY;
      const r = f.lava ? f.w * 1.7 : f.w * 1.25;
      glowBlob(gx, gy, r, f.lava ? "#ff9a3a" : "#ff5a3a", 0.55);
      glowBlob(gx, gy, r * 0.5, f.lava ? "#ffe69a" : "#ffd0a0", 0.6);
    }
    for (const f of bossFires) {
      glowBlob(f.x - cameraX, f.y - cameraY, f.w * 1.5, "#ff5a3a", 0.55);
    }
    for (const s of shards) {
      if (s.got) continue;
      const gx = s.x - cameraX;
      if (gx < -12 || gx > W + 12) continue;
      const gy = s.y + Math.sin(time * 4 + s.bob) * 4 - cameraY;
      glowBlob(gx, gy, 9, "#ffe69a", 0.22 + Math.sin(time * 3 + s.bob) * 0.1);
    }
    if (player.fireFlash > 0) {
      const m = playerMouthPoint();
      glowBlob(m.x - cameraX, m.y - cameraY, 22, "#ffd0a0", Math.min(0.8, player.fireFlash * 2.4));
    }
    for (const p of particles) {
      if (p.glow) glowBlob(p.x - cameraX, p.y - cameraY, 5, p.c, 0.5);
    }
    for (const r of rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)); // ease-out
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.arc(r.x - cameraX, r.y - cameraY, Math.max(1, rad), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  let vignetteGrad = null;
  let topLightGrad = null;
  // Cinematic post: a soft vignette for depth + a faint top key-light. Drawn
  // under the HUD so the interface stays crisp.
  function drawPostFX() {
    if (!vignetteGrad) {
      vignetteGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.98);
      vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
      vignetteGrad.addColorStop(1, "rgba(4,6,16,0.4)");
      topLightGrad = ctx.createLinearGradient(0, 0, 0, H);
      topLightGrad.addColorStop(0, "#9bd4df");
      topLightGrad.addColorStop(0.45, "rgba(0,0,0,0)");
    }
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = topLightGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawHud() {
    rect(4, 4, 84, 26, PAL.uiDark);
    // Hearts row; the heart at the edge of change blinks white briefly
    for (let i = 0; i < 5; i += 1) {
      const hx = 14 + i * 12;
      if (i < player.hp) {
        const blink = hpFlash > 0 && i === player.hp - 1 && Math.floor(time * 10) % 2 === 0;
        if (imgReady(art.heart) && !blink) drawFittedAsset(art.heart, hx - 6, 6, 12, 12);
        else drawPixelHeart(hx, 12, blink ? PAL.white : PAL.red, PAL.red2);
      } else {
        drawPixelHeart(hx, 12, "#3a1c2c", "#4a2438");
      }
    }
    text("FLAP", 8, 21, PAL.white, 1);
    bar(44, 22, 40, 5, player.stamina, PAL.blue, PAL.gold2);
    text(stageNames[player.stage], 110, 5, PAL.gold2, 1);
    // Gem counter with a mini gem icon; counter pops white on pickup
    rect(238, 6, 3, 7, PAL.gold2);
    rect(236, 8, 7, 3, PAL.gold);
    text(String(score), 248, 5, gemPulse > 0 ? PAL.white : PAL.gold2, 1);
    const need = stageNeed[player.stage];
    const ratio = need >= 999 ? 1 : player.xp / need;
    // XP bar flashes when evolution is close
    const xpHi = ratio >= 0.8 && need < 999 && Math.floor(time * 6) % 2 === 0 ? PAL.white : PAL.gold2;
    bar(110, 16, 74, 5, ratio, PAL.red, xpHi);
    text("J FIRE", 248, 16, PAL.red2, 1);
  }

  function drawEvolve() {
    const t = hatchTimer;
    rect(0, 0, W, H, "rgba(0,0,0,0.55)");
    // White flash at the instant of evolution
    if (t < 0.14) {
      ctx.save();
      ctx.globalAlpha = 1 - t / 0.14;
      rect(0, 0, W, H, PAL.white);
      ctx.restore();
    }
    // Expanding golden rings from the dragon
    const cxp = 160;
    const cyp = 112;
    ctx.save();
    for (let r = 0; r < 3; r += 1) {
      const rt = t - r * 0.18;
      if (rt <= 0) continue;
      ctx.globalAlpha = Math.max(0, 0.55 - rt * 0.45);
      ring(cxp, cyp, rt * 150, r % 2 ? PAL.gold2 : PAL.blue2);
    }
    ctx.restore();
    // Radial sparks
    for (let i = 0; i < 10; i += 1) {
      const a = i * 0.63 + time * 2.5;
      const rr = 26 + ((t * 90 + i * 13) % 55);
      rect(cxp + Math.cos(a) * rr, cyp + Math.sin(a) * rr * 0.7, 2, 2, i % 2 ? PAL.gold2 : PAL.white);
    }
    text("EVOLUTION!", 89, 50, "#552340", 3);
    text("EVOLUTION!", 87, 48, PAL.gold2, 3);
    text(stageNames[player.stage], 120, 78, PAL.blue2, 2);
    drawDragonSprite(145, 122, player.stage, 1, true);
    blinkText("ENTER", 138, 150, PAL.white);
  }

  function drawPause() {
    rect(0, 0, W, H, "rgba(0,0,0,0.55)");
    text("PAUSED", 112, 76, PAL.gold2, 3);
    text("P TO RESUME", 112, 108, PAL.white, 1);
  }

  function drawEnd() {
    rect(0, 0, W, H, "rgba(0,0,0,0.62)");
    // Use the PLAYED character's name, not a hardcoded "ALTOS" — Namisa dying
    // said "ALTOS RESTS". Centre it so any name length sits in the middle.
    const restMsg = currentChar().name + " RESTS";
    ctx.font = `${8 * 3}px "Courier New", monospace`;
    const restX = Math.round((W - ctx.measureText(restMsg).width) / 2);
    text(restMsg, restX + 2, 56, "#552340", 3);
    text(restMsg, restX, 54, PAL.red2, 3);
    text("SCORE " + score, 120, 90, PAL.gold2, 2);
    blinkText("ENTER: RISE AT CHECKPOINT", 62, 122, PAL.white);
    text("R: START OVER", 106, 140, "#7a86b8", 1);
  }

  function drawWin() {
    const flash = Math.max(0, 1 - winTimer);
    if (flash > 0) rect(0, 0, W, H, "rgba(255,210,90," + (flash * 0.55).toFixed(3) + ")");
    rect(0, 0, W, H, "rgba(0,0,0,0.55)");
    // Confetti rain
    if (Math.random() > 0.35) {
      particles.push({
        x: cameraX + Math.random() * W,
        y: cameraY + 4,
        vx: -20 + Math.random() * 40,
        vy: 26 + Math.random() * 36,
        life: 1.8,
        g: 26,
        c: [PAL.gold2, PAL.blue2, PAL.red2, PAL.grass][Math.floor(Math.random() * 4)],
        s: 2
      });
    }
    drawParticlesWorld(); // redraw on top of the dim overlay so confetti pops
    text("VICTORY", 103, 53, "#552340", 4);
    text("VICTORY", 100, 50, PAL.gold2, 4);
    text("THE ANCIENT FALLS", 78, 88, PAL.red2, 2);
    text("SCORE " + score, 120, 112, PAL.white, 2);
    text("BEST " + best, 130, 130, PAL.gold2, 1);
    blinkText("R TO PLAY AGAIN", 96, 150, PAL.white);
  }

  function drawBorder() {
    rect(0, 0, W, 2, PAL.gold);
    rect(0, H - 2, W, 2, PAL.gold);
    rect(0, 0, 2, H, PAL.gold);
    rect(W - 2, 0, 2, H, PAL.gold);
  }

  function blinkText(value, x, y, c) {
    if (Math.floor(time * 3) % 2 === 0) text(value, x, y, c, 1);
  }

  function bar(x, y, w, h, value, a, b) {
    rect(x, y, w, h, "#05060b");
    const fill = Math.floor((w - 2) * clamp(value, 0, 1));
    rect(x + 1, y + 1, fill, h - 2, a);
    if (fill > 4) rect(x + 1, y + 1, Math.floor(fill * 0.45), h - 2, b);
    rect(x, y, w, 1, PAL.white);
  }

  function text(value, x, y, c, scale = 1) {
    ctx.fillStyle = c;
    ctx.font = `${8 * scale}px "Courier New", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(value, Math.floor(x), Math.floor(y));
  }

  function rect(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
  }

  function ring(x, y, r, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
    ctx.stroke();
  }

  function line(x1, y1, x2, y2, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(snap(x1), snap(y1));
    ctx.lineTo(snap(x2), snap(y2));
    ctx.stroke();
  }

  function tri(x1, y1, x2, y2, x3, y3, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(Math.floor(x1), Math.floor(y1));
    ctx.lineTo(Math.floor(x2), Math.floor(y2));
    ctx.lineTo(Math.floor(x3), Math.floor(y3));
    ctx.closePath();
    ctx.fill();
  }

  function fillPoly(points, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(Math.floor(x), Math.floor(y));
      else ctx.lineTo(Math.floor(x), Math.floor(y));
    });
    ctx.closePath();
    ctx.fill();
  }

  function setKey(e, pressed) {
    keys[e.code] = pressed;
    const key = String(e.key || "").toLowerCase();
    if (e.code === "ArrowLeft" || e.code === "KeyA" || key === "arrowleft" || key === "a") keys.left = pressed;
    if (e.code === "ArrowRight" || e.code === "KeyD" || key === "arrowright" || key === "d") keys.right = pressed;
    if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space" || key === "arrowup" || key === "w" || key === " " || key === "spacebar") keys.up = pressed;
    if (e.code === "ArrowDown" || e.code === "KeyS" || key === "arrowdown" || key === "s") keys.down = pressed;
    if (e.code === "KeyJ" || e.code === "KeyX" || e.code === "ControlLeft" || e.code === "ControlRight" || key === "j" || key === "x" || key === "control") keys.fire = pressed;
  }

  function shouldBlockKey(e) {
    const key = String(e.key || "").toLowerCase();
    return [
      "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyX"
    ].includes(e.code) || [" ", "spacebar", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "j", "x"].includes(key);
  }

  function clearKeys() {
    for (const key of Object.keys(keys)) {
      keys[key] = false;
    }
    flapHeld = false;
  }

  function handleKeyDown(e) {
    setKey(e, true);
    if (shouldBlockKey(e)) e.preventDefault();
    ensureAudio();
    const enter = e.code === "Enter" || e.code === "NumpadEnter" || String(e.key || "").toLowerCase() === "enter";
    const left = e.code === "ArrowLeft" || e.code === "KeyA";
    const right = e.code === "ArrowRight" || e.code === "KeyD";
    if (mode === MODE.TITLE && enter) startSelect();
    else if (mode === MODE.SELECT && enter) startEgg();
    else if (mode === MODE.SELECT && left) chooseCharacter(-1);
    else if (mode === MODE.SELECT && right) chooseCharacter(1);
    else if (mode === MODE.EGG && enter) warmEgg(10);
    else if (mode === MODE.EVOLVE && enter) mode = MODE.PLAY;
    else if (mode === MODE.END && enter) continueFromCheckpoint();
    else if (e.code === "KeyR") reset();
    else if (e.code === "KeyP") {
      if (mode === MODE.PLAY) {
        prevMode = mode;
        mode = MODE.PAUSE;
      } else if (mode === MODE.PAUSE) mode = prevMode;
    }
    else if (e.code === "KeyM") musicToggle();
  }

  function handlePointerDown(e) {
    canvas.focus();
    ensureAudio();
    if (mode === MODE.TITLE) startSelect();
    else if (mode === MODE.SELECT) {
      const p = canvasPoint(e);
      if (p.x < 104) chooseCharacter(-1);
      else if (p.x > 216) chooseCharacter(1);
      else startEgg();
    }
    else if (mode === MODE.EGG) warmEgg(12);
    else if (mode === MODE.EVOLVE) mode = MODE.PLAY;
    // Gate canvas-tap fire exactly like the keyboard/touch paths — a direct
    // shootFire() ignores the cooldown and stamina, so rapid clicks machine-gun.
    else if (mode === MODE.PLAY && fireCooldown <= 0 && player.stamina > 0.09) shootFire();
  }

  function canvasPoint(e) {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * W,
      y: ((e.clientY - box.top) / box.height) * H
    };
  }

  function pressVirtualControl(control) {
    canvas.focus();
    ensureAudio();

    if (control === "start") {
      if (mode === MODE.TITLE) startSelect();
      else if (mode === MODE.SELECT) startEgg();
      else if (mode === MODE.EGG) warmEgg(14);
      else if (mode === MODE.EVOLVE) mode = MODE.PLAY;
      else if (mode === MODE.PAUSE) mode = prevMode;
      else if (mode === MODE.END) continueFromCheckpoint();
      return;
    }

    if (mode === MODE.SELECT) {
      if (control === "left") chooseCharacter(-1);
      else if (control === "right") chooseCharacter(1);
      else if (control === "flap" || control === "fire") startEgg();
      return;
    }

    if (mode === MODE.EGG && (control === "flap" || control === "fire")) {
      warmEgg(14);
    }
  }

  function setVirtualControl(control, pressed) {
    if (control === "left") keys.left = pressed;
    else if (control === "right") keys.right = pressed;
    else if (control === "down") keys.down = pressed;
    else if (control === "flap") keys.up = pressed;
    else if (control === "fire") keys.fire = pressed;
    else if (control === "start") keys.Enter = pressed;
  }

  function bindTouchControls() {
    for (const button of touchButtons) {
      const control = button.dataset.control;
      const release = event => {
        event.preventDefault();
        button.classList.remove("is-held");
        setVirtualControl(control, false);
        if (event.pointerId !== undefined && button.hasPointerCapture && button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
      };

      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (button.setPointerCapture) {
          try {
            button.setPointerCapture(event.pointerId);
          } catch (_) {
            // Some synthetic/mobile browser events do not expose an active pointer.
          }
        }
        button.classList.add("is-held");
        pressVirtualControl(control);
        setVirtualControl(control, true);
      });
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", event => {
        event.preventDefault();
        button.classList.remove("is-held");
        setVirtualControl(control, false);
      });
      button.addEventListener("contextmenu", event => event.preventDefault());
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", e => {
    setKey(e, false);
    if (shouldBlockKey(e)) e.preventDefault();
  });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });
  canvas.addEventListener("pointerdown", handlePointerDown);
  restartButton.addEventListener("click", () => {
    ensureAudio();
    reset();
  });
  bindTouchControls();

  // The on-screen touch keys must show ONLY on genuine touch devices, never on
  // a narrow desktop window. Detect real touch capability and gate all
  // mobile-only CSS off a root class (controls default to display:none).
  const isTouchDevice =
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    "ontouchstart" in window ||
    (navigator.maxTouchPoints || 0) > 0;
  if (isTouchDevice) document.documentElement.classList.add("touch-device");

  function frame(now) {
    let delta = Math.min(0.12, (now - rafLast) / 1000);
    rafLast = now;
    accumulator += delta;
    while (accumulator >= STEP) {
      if (freeze > 0) freeze -= STEP;
      else update(STEP);
      accumulator -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  // Restore the last-selected character (if still unlocked)
  (() => {
    let startIdx = 0;
    try {
      const savedId = localStorage.getItem("altos8bitChar");
      const idx = ROSTER.findIndex(c => c.id === savedId);
      if (idx >= 0 && isUnlocked(ROSTER[idx])) startIdx = idx;
    } catch (_) {}
    setCharacter(startIdx);
  })();
  // Dev introspection hook (harmless in production).
  // Optional cmd: { play, stage, char, x } to drive automated playtests.
  window.__altosDebug = (cmd) => {
    if (cmd) {
      if (cmd.char !== undefined) {
        const idx = ROSTER.findIndex(c => c.id === cmd.char);
        if (idx >= 0) setCharacter(idx);
      }
      if (cmd.play) {
        mode = MODE.PLAY;
        if (player.hp <= 0) player.hp = 5;
        player.invuln = 1.5;
        player.deadAnim = 0;
        musicSyncToMode();
      }
      if (cmd.stage !== undefined) {
        player.stage = clamp(cmd.stage, 0, CHARACTERS.length - 1);
        applyStageBox();
        // mirror evolve() so QA exercises the same path a real run takes
        rescaleWorldAhead();
        player.y = Math.min(player.y, GROUND_Y - player.h);
      }
      if (cmd.x !== undefined) {
        player.x = cmd.x;
        checkpointX = cmd.x;
      }
      if (cmd.reseed) startPlay(); // fresh run: new seed, world, theme, track
      if (cmd.probe) {
        // raw geometry, for verifying that the course scales with the dragon
        return {
          platforms: platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, ground: !!p.ground, vs: p.vs || 1, type: p.type })),
          enemies: enemies.map((e) => ({ x: e.x, w: e.w, h: e.h, type: e.type })),
          hazards: hazards.map((z) => ({ x: z.x, w: z.w, h: z.h }))
        };
      }
    }
    const ledges = platforms.filter(p => !p.ground);
    const types = {};
    for (const p of ledges) types[p.type] = (types[p.type] || 0) + 1;
    return {
      mode, hatchTimer, warmth, time,
      charId: currentChar().id, stage: player.stage,
      px: Math.round(player.x), py: Math.round(player.y),
      pw: player.w, ph: player.h, drawSize: playerDrawSize(),
      hp: player.hp, stamina: +player.stamina.toFixed(2),
      ground: player.ground, cooldown: +fireCooldown.toFixed(2),
      enemies: enemies.filter(e => !e.dead).length,
      melting: enemies.filter(e => e.dead && e.melt).length,
      fires: fires.length,
      seed: levelSeed, theme: worldTheme && worldTheme.name, track: runPlayTrack,
      ledges: ledges.length, ledgeTypes: types,
      drakes: enemies.filter(e => e.type === "drake").length,
      wisps: enemies.filter(e => e.type === "wisp").length,
      hazards: hazards.length, gems: shards.length,
      freeze, accumulator
    };
  };

  seedStars();
  reset();
  requestAnimationFrame(frame);
})();
