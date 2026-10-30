// Retire only the two designated demo sessions exposed by legacy tracked browser states.
// Reads credentials in memory; never logs token values. Uses the existing auth.sessions revocation architecture.
import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const targets={customer:'alex.thompson@example.com',organizer:'alex.events@example.com'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revoke=process.argv.includes('--revoke');
for(const [role,email] of Object.entries(targets)){
 const file=`artifacts/visual/state-${role}.json`,state=JSON.parse(await fs.readFile(file,'utf8'));
 const groups=new Map();
 for(const cookie of state.cookies??[])if(/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)){
  const key=cookie.name.replace(/\.\d+$/,'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(cookie);
 }
 const values=[...[...groups.values()].map(c=>c.sort((a,b)=>Number(a.name.split('.').at(-1)||0)-Number(b.name.split('.').at(-1)||0)).map(v=>v.value).join('')),...(state.origins??[]).flatMap(o=>(o.localStorage??[]).filter(v=>/^sb-.*-auth-token$/.test(v.name)).map(v=>v.value))];
 let matched=0;
 for(let value of values){
  value=decodeURIComponent(value);if(value.startsWith('base64-'))value=Buffer.from(value.slice(7),'base64').toString('utf8');
  const session=JSON.parse(value),token=session.access_token??(Array.isArray(session)?session[0]:null);
  if(!token)continue;
  const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
  if(!uuid.test(payload.sub)||!uuid.test(payload.session_id)||payload.iss!==`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)throw new Error(`Unexpected session identity/project in ${file}; no session was revoked.`);
  matched++;
  if(!revoke){console.log(JSON.stringify({file,sessionFound:true,accessTokenExpired:payload.exp*1000<Date.now()}));continue;}
  const ref=process.env.SUPABASE_PROJECT_REF,pat=process.env.SUPABASE_PAT_KEY;if(!ref||!pat)throw new Error('Missing management configuration');
  // Both session and user must match the allowlisted demo account. Refresh tokens cascade with the session.
  const query=`with retired as (delete from auth.sessions s using auth.users u where s.user_id=u.id and s.id='${payload.session_id}'::uuid and u.id='${payload.sub}'::uuid and u.email='${email}' returning s.id,s.user_id), logged as (insert into public.audit_events(actor_id,actor_type,event,metadata) select user_id,'system','auth.session_retired',jsonb_build_object('reason','tracked_browser_state','session_id',id) from retired returning id) select (select count(*) from retired)::int as retired,(select count(*) from logged)::int as audited;`;
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Session retirement failed (HTTP ${response.status}); response suppressed.`);
  const result=await response.json();
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const refreshed=await client.auth.refreshSession({refresh_token:session.refresh_token??session[1]});
  if(!refreshed.error||refreshed.data.session){
   if(refreshed.data.user?.email===email&&refreshed.data.session){const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await admin.auth.admin.signOut(refreshed.data.session.access_token,'local');}
   throw new Error(`Retired demo state remained refreshable: ${file}`);
  }
  console.log(JSON.stringify({file,...result[0],accessTokenExpired:payload.exp*1000<Date.now(),refreshRejected:true}));
 }
 if(!matched)throw new Error(`No supported session found in ${file}`);
}
