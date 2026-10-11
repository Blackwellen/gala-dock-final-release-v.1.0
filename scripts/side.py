# Side-by-side crop of reference (left) and current screenshot (right) for a region.
# Usage: python scripts/side.py <reference.png> <current.png> x0 y0 x1 y1 <out.png>
import sys
from PIL import Image
ref, cur, x0, y0, x1, y1, out = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7]), sys.argv[7]
a = Image.open(ref).convert("RGB").crop((x0, y0, x1, y1)); b = Image.open(cur).convert("RGB").crop((x0, y0, x1, y1))
o = Image.new("RGB", (a.width * 2 + 8, a.height), "red"); o.paste(a, (0, 0)); o.paste(b, (a.width + 8, 0)); o.save(out)
