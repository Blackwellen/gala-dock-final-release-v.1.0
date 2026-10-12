import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/pwa'
targets=json.loads((DOC/'route-state-manifest.json').read_text(encoding='utf-8'))
pages=json.loads((DOC/'discovered-routes.json').read_text(encoding='utf-8'))
normalize=lambda s:re.sub(r'\[[^/]+\]','[id]',s.split('?')[0])
byroute={normalize(p['route']):p for p in pages}
def dynamic_match(pattern,route):
    pattern=pattern.split('?')[0]
    if '[[...' in pattern:
        prefix=pattern.split('/[[...')[0]
        return route==prefix or route.startswith(prefix+'/')
    parts=pattern.strip('/').split('/')
    actual=route.strip('/').split('/')
    return len(parts)==len(actual) and all(a==b or (a.startswith('[') and not a.startswith('[...')) for a,b in zip(parts,actual))
aliases={'/organizer/tickets-promotion':'/organizer/tickets','/organizer/events/[id]/promotion/new':'/organizer/promotions/new?event=[id]'}
known=['visual','functional','backend','auth-RLS','Agent','responsive','accessibility','performance','test']
lines=['# Route and state manifest','','Generated from the complete master specification. Presence is not completion. Each route requires direct deep-link and refresh testing; every named subtab, drawer, modal, menu and capability variant requires separate evidence. No target is marked completed by this inventory.','','| ID | Route / state | Role | Source / implementation | Views | '+ ' | '.join(known)+' | Evidence |','|---|---|---|---|---|'+ '|'.join(['---']*(len(known)+1))+'|']
integrations=['# Integration matrix','','Static source inventory; this establishes reuse paths, not proof of runtime authorization. Use the domain suites and user-scoped clients for assertions.','','| Target | Implementation | Tables / RPCs discovered in route dependencies | Services |','|---|---|---|---|']
def deps(p,seen,depth=0):
    if p in seen or depth>5 or not p.exists(): return ''
    seen.add(p); text=p.read_text(encoding='utf-8-sig')
    output=text
    for mod in re.findall(r'from ["\']([^"\']+)["\']',text):
        if mod.startswith('@/'): path=ROOT/'src'/mod[2:]
        elif mod.startswith('.'):path=p.parent/mod
        else:continue
        for ext in ['.ts','.tsx','/index.ts','/index.tsx']:
            q=Path(str(path)+ext)
            if q.exists(): output+='\n'+deps(q,seen,depth+1);break
    return output
missing=[]
for r in targets:
    r['sourceId']=r['id'].rsplit('-',1)[0] if r['id'].startswith('AG-') else r['id']
    route=normalize(r['route'])
    match=byroute.get(route) or next((p for p in pages if dynamic_match(p['route'],route)),None)
    if not match and route in aliases:
        match=byroute.get(normalize(aliases[route]));r['equivalentRoute']=aliases[route]
    r['implementation']='route-present; unverified' if match else 'missing-route-or-needs-approved-equivalent'
    if match:r['sourceFile']=match['file']
    else:missing.append((r['id'],r['route']))
    views=r['views'].replace('|',' / ')
    source=f"`{match['file']}`" if match else '**Missing / unresolved**'
    lines.append('| '+ ' | '.join([r['id'],f"`{r['route']}`",r['role'],source,views]+[r['gates'][g] for g in known]+[', '.join(r['evidence']) or '—'])+' |')
    seen=set();content=deps(ROOT/match['file'],seen) if match else ''
    tables=sorted(set(re.findall(r'\.from\(["\']([^"\']+)',content)))
    rpc=sorted(set(re.findall(r'\.rpc\(["\']([^"\']+)',content)))
    services=sorted(str(p.relative_to(ROOT)).replace('\\','/') for p in seen if '/lib/' in str(p).replace('\\','/'))
    integrations.append('| '+ ' | '.join([r['id'],source,', '.join(tables+['RPC '+x for x in rpc]) or '—','<br>'.join(services)])+' |')
(DOC/'route-state-manifest.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2),encoding='utf-8')
(DOC/'route-state-manifest.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(DOC/'integration-matrix.md').write_text('\n'.join(integrations)+'\n',encoding='utf-8')
(DOC/'route-gaps.json').write_text(json.dumps(missing,indent=2),encoding='utf-8')
print(json.dumps({'targets':len(targets),'routePresent':len(targets)-len(missing),'missing':missing},indent=2))
