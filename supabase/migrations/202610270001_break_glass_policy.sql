-- Break-glass policy decisions by the Data Protection Officer (2026-10-11).
-- 1. Four-eyes approval for high-risk reasons (safeguarding, abuse, legal request) applies whenever at least one OTHER administrator holds
--    support.break_glass_conversation.read. While a single administrator holds it, there is nobody independent to approve, so requests are
--    granted on submission and marked `sole_holder` in the audit trail. Step-up MFA, case link, justification, time limit and per-conversation
--    logging apply in every case. Approval switches on automatically as soon as a second holder is added.
-- 2. Retention: grants, access logs and their audit rows are kept for 6 years after the grant ends, then deleted automatically
--    (Limitation Act 1980 s.5 claims period; UK GDPR Art. 5(1)(e) storage limitation and 5(2) accountability). See docs/legal/data-retention.md.
begin;

create or replace function public.admin_request_break_glass(p_case_type text, p_case uuid, p_reason text, p_justification text, p_conversations uuid[], p_minutes integer default 120)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare users uuid[]; ref text; g public.break_glass_grants;
  others integer := (select count(*) from public.platform_admins where user_id <> auth.uid() and 'support.break_glass_conversation.read' = any(permissions));
  high boolean := p_reason in ('safeguarding', 'legal_request', 'abuse') and others > 0;
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_justification, ''))) < 20 then raise exception 'justification_required' using errcode = '22023'; end if;
  if coalesce(array_length(p_conversations, 1), 0) = 0 or array_length(p_conversations, 1) > 20 then raise exception 'choose_conversations' using errcode = '22023'; end if;
  if p_case_type = 'support' then select array_remove(array[requester_id], null), reference into users, ref from public.support_cases where id = p_case and status not in ('resolved', 'closed');
  elsif p_case_type = 'trust' then select array_remove(array[case when subject_type = 'user' then subject_id end], null), reference into users, ref from public.trust_cases where id = p_case;
  end if;
  if ref is null then raise exception 'open_case_required' using errcode = 'P0002'; end if;
  if exists (select 1 from unnest(p_conversations) cid where not exists (select 1 from public.conversation_participants p where p.conversation_id = cid and p.user_id = any(users))) then
    raise exception 'conversation_out_of_scope' using errcode = '42501'; end if;
  insert into public.break_glass_grants(requester_id, reason, justification, case_type, case_id, case_reference, affected_user_ids, conversation_ids, status, requires_approval, duration_minutes, decided_at, starts_at, expires_at, decision_note)
    values (auth.uid(), p_reason, trim(p_justification), p_case_type, p_case, ref,
      (select array_agg(distinct p.user_id) from public.conversation_participants p where p.conversation_id = any(p_conversations) and p.user_id is not null),
      p_conversations, case when high then 'pending' else 'active' end, high, least(greatest(coalesce(p_minutes, 120), 15), 480),
      case when high then null else now() end, case when high then null else now() end, case when high then null else now() + make_interval(mins => least(greatest(coalesce(p_minutes, 120), 15), 480)) end,
      case when p_reason in ('safeguarding', 'legal_request', 'abuse') and others = 0 then 'Sole break-glass holder: no independent approver available' end)
    returning * into g;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_requested',
    jsonb_build_object('grant_id', g.id, 'reason', p_reason, 'case', ref, 'conversations', p_conversations, 'requires_approval', high,
      'sole_holder', p_reason in ('safeguarding', 'legal_request', 'abuse') and others = 0));
  return jsonb_build_object('id', g.id, 'status', g.status, 'expires_at', g.expires_at);
end $$;

create or replace function public.bg_purge() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.audit_events where event like 'admin.break_glass%' and created_at < now() - interval '6 years';
  delete from public.break_glass_grants where coalesce(closed_at, expires_at, created_at) < now() - interval '6 years';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bg_purge() from public, anon, authenticated;
commit;

-- Scheduled jobs: expire grants / close stale log entries every 15 minutes; retention purge monthly.
select cron.unschedule(jobid) from cron.job where jobname in ('break-glass-expire', 'break-glass-retention');
select cron.schedule('break-glass-expire', '*/15 * * * *', 'select public.bg_expire()');
select cron.schedule('break-glass-retention', '30 3 1 * *', 'select public.bg_purge()');
