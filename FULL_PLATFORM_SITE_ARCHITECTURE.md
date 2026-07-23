# Gala Dock — Complete Site, Route & Feature Architecture

**Document status:** Architecture baseline and implementation blueprint  
**Product:** Gala Dock — Event Delivery OS and multi-sided event platform  
**Canonical route namespace:** `/event-manager/*` for workspace surfaces; `/organizer/*`, `/venue/*`, and `/supplier/*` are persona shell entry points; public, portal, buyer, affiliate, and admin surfaces remain separate.  
**Evidence basis:** `plan.md`, `docs/MASTER-PLAN.md`, `docs/specs/README.md`, `src/app`, and `src/lib/nav/app-nav.ts`, inspected 23 July 2026.  
**Status legend:** **Implemented** = an application route exists; **Shell Exists** = a route/shell is present but requires functional verification; **Planned** = architecture agreed but not release-ready; **Flagged** = hidden unless its server-side flag, release stage, workspace type, plan, and role allow access; **Verify** = exists but no release evidence claim is made.

## 1. Product, tenancy, and access model

1. **Organizer workspace (V1):** the primary paid SaaS workspace. It owns events, clients, suppliers, delivery, finance, documents, collaboration, and portals.
2. **Venue operator workspace (V2):** a business workspace for venue inventory, availability, bookings, F&B packages, listings, and payouts. It is not a client portal.
3. **Supplier workspace (V2):** a business workspace for services, RFQs, quotes, jobs, availability, listing performance, and payouts. It is not a client portal.
4. **Buyer account (V1.5):** a consumer identity with tickets, orders, saved events, and preferences; it never receives a workspace.
5. **Portals:** scoped, token-based external collaboration surfaces for one event or relationship: client, supplier, venue, proposal sign-off, form completion, and check-in.
6. **Platform Admin:** a separate, MFA/step-up protected governance surface.

All protected workspace requests resolve access in this order: authenticated identity → workspace membership/type → role → release-stage/feature flag → plan/add-on → parent record ownership → RLS/API validation. A hidden navigation item must also be unavailable by direct URL, search, automation, export, and API call.

## 2. Release stages, plans, and feature gates

| Release | Customer value | Major capabilities | Gate |
|---|---|---|---|
| V1 | Event delivery SaaS | Organizer, events, suppliers, venues, tasks, finance, portals, calendar, PWA | Starter/Growth; AI and automations Scale |
| V1.5 | Ticketing and buyer layer | Public event pages, ticket inventory, checkout, QR, seating, buyer account | Ticket sale Scale; buyer free |
| V2 | Marketplace platform | Venue/supplier workspaces, listings, booking, payouts, trust, directory | workspace type + marketplace flag + transaction terms |
| Enterprise | Governance and expansion | SSO, white label, country packs, GL/export, advanced packs | Enterprise/Agency + named flag |

Feature resolver contract: resolve once in the server layout using `workspace_type`, `release_stage`, plan, add-ons, per-workspace overrides and environment master switches. Required flags include `calendarHub`, `aiCopilot`, `automationsBuilder`, `ticketing`, `marketplaceVenue`, `marketplaceSupplier`, `escrow`, `hybridEvents`, `corporateProgrammes`, `conferenceOps`, `liveEntertainment`, `sportsEvents`, `travelOps`, `cateringOps`, `eventControl`, and `eventMarketing`.

## 3. Route conventions and universal page contract

1. **Workspace:** `/event-manager/{section}` and `/event-manager/{section}/{id}`. Legacy paths redirect only where implemented; never create duplicate live routes.
2. **Persona shell:** `/organizer/*`, `/venue/*`, `/supplier/*` route to the selected workspace experience and preserve workspace context.
3. **Public:** `/e/{slug}`, `/discover`, `/f/{formToken}`, `/p/{proposalToken}`, `/build/{eventId}`. Do not expose private workspace IDs.
4. **Portals:** `/portal/{token}`, `/supplier-portal/{token}`, `/venue-portal/{token}`, `/check-in/{token}`. Tokens must expire, revoke, and return only a minimum DTO.
5. **Admin:** `/admin/*`; login is distinct and requires platform-admin authorization.

Every route must have: page header and breadcrumb; role- and entitlement-aware actions; a useful empty, loading, error, no-access and upgrade state; UK locale formatting in V1; workspace-scoped data; keyboard/touch support; audit logging for sensitive mutations; and route-level error containment. Register pages use a filter bar, search, sort, view switcher, saved view where valuable, export, and paginated/stable queries. Detail pages use an entity hero, related records, activity/audit, and only genuinely useful tabs.

## 4. Organizer workspace side-navigation register

| No. | Group / section | Canonical route | Purpose and commercial value | Key children | Roles | Status |
|---:|---|---|---|---|---|---|
| 1 | Overview / Home | `/event-manager/home` | Command centre for delivery health, workload, cash and next actions; improves retention and operating speed. | activity, alerts | all members | Implemented / Verify |
| 2 | Calendar | `/event-manager/calendar` | Cross-event dates, capacity, deadlines and availability; prevents clashes. | month, week, day, agenda, iCal | delivery roles | Flagged (`calendarHub`) |
| 3 | Sales | `/event-manager/leads` | Captures demand and converts qualified enquiries to events and proposals. | leads, proposals, forms | sales/admin | Implemented / Verify |
| 4 | Events | `/event-manager/events` | The event lifecycle register and launchpad for command centres. | enquiries, live, completed, cancelled | delivery roles | Implemented / Verify |
| 5 | Suppliers | `/event-manager/suppliers` | Sourcing, RFQ and supplier-performance control; supports faster procurement and lower delivery risk. | RFQs, rate cards, docs | commercial roles | Implemented / Verify |
| 6 | Venues | `/event-manager/venues` | Planner venue CRM, availability and suitability comparison; improves booking conversion. | profiles, holds, rooms | delivery/commercial | Implemented / Verify |
| 7 | Marketplace | `/event-manager/marketplace` | Buyer discovery and booking of external supply; V2 commission surface. | services, venues, quote requests | commercial roles | Flagged (`marketplaceSupplier`) |
| 8 | Tasks | `/event-manager/tasks` | Cross-event delivery workload and accountability. | board, calendar, templates | team members | Implemented / Verify |
| 9 | Finance | `/event-manager/finance` | Quotes, invoices, deposits, payments and profitability; supports subscription value and governance. | cashflow, profit, ticket sales | finance roles | Implemented / Verify |
| 10 | Inbox | `/event-manager/inbox` | Human communication hub with traceable event context. | threads | permitted members | Implemented / Verify |
| 11 | Automations | `/event-manager/automations` | Approval-first rules and runs; increases operational efficiency. | recipes, builder, runs | Scale/admin | Flagged (`automationsBuilder`) |
| 12 | Team | `/event-manager/team` | Capacity, skills, staffing and permissions management. | members, availability, workload | owner/admin/manager | Implemented / Verify |
| 13 | Settings | `/event-manager/settings` | Workspace, account, billing, security, governance and reusable defaults. | 17 settings pages | owner/admin; account items self-service | Implemented / Verify |

`Library` remains a verified current route (`/event-manager/library`) but is an architecture duplicate: migrate its files, templates, packs, supplier documents and brand assets into **Settings → Assets & templates** before adding new navigation. Do not expose it as a future first-level side-nav item.

## 5. Organizer section specifications

| Section | Route and views | Required components / actions | Core entities and access | Status |
|---|---|---|---|---|
| Home | `/event-manager/home`; dashboard | KPI strip, health chart, upcoming timeline, cash/risk cards, quick create; open event/task/invoice | workspace events, tasks, invoices, activity; all members see role-safe aggregates | Implemented / Verify |
| Calendar | `/event-manager/calendar`; month/week/day/agenda | calendar, filters, date range, iCal export/import, conflict indicator; open/create related record | events, schedule items, tasks, bookings, availability; Growth + calendar flag | Shell Exists / Flagged |
| Sales | `/event-manager/leads`; table, pipeline, card | lead stage filters, assignment, conversion, proposal/form links, import/export | leads, contacts, proposals, forms; sales roles | Implemented / Verify |
| Events | `/event-manager/events`; table, card, calendar | saved views, lifecycle filters, bulk actions, event create, duplicate/archive/export | events, templates, client contacts; event team | Implemented / Verify |
| Suppliers | `/event-manager/suppliers`; table, cards, comparison | category/availability/risk filters, supplier create, invite, RFQ, scorecard, document check | suppliers, contacts, RFQs, quotes, credentials; commercial roles | Implemented / Verify |
| Venues | `/event-manager/venues`; table, cards, map | map/search, capacity/date filters, create venue, hold, compare | venues, rooms, holds, event history; delivery/commercial | Implemented / Verify |
| Marketplace | `/event-manager/marketplace`; search, cards, map, comparison | search/filter, listing detail, RFQ/request quote, checkout; transparent fee and upgrade states | public approved listings, booking/RFQ; V2 flag/entitlement | Implemented routes / Flagged |
| Tasks | `/event-manager/tasks`; table, kanban, calendar, gantt | filters, bulk assign/status, inline edit, template create, task create | tasks, assignees, event links; role-based mutation | Implemented / Verify |
| Finance | `/event-manager/finance`; dashboard, table, cashflow | quote/invoice/deposit/payments, line editor, approvals, PDF/export, payment links | money documents, payments, schedules, expenses; finance roles, Growth+ | Implemented / Verify |
| Inbox | `/event-manager/inbox`; split thread view | thread filters, message compose, attachments, event links, assignment | conversations/messages; participants only | Implemented / Verify |
| Automations | `/event-manager/automations`; recipes, builder, run log | create from recipe, draft/publish/pause, approval, error/retry, usage | automations, runs, credentials; Scale/admin | Implemented routes / Flagged |
| Team | `/event-manager/team`; directory, workload, availability | invite, role editing, workload/availability, staffing request | memberships, roles, skills, shifts; owner/admin/manager | Implemented / Verify |
| Settings | `/event-manager/settings`; settings nav | workspace, team, roles, billing, branding, security, audit, notifications, defaults, exports, AI, usage | workspace/configuration/audit; narrowly scoped | Implemented / Verify |

### 5.1 Event command centre — required detail-page register

**Base route:** `/event-manager/events/{eventId}`. The profile cross-references client, venue, team, guests, tickets, suppliers, tasks, schedule, finance, documents, communications, automations and audit. Its primary outcome is profitable, compliant delivery of one event.

| No. | Detail tab / route suffix | Purpose, principal components and actions | Access / gate | Status |
|---:|---|---|---|---|
| 1 | `overview` | Executive event health: hero, KPIs, venue map, timeline, risk and next actions; edit summary. | event team/client-safe DTO | Implemented / Verify |
| 2 | `brief` | Objectives, scope, client requirements, approvals and source documents; edit/approve. | event team + client per portal | Implemented / Verify |
| 3 | `schedule` | Run sheet, cues, dependencies and owners in timeline/Gantt/agenda; add/reorder cue. | event team | Implemented / Verify |
| 4 | `suppliers` | Assigned suppliers, RFQs, quote comparison, appointment and payment status; invite/appoint. | commercial roles | Implemented / Verify |
| 5 | `tasks` | Event-scoped board/table/calendar; assign, complete and escalate. | event team | Implemented / Verify |
| 6 | `finance` | Budget vs actual, quotes, invoices, payments, margin and approval trail; add cost/approve. | finance roles | Implemented / Verify |
| 7 | `tickets` | Ticket types, inventory, sales and attendee links; create tier/publish. | Scale + ticketing | Implemented route / Flagged |
| 8 | `guests` | RSVP, dietary, accessibility, household, meal and seat information; import/invite. | restricted event roles | Implemented / Verify |
| 9 | `floor-plan` | Capacity, tables/seats and reserved-seat assignment; edit plan. | Growth + ticketing where sold seating | Implemented route / Flagged |
| 10 | `mood-board` | Approved visual direction and supplier/client collaboration; upload/comment. | event team/client safe | Implemented / Verify |
| 11 | `staffing` | Crew roster, shifts, availability and conflicts; assign shift. | manager roles | Implemented / Verify |
| 12 | `logistics` | Load-in/out, transport, deliveries, equipment and dependencies; update milestone. | operations roles | Implemented / Verify |
| 13 | `documents-media` | Event files, brand assets, plans and approvals; signed upload/download. | record-scoped roles | Implemented / Verify |
| 14 | `comms` | Client/supplier threads and operational messages; send/assign. | participants only | Implemented / Verify |
| 15 | `expenses` | Receipts, categorisation, reconciliation and approval; add/approve expense. | finance roles | Implemented / Verify |
| 16 | `activity` | Human-readable, linkable activity and immutable audit events; filter/export. | role-safe audit | Implemented / Verify |
| 17 | `insights` | Event performance, delivery health and commercial outcome; export report. | manager/finance | Implemented / Verify |
| 18 | `beo` | Event order / operational pack with versioned, printable delivery detail; generate/approve. | delivery and approved client/vendor access | Implemented / Verify |
| 19 | `event-day` | Compact live control mode, checklist, incident links and offline queue; acknowledge/update. | event-day roles | Implemented / Verify |
| 20 | `event-map` | Location map, entrances, zones and wayfinding; edit/share safe view. | event team; attendee-safe projection | Implemented / Verify |
| 21 | `check-in` | Door scanning, arrivals, duplicate detection and offline sync; scan/override with audit. | authorised check-in staff | Implemented / Verify |
| 22 | `publish` | Public visibility, SEO/OG, ticketing readiness and publishing controls; publish/unpublish. | owner/manager; ticketing gate | Implemented / Verify |
| 23 | `extensions/{pack}` | Flagged vertical-pack home: set-up, live controls, related data and audit. | pack-specific role/flag | Shell Exists / Flagged |

### 5.2 Other profiles and detail pages

| Entity | Base route | Required sub-tabs | Primary actions | Status |
|---|---|---|---|---|
| Venue (planner CRM) | `/event-manager/venues/{venueId}` | overview, gallery & spaces, rooms, holds, events, documents, commercial records, maps & access, notes, activity | edit, hold, compare, attach venue to event | Implemented / Verify |
| Venue operator record | `/event-manager/venue-management/{venueId}` | overview, inventory/spaces, availability, bookings, F&B, pricing, documents, staff, payouts, activity | manage availability, pricing and booking | Implemented shell / Verify |
| Supplier | `/event-manager/suppliers/{supplierId}` | overview, contacts, services/rates, RFQs & quotes, event history, documents & insurance, availability, contracts, scorecard, payments, portal, activity | edit, invite, RFQ, appoint, score | Implemented shell / Verify |
| Lead | `/event-manager/leads/{leadId}` | overview, contacts, qualification, activity, proposals, linked event | qualify, convert, assign, create proposal | Implemented / Verify |
| Proposal | `/event-manager/proposals/{proposalId}` | overview, content, pricing, approvals, files, activity | edit, send, approve, create event | Implemented / Verify |
| RFQ | `/event-manager/rfqs/{rfqId}` | overview, recipients, responses, comparison, appointment, activity | invite, compare, award | Implemented / Verify |
| Quote / invoice | `/event-manager/finance/{quotes|invoices}/{id}` | line items, schedule, payments, reminders, files/PDF, activity | edit, send, pay, void/refund per policy | Implemented / Verify |
| Task | `/event-manager/tasks/{taskId}` | overview, subtasks, files, comments, activity | assign, edit, complete | Implemented / Verify |
| Team member | `/event-manager/team/members/{memberId}/overview` | overview, roles & skills, schedule, workload/activity | role, skill, availability and staffing updates | Implemented / Verify |

## 6. Creation-wizard register

All wizards require a stepper, back/next, draft persistence, validation, cancel/abandon confirmation, duplicate detection where relevant, review, idempotent submit, success/error recovery, responsive layout, and server-side permission checks.

| No. | Wizard / route | Launch points | Steps | Result and default state | Permission / status |
|---:|---|---|---|---|---|
| 1 | Create Event — `/event-manager/events/new` | Events, Home quick action, command menu, converted lead | Basics; dates/venue; brief; team/client; finance; review | event in `draft`; opens overview then enables detail tabs | delivery roles; Implemented / Verify |
| 2 | Create Lead — `/event-manager/leads/new` | Sales, command menu, imported/form workflow | contact; enquiry; qualification; ownership; review | lead in `new`; follow-up task optional | sales roles; Implemented / Verify |
| 3 | Create Proposal — `/event-manager/proposals/new` | Sales, lead, event, command menu | client/event; scope; pricing; terms; review/send | draft proposal; send/sign actions unlock | sales/finance; Implemented / Verify |
| 4 | Create Supplier — `/event-manager/suppliers/new` | Suppliers, event sourcing | identity; contacts; services; docs; review | supplier `prospect`; RFQ and scorecard unlock | commercial roles; Implemented / Verify |
| 5 | Create Venue — `/event-manager/venues/new` | Venues, event sourcing | details; address/map; spaces; capacity/rates; review | venue `active`; holds/event links unlock | delivery/commercial; Implemented / Verify |
| 6 | Create RFQ — `/event-manager/rfqs/new` | Suppliers, event suppliers, marketplace | requirements; event/date; recipients; terms/files; review | RFQ `draft` then `sent`; response workflow unlocks | commercial roles; Implemented / Verify |
| 7 | Create Task — `/event-manager/tasks/new` | Tasks, event, Home, command menu | basics; assignment; dates/dependencies; review | task `open`; notifications/rules may trigger | permitted members; Implemented / Verify |
| 8 | Create Quote — `/event-manager/finance/quotes/new` | Finance, proposal, event | customer/event; items; tax/terms; schedule; review | quote `draft`; send/approval unlocks | finance roles; Implemented / Verify |
| 9 | Create Invoice — `/event-manager/finance/invoices/new` | Finance, quote, event | customer/event; items; tax; due date/payment schedule; review | invoice `draft`; send/pay link unlocks | finance roles; Implemented / Verify |
| 10 | Create Deposit — `/event-manager/finance/deposits/new` | Finance, booking/event | payer; amount; due date; terms; review | deposit `due`; payment route unlocks | finance roles; Implemented / Verify |
| 11 | Add supplier payment — `/event-manager/finance/supplier-payments/new` | Finance, supplier/event | supplier; event; amount; due date; evidence; review | payment `scheduled` | finance roles; Implemented / Verify |
| 12 | Add timesheet — `/event-manager/finance/wages-hours/new` | Finance, staffing | worker; event/shift; hours/rate; approval; review | `submitted`; approval/payroll flow unlocks | manager/finance; Implemented / Verify |
| 13 | Create form — `/event-manager/forms/new` | Sales, command menu | purpose; fields; branding; routing; publish/review | form `draft`; public token after publish | sales/admin; Implemented / Verify |
| 14 | Create template — `/event-manager/library/templates/new` | Assets & templates | type; content; defaults; permissions; review | reusable template `active` | admin/manager; Implemented / Verify |
| 15 | Create marketplace listing — `/event-manager/marketplace/listings/new` | Marketplace Console | identity; offer; availability/pricing; documents; review | listing `pending_review`; publish only after verification | V2 seller + flag; Implemented route / Flagged |

## 7. Venue and supplier workspace architecture (V2)

These are full business workspaces, therefore they have their own finances, memberships, settings, inventory, audit, and payouts. Their routes are canonical persona shells; shared capability pages may resolve to the same underlying `/event-manager/*` implementation only when persona and RLS semantics are preserved.

| Workspace | Side navigation | Required detail areas | Commercial purpose | Status |
|---|---|---|---|---|
| Venue operator | Home; My Venues; Bookings; Availability; Marketplace Console; Suppliers; Finance; Team; Inbox; Settings | venue inventory/spaces, availability, booking lifecycle, F&B, rate cards, compliance documents, staff, occupancy/payouts, reviews | Free seller workspace monetised by 3–5% booking take-rate, promotion and later upgrades | Shell Exists / V2 Flagged |
| Supplier | Home; Jobs; RFQs; Quotes; Availability; Marketplace Console; Earnings; Team (agency only); Inbox; Settings | listing/services/rates, RFQ response, appointments/jobs, availability, insurance, contract, performance, payout, reviews | Free seller workspace monetised by 5.5% commission and featured listings | Shell Exists / V2 Flagged |

**Venue creation/onboarding:** account → legal business → venue profile → spaces/capacity → rates/availability → payout/KYC → documents → listing review → success.  
**Supplier creation/onboarding:** account → legal business → service catalogue → service area/availability → rates → insurance/verification → payout/KYC → listing review → success.  
Both flows are V2-gated, must be resumable, and must not grant a published listing or payout ability until verification and Stripe Connect requirements have passed.

## 8. Buyer, public, portal, affiliate, and admin navigation registers

### 8.1 Buyer and public

| No. | Surface / route | Purpose and actions | Status |
|---:|---|---|---|
| 1 | `/discover` | Public event discovery: search/filter approved public events; open event. | Implemented route / V2 directory flag |
| 2 | `/e/{slug}` | Public event page with event content, accessibility info, terms and ticket CTA. | Implemented / V1.5 Verify |
| 3 | `/e/{slug}/tickets` | Select ticket tier/seat; validates availability and pricing. | Implemented / V1.5 Flagged |
| 4 | `/e/{slug}/checkout` and `success` | Stripe checkout confirmation; never trusts client price. | Implemented / V1.5 Flagged |
| 5 | `/account` | Buyer home. | Implemented / Verify |
| 6 | `/account/tickets` | Multiple tickets/orders, QR wallet, transfer/refund request. | Implemented / V1.5 Verify |
| 7 | `/account/events`, `/account/saved`, `/account/settings` | Attendance history, saved events, consumer preferences. | Implemented / Verify |

### 8.2 Portals

| Portal | Route | Visible records and permitted actions | Authentication / status |
|---|---|---|---|
| Client portal | `/portal/{token}` | Only shared event summary, brief approvals, selected tasks, documents, messages and payment/proposal actions. | expiring/revocable token; Shell Exists / Verify |
| Supplier portal | `/supplier-portal/{token}` | Explicitly shared RFQ/job, availability confirmation, deliverables, selected files and messages. | expiring/revocable token; Shell Exists |
| Venue portal | `/venue-portal/{token}` | Explicit booking/hold, operational requirements, documents and messages. | expiring/revocable token; Shell Exists |
| Proposal signing | `/p/{proposalToken}` | One proposal, sign/decline, allowed comments and files. | token + immutable signing audit; Implemented / Verify |
| Form response | `/f/{formToken}` | One published form; submit response with consent. | public/tokened form; Implemented / Verify |
| Check-in | `/check-in/{token}` | Assigned event check-in only; scan, deduplicate, sync queue. | scoped staff token; Implemented / Verify |

### 8.3 Platform Admin

| Group | Routes | Responsibilities | Status |
|---|---|---|---|
| Operations | `/admin`, `/admin/support`, `/admin/system-health`, `/admin/automation-runs`, `/admin/email-logs` | operational health, support triage, constrained replay/remediation | Implemented / Verify |
| Customers | `/admin/users`, `/admin/workspaces`, `/admin/subscriptions`, `/admin/affiliates` | support and governance without uncontrolled impersonation | Implemented / Verify |
| Commercial | `/admin/subscriptions`, `/admin/affiliates` | subscription, affiliate, payout/transaction oversight | Implemented / Verify |
| Risk & compliance | `/admin/audit`, `/admin/security` | audit, abuse, security/MFA controls and incident review | Implemented / Verify |
| Product & systems | `/admin/feature-flags`, `/admin/ai-usage`, `/admin/storage-usage` | flag rollout, entitlement usage, storage/AI controls | Implemented / Verify |
| Authentication | `/admin/login` | separate admin login plus required MFA/step-up freshness | Implemented / Verify |

### 8.4 Affiliate

`/affiliate/apply`, `/affiliate/login`, and `/affiliate/dashboard` provide referral onboarding, links, click/conversion reporting, tax details and payout requests. Affiliate identity is separate from workspaces but may be linked to the same user. Status: **Implemented routes / Verify**.

## 9. Vertical event packs

Vertical packs add only additive schema, RLS, UI tabs, workflows, portal DTOs, automation hooks and evidence; none forks the Event aggregate.

| Pack / event families | Event detail home | Core capabilities | Gate / status |
|---|---|---|---|
| Hybrid, virtual, webinar | Virtual delivery | rooms, streaming, polls/Q&A, captions, recordings, time zones | Scale + `hybridEvents`; Planned |
| Corporate programmes | Corporate | portfolios, cost centres, approvals, VIP/confidential workflows, ROI | Enterprise + `corporateProgrammes`; Planned |
| Gala, banquet, fundraising | Hospitality; Fundraising | seating, F&B, auction/pledge, awards, Gift Aid | Growth/Scale; Planned |
| Wedding/private celebration | Celebration | couple portal, household RSVP, ceremony/reception, day-of workflow | Growth + `celebrations`; Planned |
| Conference/exhibition | Programme; Speakers; Exhibitors & sponsors; Networking | tracks, rooms, submissions, exhibitors, sponsors, badges, lead capture | Scale + `conferenceOps`; Planned |
| Festival/live entertainment | Production; Artists; Site & crowd; Settlements | riders, stages, crowd/weather, concessions, settlements | Scale + `liveEntertainment`; Planned |
| Sports/participation | Competition; Participants; Route & safety; Results | registrations, fixtures, waivers, timing, route/checkpoints | Scale + `sportsEvents`; Planned |
| Travel/destination | Travel & accommodation | room blocks, manifests, transfers, visa/emergency data | Enterprise + `travelOps`; Planned |
| Catering/bar operations | Hospitality | menus, dietaries, service/kitchen plans, bar/stock controls | Growth/Scale + `cateringOps`; Planned |
| Accessibility/attendee experience | Attendee experience | accessibility profiles, passes, wayfinding, help desk | all/Scale depending capability; Planned |
| Risk/safety/event control | Risk & control | incident log, permits, capacity, emergency, control-room communications | Scale + `eventControl`; Planned |
| Marketing/programmes/growth | Programmes | series, portfolios, referral/waitlist, approved Caption Fox handoff | Scale + `eventMarketing`; Planned |

## 10. Data, security, integration, and operations baseline

1. **Canonical aggregates:** workspace, event, event template, venue, supplier, contact/guest, booking, task, schedule item, document, money document, ticket/order, activity/audit, and portal link.
2. **Database contract:** each tenant record has `workspace_id`; event children also have `event_id`; use foreign keys, RLS, parent ownership tests, indexes for workspace/list filters, state-machine constraints, created/updated timestamps, audit metadata and idempotency keys for commands/payments.
3. **RLS/API tests:** positive tests for permitted role; negative tests for wrong workspace, parent, role, user, plan/add-on/flag, portal token, upload path and direct RPC/API invocation. Never rely on UI visibility.
4. **Storage:** private buckets and record/workspace-scoped paths; signed URLs; validated MIME, size and content; malware/unsupported-file failure states; upload/download audit where required.
5. **Financial integrations:** Stripe webhook signature validation, idempotency, invoice/ticket/booking reconciliation, immutable money audit. Stripe Connect, escrow and payouts remain disabled until their gated V1.5/V2 rollout and legal review.
6. **Notifications and automations:** respect preferences, test/demo suppression, role-aware recipients, rate limits, retries and correlation IDs. Automation execution is approval-first for impactful actions, loop-safe and audited.
7. **AI:** route/workspace/RLS-grounded retrieval only; metered Scale entitlement; tool commands validate permissions server-side; no cross-workspace context.
8. **Observability:** redact PII and tokens; capture front-end failures, structured server errors, slow queries, webhook/edge failures and audit/support references.

## 11. Required quality and release evidence

Every section needs an independent `release-gated/docs/{section}.md` and, if any manual work remains, `release-gated/user-fixes/{section}.md`. Evidence includes desktop (1440, 1280, 1024), tablet, mobile, and installed-PWA screenshots; tested route/action/filter/view; source tables/policies/functions/buckets; test results; performance/security findings; bugs/fixes; migrations; integrations; cross-section effects; manual steps; release score and decision.

Required test layers: unit and integration tests; persistence/idempotency tests; full customer E2E story; RLS positive and negative suites; portal/IDOR/entitlement tests; visual regression; responsive keyboard/screen-reader checks; load/query/N+1 review; safe rate-limit tests; and error/failed-network console review. A surface is only **ready for release** at 100/100 evidence, otherwise it remains **Verify**, **Flagged**, or **Planned**.

## 12. Coverage matrix

| Category | Required | Documented | Existing route/shell | Detail pages covered | Wizards covered | Portals covered | Primary gap |
|---|---:|---:|---:|---:|---:|---:|---|
| Organizer workspace | Yes | Yes | Yes | Yes | Yes | Yes | release evidence and verification |
| Venue workspace | Yes (V2) | Yes | Shell | Yes | Yes | n/a | full V2 operational implementation |
| Supplier workspace | Yes (V2) | Yes | Shell | Yes | Yes | Yes | full V2 marketplace lifecycle |
| Buyer / ticketing | Yes (V1.5) | Yes | Yes | Yes | ticket flow | n/a | payment/inventory/QR verification |
| Platform Admin | Yes | Yes | Yes | admin records | n/a | n/a | MFA, audit and operational evidence |
| Workspace settings | Yes | Yes | Yes | n/a | n/a | n/a | role/entitlement evidence |
| Portals | Yes | Yes | Shell/Yes | n/a | token flows | Yes | expiry/revocation/upload evidence |
| Public pages | Yes | Yes | Yes | event/ticket flow | checkout | n/a | SEO/payment/publication evidence |
| Vertical packs | Yes | Yes | extensions shell | planned | n/a | conditional | pack-by-pack build and RLS |

## 13. Global route, wizard, profile, workspace, and portal registers

The authoritative route register is the tables in §§4–8 and the discovered source route tree. Total counts below intentionally count **architecture route families**, rather than falsely claiming each generated app path has release verification.

| Register | Coverage |
|---|---|
| Route families | 88 documented: organizer sections, event tabs, profiles, finance/sales/task/library routes, persona shells, public/buyer/portal/admin/affiliate surfaces |
| Wizards | 15 documented creation flows |
| Profiles / detail pages | 9 entity profile families; Event includes 23 route-backed tabs |
| Workspace types | 3 business workspaces (organizer, venue, supplier) plus buyer account, affiliate identity and Platform Admin surface |
| Portal types | 6 (client, supplier, venue, proposal, form, check-in) |

## 14. Architecture decisions and remaining gaps

1. Preserve `/event-manager/*` as the verified current internal namespace. Do not implement competing `/gala-dock/{workspaceId}/*` routes.
2. Treat **Library** as a duplicate first-level concept and relocate it under Settings → Assets & templates; retain compatibility routing only while migration is active.
3. Treat Marketplace Console as one seller area with listing, enquiries, reviews, verification and payouts as sub-tabs—not duplicate Marketplace/My Listings navigation.
4. Keep the Event command centre as the only home for event-specific delivery data. Vertical packs extend it through flags; they never add a parallel event application.
5. V1.5/V2 routes already present in the tree are not a release claim. They must remain hidden and server-denied until their flag, workspace type, entitlement, payment, RLS, webhook and evidence contracts pass.
6. The largest architecture gap is release validation, not page enumeration: the supplied plan reports broad route/table delivery but explicitly lacks current 100/100 browser, RLS/IDOR, performance, integration, and release-evidence verification for most surfaces.

## 15. Definition of done for this blueprint

This architecture is complete as a Gala Dock blueprint: it defines persona boundaries, canonical route patterns, navigation, detail tabs, creation flows, commercial purpose, gates, data/security contracts, portals, admin, public/buyer surfaces, vertical packs, and release evidence expectations. Implementation completion must be tracked section-by-section using the release contract; no row marked **Verify**, **Shell Exists**, **Flagged**, or **Planned** is eligible to be represented as production-ready without its own evidence file and 100/100 release decision.
