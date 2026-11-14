-- Q59 exercise (rolled back): a held listing can't be published; an expired time-boxed restriction releases its hold and republishes;
-- verifying a document needs an expiry and (insurance) a cover amount and notifies the provider; unknown cover fails a minimum;
-- a provider can't set renewal/supersede bookkeeping on insert; a submitted business check can be verified by a trust admin.
-- Ends with EXERCISE_OK.
do $$
declare adm uuid; sid uuid := gen_random_uuid(); ws uuid; owner uuid; d public.provider_documents; nid uuid; lst uuid; pub uuid; pws uuid; a public.enforcement_actions;
  ok boolean; st text; chk uuid; cws uuid; n integer;
begin
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'trust' = any(p.permissions) order by (u.email = 'admin.demo@example.com') desc limit 1;
  if adm is null then raise exception 'exercise: no trust admin'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (sid, adm, now(), now());

  -- 1. Hold guard.
  select id into lst from public.listings where not published limit 1;
  insert into public.trust_listing_holds(listing_id, workspace_id, source, reason_code, detail, credential_key, was_published)
    select id, workspace_id, 'credential_lapse', 'document_expired', 'q59 exercise', 'public_liability', false from public.listings where id = lst;
  update public.listings set published = true where id = lst;
  if (select published from public.listings where id = lst) then raise exception 'held listing was published'; end if;
  update public.trust_listing_holds set released_at = now(), release_reason = 'q59' where listing_id = lst and released_at is null;
  update public.listings set published = true where id = lst;
  if not (select published from public.listings where id = lst) then raise exception 'released listing could not be published'; end if;

  -- 2. Time-boxed restriction expires -> hold released, listing republished.
  select id, workspace_id into pub, pws from public.listings where published and paused_at is null and id <> lst limit 1;
  insert into public.enforcement_actions(reference, workspace_id, subject_type, subject_id, action, reason_code, note, starts_at, ends_at, appealable)
    values ('EA-Q59X', pws, 'listing', pub, 'listing_hidden', 'other_policy', 'q59 exercise restriction', now() - interval '2 hours', now() + interval '1 hour', false) returning * into a;
  perform public.trust_apply_effect(a, true);
  if (select published from public.listings where id = pub) then raise exception 'restriction did not unpublish'; end if;
  update public.enforcement_actions set ends_at = now() - interval '1 minute' where id = a.id;
  perform public.job_trust_expiry_daily(null::public.job_queue);
  if (select status from public.enforcement_actions where id = a.id) <> 'expired' then raise exception 'restriction not expired'; end if;
  if public.trust_listing_held(pub) then raise exception 'expired restriction left the hold'; end if;
  if not (select published from public.listings where id = pub) then raise exception 'expired restriction left the listing unpublished'; end if;

  -- 3. Document review rules + notification.
  select x.* into d from public.provider_documents x where x.credential_key = 'public_liability' and x.status = 'verified'
    and public.file_access_decision('workspace-files', x.file_path) = 'ok' limit 1;
  if d.id is null then raise exception 'exercise: no clean verified public liability document'; end if;
  ws := d.workspace_id; select owner_id into owner from public.workspaces where id = ws;
  insert into public.provider_documents(workspace_id, credential_key, file_path, file_name, status) values (ws, 'public_liability', d.file_path, 'q59.pdf', 'submitted') returning id into nid;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  begin perform public.trust_review_document(nid, 'verified', null, null, null, null); ok := false; exception when others then ok := sqlerrm = 'expiry_required'; end;
  if not ok then raise exception 'verify without expiry allowed'; end if;
  begin perform public.trust_review_document(nid, 'verified', null, null, current_date + 300, null); ok := false; exception when others then ok := sqlerrm = 'cover_required'; end;
  if not ok then raise exception 'insurance verify without cover allowed'; end if;
  perform public.trust_review_document(nid, 'verified', null, null, current_date + 300, 500000000);
  reset role;
  if (select status from public.provider_documents where id = nid) <> 'verified' then raise exception 'document not verified'; end if;
  if (select status from public.provider_documents where id = d.id) <> 'superseded' then raise exception 'old document not superseded'; end if;
  if not exists (select 1 from public.notifications where kind = 'trust_document_reviewed' and dedupe_key like 'trust.reviewed:' || nid || ':verified:%') then raise exception 'provider not notified'; end if;

  -- 4. Unknown cover never meets a minimum.
  update public.provider_documents set cover_amount_minor = null where id = nid;
  select e.status into st from public.trust_credential_eval(ws, 'public_liability', 100000000) e;
  if st <> 'insufficient_cover' then raise exception 'unknown cover treated as %', st; end if;

  -- 5. Provider insert can't forge bookkeeping.
  if owner is not null and exists (select 1 from public.verified_private_uploads v where v.owner_id = owner) then
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    begin
      insert into public.provider_documents(workspace_id, credential_key, file_path, file_name, uploaded_by, renewal_of)
        select ws, 'fire_safety', v.path, 'q59b.pdf', owner, d.id from public.verified_private_uploads v where v.owner_id = owner limit 1;
      ok := false;
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'provider could set renewal_of'; end if;
    insert into public.provider_documents(workspace_id, credential_key, file_path, file_name, uploaded_by)
      select ws, 'fire_safety', v.path, 'q59b.pdf', owner from public.verified_private_uploads v where v.owner_id = owner limit 1 returning id into nid;
    reset role;
    if (select status <> 'submitted' or last_reminder_days is not null from public.provider_documents where id = nid) then raise exception 'provider document not submitted cleanly'; end if;
  end if;

  -- 6. Submitted business check -> verified by a trust admin.
  select w.id into cws from public.workspaces w where w.kind = 'provider'
    and not exists (select 1 from public.verification_checks c where c.workspace_id = w.id and c.kind = 'business') limit 1;
  insert into public.verification_checks(workspace_id, subject_type, kind, status) values (cws, 'workspace', 'business', 'unverified') returning id into chk;
  perform public.verification_step(chk, 'submitted', null, 'user', null, null);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  perform public.trust_review_verification(chk, 'verified', null, 'Companies House record matches', now() + interval '365 days');
  reset role;
  if (select status from public.verification_checks where id = chk) <> 'verified' then raise exception 'submitted check could not be verified'; end if;
  if (select verification_status from public.workspaces where id = cws) <> 'verified' then raise exception 'workspace status not refreshed'; end if;

  raise exception 'EXERCISE_OK trust bughunt';
end $$;
