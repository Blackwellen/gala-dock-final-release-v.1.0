// Temporary Q29 capture fixture on the demo "Taste & Tango Food Fest" event (demo customer holds 2 GA tickets).
// Every row is titled "[W02 fixture] …" and removed with `cleanup`. Usage: node --env-file=.env --env-file=.env.local fixture.mjs create|cleanup|show
const mode = process.argv[2];
const run = async query => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(120000) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 600)); return JSON.parse(t);
};
const EV = "fa33d047-250c-4a08-b3c0-ad513a954d70";
const cleanup = `delete from public.virtual_attendance where session_id in (select id from public.virtual_sessions where title like '[W02 fixture]%');
delete from public.virtual_join_tokens where session_id in (select id from public.virtual_sessions where title like '[W02 fixture]%');
delete from public.virtual_recordings where session_id in (select id from public.virtual_sessions where title like '[W02 fixture]%');
delete from public.virtual_sessions where title like '[W02 fixture]%';
select count(*)::int as left from public.virtual_sessions where title like '[W02 fixture]%';`;
if (mode === "cleanup") console.log(JSON.stringify(await run(cleanup)));
else if (mode === "show") console.log(JSON.stringify(await run(`select id, title, status, starts_at from public.virtual_sessions where title like '[W02 fixture]%' order by starts_at`)));
else if (mode === "create") {
  const ws = `(select workspace_id from public.events where id = '${EV}')`;
  const sql = `
with s as (insert into public.virtual_sessions(event_id, workspace_id, title, kind, track, starts_at, ends_at, status, join_url, access, tier_ids, captions, sign_language, transcript)
  values ('${EV}', ${ws}, '[W02 fixture] Opening welcome & tasting', 'main', 'Main stage', now() - interval '10 minutes', now() + interval '50 minutes', 'scheduled', 'https://example.com/w02-fixture-main', 'ticket', '{}', 'live_human', true, true),
         ('${EV}', ${ws}, '[W02 fixture] Tango workshop for beginners', 'workshop', 'Studio', now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduled', 'https://example.com/w02-fixture-ws', 'ticket', '{}', 'live_auto', false, false),
         ('${EV}', ${ws}, '[W02 fixture] Chef Q&A', 'webinar', null, now() - interval '1 day 2 hours', now() - interval '1 day 1 hour', 'scheduled', 'https://example.com/w02-fixture-qa', 'ticket', '{}', 'post_event', false, true),
         ('${EV}', ${ws}, '[W02 fixture] Wine pairing masterclass', 'webinar', null, now() - interval '10 days 2 hours', now() - interval '10 days 1 hour', 'scheduled', 'https://example.com/w02-fixture-wine', 'ticket', '{}', 'none', false, false),
         ('${EV}', ${ws}, '[W02 fixture] Producers'' circle (VIP)', 'breakout', 'VIP', now() - interval '3 hours', now() - interval '2 hours', 'scheduled', 'https://example.com/w02-fixture-vip', 'ticket', array[gen_random_uuid()], 'none', false, false)
  returning id, title)
insert into public.virtual_recordings(session_id, event_id, workspace_id, title, source, url, status, audience, access_until)
select s.id, '${EV}', ${ws}, s.title || ' (replay)', 'provider_url', 'https://example.com/w02-fixture-replay', 'processing', 'attendees',
  case when s.title like '%Wine%' then now() - interval '2 days' else now() + interval '7 days' end
from s where s.title like '%Q&A%' or s.title like '%Wine%' or s.title like '%VIP%';
update public.virtual_recordings set status = 'available' where title like '[W02 fixture]%';
select r.title, r.status, r.access_until from public.virtual_recordings r where r.title like '[W02 fixture]%';`;
  try { console.log(JSON.stringify(await run(sql))); } catch (e) { console.error("create failed:", e.message); console.log(JSON.stringify(await run(cleanup))); process.exit(1); }
}
