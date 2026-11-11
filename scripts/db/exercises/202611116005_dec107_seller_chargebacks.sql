-- Exercise for 202611116005 (rolled back): the seller's owner sees its account's dispute; an outsider does not.
do $$
declare n integer; owner uuid; outsider uuid := 'd1a9e705-c6b9-4735-9451-b3f8c04b2dc7';
begin
  select owner_id into owner from public.workspaces where id = 'e2722ab1-045d-408e-93d6-a24cf7c54ce6';
  insert into public.connect_accounts(workspace_id, stripe_account_id, livemode, verification_state) values ('e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'acct_p1ex6005', false, 'verified')
    on conflict (workspace_id) do update set stripe_account_id = 'acct_p1ex6005';
  insert into public.stripe_disputes(stripe_dispute_id, charge_id, amount_minor, currency, status, livemode, stripe_account_id) values ('du_p1ex6005', 'ch_p1ex6005', 500, 'GBP', 'needs_response', false, 'acct_p1ex6005');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  select count(*) into n from public.stripe_disputes where stripe_dispute_id = 'du_p1ex6005';
  if n <> 1 then raise exception 'owner cannot see the dispute'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  select count(*) into n from public.stripe_disputes where stripe_dispute_id = 'du_p1ex6005';
  if n <> 0 then raise exception 'outsider sees the dispute'; end if;
  raise exception 'EXERCISE_OK seller chargeback read';
end $$;
