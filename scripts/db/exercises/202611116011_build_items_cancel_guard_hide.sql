-- Exercise for 202611116011 (always rolled back). Client-role writes as the event owner (role authenticated + JWT sub). Ends with EXERCISE_OK.
do $$
declare owner uuid := '2f66dd38-b683-4c1f-b58a-364e05d3db8d'; conf uuid := 'a45159c5-17ae-445b-8099-b2ddcb15b9df';
  quoted uuid := '665763cf-9f61-4e74-955f-8e6b19e229a1'; sugg uuid := 'f827aebd-41a0-482d-9605-973cb6e0fdcb';
  ok boolean; st text; h timestamptz; lst uuid; ev uuid; cat text; n integer;
begin
  select listing_id, event_id, category into lst, ev, cat from public.build_items where id = sugg;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. confirmed booking can no longer be cancelled through the transition RPC; a quoted (pre-booking) line still can
  ok := false; begin perform public.transition_build_item(conf, 'cancelled'); exception when others then ok := sqlerrm like 'invalid_transition:confirmed->cancelled%'; end;
  if not ok then raise exception 'confirmed line cancelled through transition_build_item'; end if;
  perform public.transition_build_item(quoted, 'cancelled');
  select status into st from public.build_items where id = quoted;
  if st <> 'cancelled' then raise exception 'quoted line not cancelled: %', st; end if;

  -- 2. hide: finished lines only (RPC and direct client update), unhide works
  h := public.set_build_item_hidden(quoted, true);
  if h is null then raise exception 'hide returned null'; end if;
  ok := false; begin perform public.set_build_item_hidden(conf, true); exception when others then ok := sqlerrm like 'build_item_not_finished%'; end;
  if not ok then raise exception 'confirmed line hidden via RPC'; end if;
  ok := false; begin update public.build_items set hidden_at = now() where id = conf; exception when others then ok := sqlerrm like 'build_item_not_finished%'; end;
  if not ok then raise exception 'confirmed line hidden by direct client update'; end if;
  update public.build_items set hidden_at = null where id = quoted;
  if (select hidden_at from public.build_items where id = quoted) is not null then raise exception 'unhide failed'; end if;

  -- 3. a second open line for the same listing is refused by the unique index (client insert)
  ok := false;
  begin insert into public.build_items(event_id, listing_id, category, title, status) values (ev, lst, cat, 'p1- duplicate', 'suggested');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'duplicate open line inserted'; end if;

  execute 'reset role';
  select count(*) into n from pg_indexes where indexname = 'build_items_event_listing_open_uidx';
  if n <> 1 then raise exception 'index missing'; end if;
  raise exception 'EXERCISE_OK build_items cancel guard + hide + unique open line';
end $$;
