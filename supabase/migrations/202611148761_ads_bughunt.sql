-- Q56 ads bug hunt (lane bughunt-ads): matching, delivery integrity, flight dates, undelivered-spend refunds, admin controls.
-- Additive: new columns (nullable or defaulted), new helper/admin/worker functions, and create-or-replace of existing ad functions with
-- unchanged signatures. Fixes:
--   1. Matching: category targeting compared the free-text target ("food drink", prefilled from the event type) with the Discover chip
--      ("food") by exact equality, so Category Spotlight never served; untargeted boosts matched EVERY city/category page (a London club
--      night as the sponsored pick on "Weddings" in Manchester). Now: explicit targets match normalised (either contains the other);
--      untargeted boosts match on the subject's own city / category, the same way the organic list filters. Search Boost matched no
--      query at all — the sponsored search row ignored what was searched; it now needs the query in the subject's name / venue /
--      location / description (organic rule) or a category target. The query is used for matching only and never stored.
--   2. Never served: boosts of suspended advertisers, demo-hidden subjects, trust-held listings, admin-paused boosts.
--   3. Integrity: the advertiser's own team viewing/clicking its ad counted as paid delivery (self-impressions/clicks); two tokens of the
--      same viewer x boost x placement viewed at once both counted (dedupe race, now serialised); views reported after the flight ended
--      or after a pause/refund still counted (and could land after settlement, over-crediting). Frequency-cap day is London time.
--   4. Flights: a boost could be bought for longer than the event lasts (paid days after the event never deliver) — the flight now ends
--      with the event; paying after the chosen start (open checkout, resumed order) silently shortened the paid flight — the flight now
--      starts at payment with its full length; a boost for an event that has ended can't be paid; abandoned checkouts no longer create
--      a new pending boost on every retry (the open one is reused).
--   5. Undelivered spend: settlement wrote "advertiser credit" that nothing could ever spend, while the buy dialog promised refunds.
--      The undelivered share (incl. its VAT) is now refunded to the card automatically (worker: ad_credit_refunds_due → Stripe refund →
--      ad_credit_refund_result); a partial refund of a settled boost no longer flips its status to "refunded".
--   6. Admin: no way to stop an ad. adm_boost_pause (policy takedown, advertiser told) and adm_ad_placement_set (per-slot or '*' kill
--      switch), commerce permission + aal2 + reason + audit.
--   7. Catalogue copy: "Homepage Hero" is served in the Discover hero (there is no homepage slot) and "Search Boost" never ranked an
--      event higher (it is a labelled row) — descriptions corrected (DMCC: the product must be what is described).

-- 1. Columns ---------------------------------------------------------------------------------------------------------------------
alter table public.promotion_boosts add column if not exists paused_at timestamptz;
alter table public.promotion_boosts add column if not exists paused_reason text;
alter table public.promotion_boosts add column if not exists paused_by uuid references auth.users(id) on delete set null;
alter table public.ad_credit_ledger add column if not exists stripe_refund_id text;
alter table public.ad_credit_ledger add column if not exists refunded_minor bigint;
alter table public.ad_credit_ledger add column if not exists refunded_at timestamptz;
alter table public.ad_credit_ledger add column if not exists refund_attempts integer not null default 0;
alter table public.ad_credit_ledger add column if not exists refund_error text;
alter table public.ad_credit_ledger add column if not exists refund_next_at timestamptz;

-- 2. Helpers (service-only) ------------------------------------------------------------------------------------------------------
-- Normalised matching text: lower case, runs of non-alphanumerics → one space ("Food_Drink" → "food drink"). Safe inside LIKE.
create or replace function public.ad_norm(p text) returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), '');
$$;
-- A targeting list (targeting -> 'cities' | 'categories') as normalised text[]; anything that is not an array is "no targeting".
create or replace function public.ad_targets(p jsonb, p_key text) returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x.n) filter (where x.n is not null), '{}')
    from (select public.ad_norm(v) n from jsonb_array_elements_text(case when jsonb_typeof(p -> p_key) = 'array' then p -> p_key else '[]'::jsonb end) v) x;
$$;
-- Is this user on the advertiser's team (owner or active member)? Their own views/clicks are never paid delivery.
create or replace function public.ad_is_advertiser(p_workspace uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (exists (select 1 from public.workspaces w where w.id = p_workspace and w.owner_id = p_user)
    or exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_user and m.status = 'active'));
$$;

-- 3. Eligibility + matching ----------------------------------------------------------------------------------------------------
create or replace function public.ad_candidates(p_placement text, p_ctx jsonb, p_now timestamptz, p_exclude uuid[] default '{}')
returns table (boost_id uuid, workspace_id uuid, event_id uuid, listing_id uuid, goal integer, delivered bigint, allowed bigint, daily_budget numeric)
language sql stable security definer set search_path = '' as $$
  with pl as (select * from public.ad_placements where key = p_placement and active),
  cx as (select public.ad_norm(p_ctx ->> 'city') city, public.ad_norm(p_ctx ->> 'category') cat,
                nullif(lower(btrim(left(coalesce(p_ctx ->> 'q', ''), 80))), '') q)
  select b.id, b.workspace_id, b.event_id, b.listing_id, b.impression_goal, b.delivered_impressions,
         -- Even pacing: the share of the flight elapsed plus one hour's allowance (never more than an hour ahead of even delivery).
         least(b.impression_goal::numeric, ceil(b.impression_goal * (extract(epoch from p_now - b.starts_at) / extract(epoch from b.ends_at - b.starts_at)
           + 3600.0 / extract(epoch from b.ends_at - b.starts_at))))::bigint,
         b.amount_minor / greatest(extract(epoch from b.ends_at - b.starts_at) / 86400.0, 1)
    from public.promotion_boosts b cross join pl cross join cx
    join public.workspaces aw on aw.id = b.workspace_id
    left join public.events e on e.id = b.event_id
    left join public.listings l on l.id = b.listing_id
    left join public.listing_taxonomy lt on lt.listing_id = l.id
    cross join lateral (select public.ad_targets(b.targeting, 'cities') cities, public.ad_targets(b.targeting, 'categories') cats) tg
   where b.status = 'active' and b.paused_at is null and p_now >= b.starts_at and p_now < b.ends_at
     and coalesce(aw.status, 'active') <> 'suspended'
     and b.placement = any(pl.product_placements)
     and b.impression_goal is not null and b.delivered_impressions < b.impression_goal          -- budget exhausted → stops serving
     and ((b.event_id is not null and 'event' = any(pl.subject_kinds) and e.visibility = 'public' and e.status in ('published','on_sale','live')
            and coalesce(e.ends_at, e.starts_at, p_now) >= p_now and not public.demo_hidden_for_viewer(e.workspace_id))
          or (b.listing_id is not null and 'listing' = any(pl.subject_kinds) and l.published and l.paused_at is null
            and not public.trust_listing_held(l.id) and not public.demo_hidden_for_viewer(l.workspace_id)))
     and not (coalesce(b.event_id, b.listing_id) = any(coalesce(p_exclude, '{}')))
     -- City (page context only): explicit targets decide; untargeted boosts match only subjects in that city (organic rule).
     and (cx.city is null
          or (cardinality(tg.cities) > 0 and cx.city = any(tg.cities))
          or (cardinality(tg.cities) = 0 and (public.ad_norm(coalesce(e.city, l.city)) = cx.city
                or ' ' || coalesce(public.ad_norm(coalesce(e.location, l.location)), '') || ' ' like '% ' || cx.city || ' %')))
     -- Category: explicit targets match either way round ("food drink" ~ "food"); untargeted → the subject's own type/tags/category.
     and (cx.cat is null
          or (cardinality(tg.cats) > 0 and exists (select 1 from unnest(tg.cats) c where c like '%' || cx.cat || '%' or cx.cat like '%' || c || '%'))
          or (cardinality(tg.cats) = 0 and (
                (e.id is not null and (coalesce(public.ad_norm(e.event_type), '') like '%' || cx.cat || '%'
                  or exists (select 1 from unnest(coalesce(e.tags, '{}')) t where coalesce(public.ad_norm(t), '') like '%' || cx.cat || '%')))
                or (l.id is not null and (coalesce(public.ad_norm(l.category), '') like '%' || cx.cat || '%'
                  or coalesce(public.ad_norm(lt.build_category), '') like '%' || cx.cat || '%' or coalesce(public.ad_norm(lt.service_category), '') like '%' || cx.cat || '%')))))
     -- Search query (search_results): the organic text rule (name / venue / location / description), or a category target.
     and (cx.q is null
          or (e.id is not null and (strpos(lower(e.name), cx.q) > 0 or strpos(lower(coalesce(e.venue_name, '')), cx.q) > 0
                or strpos(lower(coalesce(e.location, '')), cx.q) > 0 or strpos(lower(coalesce(e.description, '')), cx.q) > 0))
          or (l.id is not null and (strpos(lower(l.name), cx.q) > 0 or strpos(lower(coalesce(l.category, '')), cx.q) > 0))
          or exists (select 1 from unnest(tg.cats) c where c = public.ad_norm(cx.q)));
$$;

-- 4. Serving: the query is matched but never stored; frequency-cap day in London time; deterministic tie-break. ------------------
create or replace function public.serve_ad_slots(p_placement text, p_user uuid, p_anon text, p_ctx jsonb default '{}', p_exclude uuid[] default '{}',
  p_now timestamptz default null, p_seed text default null)
returns table (token text, boost_id uuid, slot integer, subject_kind text, event_id uuid, listing_id uuid)
language plpgsql security definer set search_path = '' as $$
declare pl public.ad_placements; vk text := public.ad_viewer_key(p_user, p_anon); t timestamptz := coalesce(p_now, now()); r record; n integer := 0;
  ctx jsonb := jsonb_strip_nulls(jsonb_build_object('city', nullif(lower(trim(p_ctx ->> 'city')), ''), 'category', nullif(lower(trim(p_ctx ->> 'category')), '')));
  mctx jsonb := ctx || jsonb_strip_nulls(jsonb_build_object('q', nullif(lower(trim(left(p_ctx ->> 'q', 80))), '')));
  day0 timestamptz := (date_trunc('day', coalesce(p_now, now()) at time zone 'Europe/London')) at time zone 'Europe/London';
begin
  select * into pl from public.ad_placements where key = p_placement and active;
  if not found or vk is null then return; end if;
  if not public.hit_rate_limit('ad-serve:' || vk, 300, 3600) then return; end if;     -- scrapers/bots get no sponsored slots
  for r in
    with c as (
      select a.*, (select count(*) from public.ad_impressions i where i.viewer_key = vk and i.boost_id = a.boost_id and i.served_at >= day0) seen
        from public.ad_candidates(p_placement, mctx, t, p_exclude) a
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
      select w.*, -ln(w.u) / w.weight k, row_number() over (partition by w.workspace_id order by -ln(w.u) / w.weight, w.boost_id) per_ws from w where w.weight > 0
    )
    select * from ranked where per_ws = 1 order by k, boost_id limit pl.capacity
  loop
    n := n + 1;
    token := encode(extensions.gen_random_bytes(18), 'hex'); boost_id := r.boost_id; slot := n;
    subject_kind := case when r.event_id is not null then 'event' else 'listing' end; event_id := r.event_id; listing_id := r.listing_id;
    insert into public.ad_impressions(token, boost_id, placement_key, slot, viewer_key, ctx, served_at) values (token, r.boost_id, p_placement, n, vk, ctx || jsonb_build_object('surface', pl.surface), t);
    return next;
  end loop;
end $$;

-- 5. Verified view: not the advertiser's own team; serialised dedupe; only while the boost is live. --------------------------------
create or replace function public.record_ad_view(p_token text, p_user uuid, p_anon text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare vk text := public.ad_viewer_key(p_user, p_anon); i public.ad_impressions; dup boolean; ws uuid;
begin
  if vk is null or coalesce(p_token, '') !~ '^[0-9a-f]{36}$' then return false; end if;
  if not public.hit_rate_limit('ad-view:' || vk, 240, 3600) then return false; end if;
  update public.ad_impressions set viewed_at = now() where token = p_token and viewer_key = vk and viewed_at is null and served_at > now() - interval '30 minutes'
    returning * into i;
  if not found then return false; end if;
  select b.workspace_id into ws from public.promotion_boosts b where b.id = i.boost_id;
  if public.ad_is_advertiser(ws, p_user) then return false; end if;                       -- self-impression: shown, never billed
  -- Two tokens of the same viewer × boost × placement reported at once must count once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ad-view:' || vk || ':' || i.boost_id || ':' || i.placement_key, 0));
  select exists (select 1 from public.ad_impressions x where x.viewer_key = vk and x.boost_id = i.boost_id and x.placement_key = i.placement_key and x.counted
                   and x.viewed_at > now() - interval '30 minutes' and x.id <> i.id) into dup;
  if dup then return false; end if;
  update public.promotion_boosts set delivered_impressions = delivered_impressions + 1, impressions = impressions + 1,
         exhausted_at = case when delivered_impressions + 1 >= impression_goal then coalesce(exhausted_at, now()) end, updated_at = now()
   where id = i.boost_id and delivered_impressions < impression_goal
     and status = 'active' and paused_at is null and now() < ends_at;                    -- never after the flight / a pause / a refund
  if not found then return false; end if;
  update public.ad_impressions set counted = true where id = i.id;
  return true;
end $$;

-- Click: unchanged contract; the advertiser's own team clicking its ad is not counted (and so never attributed).
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
  if vk is not null and i.viewer_key = vk and i.clicked_at is null and not public.ad_is_advertiser(b.workspace_id, p_user)
     and public.hit_rate_limit('ad-click:' || vk, 60, 3600) then
    update public.ad_impressions set clicked_at = now(), click_counted = true where id = i.id and clicked_at is null;
    if found then
      update public.promotion_boosts set delivered_clicks = delivered_clicks + 1, clicks = clicks + 1, updated_at = now() where id = i.boost_id;
      counted := true;
    end if;
  end if;
  return jsonb_build_object('href', href, 'counted', counted);
end $$;

-- 6. Buying: flight ends with the event; targets normalised; an open pending boost is reused (no duplicate per retry). ----------
create or replace function public.create_promotion_boost(p_event uuid, p_product text, p_starts_at timestamptz default null, p_targeting jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.boost_products; v uuid; s timestamptz := greatest(coalesce(p_starts_at, now()), now()); fin timestamptz; ev_end timestamptz; tg jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.visibility <> 'public' or e.status not in ('published','on_sale','live') then raise exception 'event_not_public' using errcode = '22023'; end if;
  if (select w.status from public.workspaces w where w.id = e.workspace_id) = 'suspended' then raise exception 'workspace_suspended' using errcode = '42501'; end if;
  select * into p from public.boost_products where key = p_product and active;
  if not found then raise exception 'unknown_product' using errcode = '22023'; end if;
  fin := s + make_interval(days => p.duration_days);
  ev_end := coalesce(e.ends_at, e.starts_at);
  if ev_end is not null then
    if ev_end <= s + interval '1 hour' then raise exception 'event_too_soon' using errcode = '22023'; end if;
    fin := least(fin, ev_end);                                                -- paid impressions are delivered before the event ends
  end if;
  tg := jsonb_build_object('cities', to_jsonb((public.ad_targets(p_targeting, 'cities'))[1:5]), 'categories', to_jsonb((public.ad_targets(p_targeting, 'categories'))[1:5]));
  select b.id into v from public.promotion_boosts b where b.event_id = e.id and b.product_key = p.key and b.status = 'pending_payment'
     and b.created_by is not distinct from auth.uid() order by b.created_at desc limit 1 for update;
  if found then
    update public.promotion_boosts set starts_at = s, ends_at = fin, targeting = tg, updated_at = now() where id = v;
    return v;
  end if;
  insert into public.promotion_boosts(workspace_id, event_id, product_key, placement, targeting, amount_minor, currency, starts_at, ends_at, created_by)
    values (e.workspace_id, e.id, p.key, p.placement, tg, p.price_minor, p.currency, s, fin, auth.uid())
    returning id into v;
  return v;
end $$;

-- A boost whose flight or event is already over can't be paid (it would only ever be refunded).
create or replace function public.create_boost_payment_order(p_boost uuid) returns public.payment_orders
language plpgsql security definer set search_path = '' as $$
declare b public.promotion_boosts; p public.boost_products; po public.payment_orders; okey text;
begin
  select * into b from public.promotion_boosts where id = p_boost for update;
  if not found or not public.has_workspace_role(b.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status <> 'pending_payment' then raise exception 'nothing_due' using errcode = '22023'; end if;
  if b.ends_at <= now() + interval '1 hour'
     or (b.event_id is not null and not exists (select 1 from public.events e where e.id = b.event_id and e.visibility = 'public' and e.status in ('published','on_sale','live')
           and coalesce(e.ends_at, e.starts_at, now() + interval '2 hours') > now() + interval '1 hour')) then
    raise exception 'boost_expired' using errcode = '22023';
  end if;
  select * into p from public.boost_products where key = b.product_key;
  okey := 'platform_boost:' || b.id;
  select * into po from public.payment_orders where idempotency_key = okey;
  if found then
    if po.status = 'failed' then update public.payment_orders set status = 'amount_due', failure_reason = null, stripe_checkout_session = null, updated_at = now() where id = po.id returning * into po; end if;
    if po.status in ('amount_due','payment_pending') then return po; end if;
    raise exception 'already_paid' using errcode = '22023';
  end if;
  insert into public.payment_orders(kind, payer_id, event_id, payee_workspace_id, description, amount_minor, currency, platform_fee_minor, commission, strategy, protected, idempotency_key)
    values ('platform_boost', auth.uid(), b.event_id, null, p.label, b.amount_minor, b.currency, b.amount_minor, jsonb_build_object('source', 'platform_boost', 'product', p.key), 'platform', false, okey)
    returning * into po;
  update public.promotion_boosts set payment_order_id = po.id, updated_at = now() where id = b.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', b.workspace_id, 'payment.order_created', jsonb_build_object('payment_order', po.reference, 'kind', 'platform_boost', 'amount_minor', po.amount_minor, 'boost_id', b.id));
  return po;
end $$;

-- Payment → boost: a late payment gets the full paid flight from now (clipped to the event); a partial refund of a settled boost
-- (the undelivered-share refund) keeps its delivery status; a full refund, or any refund before settlement, stops it.
create or replace function public.trg_boost_payment_state() returns trigger language plpgsql security definer set search_path = '' as $$
declare b public.promotion_boosts; ns timestamptz; ne timestamptz; ev_end timestamptz;
begin
  if new.kind <> 'platform_boost' or new.status is not distinct from old.status then return new; end if;
  if new.status in ('payment_succeeded','protected_pending_delivery') then
    for b in select * from public.promotion_boosts where payment_order_id = new.id and status = 'pending_payment' for update loop
      ns := b.starts_at; ne := b.ends_at;
      if b.starts_at < now() then
        ns := now(); ne := now() + (b.ends_at - b.starts_at);
        select coalesce(e.ends_at, e.starts_at) into ev_end from public.events e where e.id = b.event_id;
        if ev_end is not null then ne := least(ne, greatest(ev_end, ns + interval '1 minute')); end if;
      end if;
      update public.promotion_boosts set starts_at = ns, ends_at = ne, status = case when ns <= now() then 'active' else 'scheduled' end, updated_at = now() where id = b.id;
    end loop;
    insert into public.audit_events(actor_type, workspace_id, event, metadata)
      select 'webhook', x.workspace_id, 'promotion.boost_paid', jsonb_build_object('boost_id', x.id, 'payment_order', new.reference) from public.promotion_boosts x where x.payment_order_id = new.id;
  elsif new.status in ('refunded','partially_refunded') then
    update public.promotion_boosts set status = 'refunded', updated_at = now()
     where payment_order_id = new.id and status <> 'refunded' and (new.status = 'refunded' or settled_at is null);
  end if;
  return new;
end $$;

-- 7. Undelivered spend → card refund (worker in src/lib/commerce/orchestrator.ts processBoostRefunds). ---------------------------
-- The ledger amount is the ex-VAT share; the refund is the same share of what was charged (VAT included), capped at what is left.
create or replace function public.ad_credit_refunds_due(p_livemode boolean, p_limit integer default 20)
returns table (ledger_id uuid, boost_id uuid, workspace_id uuid, payment_order text, payment_intent text, refund_minor bigint, attempt integer)
language sql stable security definer set search_path = '' as $$
  select l.id, b.id, l.workspace_id, po.reference, po.stripe_payment_intent,
         least(round(l.amount_minor::numeric * po.amount_minor / nullif(b.amount_minor, 0)), po.amount_minor - po.refunded_minor)::bigint, l.refund_attempts
    from public.ad_credit_ledger l
    join public.promotion_boosts b on b.id = l.boost_id
    join public.payment_orders po on po.id = b.payment_order_id and po.kind = 'platform_boost'
   where l.status = 'available' and l.refund_attempts < 5 and (l.refund_next_at is null or l.refund_next_at <= now())
     and po.status in ('payment_succeeded','partially_refunded') and coalesce(po.livemode, false) = coalesce(p_livemode, false)
     and po.stripe_payment_intent ~ '^pi_[A-Za-z0-9]+$'                    -- real Stripe intents only (spec fixtures use pi_test_…)
     and po.amount_minor - po.refunded_minor > 0
   order by l.created_at
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.ad_credit_refund_result(p_ledger uuid, p_refund text, p_amount bigint, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.ad_credit_ledger; b public.promotion_boosts;
begin
  if p_error is null then
    if coalesce(p_refund, '') !~ '^re_[A-Za-z0-9]+$' or coalesce(p_amount, 0) <= 0 then raise exception 'invalid_refund' using errcode = '22023'; end if;
    update public.ad_credit_ledger set status = 'refunded', stripe_refund_id = p_refund, refunded_minor = p_amount, refunded_at = now(), refund_error = null
     where id = p_ledger and status = 'available' returning * into l;
    if not found then return; end if;
    select * into b from public.promotion_boosts where id = l.boost_id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', l.workspace_id, 'promotion.boost_refunded',
      jsonb_build_object('boost_id', l.boost_id, 'ledger_id', l.id, 'refund', p_refund, 'amount_minor', p_amount));
    perform public.notify_workspace(l.workspace_id, array['owner','manager','finance'], 'promotion.boost', 'Boost refund: £' || to_char(p_amount / 100.0, 'FM999999990.00'),
      'Impressions your boost did not deliver have been refunded to your card (including VAT). It can take 5–10 days to appear.',
      case when b.event_id is not null then '/organizer/events/' || b.event_id || '/promotion?tab=boosts' end);
  else
    update public.ad_credit_ledger set refund_attempts = refund_attempts + 1, refund_error = left(p_error, 300),
           refund_next_at = now() + make_interval(hours => power(2, least(refund_attempts, 6))::integer)
     where id = p_ledger and status = 'available' returning * into l;
    if found and l.refund_attempts >= 5 then
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', l.workspace_id, 'promotion.boost_refund_failed',
        jsonb_build_object('boost_id', l.boost_id, 'ledger_id', l.id, 'error', left(p_error, 300)));
    end if;
  end if;
end $$;

-- 8. Report: refund state + pause, corrected provenance wording. -------------------------------------------------------------------
create or replace function public.boost_report(p_boost uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.promotion_boosts; served bigint; viewed bigint; mism jsonb; rec_orders bigint; rec_rev bigint; cl public.ad_credit_ledger;
begin
  select * into b from public.promotion_boosts where id = p_boost;
  if not found or (auth.uid() is not null and not (public.is_workspace_member(b.workspace_id) or public.has_admin_permission('commerce'))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*), count(*) filter (where viewed_at is not null) into served, viewed from public.ad_impressions where boost_id = b.id;
  select coalesce(jsonb_agg(jsonb_build_object('order_ref', a.order_ref, 'issue',
           case when o.order_ref is null then 'order_missing' when o.event_id <> a.event_id then 'event_mismatch'
                when o.status not in ('paid','issued') or o.refund_status = 'refunded' then 'order_not_paid' else 'amount_mismatch' end)), '[]'::jsonb)
    into mism from public.ad_attributions a left join public.checkout_orders o on o.order_ref = a.order_ref
   where a.boost_id = b.id and a.status = 'attributed'
     and (o.order_ref is null or o.event_id <> a.event_id or o.status not in ('paid','issued') or o.refund_status = 'refunded' or round(o.amount * 100) <> a.amount_minor);
  select count(*), coalesce(sum(round(o.amount * 100)), 0) into rec_orders, rec_rev from public.ad_attributions a join public.checkout_orders o on o.order_ref = a.order_ref
   where a.boost_id = b.id and a.status = 'attributed' and o.status in ('paid','issued') and o.refund_status <> 'refunded';
  select * into cl from public.ad_credit_ledger where boost_id = b.id;
  return jsonb_build_object('boost_id', b.id, 'status', b.status, 'placement', b.placement, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'amount_minor', b.amount_minor,
    'paused_at', b.paused_at, 'paused_reason', b.paused_reason,
    'impression_goal', b.impression_goal, 'served', served, 'viewed', viewed, 'verified_impressions', b.delivered_impressions, 'verified_clicks', b.delivered_clicks,
    'ctr', case when b.delivered_impressions > 0 then round(b.delivered_clicks::numeric / b.delivered_impressions, 4) end,
    'delivered_pct', case when b.impression_goal > 0 then round(100.0 * b.delivered_impressions / b.impression_goal, 1) end,
    'pacing_target_pct', case when now() < b.starts_at then 0 when now() >= b.ends_at then 100 else round(100.0 * extract(epoch from now() - b.starts_at) / extract(epoch from b.ends_at - b.starts_at), 1) end,
    'exhausted_at', b.exhausted_at, 'conversions', b.conversions, 'attributed_revenue_minor', b.attributed_revenue_minor,
    'reconciled', jsonb_build_object('orders', rec_orders, 'revenue_minor', rec_rev, 'matches', rec_orders = b.conversions and rec_rev = b.attributed_revenue_minor and jsonb_array_length(mism) = 0, 'mismatches', mism),
    'undelivered_credit_minor', cl.amount_minor,
    'undelivered_refund', case when cl.id is null then null else jsonb_build_object('status', cl.status, 'refunded_minor', cl.refunded_minor, 'refunded_at', cl.refunded_at) end,
    'legacy_counters', jsonb_build_object('impressions', b.impressions, 'clicks', b.clicks),
    'provenance', jsonb_build_object(
      'impressions', 'Counted only when a browser that received a server-issued single-use token reports the slot at least half visible for one second; one per viewer per boost per placement per 30 minutes; rate-limited per viewer; never your own team, never after the flight ends or while paused.',
      'clicks', 'One per served token, same viewer, within 24 hours; your own team''s clicks are not counted.',
      'attribution', 'Last sponsored click on this event by the buyer within 7 days before a paid ticket order; reversed when the order is refunded. Ticket face value, excluding booking fees.',
      'pacing', 'Even delivery across the flight, never more than one hour ahead of an even pace.',
      'credit', 'When the flight ends, the share of impressions not delivered is refunded to the card it was paid with, VAT included.'));
end $$;

-- 9. Admin controls (commerce permission + two-step verification + reason; audited; the advertiser is told). --------------------
create or replace function public.adm_boost_pause(p_boost uuid, p_pause boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.promotion_boosts;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.promotion_boosts set paused_at = case when p_pause then now() end, paused_reason = case when p_pause then left(trim(p_reason), 500) end,
         paused_by = case when p_pause then auth.uid() end, updated_at = now()
   where id = p_boost and status in ('active','scheduled') and ((paused_at is null) = coalesce(p_pause, false))
   returning * into b;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', b.workspace_id,
    case when p_pause then 'promotion.boost_paused' else 'promotion.boost_resumed' end, jsonb_build_object('boost_id', b.id, 'reason', left(trim(p_reason), 300)));
  perform public.notify_workspace(b.workspace_id, array['owner','manager'], 'promotion.boost',
    case when p_pause then 'Your boost was paused by Gala Dock' else 'Your boost is running again' end,
    case when p_pause then 'Reason: ' || left(trim(p_reason), 300) || '. Paused time is not charged: undelivered impressions are refunded when the flight ends.' else 'Delivery has resumed.' end,
    case when b.event_id is not null then '/organizer/events/' || b.event_id || '/promotion?tab=boosts' end);
end $$;

-- p_key '*' switches every placement (the ads kill switch).
create or replace function public.adm_ad_placement_set(p_key text, p_active boolean, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.ad_placements set active = coalesce(p_active, false), updated_at = now() where (p_key = '*' or key = p_key) and active is distinct from coalesce(p_active, false);
  get diagnostics n = row_count;
  if n = 0 and not exists (select 1 from public.ad_placements where p_key = '*' or key = p_key) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'promotion.placement_set',
    jsonb_build_object('key', p_key, 'active', coalesce(p_active, false), 'changed', n, 'reason', left(trim(p_reason), 300)));
  return n;
end $$;

-- 10. Catalogue copy matches what is delivered. -----------------------------------------------------------------------------------
update public.boost_products set label = 'Discover Hero — 3 days', description = 'Rotating featured hero at the top of Discover (labelled Sponsored).'
 where key = 'homepage_hero_3d' and description = 'Rotating hero slot on the Gala Dock homepage.';
update public.boost_products set description = 'A labelled Sponsored row above matching search results. Organic ranking is never changed.'
 where key = 'search_boost_14d' and description = 'Ranks your event higher in matching searches (labelled Sponsored).';

-- 11. Grants ------------------------------------------------------------------------------------------------------------------------
revoke all on function public.ad_norm(text), public.ad_targets(jsonb, text), public.ad_is_advertiser(uuid, uuid),
  public.ad_credit_refunds_due(boolean, integer), public.ad_credit_refund_result(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.ad_norm(text), public.ad_targets(jsonb, text), public.ad_is_advertiser(uuid, uuid),
  public.ad_credit_refunds_due(boolean, integer), public.ad_credit_refund_result(uuid, text, bigint, text) to service_role;
revoke all on function public.adm_boost_pause(uuid, boolean, text), public.adm_ad_placement_set(text, boolean, text) from public, anon;
grant execute on function public.adm_boost_pause(uuid, boolean, text), public.adm_ad_placement_set(text, boolean, text) to authenticated, service_role;
