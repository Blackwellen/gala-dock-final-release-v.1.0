# For each horizontal strip of the reference, finds the vertical shift (dy) that best matches the current render.
# Usage: python scripts/offset-map.py <reference.png> <current.png> x0 x1 [step=24] [win=32] [search=90]
import sys
import numpy as np
from PIL import Image
ref_p, cur_p, x0, x1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
step, win, search = (int(sys.argv[5]) if len(sys.argv) > 5 else 24), (int(sys.argv[6]) if len(sys.argv) > 6 else 32), (int(sys.argv[7]) if len(sys.argv) > 7 else 90)
r = np.asarray(Image.open(ref_p).convert("L"), dtype=np.float32)[:, x0:x1]
c = np.asarray(Image.open(cur_p).convert("L"), dtype=np.float32)[:, x0:x1]
H = min(r.shape[0], c.shape[0])
for y in range(0, H - win, step):
    strip = r[y:y + win]
    if strip.std() < 6: continue  # blank strip: no information
    best = None
    for dy in range(-search, search + 1):
        if y + dy < 0 or y + dy + win > c.shape[0]: continue
        e = np.abs(c[y + dy:y + dy + win] - strip).mean()
        if best is None or e < best[0]: best = (e, dy)
    print(f"y {y:4d}  dy {best[1]:+4d}  err {best[0]:5.1f}")
