-- Q51 exercise (rolled back): with the column grants, a signed-in stranger reads published reviews' safe columns but not user_id /
-- moderation_reason; the reviewer still gets their own rows (with user_id) from my_reviews(); enforcement_actions stays readable
-- for both; anon unchanged. Ends with EXERCISE_OK.
do $$
declare r public.reviews; stranger uuid; adm uuid; sid uuid := gen_random_uuid(); n integer; m integer; j jsonb; ws uuid; owner uuid;
  c public.support_cases; lid uuid; v integer; sect text; ver integer;
begin
  select x.* into r from public.reviews x where x.status = 'published' and x.user_id is not null limit 1;
  if r.id is null then raise exception 'exercise: no published review'; end if;
  select u.id into stranger from auth.users u where u.id <> r.user_id and not exists (select 1 from public.platform_admins p where p.user_id = u.id) limit 1;

  -- 1a. a signed-in stranger: safe columns ok, reviewer id and moderation reason refused
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.reviews where id = r.id;
  if n <> 1 then raise exception 'stranger cannot read published review safe columns'; end if;
  begin perform (select user_id from public.reviews where id = r.id); raise exception 'stranger read reviews.user_id';
  exception when insufficient_privilege then null; end;
  begin perform (select moderation_reason from public.reviews where id = r.id); raise exception 'stranger read reviews.moderation_reason';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.my_reviews() x where x.id = r.id;
  if n <> 0 then raise exception 'my_reviews leaked another user''s review'; end if;
  perform count(*) from public.enforcement_actions;   -- policy no longer reads reviews.user_id as the caller
  reset role;

  -- 1b. the reviewer: own rows with user_id through my_reviews()
  perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_reviews() x where x.id = r.id and x.user_id = r.user_id;
  if n <> 1 then raise exception 'reviewer cannot read own review via my_reviews'; end if;
  if not public.review_is_mine(r.id) then raise exception 'review_is_mine false for the reviewer'; end if;
  perform count(*) from public.enforcement_actions;
  reset role;

  -- 1c. anon unchanged: published safe columns readable
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.reviews where id = r.id;
  if n <> 1 then raise exception 'anon lost published reviews'; end if;
  reset role;

  raise exception 'EXERCISE_OK Q51 reviews column grants';
end $$;
