-- Q75 (i18n gap C12): admin_commerce_summary added amounts across currencies. Same signature; the result is now keyed by currency:
-- {cur: {GBP: {...}, EUR: {...}}, prev: {...}, by_currency: true}. The page shows one figure per currency and never a mixed total.
create or replace function public.admin_commerce_summary(p_days integer, p_now timestamptz default now(), p_livemode boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with w as (select greatest(1, least(coalesce(p_days, 30), 366)) d, coalesce(p_now, now()) t),
  x as (
    select tx.*, tx.occurred_at > w.t - make_interval(days => w.d) or tx.occurred_at = w.t - make_interval(days => w.d) as cur,
      lower(coalesce(tx.details ->> 'disputed', '')) not in ('', 'false', '0', 'null') as disputed,
      lower(coalesce(tx.details ->> 'held', '')) not in ('', 'false', '0', 'null') as held,
      case when coalesce(tx.details ->> 'subscriptions', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (tx.details ->> 'subscriptions')::numeric else 1 end as subs,
      upper(coalesce(nullif(tx.currency, ''), 'GBP')) as ccy,
      case when coalesce(tx.details ->> 'cancelled', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (tx.details ->> 'cancelled')::numeric else 0 end as cancels
    from public.transactions tx, w
    where tx.livemode = coalesce(p_livemode, false) and tx.occurred_at >= w.t - make_interval(days => 2 * w.d) and tx.occurred_at <= w.t),
  s as (select x.*, (x.kind in ('income','fee') and x.status <> 'failed' and not x.disputed) as sale,
               (x.source = 'subscription' and x.kind = 'income' and x.status <> 'failed') as sub from x),
  agg as (select s.cur, s.ccy, jsonb_build_object(
      'gmv', coalesce(sum(s.amount) filter (where s.sale), 0),
      'platform', coalesce(sum(case when s.source = 'subscription' then s.amount else coalesce(s.fee_amount, 0) end) filter (where s.sale), 0),
      'ticketing', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'ticketing'), 0),
      'marketplace', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'marketplace'), 0),
      'subscription', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'subscription'), 0),
      'venue', coalesce(sum(s.amount) filter (where s.sale and s.category = 'Venue Booking'), 0),
      'supplier', coalesce(sum(s.amount) filter (where s.sale and s.category = 'Supplier Service'), 0),
      'other_fees', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'fee'), 0),
      'n', count(*),
      'failed', count(*) filter (where s.status = 'failed' and s.kind <> 'payout' and s.source <> 'subscription'),
      'held', count(*) filter (where s.held),
      'refunds', count(*) filter (where s.kind = 'refund'),
      'disputes', count(*) filter (where s.disputed),
      'sub_issues', count(*) filter (where s.source = 'subscription' and s.status = 'failed'),
      'payout_fails', count(*) filter (where s.kind = 'payout' and s.status = 'failed'),
      'ok', count(*) filter (where s.kind in ('income','payment') and s.status = 'completed' and not s.held and not s.disputed),
      'pending', count(*) filter (where s.status = 'pending' and not s.held),
      'failed_all', count(*) filter (where s.status = 'failed'),
      'sub_count', coalesce(sum(s.subs) filter (where s.sub), 0),
      'sub_cancelled', coalesce(sum(s.cancels) filter (where s.sub), 0),
      'mrr', coalesce(sum(s.amount) filter (where s.sub), 0),
      'payouts_paid', coalesce(sum(abs(s.amount)) filter (where s.kind = 'payout' and s.status = 'completed'), 0),
      'payouts_pending', coalesce(sum(abs(s.amount)) filter (where s.kind = 'payout' and s.status in ('pending','scheduled')), 0),
      'payouts_pending_n', count(*) filter (where s.kind = 'payout' and s.status in ('pending','scheduled')),
      'payouts_failed_n', count(*) filter (where s.kind = 'payout' and s.status = 'failed')) j
    from s group by s.cur, s.ccy)
  select jsonb_build_object('cur', coalesce((select jsonb_object_agg(a.ccy, a.j) from agg a where a.cur), '{}'::jsonb),
    'prev', coalesce((select jsonb_object_agg(a.ccy, a.j) from agg a where not a.cur), '{}'::jsonb), 'by_currency', true);
$$;
