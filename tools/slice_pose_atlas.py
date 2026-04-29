"""Slice a multi-row pose atlas (gray-bg PNG with labelled rows) into a clean
uniform-cell sprite atlas the game's drawAtlasFrame() can use."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

CELL = 160
ROW_LABELS = ["idle", "attack", "hurt", "dead", "flight", "jump", "walk"]
MIN_BODY_AREA = 3500
ROW_GAP_PX = 60
DEAD_GAP_PX = 90


def remove_gray_background(img):
    arr = np.asarray(img.convert("RGBA")).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    H, W = arr.shape[:2]
    samples = []
    for (sx, sy) in [(2, 2), (W-3, 2), (2, H-3), (W-3, H-3),
                     (12, 12), (W-13, 12), (12, H-13), (W-13, H-13)]:
        samples.append(arr[sy, sx, :3])
    bg = np.median(np.array(samples), axis=0)
    dr = r - bg[0]; dg = g - bg[1]; db = b - bg[2]
    dist = np.sqrt(dr*dr + dg*dg + db*db)
    is_bg = dist < 28
    mx = arr[..., :3].max(axis=2); mn = arr[..., :3].min(axis=2)
    sat = mx - mn
    luma = (r + g + b) // 3
    is_shadow = (sat < 14) & (luma > 130) & (luma < 230)
    a[is_bg | is_shadow] = 0
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    alpha = alpha.point(lambda p: 0 if p < 60 else 255)
    out.putalpha(alpha)
    return out


def label_components(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps = []
    label = 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            label += 1
            q = deque([(sx, sy)])
            labels[sy, sx] = label
            l = r = sx; t = b = sy; area = 0
            while q:
                x, y = q.popleft()
                area += 1
                if x < l: l = x
                if x > r: r = x
                if y < t: t = y
                if y > b: b = y
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1),
                               (x-1,y-1),(x+1,y-1),(x-1,y+1),(x+1,y+1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        q.append((nx, ny))
            comps.append({"label": label, "area": area,
                          "left": l, "top": t, "right": r+1, "bottom": b+1})
    return labels, comps


def merge_close_components(comps, body_threshold=4000, absorb_radius=80):
    if not comps:
        return []
    bodies = [dict(c) for c in comps if c["area"] >= body_threshold]
    smalls = [c for c in comps if c["area"] < body_threshold]
    for s in smalls:
        scx = (s["left"] + s["right"]) / 2
        scy = (s["top"]  + s["bottom"]) / 2
        best = None; best_score = 1e18
        for b in bodies:
            bcx = (b["left"] + b["right"]) / 2
            bcy = (b["top"]  + b["bottom"]) / 2
            d_y = abs(scy - bcy); d_x = abs(scx - bcx)
            if d_y > absorb_radius: continue
            score = d_x + d_y * 1.6
            if score < best_score:
                best_score = score; best = b
        if best is None:
            continue
        bcx = (best["left"] + best["right"]) / 2
        if abs(scx - bcx) > 220:
            continue
        best["left"]   = min(best["left"],   s["left"])
        best["top"]    = min(best["top"],    s["top"])
        best["right"]  = max(best["right"],  s["right"])
        best["bottom"] = max(best["bottom"], s["bottom"])
        best["area"]  += s["area"]
    cleaned = []
    for b in bodies:
        w = b["right"] - b["left"]; h = b["bottom"] - b["top"]
        if h < 40 and w > h * 4 and b["left"] < 110:
            continue
        cleaned.append(b)
    return cleaned


def cluster_rows(comps):
    if not comps: return []
    items = sorted(comps, key=lambda c: (c["top"] + c["bottom"]) / 2)
    rows = []
    cur = [items[0]]
    cur_y = (items[0]["top"] + items[0]["bottom"]) / 2
    for c in items[1:]:
        cy = (c["top"] + c["bottom"]) / 2
        if abs(cy - cur_y) <= ROW_GAP_PX:
            cur.append(c)
            cur_y = (cur_y + cy) / 2
        else:
            rows.append(sorted(cur, key=lambda d: (d["left"]+d["right"])/2))
            cur = [c]; cur_y = cy
    rows.append(sorted(cur, key=lambda d: (d["left"]+d["right"])/2))
    return rows


def split_dead_from_row(row):
    if len(row) < 2:
        return row, []
    gaps = []
    for i in range(1, len(row)):
        gaps.append((row[i]["left"] - row[i-1]["right"], i))
    big = [g for g in gaps if g[0] > DEAD_GAP_PX]
    if not big:
        return row, []
    biggest = max(big, key=lambda g: g[0])
    idx = biggest[1]
    return row[:idx], row[idx:]


def render_frame(src_rgba, comp, cell=CELL):
    pad = 6
    L = max(0, comp["left"]  - pad)
    T = max(0, comp["top"]   - pad)
    R = min(src_rgba.width,  comp["right"]  + pad)
    B = min(src_rgba.height, comp["bottom"] + pad)
    crop = src_rgba.crop((L, T, R, B))
    cw, ch = crop.size
    scale = min((cell - 4) / cw, (cell - 4) / ch)
    nw = max(1, round(cw * scale)); nh = max(1, round(ch * scale))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    x = (cell - nw) // 2
    y = int(cell * 0.92) - nh
    if y < 2: y = 2
    frame.alpha_composite(crop, (x, y))
    return frame


def slice_atlas(src_path, out_path, max_frames_override=None):
    src = Image.open(src_path).convert("RGBA")
    cleaned = remove_gray_background(src)
    # Wipe the leftmost label column ("Idle"/"Attack"/"Hurt"/...) so labels never
    # become components, even if their letters are connected.
    arr = np.array(cleaned)
    arr[:, :100, 3] = 0
    cleaned = Image.fromarray(arr, "RGBA")
    alpha = np.asarray(cleaned.getchannel("A")) > 8
    _, raw_comps = label_components(alpha)
    raw_comps = [c for c in raw_comps if c["area"] >= 200]
    # Strip the row labels ("Idle", "Attack", ...) BEFORE merging,
    # otherwise they get absorbed into the leftmost frame.
    raw_comps = [c for c in raw_comps if not (
        (c["bottom"] - c["top"]) < 60 and
        (c["right"] - c["left"]) > (c["bottom"] - c["top"]) * 1.5 and
        c["left"] < 130
    )]
    merged = merge_close_components(raw_comps)
    merged = [c for c in merged if c["area"] >= MIN_BODY_AREA]
    rows = cluster_rows(merged)

    n = len(rows)
    if n < 5:
        raise RuntimeError("Only %d rows in %s" % (n, src_path.name))
    dead_row = []
    if n >= 7:
        idle_row, attack_row, hurt_row, dead_row, flight_row, jump_row, walk_row = rows[:7]
    elif n == 6:
        idle_row = rows[0]
        attack_row, da = split_dead_from_row(rows[1])
        hurt_row,   dh = split_dead_from_row(rows[2])
        dead_row = da or dh
        flight_row = rows[3]; jump_row = rows[4]; walk_row = rows[5]
    else:
        idle_row = rows[0]
        attack_row, da = split_dead_from_row(rows[1])
        hurt_row,   dh = split_dead_from_row(rows[2])
        dead_row = da or dh
        flight_row = rows[3]; walk_row = rows[4]; jump_row = []

    anims = {
        "idle":   idle_row,
        "attack": attack_row,
        "hurt":   hurt_row,
        "dead":   dead_row,
        "flight": flight_row,
        "jump":   jump_row,
        "walk":   walk_row,
    }
    counts = {k: len(v) for k, v in anims.items()}
    max_frames = max_frames_override or max(counts.values())
    sheet = Image.new("RGBA", (max_frames * CELL, len(ROW_LABELS) * CELL), (0, 0, 0, 0))
    for ri, name in enumerate(ROW_LABELS):
        for ci, comp in enumerate(anims[name]):
            if ci >= max_frames: break
            frame = render_frame(cleaned, comp)
            sheet.alpha_composite(frame, (ci * CELL, ri * CELL))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return counts, max_frames


def main():
    if len(sys.argv) < 3:
        print("usage: slice_pose_atlas.py <source.png> <out.png>")
        sys.exit(1)
    counts, mx = slice_atlas(Path(sys.argv[1]), Path(sys.argv[2]))
    print("counts=%s max=%d" % (counts, mx))


if __name__ == "__main__":
    main()
