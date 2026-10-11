-- Phase 3 · Provider team: crew profile details, audited create/update, status changes and availability requests.
begin;
alter table public.crew_members add column if not exists details jsonb not null default '{}';

-- details: { employment: employee|contract|part_time|external, hourly_rate, start_date, timezone, emergency_contact, certifications: [{name, expires}], languages: [] }
create or replace function public.provider_save_crew(p_ws uuid, p_crew uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; emp text;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if p_crew is not null and not exists(select 1 from public.crew_members where id = p_crew and workspace_id = p_ws) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if coalesce(p->>'email', '') <> '' and (p->>'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  emp := p->'details'->>'employment';
  if emp is not null and emp not in ('employee','contract','part_time','external') then raise exception 'invalid_employment' using errcode = '22023'; end if;
  if (p->'details'->>'hourly_rate')::numeric < 0 or (p->>'day_rate')::numeric < 0 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  if p_crew is null then
    insert into public.crew_members(workspace_id, name, role, member_type, email, phone, location, bio, skills, day_rate, status, avatar, details)
      values (p_ws, trim(p->>'name'), coalesce(p->>'role', ''), coalesce(p->>'member_type', 'crew'), coalesce(p->>'email', ''), coalesce(p->>'phone', ''), coalesce(p->>'location', ''),
        coalesce(p->>'bio', ''), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'skills') x), '{}'), (p->>'day_rate')::numeric, 'available', coalesce(p->>'avatar', ''), coalesce(p->'details', '{}'))
      returning id into cid;
  else
    update public.crew_members set name = coalesce(trim(p->>'name'), name), role = coalesce(p->>'role', role), email = coalesce(p->>'email', email), phone = coalesce(p->>'phone', phone),
      location = coalesce(p->>'location', location), bio = coalesce(p->>'bio', bio), skills = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'skills') x), skills),
      day_rate = case when p ? 'day_rate' then (p->>'day_rate')::numeric else day_rate end, avatar = coalesce(p->>'avatar', avatar), details = details || coalesce(p->'details', '{}')
    where id = p_crew returning id into cid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, case when p_crew is null then 'crew.created' else 'crew.updated' end, jsonb_build_object('crew_id', cid));
  return cid;
end $$;

-- Deactivating keeps history; members with upcoming confirmed shifts must be reassigned first.
create or replace function public.provider_set_crew_status(p_ws uuid, p_crew uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if p_status not in ('available','unavailable','deactivated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if not exists(select 1 from public.crew_members where id = p_crew and workspace_id = p_ws) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status = 'deactivated' and exists(select 1 from public.shifts where crew_id = p_crew and status in ('pending','confirmed') and starts_at > now()) then
    raise exception 'has_upcoming_shifts' using errcode = '22023';
  end if;
  update public.crew_members set status = p_status where id = p_crew;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'crew.' || p_status, jsonb_build_object('crew_id', p_crew));
end $$;

-- An availability request is a tracked task for the team member (and the manager), never an assumed answer.
create or replace function public.provider_request_availability(p_ws uuid, p_crew uuid, p_starts timestamptz, p_ends timestamptz, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.crew_members; tid uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into c from public.crew_members where id = p_crew and workspace_id = p_ws;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_ends <= p_starts then raise exception 'invalid_block' using errcode = '22023'; end if;
  insert into public.tasks(workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status)
    values (p_ws, auth.uid(), 'Availability request — ' || c.name, left(coalesce(p_note, ''), 400) || E'\ncrew:' || p_crew || E'\nfrom:' || p_starts || E'\nto:' || p_ends,
      'availability_request', c.name, p_starts - interval '2 days', 'medium', 'todo')
    returning id into tid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'crew.availability_requested', jsonb_build_object('crew_id', p_crew, 'task_id', tid));
  return tid;
end $$;

revoke all on function public.provider_save_crew(uuid, uuid, jsonb), public.provider_set_crew_status(uuid, uuid, text), public.provider_request_availability(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.provider_save_crew(uuid, uuid, jsonb), public.provider_set_crew_status(uuid, uuid, text), public.provider_request_availability(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
commit;
