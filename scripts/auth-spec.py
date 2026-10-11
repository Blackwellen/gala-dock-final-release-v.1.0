# Writes a tuner spec for an auth screen.  Usage: python scripts/auth-spec.py <screen-class> <url> <ref.png> <out.json>
import json, sys
cls, url, ref, out = sys.argv[1:5]
P = f".auth-page.{cls}"
r = lambda a, b, s, u="px": [f"{round(a + i * s, 2)}{u}" for i in range(int(round((b - a) / s)) + 1)]
params = [
  {"sel": f"{P} .auth-card", "prop": "padding-top", "values": r(18, 38, 2)},
  {"sel": f"{P} .auth-card>h2", "prop": "font-size", "values": r(36, 44, 1)},
  {"sel": f"{P} .auth-card>h2", "prop": "letter-spacing", "values": r(-1.8, -0.4, 0.2)},
  {"sel": f"{P} .auth-card>h2", "prop": "margin-bottom", "values": r(0, 14, 2)},
  {"sel": f"{P} .auth-card>.auth-description", "prop": "font-size", "values": r(15.5, 18.5, 0.5)},
  {"sel": f"{P} .auth-card>.auth-description", "prop": "letter-spacing", "values": r(-0.5, 0.2, 0.1)},
  {"sel": f"{P} .auth-card>.auth-description", "prop": "line-height", "values": r(21, 28, 1)},
  {"sel": f"{P} .auth-card>.auth-description", "prop": "margin-bottom", "values": r(6, 26, 2)},
  {"sel": f"{P} .auth-card form", "prop": "margin-top", "values": r(-10, 10, 2)},
  {"sel": f"{P} .auth-card form", "prop": "zoom", "values": ["0.96", "0.97", "0.98", "0.99", "1.01", "1.02", "1.03"]},
  {"sel": f"{P} .auth-card .auth-security", "prop": "margin-top", "values": r(-8, 16, 2)},
  {"sel": f"{P} .auth-card .auth-help", "prop": "margin-top", "values": r(12, 40, 4)},
  {"sel": f"{P} .auth-card .auth-security small", "prop": "font-size", "values": r(11, 13.5, 0.5)},
]
json.dump({"url": url, "ref": ref, "width": 1448, "height": 1086, "left": 746, "rounds": 2, "params": params}, open(out, "w"), indent=1)
