import json, sys
cls, url, ref, out = sys.argv[1:5]
P = f".auth-page.{cls} .auth-story"
r = lambda a, b, s, u="px": [f"{round(a + i * s, 2)}{u}" for i in range(int(round((b - a) / s)) + 1)]
params = [
  {"sel": f"{P} .story-content h1", "prop": "font-size", "values": r(56, 70, 1)},
  {"sel": f"{P} .story-content h1", "prop": "letter-spacing", "values": r(-3, -1, 0.25)},
  {"sel": f"{P} .story-content h1", "prop": "line-height", "values": r(56, 70, 1)},
  {"sel": f"{P} .story-content .eyebrow", "prop": "margin-bottom", "values": r(10, 30, 2)},
  {"sel": f"{P} .story-description", "prop": "font-size", "values": r(17, 22, 0.5)},
  {"sel": f"{P} .story-description", "prop": "line-height", "values": r(24, 30, 1)},
  {"sel": f"{P} .story-description", "prop": "margin-top", "values": r(6, 26, 2)},
  {"sel": f"{P} .story-features", "prop": "margin-top", "values": r(10, 40, 3)},
  {"sel": f"{P} .story-features", "prop": "row-gap", "values": r(12, 32, 2)},
  {"sel": f"{P} .story-features b", "prop": "font-size", "values": r(14, 18, 0.5)},
  {"sel": f"{P} .story-features p", "prop": "font-size", "values": r(12, 15, 0.5)},
]
json.dump({"url": url, "ref": ref, "width": 1448, "height": 1086, "left": 0, "rounds": 1, "params": params}, open(out, "w"), indent=1)
