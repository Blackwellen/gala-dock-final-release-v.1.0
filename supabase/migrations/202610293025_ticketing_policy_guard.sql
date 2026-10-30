-- W11 backend (lane C, 2026-10-29) — (a) enforce event_type_profiles.ticketing when a tier goes on sale, for EVERY writer
-- (ticket setup, Ticket Pro activation, release chains, admin resume, service jobs, seeds): a row trigger on ticket_tiers.
-- Also (b)/(d) resolvers: event_guest_privacy and the 2012 public-listing row guard resolve aliases through event_type_profile_of
-- (identical results for today's canonical types; wizard aliases such as party/private_dinner now get their mapped profile).
--
-- Checked only on a NEW entry into on_sale / scheduled (insert, or from draft / hidden / paused). Never re-checked for tiers
-- already on_sale / scheduled / sold_out, and an event that is already selling (another tier on sale or sold out, or any tickets
-- sold) is grandfathered — so release chains (ticket_tier_release_next / open_dependants, which fire inside a purchase) and
-- existing on-sale weddings/galas keep selling. Live data checked 2026-10-29 (see lane C report).
--
-- Rules:  default_on   → always allowed.
--         optional_off → the host has switched ticketing on (settings.ticketed = true, or ticket_model / ticket_pro / ticketing_live
--                        written by the ticket setup flows, or event_set_ticketing below).
--         private_only → the event is private (always, 2012) AND ticketing is switched on or there is an invite path
--                        (an active private guest link or invite token). It is never purchasable publicly (hold_tickets requires public).

create or replace function public.event_ticketing_check(p_event uuid, p_tier uuid default null, p_sold integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; p public.event_type_profiles; opted boolean; grand boolean; invite boolean; s jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('allowed', false, 'error', 'not_found'); end if;
  p := public.event_type_profile_of(e.event_type);
  s := coalesce(e.settings, '{}');
  opted := coalesce(s ->> 'ticketed', '') = 'true' or coalesce(s ->> 'ticketing_live', '') = 'true' or s ? 'ticket_model' or s ? 'ticket_pro';
  grand := coalesce(p_sold, 0) > 0 or exists (select 1 from public.ticket_tiers t where t.event_id = p_event
    and t.id is distinct from p_tier and (t.status in ('on_sale', 'sold_out') or t.sold > 0));
  invite := coalesce(s ->> 'invite_token', '') <> '' or exists (select 1 from public.event_guest_links l where l.event_id = p_event
    and l.revoked_at is null and (l.expires_at is null or l.expires_at > now()));
  if p.ticketing = 'optional_off' and not (opted or grand) then
    return jsonb_build_object('allowed', false, 'mode', p.ticketing, 'opted_in', opted, 'grandfathered', grand, 'error', 'ticketing_not_enabled',
      'reason', 'Ticketing is off by default for this event type. Switch tickets on in ticket setup first.');
  end if;
  if p.ticketing = 'private_only' and (e.visibility <> 'private' or not (opted or grand or invite)) then
    return jsonb_build_object('allowed', false, 'mode', p.ticketing, 'opted_in', opted, 'grandfathered', grand, 'invite_ready', invite, 'error', 'ticketing_private_only',
      'reason', 'Tickets for this event type are invite-only and never sold publicly. Switch tickets on (or create a private guest link) first.');
  end if;
  return jsonb_build_object('allowed', true, 'mode', p.ticketing, 'opted_in', opted, 'grandfathered', grand, 'invite_ready', invite);
end $$;
revoke all on function public.event_ticketing_check(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.event_ticketing_check(uuid, uuid, integer) to service_role;

create or replace function public.trg_ticket_tier_ticketing_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if new.status not in ('on_sale', 'scheduled') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('on_sale', 'scheduled', 'sold_out') then return new; end if;
  r := public.event_ticketing_check(new.event_id, new.id, case when tg_op = 'UPDATE' then greatest(coalesce(old.sold, 0), coalesce(new.sold, 0)) else coalesce(new.sold, 0) end);
  if not coalesce((r ->> 'allowed')::boolean, false) then
    raise exception '%: %', r ->> 'error', r ->> 'reason' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.trg_ticket_tier_ticketing_guard() from public, anon, authenticated;
drop trigger if exists ticket_tier_ticketing_guard on public.ticket_tiers;
create trigger ticket_tier_ticketing_guard before insert or update of status on public.ticket_tiers
  for each row execute function public.trg_ticket_tier_ticketing_guard();

-- UI read (lanes B/D): the event's ticketing mode and whether tiers may open now.
create or replace function public.event_ticketing_policy(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_access_event(p_event) or (select auth.uid()) is null) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.event_ticketing_check(p_event, null, 0);
end $$;
revoke all on function public.event_ticketing_policy(uuid) from public, anon, authenticated;
grant execute on function public.event_ticketing_policy(uuid) to authenticated, service_role;

-- Explicit switch for optional_off / private_only types ("Sell tickets for this wedding?"). Owner of a customer event, or events.write.
create or replace function public.event_set_ticketing(p_event uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; uid uuid := (select auth.uid());
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.workspace_id is null then
    if uid is null or e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not p_on and exists (select 1 from public.ticket_tiers t where t.event_id = p_event and (t.status in ('on_sale', 'scheduled') or t.sold > 0)) then
    return jsonb_build_object('ok', false, 'error', 'tickets_selling', 'message', 'Pause or close the ticket tiers before switching ticketing off.');
  end if;
  update public.events set settings = coalesce(settings, '{}') || jsonb_build_object('ticketed', p_on), updated_at = now() where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.ticketing_set', jsonb_build_object('event_id', e.id, 'on', p_on));
  return jsonb_build_object('ok', true) || public.event_ticketing_check(p_event, null, 0);
end $$;
revoke all on function public.event_set_ticketing(uuid, boolean) from public, anon, authenticated;
grant execute on function public.event_set_ticketing(uuid, boolean) to authenticated, service_role;

-- Resolvers now go through the alias map (same answers for canonical types).
create or replace function public.event_guest_privacy(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select (public.event_type_profile_of(e.event_type)).guest_privacy from public.events e where e.id = p_event), 'standard');
$$;

create or replace function public.trg_event_type_public_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  allowed := coalesce((public.event_type_profile_of(new.event_type)).public_listing_allowed, true);
  if allowed then return new; end if;
  if new.status in ('published', 'on_sale', 'live')
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.event_type is distinct from old.event_type) then
    raise exception 'public_listing_not_allowed: this event type is never listed publicly — share a private guest link instead' using errcode = '22023';
  end if;
  new.visibility := 'private';
  return new;
end $$;
revoke all on function public.trg_event_type_public_guard() from public, anon, authenticated;
