# W11 — Event-type matrix (v6 GD-12) — 2026-10-29, lane B

Status: DONE with gaps. Pairs with Q14, Q40. Spec `tests/release/event-type-matrix.spec.ts` (15/15). Migration `202610292012_event_type_public_guard` (applied, recorded). 6 captures (one browser session).

## Broken and fixed
A children's party could be published publicly by a direct row write (`update events set status='published', visibility='public'`) and anon could read it — `event_transition` checked `event_type_profiles` but the row wasn't guarded (probe confirmed). Fix: trigger `events_type_public_guard` forces private and refuses published/on_sale/live for types with `public_listing_allowed = false`. Both create wizards offered "Public" for children's parties; now disabled with guest-link copy (`src/lib/events/type-rules.ts`, `create-event.tsx`, `plan-wizard.tsx`).

## Matrix
Exp = profile (V venue, E end, C capacity, G guests, P programme, O online); BE = publish blockers before requirements are met (spec-asserted); Pub = publish allowed once met.

| Type | Exp | BE blockers | Pub | Privacy | Modules | UI reflects |
|---|---|---|---|---|---|---|
| birthday | V G | guests, venue | yes | private | guests, rsvp, packages | generic wizard |
| charity | V G | guests, venue | yes | standard | guests, seating, donations | not in organizer wizard |
| childrens_party | V G | guests, venue, public_listing (+ ops_rule_safeguarding) | **never** (transition + row guard) | minimised (care notes refused) | guests, rsvp, packages, safeguarding | Public disabled in both wizards; publish attempt shows blocker |
| concert | V E C | capacity, end, venue | yes | standard | tickets, acts, production, crew, emergency_plan | toast lists all three |
| conference | V E P | end, programme, venue | yes | standard | sessions, rooms, speakers, sponsors, badges | toast: programme; not in organizer wizard |
| custom (+ corporate etc.) | V | venue | yes | standard | – | – |
| festival | V E C P | capacity, end, programme, venue | yes | standard | tickets, stages, passes, shifts, zones, maps | generic wizard |
| gala | V G | guests, venue | yes | standard | guests, seating, run_of_show | not in organizer wizard |
| nightlife | V E C | capacity, end, venue | yes | standard | tickets, door, age_policy, security | generic wizard |
| webinar | E O | end, stream (no venue) | yes | standard | stream, registration, replay | toast end + stream; header still "Venue to be confirmed" |
| wedding | V G | guests, venue | yes | private | guests, seating, suppliers, run_of_show, deposits | generic wizard |

All types: on-sale requires a ticket tier; anon visibility matches publish success.

## Gaps (assigned in the queue, Q14 note)
1. Profile `modules`/`notes` not read by any UI — wizards show generic modules for every type.
2. Ticketing not enforced per type (a wedding can sell tickets).
3. `guest_privacy='private'` has no backend effect beyond default.
4. Lifecycle preconditions only via `event_transition`; direct status writes skip date/venue blockers for allowed types.
5. Online events show "Venue to be confirmed"; overview "Risks & blockers" and readiness ring don't show lifecycle blockers.
6. Organizer status menu offers "Published" for children's parties (backend refuses).
7. Taxonomy drift: wizard types (corporate, community, party, private_dinner, awards, food_drink, comedy) fall back to `custom`; gala/charity/conference missing from organizer tiles.

Seed gaps (Q38): no seeded childrens_party, webinar, charity events; nightlife only 2.
