-- Exercise for 202610295003 (rolled back).
do $$
declare ws uuid; c text; m boolean;
begin
  select id into ws from public.workspaces where is_test_fixture limit 1;
  delete from public.billing_customers where workspace_id = ws;
  perform public.billing_link_customer(ws, 'cus_ExTest0001', false);
  perform public.billing_link_customer(ws, 'cus_ExTest0002', false);           -- test never replaces test (first wins, as before)
  select stripe_customer_id, livemode into c, m from public.billing_customers where workspace_id = ws;
  if c <> 'cus_ExTest0001' or m then raise exception 'test link wrong: % %', c, m; end if;
  perform public.billing_link_customer(ws, 'cus_ExLive0001', true);            -- live replaces test
  select stripe_customer_id, livemode into c, m from public.billing_customers where workspace_id = ws;
  if c <> 'cus_ExLive0001' or not m then raise exception 'live did not replace test: % %', c, m; end if;
  perform public.billing_link_customer(ws, 'cus_ExTest0003', false);           -- test never replaces live
  select stripe_customer_id into c from public.billing_customers where workspace_id = ws;
  if c <> 'cus_ExLive0001' then raise exception 'test replaced live'; end if;
  perform * from public.billing_overage_due(null);
  raise exception 'EXERCISE_OK billing customer per mode: final=%', c;
end $$;
