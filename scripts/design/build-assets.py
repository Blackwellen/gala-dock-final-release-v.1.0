"""Build named photo assets from detected reference crops (see photo-map.json)."""
import json, os, sys, cv2, numpy as np
sys.path.insert(0, 'scripts/design')
import importlib.util
def load(name):
    spec = importlib.util.spec_from_file_location(name, f'scripts/design/{name}.py'); mod = importlib.util.module_from_spec(spec)
    src = open(f'scripts/design/{name}.py', encoding='utf8').read().split("if __name__")[0].split("for p in sys.argv")[0]
    exec(compile(src, name, 'exec'), mod.__dict__); return mod
photo, hero = load('clean-photo'), load('clean-hero')
REF = 'Designs/customer & Organizer workspace'
files = sorted(os.listdir(REF))
idx = json.load(open('artifacts/references/detect/index.json'))
m = json.load(open('scripts/design/photo-map.json'))
out = 'public/assets/gd'
def read(i):
    return cv2.imdecode(np.fromfile(os.path.join(REF, files[int(i)]), np.uint8), cv2.IMREAD_COLOR)
cache = {}
for name, (d, k, kind) in m.items():
    if d not in cache: cache[d] = read(d)
    x, y, w, h = idx[d]['boxes'][k]
    im = cache[d][y+1:y+h-1, x+1:x+w-1]  # drop the 1px card border
    if kind == 'card': im = photo.clean(im, False, True, True, False)
    elif kind == 'hero': im = hero.clean(im)
    cv2.imencode('.webp', im, [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(f'{out}/{name}.webp')
# Team avatars: rows in the Team reference (#19) and profile photo.
team = read(19)
names = ['james-carter','sophie-malik','ryan-brooks','mia-chen','liam-patel','ava-thompson','noah-evans','isabella-garcia','daniel-kim','chloe-roberts']
for i, n in enumerate(names):
    cy = int(451 + 31.75 * i); cx = 257
    cv2.imencode('.webp', team[cy-12:cy+12, cx-12:cx+12], [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(f'{out}/av-{n}.webp')
print(len(m) + len(names), 'assets')
