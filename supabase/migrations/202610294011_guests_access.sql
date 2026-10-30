-- Q18 Guests / Registration / Passes / Check-In (domains 64–68). Additive and backward-compatible with the deployed code.
--
-- Guests (64): guest_groups (group / household / table; households reserve seats with an expiry, capped by event capacity
--   under an advisory lock), guests gain group/household, plus-one chain, child flag + guardian, RSVP token/response.
-- Care data (64.7/64.8): guest_care holds dietary / allergy / accessibility needs. Only the event owner and workspace
--   owners/managers read rows; providers get counts only (event_care_summary). Children's events (event_type_profiles
--   guest_privacy = 'minimised', GD-12) refuse free-text medical notes and any contact details on child guests.
--   Legacy guests.dietary keeps working and is mirrored into guest_care on write.
-- Registration (65): versioned forms (published versions immutable), registrations with an explicit status machine
--   (submitted → pending_approval → approved / waitlisted / rejected / cancelled), server-side limits (capacity, per-email,
--   window), approval as a persisted decision; sensitive answers in registration_private (care roles only).
-- Passes / zones (66, 68): access_zones (time window, re-entry policy), access_rules (tier or pass type → zone, time window),
--   access_passes (guest / staff / supplier / artist / VIP / backstage / press; code + rotating nonce; revocable),
--   badge_templates (versioned), badge print audit.
-- Check-in (67): check_ins stays the single write model for attendee admission (ticket / pass / guest-list), gaining subject,
--   zone, direction, offline snapshot, client scan id (idempotent replay), conflict flag and reason. View public.checkins is
--   the canonical read model across attendee check_ins and provider_checkins (staff/provider arrival stays with Q17).
-- Scanner permission: can_scan_event(event, zone) = event owner, workspace role with checkin.scan (owner/manager/member),
--   or an active event_scanners assignment (door staff outside the workspace, optionally zone-limited).
-- scan_admission(): every rule (credential nonce, status, session window, zone membership/window, re-entry, offline
--   conflicts) decided in one transaction under a row lock. scan_ticket() keeps its signature and delegates.

-- ── Guests, groups, households ─────────────────────────────────────────────
create table if not exists public.guest_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null default 'group' check (kind in ('group','household','table')),
  name text not null check (length(name) between 1 and 120),
  max_size integer check (max_size between 1 and 1000),
  reserved_seats integer not null default 0 check (reserved_seats between 0 and 1000),
  hold_status text not null default 'none' check (hold_status in ('none','held','confirmed','released','expired')),
  hold_expires_at timestamptz,
  priority integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guest_groups_event on public.guest_groups(event_id);

alter table public.guests
  add column if not exists group_id uuid references public.guest_groups(id) on delete set null,
  add column if not exists household_id uuid references public.guest_groups(id) on delete set null,
  add column if not exists plus_one_of uuid references public.guests(id) on delete cascade,
  add column if not exists is_child boolean not null default false,
  add column if not exists guardian_id uuid references public.guests(id) on delete set null,
  add column if not exists rsvp_token_hash text,
  add column if not exists rsvp_responded_at timestamptz,
  add column if not exists rsvp_note text not null default '',
  add column if not exists registration_id uuid,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists guests_rsvp_token on public.guests(rsvp_token_hash) where rsvp_token_hash is not null;
create index if not exists guests_group on public.guests(group_id) where group_id is not null;
create index if not exists guests_household on public.guests(household_id) where household_id is not null;
create index if not exists guests_plus_one on public.guests(plus_one_of) where plus_one_of is not null;

alter table public.guest_groups enable row level security;
drop policy if exists guest_groups_rw on public.guest_groups;
create policy guest_groups_rw on public.guest_groups for all to authenticated using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));
grant select, insert, update, delete on public.guest_groups to authenticated;
grant all on public.guest_groups to service_role;

create or replace function public.event_guest_privacy(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.guest_privacy from public.events e join public.event_type_profiles p on p.event_type = e.event_type where e.id = p_event), 'standard');
$$;

-- Guests guard: groups/plus-ones/guardians from the same event; child data minimisation.
create or replace function public.guests_integrity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.group_id is not null and not exists (select 1 from public.guest_groups g where g.id = new.group_id and g.event_id = new.event_id) then raise exception 'group_not_in_event' using errcode = '22023'; end if;
  if new.household_id is not null and not exists (select 1 from public.guest_groups g where g.id = new.household_id and g.event_id = new.event_id and g.kind = 'household') then raise exception 'household_not_in_event' using errcode = '22023'; end if;
  if new.plus_one_of is not null and not exists (select 1 from public.guests g where g.id = new.plus_one_of and g.event_id = new.event_id and g.plus_one_of is null) then raise exception 'plus_one_host_invalid' using errcode = '22023'; end if;
  if new.guardian_id is not null and not exists (select 1 from public.guests g where g.id = new.guardian_id and g.event_id = new.event_id and not g.is_child) then raise exception 'guardian_invalid' using errcode = '22023'; end if;
  if new.is_child and (coalesce(new.email, '') <> '' or coalesce(new.phone, '') <> '') then raise exception 'child_contact_not_allowed' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists trg_guests_integrity on public.guests;
create trigger trg_guests_integrity before insert or update on public.guests for each row execute function public.guests_integrity_guard();

-- Households reserve seats with an expiry; held + confirmed reservations never exceed the event capacity.
create or replace function public.guest_groups_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap integer; used integer;
begin
  new.updated_at := now();
  if new.kind <> 'household' and new.hold_status <> 'none' then raise exception 'only_households_hold' using errcode = '22023'; end if;
  if new.hold_status = 'held' and new.hold_expires_at is null then raise exception 'hold_expiry_required' using errcode = '22023'; end if;
  if new.hold_status in ('held','confirmed') and new.reserved_seats > 0 then
    perform public.advisory_xact_lock('guest_capacity', new.event_id::text);
    select coalesce(capacity, guest_count) into cap from public.events where id = new.event_id;
    select coalesce(sum(g.reserved_seats), 0) into used from public.guest_groups g where g.event_id = new.event_id and g.id <> new.id and g.hold_status in ('held','confirmed')
      and (g.hold_status = 'confirmed' or g.hold_expires_at > now());
    if cap is not null and used + new.reserved_seats > cap then raise exception 'household_capacity_exceeded' using errcode = '22023', detail = (cap - used)::text; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guest_groups_guard on public.guest_groups;
create trigger trg_guest_groups_guard before insert or update on public.guest_groups for each row execute function public.guest_groups_guard();

-- ── Care data (dietary / allergies / accessibility) ───────────────────────
create table if not exists public.guest_care (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  dietary text not null default '' check (length(dietary) <= 300),
  allergies text not null default '' check (length(allergies) <= 300),
  accessibility text not null default '' check (length(accessibility) <= 500),
  access_flags text[] not null default '{}',
  notes text not null default '' check (length(notes) <= 1000),
  consent_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists guest_care_event on public.guest_care(event_id);

create or replace function public.can_read_guest_care(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (e.owner_id = (select auth.uid())
    or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager']))));
$$;
alter table public.guest_care enable row level security;
drop policy if exists guest_care_read on public.guest_care;
create policy guest_care_read on public.guest_care for select to authenticated using (public.can_read_guest_care(event_id));
drop policy if exists guest_care_write on public.guest_care;
create policy guest_care_write on public.guest_care for all to authenticated using (public.can_read_guest_care(event_id)) with check (public.can_read_guest_care(event_id));
revoke all on public.guest_care from anon, authenticated;
grant select, insert, update, delete on public.guest_care to authenticated;
grant all on public.guest_care to service_role;

create or replace function public.guest_care_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if not exists (select 1 from public.guests g where g.id = new.guest_id and g.event_id = new.event_id) then raise exception 'guest_not_in_event' using errcode = '22023'; end if;
  -- Children's events: no free-text notes (medical detail stays with the guardian); structured needs only.
  if public.event_guest_privacy(new.event_id) = 'minimised' and coalesce(new.notes, '') <> '' then raise exception 'notes_not_allowed_for_childrens_event' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists trg_guest_care_guard on public.guest_care;
create trigger trg_guest_care_guard before insert or update on public.guest_care for each row execute function public.guest_care_guard();

-- Legacy guests.dietary writes are mirrored into guest_care (the canonical, care-role-only copy).
create or replace function public.guests_dietary_mirror() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.dietary, '') <> '' and (tg_op = 'INSERT' or new.dietary is distinct from old.dietary) then
    insert into public.guest_care(guest_id, event_id, dietary) values (new.id, new.event_id, left(new.dietary, 300))
      on conflict (guest_id) do update set dietary = excluded.dietary;
  end if;
  return null;
end $$;
drop trigger if exists trg_guests_dietary_mirror on public.guests;
create trigger trg_guests_dietary_mirror after insert or update of dietary on public.guests for each row execute function public.guests_dietary_mirror();
insert into public.guest_care(guest_id, event_id, dietary)
  select g.id, g.event_id, left(g.dietary, 300) from public.guests g where coalesce(g.dietary, '') <> '' and not g.is_child
  on conflict (guest_id) do nothing;

-- Counts only — for caterers / venue / door teams who need numbers, never names.
create or replace function public.event_care_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_access_event(p_event) or public.is_provider_for_event(p_event)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'dietary', (select coalesce(jsonb_object_agg(k, n), '{}') from (select lower(btrim(c.dietary)) k, count(*) n from public.guest_care c join public.guests g on g.id = c.guest_id
                 where c.event_id = p_event and btrim(c.dietary) <> '' and g.status <> 'declined' group by 1) z),
    'allergies', (select count(*) from public.guest_care c join public.guests g on g.id = c.guest_id where c.event_id = p_event and btrim(c.allergies) <> '' and g.status <> 'declined'),
    'accessibility', (select count(*) from public.guest_care c join public.guests g on g.id = c.guest_id where c.event_id = p_event and (btrim(c.accessibility) <> '' or cardinality(c.access_flags) > 0) and g.status <> 'declined'),
    'access_flags', (select coalesce(jsonb_object_agg(f, n), '{}') from (select f, count(*) n from public.guest_care c, unnest(c.access_flags) f where c.event_id = p_event group by 1) z));
end $$;

-- ── RSVP (64.5, 64.6) ──────────────────────────────────────────────────────
-- Organiser sets a link token (hash only; plaintext goes only into the guest's link).
create or replace function public.set_guest_rsvp_token(p_guest uuid, p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guests;
begin
  select * into g from public.guests where id = p_guest for update;
  if not found or not public.event_dependency_can_write(g.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  update public.guests set rsvp_token_hash = p_token_hash, invited_at = coalesce(invited_at, now()), status = case when status = 'draft' then 'invited' else status end where id = g.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = g.event_id), 'guest.rsvp_link_set', jsonb_build_object('guest_id', g.id, 'event_id', g.event_id));
  return jsonb_build_object('ok', true);
end $$;

-- Guest responds through their link (server route, service role, rate-limited). Plus-ones only up to the allowance.
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
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('guest', e.workspace_id, 'guest.rsvp', jsonb_build_object('guest_id', g.id, 'event_id', e.id, 'response', p_response, 'plus_ones', n));
  perform public.emit_domain_event('guest.rsvp', e.workspace_id, jsonb_build_object('guest_id', g.id, 'event_id', e.id, 'response', p_response, 'plus_ones', n), null, 'guest', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'status', p_response, 'plus_ones', n, 'event', jsonb_build_object('name', e.name, 'starts_at', e.starts_at));
end $$;

-- ── Registration (65) ──────────────────────────────────────────────────────
create table if not exists public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version >= 1),
  status text not null default 'draft' check (status in ('draft','published','superseded','archived')),
  title text not null default 'Registration' check (length(title) <= 120),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array'),
  capacity integer check (capacity >= 1),
  per_email_limit integer not null default 1 check (per_email_limit between 1 and 20),
  approval_required boolean not null default false,
  waitlist boolean not null default true,
  opens_at timestamptz, closes_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (family_id, version)
);
create unique index if not exists registration_forms_live on public.registration_forms(event_id) where status = 'published';

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  form_id uuid not null references public.registration_forms(id) on delete restrict,
  form_version integer not null,
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted','pending_approval','approved','waitlisted','rejected','cancelled')),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  guest_id uuid references public.guests(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text not null default '' check (length(decision_reason) <= 500),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists registrations_event on public.registrations(event_id, status);
create index if not exists registrations_email on public.registrations(event_id, lower(email));
create unique index if not exists registrations_request on public.registrations(form_id, request_id) where request_id is not null;
create table if not exists public.registration_private (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  answers jsonb not null default '{}'
);

alter table public.registration_forms enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_private enable row level security;
drop policy if exists registration_forms_team on public.registration_forms;
create policy registration_forms_team on public.registration_forms for select to authenticated using (public.can_access_event(event_id));
drop policy if exists registrations_team on public.registrations;
create policy registrations_team on public.registrations for select to authenticated using (public.can_access_event(event_id) or user_id = (select auth.uid()));
drop policy if exists registration_private_care on public.registration_private;
create policy registration_private_care on public.registration_private for select to authenticated using (public.can_read_guest_care(event_id));
revoke all on public.registration_forms, public.registrations, public.registration_private from anon, authenticated;
grant select on public.registration_forms, public.registrations, public.registration_private to authenticated;
grant all on public.registration_forms, public.registrations, public.registration_private to service_role;

create or replace function public.registration_forms_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status in ('published','superseded','archived') and (new.fields is distinct from old.fields or new.version is distinct from old.version
     or new.capacity is distinct from old.capacity or new.approval_required is distinct from old.approval_required) then
    raise exception 'published_form_immutable' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists trg_registration_forms_guard on public.registration_forms;
create trigger trg_registration_forms_guard before update on public.registration_forms for each row execute function public.registration_forms_guard();

-- Publishes a new form version (fields validated); the previous published version is superseded.
create or replace function public.publish_registration_form(p_event uuid, p_form jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); prev public.registration_forms; v_id uuid; v_family uuid; v integer := 1; f jsonb; keys text[] := '{}';
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_form->'fields') <> 'array' or jsonb_array_length(p_form->'fields') > 40 then raise exception 'invalid_fields' using errcode = '22023'; end if;
  for f in select * from jsonb_array_elements(p_form->'fields') loop
    if coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$' or (f->>'key') = any(keys) then raise exception 'invalid_field_key' using errcode = '22023', detail = coalesce(f->>'key', ''); end if;
    if coalesce(f->>'type', '') not in ('text','textarea','email','phone','number','date','select','multiselect','checkbox') then raise exception 'invalid_field_type' using errcode = '22023', detail = f->>'key'; end if;
    if (f->>'type') in ('select','multiselect') and (jsonb_typeof(f->'options') <> 'array' or jsonb_array_length(f->'options') = 0) then raise exception 'options_required' using errcode = '22023', detail = f->>'key'; end if;
    keys := keys || (f->>'key');
  end loop;
  select * into prev from public.registration_forms where event_id = p_event and status = 'published' for update;
  v_family := coalesce(prev.family_id, gen_random_uuid());
  if prev.id is not null then
    select max(version) + 1 into v from public.registration_forms where family_id = v_family;
    update public.registration_forms set status = 'superseded' where id = prev.id;
  end if;
  insert into public.registration_forms(event_id, family_id, version, status, title, fields, capacity, per_email_limit, approval_required, waitlist, opens_at, closes_at, created_by, published_at)
    values (p_event, v_family, v, 'published', left(coalesce(p_form->>'title', 'Registration'), 120), p_form->'fields', nullif(p_form->>'capacity', '')::int,
      coalesce(nullif(p_form->>'per_email_limit', '')::int, 1), coalesce((p_form->>'approval_required')::boolean, false), coalesce((p_form->>'waitlist')::boolean, true),
      nullif(p_form->>'opens_at', '')::timestamptz, nullif(p_form->>'closes_at', '')::timestamptz, uid, now())
    returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = p_event), 'registration.form_published', jsonb_build_object('event_id', p_event, 'form_id', v_id, 'version', v));
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v);
end $$;

-- Submission (server route/action; service role, rate-limited by the app). Validates answers against the form version,
-- enforces window / per-email / capacity limits under an advisory lock; sensitive answers go to registration_private.
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
  perform public.emit_domain_event('registration.submitted', e.workspace_id, jsonb_build_object('id', rid, 'event_id', e.id, 'status', st), p_user, case when p_user is null then 'guest' else 'user' end, 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'id', rid, 'status', st);
end $$;

-- Internal status change: one place for side effects (approved → a confirmed guest), audit and outbox.
create or replace function public.registration_set_status(p_registration uuid, p_to text, p_actor uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.registrations; gid uuid; ws uuid;
begin
  select * into r from public.registrations where id = p_registration for update;
  update public.registrations set status = p_to, updated_at = now(),
    decided_by = case when p_to in ('approved','rejected') and p_actor is not null then p_actor else decided_by end,
    decided_at = case when p_to in ('approved','rejected') then now() else decided_at end,
    decision_reason = case when p_to in ('approved','rejected') then left(coalesce(p_reason, ''), 500) else decision_reason end
   where id = r.id;
  if p_to = 'approved' and r.guest_id is null then
    insert into public.guests(event_id, name, email, status, registration_id) values (r.event_id, r.name, r.email, 'confirmed', r.id) returning id into gid;
    update public.registrations set guest_id = gid where id = r.id;
  elsif p_to in ('rejected','cancelled') and r.guest_id is not null then
    update public.guests set status = 'declined' where id = r.guest_id;
  end if;
  select workspace_id into ws from public.events where id = r.event_id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (p_actor, case when p_actor is null then 'system' else 'user' end, ws, 'registration.status_changed',
    jsonb_build_object('registration_id', r.id, 'event_id', r.event_id, 'from', r.status, 'to', p_to, 'reason', left(coalesce(p_reason, ''), 500)));
end $$;

-- Organiser decision (65.4): approve / reject / promote from waitlist / cancel.
create or replace function public.decide_registration(p_registration uuid, p_to text, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); r public.registrations; fm public.registration_forms; taken integer;
begin
  select * into r from public.registrations where id = p_registration;
  if not found or uid is null or not public.event_dependency_can_write(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to not in ('approved','rejected','cancelled','waitlisted') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_to = 'approved' and r.status = 'waitlisted' then
    perform public.advisory_xact_lock('registration', r.event_id::text);
    select * into fm from public.registration_forms where id = r.form_id;
    select count(*) into taken from public.registrations x where x.event_id = r.event_id and x.status in ('submitted','pending_approval','approved');
    if fm.capacity is not null and taken >= fm.capacity then raise exception 'full' using errcode = '22023'; end if;
  end if;
  perform public.registration_set_status(r.id, p_to, uid, p_reason);
  return jsonb_build_object('ok', true, 'status', p_to);
end $$;

-- ── Zones, rules, passes, badges (66, 68) ──────────────────────────────────
create table if not exists public.access_zones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'general' check (kind in ('general','vip','backstage','staff','artist','supplier','press','accessible','other')),
  capacity integer check (capacity >= 1),
  opens_at timestamptz, closes_at timestamptz,
  reentry text not null default 'allow' check (reentry in ('allow','deny','limited')),
  max_entries integer check (max_entries between 1 and 100),
  status text not null default 'active' check (status in ('active','closed')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name),
  check (reentry <> 'limited' or max_entries is not null)
);
create table if not exists public.access_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid not null references public.access_zones(id) on delete cascade,
  tier_id uuid references public.ticket_tiers(id) on delete cascade,
  pass_type text check (pass_type in ('guest','staff','supplier','artist','vip','backstage','press')),
  valid_from timestamptz, valid_to timestamptz,
  created_at timestamptz not null default now(),
  check ((tier_id is null) <> (pass_type is null))
);
create index if not exists access_rules_zone on public.access_rules(zone_id);
create table if not exists public.badge_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1,
  status text not null default 'active' check (status in ('active','superseded','archived')),
  name text not null check (length(name) between 1 and 80),
  layout jsonb not null default '{}' check (jsonb_typeof(layout) = 'object' and length(layout::text) <= 20000),
  pass_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (event_id is not null or workspace_id is not null),
  unique (family_id, version)
);
create table if not exists public.access_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  pass_type text not null check (pass_type in ('guest','staff','supplier','artist','vip','backstage','press')),
  code text not null unique default ('GDP-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10))),
  nonce text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  holder_name text not null check (length(holder_name) between 1 and 120),
  holder_email text not null default '',
  guest_id uuid references public.guests(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  zones uuid[] not null default '{}',
  valid_from timestamptz, valid_to timestamptz,
  status text not null default 'active' check (status in ('active','suspended','revoked','expired')),
  badge_template_id uuid references public.badge_templates(id) on delete set null,
  printed_count integer not null default 0,
  last_printed_at timestamptz,
  revoked_at timestamptz, revoked_reason text not null default '',
  checked_in_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists access_passes_event on public.access_passes(event_id, status);

alter table public.access_zones enable row level security;
alter table public.access_rules enable row level security;
alter table public.access_passes enable row level security;
alter table public.badge_templates enable row level security;
drop policy if exists access_zones_read on public.access_zones;
create policy access_zones_read on public.access_zones for select to authenticated using (public.can_access_event(event_id));
drop policy if exists access_rules_read on public.access_rules;
create policy access_rules_read on public.access_rules for select to authenticated using (public.can_access_event(event_id));
drop policy if exists access_passes_read on public.access_passes;
create policy access_passes_read on public.access_passes for select to authenticated using (public.can_access_event(event_id) or user_id = (select auth.uid()));
drop policy if exists badge_templates_read on public.badge_templates;
create policy badge_templates_read on public.badge_templates for select to authenticated using ((event_id is not null and public.can_access_event(event_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
revoke all on public.access_zones, public.access_rules, public.access_passes, public.badge_templates from anon, authenticated;
grant select on public.access_zones, public.access_rules, public.access_passes, public.badge_templates to authenticated;
grant all on public.access_zones, public.access_rules, public.access_passes, public.badge_templates to service_role;

create or replace function public.access_integrity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'access_rules' then
    if not exists (select 1 from public.access_zones z where z.id = new.zone_id and z.event_id = new.event_id) then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
    if new.tier_id is not null and not exists (select 1 from public.ticket_tiers t where t.id = new.tier_id and t.event_id = new.event_id) then raise exception 'tier_not_in_event' using errcode = '22023'; end if;
  elsif tg_table_name = 'access_passes' then
    if exists (select 1 from unnest(new.zones) z where not exists (select 1 from public.access_zones a where a.id = z and a.event_id = new.event_id)) then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
    if new.guest_id is not null and not exists (select 1 from public.guests g where g.id = new.guest_id and g.event_id = new.event_id) then raise exception 'guest_not_in_event' using errcode = '22023'; end if;
    -- Revoking or suspending rotates the nonce so every printed badge / QR of this pass dies immediately.
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'active' then new.nonce := encode(extensions.gen_random_bytes(16), 'hex'); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_access_rules_guard on public.access_rules;
create trigger trg_access_rules_guard before insert or update on public.access_rules for each row execute function public.access_integrity_guard();
drop trigger if exists trg_access_passes_guard on public.access_passes;
create trigger trg_access_passes_guard before insert or update on public.access_passes for each row execute function public.access_integrity_guard();

create or replace function public.save_access_zone(p_event uuid, p_zone jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.access_zones(event_id, name, kind, capacity, opens_at, closes_at, reentry, max_entries, sort)
      values (p_event, btrim(p_zone->>'name'), coalesce(p_zone->>'kind', 'general'), nullif(p_zone->>'capacity', '')::int, nullif(p_zone->>'opens_at', '')::timestamptz,
        nullif(p_zone->>'closes_at', '')::timestamptz, coalesce(p_zone->>'reentry', 'allow'), nullif(p_zone->>'max_entries', '')::int, coalesce(nullif(p_zone->>'sort', '')::int, 0))
      returning id into v_id;
  else
    update public.access_zones set name = coalesce(btrim(p_zone->>'name'), name), kind = coalesce(p_zone->>'kind', kind), capacity = nullif(p_zone->>'capacity', '')::int,
      opens_at = nullif(p_zone->>'opens_at', '')::timestamptz, closes_at = nullif(p_zone->>'closes_at', '')::timestamptz, reentry = coalesce(p_zone->>'reentry', reentry),
      max_entries = nullif(p_zone->>'max_entries', '')::int, status = coalesce(p_zone->>'status', status)
     where id = p_id and event_id = p_event returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = p_event), 'access.zone_saved', jsonb_build_object('event_id', p_event, 'zone_id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Replaces a zone's rules: [{tier_id | pass_type, valid_from, valid_to}].
create or replace function public.set_zone_rules(p_zone uuid, p_rules jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare z public.access_zones; x jsonb; n integer := 0;
begin
  select * into z from public.access_zones where id = p_zone;
  if not found or not public.event_dependency_can_write(z.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_rules, '[]')) <> 'array' or jsonb_array_length(coalesce(p_rules, '[]')) > 100 then raise exception 'invalid_rules' using errcode = '22023'; end if;
  delete from public.access_rules where zone_id = z.id;
  for x in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    insert into public.access_rules(event_id, zone_id, tier_id, pass_type, valid_from, valid_to)
      values (z.event_id, z.id, nullif(x->>'tier_id', '')::uuid, nullif(x->>'pass_type', ''), nullif(x->>'valid_from', '')::timestamptz, nullif(x->>'valid_to', '')::timestamptz);
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = z.event_id), 'access.rules_set', jsonb_build_object('zone_id', z.id, 'rules', n));
  return jsonb_build_object('ok', true, 'rules', n);
end $$;

create or replace function public.issue_access_pass(p_event uuid, p_pass_type text, p_holder_name text, p_holder_email text default '', p_zones uuid[] default '{}',
  p_valid_from timestamptz default null, p_valid_to timestamptz default null, p_guest uuid default null, p_user uuid default null, p_build_item uuid default null, p_badge_template uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v public.access_passes;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_build_item is not null and not exists (select 1 from public.build_items b where b.id = p_build_item and b.event_id = p_event) then raise exception 'booking_not_in_event' using errcode = '22023'; end if;
  insert into public.access_passes(event_id, pass_type, holder_name, holder_email, zones, valid_from, valid_to, guest_id, user_id, build_item_id, badge_template_id, created_by)
    values (p_event, p_pass_type, btrim(p_holder_name), lower(btrim(coalesce(p_holder_email, ''))), coalesce(p_zones, '{}'), p_valid_from, p_valid_to, p_guest, p_user, p_build_item, p_badge_template, uid)
    returning * into v;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = p_event), 'access.pass_issued', jsonb_build_object('pass_id', v.id, 'event_id', p_event, 'type', p_pass_type));
  perform public.emit_domain_event('access.pass_issued', (select workspace_id from public.events where id = p_event), jsonb_build_object('id', v.id, 'event_id', p_event, 'type', p_pass_type), uid, 'user', 'event', p_event::text, null, null);
  return jsonb_build_object('ok', true, 'id', v.id, 'code', v.code);
end $$;

create or replace function public.revoke_access_pass(p_pass uuid, p_reason text, p_status text default 'revoked') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v public.access_passes;
begin
  select * into v from public.access_passes where id = p_pass for update;
  if not found or uid is null or not public.event_dependency_can_write(v.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('revoked','suspended','active') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.access_passes set status = p_status, revoked_at = case when p_status = 'active' then null else now() end, revoked_reason = left(coalesce(p_reason, ''), 300) where id = v.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = v.event_id), 'access.pass_' || p_status, jsonb_build_object('pass_id', v.id, 'reason', left(coalesce(p_reason, ''), 300)));
  perform public.emit_domain_event('access.pass_state_changed', (select workspace_id from public.events where id = v.event_id), jsonb_build_object('id', v.id, 'from', v.status, 'to', p_status), uid, 'user', 'event', v.event_id::text, null, null);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

create or replace function public.record_badge_print(p_pass uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v public.access_passes;
begin
  select * into v from public.access_passes where id = p_pass for update;
  if not found or uid is null or not public.event_dependency_can_write(v.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'pass_not_active' using errcode = '22023'; end if;
  update public.access_passes set printed_count = printed_count + 1, last_printed_at = now() where id = v.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = v.event_id), 'access.badge_printed', jsonb_build_object('pass_id', v.id, 'count', v.printed_count + 1));
  return jsonb_build_object('ok', true, 'printed_count', v.printed_count + 1, 'code', v.code, 'nonce_version', md5(v.nonce));
end $$;

create or replace function public.save_badge_template(p_event uuid, p_name text, p_layout jsonb, p_pass_types text[], p_family uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v integer := 1; v_id uuid; fam uuid := coalesce(p_family, gen_random_uuid());
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_layout::text ~* '(email|phone|dietary|allerg|medical)' then raise exception 'private_fields_not_allowed' using errcode = '22023'; end if;
  if p_family is not null then
    select max(version) + 1 into v from public.badge_templates where family_id = p_family and event_id = p_event;
    if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.badge_templates set status = 'superseded' where family_id = p_family and status = 'active';
  end if;
  insert into public.badge_templates(event_id, family_id, version, name, layout, pass_types) values (p_event, fam, v, btrim(p_name), coalesce(p_layout, '{}'), coalesce(p_pass_types, '{}')) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v);
end $$;

-- ── Scanner permission (event-scoped validate permission) ─────────────────
insert into public.role_permissions(workspace_kind, role, permission)
  select 'organizer', r, 'checkin.scan' from unnest(array['owner','manager','member']) r
  on conflict do nothing;

create table if not exists public.event_scanners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  zones uuid[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists event_scanners_active on public.event_scanners(event_id, user_id) where revoked_at is null;
alter table public.event_scanners enable row level security;
drop policy if exists event_scanners_read on public.event_scanners;
create policy event_scanners_read on public.event_scanners for select to authenticated using (user_id = (select auth.uid()) or public.can_access_event(event_id));
revoke all on public.event_scanners from anon, authenticated;
grant select on public.event_scanners to authenticated;
grant all on public.event_scanners to service_role;

create or replace function public.can_scan_event(p_event uuid, p_zone uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (
      e.owner_id = (select auth.uid())
      or (e.workspace_id is not null and public.has_permission(e.workspace_id, 'checkin.scan'))
      or exists (select 1 from public.event_scanners s where s.event_id = e.id and s.user_id = (select auth.uid()) and s.revoked_at is null
                 and (s.expires_at is null or s.expires_at > now()) and (cardinality(s.zones) = 0 or (p_zone is not null and p_zone = any(s.zones))))));
$$;

create or replace function public.assign_event_scanner(p_event uuid, p_user uuid, p_zones uuid[] default '{}', p_expires_at timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v_id uuid;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_zones, '{}')) z where not exists (select 1 from public.access_zones a where a.id = z and a.event_id = p_event)) then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
  update public.event_scanners set revoked_at = now() where event_id = p_event and user_id = p_user and revoked_at is null;
  insert into public.event_scanners(event_id, user_id, zones, expires_at, created_by) values (p_event, p_user, coalesce(p_zones, '{}'), p_expires_at, uid) returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = p_event), 'checkin.scanner_assigned', jsonb_build_object('event_id', p_event, 'user_id', p_user, 'zones', p_zones));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.revoke_event_scanner(p_event uuid, p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.event_scanners set revoked_at = now() where event_id = p_event and user_id = p_user and revoked_at is null;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = p_event), 'checkin.scanner_revoked', jsonb_build_object('event_id', p_event, 'user_id', p_user));
  return jsonb_build_object('ok', true);
end $$;

-- ── Canonical check-in model ───────────────────────────────────────────────
alter table public.check_ins drop constraint if exists check_ins_result_check;
alter table public.check_ins add constraint check_ins_result_check check (result in
  ('admitted','duplicate','invalid','revoked','readmitted','refunded','transferred','resold','wrong_event','wrong_session','resale_locked',
   'wrong_zone','outside_window','reentry_denied','suspended','expired','exited','not_authorized'));
alter table public.check_ins drop constraint if exists check_ins_credential_check;
alter table public.check_ins add constraint check_ins_credential_check check (credential in ('wallet','print','manual','legacy','virtual','barcode','pass','guest_list'));
alter table public.check_ins
  add column if not exists subject_kind text not null default 'ticket' check (subject_kind in ('ticket','pass','guest')),
  add column if not exists pass_id uuid references public.access_passes(id) on delete set null,
  add column if not exists guest_id uuid references public.guests(id) on delete set null,
  add column if not exists zone_id uuid references public.access_zones(id) on delete set null,
  add column if not exists direction text not null default 'in' check (direction in ('in','out')),
  add column if not exists snapshot_id uuid,
  add column if not exists client_scan_id text,
  add column if not exists local_result text,
  add column if not exists conflict text check (conflict in ('offline_duplicate','offline_earlier_wins','superseded_by_offline','offline_admitted_revoked')),
  add column if not exists reason text not null default '';
create unique index if not exists check_ins_client_scan on public.check_ins(event_id, coalesce(device, ''), client_scan_id) where client_scan_id is not null;
create index if not exists check_ins_ticket on public.check_ins(ticket_id, created_at) where ticket_id is not null;
create index if not exists check_ins_pass on public.check_ins(pass_id, created_at) where pass_id is not null;
alter table public.guests add column if not exists checked_in_zone uuid references public.access_zones(id) on delete set null;

-- Canonical read model: attendee admissions (tickets / passes / guest list) and provider / supplier arrivals in one shape.
create or replace view public.checkins with (security_invoker = true) as
  select 'attendee:' || c.id::text as id, c.event_id, c.subject_kind, coalesce(c.ticket_id, c.pass_id, c.guest_id) as subject_id, c.result as status,
         coalesce(c.offline_at, c.created_at) as occurred_at, c.zone_id, c.gate, c.device, c.credential as method, c.scanned_by as actor_id, c.conflict
    from public.check_ins c
  union all
  select 'provider:' || p.id::text, p.event_id, 'provider', p.build_item_id, p.status, coalesce(p.arrived_at, p.updated_at), null, null, null, 'manual', p.updated_by, null
    from public.provider_checkins p;
grant select on public.checkins to authenticated, service_role;

-- ── Scan / admission (one transaction, row-locked) ─────────────────────────
create or replace function public.scan_admission(p_event uuid, p_zone uuid, p_ticket uuid, p_pass uuid, p_code text, p_nonce text, p_credential text,
  p_device text default null, p_offline_at timestamptz default null, p_gate text default null, p_client_scan_id text default null,
  p_snapshot uuid default null, p_local_result text default null, p_direction text default 'in') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  tk public.tickets; ps public.access_passes; tr public.ticket_tiers; z public.access_zones; e public.events; prior public.check_ins; adm public.check_ins;
  res text; why text := ''; conf text; at timestamptz; reentry boolean; subj text; n integer; ok_zone boolean; dev text := left(p_device, 60);
begin
  if not public.can_scan_event(p_event, p_zone) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_offline_at is not null and (p_offline_at > now() + interval '5 minutes' or p_offline_at < now() - interval '7 days') then raise exception 'invalid_offline_time' using errcode = '22023'; end if;
  at := coalesce(p_offline_at, now());
  -- Idempotent replay of an offline scan (same device + client id) returns the stored outcome.
  if p_client_scan_id is not null then
    select * into prior from public.check_ins c where c.event_id = p_event and coalesce(c.device, '') = coalesce(dev, '') and c.client_scan_id = p_client_scan_id;
    if found then return jsonb_build_object('result', prior.result, 'reason', prior.reason, 'conflict', prior.conflict, 'replayed', true, 'ticket_id', prior.ticket_id, 'pass_id', prior.pass_id); end if;
  end if;
  select * into e from public.events where id = p_event;
  if p_zone is not null then
    select * into z from public.access_zones where id = p_zone;
    if not found or z.event_id <> p_event then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
  end if;

  if p_pass is not null or upper(coalesce(p_code, '')) like 'GDP-%' then
    subj := 'pass';
    if p_pass is not null then select * into ps from public.access_passes where id = p_pass for update;
    else select * into ps from public.access_passes where code = upper(p_code) for update; end if;
  else
    subj := 'ticket';
    if p_ticket is not null then select * into tk from public.tickets where id = p_ticket for update;
    else select * into tk from public.tickets where code = upper(coalesce(p_code, '')) for update; end if;
  end if;

  if subj = 'pass' then
    if ps.id is null then res := 'invalid'; why := 'Unknown pass.';
    elsif ps.event_id <> p_event then res := 'wrong_event'; why := 'This pass is for another event.';
    elsif p_nonce is not null and ps.nonce is distinct from p_nonce then res := 'revoked'; why := 'This badge has been replaced or revoked.';
    elsif ps.status = 'revoked' then res := 'revoked'; why := 'Pass revoked' || case when ps.revoked_reason <> '' then ': ' || ps.revoked_reason else '.' end;
    elsif ps.status = 'suspended' then res := 'suspended'; why := 'Pass suspended.';
    elsif ps.status = 'expired' or (ps.valid_to is not null and at > ps.valid_to) then res := 'expired'; why := 'Pass has expired.';
    elsif ps.valid_from is not null and at < ps.valid_from then res := 'outside_window'; why := 'Pass not valid yet.';
    end if;
  else
    if tk.id is null then res := 'invalid'; why := 'Unknown ticket.';
    elsif tk.event_id <> p_event then res := 'wrong_event'; why := 'This ticket is for another event.';
    elsif p_nonce is not null and tk.qr_nonce is distinct from p_nonce then
      res := case tk.status when 'transferred' then 'transferred' when 'resold' then 'resold' when 'refunded' then 'refunded' when 'cancelled' then 'revoked' else 'invalid' end;
      why := case res when 'transferred' then 'Ticket was transferred — this code is no longer valid.' when 'resold' then 'Ticket was resold — this code is no longer valid.'
                      when 'refunded' then 'Ticket was refunded.' when 'revoked' then 'Ticket cancelled.' else 'Expired or replaced code — ask the holder to refresh their ticket.' end;
    elsif tk.status = 'refunded' then res := 'refunded'; why := 'Ticket was refunded.';
    elsif tk.status = 'transferred' then res := 'transferred'; why := 'Ticket was transferred to someone else.';
    elsif tk.status = 'resold' then res := 'resold'; why := 'Ticket was resold.';
    elsif tk.status = 'cancelled' then res := 'revoked'; why := 'Ticket cancelled.';
    elsif tk.status = 'resale_listed' then res := 'resale_locked'; why := 'Ticket is listed for resale — the holder must cancel the listing first.';
    else
      select * into tr from public.ticket_tiers where id = tk.tier_id;
      if (tr.valid_from is not null and at < tr.valid_from - interval '2 hours') or (tr.valid_to is not null and at > tr.valid_to) then res := 'wrong_session'; why := 'Ticket is for a different day or session.'; end if;
    end if;
  end if;

  -- Zone membership and window (server-side, independent of any UI).
  if res is null and z.id is not null then
    if z.status <> 'active' then res := 'outside_window'; why := z.name || ' is closed.';
    elsif (z.opens_at is not null and at < z.opens_at) or (z.closes_at is not null and at > z.closes_at) then res := 'outside_window'; why := z.name || ' is not open at this time.';
    else
      if subj = 'pass' then
        ok_zone := z.id = any(ps.zones) or exists (select 1 from public.access_rules r where r.zone_id = z.id and r.pass_type = ps.pass_type
                     and (r.valid_from is null or at >= r.valid_from) and (r.valid_to is null or at <= r.valid_to));
      else
        ok_zone := exists (select 1 from public.access_rules r where r.zone_id = z.id and r.tier_id = tk.tier_id and (r.valid_from is null or at >= r.valid_from) and (r.valid_to is null or at <= r.valid_to))
          or (z.kind = 'general' and not exists (select 1 from public.access_rules r where r.zone_id = z.id));
      end if;
      if not ok_zone then res := 'wrong_zone'; why := 'Not valid for ' || z.name || '.'; end if;
    end if;
  end if;

  if res is null and p_direction = 'out' then res := 'exited'; why := 'Exit recorded.'; end if;

  if res is null then
    -- Admissions so far for this subject in this zone (null zone = main entry).
    select * into adm from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.zone_id is not distinct from p_zone
       and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id)) order by coalesce(c.offline_at, c.created_at), c.id limit 1;
    if adm.id is null then
      res := 'admitted'; why := 'Valid.';
    else
      if z.id is not null then
        select count(*) into n from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.zone_id = z.id and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id));
        reentry := z.reentry = 'allow' or (z.reentry = 'limited' and n < z.max_entries);
        if not reentry and z.reentry = 'limited' then res := 'reentry_denied'; why := 'Re-entry limit reached for ' || z.name || '.'; end if;
      else
        reentry := subj = 'pass' or coalesce((e.settings->>'reentry')::boolean, false);
      end if;
      if res is null then
        if p_offline_at is not null and at < coalesce(adm.offline_at, adm.created_at) and not reentry then
          -- Offline reconciliation, first valid scan wins: this earlier scan becomes the admission, the later one is flagged.
          update public.check_ins set result = 'duplicate', conflict = 'superseded_by_offline', reason = 'Superseded by an earlier offline scan.' where id = adm.id;
          res := 'admitted'; why := 'Valid (earlier offline scan).'; conf := 'offline_earlier_wins';
        elsif reentry then res := 'readmitted'; why := 'Re-entry.';
        else res := 'duplicate'; why := 'Already scanned at ' || to_char(coalesce(adm.offline_at, adm.created_at) at time zone coalesce(e.timezone, 'Europe/London'), 'HH24:MI') || coalesce(' (' || adm.gate || ')', '') || '.';
          if p_offline_at is not null then conf := 'offline_duplicate'; end if;
        end if;
      end if;
    end if;
  end if;

  if res in ('admitted','readmitted') then
    if subj = 'ticket' then
      update public.tickets set status = case when status = 'valid' then 'used' else status end,
        checked_in_at = case when checked_in_at is null or at < checked_in_at then at else checked_in_at end where id = tk.id;
    else
      update public.access_passes set checked_in_at = case when checked_in_at is null or at < checked_in_at then at else checked_in_at end where id = ps.id;
    end if;
  elsif p_local_result in ('admitted','readmitted','offline_ok') and res not in ('duplicate','exited') then
    conf := 'offline_admitted_revoked';   -- the device let someone in that the server rejects: flagged for review
  end if;

  insert into public.check_ins(ticket_id, pass_id, event_id, scanned_by, result, device, offline_at, credential, gate, subject_kind, zone_id, direction, snapshot_id, client_scan_id, local_result, conflict, reason)
    values (tk.id, ps.id, p_event, auth.uid(), res, dev, p_offline_at, coalesce(p_credential, case when subj = 'pass' then 'pass' else 'manual' end), left(p_gate, 60), subj, p_zone,
      coalesce(p_direction, 'in'), p_snapshot, left(p_client_scan_id, 80), left(p_local_result, 30), conf, why);
  if res in ('admitted','readmitted') then
    perform public.emit_domain_event('ticket.scanned', e.workspace_id, jsonb_build_object('event_id', p_event, 'subject', subj, 'id', coalesce(tk.id, ps.id), 'zone_id', p_zone, 'result', res, 'offline', p_offline_at is not null),
      auth.uid(), 'user', 'event', p_event::text, null, null);
  end if;
  return jsonb_build_object('result', res, 'reason', why, 'conflict', conf, 'subject', subj, 'ticket_id', tk.id, 'pass_id', ps.id,
    'code', coalesce(tk.code, ps.code), 'attendee', case when coalesce(tk.event_id, ps.event_id) = p_event then coalesce(tk.attendee_name, ps.holder_name) end,
    'tier', coalesce(tr.name, ps.pass_type), 'seat', case when tk.event_id = p_event then tk.seat end, 'zone', z.name,
    'checked_in_at', coalesce(tk.checked_in_at, ps.checked_in_at),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('result', c.result, 'at', coalesce(c.offline_at, c.created_at), 'gate', c.gate, 'zone_id', c.zone_id) order by c.created_at desc), '[]')
                from (select * from public.check_ins c where (tk.id is not null and c.ticket_id = tk.id) or (ps.id is not null and c.pass_id = ps.id) order by c.created_at desc limit 5) c));
end $$;

-- Deployed callers keep working: scan_ticket = main-entry scan through the new engine (same result values, now role-scoped).
create or replace function public.scan_ticket(p_event uuid, p_ticket uuid, p_code text, p_nonce text, p_credential text, p_device text default null, p_offline_at timestamptz default null, p_gate text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  return public.scan_admission(p_event, null, p_ticket, null, p_code, p_nonce, p_credential, p_device, p_offline_at, p_gate);
end $$;

-- Guest-list (no ticket) check-in by the door team.
create or replace function public.check_in_guest(p_event uuid, p_guest uuid, p_zone uuid default null, p_device text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guests; res text; why text;
begin
  if not public.can_scan_event(p_event, p_zone) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into g from public.guests where id = p_guest for update;
  if not found or g.event_id <> p_event then res := 'invalid'; why := 'Not on this guest list.';
  elsif g.status = 'declined' then res := 'revoked'; why := 'Guest declined.';
  elsif g.checked_in_at is not null then res := 'duplicate'; why := 'Already checked in.';
  else update public.guests set checked_in_at = now(), checked_in_zone = p_zone where id = g.id; res := 'admitted'; why := 'Welcome.'; end if;
  insert into public.check_ins(guest_id, event_id, scanned_by, result, device, credential, subject_kind, zone_id, reason)
    values (case when res = 'invalid' then null else g.id end, p_event, auth.uid(), res, left(p_device, 60), 'guest_list', 'guest', p_zone, why);
  return jsonb_build_object('result', res, 'reason', why, 'name', case when res <> 'invalid' then g.name end);
end $$;

-- Manifest / lookup now follow the scanner permission (door staff outside the workspace included) and expose admission data only.
create or replace function public.scan_manifest(p_event uuid) returns table(ticket_id uuid, code text, status text, attendee text, tier text, seat text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.code, t.status, t.attendee_name, tr.name, t.seat, t.checked_in_at
  from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
  where t.event_id = p_event and public.can_scan_event(p_event) and t.status in ('valid','used','resale_listed','refunded','transferred','resold','cancelled');
$$;
create or replace function public.scan_lookup(p_event uuid, p_query text) returns table(ticket_id uuid, code text, status text, attendee text, email text, tier text, seat text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.code, t.status, t.attendee_name,
         case when public.can_access_event(p_event) then t.attendee_email else regexp_replace(t.attendee_email, '^(.).*(@.*)$', '\1***\2') end,
         tr.name, t.seat, t.checked_in_at
  from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
  where t.event_id = p_event and public.can_scan_event(p_event) and length(trim(coalesce(p_query, ''))) >= 2
    and (t.code ilike '%' || p_query || '%' or t.attendee_name ilike '%' || p_query || '%' or t.attendee_email ilike '%' || p_query || '%' or t.seat ilike '%' || p_query || '%' or tr.name ilike '%' || p_query || '%')
  order by t.attendee_name limit 25;
$$;

-- Grants. Internal helpers: service role only. Commands: authenticated (each checks its own permission).
revoke all on function public.event_guest_privacy(uuid), public.guests_integrity_guard(), public.guest_groups_guard(), public.guest_care_guard(), public.guests_dietary_mirror(),
  public.can_read_guest_care(uuid), public.guest_rsvp(text, text, jsonb, text, jsonb), public.registration_forms_guard(), public.submit_registration(uuid, text, text, jsonb, uuid, text),
  public.registration_set_status(uuid, text, uuid, text), public.access_integrity_guard() from public, anon, authenticated;
grant execute on function public.event_guest_privacy(uuid), public.can_read_guest_care(uuid), public.guest_rsvp(text, text, jsonb, text, jsonb),
  public.submit_registration(uuid, text, text, jsonb, uuid, text), public.registration_set_status(uuid, text, uuid, text) to service_role;
-- can_read_guest_care is used by RLS policies evaluated as the caller, so authenticated must be able to execute it.
grant execute on function public.can_read_guest_care(uuid) to authenticated;
revoke all on function public.event_care_summary(uuid), public.set_guest_rsvp_token(uuid, text), public.publish_registration_form(uuid, jsonb), public.decide_registration(uuid, text, text),
  public.save_access_zone(uuid, jsonb, uuid), public.set_zone_rules(uuid, jsonb), public.issue_access_pass(uuid, text, text, text, uuid[], timestamptz, timestamptz, uuid, uuid, uuid, uuid),
  public.revoke_access_pass(uuid, text, text), public.record_badge_print(uuid), public.save_badge_template(uuid, text, jsonb, text[], uuid), public.can_scan_event(uuid, uuid),
  public.assign_event_scanner(uuid, uuid, uuid[], timestamptz), public.revoke_event_scanner(uuid, uuid),
  public.scan_admission(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text), public.check_in_guest(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.event_care_summary(uuid), public.set_guest_rsvp_token(uuid, text), public.publish_registration_form(uuid, jsonb), public.decide_registration(uuid, text, text),
  public.save_access_zone(uuid, jsonb, uuid), public.set_zone_rules(uuid, jsonb), public.issue_access_pass(uuid, text, text, text, uuid[], timestamptz, timestamptz, uuid, uuid, uuid, uuid),
  public.revoke_access_pass(uuid, text, text), public.record_badge_print(uuid), public.save_badge_template(uuid, text, jsonb, text[], uuid), public.can_scan_event(uuid, uuid),
  public.assign_event_scanner(uuid, uuid, uuid[], timestamptz), public.revoke_event_scanner(uuid, uuid),
  public.scan_admission(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text), public.check_in_guest(uuid, uuid, uuid, text) to authenticated, service_role;
