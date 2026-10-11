-- Per-user recently viewed items (events / listings) for Saved and Discover. Users only see their own rows.
create table if not exists public.recently_viewed (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (item_key ~ '^(event|listing):[0-9a-f-]{36}$'),
  viewed_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
create index if not exists recently_viewed_user_idx on public.recently_viewed(user_id, viewed_at desc);
alter table public.recently_viewed enable row level security;
drop policy if exists recently_viewed_own on public.recently_viewed;
create policy recently_viewed_own on public.recently_viewed for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.recently_viewed to authenticated;
revoke all on public.recently_viewed from anon;
