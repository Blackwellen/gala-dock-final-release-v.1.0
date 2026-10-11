-- Storage limits per plan (release spec §115). Every stored object is attributed to a workspace (or to a person for personal files),
-- usage is measured from live object sizes, and uploads are refused at the database once usage passes the plan's `storage.gb` plus a 10%
-- grace — regardless of which route or client uploaded the file. Owners/managers are warned at 80% and 100%.
--
-- Attribution by path convention:
--   event-media/<workspace>/…, listing-media/<workspace>/…        → that workspace
--   workspace-files/<user>/events/<event>/…                       → the event's workspace
--   workspace-files/<user>/…                                      → the user's current workspace (profiles.last_workspace_id, if a member), else personal
--   avatars/<user>/…                                              → personal
create table if not exists public.storage_attribution (
  bucket text not null, name text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid,
  created_at timestamptz not null default now(),
  primary key (bucket, name)
);
create index if not exists storage_attribution_ws_idx on public.storage_attribution(workspace_id);
create index if not exists storage_attribution_user_idx on public.storage_attribution(user_id) where workspace_id is null;
alter table public.storage_attribution enable row level security;   -- service/definer only

create or replace function public.storage_owner_of(p_bucket text, p_name text, p_uploader uuid) returns table (workspace_id uuid, user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare seg text[] := string_to_array(p_name, '/'); ws uuid; u uuid;
begin
  if seg[1] ~ '^[0-9a-f-]{36}$' then
    if p_bucket in ('event-media','listing-media') and exists (select 1 from public.workspaces w where w.id = seg[1]::uuid) then return query select seg[1]::uuid, null::uuid; return; end if;
    u := seg[1]::uuid;
  else u := p_uploader; end if;
  if p_bucket = 'workspace-files' and seg[2] = 'events' and seg[3] ~ '^[0-9a-f-]{36}$' then
    select e.workspace_id into ws from public.events e where e.id = seg[3]::uuid;
    if ws is not null then return query select ws, u; return; end if;
  end if;
  if p_bucket = 'workspace-files' and u is not null then
    select p.last_workspace_id into ws from public.profiles p where p.id = u
      and exists (select 1 from public.workspace_members m where m.workspace_id = p.last_workspace_id and m.user_id = u and m.status = 'active');
  end if;
  return query select ws, u;
end $$;

-- Usage (bytes) and limit for a workspace, or for a person's personal files (workspace null).
create or replace function public.storage_usage(p_workspace uuid, p_user uuid default null) returns jsonb
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
revoke all on function public.storage_owner_of(text, text, uuid), public.storage_usage(uuid, uuid) from public, anon;
grant execute on function public.storage_usage(uuid, uuid) to authenticated, service_role;

-- Members can read their workspace's usage; anyone can read their personal usage.
create or replace function public.my_storage_usage(p_workspace uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_workspace is not null and not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.storage_usage(p_workspace, case when p_workspace is null then auth.uid() end);
end $$;
revoke all on function public.my_storage_usage(uuid) from public, anon;
grant execute on function public.my_storage_usage(uuid) to authenticated;

-- Enforcement + attribution on upload.
create or replace function public.trg_storage_quota() returns trigger language plpgsql security definer set search_path = '' as $$
declare o record; usage jsonb; incoming bigint := coalesce((new.metadata ->> 'size')::bigint, 0);
begin
  select * into o from public.storage_owner_of(new.bucket_id, new.name, coalesce(new.owner, auth.uid()));
  usage := public.storage_usage(o.workspace_id, o.user_id);
  if (usage ->> 'bytes')::bigint + incoming > (usage ->> 'grace_bytes')::bigint then
    raise exception 'storage_quota_exceeded' using errcode = 'P0001',
      detail = 'This workspace has used its storage allowance. Delete files or upgrade the plan.';
  end if;
  insert into public.storage_attribution(bucket, name, workspace_id, user_id) values (new.bucket_id, new.name, o.workspace_id, o.user_id)
    on conflict (bucket, name) do update set workspace_id = excluded.workspace_id, user_id = excluded.user_id;
  return new;
end $$;
drop trigger if exists gd_storage_quota on storage.objects;
create trigger gd_storage_quota before insert on storage.objects for each row execute function public.trg_storage_quota();

-- Threshold warnings (80% / 100%) once the object's size is known (Storage records size after the row is created).
create or replace function public.trg_storage_quota_warn() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid; usage jsonb; size bigint := coalesce((new.metadata ->> 'size')::bigint, 0); prev bigint := coalesce((old.metadata ->> 'size')::bigint, 0); lim bigint; pct_before numeric; pct_after numeric; cap int;
begin
  if size = prev then return new; end if;
  select a.workspace_id into ws from public.storage_attribution a where a.bucket = new.bucket_id and a.name = new.name;
  if ws is null then return new; end if;
  usage := public.storage_usage(ws, null); lim := (usage ->> 'limit_bytes')::bigint;
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
drop trigger if exists gd_storage_quota_warn on storage.objects;
create trigger gd_storage_quota_warn after insert or update of metadata on storage.objects for each row execute function public.trg_storage_quota_warn();

create or replace function public.trg_storage_unattribute() returns trigger language plpgsql security definer set search_path = '' as $$
begin delete from public.storage_attribution where bucket = old.bucket_id and name = old.name; return old; end $$;
drop trigger if exists gd_storage_unattribute on storage.objects;
create trigger gd_storage_unattribute after delete on storage.objects for each row execute function public.trg_storage_unattribute();

-- Backfill existing objects.
insert into public.storage_attribution(bucket, name, workspace_id, user_id)
select o.bucket_id, o.name, x.workspace_id, x.user_id from storage.objects o cross join lateral public.storage_owner_of(o.bucket_id, o.name, o.owner) x
on conflict (bucket, name) do nothing;
