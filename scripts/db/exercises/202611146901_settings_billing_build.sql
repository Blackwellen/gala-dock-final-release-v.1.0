-- Exercise for 202611146901 (always rolled back): organiser notification switches reach delivery, mandatory kinds ignore them,
-- plan limits refuse new active events / seats / live listings but never touch existing ones, exemptions, ownership transfer
-- (request → blockers → accept swaps roles atomically, invites follow, job queued), brand colour lookups, email-change hook.
do $$
declare
  owner uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); third uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); ws uuid; ev uuid; ev2 uuid; n public.notifications; tid uuid; r jsonb; st jsonb; ok boolean; c int; li uuid;
begin
  -- Fixtures: a real-looking (non-demo) owner domain so the exemption does not apply.
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q67-owner@gala-exercise.co.uk', '', now(), now(), now(), '{}', '{"full_name":"Q67 Owner"}'),
         (mgr,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q67-mgr@gala-exercise.co.uk', '', now(), now(), now(), '{}', '{"full_name":"Q67 Manager"}'),
         (third, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q67-third@gala-exercise.co.uk', '', now(), now(), now(), '{}', '{"full_name":"Q67 Third"}');
  insert into auth.sessions(id, user_id, created_at, updated_at, aal) values (s1, owner, now(), now(), 'aal2'), (s2, mgr, now(), now(), 'aal2');
  insert into public.workspaces(id, owner_id, name, kind, status, onboarding_complete, plan, settings)
  values (gen_random_uuid(), owner, 'Q67 Exercise Events', 'organizer', 'active', true, 'starter', '{"brand": {"brand_color": "#FF00AA"}}') returning id into ws;
  if public.plan_limit_exempt(ws) then raise exception 'fixture must not be exempt'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, status) values (ws, mgr, 'manager', 'active');   -- system write: not limited

  -- ── Brand colour ──
  if public.workspace_brand_color(ws) <> '#FF00AA' then raise exception 'brand from onboarding settings: %', public.workspace_brand_color(ws); end if;
  update public.workspaces set settings = settings || '{"brand_color": "#123456"}' where id = ws;
  if public.workspace_brand_color(ws) <> '#123456' then raise exception 'settings.brand_color must win'; end if;
  update public.workspaces set settings = settings || '{"brand_color": "red; x"}' where id = ws;
  if public.workspace_brand_color(ws) <> '#FF00AA' then raise exception 'invalid brand colour must fall back'; end if;
  if has_function_privilege('anon', 'public.workspace_brand_color(uuid)', 'execute') then raise exception 'workspace_brand_color must not be anon'; end if;
  if not has_function_privilege('anon', 'public.public_event_brand(uuid)', 'execute') then raise exception 'public_event_brand must be anon'; end if;

  -- ── Notifications ──
  if not (select mandatory from public.email_category('billing')) or (select category from public.email_category('billing')) <> 'payments' then raise exception 'billing must be mandatory payments'; end if;
  if not public.notification_mandatory('legal_terms_update') or not public.notification_mandatory('dispute_opened') or public.notification_mandatory('quote_received') then raise exception 'mandatory map wrong'; end if;

  update public.workspaces set settings = settings || '{"notifications": {"in_app": false, "email": true, "agent": false}}' where id = ws;
  perform public.notify_workspace(ws, array['manager'], 'quote_received', 'Q67 quote', 'body', '/organizer/marketplace');
  select * into n from public.notifications where user_id = mgr and title = 'Q67 quote';
  if n.id is null or not n.muted or n.read_at is null or n.workspace_id <> ws then raise exception 'in_app off must store muted+read: %', row_to_json(n); end if;
  if not exists (select 1 from public.email_outbox where notification_id = n.id) then raise exception 'email on: outbox row expected'; end if;
  perform public.notify_workspace(ws, array['manager'], 'payment_due', 'Q67 pay', 'body', '/organizer/money');
  select * into n from public.notifications where user_id = mgr and title = 'Q67 pay';
  if n.muted or n.read_at is not null then raise exception 'mandatory kinds ignore switches'; end if;
  -- Inferred workspace: /organizer link, single organiser membership.
  insert into public.notifications(user_id, kind, title, link) values (mgr, 'agent', 'Q67 agent update', '/organizer/agent');
  if exists (select 1 from public.notifications where user_id = mgr and title = 'Q67 agent update') then raise exception 'agent=false must drop agent updates'; end if;
  insert into public.notifications(user_id, kind, title, link) values (mgr, 'agent_approval', 'Q67 approval', '/organizer/agent?view=approvals');
  if not exists (select 1 from public.notifications where user_id = mgr and title = 'Q67 approval') then raise exception 'approval requests always arrive'; end if;
  update public.workspaces set settings = settings || '{"notifications": {"in_app": true, "email": false, "agent": true}}' where id = ws;
  perform public.notify_workspace(ws, array['manager'], 'quote_received', 'Q67 quote2', 'body', '/organizer/marketplace');
  select * into n from public.notifications where user_id = mgr and title = 'Q67 quote2';
  if n.muted or exists (select 1 from public.email_outbox where notification_id = n.id) then raise exception 'email off: no outbox row, not muted'; end if;
  update public.workspaces set settings = settings || '{"notifications": {"in_app": false, "email": false}}' where id = ws;
  perform public.notify_workspace(ws, array['manager'], 'quote_received', 'Q67 quote3', 'body', '/organizer/marketplace');
  if exists (select 1 from public.notifications where user_id = mgr and title = 'Q67 quote3') then raise exception 'both off: nothing stored'; end if;
  -- Not a workspace notification (no link into /organizer): untouched.
  insert into public.notifications(user_id, kind, title, link) values (mgr, 'ticket', 'Q67 personal', '/account/tickets');
  if not exists (select 1 from public.notifications where user_id = mgr and title = 'Q67 personal' and not muted and workspace_id is null) then raise exception 'personal notification touched'; end if;
  update public.workspaces set settings = settings - 'notifications' where id = ws;

  -- ── Plan limits (starter: 3 active events, 2 seats) as the owner ──
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s1)::text, true);
  insert into public.events(owner_id, workspace_id, name, status, management) select owner, ws, 'Q67 E' || g, 'planning', 'professional' from generate_series(1, 3) g;
  insert into public.events(owner_id, workspace_id, name, status, management) values (owner, ws, 'Q67 draft', 'draft', 'professional') returning id into ev;   -- drafts never count
  ok := false; begin insert into public.events(owner_id, workspace_id, name, status, management) values (owner, ws, 'Q67 E4', 'planning', 'professional');
  exception when sqlstate 'P0001' then ok := sqlerrm like 'plan_limit_reached:events%'; end;
  if not ok then raise exception '4th active event must be refused'; end if;
  ok := false; begin update public.events set status = 'planning' where id = ev; exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'activating a draft over the limit must be refused'; end if;
  select id into ev2 from public.events where workspace_id = ws and name = 'Q67 E1';
  update public.events set name = 'Q67 E1 renamed' where id = ev2;   -- existing active event: untouched
  update public.events set status = 'archived' where id = ev2;
  update public.events set status = 'planning' where id = ev;                            -- a slot is free again
  st := public.plan_limit_status(ws);
  if (st #>> '{events,used}')::int <> 3 or (st #>> '{events,max}')::int <> 3 or (st #>> '{seats,max}')::int <> 2 or (st ->> 'reporting_advanced')::boolean then raise exception 'status wrong: %', st; end if;
  -- Seats: owner + manager = 2 → an invitation is refused; enterprise is unlimited; the override can raise it.
  ok := false; begin insert into public.workspace_invites(workspace_id, email, role, token_hash, invited_by) values (ws, 'q67-new@gala-exercise.co.uk', 'member', repeat('a', 64), owner);
  exception when sqlstate 'P0001' then ok := sqlerrm = 'plan_limit_reached:seats'; end;
  if not ok then raise exception 'invite over seat limit must be refused'; end if;
  ok := false; begin insert into public.workspace_members(workspace_id, user_id, role, status) values (ws, third, 'member', 'active'); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'direct member add over the limit must be refused'; end if;
  update public.workspaces set plan = 'enterprise' where id = ws;
  insert into public.workspace_invites(workspace_id, email, role, token_hash, invited_by) values (ws, 'q67-third@gala-exercise.co.uk', 'member', repeat('b', 64), owner);
  update public.workspaces set plan = 'starter' where id = ws;
  -- The pending invitation was counted when sent: accepting it never fails even though the workspace is now over the limit.
  insert into public.workspace_members(workspace_id, user_id, role, status) values (ws, third, 'member', 'active');
  if public.workspace_seats_used(ws) <> 4 then raise exception 'seats = members + pending invites, got %', public.workspace_seats_used(ws); end if;
  -- Exempt (demo) workspaces are not limited.
  update public.workspaces set settings = settings || '{"demo": true}' where id = ws;
  insert into public.events(owner_id, workspace_id, name, status, management) values (owner, ws, 'Q67 demo extra', 'planning', 'professional');
  update public.workspaces set settings = settings - 'demo' where id = ws;
  -- Listings (provider cap) use the same rule on publish.
  if public.plan_limit_max(ws, 'listings.max') is not null then raise exception 'organiser has no listings cap'; end if;
  update public.workspaces set kind = 'provider' where id = ws;
  insert into public.listings(workspace_id, name, kind, published) select ws, 'Q67 L' || g, 'service', true from generate_series(1, 3) g;
  insert into public.listings(workspace_id, name, kind, published) values (ws, 'Q67 L draft', 'service', false) returning id into li;   -- unpublished: fine
  ok := false; begin update public.listings set published = true where id = li; exception when sqlstate 'P0001' then ok := sqlerrm = 'plan_limit_reached:listings'; end;
  if not ok then raise exception '4th live listing must be refused'; end if;
  update public.listings set paused_at = now() where workspace_id = ws and name = 'Q67 L1';                                 -- pausing frees a slot
  update public.listings set published = true where id = li;
  ok := false; begin update public.listings set paused_at = null where workspace_id = ws and name = 'Q67 L1'; exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'unpausing over the limit must be refused'; end if;
  update public.listings set name = 'Q67 L2 renamed' where workspace_id = ws and name = 'Q67 L2';                            -- existing live listing: untouched
  update public.workspaces set kind = 'organizer' where id = ws;

  -- ── Ownership transfer ──
  update public.workspace_members set status = 'revoked' where workspace_id = ws and user_id = third;
  ok := false; begin perform public.request_ownership_transfer(ws, mgr, 'wrong name'); exception when others then ok := sqlerrm = 'confirm_mismatch'; end;
  if not ok then raise exception 'typed confirmation must match the workspace name'; end if;
  ok := false; begin perform public.request_ownership_transfer(ws, third, 'Q67 Exercise Events'); exception when others then ok := sqlerrm = 'target_not_manager'; end;
  if not ok then raise exception 'only active managers can receive ownership'; end if;
  insert into public.payout_pauses(workspace_id, basis, reference, note, created_by) values (ws, 'seller_request', 'q67-ref', 'q67', owner);
  ok := false; begin perform public.request_ownership_transfer(ws, mgr, 'Q67 Exercise Events'); exception when others then ok := sqlerrm = 'transfer_blocked:payout_pause'; end;
  if not ok then raise exception 'payout pause must block: %', sqlerrm; end if;
  update public.payout_pauses set lifted_at = now(), lifted_by = owner, lift_note = 'q67' where workspace_id = ws;
  tid := public.request_ownership_transfer(ws, mgr, '  q67 exercise events ');
  ok := false; begin perform public.request_ownership_transfer(ws, mgr, 'Q67 Exercise Events'); exception when others then ok := sqlerrm = 'transfer_pending'; end;
  if not ok then raise exception 'one pending transfer per workspace'; end if;
  ok := false; begin perform public.respond_ownership_transfer(tid, true); exception when others then ok := sqlerrm = 'not_authorized'; end;
  if not ok then raise exception 'the owner cannot accept their own transfer'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s2)::text, true);
  r := public.respond_ownership_transfer(tid, true);
  if r ->> 'result' <> 'accepted' then raise exception 'accept failed: %', r; end if;
  if (select owner_id from public.workspaces where id = ws) <> mgr then raise exception 'owner_id not moved'; end if;
  if (select role from public.workspace_members where workspace_id = ws and user_id = mgr) <> 'owner' or (select role from public.workspace_members where workspace_id = ws and user_id = owner) <> 'manager' then raise exception 'roles not swapped'; end if;
  if (select count(*) from public.workspace_members where workspace_id = ws and role = 'owner') <> 1 then raise exception 'exactly one owner'; end if;
  if exists (select 1 from public.workspace_invites where workspace_id = ws and accepted_at is null and revoked_at is null and invited_by <> mgr) then raise exception 'pending invites must follow the owner'; end if;
  if not exists (select 1 from public.audit_events where workspace_id = ws and event = 'workspace.ownership_transferred') then raise exception 'audit missing'; end if;
  if not exists (select 1 from public.job_queue where dedupe_key = 'billing-contact:transfer:' || tid) then raise exception 'billing contact job missing'; end if;
  if (select count(*) from public.notifications where dedupe_key like 'ownership-transfer:' || tid || '%') <> 4 then raise exception 'both parties notified twice (asked/requested, new/old owner)'; end if;
  ok := false; begin perform public.respond_ownership_transfer(tid, true); exception when others then ok := sqlerrm = 'not_pending'; end;
  if not ok then raise exception 'replay must be refused'; end if;

  -- ── Email change hook ──
  perform set_config('request.jwt.claims', '', true);
  update auth.users set email = 'q67-mgr-new@gala-exercise.co.uk' where id = mgr;
  if not exists (select 1 from public.audit_events where actor_id = mgr and event = 'auth.email_changed') then raise exception 'email change audit missing'; end if;
  if not exists (select 1 from public.job_queue where kind = 'billing.sync_customer_contact' and payload ->> 'user_id' = mgr::text) then raise exception 'email change sync job missing'; end if;
  if not exists (select 1 from public.email_outbox o join public.notifications x on x.id = o.notification_id where x.user_id = mgr and x.title = 'Your sign-in email was changed' and o.to_email = 'q67-mgr-new@gala-exercise.co.uk') then
    raise exception 'security notice must go to the new address';
  end if;
  raise exception 'EXERCISE_OK settings billing build';
end $$;
