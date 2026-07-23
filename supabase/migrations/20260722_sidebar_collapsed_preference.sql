-- Persist the floating shell's sidebar collapse preference per user.
alter table public.profiles
  add column if not exists sidebar_collapsed boolean not null default false;
