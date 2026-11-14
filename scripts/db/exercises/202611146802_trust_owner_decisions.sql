-- Q59 owner decisions exercise (rolled back): suspension pauses payouts and lifting resumes them (provider told); identity is derived from
-- verification_checks; licence documents must come through the upload pipeline; erasure FKs are SET NULL; evidence files are locked.
-- Ends with EXERCISE_OK.
do $$
declare ws uuid; a public.enforcement_actions; owner uuid; ev public.events; ok boolean; n integer; d public.provider_documents; lic uuid; up text;
begin
  -- 1. Suspension pauses payouts; lifting resumes.
  select c.workspace_id into ws from public.connect_accounts c where not public.dec107_payouts_paused(c.workspace_id) limit 1;
  if ws is null then raise exception 'exercise: no unpaused connected workspace'; end if;
  insert into public.enforcement_actions(reference, workspace_id, subject_type, subject_id, action, reason_code, note, appealable)
    values ('EA-Q59S', ws, 'workspace', ws, 'workspace_suspended', 'other_policy', 'q59 exercise suspension', true) returning * into a;
  perform public.trust_apply_effect(a, true);
  if not public.dec107_payouts_paused(ws) then raise exception 'suspended workspace not paused'; end if;
  if public.payout_eligible(ws) then raise exception 'suspended workspace payout eligible'; end if;
  if not exists (select 1 from public.notifications where kind = 'payout_paused' and dedupe_key like 'trust.payouts:' || a.id || ':held:%') then raise exception 'provider not told payouts held'; end if;
  update public.enforcement_actions set status = 'lifted', lifted_at = now() where id = a.id returning * into a;
  perform public.trust_apply_effect(a, false);
  if public.dec107_payouts_paused(ws) then raise exception 'lifted suspension still pauses payouts'; end if;

  -- 4. Identity derived from checks.
  select w.owner_id into owner from public.workspaces w join public.verification_checks c on c.workspace_id = w.id
    where c.status = 'verified' and (c.expires_at is null or c.expires_at > now()) and w.owner_id is not null limit 1;
  if not public.user_identity_verified(owner) then raise exception 'verified workspace owner not identity verified'; end if;
  select count(*) into n from public.profiles p where p.identity_verified and not public.user_identity_verified(p.id);
  raise notice 'seeded identity_verified no longer shown: %', n;

  -- 5. Licence document must be a pipeline upload.
  select e.* into ev from public.events e join public.event_licences l on l.event_id = e.id where e.workspace_id is not null limit 1;
  select l.id into lic from public.event_licences l where l.event_id = ev.id limit 1;
  select w.owner_id into owner from public.workspaces w where w.id = ev.workspace_id;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin perform public.licence_save(ev.id, jsonb_build_object('document_path', owner || '/00000000-0000-4000-8000-000000000000.pdf'), lic); ok := false;
  exception when others then ok := sqlerrm = 'upload_not_verified'; end;
  reset role;
  if not ok then raise exception 'unverified licence document accepted'; end if;
  select v.path into up from public.verified_private_uploads v where v.owner_id = owner limit 1;
  if up is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    perform public.licence_save(ev.id, jsonb_build_object('document_path', up), lic);
    reset role;
    if (select document_path from public.event_licences where id = lic) is distinct from up then raise exception 'licence document not saved'; end if;
    if not public.storage_object_locked('workspace-files', up) then raise exception 'licence document not locked'; end if;
  end if;

  -- 7. Erasure FKs.
  select count(*) into n from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype <> 'n'
    and ((conrelid = 'public.provider_documents'::regclass) or (conrelid = 'public.verification_records'::regclass));
  if n <> 0 then raise exception 'erasure-blocking FKs remain: %', n; end if;
  if (select count(*) from public.data_retention_rules where key in ('provider_documents.retain','verification_checks.retain','verification_records.retain') and not enabled and legal_review_required) <> 3 then
    raise exception 'draft retention rules missing'; end if;

  -- 8. Evidence lock.
  select x.* into d from public.provider_documents x where x.status = 'verified' limit 1;
  if not public.storage_object_locked('workspace-files', d.file_path) then raise exception 'verified evidence not locked'; end if;
  if public.storage_object_locked('workspace-files', gen_random_uuid() || '/' || gen_random_uuid() || '.pdf') then raise exception 'random file locked'; end if;

  raise exception 'EXERCISE_OK trust owner decisions';
end $$;
