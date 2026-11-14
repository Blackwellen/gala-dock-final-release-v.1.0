-- Q63 exercise: helpers behave, global_search escapes wildcards, ranks exact > prefix > substring, links proposals to the sales
-- route, hides paused listings; admin_global_search refuses aal1. Ends with EXERCISE_OK (rolled back).
do $$
declare a uuid; w1 uuid; pr public.proposals; lst public.listings; c uuid; adm uuid; n integer; ok boolean;
begin
  if 'abc' like '%' || public.search_like_escape('%') || '%' or 'abc' like '%' || public.search_like_escape('_') || '%' or not ('5%_a' like '%' || public.search_like_escape('%_a') || '%') then raise exception 'escape wrong'; end if;
  if not (public.search_rank('Gala', 'gala') > public.search_rank('Gala Night', 'gala')
      and public.search_rank('Gala Night', 'gala') > public.search_rank('Summer Gala', 'gala')
      and public.search_rank('Summer Gala', 'gala') > public.search_rank('Megagala', 'gala')
      and public.search_rank('Megagala', 'gala') > public.search_rank('Night Summer', 'summer gala')) then raise exception 'rank order wrong'; end if;
  if public.search_rank('Night at the Summer Gala', 'gala summer') < 0.64 then raise exception 'all-words rank wrong'; end if;
  if public.search_rank(null, 'x') <> 0 then raise exception 'null rank'; end if;

  select x.workspace_id, w.owner_id, x.id into w1, a, pr.id from public.proposals x join public.workspaces w on w.id = x.workspace_id where w.status = 'active' and length(x.title) >= 4 limit 1;
  select * into pr from public.proposals where id = pr.id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(pr.title, w1, 100) r where r.id = pr.id and r.link = '/organizer/sales/proposals/' || pr.id;
  if n <> 1 then raise exception 'proposal link not fixed'; end if;
  select count(*) into n from public.global_search('%%', w1, 100);
  if n <> 0 then raise exception 'wildcards not literal: % rows', n; end if;
  select count(*) into n from public.global_search('ab', w1, 100) r where r.link like '/organizers/%' or r.link like '/organizer/proposals/%';
  if n <> 0 then raise exception 'dead links remain'; end if;
  reset role;

  select * into lst from public.listings where published and paused_at is null limit 1;
  update public.listings set paused_at = now() where id = lst.id;
  select pf.id into c from public.profiles pf where not exists (select 1 from public.workspace_members m where m.user_id = pf.id) and not exists (select 1 from public.workspaces w where w.owner_id = pf.id) limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(lst.name, null, 100) r where r.id = lst.id;
  if n <> 0 then raise exception 'paused listing returned'; end if;
  begin perform public.admin_global_search('ab', 5); ok := false; exception when others then ok := sqlerrm ~ 'not_authorized'; end;
  if not ok then raise exception 'admin search open to a customer'; end if;
  reset role;

  select user_id into adm from public.platform_admins limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  begin perform public.admin_global_search('ab', 5); ok := false; exception when others then ok := sqlerrm ~ 'not_authorized'; end;
  if not ok then raise exception 'admin search must need aal2'; end if;
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  select count(*) into n from public.admin_global_search('ga', 40) r where r.link not like '/admin%';
  if n <> 0 then raise exception 'admin link outside console'; end if;
  reset role;
  raise exception 'EXERCISE_OK global search bughunt';
end $$;
