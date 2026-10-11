# Lists content row bands (y-ranges with visible content) in reference vs current screenshot, for a column range.
# Usage: python scripts/row-bands.py <reference.png> <screenshot.png> x_from x_to [threshold]
import sys
import numpy as np
from PIL import Image
ref_path, cur_path, xa, xb = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
thr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.02

def bands(path):
    g = np.asarray(Image.open(path).convert("L"), dtype=np.float32)[:, xa:xb]
    # Content = pixels noticeably darker than the local row background (median).
    bg = np.median(g, axis=1, keepdims=True)
    ink = (bg - g) > 28
    frac = ink.mean(axis=1)
    rows, start = [], None
    for y, f in enumerate(frac):
        if f > thr and start is None: start = y
        if f <= thr and start is not None:
            if y - start >= 3: rows.append((start, y))
            start = None
    return rows

r, c = bands(ref_path), bands(cur_path)
print(f"{'ref':>14} | {'current':>14} | dy(top) dh")
for i in range(max(len(r), len(c))):
    a = r[i] if i < len(r) else None; b = c[i] if i < len(c) else None
    d = f"{b[0]-a[0]:+4d} {(b[1]-b[0])-(a[1]-a[0]):+4d}" if a and b else ""
    print(f"{str(a):>14} | {str(b):>14} | {d}")
