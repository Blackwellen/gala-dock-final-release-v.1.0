-- Q68 partner decisions + gaps (owner decisions 2026-11-14 item 4 + OWNER UPDATE 2026-11-14; absorbs Q66). Additive: new tables
-- (portal_invites, partner_applications), new columns, status values added to CHECKs (supersets re-added in this file), one policy
-- narrowed to admins (partners read referrals through an anonymised function), in-place bodies with unchanged signatures, new
-- functions. Stripe calls happen in the app (src/lib/partners/payouts.ts); this file records them and enforces the rules.
--
--  1. Settings (commerce, published as a new version): commission base net of VAT ON (VAT collected isn't Gala Dock revenue);
--     earning hold 60 days (partner_earning_hold_days); minimum payout computed from the Connect payout fee config so fees stay
--     ≤ 5% of a payout, floor £50 (partner_payout_fees, partner_minimum_payout()).
--  2. Credit packs qualify like subscription invoices: partner_accrue_revenue is the one accrual path, partner_refund_source the one
--     refund / lost-chargeback path (billing_credit_pack_paid / _refunded call them; affiliate failures never fail billing).
--  3. Statements: a closed month whose balance (commission + opening balance) is below the minimum — including a negative balance
--     from clawbacks — rolls forward into the next open statement (status 'rolled_over', daily with the clearing job).
--     Settlement is by Stripe Connect Transfer from the platform balance to the partner's no-dashboard connected account
--     (prepare → app transfer with idempotency key per statement → transferred / transfer_failed), then a manual payout to the
--     partner's bank recorded on the statement. VAT-registered UK partners get VAT on top (self-billing statement, numbered).
--     A negative statement can be recovered by reversing the latest partner transfer where Stripe still allows it.
--     Manual "Mark paid" is retired (admin_partner_statement_paid refuses).
--  4. Partner portal totals only (Partner Terms §6): partner_portal_referrals() returns anonymised rows ("Referral #n").
--  5. admin_request_money('partner_payout') retired; history stays readable, open requests can still be cancelled.
--  6. Partners: self-serve application (partner_apply, versioned terms + self-billing consent in consent_records) with an admin
--     approval queue (admin_partner_application_decide, aal2 + reason, audited); admin Create partner + Invite login kept as an extra
--     path; organiser promoter login invite. Invites: portal_invites (hashed single-use token, email-bound, 14 days).
--  7. Promoter sales approval and payout runs: owner / manager / finance only; the unused 'stripe' promoter payout method refused.

-- ── 1. Settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare cur public.platform_settings; nv integer;
begin
  select * into cur from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1;
  if coalesce(cur.value ->> 'partner_commission_net_of_vat', '') = 'true' and cur.value ? 'partner_payout_fees' and cur.value ? 'partner_earning_hold_days' then return; end if;
  select coalesce(max(version), 0) + 1 into nv from public.platform_settings where section = 'commerce';
  update public.platform_settings set status = 'superseded' where section = 'commerce' and status = 'published';
  insert into public.platform_settings(section, version, status, value, effective_at, change_reason, summary)
  values ('commerce', nv, 'published',
    coalesce(cur.value, '{}'::jsonb) || jsonb_build_object(
      'partner_commission_net_of_vat', true,
      'partner_earning_hold_days', 60,
      -- Stripe Connect (UK pricing, platform-controlled accounts): £2 per active account per month, 0.25% + £0.10 per payout.
      'partner_payout_fees', jsonb_build_object('active_account_fee_gbp', 2, 'payout_fixed_fee_gbp', 0.10, 'payout_bps', 25, 'max_fee_bps', 500, 'floor_gbp', 50)),
    now(), 'Owner decisions 2026-11-14 (Q68): partner commission net of VAT on subscriptions + credit packs; 60-day earning hold; minimum payout from Connect fees (≤5%, floor £50); paid by Stripe Connect transfer',
    'Partner commission: net of VAT, 60-day hold, fee-driven minimum payout');
end $$;

-- Smallest payout whose Connect fees (monthly active-account fee + per-payout fee) are at most max_fee_bps of it, never below the floor.
create or replace function public.partner_minimum_payout() returns numeric
language sql stable security definer set search_path = '' as $$
  with f as (select coalesce(public.commerce_setting('partner_payout_fees'), '{}'::jsonb) v)
  select greatest(
    coalesce((v ->> 'floor_gbp')::numeric, 50),
    ceil(((coalesce((v ->> 'active_account_fee_gbp')::numeric, 2) + coalesce((v ->> 'payout_fixed_fee_gbp')::numeric, 0.10))
          / greatest((coalesce((v ->> 'max_fee_bps')::numeric, 500) - coalesce((v ->> 'payout_bps')::numeric, 25)) / 10000.0, 0.0001)))) from f;
$$;

create or replace function public.partner_earning_hold_days() returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(nullif(public.commerce_setting('partner_earning_hold_days') #>> '{}', '')::integer, 60), 0);
$$;

-- ── 2. One accrual path (subscription invoices + credit packs) ─────────────────────────────────────────────────────────────────
create or replace function public.partner_accrue_revenue(p_workspace uuid, p_source text, p_paid_minor bigint, p_tax_minor bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.partner_referrals; a public.partner_attributions; p public.partners; rule public.partner_commission_rules;
  eligible numeric; comm numeric; v uuid; months int;
begin
  if p_workspace is null or coalesce(p_source, '') = '' or coalesce(p_paid_minor, 0) <= 0 then return null; end if;
  if exists (select 1 from public.partner_earnings where source_invoice = p_source) then return null; end if;
  select x.* into a from public.partner_attributions x join public.partner_referrals rr on rr.id = x.referral_id where rr.workspace_id = p_workspace and x.status <> 'rejected' limit 1;
  if a.id is null then return null; end if;
  select * into r from public.partner_referrals where id = a.referral_id;
  select * into p from public.partners where id = a.partner_id;
  if p.status <> 'active' then return null; end if;
  -- Same payment fingerprint as the partner's own billing → self-referral.
  if a.payment_fingerprint is not null and a.payment_fingerprint = nullif(p.details ->> 'payment_fingerprint', '') then
    update public.partner_attributions set status = 'rejected', rejection_reason = 'same_payment_fingerprint' where id = a.id;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.attribution_rejected', jsonb_build_object('partner_id', p.id, 'reason', 'same_payment_fingerprint'));
    return null;
  end if;
  months := coalesce(nullif(p.details ->> 'commission_months', '')::int, 12);
  if a.created_at < now() - make_interval(months => months) then return null; end if;
  select * into rule from public.partner_commission_rules x where x.partner_id = p.id order by x.version desc limit 1;
  -- Owner decision 2026-11-14: the base is the amount paid net of VAT (switch commerce.partner_commission_net_of_vat).
  eligible := round((p_paid_minor - case when coalesce(public.commerce_setting('partner_commission_net_of_vat') #>> '{}', 'false') = 'true'
                                         then least(greatest(coalesce(p_tax_minor, 0), 0), p_paid_minor) else 0 end) / 100.0, 2);
  if rule.basis = 'fixed_bounty' then
    if exists (select 1 from public.partner_earnings where referral_id = r.id and status <> 'reversed') then return null; end if;
    comm := coalesce(nullif(p.details ->> 'bounty_gbp', '')::numeric, 0);
  else
    comm := round(eligible * rule.commission_bps / 10000.0, 2);
  end if;
  insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps)
    values (p.id, r.id, now(), eligible, comm, 'pending', p_source, rule.id, rule.version, rule.commission_bps) returning id into v;
  update public.partner_referrals set status = 'active', activated_at = coalesce(activated_at, now()) where id = r.id and status in ('pending','trial');
  update public.partner_attributions set status = 'qualified', qualified_at = coalesce(qualified_at, now()) where id = a.id;
  update public.partners set referrals = (select count(*) from public.partner_referrals where partner_id = p.id),
    eligible_revenue = eligible_revenue + eligible, earned = earned + comm where id = p.id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_accrued',
    jsonb_build_object('partner_id', p.id, 'earning_id', v, 'invoice', p_source, 'rule_version', rule.version, 'commission', comm));
  return v;
end $$;

CREATE OR REPLACE FUNCTION public.partner_qualify_invoice(p_invoice text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.subscription_invoices;
begin
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice;
  if i.stripe_invoice_id is null or i.status <> 'paid' or coalesce(i.amount_paid, 0) <= 0 then return null; end if;
  return public.partner_accrue_revenue(i.workspace_id, p_invoice, i.amount_paid, i.tax_minor);
end $function$;

-- Reversal of an earning. Q68: an earning sitting on a statement that already rolled forward (its balance was carried into a later
-- statement) or is mid-transfer ('processing') cannot simply leave its statement — it becomes a negative clawback earning that nets on the next one.
CREATE OR REPLACE FUNCTION public.partner_reverse_earning(p_earning uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.partner_earnings; st text; v uuid;
begin
  select * into e from public.partner_earnings where id = p_earning for update;
  if e.id is null or e.status in ('reversed','paid') then return false; end if;
  select s.status into st from public.partner_statements s where s.id = e.statement_id;
  if st in ('rolled_over', 'processing') then
    if exists (select 1 from public.partner_earnings c where c.clawback_of = e.id and c.status <> 'reversed') then return false; end if;
    insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps, clawback_of)
      values (e.partner_id, e.referral_id, now(), -e.eligible_revenue, -e.commission, 'pending', 'clawback:reversal:' || e.id, e.commission_rule_id, e.commission_rule_version, e.commission_bps, e.id)
      on conflict (source_invoice) where source_invoice is not null do nothing returning id into v;
    update public.partners set earned = greatest(earned - e.commission, 0), eligible_revenue = greatest(eligible_revenue - e.eligible_revenue, 0) where id = e.partner_id and v is not null;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_clawback',
      jsonb_build_object('earning_id', e.id, 'clawback_id', v, 'partner_id', e.partner_id, 'commission', -e.commission, 'reason', left(coalesce(p_reason, ''), 120), 'statement_rolled_over', true));
    return v is not null;
  end if;
  update public.partner_earnings set status = 'reversed', reversed_at = now() where id = e.id;
  if e.statement_id is not null then perform public.partner_statement_recompute(e.statement_id); end if;
  update public.partners set earned = greatest(earned - e.commission, 0), eligible_revenue = greatest(eligible_revenue - e.eligible_revenue, 0) where id = e.partner_id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_reversed', jsonb_build_object('earning_id', e.id, 'partner_id', e.partner_id, 'reason', left(coalesce(p_reason, ''), 120)));
  return true;
end $function$;

-- One refund / lost-chargeback path (cumulative + idempotent per refunded total), for invoices and credit packs alike.
create or replace function public.partner_refund_source(p_source text, p_paid_minor bigint, p_refunded_minor bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.partner_earnings; ratio numeric; target numeric; done numeric; delta numeric; rev numeric; v uuid;
begin
  select * into e from public.partner_earnings where source_invoice = p_source and clawback_of is null for update;
  if e.id is null or e.status = 'reversed' or coalesce(p_paid_minor, 0) <= 0 or coalesce(p_refunded_minor, 0) <= 0 then
    return jsonb_build_object('source', p_source, 'clawback', 0);
  end if;
  ratio := least(p_refunded_minor::numeric / p_paid_minor, 1);
  -- Not yet paid to the partner, refunded in full, nothing clawed back yet: a plain reversal (partner_reverse_earning turns it into
  -- a clawback when its statement already rolled forward).
  if ratio >= 1 and e.status in ('pending', 'cleared') and not exists (select 1 from public.partner_earnings c where c.clawback_of = e.id and c.status <> 'reversed') then
    perform public.partner_reverse_earning(e.id, left(coalesce(p_reason, 'refund'), 120));
    return jsonb_build_object('source', p_source, 'reversed', e.id);
  end if;
  target := round(e.commission * ratio, 2);
  select coalesce(-sum(c.commission), 0) into done from public.partner_earnings c where c.clawback_of = e.id and c.status <> 'reversed';
  delta := target - done;
  if delta <= 0 then return jsonb_build_object('source', p_source, 'clawback', 0); end if;
  rev := case when e.commission > 0 then round(e.eligible_revenue * delta / e.commission, 2) else 0 end;
  insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps, clawback_of)
    values (e.partner_id, e.referral_id, now(), -rev, -delta, 'pending', 'clawback:' || p_source || ':' || target, e.commission_rule_id, e.commission_rule_version, e.commission_bps, e.id)
    returning id into v;
  update public.partners set earned = earned - delta, eligible_revenue = eligible_revenue - rev where id = e.partner_id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_clawback',
    jsonb_build_object('earning_id', e.id, 'clawback_id', v, 'partner_id', e.partner_id, 'invoice', p_source, 'commission', -delta, 'reason', left(coalesce(p_reason, ''), 120)));
  return jsonb_build_object('source', p_source, 'clawback', delta, 'clawback_id', v);
end $$;

create or replace function public.partner_refund_invoice(p_invoice text, p_refunded_minor bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.subscription_invoices; r jsonb;
begin
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice for update;
  if i.stripe_invoice_id is null then return jsonb_build_object('invoice', false); end if;
  update public.subscription_invoices set amount_refunded = greatest(amount_refunded, least(coalesce(p_refunded_minor, 0), 2147483647)::integer), updated_at = now()
   where stripe_invoice_id = p_invoice;
  r := public.partner_refund_source(p_invoice, i.amount_paid, p_refunded_minor, p_reason);
  return jsonb_build_object('invoice', true) || (r - 'source');
end $$;

-- Credit packs: accrue on payment, reverse / claw back on refund or lost chargeback (both already called by the webhook).
CREATE OR REPLACE FUNCTION public.billing_credit_pack_paid(p_session jsonb, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.credit_packs; v_ws uuid := nullif(p_session -> 'metadata' ->> 'workspace_id', '')::uuid; ws public.workspaces; v_id uuid; v_earning uuid;
begin
  if coalesce(p_session ->> 'id', '') !~ '^cs_[A-Za-z0-9_]+$' or p_session -> 'metadata' ->> 'purpose' <> 'ai_credits' then raise exception 'invalid_session' using errcode = '22023'; end if;
  if p_session ->> 'payment_status' <> 'paid' then return jsonb_build_object('credited', false, 'reason', 'not_paid'); end if;
  select * into k from public.credit_packs where id = nullif(p_session -> 'metadata' ->> 'pack_id', '')::uuid;
  if not found then raise exception 'unknown_pack' using errcode = 'P0002'; end if;
  select * into ws from public.workspaces where id = v_ws;
  if not found or not (ws.kind = any (k.workspace_kinds)) then raise exception 'pack_not_for_workspace' using errcode = '22023'; end if;
  if coalesce((p_session ->> 'amount_subtotal')::integer, (p_session ->> 'amount_total')::integer, -1) <> k.price_minor
     or upper(coalesce(p_session ->> 'currency', '')) <> upper(k.currency) then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, pack_id, payment_ref, expires_at, stripe_payment_intent)
    values (ws.id, 'purchase', k.credits, 'Credit pack ' || k.name, k.id, p_session ->> 'id', case when k.expiry_days is not null then now() + make_interval(days => k.expiry_days) end,
      nullif(coalesce(p_session ->> 'payment_intent', p_session -> 'payment_intent' ->> 'id'), ''))   -- Q60: refunds find the lot by payment intent
  on conflict (payment_ref) where kind = 'purchase' and payment_ref is not null do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('credited', false, 'reason', 'duplicate'); end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws.id, 'billing.credit_pack_paid',
    jsonb_build_object('session', p_session ->> 'id', 'pack', k.name, 'credits', k.credits, 'amount_minor', k.price_minor, 'livemode', coalesce(p_livemode, false)));
  -- Q68: credit packs are in the partner commission base, like subscription invoices (amount paid net of VAT).
  begin
    v_earning := public.partner_accrue_revenue(ws.id, 'pack:' || (p_session ->> 'id'),
      coalesce((p_session ->> 'amount_total')::bigint, k.price_minor::bigint), coalesce((p_session -> 'total_details' ->> 'amount_tax')::bigint, 0));
  exception when others then   -- affiliate accounting must never fail billing; audited for ops
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', ws.id, 'partner.qualify_failed', jsonb_build_object('invoice', 'pack:' || (p_session ->> 'id'), 'error', left(sqlerrm, 200)));
  end;
  return jsonb_build_object('credited', true, 'credits', k.credits, 'ledger_id', v_id, 'partner_earning', v_earning);
end $function$;

CREATE OR REPLACE FUNCTION public.billing_credit_pack_refunded(p_charge jsonb, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pi text := coalesce(p_charge ->> 'payment_intent', p_charge -> 'payment_intent' ->> 'id'); lot public.ai_credit_ledger;
  v_total numeric := coalesce((p_charge ->> 'amount')::numeric, 0); v_refunded numeric := coalesce((p_charge ->> 'amount_refunded')::numeric, 0);
  target numeric; done numeric; delta numeric;
begin
  if coalesce(v_pi, '') !~ '^pi_[A-Za-z0-9_]+$' then return jsonb_build_object('credit_pack', false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credit-pack-refund:' || v_pi, 0));
  select * into lot from public.ai_credit_ledger where kind = 'purchase' and stripe_payment_intent = v_pi order by created_at limit 1;
  if not found then return jsonb_build_object('credit_pack', false); end if;
  if v_total <= 0 or v_refunded <= 0 then return jsonb_build_object('credit_pack', true, 'reversed', 0); end if;
  -- Q68: the partner commission on the pack is reversed / clawed back for the refunded share (idempotent per refunded total).
  begin
    perform public.partner_refund_source('pack:' || lot.payment_ref, v_total::bigint, least(v_refunded, v_total)::bigint, 'credit_pack_refund');
  exception when others then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', lot.workspace_id, 'partner.refund_failed', jsonb_build_object('invoice', 'pack:' || lot.payment_ref, 'error', left(sqlerrm, 200)));
  end;
  target := round(lot.credits * least(v_refunded, v_total) / v_total, 3);
  select coalesce(-sum(credits), 0) into done from public.ai_credit_ledger where workspace_id = lot.workspace_id and kind = 'reversal' and stripe_payment_intent = v_pi and starts_with(payment_ref, 'refund:' || v_pi || ':');
  delta := target - done;
  if delta <= 0 then return jsonb_build_object('credit_pack', true, 'reversed', 0); end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, pack_id, payment_ref, stripe_payment_intent)
    values (lot.workspace_id, 'reversal', -delta, 'Refund of ' || coalesce(lot.reference, 'credit pack'), lot.pack_id, 'refund:' || v_pi || ':' || v_refunded::bigint, v_pi);   -- payment_ref is unique: one row per cumulative refund total
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', lot.workspace_id, 'billing.credit_pack_refunded',
    jsonb_build_object('payment_intent', v_pi, 'charge', p_charge ->> 'id', 'credits_reversed', delta, 'refunded_minor', v_refunded, 'amount_minor', v_total, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('credit_pack', true, 'reversed', delta);
end $function$;

-- ── 3. Statements: minimum, rollover, carry-forward, Stripe Connect settlement, self-billing VAT ────────────────────────────────
alter table public.partner_statements add column if not exists opening_balance numeric(12,2) not null default 0;
alter table public.partner_statements add column if not exists carried_to uuid references public.partner_statements(id);
alter table public.partner_statements add column if not exists carried_amount numeric(12,2);
alter table public.partner_statements add column if not exists carried_at timestamptz;
alter table public.partner_statements add column if not exists processing_at timestamptz;
alter table public.partner_statements add column if not exists livemode boolean;
alter table public.partner_statements add column if not exists vat_rate_bps integer;
alter table public.partner_statements add column if not exists vat_amount numeric(12,2);
alter table public.partner_statements add column if not exists amount_paid numeric(12,2);
alter table public.partner_statements add column if not exists self_bill_number text;
alter table public.partner_statements add column if not exists settlement_method text;
alter table public.partner_statements add column if not exists transfer_id text;
alter table public.partner_statements add column if not exists transfer_key text;
alter table public.partner_statements add column if not exists stripe_payout_id text;
alter table public.partner_statements add column if not exists stripe_payout_status text;
alter table public.partner_statements add column if not exists reversed_amount numeric(12,2) not null default 0;
alter table public.partner_statements drop constraint if exists partner_statements_status_check;
alter table public.partner_statements add constraint partner_statements_status_check check (status = any (array['open'::text, 'pending'::text, 'paid'::text, 'on_hold'::text, 'rolled_over'::text, 'processing'::text]));
create index if not exists partner_statements_carried_to_idx on public.partner_statements(carried_to) where carried_to is not null;
create unique index if not exists partner_statements_self_bill_number on public.partner_statements(self_bill_number) where self_bill_number is not null;
create unique index if not exists partner_statements_transfer on public.partner_statements(transfer_id) where transfer_id is not null;

-- Partner payout account (no-dashboard Connect account, one per Stripe mode) and tax details for self-billing.
alter table public.partners add column if not exists stripe_account_id text;
alter table public.partners add column if not exists stripe_account_id_live text;
alter table public.partners add column if not exists payout_status text not null default 'not_connected';
alter table public.partners add column if not exists payout_country text;
alter table public.partners add column if not exists vat_registered boolean not null default false;
alter table public.partners add column if not exists vat_number text;
alter table public.partners drop constraint if exists partners_payout_status_check;
alter table public.partners add constraint partners_payout_status_check check (payout_status in ('not_connected', 'incomplete', 'pending', 'active', 'restricted'));
alter table public.partners drop constraint if exists partners_vat_number_check;
alter table public.partners add constraint partners_vat_number_check check (vat_number is null or vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$');

create or replace function public.partner_roll_forward_statements() returns integer
language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date; minimum numeric := public.partner_minimum_payout(); s record; tgt uuid; bal numeric; n int := 0;
begin
  for s in select st.id from public.partner_statements st
           where st.status in ('open','pending') and st.period_start < m order by st.partner_id, st.period_start loop
    perform public.partner_statement_recompute(s.id);
    select * into s from public.partner_statements where id = s.id for update;
    if s.status not in ('open','pending') then continue; end if;
    bal := s.commission + s.opening_balance;
    if bal >= minimum then continue; end if;   -- payable: waits for the admin to settle it
    select st.id into tgt from public.partner_statements st
      where st.partner_id = s.partner_id and st.period_start > s.period_start and st.status in ('open','pending') order by st.period_start limit 1;
    if tgt is null then
      insert into public.partner_statements(partner_id, period_start, status, payout_due)
        values (s.partner_id, m, 'open', (m + interval '2 months' - interval '1 day')::date) on conflict (partner_id, period_start) do nothing;
      select st.id into tgt from public.partner_statements st where st.partner_id = s.partner_id and st.period_start = m and st.status in ('open','pending');
    end if;
    if tgt is null then continue; end if;   -- the current month is on hold: nothing to roll into until an admin decides
    update public.partner_statements set opening_balance = opening_balance + bal where id = tgt;
    update public.partner_statements set status = 'rolled_over', carried_to = tgt, carried_amount = bal, carried_at = now() where id = s.id;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.statement_rolled_over',
      jsonb_build_object('statement_id', s.id, 'partner_id', s.partner_id, 'into', tgt, 'balance', bal, 'minimum', minimum,
        'reason', case when bal < 0 then 'negative_balance' else 'below_minimum' end));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.job_partner_clear_earnings(p_job public.job_queue)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('statements', public.partner_clear_due_earnings(public.partner_earning_hold_days()), 'rolled_over', public.partner_roll_forward_statements());
end $$;
update public.job_kinds set description = 'Q65/Q68: daily; partner earnings clear after the hold (commerce.partner_earning_hold_days, 60) into the monthly statement; below-minimum and negative closed statements roll forward', updated_at = now()
 where kind = 'partners.clear_earnings';

-- Manual "Mark paid" is retired: statements are settled by Stripe Connect transfer (owner update 2026-11-14).
CREATE OR REPLACE FUNCTION public.admin_partner_statement_paid(p_statement uuid, p_reference text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.admin_require('partners', p_reason);
  raise exception 'stripe_transfer_required' using errcode = '55000', hint = 'Partner statements are paid with "Pay via Stripe" (Connect transfer).';
end $function$;

-- Step 1 of settlement: validate, fix the amount (balance + VAT for UK VAT-registered partners), number the self-billing statement,
-- lock it 'processing' and hand the app the transfer parameters + idempotency key. Re-running on a 'processing' statement returns
-- the same parameters (the key makes the Stripe transfer happen at most once).
create or replace function public.admin_partner_statement_prepare(p_statement uuid, p_livemode boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements; p public.partners; minimum numeric := public.partner_minimum_payout(); due numeric; vat_bps int; vat numeric; acct text;
begin
  perform public.admin_require('partners', p_reason);
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from public.partners where id = st.partner_id for update;
  acct := case when coalesce(p_livemode, false) then p.stripe_account_id_live else p.stripe_account_id end;
  if st.status = 'processing' then
    if st.livemode is distinct from coalesce(p_livemode, false) then raise exception 'mode_changed' using errcode = '55000'; end if;
  else
    if st.status not in ('open','pending') then raise exception 'invalid_state' using errcode = '55000'; end if;
    if st.period_start >= date_trunc('month', now())::date then raise exception 'period_open' using errcode = '55000'; end if;
    perform public.partner_statement_recompute(st.id);
    select * into st from public.partner_statements where id = st.id;
    due := st.commission + st.opening_balance;
    if due < 0 then raise exception 'negative_balance' using errcode = '55000'; end if;
    if due < minimum then raise exception 'below_minimum' using errcode = '55000'; end if;
    if acct is null or p.payout_status <> 'active' then raise exception 'payouts_not_set_up' using errcode = '55000'; end if;
    if p.user_id is not null and public.risk_hold_active('payout', 'user', p.user_id) then raise exception 'payout_hold_active' using errcode = '55000'; end if;
    -- Self-billing: VAT on top only for UK VAT-registered partners; other VAT-registered partners are reverse charge (no UK VAT).
    vat_bps := case when p.vat_registered and upper(coalesce(p.payout_country, '')) = 'GB' then public.vat_rate_bps() else 0 end;
    vat := round(due * vat_bps / 10000.0, 2);
    update public.partner_statements set status = 'processing', processing_at = now(), livemode = coalesce(p_livemode, false),
      vat_rate_bps = vat_bps, vat_amount = vat, amount_paid = due + vat,
      self_bill_number = coalesce(self_bill_number, 'GDSB-' || to_char(period_start, 'YYYYMM') || '-' || upper(left(replace(id::text, '-', ''), 8))),
      transfer_key = 'partner-statement-' || id || '-' || round((due + vat) * 100)::bigint
     where id = st.id returning * into st;
    insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_transfer_started',
      jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'amount', st.amount_paid, 'vat', st.vat_amount, 'livemode', st.livemode, 'reason', p_reason));
  end if;
  if acct is null then raise exception 'payouts_not_set_up' using errcode = '55000'; end if;
  return jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'account', acct, 'currency', 'gbp',
    'amount_minor', round(st.amount_paid * 100)::bigint, 'vat_minor', round(coalesce(st.vat_amount, 0) * 100)::bigint,
    'idempotency_key', st.transfer_key, 'self_bill_number', st.self_bill_number, 'period_start', st.period_start);
end $$;

-- Step 2a: the transfer succeeded → the statement (and every statement carried into it) is paid; ledger memo + audit.
create or replace function public.admin_partner_statement_transferred(p_statement uuid, p_transfer text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements; c bigint; due numeric; chain uuid[];
begin
  perform public.admin_require('partners', p_reason);
  if coalesce(p_transfer, '') !~ '^tr_[A-Za-z0-9_]+$' then raise exception 'invalid_transfer' using errcode = '22023'; end if;
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st.status = 'paid' and st.transfer_id = p_transfer then return; end if;   -- replay
  if st.status <> 'processing' then raise exception 'invalid_state' using errcode = '55000'; end if;
  due := st.amount_paid - coalesce(st.vat_amount, 0);
  with recursive ch(id) as (select st.id union all select s.id from public.partner_statements s join ch on s.carried_to = ch.id)
  select array_agg(id) into chain from ch;
  perform public.partner_post_memo(e.id, 'accrual') from public.partner_earnings e where e.statement_id = any(chain) and e.status <> 'reversed';
  update public.partner_earnings set status = 'paid' where statement_id = any(chain) and status <> 'reversed';
  update public.partner_statements set status = 'paid', paid_at = now(), reference = p_transfer, transfer_id = p_transfer, settlement_method = 'stripe_transfer', processing_at = null
   where id = st.id returning * into st;
  update public.partners set paid = paid + due where id = st.partner_id;
  c := round(due * 100);
  if c > 0 then
    perform public.post_memo_ledger_transaction('partner:statement:' || st.id || ':paid', 'affiliate_commission', 'GBP',
      jsonb_build_array(
        jsonb_build_object('account', 'affiliate_payable', 'party_type', 'partner', 'party_id', st.partner_id, 'amount_minor', c),
        jsonb_build_object('account', 'platform_affiliate_settled', 'party_type', 'platform', 'amount_minor', -c)),
      'platform_obligation_memo', null, null, 'partner_statement', st.id::text, 'Partner statement settled by Stripe Connect transfer ' || p_transfer || ' (memo)', null, 'admin');
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_paid',
    jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'commission', st.commission, 'opening_balance', st.opening_balance, 'amount', due,
      'vat', st.vat_amount, 'transfer', p_transfer, 'self_bill_number', st.self_bill_number, 'carried_in', coalesce(array_length(chain, 1), 1) - 1, 'reason', p_reason));
end $$;

-- Step 2b: Stripe refused the transfer → back to open (amount and number kept for the retry; same idempotency key while unchanged).
create or replace function public.admin_partner_statement_transfer_failed(p_statement uuid, p_error text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements;
begin
  perform public.admin_require('partners', p_reason);
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st.status <> 'processing' then return; end if;
  update public.partner_statements set status = 'open', processing_at = null where id = st.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_transfer_failed',
    jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'error', left(coalesce(p_error, ''), 200), 'reason', p_reason));
end $$;

-- Step 3: the manual payout from the partner's connected balance to their bank (created by the app right after the transfer).
create or replace function public.admin_partner_statement_payout(p_statement uuid, p_payout text, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements;
begin
  perform public.admin_require('partners', p_reason);
  if p_payout is not null and p_payout !~ '^po_[A-Za-z0-9_]+$' then raise exception 'invalid_payout' using errcode = '22023'; end if;
  if coalesce(p_status, '') not in ('pending', 'in_transit', 'paid', 'failed', 'canceled', 'not_sent') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null or st.status <> 'paid' or st.transfer_id is null then raise exception 'invalid_state' using errcode = '55000'; end if;
  update public.partner_statements set stripe_payout_id = coalesce(p_payout, stripe_payout_id), stripe_payout_status = p_status where id = st.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_payout',
    jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'payout', p_payout, 'status', p_status, 'reason', p_reason));
end $$;

-- Clawback recovery: a negative statement can be recovered by reversing part of the latest partner transfer (Stripe allows it while
-- the money is still in the partner's connected balance). Prepare returns the transfer + amount + key; recovered records it.
create or replace function public.admin_partner_statement_recovery_prepare(p_statement uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements; src public.partner_statements; owed numeric; amt numeric;
begin
  perform public.admin_require('partners', p_reason);
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st.status not in ('open','pending') then raise exception 'invalid_state' using errcode = '55000'; end if;
  perform public.partner_statement_recompute(st.id);
  select * into st from public.partner_statements where id = st.id;
  owed := -(st.commission + st.opening_balance);
  if owed <= 0 then raise exception 'not_negative' using errcode = '55000'; end if;
  select * into src from public.partner_statements s where s.partner_id = st.partner_id and s.status = 'paid' and s.transfer_id is not null
     and s.amount_paid - s.reversed_amount > 0 order by s.paid_at desc limit 1;
  if src.id is null then raise exception 'no_transfer_to_reverse' using errcode = 'P0002'; end if;
  amt := least(owed, src.amount_paid - src.reversed_amount);
  return jsonb_build_object('statement_id', st.id, 'source_statement', src.id, 'transfer_id', src.transfer_id, 'amount_minor', round(amt * 100)::bigint,
    'idempotency_key', 'partner-recover-' || st.id || '-' || src.id || '-' || round(amt * 100)::bigint);
end $$;

create or replace function public.admin_partner_statement_recovered(p_statement uuid, p_source uuid, p_reversal text, p_amount_minor bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements; src public.partner_statements; amt numeric := round(coalesce(p_amount_minor, 0) / 100.0, 2);
begin
  perform public.admin_require('partners', p_reason);
  if coalesce(p_reversal, '') !~ '^trr_[A-Za-z0-9_]+$' or amt <= 0 then raise exception 'invalid_reversal' using errcode = '22023'; end if;
  if exists (select 1 from public.audit_events where event = 'admin.partner_statement_recovered' and metadata ->> 'reversal' = p_reversal) then return; end if;   -- replay
  select * into st from public.partner_statements where id = p_statement for update;
  select * into src from public.partner_statements where id = p_source for update;
  if st.id is null or src.id is null or src.partner_id <> st.partner_id or src.status <> 'paid' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if amt > src.amount_paid - src.reversed_amount then raise exception 'reversal_exceeds_transfer' using errcode = '22023'; end if;
  update public.partner_statements set reversed_amount = reversed_amount + amt where id = src.id;
  update public.partner_statements set opening_balance = opening_balance + amt where id = st.id;
  update public.partners set paid = paid - amt where id = st.partner_id;
  perform public.post_memo_ledger_transaction('partner:recover:' || p_reversal, 'affiliate_commission', 'GBP',
    jsonb_build_array(
      jsonb_build_object('account', 'affiliate_payable', 'party_type', 'partner', 'party_id', st.partner_id, 'amount_minor', -round(amt * 100)::bigint),
      jsonb_build_object('account', 'platform_affiliate_settled', 'party_type', 'platform', 'amount_minor', round(amt * 100)::bigint)),
    'platform_obligation_memo', null, null, 'partner_statement', st.id::text, 'Partner clawback recovered by transfer reversal ' || p_reversal || ' (memo)', null, 'admin');
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_recovered',
    jsonb_build_object('statement_id', st.id, 'source_statement', src.id, 'partner_id', st.partner_id, 'reversal', p_reversal, 'amount', amt, 'reason', p_reason));
end $$;

-- Payout account state, written by the app after it creates / re-reads the partner's connected account (service-only).
create or replace function public.partner_payout_account_sync(p_partner uuid, p_livemode boolean, p_account text, p_status text, p_country text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_account is not null and p_account !~ '^acct_[A-Za-z0-9_]+$' then raise exception 'invalid_account' using errcode = '22023'; end if;
  if p_status not in ('not_connected', 'incomplete', 'pending', 'active', 'restricted') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.partners set
    stripe_account_id = case when coalesce(p_livemode, false) then stripe_account_id else p_account end,
    stripe_account_id_live = case when coalesce(p_livemode, false) then p_account else stripe_account_id_live end,
    payout_status = p_status, payout_country = coalesce(upper(p_country), payout_country)
   where id = p_partner;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.payout_account_synced',
    jsonb_build_object('partner_id', p_partner, 'status', p_status, 'livemode', coalesce(p_livemode, false), 'country', upper(p_country)));
end $$;

-- Partner's own tax details (self-billing statements show VAT on top for UK VAT-registered partners).
create or replace function public.partner_set_tax_details(p_vat_registered boolean, p_vat_number text) returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid; num text := nullif(upper(regexp_replace(coalesce(p_vat_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  select id into pid from public.partners where user_id = auth.uid() and status <> 'terminated' order by created_at limit 1;
  if pid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  if coalesce(p_vat_registered, false) and (num is null or num !~ '^[A-Z]{2}[A-Z0-9]{2,13}$') then raise exception 'invalid_vat_number' using errcode = '22023'; end if;
  update public.partners set vat_registered = coalesce(p_vat_registered, false), vat_number = case when coalesce(p_vat_registered, false) then num end where id = pid;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'partner.tax_details_updated',
    jsonb_build_object('partner_id', pid, 'vat_registered', coalesce(p_vat_registered, false)));
end $$;

-- ── 4. Partner portal: anonymised referrals (Partner Terms §6) ────────────────────────────────────────────────────────────────
drop policy if exists partner_referrals_read on public.partner_referrals;
create policy partner_referrals_read on public.partner_referrals for select to authenticated using (public.has_admin_permission('partners'));

create or replace function public.partner_portal_referrals()
returns table(ref_no integer, kind text, status text, signed_up_at timestamptz, activated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by r.signed_up_at, r.id))::integer, r.kind, r.status, r.signed_up_at, r.activated_at
    from public.partner_referrals r
   where r.partner_id = (select p.id from public.partners p where p.user_id = (select auth.uid()) and p.status <> 'terminated' order by p.created_at limit 1)
   order by r.signed_up_at desc, r.id desc
   limit 2000;
$$;
revoke all on function public.partner_portal_referrals() from public, anon;
grant execute on function public.partner_portal_referrals() to authenticated;

-- ── 5. Retire admin partner payout requests ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_request_money(p_kind text, p_transaction uuid, p_partner uuid, p_case uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.transactions; rid uuid; already numeric;
begin
  -- Q68 (owner decision 2026-11-14): partners are paid by bank transfer recorded on their monthly statement (Partners → Payouts →
  -- Mark paid). Money requests for partners are retired; old rows stay readable and open ones can still be cancelled.
  if p_kind = 'partner_payout' then raise exception 'partner_payout_retired' using errcode = '55000'; end if;
  if p_case is not null and public.has_admin_permission('support') then perform public.admin_require('support', p_reason);
  else perform public.admin_require('commerce', p_reason); end if;
  if p_kind not in ('refund','payout_retry') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_transaction is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.transactions where id = p_transaction;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'refund' then
    if t.kind not in ('income','payment') or t.status not in ('completed','partial') then raise exception 'not_refundable' using errcode = '22023'; end if;
    select coalesce(sum(amount), 0) into already from public.admin_money_requests where transaction_id = t.id and kind = 'refund' and status in ('pending','processing','completed');
    if already + p_amount > abs(t.amount) then raise exception 'refund_exceeds_amount' using errcode = '22023'; end if;
  elsif t.kind <> 'payout' or t.status <> 'failed' and t.status <> 'pending' then raise exception 'not_retryable' using errcode = '22023'; end if;
  insert into public.admin_money_requests(kind, transaction_id, partner_id, case_id, amount, reason, requested_by, requested_by_name)
    values (p_kind, p_transaction, null, p_case, round(p_amount, 2), trim(p_reason), auth.uid(), public.admin_actor_name()) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), t.workspace_id, 'admin.money_request_' || p_kind,
    jsonb_build_object('request_id', rid, 'transaction_id', p_transaction, 'partner_id', null, 'case_id', p_case, 'amount', p_amount, 'reason', p_reason));
  if p_case is not null then
    insert into public.support_messages(case_id, author_id, author, body, internal, role)
      values (p_case, auth.uid(), public.admin_actor_name(), 'Refund request of £' || to_char(p_amount, 'FM999999990.00') || ' recorded (pending processor). Reason: ' || left(trim(p_reason), 300), true, 'support');
  end if;
  return rid;
end $$;

-- ── 5/6. Portal login invites (partners + promoters) ─────────────────────────────────────────────────────────────────────────
create table if not exists public.portal_invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('partner', 'promoter')),
  partner_id uuid references public.partners(id) on delete cascade,
  promoter_id uuid references public.promoters(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and length(email) <= 254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '14 days',
  created_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  constraint portal_invites_subject check ((kind = 'partner' and partner_id is not null and promoter_id is null) or (kind = 'promoter' and promoter_id is not null and partner_id is null))
);
create index if not exists portal_invites_partner_idx on public.portal_invites(partner_id) where partner_id is not null;
create index if not exists portal_invites_promoter_idx on public.portal_invites(promoter_id) where promoter_id is not null;
alter table public.portal_invites enable row level security;
revoke all on public.portal_invites from anon;
revoke insert, update, delete on public.portal_invites from authenticated;
grant select on public.portal_invites to authenticated;
drop policy if exists portal_invites_read on public.portal_invites;
create policy portal_invites_read on public.portal_invites for select to authenticated using (
  (partner_id is not null and public.has_admin_permission('partners')) or (promoter_id is not null and public.can_manage_promoter(promoter_id)));

create or replace function public.portal_invite_state(i public.portal_invites) returns text
language sql stable set search_path = '' as $$
  select case when i.accepted_at is not null then 'used' when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired' else 'valid' end;
$$;

create or replace function public.admin_create_partner(p_name text, p_email text, p_kind text, p_commission_bps integer, p_country text, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; code text; nm text := trim(coalesce(p_name, '')); em text := lower(trim(coalesce(p_email, ''))); tries int := 0;
begin
  perform public.admin_require('partners', p_reason);
  if length(nm) < 2 or length(nm) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(em) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if p_kind not in ('affiliate', 'strategic') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_commission_bps is not null and (p_commission_bps < 0 or p_commission_bps > 5000) then raise exception 'invalid_rate' using errcode = '22023'; end if;
  if p_country is not null and p_country !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if exists (select 1 from public.partners p where lower(coalesce(p.details ->> 'email', '')) = em and p.status <> 'terminated') then
    raise exception 'partner_exists' using errcode = '23505';
  end if;
  loop
    tries := tries + 1;
    code := coalesce(nullif(left(upper(regexp_replace(nm, '[^A-Za-z0-9]', '', 'g')), 8), ''), 'PARTNER') || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from public.partners where referral_code = code) or tries > 8;
  end loop;
  -- Standard terms: graded rate (grade 1 = 6%, re-graded by active referrals). Custom terms: the given rate, locked.
  insert into public.partners(name, kind, status, referral_code, commission_bps, commission_basis, rate_locked, grade, payout_country, details)
    values (nm, p_kind, 'active', code, coalesce(p_commission_bps, 600), 'subscription_revenue', p_commission_bps is not null, 1, p_country,
      jsonb_build_object('email', em, 'type', p_kind, 'country_code', p_country, 'agreement', case when p_commission_bps is null then 'Affiliate & Partner Terms (standard, graded)' else 'Affiliate & Partner Terms (custom rate)' end,
        'created_via', 'admin', 'created_by', public.admin_actor_name()))
    returning id into v;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_created',
    jsonb_build_object('partner_id', v, 'name', nm, 'email_domain', split_part(em, '@', 2), 'kind', p_kind, 'commission_bps', coalesce(p_commission_bps, 600), 'rate_locked', p_commission_bps is not null, 'reason', p_reason));
  return v;
end $$;

create or replace function public.admin_partner_invite(p_partner uuid, p_email text, p_token_hash text, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.partners; em text := lower(trim(coalesce(p_email, ''))); v uuid;
begin
  perform public.admin_require('partners', p_reason);
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(em) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  select * into p from public.partners where id = p_partner for update;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.status = 'terminated' then raise exception 'partner_terminated' using errcode = '55000'; end if;
  if p.user_id is not null then raise exception 'already_linked' using errcode = '55000'; end if;
  if not public.hit_rate_limit('partner-invite:' || auth.uid(), 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.portal_invites set revoked_at = now() where partner_id = p.id and accepted_at is null and revoked_at is null;
  insert into public.portal_invites(kind, partner_id, email, token_hash, created_by) values ('partner', p.id, em, p_token_hash, auth.uid()) returning id into v;
  update public.partners set details = coalesce(details, '{}'::jsonb) || jsonb_build_object('email', coalesce(nullif(details ->> 'email', ''), em)) where id = p.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_invited',
    jsonb_build_object('partner_id', p.id, 'invite_id', v, 'email_domain', split_part(em, '@', 2), 'reason', p_reason));
  return v;
end $$;

create or replace function public.promoter_invite(p_promoter uuid, p_email text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pr record; em text := lower(trim(coalesce(p_email, ''))); v uuid;
begin
  select p.id, p.user_id, p.status, e.workspace_id, e.owner_id into pr from public.promoters p join public.events e on e.id = p.event_id where p.id = p_promoter for update of p;
  if pr.id is null or not public.can_manage_promoter(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- Owner / manager (or the owner of a personal event) invite promoters.
  if not ((pr.workspace_id is null and pr.owner_id = auth.uid()) or public.has_workspace_role(pr.workspace_id, array['owner','manager'])) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform public.require_step_up(pr.workspace_id);
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(em) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  if pr.user_id is not null then raise exception 'already_linked' using errcode = '55000'; end if;
  if not public.hit_rate_limit('promoter-invite:' || auth.uid(), 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.portal_invites set revoked_at = now() where promoter_id = pr.id and accepted_at is null and revoked_at is null;
  insert into public.portal_invites(kind, promoter_id, email, token_hash, created_by) values ('promoter', pr.id, em, p_token_hash, auth.uid()) returning id into v;
  update public.promoters set email = em where id = pr.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', pr.workspace_id, 'promoter.invited',
    jsonb_build_object('promoter_id', pr.id, 'invite_id', v, 'email_domain', split_part(em, '@', 2)));
  return v;
end $$;

create or replace function public.portal_invite_preview(p_token_hash text)
returns table(kind text, title text, detail text, state text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.kind,
         case when i.kind = 'partner' then p.name else pr.name end,
         case when i.kind = 'partner' then 'Gala Dock partner portal' else 'Promoter for ' || coalesce(e.name, 'an event') end,
         public.portal_invite_state(i), i.expires_at
    from public.portal_invites i
    left join public.partners p on p.id = i.partner_id
    left join public.promoters pr on pr.id = i.promoter_id
    left join public.events e on e.id = pr.event_id
   where coalesce(p_token_hash, '') ~ '^[0-9a-f]{64}$' and i.token_hash = p_token_hash;
$$;

create or replace function public.portal_invite_accept(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); i public.portal_invites; addr text; st text; ws uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('result', 'unavailable'); end if;
  select * into i from public.portal_invites where token_hash = p_token_hash for update;
  if i.id is null then return jsonb_build_object('result', 'unavailable'); end if;
  st := public.portal_invite_state(i);
  if st <> 'valid' then return jsonb_build_object('result', st); end if;
  select lower(u.email) into addr from auth.users u where u.id = uid;
  if addr is distinct from i.email then return jsonb_build_object('result', 'mismatch'); end if;
  if i.kind = 'partner' then
    if exists (select 1 from public.partners p where p.user_id = uid and p.status <> 'terminated' and p.id <> i.partner_id) then return jsonb_build_object('result', 'already_partner'); end if;
    update public.partners set user_id = uid where id = i.partner_id and (user_id is null or user_id = uid) and status <> 'terminated';
    if not found then return jsonb_build_object('result', 'unavailable'); end if;
  else
    update public.promoters set user_id = uid where id = i.promoter_id and (user_id is null or user_id = uid);
    if not found then return jsonb_build_object('result', 'unavailable'); end if;
    select e.workspace_id into ws from public.promoters pr join public.events e on e.id = pr.event_id where pr.id = i.promoter_id;
  end if;
  update public.portal_invites set accepted_at = now(), accepted_by = uid where id = i.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, 'user', ws, i.kind || '.invite_accepted',
    jsonb_build_object('invite_id', i.id, 'partner_id', i.partner_id, 'promoter_id', i.promoter_id));
  return jsonb_build_object('result', 'accepted', 'next', case when i.kind = 'partner' then '/partner' else '/promoter/' || i.promoter_id end);
end $$;

revoke all on function public.admin_create_partner(text, text, text, integer, text, text), public.admin_partner_invite(uuid, text, text, text),
  public.promoter_invite(uuid, text, text), public.portal_invite_accept(text) from public, anon;
grant execute on function public.admin_create_partner(text, text, text, integer, text, text), public.admin_partner_invite(uuid, text, text, text),
  public.promoter_invite(uuid, text, text), public.portal_invite_accept(text) to authenticated;
revoke all on function public.portal_invite_preview(text) from public;
grant execute on function public.portal_invite_preview(text) to anon, authenticated;

-- ── 7. Promoter approvals + payout runs: owner / manager / finance ───────────────────────────────────────────────────────────
create or replace function public.promoter_money_role(p_promoter uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.promoters p join public.events e on e.id = p.event_id where p.id = p_promoter and (
    (e.workspace_id is null and e.owner_id = (select auth.uid())) or public.has_workspace_role(e.workspace_id, array['owner','manager','finance'])));
$$;
revoke all on function public.promoter_money_role(uuid) from public, anon;
grant execute on function public.promoter_money_role(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.promoter_approve_sales(p_promoter uuid, p_sales uuid[] DEFAULT NULL::uuid[], p_note text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int; ws uuid;
begin
  if not public.can_manage_promoter(p_promoter) or not public.promoter_money_role(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  select e.workspace_id into ws from public.promoters p join public.events e on e.id = p.event_id where p.id = p_promoter;
  update public.promoter_sales s set status = 'approved', approved_at = now(), approved_by = auth.uid()
   where s.promoter_id = p_promoter and s.status = 'pending' and (p_sales is null or s.id = any(p_sales))
     and (s.order_ref is null or exists (select 1 from public.checkout_orders o where o.order_ref = s.order_ref and o.status = 'issued' and coalesce(o.refund_status, 'none') in ('none','not_required')));
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'promoter.sales_approved', jsonb_build_object('promoter_id', p_promoter, 'count', n, 'note', left(coalesce(p_note, ''), 300)));
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.promoter_create_payout(p_promoter uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid; gross numeric := 0; claw numeric := 0; c record; ws uuid;
begin
  if not public.can_manage_promoter(p_promoter) or not public.promoter_money_role(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  perform 1 from public.promoters where id = p_promoter for update;
  select e.workspace_id into ws from public.promoters p join public.events e on e.id = p.event_id where p.id = p_promoter;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  if gross <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0002'; end if;
  perform set_config('gd.promoter_payout', 'on', true);
  insert into public.promoter_payouts(promoter_id, amount, status, scheduled_for, gross_commission, clawback_deducted, locked_at, locked_by, reference)
    values (p_promoter, gross, 'held', current_date, gross, 0, now(), auth.uid(), nullif(left(coalesce(p_note, ''), 120), '')) returning id into v;
  update public.promoter_sales set payout_id = v, status = 'held' where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  -- Sales accrued before Q27 get their accrual memo now (idempotent), so the settlement memo always discharges a recorded obligation.
  perform public.promoter_post_memo(s.id, 'accrual') from public.promoter_sales s where s.payout_id = v;
  -- Only commission the promoter has actually been paid can be clawed back: the payout that carried the sale must be 'paid'.
  -- (A clawback whose payout is still held/payable waits; if that payout fails the sale becomes a plain reversal instead.)
  for c in select s.id, coalesce(s.clawback_amount, s.commission) amt from public.promoter_sales s join public.promoter_payouts op on op.id = s.payout_id
           where s.promoter_id = p_promoter and s.clawback_pending and s.clawback_payout_id is null and op.status = 'paid'
           order by s.reversed_at, s.id loop
    exit when claw + c.amt > gross;
    update public.promoter_sales set clawback_payout_id = v where id = c.id;
    claw := claw + c.amt;
  end loop;
  update public.promoter_payouts set clawback_deducted = claw, amount = gross - claw where id = v;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'promoter.payout_locked',
    jsonb_build_object('payout_id', v, 'promoter_id', p_promoter, 'gross', gross, 'clawback', claw, 'amount', gross - claw));
  return jsonb_build_object('payout_id', v, 'gross', gross, 'clawback', claw, 'amount', gross - claw);
end $function$;

CREATE OR REPLACE FUNCTION public.promoter_payout_transition(p_payout uuid, p_action text, p_reference text DEFAULT NULL::text, p_method text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.promoter_payouts; e record; c bigint; ws uuid;
begin
  select * into p from public.promoter_payouts where id = p_payout for update;
  if p.id is null or not public.can_manage_promoter(p.promoter_id) or not public.promoter_money_role(p.promoter_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p.locked_at is null then raise exception 'legacy_payout' using errcode = '55000'; end if;
  if p_method is not null and p_method not in ('bank_transfer','paypal','cash','other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  perform public.require_step_up(null);
  select ev.workspace_id into ws from public.promoters pr join public.events ev on ev.id = pr.event_id where pr.id = p.promoter_id;
  perform set_config('gd.promoter_payout', 'on', true);
  if p_action = 'approve' and p.status = 'held' then
    update public.promoter_payouts set status = 'payable', approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'payable' where payout_id = p.id;
  elsif p_action = 'mark_paid' and p.status = 'payable' then
    if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
    update public.promoter_payouts set status = 'paid', paid_at = now(), reference = left(p_reference, 120), settlement_method = coalesce(p_method, 'bank_transfer'), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'paid' where payout_id = p.id;
    update public.promoter_sales set clawback_pending = false where clawback_payout_id = p.id;
    c := round(p.amount * 100);
    if c > 0 then
      select ev.workspace_id, ev.owner_id, upper(coalesce(ev.currency, 'GBP')) currency, ev.id into e
        from public.promoters pr join public.events ev on ev.id = pr.event_id where pr.id = p.promoter_id;
      -- Statement of the organiser's off-platform settlement: the promoter obligation is discharged; no Gala Dock account moves.
      perform public.post_memo_ledger_transaction('promoter:payout:' || p.id || ':paid', 'promoter_commission', e.currency,
        jsonb_build_array(
          jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', p.promoter_id, 'amount_minor', c),
          jsonb_build_object('account', 'seller_promoter_settled', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end, 'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', -c)),
        'seller_obligation_memo', e.workspace_id, e.id, 'promoter_payout', p.id::text, 'Promoter commission settled by the organiser off-platform (memo)', null, 'user');
    end if;
  elsif p_action = 'fail' and p.status in ('held','payable') then
    -- Sales reversed while locked in this payout were never paid: they become plain reversals (their reversal memo was posted
    -- when they were reversed), so no later payout nets them as a clawback.
    update public.promoter_sales set status = 'reversed', payout_id = null, clawback_pending = false where payout_id = p.id and clawback_pending and clawback_amount is null;
    -- Q58: a PARTIAL clawback on this payout: the sale goes back to approved with the clawed part removed (its memo was already posted).
    -- Two steps: the sale-lock trigger allows the commission change only once the sale is out of the payout.
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id and clawback_pending and clawback_amount is not null;
    update public.promoter_sales set commission = greatest(0, commission - clawback_amount), clawback_pending = false, clawback_amount = null
     where payout_id is null and clawback_pending and clawback_amount is not null and clawback_payout_id is null and status = 'approved' and promoter_id = p.promoter_id;
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id;
    update public.promoter_sales set clawback_payout_id = null where clawback_payout_id = p.id;
    update public.promoter_payouts set status = 'failed', failure_reason = left(coalesce(p_reference, ''), 300), updated_at = now() where id = p.id;
  else
    raise exception 'invalid_transition: % from %', p_action, p.status using errcode = '55000';
  end if;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'promoter.payout_' || p_action,
    jsonb_build_object('payout_id', p.id, 'promoter_id', p.promoter_id, 'amount', p.amount, 'reference', left(coalesce(p_reference, ''), 120), 'method', p_method));
  return (select status from public.promoter_payouts where id = p.id);
end $function$;

-- No Stripe onboarding flow exists for promoters: commission is settled by the organiser off-platform.
CREATE OR REPLACE FUNCTION public.promoter_set_payout_method(p_promoter uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ws uuid; v_event uuid;
begin
  if not public.owns_promoter(p_promoter) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  if p_method is not null and p_method not in ('bank_transfer','paypal') then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.promoters set payout_method = p_method where id = p_promoter returning event_id into v_event;
  select workspace_id into v_ws from public.events where id = v_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), v_ws, 'promoter.payout_method_set', jsonb_build_object('promoter_id', p_promoter, 'method', p_method));
end $function$;

-- ── 8. Self-serve partner applications + admin approval queue ────────────────────────────────────────────────────────────────
alter table public.consent_records drop constraint if exists consent_records_purpose_check;
alter table public.consent_records add constraint consent_records_purpose_check check (purpose = any (array['marketing_email'::text, 'cookies_analytics'::text, 'cookies_marketing'::text,
  'recording'::text, 'partner_sharing'::text, 'terms'::text, 'privacy_notice'::text, 'experiments'::text, 'payment_terms_seller'::text, 'payment_terms_customer'::text,
  'dispute_rules'::text, 'partner_terms'::text, 'partner_self_billing'::text]));
alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check check (source = any (array['settings'::text, 'signup'::text, 'cookie_banner'::text, 'profile'::text,
  'admin'::text, 'import'::text, 'event_registration'::text, 'app'::text, 'payout_setup'::text, 'checkout'::text, 'booking_payment'::text, 'dispute'::text, 'partner_application'::text]));

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  contact_name text not null check (length(contact_name) between 2 and 120),
  business_name text not null check (length(business_name) between 2 and 160),
  business_type text not null check (business_type in ('individual', 'sole_trader', 'company', 'charity', 'other')),
  country text not null check (country ~ '^[A-Z]{2}$'),
  website text check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  audience text not null default '' check (length(audience) <= 1000),
  vat_registered boolean not null default false,
  vat_number text check (vat_number is null or vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  terms_version text not null check (length(terms_version) between 1 and 40),
  self_billing_accepted boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  partner_id uuid references public.partners(id),
  created_at timestamptz not null default now()
);
create unique index if not exists partner_applications_one_pending on public.partner_applications(user_id) where status = 'pending';
create index if not exists partner_applications_status_idx on public.partner_applications(status, created_at desc);
alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from anon;
revoke insert, update, delete on public.partner_applications from authenticated;
grant select on public.partner_applications to authenticated;
drop policy if exists partner_applications_read on public.partner_applications;
create policy partner_applications_read on public.partner_applications for select to authenticated
  using (user_id = (select auth.uid()) or public.has_admin_permission('partners'));

create or replace function public.partner_terms_version() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(public.commerce_setting('partner_terms_version') #>> '{}', ''), '2026-10');
$$;
grant execute on function public.partner_terms_version() to anon, authenticated;

create or replace function public.partner_apply(p_contact_name text, p_business_name text, p_business_type text, p_country text, p_website text, p_audience text,
  p_vat_registered boolean, p_vat_number text, p_terms_version text, p_self_billing boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); em text; v uuid; num text := nullif(upper(regexp_replace(coalesce(p_vat_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select lower(u.email) into em from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if em is null then raise exception 'email_unverified' using errcode = '42501'; end if;
  if exists (select 1 from public.partners where user_id = uid and status <> 'terminated') then raise exception 'already_partner' using errcode = '55000'; end if;
  if exists (select 1 from public.partner_applications where user_id = uid and status = 'pending') then raise exception 'already_applied' using errcode = '55000'; end if;
  if not public.hit_rate_limit('partner-apply:' || uid, 5, 86400) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_terms_version is distinct from public.partner_terms_version() then raise exception 'terms_changed' using errcode = '22023'; end if;
  if not coalesce(p_self_billing, false) then raise exception 'self_billing_required' using errcode = '22023'; end if;
  if coalesce(p_vat_registered, false) and (num is null or num !~ '^[A-Z]{2}[A-Z0-9]{2,13}$') then raise exception 'invalid_vat_number' using errcode = '22023'; end if;
  insert into public.partner_applications(user_id, email, contact_name, business_name, business_type, country, website, audience, vat_registered, vat_number, terms_version, self_billing_accepted)
    values (uid, em, trim(p_contact_name), trim(p_business_name), p_business_type, upper(p_country), nullif(trim(coalesce(p_website, '')), ''), left(trim(coalesce(p_audience, '')), 1000),
      coalesce(p_vat_registered, false), case when coalesce(p_vat_registered, false) then num end, p_terms_version, true)
    returning id into v;
  insert into public.consent_records(user_id, purpose, granted, policy_version, source, context) values
    (uid, 'partner_terms', true, p_terms_version, 'partner_application', jsonb_build_object('application_id', v)),
    (uid, 'partner_self_billing', true, p_terms_version, 'partner_application', jsonb_build_object('application_id', v));
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (uid, 'user', 'partner.application_submitted',
    jsonb_build_object('application_id', v, 'country', upper(p_country), 'business_type', p_business_type, 'terms_version', p_terms_version));
  return v;
end $$;

create or replace function public.admin_partner_application_decide(p_application uuid, p_approve boolean, p_kind text, p_commission_bps integer, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.partner_applications; pid uuid; code text; tries int := 0;
begin
  perform public.admin_require('partners', p_reason);
  select * into a from public.partner_applications where id = p_application for update;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
  if not coalesce(p_approve, false) then
    update public.partner_applications set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_reason = left(p_reason, 500) where id = a.id;
    insert into public.notifications(user_id, kind, title, body, link) values (a.user_id, 'partner_payouts_application', 'Your Gala Dock partner application',
      'Thanks for applying. We can’t approve your partner application at the moment. Reason: ' || left(p_reason, 300), '/partner/apply');
    insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_application_rejected', jsonb_build_object('application_id', a.id, 'reason', p_reason));
    return null;
  end if;
  if coalesce(p_kind, 'affiliate') not in ('affiliate', 'strategic') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_commission_bps is not null and (p_commission_bps < 0 or p_commission_bps > 5000) then raise exception 'invalid_rate' using errcode = '22023'; end if;
  if exists (select 1 from public.partners where user_id = a.user_id and status <> 'terminated') then raise exception 'already_partner' using errcode = '55000'; end if;
  loop
    tries := tries + 1;
    code := coalesce(nullif(left(upper(regexp_replace(a.business_name, '[^A-Za-z0-9]', '', 'g')), 8), ''), 'PARTNER') || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from public.partners where referral_code = code) or tries > 8;
  end loop;
  -- The applicant already has a verified Gala Dock login: the partner record is linked to it (no separate invite needed).
  insert into public.partners(user_id, name, kind, status, referral_code, commission_bps, commission_basis, rate_locked, grade, payout_country, vat_registered, vat_number, details)
    values (a.user_id, a.business_name, coalesce(p_kind, 'affiliate'), 'active', code, coalesce(p_commission_bps, 600), 'subscription_revenue', p_commission_bps is not null, 1,
      a.country, a.vat_registered, a.vat_number,
      jsonb_build_object('email', a.email, 'type', coalesce(p_kind, 'affiliate'), 'country_code', a.country, 'domain', nullif(regexp_replace(coalesce(a.website, ''), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
        'agreement', 'Affiliate & Partner Terms ' || a.terms_version || case when p_commission_bps is null then ' (standard, graded)' else ' (custom rate)' end,
        'self_billing_accepted', a.self_billing_accepted, 'application_id', a.id, 'contact_name', a.contact_name))
    returning id into pid;
  update public.partner_applications set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = left(p_reason, 500), partner_id = pid where id = a.id;
  insert into public.notifications(user_id, kind, title, body, link) values (a.user_id, 'partner_payouts_application', 'You’re a Gala Dock partner',
    'Your partner application was approved. Open the partner portal for your referral link, and set up payouts so we can pay your commission.', '/partner');
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_application_approved',
    jsonb_build_object('application_id', a.id, 'partner_id', pid, 'kind', coalesce(p_kind, 'affiliate'), 'commission_bps', coalesce(p_commission_bps, 600), 'reason', p_reason));
  return pid;
end $$;

revoke all on function public.partner_apply(text, text, text, text, text, text, boolean, text, text, boolean), public.admin_partner_application_decide(uuid, boolean, text, integer, text),
  public.partner_set_tax_details(boolean, text), public.admin_partner_statement_prepare(uuid, boolean, text), public.admin_partner_statement_transferred(uuid, text, text),
  public.admin_partner_statement_transfer_failed(uuid, text, text), public.admin_partner_statement_payout(uuid, text, text, text),
  public.admin_partner_statement_recovery_prepare(uuid, text), public.admin_partner_statement_recovered(uuid, uuid, text, bigint, text) from public, anon;
grant execute on function public.partner_apply(text, text, text, text, text, text, boolean, text, text, boolean), public.admin_partner_application_decide(uuid, boolean, text, integer, text),
  public.partner_set_tax_details(boolean, text), public.admin_partner_statement_prepare(uuid, boolean, text), public.admin_partner_statement_transferred(uuid, text, text),
  public.admin_partner_statement_transfer_failed(uuid, text, text), public.admin_partner_statement_payout(uuid, text, text, text),
  public.admin_partner_statement_recovery_prepare(uuid, text), public.admin_partner_statement_recovered(uuid, uuid, text, bigint, text) to authenticated;

-- Grants (Q01): accounting internals stay service-only.
revoke all on function public.partner_minimum_payout(), public.partner_earning_hold_days(), public.partner_accrue_revenue(uuid, text, bigint, bigint),
  public.partner_refund_source(text, bigint, bigint, text), public.partner_roll_forward_statements(), public.partner_payout_account_sync(uuid, boolean, text, text, text),
  public.portal_invite_state(public.portal_invites) from public, anon, authenticated;
grant execute on function public.partner_minimum_payout(), public.partner_earning_hold_days(), public.partner_accrue_revenue(uuid, text, bigint, bigint),
  public.partner_refund_source(text, bigint, bigint, text), public.partner_roll_forward_statements(), public.partner_payout_account_sync(uuid, boolean, text, text, text) to service_role;
