"""Build stable, cell-safe character atlases from the clean source backup."""

from __future__ import annotations

from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "sprite-backups" / "backup_pre_character_redo_20260711"
DESTINATION = ROOT / "assets" / "sprites"
FRAME = 160
ROWS = 8
COLS = 12
MARGIN = 7
COMPONENT_MIN_PIXELS = 500
BABY_COUNTS = (4, 6, 9, 8, 8, 4, 6, 2)
ADULT_COUNTS = (4, 5, 9, 7, 7, 3, 6, 2)
AIRBORNE_ROWS = {2, 4}

# The generated baby sheets occasionally changed horizontal direction between
# poses. These overrides make every source atlas face right; the renderer then
# mirrors the complete atlas when the player moves left.
FLIP_FRAMES = {
    "altos_01_atlas2.png": {0: {2}, 4: {1, 3}, 6: {3}},
    "eileithyia_01_atlas2.png": {0: {0, 1, 2, 3}, 6: {1}},
    "sparo_01_atlas2.png": {
        0: {0, 1, 2, 3},
        1: {0, 1, 2, 3, 4, 5},
        2: {0, 2},
        3: {5},
        6: {0, 3},
    },
    "sparo_02_atlas2.png": {
        0: {0, 1, 2, 3},
        1: {0, 1, 2, 3, 4, 5},
        2: {0, 1, 2, 3, 4, 5, 6, 7, 8},
    },
    "namisa_01_atlas2.png": {1: {4, 5}},
    "malfoy_01_atlas2.png": {
        0: {0, 1, 2, 3},
        1: {0, 1, 2, 3, 4},
        2: {0, 1, 2, 3, 4, 5, 6, 7, 8},
        4: {0, 2, 3, 5},
        5: {0, 1, 2, 3},
    },
    "malfoy_02_atlas2.png": {0: {0, 2}, 4: {1, 2, 3, 4, 5}, 5: {0, 1}},
}


def alpha_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def clean_frame(image: Image.Image) -> Image.Image:
    """Drop tiny alpha fragments without removing detached flames or sparks."""
    array = np.asarray(image.convert("RGBA")).copy()
    mask = array[..., 3] > 18
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count:
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        for component, size in enumerate(sizes, start=1):
            if size < 12:
                array[labels == component] = 0
    return Image.fromarray(array)


def component_frames(atlas: Image.Image, row: int, frame_count: int) -> list[Image.Image]:
    """Extract packed poses by silhouette instead of clipping them to grid cells."""
    row_image = atlas.crop((0, row * FRAME, atlas.width, (row + 1) * FRAME)).convert("RGBA")
    array = np.asarray(row_image).copy()
    mask = array[..., 3] > 18
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))

    components = []
    for label in range(1, count + 1):
        ys, xs = np.nonzero(labels == label)
        if not len(xs):
            continue
        components.append(
            {
                "label": label,
                "size": len(xs),
                "center_x": float(xs.mean()),
                "bbox": (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1),
            }
        )

    substantial = [
        part
        for part in components
        if part["size"] >= COMPONENT_MIN_PIXELS
        and part["bbox"][3] - part["bbox"][1] >= 36
    ]
    substantial.sort(key=lambda part: part["center_x"])

    active_width = frame_count * FRAME

    def is_clipped(part: dict[str, object]) -> bool:
        left, top, right, bottom = part["bbox"]
        return left <= 1 or top <= 1 or right >= active_width - 1 or bottom >= FRAME - 1

    intact = [part for part in substantial if not is_clipped(part)]
    if intact:
        substantial = intact

    if row == 7 and len(substantial) < frame_count:
        # A few legacy death rows contain overlapping poses. Clean hurt poses are
        # preferable to shipping a visibly severed or doubled character.
        return component_frames(atlas, 5, frame_count)

    if not substantial:
        return []

    if len(substantial) > frame_count:
        largest = sorted(substantial, key=lambda part: part["size"], reverse=True)[:frame_count]
        substantial = sorted(largest, key=lambda part: part["center_x"])

    selected_labels = {part["label"] for part in substantial}
    attachments: dict[int, set[int]] = {part["label"]: {part["label"]} for part in substantial}
    for part in components:
        if part["label"] in selected_labels or part["size"] < 12:
            continue
        if part["size"] >= COMPONENT_MIN_PIXELS:
            continue
        if is_clipped(part):
            continue
        nearest = min(substantial, key=lambda main: abs(main["center_x"] - part["center_x"]))
        if abs(nearest["center_x"] - part["center_x"]) <= FRAME * 0.72:
            attachments[nearest["label"]].add(part["label"])

    frames = []
    for part in substantial:
        keep = np.isin(labels, list(attachments[part["label"]]))
        frame_array = np.zeros_like(array)
        frame_array[keep] = array[keep]
        frame = Image.fromarray(frame_array)
        bbox = frame.getbbox()
        if bbox:
            frames.append(frame.crop(bbox))

    if not frames:
        return []
    if len(frames) < frame_count:
        indices = np.linspace(0, len(frames) - 1, frame_count).round().astype(int)
        frames = [frames[index].copy() for index in indices]
    return frames[:frame_count]


def body_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    array = np.asarray(image.convert("RGBA"))
    rgb = array[..., :3].astype(np.int16)
    alpha = array[..., 3] > 24
    fire = (
        (rgb[..., 0] > 175)
        & (rgb[..., 1] > 45)
        & (rgb[..., 1] < 220)
        & (rgb[..., 2] < 115)
        & (rgb[..., 0] > rgb[..., 1] * 1.12)
    )
    return alpha_bbox(alpha & ~fire)


def fit_frame(image: Image.Image, target_height: float, row: int) -> Image.Image:
    image = clean_frame(image)
    full = image.getbbox()
    body = body_bbox(image)
    if not full or not body:
        return Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))

    body_height = max(1, body[3] - body[1])
    scale = max(0.82, min(1.18, target_height / body_height))
    full_width = full[2] - full[0]
    full_height = full[3] - full[1]
    scale = min(scale, (FRAME - MARGIN * 2) / full_width, (FRAME - MARGIN * 2) / full_height)

    crop = image.crop(full)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )

    body_center_x = ((body[0] + body[2]) / 2 - full[0]) * scale
    if row in AIRBORNE_ROWS:
        body_anchor_y = ((body[1] + body[3]) / 2 - full[1]) * scale
        target_y = FRAME * 0.52
    else:
        body_anchor_y = (body[3] - full[1]) * scale
        target_y = FRAME - 9

    x = round(FRAME / 2 - body_center_x)
    y = round(target_y - body_anchor_y)
    x = max(MARGIN, min(FRAME - MARGIN - resized.width, x))
    y = max(MARGIN, min(FRAME - MARGIN - resized.height, y))

    output = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    output.alpha_composite(resized, (x, y))
    return output


def normalize_atlas(source: Path, destination: Path) -> None:
    atlas = Image.open(source).convert("RGBA")
    if atlas.size != (COLS * FRAME, ROWS * FRAME):
        raise ValueError(f"unexpected atlas size for {source.name}: {atlas.size}")

    stage = int(source.stem.split("_")[1])
    counts = BABY_COUNTS if stage <= 2 else ADULT_COUNTS
    output = Image.new("RGBA", atlas.size, (0, 0, 0, 0))

    for row, frame_count in enumerate(counts):
        cells = component_frames(atlas, row, frame_count)
        if len(cells) != frame_count:
            raise ValueError(
                f"expected {frame_count} poses in row {row} of {source.name}, found {len(cells)}"
            )
        heights = []
        for cell in cells:
            box = body_bbox(clean_frame(cell))
            if box:
                heights.append(box[3] - box[1])
        if not heights:
            raise ValueError(f"empty animation row {row} in {source.name}")
        target_height = float(median(heights))

        for column, cell in enumerate(cells):
            if column in FLIP_FRAMES.get(source.name, {}).get(row, set()):
                cell = cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            fitted = fit_frame(cell, target_height, row)
            output.alpha_composite(fitted, (column * FRAME, row * FRAME))

    output.save(destination)
    print(f"normalized {destination.name}")


def main() -> None:
    sources = sorted(SOURCE.glob("*_atlas2.png"))
    if len(sources) != 30:
        raise SystemExit(f"expected 30 source atlases, found {len(sources)}")
    for source in sources:
        normalize_atlas(source, DESTINATION / source.name)


if __name__ == "__main__":
    main()
