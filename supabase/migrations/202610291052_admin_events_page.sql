-- Lane A (W13 follow-up, Q45 performance): /admin/events paged in SQL.
-- The page loaded every event (limit 5000) plus admin_event_metrics() for all of them and filtered/sorted/paged in Node.
-- admin_events_page() does the filtering (incl. the derived lifecycle status, ticketed and flagged), the sorting (incl. revenue from
-- admin_event_metrics) and keyset paging in SQL, and returns one page plus the tab/KPI totals and the filter option lists.
-- Additive: one new function; nothing else changes. Admin-only: has_admin_permission('events') requires an aal2 session (Q45 3034).

create or replace function public.admin_events_page(p_filters jsonb default '{}'::jsonb, p_sort text default 'featured', p_limit integer default 50, p_after jsonb default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  srt text := case when p_sort in ('featured', 'newest', 'starts', 'name') then p_sort else 'featured' end;
  q text := lower(left(trim(coalesce(f->>'q', '')), 80));
  people boolean := public.has_admin_permission('users') or public.has_admin_permission('support');
  result jsonb;
begin
  if not public.has_admin_permission('events') then raise exception 'not_authorized' using errcode = '42501'; end if;

  with m as (select * from public.admin_event_metrics(30)),
  base as (
    select e.id, e.name, e.slug, e.event_type, e.status, e.visibility, e.management, e.starts_at, e.ends_at, e.venue_name, e.city, e.location, e.cover_image,
      e.description, e.workspace_id, e.owner_id, e.venue_listing_id, e.capacity, e.created_at, e.settings,
      case
        when e.status = 'suspended' then 'restricted'
        when e.status = 'cancelled' then 'cancelled'
        when e.status = 'live' or (e.status in ('on_sale', 'published', 'ready') and e.starts_at is not null and e.starts_at <= now() and coalesce(e.ends_at, e.starts_at) >= now()) then 'live'
        when e.status in ('completed', 'closed', 'archived') then 'completed'
        when e.status in ('draft', 'planning') then 'draft'
        when e.status = 'on_sale' then 'on_sale'
        when e.status = 'published' then 'published'
        when e.status = 'postponed' then 'pending'
        else 'upcoming' end as st,
      coalesce(m.capacity, 0) > 0 as ticketed, coalesce(m.flags, 0) > 0 as flagged, coalesce(m.gross, 0) as gross,
      case when coalesce(e.settings->>'featured', '') in ('true', '1') then 1 else 0 end as featured,
      coalesce(w.name, case when people then p.full_name end, 'Personal') as owner_label,
      coalesce(w.cover_image, case when people then p.avatar_url end) as owner_avatar, w.settings->>'reference' as ws_reference,
      to_jsonb(m) - 'event_id' as metrics
    from public.events e
    left join m on m.event_id = e.id
    left join public.workspaces w on w.id = e.workspace_id
    left join public.profiles p on e.workspace_id is null and p.id = e.owner_id
  ),
  filtered as (
    select * from base b where
      (f->>'id' is null or b.id::text = f->>'id')
      and (coalesce(f->>'tab', 'all') = 'all' or (f->>'tab' = 'public' and b.visibility = 'public') or (f->>'tab' = 'ticketed' and b.ticketed)
           or (f->>'tab' = 'live' and b.st = 'live') or (f->>'tab' = 'flagged' and b.flagged))
      and (q = '' or position(q in lower(concat_ws(' ', b.name, b.settings->>'reference', b.id::text, b.city, b.venue_name, b.owner_label))) > 0)
      and (f->>'type' is null or b.event_type = f->>'type')
      and (f->>'status' is null or b.st = f->>'status')
      and (f->>'when' is null
           or (f->>'when' = 'upcoming' and b.starts_at > now())
           or (f->>'when' = 'past' and b.starts_at < now())
           or (f->>'when' = '30' and b.starts_at > now() and b.starts_at < now() + interval '30 days'))
      and (f->>'vis' is null or b.visibility = f->>'vis')
      and (f->>'tix' is null or (f->>'tix' = 'yes' and b.ticketed) or (f->>'tix' = 'no' and not b.ticketed))
      and (f->>'owner' is null or b.management = f->>'owner')
      and (f->>'city' is null or b.city = f->>'city')
  ),
  keyed as ( -- one comparable sort key per row: every sort is "key tuple, then id" so keyset paging never overlaps or skips
    select fl.*,
      case srt when 'starts' then 0 else fl.featured end as k1,
      case srt when 'featured' then fl.gross else 0 end as k2,
      case srt when 'starts' then coalesce(fl.starts_at, 'infinity'::timestamptz) when 'name' then 'epoch'::timestamptz else fl.created_at end as k3,
      case srt when 'name' then lower(fl.name) else '' end as k4
    from filtered fl
  ),
  page as (
    select k.*, row_number() over (order by
      case when srt in ('starts', 'name') then k.k1 end asc, case when srt in ('starts', 'name') then k.k2 end asc, case when srt in ('starts', 'name') then k.k3 end asc,
      case when srt in ('starts', 'name') then k.k4 end asc, case when srt in ('starts', 'name') then k.id end asc,
      case when srt not in ('starts', 'name') then k.k1 end desc, case when srt not in ('starts', 'name') then k.k2 end desc, case when srt not in ('starts', 'name') then k.k3 end desc,
      case when srt not in ('starts', 'name') then k.k4 end desc, case when srt not in ('starts', 'name') then k.id end desc) as rn
    from keyed k where p_after is null or (
      case when srt in ('starts', 'name')
        then (k.k1, k.k2, k.k3, k.k4, k.id) > ((p_after->>'k1')::int, (p_after->>'k2')::numeric, (p_after->>'k3')::timestamptz, p_after->>'k4', (p_after->>'id')::uuid)
        else (k.k1, k.k2, k.k3, k.k4, k.id) < ((p_after->>'k1')::int, (p_after->>'k2')::numeric, (p_after->>'k3')::timestamptz, p_after->>'k4', (p_after->>'id')::uuid) end)
    order by rn
    limit lim + 1
  ),
  numbered as (select * from page)
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(n) - 'k1' - 'k2' - 'k3' - 'k4' - 'rn' order by n.rn) from numbered n where n.rn <= lim), '[]'::jsonb),
    'next', (select jsonb_build_object('k1', n.k1, 'k2', n.k2, 'k3', n.k3, 'k4', n.k4, 'id', n.id) from numbered n where n.rn = lim and exists(select 1 from numbered x where x.rn = lim + 1)),
    'filtered', (select count(*) from filtered),
    'totals', (select jsonb_build_object('all', count(*), 'pub', count(*) filter (where visibility = 'public'), 'tix', count(*) filter (where ticketed),
                                         'live', count(*) filter (where st = 'live'), 'flag', count(*) filter (where flagged)) from base),
    'cities', coalesce((select jsonb_agg(c order by c) from (select distinct city c from base where coalesce(city, '') <> '') x), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(t order by t) from (select distinct event_type t from base where event_type is not null) y), '[]'::jsonb),
    'sort', srt, 'limit', lim)
  into result;
  return result;
end $$;

revoke all on function public.admin_events_page(jsonb, text, integer, jsonb) from public, anon;
grant execute on function public.admin_events_page(jsonb, text, integer, jsonb) to authenticated, service_role;
comment on function public.admin_events_page(jsonb, text, integer, jsonb) is
  'Lane A Q45: /admin/events filtered, sorted (featured→revenue→newest | newest | starts | name) and keyset-paged in SQL. Admin events permission + aal2.';
