begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  home_area text not null default '',
  currency text not null default 'GBP',
  interests text[] not null default '{}',
  notifications jsonb not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('organizer','provider')),
  settings jsonb not null default '{}',
  onboarding_step text not null default 'business',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','manager','member','finance')),
  primary key (workspace_id,user_id)
);
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('manager','member','finance')),
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('venue','service')),
  description text not null default '',
  location text not null default '',
  details jsonb not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.saved_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,item_key)
);
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null,
  event_date date,
  details jsonb not null default '{}',
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create table if not exists public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  complete boolean not null default false,
  created_at timestamptz not null default now()
);
create or replace function public.is_workspace_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.workspace_members where workspace_id=target and user_id=(select auth.uid()))
 or exists(select 1 from public.workspaces where id=target and owner_id=(select auth.uid()));
$$;
create or replace function public.is_workspace_owner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.workspaces where id=target and owner_id=(select auth.uid()));
$$;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict do nothing;
 return new;
end;
$$;
drop trigger if exists gala_new_user on auth.users;
create trigger gala_new_user after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,full_name) select id,coalesce(raw_user_meta_data->>'full_name','') from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.platform_admins enable row level security;
alter table public.listings enable row level security;
alter table public.saved_items enable row level security;
alter table public.enquiries enable row level security;
alter table public.user_tasks enable row level security;

create policy profiles_own_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy workspaces_member_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
create policy workspaces_owner_insert on public.workspaces for insert to authenticated with check(owner_id=(select auth.uid()));
create policy workspaces_owner_update on public.workspaces for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy members_read on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
create policy members_owner_manage on public.workspace_members for all to authenticated using(public.is_workspace_owner(workspace_id)) with check(public.is_workspace_owner(workspace_id));
create policy invites_owner_manage on public.workspace_invites for all to authenticated using(public.is_workspace_owner(workspace_id)) with check(public.is_workspace_owner(workspace_id));
create policy admin_self_read on public.platform_admins for select to authenticated using(user_id=(select auth.uid()));
create policy listings_public_read on public.listings for select to anon,authenticated using(published or public.is_workspace_member(workspace_id));
create policy listings_owner_manage on public.listings for all to authenticated using(public.is_workspace_owner(workspace_id)) with check(public.is_workspace_owner(workspace_id));
create policy saved_own on public.saved_items for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy enquiries_own on public.enquiries for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy tasks_own on public.user_tasks for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create index on public.workspaces(owner_id);
create index on public.workspace_members(user_id);
create index on public.listings(workspace_id);
create index on public.workspace_invites(workspace_id);
create index on public.enquiries(user_id);
create index on public.user_tasks(user_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('workspace-files','workspace-files',false,10485760,array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf']) on conflict(id) do nothing;
create policy workspace_files_read on storage.objects for select to authenticated using(bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy workspace_files_upload on storage.objects for insert to authenticated with check(bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy workspace_files_delete on storage.objects for delete to authenticated using(bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

grant usage on schema public to anon,authenticated;
grant select on public.listings to anon;
grant select,insert,update,delete on public.profiles,public.workspaces,public.workspace_members,public.workspace_invites,public.listings,public.saved_items,public.enquiries,public.user_tasks to authenticated;
grant select on public.platform_admins to authenticated;
revoke all on function public.handle_new_user() from public;
revoke all on function public.is_workspace_member(uuid),public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_member(uuid),public.is_workspace_owner(uuid) to anon,authenticated;
commit;
