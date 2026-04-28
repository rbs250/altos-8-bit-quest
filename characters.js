window.ALTOS_CHARACTERS = [
  { id: "altos_01", name: "ALTOS HATCHLING", sheet: "assets/sprites/altos_01_sheet.png" },
  {
    id: "altos_02",
    name: "ALTOS YOUNG",
    sheet: "assets/sprites/altos_02_sheet.png",
    atlas: "assets/sprites/altos_young_pose_atlas.png",
    frameWidth: 160,
    frameHeight: 160,
    animations: {
      idle: { row: 0, frames: 4, fps: 4 },
      attack: { row: 1, frames: 6, fps: 11, once: true },
      hurt: { row: 2, frames: 3, fps: 8, once: true },
      dead: { row: 3, frames: 2, fps: 3, once: true },
      flight: { row: 4, frames: 7, fps: 9 },
      jump: { row: 5, frames: 5, fps: 9, once: true },
      walk: { row: 6, frames: 6, fps: 10 }
    }
  },
  { id: "altos_03", name: "ALTOS WINGED", sheet: "assets/sprites/altos_03_sheet.png" },
  { id: "altos_04", name: "ALTOS GUARDIAN", sheet: "assets/sprites/altos_04_sheet.png" },
  { id: "altos_05", name: "ALTOS SKY LORD", sheet: "assets/sprites/altos_05_sheet.png" },
  { id: "altos_06", name: "ALTOS ANCIENT", sheet: "assets/sprites/altos_06_sheet.png" }
];
