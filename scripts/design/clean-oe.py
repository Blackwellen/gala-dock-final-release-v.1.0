"""Organizer event cards (#37): strip heart, menu button and bottom-left status chips from cover crops."""
import json, os, cv2, numpy as np
REF = 'Designs/customer & Organizer workspace'; files = sorted(os.listdir(REF))
idx = json.load(open('artifacts/references/detect/index.json')); m = json.load(open('scripts/design/photo-map.json'))
src = cv2.imdecode(np.fromfile(os.path.join(REF, files[37]), np.uint8), 1)
for name, (d, k, kind) in m.items():
    if not name.startswith('oe-'): continue
    x, y, w, h = idx[d]['boxes'][k]; im = src[y+1:y+h-1, x+1:x+w-1].copy(); h, w = im.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    cv2.circle(mask, (w - 62, 24), 19, 255, -1)
    mask[2:46, w - 48:w] = 255
    out = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
    out = out[:int(h * .63)]  # crop above the status chips
    cv2.imencode('.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(f'public/assets/gd/{name}.webp')
    print(name, w, h)
