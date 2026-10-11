-- Phase 3 · Published plan catalogue for workspaces (plans + payout schedule only; the rest of platform_settings stays admin-only).
begin;
create or replace function public.plan_catalog() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plans', coalesce(value->'plans', '{}'), 'payout_schedule', coalesce(value->>'payout_schedule', 'weekly'))
  from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1
$$;
revoke all on function public.plan_catalog() from public, anon;
grant execute on function public.plan_catalog() to authenticated;
commit;
