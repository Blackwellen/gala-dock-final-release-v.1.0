-- "My elements" (user request): people upload their own images, GIFs and SVGs, or save a group of layers, and reuse them from
-- Media Studio's left menu. Private to the uploader, or shared with their workspace's team.
begin;
create table if not exists public.design_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('image','gif','svg','group')),
  title text not null default '' check (length(title) <= 120),
  path text check (path is null or path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif|svg)$'),
  width integer not null default 0 check (width between 0 and 20000),
  height integer not null default 0 check (height between 0 and 20000),
  data jsonb not null default '{}' check (octet_length(data::text) <= 600000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check ((kind = 'group') = (path is null))
);
create index if not exists design_elements_owner on public.design_elements(owner_id, created_at desc);
create index if not exists design_elements_ws on public.design_elements(workspace_id, created_at desc) where workspace_id is not null;
alter table public.design_elements enable row level security;
drop policy if exists design_elements_read on public.design_elements;
create policy design_elements_read on public.design_elements for select
  using (owner_id = (select auth.uid()) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
-- Uploads must be the caller's own files; a shared element must belong to a workspace they're in.
drop policy if exists design_elements_insert on public.design_elements;
create policy design_elements_insert on public.design_elements for insert
  with check (owner_id = (select auth.uid()) and (path is null or split_part(path, '/', 1) = (select auth.uid())::text)
    and (workspace_id is null or public.is_workspace_member(workspace_id)));
drop policy if exists design_elements_update on public.design_elements;
create policy design_elements_update on public.design_elements for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_member(workspace_id)));
drop policy if exists design_elements_delete on public.design_elements;
create policy design_elements_delete on public.design_elements for delete
  using (owner_id = (select auth.uid()) or (workspace_id is not null and exists (select 1 from public.workspace_members m
    where m.workspace_id = design_elements.workspace_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner','manager'))));
grant select, insert, update, delete on public.design_elements to authenticated;
grant all on public.design_elements to service_role;

-- The private bucket accepts GIF and SVG too (only via the element upload route, which sniffs and screens SVGs).
update storage.buckets set allowed_mime_types = (select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}') || array['image/gif','image/svg+xml']) m)
  where id = 'workspace-files';

-- Team members can load a shared element's file (and any private image inside a shared group).
create or replace function public.can_read_media_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif|svg)$' and (
    split_part(p_path, '/', 1) = (select auth.uid())::text
    or exists (select 1 from public.designs d where d.deleted_at is null and position(p_path in d.document::text) > 0 and public.design_access(d.id) is not null)
    or exists (select 1 from public.design_templates t where t.status = 'active' and position(p_path in t.document::text) > 0
               and (t.owner_id = (select auth.uid()) or (t.workspace_id is not null and public.is_workspace_member(t.workspace_id))))
    or exists (select 1 from public.brand_kits b where position(p_path in b.logos::text) > 0 and public.is_workspace_member(b.workspace_id))
    or exists (select 1 from public.design_elements e where (e.path = p_path or position(p_path in e.data::text) > 0)
               and e.workspace_id is not null and public.is_workspace_member(e.workspace_id)));
$$;
commit;
