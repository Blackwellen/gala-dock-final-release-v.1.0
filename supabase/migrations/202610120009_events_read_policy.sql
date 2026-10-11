-- INSERT ... RETURNING evaluates the SELECT policy; can_access_event(id) re-queries events and cannot see the
-- row being inserted. Check the row's own columns instead (same semantics).
begin;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (
  owner_id = (select auth.uid())
  or (workspace_id is not null and public.is_workspace_member(workspace_id))
  or (visibility = 'public' and status in ('published','on_sale','live')));
commit;
