-- Q56 exercise (rolled back): category/city/query matching (targeted + untargeted), paused and suspended boosts never served,
-- self-impressions and self-clicks not counted, flight clipped to the event end, pending boost reused, unpayable after the event,
-- late payment keeps the full flight, undelivered share refunded once (VAT included) and a settled boost keeps its status,
-- admin pause / kill switch need commerce + aal2 + a reason. Ends with EXERCISE_OK.
do $$
declare ws uuid; owner uuid; viewer uuid; adm uuid; sid uuid := gen_random_uuid(); ev uuid; ev2 uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid; v uuid;
  ok boolean; n integer; tok text; po public.payment_orders; bb public.promotion_boosts; r record; amt bigint;
  ids uuid[];
begin
  select w.id, w.owner_id into ws, owner from public.workspaces w where w.kind = 'organizer' and w.status = 'active' and w.owner_id is not null
    and exists (select 1 from auth.users u where u.id = w.owner_id) order by w.created_at limit 1;
  select u.id into viewer from auth.users u where u.id <> owner and not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = u.id) limit 1;
  if ws is null or viewer is null then raise exception 'exercise: no organiser workspace / viewer'; end if;
  select id into ev from public.service_insert_event(jsonb_build_object('owner_id', owner, 'workspace_id', ws, 'name', 'Q56 Exercise Supper Club', 'slug', 'q56-ex-' || substr(md5(random()::text), 1, 8),
    'visibility', 'public', 'status', 'on_sale', 'event_type', 'food_drink', 'city', 'Q56ville', 'location', 'Harbour St, Q56ville',
    'starts_at', now() + interval '10 days', 'ends_at', now() + interval '10 days 4 hours'), 'q56 exercise');
  select id into ev2 from public.service_insert_event(jsonb_build_object('owner_id', owner, 'workspace_id', ws, 'name', 'Q56 Exercise Soon', 'slug', 'q56-ex2-' || substr(md5(random()::text), 1, 8),
    'visibility', 'public', 'status', 'on_sale', 'event_type', 'comedy', 'city', 'Q56ville', 'starts_at', now() + interval '2 days', 'ends_at', now() + interval '2 days 3 hours'), 'q56 exercise');

  -- 1. Matching. Untargeted category boost: shown on its own category (chip "food" ~ type food_drink) and city, not on others.
  insert into public.promotion_boosts(workspace_id, event_id, product_key, placement, amount_minor, status, targeting, starts_at, ends_at)
    values (ws, ev, 'category_spotlight_7d', 'category', 2900, 'active', '{}', now() - interval '1 hour', now() + interval '5 days') returning id into b1;
  select array_agg(c.boost_id) into ids from public.ad_candidates('category_top', '{"category":"food"}', now(), '{}') c;
  if not b1 = any(coalesce(ids, '{}')) then raise exception 'untargeted boost not matched on its own category'; end if;
  select array_agg(c.boost_id) into ids from public.ad_candidates('category_top', '{"category":"wedding"}', now(), '{}') c;
  if b1 = any(coalesce(ids, '{}')) then raise exception 'untargeted boost served on an unrelated category'; end if;
  select array_agg(c.boost_id) into ids from public.ad_candidates('category_top', '{"city":"q56ville"}', now(), '{}') c;
  if not b1 = any(coalesce(ids, '{}')) then raise exception 'untargeted boost not matched in its own city'; end if;
  select array_agg(c.boost_id) into ids from public.ad_candidates('category_top', '{"city":"elsewhere"}', now(), '{}') c;
  if b1 = any(coalesce(ids, '{}')) then raise exception 'untargeted boost served in another city'; end if;
  -- Targeted with the prefilled event type ("food drink") still matches the "food" chip.
  update public.promotion_boosts set targeting = '{"cities":[],"categories":["food drink"]}' where id = b1;
  select array_agg(c.boost_id) into ids from public.ad_candidates('category_top', '{"category":"food"}', now(), '{}') c;
  if not b1 = any(coalesce(ids, '{}')) then raise exception 'targeted "food drink" did not match chip "food"'; end if;
  -- Search row: the query must match the subject (organic text rule).
  insert into public.promotion_boosts(workspace_id, event_id, product_key, placement, amount_minor, status, targeting, starts_at, ends_at)
    values (ws, ev, 'search_boost_14d', 'search', 3900, 'active', '{}', now() - interval '1 hour', now() + interval '5 days') returning id into b2;
  select array_agg(c.boost_id) into ids from public.ad_candidates('search_results', '{"q":"supper club"}', now(), '{}') c;
  if not b2 = any(coalesce(ids, '{}')) then raise exception 'search boost not matched on its own name'; end if;
  select array_agg(c.boost_id) into ids from public.ad_candidates('search_results', '{"q":"zz-no-such-q56"}', now(), '{}') c;
  if b2 = any(coalesce(ids, '{}')) then raise exception 'search boost served for an unrelated query'; end if;
  -- The query is matched, never stored.
  select s.token into tok from public.serve_ad_slots('search_results', viewer, null, '{"q":"supper club"}', '{}', null, 'q56-seed') s where s.boost_id = b2;
  if tok is null then raise exception 'search boost not served'; end if;
  if (select ctx ? 'q' from public.ad_impressions where token = tok) then raise exception 'search query stored in the impression log'; end if;

  -- 2. Paused and suspended advertisers are never served.
  update public.promotion_boosts set paused_at = now() where id = b2;
  select array_agg(c.boost_id) into ids from public.ad_candidates('search_results', '{"q":"supper club"}', now(), '{}') c;
  if b2 = any(coalesce(ids, '{}')) then raise exception 'paused boost served'; end if;
  update public.promotion_boosts set paused_at = null where id = b2;
  update public.workspaces set status = 'suspended' where id = ws;
  select array_agg(c.boost_id) into ids from public.ad_candidates('search_results', '{"q":"supper club"}', now(), '{}') c;
  if b2 = any(coalesce(ids, '{}')) then raise exception 'suspended advertiser served'; end if;
  update public.workspaces set status = 'active' where id = ws;

  -- 3. Self-impressions / self-clicks are not paid delivery; a stranger's are. Views after a pause don't count.
  select s.token into tok from public.serve_ad_slots('search_results', owner, null, '{"q":"supper club"}', '{}', null, 'q56-self') s where s.boost_id = b2;
  if tok is null then raise exception 'owner not served (ads are shown to the advertiser)'; end if;
  if public.record_ad_view(tok, owner, null) then raise exception 'self-impression counted'; end if;
  if (public.record_ad_click(tok, owner, null) ->> 'counted')::boolean then raise exception 'self-click counted'; end if;
  select s.token into tok from public.serve_ad_slots('search_results', viewer, null, '{"q":"supper club"}', '{}', null, 'q56-other') s where s.boost_id = b2;
  update public.promotion_boosts set paused_at = now() where id = b2;
  if public.record_ad_view(tok, viewer, null) then raise exception 'view counted while paused'; end if;
  update public.promotion_boosts set paused_at = null where id = b2;
  select s.token into tok from public.serve_ad_slots('category_top', viewer, null, '{"category":"food"}', '{}', null, 'q56-v2') s where s.boost_id = b1;
  if not public.record_ad_view(tok, viewer, null) then raise exception 'stranger view not counted'; end if;

  -- 4. Buying as the owner: flight ends with the event; the open pending boost is reused.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b3 := public.create_promotion_boost(ev2, 'featured_event_7d', null, '{"cities":["Q56ville"," "],"categories":["Comedy_Club"]}');
  v := public.create_promotion_boost(ev2, 'featured_event_7d', null, '{}');
  reset role;
  if v <> b3 then raise exception 'pending boost not reused (duplicate per retry)'; end if;
  select * into bb from public.promotion_boosts where id = b3;
  if bb.ends_at <> (select ends_at from public.events where id = ev2) then raise exception 'flight not clipped to the event end: %', bb.ends_at; end if;
  if bb.targeting <> '{"cities":[],"categories":[]}'::jsonb then raise exception 'reused boost targeting not replaced: %', bb.targeting; end if;

  -- 5. Late payment keeps the full paid flight; ended events can't be paid.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b4 := public.create_promotion_boost(ev, 'featured_event_7d', null, '{}');
  reset role;
  update public.promotion_boosts set starts_at = now() - interval '2 hours', ends_at = now() - interval '2 hours' + interval '7 days' where id = b4;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  po := public.create_boost_payment_order(b4);
  reset role;
  if po.amount_minor <> 5880 or po.platform_fee_vat_minor <> 980 then raise exception 'boost order not priced with VAT: % / %', po.amount_minor, po.platform_fee_vat_minor; end if;
  perform public.payment_order_succeeded(po.reference, 'pi_Q56exercise' || substr(md5(random()::text), 1, 10), 'ch_Q56exercise', po.amount_minor, false);
  select * into bb from public.promotion_boosts where id = b4;
  if bb.status <> 'active' or bb.starts_at < now() - interval '1 minute' or bb.ends_at - bb.starts_at <> interval '7 days' then
    raise exception 'late payment shortened the flight: % % %', bb.status, bb.starts_at, bb.ends_at; end if;
  perform public.service_update_events(array[ev2], '{"starts_at":"2020-01-01T10:00:00Z","ends_at":"2020-01-01T12:00:00Z"}'::jsonb, 'q56 exercise');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_boost_payment_order(b3); ok := false; exception when others then ok := sqlerrm = 'boost_expired'; end;
  reset role;
  if not ok then raise exception 'boost for an ended event could be paid'; end if;

  -- 6. Settlement → refund of the undelivered share incl. VAT, once; the settled boost keeps status 'ended'.
  update public.promotion_boosts set status = 'ended', delivered_impressions = impression_goal / 4 where id = b4;
  perform public.ad_settle_boosts();
  select * into r from public.ad_credit_refunds_due(false, 100) d where d.boost_id = b4;
  if r.ledger_id is null then raise exception 'undelivered share not due for refund'; end if;
  select bb2.* into bb from public.promotion_boosts bb2 where id = b4;
  amt := least(round(bb.undelivered_credit_minor::numeric * 5880 / 4900), 5880);
  if r.refund_minor <> amt then raise exception 'refund amount % <> expected % (VAT-inclusive share)', r.refund_minor, amt; end if;
  perform public.ad_credit_refund_result(r.ledger_id, null, null, 'stripe down');
  if exists (select 1 from public.ad_credit_refunds_due(false, 100) d where d.ledger_id = r.ledger_id) then raise exception 'failed refund retried without backoff'; end if;
  perform public.ad_credit_refund_result(r.ledger_id, 're_Q56exercise', r.refund_minor, null);
  perform public.ad_credit_refund_result(r.ledger_id, 're_Q56exercise2', r.refund_minor, null);   -- second result is a no-op
  if (select stripe_refund_id from public.ad_credit_ledger where id = r.ledger_id) <> 're_Q56exercise' then raise exception 'refund recorded twice'; end if;
  perform public.payment_order_refunded((select stripe_payment_intent from public.payment_orders where id = po.id), r.refund_minor);
  if (select status from public.payment_orders where id = po.id) <> 'partially_refunded' then raise exception 'order not partially refunded'; end if;
  if (select status from public.promotion_boosts where id = b4) <> 'ended' then raise exception 'undelivered refund flipped a settled boost to refunded'; end if;
  if (public.boost_report(b4) -> 'undelivered_refund' ->> 'status') <> 'refunded' then raise exception 'report does not show the refund'; end if;

  -- 7. Admin controls: an organiser can't; a commerce admin needs aal2 and a reason.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.adm_boost_pause(b1, true, 'policy test'); ok := false; exception when others then ok := sqlerrm = 'not_authorized'; end;
  if not ok then raise exception 'organiser could pause boosts'; end if;
  begin perform public.adm_ad_placement_set('*', false, 'kill test'); ok := false; exception when others then ok := sqlerrm = 'not_authorized'; end;
  reset role;
  if not ok then raise exception 'organiser could switch placements'; end if;
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'commerce' = any(p.permissions) order by (u.email = 'admin.demo@example.com') desc limit 1;
  if adm is null then raise exception 'exercise: no commerce admin'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (sid, adm, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', sid)::text, true);
  set local role authenticated;
  begin perform public.adm_boost_pause(b1, true, 'policy test'); ok := false; exception when others then ok := sqlerrm = 'step_up_required'; end;
  reset role;
  if not ok then raise exception 'admin pause without aal2'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  begin perform public.adm_boost_pause(b1, true, 'no'); ok := false; exception when others then ok := sqlerrm = 'reason_required'; end;
  if not ok then raise exception 'pause without a reason'; end if;
  perform public.adm_boost_pause(b1, true, 'Misleading claim in event title');
  n := public.adm_ad_placement_set('*', false, 'Exercise kill switch');
  reset role;
  if (select paused_at from public.promotion_boosts where id = b1) is null then raise exception 'admin pause not applied'; end if;
  if exists (select 1 from public.ad_candidates('category_top', '{"category":"food"}', now(), '{}')) then raise exception 'kill switch left a placement serving'; end if;
  if n < 1 then raise exception 'kill switch changed nothing'; end if;
  if not exists (select 1 from public.audit_events where event = 'promotion.boost_paused' and metadata ->> 'boost_id' = b1::text) then raise exception 'pause not audited'; end if;

  raise exception 'EXERCISE_OK ads bughunt';
end $$;
