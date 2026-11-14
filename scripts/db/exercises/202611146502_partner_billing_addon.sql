-- Exercise for 202611146502 (always rolled back): invoice tax stored; commission base switch; refund → reversal / clawback (idempotent);
-- churn and reactivation re-grade; payment fingerprint rejects a self-referral and reverses unpaid earnings; grants service-only.
do $$
declare ws uuid; ws2 uuid; u1 uuid; u2 uuid; pid uuid; rid uuid; aid uuid; e public.partner_earnings; r jsonb; n numeric; st text;
begin
  if has_function_privilege('authenticated', 'public.partner_refund_invoice(text, bigint, text)', 'execute')
     or has_function_privilege('authenticated', 'public.billing_record_payment_fingerprint(text, text)', 'execute') then raise exception 'must be service-only'; end if;
  select id into ws from public.workspaces where kind = 'organizer' and status = 'active' order by created_at limit 1;
  select id into ws2 from public.workspaces where kind = 'organizer' and status = 'active' and id <> ws order by created_at limit 1;
  select id into u1 from auth.users order by created_at limit 1;
  select id into u2 from auth.users where id <> u1 order by created_at limit 1;
  delete from public.partner_attributions where user_id = u2;
  delete from public.partner_referrals where workspace_id = ws;
  delete from public.billing_customers where workspace_id in (ws, ws2);
  delete from public.workspace_subscriptions where workspace_id = ws;
  -- partner (user u1, owner of ws2) referred workspace ws (user u2)
  insert into public.partners(user_id, name, kind, status, commission_bps) values (u1, 'Exercise partner', 'affiliate', 'active', 1000) returning id into pid;
  insert into public.partner_commission_rules(partner_id, version, commission_bps, basis) select pid, coalesce(max(version), 0) + 1, 1000, 'subscription_revenue' from public.partner_commission_rules where partner_id = pid;
  insert into public.partner_referrals(partner_id, workspace_id, name, kind, status) values (pid, ws, 'Ref', 'organiser', 'pending') returning id into rid;
  insert into public.partner_attributions(user_id, partner_id, status, referral_id) values (u2, pid, 'signed_up', rid) returning id into aid;
  insert into public.billing_customers(workspace_id, stripe_customer_id) values (ws, 'cus_q60ex1'), (ws2, 'cus_q60ex2');

  -- 4. tax stored; VAT-inclusive base by default
  r := public.billing_record_invoice(jsonb_build_object('id', 'in_q60ex1', 'customer', 'cus_q60ex1', 'status', 'paid', 'amount_due', 12000, 'amount_paid', 12000, 'currency', 'gbp',
         'total_excluding_tax', 10000, 'total_taxes', jsonb_build_array(jsonb_build_object('amount', 2000)), 'payment_intent', 'pi_q60ex1'), 1, false);
  if (select tax_minor from public.subscription_invoices where stripe_invoice_id = 'in_q60ex1') <> 2000 then raise exception 'tax not stored'; end if;
  if (select stripe_payment_intent from public.subscription_invoices where stripe_invoice_id = 'in_q60ex1') <> 'pi_q60ex1' then raise exception 'pi not stored'; end if;
  select * into e from public.partner_earnings where source_invoice = 'in_q60ex1';
  if e.id is null or e.eligible_revenue <> 120 or e.commission <> round(120 * e.commission_bps / 10000.0, 2) then raise exception 'inclusive base expected 120, got %/%', e.eligible_revenue, e.commission; end if;
  if (select status from public.partner_referrals where id = rid) <> 'active' then raise exception 'referral not active'; end if;

  -- 1. partial refund of an unpaid earning → clawback row; replay no-op; full refund → clawback up to 100%
  r := public.partner_refund_invoice('in_q60ex1', 6000, 'refund');
  if (r ->> 'clawback')::numeric <> round(e.commission * 0.5, 2) then raise exception 'half clawback wrong: %', r; end if;
  r := public.partner_refund_invoice('in_q60ex1', 6000, 'refund');
  if (r ->> 'clawback')::numeric <> 0 then raise exception 'replay must be no-op: %', r; end if;
  r := public.partner_refund_invoice('in_q60ex1', 12000, 'refund');
  select coalesce(sum(commission), 0) into n from public.partner_earnings where partner_id = pid and status <> 'reversed';
  if n <> 0 then raise exception 'full refund must net to 0, got %', n; end if;
  -- full refund of a fresh unpaid earning → plain reversal; paid earning → clawback
  r := public.billing_record_invoice(jsonb_build_object('id', 'in_q60ex2', 'customer', 'cus_q60ex1', 'status', 'paid', 'amount_due', 5000, 'amount_paid', 5000, 'currency', 'gbp'), 2, false);
  r := public.partner_refund_invoice('in_q60ex2', 5000, 'chargeback_lost');
  if (select status from public.partner_earnings where source_invoice = 'in_q60ex2') <> 'reversed' then raise exception 'unpaid full refund must reverse'; end if;
  r := public.billing_record_invoice(jsonb_build_object('id', 'in_q60ex3', 'customer', 'cus_q60ex1', 'status', 'paid', 'amount_due', 5000, 'amount_paid', 5000, 'currency', 'gbp'), 3, false);
  update public.partner_earnings set status = 'paid' where source_invoice = 'in_q60ex3';
  r := public.partner_refund_invoice('in_q60ex3', 5000, 'refund');
  if (select count(*) from public.partner_earnings where clawback_of = (select id from public.partner_earnings where source_invoice = 'in_q60ex3') and commission = -(select commission from public.partner_earnings where source_invoice = 'in_q60ex3') and status = 'pending') <> 1 then raise exception 'paid earning must get a full clawback'; end if;

  -- net-of-VAT switch
  -- (rolled back) flip the switch on the published commerce settings row
  update public.platform_settings set value = value || '{"partner_commission_net_of_vat": true}'::jsonb
   where id = (select id from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1);
  if not found then insert into public.platform_settings(section, status, version, value) values ('commerce', 'published', 999999, '{"partner_commission_net_of_vat": true}'); end if;
  r := public.billing_record_invoice(jsonb_build_object('id', 'in_q60ex4', 'customer', 'cus_q60ex1', 'status', 'paid', 'amount_due', 12000, 'amount_paid', 12000, 'currency', 'gbp', 'tax', 2000), 4, false);
  if (select eligible_revenue from public.partner_earnings where source_invoice = 'in_q60ex4') <> 100 then raise exception 'net-of-VAT base expected 100'; end if;

  -- 2. churn / reactivation
  insert into public.workspace_subscriptions(workspace_id, stripe_subscription_id, kind, plan, billing_interval, status) values (ws, 'sub_q60ex', 'organizer', 'pro', 'month', 'active');
  update public.workspace_subscriptions set status = 'canceled' where workspace_id = ws;
  if (select status from public.partner_referrals where id = rid) <> 'churned' then raise exception 'referral must churn'; end if;
  if not exists (select 1 from public.audit_events where event = 'partner.referral_churned' and metadata ->> 'referral_id' = rid::text) then raise exception 'churn audit missing'; end if;
  update public.workspace_subscriptions set status = 'active' where workspace_id = ws;
  if (select status from public.partner_referrals where id = rid) <> 'active' then raise exception 'referral must reactivate'; end if;

  -- 3. fingerprint: referred workspace pays with card X; partner's own workspace ws2 (u1 owner) pays with X → self-referral
  insert into public.workspace_members(workspace_id, user_id, role, status) values (ws2, u1, 'owner', 'active') on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active';
  update public.partner_earnings set status = 'pending' where partner_id = pid and source_invoice = 'in_q60ex4';
  r := public.billing_record_payment_fingerprint('cus_q60ex1', 'fpQ60exercise1');
  if (select payment_fingerprint from public.partner_attributions where id = aid) <> 'fpQ60exercise1' then raise exception 'fingerprint not written'; end if;
  if (r ->> 'rejected')::int <> 0 then raise exception 'no match yet: %', r; end if;
  r := public.billing_record_payment_fingerprint('cus_q60ex2', 'fpQ60exercise1');
  select status into st from public.partner_attributions where id = aid;
  if st <> 'rejected' then raise exception 'self-referral must be rejected, got % (%)', st, r; end if;
  if (select status from public.partner_earnings where source_invoice = 'in_q60ex4') <> 'reversed' then raise exception 'unpaid earning must be reversed on self-referral'; end if;
  if public.billing_record_payment_fingerprint('cus_unknown', 'fpQ60exercise1') ->> 'reason' <> 'unknown_customer' then raise exception 'unknown customer'; end if;
  raise exception 'EXERCISE_OK partner billing add-on';
end $$;
