-- Event analytics rollups and ticket sales series (derived from canonical tickets).
begin;
create table if not exists public.event_metrics_daily (
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  page_views integer not null default 0,
  unique_visitors integer not null default 0,
  sources jsonb not null default '{}',
  primary key (event_id, day)
);
alter table public.event_metrics_daily enable row level security;
create policy event_metrics_read on public.event_metrics_daily for select to authenticated using (public.can_access_event(event_id));
grant select on public.event_metrics_daily to authenticated;

-- Daily ticket sales (count + gross) for an event, from issued entitlements (excludes comps and replacement copies).
create or replace function public.ticket_sales_series(p_event uuid, p_days integer default 30)
returns table(day date, tickets bigint, gross numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  return query
    select d::date, count(t.id), coalesce(sum(t.price_paid), 0)
    from generate_series((now() at time zone 'Europe/London')::date - (greatest(1, least(p_days, 366)) - 1), (now() at time zone 'Europe/London')::date, interval '1 day') d
    left join public.tickets t on t.event_id = p_event and t.replaced_by is null and t.order_ref not like '%-T'
      and (t.created_at at time zone 'Europe/London')::date = d::date
    group by d order by d;
end; $$;
revoke execute on function public.ticket_sales_series(uuid, integer) from public, anon;
grant execute on function public.ticket_sales_series(uuid, integer) to authenticated;

-- Seed helper (service role only): materialise ticket entitlements so tiers.sold is backed by real rows.
create or replace function public.seed_backfill_tickets(p_days integer default 60) returns integer
language plpgsql security definer set search_path = '' as $$
declare t record; n int := 0; missing int; i int;
begin
  for t in select tt.*, (select count(*) from public.tickets x where x.tier_id = tt.id) have from public.ticket_tiers tt loop
    missing := t.sold - t.have;
    if missing <= 0 then continue; end if;
    for i in 1..missing loop
      insert into public.tickets(code, event_id, tier_id, attendee_name, attendee_email, order_ref, price_paid, created_at)
      values ('GLD-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,6)),
        t.event_id, t.id, 'Guest ' || i, 'guest' || i || '@example.com', 'SEED-' || substr(t.id::text,1,8) || '-' || ((i - 1) / 2),
        t.price, now() - make_interval(days => floor(power(random(), 1.6) * p_days)::int, hours => floor(random()*20)::int));
      n := n + 1;
    end loop;
  end loop;
  return n;
end; $$;
revoke execute on function public.seed_backfill_tickets(integer) from public, anon, authenticated;
grant execute on function public.seed_backfill_tickets(integer) to service_role;
commit;
