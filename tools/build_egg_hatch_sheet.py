from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent / "preview.jpeg"
OUT = ROOT / "assets" / "sprites" / "egg_hatch_sheet.png"
VERIFY = ROOT / "verification-egg-hatch-sheet.png"
GIF = ROOT / "verification-egg-hatch.gif"
CUTOUT_VERIFY = ROOT / "verification-egg-cutout.png"

FRAME = 128
FRAMES = 14
GAME_BG = (17, 26, 51, 255)

COL = {
    "white": (255, 248, 214, 255),
    "blue": (43, 183, 255, 255),
    "blue2": (123, 232, 255, 255),
    "gold": (247, 198, 74, 255),
    "gold2": (255, 230, 154, 255),
    "purple": (106, 79, 227, 255),
    "shadow": (5, 8, 18, 145),
}


def extract_reference_egg():
    src = Image.open(SRC).convert("RGB")
    if src.size != (512, 512):
        src = src.resize((512, 512), Image.Resampling.LANCZOS)

    arr = np.asarray(src).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114
    yy, xx = np.mgrid[0:512, 0:512]

    ellipse = (((xx - 256) / 205) ** 2 + ((yy - 242) / 245) ** 2) < 1.08
    bright_subject = (mx > 54) & ((sat > 12) | (luma > 72))
    jewel_detail = ((b > 72) | (g > 72) | (r > 92)) & (mx > 48) & (sat > 18)
    mask_np = ellipse & (yy < 435) & (bright_subject | jewel_detail)

    mask = Image.fromarray((mask_np * 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MaxFilter(9))
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    mask = mask.point(lambda p: 255 if p > 28 else 0)

    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("No egg foreground extracted")

    pad = 10
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(512, bbox[2] + pad)
    bottom = min(512, bbox[3] + pad)

    cut = src.crop((left, top, right, bottom)).convert("RGBA")
    cut.putalpha(mask.crop((left, top, right, bottom)))
    cut = fit_reference(cut)
    cut.save(CUTOUT_VERIFY)
    return cut


def fit_reference(cut):
    max_w, max_h = 102, 118
    scale = min(max_w / cut.width, max_h / cut.height)
    size = (max(1, round(cut.width * scale)), max(1, round(cut.height * scale)))
    cut = cut.resize(size, Image.Resampling.LANCZOS)

    alpha = cut.getchannel("A")
    rgb = ImageEnhance.Color(cut.convert("RGB")).enhance(1.28)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.14)
    cut = rgb.convert("RGBA")
    cut.putalpha(alpha)

    base = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    base.alpha_composite(cut, ((FRAME - cut.width) // 2, 6))
    return base


def jagged_split(xx):
    return 66 + np.select(
        [xx < 28, xx < 42, xx < 56, xx < 70, xx < 84, xx < 100],
        [-2, 6, -5, 7, -4, 5],
        default=-1,
    )


def alpha_part(img, predicate):
    alpha = np.array(img.getchannel("A"))
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    out_alpha = np.where(predicate(xx, yy), alpha, 0).astype(np.uint8)
    out = img.copy()
    out.putalpha(Image.fromarray(out_alpha, "L"))
    return out


def open_bottom_piece(img, amount):
    alpha = np.array(img.getchannel("A")).astype(np.float32)
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    rx = 8 + 22 * amount
    ry = 5 + 15 * amount
    cx = 64
    cy = 63 + 7 * amount
    opening = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) < 1.0
    jag = yy < 76 + np.sin(xx * 0.45) * 4
    alpha[opening & jag] *= max(0.0, 1.0 - amount * 1.35)
    out = img.copy()
    out.putalpha(Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8), "L"))
    return out


def draw_cracks(draw, amount):
    if amount <= 0:
        return
    color = COL["gold2"] if amount < 0.68 else COL["white"]
    width = 1 if amount < 0.82 else 2
    paths = [
        [(35, 62), (44, 67), (53, 61), (63, 68), (73, 62), (84, 68), (94, 62)],
        [(64, 27), (60, 39), (65, 51), (61, 64)],
        [(45, 45), (39, 52), (41, 62), (32, 70)],
        [(79, 43), (88, 51), (86, 61), (95, 70)],
    ]
    for index, points in enumerate(paths):
        if amount > 0.16 + index * 0.17:
            steps = max(2, min(len(points), int(2 + amount * (len(points) - 1))))
            draw.line(points[:steps], fill=color, width=width)


def draw_inner_light(draw, amount):
    if amount <= 0:
        return
    alpha = int(95 + 135 * amount)
    blocks = [
        (42, 58, 44, 24, (123, 232, 255, alpha)),
        (49, 48, 29, 34, (255, 248, 214, max(70, alpha - 45))),
        (57, 54, 17, 27, (43, 183, 255, min(255, alpha + 10))),
        (39, 72, 50, 9, (20, 120, 210, max(60, alpha - 50))),
    ]
    for x, y, w, h, color in blocks:
        draw.rectangle((x, y, x + w, y + h), fill=color)


def draw_fragments(draw, amount):
    if amount <= 0:
        return
    colors = [COL["blue2"], COL["blue"], COL["gold2"], COL["gold"], COL["purple"], COL["white"]]
    for index in range(14):
        if amount < index / 20:
            continue
        angle = -2.75 + index * 0.42
        radius = 6 + (index * 5) % 22
        x = 64 + math.cos(angle) * radius * amount
        y = 63 + math.sin(angle) * radius * amount - 14 * amount + (index % 3) * amount
        x = max(11, min(FRAME - 12, x))
        y = max(10, min(FRAME - 13, y))
        size = 2 + (index % 3)
        color = colors[index % len(colors)]
        if index % 2:
            draw.polygon([(x, y - size), (x + size, y), (x, y + size), (x - size, y)], fill=color)
        else:
            draw.rectangle((x - 1, y - 1, x + size, y + 1), fill=color)


def pixel_grade(img):
    small = img.resize((104, 104), Image.Resampling.LANCZOS)
    alpha = small.getchannel("A")
    rgb = small.convert("RGB").quantize(colors=56, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    alpha = alpha.point(lambda p: 0 if p < 16 else (255 if p > 218 else p))
    rgb.putalpha(alpha)
    return rgb.resize((FRAME, FRAME), Image.Resampling.NEAREST)


def clear_border_alpha(img):
    alpha = np.array(img.getchannel("A"))
    alpha[0:3, :] = 0
    alpha[-3:, :] = 0
    alpha[:, 0:3] = 0
    alpha[:, -3:] = 0
    img.putalpha(Image.fromarray(alpha.astype(np.uint8), "L"))
    return img


def compose_frame(base, top_part, bottom_part, index):
    progress = index / (FRAMES - 1)
    crack = min(1, max(0, (progress - 0.07) / 0.42))
    open_amount = min(1, max(0, (progress - 0.43) / 0.50))
    burst = min(1, max(0, (progress - 0.50) / 0.42))

    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    draw.rectangle((31, 111, 98, 116), fill=COL["shadow"])
    draw.rectangle((39, 117, 90, 120), fill=(5, 8, 18, 85))

    if open_amount <= 0:
        frame.alpha_composite(base)
    else:
        draw_inner_light(draw, open_amount)
        frame.alpha_composite(open_bottom_piece(bottom_part, open_amount))
        top = top_part.rotate(
            -15 * open_amount,
            resample=Image.Resampling.BICUBIC,
            center=(64, 68),
            fillcolor=(0, 0, 0, 0),
        )
        if open_amount > 0.72:
            fade = max(0.42, 1.15 - open_amount * 0.55)
            top.putalpha(top.getchannel("A").point(lambda value: int(value * fade)))
        frame.alpha_composite(top, (int(-10 * open_amount), int(-16 * open_amount)))

    draw = ImageDraw.Draw(frame)
    draw_cracks(draw, crack)
    draw_fragments(draw, burst)

    if progress > 0.12:
        for spark in range(10):
            angle = spark * 0.73 + index * 0.33
            radius = 43 + (spark % 4) * 5 + progress * 6
            x = max(8, min(120, 64 + math.cos(angle) * radius))
            y = max(8, min(120, 63 + math.sin(angle * 1.2) * (31 + progress * 3)))
            color = COL["gold2"] if spark % 2 else COL["blue2"]
            draw.rectangle((x, y, x + 1, y + 1), fill=color)

    return clear_border_alpha(pixel_grade(frame))


def write_outputs(frames):
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        bbox = frame.getchannel("A").getbbox()
        if bbox and (bbox[0] <= 2 or bbox[1] <= 2 or bbox[2] >= FRAME - 2 or bbox[3] >= FRAME - 2):
            raise RuntimeError(f"Frame {index} still touches bounds: {bbox}")
        sheet.alpha_composite(frame, (index * FRAME, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)

    preview = Image.new("RGBA", (FRAME * 7, FRAME * 2), GAME_BG)
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame, ((index % 7) * FRAME, (index // 7) * FRAME))
    preview.save(VERIFY)

    gif_frames = []
    for frame in frames:
        bg = Image.new("RGBA", (FRAME, FRAME), GAME_BG)
        bg.alpha_composite(frame)
        big = bg.resize((FRAME * 3, FRAME * 3), Image.Resampling.NEAREST)
        gif_frames.append(big.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
    gif_frames[0].save(GIF, save_all=True, append_images=gif_frames[1:], duration=92, loop=0, disposal=2)
    print(f"sheet={OUT} size={sheet.size}")
    print(f"verify={VERIFY}")
    print(f"gif={GIF}")


def main():
    base = extract_reference_egg()
    top_part = alpha_part(base, lambda xx, yy: yy <= jagged_split(xx))
    bottom_part = alpha_part(base, lambda xx, yy: yy > jagged_split(xx))
    frames = [compose_frame(base, top_part, bottom_part, index) for index in range(FRAMES)]
    write_outputs(frames)


if __name__ == "__main__":
    main()
