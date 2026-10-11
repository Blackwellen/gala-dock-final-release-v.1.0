-- Portal aggregates. SECURITY INVOKER: the caller's RLS decides which rows are counted (a promoter only ever
-- aggregates their own clicks; event managers can aggregate any promoter of their events).
begin;

create or replace function public.promoter_click_stats(p_promoter uuid, p_since timestamptz)
returns table(day date, channel text, asset_id uuid, clicks bigint)
language sql stable security invoker set search_path = '' as $$
  select (c.created_at at time zone 'Europe/London')::date, c.channel, c.asset_id, count(*)
  from public.promoter_clicks c
  where c.promoter_id = p_promoter and c.created_at >= p_since
  group by 1, 2, 3;
$$;
revoke all on function public.promoter_click_stats(uuid, timestamptz) from public, anon;
grant execute on function public.promoter_click_stats(uuid, timestamptz) to authenticated;

commit;
