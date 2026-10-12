-- Media Studio: count a template use when someone applies it inside the editor (the "Templates" tab inserts its pages into the
-- current design). Counts only templates the caller is allowed to read — the same rule as the design_templates_read policy.
create or replace function public.template_used(p_template uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.design_templates t set usage_count = usage_count + 1
   where t.id = p_template and t.status = 'active'
     and (t.visibility = 'public' or (t.workspace_id is null and t.owner_id is null) or t.owner_id = auth.uid()
          or (t.workspace_id is not null and t.visibility in ('workspace','link','public') and public.is_workspace_member(t.workspace_id)));
end $$;
revoke all on function public.template_used(uuid) from public, anon;
grant execute on function public.template_used(uuid) to authenticated;
