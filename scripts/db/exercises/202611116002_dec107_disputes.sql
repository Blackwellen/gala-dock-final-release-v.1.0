-- Exercise for 202611116002 (always rolled back; needs 202611116001 applied or in the same dry run). Ends with EXERCISE_OK.
do $$
declare dsp uuid := 'f85186de-9531-433f-ab86-04d764b30c47'; prov uuid := '126fe7c5-77f8-48bd-ac6e-aba1d1df17d8'; cust uuid := '6ccdd863-b4d5-4be2-ab6a-92e39870cb35';
  route jsonb; sid uuid; ok boolean; n integer; pack jsonb; res text; ri public.dec107_refund_instructions; kinds text;
begin
  route := public.dispute_route(dsp);
  if route->>'tier' <> 'small' then raise exception 'route %', route; end if;
  -- consumer tiers: a consumer claim of £3,000 has no arbitration
  update public.booking_disputes set amount_claimed = 3000 where id = dsp;
  update public.events set management = 'consumer' where id = (select event_id from public.booking_disputes where id = dsp);
  route := public.dispute_route(dsp);
  if (route->>'arbitration_allowed')::boolean or route->>'tier' <> 'mid' or not (route->>'consumer')::boolean then raise exception 'consumer route %', route; end if;
  update public.booking_disputes set amount_claimed = 40 where id = dsp;

  -- provider offers a settlement; the provider cannot accept its own offer; the customer accepts → resolved + refund instruction
  perform set_config('request.jwt.claims', json_build_object('sub', prov, 'role', 'authenticated')::text, true);
  sid := public.dispute_offer_settlement(dsp, 10, 'p1- settle');
  ok := false; begin perform public.dispute_accept_settlement(sid); exception when others then ok := sqlerrm = 'other_party_must_accept'; end;
  if not ok then raise exception 'self-accept allowed'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  pack := public.dispute_case_pack(dsp);
  if jsonb_array_length(pack->'timeline') < 1 or pack->'route' is null then raise exception 'case pack %', pack; end if;
  res := public.dispute_accept_settlement(sid);
  select * into ri from public.dec107_refund_instructions where dispute_id = dsp;
  if res <> 'resolved' or ri.amount_minor <> 1000 or ri.basis <> 'settlement' then raise exception 'settlement % %', res, ri; end if;
  if (select status from public.booking_disputes where id = dsp) <> 'resolved' then raise exception 'not resolved'; end if;

  -- notices: dispute_* kinds land in the mandatory payments email category
  select string_agg(distinct n2.kind || ':' || coalesce(o.category, 'none'), ',') into kinds from public.notifications n2 left join public.email_outbox o on o.notification_id = n2.id
   where n2.kind like 'dispute_%' and n2.created_at >= now() - interval '1 minute';
  if kinds is null or kinds like '%none%' or kinds not like '%payments%' then raise exception 'notice categories %', kinds; end if;
  if exists (select 1 from public.email_category('dispute_resolved') c where not c.mandatory or c.category <> 'payments') then raise exception 'category'; end if;

  -- staff cannot set a cancellation refund amount (recommendation only); anonymous callers are refused outright
  perform set_config('request.jwt.claims', json_build_object('sub', 'bab4da25-f22e-447a-9ccd-b426fe5e09e8', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into public.booking_cancellations(build_item_id, event_id, workspace_id, requested_by, party, kind, reason, item_status_before, policy_snapshot, calculation, status)
    select d.build_item_id, d.event_id, d.workspace_id, cust, 'customer', 'full', 'p1- exercise', 'confirmed', '{}', '{"paid": 100, "refund_amount": 50}', 'requested'
      from public.booking_disputes d where d.id = dsp;
  ok := false;
  begin perform public.decide_cancellation((select id from public.booking_cancellations where reason = 'p1- exercise'), true, 'p1- staff amount', 5);
  exception when others then kinds := kinds || ' err=' || sqlerrm; ok := sqlerrm in ('recommendation_only','session_revoked'); end;
  if not ok then raise exception 'staff refund amount accepted (%)', kinds; end if;

  -- a party cannot pass an amount either: accepting applies the agreed policy
  perform set_config('request.jwt.claims', json_build_object('sub', prov, 'role', 'authenticated')::text, true);
  ok := false;
  begin perform public.decide_cancellation((select id from public.booking_cancellations where reason = 'p1- exercise'), true, 'p1- party amount', 5);
  exception when others then ok := sqlerrm = 'recommendation_only'; end;
  if not ok then raise exception 'party refund amount accepted'; end if;

  -- deadline rules do nothing while dispute_rules_in_force_from is NULL
  select public.dec107_dispute_deadlines() into n;
  if n <> 0 then raise exception 'deadlines ran %', n; end if;
  raise exception 'EXERCISE_OK disputes kinds=%', kinds;
end $$;
