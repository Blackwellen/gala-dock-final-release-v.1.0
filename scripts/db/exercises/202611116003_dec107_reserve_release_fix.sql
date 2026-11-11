-- Exercise for 202611116003 (rolled back): a reserve part can be paid out and keeps its reserve fields.
do $$
declare rid uuid; r public.payout_releases;
begin
  insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, sale_kind, livemode, charged_at, hold_limit_at, trigger, status, reserve_kind, reserve_bps, reserve_minor, reserve_until, terms_version, due_at)
    values ('checkout_order', 'p1-ex-6003', 'reserve', 'e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'acct_p1ex6003', 'ticket_sale', false, now() - interval '40 days', now() + interval '40 days', 'reserve_end', 'due', 'standard', 1000, 950, now(), 'gd-pt-1.0-2026-11-11', now())
    returning id into rid;
  perform public.dec107_release_paid(jsonb_build_array(jsonb_build_object('id', rid, 'amount_minor', 950)), 'po_p1ex6003', 'g');
  select * into r from public.payout_releases where id = rid;
  if r.status <> 'paid_out' or r.reserve_kind <> 'standard' or r.reserve_minor <> 950 then raise exception 'reserve release %', r; end if;
  raise exception 'EXERCISE_OK reserve part paid out with fields kept';
end $$;
