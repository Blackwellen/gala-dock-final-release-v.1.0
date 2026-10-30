-- Q04 fix-up: legacy rows (pre-Q04) fail closed only when they are documents (PDF). SVG elements, GIF and brand fonts in
-- workspace-files keep the image rules (sanitised by the scan sweep; usable with av_verdict 'not_scanned'). Replaces the
-- function body from 202610291017; signature, grants and behaviour for classified rows are unchanged.
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
                                    when coalesce(a.sniffed_mime, a.declared_mime, '') = 'application/pdf' or a.name ~* '\.pdf$' then 'private_document'
                                    else 'private_image' end cls) c
    where a.bucket = p_bucket and a.name = p_name), 'unknown');
$$;
revoke all on function public.file_access_decision(text, text) from public, anon, authenticated;
grant execute on function public.file_access_decision(text, text) to service_role;
