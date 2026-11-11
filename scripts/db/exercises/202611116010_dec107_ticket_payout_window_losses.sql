-- Exercise for 202611116010 (always rolled back). Ends with EXERCISE_OK.
do $$
declare ws uuid := 'e2722ab1-045d-408e-93d6-a24cf7c54ce6'; owner uuid; ev uuid; open_from timestamptz; ok boolean; st text; rid uuid;
begin
  if public.dec107_add_business_days('2026-11-13 18:00+00', 5) <> '2026-11-20 18:00+00'::timestamptz then raise exception 'business days (Fri + 5 = next Fri)'; end if;
  update public.dec107_settings set exempt_demo_qa = false where id;
  select owner_id into owner from public.workspaces where id = ws;
  insert into public.events(owner_id, workspace_id, name, status, starts_at, ends_at) values (owner, ws, 'p1- far event', 'draft', now() + interval '200 days', now() + interval '200 days 4 hours') returning id into ev;
  open_from := public.ticket_sales_open_from(ev);
  if open_from < now() + interval '110 days' or open_from > now() + interval '125 days' then raise exception 'open_from %', open_from; end if;
  -- on sale now: refused with the date
  ok := false; begin insert into public.ticket_tiers(event_id, name, quantity, price, status) values (ev, 'p1- GA', 100, 20, 'on_sale');
  exception when others then ok := sqlerrm like 'tickets_on_sale_from:%'; end;
  if not ok then raise exception 'early on-sale accepted'; end if;
  -- scheduled from the open date: accepted; free tiers are never blocked
  insert into public.ticket_tiers(event_id, name, quantity, price, status, sale_start) values (ev, 'p1- GA later', 100, 20, 'scheduled', open_from + interval '1 hour');
  insert into public.ticket_tiers(event_id, name, quantity, price, status) values (ev, 'p1- free', 100, 0, 'on_sale');
  -- hold limit reached before the event (postponed): ticket release is blocked, never paid out
  insert into public.payout_releases(source_type, source_ref, workspace_id, stripe_account_id, event_id, sale_kind, livemode, charged_at, hold_limit_at, status)
    values ('checkout_order', 'p1-ex-6010', ws, 'acct_p1ex6010', ev, 'ticket_sale', false, now() - interval '88 days', now() - interval '1 hour', 'held') returning id into rid;
  perform public.dec107_release_sweep();
  select status || ':' || coalesce(blocked_reason, '') into st from public.payout_releases where id = rid;
  if st <> 'blocked:hold_limit_before_event' then raise exception 'ticket release not blocked: %', st; end if;
  -- absorbing a loss needs staff with a second factor
  insert into public.dec107_covered_liabilities(workspace_id, stripe_account_id, amount_minor) values (ws, 'acct_p1ex6010', 7125);
  ok := false; begin perform public.adm_covered_liability_absorb((select id from public.dec107_covered_liabilities where stripe_account_id = 'acct_p1ex6010'), 'p1- test'); exception when others then ok := true; end;
  if not ok then raise exception 'absorb without staff accepted'; end if;
  raise exception 'EXERCISE_OK ticket window % + hold-before-event block', to_char(open_from, 'YYYY-MM-DD');
end $$;
