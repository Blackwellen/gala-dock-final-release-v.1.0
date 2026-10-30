-- Seller proceeds are partial refunds of their own purchase, never a transfer to a third party.
begin;
alter table public.resale_payouts add column if not exists original_order_ref text references public.checkout_orders(order_ref);
alter table public.resale_payouts add column if not exists stripe_refund_id text;
alter table public.resale_payouts add column if not exists requested_at timestamptz;
alter table public.resale_payouts add column if not exists updated_at timestamptz not null default now();
alter table public.resale_payouts add column if not exists refund_error text;
alter table public.resale_payouts drop constraint if exists resale_payouts_status_check;
alter table public.resale_payouts add constraint resale_payouts_status_check check(status in ('pending','processing','paid','failed','cancelled'));
create unique index if not exists resale_refund_provider_unique on public.resale_payouts(stripe_refund_id) where stripe_refund_id is not null;

create or replace function public.guard_resale_original_payer() returns trigger
language plpgsql security definer set search_path='' as $$
declare o public.checkout_orders;
begin
 if new.status in ('resale_listed','resold') and new.status is distinct from old.status then
  select * into o from public.checkout_orders where order_ref=old.order_ref for update;
  if not found or o.buyer_id is distinct from old.holder_id or o.event_id<>old.event_id or o.status<>'issued'
   or o.refund_status<>'none' or o.stripe_session is null or upper(o.currency)<>'GBP' then
   raise exception 'original_payment_required' using errcode='22023';
  end if;
  if new.status='resold' and (not exists(select 1 from public.resale_holds where ticket_id=old.id and expires_at>now())
    or not exists(select 1 from public.events where id=old.event_id and status in ('published','on_sale') and starts_at>now())) then
   raise exception 'seat_unavailable' using errcode='23P01';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists gd_resale_original_payer on public.tickets;
create trigger gd_resale_original_payer before update of status on public.tickets for each row execute function public.guard_resale_original_payer();

create or replace function public.guard_resale_reservation_payer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.tickets t join public.checkout_orders o on o.order_ref=t.order_ref
  where t.id=new.ticket_id and o.buyer_id=t.holder_id and o.status='issued' and o.refund_status='none' and o.stripe_session is not null and upper(o.currency)='GBP') then
  raise exception 'original_payment_required' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists gd_resale_reservation_payer on public.resale_holds;
create trigger gd_resale_reservation_payer before insert on public.resale_holds for each row execute function public.guard_resale_reservation_payer();

create or replace function public.resale_listings(p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tier',tt.name,'tier_id',tt.id,'seat',t.seat,'price',t.price_paid) order by t.price_paid),'[]'::jsonb)
 from public.tickets t join public.ticket_tiers tt on tt.id=t.tier_id join public.events e on e.id=t.event_id
 join public.checkout_orders o on o.order_ref=t.order_ref and o.buyer_id=t.holder_id and o.status='issued' and o.refund_status='none' and o.stripe_session is not null and upper(o.currency)='GBP'
 left join lateral(select value from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1) s on true
 where t.event_id=p_event and t.status='resale_listed' and e.visibility='public' and e.status in ('published','on_sale') and e.starts_at>now()
 and coalesce(e.settings->>'resale','true')<>'false' and coalesce(s.value->>'resale_enabled','true')<>'false'
 and t.price_paid>0 and t.price_paid<=tt.price*coalesce((s.value->>'resale_cap_pct')::numeric,100)/100
 and not exists(select 1 from public.resale_holds h where h.ticket_id=t.id and h.expires_at>now())
$$;

-- A paid checkout racing event cancellation must refund rather than issue a new valid ticket.
create or replace function public.guard_ticket_cancelled_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=new.event_id for update;
 if new.status='valid' and exists(select 1 from public.events where id=new.event_id and status in ('cancelled','closed','archived','completed')) then
  raise exception 'seat_unavailable' using errcode='23P01';
 end if;
 return new;
end $$;
drop trigger if exists gd_ticket_cancelled_event on public.tickets;
create trigger gd_ticket_cancelled_event before insert on public.tickets for each row execute function public.guard_ticket_cancelled_event();

create or replace function public.resale_refund_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.tickets; o public.checkout_orders;
begin
 select * into t from public.tickets where id=new.ticket_id;
 select * into o from public.checkout_orders where order_ref=t.order_ref for update;
 if o.buyer_id is distinct from new.seller_id or o.status<>'issued' or o.refund_status<>'none' or o.stripe_session is null
  or t.status<>'resold' or new.amount<>t.price_paid or new.amount<=0 or new.amount>o.amount then
  raise exception 'original_payment_required' using errcode='22023';
 end if;
 new.original_order_ref:=o.order_ref;
 return new;
end $$;
drop trigger if exists gd_resale_refund_source on public.resale_payouts;
create trigger gd_resale_refund_source before insert on public.resale_payouts for each row execute function public.resale_refund_source();
-- Historical eligible jobs acquire their source; others remain visible for reconciliation and cannot move money.
update public.resale_payouts p set original_order_ref=o.order_ref from public.tickets t,public.checkout_orders o
 where p.ticket_id=t.id and t.order_ref=o.order_ref and o.buyer_id=p.seller_id and o.event_id=t.event_id and o.stripe_session is not null and p.original_order_ref is null;

create or replace function public.claim_resale_refunds(p_limit integer default 10) returns setof public.resale_payouts
language plpgsql security definer set search_path='' as $$
declare p public.resale_payouts; o public.checkout_orders; count_claimed integer:=0;
begin
 for p in select * from public.resale_payouts where status='pending'
  or (status='processing' and updated_at<now()-interval '10 minutes')
  or (status='failed' and updated_at<now()-interval '1 hour') order by created_at for update skip locked loop
  exit when count_claimed>=greatest(1,least(p_limit,25));
  select * into o from public.checkout_orders where order_ref=p.original_order_ref for update skip locked;
  if not found or o.buyer_id is distinct from p.seller_id or o.status<>'issued' then continue; end if;
  if p.status='pending' and o.refund_status<>'none' then continue; end if;
  -- Serialize all partial refunds of a purchase. Cancellation waits for an in-flight resale request to settle.
  if exists(select 1 from public.resale_payouts x where x.original_order_ref=o.order_ref and x.id<>p.id and x.status='processing') then continue; end if;
  update public.resale_payouts set status='processing',updated_at=now(),refund_error=null where id=p.id returning * into p;
  count_claimed:=count_claimed+1; return next p;
 end loop;
end $$;
revoke all on function public.claim_resale_refunds(integer) from public,anon,authenticated;
grant execute on function public.claim_resale_refunds(integer) to service_role;

create or replace function public.claim_ticket_refunds(p_limit integer default 25) returns setof public.checkout_orders
language sql security definer set search_path='' as $$
 update public.checkout_orders o set refund_status='processing',updated_at=now()
 where o.order_ref in (select x.order_ref from public.checkout_orders x
  where (x.refund_status='due' or (x.refund_status='processing' and x.updated_at<now()-interval '10 minutes')
   or (x.refund_status='failed' and x.updated_at<now()-interval '1 hour'))
  and not exists(select 1 from public.resale_payouts p where p.original_order_ref=x.order_ref and p.status in ('processing','failed'))
  order by x.created_at limit greatest(1,least(p_limit,100)) for update skip locked) returning o.*;
$$;
revoke all on function public.claim_ticket_refunds(integer) from public,anon,authenticated;
grant execute on function public.claim_ticket_refunds(integer) to service_role;

-- Stripe charge.refunded reports a cumulative amount. Post only the newly refunded delta,
-- atomically, even if webhooks arrive out of order or on concurrent workers.
create table if not exists public.stripe_refund_totals(charge_id text primary key,amount_minor bigint not null default 0,currency text not null);
alter table public.stripe_refund_totals enable row level security;
revoke all on public.stripe_refund_totals from anon,authenticated;
create or replace function public.post_stripe_refund_delta(p_charge text,p_total bigint,p_currency text,p_order_ref text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare prior bigint; posted bigint; delta bigint; wid uuid; eid uuid; cur text;
begin
 if p_total<=0 or p_currency !~ '^[A-Z]{3}$' or length(p_charge)<3 then raise exception 'invalid_refund' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-refund:'||p_charge,0));
 -- Preserve legacy cumulative keys and correct any historical overstatement with an immutable reversal.
 select coalesce(max(substring(idempotency_key from '[0-9]+$')::bigint),0) into prior from public.ledger_transactions
  where starts_with(idempotency_key,'stripe:refund:'||p_charge||':');
 insert into public.stripe_refund_totals(charge_id,amount_minor,currency) values(p_charge,prior,p_currency) on conflict do nothing;
 select amount_minor,currency into prior,cur from public.stripe_refund_totals where charge_id=p_charge for update;
 if cur<>p_currency then raise exception 'refund_currency_mismatch'; end if;
 select coalesce(-sum(e.amount_minor),0) into posted from public.ledger_transactions t join public.ledger_entries e on e.transaction_id=t.id
  where t.stripe_ref=p_charge and e.account='cash_stripe' and (starts_with(t.idempotency_key,'stripe:refund:'||p_charge||':') or starts_with(t.idempotency_key,'stripe:refund-delta:'||p_charge||':') or t.idempotency_key='stripe:refund-reconcile:'||p_charge);
 select o.event_id,e.workspace_id into eid,wid from public.checkout_orders o join public.events e on e.id=o.event_id where o.order_ref=p_order_ref;
 if posted>prior then
  perform public.post_ledger_transaction('stripe:refund-reconcile:'||p_charge,'reversal',p_currency,
   jsonb_build_array(jsonb_build_object('account','refunds','amount_minor',prior-posted,'party_type','platform'),jsonb_build_object('account','cash_stripe','amount_minor',posted-prior,'party_type','platform')),
   wid,eid,'charge',p_charge,'Correct legacy cumulative refund overstatement',p_charge,'system');
 end if;
 delta:=greatest(0,p_total-prior);
 if delta=0 then return 0; end if;
 perform public.post_ledger_transaction('stripe:refund-delta:'||p_charge||':'||p_total,'refund',p_currency,
  jsonb_build_array(jsonb_build_object('account','refunds','amount_minor',delta,'party_type','platform'),jsonb_build_object('account','cash_stripe','amount_minor',-delta,'party_type','platform')),
  wid,eid,case when p_order_ref is null then 'charge' else 'checkout_order' end,coalesce(p_order_ref,p_charge),'Refund increment',p_charge,'webhook');
 update public.stripe_refund_totals set amount_minor=p_total where charge_id=p_charge;
 return delta;
end $$;
revoke all on function public.post_stripe_refund_delta(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.post_stripe_refund_delta(text,bigint,text,text) to service_role;
commit;
