-- Q04 Files, R2 & Malware (cards 185–188). Additive and backward-compatible with the deployed code:
--  • storage_attribution (one row per stored object since 202610270020) becomes the canonical file-metadata record: class, real
--    (sniffed) MIME, declared MIME, sha256, size, display name, AV verdict, quarantine, retention, legal hold, derivative lineage.
--  • file_access_decision(): download / publish gate (mirror of src/lib/files/policy.ts accessDecision). Private documents and
--    sensitive files fail closed until the ClamAV gateway returns clean; sanitised, magic-byte-verified images are usable when the
--    gateway is not configured (recorded av_verdict = 'not_scanned').
--  • Async work through job_queue: files.scan (app), files.derive (app, thumbnails), files.delete_object (app),
--    files.retention_sweep (db, daily), files.meter_snapshot (db, daily → storage_usage_snapshots).
-- Existing scan_status values are preserved; 'quarantined' is added. Nothing here is anon-callable.

alter table public.storage_attribution drop constraint if exists storage_attribution_scan_status_check;
alter table public.storage_attribution add constraint storage_attribution_scan_status_check
  check (scan_status in ('pending','clean','sanitised','infected','skipped','error','quarantined'));

alter table public.storage_attribution
  add column if not exists file_class text not null default 'legacy',
  add column if not exists av_verdict text not null default 'pending',
  add column if not exists sniffed_mime text,
  add column if not exists declared_mime text,
  add column if not exists sha256 text,
  add column if not exists size_bytes bigint,
  add column if not exists display_name text,
  add column if not exists quarantined_at timestamptz,
  add column if not exists quarantine_reason text,
  add column if not exists released_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists derived_from_bucket text,
  add column if not exists derived_from_name text,
  add column if not exists variant text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'storage_attribution_file_class_check') then
    alter table public.storage_attribution add constraint storage_attribution_file_class_check
      check (file_class in ('public_media','private_image','private_document','sensitive','derivative','legacy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storage_attribution_av_verdict_check') then
    alter table public.storage_attribution add constraint storage_attribution_av_verdict_check check (av_verdict in ('pending','clean','infected','not_scanned'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storage_attribution_sha256_check') then
    alter table public.storage_attribution add constraint storage_attribution_sha256_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storage_attribution_public_class_check') then
    -- A public bucket can only ever hold public_media / derivative / legacy rows; private classes can never be public.
    alter table public.storage_attribution add constraint storage_attribution_public_class_check
      check (bucket not in ('event-media','listing-media','avatars') or file_class in ('public_media','derivative','legacy'));
  end if;
end $$;
-- Legacy backfill (metadata only): the scan job already sanitised these; with no gateway their AV verdict is not_scanned.
update public.storage_attribution set av_verdict = case scan_status when 'infected' then 'infected' when 'clean' then 'clean'
    when 'sanitised' then case when scan_detail = 'scanner_not_configured' then 'not_scanned' else 'clean' end
    when 'skipped' then 'not_scanned' else av_verdict end
 where av_verdict = 'pending' and scan_status in ('infected','clean','sanitised','skipped');
create index if not exists storage_attribution_retention_idx on public.storage_attribution(retention_until) where retention_until is not null and deleted_at is null and not legal_hold;
create index if not exists storage_attribution_quarantine_idx on public.storage_attribution(quarantined_at) where scan_status = 'quarantined';

-- Download / publish gate. Returns 'ok' | 'deleted' | 'infected' | 'quarantined' | 'pending' | 'unknown'.
create or replace function public.file_access_decision(p_bucket text, p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when a.deleted_at is not null then 'deleted'
      when a.av_verdict = 'infected' or a.scan_status = 'infected' then 'infected'
      when a.scan_status = 'quarantined' then 'quarantined'
      when a.av_verdict = 'clean' then 'ok'
      when a.av_verdict = 'pending' or a.scan_status in ('pending','error') then
        case when c.cls in ('private_document','sensitive') then 'quarantined' else 'pending' end
      when c.cls in ('private_document','sensitive') then 'quarantined'
      else 'ok' end
    from public.storage_attribution a
    cross join lateral (select case when a.file_class <> 'legacy' then a.file_class
                                    when coalesce(a.sniffed_mime, a.declared_mime, '') like 'image/%' or a.name ~* '\.(png|jpe?g|webp|gif)$' then 'private_image'
                                    else 'private_document' end cls) c
    where a.bucket = p_bucket and a.name = p_name), 'unknown');
$$;

-- Server-recorded upload facts (called by the upload routes with the service role, after the object is stored).
create or replace function public.file_register(p_bucket text, p_name text, p_class text, p_sniffed text, p_declared text, p_sha256 text, p_size bigint,
  p_display_name text, p_av text, p_quarantine boolean default false, p_reason text default null, p_retention_days integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.storage_attribution;
begin
  if p_class not in ('public_media','private_image','private_document','sensitive','derivative') then raise exception 'invalid_file_class' using errcode = '22023'; end if;
  if p_av not in ('pending','clean','infected','not_scanned') then raise exception 'invalid_av_verdict' using errcode = '22023'; end if;
  update public.storage_attribution set file_class = p_class, sniffed_mime = p_sniffed, declared_mime = left(p_declared, 120), sha256 = p_sha256,
         size_bytes = p_size, display_name = left(p_display_name, 120), av_verdict = p_av,
         scan_status = case when p_av = 'infected' then 'infected' when p_quarantine then 'quarantined' when p_av = 'clean' then 'clean' else 'sanitised' end,
         scan_detail = case when p_av = 'not_scanned' then 'scanner_not_configured' else scan_detail end,
         scanned_at = case when p_av in ('clean','infected','not_scanned') then now() else scanned_at end,
         quarantined_at = case when p_quarantine then now() end, quarantine_reason = case when p_quarantine then left(coalesce(p_reason, 'awaiting_scan'), 200) end,
         retention_until = case when p_retention_days is not null then now() + make_interval(days => p_retention_days) else retention_until end
   where bucket = p_bucket and name = p_name returning * into r;
  if r.bucket is null then raise exception 'file_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('bucket', r.bucket, 'name', r.name, 'class', r.file_class, 'av', r.av_verdict, 'scan', r.scan_status, 'decision', public.file_access_decision(r.bucket, r.name));
end $$;

-- Verdict from the scan job / gateway. Clean releases quarantine; infected keeps the row (object removed by the caller) for audit.
create or replace function public.file_record_verdict(p_bucket text, p_name text, p_verdict text, p_detail text default null, p_sha256 text default null) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_verdict not in ('clean','infected','not_scanned') then raise exception 'invalid_av_verdict' using errcode = '22023'; end if;
  update public.storage_attribution set av_verdict = p_verdict, scanned_at = now(), scan_detail = left(p_detail, 200), sha256 = coalesce(p_sha256, sha256),
         scan_status = case p_verdict when 'infected' then 'infected' when 'clean' then 'clean' else case when scan_status = 'quarantined' then 'quarantined' else 'sanitised' end end,
         released_at = case when p_verdict = 'clean' and scan_status = 'quarantined' then now() else released_at end,
         quarantined_at = case when p_verdict = 'clean' then null else quarantined_at end
   where bucket = p_bucket and name = p_name;
  if not found then raise exception 'file_not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'file.verdict', jsonb_build_object('bucket', p_bucket, 'name', p_name, 'verdict', p_verdict, 'detail', left(p_detail, 200)));
  return public.file_access_decision(p_bucket, p_name);
end $$;

create or replace function public.file_quarantine(p_bucket text, p_name text, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.storage_attribution set scan_status = 'quarantined', quarantined_at = now(), quarantine_reason = left(p_reason, 200) where bucket = p_bucket and name = p_name and deleted_at is null;
  if found then insert into public.audit_events(actor_type, event, metadata) values ('system', 'file.quarantined', jsonb_build_object('bucket', p_bucket, 'name', p_name, 'reason', left(p_reason, 200))); end if;
  return found;
end $$;

-- Retention / deletion (card 188). Legal hold always wins. The db sweep enqueues one app job per expired object; the app job removes
-- the object through the Storage API (direct SQL deletes on storage.objects are not allowed) and stamps deleted_at.
create or replace function public.job_files_retention_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  for r in select bucket, name from public.storage_attribution where retention_until < now() and deleted_at is null and not legal_hold order by retention_until limit 500 loop
    perform public.enqueue_job(p_kind => 'files.delete_object', p_payload => jsonb_build_object('bucket', r.bucket, 'name', r.name, 'reason', 'retention'),
      p_dedupe_key => 'files.delete_object:' || r.bucket || '/' || r.name);
    n := n + 1;
  end loop;
  return jsonb_build_object('enqueued', n);
end $$;
create or replace function public.file_mark_deleted(p_bucket text, p_name text, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.storage_attribution set deleted_at = now() where bucket = p_bucket and name = p_name and deleted_at is null and not legal_hold;
  if found then insert into public.audit_events(actor_type, event, metadata) values ('system', 'file.deleted', jsonb_build_object('bucket', p_bucket, 'name', p_name, 'reason', left(p_reason, 80))); end if;
  return found;
end $$;

-- Storage metering (card 187 / Q28 storage usage): one row per workspace (or personal owner) per day, from live object sizes.
create table if not exists public.storage_usage_snapshots (
  day date not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid,
  bytes bigint not null default 0,
  files integer not null default 0,
  quarantined integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists storage_usage_snapshots_key on public.storage_usage_snapshots(day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.storage_usage_snapshots enable row level security;
revoke all on table public.storage_usage_snapshots from public, anon, authenticated;
grant select on table public.storage_usage_snapshots to authenticated;
grant all on table public.storage_usage_snapshots to service_role;
drop policy if exists storage_usage_snapshots_read on public.storage_usage_snapshots;
create policy storage_usage_snapshots_read on public.storage_usage_snapshots for select to authenticated
  using ((workspace_id is not null and public.is_workspace_member(workspace_id)) or (workspace_id is null and user_id = (select auth.uid())));

create or replace function public.job_files_meter_snapshot(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d date := coalesce((p_job.payload ->> 'day')::date, (now() at time zone 'utc')::date); n integer;
begin
  insert into public.storage_usage_snapshots(day, workspace_id, user_id, bytes, files, quarantined)
  select d, a.workspace_id, case when a.workspace_id is null then a.user_id end,
         coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0), count(*), count(*) filter (where a.scan_status = 'quarantined')
    from public.storage_attribution a join storage.objects o on o.bucket_id = a.bucket and o.name = a.name
   where a.deleted_at is null and (a.workspace_id is not null or a.user_id is not null)
   group by a.workspace_id, case when a.workspace_id is null then a.user_id end
  on conflict (day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set bytes = excluded.bytes, files = excluded.files, quarantined = excluded.quarantined, created_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('day', d, 'rows', n);
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('files.scan', 'app', null, 6, 'Q04: sanitise + magic-byte check + ClamAV scan of one stored object; records the verdict, removes infected objects'),
  ('files.derive', 'app', null, 3, 'Q04: thumbnail derivative (re-encoded WebP, metadata-free) for a public_media image'),
  ('files.delete_object', 'app', null, 5, 'Q04: remove one object through the Storage API and stamp deleted_at (retention / erasure)'),
  ('files.retention_sweep', 'db', 'public.job_files_retention_sweep', 3, 'Q04: daily; enqueue files.delete_object for objects past retention (legal hold excluded)'),
  ('files.meter_snapshot', 'db', 'public.job_files_meter_snapshot', 3, 'Q04: daily storage usage snapshot per workspace / personal owner')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();

select cron.unschedule('files-retention-sweep') where exists (select 1 from cron.job where jobname = 'files-retention-sweep');
select cron.schedule('files-retention-sweep', '25 3 * * *',
  $$select public.enqueue_job(p_kind => 'files.retention_sweep', p_payload => '{}'::jsonb, p_dedupe_key => 'files.retention_sweep:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);
select cron.unschedule('files-meter-snapshot') where exists (select 1 from cron.job where jobname = 'files-meter-snapshot');
select cron.schedule('files-meter-snapshot', '35 0 * * *',
  $$select public.enqueue_job(p_kind => 'files.meter_snapshot', p_payload => '{}'::jsonb, p_dedupe_key => 'files.meter_snapshot:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

-- Grants (Q01): every function here is service-only.
revoke all on function public.file_access_decision(text, text) from public, anon, authenticated;
revoke all on function public.file_register(text, text, text, text, text, text, bigint, text, text, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.file_record_verdict(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.file_quarantine(text, text, text) from public, anon, authenticated;
revoke all on function public.file_mark_deleted(text, text, text) from public, anon, authenticated;
revoke all on function public.job_files_retention_sweep(public.job_queue) from public, anon, authenticated;
revoke all on function public.job_files_meter_snapshot(public.job_queue) from public, anon, authenticated;
grant execute on function public.file_access_decision(text, text), public.file_register(text, text, text, text, text, text, bigint, text, text, boolean, text, integer),
  public.file_record_verdict(text, text, text, text, text), public.file_quarantine(text, text, text), public.file_mark_deleted(text, text, text),
  public.job_files_retention_sweep(public.job_queue), public.job_files_meter_snapshot(public.job_queue) to service_role;
