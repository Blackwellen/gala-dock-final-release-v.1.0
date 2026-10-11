-- Admin health page (§137): scheduled-job status for admins with settings or agent_ops, without using the service role in pages.
create or replace function public.admin_cron_job_status() returns table (job text, schedule text, active boolean, last_run timestamptz, last_status text, failures_24h bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('settings') or public.has_admin_permission('agent_ops')) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.cron_job_status();
end $$;
revoke all on function public.admin_cron_job_status() from public, anon;
grant execute on function public.admin_cron_job_status() to authenticated;
