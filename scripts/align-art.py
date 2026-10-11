# Finds the background scale/offset that best aligns a regenerated art image with the reference panel.
# Usage: python scripts/align-art.py <reference.png> <art.png> <panel_w> <panel_h> [x0 y0]
import sys
import numpy as np
from PIL import Image
ref_path, art_path, pw, ph = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
x0, y0 = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (0, 0)
k = 4  # work at 1/4 resolution
ref = np.asarray(Image.open(ref_path).convert("L").crop((x0, y0, x0 + pw, y0 + ph)).resize((pw // k, ph // k)), dtype=np.float32)
art = Image.open(art_path).convert("L")
best = (1e9, None)
for scale in np.arange(0.96, 1.16, 0.01):
    w, h = int(pw * scale / k), int(ph * scale / k)
    a = np.asarray(art.resize((w, h)), dtype=np.float32)
    for dx in range(0, w - pw // k + 1):
        for dy in range(0, h - ph // k + 1):
            crop = a[dy:dy + ph // k, dx:dx + pw // k]
            err = float(np.mean(np.abs(crop - ref)))
            if err < best[0]:
                best = (err, (round(scale, 2), dx * k, dy * k))
base = float(np.mean(np.abs(np.asarray(art.resize((pw // k, ph // k)), dtype=np.float32) - ref)))
print(f"stretched-to-fit MAE {base:.2f}; best MAE {best[0]:.2f} at scale {best[1][0]} offset x={best[1][1]} y={best[1][2]}px")
