-- Background dispatch: pg_cron → pg_net → app workers, authenticated with CRON_SECRET read from Supabase Vault at call time
-- (vault secret "cron_secret"; set once per environment, never committed). The app URL lives in vault secret "app_url".
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.dispatch_worker(p_path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  select decrypted_secret into url from vault.decrypted_secrets where name = 'app_url';
  if secret is null or url is null then return null; end if;
  return net.http_post(url := url || p_path, headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
end $$;
revoke all on function public.dispatch_worker(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('payments-worker', 'agent-worker');
select cron.schedule('payments-worker', '*/5 * * * *', $$select public.dispatch_worker('/api/cron/payments')$$);
select cron.schedule('agent-worker', '* * * * *', $$select public.dispatch_worker('/api/agent/worker')$$);
