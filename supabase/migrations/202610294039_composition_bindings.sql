-- Lane D · B1 (D4 backend gaps, 2026-10-29). Additive. One command binds a ticket tier, shift or programme item to an event
-- day (event_day_id), a room (space_id) and venues (ticket_tiers.valid_venue_ids, shifts.event_venue_id), or unbinds it
-- (key present with null / empty array). Nothing new is enforced here that the existing guards don't already enforce:
--   * composition_binding_guard (202610291042): day in this event and the row kept inside it, room at the event's venue(s),
--     room tier quantity <= room capacity, venues belong to this event;
--   * trg_programme_integrity (202610294002): programme room at this event's venue, expected attendance <= room capacity,
--     no two public programme items in one room at the same time.
-- Permissions follow the existing composition commands: tiers need tickets.manage (as set_pass_components), shifts and
-- programme items need events.write (event_dependency_can_write, as set_event_days / set_event_venues). Personal events
-- (no workspace) are the owner's. A tier with sales, holds or pass commitments keeps its bindings (holders' admission
-- would change under them). Day tickets default their validity window to the day (the guard); a window that no longer
-- fits the new day is reset to it, and a window equal to the old day's bounds is cleared on unbind. Audited.

create or replace function public.set_composition_binding(p_kind text, p_id uuid, p_binding jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; t public.ticket_tiers; s public.shifts; pi public.programme_items;
  d public.event_days; od public.event_days; allowed text[]; v_day uuid; v_space uuid; v_venues uuid[]; v_venue uuid;
  vf timestamptz; vt timestamptz; fields text[]; res jsonb;
begin
  if p_kind not in ('ticket_tier','shift','programme_item') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_binding is null or jsonb_typeof(p_binding) <> 'object' then raise exception 'invalid_binding' using errcode = '22023'; end if;
  allowed := case p_kind when 'ticket_tier' then array['event_day_id','space_id','valid_venue_ids'] when 'shift' then array['event_day_id','space_id','event_venue_id'] else array['event_day_id','space_id'] end;
  select array_agg(k order by k) into fields from jsonb_object_keys(p_binding) k;
  if fields is null then raise exception 'invalid_binding' using errcode = '22023'; end if;
  if exists (select 1 from unnest(fields) k where k <> all(allowed)) then raise exception 'invalid_binding' using errcode = '22023'; end if;
  if p_binding ? 'valid_venue_ids' and jsonb_typeof(p_binding->'valid_venue_ids') not in ('array','null') then raise exception 'invalid_binding' using errcode = '22023'; end if;

  if p_kind = 'ticket_tier' then
    select * into t from public.ticket_tiers where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into e from public.events where id = t.event_id;
    if not (case when e.workspace_id is null then e.owner_id = uid else public.has_permission(e.workspace_id, 'tickets.manage') end) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    if t.sold + t.held + coalesce(t.pass_committed, 0) > 0 then raise exception 'tier_has_sales' using errcode = '22023'; end if;
    v_day := case when p_binding ? 'event_day_id' then nullif(p_binding->>'event_day_id', '')::uuid else t.event_day_id end;
    v_space := case when p_binding ? 'space_id' then nullif(p_binding->>'space_id', '')::uuid else t.space_id end;
    if p_binding ? 'valid_venue_ids' then
      select nullif(array_agg(distinct x::uuid), '{}') into v_venues from jsonb_array_elements_text(coalesce(nullif(p_binding->'valid_venue_ids', 'null'::jsonb), '[]'::jsonb)) x;
    else v_venues := t.valid_venue_ids; end if;
    if t.pass_kind is not null and v_day is not null then raise exception 'pass_tier_not_day_bound' using errcode = '22023'; end if;
    vf := t.valid_from; vt := t.valid_to;
    if v_day is distinct from t.event_day_id then
      if t.event_day_id is not null then
        select * into od from public.event_days where id = t.event_day_id;
        if vf is not distinct from od.starts_at then vf := null; end if;
        if vt is not distinct from od.ends_at then vt := null; end if;
      end if;
      if v_day is not null then
        select * into d from public.event_days where id = v_day and event_id = e.id;
        if not found then raise exception 'day_not_in_event' using errcode = '22023'; end if;
        if d.status = 'cancelled' then raise exception 'day_cancelled' using errcode = '22023'; end if;
        if vf is not null and (vf < d.starts_at or vf >= d.ends_at) then vf := null; end if;
        if vt is not null and (vt > d.ends_at or vt <= d.starts_at) then vt := null; end if;
      end if;
    end if;
    update public.ticket_tiers set event_day_id = v_day, space_id = v_space, valid_venue_ids = v_venues, valid_from = vf, valid_to = vt where id = t.id returning * into t;
    res := jsonb_build_object('event_day_id', t.event_day_id, 'space_id', t.space_id, 'valid_venue_ids', to_jsonb(t.valid_venue_ids), 'valid_from', t.valid_from, 'valid_to', t.valid_to);

  elsif p_kind = 'shift' then
    select * into s from public.shifts where id = p_id for update;
    if not found or s.event_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into e from public.events where id = s.event_id;
    if not public.event_dependency_can_write(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    v_day := case when p_binding ? 'event_day_id' then nullif(p_binding->>'event_day_id', '')::uuid else s.event_day_id end;
    v_space := case when p_binding ? 'space_id' then nullif(p_binding->>'space_id', '')::uuid else s.space_id end;
    v_venue := case when p_binding ? 'event_venue_id' then nullif(p_binding->>'event_venue_id', '')::uuid else s.event_venue_id end;
    if v_day is not null and v_day is distinct from s.event_day_id and exists (select 1 from public.event_days x where x.id = v_day and x.event_id = e.id and x.status = 'cancelled') then
      raise exception 'day_cancelled' using errcode = '22023';
    end if;
    update public.shifts set event_day_id = v_day, space_id = v_space, event_venue_id = v_venue where id = s.id returning * into s;
    res := jsonb_build_object('event_day_id', s.event_day_id, 'space_id', s.space_id, 'event_venue_id', s.event_venue_id);

  else
    select * into pi from public.programme_items where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into e from public.events where id = pi.event_id;
    if not public.event_dependency_can_write(pi.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    v_day := case when p_binding ? 'event_day_id' then nullif(p_binding->>'event_day_id', '')::uuid else pi.event_day_id end;
    v_space := case when p_binding ? 'space_id' then nullif(p_binding->>'space_id', '')::uuid else pi.space_id end;
    if v_day is not null and v_day is distinct from pi.event_day_id and exists (select 1 from public.event_days x where x.id = v_day and x.event_id = e.id and x.status = 'cancelled') then
      raise exception 'day_cancelled' using errcode = '22023';
    end if;
    update public.programme_items set event_day_id = v_day, space_id = v_space where id = pi.id returning * into pi;
    res := jsonb_build_object('event_day_id', pi.event_day_id, 'space_id', pi.space_id);
  end if;

  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'event.composition_bound',
    jsonb_build_object('event_id', e.id, 'kind', p_kind, 'id', p_id, 'fields', to_jsonb(fields)) || res);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'id', p_id) || res;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('event.composition_bound', 1, 'event', 'A ticket tier, shift or programme item was bound to (or unbound from) an event day, room or venue (payload: event_id, kind, id, fields and the resulting bindings).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.set_composition_binding(text, uuid, jsonb) from public, anon;
grant execute on function public.set_composition_binding(text, uuid, jsonb) to authenticated, service_role;
