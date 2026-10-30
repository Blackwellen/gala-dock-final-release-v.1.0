-- Q23 remainder (lane A, 2026-10-29): Event Directory (136), Calendar Promotion (137), Event Following (138).
-- Additive and backward compatible. Builds on Q23 ads (202610291014) and Q06 search; never touches organic ranking.
--   * event_distribution: one row per event = which public surfaces list it (directory, city, category, venue, organizer,
--     calendar, search, sitemap, related). Maintained by a trigger on every events write, so publish/unpublish/cancel/
--     restrict/end propagates to all surfaces in the same transaction (+ outbox events, follow alerts job).
--   * directory reads are SECURITY INVOKER (anon RLS on events still applies; no new anon definer function):
--     directory_events, directory_related, directory_facets, calendar_window, calendar_events.
--   * directory_featured: editorial or sponsored featured rows, returned separately and always labelled; sponsored rows
--     need an active paid boost. Organic order is chronological and never re-ranked.
--   * follows (event / venue / organizer / category / city / series): own rows only; organisers see counts, never identities.
--     Follow alerts run through notify() (dedupe per event × user), only for followers with alerts on.

-- ═══ 1. Distribution projection ═══
create table if not exists public.event_distribution (
  event_id uuid primary key references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  status text not null default 'unlisted' check (status in ('listed','unlisted','withdrawn')),
  reason text not null default 'not_public',
  surfaces text[] not null default '{}',
  city_key text, category_key text, venue_listing_id uuid, starts_at timestamptz, ends_at timestamptz,
  listed_at timestamptz, withdrawn_at timestamptz, listed_count integer not null default 0,
  version integer not null default 0, updated_at timestamptz not null default now()
);
create index if not exists event_distribution_listed on public.event_distribution(status, starts_at) where status = 'listed';
create index if not exists event_distribution_city on public.event_distribution(city_key, starts_at) where status = 'listed';
create index if not exists event_distribution_category on public.event_distribution(category_key, starts_at) where status = 'listed';
create index if not exists event_distribution_venue on public.event_distribution(venue_listing_id, starts_at) where status = 'listed';
create index if not exists event_distribution_ws on public.event_distribution(workspace_id, starts_at);
alter table public.event_distribution enable row level security;
revoke all on table public.event_distribution from public, anon, authenticated;
grant select on table public.event_distribution to anon, authenticated;
grant all on table public.event_distribution to service_role;
drop policy if exists event_distribution_public on public.event_distribution;
create policy event_distribution_public on public.event_distribution for select to anon, authenticated using (status = 'listed');
drop policy if exists event_distribution_members on public.event_distribution;
create policy event_distribution_members on public.event_distribution for select to authenticated using (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Pure eligibility rule (no I/O beyond the type profile + venue listing): returns status, reason, surfaces.
create or replace function public.event_distribution_eval(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; allowed boolean; venue_ok boolean; s text[] := '{}';
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'withdrawn', 'reason', 'deleted', 'surfaces', '[]'::jsonb); end if;
  select coalesce(p.public_listing_allowed, true) into allowed from public.event_type_profiles p where p.event_type = coalesce(e.event_type, 'custom');
  allowed := coalesce(allowed, true);
  if e.visibility <> 'public' then return jsonb_build_object('status', 'unlisted', 'reason', 'not_public', 'surfaces', '[]'::jsonb); end if;
  if e.status in ('cancelled','archived','suspended','closed','completed','postponed') then return jsonb_build_object('status', 'withdrawn', 'reason', e.status, 'surfaces', '[]'::jsonb); end if;
  if e.status not in ('published','on_sale','live') then return jsonb_build_object('status', 'unlisted', 'reason', 'not_published', 'surfaces', '[]'::jsonb); end if;
  if coalesce(e.settings->'admin_restriction', 'null'::jsonb) not in ('null'::jsonb, 'false'::jsonb) then return jsonb_build_object('status', 'withdrawn', 'reason', 'restricted', 'surfaces', '[]'::jsonb); end if;
  if not allowed then return jsonb_build_object('status', 'unlisted', 'reason', 'type_not_listable', 'surfaces', '[]'::jsonb); end if;
  if coalesce(e.ends_at, e.starts_at + interval '12 hours') < now() then return jsonb_build_object('status', 'withdrawn', 'reason', 'ended', 'surfaces', '[]'::jsonb); end if;
  s := array['directory','search','sitemap','related'];
  if nullif(btrim(e.city), '') is not null then s := s || 'city'::text; end if;
  if e.event_type is not null then s := s || 'category'::text; end if;
  if e.starts_at is not null then s := s || 'calendar'::text; end if;
  if e.workspace_id is not null then s := s || 'organizer'::text; end if;
  select coalesce(l.published, false) into venue_ok from public.listings l where l.id = e.venue_listing_id;
  if coalesce(venue_ok, false) then s := s || 'venue'::text; end if;
  return jsonb_build_object('status', 'listed', 'reason', 'eligible', 'surfaces', to_jsonb(s));
end $$;

create or replace function public.event_distribution_sync(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; d public.event_distribution; r jsonb; st text; surf text[]; was text;
begin
  select * into e from public.events where id = p_event;
  if not found then return null; end if;
  r := public.event_distribution_eval(p_event);
  st := r->>'status'; surf := array(select jsonb_array_elements_text(r->'surfaces'));
  select * into d from public.event_distribution where event_id = p_event for update;
  was := coalesce(d.status, 'unlisted');
  insert into public.event_distribution as x(event_id, workspace_id, status, reason, surfaces, city_key, category_key, venue_listing_id, starts_at, ends_at, listed_at, withdrawn_at, listed_count, version, updated_at)
    values (e.id, e.workspace_id, st, r->>'reason', surf, lower(nullif(btrim(e.city), '')), e.event_type, e.venue_listing_id, e.starts_at, e.ends_at,
      case when st = 'listed' then now() end, case when st = 'withdrawn' then now() end, case when st = 'listed' then 1 else 0 end, 1, now())
  on conflict (event_id) do update set workspace_id = excluded.workspace_id, status = excluded.status, reason = excluded.reason, surfaces = excluded.surfaces,
    city_key = excluded.city_key, category_key = excluded.category_key, venue_listing_id = excluded.venue_listing_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    listed_at = case when excluded.status = 'listed' and x.status <> 'listed' then now() else x.listed_at end,
    withdrawn_at = case when excluded.status <> 'listed' and x.status = 'listed' then now() else x.withdrawn_at end,
    listed_count = x.listed_count + case when excluded.status = 'listed' and x.status <> 'listed' then 1 else 0 end,
    version = x.version + case when (x.status, x.surfaces, x.starts_at, x.city_key, x.category_key) is distinct from (excluded.status, excluded.surfaces, excluded.starts_at, excluded.city_key, excluded.category_key) then 1 else 0 end,
    updated_at = now()
  returning * into d;
  if st = 'listed' and was <> 'listed' then
    perform public.emit_domain_event('promotion.distribution_listed', e.workspace_id, jsonb_build_object('event_id', e.id, 'surfaces', to_jsonb(surf), 'listed_count', d.listed_count), null, 'system', 'event', e.id::text);
    -- Follow alerts only the first time an event is listed (re-publishing never re-alerts).
    if d.listed_count = 1 then perform public.enqueue_job('promotion.follow_alerts', jsonb_build_object('event_id', e.id), 'follow-alerts:' || e.id, null, e.workspace_id); end if;
  elsif st <> 'listed' and was = 'listed' then
    perform public.emit_domain_event('promotion.distribution_withdrawn', e.workspace_id, jsonb_build_object('event_id', e.id, 'reason', r->>'reason'), null, 'system', 'event', e.id::text);
  end if;
  return to_jsonb(d);
end $$;

create or replace function public.trg_event_distribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.event_distribution_sync(new.id);
  return null;
end $$;
drop trigger if exists gd_event_distribution on public.events;
create trigger gd_event_distribution after insert or update of status, visibility, starts_at, ends_at, city, event_type, venue_listing_id, settings, workspace_id
  on public.events for each row execute function public.trg_event_distribution();

-- Listing publish/unpublish changes the venue surface of its events.
create or replace function public.trg_listing_distribution() returns trigger
language plpgsql security definer set search_path = '' as $$
declare x uuid;
begin
  if new.published is distinct from old.published then
    for x in select id from public.events where venue_listing_id = new.id and coalesce(ends_at, starts_at + interval '12 hours', now()) >= now() - interval '1 day' loop
      perform public.event_distribution_sync(x);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists gd_listing_distribution on public.listings;
create trigger gd_listing_distribution after update of published on public.listings for each row execute function public.trg_listing_distribution();

-- Ended events drop out of the directory even when nothing writes the row (daily + on demand).
create or replace function public.distribution_sweep(p_limit integer default 1000) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare x uuid; n integer := 0;
begin
  for x in select event_id from public.event_distribution where status = 'listed' and coalesce(ends_at, starts_at + interval '12 hours') < now() limit p_limit loop
    perform public.event_distribution_sync(x); n := n + 1;
  end loop;
  return jsonb_build_object('withdrawn_checked', n);
end $$;
create or replace function public.job_distribution_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return public.distribution_sweep(coalesce((p_job.payload->>'limit')::int, 1000)); end $$;

-- Backfill (no follow alerts for historic rows: listed_count starts at 1 without a job).
insert into public.event_distribution(event_id, workspace_id, status, reason, surfaces, city_key, category_key, venue_listing_id, starts_at, ends_at, listed_at, listed_count, version)
select e.id, e.workspace_id, r->>'status', r->>'reason', array(select jsonb_array_elements_text(r->'surfaces')), lower(nullif(btrim(e.city), '')), e.event_type, e.venue_listing_id,
       e.starts_at, e.ends_at, case when r->>'status' = 'listed' then now() end, case when r->>'status' = 'listed' then 1 else 0 end, 1
  from public.events e cross join lateral public.event_distribution_eval(e.id) r
on conflict (event_id) do nothing;

-- ═══ 2. Featured (editorial / sponsored), always labelled, never mixed into organic order ═══
create table if not exists public.directory_featured (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('directory','city','category','venue','organizer','calendar','landing')),
  surface_key text not null default '',
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('editorial','sponsored')),
  boost_id uuid references public.promotion_boosts(id) on delete cascade,
  label text not null default 'Featured' check (length(label) between 3 and 40),
  starts_at timestamptz not null default now(), ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','paused','ended')),
  created_by uuid, created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'sponsored' or (boost_id is not null and label = 'Sponsored')),
  check (kind <> 'editorial' or boost_id is null)
);
create unique index if not exists directory_featured_once on public.directory_featured(surface, surface_key, event_id) where status = 'active';
alter table public.directory_featured enable row level security;
revoke all on table public.directory_featured from public, anon, authenticated;
grant select on table public.directory_featured to anon, authenticated;
grant all on table public.directory_featured to service_role;
drop policy if exists directory_featured_read on public.directory_featured;
create policy directory_featured_read on public.directory_featured for select to anon, authenticated using (
  status = 'active' and now() between starts_at and ends_at and exists (select 1 from public.event_distribution d where d.event_id = directory_featured.event_id and d.status = 'listed'));
drop policy if exists directory_featured_admin on public.directory_featured;
create policy directory_featured_admin on public.directory_featured for select to authenticated using (public.has_admin_permission('commerce'));

create or replace function public.directory_featured_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b public.promotion_boosts;
begin
  if new.kind = 'sponsored' then
    select * into b from public.promotion_boosts where id = new.boost_id;
    if not found or b.event_id is distinct from new.event_id then raise exception 'boost_not_for_event' using errcode = '22023'; end if;
    if b.status not in ('active','scheduled') then raise exception 'boost_not_paid' using errcode = '22023'; end if;
    if new.ends_at > b.ends_at then new.ends_at := b.ends_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists gd_directory_featured_guard on public.directory_featured;
create trigger gd_directory_featured_guard before insert or update on public.directory_featured for each row execute function public.directory_featured_guard();

-- Commerce admins curate; sponsored rows come only from a paid boost.
create or replace function public.set_directory_featured(p_surface text, p_key text, p_event uuid, p_kind text, p_ends timestamptz, p_boost uuid default null, p_label text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_distribution d where d.event_id = p_event and d.status = 'listed') then raise exception 'event_not_listed' using errcode = '22023'; end if;
  insert into public.directory_featured(surface, surface_key, event_id, kind, boost_id, label, ends_at, created_by)
    values (p_surface, lower(coalesce(p_key, '')), p_event, p_kind, p_boost, case when p_kind = 'sponsored' then 'Sponsored' else coalesce(nullif(btrim(p_label), ''), 'Featured') end, p_ends, (select auth.uid()))
    returning id into v;
  insert into public.audit_events(actor_id, event, metadata) values ((select auth.uid()), 'promotion.featured_set', jsonb_build_object('id', v, 'surface', p_surface, 'event_id', p_event, 'kind', p_kind));
  return v;
end $$;

-- ═══ 3. Public directory reads (SECURITY INVOKER — anon RLS on events/listings applies) ═══
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

create or replace function public.directory_related(p_event uuid, p_limit integer default 4)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with me as (select e.* from public.events e join public.event_distribution d on d.event_id = e.id where e.id = p_event and d.status = 'listed'),
  c as (
    select e.id, e.name, e.slug, e.starts_at, e.city, e.event_type, e.cover_image,
           (case when lower(e.city) = lower(m.city) then 2 else 0 end) + (case when e.event_type = m.event_type then 2 else 0 end)
         + (case when e.workspace_id = m.workspace_id then 1 else 0 end) + (case when e.venue_listing_id = m.venue_listing_id then 1 else 0 end) as score,
           array_remove(array[case when lower(e.city) = lower(m.city) then 'same_city' end, case when e.event_type = m.event_type then 'same_category' end,
             case when e.workspace_id = m.workspace_id then 'same_organizer' end, case when e.venue_listing_id = m.venue_listing_id then 'same_venue' end], null) as why
      from me m join public.event_distribution d on d.status = 'listed' and d.event_id <> m.id join public.events e on e.id = d.event_id
     where coalesce(e.ends_at, e.starts_at + interval '12 hours') >= now()
       and (lower(e.city) = lower(m.city) or e.event_type = m.event_type or e.workspace_id = m.workspace_id or e.venue_listing_id = m.venue_listing_id)
     order by score desc, e.starts_at, e.id limit least(greatest(coalesce(p_limit, 4), 1), 24))
  select coalesce(jsonb_agg(to_jsonb(c) order by c.score desc, c.starts_at, c.id), '[]'::jsonb) from c
$$;

create or replace function public.directory_facets()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cities', coalesce((select jsonb_agg(jsonb_build_object('key', city_key, 'events', n) order by n desc, city_key) from (
       select d.city_key, count(*) n from public.event_distribution d where d.status = 'listed' and d.city_key is not null and coalesce(d.ends_at, d.starts_at + interval '12 hours') >= now() group by 1) a), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('key', category_key, 'events', n) order by n desc, category_key) from (
       select d.category_key, count(*) n from public.event_distribution d where d.status = 'listed' and d.category_key is not null and coalesce(d.ends_at, d.starts_at + interval '12 hours') >= now() group by 1) b), '[]'::jsonb))
$$;

-- ═══ 4. Calendar windows (timezone-aware) ═══
-- today = local midnight → next midnight; weekend = Friday 17:00 → Monday 00:00 local (on Sat/Sun: the current weekend);
-- month = first of month → first of next month. Ranges are half-open [from, to).
create or replace function public.calendar_window(p_range text, p_tz text default 'Europe/London', p_anchor date default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare tz text := coalesce(nullif(p_tz, ''), 'Europe/London'); d date; f timestamp; t timestamp; dow int;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  d := coalesce(p_anchor, (now() at time zone tz)::date);
  dow := extract(isodow from d)::int;   -- 1 Mon … 7 Sun
  case p_range
    when 'today' then f := d::timestamp; t := (d + 1)::timestamp;
    when 'weekend' then
      f := (d + (5 - dow))::timestamp + interval '17 hours';   -- this week's Friday (Sat/Sun look back to it)
      t := (d + (8 - dow))::timestamp;                          -- following Monday 00:00
    when 'month' then f := date_trunc('month', d::timestamp); t := date_trunc('month', d::timestamp) + interval '1 month';
    else raise exception 'invalid_range' using errcode = '22023';
  end case;
  return jsonb_build_object('range', p_range, 'timezone', tz, 'from', f at time zone tz, 'to', t at time zone tz, 'local_from', f, 'local_to', t);
end $$;

create or replace function public.calendar_events(p_range text, p_tz text default 'Europe/London', p_scope text default 'all', p_key text default null, p_anchor date default null, p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare w jsonb; r jsonb; tz text;
begin
  w := public.calendar_window(p_range, p_tz, p_anchor); tz := w->>'timezone';
  r := public.directory_events(p_scope, p_key, (w->>'from')::timestamptz, (w->>'to')::timestamptz, p_limit, 0);
  return w || jsonb_build_object('scope', p_scope, 'key', p_key, 'total', r->'total', 'featured', r->'featured',
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', dte, 'events', evs) order by dte) from (
       select ((x->>'starts_at')::timestamptz at time zone tz)::date dte, jsonb_agg(x || jsonb_build_object('local_start', ((x->>'starts_at')::timestamptz at time zone tz)) order by x->>'starts_at') evs
         from jsonb_array_elements(r->'events') x group by 1) g), '[]'::jsonb));
end $$;

-- ═══ 5. Following ═══
create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('event','venue','organizer','category','city','series')),
  subject_key text not null check (length(subject_key) between 1 and 80),
  alerts boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_key)
);
create index if not exists follows_subject on public.follows(subject_kind, subject_key) where alerts;
alter table public.follows enable row level security;
revoke all on table public.follows from public, anon, authenticated;
grant select on table public.follows to authenticated;
grant all on table public.follows to service_role;
drop policy if exists follows_own on public.follows;
create policy follows_own on public.follows for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.follow_subject_valid(p_kind text, p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare ok boolean := false; k text := btrim(coalesce(p_key, ''));
begin
  if k = '' then return null; end if;
  case p_kind
    when 'event' then select exists (select 1 from public.event_distribution d where d.event_id::text = k and d.status = 'listed') into ok;
    when 'venue' then select exists (select 1 from public.listings l where l.id::text = k and l.published and l.kind = 'venue') into ok;
    when 'organizer' then select exists (select 1 from public.workspaces w where w.id::text = k and w.kind = 'organizer' and coalesce(w.status, 'active') = 'active') into ok;
    when 'category' then k := lower(k); select exists (select 1 from public.event_type_profiles p where p.event_type = k) into ok;
    when 'city' then k := lower(k); ok := k ~ '^[a-z][a-z \-''.]{0,79}$';
    when 'series' then
      if to_regclass('public.event_series') is not null then
        execute 'select exists (select 1 from public.event_series s where s.id::text = $1 and s.visibility = ''public'' and s.status = ''active'')' into ok using k;
      end if;
    else ok := false;
  end case;
  return case when ok then k end;
end $$;

create or replace function public.follow_subject(p_kind text, p_key text, p_alerts boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); k text;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.hit_rate_limit('follow:' || uid, 120, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  k := public.follow_subject_valid(p_kind, p_key);
  if k is null then raise exception 'subject_not_followable' using errcode = '22023'; end if;
  insert into public.follows(user_id, subject_kind, subject_key, alerts) values (uid, p_kind, k, coalesce(p_alerts, true))
    on conflict (user_id, subject_kind, subject_key) do update set alerts = excluded.alerts;
  insert into public.audit_events(actor_id, event, metadata) values (uid, 'promotion.followed', jsonb_build_object('kind', p_kind, 'key', k, 'alerts', coalesce(p_alerts, true)));
  return jsonb_build_object('ok', true, 'kind', p_kind, 'key', k, 'alerts', coalesce(p_alerts, true));
end $$;

create or replace function public.unfollow_subject(p_kind text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); n integer;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.follows where user_id = uid and subject_kind = p_kind and subject_key in (btrim(p_key), lower(btrim(p_key)));
  get diagnostics n = row_count;
  if n > 0 then insert into public.audit_events(actor_id, event, metadata) values (uid, 'promotion.unfollowed', jsonb_build_object('kind', p_kind, 'key', p_key)); end if;
  return jsonb_build_object('ok', true, 'removed', n > 0);
end $$;

-- Aggregate only (no identities): any signed-in user may see how many people follow a public subject.
create or replace function public.follow_count(p_kind text, p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.follows f where f.subject_kind = p_kind and f.subject_key = case when p_kind in ('category','city') then lower(btrim(p_key)) else btrim(p_key) end
$$;

-- Organiser view: follower counts for its organizer page and its upcoming events. Never user ids or emails.
create or replace function public.promotion_follower_summary(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_workspace, 'events.read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('organizer', public.follow_count('organizer', p_workspace::text),
    'organizer_alerts_on', (select count(*) from public.follows f where f.subject_kind = 'organizer' and f.subject_key = p_workspace::text and f.alerts),
    'events', coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'name', e.name, 'followers', public.follow_count('event', e.id::text)) order by e.starts_at)
                         from public.events e where e.workspace_id = p_workspace and coalesce(e.ends_at, e.starts_at, now()) >= now() - interval '1 day'), '[]'::jsonb));
end $$;

insert into public.notification_categories(category, class, mandatory, default_email, description) values
  ('follow_alerts', 'transactional', false, false, 'New events from organisers, venues, categories, cities and series you follow (you asked for these; turn off per follow)')
on conflict (category) do nothing;

-- Job: alert followers once when an event is first listed. In-app notifications only (no email/SMS sends).
create or replace function public.job_promotion_follow_alerts(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; d public.event_distribution; u record; n integer := 0; ser text;
begin
  select * into e from public.events where id = (p_job.payload->>'event_id')::uuid;
  select * into d from public.event_distribution where event_id = e.id;
  if e.id is null or d.status is distinct from 'listed' then return jsonb_build_object('skipped', 'not_listed'); end if;
  ser := case when to_regclass('public.event_series') is not null then (to_jsonb(e)->>'series_id') end;
  for u in select distinct f.user_id from public.follows f
            where f.alerts and f.user_id is distinct from e.owner_id and (
                  (f.subject_kind = 'organizer' and f.subject_key = e.workspace_id::text)
               or (f.subject_kind = 'venue' and f.subject_key = e.venue_listing_id::text and 'venue' = any(d.surfaces))
               or (f.subject_kind = 'category' and f.subject_key = e.event_type)
               or (f.subject_kind = 'city' and f.subject_key = d.city_key)
               or (f.subject_kind = 'series' and ser is not null and f.subject_key = ser))
            limit 5000 loop
    perform public.notify(u.user_id, 'follow_alert', left('New event: ' || e.name, 200),
      left(coalesce(to_char(e.starts_at at time zone coalesce(e.timezone, 'Europe/London'), 'Dy DD Mon YYYY HH24:MI'), '') || coalesce(' · ' || e.city, ''), 2000),
      '/events/' || coalesce(e.slug, e.id::text), 'follow:' || e.id || ':' || u.user_id);
    n := n + 1;
  end loop;
  if n > 0 then insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', e.workspace_id, 'promotion.follow_alerts_sent', jsonb_build_object('event_id', e.id, 'recipients', n)); end if;
  return jsonb_build_object('event_id', e.id, 'notified', n);
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('promotion.follow_alerts', 'db', 'public.job_promotion_follow_alerts', 5, 'Q23: notify followers (in-app, deduped) when an event is first listed'),
  ('promotion.distribution_sweep', 'db', 'public.job_distribution_sweep', 3, 'Q23: daily; withdraw ended events from every discovery surface')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('promotion.distribution_listed', 1, 'event', 'An event became listed on public discovery surfaces (payload: event_id, surfaces, listed_count).', null),
  ('promotion.distribution_withdrawn', 1, 'event', 'An event left public discovery surfaces (payload: event_id, reason).', null),
  ('promotion.followed', 1, 'follow', 'A user followed a subject (no identity in payload).', null),
  ('promotion.unfollowed', 1, 'follow', 'A user unfollowed a subject.', null),
  ('promotion.follow_alerts_sent', 1, 'event', 'Follow alerts were sent for a newly listed event (payload: event_id, recipients).', null),
  ('promotion.featured_set', 1, 'directory_featured', 'Gala Dock featured an event on a directory surface (editorial or sponsored).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('promotion-distribution-sweep', '20 1 * * *', $c$select public.enqueue_job('promotion.distribution_sweep', '{}'::jsonb, 'distribution-sweep:' || to_char(now(), 'YYYY-MM-DD'))$c$);
  end if;
end $$;

-- ═══ Grants ═══
revoke all on function public.event_distribution_eval(uuid), public.event_distribution_sync(uuid), public.trg_event_distribution(), public.trg_listing_distribution(),
  public.distribution_sweep(integer), public.job_distribution_sweep(public.job_queue), public.directory_featured_guard(), public.follow_subject_valid(text, text),
  public.job_promotion_follow_alerts(public.job_queue) from public, anon, authenticated;
grant execute on function public.event_distribution_eval(uuid), public.event_distribution_sync(uuid), public.distribution_sweep(integer),
  public.job_distribution_sweep(public.job_queue), public.follow_subject_valid(text, text), public.job_promotion_follow_alerts(public.job_queue) to service_role;
revoke all on function public.set_directory_featured(text, text, uuid, text, timestamptz, uuid, text), public.follow_subject(text, text, boolean), public.unfollow_subject(text, text),
  public.follow_count(text, text), public.promotion_follower_summary(uuid) from public, anon;
grant execute on function public.set_directory_featured(text, text, uuid, text, timestamptz, uuid, text), public.follow_subject(text, text, boolean), public.unfollow_subject(text, text),
  public.follow_count(text, text), public.promotion_follower_summary(uuid) to authenticated, service_role;
-- Invoker reads: callable by anyone, RLS decides what they see.
grant execute on function public.directory_events(text, text, timestamptz, timestamptz, integer, integer), public.directory_related(uuid, integer), public.directory_facets(),
  public.calendar_window(text, text, date), public.calendar_events(text, text, text, text, date, integer) to anon, authenticated, service_role;
