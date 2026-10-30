-- Event Map Studio: concurrent drafts must allocate distinct history versions.
-- Preserve existing native publication, seat guards and function privileges.
begin;

create or replace function public.organizer_save_event_plan(p_event uuid, p_structure jsonb, p_overlay jsonb, p_seats jsonb, p_publish boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; locked text;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- Serialize per-event history allocation; keep every successful save in version history.
  perform 1 from public.events where id = p_event for update;
  -- Recheck membership after waiting on another editor's save.
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_overlay) <> 'array' or jsonb_typeof(p_seats) <> 'array' then raise exception 'invalid_elements' using errcode = '22023'; end if;
  if jsonb_array_length(p_seats) > 60000 then raise exception 'too_many_seats' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_seats) s where (s->>'tier') is not null and not exists(select 1 from public.ticket_tiers t where t.id = (s->>'tier')::uuid and t.event_id = p_event)) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.venue_maps where event_id = p_event;
  insert into public.venue_maps(event_id, version, status, structure, overlay, created_by)
    values (p_event, v, case when p_publish then 'published' else 'draft' end, coalesce(p_structure, '{}'), p_overlay, auth.uid());
  if p_publish then
    select string_agg(es.seat_key, ', ') into locked from public.event_seats es
      where es.event_id = p_event and es.status in ('sold','held')
        and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key and (s->>'tier')::uuid is not distinct from es.tier_id);
    if locked is not null then raise exception 'seats_in_use' using errcode = '23P01', detail = left(locked, 200); end if;
    delete from public.event_seats es where es.event_id = p_event and es.status in ('available','blocked')
      and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key);
    insert into public.event_seats(event_id, seat_key, label, section, kind, tier_id, accessible, status)
      select p_event, s->>'key', left(coalesce(s->>'label', ''), 120), left(coalesce(s->>'section', ''), 60), coalesce(s->>'kind', 'seat'), (s->>'tier')::uuid,
        coalesce((s->>'accessible')::boolean, false), case when coalesce((s->>'blocked')::boolean, false) then 'blocked' else 'available' end
      from jsonb_array_elements(p_seats) s
    on conflict (event_id, seat_key) do update set label = excluded.label, section = excluded.section, kind = excluded.kind, accessible = excluded.accessible,
      tier_id = case when public.event_seats.status in ('sold','held') then public.event_seats.tier_id else excluded.tier_id end,
      status = case when public.event_seats.status in ('sold','held') then public.event_seats.status else excluded.status end, updated_at = now();
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), (select workspace_id from public.events where id = p_event), case when p_publish then 'event_plan.published' else 'event_plan.saved' end,
      jsonb_build_object('event_id', p_event, 'version', v, 'seats', jsonb_array_length(p_seats)));
  return v;
end $$;

commit;
