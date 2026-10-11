-- Phase 3 · Token-scoped hold summary so pages never need the service role. The checkout token (httpOnly cookie) is the bearer secret.
begin;
create or replace function public.checkout_holds(p_event uuid, p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when length(coalesce(p_token, '')) < 16 then '{"ga":[],"seats":[]}'::jsonb else jsonb_build_object(
    'ga', coalesce((select jsonb_agg(jsonb_build_object('tier_id', h.tier_id, 'qty', h.qty, 'expires_at', h.expires_at)) from public.ticket_holds h where h.token = p_token and h.event_id = p_event and h.expires_at > now()), '[]'),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('seat_key', s.seat_key, 'label', s.label, 'tier_id', s.tier_id, 'expires_at', s.hold_expires_at)) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.status = 'held' and s.hold_expires_at > now()), '[]')) end
$$;
revoke all on function public.checkout_holds(uuid, text) from public;
grant execute on function public.checkout_holds(uuid, text) to anon, authenticated, service_role;
commit;
