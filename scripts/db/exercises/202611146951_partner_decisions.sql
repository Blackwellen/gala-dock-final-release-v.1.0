-- Exercise for 202611146951 (always rolled back): settings (net of VAT, 60-day hold, fee-driven £50 minimum); credit pack accrual net
-- of VAT + refund reversal; below-minimum rollover and negative carry-forward; reversal on a rolled-over statement → clawback;
-- Stripe settlement prepare/transferred (VAT on top for UK VAT-registered, idempotent key, chain paid), manual Mark paid refused,
-- transfer-reversal recovery of a negative statement; partner money requests retired; anonymised portal referrals;
-- self-serve application + admin approval; partner login invite (preview, mismatch, accept); grants.
do $$
declare adm uuid; sid text; c2 text; ws uuid; u1 uuid; u2 uuid; u3 uuid; u4 uuid; pid uuid; pid2 uuid; rid uuid; aid uuid; k public.credit_packs;
  m date := date_trunc('month', now())::date; st_a uuid; st_b uuid; st_c uuid; st_cur uuid; st_low uuid; e1 uuid; j jsonb; r jsonb; n numeric; v uuid; app uuid; em text; inv uuid;
  tok text := encode(sha256('q68-exercise-token'::bytea), 'hex');
begin
  -- 0. settings + grants
  if public.partner_minimum_payout() <> 50 then raise exception 'minimum must be 50 (fees floor), got %', public.partner_minimum_payout(); end if;
  if public.partner_earning_hold_days() <> 60 then raise exception 'hold must be 60'; end if;
  if coalesce(public.commerce_setting('partner_commission_net_of_vat') #>> '{}', '') <> 'true' then raise exception 'net of VAT must be on'; end if;
  if has_function_privilege('authenticated', 'public.partner_accrue_revenue(uuid, text, bigint, bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.partner_refund_source(text, bigint, bigint, text)', 'execute')
     or has_function_privilege('authenticated', 'public.partner_roll_forward_statements()', 'execute')
     or has_function_privilege('authenticated', 'public.partner_payout_account_sync(uuid, boolean, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_create_partner(text, text, text, integer, text, text)', 'execute')
     or has_function_privilege('anon', 'public.portal_invite_accept(text)', 'execute') then raise exception 'grants wrong'; end if;
  if not has_function_privilege('anon', 'public.portal_invite_preview(text)', 'execute') or not has_function_privilege('authenticated', 'public.partner_portal_referrals()', 'execute') then raise exception 'grants missing'; end if;

  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where u.email = 'admin.demo@example.com';
  if adm is null then raise exception 'exercise: demo admin missing'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (gen_random_uuid(), adm, now(), now()) returning id::text into sid;   -- rolled back
  c2 := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text;

  select id into ws from public.workspaces where kind = 'organizer' and status = 'active' order by created_at limit 1;
  select id into u1 from auth.users where id not in (select user_id from public.partners where user_id is not null) and id not in (select user_id from public.platform_admins) order by created_at limit 1;
  select id into u2 from auth.users where email_confirmed_at is not null and id <> u1 and id not in (select user_id from public.partners where user_id is not null) and id not in (select user_id from public.platform_admins) order by created_at limit 1;
  select id into u3 from auth.users where email_confirmed_at is not null and id not in (u1, u2) and id not in (select user_id from public.partners where user_id is not null) and id not in (select user_id from public.platform_admins) order by created_at limit 1;
  select id into u4 from auth.users where id not in (u1, u2, u3) order by created_at limit 1;
  delete from public.partner_attributions where referral_id in (select id from public.partner_referrals where workspace_id = ws);
  delete from public.partner_referrals where workspace_id = ws;

  insert into public.partners(user_id, name, kind, status, commission_bps, commission_basis) values (u1, 'Q68 exercise partner', 'affiliate', 'active', 1000, 'subscription_revenue') returning id into pid;
  insert into public.partner_referrals(partner_id, workspace_id, name, kind, status) values (pid, ws, 'Secret Workspace Ltd', 'organiser', 'pending') returning id into rid;
  insert into public.partner_attributions(user_id, partner_id, status, referral_id) values (u4, pid, 'signed_up', rid) returning id into aid;

  -- 1. credit pack: commission on the amount paid net of VAT; full refund reverses the unpaid earning
  select * into k from public.credit_packs where 'organizer' = any(workspace_kinds) order by price_minor limit 1;
  r := public.billing_credit_pack_paid(jsonb_build_object('id', 'cs_q68ex1', 'payment_status', 'paid', 'currency', lower(k.currency), 'payment_intent', 'pi_q68ex1',
         'amount_subtotal', k.price_minor, 'amount_total', round(k.price_minor * 1.2), 'total_details', jsonb_build_object('amount_tax', round(k.price_minor * 0.2)),
         'metadata', jsonb_build_object('purpose', 'ai_credits', 'workspace_id', ws, 'pack_id', k.id)), false);
  select id, eligible_revenue into e1, n from public.partner_earnings where source_invoice = 'pack:cs_q68ex1';
  if e1 is null or n <> round(k.price_minor / 100.0, 2) then raise exception 'pack earning net of VAT expected %, got % (%)', round(k.price_minor / 100.0, 2), n, r; end if;
  r := public.billing_credit_pack_refunded(jsonb_build_object('id', 'ch_q68ex1', 'payment_intent', 'pi_q68ex1', 'amount', round(k.price_minor * 1.2), 'amount_refunded', round(k.price_minor * 1.2)), false);
  if (select status from public.partner_earnings where id = e1) <> 'reversed' then raise exception 'pack refund must reverse the earning'; end if;

  -- 2. anonymised portal referrals (as the partner); partners can no longer read referral rows
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true); perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if (select count(*) from public.partner_referrals where partner_id = pid) <> 0 then raise exception 'partner must not read referral rows'; end if;
  if (select count(*) from public.partner_portal_referrals() where ref_no = 1 and status = 'active') <> 1 then raise exception 'anonymised referral missing'; end if;
  reset role;

  -- 3. rollover: Mar 30 → Apr (-50) → -20 carried into the current month
  insert into public.partner_statements(partner_id, period_start, status) values (pid, (m - interval '3 months')::date, 'open') returning id into st_a;
  insert into public.partner_statements(partner_id, period_start, status) values (pid, (m - interval '2 months')::date, 'open') returning id into st_b;
  insert into public.partner_earnings(partner_id, referral_id, statement_id, occurred_at, eligible_revenue, commission, status, source_invoice) values
    (pid, rid, st_a, now() - interval '100 days', 300, 30, 'cleared', 'q68ex:a'), (pid, rid, st_b, now() - interval '70 days', -500, -50, 'cleared', 'q68ex:b');
  perform public.partner_roll_forward_statements();
  if (select status from public.partner_statements where id = st_a) <> 'rolled_over' or (select opening_balance from public.partner_statements where id = st_b) <> 30 then raise exception 'below-minimum rollover failed'; end if;
  if (select status from public.partner_statements where id = st_b) <> 'rolled_over' then raise exception 'negative statement must carry forward'; end if;
  select id into st_cur from public.partner_statements where partner_id = pid and period_start = m;
  if st_cur is null or (select opening_balance from public.partner_statements where id = st_cur) <> -20 then raise exception 'current month opening must be -20'; end if;
  -- an earning on a rolled-over statement that is reversed becomes a clawback (the carried balance stays right)
  perform public.partner_reverse_earning((select id from public.partner_earnings where source_invoice = 'q68ex:a'), 'exercise');
  if (select status from public.partner_earnings where source_invoice = 'q68ex:a') <> 'cleared'
     or (select commission from public.partner_earnings where source_invoice = 'clawback:reversal:' || (select id from public.partner_earnings where source_invoice = 'q68ex:a')) <> -30 then raise exception 'rolled-over reversal must claw back'; end if;
  delete from public.partner_earnings where source_invoice like 'clawback:reversal:%' and partner_id = pid;

  -- 4. settlement (admin, aal2)
  insert into public.partner_statements(partner_id, period_start, status) values (pid, (m - interval '1 month')::date, 'open') returning id into st_c;
  insert into public.partner_earnings(partner_id, referral_id, statement_id, occurred_at, eligible_revenue, commission, status, source_invoice) values (pid, rid, st_c, now() - interval '40 days', 1000, 100, 'cleared', 'q68ex:c');
  insert into public.partner_statements(partner_id, period_start, status) values (pid, (m - interval '5 months')::date, 'open') returning id into st_low;
  insert into public.partner_earnings(partner_id, referral_id, statement_id, occurred_at, eligible_revenue, commission, status, source_invoice) values (pid, rid, st_low, now() - interval '160 days', 100, 10, 'cleared', 'q68ex:low');
  perform set_config('request.jwt.claims', c2, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.admin_partner_statement_prepare(st_low, false, 'exercise settle'); raise exception 'X_BELOW_MIN'; exception when others then if sqlerrm <> 'below_minimum' then raise; end if; end;
  begin perform public.admin_partner_statement_prepare(st_c, false, 'exercise settle'); raise exception 'X_NO_ACCOUNT'; exception when others then if sqlerrm <> 'payouts_not_set_up' then raise; end if; end;
  begin perform public.admin_partner_statement_prepare(st_cur, false, 'exercise settle'); raise exception 'X_OPEN'; exception when others then if sqlerrm <> 'period_open' then raise; end if; end;
  begin perform public.admin_partner_statement_paid(st_c, 'BACS-123', 'exercise settle'); raise exception 'X_MANUAL'; exception when others then if sqlerrm <> 'stripe_transfer_required' then raise; end if; end;
  begin perform public.admin_request_money('partner_payout', null, pid, null, 10, 'exercise settle'); raise exception 'X_RETIRED'; exception when others then if sqlerrm <> 'partner_payout_retired' then raise; end if; end;
  reset role;
  perform public.partner_payout_account_sync(pid, false, 'acct_q68exercise', 'active', 'GB');
  update public.partners set vat_registered = true, vat_number = 'GB123456789' where id = pid;
  set local role authenticated;
  j := public.admin_partner_statement_prepare(st_c, false, 'exercise settle');
  if (j ->> 'amount_minor')::bigint <> 12000 or (j ->> 'vat_minor')::bigint <> 2000 or j ->> 'account' <> 'acct_q68exercise' then raise exception 'prepare amounts wrong: %', j; end if;
  r := public.admin_partner_statement_prepare(st_c, false, 'exercise settle');
  if r ->> 'idempotency_key' <> j ->> 'idempotency_key' then raise exception 'prepare must be idempotent'; end if;
  perform public.admin_partner_statement_transferred(st_c, 'tr_q68exercise', 'exercise settle');
  perform public.admin_partner_statement_transferred(st_c, 'tr_q68exercise', 'exercise settle');   -- replay no-op
  if (select status from public.partner_statements where id = st_c) <> 'paid' or (select status from public.partner_earnings where source_invoice = 'q68ex:c') <> 'paid' then raise exception 'transfer must settle'; end if;
  if (select paid from public.partners where id = pid) <> 100 then raise exception 'partner paid must be commission excl. VAT'; end if;
  perform public.admin_partner_statement_payout(st_c, 'po_q68exercise', 'pending', 'exercise settle');
  -- recovery of the -20 current statement by reversing the last transfer
  j := public.admin_partner_statement_recovery_prepare(st_cur, 'exercise settle');
  if (j ->> 'amount_minor')::bigint <> 2000 or j ->> 'transfer_id' <> 'tr_q68exercise' then raise exception 'recovery prepare wrong: %', j; end if;
  perform public.admin_partner_statement_recovered(st_cur, st_c, 'trr_q68exercise', 2000, 'exercise settle');
  perform public.admin_partner_statement_recovered(st_cur, st_c, 'trr_q68exercise', 2000, 'exercise settle');   -- replay no-op
  if (select opening_balance from public.partner_statements where id = st_cur) <> 0 or (select reversed_amount from public.partner_statements where id = st_c) <> 20 then raise exception 'recovery not recorded'; end if;
  reset role;

  -- 5. application → approval (u2 applies; admin approves; partner linked to u2)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true); perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin perform public.partner_apply('Ex Applicant', 'Ex Partners Ltd', 'company', 'GB', 'https://example.org', 'Venues in London', false, null, 'wrong', true); raise exception 'X_TERMS';
  exception when others then if sqlerrm <> 'terms_changed' then raise; end if; end;
  app := public.partner_apply('Ex Applicant', 'Ex Partners Ltd', 'company', 'GB', 'https://example.org', 'Venues in London', false, null, public.partner_terms_version(), true);
  begin perform public.partner_apply('Ex Applicant', 'Ex Partners Ltd', 'company', 'GB', null, '', false, null, public.partner_terms_version(), true); raise exception 'X_DUP';
  exception when others then if sqlerrm <> 'already_applied' then raise; end if; end;
  reset role;
  if (select count(*) from public.consent_records where user_id = u2 and purpose in ('partner_terms', 'partner_self_billing') and context ->> 'application_id' = app::text) <> 2 then raise exception 'consents missing'; end if;
  perform set_config('request.jwt.claims', c2, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  pid2 := public.admin_partner_application_decide(app, true, 'affiliate', null, 'exercise approve');
  reset role;
  if (select user_id from public.partners where id = pid2) <> u2 or (select status from public.partner_applications where id = app) <> 'approved' then raise exception 'approval must create linked partner'; end if;

  -- 6. admin Create partner + Invite login → u3 accepts (wrong user refused)
  select lower(email) into em from auth.users where id = u3;
  set local role authenticated;
  v := public.admin_create_partner('Ex Created Partner', 'q68-unused@example.org', 'strategic', 1200, 'GB', 'exercise create');
  inv := public.admin_partner_invite(v, em, tok, 'exercise invite');
  reset role;
  if (select rate_locked from public.partners where id = v) is not true then raise exception 'custom rate must lock'; end if;
  if (select state from public.portal_invite_preview(tok)) <> 'valid' then raise exception 'preview must be valid'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true); perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if (public.portal_invite_accept(tok) ->> 'result') <> 'mismatch' then raise exception 'other user must get mismatch'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true); perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if (public.portal_invite_accept(tok) ->> 'result') <> 'accepted' then raise exception 'invitee must accept'; end if;
  if (public.portal_invite_accept(tok) ->> 'result') <> 'used' then raise exception 'token is single-use'; end if;
  reset role;
  if (select user_id from public.partners where id = v) <> u3 then raise exception 'invite must link user'; end if;

  raise exception 'EXERCISE_OK q68 partner decisions: settings, credit packs, rollover/carry-forward, Stripe settlement + recovery, retire, anonymised portal, applications, invites';
end $$;
