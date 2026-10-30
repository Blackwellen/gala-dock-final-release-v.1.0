# Guests, registration, passes and check-in (Q18, domains 64–68)

Migrations 202610294011, 4013, 4014. Tests `tests/release/guests-access.spec.ts` (6). TS `src/lib/guests/access.ts`, `src/lib/tickets/scan.ts`.

## Guests (64)

`guests` (legacy, kept) + group_id, household_id, plus_one_of, is_child, guardian_id, rsvp_token_hash, rsvp_responded_at, rsvp_note, registration_id. `guest_groups` (group|household|table); households reserve seats with expiry, capped by event capacity under a lock. Child guests carry no email/phone.

RSVP: organiser `set_guest_rsvp_token(guest, sha256)` (plaintext only in `/rsvp/<token>`); guest answers via server action → service-only `guest_rsvp(...)` (rate-limited; plus-ones ≤ allowance, replaced as a set; closed once the event starts).

## Care data (GD-12)

`guest_care` (dietary, allergies, accessibility, notes, consent). Read/write: event owner + workspace owner/manager only; members, finance, door staff, providers see no rows. Providers/teams: `event_care_summary(event)` counts only. Children's events (`guest_privacy = 'minimised'`): free-text notes refused. Legacy `guests.dietary` is mirrored into guest_care on write but **still readable by all workspace members via the legacy guests policy** — UI should move to guest_care, then retire the column.

## Registration (65)

`registration_forms` (versioned; one published per event; published immutable; typed fields incl. sensitive; capacity, per-email limit, approval, waitlist, window). `registrations` machine `registration` (enforce): submitted → pending_approval | approved | waitlisted | rejected | cancelled; …; approved → cancelled. `submit_registration` (service-only via rate-limited server action; window/per-email/capacity under a lock; idempotent); sensitive answers → `registration_private`. `decide_registration` stores the decision; approval creates a confirmed guest.

## Zones, rules, passes, badges (66, 68)

`access_zones` (kind, capacity, window, re-entry allow|deny|limited), `access_rules` (zone ← tier or pass type, optional window), `access_passes` (7 pass types; revoking rotates the nonce), `badge_templates` (versioned; no email/phone/dietary/medical fields; prints audited). Commands only (direct writes refused).

## Scanner permission

`can_scan_event(event, zone)`: event owner; workspace role with new `checkin.scan` (owner/manager/member — **finance can no longer scan**); or an active `event_scanners` row for outside door staff (optional zones, expiry). Door staff see admission data only (emails masked).

## Check-in (67)

`check_ins` is the single write table for attendee admission (ticket, pass, guest list; zone, direction, credential, snapshot, client_scan_id, conflict, reason). View `public.checkins` = check_ins ∪ provider_checkins for reading (staff/supplier arrival stays Q17). `scan_admission(...)` — one row-locked transaction: permission → idempotent replay → status → session window → zone window/membership → re-entry → offline conflict → record + `ticket.scanned`. Deployed `scan_ticket` keeps its signature and delegates. Exit gate (zone/session rules enforced independently of the UI): met.

## Open

`/rsvp/[token]` and public registration pages; organiser UI for zones/passes/registration/scanner assignment; zone capacity counting at scan; retire `guests.dietary`.
