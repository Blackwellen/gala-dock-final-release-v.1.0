-- Q24 fix-forward (lane C, 2026-10-29): deliverable_add_evidence let a party's portal login cite a file path inside the organiser's
-- workspace folder (found by tests/organizer/q24-sponsors-talent.spec.ts). Only event managers may reference the workspace folder;
-- portal users may reference only their own user folder. Same signature and grants; body otherwise unchanged.
create or replace function public.deliverable_add_evidence(p_deliverable uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d public.event_party_deliverables; uid uuid := (select auth.uid()); ws text; path text := nullif(p ->> 'storage_path', ''); eid bigint;
begin
  select * into d from public.event_party_deliverables where id = p_deliverable for update;
  if not found or not (public.can_manage_event(d.event_id) or (d.owed_by = 'party' and public.party_portal_user(d.party_id))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status in ('approved','waived') then raise exception 'deliverable_closed' using errcode = '22023'; end if;
  ws := d.workspace_id::text;
  -- Files must already live in the uploader's own Q04 folder: event managers may cite the workspace folder, a party's portal login only its own user folder.
  if path is not null and not ((public.can_manage_event(d.event_id) and path like ws || '/%') or path like uid::text || '/%') then raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  if nullif(p ->> 'media_asset_id', '') is not null and not exists (select 1 from public.media_assets m where m.id = (p ->> 'media_asset_id')::uuid and (m.workspace_id = d.workspace_id or m.event_id = d.event_id)) then
    raise exception 'media_not_in_event' using errcode = '42501'; end if;
  insert into public.event_deliverable_evidence(deliverable_id, event_id, kind, storage_path, media_asset_id, url, note, actor_id)
    values (d.id, d.event_id, coalesce(nullif(p ->> 'kind', ''), case when path is not null then 'file' when p ? 'url' then 'url' else 'note' end), path,
      nullif(p ->> 'media_asset_id', '')::uuid, nullif(p ->> 'url', ''), coalesce(p ->> 'note', ''), uid) returning id into eid;
  if d.status = 'pending' then perform public.transition_state('party_deliverable', d.id, 'in_progress', null, uid, 'user', 'evidence added', null); end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, d.workspace_id, 'event_party.deliverable_evidence', jsonb_build_object('event_id', d.event_id, 'deliverable_id', d.id, 'evidence_id', eid));
  return jsonb_build_object('evidence_id', eid);
end $$;
