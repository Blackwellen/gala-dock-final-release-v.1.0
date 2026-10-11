-- In-product guided tours (release spec §86): per-user progress so tours resume where people left them and don't repeat once finished.
create table if not exists public.user_tours (
  user_id uuid not null references auth.users(id) on delete cascade,
  tour_key text not null check (length(tour_key) <= 60),
  step integer not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','completed','skipped')),
  updated_at timestamptz not null default now(),
  primary key (user_id, tour_key)
);
alter table public.user_tours enable row level security;
drop policy if exists user_tours_own on public.user_tours;
create policy user_tours_own on public.user_tours for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_tours to authenticated;
