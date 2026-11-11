-- Exercise for 202611116009 (rolled back): switch on = unchanged; off = demo hidden from anon and real users, kept for demo users.
do $$
declare demo_ws uuid[]; before_e integer; before_l integer; n integer; real_user uuid := '00000000-0000-4000-8000-0000000000aa'; demo_user uuid := 'fd06d06a-a1f6-4403-b952-70a8b68e42ac';
begin
  select array_agg(id) into demo_ws from public.workspaces w where public.is_demo_workspace(w.id);
  set local role anon;
  select count(*) into before_e from public.events_public;
  select count(*) into before_l from public.listings where published;
  reset role;
  update public.launch_settings set demo_public_visible = false where id;
  set local role anon;
  select count(*) into n from public.events_public e where e.workspace_id = any(demo_ws);
  if n <> 0 then raise exception 'anon still sees % demo events', n; end if;
  select count(*) into n from public.listings l where l.published and l.workspace_id = any(demo_ws);
  if n <> 0 then raise exception 'anon still sees % demo listings', n; end if;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', real_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events_public e where e.workspace_id = any(demo_ws);
  if n <> 0 then raise exception 'real user still sees demo events'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events_public;
  if n <> before_e then raise exception 'demo user lost events % vs %', n, before_e; end if;
  reset role;
  raise exception 'EXERCISE_OK demo switch (events % / listings % visible before)', before_e, before_l;
end $$;
