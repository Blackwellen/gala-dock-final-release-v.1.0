from pathlib import Path
from PIL import Image
import json
assets=[]
ignore=['auth-art-','story-','brand-purple','event-hero-restored']
priority=['home-hero','home-action-0','home-action-1','home-action-2','home-action-3','home-action-4','organizer-illustration','provider-illustration','planning-illustration','agent-character','service-hero','venue-hero','organizer-hero','london-hero','london-skyline','neon-aftermovie']
seen=set()
for path in sorted(Path('public/assets').iterdir(),key=lambda p:(priority.index(p.stem) if p.stem in priority else len(priority),p.stem,p.suffix)):
 if path.stem in seen or any(path.stem.startswith(i)for i in ignore):continue
 seen.add(path.stem);im=Image.open(path);assets.append({'key':path.stem,'path':str(path.resolve()),'width':im.width,'height':im.height,'status':'pending'})
Path('artifacts/regeneration').mkdir(parents=True,exist_ok=True);Path('public/assets/regenerated').mkdir(parents=True,exist_ok=True)
Path('artifacts/regeneration/queue.json').write_text(json.dumps(assets,indent=2),encoding='utf8')
Path('src/lib/regenerated-assets.json').write_text('{}',encoding='utf8')
print(f'{len(assets)} separate cropped assets queued. Original crops retained.')
