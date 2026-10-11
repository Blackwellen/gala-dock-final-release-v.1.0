"""Detect card rectangles (light-bordered panels) in a design reference and match them to our DOM boxes.
Usage: python -I scripts/design/ref-boxes.py <reference.png> <components.json> [min_w] [min_h]
Prints each reference card and the nearest DOM component with dx/dy/dw/dh deltas (px)."""
import sys, json, cv2, numpy as np
ref, comp = sys.argv[1], sys.argv[2]
mw = int(sys.argv[3]) if len(sys.argv) > 3 else 120; mh = int(sys.argv[4]) if len(sys.argv) > 4 else 60
im = cv2.imdecode(np.fromfile(ref, np.uint8), cv2.IMREAD_COLOR)
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.int16)
# Card borders: thin lines slightly darker than the near-white page (#f7f9fd → ~#e6ebf5).
lo = int(sys.argv[5]) if len(sys.argv) > 5 else 232; hi = int(sys.argv[6]) if len(sys.argv) > 6 else 248
edges = ((g <= hi) & (g >= lo)).astype(np.uint8) * 255
h_lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (60, 1)))
v_lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40)))
grid = cv2.dilate(cv2.bitwise_or(h_lines, v_lines), np.ones((3, 3), np.uint8))
cnts, hier = cv2.findContours(grid, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
boxes = []
for c in cnts:
    x, y, w, h = cv2.boundingRect(c)
    if w >= mw and h >= mh and w < im.shape[1] * 0.97: boxes.append((x, y, w, h))
# de-duplicate near-identical boxes
uniq = []
for b in sorted(boxes, key=lambda b: (b[1], b[0])):
    if not any(abs(b[0]-u[0]) < 6 and abs(b[1]-u[1]) < 6 and abs(b[2]-u[2]) < 10 and abs(b[3]-u[3]) < 10 for u in uniq): uniq.append(b)
dom = json.load(open(comp, encoding="utf8"))["components"]
for (x, y, w, h) in uniq:
    best = min(dom, key=lambda d: abs(d["x"]-x) + abs(d["y"]-y) + abs(d["w"]-w)*.5 + abs(d["h"]-h)*.5) if dom else None
    if best is None: print(f"ref {x},{y} {w}x{h}"); continue
    print(f"ref {x:4},{y:4} {w:4}x{h:<4} <-> {best['sel']}[{best['label'][:24]}] dx={best['x']-x:+} dy={best['y']-y:+} dw={best['w']-w:+} dh={best['h']-h:+}")
