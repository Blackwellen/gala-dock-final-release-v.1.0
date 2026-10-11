# Finds photo rectangles (high-detail regions) inside a search area of a design image.
# Usage: python scripts/find-photos.py <design.png> x0 y0 x1 y1 [min_w=60]
import sys
import numpy as np
from PIL import Image
p, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6]); mw = int(sys.argv[6]) if len(sys.argv) > 6 else 60
g = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)[y0:y1, x0:x1]
sat = g.max(2) - g.min(2); dark = g.mean(2) < 200
mask = (sat > 40) | dark
cols = mask.mean(0) > 0.5; rows = mask.mean(1) > 0.25
def runs(v, off):
    out, s = [], None
    for i, f in enumerate(v):
        if f and s is None: s = i
        if not f and s is not None:
            if i - s >= mw: out.append((s + off, i + off))
            s = None
    if s is not None and len(v) - s >= mw: out.append((s + off, len(v) + off))
    return out
ys = runs(rows, y0)
for ya, yb in ys:
    sub = mask[ya - y0:yb - y0]
    for xa, xb in runs(sub.mean(0) > 0.6, x0):
        print(f"photo x {xa}-{xb} y {ya}-{yb}  ({xb-xa}x{yb-ya})")
