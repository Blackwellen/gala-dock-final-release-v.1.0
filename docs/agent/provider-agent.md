# Gala Agent — Provider Agent (Q43) — 2026-10-29

Same migrations and tests as the Organizer Agent (`docs/agent/organizer-agent.md`).

## Skills
pro.find_work, pro.draft_quote, pro.protect_sla, pro.allocate_resources, pro.venue_occupancy, pro.emergency_work, pro.prepare_delivery, pro.reconcile_payout, pro.listing_health.

## Tools added
bookings.upcoming, opportunities.sla, listing.readiness, listing.availability, trust.summary, money.release_readiness (renamed from money.payout_ready, 4034), quote.draft (R1, never sends), crew.assign / equipment.allocate (R2; DB clash/capacity triggers refuse), availability.emergency_window (R3), comms.inbox, memory.*. Existing: opportunities.list, calendar.conflicts, money.provider_summary, reliability.get, opportunity.respond (R3), venue.hold (R3), quote.send (R4), message.party.

## Authority (DB-enforced in `agent_governance_refusal`)
Amount taken from quote args; above `agent_policies.booking_authority_minor` only the owner's approval executes; policy auto-tools never above it; autopilot `max_amount_minor` enforced; approval covers exact args.

## Conflicts
`opportunity.respond 'available'` → `provider_respond` refuses `hard_conflict` against held/confirmed/active primary jobs, even as an auto-tool.

## Exit gate — met
Never accepts a conflicting job or exceeds pricing/booking authority (agent-organizer-provider spec).

## Open
Provider equipment/stock read model (stock.report is organizer-only); demo crew/equipment fixtures for success paths.
