-- Exercise for 202611146203 (rolled back): hold on open dispute (resale/transfer refused), release on won (same codes), void on lost with
-- capacity returned once, idempotent replays, transfers in scope, resold tickets out of scope.
do $$
declare o public.checkout_orders; t public.tickets; codes text[]; codes2 text[]; n int; sold0 int; sold1 int; r jsonb; msg text; ended boolean; tid uuid;
begin
  select x.* into o from public.checkout_orders x join public.events e on e.id = x.event_id
   where x.status = 'issued' and exists (select 1 from public.tickets k where k.order_ref = x.order_ref and k.status = 'valid')
   order by (coalesce(e.ends_at, e.starts_at + interval '6 hours') > now()) desc, x.created_at desc limit 1;
  if o.order_ref is null then raise exception 'no issued order with valid tickets'; end if;
  select coalesce(ev.ends_at, ev.starts_at + interval '6 hours') <= now() into ended from public.events ev where ev.id = o.event_id;
  update public.tickets set dispute_hold_at = null, dispute_hold_ref = null where order_ref = o.order_ref;
  select array_agg(code order by code) into codes from public.tickets where order_ref = o.order_ref and status = 'valid';

  -- OPEN → held, can't be listed or transferred; replay holds nothing new
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58a', 'needs_response');
  select count(*) into n from public.tickets where order_ref = o.order_ref and dispute_hold_ref = 'du_exq58a';
  if n <> array_length(codes, 1) then raise exception 'not all tickets held: % of % (%)', n, array_length(codes, 1), r; end if;
  select * into t from public.tickets where order_ref = o.order_ref and dispute_hold_at is not null limit 1;
  begin update public.tickets set status = 'resale_listed' where id = t.id; raise exception 'held ticket was listed';
  exception when others then get stacked diagnostics msg = message_text; if msg <> 'ticket_on_hold' then raise exception 'expected ticket_on_hold, got %', msg; end if; end;
  begin update public.tickets set status = 'resold' where id = t.id; raise exception 'held ticket was resold';
  exception when others then get stacked diagnostics msg = message_text; if msg <> 'seat_unavailable:ticket_on_hold' then raise exception 'expected seat_unavailable:ticket_on_hold, got %', msg; end if; end;
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58a', 'under_review');
  if coalesce((r->>'held')::int, -1) <> 0 then raise exception 'replayed open re-held: %', r; end if;

  -- WON → released, same codes; replay is a no-op
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58a', 'won');
  select array_agg(code order by code) into codes2 from public.tickets where order_ref = o.order_ref and status = 'valid' and dispute_hold_at is null;
  if codes2 is distinct from codes then raise exception 'won did not restore the same valid codes: % vs % (%)', codes2, codes, r; end if;
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58a', 'won');
  if coalesce((r->>'released')::int, -1) <> 0 then raise exception 'replayed won changed tickets'; end if;

  -- a gift transfer is in scope; a resold ticket is not
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid)
    values ('GLD-EXQ5-8TRANS', o.event_id, t.tier_id, o.buyer_id, 'Friend', o.order_ref || '-T', t.price_paid) returning id into tid;
  if not exists (select 1 from public.ticket_dispute_scope(o.order_ref) s where s = tid) then raise exception 'transfer not in scope'; end if;
  if exists (select 1 from public.ticket_dispute_scope(o.order_ref || 'X') s where s = tid) then raise exception 'scope leaked to another order'; end if;

  -- second dispute LOST → void live tickets; capacity back once (event not ended)
  select sold into sold0 from public.ticket_tiers where id = t.tier_id;
  perform public.ticket_order_dispute(o.order_ref, 'du_exq58b', 'needs_response');
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58b', 'lost');
  select count(*) into n from public.tickets where id in (select public.ticket_dispute_scope(o.order_ref)) and status in ('valid','used','resale_listed');
  if n <> 0 then raise exception 'live tickets left after lost: % (%)', n, r; end if;
  if not exists (select 1 from public.tickets where id = tid and status = 'cancelled' and void_reason = 'chargeback_lost') then raise exception 'transfer not voided'; end if;
  select sold into sold1 from public.ticket_tiers where id = t.tier_id;
  if not ended and sold1 >= sold0 and sold0 > 0 then raise exception 'capacity not returned: % → % (%)', sold0, sold1, r; end if;
  r := public.ticket_order_dispute(o.order_ref, 'du_exq58b', 'lost');
  if coalesce((r->>'voided')::int, -1) <> 0 or (select sold from public.ticket_tiers where id = t.tier_id) <> sold1 then raise exception 'replayed lost changed state: %', r; end if;

  raise exception 'EXERCISE_OK chargeback holds: % ticket(s) held/released (same codes), transfer in scope, voided on lost, capacity % → % (event ended: %), replays no-op', array_length(codes, 1), sold0, sold1, ended;
end $$;
