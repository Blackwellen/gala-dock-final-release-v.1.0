-- Exercise for 202610295001 (always rolled back: ends by raising EXERCISE_OK).
do $$
declare ws uuid; ev uuid; acct text; before_status text; r jsonb; s text; blocked boolean := false; live_rows bigint;
begin
  if public.stripe_livemode() then raise exception 'default mode must be test'; end if;
  select ca.workspace_id, ca.stripe_account_id into ws, acct from public.connect_accounts ca
    where ca.charges_enabled and ca.card_payments_capability = 'active' and ca.disabled_reason is null and coalesce(array_length(ca.requirements_past_due, 1), 0) = 0 limit 1;
  if ws is null then raise exception 'no ready test seller to exercise'; end if;
  select e.id into ev from public.events e where e.workspace_id = ws limit 1;
  select payout_status into before_status from public.workspaces where id = ws;

  -- test mode: the test account is used
  if public.seller_payment_account(ws) ->> 'stripe_account_id' is distinct from acct then raise exception 'test mode should expose the test account'; end if;
  if ev is not null and public.event_payment_readiness(ev) <> 'ready' then raise exception 'test readiness should be ready'; end if;

  -- service_role request declaring live: test account invisible → not ready (not an error)
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', '{"x-gala-stripe-mode":"live"}', true);
  if not public.stripe_livemode() then raise exception 'service_role live header must give live'; end if;
  if public.seller_payment_account(ws) ->> 'stripe_account_id' is not null then raise exception 'live mode must not expose a test account'; end if;
  if ev is not null and public.event_payment_readiness(ev) <> 'seller_not_ready' then raise exception 'live readiness must be seller_not_ready'; end if;
  if public.payout_eligible(ws) then raise exception 'live payout_eligible must be false'; end if;
  begin
    perform public.checkout_order_direct_prepare('GD-NONEXISTENT', ws, acct, 0, '{}'::jsonb, '{}'::jsonb);
  exception when others then s := sqlerrm; end;
  -- a header from a non-service caller is ignored
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  if public.stripe_livemode() then raise exception 'authenticated header must be ignored'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);

  -- platform flip: payout_status follows the live shadow (none → not_connected), and back on rollback
  r := public.stripe_set_platform_mode(true, 'exercise');
  if not (r ->> 'changed')::boolean then raise exception 'flip to live not applied'; end if;
  if not public.stripe_livemode() then raise exception 'platform record live not read'; end if;
  if (select payout_status from public.workspaces where id = ws) <> 'not_connected' then raise exception 'live payout_status must be not_connected'; end if;
  -- live onboarding sync updates the live shadow + mirror; a later test sync touches only the test shadow
  perform public.stripe_workspace_payout_sync(ws, true, 'pending', 'acct_1ExerciseLive0001');
  perform public.stripe_workspace_payout_sync(ws, false, 'active', null);
  if (select payout_status from public.workspaces where id = ws) <> 'pending' then raise exception 'test sync must not change the live mirror'; end if;
  r := public.stripe_set_platform_mode(false, 'exercise');
  if (select payout_status from public.workspaces where id = ws) <> 'active' then raise exception 'rollback must restore test payout_status'; end if;

  -- a live snapshot can never be replaced by a test one
  update public.connect_accounts set livemode = true where workspace_id = ws;
  begin
    update public.connect_accounts set livemode = false where workspace_id = ws;
  exception when others then blocked := sqlerrm = 'connect_live_row_protected'; end;
  if not blocked then raise exception 'live row guard missing'; end if;

  select (select count(*) from public.transactions where livemode) + (select count(*) from public.ledger_transactions where livemode)
       + (select count(*) from public.checkout_orders where livemode) + (select count(*) from public.payment_orders where livemode is not false)
    into live_rows;
  if live_rows <> 0 then raise exception 'historic rows must all be test, got %', live_rows; end if;

  raise exception 'EXERCISE_OK test/live separation: ws=% ev=% before=% prepare_in_live=% live_rows=%', ws, ev is not null, before_status, coalesce(s, 'none'), live_rows;
end $$;
