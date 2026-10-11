-- Phase 3 · Promoter attribution: checkout orders keep the referral code (gd_ref cookie); once tickets are issued a promoter sale is recorded
-- (pending, commission at the promoter's rate). Primary sales only; a promoter can't earn on their own purchase. Idempotent per order.
begin;
alter table public.checkout_orders add column if not exists ref_code text;
create or replace function public.attribute_referral(p_order_ref text) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; pr public.promoters; l record; n int := 0;
begin
  select * into o from public.checkout_orders where order_ref = p_order_ref;
  if not found or o.status <> 'issued' or o.kind <> 'primary' or coalesce(o.ref_code, '') = '' then return 0; end if;
  select * into pr from public.promoters where event_id = o.event_id and upper(code) = upper(o.ref_code) and status = 'active';
  if not found or pr.user_id is not distinct from o.buyer_id then return 0; end if;
  if exists(select 1 from public.promoter_sales where order_ref = p_order_ref) then return 0; end if;
  for l in select (x->>'tier_id')::uuid tier_id, x->>'name' name, (x->>'qty')::int qty, (x->>'unit')::numeric unit from jsonb_array_elements(o.lines) x loop
    insert into public.promoter_sales(promoter_id, event_id, tier_id, tier_name, quantity, amount, commission, status, channel, order_ref)
      values (pr.id, o.event_id, l.tier_id, l.name, l.qty, l.unit * l.qty, round(l.unit * l.qty * pr.commission_pct / 100, 2), 'pending', 'link', p_order_ref);
    n := n + l.qty;
  end loop;
  update public.promoters set tickets_sold = tickets_sold + n, revenue = revenue + o.amount where id = pr.id;
  return n;
end $$;
revoke all on function public.attribute_referral(text) from public, anon, authenticated;
grant execute on function public.attribute_referral(text) to service_role;
commit;
