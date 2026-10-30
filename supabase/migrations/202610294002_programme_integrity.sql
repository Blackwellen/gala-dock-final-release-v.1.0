-- Q14 Event Core 2/5 — programme integrity (domains 40 Programme, 41 Schedule; W03 journey 3).
-- Additive columns on programme_items (all nullable / defaulted, so deployed inserts keep working):
--   segment              session / act / performance / speaker / break / changeover / doors / setup / teardown / service / ceremony / other
--   track                parallel track label (conference tracks, festival stage groupings)
--   space_id             room / stage at the event's venue (spaces are owned by the venue workspace — read, never changed here)
--   build_item_id        the supplier booking that delivers this act / session (must be on the same event)
--   expected_attendance  audience size, checked against the room capacity
-- trg_programme_integrity (BEFORE INSERT/UPDATE): one item per area/room at a time for the public programme,
-- room capacity, room-at-this-venue and booking-on-this-event checks, serialised per event with an advisory lock.
-- duplicate_event() copies a source programme verbatim (gd.programme_copy) so a historical copy never fails half way.

alter table public.programme_items add column if not exists segment text;
alter table public.programme_items add column if not exists track text not null default '';
alter table public.programme_items add column if not exists space_id uuid references public.spaces(id) on delete set null;
alter table public.programme_items add column if not exists build_item_id uuid references public.build_items(id) on delete set null;
alter table public.programme_items add column if not exists expected_attendance integer;
do $$ begin
  alter table public.programme_items add constraint programme_items_segment_check check (segment is null or segment in
    ('session','act','performance','speaker','break','changeover','doors','setup','teardown','service','ceremony','other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.programme_items add constraint programme_items_attendance_check check (expected_attendance is null or expected_attendance between 0 and 500000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.programme_items add constraint programme_items_track_len check (length(track) <= 60);
exception when duplicate_object then null; end $$;
create index if not exists programme_items_event_time_idx on public.programme_items(event_id, kind, starts_at);
create index if not exists programme_items_space_idx on public.programme_items(space_id) where space_id is not null;
create index if not exists programme_items_booking_idx on public.programme_items(build_item_id) where build_item_id is not null;

create or replace function public.trg_programme_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.events; sp public.spaces; c record; cap integer; v_area text;
begin
  if coalesce(current_setting('gd.programme_copy', true), '') = new.event_id::text then return new; end if;
  select * into e from public.events where id = new.event_id;

  if new.build_item_id is not null and not exists (select 1 from public.build_items b where b.id = new.build_item_id and b.event_id = new.event_id) then
    raise exception 'booking_not_on_event: link a supplier booking from this event' using errcode = '22023';
  end if;

  if new.space_id is not null then
    select * into sp from public.spaces s where s.id = new.space_id;
    if not found or not (sp.venue_id is not distinct from e.venue_listing_id
        or exists (select 1 from public.build_items b where b.event_id = e.id and b.listing_id = sp.venue_id
                    and b.status not in ('cancelled','declined','unavailable','expired','expired_no_response','cancelled_by_customer','cancelled_by_provider'))) then
      raise exception 'space_not_at_event_venue: choose a room at this event''s venue' using errcode = '22023';
    end if;
    cap := greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0));
    if cap > 0 and coalesce(new.expected_attendance, 0) > cap then
      raise exception 'room_capacity_exceeded: % expected but % holds %', new.expected_attendance, sp.name, cap using errcode = '23514';
    end if;
    if btrim(coalesce(new.area, '')) = '' then new.area := left(sp.name, 60); end if;
  end if;

  v_area := lower(btrim(coalesce(new.area, '')));
  if new.kind = 'programme' and (v_area <> '' or new.space_id is not null) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('programme:' || new.event_id::text, 0));
    select x.title, x.starts_at, x.duration_minutes, x.area into c from public.programme_items x
     where x.event_id = new.event_id and x.kind = 'programme' and x.id is distinct from new.id
       and ((new.space_id is not null and x.space_id = new.space_id) or (v_area <> '' and lower(btrim(x.area)) = v_area))
       and tstzrange(x.starts_at, x.starts_at + make_interval(mins => x.duration_minutes)) && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_minutes))
     order by x.starts_at limit 1;
    if found then
      raise exception 'programme_overlap: "%" already runs in % from % to %', c.title, coalesce(nullif(c.area, ''), 'this room'),
        to_char(c.starts_at at time zone coalesce(e.timezone, 'Europe/London'), 'DD Mon HH24:MI'),
        to_char((c.starts_at + make_interval(mins => c.duration_minutes)) at time zone coalesce(e.timezone, 'Europe/London'), 'HH24:MI')
        using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists programme_items_integrity on public.programme_items;
create trigger programme_items_integrity before insert or update of starts_at, duration_minutes, area, kind, space_id, build_item_id, expected_attendance
  on public.programme_items for each row execute function public.trg_programme_integrity();

-- Rooms the organiser can schedule into: spaces at the event's venue or at a venue booked for the event (read-only projection).
create or replace function public.event_spaces(p_event uuid) returns table(id uuid, name text, venue_id uuid, capacity_standing integer, capacity_seated integer, indoor boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.venue_id, s.capacity_standing, s.capacity_seated, s.indoor
    from public.events e join public.spaces s on s.status is distinct from 'archived'
     and (s.venue_id = e.venue_listing_id or exists (select 1 from public.build_items b where b.event_id = e.id and b.listing_id = s.venue_id
          and b.status not in ('cancelled','declined','unavailable','expired','expired_no_response','cancelled_by_customer','cancelled_by_provider')))
   where e.id = p_event and public.can_access_event(p_event)
   order by s.name;
$$;

revoke all on function public.trg_programme_integrity() from public, anon, authenticated;
revoke all on function public.event_spaces(uuid) from public, anon, authenticated;
grant execute on function public.event_spaces(uuid) to authenticated, service_role;
