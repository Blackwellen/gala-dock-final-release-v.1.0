-- VAT on Gala Dock's own fees (Blackwellen Limited, VAT No. GB508480488; standard rate 20%).
-- Only Gala Dock's fees carry Gala Dock VAT. Ticket face values and providers' prices are the seller's own supplies and are untouched.
--   Consumer-facing fees (£1 ticket booking fee, 2.5% booking admin fee): prices to consumers must include VAT, so with
--     consumer_fees_inclusive = true the published price stays the same and its VAT part (1/6) is recorded. Set it to false to add 20% on top.
--   Business fees (5% ticket commission, supplier commission, boosts): VAT is added on top ("plus VAT") and deducted or charged with the fee.
-- Every order records the VAT, the ledger books it to tax_payable (not revenue), and admin_vat_summary() totals it for the VAT return.
begin;

-- ════════ Setting ════════
do $$
declare cur public.platform_settings; nv integer;
begin
  select * into cur from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1;
  if cur.value ? 'vat' then return; end if;
  select coalesce(max(version), 0) + 1 into nv from public.platform_settings where section = 'commerce';
  update public.platform_settings set status = 'superseded' where section = 'commerce' and status = 'published';
  insert into public.platform_settings(section, version, status, value, effective_at, change_reason, summary)
  values ('commerce', nv, 'published', coalesce(cur.value, '{}'::jsonb) || jsonb_build_object('vat', jsonb_build_object('rate_bps', 2000, 'number', 'GB508480488', 'consumer_fees_inclusive', true)),
    now(), 'VAT registration GB508480488: 20% VAT on Gala Dock fees', 'VAT 20% on platform fees (consumer fees VAT-inclusive, business fees plus VAT)');
end $$;

create or replace function public.vat_rate_bps() returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((public.commerce_setting('vat')->>'rate_bps')::integer, 2000);
$$;
create or replace function public.vat_consumer_inclusive() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((public.commerce_setting('vat')->>'consumer_fees_inclusive')::boolean, true);
$$;
revoke all on function public.vat_rate_bps(), public.vat_consumer_inclusive() from public, anon, authenticated;

-- ════════ Columns ════════
alter table public.checkout_orders add column if not exists fee_vat numeric(12,2) not null default 0;
alter table public.checkout_orders add column if not exists commission_vat numeric(12,2) not null default 0;
alter table public.payment_orders add column if not exists customer_fee_vat_minor bigint not null default 0;
alter table public.payment_orders add column if not exists platform_fee_vat_minor bigint not null default 0;
alter table public.platform_charges add column if not exists vat numeric(12,2) not null default 0;

-- ════════ Ticket orders: buyer fee (consumer) + seller commission (business, plus VAT) ════════
create or replace function public.trg_checkout_order_vat() returns trigger language plpgsql security definer set search_path = '' as $$
declare r numeric := public.vat_rate_bps() / 10000.0;
begin
  if coalesce(new.fee, 0) > 0 then
    if public.vat_consumer_inclusive() then new.fee_vat := round(new.fee * r / (1 + r), 2);
    else new.fee_vat := round(new.fee * r, 2); new.fee := new.fee + new.fee_vat; end if;
  end if;
  if coalesce(new.commission, 0) > 0 then
    new.commission_vat := round(new.commission * r, 2);
    new.commission := new.commission + new.commission_vat;            -- deducted from the seller's proceeds with the commission
  end if;
  return new;
end $$;
drop trigger if exists checkout_order_vat on public.checkout_orders;
create trigger checkout_order_vat before insert on public.checkout_orders for each row execute function public.trg_checkout_order_vat();

-- ════════ Marketplace payments, standby/emergency fees and boosts ════════
create or replace function public.trg_payment_order_vat() returns trigger language plpgsql security definer set search_path = '' as $$
declare rb integer := public.vat_rate_bps(); v bigint;
begin
  if coalesce(new.customer_fee_minor, 0) > 0 then
    if public.vat_consumer_inclusive() then new.customer_fee_vat_minor := round(new.customer_fee_minor * rb / (10000.0 + rb));
    else new.customer_fee_vat_minor := round(new.customer_fee_minor * rb / 10000.0); new.customer_fee_minor := new.customer_fee_minor + new.customer_fee_vat_minor; end if;
  end if;
  if new.kind = 'platform_boost' then
    -- Gala Dock's own service, sold to businesses: price plus VAT, all of it Gala Dock's.
    v := round(new.amount_minor * rb / 10000.0);
    new.amount_minor := new.amount_minor + v; new.platform_fee_minor := new.amount_minor; new.platform_fee_vat_minor := v;
  elsif coalesce(new.platform_fee_minor, 0) > 0 then
    v := least(round(new.platform_fee_minor * rb / 10000.0)::bigint, greatest(new.amount_minor - new.platform_fee_minor, 0));
    new.platform_fee_minor := new.platform_fee_minor + v; new.platform_fee_vat_minor := v;   -- commission plus VAT, deducted from the provider's share
  end if;
  return new;
end $$;
drop trigger if exists payment_order_vat on public.payment_orders;
create trigger payment_order_vat before insert on public.payment_orders for each row execute function public.trg_payment_order_vat();

-- ════════ Cancellation charges: the VAT inside the commission + refunded booking fees ════════
create or replace function public.trg_platform_charge_vat() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'cancellation_fees' and new.event_id is not null then
    select coalesce(sum(o.commission_vat + o.fee_vat), 0) into new.vat from public.checkout_orders o
      where o.event_id = new.event_id and o.kind = 'primary' and o.refund_reason = 'event_cancelled';
  end if;
  return new;
end $$;
drop trigger if exists platform_charge_vat on public.platform_charges;
create trigger platform_charge_vat before insert on public.platform_charges for each row execute function public.trg_platform_charge_vat();

revoke all on function public.trg_checkout_order_vat(), public.trg_payment_order_vat(), public.trg_platform_charge_vat() from public, anon, authenticated;

-- ════════ Ledger: Gala Dock fee net of VAT → platform_fee; VAT → tax_payable ════════
do $$
declare def text; old text := $o$jsonb_build_object('account', 'platform_fee', 'amount_minor', -(po.platform_fee_minor + po.customer_fee_minor), 'party_type', 'platform'),$o$;
begin
  def := pg_get_functiondef('public.payment_order_succeeded(text,text,text,bigint,boolean)'::regprocedure);
  if position(old in def) = 0 then
    if position('tax_payable' in def) > 0 then return; end if;
    raise exception 'payment_order_succeeded changed; update the VAT ledger split by hand';
  end if;
  def := replace(def, old, $n$jsonb_build_object('account', 'platform_fee', 'amount_minor', -(po.platform_fee_minor + po.customer_fee_minor - po.platform_fee_vat_minor - po.customer_fee_vat_minor), 'party_type', 'platform'),
      jsonb_build_object('account', 'tax_payable', 'amount_minor', -(po.platform_fee_vat_minor + po.customer_fee_vat_minor), 'party_type', 'platform'),$n$);
  execute def;
end $$;

-- ════════ VAT summary for the VAT return (output tax on Gala Dock fees) ════════
create or replace function public.admin_vat_summary(p_from date, p_to date) returns table (source text, transactions bigint, gross numeric, vat numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('commerce') or public.has_admin_permission('finance')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with t as (
    select 'Ticket booking fees'::text s, o.fee g, o.fee_vat v from public.checkout_orders o
      where o.status in ('paid','issued') and o.created_at >= p_from and o.created_at < p_to + 1 and o.fee > 0
    union all select 'Ticket seller commission', o.commission, o.commission_vat from public.checkout_orders o
      where o.status in ('paid','issued') and o.created_at >= p_from and o.created_at < p_to + 1 and o.commission > 0
    union all select 'Booking admin fees', p.customer_fee_minor / 100.0, p.customer_fee_vat_minor / 100.0 from public.payment_orders p
      where p.status not in ('amount_due','payment_pending','failed','cancelled','expired','refunded') and p.created_at >= p_from and p.created_at < p_to + 1 and p.customer_fee_minor > 0
    union all select case when p.kind = 'platform_boost' then 'Promotion boosts' else 'Supplier commission' end, p.platform_fee_minor / 100.0, p.platform_fee_vat_minor / 100.0 from public.payment_orders p
      where p.status not in ('amount_due','payment_pending','failed','cancelled','expired','refunded') and p.created_at >= p_from and p.created_at < p_to + 1 and p.platform_fee_minor > 0
    union all select 'Cancellation charges', c.amount, c.vat from public.platform_charges c
      where c.status in ('due','settled') and c.created_at >= p_from and c.created_at < p_to + 1)
  select t.s, count(*), round(sum(t.g), 2), round(sum(t.v), 2), round(sum(t.g - t.v), 2) from t group by t.s order by 1;
end $$;
revoke all on function public.admin_vat_summary(date, date) from public, anon;
grant execute on function public.admin_vat_summary(date, date) to authenticated;

commit;
