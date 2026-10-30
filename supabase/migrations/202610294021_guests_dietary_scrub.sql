-- Q32 / Q18 finding (lane D, 2026-10-29): legacy guests.dietary was readable by every workspace member through the legacy
-- `guests_rw` policy (can_access_event), although dietary needs are health-related data meant for the event owner and
-- workspace owners/managers only (guest_care, Q18).
--
-- Choice: scrub, not revoke. A column-level `revoke select (dietary)` would make every deployed query that names the column
-- (customer guests page, organizer event data, CSV export rows) fail with "permission denied" for the whole request, and
-- RLS can't mask a column per role. Instead the column stops holding data:
--   • writes keep working: the existing mirror (trg_guests_dietary_mirror) copies any value into guest_care, then
--     trg_guests_dietary_scrub empties the legacy column in the same transaction;
--   • existing values are copied to guest_care first (no data loss; the 10 live values were already mirrored), then emptied;
--   • readers move to guest_care (customer guests page, organizer event data — same release). Until that code deploys, the
--     deployed pages show the dietary column blank; nothing errors.
-- Rollback: data is intact in guest_care; dropping the scrub trigger restores the old write behaviour.

insert into public.guest_care(guest_id, event_id, dietary)
  select g.id, g.event_id, left(g.dietary, 300) from public.guests g where coalesce(g.dietary, '') <> ''
  on conflict (guest_id) do update set dietary = coalesce(nullif(public.guest_care.dietary, ''), excluded.dietary);

create or replace function public.guests_dietary_scrub() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.guests set dietary = '' where id = new.id and dietary <> '';
  return null;
end $$;
-- Fires after trg_guests_dietary_mirror (trigger names sort: ..._mirror < ..._scrub), so guest_care already has the value.
drop trigger if exists trg_guests_dietary_scrub on public.guests;
create trigger trg_guests_dietary_scrub after insert or update of dietary on public.guests for each row
  when (coalesce(new.dietary, '') <> '') execute function public.guests_dietary_scrub();

update public.guests set dietary = '' where dietary <> '';

revoke all on function public.guests_dietary_scrub() from public, anon, authenticated;
