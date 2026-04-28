from pathlib import Path
from collections import defaultdict, deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\rbens\Downloads\ChatGPT Image Apr 28, 2026, 08_26_07 AM.png")
OUT_DIR = PROJECT / "assets" / "sprites"

MASTER_COPY = OUT_DIR / "altos_young_reference_sheet.png"
TRANSPARENT_ATLAS = OUT_DIR / "altos_young_pose_atlas.png"
GAME_SHEET = OUT_DIR / "altos_02_sheet.png"
VERIFY = PROJECT / "verification-altos-young-provided-extract.png"

CELL = 160
GAME_FRAME = 128
GAME_COLS = 8
ROWS = [
    ("Idle", 4, 82),
    ("Attack", 6, 260),
    ("Hurt", 3, 425),
    ("Dead", 2, 425),
    ("Flight", 7, 620),
    ("Jump", 5, 790),
    ("Walk", 6, 942),
]
GAME_PICK = [
    ("Idle", 0),
    ("Idle", 1),
    ("Walk", 0),
    ("Walk", 2),
    ("Walk", 4),
    ("Flight", 0),
    ("Flight", 2),
    ("Attack", 4),
]


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def components(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps = []
    label = 0
    ys, xs = np.where(mask)
    for sx, sy in zip(xs, ys):
        if labels[sy, sx]:
            continue
        label += 1
        q = deque([(int(sx), int(sy))])
        labels[sy, sx] = label
        area = 0
        left = right = int(sx)
        top = bottom = int(sy)
        while q:
            x, y = q.popleft()
            area += 1
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if nx == x and ny == y:
                        continue
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        q.append((nx, ny))
        comps.append({"label": label, "area": area, "bbox": (left, top, right + 1, bottom + 1)})
    return labels, comps


def source_mask(src):
    arr = np.asarray(src).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114

    blue = (b > 82) & (g > 72) & (b > r * 0.75) & (sat > 22)
    red = (r > 100) & (r > g * 1.18) & (r > b * 0.92) & (sat > 32)
    gold = (r > 150) & (g > 100) & (r > b * 1.1) & (sat > 35)
    dark_outline = (luma < 92) & (sat > 15)
    fire = (r > 170) & (g > 70) & (b < 110) & (sat > 70)
    mask = blue | red | gold | dark_outline | fire

    # Exclude the white row labels and watermark-like gray diagonal noise.
    mask &= ~((r > 210) & (g > 210) & (b > 210))
    mask &= ~(sat < 16)

    img = Image.fromarray((mask * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.MaxFilter(7))
    img = img.filter(ImageFilter.MinFilter(3))
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img = img.point(lambda p: 255 if p > 20 else 0)
    return img


def merged_sprite_boxes(src):
    mask_img = source_mask(src)
    labels, comps = components(np.asarray(mask_img) > 0)
    boxes = []
    for comp in comps:
        left, top, right, bottom = comp["bbox"]
        width = right - left
        height = bottom - top
        if comp["area"] < 900:
            continue
        if width < 35 or height < 35:
            continue
        if left < 110 and width < 120:
            continue
        boxes.append(comp["bbox"])

    mask_np = np.asarray(mask_img) > 0
    split_boxes = []
    for box in boxes:
        left, top, right, bottom = box
        width = right - left
        if top < 330 and width > 260:
            cols = mask_np[top:bottom, left:right].sum(axis=0)
            start = 140
            end = width - 70
            if end > start:
                smooth = np.convolve(cols, np.ones(13), mode="same")
                cut_local = start + int(np.argmin(smooth[start:end]))
                if smooth[cut_local] < 700:
                    split_boxes.append((left, top, left + cut_local, bottom))
                    split_boxes.append((left + cut_local, top, right, bottom))
                    continue
        split_boxes.append(box)
    boxes = split_boxes

    return boxes, mask_img


def classify_boxes(boxes):
    buckets = defaultdict(list)
    for box in boxes:
        left, top, right, bottom = box
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        if cx < 130:
            continue
        row_name = min(ROWS, key=lambda row: abs(row[2] - cy))[0]
        if row_name == "Hurt" and cx > 850:
            row_name = "Dead"
        buckets[row_name].append(box)
    for row_name in buckets:
        buckets[row_name].sort(key=lambda box: box[0])
        row_boxes = buckets[row_name]
        for index in range(len(row_boxes) - 1):
            left, top, right, bottom = row_boxes[index]
            next_left, next_top, next_right, next_bottom = row_boxes[index + 1]
            if next_left - right < 8:
                mid = (right + next_left) // 2
                row_boxes[index] = (left, top, mid, bottom)
                row_boxes[index + 1] = (mid + 1, next_top, next_right, next_bottom)
    if len(buckets.get("Attack", [])) >= 6:
        buckets["Attack"] = buckets["Attack"][:4] + [
            (905, 187, 1188, 310),
            (1196, 187, 1295, 310),
        ]
    return buckets


def clean_sprite(sprite):
    alpha = np.asarray(sprite.getchannel("A")) > 0
    labels, comps = components(alpha)
    if not comps:
        return sprite
    main = max(comps, key=lambda comp: comp["area"])
    ml, mt, mr, mb = main["bbox"]
    keep = np.zeros(alpha.shape, dtype=bool)
    for comp in comps:
        left, top, right, bottom = comp["bbox"]
        near_main = not (right < ml - 24 or left > mr + 95 or bottom < mt - 30 or top > mb + 30)
        if comp["label"] == main["label"] or (comp["area"] >= 500 and near_main):
            keep |= labels == comp["label"]
    cleaned = sprite.copy()
    cleaned.putalpha(Image.fromarray((keep * 255).astype(np.uint8), "L"))
    return cleaned


def crop_sprite(src, mask_img, box, pad=0):
    left, top, right, bottom = box
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(src.width, right + pad)
    bottom = min(src.height, bottom + pad)
    crop = src.crop((left, top, right, bottom)).convert("RGBA")
    alpha = mask_img.crop((left, top, right, bottom))
    alpha = alpha.filter(ImageFilter.MaxFilter(3))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.45))
    alpha = alpha.point(lambda p: 0 if p < 16 else (255 if p > 188 else p))
    crop.putalpha(alpha)
    return clean_sprite(crop)


def fit_to_cell(sprite, cell=CELL):
    bbox = sprite.getchannel("A").getbbox()
    if not bbox:
        return Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    sprite = sprite.crop(bbox)
    max_w = cell - 16
    max_h = cell - 16
    scale = min(max_w / sprite.width, max_h / sprite.height)
    sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.alpha_composite(sprite, ((cell - sprite.width) // 2, cell - sprite.height - 6))
    return out


def write_reference(src):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src.save(MASTER_COPY)


def write_atlas(buckets, src, mask_img):
    atlas_rows = ROWS
    atlas = Image.new("RGBA", (CELL * GAME_COLS, CELL * len(atlas_rows)), (0, 0, 0, 0))
    frames = {}
    for row_i, (row_name, expected, _) in enumerate(atlas_rows):
        row_boxes = buckets[row_name][:expected]
        frames[row_name] = []
        for col_i, box in enumerate(row_boxes):
            frame = fit_to_cell(crop_sprite(src, mask_img, box), CELL)
            frames[row_name].append(frame)
            atlas.alpha_composite(frame, (col_i * CELL, row_i * CELL))
    atlas.save(TRANSPARENT_ATLAS)
    return frames


def write_game_sheet(frames):
    sheet = Image.new("RGBA", (GAME_FRAME * GAME_COLS, GAME_FRAME), (0, 0, 0, 0))
    for index, (row_name, frame_index) in enumerate(GAME_PICK):
        frame = frames[row_name][frame_index]
        bbox = frame.getchannel("A").getbbox()
        if bbox:
            sprite = frame.crop(bbox)
            scale = min(118 / sprite.width, 118 / sprite.height)
            sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.Resampling.LANCZOS)
            cell = Image.new("RGBA", (GAME_FRAME, GAME_FRAME), (0, 0, 0, 0))
            cell.alpha_composite(sprite, ((GAME_FRAME - sprite.width) // 2, GAME_FRAME - sprite.height - 5))
            sheet.alpha_composite(cell, (index * GAME_FRAME, 0))
    sheet.save(GAME_SHEET)


def write_verify(src, buckets, frames):
    scale = 0.5
    verify = src.copy().convert("RGBA")
    draw = ImageDraw.Draw(verify, "RGBA")
    colors = {
        "Idle": (40, 210, 255, 220),
        "Attack": (255, 120, 70, 220),
        "Hurt": (255, 220, 80, 220),
        "Dead": (180, 120, 255, 220),
        "Flight": (80, 255, 150, 220),
        "Jump": (255, 80, 180, 220),
        "Walk": (255, 255, 255, 220),
    }
    small_font = font(18, True)
    for row_name, row_boxes in buckets.items():
        for index, box in enumerate(row_boxes):
            color = colors.get(row_name, (255, 255, 255, 220))
            draw.rectangle(box, outline=color, width=3)
            draw.text((box[0], max(0, box[1] - 20)), f"{row_name} {index}", font=small_font, fill=color)

    thumb_h = 180
    thumbs = Image.new("RGBA", (GAME_FRAME * GAME_COLS, thumb_h), (17, 26, 51, 255))
    game = Image.open(GAME_SHEET).convert("RGBA")
    for i in range(GAME_COLS):
        thumbs.alpha_composite(game.crop((i * GAME_FRAME, 0, (i + 1) * GAME_FRAME, GAME_FRAME)), (i * GAME_FRAME, 32))
    preview = verify.resize((round(verify.width * scale), round(verify.height * scale)), Image.Resampling.LANCZOS)
    combined = Image.new("RGBA", (max(preview.width, thumbs.width), preview.height + thumb_h), (17, 26, 51, 255))
    combined.alpha_composite(preview, (0, 0))
    combined.alpha_composite(thumbs, (0, preview.height))
    combined.save(VERIFY)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    src = Image.open(SOURCE).convert("RGB")
    write_reference(src)
    boxes, mask_img = merged_sprite_boxes(src)
    buckets = classify_boxes(boxes)
    expected = {row: count for row, count, _ in ROWS}
    for row_name, count in expected.items():
        got = len(buckets.get(row_name, []))
        if got < count:
            raise RuntimeError(f"Only found {got} frames for {row_name}; expected {count}")
    frames = write_atlas(buckets, src, mask_img)
    write_game_sheet(frames)
    write_verify(src, buckets, frames)
    print(f"master={MASTER_COPY}")
    print(f"atlas={TRANSPARENT_ATLAS}")
    print(f"game={GAME_SHEET}")
    print(f"verify={VERIFY}")


if __name__ == "__main__":
    main()
