"""Attach bounded checkpoint evidence without turning route presence into completion."""
import hashlib,json,re,subprocess
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/pwa'
rows=json.loads((DOC/'route-state-manifest.json').read_text(encoding='utf-8'))

def read(path):
    raw=(ROOT/path).read_bytes()
    return raw.decode('utf-16') if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else raw.decode('utf-8-sig')

def same_route(pattern,actual):
    p,_,pq=pattern.partition('?');a,_,aq=actual.partition('?')
    pattern_rx='^'+re.sub(r'\\\[[^]]+\\\]',r'[^/]+',re.escape(p))+'$'
    if not re.match(pattern_rx,a):return False
    # Every canonical step needs its own capture; a bare route cannot certify a query state.
    return not pq or all(part in aq.split('&') for part in pq.split('&'))

audit_paths=['artifacts/pwa/customer-organizer-route-audit-final.log','artifacts/pwa/money-audit-retest.log']
for audit in audit_paths:
    if not (ROOT/audit).exists():continue
    text=read(audit)
    successes=re.findall(r'^OK\s+200\s+\w+\s+(/\S+)',text,re.M)
    for row in rows:
        if any(same_route(row['route'],actual) for actual in successes):
            row['gates']['responsive']='partial-pass: sampled mobile route geometry; full matrix pending'
            row['gates']['accessibility']='partial-pass: sampled route axe; manual/variants pending'
            row['gates']['test']='partial-pass: authenticated route smoke; workflows pending'
            if audit not in row['evidence']:row['evidence'].append(audit)

for row in rows:
    if row['id']=='ORG-001':
        row['gates']['visual']='FAIL: raw baseline 16.2%; approved stable-region comparison pending'
        evidence='artifacts/pwa/org-001-visual-final.json'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
    if row['route'] in ['/studio/[id]','/organizer/events/[id]/map','/organizer/agent/runs/[id]']:
        evidence='artifacts/pwa/editors-otp-final.json'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['test']='partial-pass: editor reflow/run refresh; full interactions pending'
        if row['route']=='/organizer/agent/runs/[id]':
            row['gates']['auth-RLS']='partial-pass: unknown ID and stale-control membership revocation denied; full matrix pending'
    if row['route'] in ['/organizer/media','/organizer/agent']:
        evidence='artifacts/pwa/'+('media-modal-production-axe.json' if row['route']=='/organizer/media' else 'agent-production-axe.json')
        if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['accessibility']='partial-pass: production modal/page axe; full manual/variants pending'
    if row['id'].startswith('BUY-'):
        evidence='artifacts/pwa/domain-retest-2.json'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['backend']='partial-pass: ticket/payment/resale domain checks; settlement pending'
    row['completion']='incomplete'

(DOC/'route-state-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
tracked=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
paths=sorted(set(p for p in tracked if p.startswith(('src/','scripts/','supabase/migrations/','tests/')) or p in ['package.json','package-lock.json','next.config.ts','tsconfig.json']))
hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths if (ROOT/p).is_file()}
payload={'observedUtc':datetime.now(timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tree':'shared and dirty; not an immutable release candidate','sourceHash':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest(),'files':hashes,'targets':len(rows),'completed':0}
(DOC/'checkpoint-source.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
print(json.dumps({k:payload[k] for k in ['observedUtc','head','sourceHash','targets','completed']}))
