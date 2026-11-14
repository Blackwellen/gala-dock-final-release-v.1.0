-- Q53 exercise (rolled back): agent_invoke refuses ids from another workspace (events, build items, tiers, spaces, listings) and
-- still serves the run's own records; the agent_run machine accepts planning → completed / queued and paused → confirmation;
-- agent_control_run resume returns an unconfirmed plan to confirmation and queues a confirmed one. Ends with EXERCISE_OK.
do $$
declare a record; foreign_ev uuid; foreign_tier uuid; foreign_item uuid; own_item uuid; rid uuid; st text; out jsonb; s jsonb;
begin
  select w.id ws, w.owner_id owner, e.id ev into a
    from public.workspaces w join public.events e on e.workspace_id = w.id
    join public.workspace_members m on m.workspace_id = w.id and m.user_id = w.owner_id and m.status = 'active'
   where w.kind = 'organizer' and w.status = 'active' and e.status <> 'cancelled'
     and not coalesce((select p.kill_switch from public.agent_policies p where p.workspace_id = w.id), false)
     and (select count(*) from public.agent_runs r where r.workspace_id = w.id and r.created_at > now() - interval '1 hour') < 20
     and not (coalesce((public.ai_credit_status(w.id)->>'hard_cap')::boolean, false) and coalesce((public.ai_credit_status(w.id)->>'available')::numeric, 0) < 1)
   limit 1;
  if a.ws is null then raise exception 'exercise: no organizer workspace with an event'; end if;
  s := public.ai_credit_status(a.ws);
  select e.id into foreign_ev from public.events e where e.workspace_id is not null and e.workspace_id <> a.ws limit 1;
  select t.id into foreign_tier from public.ticket_tiers t join public.events e on e.id = t.event_id where e.workspace_id <> a.ws limit 1;
  select b.id into foreign_item from public.build_items b join public.events e on e.id = b.event_id
   where e.workspace_id <> a.ws and not exists (select 1 from public.listings l where l.id = b.listing_id and l.workspace_id = a.ws) limit 1;
  select b.id into own_item from public.build_items b where b.event_id = a.ev limit 1;

  -- 1. cross-workspace ids are refused before any domain function runs
  begin perform public.agent_invoke(a.owner, a.ws, 'event.budget', jsonb_build_object('event_id', foreign_ev)); raise exception 'foreign event.budget served';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform public.agent_invoke(a.owner, a.ws, 'event.readiness', jsonb_build_object('event_id', foreign_ev)); raise exception 'foreign event.readiness served';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform public.agent_invoke(a.owner, a.ws, 'event.feasibility', jsonb_build_object('event_id', foreign_ev)); raise exception 'foreign event.feasibility served';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform public.agent_invoke(a.owner, a.ws, 'task.create', jsonb_build_object('event_id', foreign_ev, 'title', 'Q53 probe')); raise exception 'task on foreign event';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  if foreign_item is not null then
    begin perform public.agent_scope_check(a.ws, 'marketplace.request_hold', jsonb_build_object('item_id', foreign_item, 'hours', 24)); raise exception 'foreign item accepted';
    exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  end if;
  if foreign_tier is not null then
    begin perform public.agent_scope_check(a.ws, 'tickets.publish_tier', jsonb_build_object('tier_id', foreign_tier)); raise exception 'foreign tier accepted';
    exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  end if;
  begin perform public.agent_scope_check(a.ws, 'calendar.conflicts', jsonb_build_object('space_id', gen_random_uuid())); raise exception 'unknown space accepted';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  -- 2. the run's own records still work (scope check passes; the domain function answers)
  perform public.agent_scope_check(a.ws, 'event.budget', jsonb_build_object('event_id', a.ev, 'within_days', 30));
  if own_item is not null then perform public.agent_scope_check(a.ws, 'message.party', jsonb_build_object('item_id', own_item, 'event_id', a.ev)); end if;
  out := public.agent_invoke(a.owner, a.ws, 'event.budget', jsonb_build_object('event_id', a.ev));
  if out is null or out = 'null'::jsonb then raise exception 'own event.budget empty'; end if;
  out := public.agent_invoke(a.owner, a.ws, 'events.list', '{}'::jsonb);
  if jsonb_typeof(out) <> 'array' then raise exception 'events.list not an array'; end if;

  -- 3. state machine additions
  insert into public.agent_runs(workspace_id, user_id, surface, mode, goal, status, idempotency_key, plan)
    values (a.ws, a.owner, 'organizer', 'do', 'Q53 exercise run', 'queued', 'q53-ex-' || gen_random_uuid(), '[]') returning id into rid;
  update public.agent_runs set status = 'planning' where id = rid;
  update public.agent_runs set status = 'queued' where id = rid;          -- transient planning error → re-queued
  update public.agent_runs set status = 'planning' where id = rid;
  update public.agent_runs set status = 'completed' where id = rid;       -- zero-step conversational reply
  insert into public.agent_runs(workspace_id, user_id, surface, mode, goal, status, idempotency_key, plan, interpretation)
    values (a.ws, a.owner, 'organizer', 'do', 'Q53 exercise run 2', 'queued', 'q53-ex-' || gen_random_uuid(), '[]', '{"needs_confirmation": true}') returning id into rid;
  update public.agent_runs set status = 'planning' where id = rid;
  update public.agent_runs set status = 'awaiting_plan_confirmation' where id = rid;
  update public.agent_runs set status = 'paused' where id = rid;

  -- 4. resume of an unconfirmed plan goes back to confirmation; a confirmed one is queued
  perform set_config('request.jwt.claims', json_build_object('sub', a.owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.agent_control_run(rid, 'resume');
  select status into st from public.agent_runs where id = rid;
  if st <> 'awaiting_plan_confirmation' then raise exception 'unconfirmed resume went to %', st; end if;
  update public.agent_runs set status = 'paused', interpretation = interpretation || jsonb_build_object('confirmed_at', now()) where id = rid;
  perform public.agent_control_run(rid, 'resume');
  select status into st from public.agent_runs where id = rid;
  if st <> 'queued' then raise exception 'confirmed resume went to %', st; end if;

  raise exception 'EXERCISE_OK agent scope + transitions + resume (credits available %)', coalesce(s->>'available', '?');
end $$;
