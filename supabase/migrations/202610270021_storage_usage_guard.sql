-- Security fix (reported by session -22): storage_usage() was SECURITY DEFINER, granted to authenticated and had no access check, so any
-- signed-in user could read any workspace's (or user's) storage totals. The computation moves to an internal function that only the
-- triggers and service role use; the public function checks access first.
create or replace function public.storage_usage_internal(p_workspace uuid, p_user uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with u as (
    select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0) bytes, count(*) files
    from public.storage_attribution a join storage.objects o on o.bucket_id = a.bucket and o.name = a.name
    where (p_workspace is not null and a.workspace_id = p_workspace) or (p_workspace is null and a.workspace_id is null and a.user_id = p_user)
  ), lim as (
    select case when p_workspace is null then 1::numeric
                else coalesce((public.entitlement(p_workspace, 'storage.gb') #>> '{}')::numeric, 1000000) end gb
  )
  select jsonb_build_object('bytes', u.bytes, 'files', u.files, 'limit_bytes', (lim.gb * 1073741824)::bigint,
    'pct', case when lim.gb > 0 then round(100 * u.bytes / (lim.gb * 1073741824), 1) else 0 end,
    'grace_bytes', (lim.gb * 1073741824 * 1.1)::bigint) from u, lim;
$$;
revoke all on function public.storage_usage_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.storage_usage_internal(uuid, uuid) to service_role;

create or replace function public.storage_usage(p_workspace uuid, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Service role / internal callers have no JWT user; signed-in callers must be a member, a workspaces admin, or asking about themselves.
  if auth.uid() is not null and not (
       (p_workspace is not null and (public.is_workspace_member(p_workspace) or public.has_admin_permission('workspaces')))
    or (p_workspace is null and (p_user = auth.uid() or public.has_admin_permission('workspaces')))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.storage_usage_internal(p_workspace, p_user);
end $$;
revoke all on function public.storage_usage(uuid, uuid) from public, anon;
grant execute on function public.storage_usage(uuid, uuid) to authenticated, service_role;

create or replace function public.my_storage_usage(p_workspace uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_workspace is not null and not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.storage_usage_internal(p_workspace, case when p_workspace is null then auth.uid() end);
end $$;

-- Triggers use the internal function (the uploader may not be a member of the attributed workspace's every path, and enforcement must
-- never depend on the caller's read access).
create or replace function public.trg_storage_quota() returns trigger language plpgsql security definer set search_path = '' as $$
declare o record; usage jsonb; incoming bigint := coalesce((new.metadata ->> 'size')::bigint, 0);
begin
  select * into o from public.storage_owner_of(new.bucket_id, new.name, coalesce(new.owner, auth.uid()));
  usage := public.storage_usage_internal(o.workspace_id, o.user_id);
  if (usage ->> 'bytes')::bigint + incoming > (usage ->> 'grace_bytes')::bigint then
    raise exception 'storage_quota_exceeded' using errcode = 'P0001',
      detail = 'This workspace has used its storage allowance. Delete files or upgrade the plan.';
  end if;
  insert into public.storage_attribution(bucket, name, workspace_id, user_id) values (new.bucket_id, new.name, o.workspace_id, o.user_id)
    on conflict (bucket, name) do update set workspace_id = excluded.workspace_id, user_id = excluded.user_id;
  return new;
end $$;

create or replace function public.trg_storage_quota_warn() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid; usage jsonb; size bigint := coalesce((new.metadata ->> 'size')::bigint, 0); prev bigint := coalesce((old.metadata ->> 'size')::bigint, 0); lim bigint; pct_before numeric; pct_after numeric; cap int;
begin
  if size = prev then return new; end if;
  select a.workspace_id into ws from public.storage_attribution a where a.bucket = new.bucket_id and a.name = new.name;
  if ws is null then return new; end if;
  usage := public.storage_usage_internal(ws, null); lim := (usage ->> 'limit_bytes')::bigint;
  if lim <= 0 then return new; end if;
  pct_after := 100.0 * (usage ->> 'bytes')::bigint / lim; pct_before := 100.0 * ((usage ->> 'bytes')::bigint - size + prev) / lim;
  foreach cap in array array[80, 100] loop
    if pct_before < cap and pct_after >= cap then
      insert into public.notifications(user_id, kind, title, body, link)
        select m.user_id, 'event_update', 'Storage ' || cap || '% used',
          case when cap = 100 then 'Your workspace has reached its storage allowance. Uploads stop at 110% — delete files or upgrade your plan.' else 'Your workspace has used 80% of its storage allowance.' end,
          '/' || w.kind || '/settings?tab=billing'
        from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
        where m.workspace_id = ws and m.status = 'active' and m.role in ('owner','manager');
    end if;
  end loop;
  return new;
exception when others then return new;
end $$;
