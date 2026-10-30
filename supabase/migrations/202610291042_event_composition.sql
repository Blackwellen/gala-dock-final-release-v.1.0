-- Q40 Advanced Event Composition, part 1 (lane A, 2026-10-29; domains 247–250 + parent/child). Additive, backward compatible.
-- Everything composes over the canonical events row — no second event model:
--   * event_series (series | recurring | tour | festival | conference) with a recurrence rule; occurrences are ordinary events
--     (events.series_id, series_index, occurrence_key) generated from an anchor event through the Q14 structure engine
--     (event_structure_snapshot → apply_event_structure: programme, tasks, dependencies, draft tiers — never guests, tickets,
--     orders, payments, bookings). Idempotent per (series, occurrence_key). Tour dates = occurrences with their own venue.
--   * per-occurrence overrides (events.series_overrides) and series edits with this / this_and_following / all semantics:
--     following/all never touch past, completed, cancelled or archived occurrences and never overwrite a local override.
--   * shared branding (series.branding → occurrences that have not overridden cover_image); series analytics.
--   * parent/child sub-events (events.parent_event_id + composition_role: stage, track, session, day, sub_event) — same
--     workspace, inside the parent window, max depth 3, no cycles.
--   * multi-venue (event_venues; transfers via Q25 transport_movements), multi-day (event_days; day tiers, programme,
--     shifts and supplier bookings bound to a day and kept inside it), multi-room (tiers/shifts bound to a venue space;
--     room tier quantity ≤ room capacity; Q14 programme room integrity unchanged).
--   * readiness roll-up from children, resource/team view across children (Q17 allocations), public series page.
--   Lifecycle cascade + passes across occurrences are in 202610291043.

-- ═══ 1. Series ═══
create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9\-]{2,79}$'),
  kind text not null default 'series' check (kind in ('series','recurring','tour','festival','conference')),
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'active' check (status in ('active','archived')),
  timezone text not null default 'Europe/London',
  recurrence jsonb check (recurrence is null or jsonb_typeof(recurrence) = 'object'),
  anchor_event_id uuid references public.events(id) on delete set null,
  branding jsonb not null default '{}' check (jsonb_typeof(branding) = 'object'),
  description text check (description is null or length(description) <= 4000),
  version integer not null default 1,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists event_series_ws on public.event_series(workspace_id, status);

alter table public.events add column if not exists series_id uuid references public.event_series(id) on delete set null;
alter table public.events add column if not exists series_index integer;
alter table public.events add column if not exists occurrence_key text;
alter table public.events add column if not exists series_overrides text[] not null default '{}';
alter table public.events add column if not exists parent_event_id uuid references public.events(id) on delete set null;
alter table public.events add column if not exists composition_role text not null default 'standalone'
  check (composition_role in ('standalone','parent','occurrence','stage','track','session','day','sub_event'));
create unique index if not exists events_series_occurrence on public.events(series_id, occurrence_key) where series_id is not null and occurrence_key is not null;
create index if not exists events_series on public.events(series_id, starts_at) where series_id is not null;
create index if not exists events_parent on public.events(parent_event_id) where parent_event_id is not null;

alter table public.event_series enable row level security;
revoke all on table public.event_series from public, anon, authenticated;
grant select on table public.event_series to anon, authenticated;
grant all on table public.event_series to service_role;
drop policy if exists event_series_public on public.event_series;
create policy event_series_public on public.event_series for select to anon, authenticated using (visibility = 'public' and status = 'active');
drop policy if exists event_series_members on public.event_series;
create policy event_series_members on public.event_series for select to authenticated using (public.is_workspace_member(workspace_id));

-- Composition integrity for every writer: same workspace, inside the parent window, depth ≤ 3, no cycles; series in workspace.
create or replace function public.events_composition_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.events; cur uuid; depth int := 0;
begin
  if new.series_id is not null and (tg_op = 'INSERT' or new.series_id is distinct from old.series_id) then
    if not exists (select 1 from public.event_series s where s.id = new.series_id and s.workspace_id is not distinct from new.workspace_id) then raise exception 'series_not_in_workspace' using errcode = '22023'; end if;
  end if;
  if new.parent_event_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.parent_event_id is not distinct from old.parent_event_id and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then return new; end if;
  if new.parent_event_id = new.id then raise exception 'composition_cycle' using errcode = '22023'; end if;
  select * into p from public.events where id = new.parent_event_id;
  if not found or p.workspace_id is distinct from new.workspace_id or p.workspace_id is null then raise exception 'parent_not_in_workspace' using errcode = '22023'; end if;
  if new.starts_at is not null and p.starts_at is not null and (new.starts_at < p.starts_at or coalesce(new.ends_at, new.starts_at) > coalesce(p.ends_at, p.starts_at + interval '1 day')) then
    raise exception 'outside_parent_window' using errcode = '22023';
  end if;
  cur := new.parent_event_id;
  while cur is not null loop
    depth := depth + 1;
    if cur = new.id then raise exception 'composition_cycle' using errcode = '22023'; end if;
    if depth > 3 then raise exception 'composition_too_deep' using errcode = '22023'; end if;
    select parent_event_id into cur from public.events where id = cur;
  end loop;
  return new;
end $$;
drop trigger if exists events_composition_guard on public.events;
create trigger events_composition_guard before insert or update of parent_event_id, series_id, starts_at, ends_at on public.events for each row execute function public.events_composition_guard();

create or replace function public.create_event_series(p_workspace uuid, p_series jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.event_series; v_slug text; tz text := coalesce(p_series->>'timezone', 'Europe/London'); anchor uuid := nullif(p_series->>'anchor_event_id', '')::uuid;
begin
  if not public.has_permission(p_workspace, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if anchor is not null and not exists (select 1 from public.events e where e.id = anchor and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  perform public.series_recurrence_valid(p_series->'recurrence');
  v_slug := trim(both '-' from left(regexp_replace(lower(coalesce(p_series->>'slug', p_series->>'name', 'series')), '[^a-z0-9]+', '-', 'g'), 60));
  if length(v_slug) < 3 then v_slug := 'series'; end if;
  if exists (select 1 from public.event_series x where x.slug = v_slug) then v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6); end if;
  insert into public.event_series(workspace_id, name, slug, kind, visibility, timezone, recurrence, anchor_event_id, branding, description, created_by)
    values (p_workspace, btrim(p_series->>'name'), v_slug, coalesce(p_series->>'kind', 'series'), coalesce(p_series->>'visibility', 'private'), tz,
      p_series->'recurrence', anchor, coalesce(p_series->'branding', '{}'), p_series->>'description', (select auth.uid()))
    returning * into s;
  if anchor is not null then
    update public.events set series_id = s.id, series_index = 0, occurrence_key = coalesce(occurrence_key, to_char(starts_at at time zone tz, 'YYYY-MM-DD')),
      composition_role = case when composition_role = 'standalone' then 'occurrence' else composition_role end where id = anchor;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), p_workspace, 'series.created', jsonb_build_object('series_id', s.id, 'kind', s.kind));
  return jsonb_build_object('ok', true, 'id', s.id, 'slug', s.slug);
end $$;

-- recurrence: {freq: daily|weekly|monthly, interval ≥1, byweekday: [1..7] (ISO, weekly), start_date, start_time 'HH24:MI',
--              duration_minutes, count ≤ 104 | until date}. Raises on an invalid rule.
create or replace function public.series_recurrence_valid(p_rule jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if p_rule is null or p_rule = 'null'::jsonb then return true; end if;
  if coalesce(p_rule->>'freq', '') not in ('daily','weekly','monthly') then raise exception 'invalid_recurrence: freq' using errcode = '22023'; end if;
  if coalesce((p_rule->>'interval')::int, 1) not between 1 and 52 then raise exception 'invalid_recurrence: interval' using errcode = '22023'; end if;
  if (p_rule->>'start_date') is null or (p_rule->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_recurrence: start' using errcode = '22023'; end if;
  perform (p_rule->>'start_date')::date;
  if coalesce((p_rule->>'count')::int, 1) not between 1 and 104 then raise exception 'invalid_recurrence: count' using errcode = '22023'; end if;
  if p_rule ? 'byweekday' and exists (select 1 from jsonb_array_elements_text(p_rule->'byweekday') d where d::int not between 1 and 7) then raise exception 'invalid_recurrence: byweekday' using errcode = '22023'; end if;
  if coalesce((p_rule->>'duration_minutes')::int, 120) not between 15 and 20160 then raise exception 'invalid_recurrence: duration' using errcode = '22023'; end if;
  return true;
end $$;

-- Local dates produced by a rule (bounded: ≤ 104 dates, ≤ 3 years).
create or replace function public.series_rule_dates(p_rule jsonb) returns setof date
language plpgsql immutable set search_path = '' as $$
declare d date := (p_rule->>'start_date')::date; start date := d; n int := 0; lim int := coalesce((p_rule->>'count')::int, 104);
  until_d date := coalesce((p_rule->>'until')::date, start + 1095); iv int := coalesce((p_rule->>'interval')::int, 1); f text := p_rule->>'freq';
  days int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(p_rule->'byweekday') x), array[extract(isodow from start)::int]);
begin
  while d <= least(until_d, start + 1095) and n < lim loop
    if (f = 'daily' and (d - start) % iv = 0)
       or (f = 'weekly' and extract(isodow from d)::int = any(days) and ((d - (start - (extract(isodow from start)::int - 1))) / 7) % iv = 0)
       or (f = 'monthly' and extract(day from d) = extract(day from start) and ((extract(year from d) - extract(year from start)) * 12 + extract(month from d) - extract(month from start))::int % iv = 0) then
      n := n + 1; return next d;
    end if;
    d := d + 1;
  end loop;
end $$;

-- Creates one occurrence from the anchor (or from scratch) — shared by generation and tour dates.
create or replace function public.series_create_occurrence(p_series uuid, p_start timestamptz, p_end timestamptz, p_key text, p_index integer, p_overrides jsonb default '{}')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare s public.event_series; a public.events; v uuid; st jsonb; uid uuid := (select auth.uid());
begin
  select * into s from public.event_series where id = p_series;
  select id into v from public.events where series_id = s.id and occurrence_key = p_key;
  if v is not null then return v; end if;
  select * into a from public.events where id = s.anchor_event_id;
  insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, timezone, venue_listing_id, venue_name, location, city,
      capacity, currency, description, goal, cover_image, tags, settings, series_id, series_index, occurrence_key, composition_role)
    values (coalesce(uid, a.owner_id, (select owner_id from public.workspaces where id = s.workspace_id)), s.workspace_id, coalesce(a.management, 'pro'),
      left(coalesce(p_overrides->>'name', a.name, s.name), 120), coalesce(a.event_type, 'custom'), 'private', 'draft', p_start, p_end, s.timezone,
      coalesce(nullif(p_overrides->>'venue_listing_id', '')::uuid, a.venue_listing_id), coalesce(p_overrides->>'venue_name', a.venue_name), coalesce(p_overrides->>'location', a.location),
      coalesce(p_overrides->>'city', a.city), a.capacity, coalesce(a.currency, 'GBP'), coalesce(a.description, s.description), a.goal,
      coalesce(s.branding->>'cover_image', a.cover_image), coalesce(a.tags, '{}'), jsonb_build_object('series_generated', true, 'series_id', s.id),
      s.id, p_index, p_key, 'occurrence')
    returning id into v;
  if a.id is not null then
    st := public.event_structure_snapshot(a.id, 'duplicate', null);
    perform public.apply_event_structure(v, st, p_start, uid);
  end if;
  return v;
end $$;

create or replace function public.generate_series_occurrences(p_series uuid, p_limit integer default 52) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.event_series; d date; st timestamptz; en timestamptz; created int := 0; existing int := 0; skipped int := 0; idx int; v uuid; dur int;
begin
  select * into s from public.event_series where id = p_series for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission(s.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status <> 'active' then raise exception 'series_archived' using errcode = '22023'; end if;
  if s.recurrence is null then raise exception 'no_recurrence' using errcode = '22023'; end if;
  dur := coalesce((s.recurrence->>'duration_minutes')::int, 120);
  select coalesce(max(series_index), 0) into idx from public.events where series_id = s.id;
  for d in select * from public.series_rule_dates(s.recurrence) loop
    exit when created >= least(greatest(coalesce(p_limit, 52), 1), 104);
    st := (d + (s.recurrence->>'start_time')::time) at time zone s.timezone; en := st + make_interval(mins => dur);
    if st <= now() then skipped := skipped + 1; continue; end if;
    if exists (select 1 from public.events where series_id = s.id and occurrence_key = d::text) then existing := existing + 1; continue; end if;
    idx := idx + 1;
    v := public.series_create_occurrence(s.id, st, en, d::text, idx);
    created := created + 1;
  end loop;
  update public.event_series set version = version + 1, updated_at = now() where id = s.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), s.workspace_id, 'series.occurrences_generated', jsonb_build_object('series_id', s.id, 'created', created, 'existing', existing, 'skipped_past', skipped));
  return jsonb_build_object('ok', true, 'created', created, 'existing', existing, 'skipped_past', skipped);
end $$;

-- Tour date: an occurrence with its own date and venue (key = date + venue).
create or replace function public.add_tour_date(p_series uuid, p_starts_local timestamp, p_duration_minutes integer, p_venue jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.event_series; st timestamptz; v uuid; idx int; k text;
begin
  select * into s from public.event_series where id = p_series for update;
  if not found or not public.has_permission(s.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  st := p_starts_local at time zone s.timezone;
  if st <= now() then raise exception 'new_date_in_past' using errcode = '22023'; end if;
  if nullif(p_venue->>'venue_listing_id', '') is not null and not exists (select 1 from public.listings l where l.id = (p_venue->>'venue_listing_id')::uuid and l.kind = 'venue') then raise exception 'venue_not_found' using errcode = '22023'; end if;
  k := to_char(p_starts_local, 'YYYY-MM-DD') || ':' || left(lower(coalesce(p_venue->>'city', p_venue->>'venue_name', 'tbc')), 40);
  select coalesce(max(series_index), 0) + 1 into idx from public.events where series_id = s.id;
  v := public.series_create_occurrence(s.id, st, st + make_interval(mins => greatest(coalesce(p_duration_minutes, 120), 15)), k, idx, p_venue);
  update public.events set series_overrides = (select array_agg(distinct x) from unnest(series_overrides || array(select jsonb_object_keys(p_venue))) x) where id = v;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), s.workspace_id, 'series.tour_date_added', jsonb_build_object('series_id', s.id, 'event_id', v));
  return jsonb_build_object('ok', true, 'id', v, 'occurrence_key', k);
end $$;

-- Series edits. p_scope: this | following | all. Editable: name, description, cover_image, capacity, venue_name, venue_listing_id,
-- city, location, tags, start_time ('HH24:MI' local), duration_minutes.
create or replace function public.series_edit(p_event uuid, p_patch jsonb, p_scope text, p_expected_series_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare t public.events; s public.event_series; e public.events; k text; ap jsonb; changed int := 0; skipped jsonb := '[]';
  allowed text[] := array['name','description','cover_image','capacity','venue_name','venue_listing_id','city','location','tags','start_time','duration_minutes']; ns timestamptz; ne timestamptz;
begin
  select * into t from public.events where id = p_event;
  if not found or t.series_id is null then raise exception 'not_an_occurrence' using errcode = '22023'; end if;
  if not public.has_permission(t.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_scope not in ('this','following','all') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  select * into s from public.event_series where id = t.series_id for update;
  if p_expected_series_version is not null and s.version <> p_expected_series_version then return jsonb_build_object('ok', false, 'conflict', true, 'version', s.version); end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(allowed)) then raise exception 'field_not_editable: %', k using errcode = '22023'; end if;
  end loop;
  if p_patch ? 'start_time' and (p_patch->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_start_time' using errcode = '22023'; end if;
  for e in select * from public.events x where x.series_id = s.id and (
        (p_scope = 'this' and x.id = t.id)
     or (p_scope = 'following' and x.starts_at >= t.starts_at)
     or (p_scope = 'all'))
     and (x.id = t.id or (x.status not in ('completed','closed','cancelled','archived') and coalesce(x.ends_at, x.starts_at, now()) >= now()))
     order by x.starts_at for update loop
    ap := '{}';
    for k in select jsonb_object_keys(p_patch) loop
      if p_scope <> 'this' and e.id <> t.id and k = any(e.series_overrides) then skipped := skipped || jsonb_build_object('event_id', e.id, 'field', k, 'reason', 'local_override');
      else ap := ap || jsonb_build_object(k, p_patch->k); end if;
    end loop;
    if ap = '{}'::jsonb then continue; end if;
    ns := e.starts_at; ne := e.ends_at;
    if ap ? 'start_time' and e.starts_at is not null then
      ns := ((e.starts_at at time zone s.timezone)::date + (ap->>'start_time')::time) at time zone s.timezone;
      ne := case when e.ends_at is not null then ns + (e.ends_at - e.starts_at) end;
    end if;
    if ap ? 'duration_minutes' and ns is not null then ne := ns + make_interval(mins => (ap->>'duration_minutes')::int); end if;
    update public.events set
      name = case when ap ? 'name' then left(ap->>'name', 120) else name end,
      description = case when ap ? 'description' then ap->>'description' else description end,
      cover_image = case when ap ? 'cover_image' then ap->>'cover_image' else cover_image end,
      capacity = case when ap ? 'capacity' then (ap->>'capacity')::int else capacity end,
      venue_name = case when ap ? 'venue_name' then ap->>'venue_name' else venue_name end,
      venue_listing_id = case when ap ? 'venue_listing_id' then nullif(ap->>'venue_listing_id', '')::uuid else venue_listing_id end,
      city = case when ap ? 'city' then ap->>'city' else city end,
      location = case when ap ? 'location' then ap->>'location' else location end,
      tags = case when ap ? 'tags' then array(select jsonb_array_elements_text(ap->'tags')) else tags end,
      starts_at = ns, ends_at = ne,
      series_overrides = case when p_scope = 'this' then (select array_agg(distinct x) from unnest(series_overrides || array(select jsonb_object_keys(ap))) x) else series_overrides end,
      updated_at = now()
     where id = e.id;
    changed := changed + 1;
  end loop;
  if p_scope = 'all' and p_patch ? 'cover_image' then update public.event_series set branding = branding || jsonb_build_object('cover_image', p_patch->>'cover_image') where id = s.id; end if;
  update public.event_series set version = version + 1, updated_at = now() where id = s.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), s.workspace_id, 'series.edited', jsonb_build_object('series_id', s.id, 'event_id', t.id, 'scope', p_scope, 'fields', (select jsonb_agg(k2) from jsonb_object_keys(p_patch) k2), 'changed', changed));
  return jsonb_build_object('ok', true, 'changed', changed, 'skipped', skipped, 'series_version', s.version + 1);
end $$;

create or replace function public.detach_occurrence(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.events set series_id = null, series_index = null, occurrence_key = null, composition_role = 'standalone', series_overrides = '{}' where id = e.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'series.occurrence_detached', jsonb_build_object('series_id', e.series_id, 'event_id', e.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.series_report(p_series uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.event_series;
begin
  select * into s from public.event_series where id = p_series;
  if not found or not (public.has_permission(s.workspace_id, 'events.read')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('series_id', s.id, 'name', s.name, 'kind', s.kind,
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'status', e.status, 'city', e.city, 'overrides', e.series_overrides,
        'capacity', e.capacity, 'tickets_sold', (select count(*) from public.tickets t where t.event_id = e.id and t.status not in ('refunded','cancelled','void')),
        'revenue_minor', (select coalesce(sum(round(o.amount * 100)), 0) from public.checkout_orders o where o.event_id = e.id and o.status in ('paid','issued') and o.refund_status is distinct from 'refunded'),
        'checked_in', (select count(*) from public.check_ins c where c.event_id = e.id and c.result = 'admitted')) order by e.starts_at)
      from public.events e where e.series_id = s.id), '[]'),
    'totals', (select jsonb_build_object('occurrences', count(*), 'upcoming', count(*) filter (where e.starts_at > now() and e.status not in ('cancelled','archived')),
        'cancelled', count(*) filter (where e.status = 'cancelled'),
        'tickets_sold', (select count(*) from public.tickets t join public.events x on x.id = t.event_id where x.series_id = s.id and t.status not in ('refunded','cancelled','void')),
        'revenue_minor', (select coalesce(sum(round(o.amount * 100)), 0) from public.checkout_orders o join public.events x on x.id = o.event_id where x.series_id = s.id and o.status in ('paid','issued') and o.refund_status is distinct from 'refunded'))
      from public.events e where e.series_id = s.id),
    'provenance', 'Derived from tickets, checkout orders and check-ins of each occurrence; refunded orders excluded.');
end $$;

-- Public series page (invoker): public active series + its listed occurrences.
create or replace function public.series_page(p_slug text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'kind', s.kind, 'description', s.description, 'branding', s.branding - 'internal',
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'city', e.city, 'venue_name', e.venue_name) order by e.starts_at)
       from public.events e join public.event_distribution d on d.event_id = e.id and d.status = 'listed' where e.series_id = s.id), '[]'::jsonb))
    from public.event_series s where s.slug = lower(p_slug) and s.visibility = 'public' and s.status = 'active'
$$;

-- Directory gains the series scope (same contract as 202610291039).
create or replace function public.directory_events(p_scope text default 'all', p_key text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 24, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.id, e.name, e.slug, e.event_type, e.city, e.venue_name, e.starts_at, e.ends_at, e.timezone, e.cover_image, e.workspace_id, d.surfaces
      from public.event_distribution d join public.events e on e.id = d.event_id
     where d.status = 'listed'
       and coalesce(e.ends_at, e.starts_at + interval '12 hours', now()) >= coalesce(p_from, now())
       and (p_to is null or e.starts_at < p_to)
       and case coalesce(p_scope, 'all')
             when 'all' then true
             when 'city' then d.city_key = lower(btrim(p_key)) and 'city' = any(d.surfaces)
             when 'category' then d.category_key = p_key and 'category' = any(d.surfaces)
             when 'venue' then 'venue' = any(d.surfaces) and d.venue_listing_id = (select l.id from public.listings l where (l.slug = p_key or l.id::text = p_key) and l.published limit 1)
             when 'organizer' then 'organizer' = any(d.surfaces) and d.workspace_id::text = p_key
             when 'series' then e.series_id = (select s.id from public.event_series s where (s.slug = lower(p_key) or s.id::text = p_key) and s.visibility = 'public' and s.status = 'active' limit 1)
             else false end
  )
  select jsonb_build_object('scope', coalesce(p_scope, 'all'), 'key', p_key,
    'total', (select count(*) from base),
    'events', coalesce((select jsonb_agg(to_jsonb(b) - 'surfaces' - 'workspace_id' order by b.starts_at, b.id) from (select * from base order by starts_at, id limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) b), '[]'::jsonb),
    'featured', coalesce((select jsonb_agg(jsonb_build_object('event_id', f.event_id, 'kind', f.kind, 'label', f.label, 'sponsored', f.kind = 'sponsored') order by f.created_at)
                            from public.directory_featured f where f.surface = case when coalesce(p_scope, 'all') = 'all' then 'directory' else p_scope end
                             and f.surface_key = lower(coalesce(p_key, '')) and f.status = 'active' and now() between f.starts_at and f.ends_at), '[]'::jsonb),
    'ordering', 'chronological')
$$;

-- ═══ 2. Parent / child sub-events ═══
create or replace function public.add_sub_event(p_parent uuid, p_sub jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare p public.events; v uuid; role text := coalesce(p_sub->>'role', 'sub_event');
begin
  select * into p from public.events where id = p_parent;
  if not found or p.workspace_id is null or not public.has_permission(p.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if role not in ('stage','track','session','day','sub_event') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if nullif(p_sub->>'event_id', '') is not null then
    v := (p_sub->>'event_id')::uuid;
    update public.events set parent_event_id = p.id, composition_role = role where id = v and workspace_id = p.workspace_id;
    if not found then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  else
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, timezone, venue_listing_id, venue_name, city, location,
        currency, parent_event_id, composition_role, capacity)
      values ((select auth.uid()), p.workspace_id, p.management, left(btrim(p_sub->>'name'), 120), p.event_type, 'private', 'draft',
        coalesce((p_sub->>'starts_at')::timestamptz, p.starts_at), coalesce((p_sub->>'ends_at')::timestamptz, p.ends_at), p.timezone, p.venue_listing_id, p.venue_name, p.city, p.location,
        p.currency, p.id, role, nullif(p_sub->>'capacity', '')::int)
      returning id into v;
  end if;
  update public.events set composition_role = 'parent' where id = p.id and composition_role = 'standalone';
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), p.workspace_id, 'event.sub_event_added', jsonb_build_object('event_id', p.id, 'child_id', v, 'role', role));
  return jsonb_build_object('ok', true, 'id', v);
end $$;

create or replace function public.event_children(p_event uuid) returns setof public.events
language sql stable security definer set search_path = '' as $$
  with recursive t as (select e.* from public.events e where e.parent_event_id = p_event union all select c.* from public.events c join t on c.parent_event_id = t.id)
  select * from t
$$;

-- Readiness roll-up: parent readiness + each child's, worst child wins.
create or replace function public.event_composition_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me jsonb; kids jsonb; worst numeric;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  me := public.event_readiness(p_event);
  select coalesce(jsonb_agg(jsonb_build_object('event_id', c.id, 'name', c.name, 'role', c.composition_role, 'status', c.status, 'readiness', public.event_readiness(c.id)) order by c.starts_at), '[]')
    into kids from public.event_children(p_event) c where c.status not in ('cancelled','archived');
  select min((x->'readiness'->>'score')::numeric) into worst from jsonb_array_elements(kids) x;
  return jsonb_build_object('event', me, 'children', kids, 'children_count', jsonb_array_length(kids), 'worst_child_score', worst,
    'rolled_up_score', least(coalesce((me->>'score')::numeric, 100), coalesce(worst, 100)),
    'blocked_children', (select count(*) from jsonb_array_elements(kids) x where coalesce(x->'readiness'->>'state', 'ready') <> 'ready'));
end $$;

-- Shared team/resources across a composed event: Q17 allocations + shifts of the parent and every child, with overlaps.
create or replace function public.event_composition_resources(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ids uuid[];
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  ids := array[p_event] || coalesce((select array_agg(id) from public.event_children(p_event)), '{}');
  return jsonb_build_object(
    'allocations', coalesce((select jsonb_agg(jsonb_build_object('event_id', a.event_id, 'equipment_id', a.equipment_id, 'quantity', a.quantity, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status) order by a.starts_at)
       from public.job_equipment_allocations a where a.event_id = any(ids) and a.status <> 'released'), '[]'),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('event_id', s.event_id, 'crew_id', s.crew_id, 'role', s.role, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'headcount', s.headcount) order by s.starts_at)
       from public.shifts s where s.event_id = any(ids) and s.status not in ('cancelled','declined')), '[]'),
    'crew_double_booked', coalesce((select jsonb_agg(jsonb_build_object('crew_id', a.crew_id, 'a', a.id, 'b', b.id))
       from public.shifts a join public.shifts b on b.crew_id = a.crew_id and a.id < b.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
      where a.event_id = any(ids) and b.event_id = any(ids) and a.crew_id is not null and a.status not in ('cancelled','declined') and b.status not in ('cancelled','declined')), '[]'));
end $$;

-- ═══ 3. Multi-venue ═══
create table if not exists public.event_venues (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  venue_name text not null check (length(btrim(venue_name)) between 2 and 160),
  role text not null default 'secondary' check (role in ('primary','secondary','satellite')),
  starts_at timestamptz, ends_at timestamptz, capacity integer check (capacity is null or capacity > 0), sort integer not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create unique index if not exists event_venues_primary on public.event_venues(event_id) where role = 'primary';
create index if not exists event_venues_event on public.event_venues(event_id, sort);

create or replace function public.set_event_venues(p_event uuid, p_venues jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; x jsonb; n int := 0;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.event_venues where event_id = e.id and id not in (select (q->>'id')::uuid from jsonb_array_elements(p_venues) q where q ? 'id');
  for x in select * from jsonb_array_elements(p_venues) loop
    if nullif(x->>'listing_id', '') is not null and not exists (select 1 from public.listings l where l.id = (x->>'listing_id')::uuid and l.kind = 'venue') then raise exception 'venue_not_found' using errcode = '22023'; end if;
    if (x->>'starts_at') is not null and e.starts_at is not null and ((x->>'starts_at')::timestamptz < e.starts_at - interval '1 day' or coalesce((x->>'ends_at')::timestamptz, (x->>'starts_at')::timestamptz) > coalesce(e.ends_at, e.starts_at) + interval '1 day') then
      raise exception 'venue_outside_event' using errcode = '22023';
    end if;
    insert into public.event_venues(id, event_id, listing_id, venue_name, role, starts_at, ends_at, capacity, sort)
      values (coalesce((x->>'id')::uuid, gen_random_uuid()), e.id, nullif(x->>'listing_id', '')::uuid, btrim(x->>'venue_name'), coalesce(x->>'role', 'secondary'),
        (x->>'starts_at')::timestamptz, (x->>'ends_at')::timestamptz, nullif(x->>'capacity', '')::int, n)
    on conflict (id) do update set listing_id = excluded.listing_id, venue_name = excluded.venue_name, role = excluded.role, starts_at = excluded.starts_at, ends_at = excluded.ends_at, capacity = excluded.capacity, sort = excluded.sort;
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'event.venues_set', jsonb_build_object('event_id', e.id, 'venues', n));
  return jsonb_build_object('ok', true, 'venues', n);
end $$;

-- Venue schedule + transfers (Q25 transport movements whose endpoints are this event's venues) + cross-venue staff.
create or replace function public.event_venue_schedule(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'venues', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'venue_name', v.venue_name, 'listing_id', v.listing_id, 'role', v.role, 'starts_at', v.starts_at, 'ends_at', v.ends_at, 'capacity', v.capacity,
        'tiers', (select count(*) from public.ticket_tiers t where t.event_id = p_event and v.id = any(t.valid_venue_ids)),
        'shifts', (select count(*) from public.shifts s where s.event_id = p_event and s.event_venue_id = v.id),
        'days', (select count(*) from public.event_days d where d.event_id = p_event and d.event_venue_id = v.id)) order by v.sort)
      from public.event_venues v where v.event_id = p_event), '[]'),
    'transfers', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'from', m.from_place, 'to', m.to_place, 'departs_at', m.departs_at, 'arrives_at', m.arrives_at, 'passengers', m.passengers, 'status', m.status) order by m.departs_at)
      from public.transport_movements m where m.event_id = p_event
        and exists (select 1 from public.event_venues a where a.event_id = p_event and lower(a.venue_name) = lower(m.from_place))
        and exists (select 1 from public.event_venues b where b.event_id = p_event and lower(b.venue_name) = lower(m.to_place))), '[]'),
    'transfer_gaps', coalesce((select jsonb_agg(jsonb_build_object('crew_id', a.crew_id, 'from_shift', a.id, 'to_shift', b.id, 'gap_minutes', extract(epoch from b.starts_at - a.ends_at)::int / 60))
      from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.starts_at >= a.ends_at and b.starts_at < a.ends_at + interval '45 minutes'
      where a.event_id = p_event and b.event_id = p_event and a.event_venue_id is not null and b.event_venue_id is not null and a.event_venue_id <> b.event_venue_id and a.crew_id is not null), '[]'));
end $$;

-- ═══ 4. Multi-day ═══
create table if not exists public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day_date date not null,
  label text check (label is null or length(label) <= 80),
  starts_at timestamptz not null, ends_at timestamptz not null,
  event_venue_id uuid references public.event_venues(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at), unique (event_id, day_date)
);
alter table public.ticket_tiers add column if not exists event_day_id uuid references public.event_days(id) on delete set null;
alter table public.ticket_tiers add column if not exists valid_venue_ids uuid[];
alter table public.ticket_tiers add column if not exists space_id uuid references public.spaces(id) on delete set null;
alter table public.programme_items add column if not exists event_day_id uuid references public.event_days(id) on delete set null;
alter table public.shifts add column if not exists event_day_id uuid references public.event_days(id) on delete set null;
alter table public.shifts add column if not exists event_venue_id uuid references public.event_venues(id) on delete set null;
alter table public.shifts add column if not exists space_id uuid references public.spaces(id) on delete set null;
alter table public.build_items add column if not exists event_day_id uuid references public.event_days(id) on delete set null;

create or replace function public.set_event_days(p_event uuid, p_days jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; x jsonb; tz text; n int := 0; st timestamptz; en timestamptz;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  tz := coalesce(e.timezone, 'Europe/London');
  for x in select * from jsonb_array_elements(p_days) loop
    st := ((x->>'date')::date + coalesce((x->>'start_time')::time, time '09:00')) at time zone tz;
    en := ((x->>'date')::date + coalesce((x->>'end_time')::time, time '23:00') + case when coalesce((x->>'end_time')::time, time '23:00') <= coalesce((x->>'start_time')::time, time '09:00') then interval '1 day' else interval '0' end) at time zone tz;
    if e.starts_at is not null and (st < e.starts_at - interval '12 hours' or en > coalesce(e.ends_at, e.starts_at + interval '1 day') + interval '12 hours') then raise exception 'day_outside_event' using errcode = '22023'; end if;
    insert into public.event_days(event_id, day_date, label, starts_at, ends_at, event_venue_id, status)
      values (e.id, (x->>'date')::date, x->>'label', st, en, nullif(x->>'event_venue_id', '')::uuid, coalesce(x->>'status', 'scheduled'))
    on conflict (event_id, day_date) do update set label = excluded.label, starts_at = excluded.starts_at, ends_at = excluded.ends_at, event_venue_id = excluded.event_venue_id, status = excluded.status;
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'event.days_set', jsonb_build_object('event_id', e.id, 'days', n));
  return jsonb_build_object('ok', true, 'days', n);
end $$;

-- Day / room / venue bindings stay consistent for every writer.
create or replace function public.composition_binding_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.event_days; sp public.spaces; ev public.events; cap int; t timestamptz; t2 timestamptz;
begin
  if new.event_day_id is not null then
    select * into d from public.event_days where id = new.event_day_id;
    if d.event_id is distinct from new.event_id then raise exception 'day_not_in_event' using errcode = '22023'; end if;
    if tg_table_name = 'ticket_tiers' then
      -- Day tickets are valid only on their day: default the window to the day and keep it inside.
      new.valid_from := coalesce(new.valid_from, d.starts_at); new.valid_to := coalesce(new.valid_to, d.ends_at);
      if new.valid_from < d.starts_at or new.valid_to > d.ends_at then raise exception 'tier_outside_day' using errcode = '22023'; end if;
    elsif tg_table_name = 'programme_items' then
      if new.starts_at is not null and (new.starts_at < d.starts_at or new.starts_at >= d.ends_at) then raise exception 'item_outside_day' using errcode = '22023'; end if;
    elsif tg_table_name = 'shifts' then
      if new.starts_at < d.starts_at - interval '6 hours' or new.ends_at > d.ends_at + interval '6 hours' then raise exception 'shift_outside_day' using errcode = '22023'; end if;
    end if;
  end if;
  if tg_table_name in ('ticket_tiers','shifts') then if new.space_id is not null then
    select * into sp from public.spaces where id = new.space_id;
    select * into ev from public.events where id = new.event_id;
    if sp.venue_id is distinct from ev.venue_listing_id and not exists (select 1 from public.event_venues v where v.event_id = new.event_id and v.listing_id = sp.venue_id) then
      raise exception 'room_not_at_event_venue' using errcode = '22023';
    end if;
    if tg_table_name = 'ticket_tiers' then
      cap := greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0));
      if cap > 0 and (select coalesce(sum(t.quantity), 0) from public.ticket_tiers t where t.space_id = new.space_id and t.event_id = new.event_id and t.id <> new.id
                        and (new.event_day_id is null or t.event_day_id is not distinct from new.event_day_id)) + new.quantity > cap then
        raise exception 'room_capacity_exceeded' using errcode = '22023';
      end if;
    end if;
  end if; end if;
  if tg_table_name = 'ticket_tiers' then
    if new.valid_venue_ids is not null then
      if exists (select 1 from unnest(new.valid_venue_ids) v where not exists (select 1 from public.event_venues x where x.id = v and x.event_id = new.event_id)) then raise exception 'venue_not_in_event' using errcode = '22023'; end if;
    end if;
  end if;
  if tg_table_name = 'shifts' then
    if new.event_venue_id is not null then
      if not exists (select 1 from public.event_venues x where x.id = new.event_venue_id and x.event_id = new.event_id) then raise exception 'venue_not_in_event' using errcode = '22023'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists composition_binding_guard on public.ticket_tiers;
create trigger composition_binding_guard before insert or update of event_day_id, space_id, valid_venue_ids, valid_from, valid_to, quantity on public.ticket_tiers for each row
  when (new.event_day_id is not null or new.space_id is not null or new.valid_venue_ids is not null) execute function public.composition_binding_guard();
drop trigger if exists composition_binding_guard on public.programme_items;
create trigger composition_binding_guard before insert or update of event_day_id, starts_at on public.programme_items for each row when (new.event_day_id is not null) execute function public.composition_binding_guard();
drop trigger if exists composition_binding_guard on public.shifts;
create trigger composition_binding_guard before insert or update of event_day_id, space_id, event_venue_id, starts_at, ends_at on public.shifts for each row
  when (new.event_day_id is not null or new.space_id is not null or new.event_venue_id is not null) execute function public.composition_binding_guard();
create or replace function public.build_items_day_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_day_id is not null and not exists (select 1 from public.event_days d where d.id = new.event_day_id and d.event_id = new.event_id) then raise exception 'day_not_in_event' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists build_items_day_guard on public.build_items;
create trigger build_items_day_guard before insert or update of event_day_id on public.build_items for each row when (new.event_day_id is not null) execute function public.build_items_day_guard();

create or replace function public.event_day_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('day_id', d.id, 'date', d.day_date, 'label', d.label, 'status', d.status, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
      'tiers', (select jsonb_build_object('count', count(*), 'capacity', coalesce(sum(t.quantity), 0), 'sold', coalesce(sum(t.sold), 0)) from public.ticket_tiers t where t.event_day_id = d.id),
      'revenue_minor', (select coalesce(sum(round(k.price_paid * 100)), 0) from public.tickets k join public.ticket_tiers t on t.id = k.tier_id where t.event_day_id = d.id and k.status not in ('refunded','cancelled','void')),
      'programme_items', (select count(*) from public.programme_items p where p.event_day_id = d.id),
      'staff', (select jsonb_build_object('shifts', count(*), 'headcount', coalesce(sum(s.headcount), 0)) from public.shifts s where s.event_day_id = d.id and s.status not in ('cancelled','declined')),
      'suppliers', (select count(*) from public.build_items b where b.event_day_id = d.id and b.status not in ('cancelled','declined')),
      'admissions', (select count(*) from public.check_ins c where c.event_id = p_event and c.result = 'admitted' and c.created_at >= d.starts_at and c.created_at < d.ends_at)) order by d.day_date)
    from public.event_days d where d.event_id = p_event), '[]'::jsonb);
end $$;

-- ═══ 5. Multi-room ═══
create or replace function public.event_room_schedule(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('space_id', sp.id, 'name', sp.name, 'capacity_standing', sp.capacity_standing, 'capacity_seated', sp.capacity_seated,
      'tracks', (select coalesce(jsonb_agg(distinct p.track) filter (where p.track is not null), '[]') from public.programme_items p where p.event_id = p_event and p.space_id = sp.id),
      'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'track', p.track, 'starts_at', p.starts_at, 'duration_minutes', p.duration_minutes, 'expected_attendance', p.expected_attendance) order by p.starts_at), '[]')
                     from public.programme_items p where p.event_id = p_event and p.space_id = sp.id),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'quantity', t.quantity, 'sold', t.sold)), '[]') from public.ticket_tiers t where t.event_id = p_event and t.space_id = sp.id),
      'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'role', s.role, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'headcount', s.headcount)), '[]') from public.shifts s where s.event_id = p_event and s.space_id = sp.id),
      'map_elements', (select coalesce(jsonb_agg(el->>'id'), '[]') from public.venue_structures vs, jsonb_array_elements(vs.elements) el where vs.venue_id = sp.venue_id and vs.status = 'published' and el->>'space' = sp.id::text))
      order by sp.name)
    from public.spaces sp where sp.venue_id = e.venue_listing_id or sp.venue_id in (select v.listing_id from public.event_venues v where v.event_id = p_event)), '[]'::jsonb);
end $$;

-- ═══ RLS for new tables ═══
alter table public.event_venues enable row level security;
alter table public.event_days enable row level security;
revoke all on table public.event_venues, public.event_days from public, anon, authenticated;
grant select on table public.event_venues, public.event_days to anon, authenticated;
grant all on table public.event_venues, public.event_days to service_role;
drop policy if exists event_venues_read on public.event_venues;
create policy event_venues_read on public.event_venues for select using (exists (select 1 from public.events e where e.id = event_id));
drop policy if exists event_days_read on public.event_days;
create policy event_days_read on public.event_days for select using (exists (select 1 from public.events e where e.id = event_id));

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('series.created', 1, 'event_series', 'An event series was created (payload: series_id, kind).', null),
  ('series.occurrences_generated', 1, 'event_series', 'Occurrences were generated from a series rule (payload: series_id, created, existing, skipped_past).', null),
  ('series.tour_date_added', 1, 'event_series', 'A tour date was added to a series (payload: series_id, event_id).', null),
  ('series.edited', 1, 'event_series', 'A series edit was applied (payload: series_id, event_id, scope, fields, changed).', null),
  ('series.occurrence_detached', 1, 'event_series', 'An occurrence left its series.', null),
  ('event.sub_event_added', 1, 'event', 'A child event (stage, track, session, day, sub-event) was added (payload: event_id, child_id, role).', null),
  ('event.venues_set', 1, 'event', 'An event''s venues were set (payload: event_id, venues).', null),
  ('event.days_set', 1, 'event', 'An event''s days were set (payload: event_id, days).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.events_composition_guard(), public.series_create_occurrence(uuid, timestamptz, timestamptz, text, integer, jsonb), public.event_children(uuid),
  public.composition_binding_guard(), public.build_items_day_guard() from public, anon, authenticated;
grant execute on function public.series_create_occurrence(uuid, timestamptz, timestamptz, text, integer, jsonb), public.event_children(uuid) to service_role;
revoke all on function public.create_event_series(uuid, jsonb), public.generate_series_occurrences(uuid, integer), public.add_tour_date(uuid, timestamp, integer, jsonb),
  public.series_edit(uuid, jsonb, text, integer), public.detach_occurrence(uuid), public.series_report(uuid), public.add_sub_event(uuid, jsonb), public.event_composition_readiness(uuid),
  public.event_composition_resources(uuid), public.set_event_venues(uuid, jsonb), public.event_venue_schedule(uuid), public.set_event_days(uuid, jsonb), public.event_day_report(uuid),
  public.event_room_schedule(uuid) from public, anon;
grant execute on function public.create_event_series(uuid, jsonb), public.generate_series_occurrences(uuid, integer), public.add_tour_date(uuid, timestamp, integer, jsonb),
  public.series_edit(uuid, jsonb, text, integer), public.detach_occurrence(uuid), public.series_report(uuid), public.add_sub_event(uuid, jsonb), public.event_composition_readiness(uuid),
  public.event_composition_resources(uuid), public.set_event_venues(uuid, jsonb), public.event_venue_schedule(uuid), public.set_event_days(uuid, jsonb), public.event_day_report(uuid),
  public.event_room_schedule(uuid) to authenticated, service_role;
grant execute on function public.series_recurrence_valid(jsonb), public.series_rule_dates(jsonb) to authenticated, service_role;
revoke all on function public.series_recurrence_valid(jsonb), public.series_rule_dates(jsonb) from public, anon;
grant execute on function public.series_page(text), public.directory_events(text, text, timestamptz, timestamptz, integer, integer) to anon, authenticated, service_role;
