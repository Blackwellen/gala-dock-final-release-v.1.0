-- Q60 add-on (coordinator, from the partner lane Q65): partner commission on Gala Dock's own subscription / credit-pack invoices.
-- Additive: nullable columns, one FK column, four new functions + one trigger, in-place bodies for billing_record_invoice and
-- partner_qualify_invoice (same signatures). Nothing here moves money; partner settlement stays a recorded statement.
--   1. Refunds and lost chargebacks on a subscription / credit-pack invoice now reverse the partner earning for it: an unpaid earning
--      refunded in full is reversed; a paid earning (or a partial refund) gets a negative clawback earning that clears into the next
--      statement (partner_refund_invoice, cumulative + idempotent per refund total). Before, only void/uncollectible reversed.
--   2. Referrals become 'churned' when the workspace's subscription is canceled / unpaid / incomplete_expired, and 'active' again
--      when it comes back, then partner_apply_grade re-grades the partner (grade formula unchanged).
--   3. billing_record_payment_fingerprint: the card fingerprint of a platform payment is written to the paying workspace's partner
--      attribution (and to the partner's own details when the workspace owner is a partner), and a match rejects the attribution
--      as a self-referral and reverses its unpaid earnings. Before, nothing ever wrote payment_fingerprint, so the check was dead.
--   4. subscription_invoices stores tax_minor / total_excluding_tax (+ payment intent / charge for refund matching).
--      partner_qualify_invoice keeps the VAT-inclusive base unless platform setting commerce.partner_commission_net_of_vat = true.

alter table public.subscription_invoices add column if not exists tax_minor integer;
alter table public.subscription_invoices add column if not exists total_excluding_tax integer;
alter table public.subscription_invoices add column if not exists stripe_payment_intent text;
alter table public.subscription_invoices add column if not exists stripe_charge text;
alter table public.subscription_invoices add column if not exists amount_refunded integer not null default 0;
create index if not exists subscription_invoices_pi_idx on public.subscription_invoices(stripe_payment_intent) where stripe_payment_intent is not null;
create index if not exists subscription_invoices_charge_idx on public.subscription_invoices(stripe_charge) where stripe_charge is not null;
alter table public.partner_earnings add column if not exists clawback_of uuid references public.partner_earnings(id);
create index if not exists partner_earnings_clawback_idx on public.partner_earnings(clawback_of) where clawback_of is not null;

-- 4. Invoice tax + payment refs ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_record_invoice(p_inv jsonb, p_event_created bigint, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ws uuid; v_sub text := coalesce(p_inv ->> 'subscription', p_inv -> 'parent' -> 'subscription_details' ->> 'subscription'); n integer := 0;
  -- Q60: tax and the payment behind the invoice (both Stripe API shapes: legacy tax/payment_intent/charge, and total_taxes/payments).
  v_tax integer := coalesce((p_inv ->> 'tax')::integer,
    (select sum((t ->> 'amount')::integer)::integer from jsonb_array_elements(case when jsonb_typeof(p_inv -> 'total_taxes') = 'array' then p_inv -> 'total_taxes' else '[]'::jsonb end) t),
    (select sum((t ->> 'amount')::integer)::integer from jsonb_array_elements(case when jsonb_typeof(p_inv -> 'total_tax_amounts') = 'array' then p_inv -> 'total_tax_amounts' else '[]'::jsonb end) t));
  v_pi text := nullif(coalesce(p_inv ->> 'payment_intent', p_inv -> 'payment_intent' ->> 'id', p_inv -> 'payments' -> 'data' -> 0 -> 'payment' ->> 'payment_intent'), '');
  v_charge text := nullif(coalesce(p_inv ->> 'charge', p_inv -> 'charge' ->> 'id', p_inv -> 'payments' -> 'data' -> 0 -> 'payment' ->> 'charge'), '');
begin
  if coalesce(p_inv ->> 'id', '') !~ '^in_[A-Za-z0-9_]+$' then raise exception 'invalid_invoice' using errcode = '22023'; end if;
  select workspace_id into v_ws from public.billing_customers where stripe_customer_id = coalesce(p_inv ->> 'customer', p_inv -> 'customer' ->> 'id');
  if v_ws is null then select workspace_id into v_ws from public.workspace_subscriptions where stripe_subscription_id = v_sub; end if;
  if v_ws is null then return jsonb_build_object('recorded', false, 'reason', 'unknown_customer'); end if;
  insert into public.subscription_invoices(stripe_invoice_id, workspace_id, stripe_subscription_id, status, billing_reason, amount_due, amount_paid, currency,
      attempt_count, next_payment_attempt, hosted_invoice_url, period_start, period_end, livemode, last_event_created, tax_minor, total_excluding_tax, stripe_payment_intent, stripe_charge)
    values (p_inv ->> 'id', v_ws, v_sub, coalesce(p_inv ->> 'status', 'open'), p_inv ->> 'billing_reason', coalesce((p_inv ->> 'amount_due')::integer, 0),
      coalesce((p_inv ->> 'amount_paid')::integer, 0), upper(coalesce(p_inv ->> 'currency', 'gbp')), coalesce((p_inv ->> 'attempt_count')::integer, 0),
      to_timestamp(nullif(p_inv ->> 'next_payment_attempt', '')::double precision), p_inv ->> 'hosted_invoice_url',
      to_timestamp(nullif(p_inv ->> 'period_start', '')::double precision), to_timestamp(nullif(p_inv ->> 'period_end', '')::double precision),
      coalesce(p_livemode, false), coalesce(p_event_created, 0), v_tax, (p_inv ->> 'total_excluding_tax')::integer, v_pi, v_charge)
  on conflict (stripe_invoice_id) do update set status = excluded.status, amount_due = excluded.amount_due, amount_paid = excluded.amount_paid,
      attempt_count = excluded.attempt_count, next_payment_attempt = excluded.next_payment_attempt, hosted_invoice_url = excluded.hosted_invoice_url,
      last_event_created = excluded.last_event_created, updated_at = now(),
      tax_minor = coalesce(excluded.tax_minor, public.subscription_invoices.tax_minor), total_excluding_tax = coalesce(excluded.total_excluding_tax, public.subscription_invoices.total_excluding_tax),
      stripe_payment_intent = coalesce(excluded.stripe_payment_intent, public.subscription_invoices.stripe_payment_intent), stripe_charge = coalesce(excluded.stripe_charge, public.subscription_invoices.stripe_charge)
    where public.subscription_invoices.last_event_created <= excluded.last_event_created;
  if p_inv ->> 'status' = 'paid' then
    update public.ai_overage_charges o set status = 'paid', updated_at = now()
     where o.workspace_id = v_ws and o.status = 'invoiced'
       and o.invoice_ref in (select coalesce(l ->> 'invoice_item', l -> 'parent' -> 'invoice_item_details' ->> 'invoice_item', l ->> 'id')
                               from jsonb_array_elements(coalesce(p_inv -> 'lines' -> 'data', '[]'::jsonb)) l);
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('recorded', true, 'workspace', v_ws, 'overage_settled', n);
end $function$

;

CREATE OR REPLACE FUNCTION public.partner_qualify_invoice(p_invoice text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.subscription_invoices; r public.partner_referrals; a public.partner_attributions; p public.partners; rule public.partner_commission_rules;
  eligible numeric; comm numeric; v uuid; months int;
begin
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice;
  if i.stripe_invoice_id is null or i.status <> 'paid' or coalesce(i.amount_paid, 0) <= 0 then return null; end if;
  if exists (select 1 from public.partner_earnings where source_invoice = p_invoice) then return null; end if;
  select x.* into a from public.partner_attributions x join public.partner_referrals rr on rr.id = x.referral_id where rr.workspace_id = i.workspace_id and x.status <> 'rejected' limit 1;
  if a.id is null then return null; end if;
  select * into r from public.partner_referrals where id = a.referral_id;
  select * into p from public.partners where id = a.partner_id;
  if p.status <> 'active' then return null; end if;
  -- Same payment fingerprint as the partner's own billing (when the billing layer has recorded one) → self-referral.
  if a.payment_fingerprint is not null and a.payment_fingerprint = nullif(p.details ->> 'payment_fingerprint', '') then
    update public.partner_attributions set status = 'rejected', rejection_reason = 'same_payment_fingerprint' where id = a.id;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.attribution_rejected', jsonb_build_object('partner_id', p.id, 'reason', 'same_payment_fingerprint'));
    return null;
  end if;
  months := coalesce(nullif(p.details ->> 'commission_months', '')::int, 12);
  if a.created_at < now() - make_interval(months => months) then return null; end if;
  select * into rule from public.partner_commission_rules x where x.partner_id = p.id order by x.version desc limit 1;
  -- Q60: invoice tax is stored now. Base stays VAT-inclusive (current terms) until the owner flips platform setting
  -- commerce.partner_commission_net_of_vat to true; then commission is on the amount paid net of VAT.
  eligible := round((i.amount_paid - case when coalesce(public.commerce_setting('partner_commission_net_of_vat') #>> '{}', 'false') = 'true'
                                          then least(coalesce(i.tax_minor, 0), i.amount_paid) else 0 end) / 100.0, 2);
  if rule.basis = 'fixed_bounty' then
    if exists (select 1 from public.partner_earnings where referral_id = r.id and status <> 'reversed') then return null; end if;
    comm := coalesce(nullif(p.details ->> 'bounty_gbp', '')::numeric, 0);
  else
    comm := round(eligible * rule.commission_bps / 10000.0, 2);
  end if;
  insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps)
    values (p.id, r.id, now(), eligible, comm, 'pending', p_invoice, rule.id, rule.version, rule.commission_bps) returning id into v;
  update public.partner_referrals set status = 'active', activated_at = coalesce(activated_at, now()) where id = r.id and status in ('pending','trial');
  update public.partner_attributions set status = 'qualified', qualified_at = coalesce(qualified_at, now()) where id = a.id;
  update public.partners set referrals = (select count(*) from public.partner_referrals where partner_id = p.id),
    eligible_revenue = eligible_revenue + eligible, earned = earned + comm where id = p.id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_accrued',
    jsonb_build_object('partner_id', p.id, 'earning_id', v, 'invoice', p_invoice, 'rule_version', rule.version, 'commission', comm));
  return v;
end $function$

;

-- 1. Refund / lost chargeback → reverse or claw back ------------------------------------------------------------------------------
create or replace function public.partner_refund_invoice(p_invoice text, p_refunded_minor bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.subscription_invoices; e public.partner_earnings; ratio numeric; target numeric; done numeric; delta numeric; rev numeric; v uuid;
begin
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice for update;
  if i.stripe_invoice_id is null then return jsonb_build_object('invoice', false); end if;
  update public.subscription_invoices set amount_refunded = greatest(amount_refunded, least(coalesce(p_refunded_minor, 0), 2147483647)::integer), updated_at = now()
   where stripe_invoice_id = p_invoice;
  select * into e from public.partner_earnings where source_invoice = p_invoice and clawback_of is null for update;
  if e.id is null or e.status = 'reversed' or coalesce(i.amount_paid, 0) <= 0 or coalesce(p_refunded_minor, 0) <= 0 then
    return jsonb_build_object('invoice', true, 'clawback', 0);
  end if;
  ratio := least(p_refunded_minor::numeric / i.amount_paid, 1);
  -- Not yet paid to the partner, refunded in full, nothing clawed back yet: a plain reversal (it leaves its statement).
  if ratio >= 1 and e.status in ('pending', 'cleared') and not exists (select 1 from public.partner_earnings c where c.clawback_of = e.id and c.status <> 'reversed') then
    perform public.partner_reverse_earning(e.id, left(coalesce(p_reason, 'refund'), 120));
    return jsonb_build_object('invoice', true, 'reversed', e.id);
  end if;
  target := round(e.commission * ratio, 2);
  select coalesce(-sum(c.commission), 0) into done from public.partner_earnings c where c.clawback_of = e.id and c.status <> 'reversed';
  delta := target - done;
  if delta <= 0 then return jsonb_build_object('invoice', true, 'clawback', 0); end if;
  rev := case when e.commission > 0 then round(e.eligible_revenue * delta / e.commission, 2) else 0 end;
  -- A negative earning: it clears like any earning and nets against the partner's next statement.
  insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps, clawback_of)
    values (e.partner_id, e.referral_id, now(), -rev, -delta, 'pending', 'clawback:' || p_invoice || ':' || target, e.commission_rule_id, e.commission_rule_version, e.commission_bps, e.id)
    returning id into v;
  update public.partners set earned = earned - delta, eligible_revenue = eligible_revenue - rev where id = e.partner_id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_clawback',
    jsonb_build_object('earning_id', e.id, 'clawback_id', v, 'partner_id', e.partner_id, 'invoice', p_invoice, 'commission', -delta, 'reason', left(coalesce(p_reason, ''), 120)));
  return jsonb_build_object('invoice', true, 'clawback', delta, 'clawback_id', v);
end $$;

-- 2. Churn → referral status → grade ----------------------------------------------------------------------------------------------
create or replace function public.trg_partner_referral_churn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if new.status in ('canceled', 'unpaid', 'incomplete_expired') then
    for r in update public.partner_referrals set status = 'churned' where workspace_id = new.workspace_id and status = 'active' returning id, partner_id loop
      perform public.partner_apply_grade(r.partner_id);
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', new.workspace_id, 'partner.referral_churned',
        jsonb_build_object('referral_id', r.id, 'partner_id', r.partner_id, 'subscription_status', new.status));
    end loop;
  elsif new.status in ('active', 'trialing') then
    for r in update public.partner_referrals set status = 'active' where workspace_id = new.workspace_id and status = 'churned' returning id, partner_id loop
      perform public.partner_apply_grade(r.partner_id);
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', new.workspace_id, 'partner.referral_reactivated',
        jsonb_build_object('referral_id', r.id, 'partner_id', r.partner_id));
    end loop;
  end if;
  return null;
exception when others then   -- billing must never fail because of affiliate accounting; audited for ops (as trg_partner_invoice)
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', new.workspace_id, 'partner.churn_failed', jsonb_build_object('error', left(sqlerrm, 200)));
  return null;
end $$;
drop trigger if exists gd_partner_referral_churn on public.workspace_subscriptions;
create trigger gd_partner_referral_churn after insert or update of status on public.workspace_subscriptions
  for each row execute function public.trg_partner_referral_churn();

-- 3. Payment fingerprint → self-referral check -----------------------------------------------------------------------------------
create or replace function public.billing_record_payment_fingerprint(p_customer text, p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; a record; n integer := 0;
begin
  if coalesce(p_fingerprint, '') !~ '^[A-Za-z0-9]{8,64}$' then return jsonb_build_object('recorded', false, 'reason', 'invalid'); end if;
  select workspace_id into v_ws from public.billing_customers where stripe_customer_id = p_customer;
  if v_ws is null then return jsonb_build_object('recorded', false, 'reason', 'unknown_customer'); end if;
  -- First card seen for the referred workspace, and for the partner's own workspace (its owner is the partner's user).
  update public.partner_attributions x set payment_fingerprint = p_fingerprint
    from public.partner_referrals r where r.id = x.referral_id and r.workspace_id = v_ws and x.payment_fingerprint is null;
  update public.partners p set details = coalesce(p.details, '{}'::jsonb) || jsonb_build_object('payment_fingerprint', p_fingerprint)
   where coalesce(p.details ->> 'payment_fingerprint', '') = ''
     and p.user_id in (select m.user_id from public.workspace_members m where m.workspace_id = v_ws and m.role = 'owner' and m.status = 'active');
  for a in select x.id, x.partner_id, x.referral_id from public.partner_attributions x join public.partners p on p.id = x.partner_id
            where x.status <> 'rejected' and x.payment_fingerprint is not null and x.payment_fingerprint = nullif(p.details ->> 'payment_fingerprint', '') loop
    update public.partner_attributions set status = 'rejected', rejection_reason = 'same_payment_fingerprint' where id = a.id;
    perform public.partner_reverse_earning(e.id, 'same_payment_fingerprint') from public.partner_earnings e
      where e.referral_id = a.referral_id and e.status in ('pending', 'cleared') and e.clawback_of is null;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.attribution_rejected',
      jsonb_build_object('partner_id', a.partner_id, 'attribution_id', a.id, 'reason', 'same_payment_fingerprint'));
    n := n + 1;
  end loop;
  return jsonb_build_object('recorded', true, 'workspace', v_ws, 'rejected', n);
end $$;

-- Grants (Q01): service-only, like the rest of billing / partner accounting.
revoke all on function public.partner_refund_invoice(text, bigint, text), public.billing_record_payment_fingerprint(text, text), public.trg_partner_referral_churn() from public, anon, authenticated;
grant execute on function public.partner_refund_invoice(text, bigint, text), public.billing_record_payment_fingerprint(text, text) to service_role;
