-- Q09 correction follow-up (lane A, 2026-10-29): the marketplace_match_runs policy called the service-only
-- marketplace_can_explain, so ordinary users got "permission denied" instead of filtered rows. Same rule, inlined with
-- the client-callable permission helpers. Additive.
drop policy if exists marketplace_match_runs_read on public.marketplace_match_runs;
create policy marketplace_match_runs_read on public.marketplace_match_runs for select to authenticated using (
  public.can_access_event(event_id) and (public.has_admin_permission('marketplace') or public.has_admin_permission('support')
    or exists (select 1 from public.events e where e.id = event_id and e.workspace_id is not null
               and (public.has_permission(e.workspace_id, 'marketplace.request') or public.has_permission(e.workspace_id, 'listings.manage')))));
