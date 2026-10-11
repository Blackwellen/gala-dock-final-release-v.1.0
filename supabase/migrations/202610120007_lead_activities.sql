begin;
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null default 'note' check (kind in ('enquiry','email','call','note','task','stage','proposal','meeting')),
  title text not null check (length(title) between 1 and 200),
  detail text not null default '' check (length(detail) <= 2000),
  actor_name text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id, created_at desc);
alter table public.lead_activities enable row level security;
create policy lead_activities_rw on public.lead_activities for all to authenticated
  using (exists(select 1 from public.leads l where l.id = lead_id and public.is_workspace_member(l.workspace_id)))
  with check (exists(select 1 from public.leads l where l.id = lead_id and public.is_workspace_member(l.workspace_id)));
grant select, insert on public.lead_activities to authenticated;
commit;
