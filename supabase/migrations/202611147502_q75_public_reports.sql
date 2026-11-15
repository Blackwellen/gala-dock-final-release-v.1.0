-- Q75 add-ons from the legal-engineering lane (2026-11-14). Additive: two nullable columns, reporter_id becomes nullable (widening),
-- one partial unique index, one new service-role-only function, create-or-replace of two existing functions (same signatures).
--
-- 1. Public reports without an account (Online Safety Act s.20: easy to use for any user of the service). The app verifies
--    Turnstile and rate-limits by hashed IP, then calls report_content_public with the SERVICE ROLE — the function is not granted
--    to anon or authenticated, so no client-callable surface is added (no allowlist change). Reports land in content_reports /
--    the one Trust & Safety case per subject exactly like report_content; reporter_id is null and the optional contact email is
--    kept for the team (reporter_email), never shown to the reported party.
-- 2. admin_decide_content_report: outcome notifications only for signed-in reporters (an anonymous report has no user to notify;
--    the insert would have failed the whole decision on notifications.user_id NOT NULL).
-- 3. email_category: tax_details_request (and every tax_* kind) is a MANDATORY "payments" email like payout_paused (already
--    mandatory through "payout"). It was categorised as an optional "quotes" email because of "request".

alter table public.content_reports alter column reporter_id drop not null;
alter table public.content_reports add column if not exists reporter_email text;
alter table public.content_reports add column if not exists reporter_ip_hash text;
create unique index if not exists content_reports_public_once on public.content_reports(subject_type, subject_id, reporter_ip_hash) where reporter_id is null;

create or replace function public.report_content_public(p_subject_type text, p_subject_id uuid, p_reason_code text, p_note text, p_email text, p_ip_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid; nm text; ex text; sev text; rid uuid; cid uuid; n int; ttype text; pri text; em text := lower(trim(coalesce(p_email, '')));
begin
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request' using errcode = '22023'; end if;
  if em <> '' and em !~ '^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  -- Only what anyone can see publicly can be reported without an account.
  if p_subject_type = 'listing' then
    select l.workspace_id, l.name, left(l.name || ' — ' || coalesce(l.description, ''), 2400) into ws, nm, ex from public.listings l
      where l.id = p_subject_id and l.published and not public.demo_hidden_for_viewer(l.workspace_id);
    ttype := 'listing';
  elsif p_subject_type = 'event' then
    select e.workspace_id, e.name, left(e.name || ' — ' || coalesce(e.description, ''), 2400) into ws, nm, ex from public.events e
      where e.id = p_subject_id and public.event_is_public(e.id);
    ttype := 'event';
  elsif p_subject_type = 'review' then
    select public.listing_workspace(r.listing_id), 'Review of ' || coalesce(l.name, 'a listing'), left(coalesce(r.body, ''), 2400) into ws, nm, ex
      from public.reviews r left join public.listings l on l.id = r.listing_id where r.id = p_subject_id and r.status = 'published';
    ttype := 'review';
  elsif p_subject_type = 'workspace' then
    select w.id, w.name, left(w.name, 2400) into ws, nm, ex from public.workspaces w where w.id = p_subject_id and w.status = 'active' and w.kind in ('organizer','provider');
    ttype := 'workspace';
  else raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if nm is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select c.severity into sev from public.moderation_reason_codes c where c.code = p_reason_code and c.active and (p_subject_type = any(c.applies_to) or (p_subject_type = 'workspace' and 'listing' = any(c.applies_to)));
  if sev is null then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if p_reason_code = 'other_policy' and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  if not public.hit_rate_limit('content_report_public:' || p_ip_hash, 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if em <> '' and not public.hit_rate_limit('content_report_public_email:' || md5(em), 10, 86400) then raise exception 'rate_limited' using errcode = '54000'; end if;
  pri := case when p_reason_code in ('child_safety','illegal_content') then 'urgent' when sev in ('critical','high') then 'high' else 'normal' end;
  insert into public.content_reports(subject_type, subject_id, subject_workspace, subject_name, excerpt, reporter_id, reporter_email, reporter_ip_hash, reason_code, note, priority)
    values (p_subject_type, p_subject_id, ws, left(coalesce(nm, ''), 200), coalesce(ex, ''), null, nullif(em, ''), p_ip_hash, p_reason_code, left(coalesce(trim(p_note), ''), 1000), pri)
    on conflict (subject_type, subject_id, reporter_ip_hash) where reporter_id is null do nothing returning id into rid;
  if rid is null then raise exception 'already_reported' using errcode = '23505'; end if;
  select id into cid from public.trust_cases where subject_type = ttype and subject_id = p_subject_id and category = 'Content report' and status in ('open','in_review') limit 1;
  if cid is null then
    select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
    insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
      values ('TS-' || n, 'fraud', 'Content report', ttype, p_subject_id, left(coalesce(nm, 'Reported content'), 160),
        case pri when 'urgent' then 80 when 'high' then 50 else 30 end, 'open', (select label from public.moderation_reason_codes where code = p_reason_code),
        jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported (no account): ' || p_reason_code, 'report_id', rid, 'at', now())),
        jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id, 'workspace_id', ws))
      returning id into cid;
    insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
      select pa.user_id, 'admin.content_report', case when pri = 'urgent' then 'URGENT: content reported' else 'Content reported' end,
        left(coalesce(nm, '') || ' — ' || coalesce((select label from public.moderation_reason_codes where code = p_reason_code), p_reason_code), 300),
        '/admin/moderation', 'content-report-case:' || cid || ':' || pa.user_id
      from public.platform_admins pa where 'trust' = any(pa.permissions)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  else
    update public.trust_cases set evidence = evidence || jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported (no account): ' || p_reason_code, 'report_id', rid, 'at', now())),
      risk_score = least(100, risk_score + 10), updated_at = now() where id = cid;
  end if;
  update public.content_reports set case_id = cid where id = rid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (null, 'system', null, 'content.reported',
    jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id, 'report_id', rid, 'reason_code', p_reason_code, 'case_id', cid, 'priority', pri, 'via', 'public_form'));
  return rid;
end $$;
revoke all on function public.report_content_public(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.report_content_public(text, uuid, text, text, text, text) to service_role;

-- 2. live body + `and x.reporter_id is not null` on the outcome notification.
CREATE OR REPLACE FUNCTION public.admin_decide_content_report(p_report uuid, p_decision text, p_note text, p_remove boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.content_reports; me uuid := auth.uid(); rv public.reviews; removed boolean := false;
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_decision not in ('actioned','dismissed') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.content_reports where id = p_report for update;
  if not found then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'case_closed' using errcode = '22023'; end if;
  if coalesce(p_remove, false) and p_decision = 'actioned' and r.subject_type = 'review' then
    select * into rv from public.reviews where id = r.subject_id for update;
    if found and rv.status = 'published' then
      update public.reviews set status = 'removed', moderation_reason = left(trim(p_note), 500), moderated_by = me, moderated_at = now(), updated_at = now() where id = rv.id;
      perform public.trust_review_aggregate(rv.listing_id, rv.rating, -1);
      removed := true;
      -- Statement of reasons to the author (OSA s.21 complaints / appeal route).
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
        values (rv.user_id, 'report_outcome', 'Your review was removed', left('We removed your review after a report: ' || trim(p_note) || ' You can appeal through Help → Complaints within 14 days.', 600), '/help', 'review-removed:' || rv.id);
    end if;
  end if;
  update public.content_reports set status = p_decision, decided_by = me, decided_at = now(), decision_note = left(trim(p_note), 1000), content_removed = removed
    where subject_type = r.subject_type and subject_id = r.subject_id and status = 'open';
  if r.case_id is not null and not exists (select 1 from public.content_reports x where x.case_id = r.case_id and x.status = 'open') then
    update public.trust_cases set status = p_decision, decision = left(trim(p_note), 1000), decided_by = me, decided_at = now(), updated_at = now()
      where id = r.case_id and status in ('open','in_review');
  end if;
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select x.reporter_id, 'report_outcome', 'We reviewed what you reported',
      case when p_decision = 'actioned' then 'Thanks for telling us. We took action under our rules' || case when removed then ' and removed the content.' else '.' end
           else 'Thanks for telling us. We reviewed it and it didn’t break our rules. If you disagree, reply through Help → Complaints.' end,
      '/help', 'content-report-outcome:' || x.id
    from public.content_reports x where x.subject_type = r.subject_type and x.subject_id = r.subject_id and x.decided_at = now() and x.reporter_id is not null
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (me, 'admin', 'content.report_decided',
    jsonb_build_object('report_id', p_report, 'subject_type', r.subject_type, 'subject_id', r.subject_id, 'decision', p_decision, 'removed', removed, 'reason', left(trim(p_note), 500)));
end $function$;

-- 3. live body (202611149631) + ^tax_ in the payments category and the mandatory test.
CREATE OR REPLACE FUNCTION public.email_category(p_kind text)
 RETURNS TABLE(category text, mandatory boolean)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_kind in ('security', 'trust_enforcement') or p_kind ~ '(legal|terms|policy)' then 'security'
    when p_kind ~ '(^tax_|payment|payout|refund|invoice|dispute|cancellation|billing|chargeback)' then 'payments'
    when p_kind ~ '(ticket|waitlist|transfer)' then 'tickets'
    when p_kind ~ '^(leave_|shift_|availability_request)' then 'event_updates'
    when p_kind ~ '(quote|request|hold|booking|standby|emergency|opportunit|contract_(approval|signed))' then 'quotes'
    when p_kind ~ '(message)' then 'messages'
    when p_kind ~ '(reminder|deadline|expir)' then 'reminders'
    when p_kind ~ '(event|incident|agent|weather|rider|safety_plan)' then 'event_updates'
    else null end,
  p_kind in ('security', 'trust_enforcement') or p_kind ~ '(^tax_|payment|payout|refund|invoice|dispute|cancellation|billing|chargeback|legal|terms|policy)';
$function$;
