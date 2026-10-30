-- Dry-run exercise for 202610294085 (STAGED — rolled back by migrate.mjs; apply only after the production deploy).
--   anon:     base table → public columns only (settings / budget_total / client_name / goal / owner_id → 42501); events_public works
--   outsider: no public rows through the base table; events_public gives them; no private column reachable
--   member:   Neon base row with every column, as today; client-role settings write still re-projects public_settings
--   ticket holder (non-member) of a public event: base row with every column, as today (events_ticket_holder_read)
--   public data unchanged for anon AND outsider vs the owner-level baseline (RLS bypassed): ticket_tiers, programme_items, event_days,
--     event_venues, event_seats of Neon; directory_events, directory_related, event_share_card, series_page, landing_page, previous_media;
--     and, for anon (the sitemap's only caller), the event_distribution ⋈ events(id, slug) embed
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

create or replace function pg_temp._pub(p_neon uuid, p_series text, p_landing text) returns text language sql as $$
  select concat_ws(' | ',
    (select count(*) from public.ticket_tiers where event_id = p_neon), (select count(*) from public.programme_items where event_id = p_neon and kind = 'programme'),
    (select count(*) from public.event_days where event_id = p_neon), (select count(*) from public.event_venues where event_id = p_neon),
    (select count(*) from public.event_seats where event_id = p_neon),
    md5(public.directory_events('all', null, null, null, 100, 0)::text), md5(coalesce(public.directory_related(p_neon, 8)::text, '')),
    md5(coalesce(public.event_share_card(p_neon)::text, '')), md5(coalesce(public.series_page(p_series)::text, '')),
    md5(coalesce(public.landing_page(p_landing)::text, '')), md5(coalesce(public.previous_media(p_neon, 24)::text, '')))
$$;
grant execute on function pg_temp._pub(uuid, text, text) to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; ws uuid; mgr uuid; outsider uuid; holder uuid; hev uuid;
  base text; a text; o text; n int; ok boolean; ser text; land text; t text;
begin
  select workspace_id into ws from public.events where id = neon;
  select m.user_id into mgr from public.workspace_members m where m.workspace_id = ws and m.role in ('owner', 'manager') order by m.role desc limit 1;
  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id)
    and not exists (select 1 from public.tickets x where x.holder_id = u.id) order by created_at limit 1;
  select x.holder_id, x.event_id into holder, hev from public.tickets x join public.events e on e.id = x.event_id
   where e.visibility = 'public' and e.status in ('published', 'on_sale', 'live') and x.holder_id is not null
     and not exists (select 1 from public.workspace_members m where m.user_id = x.holder_id and m.workspace_id = e.workspace_id) limit 1;
  select s.slug into ser from public.event_series s where s.visibility = 'public' and s.status = 'active' and s.slug is not null limit 1;
  select l.slug into land from public.promo_landing_pages l where l.status = 'published' limit 1;
  if mgr is null or outsider is null or holder is null then raise exception 'exercise: need manager / outsider / non-member ticket holder'; end if;

  base := pg_temp._pub(neon, ser, land);
  select count(*) into n from public.event_distribution d join public.events e on e.id = d.event_id where d.status = 'listed';   -- owner level: RLS bypassed = what anon/outsiders saw before 4085

  -- anon
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  a := pg_temp._pub(neon, ser, land);
  if (select count(*) from public.event_distribution d join public.events e on e.id = d.event_id where d.status = 'listed') <> n then raise exception 'anon: sitemap embed changed'; end if;
  foreach t in array array['settings', 'budget_total', 'client_name', 'goal', 'owner_id', 'priorities', 'revenue_goal', 'target_profit', 'guest_count', 'lead_id'] loop
    ok := false;
    begin execute format('select %I from public.events where id = %L', t, neon); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'anon: base column % readable', t; end if;
  end loop;
  select count(*) into n from public.events where id = neon;   -- public column only
  if n <> 1 then raise exception 'anon: public row not readable by id'; end if;
  select count(*) into n from public.events_public where id = neon and settings ? 'page_blocks' is not null;
  if n <> 1 then raise exception 'anon: events_public row missing'; end if;
  reset role;
  if a is distinct from base then raise exception 'anon public data changed: % vs %', a, base; end if;
  insert into _ex values ('anon', 'private base columns 42501; public data identical');

  -- outsider
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := pg_temp._pub(neon, ser, land);
  select count(*) into n from public.events where id = neon;
  if n <> 0 then raise exception 'outsider: base row still visible'; end if;
  select count(*) into n from public.events where visibility = 'public' and budget_total is not null;
  if n <> 0 then raise exception 'outsider: % public base rows with budget', n; end if;
  select count(*) into n from public.events_public where id = neon;
  if n <> 1 then raise exception 'outsider: events_public missing Neon'; end if;
  reset role;
  if o is distinct from base then raise exception 'outsider public data changed: % vs %', o, base; end if;
  insert into _ex values ('outsider', 'no base rows; view ok; public data identical');

  -- member: everything, and a client-role settings write re-projects
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id = neon and budget_total is not distinct from budget_total and settings is not null;
  if n <> 1 then raise exception 'member: base row lost'; end if;
  update public.events set settings = settings || '{"faqs": [{"q": "EX4085?", "a": "Yes"}], "objectives": ["EX4085 private"]}'::jsonb where id = neon;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'member: settings write refused'; end if;
  t := (select public_settings::text from public.events where id = neon);
  if t !~ 'EX4085\?' or t ~ 'EX4085 private' then raise exception 'member write: projection wrong'; end if;
  insert into _ex values ('member', 'full base row; write re-projects');

  -- ticket holder of a public event, not a member: full base row as today
  perform set_config('request.jwt.claims', json_build_object('sub', holder, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id = hev and settings is not null;
  reset role;
  if n <> 1 then raise exception 'ticket holder lost base access to their event'; end if;
  insert into _ex values ('ticket_holder', 'base row kept');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
