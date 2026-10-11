# Per-region pixel difference (approximation of pixelmatch at threshold 0.1) for the onboarding manifest.
# Usage: python scripts/region-diff.py [key-filter]
import json, sys
import numpy as np
from PIL import Image
flt = sys.argv[1] if len(sys.argv) > 1 else "preview-onboarding-"
rows = [r for r in json.load(open("artifacts/visual/manifest.json", encoding="utf8")) if flt in r["key"]]
def load(p, w, h):
    im = Image.open(p).convert("RGB")
    canvas = Image.new("RGB", (w, h), "white"); canvas.paste(im.crop((0, 0, w, min(h, im.height))), (0, 0))
    return np.asarray(canvas, dtype=np.float32)
for r in rows:
    w, h = r["width"], r["height"]
    a, b = load(r["file"].replace("\\", "/"), w, h), load(f"artifacts/visual/screens/{r['key']}.png", w, h)
    # YIQ-weighted distance like pixelmatch; 0.1 threshold of max delta (35215).
    d = a - b
    y = d[..., 0] * 0.29889531 + d[..., 1] * 0.58662247 + d[..., 2] * 0.11448223
    i = d[..., 0] * 0.59597799 - d[..., 1] * 0.27417610 - d[..., 2] * 0.32180189
    q = d[..., 0] * 0.21147017 - d[..., 1] * 0.52261711 + d[..., 2] * 0.31114694
    bad = (0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q) > 35215 * 0.01
    left = 466 if "experience" not in r["key"] else 581
    regions = {"header": bad[:64], "story": bad[64:, :left], "main": bad[64:, left:1225], "aside": bad[64:, 1225:]}
    print(f"{r['key'][19:]:<22} " + "  ".join(f"{k} {100*v.mean():5.1f}%" for k, v in regions.items()) + f"  | all {100*bad.mean():5.1f}%")
