# Compares average colours (5x5) at named points in reference vs current screenshot.
# Usage: python scripts/sample-colors.py <reference.png> <current.png> name:x,y [name:x,y ...]
import sys
import numpy as np
from PIL import Image
ref = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.float32)
cur = np.asarray(Image.open(sys.argv[2]).convert("RGB"), dtype=np.float32)
hx = lambda c: "#%02x%02x%02x" % tuple(int(round(v)) for v in c)
for spec in sys.argv[3:]:
    name, xy = spec.split(":"); x, y = map(int, xy.split(","))
    a = ref[y-2:y+3, x-2:x+3].reshape(-1, 3).mean(0); b = cur[y-2:y+3, x-2:x+3].reshape(-1, 3).mean(0)
    print(f"{name:<22} ref {hx(a)}  cur {hx(b)}  delta {np.abs(a-b).max():5.1f}")
