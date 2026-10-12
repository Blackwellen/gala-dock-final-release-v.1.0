-- Nightly logical database backup to Cloudflare R2 (EU), run entirely inside Supabase: pg_cron → pg_net → Edge Function "db-backup"
-- (supabase/functions/db-backup). Replaces the need for PITR at this stage: RPO 24 h for data, schema from git migrations.
-- Vault secrets: db_backup_secret (shared with the function's DB_BACKUP_SECRET) and db_backup_url (the function URL).
begin;

create table if not exists public.db_backup_runs (
  run_date date primary key,
  status text not null default 'running' check (status in ('running','partial','complete','failed')),
  attempts integer not null default 1,
  tables integer, rows bigint, bytes bigint,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.db_backup_tables (
  run_date date not null references public.db_backup_runs(run_date) on delete cascade,
  schema_name text not null, table_name text not null,
  rows bigint not null, bytes bigint not null,
  uploaded_at timestamptz not null default now(),
  primary key (run_date, schema_name, table_name)
);
alter table public.db_backup_runs enable row level security;
alter table public.db_backup_tables enable row level security;
drop policy if exists db_backup_runs_admin_read on public.db_backup_runs;
create policy db_backup_runs_admin_read on public.db_backup_runs for select using (public.has_admin_permission('settings') or public.has_admin_permission('agent_ops'));
drop policy if exists db_backup_tables_admin_read on public.db_backup_tables;
create policy db_backup_tables_admin_read on public.db_backup_tables for select using (public.has_admin_permission('settings') or public.has_admin_permission('agent_ops'));
revoke insert, update, delete on public.db_backup_runs, public.db_backup_tables from anon, authenticated;

create or replace function public.dispatch_db_backup() returns bigint
language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  -- Nothing to do once today's backup is complete.
  if exists (select 1 from public.db_backup_runs where run_date = current_date and status = 'complete') then return null; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'db_backup_secret';
  select decrypted_secret into url from vault.decrypted_secrets where name = 'db_backup_url';
  if secret is null or url is null then return null; end if;
  return net.http_post(url := url, headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
end $$;
revoke all on function public.dispatch_db_backup() from public, anon, authenticated;

-- 02:00–03:50 UTC every 10 minutes: the first run normally completes; later runs resume a partial backup or are no-ops.
select cron.unschedule(jobid) from cron.job where jobname = 'db-backup';
select cron.schedule('db-backup', '*/10 2-3 * * *', 'select public.dispatch_db_backup()');

commit;
