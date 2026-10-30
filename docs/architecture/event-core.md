# Event core (Q14, domains 32–44)

Migrations 202610294001–4006. Tests: `tests/release/event-core.spec.ts` (8).

One canonical row per event (`public.events`); customer, organiser, provider, admin and guest views are projections of it (RLS: owner/workspace members full row; providers via `is_provider_for_event`; ticket holders; anon + others only published/on_sale/live public rows; private guests via a token link).

## Lifecycle (machine `event`, enforce)

Spec → stored: Draft=draft · Planning/Sourcing=planning · Confirmed=ready · Selling=published/on_sale · Live=live · Completed=completed · Settling=closed · Archived=archived; branches cancelled, postponed, suspended. CHECK kept.

- Trigger `events_state_guard` (generated, enforce) rejects illegal jumps for every writer, service role included.
- `events_lifecycle_guard`: suspended only from on_sale/live or with an admin restriction; only Gala Dock / service role lifts `settings.admin_restriction`.
- Command `event_transition(event, to, expected?, reason?)`: events.write (owner/manager for cancel/postpone/suspend/archive), optimistic concurrency → `{ok:false, conflict, current}`, preconditions → `{ok:false, error:'preconditions', blockers}`, then `transition_state` (row lock, outbox `event.state_changed`), audit.
- `events_state_outbox`: direct writes also emit `event.state_changed` (payload.source='direct'); command writes emit once.
- TS: `src/lib/events/lifecycle.ts` `transitionEvent()`; actions setEventStatus / archiveEvent / eventBlockers.
- Still direct (skip type preconditions, state guard still applies): builders publish, ticket-setup, ticket-pro, customer `cancelMyEvent`/`archiveMyEvent`.

## Preconditions / event types (GD-12)

`event_type_profiles` (Q02 event_type keys; fallback `custom`; 11 types): online, requires_venue, requires_end, requires_capacity, requires_guests, requires_programme, public_listing_allowed, guest_privacy, modules. `event_lifecycle_blockers(event, to)` → [{key,label,fix}]: date (future for publish), end, venue (unless online), stream (online), capacity, guests, programme, public listing allowed (children's parties never public), on_sale tier + active payouts when paid, live within 36 h, completed after start, no valid tickets for cancel/archive.

## Duplicate to a new date

`duplicate_event(source, starts_local, timezone, confirm, name?, request_id?)` — one transaction; programme/run sheet/day plan, task due dates, tier sale/valid windows shifted by the new start; allow-listed settings only; never guests, tickets, orders, payments, bookings/holds, seats, shifts, incidents, files, links, venue confirmation, permits/insurance; tiers draft with sold=held=0; idempotent per request_id; audit + `event.duplicated`. UI: `useDuplicateDialog` (organiser HeroActions, TabActions, EventRowMenu). Customer `duplicateMyEvent` still has no date prompt.

## Programme

`programme_items` + segment, track, space_id (venue `spaces`, read only), build_item_id (same-event booking), expected_attendance. `trg_programme_integrity`: no two `programme` items in one area/room at once (`programme_overlap`), room must be at the event's venue, audience ≤ room capacity, booking on this event. Run-sheet items may overlap. `event_spaces(event)` lists schedulable rooms. Space/booking pickers not yet in the UI.

## Ended events

`complete_ended_events(grace 6h, limit 500)` (service only): published/on_sale/live past coalesce(ends_at, starts_at+12h) − grace → completed, open tiers paused, `event.completed` + audit; paid orders/tickets untouched. Job `events.complete_ended` (db), cron 01:05 UTC; on demand via `enqueue_job`. Search and sitemap follow automatically. Live effect: 3 stale "Ticket test" fixture events completed.

## Private guest links

`event_guest_links` (token hash only, expires ≤ 400 d, revocable, ≤ 20 active/event; team-readable). `create_event_guest_link` / `revoke_event_guest_link` (audit + outbox). `event_guest_view(hash)` service-only → host, link label/expiry, guest-safe event fields, public programme; null for unknown/revoked/expired links, archived or restricted events; rate-limited. Route `/guest/[token]` (noindex, no-referrer, per-IP limit). Share buttons for private events copy a guest link.

## Readiness / activity

`event_readiness` Compliance uses `trust_credential_rows` (workspace + listing rules) — fixed in 202610294006 (it previously always reported ready). `event_timeline(event, limit, before)` = audit_events + domain_outbox + incidents.

## Domain events

event.state_changed, event.duplicated, event.completed, event.guest_link_created, event.guest_link_revoked.

## Open

Templates (34), dependency graph (36), brief (39) untouched; readiness snapshots; tasks dependencies/recurrence; acts linked by `build_item_id`, no `provider_jobs` link; public programme read now also returns the `build_item_id` column (harmless UUID, consider dropping from the public projection).

## Templates (domain 34; migration 202610294008)

`event_templates` gains family_id/version (one active per family), scope workspace|platform, canonical event_type, `content` (structure). Shared engine: `event_structure_snapshot(event, 'duplicate'|'template', modules)` stores times as seconds from the anchor; `apply_event_structure(event, structure, start, actor)` instantiates tiers (drafts, sold=held=0), programme, tasks (todo, unassigned, recurrence kept) and dependencies. Template allow-list: type/overview, programme shape (no owner names, no room bindings), tasks, tier shapes, allow-listed settings, budget category names, provider categories, role counts, promotion channels — never guests, tickets, orders, payments, bookings/holds, seats, shifts, incidents, files, links, client refs, money totals. Commands: `save_event_template`, `archive_event_template`, `create_event_from_template(template, workspace, name, starts_local, tz, request_id?)` (date required, idempotent, type-aware), `apply_event_template(event, template)` (create wizard). `duplicate_event` runs on the same engine (now also copies task dependencies).

## Dependencies and tasks (domains 36, 42; 202610294007, fix 4010)

`event_dependencies` (dependent: task|milestone|ticket_tier|booking; prerequisite: + payment|team|venue|compliance|approval; hard, lag; approval edges with decider/reason/expiry). Same-event ids, cycle rejection under an event lock (`dependency_cycle`). Hard edges block `tasks.status → done` and `ticket_tiers.status → on_sale` (`blocked_by_dependencies`) for every writer. Commands `add_event_dependency`, `remove_event_dependency`, `set_task_dependencies`, `decide_event_dependency_approval` (owner/manager). `event_dependency_graph(event)` → nodes, edges, blocked-by, critical path. Readiness "Dependencies" domain. Recurring tasks (`tasks.recurrence`, `recurrence_until`): completing one creates the next occurrence once. TS `src/lib/events/plan.ts`. **No UI yet.**

## Brief (domain 39; 202610294009)

`event_briefs` append-only versions: goals, client needs, scope, audience (names stripped), budget range, location/venue/supplier needs, style, must-haves, constraints, accessibility, success measures, internal notes. `save_event_brief(event, brief, expected_version)` → conflict on stale version; team read via RLS. `provider_event_brief(build_item)` — booked provider's scoped view (no client, budget or internal notes; own category only). `event_brief_requirements(event, category)` prefill for Q10; `provider_requests.brief_version_id`. No AI. **No UI yet.**

## Customer duplicate

`duplicateMyEvent(id, {starts_at, timezone, name, confirm, request_id})` → `duplicate_event`; dialog `src/components/customer/duplicate-dialog.tsx` in both customer menus.

Domain events added: event.dependency_added / _removed / _approval_decided, event.template_saved, event.template_applied, event.created_from_template, event.brief_updated.
