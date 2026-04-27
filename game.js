(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const restartButton = document.getElementById("restart");

  const W = 320;
  const H = 180;
  const RENDER_SCALE = 2;
  const STEP = 1 / 60;
  const TILE = 8;
  const GRAVITY = 560;
  const LEVEL_W = 3200;
  const GROUND_Y = 150;
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
    END: 7
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

  const CHARACTERS = Array.isArray(window.ALTOS_CHARACTERS) && window.ALTOS_CHARACTERS.length
    ? window.ALTOS_CHARACTERS
    : [{ id: "altos_01", name: "ALTOS", sheet: "assets/sprites/altos_01_sheet.png" }];
  const SPRITE_FRAME = 96;
  const spriteSheets = CHARACTERS.map(character => {
    const img = new Image();
    img.src = character.sheet;
    return img;
  });

  const keys = Object.create(null);
  const platforms = [];
  const shards = [];
  const fires = [];
  const particles = [];
  const floatText = [];
  const stars = [];

  let mode = MODE.TITLE;
  let prevMode = MODE.TITLE;
  let rafLast = performance.now();
  let accumulator = 0;
  let audio = null;
  let cameraX = 0;
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
  let selectedCharacter = Number(localStorage.getItem("altosSelectedCharacter") || 0);
  if (!Number.isFinite(selectedCharacter)) selectedCharacter = 0;
  selectedCharacter = clamp(selectedCharacter, 0, CHARACTERS.length - 1);

  const player = {
    x: 56,
    y: GROUND_Y - 24,
    vx: 0,
    vy: 0,
    w: 28,
    h: 20,
    face: 1,
    ground: false,
    stamina: 1,
    hp: 5,
    stage: 0,
    xp: 0,
    invuln: 0,
    fireFlash: 0
  };

  const stageNames = CHARACTERS.map(character => String(character.name || character.id).toUpperCase());
  const stageNeed = CHARACTERS.map((_, index) => index >= CHARACTERS.length - 1 ? 999 : 5 + index * 2);
  const eggPalettes = [
    { shell: PAL.blue, shade: PAL.blue3, light: PAL.blue2, accent: PAL.gold, gem: PAL.purple, spark: PAL.white },
    { shell: "#43c9ff", shade: "#245ed8", light: "#b9f5ff", accent: PAL.gold2, gem: PAL.red, spark: PAL.blue2 },
    { shell: "#5ed7ff", shade: "#253a9c", light: "#d7fbff", accent: "#ff8a65", gem: "#6a4fe3", spark: PAL.gold2 },
    { shell: "#36b8f2", shade: "#143b87", light: "#bff8ff", accent: "#f2b64d", gem: "#e83f5f", spark: PAL.white },
    { shell: "#53c4ff", shade: "#2843a8", light: "#e0fbff", accent: "#ffcf5c", gem: "#ff5f7a", spark: PAL.gold2 },
    { shell: "#62e2ff", shade: "#2248b5", light: "#d9ffff", accent: "#ffdf7a", gem: "#d74bff", spark: PAL.blue2 }
  ];

  function reset() {
    clearKeys();
    mode = MODE.TITLE;
    prevMode = MODE.TITLE;
    cameraX = 0;
    shake = 0;
    freeze = 0;
    time = 0;
    hatchTimer = 0;
    warmth = 0;
    score = 0;
    eggshell = [];
    fires.length = 0;
    particles.length = 0;
    floatText.length = 0;
    player.x = 56;
    player.y = GROUND_Y - 24;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.ground = false;
    player.stamina = 1;
    player.hp = 5;
    player.stage = selectedCharacter;
    player.xp = 0;
    player.invuln = 0;
    player.fireFlash = 0;
    flapHeld = false;
    buildWorld();
  }

  function buildWorld() {
    platforms.length = 0;
    shards.length = 0;

    for (let x = 0; x < LEVEL_W; x += TILE) {
      const wave = Math.sin(x * 0.018) * 5 + Math.sin(x * 0.006) * 7;
      platforms.push({ x, y: GROUND_Y + wave, w: TILE, h: 40, solid: true, ground: true });
    }

    const ledges = [
      [180, 116, 72], [330, 94, 64], [500, 126, 96], [675, 86, 72],
      [850, 108, 88], [1050, 74, 72], [1225, 122, 80], [1440, 92, 96],
      [1660, 114, 72], [1840, 78, 88], [2045, 118, 80], [2230, 88, 72],
      [2440, 126, 104], [2660, 96, 80], [2850, 76, 112]
    ];
    for (let i = 0; i < ledges.length; i += 1) {
      const [x, y, w] = ledges[i];
      platforms.push({ x, y, w, h: 8, solid: true, ground: false, sink: 0, sinkVel: 0, phase: i * 0.7 });
    }

    for (let i = 0; i < 46; i += 1) {
      const x = 130 + i * 64 + ((i * 37) % 29);
      const y = 58 + ((i * 47) % 74);
      shards.push({ x, y, got: false, bob: i * 0.65 });
    }
  }

  function seedStars() {
    stars.length = 0;
    for (let i = 0; i < 90; i += 1) {
      stars.push({ x: (i * 47) % W, y: 8 + ((i * 31) % 74), c: i % 4 === 0 ? PAL.gold2 : PAL.blue2 });
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
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
    if (Ctor) audio = new Ctor();
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

  function addText(text, x, y, c = PAL.gold2) {
    floatText.push({ text, x, y, life: 0.85, c });
  }

  function selectedName() {
    return stageNames[selectedCharacter] || "ALTOS";
  }

  function selectedEggPalette() {
    return eggPalettes[selectedCharacter % eggPalettes.length];
  }

  function startSelect() {
    ensureAudio();
    mode = MODE.SELECT;
    hatchTimer = 0;
    particles.length = 0;
    arpeggio(196);
  }

  function chooseCharacter(delta) {
    selectedCharacter = (selectedCharacter + delta + CHARACTERS.length) % CHARACTERS.length;
    localStorage.setItem("altosSelectedCharacter", String(selectedCharacter));
    hatchTimer = 0;
    addDust(W / 2, 108, 12, selectedEggPalette().spark);
    beep(220 + selectedCharacter * 24, 0.055, "square", 0.026, 1.22);
  }

  function startEgg() {
    ensureAudio();
    mode = MODE.EGG;
    warmth = 0;
    hatchTimer = 0;
    particles.length = 0;
    arpeggio(220);
  }

  function startHatch() {
    mode = MODE.HATCH;
    hatchTimer = 0;
    shake = 7;
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
    mode = MODE.PLAY;
    player.x = 56;
    player.y = GROUND_Y - 24;
    player.vx = 0;
    player.vy = 0;
    player.hp = 5;
    player.stamina = 1;
    player.stage = selectedCharacter;
    player.xp = 0;
    cameraX = 0;
    addText(selectedName() + "!", player.x, player.y - 16, PAL.gold2);
  }

  function evolve() {
    if (player.stage >= CHARACTERS.length - 1) return;
    player.stage += 1;
    player.xp = 0;
    mode = MODE.EVOLVE;
    hatchTimer = 0;
    shake = 8;
    freeze = 0.08;
    addDust(player.x + 14, player.y + 10, 70, PAL.gold2);
    arpeggio(392);
  }

  function update(dt) {
    time += dt;
    fireCooldown = Math.max(0, fireCooldown - dt);
    shake = Math.max(0, shake - dt * 16);

    updateParticles(dt);
    updatePlatforms(dt);

    if (mode === MODE.TITLE) return;
    if (mode === MODE.SELECT) {
      hatchTimer += dt;
      return;
    }
    if (mode === MODE.EGG) {
      warmth = clamp(warmth - dt * 7, 0, 100);
      if ((keys.Enter || keys.Space) && hatchTimer <= 0) {
        warmEgg(7);
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
    if (mode !== MODE.PLAY) return;

    player.fireFlash = Math.max(0, player.fireFlash - dt);
    updatePlayer(dt);
    updateFire(dt);
    updateShards();
    cameraX = clamp(Math.round(player.x - 92), 0, LEVEL_W - W);
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
    const accel = player.ground ? 650 : 410;
    const max = 88 + player.stage * 12;
    player.vx += axis * accel * dt;
    if (!axis) player.vx *= player.ground ? 0.78 : 0.95;
    player.vx = clamp(player.vx, -max, max);

    if (flap && !flapHeld && player.stamina > 0.05) {
      player.vy = Math.min(player.vy, 0);
      player.vy -= player.ground ? 132 : 92;
      player.ground = false;
      player.stamina = clamp(player.stamina - 0.05, 0, 1);
      shake = Math.max(shake, 1.4);
      addDust(player.x + 12, player.y + 18, 8, PAL.blue2);
      beep(260, 0.055, "triangle", 0.025, 1.22);
    }
    if (flap && player.stamina > 0.015) {
      player.vy -= 410 * dt;
      player.ground = false;
      player.stamina = clamp(player.stamina - dt * 0.075, 0, 1);
      if (Math.random() > 0.62) addDust(player.x + 12, player.y + 18, 1, PAL.blue2);
    }
    flapHeld = !!flap;
    if (down) player.vy += 240 * dt;

    player.vy += GRAVITY * dt;
    player.vy = clamp(player.vy, -185, 220);

    player.x += player.vx * dt;
    collideX();
    const prevY = player.y;
    player.y += player.vy * dt;
    collideY(prevY);

    player.x = clamp(player.x, 2, LEVEL_W - 36);
    if (player.y < 22) {
      player.y = 22;
      player.vy = Math.max(0, player.vy);
    }
    if (player.y > H + 40) {
      hurt();
      player.x = Math.max(40, player.x - 70);
      player.y = 20;
      player.vy = 0;
    }

    if (player.ground) player.stamina = clamp(player.stamina + dt * 0.65, 0, 1);
    else player.stamina = clamp(player.stamina + dt * 0.18, 0, 1);

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
      const py = platformCollisionY(p);
      const pbox = { x: p.x, y: py, w: p.w, h: p.h };
      if (!rects(box, pbox)) continue;
      if (player.vy > 0 && prevBottom <= py + 7) {
        const impact = player.vy;
        player.y = py - player.h + 2;
        if (!player.ground && impact > 95) {
          bumpPlatform(p, impact, false);
          shake = Math.max(shake, 2.5);
          addDust(player.x + 14, player.y + player.h, 8, PAL.gold);
          beep(80, 0.06, "square", 0.018, 0.65);
        }
        player.vy = 0;
        player.ground = true;
      } else if (player.vy < 0 && !p.ground) {
        const impact = -player.vy;
        player.y = py + p.h - 3;
        player.vy = Math.max(34, impact * 0.32);
        bumpPlatform(p, impact, true);
        shake = Math.max(shake, 1.6);
        addDust(player.x + 14, py + p.h + 2, 6, PAL.blue2);
        beep(120, 0.045, "square", 0.015, 0.85);
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

  function shootFire() {
    fireCooldown = 0.18 - player.stage * 0.02;
    const fx = player.x + (player.face > 0 ? 25 : 1);
    const fy = player.y + 8;
    fires.push({
      x: fx,
      y: fy,
      vx: player.face * (160 + player.stage * 30),
      life: 0.55,
      w: 12 + player.stage * 4,
      h: 6 + player.stage
    });
    player.fireFlash = 0.18;
    addDust(fx, fy, 5, PAL.red2);
    beep(96, 0.08, "sawtooth", 0.032, 0.55);
  }

  function updateFire(dt) {
    for (let i = fires.length - 1; i >= 0; i -= 1) {
      const f = fires[i];
      f.life -= dt;
      f.x += f.vx * dt;
      if (f.life <= 0 || f.x < cameraX - 32 || f.x > cameraX + W + 32) {
        fires.splice(i, 1);
      } else if (Math.random() > 0.5) {
        addDust(f.x, f.y, 1, Math.random() > 0.5 ? PAL.red2 : PAL.gold2);
      }
    }
  }

  function updateShards() {
    for (const s of shards) {
      if (s.got) continue;
      const sy = s.y + Math.sin(time * 4 + s.bob) * 4;
      const box = { x: s.x - 5, y: sy - 5, w: 10, h: 10 };
      const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rects(box, pbox)) {
        s.got = true;
        score += 1;
        best = Math.max(best, score);
        localStorage.setItem("altos8bitBest", String(best));
        player.xp += 1;
        addText("+1", s.x, sy - 10, PAL.gold2);
        addDust(s.x, sy, 16, PAL.gold2);
        beep(660, 0.06, "square", 0.035, 1.45);
        if (player.xp >= stageNeed[player.stage]) evolve();
      }
    }
  }

  function hurt() {
    if (player.invuln > 0) return;
    player.invuln = 1;
    player.hp -= 1;
    shake = 6;
    addText("OUCH", player.x, player.y - 8, PAL.red);
    beep(120, 0.13, "sawtooth", 0.04, 0.45);
    if (player.hp <= 0) {
      mode = MODE.END;
      arpeggio(130);
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
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.vy += 220 * dt;
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
    }
    ctx.restore();
  }

  function clear(c = PAL.black) {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    drawSky(0);
    drawLogo(34, 28);
    drawDragonSprite(192, 112, 3, 1, false);
    text("HATCH A DRAGON. FLY. EVOLVE.", 35, 78, PAL.blue2, 1);
    blinkText("PRESS ENTER", 110, 128, PAL.gold2);
    text("NEXT: CHOOSE YOUR DRAGON", 72, 140, PAL.white, 1);
    text("BEST " + best, 132, 154, PAL.white, 1);
    drawBorder();
  }

  function drawLogo(x, y) {
    text("ALTOS", x + 2, y + 2, "#552340", 4);
    text("ALTOS", x, y, PAL.gold2, 4);
    text("8-BIT QUEST", x + 4, y + 34, PAL.red2, 2);
  }

  function drawSelect() {
    drawSky(0);
    text("CHOOSE YOUR DRAGON", 42, 18, PAL.gold2, 2);
    text("A/D OR ARROWS", 94, 38, PAL.blue2, 1);

    for (let offset = -1; offset <= 1; offset += 1) {
      const idx = (selectedCharacter + offset + CHARACTERS.length) % CHARACTERS.length;
      const selected = offset === 0;
      const cx = 160 + offset * 76;
      const platformY = selected ? 126 : 132;
      const cardW = selected ? 70 : 58;
      const cardX = cx - cardW / 2;

      rect(cardX, platformY, cardW, 4, selected ? PAL.gold2 : PAL.gold);
      rect(cardX + 2, platformY + 4, cardW - 4, 7, selected ? "#7b4b2c" : "#4c2f27");
      for (let tx = 0; tx < cardW; tx += 8) rect(cardX + tx + 3, platformY - 3, 3, 3, PAL.grass);

      if (selected) {
        rect(cardX - 2, platformY - 2, 2, 15, PAL.blue2);
        rect(cardX + cardW, platformY - 2, 2, 15, PAL.blue2);
        drawSelectionSparks(cx, 91);
      }

      drawDragonPreview(cx, selected ? 124 : 128, idx, selected ? 76 : 50, selected && Math.floor(time * 3) % 2 === 0);
      text(stageNames[idx], cx - 25, platformY + 16, selected ? PAL.gold2 : PAL.white, 1);
    }

    text("<", 42, 96, PAL.gold2, 3);
    text(">", 264, 96, PAL.gold2, 3);
    blinkText("ENTER TO INCUBATE", 88, 160, PAL.white);
    drawParticlesScreen();
    drawBorder();
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
    text("TAP ENTER OR CLICK", 84, 42, PAL.white, 1);
    drawPixelEgg(W / 2, 96, warmth);
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
    for (const e of eggshell) {
      rect(e.x, e.y, e.r + 2, e.r, e.c);
      rect(e.x + 1, e.y, e.r, 1, PAL.white);
    }
    if (hatchTimer > 0.55) {
      drawDragonSprite(W / 2 - 15, 114 - Math.sin(time * 9) * 4, selectedCharacter, 1, true);
      text(selectedName() + " IS BORN!", 72, 36, PAL.gold2, 2);
    }
    drawParticlesScreen();
    drawBorder();
  }

  function drawPlay() {
    drawSky(cameraX);
    drawWorld();
    drawShards();
    drawFires();
    drawDragonSprite(player.x - cameraX, player.y, player.stage, player.face, !player.ground);
    drawParticlesWorld();
    drawHud();
    drawBorder();
  }

  function drawSky(cam) {
    clear(PAL.night);
    for (const s of stars) {
      const x = Math.floor((s.x - cam * 0.08 + W * 4) % W);
      rect(x, s.y, 1, 1, s.c);
    }
    rect(250 - (cam * 0.05) % 420, 20, 10, 10, PAL.gold2);
    rect(252 - (cam * 0.05) % 420, 18, 6, 14, PAL.gold2);
    rect(246 - (cam * 0.05) % 420, 24, 18, 2, PAL.gold2);
    drawCloud(44 - (cam * 0.16) % 420, 44);
    drawCloud(180 - (cam * 0.13) % 420, 30);
    drawMountains(cam);
  }

  function drawCloud(x, y) {
    for (const off of [0, 320, 640]) {
      rect(x + off, y + 5, 44, 8, PAL.cloud2);
      rect(x + off + 8, y, 28, 8, PAL.cloud);
      rect(x + off + 18, y - 5, 24, 8, PAL.cloud);
    }
  }

  function drawMountains(cam) {
    const base = 120;
    for (let i = -1; i < 8; i += 1) {
      const x = i * 72 - Math.floor((cam * 0.28) % 72);
      tri(x, base, x + 36, 70 + (i % 2) * 14, x + 76, base, PAL.mountain);
      tri(x + 24, base, x + 62, 82 + (i % 3) * 8, x + 102, base, PAL.mountain2);
    }
  }

  function drawWorld() {
    for (const p of platforms) {
      const x = Math.floor(p.x - cameraX);
      if (x < -p.w || x > W) continue;
      const y = platformDrawY(p);
      if (p.ground) {
        rect(x, y, p.w, H - y, PAL.darkGrass);
        rect(x, y, p.w, 3, PAL.grass);
        if ((p.x / TILE) % 4 === 0) rect(x + 2, y - 3, 2, 3, PAL.grass);
      } else {
        rect(x, y, p.w, p.h, PAL.gold);
        rect(x, y + 2, p.w, p.h - 2, "#7b4b2c");
        rect(x, y + p.h, p.w, 1, "#4c2f27");
        for (let tx = 0; tx < p.w; tx += 8) rect(x + tx + 2, y - 3, 3, 3, PAL.grass);
      }
    }
    for (let i = 0; i < 38; i += 1) {
      const wx = i * 82 + 18;
      const x = Math.floor(wx - cameraX);
      if (x < -20 || x > W + 20) continue;
      drawCrystal(x, 135 + Math.sin(wx * 0.04) * 8);
    }
  }

  function platformDrawY(p) {
    if (p.ground) return Math.floor(p.y);
    const float = Math.sin(time * 2.1 + p.phase) * 0.8;
    return Math.floor(p.y + float + (p.sink || 0));
  }

  function drawCrystal(x, y) {
    rect(x, y, 3, 11, PAL.blue2);
    rect(x + 3, y - 5, 3, 16, PAL.blue);
    rect(x + 6, y + 2, 3, 9, PAL.blue3);
    rect(x - 2, y + 10, 14, 2, PAL.white);
  }

  function drawShards() {
    for (const s of shards) {
      if (s.got) continue;
      const x = Math.floor(s.x - cameraX);
      const y = Math.floor(s.y + Math.sin(time * 4 + s.bob) * 4);
      if (x < -12 || x > W + 12) continue;
      rect(x - 3, y - 6, 6, 12, PAL.gold2);
      rect(x - 6, y - 2, 12, 4, PAL.gold);
      rect(x - 2, y - 3, 4, 6, PAL.white);
    }
  }

  function drawFires() {
    for (const f of fires) {
      const x = Math.floor(f.x - cameraX);
      const y = Math.floor(f.y);
      rect(x, y - 2, f.w, f.h + 4, PAL.red);
      rect(x + (f.vx > 0 ? 2 : -2), y, f.w - 2, f.h, PAL.red2);
      rect(x + (f.vx > 0 ? 6 : -6), y + 1, Math.max(3, f.w - 9), 3, PAL.gold2);
    }
  }

  function drawDragonSprite(x, y, stage, face, flying) {
    const img = spriteSheets[stage];
    if (img && img.complete && img.naturalWidth > 0) {
      drawSheetDragonSprite(x, y, stage, face, flying, img);
      return;
    }
    drawBlockDragonSprite(x, y, stage, face, flying);
  }

  function drawDragonPreview(x, y, stage, size, flying) {
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

  function drawSheetDragonSprite(x, y, stage, face, flying, img) {
    const moving = mode === MODE.PLAY && Math.abs(player.vx) > 12 && player.stage === stage;
    let frame = Math.floor(time * 2.2) % 2;
    if (player.fireFlash > 0 && player.stage === stage) frame = 7;
    else if (flying) frame = 5 + (Math.floor(time * 8) % 2);
    else if (moving) frame = 2 + (Math.floor(time * 10) % 3);

    const size = 72 + Math.min(stage, 5) * 5;
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

  function drawBlockDragonSprite(x, y, stage, face, flying) {
    const s = stage;
    const flip = face < 0;
    const bob = flying ? Math.round(Math.sin(time * 16) * 2) : Math.round(Math.sin(time * 6) * 1);
    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y + bob));
    if (flip) ctx.scale(-1, 1);

    const bodyW = 22 + s * 4;
    const bodyH = 13 + s * 2;
    const wingOpen = flying ? 11 + Math.round(Math.sin(time * 16) * 4) : 7 + Math.round(Math.sin(time * 4) * 1);

    // Tail
    rect(-14 - s * 3, 10, 14 + s * 4, 4, PAL.blue3);
    rect(-20 - s * 4, 8, 8, 3, s >= 2 ? PAL.red : PAL.blue);
    rect(-21 - s * 4, 13, 7, 3, PAL.blue);
    for (let i = 0; i < 4 + s; i += 1) rect(-9 - i * 4, 7 - (i % 2), 2, 2, PAL.gold);

    // Far wing
    drawWing(-2, 4, wingOpen, s, true);

    // Body and belly
    rect(0, 5, bodyW, bodyH, PAL.blue);
    rect(2, 3, bodyW - 5, 4, PAL.blue2);
    rect(4, 9, bodyW - 4, bodyH - 4, PAL.blue3);
    rect(bodyW - 7, 6, 7, bodyH - 3, PAL.cream);
    for (let i = 0; i < 4 + s; i += 1) rect(bodyW - 8, 8 + i * 3, 7, 1, "#b9d7d8");
    for (let i = 0; i < 6 + s; i += 1) rect(2 + i * 4, 2 - (i % 2), 2, 3, PAL.gold);

    // Legs
    drawLeg(5, 16, flying, 0);
    drawLeg(bodyW - 6, 16, flying, 1);

    // Neck and head
    rect(bodyW - 1, 0, 7 + s, 6, PAL.blue);
    rect(bodyW + 4 + s, -5, 14 + s * 2, 10, PAL.blue2);
    rect(bodyW + 15 + s, -2, 7 + s, 5, PAL.blue);
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
    ], stage >= 2 ? PAL.red : PAL.purple);
    rect(x - 10, y - open + 1, 4, 3, PAL.blue2);
    ctx.globalAlpha = 1;
  }

  function drawLeg(x, y, flying, phase) {
    const lift = flying ? -4 + phase * 2 : Math.round(Math.sin(time * 10 + phase * Math.PI) * 2);
    rect(x, y, 4, 8 + lift, PAL.blue3);
    rect(x - 1, y + 7 + lift, 7, 3, PAL.blue);
    rect(x + 4, y + 8 + lift, 2, 2, PAL.gold2);
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
      rect(p.x - cameraX, p.y, p.s, p.s, p.c);
    }
    for (const t of floatText) {
      text(t.text, t.x - cameraX, t.y, t.c, 1);
    }
  }

  function drawHud() {
    rect(4, 4, 78, 24, PAL.uiDark);
    text("HP", 8, 8, PAL.white, 1);
    for (let i = 0; i < 5; i += 1) rect(24 + i * 8, 8, 6, 5, i < player.hp ? PAL.red : "#432033");
    text("FLAP", 8, 18, PAL.white, 1);
    bar(42, 18, 36, 5, player.stamina, PAL.blue, PAL.gold2);
    text(stageNames[player.stage], 110, 5, PAL.gold2, 1);
    text("GEMS " + score, 246, 5, PAL.gold2, 1);
    const need = stageNeed[player.stage];
    bar(110, 16, 74, 5, need >= 999 ? 1 : player.xp / need, PAL.red, PAL.gold2);
    text("J FIRE", 248, 16, PAL.red2, 1);
  }

  function drawEvolve() {
    rect(0, 0, W, H, "rgba(0,0,0,0.55)");
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
    text("ALTOS RESTS", 76, 58, PAL.red2, 3);
    text("SCORE " + score, 120, 94, PAL.gold2, 2);
    blinkText("R TO RETRY", 112, 128, PAL.white);
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
    else if (e.code === "KeyR") reset();
    else if (e.code === "KeyP") {
      if (mode === MODE.PLAY) {
        prevMode = mode;
        mode = MODE.PAUSE;
      } else if (mode === MODE.PAUSE) mode = prevMode;
    }
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
    else if (mode === MODE.EGG) warmEgg(9);
    else if (mode === MODE.EVOLVE) mode = MODE.PLAY;
    else if (mode === MODE.PLAY) shootFire();
  }

  function canvasPoint(e) {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * W,
      y: ((e.clientY - box.top) / box.height) * H
    };
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

  seedStars();
  reset();
  requestAnimationFrame(frame);
})();
