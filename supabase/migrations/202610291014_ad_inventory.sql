-- Q23 (lane A): owned ad inventory, rotation and impression integrity (domain cards 140–145; backend §13.17: sponsored is
-- labelled and never contaminates organic ranking or reliability).
--   * ad_placements: named slots (discover hero, discover feed positions, category top, search results, event-page related,
--     marketplace top) with capacity, format/size, subject eligibility, the boost products that buy them, CPM floor, frequency cap.
--   * promotion_boosts gains a delivery contract: impression_goal = paid amount at the placement CPM floor, verified delivered
--     impressions/clicks, conversions and attributed revenue, exhaustion and settlement. Listing (marketplace) boosts allowed.
--   * serve_ad_slots(): server-only selection — eligibility (status, schedule window, public subject, targeting by
--     city/category from page context only), budget exhaustion, even pacing over the flight, per-viewer daily frequency cap,
--     one campaign per advertiser per response, weighted rotation by daily budget × pacing deficit, deterministic for a seed.
--   * Impressions count only when the browser that received a server-issued single-use token reports it visible
--     (record_ad_view); clicks are one per token (record_ad_click). Both are service-only and rate-limited per viewer.
--   * record_boost_event (legacy, anon-callable, still called by the deployed discover page) is deduped per viewer per hour
--     and rate-limited per boost; it only touches the legacy counters, never verified delivery or billing.
--   * Last-click (7 day) attribution of ticket orders to boosts, reversed on refund; boost_report() gives the advertiser
--     delivery, pacing, attribution and reconciliation with provenance. Undelivered budget becomes advertiser credit at the end.
-- Additive and backward-compatible: existing functions keep their signatures; promotion_boosts.event_id becomes nullable
-- (listing boosts) with a check that one subject is set; no existing rows change.

-- 1. Placements -------------------------------------------------------------------------------------------------------------------
create table if not exists public.ad_placements (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  surface text not null check (surface in ('discover','search','category','event_page','marketplace','homepage')),
  label text not null,
  format text not null check (format in ('hero','card','row','tile')),
  size text not null,                                   -- creative size the slot renders (CSS px, cover image crop)
  capacity integer not null check (capacity between 1 and 6),
  positions integer[] not null default '{}',             -- feed slots: render after organic item N (never replaces one)
  subject_kinds text[] not null check (subject_kinds <@ array['event','listing']),
  product_placements text[] not null,                   -- boost_products.placement values that buy this inventory
  floor_cpm_minor integer not null check (floor_cpm_minor > 0),   -- pence per 1,000 verified impressions
  freq_cap_per_day integer not null default 3 check (freq_cap_per_day between 1 and 50),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.ad_placements(key, surface, label, format, size, capacity, positions, subject_kinds, product_placements, floor_cpm_minor, freq_cap_per_day) values
  ('discover_hero',   'discover',    'Discover — featured hero',       'hero', '1200x400', 1, '{}',    '{event}',   '{discover,homepage}', 700, 3),
  ('discover_feed',   'discover',    'Discover — in-feed cards',       'card', '360x240',  2, '{4,8}', '{event}',   '{discover}',          400, 4),
  ('category_top',    'category',    'Category — top of results',      'card', '360x240',  1, '{}',    '{event}',   '{category}',          400, 4),
  ('search_results',  'search',      'Search — sponsored results row', 'row',  '360x240',  2, '{}',    '{event}',   '{search}',            500, 4),
  ('event_related',   'event_page',  'Event page — related events',    'card', '360x240',  2, '{}',    '{event}',   '{event_page,discover}', 300, 4),
  ('marketplace_top', 'marketplace', 'Marketplace — top tiles',        'tile', '360x240',  2, '{}',    '{listing}', '{marketplace}',       500, 4)
on conflict (key) do nothing;
alter table public.ad_placements enable row level security;
drop policy if exists ad_placements_read on public.ad_placements;
create policy ad_placements_read on public.ad_placements for select using (active or public.has_admin_permission('commerce'));
revoke all on table public.ad_placements from anon, authenticated;
grant select on table public.ad_placements to anon, authenticated;

-- Marketplace placement for provider listings (bought like any boost; inactive until the provider buy flow ships).
alter table public.boost_products drop constraint if exists boost_products_placement_check;
alter table public.boost_products add constraint boost_products_placement_check check (placement in ('homepage','discover','city','category','search','event_page','email','social','marketplace'));
insert into public.boost_products(key, label, description, placement, price_minor, duration_days, sort, active)
values ('marketplace_spotlight_7d', 'Marketplace Spotlight — 7 days', 'Top tile on the venue and supplier marketplace (labelled Sponsored).', 'marketplace', 3900, 7, 5, false)
on conflict (key) do nothing;

-- 2. Delivery contract on boosts -------------------------------------------------------------------------------------------------
alter table public.promotion_boosts alter column event_id drop not null;
alter table public.promotion_boosts add column if not exists listing_id uuid references public.listings(id) on delete cascade;
alter table public.promotion_boosts drop constraint if exists promotion_boosts_subject_check;
alter table public.promotion_boosts add constraint promotion_boosts_subject_check check (num_nonnulls(event_id, listing_id) = 1);
alter table public.promotion_boosts add column if not exists impression_goal integer check (impression_goal is null or impression_goal > 0);
alter table public.promotion_boosts add column if not exists delivered_impressions bigint not null default 0;
alter table public.promotion_boosts add column if not exists delivered_clicks bigint not null default 0;
alter table public.promotion_boosts add column if not exists conversions integer not null default 0;
alter table public.promotion_boosts add column if not exists attributed_revenue_minor bigint not null default 0;
alter table public.promotion_boosts add column if not exists exhausted_at timestamptz;
alter table public.promotion_boosts add column if not exists settled_at timestamptz;
alter table public.promotion_boosts add column if not exists undelivered_credit_minor integer;

-- Impression goal: what was paid, at the lowest CPM floor among the placements the product buys (advertiser-favourable).
create or replace function public.ad_impression_goal(p_placement text, p_amount integer) returns integer
language sql stable security definer set search_path = '' as $$
  select case when min(p.floor_cpm_minor) is null then null else greatest(1, floor(p_amount * 1000.0 / min(p.floor_cpm_minor)))::integer end
    from public.ad_placements p where p_placement = any(p.product_placements);   -- null: not served by owned inventory (email/social)
$$;
create or replace function public.trg_boost_goal() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.impression_goal is null then new.impression_goal := public.ad_impression_goal(new.placement, new.amount_minor); end if;
  return new;
end $$;
drop trigger if exists gd_boost_goal on public.promotion_boosts;
create trigger gd_boost_goal before insert or update of amount_minor, placement on public.promotion_boosts for each row execute function public.trg_boost_goal();

-- 3. Impression log (service-only) ----------------------------------------------------------------------------------------------
create table if not exists public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  boost_id uuid not null references public.promotion_boosts(id) on delete cascade,
  placement_key text not null references public.ad_placements(key),
  slot integer not null,
  viewer_key text not null,                               -- sha-256 of the user id or an anonymous first-party cookie id; no profile
  ctx jsonb not null default '{}',                        -- page context only (city / category / surface)
  served_at timestamptz not null default now(),
  viewed_at timestamptz, counted boolean not null default false,
  clicked_at timestamptz, click_counted boolean not null default false
);
create index if not exists ad_impressions_viewer_idx on public.ad_impressions(viewer_key, boost_id, served_at desc);
create index if not exists ad_impressions_boost_idx on public.ad_impressions(boost_id, served_at desc);
create index if not exists ad_impressions_click_idx on public.ad_impressions(viewer_key, clicked_at desc) where clicked_at is not null;
alter table public.ad_impressions enable row level security;
revoke all on table public.ad_impressions from anon, authenticated;

create table if not exists public.ad_attributions (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique,                         -- one boost credited per ticket order (last click wins)
  boost_id uuid not null references public.promotion_boosts(id) on delete cascade,
  impression_id uuid references public.ad_impressions(id) on delete set null,
  event_id uuid not null,
  amount_minor bigint not null,                           -- ticket face value (ex booking fee)
  model text not null default 'last_click_7d',
  status text not null default 'attributed' check (status in ('attributed','reversed')),
  attributed_at timestamptz not null default now(), reversed_at timestamptz
);
create index if not exists ad_attributions_boost_idx on public.ad_attributions(boost_id);
create table if not exists public.ad_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  boost_id uuid unique references public.promotion_boosts(id) on delete set null,
  amount_minor integer not null check (amount_minor > 0),
  reason text not null,
  status text not null default 'available' check (status in ('available','applied','refunded','void')),
  created_at timestamptz not null default now()
);
alter table public.ad_attributions enable row level security;
alter table public.ad_credit_ledger enable row level security;
drop policy if exists ad_attributions_read on public.ad_attributions;
create policy ad_attributions_read on public.ad_attributions for select to authenticated
  using (exists (select 1 from public.promotion_boosts b where b.id = boost_id and (public.is_workspace_member(b.workspace_id) or public.has_admin_permission('commerce'))));
drop policy if exists ad_credit_ledger_read on public.ad_credit_ledger;
create policy ad_credit_ledger_read on public.ad_credit_ledger for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'));
revoke all on table public.ad_attributions, public.ad_credit_ledger from anon, authenticated;
grant select on table public.ad_attributions, public.ad_credit_ledger to authenticated;

-- 4. Viewer key: a one-way hash, never the raw id (no cross-site or personal profiling; consent-free first-party frequency capping).
create or replace function public.ad_viewer_key(p_user uuid, p_anon text) returns text
language sql immutable security definer set search_path = '' as $$
  select case when p_user is not null then 'u:' || encode(extensions.digest('gd-ad:' || p_user::text, 'sha256'), 'hex')
              when coalesce(p_anon, '') ~ '^[A-Za-z0-9_-]{16,64}$' then 'a:' || encode(extensions.digest('gd-ad:' || p_anon, 'sha256'), 'hex') end;
$$;

-- Eligible candidates for a placement at p_now with their pacing state (also used by tests and reporting).
create or replace function public.ad_candidates(p_placement text, p_ctx jsonb, p_now timestamptz, p_exclude uuid[] default '{}')
returns table (boost_id uuid, workspace_id uuid, event_id uuid, listing_id uuid, goal integer, delivered bigint, allowed bigint, daily_budget numeric)
language sql stable security definer set search_path = '' as $$
  with pl as (select * from public.ad_placements where key = p_placement and active)
  select b.id, b.workspace_id, b.event_id, b.listing_id, b.impression_goal, b.delivered_impressions,
         -- Even pacing: the share of the flight elapsed plus one hour's allowance, so a daily budget is never spent in the first hour.
         least(b.impression_goal::numeric, ceil(b.impression_goal * (extract(epoch from p_now - b.starts_at) / extract(epoch from b.ends_at - b.starts_at)
           + 3600.0 / extract(epoch from b.ends_at - b.starts_at))))::bigint,
         b.amount_minor / greatest(extract(epoch from b.ends_at - b.starts_at) / 86400.0, 1)
    from public.promotion_boosts b cross join pl
    left join public.events e on e.id = b.event_id
    left join public.listings l on l.id = b.listing_id
   where b.status = 'active' and p_now >= b.starts_at and p_now < b.ends_at
     and b.placement = any(pl.product_placements)
     and b.impression_goal is not null and b.delivered_impressions < b.impression_goal          -- budget exhausted → stops serving
     and ((b.event_id is not null and 'event' = any(pl.subject_kinds) and e.visibility = 'public' and e.status in ('published','on_sale','live')
            and coalesce(e.ends_at, e.starts_at, p_now) >= p_now)
          or (b.listing_id is not null and 'listing' = any(pl.subject_kinds) and l.published and l.paused_at is null))
     and not (coalesce(b.event_id, b.listing_id) = any(coalesce(p_exclude, '{}')))
     -- Targeting from page context only (city / category the visitor chose); untargeted boosts match every context.
     and (p_ctx ->> 'city' is null or coalesce(jsonb_array_length(b.targeting -> 'cities'), 0) = 0
          or exists (select 1 from jsonb_array_elements_text(b.targeting -> 'cities') t(v) where lower(t.v) = lower(p_ctx ->> 'city')))
     and (p_ctx ->> 'category' is null or coalesce(jsonb_array_length(b.targeting -> 'categories'), 0) = 0
          or exists (select 1 from jsonb_array_elements_text(b.targeting -> 'categories') t(v) where lower(t.v) = lower(p_ctx ->> 'category')));
$$;

-- 5. Serving ---------------------------------------------------------------------------------------------------------------------
create or replace function public.serve_ad_slots(p_placement text, p_user uuid, p_anon text, p_ctx jsonb default '{}', p_exclude uuid[] default '{}',
  p_now timestamptz default null, p_seed text default null)
returns table (token text, boost_id uuid, slot integer, subject_kind text, event_id uuid, listing_id uuid)
language plpgsql security definer set search_path = '' as $$
declare pl public.ad_placements; vk text := public.ad_viewer_key(p_user, p_anon); t timestamptz := coalesce(p_now, now()); r record; n integer := 0;
  ctx jsonb := jsonb_strip_nulls(jsonb_build_object('city', nullif(lower(trim(p_ctx ->> 'city')), ''), 'category', nullif(lower(trim(p_ctx ->> 'category')), '')));
begin
  select * into pl from public.ad_placements where key = p_placement and active;
  if not found or vk is null then return; end if;
  if not public.hit_rate_limit('ad-serve:' || vk, 300, 3600) then return; end if;     -- scrapers/bots get no sponsored slots
  for r in
    with c as (
      select a.*, (select count(*) from public.ad_impressions i where i.viewer_key = vk and i.boost_id = a.boost_id and i.served_at >= date_trunc('day', t)) seen
        from public.ad_candidates(p_placement, ctx, t, p_exclude) a
    ), w as (
      select c.*,
        -- Weight: daily budget × pacing deficit (campaigns behind schedule catch up), bounded so nobody starves or floods.
        c.daily_budget * greatest(0.1, least(3.0, (c.allowed - c.delivered)::numeric / greatest(c.goal / greatest(extract(epoch from b.ends_at - b.starts_at) / 3600.0, 1), 1))) weight,
        -- Deterministic uniform draw in (0,1] from the seed: same seed → same rotation (tests), seed rotates per viewer per minute.
        ((('x' || substr(md5(coalesce(p_seed, vk || to_char(t, 'YYYYMMDDHH24MI')) || c.boost_id::text), 1, 8))::bit(32)::bigint + 1) / 4294967297.0) u
        from c join public.promotion_boosts b on b.id = c.boost_id
       where c.delivered < c.allowed and c.seen < pl.freq_cap_per_day
    ), ranked as (
      -- Efraimidis–Spirakis weighted sampling without replacement; fairness: one campaign per advertiser per response.
      select w.*, -ln(w.u) / w.weight k, row_number() over (partition by w.workspace_id order by -ln(w.u) / w.weight) per_ws from w where w.weight > 0
    )
    select * from ranked where per_ws = 1 order by k limit pl.capacity
  loop
    n := n + 1;
    token := encode(extensions.gen_random_bytes(18), 'hex'); boost_id := r.boost_id; slot := n;
    subject_kind := case when r.event_id is not null then 'event' else 'listing' end; event_id := r.event_id; listing_id := r.listing_id;
    insert into public.ad_impressions(token, boost_id, placement_key, slot, viewer_key, ctx, served_at) values (token, r.boost_id, p_placement, n, vk, ctx || jsonb_build_object('surface', pl.surface), t);
    return next;
  end loop;
end $$;

-- Verified view: the browser that received the token reports the slot visible. One count per token, at most one counted view per
-- viewer × boost × placement per 30 minutes, tokens expire after 30 minutes, 240 view reports per viewer per hour.
create or replace function public.record_ad_view(p_token text, p_user uuid, p_anon text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare vk text := public.ad_viewer_key(p_user, p_anon); i public.ad_impressions; dup boolean;
begin
  if vk is null or coalesce(p_token, '') !~ '^[0-9a-f]{36}$' then return false; end if;
  if not public.hit_rate_limit('ad-view:' || vk, 240, 3600) then return false; end if;
  update public.ad_impressions set viewed_at = now() where token = p_token and viewer_key = vk and viewed_at is null and served_at > now() - interval '30 minutes'
    returning * into i;
  if not found then return false; end if;
  select exists (select 1 from public.ad_impressions x where x.viewer_key = vk and x.boost_id = i.boost_id and x.placement_key = i.placement_key and x.counted
                   and x.viewed_at > now() - interval '30 minutes' and x.id <> i.id) into dup;
  if dup then return false; end if;
  update public.promotion_boosts set delivered_impressions = delivered_impressions + 1, impressions = impressions + 1,
         exhausted_at = case when delivered_impressions + 1 >= impression_goal then coalesce(exhausted_at, now()) end, updated_at = now()
   where id = i.boost_id and delivered_impressions < impression_goal;
  if not found then return false; end if;
  update public.ad_impressions set counted = true where id = i.id;
  return true;
end $$;

-- Click: one per token, only from the viewer it was served to, within 24 hours. Returns the same-site destination.
create or replace function public.record_ad_click(p_token text, p_user uuid, p_anon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare vk text := public.ad_viewer_key(p_user, p_anon); i public.ad_impressions; b public.promotion_boosts; href text; counted boolean := false;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{36}$' then return null; end if;
  select * into i from public.ad_impressions where token = p_token and served_at > now() - interval '24 hours';
  if not found then return null; end if;
  select * into b from public.promotion_boosts where id = i.boost_id;
  select case when b.event_id is not null then (select '/events/' || coalesce(e.slug, e.id::text) from public.events e where e.id = b.event_id)
              else (select '/' || case when l.kind = 'venue' then 'venues' else 'services' end || '/' || coalesce(l.slug, l.id::text) from public.listings l where l.id = b.listing_id) end into href;
  if vk is not null and i.viewer_key = vk and i.clicked_at is null and public.hit_rate_limit('ad-click:' || vk, 60, 3600) then
    update public.ad_impressions set clicked_at = now(), click_counted = true where id = i.id and clicked_at is null;
    if found then
      update public.promotion_boosts set delivered_clicks = delivered_clicks + 1, clicks = clicks + 1, updated_at = now() where id = i.boost_id;
      counted := true;
    end if;
  end if;
  return jsonb_build_object('href', href, 'counted', counted);
end $$;

-- 6. Legacy counter (deployed discover page still calls this as anon): dedupe per viewer per hour, cap per boost per minute.
create or replace function public.record_boost_event(p_boost uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  viewer text := coalesce(auth.uid()::text, split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', 'unknown'), ',', 1));
begin
  if p_kind not in ('impression', 'click') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not public.hit_rate_limit('boost-ev:' || p_kind || ':' || p_boost || ':' || encode(extensions.digest(viewer, 'sha256'), 'hex'), 1, 3600) then return; end if;
  if not public.hit_rate_limit('boost-ev-all:' || p_boost, 600, 60) then return; end if;
  update public.promotion_boosts
     set impressions = impressions + (p_kind = 'impression')::int,
         clicks = clicks + (p_kind = 'click')::int
   where id = p_boost and status = 'active'
     and now() >= coalesce(starts_at, now()) and now() < coalesce(ends_at, now() + interval '1 second');
end $$;

-- 7. Attribution: a paid ticket order is credited to the boost whose sponsored slot the buyer last clicked within 7 days. -------
create or replace function public.trg_ad_attribution() returns trigger language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if new.status in ('paid','issued') and (tg_op = 'INSERT' or old.status not in ('paid','issued')) and new.buyer_id is not null then
    select x.id, x.boost_id into i from public.ad_impressions x join public.promotion_boosts b on b.id = x.boost_id
     where x.viewer_key = public.ad_viewer_key(new.buyer_id, null) and b.event_id = new.event_id and x.click_counted
       and x.clicked_at between now() - interval '7 days' and now()
     order by x.clicked_at desc limit 1;
    if found then
      insert into public.ad_attributions(order_ref, boost_id, impression_id, event_id, amount_minor) values (new.order_ref, i.boost_id, i.id, new.event_id, round(new.amount * 100))
      on conflict (order_ref) do nothing;
      if found then update public.promotion_boosts set conversions = conversions + 1, attributed_revenue_minor = attributed_revenue_minor + round(new.amount * 100), updated_at = now() where id = i.boost_id; end if;
    end if;
  elsif tg_op = 'UPDATE' and (new.status = 'refunded' or new.refund_status = 'refunded') and not (old.status = 'refunded' or old.refund_status = 'refunded') then
    with r as (update public.ad_attributions set status = 'reversed', reversed_at = now() where order_ref = new.order_ref and status = 'attributed' returning boost_id, amount_minor)
    update public.promotion_boosts b set conversions = greatest(b.conversions - 1, 0), attributed_revenue_minor = greatest(b.attributed_revenue_minor - r.amount_minor, 0), updated_at = now()
      from r where b.id = r.boost_id;
  end if;
  return new;
end $$;
drop trigger if exists gd_ad_attribution on public.checkout_orders;
create trigger gd_ad_attribution after insert or update of status, refund_status on public.checkout_orders for each row execute function public.trg_ad_attribution();

-- 8. Advertiser report with provenance and reconciliation (members of the advertiser workspace, or commerce admins). ----------
create or replace function public.boost_report(p_boost uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.promotion_boosts; served bigint; viewed bigint; mism jsonb; rec_orders bigint; rec_rev bigint; credit integer;
begin
  select * into b from public.promotion_boosts where id = p_boost;
  if not found or (auth.uid() is not null and not (public.is_workspace_member(b.workspace_id) or public.has_admin_permission('commerce'))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*), count(*) filter (where viewed_at is not null) into served, viewed from public.ad_impressions where boost_id = b.id;
  -- Reconciliation: every live attribution must point at a paid/issued, unrefunded order for the boosted event at the same value.
  select coalesce(jsonb_agg(jsonb_build_object('order_ref', a.order_ref, 'issue',
           case when o.order_ref is null then 'order_missing' when o.event_id <> a.event_id then 'event_mismatch'
                when o.status not in ('paid','issued') or o.refund_status = 'refunded' then 'order_not_paid' else 'amount_mismatch' end)), '[]'::jsonb)
    into mism from public.ad_attributions a left join public.checkout_orders o on o.order_ref = a.order_ref
   where a.boost_id = b.id and a.status = 'attributed'
     and (o.order_ref is null or o.event_id <> a.event_id or o.status not in ('paid','issued') or o.refund_status = 'refunded' or round(o.amount * 100) <> a.amount_minor);
  select count(*), coalesce(sum(round(o.amount * 100)), 0) into rec_orders, rec_rev from public.ad_attributions a join public.checkout_orders o on o.order_ref = a.order_ref
   where a.boost_id = b.id and a.status = 'attributed' and o.status in ('paid','issued') and o.refund_status <> 'refunded';
  select amount_minor into credit from public.ad_credit_ledger where boost_id = b.id;
  return jsonb_build_object('boost_id', b.id, 'status', b.status, 'placement', b.placement, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'amount_minor', b.amount_minor,
    'impression_goal', b.impression_goal, 'served', served, 'viewed', viewed, 'verified_impressions', b.delivered_impressions, 'verified_clicks', b.delivered_clicks,
    'ctr', case when b.delivered_impressions > 0 then round(b.delivered_clicks::numeric / b.delivered_impressions, 4) end,
    'delivered_pct', case when b.impression_goal > 0 then round(100.0 * b.delivered_impressions / b.impression_goal, 1) end,
    'pacing_target_pct', case when now() < b.starts_at then 0 when now() >= b.ends_at then 100 else round(100.0 * extract(epoch from now() - b.starts_at) / extract(epoch from b.ends_at - b.starts_at), 1) end,
    'exhausted_at', b.exhausted_at, 'conversions', b.conversions, 'attributed_revenue_minor', b.attributed_revenue_minor,
    'reconciled', jsonb_build_object('orders', rec_orders, 'revenue_minor', rec_rev, 'matches', rec_orders = b.conversions and rec_rev = b.attributed_revenue_minor and jsonb_array_length(mism) = 0, 'mismatches', mism),
    'undelivered_credit_minor', credit, 'legacy_counters', jsonb_build_object('impressions', b.impressions, 'clicks', b.clicks),
    'provenance', jsonb_build_object(
      'impressions', 'Counted only when a browser that received a server-issued single-use token reports the slot visible; one per viewer per boost per placement per 30 minutes; rate-limited per viewer.',
      'clicks', 'One per served token, same viewer, within 24 hours.',
      'attribution', 'Last sponsored click on this event by the buyer within 7 days before a paid ticket order; reversed when the order is refunded. Ticket face value, excluding booking fees.',
      'pacing', 'Even delivery across the flight with one hour of look-ahead; budget is never spent in the first hour of a day.',
      'credit', 'Undelivered share of the paid amount becomes advertiser credit when the flight ends.'));
end $$;

-- 9. Settlement + retention (every 15 minutes): ended flights credit the undelivered share once; impression rows kept 90 days. --
create or replace function public.ad_settle_boosts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; purged integer;
begin
  for r in select * from public.promotion_boosts where status = 'ended' and settled_at is null and impression_goal is not null for update skip locked loop
    if r.delivered_impressions < r.impression_goal then
      insert into public.ad_credit_ledger(workspace_id, boost_id, amount_minor, reason)
        select r.workspace_id, r.id, floor(r.amount_minor * (r.impression_goal - r.delivered_impressions)::numeric / r.impression_goal)::integer,
               format('Undelivered %s of %s impressions', r.impression_goal - r.delivered_impressions, r.impression_goal)
        where floor(r.amount_minor * (r.impression_goal - r.delivered_impressions)::numeric / r.impression_goal) > 0
      on conflict (boost_id) do nothing;
    end if;
    update public.promotion_boosts set settled_at = now(),
      undelivered_credit_minor = (select amount_minor from public.ad_credit_ledger where boost_id = r.id), updated_at = now() where id = r.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', r.workspace_id, 'promotion.boost_settled',
      jsonb_build_object('boost_id', r.id, 'goal', r.impression_goal, 'delivered', r.delivered_impressions, 'credit_minor', (select amount_minor from public.ad_credit_ledger where boost_id = r.id)));
    n := n + 1;
  end loop;
  delete from public.ad_impressions where served_at < now() - interval '90 days' and id not in (select impression_id from public.ad_attributions where impression_id is not null);
  get diagnostics purged = row_count;
  return jsonb_build_object('settled', n, 'purged', purged);
end $$;
select cron.unschedule('ad-settlement') where exists (select 1 from cron.job where jobname = 'ad-settlement');
select cron.schedule('ad-settlement', '*/15 * * * *', $$select public.ad_settle_boosts()$$);

-- Grants (Q01). record_boost_event stays anon-callable (on the reviewed allowlist) with the new limits; everything new is
-- service-only except boost_report (members, checked inside).
revoke all on function public.ad_impression_goal(text, integer), public.trg_boost_goal(), public.ad_viewer_key(uuid, text),
  public.ad_candidates(text, jsonb, timestamptz, uuid[]), public.serve_ad_slots(text, uuid, text, jsonb, uuid[], timestamptz, text),
  public.record_ad_view(text, uuid, text), public.record_ad_click(text, uuid, text), public.trg_ad_attribution(), public.ad_settle_boosts() from public, anon, authenticated;
grant execute on function public.ad_impression_goal(text, integer), public.ad_viewer_key(uuid, text),
  public.ad_candidates(text, jsonb, timestamptz, uuid[]), public.serve_ad_slots(text, uuid, text, jsonb, uuid[], timestamptz, text),
  public.record_ad_view(text, uuid, text), public.record_ad_click(text, uuid, text), public.ad_settle_boosts() to service_role;
revoke all on function public.boost_report(uuid) from public, anon;
grant execute on function public.boost_report(uuid) to authenticated, service_role;
revoke all on function public.record_boost_event(uuid, text) from public;
grant execute on function public.record_boost_event(uuid, text) to anon, authenticated, service_role;
