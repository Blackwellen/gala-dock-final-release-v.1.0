from pathlib import Path
from PIL import Image,ImageDraw
import json
queue=json.loads(Path('artifacts/regeneration/queue.json').read_text(encoding='utf8'))
for path in sorted(Path('public/assets').glob('auth-art-*.png')):
 im=Image.open(path);queue.append({'key':path.stem,'path':str(path.resolve()),'width':im.width,'height':im.height,'status':'pending','kind':'marketing-background'})
for path in sorted(Path('public/assets').glob('story-*.png')):
 im=Image.open(path);queue.append({'key':path.stem,'path':str(path.resolve()),'width':im.width,'height':im.height,'status':'pending','kind':'marketing-background'})
queue.sort(key=lambda r:(0 if r['key'].startswith('auth-art-')else 1 if r['key'].startswith('story-')else 2))
Path('artifacts/regeneration/queue.json').write_text(json.dumps(queue,indent=2),encoding='utf8')
for sheet in range((len(queue)+29)//30):
 part=queue[sheet*30:(sheet+1)*30];im=Image.new('RGB',(1000,((len(part)+4)//5)*180),'#e7e7ed');d=ImageDraw.Draw(im)
 for i,row in enumerate(part):
  img=Image.open(row['path']).convert('RGB');img.thumbnail((192,150));x=i%5*200;y=i//5*180;im.paste(img,(x+(192-img.width)//2,y));d.text((x+3,y+152),row['key'],fill='black')
 im.save(f'artifacts/regeneration/contact-{sheet}.jpg')
print(f'{len(queue)} assets, including eight auth panels and ten onboarding panels.')
