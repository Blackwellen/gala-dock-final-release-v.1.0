from pathlib import Path
from PIL import Image
import json
root=Path('Designs'); out=Path('public/assets'); out.mkdir(parents=True,exist_ok=True)
assets={}
def crop(name,file,box):
 im=Image.open(root/file).convert('RGB'); im.crop(box).save(out/(name+'.webp'),quality=96); assets[name]='/assets/'+name+'.webp'
files={'home':'Public Pages/Gala Dock Event Marketplace Homepage.png','event':'Public Pages/Gala·Dock Neon Nights Festival 2026.png','service':'Public Pages/Gala·Dock Elite Sound Events Page.png','venue':'Public Pages/Gala·Dock Riverside Arena Venue Page.png','london':'Public Pages/London Events Discovery Marketplace.png','organizer':'Public Pages/Neon Events Organizer Profile.png'}
for key,f in files.items():
 box=(0,45,809,155) if key!='home' else (330,34,724,246)
 crop(key+'-hero',f,box)
crop('london-skyline',files['london'],(0,45,809,166))
crop('venue-exterior',files['venue'],(34,457,502,538))
crop('venue-map',files['venue'],(36,1328,353,1485))
crop('uk-map',files['service'],(460,1078,612,1240))
# Individual photographic assets from the reference cards, excluding their labels.
for key,rects in {
 'home':[(34,455,181,516),(203,455,347,516),(373,455,516,516),(540,455,688,516),(35,1555,227,1611),(240,1555,388,1611),(399,1555,547,1611),(559,1555,706,1611)],
 'event':[(33,646,145,710),(158,646,270,710),(285,646,396,710),(411,646,522,710),(537,646,649,710),(664,646,777,710),(34,803,335,953),(34,1019,206,1080),(224,1019,391,1080),(414,1019,585,1080),(602,1019,775,1080)],
 'service':[(34,751,204,822),(226,751,392,822),(414,751,583,822),(33,584,120,651),(132,584,218,651),(231,584,318,651),(330,584,419,651),(429,584,510,651)],
 'venue':[(32,699,209,794),(225,699,400,794),(415,699,589,794),(603,699,778,794),(39,953,153,1064),(296,953,413,1064),(552,953,665,1064)],
 'london':[(34,584,208,675),(226,584,395,675),(413,584,585,675),(33,884,165,938),(177,884,303,938),(320,884,445,938),(460,884,586,938),(34,1068,166,1113),(182,1068,303,1113),(320,1068,445,1113),(464,1068,585,1113)],
 'organizer':[(33,441,209,555),(225,441,400,555),(414,441,587,555),(604,441,779,555),(34,735,207,818),(225,735,400,818),(415,735,589,818),(604,735,777,818),(36,1286,174,1392),(181,1286,321,1392),(329,1286,474,1392),(484,1286,627,1392),(636,1286,777,1392)]
}.items():
 for i,rect in enumerate(rects): crop(f'{key}-{i}',files[key],rect)
for i,rect in enumerate([(505,321,633,384),(649,321,776,384),(792,321,919,384),(935,321,1060,384),(1078,321,1203,384),(505,444,633,505),(650,444,776,505),(794,444,919,505),(935,444,1060,505)]):crop(f'type-{i}','auth & onboarding/Gala Dock Event Setup Dashboard.png',rect)
for i,rect in enumerate([(518,539,644,591),(660,539,786,591),(803,539,928,591),(945,539,1069,591),(1087,539,1211,591),(518,649,644,704),(660,649,786,704),(803,649,928,704),(945,649,1069,704),(1087,649,1211,704)]):crop(f'interest-{i}','auth & onboarding/Gala Dock Preferences Setup.png',rect)
for i,rect in enumerate([(642,322,903,444),(930,322,1190,444),(1217,322,1480,444)]):crop(f'experience-{i}','auth & onboarding/Gala Dock Event Onboarding Dashboard.png',rect)
# Photo-only lower panel regions; UI and text are rendered as components.
crop('auth-party','auth & onboarding/image-gen-1(10).png',(0,712,745,924))
crop('onboard-party','auth & onboarding/Gala Dock Organizer Workspace Setup.png',(0,732,462,881))
crop('onboard-venue','auth & onboarding/Gala Dock Venue Setup Dashboard.png',(0,651,462,794))
crop('preferences-party','auth & onboarding/Gala Dock Preferences Setup.png',(0,523,463,869))
for i,rect in enumerate([(270,363,499,460),(523,363,751,460),(778,363,1003,460)]):crop(f'dash-{i}','platform shell/organizer team shell.png',rect)
crop('customer-banner','platform shell/customer shell.png',(30,90,1418,129))
for i,rect in enumerate([(1061,731,1087,762),(1061,787,1087,817),(1061,837,1087,867),(1061,886,1087,917)]):crop(f'avatar-{i}','platform shell/provider shell.png',rect)
Path('src/lib/assets.json').write_text(json.dumps(assets,indent=2),encoding='utf8')
print(f'Extracted {len(assets)} photographic assets.')
