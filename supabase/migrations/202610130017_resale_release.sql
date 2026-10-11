-- Phase 3 · Release resale holds for a token (and include them in release_checkout).
begin;
create or replace function public.release_resale_holds(p_token text) returns integer language plpgsql security definer set search_path = '' as $$
declare n int; begin delete from public.resale_holds where token = p_token; get diagnostics n = row_count; return n; end $$;
create or replace function public.release_checkout(p_token text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  n := public.release_seat_holds(p_token);
  for r in select tier_id, qty from public.ticket_holds where token = p_token for update loop
    update public.ticket_tiers set held = greatest(0, held - r.qty) where id = r.tier_id; n := n + r.qty;
  end loop;
  delete from public.ticket_holds where token = p_token;
  n := n + public.release_resale_holds(p_token);
  return n;
end $$;
revoke all on function public.release_resale_holds(text) from public;
grant execute on function public.release_resale_holds(text) to anon, authenticated;
commit;
