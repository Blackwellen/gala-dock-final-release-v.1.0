-- Q02 (lane A): canonical configuration and master data (backend spec domains 25 Configuration, 264 Master Data).
-- One definition (src/lib/master-data/catalog.ts) mirrored here for SQL validation: event/venue/service taxonomies,
-- build and planning categories, amenities, countries/regions, currencies and timezones. Stored rows are NOT rewritten:
-- legacy free-text values resolve through taxonomy_spellings (taxonomy_resolve) and the security-invoker view
-- listing_taxonomy. Plan capabilities stay in plan_entitlements; legal/payment rule versions stay in the versioned
-- platform_settings store (new 'legal' section, setting_at() for point-in-time resolution). Additive and idempotent.

-- ═══ 1. Reference tables (public reference data: readable by everyone, written only by migrations / service role) ═══
create table if not exists public.taxonomies (
  taxonomy text primary key check (taxonomy ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  description text not null default '',
  catalog_version integer not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.taxonomy_terms (
  taxonomy text not null references public.taxonomies(taxonomy) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(label) between 1 and 80),
  plural text,
  parent_key text,
  sort integer not null default 0,
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object'),
  deprecated boolean not null default false,
  catalog_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (taxonomy, key),
  foreign key (taxonomy, parent_key) references public.taxonomy_terms(taxonomy, key) deferrable initially deferred
);
-- Every accepted spelling (key, label, plural, legacy alias, screen wording), normalised by taxonomy_norm().
create table if not exists public.taxonomy_spellings (
  taxonomy text not null,
  spelling text not null,
  key text not null,
  primary key (taxonomy, spelling),
  foreign key (taxonomy, key) references public.taxonomy_terms(taxonomy, key) on delete cascade
);
create table if not exists public.ref_currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  minor_units integer not null default 2 check (minor_units between 0 and 4),
  transactional boolean not null default false,   -- may be charged, invoiced and stored on events/workspaces
  active boolean not null default true,
  sort integer not null default 0,
  catalog_version integer not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ref_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null unique,
  region text not null check (region in ('uk','eu','na','mea','apac')),
  currency text not null references public.ref_currencies(code),
  tax_options text[] not null default '{}',
  business boolean not null default false,        -- offered for business onboarding (locale, tax, payouts)
  active boolean not null default true,
  sort integer not null default 0,
  catalog_version integer not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ref_timezones (
  tz text primary key,
  label text not null,
  country text not null references public.ref_countries(code),
  active boolean not null default true,
  sort integer not null default 0,
  catalog_version integer not null,
  updated_at timestamptz not null default now()
);
create index if not exists taxonomy_terms_parent_idx on public.taxonomy_terms(taxonomy, parent_key) where parent_key is not null;

do $$ declare t text; begin
  foreach t in array array['taxonomies','taxonomy_terms','taxonomy_spellings','ref_currencies','ref_countries','ref_timezones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_read on public.%1$I', t);
    execute format('create policy %1$s_read on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ═══ 2. Resolution and validation helpers (mirror src/lib/master-data) ═══
create or replace function public.taxonomy_norm(p text) returns text language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(normalize(coalesce(p, ''), NFKC), '’‘`', '''''''')), '[[:space:]_-]+', ' ', 'g'));
$$;

-- Canonical key for any stored value: exact spelling, then the most specific part of a nested value, then its top level.
create or replace function public.taxonomy_resolve(p_taxonomy text, p_value text) returns text language sql stable parallel safe set search_path = '' as $$
  with parts as (select regexp_split_to_array(btrim(coalesce(p_value, '')), '[[:space:]]*[>/|][[:space:]]*') a)
  select coalesce(
    (select s.key from public.taxonomy_spellings s where s.taxonomy = p_taxonomy and s.spelling = public.taxonomy_norm(p_value)),
    (select s.key from public.taxonomy_spellings s, parts where s.taxonomy = p_taxonomy and s.spelling = public.taxonomy_norm(parts.a[array_length(parts.a, 1)])),
    (select s.key from public.taxonomy_spellings s, parts where s.taxonomy = p_taxonomy and s.spelling = public.taxonomy_norm(parts.a[1])))
  where nullif(btrim(coalesce(p_value, '')), '') is not null;
$$;

create or replace function public.is_currency(p_code text, p_transactional boolean default false) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.ref_currencies c where c.code = p_code and c.active and (c.transactional or not p_transactional));
$$;

-- Offered pickers use ref_timezones; free-text settings accept any IANA zone the database knows.
create or replace function public.is_timezone(p_tz text, p_offered_only boolean default false) returns boolean language sql stable set search_path = '' as $$
  select case when p_offered_only then exists (select 1 from public.ref_timezones z where z.tz = p_tz and z.active)
    else exists (select 1 from public.ref_timezones z where z.tz = p_tz and z.active) or exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) end;
$$;

-- Build category a supplier category fills (venues always 'venue'; unknown → 'extras'). Mirrors buildCategoryOf().
create or replace function public.build_category_of(p_kind text, p_category text) returns text language sql stable set search_path = '' as $$
  select case when p_kind = 'venue' then 'venue' else coalesce(
    (select t.meta ->> 'build' from public.taxonomy_terms t where t.taxonomy = 'service_category' and t.key = public.taxonomy_resolve('service_category', p_category)), 'extras') end;
$$;

revoke all on function public.taxonomy_norm(text), public.taxonomy_resolve(text, text), public.is_currency(text, boolean), public.is_timezone(text, boolean), public.build_category_of(text, text) from public, anon, authenticated;
grant execute on function public.taxonomy_norm(text), public.taxonomy_resolve(text, text), public.is_currency(text, boolean), public.is_timezone(text, boolean), public.build_category_of(text, text) to anon, authenticated, service_role;

-- ═══ 3. Compatibility projection: canonical keys for legacy free-text listing categories (RLS of listings applies) ═══
create or replace view public.listing_taxonomy with (security_invoker = true) as
  select l.id as listing_id, l.kind, l.category as raw_category,
    case when l.kind = 'venue' then public.taxonomy_resolve('venue_type', coalesce(nullif(l.details ->> 'type', ''), l.category)) end as venue_type,
    case when l.kind = 'service' then public.taxonomy_resolve('service_category', l.category) end as service_category,
    public.build_category_of(l.kind, l.category) as build_category
  from public.listings l;
revoke all on public.listing_taxonomy from anon, authenticated;
grant select on public.listing_taxonomy to anon, authenticated;

-- ═══ 4. Validators use master data instead of hard-coded lists ═══
-- Same body as 202610140010 except: currency must be a transactional master-data currency (was the literal GBP/EUR/USD
-- list — identical set today) and a non-empty timezone must be a real IANA zone.
create or replace function public.update_workspace_settings(p_ws uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed text[] := array['description','legal_name','registration','vat','address','country','currency','timezone','date_format','time_format','contact_email','contact_phone','website','notifications','agent','brand_color'];
  k text; clean jsonb := '{}';
begin
  if not public.has_workspace_role(p_ws, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 20000 then raise exception 'invalid' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p) loop
    if k = any(allowed) then clean := clean || jsonb_build_object(k, p->k); end if;
  end loop;
  if clean ? 'contact_email' and coalesce(clean->>'contact_email', '') <> '' and (clean->>'contact_email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if clean ? 'currency' and not public.is_currency(clean->>'currency', true) then raise exception 'invalid_currency' using errcode = '22023'; end if;
  if clean ? 'timezone' and coalesce(clean->>'timezone', '') <> '' and not public.is_timezone(clean->>'timezone') then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  update public.workspaces set settings = coalesce(settings, '{}') || clean,
    name = case when p ? 'name' and length(trim(p->>'name')) between 2 and 80 then trim(p->>'name') else name end,
    cover_image = case when p ? 'cover_image' and (p->>'cover_image') ~ '^(/assets/|https://)' then p->>'cover_image' else cover_image end
  where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'workspace.settings_updated', jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(clean) x)));
end $$;
revoke all on function public.update_workspace_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_workspace_settings(uuid, jsonb) to authenticated;

-- ═══ 5. Legal / payment rule versions: reuse the versioned platform_settings store ═══
alter table public.platform_settings drop constraint if exists platform_settings_section_check;
alter table public.platform_settings add constraint platform_settings_section_check check (section = any (array[
  'general','commerce','marketplace','ticketing','trust','agent','communications','integrations','flags','residency','legal']));
-- Legal document versions (mirrors src/lib/legal.ts LEGAL.version / effective; profiles.terms_version records acceptance).
insert into public.platform_settings(section, version, status, value, effective_at, change_reason)
select 'legal', 1, 'published', jsonb_build_object(
    'terms_version', '2026-10', 'effective_date', '2026-10-12',
    'documents', jsonb_build_array(
      jsonb_build_object('slug', 'terms', 'title', 'Terms of Service', 'version', '2026-10'),
      jsonb_build_object('slug', 'privacy', 'title', 'Privacy Policy', 'version', '2026-10'),
      jsonb_build_object('slug', 'ticket-terms', 'title', 'Ticket Purchase & Resale Terms', 'version', '2026-10'),
      jsonb_build_object('slug', 'cookies', 'title', 'Cookie Policy', 'version', '2026-10'),
      jsonb_build_object('slug', 'data-retention', 'title', 'Data Retention Schedule', 'version', '2026-10'))),
  '2026-10-12 00:00:00+00', 'Q02: legal document versions registered as versioned configuration'
where not exists (select 1 from public.platform_settings where section = 'legal');

-- Rules engine primitive: the configuration version that was in force at a moment (for snapshots, disputes and audits).
-- Published and superseded rows are history; drafts never apply.
create or replace function public.setting_at(p_section text, p_at timestamptz default now())
returns table (version integer, value jsonb, effective_at timestamptz) language sql stable security definer set search_path = '' as $$
  select s.version, s.value, coalesce(s.effective_at, s.created_at)
  from public.platform_settings s
  where s.section = p_section and s.status in ('published','superseded') and coalesce(s.effective_at, s.created_at) <= p_at
  order by coalesce(s.effective_at, s.created_at) desc, s.version desc limit 1;
$$;
revoke all on function public.setting_at(text, timestamptz) from public, anon, authenticated;
grant execute on function public.setting_at(text, timestamptz) to service_role;

-- Current legal version for signed-in surfaces and server code (sign-up itself uses LEGAL.version from src/lib/legal.ts).
create or replace function public.legal_terms_version() returns text language sql stable security definer set search_path = '' as $$
  select value ->> 'terms_version' from public.platform_settings where section = 'legal' and status = 'published' order by version desc limit 1;
$$;
revoke all on function public.legal_terms_version() from public, anon;
grant execute on function public.legal_terms_version() to authenticated, service_role;

-- ═══ 6. Plan capabilities: plan_entitlements stays canonical for limits; commission comes from published commerce ═══
-- The seeded entitlement commission rows (12/10/8/6%) contradicted the published fee schedule (8/7/6/6%, plan_commission_bps)
-- and nothing reads them. Align the mirror; master_data_audit() reports any future drift.
update public.plan_entitlements e set value = to_jsonb(public.plan_commission_bps(e.plan)), updated_at = now()
where e.capability = 'commission.rate_bps' and e.value is distinct from to_jsonb(public.plan_commission_bps(e.plan));

-- ═══ 7. Data-quality check (backend spec §22): stored values that do not resolve to master data ═══
create or replace function public.master_data_audit() returns table (check_name text, detail text, rows bigint)
language sql stable security definer set search_path = '' as $$
  select 'events.event_type', e.event_type, count(*) from public.events e where public.taxonomy_resolve('event_type', e.event_type) is null group by e.event_type
  union all select 'events.currency', e.currency, count(*) from public.events e where not public.is_currency(e.currency) group by e.currency
  union all select 'events.timezone', e.timezone, count(*) from public.events e where not public.is_timezone(e.timezone) group by e.timezone
  union all select 'listings.service_category', l.category, count(*) from public.listings l where l.kind = 'service' and nullif(l.category, '') is not null and public.taxonomy_resolve('service_category', l.category) is null group by l.category
  union all select 'listings.venue_type', l.category, count(*) from public.listings l where l.kind = 'venue' and nullif(l.category, '') is not null and public.taxonomy_resolve('venue_type', l.category) is null group by l.category
  union all select 'build_items.category', b.category, count(*) from public.build_items b where public.taxonomy_resolve('build_category', b.category) is null and public.taxonomy_resolve('service_category', b.category) is null group by b.category
  union all select 'workspaces.settings.currency', w.settings ->> 'currency', count(*) from public.workspaces w where w.settings ? 'currency' and not public.is_currency(w.settings ->> 'currency') group by 2
  union all select 'plan_entitlements.commission.rate_bps', e.kind || '/' || e.plan, 1 from public.plan_entitlements e where e.capability = 'commission.rate_bps' and e.value is distinct from to_jsonb(public.plan_commission_bps(e.plan))
  union all select 'legal.terms_version', coalesce(public.legal_terms_version(), '(missing)'), 1 where public.legal_terms_version() is null;
$$;
revoke all on function public.master_data_audit() from public, anon, authenticated;
grant execute on function public.master_data_audit() to service_role;

-- ═══ 8. Seed ═══
-- ═══ GENERATED by scripts/gen-master-data-sql.mjs from src/lib/master-data/catalog.ts (catalog v1) — do not edit by hand ═══
insert into public.taxonomies(taxonomy, label, description, catalog_version) values
  ('event_type', 'Event types', 'What kind of event an event, listing, package or template is for (events.event_type).', 1),
  ('venue_type', 'Venue types', 'What kind of venue a venue listing is (listings.category for kind = venue; details.type).', 1),
  ('service_category', 'Service categories', 'What a supplier offers (listings.category for kind = service). Nested values like ''Entertainment > DJ'' resolve by their most specific part.', 1),
  ('build_category', 'Build categories', 'What a build line fills in an event plan (build_items.category).', 1),
  ('plan_need', 'Planning needs', 'Customer Plan-an-Event must-haves and optional extras.', 1),
  ('amenity', 'Venue amenities', 'Venue-level amenities captured at onboarding (listings.details.amenities).', 1)
on conflict (taxonomy) do update set label = excluded.label, description = excluded.description, catalog_version = excluded.catalog_version, updated_at = now();
insert into public.taxonomy_terms(taxonomy, key, label, plural, parent_key, sort, meta, deprecated, catalog_version) values
  ('event_type', 'wedding', 'Wedding', 'Weddings', null, 1, '{"img":"type-wedding"}'::jsonb, false, 1),
  ('event_type', 'birthday', 'Birthday', 'Birthdays', null, 2, '{"img":"type-birthday"}'::jsonb, false, 1),
  ('event_type', 'corporate', 'Corporate Event', 'Corporate Events', null, 3, '{"img":"type-corporate"}'::jsonb, false, 1),
  ('event_type', 'party', 'Party', 'Parties', null, 4, '{"img":"type-party"}'::jsonb, false, 1),
  ('event_type', 'private_party', 'Private Party', 'Private Parties', null, 5, '{}'::jsonb, false, 1),
  ('event_type', 'festival', 'Festival', 'Festivals', null, 6, '{"img":"type-festival"}'::jsonb, false, 1),
  ('event_type', 'nightlife', 'Nightclub', 'Nightclubs', null, 7, '{"img":"type-nightclub"}'::jsonb, false, 1),
  ('event_type', 'concert', 'Concert / Live Show', 'Concerts & Live Shows', null, 8, '{}'::jsonb, false, 1),
  ('event_type', 'private_dinner', 'Private Dinner', 'Private Dinners', null, 9, '{"img":"type-private_dinner"}'::jsonb, false, 1),
  ('event_type', 'childrens_party', 'Children''s Party', 'Children''s Parties', null, 10, '{"img":"type-childrens_party"}'::jsonb, false, 1),
  ('event_type', 'conference', 'Conference', 'Conferences', null, 11, '{}'::jsonb, false, 1),
  ('event_type', 'exhibition', 'Exhibition', 'Exhibitions', null, 12, '{}'::jsonb, false, 1),
  ('event_type', 'product_launch', 'Product Launch', 'Product Launches', null, 13, '{}'::jsonb, false, 1),
  ('event_type', 'awards', 'Awards', 'Awards', null, 14, '{}'::jsonb, false, 1),
  ('event_type', 'gala', 'Gala', 'Galas', null, 15, '{}'::jsonb, false, 1),
  ('event_type', 'community', 'Community', 'Community Events', null, 16, '{}'::jsonb, false, 1),
  ('event_type', 'food_drink', 'Food & Drink', 'Food & Drink', null, 17, '{}'::jsonb, false, 1),
  ('event_type', 'comedy', 'Comedy', 'Comedy', null, 18, '{}'::jsonb, false, 1),
  ('event_type', 'webinar', 'Webinar / Virtual', 'Remote / Hybrid', null, 19, '{}'::jsonb, false, 1),
  ('event_type', 'networking', 'Networking', 'Networking', null, 20, '{}'::jsonb, false, 1),
  ('event_type', 'theatre', 'Theatre', 'Theatre', null, 21, '{}'::jsonb, false, 1),
  ('event_type', 'sports', 'Sports', 'Sports', null, 22, '{}'::jsonb, false, 1),
  ('event_type', 'charity', 'Charity / Fundraiser', 'Charity / Fundraisers', null, 23, '{}'::jsonb, false, 1),
  ('event_type', 'arts', 'Art & Culture', 'Arts & Culture', null, 24, '{}'::jsonb, false, 1),
  ('event_type', 'religious', 'Faith & Cultural', 'Faith & Cultural', null, 25, '{}'::jsonb, false, 1),
  ('event_type', 'graduation', 'Graduation / Prom', 'Graduations', null, 26, '{}'::jsonb, false, 1),
  ('event_type', 'seasonal', 'Seasonal / Holiday', 'Seasonal / Holiday', null, 27, '{}'::jsonb, false, 1),
  ('event_type', 'family', 'Family', 'Family & Kids', null, 28, '{}'::jsonb, false, 1),
  ('event_type', 'production', 'Production', 'Productions', null, 29, '{}'::jsonb, false, 1),
  ('event_type', 'custom', 'Something else', 'Mixed / Custom', null, 30, '{}'::jsonb, false, 1),
  ('venue_type', 'event_hall', 'Event hall', 'Event halls', null, 1, '{}'::jsonb, false, 1),
  ('venue_type', 'hotel', 'Hotel', 'Hotels', null, 2, '{}'::jsonb, false, 1),
  ('venue_type', 'conference_centre', 'Conference centre', 'Conference centres', null, 3, '{}'::jsonb, false, 1),
  ('venue_type', 'outdoor', 'Outdoor venue', 'Outdoor venues', null, 4, '{}'::jsonb, false, 1),
  ('venue_type', 'bar_nightclub', 'Bar or nightclub', 'Bars & nightclubs', null, 5, '{}'::jsonb, false, 1),
  ('venue_type', 'restaurant', 'Restaurant', 'Restaurants', null, 6, '{}'::jsonb, false, 1),
  ('venue_type', 'unique_space', 'Unique space', 'Unique spaces', null, 7, '{}'::jsonb, false, 1),
  ('venue_type', 'arena_stadium', 'Arena or stadium', 'Arenas & stadiums', null, 8, '{}'::jsonb, false, 1),
  ('venue_type', 'studio', 'Studio', 'Studios', null, 9, '{}'::jsonb, false, 1),
  ('venue_type', 'other', 'Other', 'Other venues', null, 10, '{}'::jsonb, false, 1),
  ('service_category', 'catering', 'Catering', null, null, 1, '{"build":"food"}'::jsonb, false, 1),
  ('service_category', 'catering_full', 'Full service', null, 'catering', 2, '{"build":"food"}'::jsonb, false, 1),
  ('service_category', 'street_food', 'Street food', null, 'catering', 3, '{"build":"food"}'::jsonb, false, 1),
  ('service_category', 'private_chef', 'Private chef', null, 'catering', 4, '{"build":"food"}'::jsonb, false, 1),
  ('service_category', 'drinks', 'Drinks & bar', null, null, 5, '{"build":"drinks"}'::jsonb, false, 1),
  ('service_category', 'mobile_bar', 'Mobile bar', null, 'drinks', 6, '{"build":"drinks"}'::jsonb, false, 1),
  ('service_category', 'entertainment', 'Entertainment', null, null, 7, '{"build":"entertainment"}'::jsonb, false, 1),
  ('service_category', 'dj', 'DJ', null, 'entertainment', 8, '{"build":"entertainment"}'::jsonb, false, 1),
  ('service_category', 'live_music', 'Live music', null, 'entertainment', 9, '{"build":"entertainment"}'::jsonb, false, 1),
  ('service_category', 'performers', 'Performers', null, 'entertainment', 10, '{"build":"entertainment"}'::jsonb, false, 1),
  ('service_category', 'media', 'Photography & video', null, null, 11, '{"build":"media"}'::jsonb, false, 1),
  ('service_category', 'photography', 'Photography', null, 'media', 12, '{"build":"media"}'::jsonb, false, 1),
  ('service_category', 'videography', 'Videography', null, 'media', 13, '{"build":"media"}'::jsonb, false, 1),
  ('service_category', 'photo_booth', 'Photo booth', null, 'media', 14, '{"build":"media"}'::jsonb, false, 1),
  ('service_category', 'live_streaming', 'Live streaming', null, 'media', 15, '{"build":"media"}'::jsonb, false, 1),
  ('service_category', 'styling', 'Décor & florals', null, null, 16, '{"build":"styling"}'::jsonb, false, 1),
  ('service_category', 'decor', 'Décor', null, 'styling', 17, '{"build":"styling"}'::jsonb, false, 1),
  ('service_category', 'florist', 'Florist', null, 'styling', 18, '{"build":"styling"}'::jsonb, false, 1),
  ('service_category', 'production', 'AV & production', null, null, 19, '{"build":"production"}'::jsonb, false, 1),
  ('service_category', 'av_lighting', 'AV & lighting', null, 'production', 20, '{"build":"production"}'::jsonb, false, 1),
  ('service_category', 'staging', 'Staging', null, 'production', 21, '{"build":"production"}'::jsonb, false, 1),
  ('service_category', 'hire', 'Furniture & hire', null, null, 22, '{"build":"hire"}'::jsonb, false, 1),
  ('service_category', 'marquees', 'Marquees', null, 'hire', 23, '{"build":"hire"}'::jsonb, false, 1),
  ('service_category', 'furniture', 'Furniture', null, 'hire', 24, '{"build":"hire"}'::jsonb, false, 1),
  ('service_category', 'equipment_hire', 'Equipment hire', null, 'hire', 25, '{"build":"hire"}'::jsonb, false, 1),
  ('service_category', 'staff', 'Staffing', null, null, 26, '{"build":"staff"}'::jsonb, false, 1),
  ('service_category', 'security', 'Security', null, null, 27, '{"build":"staff"}'::jsonb, false, 1),
  ('service_category', 'transport', 'Transport', null, null, 28, '{"build":"transport"}'::jsonb, false, 1),
  ('service_category', 'accommodation', 'Accommodation', null, null, 29, '{"build":"transport"}'::jsonb, false, 1),
  ('service_category', 'planning', 'Planning & coordination', null, null, 30, '{"build":"extras"}'::jsonb, false, 1),
  ('service_category', 'other', 'Other', null, null, 31, '{"build":"extras"}'::jsonb, false, 1),
  ('build_category', 'venue', 'Venue', null, null, 1, '{}'::jsonb, false, 1),
  ('build_category', 'food', 'Food & catering', null, null, 2, '{}'::jsonb, false, 1),
  ('build_category', 'drinks', 'Drinks & bar', null, null, 3, '{}'::jsonb, false, 1),
  ('build_category', 'entertainment', 'Entertainment', null, null, 4, '{}'::jsonb, false, 1),
  ('build_category', 'media', 'Photography & video', null, null, 5, '{}'::jsonb, false, 1),
  ('build_category', 'styling', 'Decor & styling', null, null, 6, '{}'::jsonb, false, 1),
  ('build_category', 'staff', 'Staff & security', null, null, 7, '{}'::jsonb, false, 1),
  ('build_category', 'production', 'Production & AV', null, null, 8, '{}'::jsonb, false, 1),
  ('build_category', 'hire', 'Furniture & hire', null, null, 9, '{}'::jsonb, false, 1),
  ('build_category', 'transport', 'Transport & accommodation', null, null, 10, '{}'::jsonb, false, 1),
  ('build_category', 'extras', 'Extras', null, null, 11, '{}'::jsonb, false, 1),
  ('plan_need', 'venue', 'Venue', null, null, 1, '{"build":"venue"}'::jsonb, false, 1),
  ('plan_need', 'food', 'Catering', null, null, 2, '{"build":"food"}'::jsonb, false, 1),
  ('plan_need', 'drinks', 'Drinks / Bar', null, null, 3, '{"build":"drinks"}'::jsonb, false, 1),
  ('plan_need', 'entertainment', 'Entertainment', null, null, 4, '{"build":"entertainment"}'::jsonb, false, 1),
  ('plan_need', 'media', 'Photography', null, null, 5, '{"build":"media"}'::jsonb, false, 1),
  ('plan_need', 'styling', 'Decor & Styling', null, null, 6, '{"build":"styling"}'::jsonb, false, 1),
  ('plan_need', 'transport', 'Transportation', null, null, 7, '{"build":"transport"}'::jsonb, false, 1),
  ('plan_need', 'accommodation', 'Accommodation', null, null, 8, '{"build":"transport"}'::jsonb, false, 1),
  ('plan_need', 'security', 'Security', null, null, 9, '{"build":"staff"}'::jsonb, false, 1),
  ('plan_need', 'staff', 'Staff', null, null, 10, '{"build":"staff"}'::jsonb, false, 1),
  ('plan_need', 'invitations', 'Invitations', null, null, 11, '{"build":"extras"}'::jsonb, false, 1),
  ('plan_need', 'activities', 'Activities', null, null, 12, '{"build":"extras"}'::jsonb, false, 1),
  ('amenity', 'step_free', 'Step-free access', null, null, 1, '{}'::jsonb, false, 1),
  ('amenity', 'parking', 'On-site parking', null, null, 2, '{}'::jsonb, false, 1),
  ('amenity', 'in_house_catering', 'In-house catering', null, null, 3, '{}'::jsonb, false, 1),
  ('amenity', 'av_equipment', 'AV equipment', null, null, 4, '{}'::jsonb, false, 1),
  ('amenity', 'outdoor_space', 'Outdoor space', null, null, 5, '{}'::jsonb, false, 1),
  ('amenity', 'licensed_bar', 'Licensed bar', null, null, 6, '{}'::jsonb, false, 1),
  ('amenity', 'accommodation', 'Accommodation', null, null, 7, '{}'::jsonb, false, 1),
  ('amenity', 'wifi', 'Wi-Fi', null, null, 8, '{}'::jsonb, false, 1)
on conflict (taxonomy, key) do update set label = excluded.label, plural = excluded.plural, parent_key = excluded.parent_key, sort = excluded.sort, meta = excluded.meta, deprecated = excluded.deprecated, catalog_version = excluded.catalog_version, updated_at = now();
update public.taxonomy_terms set deprecated = true, updated_at = now() where catalog_version < 1 and not deprecated;
delete from public.taxonomy_spellings;
insert into public.taxonomy_spellings(taxonomy, spelling, key) values
  ('event_type', 'wedding', 'wedding'),
  ('event_type', 'birthday', 'birthday'),
  ('event_type', 'corporate', 'corporate'),
  ('event_type', 'party', 'party'),
  ('event_type', 'private party', 'private_party'),
  ('event_type', 'festival', 'festival'),
  ('event_type', 'nightlife', 'nightlife'),
  ('event_type', 'concert', 'concert'),
  ('event_type', 'private dinner', 'private_dinner'),
  ('event_type', 'childrens party', 'childrens_party'),
  ('event_type', 'conference', 'conference'),
  ('event_type', 'exhibition', 'exhibition'),
  ('event_type', 'product launch', 'product_launch'),
  ('event_type', 'awards', 'awards'),
  ('event_type', 'gala', 'gala'),
  ('event_type', 'community', 'community'),
  ('event_type', 'food drink', 'food_drink'),
  ('event_type', 'comedy', 'comedy'),
  ('event_type', 'webinar', 'webinar'),
  ('event_type', 'networking', 'networking'),
  ('event_type', 'theatre', 'theatre'),
  ('event_type', 'sports', 'sports'),
  ('event_type', 'charity', 'charity'),
  ('event_type', 'arts', 'arts'),
  ('event_type', 'religious', 'religious'),
  ('event_type', 'graduation', 'graduation'),
  ('event_type', 'seasonal', 'seasonal'),
  ('event_type', 'family', 'family'),
  ('event_type', 'production', 'production'),
  ('event_type', 'custom', 'custom'),
  ('event_type', 'weddings', 'wedding'),
  ('event_type', 'birthdays', 'birthday'),
  ('event_type', 'corporate event', 'corporate'),
  ('event_type', 'corporate events', 'corporate'),
  ('event_type', 'corporate & private hire', 'corporate'),
  ('event_type', 'parties', 'party'),
  ('event_type', 'private parties', 'private_party'),
  ('event_type', 'private events', 'private_party'),
  ('event_type', 'festivals', 'festival'),
  ('event_type', 'nightclub', 'nightlife'),
  ('event_type', 'nightclubs', 'nightlife'),
  ('event_type', 'club night', 'nightlife'),
  ('event_type', 'nightclub / dj event', 'nightlife'),
  ('event_type', 'clubs & nightlife', 'nightlife'),
  ('event_type', 'concert / live show', 'concert'),
  ('event_type', 'concerts & live shows', 'concert'),
  ('event_type', 'concert / gig', 'concert'),
  ('event_type', 'live shows', 'concert'),
  ('event_type', 'live show', 'concert'),
  ('event_type', 'concerts', 'concert'),
  ('event_type', 'private dinners', 'private_dinner'),
  ('event_type', 'children''s party', 'childrens_party'),
  ('event_type', 'children''s parties', 'childrens_party'),
  ('event_type', 'conferences', 'conference'),
  ('event_type', 'exhibitions', 'exhibition'),
  ('event_type', 'product launches', 'product_launch'),
  ('event_type', 'galas', 'gala'),
  ('event_type', 'community events', 'community'),
  ('event_type', 'community / sport', 'community'),
  ('event_type', 'food & drink', 'food_drink'),
  ('event_type', 'webinar / virtual', 'webinar'),
  ('event_type', 'remote / hybrid', 'webinar'),
  ('event_type', 'webinar / online', 'webinar'),
  ('event_type', 'virtual', 'webinar'),
  ('event_type', 'hybrid', 'webinar'),
  ('event_type', 'charity / fundraiser', 'charity'),
  ('event_type', 'charity / fundraisers', 'charity'),
  ('event_type', 'art & culture', 'arts'),
  ('event_type', 'arts & culture', 'arts'),
  ('event_type', 'faith & cultural', 'religious'),
  ('event_type', 'graduation / prom', 'graduation'),
  ('event_type', 'graduations', 'graduation'),
  ('event_type', 'seasonal / holiday', 'seasonal'),
  ('event_type', 'family & kids', 'family'),
  ('event_type', 'productions', 'production'),
  ('event_type', 'something else', 'custom'),
  ('event_type', 'mixed / custom', 'custom'),
  ('event_type', 'other', 'custom'),
  ('event_type', 'birthday / private party', 'birthday'),
  ('venue_type', 'event hall', 'event_hall'),
  ('venue_type', 'hotel', 'hotel'),
  ('venue_type', 'conference centre', 'conference_centre'),
  ('venue_type', 'outdoor', 'outdoor'),
  ('venue_type', 'bar nightclub', 'bar_nightclub'),
  ('venue_type', 'restaurant', 'restaurant'),
  ('venue_type', 'unique space', 'unique_space'),
  ('venue_type', 'arena stadium', 'arena_stadium'),
  ('venue_type', 'studio', 'studio'),
  ('venue_type', 'other', 'other'),
  ('venue_type', 'event halls', 'event_hall'),
  ('venue_type', 'event space', 'event_hall'),
  ('venue_type', 'event venue', 'event_hall'),
  ('venue_type', 'event space / multi purpose', 'event_hall'),
  ('venue_type', 'ballroom', 'event_hall'),
  ('venue_type', 'venue', 'event_hall'),
  ('venue_type', 'hotels', 'hotel'),
  ('venue_type', 'hotel or conference centre', 'hotel'),
  ('venue_type', 'conference centres', 'conference_centre'),
  ('venue_type', 'conference', 'conference_centre'),
  ('venue_type', 'outdoor venue', 'outdoor'),
  ('venue_type', 'outdoor venues', 'outdoor'),
  ('venue_type', 'outdoor / garden', 'outdoor'),
  ('venue_type', 'garden', 'outdoor'),
  ('venue_type', 'bar or nightclub', 'bar_nightclub'),
  ('venue_type', 'bars & nightclubs', 'bar_nightclub'),
  ('venue_type', 'nightclub', 'bar_nightclub'),
  ('venue_type', 'bar', 'bar_nightclub'),
  ('venue_type', 'bar / lounge', 'bar_nightclub'),
  ('venue_type', 'restaurants', 'restaurant'),
  ('venue_type', 'restaurant / bar', 'restaurant'),
  ('venue_type', 'private dining', 'restaurant'),
  ('venue_type', 'unique spaces', 'unique_space'),
  ('venue_type', 'historic / unique', 'unique_space'),
  ('venue_type', 'rooftop', 'unique_space'),
  ('venue_type', 'estate', 'unique_space'),
  ('venue_type', 'industrial', 'unique_space'),
  ('venue_type', 'arena or stadium', 'arena_stadium'),
  ('venue_type', 'arenas & stadiums', 'arena_stadium'),
  ('venue_type', 'arena', 'arena_stadium'),
  ('venue_type', 'stadium', 'arena_stadium'),
  ('venue_type', 'studios', 'studio'),
  ('venue_type', 'other venues', 'other'),
  ('service_category', 'catering', 'catering'),
  ('service_category', 'catering full', 'catering_full'),
  ('service_category', 'street food', 'street_food'),
  ('service_category', 'private chef', 'private_chef'),
  ('service_category', 'drinks', 'drinks'),
  ('service_category', 'mobile bar', 'mobile_bar'),
  ('service_category', 'entertainment', 'entertainment'),
  ('service_category', 'dj', 'dj'),
  ('service_category', 'live music', 'live_music'),
  ('service_category', 'performers', 'performers'),
  ('service_category', 'media', 'media'),
  ('service_category', 'photography', 'photography'),
  ('service_category', 'videography', 'videography'),
  ('service_category', 'photo booth', 'photo_booth'),
  ('service_category', 'live streaming', 'live_streaming'),
  ('service_category', 'styling', 'styling'),
  ('service_category', 'decor', 'decor'),
  ('service_category', 'florist', 'florist'),
  ('service_category', 'production', 'production'),
  ('service_category', 'av lighting', 'av_lighting'),
  ('service_category', 'staging', 'staging'),
  ('service_category', 'hire', 'hire'),
  ('service_category', 'marquees', 'marquees'),
  ('service_category', 'furniture', 'furniture'),
  ('service_category', 'equipment hire', 'equipment_hire'),
  ('service_category', 'staff', 'staff'),
  ('service_category', 'security', 'security'),
  ('service_category', 'transport', 'transport'),
  ('service_category', 'accommodation', 'accommodation'),
  ('service_category', 'planning', 'planning'),
  ('service_category', 'other', 'other'),
  ('service_category', 'food', 'catering'),
  ('service_category', 'food & catering', 'catering'),
  ('service_category', 'full service', 'catering_full'),
  ('service_category', 'catering > full service', 'catering_full'),
  ('service_category', 'catering > street food', 'street_food'),
  ('service_category', 'private dining', 'private_chef'),
  ('service_category', 'drinks & bar', 'drinks'),
  ('service_category', 'bar', 'drinks'),
  ('service_category', 'drinks / bar', 'drinks'),
  ('service_category', 'bar & drinks', 'drinks'),
  ('service_category', 'catering & bar', 'drinks'),
  ('service_category', 'live entertainment', 'entertainment'),
  ('service_category', 'music', 'entertainment'),
  ('service_category', 'entertainers', 'entertainment'),
  ('service_category', 'entertainment (acts/djs)', 'entertainment'),
  ('service_category', 'entertainment / dj', 'entertainment'),
  ('service_category', 'djs & music', 'dj'),
  ('service_category', 'dj & sound', 'dj'),
  ('service_category', 'entertainment > dj', 'dj'),
  ('service_category', 'band', 'live_music'),
  ('service_category', 'entertainment > live music', 'live_music'),
  ('service_category', 'entertainment > performers', 'performers'),
  ('service_category', 'kids'' entertainment', 'performers'),
  ('service_category', 'photography & video', 'media'),
  ('service_category', 'video', 'media'),
  ('service_category', 'photographer', 'photography'),
  ('service_category', 'videographer', 'videography'),
  ('service_category', 'décor & florals', 'styling'),
  ('service_category', 'decor & styling', 'styling'),
  ('service_category', 'décor & styling', 'styling'),
  ('service_category', 'décor', 'decor'),
  ('service_category', 'flowers', 'florist'),
  ('service_category', 'av & production', 'production'),
  ('service_category', 'production & av', 'production'),
  ('service_category', 'lighting & av', 'production'),
  ('service_category', 'av & lighting', 'av_lighting'),
  ('service_category', 'lighting', 'av_lighting'),
  ('service_category', 'sound & lighting', 'av_lighting'),
  ('service_category', 'av', 'av_lighting'),
  ('service_category', 'av & sound', 'av_lighting'),
  ('service_category', 'production > av & lighting', 'av_lighting'),
  ('service_category', 'production > staging', 'staging'),
  ('service_category', 'furniture & hire', 'hire'),
  ('service_category', 'furniture & marquees', 'hire'),
  ('service_category', 'equipment', 'hire'),
  ('service_category', 'generator', 'equipment_hire'),
  ('service_category', 'generator & power', 'equipment_hire'),
  ('service_category', 'staffing', 'staff'),
  ('service_category', 'event staff', 'staff'),
  ('service_category', 'staff & crew', 'staff'),
  ('service_category', 'staffing & security', 'staff'),
  ('service_category', 'security & staffing', 'staff'),
  ('service_category', 'transportation', 'transport'),
  ('service_category', 'planning & coordination', 'planning'),
  ('service_category', 'planner / coordinator', 'planning'),
  ('build_category', 'venue', 'venue'),
  ('build_category', 'food', 'food'),
  ('build_category', 'drinks', 'drinks'),
  ('build_category', 'entertainment', 'entertainment'),
  ('build_category', 'media', 'media'),
  ('build_category', 'styling', 'styling'),
  ('build_category', 'staff', 'staff'),
  ('build_category', 'production', 'production'),
  ('build_category', 'hire', 'hire'),
  ('build_category', 'transport', 'transport'),
  ('build_category', 'extras', 'extras'),
  ('build_category', 'food & catering', 'food'),
  ('build_category', 'catering', 'food'),
  ('build_category', 'drinks & bar', 'drinks'),
  ('build_category', 'dj', 'entertainment'),
  ('build_category', 'photography & video', 'media'),
  ('build_category', 'decor & styling', 'styling'),
  ('build_category', 'staff & security', 'staff'),
  ('build_category', 'security', 'staff'),
  ('build_category', 'production & av', 'production'),
  ('build_category', 'staging', 'production'),
  ('build_category', 'furniture & hire', 'hire'),
  ('build_category', 'transport & accommodation', 'transport'),
  ('plan_need', 'venue', 'venue'),
  ('plan_need', 'food', 'food'),
  ('plan_need', 'drinks', 'drinks'),
  ('plan_need', 'entertainment', 'entertainment'),
  ('plan_need', 'media', 'media'),
  ('plan_need', 'styling', 'styling'),
  ('plan_need', 'transport', 'transport'),
  ('plan_need', 'accommodation', 'accommodation'),
  ('plan_need', 'security', 'security'),
  ('plan_need', 'staff', 'staff'),
  ('plan_need', 'invitations', 'invitations'),
  ('plan_need', 'activities', 'activities'),
  ('plan_need', 'catering', 'food'),
  ('plan_need', 'drinks / bar', 'drinks'),
  ('plan_need', 'photography', 'media'),
  ('plan_need', 'decor & styling', 'styling'),
  ('plan_need', 'transportation', 'transport'),
  ('amenity', 'step free', 'step_free'),
  ('amenity', 'parking', 'parking'),
  ('amenity', 'in house catering', 'in_house_catering'),
  ('amenity', 'av equipment', 'av_equipment'),
  ('amenity', 'outdoor space', 'outdoor_space'),
  ('amenity', 'licensed bar', 'licensed_bar'),
  ('amenity', 'accommodation', 'accommodation'),
  ('amenity', 'wifi', 'wifi'),
  ('amenity', 'step free access', 'step_free'),
  ('amenity', 'on site parking', 'parking'),
  ('amenity', 'wi fi', 'wifi');
insert into public.ref_currencies(code, name, symbol, minor_units, transactional, sort, catalog_version) values
  ('GBP', 'British Pound', '£', 2, true, 1, 1),
  ('EUR', 'Euro', '€', 2, true, 2, 1),
  ('USD', 'US Dollar', '$', 2, true, 3, 1),
  ('CAD', 'Canadian Dollar', '$', 2, false, 4, 1),
  ('AED', 'UAE Dirham', 'AED', 2, false, 5, 1),
  ('ZAR', 'South African Rand', 'R', 2, false, 6, 1),
  ('AUD', 'Australian Dollar', '$', 2, false, 7, 1)
on conflict (code) do update set name = excluded.name, symbol = excluded.symbol, minor_units = excluded.minor_units, transactional = excluded.transactional, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();
update public.ref_currencies set active = false, updated_at = now() where catalog_version < 1 and active;
insert into public.ref_countries(code, name, region, currency, tax_options, business, sort, catalog_version) values
  ('GB', 'United Kingdom', 'uk', 'GBP', array['UK VAT 20% (standard rate)', 'UK VAT 5% (reduced rate)', 'Not VAT registered']::text[], true, 1, 1),
  ('IE', 'Ireland', 'eu', 'EUR', array['Irish VAT 23%', 'Irish VAT 13.5%', 'Not VAT registered']::text[], true, 2, 1),
  ('US', 'United States', 'na', 'USD', array['Sales tax by state (set per event location)', 'Tax exempt organisation']::text[], true, 3, 1),
  ('CA', 'Canada', 'na', 'CAD', array['GST/HST by province', 'Not registered (small supplier)']::text[], true, 4, 1),
  ('DE', 'Germany', 'eu', 'EUR', array['Umsatzsteuer 19%', 'Kleinunternehmer (no VAT charged)']::text[], true, 5, 1),
  ('FR', 'France', 'eu', 'EUR', array['TVA 20%', 'Franchise en base (no VAT charged)']::text[], true, 6, 1),
  ('AE', 'United Arab Emirates', 'mea', 'AED', array['UAE VAT 5%', 'Not VAT registered']::text[], true, 7, 1),
  ('ZA', 'South Africa', 'mea', 'ZAR', array['South African VAT 15%', 'Not VAT registered']::text[], true, 8, 1),
  ('AU', 'Australia', 'apac', 'AUD', array['GST 10%', 'Not GST registered']::text[], true, 9, 1),
  ('ES', 'Spain', 'eu', 'EUR', array[]::text[], false, 10, 1),
  ('IT', 'Italy', 'eu', 'EUR', array[]::text[], false, 11, 1),
  ('NL', 'Netherlands', 'eu', 'EUR', array[]::text[], false, 12, 1),
  ('PT', 'Portugal', 'eu', 'EUR', array[]::text[], false, 13, 1)
on conflict (code) do update set name = excluded.name, region = excluded.region, currency = excluded.currency, tax_options = excluded.tax_options, business = excluded.business, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();
update public.ref_countries set active = false, updated_at = now() where catalog_version < 1 and active;
insert into public.ref_timezones(tz, label, country, sort, catalog_version) values
  ('Europe/London', '(GMT+0/+1) London', 'GB', 1, 1),
  ('Europe/Dublin', '(GMT+0/+1) Dublin', 'IE', 2, 1),
  ('America/New_York', '(GMT−5/−4) New York', 'US', 3, 1),
  ('America/Chicago', '(GMT−6/−5) Chicago', 'US', 4, 1),
  ('America/Denver', '(GMT−7/−6) Denver', 'US', 5, 1),
  ('America/Los_Angeles', '(GMT−8/−7) Los Angeles', 'US', 6, 1),
  ('America/Toronto', '(GMT−5/−4) Toronto', 'CA', 7, 1),
  ('America/Vancouver', '(GMT−8/−7) Vancouver', 'CA', 8, 1),
  ('Europe/Berlin', '(GMT+1/+2) Berlin', 'DE', 9, 1),
  ('Europe/Paris', '(GMT+1/+2) Paris', 'FR', 10, 1),
  ('Asia/Dubai', '(GMT+4) Dubai', 'AE', 11, 1),
  ('Africa/Johannesburg', '(GMT+2) Johannesburg', 'ZA', 12, 1),
  ('Australia/Sydney', '(GMT+10/+11) Sydney', 'AU', 13, 1),
  ('Australia/Perth', '(GMT+8) Perth', 'AU', 14, 1),
  ('Europe/Madrid', '(GMT+1/+2) Madrid', 'ES', 15, 1),
  ('Europe/Rome', '(GMT+1/+2) Rome', 'IT', 16, 1),
  ('Europe/Amsterdam', '(GMT+1/+2) Amsterdam', 'NL', 17, 1),
  ('Europe/Lisbon', '(GMT+0/+1) Lisbon', 'PT', 18, 1)
on conflict (tz) do update set label = excluded.label, country = excluded.country, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();
update public.ref_timezones set active = false, updated_at = now() where catalog_version < 1 and active;
-- ═══ END GENERATED ═══
