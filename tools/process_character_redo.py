"""Prepare and finalize the GPT Image 2 character atlas replacement set."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "generated-sources" / "character-redo-20260711"
SPRITES = ROOT / "assets" / "sprites"
TARGET_SIZE = (1920, 1280)
MAGENTA = (255, 0, 255)


def remove_cell_guides(image: Image.Image) -> Image.Image:
    """Erase generated atlas guide lines at the known cell boundaries."""
    image = image.convert("RGB")
    cell_w = image.width // 12
    cell_h = image.height // 8
    for x in range(0, image.width, cell_w):
        for xx in range(max(0, x - 2), min(image.width, x + 3)):
            for y in range(image.height):
                image.putpixel((xx, y), MAGENTA)
    for y in range(0, image.height, cell_h):
        for yy in range(max(0, y - 2), min(image.height, y + 3)):
            for x in range(image.width):
                image.putpixel((x, yy), MAGENTA)
    return image


def prepare() -> None:
    for raw in sorted(SOURCE.glob("*_raw.png")):
        clean = raw.with_name(raw.name.replace("_raw.png", "_clean.png"))
        remove_cell_guides(Image.open(raw)).save(clean)
        print(f"prepared {clean.name}")


def clear_cell_edges(image: Image.Image) -> Image.Image:
    """Guarantee no generated guide or neighboring-cell pixels survive."""
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    cell_w = image.width // 12
    cell_h = image.height // 8
    for x in range(0, image.width, cell_w):
        for xx in range(max(0, x - 3), min(image.width, x + 4)):
            alpha.paste(0, (xx, 0, xx + 1, image.height))
    for y in range(0, image.height, cell_h):
        for yy in range(max(0, y - 3), min(image.height, y + 4)):
            alpha.paste(0, (0, yy, image.width, yy + 1))
    image.putalpha(alpha)
    return image


def restore_family_palette(image: Image.Image, family: str) -> Image.Image:
    """Restore the intended vivid body color when the generator desaturates it."""
    if family not in {"eileithyia", "namisa"}:
        return image
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.float32)
    value = rgb.mean(axis=2)
    neutral = (rgb.max(axis=2) - rgb.min(axis=2) < 48) & (value > 28) & (value < 170)
    if family == "eileithyia":
        mapped = np.stack((70 + value, 14 + value * 0.42, 50 + value * 0.82), axis=2)
    else:
        mapped = np.stack((55 + value * 0.82, 22 + value * 0.42, 105 + value * 0.88), axis=2)
    array[..., :3][neutral] = np.clip(mapped[neutral], 0, 255).astype(np.uint8)
    return Image.fromarray(array)


def finalize() -> None:
    expected = 30
    outputs = []
    for cut in sorted(SOURCE.glob("*_cut.png")):
        family = cut.name.split("_")[0]
        image = restore_family_palette(Image.open(cut), family)
        image = clear_cell_edges(image)
        if image.size != TARGET_SIZE:
            image = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        name = cut.name.replace("_cut.png", ".png")
        destination = SPRITES / name
        image.save(destination)
        outputs.append(destination)
        print(f"installed {name} {image.size} {image.mode}")
    if len(outputs) != expected:
        raise SystemExit(f"expected {expected} cut sheets, found {len(outputs)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("prepare", "finalize"))
    args = parser.parse_args()
    if args.action == "prepare":
        prepare()
    else:
        finalize()


if __name__ == "__main__":
    main()
