// Altos 8-Bit Quest — the dragon family roster.
//
// Each character has 7 stages: the egg (shown on the incubation screen and
// hatched at the start of a run) plus 6 playable evolution stages.
//
// Atlas format ("smooth" v2): 12 columns x 8 rows of 160px frames —
//   row 0 idle(12) · 1 walk(12) · 2 flight(12) · 3 attack(8) ·
//   row 4 flyattack(8) · 5 hurt(4) · 6 jump(6) · 7 dead(4)
// Older 8x7 atlases (altos_0N_atlas.png) remain on disk as a fallback; the
// game falls back atlas → sheet → block-art per stage, so a missing file
// never breaks a character. Runtime counts below intentionally use shorter,
// curated cycles so the enlarged evolved forms remain stable and complete.

(function () {
  // Baby stages (1-2): dense generated cycles. Adult stages (3-6): frame
  // counts matching the craftpix pose reference the sheets are built from.
  var SMOOTH_ANIMS = {
    idle:      { row: 0, frames: 4, fps: 5 },
    walk:      { row: 1, frames: 6, fps: 11 },
    flight:    { row: 2, frames: 6, fps: 10 },
    attack:    { row: 3, frames: 6, fps: 14, once: true },
    flyattack: { row: 4, frames: 6, fps: 14, once: true },
    hurt:      { row: 5, frames: 3, fps: 8, once: true },
    jump:      { row: 6, frames: 4, fps: 9, once: true },
    dead:      { row: 7, frames: 2, fps: 2,  once: true }
  };
  var CRAFT_ANIMS = {
    idle:      { row: 0, frames: 4, fps: 5 },
    walk:      { row: 1, frames: 5, fps: 10 },
    flight:    { row: 2, frames: 6, fps: 10 },
    attack:    { row: 3, frames: 6, fps: 13, once: true },
    flyattack: { row: 4, frames: 6, fps: 13, once: true },
    hurt:      { row: 5, frames: 3, fps: 8,  once: true },
    jump:      { row: 6, frames: 4, fps: 9, once: true },
    dead:      { row: 7, frames: 2, fps: 2,  once: true }
  };

  var STAGE_EPITHETS = ["HATCHLING", "YOUNG", "WINGED", "GUARDIAN", "SKY LORD", "ANCIENT"];

  // The krea-era atlases padded short cycles by repeating frames, leaving a
  // duplicate that reads as a one-frame stutter. Those rows were repacked so
  // their distinct frames sit first; these overrides drop the declared count to
  // the distinct count, per (charId_stage, anim). Interpolating an in-between
  // was tried and rejected — it ghosted the wings/manes. Keyed charId_stageNum.
  var FRAME_OVERRIDES = {
    "eileithyia_1": {"jump":3,"walk":5},
    "eileithyia_3": {"flight":4,"flyattack":4},
    "eileithyia_4": {"attack":5,"flight":5,"flyattack":5},
    "eileithyia_5": {"attack":5,"flight":4,"flyattack":4},
    "eileithyia_6": {"attack":5,"flight":4,"flyattack":4,"jump":3},
    "malfoy_1": {"attack":5},
    "malfoy_2": {"walk":5},
    "malfoy_3": {"attack":5,"flight":4,"flyattack":5,"walk":3},
    "malfoy_4": {"attack":5,"flight":5,"flyattack":5,"idle":3,"jump":3,"walk":3},
    "malfoy_5": {"attack":5,"flight":5,"flyattack":5,"jump":3,"walk":4},
    "malfoy_6": {"attack":5,"flight":4,"flyattack":5,"jump":3,"walk":4},
    "namisa_1": {"jump":3},
    "namisa_2": {"flyattack":5},
    "namisa_3": {"attack":5,"flight":4,"jump":3,"walk":4},
    "namisa_4": {"attack":5,"flight":4,"flyattack":5,"walk":4},
    "namisa_5": {"dead":1,"flight":5,"hurt":2,"walk":4},
    "namisa_6": {"attack":5,"flight":4,"flyattack":4,"walk":4},
    "sparo_1": {"attack":5,"idle":2},
    "sparo_2": {"attack":5,"walk":5},
    "sparo_3": {"attack":5,"flight":5,"flyattack":5},
    "sparo_4": {"attack":5,"flight":4},
    "sparo_5": {"attack":5,"flight":4,"flyattack":5},
    "sparo_6": {"attack":5,"flight":5}
  };

  function withOverrides(anims, key) {
    var ov = FRAME_OVERRIDES[key];
    if (!ov) return anims;
    var out = {};
    Object.keys(anims).forEach(function (name) {
      // clone so the shared SMOOTH/CRAFT template is never mutated
      var a = Object.assign({}, anims[name]);
      if (ov[name] !== undefined) a.frames = ov[name];
      out[name] = a;
    });
    return out;
  }

  function makeStages(charId, charName, legacySheets) {
    return STAGE_EPITHETS.map(function (epithet, i) {
      var num = "0" + (i + 1);
      // Evolved stages (3-6) use 512px atlas cells so the enlarged dragons
      // stay crisp at their big draw sizes; babies use 256px cells.
      var cell = i < 2 ? 256 : 512;
      var base = i < 2 ? SMOOTH_ANIMS : CRAFT_ANIMS;
      return {
        id: charId + "_" + num,
        name: charName + " " + epithet,
        atlas: "assets/sprites/" + charId + "_" + num + "_atlas2.png",
        sheet: legacySheets ? "assets/sprites/" + charId + "_" + num + "_sheet.png" : null,
        frameWidth: cell,
        frameHeight: cell,
        animations: withOverrides(base, charId + "_" + (i + 1))
      };
    });
  }

  window.ALTOS_ROSTER = [
    {
      id: "altos",
      name: "ALTOS",
      tagline: "THE BRAVE ONE",
      locked: false,
      eggSheet: "assets/sprites/egg_hatch_altos.png",
      eggPalette: { shell: "#2fb7ff", shade: "#1b55c8", light: "#7be8ff", accent: "#f7c64a", gem: "#6a4fe3", spark: "#fff8d6" },
      bodyColors: { main: "#2c49c8", light: "#7be8ff", dark: "#1b3598", wing: "#a03050" },
      stages: makeStages("altos", "ALTOS", true)
    },
    {
      id: "sparo",
      name: "SPARO",
      tagline: "THE ICE BROTHER",
      locked: false,
      eggSheet: "assets/sprites/egg_hatch_sparo.png",
      fireSheet: "assets/sprites/fire_breath_sparo.png",
      eggPalette: { shell: "#e8f4ff", shade: "#7aa8d8", light: "#ffffff", accent: "#ffd97a", gem: "#37d6ff", spark: "#d7fbff" },
      bodyColors: { main: "#dce8f8", light: "#ffffff", dark: "#8aa8cc", wing: "#9accf0" },
      stages: makeStages("sparo", "SPARO", false)
    },
    {
      id: "eileithyia",
      name: "EILEITHYIA",
      tagline: "THE GEM SISTER",
      locked: false,
      eggSheet: "assets/sprites/egg_hatch_eileithyia.png",
      fireSheet: "assets/sprites/fire_breath_eileithyia.png",
      eggPalette: { shell: "#ff6fb0", shade: "#b0347a", light: "#ffc2e0", accent: "#f7c64a", gem: "#37e0c8", spark: "#fff0f8" },
      bodyColors: { main: "#e85a9e", light: "#ffc2e0", dark: "#a03070", wing: "#c04888" },
      stages: makeStages("eileithyia", "EILEITHYIA", false)
    },
    {
      id: "namisa",
      name: "NAMISA",
      tagline: "THE STARLIGHT MOTHER",
      locked: true,
      unlock: { type: "stage", stage: 3, label: "EVOLVE TO GUARDIAN TO UNLOCK" },
      eggSheet: "assets/sprites/egg_hatch_namisa.png",
      fireSheet: "assets/sprites/fire_breath_namisa.png",
      eggPalette: { shell: "#9a5fe8", shade: "#5a2a9c", light: "#d0aaff", accent: "#ffd97a", gem: "#37d6ff", spark: "#f0e0ff" },
      bodyColors: { main: "#7a3fd0", light: "#d0aaff", dark: "#4a2088", wing: "#b088e8" },
      stages: makeStages("namisa", "NAMISA", false)
    },
    {
      id: "malfoy",
      name: "MALFOY",
      tagline: "THE VOLCANO FATHER",
      locked: true,
      unlock: { type: "win", label: "DEFEAT THE ANCIENT TO UNLOCK" },
      eggSheet: "assets/sprites/egg_hatch_malfoy.png",
      fireSheet: "assets/sprites/fire_breath_malfoy.png",
      eggPalette: { shell: "#3a3244", shade: "#181420", light: "#6a5a7c", accent: "#ff8a3a", gem: "#ff4a5f", spark: "#ffc06a" },
      bodyColors: { main: "#2a2434", light: "#6a5a7c", dark: "#141018", wing: "#e84a2f" },
      stages: makeStages("malfoy", "MALFOY", false)
    }
  ];

  // Altos stages 01-06 all use the video-generated atlases now: full 8-frame
  // cycles for the loops, 6-frame one-shots. fps values are fitted to the
  // game's fixed anim windows (hurt must finish inside HURT_ANIM_TIME 0.42s).
  // Stage 01 HATCHLING got its own baby canon on 2026-07-21.
  var VIDEO_ANIMS = {
    idle:      { row: 0, frames: 8, fps: 7 },
    walk:      { row: 1, frames: 8, fps: 10 },
    flight:    { row: 2, frames: 8, fps: 11 },
    attack:    { row: 3, frames: 6, fps: 10, once: true },
    flyattack: { row: 4, frames: 6, fps: 10, once: true },
    hurt:      { row: 5, frames: 6, fps: 12, once: true },
    jump:      { row: 6, frames: 6, fps: 10, once: true },
    dead:      { row: 7, frames: 6, fps: 7,  once: true }
  };
  for (var vs = 0; vs <= 5; vs++) {
    window.ALTOS_ROSTER[0].stages[vs].animations = VIDEO_ANIMS;
  }

  // Legacy export: older game.js builds read ALTOS_CHARACTERS directly.
  window.ALTOS_CHARACTERS = window.ALTOS_ROSTER[0].stages;
})();
