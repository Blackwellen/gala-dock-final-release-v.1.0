-- Data Retention Schedule (/data-retention): security and sign-in logs are kept for 12 months (UK GDPR Art. 32 / storage limitation).
-- Account erasure (14-day grace) and message redaction are handled by erase_user_data / the privacy-deletions job (202610270008).
-- Break-glass records are handled by bg_purge (202610270001). Financial, booking and case records are kept 6 years and are not touched here.
create or replace function public.retention_purge_security_logs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer;
begin
  delete from public.audit_events where (event like 'auth.%' or event like 'mfa.%') and created_at < now() - interval '12 months';
  get diagnostics a = row_count;
  delete from auth.audit_log_entries where created_at < now() - interval '12 months';
  get diagnostics b = row_count;
  if a + b > 0 then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'privacy.retention_purged', jsonb_build_object('security_audit_events', a, 'auth_log_entries', b, 'older_than', '12 months'));
  end if;
  return jsonb_build_object('security_audit_events', a, 'auth_log_entries', b);
end $$;
revoke all on function public.retention_purge_security_logs() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'retention-security-logs';
select cron.schedule('retention-security-logs', '45 3 2 * *', 'select public.retention_purge_security_logs()');
