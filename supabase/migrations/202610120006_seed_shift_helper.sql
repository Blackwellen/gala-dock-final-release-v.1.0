-- Seed-only helper (service role): move an event and its dependent schedule by N days.
begin;
create or replace function public.seed_shift_event(p_slug text, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events; iv interval := make_interval(days => p_days);
begin
  select * into e from public.events where slug = p_slug; if not found then return; end if;
  update public.events set starts_at = starts_at + iv, ends_at = ends_at + iv where id = e.id;
  update public.programme_items set starts_at = starts_at + iv where event_id = e.id;
  update public.ticket_tiers set sale_start = sale_start + iv, sale_end = sale_end + iv where event_id = e.id;
  update public.tasks set due_at = due_at + iv where event_id = e.id and due_at > now();
  update public.promotions set scheduled_at = scheduled_at + iv where event_id = e.id;
  update public.discount_codes set valid_from = valid_from + iv where event_id = e.id;
  update public.shifts set starts_at = starts_at + iv, ends_at = ends_at + iv where workspace_id = e.workspace_id and starts_at > now() + interval '120 days';
  -- Open requests get fresh, server-relative response windows.
  update public.provider_requests set response_deadline = now() + interval '2 days' where event_id = e.id and status = 'sent';
  update public.build_items set response_deadline = now() + interval '30 hours' where event_id = e.id and status in ('sent','awaiting');
  update public.build_items set hold_expires_at = now() + interval '20 hours' where event_id = e.id and status = 'held';
end; $$;
revoke execute on function public.seed_shift_event(text, integer) from public, anon, authenticated;
grant execute on function public.seed_shift_event(text, integer) to service_role;
commit;
