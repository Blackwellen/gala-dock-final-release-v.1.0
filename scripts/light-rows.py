# Row bands of light (white) text on a dark panel, reference vs current, columns x0..x1.
import sys
import numpy as np
from PIL import Image
def bands(p, x0, x1):
    g = np.asarray(Image.open(p).convert("L"), dtype=np.float32)[:, x0:x1]
    frac = (g > 232).mean(1); rows = []; s = None
    for y, f in enumerate(frac):
        if f > 0.012 and s is None: s = y
        if f <= 0.012 and s is not None:
            if y - s >= 3: rows.append((s, y))
            s = None
    return rows
x0, x1 = int(sys.argv[3]), int(sys.argv[4])
r, c = bands(sys.argv[1], x0, x1), bands(sys.argv[2], x0, x1)
for i in range(max(len(r), len(c))):
    a = r[i] if i < len(r) else None; b = c[i] if i < len(c) else None
    print(a, b, (b[0]-a[0], (b[1]-b[0])-(a[1]-a[0])) if a and b else "")
