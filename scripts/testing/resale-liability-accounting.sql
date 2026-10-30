begin;
do $$
declare seller uuid; buyer uuid; ws uuid; ev uuid; tier uuid; ticket uuid; job uuid;
 orig text:='PWA-ORIGIN-'||gen_random_uuid(); resale text:='PWA-RESALE-'||gen_random_uuid(); token text:=gen_random_uuid()::text;
 pi text:='pi_rollback_'||gen_random_uuid(); refund text:='re_rollback_'||gen_random_uuid(); charge text:='ch_rollback_'||gen_random_uuid(); amount bigint; repaired integer;
begin
 select id into seller from auth.users order by created_at limit 1;select id into buyer from auth.users where id<>seller order by created_at limit 1;
 if buyer is null then raise exception 'fixture_users_required'; end if;
 insert into public.workspaces(owner_id,kind,name) values(seller,'organizer','Rollback-only resale accounting') returning id into ws;
 insert into public.events(owner_id,workspace_id,name,status,visibility,starts_at,settings) values(seller,ws,'Rollback-only resale','on_sale','public',now()+interval '30 days','{"resale":true}') returning id into ev;
 insert into public.ticket_tiers(event_id,name,price,quantity,status) values(ev,'Rollback ticket',20,1,'on_sale') returning id into tier;
 insert into public.checkout_orders(order_ref,event_id,buyer_id,token,amount,fee,status,stripe_session) values(orig,ev,seller,gen_random_uuid()::text,20,5,'issued','cs_test_'||gen_random_uuid());
 insert into public.tickets(event_id,tier_id,holder_id,code,order_ref,price_paid) values(ev,tier,seller,'ROLLBACK-'||gen_random_uuid(),orig,20) returning id into ticket;
 update public.tickets set status='resale_listed' where id=ticket;
 insert into public.resale_holds(ticket_id,token,expires_at) values(ticket,token,now()+interval '10 minutes');
 insert into public.checkout_orders(order_ref,event_id,buyer_id,token,amount,fee,status,kind,stripe_session) values(resale,ev,buyer,token,20,5,'paid','resale','cs_test_'||gen_random_uuid());
 if not exists(select 1 from public.checkout_resale_allocations where order_ref=resale and seller_id=seller and amount_minor=2000) then raise exception 'snapshot_missing'; end if;
 perform public.issue_resale(token,resale,'Rollback buyer',buyer);
 select id into job from public.resale_payouts where ticket_id=ticket;
 if not public.resale_refund_ready(job) then raise exception 'refund_not_ready'; end if;
 perform public.post_ledger_transaction('stripe:pi:'||pi,'ticket_resale','GBP',jsonb_build_array(
  jsonb_build_object('account','cash_stripe','amount_minor',2500,'party_type','platform'),jsonb_build_object('account','platform_fee','amount_minor',-500,'party_type','platform'),
  jsonb_build_object('account','provider_payable','amount_minor',-2000,'party_type','workspace','party_id',ws)),ws,ev,'checkout_order',resale,'Rollback legacy sale',pi,'system');
 repaired:=public.reconcile_resale_liability(resale);if repaired<>1 then raise exception 'legacy_not_corrected'; end if;
 repaired:=public.reconcile_resale_liability(resale);if repaired<>0 then raise exception 'duplicate_correction'; end if;
 select coalesce(sum(amount_minor),0) into amount from public.ledger_entries where party_type='workspace' and party_id=ws and account='provider_payable';
 if amount<>0 then raise exception 'workspace_inflated'; end if;
 select coalesce(sum(amount_minor),0) into amount from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id where t.event_id=ev and e.party_type='user' and e.party_id=seller and e.account='provider_payable';
 if amount<>-2000 then raise exception 'seller_liability_missing'; end if;
 perform public.post_stripe_refund_delta(charge,2000,'GBP',orig);
 perform public.settle_resale_refund(job,refund,2000,'GBP');perform public.settle_resale_refund(job,refund,2000,'GBP');
 if (select status from public.resale_payouts where id=job)<>'paid' then raise exception 'settlement_incomplete'; end if;
 select coalesce(sum(amount_minor),0) into amount from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id where t.event_id=ev and e.account='provider_payable';
 if amount<>0 then raise exception 'settled_liability_not_zero'; end if;
 select coalesce(sum(amount_minor),0) into amount from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id where t.event_id=ev and e.account='refunds';
 if amount<>0 then raise exception 'resale_refund_booked_as_expense'; end if;
 if has_table_privilege('authenticated','public.checkout_resale_allocations','SELECT') or has_function_privilege('authenticated','public.settle_resale_refund(uuid,text,bigint,text)','EXECUTE') then raise exception 'seller_privacy_or_worker_privilege'; end if;
 begin perform public.settle_resale_refund(job,refund,2100,'GBP');raise exception 'tampered_amount_accepted';exception when raise_exception then if sqlerrm='tampered_amount_accepted' then raise;end if;end;
end $$;
rollback;
select 'PASS: private checkout snapshot, legacy workspace correction, seller liability, original-method settlement, replay, amount guard and privileges; fixtures rolled back' as result;
