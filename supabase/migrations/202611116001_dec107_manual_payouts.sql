-- DEC-107 on Stripe for Gala Dock (owner decision 2026-11-11; model: docs/backend/payments/dec107-gala-dock.md).
-- Closes the gaps between the Q07 direct-charge build and DEC-107:
--   * settings: the hold limit is a setting, with the funding-window formula (dec107_funding_lead_days);
--   * per-record model: each payment record freezes its release model when it is bound to a seller account (pilot per record,
--     never per seller); a DEC-107 record needs a manual-payout seller account (COM_SELLER_NOT_READY backstop, demo/QA exempt);
--   * releases: payouts from the seller's own balance only on approved triggers (event completed + review window, customer
--     confirmation, settlement, independent award, default rule / hold limit). Resales and merch group under their event;
--   * reserves on objective rules only (check constraint, versioned terms);
--   * payout pause: staff only, second factor (aal2 via has_admin_permission), audited, a legal basis + reference required;
--   * invariants: dec107_invariants() must return no rows after every proof.
-- Additive only: new tables/columns/functions; no existing function body is replaced here.

-- ───────────────────────── 1. settings ─────────────────────────
create table if not exists public.dec107_settings (
  id boolean primary key default true check (id),
  hold_limit_days integer not null default 90 check (hold_limit_days between 14 and 365),
  default_rule_margin_days integer not null default 3 check (default_rule_margin_days between 1 and 10),
  warning_days integer not null default 10 check (warning_days between 1 and 30),
  ticket_review_hours integer not null default 24 check (ticket_review_hours between 0 and 336),
  booking_review_hours integer not null default 24 check (booking_review_hours between 0 and 336),
  recommendation_days integer not null default 7 check (recommendation_days between 1 and 30),
  escalation_days integer not null default 14 check (escalation_days between 1 and 60),
  -- Money charged earlier than the funding lead: 'release_at_hold_limit' pays the seller out at the default-rule day (seller
  -- liable for later refunds; owner option b), 'refuse' refuses the charge (owner option a). Owner decision pending.
  funding_window_mode text not null default 'release_at_hold_limit' check (funding_window_mode in ('release_at_hold_limit','refuse')),
  require_manual_payout_accounts boolean not null default true,
  exempt_demo_qa boolean not null default true,
  connect_fees_payer text not null default 'application' check (connect_fees_payer in ('application','account')),
  seller_fee_cap_bps integer not null default 800 check (seller_fee_cap_bps between 0 and 2000),
  reserves_enabled boolean not null default true,
  reserve_standard_bps integer not null default 1000 check (reserve_standard_bps between 0 and 5000),
  reserve_standard_days integer not null default 30 check (reserve_standard_days between 1 and 60),
  reserve_new_seller_days integer not null default 90,
  reserve_new_seller_minor bigint not null default 200000,
  reserve_risk_bps integer not null default 5000 check (reserve_risk_bps between 0 and 5000),
  reserve_risk_days integer not null default 60 check (reserve_risk_days between 1 and 60),
  risk_chargeback_bps integer not null default 75,
  risk_refund_bps integer not null default 1000,
  risk_window_days integer not null default 90,
  risk_min_payments integer not null default 5,
  payment_terms_version text not null default 'gd-pt-1.0-2026-11-11',
  dispute_rules_version text not null default 'gd-dr-1.0-2026-11-11',
  dispute_rules_in_force_from timestamptz,           -- NULL = no deadline or lapse rule runs (policy not published)
  consumer_arbitration_floor_minor bigint not null default 500000,   -- no arbitration for consumers at or under £5,000
  small_claim_minor bigint not null default 25000,
  payout_countries text[] not null default array['GB'],
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.dec107_settings(id) values (true) on conflict (id) do nothing;
alter table public.dec107_settings enable row level security;
drop policy if exists dec107_settings_admin_read on public.dec107_settings;
create policy dec107_settings_admin_read on public.dec107_settings for select to authenticated using (public.is_platform_admin());
revoke all on public.dec107_settings from anon, authenticated;
grant select on public.dec107_settings to authenticated;

/** Latest charge before an event = event end − lead. lead = hold − review − recommendation − escalation − warning (58 for 90/1/7/14/10). */
create or replace function public.dec107_funding_lead_days(p_review_hours integer default null)
returns integer language sql stable security definer set search_path to '' as $$
  select s.hold_limit_days - ceil(coalesce(p_review_hours, s.booking_review_hours) / 24.0)::integer - s.recommendation_days - s.escalation_days - s.warning_days
  from public.dec107_settings s where s.id;
$$;

/** Rules a signed-in user may see (hold limit, review windows, reserve rules, versions). No internal flags. */
create or replace function public.dec107_public_rules()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('hold_limit_days', s.hold_limit_days, 'default_rule_day', s.hold_limit_days - s.default_rule_margin_days,
    'ticket_review_hours', s.ticket_review_hours, 'booking_review_hours', s.booking_review_hours, 'funding_lead_days', public.dec107_funding_lead_days(),
    'reserves', jsonb_build_object('enabled', s.reserves_enabled, 'standard_pct', s.reserve_standard_bps / 100.0, 'standard_days', s.reserve_standard_days,
      'new_seller_days', s.reserve_new_seller_days, 'new_seller_amount_minor', s.reserve_new_seller_minor, 'risk_pct', s.reserve_risk_bps / 100.0,
      'risk_days', s.reserve_risk_days, 'risk_chargeback_pct', s.risk_chargeback_bps / 100.0, 'risk_refund_pct', s.risk_refund_bps / 100.0,
      'risk_window_days', s.risk_window_days, 'risk_min_payments', s.risk_min_payments),
    'payment_terms_version', s.payment_terms_version, 'dispute_rules_version', s.dispute_rules_version,
    'dispute_rules_in_force', s.dispute_rules_in_force_from is not null and s.dispute_rules_in_force_from <= now())
  from public.dec107_settings s where s.id;
$$;
revoke all on function public.dec107_public_rules() from public, anon;
grant execute on function public.dec107_public_rules() to authenticated;
revoke all on function public.dec107_funding_lead_days(integer) from public, anon;
grant execute on function public.dec107_funding_lead_days(integer) to authenticated;

-- ───────────────────────── 2. seller account payout profile ─────────────────────────
alter table public.connect_accounts add column if not exists payout_interval text;
alter table public.connect_accounts add column if not exists debit_negative_balances boolean;

/** Exempt from new DEC-107 gates: demo and QA fixture workspaces (setting exempt_demo_qa, default on). */
create or replace function public.dec107_gate_exempt(p_workspace uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select s.exempt_demo_qa from public.dec107_settings s where s.id), true)
     and (public.is_demo_workspace(p_workspace) or coalesce((select w.is_test_fixture from public.workspaces w where w.id = p_workspace), false));
$$;
revoke all on function public.dec107_gate_exempt(uuid) from public, anon, authenticated;

-- ───────────────────────── 3. per-record release model + charge time ─────────────────────────
alter table public.payment_orders add column if not exists release_model text check (release_model is null or release_model in ('seller_schedule','manual_release'));
alter table public.payment_orders add column if not exists charged_at timestamptz;
alter table public.checkout_orders add column if not exists release_model text check (release_model is null or release_model in ('seller_schedule','manual_release'));
alter table public.checkout_orders add column if not exists charged_at timestamptz;
alter table public.merch_orders add column if not exists release_model text check (release_model is null or release_model in ('seller_schedule','manual_release'));
alter table public.merch_orders add column if not exists charged_at timestamptz;
alter table public.invoice_card_payments add column if not exists release_model text check (release_model is null or release_model in ('seller_schedule','manual_release'));
alter table public.invoice_card_payments add column if not exists charged_at timestamptz;

/**
 * Freezes the record's release model when it is first bound to a seller account (insert, or the account column changes):
 * 'manual_release' when that account has a manual payout schedule, else 'seller_schedule' (legacy Q07). With
 * require_manual_payout_accounts on, a non-exempt record on a non-manual account is refused: COM_SELLER_NOT_READY (the message
 * keeps 'seller_not_ready' so existing callers map it to the "seller finishing set-up, nothing charged" copy).
 * Also stamps charged_at the first time the record reaches its paid state.
 */
create or replace function public.dec107_bind_release_model()
returns trigger language plpgsql security definer set search_path to '' as $$
declare j jsonb := to_jsonb(new); o jsonb; acct text; ws uuid; interval_ text; paid boolean; was_paid boolean; s public.dec107_settings;
begin
  o := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  acct := coalesce(j->>'payee_connected_account_id', j->>'connected_account_id');
  ws := coalesce(j->>'payee_workspace_id', j->>'seller_workspace_id', j->>'workspace_id')::uuid;
  if acct is not null and new.release_model is null
     and (tg_table_name = 'invoice_card_payments' or j->>'strategy' = 'direct')
     and (tg_op = 'INSERT' or acct is distinct from coalesce(o->>'payee_connected_account_id', o->>'connected_account_id')) then
    select c.payout_interval into interval_ from public.connect_accounts c where c.stripe_account_id = acct order by c.updated_at desc limit 1;
    select * into s from public.dec107_settings where id;
    if interval_ = 'manual' then new.release_model := 'manual_release';
    elsif coalesce(s.require_manual_payout_accounts, false) and not public.dec107_gate_exempt(ws) then
      raise exception 'seller_not_ready' using errcode = '22023', detail = 'COM_SELLER_NOT_READY', hint = 'The seller''s payout account is not a DEC-107 (manual payout) account yet.';
    else new.release_model := 'seller_schedule';
    end if;
  end if;
  paid := case tg_table_name when 'payment_orders' then j->>'status' in ('payment_succeeded','protected_pending_delivery')
                             when 'checkout_orders' then j->>'status' in ('paid','issued')
                             when 'merch_orders' then j->>'status' in ('paid','collected')
                             else j->>'status' = 'succeeded' end;
  was_paid := case tg_table_name when 'payment_orders' then o->>'status' in ('payment_succeeded','protected_pending_delivery')
                                 when 'checkout_orders' then o->>'status' in ('paid','issued')
                                 when 'merch_orders' then o->>'status' in ('paid','collected')
                                 else o->>'status' = 'succeeded' end;
  if paid and not coalesce(was_paid, false) and new.charged_at is null then new.charged_at := now(); end if;
  return new;
end $$;
revoke all on function public.dec107_bind_release_model() from public, anon, authenticated;

drop trigger if exists dec107_bind_release_model on public.payment_orders;
create trigger dec107_bind_release_model before insert or update on public.payment_orders for each row execute function public.dec107_bind_release_model();
drop trigger if exists dec107_bind_release_model on public.checkout_orders;
create trigger dec107_bind_release_model before insert or update on public.checkout_orders for each row execute function public.dec107_bind_release_model();
drop trigger if exists dec107_bind_release_model on public.merch_orders;
create trigger dec107_bind_release_model before insert or update on public.merch_orders for each row execute function public.dec107_bind_release_model();
drop trigger if exists dec107_bind_release_model on public.invoice_card_payments;
create trigger dec107_bind_release_model before insert or update on public.invoice_card_payments for each row execute function public.dec107_bind_release_model();

-- ───────────────────────── 4. releases ─────────────────────────
create table if not exists public.payout_releases (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('payment_order','checkout_order','merch_order','invoice_card_payment')),
  source_ref text not null,
  part text not null default 'main' check (part in ('main','reserve')),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9_]+$'),
  payment_intent text,
  event_id uuid,                                   -- grouping key: ticket sales, resales and merch group under their event
  sale_kind text not null check (sale_kind in ('ticket_sale','ticket_resale','booking','merch','invoice')),
  currency text not null default 'GBP',
  livemode boolean not null default false,
  charged_at timestamptz not null,
  trigger_at timestamptz,                          -- approved trigger time; NULL while waiting (e.g. confirmation)
  hold_limit_at timestamptz not null,              -- charged_at + default-rule day: money never stays past this
  due_at timestamptz,
  trigger text check (trigger is null or trigger in ('event_completed_review','customer_confirmed','review_window','settlement',
    'accepted_recommendation','independent_award','default_rule','hold_limit','reserve_end')),
  status text not null default 'held' check (status in ('held','due','blocked','paid_out','failed','cancelled')),
  blocked_reason text,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  reserve_kind text,
  reserve_bps integer,
  reserve_minor bigint check (reserve_minor is null or reserve_minor >= 0),
  reserve_until timestamptz,
  terms_version text,
  stripe_payout_id text,
  payout_group text,
  released_at timestamptz,
  notice_sent_at timestamptz,
  warning_sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_ref, part),
  -- Reserves: only the published objective kinds (no discretionary or fraud reserve), never above 50 %, never past the hold limit.
  constraint payout_releases_reserve_kind check (reserve_kind is null or reserve_kind in ('standard','risk')),
  constraint payout_releases_reserve_bps check (reserve_bps is null or (reserve_bps between 1 and 5000 and reserve_kind is not null)),
  constraint payout_releases_reserve_within_hold check (reserve_until is null or reserve_until <= hold_limit_at),
  constraint payout_releases_reserve_part check (part <> 'reserve' or (reserve_kind is not null and reserve_until is not null))
);
create index if not exists payout_releases_due_idx on public.payout_releases (status, due_at) where status in ('held','due','blocked');
create index if not exists payout_releases_ws_idx on public.payout_releases (workspace_id, event_id);
alter table public.payout_releases enable row level security;
drop policy if exists payout_releases_member_read on public.payout_releases;
create policy payout_releases_member_read on public.payout_releases for select to authenticated
  using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
revoke all on public.payout_releases from anon, authenticated;
grant select on public.payout_releases to authenticated;

-- ───────────────────────── 5. payout pause (staff, second factor, legal basis) ─────────────────────────
create table if not exists public.payout_pauses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The legal bases in the Payment Terms (clause 9). Suspicion alone is never a basis.
  basis text not null check (basis in ('court_order','regulator_or_law_enforcement','payment_provider_instruction','sanctions_screening','seller_insolvency','seller_request')),
  reference text not null check (length(trim(reference)) >= 3),
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  lift_note text
);
create unique index if not exists payout_pauses_one_active on public.payout_pauses (workspace_id) where lifted_at is null;
alter table public.payout_pauses enable row level security;
drop policy if exists payout_pauses_read on public.payout_pauses;
create policy payout_pauses_read on public.payout_pauses for select to authenticated
  using (public.is_platform_admin() or public.has_workspace_role(workspace_id, array['owner','manager']));
revoke all on public.payout_pauses from anon, authenticated;
grant select on public.payout_pauses to authenticated;

create or replace function public.dec107_payouts_paused(p_workspace uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(select 1 from public.payout_pauses p where p.workspace_id = p_workspace and p.lifted_at is null);
$$;
revoke all on function public.dec107_payouts_paused(uuid) from public, anon;
grant execute on function public.dec107_payouts_paused(uuid) to authenticated;

create or replace function public.adm_payout_pause(p_workspace uuid, p_basis text, p_reference text, p_note text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare pid uuid;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_basis is null or p_basis not in ('court_order','regulator_or_law_enforcement','payment_provider_instruction','sanctions_screening','seller_insolvency','seller_request') then
    raise exception 'legal_basis_required' using errcode = '22023', hint = 'Suspicion alone cannot hold money. Choose the Payment Terms basis.';
  end if;
  if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
  if public.dec107_payouts_paused(p_workspace) then raise exception 'already_paused' using errcode = '22023'; end if;
  insert into public.payout_pauses(workspace_id, basis, reference, note, created_by) values (p_workspace, p_basis, trim(p_reference), left(p_note, 1000), auth.uid()) returning id into pid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', p_workspace, 'payout.paused', jsonb_build_object('pause_id', pid, 'basis', p_basis, 'reference', trim(p_reference)));
  perform public.notify_workspace(p_workspace, array['owner','manager'], 'payout_paused', 'Payouts paused',
    'Payouts from your Stripe balance are paused under the Gala Dock Payment Terms (' || replace(p_basis, '_', ' ') || '). Your money stays in your own Stripe balance. Contact support for details.',
    '/organizer/money?tab=settlements');
  return pid;
end $$;
revoke all on function public.adm_payout_pause(uuid, text, text, text) from public, anon;
grant execute on function public.adm_payout_pause(uuid, text, text, text) to authenticated;

create or replace function public.adm_payout_unpause(p_pause uuid, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
declare p public.payout_pauses;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.payout_pauses set lifted_at = now(), lifted_by = auth.uid(), lift_note = left(p_note, 1000) where id = p_pause and lifted_at is null returning * into p;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', p.workspace_id, 'payout.unpaused', jsonb_build_object('pause_id', p.id, 'note', left(p_note, 300)));
  perform public.notify_workspace(p.workspace_id, array['owner','manager'], 'payout_resumed', 'Payouts resumed', 'Payouts from your Stripe balance have resumed.', '/organizer/money?tab=settlements');
end $$;
revoke all on function public.adm_payout_unpause(uuid, text) from public, anon;
grant execute on function public.adm_payout_unpause(uuid, text) to authenticated;

-- ───────────────────────── 6. reserves (objective rules only) ─────────────────────────
/**
 * Reserve for a seller's next release. Risk (up to 50 % for up to 60 days) only when, over the last 90 days with at least 5
 * payments, chargebacks exceed 0.75 % by count or refunds exceed 10 % by value. Standard (10 % for 30 days) while the seller is
 * in its first 90 days of releases or under £2,000 released, whichever ends later. Never discretionary.
 */
create or replace function public.dec107_reserve_for(p_workspace uuid, p_account text, p_livemode boolean)
returns table(kind text, bps integer, days integer) language plpgsql stable security definer set search_path to '' as $$
declare s public.dec107_settings; n integer; gross numeric; cb integer; refunded numeric; first_release timestamptz; released bigint;
begin
  select * into s from public.dec107_settings where id;
  if not s.reserves_enabled then return; end if;
  with pays as (
    select (po.amount_minor + po.customer_fee_minor)::numeric g from public.payment_orders po
      where po.payee_connected_account_id = p_account and po.livemode is not distinct from p_livemode and po.charged_at > now() - make_interval(days => s.risk_window_days)
    union all select round((co.amount + co.fee) * 100) from public.checkout_orders co
      where co.connected_account_id = p_account and co.livemode is not distinct from p_livemode and co.charged_at > now() - make_interval(days => s.risk_window_days)
    union all select mo.total_minor from public.merch_orders mo
      where mo.connected_account_id = p_account and mo.livemode is not distinct from p_livemode and mo.charged_at > now() - make_interval(days => s.risk_window_days))
  select count(*), coalesce(sum(g), 0) into n, gross from pays;
  select count(*) into cb from public.stripe_disputes d where d.stripe_account_id = p_account and d.livemode is not distinct from p_livemode and d.created_at > now() - make_interval(days => s.risk_window_days);
  select coalesce(sum(r.amount_minor), 0) into refunded from public.payment_refunds r
    where r.stripe_account_id = p_account and r.status = 'succeeded' and r.created_at > now() - make_interval(days => s.risk_window_days);
  if n >= s.risk_min_payments and gross > 0 and (cb * 10000 > s.risk_chargeback_bps * n or refunded * 10000 > s.risk_refund_bps * gross) then
    kind := 'risk'; bps := s.reserve_risk_bps; days := s.reserve_risk_days; return next; return;
  end if;
  select min(r.released_at), coalesce(sum(r.amount_minor), 0) into first_release, released from public.payout_releases r
    where r.workspace_id = p_workspace and r.status = 'paid_out' and r.livemode = p_livemode;
  if first_release is null or first_release > now() - make_interval(days => s.reserve_new_seller_days) or released < s.reserve_new_seller_minor then
    kind := 'standard'; bps := s.reserve_standard_bps; days := s.reserve_standard_days; return next;
  end if;
end $$;
revoke all on function public.dec107_reserve_for(uuid, text, boolean) from public, anon, authenticated;

-- ───────────────────────── 7. refund instructions (default rule, settlement, award) ─────────────────────────
create table if not exists public.dec107_refund_instructions (
  id uuid primary key default gen_random_uuid(),
  basis text not null check (basis in ('default_rule','settlement','accepted_recommendation','independent_award')),
  dispute_id uuid references public.booking_disputes(id) on delete restrict,
  build_item_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'due' check (status in ('due','processing','done','failed')),
  idempotency_key text not null unique,
  refunded_minor bigint not null default 0,
  error text,
  created_by uuid,
  checked_by uuid,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  constraint dec107_refund_award_checked check (basis <> 'independent_award' or (checked_by is not null and checked_by is distinct from created_by))
);
alter table public.dec107_refund_instructions enable row level security;
drop policy if exists dec107_refund_instructions_admin on public.dec107_refund_instructions;
create policy dec107_refund_instructions_admin on public.dec107_refund_instructions for select to authenticated using (public.is_platform_admin());
revoke all on public.dec107_refund_instructions from anon, authenticated;
grant select on public.dec107_refund_instructions to authenticated;

-- ───────────────────────── 8. sweep ─────────────────────────
/**
 * Creates and advances releases for DEC-107 records (release_model = manual_release). Idempotent; run by the payments worker
 * every minute. Money moves only in the worker, from the seller's own balance, after this marks a release 'due'.
 */
create or replace function public.dec107_release_sweep()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s public.dec107_settings; created integer := 0; due integer := 0; blocked integer := 0; defaults integer := 0; cancelled integer := 0;
  r record; rv record; hold interval;
begin
  select * into s from public.dec107_settings where id;
  hold := make_interval(days => s.hold_limit_days - s.default_rule_margin_days);

  -- (a) one main release per charged DEC-107 record
  with ins as (
    insert into public.payout_releases(source_type, source_ref, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode, charged_at, hold_limit_at)
    select 'payment_order', po.reference, po.payee_workspace_id, po.payee_connected_account_id, po.stripe_payment_intent, po.event_id, 'booking', upper(po.currency), coalesce(po.livemode, false), po.charged_at, po.charged_at + hold
      from public.payment_orders po
     where po.release_model = 'manual_release' and po.strategy = 'direct' and po.charged_at is not null and po.payee_connected_account_id is not null
    union all
    select 'checkout_order', co.order_ref, co.seller_workspace_id, co.connected_account_id, co.stripe_payment_intent, co.event_id,
           case co.kind when 'resale' then 'ticket_resale' else 'ticket_sale' end, upper(co.currency), coalesce(co.livemode, false), co.charged_at, co.charged_at + hold
      from public.checkout_orders co
     where co.release_model = 'manual_release' and co.strategy = 'direct' and co.charged_at is not null
    union all
    select 'merch_order', mo.order_ref, mo.seller_workspace_id, mo.connected_account_id, mo.stripe_payment_intent, mo.event_id, 'merch', upper(mo.currency), coalesce(mo.livemode, false), mo.charged_at, mo.charged_at + hold
      from public.merch_orders mo
     where mo.release_model = 'manual_release' and mo.strategy = 'direct' and mo.charged_at is not null and mo.connected_account_id is not null
    union all
    select 'invoice_card_payment', ic.id::text, ic.workspace_id, ic.connected_account_id, ic.stripe_payment_intent, i.event_id, 'invoice', upper(ic.currency), coalesce(ic.livemode, false), ic.charged_at, ic.charged_at + hold
      from public.invoice_card_payments ic join public.invoices i on i.id = ic.invoice_id
     where ic.release_model = 'manual_release' and ic.charged_at is not null and ic.connected_account_id is not null
    on conflict (source_type, source_ref, part) do nothing
    returning 1)
  select count(*) into created from ins;

  -- (b) fully refunded records release nothing
  with c as (
    update public.payout_releases pr set status = 'cancelled', blocked_reason = 'fully_refunded', updated_at = now()
     where pr.status in ('held','due','blocked') and pr.part = 'main' and (
       (pr.source_type = 'checkout_order' and exists (select 1 from public.checkout_orders co where co.order_ref = pr.source_ref and co.status = 'refunded'))
       or (pr.source_type = 'payment_order' and exists (select 1 from public.payment_orders po where po.reference = pr.source_ref and po.status in ('refunded','cancelled')))
       or (pr.source_type = 'merch_order' and exists (select 1 from public.merch_orders mo where mo.order_ref = pr.source_ref and mo.status in ('refunded','cancelled'))))
    returning 1)
  select count(*) into cancelled from c;

  -- (c) triggers. Tickets / resales / merch: event completed + review window. Bookings: customer confirmation (item fulfilled or
  --     completed) or event completed + review window. Invoices: event + review, else charge + review.
  update public.payout_releases pr set trigger_at = x.trigger_at, trigger = x.trigger, updated_at = now()
    from (
      select pr2.id,
        case
          when pr2.sale_kind in ('ticket_sale','ticket_resale','merch') then coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.ticket_review_hours)
          when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then least(coalesce(b.updated_at, now()), coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours))
          when pr2.sale_kind = 'booking' then coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours)
          else coalesce(coalesce(e.ends_at, e.starts_at + interval '6 hours'), pr2.charged_at) + make_interval(hours => s.booking_review_hours)
        end trigger_at,
        case when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then 'customer_confirmed'
             when e.id is not null then 'event_completed_review' else 'review_window' end trigger
      from public.payout_releases pr2
      left join public.events e on e.id = pr2.event_id
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      left join public.build_items b on b.id = po.build_item_id
      where pr2.part = 'main' and pr2.status in ('held','blocked') and pr2.trigger not in ('settlement','accepted_recommendation','independent_award','default_rule') is not false
    ) x
   where pr.id = x.id and (pr.trigger_at is distinct from x.trigger_at or pr.trigger is distinct from x.trigger);

  -- (d) blocks: an open booking dispute, an open card dispute or a pending cancellation stop the release (until the hold limit)
  update public.payout_releases pr set status = 'blocked', blocked_reason = y.reason, updated_at = now()
    from (
      select pr2.id, case
        when exists (select 1 from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved') then 'booking_dispute_open'
        when exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr2.payment_intent and sd.outcome is null) then 'card_dispute_open'
        when exists (select 1 from public.booking_cancellations bc where bc.build_item_id = po.build_item_id and bc.status in ('requested','manual_review')) then 'cancellation_pending'
        end reason
      from public.payout_releases pr2
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      where pr2.status in ('held','due','blocked')) y
   where pr.id = y.id and y.reason is not null and pr.trigger is distinct from 'default_rule' and (pr.status <> 'blocked' or pr.blocked_reason is distinct from y.reason);
  update public.payout_releases pr set status = 'held', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason in ('booking_dispute_open','card_dispute_open','cancellation_pending')
     and not exists (select 1 from public.payment_orders po join public.booking_disputes d on d.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and d.status <> 'resolved')
     and not exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr.payment_intent and sd.outcome is null)
     and not exists (select 1 from public.payment_orders po join public.booking_cancellations bc on bc.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and bc.status in ('requested','manual_review'));
  select count(*) into blocked from public.payout_releases where status = 'blocked';

  -- (e) hold-limit default rule: an open booking dispute at the default-rule day → refund the disputed amount (capped by the
  --     worker at what is held), release the rest. Runs whatever the policy version (the provider forces the money out).
  for r in
    select pr.*, d.id dispute_id, d.amount_claimed, po.build_item_id, d.workspace_id dws, d.event_id dev
      from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join lateral (select * from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved' order by d.created_at desc limit 1) d on true
     where pr.part = 'main' and pr.status = 'blocked' and pr.blocked_reason = 'booking_dispute_open' and now() >= pr.hold_limit_at
  loop
    if coalesce(r.amount_claimed, 0) > 0 then
      insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key)
        values ('default_rule', r.dispute_id, r.build_item_id, round(r.amount_claimed * 100)::bigint, 'default_rule:' || r.dispute_id)
        on conflict (idempotency_key) do nothing;
    end if;
    update public.payout_releases set status = 'held', blocked_reason = 'default_rule_refund_first', trigger = 'default_rule', trigger_at = now(), updated_at = now() where id = r.id;
    perform public.dec107_default_rule_notice(r.dispute_id, coalesce(r.amount_claimed, 0));
    defaults := defaults + 1;
  end loop;

  -- (f) due: trigger reached (or hold limit), not blocked, and no default-rule refund still outstanding
  with d as (
    update public.payout_releases pr set status = 'due',
           due_at = least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at),
           trigger = case when pr.trigger_at is null or pr.hold_limit_at < pr.trigger_at then case when pr.trigger = 'default_rule' then 'default_rule' else 'hold_limit' end else pr.trigger end,
           blocked_reason = null, updated_at = now()
     where pr.status = 'held' and pr.part = 'main' and now() >= least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at)
       and not exists (select 1 from public.dec107_refund_instructions ri join public.payment_orders po on po.build_item_id = ri.build_item_id
                        where pr.source_type = 'payment_order' and po.reference = pr.source_ref and ri.status in ('due','processing'))
    returning 1)
  select count(*) into due from d;
  -- card disputes still open at the hold limit: the disputed amount has already left the seller's balance; release the rest
  update public.payout_releases pr set status = 'due', due_at = pr.hold_limit_at, trigger = 'hold_limit', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason = 'card_dispute_open' and now() >= pr.hold_limit_at;
  -- reserve parts come due at their end
  update public.payout_releases pr set status = 'due', due_at = pr.reserve_until, trigger = 'reserve_end', updated_at = now()
   where pr.status = 'held' and pr.part = 'reserve' and now() >= pr.reserve_until;

  -- (g) warning before the default-rule day (both parties), once
  for rv in
    select pr.id, d.id dispute_id from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join public.booking_disputes d on d.build_item_id = po.build_item_id and d.status <> 'resolved'
     where pr.status = 'blocked' and pr.warning_sent_at is null and now() >= pr.hold_limit_at - make_interval(days => s.warning_days)
  loop
    perform public.dec107_dispute_notice(rv.dispute_id, 'dispute_hold_limit_warning', 'Payment hold limit in ' || s.warning_days || ' days',
      'The payment provider''s hold limit for this booking is reached in ' || s.warning_days || ' days. If the dispute is not settled by then, the default rule in the Gala Dock Payment Terms applies: the disputed amount is refunded to the customer and the rest is released to the provider. Settle in the dispute to avoid this.');
    update public.payout_releases set warning_sent_at = now() where id = rv.id;
  end loop;

  return jsonb_build_object('created', created, 'due', due, 'blocked', blocked, 'default_rule', defaults, 'cancelled', cancelled);
end $$;
revoke all on function public.dec107_release_sweep() from public, anon, authenticated;

/** Dispute notices go to both sides with a payments-category kind (always emailed; dispute_* maps to 'payments', mandatory). */
create or replace function public.dec107_dispute_notice(p_dispute uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes;
begin
  select * into d from public.booking_disputes where id = p_dispute;
  if not found then return; end if;
  perform public.notify_workspace(d.workspace_id, array['owner','manager'], p_kind, p_title, p_body, '/provider/disputes/' || d.id);
  perform public.notify_event(d.event_id, p_kind, p_title, p_body, public.event_path(d.event_id, 'dispute', d.id));
end $$;
revoke all on function public.dec107_dispute_notice(uuid, text, text, text) from public, anon, authenticated;

/** Default-rule notice: cites the clause in force, says it is not a decision, says the customer remains liable. */
create or replace function public.dec107_default_rule_notice(p_dispute uuid, p_amount numeric)
returns void language plpgsql security definer set search_path to '' as $$
declare s public.dec107_settings; v text;
begin
  select * into s from public.dec107_settings where id;
  v := case when s.dispute_rules_in_force_from is not null and s.dispute_rules_in_force_from <= now()
            then 'Gala Dock Disputes Policy (' || s.dispute_rules_version || '), clause 13' else 'Gala Dock Payment Terms (' || s.payment_terms_version || '), clause 8.4' end;
  perform public.dec107_dispute_notice(p_dispute, 'dispute_default_rule', 'Default rule applied at the payment hold limit',
    'The payment provider''s hold limit was reached before this dispute was settled, so the default rule in the ' || v || ' applied: £'
    || to_char(coalesce(p_amount, 0), 'FM999G999G990D00') || ' (the disputed amount) is refunded to the customer and the rest is released to the provider. '
    || 'This is not a decision on the dispute. The customer remains liable to pay the provider the refunded amount unless a court, arbitrator or ADR body decides otherwise or you both agree otherwise. '
    || 'The provider can ask Gala Dock for the customer''s contact details.');
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'dispute.default_rule', jsonb_build_object('dispute_id', p_dispute, 'amount', p_amount, 'clause', v));
end $$;
revoke all on function public.dec107_default_rule_notice(uuid, numeric) from public, anon, authenticated;

-- ───────────────────────── 9. worker hand-off ─────────────────────────
/** Due releases the worker may pay out: not paused, livemode as asked, payout country supported. */
create or replace function public.dec107_releases_due(p_livemode boolean, p_limit integer default 100)
returns table(id uuid, part text, workspace_id uuid, stripe_account_id text, payment_intent text, event_id uuid, sale_kind text, currency text,
  source_type text, source_ref text, reserve_minor bigint, trigger text)
language sql stable security definer set search_path to '' as $$
  select pr.id, pr.part, pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, pr.currency, pr.source_type, pr.source_ref,
         case when pr.part = 'reserve' then pr.reserve_minor end, pr.trigger
    from public.payout_releases pr
    left join public.connect_accounts ca on ca.stripe_account_id = pr.stripe_account_id and ca.livemode = pr.livemode
   where pr.status = 'due' and pr.livemode = p_livemode and not public.dec107_payouts_paused(pr.workspace_id)
     and (ca.country is null or exists (select 1 from public.dec107_settings s where s.id and ca.country = any(s.payout_countries)))
   order by pr.due_at nulls last, pr.id
   limit greatest(1, least(p_limit, 500));
$$;
revoke all on function public.dec107_releases_due(boolean, integer) from public, anon, authenticated;

/**
 * Records a payout for a group of releases. p_items: [{id, amount_minor, reserve_kind?, reserve_bps?, reserve_minor?}].
 * A main release with a reserve creates its reserve part (due at reserve end, never past the hold limit).
 */
create or replace function public.dec107_release_paid(p_items jsonb, p_payout text, p_group text)
returns integer language plpgsql security definer set search_path to '' as $$
declare it jsonb; pr public.payout_releases; n integer := 0; s public.dec107_settings;
begin
  select * into s from public.dec107_settings where id;
  if p_payout !~ '^po_[A-Za-z0-9_]+$' then raise exception 'invalid_payout' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from public.payout_releases where id = (it->>'id')::uuid for update;
    if not found or pr.status <> 'due' then continue; end if;
    if public.dec107_payouts_paused(pr.workspace_id) then raise exception 'payouts_paused' using errcode = '22023'; end if;
    update public.payout_releases set status = 'paid_out', amount_minor = (it->>'amount_minor')::bigint, stripe_payout_id = p_payout, payout_group = p_group,
      released_at = now(), reserve_kind = nullif(it->>'reserve_kind', ''), reserve_bps = nullif(it->>'reserve_bps', '')::integer,
      reserve_minor = nullif(it->>'reserve_minor', '')::bigint,
      reserve_until = case when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at) end,
      terms_version = case when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then s.payment_terms_version end,
      error = null, updated_at = now()
     where id = pr.id;
    if pr.part = 'main' and coalesce((it->>'reserve_minor')::bigint, 0) > 0 then
      insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode,
          charged_at, hold_limit_at, trigger_at, trigger, reserve_kind, reserve_bps, reserve_minor, reserve_until, terms_version)
        values (pr.source_type, pr.source_ref, 'reserve', pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, pr.currency, pr.livemode,
          pr.charged_at, pr.hold_limit_at, least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), 'reserve_end',
          it->>'reserve_kind', (it->>'reserve_bps')::integer, (it->>'reserve_minor')::bigint,
          least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), s.payment_terms_version)
        on conflict (source_type, source_ref, part) do nothing;
    end if;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', pr.workspace_id, 'payout.released',
      jsonb_build_object('release', pr.id, 'source', pr.source_type || ':' || pr.source_ref, 'event_id', pr.event_id, 'trigger', pr.trigger, 'payout', p_payout,
        'amount_minor', (it->>'amount_minor')::bigint, 'reserve_minor', (it->>'reserve_minor')::bigint));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.dec107_release_paid(jsonb, text, text) from public, anon, authenticated;

create or replace function public.dec107_release_failed(p_ids uuid[], p_error text)
returns void language sql security definer set search_path to '' as $$
  update public.payout_releases set error = left(p_error, 300), updated_at = now() where id = any(p_ids) and status = 'due';
$$;
revoke all on function public.dec107_release_failed(uuid[], text) from public, anon, authenticated;

-- ───────────────────────── 10. express payment terms ─────────────────────────
/** Records the express acceptance of the Payment Terms (seller at payout set-up; customer at first payment), version-checked. */
create or replace function public.accept_payment_terms(p_role text, p_version text, p_source text default 'app')
returns void language plpgsql security definer set search_path to '' as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_role not in ('seller','customer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select payment_terms_version into v from public.dec107_settings where id;
  if p_version is distinct from v then raise exception 'terms_version_changed' using errcode = '22023', hint = v; end if;
  insert into public.consent_records(user_id, purpose, granted, policy_version, source, context)
    values (auth.uid(), 'payment_terms_' || p_role, true, v, left(coalesce(p_source, 'app'), 60), jsonb_build_object('accepted_at', now()));
end $$;
revoke all on function public.accept_payment_terms(text, text, text) from public, anon;
grant execute on function public.accept_payment_terms(text, text, text) to authenticated;

create or replace function public.payment_terms_accepted(p_role text, p_user uuid default null)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(select 1 from public.consent_records c, public.dec107_settings s
                 where s.id and c.user_id = coalesce(p_user, auth.uid()) and c.purpose = 'payment_terms_' || p_role and c.granted and c.policy_version = s.payment_terms_version)
     and (p_user is null or p_user = auth.uid() or public.is_platform_admin() or auth.uid() is null);
$$;
revoke all on function public.payment_terms_accepted(text, uuid) from public, anon;
grant execute on function public.payment_terms_accepted(text, uuid) to authenticated;

-- ───────────────────────── 11. invariants ─────────────────────────
/** Must return no rows after every money proof (playbook §1.3). */
create or replace function public.dec107_invariants()
returns table(check_name text, ref text, detail jsonb) language sql stable security definer set search_path to '' as $$
  -- no platform transfer on direct-charge money
  select 'platform_transfer_on_direct_charge', po.reference, jsonb_build_object('transfer', po.stripe_transfer)
    from public.payment_orders po where po.strategy = 'direct' and po.stripe_transfer is not null
  union all
  -- application fee never above the gross charge
  select 'application_fee_over_gross', po.reference, jsonb_build_object('fee', po.application_fee_minor, 'gross', po.amount_minor + po.customer_fee_minor)
    from public.payment_orders po where po.strategy = 'direct' and po.application_fee_minor > po.amount_minor + po.customer_fee_minor
  union all
  -- seller fee within the cap (DEC-107: 8 %)
  select 'seller_fee_over_cap', po.reference, jsonb_build_object('seller_fee', po.application_fee_minor - po.customer_fee_minor, 'amount', po.amount_minor)
    from public.payment_orders po, public.dec107_settings s
   where s.id and po.strategy = 'direct' and po.release_model = 'manual_release'
     and po.application_fee_minor - po.customer_fee_minor > ceil(po.amount_minor * s.seller_fee_cap_bps / 10000.0)
  union all
  -- no double refund: succeeded refunds per payment never exceed the charge
  select 'refunds_exceed_charge', r.payment_intent_id, jsonb_build_object('refunded', sum(r.amount_minor), 'charged', max(g.gross))
    from public.payment_refunds r
    join lateral (select coalesce((select po.amount_minor + po.customer_fee_minor from public.payment_orders po where po.stripe_payment_intent = r.payment_intent_id limit 1),
                                  (select round((co.amount + co.fee) * 100)::bigint from public.checkout_orders co where co.stripe_payment_intent = r.payment_intent_id limit 1)) gross) g on true
   where r.status = 'succeeded' and g.gross is not null
   group by r.payment_intent_id having sum(r.amount_minor) > max(g.gross)
  union all
  select 'duplicate_refund_key', r.idempotency_key, jsonb_build_object('n', count(*)) from public.payment_refunds r where r.idempotency_key is not null group by r.idempotency_key having count(*) > 1
  union all
  -- nothing released while payouts were paused
  select 'released_while_paused', pr.id::text, jsonb_build_object('pause', p.id, 'released_at', pr.released_at)
    from public.payout_releases pr join public.payout_pauses p on p.workspace_id = pr.workspace_id
   where pr.released_at is not null and pr.released_at >= p.created_at and (p.lifted_at is null or pr.released_at < p.lifted_at)
  union all
  -- money never held past the hold limit (2-day grace for the worker and Stripe)
  select 'held_past_hold_limit', pr.id::text, jsonb_build_object('status', pr.status, 'hold_limit_at', pr.hold_limit_at)
    from public.payout_releases pr
   where (pr.status in ('held','due','blocked') and now() > pr.hold_limit_at + interval '2 days')
      or (pr.status = 'paid_out' and pr.released_at > pr.hold_limit_at + interval '2 days')
  union all
  -- a DEC-107 record bound to an account that pays out automatically
  select 'manual_record_on_automatic_account', x.ref, jsonb_build_object('account', x.acct, 'interval', ca.payout_interval)
    from (select po.reference ref, po.payee_connected_account_id acct from public.payment_orders po where po.release_model = 'manual_release'
          union all select co.order_ref, co.connected_account_id from public.checkout_orders co where co.release_model = 'manual_release') x
    join public.connect_accounts ca on ca.stripe_account_id = x.acct
   where ca.payout_interval is distinct from 'manual'
  union all
  -- a payout from a DEC-107 account that no release explains
  select 'payout_without_release', cp.stripe_payout_id, jsonb_build_object('account', cp.stripe_account_id, 'amount', cp.amount_minor)
    from public.connected_payouts cp join public.connect_accounts ca on ca.stripe_account_id = cp.stripe_account_id and ca.payout_interval = 'manual'
   where cp.status not in ('failed','canceled') and not exists (select 1 from public.payout_releases pr where pr.stripe_payout_id = cp.stripe_payout_id)
  union all
  -- an independent award without a second-person check, or a refund instruction stuck for a day
  select 'refund_instruction_stuck', ri.id::text, jsonb_build_object('basis', ri.basis, 'status', ri.status, 'error', ri.error)
    from public.dec107_refund_instructions ri where ri.status in ('due','processing','failed') and ri.created_at < now() - interval '1 day';
$$;
revoke all on function public.dec107_invariants() from public, anon, authenticated;
