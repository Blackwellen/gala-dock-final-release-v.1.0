-- Public free/busy calendar (lane D, 2026-10-29): one anon-callable read for venue and service public pages.
-- public_listing_availability(listing, from, to, space?) → { from, to, timezone, days: [{ date, status }], spaces: [{ id, name }] } or null.
--   status per Europe/London calendar day: free | limited | booked | closed. Nothing else leaves the function: no client names, prices,
--   event names, booking ids, times of other bookings or hold reasons.
-- Visibility: published, unpaused listings whose provider opted in (listings.details.public_availability = true). Default OFF: free/busy
--   reveals commercial patterns (when a venue is busy, maintenance windows, how full a supplier's diary is) that no provider agreed to
--   publish when the listing was created; dates are still confirmed on request either way. Anything else returns null.
-- Range: clamped to today .. today + 18 months, at most 120 days per call (past dates are never returned).
-- Sources of truth (same as listing_availability / listing_window_availability):
--   hard  provider_jobs confirmed | active (primary), availability_blocks blocked | maintenance | closed (listing, space or workspace-wide),
--         conditional_holds held + hard (unexpired); space_links (exclusive / linked) propagate a space's hard time to its partner.
--   soft  provider_jobs held, conditional_holds held + soft, build_items held (unexpired, event dates); at a multi-space venue a
--         listing-level job without a space is soft (it may not take every room), as in listing_availability.
--   hours venues: details.hours { mon: [open, close] }; services: details.service.availability.week (null = closed that weekday).
-- Day rules, per unit (each published space at a venue, else the listing itself):
--   full    hard time covers >= min(6 h, that day's opening window) — or, for a service, confirmed jobs that day >= details.service.capacity.per_day
--   partial any hard time that day
--   closed  opening hours exist and that weekday has none
--   booked  every unit full; limited = some unit partial/full or any soft hold; free otherwise.
begin;

create index if not exists build_items_listing_held_idx on public.build_items (listing_id) where status = 'held';

create or replace function public.public_listing_availability(p_listing uuid, p_from date, p_to date, p_space uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.listings;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_from date; v_to date; v_lo timestamptz; v_hi timestamptz;
  v_units uuid[]; v_multi boolean := false; v_service boolean; v_cap int := 1;
  v_hours jsonb; v_days jsonb; v_spaces jsonb := '[]'::jsonb;
begin
  if p_listing is null or p_from is null or p_to is null then return null; end if;
  select * into l from public.listings x where x.id = p_listing and x.published and x.paused_at is null;
  if not found or (l.details -> 'public_availability') is distinct from 'true'::jsonb then return null; end if;

  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_from + 119, v_today + 548);
  v_service := l.kind <> 'venue';

  if p_space is not null then
    if v_service or not exists (select 1 from public.spaces s where s.id = p_space and s.venue_id = l.id and s.status = 'published') then return null; end if;
    v_units := array[p_space];
  elsif not v_service then
    select array_agg(s.id order by s.name), coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      into v_units, v_spaces from public.spaces s where s.venue_id = l.id and s.status = 'published';
  end if;
  v_multi := coalesce(array_length(v_units, 1), 0) > 0;

  v_hours := case when v_service then l.details -> 'service' -> 'availability' -> 'week' else l.details -> 'hours' end;
  if jsonb_typeof(v_hours) is distinct from 'object' or not exists (select 1 from jsonb_each(v_hours) h where jsonb_typeof(h.value) = 'array') then v_hours := null; end if;
  if v_service and (l.details -> 'service' -> 'capacity' ->> 'per_day') ~ '^\d{1,3}$' then v_cap := greatest(1, (l.details -> 'service' -> 'capacity' ->> 'per_day')::int); end if;

  if v_to < v_from then
    return jsonb_build_object('from', v_from, 'to', v_from, 'timezone', 'Europe/London', 'days', '[]'::jsonb, 'spaces', v_spaces);
  end if;
  v_lo := v_from::timestamp at time zone 'Europe/London';
  v_hi := (v_to + 1)::timestamp at time zone 'Europe/London';

  with days as (
    select g::date as day, tstzrange(g::date::timestamp at time zone 'Europe/London', (g::date + 1)::timestamp at time zone 'Europe/London') as rng,
           v_hours -> lower(to_char(g::date, 'dy')) as h
      from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g),
  dd as (
    select d.day, d.rng,
           v_hours is not null and jsonb_typeof(d.h) is distinct from 'array' as closed,
           case when jsonb_typeof(d.h) = 'array' and (d.h ->> 0) ~ '^\d{1,2}:\d{2}$' and (d.h ->> 1) ~ '^\d{1,2}:\d{2}$'
                then least(interval '6 hours', greatest(interval '1 hour',
                       ((d.h ->> 1)::time - (d.h ->> 0)::time) + case when (d.h ->> 1)::time <= (d.h ->> 0)::time then interval '24 hours' else interval '0' end))
                else interval '6 hours' end as threshold
      from days d),
  units as (select u from unnest(case when v_multi then v_units else array[null::uuid] end) u),
  links as (
    select k.space_a as a, k.space_b as b from public.space_links k where k.workspace_id = l.workspace_id
    union select k.space_b, k.space_a from public.space_links k where k.workspace_id = l.workspace_id),
  raw_hard as (
    select j.space_id as sid, tstzrange(j.starts_at, j.ends_at) as r, true as is_job from public.provider_jobs j
     where j.workspace_id = l.workspace_id and j.listing_id = l.id and j.role = 'primary' and j.status in ('confirmed', 'active')
       and j.starts_at < v_hi and j.ends_at > v_lo
    union all
    select a.space_id, tstzrange(a.starts_at, a.ends_at), false from public.availability_blocks a
     where a.workspace_id = l.workspace_id and a.kind in ('blocked', 'maintenance', 'closed') and a.crew_id is null
       and (a.listing_id = l.id or (v_multi and a.space_id = any(v_units)) or (a.listing_id is null and a.space_id is null))
       and a.starts_at < v_hi and a.ends_at > v_lo
    union all
    select h.space_id, tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)), false from public.conditional_holds h
     where h.workspace_id = l.workspace_id and h.listing_id = l.id and h.status = 'held' and h.blocking_level = 'hard'
       and (h.expires_at is null or h.expires_at > now()) and coalesce(h.window_start, h.starts_at) is not null
       and coalesce(h.window_start, h.starts_at) < v_hi and coalesce(h.window_end, h.ends_at) > v_lo),
  hard as (
    select sid, r, is_job from raw_hard where not isempty(r)
    union all select k.b, h.r, h.is_job from raw_hard h join links k on k.a = h.sid where not isempty(h.r)),
  soft as (
    select j.space_id as sid, tstzrange(j.starts_at, j.ends_at) as r from public.provider_jobs j
     where j.workspace_id = l.workspace_id and j.listing_id = l.id and j.status = 'held' and j.starts_at < v_hi and j.ends_at > v_lo
    union all
    select h.space_id, tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)) from public.conditional_holds h
     where h.workspace_id = l.workspace_id and h.listing_id = l.id and h.status = 'held' and h.blocking_level = 'soft'
       and (h.expires_at is null or h.expires_at > now()) and coalesce(h.window_start, h.starts_at) is not null
       and coalesce(h.window_start, h.starts_at) < v_hi and coalesce(h.window_end, h.ends_at) > v_lo
    union all
    select b.space_id, tstzrange(e.starts_at, coalesce(e.ends_at, e.starts_at + interval '6 hours')) from public.build_items b join public.events e on e.id = b.event_id
     where b.listing_id = l.id and b.status = 'held' and (b.hold_expires_at is null or b.hold_expires_at > now())
       and e.starts_at is not null and e.starts_at < v_hi and coalesce(e.ends_at, e.starts_at + interval '6 hours') > v_lo
    union all
    select null::uuid, r from raw_hard where v_multi and is_job and sid is null),
  ud as (
    select d.day, un.u,
           (select coalesce(sum(upper(m) - lower(m)), interval '0')
              from unnest((select range_agg(h.r * d.rng) from hard h
                            where h.r && d.rng and (not v_multi or h.sid = un.u or (h.sid is null and not h.is_job)))) m) as busy,
           (select count(*) from hard h where h.is_job and h.r && d.rng and (not v_multi or h.sid = un.u)) as jobs
      from dd d cross join units un),
  st as (
    select d.day, d.closed,
           bool_and(x.busy >= d.threshold or (v_service and x.jobs >= v_cap)) as all_full,
           bool_or(x.busy > interval '0' or x.jobs > 0) as any_hard,
           exists (select 1 from soft s where s.r && d.rng and not isempty(s.r)
                    and (not v_multi or s.sid is null or s.sid = any(v_units))) as any_soft
      from dd d join ud x on x.day = d.day group by d.day, d.closed, d.rng)
  select coalesce(jsonb_agg(jsonb_build_object('date', st.day, 'status',
           case when st.closed then 'closed' when st.all_full then 'booked' when st.any_hard or st.any_soft then 'limited' else 'free' end) order by st.day), '[]'::jsonb)
    into v_days from st;

  return jsonb_build_object('from', v_from, 'to', v_to, 'timezone', 'Europe/London', 'days', v_days, 'spaces', v_spaces);
end $$;

revoke all on function public.public_listing_availability(uuid, date, date, uuid) from public;
grant execute on function public.public_listing_availability(uuid, date, date, uuid) to anon, authenticated;
comment on function public.public_listing_availability(uuid, date, date, uuid) is 'Public free/busy calendar (opted-in published listings only, else null): per-day free | limited | booked | closed for at most 120 days from today, plus published space ids/names. No names, prices, events, booking ids, times or hold reasons.';

commit;
