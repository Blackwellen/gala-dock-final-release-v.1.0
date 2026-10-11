from pathlib import Path
for file in ['saved','onboarding','invites','enquiries']:
 p=Path('src/app/api')/file/'route.ts';s=p.read_text(encoding='utf8');s='import { hasRequiredAssurance } from "@/lib/supabase/assurance";\n'+s
 lines=s.splitlines();idx=next(i for i,line in enumerate(lines)if 'if (!user)' in line);lines.insert(idx+1,'  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first." }, { status: 403 });');p.write_text('\n'.join(lines)+'\n',encoding='utf8')
p=Path('src/app/api/onboarding/route.ts');s=p.read_text(encoding='utf8').replace('values.offer_kind === "service"','String(values.offer_kind).toLowerCase() === "service"');p.write_text(s,encoding='utf8')
p=Path('src/components/dashboard.tsx');s=p.read_text(encoding='utf8').replace(', Check, ChevronRight',', ChevronRight').replace(', Building2, Eye',', Eye');s=s.replace(' const sampleTasks=["Finalize venue contract","Approve marketing assets","Review ticket pricing","Coordinate with vendors","Send attendee reminder"];','');p.write_text(s,encoding='utf8')
p=Path('src/components/onboarding.tsx');s=p.read_text(encoding='utf8');
for name in ['Plus','Rocket','Clock','Zap','Settings','Music','FileCheck2']:s=s.replace(', '+name+',',',')
p.write_text(s,encoding='utf8')
p=Path('src/components/public.tsx');s=p.read_text(encoding='utf8').replace(', Check,',',').replace(', Mail,',',').replace('export function OrganizerPage(){const toast=useToast();','export function OrganizerPage(){');p.write_text(s,encoding='utf8')
