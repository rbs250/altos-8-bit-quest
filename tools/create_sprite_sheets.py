from pathlib import Path
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "Altos 8-Bit Quest"
SPRITES = GAME / "assets" / "sprites"
SPRITES.mkdir(parents=True, exist_ok=True)

FRAME = 96
SHEET_COLS = 8
FRAME_NAMES = ["idle1", "idle2", "run1", "run2", "run3", "fly1", "fly2", "fire"]

SOURCES = [
    ("altos_01", ROOT / "WhatsApp Image 2026-02-22 at 23.50.57.jpeg"),
    ("altos_02", ROOT / "WhatsApp Image 2026-02-22 at 23.50.57 (1).jpeg"),
    ("altos_03", ROOT / "WhatsApp Image 2026-02-22 at 23.50.58.jpeg"),
    ("altos_04", ROOT / "WhatsApp Image 2026-02-22 at 23.50.58 (1).jpeg"),
    ("altos_05", ROOT / "WhatsApp Image 2026-02-22 at 23.50.58 (2).jpeg"),
    ("altos_06", ROOT / "WhatsApp Image 2026-02-22 at 23.50.59.jpeg"),
]


def clamp(value, lo=0, hi=255):
    return max(lo, min(hi, value))


def make_subject_mask(img):
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    raw = Image.new("L", (w, h), 0)
    rp = raw.load()

    for y in range(h):
        yn = y / h
        for x in range(w):
            r, g, b = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx

            blue_body = b > 68 and g > 54 and b >= r * 0.78 and sat > 0.13
            red_detail = r > 98 and sat > 0.20 and b < 178
            gold_detail = r > 112 and g > 72 and b < 145 and sat > 0.16
            bright_detail = mx > 176 and sat > 0.22
            keep = blue_body or red_detail or gold_detail or bright_detail

            # The source images include blue-white floor glows and circular rings.
            # Avoid keeping broad, low-saturation lower-image highlights as seeds.
            lower_low_sat_glow = yn > 0.58 and mx > 70 and sat < 0.28
            white_ring = yn > 0.62 and mx > 150 and sat < 0.36
            if lower_low_sat_glow or white_ring:
                keep = red_detail or gold_detail or (blue_body and sat > 0.26)
            if yn > 0.70:
                keep = (blue_body and sat > 0.40 and mx > 76) or (red_detail and yn < 0.77)

            if keep:
                score = max((sat - 0.10) / 0.45, (mx - 42) / 170)
                rp[x, y] = int(clamp(score * 255))

    # Grow the saturated dragon-color seeds to capture adjacent belly, claws,
    # highlights, and internal antialiasing without bringing back the stage.
    raw = raw.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.2))
    return raw


def trim_transparent(img):
    bbox = img.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def strip_floor_pixels(img):
    px = img.load()
    w, h = img.size
    for y in range(int(h * 0.72), h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx
            dragon_color = (
                (b > 72 and g > 50 and sat > 0.22) or
                (r > 100 and sat > 0.24 and b < 180) or
                (r > 115 and g > 72 and b < 145)
            )
            if not dragon_color and mx > 44:
                px[x, y] = (0, 0, 0, 0)
    return img


def make_base_sprite(src):
    img = Image.open(src).convert("RGBA")
    mask = make_subject_mask(img)
    img.putalpha(mask)
    img = trim_transparent(img)

    padded = Image.new("RGBA", (img.width + 96, img.height + 96), (0, 0, 0, 0))
    padded.alpha_composite(img, (48, 48))

    scale = min(86 / padded.width, 86 / padded.height)
    size = (max(1, int(padded.width * scale)), max(1, int(padded.height * scale)))
    small = padded.resize(size, Image.Resampling.LANCZOS)

    alpha = small.getchannel("A").point(lambda a: 0 if a < 34 else 255)
    quantized = small.convert("RGB").quantize(colors=40, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(alpha)
    return trim_transparent(strip_floor_pixels(quantized))


def shear(sprite, amount):
    w, h = sprite.size
    pad = int(abs(amount) * h) + 4
    out = Image.new("RGBA", (w + pad * 2, h), (0, 0, 0, 0))
    for y in range(h):
        shift = int((y - h * 0.55) * amount)
        row = sprite.crop((0, y, w, y + 1))
        out.alpha_composite(row, (pad + shift, y))
    return trim_transparent(out)


def bob(sprite, dx=0, dy=0, sx=1.0, sy=1.0):
    w = max(1, int(sprite.width * sx))
    h = max(1, int(sprite.height * sy))
    return sprite.resize((w, h), Image.Resampling.NEAREST), dx, dy


def fit_frame(sprite, dx=0, dy=0):
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    x = (FRAME - sprite.width) // 2 + dx
    y = FRAME - sprite.height - 5 + dy
    frame.alpha_composite(sprite, (x, y))
    return frame


def draw_pixel_rect(frame, x, y, w, h, color):
    px = frame.load()
    for yy in range(max(0, y), min(FRAME, y + h)):
        for xx in range(max(0, x), min(FRAME, x + w)):
                px[xx, yy] = color


def add_pixel_outline(frame):
    alpha = frame.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return frame
    bottom = bbox[3] - 1
    ap = alpha.load()
    out = frame.copy()
    px = out.load()
    outline = (8, 13, 34, 235)

    for y in range(FRAME):
        for x in range(FRAME):
            if ap[x, y] != 0:
                continue
            if y >= bottom and y > int(FRAME * 0.62):
                continue
            neighbor = False
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < FRAME and 0 <= ny < FRAME and ap[nx, ny] > 0:
                    neighbor = True
                    break
            if neighbor:
                px[x, y] = outline

    return out


def trim_baseline_shadow(frame):
    return frame


def clear_lower_reference_art(frame, start_y):
    px = frame.load()
    for y in range(start_y, FRAME):
        for x in range(FRAME):
            if px[x, y][3] > 0:
                px[x, y] = (0, 0, 0, 0)
    return frame


def remove_floor_art(frame):
    # Remove low floor/ring pixels from the reference image without treating
    # the dragon's feet, claws, or tail as floor.
    px = frame.load()
    for y in range(int(FRAME * 0.66), FRAME):
        for x in range(FRAME):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx

            blue_body = b > 78 and g > 38 and b >= r * 0.92 and sat > 0.62 and y < int(FRAME * 0.79)
            purple_shadow = b > 62 and r > 35 and sat > 0.58 and b >= g and y < int(FRAME * 0.78)
            red_tail = r > 95 and sat > 0.52 and b < 165 and y < int(FRAME * 0.76)
            keep_dragon = blue_body or purple_shadow or red_tail

            floor_glow = b >= r and mx < 140 and sat < 0.70
            gold_ring = r > 115 and g > 70 and b < 175
            white_gem = mx > 165 and sat < 0.45
            bottom_speck = y > int(FRAME * 0.78) and not keep_dragon

            if (floor_glow or gold_ring or white_gem or bottom_speck) and not keep_dragon:
                px[x, y] = (0, 0, 0, 0)

    alpha = frame.getchannel("A")
    ap = alpha.load()
    visited = set()
    remove = set()
    for y in range(int(FRAME * 0.68), FRAME):
        for x in range(FRAME):
            if ap[x, y] == 0 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            points = []
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                cx, cy = stack.pop()
                points.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < FRAME and 0 <= ny < FRAME and ap[nx, ny] and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            bw = max_x - min_x + 1
            bh = max_y - min_y + 1
            if min_y > int(FRAME * 0.72) and (bw > 18 or bh <= 5 or len(points) < 36):
                remove.update(points)

    for x, y in remove:
        px[x, y] = (0, 0, 0, 0)
    return frame


def add_leg_marks(frame, phase):
    draw_leg_pair(frame, phase, flying=False)
    return frame


def add_idle_feet(frame):
    draw_leg_pair(frame, 1, flying=False)
    return frame


def add_flying_legs(frame):
    draw_leg_pair(frame, 1, flying=True)
    return frame


def draw_leg_pair(frame, phase, flying=False):
    bbox = frame.getchannel("A").getbbox()
    if not bbox:
        return

    min_x, _, max_x, max_y = bbox
    w = max_x - min_x
    base_y = min(FRAME - 5, max_y + (1 if flying else 4))
    hip_y = max(max_y - 3, int(FRAME * 0.58))
    stride = [-3, 2, 4][phase % 3]
    left_x = int(min_x + w * 0.48) - stride
    right_x = int(min_x + w * 0.66) + stride // 2

    dark = (8, 13, 34, 255)
    blue = (26, 74, 178, 255)
    cyan = (72, 195, 228, 255)
    purple = (49, 34, 91, 255)
    claw = (245, 234, 210, 255)

    if flying:
        draw_pixel_rect(frame, left_x - 1, hip_y, 4, 5, dark)
        draw_pixel_rect(frame, left_x, hip_y, 2, 4, purple)
        draw_pixel_rect(frame, right_x - 1, hip_y + 1, 4, 4, dark)
        draw_pixel_rect(frame, right_x, hip_y + 1, 2, 3, blue)
        return

    for x, color, toe_dir in ((left_x, purple, -1), (right_x, blue, 1)):
        draw_pixel_rect(frame, x - 1, hip_y, 4, base_y - hip_y, dark)
        draw_pixel_rect(frame, x, hip_y, 2, max(2, base_y - hip_y), color)
        draw_pixel_rect(frame, x + 1, hip_y + 1, 1, max(1, base_y - hip_y - 2), cyan)
        draw_pixel_rect(frame, x + toe_dir, base_y, 4, 1, dark)
        draw_pixel_rect(frame, x + toe_dir + 1, base_y, 2, 1, claw)


def add_wing_marks(frame, high):
    cyan = (123, 232, 255, 120)
    if high:
        draw_pixel_rect(frame, 23, 20, 18, 2, cyan)
    else:
        draw_pixel_rect(frame, 20, 46, 20, 2, cyan)
    return frame


def add_fire(frame):
    flame = [
        (70, 36, 7, 5, (255, 248, 190, 255)),
        (76, 34, 11, 8, (255, 138, 70, 255)),
        (86, 36, 7, 6, (232, 63, 95, 255)),
        (92, 37, 4, 3, (247, 198, 74, 255)),
    ]
    for x, y, w, h, c in flame:
        draw_pixel_rect(frame, x, y, w, h, c)
    return frame


def make_frame(base, dx=0, dy=0, sx=1.0, sy=1.0, skew=0.0, run_phase=None, wing=None, fire=False):
    spr, dx, dy = bob(base, dx, dy, sx, sy)
    if skew:
        spr = shear(spr, skew)
    frame = fit_frame(spr, dx, dy)
    frame = remove_floor_art(frame)
    frame = trim_baseline_shadow(frame)
    frame = clear_lower_reference_art(frame, int(FRAME * (0.72 if wing is not None else 0.76)))
    frame = add_pixel_outline(frame)
    if run_phase is not None:
        frame = add_leg_marks(frame, run_phase)
    elif wing is not None:
        frame = add_flying_legs(frame)
    else:
        frame = add_idle_feet(frame)
    if wing is not None:
        frame = add_wing_marks(frame, wing)
    if fire:
        frame = add_fire(frame)
    return frame


def make_sheet(src_id, src_path):
    base = make_base_sprite(src_path)
    frames = [
        make_frame(base, 0, 0),
        make_frame(base, 0, -1, 1.0, 1.02),
        make_frame(base, -2, 1, 1.02, 0.96, -0.08, run_phase=0),
        make_frame(base, 1, 0, 0.98, 1.03, 0.05, run_phase=1),
        make_frame(base, 3, 1, 1.03, 0.96, 0.10, run_phase=2),
        make_frame(base, 0, -8, 1.04, 0.98, -0.08, wing=True),
        make_frame(base, 0, -4, 1.02, 1.0, 0.08, wing=False),
        make_frame(base, 0, -2, 1.02, 1.0, fire=True),
    ]
    sheet = Image.new("RGBA", (FRAME * SHEET_COLS, FRAME), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * FRAME, 0))
    out = SPRITES / f"{src_id}_sheet.png"
    sheet.save(out)
    return out


if __name__ == "__main__":
    for src_id, src_path in SOURCES:
        out = make_sheet(src_id, src_path)
        print(out.relative_to(GAME))
