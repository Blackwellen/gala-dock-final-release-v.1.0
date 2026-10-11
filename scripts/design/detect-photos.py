"""Detect photographic regions in a design reference. Photos are textured/saturated; UI is flat.
Usage: python -I scripts/design/detect-photos.py <design.png> <out_prefix>
Writes <out_prefix>.json (boxes) and <out_prefix>.jpg (annotated)."""
import sys, json, cv2, numpy as np
src, out = sys.argv[1], sys.argv[2]
im = cv2.imdecode(np.fromfile(src, np.uint8), cv2.IMREAD_COLOR)
h, w = im.shape[:2]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
# Local texture: std dev in 7x7 window.
f = gray.astype(np.float32)
mu = cv2.blur(f, (7, 7)); var = cv2.blur(f*f, (7, 7)) - mu*mu
tex = np.sqrt(np.maximum(var, 0))
nonwhite = ((gray < 236) | (hsv[...,1] > 30)).astype(np.uint8)
mask = cv2.morphologyEx(nonwhite, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
boxes = []
for i in range(1, n):
    x, y, bw, bh, area = stats[i]
    if bw < 22 or bh < 22 or area < 0.86 * bw * bh: continue
    if bw > 0.98 * w and bh > 0.9 * h: continue
    # require photographic colour richness
    roi = im[y:y+bh, x:x+bw]
    if len(np.unique((roi[::2, ::2] // 16).reshape(-1, 3), axis=0)) < 45: continue
    if tex[y:y+bh, x:x+bw].mean() < 7: continue
    boxes.append([int(x), int(y), int(bw), int(bh)])
boxes.sort(key=lambda b: (b[1] // 20, b[0]))
ann = im.copy()
for k, (x, y, bw, bh) in enumerate(boxes):
    cv2.rectangle(ann, (x, y), (x+bw, y+bh), (0, 0, 255), 2)
    cv2.putText(ann, str(k), (x+3, y+18), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 255, 255), 2)
cv2.imencode('.jpg', ann)[1].tofile(out + '.jpg')
json.dump(boxes, open(out + '.json', 'w'))
print(len(boxes), 'regions')
