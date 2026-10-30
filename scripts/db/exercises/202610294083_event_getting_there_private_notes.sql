-- Dry-run exercise for 202610294083 (always rolled back by migrate.mjs; the migration — incl. its backfill — runs first).
--   backfill: Neon's legacy settings.getting_there is now a table row, and no event's settings carries the key
--   client-role write: Neon manager saves a DRAFT note (public = false) through event_getting_there_save
--   anon REST-equivalent read of events (role anon, RLS on): settings has no getting_there key and never contains the draft text;
--     anon has no privilege on event_getting_there (42501); public_event_getting_there returns no notes while not public
--   outsider (authenticated non-member): 0 rows from event_getting_there; manager: 1 row
--   public = true → notes returned by the public RPC (still not in events.settings)
--   transition fallback: a public event with only legacy settings.getting_there still renders; saving moves it and drops the key
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; ws uuid; mgr uuid; outsider uuid; other uuid; j jsonb; t text; n int; ok boolean;
begin
  select workspace_id into ws from public.events where id = neon;
  select m.user_id into mgr from public.workspace_members m where m.workspace_id = ws and m.role in ('owner', 'manager') order by m.role desc limit 1;
  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = ws)
    and not exists (select 1 from public.tickets x where x.holder_id = u.id) order by created_at limit 1;

  -- Backfill
  if not exists (select 1 from public.event_getting_there where event_id = neon and notes ? 'transit') then raise exception 'backfill: Neon notes not moved'; end if;
  if exists (select 1 from public.events where settings ? 'getting_there') then raise exception 'backfill: settings.getting_there still present'; end if;
  insert into _ex values ('backfill', 'neon moved; key gone everywhere');

  -- Draft note as the manager (client role).
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.event_getting_there_save(neon, jsonb_build_object('public', false, 'transit', 'EX4083 draft note — staff entrance code 4083', 'parking_ids', '[]'::jsonb));
  select count(*) into n from public.event_getting_there where event_id = neon;
  if n <> 1 then raise exception 'manager: cannot read own notes row'; end if;
  reset role;
  insert into _ex values ('client_write', 'manager saved draft; member read ok');

  -- anon: what PostgREST would return for /events?select=settings (role anon, RLS applies).
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select string_agg(coalesce(e.settings::text, ''), ' ') into t from public.events e;
  if t ~ 'EX4083|staff entrance code' or t ~ '"getting_there"' then raise exception 'anon: notes visible through events.settings'; end if;
  ok := false; begin perform 1 from public.event_getting_there limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon: event_getting_there readable'; end if;
  j := public.public_event_getting_there(neon);
  if j -> 'notes' <> '{}'::jsonb then raise exception 'anon: draft notes returned by the public RPC'; end if;
  reset role;
  insert into _ex values ('anon', 'events.settings clean; table denied; RPC notes {} while draft');

  -- outsider
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.event_getting_there;
  if n <> 0 then raise exception 'outsider: % notes rows visible', n; end if;
  select string_agg(coalesce(e.settings::text, ''), ' ') into t from public.events e where e.id = neon;
  if t ~ 'EX4083' then raise exception 'outsider: notes in events.settings'; end if;
  reset role;
  insert into _ex values ('outsider', '0 rows; settings clean');

  -- Publish: notes come back through the RPC only.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.event_getting_there_save(neon, jsonb_build_object('public', true, 'transit', 'EX4083 public transit note'));
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  j := public.public_event_getting_there(neon);
  if j -> 'notes' ->> 'transit' <> 'EX4083 public transit note' then raise exception 'anon: published note missing'; end if;
  if (select settings::text from public.events where id = neon) ~ 'EX4083' then raise exception 'anon: published note copied into settings'; end if;
  reset role;
  insert into _ex values ('published', 'RPC only');

  -- Transition fallback: legacy settings key on an event with no table row.
  select e.id into other from public.events e where e.id <> neon and e.visibility = 'public' and e.status in ('published', 'on_sale', 'live') and e.workspace_id = ws
    and not exists (select 1 from public.event_getting_there g where g.event_id = e.id) order by e.created_at limit 1;
  if other is null then raise exception 'exercise: need a second public event'; end if;
  update public.events set settings = coalesce(settings, '{}'::jsonb) || '{"getting_there": {"public": true, "transit": "EX4083 legacy"}}'::jsonb where id = other;
  set local role anon;
  if public.public_event_getting_there(other) -> 'notes' ->> 'transit' is distinct from 'EX4083 legacy' then raise exception 'fallback: legacy notes not rendered'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.event_getting_there_save(other, jsonb_build_object('public', true, 'transit', 'EX4083 legacy'));
  reset role;
  if (select settings ? 'getting_there' from public.events where id = other) then raise exception 'fallback: save did not drop the legacy key'; end if;
  if not exists (select 1 from public.event_getting_there where event_id = other and public) then raise exception 'fallback: save did not write the table'; end if;
  insert into _ex values ('fallback', 'legacy rendered; save moved it');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
