-- Exercise for 202611146031 (always rolled back): a signed-in user's own password verifies, a wrong one does not, anon cannot call it,
-- and the sixth attempt inside 15 minutes is rate limited. The test password is set inside the rolled-back transaction only.
do $$
declare uid uuid; ok boolean; limited boolean := false;
begin
  select u.id into uid from auth.users u where u.encrypted_password like '$2a$%' order by u.created_at desc limit 1;
  if uid is null then raise exception 'no password user to exercise'; end if;
  if has_function_privilege('anon', 'public.verify_my_password(text)', 'execute') then raise exception 'anon must not execute verify_my_password'; end if;
  if not has_function_privilege('authenticated', 'public.verify_my_password(text)', 'execute') then raise exception 'authenticated must execute verify_my_password'; end if;
  update auth.users set encrypted_password = extensions.crypt('Exercise-Pass-1!', extensions.gen_salt('bf', 10)) where id = uid;
  delete from public.rate_limits where key = 'verify-password:' || uid::text;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := public.verify_my_password('Exercise-Pass-1!'); if not ok then raise exception 'own password must verify'; end if;
  ok := public.verify_my_password('wrong-password'); if ok then raise exception 'wrong password must not verify'; end if;
  ok := public.verify_my_password(''); if ok then raise exception 'empty password must not verify'; end if;
  perform public.verify_my_password('wrong-password'); perform public.verify_my_password('wrong-password');
  begin perform public.verify_my_password('Exercise-Pass-1!'); exception when others then limited := sqlerrm = 'rate_limited'; end;
  execute 'reset role';
  if not limited then raise exception 'sixth attempt must be rate limited'; end if;
  raise exception 'EXERCISE_OK verify_my_password';
end $$;
