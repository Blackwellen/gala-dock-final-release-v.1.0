"""Remove baked-in card UI from listing photos: top-left status pill, top-right heart, bottom-right counter, carousel dots.
Usage: python -I scripts/design/clean-badges.py <file.webp>... (in place). Writes a debug sheet to artifacts/references/detect/badges.jpg."""
import sys, cv2, numpy as np
def pill_mask(im):
    """Pills sit at a fixed inset (~3% x, ~9% y). Walk the top edge row (no glyphs) right while the colour matches the pill."""
    h, w = im.shape[:2]; m = np.zeros((h, w), np.uint8)
    x0 = max(4, int(w * .045)); best = None
    for y in range(int(h * .06), int(h * .16)):
        c = im[y, x0].astype(int); row = im[y]
        if not (c.min() > 200 or (np.ptp(c) > 60 and c.max() > 140)): continue  # white or saturated pill colour
        x, miss = x0, 0
        while x < int(w * .7) and miss < 3:
            miss = 0 if np.abs(row[x].astype(int) - c).max() < 40 else miss + 1; x += 1
        width = x - x0
        if width >= 28 and (best is None or width > best[1]): best = (y, width, c)
    if best:
        y, width, c = best
        y2 = y
        while y2 < int(h * .4) and np.abs(im[y2, x0].astype(int) - c).max() < 50: y2 += 1
        ys = y
        while ys > 0 and np.abs(im[ys - 1, x0 + 6].astype(int) - c).max() < 50: ys -= 1
        m[max(0, ys - 4):min(h, y2 + 4), max(0, x0 - 7):min(w, x0 + width + 6)] = 255
    return m
def clean(im):
    h, w = im.shape[:2]; m = pill_mask(im)
    r = max(11, int(h * .095)); cv2.circle(m, (w - int(h * .105), int(h * .105)), r, 255, -1)          # heart
    m[h - int(h * .19):h - 3, w - int(w * .2):w - 3] = 255                                              # counter
    cv2.rectangle(m, (w // 2 - int(w * .06), h - int(h * .12)), (w // 2 + int(w * .06), h - int(h * .03)), 255, -1)  # dots
    return cv2.inpaint(im, m, 7, cv2.INPAINT_TELEA), m
if __name__ == "__main__":
    tiles = []
    for p in sys.argv[1:]:
        im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR); out, m = clean(im)
        cv2.imencode(".webp", out, [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(p)
        a = cv2.resize(out, (240, 130)); tiles.append(a)
    while len(tiles) % 6: tiles.append(np.full((130, 240, 3), 255, np.uint8))
    cv2.imwrite("artifacts/references/detect/badges.jpg", np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]))
