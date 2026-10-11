from pathlib import Path
from PIL import Image
import json

source = Image.open('Designs/platform shell/customer shell.png')
source.crop((29, 89, 1420, 295)).save('public/assets/customer-banner.webp', lossless=True)
queue_path = Path('artifacts/regeneration/queue.json')
queue = json.loads(queue_path.read_text(encoding='utf-8'))
for asset in queue:
    if asset['key'] == 'customer-banner':
        asset.update(width=1391, height=206)
queue_path.write_text(json.dumps(queue, indent=2), encoding='utf-8')
print('Recovered the full customer hero photograph for regeneration.')
