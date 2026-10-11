import json, sys
cls, url, ref, out = sys.argv[1:5]
P = f".onboarding-page.{cls}"
r = lambda a, b, s, u="px": [f"{round(a + i * s, 2)}{u}" for i in range(int(round((b - a) / s)) + 1)]
params = [
  {"sel": f"{P} .form-main .setup-panel", "prop": "padding-left", "values": r(10, 24, 2)},
  {"sel": f"{P} .form-main .setup-panel", "prop": "padding-right", "values": r(10, 24, 2)},
  {"sel": f"{P} .form-main .setup-panel>h3", "prop": "font-size", "values": r(14, 19, 0.5)},
  {"sel": f"{P} .form-main .setup-panel>h3", "prop": "margin-bottom", "values": r(0, 10, 2)},
  {"sel": f"{P} .form-main .setup-panel>p.muted", "prop": "font-size", "values": r(11.5, 14, 0.5)},
  {"sel": f"{P} .form-main .setup-panel>p.muted", "prop": "margin-bottom", "values": r(2, 16, 2)},
  {"sel": f"{P} .form-main .input-wrap input, {P} .form-main .select-wrap select", "prop": "height", "values": r(34, 46, 2)},
  {"sel": f"{P} .form-main .choice>span", "prop": "min-height", "values": r(34, 72, 4)},
  {"sel": f"{P} .form-main .choice-group", "prop": "gap", "values": r(4, 16, 2)},
  {"sel": f"{P} .form-main .two-columns", "prop": "row-gap", "values": r(4, 20, 2)},
  {"sel": f"{P} .form-main .two-columns", "prop": "column-gap", "values": r(8, 24, 2)},
  {"sel": f"{P} .form-main hr", "prop": "margin", "values": ["6px 0", "10px 0", "14px 0", "18px 0", "22px 0"]},
  {"sel": f"{P} .setup-actions", "prop": "margin-top", "values": r(4, 30, 3)},
  {"sel": f"{P} .setup-progress-row", "prop": "margin-bottom", "values": r(8, 32, 3)},
  {"sel": f"{P} .setup-story .setup-steps", "prop": "margin-bottom", "values": r(6, 30, 3)},
  {"sel": f"{P} .setup-assistant>.setup-panel", "prop": "margin-bottom", "values": r(6, 20, 2)},
  {"sel": f"{P} .setup-assistant>.setup-panel", "prop": "padding", "values": ["12px", "14px", "16px", "18px", "20px", "22px"]},
]
json.dump({"url": url, "ref": ref, "width": 1536, "height": 1024, "left": 0, "rounds": 1, "params": params}, open(out, "w"), indent=1)
