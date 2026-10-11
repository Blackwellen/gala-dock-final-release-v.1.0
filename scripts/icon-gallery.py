# Builds a side-by-side gallery (reference | current) of square crops around given centre points, scaled x3.
# Usage: python scripts/icon-gallery.py <reference.png> <current.png> <out.png> name:x,y[,size] ...
import sys
from PIL import Image, ImageDraw
ref, cur = Image.open(sys.argv[1]).convert("RGB"), Image.open(sys.argv[2]).convert("RGB")
items = []
for spec in sys.argv[4:]:
    name, xy = spec.split(":"); p = list(map(int, xy.split(","))); s = p[2] if len(p) > 2 else 40
    box = (p[0] - s // 2, p[1] - s // 2, p[0] + s // 2, p[1] + s // 2)
    items.append((name, ref.crop(box).resize((s * 3, s * 3), Image.LANCZOS), cur.crop(box).resize((s * 3, s * 3), Image.LANCZOS)))
W = max(a.width for _, a, _ in items) * 2 + 30; H = sum(a.height + 22 for _, a, _ in items)
out = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(out); y = 0
for name, a, b in items:
    d.text((4, y + 4), name, fill="black"); out.paste(a, (0, y + 20)); out.paste(b, (a.width + 30, y + 20)); y += a.height + 22
out.save(sys.argv[3])
