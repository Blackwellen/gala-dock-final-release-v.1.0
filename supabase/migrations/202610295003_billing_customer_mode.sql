-- Lane A2 · live plan / credit-pack billing. billing_customers keeps one row per workspace (PK unchanged, additive only):
--   * billing_link_customer: a LIVE customer replaces a TEST one for the same workspace (live wins); a test customer never replaces a
--     live one (a test-mode server shares this database);
--   * billing_overage_due: only customers of the request's mode (stripe_livemode(), 202610295001) are invoiced, so a live key is never
--     sent a test cus_ (and the reverse).
-- The tables are empty at authoring time (0 billing_customers, 0 workspace_subscriptions): no backfill.
begin;
create or replace function public.billing_link_customer(p_workspace uuid, p_customer text, p_livemode boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_workspace is null or coalesce(p_customer, '') !~ '^cus_[A-Za-z0-9]+$' then raise exception 'invalid_customer' using errcode = '22023'; end if;
  insert into public.billing_customers(workspace_id, stripe_customer_id, livemode) values (p_workspace, p_customer, coalesce(p_livemode, false))
  on conflict (workspace_id) do update set stripe_customer_id = excluded.stripe_customer_id, livemode = excluded.livemode, created_at = now()
    where public.billing_customers.livemode = false and excluded.livemode = true;
end $$;

create or replace function public.billing_overage_due(p_before date default null) returns table (id uuid, workspace_id uuid, period date, credits numeric, amount_minor integer, stripe_customer_id text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.workspace_id, o.period, o.credits, o.amount_minor, c.stripe_customer_id
    from public.ai_overage_charges o join public.billing_customers c on c.workspace_id = o.workspace_id and c.livemode = public.stripe_livemode()
   where o.status = 'accrued' and o.amount_minor > 0 and o.period < coalesce(p_before, date_trunc('month', now() at time zone 'utc')::date)
   order by o.period, o.workspace_id limit 200;
$$;
commit;
