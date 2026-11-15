-- Q75 exercise (rolled back): two currencies in one period are reported separately, never added. Ends with EXERCISE_OK.
do $$
declare j jsonb; ws uuid; t0 timestamptz := now() - interval '1 hour';
begin
  select id into ws from public.workspaces limit 1;
  insert into public.transactions(workspace_id, kind, category, description, amount, status, source, fee_amount, currency, counterparty, occurred_at, livemode, details)
    values (ws, 'income', 'Ticket Sale', 'Q75 GBP', 100, 'completed', 'ticketing', 5, 'GBP', 'Q75', t0, false, '{}'),
           (ws, 'income', 'Ticket Sale', 'Q75 EUR', 70, 'completed', 'ticketing', 3, 'EUR', 'Q75', t0, false, '{}');
  j := public.admin_commerce_summary(1, now(), false);
  if not (j->'cur' ? 'GBP' and j->'cur' ? 'EUR') then raise exception 'not split by currency: %', j; end if;
  if (j->'cur'->'EUR'->>'ticketing')::numeric < 70 or (j->'cur'->'EUR'->>'ticketing')::numeric >= 170 then raise exception 'EUR mixed: %', j->'cur'->'EUR'; end if;
  raise exception 'EXERCISE_OK Q75 commerce by currency';
end $$;
