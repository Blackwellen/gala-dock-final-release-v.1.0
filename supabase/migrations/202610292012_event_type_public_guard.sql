-- W11 (GD-12): event types whose profile forbids public listing (children's parties) could still be made public by a direct row
-- write — event_transition() checks the profile, but `update events set status = 'published', visibility = 'public'` (allowed by the
-- `event` state machine) bypassed it and anonymous visitors could read the event. Additive guard on the row itself:
--   * visibility is always forced to 'private' for such types (both wizards offered "public");
--   * entering published / on_sale / live, inserting in those states, or retyping a listed event into such a type is refused.
-- Live data: no children's-party event is public today (checked 2026-10-29), so nothing existing is affected.
create or replace function public.trg_event_type_public_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  select coalesce((select p.public_listing_allowed from public.event_type_profiles p where p.event_type = new.event_type),
                  (select p.public_listing_allowed from public.event_type_profiles p where p.event_type = 'custom'), true) into allowed;
  if allowed then return new; end if;
  if new.status in ('published', 'on_sale', 'live')
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.event_type is distinct from old.event_type) then
    raise exception 'public_listing_not_allowed: this event type is never listed publicly — share a private guest link instead' using errcode = '22023';
  end if;
  new.visibility := 'private';
  return new;
end $$;
revoke all on function public.trg_event_type_public_guard() from public, anon, authenticated;

drop trigger if exists events_type_public_guard on public.events;
create trigger events_type_public_guard before insert or update of visibility, status, event_type on public.events
  for each row execute function public.trg_event_type_public_guard();
