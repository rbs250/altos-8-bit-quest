from pathlib import Path
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT.parent
OUT_DIR = PROJECT / "assets" / "sprites"
VERIFY = PROJECT / "verification-dragon-sheets-v3.png"

FRAME = 128
COLS = 8
BG = (17, 26, 51, 255)

SOURCES = [
    ("altos_01", "WhatsApp Image 2026-02-22 at 23.50.57 (1).jpeg", "ALTOS HATCHLING", 384),
    ("altos_02", "WhatsApp Image 2026-02-22 at 23.50.57.jpeg", "ALTOS YOUNG", 392),
    ("altos_03", "WhatsApp Image 2026-02-22 at 23.50.58.jpeg", "ALTOS WINGED", 402),
    ("altos_04", "WhatsApp Image 2026-02-22 at 23.50.58 (1).jpeg", "ALTOS GUARDIAN", 404),
    ("altos_05", "WhatsApp Image 2026-02-22 at 23.50.58 (2).jpeg", "ALTOS SKY LORD", 414),
    ("altos_06", "WhatsApp Image 2026-02-22 at 23.50.59.jpeg", "ALTOS ANCIENT", 410),
]

FRAME_LABELS = ["IDLE 1", "IDLE 2", "RUN 1", "RUN 2", "RUN 3", "FLY 1", "FLY 2", "FIRE"]

try:
    from scipy import ndimage as ndi
except Exception:  # pragma: no cover - only used when scipy is unavailable.
    ndi = None


def normalize_source(path):
    img = Image.open(path).convert("RGB")
    if img.size != (512, 512):
        img = img.resize((512, 512), Image.Resampling.LANCZOS)
    img = ImageEnhance.Color(img).enhance(1.08)
    img = ImageEnhance.Contrast(img).enhance(1.07)
    return img


def label_components(mask_np):
    if ndi is not None:
        labels, count = ndi.label(mask_np)
        comps = []
        for label in range(1, count + 1):
            ys, xs = np.where(labels == label)
            if xs.size:
                comps.append((xs.size, int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1, label))
        return labels, comps

    labels = np.zeros(mask_np.shape, dtype=np.int32)
    h, w = mask_np.shape
    comps = []
    label = 0
    for sy, sx in zip(*np.where(mask_np)):
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
                    if mask_np[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        q.append((nx, ny))
        comps.append((area, left, top, right + 1, bottom + 1, label))
    return labels, comps


def foreground_mask(src, floor_clip):
    arr = np.asarray(src).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114
    yy, xx = np.mgrid[0:512, 0:512]

    blue = (b > 54) & (g > 45) & (b > r * 0.78) & (g > r * 0.50) & (sat > 18)
    cyan = (g > 74) & (b > 84) & (sat > 14)
    red = (r > 70) & (r > g * 1.12) & (r > b * 0.82) & (sat > 24)
    gold = (r > 92) & (g > 64) & (r > b * 1.04) & (sat > 24)
    belly = (r > 95) & (g > 90) & (b > 72) & (luma > 94) & (yy < 392)
    highlights = (luma > 118) & (sat > 10) & (yy < 405)

    mask_np = (blue | cyan | red | gold | belly | highlights) & (mx > 42) & (yy < 448)

    # Strip stage lamps and floor glow while leaving claws/tail pixels for the component pass.
    floor_glow = (yy > 392) & (
        ((luma > 86) & (sat < 56))
        | ((b > 115) & (g > 105) & (r < 95))
        | ((r > 118) & (g > 92) & (b < 115))
    )
    mask_np &= ~floor_glow

    # The reference photos all have glowing circular floor props. They form long
    # horizontal rows that are visually unrelated to the dragon and should never
    # become part of the sprite sheet.
    row_counts = mask_np.sum(axis=1)
    wide_floor_rows = ((yy > 304) & (row_counts[:, None] > 118)) | ((yy > 342) & (row_counts[:, None] > 78))
    floor_row_pixel = ((luma < 88) & (sat < 68)) | ((yy > 362) & (luma > 92) & (sat < 72))
    mask_np &= ~(wide_floor_rows & floor_row_pixel)
    mask_np &= ~((yy > 312) & (luma < 98) & (sat < 78))
    mask_np &= ~(yy > floor_clip)

    mask = Image.fromarray((mask_np * 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(0.65))
    mask = mask.point(lambda p: 255 if p > 30 else 0)
    mask_np = np.asarray(mask) > 0

    labels, comps = label_components(mask_np)
    if not comps:
        raise RuntimeError("No dragon foreground found")

    def score(comp):
        area, left, top, right, bottom, _ = comp
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        central = 1.0 - min(0.75, abs(cx - 256) / 360 + abs(cy - 248) / 420)
        bottom_penalty = 0.22 if top > 340 and bottom > 396 else 1.0
        short_penalty = 0.35 if (bottom - top) < 45 else 1.0
        return area * central * bottom_penalty * short_penalty

    main = max(comps, key=score)
    _, ml, mt, mr, mb, main_label = main
    keep = labels == main_label

    # Keep meaningful nearby disconnected pieces, but reject floor bulbs/ring scraps.
    for area, left, top, right, bottom, label in comps:
        if label == main_label or area < 65:
            continue
        near_main = not (right < ml - 18 or left > mr + 18 or bottom < mt - 18 or top > mb + 18)
        floor_piece = top > 350 and bottom > 392 and (bottom - top) < 76
        if near_main and not floor_piece:
            keep |= labels == label

    mask = Image.fromarray((keep * 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MaxFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(0.5))
    mask = mask.point(lambda p: 255 if p > 22 else 0)
    return mask


def add_outline(frame):
    alpha = frame.getchannel("A")
    outline = alpha.filter(ImageFilter.MaxFilter(5))
    outline_np = np.asarray(outline).astype(np.int16)
    alpha_np = np.asarray(alpha).astype(np.int16)
    edge = np.clip(outline_np - alpha_np, 0, 255).astype(np.uint8)
    result = Image.new("RGBA", (FRAME, FRAME), (5, 8, 18, 0))
    result.putalpha(Image.fromarray((edge * 0.78).astype(np.uint8), "L"))
    result.alpha_composite(frame)
    return result


def pixel_grade(frame):
    alpha = frame.getchannel("A")
    rgb = frame.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.16)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.24)
    graded = rgb.convert("RGBA")
    graded.putalpha(alpha)

    small = graded.resize((112, 112), Image.Resampling.LANCZOS)
    small_alpha = small.getchannel("A").point(lambda p: 0 if p < 18 else (255 if p > 226 else p))
    small_rgb = small.convert("RGB").quantize(colors=88, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    small_rgb.putalpha(small_alpha)
    out = small_rgb.resize((FRAME, FRAME), Image.Resampling.NEAREST)

    edge = np.array(out.getchannel("A"))
    edge[:2, :] = 0
    edge[-2:, :] = 0
    edge[:, :2] = 0
    edge[:, -2:] = 0
    out.putalpha(Image.fromarray(edge, "L"))
    return out


def erase_floor_artifacts(frame):
    arr = np.array(frame).copy()
    alpha = arr[..., 3]
    rgb = arr[..., :3].astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114
    yy = np.mgrid[0:FRAME, 0:FRAME][0]

    filled = alpha > 8
    support = np.zeros_like(alpha, dtype=np.int16)
    for shift in range(5, 30):
        support[shift:, :] += filled[:-shift, :]

    row_counts = filled.sum(axis=1)
    lower_wide = (yy > 84) & (row_counts[:, None] > 48)
    floor_like = (
        ((luma < 116) & (sat < 96))
        | ((g > 92) & (b > 96) & (r < 112))
        | ((luma > 142) & (sat < 82))
    )
    thin_column = support < 7
    clear = filled & lower_wide & floor_like & thin_column
    alpha[clear] = 0
    arr[..., 3] = alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def remove_detached_floor_bits(frame):
    alpha = np.asarray(frame.getchannel("A")) > 8
    labels, comps = label_components(alpha)
    if not comps:
        return frame
    main = max(comps, key=lambda comp: comp[0])
    _, ml, mt, mr, mb, main_label = main
    keep = labels == main_label
    for area, left, top, right, bottom, label in comps:
        if label == main_label or area < 8:
            continue
        width = right - left
        height = bottom - top
        looks_like_floor_chip = top > 94 and height < 12 and (width > 6 or area < 24)
        near_main = not (right < ml - 10 or left > mr + 10 or bottom < mt - 10 or top > mb + 10)
        if near_main and not looks_like_floor_chip:
            keep |= labels == label

    cleaned = frame.copy()
    cleaned.putalpha(Image.fromarray((keep * 255).astype(np.uint8), "L"))
    return cleaned


def fit_cutout(src, mask, stage_index):
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("Empty dragon mask")

    pad = 14
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(512, bbox[2] + pad)
    bottom = min(512, bbox[3] + pad)

    cut = src.crop((left, top, right, bottom)).convert("RGBA")
    cut.putalpha(mask.crop((left, top, right, bottom)))

    max_w = 118
    max_h = 115
    # The wide adult-wing references need slightly more width and less height to keep their wings.
    if stage_index >= 4:
        max_w = 122
        max_h = 112

    scale = min(max_w / cut.width, max_h / cut.height)
    cut = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))), Image.Resampling.LANCZOS)

    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    x = (FRAME - cut.width) // 2
    y = 122 - cut.height
    if y < 4:
        y = 4
    frame.alpha_composite(cut, (x, y))
    frame = erase_floor_artifacts(frame)
    frame = remove_detached_floor_bits(frame)
    return pixel_grade(add_outline(frame))


def paste_pose(base, dx=0, dy=0, sx=1.0, sy=1.0, angle=0):
    bbox = base.getchannel("A").getbbox()
    if not bbox:
        return base.copy()
    cut = base.crop(bbox)
    w = max(1, round(cut.width * sx))
    h = max(1, round(cut.height * sy))
    cut = cut.resize((w, h), Image.Resampling.BICUBIC)
    if angle:
        cut = cut.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC, fillcolor=(0, 0, 0, 0))

    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    x = round((FRAME - cut.width) / 2 + dx)
    y = round(122 - cut.height + dy)
    x = max(2 - cut.width // 10, min(FRAME - cut.width - 2 + cut.width // 10, x))
    y = max(3, min(124 - cut.height, y))
    frame.alpha_composite(cut, (x, y))
    return pixel_grade(add_outline(frame))


def draw_fire(frame, stage_index):
    draw = ImageDraw.Draw(frame)
    y = 48 + min(stage_index, 5) * 2
    x = 96
    colors = [(232, 63, 95, 255), (255, 138, 101, 255), (255, 230, 154, 255)]
    draw.polygon([(x, y + 5), (124, y - 5), (111, y + 8), (124, y + 16)], fill=colors[0])
    draw.polygon([(x + 6, y + 5), (121, y), (111, y + 7), (121, y + 12)], fill=colors[1])
    draw.rectangle((x + 16, y + 4, x + 28, y + 7), fill=colors[2])
    draw.rectangle((x + 4, y + 3, x + 11, y + 8), fill=colors[1])
    return frame


def make_frames(base, stage_index):
    poses = [
        {},
        {"dy": -2, "sx": 1.01, "sy": 0.99},
        {"dx": -2, "dy": 1, "sx": 1.03, "sy": 0.97, "angle": -1.5},
        {"dx": 1, "dy": -2, "sx": 0.99, "sy": 1.02, "angle": 1.0},
        {"dx": 3, "dy": 0, "sx": 1.02, "sy": 0.98, "angle": -0.8},
        {"dx": -1, "dy": -7, "sx": 1.01, "sy": 1.0, "angle": -3.0},
        {"dx": 2, "dy": -11, "sx": 1.00, "sy": 1.01, "angle": 3.0},
        {"dx": -1, "dy": -4, "sx": 1.0, "sy": 1.0, "angle": -1.0},
    ]
    frames = [paste_pose(base, **pose) for pose in poses]
    frames[-1] = draw_fire(frames[-1], stage_index)
    return frames


def save_sheet(sprite_id, frames):
    sheet = Image.new("RGBA", (FRAME * COLS, FRAME), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        bbox = frame.getchannel("A").getbbox()
        if bbox and (bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= FRAME - 1 or bbox[3] >= FRAME - 1):
            raise RuntimeError(f"{sprite_id} frame {index} touches bounds: {bbox}")
        sheet.alpha_composite(frame, (index * FRAME, 0))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{sprite_id}_sheet.png"
    sheet.save(out)
    return out


def write_verification(all_frames):
    label_h = 18
    sheet = Image.new("RGBA", (FRAME * COLS, (FRAME + label_h) * len(all_frames)), BG)
    draw = ImageDraw.Draw(sheet)
    for row, (name, frames) in enumerate(all_frames):
        y = row * (FRAME + label_h)
        draw.text((5, y + 4), name, fill=(255, 230, 154, 255))
        for col, frame in enumerate(frames):
            x = col * FRAME
            if row == 0:
                draw.text((x + 5, 2), FRAME_LABELS[col], fill=(123, 232, 255, 255))
            sheet.alpha_composite(frame, (x, y + label_h))
    sheet.save(VERIFY)
    print(f"verify={VERIFY}")


def main():
    all_frames = []
    for stage_index, (sprite_id, filename, name, floor_clip) in enumerate(SOURCES):
        src_path = SOURCE_ROOT / filename
        if not src_path.exists():
            raise FileNotFoundError(src_path)
        src = normalize_source(src_path)
        mask = foreground_mask(src, floor_clip)
        base = fit_cutout(src, mask, stage_index)
        frames = make_frames(base, stage_index)
        out = save_sheet(sprite_id, frames)
        all_frames.append((name, frames))
        print(f"{sprite_id}: {out} size={(FRAME * COLS, FRAME)} source={filename}")
    write_verification(all_frames)


if __name__ == "__main__":
    main()
