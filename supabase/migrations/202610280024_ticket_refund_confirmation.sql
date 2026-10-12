-- Persist the refund identifier so a pending Stripe refund is polled, not recreated.
-- Reuses the existing leased ticket-refund queue; no customer table grants are broadened.
alter table public.checkout_orders add column if not exists stripe_refund_id text;
create unique index if not exists checkout_orders_stripe_refund_id_idx
 on public.checkout_orders(stripe_refund_id) where stripe_refund_id is not null;
