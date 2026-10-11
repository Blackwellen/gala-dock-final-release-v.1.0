"""Strip text, chips and buttons from a hero banner crop: inpaint bright/flat UI pixels."""
import sys, cv2, numpy as np
def clean(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    mu = cv2.blur(g, (5, 5)); tex = np.sqrt(np.maximum(cv2.blur(g*g, (5, 5)) - mu*mu, 0))
    text = (g > 200) & (hsv[..., 1] < 70)                       # white glyphs / white buttons
    flat_col = (tex < 6) & (hsv[..., 1] > 110) & (g > 60)       # blue/purple/green chips & buttons
    m = (text | flat_col).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    return cv2.inpaint(im, m * 255, 6, cv2.INPAINT_TELEA)
for p in sys.argv[1:]:
    im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
    cv2.imencode('.webp', clean(im), [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(p.replace('.webp', '-clean.webp'))
