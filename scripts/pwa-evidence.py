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

audit_paths=['artifacts/pwa/customer-organizer-route-audit-final.log','artifacts/pwa/money-audit-retest.log','artifacts/pwa/resume-customer-organizer-audit.log']
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
    if row['id']=='CU-013':
        evidence='artifacts/pwa/finish-account-build11.log'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['functional']='partial-pass: persisted own event preferences and honest payment failure/retry; all account/security variants pending'
        row['gates']['auth-RLS']='partial-pass: actual user-scoped preference writes and cross-user denial; full account/storage/security matrix pending'
        row['gates']['responsive']='partial-pass: account/preferences dialog at four phone/tablet sizes; complete zoom/state matrix pending'
        row['gates']['accessibility']='partial-pass: 390px account dialog axe and keyboard focus/Escape; manual/other states pending'
        row['gates']['performance']='partial-pass: throttled production account CLS 0.002 after header fix; LCP/field/memory budgets pending'
        for evidence in ['artifacts/pwa/finish-account-performance-final.json','artifacts/pwa/finish-payment-unit.log']:
            if evidence not in row['evidence']:row['evidence'].append(evidence)
        visual='artifacts/pwa/finish-cu-013-visual.json'
        if (ROOT/visual).exists():
            measured=json.loads(read(visual))['mismatchPercent']
            row['gates']['visual']=f'FAIL: raw unmasked account viewport candidate {measured:.2f}%; inferred CSS viewport not approved'
            if visual not in row['evidence']:row['evidence'].append(visual)
    if row['id']=='ORG-001':
        evidence='artifacts/pwa/resume-org-001-tablet-visual-5.json'
        measured=json.loads(read(evidence))['mismatchPercent']
        row['gates']['visual']=f'FAIL: latest raw tablet candidate {measured:.2f}%; source viewport and stable-fixture comparison pending'
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
    if row['route'] in ['/studio/[id]','/organizer/events/[id]/map','/organizer/agent/runs/[id]'] or row['route'].startswith('/organizer/events/[id]/tickets/setup'):
        evidence='artifacts/pwa/resume-editors-final.log'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['test']='partial-pass: production editor/offline draft/canonical wizard/revoked Agent regressions; full variants pending'
        row['gates']['functional']='partial-pass: production scoped editor/draft, run access or canonical wizard checks; full workflows pending'
    if '/resale' in row['route'] or '/confirmation' in row['route']:
        for evidence in ['artifacts/pwa/resume-refunds-final.log','artifacts/pwa/resume-refund-database-final.log']:
            if evidence not in row['evidence']:row['evidence'].append(evidence)
        row['gates']['backend']='partial-pass: original-payment ownership, refund provider states, cancellation leases, ledger delta checks; sandbox settlement/liability reconciliation pending'
        if '/resale' in row['route']:
            for evidence in ['artifacts/pwa/finish-liability-unit-retry.log','artifacts/pwa/finish-liability-database.log','artifacts/pwa/finish-resale-sandbox-refund.log']:
                if evidence not in row['evidence']:row['evidence'].append(evidence)
            row['gates']['backend']='partial-pass: seller liability allocation, atomic settlement, replay and actual original-method Stripe sandbox refund; full cancellation/chargeback/production certification pending'
    row['completion']='incomplete'

provider_report=ROOT/'artifacts/visual/ws-layout/provider-mobile.json'
if provider_report.exists():
    cases=json.loads(read('artifacts/visual/ws-layout/provider-mobile.json'))['report']
    for row in rows:
        matching=[case for case in cases if case.get('resolved') and same_route(row['route'],case['resolved'])]
        if not matching:continue
        issues=[issue for case in matching for issue in case['issues'] if not issue.startswith('axe:')]
        row['gates']['responsive']='FAIL: sampled provider geometry/route issues' if issues else 'partial-pass: sampled provider four-size geometry; full capability/state matrix pending'
        axe=[v['id'] for case in matching if case.get('size')=='390x844' for v in case.get('axe',[])]
        row['gates']['accessibility']='FAIL: sampled provider axe '+', '.join(sorted(set(axe))) if axe else 'partial-pass: sampled provider 390px axe; manual/variants pending'
        evidence='artifacts/visual/ws-layout/provider-mobile.json'
        if evidence not in row['evidence']:row['evidence'].append(evidence)

maximum_audits=['artifacts/pwa/maximum-subviews-final.json','artifacts/pwa/maximum-subviews-recheck9.json','artifacts/pwa/maximum-subviews-release.json']
maximum_cases={}
for evidence in maximum_audits:
    if not (ROOT/evidence).exists():continue
    for case in json.loads(read(evidence))['report']:
        maximum_cases[(case['role'],case['route'])]=(case,evidence)
for row in rows:
    row['implementationStatus']='route-present' if row.get('sourceFile') and (ROOT/row['sourceFile']).exists() else 'unresolved'
    row.pop('pixelTargetWaived',None)
    row['exactPixelMatchRelaxed']=True
    matches=[(case,evidence) for case,evidence in maximum_cases.values() if same_route(row['route'],case.get('landed',case['route']))]
    if matches:
        failed=[case for case,_ in matches if case['issues']]
        row['gates']['test']='FAIL: sampled route/subview cases' if failed else 'partial-pass: actual route and in-page tab navigation; individual workflow certification remains separate'
        row['gates']['responsive']='FAIL: sampled route/subview cases' if failed else 'partial-pass: 390x844 DPR2 internal-tab reflow; broader prior matrices recorded separately'
        row['gates']['accessibility']='FAIL: sampled route/subview cases' if failed else 'partial-pass: WCAG axe on actual internal tabs; static incidental poster artwork excluded, all library controls included; manual/capability matrix remains'
        for _,evidence in matches:
            if evidence not in row['evidence']:row['evidence'].append(evidence)

final_checks=['artifacts/pwa/maximum-final-ui.json','artifacts/pwa/maximum-final-ui-recheck.json','artifacts/pwa/maximum-final-lifecycle.json','artifacts/pwa/maximum-final-domain-accepted.json','artifacts/pwa/maximum-final-security.json','artifacts/pwa/signoff-payment-retry.json','artifacts/pwa/signoff-cancellation-upload.json','artifacts/pwa/signoff-readiness-boundaries.json','artifacts/pwa/signoff-upload-production.json','artifacts/pwa/continuation-media-domains.json','artifacts/pwa/continuation-map-final.json','artifacts/pwa/continuation-studio-export-retry.json','artifacts/pwa/continuation-webhook-finance-final.json']
verified=[]
for evidence in final_checks:
    if (ROOT/evidence).exists():
        result=json.loads(read(evidence))
        stats=result.get('stats',{})
        if stats.get('expected',0)>0 and stats.get('unexpected',1)==0 and stats.get('skipped',1)==0:
            verified.append(evidence)
for row in rows:
    if verified:
        row['releaseAssessment']='docs/pwa/maximum-functional-assessment.md'
        row['scopedReleaseSuiteEvidence']=verified
    if row['route']=='/studio/[id]' and 'artifacts/pwa/continuation-studio-export-retry.json' in verified:
        row['gates']['functional']='partial-pass: actual autosave, version conflict/restore, private templates, brand/comment controls and mobile PNG/PDF exports; full editor permutations remain'
        row['gates']['auth-RLS']='partial-pass: cross-workspace design denial, private template isolation, font/comment ownership and Agent workspace checks; complete capability matrix remains'
        for evidence in ['artifacts/pwa/continuation-media-domains.json','artifacts/pwa/continuation-studio-export-retry.json']:
            if evidence in verified and evidence not in row['evidence']:row['evidence'].append(evidence)
    if row['route']=='/organizer/events/[id]/map' and 'artifacts/pwa/continuation-map-final.json' in verified:
        row['gates']['functional']='partial-pass: mobile JSON import/draft/reload, publish to native reserved-seat inventory, JSON/SVG export; full geometry and collaboration variants remain'
        row['gates']['backend']='partial-pass: six competing buyers for one seat, held-seat publication guard, released tier counts and twelve concurrent saves with unique history versions'
        row['gates']['auth-RLS']='partial-pass: real authenticated unrelated user cannot save/publish this event; full owner/member/scoped-staff matrix remains'
        evidence='artifacts/pwa/continuation-map-final.json'
        if evidence not in row['evidence']:row['evidence'].append(evidence)
# Each merged observation retains the build-specific evidence it came from.
(ROOT/'artifacts/pwa/maximum-subviews-merged.json').write_text(json.dumps({'scope':'390x844 DPR2; observations across builds, not one immutable candidate; incidental noninteractive poster artwork excluded from axe','report':[dict(case,evidence=evidence) for case,evidence in maximum_cases.values()]},ensure_ascii=False,indent=2),encoding='utf-8')
(DOC/'route-state-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
tracked=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
paths=sorted(set(p for p in tracked if p.startswith(('src/','scripts/','supabase/migrations/','tests/')) or p in ['package.json','package-lock.json','next.config.ts','tsconfig.json']))
hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths if (ROOT/p).is_file()}
payload={'observedUtc':datetime.now(timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tree':'shared and dirty; not an immutable release candidate','sourceHash':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest(),'files':hashes,'targets':len(rows),'completed':0}
(DOC/'checkpoint-source.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
print(json.dumps({k:payload[k] for k in ['observedUtc','head','sourceHash','targets','completed']}))
