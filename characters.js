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

  function makeStages(charId, charName, legacySheets) {
    return STAGE_EPITHETS.map(function (epithet, i) {
      var num = "0" + (i + 1);
      return {
        id: charId + "_" + num,
        name: charName + " " + epithet,
        atlas: "assets/sprites/" + charId + "_" + num + "_atlas2.png",
        sheet: legacySheets ? "assets/sprites/" + charId + "_" + num + "_sheet.png" : null,
        frameWidth: 160,
        frameHeight: 160,
        animations: i < 2 ? SMOOTH_ANIMS : CRAFT_ANIMS
      };
    });
  }

  window.ALTOS_ROSTER = [
    {
      id: "altos",
      name: "ALTOS",
      tagline: "THE BRAVE ONE",
      locked: false,
      eggSheet: "assets/sprites/egg_hatch_sheet.png",
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

  // Legacy export: older game.js builds read ALTOS_CHARACTERS directly.
  window.ALTOS_CHARACTERS = window.ALTOS_ROSTER[0].stages;
})();
