-- Phase 3 · Provider Gala Agent operations: routine toggles, whitelisted proposals, and execution results on approvals.
begin;
alter table public.agent_approvals add column if not exists result text, add column if not exists executed_at timestamptz;

-- Actions the agent may propose for a provider. Anything else is refused — the agent can never invent capabilities.
create or replace function public.agent_action_allowed(p_action text) returns boolean language sql immutable set search_path = '' as $$
  select p_action = any(array['availability.block','listing.pause','listing.unpause','hold.release','message.reply','routine.enable','quote.review'])
$$;

/** Queue an agent proposal for human approval (from the chat route or the worker). Never executes anything. */
create or replace function public.agent_propose_action(p_ws uuid, p_run uuid, p_title text, p_detail text, p_action text, p_payload jsonb, p_impact text, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if not public.agent_action_allowed(p_action) then raise exception 'tool_not_permitted' using errcode = '42501'; end if;
  if p_run is not null and not exists(select 1 from public.agent_runs where id = p_run and workspace_id = p_ws) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.agent_approvals(run_id, workspace_id, title, detail, action, payload, impact, amount, status, expires_at)
    values (p_run, p_ws, left(trim(p_title), 140), left(coalesce(p_detail, ''), 600), p_action, coalesce(p_payload, '{}'), left(coalesce(p_impact, ''), 200), p_amount, 'pending', now() + interval '72 hours')
    returning id into aid;
  if p_run is not null then update public.agent_runs set status = 'waiting_approval', waiting_reason = 'Waiting for your approval', updated_at = now() where id = p_run and status in ('running','planning','queued'); end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'agent.proposed', jsonb_build_object('approval_id', aid, 'action', p_action));
  return aid;
end $$;

/** Records the outcome after an approved action was executed with the approver's own permissions. */
create or replace function public.agent_record_result(p_approval uuid, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.agent_approvals;
begin
  select * into a from public.agent_approvals where id = p_approval;
  if not found or a.workspace_id is null or not public.has_workspace_role(a.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.status <> 'approved' then raise exception 'not_approved' using errcode = '22023'; end if;
  update public.agent_approvals set result = left(p_result, 400), executed_at = now() where id = p_approval;
  if a.run_id is not null and not exists(select 1 from public.agent_approvals where run_id = a.run_id and status = 'pending') then
    update public.agent_runs set status = 'queued', waiting_reason = '', updated_at = now() where id = a.run_id and status = 'waiting_approval';
  end if;
end $$;

create or replace function public.provider_toggle_routine(p_routine uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.agent_routines;
begin
  select * into r from public.agent_routines where id = p_routine;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(r.workspace_id, array['owner','manager']);
  update public.agent_routines set enabled = p_enabled, suggested = false, next_run_at = case when p_enabled then coalesce(next_run_at, now() + interval '1 hour') else next_run_at end where id = p_routine;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, case when p_enabled then 'agent.routine_enabled' else 'agent.routine_disabled' end, jsonb_build_object('routine_id', p_routine));
end $$;

revoke all on function public.agent_propose_action(uuid, uuid, text, text, text, jsonb, text, numeric), public.agent_record_result(uuid, text), public.provider_toggle_routine(uuid, boolean) from public, anon;
grant execute on function public.agent_propose_action(uuid, uuid, text, text, text, jsonb, text, numeric), public.agent_record_result(uuid, text), public.provider_toggle_routine(uuid, boolean) to authenticated;
commit;
