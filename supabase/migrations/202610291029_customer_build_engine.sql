-- Q15 Customer Event Builder (lane A, 2026-10-29; domains 45–50, backend §13.14, v6 GD-03.7). Additive.
-- Canonical build = the event (events) + its lines (build_items) + bookings/holds/standby/order groups from Q10–Q12.
-- This migration adds what was missing: type-aware category master data, immutable build versions, suggestion feedback,
-- live budget states in integer minor units, deterministic (non-AI) planning guidance, venue-first dependencies,
-- package composition, supplier conditional holds, backups, marketplace checkout via order groups (one direct charge per
-- child seller, Q07/Q10) and the professional upgrade with workspace creation. No AI anywhere (owner decision 2026-10-28).

-- ───────────── Type-aware build categories (master data; extends Q02 taxonomy build_category) ─────────────
create table if not exists public.build_category_profiles (
  event_type text not null,                    -- events.event_type key, or '*' = default for any type
  category text not null,                      -- taxonomy_terms(build_category).key
  need text not null check (need in ('foundation','required','optional')),
  share_pct integer not null default 0 check (share_pct between 0 and 100),   -- default budget share (normalised over the categories in use)
  book_by_days integer not null default 60 check (book_by_days between 0 and 730), -- recommended lead time before the event
  depends_on_venue boolean not null default true,  -- venue-first: needs the venue/date settled before holds and payment
  label text,                                  -- per-type wording ("Supervision & Safety", "Artists & Line-up")
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (event_type, category)
);
alter table public.build_category_profiles enable row level security;
revoke all on table public.build_category_profiles from public, anon, authenticated;
grant select on table public.build_category_profiles to anon, authenticated;
grant all on table public.build_category_profiles to service_role;
drop policy if exists build_category_profiles_read on public.build_category_profiles;
create policy build_category_profiles_read on public.build_category_profiles for select to anon, authenticated using (true);

insert into public.build_category_profiles(event_type, category, need, share_pct, book_by_days, depends_on_venue, label, sort) values
  ('*','venue','foundation',35,120,false,null,1), ('*','food','required',25,60,true,null,2), ('*','drinks','optional',12,45,true,null,3),
  ('*','entertainment','optional',12,60,true,null,4), ('*','media','optional',7,60,true,null,5), ('*','styling','optional',7,45,true,null,6),
  ('*','staff','optional',5,30,true,null,7), ('*','production','optional',6,45,true,null,8), ('*','hire','optional',4,30,true,null,9),
  ('*','transport','optional',4,30,true,null,10), ('*','extras','optional',3,21,true,null,11),
  ('wedding','venue','foundation',35,365,false,null,1), ('wedding','food','required',25,240,true,null,2), ('wedding','drinks','optional',15,180,true,null,3),
  ('wedding','entertainment','optional',10,240,true,null,4), ('wedding','styling','optional',8,150,true,null,5), ('wedding','media','required',7,270,true,'Photography & video',6),
  ('wedding','transport','optional',3,90,true,null,7), ('wedding','extras','optional',2,60,true,null,8),
  ('birthday','venue','foundation',35,60,false,null,1), ('birthday','food','required',25,30,true,null,2), ('birthday','drinks','optional',15,30,true,null,3),
  ('birthday','entertainment','optional',15,45,true,null,4), ('birthday','media','optional',5,30,true,null,5), ('birthday','styling','optional',5,21,true,null,6),
  ('birthday','extras','optional',3,14,true,null,7),
  ('childrens_party','venue','foundation',30,45,false,null,1), ('childrens_party','entertainment','required',35,45,true,'Age-suitable entertainers',2),
  ('childrens_party','food','required',25,21,true,null,3), ('childrens_party','staff','required',5,30,true,'Supervision & Safety',4), ('childrens_party','extras','optional',5,14,true,'Activities',5),
  ('corporate','venue','foundation',40,120,false,null,1), ('corporate','food','required',30,60,true,null,2), ('corporate','production','required',12,60,true,null,3),
  ('corporate','drinks','optional',10,45,true,null,4), ('corporate','media','optional',8,45,true,null,5),
  ('festival','venue','foundation',25,365,false,'Site',1), ('festival','production','required',20,180,true,null,2), ('festival','entertainment','required',35,240,true,'Artists & Line-up',3),
  ('festival','staff','required',10,90,true,null,4), ('festival','food','optional',5,90,true,null,5), ('festival','drinks','optional',3,90,true,null,6), ('festival','hire','optional',2,60,true,null,7),
  ('private_dinner','venue','foundation',40,45,false,null,1), ('private_dinner','food','required',35,30,true,null,2), ('private_dinner','drinks','optional',15,30,true,null,3),
  ('private_dinner','styling','optional',7,21,true,null,4), ('private_dinner','extras','optional',3,14,true,null,5),
  ('webinar','production','foundation',60,30,false,'Streaming & Production',1), ('webinar','media','optional',25,21,false,'Access & Recording',2), ('webinar','extras','optional',15,14,false,null,3)
on conflict (event_type, category) do nothing;

-- Categories for an event type (type rows first, else defaults). Public master data.
create or replace function public.build_categories_for(p_event_type text)
returns setof public.build_category_profiles language sql stable set search_path to '' as $$
  select p.* from public.build_category_profiles p
   where p.event_type = case when exists(select 1 from public.build_category_profiles x where x.event_type = coalesce(p_event_type, '*')) then coalesce(p_event_type, '*') else '*' end
   order by p.sort, p.category
$$;

-- ───────────── Build versions (immutable snapshots) and suggestion feedback ─────────────
create table if not exists public.build_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null,
  label text not null default '',
  snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (event_id, version)
);
alter table public.build_versions enable row level security;
revoke all on table public.build_versions from public, anon, authenticated;
grant select on table public.build_versions to authenticated;
grant all on table public.build_versions to service_role;
drop policy if exists build_versions_read on public.build_versions;
create policy build_versions_read on public.build_versions for select to authenticated using (public.can_access_event(event_id));

create table if not exists public.build_suggestion_feedback (
  event_id uuid not null references public.events(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  category text,
  action text not null check (action in ('dismissed','not_relevant','too_expensive','unavailable','saved')),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (event_id, listing_id)
);
alter table public.build_suggestion_feedback enable row level security;
revoke all on table public.build_suggestion_feedback from public, anon, authenticated;
grant select on table public.build_suggestion_feedback to authenticated;
grant all on table public.build_suggestion_feedback to service_role;
drop policy if exists build_suggestion_feedback_read on public.build_suggestion_feedback;
create policy build_suggestion_feedback_read on public.build_suggestion_feedback for select to authenticated using (public.can_access_event(event_id));

-- ───────────── Budget states ─────────────
create or replace function public.build_budget_bucket(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case
    when p_status in ('draft','suggested','enquiry_created','requested','sent','awaiting','awaiting_provider','clarification','clarification_requested') then 'estimated'
    when p_status in ('available','quoted','quote_received','quote_revised','customer_reviewing') then 'quoted'
    when p_status in ('hold','held','conditional_hold_requested','conditionally_held','awaiting_payment','awaiting_confirmation') then 'held'
    when p_status in ('confirmed','active','fulfilled','completion_pending','completed','cancellation_requested','disputed') then 'committed'
    else 'excluded' end
$$;

-- Live budget for one event, all money in integer minor units (pence). Estimates vs quoted vs held vs committed vs paid.
-- Primary lines only count towards spend; backups/standby are shown as contingency. Paid = settled payment orders on the
-- event's lines (Q07: payment_order_succeeded is the authority) net of refunds, excluding the customer booking fee.
create or replace function public.event_budget_summary(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; target bigint; tot jsonb; cats jsonb; paid bigint; fee bigint; forecast bigint; warn jsonb := '[]'; alloc jsonb; due_soon bigint;
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
  -- Category targets: the plan's own allocation if saved, else the type profile shares normalised over categories in use.
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
  return jsonb_build_object('event_id', p_event, 'currency', coalesce(e.currency, 'GBP'), 'target_minor', target) || tot || jsonb_build_object(
    'paid_minor', paid, 'booking_fees_paid_minor', fee,
    'outstanding_committed_minor', greatest((tot->>'committed_minor')::bigint - paid, 0),
    'forecast_minor', forecast, 'remaining_minor', case when target is null then null else target - forecast end,
    'remaining_after_committed_minor', case when target is null then null else target - (tot->>'committed_minor')::bigint end,
    'scenarios', jsonb_build_object('committed_only', (tot->>'committed_minor')::bigint,
        'with_holds', (tot->>'committed_minor')::bigint + (tot->>'held_minor')::bigint,
        'with_quotes', (tot->>'committed_minor')::bigint + (tot->>'held_minor')::bigint + (tot->>'quoted_minor')::bigint,
        'everything', forecast, 'everything_with_backups', forecast + (tot->>'contingency_minor')::bigint),
    'categories', cats, 'category_targets_minor', alloc, 'warnings', warn, 'computed_at', now());
end $$;

-- ───────────── Venue-first dependencies ─────────────
-- Per line: what it waits for. Suppliers (profile depends_on_venue) need the date and a venue that is at least held
-- (or recorded off-platform) before holds and payment; a confirmed venue releases them fully.
create or replace function public.build_dependency_state(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; v public.build_items; venue_state text;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v from public.build_items b where b.event_id = p_event and b.category = 'venue' and b.role = 'primary' and public.build_budget_bucket(b.status) <> 'excluded'
   order by case public.build_budget_bucket(b.status) when 'committed' then 0 when 'held' then 1 when 'quoted' then 2 else 3 end, b.sort limit 1;
  venue_state := case when coalesce((e.settings->>'venue_confirmed')::boolean, false) then 'confirmed_off_platform'
    when v.id is null then 'missing' else public.build_budget_bucket(v.status) end;
  return jsonb_build_object('event_id', p_event, 'date_set', e.starts_at is not null, 'venue_item_id', v.id, 'venue_state', venue_state,
    'venue_gates_suppliers', coalesce((e.settings->>'venue_gates_suppliers')::boolean, false),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', b.id, 'category', b.category, 'status', b.status, 'role', b.role,
        'depends_on', case when b.category = 'venue' or not coalesce(c.depends_on_venue, true) then '[]'::jsonb else jsonb_build_array('date', 'venue') end,
        'blocked_reason', case
          when e.starts_at is null and b.category <> 'venue' and coalesce(c.depends_on_venue, true) then 'date_required'
          when b.category <> 'venue' and coalesce(c.depends_on_venue, true) and venue_state in ('missing','estimated','quoted') then 'venue_required'
          else null end,
        'conditional_on_venue', b.category <> 'venue' and coalesce(c.depends_on_venue, true) and venue_state = 'held') order by b.sort)
      from public.build_items b left join public.build_categories_for(e.event_type) c on c.category = b.category
      where b.event_id = p_event and public.build_budget_bucket(b.status) <> 'excluded'), '[]'));
end $$;

-- ───────────── Deterministic planning guidance (rules, no AI) ─────────────
create or replace function public.event_planning_guidance(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; days integer; lead integer; window_state text; final_days integer; steps jsonb := '[]'; cats jsonb; dl jsonb; pays jsonb; dates jsonb := '[]';
  dep jsonb; vlist uuid; d date; n integer := 0; av text;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  days := case when e.starts_at is null then null else greatest(0, (e.starts_at::date - current_date)) end;
  select coalesce(max(c.book_by_days), 90) into lead from public.build_categories_for(e.event_type) c;
  window_state := case when days is null then 'no_date' when days >= lead then 'comfortable' when days >= lead / 2 then 'tight' else 'late' end;
  final_days := case when e.event_type in ('wedding','festival') then 21 else 14 end;
  dep := public.build_dependency_state(p_event);
  -- Per-category booking deadlines (book-by = event date − lead time from the type profile).
  select coalesce(jsonb_agg(jsonb_build_object('category', c.category, 'label', coalesce(c.label, t.label, c.category), 'need', c.need,
      'book_by', case when e.starts_at is null then null else (e.starts_at::date - c.book_by_days) end,
      'state', case
        when exists(select 1 from public.build_items b where b.event_id = p_event and b.category = c.category and b.role = 'primary' and public.build_budget_bucket(b.status) = 'committed') then 'done'
        when exists(select 1 from public.build_items b where b.event_id = p_event and b.category = c.category and b.role = 'primary' and public.build_budget_bucket(b.status) in ('held','quoted','estimated')) then 'in_progress'
        when e.starts_at is not null and (e.starts_at::date - c.book_by_days) < current_date then 'overdue'
        when e.starts_at is not null and (e.starts_at::date - c.book_by_days) < current_date + 14 then 'due_soon'
        else 'not_started' end) order by c.sort), '[]')
    into cats from public.build_categories_for(e.event_type) c left join public.taxonomy_terms t on t.taxonomy = 'build_category' and t.key = c.category;
  -- Supplier deadlines: response clocks and hold expiries on open lines.
  select coalesce(jsonb_agg(x order by x->>'due_at'), '[]') into dl from (
    select jsonb_build_object('build_item_id', b.id, 'title', b.title, 'kind', 'response', 'due_at', b.response_deadline) x from public.build_items b
     where b.event_id = p_event and b.response_deadline is not null and b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline > now() - interval '1 day'
    union all
    select jsonb_build_object('build_item_id', b.id, 'title', b.title, 'kind', 'hold_expires', 'due_at', b.hold_expires_at) from public.build_items b
     where b.event_id = p_event and b.hold_expires_at is not null and b.status in ('held','conditionally_held') and b.hold_expires_at > now()) s;
  select coalesce(jsonb_agg(jsonb_build_object('payee', p2.payee, 'kind', p2.kind, 'amount_minor', round(p2.amount * 100)::bigint, 'due_at', p2.due_at, 'status', p2.status) order by p2.due_at), '[]')
    into pays from public.payments p2 where p2.event_id = p_event and p2.status in ('scheduled','due','overdue');
  -- Recommended dates: only when the chosen venue is not free on the date (or there is no date) — next free Saturdays on its calendar.
  vlist := nullif(dep->>'venue_item_id', '')::uuid;
  if vlist is not null then
    select b.listing_id into vlist from public.build_items b where b.id = vlist;
    if vlist is not null and (e.starts_at is null or public.listing_availability(vlist, e.starts_at, coalesce(e.ends_at, e.starts_at + interval '6 hours')) = 'unavailable') then
      d := current_date + ((6 - extract(isodow from current_date)::int + 7) % 7) + 14;
      while n < 3 and d < current_date + 400 loop
        av := public.listing_availability(vlist, (d + time '18:00') at time zone coalesce(e.timezone, 'Europe/London'), (d + time '23:00') at time zone coalesce(e.timezone, 'Europe/London'));
        if av = 'available' then dates := dates || jsonb_build_array(jsonb_build_object('date', d, 'reason', 'Venue calendar open on this Saturday')); n := n + 1; end if;
        d := d + 7;
      end loop;
    end if;
  end if;
  -- Next steps (ordered, plain language).
  if e.starts_at is null then steps := steps || jsonb_build_array(jsonb_build_object('code', 'set_date', 'text', 'Add your event date — providers need it to check availability.')); end if;
  if dep->>'venue_state' in ('missing') then steps := steps || jsonb_build_array(jsonb_build_object('code', 'choose_venue', 'text', 'Choose a venue first; other suppliers depend on the venue and date.'));
  elsif dep->>'venue_state' in ('estimated','quoted') then steps := steps || jsonb_build_array(jsonb_build_object('code', 'secure_venue', 'text', 'Hold or book the venue before holding suppliers.'));
  elsif dep->>'venue_state' = 'held' then steps := steps || jsonb_build_array(jsonb_build_object('code', 'confirm_venue', 'text', 'Pay the venue deposit to confirm it; supplier holds are conditional on it.')); end if;
  steps := steps || coalesce((select jsonb_agg(jsonb_build_object('code', 'book_' || (c->>'category'), 'category', c->>'category', 'text', 'Book ' || lower(c->>'label') || case when c->>'state' = 'overdue' then ' — this is past the usual booking window.' else ' soon.' end))
     from jsonb_array_elements(cats) c where c->>'state' in ('overdue','due_soon') and c->>'need' <> 'optional'), '[]');
  if exists(select 1 from public.build_items b where b.event_id = p_event and public.build_budget_bucket(b.status) = 'quoted' and b.role = 'primary') then
    steps := steps || jsonb_build_array(jsonb_build_object('code', 'review_quotes', 'text', 'Review your quotes and pay deposits to confirm.')); end if;
  if days is not null and days <= final_days + 7 then steps := steps || jsonb_build_array(jsonb_build_object('code', 'final_numbers', 'text', 'Send final guest numbers to your caterer and venue.')); end if;
  return jsonb_build_object('event_id', p_event, 'source', 'rules:v1', 'ai', false,
    'planning_window', jsonb_build_object('days_to_event', days, 'recommended_lead_days', lead, 'state', window_state),
    'final_numbers_due', case when e.starts_at is null then null else e.starts_at::date - final_days end,
    'booking_deadlines', cats, 'supplier_deadlines', dl, 'payment_dates', pays, 'recommended_dates', dates, 'next_steps', steps,
    'readiness', (select jsonb_build_object('done', count(*) filter (where c->>'state' = 'done' and c->>'need' <> 'optional'), 'of', count(*) filter (where c->>'need' <> 'optional')) from jsonb_array_elements(cats) c));
end $$;

-- ───────────── Commands ─────────────
-- Package composition: add a provider package as a build line with a snapshot of its terms (estimate in minor units).
create or replace function public.build_add_package(p_event uuid, p_package uuid, p_role text default 'primary')
returns uuid language plpgsql security definer set search_path to '' as $$
declare e public.events; k public.packages; l public.listings; cat text; guests integer; est numeric; id uuid; n integer;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('completed','cancelled','archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_role not in ('primary','backup') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select * into k from public.packages where id = p_package and status = 'published';
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  select * into l from public.listings where id = k.listing_id and published and paused_at is null;
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  guests := greatest(coalesce(e.guest_count, 0), 1);
  if (k.min_guests is not null and guests < k.min_guests) or (k.max_guests is not null and guests > k.max_guests) then
    raise exception 'package_guest_range:%-%', coalesce(k.min_guests, 0), coalesce(k.max_guests, 0) using errcode = '22023';
  end if;
  if exists(select 1 from public.build_items b where b.event_id = p_event and b.listing_id = l.id and public.build_budget_bucket(b.status) <> 'excluded') then
    raise exception 'already_in_build' using errcode = '23505';
  end if;
  select coalesce(t.meta->>'build', case when l.kind = 'venue' then 'venue' else 'extras' end) into cat
    from (select 1) x left join public.taxonomy_terms t on t.taxonomy = 'service_category' and t.key = lower(l.category);
  if l.kind = 'venue' then cat := 'venue'; end if;
  est := case when k.price_basis in ('per_person','per_guest','per_head') then k.base_price * guests else k.base_price end;
  select count(*) into n from public.build_items where event_id = p_event;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, quote, status, role, sort)
    values (p_event, l.id, cat, l.name, k.name, left(coalesce(k.description, ''), 500), coalesce(nullif(k.image, ''), l.image), round(est, 2),
      case when k.price_basis in ('per_person','per_guest','per_head') then 'per_person' else 'estimate' end,
      jsonb_build_object('package_id', k.id, 'package_name', k.name, 'base_price_minor', round(k.base_price * 100)::bigint, 'price_basis', k.price_basis,
        'guests', guests, 'deposit_pct', k.deposit_pct, 'inclusions', coalesce(k.inclusions, '[]'), 'add_ons', coalesce(k.add_ons, '[]'), 'snapshotted_at', now()),
      'suggested', p_role, n + 1)
    returning build_items.id into id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'build_engine.package_added', jsonb_build_object('event_id', p_event, 'build_item_id', id, 'package_id', k.id));
  return id;
end $$;

-- Supplier conditional hold, venue-first: needs the date; a supplier hold is conditional on the venue line until the venue
-- is confirmed; refused when there is no venue at all (unless one was recorded off-platform).
create or replace function public.build_request_hold(p_item uuid, p_hours integer, p_conditions text default '')
returns uuid language plpgsql security definer set search_path to '' as $$
declare b public.build_items; dep jsonb; line jsonb; depends uuid;
begin
  select * into b from public.build_items where id = p_item;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  dep := public.build_dependency_state(b.event_id);
  select x into line from jsonb_array_elements(dep->'lines') x where (x->>'build_item_id')::uuid = b.id;
  if not (dep->>'date_set')::boolean then raise exception 'date_required' using errcode = '22023'; end if;
  if line->>'blocked_reason' = 'venue_required' and dep->>'venue_state' = 'missing' then raise exception 'venue_required' using errcode = '22023'; end if;
  if b.category <> 'venue' and jsonb_array_length(coalesce(line->'depends_on', '[]')) > 0 and dep->>'venue_state' not in ('committed','confirmed_off_platform') then
    depends := nullif(dep->>'venue_item_id', '')::uuid;
  end if;
  return public.request_conditional_hold(p_item, p_hours, depends,
    coalesce(nullif(p_conditions, ''), case when depends is not null then 'Conditional on the venue being confirmed.' else '' end));
end $$;

-- Backup option for a line (same category, different provider). Standby with a fee goes through request_standby (Q10).
create or replace function public.build_add_backup(p_primary uuid, p_listing uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare p public.build_items; l public.listings; id uuid;
begin
  select * into p from public.build_items where id = p_primary;
  if not found or not public.can_edit_event(p.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into l from public.listings where id = p_listing and published and paused_at is null;
  if not found then raise exception 'listing_unavailable' using errcode = '22023'; end if;
  if l.id = p.listing_id or (p.listing_id is not null and l.workspace_id = public.listing_workspace(p.listing_id)) then raise exception 'backup_same_provider' using errcode = '22023'; end if;
  if exists(select 1 from public.build_items b where b.event_id = p.event_id and b.listing_id = l.id and public.build_budget_bucket(b.status) <> 'excluded') then
    raise exception 'already_in_build' using errcode = '23505';
  end if;
  insert into public.build_items(event_id, listing_id, category, title, package, image, amount, price_basis, quote, status, role, sort)
    values (p.event_id, l.id, p.category, l.name, l.category, l.image, l.price_from, 'estimate', jsonb_build_object('backup_for', p.id), 'suggested', 'backup', p.sort)
    returning build_items.id into id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'build_engine.backup_added', jsonb_build_object('primary', p.id, 'backup', id));
  return id;
end $$;

-- Dismiss / give feedback on a suggestion (recommendations then exclude it). Idempotent.
create or replace function public.build_suggestion_feedback_set(p_event uuid, p_listing uuid, p_action text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action not in ('dismissed','not_relevant','too_expensive','unavailable','saved','clear') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if p_action = 'clear' then delete from public.build_suggestion_feedback where event_id = p_event and listing_id = p_listing; return; end if;
  insert into public.build_suggestion_feedback(event_id, listing_id, category, action, created_by)
    values (p_event, p_listing, (select case when kind = 'venue' then 'venue' end from public.listings where id = p_listing), p_action, auth.uid())
    on conflict (event_id, listing_id) do update set action = excluded.action, created_by = excluded.created_by, created_at = now();
end $$;

-- Immutable build version (compare/duplicate source). Concurrency: one version number per event, serialised per event.
create or replace function public.build_snapshot(p_event uuid, p_label text default '')
returns integer language plpgsql security definer set search_path to '' as $$
declare v integer; e public.events;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event for update;
  select coalesce(max(version), 0) + 1 into v from public.build_versions where event_id = p_event;
  insert into public.build_versions(event_id, version, label, created_by, snapshot) values (p_event, v, left(coalesce(p_label, ''), 120), auth.uid(),
    jsonb_build_object('event', jsonb_build_object('name', e.name, 'event_type', e.event_type, 'starts_at', e.starts_at, 'guest_count', e.guest_count, 'budget_minor', round(e.budget_total * 100)::bigint),
      'lines', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', b.id, 'category', b.category, 'title', b.title, 'listing_id', b.listing_id, 'status', b.status,
          'role', b.role, 'amount_minor', round(b.amount * 100)::bigint, 'package', b.package, 'package_id', b.quote->>'package_id') order by b.sort) from public.build_items b where b.event_id = p_event), '[]'),
      'budget', public.event_budget_summary(p_event)));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', e.workspace_id, 'build_engine.snapshot_created', jsonb_build_object('event_id', p_event, 'version', v));
  return v;
end $$;

-- Marketplace checkout (domains 47.7 / 113–114): one order group over the chosen lines (venue first; suppliers depend on
-- the venue line), then one payment order per child line, each payable to its own seller (a Stripe direct charge on that
-- seller's connected account when paid — never a pooled cart). Partial payment is recoverable: every child stands alone.
create or replace function public.build_checkout(p_event uuid, p_items uuid[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare e public.events; dep jsonb; venue uuid; gid uuid; b public.build_items; po public.payment_orders; charges jsonb := '[]'; payload jsonb := '[]'; i uuid; existing uuid;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('completed','cancelled','archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_items is null or cardinality(p_items) = 0 or cardinality(p_items) > 30 then raise exception 'items_required' using errcode = '22023'; end if;
  if e.starts_at is null then raise exception 'date_required' using errcode = '22023'; end if;
  perform public.advisory_xact_lock('build_checkout', p_event::text);
  dep := public.build_dependency_state(p_event);
  -- The venue line in this checkout (if any) is the dependency for supplier lines.
  select b2.id into venue from public.build_items b2 where b2.id = any(p_items) and b2.category = 'venue' limit 1;
  foreach i in array p_items loop
    select * into b from public.build_items where id = i;
    if not found or b.event_id <> p_event then raise exception 'item_not_in_event' using errcode = '22023'; end if;
    if b.listing_id is null or b.amount is null or b.amount <= 0 then raise exception 'not_payable:%', b.id using errcode = '22023'; end if;
    if b.category <> 'venue' and venue is null and exists(select 1 from jsonb_array_elements(dep->'lines') x where (x->>'build_item_id')::uuid = b.id and x->>'blocked_reason' = 'venue_required') then
      raise exception 'venue_required' using errcode = '22023';
    end if;
    payload := payload || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('build_item_id', b.id, 'depends_on', case when b.category <> 'venue' and venue is not null then venue end)));
  end loop;
  -- Re-use a live group that already holds exactly these lines (idempotent retry), else create one.
  select g.id into existing from public.order_groups g where g.event_id = p_event and g.status not in ('cancelled','failed','completed')
     and (select array_agg(x.build_item_id order by x.build_item_id) from public.order_group_items x where x.group_id = g.id and x.removed_at is null)
         = (select array_agg(u order by u) from unnest(p_items) u)
   order by g.created_at desc limit 1;
  gid := coalesce(existing, public.order_group_create(p_event, payload));
  foreach i in array p_items loop
    select * into b from public.build_items where id = i;
    if b.status in ('confirmed','active','fulfilled','completion_pending','completed') then
      charges := charges || jsonb_build_array(jsonb_build_object('build_item_id', b.id, 'seller_workspace_id', public.listing_workspace(b.listing_id), 'state', 'confirmed'));
      continue;
    end if;
    begin
      po := public.create_payment_order('deposit', b.id, null);
      update public.payment_orders set order_group = coalesce(order_group, (select reference from public.order_groups where id = gid)) where id = po.id;
      charges := charges || jsonb_build_array(jsonb_build_object('build_item_id', b.id, 'seller_workspace_id', po.payee_workspace_id, 'state', 'payment_due',
        'payment_reference', po.reference, 'amount_minor', po.amount_minor, 'customer_fee_minor', po.customer_fee_minor, 'currency', po.currency));
    exception when others then
      -- One child failing to start (expired quote, hold lapsed…) never blocks the others.
      charges := charges || jsonb_build_array(jsonb_build_object('build_item_id', b.id, 'seller_workspace_id', public.listing_workspace(b.listing_id), 'state', 'blocked', 'reason', sqlerrm));
    end;
  end loop;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', e.workspace_id, 'build_engine.checkout_started',
    jsonb_build_object('event_id', p_event, 'order_group_id', gid, 'children', cardinality(p_items)));
  perform public.emit_domain_event('build_engine.checkout_started', e.workspace_id, jsonb_build_object('event_id', p_event, 'order_group_id', gid, 'children', cardinality(p_items)),
    auth.uid(), 'user', 'event', p_event::text);
  return jsonb_build_object('order_group_id', gid, 'charges', charges,
    'sellers', (select count(distinct c->>'seller_workspace_id') from jsonb_array_elements(charges) c), 'pooled', false);
end $$;

-- Professional upgrade (domain 50): keeps the canonical event id and every record; creates an Organizer workspace when the
-- customer has none (or uses one they own/manage). Idempotent: an already-professional event returns its workspace.
create or replace function public.customer_upgrade_to_organizer(p_event uuid, p_workspace uuid default null, p_name text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare e public.events; ws uuid; nm text;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.management = 'professional' and e.workspace_id is not null then return e.workspace_id; end if;
  ws := p_workspace;
  if ws is null then
    select w.id into ws from public.workspaces w join public.workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','manager')
      where w.kind = 'organizer' and w.status = 'active' order by (w.owner_id = auth.uid()) desc, w.created_at limit 1;
  end if;
  if ws is null then
    nm := left(coalesce(nullif(trim(p_name), ''), (select nullif(trim(p.full_name), '') || ' Events' from public.profiles p where p.id = auth.uid()), 'My Events'), 80);
    insert into public.workspaces(owner_id, kind, name, settings, onboarding_complete, onboarding_step, capabilities)
      values (auth.uid(), 'organizer', nm, jsonb_build_object('created_from', 'customer_upgrade', 'source_event', p_event), true, 'complete', '{}')
      returning id into ws;
    perform public.emit_domain_event('workspace.created', ws, jsonb_build_object('kind', 'organizer', 'source', 'customer_upgrade'), auth.uid(), 'user', 'workspace', ws::text);
  end if;
  perform public.upgrade_event_to_professional(p_event, ws);
  perform public.emit_domain_event('event.upgraded_to_organizer', ws, jsonb_build_object('event_id', p_event, 'workspace_id', ws), auth.uid(), 'user', 'event', p_event::text);
  return ws;
end $$;

-- One read for the build canvas (UI / API): categories for the type, lines with canonical status, dependencies, budget,
-- guidance, order groups and versions.
create or replace function public.event_build_canvas(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'event_type', e.event_type, 'status', e.status, 'management', e.management, 'starts_at', e.starts_at,
      'guest_count', e.guest_count, 'city', e.city, 'currency', coalesce(e.currency, 'GBP')),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', c.category, 'label', coalesce(c.label, t.label, c.category), 'need', c.need,
        'share_pct', c.share_pct, 'depends_on_venue', c.depends_on_venue,
        'lines', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', b.id, 'title', b.title, 'listing_id', b.listing_id, 'status', b.status,
            'canonical_status', public.booking_canonical_status(b.status), 'bucket', public.build_budget_bucket(b.status), 'role', b.role,
            'amount_minor', round(b.amount * 100)::bigint, 'package', b.package, 'package_id', b.quote->>'package_id', 'backup_for', b.quote->>'backup_for') order by b.sort)
          from public.build_items b where b.event_id = p_event and b.category = c.category), '[]')) order by c.sort)
      from public.build_categories_for(e.event_type) c left join public.taxonomy_terms t on t.taxonomy = 'build_category' and t.key = c.category), '[]'),
    'other_lines', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', b.id, 'category', b.category, 'title', b.title, 'status', b.status, 'role', b.role))
      from public.build_items b where b.event_id = p_event and b.category not in (select c.category from public.build_categories_for(e.event_type) c)), '[]'),
    'dependencies', public.build_dependency_state(p_event),
    'budget', public.event_budget_summary(p_event),
    'guidance', public.event_planning_guidance(p_event),
    'order_groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'reference', g.reference, 'status', g.status, 'totals', g.totals) order by g.created_at)
      from public.order_groups g where g.event_id = p_event), '[]'),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'label', v.label, 'created_at', v.created_at) order by v.version desc)
      from public.build_versions v where v.event_id = p_event), '[]'));
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('build_engine.checkout_started', 1, 'event', 'A buyer started a multi-seller checkout for event build lines (one payment per child seller).', null),
  ('event.upgraded_to_organizer', 1, 'event', 'A consumer event moved to an Organizer workspace (same canonical event id).', null),
  ('workspace.created', 1, 'workspace', 'A workspace was created.', null)
on conflict (event_type) do nothing;

do $$ declare f text; begin
  foreach f in array array['public.event_budget_summary(uuid)', 'public.build_dependency_state(uuid)', 'public.event_planning_guidance(uuid)',
      'public.build_add_package(uuid,uuid,text)', 'public.build_request_hold(uuid,integer,text)', 'public.build_add_backup(uuid,uuid)',
      'public.build_suggestion_feedback_set(uuid,uuid,text)', 'public.build_snapshot(uuid,text)', 'public.build_checkout(uuid,uuid[])',
      'public.customer_upgrade_to_organizer(uuid,uuid,text)', 'public.event_build_canvas(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.build_categories_for(text)', 'public.build_budget_bucket(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
