-- Q62 exercise (rolled back): provider reply once + edit (reviewer notified once), replies refused on unpublished reviews and
-- for non-managers, trust admin hides a reply (text leaves the row, new replies refused) and allows it again; a new review notifies
-- the provider; public_organizer returns safe fields only; anon can call listing_trust. Ends with EXERCISE_OK.
do $$
declare r public.reviews; ws uuid; owner uuid; adm uuid; sid uuid := gen_random_uuid(); n integer; ok boolean; org uuid; o record; t jsonb;
begin
  select x.* into r from public.reviews x join public.listings l on l.id = x.listing_id join public.workspaces w on w.id = l.workspace_id
    where x.status = 'published' and x.user_id is not null and w.kind = 'provider' and x.provider_response is null limit 1;
  if r.id is null then raise exception 'exercise: no published review'; end if;
  ws := public.listing_workspace(r.listing_id); select owner_id into owner from public.workspaces where id = ws;

  -- 1. owner replies, then edits; one notification to the reviewer
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.respond_to_review(r.id, '  Thank you for the kind words!  ');
  perform public.respond_to_review(r.id, 'Thank you — see you again soon.');
  perform public.respond_to_review(r.id, 'Thank you — see you again soon.');   -- unchanged: no-op
  begin perform public.respond_to_review(r.id, repeat('x', 2001)); raise exception 'long reply accepted'; exception when others then if sqlerrm <> 'reply_too_long' then raise; end if; end;
  begin perform public.respond_to_review(r.id, ' '); raise exception 'empty reply accepted'; exception when others then if sqlerrm <> 'empty' then raise; end if; end;
  reset role;
  select * into r from public.reviews where id = r.id;
  if r.provider_response <> 'Thank you — see you again soon.' or r.response_status <> 'published' or r.responded_at is null or r.response_updated_at is null then raise exception 'reply not stored: %', row_to_json(r); end if;
  select count(*) into n from public.notifications where dedupe_key = 'review_reply:' || r.id;
  if n <> 1 then raise exception 'reviewer notifications: %', n; end if;
  select count(*) into n from public.audit_events where metadata->>'review_id' = r.id::text and event in ('review.responded','review.response_edited');
  if n <> 2 then raise exception 'audit rows: %', n; end if;

  -- 2. a stranger can't reply
  perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.respond_to_review(r.id, 'not mine'); raise exception 'reviewer replied as provider'; exception when others then if sqlerrm <> 'not_authorized' then raise; end if; end;
  reset role;

  -- 3. trust admin hides the reply, then allows a new one
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'trust' = any(p.permissions) limit 1;
  if adm is null then raise exception 'exercise: no trust admin'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (sid, adm, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  perform public.moderate_review_response(r.id, true, 'Contains personal data');
  reset role;
  select * into r from public.reviews where id = r.id;
  if r.provider_response is not null or r.response_status <> 'hidden' then raise exception 'hide failed'; end if;
  if not exists (select 1 from public.audit_events where event = 'review.response_hidden' and metadata->>'hidden_text' = 'Thank you — see you again soon.') then raise exception 'hidden text not kept for admins'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.respond_to_review(r.id, 'again'); raise exception 'reply after hide accepted'; exception when others then if sqlerrm <> 'reply_hidden' then raise; end if; end;
  begin perform public.moderate_review_response(r.id, false, 'owner trying'); raise exception 'owner moderated'; exception when others then if sqlerrm <> 'not_authorized' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  perform public.moderate_review_response(r.id, false, 'Appeal accepted');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  perform public.respond_to_review(r.id, 'A new reply after the appeal.');
  reset role;

  -- 4. unpublished review: refused
  update public.reviews set status = 'pending' where id = r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.respond_to_review(r.id, 'pending one'); raise exception 'reply to pending review'; exception when others then if sqlerrm <> 'review_not_published' then raise; end if; end;
  reset role;

  -- 5. new review notifies the provider owner/managers
  select count(*) into n from public.notifications where kind = 'review_new' and workspace_id = ws;
  insert into public.reviews(user_id, listing_id, rating, body, status) values (r.user_id, r.listing_id, 4, 'Exercise review body text long enough.', 'published');
  if (select count(*) from public.notifications where kind = 'review_new' and workspace_id = ws) <= n then raise exception 'no provider notification for a new review'; end if;

  -- 6. anon: public_organizer and listing_trust
  select e.workspace_id into org from public.events e where e.visibility = 'public' and e.status in ('published','on_sale','live') and e.workspace_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select * into o from public.public_organizer_profile(org);
  if o.id is null then raise exception 'public_organizer returned nothing'; end if;
  select public.listing_trust(r.listing_id) into t;
  if t ? 'blockers' or not (t ? 'badge') then raise exception 'listing_trust anon payload: %', t; end if;
  reset role;

  raise exception 'EXERCISE_OK profile bughunt';
end $$;
