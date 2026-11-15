-- Q75 leftovers lane (2026-11-14). Additive: new columns with defaults, new functions, create-or-replace of existing functions with
-- the SAME signatures (bodies = live body + the change described), ALTER POLICY (narrower/extra predicates), bounded UPDATEs of
-- rows this file owns. Prior bodies (pg_get_functiondef, live 2026-11-14) are kept in the lane report for rollback.
--
-- 1. Q73 compliance: premises_or_ten / ten_capacity fired on a LATE FINISH alone ("late_night" = ends after 23:00). A late finish is not
--    a licensable activity; late-night REFRESHMENT is (hot food/drink 23:00–05:00, Licensing Act 2003 sch. 2). New derived fact
--    late_night_refreshment = late_night AND hot_food; the two rules use it instead of late_night. Alcohol / live or recorded music
--    still trigger them as before; unanswered profiles stay a warning (compliance_profile_missing), as designed.
-- 2. Q51 admin: admin_commerce_summary (SECURITY INVOKER, RLS-scoped) aggregates the ledger in SQL (was summed from a 5,000-row
--    capped list); admin_transaction_stripe_target says where a charge lives (platform vs the seller's connected account) for the
--    "Open in Stripe" link; admin_request_money: payout retries only for FAILED payouts, never above the payout, once while pending.
-- 3. Q53 agent: run clocks (wait_human_s / wait_idle_s / wait_since, trigger agent_runs_wait_clock) + agent_run_time_check:
--    max_run_minutes caps WORKING time (waits for people / replies / quiet hours don't count); agent.long_runs gates working time
--    above 240 min and a lifetime above 24 h (with it: up to the policy and 14 days). Enforced in agent_governance_refusal (so in
--    agent_execute_tool), agent_mission_wait (wait clamped to the lifetime left) and the runtime. Policy modes R1/R2 enforced
--    server-side: suggest refuses R1+, draft refuses R2+, always_ask needs a live approval for R1+. Trace ids: agent_runs.trace_id,
--    ai_usage_events.trace_id + provider_request_id (record_ai_usage_traced, trigger fills the run's trace). Per-workspace
--    conversation retention (agent_policies.retention_days, 30..2190, default 365) in agent_retention_purge, now daily.
-- 4. Q56 ads: platform refund postings split VAT (post_stripe_refund_delta 5-arg; the 4-arg one delegates); boost spend readable
--    by owner/manager/finance only; rank_venues_for_event skips trust-held and demo-hidden venues; events_public_read (anon) hides
--    demo-hidden events like events_public / listings already do.
-- 5. Q55: design_templates_scrub refused ordinary text such as " online = yes" (\son[a-z]+=); now only event-handler attributes
--    inside an HTML tag.
-- 6. Messaging add-on: email_outbox retention rule (DRAFT, disabled, legal review) + retention_apply branch: sent/suppressed rows
--    older than 90 days lose body and link, keep recipient/category/subject/status/timestamps.

-- ═══ 1. Q73 compliance facts ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.event_compliance_facts(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; pr public.event_compliance_profiles; tz text; late boolean; outdoor boolean; att integer; online boolean; hot boolean; late_f boolean;
begin
  select * into e from public.events where id = p_event;
  if not found then return null; end if;
  select * into pr from public.event_compliance_profiles where event_id = p_event;
  tz := coalesce(nullif(e.timezone, ''), 'Europe/London');
  late := e.ends_at is not null and ((e.ends_at at time zone tz)::time > time '23:00' or (e.ends_at at time zone tz)::time < time '05:00'
    or (e.ends_at at time zone tz)::date > (coalesce(e.starts_at, e.ends_at) at time zone tz)::date);
  outdoor := exists (select 1 from public.programme_items i join public.spaces s on s.id = i.space_id where i.event_id = e.id and not s.indoor)
    or exists (select 1 from public.provider_jobs j join public.build_items b on b.id = j.build_item_id join public.spaces s on s.id = j.space_id where b.event_id = e.id and b.category = 'venue' and not s.indoor);
  online := exists (select 1 from public.event_type_profiles t where t.event_type = e.event_type and t.online)
    or exists (select 1 from public.event_virtual v where v.event_id = e.id and v.format <> 'hybrid');
  att := coalesce(pr.expected_attendance, nullif(e.capacity, 0), nullif(e.guest_count, 0), 0);
  hot := coalesce(pr.hot_food, exists (select 1 from public.build_items b where b.event_id = e.id and b.category in ('catering','food') and b.status not in ('cancelled','declined','unavailable','expired','suggested')));
  late_f := coalesce(pr.late_night, late);
  return jsonb_build_object(
    'country', coalesce(pr.country, nullif(upper((select w.settings ->> 'country' from public.workspaces w where w.id = e.workspace_id)), ''), 'GB'),
    'region', pr.region,
    'event_type', e.event_type,
    'attendance', att,
    'in_person', not online,
    'public', coalesce(e.visibility, 'private') = 'public',
    'alcohol', coalesce(pr.alcohol, exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'drinks' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'hot_food', hot,
    'live_music', coalesce(pr.live_music, exists (select 1 from public.event_parties x where x.event_id = e.id and x.kind in ('artist','performer') and x.status in ('negotiating','confirmed'))
       or exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'entertainment' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'recorded_music', coalesce(pr.recorded_music, exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'dj' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'late_night', late_f,
    -- Q75: the licensable activity is late-night refreshment (hot food or drink supplied 23:00–05:00), not a late finish.
    'late_night_refreshment', late_f and hot,
    'children_performing', coalesce(pr.children_performing, false),
    'outdoor', coalesce(pr.outdoor, outdoor),
    'answered', pr.event_id is not null);
end $function$;

update public.compliance_rules set applies = '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night_refreshment"]}'::jsonb
 where pack_key = 'gb-eng-wal' and key = 'premises_or_ten' and applies = '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night"]}'::jsonb;
update public.compliance_rules set applies = '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night_refreshment"],"min_attendance":500}'::jsonb
 where pack_key = 'gb-eng-wal' and key = 'ten_capacity' and applies = '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night"],"min_attendance":500}'::jsonb;

-- ═══ 2. Q51 admin commerce ═════════════════════════════════════════════════════════════════════════════════════════════════════
-- Same window and rules as the Commerce page (commerce/data.ts + view.tsx): cur = (now − days, now], prev = (now − 2·days, now − days].
-- SECURITY INVOKER: rows are whatever transactions RLS lets the caller read (admins: has_admin_permission('commerce')).
create or replace function public.admin_commerce_summary(p_days integer, p_now timestamptz default now(), p_livemode boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with w as (select greatest(1, least(coalesce(p_days, 30), 366)) d, coalesce(p_now, now()) t),
  x as (
    select tx.*, tx.occurred_at > w.t - make_interval(days => w.d) or tx.occurred_at = w.t - make_interval(days => w.d) as cur,
      lower(coalesce(tx.details ->> 'disputed', '')) not in ('', 'false', '0', 'null') as disputed,
      lower(coalesce(tx.details ->> 'held', '')) not in ('', 'false', '0', 'null') as held,
      case when coalesce(tx.details ->> 'subscriptions', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (tx.details ->> 'subscriptions')::numeric else 1 end as subs,
      case when coalesce(tx.details ->> 'cancelled', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (tx.details ->> 'cancelled')::numeric else 0 end as cancels
    from public.transactions tx, w
    where tx.livemode = coalesce(p_livemode, false) and tx.occurred_at >= w.t - make_interval(days => 2 * w.d) and tx.occurred_at <= w.t),
  s as (select x.*, (x.kind in ('income','fee') and x.status <> 'failed' and not x.disputed) as sale,
               (x.source = 'subscription' and x.kind = 'income' and x.status <> 'failed') as sub from x),
  agg as (select s.cur, jsonb_build_object(
      'gmv', coalesce(sum(s.amount) filter (where s.sale), 0),
      'platform', coalesce(sum(case when s.source = 'subscription' then s.amount else coalesce(s.fee_amount, 0) end) filter (where s.sale), 0),
      'ticketing', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'ticketing'), 0),
      'marketplace', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'marketplace'), 0),
      'subscription', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'income' and s.source = 'subscription'), 0),
      'venue', coalesce(sum(s.amount) filter (where s.sale and s.category = 'Venue Booking'), 0),
      'supplier', coalesce(sum(s.amount) filter (where s.sale and s.category = 'Supplier Service'), 0),
      'other_fees', coalesce(sum(s.amount) filter (where s.sale and s.kind = 'fee'), 0),
      'n', count(*),
      'failed', count(*) filter (where s.status = 'failed' and s.kind <> 'payout' and s.source <> 'subscription'),
      'held', count(*) filter (where s.held),
      'refunds', count(*) filter (where s.kind = 'refund'),
      'disputes', count(*) filter (where s.disputed),
      'sub_issues', count(*) filter (where s.source = 'subscription' and s.status = 'failed'),
      'payout_fails', count(*) filter (where s.kind = 'payout' and s.status = 'failed'),
      'ok', count(*) filter (where s.kind in ('income','payment') and s.status = 'completed' and not s.held and not s.disputed),
      'pending', count(*) filter (where s.status = 'pending' and not s.held),
      'failed_all', count(*) filter (where s.status = 'failed'),
      'sub_count', coalesce(sum(s.subs) filter (where s.sub), 0),
      'sub_cancelled', coalesce(sum(s.cancels) filter (where s.sub), 0),
      'mrr', coalesce(sum(s.amount) filter (where s.sub), 0),
      'payouts_paid', coalesce(sum(abs(s.amount)) filter (where s.kind = 'payout' and s.status = 'completed'), 0),
      'payouts_pending', coalesce(sum(abs(s.amount)) filter (where s.kind = 'payout' and s.status in ('pending','scheduled')), 0),
      'payouts_pending_n', count(*) filter (where s.kind = 'payout' and s.status in ('pending','scheduled')),
      'payouts_failed_n', count(*) filter (where s.kind = 'payout' and s.status = 'failed')) j
    from s group by s.cur)
  select jsonb_build_object('cur', coalesce((select a.j from agg a where a.cur), '{}'::jsonb), 'prev', coalesce((select a.j from agg a where not a.cur), '{}'::jsonb));
$$;
revoke all on function public.admin_commerce_summary(integer, timestamptz, boolean) from public, anon;
grant execute on function public.admin_commerce_summary(integer, timestamptz, boolean) to authenticated, service_role;

-- Where a ledger line's Stripe object lives. DEC-107 direct charges, their refunds/disputes and seller payouts are on the seller's
-- connected account (the platform dashboard search never finds them); subscriptions, platform fees and destination/legacy charges
-- are on the platform. Returns {platform, account}; account null = unknown (the page hides the link).
create or replace function public.admin_transaction_stripe_target(p_tx uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.transactions; acct text; strat text;
begin
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into t from public.transactions where id = p_tx;
  if not found or t.stripe_ref is null then return null; end if;
  if t.source in ('subscription','manual') or t.stripe_ref like 'in\_%' or t.stripe_ref like 'fee\_%' then
    return jsonb_build_object('platform', true, 'account', null);
  end if;
  select o.strategy, o.connected_account_id into strat, acct from public.checkout_orders o
    where o.stripe_payment_intent = t.stripe_ref or o.stripe_charge = t.stripe_ref limit 1;
  if strat is null then
    select o.strategy, o.payee_connected_account_id into strat, acct from public.payment_orders o
      where o.stripe_payment_intent = t.stripe_ref or o.stripe_charge = t.stripe_ref limit 1;
  end if;
  if strat is null then
    select o.strategy, o.connected_account_id into strat, acct from public.merch_orders o
      where o.stripe_payment_intent = t.stripe_ref or o.stripe_charge = t.stripe_ref limit 1;
  end if;
  if strat is not null and strat <> 'direct' then return jsonb_build_object('platform', true, 'account', null); end if;
  if acct is null and t.workspace_id is not null then
    select c.stripe_account_id into acct from public.connect_accounts c where c.workspace_id = t.workspace_id and c.livemode = t.livemode
      order by c.updated_at desc nulls last limit 1;
  end if;
  return jsonb_build_object('platform', false, 'account', acct);
end $$;
revoke all on function public.admin_transaction_stripe_target(uuid) from public, anon;
grant execute on function public.admin_transaction_stripe_target(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_request_money(p_kind text, p_transaction uuid, p_partner uuid, p_case uuid, p_amount numeric, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.transactions; rid uuid; already numeric;
begin
  -- Q68 (owner decision 2026-11-14): partners are paid by bank transfer recorded on their monthly statement (Partners → Payouts →
  -- Mark paid). Money requests for partners are retired; old rows stay readable and open ones can still be cancelled.
  if p_kind = 'partner_payout' then raise exception 'partner_payout_retired' using errcode = '55000'; end if;
  if p_case is not null and public.has_admin_permission('support') then perform public.admin_require('support', p_reason);
  else perform public.admin_require('commerce', p_reason); end if;
  if p_kind not in ('refund','payout_retry') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_transaction is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.transactions where id = p_transaction;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'refund' then
    if t.kind not in ('income','payment') or t.status not in ('completed','partial') then raise exception 'not_refundable' using errcode = '22023'; end if;
    select coalesce(sum(amount), 0) into already from public.admin_money_requests where transaction_id = t.id and kind = 'refund' and status in ('pending','processing','completed');
    if already + p_amount > abs(t.amount) then raise exception 'refund_exceeds_amount' using errcode = '22023'; end if;
  else
    -- Q75: only a payout Stripe reported as FAILED can be retried (pending / scheduled payouts are still in flight), never for more
    -- than the payout, and once while a retry request is open.
    if t.kind <> 'payout' or t.status <> 'failed' then raise exception 'not_retryable' using errcode = '22023'; end if;
    if p_amount > abs(t.amount) then raise exception 'retry_exceeds_amount' using errcode = '22023'; end if;
    if exists (select 1 from public.admin_money_requests r where r.transaction_id = t.id and r.kind = 'payout_retry' and r.status in ('pending','processing')) then
      raise exception 'retry_already_requested' using errcode = '23505';
    end if;
  end if;
  insert into public.admin_money_requests(kind, transaction_id, partner_id, case_id, amount, reason, requested_by, requested_by_name)
    values (p_kind, p_transaction, null, p_case, round(p_amount, 2), trim(p_reason), auth.uid(), public.admin_actor_name()) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), t.workspace_id, 'admin.money_request_' || p_kind,
    jsonb_build_object('request_id', rid, 'transaction_id', p_transaction, 'partner_id', null, 'case_id', p_case, 'amount', p_amount, 'reason', p_reason));
  if p_case is not null then
    insert into public.support_messages(case_id, author_id, author, body, internal, role)
      values (p_case, auth.uid(), public.admin_actor_name(), 'Refund request of £' || to_char(p_amount, 'FM999999990.00') || ' recorded (pending processor). Reason: ' || left(trim(p_reason), 300), true, 'support');
  end if;
  return rid;
end $function$;

-- ═══ 3. Q53 Gala Agent: run clocks, time limits, policy modes, tracing, retention ═══════════════════════════════════════════════
alter table public.agent_runs add column if not exists wait_human_s integer not null default 0;
alter table public.agent_runs add column if not exists wait_idle_s integer not null default 0;
alter table public.agent_runs add column if not exists wait_since timestamptz;
alter table public.agent_runs add column if not exists trace_id uuid default gen_random_uuid();
alter table public.ai_usage_events add column if not exists trace_id uuid;
alter table public.ai_usage_events add column if not exists provider_request_id text;
create index if not exists ai_usage_events_trace_idx on public.ai_usage_events(trace_id) where trace_id is not null;
create index if not exists agent_runs_trace_idx on public.agent_runs(trace_id);

-- Parked time: waiting for a person (approval, plan confirmation, paused) or for something else (provider reply, quiet hours,
-- schedule, retry backoff). Accumulated on every status change; working time = lifetime − both, lifetime = age − human waits.
create or replace function public.agent_runs_wait_clock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    new.wait_human_s := old.wait_human_s; new.wait_idle_s := old.wait_idle_s;
    if old.wait_since is not null then
      if old.status in ('waiting_approval','awaiting_plan_confirmation','paused') then
        new.wait_human_s := old.wait_human_s + greatest(0, extract(epoch from now() - old.wait_since))::integer;
      elsif old.status in ('waiting_external','scheduled_wait','scheduled','retrying') then
        new.wait_idle_s := old.wait_idle_s + greatest(0, extract(epoch from now() - old.wait_since))::integer;
      end if;
    end if;
    new.wait_since := null;
  end if;
  if new.status in ('waiting_approval','awaiting_plan_confirmation','paused','waiting_external','scheduled_wait','scheduled','retrying') then
    new.wait_since := now();
  end if;
  return new;
end $$;
drop trigger if exists agent_runs_wait_clock on public.agent_runs;
create trigger agent_runs_wait_clock before insert or update of status on public.agent_runs for each row execute function public.agent_runs_wait_clock();
-- Runs parked right now start their clock at their last update (bounded backfill: only parked rows without a clock).
update public.agent_runs set wait_since = updated_at
 where wait_since is null and status in ('waiting_approval','awaiting_plan_confirmation','paused','waiting_external','scheduled_wait','scheduled','retrying');

create or replace function public.agent_run_time_check(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.agent_runs; pol public.agent_policies; long boolean; max_min integer; max_h integer; open_s numeric := 0; life numeric; active numeric; ex text;
begin
  select * into r from public.agent_runs where id = p_run;
  if not found then return null; end if;
  select * into pol from public.agent_policies where workspace_id = r.workspace_id;
  long := r.workspace_id is not null and coalesce(public.has_capability(r.workspace_id, 'agent.long_runs'), false);
  max_min := greatest(5, coalesce(pol.max_run_minutes, 240));
  if not long then max_min := least(max_min, 240); end if;   -- above the standard 4 h needs agent.long_runs
  max_h := case when long then 336 else 24 end;              -- runs that stay alive (waiting) over a day need agent.long_runs
  if r.wait_since is not null then open_s := greatest(0, extract(epoch from now() - r.wait_since)); end if;
  life := extract(epoch from now() - r.created_at) - r.wait_human_s
          - case when r.status in ('waiting_approval','awaiting_plan_confirmation','paused') then open_s else 0 end;
  active := life - r.wait_idle_s - case when r.status in ('waiting_external','scheduled_wait','scheduled','retrying') then open_s else 0 end;
  ex := case when active > max_min * 60 then 'run_time_limit' when life > max_h * 3600 then 'run_lifetime_limit' end;
  return jsonb_build_object('active_minutes', round(active / 60, 1), 'max_minutes', max_min, 'lifetime_hours', round(life / 3600, 2), 'max_lifetime_hours', max_h,
    'lifetime_left_hours', round((max_h * 3600 - life) / 3600, 2), 'long_runs', long, 'exceeded', ex);
end $$;
revoke all on function public.agent_run_time_check(uuid) from public, anon, authenticated;
grant execute on function public.agent_run_time_check(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.agent_governance_refusal(p_run agent_runs, p_actor uuid, p_tool agent_tools, p_approval uuid, p_policy_auto boolean, p_args jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.workspaces; pol public.agent_policies; ap public.agent_approvals; disabled jsonb; amount bigint := public.agent_tool_amount_minor(p_tool.id, p_args); lim jsonb;
begin
  if (select kill_switch from public.agent_runtime_controls where id = 1) then return 'platform_kill_switch'; end if;
  select value -> 'tools_disabled' into disabled from public.setting_at('agent', now());
  if disabled is not null and disabled ? p_tool.id then return 'tool_disabled'; end if;
  if p_run.surface = 'customer' or p_run.surface is null then return 'surface_not_allowed'; end if;
  if not (p_run.surface = any(p_tool.exposure)) then return 'tool_not_exposed'; end if;
  if p_tool.risk >= 5 then return 'risk_r5_never'; end if;
  if p_run.workspace_id is null then return 'workspace_required'; end if;
  select * into w from public.workspaces where id = p_run.workspace_id;
  if not found or w.status <> 'active' then return 'workspace_inactive'; end if;
  if w.kind <> p_run.surface then return 'surface_mismatch'; end if;
  select * into pol from public.agent_policies where workspace_id = p_run.workspace_id;
  if coalesce(pol.kill_switch, false) then return 'workspace_kill_switch'; end if;
  if p_tool.plan_capability is not null and not public.has_capability(p_run.workspace_id, p_tool.plan_capability) then return 'plan_not_entitled'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_run.workspace_id and m.user_id = p_actor and m.status = 'active') then return 'not_a_member'; end if;
  if pol.allowed_tools is not null and not (p_tool.id = any(pol.allowed_tools)) then return 'policy_blocks_tool'; end if;
  -- Q75: max_run_minutes (working time) and the agent.long_runs lifetime, for every governed call.
  lim := public.agent_run_time_check(p_run.id);
  if lim ->> 'exceeded' is not null then return lim ->> 'exceeded'; end if;
  -- Q75: the policy modes for R1/R2 were only applied by the app (registry.decide). suggest = analyse only (R0); draft = drafts only
  -- (R0–R1); always_ask = every change (R1+) needs a live approval decided by this actor.
  if pol.mode = 'suggest' and p_tool.risk >= 1 then return 'policy_suggest_only'; end if;
  if pol.mode = 'draft' and p_tool.risk >= 2 then return 'policy_draft_only'; end if;
  if p_tool.risk >= 3 or (pol.mode = 'always_ask' and p_tool.risk >= 1) then
    if p_approval is not null then
      select * into ap from public.agent_approvals where id = p_approval;
      if not found or ap.run_id is distinct from p_run.id or ap.tool_id is distinct from p_tool.id then return 'approval_mismatch'; end if;
      if ap.status <> 'approved' then return 'approval_not_approved'; end if;
      if ap.decided_by is distinct from p_actor then return 'approval_actor_mismatch'; end if;   -- executes as the approver
      -- An approval authorises exactly what was shown: every executed argument must be in the approved (or edited) payload.
      if p_args is not null and not (coalesce(ap.edited_payload, ap.payload, '{}'::jsonb) @> p_args) then return 'approval_args_mismatch'; end if;
      -- Above the configured booking / pricing authority only the owner can approve (decide_agent_approval checks the card's
      -- amount; this re-checks the amount computed from the arguments actually executed).
      if coalesce(pol.booking_authority_minor, 0) > 0 and amount > pol.booking_authority_minor
         and not exists (select 1 from public.workspaces o where o.id = p_run.workspace_id and o.owner_id = p_actor)
         and not exists (select 1 from public.workspace_members m where m.workspace_id = p_run.workspace_id and m.user_id = p_actor and m.role = 'owner' and m.status = 'active') then
        return 'exceeds_booking_authority';
      end if;
    elsif coalesce(p_policy_auto, false) and p_tool.risk >= 3 then
      if coalesce(pol.booking_authority_minor, 0) > 0 and amount > pol.booking_authority_minor then return 'exceeds_booking_authority'; end if;
      if not ((p_tool.risk = 3 and pol.mode in ('operational','policy_autopilot') and p_tool.id = any(coalesce(pol.auto_tools, '{}')))
              or (pol.mode = 'policy_autopilot' and exists (select 1 from jsonb_array_elements(coalesce(pol.autopilot_rules, '[]')) r
                    where r->>'tool' = p_tool.id and (r->>'max_amount_minor' is null or amount <= (r->>'max_amount_minor')::bigint)))) then
        return 'approval_required';
      end if;
    else
      return 'approval_required';
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.agent_mission_wait(p_run uuid, p_step uuid, p_item uuid, p_hours integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.agent_runs; w public.agent_waits; b public.build_items; lim jsonb; hrs integer;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  select * into b from public.build_items where id = p_item;
  if not found or not exists (select 1 from public.events e where e.id = b.event_id and e.workspace_id = r.workspace_id)
     and not exists (select 1 from public.listings l where l.id = b.listing_id and l.workspace_id = r.workspace_id) then
    raise exception 'not_found' using errcode = 'P0002';   -- only items of the run's own workspace (as organiser or provider)
  end if;
  select * into w from public.agent_waits where run_id = p_run and step_id is not distinct from p_step and kind = 'external' order by created_at desc limit 1;
  if found and w.satisfied_at is not null then
    return jsonb_build_object('satisfied', true, 'outcome', w.outcome, 'detail', w.outcome_detail, 'wait_id', w.id);
  end if;
  if found and w.until_at is not null and w.until_at <= now() then
    update public.agent_waits set satisfied_at = now(), outcome = 'expired', outcome_detail = jsonb_build_object('status', b.status) where id = w.id;
    insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
      values ('system', r.workspace_id, r.id, 'agent.mission_resumed', jsonb_build_object('wait_id', w.id, 'outcome', 'expired', 'item', p_item));
    return jsonb_build_object('satisfied', true, 'outcome', 'expired', 'detail', jsonb_build_object('status', b.status), 'wait_id', w.id);
  end if;
  if not found then
    -- Q75: a wait never outlives the run's lifetime (24 h without agent.long_runs, 14 days with it).
    lim := public.agent_run_time_check(p_run);
    hrs := greatest(1, least(coalesce(p_hours, 72), 336));
    if coalesce((lim ->> 'lifetime_left_hours')::numeric, 0) < 1 then raise exception 'run_lifetime_limit' using errcode = '54000'; end if;
    hrs := least(hrs, floor((lim ->> 'lifetime_left_hours')::numeric)::integer);
    insert into public.agent_waits(run_id, step_id, kind, until_at, ref_id, aggregate_type, aggregate_id, from_status)
      values (p_run, p_step, 'external', now() + make_interval(hours => hrs), p_item, 'build_item', p_item::text, b.status) returning * into w;
    insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
      values ('agent', r.workspace_id, r.id, 'agent.mission_waiting', jsonb_build_object('wait_id', w.id, 'item', p_item, 'from_status', b.status, 'until', w.until_at,
        'hours', hrs, 'clamped', hrs < greatest(1, least(coalesce(p_hours, 72), 336))));
  end if;
  if r.status not in ('waiting_external','cancelled','completed','failed','paused') then
    update public.agent_runs set status = 'waiting_external', waiting_reason = 'Waiting for a response on a request', next_wake_at = w.until_at, lease_until = null, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('waiting', true, 'until', w.until_at, 'wait_id', w.id, 'from_status', w.from_status);
end $function$;

-- Trace ids: llm.ts calls record_ai_usage_traced (service role) with the call's trace id and Azure's request id; a metered call for
-- a run without its own trace id inherits the run's (agent_runs.trace_id), so a run's model calls can be listed with one id.
create or replace function public.ai_usage_events_trace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.trace_id := coalesce(new.trace_id, nullif(current_setting('gala.ai_trace', true), '')::uuid,
    case when new.run_id is not null then (select r.trace_id from public.agent_runs r where r.id = new.run_id) end);
  new.provider_request_id := coalesce(new.provider_request_id, left(nullif(current_setting('gala.ai_request', true), ''), 120));
  return new;
end $$;
revoke all on function public.ai_usage_events_trace() from public, anon, authenticated;
drop trigger if exists ai_usage_events_trace on public.ai_usage_events;
create trigger ai_usage_events_trace before insert on public.ai_usage_events for each row execute function public.ai_usage_events_trace();

create or replace function public.record_ai_usage_traced(p_workspace uuid, p_user uuid, p_run uuid, p_purpose text, p_model text, p_input integer, p_cached integer, p_output integer,
  p_trace uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('gala.ai_trace', coalesce(p_trace::text, ''), true);
  perform set_config('gala.ai_request', coalesce(left(regexp_replace(coalesce(p_request_id, ''), '[^A-Za-z0-9._:-]', '', 'g'), 120), ''), true);
  return public.record_ai_usage(p_workspace, p_user, p_run, p_purpose, p_model, p_input, p_cached, p_output);
end $$;
revoke all on function public.record_ai_usage_traced(uuid, uuid, uuid, text, text, integer, integer, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.record_ai_usage_traced(uuid, uuid, uuid, text, text, integer, integer, integer, uuid, text) to service_role;

-- Per-workspace conversation retention (agent_policies.retention_days, default 365 = the previous fixed 12 months, clamped
-- 30..2190). Past it, runs without approvals / executed external actions are deleted; runs kept as audit evidence lose their
-- conversation content (goal text, answers, step and tool outputs) but keep tool ids, arguments' hashes, approvals and timestamps.
-- Legal holds on the workspace stop both. Everything terminal is deleted after 6 years as before.
CREATE OR REPLACE FUNCTION public.agent_retention_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n_runs integer; n_old integer; n_watch integer; n_usage integer; n_scrub integer;
begin
  create temporary table if not exists pg_temp.agent_expired(id uuid primary key) on commit drop;
  truncate pg_temp.agent_expired;
  insert into pg_temp.agent_expired
    select r.id from public.agent_runs r left join public.agent_policies p on p.workspace_id = r.workspace_id
    where r.status in ('completed','failed','cancelled','partially_completed')
      and r.created_at < now() - make_interval(days => greatest(30, least(coalesce(p.retention_days, 365), 2190)))
      and (r.workspace_id is null or not public.legal_hold_covers('workspace', r.workspace_id));
  delete from public.agent_runs r using pg_temp.agent_expired x
  where r.id = x.id
    and not exists (select 1 from public.agent_approvals a where a.run_id = r.id)
    and not exists (select 1 from public.agent_run_steps s join public.agent_tools t on t.id = s.tool_id where s.run_id = r.id and t.risk >= 3 and s.status = 'succeeded');
  get diagnostics n_runs = row_count;
  update public.agent_runs r set goal = '[removed after the retention period]', result = null, summary = null, interpretation = '{}'::jsonb, errors = '[]'::jsonb
    from pg_temp.agent_expired x where r.id = x.id and r.goal <> '[removed after the retention period]';
  get diagnostics n_scrub = row_count;
  update public.agent_run_steps s set output = null, reason = '' from pg_temp.agent_expired x where s.run_id = x.id and (s.output is not null or s.reason <> '');
  update public.agent_tool_calls c set output = null from pg_temp.agent_expired x where c.run_id = x.id and c.output is not null;
  delete from public.agent_runs r where r.created_at < now() - interval '6 years' and r.status in ('completed','failed','cancelled','partially_completed');
  get diagnostics n_old = row_count;
  delete from public.agent_watches w where w.status <> 'active' and w.created_at < now() - interval '12 months';
  get diagnostics n_watch = row_count;
  delete from public.ai_usage_events u where u.created_at < now() - interval '6 years';
  get diagnostics n_usage = row_count;
  insert into public.audit_events(actor_type, event, metadata)
    values ('system', 'retention.agent_purged', jsonb_build_object('runs_retention', n_runs, 'runs_scrubbed', n_scrub, 'runs_6y', n_old, 'watches', n_watch, 'usage_6y', n_usage));
  return jsonb_build_object('runs_retention', n_runs, 'runs_scrubbed', n_scrub, 'runs_6y', n_old, 'watches', n_watch, 'usage_6y', n_usage);
end $function$;

-- Daily (was monthly), so a 30-day setting is honoured within a day.
do $$ begin
  perform cron.schedule('agent-retention', '15 4 * * *', 'select public.agent_retention_purge()');
end $$;

-- ═══ 4. Q56 ads / money ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- Platform-charge refunds: the sale credited tax_payable for the VAT on Gala Dock's fees (payment_order_succeeded, boosts); the
-- refund debited the whole amount to `refunds`, so VAT payable stayed overstated. The VAT share of each refund increment is now
-- debited to tax_payable (pro rata to the sale's VAT / gross, never more than the VAT not yet reversed). New 5-arg version takes
-- the PaymentIntent (the sale was posted under it; the webhook passes charge.payment_intent); the 4-arg one delegates.
create or replace function public.post_stripe_refund_delta(p_charge text, p_total bigint, p_currency text, p_order_ref text, p_payment_intent text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare prior bigint; posted bigint; delta bigint; wid uuid; eid uuid; cur text; refs text[]; gross bigint; vat bigint; vat_back bigint; v bigint := 0; lines jsonb;
begin
 if p_total<=0 or p_currency !~ '^[A-Z]{3}$' or length(p_charge)<3 then raise exception 'invalid_refund' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-refund:'||p_charge,0));
 -- Preserve legacy cumulative keys and correct any historical overstatement with an immutable reversal.
 select coalesce(max(substring(idempotency_key from '[0-9]+$')::bigint),0) into prior from public.ledger_transactions
  where starts_with(idempotency_key,'stripe:refund:'||p_charge||':');
 insert into public.stripe_refund_totals(charge_id,amount_minor,currency) values(p_charge,prior,p_currency) on conflict do nothing;
 select amount_minor,currency into prior,cur from public.stripe_refund_totals where charge_id=p_charge for update;
 if cur<>p_currency then raise exception 'refund_currency_mismatch'; end if;
 select coalesce(-sum(e.amount_minor),0) into posted from public.ledger_transactions t join public.ledger_entries e on e.transaction_id=t.id
  where t.stripe_ref=p_charge and e.account='cash_stripe' and (starts_with(t.idempotency_key,'stripe:refund:'||p_charge||':') or starts_with(t.idempotency_key,'stripe:refund-delta:'||p_charge||':') or t.idempotency_key='stripe:refund-reconcile:'||p_charge);
 select o.event_id,e.workspace_id into eid,wid from public.checkout_orders o join public.events e on e.id=o.event_id where o.order_ref=p_order_ref;
 if posted>prior then
  perform public.post_ledger_transaction('stripe:refund-reconcile:'||p_charge,'reversal',p_currency,
   jsonb_build_array(jsonb_build_object('account','refunds','amount_minor',prior-posted,'party_type','platform'),jsonb_build_object('account','cash_stripe','amount_minor',posted-prior,'party_type','platform')),
   wid,eid,'charge',p_charge,'Correct legacy cumulative refund overstatement',p_charge,'system');
 end if;
 delta:=greatest(0,p_total-prior);
 if delta=0 then return 0; end if;
 -- Q75: VAT share of this increment.
 refs := array_remove(array[p_charge, nullif(p_payment_intent, ''),
   (select o.stripe_payment_intent from public.payment_orders o where o.stripe_charge = p_charge and o.stripe_payment_intent is not null limit 1),
   (select o.stripe_payment_intent from public.checkout_orders o where o.stripe_charge = p_charge and o.stripe_payment_intent is not null limit 1)], null);
 select coalesce(sum(e.amount_minor) filter (where e.account = 'cash_stripe' and e.amount_minor > 0), 0), coalesce(-sum(e.amount_minor) filter (where e.account = 'tax_payable'), 0)
   into gross, vat
   from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
  where t.stripe_ref = any(refs) and t.kind not in ('refund','reversal') and not starts_with(t.idempotency_key, 'stripe:refund');
 select coalesce(sum(e.amount_minor), 0) into vat_back from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
  where t.stripe_ref = p_charge and starts_with(t.idempotency_key, 'stripe:refund-delta:'||p_charge||':') and e.account = 'tax_payable';
 if gross > 0 and vat > 0 then v := least(greatest(vat - vat_back, 0), round(delta::numeric * vat / gross)::bigint, delta); end if;
 lines := jsonb_build_array(jsonb_build_object('account','refunds','amount_minor',delta - v,'party_type','platform'),jsonb_build_object('account','cash_stripe','amount_minor',-delta,'party_type','platform'));
 if v > 0 then lines := lines || jsonb_build_array(jsonb_build_object('account','tax_payable','amount_minor',v,'party_type','platform')); end if;
 perform public.post_ledger_transaction('stripe:refund-delta:'||p_charge||':'||p_total,'refund',p_currency, lines,
  wid,eid,case when p_order_ref is null then 'charge' else 'checkout_order' end,coalesce(p_order_ref,p_charge),'Refund increment',p_charge,'webhook');
 update public.stripe_refund_totals set amount_minor=p_total where charge_id=p_charge;
 return delta;
end $$;
revoke all on function public.post_stripe_refund_delta(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.post_stripe_refund_delta(text, bigint, text, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.post_stripe_refund_delta(p_charge text, p_total bigint, p_currency text, p_order_ref text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.post_stripe_refund_delta(p_charge, p_total, p_currency, p_order_ref, null::text)
$function$;

-- Boost spend, delivery and attribution are money: owner / manager / finance (and Admin → Commerce), not every member.
alter policy promotion_boosts_read on public.promotion_boosts
  using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'));
alter policy ad_attributions_read on public.ad_attributions
  using (exists (select 1 from public.promotion_boosts b where b.id = ad_attributions.boost_id
    and (public.has_workspace_role(b.workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'))));

-- Organic public events for anonymous visitors hide demo-hidden workspaces like events_public / listings already do.
alter policy events_public_read on public.events
  using (visibility = 'public' and status = any (array['published','on_sale','live']) and not public.demo_hidden_for_viewer(workspace_id));

CREATE OR REPLACE FUNCTION public.rank_venues_for_event(p_event uuid, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; out jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
  with c as (
    select l.*, coalesce(e.guest_count, 0) g,
      -- capacity: 40 pts. Fits and isn't more than twice the size needed → full marks; too small → 0.
      case when coalesce(e.guest_count, 0) = 0 or l.capacity_max is null then 20
           when l.capacity_max < e.guest_count then 0
           when coalesce(l.capacity_min, 0) > e.guest_count then 10
           when l.capacity_max <= e.guest_count * 2 then 40 else 28 end s_cap,
      -- city: 20 pts
      case when e.city is null or e.city = '' then 10 when l.city ilike e.city then 20 else 0 end s_city,
      -- price: 20 pts. Venue at or under 40% of the event budget → full marks, scaled down to 0 at 100%.
      case when coalesce(e.budget_total, 0) = 0 or l.price_from is null then 10
           when l.price_from <= e.budget_total * 0.4 then 20
           when l.price_from >= e.budget_total then 0
           else round(20 * (e.budget_total - l.price_from) / (e.budget_total * 0.6))::int end s_price,
      -- rating: 15 pts (needs at least one review)
      case when coalesce(l.review_count, 0) = 0 then 7 else round(least(coalesce(l.rating, 0), 5) * 3)::int end s_rating,
      -- responsiveness: 5 pts
      case when l.response_hours is null then 2 when l.response_hours <= 4 then 5 when l.response_hours <= 24 then 3 else 1 end s_resp
    from public.listings l
    -- Q75: never recommend a venue under a Trust & Safety hold, or a demo workspace hidden from this viewer.
    where l.kind = 'venue' and l.published and l.paused_at is null
      and not public.trust_listing_held(l.id) and not public.demo_hidden_for_viewer(l.workspace_id)
  )
  select coalesce(jsonb_agg(r order by (r->>'score')::int desc), '[]') into out from (
    select jsonb_build_object('listing_id', c.id, 'name', c.name, 'city', c.city, 'capacity', jsonb_build_object('min', c.capacity_min, 'max', c.capacity_max),
      'price_from', c.price_from, 'rating', c.rating, 'reviews', c.review_count,
      'score', c.s_cap + c.s_city + c.s_price + c.s_rating + c.s_resp,
      'reasons', jsonb_strip_nulls(jsonb_build_object(
        'capacity', case when c.g = 0 then 'Guest count not set' when c.capacity_max is null then 'Capacity not listed'
                         when c.capacity_max < c.g then 'Too small for ' || c.g || ' guests' when coalesce(c.capacity_min, 0) > c.g then 'Minimum is ' || c.capacity_min || ' guests'
                         when c.capacity_max <= c.g * 2 then 'Good fit for ' || c.g || ' guests' else 'Larger than needed' end,
        'city', case when e.city is null or e.city = '' then null when c.city ilike e.city then 'In ' || e.city else 'Outside ' || e.city end,
        'price', case when coalesce(e.budget_total, 0) = 0 or c.price_from is null then null
                      else 'From ' || c.price_from || ' (' || round(100 * c.price_from / e.budget_total) || '% of budget)' end)),
      'link', '/marketplace/' || coalesce(c.slug, c.id::text)) r
    from c order by c.s_cap + c.s_city + c.s_price + c.s_rating + c.s_resp desc, c.rating desc nulls last limit greatest(1, least(coalesce(p_limit, 8), 20))) x;
  return jsonb_build_object('event', e.name, 'guests', e.guest_count, 'city', e.city, 'budget', e.budget_total, 'venues', out,
    'method', 'Capacity 40 · city 20 · price vs budget 20 · rating 15 · response time 5');
end $function$;

-- ═══ 5. Q55 template scrub ════════════════════════════════════════════════════════════════════════════════════════════════════
-- "\son[a-z]+\s*=" refused ordinary copy (" online = …", " onsite=yes"). Event handlers only exist as attributes inside a tag:
-- <tag … on…= after whitespace, "/", a quote or a JSON-escaped \t \n \r \f. Scripts, javascript:, data:text/html, iframe/object/embed
-- are still refused anywhere.
CREATE OR REPLACE FUNCTION public.design_templates_scrub()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t text;
begin
  if new.visibility in ('link','public') and (tg_op = 'INSERT' or new.document is distinct from old.document or new.visibility is distinct from old.visibility) then
    t := new.document::text;
    if t ~* '<script|javascript:|data:text/html|<iframe|<object|<embed'
       or t ~* '<[a-z][^<>]*([[:space:]/"''\\]|\\[tnrf])on[a-z]+[[:space:]]*(\\[tnrf])*[[:space:]]*=' then
      raise exception 'template_active_content' using errcode = '22023';
    end if;
    t := regexp_replace(t, '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '{{contact.email}}', 'g');
    t := regexp_replace(t, '(\+44\s?7\d{3}|\m07\d{3})\s?\d{3}\s?\d{3}\M', '{{contact.phone}}', 'g');
    t := regexp_replace(t, '([?&](token|t|key|sig|signature|code)=)[A-Za-z0-9_\-\.]{6,}', '\1', 'gi');
    t := regexp_replace(t, '\m[a-f0-9]{32,}\M', '', 'gi');
    new.document := t::jsonb;
  end if;
  return new;
end $function$;

-- ═══ 6. email_outbox retention (messaging add-on) ═════════════════════════════════════════════════════════════════════════════
-- DRAFT rule, disabled until legal review: the daily privacy.retention_sweep (retention_sweep_run) applies it once enabled and
-- previews it meanwhile. retention_apply = live body (2026-11-14) + the one 'email_outbox.sent_bodies' branch.
insert into public.data_retention_rules(key, table_name, action, retention_days, basis, enabled, legal_review_required, batch_limit) values
  ('email_outbox.sent_bodies', 'email_outbox', 'redact', 90,
   'Copies of notification emails: after 90 days the body and link are removed; recipient, category, subject, delivery status and timestamps are kept as delivery evidence (complaints, bounces, disputes). DRAFT — legal review of the period.', false, true, 5000)
on conflict (key) do nothing;

CREATE OR REPLACE FUNCTION public.retention_apply(p_key text, p_preview boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.data_retention_rules; cutoff timestamptz; n integer := 0;
begin
  select * into r from public.data_retention_rules where key = p_key;
  if not found then raise exception 'unknown_rule' using errcode = 'P0002'; end if;
  if r.action = 'retain' then return 0; end if;
  cutoff := now() - make_interval(days => r.retention_days);
  case p_key
  when 'rate_limits.stale' then
    if p_preview then select count(*) into n from public.rate_limits where window_start < cutoff;
    else delete from public.rate_limits where ctid in (select ctid from public.rate_limits where window_start < cutoff limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'notifications.read' then
    if p_preview then select count(*) into n from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.notifications where id in (select x.id from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'recently_viewed.stale' then
    if p_preview then select count(*) into n from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.recently_viewed where ctid in (select x.ctid from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'launch_queue.after_event' then
    if p_preview then select count(*) into n from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.launch_queue where ctid in (select q.ctid from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'account_security_events.stale' then
    if p_preview then select count(*) into n from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.account_security_events where id in (select x.id from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'review_provenance.stale' then
    if p_preview then select count(*) into n from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.review_provenance where review_id in (select x.review_id from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guest_care.after_event' then
    if p_preview then select count(*) into n from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.guest_care where guest_id in (select c.guest_id from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guests.after_event' then
    if p_preview then select count(*) into n from public.guests x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id);
    else update public.guests set name = 'Guest', email = 'anonymised', phone = '', rsvp_note = '', dietary = '' where id in (select x.id from public.guests x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'registrations.after_event' then
    if p_preview then select count(*) into n from public.registrations x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id);
    else
      delete from public.registration_private p using public.registrations x, public.events e where p.registration_id = x.id and e.id = x.event_id and coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
      update public.registrations set name = 'Attendee', email = 'anonymised+' || id || '@users.invalid', answers = '{}' where id in (select x.id from public.registrations x join public.events e on e.id = x.event_id
        where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count;
    end if;
  when 'access_passes.after_event' then
    if p_preview then select count(*) into n from public.access_passes x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id);
    else update public.access_passes set holder_email = '' where id in (select x.id from public.access_passes x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'check_ins.device' then
    if p_preview then select count(*) into n from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id);
    else update public.check_ins set device = null where id in (select x.id from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'ticket_transfers.closed' then
    if p_preview then select count(*) into n from public.ticket_transfers x where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%';
    else update public.ticket_transfers set to_email = 'erased+' || id || '@users.invalid', to_name = '' where id in (select x.id from public.ticket_transfers x
      where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%' and not public.legal_hold_covers_user(x.from_user) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'risk_signals.closed' then
    if p_preview then select count(*) into n from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}' and not public.legal_hold_covers_user(x.user_id);
    else update public.risk_signals set evidence = '{}' where id in (select x.id from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}'
      and not public.legal_hold_covers_user(x.user_id) and not public.legal_hold_covers('workspace', x.workspace_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'analytics_events.raw' then
    -- Q35: pseudonymous product events; rows tied to a workspace under legal hold are kept.
    if p_preview then select count(*) into n from public.analytics_events x where x.occurred_at < cutoff and (x.workspace_id is null or not public.legal_hold_covers('workspace', x.workspace_id));
    else delete from public.analytics_events where id in (select x.id from public.analytics_events x where x.occurred_at < cutoff
      and (x.workspace_id is null or not public.legal_hold_covers('workspace', x.workspace_id)) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'email_outbox.sent_bodies' then
    -- Q75: copies of notification emails keep their delivery metadata (recipient, category, subject, status, timestamps); the body
    -- and link are removed once the row is older than the retention period. Rows of users under a legal hold are kept whole.
    if p_preview then select count(*) into n from public.email_outbox x where x.status in ('sent','suppressed') and coalesce(x.sent_at, x.created_at) < cutoff
      and (x.body <> '' or x.link is not null) and (x.user_id is null or not public.legal_hold_covers_user(x.user_id));
    else update public.email_outbox set body = '', link = null where id in (select x.id from public.email_outbox x where x.status in ('sent','suppressed')
      and coalesce(x.sent_at, x.created_at) < cutoff and (x.body <> '' or x.link is not null) and (x.user_id is null or not public.legal_hold_covers_user(x.user_id)) limit r.batch_limit);
      get diagnostics n = row_count; end if;
  else raise exception 'no_handler:%', p_key using errcode = '22023';
  end case;
  return n;
end $function$;
