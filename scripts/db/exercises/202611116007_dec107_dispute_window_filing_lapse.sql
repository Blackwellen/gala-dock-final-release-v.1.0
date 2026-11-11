-- Exercise for 202611116007 (always rolled back). Ends with EXERCISE_OK.
do $$
declare dsp uuid := 'f85186de-9531-433f-ab86-04d764b30c47'; item uuid := '0019f750-8c14-4ac8-9ba1-b58bc323a728';
  prov uuid := '126fe7c5-77f8-48bd-ac6e-aba1d1df17d8'; cust uuid := '6ccdd863-b4d5-4be2-ab6a-92e39870cb35'; ok boolean; n integer; st text;
begin
  -- clause 4: 3 days after the event, a fulfilled booking can no longer be disputed (exemption switched off for the test)
  update public.dec107_settings set exempt_demo_qa = false where id;
  update public.build_items set status = 'fulfilled' where id = item;
  update public.events set starts_at = now() - interval '4 days', ends_at = now() - interval '3 days' where id = (select event_id from public.build_items where id = item);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.open_booking_dispute(item, 'quality', 'p1- late dispute after the window', 10); exception when others then ok := sqlerrm = 'dispute_window_closed'; end;
  if not ok then raise exception 'window not enforced'; end if;
  update public.dec107_settings set exempt_demo_qa = true where id;

  -- rules in force (test only), both owners accepted them
  update public.dec107_settings set dispute_rules_in_force_from = '2026-10-01' where id;
  insert into public.consent_records(user_id, purpose, granted, policy_version, source) values (prov, 'dispute_rules', true, 'gd-dr-1.0-2026-11-11', 'app'), (cust, 'dispute_rules', true, 'gd-dr-1.0-2026-11-11', 'app');

  -- 8.4: the provider answered 15 days ago, the customer (opener) said nothing since → lapse
  begin
    update public.booking_dispute_entries set created_at = now() - interval '30 days' where dispute_id = dsp;
    insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body, created_at) values (dsp, prov, 'provider', 'statement', 'p1- provider answer', now() - interval '15 days');
    perform set_config('request.jwt.claims', '', true);
    n := public.dec107_dispute_deadlines();
    select status into st from public.booking_disputes where id = dsp;
    if st <> 'resolved' or (select resolution->>'outcome' from public.booking_disputes where id = dsp) <> 'lapsed' then raise exception 'lapse not applied: % %', st, n; end if;
    raise exception 'sub_ok';
  exception when others then if sqlerrm <> 'sub_ok' then raise; end if;
  end;

  -- 8.3: a request for independent resolution with no filing in 14 days is withdrawn (no recommendation → back to review)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    update public.booking_disputes set amount_claimed = 600 where id = dsp;     -- business, £600 → arbitration available
    perform public.dispute_request_independent(dsp, 'arbitration');
    ok := false; begin perform public.dispute_record_filing(dsp, 'X', 'Y'); exception when others then ok := sqlerrm = 'filing_details_required'; end;
    if not ok then raise exception 'filing validation missing'; end if;
    update public.booking_disputes set resolution = jsonb_set(resolution, '{escalation,requested_at}', to_jsonb(now() - interval '15 days')) where id = dsp;
    perform set_config('request.jwt.claims', '', true);
    n := public.dec107_dispute_deadlines();
    if (select status from public.booking_disputes where id = dsp) <> 'review' then raise exception 'escalation not withdrawn'; end if;
    raise exception 'sub_ok';
  exception when others then if sqlerrm <> 'sub_ok' then raise; end if;
  end;

  -- with in_force_from NULL nothing runs
  update public.dec107_settings set dispute_rules_in_force_from = null where id;
  if public.dec107_dispute_deadlines() <> 0 then raise exception 'ran while not in force'; end if;
  raise exception 'EXERCISE_OK window + 8.3 + 8.4';
end $$;
