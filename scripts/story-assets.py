from pathlib import Path
import json
from PIL import Image
rows=json.loads(Path('artifacts/visual/manifest.json').read_text(encoding='utf8'))
for row in rows:
 if 'onboarding' not in row['url']: continue
 width=581 if row['key'].endswith('experience') else 466
 Image.open(row['file']).crop((0,64,width,1024)).save('public/assets/story-'+row['key'].replace('preview-onboarding-','')+'.png')
