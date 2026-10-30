-- Q20 follow-up (lane D, 2026-10-29): serialise ticket issuance per order. issue_checkout / issue_resale checked "tickets already
-- issued?" before locking anything, so a redirect and a webhook confirming the same paid order at once could interleave: the second
-- call saw no tickets yet, then no holds (the first had consumed them) and raised hold_expired, which finalise() turns into a
-- queued refund for an order that was in fact issued. A transaction-scoped advisory lock on the order ref closes the window;
-- bodies are otherwise unchanged (issue_checkout as in 202610294015, issue_resale as deployed).
create or replace function public.issue_checkout(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare h record; t public.ticket_tiers; i int; n int := 0;
begin
  -- One issuance per order at a time: the redirect and the webhook can confirm the same order concurrently.
  perform public.advisory_xact_lock('ticket_issue', p_order_ref);
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
  if not exists(select 1 from public.ticket_holds where token = p_token) and not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    raise exception 'hold_expired' using errcode = '22023';
  end if;
  if exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    perform public.issue_seated_tickets(p_token, p_order_ref, p_attendee, p_holder);
  end if;
  for h in select * from public.ticket_holds where token = p_token for update loop
    select * into t from public.ticket_tiers where id = h.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - h.qty), sold = sold + h.qty,
      status = case when sold + h.qty >= quantity and status = 'on_sale' then 'sold_out' else status end where id = t.id;
    for i in 1..h.qty loop
      insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid, allocation_id)
        values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), h.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, t.price, h.allocation_id);
    end loop;
  end loop;
  delete from public.ticket_holds where token = p_token;
  select count(*) into n from public.tickets where order_ref = p_order_ref;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $$;


create or replace function public.issue_resale(p_token text, p_order_ref text, p_attendee text, p_holder uuid)

returns integer language plpgsql security definer set search_path = '' as $$
declare h record; old public.tickets; nid uuid; n int := 0;
begin
  -- One issuance per order at a time: the redirect and the webhook can confirm the same order concurrently.
  perform public.advisory_xact_lock('ticket_issue', p_order_ref);
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
  for h in select * from public.resale_holds where token = p_token for update loop
    select * into old from public.tickets where id = h.ticket_id for update;
    if old.status <> 'resale_listed' then raise exception 'seat_unavailable' using errcode = '23P01'; end if;
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, seat, price_paid)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), old.event_id, old.tier_id, p_holder, coalesce(p_attendee, ''), p_order_ref, old.seat, old.price_paid)
      returning id into nid;
    update public.tickets set status = 'resold', replaced_by = nid where id = old.id;
    update public.event_seats set ticket_id = nid, updated_at = now() where ticket_id = old.id;
    insert into public.resale_payouts(seller_id, ticket_id, order_ref, amount) values (old.holder_id, old.id, p_order_ref, old.price_paid) on conflict (ticket_id) do nothing;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'hold_expired' using errcode = '22023'; end if;
  delete from public.resale_holds where token = p_token;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $$;

revoke all on function public.issue_checkout(text, text, text, uuid), public.issue_resale(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_checkout(text, text, text, uuid), public.issue_resale(text, text, text, uuid) to service_role;
