"""Crop and downscale the generated world assets into game-ready PNGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "generated-sources" / "world-redo-20260711"

OUTPUTS = {
    "platform_normal_v2_cut.png": (ROOT / "assets" / "tiles" / "ledge_normal_v2.png", (192, 64)),
    "platform_crystal_v2_cut.png": (ROOT / "assets" / "tiles" / "ledge_crystal_v2.png", (192, 64)),
    "platform_crumble_v2_cut.png": (ROOT / "assets" / "tiles" / "ledge_crumble_v2.png", (192, 64)),
    "platform_trampoline_v2_cut.png": (ROOT / "assets" / "tiles" / "ledge_trampoline_v2.png", (192, 64)),
    "platform_spiketop_v2_cut.png": (ROOT / "assets" / "tiles" / "ledge_spiketop_v2.png", (192, 80)),
    "hazard_spikes_v2_cut.png": (ROOT / "assets" / "tiles" / "hazard_spikes_v2.png", (96, 48)),
    "ground_tile_v2_cut.png": (ROOT / "assets" / "tiles" / "ground_tile_v2.png", (64, 64)),
    "checkpoint_flag_v2_cut.png": (ROOT / "assets" / "sprites" / "checkpoint_flag.png", (48, 96)),
    "crystal_cluster_v2_cut.png": (ROOT / "assets" / "sprites" / "crystal_cluster.png", (48, 48)),
}


def fit_asset(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("generated asset has no visible pixels")
    crop = image.crop(bbox)
    usable = (max(1, size[0] - 4), max(1, size[1] - 4))
    crop.thumbnail(usable, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - crop.width) // 2
    y = (size[1] - crop.height) // 2
    output.alpha_composite(crop, (x, y))
    return output


def main() -> None:
    for source_name, (destination, size) in OUTPUTS.items():
        source = SOURCE / source_name
        if not source.exists():
            raise FileNotFoundError(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        fit_asset(Image.open(source), size).save(destination)
        print(f"installed {destination.relative_to(ROOT)} {size}")


if __name__ == "__main__":
    main()
