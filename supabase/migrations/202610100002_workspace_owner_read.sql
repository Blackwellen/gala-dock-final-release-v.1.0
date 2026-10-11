begin;
alter policy workspaces_member_read on public.workspaces
 using (owner_id = (select auth.uid()) or public.is_workspace_member(id));
commit;
