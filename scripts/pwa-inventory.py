"""Inventory the supplied source and reference images without modifying either."""
import json
import re
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\PC\.codex\attachments\19bcec0e-4eef-409c-a9db-b84405f8a7f6\Pasted text.txt')
out = ROOT / 'docs/pwa'
out.mkdir(parents=True, exist_ok=True)
source = SOURCE.read_text(encoding='utf-8-sig')
(out / 'master-specification.md').write_text(source, encoding='utf-8')
targets = []
appendix = source.split('```text', 1)[1]
for match in re.finditer(r'^(CU-(?:W\d{2}-)?\d{2,3}|ORG-(?:W\d{2}-)?\d{2,3}|PROV-(?:W\d{2}-)?\d{2,3}) ([^\n]+)\nRoute(?: / state)?: ([^\n]+)\n(.*?)(?=\n(?:CU-|ORG-|PROV-|\d+\. |```)|\Z)', appendix, re.M | re.S):
    ident, name, route, body = match.groups()
    tabs = re.search(r'^Views / sub-tabs: (.+)$', body, re.M)
    targets.append(dict(id=ident, name=name, route=route.strip(), role={'CU':'customer','ORG':'organizer','PROV':'provider'}[ident.split('-')[0]], views=tabs[1] if tabs else '', implementation='present-unverified', gates={k:'not-tested' for k in ['visual','functional','backend','auth-RLS','Agent','responsive','accessibility','performance','test']}, evidence=[]))
for ident, name, route in [('BUY-W01-01','Tickets','/checkout/[event]?step=1'),('BUY-W01-02','Attendee Details','/checkout/[event]?step=2'),('BUY-W01-03','Pay & Confirm','/checkout/[event]?step=3'),('BUY-W02-01','Resale Eligibility & Price','/account/tickets/[id]/resale?step=1'),('BUY-W02-02','Review & List','/account/tickets/[id]/resale?step=2')]:
    targets.append(dict(id=ident,name=name,route=route,role='customer',views='',implementation='present-unverified',gates={k:'not-tested' for k in targets[0]['gates']},evidence=[]))
for role, base in [('organizer','/organizer/agent'),('provider','/provider/agent')]:
    for i, (name, suffix) in enumerate([('Work',''),('Run Detail','/runs/[id]'),('Routines','/routines'),('Approvals','/approvals'),('History','/history')],1):
        targets.append(dict(id=f'AG-{i:03}-{role.upper()}',name=name,route=base+suffix,role=role,views='',implementation='needs-route-audit',gates={k:'not-tested' for k in targets[0]['gates']},evidence=[]))
for prefix, role, rows in [('AUTH','shared',['/login','/register','/verify-email','/forgot-password','/reset-password','/mfa','/invite/[token]','/access']),('AD','admin',['/admin','/admin/users','/admin/users/[id]','/admin/workspaces','/admin/workspaces/[id]','/admin/events','/admin/marketplace','/admin/marketplace/listings/[id]','/admin/tickets','/admin/commerce','/admin/commerce/transactions/[id]','/admin/trust','/admin/support','/admin/support/[id]','/admin/partners','/admin/agent-integrations','/admin/analytics','/admin/settings'])]:
    for i,route in enumerate(rows,1):
        targets.append(dict(id=f'{prefix}-{i:03}',name=route,route=route,role=role,views='',implementation='present-unverified',gates={k:'not-tested' for k in targets[0]['gates']},evidence=[]))
for ident, route in [('ONB-001','/onboarding'),('ONB-CU-01','/onboarding/customer?step=1')]+[(f'ONB-{short}-{i:02}',f'/onboarding/{role}?step={i}') for short,role in [('ORG','organizer'),('PROV','provider')] for i in range(1,5)]:
    targets.append(dict(id=ident,name=route,route=route,role='shared',views='',implementation='present-unverified',gates={k:'not-tested' for k in targets[0]['gates']},evidence=[]))
for ident,route,role in [('MEDIA-ORG','/organizer/media','organizer'),('MEDIA-PROV','/provider/media','provider'),('MEDIA-STUDIO','/studio/[id]','shared'),('MAP-PROV','/provider/venues/[id]?tab=spaces','provider'),('AG-001-ADMIN','/admin/agent-integrations','admin'),('PLANNER-CU','/plan?step=1','customer'),('TICKET-ALLOCATION','/organizer/events/[id]/tickets/setup?step=1&section=seating','organizer'),('TICKET-REVIEW','/organizer/events/[id]/tickets/setup?step=3&section=review','organizer')]:
    targets.append(dict(id=ident,name=ident,route=route,role=role,views='',implementation='present-unverified',gates={k:'not-tested' for k in targets[0]['gates']},evidence=[]))
# Never reset recorded QA when refreshing the inventory.
manifest = out / 'route-state-manifest.json'
if manifest.exists():
    previous = {r['id']:r for r in json.loads(manifest.read_text(encoding='utf-8'))}
    targets = [{**r, **{k:v for k,v in previous.get(r['id'],{}).items() if k in ['gates','evidence','implementation']}} for r in targets]
manifest.write_text(json.dumps(targets,indent=2,ensure_ascii=False),encoding='utf-8')
pages = sorted((ROOT/'src/app').rglob('page.tsx'))
(out/'discovered-routes.json').write_text(json.dumps([{'file':str(p.relative_to(ROOT)).replace('\\','/'),'route':'/'+ '/'.join(s for s in p.relative_to(ROOT/'src/app').parts[:-1] if not s.startswith('('))} for p in pages],indent=2),encoding='utf-8')
images = sorted((ROOT/'Designs/PWA').rglob('*.png'))
inventory=[]
contacts=ROOT/'artifacts/pwa/inventory'
contacts.mkdir(parents=True,exist_ok=True)
for i,p in enumerate(images):
    w,h=Image.open(p).size
    inventory.append(dict(index=i+1,file=str(p.relative_to(ROOT)).replace('\\','/'),width=w,height=h,mapping='pending visual inspection',crop='pending inspection; never auto-crop app chrome'))
(out/'design-inventory.json').write_text(json.dumps(inventory,indent=2,ensure_ascii=False),encoding='utf-8')
for n in range((len(images)+11)//12):
    sheet=Image.new('RGB',(1440,1530),'#eef0f6')
    draw=ImageDraw.Draw(sheet)
    for j,p in enumerate(images[n*12:(n+1)*12]):
        x,y=(j%4)*360,(j//4)*510
        label=p.parent.name if p.name=='.png' else p.stem
        draw.text((x+5,y+5),f'{n*12+j+1}: {label[:44]}',fill='black')
        sheet.paste(ImageOps.contain(Image.open(p).convert('RGB'),(350,470)),(x+5,y+35))
    sheet.save(contacts/f'contact-{n}.jpg')
print(json.dumps({'appendixTargets':sum(r['id'].startswith(('CU-','ORG-','PROV-')) for r in targets),'totalTargets':len(targets),'routes':len(pages),'images':len(images)},indent=2))
