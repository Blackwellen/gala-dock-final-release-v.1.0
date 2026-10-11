-- Media Studio: system templates are those with neither a workspace nor an owner. A personal (no-workspace) private template must
-- stay private to its owner; link templates are only reachable with their token via template_by_link().
drop policy if exists design_templates_read on public.design_templates;
create policy design_templates_read on public.design_templates for select using (
  (status = 'active' and (visibility = 'public' or (workspace_id is null and owner_id is null))) or owner_id = (select auth.uid())
  or (workspace_id is not null and visibility in ('workspace','link','public') and public.is_workspace_member(workspace_id)) or public.has_admin_permission('trust'));

create or replace function public.template_usable(p_template uuid, p_link_hash text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.design_templates t where t.id = p_template and t.status = 'active' and (
    t.visibility = 'public' or (t.workspace_id is null and t.owner_id is null) or t.owner_id = (select auth.uid())
    or (t.workspace_id is not null and t.visibility <> 'private' and public.is_workspace_member(t.workspace_id))
    or (t.visibility = 'link' and p_link_hash is not null and t.link_token_hash = p_link_hash)));
$$;
revoke all on function public.template_usable(uuid, text) from public, anon;
grant execute on function public.template_usable(uuid, text) to authenticated, service_role;

create or replace function public.template_by_link(p_link_hash text) returns table (id uuid, title text, description text, category text, width numeric, height numeric, document jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.description, t.category, t.width, t.height, t.document from public.design_templates t
  where t.link_token_hash = p_link_hash and t.visibility = 'link' and t.status = 'active' and (select auth.uid()) is not null;
$$;
revoke all on function public.template_by_link(text) from public, anon;
grant execute on function public.template_by_link(text) to authenticated, service_role;

create or replace function public.create_design(p_workspace uuid, p_event uuid, p_title text, p_document jsonb, p_source text default 'blank', p_template uuid default null, p_link_hash text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare did uuid; doc jsonb := p_document;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_workspace is not null and not public.has_workspace_role(p_workspace, array['owner','manager','member']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_event is not null and not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_template is not null then
    if not public.template_usable(p_template, p_link_hash) then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    select t.document into doc from public.design_templates t where t.id = p_template;
    update public.design_templates set usage_count = usage_count + 1 where id = p_template;
  end if;
  if jsonb_typeof(doc->'pages') <> 'array' then raise exception 'invalid_document' using errcode = '22023'; end if;
  insert into public.designs(workspace_id, owner_id, event_id, title, document, source, template_id)
    values (p_workspace, auth.uid(), p_event, left(coalesce(nullif(trim(p_title), ''), 'Untitled design'), 140), doc, p_source, p_template) returning id into did;
  insert into public.design_versions(design_id, version, label, auto, document, created_by) values (did, 1, 'Created', false, doc, auth.uid());
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'design.created', jsonb_build_object('design_id', did, 'source', p_source));
  return did;
end $$;
drop function if exists public.create_design(uuid, uuid, text, jsonb, text, uuid);
revoke all on function public.create_design(uuid, uuid, text, jsonb, text, uuid, text) from public, anon;
grant execute on function public.create_design(uuid, uuid, text, jsonb, text, uuid, text) to authenticated, service_role;
