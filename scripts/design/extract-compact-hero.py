"""Extract the compact event-hero background from a customer event design (1536x1024 reference).
Thumbnail, button and text areas are inpainted; the photo keeps the design's own shading (render without overlay).
Usage: python scripts/design/extract-compact-hero.py <design.png> <out.webp>"""
import sys, cv2, numpy as np

X0, Y0, X1, Y1 = 31, 71, 1506, 214
src = cv2.imdecode(np.fromfile(sys.argv[1], np.uint8), cv2.IMREAD_COLOR)
if src.shape[1] != 1536: src = cv2.resize(src, (1536, 1024), interpolation=cv2.INTER_AREA)
im = src[Y0:Y1, X0:X1].copy()
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
mu = cv2.blur(g, (5, 5)); tex = np.sqrt(np.maximum(cv2.blur(g * g, (5, 5)) - mu * mu, 0))
ui = ((g > 185) & (hsv[..., 1] < 80)) | ((tex < 7) & (hsv[..., 1] > 100) & (g > 50))
mask = np.zeros(g.shape, np.uint8)
def rect(x0, y0, x1, y1, full=False):
    a, b, c, d = x0 - X0, y0 - Y0, x1 - X0, y1 - Y0
    mask[b:d, a:c] = 1 if full else np.maximum(mask[b:d, a:c], ui[b:d, a:c].astype(np.uint8))
rect(52, 84, 190, 206, full=True)          # thumbnail (covered by the real thumbnail)
rect(1150, 156, 1496, 207, full=True)      # buttons
rect(200, 90, 790, 202)                     # title glyphs
rect(200, 90, 390, 120, full=True)          # chips
rect(200, 162, 690, 204, full=True)         # meta rows
rect(680, 164, 776, 199, full=True)         # on-track pill
mask = cv2.dilate(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), np.ones((5, 5), np.uint8))
out = cv2.inpaint(im, mask * 255, 7, cv2.INPAINT_TELEA)
cv2.imencode('.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 94])[1].tofile(sys.argv[2])
print(sys.argv[2], out.shape[1], 'x', out.shape[0])
