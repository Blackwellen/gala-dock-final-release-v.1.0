-- Lane C (coordinator packet from lane B, 2026-10-29): waitlist offers respect seller payment readiness.
-- When the seller's Stripe account is not ready, the event page offers "Join the waitlist" on an on-sale tier. notify_waitlists()
-- reserved stock and notified waiters whenever an on-sale tier had stock, so those people were invited straight away and then
-- refused at checkout ("seller_not_ready"). The same rule checkout uses now gates offers (src/app/checkout/[event]/page.tsx:
-- sellerBlocked = event_payment_readiness(event) <> 'ready' AND any non-hidden tier has price > 0): such events are skipped —
-- nobody is offered or notified, and nobody leaves the queue, until the seller is ready. Expired offers are still released.
-- Same signature, owner, SECURITY DEFINER and search_path; CREATE OR REPLACE keeps existing grants.
-- Rollback: re-apply the previous body (pg_get_functiondef before this file; identical except the readiness predicate).

create or replace function public.notify_waitlists()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r record; w record; n integer := 0; free integer;
begin
  -- 1. Expired offers release their reserved inventory and drop to the back of nothing (they're closed; the user may rejoin).
  for w in select q.id, q.offer_tier_id, q.quantity from public.ticket_waitlist q where q.status = 'offered' and q.offer_expires_at < now() for update loop
    update public.ticket_tiers set held = greatest(held - w.quantity, 0) where id = w.offer_tier_id;
    update public.ticket_waitlist set status = 'expired' where id = w.id;
  end loop;
  -- 2. Offer freed inventory to the next people in line, reserving it for 30 minutes — only where checkout would accept the order
  --    (paid tickets need the seller's Stripe account ready: event_payment_readiness, the checkout rule).
  for r in select t.id tier_id, t.event_id, t.name, greatest(t.quantity - t.sold - t.held, 0) avail, e.name ev, e.slug from public.ticket_tiers t join public.events e on e.id = t.event_id
           where t.status in ('on_sale','sold_out') and t.quantity - t.sold - t.held > 0 and (t.sale_end is null or t.sale_end > now()) and e.status not in ('cancelled','postponed')
             and exists (select 1 from public.ticket_waitlist wl where wl.event_id = t.event_id and (wl.tier_id = t.id or wl.tier_id is null) and wl.status = 'waiting')
             and (not exists (select 1 from public.ticket_tiers pt where pt.event_id = e.id and pt.status <> 'hidden' and pt.price > 0)
                  or public.event_payment_readiness(e.id) = 'ready') loop
    free := r.avail;
    update public.ticket_tiers set status = 'on_sale' where id = r.tier_id and status = 'sold_out';
    for w in select q.id, q.user_id, q.quantity from public.ticket_waitlist q where q.event_id = r.event_id and (q.tier_id = r.tier_id or q.tier_id is null) and q.status = 'waiting' order by q.created_at for update loop
      exit when free < w.quantity;
      update public.ticket_tiers set held = held + w.quantity where id = r.tier_id;
      update public.ticket_waitlist set status = 'offered', notified_at = now(), offer_expires_at = now() + interval '30 minutes', offer_tier_id = r.tier_id where id = w.id;
      insert into public.notifications(user_id, kind, title, body, link) values (w.user_id, 'ticket_waitlist', 'Tickets reserved for you: ' || r.ev,
        w.quantity || ' × ' || r.name || ' are held for you for 30 minutes. After that they go to the next person in line.', '/checkout/' || coalesce(r.slug, '') || '?waitlist_offer=' || w.id);
      free := free - w.quantity; n := n + 1;
    end loop;
  end loop;
  return n;
end $function$;
