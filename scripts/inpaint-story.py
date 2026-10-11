# Removes the design's baked-in text from a story panel by inpainting only the text strokes inside the
# given boxes; all other pixels stay exactly as designed.
# Usage: python scripts/inpaint-story.py <design.png> <boxes.json> <out.png> [light|dark]
import json, sys
import cv2
import numpy as np
design, boxes_file, out = sys.argv[1], sys.argv[2], sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else "light"
geo = json.load(open(boxes_file))
p = geo["panel"]; x, y, w, h = round(p["x"]), round(p["y"]), round(p["w"]), round(p["h"])
img = cv2.imread(design)[y:y + h, x:x + w].copy()
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
bg = cv2.medianBlur(img, 21)
bgray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY).astype(np.float32)
diff = (gray - bgray) if mode == "light" else (bgray - gray)
# Colourful text (gradients, coloured words) also counts: compare full colour distance.
cdist = np.abs(img.astype(np.float32) - bg.astype(np.float32)).max(axis=2)
strokes = ((diff > 18) | (cdist > 40)).astype(np.uint8)
mask = np.zeros((h, w), np.uint8)
for b in geo["boxes"]:
    x0, y0 = max(0, int(b["x"]) - 14), max(0, int(b["y"]) - 8)
    x1, y1 = min(w, int(b["x"] + b["w"]) + 14), min(h, int(b["y"] + b["h"]) + 8)
    mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], strokes[y0:y1, x0:x1])
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2) * 255
res = cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)
cv2.imwrite(out, res)
print(out, "masked px", int((mask > 0).sum()))
