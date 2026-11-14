-- Q60 (lane bughunt-billing): AI credit ledger correctness + credit-pack refunds + billing notification links. Additive only:
-- one nullable column + partial index, two new functions, and in-place bodies for four existing functions (same signatures).
--   1. ai_credit_balance(): purchased/granted credits are consumed earliest-expiry first (FIFO), and only the UNUSED part of a lot
--      expires. Before, ai_credit_status summed unexpired lots and ALL debits ever, so when a partly used pack expired, its debits
--      were charged a second time against newer packs (buy 500, use 400, pack expires, buy 500 → balance showed 100, not 500).
--   2. A refunded credit-pack payment (charge.refunded on the platform account) reverses the refunded share of that pack's credits
--      once (cumulative, idempotent per payment intent). Before, a refunded pack kept all its credits.
--      billing_credit_pack_paid now records the payment intent on the purchase lot so the refund can find it.
--   3. Payment-failed notification for provider workspaces linked to /provider/settings (overview), not the billing tab; the
--      soft-cap notification sent provider members to /organizer/settings. Both now link to the workspace's own tab.

alter table public.ai_credit_ledger add column if not exists stripe_payment_intent text;
create index if not exists ai_credit_ledger_pi_idx on public.ai_credit_ledger(stripe_payment_intent) where stripe_payment_intent is not null;

-- 1. FIFO balance ------------------------------------------------------------------------------------------------------------------
create or replace function public.ai_credit_balance(p_workspace uuid, p_at timestamptz default now()) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare r record; exp timestamptz[] := '{}'; amt numeric[] := '{}'; need numeric; take numeric; pick integer; debt numeric := 0; bal numeric := 0; n integer;
begin
  for r in select l.credits, l.expires_at, l.created_at from public.ai_credit_ledger l
            where l.workspace_id = p_workspace and l.kind <> 'overage' and l.created_at <= p_at order by l.created_at, l.id loop
    if r.credits > 0 then
      take := least(debt, r.credits); debt := debt - take;                 -- an earlier uncovered debit is paid from the next lot
      exp := exp || r.expires_at; amt := amt || (r.credits - take);
    elsif r.credits < 0 then
      need := -r.credits;
      while need > 0 loop
        -- the lot valid at the debit's time that expires first; never-expiring lots last; ties → oldest
        pick := null; n := coalesce(array_length(amt, 1), 0);
        for j in 1 .. n loop
          if amt[j] > 0 and (exp[j] is null or exp[j] > r.created_at)
             and (pick is null or (exp[j] is not null and (exp[pick] is null or exp[j] < exp[pick]))) then pick := j; end if;
        end loop;
        if pick is null then debt := debt + need; need := 0;
        else take := least(need, amt[pick]); amt[pick] := amt[pick] - take; need := need - take; end if;
      end loop;
    end if;
  end loop;
  for j in 1 .. coalesce(array_length(amt, 1), 0) loop
    if amt[j] > 0 and (exp[j] is null or exp[j] > p_at) then bal := bal + amt[j]; end if;
  end loop;
  return bal - debt;
end $$;

CREATE OR REPLACE FUNCTION public.ai_credit_status(p_workspace uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.ai_budgets; month_allow numeric; month_used numeric; day_used numeric; bal numeric; od numeric;
begin
  if auth.uid() is not null and not public.is_workspace_member(p_workspace) and not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into b from public.ai_budgets where workspace_id = p_workspace;
  if not found then b.soft_caps := '{70,85,95}'; b.hard_cap := true; b.allow_overage := false; b.overage_limit := 0; b.per_run_limit := 50; b.deep_allowed := false; end if;
  b.monthly_allowance := coalesce(b.monthly_allowance, (public.entitlement(p_workspace, 'ai.credits.monthly') #>> '{}')::numeric, 0);
  b.deep_allowed := b.deep_allowed and public.has_capability(p_workspace, 'agent.deep');
  select coalesce(sum(from_allowance), 0), coalesce(sum(credits), 0), coalesce(sum(overage), 0) into month_allow, month_used, od from public.ai_usage_events
    where workspace_id = p_workspace and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  select coalesce(sum(credits), 0) into day_used from public.ai_usage_events where workspace_id = p_workspace and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  bal := public.ai_credit_balance(p_workspace);   -- Q60: FIFO, only the unused part of a lot expires
  return jsonb_build_object('allowance', b.monthly_allowance, 'allowance_used', month_allow, 'allowance_left', greatest(b.monthly_allowance - month_allow, 0),
    'balance', greatest(bal, 0), 'used_this_month', month_used, 'used_today', day_used, 'overage_this_month', od,
    'pct', case when b.monthly_allowance > 0 then round(100 * month_allow / b.monthly_allowance) else 100 end,
    'soft_caps', to_jsonb(b.soft_caps), 'hard_cap', b.hard_cap, 'allow_overage', b.allow_overage, 'overage_limit', b.overage_limit,
    'daily_limit', b.daily_limit, 'per_run_limit', b.per_run_limit, 'deep_allowed', b.deep_allowed,
    'available', greatest(b.monthly_allowance - month_allow, 0) + greatest(bal, 0) + case when b.allow_overage then greatest(b.overage_limit - od, 0) else 0 end);
end $function$
;

-- 2. Credit packs: purchase lot remembers its payment intent; refunds reverse the refunded share once ---------------------------
CREATE OR REPLACE FUNCTION public.billing_credit_pack_paid(p_session jsonb, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.credit_packs; v_ws uuid := nullif(p_session -> 'metadata' ->> 'workspace_id', '')::uuid; ws public.workspaces; v_id uuid;
begin
  if coalesce(p_session ->> 'id', '') !~ '^cs_[A-Za-z0-9_]+$' or p_session -> 'metadata' ->> 'purpose' <> 'ai_credits' then raise exception 'invalid_session' using errcode = '22023'; end if;
  if p_session ->> 'payment_status' <> 'paid' then return jsonb_build_object('credited', false, 'reason', 'not_paid'); end if;
  select * into k from public.credit_packs where id = nullif(p_session -> 'metadata' ->> 'pack_id', '')::uuid;
  if not found then raise exception 'unknown_pack' using errcode = 'P0002'; end if;
  select * into ws from public.workspaces where id = v_ws;
  if not found or not (ws.kind = any (k.workspace_kinds)) then raise exception 'pack_not_for_workspace' using errcode = '22023'; end if;
  if coalesce((p_session ->> 'amount_subtotal')::integer, (p_session ->> 'amount_total')::integer, -1) <> k.price_minor
     or upper(coalesce(p_session ->> 'currency', '')) <> upper(k.currency) then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, pack_id, payment_ref, expires_at, stripe_payment_intent)
    values (ws.id, 'purchase', k.credits, 'Credit pack ' || k.name, k.id, p_session ->> 'id', case when k.expiry_days is not null then now() + make_interval(days => k.expiry_days) end,
      nullif(coalesce(p_session ->> 'payment_intent', p_session -> 'payment_intent' ->> 'id'), ''))   -- Q60: refunds find the lot by payment intent
  on conflict (payment_ref) where kind = 'purchase' and payment_ref is not null do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('credited', false, 'reason', 'duplicate'); end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws.id, 'billing.credit_pack_paid',
    jsonb_build_object('session', p_session ->> 'id', 'pack', k.name, 'credits', k.credits, 'amount_minor', k.price_minor, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('credited', true, 'credits', k.credits, 'ledger_id', v_id);
end $function$
;

create or replace function public.billing_credit_pack_refunded(p_charge jsonb, p_livemode boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pi text := coalesce(p_charge ->> 'payment_intent', p_charge -> 'payment_intent' ->> 'id'); lot public.ai_credit_ledger;
  v_total numeric := coalesce((p_charge ->> 'amount')::numeric, 0); v_refunded numeric := coalesce((p_charge ->> 'amount_refunded')::numeric, 0);
  target numeric; done numeric; delta numeric;
begin
  if coalesce(v_pi, '') !~ '^pi_[A-Za-z0-9_]+$' then return jsonb_build_object('credit_pack', false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credit-pack-refund:' || v_pi, 0));
  select * into lot from public.ai_credit_ledger where kind = 'purchase' and stripe_payment_intent = v_pi order by created_at limit 1;
  if not found then return jsonb_build_object('credit_pack', false); end if;
  if v_total <= 0 or v_refunded <= 0 then return jsonb_build_object('credit_pack', true, 'reversed', 0); end if;
  target := round(lot.credits * least(v_refunded, v_total) / v_total, 3);
  select coalesce(-sum(credits), 0) into done from public.ai_credit_ledger where workspace_id = lot.workspace_id and kind = 'reversal' and stripe_payment_intent = v_pi and starts_with(payment_ref, 'refund:' || v_pi || ':');
  delta := target - done;
  if delta <= 0 then return jsonb_build_object('credit_pack', true, 'reversed', 0); end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, pack_id, payment_ref, stripe_payment_intent)
    values (lot.workspace_id, 'reversal', -delta, 'Refund of ' || coalesce(lot.reference, 'credit pack'), lot.pack_id, 'refund:' || v_pi || ':' || v_refunded::bigint, v_pi);   -- payment_ref is unique: one row per cumulative refund total
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', lot.workspace_id, 'billing.credit_pack_refunded',
    jsonb_build_object('payment_intent', v_pi, 'charge', p_charge ->> 'id', 'credits_reversed', delta, 'refunded_minor', v_refunded, 'amount_minor', v_total, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('credit_pack', true, 'reversed', delta);
end $$;

-- 3. Notification links per workspace kind ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_subscription(p_sub jsonb, p_event_created bigint, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ws public.workspaces; cur public.workspace_subscriptions; pp public.plan_prices; item jsonb := p_sub -> 'items' -> 'data' -> 0;
  v_price text := coalesce(item -> 'price' ->> 'id', item -> 'plan' ->> 'id'); v_status text := p_sub ->> 'status';
  v_ws uuid; v_cust text := coalesce(p_sub ->> 'customer', p_sub -> 'customer' ->> 'id');
  pstart timestamptz; pend timestamptz; prev_plan text := p_sub -> 'metadata' ->> 'gd_previous_plan';
  down_at timestamptz := to_timestamp(nullif(p_sub -> 'metadata' ->> 'gd_downgrade_at', '')::double precision);
  effective text; before_plan text; v_pending text; v_pending_at timestamptz; prev_status text;
begin
  if coalesce(p_sub ->> 'id', '') !~ '^sub_[A-Za-z0-9_]+$' then raise exception 'invalid_subscription' using errcode = '22023'; end if;
  v_ws := nullif(p_sub -> 'metadata' ->> 'workspace_id', '')::uuid;
  if v_ws is null then select workspace_id into v_ws from public.billing_customers where stripe_customer_id = v_cust; end if;
  select * into ws from public.workspaces where id = v_ws;
  if not found then raise exception 'unknown_workspace' using errcode = 'P0002'; end if;
  select * into pp from public.plan_prices where (case when p_livemode then stripe_price_live else stripe_price_test end) = v_price;
  if not found then raise exception 'unknown_price %', v_price using errcode = 'P0002'; end if;
  if pp.kind <> ws.kind then raise exception 'plan_kind_mismatch' using errcode = '22023'; end if;
  pstart := to_timestamp(coalesce(p_sub ->> 'current_period_start', item ->> 'current_period_start')::double precision);
  pend := to_timestamp(coalesce(p_sub ->> 'current_period_end', item ->> 'current_period_end')::double precision);

  select * into cur from public.workspace_subscriptions where workspace_id = ws.id for update;
  if found then prev_status := cur.status; end if;
  if found and cur.stripe_subscription_id = p_sub ->> 'id' and p_event_created < cur.last_event_created then
    return jsonb_build_object('applied', false, 'reason', 'stale_event');
  end if;
  -- A different subscription only replaces the current one when the current one is no longer live.
  if found and cur.stripe_subscription_id <> p_sub ->> 'id' and cur.status in ('active','trialing','past_due') and v_status not in ('active','trialing') then
    return jsonb_build_object('applied', false, 'reason', 'superseded');
  end if;
  if v_cust is not null and v_cust ~ '^cus_' then perform public.billing_link_customer(ws.id, v_cust, p_livemode); end if;

  -- End-of-period downgrade: Gala Dock sets gd_previous_plan + gd_downgrade_at when it moves the price down; the higher
  -- entitlements stay until that time, then billing_sweep() applies the pending plan.
  if prev_plan is not null and down_at is not null and down_at > now() and v_status in ('active','trialing') then
    v_pending := pp.plan; v_pending_at := down_at; effective := prev_plan;
  else
    effective := pp.plan;
  end if;

  insert into public.workspace_subscriptions(workspace_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, kind, plan, billing_interval, status,
      current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, pending_plan, pending_effective_at, dunning_since, livemode, last_event_created)
    values (ws.id, p_sub ->> 'id', v_cust, v_price, pp.kind, pp.plan, pp.billing_interval, v_status, pstart, pend,
      coalesce((p_sub ->> 'cancel_at_period_end')::boolean, false), to_timestamp(nullif(p_sub ->> 'canceled_at', '')::double precision),
      to_timestamp(nullif(p_sub ->> 'ended_at', '')::double precision), v_pending, v_pending_at,
      case when v_status in ('past_due','unpaid') then now() end, coalesce(p_livemode, false), coalesce(p_event_created, 0))
  on conflict (workspace_id) do update set stripe_subscription_id = excluded.stripe_subscription_id, stripe_customer_id = excluded.stripe_customer_id,
      stripe_price_id = excluded.stripe_price_id, kind = excluded.kind, plan = excluded.plan, billing_interval = excluded.billing_interval, status = excluded.status,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      canceled_at = excluded.canceled_at, ended_at = excluded.ended_at, pending_plan = excluded.pending_plan, pending_effective_at = excluded.pending_effective_at,
      dunning_since = case when excluded.status in ('past_due','unpaid') then coalesce(public.workspace_subscriptions.dunning_since, now()) end,
      livemode = excluded.livemode, last_event_created = excluded.last_event_created, updated_at = now()
  returning * into cur;

  before_plan := coalesce(ws.plan, 'starter');
  if v_status in ('active','trialing') then
    update public.workspaces set plan = effective where id = ws.id and plan is distinct from effective;
  elsif v_status = 'past_due' then
    -- Dunning grace: keep the plan while Stripe retries; billing_sweep() drops to Starter after 14 days.
    if cur.dunning_since < now() - interval '14 days' then update public.workspaces set plan = 'starter' where id = ws.id and plan is distinct from 'starter'; end if;
  elsif v_status in ('unpaid','canceled','incomplete_expired','paused') then
    update public.workspaces set plan = 'starter' where id = ws.id and plan is distinct from 'starter';
  end if;   -- 'incomplete': first payment not taken yet, entitlements unchanged

  if v_status = 'past_due' and prev_status is distinct from 'past_due' then
    perform public.notify_workspace(ws.id, array['owner','finance'], 'billing', 'Payment failed for your Gala Dock plan',
      'We couldn’t take your subscription payment. Update your card to keep your plan; Stripe will retry automatically.', case when ws.kind = 'provider' then '/provider/settings?tab=billing' else '/organizer/settings?tab=billing' end);
  end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws.id, 'billing.subscription_synced',
    jsonb_build_object('subscription', p_sub ->> 'id', 'status', v_status, 'plan', pp.plan, 'interval', pp.billing_interval, 'from_plan', before_plan,
      'to_plan', (select plan from public.workspaces where id = ws.id), 'pending_plan', v_pending, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('applied', true, 'workspace', ws.id, 'status', v_status, 'plan', (select plan from public.workspaces where id = ws.id), 'pending_plan', v_pending);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_ai_usage(p_workspace uuid, p_user uuid, p_run uuid, p_purpose text, p_model text, p_input integer, p_cached integer, p_output integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pr public.ai_model_prices; cost numeric; gbp numeric; cr numeric; s jsonb; a numeric := 0; bpart numeric := 0; o numeric := 0; before_pct numeric; after_pct numeric; cap integer; credit_value numeric := 1;
begin
  select * into pr from public.ai_model_prices where model = p_model;
  if not found then select * into pr from public.ai_model_prices where model = 'standard'; end if;
  cost := (greatest(p_input - p_cached, 0) * pr.input_per_mtok + p_cached * pr.cached_input_per_mtok + p_output * pr.output_per_mtok) / 1000000.0;
  gbp := cost * pr.fx_to_gbp * 100;                               -- pence
  cr := round(gbp / credit_value, 3);
  if p_workspace is not null then
    s := public.ai_credit_status(p_workspace);
    a := least(cr, (s->>'allowance_left')::numeric);
    bpart := least(cr - a, (s->>'balance')::numeric);
    o := cr - a - bpart;                                            -- only possible when overage is allowed or hard cap is off; recorded openly
    before_pct := (s->>'pct')::numeric;
  end if;
  insert into public.ai_usage_events(workspace_id, user_id, run_id, purpose, model, tier, input_tokens, cached_tokens, output_tokens, provider_cost, provider_currency, cost_gbp_minor, credits, from_allowance, from_balance, overage)
    values (p_workspace, p_user, p_run, left(p_purpose, 40), p_model, pr.tier, p_input, p_cached, p_output, cost, pr.currency, gbp, cr, a, bpart, o);
  if p_workspace is not null and bpart > 0 then insert into public.ai_credit_ledger(workspace_id, kind, credits, reference) values (p_workspace, 'usage', -bpart, coalesce(p_run::text, p_purpose)); end if;
  if p_workspace is not null and o > 0 then insert into public.ai_credit_ledger(workspace_id, kind, credits, reference) values (p_workspace, 'overage', -o, coalesce(p_run::text, p_purpose)); end if;
  if p_run is not null then update public.agent_runs set tokens = tokens + p_input + p_output where id = p_run; end if;
  if p_workspace is not null and (s->>'allowance')::numeric > 0 then
    after_pct := round(100 * ((s->>'allowance_used')::numeric + a) / (s->>'allowance')::numeric);
    foreach cap in array (select array(select jsonb_array_elements_text(s->'soft_caps')::int)) loop
      if before_pct < cap and after_pct >= cap then
        insert into public.notifications(user_id, kind, title, body, link)
          select m.user_id, 'agent', 'Gala Agent credits ' || cap || '% used', 'Your workspace has used ' || cap || '% of this month’s AI credit allowance.', case when (select w.kind from public.workspaces w where w.id = p_workspace) = 'provider' then '/provider/settings?tab=agent' else '/organizer/settings?tab=agent' end
          from public.workspace_members m where m.workspace_id = p_workspace and m.status = 'active' and m.role in ('owner','manager','finance');
        insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'ai.soft_cap_reached', jsonb_build_object('cap', cap));
      end if;
    end loop;
  end if;
  return jsonb_build_object('credits', cr, 'cost_gbp_minor', gbp, 'from_allowance', a, 'from_balance', bpart, 'overage', o);
end $function$
;

-- Grants (Q01): new functions are service-only like the rest of billing; ai_credit_balance is internal (called by ai_credit_status).
revoke all on function public.ai_credit_balance(uuid, timestamptz), public.billing_credit_pack_refunded(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ai_credit_balance(uuid, timestamptz), public.billing_credit_pack_refunded(jsonb, boolean) to service_role;
