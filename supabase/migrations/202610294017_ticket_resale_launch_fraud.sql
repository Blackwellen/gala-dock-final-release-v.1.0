-- Q22 Ticket Resale / Launch / Waiting / Fraud (backend domains 99–102). Lane D, 2026-10-29. Additive, backward-compatible.
-- Already in place and kept: official resale RPCs (list_ticket_for_resale, hold_resale, issue_resale — the old entitlement becomes
-- `resold` and a new one is issued in the same transaction, credential rotation by tickets_credential_rotate), waiting room
-- (launch_queue: FIFO positions, rate-based admission, single-use admission consumed by the order), sold-out waitlist with
-- 30-minute timed offers (notify_waitlists / claim_waitlist_offer), launch states (event_launch_state).
-- New here:
--   A. Versioned resale policy per jurisdiction (price cap vs face value, listing cut-off, active-listing limit, required
--      disclosures, legal text flagged for review). Published versions are immutable; never a claim of legal compliance.
--   B. Listing disclosure snapshots (ticket_resale_listings): face value, price, seat/zone, restrictions, policy version.
--   C. Resale settlement switch: organiser buy-back (default; the resale is a direct charge on the organiser's account and the
--      seller is compensated by a refund of their original payment) or customer Connect (BLOCKED: customers have no Connect).
--   D. Bot / velocity controls: per-account and per-client velocity, per-event purchase limit, chargeback flags. Flags go to a
--      review queue; the only automatic action is a short, expiring checkout pause — never a silent or permanent ban.
--   E. Launch state understands release kinds (presale-only access, final release).

-- ── A. Resale policy ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.resale_policies (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  effective_from timestamptz not null default now(),
  price_cap_pct numeric not null default 100 check (price_cap_pct > 0 and price_cap_pct <= 1000),
  cap_basis text not null default 'face_value' check (cap_basis in ('face_value')),
  listing_cutoff_hours integer not null default 0 check (listing_cutoff_hours between 0 and 720),
  max_active_listings_per_user integer check (max_active_listings_per_user is null or max_active_listings_per_user >= 1),
  required_disclosures text[] not null default array['face_value', 'seat_or_zone', 'restrictions', 'ticket_terms'],
  legal_text text not null default '',
  legal_review_status text not null default 'needs_review' check (legal_review_status in ('needs_review', 'reviewed')),
  legal_reviewed_by uuid,
  legal_reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (jurisdiction, version)
);
alter table public.resale_policies enable row level security;
drop policy if exists resale_policies_read on public.resale_policies;
create policy resale_policies_read on public.resale_policies for select to anon, authenticated using (status in ('published', 'retired'));
drop policy if exists resale_policies_admin_read on public.resale_policies;
create policy resale_policies_admin_read on public.resale_policies for select to authenticated using (public.has_admin_permission('tickets'));
revoke all on public.resale_policies from anon, authenticated;
grant select on public.resale_policies to anon, authenticated;
grant all on public.resale_policies to service_role;

-- Published rules are history: only retirement and the legal-review stamp may change; a new rule is a new version.
create or replace function public.resale_policies_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    if old.status <> 'draft' then raise exception 'resale_policy_immutable' using errcode = '22023'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.jurisdiction, new.version, new.effective_from, new.price_cap_pct, new.cap_basis, new.listing_cutoff_hours,
      new.max_active_listings_per_user, new.required_disclosures, new.legal_text) is distinct from (old.jurisdiction, old.version, old.effective_from,
      old.price_cap_pct, old.cap_basis, old.listing_cutoff_hours, old.max_active_listings_per_user, old.required_disclosures, old.legal_text) then
    raise exception 'resale_policy_immutable' using errcode = '22023';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then raise exception 'resale_policy_immutable' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists resale_policies_immutable on public.resale_policies;
create trigger resale_policies_immutable before update or delete on public.resale_policies for each row execute function public.resale_policies_immutable();

-- GB v1 mirrors today's behaviour (cap = the published ticketing.resale_cap_pct, default face value). Legal text is a draft.
insert into public.resale_policies(jurisdiction, version, status, effective_from, price_cap_pct, listing_cutoff_hours, legal_text, legal_review_status)
select 'GB', 1, 'published', '2026-10-01T00:00:00Z',
  coalesce((select (value->>'resale_cap_pct')::numeric from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1), 100), 0,
  'DRAFT — requires legal review before reliance; this text is not a statement of legal compliance. Secondary ticketing information '
  || 'shown to buyers (Consumer Rights Act 2015 ss.90–91 as amended): the face value, the seat or standing area, and any restriction '
  || 'on who may use the ticket. Resale on Gala Dock is the organiser''s official resale at no more than the listed cap.', 'needs_review'
where not exists (select 1 from public.resale_policies where jurisdiction = 'GB' and version = 1);

-- The policy in force for an event: its jurisdiction (events.settings.jurisdiction, default GB), latest published version.
create or replace function public.resale_policy_for(p_event uuid)
returns public.resale_policies language sql stable security definer set search_path = '' as $$
  select p.* from public.resale_policies p
  where p.jurisdiction = coalesce((select upper(e.settings->>'jurisdiction') from public.events e where e.id = p_event), 'GB')
    and p.status = 'published' and p.effective_from <= now()
  order by p.version desc limit 1
$$;

-- What a buyer must be told about a resale ticket (data-driven by the policy's required_disclosures).
create or replace function public.ticket_resale_restrictions(p_ticket uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'transfer_allowed', coalesce((e.settings #>> '{ticket_pro,access,transfers}')::boolean, (e.settings ->> 'transfers')::boolean, true),
    'min_age', nullif(coalesce((e.settings #>> '{ticket_pro,sales,min_age}')::int, 0), 0),
    'entry_from', tt.valid_from, 'entry_to', tt.valid_to,
    'name_on_ticket', true,
    'terms_url', '/ticket-terms'))
  from public.tickets t join public.ticket_tiers tt on tt.id = t.tier_id join public.events e on e.id = t.event_id where t.id = p_ticket
$$;

-- Listing guard (all writers, not just the RPC): the policy cap, cut-off and active-listing limit apply at listing time.
create or replace function public.tickets_resale_policy_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.resale_policies; face numeric; ev public.events; n int;
begin
  if new.status = 'resale_listed' and old.status is distinct from 'resale_listed' then
    p := public.resale_policy_for(new.event_id);
    if p.id is null then return new; end if;
    select price into face from public.ticket_tiers where id = new.tier_id;
    if coalesce(new.price_paid, 0) > coalesce(face, 0) * p.price_cap_pct / 100 then raise exception 'price_cap_exceeded' using errcode = '22023'; end if;
    select * into ev from public.events where id = new.event_id;
    if p.listing_cutoff_hours > 0 and ev.starts_at - make_interval(hours => p.listing_cutoff_hours) <= now() then raise exception 'resale_window_closed' using errcode = '22023'; end if;
    if p.max_active_listings_per_user is not null then
      select count(*) into n from public.tickets where holder_id = new.holder_id and event_id = new.event_id and status = 'resale_listed' and id <> new.id;
      if n >= p.max_active_listings_per_user then raise exception 'resale_limit' using errcode = '22023'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tickets_resale_policy_guard on public.tickets;
create trigger tickets_resale_policy_guard before update of status on public.tickets for each row execute function public.tickets_resale_policy_guard();

-- ── B. Listing disclosure snapshots ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_resale_listings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  seller_id uuid,
  policy_id uuid references public.resale_policies(id),
  policy_version integer,
  jurisdiction text,
  face_value_minor bigint not null,
  price_minor bigint not null,
  currency text not null default 'GBP',
  tier_name text not null default '',
  seat text,
  restrictions jsonb not null default '{}',
  status text not null default 'listed' check (status in ('listed', 'withdrawn', 'sold', 'lapsed')),
  buyer_ticket_id uuid references public.tickets(id) on delete set null,
  listed_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists ticket_resale_listings_open_uq on public.ticket_resale_listings(ticket_id) where status = 'listed';
create index if not exists ticket_resale_listings_event_idx on public.ticket_resale_listings(event_id, status);
alter table public.ticket_resale_listings enable row level security;
drop policy if exists ticket_resale_listings_read on public.ticket_resale_listings;
create policy ticket_resale_listings_read on public.ticket_resale_listings for select to authenticated
  using (seller_id = (select auth.uid()) or public.can_access_event(event_id) or public.has_admin_permission('tickets'));
revoke all on public.ticket_resale_listings from anon, authenticated;
grant select on public.ticket_resale_listings to authenticated;
grant all on public.ticket_resale_listings to service_role;

create or replace function public.tickets_resale_listing_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.resale_policies; tt public.ticket_tiers;
begin
  if new.status = 'resale_listed' and old.status is distinct from 'resale_listed' then
    p := public.resale_policy_for(new.event_id);
    select * into tt from public.ticket_tiers where id = new.tier_id;
    update public.ticket_resale_listings set status = 'lapsed', closed_at = now() where ticket_id = new.id and status = 'listed';
    insert into public.ticket_resale_listings(ticket_id, event_id, seller_id, policy_id, policy_version, jurisdiction, face_value_minor, price_minor, tier_name, seat, restrictions)
      values (new.id, new.event_id, new.holder_id, p.id, p.version, p.jurisdiction, round(coalesce(tt.price, 0) * 100)::bigint, round(coalesce(new.price_paid, 0) * 100)::bigint,
        coalesce(tt.name, ''), new.seat, coalesce(public.ticket_resale_restrictions(new.id), '{}'));
  elsif old.status = 'resale_listed' and new.status is distinct from 'resale_listed' then
    update public.ticket_resale_listings set status = case new.status when 'valid' then 'withdrawn' when 'resold' then 'sold' else 'lapsed' end,
      buyer_ticket_id = case when new.status = 'resold' then new.replaced_by end, closed_at = now()
    where ticket_id = new.id and status = 'listed';
  end if;
  return null;
end $$;
drop trigger if exists tickets_resale_listing_record on public.tickets;
create trigger tickets_resale_listing_record after update of status on public.tickets for each row execute function public.tickets_resale_listing_record();

-- Public resale listings now carry the disclosures (existing keys unchanged; cap from the versioned policy).
create or replace function public.resale_listings(p_event uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tier', tt.name, 'tier_id', tt.id, 'seat', t.seat, 'price', t.price_paid,
   'face_value', tt.price, 'restrictions', coalesce(l.restrictions, public.ticket_resale_restrictions(t.id)), 'policy_version', coalesce(l.policy_version, p.version),
   'jurisdiction', coalesce(l.jurisdiction, p.jurisdiction)) order by t.price_paid), '[]'::jsonb)
 from public.tickets t join public.ticket_tiers tt on tt.id = t.tier_id join public.events e on e.id = t.event_id
 join public.checkout_orders o on o.order_ref = t.order_ref and o.buyer_id = t.holder_id and o.status = 'issued' and o.refund_status = 'none' and o.stripe_session is not null and upper(o.currency) = 'GBP'
 left join lateral (select value from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1) s on true
 left join lateral (select * from public.resale_policy_for(p_event)) p on true
 left join public.ticket_resale_listings l on l.ticket_id = t.id and l.status = 'listed'
 where t.event_id = p_event and t.status = 'resale_listed' and e.visibility = 'public' and e.status in ('published', 'on_sale') and e.starts_at > now()
 and coalesce(e.settings->>'resale', 'true') <> 'false' and coalesce(s.value->>'resale_enabled', 'true') <> 'false'
 and t.price_paid > 0 and t.price_paid <= tt.price * coalesce(p.price_cap_pct, (s.value->>'resale_cap_pct')::numeric, 100) / 100
 and not exists (select 1 from public.resale_holds h where h.ticket_id = t.id and h.expires_at > now())
$$;

-- ── C. Resale settlement switch ─────────────────────────────────────────────────────────────────────────────────────
-- platform_settings ticketing.resale_settlement: 'organiser_buyback' (default) | 'customer_connect' (BLOCKED until customer
-- Connect onboarding exists: it is honoured only for sellers that already own a charges-enabled seller workspace).
create or replace function public.resale_settlement_mode()
returns text language sql stable security definer set search_path = '' as $$
  select case when v = 'customer_connect' then 'customer_connect' else 'organiser_buyback' end
  from (select coalesce((select value->>'resale_settlement' from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1), 'organiser_buyback') v) x
$$;

-- The workspace whose connected account takes the resale direct charge.
create or replace function public.resale_settlement_seller(p_event uuid, p_seller uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.resale_settlement_mode() = 'customer_connect'
    then jsonb_build_object('mode', 'customer_connect', 'workspace_id', public.user_seller_workspace(p_seller), 'compensation', 'resale_proceeds')
    else jsonb_build_object('mode', 'organiser_buyback', 'workspace_id', public.event_seller_workspace(p_event), 'compensation', 'original_payment_refund') end
$$;

-- ── D. Bot / velocity controls ──────────────────────────────────────────────────────────────────────────────────────
alter table public.checkout_orders add column if not exists client_hash text check (client_hash is null or client_hash ~ '^[0-9a-f]{64}$');
create index if not exists checkout_orders_buyer_event_idx on public.checkout_orders(buyer_id, event_id, created_at);
create index if not exists checkout_orders_client_idx on public.checkout_orders(event_id, client_hash, created_at) where client_hash is not null;

create table if not exists public.ticket_risk_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid,
  order_ref text,
  kind text not null check (kind in ('order_velocity', 'shared_client', 'purchase_limit', 'chargeback', 'resale_velocity', 'credential_abuse')),
  severity text not null check (severity in ('info', 'review', 'pause')),
  detail jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'cleared', 'actioned')),
  window_start timestamptz not null default date_trunc('hour', now()),
  expires_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ticket_risk_flags_window_uq on public.ticket_risk_flags(event_id, user_id, kind, window_start) where order_ref is null;
create index if not exists ticket_risk_flags_open_idx on public.ticket_risk_flags(status, created_at) where status = 'open';
alter table public.ticket_risk_flags enable row level security;
drop policy if exists ticket_risk_flags_read on public.ticket_risk_flags;
create policy ticket_risk_flags_read on public.ticket_risk_flags for select to authenticated using (public.has_admin_permission('tickets') or public.can_access_event(event_id));
revoke all on public.ticket_risk_flags from anon, authenticated;
grant select on public.ticket_risk_flags to authenticated;
grant all on public.ticket_risk_flags to service_role;

-- Called by /api/checkout/session before the order is created (service-only). Returns {allow, reason}. Thresholds come from
-- platform_settings ticketing.velocity (defaults below) and the event's ticket_pro.sales.max_per_customer.
create or replace function public.checkout_risk_check(p_event uuid, p_buyer uuid, p_token text, p_client_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; soft int; hard int; pause_min int; shared int; cap int; recent int; accounts int; have int; want int;
begin
  if p_buyer is null then return jsonb_build_object('allow', true); end if;
  cfg := coalesce((select value->'velocity' from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1), '{}');
  soft := coalesce((cfg->>'orders_review_10m')::int, 4); hard := coalesce((cfg->>'orders_pause_10m')::int, 8);
  pause_min := coalesce((cfg->>'pause_minutes')::int, 15); shared := coalesce((cfg->>'accounts_per_client_1h')::int, 4);
  -- An open, unexpired pause (set below or by an admin) holds checkout for this buyer + event until it lapses or is cleared.
  if exists(select 1 from public.ticket_risk_flags f where f.event_id = p_event and f.user_id = p_buyer and f.severity = 'pause' and f.status = 'open' and f.expires_at > now()) then
    return jsonb_build_object('allow', false, 'reason', 'velocity_paused');
  end if;
  select count(*) into recent from public.checkout_orders where buyer_id = p_buyer and event_id = p_event and created_at > now() - interval '10 minutes';
  if recent >= hard then
    insert into public.ticket_risk_flags(event_id, user_id, kind, severity, detail, expires_at)
      values (p_event, p_buyer, 'order_velocity', 'pause', jsonb_build_object('orders_10m', recent, 'threshold', hard), now() + make_interval(mins => pause_min))
      on conflict (event_id, user_id, kind, window_start) where order_ref is null do update set severity = 'pause', status = 'open', expires_at = excluded.expires_at, detail = excluded.detail;
    return jsonb_build_object('allow', false, 'reason', 'velocity_paused');
  elsif recent >= soft then
    insert into public.ticket_risk_flags(event_id, user_id, kind, severity, detail)
      values (p_event, p_buyer, 'order_velocity', 'review', jsonb_build_object('orders_10m', recent, 'threshold', soft)) on conflict do nothing;
  end if;
  if p_client_hash is not null then
    select count(distinct buyer_id) into accounts from public.checkout_orders where event_id = p_event and client_hash = p_client_hash and created_at > now() - interval '1 hour' and buyer_id <> p_buyer;
    if accounts + 1 >= shared then
      insert into public.ticket_risk_flags(event_id, user_id, kind, severity, detail)
        values (p_event, p_buyer, 'shared_client', 'review', jsonb_build_object('accounts_1h', accounts + 1, 'threshold', shared)) on conflict do nothing;
    end if;
  end if;
  -- Event-wide purchase limit per customer (all tiers), counting issued entitlements plus what this checkout holds.
  cap := nullif((select (settings #>> '{ticket_pro,sales,max_per_customer}')::int from public.events where id = p_event), 0);
  if cap is not null then
    select count(*) into have from public.tickets t join public.checkout_orders o on o.order_ref = t.order_ref
      where o.buyer_id = p_buyer and t.event_id = p_event and t.status not in ('refunded', 'cancelled', 'void', 'transferred', 'resold');
    select coalesce(sum((l->>'qty')::int), 0) into want from jsonb_array_elements(public.checkout_quote(p_event, p_token)->'lines') l;
    if have + want > cap then
      insert into public.ticket_risk_flags(event_id, user_id, kind, severity, detail)
        values (p_event, p_buyer, 'purchase_limit', 'info', jsonb_build_object('have', have, 'want', want, 'cap', cap)) on conflict do nothing;
      return jsonb_build_object('allow', false, 'reason', 'purchase_limit', 'cap', cap, 'have', have);
    end if;
  end if;
  return jsonb_build_object('allow', true);
end $$;

-- A chargeback on a ticket order is flagged for review (never an automatic ban).
create or replace function public.checkout_orders_chargeback_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_state = 'chargeback' and old.order_state is distinct from 'chargeback' then
    insert into public.ticket_risk_flags(event_id, user_id, order_ref, kind, severity, detail)
      values (new.event_id, new.buyer_id, new.order_ref, 'chargeback', 'review', jsonb_build_object('amount_minor', round((new.amount + new.fee) * 100)));
  end if;
  return null;
end $$;
drop trigger if exists checkout_orders_chargeback_flag on public.checkout_orders;
create trigger checkout_orders_chargeback_flag after update of order_state on public.checkout_orders for each row execute function public.checkout_orders_chargeback_flag();

-- Admin review (tickets permission): clear or action a flag; audited. Clearing a pause lifts it immediately.
create or replace function public.ticket_risk_review(p_flag uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.ticket_risk_flags;
begin
  if not public.has_admin_permission('tickets') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('cleared', 'actioned') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.ticket_risk_flags set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 500),
    expires_at = case when p_status = 'cleared' then least(coalesce(expires_at, now()), now()) else expires_at end
    where id = p_flag returning * into f;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'ticket.risk_reviewed',
    jsonb_build_object('flag', p_flag, 'kind', f.kind, 'status', p_status, 'event_id', f.event_id));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ── E. Launch state with release kinds ──────────────────────────────────────────────────────────────────────────────
create or replace function public.event_launch_state(p_event uuid)
returns text language sql stable security definer set search_path = '' as $$
  with e as (select ev.*, (ev.settings -> 'launch' ->> 'at')::timestamptz launch_at, (ev.settings -> 'launch' ->> 'presale_at')::timestamptz presale_at from public.events ev where ev.id = p_event),
  t as (select coalesce(sum(greatest(quantity - sold - held, 0)), 0) avail, coalesce(sum(quantity), 0) cap, count(*) filter (where status = 'on_sale') on_sale,
          bool_or(name ilike '%final%' or release_kind = 'final') final,
          count(*) filter (where status = 'on_sale' and not access_code_required) public_on_sale, bool_or(status = 'on_sale' and access_code_required) code_only_on_sale
        from public.ticket_tiers where event_id = p_event and status in ('on_sale','sold_out','scheduled'))
  select case
    when e.status = 'cancelled' then 'cancelled'
    when e.status = 'postponed' then 'postponed'
    when e.status in ('completed','closed','archived') or coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then 'ended'
    when e.status in ('draft','planning','ready') then 'draft'
    when e.launch_at is not null and now() < coalesce(e.presale_at, e.launch_at) and e.launch_at - now() <= interval '7 days' then 'countdown'
    when e.launch_at is not null and now() < coalesce(e.presale_at, e.launch_at) then 'coming_soon'
    when e.presale_at is not null and now() >= e.presale_at and now() < coalesce(e.launch_at, e.presale_at) then 'presale'
    when coalesce(t.code_only_on_sale, false) and t.public_on_sale = 0 then 'presale'
    when t.cap > 0 and t.avail = 0 and exists (select 1 from public.ticket_waitlist w where w.event_id = p_event and w.status = 'waiting') then 'waitlist'
    when t.cap > 0 and t.avail = 0 then 'sold_out'
    when t.cap > 0 and t.avail::numeric / t.cap <= 0.1 then 'low_availability'
    when t.final and t.on_sale > 0 then 'final_release'
    when t.on_sale > 0 then 'on_sale'
    else 'coming_soon' end
  from e, t;
$$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ticket.risk_flagged', 1, 'ticket', 'A ticket purchase or resale was flagged for review (velocity, shared client, limit, chargeback).', null)
on conflict (event_type) do update set description = excluded.description;

-- ── Grants ──────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.resale_policies_immutable(), public.resale_policy_for(uuid), public.ticket_resale_restrictions(uuid), public.tickets_resale_policy_guard(),
  public.tickets_resale_listing_record(), public.resale_settlement_mode(), public.resale_settlement_seller(uuid, uuid), public.checkout_risk_check(uuid, uuid, text, text),
  public.checkout_orders_chargeback_flag(), public.ticket_risk_review(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resale_policy_for(uuid), public.ticket_resale_restrictions(uuid), public.resale_settlement_mode(), public.resale_settlement_seller(uuid, uuid),
  public.checkout_risk_check(uuid, uuid, text, text), public.ticket_risk_review(uuid, text, text) to service_role;
grant execute on function public.ticket_risk_review(uuid, text, text) to authenticated;
-- resale_listings / event_launch_state keep their existing anon + authenticated grants (public, allowlisted).
