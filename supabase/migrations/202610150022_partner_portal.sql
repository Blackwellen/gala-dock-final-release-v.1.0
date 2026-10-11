-- PART-001 Partner portal: referred accounts, commission ledger, monthly statements and tracked content per partner.
-- A partner (partners.user_id = auth.uid(), policy partners_read already exists) sees only their own rows;
-- platform admins with the 'partners' permission can read everything. Rows are written by platform jobs (service role).
begin;

create or replace function public.owns_partner(p_partner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.partners p where p.id = p_partner and p.user_id = (select auth.uid()));
$$;
revoke all on function public.owns_partner(uuid) from public, anon;
grant execute on function public.owns_partner(uuid) to authenticated;

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  name text not null check (length(name) between 1 and 160),
  kind text not null check (kind in ('organiser','venue','supplier')),
  status text not null default 'trial' check (status in ('pending','trial','active','churned')),
  signed_up_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists partner_referrals_partner_idx on public.partner_referrals(partner_id, signed_up_at desc);

create table if not exists public.partner_statements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  period_start date not null check (extract(day from period_start) = 1),
  eligible_revenue numeric(12,2) not null default 0,
  commission numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open','pending','paid','on_hold')),
  payout_due date,
  paid_at timestamptz,
  reference text,
  unique (partner_id, period_start)
);

-- Commission ledger: one row per eligible platform revenue event from a referred account.
create table if not exists public.partner_earnings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  referral_id uuid references public.partner_referrals(id) on delete set null,
  statement_id uuid references public.partner_statements(id) on delete set null,
  occurred_at timestamptz not null,
  eligible_revenue numeric(12,2) not null,
  commission numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','cleared','paid','reversed'))
);
create index if not exists partner_earnings_partner_idx on public.partner_earnings(partner_id, occurred_at desc);

-- Tracked creative / links a partner promotes (click and signup counters maintained by the attribution job).
create table if not exists public.partner_content (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'banner' check (kind in ('banner','video','image','email','widget')),
  image text not null default '',
  clicks integer not null default 0 check (clicks >= 0),
  signups integer not null default 0 check (signups >= 0),
  created_at timestamptz not null default now()
);
create index if not exists partner_content_partner_idx on public.partner_content(partner_id);

do $$ declare t text; begin
  foreach t in array array['partner_referrals','partner_statements','partner_earnings','partner_content'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_read on public.%1$I', t);
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.owns_partner(partner_id) or public.has_admin_permission(''partners''))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

commit;
