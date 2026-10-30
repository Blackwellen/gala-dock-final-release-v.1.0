-- Q43 follow-up (lane D, 2026-10-29): the read-only payout readiness tool is renamed money.payout_ready -> money.release_readiness so no
-- tool id matches the "never moves money / changes payout details" guard (tests/release/agent-credits.spec.ts). Same function as 4032
-- otherwise; the regenerated agent tools seed removes the old id (no run step references it).

create or replace function public.agent_invoke_d3(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb; v uuid; ev uuid := nullif(p_args->>'event_id', '')::uuid; days int := coalesce((p_args->>'within_days')::int, 30); x jsonb;
begin
  -- Event-scoped tools: the event must belong to the workspace the agent is acting in.
  if p_tool in ('event.conflicts','event.ops_readiness','compliance.overview','hospitality.summary','logistics.overview','partners.overview','virtual.attendance')
     and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool in ('listing.readiness','listing.availability') and not exists (select 1 from public.listings l where l.id = (p_args->>'listing_id')::uuid and l.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool in ('crew.assign','equipment.allocate') and not exists (select 1 from public.provider_jobs j where j.id = (p_args->>'job_id')::uuid and j.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool = 'stock.report' and ev is not null and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  case p_tool
  -- Organizer reads
  when 'calendar.upcoming' then
    out := jsonb_build_object(
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status, 'venue', e.venue_name, 'link', '/organizer/events/' || e.id) order by e.starts_at)
        from public.events e where e.workspace_id = p_workspace and e.status not in ('cancelled') and e.starts_at between now() - interval '1 day' and now() + make_interval(days => days)), '[]'),
      'conflicts', coalesce((select jsonb_agg(to_jsonb(c)) from public.operational_conflicts(p_workspace, now(), now() + make_interval(days => days)) c), '[]'));
  when 'event.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.event_conflicts(ev) c;
  when 'event.ops_readiness' then out := public.event_ops_readiness(ev);
  when 'compliance.overview' then out := public.event_compliance_overview(ev);
  when 'hospitality.summary' then out := public.hospitality_event_summary(ev);
  when 'logistics.overview' then out := public.event_logistics_overview(ev);
  when 'partners.overview' then out := public.event_parties_overview(ev);
  when 'virtual.attendance' then out := public.virtual_attendance_summary(ev);
  when 'campaigns.calendar' then out := public.promotion_calendar(p_workspace, now(), now() + make_interval(days => days));
  when 'campaigns.report' then
    if not exists (select 1 from public.promotion_campaigns c where c.id = (p_args->>'campaign_id')::uuid and c.workspace_id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
    out := public.campaign_report((p_args->>'campaign_id')::uuid);
  when 'sales.client' then
    if not exists (select 1 from public.clients c where c.id = (p_args->>'client_id')::uuid and c.workspace_id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
    out := public.client_overview((p_args->>'client_id')::uuid);
  when 'comms.inbox' then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'counterpart', c.counterpart, 'unread', c.unread, 'last_message_at', c.last_message_at, 'link', '/messages/' || c.id)), '[]') into out
      from public.my_conversations(p_workspace, least(coalesce((p_args->>'limit')::int, 20), 50)) c;
  -- Provider reads
  when 'bookings.upcoming' then
    select coalesce(jsonb_agg(jsonb_build_object('job_id', j.id, 'reference', j.reference, 'event', j.event_name, 'client', j.client_org, 'starts_at', j.starts_at, 'ends_at', j.ends_at, 'space_id', j.space_id,
        'guests', j.guests, 'status', j.status, 'payment_status', j.payment_status, 'next_action', j.next_action, 'next_action_due', j.next_action_due, 'link', '/provider/bookings/' || j.id) order by j.starts_at), '[]') into out
      from public.provider_jobs j where j.workspace_id = p_workspace and j.status in ('held','confirmed','active') and j.starts_at between now() - interval '1 day' and now() + make_interval(days => days);
  when 'opportunities.sla' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'event', e.name, 'status', b.status, 'response_deadline', b.response_deadline,
        'hours_left', case when b.response_deadline is not null then round((extract(epoch from b.response_deadline - now()) / 3600)::numeric, 1) end,
        'overdue', b.response_deadline is not null and b.response_deadline < now(), 'starts_at', e.starts_at, 'link', '/provider/opportunities/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      where l.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','clarification','conditional_hold_requested');
  when 'listing.readiness' then out := public.listing_readiness((p_args->>'listing_id')::uuid);
  when 'listing.availability' then
    out := jsonb_build_object('listing_id', p_args->>'listing_id', 'availability', public.listing_window_availability((p_args->>'listing_id')::uuid, (p_args->>'starts_at')::timestamptz,
      (p_args->>'ends_at')::timestamptz, nullif(p_args->>'guests', '')::int));
  when 'trust.summary' then out := public.trust_summary(p_workspace);
  when 'money.release_readiness' then
    select jsonb_build_object('payout_eligible', public.payout_eligible(p_workspace),
      'protected', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'protected_pending_delivery'), 0) / 100.0,
      'releasing', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'eligible_for_provider_transfer'), 0) / 100.0,
      'released', coalesce(sum(transferred_minor) filter (where status in ('transfer_created','paid_out')), 0) / 100.0) into out
      from public.payment_orders where payee_workspace_id = p_workspace;
  when 'stock.report' then out := public.stock_report(p_workspace, ev);   -- organizer stock (bar / consumables / merchandise)
  -- Provider R1/R2/R3
  when 'quote.draft' then
    v := public.provider_issue_quote((p_args->>'item_id')::uuid, p_args->'items', coalesce((p_args->>'tax_bps')::int, 0), coalesce((p_args->>'deposit_pct')::int, 30),
      coalesce((p_args->>'valid_days')::int, 14), '{}'::jsonb, coalesce(p_args->>'message', ''), false);
    out := jsonb_build_object('quote_id', v, 'status', 'draft', 'link', '/provider/opportunities/' || (p_args->>'item_id'));
  when 'crew.assign' then
    v := public.provider_assign_crew((p_args->>'job_id')::uuid, (p_args->>'crew_id')::uuid, coalesce(p_args->>'role', 'crew'));
    out := jsonb_build_object('assignment_id', v, 'link', '/provider/bookings/' || (p_args->>'job_id'));
  when 'equipment.allocate' then
    v := public.provider_allocate_equipment((p_args->>'job_id')::uuid, (p_args->>'equipment_id')::uuid, (p_args->>'quantity')::int);
    out := jsonb_build_object('allocation_id', v, 'link', '/provider/bookings/' || (p_args->>'job_id'));
  when 'availability.emergency_window' then
    v := public.provider_set_availability(p_workspace, 'emergency_window', (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz,
      nullif(p_args->>'listing_id', '')::uuid, nullif(p_args->>'space_id', '')::uuid, null, coalesce(p_args->>'note', ''));
    out := jsonb_build_object('block_id', v, 'kind', 'emergency_window');
  -- Memory (both surfaces)
  when 'memory.recall' then
    select coalesce(jsonb_agg(jsonb_build_object('key', m.key, 'value', m.value, 'kind', m.kind, 'scope', m.scope, 'updated_at', m.updated_at) order by m.updated_at desc), '[]') into out
      from (select * from public.agent_memories m where m.workspace_id = p_workspace and m.expires_at > now() and (m.scope = 'workspace' or m.user_id = p_actor)
              and (p_args->>'kind' is null or m.kind = p_args->>'kind') order by m.updated_at desc limit 40) m;
  when 'memory.remember' then
    out := public.agent_memory_remember(p_workspace, p_args->>'key', p_args->>'value', coalesce(p_args->>'kind', 'preference'), coalesce(p_args->>'scope', 'workspace'), nullif(p_args->>'_run', '')::uuid);
  when 'mission.wait_for' then raise exception 'runtime_control_tool' using errcode = '22023', hint = 'mission.wait_for is handled by the run engine (agent_mission_wait), not executed as a domain action.';
  else out := public.agent_invoke_ext(p_workspace, p_tool, p_args);   -- lane A media / map / planning tools
  end case;
  return out;
end $$;
