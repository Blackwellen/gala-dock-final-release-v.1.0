-- Dry-run exercise for 202610293032 (always rolled back by migrate.mjs). Runs against LIVE events inside the transaction:
-- service-role direct writes refused, helpers + override logged, cron/admin paths unchanged, a CLIENT-ROLE write (events + build_items).
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

-- Census of live events the tightening could affect (only first entry into ready / published / on_sale is ever judged).
do $$
declare r record; b jsonb; would int := 0; ok int := 0; unchecked int := 0;
begin
  for r in select id, status from public.events where status in ('draft', 'planning', 'ready') loop
    begin
      b := public.event_lifecycle_blockers_for(r.id, 'on_sale', r.status);
      if jsonb_array_length(b) > 0 then would := would + 1; else ok := ok + 1; end if;
    exception when others then unchecked := unchecked + 1;
    end;
  end loop;
  insert into _ex values ('live_pre_sale_events', (would + ok + unchecked)::text), ('direct_on_sale_would_be_refused', would::text),
    ('direct_on_sale_clean', ok::text), ('census_unchecked', unchecked::text),
    ('live_selling_untouched', (select count(*) from public.events where status in ('published', 'on_sale', 'live'))::text);
end $$;

-- 1. Service role, no user token.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare ev uuid; own uuid; ws uuid; r public.events; n int; msg text;
begin
  select e.id, e.owner_id, e.workspace_id into ev, own, ws from public.events e join public.workspaces w on w.id = e.workspace_id
    where e.status = 'draft' and w.is_test_fixture and e.starts_at is null limit 1;
  if ev is null then raise exception 'exercise: no draft fixture event without a date'; end if;
  begin
    update public.events set status = 'on_sale' where id = ev;
    raise exception 'X_DIRECT_UPDATE_NOT_REFUSED';
  exception when sqlstate '22023' then msg := sqlerrm;
  end;
  if msg not like 'lifecycle_override_required:%' then raise exception 'unexpected: %', msg; end if;
  insert into _ex values ('direct_update_refused', left(msg, 60));
  begin
    insert into public.events(owner_id, workspace_id, name, status) values (own, ws, 'Q39 exercise direct', 'on_sale');
    raise exception 'X_DIRECT_INSERT_NOT_REFUSED';
  exception when sqlstate '22023' then msg := sqlerrm;
  end;
  if msg not like 'lifecycle_override_required:%' then raise exception 'unexpected insert: %', msg; end if;
  insert into _ex values ('direct_insert_refused', 'yes');
  -- A draft insert (nothing to override) is still allowed.
  insert into public.events(owner_id, workspace_id, name, status) values (own, ws, 'Q39 exercise draft', 'draft');
  -- Helpers: explicit, audited override.
  select * into r from public.service_update_events(array[ev], '{"status":"on_sale"}', 'Q39 dry-run exercise: fixture on sale');
  if r.status <> 'on_sale' then raise exception 'helper update failed'; end if;
  select count(*) into n from public.event_lifecycle_overrides o where o.event_id = ev and o.kind = 'use' and o.source = 'override' and o.txid = txid_current() and o.db_role = 'service_role';
  if n <> 1 then raise exception 'override use not logged with request role (%)', n; end if;
  select count(*) into n from public.audit_events a where a.event = 'event.service_update' and a.metadata ->> 'event_id' = ev::text and a.metadata ->> 'from' = 'draft';
  if n <> 1 then raise exception 'audit row missing'; end if;
  select * into r from public.service_insert_event(jsonb_build_object('owner_id', own, 'workspace_id', ws, 'name', 'Q39 exercise insert', 'status', 'on_sale',
    'tags', '["q39"]'::jsonb, 'settings', '{"x": 1}'::jsonb, 'starts_at', now() - interval '6 hours', 'ends_at', now() - interval '2 hours'), 'Q39 dry-run exercise: fixture insert');
  if r.status <> 'on_sale' or r.tags <> array['q39'] or r.settings ->> 'x' <> '1' or r.visibility is distinct from 'private' then
    raise exception 'helper insert wrong: % % % %', r.status, r.tags, r.settings, r.visibility; end if;
  insert into _ex values ('helper_insert_event', r.id::text);
  -- Admin reinstate shape (suspended -> on_sale) is not a first entry: still allowed directly.
  update public.events set status = 'suspended' where id = r.id;
  update public.events set status = 'on_sale' where id = r.id;
  begin perform public.service_insert_event('{"nope": 1}', 'Q39 dry-run exercise'); raise exception 'X_UNKNOWN_COLUMN';
  exception when sqlstate '42703' then null; end;
  begin perform public.service_update_events(array[ev], '{"id": "00000000-0000-0000-0000-000000000000"}', 'Q39 dry-run exercise'); raise exception 'X_ID';
  exception when sqlstate '22023' then null; end;
  begin perform public.event_lifecycle_override_begin('short'); raise exception 'X_REASON';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

-- 2. Cron path: complete_ended_events completes the ended on-sale event (target 'completed' is never judged by the guard).
do $$
declare xid uuid := (select v::uuid from _ex where k = 'helper_insert_event'); r jsonb;
begin
  r := public.complete_ended_events(interval '0', 5000);
  if (select status from public.events where events.id = xid) <> 'completed' then raise exception 'complete_ended_events did not complete the exercise event'; end if;
  insert into _ex values ('complete_ended_events', (r ->> 'completed'));
end $$;

-- 3. CLIENT-ROLE writes (4031 rule): a customer edits their event, adds/edits/removes a build item, and is still judged by the user guard.
do $$
declare cust uuid; ev uuid;
begin
  select e.owner_id, e.id into cust, ev from public.events e where e.management = 'consumer' and e.workspace_id is null and e.status = 'planning'
    and exists (select 1 from auth.users u where u.id = e.owner_id) order by e.created_at desc limit 1;
  insert into _ex values ('client_user', cust::text), ('client_event', ev::text);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', (select v from _ex where k = 'client_user'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ev uuid := (select v::uuid from _ex where k = 'client_event'); n int; bi uuid; msg text;
begin
  update public.events set name = name where id = ev;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'client event update affected % rows', n; end if;
  insert into public.build_items(event_id, category, title, amount, status, role, sort) values (ev, 'decor', 'Q39 exercise item', 10, 'draft', 'primary', 99) returning id into bi;
  update public.build_items set title = 'Q39 exercise item (edited)' where id = bi;
  get diagnostics n = row_count; if n <> 1 then raise exception 'client build item update affected % rows', n; end if;
  delete from public.build_items where id = bi;
  get diagnostics n = row_count; if n <> 1 then raise exception 'client build item delete affected % rows', n; end if;
  begin
    update public.events set status = 'on_sale' where id = ev;
    msg := 'not refused';
  exception when others then msg := sqlstate || ' ' || left(sqlerrm, 50);
  end;
  if msg = 'not refused' then
    -- Only acceptable when the event genuinely has no blockers.
    if jsonb_array_length(public.event_lifecycle_blockers(ev, 'on_sale')) > 0 then raise exception 'client direct on_sale with blockers was allowed'; end if;
  end if;
  insert into _ex values ('client_writes', 'events update + build_items insert/update/delete ok'), ('client_direct_on_sale', msg);
  begin perform public.service_insert_event('{"name": "x"}', 'Q39 dry-run exercise'); raise exception 'X_CLIENT_HELPER';
  exception when insufficient_privilege then null; end;
  begin perform public.service_update_events(array[ev], '{"status": "on_sale"}', 'Q39 dry-run exercise'); raise exception 'X_CLIENT_HELPER2';
  exception when insufficient_privilege then null; end;
  insert into _ex values ('client_helpers_denied', 'yes');
end $$;
reset role;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
