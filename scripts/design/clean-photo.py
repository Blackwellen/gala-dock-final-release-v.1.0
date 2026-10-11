"""Remove baked-in card UI (badge pill, heart button, gallery counter, carousel arrow) from photo crops.
Card overlays sit at fixed corners in every Gala Dock card; the badge width is measured from the pill's
clean top edge. Live components re-render these overlays on top, so inpainted areas stay covered."""
import sys, cv2, numpy as np

def pill_box(im, x0, y_lo, y_hi):
    """Find a uniform-colour pill starting near x0: returns (x,y,w,h) or None."""
    h, w = im.shape[:2]
    col = im[:, x0].astype(int)
    for y in range(y_lo, y_hi):
        run = im[y:y+4, x0:x0+10].reshape(-1, 3).astype(int)
        if run.std(axis=0).max() > 9: continue
        c = run.mean(axis=0)
        # walk right along y+2 while colour stays close (top edge of pill carries no glyphs)
        x = x0
        while x < w - 2 and np.abs(im[y+2, x].astype(int) - c).max() < 38: x += 1
        if x - x0 < 24: continue
        y2, gap = y, 0
        while y2 < h - 1 and gap <= 6:
            gap = 0 if np.abs(im[y2, x0+2].astype(int) - c).max() < 38 else gap + 1
            y2 += 1
        y2 -= gap
        if 10 <= y2 - y <= 40: return (max(0, x0-8), max(0, y-5), x - x0 + 22, y2 - y + 10)
    return None

def clean(im, badge=True, heart=True, counter=True, arrow=False):
    h, w = im.shape[:2]
    m = np.zeros((h, w), np.uint8)
    s = h / 146  # card photos are ~146px tall at reference scale
    if badge:
        b = pill_box(im, max(8, int(12*s)), 2, int(h*.3))
        if b: x, y, bw, bh = b; m[y:y+bh, x:x+bw] = 255
    if heart:
        big = h >= 100
        r = 19 if big else 15; cx, cy = w - (27 if big else 21), (27 if big else 20)
        cv2.circle(m, (cx, cy), r, 255, -1)
    if counter and h >= 110:
        m[h-int(36*s):h-int(4*s), w-int(78*s):w-int(4*s)] = 255
    if arrow:
        cv2.circle(m, (w-int(14*s), h//2), int(22*s), 255, -1)
    return cv2.inpaint(im, m, 9, cv2.INPAINT_TELEA)

if __name__ == '__main__':
    flags = {a.lstrip('-') for a in sys.argv[1:] if a.startswith('--')}
    for p in [a for a in sys.argv[1:] if not a.startswith('--')]:
        im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
        out = clean(im, 'badge' in flags, 'noheart' not in flags, 'nocounter' not in flags, 'arrow' in flags)
        cv2.imencode('.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(p)
