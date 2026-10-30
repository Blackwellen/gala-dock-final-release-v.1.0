-- Lane A2 · the admin VAT statement (admin/commerce/vat → admin_vat_summary) counts only payments of the current Stripe mode, so test
-- orders never appear as live output VAT. Additive: one flag on platform_charges (existing rows = test) + the same function body with a
-- livemode predicate per source. The caller is an admin under RLS, so stripe_livemode() = the platform record (202610295001).
begin;
alter table public.platform_charges add column if not exists livemode boolean not null default false;
alter table public.platform_charges alter column livemode set default public.stripe_livemode();

create or replace function public.admin_vat_summary(p_from date, p_to date) returns table (source text, transactions bigint, gross numeric, vat numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
declare lm boolean := public.stripe_livemode();
begin
  if not (public.has_admin_permission('commerce') or public.has_admin_permission('finance')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with t as (
    select 'Ticket booking fees'::text s, o.fee g, o.fee_vat v from public.checkout_orders o
      where o.status in ('paid','issued') and o.created_at >= p_from and o.created_at < p_to + 1 and o.fee > 0 and o.livemode = lm
    union all select 'Ticket seller commission', o.commission, o.commission_vat from public.checkout_orders o
      where o.status in ('paid','issued') and o.created_at >= p_from and o.created_at < p_to + 1 and o.commission > 0 and o.livemode = lm
    union all select 'Booking admin fees', p.customer_fee_minor / 100.0, p.customer_fee_vat_minor / 100.0 from public.payment_orders p
      where p.status not in ('amount_due','payment_pending','failed','cancelled','expired','refunded') and p.created_at >= p_from and p.created_at < p_to + 1 and p.customer_fee_minor > 0 and p.livemode = lm
    union all select case when p.kind = 'platform_boost' then 'Promotion boosts' else 'Supplier commission' end, p.platform_fee_minor / 100.0, p.platform_fee_vat_minor / 100.0 from public.payment_orders p
      where p.status not in ('amount_due','payment_pending','failed','cancelled','expired','refunded') and p.created_at >= p_from and p.created_at < p_to + 1 and p.platform_fee_minor > 0 and p.livemode = lm
    union all select 'Cancellation charges', c.amount, c.vat from public.platform_charges c
      where c.status in ('due','settled') and c.created_at >= p_from and c.created_at < p_to + 1 and c.livemode = lm)
  select t.s, count(*), round(sum(t.g), 2), round(sum(t.v), 2), round(sum(t.g - t.v), 2) from t group by t.s order by 1;
end $$;
commit;
