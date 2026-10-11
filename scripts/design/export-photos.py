"""Run detection over every Customer/Organizer reference and export photo crops.
Output: public/assets/gd/r<idx>-<k>.webp and artifacts/references/detect/<idx>.jpg (annotated)."""
import os, json, subprocess, sys, cv2, numpy as np
src = 'Designs/customer & Organizer workspace'
files = sorted(os.listdir(src))
os.makedirs('public/assets/gd', exist_ok=True)
index = {}
for i, f in enumerate(files):
    out = f'artifacts/references/detect/{i:02d}'
    subprocess.run([sys.executable, '-I', 'scripts/design/detect-photos.py', os.path.join(src, f), out], check=True, capture_output=True)
    im = cv2.imdecode(np.fromfile(os.path.join(src, f), np.uint8), cv2.IMREAD_COLOR)
    boxes = json.load(open(out + '.json'))
    for k, (x, y, w, h) in enumerate(boxes):
        cv2.imencode('.webp', im[y:y+h, x:x+w], [cv2.IMWRITE_WEBP_QUALITY, 95])[1].tofile(f'public/assets/gd/r{i:02d}-{k}.webp')
    index[f'{i:02d}'] = {'file': f, 'boxes': boxes}
json.dump(index, open('artifacts/references/detect/index.json', 'w'), indent=1)
print(sum(len(v['boxes']) for v in index.values()), 'crops')
