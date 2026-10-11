from pathlib import Path
from PIL import Image
import json
root=Path('Designs'); rows=[]
public=[('/', 'Gala Dock Event Marketplace Homepage.png'),('/services/elite-sound','Gala·Dock Elite Sound Events Page.png'),('/events/neon-nights','Gala·Dock Neon Nights Festival 2026.png'),('/venues/riverside-arena','Gala·Dock Riverside Arena Venue Page.png'),('/events/london','London Events Discovery Marketplace.png'),('/organizers/neon-events','Neon Events Organizer Profile.png')]
auth=['login','register','verify-email','forgot-password','reset-password','mfa','invite','secure-access']
onboard=[('experience','Gala Dock Event Onboarding Dashboard.png'),('organizer/business','Gala Dock Organizer Workspace Setup.png'),('organizer/events','Gala Dock Event Setup Dashboard.png'),('organizer/brand','Gala·Dock Organizer Setup Dashboard.png'),('organizer/team','GalaDock Organizer Setup Dashboard.png'),('preferences','Gala Dock Preferences Setup.png'),('provider/business','Gala Dock Provider Setup Dashboard.png'),('provider/listing','Gala Dock Venue Setup Dashboard.png'),('provider/rules','Gala-Dock Provider Setup Dashboard.png'),('provider/publish','Gala Dock Provider Setup Dashboard(1).png')]
for url,file in public:rows.append({'url':url,'file':str(root/'Public Pages'/file),'public':True})
for i,screen in enumerate(auth):
 file=f'image-gen-{i+1}({10 if i<6 else 9 if i==6 else 7}).png'; path=root/'auth & onboarding'/file
 rows.append({'url':'/auth/'+screen,'file':str(path)})
 Image.open(path).crop((0,0,746,1026)).save('public/assets/auth-art-'+screen+'.png')
for screen,file in onboard:rows.append({'url':'/preview/onboarding/'+screen,'file':str(root/'auth & onboarding'/file)})
for role,file in [('customer','customer shell.png'),('organizer','organizer team shell.png'),('provider','provider shell.png'),('admin','platform admin shell.png')]:rows.append({'url':'/preview/app/'+role,'file':str(root/'platform shell'/file)})
for row in rows:
 im=Image.open(row['file']);row.update(width=im.width,height=im.height,key=row['url'].strip('/').replace('/','-')or'home')
Path('artifacts/visual').mkdir(parents=True,exist_ok=True)
Path('artifacts/visual/manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
