"""Find card edges along scanlines in an image (border pixels between page/card backgrounds).
Usage: python -I scripts/design/scan.py <image.png> x=<X>[,<X2>...] y=<Y>[,...]
  x=<X>  -> vertical scan at column X, prints y of edges;  y=<Y> -> horizontal scan at row Y, prints x of edges."""
import sys, cv2, numpy as np
im = cv2.imdecode(np.fromfile(sys.argv[1], np.uint8), cv2.IMREAD_GRAYSCALE).astype(int)
def edges(line):
    out = []
    for i in range(1, len(line) - 1):
        v = line[i]
        # border pixel: noticeably darker than both near-white neighbours
        if 225 <= v <= 247 and line[i - 1] >= v + 3 and line[i + 1] >= v + 3 and min(line[i - 1], line[i + 1]) >= 240:
            if not out or i - out[-1] > 3: out.append(i)
    return out
for a in sys.argv[2:]:
    k, vals = a.split("=")
    for v in map(int, vals.split(",")):
        e = edges(im[:, v]) if k == "x" else edges(im[v, :])
        print(f"{k}={v}: {e}")
