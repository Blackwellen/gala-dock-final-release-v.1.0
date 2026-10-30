-- Lane D4 / B2 (W03 organiser backlog gaps). Additive only.
--   1. Door scanner for outside door staff (/door/[eventId], login-based). Zone-limited door staff (event_scanners with zones)
--      could scan only with a zone picked, and the attendee search / offline list required whole-event scan permission, so they
--      couldn't use either. can_scan_event_any(event) = may scan the whole event OR at least one zone of it; scan_lookup and
--      create_scan_snapshot now accept that (admission data only — the snapshot never carried emails; lookup masks emails for
--      anyone who isn't an event editor and, for them, matches an email only exactly instead of by substring). Every admission
--      still goes through scan_admission with the zone, unchanged.
--   2. Launch & waiting-room editor command: set_event_launch(event, launch) writes events.settings.launch
--      {at, presale_at, waiting_room {enabled, rate_per_minute, admit_minutes}} — the shape event_launch_state / queue_status /
--      queue_join / queue_admit_check already read (202610270013, 202610294017). Owner/manager only (plus events.write), validated,
--      audited. Times are stored as ISO strings so every existing ::timestamptz cast keeps working.
-- Grants: authenticated + service_role only (nothing to anon).

-- ═══ 1. Door scanning for zone-limited staff ═══
create or replace function public.can_scan_event_any(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_scan_event(p_event, null)
    or exists (select 1 from public.event_scanners s where s.event_id = p_event and s.user_id = (select auth.uid()) and s.revoked_at is null
               and (s.expires_at is null or s.expires_at > now())
               and exists (select 1 from public.access_zones z where z.event_id = p_event and z.id = any(s.zones)));
$$;

create or replace function public.scan_lookup(p_event uuid, p_query text) returns table(ticket_id uuid, code text, status text, attendee text, email text, tier text, seat text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with who as (select public.can_access_event(p_event) editor)
  select t.id, t.code, t.status, t.attendee_name,
         case when who.editor then t.attendee_email else regexp_replace(t.attendee_email, '^(.).*(@.*)$', '\1***\2') end,
         tr.name, t.seat, t.checked_in_at
  from who, public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
  where t.event_id = p_event and public.can_scan_event_any(p_event) and length(trim(coalesce(p_query, ''))) >= 2
    and (t.code ilike '%' || p_query || '%' or t.attendee_name ilike '%' || p_query || '%'
         or (case when who.editor then t.attendee_email ilike '%' || p_query || '%' else lower(t.attendee_email) = lower(trim(p_query)) end)
         or t.seat ilike '%' || p_query || '%' or tr.name ilike '%' || p_query || '%')
  order by t.attendee_name limit 25;
$$;

-- Same body as 202610294012 except the permission check (any zone of the event is enough for the offline allow-list).
create or replace function public.create_scan_snapshot(p_event uuid, p_device text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); sid uuid; rows_ jsonb; passes jsonb; zones jsonb; exp timestamptz := now() + interval '24 hours';
begin
  if uid is null or not public.can_scan_event_any(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', t.id, 'code', t.code, 'status', t.status, 'attendee', t.attendee_name, 'tier', tr.name, 'tier_id', t.tier_id,
           'seat', t.seat, 'checked_in_at', t.checked_in_at, 'v', t.credential_version, 'valid_from', tr.valid_from, 'valid_to', tr.valid_to) order by t.code), '[]')
    into rows_ from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
   where t.event_id = p_event and t.status in ('valid','used','resale_listed','refunded','transferred','resold','cancelled');
  select coalesce(jsonb_agg(jsonb_build_object('pass_id', p.id, 'code', p.code, 'status', p.status, 'holder', p.holder_name, 'type', p.pass_type, 'zones', p.zones,
           'valid_from', p.valid_from, 'valid_to', p.valid_to) order by p.code), '[]') into passes from public.access_passes p where p.event_id = p_event;
  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'kind', z.kind, 'opens_at', z.opens_at, 'closes_at', z.closes_at, 'reentry', z.reentry, 'max_entries', z.max_entries,
           'rules', (select coalesce(jsonb_agg(jsonb_build_object('tier_id', r.tier_id, 'pass_type', r.pass_type, 'valid_from', r.valid_from, 'valid_to', r.valid_to)), '[]') from public.access_rules r where r.zone_id = z.id))
           order by z.sort, z.name), '[]') into zones from public.access_zones z where z.event_id = p_event and z.status = 'active';
  insert into public.scan_snapshots(event_id, created_by, device, row_count, digest, expires_at)
    values (p_event, uid, left(coalesce(p_device, ''), 60), jsonb_array_length(rows_) + jsonb_array_length(passes), md5(rows_::text || passes::text || zones::text), exp)
    returning id into sid;
  return jsonb_build_object('snapshot_id', sid, 'event_id', p_event, 'issued_at', now(), 'expires_at', exp, 'tickets', rows_, 'passes', passes, 'zones', zones,
    'reentry', coalesce((select (settings->>'reentry')::boolean from public.events where id = p_event), false));
end $$;

-- ═══ 2. Launch & waiting-room command ═══
-- p_launch: {"at": iso|null, "presale_at": iso|null, "waiting_room": {"enabled": bool, "rate_per_minute": 1..10000, "admit_minutes": 2..60}}
-- Rules: presale needs a public launch and must open before it; neither may be after the event starts; the waiting room needs a
-- launch time (queue admission is counted from it); once a launch with a waiting room has passed and people are queued, the
-- launch time can't move (it would reshuffle who is admitted). Clearing everything removes settings.launch.
create or replace function public.set_event_launch(p_event uuid, p_launch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; v_at timestamptz; v_pre timestamptz; wr jsonb; v_on boolean; v_rate int; v_admit int;
  old_launch jsonb; new_launch jsonb; old_at timestamptz;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.workspace_id is not null and not public.has_workspace_role(e.workspace_id, array['owner', 'manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('cancelled', 'completed', 'closed', 'archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_launch is null or jsonb_typeof(p_launch) <> 'object' then raise exception 'invalid_launch' using errcode = '22023'; end if;
  begin
    v_at := nullif(btrim(coalesce(p_launch ->> 'at', '')), '')::timestamptz;
    v_pre := nullif(btrim(coalesce(p_launch ->> 'presale_at', '')), '')::timestamptz;
  exception when others then raise exception 'invalid_time' using errcode = '22023';
  end;
  wr := coalesce(p_launch -> 'waiting_room', '{}');
  if jsonb_typeof(wr) <> 'object' then raise exception 'invalid_waiting_room' using errcode = '22023'; end if;
  begin
    v_on := coalesce((wr ->> 'enabled')::boolean, false);
    v_rate := coalesce((wr ->> 'rate_per_minute')::int, 200);
    v_admit := coalesce((wr ->> 'admit_minutes')::int, 10);
  exception when others then raise exception 'invalid_waiting_room' using errcode = '22023';
  end;
  if v_rate < 1 or v_rate > 10000 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  if v_admit < 2 or v_admit > 60 then raise exception 'invalid_admit_minutes' using errcode = '22023'; end if;
  if v_pre is not null and v_at is null then raise exception 'presale_requires_launch' using errcode = '22023'; end if;
  if v_pre is not null and v_pre >= v_at then raise exception 'presale_after_launch' using errcode = '22023'; end if;
  if e.starts_at is not null and (v_at > e.starts_at or v_pre > e.starts_at) then raise exception 'launch_after_event_start' using errcode = '22023'; end if;
  if v_at is not null and v_at < now() - interval '1 year' then raise exception 'invalid_time' using errcode = '22023'; end if;
  if v_on and v_at is null then raise exception 'waiting_room_requires_launch' using errcode = '22023'; end if;
  old_launch := coalesce(e.settings -> 'launch', '{}');
  begin old_at := nullif(old_launch ->> 'at', '')::timestamptz; exception when others then old_at := null; end;
  if old_at is not null and old_at <= now() and v_at is distinct from old_at and coalesce((old_launch -> 'waiting_room' ->> 'enabled')::boolean, false)
     and exists (select 1 from public.launch_queue q where q.event_id = p_event) then
    raise exception 'launch_in_progress' using errcode = '22023';
  end if;
  new_launch := (old_launch - 'at' - 'presale_at' - 'waiting_room') || jsonb_strip_nulls(jsonb_build_object('at', to_jsonb(v_at), 'presale_at', to_jsonb(v_pre)))
    || case when v_on or wr <> '{}'::jsonb then jsonb_build_object('waiting_room', jsonb_build_object('enabled', v_on, 'rate_per_minute', v_rate, 'admit_minutes', v_admit)) else '{}'::jsonb end;
  update public.events set settings = case when new_launch = '{}'::jsonb then coalesce(settings, '{}') - 'launch' else jsonb_set(coalesce(settings, '{}'), '{launch}', new_launch) end
    where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'tickets.launch_updated', jsonb_build_object('event_id', p_event, 'before', old_launch, 'after', new_launch));
  return jsonb_build_object('ok', true, 'launch', new_launch, 'state', public.event_launch_state(p_event));
end $$;

-- ═══ Grants ═══
revoke all on function public.can_scan_event_any(uuid), public.set_event_launch(uuid, jsonb) from public, anon;
grant execute on function public.can_scan_event_any(uuid), public.set_event_launch(uuid, jsonb) to authenticated, service_role;
-- scan_lookup / create_scan_snapshot keep their existing grants (create or replace preserves them): authenticated + service_role.
revoke all on function public.scan_lookup(uuid, text), public.create_scan_snapshot(uuid, text) from public, anon;
grant execute on function public.scan_lookup(uuid, text), public.create_scan_snapshot(uuid, text) to authenticated, service_role;
