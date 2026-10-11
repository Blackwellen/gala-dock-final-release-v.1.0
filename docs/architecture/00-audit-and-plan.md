# Gala Dock — architecture audit & delivery plan (master spec §1–135)

Audit date: 2026-10-11. Source of truth for what exists vs. what the master spec requires.
Updated as phases land (see "Status" column).

## 1. What exists (live Supabase, 83 tables, all RLS-enabled)

| Domain | Canonical tables today | Notes |
|---|---|---|
| Identity / tenancy | `profiles`, `workspaces` (+capabilities, status, verification_status, payout_status, stripe_account_id), `workspace_members` (role, status), `workspace_invites` (hashed tokens), `platform_admins`, `audit_events`, `rate_limits` | Role is a single text column; no capability/permission model yet. |
| Events | `events` (one schema, `management` customer/professional), `programme_items`, `tasks`, `guests`, `shifts`, `crew_members`, `incidents`, `check_ins`, `event_templates`, `calendar_entries` | Canonical event ID shared by customer + organizer (§72 upgrade path already structurally possible). |
| Marketplace | `listings` (venue/service, geo lat/lng, booking_mode, emergency_supply, response_hours), `spaces`, `space_links`, `packages`, `availability_blocks`, `provider_requests`, `build_items` (the booking/line record), `provider_quotes` (versioned), `provider_jobs` (provider-side booking), `enquiries` | Booking state is free-text `status` on `build_items` / `provider_jobs`; no transition enforcement. Holds are columns (`hold_expires_at`), not records. No standby or emergency-request records. |
| Trust | `trust_cases`, `reviews`, `listings.verified` | No credential/document records, no verification records, no reliability metrics. |
| Ticketing | `ticket_tiers` (quantity/sold/held), `ticket_holds`, `event_seats` (seat hold tokens), `tickets` (qr_nonce, replaced_by), `checkout_orders`, `resale_holds`, `resale_payouts`, `discount_codes`, `promoters`, `promoter_*` | Hold/oversell logic exists in RPCs; needs concurrency tests and entitlement/credential separation review. |
| Maps | `venue_structures` (provider, versioned), `venue_maps` (event overlay, versioned) | Two-layer model already matches §52. Constraint engine to verify. |
| Sales | `leads`, `lead_activities`, `proposals`, `proposal_versions` | |
| Money | `payments`, `transactions`, `invoices`, `invoice_items`, `invoice_installments`, `invoice_events`, `admin_money_requests` | No immutable ledger, no payment-orchestration layer, single Stripe webhook route. |
| Promotion | `promotions`, `media_assets`, `partner_*`, `promoters` | |
| Comms | `threads`, `messages`, `notifications`, `portal_*`, `support_*` | No connected email/calendar OAuth yet. |
| Agent | `agent_runs` (status, plan jsonb, next_wake_at, idempotency_key, cost), `agent_approvals`, `agent_routines` (free-text schedule) | LLM = Azure OpenAI (`src/lib/agent/llm.ts`). No step/wait/tool-execution records, no typed tool registry, routines not compiled. `/api/agent/worker` exists. |

Service layer: `src/lib/actions/*` (customer + organizer server actions), `src/lib/provider/*`, `src/lib/data/*` (reads). 646 inline status-string comparisons across `src/` → state machines must be introduced as a shared module and adopted incrementally.

## 2. Gap analysis → phases (spec §130 order, adjusted for what exists)

| Phase | Scope | Key new/extended records | Status |
|---|---|---|---|
| 1 Foundation | Capability permissions (§99), state-machine module + DB transition guards (§114), audit actor types (§100), immutable ledger (§42), webhook event log (§109), soft-delete conventions (§101) | `role_permissions` + `has_permission()`, `state_machines`/`state_transitions`/`state_violations` + guard trigger (generated from `src/lib/domain/*.ts`), `ledger_transactions`/`ledger_entries` + `post_ledger_transaction()`, `webhook_events` + `claim_webhook_event()`, `audit_events.actor_type` | **done** — migrations 202610160001/2, tests/foundation (5/5) |
| 2 Trust & Connect | Stripe Connect state (§29), verification (§30), credentials + expiry (§31), reliability (§32) | `connect_accounts`, `credential_types`/`credential_requirements`, `provider_documents`, `verification_records`, `reliability_metrics` | **done** — migration 202610160003, webhook sync, provider cards |
| 3 Marketplace booking | Full booking lifecycle (§33), response SLA (§34), holds (§35), standby (§36), emergency (§37), cancellation (§45), disputes (§44) | `conditional_holds`, `standby_commitments`, `emergency_requests`, `booking_disputes` | **done** — migration 202610170001 (+ state seed 202610170002), pg_cron `marketplace-sweep` every 5 min, shared lifecycle panel (organizer/provider/customer), Emergency Supply pages, dispute threads, admin /admin/disputes, Stripe chargeback sync; tests/marketplace (6) + webhook dispute test |
| 4 Customer build | `/account/events/[id]/build` canvas (§66–71), backups | extend `build_items` | partly exists |
| 5 Venue / F&B | Venue profile tabs, commercial engine, BEO, menus, bar (§59–65) | `beo_versions`, `menus`, `menu_items` | planned |
| 6 Organizer depth | Five-tab event record (§3), sales (§73–75), team conflicts (§84–85), readiness (§87), feasibility (§88), live mode (§86) | | partly exists |
| 7 Ticketing | Entitlements/credentials, transfer, official resale, scanning, map-bound inventory (§46–51, §57) | | partly exists |
| 8 Promotion | Directory, calendars, posters, promoters, boosts, affiliates (§76–83) | | partly exists |
| 9 Agent tool registry | Typed tools with risk R0–R5, policies, approvals (§8–12) | `agent_run_steps`, `agent_tool_executions`, `agent_waits`, `agent_policies` | planned |
| 10–12 Agent skills, missions, routines, durable runs | §13–27 | `agent_routine_runs`, `agent_artifacts` | planned |
| 13 Admin / observability | §106, §128 | | partly exists |
| 14 QA / release | §115–132 | | ongoing |
| + User additions | Messaging between accounts and portals; ticket QR scanning; ticket PDF generation and printing | | planned (Phase 7 / comms) |
| 15 (last) Media Studio, canvas agent, PWA nav, ticket credential formats | Spec in `docs/specs/media-studio-part1.md` + `part2.md` (§1–92). Built: `/studio/[id]` editor (pages, text/shape/image/QR/barcode/icon/drawing layers, effects, filters, snapping, undo/redo, autosave with optimistic concurrency + offline draft, versions/restore, resize variants, PNG/JPEG/WebP/PDF export), `/organizer/media` + `/provider/media` library, templates (bindings → placeholders, private images → public derivatives), community gallery + reporting/moderation, agent tools `media.list_designs` / `media.event_poster` (drafts only). Earlier: PWA MobileNav, GD2/GD2P credentials. Deferred: brand-kit UI, custom font upload UI, design comments/shares UI, background removal | designs, design_versions/shares/comments, design_templates, template_reports/saves, template_creator_restrictions, brand_kits, uploaded_fonts | done (tests/marketplace/media.spec.ts 4/4) |
| 16 (after 15) Final release-readiness & go-live run | Spec in `docs/specs/release-readiness-part1.md` + `part2.md` (§1–150): governance + RELEASE_READINESS_REPORT, admin audit, break-glass conversation access, admin/workspace MFA, maintenance levels, agent run types + credits/caps, workspace sweeps, ticket/venue/provider marketplaces, PWA, QA/security matrix, comms + Google OAuth, help/tours/demo mode, DSAR/deletion, R2/Stripe/maps, API/MCP/webhooks, map + media audits, economics, ads, virtual events, legal drafts, DR/IR/observability, release verdict | | done — see `docs/release/RELEASE_READINESS_REPORT.md` (verdict: controlled beta after 4 external/legal blockers) |

## 3. Non-negotiables carried into every phase

- Additive migrations only; preserve IDs; no reseed (§129).
- Every tenant table RLS-protected and pen-tested with real identities (§98, §124).
- UI, wizards and Agent tools call the same validated service functions (§102).
- No "escrow" language; payment state explained from authoritative webhook data (§39, §43).
- No fake buttons/routes: anything not yet built is not shown.
