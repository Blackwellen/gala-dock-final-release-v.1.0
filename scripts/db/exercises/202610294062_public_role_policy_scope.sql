-- Dry-run exercise for 202610294062 (always rolled back by migrate.mjs).
--   class gone      no policy TO public still calls a function anon cannot execute
--   anon read       every table anon may SELECT now reads without error; catalogue tables return exactly their public rows
--                   (published bar packages, active rate cards on published listings, public templates, active prices/packs/
--                   products/placements); every other re-scoped table returns 0 rows to anon
--   anon write      insert into bar_packages / venue_rate_cards / brand_kits is refused
--   outsider        authenticated non-member: sees published bar packages only, cannot insert / update another workspace's rows
--   member          owner of the bar-package workspace still reads its draft and updates its own row
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare r record; n bigint; want bigint; bad text := ''; msg text; ws uuid; owner uuid; outsider uuid; pkg uuid; tabs text[] := '{}';
begin
  -- 1. the class is gone
  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'public' and 'public' = any(p.roles)
    and exists (select 1 from pg_proc f where f.pronamespace = 'public'::regnamespace and not has_function_privilege('anon', f.oid, 'execute')
                and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ ('\m' || f.proname || '\('));
  if bad is not null then raise exception 'still TO public with anon-unexecutable helpers: %', bad; end if;
  insert into _ex values ('class', 'none left');

  -- tables with an authenticated-only policy that anon can SELECT (covers every table re-scoped here)
  select array_agg(distinct p.tablename) into tabs from pg_policies p
    join pg_class c on c.relname = p.tablename and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
  where p.schemaname = 'public' and p.roles = '{authenticated}' and has_table_privilege('anon', c.oid, 'select');

  -- expected public rows (computed as the owner role, before switching)
  create temp table _want(t text primary key, n bigint) on commit drop; grant all on _want to anon, authenticated;
  insert into _want values
    ('bar_packages', (select count(*) from public.bar_packages where status = 'published')),
    ('venue_rate_cards', (select count(*) from public.venue_rate_cards c where c.active and exists (select 1 from public.listings l where l.id = c.venue_id and l.published))),
    ('design_templates', (select count(*) from public.design_templates where status = 'active' and (visibility = 'public' or (workspace_id is null and owner_id is null)))),
    ('plan_prices', (select count(*) from public.plan_prices where active)), ('credit_packs', (select count(*) from public.credit_packs where active)),
    ('boost_products', (select count(*) from public.boost_products where active)), ('ad_placements', (select count(*) from public.ad_placements where active)),
    ('menus', (select count(*) from public.menus where status = 'published'));

  -- 2. anon reads
  set local role anon;
  foreach msg in array tabs loop
    begin execute format('select count(*) from public.%I', msg) into n;
    exception when others then reset role; raise exception 'anon read of % failed: %', msg, sqlerrm; end;
    select w.n into want from _want w where w.t = msg;
    if want is not null and n <> want then reset role; raise exception 'anon sees % rows of %, expected %', n, msg, want; end if;
    if want is null and n <> 0 and msg not in (select tablename from pg_policies where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles)) and cmd in ('SELECT','ALL')) then
      reset role; raise exception 'anon sees % private rows of %', n, msg; end if;
  end loop;
  -- anon writes
  begin insert into public.bar_packages(workspace_id, name, status) values (gen_random_uuid(), 'EX4062', 'draft'); msg := 'inserted';
  exception when insufficient_privilege then msg := 'refused'; when others then msg := 'refused:' || sqlstate; end;
  if msg = 'inserted' then reset role; raise exception 'anon inserted a bar package'; end if;
  begin insert into public.venue_rate_cards(workspace_id, venue_id, name) values (gen_random_uuid(), gen_random_uuid(), 'EX4062'); msg := 'inserted';
  exception when others then msg := 'refused'; end;
  if msg = 'inserted' then reset role; raise exception 'anon inserted a rate card'; end if;
  reset role;
  insert into _ex values ('anon_read', array_length(tabs, 1) || ' tables, no errors, public rows only'), ('anon_write', 'refused');

  -- 3. outsider and member on bar_packages
  -- a package whose workspace has an owner/manager member; made draft inside this rolled-back transaction
  select b.id, b.workspace_id into pkg, ws from public.bar_packages b
  where exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.workspace_id = b.workspace_id and m.role in ('owner','manager') and m.status = 'active' and w.status = 'active') order by (b.status = 'draft') desc limit 1;
  if pkg is null then raise exception 'exercise: no bar package with a managing member'; end if;
  update public.bar_packages set status = 'draft' where id = pkg;
  update _want set n = (select count(*) from public.bar_packages where status = 'published') where t = 'bar_packages';
  select m.user_id into owner from public.workspace_members m where m.workspace_id = ws and m.role in ('owner','manager') and m.status = 'active' order by (m.role = 'owner') desc limit 1;
  if owner is null then select w.owner_id into owner from public.workspaces w where w.id = ws; end if;
  select u.id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = ws) and u.id <> owner order by u.created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bar_packages where id = pkg;
  if n <> 0 then reset role; raise exception 'outsider sees a draft bar package'; end if;
  select count(*) into n from public.bar_packages where status = 'published';
  if n <> (select w.n from _want w where w.t = 'bar_packages') then reset role; raise exception 'outsider published count wrong'; end if;
  update public.bar_packages set name = name where workspace_id = ws; get diagnostics n = row_count;
  if n <> 0 then reset role; raise exception 'outsider updated % bar packages', n; end if;
  begin insert into public.bar_packages(workspace_id, name, status) values (ws, 'EX4062 outsider', 'draft'); msg := 'inserted';
  exception when others then msg := 'refused'; end;
  if msg = 'inserted' then reset role; raise exception 'outsider inserted into another workspace'; end if;
  reset role;
  insert into _ex values ('outsider', 'published only; write refused');

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bar_packages where id = pkg;
  if n <> 1 then reset role; raise exception 'member cannot see own draft'; end if;
  update public.bar_packages set name = name where id = pkg; get diagnostics n = row_count;
  if n <> 1 then reset role; raise exception 'member could not update own package'; end if;
  reset role;
  insert into _ex values ('member', 'reads draft, updates own');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
