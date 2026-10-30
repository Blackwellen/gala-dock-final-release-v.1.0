-- Linked-database checks run inside a transaction and always roll back. No Stripe calls or permanent ledger entries.
begin;
do $$
declare u uuid; ev uuid; tier uuid; tk uuid; job uuid; ref text:='PWA-ROLLBACK-'||gen_random_uuid(); charge text:='ch_pwa_rollback_'||gen_random_uuid(); n bigint; total bigint;
begin
 select id into u from auth.users order by created_at limit 1;
 if u is null then raise exception 'fixture_user_required'; end if;
 insert into public.events(owner_id,name,status,visibility,starts_at,settings) values(u,'Rollback-only resale refund integrity','on_sale','public',now()+interval '30 days','{"resale":true}') returning id into ev;
 insert into public.ticket_tiers(event_id,name,price,quantity,status) values(ev,'Rollback only',20,1,'on_sale') returning id into tier;
 insert into public.checkout_orders(order_ref,event_id,buyer_id,token,amount,fee,status,stripe_session,created_at) values(ref,ev,u,gen_random_uuid()::text,20,5,'issued','cs_test_rollback_'||gen_random_uuid(),'1900-01-01');
 insert into public.tickets(event_id,tier_id,holder_id,code,order_ref,price_paid) values(ev,tier,u,'PWA-ROLLBACK-'||gen_random_uuid(),ref,20) returning id into tk;
 insert into public.resale_holds(ticket_id,token,expires_at) values(tk,gen_random_uuid()::text,now()+interval '10 minutes');
 update public.tickets set status='resold' where id=tk;
 insert into public.resale_payouts(seller_id,ticket_id,order_ref,amount,created_at) values(u,tk,'PWA-RESALE-ROLLBACK',20,'1900-01-01') returning id into job;
 if (select original_order_ref from public.resale_payouts where id=job)<>ref then raise exception 'wrong_original_source'; end if;
 perform public.claim_resale_refunds(1);
 if (select status from public.resale_payouts where id=job)<>'processing' then raise exception 'lease_missing'; end if;
 update public.checkout_orders set refund_status='due' where order_ref=ref;
 perform public.claim_ticket_refunds(100);
 if (select refund_status from public.checkout_orders where order_ref=ref)<>'due' then raise exception 'cancellation_raced_resale'; end if;
 update public.resale_payouts set status='paid',stripe_refund_id='re_rollback_'||gen_random_uuid() where id=job;
 perform public.claim_ticket_refunds(100);
 if (select refund_status from public.checkout_orders where order_ref=ref)<>'processing' then raise exception 'cancellation_not_released'; end if;
 if has_function_privilege('authenticated','public.claim_resale_refunds(integer)','EXECUTE') or has_function_privilege('anon','public.post_stripe_refund_delta(text,bigint,text,text)','EXECUTE') then raise exception 'worker_privilege_leak'; end if;
 n:=public.post_stripe_refund_delta(charge,2000,'GBP'); if n<>2000 then raise exception 'first_delta'; end if;
 n:=public.post_stripe_refund_delta(charge,4000,'GBP'); if n<>2000 then raise exception 'partial_delta'; end if;
 n:=public.post_stripe_refund_delta(charge,2000,'GBP'); if n<>0 then raise exception 'out_of_order_duplicate'; end if;
 n:=public.post_stripe_refund_delta(charge,4000,'GBP'); if n<>0 then raise exception 'replay_duplicate'; end if;
 select -sum(e.amount_minor) into total from public.ledger_transactions t join public.ledger_entries e on e.transaction_id=t.id where t.stripe_ref=charge and e.account='cash_stripe';
 if total<>4000 then raise exception 'cumulative_overstatement'; end if;
 charge:='ch_pwa_legacy_'||gen_random_uuid();
 perform public.post_ledger_transaction('stripe:refund:'||charge||':1000','refund','GBP','[{"account":"refunds","amount_minor":1000,"party_type":"platform"},{"account":"cash_stripe","amount_minor":-1000,"party_type":"platform"}]',null,null,'charge',charge,'Rollback legacy fixture',charge,'system');
 perform public.post_ledger_transaction('stripe:refund:'||charge||':2000','refund','GBP','[{"account":"refunds","amount_minor":2000,"party_type":"platform"},{"account":"cash_stripe","amount_minor":-2000,"party_type":"platform"}]',null,null,'charge',charge,'Rollback legacy fixture',charge,'system');
 n:=public.post_stripe_refund_delta(charge,2500,'GBP');if n<>500 then raise exception 'legacy_delta'; end if;
 select -sum(e.amount_minor) into total from public.ledger_transactions t join public.ledger_entries e on e.transaction_id=t.id where t.stripe_ref=charge and e.account='cash_stripe';
 if total<>2500 then raise exception 'legacy_reversal_missing'; end if;
 insert into public.event_cancellations(event_id,reason,cancelled_by) values(ev,'Rollback-only cancellation integrity test',u);
 update public.events set status='cancelled' where id=ev;
 begin
  insert into public.tickets(event_id,tier_id,holder_id,code,order_ref,price_paid) values(ev,tier,u,'PWA-LATE-'||gen_random_uuid(),ref,20);
  raise exception 'cancelled_event_issued_ticket';
 exception when exclusion_violation then null;
 end;
 raise notice 'PASS: original source, worker privilege, resale/cancellation serialization, partial refund deltas, replay and out-of-order delivery';
end $$;
rollback;
select 'PASS: original payer, service-only claims, resale/cancellation lease, refund deltas, replay/out-of-order, legacy reversal, cancelled-event issuance; all fixtures rolled back' as result;
