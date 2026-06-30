# Gala Dock — Spec Backlog (Build To-Do)

The full build, decomposed into **30 specs** across a Foundation layer + V1 / V1.5 / V2.
Each spec is an independent unit of work. Detail docs live as `docs/specs/<ID>-<slug>.md` when picked up.

Companions: `docs/MASTER-PLAN.md` (versioning + pricing), `docs/COMMERCIAL-AUDIT-2026-06.md` (gap analysis).

Effort: **S** ≈ ≤3 days · **M** ≈ 1–2 wks · **L** ≈ 3–6 wks. Gate = SaaS plan that unlocks it.

---

## At-a-glance

| ID | Spec | Ver | Depends | Effort | Gate |
|----|------|-----|---------|--------|------|
| F1 | Workspace types + release-stage + flag resolver | V1 | — | M | — |
| F2 | Entitlements & plan-limit TS layer | V1 | F1 | S | — |
| F3 | Persona-aware app shell & navigation | V1 | F1 | M | — |
| F4 | Security/billing test harness + release sign-off | V1 | — | M | — |
| V1-1 | Calendar hub (cross-section + iCal) | V1 | — | L | Growth |
| V1-2 | AI Copilot v1 (chat + tools + metering) | V1 | F2 | L | Scale |
| V1-3 | Automations builder (Smart Rules → recipes) | V1 | F2 | L | Scale |
| V1-4 | Client portal (productized) | V1 | — | M | Growth |
| V1-5 | Supplier portal (productized, token) | V1 | — | M | Growth |
| V1-6 | PWA + offline event-day mode | V1 | — | M | all |
| V1-7 | Event detail depth (finance/run-sheet/BEO) | V1 | — | L | Growth |
| V1-8 | Supplier scorecards & sourcing depth | V1 | — | M | Growth |
| V1-9 | Proposals builder | V1 | — | M | Growth |
| V1-10 | Staffing & crew scheduling | V1 | V1-1 | M | Scale |
| V1-11 | Notifications & email orchestration polish | V1 | — | S | all |
| V1-12 | Reporting & analytics dashboards | V1 | — | M | Growth |
| 15-1 | Consumer buyer account | V1.5 | F1 | M | free |
| 15-2 | Public event pages + SEO/OG | V1.5 | F1 | M | Scale |
| 15-3 | Ticketing core (types, inventory, pricing) | V1.5 | 15-2 | L | Scale |
| 15-4 | Ticket checkout + Stripe Connect (lite) | V1.5 | 15-3 | L | Scale |
| 15-5 | Order & ticket management (buyer side) | V1.5 | 15-4 | M | free |
| 15-6 | QR check-in / door scanning | V1.5 | 15-4, V1-6 | M | Scale |
| 15-7 | Floor plan / seating builder | V1.5 | 15-3 | L | Growth |
| 15-8 | AI Copilot RAG + memory | V1.5 | V1-2 | M | Scale |
| V2-1 | Stripe Connect (full) + payouts | V2 | 15-4 | L | — |
| V2-2 | Venue Operator workspace + mgmt | V2 | F1,F3 | L | free |
| V2-3 | Venue marketplace (list/search/book) | V2 | V2-1,V2-2 | L | take-rate |
| V2-4 | Supplier workspace + supplier marketplace | V2 | V2-1 | L | 5.5% |
| V2-5 | Escrow engine | V2 | V2-1 | M | — |
| V2-6 | Disputes centre | V2 | V2-5 | M | — |
| V2-7 | Reviews, verification & trust/safety | V2 | V2-3,V2-4 | M | — |
| V2-8 | Public events directory | V2 | 15-3 | M | — |
| V2-9 | Multi-party accounting / GL + export | V2 | V2-1 | L | Enterprise |
| V2-10 | Featured listings / promotion | V2 | V2-3,V2-4 | S | ads |

> 34 rows shown for completeness; the 30 "core" specs exclude the 4 you may fold in later
> (V1-11, V1-12, V2-10 are lighter; V1-9 can merge into V1-7). Treat the list as the master to-do.

---

## Foundation

### F1 — Workspace types + release-stage + flag resolver
**Why:** Unblocks every version and persona. Ship first.
**Deliverables:**
- Migration: `workspaces.workspace_type` (`organizer|venue|supplier`, default organizer) + `release_stage` (`v1|v1_5|v2`).
- `src/lib/flags/registry.ts` (declarative gates: minVersion, workspaceTypes, planGate, default).
- `src/lib/flags/resolve.ts` resolving once per layout (version → persona → plan → override).
- Env master switches (`*_ENABLED`); per-workspace overrides via existing `feature_flags` table.
**Acceptance:** A flag off by version/persona/plan is invisible server-side and cannot be reached by direct URL.

### F2 — Entitlements & plan-limit TS layer
**Why:** Central, testable gate used by AI, automations, ticketing, seats, storage.
**Deliverables:** `src/lib/billing/entitlements.ts` wrapping `has_plan`/`has_addon`/`get_plan_limit`; typed limits per tier; 402 upgrade-message helper.
**Acceptance:** Every gated action returns a consistent 402 + upgrade CTA; covered by F4 tests.

### F3 — Persona-aware app shell & navigation
**Why:** One codebase, different nav/onboarding per workspace_type.
**Deliverables:** workspace-type-driven sidebar + onboarding routing; persona switch for users in multiple workspaces; portal→workspace upgrade entry point.
**Acceptance:** Organizer/venue/supplier each see only their nav; no dead links across personas.

### F4 — Security/billing test harness + release sign-off
**Why:** Required before enterprise/marketplace money flows. Mirror Propvora's 10-suite harness.
**Deliverables:** RLS multi-workspace isolation, IDOR sweep, entitlement gates, Stripe webhook coverage, anon-exposure, role-within-workspace, portal scoping; `npm run test:security`; sign-off checklist doc.
**Acceptance:** All suites green in CI; sign-off doc gates production flips.

---

## V1 — Harden the Event Delivery OS

### V1-1 — Calendar hub
Cross-section aggregation (events, tasks, run-sheet items, supplier bookings, invoice due dates, staffing).
**Deliverables:** month/week/day/agenda views; filters by source; reminders; **public iCal feed** (reuse `calendar_share_tokens`, `calendar_resolve_token`); settings.
**Acceptance:** Every source appears with correct date-derived status; iCal feed token-gated, no workspace-id leakage.

### V1-2 — AI Copilot v1 (chat + tools + metering)
**Deliverables:** streaming chat endpoint (server action/RPC) with workspace context; tool registry (create event/task/quote, draft email) executing via existing `apply_*` RPCs + `ai_drafts`; approval card with cost estimate; metering via `ai_budget_reserve/reconcile/refund`; usage UI.
**Acceptance:** A tool run requires approval, debits budget, writes `ai_audit`; plan-gated to Scale (402 otherwise).

### V1-3 — Automations builder
Upgrade `smart_rules` into a usable engine surface.
**Deliverables:** trigger/condition/action builder; recipe library (clone+customize); run log (`smart_rule_runs`); approval queue; usage caps (`smart_rule_cap`); failure states.
**Acceptance:** A recipe ("supplier doc expiring → task + email") runs, logs a run, respects cap, gated to Scale.

### V1-4 — Client portal (productized)
**Deliverables:** branded per-event client view (timeline, documents, approvals, invoices/pay-link) via `portal_tokens`; acknowledgements (`brief_acknowledgements`); upload-back.
**Acceptance:** Client opens token link (no login), views only their event, approvals/uploads write back + audit.

### V1-5 — Supplier portal (productized, token)
**Deliverables:** supplier-facing job/quote/doc surface via `supplier_portal_tokens`; RFQ response; document + insurance upload; status confirm.
**Acceptance:** Supplier confirms a job + uploads docs without an account; RLS scopes to that supplier only.

### V1-6 — PWA + offline event-day mode
**Deliverables:** service worker, offline shell, install prompt; offline-capable **run sheet** + **check-in**; background sync on reconnect; extend `manifest.ts`.
**Acceptance:** Run sheet + check-in usable with network off; queued actions sync when back online; installable on iOS/Android.

### V1-7 — Event detail depth (finance / run-sheet / BEO)
**Deliverables:** finalize event detail tabs — budget vs actual (`event_budget_lines`), run sheet (`event_run_sheet_items`), BEO export, suppliers/quotes, files, activity, mood board.
**Acceptance:** Each tab CRUD-complete, Supabase-wired, printable BEO/run-sheet export.

### V1-8 — Supplier scorecards & sourcing depth
**Deliverables:** supplier health (`supplier_health`), ratings (`supplier_ratings`), rate cards (`supplier_rate_cards`), contracts, blocked dates, categories; sourcing filters.
**Acceptance:** Supplier detail shows live scorecard; sourcing list filters by category/rating/availability.

### V1-9 — Proposals builder
**Deliverables:** proposal composer (`proposals`, `proposal_line_items`), client send + decision capture (`apply_rfp_decision`), convert-to-event/quote.
**Acceptance:** Build → send → client accepts → converts to event + quote.

### V1-10 — Staffing & crew scheduling
**Deliverables:** assign crew to events (`event_staff_assignments`), availability blocks (`team_availability_blocks`), shift view on Calendar hub, conflict detection.
**Acceptance:** Assigning a double-booked staffer warns; staffing appears in Calendar hub.

### V1-11 — Notifications & email orchestration polish
**Deliverables:** in-app bell + preferences (`user_notification_preferences`), email queue/retry/suppression wiring (`email_enqueue_send`, `email_suppressions`), domain setup UX.
**Acceptance:** Key events fire in-app + email per prefs; suppressed/bounced handled.

### V1-12 — Reporting & analytics dashboards
**Deliverables:** event/finance/supplier dashboards from `analytics_daily_rollup`, `workspace_finance_summary`; export.
**Acceptance:** Dashboards render live rollups; CSV export.

---

## V1.5 — Consumer + Ticketing (single-sided)

### 15-1 — Consumer buyer account
**Deliverables:** lightweight consumer auth (separate from workspace membership), profile, saved payment methods, order history shell.
**Acceptance:** Consumer signs up, no workspace created; can hold tickets across multiple organizers.

### 15-2 — Public event pages + SEO/OG
**Deliverables:** public per-event page (organizer-branded), OG/SEO, sitemap entry; "list publicly" opt-in toggle on event.
**Acceptance:** Published event is publicly viewable + shareable with OG preview; unpublished is 404.

### 15-3 — Ticketing core
**Deliverables:** ticket types/tiers, inventory/capacity, pricing, discount/promo codes, sales windows; per-event ticketing dashboard.
**Acceptance:** Organizer defines tiers + inventory; sold-out + windows enforced server-side.

### 15-4 — Ticket checkout + Stripe Connect (lite)
**Deliverables:** consumer checkout; **Connect Express** account for organizer payouts; fee split (**2.5% platform + 1% seller admin + processor passthrough**); confirmation email + e-ticket.
**Acceptance:** Purchase issues tickets, pays organizer via Connect, records platform fee; refundable.

### 15-5 — Order & ticket management (buyer side)
**Deliverables:** buyer dashboard — **multiple tickets/orders**, transfer ticket, request refund, Apple/Google-style QR wallet, resend.
**Acceptance:** Buyer manages many tickets across events; transfer reassigns QR; refund flows to disputes-safe state.

### 15-6 — QR check-in / door scanning
**Deliverables:** scanner UI (camera), validate QR against `event_guests`, dedupe re-scans, offline queue (depends V1-6), arrivals stats.
**Acceptance:** Valid ticket admits once; duplicate flagged; works offline then syncs.

### 15-7 — Floor plan / seating builder
**Deliverables:** drag-drop layout editor (`event_floor_plans`), seat/table objects, capacity, **reserved-seat ticket assignment**, guest seating (`event_guests`).
**Acceptance:** Build layout, sell reserved seats, assign guests; capacity respected.

### 15-8 — AI Copilot RAG + memory
**Deliverables:** pgvector embeddings over events/suppliers/briefs; hybrid retrieval; memory threads + entity pinning; grounded answers.
**Acceptance:** Copilot answers "which suppliers are free for the 12th?" grounded in workspace data; remembers thread context.

---

## V2 — Multi-sided marketplace

### V2-1 — Stripe Connect (full) + payouts
**Deliverables:** connected accounts per money-receiving workspace; separate charges & transfers; application-fee take-rate; payout schedules + statements; reconciliation (`stripe_reconciliation_runs`).
**Acceptance:** A split payment credits seller + platform fee; payouts + reconciliation verified in TEST.

### V2-2 — Venue Operator workspace + management
**Deliverables:** `type=venue` workspace; venue/space inventory (`venues`, `venue_spaces`), availability calendar, pricing, F&B packages (`venue_fb_packages`), booking management (`venue_bookings`), payouts.
**Acceptance:** Venue operator onboards, lists spaces, manages availability + bookings, receives payout.

### V2-3 — Venue marketplace
**Deliverables:** public venue listings, search/filter (capacity, location, date, price), request-to-book → quote → deposit/escrow → confirm; take-rate (recommend 3–5%, **confirm**).
**Acceptance:** Organizer finds + books a venue; deposit escrowed; operator confirms; fee captured.

### V2-4 — Supplier workspace + supplier marketplace
**Deliverables:** `type=supplier` workspace; service listings (`service_catalog`), RFQ-to-award flow (`rfqs`, `rfq_recipients`), booking + milestone payments; **5.5% commission**.
**Acceptance:** Organizer posts RFQ, awards a supplier, books with milestones; commission deducted on payout.

### V2-5 — Escrow engine
**Deliverables:** milestone-delayed Connect transfers; states `held→released→refunded→disputed`; release triggers (completion/check-in/approval/window); per-marketplace hold config. **(Legal check before enable.)**
**Acceptance:** Funds held on charge, released on trigger; open dispute blocks release.

### V2-6 — Disputes centre
**Deliverables:** buyer↔organizer + organizer↔venue/supplier disputes; evidence upload, threaded messages, resolution states, admin arbitration, Stripe chargeback linkage.
**Acceptance:** Either party opens a dispute with evidence; admin resolves; refund/uphold updates escrow + ledger.

### V2-7 — Reviews, verification & trust/safety
**Deliverables:** reviews/ratings (`supplier_ratings` + venue equivalent), ID + supplier verification (admin), listing moderation, report flow.
**Acceptance:** Only completed bookings can review; unverified listings gated; reported content queued for admin.

### V2-8 — Public events directory
**Deliverables:** cross-organizer discovery — searchable/filterable public calendar, geo + category, featured slots; consumer ticket purchase entry.
**Acceptance:** Consumer discovers events across organizers and buys; only opted-in public events shown.

### V2-9 — Multi-party accounting / GL + export
**Deliverables:** per-workspace P&L, payout statements, light double-entry GL for money movement, **Xero/QuickBooks export**.
**Acceptance:** Each workspace reconciles its own ledger; export validates in Xero/QuickBooks sandbox.

### V2-10 — Featured listings / promotion
**Deliverables:** paid boost for venues/suppliers/events; placement slots; billing via add-on.
**Acceptance:** Boosted listing ranks higher for its window; charged correctly.

---

---

## UX / Visual Enrichment track (cross-cutting — runs alongside V1)

Source: `docs/audits/UX_ENRICHMENT_AUDIT.md` (route-by-route). Lift every section to a world-class
visual + interaction bar: imagery/media/avatars/maps, charts, card/data/gantt views, view-switchers,
filters, inline editing, dynamic components, premium design.

| ID | Spec | Depends | Effort |
|----|------|---------|--------|
| UX-0 | **Premium component library** (charts, MapView, GalleryUploader, ViewSwitcher, FilterBar, SavedViews, InlineEditCell, KanbanBoard, GanttChart, Avatar, Timeline, RightRail, premium empty/loading/error) | — | L |
| UX-1 | Home & dashboards enrichment | UX-0 | M |
| UX-2 | Events register + detail subroutes enrichment | UX-0 | L |
| UX-3 | Suppliers section enrichment | UX-0 | M |
| UX-4 | Tasks section enrichment (board/gantt/calendar switch) | UX-0 | M |
| UX-5 | Finance section enrichment (charts + inline line items) | UX-0 | M |
| UX-6 | Sales pipeline (leads/proposals/rfqs/forms) enrichment | UX-0 | M |
| UX-7 | Venues + venue-management enrichment (map/gallery/calendar) | UX-0 | M |
| UX-8 | Library · Inbox · Reports · Team enrichment | UX-0 | M |
| UX-9 | Settings (18 pages) premium pass | UX-0 | M |
| UX-10 | Admin console enrichment | UX-0 | M |
| UX-11 | Marketing / public pages premium upgrade | — | M |
| UX-12 | Auth + onboarding premium pass | — | S |
| UX-13 | V1.5 consumer/ticketing pages (premium from day one) | UX-0, 15-* | M |
| UX-14 | V2 marketplace pages (premium from day one) | UX-0, V2-* | M |

**Acceptance (per UX spec):** every register page has view-switcher + filter bar + saved views +
bulk actions + inline edit + export; every detail page has entity hero + right rail + activity timeline;
every dashboard has KPI strip + chart + premium empty state; locations show maps, people show avatars,
files show galleries; mobile transforms verified (table→cards, gantt→list).

---

## Detail-Page Depth & Expansion track (DD) — core sections go deep

The core entities (Event, Venue, Team, Supplier, Finance) become **full multi-tab command centres**
— every sub-section, rich components, picture/media management, inline editing everywhere, maps,
schedules, related-entity tables. Detail in `docs/audits/UX_ENRICHMENT_AUDIT.md` §"Detail-page depth maps".

| ID | Spec | Depends | Effort |
|----|------|---------|--------|
| DD-1 | **Event detail command centre** — full tab set (below) | UX-0, V1-7 | XL |
| DD-2 | Event register depth (multi-view, per-row quick actions, saved views, bulk) | UX-0 | M |
| DD-3 | Venue (planner CRM) detail depth | UX-0 | L |
| DD-4 | Venue-management (operator) detail depth | UX-0 | XL |
| DD-5 | Team & staffing depth (directory + member detail + roles matrix + shifts + time-tracking) | UX-0 | L |
| DD-6 | Supplier detail depth | UX-0, V1-8 | L |
| DD-7 | Finance detail depth (invoice/quote command centre) | UX-0 | M |
| DD-8 | Cross-entity media + inline-edit layer (every entity) | UX-0 | M |

### Detail-page tab maps

**DD-1 Event detail** — Overview (hero + venue `CoverImage`/`MapView` + health `GaugeCard` + KPIs +
key contacts `Avatar`s) · Brief (rich + AI) · Schedule/Run-sheet (`GanttChart`/lanes, `DragDrop`,
inline edit) · **Suppliers** (assigned, RFQs, quote-comparison, per-supplier payment status) ·
Tasks (`KanbanBoard`) · **Finance** (budget-vs-actual `BarChart`, this event's **quotes/invoices/
payments/payment-schedules**, margin `GaugeCard`) · **Tickets** (types, sales `Sparkline`, attendees —
V1.5) · **Guests** (RSVP, meal, dietary, seat) · **Floor-plan/Seating** (drag-drop canvas) ·
Mood-board (`PhotoGallery`) · **Staffing** (crew `Avatar`s, shift `GanttChart`, availability) ·
**Logistics** (transport, deliveries, load-in/out schedule) · **Documents/Media** (gallery + files) ·
**Comms** (client + supplier threads, `SplitPane`) · Expenses (`DonutChart` + receipts) ·
Activity/Audit (`TimelineView`) · Insights (per-event analytics).

**DD-3/DD-4 Venue** — Overview (`PhotoGallery` + `MapView` + capacity `GaugeCard` + pricing) ·
**Spaces/Rooms** (inventory cards w/ photos, per-space capacity/layout) · **Availability calendar**
(double-booking block) · **Bookings** (`DataTable`/board → booking detail) · **F&B packages/menus** ·
**Documents** (insurance/floorplan/H&S/certs + expiry `StatusBadge`) · Pricing & rate cards ·
**Events held** (history `TimelineView`) · Staff assignments (operator) · Notes pinboard ·
Financials/payouts + occupancy `Heatmap` (operator) · Reviews (V2) · Activity.

**DD-5 Team** — Directory (member `CardGrid` + `Avatar` + role + workload `Sparkline`) · **Member
detail** (profile, assigned events/tasks, workload `BarChart`, availability `CalendarView`,
performance `GaugeCard`) · Roles & permissions matrix grid · **Shift scheduling** (`GanttChart`/
calendar, conflict detection) · Time-tracking / clock-in · Seats & invites · Activity.

**DD-6 Supplier** — Overview (hero + health `GaugeCard` + rating) · Contacts (multi) · Services &
rate cards · **RFQs/Quotes** (comparison `BarChart`) · Events history · **Documents + insurance
health** (`Heatmap`) · Availability/blocked dates (`CalendarView`) · Contracts · Performance scoring
(`LineChart`) · Payments · Ratings/reviews · Portal access · Activity.

**DD-7 Finance (invoice/quote)** — Line items (`InlineEditCell`) · **Payment schedule** (progress
`GaugeCard`, instalments) · Payments · **Reminders/dunning** (`TimelineView`) · Pay-link (`CopyButton`) ·
Files · PDF preview · Activity.

---

## Platform & Access track (PA) — onboarding, affiliate, admin, identity

Unified identity across personas + the platform/admin surfaces.

| ID | Spec | Depends | Effort |
|----|------|---------|--------|
| PA-1 | **Onboarding — full build/upgrade (persona-aware)** | F1, F3 | L |
| PA-2 | **Affiliate section (full)** — partner dashboard, links, conversions, payouts | F2 | L |
| PA-3 | **Affiliate login + unified identity** (one auth → workspace / customer / affiliate) | F1, PA-2 | M |
| PA-4 | **Admin login page** (obfuscated route + MFA/step-up gate) | F4 | M |
| PA-5 | **Platform admin workspace — complete & harden** (all governance surfaces) | F4 | L |

- **PA-1 Onboarding:** persona router (organizer / venue / supplier / consumer / affiliate) → tailored
  steps; account → workspace (type) → role → plan/trial → demo-data → first-value (first event/listing) →
  invite team → complete. `Stepper`, progress save/resume, illustrations, celebratory success, activation
  tracking (`compute_workspace_activation`, `mark_workspace_activated`). Upgrade existing `onboarding/*`.
- **PA-2 Affiliate:** full section (`affiliate_accounts`, `affiliate_links`, `affiliate_clicks`,
  `affiliate_conversions`, `affiliate_payouts`, `affiliate_tax_forms`): partner dashboard (earnings
  `LineChart`, clicks→conversions `FunnelChart`), link generator + `CopyButton`, payout requests, tax forms,
  marketing assets; admin side already at `/admin/affiliates`.
- **PA-3 Unified identity:** one Supabase auth that resolves to the right surface — workspace member,
  consumer buyer account, and/or affiliate — from a single login; affiliate-login entry + linking; role/persona
  switcher. Integrates affiliate into both workspace and customer login.
- **PA-4 Admin login:** dedicated hardened admin entry (obfuscated path like Propvora's `bw-console-x9f3`),
  platform-admin identity check + mandatory MFA/step-up; `platform_admin_not_before` / `admin_session_is_fresh`.
- **PA-5 Platform admin workspace:** complete the `/admin/*` console as a first-class governance workspace —
  customers, workspaces, subscriptions, affiliates, support, feature flags, system health, AI/automation/storage
  usage, security, audit, moderation/verification (for V2), with cross-workspace service-role access + audit.

---

## Public Discovery & Growth track (PD)

| ID | Spec | Ver | Depends | Effort |
|----|------|-----|---------|--------|
| 15-9 | **Public events calendar + embeddable widget** (per-organizer) | V1.5 | 15-2 | M |
| V2-8 | **Public events directory + calendar + map** (cross-organizer) *(expanded)* | V2 | 15-3 | L |
| PD-1 | SEO/growth surface — sitemaps, structured data, share/OG, landing SEO | V1.5 | 15-2 | M |

- **15-9:** consumer-facing public calendar of an organizer's published events (month/list/map), filter by
  type/date/location, ticket CTA; **embeddable widget/iframe + share link** for the organizer's own website —
  feeds the leads + ticket funnel. The standalone public events calendar requested.
- **V2-8 (expanded):** aggregated cross-organizer discovery — searchable **directory + public calendar + map**,
  category/geo/date `FilterBar`, featured slots, consumer purchase entry. The platform-wide public events calendar.

---

## World-Class Differentiators track (WC) — beat the competition / make it unbeatable

Curated high-impact features no SMB competitor combines (see `docs/audits/COMMERCIAL_DEPTH_AUDIT.md`).

| ID | Spec | Effort | Why it wins |
|----|------|--------|-------------|
| WC-1 | **AI Proposal Generator** (event data → full proposal) | M | Highest-revenue AI use case; nobody at SMB price |
| WC-2 | **AI ops intelligence** — NL Q&A, supplier-chase, risk detection | M | "What's overdue for Carter Wedding?"; AI that knows the whole event |
| WC-3 | **Two-way SMS** (Twilio) client/supplier comms + reminders | M | Releventful's differentiator; 88% prefer mobile |
| WC-4 | **Embeddable widgets** — booking/lead capture, RSVP microsite, calendar | M | Grows funnel on organizer's own site |
| WC-5 | **Public API + webhooks + integrations marketplace** | L | Enterprise requirement; ecosystem lock-in |
| WC-6 | **White-label + custom domains** (portals + public pages) | M | Agency/Enterprise upsell |
| WC-7 | **Multi-currency + i18n** | L | International expansion beyond UK |
| WC-8 | **Native mobile / app-store wrapper** (event-day + scanner) | L | Field-ops + check-in mobile parity |
| WC-9 | **Advanced BI / custom dashboards + benchmarks** | M | "How's my business?" at renewal; industry benchmarks |
| WC-10 | **Event-experience depth** — badge printing, hybrid/livestream, sustainability tracking | L | Moves Gala Dock up-market vs Cvent/Momentus |

---

## Internationalisation & Country Packs track (INTL) — full integration into every module

Localise the entire platform (currency, tax, legal/compliance, language, RTL, dates/numbers,
payment methods, holidays) and integrate it into **every domain and module** — finance, tax,
invoicing, legal, calendar/scheduling, forms, portals, marketing, admin. V1 ships en-GB / GBP only;
all other countries roll out behind INTL flags. Registry: `src/lib/i18n/countries.ts`.

**Coverage (24 countries, 5 regions):**
- **UK** — United Kingdom (baseline).
- **NA** — United States, Canada.
- **EU** — France, Germany, Belgium, Spain, Portugal, Italy, Sweden, Denmark, Finland, Austria, Hungary, Croatia, Greenland.
- **EFTA** — Switzerland.
- **GCC** (RTL/Arabic) — UAE, Saudi Arabia, Qatar.
- **APAC** — Thailand, Japan, Taiwan, Singapore.

| ID | Spec | Depends | Effort |
|----|------|---------|--------|
| INTL-0 | **i18n/l10n foundation** — country registry, locale resolver (workspace+user+URL), locale-aware formatters, translation infra (next-intl/ICU), RTL, timezone | F1 | L |
| INTL-1 | **Translation catalogs** for all target languages + RTL layout pass (Arabic) | INTL-0 | L |
| INTL-2 | **Multi-currency & regional payments** — currency per country, FX display, Stripe local methods (SEPA, iDEAL, Bancontact, Klarna, PayNow, PromptPay, Konbini…) | INTL-0, V1.5-4 | L |
| INTL-3 | **Tax engine + e-invoicing** — VAT/GST/sales-tax per country + mandated e-invoice schemes (ZATCA, FatturaPA/SdI, Factur-X, GUI, JCT qualified invoice, InvoiceNow) | INTL-0 | XL |
| INTL-4 | **Legal & compliance country packs** — privacy-regime mapping (GDPR, CCPA/CPRA, PIPEDA/Law-25, PDPA, PDPL, APPI, nFADP), consent/cookies per region, consumer-rights, data residency, per-country legal pages | INTL-0 | L |
| INTL-5 | **Locale data integration** — public holidays, address/phone formats, week-start, measurement units wired into calendar/scheduling/forms | INTL-0 | M |
| INTL-6 | **Country rollout & gating** — per-country enablement via the flag resolver + region, workspace country setting, admin controls, data-residency routing | F1, INTL-0 | M |
| INTL-7 | **Region packs** — NA · EU · EFTA · GCC · APAC bundles (currency + tax + legal + language + payment methods + holidays per country) | INTL-2..6 | XL |

**Acceptance:** every money value formats in the workspace's currency/locale; every invoice meets the
country's tax + e-invoicing rules; legal/consent surfaces match the country's privacy regime; Arabic
markets render RTL; nothing enables until its country flag is on. Replaces the single `WC-7` line
(now folded into this track).

---

## Enterprise re-scope: Copilot & Automations
- **V1-2 AI Copilot** is re-scoped to an **agent-OS** (brain over slash commands; chat + slash actions;
  context graph; planner/executor; memory; per-execution credits; MCP adapters; navigation + form-aware).
  Provider = **NVIDIA NIM** (verified). One section, **Inbox/Copilot tab switch**. 8 build phases.
  Spec: `docs/specs/COPILOT_ARCHITECTURE.md`. Built so far: AI provider, slash-command registry, chat fn.
- **V1-3 Automations** is re-scoped to a **full canvas platform**: recipe/template library + drag-drop DAG
  builder + **50–150 nodes** + **50–150 templates**, wired to Supabase/edge/cron/queues/webhooks/audit/AI.
  Spec: `docs/specs/AUTOMATIONS_ARCHITECTURE.md` (+ AGENTS.md §7 node catalogue & 220-point contract).

## Source documents (canonical references)
- `docs/audits/BUILD_COMPLETION_STATUS.md` — what shipped to date
- `docs/audits/BUILD_GRADE_REPO_AUDIT.md` — repo/build-quality audit
- `docs/audits/COMMERCIAL_DEPTH_AUDIT.md` — competitive intel & feature gaps
- `docs/audits/UX_ENRICHMENT_AUDIT.md` — route-by-route visual/UX enrichment (this track)
- `docs/plans/FEATURE_BUILD_PLAN.md` — 4,248-line step-by-step build plan (Levels 1–15)
- `docs/MASTER-PLAN.md` — V1/V1.5/V2 versioning, user types, pricing, flagging
- `docs/COMMERCIAL-AUDIT-2026-06.md` — Propvora benchmark & gap analysis

---

## Suggested execution order
F1 → F2 → F3 → F4 → (V1-1, V1-2 in parallel) → V1-3 → V1-4/5 → V1-6/7/8 → V1-9/10/11/12
→ 15-1 → 15-2 → 15-3 → 15-4 → 15-5/6/7 → 15-8
→ V2-1 → V2-2 → V2-3 → V2-4 → V2-5 → V2-6 → V2-7 → V2-8 → V2-9 → V2-10
