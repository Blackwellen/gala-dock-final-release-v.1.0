-- bg_expire is run by the break-glass-expire cron job (as postgres) and from inside the admin_* RPCs (definer context).
-- Supabase's default privileges grant EXECUTE on new public functions to authenticated, so revoke it explicitly.
revoke all on function public.bg_expire() from public, anon, authenticated;
