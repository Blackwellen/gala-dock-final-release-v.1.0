-- Q53 Gala Agent bug hunt (lane bughunt-agent, 2026-11-14). Additive: one new internal function, two function bodies replaced with
-- the same signatures, three state-machine transitions added. No table, column or data change.
--
--   1. agent_scope_check(): agent_invoke ran event.readiness / event.feasibility / event.budget / task.create / the marketplace
--      requests / standby.activate / cancellation.request and the provider R1–R4 tools on whatever ids the arguments named. The
--      domain functions check the *human's* access (can_access_event, can_edit_event …), so a person who belongs to two workspaces
--      could have an agent run in workspace A read or change records of workspace B (with A's permissions and plan, billed to A),
--      and task.create stored a task with workspace_id A on an event of workspace B. Every id now has to belong to the run's own
--      workspace (build items: as the organiser or as the provider, like agent_mission_wait); otherwise 'not_found'.
--   2. agent_invoke calls it right after the membership + permission check (body otherwise identical to the live one).
--   3. agent_run machine: planning → completed (a greeting / how-to question plans zero steps and is answered conversationally;
--      the transition was missing, so runtime.ts's update was refused and the run stayed "planning" forever, never claimed again),
--      planning → queued (a transient model error while planning re-queues the run with backoff instead of stranding it), and
--      paused → awaiting_plan_confirmation (resume of a paused, still-unconfirmed plan returns it to confirmation).
--   4. agent_control_run (provider run controls): resume sends an unconfirmed plan back to confirmation instead of queueing it,
--      so pause + resume can no longer skip the plan confirmation that R3/R4 plans need.
-- Plan limits (Q67 hand-off): agent_invoke already becomes the human (request.jwt.claims) before any domain write, so the
-- plan-limit triggers (auth.uid() is not null) apply to agent-created records; covered by tests/release/q53-agent-bughunt.spec.ts.

-- ── 1. Workspace scope of tool arguments ──
create or replace function public.agent_scope_check(p_workspace uuid, p_tool text, p_args jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare k text; v uuid; ok boolean;
begin
  if p_workspace is null or p_args is null or jsonb_typeof(p_args) <> 'object' then return; end if;
  for k in select jsonb_object_keys(p_args) loop
    continue when jsonb_typeof(p_args -> k) <> 'string' or nullif(p_args ->> k, '') is null;
    continue when k not in ('event_id','item_id','depends_on','primary_id','standby_id','space_id','listing_id','crew_id','equipment_id','tier_id');
    v := (p_args ->> k)::uuid;
    if k = 'event_id' then
      ok := exists (select 1 from public.events e where e.id = v and e.workspace_id = p_workspace)
        -- a provider may message about an organiser's event it has a request on
        or (p_tool = 'message.party' and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.event_id = v and l.workspace_id = p_workspace));
    elsif k in ('item_id','depends_on','primary_id') then
      ok := exists (select 1 from public.build_items b where b.id = v
        and (exists (select 1 from public.events e where e.id = b.event_id and e.workspace_id = p_workspace)
             or exists (select 1 from public.listings l where l.id = b.listing_id and l.workspace_id = p_workspace)));
    elsif k = 'standby_id' then
      ok := exists (select 1 from public.standby_commitments s join public.events e on e.id = s.event_id where s.id = v and e.workspace_id = p_workspace);
    elsif k = 'space_id' then
      ok := exists (select 1 from public.spaces s where s.id = v and s.workspace_id = p_workspace);
    elsif k = 'listing_id' then
      ok := exists (select 1 from public.listings l where l.id = v and l.workspace_id = p_workspace);
    elsif k = 'crew_id' then
      ok := exists (select 1 from public.crew_members c where c.id = v and c.workspace_id = p_workspace);
    elsif k = 'equipment_id' then
      ok := exists (select 1 from public.provider_equipment q where q.id = v and q.workspace_id = p_workspace);
    elsif k = 'tier_id' then
      ok := exists (select 1 from public.ticket_tiers t join public.events e on e.id = t.event_id where t.id = v and e.workspace_id = p_workspace);
    end if;
    if not coalesce(ok, false) then
      raise exception 'not_found' using errcode = 'P0002', detail = 'agent_scope:' || k, hint = 'Gala Agent only works on records of the workspace it is acting in.';
    end if;
  end loop;
end $$;
revoke all on function public.agent_scope_check(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_scope_check(uuid, text, jsonb) to service_role;

-- ── 3. agent_run transitions (src/lib/domain/state-machines.ts is updated in the same change; db:parity checks both) ──
insert into public.state_transitions(machine, from_state, to_state) values
  ('agent_run','planning','completed'),
  ('agent_run','planning','queued'),
  ('agent_run','paused','awaiting_plan_confirmation')
on conflict do nothing;

-- ── 2. agent_invoke: same body as live (202610294034 lineage) plus the scope check ──
CREATE OR REPLACE FUNCTION public.agent_invoke(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.agent_tools; out jsonb; v uuid; perm_ok boolean;
begin
  select * into t from public.agent_tools where id = p_tool;
  if not found then raise exception 'unknown_tool' using errcode = '22023'; end if;
  -- Become the human for this transaction: auth.uid() now returns p_actor in every domain function.
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_actor and m.status = 'active') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select public.has_permission(p_workspace, t.permission) into perm_ok;
  if not perm_ok then raise exception 'permission_denied:%', t.permission using errcode = '42501'; end if;
  -- Q53: every id in the arguments must belong to the workspace the agent acts in (the human may belong to others too).
  perform public.agent_scope_check(p_workspace, p_tool, coalesce(p_args, '{}'::jsonb));

  case p_tool
  -- ── R0 reads (organizer)
  when 'events.list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'status', e.status, 'guests', e.guest_count, 'venue', e.venue_name, 'link', '/organizer/events/' || e.id) order by e.starts_at nulls last), '[]') into out
      from public.events e where e.workspace_id = p_workspace and e.status <> 'cancelled'
        and (p_args->>'within_days' is null or e.starts_at between now() and now() + make_interval(days => (p_args->>'within_days')::int)) limit 50;
  when 'event.readiness' then out := public.event_readiness((p_args->>'event_id')::uuid);
  when 'event.feasibility' then out := public.event_feasibility((p_args->>'event_id')::uuid);
  when 'event.budget' then out := public.event_build_budget((p_args->>'event_id')::uuid);
  when 'marketplace.open_requests' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', b.title, 'event', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'link', '/organizer/marketplace/bookings/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.events e on e.id = b.event_id where e.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','quoted','available','held','conditional_hold_requested') limit 60;
  when 'marketplace.search' then
    select coalesce(jsonb_agg(jsonb_build_object('listing_id', l.id, 'workspace_id', l.workspace_id, 'name', l.name, 'category', l.category, 'city', l.city, 'price_from', l.price_from, 'rating', l.rating, 'capacity_max', l.capacity_max, 'response_hours', l.response_hours, 'emergency', l.emergency_supply)), '[]') into out
      from (select * from public.listings l where l.published and l.paused_at is null
        and (p_args->>'category' is null or l.category ilike '%' || (p_args->>'category') || '%' or l.kind = lower(p_args->>'category'))
        and (p_args->>'city' is null or l.city ilike '%' || (p_args->>'city') || '%')
        and (p_args->>'guests' is null or coalesce(l.capacity_max, 100000) >= (p_args->>'guests')::int)
        and (p_args->>'max_price' is null or coalesce(l.price_from, 0) <= (p_args->>'max_price')::numeric)
        order by l.rating desc nulls last limit 12) l;
  when 'team.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.team_conflicts(p_workspace) c;
  when 'tickets.sales' then
    select coalesce(jsonb_agg(jsonb_build_object('tier', t2.name, 'sold', t2.sold, 'held', t2.held, 'quantity', t2.quantity, 'price', t2.price, 'status', t2.status, 'revenue', t2.sold * t2.price)), '[]') into out
      from public.ticket_tiers t2 join public.events e on e.id = t2.event_id where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace;
  when 'money.payables' then
    select coalesce(jsonb_agg(jsonb_build_object('payee', p.payee, 'kind', p.kind, 'amount', p.amount, 'status', p.status, 'due_at', p.due_at, 'event', e.name) order by p.due_at), '[]') into out
      from public.payments p join public.events e on e.id = p.event_id where e.workspace_id = p_workspace and p.status in ('due','scheduled','overdue') limit 60;
  -- ── R2 internal writes
  when 'task.create' then
    if not public.can_edit_event((p_args->>'event_id')::uuid) then raise exception 'not_authorized' using errcode = '42501'; end if;
    insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, due_at, priority, status)
      values ((p_args->>'event_id')::uuid, p_workspace, p_actor, left(p_args->>'title', 200), left(coalesce(p_args->>'detail', ''), 2000), 'agent',
        nullif(p_args->>'due_at', '')::timestamptz, coalesce(p_args->>'priority', 'medium'), 'todo') returning id into v;
    out := jsonb_build_object('task_id', v, 'link', '/organizer/events/' || (p_args->>'event_id') || '?tab=plan&section=tasks');
  -- ── R3 external, non-binding
  when 'message.party' then
    v := public.start_conversation(coalesce(p_args->>'kind', 'direct'), coalesce(p_args->>'subject', ''), p_args->>'to_type', (p_args->>'to')::uuid, p_args->>'body', p_workspace,
      nullif(p_args->>'event_id', '')::uuid, null, nullif(p_args->>'item_id', '')::uuid);
    out := jsonb_build_object('conversation_id', v, 'link', '/messages/' || v);
  when 'marketplace.request_hold' then
    v := public.request_conditional_hold((p_args->>'item_id')::uuid, (p_args->>'hours')::int, nullif(p_args->>'depends_on', '')::uuid, coalesce(p_args->>'conditions', ''));
    out := jsonb_build_object('hold_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'marketplace.request_standby' then
    v := public.request_standby((p_args->>'item_id')::uuid, nullif(p_args->>'primary_id', '')::uuid, (p_args->>'window_start')::timestamptz, (p_args->>'window_end')::timestamptz, coalesce(p_args->>'note', ''));
    out := jsonb_build_object('standby_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'emergency.create' then
    v := public.create_emergency_request((p_args->>'event_id')::uuid, p_args - 'event_id');
    out := jsonb_build_object('request_id', v, 'link', '/organizer/marketplace/emergency/' || v);
  -- ── R4 commitments (only ever executed after human approval)
  when 'standby.activate' then perform public.activate_standby((p_args->>'standby_id')::uuid, p_args->>'reason'); out := jsonb_build_object('activated', true);
  when 'cancellation.request' then
    v := public.request_cancellation((p_args->>'item_id')::uuid, 'customer', coalesce(p_args->>'kind', 'full'), p_args->>'reason');
    out := jsonb_build_object('cancellation_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'tickets.publish_tier' then
    update public.ticket_tiers t3 set status = 'on_sale' from public.events e where t3.id = (p_args->>'tier_id')::uuid and e.id = t3.event_id and e.workspace_id = p_workspace and t3.status in ('draft','scheduled','paused')
      returning t3.id into v;
    if v is null then raise exception 'not_publishable' using errcode = '22023'; end if;
    out := jsonb_build_object('tier_id', v, 'status', 'on_sale');
  -- ── Provider reads
  when 'opportunities.list' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'amount', b.amount, 'starts_at', e.starts_at, 'link', '/provider/opportunities/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      where l.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','clarification','conditional_hold_requested') limit 60;
  when 'calendar.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.space_conflicts((p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz) c;
  when 'money.provider_summary' then
    select jsonb_build_object('protected', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'protected_pending_delivery'), 0) / 100.0,
      'releasing', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'eligible_for_provider_transfer'), 0) / 100.0,
      'released', coalesce(sum(transferred_minor) filter (where status in ('transfer_created','paid_out')), 0) / 100.0) into out
      from public.payment_orders where payee_workspace_id = p_workspace;
  when 'reliability.get' then select to_jsonb(r) into out from public.reliability_metrics r where r.workspace_id = p_workspace;
  -- ── Provider R3/R4
  when 'opportunity.respond' then
    out := jsonb_build_object('status', public.provider_respond((p_args->>'item_id')::uuid, p_args->>'response', coalesce(p_args->>'note', '')));
  when 'venue.hold' then
    v := public.venue_place_hold((p_args->>'item_id')::uuid, (p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz, (p_args->>'hours')::int, coalesce(p_args->>'blocking', 'soft'), coalesce(p_args->>'note', ''));
    out := jsonb_build_object('hold_id', v);
  when 'quote.send' then
    v := public.provider_issue_quote((p_args->>'item_id')::uuid, p_args->'items', coalesce((p_args->>'tax_bps')::int, 0), coalesce((p_args->>'deposit_pct')::int, 30),
      coalesce((p_args->>'valid_days')::int, 14), coalesce(p_args->'terms', '{}'), coalesce(p_args->>'message', ''), true);
    out := jsonb_build_object('quote_id', v, 'link', '/provider/opportunities/' || (p_args->>'item_id'));
  else out := public.agent_invoke_d3(p_actor, p_workspace, p_tool, p_args);   -- Q42/Q43 tools, then agent_invoke_ext (media, maps, planning); same transaction, same human
  end case;
  return coalesce(out, 'null'::jsonb);
end $function$;

-- ── 4. agent_control_run: resume respects plan confirmation ──
CREATE OR REPLACE FUNCTION public.agent_control_run(p_run uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.agent_runs; as_admin boolean := false;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((r.workspace_id is not null and public.has_workspace_role(r.workspace_id, array['owner','manager'])) or r.user_id = auth.uid()) then
    if r.surface = 'admin' and public.has_admin_permission('agent_ops') then as_admin := true;
    else raise exception 'not_authorized' using errcode = '42501'; end if;
  end if;
  if as_admin then perform public.admin_mfa_required(); end if;
  if p_action = 'pause' and r.status in ('queued','planning','running','waiting_external','scheduled','scheduled_wait','retrying','awaiting_plan_confirmation') then
    update public.agent_runs set status = 'paused', lease_until = null, updated_at = now() where id = r.id;
  elsif p_action = 'resume' and r.status = 'paused' then
    if (select kill_switch from public.agent_runtime_controls where id = 1) then raise exception 'agent_disabled' using errcode = '42501'; end if;
    if exists (select 1 from public.agent_policies p where p.workspace_id = r.workspace_id and p.kill_switch) then raise exception 'agent_paused_for_workspace' using errcode = '42501'; end if;
    -- Q53: a plan that still needs the person's confirmation goes back to confirmation, never straight to execution.
    if coalesce((r.interpretation->>'needs_confirmation')::boolean, false) and (r.interpretation->>'confirmed_at') is null then
      update public.agent_runs set status = 'awaiting_plan_confirmation', updated_at = now() where id = r.id;
    else
      update public.agent_runs set status = 'queued', updated_at = now() where id = r.id;
    end if;
  elsif p_action = 'cancel' and r.status not in ('completed','failed','cancelled') then
    update public.agent_runs set status = 'cancelled', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    update public.agent_approvals set status = 'expired' where run_id = r.id and status = 'pending';
  else raise exception 'invalid_run_action' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (auth.uid(), case when as_admin then 'admin' else 'user' end, r.workspace_id, r.id, 'agent.' || p_action, jsonb_build_object('run_id', r.id));
end $function$;
