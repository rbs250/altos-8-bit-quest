# Altos 8-Bit Quest

A separate 8-bit retro version of the Altos dragon game.

![Altos 8-Bit Quest cover](./assets/cover-art.png)

Open `index.html` in a browser.

Controls:

- Enter: start / select dragon / hatch faster / continue
- A / D or arrows on the selection screen: preview locked future dragon slots
- A / D or arrows: move
- W / Space / Arrow Up: flap / fly upward
- S / Arrow Down: fast fall
- J / X / click: fire
- P: pause
- R or RESET: restart
- Mobile: an on-screen arrow keyboard appears automatically for movement, flying, start/select, and fire

Built as a pixel-perfect HTML5 Canvas game with 320x180 game logic rendered into a sharper 640x360 buffer, nearest-neighbor scaling, fixed-step simulation, keyboard state input, and simple Web Audio chiptune effects.

The hatch sequence uses a custom 14-frame transparent 8-bit egg sprite sheet inspired by the jeweled turquoise-and-gold reference egg.

Dragon sprites:

- Generated sheets live in `assets/sprites/`.
- `assets/sprites/altos_01_atlas.png` through `altos_06_atlas.png` are the playable 160x160 full animation atlases, with `Idle`, `Attack`, `Hurt`, `Dead`, `Flight`, `Jump`, and `Walk` rows.
- `assets/sprites/altos_01_sheet.png` through `altos_06_sheet.png` are 8-frame 128x128 fallback strips generated from the same cleaned atlas frames.
- `tools/build_all_atlases.py` rebuilds every atlas from `assets/sprite-source/` with label removal, floor-glow cleanup, fixed per-character scale, and stable bottom anchors.
- The current character selection screen shows Altos plus silhouette placeholders for future dragons. Add the nephews' and nieces' dragons later as separate selectable characters after their visuals exist.

Deployment:

- GitHub Pages: enable Pages for this repo from the `main` branch and `/` root.
- Cloudflare Pages direct upload: `npx wrangler pages deploy . --project-name altos-8-bit-quest --branch main`
