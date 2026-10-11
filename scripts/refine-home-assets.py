from pathlib import Path
from PIL import Image
im=Image.open('Designs/Public Pages/Gala Dock Event Marketplace Homepage.png')
for i,box in enumerate([(34,305,157,376),(169,305,292,376),(304,305,426,376),(438,305,561,376),(573,305,696,376)]):im.crop(box).save(f'public/assets/home-action-{i}.webp',quality=98)
for i,x in enumerate([33,203,372,542]):im.crop((x,462,x+158,536)).save(f'public/assets/home-{i}.webp',quality=98)
for i,x in enumerate([33,112,190,268,347,425,503,582,660]):im.crop((x,690,x+65,735)).save(f'public/assets/home-category-{i}.webp',quality=98)
for i,box in enumerate([(34,1566,232,1643),(243,1566,409,1643),(420,1566,578,1643),(589,1566,695,1643)]):im.crop(box).save(f'public/assets/home-{i+4}.webp',quality=98)
im.crop((238,814,721,1048)).save('public/assets/planning-illustration.png')
im.crop((291,1690,418,1826)).save('public/assets/agent-character.png')
im.crop((224,1060,408,1275)).save('public/assets/organizer-illustration.png')
im.crop((574,1060,697,1275)).save('public/assets/provider-illustration.png')
im.crop((194,1837,363,1929)).save('public/assets/organizer-cta-photo.webp',quality=98)
im.crop((584,1837,697,1929)).save('public/assets/provider-cta-photo.webp',quality=98)
p=Path('src/components/public.tsx');s=p.read_text(encoding='utf8');s=s.replace('image:"dash-0",color:"purple"','image:"home-action-0",color:"purple"').replace('image:"type-0",color:"blue"','image:"home-action-1",color:"blue"').replace('image:"venue-1",color:"orange"','image:"home-action-2",color:"orange"').replace('image:"type-1",color:"green"','image:"home-action-3",color:"green"').replace('image:"type-4",color:"pink"','image:"home-action-4",color:"pink"');s=s.replace('["type-0","interest-1","type-5","type-1","experience-0","interest-5","type-6","venue-4","type-8"][i]','`home-category-${i}`');s=s.replace('<div className="planning-mockup">','<div className="planning-mockup" aria-label="Illustration of the event planning workspace">');s=s.replace('<div className="agent-orb"><Sparkles','<div className="agent-orb" aria-label="Gala Agent illustration"><Sparkles');s=s.replace('name={i===0?"interest-5":"service-5"}','name={i===0?"organizer-illustration":"provider-illustration"}');p.write_text(s,encoding='utf8')
