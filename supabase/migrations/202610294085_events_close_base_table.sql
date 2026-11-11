-- P1 events exposure, step 2 of 2 (lane D, 2026-10-29) — STAGED: apply only AFTER the production deploy that switches public readers to
-- events_public (202610294084). Close-out runbook: docs/release/CLOSE_OUT_RUNBOOK.md, post-deploy step. Old code reads settings / all
-- columns of public events through the base table and breaks once this is applied.
--   anon        base-table SELECT narrowed to the public columns (+ public_settings). Row rule unchanged (events_public_read). Keeps policy
--               subqueries and embeds such as event_distribution → events!inner(id, slug) working; settings / budget / client / goal /
--               priorities / guest counts / owner_id are denied.
--   authenticated  events_read loses its public-row branch: outsiders read public events through events_public only. Members, consumer
--               owners, ticket holders (events_ticket_holder_read), promoters, providers and admins keep exactly today's base access.
--   child-table policies that relied on the caller seeing the event row (ticket_tiers, programme_items, event_seats x2, event_days,
--               event_venues) use the definer helper event_is_public(event_id) for the public branch — same rows as today for everyone.
--   SECURITY INVOKER public RPCs (directory_events, directory_related, event_share_card, landing_page, series_page) read events_public;
--               previous_media reads events_public plus the base rows RLS lets the caller see (member previews unchanged).

-- 1. Child-table policies: public branch through the definer helper.
drop policy if exists tiers_public_read on public.ticket_tiers;
create policy tiers_public_read on public.ticket_tiers for select to anon, authenticated using (public.event_is_public(event_id));
drop policy if exists programme_public_read on public.programme_items;
create policy programme_public_read on public.programme_items for select to anon, authenticated using (kind = 'programme' and public.event_is_public(event_id));
drop policy if exists event_seats_public_read on public.event_seats;
create policy event_seats_public_read on public.event_seats for select to anon using (public.event_is_public(event_id));
drop policy if exists event_seats_member_read on public.event_seats;
create policy event_seats_member_read on public.event_seats for select to authenticated using (public.event_is_public(event_id) or public.can_access_event(event_id));
drop policy if exists event_days_read on public.event_days;
create policy event_days_read on public.event_days for select using (public.event_is_public(event_id) or exists (select 1 from public.events e where e.id = event_days.event_id));
drop policy if exists event_venues_read on public.event_venues;
create policy event_venues_read on public.event_venues for select using (public.event_is_public(event_id) or exists (select 1 from public.events e where e.id = event_venues.event_id));

-- 2. Invoker public RPCs over the public view (same signatures, same output).
CREATE OR REPLACE FUNCTION public.directory_events(p_scope text DEFAULT 'all'::text, p_key text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with base as (
    select e.id, e.name, e.slug, e.event_type, e.city, e.venue_name, e.starts_at, e.ends_at, e.timezone, e.cover_image, e.workspace_id, d.surfaces
      from public.event_distribution d join public.events_public e on e.id = d.event_id
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
$function$;

CREATE OR REPLACE FUNCTION public.directory_related(p_event uuid, p_limit integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with me as (select e.* from public.events_public e join public.event_distribution d on d.event_id = e.id where e.id = p_event and d.status = 'listed'),
  c as (
    select e.id, e.name, e.slug, e.starts_at, e.city, e.event_type, e.cover_image,
           (case when lower(e.city) = lower(m.city) then 2 else 0 end) + (case when e.event_type = m.event_type then 2 else 0 end)
         + (case when e.workspace_id = m.workspace_id then 1 else 0 end) + (case when e.venue_listing_id = m.venue_listing_id then 1 else 0 end) as score,
           array_remove(array[case when lower(e.city) = lower(m.city) then 'same_city' end, case when e.event_type = m.event_type then 'same_category' end,
             case when e.workspace_id = m.workspace_id then 'same_organizer' end, case when e.venue_listing_id = m.venue_listing_id then 'same_venue' end], null) as why
      from me m join public.event_distribution d on d.status = 'listed' and d.event_id <> m.id join public.events_public e on e.id = d.event_id
     where coalesce(e.ends_at, e.starts_at + interval '12 hours') >= now()
       and (lower(e.city) = lower(m.city) or e.event_type = m.event_type or e.workspace_id = m.workspace_id or e.venue_listing_id = m.venue_listing_id)
     order by score desc, e.starts_at, e.id limit least(greatest(coalesce(p_limit, 4), 1), 24))
  select coalesce(jsonb_agg(to_jsonb(c) order by c.score desc, c.starts_at, c.id), '[]'::jsonb) from c
$function$;

CREATE OR REPLACE FUNCTION public.event_share_card(p_event uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('title', left(e.name, 70),
      'description', left(coalesce(nullif(btrim(e.description), ''), e.name || coalesce(' · ' || e.venue_name, '') || coalesce(', ' || e.city, '')), 160),
      'url', '/events/' || coalesce(e.slug, e.id::text),
      'image', case when e.cover_image ~ '^https://[^?#]+$' or e.cover_image ~ '^/[^?#]+$' then e.cover_image when e.cover_image like 'https://%' then split_part(split_part(e.cover_image, '?', 1), '#', 1) end,
      'starts_at', e.starts_at, 'timezone', e.timezone, 'city', e.city, 'indexable', true)
    from public.events_public e join public.event_distribution d on d.event_id = e.id and d.status = 'listed' where e.id = p_event
$function$;

CREATE OR REPLACE FUNCTION public.landing_page(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case when l.id is null then null else jsonb_build_object('slug', l.slug, 'title', l.title, 'intro', l.intro,
    'hero', (select jsonb_build_object('url', a.url, 'alt_text', a.alt_text, 'credit', a.credit) from public.media_assets a where a.id = l.hero_asset_id and a.usage_scope = 'public'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'city', e.city, 'cover_image', e.cover_image) order by x.ord)
        from unnest(l.event_ids) with ordinality x(id, ord) join public.events_public e on e.id = x.id join public.event_distribution d on d.event_id = e.id and d.status = 'listed'), '[]'::jsonb),
    'sponsored', coalesce((select jsonb_agg(jsonb_build_object('event_id', f.event_id, 'label', f.label)) from public.directory_featured f
        where f.surface = 'landing' and f.surface_key = l.slug and f.kind = 'sponsored' and f.status = 'active' and now() between f.starts_at and f.ends_at), '[]'::jsonb)) end
    from (select 1) one left join public.promo_landing_pages l on l.slug = lower(p_slug) and l.status = 'published'
$function$;

CREATE OR REPLACE FUNCTION public.series_page(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'kind', s.kind, 'description', s.description, 'branding', s.branding - 'internal',
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'city', e.city, 'venue_name', e.venue_name) order by e.starts_at)
       from public.events_public e join public.event_distribution d on d.event_id = e.id and d.status = 'listed' where e.series_id = s.id), '[]'::jsonb))
    from public.event_series s where s.slug = lower(p_slug) and s.visibility = 'public' and s.status = 'active'
$function$;

CREATE OR REPLACE FUNCTION public.previous_media(p_event uuid, p_limit integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'alt_text', a.alt_text, 'credit', a.credit, 'kind', a.kind, 'event_id', a.event_id) order by a.created_at desc), '[]'::jsonb)
    from (select a.* from public.media_assets a join (select x.id, x.workspace_id from public.events_public x union select y.id, y.workspace_id from public.events y) me on me.id = p_event
           where a.usage_scope = 'public' and a.status in ('approved','published') and a.workspace_id = me.workspace_id
             and (a.subject = 'previous' or (a.event_id is not null and a.event_id <> me.id))
           order by a.created_at desc limit least(greatest(coalesce(p_limit, 24), 1), 100)) a
$function$;

-- 3. anon: public columns only on the base table.
revoke select on public.events from anon;
grant select (id, name, slug, description, event_type, starts_at, ends_at, timezone, venue_name, location, city, cover_image, tags, capacity, status, visibility, currency, venue_listing_id, series_id, series_index, occurrence_key, parent_event_id, composition_role, workspace_id, created_at, updated_at, public_settings) on public.events to anon;

-- 4. Outsiders lose the public-row branch on the base table (they use events_public).
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (
  ((workspace_id is null) and (owner_id = (select auth.uid()))) or ((workspace_id is not null) and public.is_workspace_member(workspace_id)));
