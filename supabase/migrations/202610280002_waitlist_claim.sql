-- Waitlist offers → checkout (§52). notify_waitlists() already counted the offered quantity in ticket_tiers.held, so claiming moves that
-- reservation into the buyer's checkout hold without incrementing `held` again. When the hold later expires, expire_checkout_holds() releases it
-- as usual. The waitlist row goes offered → converted here, and converted → purchased when the order is issued (finalise()).
create or replace function public.claim_waitlist_offer(p_offer uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.ticket_waitlist; exp timestamptz;
begin
  if length(coalesce(p_token, '')) < 16 then raise exception 'invalid_token' using errcode = '22023'; end if;
  select * into w from public.ticket_waitlist where id = p_offer and user_id = (select auth.uid()) for update;
  if not found then raise exception 'offer_not_found' using errcode = 'P0002'; end if;
  if w.status <> 'offered' or w.offer_expires_at <= now() or w.offer_tier_id is null then raise exception 'offer_expired' using errcode = '22023'; end if;
  perform public.release_checkout(p_token);
  exp := least(w.offer_expires_at, now() + interval '30 minutes');
  insert into public.ticket_holds(token, event_id, tier_id, qty, expires_at) values (p_token, w.event_id, w.offer_tier_id, w.quantity, exp);
  update public.ticket_waitlist set status = 'converted' where id = w.id;
  return jsonb_build_object('event_id', w.event_id, 'tier_id', w.offer_tier_id, 'quantity', w.quantity, 'expires_at', exp);
end $$;
revoke all on function public.claim_waitlist_offer(uuid, text) from public, anon;
grant execute on function public.claim_waitlist_offer(uuid, text) to authenticated;
