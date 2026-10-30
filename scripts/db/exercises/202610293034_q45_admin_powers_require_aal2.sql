-- Dry-run exercise for 202610293034 (always rolled back by migrate.mjs). Runs as the CLIENT ROLE (authenticated) with the live demo
-- platform admin's real session id, on aal1 and aal2 claims, plus a non-admin: reads refused on aal1, mutations still answer
-- step_up_required, own platform_admins row still visible (requireRole → /mfa), everything works on aal2, non-admins unchanged.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

do $$
declare adm uuid; sid text; usr uuid; c1 text; c2 text; cu text; n int; msg text; j jsonb; total_admins int;
begin
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where u.email = 'admin.demo@example.com';
  select s.id::text into sid from auth.sessions s where s.user_id = adm order by s.created_at desc limit 1;
  if adm is null or sid is null then raise exception 'exercise: demo admin or live session missing'; end if;
  select owner_id into usr from public.workspaces where id = '75e6c471-8d5e-4b9f-b076-ff10cf209f01';
  select count(*) into total_admins from public.platform_admins;
  c1 := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', sid)::text;
  c2 := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text;
  cu := json_build_object('sub', usr, 'role', 'authenticated', 'aal', 'aal1')::text;

  -- 1. Admin on aal1.
  perform set_config('request.jwt.claims', c1, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  if public.has_admin_permission('users') or public.is_platform_admin() then raise exception 'aal1 admin still has powers'; end if;
  begin perform public.admin_user_identity(usr); raise exception 'X_IDENTITY'; exception when sqlstate '42501' then null; end;
  begin perform public.admin_overview(30); raise exception 'X_OVERVIEW'; exception when sqlstate '42501' then null; end;
  select count(*) into n from public.platform_admins;
  if n <> 1 then raise exception 'aal1 admin should see only its own platform_admins row, saw %', n; end if;
  begin perform public.admin_require('users', 'Q45 exercise'); msg := 'none'; exception when others then msg := sqlerrm; end;
  if msg <> 'step_up_required' then raise exception 'admin_require on aal1 said %', msg; end if;
  begin perform public.admin_set_user_status(usr, 'restricted', 'Q45 exercise'); msg := 'none'; exception when others then msg := sqlerrm; end;
  if msg <> 'step_up_required' then raise exception 'admin_set_user_status on aal1 said %', msg; end if;
  begin perform public.admin_save_setting_draft('general', '{}'::jsonb, 'Q45 exercise'); msg := 'none'; exception when others then msg := sqlerrm; end;
  if msg <> 'step_up_required' then raise exception 'admin_save_setting_draft on aal1 said %', msg; end if;
  begin perform public.admin_reply_case(gen_random_uuid(), 'Q45', false); msg := 'none'; exception when others then msg := sqlerrm; end;
  if msg <> 'step_up_required' then raise exception 'admin_reply_case on aal1 said %', msg; end if;
  reset role;
  insert into _ex values ('aal1_reads_refused', 'admin_user_identity, admin_overview, has_admin_permission, is_platform_admin'),
    ('aal1_own_admin_row_visible', '1'), ('aal1_mutations_step_up', 'admin_require, admin_set_user_status, admin_save_setting_draft, admin_reply_case');

  -- 2. Same admin, same session, aal2: full powers.
  perform set_config('request.jwt.claims', c2, true);
  set local role authenticated;
  if not public.has_admin_permission('users') or not public.is_platform_admin() then raise exception 'aal2 admin lost powers'; end if;
  j := public.admin_user_identity(usr);
  if j ->> 'id' is distinct from usr::text then raise exception 'aal2 identity read failed'; end if;
  j := public.admin_overview(30);
  if not (j ? 'users') then raise exception 'aal2 overview missing sections'; end if;
  select count(*) into n from public.platform_admins;
  if n <> total_admins then raise exception 'aal2 admin should see all % admins, saw %', total_admins, n; end if;
  perform public.admin_require('users', 'Q45 exercise');
  reset role;
  insert into _ex values ('aal2_powers', 'ok'), ('aal2_admins_visible', n::text);

  -- 3. Non-admin organiser: unchanged (not_authorized; normal reads fine).
  perform set_config('request.jwt.claims', cu, true); perform set_config('request.jwt.claim.sub', usr::text, true);
  set local role authenticated;
  begin perform public.admin_require('users', 'Q45 exercise'); msg := 'none'; exception when others then msg := sqlerrm; end;
  if msg <> 'not_authorized' then raise exception 'non-admin admin_require said %', msg; end if;
  select count(*) into n from public.events where workspace_id = '75e6c471-8d5e-4b9f-b076-ff10cf209f01';
  if n = 0 then raise exception 'organiser lost its own events'; end if;
  reset role;
  insert into _ex values ('non_admin_unchanged', 'not_authorized; own events ' || n);

  -- 4. Service role (workers): unchanged.
  set local role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  if public.has_admin_permission('users') then raise exception 'service role became admin'; end if;
  reset role;
  insert into _ex values ('policies_using_admin_helpers', (select count(*) from pg_policies where qual ~ 'is_platform_admin|has_admin_permission' or with_check ~ 'is_platform_admin|has_admin_permission')::text);
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
