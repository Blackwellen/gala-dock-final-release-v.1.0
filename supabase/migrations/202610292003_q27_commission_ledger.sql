-- Q27 promoters / affiliates (part 1): versioned commission rules stored on every accrual, refund/chargeback reversal of promoter
-- accruals, the sale lifecycle (pending → approved → held → payable → paid, or reversed), the channel a sale came through, and
-- ledger MEMO postings in separate account families so event-promoter commission and platform-affiliate commission can never mix.
--
-- Money model (card 173 + docs/payments/ledger.md): ticket money is a direct charge on the organiser's connected account, so an
-- event promoter's commission is an obligation OF THE ORGANISER (seller) to the promoter, settled off-platform. The ledger records
-- it as a statement of that obligation (basis 'seller_obligation_memo'): no Gala Dock cash account is touched and nothing is held.
-- A platform affiliate's commission is Gala Dock's own obligation on its own subscription revenue (basis 'platform_obligation_memo').
-- Additive and backward-compatible: the deployed attribute_referral() keeps working; snapshots and postings come from triggers.

-- ── Ledger: new memo accounts and bases ───────────────────────────────────────────────────────────────────────────────────────
alter table public.ledger_entries drop constraint ledger_entries_account_check;
alter table public.ledger_entries add constraint ledger_entries_account_check check (account = any (array[
  'customer_payment','platform_revenue','platform_fee','processing_cost','tax_payable','provider_payable','promoter_payable','affiliate_payable',
  'refunds','disputes','payouts','cash_stripe','merchant_gmv','seller_connected_balance','seller_application_fees','seller_refunds','seller_disputes','seller_payouts',
  -- Q27 event-promoter family (organiser's obligation to its promoters; memo only)
  'seller_promoter_commission','seller_promoter_settled',
  -- Q27 platform-affiliate family (Gala Dock's own obligation to partners; memo only)
  'platform_affiliate_commission','platform_affiliate_settled']));
alter table public.ledger_transactions drop constraint ledger_transactions_basis_check;
alter table public.ledger_transactions add constraint ledger_transactions_basis_check check (basis is null or basis = any (array[
  'direct_charge_memo','platform_own_sale','legacy_platform_collection','seller_obligation_memo','platform_obligation_memo']));

-- Exit gate: the two commission families cannot mix. Promoter accounts appear only in 'promoter_commission' transactions (and only
-- with promoter/seller parties); affiliate accounts only in 'affiliate_commission' transactions (partner/platform parties); and those
-- two kinds may use nothing else. Enforced on every entry insert.
create or replace function public.trg_ledger_commission_families()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select t.kind into k from public.ledger_transactions t where t.id = new.transaction_id;
  if new.account in ('promoter_payable','seller_promoter_commission','seller_promoter_settled') then
    if k <> 'promoter_commission' then raise exception 'ledger_family_mix: % in a % transaction', new.account, k using errcode = '23514'; end if;
    if new.account = 'promoter_payable' and new.party_type is distinct from 'promoter' then raise exception 'ledger_family_mix: promoter_payable needs a promoter party' using errcode = '23514'; end if;
  elsif new.account in ('affiliate_payable','platform_affiliate_commission','platform_affiliate_settled') then
    if k <> 'affiliate_commission' then raise exception 'ledger_family_mix: % in a % transaction', new.account, k using errcode = '23514'; end if;
    if new.account = 'affiliate_payable' and new.party_type is distinct from 'partner' then raise exception 'ledger_family_mix: affiliate_payable needs a partner party' using errcode = '23514'; end if;
  elsif k in ('promoter_commission','affiliate_commission') then
    raise exception 'ledger_family_mix: % may not post to %', k, new.account using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists ledger_commission_families on public.ledger_entries;
create trigger ledger_commission_families before insert on public.ledger_entries for each row execute function public.trg_ledger_commission_families();

-- ── Commission rules (append-only versions) ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.promoter_commission_rules (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  version integer not null check (version >= 1),
  commission_pct numeric(6,3) not null check (commission_pct >= 0 and commission_pct <= 100),
  basis text not null default 'ticket_face_value_excl_fees' check (basis in ('ticket_face_value_excl_fees')),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (promoter_id, version)
);
create index if not exists promoter_commission_rules_latest on public.promoter_commission_rules(promoter_id, version desc);
alter table public.promoter_commission_rules enable row level security;
revoke all on public.promoter_commission_rules from anon, authenticated;
grant select on public.promoter_commission_rules to authenticated;
drop policy if exists promoter_commission_rules_read on public.promoter_commission_rules;
create policy promoter_commission_rules_read on public.promoter_commission_rules for select to authenticated
  using (public.owns_promoter(promoter_id) or public.can_manage_promoter(promoter_id) or public.has_admin_permission('partners'));

create table if not exists public.partner_commission_rules (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  version integer not null check (version >= 1),
  commission_bps integer not null check (commission_bps >= 0 and commission_bps <= 5000),
  basis text not null check (basis in ('net_platform_revenue','subscription_revenue','fixed_bounty')),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (partner_id, version)
);
create index if not exists partner_commission_rules_latest on public.partner_commission_rules(partner_id, version desc);
alter table public.partner_commission_rules enable row level security;
revoke all on public.partner_commission_rules from anon, authenticated;
grant select on public.partner_commission_rules to authenticated;
drop policy if exists partner_commission_rules_read on public.partner_commission_rules;
create policy partner_commission_rules_read on public.partner_commission_rules for select to authenticated
  using (public.owns_partner(partner_id) or public.has_admin_permission('partners'));

create or replace function public.trg_promoter_rule_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cur public.promoter_commission_rules;
begin
  select * into cur from public.promoter_commission_rules r where r.promoter_id = new.id order by r.version desc limit 1;
  if cur.id is null or cur.commission_pct is distinct from new.commission_pct then
    insert into public.promoter_commission_rules(promoter_id, version, commission_pct, created_by)
      values (new.id, coalesce(cur.version, 0) + 1, new.commission_pct, (select auth.uid()));
  end if;
  return null;
end $$;
drop trigger if exists promoter_rule_version on public.promoters;
create trigger promoter_rule_version after insert or update of commission_pct on public.promoters for each row execute function public.trg_promoter_rule_version();

create or replace function public.trg_partner_rule_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cur public.partner_commission_rules;
begin
  select * into cur from public.partner_commission_rules r where r.partner_id = new.id order by r.version desc limit 1;
  if cur.id is null or cur.commission_bps is distinct from new.commission_bps or cur.basis is distinct from new.commission_basis then
    insert into public.partner_commission_rules(partner_id, version, commission_bps, basis, created_by)
      values (new.id, coalesce(cur.version, 0) + 1, new.commission_bps, new.commission_basis, (select auth.uid()));
  end if;
  return null;
end $$;
drop trigger if exists partner_rule_version on public.partners;
create trigger partner_rule_version after insert or update of commission_bps, commission_basis on public.partners for each row execute function public.trg_partner_rule_version();

-- Version 1 for every existing promoter / partner (additive inserts; existing rows untouched).
insert into public.promoter_commission_rules(promoter_id, version, commission_pct, effective_from)
  select p.id, 1, p.commission_pct, p.created_at from public.promoters p
  where not exists (select 1 from public.promoter_commission_rules r where r.promoter_id = p.id);
insert into public.partner_commission_rules(partner_id, version, commission_bps, basis, effective_from)
  select p.id, 1, p.commission_bps, p.commission_basis, p.created_at from public.partners p
  where not exists (select 1 from public.partner_commission_rules r where r.partner_id = p.id);

-- ── Promoter sales: snapshot, lifecycle, reversal, channel ───────────────────────────────────────────────────────────────────
alter table public.promoter_sales
  add column if not exists commission_rule_id uuid references public.promoter_commission_rules(id) on delete set null,
  add column if not exists commission_rule_version integer,
  add column if not exists commission_pct numeric(6,3),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text check (reversal_reason is null or reversal_reason in ('refund','chargeback','fraud','admin')),
  add column if not exists clawback_pending boolean not null default false,
  add column if not exists clawback_payout_id uuid,
  add column if not exists updated_at timestamptz not null default now();
alter table public.promoter_sales drop constraint promoter_sales_status_check;
alter table public.promoter_sales add constraint promoter_sales_status_check check (status = any (array['pending','approved','held','payable','paid','reversed']));
create index if not exists promoter_sales_order_ref on public.promoter_sales(order_ref) where order_ref is not null;
create index if not exists promoter_sales_payout on public.promoter_sales(payout_id) where payout_id is not null;

-- Channel: QR codes and plain links are first-class (promoter assets use ?c=qr).
alter table public.promoter_clicks drop constraint promoter_clicks_channel_check;
alter table public.promoter_clicks add constraint promoter_clicks_channel_check check (channel = any (array['direct','link','qr','instagram','tiktok','facebook','x','whatsapp','email','other']));
-- Checkout records the channel of the consented referral cookie (gd_ref = CODE:slug:channel); NULL on older rows.
alter table public.checkout_orders add column if not exists ref_channel text check (ref_channel is null or ref_channel = any (array['direct','link','qr','instagram','tiktok','facebook','x','whatsapp','email','other']));

-- Snapshot the rule in force on every new accrual (works for the deployed attribute_referral unchanged), and record the channel.
create or replace function public.trg_promoter_sale_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.promoter_commission_rules; ch text;
begin
  if new.commission_rule_id is null then
    select * into r from public.promoter_commission_rules x where x.promoter_id = new.promoter_id order by x.version desc limit 1;
    new.commission_rule_id := r.id; new.commission_rule_version := r.version; new.commission_pct := r.commission_pct;
  end if;
  if new.order_ref is not null and new.channel in ('link', 'direct') then
    select o.ref_channel into ch from public.checkout_orders o where o.order_ref = new.order_ref;
    new.channel := case when ch is null then 'link' when ch = 'direct' then 'link' else ch end;
  end if;
  return new;
end $$;
drop trigger if exists promoter_sale_snapshot on public.promoter_sales;
create trigger promoter_sale_snapshot before insert on public.promoter_sales for each row execute function public.trg_promoter_sale_snapshot();

-- Memo posting helper for one promoter sale (accrual or reversal). Seller party = the event's workspace, else its owner.
create or replace function public.promoter_post_memo(p_sale uuid, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.promoter_sales; e record; c bigint; sign int := case when p_kind = 'reversal' then -1 else 1 end;
begin
  select * into s from public.promoter_sales where id = p_sale;
  c := round(coalesce(s.commission, 0) * 100);
  if s.id is null or c = 0 then return null; end if;
  -- Accruals that pre-date this migration have no memo yet: post it (idempotent key) before reversing, so the ledger always nets.
  if p_kind = 'reversal' then perform public.promoter_post_memo(p_sale, 'accrual'); end if;
  select ev.workspace_id, ev.owner_id, coalesce(ev.currency, 'GBP') currency into e from public.events ev where ev.id = s.event_id;
  return public.post_memo_ledger_transaction(
    'promoter:' || p_kind || ':' || s.id, 'promoter_commission', upper(coalesce(e.currency, 'GBP')),
    jsonb_build_array(
      jsonb_build_object('account', 'seller_promoter_commission', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end,
                         'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', sign * c),
      jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', s.promoter_id, 'amount_minor', -sign * c)),
    'seller_obligation_memo', e.workspace_id, s.event_id, 'promoter_sale', s.id::text,
    case when p_kind = 'reversal' then 'Promoter commission reversed (' || coalesce(s.reversal_reason, 'refund') || ')' else 'Promoter commission owed by the organiser (memo)' end);
end $$;
revoke all on function public.promoter_post_memo(uuid, text) from public, anon, authenticated;

create or replace function public.trg_promoter_sale_accrued()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.promoter_post_memo(new.id, 'accrual');
  return null;
end $$;
drop trigger if exists promoter_sale_accrued on public.promoter_sales;
create trigger promoter_sale_accrued after insert on public.promoter_sales for each row execute function public.trg_promoter_sale_accrued();

-- Reversal (idempotent). Unlocked accruals become 'reversed'; accruals already locked in a payout (held/payable/paid) are immutable,
-- so they are flagged clawback_pending and netted off the promoter's next payout. Either way a reversal memo is posted once.
create or replace function public.promoter_reverse_order(p_order_ref text, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; n int := 0; qty int := 0; amt numeric := 0;
begin
  if p_reason not in ('refund','chargeback','fraud','admin') then raise exception 'invalid_reason' using errcode = '22023'; end if;
  for s in select * from public.promoter_sales where order_ref = p_order_ref and status <> 'reversed' and not clawback_pending for update loop
    if s.payout_id is null and s.status in ('pending','approved') then
      update public.promoter_sales set status = 'reversed', reversed_at = now(), reversal_reason = p_reason, updated_at = now() where id = s.id;
    else
      update public.promoter_sales set clawback_pending = true, reversed_at = now(), reversal_reason = p_reason, updated_at = now() where id = s.id;
    end if;
    perform public.promoter_post_memo(s.id, 'reversal');
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'promoter.commission_reversed',
      jsonb_build_object('sale_id', s.id, 'promoter_id', s.promoter_id, 'order_ref', p_order_ref, 'reason', p_reason, 'locked', s.payout_id is not null, 'commission', s.commission));
    n := n + 1; qty := qty + s.quantity; amt := amt + s.amount;
    update public.promoters set tickets_sold = greatest(tickets_sold - s.quantity, 0), revenue = greatest(revenue - s.amount, 0) where id = s.promoter_id;
  end loop;
  return n;
end $$;
revoke all on function public.promoter_reverse_order(text, text) from public, anon, authenticated;

-- Mirrors Q23's trg_ad_attribution refund branch: a full refund of the order reverses its promoter accruals.
create or replace function public.trg_promoter_refund_reversal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.status = 'refunded' or new.refund_status = 'refunded') and not (old.status = 'refunded' or old.refund_status = 'refunded') then
    perform public.promoter_reverse_order(new.order_ref, 'refund');
  end if;
  return new;
end $$;
drop trigger if exists gd_promoter_refund_reversal on public.checkout_orders;
create trigger gd_promoter_refund_reversal after update of status, refund_status on public.checkout_orders for each row execute function public.trg_promoter_refund_reversal();

-- Chargeback: a lost dispute on the ticket order reverses its promoter accruals (idempotent with a later refund).
create or replace function public.trg_promoter_dispute_reversal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'lost' and new.order_ref is not null and (tg_op = 'INSERT' or old.status is distinct from 'lost') then
    perform public.promoter_reverse_order(new.order_ref, 'chargeback');
  end if;
  return new;
end $$;
drop trigger if exists gd_promoter_dispute_reversal on public.stripe_disputes;
create trigger gd_promoter_dispute_reversal after insert or update of status on public.stripe_disputes for each row execute function public.trg_promoter_dispute_reversal();
