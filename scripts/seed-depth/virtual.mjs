// Q29: virtual sessions with captions on the demo webinar and the hybrid Global Tech Conference — event_virtual (capacity),
// ticket tiers with tier modes (online / in_person / hybrid), speaker / moderator / host roles on demo identities, and one
// published recording with an access window. Commands: save_event_virtual, virtual_session_save, virtual_tier_mode_set,
// virtual_role_assign, virtual_recording_save / virtual_recording_transition. Meeting links are placeholder HTTPS URLs on the
// reserved example.com domain (no provider calls).
import { block } from "./lib.mjs";

const OWNER = "alex.events@example.com";

export async function run() {
  return block(`
  perform pg_temp._as('${OWNER}');
  -- Webinar (fully online)
  v := pg_temp._ev('future-of-live-events-webinar');
  if v is not null then
    if not exists (select 1 from public.event_virtual where event_id = v) then
      perform public.save_event_virtual(v, jsonb_build_object('provider', 'zoom', 'format', 'webinar', 'join_url', 'https://zoom.example.com/j/84512345678', 'timezone', 'Europe/London',
        'capacity', 500, 'ticket_required', true, 'opens_minutes_before', 15, 'closes_minutes_after', 15, 'replay_available', true,
        'replay_until', (select starts_at + interval '30 days' from public.events where id = v)));
      perform pg_temp._n('event_virtual');
    end if;
    if not exists (select 1 from public.ticket_tiers where event_id = v) then
      insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, status, sale_start, sale_end, order_limit, sort)
        values (v, 'Live access (free)', 'Join live with captions and Q&A; replay for 30 days.', 'general', 0, 450, 'on_sale', now() - interval '2 days', (select starts_at from public.events where id = v), 2, 1),
               (v, 'Live + workbook', 'Live access plus the downloadable trends workbook.', 'vip', 15, 50, 'on_sale', now() - interval '2 days', (select starts_at from public.events where id = v), 2, 2);
      perform pg_temp._n('tiers', 2);
    end if;
    for v2 in select id from public.ticket_tiers where event_id = v loop perform public.virtual_tier_mode_set(v2, 'online'); end loop;
    if not exists (select 1 from public.virtual_sessions where event_id = v) then
      r := public.virtual_session_save(v, jsonb_build_object('title', 'Future of Live Events 2027 — live briefing', 'kind', 'webinar', 'provider', 'zoom',
        'starts_at', (select starts_at from public.events where id = v), 'ends_at', (select starts_at + interval '70 minutes' from public.events where id = v),
        'external_meeting_id', '845 1234 5678', 'join_url', 'https://zoom.example.com/j/84512345678', 'speaker_url', 'https://zoom.example.com/s/84512345678', 'host_url', 'https://zoom.example.com/h/84512345678',
        'access', 'ticket', 'capacity', 500, 'max_devices_per_attendee', 2, 'opens_minutes_before', 15, 'closes_minutes_after', 10,
        'captions', 'live_human', 'caption_languages', jsonb_build_array('en'), 'sign_language', true, 'transcript', true, 'accessibility_notes', 'Live human captions (CART) and BSL interpreter on screen.',
        'status', 'scheduled'), null);
      r := public.virtual_session_save(v, jsonb_build_object('title', 'Ask the panel — live Q&A', 'kind', 'breakout', 'provider', 'zoom',
        'starts_at', (select starts_at + interval '70 minutes' from public.events where id = v), 'ends_at', (select ends_at from public.events where id = v),
        'external_meeting_id', '845 1234 5679', 'join_url', 'https://zoom.example.com/j/84512345679', 'access', 'ticket', 'capacity', 300,
        'captions', 'live_auto', 'caption_languages', jsonb_build_array('en'), 'transcript', true, 'status', 'scheduled'), null);
      perform pg_temp._n('virtual_sessions', 2);
    end if;
    v2 := (select id from public.virtual_sessions where event_id = v and kind = 'webinar' limit 1);
    if not exists (select 1 from public.virtual_session_roles where session_id = v2) then
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'host', 'email', 'alex.events@example.com', 'display_name', 'Alex Thomas (host)'));
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'moderator', 'email', 'ops.lead.demo@example.com', 'display_name', 'Priya Nair'));
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'speaker', 'email', 'james.carter@example.com', 'display_name', 'James Carter'));
      perform pg_temp._n('virtual_roles', 3);
    end if;
  end if;

  -- Hybrid conference: in-person + online tiers, streamed keynote with captions, published replay with an access window
  v := pg_temp._ev('global-tech-conference');
  if v is not null then
    if not exists (select 1 from public.event_virtual where event_id = v) then
      perform public.save_event_virtual(v, jsonb_build_object('provider', 'youtube_live', 'format', 'hybrid', 'join_url', 'https://stream.example.com/gtc27', 'timezone', 'Europe/London',
        'capacity', 2600, 'ticket_required', true, 'opens_minutes_before', 30, 'closes_minutes_after', 30, 'replay_available', true));
      perform pg_temp._n('event_virtual');
    end if;
    if not exists (select 1 from public.ticket_tiers where event_id = v) then
      insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, status, sale_start, sale_end, order_limit, sort)
        values (v, 'In-person delegate', 'Two days at ExCeL London, lunch included.', 'general', 349, 900, 'draft', now(), (select starts_at from public.events where id = v), 4, 1),
               (v, 'Online pass', 'All main-stage sessions live and on demand.', 'general', 79, 2500, 'draft', now(), (select starts_at from public.events where id = v), 4, 2),
               (v, 'Hybrid VIP', 'In person plus online replays and the speaker dinner.', 'vip', 649, 60, 'draft', now(), (select starts_at from public.events where id = v), 2, 3);
      perform pg_temp._n('tiers', 3);
    end if;
    perform public.virtual_tier_mode_set((select id from public.ticket_tiers where event_id = v and name = 'In-person delegate'), 'in_person');
    perform public.virtual_tier_mode_set((select id from public.ticket_tiers where event_id = v and name = 'Online pass'), 'online');
    perform public.virtual_tier_mode_set((select id from public.ticket_tiers where event_id = v and name = 'Hybrid VIP'), 'hybrid');
    if not exists (select 1 from public.virtual_sessions where event_id = v) then
      r := public.virtual_session_save(v, jsonb_build_object('title', 'Opening keynote: Building trustworthy AI', 'kind', 'main', 'track', 'Main stage', 'provider', 'youtube_live',
        'starts_at', (select starts_at + interval '1 hour' from public.events where id = v), 'ends_at', (select starts_at + interval '2 hours' from public.events where id = v),
        'external_meeting_id', 'gtc27-keynote', 'join_url', 'https://stream.example.com/gtc27/keynote', 'access', 'ticket', 'capacity', 2500,
        'tier_ids', (select jsonb_agg(id) from public.ticket_tiers where event_id = v and name in ('Online pass', 'Hybrid VIP')),
        'captions', 'live_human', 'caption_languages', jsonb_build_array('en', 'de'), 'transcript', true, 'status', 'scheduled'), null);
      perform pg_temp._n('virtual_sessions');
    end if;
    v2 := (select id from public.virtual_sessions where event_id = v and kind = 'main' order by created_at limit 1);
    if not exists (select 1 from public.virtual_session_roles where session_id = v2) then
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'speaker', 'email', 'ops.lead.demo@example.com', 'display_name', 'Dr Amara Okoye'));
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'moderator', 'email', 'james.carter@example.com', 'display_name', 'James Carter'));
      perform public.virtual_role_assign(v2, jsonb_build_object('role', 'producer', 'email', 'alex.events@example.com', 'display_name', 'Alex Thomas'));
      perform pg_temp._n('virtual_roles', 3);
    end if;
    if not exists (select 1 from public.virtual_recordings where session_id = v2) then
      r := public.virtual_recording_save(v2, jsonb_build_object('title', 'Opening keynote — replay', 'url', 'https://stream.example.com/gtc27/keynote/replay',
        'audience', 'attendees', 'access_from', (select starts_at + interval '3 hours' from public.events where id = v), 'access_until', (select starts_at + interval '60 days' from public.events where id = v),
        'captions', true), null);
      v2 := (select id from public.virtual_recordings where session_id = (select id from public.virtual_sessions where event_id = v and kind = 'main' order by created_at limit 1) limit 1);
      begin perform public.virtual_recording_transition(v2, 'available'); exception when others then perform pg_temp._n('recording_left_draft'); end;
      perform pg_temp._n('recordings');
    end if;
  end if;
  `);
}
