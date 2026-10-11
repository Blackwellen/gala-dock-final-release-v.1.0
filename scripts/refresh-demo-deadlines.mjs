// Keeps the seeded marketplace demo "live" without re-seeding: shifts the demo requests' clocks (created, response deadline, hold expiry)
// forward by the time elapsed since the seed ran, so each request shows the countdown it was designed with. Requests that were
// auto-expired only because that time passed are reopened; ones designed as expired (deadline already past at seed time) stay expired.
// Touches only rows on demo events (events.settings.demo = true). Safe to re-run.
// Usage: node --env-file=.env --env-file=.env.local scripts/refresh-demo-deadlines.mjs
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }

const sql = `
do $$
declare
  anchor timestamptz := (select coalesce(max((settings->>'demo_clock')::timestamptz), min(created_at)) from public.events where settings->>'demo' = 'true');
  shift interval := now() - anchor; reopened int;
begin
  if anchor is null then raise notice 'No demo events.'; return; end if;
  create temp table d on commit drop as
    select r.id rid, b.id bid, (b.status = 'expired' and r.response_deadline + shift > now()) reopen
    from public.provider_requests r join public.events e on e.id = r.event_id join public.build_items b on b.request_id = r.id
    where e.settings->>'demo' = 'true';
  update public.provider_requests r set response_deadline = r.response_deadline + shift, created_at = r.created_at + shift from d where r.id = d.rid;
  update public.build_items b set response_deadline = b.response_deadline + shift, created_at = b.created_at + shift,
      hold_expires_at = b.hold_expires_at + shift, status = case when d.reopen then 'sent' else b.status end
    from d where b.id = d.bid;
  select count(*) into reopened from d where reopen;
  -- Record the new clock so the next run shifts only by the time since now.
  update public.events set settings = settings || jsonb_build_object('demo_clock', now()) where settings->>'demo' = 'true';
  raise notice 'Shifted demo requests by %, reopened %', shift, reopened;
end $$;
select count(*) filter (where b.status in ('sent','viewed') and b.response_deadline > now()) open_requests,
       count(*) filter (where b.status = 'expired') expired
from public.build_items b join public.events e on e.id = b.event_id where e.settings->>'demo' = 'true';`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(120_000),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
console.log(text);
