-- Q31 fix-up (lane D): the reason / step-up gate runs before the case lookup again (as before 4023), so a missing reason or an
-- aal1 session is reported as reason_required / step_up_required even for an unknown case id (w08-admin-tiers contract).
-- Same signatures and behaviour otherwise.
create or replace function public.admin_update_case(p_case uuid, p_status text, p_reason text, p_outcome text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases;
begin
  perform public.admin_require('support', p_reason);
  c := public.support_case_for_admin(p_case);
  if p_status not in ('open','waiting','escalated','resolved','closed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'resolved' and length(trim(coalesce(p_outcome, ''))) < 3 then raise exception 'outcome_required' using errcode = '22023'; end if;
  if c.status = p_status then raise exception 'no_change' using errcode = '22023'; end if;
  if not public.state_transition_allowed('support_case', c.status, p_status) then raise exception 'invalid_transition' using errcode = '22023'; end if;
  update public.support_cases set status = p_status, outcome = case when p_status = 'resolved' then p_outcome else outcome end,
    resolution_reason = case when p_status = 'resolved' then p_reason else resolution_reason end,
    resolved_at = case when p_status = 'resolved' then now() when p_status = 'closed' then resolved_at else null end,
    escalation_level = case when p_status = 'escalated' then greatest(escalation_level, 1) else escalation_level end
  where id = p_case;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_' || p_status, jsonb_build_object('case_id', p_case, 'reason', p_reason));
end $$;

create or replace function public.admin_assign_case_to(p_case uuid, p_assignee uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; a public.platform_admins; nm text;
begin
  perform public.admin_require('support', p_reason);
  c := public.support_case_for_admin(p_case);
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  select * into a from public.platform_admins where user_id = p_assignee;
  if not found or not ('support' = any(a.permissions)) or (c.category = 'safeguarding' and not ('trust' = any(a.permissions))) then
    raise exception 'invalid_assignee' using errcode = '22023';
  end if;
  nm := coalesce((select nullif(full_name, '') from public.profiles where id = p_assignee), a.title, 'Support agent');
  update public.support_cases set assignee_id = p_assignee, assignee_name = left(nm, 120) where id = p_case;
  perform public.notify(p_assignee, 'support.case_assigned', 'Case ' || c.reference || ' assigned to you', left(c.subject, 200), '/admin/support/' || p_case, 'support.assigned:' || p_case || ':' || p_assignee || ':' || (select version from public.support_cases where id = p_case));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_assigned', jsonb_build_object('case_id', p_case, 'assignee', p_assignee, 'reason', left(p_reason, 300)));
end $$;

create or replace function public.admin_set_case_priority(p_case uuid, p_priority text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases;
begin
  perform public.admin_require('support', p_reason);
  c := public.support_case_for_admin(p_case);
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  if c.priority = p_priority then raise exception 'no_change' using errcode = '22023'; end if;
  update public.support_cases set priority = p_priority where id = p_case;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_priority', jsonb_build_object('case_id', p_case, 'from', c.priority, 'to', p_priority, 'reason', p_reason));
end $$;

create or replace function public.admin_escalate_case_to_trust(p_case uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; tid uuid; ref text; n integer;
begin
  perform public.admin_require('trust', p_reason);
  c := public.support_case_for_admin(p_case);
  if c.trust_case_id is not null then raise exception 'already_escalated' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 1000) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
  ref := 'TS-' || n;
  insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
    values (ref, 'fraud', case when c.category = 'safeguarding' then 'Safeguarding concern' else 'Escalated support case' end, 'user', c.requester_id,
      left(coalesce(nullif(c.requester_name, ''), 'Requester'), 120), case when c.category = 'safeguarding' then 80 else 50 end, 'open', left(p_reason, 1000),
      jsonb_build_array(jsonb_build_object('kind', 'support_case', 'label', 'From support case ' || c.reference, 'at', now())),
      jsonb_build_object('support_case_id', c.id, 'support_reference', c.reference))
    returning id into tid;
  update public.support_cases set trust_case_id = tid, escalation_level = 2, status = case when status = 'escalated' then status else 'escalated' end where id = p_case;
  insert into public.support_case_links(case_id, record_type, record_id, label, created_by) values (p_case, 'trust_case', tid::text, 'Trust case ' || ref, auth.uid()) on conflict do nothing;
  insert into public.support_case_events(case_id, kind, to_value, actor_id, actor_type, detail) values (p_case, 'escalated_trust', ref, auth.uid(), 'admin', jsonb_build_object('trust_case_id', tid));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_escalated_trust', jsonb_build_object('case_id', p_case, 'trust_case_id', tid, 'reason', left(p_reason, 300)));
  return tid;
end $$;

