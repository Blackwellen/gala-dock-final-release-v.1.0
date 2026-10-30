-- Fix for 202610291026: the buyer-read policy on provider_job_evidence looked the job up through provider_jobs, which the
-- buyer cannot read under RLS, so the buyer saw nothing. Evidence now carries the booking's event_id (snapshotted by the RPC).
alter table public.provider_job_evidence add column if not exists event_id uuid references public.events(id) on delete set null;
update public.provider_job_evidence v set event_id = j.event_id from public.provider_jobs j where j.id = v.job_id and v.event_id is null;
drop policy if exists provider_job_evidence_read on public.provider_job_evidence;
create policy provider_job_evidence_read on public.provider_job_evidence for select to authenticated
  using (public.is_workspace_member(workspace_id) or (event_id is not null and public.can_access_event(event_id)));

create or replace function public.provider_add_job_evidence(p_job uuid, p_kind text, p_note text default '', p_path text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare j public.provider_jobs; eid uuid;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager','member']);
  if p_path is not null and split_part(p_path, '/', 1) <> j.workspace_id::text and split_part(p_path, '/', 2) <> j.workspace_id::text then
    raise exception 'path_not_in_workspace' using errcode = '42501';
  end if;
  insert into public.provider_job_evidence(workspace_id, job_id, event_id, kind, note, storage_path, created_by)
    values (j.workspace_id, j.id, j.event_id, p_kind, left(coalesce(p_note, ''), 2000), p_path, auth.uid()) returning id into eid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), j.workspace_id, 'job.evidence_added', jsonb_build_object('job_id', j.id, 'kind', p_kind));
  return eid;
end $$;
revoke all on function public.provider_add_job_evidence(uuid,text,text,text) from public, anon;
grant execute on function public.provider_add_job_evidence(uuid,text,text,text) to authenticated, service_role;
