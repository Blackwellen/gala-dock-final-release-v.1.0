-- Q29 (lane C, 2026-10-29) — Virtual / webinar / hybrid (domains 181–184). Additive and backward-compatible.
-- Builds on 202610270017 (event_virtual: one event-level online session, legacy virtual_join kept unchanged).
--   * virtual_sessions: many sessions per event (main / breakout / workshop / webinar / live audio / podcast / remote / replay),
--     tracks, optional programme item, provider + meeting id, attendee stream link, speaker (backstage) link, host link + host
--     notes. Secrets (join / speaker / host links, host notes) are column-revoked: clients read them only through
--     virtual_session_links() (event editors). Machine `virtual_session`: draft → scheduled → live → ended → archived; cancelled.
--   * Captions / accessibility flags per session (captions mode + languages, sign language, transcript, audio description, notes),
--     shown in the public summary.
--   * virtual_session_roles: speaker / moderator / host / producer access for named users (owner/manager assign + revoke).
--   * virtual_tier_access: hybrid tiers — in_person / online / hybrid per ticket tier with SEPARATE capacity: online tiers ≤
--     event_virtual.capacity, in-person tiers ≤ events.capacity (checked when a mode is set and when a moded tier's quantity
--     changes). Tiers without a row keep the legacy behaviour (any valid ticket of an online/hybrid event).
--   * Join tokens (virtual_join_tokens, service-only table): virtual_issue_join_token() checks the entitlement (current holder of a
--     valid/used ticket of an online-entitled tier, or an approved registration, or an active session role, or the event team),
--     the access window, session capacity and the per-attendee device limit, revokes the caller's earlier unused tokens for the
--     same device (rotation) and returns a 2-minute single-use token (only its sha256 is stored). virtual_redeem_join_token()
--     re-validates everything (incl. the ticket's Q21 credential_version), marks the token used, opens an attendance row and
--     returns the provider link. Host secrets are only released to hosts / moderators / producers.
--   * Revocation: AFTER UPDATE triggers on tickets (Q21 credential rotation: refund / transfer / resale / cancel / holder change
--     bump credential_version) and registrations (cancelled / rejected) revoke unused tokens and close open attendance.
--   * Attendance: virtual_attendance (live + replay), heartbeat / leave, minutes on close, sweep of stale rows every 5 minutes,
--     provider-reported attendance (service only), virtual_attendance_summary() for the team.
--   * Recordings: virtual_recordings (provider URL or a private Q04 workspace-files path), machine `virtual_recording`
--     (processing → available → withdrawn), access window (access_from / access_until) and audience (attendees / registered /
--     session_attendees / team). virtual_replay_access() releases the URL / storage path only to entitled users inside the
--     window; the route signs a 60-second URL after the Q04 quarantine gate.
--   * No provider API is called from the database. Provider adapters live in src/lib/virtual (BLOCKED_EXTERNAL until credentials).

-- ═══ 1. Sessions ═══
create table if not exists public.virtual_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null default 'main' check (kind in ('main','breakout','workshop','webinar','live_audio','podcast','remote','replay')),
  track text check (track is null or length(track) <= 80),
  parent_session_id uuid references public.virtual_sessions(id) on delete set null,
  programme_item_id uuid references public.programme_items(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  provider text not null default 'manual' check (provider in ('manual','zoom','teams','google_meet','youtube_live','vimeo','streamyard','riverside','spotify_live','other')),
  external_meeting_id text check (external_meeting_id is null or length(external_meeting_id) <= 200),
  join_url text check (join_url is null or join_url ~ '^https://\S+$'),
  speaker_url text check (speaker_url is null or speaker_url ~ '^https://\S+$'),
  host_url text check (host_url is null or host_url ~ '^https://\S+$'),
  host_secret_note text check (host_secret_note is null or length(host_secret_note) <= 2000),
  access text not null default 'ticket' check (access in ('ticket','registration','ticket_or_registration','invite_only')),
  tier_ids uuid[] not null default '{}',
  capacity integer check (capacity is null or capacity > 0),
  max_devices_per_attendee integer not null default 1 check (max_devices_per_attendee between 1 and 5),
  opens_minutes_before integer not null default 15 check (opens_minutes_before between 0 and 1440),
  closes_minutes_after integer not null default 30 check (closes_minutes_after between 0 and 1440),
  captions text not null default 'none' check (captions in ('none','live_human','live_auto','post_event')),
  caption_languages text[] not null default '{}' check (cardinality(caption_languages) <= 10),
  sign_language boolean not null default false,
  transcript boolean not null default false,
  audio_description boolean not null default false,
  accessibility_notes text check (accessibility_notes is null or length(accessibility_notes) <= 1000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists virtual_sessions_event_idx on public.virtual_sessions(event_id, starts_at);
create index if not exists virtual_sessions_workspace_idx on public.virtual_sessions(workspace_id, status, starts_at);
create index if not exists virtual_sessions_external_idx on public.virtual_sessions(provider, external_meeting_id) where external_meeting_id is not null;
drop trigger if exists virtual_sessions_touch on public.virtual_sessions;
create trigger virtual_sessions_touch before update on public.virtual_sessions for each row execute function public.ops_touch();

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('virtual_session', 'virtual_sessions', 'status', 'enforce', array['draft','scheduled'], array['archived'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'virtual_session';
insert into public.state_transitions(machine, from_state, to_state) values
  ('virtual_session','draft','scheduled'), ('virtual_session','draft','cancelled'),
  ('virtual_session','scheduled','draft'), ('virtual_session','scheduled','live'), ('virtual_session','scheduled','ended'), ('virtual_session','scheduled','cancelled'),
  ('virtual_session','live','ended'), ('virtual_session','live','cancelled'),
  ('virtual_session','ended','archived'), ('virtual_session','ended','live'),
  ('virtual_session','cancelled','scheduled'), ('virtual_session','cancelled','archived');
drop trigger if exists virtual_sessions_state_guard on public.virtual_sessions;
create trigger virtual_sessions_state_guard before insert or update of status on public.virtual_sessions for each row execute function public.enforce_state_transition('virtual_session', 'status');

-- ═══ 2. Session roles (speaker / moderator / host / producer) ═══
create table if not exists public.virtual_session_roles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.virtual_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('speaker','moderator','host','producer')),
  status text not null default 'active' check (status in ('active','revoked')),
  display_name text check (display_name is null or length(display_name) <= 120),
  assigned_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (session_id, user_id, role)
);
create index if not exists virtual_session_roles_user_idx on public.virtual_session_roles(user_id, status);

-- ═══ 3. Hybrid tiers: attendance mode + separate capacity ═══
create table if not exists public.virtual_tier_access (
  tier_id uuid primary key references public.ticket_tiers(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  mode text not null check (mode in ('in_person','online','hybrid')),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists virtual_tier_access_event_idx on public.virtual_tier_access(event_id);

-- ═══ 4. Join tokens (service-only table) ═══
create table if not exists public.virtual_join_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.virtual_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  role text not null check (role in ('attendee','speaker','moderator','host','producer','team')),
  credential_version integer,
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or revoke_reason in ('rotated','ticket_changed','registration_changed','role_revoked','session_closed'))
);
create index if not exists virtual_join_tokens_open_idx on public.virtual_join_tokens(session_id, user_id, device_id) where used_at is null and revoked_at is null;
create index if not exists virtual_join_tokens_ticket_idx on public.virtual_join_tokens(ticket_id) where ticket_id is not null;
create index if not exists virtual_join_tokens_registration_idx on public.virtual_join_tokens(registration_id) where registration_id is not null;

-- ═══ 5. Attendance (live + replay) ═══
create table if not exists public.virtual_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.virtual_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  token_id uuid references public.virtual_join_tokens(id) on delete set null,
  recording_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  role text not null default 'attendee' check (role in ('attendee','speaker','moderator','host','producer','team')),
  mode text not null default 'live' check (mode in ('live','replay')),
  device_id text check (device_id is null or device_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  external_participant text check (external_participant is null or length(external_participant) <= 200),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text check (left_reason is null or left_reason in ('left','timeout','revoked','ended','provider','rejoined')),
  minutes numeric(8,1) check (minutes is null or minutes >= 0)
);
create index if not exists virtual_attendance_session_idx on public.virtual_attendance(session_id, joined_at);
create index if not exists virtual_attendance_open_idx on public.virtual_attendance(session_id, last_seen_at) where left_at is null;
create index if not exists virtual_attendance_ticket_idx on public.virtual_attendance(ticket_id) where ticket_id is not null;
create index if not exists virtual_attendance_user_idx on public.virtual_attendance(user_id, joined_at);

-- ═══ 6. Recordings with access windows ═══
create table if not exists public.virtual_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.virtual_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  source text not null check (source in ('provider_url','file')),
  url text check (url is null or url ~ '^https://\S+$'),
  storage_path text check (storage_path is null or (storage_path !~ '\.\.' and length(storage_path) <= 500)),
  status text not null default 'processing',
  audience text not null default 'attendees' check (audience in ('attendees','registered','session_attendees','team')),
  access_from timestamptz,
  access_until timestamptz,
  captions boolean not null default false,
  transcript_path text check (transcript_path is null or (transcript_path !~ '\.\.' and length(transcript_path) <= 500)),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'provider_url' and url is not null) or (source = 'file' and storage_path is not null)),
  check (access_until is null or access_from is null or access_until > access_from)
);
create index if not exists virtual_recordings_session_idx on public.virtual_recordings(session_id, status);
drop trigger if exists virtual_recordings_touch on public.virtual_recordings;
create trigger virtual_recordings_touch before update on public.virtual_recordings for each row execute function public.ops_touch();
do $$ begin
  alter table public.virtual_attendance drop constraint if exists virtual_attendance_recording_fk;
  alter table public.virtual_attendance add constraint virtual_attendance_recording_fk foreign key (recording_id) references public.virtual_recordings(id) on delete set null;
end $$;

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('virtual_recording', 'virtual_recordings', 'status', 'enforce', array['processing','available'], array[]::text[])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'virtual_recording';
insert into public.state_transitions(machine, from_state, to_state) values
  ('virtual_recording','processing','available'), ('virtual_recording','processing','withdrawn'),
  ('virtual_recording','available','withdrawn'), ('virtual_recording','withdrawn','available');
drop trigger if exists virtual_recordings_state_guard on public.virtual_recordings;
create trigger virtual_recordings_state_guard before insert or update of status on public.virtual_recordings for each row execute function public.enforce_state_transition('virtual_recording', 'status');

-- ═══ 7. RLS + grants (secrets column-revoked) ═══
alter table public.virtual_sessions enable row level security;
alter table public.virtual_session_roles enable row level security;
alter table public.virtual_tier_access enable row level security;
alter table public.virtual_join_tokens enable row level security;
alter table public.virtual_attendance enable row level security;
alter table public.virtual_recordings enable row level security;
revoke all on table public.virtual_sessions, public.virtual_session_roles, public.virtual_tier_access, public.virtual_join_tokens,
  public.virtual_attendance, public.virtual_recordings from public, anon, authenticated;
grant all on table public.virtual_sessions, public.virtual_session_roles, public.virtual_tier_access, public.virtual_join_tokens,
  public.virtual_attendance, public.virtual_recordings to service_role;

drop policy if exists virtual_sessions_team on public.virtual_sessions;
create policy virtual_sessions_team on public.virtual_sessions for select to authenticated using (public.can_edit_event(event_id));
grant select (id, event_id, workspace_id, title, kind, track, parent_session_id, programme_item_id, starts_at, ends_at, status, provider, access, tier_ids,
  capacity, max_devices_per_attendee, opens_minutes_before, closes_minutes_after, captions, caption_languages, sign_language, transcript, audio_description,
  accessibility_notes, created_by, created_at, updated_at) on public.virtual_sessions to authenticated;

drop policy if exists virtual_session_roles_read on public.virtual_session_roles;
create policy virtual_session_roles_read on public.virtual_session_roles for select to authenticated using (public.can_edit_event(event_id) or user_id = (select auth.uid()));
grant select on public.virtual_session_roles to authenticated;

drop policy if exists virtual_tier_access_read on public.virtual_tier_access;
create policy virtual_tier_access_read on public.virtual_tier_access for select to authenticated using (public.can_access_event(event_id));
grant select on public.virtual_tier_access to authenticated;

drop policy if exists virtual_attendance_read on public.virtual_attendance;
create policy virtual_attendance_read on public.virtual_attendance for select to authenticated using (public.can_edit_event(event_id) or user_id = (select auth.uid()));
grant select (id, session_id, event_id, recording_id, user_id, ticket_id, registration_id, role, mode, joined_at, last_seen_at, left_at, left_reason, minutes)
  on public.virtual_attendance to authenticated;

drop policy if exists virtual_recordings_team on public.virtual_recordings;
create policy virtual_recordings_team on public.virtual_recordings for select to authenticated using (public.can_edit_event(event_id));
grant select (id, session_id, event_id, workspace_id, title, source, status, audience, access_from, access_until, captions, created_by, created_at, updated_at)
  on public.virtual_recordings to authenticated;

-- ═══ 8. Internal helpers ═══
-- Online entitlement for one ticket on one session (no window check). Returns null when entitled, else the reason.
create or replace function public.virtual_ticket_refusal(p_session uuid, p_ticket uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s public.virtual_sessions; t public.tickets; m text;
begin
  select * into s from public.virtual_sessions where id = p_session;
  select * into t from public.tickets where id = p_ticket;
  if not found or t.event_id <> s.event_id or t.holder_id is distinct from p_user then return 'not_your_ticket'; end if;
  if t.status not in ('valid','used') then return t.status; end if;
  if s.access not in ('ticket','ticket_or_registration') then return 'ticket_not_accepted'; end if;
  select a.mode into m from public.virtual_tier_access a where a.tier_id = t.tier_id;
  if m = 'in_person' then return 'in_person_ticket'; end if;
  if cardinality(s.tier_ids) > 0 and not (t.tier_id = any (s.tier_ids)) then return 'tier_not_included'; end if;
  return null;
end $$;

-- Session role of the user: 'team' for event editors, else an active named role, else null.
create or replace function public.virtual_session_role(p_session uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'team' from public.virtual_sessions s where s.id = p_session and p_user = (select auth.uid()) and public.can_edit_event(s.event_id)),
    (select r.role from public.virtual_session_roles r where r.session_id = p_session and r.user_id = p_user and r.status = 'active'
       order by case r.role when 'host' then 0 when 'producer' then 1 when 'moderator' then 2 else 3 end limit 1));
$$;

-- Closes open attendance rows (minutes from join to last activity).
create or replace function public.virtual_close_attendance(p_where_ticket uuid, p_where_registration uuid, p_where_session uuid, p_where_user uuid, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.virtual_attendance a set left_at = now(), left_reason = p_reason,
      minutes = round((extract(epoch from (greatest(a.last_seen_at, a.joined_at) - a.joined_at)) / 60)::numeric, 1)
    where a.left_at is null
      and (p_where_ticket is null or a.ticket_id = p_where_ticket)
      and (p_where_registration is null or a.registration_id = p_where_registration)
      and (p_where_session is null or a.session_id = p_where_session)
      and (p_where_user is null or a.user_id = p_where_user)
      and coalesce(p_where_ticket, p_where_registration, p_where_session, p_where_user) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ═══ 9. Organiser commands ═══
create or replace function public.virtual_session_save(p_event uuid, p jsonb, p_session uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; s public.virtual_sessions; uid uuid := (select auth.uid()); tiers uuid[]; sid uuid;
  link_ok constant text := '^https://\S+$';
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_session is not null then
    select * into s from public.virtual_sessions where id = p_session and event_id = p_event for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if p ? 'tier_ids' then
    select coalesce(array_agg(distinct x::uuid), '{}') into tiers from jsonb_array_elements_text(coalesce(p -> 'tier_ids', '[]')) x;
    if exists (select 1 from unnest(tiers) t where not exists (select 1 from public.ticket_tiers tt where tt.id = t and tt.event_id = p_event)) then
      raise exception 'tier_not_in_event' using errcode = '22023'; end if;
  end if;
  if nullif(p ->> 'programme_item_id', '') is not null and not exists (select 1 from public.programme_items x where x.id = (p ->> 'programme_item_id')::uuid and x.event_id = p_event) then
    raise exception 'programme_item_not_in_event' using errcode = '22023'; end if;
  if nullif(p ->> 'parent_session_id', '') is not null and not exists (select 1 from public.virtual_sessions x where x.id = (p ->> 'parent_session_id')::uuid and x.event_id = p_event and x.id is distinct from p_session) then
    raise exception 'parent_not_in_event' using errcode = '22023'; end if;
  if exists (select 1 from unnest(array['join_url','speaker_url','host_url']) k where nullif(p ->> k, '') is not null and (p ->> k) !~ link_ok) then
    raise exception 'links_must_be_https' using errcode = '22023'; end if;

  if p_session is null then
    insert into public.virtual_sessions(event_id, workspace_id, title, kind, track, parent_session_id, programme_item_id, starts_at, ends_at, status, provider,
      external_meeting_id, join_url, speaker_url, host_url, host_secret_note, access, tier_ids, capacity, max_devices_per_attendee, opens_minutes_before,
      closes_minutes_after, captions, caption_languages, sign_language, transcript, audio_description, accessibility_notes, created_by)
    values (p_event, e.workspace_id, trim(p ->> 'title'), coalesce(nullif(p ->> 'kind', ''), 'main'), nullif(p ->> 'track', ''), nullif(p ->> 'parent_session_id', '')::uuid,
      nullif(p ->> 'programme_item_id', '')::uuid, (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz,
      case when p ->> 'status' = 'draft' then 'draft' else 'scheduled' end, coalesce(nullif(p ->> 'provider', ''), 'manual'), nullif(p ->> 'external_meeting_id', ''),
      nullif(p ->> 'join_url', ''), nullif(p ->> 'speaker_url', ''), nullif(p ->> 'host_url', ''), nullif(p ->> 'host_secret_note', ''),
      coalesce(nullif(p ->> 'access', ''), 'ticket'), coalesce(tiers, '{}'), nullif(p ->> 'capacity', '')::int, coalesce(nullif(p ->> 'max_devices_per_attendee', '')::int, 1),
      coalesce(nullif(p ->> 'opens_minutes_before', '')::int, 15), coalesce(nullif(p ->> 'closes_minutes_after', '')::int, 30), coalesce(nullif(p ->> 'captions', ''), 'none'),
      coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(p -> 'caption_languages', '[]')) x), '{}'),
      coalesce((p ->> 'sign_language')::boolean, false), coalesce((p ->> 'transcript')::boolean, false), coalesce((p ->> 'audio_description')::boolean, false),
      nullif(p ->> 'accessibility_notes', ''), uid)
    returning id into sid;
  else
    -- Secrets are kept unless the key is present ('' clears it), so editing the schedule never wipes the links.
    update public.virtual_sessions x set
      title = coalesce(nullif(trim(p ->> 'title'), ''), x.title), kind = coalesce(nullif(p ->> 'kind', ''), x.kind),
      track = case when p ? 'track' then nullif(p ->> 'track', '') else x.track end,
      parent_session_id = case when p ? 'parent_session_id' then nullif(p ->> 'parent_session_id', '')::uuid else x.parent_session_id end,
      programme_item_id = case when p ? 'programme_item_id' then nullif(p ->> 'programme_item_id', '')::uuid else x.programme_item_id end,
      starts_at = coalesce((p ->> 'starts_at')::timestamptz, x.starts_at), ends_at = coalesce((p ->> 'ends_at')::timestamptz, x.ends_at),
      provider = coalesce(nullif(p ->> 'provider', ''), x.provider),
      external_meeting_id = case when p ? 'external_meeting_id' then nullif(p ->> 'external_meeting_id', '') else x.external_meeting_id end,
      join_url = case when p ? 'join_url' then nullif(p ->> 'join_url', '') else x.join_url end,
      speaker_url = case when p ? 'speaker_url' then nullif(p ->> 'speaker_url', '') else x.speaker_url end,
      host_url = case when p ? 'host_url' then nullif(p ->> 'host_url', '') else x.host_url end,
      host_secret_note = case when p ? 'host_secret_note' then nullif(p ->> 'host_secret_note', '') else x.host_secret_note end,
      access = coalesce(nullif(p ->> 'access', ''), x.access), tier_ids = coalesce(tiers, x.tier_ids),
      capacity = case when p ? 'capacity' then nullif(p ->> 'capacity', '')::int else x.capacity end,
      max_devices_per_attendee = coalesce(nullif(p ->> 'max_devices_per_attendee', '')::int, x.max_devices_per_attendee),
      opens_minutes_before = coalesce(nullif(p ->> 'opens_minutes_before', '')::int, x.opens_minutes_before),
      closes_minutes_after = coalesce(nullif(p ->> 'closes_minutes_after', '')::int, x.closes_minutes_after),
      captions = coalesce(nullif(p ->> 'captions', ''), x.captions),
      caption_languages = case when p ? 'caption_languages' then coalesce((select array_agg(lower(y)) from jsonb_array_elements_text(p -> 'caption_languages') y), '{}') else x.caption_languages end,
      sign_language = coalesce((p ->> 'sign_language')::boolean, x.sign_language), transcript = coalesce((p ->> 'transcript')::boolean, x.transcript),
      audio_description = coalesce((p ->> 'audio_description')::boolean, x.audio_description),
      accessibility_notes = case when p ? 'accessibility_notes' then nullif(p ->> 'accessibility_notes', '') else x.accessibility_notes end
    where x.id = p_session returning id into sid;
  end if;
  update public.events set settings = jsonb_set(coalesce(settings, '{}'), '{virtual}', 'true') where id = p_event and coalesce(settings ->> 'virtual', '') <> 'true';
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', e.workspace_id, 'virtual.session_saved', jsonb_build_object('event_id', p_event, 'session_id', sid, 'created', p_session is null));
  return jsonb_build_object('id', sid);
end $$;

create or replace function public.virtual_session_transition(p_session uuid, p_to text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; uid uuid := (select auth.uid()); r jsonb;
begin
  select * into s from public.virtual_sessions where id = p_session for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', s.status); end if;
  r := public.transition_state('virtual_session', p_session, p_to, s.status, uid, 'user', left(p_reason, 500), null);
  if p_to in ('ended','cancelled','archived') then
    update public.virtual_join_tokens set revoked_at = now(), revoke_reason = 'session_closed' where session_id = p_session and used_at is null and revoked_at is null;
    perform public.virtual_close_attendance(null, null, p_session, null, 'ended');
  end if;
  return r;
end $$;

create or replace function public.virtual_session_links(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; uid uuid := (select auth.uid());
begin
  select * into s from public.virtual_sessions where id = p_session;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', s.workspace_id, 'virtual.host_links_viewed', jsonb_build_object('event_id', s.event_id, 'session_id', s.id));
  return jsonb_build_object('join_url', s.join_url, 'speaker_url', s.speaker_url, 'host_url', s.host_url, 'host_secret_note', s.host_secret_note, 'external_meeting_id', s.external_meeting_id);
end $$;

create or replace function public.virtual_role_assign(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; uid uuid := (select auth.uid()); target uuid; rid uuid; rl text := coalesce(p ->> 'role', 'speaker');
begin
  select * into s from public.virtual_sessions where id = p_session;
  if not found or not public.can_manage_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if rl not in ('speaker','moderator','host','producer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  target := nullif(p ->> 'user_id', '')::uuid;
  if target is null and nullif(p ->> 'email', '') is not null then
    select u.id into target from auth.users u where lower(u.email) = lower(trim(p ->> 'email')) limit 1;
  end if;
  if target is null or not exists (select 1 from auth.users u where u.id = target) then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.virtual_session_roles(session_id, event_id, user_id, role, status, display_name, assigned_by)
    values (p_session, s.event_id, target, rl, 'active', nullif(p ->> 'display_name', ''), uid)
    on conflict (session_id, user_id, role) do update set status = 'active', revoked_at = null, display_name = coalesce(excluded.display_name, public.virtual_session_roles.display_name), assigned_by = excluded.assigned_by
    returning id into rid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', s.workspace_id, 'virtual.role_changed', jsonb_build_object('event_id', s.event_id, 'session_id', s.id, 'role_id', rid, 'role', rl, 'status', 'active'));
  return jsonb_build_object('id', rid, 'user_id', target, 'role', rl);
end $$;

create or replace function public.virtual_role_revoke(p_role uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.virtual_session_roles; uid uuid := (select auth.uid()); ws uuid;
begin
  select * into r from public.virtual_session_roles where id = p_role for update;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.virtual_session_roles set status = 'revoked', revoked_at = now() where id = p_role and status = 'active';
  update public.virtual_join_tokens set revoked_at = now(), revoke_reason = 'role_revoked'
    where session_id = r.session_id and user_id = r.user_id and role = r.role and used_at is null and revoked_at is null;
  update public.virtual_attendance a set left_at = now(), left_reason = 'revoked', minutes = round((extract(epoch from (greatest(a.last_seen_at, a.joined_at) - a.joined_at)) / 60)::numeric, 1)
    where a.session_id = r.session_id and a.user_id = r.user_id and a.role = r.role and a.left_at is null;
  select workspace_id into ws from public.events where id = r.event_id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', ws, 'virtual.role_changed', jsonb_build_object('event_id', r.event_id, 'session_id', r.session_id, 'role_id', r.id, 'role', r.role, 'status', 'revoked'));
  return jsonb_build_object('ok', true);
end $$;

-- Hybrid capacity: online tiers ≤ event_virtual.capacity, in-person tiers ≤ events.capacity (hybrid tiers count in both).
create or replace function public.virtual_capacity_check(p_event uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare online_cap integer; venue_cap integer; online_qty bigint; venue_qty bigint;
begin
  if not exists (select 1 from public.virtual_tier_access where event_id = p_event) then return; end if;
  select v.capacity into online_cap from public.event_virtual v where v.event_id = p_event;
  select nullif(e.capacity, 0) into venue_cap from public.events e where e.id = p_event;
  select coalesce(sum(t.quantity) filter (where a.mode in ('online','hybrid')), 0), coalesce(sum(t.quantity) filter (where a.mode in ('in_person','hybrid')), 0)
    into online_qty, venue_qty
    from public.virtual_tier_access a join public.ticket_tiers t on t.id = a.tier_id where a.event_id = p_event and t.status not in ('cancelled','archived');
  if online_cap is not null and online_qty > online_cap then
    raise exception 'online_capacity_exceeded: % online places on sale, online capacity is %', online_qty, online_cap using errcode = '23514'; end if;
  if venue_cap is not null and venue_qty > venue_cap then
    raise exception 'in_person_capacity_exceeded: % in-person places on sale, venue capacity is %', venue_qty, venue_cap using errcode = '23514'; end if;
end $$;

create or replace function public.virtual_tier_mode_set(p_tier uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.ticket_tiers; uid uuid := (select auth.uid()); ws uuid;
begin
  select * into t from public.ticket_tiers where id = p_tier;
  if not found or not public.can_edit_event(t.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_mode is null or p_mode = '' then delete from public.virtual_tier_access where tier_id = p_tier;
  else
    if p_mode not in ('in_person','online','hybrid') then raise exception 'invalid_mode' using errcode = '22023'; end if;
    insert into public.virtual_tier_access(tier_id, event_id, mode, updated_by) values (p_tier, t.event_id, p_mode, uid)
      on conflict (tier_id) do update set mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.virtual_capacity_check(t.event_id);
  select workspace_id into ws from public.events where id = t.event_id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', ws, 'virtual.tier_mode_set', jsonb_build_object('event_id', t.event_id, 'tier_id', p_tier, 'mode', nullif(p_mode, '')));
  return jsonb_build_object('tier_id', p_tier, 'mode', nullif(p_mode, ''));
end $$;

-- A moded tier's quantity can't grow past its capacity pool (tiers without a mode row are untouched).
create or replace function public.trg_virtual_tier_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity is distinct from old.quantity and exists (select 1 from public.virtual_tier_access a where a.tier_id = new.id) and new.quantity > old.quantity then
    perform public.virtual_capacity_check(new.event_id);
  end if;
  return null;
end $$;
drop trigger if exists ticket_tiers_virtual_capacity on public.ticket_tiers;
create trigger ticket_tiers_virtual_capacity after update of quantity on public.ticket_tiers for each row execute function public.trg_virtual_tier_capacity();

-- ═══ 10. Attendee access: join tokens ═══
create or replace function public.virtual_issue_join_token(p_session uuid, p_device text, p_ticket uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; e public.events; uid uuid := (select auth.uid()); rl text; tk uuid; reg uuid; why text; cv integer;
  opens timestamptz; closes timestamptz; raw text; active_devices integer; open_entitlements integer; link text;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{8,64}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_device'); end if;
  if not public.hit_rate_limit('virtual_join:' || uid::text, 30, 60) then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;
  select * into s from public.virtual_sessions where id = p_session;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_virtual_access'); end if;
  select * into e from public.events where id = s.event_id;
  if s.status in ('draft','cancelled','archived') then return jsonb_build_object('ok', false, 'reason', case s.status when 'draft' then 'no_virtual_access' else 'cancelled' end); end if;
  if e.status in ('cancelled','postponed','suspended') then return jsonb_build_object('ok', false, 'reason', e.status); end if;

  rl := public.virtual_session_role(p_session, uid);
  if rl is null then
    -- Attendee: a ticket (given or the first eligible one), else an approved registration.
    if p_ticket is not null then
      why := public.virtual_ticket_refusal(p_session, p_ticket, uid);
      if why is not null then return jsonb_build_object('ok', false, 'reason', why); end if;
      tk := p_ticket;
    else
      select t.id into tk from public.tickets t where t.event_id = s.event_id and t.holder_id = uid and t.status in ('valid','used')
        and public.virtual_ticket_refusal(p_session, t.id, uid) is null order by t.created_at limit 1;
    end if;
    if tk is null and s.access in ('registration','ticket_or_registration') then
      select r.id into reg from public.registrations r where r.event_id = s.event_id and r.user_id = uid and r.status = 'approved' order by r.created_at limit 1;
    end if;
    if tk is null and reg is null then
      return jsonb_build_object('ok', false, 'reason', case when s.access = 'invite_only' then 'invite_only' else 'no_entitlement' end);
    end if;
    rl := 'attendee';
    select t.credential_version into cv from public.tickets t where t.id = tk;
  end if;

  opens := s.starts_at - case when rl = 'attendee' or rl = 'speaker' then make_interval(mins => s.opens_minutes_before) else interval '2 hours' end;
  closes := s.ends_at + make_interval(mins => s.closes_minutes_after);
  if now() < opens then return jsonb_build_object('ok', false, 'reason', 'not_open_yet', 'opens_at', opens); end if;
  if now() > closes or s.status = 'ended' then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  link := case rl when 'attendee' then s.join_url when 'speaker' then coalesce(s.speaker_url, s.join_url) else coalesce(s.host_url, s.speaker_url, s.join_url) end;
  if link is null then return jsonb_build_object('ok', false, 'reason', 'no_stream_link'); end if;

  if rl = 'attendee' then
    -- Device limit per entitlement (open rows seen in the last 2 minutes), then session capacity.
    select count(distinct a.device_id) into active_devices from public.virtual_attendance a
      where a.session_id = p_session and a.mode = 'live' and a.left_at is null and a.last_seen_at > now() - interval '2 minutes'
        and ((tk is not null and a.ticket_id = tk) or (reg is not null and a.registration_id = reg)) and a.device_id is distinct from p_device;
    if active_devices >= s.max_devices_per_attendee then return jsonb_build_object('ok', false, 'reason', 'device_limit', 'max_devices', s.max_devices_per_attendee); end if;
    if s.capacity is not null then
      select count(distinct coalesce(a.ticket_id, a.registration_id)) into open_entitlements from public.virtual_attendance a
        where a.session_id = p_session and a.mode = 'live' and a.role = 'attendee' and a.left_at is null and a.last_seen_at > now() - interval '2 minutes'
          and coalesce(a.ticket_id, a.registration_id) is distinct from coalesce(tk, reg);
      if open_entitlements >= s.capacity then return jsonb_build_object('ok', false, 'reason', 'session_full'); end if;
    end if;
  end if;

  -- Rotation: earlier unused tokens for this user + session + device die.
  update public.virtual_join_tokens set revoked_at = now(), revoke_reason = 'rotated'
    where session_id = p_session and user_id = uid and device_id = p_device and used_at is null and revoked_at is null;
  raw := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.virtual_join_tokens(session_id, event_id, user_id, ticket_id, registration_id, role, credential_version, device_id, token_hash, expires_at)
    values (p_session, s.event_id, uid, tk, reg, rl, cv, p_device, encode(extensions.digest(raw, 'sha256'), 'hex'), now() + interval '2 minutes');
  return jsonb_build_object('ok', true, 'token', raw, 'role', rl, 'expires_at', now() + interval '2 minutes');
end $$;

create or replace function public.virtual_redeem_join_token(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.virtual_join_tokens; s public.virtual_sessions; e public.events; t public.tickets; uid uuid := (select auth.uid()); att uuid; link text; why text;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_token'); end if;
  select * into j from public.virtual_join_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or j.user_id <> uid then return jsonb_build_object('ok', false, 'reason', 'invalid_token'); end if;
  if j.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'token_revoked'); end if;
  if j.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'token_used'); end if;
  if j.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'token_expired'); end if;
  if j.device_id is distinct from p_device then return jsonb_build_object('ok', false, 'reason', 'wrong_device'); end if;
  select * into s from public.virtual_sessions where id = j.session_id;
  select * into e from public.events where id = j.event_id;
  if s.status in ('draft','cancelled','archived','ended') or e.status in ('cancelled','postponed','suspended') then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  -- Re-validate the entitlement at redemption time.
  if j.role = 'attendee' then
    if j.ticket_id is not null then
      select * into t from public.tickets where id = j.ticket_id;
      if t.credential_version is distinct from j.credential_version then return jsonb_build_object('ok', false, 'reason', 'ticket_changed'); end if;
      why := public.virtual_ticket_refusal(j.session_id, j.ticket_id, uid);
      if why is not null then return jsonb_build_object('ok', false, 'reason', why); end if;
    elsif not exists (select 1 from public.registrations r where r.id = j.registration_id and r.user_id = uid and r.status = 'approved') then
      return jsonb_build_object('ok', false, 'reason', 'registration_changed');
    end if;
  elsif j.role is distinct from public.virtual_session_role(j.session_id, uid) and not (j.role <> 'team' and exists (
      select 1 from public.virtual_session_roles r where r.session_id = j.session_id and r.user_id = uid and r.role = j.role and r.status = 'active')) then
    return jsonb_build_object('ok', false, 'reason', 'role_revoked');
  end if;
  link := case j.role when 'attendee' then s.join_url when 'speaker' then coalesce(s.speaker_url, s.join_url) else coalesce(s.host_url, s.speaker_url, s.join_url) end;
  if link is null then return jsonb_build_object('ok', false, 'reason', 'no_stream_link'); end if;

  update public.virtual_join_tokens set used_at = now() where id = j.id;
  update public.virtual_attendance a set left_at = now(), left_reason = 'rejoined', minutes = round((extract(epoch from (greatest(a.last_seen_at, a.joined_at) - a.joined_at)) / 60)::numeric, 1)
    where a.session_id = j.session_id and a.user_id = uid and a.device_id = j.device_id and a.mode = 'live' and a.left_at is null;
  insert into public.virtual_attendance(session_id, event_id, token_id, user_id, ticket_id, registration_id, role, mode, device_id)
    values (j.session_id, j.event_id, j.id, uid, j.ticket_id, j.registration_id, j.role, 'live', j.device_id) returning id into att;
  if j.ticket_id is not null then
    insert into public.check_ins(ticket_id, event_id, scanned_by, result, credential, device)
      select t2.id, t2.event_id, uid, case when t2.status = 'used' then 'readmitted' else 'admitted' end, 'virtual', 'virtual-join'
      from public.tickets t2 where t2.id = j.ticket_id and not exists (select 1 from public.check_ins c where c.ticket_id = t2.id and c.credential = 'virtual');
    update public.tickets set status = 'used', checked_in_at = coalesce(checked_in_at, now()) where id = j.ticket_id and status = 'valid';
  end if;
  return jsonb_build_object('ok', true, 'url', link, 'mode', 'live', 'role', j.role, 'attendance_id', att);
end $$;

create or replace function public.virtual_heartbeat(p_attendance uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.virtual_attendance;
begin
  select * into a from public.virtual_attendance where id = p_attendance and user_id = (select auth.uid()) for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.left_at is not null then return jsonb_build_object('ok', false, 'reason', coalesce(a.left_reason, 'left')); end if;
  update public.virtual_attendance set last_seen_at = now() where id = p_attendance;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.virtual_leave(p_attendance uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.virtual_attendance; m numeric;
begin
  select * into a from public.virtual_attendance where id = p_attendance and user_id = (select auth.uid()) for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.left_at is null then
    m := round((extract(epoch from (now() - a.joined_at)) / 60)::numeric, 1);
    update public.virtual_attendance set left_at = now(), last_seen_at = now(), left_reason = 'left', minutes = m where id = p_attendance;
  end if;
  return jsonb_build_object('ok', true, 'minutes', coalesce(m, a.minutes));
end $$;

-- Service only: provider-reported join/leave (adapter webhooks / polling). p: {external_participant, user_id?, joined_at, left_at?}
create or replace function public.virtual_record_provider_attendance(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; j timestamptz := coalesce((p ->> 'joined_at')::timestamptz, now()); l timestamptz := (p ->> 'left_at')::timestamptz; aid uuid;
begin
  select * into s from public.virtual_sessions where id = p_session;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if nullif(p ->> 'external_participant', '') is null then raise exception 'external_participant_required' using errcode = '22023'; end if;
  insert into public.virtual_attendance(session_id, event_id, user_id, role, mode, external_participant, joined_at, last_seen_at, left_at, left_reason, minutes)
    values (p_session, s.event_id, nullif(p ->> 'user_id', '')::uuid, 'attendee', 'live', left(p ->> 'external_participant', 200), j, coalesce(l, j), l,
      case when l is not null then 'provider' end, case when l is not null then round((extract(epoch from (l - j)) / 60)::numeric, 1) end)
    returning virtual_attendance.id into aid;
  return jsonb_build_object('id', aid);
end $$;

-- Service only (cron every 5 min): stale live rows close as timeout at their last heartbeat.
create or replace function public.virtual_attendance_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.virtual_attendance a set left_at = a.last_seen_at, left_reason = 'timeout',
      minutes = round((extract(epoch from (a.last_seen_at - a.joined_at)) / 60)::numeric, 1)
    where a.left_at is null and a.external_participant is null and a.last_seen_at < now() - interval '5 minutes';
  get diagnostics n = row_count;
  return jsonb_build_object('closed', n);
end $$;

create or replace function public.virtual_attendance_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('session_id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'status', s.status,
      'unique_attendees', (select count(distinct coalesce(a.ticket_id::text, a.registration_id::text, a.user_id::text, a.external_participant)) from public.virtual_attendance a where a.session_id = s.id and a.mode = 'live' and a.role = 'attendee'),
      'joins', (select count(*) from public.virtual_attendance a where a.session_id = s.id and a.mode = 'live'),
      'online_now', (select count(*) from public.virtual_attendance a where a.session_id = s.id and a.mode = 'live' and a.left_at is null and a.last_seen_at > now() - interval '2 minutes'),
      'live_minutes', (select coalesce(sum(coalesce(a.minutes, round((extract(epoch from (a.last_seen_at - a.joined_at)) / 60)::numeric, 1))), 0) from public.virtual_attendance a where a.session_id = s.id and a.mode = 'live'),
      'replay_views', (select count(*) from public.virtual_attendance a where a.session_id = s.id and a.mode = 'replay'))
    order by s.starts_at) from public.virtual_sessions s where s.event_id = p_event), '[]');
end $$;

-- Attendee view of an event's sessions: entitlement + window, never a link.
create or replace function public.virtual_my_sessions(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'track', s.track, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
      'opens_at', s.starts_at - make_interval(mins => s.opens_minutes_before), 'closes_at', s.ends_at + make_interval(mins => s.closes_minutes_after),
      'role', coalesce(public.virtual_session_role(s.id, uid),
        case when exists (select 1 from public.tickets t where t.event_id = s.event_id and t.holder_id = uid and public.virtual_ticket_refusal(s.id, t.id, uid) is null)
               or (s.access in ('registration','ticket_or_registration') and exists (select 1 from public.registrations r where r.event_id = s.event_id and r.user_id = uid and r.status = 'approved'))
             then 'attendee' end),
      'captions', s.captions, 'caption_languages', s.caption_languages, 'sign_language', s.sign_language, 'transcript', s.transcript, 'audio_description', s.audio_description,
      'replays', (select count(*) from public.virtual_recordings v where v.session_id = s.id and v.status = 'available' and (v.access_from is null or v.access_from <= now()) and (v.access_until is null or v.access_until > now())))
    order by s.starts_at) from public.virtual_sessions s where s.event_id = p_event and s.status not in ('draft','archived')), '[]');
end $$;

-- ═══ 11. Recordings / replay ═══
create or replace function public.virtual_recording_save(p_session uuid, p jsonb, p_recording uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.virtual_sessions; uid uuid := (select auth.uid()); rid uuid; path text := nullif(p ->> 'storage_path', ''); tpath text := nullif(p ->> 'transcript_path', '');
begin
  select * into s from public.virtual_sessions where id = p_session;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- Files must already be private Q04 objects in the event's own workspace folder (or the editor's own folder for personal events).
  if exists (select 1 from unnest(array[path, tpath]) x where x is not null and not (x like coalesce(s.workspace_id::text, uid::text) || '/%')) then
    raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  if p_recording is null then
    insert into public.virtual_recordings(session_id, event_id, workspace_id, title, source, url, storage_path, status, audience, access_from, access_until, captions, transcript_path, created_by)
      values (p_session, s.event_id, s.workspace_id, coalesce(nullif(trim(p ->> 'title'), ''), s.title || ' (replay)'), case when path is not null then 'file' else 'provider_url' end,
        nullif(p ->> 'url', ''), path, case when p ->> 'status' = 'available' then 'available' else 'processing' end, coalesce(nullif(p ->> 'audience', ''), 'attendees'),
        nullif(p ->> 'access_from', '')::timestamptz, nullif(p ->> 'access_until', '')::timestamptz, coalesce((p ->> 'captions')::boolean, false), tpath, uid)
      returning id into rid;
  else
    update public.virtual_recordings v set title = coalesce(nullif(trim(p ->> 'title'), ''), v.title),
        url = case when p ? 'url' then nullif(p ->> 'url', '') else v.url end, storage_path = case when p ? 'storage_path' then path else v.storage_path end,
        source = case when (case when p ? 'storage_path' then path else v.storage_path end) is not null then 'file' else 'provider_url' end,
        audience = coalesce(nullif(p ->> 'audience', ''), v.audience),
        access_from = case when p ? 'access_from' then nullif(p ->> 'access_from', '')::timestamptz else v.access_from end,
        access_until = case when p ? 'access_until' then nullif(p ->> 'access_until', '')::timestamptz else v.access_until end,
        captions = coalesce((p ->> 'captions')::boolean, v.captions), transcript_path = case when p ? 'transcript_path' then tpath else v.transcript_path end
      where v.id = p_recording and v.session_id = p_session returning id into rid;
    if rid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', s.workspace_id, 'virtual.recording_saved', jsonb_build_object('event_id', s.event_id, 'session_id', s.id, 'recording_id', rid));
  return jsonb_build_object('id', rid);
end $$;

create or replace function public.virtual_recording_transition(p_recording uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.virtual_recordings;
begin
  select * into v from public.virtual_recordings where id = p_recording for update;
  if not found or not public.can_edit_event(v.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', v.status); end if;
  return public.transition_state('virtual_recording', p_recording, p_to, v.status, (select auth.uid()), 'user', null, null);
end $$;

-- Replay entitlement: team always; otherwise available + inside the access window + audience rule. Returns the URL or private path.
create or replace function public.virtual_replay_access(p_recording uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.virtual_recordings; s public.virtual_sessions; e public.events; uid uuid := (select auth.uid()); rl text; tk uuid; reg uuid; ok boolean := false; att uuid;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v from public.virtual_recordings where id = p_recording;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into s from public.virtual_sessions where id = v.session_id;
  select * into e from public.events where id = v.event_id;
  rl := public.virtual_session_role(v.session_id, uid);
  if rl is null then
    if v.status <> 'available' then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
    if v.access_from is not null and now() < v.access_from then return jsonb_build_object('ok', false, 'reason', 'not_open_yet', 'opens_at', v.access_from); end if;
    if v.access_until is not null and now() >= v.access_until then return jsonb_build_object('ok', false, 'reason', 'replay_expired'); end if;
    if e.status = 'suspended' then return jsonb_build_object('ok', false, 'reason', 'suspended'); end if;
    select t.id into tk from public.tickets t where t.event_id = v.event_id and t.holder_id = uid and t.status in ('valid','used')
      and public.virtual_ticket_refusal(v.session_id, t.id, uid) is null order by t.created_at limit 1;
    select r.id into reg from public.registrations r where r.event_id = v.event_id and r.user_id = uid and r.status = 'approved' limit 1;
    ok := case v.audience
      when 'team' then false
      when 'attendees' then tk is not null or (reg is not null and s.access in ('registration','ticket_or_registration'))
      when 'registered' then tk is not null or reg is not null
      when 'session_attendees' then exists (select 1 from public.virtual_attendance a where a.session_id = v.session_id and a.user_id = uid and a.mode = 'live')
                                     and (tk is not null or reg is not null) end;
    if not ok then return jsonb_build_object('ok', false, 'reason', 'no_entitlement'); end if;
    rl := 'attendee';
  end if;
  insert into public.virtual_attendance(session_id, event_id, recording_id, user_id, ticket_id, registration_id, role, mode)
    values (v.session_id, v.event_id, v.id, uid, tk, reg, rl, 'replay') returning id into att;
  return jsonb_build_object('ok', true, 'mode', 'replay', 'source', v.source, 'url', v.url, 'path', v.storage_path, 'title', v.title, 'attendance_id', att);
end $$;

-- ═══ 12. Revocation (Q21 credential rotation reused) ═══
create or replace function public.trg_tickets_virtual_revoke() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer; m integer; ws uuid;
begin
  if new.credential_version is distinct from old.credential_version or new.holder_id is distinct from old.holder_id or new.status not in ('valid','used') then
    update public.virtual_join_tokens set revoked_at = now(), revoke_reason = 'ticket_changed' where ticket_id = new.id and used_at is null and revoked_at is null;
    get diagnostics n = row_count;
    m := public.virtual_close_attendance(new.id, null, null, null, 'revoked');
    if n + m > 0 then
      select workspace_id into ws from public.events where id = new.event_id;
      perform public.emit_domain_event('virtual.access_revoked', ws, jsonb_build_object('event_id', new.event_id, 'ticket_id', new.id, 'reason', 'ticket_changed', 'tokens', n, 'sessions_closed', m),
        null, 'system', 'ticket', new.id::text, null, null);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists tickets_virtual_revoke on public.tickets;
create trigger tickets_virtual_revoke after update on public.tickets for each row
  when (new.credential_version is distinct from old.credential_version or new.holder_id is distinct from old.holder_id or new.status is distinct from old.status)
  execute function public.trg_tickets_virtual_revoke();

create or replace function public.trg_registrations_virtual_revoke() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer; m integer; ws uuid;
begin
  if new.status <> 'approved' or new.user_id is distinct from old.user_id then
    update public.virtual_join_tokens set revoked_at = now(), revoke_reason = 'registration_changed' where registration_id = new.id and used_at is null and revoked_at is null;
    get diagnostics n = row_count;
    m := public.virtual_close_attendance(null, new.id, null, null, 'revoked');
    if n + m > 0 then
      select workspace_id into ws from public.events where id = new.event_id;
      perform public.emit_domain_event('virtual.access_revoked', ws, jsonb_build_object('event_id', new.event_id, 'registration_id', new.id, 'reason', 'registration_changed', 'tokens', n, 'sessions_closed', m),
        null, 'system', 'registration', new.id::text, null, null);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists registrations_virtual_revoke on public.registrations;
create trigger registrations_virtual_revoke after update of status, user_id on public.registrations for each row
  when (old.status = 'approved' and (new.status is distinct from old.status or new.user_id is distinct from old.user_id))
  execute function public.trg_registrations_virtual_revoke();

-- ═══ 13. Public summary (same signature; still no URLs): sessions + accessibility flags + tier modes ═══
create or replace function public.event_virtual_public(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when v.event_id is null and not exists (select 1 from public.virtual_sessions s where s.event_id = e.id and s.status not in ('draft','archived')) then null
    else jsonb_build_object('format', v.format, 'provider', v.provider, 'ticket_required', coalesce(v.ticket_required, true), 'opens_minutes_before', v.opens_minutes_before,
      'replay_available', coalesce(v.replay_available and v.recording_url is not null, false)
        or exists (select 1 from public.virtual_recordings r where r.event_id = e.id and r.status = 'available' and r.audience <> 'team' and (r.access_until is null or r.access_until > now())),
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'track', s.track, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
          'captions', s.captions, 'caption_languages', s.caption_languages, 'sign_language', s.sign_language, 'transcript', s.transcript, 'audio_description', s.audio_description,
          'accessibility_notes', s.accessibility_notes) order by s.starts_at)
        from public.virtual_sessions s where s.event_id = e.id and s.status not in ('draft','archived')), '[]'),
      'tier_modes', coalesce((select jsonb_object_agg(a.tier_id, a.mode) from public.virtual_tier_access a where a.event_id = e.id), '{}'))
    end
  from public.events e left join public.event_virtual v on v.event_id = e.id
  where e.id = p_event and ((e.visibility = 'public' and e.status in ('published','on_sale','live','completed')) or public.can_access_event(e.id) or public.holds_ticket_for(e.id));
$$;

-- ═══ 14. Domain events, cron, grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('virtual.session_saved', 1, 'virtual_session', 'An online session was created or edited (payload: event_id, session_id, created).'),
  ('virtual_session.state_changed', 1, 'virtual_session', 'Machine transition of an online session.'),
  ('virtual.role_changed', 1, 'virtual_session', 'A speaker / moderator / host / producer role was assigned or revoked (payload: event_id, session_id, role_id, role, status).'),
  ('virtual.tier_mode_set', 1, 'ticket_tier', 'A ticket tier was set to in-person / online / hybrid (payload: event_id, tier_id, mode).'),
  ('virtual.access_revoked', 1, 'virtual_session', 'Online access ended because the ticket or registration changed (payload: event_id, ticket_id | registration_id, reason, tokens, sessions_closed).'),
  ('virtual.recording_saved', 1, 'virtual_recording', 'A session recording was added or edited (payload: event_id, session_id, recording_id).'),
  ('virtual_recording.state_changed', 1, 'virtual_recording', 'Machine transition of a session recording.')
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description;

do $$ begin
  perform cron.unschedule('virtual-attendance-sweep') where exists (select 1 from cron.job where jobname = 'virtual-attendance-sweep');
end $$;
select cron.schedule('virtual-attendance-sweep', '*/5 * * * *', $$select public.virtual_attendance_sweep() where exists (select 1 from public.virtual_attendance where left_at is null)$$);

revoke all on function public.virtual_ticket_refusal(uuid, uuid, uuid), public.virtual_session_role(uuid, uuid), public.virtual_close_attendance(uuid, uuid, uuid, uuid, text),
  public.virtual_capacity_check(uuid), public.trg_virtual_tier_capacity(), public.trg_tickets_virtual_revoke(), public.trg_registrations_virtual_revoke(),
  public.virtual_record_provider_attendance(uuid, jsonb), public.virtual_attendance_sweep() from public, anon, authenticated;
grant execute on function public.virtual_ticket_refusal(uuid, uuid, uuid), public.virtual_session_role(uuid, uuid), public.virtual_close_attendance(uuid, uuid, uuid, uuid, text),
  public.virtual_capacity_check(uuid), public.virtual_record_provider_attendance(uuid, jsonb), public.virtual_attendance_sweep() to service_role;
revoke all on function public.virtual_session_save(uuid, jsonb, uuid), public.virtual_session_transition(uuid, text, text), public.virtual_session_links(uuid),
  public.virtual_role_assign(uuid, jsonb), public.virtual_role_revoke(uuid), public.virtual_tier_mode_set(uuid, text), public.virtual_issue_join_token(uuid, text, uuid),
  public.virtual_redeem_join_token(text, text), public.virtual_heartbeat(uuid), public.virtual_leave(uuid), public.virtual_attendance_summary(uuid), public.virtual_my_sessions(uuid),
  public.virtual_recording_save(uuid, jsonb, uuid), public.virtual_recording_transition(uuid, text), public.virtual_replay_access(uuid) from public, anon;
grant execute on function public.virtual_session_save(uuid, jsonb, uuid), public.virtual_session_transition(uuid, text, text), public.virtual_session_links(uuid),
  public.virtual_role_assign(uuid, jsonb), public.virtual_role_revoke(uuid), public.virtual_tier_mode_set(uuid, text), public.virtual_issue_join_token(uuid, text, uuid),
  public.virtual_redeem_join_token(text, text), public.virtual_heartbeat(uuid), public.virtual_leave(uuid), public.virtual_attendance_summary(uuid), public.virtual_my_sessions(uuid),
  public.virtual_recording_save(uuid, jsonb, uuid), public.virtual_recording_transition(uuid, text), public.virtual_replay_access(uuid) to authenticated, service_role;
revoke all on function public.event_virtual_public(uuid) from public;
grant execute on function public.event_virtual_public(uuid) to anon, authenticated, service_role;
