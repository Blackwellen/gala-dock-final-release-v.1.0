-- Ticket holders keep read access to events they hold (or held) tickets for, after the event leaves sale
-- (completed/closed) — needed for My Tickets history, receipts and transfer records.
create or replace function public.holds_ticket_for(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tickets t where t.event_id = p_event and t.holder_id = auth.uid());
$$;
revoke all on function public.holds_ticket_for(uuid) from public, anon;
grant execute on function public.holds_ticket_for(uuid) to authenticated;
drop policy if exists events_ticket_holder_read on public.events;
create policy events_ticket_holder_read on public.events for select to authenticated using (public.holds_ticket_for(id));
