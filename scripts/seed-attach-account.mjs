// Gives a real account the full demo experience without onboarding:
//   • owner of the seeded provider workspace (Riverside Arena) and organizer workspace (Alex Events)
//   • a copy of the demo customer's own data (personal events + plans, guests, tasks, bookings, payments, threads, tickets, saved items, reviews)
// The demo accounts keep their data; the copies are new rows owned by the target. One transaction; refuses to copy twice.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-attach-account.mjs you@example.com
const email = process.argv[2];
if (!/^[^@\s]+@[^@\s]+$/.test(email ?? "")) { console.error("Usage: seed-attach-account.mjs <email>"); process.exit(1); }
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }
const lit = s => `'${String(s).replaceAll("'", "''")}'`;

const sql = `
do $$
declare
  target uuid := (select id from auth.users where lower(email) = lower(${lit(email)}));
  target_name text;
  src uuid := (select id from auth.users where email = 'alex.thompson@example.com');
  prov uuid := (select id from public.workspaces where kind = 'provider' and name = 'Riverside Arena' order by created_at limit 1);
  org uuid := (select w.id from public.workspaces w join auth.users u on u.id = w.owner_id where u.email = 'alex.events@example.com' and w.kind = 'organizer' limit 1);
  r record; j text; n int := 0;
begin
  if target is null then raise exception 'No account for %', ${lit(email)}; end if;
  if src is null or prov is null or org is null then raise exception 'Demo data missing: run the demo seeds first'; end if;
  target_name := coalesce((select nullif(full_name, '') from public.profiles where id = target), split_part(${lit(email)}, '@', 1));

  -- Workspaces: owner of each, onboarding treated as done, organizer opens by default.
  insert into public.workspace_members(workspace_id, user_id, role, status) values (prov, target, 'owner', 'active'), (org, target, 'owner', 'active')
    on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active';
  update public.profiles set onboarding_complete = true, last_workspace_id = org where id = target;

  if exists (select 1 from public.events where owner_id = target and settings ? 'demo_copy_of') then
    raise notice 'Customer data already copied — memberships refreshed only.'; return;
  end if;

  -- Old → new id map for every row copied, so references between copies stay intact.
  create temp table m(old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  insert into m(old) select id from public.events where owner_id = src;
  insert into m(old) select id from public.build_items where event_id in (select old from m);
  insert into m(old) select id from public.threads where event_id in (select old from m) on conflict do nothing;
  insert into m(old) select id from public.messages where thread_id in (select old from m) on conflict do nothing;
  insert into m(old) select id from public.tickets where holder_id = src and seat is null on conflict do nothing;
  insert into m(old) values (src) on conflict do nothing; update m set new = target where old = src;

  create or replace function pg_temp.remap(t text) returns text language plpgsql as $f$
    declare x record; begin for x in select old, new from m loop t := replace(t, x.old::text, x.new::text); end loop;
      return replace(replace(t, 'alex.thompson@example.com', current_setting('gd.email')), 'Alex Thompson', current_setting('gd.name')); end $f$;
  perform set_config('gd.name', target_name, true);
  perform set_config('gd.email', (select email from auth.users where id = target), true);

  -- Events (slug is unique; tagged so re-runs are detected).
  for r in select * from public.events where owner_id = src loop
    j := pg_temp.remap(to_jsonb(r)::text);
    insert into public.events select * from jsonb_populate_record(null::public.events, j::jsonb
      || jsonb_build_object('slug', case when r.slug is null then null else r.slug || '-' || substr(md5(random()::text), 1, 6) end,
                            'settings', coalesce(r.settings, '{}'::jsonb) || jsonb_build_object('demo_copy_of', r.id)));
    n := n + 1;
  end loop;
  insert into public.build_items select (jsonb_populate_record(null::public.build_items, pg_temp.remap(to_jsonb(b)::text)::jsonb)).* from public.build_items b where b.event_id in (select id from public.events where owner_id = src);
  insert into public.payments select (jsonb_populate_record(null::public.payments, (pg_temp.remap(to_jsonb(p)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.payments p where p.event_id in (select id from public.events where owner_id = src);
  insert into public.threads select (jsonb_populate_record(null::public.threads, pg_temp.remap(to_jsonb(t)::text)::jsonb)).* from public.threads t where t.event_id in (select id from public.events where owner_id = src);
  insert into public.messages select (jsonb_populate_record(null::public.messages, pg_temp.remap(to_jsonb(x)::text)::jsonb)).* from public.messages x where x.thread_id in (select id from public.threads where event_id in (select id from public.events where owner_id = src));
  insert into public.tasks select (jsonb_populate_record(null::public.tasks, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.tasks x where x.owner_id = src or x.event_id in (select id from public.events where owner_id = src);
  insert into public.guests select (jsonb_populate_record(null::public.guests, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.guests x where x.event_id in (select id from public.events where owner_id = src);
  insert into public.programme_items select (jsonb_populate_record(null::public.programme_items, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.programme_items x where x.event_id in (select id from public.events where owner_id = src);
  insert into public.calendar_entries select (jsonb_populate_record(null::public.calendar_entries, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.calendar_entries x where x.owner_id = src;
  insert into public.reviews select (jsonb_populate_record(null::public.reviews, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.reviews x where x.user_id = src and (x.build_item_id is null or x.build_item_id in (select old from m));
  insert into public.saved_items select (jsonb_populate_record(null::public.saved_items, pg_temp.remap(to_jsonb(x)::text)::jsonb)).* from public.saved_items x where x.user_id = src on conflict do nothing;
  insert into public.recently_viewed select (jsonb_populate_record(null::public.recently_viewed, pg_temp.remap(to_jsonb(x)::text)::jsonb)).* from public.recently_viewed x where x.user_id = src on conflict do nothing;
  insert into public.notifications select (jsonb_populate_record(null::public.notifications, (pg_temp.remap(to_jsonb(x)::text)::jsonb) || jsonb_build_object('id', gen_random_uuid()))).* from public.notifications x where x.user_id = src;
  -- Tickets for public events: fresh codes and QR nonces (copies are distinct, scannable tickets); seated tickets are skipped so no seat is double-sold.
  insert into public.tickets select (jsonb_populate_record(null::public.tickets, (pg_temp.remap(to_jsonb(x)::text)::jsonb)
      || jsonb_build_object('code', 'GLD-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 6)),
                            'qr_nonce', encode(extensions.gen_random_bytes(16), 'hex'),
                            'replaced_by', case when x.replaced_by in (select old from m) then (select new from m where old = x.replaced_by) else null end))).*
    from public.tickets x where x.holder_id = src and x.seat is null;
  raise notice 'Copied % personal events and their plans for %', n, ${lit(email)};
end $$;
select (select count(*) from public.workspace_members wm join auth.users u on u.id = wm.user_id where lower(u.email) = lower(${lit(email)})) as workspaces,
       (select count(*) from public.events e join auth.users u on u.id = e.owner_id where lower(u.email) = lower(${lit(email)})) as own_events,
       (select count(*) from public.tickets t join auth.users u on u.id = t.holder_id where lower(u.email) = lower(${lit(email)})) as tickets,
       (select count(*) from public.saved_items s join auth.users u on u.id = s.user_id where lower(u.email) = lower(${lit(email)})) as saved;`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(120_000),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
console.log(text);
