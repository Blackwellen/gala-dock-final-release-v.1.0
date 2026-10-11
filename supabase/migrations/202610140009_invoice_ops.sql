-- Organizer money (ORG-018/019): payments against invoices, reminders, pay links. All writes via role-checked RPCs.
create or replace function public.ensure_invoice_token(p_invoice uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; tok text;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status in ('draft','cancelled','credited') then raise exception 'not_payable' using errcode = '22023'; end if;
  tok := coalesce(i.payment_token, encode(extensions.gen_random_bytes(18), 'hex'));
  update public.invoices set payment_token = tok where id = i.id;
  return tok;
end $$;

-- Records money received (manual bank transfer, or a confirmed card payment). Settles instalments oldest first.
create or replace function public.record_invoice_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invoices; left_amt numeric; inst record; paid numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status in ('draft','cancelled','credited','paid') then raise exception 'not_payable' using errcode = '22023'; end if;
  if p_amount <= 0 or p_amount > i.total - i.amount_paid + 0.005 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  paid := i.amount_paid + p_amount;
  update public.invoices set amount_paid = paid, status = case when paid >= i.total - 0.005 then 'paid' else 'partial' end where id = i.id;
  left_amt := p_amount;
  for inst in select * from public.invoice_installments where invoice_id = i.id and status <> 'paid' order by due_date loop
    exit when left_amt <= 0;
    if left_amt >= inst.amount - 0.005 then update public.invoice_installments set status = 'paid' where id = inst.id; left_amt := left_amt - inst.amount; else exit; end if;
  end loop;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref)
    values (i.workspace_id, i.event_id, 'income', 'invoice', 'Invoice ' || i.number || ' payment', p_amount, 'completed', 'manual', 'invoice', i.id, now(), i.currency, i.client_name, nullif(left(coalesce(p_ref, ''), 120), ''));
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, case when paid >= i.total - 0.005 then 'Invoice paid' else 'Payment received' end,
    '£' || to_char(p_amount, 'FM999G999G990D00') || ' received via ' || coalesce(nullif(p_method, ''), 'bank transfer'));
end $$;

create or replace function public.invoice_reminder(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice;
  if not found or not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status not in ('sent','viewed','partial','overdue') then raise exception 'not_due' using errcode = '22023'; end if;
  if exists(select 1 from public.invoice_events where invoice_id = i.id and event = 'Payment reminder sent' and created_at > now() - interval '24 hours') then raise exception 'too_soon' using errcode = '22023'; end if;
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, 'Payment reminder sent', 'Reminder sent to ' || i.client_email);
end $$;

-- Public pay page reads a single invoice by its unguessable token (no workspace data beyond the bill).
create or replace function public.invoice_by_token(p_token text)
returns table(id uuid, number text, client_name text, total numeric, amount_paid numeric, currency text, due_date date, status text, workspace_name text, event_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.number, i.client_name, i.total, i.amount_paid, i.currency, i.due_date, i.status, w.name, e.name
  from public.invoices i join public.workspaces w on w.id = i.workspace_id left join public.events e on e.id = i.event_id
  where i.payment_token = p_token and length(p_token) = 36 and i.status in ('sent','viewed','partial','overdue','paid');
$$;

revoke all on function public.ensure_invoice_token(uuid), public.record_invoice_payment(uuid, numeric, text, text), public.invoice_reminder(uuid), public.invoice_by_token(text) from public, anon;
grant execute on function public.ensure_invoice_token(uuid), public.record_invoice_payment(uuid, numeric, text, text), public.invoice_reminder(uuid) to authenticated;
grant execute on function public.invoice_by_token(text), public.record_invoice_payment(uuid, numeric, text, text) to service_role;
