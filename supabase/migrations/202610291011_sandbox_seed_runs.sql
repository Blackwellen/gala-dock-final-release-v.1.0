-- Q38 · Sandbox tenants (card 282.C): an auditable record of every demo seed run, and ONE predicate that tells reporting which
-- workspaces are demo/showcase tenants so demo data can be excluded from real tenant reporting and commerce metrics.
-- Additive and backward-compatible: a new table (service role only) and a new stable function; nothing existing changes.

create table if not exists public.sandbox_seed_runs (
  id uuid primary key default gen_random_uuid(),
  seed text not null check (seed ~ '^[a-z0-9_.-]{2,64}$'),
  version text not null default '1',
  -- Demo seeding only ever talks to Stripe test mode; a live run is unrepresentable.
  stripe_mode text not null default 'test' check (stripe_mode in ('test', 'none')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  steps text[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  error text,
  actor text not null default 'script',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
create index if not exists sandbox_seed_runs_seed_started_idx on public.sandbox_seed_runs (seed, started_at desc);

alter table public.sandbox_seed_runs enable row level security;
-- No policies: only trusted scripts/workers (service role) read or write seed history.
revoke all on table public.sandbox_seed_runs from public, anon, authenticated;
grant select, insert, update on table public.sandbox_seed_runs to service_role;

-- Demo/showcase tenant predicate for reporting (282, exit gate "demo data cannot appear in real tenant reporting/commerce").
-- A workspace is demo when it is a user-created demo workspace (settings.demo), a seeded marketplace showcase seller
-- (settings.demo_showcase), or owned by an identity on a reserved, never-deliverable domain (example.com/.test/...).
create or replace function public.is_demo_workspace(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce((w.settings ->> 'demo')::boolean, false)
        or coalesce((w.settings ->> 'demo_showcase')::boolean, false)
        or coalesce(lower(split_part(u.email, '@', 2)) ~ '(^|\.)(test|example|invalid|localhost)$|^example\.(com|org|net)$', false)
    from public.workspaces w left join auth.users u on u.id = w.owner_id
    where w.id = p_workspace), false);
$$;
revoke all on function public.is_demo_workspace(uuid) from public, anon, authenticated;
grant execute on function public.is_demo_workspace(uuid) to service_role;

comment on table public.sandbox_seed_runs is 'Q38 demo seed run history (card 282). Service role only.';
comment on function public.is_demo_workspace(uuid) is 'True for demo/showcase tenants; reporting must exclude these (card 282).';
