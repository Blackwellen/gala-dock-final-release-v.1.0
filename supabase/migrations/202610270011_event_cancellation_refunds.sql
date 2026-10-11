-- Organiser event cancellation with automatic ticket refunds (release spec §53–56; Cancellation & Refund Policy §2).
-- Cancelling an event voids every live ticket, queues a full refund (ticket price + booking fee) for every paid order, tells each
-- buyer, and pauses any resale payouts for the event. Refunds are executed by the payments worker with Stripe idempotency keys.
alter table public.checkout_orders add column if not exists refund_status text not null default 'none'
  check (refund_status in ('none','due','processing','refunded','failed','not_required'));
alter table public.checkout_orders add column if not exists refund_reason text;
alter table public.checkout_orders add column if not exists refunded_at timestamptz;
alter table public.checkout_orders add column if not exists refund_error text;
create index if not exists checkout_orders_refund_due_idx on public.checkout_orders(created_at) where refund_status in ('due','failed');

do $$ begin
  alter table public.resale_payouts drop constraint if exists resale_payouts_status_check;
  alter table public.resale_payouts add constraint resale_payouts_status_check check (status in ('pending','paid','failed','cancelled'));
end $$;

create table if not exists public.event_cancellations (
  event_id uuid primary key references public.events(id) on delete cascade,
  reason text not null check (length(reason) between 10 and 2000),
  cancelled_by uuid references auth.users(id),
  orders_refunded integer not null default 0,
  tickets_voided integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.event_cancellations enable row level security;
drop policy if exists event_cancellations_read on public.event_cancellations;
create policy event_cancellations_read on public.event_cancellations for select using (public.can_access_event(event_id) or public.has_admin_permission('tickets'));

create or replace function public.cancel_event_with_refunds(p_event uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; n_orders integer; n_tickets integer;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.has_workspace_role(e.workspace_id, array['owner','manager']) or public.has_admin_permission('tickets')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('cancelled','completed','closed','archived') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if e.starts_at is not null and e.starts_at < now() - interval '1 day' then raise exception 'already_happened' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.event_cancellations(event_id, reason, cancelled_by) values (p_event, left(trim(p_reason), 2000), auth.uid());
  update public.events set status = 'cancelled', updated_at = now() where id = p_event;
  update public.tickets set status = 'cancelled' where event_id = p_event and status in ('valid','resale_listed','transferred');
  get diagnostics n_tickets = row_count;
  update public.checkout_orders set refund_status = 'due', refund_reason = 'event_cancelled'
    where event_id = p_event and status in ('paid','issued') and (amount + fee) > 0 and refund_status in ('none','failed');
  get diagnostics n_orders = row_count;
  update public.checkout_orders set refund_status = 'not_required' where event_id = p_event and status in ('paid','issued') and (amount + fee) = 0 and refund_status = 'none';
  update public.resale_payouts rp set status = 'cancelled' from public.tickets t where t.id = rp.ticket_id and t.event_id = p_event and rp.status = 'pending';
  delete from public.ticket_waitlist where event_id = p_event;

  update public.event_cancellations set orders_refunded = n_orders, tickets_voided = n_tickets where event_id = p_event;
  insert into public.notifications(user_id, kind, title, body, link)
    select distinct o.buyer_id, 'ticket_refund', left(e.name || ' has been cancelled', 160),
      'The organiser cancelled this event. ' || case when (o.amount + o.fee) > 0 then 'You’ll get a full refund, including fees, to your original payment method within 5–10 working days.' else 'Your free tickets have been cancelled.' end,
      '/account/tickets'
    from public.checkout_orders o where o.event_id = p_event and o.status in ('paid','issued') and o.buyer_id is not null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'event.cancelled', jsonb_build_object('event_id', p_event, 'orders_to_refund', n_orders, 'tickets_voided', n_tickets, 'reason', left(p_reason, 300)));
  return jsonb_build_object('orders_to_refund', n_orders, 'tickets_voided', n_tickets);
end $$;
revoke all on function public.cancel_event_with_refunds(uuid, text) from public, anon;
grant execute on function public.cancel_event_with_refunds(uuid, text) to authenticated;

-- Worker lease (service role).
create or replace function public.claim_ticket_refunds(p_limit integer default 25) returns setof public.checkout_orders
language sql security definer set search_path = '' as $$
  update public.checkout_orders o set refund_status = 'processing', updated_at = now()
  where o.order_ref in (select x.order_ref from public.checkout_orders x where x.refund_status = 'due' or (x.refund_status = 'processing' and x.updated_at < now() - interval '10 minutes')
      or (x.refund_status = 'failed' and x.updated_at < now() - interval '1 hour')   -- retried hourly until resolved; visible in /api/health
    order by x.created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning o.*;
$$;
revoke all on function public.claim_ticket_refunds(integer) from public, anon, authenticated;
grant execute on function public.claim_ticket_refunds(integer) to service_role;

-- 'event.cancelled' is a public webhook event.
create or replace function public.webhook_event_type(p_audit text) returns text language sql immutable as $$
  select case p_audit
    when 'event.created' then 'event.created' when 'event.updated' then 'event.updated' when 'event_plan.published' then 'event.published' when 'event.cancelled' then 'event.cancelled'
    when 'booking.requested' then 'booking.requested' when 'booking.confirmed' then 'booking.confirmed' when 'booking.cancelled' then 'booking.cancelled'
    when 'booking.created' then 'booking.created' when 'cancellation.applied' then 'booking.cancellation_applied'
    when 'quote.sent' then 'quote.received' when 'quote.accepted' then 'quote.accepted'
    when 'proposal.accepted' then 'proposal.accepted' when 'ticket.purchased' then 'ticket.order.paid' when 'ticket.transferred' then 'ticket.transferred'
    when 'ticket.resold' then 'ticket.resold' when 'payment.succeeded' then 'payment.succeeded' when 'payment.refunded' then 'payment.refunded' when 'ticket.refunded' then 'payment.refunded'
    when 'dispute.opened' then 'dispute.opened' when 'agent.finished' then 'agent.run.completed' when 'listing.published' then 'listing.published'
    when 'review.published' then 'review.published' when 'provider.document_expiring' then 'provider.document.expiring'
    else null end;
$$;

-- Guard: an event with paid ticket orders can only become 'cancelled' through cancel_event_with_refunds (which records the
-- cancellation first), so no path can cancel an event and silently keep buyers' money.
create or replace function public.trg_event_cancel_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and not exists (select 1 from public.event_cancellations c where c.event_id = new.id)
     and exists (select 1 from public.checkout_orders o where o.event_id = new.id and o.status in ('paid','issued') and (o.amount + o.fee) > 0) then
    raise exception 'use_cancel_with_refunds' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists gd_event_cancel_guard on public.events;
create trigger gd_event_cancel_guard before update of status on public.events for each row execute function public.trg_event_cancel_guard();
