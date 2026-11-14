-- Q57 trust add-on exercise: build_add_package refuses a booking-blocked provider (and still works without the block);
-- confirming a line for a blocked provider without a payment is refused. Ends with EXERCISE_OK (rolled back).
do $$
declare k public.packages; ev public.events; owner uuid; ws uuid; ok boolean; nid uuid; b public.build_items; rc text;
begin
  select p.* into k from public.packages p join public.listings l on l.id = p.listing_id
   where p.status = 'published' and l.published and l.paused_at is null and p.min_guests is null and p.max_guests is null limit 1;
  if k.id is null then raise exception 'no published package to exercise'; end if;
  select l.workspace_id into ws from public.listings l where l.id = k.listing_id;
  select e.* into ev from public.events e where e.management = 'consumer' and e.owner_id is not null and e.status in ('draft', 'planning', 'ready')
    and not exists (select 1 from public.build_items bi where bi.event_id = e.id and bi.listing_id = k.listing_id) limit 1;
  if ev.id is null then raise exception 'no consumer event to exercise'; end if;
  select code into rc from public.moderation_reason_codes limit 1;
  insert into public.enforcement_actions(workspace_id, subject_type, subject_id, action, reason_code, note) values (ws, 'workspace', ws, 'booking_block', rc, 'Q57 exercise block');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ev.owner_id, 'role', 'authenticated')::text, true); set local role authenticated;
  begin perform public.build_add_package(ev.id, k.id, 'primary'); ok := false; exception when others then ok := sqlerrm = 'provider_unavailable'; end;
  if not ok then raise exception 'blocked provider package was added'; end if;
  reset role;
  update public.enforcement_actions set status = 'lifted', lifted_at = now() where note = 'Q57 exercise block';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ev.owner_id, 'role', 'authenticated')::text, true); set local role authenticated;
  nid := public.build_add_package(ev.id, k.id, 'primary');
  if nid is null then raise exception 'unblocked provider package not added'; end if;
  reset role;

  -- job creation: a confirmation without payment for a blocked provider is refused.
  insert into public.enforcement_actions(workspace_id, subject_type, subject_id, action, reason_code, note) values (ws, 'workspace', ws, 'booking_block', rc, 'Q57 exercise block 2');
  select * into b from public.build_items where id = nid;
  begin
    alter table public.build_items disable trigger user;   -- state machine aside: exercise the job trigger directly
    alter table public.build_items enable trigger build_items_create_job;
    update public.build_items set status = 'confirmed' where id = nid; ok := false;
  exception when others then ok := sqlerrm = 'provider_unavailable'; end;
  alter table public.build_items enable trigger user;
  if not ok then raise exception 'job created for a blocked provider'; end if;
  if exists(select 1 from public.provider_jobs where build_item_id = nid) then raise exception 'job row exists'; end if;

  if not exists(select 1 from pg_constraint where conname = 'booking_conflicts_kind_check' and pg_get_constraintdef(oid) like '%provider_unavailable%') then raise exception 'kind check not widened'; end if;
  raise exception 'EXERCISE_OK Q57 trust booking block';
end $$;
