"""Run slice_pose_atlas on every input source and write to assets/sprites/.
Also writes a verification grid for visual confirmation."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from slice_pose_atlas import slice_atlas
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[1]
SRC = PROJECT / "assets" / "sprite-source"
OUT = PROJECT / "assets" / "sprites"

# (output sprite id, source filename, friendly name)
JOBS = [
    ("altos_01", "ChatGPT Image Apr 28, 2026, 11_27_25 AM (2).png", "HATCHLING"),
    ("altos_02", "ChatGPT Image Apr 28, 2026, 08_26_07 AM.png",     "YOUNG"),
    ("altos_03", "ChatGPT Image Apr 28, 2026, 11_27_25 AM (3).png", "WINGED"),
    ("altos_04", "ChatGPT Image Apr 28, 2026, 11_27_26 AM (4).png", "GUARDIAN"),
    ("altos_05", "ChatGPT Image Apr 28, 2026, 11_27_26 AM (5).png", "SKY LORD"),
    ("altos_06", "ChatGPT Image Apr 28, 2026, 11_27_26 AM (6).png", "ANCIENT"),
    ("egg",      "ChatGPT Image Apr 28, 2026, 11_27_13 AM.png",     "EGG"),
]

ROW_LABELS = ["idle", "attack", "hurt", "dead", "flight", "jump", "walk"]


def main():
    summaries = []
    for sprite_id, fname, label in JOBS:
        src = SRC / fname
        if not src.exists():
            print(f"MISSING: {src}")
            continue
        out = OUT / f"{sprite_id}_atlas.png"
        counts, max_f = slice_atlas(src, out)
        print(f"{sprite_id} ({label}): {counts}  -> {out.name}")
        summaries.append((sprite_id, label, counts, max_f, out))

    # Verification grid: each stage as a row of all 7 anims at small size
    cell = 96
    cols = max(s[3] for s in summaries) if summaries else 7
    label_w = 96
    img_w = label_w + cols * cell
    img_h = (len(summaries) * 7 + 1) * cell // 2 + 24
    # cleaner: per-stage block of 7 rows of 1 frame each (idle 0)
    block_h = 7 * (cell // 2 + 4) + 28
    img = Image.new("RGBA", (label_w + cols * (cell // 2 + 2),
                             len(summaries) * block_h), (24, 16, 32, 255))
    d = ImageDraw.Draw(img)
    y = 0
    for sprite_id, label, counts, max_f, atlas_path in summaries:
        d.text((6, y + 6), f"{sprite_id} {label}", fill=(255, 220, 140, 255))
        atlas = Image.open(atlas_path)
        for ri, name in enumerate(ROW_LABELS):
            n = counts.get(name, 0)
            for ci in range(min(n, cols)):
                src_x = ci * 160
                src_y = ri * 160
                cell_im = atlas.crop((src_x, src_y, src_x + 160, src_y + 160))
                cell_im = cell_im.resize((cell // 2, cell // 2), Image.Resampling.LANCZOS)
                img.paste(cell_im, (label_w + ci * (cell // 2 + 2),
                                    y + 24 + ri * (cell // 2 + 4)), cell_im)
            d.text((6, y + 28 + ri * (cell // 2 + 4)), name, fill=(170, 200, 255, 255))
        y += block_h
    img.save(PROJECT / "verification-pose-atlases.png")
    print("verification grid: verification-pose-atlases.png")


if __name__ == "__main__":
    main()
