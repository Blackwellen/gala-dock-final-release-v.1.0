-- Q52/Q64 exercise (rolled back): per-recipient message alerts (back-and-forth replies are notified, no repeat while unread,
-- reading clears the alert), workspace-tagged alerts, teammate messages not unread, blocks both ways, report → trust case →
-- admin decision (message removed, reporter told), legacy thread guard / mark-read / tamper policies / reply alerts, the
-- same-transaction duplicate guard, provider per-kind preferences and the email categories. Ends with EXERCISE_OK.
do $$
declare conv uuid; cu uuid; pw uuid; pm uuid; m1 uuid; m2 uuid; n int; ok boolean; rid uuid; cid uuid; adm uuid; mate uuid; st text;
  th uuid; ev uuid; owner uuid; tpw uuid; tpm uuid; pmsg uuid; nm text; fp boolean; cat record; outsider uuid;
  claims text;
begin
  -- Fixture: a conversation between a person and a provider workspace that has an owner/manager.
  select c.id, pu.user_id, pw2.workspace_id into conv, cu, pw
    from public.conversations c join public.conversation_participants pu on pu.conversation_id = c.id and pu.user_id is not null and pu.left_at is null
    join public.conversation_participants pw2 on pw2.conversation_id = c.id and pw2.workspace_id is not null and pw2.left_at is null
    join public.workspaces w on w.id = pw2.workspace_id and w.status = 'active'
   where (select count(*) from public.conversation_participants x where x.conversation_id = c.id) = 2
     and not exists (select 1 from public.workspace_members m where m.workspace_id = pw2.workspace_id and m.user_id = pu.user_id)
     and exists (select 1 from public.workspace_members m where m.workspace_id = pw2.workspace_id and m.status = 'active' and m.role in ('owner','manager'))
   limit 1;
  if conv is null then raise exception 'exercise: no fixture conversation'; end if;
  select m.user_id into pm from public.workspace_members m where m.workspace_id = pw and m.status = 'active' and m.role in ('owner','manager') order by m.created_at limit 1;
  delete from public.message_blocks where target_id in (cu, pw) or owner_user = cu or owner_workspace = pw;
  update public.notifications set read_at = now() - interval '1 hour', created_at = least(created_at, now() - interval '1 hour') where link = '/messages/' || conv;

  -- 2. Back-and-forth: customer writes, provider replies at once → both sides alerted; a second customer message while the
  --    provider's alert is unread does not add another.
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  m1 := public.post_message(conv, 'q52 exercise hello', '[]'::jsonb, null);
  reset role;
  select count(*) into n from public.notifications where user_id = pm and kind = 'message' and link = '/messages/' || conv and created_at = now() and workspace_id = pw;
  if n <> 1 then raise exception 'provider manager not alerted once with the workspace tag (%).', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  m2 := public.post_message(conv, 'q52 exercise reply', '[]'::jsonb, pw);
  reset role;
  select count(*) into n from public.notifications where user_id = cu and kind = 'message' and link = '/messages/' || conv and created_at = now();
  if n <> 1 then raise exception 'customer reply alert missing (the old per-conversation throttle): %', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.post_message(conv, 'q52 exercise second', '[]'::jsonb, null);
  reset role;
  select count(*) into n from public.notifications where user_id = pm and kind = 'message' and link = '/messages/' || conv and created_at = now();
  if n <> 1 then raise exception 'repeat alert while unread: %', n; end if;
  -- 3. Reading clears the alert.
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.mark_conversation_read(conv);
  reset role;
  if exists (select 1 from public.notifications where user_id = pm and kind = 'message' and link = '/messages/' || conv and read_at is null) then raise exception 'reading did not clear the alert'; end if;

  -- 1. A teammate's message in the shared inbox is not unread for the team; the customer's is.
  select u.id into mate from auth.users u where u.id not in (cu, pm) and not exists (select 1 from public.workspace_members m where m.workspace_id = pw and m.user_id = u.id) limit 1;
  insert into public.conversation_messages(conversation_id, sender_id, sender_workspace_id, sender_name, body, created_at) values (conv, mate, pw, 'Mate', 'teammate note', now() + interval '1 second');
  update public.conversations set last_message_at = now() + interval '1 second' where id = conv;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select unread into ok from public.my_conversations(pw, 200) where id = conv;
  reset role;
  if ok then raise exception 'teammate message counted as unread for the workspace'; end if;
  insert into public.conversation_messages(conversation_id, sender_id, sender_name, body, created_at) values (conv, cu, 'Cust', 'customer note', now() + interval '2 seconds');
  update public.conversations set last_message_at = now() + interval '2 seconds' where id = conv;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select unread into ok from public.my_conversations(pw, 200) where id = conv;
  reset role;
  if not ok then raise exception 'customer message not unread for the workspace'; end if;

  -- 4. Block both ways, then unblock.
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.block_contact('user', cu, pw);
  begin perform public.post_message(conv, 'x', '[]'::jsonb, pw); raise exception 'blocker could still send'; exception when others then if sqlerrm <> 'blocked_by_you' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.post_message(conv, 'x', '[]'::jsonb, null); raise exception 'blocked user could still send'; exception when others then if sqlerrm <> 'blocked' then raise; end if; end;
  select count(*) into n from public.message_blocks;   -- RLS: the blocked person can't see who blocked them
  if n <> 0 then raise exception 'blocked user can read the block row'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.unblock_contact('user', cu, pw);
  perform public.post_message(conv, 'q52 unblocked', '[]'::jsonb, pw);
  -- Outsider ids can't be pre-blocked.
  reset role;
  select u.id into outsider from auth.users u where not public.shares_conversation('user', u.id) and u.id <> pm limit 1;
  set local role authenticated;
  begin perform public.block_contact('user', outsider, null); raise exception 'blocked a stranger'; exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end;

  -- 4c. Report the customer's message; own message refused; outsider refused.
  rid := public.report_message(m1, 'spam', 'q52 exercise report', 'conversation', false, pw);
  begin perform public.report_message(m2, 'spam', '', 'conversation', false, pw); raise exception 'reported own message'; exception when others then if sqlerrm <> 'cannot_report_own_message' then raise; end if; end;
  reset role;
  select case_id into cid from public.message_reports where id = rid;
  if cid is null or not exists (select 1 from public.trust_cases where id = cid and category = 'Message report' and subject_id = cu) then raise exception 'no trust case for the report'; end if;
  if not exists (select 1 from public.message_reports where id = rid and excerpt like 'q52 exercise hello%' and reported_user = cu) then raise exception 'report excerpt missing'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.report_message(m1, 'spam', '', 'conversation', false, null); raise exception 'outsider reported'; exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  select count(*) into n from public.message_reports;
  if n <> 0 then raise exception 'outsider can read reports'; end if;
  begin perform public.admin_decide_message_report(rid, 'dismissed', 'not an admin', false); raise exception 'non-admin decided'; exception when others then if sqlerrm <> 'not_authorized' then raise; end if; end;
  reset role;
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'trust' = any(p.permissions) limit 1;
  if adm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    select count(*) into n from public.message_reports where id = rid;
    if n <> 1 then raise exception 'trust admin cannot list the report'; end if;
    perform public.admin_decide_message_report(rid, 'actioned', 'q52 exercise removal', true);
    reset role;
    if not exists (select 1 from public.conversation_messages where id = m1 and deleted_at is not null) then raise exception 'message not removed'; end if;
    if not exists (select 1 from public.notifications where user_id = pm and kind = 'report_outcome' and created_at = now()) then raise exception 'reporter not told the outcome'; end if;
    if not exists (select 1 from public.trust_cases where id = cid and status = 'actioned') then raise exception 'case not closed'; end if;
  end if;

  -- 5. Legacy event thread: spoof guard, reply alerts, mark read, tamper policies.
  select t.id, e.id, e.owner_id, l.workspace_id into th, ev, owner, tpw
    from public.threads t join public.events e on e.id = t.event_id join public.listings l on l.id = t.listing_id
   where e.workspace_id is null and e.owner_id is not null and exists (select 1 from public.messages m where m.thread_id = t.id)
     and exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.status = 'active' and m.role in ('owner','manager') and m.user_id <> e.owner_id)
   limit 1;
  if th is null then raise exception 'exercise: no legacy thread'; end if;
  select m.user_id into tpm from public.workspace_members m where m.workspace_id = tpw and m.status = 'active' and m.role in ('owner','manager') and m.user_id <> owner order by m.created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  insert into public.messages(thread_id, sender_id, sender_name, from_provider, body) values (th, owner, 'Gala Dock Support', true, 'q52 spoof attempt') returning from_provider, sender_name into fp, nm;
  reset role;
  if fp or nm = 'Gala Dock Support' then raise exception 'legacy spoof not prevented (% / %)', fp, nm; end if;
  if not exists (select 1 from public.notifications where user_id = tpm and kind = 'message' and link = '/provider/messages/' || th and created_at = now() and workspace_id = tpw) then
    raise exception 'provider not alerted for a client reply'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tpm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  pmsg := public.provider_send_message(th, 'q52 provider reply');
  reset role;
  if not exists (select 1 from public.notifications where user_id = owner and kind = 'message' and link = '/account/events/' || ev || '/messages?thread=' || th and created_at = now()) then
    raise exception 'customer not alerted for a provider reply'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  update public.messages set body = 'tampered' where id = pmsg;
  delete from public.messages where id = pmsg;
  n := public.mark_thread_read(th);
  reset role;
  if not exists (select 1 from public.messages where id = pmsg and body = 'q52 provider reply' and read_at is not null) then raise exception 'provider message tampered, deleted or not marked read'; end if;
  if exists (select 1 from public.notifications where user_id = owner and kind = 'message' and link like '%/messages?thread=' || th and read_at is null) then raise exception 'thread alert not cleared'; end if;

  -- 6. Same-transaction duplicate guard (apply_cancellation + build_item_primary_failed both sending "Replacement needed").
  perform public.notify_event(ev, 'provider.request', 'Replacement needed: q52', 'x', '/q52');
  perform public.notify_event(ev, 'provider.request', 'Replacement needed: q52', 'x', '/q52');
  select count(*) into n from public.notifications where user_id = owner and title = 'Replacement needed: q52';
  if n <> 1 then raise exception 'duplicate notification in one transaction: %', n; end if;

  -- 7. Provider per-kind preferences.
  -- explicit workspace (users in several provider workspaces); a /provider link resolves it when they belong to exactly one
  begin
    update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'), '{notifications}', coalesce(settings -> 'notifications', '{}') || '{"enquiries":{"email":false,"in_app":false}}') where id = tpw;
    insert into public.notifications(user_id, kind, title, link, workspace_id) values (tpm, 'quote_request', 'q52 pref drop', '/provider/opportunities', tpw);
    if exists (select 1 from public.notifications where user_id = tpm and title = 'q52 pref drop') then raise exception 'provider enquiries off (both) not honoured'; end if;
    update public.workspaces set settings = jsonb_set(settings, '{notifications,enquiries}', '{"email":true,"in_app":false}') where id = tpw;
    insert into public.notifications(user_id, kind, title, link, workspace_id) values (tpm, 'quote_request', 'q52 pref mute', '/provider/opportunities', tpw);
    if not exists (select 1 from public.notifications where user_id = tpm and title = 'q52 pref mute' and muted and read_at is not null) then raise exception 'provider in-app off not honoured'; end if;
    update public.workspaces set settings = jsonb_set(settings, '{notifications,enquiries}', '{"email":false,"in_app":true}') where id = tpw;
    insert into public.notifications(user_id, kind, title, link, workspace_id) values (tpm, 'quote_request', 'q52 pref noemail', '/provider/opportunities', tpw);
    if exists (select 1 from public.email_outbox o join public.notifications x on x.id = o.notification_id where x.title = 'q52 pref noemail') then raise exception 'provider email off not honoured'; end if;
    insert into public.notifications(user_id, kind, title, link, workspace_id) values (tpm, 'payout_failed', 'q52 mandatory', '/provider/money', tpw);
    if not exists (select 1 from public.notifications where user_id = tpm and title = 'q52 mandatory' and not muted) then raise exception 'mandatory provider kind dropped'; end if;
  end;

  -- 8. Email categories.
  select * into cat from public.email_category('leave_request'); if cat.category <> 'event_updates' then raise exception 'leave_request -> %', cat.category; end if;
  select * into cat from public.email_category('trust_enforcement'); if cat.category <> 'security' or not cat.mandatory then raise exception 'trust_enforcement not mandatory'; end if;
  select * into cat from public.email_category('licence_expiring'); if cat.category <> 'reminders' then raise exception 'licence_expiring -> %', cat.category; end if;
  select * into cat from public.email_category('booking_confirmed'); if cat.category <> 'quotes' then raise exception 'booking_confirmed changed'; end if;
  select * into cat from public.email_category('payout_failed'); if cat.category <> 'payments' or not cat.mandatory then raise exception 'payout changed'; end if;
  select * into cat from public.email_category('message'); if cat.category <> 'messages' then raise exception 'message changed'; end if;

  raise exception 'EXERCISE_OK q52/q64 messaging + notifications';
end $$;
