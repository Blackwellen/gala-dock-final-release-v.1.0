-- Q40 part 3 (lane A, 2026-10-29): Forms (251) and Waivers (252). Additive, backward compatible.
-- Guest registration stays Q18 (registration_forms / registrations). New:
--   * event_forms: versioned forms per event for guests (post-registration), providers, clients, staff, consent and custom
--     audiences; one published version per family; published versions are immutable. form_responses validated against the
--     version's fields (required, type, options, max length); respondents see their own; the event owner/managers see all;
--     a provider sees only responses tied to its own booking.
--   * waiver_templates: workspace templates with immutable published versions, one active per family (machine
--     waiver_template); duplicate/restore = a new version; compare = waiver_template_compare.
--   * event_waivers (which version applies to which tiers) and waiver_signatures: version + body hash snapshot, signer,
--     minor consent (guardian name, relationship and attestation required; template must allow minors), private storage
--     (signer + owner/manager only), revocation. waiver_status(event) for readiness/door; no AI.

-- ═══ 1. Forms ═══
create table if not exists public.event_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1,
  audience text not null check (audience in ('guest','provider','client','staff','custom')),
  kind text not null default 'form' check (kind in ('form','consent')),
  title text not null check (length(btrim(title)) between 2 and 140),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 80),
  status text not null default 'draft' check (status in ('draft','published','retired')),
  published_at timestamptz, created_by uuid, created_at timestamptz not null default now(),
  unique (family_id, version)
);
create unique index if not exists event_forms_one_published on public.event_forms(family_id) where status = 'published';
create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.event_forms(id) on delete restrict,
  form_version integer not null,
  event_id uuid not null references public.events(id) on delete cascade,
  respondent_kind text not null check (respondent_kind in ('guest','provider','client','staff','public')),
  user_id uuid references auth.users(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  answers jsonb not null,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected','withdrawn')),
  request_id text, created_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid
);
create unique index if not exists form_responses_request on public.form_responses(form_id, request_id) where request_id is not null;
create index if not exists form_responses_event on public.form_responses(event_id, form_id);

create or replace function public.event_forms_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.fields is distinct from old.fields or new.title is distinct from old.title or new.audience is distinct from old.audience or new.version <> old.version then
      raise exception 'form_version_immutable' using errcode = '22023';
    end if;
    if not (old.status = 'published' and new.status = 'retired') and new.status <> old.status then raise exception 'illegal_form_transition' using errcode = '22023'; end if;
  end if;
  for f in select * from jsonb_array_elements(new.fields) loop
    if coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$' or coalesce(f->>'type', '') not in ('text','textarea','number','email','phone','date','select','multiselect','checkbox','consent','signature') then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end loop;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists event_forms_guard on public.event_forms;
create trigger event_forms_guard before insert or update on public.event_forms for each row execute function public.event_forms_guard();

create or replace function public.save_event_form(p_event uuid, p_family uuid, p_form jsonb, p_publish boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare f public.event_forms; nv int;
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_family is not null then
    select * into f from public.event_forms where family_id = p_family and event_id = p_event and status = 'draft' order by version desc limit 1 for update;
  end if;
  if f.id is not null then
    update public.event_forms set title = coalesce(btrim(p_form->>'title'), title), fields = coalesce(p_form->'fields', fields), audience = coalesce(p_form->>'audience', audience), kind = coalesce(p_form->>'kind', kind)
     where id = f.id returning * into f;
  else
    select coalesce(max(version), 0) + 1 into nv from public.event_forms where family_id = p_family;
    insert into public.event_forms(event_id, family_id, version, audience, kind, title, fields, created_by)
      values (p_event, coalesce(p_family, gen_random_uuid()), coalesce(nv, 1), coalesce(p_form->>'audience', 'custom'), coalesce(p_form->>'kind', 'form'), btrim(p_form->>'title'),
        coalesce(p_form->'fields', '[]'), (select auth.uid())) returning * into f;
  end if;
  if p_publish then
    update public.event_forms set status = 'retired' where family_id = f.family_id and status = 'published';
    update public.event_forms set status = 'published' where id = f.id returning * into f;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = p_event), 'form.saved',
    jsonb_build_object('event_id', p_event, 'form_id', f.id, 'version', f.version, 'published', p_publish));
  return jsonb_build_object('ok', true, 'id', f.id, 'family_id', f.family_id, 'version', f.version, 'status', f.status);
end $$;

-- Validates answers against the published version's fields. Returns the cleaned answers (unknown keys dropped).
create or replace function public.form_validate(p_fields jsonb, p_answers jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare f jsonb; k text; v jsonb; out jsonb := '{}';
begin
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'key'; v := p_answers->k;
    if v is null or v = 'null'::jsonb or v = '""'::jsonb then
      if coalesce((f->>'required')::boolean, false) or f->>'type' = 'consent' and coalesce((f->>'required')::boolean, true) then raise exception 'field_required: %', k using errcode = '22023'; end if;
      continue;
    end if;
    case f->>'type'
      when 'number' then if jsonb_typeof(v) <> 'number' then raise exception 'field_invalid: %', k using errcode = '22023'; end if;
      when 'email' then if (v #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'field_invalid: %', k using errcode = '22023'; end if;
      when 'date' then perform (v #>> '{}')::date;
      when 'checkbox', 'consent' then if jsonb_typeof(v) <> 'boolean' or (f->>'type' = 'consent' and v <> 'true'::jsonb and coalesce((f->>'required')::boolean, true)) then raise exception 'field_invalid: %', k using errcode = '22023'; end if;
      when 'select' then if not ((f->'options') ? (v #>> '{}')) then raise exception 'field_invalid: %', k using errcode = '22023'; end if;
      when 'multiselect' then if jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements_text(v) o where not ((f->'options') ? o)) then raise exception 'field_invalid: %', k using errcode = '22023'; end if;
      else if length(v #>> '{}') > coalesce((f->>'max_length')::int, 2000) then raise exception 'field_too_long: %', k using errcode = '22023'; end if;
    end case;
    out := out || jsonb_build_object(k, v);
  end loop;
  return out;
end $$;

create or replace function public.submit_form_response(p_form uuid, p_answers jsonb, p_build_item uuid default null, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare f public.event_forms; uid uuid := (select auth.uid()); kind text; ans jsonb; v uuid; e public.events;
begin
  select * into f from public.event_forms where id = p_form;
  if not found or f.status <> 'published' then raise exception 'form_not_open' using errcode = '22023'; end if;
  select * into e from public.events where id = f.event_id;
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_request_id is not null then
    select id into v from public.form_responses where form_id = f.id and request_id = p_request_id;
    if v is not null then return jsonb_build_object('ok', true, 'id', v, 'replayed', true); end if;
  end if;
  kind := case f.audience
    when 'provider' then case when p_build_item is not null and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = p_build_item and b.event_id = f.event_id and public.is_workspace_member(l.workspace_id)) then 'provider' end
    when 'staff' then case when e.workspace_id is not null and public.is_workspace_member(e.workspace_id) then 'staff' end
    when 'guest' then case when public.holds_ticket_for(f.event_id) or exists (select 1 from public.registrations r where r.event_id = f.event_id and r.user_id = uid and r.status = 'approved') then 'guest' end
    when 'client' then case when e.owner_id = uid then 'client' end
    else case when public.can_access_event(f.event_id) or public.holds_ticket_for(f.event_id) then 'public' end end;
  if kind is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.hit_rate_limit('form:' || uid, 60, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  ans := public.form_validate(f.fields, coalesce(p_answers, '{}'));
  insert into public.form_responses(form_id, form_version, event_id, respondent_kind, user_id, build_item_id, answers, request_id)
    values (f.id, f.version, f.event_id, kind, uid, case when kind = 'provider' then p_build_item end, ans, p_request_id) returning id into v;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'form.response_submitted', jsonb_build_object('form_id', f.id, 'event_id', f.event_id, 'kind', kind));
  return jsonb_build_object('ok', true, 'id', v);
end $$;

create or replace function public.decide_form_response(p_response uuid, p_decision text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.form_responses;
begin
  select * into r from public.form_responses where id = p_response for update;
  if not found or not public.event_dependency_can_write(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_decision not in ('accepted','rejected') or r.status <> 'submitted' then raise exception 'invalid_decision' using errcode = '22023'; end if;
  update public.form_responses set status = p_decision, decided_at = now(), decided_by = (select auth.uid()) where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 2. Waivers ═══
create table if not exists public.waiver_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1,
  title text not null check (length(btrim(title)) between 2 and 140),
  body text not null check (length(body) between 20 and 40000),
  body_sha256 text,
  minors_allowed boolean not null default false,
  adult_age integer not null default 18 check (adult_age between 16 and 21),
  status text not null default 'draft' check (status in ('draft','published','retired')),
  based_on_version integer,
  published_at timestamptz, created_by uuid, created_at timestamptz not null default now(),
  unique (family_id, version)
);
create unique index if not exists waiver_templates_active on public.waiver_templates(family_id) where status = 'published';
create table if not exists public.event_waivers (
  event_id uuid not null references public.events(id) on delete cascade,
  waiver_template_id uuid not null references public.waiver_templates(id) on delete restrict,
  tier_ids uuid[],
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  primary key (event_id, waiver_template_id)
);
create table if not exists public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  waiver_template_id uuid not null references public.waiver_templates(id) on delete restrict,
  template_version integer not null, body_sha256 text not null,
  signer_name text not null check (length(btrim(signer_name)) between 2 and 120),
  signer_email text check (signer_email is null or signer_email = lower(signer_email)),
  user_id uuid references auth.users(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  is_minor boolean not null default false,
  guardian_name text, guardian_relationship text, guardian_attested boolean not null default false,
  signature_text text not null check (length(btrim(signature_text)) between 2 and 120),
  ip_hash text, signed_at timestamptz not null default now(),
  status text not null default 'valid' check (status in ('valid','revoked')),
  revoked_at timestamptz, revoked_reason text,
  check (not is_minor or (guardian_name is not null and guardian_relationship is not null and guardian_attested))
);
create unique index if not exists waiver_signatures_ticket on public.waiver_signatures(waiver_template_id, ticket_id) where ticket_id is not null and status = 'valid';
create unique index if not exists waiver_signatures_guest on public.waiver_signatures(waiver_template_id, guest_id) where guest_id is not null and status = 'valid';
create index if not exists waiver_signatures_event on public.waiver_signatures(event_id, status);

delete from public.state_transitions where machine = 'waiver_template';
delete from public.state_machines where machine = 'waiver_template';
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values
  ('waiver_template', 'waiver_templates', 'status', 'enforce', array['draft']::text[], array['retired']::text[]);
insert into public.state_transitions(machine, from_state, to_state) values
  ('waiver_template','draft','published'),('waiver_template','draft','retired'),('waiver_template','published','retired');
drop trigger if exists waiver_templates_state_guard on public.waiver_templates;
create trigger waiver_templates_state_guard before insert or update of status on public.waiver_templates for each row execute function public.enforce_state_transition('waiver_template', 'status');

create or replace function public.waiver_templates_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and (new.body is distinct from old.body or new.title is distinct from old.title or new.minors_allowed is distinct from old.minors_allowed
     or new.adult_age is distinct from old.adult_age or new.version <> old.version) then raise exception 'waiver_version_immutable' using errcode = '22023'; end if;
  new.body_sha256 := encode(extensions.digest(new.body, 'sha256'), 'hex');
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists waiver_templates_immutable on public.waiver_templates;
create trigger waiver_templates_immutable before insert or update on public.waiver_templates for each row execute function public.waiver_templates_immutable();

-- Save a draft (new family, or the family's open draft); p_from_version duplicates/restores an older version's text.
create or replace function public.save_waiver_template(p_workspace uuid, p_family uuid, p_waiver jsonb, p_from_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.waiver_templates; src public.waiver_templates; nv int;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_family is not null and p_from_version is not null then
    select * into src from public.waiver_templates where family_id = p_family and version = p_from_version and workspace_id = p_workspace;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if p_family is not null then select * into w from public.waiver_templates where family_id = p_family and workspace_id = p_workspace and status = 'draft' for update; end if;
  if w.id is not null then
    update public.waiver_templates set title = coalesce(btrim(p_waiver->>'title'), src.title, title), body = coalesce(p_waiver->>'body', src.body, body),
      minors_allowed = coalesce((p_waiver->>'minors_allowed')::boolean, src.minors_allowed, minors_allowed), adult_age = coalesce((p_waiver->>'adult_age')::int, src.adult_age, adult_age),
      based_on_version = coalesce(p_from_version, based_on_version) where id = w.id returning * into w;
  else
    select coalesce(max(version), 0) + 1 into nv from public.waiver_templates where family_id = p_family;
    insert into public.waiver_templates(workspace_id, family_id, version, title, body, minors_allowed, adult_age, based_on_version, created_by)
      values (p_workspace, coalesce(p_family, gen_random_uuid()), coalesce(nv, 1), coalesce(btrim(p_waiver->>'title'), src.title), coalesce(p_waiver->>'body', src.body),
        coalesce((p_waiver->>'minors_allowed')::boolean, src.minors_allowed, false), coalesce((p_waiver->>'adult_age')::int, src.adult_age, 18), p_from_version, (select auth.uid()))
      returning * into w;
  end if;
  return jsonb_build_object('ok', true, 'id', w.id, 'family_id', w.family_id, 'version', w.version);
end $$;

create or replace function public.publish_waiver_template(p_template uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.waiver_templates;
begin
  select * into w from public.waiver_templates where id = p_template for update;
  if not found or not public.has_workspace_role(w.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.waiver_templates set status = 'retired' where family_id = w.family_id and status = 'published';
  update public.waiver_templates set status = 'published' where id = w.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), w.workspace_id, 'waiver.published', jsonb_build_object('template_id', w.id, 'version', w.version));
  return jsonb_build_object('ok', true, 'version', w.version);
end $$;

create or replace function public.waiver_template_compare(p_a uuid, p_b uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.waiver_templates; b public.waiver_templates;
begin
  select * into a from public.waiver_templates where id = p_a; select * into b from public.waiver_templates where id = p_b;
  if a.id is null or b.id is null or a.family_id <> b.family_id or not public.is_workspace_member(a.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('a', a.version, 'b', b.version, 'title_changed', a.title is distinct from b.title, 'body_changed', a.body_sha256 is distinct from b.body_sha256,
    'minors_changed', a.minors_allowed is distinct from b.minors_allowed, 'adult_age_changed', a.adult_age is distinct from b.adult_age,
    'a_lines', array_length(string_to_array(a.body, E'\n'), 1), 'b_lines', array_length(string_to_array(b.body, E'\n'), 1));
end $$;

create or replace function public.set_event_waiver(p_event uuid, p_template uuid, p_tier_ids uuid[] default null, p_active boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.waiver_templates; e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into w from public.waiver_templates where id = p_template;
  if not found or w.workspace_id is distinct from e.workspace_id or w.status <> 'published' then raise exception 'waiver_not_published' using errcode = '22023'; end if;
  if p_tier_ids is not null and exists (select 1 from unnest(p_tier_ids) t where not exists (select 1 from public.ticket_tiers x where x.id = t and x.event_id = p_event)) then raise exception 'tier_not_in_event' using errcode = '22023'; end if;
  insert into public.event_waivers(event_id, waiver_template_id, tier_ids, status) values (p_event, p_template, p_tier_ids, case when p_active then 'active' else 'inactive' end)
    on conflict (event_id, waiver_template_id) do update set tier_ids = excluded.tier_ids, status = excluded.status;
  return jsonb_build_object('ok', true);
end $$;

-- Signing (signed-in ticket holder / guest user; token flows use the service path with p_user = null).
create or replace function public.sign_waiver(p_event uuid, p_template uuid, p_sign jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.waiver_templates; uid uuid := (select auth.uid()); tk public.tickets; v uuid; minor boolean := coalesce((p_sign->>'is_minor')::boolean, false);
begin
  if not exists (select 1 from public.event_waivers x where x.event_id = p_event and x.waiver_template_id = p_template and x.status = 'active') then raise exception 'waiver_not_required' using errcode = '22023'; end if;
  select * into w from public.waiver_templates where id = p_template;
  if w.status <> 'published' then raise exception 'waiver_version_retired' using errcode = '22023'; end if;
  if nullif(p_sign->>'ticket_id', '') is not null then
    select * into tk from public.tickets where id = (p_sign->>'ticket_id')::uuid and event_id = p_event;
    if not found or tk.status not in ('valid','used') then raise exception 'ticket_not_valid' using errcode = '22023'; end if;
    if uid is not null and tk.holder_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
    select id into v from public.waiver_signatures where waiver_template_id = p_template and ticket_id = tk.id and status = 'valid';
    if v is not null then return jsonb_build_object('ok', true, 'id', v, 'replayed', true); end if;
  elsif uid is null then raise exception 'signer_required' using errcode = '22023';
  elsif not (public.holds_ticket_for(p_event) or public.can_access_event(p_event) or exists (select 1 from public.registrations r where r.event_id = p_event and r.user_id = uid and r.status = 'approved')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if minor then
    if not w.minors_allowed then raise exception 'minors_not_allowed' using errcode = '22023'; end if;
    if nullif(btrim(coalesce(p_sign->>'guardian_name', '')), '') is null or nullif(btrim(coalesce(p_sign->>'guardian_relationship', '')), '') is null or coalesce((p_sign->>'guardian_attested')::boolean, false) is not true then
      raise exception 'guardian_consent_required' using errcode = '22023';
    end if;
  end if;
  insert into public.waiver_signatures(event_id, waiver_template_id, template_version, body_sha256, signer_name, signer_email, user_id, ticket_id, guest_id, is_minor,
      guardian_name, guardian_relationship, guardian_attested, signature_text, ip_hash)
    values (p_event, w.id, w.version, w.body_sha256, btrim(p_sign->>'signer_name'), lower(nullif(p_sign->>'signer_email', '')), uid, tk.id, nullif(p_sign->>'guest_id', '')::uuid, minor,
      p_sign->>'guardian_name', p_sign->>'guardian_relationship', coalesce((p_sign->>'guardian_attested')::boolean, false), btrim(p_sign->>'signature_text'), p_sign->>'ip_hash')
    returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, case when uid is null then 'system' else 'user' end, w.workspace_id, 'waiver.signed',
    jsonb_build_object('event_id', p_event, 'template_id', w.id, 'version', w.version, 'minor', minor));
  return jsonb_build_object('ok', true, 'id', v, 'version', w.version);
end $$;

create or replace function public.revoke_waiver_signature(p_signature uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.waiver_signatures; e public.events;
begin
  select * into s from public.waiver_signatures where id = p_signature for update;
  select * into e from public.events where id = s.event_id;
  if s.id is null or not (s.user_id = (select auth.uid()) or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager']))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.waiver_signatures set status = 'revoked', revoked_at = now(), revoked_reason = left(p_reason, 300) where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Door / readiness view: counts only (no names) for anyone who can access the event.
create or replace function public.waiver_status(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('template_id', w.id, 'title', w.title, 'version', w.version, 'status', x.status,
      'required_tickets', (select count(*) from public.tickets t where t.event_id = p_event and t.status in ('valid','used') and (x.tier_ids is null or t.tier_id = any(x.tier_ids))),
      'signed_tickets', (select count(*) from public.waiver_signatures s join public.tickets t on t.id = s.ticket_id where s.waiver_template_id = w.id and s.status = 'valid' and t.status in ('valid','used')
                           and (x.tier_ids is null or t.tier_id = any(x.tier_ids))),
      'minor_signatures', (select count(*) from public.waiver_signatures s where s.waiver_template_id = w.id and s.event_id = p_event and s.status = 'valid' and s.is_minor)))
    from public.event_waivers x join public.waiver_templates w on w.id = x.waiver_template_id where x.event_id = p_event), '[]'::jsonb);
end $$;

-- ═══ RLS ═══
alter table public.event_forms enable row level security;
alter table public.form_responses enable row level security;
alter table public.waiver_templates enable row level security;
alter table public.event_waivers enable row level security;
alter table public.waiver_signatures enable row level security;
revoke all on table public.event_forms, public.form_responses, public.waiver_templates, public.event_waivers, public.waiver_signatures from public, anon, authenticated;
grant select on table public.event_forms, public.form_responses, public.waiver_templates, public.event_waivers, public.waiver_signatures to authenticated;
grant all on table public.event_forms, public.form_responses, public.waiver_templates, public.event_waivers, public.waiver_signatures to service_role;
drop policy if exists event_forms_read on public.event_forms;
create policy event_forms_read on public.event_forms for select to authenticated using (public.can_access_event(event_id) or (status = 'published' and public.holds_ticket_for(event_id)));
drop policy if exists form_responses_read on public.form_responses;
create policy form_responses_read on public.form_responses for select to authenticated using (
  user_id = (select auth.uid()) or public.event_dependency_can_write(event_id)
  or (build_item_id is not null and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = build_item_id and public.is_workspace_member(l.workspace_id))));
drop policy if exists waiver_templates_read on public.waiver_templates;
create policy waiver_templates_read on public.waiver_templates for select to authenticated using (public.is_workspace_member(workspace_id)
  or (status = 'published' and exists (select 1 from public.event_waivers x where x.waiver_template_id = waiver_templates.id and x.status = 'active' and public.holds_ticket_for(x.event_id))));
drop policy if exists event_waivers_read on public.event_waivers;
create policy event_waivers_read on public.event_waivers for select to authenticated using (public.can_access_event(event_id) or public.holds_ticket_for(event_id));
drop policy if exists waiver_signatures_read on public.waiver_signatures;
create policy waiver_signatures_read on public.waiver_signatures for select to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.events e where e.id = event_id and e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager'])));

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('form.saved', 1, 'event_form', 'An event form version was saved or published (payload: event_id, form_id, version, published).', null),
  ('form.response_submitted', 1, 'form_response', 'A form response was submitted (payload: form_id, event_id, kind; no answers).', null),
  ('waiver.published', 1, 'waiver_template', 'A waiver version was published (payload: template_id, version).', null),
  ('waiver.signed', 1, 'waiver_signature', 'A waiver was signed (payload: event_id, template_id, version, minor; no personal data).', null),
  ('waiver_template.state_changed', 1, 'waiver_template', 'A waiver template version changed status.', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.event_forms_guard(), public.waiver_templates_immutable() from public, anon, authenticated;
revoke all on function public.form_validate(jsonb, jsonb), public.save_event_form(uuid, uuid, jsonb, boolean), public.submit_form_response(uuid, jsonb, uuid, text), public.decide_form_response(uuid, text),
  public.save_waiver_template(uuid, uuid, jsonb, integer), public.publish_waiver_template(uuid), public.waiver_template_compare(uuid, uuid), public.set_event_waiver(uuid, uuid, uuid[], boolean),
  public.sign_waiver(uuid, uuid, jsonb), public.revoke_waiver_signature(uuid, text), public.waiver_status(uuid) from public, anon;
grant execute on function public.form_validate(jsonb, jsonb), public.save_event_form(uuid, uuid, jsonb, boolean), public.submit_form_response(uuid, jsonb, uuid, text), public.decide_form_response(uuid, text),
  public.save_waiver_template(uuid, uuid, jsonb, integer), public.publish_waiver_template(uuid), public.waiver_template_compare(uuid, uuid), public.set_event_waiver(uuid, uuid, uuid[], boolean),
  public.sign_waiver(uuid, uuid, jsonb), public.revoke_waiver_signature(uuid, text), public.waiver_status(uuid) to authenticated, service_role;
