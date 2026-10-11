-- Phase 3 · Platform Admin AD-001..AD-009 read models.
-- Aggregates only (no personal data beyond what the area's permission already exposes), permission-checked,
-- computed server-side so Admin screens never page thousands of ticket rows to the browser.
begin;

-- Revenue-bearing ticket = not refunded/cancelled.
create or replace function public.admin_ticket_counts(p_status text) returns boolean
language sql immutable set search_path = '' as $$ select p_status not in ('refunded','cancelled') $$;

-- ════════════════════════ Overview (AD-001) ════════════════════════
create or replace function public.admin_overview(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365));
  t0 timestamptz := now() - make_interval(days => d); t1 timestamptz := now() - make_interval(days => 2 * d);
  can_users boolean := public.has_admin_permission('users') or public.has_admin_permission('support');
  can_events boolean := public.has_admin_permission('events') or public.has_admin_permission('tickets');
  can_money boolean := public.has_admin_permission('commerce') or public.has_admin_permission('tickets');
  out jsonb := jsonb_build_object('days', d);
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  out := out || jsonb_build_object('workspaces', jsonb_build_object(
    'active', (select count(*) from public.workspaces where status = 'active'),
    'active_prev', (select count(*) from public.workspaces where status = 'active' and created_at < t0),
    'organizer', (select count(*) from public.workspaces where kind = 'organizer'),
    'provider', (select count(*) from public.workspaces where kind = 'provider'),
    'organizer_prev', (select count(*) from public.workspaces where kind = 'organizer' and created_at < t0),
    'provider_prev', (select count(*) from public.workspaces where kind = 'provider' and created_at < t0),
    'series', (select coalesce(jsonb_agg(n order by g), '[]') from (select g, (select count(*) from public.workspaces w where w.created_at < g + interval '1 day') n
      from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g) s)));
  if can_users then
    out := out || jsonb_build_object('users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'total_prev', (select count(*) from auth.users where created_at < t0),
      'new', (select count(*) from auth.users where created_at >= t0),
      'new_prev', (select count(*) from auth.users where created_at >= t1 and created_at < t0),
      'active', (select count(*) from auth.users u left join public.profiles p on p.id = u.id where coalesce(p.last_active_at, u.last_sign_in_at) >= t0),
      'active_prev', (select count(*) from auth.users u left join public.profiles p on p.id = u.id where coalesce(p.last_active_at, u.last_sign_in_at) >= t1 and coalesce(p.last_active_at, u.last_sign_in_at) < t0),
      'organizers', (select count(distinct m.user_id) from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.kind = 'organizer' and m.status = 'active'),
      'vendors', (select count(distinct m.user_id) from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.kind = 'provider' and m.status = 'active'),
      'signups', (select coalesce(jsonb_agg(n order by g), '[]') from (select g, (select count(*) from auth.users u where u.created_at >= g and u.created_at < g + interval '1 day') n
        from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g) s),
      'cumulative', (select coalesce(jsonb_agg(n order by g), '[]') from (select g, (select count(*) from auth.users u where u.created_at < g + interval '1 day') n
        from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g) s)));
  end if;
  if can_events then
    out := out || jsonb_build_object('events', jsonb_build_object(
      'total', (select count(*) from public.events),
      'total_prev', (select count(*) from public.events where created_at < t0),
      'created', (select count(*) from public.events where created_at >= t0),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.events group by status) s),
      'created_series', (select coalesce(jsonb_agg(n order by g), '[]') from (select g, (select count(*) from public.events e where e.created_at >= g and e.created_at < g + interval '1 day') n
        from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g) s),
      'cumulative', (select coalesce(jsonb_agg(n order by g), '[]') from (select g, (select count(*) from public.events e where e.created_at < g + interval '1 day') n
        from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g) s)));
  end if;
  if can_money then
    out := out || jsonb_build_object('commerce', (
      with sales as (
        select t.created_at at_, t.price_paid amt, t.order_ref ref from public.tickets t where public.admin_ticket_counts(t.status) and t.created_at >= t1
        union all select x.occurred_at, x.amount, x.id::text from public.transactions x where x.kind = 'income' and x.status = 'completed' and x.occurred_at >= t1)
      select jsonb_build_object(
        'gmv', coalesce(sum(amt) filter (where at_ >= t0), 0), 'gmv_prev', coalesce(sum(amt) filter (where at_ < t0), 0),
        'orders', count(distinct ref) filter (where at_ >= t0), 'orders_prev', count(distinct ref) filter (where at_ < t0),
        'revenue_series', (select coalesce(jsonb_agg(v order by g), '[]') from (select g, coalesce(sum(s2.amt) filter (where s2.at_ >= g and s2.at_ < g + interval '1 day'), 0) v
          from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g cross join sales s2 group by g) z),
        'order_series', (select coalesce(jsonb_agg(v order by g), '[]') from (select g, count(distinct s2.ref) filter (where s2.at_ >= g and s2.at_ < g + interval '1 day') v
          from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g cross join sales s2 group by g) z))
      from sales));
  end if;
  return out;
end $$;

-- ════════════════════════ Workspaces (AD-004/005) ════════════════════════
create or replace function public.admin_workspace_metrics(p_days integer default 30)
returns table(workspace_id uuid, gmv numeric, gmv_prev numeric, tickets bigint, tickets_prev bigint, events bigint, upcoming_events bigint,
  services_booked bigint, services_prev bigint, members bigint, last_activity timestamptz, open_flags bigint, max_risk integer, open_cases bigint, fees numeric)
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365));
  t0 timestamptz := now() - make_interval(days => d); t1 timestamptz := now() - make_interval(days => 2 * d);
begin
  if not public.has_admin_permission('workspaces') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select w.id,
    coalesce((select sum(t.price_paid) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = w.id and public.admin_ticket_counts(t.status) and t.created_at >= t0), 0)
      + coalesce((select sum(x.amount) from public.transactions x where x.workspace_id = w.id and x.kind = 'income' and x.status = 'completed' and x.occurred_at >= t0), 0),
    coalesce((select sum(t.price_paid) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = w.id and public.admin_ticket_counts(t.status) and t.created_at >= t1 and t.created_at < t0), 0)
      + coalesce((select sum(x.amount) from public.transactions x where x.workspace_id = w.id and x.kind = 'income' and x.status = 'completed' and x.occurred_at >= t1 and x.occurred_at < t0), 0),
    (select count(*) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = w.id and public.admin_ticket_counts(t.status) and t.created_at >= t0),
    (select count(*) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = w.id and public.admin_ticket_counts(t.status) and t.created_at >= t1 and t.created_at < t0),
    (select count(*) from public.events e where e.workspace_id = w.id),
    (select count(*) from public.events e where e.workspace_id = w.id and e.starts_at > now() and e.status not in ('cancelled','suspended','archived')),
    (case when w.kind = 'organizer'
      then (select count(*) from public.build_items b join public.events e on e.id = b.event_id where e.workspace_id = w.id and b.status in ('confirmed','held','fulfilled') and b.updated_at >= t0)
      else (select count(*) from public.provider_jobs j where j.workspace_id = w.id and j.created_at >= t0) end),
    (case when w.kind = 'organizer'
      then (select count(*) from public.build_items b join public.events e on e.id = b.event_id where e.workspace_id = w.id and b.status in ('confirmed','held','fulfilled') and b.updated_at >= t1 and b.updated_at < t0)
      else (select count(*) from public.provider_jobs j where j.workspace_id = w.id and j.created_at >= t1 and j.created_at < t0) end),
    (select count(*) from public.workspace_members m where m.workspace_id = w.id and m.status = 'active'),
    (select max(a.created_at) from public.audit_events a where a.workspace_id = w.id),
    (select count(*) from public.trust_cases c where c.status in ('open','in_review') and ((c.subject_type = 'workspace' and (c.subject_id = w.id or c.subject_name = w.name)))),
    (select max(c.risk_score) from public.trust_cases c where c.status in ('open','in_review') and c.subject_type = 'workspace' and (c.subject_id = w.id or c.subject_name = w.name)),
    (select count(*) from public.support_cases s where s.workspace_id = w.id and s.status <> 'resolved'),
    coalesce((select sum(x.fee_amount) from public.transactions x where x.workspace_id = w.id and x.occurred_at >= t0), 0)
  from public.workspaces w;
end $$;

-- Daily revenue split for one workspace's performance chart (tickets / services / other).
create or replace function public.admin_workspace_daily(p_ws uuid, p_days integer default 30)
returns table(day date, tickets numeric, services numeric, other numeric, ticket_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if not public.has_admin_permission('workspaces') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select g::date,
    coalesce((select sum(t.price_paid) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = p_ws and public.admin_ticket_counts(t.status) and t.created_at >= g and t.created_at < g + interval '1 day'), 0),
    coalesce((select sum(x.amount) from public.transactions x where x.workspace_id = p_ws and x.kind = 'income' and x.status = 'completed' and x.source = 'marketplace' and x.occurred_at >= g and x.occurred_at < g + interval '1 day'), 0),
    coalesce((select sum(x.amount) from public.transactions x where x.workspace_id = p_ws and x.kind = 'income' and x.status = 'completed' and x.source <> 'marketplace' and x.occurred_at >= g and x.occurred_at < g + interval '1 day'), 0),
    (select count(*) from public.tickets t join public.events e on e.id = t.event_id where e.workspace_id = p_ws and public.admin_ticket_counts(t.status) and t.created_at >= g and t.created_at < g + interval '1 day')
  from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g;
end $$;

-- ════════════════════════ Events & tickets (AD-006/009) ════════════════════════
create or replace function public.admin_event_metrics(p_days integer default 30)
returns table(event_id uuid, capacity bigint, sold bigint, gross numeric, sold_window bigint, gross_window bigint, orders bigint, used bigint, refunded bigint,
  tier_status text, providers bigint, providers_confirmed bigint, flags bigint, max_risk integer, scans bigint, scan_anomalies bigint)
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365)); t0 timestamptz := now() - make_interval(days => d);
begin
  if not (public.has_admin_permission('events') or public.has_admin_permission('tickets')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select e.id,
    coalesce(nullif((select sum(tt.quantity) from public.ticket_tiers tt where tt.event_id = e.id and tt.kind <> 'comp'), 0), e.capacity, 0)::bigint,
    (select count(*) from public.tickets t where t.event_id = e.id and public.admin_ticket_counts(t.status)),
    coalesce((select sum(t.price_paid) from public.tickets t where t.event_id = e.id and public.admin_ticket_counts(t.status)), 0),
    (select count(*) from public.tickets t where t.event_id = e.id and public.admin_ticket_counts(t.status) and t.created_at >= t0),
    coalesce((select sum(t.price_paid) from public.tickets t where t.event_id = e.id and public.admin_ticket_counts(t.status) and t.created_at >= t0), 0)::bigint,
    (select count(distinct t.order_ref) from public.tickets t where t.event_id = e.id),
    (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'used'),
    (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'refunded'),
    (select case when bool_or(tt.status = 'on_sale') then 'on_sale' when bool_or(tt.status = 'paused') then 'paused' when bool_and(tt.status = 'sold_out') then 'sold_out'
       when bool_or(tt.status = 'scheduled') then 'scheduled' when count(*) > 0 then 'draft' end from public.ticket_tiers tt where tt.event_id = e.id and tt.status <> 'hidden'),
    (select count(*) from public.build_items b where b.event_id = e.id and b.listing_id is not null and b.status not in ('suggested','draft','declined','unavailable','expired','cancelled')),
    (select count(*) from public.build_items b where b.event_id = e.id and b.listing_id is not null and b.status in ('confirmed','fulfilled')),
    (select count(*) from public.trust_cases c where c.status in ('open','in_review') and c.subject_type = 'event' and (c.subject_id = e.id or c.subject_name = e.name)),
    (select max(c.risk_score) from public.trust_cases c where c.status in ('open','in_review') and c.subject_type = 'event' and (c.subject_id = e.id or c.subject_name = e.name)),
    (select count(*) from public.check_ins c where c.event_id = e.id),
    (select count(*) from public.check_ins c where c.event_id = e.id and c.result <> 'admitted')
  from public.events e;
end $$;

-- ════════════════════════ Marketplace (AD-007/008) ════════════════════════
create or replace function public.admin_listing_metrics(p_days integer default 30)
returns table(listing_id uuid, requests bigint, requests_prev bigint, confirmed bigint, cancelled bigint, decided bigint, revenue numeric, responded bigint, open_flags bigint)
language plpgsql stable security definer set search_path = '' as $$
declare d integer := greatest(1, least(coalesce(p_days, 30), 365));
  t0 timestamptz := now() - make_interval(days => d); t1 timestamptz := now() - make_interval(days => 2 * d);
begin
  if not public.has_admin_permission('marketplace') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select l.id,
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status not in ('suggested','draft') and b.created_at >= t0),
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status not in ('suggested','draft') and b.created_at >= t1 and b.created_at < t0),
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status in ('confirmed','fulfilled')),
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status = 'cancelled'),
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status in ('confirmed','fulfilled','cancelled')),
    coalesce((select sum(b.amount) from public.build_items b where b.listing_id = l.id and b.status in ('confirmed','fulfilled') and b.updated_at >= now() - interval '90 days'), 0),
    (select count(*) from public.build_items b where b.listing_id = l.id and b.status not in ('suggested','draft','sent','awaiting','expired')),
    (select count(*) from public.trust_cases c where c.status in ('open','in_review') and c.subject_type = 'listing' and (c.subject_id = l.id or c.subject_name = l.name))
  from public.listings l;
end $$;

revoke all on function public.admin_overview(integer), public.admin_workspace_metrics(integer), public.admin_workspace_daily(uuid, integer),
  public.admin_event_metrics(integer), public.admin_listing_metrics(integer) from public, anon;
grant execute on function public.admin_overview(integer), public.admin_workspace_metrics(integer), public.admin_workspace_daily(uuid, integer),
  public.admin_event_metrics(integer), public.admin_listing_metrics(integer) to authenticated;

commit;
