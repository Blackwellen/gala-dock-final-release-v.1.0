-- Q18 fix — guest-originated audit/outbox rows use actor_type 'system' (the audit_events / domain_outbox CHECK has no 'guest';
-- the origin is kept in metadata). guest_rsvp and submit_registration otherwise identical to 202610294011.

create or replace function public.guest_rsvp(p_token_hash text, p_response text, p_plus_ones jsonb default '[]', p_note text default '', p_care jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guests; e public.events; allowed integer; x jsonb; n integer := 0; pid uuid;
begin
  if p_response not in ('confirmed','declined','pending') then raise exception 'invalid_response' using errcode = '22023'; end if;
  select * into g from public.guests where rsvp_token_hash = p_token_hash and plus_one_of is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into e from public.events where id = g.event_id;
  if e.status in ('cancelled','completed','closed','archived') then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if e.starts_at is not null and e.starts_at < now() then return jsonb_build_object('ok', false, 'error', 'rsvp_closed'); end if;
  allowed := case when g.plus_one then greatest(g.tickets - 1, 1) else 0 end;
  if jsonb_typeof(coalesce(p_plus_ones, '[]')) <> 'array' or jsonb_array_length(coalesce(p_plus_ones, '[]')) > allowed then return jsonb_build_object('ok', false, 'error', 'too_many_plus_ones', 'allowed', allowed); end if;
  update public.guests set status = p_response, rsvp_responded_at = now(), rsvp_note = left(coalesce(p_note, ''), 500) where id = g.id;
  -- Plus-ones are replaced as a set (re-answering never duplicates them).
  delete from public.guests where plus_one_of = g.id;
  if p_response = 'confirmed' then
    for x in select * from jsonb_array_elements(coalesce(p_plus_ones, '[]')) loop
      insert into public.guests(event_id, name, status, plus_one_of, group_id, household_id, is_child)
        values (g.event_id, left(coalesce(nullif(btrim(x->>'name'), ''), g.name || ' +1'), 120), 'confirmed', g.id, g.group_id, g.household_id, coalesce((x->>'child')::boolean, false))
        returning id into pid;
      n := n + 1;
    end loop;
    if p_care is not null and jsonb_typeof(p_care) = 'object' then
      insert into public.guest_care(guest_id, event_id, dietary, allergies, accessibility, consent_at)
        values (g.id, g.event_id, left(coalesce(p_care->>'dietary', ''), 300), left(coalesce(p_care->>'allergies', ''), 300), left(coalesce(p_care->>'accessibility', ''), 500), now())
        on conflict (guest_id) do update set dietary = excluded.dietary, allergies = excluded.allergies, accessibility = excluded.accessibility, consent_at = now();
    end if;
  end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', e.workspace_id, 'guest.rsvp', jsonb_build_object('guest_id', g.id, 'event_id', e.id, 'response', p_response, 'plus_ones', n, 'via', 'rsvp_link'));
  perform public.emit_domain_event('guest.rsvp', e.workspace_id, jsonb_build_object('guest_id', g.id, 'event_id', e.id, 'response', p_response, 'plus_ones', n), null, 'system', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'status', p_response, 'plus_ones', n, 'event', jsonb_build_object('name', e.name, 'starts_at', e.starts_at));
end $$;

create or replace function public.submit_registration(p_form uuid, p_name text, p_email text, p_answers jsonb, p_user uuid default null, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare fm public.registration_forms; e public.events; f jsonb; v jsonb; pub jsonb := '{}'; priv jsonb := '{}'; taken integer; mine integer; st text; rid uuid; prior public.registrations;
begin
  select * into fm from public.registration_forms where id = p_form;
  if not found or fm.status <> 'published' then return jsonb_build_object('ok', false, 'error', 'form_closed'); end if;
  select * into e from public.events where id = fm.event_id;
  if e.status in ('cancelled','completed','closed','archived','suspended') then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if (fm.opens_at is not null and now() < fm.opens_at) or (fm.closes_at is not null and now() > fm.closes_at) then return jsonb_build_object('ok', false, 'error', 'outside_window'); end if;
  if p_request_id is not null then
    select * into prior from public.registrations where form_id = fm.id and request_id = p_request_id;
    if found then return jsonb_build_object('ok', true, 'id', prior.id, 'status', prior.status, 'replayed', true); end if;
  end if;
  if coalesce(btrim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(btrim(coalesce(p_name, ''))) not between 1 and 120 then return jsonb_build_object('ok', false, 'error', 'invalid_contact'); end if;
  if jsonb_typeof(coalesce(p_answers, '{}')) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_answers'); end if;
  for f in select * from jsonb_array_elements(fm.fields) loop
    v := p_answers -> (f->>'key');
    if v is null or v = 'null'::jsonb or v = '""'::jsonb then
      if coalesce((f->>'required')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'required', 'field', f->>'key'); end if;
      continue;
    end if;
    if (f->>'type') in ('select') and not (f->'options' @> jsonb_build_array(v)) then return jsonb_build_object('ok', false, 'error', 'invalid_option', 'field', f->>'key'); end if;
    if (f->>'type') = 'multiselect' and (jsonb_typeof(v) <> 'array' or not (f->'options' @> v)) then return jsonb_build_object('ok', false, 'error', 'invalid_option', 'field', f->>'key'); end if;
    if (f->>'type') = 'number' and jsonb_typeof(v) <> 'number' then return jsonb_build_object('ok', false, 'error', 'invalid_number', 'field', f->>'key'); end if;
    if (f->>'type') = 'checkbox' and jsonb_typeof(v) <> 'boolean' then return jsonb_build_object('ok', false, 'error', 'invalid_checkbox', 'field', f->>'key'); end if;
    if (f->>'type') = 'email' and (v #>> '{}') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'invalid_email', 'field', f->>'key'); end if;
    if length(v::text) > coalesce(nullif(f->>'max', '')::int, 1000) + 2 then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', f->>'key'); end if;
    if coalesce((f->>'sensitive')::boolean, false) then priv := priv || jsonb_build_object(f->>'key', v); else pub := pub || jsonb_build_object(f->>'key', v); end if;
  end loop;
  perform public.advisory_xact_lock('registration', fm.event_id::text);
  select count(*) into mine from public.registrations r where r.event_id = fm.event_id and lower(r.email) = lower(btrim(p_email)) and r.status not in ('rejected','cancelled');
  if mine >= fm.per_email_limit then return jsonb_build_object('ok', false, 'error', 'limit_per_email', 'limit', fm.per_email_limit); end if;
  select count(*) into taken from public.registrations r where r.event_id = fm.event_id and r.status in ('submitted','pending_approval','approved');
  st := case when fm.capacity is not null and taken >= fm.capacity then case when fm.waitlist then 'waitlisted' else null end
             when fm.approval_required then 'pending_approval' else 'approved' end;
  if st is null then return jsonb_build_object('ok', false, 'error', 'full', 'capacity', fm.capacity); end if;
  insert into public.registrations(event_id, form_id, form_version, name, email, user_id, status, answers, request_id)
    values (fm.event_id, fm.id, fm.version, btrim(p_name), lower(btrim(p_email)), p_user, 'submitted', pub, p_request_id) returning id into rid;
  if priv <> '{}'::jsonb then insert into public.registration_private(registration_id, event_id, answers) values (rid, fm.event_id, priv); end if;
  if st <> 'submitted' then perform public.registration_set_status(rid, st, null, ''); end if;
  perform public.emit_domain_event('registration.submitted', e.workspace_id, jsonb_build_object('id', rid, 'event_id', e.id, 'status', st), p_user, case when p_user is null then 'system' else 'user' end, 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'id', rid, 'status', st);
end $$;
