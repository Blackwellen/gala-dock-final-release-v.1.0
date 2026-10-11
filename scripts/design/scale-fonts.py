"""One-off typography calibration: scale font sizes by FACTOR in Phase 2 CSS and components (rounded to 0.5px)."""
import re, sys, pathlib
FACTOR = float(sys.argv[1]) if len(sys.argv) > 1 else 0.89
roots = ["src/styles/kit.css", "src/styles/organizer.css", "src/styles/customer.css"] + [str(p) for p in pathlib.Path("src/styles").glob("org-*.css")]
for d in ["src/components/kit", "src/components/organizer", "src/components/customer", "src/components/shared", "src/app/organizer", "src/app/(customer)", "src/app/proposal"]:
    roots += [str(p) for p in pathlib.Path(d).rglob("*.tsx")]
r = lambda v: (str(round(float(v) * FACTOR * 2) / 2)).rstrip("0").rstrip(".")
n = 0
for f in roots:
    p = pathlib.Path(f)
    if not p.exists(): continue
    s = p.read_text(encoding="utf8"); o = s
    s = re.sub(r"font-size:\s*([0-9.]+)px", lambda m: f"font-size: {r(m.group(1))}px", s)
    s = re.sub(r"fontSize:\s*([0-9.]+)(?![0-9.]*\s*/)", lambda m: f"fontSize: {r(m.group(1))}", s)
    if s != o: p.write_text(s, encoding="utf8"); n += 1
print("files changed:", n)
