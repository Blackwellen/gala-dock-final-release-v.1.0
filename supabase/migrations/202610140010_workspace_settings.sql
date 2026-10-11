-- ORG-021 Settings: whitelisted self-service workspace settings (owner/manager). Plan, status, verification,
-- payouts and commission are never writable here.
create or replace function public.update_workspace_settings(p_ws uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed text[] := array['description','legal_name','registration','vat','address','country','currency','timezone','date_format','time_format','contact_email','contact_phone','website','notifications','agent','brand_color'];
  k text; clean jsonb := '{}';
begin
  if not public.has_workspace_role(p_ws, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 20000 then raise exception 'invalid' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p) loop
    if k = any(allowed) then clean := clean || jsonb_build_object(k, p->k); end if;
  end loop;
  if clean ? 'contact_email' and coalesce(clean->>'contact_email', '') <> '' and (clean->>'contact_email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if clean ? 'currency' and (clean->>'currency') not in ('GBP','EUR','USD') then raise exception 'invalid_currency' using errcode = '22023'; end if;
  update public.workspaces set settings = coalesce(settings, '{}') || clean,
    name = case when p ? 'name' and length(trim(p->>'name')) between 2 and 80 then trim(p->>'name') else name end,
    cover_image = case when p ? 'cover_image' and (p->>'cover_image') ~ '^(/assets/|https://)' then p->>'cover_image' else cover_image end
  where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'workspace.settings_updated', jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(clean) x)));
end $$;

-- Member role changes (owner only; the owner role itself can't be reassigned here).
create or replace function public.set_member_role(p_ws uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_ws, array['owner']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_role not in ('manager','member','finance') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if exists(select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_user and role = 'owner') then raise exception 'owner_locked' using errcode = '22023'; end if;
  update public.workspace_members set role = p_role where workspace_id = p_ws and user_id = p_user;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'workspace.role_changed', jsonb_build_object('user_id', p_user, 'role', p_role));
end $$;
revoke all on function public.update_workspace_settings(uuid, jsonb), public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_workspace_settings(uuid, jsonb), public.set_member_role(uuid, uuid, text) to authenticated;
