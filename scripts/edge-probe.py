# Scans across an edge and reports the darkest pixel (the border line) in reference vs current.
# Usage: python scripts/edge-probe.py <reference.png> <current.png> name:h|v,x,y,len [...]
#   h = scan horizontally from (x,y) for len px; v = scan vertically.
import sys
import numpy as np
from PIL import Image
ref = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.float32)
cur = np.asarray(Image.open(sys.argv[2]).convert("RGB"), dtype=np.float32)
hx = lambda c: "#%02x%02x%02x" % tuple(int(round(v)) for v in c)
def probe(img, d, x, y, n):
    line = img[y, x:x+n] if d == "h" else img[y:y+n, x]
    lum = line @ np.array([.299, .587, .114])
    i = int(np.argmin(lum)); bg = line[np.argmax(lum)]
    return i, line[i], bg
for spec in sys.argv[3:]:
    name, rest = spec.split(":"); d, x, y, n = rest.split(","); x, y, n = int(x), int(y), int(n)
    (ia, ca, ba), (ib, cb, bb) = probe(ref, d, x, y, n), probe(cur, d, x, y, n)
    print(f"{name:<20} ref {hx(ca)} @{ia:+3d} (fill {hx(ba)})  cur {hx(cb)} @{ib:+3d} (fill {hx(bb)})  shift {ib-ia:+d}")
