-- Dry-run exercise for 202610294061 (always rolled back by migrate.mjs).
--   anon reads published menus / sections / items; never a draft menu or its rows
--   anon still cannot write; an outsider (authenticated, not a member) cannot write either
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare pub uuid; drf uuid; n int; msg text; outsider uuid;
begin
  select id into pub from public.menus where status = 'published' and exists (select 1 from public.menu_items i where i.menu_id = menus.id) order by name limit 1;
  if pub is null then raise exception 'exercise: need a published menu with items'; end if;
  insert into public.menus(workspace_id, listing_id, name, kind, pricing, price, status)
    select workspace_id, listing_id, 'EX4061 draft', kind, pricing, price, 'draft' from public.menus where id = pub returning id into drf;
  insert into public.menu_items(menu_id, name, sort) values (drf, 'EX4061 secret item', 1);

  set local role anon;
  select count(*) into n from public.menus where id = pub;
  if n <> 1 then raise exception 'anon: published menu not readable'; end if;
  select count(*) into n from public.menu_items where menu_id = pub;
  if n = 0 then raise exception 'anon: published items not readable'; end if;
  perform count(*) from public.menu_sections where menu_id = pub;
  select count(*) into n from public.menus where id = drf;
  if n <> 0 then raise exception 'anon: draft menu visible'; end if;
  select count(*) into n from public.menu_items where menu_id = drf;
  if n <> 0 then raise exception 'anon: draft items visible'; end if;
  begin update public.menus set name = name where id = pub; get diagnostics n = row_count; msg := 'rows=' || n; exception when insufficient_privilege then msg := 'refused'; end;
  if msg not in ('refused', 'rows=0') then raise exception 'anon wrote a menu: %', msg; end if;
  reset role;
  insert into _ex values ('anon_published', 'readable'), ('anon_draft', 'hidden'), ('anon_write', msg);

  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = (select workspace_id from public.menus where id = pub)) order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.menus where id = drf;
  if n <> 0 then raise exception 'outsider: draft menu visible'; end if;
  begin update public.menus set name = 'EX4061 hijack' where id = pub; get diagnostics n = row_count; msg := 'rows=' || n; exception when insufficient_privilege then msg := 'refused'; end;
  if msg not in ('refused', 'rows=0') then raise exception 'outsider wrote a menu: %', msg; end if;
  reset role;
  insert into _ex values ('outsider_write', msg), ('outsider_draft', 'hidden');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
