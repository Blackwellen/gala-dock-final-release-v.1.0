-- Q50/Q65 partner + promoter commission bug hunt (2026-11-14). Additive: create-or-replace with unchanged signatures, one new
-- function family, one job kind + daily schedule. Nothing here moves money; every settlement stays a recorded statement.
--
-- 1. promoter_track_click: /r/<code> sends channel 'link' (plain link) and 'qr' (Q27), and promoter_clicks accepts them since
--    202610292003, but the function still mapped both to 'other' — plain-link and QR clicks were misfiled.
-- 2. Promoter clawbacks: a reversed sale that sat in a payout that later FAILED stayed clawback_pending, so the next payout netted
--    commission the promoter was never paid (double deduction). A failed payout now turns those sales into plain reversals, and
--    clawbacks are only netted once the payout that carried them has actually been paid.
-- 3. Partner earnings never cleared: partner_build_statements had no schedule, so every earning stayed 'pending', no statement was
--    ever built and nothing became payable. partner_clear_due_earnings clears earnings 14 days after the revenue (Affiliate &
--    Partner Terms 2.1A) into the statement of the month they clear in (status 'open'; never into a statement already settled or
--    on hold — those earnings roll into the next month's statement instead of waiting forever). Daily job 'partners.clear_earnings'.
-- 4. Existing customers: partner_attribute_signup credited any account younger than 30 days, including one created BEFORE the
--    partner click (Terms 2.2: no fees on existing customers). partner_attribute_signup_at takes the click time from the consented
--    cookie and refuses accounts created before it. The 3-argument function stays for the deployed build.
-- 5. Partner payout requests: admin_request_money('partner_payout') accepted any amount any number of times (the console sent
--    earned − paid, which includes uncleared and on-hold commission). It now refuses a second open request for the same partner and
--    any amount above the cleared, unpaid statement balance.

-- ── 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.promoter_track_click(p_code text, p_visitor text, p_channel text default 'direct', p_asset uuid default null)
returns table(slug text, code text, counted boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare p record; v_channel text; v_counted boolean := false;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{2,32}$' or p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then return; end if;
  -- Codes are unique per event; prefer the active promoter whose public event is soonest upcoming.
  select pr.id, pr.code, e.slug, e.id as event_id into p
    from public.promoters pr join public.events e on e.id = pr.event_id
    where upper(pr.code) = upper(p_code) and pr.status = 'active' and e.slug is not null
      and e.visibility = 'public' and e.status in ('published','on_sale','live')
    order by (coalesce(e.ends_at, e.starts_at) < now()), e.starts_at nulls last limit 1;
  if p.id is null then return; end if;
  -- Same list as promoter_clicks_channel_check (Q27): plain links and QR codes are first-class channels.
  v_channel := case when p_channel in ('direct','link','qr','instagram','tiktok','facebook','x','whatsapp','email','other') then p_channel else 'other' end;
  -- Global per-visitor ceiling first (bots cycling codes), then one counted click per visitor+promoter per window.
  if public.hit_rate_limit('promo:visitor:' || p_visitor, 60, 3600)
     and public.hit_rate_limit('promo:click:' || p.id || ':' || p_visitor, 1, 1800) then
    insert into public.promoter_clicks(promoter_id, channel, asset_id, visitor_hash)
      values (p.id, v_channel, (select a.id from public.promoter_assets a where a.id = p_asset and a.event_id = p.event_id), p_visitor);
    update public.promoters set clicks = clicks + 1 where id = p.id;
    v_counted := true;
  end if;
  return query select p.slug::text, p.code::text, v_counted;
end $$;

-- ── 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.promoter_create_payout(p_promoter uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid; gross numeric := 0; claw numeric := 0; c record;
begin
  if not public.can_manage_promoter(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  perform 1 from public.promoters where id = p_promoter for update;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  if gross <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0002'; end if;
  perform set_config('gd.promoter_payout', 'on', true);
  insert into public.promoter_payouts(promoter_id, amount, status, scheduled_for, gross_commission, clawback_deducted, locked_at, locked_by, reference)
    values (p_promoter, gross, 'held', current_date, gross, 0, now(), auth.uid(), nullif(left(coalesce(p_note, ''), 120), '')) returning id into v;
  update public.promoter_sales set payout_id = v, status = 'held' where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  -- Sales accrued before Q27 get their accrual memo now (idempotent), so the settlement memo always discharges a recorded obligation.
  perform public.promoter_post_memo(s.id, 'accrual') from public.promoter_sales s where s.payout_id = v;
  -- Only commission the promoter has actually been paid can be clawed back: the payout that carried the sale must be 'paid'.
  -- (A clawback whose payout is still held/payable waits; if that payout fails the sale becomes a plain reversal instead.)
  for c in select s.id, s.commission from public.promoter_sales s join public.promoter_payouts op on op.id = s.payout_id
           where s.promoter_id = p_promoter and s.clawback_pending and s.clawback_payout_id is null and op.status = 'paid'
           order by s.reversed_at, s.id loop
    exit when claw + c.commission > gross;
    update public.promoter_sales set clawback_payout_id = v where id = c.id;
    claw := claw + c.commission;
  end loop;
  update public.promoter_payouts set clawback_deducted = claw, amount = gross - claw where id = v;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_locked',
    jsonb_build_object('payout_id', v, 'promoter_id', p_promoter, 'gross', gross, 'clawback', claw, 'amount', gross - claw));
  return jsonb_build_object('payout_id', v, 'gross', gross, 'clawback', claw, 'amount', gross - claw);
end $$;

create or replace function public.promoter_payout_transition(p_payout uuid, p_action text, p_reference text default null, p_method text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.promoter_payouts; e record; c bigint;
begin
  select * into p from public.promoter_payouts where id = p_payout for update;
  if p.id is null or not public.can_manage_promoter(p.promoter_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p.locked_at is null then raise exception 'legacy_payout' using errcode = '55000'; end if;
  perform public.require_step_up(null);
  perform set_config('gd.promoter_payout', 'on', true);
  if p_action = 'approve' and p.status = 'held' then
    update public.promoter_payouts set status = 'payable', approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'payable' where payout_id = p.id;
  elsif p_action = 'mark_paid' and p.status = 'payable' then
    if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
    update public.promoter_payouts set status = 'paid', paid_at = now(), reference = left(p_reference, 120), settlement_method = coalesce(p_method, 'bank_transfer'), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'paid' where payout_id = p.id;
    update public.promoter_sales set clawback_pending = false where clawback_payout_id = p.id;
    c := round(p.amount * 100);
    if c > 0 then
      select ev.workspace_id, ev.owner_id, upper(coalesce(ev.currency, 'GBP')) currency, ev.id into e
        from public.promoters pr join public.events ev on ev.id = pr.event_id where pr.id = p.promoter_id;
      -- Statement of the organiser's off-platform settlement: the promoter obligation is discharged; no Gala Dock account moves.
      perform public.post_memo_ledger_transaction('promoter:payout:' || p.id || ':paid', 'promoter_commission', e.currency,
        jsonb_build_array(
          jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', p.promoter_id, 'amount_minor', c),
          jsonb_build_object('account', 'seller_promoter_settled', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end, 'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', -c)),
        'seller_obligation_memo', e.workspace_id, e.id, 'promoter_payout', p.id::text, 'Promoter commission settled by the organiser off-platform (memo)', null, 'user');
    end if;
  elsif p_action = 'fail' and p.status in ('held','payable') then
    -- Sales reversed while locked in this payout were never paid: they become plain reversals (their reversal memo was posted
    -- when they were reversed), so no later payout nets them as a clawback.
    update public.promoter_sales set status = 'reversed', payout_id = null, clawback_pending = false where payout_id = p.id and clawback_pending;
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id;
    update public.promoter_sales set clawback_payout_id = null where clawback_payout_id = p.id;
    update public.promoter_payouts set status = 'failed', failure_reason = left(coalesce(p_reference, ''), 300), updated_at = now() where id = p.id;
  else
    raise exception 'invalid_transition: % from %', p_action, p.status using errcode = '55000';
  end if;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_' || p_action,
    jsonb_build_object('payout_id', p.id, 'promoter_id', p.promoter_id, 'amount', p.amount, 'reference', left(coalesce(p_reference, ''), 120)));
  return (select status from public.promoter_payouts where id = p.id);
end $$;

-- ── 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.partner_clear_due_earnings(p_hold_days integer default 14)
returns integer language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date; cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_hold_days, 14), 0));
  s record; st uuid; n int := 0;
begin
  for s in select distinct partner_id from public.partner_earnings where statement_id is null and status = 'pending' and occurred_at <= cutoff loop
    insert into public.partner_statements(partner_id, period_start, status, payout_due)
      values (s.partner_id, m, 'open', (m + interval '2 months' - interval '1 day')::date)
      on conflict (partner_id, period_start) do nothing;
    select id into st from public.partner_statements where partner_id = s.partner_id and period_start = m and status in ('open','pending');
    if st is null then continue; end if;   -- this month's statement is settled or on hold: these earnings go on next month's
    update public.partner_earnings set statement_id = st, status = 'cleared'
      where partner_id = s.partner_id and statement_id is null and status = 'pending' and occurred_at <= cutoff;
    perform public.partner_statement_recompute(st);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.job_partner_clear_earnings(p_job public.job_queue)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('statements', public.partner_clear_due_earnings(14));
end $$;

revoke all on function public.partner_clear_due_earnings(integer) from public, anon, authenticated;
revoke all on function public.job_partner_clear_earnings(public.job_queue) from public, anon, authenticated;
grant execute on function public.partner_clear_due_earnings(integer), public.job_partner_clear_earnings(public.job_queue) to service_role;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('partners.clear_earnings', 'db', 'public.job_partner_clear_earnings', 3, 'Q65: daily; partner earnings clear 14 days after the revenue into the monthly statement')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('partner-clear-earnings') where exists (select 1 from cron.job where jobname = 'partner-clear-earnings');
select cron.schedule('partner-clear-earnings', '50 5 * * *',
  $$select public.enqueue_job(p_kind => 'partners.clear_earnings', p_payload => '{}'::jsonb, p_dedupe_key => 'partners.clear_earnings:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

-- ── 4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.partner_attribute_signup_at(p_code text, p_channel text, p_visitor text, p_clicked_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); created timestamptz;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.partner_attributions where user_id = uid) then return public.partner_attribute_signup(p_code, p_channel, p_visitor); end if;
  select u.created_at into created from auth.users u where u.id = uid;
  -- The click must come before the account (10 minutes' grace for clock skew) and be inside the 30-day cookie window.
  if p_clicked_at is null or p_clicked_at > now() + interval '5 minutes' or p_clicked_at < now() - interval '30 days' then
    return jsonb_build_object('attributed', false, 'reason', 'invalid_click');
  end if;
  if created < p_clicked_at - interval '10 minutes' then return jsonb_build_object('attributed', false, 'reason', 'existing_account'); end if;
  return public.partner_attribute_signup(p_code, p_channel, p_visitor);
end $$;
revoke all on function public.partner_attribute_signup_at(text, text, text, timestamptz) from public, anon;
grant execute on function public.partner_attribute_signup_at(text, text, text, timestamptz) to authenticated;

-- ── 5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_request_money(p_kind text, p_transaction uuid, p_partner uuid, p_case uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.transactions; rid uuid; already numeric; owed numeric;
begin
  if p_kind = 'partner_payout' then perform public.admin_require('partners', p_reason);
  elsif p_case is not null and public.has_admin_permission('support') then perform public.admin_require('support', p_reason);
  else perform public.admin_require('commerce', p_reason); end if;
  if p_kind not in ('refund','payout_retry','partner_payout') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_kind in ('refund','payout_retry') then
    if p_transaction is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into t from public.transactions where id = p_transaction;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_kind = 'refund' then
      if t.kind not in ('income','payment') or t.status not in ('completed','partial') then raise exception 'not_refundable' using errcode = '22023'; end if;
      select coalesce(sum(amount), 0) into already from public.admin_money_requests where transaction_id = t.id and kind = 'refund' and status in ('pending','processing','completed');
      if already + p_amount > abs(t.amount) then raise exception 'refund_exceeds_amount' using errcode = '22023'; end if;
    elsif t.kind <> 'payout' or t.status <> 'failed' and t.status <> 'pending' then raise exception 'not_retryable' using errcode = '22023'; end if;
  elsif p_partner is null or not exists(select 1 from public.partners where id = p_partner) then raise exception 'not_found' using errcode = 'P0002';
  else
    -- Q65: one open request per partner, never more than the cleared, unpaid statement balance (no hold bypass, no double payout).
    perform 1 from public.partners where id = p_partner for update;
    if exists (select 1 from public.admin_money_requests r where r.partner_id = p_partner and r.kind = 'partner_payout' and r.status in ('pending','processing')) then
      raise exception 'partner_payout_already_requested' using errcode = '55000';
    end if;
    select coalesce(sum(s.commission), 0) into owed from public.partner_statements s where s.partner_id = p_partner and s.status in ('open','pending');
    if round(p_amount, 2) > owed then raise exception 'partner_payout_exceeds_cleared' using errcode = '22023'; end if;
  end if;
  insert into public.admin_money_requests(kind, transaction_id, partner_id, case_id, amount, reason, requested_by, requested_by_name)
    values (p_kind, p_transaction, p_partner, p_case, round(p_amount, 2), trim(p_reason), auth.uid(), public.admin_actor_name()) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), t.workspace_id, 'admin.money_request_' || p_kind,
    jsonb_build_object('request_id', rid, 'transaction_id', p_transaction, 'partner_id', p_partner, 'case_id', p_case, 'amount', p_amount, 'reason', p_reason));
  if p_case is not null then
    insert into public.support_messages(case_id, author_id, author, body, internal, role)
      values (p_case, auth.uid(), public.admin_actor_name(), 'Refund request of £' || to_char(p_amount, 'FM999999990.00') || ' recorded (pending processor). Reason: ' || left(trim(p_reason), 300), true, 'support');
  end if;
  return rid;
end $$;
