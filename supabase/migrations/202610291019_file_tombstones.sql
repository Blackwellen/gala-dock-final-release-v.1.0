-- Q04: keep an audit record when a classified or blocked object is removed. storage_attribution rows are still deleted with
-- their object (unchanged semantics: usage, quota, re-upload to the same key), but the facts move to file_tombstones first:
-- class, real MIME, sha256, AV verdict, reason and who/when. Service-only (no client grants). Additive.
create table if not exists public.file_tombstones (
  id bigint generated always as identity primary key,
  bucket text not null, name text not null,
  workspace_id uuid, user_id uuid,
  file_class text, sniffed_mime text, sha256 text, av_verdict text, scan_status text, scan_detail text,
  reason text, deleted_at timestamptz not null default now()
);
create index if not exists file_tombstones_obj_idx on public.file_tombstones(bucket, name);
alter table public.file_tombstones enable row level security;
revoke all on table public.file_tombstones from public, anon, authenticated;
grant all on table public.file_tombstones to service_role;

create or replace function public.trg_storage_unattribute() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.file_tombstones(bucket, name, workspace_id, user_id, file_class, sniffed_mime, sha256, av_verdict, scan_status, scan_detail, reason)
  select a.bucket, a.name, a.workspace_id, a.user_id, a.file_class, a.sniffed_mime, a.sha256, a.av_verdict, a.scan_status, a.scan_detail,
         case when a.av_verdict = 'infected' or a.scan_status = 'infected' then 'blocked' when a.retention_until < now() then 'retention' else 'deleted' end
    from public.storage_attribution a
   where a.bucket = old.bucket_id and a.name = old.name and (a.file_class <> 'legacy' or a.av_verdict = 'infected' or a.scan_status in ('infected','quarantined'));
  delete from public.storage_attribution where bucket = old.bucket_id and name = old.name;
  return old;
end $$;
revoke all on function public.trg_storage_unattribute() from public, anon, authenticated;
