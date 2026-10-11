# Horizontal-band breakdown of pixel difference for the left story panel and right side.
# Usage: python scripts/band-diff.py <reference.png> <current.png> split_x [band=60]
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert("RGB"), dtype=np.float32)
sx = int(sys.argv[3]); band = int(sys.argv[4]) if len(sys.argv) > 4 else 60
h = min(a.shape[0], b.shape[0]); a, b = a[:h], b[:h]; d = a - b
y = d[..., 0]*0.29889531 + d[..., 1]*0.58662247 + d[..., 2]*0.11448223
i = d[..., 0]*0.59597799 - d[..., 1]*0.27417610 - d[..., 2]*0.32180189
q = d[..., 0]*0.21147017 - d[..., 1]*0.52261711 + d[..., 2]*0.31114694
bad = (0.5053*y*y + 0.299*i*i + 0.1957*q*q) > 35215*0.01
tot = bad.size
for y0 in range(0, h, band):
    L, R = bad[y0:y0+band, :sx], bad[y0:y0+band, sx:]
    print(f"y {y0:4d}  left {100*L.mean():5.1f}% ({100*L.sum()/tot:4.2f}pp)  right {100*R.mean():5.1f}% ({100*R.sum()/tot:4.2f}pp)")
