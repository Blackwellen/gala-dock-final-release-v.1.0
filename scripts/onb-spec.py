# Writes a tuner spec for an onboarding screen.  Usage: python scripts/onb-spec.py <page-class> <url> <ref.png> <out.json>
import json, sys
cls, url, ref, out = sys.argv[1:5]
P = f".onboarding-page.{cls}"
r = lambda a, b, s, u="px": [f"{round(a + i * s, 2)}{u}" for i in range(int(round((b - a) / s)) + 1)]
Z = ["0.95", "0.96", "0.97", "0.98", "0.99", "1.01", "1.02", "1.03"]
params = [
  {"sel": f"{P} .setup-main", "prop": "padding-top", "values": r(24, 48, 3)},
  {"sel": f"{P} .form-main", "prop": "zoom", "values": Z},
  {"sel": f"{P} .form-main>h2", "prop": "font-size", "values": r(34, 44, 1)},
  {"sel": f"{P} .form-main>h2", "prop": "letter-spacing", "values": r(-2.2, -0.8, 0.2)},
  {"sel": f"{P} .form-main>h2", "prop": "margin-bottom", "values": r(0, 14, 2)},
  {"sel": f"{P} .setup-subtitle", "prop": "font-size", "values": r(14, 18, 0.5)},
  {"sel": f"{P} .setup-subtitle", "prop": "letter-spacing", "values": r(-0.3, 0.2, 0.1)},
  {"sel": f"{P} .setup-subtitle", "prop": "margin-bottom", "values": r(4, 24, 2)},
  {"sel": f"{P} .form-main .setup-panel", "prop": "padding-top", "values": r(10, 24, 2)},
  {"sel": f"{P} .form-main .setup-panel", "prop": "margin-bottom", "values": r(6, 22, 2)},
  {"sel": f"{P} .form-main .field>label", "prop": "font-size", "values": r(11.5, 14.5, 0.5)},
  {"sel": f"{P} .form-main .field", "prop": "margin-top", "values": r(-6, 8, 2)},
  {"sel": f"{P} .form-wide", "prop": "margin-top", "values": r(-20, 20, 4)},
  {"sel": f"{P} .setup-assistant", "prop": "zoom", "values": Z},
  {"sel": f"{P} .setup-assistant", "prop": "margin-top", "values": r(-60, 0, 6)},
  {"sel": f"{P} .setup-story h1", "prop": "font-size", "values": r(42, 54, 1.5)},
  {"sel": f"{P} .setup-story h1", "prop": "line-height", "values": ["0.98", "1.02", "1.06", "1.1"]},
  {"sel": f"{P} .setup-story .setup-story-description", "prop": "font-size", "values": r(15, 19, 0.5)},
  {"sel": f"{P} .setup-story .setup-features", "prop": "row-gap", "values": r(10, 30, 2)},
]
json.dump({"url": url, "ref": ref, "width": 1536, "height": 1024, "left": 0, "rounds": 2, "params": params}, open(out, "w"), indent=1)
