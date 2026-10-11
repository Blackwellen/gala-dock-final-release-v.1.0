-- Fix: functions run with search_path = '' so pgcrypto must be schema-qualified (extensions.gen_random_bytes).
begin;
create or replace function public.issue_tickets(p_tier uuid, p_quantity int, p_order_ref text, p_attendee text, p_holder uuid)
returns setof public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.ticket_tiers; i int; result public.tickets;
begin
  if p_holder is null then raise exception 'holder_required' using errcode='22023'; end if;
  if p_quantity < 1 then raise exception 'invalid_quantity' using errcode='22023'; end if;
  select * into t from public.ticket_tiers where id = p_tier for update;
  if not found then raise exception 'tier_not_found' using errcode='P0002'; end if;
  if t.status <> 'on_sale' then raise exception 'not_on_sale' using errcode='22023'; end if;
  if p_quantity > t.order_limit then raise exception 'order_limit' using errcode='22023'; end if;
  if t.sold + t.held + p_quantity > t.quantity then raise exception 'sold_out' using errcode='22023'; end if;
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then
    return query select * from public.tickets where order_ref = p_order_ref; return; -- idempotent retry
  end if;
  update public.ticket_tiers set sold = sold + p_quantity, status = case when sold + held + p_quantity = quantity then 'sold_out' else status end where id = t.id;
  for i in 1..p_quantity loop
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid)
    values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), t.event_id, t.id, p_holder, coalesce(p_attendee,''), p_order_ref, t.price)
    returning * into result;
    return next result;
  end loop;
end; $$;
create or replace function public.transfer_ticket(p_ticket uuid, p_email text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; recipient uuid; new_id uuid;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  if tk.status <> 'valid' then raise exception 'not_transferable' using errcode='22023'; end if;
  if coalesce((select (settings->>'transfers')::boolean from public.events where id = tk.event_id), true) = false then raise exception 'transfers_disabled' using errcode='22023'; end if;
  select id into recipient from auth.users where lower(email) = lower(p_email);
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, attendee_email, order_ref, seat, price_paid)
    values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), tk.event_id, tk.tier_id, recipient, p_name, lower(p_email), tk.order_ref || '-T', tk.seat, tk.price_paid)
    returning id into new_id;
  update public.tickets set status='transferred', replaced_by=new_id where id = tk.id;
  return new_id;
end; $$;
create or replace function public.list_ticket_for_resale(p_ticket uuid, p_cancel boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tk public.tickets;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_cancel then
    if tk.status <> 'resale_listed' then raise exception 'not_listed' using errcode='22023'; end if;
    update public.tickets set status='valid' where id = tk.id; return 'valid';
  end if;
  if tk.status <> 'valid' then raise exception 'not_resellable' using errcode='22023'; end if;
  update public.tickets set status='resale_listed', qr_nonce = encode(extensions.gen_random_bytes(16),'hex') where id = tk.id;
  return 'resale_listed';
end; $$;
create or replace function public.seed_backfill_tickets(p_days integer default 60) returns integer
language plpgsql security definer set search_path = '' as $$
declare t record; n int := 0; missing int; i int;
begin
  for t in select tt.*, (select count(*) from public.tickets x where x.tier_id = tt.id) have from public.ticket_tiers tt loop
    missing := t.sold - t.have;
    if missing <= 0 then continue; end if;
    for i in 1..missing loop
      insert into public.tickets(code, event_id, tier_id, attendee_name, attendee_email, order_ref, price_paid, created_at)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)),
        t.event_id, t.id, 'Guest ' || i, 'guest' || i || '@example.com', 'SEED-' || substr(t.id::text,1,8) || '-' || ((i - 1) / 2),
        t.price, now() - make_interval(days => floor(power(random(), 1.6) * p_days)::int, hours => floor(random()*20)::int));
      n := n + 1;
    end loop;
  end loop;
  return n;
end; $$;
commit;
