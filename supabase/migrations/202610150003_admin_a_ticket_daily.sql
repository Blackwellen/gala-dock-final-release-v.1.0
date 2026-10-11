-- Phase 3 · AD-009 Tickets: platform-wide (or single-event) daily ticketing series. Aggregates only; 'tickets' permission.
begin;
create or replace function public.admin_ticket_daily(p_days integer default 30, p_event uuid default null)
returns table(day date, sold bigint, revenue numeric, refunded bigint, scans bigint, anomalies bigint)
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if not public.has_admin_permission('tickets') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with g as (select generate_series(date_trunc('day', now()) - make_interval(days => 2 * d - 1), date_trunc('day', now()), interval '1 day') g),
  t as (select date_trunc('day', created_at) dd, count(*) filter (where status not in ('refunded','cancelled')) n, coalesce(sum(price_paid) filter (where status not in ('refunded','cancelled')), 0) r,
          count(*) filter (where status = 'refunded') rf
        from public.tickets where created_at >= now() - make_interval(days => 2 * d) and (p_event is null or event_id = p_event) group by 1),
  c as (select date_trunc('day', created_at) dd, count(*) n, count(*) filter (where result <> 'admitted') a
        from public.check_ins where created_at >= now() - make_interval(days => 2 * d) and (p_event is null or event_id = p_event) group by 1)
  select g.g::date, coalesce(t.n, 0), coalesce(t.r, 0), coalesce(t.rf, 0), coalesce(c.n, 0), coalesce(c.a, 0)
  from g left join t on t.dd = g.g left join c on c.dd = g.g order by g.g;
end $$;
revoke all on function public.admin_ticket_daily(integer, uuid) from public, anon;
grant execute on function public.admin_ticket_daily(integer, uuid) to authenticated;
commit;
