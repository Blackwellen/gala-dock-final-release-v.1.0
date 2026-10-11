"""Install a generated asset without overwriting its reference crop."""
from pathlib import Path
import json
import re
import shutil
import sys
from PIL import Image

key, source = sys.argv[1:3]
source = source.rsplit(' as ', 1)[-1]
if not re.fullmatch(r'[a-z0-9-]+', key):
    raise ValueError('Invalid asset key')
source = Path(source).resolve(strict=True)
destination = Path('public/assets/regenerated') / f'{key}.png'
destination.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, destination)
mapping_path = Path('src/lib/regenerated-assets.json')
mapping = json.loads(mapping_path.read_text(encoding='utf-8-sig'))
mapping[key] = f'/assets/regenerated/{key}.png'
mapping_path.write_text(json.dumps(mapping, indent=2), encoding='utf-8')
queue_path = Path('artifacts/regeneration/queue.json')
queue = json.loads(queue_path.read_text(encoding='utf-8-sig'))
for asset in queue:
    if asset['key'] == key:
        asset.update(status='complete', output=str(destination.resolve()), generated_size=list(Image.open(destination).size))
queue_path.write_text(json.dumps(queue, indent=2), encoding='utf-8')
dimension_path = Path('src/lib/asset-dimensions.json')
dimensions = {a['key']: a.get('generated_size', [a['width'],a['height']]) for a in queue}
dimension_path.write_text(json.dumps(dimensions, indent=2), encoding='utf-8')
print(json.dumps({'key': key, 'completed': sum(a['status'] == 'complete' for a in queue), 'total': len(queue)}))
