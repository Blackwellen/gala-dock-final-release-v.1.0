-- Virtual / webinar / live audio / hybrid events (release spec §122–127). No self-hosted media: Gala Dock stores the provider session and
-- gates access by ticket. Adapters: 'manual' (organiser pastes the provider's links) works now; API adapters (zoom, teams, youtube_live,
-- vimeo, streamyard, riverside, spotify_live) are declared for future integration and need provider credentials.
create table if not exists public.event_virtual (
  event_id uuid primary key references public.events(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','zoom','teams','google_meet','youtube_live','vimeo','streamyard','riverside','spotify_live','other')),
  format text not null default 'virtual' check (format in ('webinar','virtual','live_audio','podcast_recording','hybrid','remote_conference')),
  external_id text, session_id text,
  join_url text check (join_url is null or join_url ~ '^https://'),
  host_url text check (host_url is null or host_url ~ '^https://'),          -- private: never exposed to attendees
  host_notes text,                                                              -- private host metadata (passcodes etc.)
  timezone text not null default 'Europe/London',
  capacity integer check (capacity is null or capacity > 0),
  ticket_required boolean not null default true,
  opens_minutes_before integer not null default 30 check (opens_minutes_before between 0 and 1440),
  closes_minutes_after integer not null default 120 check (closes_minutes_after between 0 and 10080),
  recording_url text check (recording_url is null or recording_url ~ '^https://'),
  replay_available boolean not null default false,
  replay_until timestamptz,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.event_virtual enable row level security;
drop policy if exists event_virtual_editors on public.event_virtual;
create policy event_virtual_editors on public.event_virtual for select using (public.can_edit_event(event_id));

-- Allow virtual joins in the check-in log.
do $$ begin
  alter table public.check_ins drop constraint if exists check_ins_credential_check;
  alter table public.check_ins add constraint check_ins_credential_check check (credential in ('wallet','print','manual','legacy','virtual'));
end $$;

create or replace function public.save_event_virtual(p_event uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.event_virtual(event_id, provider, format, external_id, session_id, join_url, host_url, host_notes, timezone, capacity, ticket_required, opens_minutes_before,
    closes_minutes_after, recording_url, replay_available, replay_until, updated_by, updated_at)
  values (p_event, coalesce(p->>'provider', 'manual'), coalesce(p->>'format', 'virtual'), nullif(p->>'external_id', ''), nullif(p->>'session_id', ''), nullif(p->>'join_url', ''),
    nullif(p->>'host_url', ''), left(nullif(p->>'host_notes', ''), 2000), coalesce(nullif(p->>'timezone', ''), 'Europe/London'), nullif(p->>'capacity', '')::int,
    coalesce((p->>'ticket_required')::boolean, true), coalesce(nullif(p->>'opens_minutes_before', '')::int, 30), coalesce(nullif(p->>'closes_minutes_after', '')::int, 120),
    nullif(p->>'recording_url', ''), coalesce((p->>'replay_available')::boolean, false), nullif(p->>'replay_until', '')::timestamptz, auth.uid(), now())
  on conflict (event_id) do update set provider = excluded.provider, format = excluded.format, external_id = excluded.external_id, session_id = excluded.session_id,
    join_url = excluded.join_url, host_url = excluded.host_url, host_notes = excluded.host_notes, timezone = excluded.timezone, capacity = excluded.capacity,
    ticket_required = excluded.ticket_required, opens_minutes_before = excluded.opens_minutes_before, closes_minutes_after = excluded.closes_minutes_after,
    recording_url = excluded.recording_url, replay_available = excluded.replay_available, replay_until = excluded.replay_until, updated_by = excluded.updated_by, updated_at = now();
  update public.events set settings = jsonb_set(coalesce(settings, '{}'), '{virtual}', 'true') where id = p_event;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    select auth.uid(), 'user', e.workspace_id, 'event.virtual_updated', jsonb_build_object('event_id', p_event, 'provider', p->>'provider') from public.events e where e.id = p_event;
end $$;
revoke all on function public.save_event_virtual(uuid, jsonb) from public, anon;
grant execute on function public.save_event_virtual(uuid, jsonb) to authenticated;

-- Attendee access (§125): only the current holder of a valid ticket, only inside the access window (or replay period). Revoked, refunded,
-- transferred-away or resold tickets lose access automatically because the holder/status checks follow the ticket. Logs a virtual check-in.
create or replace function public.virtual_join(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; e public.events; v public.event_virtual; opens timestamptz; closes timestamptz;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found or t.holder_id is distinct from auth.uid() then return jsonb_build_object('ok', false, 'reason', 'not_your_ticket'); end if;
  if t.status not in ('valid','used') then return jsonb_build_object('ok', false, 'reason', t.status); end if;
  select * into e from public.events where id = t.event_id;
  select * into v from public.event_virtual where event_id = t.event_id;
  if not found or v.join_url is null then return jsonb_build_object('ok', false, 'reason', 'no_virtual_access'); end if;
  if e.status in ('cancelled','postponed') then return jsonb_build_object('ok', false, 'reason', e.status); end if;
  opens := e.starts_at - make_interval(mins => v.opens_minutes_before);
  closes := coalesce(e.ends_at, e.starts_at + interval '3 hours') + make_interval(mins => v.closes_minutes_after);
  if now() < opens then return jsonb_build_object('ok', false, 'reason', 'not_open_yet', 'opens_at', opens); end if;
  if now() > closes then
    if v.replay_available and v.recording_url is not null and (v.replay_until is null or now() < v.replay_until) then
      return jsonb_build_object('ok', true, 'url', v.recording_url, 'mode', 'replay');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;
  insert into public.check_ins(ticket_id, event_id, scanned_by, result, credential, device)
    values (t.id, t.event_id, auth.uid(), case when t.status = 'used' then 'readmitted' else 'admitted' end, 'virtual', 'virtual-join');
  update public.tickets set status = 'used', checked_in_at = coalesce(checked_in_at, now()) where id = t.id and status = 'valid';
  return jsonb_build_object('ok', true, 'url', v.join_url, 'mode', 'live');
end $$;
revoke all on function public.virtual_join(uuid) from public, anon;
grant execute on function public.virtual_join(uuid) to authenticated;

-- Public-safe summary for event pages (no URLs).
create or replace function public.event_virtual_public(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('format', v.format, 'provider', v.provider, 'ticket_required', v.ticket_required, 'opens_minutes_before', v.opens_minutes_before,
    'replay_available', v.replay_available and v.recording_url is not null) from public.event_virtual v where v.event_id = p_event;
$$;
revoke all on function public.event_virtual_public(uuid) from public;
grant execute on function public.event_virtual_public(uuid) to anon, authenticated, service_role;
