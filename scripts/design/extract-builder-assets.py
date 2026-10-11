"""Extract production image assets for the event/venue builder screens, 1:1 from the design references.

Sources (all 1536x1024, native grid -- coordinates below are page pixels in that grid):
  VM  = Neon Nights Festival Venue Map Builder.png
  PB  = Neon Nights Festival Poster Builder.png
  PE  = Neon Nights Festival Page Editor.png
  PL  = GalaDock Wedding Event Planner Dashboard.png
  WE  = Gala·Dock Wedding Event Dashboard.png

Outputs: public/assets/gd/builder/{venue-map,poster,page-editor,build}/ + manifest.json + _contact-sheet.png
Photos -> WebP q92 at native resolution. Icons/glyphs -> PNG with alpha (un-premultiplied off the flat tile bg).
Baked-in UI overlays (badges, map controls, selection handles) are removed with masked inpainting: tiny
regions use cv2 TELEA, larger ones an exemplar (Criminisi-style patch copy) fill so photo texture is kept.

Usage (from repo root):  python scripts/design/extract-builder-assets.py
Deterministic: no randomness; boxes are constants or derived from constant search regions by pixel scans.
"""
import json, os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, 'Designs', 'customer & Organizer workspace')
OUT = os.path.join(ROOT, 'public', 'assets', 'gd', 'builder')
SRC = {
    'VM': 'Neon Nights Festival Venue Map Builder.png',
    'PB': 'Neon Nights Festival Poster Builder.png',
    'PE': 'Neon Nights Festival Page Editor.png',
    'PL': 'GalaDock Wedding Event Planner Dashboard.png',
    'WE': 'Gala·Dock Wedding Event Dashboard.png',
}
NATIVE = (1536, 1024)
MANIFEST = []


def load(key):
    im = cv2.imdecode(np.fromfile(os.path.join(D, SRC[key]), np.uint8), cv2.IMREAD_COLOR)
    assert (im.shape[1], im.shape[0]) == NATIVE, f'{SRC[key]} is {im.shape[1]}x{im.shape[0]}; rescale boxes'
    return im


# ---------------------------------------------------------------------------------------------- helpers
def bg_of(im, box):
    """Median colour of the 1px ring of a page box (the flat surface an object sits on)."""
    x0, y0, x1, y1 = box
    ring = np.concatenate([im[y0, x0:x1], im[y1 - 1, x0:x1], im[y0:y1, x0], im[y0:y1, x1 - 1]])
    return np.median(ring, 0)


def find_object(im, region, tol=28, inset=1):
    """Bounding box (page coords, x1/y1 exclusive) of the largest non-background blob in a search region,
    then inset so anti-aliased card edges/borders are excluded."""
    x0, y0, x1, y1 = region
    c = im[y0:y1, x0:x1].astype(np.float32)
    bg = bg_of(im, region)
    m = (np.linalg.norm(c - bg, axis=2) > tol).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    bx, by, bw, bh = st[i, :4]
    return [x0 + bx + inset, y0 + by + inset, x0 + bx + bw - inset, y0 + by + bh - inset]


def trim_to_content(im, box, bg, tol=22, max_corner=10):
    """Shrink a box while any whole edge row/col is mostly background (handles slight rotations/shadows)."""
    x0, y0, x1, y1 = box
    def frac(a):
        return float((np.linalg.norm(a.astype(np.float32) - bg, axis=-1) < tol).mean())
    for _ in range(40):
        f = {'t': frac(im[y0, x0 + max_corner:x1 - max_corner]), 'b': frac(im[y1 - 1, x0 + max_corner:x1 - max_corner]),
             'l': frac(im[y0 + max_corner:y1 - max_corner, x0]), 'r': frac(im[y0 + max_corner:y1 - max_corner, x1 - 1])}
        k = max(f, key=f.get)
        if f[k] < 0.02:
            break
        if k == 't': y0 += 1
        elif k == 'b': y1 -= 1
        elif k == 'l': x0 += 1
        else: x1 -= 1
    return [x0, y0, x1, y1]


def corner_mask(crop, bg, r=10, tol=40):
    """Mask of page-background pixels in the four r x r corners (rounded-card corners), grown by 1px."""
    h, w = crop.shape[:2]
    d = np.linalg.norm(crop.astype(np.float32) - bg, axis=2) < tol
    m = np.zeros((h, w), np.uint8)
    for ys, xs in ((slice(0, r), slice(0, r)), (slice(0, r), slice(w - r, w)),
                   (slice(h - r, h), slice(0, r)), (slice(h - r, h), slice(w - r, w))):
        sub = d[ys, xs].astype(np.uint8)
        # keep only bg pixels connected to the actual corner pixel
        n, lab = cv2.connectedComponents(sub)
        cy = 0 if ys.start == 0 else sub.shape[0] - 1
        cx = 0 if xs.start == 0 else sub.shape[1] - 1
        if sub[cy, cx]:
            m[ys, xs] |= (lab == lab[cy, cx]).astype(np.uint8)
    return cv2.dilate(m, np.ones((3, 3), np.uint8)) * 255


def exemplar_inpaint(img, mask, half=3, search=None, seam_blur=False):
    """Criminisi et al. exemplar-based inpainting: fill order by confidence x data term (isophote strength along
    the fill front, so linear structures like mullions/handrails propagate first), best SSD patch from the
    known region (whole crop when search=None). img uint8 BGR, mask uint8 (255 = fill)."""
    p = half
    pad = p + 1
    im = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REFLECT).astype(np.float32)
    hole = np.ones(im.shape[:2], bool)
    hole[pad:-pad, pad:-pad] = mask > 0
    border = np.ones(hole.shape, bool); border[pad:-pad, pad:-pad] = False
    src_ok = (~hole & ~border).astype(np.uint8)
    src_valid = cv2.erode(src_ok, np.ones((2 * p + 1, 2 * p + 1), np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0).astype(bool)
    target = hole & ~border
    known = ~hole
    conf = known.astype(np.float32)
    H, W = target.shape
    k = np.ones((2 * p + 1, 2 * p + 1), np.float32)
    sy_all, sx_all = np.nonzero(src_valid)
    while target.any():
        kn8 = known.astype(np.uint8)
        front = target & cv2.dilate(kn8, np.ones((3, 3), np.uint8)).astype(bool)
        if not front.any():
            front = target
        cpatch = cv2.filter2D(conf, -1, k, borderType=cv2.BORDER_CONSTANT) / k.sum()
        gray = cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
        gray[~known] = 0
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        bad = cv2.dilate((~known).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        gx[bad] = 0; gy[bad] = 0
        # strongest known isophote in each patch neighbourhood
        mag = gx * gx + gy * gy
        mx = cv2.dilate(mag, np.ones((2 * p + 1, 2 * p + 1), np.uint8))
        nm = cv2.GaussianBlur(kn8.astype(np.float32), (5, 5), 0)
        nx = cv2.Sobel(nm, cv2.CV_32F, 1, 0, ksize=3); ny = cv2.Sobel(nm, cv2.CV_32F, 0, 1, ksize=3)
        ys, xs = np.nonzero(front)
        # isophote at front = gradient rotated 90deg, from the strongest-gradient pixel nearby (approx via mx)
        data = np.sqrt(mx[ys, xs]) / 255.0
        n_len = np.sqrt(nx[ys, xs] ** 2 + ny[ys, xs] ** 2) + 1e-6
        # use local gradient direction (box-averaged) for the dot product with the normal
        gxs = cv2.blur(gx, (2 * p + 1, 2 * p + 1))[ys, xs]; gys = cv2.blur(gy, (2 * p + 1, 2 * p + 1))[ys, xs]
        g_len = np.sqrt(gxs ** 2 + gys ** 2) + 1e-6
        dot = np.abs((-gys) * nx[ys, xs] + gxs * ny[ys, xs]) / (g_len * n_len)
        pri = cpatch[ys, xs] * (0.001 + data * dot)
        j = int(np.argmax(pri))
        y, x = int(np.clip(ys[j], p, H - p - 1)), int(np.clip(xs[j], p, W - p - 1))
        tp = im[y - p:y + p + 1, x - p:x + p + 1]
        tk = known[y - p:y + p + 1, x - p:x + p + 1]
        if search is None:
            cy, cx = sy_all, sx_all
        else:
            sel = (np.abs(sy_all - y) <= search) & (np.abs(sx_all - x) <= search)
            cy, cx = (sy_all[sel], sx_all[sel]) if sel.any() else (sy_all, sx_all)
        ssd = np.zeros(len(cy), np.float32)
        for dy in range(-p, p + 1):
            for dx in range(-p, p + 1):
                if tk[dy + p, dx + p]:
                    ssd += ((im[cy + dy, cx + dx] - tp[dy + p, dx + p]) ** 2).sum(1)
        # mild preference for nearby sources (keeps local lighting coherent)
        ssd += 0.5 * ((cy - y) ** 2 + (cx - x) ** 2)
        i = int(np.argmin(ssd))
        sy, sx = cy[i], cx[i]
        fill = ~tk
        im[y - p:y + p + 1, x - p:x + p + 1][fill] = im[sy - p:sy + p + 1, sx - p:sx + p + 1][fill]
        conf[y - p:y + p + 1, x - p:x + p + 1][fill] = cpatch[y, x]
        known[y - p:y + p + 1, x - p:x + p + 1] |= fill
        target[y - p:y + p + 1, x - p:x + p + 1] &= ~fill
    out = im[pad:-pad, pad:-pad]
    if seam_blur:
        blur = cv2.GaussianBlur(out, (3, 3), 0)
        m = mask > 0
        out[m] = 0.6 * out[m] + 0.4 * blur[m]
    return np.clip(out, 0, 255).astype(np.uint8)


def page_rect_mask(shape, origin, rects, grow=0):
    m = np.zeros(shape[:2], np.uint8)
    ox, oy = origin
    for a, b, c, d in rects:
        m[max(0, b - oy - grow):max(0, d - oy + grow), max(0, a - ox - grow):max(0, c - ox + grow)] = 255
    return m


def rel(path):
    return 'public/assets/gd/builder/' + path


def save_photo(crop, path, src, box, use, status='ok', note=None):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    cv2.imencode('.webp', crop, [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(full)
    rec(path, src, box, crop.shape, use, status, note)


def rec(path, src, box, shape, use, status='ok', note=None):
    e = {'file': rel(path), 'source': SRC[src], 'box': [int(v) for v in box],
         'size': [int(shape[1]), int(shape[0])], 'use': use, 'status': status}
    if note:
        e['note'] = note
    MANIFEST.append(e)


def photo(im, src, box, path, use, overlays=None, corners=True, corner_r=10, note=None):
    """Crop a photo at native res; fill rounded-corner bg bleed; remove overlays.
    overlays: list of (page_rect, method) with method 'ns' (Navier-Stokes, smooth areas: water, bokeh),
    'telea', or 'exemplar' (patch copy, textured areas)."""
    x0, y0, x1, y1 = box
    crop = im[y0:y1, x0:x1].copy()
    for r, method in overlays or []:
        m = page_rect_mask(crop.shape, (x0, y0), [r])
        if method == 'exemplar':
            crop = exemplar_inpaint(crop, m, half=2, search=30)
        else:
            crop = cv2.inpaint(crop, m, 4, cv2.INPAINT_NS if method == 'ns' else cv2.INPAINT_TELEA)
    if corners:
        bg = bg_of(im, (x0 - 3, y0 - 3, x1 + 3, y1 + 3))
        cm = corner_mask(crop, bg, corner_r)
        if cm.any():
            crop = cv2.inpaint(crop, cm, 3, cv2.INPAINT_TELEA)
    save_photo(crop, path, src, box, use, note=note)
    return crop


def glyph(im, src, box, path, use, bg=None, min_alpha=0.04, pad=1):
    """Lift an icon glyph off a flat background onto transparency (alpha + un-premultiplied colour)."""
    x0, y0, x1, y1 = box
    c = im[y0:y1, x0:x1].astype(np.float32)
    bg = bg_of(im, box) if bg is None else np.array(bg, np.float32)
    d = np.linalg.norm(c - bg, axis=2)
    ref = np.percentile(d[d > 8], 92) if (d > 8).sum() > 10 else d.max()
    a = np.clip(d / max(ref, 1), 0, 1)
    a[a < min_alpha] = 0
    col = bg + (c - bg) / np.maximum(a, 1e-3)[..., None]
    col = np.clip(col, 0, 255)
    rgba = np.dstack([col[..., ::-1], a * 255]).astype(np.uint8)  # BGR->RGB + A
    ys, xs = np.nonzero(a > 0)
    ty0, ty1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
    tx0, tx1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    rgba = rgba[ty0:ty1, tx0:tx1]
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(full, optimize=True)
    rec(path, src, [x0 + tx0, y0 + ty0, x0 + tx1, y0 + ty1], rgba.shape, use)


def tile_png(im, src, box, path, use, radius=12):
    """Coloured rounded icon tile on white page -> PNG with anti-aliased rounded-rect alpha."""
    x0, y0, x1, y1 = box
    c = im[y0:y1, x0:x1]
    h, w = c.shape[:2]
    ss = 4
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius * ss, fill=255)
    a = np.array(m.resize((w, h), Image.LANCZOS))
    rgba = np.dstack([c[..., ::-1], a]).astype(np.uint8)
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(full, optimize=True)
    rec(path, src, box, rgba.shape, use)


# =================================================================================== 1. VENUE MAP BUILDER
VM = load('VM')
# Map canvas card: outer edge x 507..1199, y 228..986 (scanned); crop 1px inside the anti-aliased edge.
# The bottom 41px (y 945..985) is a decorative tree/road strip crossed by the "Show legend" and zoom pills;
# no inpainting method reconstructed that perspective texture cleanly (NS/TELEA/exemplar tested), so the base
# map stops at y=944.
VM_CANVAS = (508, 229, 1198, 944)
VM_CHROME = [  # floating UI controls baked over the illustration (page coords, incl. soft shadow)
    ((1020, 235, 1112, 280), 'ns'),        # 2D / 3D segmented toggle (over open water)
    ((1115, 235, 1152, 303), 'ns'),        # zoom + / - stack (over open water)
    ((1158, 236, 1192, 270), 'exemplar'),  # fullscreen button (over terrace foliage -> patch copy)
]
photo(VM, 'VM', VM_CANVAS, 'venue-map/site-base.webp',
      'Venue map builder canvas background (aerial festival site illustration, Riverside Park). Map UI chrome '
      '(2D/3D toggle, zoom, fullscreen, legend & zoom pills) removed; zone fills, signage and zone captions are part '
      'of the illustration and retained. Bottom 41px decorative strip trimmed (covered by legend/zoom pills).',
      overlays=VM_CHROME, corner_r=12)
MANIFEST.append({'file': rel('venue-map/site-base-unlabelled.webp'), 'source': SRC['VM'], 'box': list(VM_CANVAS),
                 'size': [VM_CANVAS[2] - VM_CANVAS[0], VM_CANVAS[3] - VM_CANVAS[1]],
                 'use': 'Label/zone-free base map so app-rendered zone polygons, pins and captions can be overlaid',
                 'status': 'needs-regeneration',
                 'reason': 'Zone tints (GA blue, VIP purple, table-seating sand), green route dashes, entrance pins and '
                           'zone captions are painted into the illustration across ~40% of the canvas; inpainting cannot '
                           'reconstruct the crowd/seating texture underneath. Not shipped.'})

# Element-details thumbnail ("General Admission Zone" stage photo)
b = find_object(VM, (1218, 282, 1324, 346))
photo(VM, 'VM', b, 'venue-map/thumb-ga-zone.webp', 'Element details panel thumbnail for the selected GA zone', corner_r=6)

# Element palette ("Map tools > Place"), 4x4 tiles. Tile borders scanned: cols/rows below (x1/y1 exclusive).
VM_COLS = [(244, 301), (306, 363), (369, 426), (433, 489)]
VM_ROWS = [(338, 391), (397, 450), (457, 510), (517, 571)]
VM_TOOLS = ['seating-fixed', 'table', 'ga-zone', 'vip-area', 'stage', 'bar', 'toilet', 'entrance-exit',
            'barrier', 'path-route', 'booth', 'camera', 'staff-zone', 'kill-seats', 'sponsor-area', 'custom-area']
for i, name in enumerate(VM_TOOLS):
    (cx0, cx1), (ry0, ry1) = VM_COLS[i % 4], VM_ROWS[i // 4]
    # glyph band: tile top+5 .. top+29 (label text starts ~top+30); 3px inside the tile border
    glyph(VM, 'VM', (cx0 + 3, ry0 + 5, cx1 - 3, ry0 + 29), f'venue-map/icon-{name}.png',
          f'Element palette tool icon: {name.replace("-", " ")}')

# Organizer-overlay legend swatches (Venue layers panel), centre x 275, radius ~7
for yc, name in zip([805, 827, 849, 871, 893, 915, 937],
                    ['vip-areas', 'ga-zones', 'tables-booths', 'camera-production', 'staff-only', 'kill-seats', 'paths-barriers']):
    glyph(VM, 'VM', (266, yc - 9, 285, yc + 10), f'venue-map/legend-{name}.png', f'Map legend swatch: {name.replace("-", " ")}',
          min_alpha=0.06, pad=0)

# ================================================================================== 2. POSTER BUILDER
PB = load('PB')
# Main artwork: selection frame lines at x=693/1081, y=269/787 (scanned) -> crop inside the frame.
PB_POSTER = (695, 271, 1080, 786)
x0, y0, x1, y1 = PB_POSTER
crop = PB[y0:y1, x0:x1].copy()
# 8 resize handles (white squares w/ blue stroke, ~10px) poke ~4px inside the frame -> TELEA on light/blue px there.
hm = np.zeros(crop.shape[:2], np.uint8)
cc = crop.astype(np.int32)
handleish = ((cc.min(2) > 150) | ((cc[..., 0] > 170) & (cc[..., 2] < 140))).astype(np.uint8)
for hx, hy in [(693, 269), (887, 269), (1081, 269), (693, 519), (1081, 519), (693, 787), (887, 787), (1081, 787)]:
    a0, b0 = max(0, hx - 8 - x0), max(0, hy - 8 - y0)
    a1, b1 = min(crop.shape[1], hx + 8 - x0), min(crop.shape[0], hy + 8 - y0)
    hm[b0:b1, a0:a1] = handleish[b0:b1, a0:a1] * 255
hm = cv2.dilate(hm, np.ones((3, 3), np.uint8))
crop = cv2.inpaint(crop, hm, 3, cv2.INPAINT_TELEA)
save_photo(crop, 'poster/poster-main.webp', 'PB', PB_POSTER,
           'Poster builder canvas: full Neon Nights A3 poster artwork (selection frame & handles removed)')

# Template library (step 1). Search regions = card interiors above the caption; object = dark poster thumb.
PB_TEMPLATES = {
    'a3-poster': (246, 265, 340, 388), 'a4-poster': (350, 265, 445, 388), 'square': (452, 265, 546, 388),
    'portrait': (246, 434, 340, 538), 'story': (350, 434, 445, 538), 'landscape': (452, 434, 546, 538),
    'qr-poster': (246, 593, 312, 694), 'ticket-launch': (320, 593, 394, 694),
    'final-tickets': (400, 593, 472, 694), 'sold-out': (480, 593, 549, 694),
}
for name, region in PB_TEMPLATES.items():
    b = find_object(PB, region, tol=40)
    b = trim_to_content(PB, b, bg_of(PB, region), max_corner=3)
    photo(PB, 'PB', b, f'poster/template-{name}.webp', f'Template picker thumbnail: {name.replace("-", " ")}', corner_r=4)

# Variations strip (step 4)
PB_VARIANTS = {
    'a3-poster': (250, 847, 332, 946), 'a4-poster': (342, 847, 436, 946), 'square': (445, 847, 547, 946),
    'story': (559, 847, 646, 946), 'banner-16x9': (653, 847, 802, 946), 'qr-poster': (810, 847, 902, 946),
    'sold-out': (910, 847, 1019, 946),
}
for name, region in PB_VARIANTS.items():
    b = find_object(PB, region, tol=40)
    b = trim_to_content(PB, b, bg_of(PB, region), max_corner=3)
    photo(PB, 'PB', b, f'poster/variant-{name}.webp', f'Format variation preview thumbnail: {name.replace("-", " ")}', corner_r=4)

# Design tool rail icons (Text, Image, Shapes, Elements, QR Code, Background, Layers): centre x 611
for yc, name in zip([289, 349, 411, 474, 537, 600, 668], ['text', 'image', 'shapes', 'elements', 'qr-code', 'background', 'layers']):
    glyph(PB, 'PB', (597, yc - 12, 626, yc + 11), f'poster/tool-{name}.png', f'Poster design tool rail icon: {name}')

# Poster footer logos (white marks on the poster's black footer band) lifted onto transparency
for box, name, use in [((719, 759, 798, 780), 'logo-gala-dock-white', 'Gala·Dock wordmark (white) used on poster footers'),
                       ((833, 759, 912, 780), 'logo-alex-events-white', 'Organiser lockup "Alex Events" (white) for poster footers'),
                       ((989, 757, 1054, 781), 'logo-riverside-park-white', 'Venue lockup "Riverside Park" (white) for poster footers')]:
    glyph(PB, 'PB', box, f'poster/{name}.png', use, bg=(6, 4, 4))

# =================================================================================== 3. PAGE EDITOR
PE = load('PE')
b = find_object(PE, (1216, 588, 1516, 692))
photo(PE, 'PE', b, 'page-editor/hero-media.webp',
      'Hero media image (event page hero / "Hero media" picker preview) - clean, no overlay', corner_r=8)
MANIFEST.append({'file': rel('page-editor/hero-preview-large.webp'), 'source': SRC['PE'], 'box': [581, 265, 1185, 568],
                 'size': [604, 303], 'use': 'Large live-preview hero background',
                 'status': 'needs-regeneration',
                 'reason': 'Nav bar, title, date/venue lines, play button, tag pills and three gallery thumbs cover ~45% '
                           'of the hero; use page-editor/hero-media.webp (same photo, clean) until a large clean render exists.'})
# Hero gallery thumbnails (inside the 2px white/grey stroke)
for i, b in enumerate([(951, 522, 1020, 553), (1032, 522, 1092, 553), (1104, 522, 1164, 553)], 1):
    photo(PE, 'PE', b, f'page-editor/hero-gallery-{i}.webp', f'Hero media gallery thumbnail {i}', corners=False)

# Line-up artist photos; the pill badge (Headliner / Live / Special Guest / Resident) is removed.
# Pill rects measured at 3x zoom (+2px for anti-aliasing/shadow); backgrounds are blurred stage light -> NS.
for name, region, pill in [('dj-marcus-lee', (598, 858, 742, 952), (606, 868, 665, 892)),
                           ('elle-vance', (742, 858, 886, 952), (745, 868, 788, 892)),
                           ('the-neon-collective', (886, 858, 1030, 952), (895, 868, 970, 892)),
                           ('kairo', (1030, 858, 1174, 952), (1040, 868, 1095, 892))]:
    b = find_object(PE, region, tol=40)
    photo(PE, 'PE', b, f'page-editor/lineup-{name}.webp',
          f'Line-up artist card photo: {name.replace("-", " ").title()} (role pill removed)',
          overlays=[(pill, 'ns')], corner_r=8)

# Page-block list icons (left panel)
for yc, name in zip([305, 353, 401, 450, 499, 549, 599, 648, 699, 748, 799, 851],
                    ['hero-media', 'about', 'programme', 'performers', 'venue-map', 'tickets', 'accessibility',
                     'organiser', 'sponsors', 'faq', 'previous-media', 'related-events']):
    glyph(PE, 'PE', (274, yc - 12, 301, yc + 12), f'page-editor/block-{name}.png', f'Page block type icon: {name.replace("-", " ")}')
# Feature highlight icons in the about section
for (xc, yc), name in zip([(894, 610), (1010, 610), (1112, 610), (1010, 692)], ['line-up', 'location', 'food-drink', 'age-18']):
    glyph(PE, 'PE', (xc - 11, yc - 11, xc + 12, yc + 12), f'page-editor/feature-{name}.png', f'About-section feature icon: {name}')

# ============================================================================ 4. CUSTOMER BUILD CANVAS
WE = load('WE')
PL = load('PL')
# Package rows (WE): wide provider photos with a status pill top-right (pill rects measured at 3x zoom).
# The pill covers ~40% of the photo height over detailed content (window mullions + skyline, glassware, crowd,
# florals). NS/TELEA leave visible smears and exemplar fill produces blocky ghosts (all tested), so these are NOT
# shipped; recorded as needs-regeneration. (gd/b-loft, b-moments, b-elite-sounds already carry the same smear.)
for name, box, pill in [('b-loft', (47, 406, 294, 498), (188, 414, 289, 447)),
                        ('b-taste-tango', (47, 508, 294, 605), (162, 514, 289, 548)),
                        ('b-elite-sounds', (48, 614, 294, 710), (180, 620, 289, 655)),
                        ('b-moments', (48, 721, 294, 811), (182, 727, 289, 761))]:
    MANIFEST.append({'file': rel(f'build/{name}{"" if name == "b-taste-tango" else "-v2"}.webp'), 'source': SRC['WE'],
                     'box': list(box), 'size': [box[2] - box[0], box[3] - box[1]],
                     'use': f'Event package row photo ({name[2:].replace("-", " ").title()})', 'status': 'needs-regeneration',
                     'reason': f'Status pill {list(pill)} covers the top-right ~100x34px over detailed content; inpainting '
                               'leaves smears/ghosts. Needs a clean source render. In-app the status pill sits over this '
                               'same spot, so the existing gd/ version is usable as a stopgap.'})
# Planner package photos (PL) missing from gd/: The Loft & Elite Sounds (bc-* set)
for name, region in [('bc-loft', (511, 356, 676, 452)), ('bc-elite-sounds', (511, 702, 676, 801))]:
    b = find_object(PL, region, tol=40)
    photo(PL, 'PL', b, f'build/{name}.webp', f'Planner package card photo ({name[3:].replace("-", " ").title()})', corner_r=8)
# "Add to your event" category tiles (PL left rail): coloured rounded icon tiles
# Tile boxes: x 50..94 (44px), 41px tall; tops scanned on the white rows (Venue row is selected/blue-tinted,
# its top read from a 2x zoom). Fixed size so all tiles align.
for y0, name in zip([375, 423, 473, 524, 576, 630, 686, 741, 796, 852, 910],
                    ['venue', 'food-catering', 'drinks-bar', 'entertainment', 'media-content', 'styling-decor',
                     'staff-crew', 'production', 'hire-equipment', 'transport-accommodation', 'extras']):
    tile_png(PL, 'PL', (50, y0, 94, y0 + 41), f'build/cat-{name}.png',
             f'"Add to your event" category tile icon: {name.replace("-", " ")}')
# "Add more to your event" quick-add icons (WE)
for xc, name in zip([492, 560, 630, 700, 780, 872, 951, 1020],
                    ['catering', 'decor', 'photography', 'transport', 'accommodation', 'entertainment', 'flowers', 'more']):
    glyph(WE, 'WE', (xc - 13, 837, xc + 14, 862), f'build/add-{name}.png', f'"Add more to your event" quick-add icon: {name}')

# ============================================================================== manifest + contact sheet
MANIFEST.append({'file': 'public/assets/gd/am-*.webp, sg-*.webp, bc-tastetango.webp, bc-riverside-bars.webp, bc-styling.webp',
                 'source': SRC['PL'] + ' / ' + SRC['WE'], 'box': None, 'size': None,
                 'use': '"Add more to your event" (photographer, live band, transport, sweet cart, photo booth) and '
                        '"Smart suggestions" (live band, wedding decor, photo booth, transport) tiles already exist at '
                        'native resolution in public/assets/gd/ - reused, not duplicated', 'status': 'ok'})
with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump({'generator': 'scripts/design/extract-builder-assets.py', 'grid': '1536x1024 design pixels',
               'assets': MANIFEST}, f, indent=1, ensure_ascii=False)


def contact_sheet():
    items = [e for e in MANIFEST if e['status'] == 'ok' and e['file'].startswith('public/assets/gd/builder/')]
    cell_w, cell_h, cols = 220, 170, 7
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h + 30), (255, 255, 255))
    dr = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 11)
    except OSError:
        font = ImageFont.load_default()
    dr.text((8, 8), f'Gala Dock builder assets ({len(items)}) - checker = transparency', fill=(0, 0, 0), font=font)
    for i, e in enumerate(items):
        im = Image.open(os.path.join(ROOT, e['file'])).convert('RGBA')
        s = min((cell_w - 16) / im.width, (cell_h - 36) / im.height)
        s = min(s, 6.0)
        tw, th = max(1, int(im.width * s)), max(1, int(im.height * s))
        im = im.resize((tw, th), Image.NEAREST if s >= 1 else Image.LANCZOS)
        cx, cy = (i % cols) * cell_w, 30 + (i // cols) * cell_h
        chk = Image.new('RGBA', (tw, th))
        cd = ImageDraw.Draw(chk)
        arr = np.array(im)
        light = arr[..., 3].min() == 0 and arr[..., :3][arr[..., 3] > 128].mean() > 180  # white glyph -> dark checker
        c1, c2 = ((40, 40, 50), (70, 70, 80)) if light else ((205, 205, 205), (245, 245, 245))
        for yy in range(0, th, 8):
            for xx in range(0, tw, 8):
                cd.rectangle([xx, yy, xx + 7, yy + 7], fill=c1 if (xx + yy) // 8 % 2 else c2)
        chk.alpha_composite(im)
        sheet.paste(chk.convert('RGB'), (cx + (cell_w - tw) // 2, cy + 6))
        label = e['file'].replace('public/assets/gd/builder/', '')
        dr.text((cx + 6, cy + cell_h - 28), label, fill=(20, 20, 60), font=font)
        dr.text((cx + 6, cy + cell_h - 15), f"{e['size'][0]}x{e['size'][1]}", fill=(120, 120, 120), font=font)
        dr.rectangle([cx, cy, cx + cell_w - 1, cy + cell_h - 1], outline=(225, 225, 235))
    sheet.save(os.path.join(OUT, '_contact-sheet.png'), optimize=True)


contact_sheet()
print(f'{len(MANIFEST)} manifest entries -> {OUT}')
