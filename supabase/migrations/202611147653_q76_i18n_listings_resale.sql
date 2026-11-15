-- Q76 internationalisation phase 2 (lane i18n-phase2), part 3: listings locale, provider calendars, resale policies per
-- jurisdiction. Additive.
--
--   1. provider_save_listing writes listings.country / timezone / currency (gap L08): explicit keys p.country, p.timezone,
--      p.currency are validated (invalid → invalid_country / invalid_timezone / invalid_currency); otherwise the venue form's
--      details.country_code / details.timezone are copied when valid. Only two-decimal transactional currencies are accepted
--      (bookings now charge in the listing's currency, part 1). Body otherwise identical (reviewed replacements).
--   2. Provider calendars off London (gap T11): listing_timezone(listing) (the listing's valid zone, else Europe/London);
--      public_listing_availability and listing_availability_local read days and local times in it. London listings: identical.
--   3. resale_policy_for(event): the event's explicit settings.jurisdiction first (unchanged), then the event COUNTRY when a
--      published policy exists for it, else GB (unchanged default). Seeded published v1 policies for the four jurisdictions
--      whose face-value / consent rule is sourced in src/lib/i18n/countries.ts (IE, BE, IT, FR), each at 100% of face value —
--      the platform cap every event already had, so no price changes. legal_review_status = needs_review and the text is
--      marked "(verify)"; counsel signs them off (D14). Other countries keep the GB default until a sourced rule is added.
-- Rollback: docs/release/i18n/q76-rollback.sql (prior bodies of provider_save_listing, public_listing_availability,
-- listing_availability_local, resale_policy_for); the seeded policies can be retired (status = 'retired') by an admin.

create or replace function public.listing_timezone(p_listing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select l.timezone from public.listings l where l.id = p_listing and public.fmt_safe_tz(l.timezone) = l.timezone), 'Europe/London')
$$;
revoke all on function public.listing_timezone(uuid) from public, anon;
grant execute on function public.listing_timezone(uuid) to authenticated;

create or replace function public.resale_policy_for(p_event uuid)
 RETURNS public.resale_policies
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ev as (select upper(nullif(trim(e.settings->>'jurisdiction'), '')) j, upper(nullif(trim(e.country), '')) c from public.events e where e.id = p_event)
  select p.* from public.resale_policies p
  where p.jurisdiction = coalesce(
          (select ev.j from ev),
          (select ev.c from ev where exists (select 1 from public.resale_policies q where q.jurisdiction = ev.c and q.status = 'published' and q.effective_from <= now())),
          'GB')
    and p.status = 'published' and p.effective_from <= now()
  order by p.version desc limit 1
$function$;

insert into public.resale_policies(jurisdiction, version, status, effective_from, price_cap_pct, cap_basis, listing_cutoff_hours, max_active_listings_per_user, required_disclosures, legal_text, legal_review_status)
values
  ('IE', 1, 'published', now(), 100, 'face_value', 0, null, array['face_value','seat_or_zone','restrictions','ticket_terms'],
   'DRAFT — requires legal review before reliance (verify); this text is not a statement of legal compliance. Ireland, Sale of Tickets Act 2021: tickets for designated events and venues (capacity over 1,000) may not be resold above face value (https://www.irishstatutebook.ie/eli/2021/act/14/enacted/en/html). Resale on Gala Dock is the organiser''s official resale at no more than face value.', 'needs_review'),
  ('BE', 1, 'published', now(), 100, 'face_value', 0, null, array['face_value','seat_or_zone','restrictions','ticket_terms'],
   'DRAFT — requires legal review before reliance (verify); this text is not a statement of legal compliance. Belgium, Law of 30 July 2013 on the sale of event tickets: occasional resale is allowed at no more than the original price (plus documented costs); habitual resale is prohibited (https://economie.fgov.be/). Resale on Gala Dock is the organiser''s official resale at no more than face value.', 'needs_review'),
  ('IT', 1, 'published', now(), 100, 'face_value', 0, null, array['face_value','seat_or_zone','restrictions','ticket_terms'],
   'DRAFT — requires legal review before reliance (verify); this text is not a statement of legal compliance. Italy: secondary ticketing above face value is prohibited and tickets for venues over 5,000 capacity are nominative (https://www.gazzettaufficiale.it/). Resale on Gala Dock is the organiser''s official resale at no more than face value.', 'needs_review'),
  ('FR', 1, 'published', now(), 100, 'face_value', 0, null, array['face_value','seat_or_zone','restrictions','ticket_terms'],
   'DRAFT — requires legal review before reliance (verify); this text is not a statement of legal compliance. France, Law 2012-348: habitual resale without the producer''s or organiser''s authorisation is an offence (https://www.legifrance.gouv.fr/). Resale on Gala Dock is the organiser''s own authorised resale at no more than face value.', 'needs_review')
on conflict (jurisdiction, version) do nothing;

-- ═══ Replaced function bodies (1, 2) ═══
-- provider_save_listing: 2 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.provider_save_listing(p_ws uuid, p_listing uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.listings; lid uuid; k text; ws public.workspaces; d jsonb; cty text; tz text; cur text;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into ws from public.workspaces where id = p_ws;
  if p_listing is not null then
    select * into l from public.listings where id = p_listing and workspace_id = p_ws for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if l.review_status in ('restricted','suspended') then raise exception 'restricted_by_platform' using errcode = '42501'; end if;
    k := l.kind;
  else
    k := p->>'kind';
    if k not in ('venue','service') then raise exception 'invalid_kind' using errcode = '22023'; end if;
    if not (k = any(ws.capabilities)) then raise exception 'capability_disabled' using errcode = '22023'; end if;
  end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 100 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p ? 'booking_mode' and p->>'booking_mode' not in ('instant','request','enquiry') then raise exception 'invalid_booking_mode' using errcode = '22023'; end if;
  if p ? 'response_hours' and (p->>'response_hours')::int not in (2,4,8,12,24) then raise exception 'invalid_response_window' using errcode = '22023'; end if;
  if p ? 'price_from' and (p->>'price_from')::numeric < 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p ? 'capacity_min' and p ? 'capacity_max' and (p->>'capacity_min')::int > (p->>'capacity_max')::int then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  -- Instant booking requires a published price; contradictory commercial settings are refused.
  if coalesce(p->>'booking_mode', l.booking_mode) = 'instant' and coalesce((p->>'price_from')::numeric, l.price_from) is null then raise exception 'instant_requires_price' using errcode = '22023'; end if;
  d := coalesce(l.details, '{}'::jsonb) || coalesce(p->'details', '{}'::jsonb);
  if p_listing is null then
    insert into public.listings(workspace_id, name, kind, description, location, details, category, city, image, gallery, price_from, price_unit, capacity_min, capacity_max,
        response_hours, booking_mode, instant_book, emergency_supply, tags, slug)
      values (p_ws, trim(p->>'name'), k, coalesce(p->>'description', ''), coalesce(p->>'location', ''), d, coalesce(p->>'category', ''), coalesce(p->>'city', ''),
        coalesce(p->>'image', ''), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), '{}'), (p->>'price_from')::numeric,
        coalesce(p->>'price_unit', 'per event'), (p->>'capacity_min')::int, (p->>'capacity_max')::int, coalesce((p->>'response_hours')::int, 8),
        coalesce(p->>'booking_mode', 'request'), coalesce(p->>'booking_mode', 'request') = 'instant', coalesce((p->>'emergency_supply')::boolean, false),
        coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
        lower(regexp_replace(trim(p->>'name'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
      returning id into lid;
  else
    update public.listings set
      name = coalesce(trim(p->>'name'), name), description = coalesce(p->>'description', description), location = coalesce(p->>'location', location),
      category = coalesce(p->>'category', category), city = coalesce(p->>'city', city), image = coalesce(p->>'image', image),
      gallery = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), gallery),
      price_from = case when p ? 'price_from' then (p->>'price_from')::numeric else price_from end, price_unit = coalesce(p->>'price_unit', price_unit),
      capacity_min = case when p ? 'capacity_min' then (p->>'capacity_min')::int else capacity_min end,
      capacity_max = case when p ? 'capacity_max' then (p->>'capacity_max')::int else capacity_max end,
      response_hours = coalesce((p->>'response_hours')::int, response_hours), booking_mode = coalesce(p->>'booking_mode', booking_mode),
      instant_book = coalesce(p->>'booking_mode', booking_mode) = 'instant', emergency_supply = coalesce((p->>'emergency_supply')::boolean, emergency_supply),
      tags = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), tags), details = d, updated_at = now()
    where id = p_listing returning id into lid;
  end if;
  -- Q76 (L08): the listing's own country / timezone / currency. Explicit keys are validated; the venue form's details copy is used when valid.
  cty := upper(nullif(trim(coalesce(p->>'country', d->>'country_code', '')), ''));
  tz := nullif(trim(coalesce(p->>'timezone', d->>'timezone', '')), '');
  cur := upper(nullif(trim(coalesce(p->>'currency', '')), ''));
  if p ? 'country' and cty is not null and not exists (select 1 from public.ref_countries r where r.code = cty and r.active) then raise exception 'invalid_country' using errcode = '22023'; end if;
  if p ? 'timezone' and tz is not null and not public.is_timezone(tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if cur is not null and not exists (select 1 from public.ref_currencies c where c.code = cur and c.active and c.transactional and c.minor_units = 2) then raise exception 'invalid_currency' using errcode = '22023'; end if;
  if cty is not null and not exists (select 1 from public.ref_countries r where r.code = cty) then cty := null; end if;
  if tz is not null and not public.is_timezone(tz) then tz := null; end if;
  update public.listings x set country = coalesce(cty, x.country), timezone = coalesce(tz, x.timezone), currency = coalesce(cur, x.currency)
   where x.id = lid and (x.country is distinct from coalesce(cty, x.country) or x.timezone is distinct from coalesce(tz, x.timezone) or x.currency is distinct from coalesce(cur, x.currency));
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_listing is null then 'listing.created' else 'listing.updated' end, jsonb_build_object('listing_id', lid, 'kind', k));
  return lid;
end $function$;

-- public_listing_availability: 4 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.public_listing_availability(p_listing uuid, p_from date, p_to date, p_space uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.listings;
  v_tz text := 'Europe/London';
  v_today date;
  v_from date; v_to date; v_lo timestamptz; v_hi timestamptz;
  v_units uuid[]; v_all uuid[]; v_multi boolean := false; v_service boolean; v_cap int := 1;
  v_hours jsonb; v_days jsonb; v_spaces jsonb := '[]'::jsonb;
begin
  if p_listing is null or p_from is null or p_to is null then return null; end if;
  select * into l from public.listings x where x.id = p_listing and x.published and x.paused_at is null;
  if not found or (l.details -> 'public_availability') is distinct from 'true'::jsonb then return null; end if;
  -- Q76: the calendar is the listing's own zone (listings.timezone), London for rows that predate it.
  v_tz := public.listing_timezone(l.id);
  v_today := (now() at time zone v_tz)::date;

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
    return jsonb_build_object('from', v_from, 'to', v_from, 'timezone', v_tz, 'days', '[]'::jsonb, 'spaces', v_spaces);
  end if;
  v_lo := v_from::timestamp at time zone v_tz;
  v_hi := (v_to + 1)::timestamp at time zone v_tz;

  with days as (
    select g::date as day, tstzrange(g::date::timestamp at time zone v_tz, (g::date + 1)::timestamp at time zone v_tz) as rng,
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

  return jsonb_build_object('from', v_from, 'to', v_to, 'timezone', v_tz, 'days', v_days, 'spaces', v_spaces);
end $function$;

-- listing_availability_local: 2 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.listing_availability_local(p_listing uuid, p_date date, p_start time without time zone, p_end time without time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare local_start timestamp;local_end timestamp;utc_start timestamptz;utc_end timestamptz;z text := public.listing_timezone(p_listing);
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501';end if;
 if p_date is null or p_start is null or p_end is null then return 'unknown';end if;
 local_start:=p_date+p_start;
 local_end:=(p_date+case when p_end<=p_start then 1 else 0 end)+p_end;
 utc_start:=local_start at time zone z;utc_end:=local_end at time zone z;
 if utc_start at time zone z <> local_start or utc_end at time zone z <> local_end then
  raise exception 'invalid_local_time' using errcode='22023';
 end if;
 return public.listing_availability(p_listing,utc_start,utc_end);
end $function$;

