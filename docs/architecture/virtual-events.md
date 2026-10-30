# Virtual / webinar / hybrid (Q29, domains 181–184)

Migrations 202610293021 (model + access), 202610293022 (lifecycle "stream" precondition). Tests: `tests/release/q29-virtual-sessions.spec.ts` (8), `tests/release/virtual.spec.ts` (legacy API part).
Gala Dock never hosts real-time media: providers supply meetings, links, attendance and recordings; Gala Dock stores them and gates access.

## Model
- `event_virtual` (legacy, 202610270017): one event-level session; `virtual_join(ticket)` still serves events without sessions. `capacity` = online capacity.
- `virtual_sessions`: main / breakout / workshop / webinar / live_audio / podcast / remote / replay; `track`, `parent_session_id`, `programme_item_id`; provider + `external_meeting_id`; `join_url` (attendee), `speaker_url` (backstage), `host_url` + `host_secret_note` (host). Secret columns are column-revoked for every client; editors read them with `virtual_session_links(session)` (audited `virtual.host_links_viewed`). `access`: ticket | registration | ticket_or_registration | invite_only; `tier_ids`; `capacity`; `max_devices_per_attendee` (1–5); window `opens_minutes_before` / `closes_minutes_after`.
- Accessibility: `captions` (none / live_human / live_auto / post_event), `caption_languages`, `sign_language`, `transcript`, `audio_description`, `accessibility_notes` — public via `event_virtual_public`.
- Machine `virtual_session` (enforce): draft → scheduled → live → ended → archived; scheduled/live → cancelled; cancelled → scheduled. Ended/cancelled/archived revokes unused tokens and closes attendance.
- `virtual_session_roles`: speaker / moderator / host / producer (owner/manager assign; revoke ends tokens + attendance). Speakers get the backstage link; host-level roles and the event team get the host link.
- Hybrid: `virtual_tier_access(tier, in_person|online|hybrid)`. Online tiers ≤ `event_virtual.capacity`; in-person tiers ≤ `events.capacity`; checked on mode set and quantity growth. Tiers without a row keep legacy behaviour. In-person tickets can't join online.

## Access (domain 183)
1. `virtual_issue_join_token(session, device, ticket?)` — entitlement (team, active role, ticket holder with online-entitled tier, or approved registration); window (host roles: 2 h backstage); status; link present; device limit; capacity; 30/min rate limit. Earlier unused tokens for the same user+session+device are revoked. 48-hex token valid 2 minutes; only sha256 stored (`virtual_join_tokens`, service-only).
2. `virtual_redeem_join_token(token, device)` — same user + device, unused, unexpired, not revoked; re-validates ticket (incl. Q21 `credential_version`), registration or role; marks used; opens `virtual_attendance`; first ticket join logs a `virtual` check-in.
Routes: `/tickets/[id]/join[?session=]` (sessions first, legacy fallback), `/virtual/[session]/join`. Server-side issue+redeem, 303 redirect, no-store/no-referrer; device id = httpOnly cookie `gd_vdev`. Every refusal returns a reason code.

## Revocation
AFTER UPDATE triggers on tickets (Q21 rotation: refund, transfer, resale, cancel, holder change) and registrations (approved → other) revoke tokens, close attendance as `revoked`, emit `virtual.access_revoked`.

## Attendance
`virtual_attendance` (live|replay, minutes). `virtual_heartbeat`, `virtual_leave` (POST `/api/virtual/attendance/[id]`), `virtual_record_provider_attendance` (service), sweep pg_cron `virtual-attendance-sweep` every 5 min. `virtual_attendance_summary(event)` (team). `virtual_my_sessions` attendee view (no links).

## Recordings / replay
`virtual_recordings`: provider URL or private Q04 path in the event's workspace folder; machine `virtual_recording` processing → available ⇄ withdrawn; `access_from` / `access_until`; audience attendees | registered | session_attendees | team. `/virtual/replay/[id]`: provider redirect, or Q04 quarantine gate + 60 s signed URL; each view logged.

## Providers (BLOCKED_EXTERNAL)
`src/lib/virtual/adapters.ts` adapter interface + `/api/health` contracts.virtual. Manual links fully supported. Env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBHOOK_SECRET; MICROSOFT_CLIENT_ID/SECRET/TENANT_ID; GOOGLE_CALENDAR_CLIENT_ID/SECRET; YOUTUBE_CLIENT_ID/SECRET; VIMEO_ACCESS_TOKEN. No adapter ships; no provider call is made.

## Lifecycle
"stream" precondition satisfied by event_virtual links or any live session link/meeting id; events with sessions (not hybrid) count as online for the venue check.

## Open
UI (Plan › Online sessions, roles, tier modes, recordings, attendance); door scanner should refuse online-only tiers (`scan_admission`); provider adapters; demo seed (Q38).

## 2026-10-29 fix (migration 202610294030, lane D)
An online join never changes `tickets.status`: `virtual_redeem_join_token` / `virtual_join` record `virtual_attendance` plus one `virtual` check-in only, so tickets stay transferable/resellable and hybrid tickets are admitted at the door later. `scan_admission` ignores `credential='virtual'` for admissions, re-entry counts and offline reconciliation; online-only tiers still refused (`online_only_ticket`). `event_live_snapshot` entry excludes virtual (+ `entry.online`); `event_day_report` admissions exclude virtual. Repair: 0 live tickets needed restoring. New attendee read `virtual_my_replays(p_event?)` (no URLs/paths) — customer view no longer uses the service client. `/tickets/:id/join` and `/virtual/*` send `Referrer-Policy: no-referrer`. Tests: q29 11.
