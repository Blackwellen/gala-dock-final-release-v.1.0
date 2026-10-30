-- Q31 admin security (W08 S1, S2, S5 + admin_grant_credits). Additive and backward-compatible with the deployed app:
-- the admin console already runs on aal2 sessions, so admins with MFA see no change.
--
-- S2  every admin mutation needs a verified second factor AND an aal2 session (not only admins who already enrolled).
-- S1  admins read email delivery metadata only; bodies only through a case-scoped, time-limited, audited break-glass grant.
--     Message-notification emails no longer carry the private message text (inbox link instead).
-- S5  platform_admins: own row only unless the admin holds users/settings; admin_set_partner_status refuses unknown ids.

-- ── S2: MFA for platform-admin mutations ──────────────────────────────────────────────────────────────────────────────────
-- Raises for a platform admin whose session is not aal2 (aal2 implies a verified factor). Non-admin callers fall through to the
-- caller's own permission check (so they still get not_authorized), and service-role/cron (no uid) is unaffected.
create or replace function public.admin_mfa_required()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then return; end if;
  if not public.session_is_live() then raise exception 'session_revoked' using errcode = '42501'; end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'step_up_required' using errcode = '42501',
      hint = 'Platform admin actions need two-step verification: enrol an authenticator, verify it, then retry.';
  end if;
end $$;
revoke all on function public.admin_mfa_required() from public, anon;
grant execute on function public.admin_mfa_required() to authenticated, service_role;

create or replace function public.admin_require(p_perm text, p_reason text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission(p_perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  perform public.admin_mfa_required();
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
end $$;

-- admin_grant_credits goes through admin_require (permission, live aal2 session, reason = the reference, at least 5 characters).
create or replace function public.admin_grant_credits(p_workspace uuid, p_credits numeric, p_kind text, p_reference text, p_expires timestamp with time zone default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('agent_ops', p_reference);
  if p_kind not in ('grant','promo','refund','reversal') then raise exception 'invalid' using errcode = '22023'; end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, expires_at, created_by) values (p_workspace, p_kind, p_credits, p_reference, p_expires, auth.uid());
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', p_workspace, 'ai.credits_' || p_kind, jsonb_build_object('credits', p_credits, 'reference', p_reference));
end $$;

-- ── S5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists admins_admin_read on public.platform_admins;
create policy admins_admin_read on public.platform_admins for select to authenticated
  using (public.has_admin_permission('users') or public.has_admin_permission('settings'));
-- (admin_self_read keeps every admin's own row visible.)

-- Four-eyes display on the break-glass request page: how many OTHER holders could approve (a count, no identities).
create or replace function public.admin_break_glass_approvers()
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::int from public.platform_admins where user_id <> auth.uid() and 'support.break_glass_conversation.read' = any(permissions));
end $$;
revoke all on function public.admin_break_glass_approvers() from public, anon;
grant execute on function public.admin_break_glass_approvers() to authenticated;

create or replace function public.admin_set_partner_status(p_partner uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('partners', p_reason);
  if p_status not in ('active','paused','terminated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.partners set status = p_status where id = p_partner;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;   -- nothing changed, nothing audited
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_' || p_status, jsonb_build_object('partner_id', p_partner, 'reason', p_reason));
end $$;

-- ── S1: email outbox ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Members still read their own emails; no admin reads bodies through REST any more.
drop policy if exists email_outbox_own on public.email_outbox;
create policy email_outbox_own on public.email_outbox for select to authenticated using (user_id = (select auth.uid()));

-- Delivery metadata for support / settings / agent_ops admins: recipient, category, status, attempts, timestamps. No subject, body or link.
create or replace function public.admin_email_deliveries(p_status text default null, p_category text default null, p_user uuid default null, p_limit integer default 100)
returns table(id uuid, user_id uuid, to_email text, category text, status text, attempts integer, last_error text, created_at timestamptz, sent_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('support') or public.has_admin_permission('settings') or public.has_admin_permission('agent_ops')) then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  return query select o.id, o.user_id, o.to_email, o.category, o.status, o.attempts, o.last_error, o.created_at, o.sent_at
    from public.email_outbox o
   where (p_status is null or o.status = p_status) and (p_category is null or o.category = p_category) and (p_user is null or o.user_id = p_user)
   order by o.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;
revoke all on function public.admin_email_deliveries(text, text, uuid, integer) from public, anon;
grant execute on function public.admin_email_deliveries(text, text, uuid, integer) to authenticated;

create or replace function public.admin_email_backlog()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('support') or public.has_admin_permission('settings') or public.has_admin_permission('agent_ops')) then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select jsonb_build_object('queued', count(*) filter (where o.status = 'queued'), 'failed', count(*) filter (where o.status = 'failed'),
    'sending', count(*) filter (where o.status = 'sending')) from public.email_outbox o);
end $$;
revoke all on function public.admin_email_backlog() from public, anon;
grant execute on function public.admin_email_backlog() to authenticated;

-- Break-glass email body: same grant model as conversations: the admin's own ACTIVE grant, the email's recipient must be one of the
-- grant's affected users, fresh second factor, audited per open.
create or replace function public.admin_open_email(p_grant uuid, p_email uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.break_glass_grants; e public.email_outbox;
begin
  perform public.bg_expire();
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.admin_mfa_required();
  select * into g from public.break_glass_grants where id = p_grant;
  if g.id is null or g.requester_id <> auth.uid() then raise exception 'no_grant' using errcode = '42501'; end if;
  if g.status <> 'active' or g.expires_at <= now() then raise exception 'grant_not_active' using errcode = '42501'; end if;
  if not public.bg_step_up_ok() then raise exception 'step_up_required' using errcode = '42501'; end if;
  select * into e from public.email_outbox where id = p_email;
  if e.id is null or e.user_id is null or not (e.user_id = any(g.affected_user_ids)) then raise exception 'email_out_of_scope' using errcode = '42501'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_email_opened',
    jsonb_build_object('grant_id', g.id, 'email_id', e.id, 'case', g.case_reference, 'reason', g.reason, 'category', e.category));
  return jsonb_build_object('id', e.id, 'to_email', e.to_email, 'category', e.category, 'status', e.status, 'subject', e.subject, 'body', e.body,
    'link', e.link, 'created_at', e.created_at, 'sent_at', e.sent_at, 'expires_at', g.expires_at);
end $$;
revoke all on function public.admin_open_email(uuid, uuid) from public, anon;
grant execute on function public.admin_open_email(uuid, uuid) to authenticated;

-- Message notifications: the in-app notification (recipient-only) keeps its preview; the EMAIL carries no message text (PECR /
-- data minimisation), just a pointer to the inbox. Other categories unchanged.
create or replace function public.trg_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; addr text; prefs jsonb; v_body text;
begin
  select * into c from public.email_category(new.kind);
  if c.category is null then return new; end if;
  select u.email, p.notifications into addr, prefs from auth.users u left join public.profiles p on p.id = u.id where u.id = new.user_id;
  if addr is null then return new; end if;
  if not c.mandatory and coalesce((prefs ->> c.category)::boolean, true) = false then return new; end if;
  v_body := case when c.category = 'messages'
                 then 'You have a new message on Gala Dock. Open your inbox to read and reply. For your privacy, message text is never included in emails.'
                 else left(coalesce(new.body, ''), 4000) end;
  insert into public.email_outbox(user_id, to_email, category, subject, body, link, notification_id)
    values (new.user_id, addr, c.category, left(new.title, 200), v_body, new.link, new.id) on conflict (notification_id) do nothing;
  return new;
exception when others then return new;   -- email must never block the in-app notification
end $$;

-- ── S2: every remaining admin mutation that checked only has_admin_permission() now also requires aal2 ───────────────────────
-- Bodies are the live definitions (2026-10-29) with one added first statement: perform public.admin_mfa_required().
-- admin_add_note
CREATE OR REPLACE FUNCTION public.admin_add_note(p_entity_type text, p_entity uuid, p_body text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare perm text; nid bigint;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  perm := case p_entity_type when 'transaction' then 'commerce' when 'partner' then 'partners' when 'trust_case' then 'trust' when 'support_case' then 'support' end;
  if perm is null then raise exception 'invalid_entity' using errcode = '22023'; end if;
  if not public.has_admin_permission(perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  insert into public.admin_notes(entity_type, entity_id, body, author_id, author_name) values (p_entity_type, p_entity, left(trim(p_body), 4000), auth.uid(), public.admin_actor_name()) returning id into nid;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.note_added', jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity));
  return nid;
end $function$
;

-- admin_add_record_note
CREATE OR REPLACE FUNCTION public.admin_add_record_note(p_subject_type text, p_subject uuid, p_body text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare perm text; nid bigint; who text;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  perm := case p_subject_type when 'user' then 'users' when 'workspace' then 'workspaces' when 'event' then 'events' when 'listing' then 'marketplace' end;
  if perm is null then raise exception 'invalid_entity' using errcode = '22023'; end if;
  if not public.has_admin_permission(perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) < 2 then raise exception 'body_required' using errcode = '22023'; end if;
  select coalesce(nullif(p.full_name, ''), 'Admin') into who from public.profiles p where p.id = auth.uid();
  insert into public.admin_record_notes(subject_type, subject_id, body, author_id, author_name)
    values (p_subject_type, p_subject, left(trim(p_body), 2000), auth.uid(), coalesce(who, 'Admin')) returning id into nid;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.note_added', jsonb_build_object('entity_type', p_subject_type, 'entity_id', p_subject));
  return nid;
end $function$
;

-- admin_assign_case
CREATE OR REPLACE FUNCTION public.admin_assign_case(p_case uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.support_cases set assignee_id = auth.uid(),
    assignee_name = coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Support agent') where id = p_case;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.case_assigned', jsonb_build_object('case_id', p_case));
end $function$
;

-- admin_assign_trust
CREATE OR REPLACE FUNCTION public.admin_assign_trust(p_case uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.trust_cases set assignee_id = auth.uid(), assignee_name = public.admin_actor_name(), updated_at = now() where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.trust_assigned', jsonb_build_object('case_id', p_case));
end $function$
;

-- admin_close_break_glass
CREATE OR REPLACE FUNCTION public.admin_close_break_glass(p_grant uuid, p_notify boolean, p_withheld_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.break_glass_grants;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.break_glass_grants where id = p_grant for update;
  if g.id is null or g.status not in ('active', 'expired', 'pending') then raise exception 'not_open' using errcode = '22023'; end if;
  if not p_notify and length(trim(coalesce(p_withheld_reason, ''))) < 10 then raise exception 'withheld_reason_required' using errcode = '22023'; end if;
  update public.break_glass_access_log set closed_at = coalesce(closed_at, least(last_seen_at, now())) where grant_id = g.id;
  update public.break_glass_grants set status = case when status = 'pending' then 'revoked' else 'closed' end, closed_at = now(), notify_affected = p_notify,
    notify_withheld_reason = case when p_notify then null else trim(p_withheld_reason) end, notified_at = case when p_notify then now() end where id = g.id;
  if p_notify then
    insert into public.notifications(user_id, title, body, kind)
      select u, 'An administrator reviewed some of your messages',
        'As part of a ' || replace(g.reason, '_', ' ') || ' investigation (case ' || g.case_reference || '), authorised Gala Dock staff reviewed messages in a conversation you are part of. Contact support if you have questions.', 'system'
      from unnest(g.affected_user_ids) u;
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_closed',
    jsonb_build_object('grant_id', g.id, 'notified', p_notify, 'withheld_reason', p_withheld_reason));
end $function$
;

-- admin_create_support_case
CREATE OR REPLACE FUNCTION public.admin_create_support_case(p_subject text, p_category text, p_priority text, p_requester text, p_body text, p_related jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; ref text; n integer;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_name, sla_due_at, related, created_at)
    values (ref, left(trim(p_subject), 200), p_category, p_priority, 'open', left(coalesce(nullif(trim(p_requester), ''), 'Unknown requester'), 120),
      now() + (case p_priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 8 else 16 end) * interval '1 hour',
      coalesce(p_related, '{}') || jsonb_build_object('source', 'Admin console', 'created_by', public.admin_actor_name()), now())
    returning id into cid;
  if length(trim(coalesce(p_body, ''))) > 0 then
    insert into public.support_messages(case_id, author_id, author, body, internal, role) values (cid, auth.uid(), public.admin_actor_name(), left(trim(p_body), 5000), true, 'support');
  end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.case_created', jsonb_build_object('case_id', cid, 'reference', ref));
  return cid;
end $function$
;

-- admin_decide_agent_approval
CREATE OR REPLACE FUNCTION public.admin_decide_agent_approval(p_approval uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.agent_approvals;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.workspace_id is not null then raise exception 'workspace_approval' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = a.id;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), case when p_approve then 'agent.approved' else 'agent.rejected' end, jsonb_build_object('approval_id', a.id));
end $function$
;

-- admin_decide_break_glass
CREATE OR REPLACE FUNCTION public.admin_decide_break_glass(p_grant uuid, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.break_glass_grants;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.break_glass_grants where id = p_grant for update;
  if g.id is null or g.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if g.requester_id = auth.uid() then raise exception 'cannot_approve_own_request' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  update public.break_glass_grants set status = case when p_approve then 'active' else 'rejected' end, approver_id = auth.uid(), decision_note = trim(p_note), decided_at = now(),
    starts_at = case when p_approve then now() end, expires_at = case when p_approve then now() + make_interval(mins => duration_minutes) end where id = g.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', case when p_approve then 'admin.break_glass_approved' else 'admin.break_glass_rejected' end,
    jsonb_build_object('grant_id', g.id, 'requester', g.requester_id, 'note', trim(p_note)));
end $function$
;

-- admin_dispute_update
CREATE OR REPLACE FUNCTION public.admin_dispute_update(p_dispute uuid, p_status text, p_note text, p_resolution jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.booking_disputes;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not (public.has_admin_permission('support') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_status = 'resolution_proposed' and p_resolution is null then raise exception 'resolution_required' using errcode = '22023'; end if;
  update public.booking_disputes set status = p_status, resolution = coalesce(p_resolution, resolution), assignee_id = coalesce(assignee_id, auth.uid()),
    customer_accepted_at = case when p_status = 'resolution_proposed' then null else customer_accepted_at end,
    provider_accepted_at = case when p_status = 'resolution_proposed' then null else provider_accepted_at end,
    resolved_at = case when p_status = 'resolved' then now() end, updated_at = now() where id = d.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), 'admin', case when p_resolution is not null then 'proposal' else 'status' end, left(p_note, 6000));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', d.workspace_id, 'dispute.' || p_status, jsonb_build_object('dispute_id', d.id, 'note', left(p_note, 500)));
  perform public.notify_workspace(d.workspace_id, array['owner','manager'], 'provider.request', 'Dispute update: ' || replace(p_status, '_', ' '), left(p_note, 300), '/provider/disputes/' || d.id);
  perform public.notify_event(d.event_id, 'provider.request', 'Dispute update: ' || replace(p_status, '_', ' '), left(p_note, 300), public.event_path(d.event_id, 'dispute', d.id));
end $function$
;

-- admin_record_ai_provider_invoice
CREATE OR REPLACE FUNCTION public.admin_record_ai_provider_invoice(p_period date, p_amount numeric, p_currency text, p_fx numeric, p_reference text, p_provider text DEFAULT 'azure_openai'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 or p_fx is null or p_fx <= 0 or p_period is null or length(trim(coalesce(p_reference, ''))) < 3
     or coalesce(p_provider, '') !~ '^[a-z][a-z0-9_]{1,40}$' or coalesce(p_currency, '') !~* '^[a-z]{3}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into public.ai_provider_invoices(provider, period, amount, currency, fx_to_gbp, reference, created_by)
    values (p_provider, date_trunc('month', p_period)::date, p_amount, upper(p_currency), p_fx, left(trim(p_reference), 200), auth.uid())
  on conflict (provider, period) do update set amount = excluded.amount, currency = excluded.currency, fx_to_gbp = excluded.fx_to_gbp, reference = excluded.reference, created_by = excluded.created_by, created_at = now();
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'ai.provider_invoice_recorded',
    jsonb_build_object('provider', p_provider, 'period', date_trunc('month', p_period)::date, 'amount', p_amount, 'currency', upper(p_currency), 'fx', p_fx, 'reference', left(trim(p_reference), 200)));
end $function$
;

-- admin_reply_case
CREATE OR REPLACE FUNCTION public.admin_reply_case(p_case uuid, p_body text, p_internal boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  insert into public.support_messages(case_id, author_id, author, body, internal)
    values (p_case, auth.uid(), coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Gala Dock Support'), left(p_body, 5000), p_internal);
end $function$
;

-- admin_request_break_glass
CREATE OR REPLACE FUNCTION public.admin_request_break_glass(p_case_type text, p_case uuid, p_reason text, p_justification text, p_conversations uuid[], p_minutes integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare users uuid[]; ref text; g public.break_glass_grants;
  others integer := (select count(*) from public.platform_admins where user_id <> auth.uid() and 'support.break_glass_conversation.read' = any(permissions));
  high boolean := p_reason in ('safeguarding', 'legal_request', 'abuse') and others > 0;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
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
end $function$
;

-- admin_rollback_setting
CREATE OR REPLACE FUNCTION public.admin_rollback_setting(p_section text, p_version integer, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare val jsonb;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  select value into val from public.platform_settings where section = p_section and version = p_version;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.admin_publish_setting(p_section, val, 'Rollback to v' || p_version || ': ' || p_reason);
end $function$
;

-- admin_save_setting_draft
CREATE OR REPLACE FUNCTION public.admin_save_setting_draft(p_section text, p_value jsonb, p_summary text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer; d public.platform_settings;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_section not in ('general','commerce','marketplace','ticketing','trust','agent','communications','integrations') then raise exception 'invalid_section' using errcode = '22023'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = '22023'; end if;
  select * into d from public.platform_settings where section = p_section and status = 'draft' order by version desc limit 1 for update;
  if found then
    update public.platform_settings set value = p_value, summary = coalesce(nullif(trim(p_summary), ''), summary), created_by = auth.uid(), created_at = now() where id = d.id;
    v := d.version;
  else
    select coalesce(max(version), 0) + 1 into v from public.platform_settings where section = p_section;
    insert into public.platform_settings(section, version, status, value, change_reason, summary, created_by) values (p_section, v, 'draft', p_value, '', coalesce(trim(p_summary), ''), auth.uid());
  end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.setting_draft_saved', jsonb_build_object('section', p_section, 'version', v));
  return v;
end $function$
;

-- moderate_review
CREATE OR REPLACE FUNCTION public.moderate_review(p_review uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.reviews;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not (public.has_admin_permission('trust') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_status not in ('published','pending','removed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into r from public.reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status = p_status then return; end if;
  update public.reviews set status = p_status, moderation_reason = left(p_reason, 500), moderated_by = auth.uid(), moderated_at = now(), updated_at = now() where id = r.id;
  if r.status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, -1);
  elsif p_status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, 1); end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', public.listing_workspace(r.listing_id), 'review.moderated',
    jsonb_build_object('review_id', r.id, 'from', r.status, 'to', p_status, 'reason', left(p_reason, 500)));
end $function$
;

-- moderate_template
CREATE OR REPLACE FUNCTION public.moderate_template(p_template uuid, p_action text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.design_templates;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into t from public.design_templates where id = p_template for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action in ('hide','remove','reinstate') then
    update public.design_templates set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'active' end where id = t.id;
  elsif p_action = 'restrict_creator' and t.owner_id is not null then
    insert into public.template_creator_restrictions(user_id, reason, created_by) values (t.owner_id, left(p_note, 500), auth.uid()) on conflict (user_id) do update set reason = excluded.reason;
    update public.design_templates set status = 'hidden' where owner_id = t.owner_id and visibility = 'public';
  else raise exception 'invalid_action' using errcode = '22023'; end if;
  update public.template_reports set status = case when p_action = 'reinstate' then 'dismissed' else 'actioned' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 500)
    where template_id = t.id and status = 'open';
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'template.' || p_action, jsonb_build_object('template_id', t.id, 'note', left(p_note, 500)));
end $function$
;

-- trust_review_document
CREATE OR REPLACE FUNCTION public.trust_review_document(p_document uuid, p_status text, p_reason_code text, p_reason text, p_expires_on date DEFAULT NULL::date, p_cover_amount_minor bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.provider_documents; decision text;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not (public.has_admin_permission('trust') or exists (select 1 from public.platform_admins where user_id = auth.uid())) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('in_review','verified','rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason_code is not null and not exists (select 1 from public.moderation_reason_codes c where c.code = p_reason_code) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  select * into d from public.provider_documents where id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.status in ('superseded','expired') and p_status <> 'rejected' then raise exception 'document_not_reviewable' using errcode = '22023'; end if;
  if p_status = 'verified' then
    decision := public.file_access_decision('workspace-files', d.file_path);
    if decision <> 'ok' then raise exception 'file_not_cleared: %', decision using errcode = '22023', hint = 'The file must pass the malware scan before it can be verified.'; end if;
    if coalesce(p_expires_on, d.expires_on) is not null and coalesce(p_expires_on, d.expires_on) < current_date then raise exception 'already_expired' using errcode = '22023'; end if;
  end if;
  update public.provider_documents set status = p_status, review_reason_code = p_reason_code,
    rejection_reason = case when p_status = 'rejected' then left(p_reason, 500) end,
    expires_on = coalesce(p_expires_on, expires_on), cover_amount_minor = coalesce(p_cover_amount_minor, cover_amount_minor),
    cover_currency = case when p_cover_amount_minor is not null then coalesce(cover_currency, 'GBP') else cover_currency end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_document;
  if p_status = 'verified' then
    update public.provider_documents o set status = 'superseded', superseded_by = d.id
      where o.workspace_id = d.workspace_id and o.credential_key = d.credential_key and o.id <> d.id and o.status in ('verified','expired');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, actor_type, metadata)
    values (auth.uid(), d.workspace_id, 'trust.document_reviewed', 'admin', jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'status', p_status, 'reason_code', p_reason_code));
  return jsonb_build_object('document_id', d.id, 'status', p_status, 'eligibility', public.trust_eligibility_internal(d.workspace_id, null));
end $function$
;

-- update_privacy_request
CREATE OR REPLACE FUNCTION public.update_privacy_request(p_id uuid, p_status text, p_note text, p_extend boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.privacy_requests;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into r from public.privacy_requests where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status not in ('verifying','in_progress','extended','completed','refused','withdrawn') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if (p_status in ('refused','extended') or p_extend) and length(trim(coalesce(p_note, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.privacy_requests set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()),
    due_at = case when p_extend and extended_reason is null then received_at + interval '3 months' else due_at end,
    extended_reason = case when p_extend then left(p_note, 1000) else extended_reason end,
    refusal_reason = case when p_status = 'refused' then left(p_note, 1000) else refusal_reason end,
    outcome = case when p_status = 'completed' then left(coalesce(p_note, ''), 1000) else outcome end,
    completed_at = case when p_status in ('completed','refused','withdrawn') then now() else null end where id = p_id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'privacy.request_' || p_status, jsonb_build_object('reference', r.reference, 'note', left(p_note, 300)));
  if r.user_id is not null then insert into public.notifications(user_id, kind, title, body, link) values (r.user_id, 'security', 'Update on privacy request ' || r.reference,
    case p_status when 'completed' then 'Your request is complete.' when 'refused' then 'We couldn’t fulfil your request: ' || left(p_note, 300) when 'extended' then 'We need more time; we’ll respond by ' || to_char(r.received_at + interval '3 months', 'DD Mon YYYY') || '.' else 'Your request is being processed.' end,
    '/account?tab=security#privacy'); end if;
end $function$
;

