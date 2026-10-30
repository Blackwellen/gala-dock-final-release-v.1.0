-- Dry-run exercise for 202610291052 (always rolled back by migrate.mjs). Runs as the CLIENT ROLE (authenticated) with the live demo
-- platform admin's real session id: aal2 gets data; aal1 and a non-admin are refused; keyset pages (every sort) neither overlap nor
-- skip and cover exactly `filtered` rows; totals equal direct counts; filters (tab, vis, id) agree with the base table.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

do $$
declare adm uuid; sid text; usr uuid; c1 text; c2 text; cu text; j jsonb; cur jsonb; ids uuid[]; seen uuid[]; n int; pages int; srt text; total int; d int;
begin
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where u.email = 'admin.demo@example.com';
  select s.id::text into sid from auth.sessions s where s.user_id = adm order by s.created_at desc limit 1;
  if adm is null or sid is null then raise exception 'exercise: demo admin or live session missing'; end if;
  select owner_id into usr from public.workspaces where kind = 'organizer' and owner_id not in (select user_id from public.platform_admins) limit 1;
  c1 := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', sid)::text;
  c2 := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text;
  cu := json_build_object('sub', usr, 'role', 'authenticated', 'aal', 'aal2')::text;
  select count(*) into total from public.events;

  -- 1. aal1 admin and a non-admin (even on aal2) are refused.
  perform set_config('request.jwt.claims', c1, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.admin_events_page('{}', 'featured', 50, null); raise exception 'X_AAL1'; exception when sqlstate '42501' then null; end;
  reset role;
  perform set_config('request.jwt.claims', cu, true); perform set_config('request.jwt.claim.sub', usr::text, true);
  set local role authenticated;
  begin perform public.admin_events_page('{}', 'featured', 50, null); raise exception 'X_NON_ADMIN'; exception when sqlstate '42501' then null; end;
  reset role;
  insert into _ex values ('refused', 'aal1 admin + non-admin → 42501');

  -- 2. aal2 admin: totals match direct counts.
  perform set_config('request.jwt.claims', c2, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  j := public.admin_events_page('{}', 'featured', 50, null);
  if (j->'totals'->>'all')::int <> total or (j->>'filtered')::int <> total then raise exception 'totals % / filtered % vs events %', j->'totals'->>'all', j->>'filtered', total; end if;
  if (j->'totals'->>'pub')::int <> (select count(*) from public.events where visibility = 'public') then raise exception 'pub total mismatch'; end if;
  if jsonb_array_length(j->'rows') <> least(50, total) then raise exception 'first page size %', jsonb_array_length(j->'rows'); end if;
  insert into _ex values ('aal2_totals', format('all=%s pub=%s tix=%s live=%s flag=%s', j->'totals'->>'all', j->'totals'->>'pub', j->'totals'->>'tix', j->'totals'->>'live', j->'totals'->>'flag'));

  -- 3. Keyset paging: every sort walks all rows exactly once (page size 37 so pages don't align with anything).
  foreach srt in array array['featured', 'newest', 'starts', 'name'] loop
    seen := '{}'; cur := null; pages := 0;
    loop
      j := public.admin_events_page('{}', srt, 37, cur); pages := pages + 1;
      select array_agg((r->>'id')::uuid) into ids from jsonb_array_elements(j->'rows') r;
      if ids && seen then raise exception 'sort % page % overlaps an earlier page', srt, pages; end if;
      seen := seen || coalesce(ids, '{}');
      cur := j->'next';
      exit when cur is null or cur = 'null'::jsonb or pages > 100;
    end loop;
    select count(distinct x) into n from unnest(seen) x;
    if n <> total or cardinality(seen) <> total then raise exception 'sort % covered % (distinct %) of %', srt, cardinality(seen), n, total; end if;
    insert into _ex values ('keyset_' || srt, format('%s rows in %s pages, no overlap/skip', n, pages));
  end loop;

  -- 4. Revenue sort order is monotonic within the featured group; filters agree with the base table.
  j := public.admin_events_page('{}', 'featured', 200, null);
  select count(*) into d from (select (r->>'featured')::int f, (r->>'gross')::numeric g, lag((r->>'featured')::int) over (order by ord) pf, lag((r->>'gross')::numeric) over (order by ord) pg
    from jsonb_array_elements(j->'rows') with ordinality t(r, ord)) z where pf is not null and (f > pf or (f = pf and g > pg));
  if d > 0 then raise exception 'featured/revenue order broken in % places', d; end if;
  j := public.admin_events_page('{"vis":"private"}', 'newest', 200, null);
  if (j->>'filtered')::int <> (select count(*) from public.events where visibility = 'private') then raise exception 'vis filter mismatch'; end if;
  j := public.admin_events_page('{"tab":"public"}', 'newest', 200, null);
  if (j->>'filtered')::int <> (j->'totals'->>'pub')::int then raise exception 'public tab vs total mismatch'; end if;
  j := public.admin_events_page(jsonb_build_object('id', (select id from public.events order by created_at desc limit 1)), 'featured', 50, null);
  if (j->>'filtered')::int <> 1 or j->'rows'->0->'metrics' is null then raise exception 'id filter / metrics missing'; end if;
  reset role;
  insert into _ex values ('order_and_filters', 'featured→revenue monotonic; vis, tab, id agree');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
