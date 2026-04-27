# Altos 8-Bit Quest

A separate 8-bit retro version of the Altos dragon game.

![Altos 8-Bit Quest cover](./assets/cover-art.png)

Open `index.html` in a browser.

Controls:

- Enter: start / select dragon / hatch faster / continue
- A / D or arrows on the selection screen: choose a dragon
- A / D or arrows: move
- W / Space / Arrow Up: flap / fly upward
- S / Arrow Down: fast fall
- J / X / click: fire
- P: pause
- R or RESET: restart
- Mobile: touch controls appear automatically for start/select, movement, flap, and fire

Built as a pixel-perfect HTML5 Canvas game with 320x180 game logic rendered into a sharper 640x360 buffer, nearest-neighbor scaling, fixed-step simulation, keyboard state input, and simple Web Audio chiptune effects.

Sprite sheets:

- Generated sheets live in `assets/sprites/`.
- Each sheet is 8 frames of 96x96 pixels: `idle1`, `idle2`, `run1`, `run2`, `run3`, `fly1`, `fly2`, `fire`.
- Character names are editable in `characters.js`. Replace `ALTOS 01`, `ALTOS 02`, etc. with the real names.
- The character selection screen reads directly from `characters.js`; add future dragons there after creating new sprite sheets.

Deployment:

- GitHub Pages / static hosting: publish this folder.
- Cloudflare Pages direct upload: `npx wrangler pages deploy . --project-name altos-8-bit-quest --branch main`
