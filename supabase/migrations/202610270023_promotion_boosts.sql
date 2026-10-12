-- Paid promotion boosts (release spec §117–121) — payment contract. Session 0b builds the UI, targeting and analytics on top.
-- Boosts are platform revenue: the order kind is the existing 'platform_boost', the platform keeps 100% (no provider transfer, never in
-- the release scan), payment isn't "protected", and the webhook-confirmed payment activates the boost. Prices come from a server-side
-- catalogue, never from the client.
create table if not exists public.boost_products (
  key text primary key,
  label text not null, description text not null default '',
  placement text not null check (placement in ('homepage','discover','city','category','search','event_page','email','social')),
  price_minor integer not null check (price_minor > 0), currency text not null default 'GBP',
  duration_days integer not null check (duration_days between 1 and 90),
  active boolean not null default true, sort integer not null default 0
);
alter table public.boost_products enable row level security;
drop policy if exists boost_products_read on public.boost_products;
create policy boost_products_read on public.boost_products for select using (active or public.has_admin_permission('commerce'));
insert into public.boost_products(key, label, description, placement, price_minor, duration_days, sort) values
  ('featured_event_7d', 'Featured Event — 7 days', 'Top placement on Discover for your city.', 'discover', 4900, 7, 1),
  ('category_spotlight_7d', 'Category Spotlight — 7 days', 'Pinned at the top of your event category.', 'category', 2900, 7, 2),
  ('homepage_hero_3d', 'Homepage Hero — 3 days', 'Rotating hero slot on the Gala Dock homepage.', 'homepage', 9900, 3, 3),
  ('search_boost_14d', 'Search Boost — 14 days', 'Ranks your event higher in matching searches (labelled Sponsored).', 'search', 3900, 14, 4)
on conflict (key) do nothing;

create table if not exists public.promotion_boosts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  product_key text not null references public.boost_products(key),
  placement text not null,
  targeting jsonb not null default '{}',
  amount_minor integer not null, currency text not null default 'GBP',
  status text not null default 'pending_payment' check (status in ('pending_payment','scheduled','active','ended','cancelled','refunded')),
  starts_at timestamptz not null, ends_at timestamptz not null,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  impressions bigint not null default 0, clicks bigint not null default 0,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists promotion_boosts_live_idx on public.promotion_boosts(placement, starts_at, ends_at) where status in ('scheduled','active');
alter table public.promotion_boosts enable row level security;
drop policy if exists promotion_boosts_read on public.promotion_boosts;
create policy promotion_boosts_read on public.promotion_boosts for select using (public.is_workspace_member(workspace_id) or public.has_admin_permission('commerce'));

-- Organiser (owner/manager) creates a boost; price and duration come from the catalogue.
create or replace function public.create_promotion_boost(p_event uuid, p_product text, p_starts_at timestamptz default null, p_targeting jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.boost_products; v uuid; s timestamptz := greatest(coalesce(p_starts_at, now()), now());
begin
  select * into e from public.events where id = p_event;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.visibility <> 'public' or e.status not in ('published','on_sale','live') then raise exception 'event_not_public' using errcode = '22023'; end if;
  select * into p from public.boost_products where key = p_product and active;
  if not found then raise exception 'unknown_product' using errcode = '22023'; end if;
  insert into public.promotion_boosts(workspace_id, event_id, product_key, placement, targeting, amount_minor, currency, starts_at, ends_at, created_by)
    values (e.workspace_id, e.id, p.key, p.placement, coalesce(p_targeting, '{}'), p.price_minor, p.currency, s, s + make_interval(days => p.duration_days), auth.uid())
    returning id into v;
  return v;
end $$;

-- Payment order for a boost (resumable; one open order per boost).
create or replace function public.create_boost_payment_order(p_boost uuid) returns public.payment_orders
language plpgsql security definer set search_path = '' as $$
declare b public.promotion_boosts; p public.boost_products; po public.payment_orders; okey text;
begin
  select * into b from public.promotion_boosts where id = p_boost for update;
  if not found or not public.has_workspace_role(b.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status <> 'pending_payment' then raise exception 'nothing_due' using errcode = '22023'; end if;
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
revoke all on function public.create_promotion_boost(uuid, text, timestamptz, jsonb), public.create_boost_payment_order(uuid) from public, anon;
grant execute on function public.create_promotion_boost(uuid, text, timestamptz, jsonb), public.create_boost_payment_order(uuid) to authenticated, service_role;

-- Payment state → boost state (webhook-authoritative: payment_order_succeeded / _refunded drive the order status).
create or replace function public.trg_boost_payment_state() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'platform_boost' or new.status is not distinct from old.status then return new; end if;
  if new.status in ('payment_succeeded','protected_pending_delivery') then
    update public.promotion_boosts set status = case when starts_at <= now() then 'active' else 'scheduled' end, updated_at = now()
      where payment_order_id = new.id and status = 'pending_payment';
    insert into public.audit_events(actor_type, workspace_id, event, metadata)
      select 'webhook', b.workspace_id, 'promotion.boost_paid', jsonb_build_object('boost_id', b.id, 'payment_order', new.reference) from public.promotion_boosts b where b.payment_order_id = new.id;
  elsif new.status in ('refunded','partially_refunded') then
    update public.promotion_boosts set status = 'refunded', updated_at = now() where payment_order_id = new.id and status <> 'refunded';
  end if;
  return new;
end $$;
drop trigger if exists gd_boost_payment_state on public.payment_orders;
create trigger gd_boost_payment_state after update of status on public.payment_orders for each row execute function public.trg_boost_payment_state();

-- Scheduled → active → ended, piggy-backing on the 5-minute marketplace sweep cadence.
create or replace function public.boost_lifecycle() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; m integer;
begin
  update public.promotion_boosts set status = 'active', updated_at = now() where status = 'scheduled' and starts_at <= now() and ends_at > now(); get diagnostics m = row_count; n := n + m;
  update public.promotion_boosts set status = 'ended', updated_at = now() where status in ('active','scheduled') and ends_at <= now(); get diagnostics m = row_count; n := n + m;
  return n;
end $$;
revoke all on function public.boost_lifecycle() from public, anon, authenticated;
grant execute on function public.boost_lifecycle() to service_role;
select cron.unschedule('boost-lifecycle') where exists (select 1 from cron.job where jobname = 'boost-lifecycle');
select cron.schedule('boost-lifecycle', '*/5 * * * *', $$select public.boost_lifecycle()$$);
