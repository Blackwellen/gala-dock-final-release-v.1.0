# Gala Agent tool × workspace matrix (playbook §7)

Generated on 2026-11-11 from `src/lib/agent/registry.ts` (55 tools), with the specs that name each tool.

How every tool runs:
- Through `agent_invoke`, as the person who asked, so their permissions and the domain rules apply.
- A tool either works or refuses in plain words (`src/lib/agent/refusals.ts`).
- The worker is kicked from the request (`src/lib/agent/actions.ts` `kick()`); the cron is the safety net.
- Greetings get a conversational reply, and replies use the person's recent history (`runtime.ts` planRun/askInner).
- Every Azure call is counted against a persisted per-deployment budget (`ai_provider_attempt`, migration 202611116006).

Surfaces: organiser and provider only. There is no AI in the customer workspace (owner decision). AI is Azure only.

**Journeys (2026-11-11), stubbed model (FakeModel, no Azure calls):** `tests/release/agent-organizer-provider`, `agent-gating`, `agent-credits`, `agent-run-types` and `agent-governance` pass 31/31 against the live DB.

"**no spec names it**" means the tool is covered only by the generic planner and registry specs. It needs its own journey before GO.

| Tool | Title | Workspace | Risk | Permission | Gate | Evidence (specs) |
|---|---|---|---|---|---|---|
| `events.list` | List events | organizer | R0 | events.read | read-only, runs as the person | marketplace/agent.spec.ts, release/agent-governance.spec.ts |
| `event.readiness` | Event readiness | organizer | R0 | events.read | read-only, runs as the person | release/agent-governance.spec.ts, release/agent-organizer-provider.spec.ts |
| `event.feasibility` | Feasibility check | organizer | R0 | events.read | read-only, runs as the person | release/q30-api-webhooks.spec.ts |
| `event.budget` | Event budget | organizer | R0 | events.read | read-only, runs as the person | release/q30-api-webhooks.spec.ts |
| `marketplace.open_requests` | Open supplier requests | organizer | R0 | events.read | read-only, runs as the person | **no spec names it** |
| `marketplace.search` | Search marketplace | organizer | R0 | marketplace.request | read-only, runs as the person | **no spec names it** |
| `team.conflicts` | Team conflicts | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `tickets.sales` | Ticket sales | organizer | R0 | events.read | read-only, runs as the person | **no spec names it** |
| `venues.rank` | Rank venues | organizer | R0 | events.read | read-only, runs as the person | release/agent-planning-tools.spec.ts |
| `event.break_even` | Break-even | organizer | R0 | events.read | read-only, runs as the person | release/agent-planning-tools.spec.ts |
| `seating.suggest` | Suggest seating | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts, release/agent-planning-tools.spec.ts |
| `map.validate` | Validate event map | organizer | R0 | events.read | read-only, runs as the person | release/agent-governance.spec.ts, release/agent-organizer-provider.spec.ts |
| `map.bindings` | Map ticket bindings | organizer | R0 | events.read | read-only, runs as the person | release/agent-governance.spec.ts, release/map-engine.spec.ts |
| `money.payables` | Payables | organizer | R0 | finance.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts, release/q30-api-webhooks.spec.ts |
| `draft.note` | Draft | both | R1 | events.read | approval per workspace policy | marketplace/agent.spec.ts |
| `task.create` | Create task | organizer | R2 | events.write | approval per workspace policy | marketplace/agent.spec.ts, release/agent-credits.spec.ts |
| `media.list_designs` | List designs | both | R0 | events.read | read-only, runs as the person | marketplace/media.spec.ts |
| `media.event_poster` | Draft event poster | organizer | R1 | events.write | approval per workspace policy | marketplace/media.spec.ts |
| `message.party` | Send message | both | R3 | events.read | plan confirmation + approval | marketplace/agent.spec.ts, release/agent-governance.spec.ts |
| `marketplace.request_hold` | Request a hold | organizer | R3 | marketplace.request | plan confirmation + approval | **no spec names it** |
| `marketplace.request_standby` | Request paid standby | organizer | R3 | marketplace.request | plan confirmation + approval | **no spec names it** |
| `emergency.create` | Emergency Supply request | organizer | R3 | marketplace.request | plan confirmation + approval | **no spec names it** |
| `standby.activate` | Activate standby | organizer | R4 | marketplace.request | plan confirmation + approval | release/q30-api-webhooks.spec.ts |
| `cancellation.request` | Cancel a booking | organizer | R4 | marketplace.request | plan confirmation + approval | release/q30-api-webhooks.spec.ts |
| `tickets.publish_tier` | Put tickets on sale | organizer | R4 | tickets.manage | plan confirmation + approval | marketplace/agent.spec.ts, release/agent-governance.spec.ts |
| `opportunities.list` | Open opportunities | provider | R0 | opportunities.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `calendar.conflicts` | Check availability | provider | R0 | opportunities.read | read-only, runs as the person | **no spec names it** |
| `money.provider_summary` | Payout summary | provider | R0 | money.read | read-only, runs as the person | **no spec names it** |
| `reliability.get` | Reliability | provider | R0 | opportunities.read | read-only, runs as the person | **no spec names it** |
| `opportunity.respond` | Respond to request | provider | R3 | opportunities.respond | plan confirmation + approval | release/agent-organizer-provider.spec.ts |
| `venue.hold` | Hold a space | provider | R3 | availability.manage | plan confirmation + approval | **no spec names it** |
| `quote.send` | Send a quote | provider | R4 | quotes.send | plan confirmation + approval | marketplace/agent.spec.ts, release/agent-governance.spec.ts |
| `calendar.upcoming` | Upcoming calendar | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts, release/q44-cross-workspace.spec.ts |
| `event.conflicts` | Event conflicts | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `event.ops_readiness` | Operations readiness | organizer | R0 | events.read | read-only, runs as the person | **no spec names it** |
| `compliance.overview` | Compliance overview | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `hospitality.summary` | Hospitality summary | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `logistics.overview` | Logistics overview | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `partners.overview` | Partners overview | organizer | R0 | events.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `virtual.attendance` | Online attendance | organizer | R0 | events.read | read-only, runs as the person | **no spec names it** |
| `campaigns.calendar` | Promotion calendar | organizer | R0 | promotion.manage | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `campaigns.report` | Campaign report | organizer | R0 | promotion.manage | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `sales.client` | Client overview | organizer | R0 | sales.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `stock.report` | Stock report | organizer | R0 | events.read | read-only, runs as the person | **no spec names it** |
| `comms.inbox` | Inbox | both | R0 | agent.use | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `bookings.upcoming` | Upcoming bookings | provider | R0 | bookings.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `opportunities.sla` | Response SLA | provider | R0 | opportunities.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `listing.readiness` | Listing readiness | provider | R0 | bookings.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `listing.availability` | Listing availability | provider | R0 | opportunities.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `trust.summary` | Trust status | provider | R0 | bookings.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `money.release_readiness` | Payout readiness | provider | R0 | money.read | read-only, runs as the person | release/agent-organizer-provider.spec.ts |
| `quote.draft` | Draft a quote | provider | R1 | quotes.send | approval per workspace policy | release/agent-organizer-provider.spec.ts |
| `crew.assign` | Assign crew | provider | R2 | team.manage | approval per workspace policy | release/agent-organizer-provider.spec.ts |
| `equipment.allocate` | Allocate equipment | provider | R2 | bookings.manage | approval per workspace policy | release/agent-organizer-provider.spec.ts |
| `availability.emergency_window` | Offer emergency availability | provider | R3 | availability.manage | plan confirmation + approval | release/agent-organizer-provider.spec.ts |
