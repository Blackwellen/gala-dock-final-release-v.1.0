-- Exercise for 202611116001 (always rolled back). Ends with EXERCISE_OK.
do $$
declare r record; n integer; ok boolean; inv integer; lead integer; rel public.payout_releases;
begin
  lead := public.dec107_funding_lead_days();
  if lead <> 58 then raise exception 'lead %', lead; end if;

  -- a DEC-107 (manual payout) account on a QA fixture organiser
  insert into public.connect_accounts(workspace_id, stripe_account_id, livemode, charges_enabled, payouts_enabled, card_payments_capability, transfers_capability, details_submitted, payout_interval, verification_state)
    values ('e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'acct_p1dec107manual', false, true, true, 'active', 'active', true, 'manual', 'verified')
    on conflict (workspace_id) do update set stripe_account_id = excluded.stripe_account_id, payout_interval = 'manual', livemode = false;

  -- binding a ticket order to it freezes release_model = manual_release; reaching 'issued' stamps charged_at
  update public.checkout_orders set strategy = 'direct', seller_workspace_id = 'e2722ab1-045d-408e-93d6-a24cf7c54ce6', connected_account_id = 'acct_p1dec107manual',
    application_fee_minor = 1500, livemode = false where order_ref = 'GD-422B014BBF';
  select release_model into r from public.checkout_orders where order_ref = 'GD-422B014BBF';
  if r.release_model is distinct from 'manual_release' then raise exception 'release_model %', r.release_model; end if;
  update public.checkout_orders set status = 'issued', stripe_payment_intent = 'pi_p1dec107' where order_ref = 'GD-422B014BBF';
  if (select charged_at from public.checkout_orders where order_ref = 'GD-422B014BBF') is null then raise exception 'charged_at not stamped'; end if;

  -- a non-exempt seller on a non-manual account is refused (COM_SELLER_NOT_READY backstop)
  insert into public.connect_accounts(workspace_id, stripe_account_id, livemode, charges_enabled, payouts_enabled, card_payments_capability, transfers_capability, details_submitted, payout_interval, verification_state)
    values ('679ce2c4-b9c3-47be-b481-52d96cdacdb9', 'acct_p1dec107auto', false, true, true, 'active', 'active', true, 'daily', 'verified')
    on conflict (workspace_id) do update set stripe_account_id = excluded.stripe_account_id, payout_interval = 'daily';
  ok := false;
  begin
    update public.checkout_orders set strategy = 'direct', seller_workspace_id = '679ce2c4-b9c3-47be-b481-52d96cdacdb9', connected_account_id = 'acct_p1dec107auto',
      application_fee_minor = 100, livemode = false where order_ref = 'GD-275067D6BF';
  exception when others then ok := sqlerrm = 'seller_not_ready';
  end;
  if not ok then raise exception 'non-manual account was not refused'; end if;

  -- sweep creates the release grouped under the event; move the event into the past → due after the review window
  perform public.dec107_release_sweep();
  select * into rel from public.payout_releases where source_type = 'checkout_order' and source_ref = 'GD-422B014BBF' and part = 'main';
  if rel.id is null or rel.event_id is distinct from 'b52e0eae-5de4-46f7-8ba2-2e8861aa8555' or rel.sale_kind <> 'ticket_sale' then raise exception 'release not created %', rel; end if;
  update public.payout_releases set trigger_at = now() - interval '1 hour' where id = rel.id;
  update public.events set starts_at = now() - interval '3 days', ends_at = now() - interval '2 days' where id = 'b52e0eae-5de4-46f7-8ba2-2e8861aa8555';
  perform public.dec107_release_sweep();
  select * into rel from public.payout_releases where id = rel.id;
  if rel.status <> 'due' or rel.trigger <> 'event_completed_review' then raise exception 'not due: % %', rel.status, rel.trigger; end if;
  select count(*) into n from public.dec107_releases_due(false, 50) d where d.id = rel.id;
  if n <> 1 then raise exception 'not offered to the worker'; end if;

  -- reserve rule for a new seller = standard 10 % / 30 days
  select * into r from public.dec107_reserve_for('e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'acct_p1dec107manual', false);
  if r.kind is distinct from 'standard' or r.bps <> 1000 then raise exception 'reserve %', r; end if;

  -- paying it out with a reserve creates the reserve part within the hold limit
  perform public.dec107_release_paid(jsonb_build_array(jsonb_build_object('id', rel.id, 'amount_minor', 9000, 'reserve_kind', 'standard', 'reserve_bps', 1000, 'reserve_minor', 1000, 'reserve_days', 30)), 'po_p1dec107', 'grp');
  select count(*) into n from public.payout_releases where source_ref = 'GD-422B014BBF' and part = 'reserve' and status = 'held' and reserve_until <= hold_limit_at;
  if n <> 1 then raise exception 'reserve part missing'; end if;

  -- a discretionary reserve kind is impossible
  ok := false;
  begin update public.payout_releases set reserve_kind = 'fraud' where id = rel.id; exception when check_violation then ok := true; end;
  if not ok then raise exception 'fraud reserve accepted'; end if;

  -- payout pause needs staff with a second factor
  ok := false;
  begin perform public.adm_payout_pause('e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'court_order', 'REF-1', null); exception when others then ok := true; end;
  if not ok then raise exception 'pause without admin accepted'; end if;
  -- a paused workspace is never offered to the worker (pause row inserted as the system for the test)
  insert into public.payout_pauses(workspace_id, basis, reference, created_by) values ('e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'court_order', 'TEST-REF', '00000000-0000-0000-0000-000000000000');
  update public.payout_releases set status = 'due', reserve_until = now() where source_ref = 'GD-422B014BBF' and part = 'reserve';
  select count(*) into n from public.dec107_releases_due(false, 50) d where d.source_ref = 'GD-422B014BBF';
  if n <> 0 then raise exception 'paused workspace offered'; end if;
  ok := false;
  begin perform public.dec107_release_paid(jsonb_build_array(jsonb_build_object('id', (select id from public.payout_releases where source_ref = 'GD-422B014BBF' and part = 'reserve'), 'amount_minor', 1000)), 'po_p1x', 'g2');
  exception when others then ok := sqlerrm = 'payouts_paused'; end;
  if not ok then raise exception 'paid while paused'; end if;

  -- invariants run (rows for the synthetic po_ above are allowed only from this test's own data)
  select count(*) into inv from public.dec107_invariants() i where i.ref not in ('GD-422B014BBF', rel.id::text);
  perform public.dec107_public_rules();
  raise exception 'EXERCISE_OK dec107 lead=% invariants_other=%', lead, inv;
end $$;
