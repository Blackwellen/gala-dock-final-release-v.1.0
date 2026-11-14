-- Exercise for 202611146401 (always rolled back by migrate.mjs). Sessions below are synthetic rows inside the rolled-back transaction.
-- 1. promoter_track_click files 'qr' and 'link' clicks under their own channel.
-- 2. Promoter payouts: a clawback is not netted while the payout that carried the sale is unpaid; failing that payout turns the sale
--    into a plain reversal; a clawback of PAID commission is netted on the next payout.
-- 3. partner_clear_due_earnings: only earnings older than 14 days clear; never into a settled statement; statement = its earnings.
-- 4. partner_attribute_signup_at: an account created before the click is refused; bad click times are refused.
-- 5. admin_request_money('partner_payout'): capped at the cleared, unpaid balance; one open request per partner.
do $$
declare ev record; owner uuid; sid uuid := gen_random_uuid(); pr uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; j jsonb; p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  r record; cnt int; part uuid; e1 uuid; e2 uuid; e3 uuid; st uuid; tot numeric; usr uuid; adm uuid; owed numeric; msg text; vis text := repeat('ab', 32);
begin
  -- ── 1 ──
  select pr0.code, pr0.id into r from public.promoters pr0 join public.events e on e.id = pr0.event_id
    where pr0.status = 'active' and e.slug is not null and e.visibility = 'public' and e.status in ('published','on_sale','live') limit 1;
  if r.id is not null then
    perform * from public.promoter_track_click(r.code, repeat('c1', 32), 'qr', null);
    perform * from public.promoter_track_click(r.code, repeat('c2', 32), 'link', null);
    if (select channel from public.promoter_clicks where promoter_id = r.id and visitor_hash = repeat('c1', 32) order by id desc limit 1) is distinct from 'qr' then raise exception 'qr click misfiled'; end if;
    if (select channel from public.promoter_clicks where promoter_id = r.id and visitor_hash = repeat('c2', 32) order by id desc limit 1) is distinct from 'link' then raise exception 'link click misfiled'; end if;
    perform * from public.promoter_track_click(r.code, repeat('c3', 32), 'myspace', null);
    if (select channel from public.promoter_clicks where promoter_id = r.id and visitor_hash = repeat('c3', 32) order by id desc limit 1) is distinct from 'other' then raise exception 'unknown channel not other'; end if;
  else raise notice 'exercise 1 skipped: no active public promoter'; end if;

  -- ── 2 ── (an event owner acting through a synthetic live aal2 session)
  select e.id, e.owner_id into ev from public.events e join public.workspaces w on w.id = e.workspace_id where w.owner_id = e.owner_id limit 1;
  owner := ev.owner_id;
  insert into auth.sessions(id, user_id) values (sid, owner);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  insert into public.promoters(event_id, name, code, commission_pct, status) values (ev.id, 'Exercise promoter', 'EXQ65' || substr(md5(random()::text), 1, 6), 10, 'active') returning id into pr;
  insert into public.promoter_sales(promoter_id, event_id, tier_name, quantity, amount, commission, status) values (pr, ev.id, 'GA', 1, 100, 10, 'pending') returning id into s1;
  insert into public.promoter_sales(promoter_id, event_id, tier_name, quantity, amount, commission, status) values (pr, ev.id, 'GA', 1, 50, 5, 'pending') returning id into s2;
  if public.promoter_approve_sales(pr, null, 'exercise') <> 2 then raise exception 'approve count'; end if;
  j := public.promoter_create_payout(pr, 'ex1'); p1 := (j->>'payout_id')::uuid;
  if (j->>'amount')::numeric <> 15 then raise exception 'payout1 amount %', j; end if;
  -- s1 is refunded while locked in p1 (promoter_reverse_order's locked branch)
  update public.promoter_sales set clawback_pending = true, reversed_at = now(), reversal_reason = 'refund' where id = s1;
  insert into public.promoter_sales(promoter_id, event_id, tier_name, quantity, amount, commission, status) values (pr, ev.id, 'GA', 3, 300, 30, 'pending') returning id into s3;
  perform public.promoter_approve_sales(pr, array[s3], 'exercise');
  j := public.promoter_create_payout(pr, 'ex2'); p2 := (j->>'payout_id')::uuid;
  if (j->>'clawback')::numeric <> 0 or (j->>'amount')::numeric <> 30 then raise exception 'unpaid commission was clawed back: %', j; end if;
  perform public.promoter_payout_transition(p1, 'fail', 'exercise fail', null);
  select * into r from public.promoter_sales where id = s1;
  if r.status <> 'reversed' or r.clawback_pending or r.payout_id is not null then raise exception 's1 after fail: % % %', r.status, r.clawback_pending, r.payout_id; end if;
  select * into r from public.promoter_sales where id = s2;
  if r.status <> 'approved' or r.payout_id is not null then raise exception 's2 after fail: %', r.status; end if;
  perform public.promoter_payout_transition(p2, 'fail', 'exercise fail', null);
  j := public.promoter_create_payout(pr, 'ex3'); p3 := (j->>'payout_id')::uuid;
  if (j->>'gross')::numeric <> 35 or (j->>'clawback')::numeric <> 0 then raise exception 'payout3 %', j; end if;
  perform public.promoter_payout_transition(p3, 'approve', null, null);
  perform public.promoter_payout_transition(p3, 'mark_paid', 'EX-REF-3', 'bank_transfer');
  -- s3 (now paid) is charged back: its commission is netted on the next payout
  update public.promoter_sales set clawback_pending = true, reversed_at = now(), reversal_reason = 'chargeback' where id = s3;
  insert into public.promoter_sales(promoter_id, event_id, tier_name, quantity, amount, commission, status) values (pr, ev.id, 'GA', 5, 500, 50, 'pending') returning id into s4;
  perform public.promoter_approve_sales(pr, array[s4], 'exercise');
  j := public.promoter_create_payout(pr, 'ex4'); p4 := (j->>'payout_id')::uuid;
  if (j->>'gross')::numeric <> 50 or (j->>'clawback')::numeric <> 30 or (j->>'amount')::numeric <> 20 then raise exception 'payout4 %', j; end if;
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);

  -- ── 3 ──
  select id into part from public.partners order by created_at limit 1;
  insert into public.partner_earnings(partner_id, occurred_at, eligible_revenue, commission, status) values (part, now() - interval '20 days', 100, 6, 'pending') returning id into e1;
  insert into public.partner_earnings(partner_id, occurred_at, eligible_revenue, commission, status) values (part, now() - interval '3 days', 50, 3, 'pending') returning id into e2;
  cnt := public.partner_clear_due_earnings(14);
  if (select status from public.partner_earnings where id = e1) <> 'cleared' then raise exception 'e1 not cleared'; end if;
  if (select status from public.partner_earnings where id = e2) <> 'pending' or (select statement_id from public.partner_earnings where id = e2) is not null then raise exception 'e2 cleared inside the hold'; end if;
  select statement_id into st from public.partner_earnings where id = e1;
  if (select period_start from public.partner_statements where id = st) <> date_trunc('month', now())::date then raise exception 'statement period'; end if;
  select coalesce(sum(commission), 0) into tot from public.partner_earnings where statement_id = st and status <> 'reversed';
  if (select commission from public.partner_statements where id = st) <> tot then raise exception 'statement % vs earnings %', (select commission from public.partner_statements where id = st), tot; end if;
  update public.partner_statements set status = 'paid', paid_at = now(), reference = 'EX' where id = st;
  insert into public.partner_earnings(partner_id, occurred_at, eligible_revenue, commission, status) values (part, now() - interval '20 days', 10, 0.6, 'pending') returning id into e3;
  perform public.partner_clear_due_earnings(14);
  if (select status from public.partner_earnings where id = e3) <> 'pending' then raise exception 'e3 attached to a settled statement'; end if;
  if (select commission from public.partner_statements where id = st) <> tot then raise exception 'settled statement changed'; end if;

  -- ── 4 ──
  select u.id into usr from auth.users u where u.created_at < now() - interval '3 days' and not exists (select 1 from public.partner_attributions a where a.user_id = u.id) limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', usr::text, true);
  j := public.partner_attribute_signup_at('ANYCODE', 'link', vis, now() - interval '1 day');
  if j->>'reason' <> 'existing_account' then raise exception 'existing account attributed: %', j; end if;
  if public.partner_attribute_signup_at('ANYCODE', 'link', vis, null)->>'reason' <> 'invalid_click' then raise exception 'null click'; end if;
  if public.partner_attribute_signup_at('ANYCODE', 'link', vis, now() + interval '1 day')->>'reason' <> 'invalid_click' then raise exception 'future click'; end if;
  if exists (select 1 from public.partner_attributions where user_id = usr) then raise exception 'attribution written'; end if;
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);

  -- ── 5 ── (demo platform admin through a synthetic live aal2 session)
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'partners' = any(p.permissions) order by (u.email = 'admin.demo@example.com') desc limit 1;
  sid := gen_random_uuid();
  insert into auth.sessions(id, user_id) values (sid, adm);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  insert into public.partner_earnings(partner_id, occurred_at, eligible_revenue, commission, status) values (part, now() - interval '40 days', 500, 30, 'pending');
  update public.partner_statements set status = 'open' where id = st;   -- reopen this month's statement for the cap test
  perform public.partner_clear_due_earnings(14);
  select coalesce(sum(commission), 0) into owed from public.partner_statements where partner_id = part and status in ('open','pending');
  update public.admin_money_requests set status = 'cancelled' where partner_id = part and kind = 'partner_payout' and status in ('pending','processing');
  begin
    perform public.admin_request_money('partner_payout', null, part, null, owed + 0.01, 'exercise over cap');
    raise exception 'X_OVER_CAP';
  exception when others then get stacked diagnostics msg = message_text; if msg <> 'partner_payout_exceeds_cleared' then raise exception 'over cap: %', msg; end if;
  end;
  perform public.admin_request_money('partner_payout', null, part, null, owed, 'exercise full balance');
  begin
    perform public.admin_request_money('partner_payout', null, part, null, 1, 'exercise second request');
    raise exception 'X_SECOND';
  exception when others then get stacked diagnostics msg = message_text; if msg <> 'partner_payout_already_requested' then raise exception 'second: %', msg; end if;
  end;
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);

  raise exception 'EXERCISE_OK clicks=qr/link/other payouts=no-unpaid-clawback,fail→reversed,paid-clawback-netted statements=hold14,settled-skip attribution=existing-refused payout_request=capped,single owed=%', owed;
end $$;
