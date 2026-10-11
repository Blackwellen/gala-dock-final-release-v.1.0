-- Storage object replication to Cloudflare R2 (release spec §92, §132). Database backups don't include storage objects; this keeps a
-- copy of every object under r2://<bucket>/storage/<bucket>/<path>, refreshed when the object changes. Copies of deleted objects are
-- kept for 35 days (point-in-time safety) and then removed.
create table if not exists public.storage_backups (
  bucket text not null, name text not null,
  object_updated_at timestamptz, size bigint,
  r2_etag text, backed_up_at timestamptz not null default now(),
  source_deleted_at timestamptz,
  primary key (bucket, name)
);
alter table public.storage_backups enable row level security;   -- service role only

create or replace function public.storage_backup_candidates(p_limit integer default 100) returns table (bucket text, name text, updated_at timestamptz, size bigint, mimetype text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce(o.updated_at, o.created_at), coalesce((o.metadata ->> 'size')::bigint, 0), coalesce(o.metadata ->> 'mimetype', 'application/octet-stream')
  from storage.objects o left join public.storage_backups b on b.bucket = o.bucket_id and b.name = o.name
  where o.name not like '%/.emptyFolderPlaceholder' and (b.name is null or coalesce(o.updated_at, o.created_at) > b.object_updated_at)
  order by coalesce(o.updated_at, o.created_at) limit greatest(1, least(p_limit, 500));
$$;
-- Marks copies whose source object is gone; returns copies past the 35-day keep window for deletion from R2.
create or replace function public.storage_backup_expired(p_limit integer default 200) returns table (bucket text, name text)
language plpgsql security definer set search_path = '' as $$
begin
  update public.storage_backups b set source_deleted_at = now()
  where b.source_deleted_at is null and not exists (select 1 from storage.objects o where o.bucket_id = b.bucket and o.name = b.name);
  return query select b.bucket, b.name from public.storage_backups b where b.source_deleted_at < now() - interval '35 days' limit greatest(1, least(p_limit, 1000));
end $$;
revoke all on function public.storage_backup_candidates(integer), public.storage_backup_expired(integer) from public, anon, authenticated;
grant execute on function public.storage_backup_candidates(integer), public.storage_backup_expired(integer) to service_role;

select cron.unschedule('storage-backup') where exists (select 1 from cron.job where jobname = 'storage-backup');
select cron.schedule('storage-backup', '*/15 * * * *', $$select public.dispatch_worker('/api/cron/storage-backup')$$);
