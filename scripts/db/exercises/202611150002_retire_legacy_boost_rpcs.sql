-- Q75 exercise (rolled back): after the revokes, anon and authenticated can no longer execute the legacy boost RPCs; service_role
-- still can. Ends with EXERCISE_OK.
do $$
declare u uuid;
begin
  select id into u from auth.users limit 1;
  if has_function_privilege('anon', 'public.active_boosts(text, text, text, integer)', 'execute') then raise exception 'anon can still execute active_boosts'; end if;
  if has_function_privilege('authenticated', 'public.active_boosts(text, text, text, integer)', 'execute') then raise exception 'authenticated can still execute active_boosts'; end if;
  if has_function_privilege('anon', 'public.record_boost_event(uuid, text)', 'execute') then raise exception 'anon can still execute record_boost_event'; end if;
  if has_function_privilege('authenticated', 'public.record_boost_event(uuid, text)', 'execute') then raise exception 'authenticated can still execute record_boost_event'; end if;
  if not has_function_privilege('service_role', 'public.active_boosts(text, text, text, integer)', 'execute') then raise exception 'service_role lost active_boosts'; end if;
  if not has_function_privilege('service_role', 'public.record_boost_event(uuid, text)', 'execute') then raise exception 'service_role lost record_boost_event'; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform public.active_boosts('discover', null, null, 12); raise exception 'anon called active_boosts';
  exception when insufficient_privilege then null; end;
  begin perform public.record_boost_event(gen_random_uuid(), 'impression'); raise exception 'anon called record_boost_event';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.active_boosts('discover', null, null, 12); raise exception 'authenticated called active_boosts';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'EXERCISE_OK Q75 legacy boost RPCs retired';
end $$;
