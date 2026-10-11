-- Media Studio agent tools (media spec §52–54). Extends agent_invoke without rewriting its core dispatch: the caller has already
-- impersonated the human and checked workspace membership + tool permission, so every call below runs under that person's rights.
create or replace function public.agent_invoke_ext(p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb; v uuid;
begin
  case p_tool
  when 'media.list_designs' then
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'status', d.status, 'source', d.source, 'updated_at', d.updated_at, 'link', '/studio/' || d.id) order by d.updated_at desc), '[]') into out
      from (select * from public.designs x where x.workspace_id = p_workspace and x.deleted_at is null
              and (p_args->>'event_id' is null or x.event_id = (p_args->>'event_id')::uuid) order by x.updated_at desc limit 30) d;
  when 'media.event_poster' then
    if not exists (select 1 from public.events e where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
    v := public.create_design(p_workspace, (p_args->>'event_id')::uuid, coalesce(p_args->>'title', 'Agent draft poster'), p_args->'document', 'agent', null, null);
    out := jsonb_build_object('design_id', v, 'status', 'draft', 'link', '/studio/' || v);
  else raise exception 'tool_not_executable:%', p_tool using errcode = '22023';
  end case;
  return out;
end $$;
revoke all on function public.agent_invoke_ext(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_invoke_ext(uuid, text, jsonb) to service_role;

-- agent_invoke: unchanged except that unknown tools fall through to agent_invoke_ext.
create or replace function public.agent_invoke(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  else out := public.agent_invoke_ext(p_workspace, p_tool, p_args);   -- later domains (media, …); runs in this transaction as the same human
  end case;
  return coalesce(out, 'null'::jsonb);
end $$;
