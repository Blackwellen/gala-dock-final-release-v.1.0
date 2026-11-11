-- Exercise for 202611116004 (always rolled back). Ends with EXERCISE_OK.
do $$
declare rid uuid; r public.payout_releases; j jsonb; n integer;
begin
  -- 1. a failed payout re-opens its release; the retry function makes it due again after the seller's account changes
  insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, sale_kind, livemode, charged_at, hold_limit_at, trigger, status, stripe_payout_id, released_at, amount_minor)
    values ('checkout_order', 'p1-ex-6004', 'main', 'e2722ab1-045d-408e-93d6-a24cf7c54ce6', 'acct_p1ex6004', 'ticket_sale', false, now() - interval '3 days', now() + interval '80 days', 'event_completed_review', 'paid_out', 'po_p1ex6004', now(), 900)
    returning id into rid;
  insert into public.connected_payouts(stripe_payout_id, stripe_account_id, workspace_id, amount_minor, currency, status, livemode, last_event_created)
    values ('po_p1ex6004', 'acct_p1ex6004', 'e2722ab1-045d-408e-93d6-a24cf7c54ce6', 900, 'GBP', 'pending', false, 1);
  update public.connected_payouts set status = 'failed', failure_code = 'account_closed' where stripe_payout_id = 'po_p1ex6004';
  select * into r from public.payout_releases where id = rid;
  if r.status <> 'blocked' or r.blocked_reason <> 'payout_failed' or r.stripe_payout_id is not null then raise exception 'not reopened %', r; end if;
  if not exists (select 1 from public.notifications where kind = 'payout_failed' and created_at > now() - interval '1 minute') then raise exception 'seller not notified'; end if;
  update public.payout_releases set updated_at = now() - interval '25 hours' where id = rid;
  n := public.dec107_retry_failed_payouts();
  if (select status from public.payout_releases where id = rid) <> 'due' then raise exception 'not retried'; end if;

  -- 2. customer terms: required for a real user, not for a demo/QA user, and gone once accepted
  perform set_config('request.jwt.claims', json_build_object('sub', 'd1a9e705-c6b9-4735-9451-b3f8c04b2dc7', 'role', 'authenticated')::text, true);
  j := public.payment_terms_customer_required();
  if not (j->>'required')::boolean then raise exception 'terms not required for a real user %', j; end if;
  perform public.accept_payment_terms('customer', j->>'version', 'checkout');
  if (public.payment_terms_customer_required()->>'required')::boolean then raise exception 'still required after acceptance'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', 'fd06d06a-a1f6-4403-b952-70a8b68e42ac', 'role', 'authenticated')::text, true);
  if (public.payment_terms_customer_required()->>'required')::boolean then raise exception 'demo user not exempt'; end if;
  perform set_config('request.jwt.claims', '', true);

  -- 3. nudge once per workspace on a request notification
  insert into public.notifications(user_id, kind, title) values ('baed04e5-80b7-4084-b1f2-d23888cdacd1', 'request_received', 'p1- request');
  insert into public.notifications(user_id, kind, title) values ('baed04e5-80b7-4084-b1f2-d23888cdacd1', 'request_received', 'p1- request 2');
  select count(*) into n from public.notifications where user_id = 'baed04e5-80b7-4084-b1f2-d23888cdacd1' and kind = 'payout_setup_nudge' and dedupe_key like 'dec107-nudge:%';
  if n <> 1 then raise exception 'nudge count %', n; end if;
  raise exception 'EXERCISE_OK failed-payout reopen + customer terms + nudge';
end $$;
