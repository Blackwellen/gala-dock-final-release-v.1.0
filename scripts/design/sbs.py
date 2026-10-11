# Side-by-side: design (left) vs ours (right), optional crop box x0,y0,x1,y1. Usage: python scripts/design/sbs.py <design> <ours> <out> [x0 y0 x1 y1]
import sys
from PIL import Image
d, o, out = sys.argv[1:4]; a = Image.open(d).convert("RGB"); b = Image.open(o).convert("RGB").resize(a.size)
box = tuple(map(int, sys.argv[4:8])) if len(sys.argv) > 7 else (0, 0) + a.size
ca, cb = a.crop(box), b.crop(box); w, h = ca.size
im = Image.new("RGB", (w * 2 + 6, h), "red"); im.paste(ca, (0, 0)); im.paste(cb, (w + 6, 0)); im.save(out)
