begin;
-- Seller identities stay private, outside buyer-readable checkout_orders and public resale quotes.
create table if not exists public.checkout_resale_allocations (
 order_ref text not null references public.checkout_orders(order_ref) on delete cascade,
 ticket_id uuid not null references public.tickets(id),
 seller_id uuid references auth.users(id) on delete set null,
 amount_minor bigint not null check(amount_minor>0),
 primary key(order_ref,ticket_id)
);
alter table public.checkout_resale_allocations enable row level security;
revoke all on public.checkout_resale_allocations from anon,authenticated;

create or replace function public.capture_resale_allocations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind<>'resale' then return new; end if;
 insert into public.checkout_resale_allocations(order_ref,ticket_id,seller_id,amount_minor)
  select new.order_ref,t.id,t.holder_id,round(t.price_paid*100)::bigint from public.resale_holds h join public.tickets t on t.id=h.ticket_id
  where h.token=new.token and h.expires_at>now() and t.event_id=new.event_id and t.status='resale_listed' and t.holder_id<>new.buyer_id;
 if coalesce((select sum(amount_minor) from public.checkout_resale_allocations where order_ref=new.order_ref),0)<>round(new.amount*100)::bigint
  or new.amount<=0 or new.commission<>0 then raise exception 'resale_allocation_mismatch' using errcode='22023'; end if;
 return new;
end $$;
drop trigger if exists gd_checkout_resale_allocations on public.checkout_orders;
create trigger gd_checkout_resale_allocations after insert on public.checkout_orders for each row execute function public.capture_resale_allocations();
-- Completed historical sales have authoritative seller records, even after their holds were removed.
insert into public.checkout_resale_allocations(order_ref,ticket_id,seller_id,amount_minor)
 select p.order_ref,p.ticket_id,p.seller_id,round(p.amount*100)::bigint from public.resale_payouts p join public.checkout_orders o on o.order_ref=p.order_ref
 where o.kind='resale' and p.amount>0 on conflict do nothing;

-- Financial completion and seller liability settlement must commit together. Cash is recorded by the refund webhook.
create or replace function public.resale_refund_ready(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.resale_payouts p join public.checkout_resale_allocations a on a.order_ref=p.order_ref and a.ticket_id=p.ticket_id
  join public.checkout_orders o on o.order_ref=a.order_ref where p.id=p_job and a.seller_id=p.seller_id and a.amount_minor=round(p.amount*100)::bigint
  and o.kind='resale' and o.status in ('issued','refunded') and o.stripe_session is not null);
$$;
revoke all on function public.resale_refund_ready(uuid) from public,anon,authenticated;
grant execute on function public.resale_refund_ready(uuid) to service_role;

-- A scoped worker lease permits reconciliation/testing of one known job without claiming unrelated money movements.
create or replace function public.claim_resale_refund(p_job uuid) returns setof public.resale_payouts
language plpgsql security definer set search_path='' as $$
declare p public.resale_payouts; o public.checkout_orders;
begin
 select * into p from public.resale_payouts where id=p_job and status='pending' for update skip locked;
 if not found then return; end if;
 select * into o from public.checkout_orders where order_ref=p.original_order_ref for update skip locked;
 if not found or o.buyer_id is distinct from p.seller_id or o.status<>'issued' or o.refund_status<>'none' then return; end if;
 if not public.resale_refund_ready(p.id) or exists(select 1 from public.resale_payouts where original_order_ref=o.order_ref and id<>p.id and status='processing') then return; end if;
 update public.resale_payouts set status='processing',updated_at=now(),refund_error=null where id=p.id returning * into p;
 return next p;
end $$;
revoke all on function public.claim_resale_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_resale_refund(uuid) to service_role;

-- Reverse only the liability portion of legacy resale journals, leaving cash and platform fees untouched.
create or replace function public.reconcile_resale_liability(p_ref text) returns integer
language plpgsql security definer set search_path='' as $$
declare tx public.ledger_transactions; actual jsonb; desired jsonb; lines jsonb; n integer:=0; face bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resale-liability:'||p_ref,0));
 select coalesce(sum(amount_minor),0) into face from public.checkout_resale_allocations where order_ref=p_ref;
 if face=0 then raise exception 'resale_allocation_missing'; end if;
 select jsonb_agg(jsonb_build_object('party_type','user','party_id',seller_id,'amount_minor',amount) order by seller_id) into desired
  from(select seller_id,-sum(amount_minor) amount from public.checkout_resale_allocations where order_ref=p_ref group by seller_id) a;
 for tx in select * from public.ledger_transactions where kind='ticket_resale' and source_type='checkout_order' and source_id=p_ref loop
  if exists(select 1 from public.ledger_transactions where idempotency_key='resale:allocation:'||tx.id) then continue; end if;
  if (select coalesce(-sum(amount_minor),0) from public.ledger_entries where transaction_id=tx.id and account='provider_payable')<>face then raise exception 'resale_liability_mismatch'; end if;
  select jsonb_agg(jsonb_build_object('party_type',party_type,'party_id',party_id,'amount_minor',amount) order by party_id) into actual
   from(select party_type,party_id,sum(amount_minor) amount from public.ledger_entries where transaction_id=tx.id and account='provider_payable' group by party_type,party_id) e;
  if actual=desired then continue; end if;
  select jsonb_agg(jsonb_build_object('account','provider_payable','amount_minor',-amount_minor,'party_type',party_type,'party_id',party_id)) into lines
   from public.ledger_entries where transaction_id=tx.id and account='provider_payable';
  select lines||jsonb_agg(jsonb_build_object('account','provider_payable','amount_minor',-amount,'party_type','user','party_id',seller_id)) into lines
   from(select seller_id,sum(amount_minor) amount from public.checkout_resale_allocations where order_ref=p_ref group by seller_id) a;
  perform public.post_ledger_transaction('resale:allocation:'||tx.id,'adjustment',tx.currency,lines,tx.workspace_id,tx.event_id,'checkout_order',p_ref,'Correct resale seller liability allocation',tx.stripe_ref,'system');
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.reconcile_resale_liability(text) from public,anon,authenticated;
grant execute on function public.reconcile_resale_liability(text) to service_role;

create or replace function public.settle_resale_refund(p_job uuid,p_refund text,p_amount bigint,p_currency text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.resale_payouts; o public.checkout_orders; ev public.events;
begin
 select * into p from public.resale_payouts where id=p_job for update;
 if not found or p.seller_id is null or p.original_order_ref is null or p.status='cancelled' or length(coalesce(p_refund,''))<3 or p_amount<>round(p.amount*100)::bigint then raise exception 'invalid_resale_settlement'; end if;
 select * into o from public.checkout_orders where order_ref=p.original_order_ref;
 if o.buyer_id is distinct from p.seller_id or upper(o.currency)<>upper(p_currency) then raise exception 'original_payment_required'; end if;
 if p.stripe_refund_id is not null and p.stripe_refund_id<>p_refund then raise exception 'refund_identity_mismatch'; end if;
 if not exists(select 1 from public.checkout_resale_allocations a where a.order_ref=p.order_ref and a.ticket_id=p.ticket_id and a.seller_id=p.seller_id and a.amount_minor=p_amount) then raise exception 'resale_allocation_missing'; end if;
 if not public.resale_refund_ready(p_job) then raise exception 'resale_payment_not_issued'; end if;
 perform public.reconcile_resale_liability(p.order_ref);
 select * into ev from public.events where id=o.event_id;
 perform public.post_ledger_transaction('resale:settled:'||p.id,'refund',upper(p_currency),
  jsonb_build_array(jsonb_build_object('account','provider_payable','amount_minor',p_amount,'party_type','user','party_id',p.seller_id),
   jsonb_build_object('account','refunds','amount_minor',-p_amount,'party_type','platform')),
  ev.workspace_id,ev.id,'resale_payout',p.id::text,'Seller proceeds refunded to original payment method',p_refund,'system');
 update public.resale_payouts set status='paid',stripe_refund_id=p_refund,refund_error=null,updated_at=now() where id=p.id;
 return true;
end $$;
revoke all on function public.settle_resale_refund(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.settle_resale_refund(uuid,text,bigint,text) to service_role;
commit;
