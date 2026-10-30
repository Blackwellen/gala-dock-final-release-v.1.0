-- Q08 (lane C) — Expiry monitoring through the Q03 job queue (no browser timers) and Q05 notify().
--   trust.expiry_daily (db runtime, enqueued 02:15 daily with a per-day dedupe key; run by foundation-db-jobs):
--     1. verified documents past expires_on → expired (audit trust.document_expired → outbox); eligibility refresh holds listings;
--     2. verified identity/business checks past expires_at → expired (guarded machine);
--     3. reminders at trust_policy.reminder_days (30/14/7/1) before expiry → notify() owners/managers once per threshold
--        (dedupe key) + provider.document_expiring audit/outbox;
--     4. time-boxed enforcement actions past ends_at → expired (lifts holds via the refresh trigger).
--   Idempotent: re-running the same day changes nothing and sends nothing new.

create or replace function public.trust_notify_workspace(p_workspace uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare u uuid; n integer := 0;
begin
  for u in select w.owner_id from public.workspaces w where w.id = p_workspace and w.owner_id is not null
           union select m.user_id from public.workspace_members m where m.workspace_id = p_workspace and m.status = 'active' and m.role in ('owner','manager') loop
    perform public.notify(u, p_kind, p_title, p_body, p_link, case when p_dedupe is null then null else p_dedupe || ':' || u end);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.job_trust_expiry_daily(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d record; c record; a record; pol public.trust_policy; expired_docs integer := 0; expired_checks integer := 0; reminders integer := 0; lifted integer := 0; label text; thr integer;
begin
  select * into pol from public.trust_policy limit 1;
  -- 1. Lapsed documents.
  for d in update public.provider_documents set status = 'expired', expired_at = now()
           where status = 'verified' and expires_on < current_date returning id, workspace_id, credential_key, expires_on loop
    expired_docs := expired_docs + 1;
    select t.label into label from public.credential_types t where t.key = d.credential_key;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', d.workspace_id, 'trust.document_expired',
      jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'expires_on', d.expires_on));
    perform public.trust_notify_workspace(d.workspace_id, 'trust_document_expired', coalesce(label, 'A document') || ' has expired',
      public.trust_reason_text(coalesce(label, 'A document'), 'expired', d.expires_on, null), '/provider/settings#credentials', 'trust.expired:' || d.id);
  end loop;
  -- 2. Lapsed identity/business checks.
  for c in select id from public.verification_checks where status = 'verified' and expires_at is not null and expires_at < now() for update skip locked loop
    perform public.verification_step(c.id, 'expired', null, 'system', 'document_expired', 'Verification evidence passed its expiry date');
    expired_checks := expired_checks + 1;
  end loop;
  -- 3. Reminders (largest threshold first so a late first run sends one reminder, not four).
  for d in select x.id, x.workspace_id, x.credential_key, x.expires_on, x.last_reminder_days, (x.expires_on - current_date) as left_days
           from public.provider_documents x
           where x.status = 'verified' and x.expires_on is not null and x.expires_on >= current_date
             and (x.expires_on - current_date) <= (select max(v) from unnest(pol.reminder_days) v)
             and not exists (select 1 from public.provider_documents r where r.renewal_of = x.id and r.status in ('submitted','in_review','verified')) loop
    select min(v) into thr from unnest(pol.reminder_days) v where v >= d.left_days;
    if thr is null or (d.last_reminder_days is not null and d.last_reminder_days <= thr) then continue; end if;
    select t.label into label from public.credential_types t where t.key = d.credential_key;
    perform public.trust_notify_workspace(d.workspace_id, 'trust_document_expiring', coalesce(label, 'A document') || ' expires in ' || d.left_days || ' day' || case when d.left_days = 1 then '' else 's' end,
      'Upload the renewed document before ' || to_char(d.expires_on, 'FMDD Mon YYYY') || ' so your listings stay visible.', '/provider/settings#credentials',
      'trust.expiring:' || d.id || ':' || thr);
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', d.workspace_id, 'provider.document_expiring',
      jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'expires_on', d.expires_on, 'days_left', d.left_days, 'threshold', thr));
    update public.provider_documents set last_reminder_days = thr where id = d.id;
    reminders := reminders + 1;
  end loop;
  -- 4. Time-boxed enforcement that has run its course.
  for a in update public.enforcement_actions set status = 'expired', updated_at = now() where status = 'active' and ends_at is not null and ends_at <= now() returning id loop
    lifted := lifted + 1;
  end loop;
  return jsonb_build_object('expired_documents', expired_docs, 'expired_checks', expired_checks, 'reminders', reminders, 'enforcement_expired', lifted);
end $$;

revoke all on function public.trust_notify_workspace(uuid, text, text, text, text, text), public.job_trust_expiry_daily(public.job_queue) from public, anon, authenticated;
grant execute on function public.trust_notify_workspace(uuid, text, text, text, text, text), public.job_trust_expiry_daily(public.job_queue) to service_role;

insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('trust.expiry_daily', 'db', 'public.job_trust_expiry_daily', 5, '{60,300,1800,7200,21600}', 300, 'Q08: expire lapsed provider evidence, send expiry reminders, refresh eligibility/badges.')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, backoff_seconds = excluded.backoff_seconds,
  lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();

select cron.unschedule(jobid) from cron.job where jobname = 'trust-expiry-daily';
select cron.schedule('trust-expiry-daily', '15 2 * * *', $$select public.enqueue_job('trust.expiry_daily', '{}'::jsonb, 'trust.expiry_daily:' || current_date::text)$$);
