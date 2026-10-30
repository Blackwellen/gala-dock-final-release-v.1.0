-- Q06 Search, Cache & Indexing (cards 169–172, 260–264). Additive; nothing deployed reads these objects yet.
--  • search_documents: rebuildable public marketplace index (events, venues, services, organisers/providers) — full-text (tsvector,
--    english + simple), trigram titles, earthdistance geo (cube/earthdistance; PostGIS is not installed), quality flags.
--  • Indexing pipeline: row triggers on events / listings / workspaces re-index the affected documents synchronously (so a document
--    made private leaves public search in the same transaction); failures fall back to search_index_queue, drained every minute.
--    Daily reconciliation rebuilds every document from source and records drift in search_index_runs.
--  • public_search(): organic results only, and every result is re-checked against the SAME predicate as the anon RLS policy on its
--    source table at query time, so a stale index row can never leak a draft/private record. Sponsored placements stay in
--    serve_ad_slots (Q23) and are never mixed into organic ranking.
--  • Synonyms/autocomplete from Q02 master-data spellings (taxonomy_spellings) plus search_synonyms.
--  • cache_versions: invalidation counters bumped on every public index change (app cache keys include the version).
-- All functions here are service-only (the public API calls them with the service role); no anon grants.

create table if not exists public.search_documents (
  doc_type text not null check (doc_type in ('event','venue','service','organizer','provider')),
  doc_id uuid not null,
  workspace_id uuid,
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  city text, category text, tags text[] not null default '{}',
  image text, slug text, link text not null,
  lat double precision, lng double precision,
  starts_at timestamptz, price_from numeric, rating numeric,
  is_public boolean not null default false,
  tsv tsvector not null,
  quality text[] not null default '{}',
  source_updated_at timestamptz, indexed_at timestamptz not null default now(),
  primary key (doc_type, doc_id)
);
create index if not exists search_documents_tsv on public.search_documents using gin (tsv) where is_public;
create index if not exists search_documents_title_trgm on public.search_documents using gin (lower(title) gin_trgm_ops) where is_public;
create index if not exists search_documents_geo on public.search_documents using gist (ll_to_earth(lat, lng)) where is_public and lat is not null and lng is not null;
create index if not exists search_documents_type on public.search_documents(doc_type, is_public);
alter table public.search_documents enable row level security;
revoke all on table public.search_documents from public, anon, authenticated;
grant all on table public.search_documents to service_role;

create table if not exists public.search_index_queue (
  doc_type text not null, doc_id uuid not null, reason text not null default '', enqueued_at timestamptz not null default now(), attempts integer not null default 0,
  primary key (doc_type, doc_id)
);
alter table public.search_index_queue enable row level security;
revoke all on table public.search_index_queue from public, anon, authenticated;
grant all on table public.search_index_queue to service_role;

create table if not exists public.search_index_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('rebuild','reconcile','drain')),
  started_at timestamptz not null default now(), finished_at timestamptz,
  indexed integer not null default 0, removed integer not null default 0, drift integer not null default 0,
  public_docs integer, quality jsonb not null default '{}'
);
alter table public.search_index_runs enable row level security;
revoke all on table public.search_index_runs from public, anon, authenticated;
grant select on table public.search_index_runs to authenticated;
grant all on table public.search_index_runs to service_role;
drop policy if exists search_index_runs_admin on public.search_index_runs;
create policy search_index_runs_admin on public.search_index_runs for select to authenticated using (public.has_admin_permission('marketplace'));

create table if not exists public.search_synonyms (
  term text not null check (term = lower(term)), synonym text not null check (synonym = lower(synonym)),
  primary key (term, synonym)
);
insert into public.search_synonyms(term, synonym) values
  ('dj','disc jockey'), ('disc jockey','dj'), ('mc','master of ceremonies'), ('photographer','photography'), ('photography','photographer'),
  ('videographer','videography'), ('caterer','catering'), ('catering','caterer'), ('venue','hall'), ('hall','venue'), ('gig','concert'),
  ('concert','gig'), ('party','celebration'), ('wedding','reception'), ('festival','fest'), ('av','audio visual'), ('audio visual','av'),
  ('pa','sound system'), ('sound system','pa'), ('bbq','barbecue'), ('barbecue','bbq')
on conflict do nothing;
alter table public.search_synonyms enable row level security;
revoke all on table public.search_synonyms from public, anon, authenticated;
grant all on table public.search_synonyms to service_role;

create table if not exists public.cache_versions (
  scope text primary key, version bigint not null default 1, updated_at timestamptz not null default now()
);
insert into public.cache_versions(scope) values ('search:public') on conflict do nothing;
alter table public.cache_versions enable row level security;
revoke all on table public.cache_versions from public, anon, authenticated;
grant all on table public.cache_versions to service_role;
create or replace function public.cache_bump(p_scope text) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.cache_versions(scope) values (p_scope) on conflict (scope) do update set version = public.cache_versions.version + 1, updated_at = now() returning version;
$$;
create or replace function public.cache_version(p_scope text) returns bigint
language sql stable security definer set search_path = '' as $$ select coalesce((select version from public.cache_versions where scope = p_scope), 0) $$;

-- The public predicates: identical to the anon SELECT policies on the source tables.
create or replace function public.search_event_is_public(e public.events) returns boolean
language sql stable set search_path = '' as $$ select e.visibility = 'public' and e.status in ('published','on_sale','live') $$;
create or replace function public.search_listing_is_public(l public.listings) returns boolean
language sql stable set search_path = '' as $$ select l.published and l.paused_at is null $$;

create or replace function public.search_tsv(p_title text, p_rest text) returns tsvector
language sql immutable set search_path = '' as $$
  select setweight(to_tsvector('english', coalesce(p_title, '')), 'A') || setweight(to_tsvector('simple', coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_rest, '')), 'C')
$$;

-- (Re)index one document from its source. Returns true when a public document exists afterwards.
create or replace function public.search_index_document(p_type text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.events; l public.listings; w public.workspaces; pub boolean := false; q text[]; before_pub boolean; after_pub boolean;
begin
  select is_public into before_pub from public.search_documents where doc_type = p_type and doc_id = p_id;
  if p_type = 'event' then
    select * into e from public.events where id = p_id;
    if e.id is null then delete from public.search_documents where doc_type = 'event' and doc_id = p_id;
    else
      pub := public.search_event_is_public(e);
      q := array_remove(array[case when e.cover_image is null then 'missing_image' end, case when coalesce(e.city, e.location) is null then 'missing_city' end,
             case when e.starts_at is null then 'missing_date' end, case when length(coalesce(e.description, '')) < 40 then 'thin_description' end], null);
      insert into public.search_documents as d(doc_type, doc_id, workspace_id, title, subtitle, body, city, category, tags, image, slug, link, lat, lng, starts_at, is_public, tsv, quality, source_updated_at, indexed_at)
      select 'event', e.id, e.workspace_id, e.name, coalesce(to_char(e.starts_at at time zone 'Europe/London', 'DD Mon YYYY'), 'Date TBC') || coalesce(' · ' || coalesce(e.venue_name, e.city), ''),
             left(coalesce(e.description, ''), 4000), e.city, e.event_type, coalesce(e.tags, '{}'), e.cover_image, e.slug, '/events/' || coalesce(e.slug, e.id::text),
             vl.lat, vl.lng, e.starts_at, pub,
             public.search_tsv(e.name, concat_ws(' ', e.event_type, e.city, e.venue_name, e.location, array_to_string(e.tags, ' '), left(e.description, 2000))), q, e.updated_at, now()
        from (select 1) x left join public.listings vl on vl.id = e.venue_listing_id
      on conflict (doc_type, doc_id) do update set workspace_id = excluded.workspace_id, title = excluded.title, subtitle = excluded.subtitle, body = excluded.body, city = excluded.city,
        category = excluded.category, tags = excluded.tags, image = excluded.image, slug = excluded.slug, link = excluded.link, lat = excluded.lat, lng = excluded.lng,
        starts_at = excluded.starts_at, is_public = excluded.is_public, tsv = excluded.tsv, quality = excluded.quality, source_updated_at = excluded.source_updated_at, indexed_at = now();
    end if;
  elsif p_type in ('venue','service') then
    select * into l from public.listings where id = p_id;
    if l.id is null then delete from public.search_documents where doc_type in ('venue','service') and doc_id = p_id;
    else
      delete from public.search_documents where doc_id = p_id and doc_type in ('venue','service') and doc_type <> case when l.kind = 'venue' then 'venue' else 'service' end;
      pub := public.search_listing_is_public(l);
      q := array_remove(array[case when l.image is null then 'missing_image' end, case when l.city is null then 'missing_city' end,
             case when l.lat is null or l.lng is null then 'missing_geo' end, case when l.price_from is null then 'missing_price' end,
             case when length(coalesce(l.description, '')) < 40 then 'thin_description' end], null);
      insert into public.search_documents(doc_type, doc_id, workspace_id, title, subtitle, body, city, category, tags, image, slug, link, lat, lng, price_from, rating, is_public, tsv, quality, source_updated_at, indexed_at)
      values (case when l.kind = 'venue' then 'venue' else 'service' end, l.id, l.workspace_id, l.name, concat_ws(' · ', l.category, l.city), left(coalesce(l.description, ''), 4000),
              l.city, l.category, coalesce(l.tags, '{}'), l.image, l.slug, '/' || case when l.kind = 'venue' then 'venues' else 'services' end || '/' || coalesce(l.slug, l.id::text),
              l.lat, l.lng, l.price_from, l.rating, pub,
              public.search_tsv(l.name, concat_ws(' ', l.category, l.kind, l.city, l.location, array_to_string(l.tags, ' '), left(l.description, 2000))), q, l.updated_at, now())
      on conflict (doc_type, doc_id) do update set workspace_id = excluded.workspace_id, title = excluded.title, subtitle = excluded.subtitle, body = excluded.body, city = excluded.city,
        category = excluded.category, tags = excluded.tags, image = excluded.image, slug = excluded.slug, link = excluded.link, lat = excluded.lat, lng = excluded.lng,
        price_from = excluded.price_from, rating = excluded.rating, is_public = excluded.is_public, tsv = excluded.tsv, quality = excluded.quality, source_updated_at = excluded.source_updated_at, indexed_at = now();
    end if;
  elsif p_type in ('organizer','provider') then
    select * into w from public.workspaces where id = p_id;
    if w.id is null or w.kind not in ('organizer','provider') then delete from public.search_documents where doc_type in ('organizer','provider') and doc_id = p_id;
    else
      -- A workspace is publicly discoverable only through public records: a provider with a public listing, an organiser with a public event.
      pub := coalesce(w.status, 'active') = 'active' and case when w.kind = 'provider'
        then exists (select 1 from public.listings x where x.workspace_id = w.id and public.search_listing_is_public(x))
        else exists (select 1 from public.events x where x.workspace_id = w.id and public.search_event_is_public(x)) end;
      insert into public.search_documents(doc_type, doc_id, workspace_id, title, subtitle, link, is_public, tsv, quality, indexed_at)
      values (w.kind, w.id, w.id, w.name, case when w.kind = 'provider' then 'Provider' else 'Organiser' end, '/organizers/' || w.id, pub, public.search_tsv(w.name, w.kind), '{}', now())
      on conflict (doc_type, doc_id) do update set title = excluded.title, subtitle = excluded.subtitle, link = excluded.link, is_public = excluded.is_public, tsv = excluded.tsv, indexed_at = now();
    end if;
  else raise exception 'invalid_doc_type' using errcode = '22023';
  end if;
  select is_public into after_pub from public.search_documents where doc_type = p_type and doc_id = p_id;
  if coalesce(before_pub, false) or coalesce(after_pub, false) then perform public.cache_bump('search:public'); end if;
  return coalesce(after_pub, false);
end $$;

-- Pipeline triggers: synchronous re-index; on any failure the document is queued instead (writes are never blocked).
create or replace function public.trg_search_index() returns trigger language plpgsql security definer set search_path = '' as $$
declare t text; id uuid; ws uuid;
begin
  if tg_table_name = 'events' then t := 'event'; id := coalesce(new.id, old.id); ws := coalesce(new.workspace_id, old.workspace_id);
  elsif tg_table_name = 'listings' then t := case when coalesce(new.kind, old.kind) = 'venue' then 'venue' else 'service' end; id := coalesce(new.id, old.id); ws := coalesce(new.workspace_id, old.workspace_id);
  else t := coalesce(new.kind, old.kind); id := coalesce(new.id, old.id); ws := null; end if;
  begin
    perform public.search_index_document(t, id);
    if ws is not null then perform public.search_index_document(k.kind, ws) from public.workspaces k where k.id = ws and k.kind in ('organizer','provider'); end if;
  exception when others then
    insert into public.search_index_queue(doc_type, doc_id, reason) values (t, id, left(sqlerrm, 200)) on conflict (doc_type, doc_id) do update set enqueued_at = now(), reason = excluded.reason;
  end;
  return null;
end $$;
drop trigger if exists gd_search_index on public.events;
create trigger gd_search_index after insert or delete or update of name, visibility, status, starts_at, city, venue_name, location, description, cover_image, slug, tags, event_type, venue_listing_id, workspace_id
  on public.events for each row execute function public.trg_search_index();
drop trigger if exists gd_search_index on public.listings;
create trigger gd_search_index after insert or delete or update of name, kind, published, paused_at, category, city, location, description, image, slug, tags, lat, lng, price_from, rating, workspace_id
  on public.listings for each row execute function public.trg_search_index();
drop trigger if exists gd_search_index on public.workspaces;
create trigger gd_search_index after insert or delete or update of name, kind, status on public.workspaces for each row execute function public.trg_search_index();

-- Query expansion: master-data spellings (Q02) + synonyms → OR-ed prefix tsquery.
create or replace function public.search_query(p_q text) returns tsquery
language plpgsql stable security definer set search_path = '' as $$
declare words text[]; w text; parts text[] := '{}'; alts text[]; q text := lower(trim(regexp_replace(coalesce(p_q, ''), '[^[:alnum:][:space:]&-]', ' ', 'g')));
begin
  if q = '' then return null; end if;
  words := regexp_split_to_array(q, '\s+');
  foreach w in array words loop
    if length(w) < 1 then continue; end if;
    alts := array[w] || coalesce((select array_agg(distinct s.synonym) from public.search_synonyms s where s.term = w), '{}')
      || coalesce((select array_agg(distinct lower(t.label)) from public.taxonomy_spellings sp join public.taxonomy_terms t on t.taxonomy = sp.taxonomy and t.key = sp.key
                    where sp.spelling = w and lower(t.label) <> w), '{}');
    parts := parts || ('(' || (select string_agg(case when a ~ '\s' then '(' || array_to_string(array(select quote_literal(x) || ':*' from unnest(regexp_split_to_array(a, '\s+')) x), ' & ') || ')' else quote_literal(a) || ':*' end, ' | ') from unnest(alts) a) || ')');
  end loop;
  return to_tsquery('simple', array_to_string(parts, ' & '));
exception when others then return plainto_tsquery('simple', q);
end $$;

-- Public, signed-out discovery: organic only, live public predicate re-checked, optional type / geo radius / upcoming filter.
create or replace function public.public_search(p_q text, p_types text[] default null, p_lat double precision default null, p_lng double precision default null,
  p_radius_km integer default null, p_limit integer default 20, p_offset integer default 0)
returns table (doc_type text, doc_id uuid, title text, subtitle text, link text, image text, city text, category text, starts_at timestamptz, price_from numeric,
  distance_km numeric, score real)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tq tsquery := public.search_query(p_q); q text := lower(trim(coalesce(p_q, ''))); lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  return query
  select d.doc_type, d.doc_id, d.title, d.subtitle, d.link, d.image, d.city, d.category, d.starts_at, d.price_from,
         case when p_lat is not null and p_lng is not null and d.lat is not null then round((earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(d.lat, d.lng)) / 1000)::numeric, 1) end,
         (case when tq is not null then ts_rank(d.tsv, tq) else 0 end + case when q <> '' then similarity(lower(d.title), q) else 0 end
           + case when d.doc_type = 'event' and d.starts_at > now() then 0.05 else 0 end - 0.02 * coalesce(cardinality(d.quality), 0))::real s
    from public.search_documents d
   where d.is_public
     and (p_types is null or d.doc_type = any(p_types))
     and (q = '' or (tq is not null and d.tsv @@ tq) or lower(d.title) % q or lower(d.title) like '%' || q || '%')
     and (p_lat is null or p_lng is null or p_radius_km is null or (d.lat is not null and earth_box(ll_to_earth(p_lat, p_lng), p_radius_km * 1000.0) @> ll_to_earth(d.lat, d.lng)
          and earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(d.lat, d.lng)) <= p_radius_km * 1000.0))
     -- Defence in depth: the source row must still satisfy its anon RLS predicate right now.
     and case d.doc_type
           when 'event' then exists (select 1 from public.events e where e.id = d.doc_id and public.search_event_is_public(e))
           when 'venue' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
           when 'service' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
           when 'provider' then exists (select 1 from public.listings l where l.workspace_id = d.doc_id and public.search_listing_is_public(l))
           when 'organizer' then exists (select 1 from public.events e where e.workspace_id = d.doc_id and public.search_event_is_public(e))
           else false end
   order by s desc, d.title
   limit lim offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.public_autocomplete(p_prefix text, p_limit integer default 8) returns table (label text, kind text, link text)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select lower(trim(coalesce(p_prefix, ''))) p)
  (select d.title, d.doc_type, d.link from public.search_documents d, q
    where length(q.p) >= 2 and d.is_public and lower(d.title) like q.p || '%'
      and case d.doc_type when 'event' then exists (select 1 from public.events e where e.id = d.doc_id and public.search_event_is_public(e))
                          when 'venue' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
                          when 'service' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
                          else true end
    order by d.title limit greatest(1, least(coalesce(p_limit, 8), 20)))
  union all
  (select distinct t.label, 'category', null::text from public.taxonomy_terms t, q
    where length(q.p) >= 2 and t.taxonomy in ('service_category','venue_type','event_type') and not t.deprecated and lower(t.label) like q.p || '%' limit 5);
$$;

-- Rebuild / reconcile / drain jobs (db runtime) -----------------------------------------------------------------------------------
create or replace function public.search_rebuild(p_kind text default 'rebuild') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run_id bigint; n integer := 0; v_removed integer := 0; v_drift integer := 0; r record; was boolean; now_pub boolean; qual jsonb;
begin
  insert into public.search_index_runs(kind) values (p_kind) returning id into run_id;
  for r in select 'event'::text t, id from public.events union all select case when kind = 'venue' then 'venue' else 'service' end, id from public.listings
           union all select kind, id from public.workspaces where kind in ('organizer','provider') loop
    select is_public into was from public.search_documents where doc_type = r.t and doc_id = r.id;
    now_pub := public.search_index_document(r.t, r.id);
    if was is distinct from now_pub then v_drift := v_drift + 1; end if;
    n := n + 1;
  end loop;
  with gone as (delete from public.search_documents d where (d.doc_type = 'event' and not exists (select 1 from public.events e where e.id = d.doc_id))
      or (d.doc_type in ('venue','service') and not exists (select 1 from public.listings l where l.id = d.doc_id))
      or (d.doc_type in ('organizer','provider') and not exists (select 1 from public.workspaces w where w.id = d.doc_id)) returning 1)
  select count(*) into v_removed from gone;
  delete from public.search_index_queue;
  select jsonb_build_object('by_flag', coalesce((select jsonb_object_agg(f, c) from (select unnest(quality) f, count(*) c from public.search_documents where is_public group by 1) x), '{}'::jsonb),
         'duplicate_titles', (select count(*) from (select lower(title), city from public.search_documents where is_public group by 1, 2 having count(*) > 1) y),
         'public_by_type', coalesce((select jsonb_object_agg(doc_type, c) from (select doc_type, count(*) c from public.search_documents where is_public group by 1) z), '{}'::jsonb)) into qual;
  update public.search_index_runs set finished_at = now(), indexed = n, removed = v_removed, drift = v_drift,
    public_docs = (select count(*) from public.search_documents where is_public), quality = qual where id = run_id;
  perform public.cache_bump('search:public');
  return jsonb_build_object('run', run_id, 'indexed', n, 'removed', v_removed, 'drift', v_drift, 'quality', qual);
end $$;
create or replace function public.job_search_reconcile(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return public.search_rebuild('reconcile'); end $$;
create or replace function public.job_search_drain(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select * from public.search_index_queue order by enqueued_at limit 500 for update skip locked loop
    begin perform public.search_index_document(r.doc_type, r.doc_id); delete from public.search_index_queue where doc_type = r.doc_type and doc_id = r.doc_id; n := n + 1;
    exception when others then update public.search_index_queue set attempts = attempts + 1, reason = left(sqlerrm, 200) where doc_type = r.doc_type and doc_id = r.doc_id; end;
  end loop;
  return jsonb_build_object('indexed', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('search.reconcile', 'db', 'public.job_search_reconcile', 3, 'Q06: daily full re-index from source with drift + data-quality baseline (search_index_runs)'),
  ('search.drain', 'db', 'public.job_search_drain', 3, 'Q06: re-index documents whose synchronous trigger re-index failed (search_index_queue)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();
select cron.unschedule('search-reconcile') where exists (select 1 from cron.job where jobname = 'search-reconcile');
select cron.schedule('search-reconcile', '50 2 * * *',
  $$select public.enqueue_job(p_kind => 'search.reconcile', p_payload => '{}'::jsonb, p_dedupe_key => 'search.reconcile:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);
select cron.unschedule('search-drain') where exists (select 1 from cron.job where jobname = 'search-drain');
select cron.schedule('search-drain', '*/5 * * * *',
  $$select public.enqueue_job(p_kind => 'search.drain', p_payload => '{}'::jsonb, p_dedupe_key => 'search.drain:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')) where exists (select 1 from public.search_index_queue)$$);

-- Grants (Q01): service-only.
do $$ declare f text; begin
  foreach f in array array['public.cache_bump(text)','public.cache_version(text)','public.search_event_is_public(public.events)','public.search_listing_is_public(public.listings)',
    'public.search_tsv(text, text)','public.search_index_document(text, uuid)','public.trg_search_index()','public.search_query(text)',
    'public.public_search(text, text[], double precision, double precision, integer, integer, integer)','public.public_autocomplete(text, integer)',
    'public.search_rebuild(text)','public.job_search_reconcile(public.job_queue)','public.job_search_drain(public.job_queue)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Initial build.
select public.search_rebuild('rebuild');
