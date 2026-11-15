-- Q75 exercise (rolled back): late finish alone no longer needs a premises licence / TEN, late-night hot food does; the template
-- scrub accepts ordinary copy and still refuses handlers in tags; platform refunds split VAT; the run clock excludes waits and the
-- time limit / R1-R2 policy modes refuse in agent_governance_refusal; commerce summary aggregates. Ends with EXERCISE_OK.
do $$
declare ws uuid; owner uuid; ev uuid; keys text[]; f jsonb; ch text := 'ch_q75ex_' || substr(md5(random()::text), 1, 10); pi text := 'pi_q75ex_' || substr(md5(random()::text), 1, 10);
  tax bigint; d bigint; run public.agent_runs; tool public.agent_tools; why text; lim jsonb; j jsonb; tpl uuid;
begin
  select w.id, w.owner_id into ws, owner from public.workspaces w
   where w.kind = 'organizer' and w.status = 'active' and w.owner_id is not null
     and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = w.owner_id and m.status = 'active') limit 1;
  if ws is null then raise exception 'exercise: no organizer workspace'; end if;

  -- 1. compliance: conference ending 01:30 London, no answers, no catering → late_night but no late_night_refreshment, rule not applied
  insert into public.events(owner_id, workspace_id, management, name, event_type, status, starts_at, ends_at, capacity, timezone)
    values (owner, ws, 'professional', 'Q75 exercise conf', 'conference', 'draft', date_trunc('day', now()) + interval '30 days 19 hours', date_trunc('day', now()) + interval '31 days 1 hour 30 minutes', 300, 'Europe/London')
    returning id into ev;
  f := public.event_compliance_facts(ev);
  if not (f->>'late_night')::boolean or (f->>'late_night_refreshment')::boolean then raise exception 'facts wrong: %', f; end if;
  select array_agg(q.rule_key) into keys from public.event_compliance_requirements_internal(ev) q;
  if 'premises_or_ten' = any(coalesce(keys, '{}')) then raise exception 'premises_or_ten fired on a late finish alone: %', keys; end if;
  insert into public.build_items(event_id, category, title, status, amount, role) values (ev, 'catering', 'Q75 hot food', 'confirmed', 100, 'primary');
  f := public.event_compliance_facts(ev);
  if not (f->>'late_night_refreshment')::boolean then raise exception 'late-night refreshment not derived: %', f; end if;
  select array_agg(q.rule_key) into keys from public.event_compliance_requirements_internal(ev) q;
  if not ('premises_or_ten' = any(keys) and 'late_night_refreshment' = any(keys)) then raise exception 'rules missing with hot food: %', keys; end if;

  -- 2. template scrub
  insert into public.design_templates(workspace_id, title, width, height, visibility, document) values (ws, 'Q75 ok', 1080, 1080, 'link', '{"layers":[{"text":"Tickets online = yes, onsite=parking"}]}')
    returning id into tpl;
  begin
    insert into public.design_templates(workspace_id, title, width, height, visibility, document) values (ws, 'Q75 bad', 1080, 1080, 'link', '{"layers":[{"svg":"<image src=x onerror=alert(1)>"}]}');
    raise exception 'handler in a tag was accepted';
  exception when others then if sqlerrm <> 'template_active_content' then raise; end if; end;
  begin
    insert into public.design_templates(workspace_id, title, width, height, visibility, document) values (ws, 'Q75 bad2', 1080, 1080, 'link', jsonb_build_object('layers', jsonb_build_array(jsonb_build_object('svg', '<image' || chr(9) || 'onerror=alert(1)>'))));
    raise exception 'tab-separated handler was accepted';
  exception when others then if sqlerrm <> 'template_active_content' then raise; end if; end;

  -- 3. VAT split on a platform refund: sale £120 incl. £20 VAT on fees, refund £60 → £10 back from tax_payable
  perform public.post_ledger_transaction('stripe:pi:' || pi, 'deposit', 'GBP', jsonb_build_array(
    jsonb_build_object('account','cash_stripe','amount_minor',12000,'party_type','platform'),
    jsonb_build_object('account','platform_fee','amount_minor',-10000,'party_type','platform'),
    jsonb_build_object('account','tax_payable','amount_minor',-2000,'party_type','platform')), ws, null, 'charge', pi, 'Q75 exercise sale', pi, 'system');
  d := public.post_stripe_refund_delta(ch, 6000, 'GBP', null, pi);
  select e.amount_minor into tax from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
   where t.idempotency_key = 'stripe:refund-delta:' || ch || ':6000' and e.account = 'tax_payable';
  if d <> 6000 or tax is distinct from 1000 then raise exception 'refund VAT split wrong: delta % tax %', d, tax; end if;
  d := public.post_stripe_refund_delta(ch, 12000, 'GBP', null, pi);
  select coalesce(sum(e.amount_minor), 0) into tax from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
   where t.stripe_ref = ch and e.account = 'tax_payable';
  if tax <> 2000 then raise exception 'full refund should reverse all VAT, got %', tax; end if;
  if public.post_stripe_refund_delta(ch, 12000, 'GBP') <> 0 then raise exception 'replay posted again'; end if;   -- 4-arg delegate

  -- 4. run clock + time limits + policy modes
  insert into public.agent_runs(workspace_id, user_id, surface, mode, goal, status, plan, lease_until, idempotency_key)
    values (ws, owner, 'organizer', 'do', 'Q75 exercise', 'paused', '[]', now() + interval '10 minutes', 'q75ex-' || md5(random()::text)) returning * into run;
  if run.wait_since is null or run.trace_id is null then raise exception 'clock/trace not set on insert'; end if;
  update public.agent_runs set created_at = now() - interval '5 hours', wait_since = now() - interval '4 hours 30 minutes' where id = run.id;
  lim := public.agent_run_time_check(run.id);
  if lim->>'exceeded' is not null then raise exception 'paused time counted as working time: %', lim; end if;
  update public.agent_runs set status = 'queued' where id = run.id;   -- leaves paused: 4.5 h added to wait_human_s
  select * into run from public.agent_runs where id = run.id;
  if run.wait_human_s < 16000 or run.wait_since is not null then raise exception 'wait clock not accumulated: % %', run.wait_human_s, run.wait_since; end if;
  select * into tool from public.agent_tools where id = 'task.create';
  insert into public.agent_policies(workspace_id, mode) values (ws, 'suggest') on conflict (workspace_id) do update set mode = 'suggest', kill_switch = false;
  why := public.agent_governance_refusal(run, owner, tool, null, false, '{}'::jsonb);
  if why is distinct from 'policy_suggest_only' then raise exception 'suggest mode not enforced: %', why; end if;
  update public.agent_policies set mode = 'always_ask' where workspace_id = ws;
  why := public.agent_governance_refusal(run, owner, tool, null, false, '{}'::jsonb);
  if why is distinct from 'approval_required' then raise exception 'always_ask not enforced for R%: %', tool.risk, why; end if;
  update public.agent_policies set mode = 'execute_with_approval', max_run_minutes = 5 where workspace_id = ws;
  update public.agent_runs set created_at = now() - interval '4 hours 40 minutes' where id = run.id;   -- 10 min working > 5
  why := public.agent_governance_refusal((select r from public.agent_runs r where r.id = run.id), owner, tool, null, false, '{}'::jsonb);
  if why is distinct from 'run_time_limit' then raise exception 'max_run_minutes not enforced: %', why; end if;

  -- 5. commerce summary shape
  j := public.admin_commerce_summary(30, now(), false);
  if not (j ? 'cur' and j ? 'prev') then raise exception 'summary shape: %', j; end if;

  raise exception 'EXERCISE_OK Q75 leftovers';
end $$;
