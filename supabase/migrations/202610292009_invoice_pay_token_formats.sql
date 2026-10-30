-- Q07 P1 (W09 finding): every live invoice pay link 404'd. invoices.payment_token defaults to 24 hex (gen_random_bytes(12)) and
-- ensure_invoice_token keeps an existing token, but invoice_by_token required length 36. Additive fix: accept every token format the
-- product has ever issued (24 hex column default, 36 hex from ensure_invoice_token, 32 hex / canonical uuid for imports), validated by
-- a strict pattern, so links already sent keep working. The function is only called by the /pay/[token] server page through the
-- service-role client, so it is restricted to service_role (it was also executable by authenticated).

create or replace function public.invoice_pay_token_valid(p_token text) returns boolean
language sql immutable set search_path = '' as $$
  select p_token is not null and p_token ~ '^([0-9a-f]{24}|[0-9a-f]{32}|[0-9a-f]{36}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$';
$$;

create or replace function public.invoice_by_token(p_token text)
returns table(id uuid, number text, client_name text, total numeric, amount_paid numeric, currency text, due_date date, status text, workspace_name text, event_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.number, i.client_name, i.total, i.amount_paid, i.currency, i.due_date, i.status, w.name, e.name
  from public.invoices i join public.workspaces w on w.id = i.workspace_id left join public.events e on e.id = i.event_id
  where public.invoice_pay_token_valid(p_token) and i.payment_token = p_token and i.status in ('sent','viewed','partial','overdue','paid');
$$;

revoke all on function public.invoice_by_token(text) from public, anon, authenticated;
grant execute on function public.invoice_by_token(text) to service_role;
revoke all on function public.invoice_pay_token_valid(text) from public, anon, authenticated;
grant execute on function public.invoice_pay_token_valid(text) to service_role;
