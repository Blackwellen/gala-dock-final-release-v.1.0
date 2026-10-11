# Prints the share of mismatched pixels per grid cell of a ws-visual diff image (red pixels = mismatches).
# Usage: python scripts/ws-diff-grid.py <key> [cols rows]
import sys
from PIL import Image
key = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 8; rows = int(sys.argv[3]) if len(sys.argv) > 3 else 6
im = Image.open(f"artifacts/visual/ws/diffs/{key}.png").convert("RGB")
w, h = im.size; px = im.load()
cw, ch = w // cols, h // rows
print(f"{key} {w}x{h} — mismatch % per cell (x ranges across, y ranges down)")
print("        " + "".join(f"{c*cw:>7}" for c in range(cols)))
for r in range(rows):
    line = []
    for c in range(cols):
        bad = tot = 0
        for y in range(r*ch, (r+1)*ch, 2):
            for x in range(c*cw, (c+1)*cw, 2):
                R, G, B = px[x, y]; tot += 1
                if R > 200 and G < 80 and B < 80: bad += 1
        line.append(f"{100*bad/tot:6.1f}%")
    print(f"{r*ch:>6}  " + " ".join(line))
