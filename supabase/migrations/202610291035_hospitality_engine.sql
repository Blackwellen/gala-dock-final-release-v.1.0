-- Q13 Food / Drinks / Hospitality (lane A, 2026-10-29; backend domains 81–84). Additive and backward compatible.
-- Reuses the §59–65 model (menus, menu_sections, menu_items, catering_selections, bar_packages, event_orders) and adds
-- what was missing so a selection flows through booking → BEO → budget as structured data, never retyped text:
--   * master data: the 14 UK allergens (FIC Annex II) and dietary tags as reference tables;
--   * menu_item_variants (relational, priced in pence deltas), allergen status/may-contain/declaration audit;
--   * pence (minor-unit) generated columns on menus / menu_items / bar_packages;
--   * bar_selections (open / cash / tab / package / tokens / minimum spend / corkage) per booking line;
--   * hospitality_schedules (green room, artist catering, VIP, staff meals, guest hospitality) linked to programme + rooms;
--   * hospitality_bookings (one per booking line: totals, applied amount, adjustment, snapshot at confirmation, BEO sync)
--     and hospitality_lines (structured priced lines with dietary + allergen arrays);
--   * final guest numbers with a cut-off, service timing linked to programme items, optimistic versions;
--   * BEO sync into event_order_versions (existing event_order machine + approval) and a hospitality block in
--     event_budget_summary. Allergen information remains the provider's own declaration.

-- ═══ 1. Master data ═══
create table if not exists public.food_allergens (
  key text primary key check (key ~ '^[a-z_]+$'),
  label text not null,
  description text not null default '',
  regulation text not null default 'UK FIC (Annex II) — 14 major allergens',
  sort integer not null default 0
);
insert into public.food_allergens(key, label, description, sort) values
  ('celery', 'Celery', 'Including celeriac, stalks, leaves, seeds', 1),
  ('gluten', 'Cereals containing gluten', 'Wheat, rye, barley, oats', 2),
  ('crustaceans', 'Crustaceans', 'Prawns, crab, lobster', 3),
  ('eggs', 'Eggs', '', 4),
  ('fish', 'Fish', '', 5),
  ('lupin', 'Lupin', '', 6),
  ('milk', 'Milk', '', 7),
  ('molluscs', 'Molluscs', 'Mussels, oysters, squid', 8),
  ('mustard', 'Mustard', '', 9),
  ('nuts', 'Tree nuts', 'Almonds, hazelnuts, walnuts, cashews, pecans, Brazil, pistachio, macadamia', 10),
  ('peanuts', 'Peanuts', '', 11),
  ('sesame', 'Sesame', '', 12),
  ('soya', 'Soya', '', 13),
  ('sulphites', 'Sulphur dioxide and sulphites', 'Above 10 mg/kg or 10 mg/litre', 14)
on conflict (key) do update set label = excluded.label, description = excluded.description, sort = excluded.sort;

create table if not exists public.food_dietary_tags (
  key text primary key check (key ~ '^[a-z_]+$'),
  label text not null,
  sort integer not null default 0
);
insert into public.food_dietary_tags(key, label, sort) values
  ('vegetarian', 'Vegetarian', 1), ('vegan', 'Vegan', 2), ('gluten_free', 'Gluten free', 3), ('halal', 'Halal', 4), ('kosher', 'Kosher', 5),
  ('dairy_free', 'Dairy free', 6), ('nut_free', 'Nut free', 7), ('pescatarian', 'Pescatarian', 8)
on conflict (key) do update set label = excluded.label, sort = excluded.sort;
alter table public.food_allergens enable row level security;
alter table public.food_dietary_tags enable row level security;
drop policy if exists food_allergens_read on public.food_allergens;
create policy food_allergens_read on public.food_allergens for select using (true);
drop policy if exists food_dietary_tags_read on public.food_dietary_tags;
create policy food_dietary_tags_read on public.food_dietary_tags for select using (true);

-- ═══ 2. Menus: pence, variants, allergen declaration ═══
alter table public.menus add column if not exists price_minor bigint generated always as (case when price is null then null else round(price * 100)::bigint end) stored;
alter table public.menu_items add column if not exists price_minor bigint generated always as (case when price is null then null else round(price * 100)::bigint end) stored;
alter table public.menu_items add column if not exists may_contain text[] not null default '{}';
alter table public.menu_items add column if not exists allergen_status text not null default 'not_declared';
alter table public.menu_items add column if not exists allergen_declared_at timestamptz;
alter table public.menu_items add column if not exists allergen_declared_by uuid references auth.users(id) on delete set null;
alter table public.menu_items add column if not exists course text;
do $$ begin
  alter table public.menu_items add constraint menu_items_may_contain_check check (may_contain <@ array['celery','gluten','crustaceans','eggs','fish','lupin','milk','molluscs','mustard','nuts','peanuts','sesame','soya','sulphites']);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.menu_items add constraint menu_items_allergen_status_check check (allergen_status in ('not_declared','declared'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.menu_items add constraint menu_items_course_check check (course is null or course in ('canape','starter','main','dessert','side','drink','late','other'));
exception when duplicate_object then null; end $$;

create table if not exists public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  price_delta_minor bigint not null default 0 check (price_delta_minor between -10000000 and 10000000),
  dietary text[] not null default '{}' check (dietary <@ array['vegetarian','vegan','gluten_free','halal','kosher','dairy_free','nut_free','pescatarian']),
  allergens text[] not null default '{}' check (allergens <@ array['celery','gluten','crustaceans','eggs','fish','lupin','milk','molluscs','mustard','nuts','peanuts','sesame','soya','sulphites']),
  may_contain text[] not null default '{}' check (may_contain <@ array['celery','gluten','crustaceans','eggs','fish','lupin','milk','molluscs','mustard','nuts','peanuts','sesame','soya','sulphites']),
  available boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, name)
);
create index if not exists menu_item_variants_menu_idx on public.menu_item_variants(menu_id, menu_item_id, sort);
alter table public.menu_item_variants enable row level security;
drop policy if exists menu_item_variants_read on public.menu_item_variants;
create policy menu_item_variants_read on public.menu_item_variants for select using (exists (select 1 from public.menus m where m.id = menu_id and (m.status = 'published' or public.is_workspace_member(m.workspace_id))));
drop policy if exists menu_item_variants_insert on public.menu_item_variants;
create policy menu_item_variants_insert on public.menu_item_variants for insert with check (exists (select 1 from public.menus m join public.menu_items i on i.menu_id = m.id
  where m.id = menu_id and i.id = menu_item_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])));
drop policy if exists menu_item_variants_update on public.menu_item_variants;
create policy menu_item_variants_update on public.menu_item_variants for update using (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])))
  with check (exists (select 1 from public.menus m join public.menu_items i on i.menu_id = m.id where m.id = menu_id and i.id = menu_item_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])));
drop policy if exists menu_item_variants_delete on public.menu_item_variants;
create policy menu_item_variants_delete on public.menu_item_variants for delete using (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])));

-- Backfill relational variants from the legacy variations jsonb ([{name, price_delta}] in pounds).
insert into public.menu_item_variants(menu_item_id, menu_id, name, price_delta_minor, sort)
select i.id, i.menu_id, left(v.value->>'name', 80), coalesce(round((v.value->>'price_delta')::numeric * 100)::bigint, 0), v.ordinality::int
  from public.menu_items i cross join lateral jsonb_array_elements(case when jsonb_typeof(i.variations) = 'array' then i.variations else '[]' end) with ordinality v
 where coalesce(v.value->>'name', '') <> '' and (v.value->>'price_delta') ~ '^-?[0-9]+(\.[0-9]+)?$'
on conflict (menu_item_id, name) do nothing;

-- Allergen declarations are tightly controlled: owner/manager only (existing RLS), stamped and audited on every change.
create or replace function public.menu_items_allergen_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.allergens) > 0 or cardinality(new.may_contain) > 0 or new.allergen_status = 'declared' then
      new.allergen_status := 'declared'; new.allergen_declared_at := now(); new.allergen_declared_by := auth.uid();
    end if;
    return new;
  end if;
  if new.allergens is distinct from old.allergens or new.may_contain is distinct from old.may_contain or new.allergen_status is distinct from old.allergen_status then
    new.allergen_status := case when cardinality(new.allergens) > 0 or cardinality(new.may_contain) > 0 then 'declared' else new.allergen_status end;
    new.allergen_declared_at := now(); new.allergen_declared_by := auth.uid();
    select m.workspace_id into ws from public.menus m where m.id = new.menu_id;
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
      values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end, ws, 'menu.allergens_changed',
        jsonb_build_object('menu_id', new.menu_id, 'menu_item_id', new.id, 'before', to_jsonb(old.allergens), 'after', to_jsonb(new.allergens),
          'may_contain_before', to_jsonb(old.may_contain), 'may_contain_after', to_jsonb(new.may_contain)));
  end if;
  return new;
end $$;
drop trigger if exists menu_items_allergen_guard on public.menu_items;
create trigger menu_items_allergen_guard before insert or update on public.menu_items for each row execute function public.menu_items_allergen_guard();

-- ═══ 3. Bar packages: pence + allowed modes ═══
alter table public.bar_packages add column if not exists price_minor bigint generated always as (case when price is null then null else round(price * 100)::bigint end) stored;
alter table public.bar_packages add column if not exists per_person_minor bigint generated always as (case when per_person is null then null else round(per_person * 100)::bigint end) stored;
alter table public.bar_packages add column if not exists token_price_minor bigint generated always as (case when token_price is null then null else round(token_price * 100)::bigint end) stored;
alter table public.bar_packages add column if not exists min_spend_minor bigint generated always as (case when min_spend is null then null else round(min_spend * 100)::bigint end) stored;
alter table public.bar_packages add column if not exists corkage_minor bigint generated always as (case when corkage_per_bottle is null then null else round(corkage_per_bottle * 100)::bigint end) stored;
alter table public.bar_packages add column if not exists allowed_modes text[];
do $$ begin
  alter table public.bar_packages add constraint bar_packages_allowed_modes_check check (allowed_modes is null or allowed_modes <@ array['cash_bar','hosted_bar','open_bar','drink_tokens','prepaid_package','minimum_spend','consumption_tab','dry_hire','mobile_bar','bartenders_only']);
exception when duplicate_object then null; end $$;

-- ═══ 4. Catering selection: versions, final numbers, programme timing ═══
alter table public.catering_selections add column if not exists version integer not null default 1;
alter table public.catering_selections add column if not exists final_guest_count integer;
alter table public.catering_selections add column if not exists final_numbers_at timestamptz;
alter table public.catering_selections add column if not exists final_numbers_by uuid references auth.users(id) on delete set null;
alter table public.catering_selections add column if not exists programme_item_id uuid references public.programme_items(id) on delete set null;
alter table public.catering_selections add column if not exists course_timing jsonb not null default '[]';
do $$ begin
  alter table public.catering_selections add constraint catering_selections_final_guests_check check (final_guest_count is null or final_guest_count between 1 and 100000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.catering_selections add constraint catering_selections_course_timing_check check (jsonb_typeof(course_timing) = 'array');
exception when duplicate_object then null; end $$;

create or replace function public.hospitality_bump_version() returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
drop trigger if exists catering_selections_version on public.catering_selections;
create trigger catering_selections_version before update on public.catering_selections for each row execute function public.hospitality_bump_version();

-- ═══ 5. Bar selections ═══
create table if not exists public.bar_selections (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null unique references public.build_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  bar_package_id uuid not null references public.bar_packages(id) on delete restrict,
  mode text not null check (mode in ('cash_bar','hosted_bar','open_bar','drink_tokens','prepaid_package','minimum_spend','consumption_tab','dry_hire','mobile_bar','bartenders_only')),
  guests integer not null check (guests between 1 and 100000),
  starts_at timestamptz, ends_at timestamptz,
  programme_item_id uuid references public.programme_items(id) on delete set null,
  tokens integer not null default 0 check (tokens between 0 and 1000000),
  corkage_bottles integer not null default 0 check (corkage_bottles between 0 and 100000),
  tab_limit_minor bigint check (tab_limit_minor is null or tab_limit_minor between 0 and 100000000000),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'draft' check (status in ('draft','submitted','confirmed','locked','cancelled')),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists bar_selections_event_idx on public.bar_selections(event_id);
drop trigger if exists bar_selections_version on public.bar_selections;
create trigger bar_selections_version before update on public.bar_selections for each row execute function public.hospitality_bump_version();
alter table public.bar_selections enable row level security;
drop policy if exists bar_selections_read on public.bar_selections;
create policy bar_selections_read on public.bar_selections for select using (public.can_access_event(event_id)
  or exists (select 1 from public.bar_packages p where p.id = bar_package_id and public.is_workspace_member(p.workspace_id)));

-- ═══ 6. Hospitality schedules (84: green rooms, artist catering, VIP, staff meals, guest hospitality) ═══
create table if not exists public.hospitality_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('green_room','artist_catering','vip','staff_meals','crew_catering','guest_hospitality')),
  title text not null check (length(title) between 2 and 120),
  space_id uuid references public.spaces(id) on delete set null,
  location text not null default '' check (length(location) <= 200),
  programme_item_id uuid references public.programme_items(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  headcount integer not null check (headcount between 1 and 100000),
  dietary_counts jsonb not null default '{}' check (jsonb_typeof(dietary_counts) = 'object'),
  build_item_id uuid references public.build_items(id) on delete set null,
  menu_id uuid references public.menus(id) on delete set null,
  requirements jsonb not null default '[]' check (jsonb_typeof(requirements) = 'array'),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'planned' check (status in ('planned','confirmed','cancelled')),
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists hospitality_schedules_event_idx on public.hospitality_schedules(event_id, starts_at);
create index if not exists hospitality_schedules_item_idx on public.hospitality_schedules(build_item_id) where build_item_id is not null;
drop trigger if exists hospitality_schedules_version on public.hospitality_schedules;
create trigger hospitality_schedules_version before update on public.hospitality_schedules for each row execute function public.hospitality_bump_version();
alter table public.hospitality_schedules enable row level security;
drop policy if exists hospitality_schedules_read on public.hospitality_schedules;
create policy hospitality_schedules_read on public.hospitality_schedules for select using (public.can_access_event(event_id)
  or (build_item_id is not null and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = build_item_id and public.is_workspace_member(l.workspace_id))));

-- ═══ 7. Hospitality booking header + structured lines ═══
create table if not exists public.hospitality_bookings (
  build_item_id uuid primary key references public.build_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,   -- the provider (venue/caterer/bar) of the booking line
  status text not null default 'draft' check (status in ('draft','submitted','confirmed','cancelled')),
  catering_minor bigint not null default 0,
  bar_minor bigint not null default 0,
  schedule_minor bigint not null default 0,
  contingent_minor bigint not null default 0,
  total_minor bigint not null default 0,
  applied_minor bigint not null default 0,      -- what hospitality currently contributes to build_items.amount
  adjustment_minor bigint not null default 0,   -- post-confirmation change vs the snapshot (not yet charged)
  guests integer,
  cutoff_at timestamptz,
  warnings jsonb not null default '[]',
  allergens text[] not null default '{}',
  may_contain text[] not null default '{}',
  snapshot jsonb,
  snapshot_at timestamptz,
  beo_order_id uuid references public.event_orders(id) on delete set null,
  beo_synced_version integer,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists hospitality_bookings_event_idx on public.hospitality_bookings(event_id);
create index if not exists hospitality_bookings_ws_idx on public.hospitality_bookings(workspace_id);
alter table public.hospitality_bookings enable row level security;
drop policy if exists hospitality_bookings_read on public.hospitality_bookings;
create policy hospitality_bookings_read on public.hospitality_bookings for select using (public.can_access_event(event_id) or (workspace_id is not null and public.is_workspace_member(workspace_id)));

create table if not exists public.hospitality_lines (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null references public.hospitality_bookings(build_item_id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  source text not null check (source in ('catering','bar','schedule')),
  kind text not null,
  price_key text not null,
  label text not null,
  section text,
  course text,
  basis text not null check (basis in ('per_head','fixed','quantity','included','consumption_estimate','contingent','top_up')),
  qty numeric(12,2) not null default 1,
  unit_minor bigint not null default 0,
  total_minor bigint not null default 0,
  dietary text[] not null default '{}',
  allergens text[] not null default '{}',
  may_contain text[] not null default '{}',
  allergen_status text,
  menu_id uuid, menu_item_id uuid, variant_id uuid, bar_package_id uuid, schedule_id uuid,
  service_at timestamptz,
  sort integer not null default 0
);
create index if not exists hospitality_lines_item_idx on public.hospitality_lines(build_item_id, sort);
create index if not exists hospitality_lines_event_idx on public.hospitality_lines(event_id);
alter table public.hospitality_lines enable row level security;
drop policy if exists hospitality_lines_read on public.hospitality_lines;
create policy hospitality_lines_read on public.hospitality_lines for select using (public.can_access_event(event_id) or (workspace_id is not null and public.is_workspace_member(workspace_id)));

alter table public.event_orders add column if not exists hospitality_version integer;

-- ═══ 8. Pricing engine (server-side, minor units) ═══
create or replace function public.hospitality_cutoff(p_due date) returns timestamptz language sql immutable set search_path = '' as $$
  select case when p_due is null then null else ((p_due + 1)::timestamp at time zone 'Europe/London') end
$$;

-- Computes the structured lines for one booking line from its catering selection, bar selection and priced schedules.
-- After confirmation (snapshot present) unit prices come from the snapshot, so later menu edits cannot rewrite history.
create or replace function public.hospitality_compute(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.hospitality_bookings; c public.catering_selections; br public.bar_selections; m public.menus; bp public.bar_packages;
  lines jsonb := '[]'; warn jsonb := '[]'; guests integer; per_head integer; it record; s record; q numeric; unit bigint;
  incl boolean; n integer := 0; svc timestamptz; bar_cov bigint := 0; ms bigint; k text; tot jsonb; prog record;
begin
  select * into h from public.hospitality_bookings where build_item_id = p_item;
  -- Catering
  select * into c from public.catering_selections where build_item_id = p_item;
  if found then
    select * into m from public.menus where id = c.menu_id;
    guests := coalesce(c.final_guest_count, c.guest_count);
    per_head := greatest(guests, coalesce(m.min_guests, 0));
    select p.starts_at into svc from public.programme_items p where p.id = c.programme_item_id;
    svc := coalesce(svc, c.service_at);
    if m.min_guests is not null and guests < m.min_guests then
      warn := warn || jsonb_build_array(jsonb_build_object('code', 'below_minimum_guests', 'min', m.min_guests, 'text', 'Priced at the menu minimum of ' || m.min_guests || ' guests.'));
    end if;
    if m.max_guests is not null and guests > m.max_guests then
      warn := warn || jsonb_build_array(jsonb_build_object('code', 'above_maximum_guests', 'max', m.max_guests, 'text', 'Above the menu maximum; the caterer must confirm.'));
    end if;
    if m.pricing = 'per_person' and coalesce(m.price_minor, 0) > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'catering', 'kind', 'menu', 'price_key', 'menu:' || m.id, 'label', m.name, 'basis', 'per_head',
        'qty', per_head, 'unit_minor', m.price_minor, 'menu_id', m.id, 'service_at', svc, 'sort', n));
    elsif m.pricing = 'fixed' and coalesce(m.price_minor, 0) > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'catering', 'kind', 'menu', 'price_key', 'menu:' || m.id, 'label', m.name, 'basis', 'fixed',
        'qty', 1, 'unit_minor', m.price_minor, 'menu_id', m.id, 'service_at', svc, 'sort', n));
    end if;
    for it in
      select i.id, i.name, i.price_minor, i.dietary, i.allergens, i.may_contain, i.allergen_status, i.course, i.available, sec.name section_name,
             v.id vid, v.name vname, v.price_delta_minor, v.dietary vdiet, v.allergens vall, v.may_contain vmay, x.value sel, x.ordinality ord
        from jsonb_array_elements(case when jsonb_typeof(c.items) = 'array' then c.items else '[]' end) with ordinality x
        join public.menu_items i on i.id = (x.value->>'item_id')::uuid and i.menu_id = m.id
        left join public.menu_sections sec on sec.id = i.section_id
        left join public.menu_item_variants v on v.id = nullif(x.value->>'variant_id', '')::uuid and v.menu_item_id = i.id
       order by x.ordinality
    loop
      n := n + 1;
      q := coalesce((it.sel->>'qty')::numeric, case when m.pricing = 'quantity' then guests else 0 end);
      incl := m.pricing <> 'quantity' and coalesce((it.sel->>'qty')::numeric, 0) = 0;
      unit := coalesce(it.price_minor, 0) + coalesce(it.price_delta_minor, 0);
      if not it.available then warn := warn || jsonb_build_array(jsonb_build_object('code', 'item_unavailable', 'item', it.name, 'text', it.name || ' is no longer available.')); end if;
      if it.allergen_status = 'not_declared' and it.vall is null then
        warn := warn || jsonb_build_array(jsonb_build_object('code', 'allergens_not_declared', 'item', it.name, 'text', 'The caterer has not declared allergens for ' || it.name || '.'));
      end if;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'catering', 'kind', 'menu_item',
        'price_key', 'item:' || it.id || ':' || coalesce(it.vid::text, ''), 'label', it.name || coalesce(' — ' || it.vname, ''), 'section', it.section_name, 'course', it.course,
        'basis', case when incl then 'included' else 'quantity' end, 'qty', case when incl then guests else q end, 'unit_minor', case when incl then 0 else unit end,
        'dietary', to_jsonb(case when it.vid is not null and cardinality(it.vdiet) > 0 then it.vdiet else it.dietary end),
        'allergens', to_jsonb(array(select distinct a from unnest(it.allergens || coalesce(it.vall, '{}')) a order by a)),
        'may_contain', to_jsonb(array(select distinct a from unnest(it.may_contain || coalesce(it.vmay, '{}')) a order by a)),
        'allergen_status', it.allergen_status, 'menu_id', m.id, 'menu_item_id', it.id, 'variant_id', it.vid,
        'service_at', coalesce((select (ct->>'serve_at')::timestamptz from jsonb_array_elements(c.course_timing) ct where ct->>'course' = it.course limit 1), svc), 'sort', n));
    end loop;
    -- Section choice rules.
    for s in select sec.name, sec.choose_min, sec.choose_max, count(i.id) picked
               from public.menu_sections sec
               left join public.menu_items i on i.section_id = sec.id and i.id in (select (x->>'item_id')::uuid from jsonb_array_elements(case when jsonb_typeof(c.items) = 'array' then c.items else '[]' end) x)
              where sec.menu_id = m.id group by sec.id, sec.name, sec.choose_min, sec.choose_max loop
      if (s.choose_min is not null and s.picked < s.choose_min) or (s.choose_max is not null and s.picked > s.choose_max) then
        warn := warn || jsonb_build_array(jsonb_build_object('code', 'section_choice', 'section', s.name, 'picked', s.picked, 'min', s.choose_min, 'max', s.choose_max,
          'text', 'Choose ' || coalesce(s.choose_min::text, '0') || '–' || coalesce(s.choose_max::text, 'any') || ' from ' || s.name || '.'));
      end if;
    end loop;
    -- Dietary needs with no matching selected option.
    for k in select key from jsonb_each_text(case when jsonb_typeof(c.dietary_counts) = 'object' then c.dietary_counts else '{}' end) where value ~ '^[0-9]+$' and value::int > 0 loop
      if not exists (select 1 from jsonb_array_elements(lines) l where l->>'source' = 'catering' and l->'dietary' ? k) then
        warn := warn || jsonb_build_array(jsonb_build_object('code', 'dietary_uncovered', 'tag', k, 'text', 'No selected dish is marked ' || replace(k, '_', ' ') || '.'));
      end if;
    end loop;
  end if;

  -- Bar
  select * into br from public.bar_selections where build_item_id = p_item and status <> 'cancelled';
  if found then
    select * into bp from public.bar_packages where id = br.bar_package_id;
    select p.starts_at into svc from public.programme_items p where p.id = br.programme_item_id;
    svc := coalesce(svc, br.starts_at);
    if coalesce(bp.price_minor, 0) > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'package_fee', 'price_key', 'bar:' || bp.id || ':fee', 'label', bp.name || ' — package', 'basis', 'fixed',
        'qty', 1, 'unit_minor', bp.price_minor, 'bar_package_id', bp.id, 'service_at', svc, 'sort', n));
    end if;
    if br.mode in ('open_bar','prepaid_package','hosted_bar','mobile_bar','dry_hire','bartenders_only') and coalesce(bp.per_person_minor, 0) > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'per_head', 'price_key', 'bar:' || bp.id || ':per_person', 'label', bp.name || ' — per guest', 'basis', 'per_head',
        'qty', br.guests, 'unit_minor', bp.per_person_minor, 'bar_package_id', bp.id, 'service_at', svc, 'sort', n));
    end if;
    if br.mode = 'drink_tokens' and br.tokens > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'tokens', 'price_key', 'bar:' || bp.id || ':token', 'label', 'Drink tokens', 'basis', 'quantity',
        'qty', br.tokens, 'unit_minor', coalesce(bp.token_price_minor, 0), 'bar_package_id', bp.id, 'service_at', svc, 'sort', n));
    end if;
    if br.mode in ('consumption_tab','hosted_bar') and coalesce(br.tab_limit_minor, 0) > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'tab', 'price_key', 'bar:' || bp.id || ':tab', 'label', 'Bar tab (charged on consumption, up to this limit)',
        'basis', 'consumption_estimate', 'qty', 1, 'unit_minor', br.tab_limit_minor, 'bar_package_id', bp.id, 'service_at', svc, 'sort', n));
    end if;
    if br.corkage_bottles > 0 then
      n := n + 1;
      lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'corkage', 'price_key', 'bar:' || bp.id || ':corkage', 'label', 'Corkage', 'basis', 'quantity',
        'qty', br.corkage_bottles, 'unit_minor', coalesce(bp.corkage_minor, 0), 'bar_package_id', bp.id, 'service_at', svc, 'sort', n));
    end if;
    ms := coalesce(bp.min_spend_minor, 0);
    if ms > 0 then
      select coalesce(sum(round((l->>'qty')::numeric * (l->>'unit_minor')::bigint)), 0) into bar_cov from jsonb_array_elements(lines) l
       where l->>'source' = 'bar' and l->>'kind' <> 'corkage';
      n := n + 1;
      if br.mode = 'cash_bar' then
        -- Guests pay at the bar; the host guarantees the shortfall. Contingent: not part of the committed total.
        lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'minimum_spend', 'price_key', 'bar:' || bp.id || ':min_spend',
          'label', 'Minimum spend guarantee (any shortfall is payable after the event)', 'basis', 'contingent', 'qty', 1, 'unit_minor', ms, 'bar_package_id', bp.id, 'sort', n));
      elsif bar_cov < ms then
        lines := lines || jsonb_build_array(jsonb_build_object('source', 'bar', 'kind', 'minimum_spend', 'price_key', 'bar:' || bp.id || ':top_up',
          'label', 'Minimum spend top-up', 'basis', 'top_up', 'qty', 1, 'unit_minor', ms - bar_cov, 'bar_package_id', bp.id, 'sort', n));
      end if;
    end if;
  end if;

  -- Priced hospitality schedules served by this booking line (staff meals, artist catering, VIP …).
  for s in select hs.*, hm.name menu_name, hm.pricing, hm.price_minor from public.hospitality_schedules hs join public.menus hm on hm.id = hs.menu_id
            where hs.build_item_id = p_item and hs.status <> 'cancelled' order by hs.starts_at loop
    n := n + 1;
    lines := lines || jsonb_build_array(jsonb_build_object('source', 'schedule', 'kind', s.kind, 'price_key', 'schedule:' || s.id || ':' || s.menu_id,
      'label', s.title || ' — ' || s.menu_name, 'basis', case when s.pricing = 'fixed' then 'fixed' else 'per_head' end,
      'qty', case when s.pricing = 'fixed' then 1 else s.headcount end, 'unit_minor', coalesce(s.price_minor, 0), 'menu_id', s.menu_id, 'schedule_id', s.id,
      'service_at', s.starts_at, 'sort', n));
  end loop;

  -- Snapshot price lock + line totals.
  select coalesce(jsonb_agg(l || jsonb_build_object('unit_minor', u, 'total_minor', round((l->>'qty')::numeric * u)::bigint) order by (l->>'sort')::int), '[]') into lines
    from (select l, coalesce(case when h.snapshot is not null and l->>'basis' not in ('top_up','consumption_estimate')
                                    then (select (x->>'unit_minor')::bigint from jsonb_array_elements(h.snapshot->'lines') x where x->>'price_key' = l->>'price_key' limit 1) end,
                                  (l->>'unit_minor')::bigint) u
            from jsonb_array_elements(lines) l) z;
  select jsonb_build_object(
      'catering_minor', coalesce(sum((l->>'total_minor')::bigint) filter (where l->>'source' = 'catering' and l->>'basis' <> 'contingent'), 0),
      'bar_minor', coalesce(sum((l->>'total_minor')::bigint) filter (where l->>'source' = 'bar' and l->>'basis' <> 'contingent'), 0),
      'schedule_minor', coalesce(sum((l->>'total_minor')::bigint) filter (where l->>'source' = 'schedule' and l->>'basis' <> 'contingent'), 0),
      'contingent_minor', coalesce(sum((l->>'total_minor')::bigint) filter (where l->>'basis' = 'contingent'), 0),
      'total_minor', coalesce(sum((l->>'total_minor')::bigint) filter (where l->>'basis' <> 'contingent'), 0))
    into tot from jsonb_array_elements(lines) l;
  return tot || jsonb_build_object('lines', lines, 'warnings', warn, 'guests', guests,
    'cutoff_at', case when c.id is not null then public.hospitality_cutoff(c.final_numbers_due) end,
    'allergens', coalesce((select jsonb_agg(distinct a order by a) from jsonb_array_elements(lines) l, jsonb_array_elements_text(coalesce(l->'allergens', '[]')) a), '[]'),
    'may_contain', coalesce((select jsonb_agg(distinct a order by a) from jsonb_array_elements(lines) l, jsonb_array_elements_text(coalesce(l->'may_contain', '[]')) a), '[]'),
    'allergen_disclaimer', 'Allergen and dietary information is declared by the caterer. Confirm requirements directly with them.');
end $$;

-- Rewrites the structured lines + header for one booking line and keeps build_items.amount in step while the line is
-- still pre-commitment (venue lines keep their hire price; a caterer/bar line's estimate is replaced by the selection).
create or replace function public.hospitality_refresh(p_item uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.build_items; h public.hospitality_bookings; r jsonb; total bigint; kind text; ws uuid; pre boolean; st text; cur_minor bigint;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not exists (select 1 from public.events ev where ev.id = b.event_id) then return null; end if;
  select l.kind, l.workspace_id into kind, ws from public.listings l where l.id = b.listing_id;
  insert into public.hospitality_bookings(build_item_id, event_id, workspace_id, applied_minor)
    values (b.id, b.event_id, ws, case when coalesce(kind, '') = 'venue' then 0 else coalesce(round(b.amount * 100)::bigint, 0) end)
  on conflict (build_item_id) do nothing;
  select * into h from public.hospitality_bookings where build_item_id = p_item for update;
  r := public.hospitality_compute(p_item);
  total := (r->>'total_minor')::bigint;
  delete from public.hospitality_lines where build_item_id = p_item;
  insert into public.hospitality_lines(build_item_id, event_id, workspace_id, source, kind, price_key, label, section, course, basis, qty, unit_minor, total_minor,
      dietary, allergens, may_contain, allergen_status, menu_id, menu_item_id, variant_id, bar_package_id, schedule_id, service_at, sort)
  select p_item, b.event_id, ws, l->>'source', l->>'kind', l->>'price_key', l->>'label', l->>'section', l->>'course', l->>'basis', (l->>'qty')::numeric,
         (l->>'unit_minor')::bigint, (l->>'total_minor')::bigint,
         array(select jsonb_array_elements_text(coalesce(l->'dietary', '[]'))), array(select jsonb_array_elements_text(coalesce(l->'allergens', '[]'))),
         array(select jsonb_array_elements_text(coalesce(l->'may_contain', '[]'))), l->>'allergen_status',
         (l->>'menu_id')::uuid, (l->>'menu_item_id')::uuid, (l->>'variant_id')::uuid, (l->>'bar_package_id')::uuid, (l->>'schedule_id')::uuid,
         (l->>'service_at')::timestamptz, (l->>'sort')::int
    from jsonb_array_elements(r->'lines') l;
  pre := b.status in ('suggested','draft','sent','awaiting','available','quoted','requested','enquiry_created','awaiting_provider','clarification',
                      'clarification_requested','quote_received','quote_revised','customer_reviewing');
  st := case when h.status in ('confirmed','cancelled') then h.status
             when exists (select 1 from public.catering_selections c where c.build_item_id = p_item and c.status in ('submitted','confirmed','locked'))
               or exists (select 1 from public.bar_selections x where x.build_item_id = p_item and x.status in ('submitted','confirmed','locked')) then 'submitted'
             else 'draft' end;
  if pre and h.snapshot is null then
    cur_minor := coalesce(round(b.amount * 100)::bigint, 0);
    if cur_minor - h.applied_minor + total <> cur_minor then
      update public.build_items set amount = round((cur_minor - h.applied_minor + total)::numeric / 100, 2), updated_at = now() where id = p_item;
    end if;
    update public.hospitality_bookings set applied_minor = total, adjustment_minor = 0 where build_item_id = p_item;
  else
    update public.hospitality_bookings set adjustment_minor = case when h.snapshot is null then 0 else total - coalesce((h.snapshot->>'total_minor')::bigint, 0) end
     where build_item_id = p_item;
  end if;
  update public.hospitality_bookings set status = st, catering_minor = (r->>'catering_minor')::bigint, bar_minor = (r->>'bar_minor')::bigint,
      schedule_minor = (r->>'schedule_minor')::bigint, contingent_minor = (r->>'contingent_minor')::bigint, total_minor = total, guests = (r->>'guests')::int,
      cutoff_at = (r->>'cutoff_at')::timestamptz, warnings = r->'warnings',
      allergens = array(select jsonb_array_elements_text(r->'allergens')), may_contain = array(select jsonb_array_elements_text(r->'may_contain')),
      version = version + 1, updated_at = now()
   where build_item_id = p_item;
  return r;
end $$;

-- Freezes the commercial snapshot (unit prices, lines, allergens) when the booking line is confirmed.
create or replace function public.hospitality_freeze(p_item uuid, p_actor uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; h public.hospitality_bookings;
begin
  if not exists (select 1 from public.catering_selections where build_item_id = p_item)
     and not exists (select 1 from public.bar_selections where build_item_id = p_item)
     and not exists (select 1 from public.hospitality_schedules where build_item_id = p_item and menu_id is not null) then return null; end if;
  r := public.hospitality_refresh(p_item);
  select * into h from public.hospitality_bookings where build_item_id = p_item for update;
  if h.snapshot is not null then return h.snapshot; end if;
  update public.hospitality_bookings set status = 'confirmed', snapshot_at = now(), adjustment_minor = 0,
      snapshot = jsonb_build_object('lines', r->'lines', 'total_minor', (r->>'total_minor')::bigint, 'catering_minor', (r->>'catering_minor')::bigint,
        'bar_minor', (r->>'bar_minor')::bigint, 'schedule_minor', (r->>'schedule_minor')::bigint, 'contingent_minor', (r->>'contingent_minor')::bigint,
        'guests', r->'guests', 'allergens', r->'allergens', 'may_contain', r->'may_contain', 'snapshotted_at', now())
   where build_item_id = p_item;
  update public.catering_selections set status = 'confirmed', updated_at = now() where build_item_id = p_item and status in ('draft','submitted');
  update public.bar_selections set status = 'confirmed', updated_at = now() where build_item_id = p_item and status in ('draft','submitted');
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_actor, case when p_actor is null then 'system' else 'user' end, h.workspace_id, 'hospitality.confirmed',
      jsonb_build_object('build_item_id', p_item, 'event_id', h.event_id, 'total_minor', (r->>'total_minor')::bigint));
  return (select snapshot from public.hospitality_bookings where build_item_id = p_item);
end $$;

-- Selection tables keep their lines current whichever path wrote them (commands, legacy RPC, service workers).
create or replace function public.hospitality_selection_changed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Nested writes (FK cascades/set-null, hospitality_freeze) are skipped: the caller refreshes, and cascaded deletes must not
  -- re-create header rows for a booking line or event that is being removed.
  if pg_trigger_depth() > 1 then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' then
    if old.build_item_id is not null then perform public.hospitality_refresh(old.build_item_id); end if;
    return old;
  end if;
  if new.build_item_id is not null then perform public.hospitality_refresh(new.build_item_id); end if;
  if tg_op = 'UPDATE' and old.build_item_id is not null and old.build_item_id is distinct from new.build_item_id then perform public.hospitality_refresh(old.build_item_id); end if;
  return new;
end $$;
drop trigger if exists catering_selections_hospitality on public.catering_selections;
create trigger catering_selections_hospitality after insert or update or delete on public.catering_selections for each row execute function public.hospitality_selection_changed();
drop trigger if exists bar_selections_hospitality on public.bar_selections;
create trigger bar_selections_hospitality after insert or update or delete on public.bar_selections for each row execute function public.hospitality_selection_changed();
drop trigger if exists hospitality_schedules_lines on public.hospitality_schedules;
create trigger hospitality_schedules_lines after insert or update or delete on public.hospitality_schedules for each row execute function public.hospitality_selection_changed();

-- Snapshot at confirmation (payment path, provider confirmation, off-platform confirm).
create or replace function public.build_items_hospitality_confirm() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then perform public.hospitality_freeze(new.id, auth.uid()); end if;
  if new.status in ('cancelled','declined','unavailable','expired','expired_no_response') and old.status is distinct from new.status then
    update public.hospitality_bookings set status = 'cancelled', updated_at = now() where build_item_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists build_items_hospitality_confirm on public.build_items;
create trigger build_items_hospitality_confirm after update of status on public.build_items for each row execute function public.build_items_hospitality_confirm();

-- ═══ 9. Commands ═══
create or replace function public.hospitality_is_provider(p_item uuid, p_roles text[] default array['owner','manager','member']) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = p_item and public.has_workspace_role(l.workspace_id, p_roles))
$$;

create or replace function public.hospitality_validate_dietary(p_counts jsonb, p_guests integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v text; total integer := 0;
begin
  if p_counts is null then return '{}'; end if;
  if jsonb_typeof(p_counts) <> 'object' then raise exception 'invalid_dietary' using errcode = '22023'; end if;
  for k, v in select key, value from jsonb_each_text(p_counts) loop
    if k not in ('vegetarian','vegan','gluten_free','halal','kosher','dairy_free','nut_free','pescatarian') or v !~ '^[0-9]{1,6}$' then
      raise exception 'invalid_dietary:%', k using errcode = '22023';
    end if;
    total := total + v::int;
  end loop;
  if p_guests is not null and total > p_guests then raise exception 'dietary_exceeds_guests' using errcode = '22023'; end if;
  return p_counts;
end $$;

-- Event side (customer/organizer editor). p_sel: {menu_id, guests, items:[{item_id, variant_id?, qty?}], dietary_counts, serving_style,
-- programme_item_id, service_at, course_timing:[{course, serve_at}], staffing, equipment, notes, submit}.
create or replace function public.hospitality_save_catering(p_item uuid, p_sel jsonb, p_expected_version integer default null, p_accept_change boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; m public.menus; cur public.catering_selections; e public.events; h public.hospitality_bookings;
  guests integer; due date; prog uuid; svc timestamptz; items jsonb; ct jsonb; prev bigint; nxt bigint; new_ver integer; r jsonb; st text; provider boolean;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status in ('cancelled','declined','unavailable','expired','expired_no_response','completed') then raise exception 'booking_closed' using errcode = '22023'; end if;
  select * into e from public.events where id = b.event_id;
  if jsonb_typeof(p_sel) <> 'object' then raise exception 'invalid_selection' using errcode = '22023'; end if;
  select * into m from public.menus where id = (p_sel->>'menu_id')::uuid and status = 'published';
  if not found or m.workspace_id is distinct from public.listing_workspace(b.listing_id) then raise exception 'invalid_menu' using errcode = '22023'; end if;
  guests := (p_sel->>'guests')::int;
  if guests is null or guests < 1 or guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  items := coalesce(p_sel->'items', '[]');
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then raise exception 'invalid_items' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(items) x where (x->>'item_id') is null or not exists (select 1 from public.menu_items i where i.id = (x->>'item_id')::uuid and i.menu_id = m.id and i.available)
             or (nullif(x->>'variant_id', '') is not null and not exists (select 1 from public.menu_item_variants v where v.id = (x->>'variant_id')::uuid and v.menu_item_id = (x->>'item_id')::uuid and v.available))
             or (x ? 'qty' and ((x->>'qty') !~ '^[0-9]{1,6}$'))) then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  perform public.hospitality_validate_dietary(p_sel->'dietary_counts', guests);
  prog := nullif(p_sel->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at into svc from public.programme_items p where p.id = prog and p.event_id = b.event_id;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
  else
    svc := nullif(p_sel->>'service_at', '')::timestamptz;
  end if;
  if svc is not null and e.starts_at is not null and (svc < e.starts_at - interval '12 hours' or svc > coalesce(e.ends_at, e.starts_at + interval '1 day') + interval '12 hours') then
    raise exception 'service_outside_event' using errcode = '22023';
  end if;
  ct := coalesce(p_sel->'course_timing', '[]');
  if jsonb_typeof(ct) <> 'array' or exists (select 1 from jsonb_array_elements(ct) x where (x->>'course') not in ('canape','starter','main','dessert','side','drink','late','other') or (x->>'serve_at') is null) then
    raise exception 'invalid_course_timing' using errcode = '22023';
  end if;
  select * into cur from public.catering_selections where build_item_id = b.id for update;
  provider := public.hospitality_is_provider(p_item);
  if cur.id is not null then
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '40001'; end if;
    if cur.status = 'locked' then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
    if public.hospitality_cutoff(cur.final_numbers_due) < now() and not provider
       and (cur.guest_count <> guests or cur.items is distinct from items or cur.menu_id <> m.id) then
      raise exception 'final_numbers_closed' using errcode = '22023', hint = 'The final-numbers deadline has passed; ask the caterer to change it.';
    end if;
  end if;
  due := (select (ev.starts_at at time zone 'Europe/London')::date from public.events ev where ev.id = b.event_id) - m.final_numbers_days;
  select * into h from public.hospitality_bookings where build_item_id = b.id;
  prev := h.total_minor;
  st := case when cur.status in ('confirmed','locked') then cur.status when coalesce((p_sel->>'submit')::boolean, false) then 'submitted' else coalesce(cur.status, 'draft') end;
  begin
    insert into public.catering_selections as c (build_item_id, event_id, menu_id, guest_count, items, dietary_counts, serving_style, service_at, programme_item_id, course_timing,
        staffing, equipment, notes, final_numbers_due, status, price_snapshot, updated_by)
      values (b.id, b.event_id, m.id, guests, items, coalesce(p_sel->'dietary_counts', '{}'), coalesce(p_sel->>'serving_style', m.serving_style), svc, prog, ct,
        left(coalesce(p_sel->>'staffing', ''), 1000), left(coalesce(p_sel->>'equipment', ''), 1000), left(coalesce(p_sel->>'notes', ''), 2000), due, st,
        public.catering_price(m.id, guests, items), auth.uid())
    on conflict (build_item_id) do update set menu_id = excluded.menu_id, guest_count = excluded.guest_count, items = excluded.items, dietary_counts = excluded.dietary_counts,
      serving_style = excluded.serving_style, service_at = excluded.service_at, programme_item_id = excluded.programme_item_id, course_timing = excluded.course_timing,
      staffing = excluded.staffing, equipment = excluded.equipment, notes = excluded.notes, final_numbers_due = excluded.final_numbers_due,
      price_snapshot = excluded.price_snapshot, status = excluded.status, updated_by = auth.uid(), updated_at = now()
    returning c.version into new_ver;
    select total_minor into nxt from public.hospitality_bookings where build_item_id = b.id;
    if h.status = 'confirmed' and prev is distinct from nxt and not p_accept_change then
      raise exception 'hospitality_needs_confirmation';
    end if;
  exception when raise_exception then
    if sqlerrm = 'hospitality_needs_confirmation' then
      return jsonb_build_object('needs_confirmation', true, 'previous_total_minor', prev, 'new_total_minor', nxt, 'difference_minor', nxt - coalesce(prev, 0),
        'after_deadline', public.hospitality_cutoff(cur.final_numbers_due) < now());
    end if;
    raise;
  end;
  if cur.id is not null and cur.status in ('confirmed','locked') then
    perform public.notify_workspace(m.workspace_id, array['owner','manager'], 'provider.request', 'Catering selection changed',
      'Guests ' || cur.guest_count || ' → ' || guests || '.', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', m.workspace_id, 'hospitality.selection_saved', jsonb_build_object('build_item_id', b.id, 'event_id', b.event_id, 'kind', 'catering',
      'menu_id', m.id, 'guests', guests, 'total_minor', nxt, 'version', new_ver));
  select to_jsonb(x) into r from public.hospitality_bookings x where build_item_id = b.id;
  return jsonb_build_object('saved', true, 'version', new_ver, 'final_numbers_due', due, 'cutoff_at', public.hospitality_cutoff(due), 'booking', r - 'snapshot');
end $$;

-- Final numbers: the event side until the cut-off; afterwards only the provider (venue/caterer) can change them.
create or replace function public.hospitality_set_final_numbers(p_item uuid, p_guests integer, p_dietary jsonb default null, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; cur public.catering_selections; provider boolean; editor boolean; ws uuid; r jsonb; v integer;
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  provider := public.hospitality_is_provider(p_item, array['owner','manager']);
  editor := public.can_edit_event(b.event_id);
  if not provider and not editor then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into cur from public.catering_selections where build_item_id = p_item for update;
  if not found then raise exception 'no_catering_selection' using errcode = 'P0002'; end if;
  if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '40001'; end if;
  if p_guests is null or p_guests < 1 or p_guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  if cur.status = 'locked' and not provider then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
  if public.hospitality_cutoff(cur.final_numbers_due) < now() and not provider then
    raise exception 'final_numbers_closed' using errcode = '22023', hint = 'The final-numbers deadline has passed; ask the caterer to change it.';
  end if;
  perform public.hospitality_validate_dietary(coalesce(p_dietary, cur.dietary_counts), p_guests);
  update public.catering_selections set guest_count = p_guests, final_guest_count = p_guests, final_numbers_at = now(), final_numbers_by = auth.uid(),
      dietary_counts = coalesce(p_dietary, dietary_counts), updated_by = auth.uid(), updated_at = now()
   where build_item_id = p_item returning version into v;
  select m.workspace_id into ws from public.menus m where m.id = cur.menu_id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'hospitality.final_numbers_set', jsonb_build_object('build_item_id', p_item, 'event_id', b.event_id, 'from', cur.guest_count, 'to', p_guests,
      'by', case when provider then 'provider' else 'event' end));
  if not provider then
    perform public.notify_workspace(ws, array['owner','manager'], 'provider.request', 'Final numbers received', cur.guest_count || ' → ' || p_guests || ' guests.', '/provider/opportunities/' || p_item);
  end if;
  select to_jsonb(x) - 'snapshot' into r from public.hospitality_bookings x where build_item_id = p_item;
  return jsonb_build_object('saved', true, 'version', v, 'booking', r);
end $$;

-- p_bar: {bar_package_id, mode, guests, starts_at, ends_at, programme_item_id, tokens, corkage_bottles, tab_limit_minor, notes, submit}
create or replace function public.hospitality_save_bar(p_item uuid, p_bar jsonb, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; bp public.bar_packages; cur public.bar_selections; e public.events; mode text; g integer; sa timestamptz; ea timestamptz; prog uuid;
  tokens integer; bottles integer; tab bigint; v integer; r jsonb; st text; dur interval;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status in ('cancelled','declined','unavailable','expired','expired_no_response','completed') then raise exception 'booking_closed' using errcode = '22023'; end if;
  if jsonb_typeof(p_bar) <> 'object' then raise exception 'invalid_selection' using errcode = '22023'; end if;
  select * into e from public.events where id = b.event_id;
  select * into bp from public.bar_packages where id = (p_bar->>'bar_package_id')::uuid and status = 'published';
  if not found or bp.workspace_id is distinct from public.listing_workspace(b.listing_id) then raise exception 'invalid_bar_package' using errcode = '22023'; end if;
  mode := coalesce(nullif(p_bar->>'mode', ''), bp.model);
  if mode <> bp.model and not (mode = any(coalesce(bp.allowed_modes, '{}'))) then raise exception 'bar_mode_not_offered:%', mode using errcode = '22023'; end if;
  g := (p_bar->>'guests')::int;
  if g is null or g < 1 or g > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  tokens := coalesce((p_bar->>'tokens')::int, 0); bottles := coalesce((p_bar->>'corkage_bottles')::int, 0); tab := nullif(p_bar->>'tab_limit_minor', '')::bigint;
  if mode = 'drink_tokens' and (tokens <= 0 or bp.token_price is null) then raise exception 'tokens_required' using errcode = '22023'; end if;
  if mode <> 'drink_tokens' and tokens > 0 then raise exception 'tokens_not_applicable' using errcode = '22023'; end if;
  if bottles > 0 and bp.corkage_per_bottle is null then raise exception 'corkage_not_offered' using errcode = '22023'; end if;
  if tab is not null and mode not in ('consumption_tab','hosted_bar') then raise exception 'tab_not_applicable' using errcode = '22023'; end if;
  prog := nullif(p_bar->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at, p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0)) into sa, ea from public.programme_items p where p.id = prog and p.event_id = b.event_id;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
    if ea = sa then ea := null; end if;
  end if;
  sa := coalesce(nullif(p_bar->>'starts_at', '')::timestamptz, sa);
  ea := coalesce(nullif(p_bar->>'ends_at', '')::timestamptz, ea);
  if sa is not null and ea is not null and ea <= sa then raise exception 'invalid_bar_hours' using errcode = '22023'; end if;
  select * into cur from public.bar_selections where build_item_id = p_item for update;
  if found then
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '40001'; end if;
    if cur.status = 'locked' then raise exception 'bar_locked' using errcode = '22023'; end if;
  end if;
  st := case when cur.status in ('confirmed','locked') then cur.status when coalesce((p_bar->>'submit')::boolean, false) then 'submitted' else coalesce(nullif(cur.status, 'cancelled'), 'draft') end;
  insert into public.bar_selections as x (build_item_id, event_id, bar_package_id, mode, guests, starts_at, ends_at, programme_item_id, tokens, corkage_bottles, tab_limit_minor, notes, status, updated_by)
    values (b.id, b.event_id, bp.id, mode, g, sa, ea, prog, tokens, bottles, tab, left(coalesce(p_bar->>'notes', ''), 2000), st, auth.uid())
  on conflict (build_item_id) do update set bar_package_id = excluded.bar_package_id, mode = excluded.mode, guests = excluded.guests, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    programme_item_id = excluded.programme_item_id, tokens = excluded.tokens, corkage_bottles = excluded.corkage_bottles, tab_limit_minor = excluded.tab_limit_minor,
    notes = excluded.notes, status = excluded.status, updated_by = auth.uid(), updated_at = now()
  returning x.version into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', bp.workspace_id, 'hospitality.selection_saved', jsonb_build_object('build_item_id', b.id, 'event_id', b.event_id, 'kind', 'bar', 'mode', mode, 'version', v));
  select to_jsonb(h) - 'snapshot' into r from public.hospitality_bookings h where build_item_id = b.id;
  return jsonb_build_object('saved', true, 'version', v, 'booking', r,
    'licensing', jsonb_build_object('min_age', coalesce((bp.licensing->>'min_age')::int, 18), 'provided_by', bp.licensing->>'provided_by', 'licence_ref', bp.licensing->>'licence_ref'));
end $$;

-- Schedules are event-owned (organizer/customer editor). p_row: {kind, title, space_id, location, programme_item_id, starts_at, ends_at, headcount,
-- dietary_counts, build_item_id, menu_id, requirements:[{item, qty}], notes, status}
create or replace function public.hospitality_save_schedule(p_event uuid, p_row jsonb, p_id uuid default null, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur public.hospitality_schedules; sa timestamptz; ea timestamptz; prog uuid; sp uuid; bi uuid; mn uuid; hc integer; nid uuid; v integer;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_schedule' using errcode = '22023'; end if;
  if p_id is not null then
    select * into cur from public.hospitality_schedules where id = p_id and event_id = p_event for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '40001'; end if;
  end if;
  prog := nullif(p_row->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at, p.starts_at + make_interval(mins => greatest(coalesce(p.duration_minutes, 60), 1)) into sa, ea from public.programme_items p where p.id = prog and p.event_id = p_event;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
  end if;
  sa := coalesce(nullif(p_row->>'starts_at', '')::timestamptz, sa); ea := coalesce(nullif(p_row->>'ends_at', '')::timestamptz, ea);
  if sa is null or ea is null or ea <= sa then raise exception 'invalid_schedule_time' using errcode = '22023'; end if;
  hc := (p_row->>'headcount')::int;
  if hc is null or hc < 1 or hc > 100000 then raise exception 'invalid_headcount' using errcode = '22023'; end if;
  perform public.hospitality_validate_dietary(p_row->'dietary_counts', hc);
  sp := nullif(p_row->>'space_id', '')::uuid;
  if sp is not null and not exists (select 1 from public.event_spaces(p_event) s where s.id = sp) then raise exception 'invalid_space' using errcode = '22023'; end if;
  bi := nullif(p_row->>'build_item_id', '')::uuid;
  if bi is not null and not exists (select 1 from public.build_items b where b.id = bi and b.event_id = p_event) then raise exception 'invalid_build_item' using errcode = '22023'; end if;
  mn := nullif(p_row->>'menu_id', '')::uuid;
  if mn is not null and (bi is null or not exists (select 1 from public.menus m join public.build_items b on b.id = bi
                                                  where m.id = mn and m.status = 'published' and m.workspace_id = public.listing_workspace(b.listing_id))) then
    raise exception 'invalid_menu' using errcode = '22023';
  end if;
  if coalesce(p_row->>'status', 'planned') not in ('planned','confirmed','cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_row->'requirements', '[]')) <> 'array' or jsonb_array_length(coalesce(p_row->'requirements', '[]')) > 100 then raise exception 'invalid_requirements' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.hospitality_schedules(event_id, kind, title, space_id, location, programme_item_id, starts_at, ends_at, headcount, dietary_counts, build_item_id, menu_id,
        requirements, notes, status, created_by)
      values (p_event, p_row->>'kind', p_row->>'title', sp, left(coalesce(p_row->>'location', ''), 200), prog, sa, ea, hc, coalesce(p_row->'dietary_counts', '{}'), bi, mn,
        coalesce(p_row->'requirements', '[]'), left(coalesce(p_row->>'notes', ''), 2000), coalesce(p_row->>'status', 'planned'), auth.uid())
      returning id, version into nid, v;
  else
    update public.hospitality_schedules set kind = p_row->>'kind', title = p_row->>'title', space_id = sp, location = left(coalesce(p_row->>'location', ''), 200), programme_item_id = prog,
        starts_at = sa, ends_at = ea, headcount = hc, dietary_counts = coalesce(p_row->'dietary_counts', '{}'), build_item_id = bi, menu_id = mn,
        requirements = coalesce(p_row->'requirements', '[]'), notes = left(coalesce(p_row->>'notes', ''), 2000), status = coalesce(p_row->>'status', 'planned'), updated_at = now()
      where id = p_id returning id, version into nid, v;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', (select workspace_id from public.events where id = p_event), 'hospitality.schedule_saved',
      jsonb_build_object('event_id', p_event, 'schedule_id', nid, 'kind', p_row->>'kind', 'headcount', hc));
  return jsonb_build_object('id', nid, 'version', v);
end $$;

-- Provider confirms the selection (e.g. off-platform or before payment of the balance): freezes the snapshot.
create or replace function public.hospitality_confirm(p_item uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.hospitality_is_provider(p_item, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.hospitality_freeze(p_item, auth.uid());
end $$;

-- ═══ 10. Reads ═══
create or replace function public.hospitality_beo_section(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h public.hospitality_bookings; c public.catering_selections; br public.bar_selections; m public.menus; bp public.bar_packages; out jsonb;
begin
  select * into h from public.hospitality_bookings where build_item_id = p_item;
  if not found then return null; end if;
  select * into c from public.catering_selections where build_item_id = p_item;
  select * into m from public.menus where id = c.menu_id;
  select * into br from public.bar_selections where build_item_id = p_item and status <> 'cancelled';
  select * into bp from public.bar_packages where id = br.bar_package_id;
  out := jsonb_build_object('source', 'hospitality:v1', 'booking_version', h.version, 'status', h.status, 'currency', 'GBP',
    'totals', jsonb_build_object('catering_minor', h.catering_minor, 'bar_minor', h.bar_minor, 'schedule_minor', h.schedule_minor, 'contingent_minor', h.contingent_minor,
      'total_minor', h.total_minor, 'adjustment_minor', h.adjustment_minor),
    'allergens', to_jsonb(h.allergens), 'may_contain', to_jsonb(h.may_contain), 'warnings', h.warnings,
    'catering', case when c.id is null then null else jsonb_build_object('selection_id', c.id, 'selection_version', c.version, 'menu_id', m.id, 'menu', m.name,
      'serving_style', c.serving_style, 'guests', c.guest_count, 'final_guest_count', c.final_guest_count, 'final_numbers_due', c.final_numbers_due,
      'cutoff_at', public.hospitality_cutoff(c.final_numbers_due), 'dietary_counts', c.dietary_counts,
      'service_at', coalesce((select p.starts_at from public.programme_items p where p.id = c.programme_item_id), c.service_at),
      'timing_source', case when c.programme_item_id is not null then 'programme' else 'selection' end, 'programme_item_id', c.programme_item_id,
      'course_timing', c.course_timing, 'staffing', c.staffing, 'equipment', c.equipment) end,
    'bar', case when br.id is null then null else jsonb_build_object('selection_id', br.id, 'selection_version', br.version, 'package_id', bp.id, 'package', bp.name, 'mode', br.mode,
      'guests', br.guests, 'starts_at', coalesce((select p.starts_at from public.programme_items p where p.id = br.programme_item_id), br.starts_at), 'ends_at', br.ends_at,
      'tokens', br.tokens, 'corkage_bottles', br.corkage_bottles, 'tab_limit_minor', br.tab_limit_minor, 'min_spend_minor', bp.min_spend_minor,
      'licensing', bp.licensing, 'staffing', bp.staffing, 'equipment', bp.equipment, 'glassware', bp.glassware) end,
    'schedules', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'space_id', s.space_id, 'location', s.location,
        'starts_at', coalesce((select p.starts_at from public.programme_items p where p.id = s.programme_item_id), s.starts_at), 'ends_at', s.ends_at,
        'headcount', s.headcount, 'dietary_counts', s.dietary_counts, 'requirements', s.requirements, 'status', s.status) order by s.starts_at)
      from public.hospitality_schedules s where s.build_item_id = p_item and s.status <> 'cancelled'), '[]'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('source', l.source, 'kind', l.kind, 'label', l.label, 'section', l.section, 'course', l.course, 'basis', l.basis,
        'qty', l.qty, 'unit_minor', l.unit_minor, 'total_minor', l.total_minor, 'dietary', to_jsonb(l.dietary), 'allergens', to_jsonb(l.allergens),
        'may_contain', to_jsonb(l.may_contain), 'service_at', l.service_at, 'menu_item_id', l.menu_item_id, 'variant_id', l.variant_id) order by l.sort)
      from public.hospitality_lines l where l.build_item_id = p_item), '[]'),
    'allergen_disclaimer', 'Allergen and dietary information is declared by the caterer. Confirm requirements directly with them.');
  return out;
end $$;

-- One booking line: header, lines, selections, schedules, BEO state and allergen drift since the snapshot.
create or replace function public.hospitality_booking(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.build_items; h public.hospitality_bookings; o public.event_orders; drift jsonb;
begin
  select * into b from public.build_items where id = p_item;
  if not found or not (public.can_access_event(b.event_id) or public.hospitality_is_provider(p_item)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into h from public.hospitality_bookings where build_item_id = p_item;
  if not found then return jsonb_build_object('build_item_id', p_item, 'exists', false); end if;
  select * into o from public.event_orders where id = h.beo_order_id;
  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', i.id, 'item', i.name, 'snapshot', s.l->'allergens', 'current', to_jsonb(i.allergens))), '[]') into drift
    from jsonb_array_elements(coalesce(h.snapshot->'lines', '[]')) s(l) join public.menu_items i on i.id = (s.l->>'menu_item_id')::uuid
   where (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(s.l->'allergens') x) is distinct from (select coalesce(array_agg(a order by a), '{}') from unnest(i.allergens) a);
  return (to_jsonb(h) - 'snapshot') || jsonb_build_object('exists', true, 'snapshot_total_minor', (h.snapshot->>'total_minor')::bigint,
    'beo', case when o.id is null then null else jsonb_build_object('id', o.id, 'reference', o.reference, 'status', o.status, 'current_version', o.current_version,
      'approved_version', o.approved_version, 'stale', coalesce(o.hospitality_version, -1) <> h.version) end,
    'allergen_changes', drift, 'section', public.hospitality_beo_section(p_item));
end $$;

-- Event-level read for the organizer/customer (and the budget): every hospitality booking, schedules, allergens matrix.
create or replace function public.hospitality_event_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('event_id', p_event,
    'total_minor', coalesce((select sum(total_minor) from public.hospitality_bookings where event_id = p_event and status <> 'cancelled'), 0),
    'contingent_minor', coalesce((select sum(contingent_minor) from public.hospitality_bookings where event_id = p_event and status <> 'cancelled'), 0),
    'adjustment_minor', coalesce((select sum(adjustment_minor) from public.hospitality_bookings where event_id = p_event and status <> 'cancelled'), 0),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', h.build_item_id, 'title', b.title, 'status', h.status, 'line_status', b.status,
        'catering_minor', h.catering_minor, 'bar_minor', h.bar_minor, 'schedule_minor', h.schedule_minor, 'contingent_minor', h.contingent_minor, 'total_minor', h.total_minor,
        'adjustment_minor', h.adjustment_minor, 'guests', h.guests, 'cutoff_at', h.cutoff_at, 'allergens', to_jsonb(h.allergens), 'warnings', h.warnings,
        'beo_status', o.status, 'beo_stale', o.id is not null and coalesce(o.hospitality_version, -1) <> h.version) order by b.sort)
      from public.hospitality_bookings h join public.build_items b on b.id = h.build_item_id left join public.event_orders o on o.id = h.beo_order_id
      where h.event_id = p_event), '[]'),
    'allergen_matrix', coalesce((select jsonb_object_agg(a, items) from (select a, jsonb_agg(distinct l.label) items from public.hospitality_lines l, unnest(l.allergens) a
      where l.event_id = p_event group by a) z), '{}'),
    'schedules', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at) from public.hospitality_schedules s where s.event_id = p_event and s.status <> 'cancelled'), '[]'));
end $$;

-- ═══ 11. BEO integration (existing event_order machine + approve_event_order) ═══
-- Provider writes a new append-only BEO version whose `hospitality` section is generated from the structured lines.
create or replace function public.event_order_sync_hospitality(p_item uuid, p_send boolean default false, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; h public.hospitality_bookings; j public.provider_jobs; o public.event_orders; ws uuid; v integer; prev public.event_order_versions; sec jsonb;
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  perform public.require_provider_role(ws, array['owner','manager','member']);
  perform public.hospitality_refresh(p_item);
  select * into h from public.hospitality_bookings where build_item_id = p_item;
  sec := public.hospitality_beo_section(p_item);
  select * into j from public.provider_jobs where build_item_id = p_item and workspace_id = ws order by created_at desc limit 1;
  select * into o from public.event_orders where (j.id is not null and provider_job_id = j.id) or (build_item_id = p_item and workspace_id = ws) order by created_at limit 1 for update;
  if not found then
    insert into public.event_orders(workspace_id, build_item_id, provider_job_id, event_id, title, created_by)
      values (ws, p_item, j.id, b.event_id, coalesce(j.event_name, (select name from public.events where id = b.event_id), b.title, 'Event order'), auth.uid()) returning * into o;
  end if;
  select * into prev from public.event_order_versions where order_id = o.id and version = o.current_version;
  v := o.current_version + 1;
  insert into public.event_order_versions(order_id, version, content, financial, note, created_by)
    values (o.id, v, coalesce(prev.content, '{}') || jsonb_build_object('hospitality', sec),
      coalesce(prev.financial, '{}') || jsonb_build_object('hospitality_minor', h.total_minor, 'catering_minor', h.catering_minor, 'bar_minor', h.bar_minor,
        'schedule_minor', h.schedule_minor, 'contingent_minor', h.contingent_minor, 'currency', 'GBP'),
      left(coalesce(nullif(p_note, ''), 'Hospitality selection synced'), 500), auth.uid());
  if o.status = 'approved' then update public.event_orders set status = 'revised' where id = o.id; o.status := 'revised'; end if;
  update public.event_orders set current_version = v, hospitality_version = h.version, updated_at = now(),
      status = case when p_send then 'sent' else o.status end where id = o.id;
  update public.hospitality_bookings set beo_order_id = o.id, beo_synced_version = v where build_item_id = p_item;
  if p_send then
    perform public.notify_event(b.event_id, 'provider.request', 'Event order to review: ' || o.reference, 'Version ' || v || ' is ready for your approval.', null);
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'hospitality.beo_synced', jsonb_build_object('order', o.reference, 'version', v, 'build_item_id', p_item, 'sent', p_send));
  return jsonb_build_object('order_id', o.id, 'reference', o.reference, 'version', v, 'status', case when p_send then 'sent' else o.status end);
end $$;

-- Legacy BEO editor saves only its text sections; carry the structured hospitality section and money forward so a manual
-- save never drops it, and route approved → revised → sent through legal transitions. Same signature and contract.
create or replace function public.save_event_order(p_job uuid, p_content jsonb, p_financial jsonb, p_note text, p_send boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare j public.provider_jobs; o public.event_orders; v integer; prev public.event_order_versions; content jsonb; fin jsonb;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager','member']);
  if jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 60000 then raise exception 'invalid_content' using errcode = '22023'; end if;
  select * into o from public.event_orders where provider_job_id = j.id for update;
  if not found and j.build_item_id is not null then
    select * into o from public.event_orders where build_item_id = j.build_item_id and workspace_id = j.workspace_id and provider_job_id is null for update;
    if found then update public.event_orders set provider_job_id = j.id where id = o.id; end if;
  end if;
  if o.id is null then
    insert into public.event_orders(workspace_id, build_item_id, provider_job_id, event_id, title, created_by)
      values (j.workspace_id, j.build_item_id, j.id, j.event_id, coalesce(j.event_name, 'Event order'), auth.uid()) returning * into o;
  end if;
  select * into prev from public.event_order_versions where order_id = o.id and version = o.current_version;
  content := p_content; fin := coalesce(p_financial, '{}');
  if prev.content ? 'hospitality' and not (content ? 'hospitality') then content := content || jsonb_build_object('hospitality', prev.content->'hospitality'); end if;
  fin := (select coalesce(jsonb_object_agg(k, val), '{}') from jsonb_each(coalesce(prev.financial, '{}')) x(k, val)
           where k in ('hospitality_minor','catering_minor','bar_minor','schedule_minor','contingent_minor','currency')) || fin;
  v := o.current_version + 1;
  insert into public.event_order_versions(order_id, version, content, financial, note, created_by) values (o.id, v, content, fin, left(coalesce(p_note, ''), 500), auth.uid());
  if o.status = 'approved' then update public.event_orders set status = 'revised' where id = o.id; o.status := 'revised'; end if;
  update public.event_orders set current_version = v, status = case when p_send then 'sent' else o.status end, updated_at = now() where id = o.id;
  if p_send and o.event_id is not null then
    perform public.notify_event(o.event_id, 'provider.request', 'Event order to review: ' || o.reference, 'Version ' || v || ' is ready for your approval.', null);
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', j.workspace_id, 'beo.saved', jsonb_build_object('order', o.reference, 'version', v, 'sent', p_send));
  return o.id;
end $$;

-- Legacy catering RPC (deployed UI): same signature and return contract. The amount on the booking line now comes from the
-- structured lines (hospitality_refresh via trigger) instead of being overwritten with the catering total — venue hire is kept.
create or replace function public.save_catering_selection(p_item uuid, p_menu uuid, p_guests integer, p_items jsonb, p_dietary jsonb, p_style text, p_service_at timestamptz,
  p_staffing text, p_equipment text, p_notes text, p_submit boolean, p_accept_change boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; m public.menus; cur public.catering_selections; price jsonb; prev numeric; due date;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into m from public.menus where id = p_menu and status = 'published';
  if not found or m.listing_id is distinct from b.listing_id and m.workspace_id <> public.listing_workspace(b.listing_id) then raise exception 'invalid_menu' using errcode = '22023'; end if;
  if p_guests is null or p_guests < 1 or p_guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  perform public.hospitality_validate_dietary(coalesce(p_dietary, '{}'), p_guests);
  price := public.catering_price(p_menu, p_guests, p_items);
  select * into cur from public.catering_selections where build_item_id = b.id for update;
  if found and cur.status = 'locked' then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
  if found and public.hospitality_cutoff(cur.final_numbers_due) < now() and not public.hospitality_is_provider(p_item) and cur.guest_count <> p_guests then
    raise exception 'final_numbers_closed' using errcode = '22023';
  end if;
  prev := (cur.price_snapshot->>'total')::numeric;
  if found and cur.status = 'confirmed' and prev is distinct from (price->>'total')::numeric and not p_accept_change then
    return jsonb_build_object('needs_confirmation', true, 'previous_total', prev, 'new_total', price->'total', 'difference', round((price->>'total')::numeric - coalesce(prev, 0), 2),
      'after_deadline', cur.final_numbers_due is not null and current_date > cur.final_numbers_due, 'price', price);
  end if;
  due := coalesce((select (e.starts_at at time zone 'Europe/London')::date from public.events e where e.id = b.event_id) - m.final_numbers_days, null);
  insert into public.catering_selections as c (build_item_id, event_id, menu_id, guest_count, items, dietary_counts, serving_style, service_at, staffing, equipment, notes, final_numbers_due, status, price_snapshot, updated_by)
    values (b.id, b.event_id, p_menu, p_guests, coalesce(p_items, '[]'), coalesce(p_dietary, '{}'), coalesce(p_style, m.serving_style), p_service_at, left(coalesce(p_staffing, ''), 1000),
      left(coalesce(p_equipment, ''), 1000), left(coalesce(p_notes, ''), 2000), due, case when p_submit then 'submitted' else 'draft' end, price, auth.uid())
  on conflict (build_item_id) do update set menu_id = excluded.menu_id, guest_count = excluded.guest_count, items = excluded.items, dietary_counts = excluded.dietary_counts,
    serving_style = excluded.serving_style, service_at = excluded.service_at, staffing = excluded.staffing, equipment = excluded.equipment, notes = excluded.notes,
    final_numbers_due = excluded.final_numbers_due, price_snapshot = excluded.price_snapshot, updated_by = auth.uid(), updated_at = now(),
    status = case when c.status = 'confirmed' then 'confirmed' when p_submit then 'submitted' else c.status end;
  if found and cur.status = 'confirmed' then
    perform public.notify_workspace(m.workspace_id, array['owner','manager'], 'provider.request', 'Catering numbers changed',
      'Guests ' || cur.guest_count || ' → ' || p_guests || ' (total ' || coalesce(prev, 0) || ' → ' || (price->>'total') || ').', '/provider/opportunities/' || b.id);
  end if;
  return jsonb_build_object('saved', true, 'price', price, 'final_numbers_due', due);
end $$;

-- ═══ 12. Budget: hospitality block in the Q15 summary (same signature, superset of keys) ═══
create or replace function public.event_budget_summary(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; target bigint; tot jsonb; cats jsonb; paid bigint; fee bigint; forecast bigint; warn jsonb := '[]'; alloc jsonb; due_soon bigint; hosp jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  target := case when e.budget_total is null then null else round(e.budget_total * 100)::bigint end;
  select coalesce(sum(po.amount_minor - coalesce(po.refunded_minor, 0)), 0), coalesce(sum(po.customer_fee_minor), 0) into paid, fee
    from public.payment_orders po join public.build_items b on b.id = po.build_item_id
   where b.event_id = p_event and po.status not in ('amount_due','payment_pending','failed','cancelled','expired');
  with l as (
    select b.category, b.role, public.build_budget_bucket(b.status) bucket, coalesce(round(b.amount * 100)::bigint, 0) minor, b.amount is null no_price
      from public.build_items b where b.event_id = p_event),
  p as (select * from l where role = 'primary' and bucket <> 'excluded')
  select jsonb_build_object(
      'estimated_minor', coalesce(sum(minor) filter (where bucket = 'estimated'), 0),
      'quoted_minor', coalesce(sum(minor) filter (where bucket = 'quoted'), 0),
      'held_minor', coalesce(sum(minor) filter (where bucket = 'held'), 0),
      'committed_minor', coalesce(sum(minor) filter (where bucket = 'committed'), 0),
      'lines', count(*), 'unpriced_lines', count(*) filter (where no_price),
      'contingency_minor', coalesce((select sum(minor) from l where role <> 'primary' and bucket <> 'excluded'), 0),
      'contingency_lines', (select count(*) from l where role <> 'primary' and bucket <> 'excluded')),
    coalesce((select jsonb_object_agg(category, x) from (
      select p2.category, jsonb_build_object('estimated_minor', coalesce(sum(minor) filter (where bucket = 'estimated'), 0),
        'quoted_minor', coalesce(sum(minor) filter (where bucket = 'quoted'), 0), 'held_minor', coalesce(sum(minor) filter (where bucket = 'held'), 0),
        'committed_minor', coalesce(sum(minor) filter (where bucket = 'committed'), 0), 'lines', count(*)) x
      from p p2 group by p2.category) y), '{}')
    into tot, cats from p;
  forecast := (tot->>'estimated_minor')::bigint + (tot->>'quoted_minor')::bigint + (tot->>'held_minor')::bigint + (tot->>'committed_minor')::bigint;
  alloc := coalesce((select jsonb_object_agg(a->>'key', round((a->>'amount')::numeric * 100)::bigint) from jsonb_array_elements(case when jsonb_typeof(e.settings->'allocation') = 'array' then e.settings->'allocation' else '[]' end) a
                     where a ? 'key' and a ? 'amount'), '{}');
  if alloc = '{}' and target is not null then
    select coalesce(jsonb_object_agg(s.category, round(target * s.share_pct::numeric / nullif(s.total, 0))::bigint), '{}') into alloc
      from (select c.category, c.share_pct, sum(c.share_pct) over () total from public.build_categories_for(e.event_type) c
             where c.category in (select jsonb_object_keys(cats)) or c.need in ('foundation','required')) s;
  end if;
  select coalesce(sum(round(p2.amount * 100)::bigint), 0) into due_soon from public.payments p2
   where p2.event_id = p_event and p2.status in ('scheduled','due','overdue') and p2.due_at < now() + interval '14 days';
  if target is null then warn := warn || jsonb_build_array(jsonb_build_object('code', 'no_budget', 'text', 'Set a total budget to track spend against it.'));
  elsif forecast > target then warn := warn || jsonb_build_array(jsonb_build_object('code', 'over_budget', 'amount_minor', forecast - target, 'text', 'Your planned spend is over budget.'));
  elsif forecast > target * 0.9 then warn := warn || jsonb_build_array(jsonb_build_object('code', 'near_budget', 'amount_minor', target - forecast, 'text', 'Less than 10% of the budget is left.'));
  end if;
  warn := warn || coalesce((select jsonb_agg(jsonb_build_object('code', 'category_over', 'category', k, 'amount_minor',
            ((cats->k->>'estimated_minor')::bigint + (cats->k->>'quoted_minor')::bigint + (cats->k->>'held_minor')::bigint + (cats->k->>'committed_minor')::bigint) - (alloc->>k)::bigint,
            'text', 'Over the planned share for this category.'))
          from jsonb_object_keys(cats) k where alloc ? k and ((cats->k->>'estimated_minor')::bigint + (cats->k->>'quoted_minor')::bigint + (cats->k->>'held_minor')::bigint + (cats->k->>'committed_minor')::bigint) > (alloc->>k)::bigint * 1.1), '[]');
  if (tot->>'unpriced_lines')::int > 0 then warn := warn || jsonb_build_array(jsonb_build_object('code', 'unpriced', 'count', (tot->>'unpriced_lines')::int, 'text', 'Some lines have no price yet; ask for quotes.')); end if;
  if due_soon > 0 then warn := warn || jsonb_build_array(jsonb_build_object('code', 'payment_due_soon', 'amount_minor', due_soon, 'text', 'Payments are due in the next 14 days.')); end if;
  -- Q13 hospitality: already inside the line amounts above (pre-commitment); this block itemises it and flags post-confirmation changes.
  select jsonb_build_object(
      'total_minor', coalesce(sum(h.total_minor), 0), 'catering_minor', coalesce(sum(h.catering_minor), 0), 'bar_minor', coalesce(sum(h.bar_minor), 0),
      'schedule_minor', coalesce(sum(h.schedule_minor), 0), 'contingent_minor', coalesce(sum(h.contingent_minor), 0),
      'adjustment_minor', coalesce(sum(h.adjustment_minor), 0), 'bookings', count(*),
      'allergens', coalesce((select jsonb_agg(distinct a order by a) from public.hospitality_bookings h2, unnest(h2.allergens) a where h2.event_id = p_event and h2.status <> 'cancelled'), '[]'),
      'next_cutoff_at', min(h.cutoff_at) filter (where h.cutoff_at > now()))
    into hosp from public.hospitality_bookings h join public.build_items b on b.id = h.build_item_id
   where h.event_id = p_event and h.status <> 'cancelled' and b.role = 'primary';
  if (hosp->>'adjustment_minor')::bigint <> 0 then
    warn := warn || jsonb_build_array(jsonb_build_object('code', 'hospitality_adjustment', 'amount_minor', (hosp->>'adjustment_minor')::bigint,
      'text', 'Hospitality changed after confirmation; the difference is not yet charged or refunded.'));
  end if;
  if (hosp->>'next_cutoff_at') is not null and (hosp->>'next_cutoff_at')::timestamptz < now() + interval '7 days' then
    warn := warn || jsonb_build_array(jsonb_build_object('code', 'final_numbers_due', 'due_at', hosp->'next_cutoff_at', 'text', 'Final catering numbers are due within 7 days.'));
  end if;
  return jsonb_build_object('event_id', p_event, 'currency', coalesce(e.currency, 'GBP'), 'target_minor', target) || tot || jsonb_build_object(
    'paid_minor', paid, 'booking_fees_paid_minor', fee,
    'outstanding_committed_minor', greatest((tot->>'committed_minor')::bigint - paid, 0),
    'forecast_minor', forecast, 'remaining_minor', case when target is null then null else target - forecast end,
    'remaining_after_committed_minor', case when target is null then null else target - (tot->>'committed_minor')::bigint end,
    'scenarios', jsonb_build_object('committed_only', (tot->>'committed_minor')::bigint,
        'with_holds', (tot->>'committed_minor')::bigint + (tot->>'held_minor')::bigint,
        'with_quotes', (tot->>'committed_minor')::bigint + (tot->>'held_minor')::bigint + (tot->>'quoted_minor')::bigint,
        'everything', forecast, 'everything_with_backups', forecast + (tot->>'contingency_minor')::bigint),
    'categories', cats, 'category_targets_minor', alloc, 'hospitality', hosp, 'warnings', warn, 'computed_at', now());
end $$;

-- ═══ 13. Domain events ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('hospitality.selection_saved', 1, 'build_item', 'A catering or bar selection was saved on a booking line.', null),
  ('hospitality.final_numbers_set', 1, 'build_item', 'Final guest numbers were set for catering.', null),
  ('hospitality.confirmed', 1, 'build_item', 'Hospitality lines were snapshotted at confirmation.', null),
  ('hospitality.beo_synced', 1, 'event_order', 'The structured hospitality section was written into a BEO version.', null),
  ('hospitality.schedule_saved', 1, 'event', 'A hospitality schedule (green room, staff meals, VIP …) was saved.', null),
  ('menu.allergens_changed', 1, 'menu', 'A menu item''s allergen declaration changed.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description, public_type = excluded.public_type, active = true, updated_at = now();

-- ═══ 14. Grants ═══
revoke all on table public.food_allergens, public.food_dietary_tags, public.menu_item_variants, public.bar_selections, public.hospitality_schedules,
  public.hospitality_bookings, public.hospitality_lines from public, anon, authenticated;
grant select on table public.food_allergens, public.food_dietary_tags, public.menu_item_variants to anon, authenticated;
grant insert, update, delete on table public.menu_item_variants to authenticated;
grant select on table public.bar_selections, public.hospitality_schedules, public.hospitality_bookings, public.hospitality_lines to authenticated;
grant all on table public.food_allergens, public.food_dietary_tags, public.menu_item_variants, public.bar_selections, public.hospitality_schedules,
  public.hospitality_bookings, public.hospitality_lines to service_role;

revoke all on function public.menu_items_allergen_guard(), public.hospitality_bump_version(), public.hospitality_cutoff(date), public.hospitality_compute(uuid),
  public.hospitality_refresh(uuid), public.hospitality_freeze(uuid, uuid), public.hospitality_selection_changed(), public.build_items_hospitality_confirm(),
  public.hospitality_is_provider(uuid, text[]), public.hospitality_validate_dietary(jsonb, integer), public.hospitality_beo_section(uuid),
  public.hospitality_save_catering(uuid, jsonb, integer, boolean), public.hospitality_set_final_numbers(uuid, integer, jsonb, integer),
  public.hospitality_save_bar(uuid, jsonb, integer), public.hospitality_save_schedule(uuid, jsonb, uuid, integer), public.hospitality_confirm(uuid),
  public.hospitality_booking(uuid), public.hospitality_event_summary(uuid), public.event_order_sync_hospitality(uuid, boolean, text) from public, anon;
revoke all on function public.hospitality_compute(uuid), public.hospitality_refresh(uuid), public.hospitality_freeze(uuid, uuid), public.hospitality_beo_section(uuid),
  public.hospitality_is_provider(uuid, text[]) from authenticated;
grant execute on function public.hospitality_compute(uuid), public.hospitality_refresh(uuid), public.hospitality_freeze(uuid, uuid), public.hospitality_beo_section(uuid),
  public.hospitality_is_provider(uuid, text[]), public.hospitality_cutoff(date), public.hospitality_validate_dietary(jsonb, integer) to service_role;
grant execute on function public.hospitality_cutoff(date), public.hospitality_validate_dietary(jsonb, integer),
  public.hospitality_save_catering(uuid, jsonb, integer, boolean), public.hospitality_set_final_numbers(uuid, integer, jsonb, integer),
  public.hospitality_save_bar(uuid, jsonb, integer), public.hospitality_save_schedule(uuid, jsonb, uuid, integer), public.hospitality_confirm(uuid),
  public.hospitality_booking(uuid), public.hospitality_event_summary(uuid), public.event_order_sync_hospitality(uuid, boolean, text) to authenticated, service_role;
-- Redefined legacy functions keep their existing grants (create or replace preserves ACLs).
