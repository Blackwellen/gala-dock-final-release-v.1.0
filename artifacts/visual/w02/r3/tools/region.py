"""Per-region layout diff: design vs ours.
Detects card/panel rectangles (thin light borders or white panels on the tinted page) in BOTH images with the same rule,
matches every design region to the best-overlapping region of ours, and reports drift = (1 - IoU) * 100 per region.
A region passes the W02 gate at drift <= 5%. Text/photo content is ignored (seeded data differs from the mock data).
Usage: python -I region.py <design> <ours> <out-prefix> [--dcrop x0,y0,x1,y1] [--ocrop x0,y0,x1,y1] [--min 120x60] [--maxh N]
--dcrop crops the design (phone bezel); ours is cropped then scaled to the design crop's width (height follows aspect).
Writes <out>.json, <out>.png (overlay: design green, ours magenta) and <out>-sbs.jpg (design left, ours right)."""
import sys, json, cv2, numpy as np
args = sys.argv[1:]; pos = [a for a in args if not a.startswith("--")]
opt = {}
i = 0
while i < len(args):
    if args[i].startswith("--"): opt[args[i][2:]] = args[i+1]; i += 2
    else: i += 1
dpath, opath, out = pos[:3]
rd = lambda p: cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
D, O = rd(dpath), rd(opath)
def crop(im, s):
    if not s: return im
    x0, y0, x1, y1 = map(int, s.split(",")); return im[y0:y1, x0:x1]
D = crop(D, opt.get("dcrop")); O = crop(O, opt.get("ocrop"))
k = 1.0
if O.shape[1] != D.shape[1]:
    k = D.shape[1] / O.shape[1]; O = cv2.resize(O, (D.shape[1], round(O.shape[0] * k)), interpolation=cv2.INTER_AREA)
H = min(D.shape[0], O.shape[0], int(opt.get("maxh", 10**6)))
D, O = D[:H], O[:H]
mw, mh = map(int, opt.get("min", "120x60").split("x"))
R = int(opt.get("r", 6))
LINES = {}
def boxes(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.int16)
    # light UI edges: a step of >=4 grey levels between neighbours where both sides are light (card borders, white panels on a tint)
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1])); gy = np.abs(np.diff(g, axis=0, prepend=g[:1, :]))
    light = g >= 205
    e = ((((gx >= 4) | (gy >= 4)) & light) | (gx >= 40) | (gy >= 40)).astype(np.uint8) * 255  # + hard edges (photos flush with a card side)
    e = cv2.dilate(e, np.ones((2, 2), np.uint8))
    el = cv2.dilate((((gx >= 4) | (gy >= 4)) & light).astype(np.uint8) * 255, np.ones((2, 2), np.uint8))
    LINES[str(id(im)) + "L"] = cv2.bitwise_or(cv2.morphologyEx(el, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (60, 1))),
                                              cv2.morphologyEx(el, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))))
    hl = cv2.morphologyEx(e, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (60, 1)))
    vl = cv2.morphologyEx(e, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40)))
    LINES[id(im)] = cv2.bitwise_or(hl, vl)
    grid = cv2.dilate(cv2.bitwise_or(hl, vl), np.ones((R * 2 + 1, R * 2 + 1), np.uint8))  # bridges rounded corners
    if "debug" in opt: cv2.imwrite(pos[2] + f"-grid{im.shape[0]}{int(im.mean())}.png", grid)
    cnts, hier = cv2.findContours(grid, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    ed = cv2.dilate(e, np.ones((5, 5), np.uint8)) > 0
    def side(a): return a.mean() if a.size else 0
    for ci, c in enumerate(cnts):
        x, y, w, h = cv2.boundingRect(c)
        k = -R if hier[0][ci][3] == -1 else R  # outer contours are inflated by the dilation, holes deflated
        x, y, w, h = x - k, y - k, w + 2 * k, h + 2 * k
        if not (w >= mw and h >= mh and w < im.shape[1] * 0.985 and h < im.shape[0] * 0.98): continue
        # closed card: each of the 4 sides (inset 12px from the rounded corners) is >=80% edge pixels
        x1, y1 = x + w - 1, y + h - 1
        sides = [side(ed[y + 1, x + 12:x1 - 12]), side(ed[y1 - 1, x + 12:x1 - 12]), side(ed[y + 12:y1 - 12, x + 1]), side(ed[y + 12:y1 - 12, x1 - 1])]
        if min(sides) >= 0.8: out.append((x, y, w, h))
    uniq = []
    for b in sorted(out, key=lambda b: (b[1], b[0])):
        if not any(abs(b[0]-u[0]) < 8 and abs(b[1]-u[1]) < 8 and abs(b[2]-u[2]) < 12 and abs(b[3]-u[3]) < 12 for u in uniq): uniq.append(b)
    return uniq
def iou(a, b):
    ax1, ay1, bx1, by1 = a[0]+a[2], a[1]+a[3], b[0]+b[2], b[1]+b[3]
    iw = max(0, min(ax1, bx1) - max(a[0], b[0])); ih = max(0, min(ay1, by1) - max(a[1], b[1]))
    inter = iw * ih; u = a[2]*a[3] + b[2]*b[3] - inter
    return inter / u if u else 0
db, ob = boxes(D), boxes(O)
if opt.get("oboxes"):
    # ours from the DOM (exact card boxes) -> same crop + scale as the screenshot
    ox, oy = (list(map(int, opt["ocrop"].split(",")))[:2] if opt.get("ocrop") else [0, 0])
    ob = [(round((b["x"] - ox) * k), round((b["y"] - oy) * k), round(b["w"] * k), round(b["h"] * k)) for b in json.load(open(opt["oboxes"], encoding="utf8"))]
    ob = [b for b in ob if b[1] < H and b[0] < D.shape[1] and b[2] >= mw * 0.5] + boxes(O)
amin = float(opt.get("amin", 0.008)) * D.shape[1] * H
db = [b for b in db if b[2] * b[3] >= amin]
if "debug" in opt: print("D", db); print("O", ob)
LD, LO = LINES[str(id(D)) + "L"] > 0, LINES[str(id(O)) + "L"] > 0
TOL = int(opt.get("tol", 4)); ker = np.ones((TOL * 2 + 1, TOL * 2 + 1), np.uint8)
LDd, LOd = cv2.dilate(LD.astype(np.uint8), ker) > 0, cv2.dilate(LO.astype(np.uint8), ker) > 0
def line_drift(b):
    x, y, w, h = b; sl = (slice(max(0, y - TOL), y + h + TOL), slice(max(0, x - TOL), x + w + TOL))
    d, o, dd, od = LD[sl], LO[sl], LDd[sl], LOd[sl]
    nd, no = d.sum(), o.sum()
    if nd == 0 and no == 0: return 0.0
    rec = (d & od).sum() / nd if nd else 0; pre = (o & dd).sum() / no if no else 0
    f = 2 * rec * pre / (rec + pre) if rec + pre else 0
    return round((1 - f) * 100, 1)
regions = []
for b in db:
    best = max(ob, key=lambda o: iou(b, o), default=None)
    v = iou(b, best) if best else 0
    regions.append({"design": b, "ours": best, "iou": round(v, 3), "box_drift": round((1 - v) * 100, 1), "line_drift": line_drift(b), "drift": round((1 - v) * 100, 1),
                    "dx": (best[0]-b[0]) if best else None, "dy": (best[1]-b[1]) if best else None,
                    "dw": (best[2]-b[2]) if best else None, "dh": (best[3]-b[3]) if best else None})
# keep top-level-ish regions: drop design boxes fully inside another design box that already matched well (<=5%)
area = sum(r["design"][2]*r["design"][3] for r in regions) or 1
wdrift = sum(r["drift"] * r["design"][2]*r["design"][3] for r in regions) / area
passed = sum(1 for r in regions if r["drift"] <= 5)
ov = cv2.addWeighted(D, 0.5, O, 0.5, 0)
for r in regions:
    x, y, w, h = r["design"]; cv2.rectangle(ov, (x, y), (x+w, y+h), (40, 170, 40), 2)
    if r["ours"]: x, y, w, h = r["ours"]; cv2.rectangle(ov, (x, y), (x+w, y+h), (200, 40, 200), 2)
    cv2.putText(ov, f'{r["drift"]}%', (r["design"][0]+4, r["design"][1]+16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255) if r["drift"] > 5 else (0, 120, 0), 1)
cv2.imencode(".png", ov)[1].tofile(out + ".png")
sbs = np.full((H, D.shape[1]*2 + 6, 3), (0, 0, 255), np.uint8); sbs[:, :D.shape[1]] = D; sbs[:, D.shape[1]+6:] = O
cv2.imencode(".jpg", sbs, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tofile(out + "-sbs.jpg")
page_line = line_drift((0, 0, D.shape[1], H))
rep = {"page_line_drift": page_line, "design": dpath, "ours": opath, "size": [D.shape[1], H], "regions": len(regions), "passed": passed, "weighted_drift": round(wdrift, 1),
       "worst": sorted(regions, key=lambda r: -r["drift"])[:8], "all": regions}
json.dump(rep, open(out + ".json", "w"), indent=1)
print(f'{out.split("/")[-1]}: page {page_line}% | {passed}/{len(regions)} regions <=5% | area-wtd {rep["weighted_drift"]}% | worst ' +
      " ".join(f'[{r["design"][0]},{r["design"][1]} {r["design"][2]}x{r["design"][3]} {r["drift"]}% dy{r["dy"]} dh{r["dh"]}]' for r in rep["worst"][:5]))
