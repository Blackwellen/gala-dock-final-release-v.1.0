-- Q51 exercise (rolled back): my_reviews() / review_is_mine() are self-scoped and enforcement_actions stays readable, contact_profile never
-- returns a private storage path, rollback refuses an empty reason, unlinking a case record is audited, admin_user_stats.verified
-- matches the directory's Verified filter, and moderate_review_response refuses a revoked admin session. Ends with EXERCISE_OK.
do $$
declare r public.reviews; stranger uuid; adm uuid; sid uuid := gen_random_uuid(); n integer; m integer; j jsonb; ws uuid; owner uuid;
  c public.support_cases; lid uuid; v integer; sect text; ver integer;
begin
  select x.* into r from public.reviews x where x.status = 'published' and x.user_id is not null limit 1;
  if r.id is null then raise exception 'exercise: no published review'; end if;
  select u.id into stranger from auth.users u where u.id <> r.user_id and not exists (select 1 from public.platform_admins p where p.user_id = u.id) limit 1;

  -- 1. my_reviews() is self-scoped, review_is_mine() and the new enforcement_actions policy work for strangers and the reviewer
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_reviews() x where x.id = r.id;
  if n <> 0 then raise exception 'my_reviews leaked another user''s review'; end if;
  if public.review_is_mine(r.id) then raise exception 'review_is_mine true for a stranger'; end if;
  perform count(*) from public.enforcement_actions;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_reviews() x where x.id = r.id and x.user_id = r.user_id;
  if n <> 1 then raise exception 'reviewer cannot read own review via my_reviews'; end if;
  if not public.review_is_mine(r.id) then raise exception 'review_is_mine false for the reviewer'; end if;
  perform count(*) from public.enforcement_actions;
  reset role;

  -- 2. contact_profile: a private brand logo path is never the avatar
  select w.id, w.owner_id into ws, owner from public.workspaces w join public.listings l on l.workspace_id = w.id and l.published limit 1;
  update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'), '{brand}', coalesce(settings->'brand', '{}') || jsonb_build_object('logo', owner::text || '/brand/logo.png')) where id = ws;
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  j := public.contact_profile('workspace', ws, null);
  reset role;
  if j is not null and coalesce(j->>'avatar', '') like owner::text || '/%' then raise exception 'private logo path returned as avatar: %', j->>'avatar'; end if;
  update public.workspaces set settings = jsonb_set(settings, '{brand,logo}', '"https://cdn.example.test/logo.png"') where id = ws;
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  j := public.contact_profile('workspace', ws, null);
  reset role;
  if j is not null and j->>'avatar' <> 'https://cdn.example.test/logo.png' then raise exception 'public logo URL not used: %', j->>'avatar'; end if;

  -- 3–6 as an admin with settings + support + users (aal2, live session)
  select p.user_id into adm from public.platform_admins p where 'settings' = any(p.permissions) and 'support' = any(p.permissions) and 'trust' = any(p.permissions) limit 1;
  if adm is null then raise exception 'exercise: no settings+support+trust admin'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (sid, adm, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);

  -- 4. rollback with an empty reason is refused
  select section, version into sect, ver from public.platform_settings where status = 'superseded' order by created_at desc limit 1;
  if sect is not null then
    set local role authenticated;
    begin perform public.admin_rollback_setting(sect, ver, ''); raise exception 'empty rollback reason accepted';
    exception when others then if sqlerrm <> 'reason_required' then raise; end if; end;
    v := public.admin_rollback_setting(sect, ver, 'Q51 exercise rollback');
    reset role;
    if not exists (select 1 from public.platform_settings where section = sect and version = v and change_reason = 'Rollback to v' || ver || ': Q51 exercise rollback') then raise exception 'rollback not published'; end if;
  end if;

  -- 5. unlink writes an audit row
  select * into c from public.support_cases where status <> 'closed' and category <> 'safeguarding' limit 1;
  if c.id is not null then
    insert into public.support_case_links(case_id, record_type, record_id, label, created_by) values (c.id, 'workspace', ws::text, 'Q51 exercise', adm) returning id into lid;
    set local role authenticated;
    perform public.admin_unlink_case_record(lid);
    reset role;
    if not exists (select 1 from public.audit_events where event = 'support.case_unlinked' and metadata->>'case_id' = c.id::text and metadata->>'record_id' = ws::text) then raise exception 'unlink not audited'; end if;
  end if;

  -- 6. verified count == directory verified filter total
  if exists (select 1 from public.platform_admins where user_id = adm and 'users' = any(permissions)) then
    set local role authenticated;
    n := (public.admin_user_stats() ->> 'verified')::int;
    select coalesce(max(total_count), 0) into m from public.admin_user_directory('', 'verified', 1, 0);
    reset role;
    if n <> m then raise exception 'verified stat % <> directory %', n, m; end if;
  end if;

  -- 3. moderate_review_response refuses a revoked admin session
  delete from auth.sessions where id = sid;
  set local role authenticated;
  begin perform public.moderate_review_response(r.id, false, 'Q51 revoked session'); raise exception 'revoked admin session moderated a reply';
  exception when others then if sqlerrm <> 'session_revoked' then raise; end if; end;
  reset role;

  raise exception 'EXERCISE_OK Q51 admin bughunt';
end $$;
