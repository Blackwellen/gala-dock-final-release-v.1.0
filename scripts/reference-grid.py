from PIL import Image,ImageDraw
from pathlib import Path
for key,file in [('home','Gala Dock Event Marketplace Homepage.png'),('event','Gala·Dock Neon Nights Festival 2026.png'),('service','Gala·Dock Elite Sound Events Page.png')]:
 im=Image.open(Path('Designs/Public Pages')/file);d=ImageDraw.Draw(im)
 for y in range(0,im.height,50):d.line((0,y,im.width,y),fill='red',width=1);d.text((0,y+2),str(y),fill='red',stroke_width=1,stroke_fill='white')
 im.crop((0,0,im.width,900)).save('artifacts/visual/'+key+'-grid.png')
