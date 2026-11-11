-- Playbook §7 enterprise bar: a rate budget on every AI provider deployment. Every attempt is counted (before the call, success or
-- not), counts persist in the database (not process memory), a spent provider is skipped (llm.ts tries the next deployment, else
-- a plain "busy" message — never a queued retry), and platform admins get one alert at 80 % per window. Azure only (owner).
create table if not exists public.ai_provider_budgets (
  provider text primary key check (provider ~ '^azure:[a-z0-9._-]+$'),
  daily_limit integer not null default 20000 check (daily_limit > 0),
  window_start date not null default (now() at time zone 'utc')::date,
  used integer not null default 0 check (used >= 0),
  alerted_80_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_budgets enable row level security;
drop policy if exists ai_provider_budgets_admin on public.ai_provider_budgets;
create policy ai_provider_budgets_admin on public.ai_provider_budgets for select to authenticated using (public.is_platform_admin());
revoke all on public.ai_provider_budgets from anon, authenticated;
grant select on public.ai_provider_budgets to authenticated;

/** Counts one attempt against the provider's daily budget. false = spent (caller skips this provider). Service role only. */
create or replace function public.ai_provider_attempt(p_provider text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare b public.ai_provider_budgets; today date := (now() at time zone 'utc')::date;
begin
  if p_provider !~ '^azure:[a-z0-9._-]+$' then raise exception 'invalid_provider' using errcode = '22023'; end if;
  insert into public.ai_provider_budgets(provider) values (p_provider) on conflict (provider) do nothing;
  select * into b from public.ai_provider_budgets where provider = p_provider for update;
  if b.window_start <> today then
    update public.ai_provider_budgets set window_start = today, used = 0, alerted_80_at = null, updated_at = now() where provider = p_provider returning * into b;
  end if;
  if b.used >= b.daily_limit then return false; end if;
  update public.ai_provider_budgets set used = used + 1, updated_at = now() where provider = p_provider returning * into b;
  if b.alerted_80_at is null and b.used * 10 >= b.daily_limit * 8 then
    update public.ai_provider_budgets set alerted_80_at = now() where provider = p_provider;
    insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
      select pa.user_id, 'admin.ops_alert', 'AI provider budget at 80%', p_provider || ' has used ' || b.used || ' of ' || b.daily_limit || ' calls today. At 100% it is skipped until midnight UTC.',
             '/admin/health', 'ai-budget-80:' || p_provider || ':' || today || ':' || pa.user_id
        from public.platform_admins pa
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'ai.provider_budget_alert', jsonb_build_object('provider', p_provider, 'used', b.used, 'limit', b.daily_limit));
  end if;
  return true;
end $$;
revoke all on function public.ai_provider_attempt(text) from public, anon, authenticated;
