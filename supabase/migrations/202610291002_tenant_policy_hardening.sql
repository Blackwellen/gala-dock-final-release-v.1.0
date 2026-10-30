-- Q01 (lane A): tenant isolation hardening for RLS policies and workspace settings. Additive and idempotent.
--
-- A. "owner_id = me" policy shortcuts applied to WORKSPACE rows, so a revoked member who created a row, or the owner of a
--    SUSPENDED workspace, kept access. The shortcut now covers personal rows only (workspace_id is null); workspace rows go
--    through is_workspace_member()/has_workspace_role(), which require an active member of an active workspace.
-- B. design_elements_delete checked workspace_members directly and ignored workspace suspension. Uses has_workspace_role().
-- C. Workspace owners could write protected keys inside workspaces.settings straight through the REST API (column UPDATE/INSERT
--    grant + owner policy): settings.entitlements is read first by public.entitlement(), so an owner could self-grant paid plan
--    features (api.access, agent.deep, AI credits); settings.security.mfa_policy bypassed set_workspace_mfa_policy's aal2 check;
--    settings.flags is the per-workspace feature-flag override. A trigger now rejects direct client changes to those keys;
--    server-side RPCs/service role are unaffected (they run as the function owner / service_role).

-- A. events
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (
  (workspace_id is null and owner_id = (select auth.uid()))
  or (workspace_id is not null and public.is_workspace_member(workspace_id))
  or (visibility = 'public' and status = any (array['published','on_sale','live'])));

-- A. tasks (event tasks follow can_access_event; workspace tasks follow membership; personal tasks follow the owner)
drop policy if exists tasks_rw on public.tasks;
create policy tasks_rw on public.tasks for all
  using ((event_id is not null and public.can_access_event(event_id))
      or (workspace_id is not null and public.is_workspace_member(workspace_id))
      or (workspace_id is null and event_id is null and owner_id = (select auth.uid())))
  with check ((event_id is not null and public.can_access_event(event_id))
      or (workspace_id is not null and public.is_workspace_member(workspace_id))
      or (workspace_id is null and event_id is null and owner_id = (select auth.uid())));

-- A. calendar entries
drop policy if exists calendar_rw on public.calendar_entries;
create policy calendar_rw on public.calendar_entries for all
  using ((workspace_id is not null and public.is_workspace_member(workspace_id)) or (workspace_id is null and owner_id = (select auth.uid())))
  with check ((workspace_id is not null and public.is_workspace_member(workspace_id)) or (workspace_id is null and owner_id = (select auth.uid())));

-- A + B. design elements
drop policy if exists design_elements_read on public.design_elements;
create policy design_elements_read on public.design_elements for select using (
  (workspace_id is null and owner_id = (select auth.uid())) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
drop policy if exists design_elements_update on public.design_elements;
create policy design_elements_update on public.design_elements for update
  using (owner_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_member(workspace_id)))
  with check (owner_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_member(workspace_id)));
drop policy if exists design_elements_delete on public.design_elements;
create policy design_elements_delete on public.design_elements for delete using (
  (owner_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_member(workspace_id)))
  or (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','manager'])));

-- A. design templates
drop policy if exists design_templates_read on public.design_templates;
create policy design_templates_read on public.design_templates for select using (
  (status = 'active' and (visibility = 'public' or (workspace_id is null and owner_id is null)))
  or (workspace_id is null and owner_id = (select auth.uid()))
  or (workspace_id is not null and visibility = any (array['workspace','link','public']) and public.is_workspace_member(workspace_id))
  or public.has_admin_permission('trust'));

-- C. protected workspace settings keys
create or replace function public.guard_workspace_protected_settings()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare k text;
  protected constant text[] := array['entitlements','flags','security','beta','residency'];
begin
  -- Only direct client writes are restricted. SECURITY DEFINER RPCs run as the function owner and the service role is trusted.
  if current_user not in ('anon', 'authenticated') then return new; end if;
  foreach k in array protected loop
    if tg_op = 'INSERT' then
      if coalesce(new.settings, '{}'::jsonb) ? k then raise exception 'protected_setting:%', k using errcode = '42501'; end if;
    elsif (coalesce(new.settings, '{}'::jsonb) -> k) is distinct from (coalesce(old.settings, '{}'::jsonb) -> k) then
      raise exception 'protected_setting:%', k using errcode = '42501';
    end if;
  end loop;
  return new;
end
$function$;
revoke execute on function public.guard_workspace_protected_settings() from public, anon, authenticated;

drop trigger if exists workspaces_protected_settings on public.workspaces;
create trigger workspaces_protected_settings before insert or update of settings on public.workspaces
  for each row execute function public.guard_workspace_protected_settings();
