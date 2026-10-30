-- Dry-run exercise for 202610294084 (always rolled back by migrate.mjs).
--   backfill: every row's public_settings = event_public_settings(settings)
--   anon on events_public: exactly the public columns; public rows only (= owner's count of public published/on_sale/live); no private
--     settings key anywhere (budget_lines, revenue_sources, objectives, risk, readiness, invite_token, admin_restriction, promotion_plan,
--     demo*, getting_there); ticket_pro.access has no comps; view is read-only for anon
--   client-role write (Neon manager, base table update under RLS → triggers): settings change re-projects; a forged public_settings is overwritten
--   outsider: same view rows as anon; event_is_public true/false
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; ws uuid; mgr uuid; outsider uuid; n int; n2 int; t text; cols text; ok boolean; drf uuid;
begin
  select count(*) into n from public.events where public_settings is distinct from public.event_public_settings(coalesce(settings, '{}'::jsonb));
  if n <> 0 then raise exception 'backfill: % rows out of date', n; end if;
  insert into _ex values ('backfill', 'all rows projected');

  select workspace_id into ws from public.events where id = neon;
  select m.user_id into mgr from public.workspace_members m where m.workspace_id = ws and m.role in ('owner', 'manager') order by m.role desc limit 1;
  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id)
    and not exists (select 1 from public.tickets x where x.holder_id = u.id) order by created_at limit 1;

  -- Plant private keys on Neon (rolled back) — through the client role, so the trigger runs as it will in production.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.events set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'objectives', jsonb_build_array('EX4084 forecast profit £99,999'), 'budget_lines', jsonb_build_object('EX4084', 1), 'invite_token', 'ex4084secrettoken',
      'promotion_plan', jsonb_build_object('notes', 'EX4084 internal note'), 'risk', 'EX4084risk', 'demo_seed', 'EX4084demo',
      'faqs', jsonb_build_array(jsonb_build_object('q', 'EX4084 public question?', 'a', 'Yes.')),
      'ticket_pro', jsonb_build_object('model', 'hybrid', 'buffer_pct', 7, 'sales', jsonb_build_object('waiting_list', true),
                                       'access', jsonb_build_object('comps', 4084, 'fee_buyer', 5, 'info_text', 'EX4084 bring ID'))),
      public_settings = '{"invite_token": "ex4084forged"}'::jsonb
   where id = neon;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'client write: manager update affected % rows', n; end if;
  t := (select public_settings::text from public.events where id = neon);
  if t ~ 'EX4084 forecast|EX4084 internal|ex4084secret|ex4084forged|EX4084risk|EX4084demo|budget_lines|"comps"|buffer_pct' then raise exception 'projection leaked: %', left(t, 300); end if;
  if t !~ 'EX4084 public question' or t !~ 'EX4084 bring ID' or t !~ '"waiting_list": true' then raise exception 'projection lost public keys: %', left(t, 300); end if;
  insert into _ex values ('client_write', 'trigger re-projected; forged value overwritten');

  -- anon on the view
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select string_agg(column_name, ',' order by ordinal_position) into cols from information_schema.columns where table_schema = 'public' and table_name = 'events_public';
  select count(*) into n from public.events_public;
  select count(*) into n2 from public.events_public where visibility <> 'public' or status not in ('published', 'on_sale', 'live');
  select string_agg(v::text, ' ') into t from public.events_public v;
  ok := false; begin insert into public.events_public(id, name) values (gen_random_uuid(), 'EX4084'); exception when insufficient_privilege then ok := true; end;
  reset role;
  if cols ~ 'budget|revenue|profit|client|lead_id|goal|priorities|guest_count|adults|children|owner_id|management|public_settings' then raise exception 'view exposes private columns: %', cols; end if;
  if n <> (select count(*) from public.events where visibility = 'public' and status in ('published', 'on_sale', 'live')) or n2 <> 0 then raise exception 'view rows wrong (% / %)', n, n2; end if;
  if t ~ 'EX4084 forecast|EX4084 internal|ex4084|EX4084risk|EX4084demo|"budget_lines"|"objectives"|"invite_token"|"admin_restriction"|"promotion_plan"|"readiness"|"getting_there"|"demo_seed"|"comps"' then raise exception 'anon view leaked: %', left(t, 300); end if;
  if t !~ 'EX4084 public question' then raise exception 'anon view lost public faqs'; end if;
  if not ok then raise exception 'anon can write the view'; end if;
  insert into _ex values ('anon_view', 'public cols + public rows only (' || n || '); no private keys; read-only');

  -- outsider: same rows; helper
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n2 from public.events_public;
  if n2 <> n then raise exception 'outsider view rows % <> anon %', n2, n; end if;
  if not public.event_is_public(neon) then raise exception 'event_is_public(neon) false'; end if;
  select id into drf from public.events where status = 'draft' limit 1;
  if public.event_is_public(drf) then raise exception 'event_is_public(draft) true'; end if;
  reset role;
  insert into _ex values ('outsider', 'same view rows; helper ok');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
