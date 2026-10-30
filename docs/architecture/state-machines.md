# State machines (backend §17, domain 28; Q03)

Source of truth: `src/lib/domain/state-machines.ts` → `node scripts/gen-foundation-sql.mjs` → `supabase/migrations/209912310001_state_seed.sql` (`public.state_machines`, `public.state_transitions`, per-table trigger `<table>_state_guard` → `enforce_state_transition()`). Re-run the generator after migrations; `tests/foundation/foundation.spec.ts` checks the guards.

## Modes

- **enforce**: illegal transitions raise `illegal <machine> transition <from> -> <to>` (22023) and are recorded in `state_violations`.
- **audit**: legacy direct updates are allowed but recorded in `state_violations` for review (machines with legacy states still in production data).
- **Explicit command (all machines, strict):** `public.transition_state(machine, id, to, expected, actor, actor_type, reason, correlation)`, TS `transitionState()`. Locks the row, checks the expected current state (optimistic concurrency → `{ ok:false, conflict:true, current }`), rejects transitions not in `state_transitions` even for audit-mode machines, updates through the guard, and emits `<machine>.state_changed` {id, from, to, reason} to `domain_outbox` in the same transaction. Same state = no-op, no event. New code changes status through this command rather than with direct updates.

## Implemented machines

| machine | table.column | mode | backend §17 contract |
|---|---|---|---|
| booking | build_items.status | audit | Booking (customer side; legacy states kept) |
| provider_job | provider_jobs.status | audit | Booking (provider side) |
| quote | provider_quotes.status | audit | Marketplace Request → Quote Received/Declined/Expired |
| ticket | tickets.status | audit | Ticket Entitlement (valid → used/refunded/transferred/resale_listed/resold/void) |
| conditional_hold | conditional_holds.status | enforce | Hold (requested → held → converted/expired/released/cancelled) |
| standby | standby_commitments.status | enforce | paid standby |
| emergency_request | emergency_requests.status | enforce | emergency supply |
| booking_dispute | booking_disputes.status | enforce | Dispute (opened → evidence → response → review → resolution → closed/escalated) |
| cancellation | booking_cancellations.status | enforce | Booking cancellation branch |
| payment | payment_orders.status | enforce | Payment (amount_due → … → paid_out, refund/dispute branches) |
| event_order | event_orders.status | enforce | venue BEO review cycle |
| agent_run | agent_runs.status | enforce | Agent Run (queued → planning → running → waiting/approval/sleeping/retrying → completed/partial/failed/cancelled) |
| agent_approval | agent_approvals.status | enforce | approval decision |
| verification | verification_checks.status | enforce | Verification (§17, Q08): unverified → submitted → pending_review → verified / action_required / rejected / suspended; verified → expired / pending_review |
| marketplace_request | provider_requests.status | audit | Marketplace Request (§17, Q10): draft → sent → awaiting / clarification → quote_received / declined / expired_no_response → closed; cancelled |
| event | events.status | enforce | Event (Q14): Draft=draft, Planning/Sourcing=planning, Confirmed=ready, Selling=published/on_sale, Live=live, Completed=completed, Settling=closed, Archived=archived; cancelled/postponed/suspended branches. CHECK kept. Extra guard `events_lifecycle_guard` (suspended only via admin restriction or from on_sale/live; only Gala Dock lifts a restriction). Command with preconditions: `event_transition()`; blockers: `event_lifecycle_blockers()`; direct writes still emit `event.state_changed` (source=direct). |

Full transition lists: `src/lib/domain/state-machines.ts`.

## Gaps against §17 (later packets)

- ~~Event is a CHECK constraint, not a guarded machine → Q14.~~ Done (Q14): `event` machine, see below and `docs/architecture/event-core.md`.
- ~~Marketplace Request as its own machine → Q10.~~ Done (Q10).
- Ticket Order (`checkout_orders`: draft → inventory held → payment pending → paid → issued) → Q20.
- ~~Verification → Q08.~~ Done (Q08).
- Audit-mode machines should move to enforce once `state_violations` shows no legacy traffic.

## Concurrency strategy (domain 259)

1. State: compare-and-set through `transition_state` (expected state) plus a row lock.
2. Scarce inventory / money: single SQL functions with FOR UPDATE / SKIP LOCKED and unique constraints (existing ticket/seat holds, ledger posting).
3. Serialising a command on a business key inside SQL: `advisory_xact_lock(scope, key)`.
4. Editable documents: per-domain versions (design_versions, proposal_versions, event_order_versions, event plan version lock); a generic row-version column is not yet introduced.
5. Async work: job leases (`claim_jobs`), never app-clock comparisons.
