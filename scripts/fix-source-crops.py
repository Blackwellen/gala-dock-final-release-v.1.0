from PIL import Image
from pathlib import Path
import json
service=Image.open(next(Path('Designs/Public Pages').glob('*Elite Sound*')))
for i,(left,right)in enumerate([(33,124),(133,224),(232,321),(327,418),(424,513)]):service.crop((left,616,right,697)).save(f'public/assets/service-{i+3}.webp',lossless=True)
for key,pattern,bottom in [('event','*Neon Nights*',258),('service','*Elite Sound*',282),('venue','*Riverside Arena*',282),('organizer','Neon Events*',355),('london','London Events*',330)]:
 Image.open(next(Path('Designs/Public Pages').glob(pattern))).crop((0,44,809,bottom)).save(f'public/assets/{key}-hero.webp',lossless=True)
queue=json.loads(Path('artifacts/regeneration/queue.json').read_text(encoding='utf8'))
for row in queue:
 img=Image.open(row['path']);row.update(width=img.width,height=img.height)
Path('artifacts/regeneration/queue.json').write_text(json.dumps(queue,indent=2),encoding='utf8')
