// Read-only diagnostics: expose wait categories, never credentials or raw SQL/data.
const query="select state,wait_event_type,wait_event,count(*)::int as sessions from pg_stat_activity where pid<>pg_backend_pid() and query like '%provider_requests%' group by 1,2,3";
const response=await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_PAT_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`Database diagnostic HTTP ${response.status}`);
console.log(JSON.stringify(await response.json()));
