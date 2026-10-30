-- Public free/busy calendar, follow-up to 202610294080 (lane D, 2026-10-29). Same signature, same output contract; aligns the
-- space rules with space_conflicts_internal:
--   * related spaces = space_links (linked | exclusive, both directions) + the same spaces.exclusive_group. A hard booking, block or
--     hold on one space is hard time for every related space — also when the calendar is filtered to one space (4080 only looked
--     at blocks on the filtered space itself, so a block on a linked space was missed).
--   * whole-venue exclusive hire (provider_jobs with no space and details.exclusive = true) is hard for every space.
--   * held provider_jobs / soft holds on a related space make the day limited.
--   * opening hours also accept the "HH:MM-HH:MM" / "closed" string form used by space_conflicts_internal.
-- Still returns only { from, to, timezone, days: [{ date, status }], spaces: [{ id, name }] } or null (opted-in published listings only).
begin;

create or replace function public.public_listing_availability(p_listing uuid, p_from date, p_to date, p_space uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.listings;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_from date; v_to date; v_lo timestamptz; v_hi timestamptz;
  v_units uuid[]; v_all uuid[]; v_multi boolean := false; v_service boolean; v_cap int := 1;
  v_hours jsonb; v_days jsonb; v_spaces jsonb := '[]'::jsonb;
begin
  if p_listing is null or p_from is null or p_to is null then return null; end if;
  select * into l from public.listings x where x.id = p_listing and x.published and x.paused_at is null;
  if not found or (l.details -> 'public_availability') is distinct from 'true'::jsonb then return null; end if;

  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_from + 119, v_today + 548);
  v_service := l.kind <> 'venue';

  if not v_service then
    select array_agg(s.id order by s.name), coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      into v_all, v_spaces from public.spaces s where s.venue_id = l.id and s.status = 'published';
  end if;
  if p_space is not null then
    if v_service or not (p_space = any(coalesce(v_all, '{}'))) then return null; end if;
    v_units := array[p_space]; v_spaces := '[]'::jsonb;
  else
    v_units := v_all;
  end if;
  v_multi := coalesce(array_length(v_units, 1), 0) > 0;

  v_hours := case when v_service then l.details -> 'service' -> 'availability' -> 'week' else l.details -> 'hours' end;
  if jsonb_typeof(v_hours) is distinct from 'object'
     or not exists (select 1 from jsonb_each(v_hours) h where jsonb_typeof(h.value) = 'array' or (jsonb_typeof(h.value) = 'string' and h.value #>> '{}' ~ '^\d{1,2}:\d{2}-\d{1,2}:\d{2}$')) then
    v_hours := null;
  end if;
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
  hrs as (   -- normalise [open, close] arrays and "HH:MM-HH:MM" strings to (open, close); anything else is a closed day
    select d.day, d.rng,
           case when jsonb_typeof(d.h) = 'array' then d.h ->> 0 when jsonb_typeof(d.h) = 'string' then split_part(d.h #>> '{}', '-', 1) end as o,
           case when jsonb_typeof(d.h) = 'array' then d.h ->> 1 when jsonb_typeof(d.h) = 'string' then split_part(d.h #>> '{}', '-', 2) end as c
      from days d),
  dd as (
    select x.day, x.rng,
           v_hours is not null and not (coalesce(x.o, '') ~ '^\d{1,2}:\d{2}$' and coalesce(x.c, '') ~ '^\d{1,2}:\d{2}$') as closed,
           case when coalesce(x.o, '') ~ '^\d{1,2}:\d{2}$' and coalesce(x.c, '') ~ '^\d{1,2}:\d{2}$'
                then least(interval '6 hours', greatest(interval '1 hour', (x.c::time - x.o::time) + case when x.c::time <= x.o::time then interval '24 hours' else interval '0' end))
                else interval '6 hours' end as threshold
      from hrs x),
  units as (select u from unnest(case when v_multi then v_units else array[null::uuid] end) u),
  related as (   -- a -> b: hard time on a is hard time on b
    select k.space_a as a, k.space_b as b from public.space_links k where k.workspace_id = l.workspace_id and k.space_a = any(coalesce(v_all, '{}'))
    union select k.space_b, k.space_a from public.space_links k where k.workspace_id = l.workspace_id and k.space_b = any(coalesce(v_all, '{}'))
    union select x.id, y.id from public.spaces x join public.spaces y on y.venue_id = x.venue_id and y.exclusive_group = x.exclusive_group and y.id <> x.id
     where x.venue_id = l.id and x.exclusive_group is not null),
  raw_hard as (   -- sid null + all_units: applies to every unit; sid null + not all_units: a listing-level job (soft at a multi-space venue)
    select j.space_id as sid, tstzrange(j.starts_at, j.ends_at) as r, true as is_job,
           j.space_id is null and coalesce(j.details ->> 'exclusive', '') = 'true' as all_units
      from public.provider_jobs j
     where j.workspace_id = l.workspace_id and j.listing_id = l.id and j.role = 'primary' and j.status in ('confirmed', 'active', 'deposit_paid')
       and j.starts_at < v_hi and j.ends_at > v_lo
    union all
    select a.space_id, tstzrange(a.starts_at, a.ends_at), false, a.space_id is null from public.availability_blocks a
     where a.workspace_id = l.workspace_id and a.kind in ('blocked', 'maintenance', 'closed') and a.crew_id is null
       and (a.listing_id = l.id or a.space_id = any(coalesce(v_all, '{}')) or (a.listing_id is null and a.space_id is null))
       and a.starts_at < v_hi and a.ends_at > v_lo
    union all
    select h.space_id, tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)), false, h.space_id is null from public.conditional_holds h
     where h.workspace_id = l.workspace_id and h.listing_id = l.id and h.status = 'held' and h.blocking_level = 'hard'
       and (h.expires_at is null or h.expires_at > now()) and coalesce(h.window_start, h.starts_at) is not null
       and coalesce(h.window_start, h.starts_at) < v_hi and coalesce(h.window_end, h.ends_at) > v_lo),
  hard as (
    select sid, r, is_job, all_units from raw_hard where not isempty(r)
    union all select k.b, h.r, h.is_job, false from raw_hard h join related k on k.a = h.sid where not isempty(h.r)),
  raw_soft as (
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
    select null::uuid, r from raw_hard where v_multi and is_job and sid is null and not all_units),
  soft as (select sid, r from raw_soft where not isempty(r) union all select k.b, s.r from raw_soft s join related k on k.a = s.sid where not isempty(s.r)),
  ud as (
    select d.day, un.u,
           (select coalesce(sum(upper(m) - lower(m)), interval '0')
              from unnest((select range_agg(h.r * d.rng) from hard h
                            where h.r && d.rng and (not v_multi or h.sid = un.u or (h.sid is null and (h.all_units or not h.is_job))))) m) as busy,
           (select count(*) from hard h where h.is_job and h.r && d.rng and (not v_multi or h.sid = un.u or (h.sid is null and h.all_units))) as jobs
      from dd d cross join units un),
  st as (
    select d.day, d.closed,
           bool_and(x.busy >= d.threshold or (v_service and x.jobs >= v_cap)) as all_full,
           bool_or(x.busy > interval '0' or x.jobs > 0) as any_hard,
           exists (select 1 from soft s where s.r && d.rng and (not v_multi or s.sid is null or s.sid = any(v_units))) as any_soft
      from dd d join ud x on x.day = d.day group by d.day, d.closed, d.rng)
  select coalesce(jsonb_agg(jsonb_build_object('date', st.day, 'status',
           case when st.closed then 'closed' when st.all_full then 'booked' when st.any_hard or st.any_soft then 'limited' else 'free' end) order by st.day), '[]'::jsonb)
    into v_days from st;

  return jsonb_build_object('from', v_from, 'to', v_to, 'timezone', 'Europe/London', 'days', v_days, 'spaces', v_spaces);
end $$;

revoke all on function public.public_listing_availability(uuid, date, date, uuid) from public;
grant execute on function public.public_listing_availability(uuid, date, date, uuid) to anon, authenticated;

commit;
