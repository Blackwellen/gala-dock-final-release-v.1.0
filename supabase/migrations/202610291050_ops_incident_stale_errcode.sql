-- Q34 follow-up (lane A): admin_ops_incident_update raised stale_version with SQLSTATE 40001 (serialization_failure). PostgREST
-- transparently retries 40001, so a stale write from the admin console hung for ~2 minutes instead of failing fast. Same
-- signature and behaviour; the conflict is now 22023 'stale_version' (as elsewhere in the codebase) with a reload hint.
create or replace function public.admin_ops_incident_update(p_incident uuid, p_action text, p_note text, p_to_status text default null, p_severity text default null,
  p_expected_version integer default null, p_runbook_step text default null, p_postmortem_url text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare i public.ops_incidents; n public.ops_incidents;
begin
  perform public.admin_require('settings', p_note);
  if p_action not in ('note','containment','investigation','runbook_step','recovery','notification','postmortem','status_changed','severity_changed','commander_assigned') then
    raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into i from public.ops_incidents where id = p_incident for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and p_expected_version <> i.version then raise exception 'stale_version' using errcode = '22023', hint = 'Reload the incident and retry.'; end if;
  if p_to_status is not null and p_to_status <> i.status and not public.ops_incident_transition_allowed(i.status, p_to_status) then
    raise exception 'invalid_transition: % -> %', i.status, p_to_status using errcode = '22023'; end if;
  if p_to_status = 'postmortem_done' and coalesce(p_postmortem_url, i.postmortem_url) is null then raise exception 'postmortem_url_required' using errcode = '22023'; end if;
  if p_severity is not null and p_severity not in ('sev1','sev2','sev3','sev4') then raise exception 'invalid_severity' using errcode = '22023'; end if;
  update public.ops_incidents set
    status = coalesce(p_to_status, status), severity = coalesce(p_severity, severity),
    commander = case when p_action = 'commander_assigned' then auth.uid() else commander end,
    contained_at = case when p_to_status = 'contained' and contained_at is null then now() else contained_at end,
    resolved_at = case when p_to_status = 'resolved' then now() when p_to_status = 'investigating' then null else resolved_at end,
    postmortem_due_at = case when p_to_status = 'resolved' then now() + interval '5 days' else postmortem_due_at end,
    postmortem_done_at = case when p_to_status = 'postmortem_done' then now() else postmortem_done_at end,
    postmortem_url = coalesce(p_postmortem_url, postmortem_url),
    version = version + 1, updated_at = now()
  where id = p_incident returning * into n;
  insert into public.ops_incident_actions(incident_id, actor_id, actor_type, action, from_status, to_status, note, runbook_key, metadata)
  values (p_incident, auth.uid(), 'admin', case when p_to_status is not null and p_to_status <> i.status and p_action = 'note' then 'status_changed' else p_action end,
          i.status, n.status, left(p_note, 2000), case when p_action = 'runbook_step' then i.runbook_key end,
          jsonb_strip_nulls(jsonb_build_object('step', left(p_runbook_step, 200), 'severity_from', case when p_severity is not null and p_severity <> i.severity then i.severity end, 'severity_to', p_severity)));
  insert into public.audit_events(actor_id, actor_type, event, metadata, correlation_id) values (auth.uid(), 'admin', case when n.status = 'resolved' and i.status <> 'resolved' then 'ops.incident_resolved' else 'ops.incident_updated' end,
    jsonb_build_object('incident_id', p_incident, 'action', p_action, 'from', i.status, 'to', n.status, 'severity', n.severity), i.correlation_id);
  perform public.emit_domain_event(case when n.status = 'resolved' and i.status <> 'resolved' then 'ops.incident_resolved' else 'ops.incident_updated' end, null,
    jsonb_build_object('incident_id', p_incident, 'action', p_action, 'from', i.status, 'to', n.status, 'severity', n.severity), auth.uid(), 'admin', 'ops_incident', p_incident::text, i.correlation_id, null);
  return jsonb_build_object('incident_id', p_incident, 'status', n.status, 'severity', n.severity, 'version', n.version);
end $$;
revoke all on function public.admin_ops_incident_update(uuid, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.admin_ops_incident_update(uuid, text, text, text, text, integer, text, text) to authenticated, service_role;
