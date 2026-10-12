-- Background sanitising + malware scanning for every stored object (release spec §74), covering uploads that go straight from the
-- browser to Storage. Upload routes already sanitise/scan inline; this catches everything else and re-checks when signatures update.
alter table public.storage_attribution add column if not exists scan_status text not null default 'pending' check (scan_status in ('pending','clean','sanitised','infected','skipped','error'));
alter table public.storage_attribution add column if not exists scanned_at timestamptz;
alter table public.storage_attribution add column if not exists scan_detail text;
create index if not exists storage_attribution_scan_idx on public.storage_attribution(created_at) where scan_status = 'pending';

create or replace function public.scan_candidates(p_limit integer default 50) returns table (bucket text, name text, mimetype text, size bigint, workspace_id uuid, user_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.bucket, a.name, coalesce(o.metadata ->> 'mimetype', 'application/octet-stream'), coalesce((o.metadata ->> 'size')::bigint, 0), a.workspace_id, a.user_id
  from public.storage_attribution a join storage.objects o on o.bucket_id = a.bucket and o.name = a.name
  where a.scan_status = 'pending' and coalesce((o.metadata ->> 'size')::bigint, 0) > 0 order by a.created_at limit greatest(1, least(p_limit, 200));
$$;
revoke all on function public.scan_candidates(integer) from public, anon, authenticated;
grant execute on function public.scan_candidates(integer) to service_role;

select cron.unschedule('scan-uploads') where exists (select 1 from cron.job where jobname = 'scan-uploads');
select cron.schedule('scan-uploads', '*/5 * * * *', $$select public.dispatch_worker('/api/cron/scan-uploads')$$);
