"""Regenerate clean dragon sprite sheets from generated source sheets.

Guidelines encoded here:
- use the real animation poses from the source sprite sheet, not one repeated pose
- one fixed 160x160 canvas for every frame
- stable bottom anchors and per-character scale so proportions do not pop
- remove row labels, gray background, floor rings, glow scraps, and watermark noise
- keep the fighting-game look: big readable silhouette, hard pixel edges, strong outline
"""
from __future__ import annotations

from collections import deque
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


CELL = 160
COLS = 8
SAFE_MARGIN = 7
LABEL_WIPE_X = 135
ALPHA_THRESHOLD = 16
MIN_COMPONENT_AREA = 450

ROW_LABELS = ["idle", "attack", "hurt", "dead", "flight", "jump", "walk"]
ROW_BAND_CANDIDATES = {
    "idle": [(0, 170, 135, 1080)],
    "attack": [(165, 332, 135, 1455)],
    "hurt": [(345, 470, 135, 890)],
    # Hatchling has a separate low "dead" row; the other sheets place dead
    # poses to the right of hurt. Score candidates rather than hard-coding one.
    "dead": [(335, 470, 940, 1455), (428, 585, 135, 850)],
    "flight": [(560, 725, 135, 1455), (500, 680, 135, 1455)],
    "jump": [(685, 850, 135, 1250)],
    "walk": [(830, 1015, 135, 1260)],
}
ROW_CENTER_PRESETS = {
    "idle": [225, 405, 585, 765, 945],
    "attack": [235, 430, 620, 810, 1025, 1285],
    "hurt": [235, 430, 620, 805],
    "flight": [240, 430, 620, 810, 990, 1160, 1325],
    "jump": [230, 415, 600, 790, 975],
    "walk": [230, 405, 585, 765, 945, 1115],
}
TARGET_COUNTS = {
    "idle": 8,
    "attack": 6,
    "hurt": 4,
    "dead": 3,
    "flight": 7,
    "jump": 5,
    "walk": 8,
}
FPS = {
    "idle": 6,
    "attack": 11,
    "hurt": 9,
    "dead": 3,
    "flight": 9,
    "jump": 9,
    "walk": 10,
}
ONCE = {"attack", "hurt", "dead", "jump"}
ROW_BOTTOM = {
    "idle": 153,
    "attack": 153,
    "hurt": 153,
    "dead": 154,
    "flight": 141,
    "jump": 145,
    "walk": 153,
}
LEGACY_PICK = [
    ("idle", 0),
    ("idle", 2),
    ("walk", 0),
    ("walk", 2),
    ("walk", 4),
    ("flight", 0),
    ("flight", 3),
    ("attack", 4),
]


def mask_image(mask: np.ndarray) -> Image.Image:
    return Image.fromarray((mask.astype(np.uint8) * 255), "L")


def label_components(mask: np.ndarray) -> tuple[np.ndarray, list[dict[str, int]]]:
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps: list[dict[str, int]] = []
    label = 0
    ys, xs = np.where(mask)
    for sx, sy in zip(xs, ys):
        if labels[sy, sx]:
            continue
        label += 1
        q = deque([(int(sx), int(sy))])
        labels[sy, sx] = label
        left = right = int(sx)
        top = bottom = int(sy)
        area = 0
        while q:
            x, y = q.popleft()
            area += 1
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
            for nx, ny in (
                (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
                (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1),
            ):
                if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = label
                    q.append((nx, ny))
        comps.append({
            "label": label,
            "area": area,
            "left": left,
            "top": top,
            "right": right + 1,
            "bottom": bottom + 1,
        })
    return labels, comps


def background_rgb(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    samples = []
    for x, y in (
        (2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
        (32, 32), (w - 33, 32), (32, h - 33), (w - 33, h - 33),
    ):
        samples.append(arr[y, x, :3])
    return np.median(np.array(samples), axis=0)


def source_masks(src: Image.Image) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    src = src.convert("RGB")
    src = ImageEnhance.Color(src).enhance(1.08)
    src = ImageEnhance.Contrast(src).enhance(1.06)
    arr = np.asarray(src).astype(np.int16)
    h, w = arr.shape[:2]
    bg = background_rgb(arr)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt(
        (r - bg[0]) ** 2 +
        (g - bg[1]) ** 2 +
        (b - bg[2]) ** 2
    )

    blue = (b > 72) & (g > 50) & (b > r * 0.62) & (sat > 16)
    cyan = (g > 82) & (b > 86) & (sat > 16)
    red = (r > 76) & (r > g * 1.08) & (sat > 20)
    gold = (r > 114) & (g > 74) & (r > b * 1.02) & (sat > 18)
    purple = (b > 62) & (r > 56) & (sat > 18)
    dark = (luma < 96) & (sat > 10) & (dist > 18)
    fire = (r > 150) & (g > 50) & (b < 140) & (sat > 48)
    core = (blue | cyan | red | gold | purple | dark | fire) & (dist > 18)

    label_text = (xx < LABEL_WIPE_X) | ((xx < 235) & (luma > 158) & (sat < 44))
    watermark = (luma > 166) & (sat < 22) & (dist < 52)
    pale_shadow = (luma > 118) & (sat < 24) & (dist < 48)
    core &= ~label_text
    core &= ~watermark
    core &= ~pale_shadow

    core = np.asarray(
        mask_image(core)
        .filter(ImageFilter.MaxFilter(5))
        .filter(ImageFilter.MinFilter(3))
        .point(lambda p: 255 if p > 0 else 0)
    ) > 0

    alpha = (dist > 22) & ~label_text
    alpha &= ~watermark
    alpha &= ~pale_shadow
    alpha |= core
    alpha = np.asarray(
        mask_image(alpha)
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.GaussianBlur(0.25))
        .point(lambda p: 255 if p > 18 else 0)
    ) > 0
    return src, core, alpha


def expand_box(box: tuple[int, int, int, int], pad_x: int, pad_y: int, width: int, height: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = box
    return (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(width, right + pad_x),
        min(height, bottom + pad_y),
    )


def close_boolean_gaps(active: np.ndarray, max_gap: int = 7) -> np.ndarray:
    closed = active.copy()
    padded = np.pad(closed.astype(np.int8), (1, 1))
    starts = np.where(np.diff(padded) == -1)[0]
    ends = np.where(np.diff(padded) == 1)[0]
    for start, end in zip(starts, ends):
        if end - start <= max_gap and start > 0 and end < len(closed):
            closed[start:end] = True
    return closed


def column_run_boxes(mask: np.ndarray, band_box: tuple[int, int, int, int], row_name: str) -> list[tuple[int, int, int, int]]:
    top, bottom, left, right = band_box
    band = mask[top:bottom, left:right]
    counts = band.sum(axis=0).astype(np.float32)
    if counts.size == 0 or float(counts.max()) <= 0:
        return []

    smoothed = np.convolve(counts, np.ones(5, dtype=np.float32) / 5, mode="same")
    threshold = max(8.0, float(smoothed.max()) * (0.055 if row_name == "attack" else 0.08))
    active = close_boolean_gaps(smoothed > threshold, 9 if row_name == "attack" else 7)
    padded = np.pad(active.astype(np.int8), (1, 1))
    starts = np.where(np.diff(padded) == 1)[0]
    ends = np.where(np.diff(padded) == -1)[0]

    boxes: list[tuple[int, int, int, int]] = []
    min_width = 24 if row_name in {"dead", "jump"} else 28
    for start, end in zip(starts, ends):
        if end - start < min_width:
            continue
        rows = np.where(band[:, start:end].any(axis=1))[0]
        if len(rows) == 0:
            continue
        y0 = int(rows[0])
        y1 = int(rows[-1]) + 1
        box = (left + int(start), top + y0, left + int(end), top + y1)
        width = box[2] - box[0]
        height = box[3] - box[1]
        if width < min_width or height < 24:
            continue
        boxes.append(box)

    return merge_related_boxes(boxes, row_name)


def component_boxes_for_band(mask: np.ndarray, band_box: tuple[int, int, int, int], row_name: str) -> list[tuple[int, int, int, int]]:
    top, bottom, left, right = band_box
    band = mask[top:bottom, left:right]
    labels, comps = label_components(band)
    del labels
    boxes = []
    for comp in comps:
        w = comp["right"] - comp["left"]
        h = comp["bottom"] - comp["top"]
        area = comp["area"]
        if area < MIN_COMPONENT_AREA or w < 24 or h < 24:
            continue
        if h < 20 and w > h * 4.5:
            continue
        boxes.append((left + comp["left"], top + comp["top"], left + comp["right"], top + comp["bottom"]))

    boxes.sort(key=lambda box: (box[0] + box[2]) / 2)
    return merge_related_boxes(boxes, row_name)


def centers_for_band(row_name: str, band_box: tuple[int, int, int, int]) -> list[int]:
    if row_name == "dead":
        left = band_box[2]
        return [1085, 1295] if left > 900 else [250, 455, 665]
    return ROW_CENTER_PRESETS[row_name]


def slot_boxes_for_band(mask: np.ndarray, band_box: tuple[int, int, int, int], row_name: str) -> list[tuple[int, int, int, int]]:
    top, bottom, left, right = band_box
    centers = [center for center in centers_for_band(row_name, band_box) if left < center < right]
    if not centers:
        return []
    edges = [left]
    edges.extend(int(round((a + b) / 2)) for a, b in zip(centers, centers[1:]))
    edges.append(right)

    boxes: list[tuple[int, int, int, int]] = []
    for index, center in enumerate(centers):
        slot_left = max(left, edges[index] - 8)
        slot_right = min(right, edges[index + 1] + 8)
        slot = mask[top:bottom, slot_left:slot_right]
        ys, xs = np.where(slot)
        if len(xs) == 0:
            continue

        x0 = int(xs.min())
        x1 = int(xs.max()) + 1
        y0 = int(ys.min())
        y1 = int(ys.max()) + 1
        box = (slot_left + x0, top + y0, slot_left + x1, top + y1)
        width = box[2] - box[0]
        height = box[3] - box[1]
        area = int(slot[y0:y1, x0:x1].sum())
        expected_left = center - (125 if row_name in {"attack", "flight"} else 105)
        expected_right = center + (125 if row_name in {"attack", "flight"} else 105)
        if box[2] < expected_left or box[0] > expected_right:
            continue
        if area < 320 or width < 22 or height < 22:
            continue
        boxes.append(box)

    return boxes


def row_candidate_score(row_name: str, boxes: list[tuple[int, int, int, int]]) -> float:
    count = len(boxes)
    if count == 0:
        return -10000
    if row_name == "dead":
        if count in (2, 3):
            return 500 - abs(3 - count) * 40
        return 170 - abs(3 - count) * 55
    source_expected = {
        "idle": 5,
        "attack": 6,
        "hurt": 4,
        "flight": 7,
        "jump": 5,
        "walk": 6,
    }[row_name]
    return min(count, source_expected) * 80 - abs(source_expected - count) * 28 - max(0, count - source_expected) * 70


def prune_partial_boxes(boxes: list[tuple[int, int, int, int]], row_name: str) -> list[tuple[int, int, int, int]]:
    if row_name == "dead" or len(boxes) <= 2:
        return boxes
    widths = np.array([box[2] - box[0] for box in boxes], dtype=np.float32)
    heights = np.array([box[3] - box[1] for box in boxes], dtype=np.float32)
    areas = widths * heights
    median_w = float(np.median(widths))
    median_h = float(np.median(heights))
    median_area = float(np.median(areas))
    kept = []
    for box, width, height, area in zip(boxes, widths, heights, areas):
        too_small = (
            area < median_area * 0.38 or
            height < median_h * 0.56 or
            width < median_w * (0.32 if row_name in {"attack", "flight"} else 0.42)
        )
        if not too_small:
            kept.append(box)
    return kept or boxes


def component_boxes_for_row(mask: np.ndarray, row_name: str) -> list[tuple[int, int, int, int]]:
    best_score = -10000.0
    best_boxes: list[tuple[int, int, int, int]] = []
    for band_box in ROW_BAND_CANDIDATES[row_name]:
        boxes = slot_boxes_for_band(mask, band_box, row_name)
        boxes = prune_partial_boxes(boxes, row_name)
        if len(boxes) < 2:
            boxes = column_run_boxes(mask, band_box, row_name)
            boxes = prune_partial_boxes(boxes, row_name)
        if len(boxes) < 2:
            boxes = component_boxes_for_band(mask, band_box, row_name)
            boxes = prune_partial_boxes(boxes, row_name)
        score = row_candidate_score(row_name, boxes)
        if score > best_score:
            best_score = score
            best_boxes = boxes

    best_boxes.sort(key=lambda box: (box[0] + box[2]) / 2)
    return best_boxes[:max(TARGET_COUNTS[row_name], 7)]


def merge_related_boxes(boxes: list[tuple[int, int, int, int]], row_name: str) -> list[tuple[int, int, int, int]]:
    if not boxes:
        return boxes
    merged: list[tuple[int, int, int, int]] = []
    current = boxes[0]
    for box in boxes[1:]:
        gap = box[0] - current[2]
        current_h = current[3] - current[1]
        box_h = box[3] - box[1]
        vertical_overlap = min(current[3], box[3]) - max(current[1], box[1])
        should_merge = (
            gap < 26 and vertical_overlap > min(current_h, box_h) * 0.25
        ) or (
            row_name == "attack" and gap < 92 and vertical_overlap > 8
        )
        if should_merge:
            current = (
                min(current[0], box[0]),
                min(current[1], box[1]),
                max(current[2], box[2]),
                max(current[3], box[3]),
            )
        else:
            merged.append(current)
            current = box
    merged.append(current)
    return merged


def remove_small_artifacts(sprite: Image.Image, row_name: str) -> Image.Image:
    alpha = np.asarray(sprite.getchannel("A")) > ALPHA_THRESHOLD
    labels, comps = label_components(alpha)
    if not comps:
        return sprite
    def obvious_floor_streak(comp: dict[str, int]) -> bool:
        comp_w = comp["right"] - comp["left"]
        comp_h = comp["bottom"] - comp["top"]
        return comp_h <= 36 and comp_w > comp_h * 2.35

    candidates = [comp for comp in comps if not obvious_floor_streak(comp)]
    main = max(candidates or comps, key=lambda comp: comp["area"])
    keep = labels == main["label"]
    ml, mt, mr, mb = main["left"], main["top"], main["right"], main["bottom"]
    for comp in comps:
        if comp["label"] == main["label"]:
            continue
        if comp["area"] < 36:
            continue
        comp_w = comp["right"] - comp["left"]
        comp_h = comp["bottom"] - comp["top"]
        floor_streak = obvious_floor_streak(comp)
        if floor_streak:
            continue
        h_gap = max(ml - comp["right"], comp["left"] - mr, 0)
        v_gap = max(mt - comp["bottom"], comp["top"] - mb, 0)
        v_overlap = min(mb, comp["bottom"]) - max(mt, comp["top"])
        h_overlap = min(mr, comp["right"]) - max(ml, comp["left"])
        near = (
            h_gap <= 18 and v_gap <= 18 and
            (v_overlap > min(comp_h, mb - mt) * 0.12 or h_overlap > min(comp_w, mr - ml) * 0.12)
        )
        hurt_spark = (
            row_name == "hurt" and comp["area"] >= 20 and
            h_gap <= 24 and comp["bottom"] < mt + 8 and comp["top"] > mt - 44
        )
        attack_trail = (
            row_name == "attack" and
            comp["left"] > ml and comp["area"] >= 24 and
            comp_w > 32 and
            comp["bottom"] > mt and comp["top"] < mt + (mb - mt) * 0.68
        )
        if near or hurt_spark or attack_trail:
            keep |= labels == comp["label"]
    out = sprite.copy()
    out.putalpha(mask_image(keep))
    return out


def crop_pose(src: Image.Image, alpha: np.ndarray, box: tuple[int, int, int, int], row_name: str) -> Image.Image:
    height, width = alpha.shape
    pad_x = 44 if row_name in ("attack", "flight") else (30 if row_name in ("dead", "jump") else 24)
    pad_y = 18 if row_name != "dead" else 12
    left, top, right, bottom = expand_box(box, pad_x, pad_y, width, height)
    crop = src.crop((left, top, right, bottom)).convert("RGBA")
    local_alpha = alpha[top:bottom, left:right].copy()

    # Keep alpha components that overlap the detected dragon body box; this keeps
    # pale horns/belly but drops floor rings and separate label scraps.
    rel = (box[0] - left, box[1] - top, box[2] - left, box[3] - top)
    labels, comps = label_components(local_alpha)
    keep = np.zeros(local_alpha.shape, dtype=bool)
    for comp in comps:
        overlap = not (
            comp["right"] < rel[0] - 22 or comp["left"] > rel[2] + 40 or
            comp["bottom"] < rel[1] - 22 or comp["top"] > rel[3] + 22
        )
        fire_tail = row_name == "attack" and comp["left"] > rel[2] - 5 and comp["area"] > 40
        if overlap or fire_tail:
            keep |= labels == comp["label"]

    alpha_img = mask_image(keep)
    alpha_img = alpha_img.filter(ImageFilter.MaxFilter(3))
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(0.25))
    alpha_img = alpha_img.point(lambda p: 0 if p < 18 else (255 if p > 190 else p))
    crop.putalpha(alpha_img)
    return trim(remove_small_artifacts(strip_floor_pixels(crop, row_name), row_name))


def strip_floor_pixels(sprite: Image.Image, row_name: str) -> Image.Image:
    arr = np.array(sprite).copy()
    rgb = arr[..., :3].astype(np.int16)
    alpha = arr[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    luma = r * 0.299 + g * 0.587 + b * 0.114
    yy = np.mgrid[0:sprite.height, 0:sprite.width][0]
    lower = yy > sprite.height * (0.58 if row_name != "dead" else 0.82)
    red_claw = (r > 82) & (r > g * 1.1) & (sat > 30)
    dark_foot = luma < 82
    gold_detail = (r > 122) & (g > 76) & (r > b * 0.95) & (sat > 36)
    floor_like = (
        ((luma > 132) & (sat < 34)) |
        ((g > 132) & (b > 150) & (r > 72) & (sat < 166) & (luma > 134))
    )
    alpha[(alpha > 0) & lower & floor_like & ~red_claw & ~dark_foot & ~gold_detail] = 0
    arr[..., 3] = alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim(sprite: Image.Image) -> Image.Image:
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    return sprite.crop(bbox)


def sequence_frames(frames: list[Image.Image], row_name: str) -> list[Image.Image]:
    target = TARGET_COUNTS[row_name]
    if not frames:
        raise RuntimeError(f"No frames for {row_name}")
    if len(frames) == target:
        return frames
    if len(frames) > target:
        if row_name == "attack":
            indexes = np.linspace(0, len(frames) - 1, target).round().astype(int)
            return [frames[int(i)] for i in indexes]
        return frames[:target]
    if len(frames) == 1:
        return [frames[0].copy() for _ in range(target)]
    if row_name in {"idle", "flight"} and len(frames) < target:
        indexes: list[int] = []
        direction = 1
        index = 0
        while len(indexes) < target:
            indexes.append(index)
            if len(frames) > 2:
                if index == len(frames) - 1:
                    direction = -1
                elif index == 0:
                    direction = 1
            index += direction
            index = max(0, min(len(frames) - 1, index))
        return [frames[i].copy() for i in indexes]
    indexes = np.linspace(0, len(frames) - 1, target).round().astype(int)
    return [frames[int(i)] for i in indexes]


def alpha_area(frame: Image.Image) -> int:
    return int(np.count_nonzero(np.asarray(frame.getchannel("A")) > ALPHA_THRESHOLD))


def choose_base(frames: list[Image.Image], fallback: Image.Image | None = None) -> Image.Image:
    candidates = [trim(frame) for frame in frames if frame.getchannel("A").getbbox()]
    if not candidates:
        if fallback is None:
            return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        return fallback.copy()

    def score(frame: Image.Image) -> float:
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            return 0
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        aspect_penalty = max(0.0, (w / max(1, h)) - 2.15) * 4200
        return alpha_area(frame) + h * 95 - aspect_penalty

    return max(candidates, key=score).copy()


def transform_sprite(sprite: Image.Image, spec: dict[str, float]) -> Image.Image:
    transformed = trim(sprite)
    scale_x = float(spec.get("scale_x", 1.0))
    scale_y = float(spec.get("scale_y", 1.0))
    angle = float(spec.get("angle", 0.0))
    if scale_x != 1.0 or scale_y != 1.0:
        transformed = transformed.resize(
            (
                max(1, round(transformed.width * scale_x)),
                max(1, round(transformed.height * scale_y)),
            ),
            Image.Resampling.BICUBIC,
        )
    if angle:
        transformed = transformed.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    return trim(transformed)


def build_variants(base: Image.Image, specs: list[dict[str, float]]) -> list[Image.Image]:
    return [transform_sprite(base, spec) for spec in specs]


MOTION_SPECS = {
    "idle": [
        {"scale_y": 1.00},
        {"scale_y": 1.012},
        {"scale_y": 1.022},
        {"scale_y": 1.016},
        {"scale_y": 1.004},
        {"scale_y": 0.996},
        {"scale_y": 0.992},
        {"scale_y": 0.998},
    ],
    "walk": [
        {"angle": -1.8, "scale_y": 0.995},
        {"angle": -0.8, "scale_y": 1.010},
        {"angle": 0.8, "scale_y": 1.018},
        {"angle": 1.8, "scale_y": 1.000},
        {"angle": 1.0, "scale_y": 0.990},
        {"angle": 0.0, "scale_y": 1.012},
        {"angle": -1.0, "scale_y": 1.004},
        {"angle": -1.6, "scale_y": 0.996},
    ],
    "attack": [
        {"angle": -2.5, "scale_x": 0.98},
        {"angle": -1.0, "scale_x": 1.03},
        {"angle": 0.0, "scale_x": 1.08, "scale_y": 0.98},
        {"angle": 0.8, "scale_x": 1.12, "scale_y": 0.96},
        {"angle": 0.0, "scale_x": 1.08, "scale_y": 0.98},
        {"angle": -1.0, "scale_x": 1.00},
    ],
    "hurt": [
        {"angle": 3.0, "scale_y": 0.98},
        {"angle": -4.0, "scale_y": 0.96},
        {"angle": 2.0, "scale_y": 0.98},
        {"angle": 0.0, "scale_y": 1.00},
    ],
    "dead": [
        {"angle": -4, "scale_x": 1.04, "scale_y": 0.62},
        {"angle": -2, "scale_x": 1.10, "scale_y": 0.52},
        {"angle": 0, "scale_x": 1.16, "scale_y": 0.44},
    ],
    "flight": [
        {"angle": -3.0, "scale_y": 1.02},
        {"angle": -1.5, "scale_y": 1.04},
        {"angle": 0.0, "scale_y": 1.02},
        {"angle": 1.6, "scale_y": 0.99},
        {"angle": 2.6, "scale_y": 0.97},
        {"angle": 1.0, "scale_y": 1.00},
        {"angle": -1.5, "scale_y": 1.03},
    ],
    "jump": [
        {"angle": -5.0, "scale_y": 1.02},
        {"angle": -2.0, "scale_y": 1.04},
        {"angle": 0.0, "scale_y": 1.02},
        {"angle": 2.0, "scale_y": 1.00},
        {"angle": 4.0, "scale_y": 0.98},
    ],
}


def synthesize_rows(raw_rows: dict[str, list[Image.Image]]) -> dict[str, list[Image.Image]]:
    idle_base = choose_base(raw_rows.get("idle", []))
    walk_base = idle_base
    attack_base = idle_base
    hurt_base = idle_base
    flight_base = choose_base(raw_rows.get("flight", []), idle_base)
    if alpha_area(flight_base) < max(1, alpha_area(idle_base)) * 0.45:
        flight_base = idle_base
    jump_base = flight_base
    dead_source = idle_base

    return {
        "idle": build_variants(idle_base, MOTION_SPECS["idle"]),
        "attack": build_variants(attack_base, MOTION_SPECS["attack"]),
        "hurt": build_variants(hurt_base, MOTION_SPECS["hurt"]),
        "dead": build_variants(dead_source, MOTION_SPECS["dead"]),
        "flight": build_variants(flight_base, MOTION_SPECS["flight"]),
        "jump": build_variants(jump_base, MOTION_SPECS["jump"]),
        "walk": build_variants(walk_base, MOTION_SPECS["walk"]),
    }


def scale_plan(rows: dict[str, list[Image.Image]]) -> dict[str, float]:
    ground_rows = ["idle", "walk", "hurt"]
    widths = []
    heights = []
    for row_name in ground_rows:
        for frame in rows[row_name]:
            widths.append(frame.width)
            heights.append(frame.height)
    base_w = max(widths or [1])
    base_h = max(heights or [1])
    ground = min(146 / base_w, 150 / base_h, 1.0)
    return {
        "idle": ground,
        "walk": ground,
        "hurt": ground,
        "attack": ground,
        "dead": min(152 / max((f.width for f in rows["dead"]), default=1), 78 / max((f.height for f in rows["dead"]), default=1), ground * 1.08),
        "flight": min(150 / max((f.width for f in rows["flight"]), default=1), 146 / max((f.height for f in rows["flight"]), default=1), ground * 1.02),
        "jump": min(148 / max((f.width for f in rows["jump"]), default=1), 148 / max((f.height for f in rows["jump"]), default=1), ground * 1.02),
    }


def add_outline(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    outer = alpha.filter(ImageFilter.MaxFilter(7))
    inner = alpha.filter(ImageFilter.MaxFilter(3))
    outer_edge = np.clip(np.asarray(outer).astype(np.int16) - np.asarray(alpha).astype(np.int16), 0, 255)
    inner_edge = np.clip(np.asarray(inner).astype(np.int16) - np.asarray(alpha).astype(np.int16), 0, 255)
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    dark = Image.new("RGBA", frame.size, (5, 8, 18, 0))
    dark.putalpha(Image.fromarray((outer_edge * 0.88).astype(np.uint8), "L"))
    rim = Image.new("RGBA", frame.size, (28, 42, 75, 0))
    rim.putalpha(Image.fromarray((inner_edge * 0.52).astype(np.uint8), "L"))
    out.alpha_composite(dark)
    out.alpha_composite(rim)
    out.alpha_composite(frame)
    return out


def pixel_grade(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    rgb = frame.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.12)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.16)
    small = rgb.resize((128, 128), Image.Resampling.LANCZOS)
    quant = small.quantize(colors=112, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quant = quant.resize((CELL, CELL), Image.Resampling.NEAREST)
    quant.putalpha(alpha.point(lambda p: 0 if p < 14 else (255 if p > 225 else p)))
    return quant


def place_frame(sprite: Image.Image, scale: float, row_name: str) -> Image.Image:
    sprite = trim(sprite)
    if sprite.width <= 1 or sprite.height <= 1:
        return Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    max_size = CELL - SAFE_MARGIN * 2 - 2
    local_scale = min(scale, max_size / sprite.width, max_size / sprite.height)
    resized = sprite.resize(
        (max(1, round(sprite.width * local_scale)), max(1, round(sprite.height * local_scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - resized.width) // 2
    y = ROW_BOTTOM[row_name] - resized.height
    x = max(SAFE_MARGIN, min(CELL - resized.width - SAFE_MARGIN, x))
    y = max(SAFE_MARGIN, min(CELL - resized.height - SAFE_MARGIN, y))
    canvas.alpha_composite(resized, (x, y))
    return add_outline(pixel_grade(canvas))


def add_fire_pixels(frame: Image.Image) -> Image.Image:
    out = frame.copy()
    bbox = out.getchannel("A").getbbox()
    if bbox is None:
        return out
    draw = ImageDraw.Draw(out, "RGBA")
    origin_x = min(CELL - 64, bbox[2] - 26)
    origin_y = int(bbox[1] + (bbox[3] - bbox[1]) * 0.38)
    colors = [(255, 235, 110, 235), (255, 132, 45, 225), (225, 54, 32, 210), (95, 214, 255, 185)]
    for i in range(12):
        x = origin_x + i * 4
        spread = max(1, 8 - i // 2)
        y = origin_y + ((i % 3) - 1) * 3
        color = colors[i % len(colors)]
        draw.rectangle((x, y - spread // 2, x + 5, y + spread // 2), fill=color)
        if i % 3 == 0:
            draw.rectangle((x + 2, y - spread - 4, x + 4, y - spread - 1), fill=colors[0])
    return out


def add_hurt_sparks(frame: Image.Image) -> Image.Image:
    out = frame.copy()
    bbox = out.getchannel("A").getbbox()
    if bbox is None:
        return out
    draw = ImageDraw.Draw(out, "RGBA")
    head_x = int(bbox[0] + (bbox[2] - bbox[0]) * 0.68)
    head_y = int(bbox[1] + (bbox[3] - bbox[1]) * 0.18)
    for dx, dy, size in [(-8, -8, 3), (4, -12, 4), (12, -4, 3), (-2, 2, 2)]:
        x = head_x + dx
        y = head_y + dy
        draw.rectangle((x, y, x + size, y + size), fill=(255, 225, 92, 230))
    return out


def post_effect(frame: Image.Image, row_name: str, index: int) -> Image.Image:
    if row_name == "attack" and index in {3, 4}:
        return add_fire_pixels(frame)
    if row_name == "hurt" and index == 2:
        return add_hurt_sparks(frame)
    return frame


def extract_rows(src_path: Path) -> dict[str, list[Image.Image]]:
    src, core, alpha = source_masks(Image.open(src_path))
    extracted: dict[str, list[Image.Image]] = {}
    for row_name in ROW_LABELS:
        boxes = component_boxes_for_row(core, row_name)
        frames = [crop_pose(src, alpha, box, row_name) for box in boxes]
        frames = [frame for frame in frames if frame.width > 8 and frame.height > 8]
        extracted[row_name] = frames
    motion_rows = synthesize_rows(extracted)
    scales = scale_plan(motion_rows)
    return {
        row_name: [post_effect(place_frame(frame, scales[row_name], row_name), row_name, index)
                   for index, frame in enumerate(frames)]
        for row_name, frames in motion_rows.items()
    }


def write_atlas(rows: dict[str, list[Image.Image]], out_path: Path) -> None:
    atlas = Image.new("RGBA", (COLS * CELL, len(ROW_LABELS) * CELL), (0, 0, 0, 0))
    for row_index, row_name in enumerate(ROW_LABELS):
        frames = rows[row_name]
        for col in range(COLS):
            if col >= len(frames):
                continue
            frame = frames[col]
            bbox = frame.getchannel("A").getbbox()
            if bbox and (bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= CELL or bbox[3] >= CELL):
                raise RuntimeError(f"{out_path.name}:{row_name}:{col} touches bounds {bbox}")
            atlas.alpha_composite(frame, (col * CELL, row_index * CELL))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_path)


def write_legacy_sheet(rows: dict[str, list[Image.Image]], out_path: Path) -> None:
    frame_size = 128
    sheet = Image.new("RGBA", (frame_size * 8, frame_size), (0, 0, 0, 0))
    for index, (row_name, frame_index) in enumerate(LEGACY_PICK):
        frame = rows[row_name][min(frame_index, len(rows[row_name]) - 1)]
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            continue
        sprite = frame.crop(bbox)
        scale = min(118 / sprite.width, 118 / sprite.height)
        resized = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.LANCZOS,
        )
        cell = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
        cell.alpha_composite(resized, ((frame_size - resized.width) // 2, frame_size - resized.height - 5))
        sheet.alpha_composite(cell, (index * frame_size, 0))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)


def slice_atlas(src_path: Path, out_path: Path, max_frames_override=None, legacy_sheet_path: Path | None = None):
    del max_frames_override
    rows = extract_rows(src_path)
    write_atlas(rows, out_path)
    if legacy_sheet_path is not None:
        write_legacy_sheet(rows, legacy_sheet_path)
    counts = {row_name: len(rows[row_name]) for row_name in ROW_LABELS}
    return counts, COLS, rows


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: slice_pose_atlas.py <source.png> <out.png> [legacy_sheet.png]")
        sys.exit(1)
    legacy = Path(sys.argv[3]) if len(sys.argv) >= 4 else None
    counts, max_frames, _ = slice_atlas(Path(sys.argv[1]), Path(sys.argv[2]), legacy_sheet_path=legacy)
    print(f"counts={counts} max={max_frames}")


if __name__ == "__main__":
    main()
