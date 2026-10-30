# Q00 baseline findings — 2026-10-28

Source: Q00 repository baseline (agent A). Raw introspection, eslint and test logs: session scratchpad `q00-baseline/`.

## 1. Ranked findings

| # | Sev | Finding | Evidence | Queue |
|---|---|---|---|---|
| 1 | P0 | Marketplace payments use separate charges & transfers; every Stripe call uses the platform key with no `Stripe-Account` header (platform is merchant of record) | `src/lib/commerce/orchestrator.ts:8-12, :68 transfer_group, :97-98 transfers (destination + source_transaction), :125 reversals`; `src/lib/stripe.ts:8-14` | Q07 |
| 2 | P0 | Ticket sales are platform charges; organiser share booked as `provider_payable` and never transferred or paid out | `src/app/api/checkout/session/route.ts:51-63`; `src/lib/commerce/ticket-ledger.ts:21-23` | Q07, Q20 |
| 3 | P0 | Card-paid invoices on `/pay/[token]` land in the platform account, are recorded only if the browser returns (no webhook handles `invoice_id`), check-then-insert into `transactions` can race, organiser never paid | `src/app/pay/[token]/page.tsx:18-38`; `src/app/api/stripe/webhook/route.ts:49-70` | Q07 |
| 4 | P1 | Resale seller "payout" is a refund of the seller's original card payment from the platform balance | `src/lib/commerce/resale-refunds.ts:39-47` | Q07, Q22 |
| 5 | P1 | Two finance models: legacy `payments`/`transactions` feed Organizer Money; `payment_orders`/`checkout_orders`/ledger hold marketplace and ticket money | `src/app/organizer/money/page.tsx:22-25` | Q07 |
| 6 | P1 | Migration history drift: 0026–0038 applied by Management API scripts but absent from `schema_migrations` (`supabase db push` would re-run them); 0039 (AI profitability) not applied | live introspection | Q39, Q28 |
| 7 | P1 | Two AI paths bypass metering, credits and the tool registry: provider assistant and onboarding assistant call Anthropic directly | `src/lib/provider/agent.ts:42-45`; `src/app/api/agent/onboarding/route.ts:21-36` | Q28, Q41 |
| 8 | P1 | No canonical `bookings` table: a booking is spread over `build_items`, `provider_requests`/`provider_quotes`, `provider_jobs`, `payment_orders`, `booking_cancellations`, `booking_disputes` | schema | Q10 |
| 9 | P2 | Messaging modelled twice: `threads`+`messages` and `conversations`+participants+`conversation_messages`, plus `portal_messages`, `support_messages` | schema | Q05 |
| 10 | P2 | Other duplicates: `admin_notes`/`admin_record_notes`; `tasks`/`user_tasks`; `enquiries`/`provider_requests`/`leads`; partners*/promoters*; five hold tables; `check_ins`/`provider_checkins`; `incidents`/`trust_cases`/`support_cases` | schema | Q10, Q14, Q18, Q27, Q31 |
| 11 | P2 | Integration health registry disagrees with code: checks `CLOUDFLARE_R2_ACCOUNT_ID` (code uses `CLOUDFLARE_R2_S3_API`), calendar marked `implemented:false` with the wrong Microsoft env name, Anthropic missing | `src/lib/release/integrations.ts:27-34` | Q34 |
| 12 | P2 | Provider Settings shows a hard-coded, inert integrations list (Google/Outlook/Apple Calendar, Xero, QuickBooks always "Coming soon") | `src/app/provider/settings/page.tsx:144` | Q30, W04 |
| 13 | P2 | No generic outbox, job queue, idempotency registry or dead-letter table (backend §15.2); each domain has its own queue | schema | Q03 |
| 14 | P3 | Worker tests sensitive to clock skew (local clock ≈1.1 s behind DB) | `tests/release/agent-run-types.spec.ts:42,61` | Q03 |
| 15 | P3 | Landing page has static illustration panels; preview fixtures gated to non-production | `src/app/page.tsx:221-253`; `src/lib/preview-data.ts:8` | W01 |

## 2. Money-flow table

| Flow | Entry point | Charge model now | Who gets the funds |
|---|---|---|---|
| Ticket purchase | `/api/checkout/session:63` | Platform charge, no transfer | Platform (organiser share stuck as `provider_payable`) |
| Resale purchase | same route | Platform charge | Platform |
| Resale seller payout | `resale-refunds.ts:43` | Refund of seller's original payment | Seller's card |
| Ticket refunds (event cancellation) | `ticket-refunds.ts:39` | Refund of platform charge | Buyer |
| Deposit / balance / standby / emergency | `orchestrator.ts:39-71` | Separate charges & transfers | Platform, then provider |
| Provider release | `orchestrator.ts:97` | Transfer to Connect account | Provider |
| Marketplace cancellation refund | `orchestrator.ts:122,125` | Refund plus transfer reversal | Customer |
| Boost | `boosts.ts:32` | Platform charge (100% platform) | Platform |
| Invoice paid by card | `pay/[token]/page.tsx:23` | Platform charge, no transfer, no webhook | Platform |
| Organiser cancellation commission | `platform_charges` | Recorded only; nothing collects it | — |
| Saved cards | `account.ts:73-84` | Platform SetupIntent | — |
| Connect onboarding | `/api/payouts:33-45` | Express accounts | — |
| Bank payouts | Stripe automatic | Not mirrored (no `payout.*` webhook) | Provider bank |
| Affiliate / promoter earnings | tables only | Manual / off-platform | Partner |
| Disputes | webhook | Platform liable as merchant of record | — |

Webhook mapping: `checkout.session.completed` → `finalise`; `payment_intent.succeeded` → `ledgerForTicketPayment` (tickets); `payment_order_succeeded`, `payment_order_transferred`, `cancellation_refund_progress` (marketplace); `charge.refunded` → `ledgerForRefund`; `account.updated` → `syncConnectAccount`; `charge.dispute.*` → `syncStripeDispute`.

Q07 therefore covers tickets, resale, invoices, refunds and reversals, dispute liability and payout mirroring — not only the orchestrator. Platform-own revenue (boosts, subscriptions, AI credits) legitimately stays a platform charge.

## 3. Dead controls (static scan)

0 `href="#"`, 0 empty onClick handlers, 0 TODO/FIXME, 0 `alert(`. The 16 buttons without a handler are all inside forms. `/api/checkout/complete` is unauthenticated but safe: `finalise()` re-verifies the session with Stripe (`src/lib/checkout.ts:46-48`). The per-control browser census belongs to lane W (W13).

## 4. Mock and hard-coded data

- `src/app/provider/settings/page.tsx:144` — inert integrations list (P2).
- `src/app/page.tsx:221-253` — marketing illustration panels (P3).
- `src/lib/preview-data.ts`, used by `src/app/[...slug]/page.tsx`, `src/components/auth-route.tsx`, `src/components/onboarding-route.tsx`, gated by `previewsEnabled()`.
- Design-reference tooling: `src/lib/routes.ts:4-5`, `src/lib/workspace/design-map.ts`, `src/components/kit/design-overlay.tsx` — confirm unreachable in production.
- No hard-coded datasets in data loaders.

## 5. Canonical table families (backend §15)

EXISTS (mostly): 15.13 Media, 15.15 Agent. PARTIAL: all others. MISSING: none.

| Family | Present (real names) | Missing or modelled differently |
|---|---|---|
| 15.1 Foundation | profiles, workspaces, workspace_members, role_permissions, workspace_invites, plan_entitlements, platform_settings, platform_admins | workspace_roles, workspace_entitlements, workspace_settings (jsonb on workspaces), user_settings, feature_flags |
| 15.2 Audit / Workflow | audit_events, state_machines/transitions/violations, email_outbox, cron.job | domain_outbox, idempotency_keys, workflow_*, job_queue, dead_letter_jobs |
| 15.3 Events | events, event_templates, programme_items, tasks, incidents, calendar_entries, event_virtual, event_cancellations | type configs, dependencies, readiness items (computed), series, days, rooms, risks, event_files |
| 15.4 People | guests, check_ins, crew_members, shifts, availability_blocks, saved_contacts | contacts, clients, guest_groups, registrations, passes, team_skills, resources |
| 15.5 Sales | leads, lead_activities, proposals, proposal_versions | proposal_items, contracts*, signatures |
| 15.6 Provider / Venue | listings, spaces, space_links, packages, provider_jobs, provider_documents, venue_rate_cards, venue_structures, venue_alternatives, event_orders/versions (BEO), menu*, bar_packages | providers, capabilities, service_variants, equipment, capacity profiles |
| 15.7 Marketplace | provider_requests, provider_quotes, conditional_holds, standby_commitments, emergency_*, build_items, booking_cancellations | bookings, booking_changes, completion evidence, order_groups, request_recipients, quote_items |
| 15.8 Trust | verification_records, provider_documents, reviews, reliability_metrics, trust_cases, credential_* | business_verification, insurance_policies, document_checks, review_reports, enforcement_actions |
| 15.9 Maps | venue_maps, venue_structures, event_seats | version/object/overlay tables (overlay is jsonb), map_constraints |
| 15.10 Ticketing | ticket_tiers, tickets, event_seats, ticket_holds, resale_holds, checkout_orders, ticket_transfers, ticket_waitlist, resale_payouts, checkout_resale_allocations, discount_codes, launch_queue | configurations, releases, inventory, sections, order_items (jsonb), credentials (HMAC), resale_listings, waitlist_offers |
| 15.11 Finance | payment_orders, checkout_orders, ledger_transactions/entries, invoices*, stripe_disputes, booking_disputes*, connect_accounts, commission_rules, stripe_refund_totals, legacy payments/transactions | payment_attempts, ledger_accounts, refunds, transfers, payouts, reconciliation_*, tax_snapshots |
| 15.12 Promotion | promotions, promotion_boosts, boost_products, promoter*, partner*, saved_items | event_distribution, follows, attribution_events |
| 15.13 Media | media_assets, designs, design_versions/elements/comments/shares/templates, brand_kits, template_reports/saves, uploaded_fonts | — |
| 15.14 Communications | threads, messages, conversations*, notifications, email_outbox, portal_messages | message_attachments, email_accounts/sync/messages, notification_preferences, communication_consents |
| 15.15 Agent | agent_runs, agent_run_steps, agent_waits, agent_artifacts, agent_approvals, agent_routines, agent_policies, agent_watches, agent_tools, ai_usage_events, ai_credit_ledger, ai_budgets, ai_model_prices, credit_packs | agent_threads, tool_executions, routine_runs |
| 15.16 Integrations | api_keys, api_requests, webhook_endpoints/deliveries/events, calendar_connections/sync_links/busy_blocks, integrations | oauth_tokens, sync_cursors, integration_health |
| 15.17 Privacy / Support | privacy_requests, support_cases/messages, trust_cases, break_glass_grants/access_log | legal_holds, safeguarding_cases, admin_access_logs |
