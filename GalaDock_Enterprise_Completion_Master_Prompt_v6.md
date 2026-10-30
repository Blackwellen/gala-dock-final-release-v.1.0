# SECTION A — COMPLETE GALA DOCK CLAUDE CODE EXECUTION PROMPT

The section below is the complete standalone instruction to paste into Claude Code. Start at the product-specific directive. The universal audit programme is included in full as a binding QA annex; Gala Dock decisions in GD-00 through GD-20 override generic contradictions.

# GALA DOCK — ENTERPRISE COMPLETION, WORKSPACE-BY-WORKSPACE FUNCTIONAL AUDIT & 1:1 DESIGN RECOVERY
## Product-specific execution directive | 26 October 2026 | Claude Code master programme

> **START HERE.** This is an engineering execution instruction for Claude Code working inside the **real Gala Dock repository**. It is not a request to write another prompt, roadmap, assessment, or UI mockup. Inspect, trace, implement, test, fix, retest, and preserve evidence. The comprehensive Universal SaaS QA Baseline reproduced later in this file remains binding where applicable. **This Gala Dock directive takes precedence** over any baseline wording that is generic or conflicts with these product-specific decisions.

## GD-00. The non-negotiable release objective

Gala Dock is an integrated event discovery, planning, ticketing, venue hire, supplier-services and event-operations platform. Its users are not one homogeneous SaaS persona. The customer-facing event marketplace, event organiser/operator, venue operator, solo supplier, agency supplier, affiliate, platform admin and invited external portals have separate journeys and permission boundaries. **Audit and complete each separately**, then verify the multi-party handoffs that connect them. Do not label a beautiful dashboard “working” when the attached data, backend, payment, notification, or cross-role outcome is fake, missing, stale, or unsecured.

Current reported condition: **many functional pathways are incomplete or broken; implemented pages still fall materially short of the approved designs.** Treat these as unverified defects until independently measured. Use actual browser and backend evidence, not prior completion claims. Establish a reproducible *as-found baseline* before editing; record objective before/after measures, changes and regression.

The final result must prove all three independent dimensions:

1. **Visual fidelity:** approved design → implemented UI, for shell, page, states, responsive variants and microinteractions, as near to 1:1 as technically and accessibly possible.
2. **Functional depth:** user intention → affordance → validated action → authoritative state mutation or response → permitted downstream views → notifications/history/audit → repeatable test.
3. **Operational release readiness:** secure permissions, payments, privacy, reliability, incident/restore, accessible PWA, monitoring, migrations, CI, documentation and honest release gates.

No blanket “all done.” Every issue must have evidence or remain openly outstanding. One Claude Code development agent at a time, no spawned development subagents, unless later expressly authorised. The Gala Agent **product runtime** may itself use controlled concurrent and delegated jobs; this is separate from the engineering-agent limit.

### GD-00.1 Evidence and design source priority

1. Approved, latest, page-specific Gala Dock designs and their explicit annotations.
2. Latest approved product specifications, route/shell/component documents and design tokens.
3. Latest explicit user product decisions, including provider unification and distinct role modes.
4. Actual repository architecture and current production/staging behaviour, used to establish reality, **not to excuse missing requirements**.
5. Older concepts only when not superseded; record conflicts instead of silently choosing a vintage.

Locate designs from the repository, project docs and authorised asset locations. Do not assume all files are immediately present. Build a **design-source manifest** with source file, image dimensions, capture variant, date/version, intended route/state and confidence. If reference is genuinely unavailable, flag that route as **reference-blocked** while still fixing verifiable usability and functional defects. Never fabricate a 1:1 score for pages without a reference.

### GD-00.2 Canonical identity and workspace resolution

Discover actual route roots. Historical approved examples include `/organizer/*`, `/venue/*`, `/supplier/*`, customer/public routes and admin routes; newer shells may use a unified `/provider/*` with Venue/Services mode. **Do not create duplicate route trees solely to match historical examples.** Map aliases and canonical routes in the audit. Preserve valid deep links with explicit redirects if needed.

Required persona/role distinctions:

| Surface | Scope | Important distinction |
| --- | --- | --- |
| Public marketing & marketplace | Unauthenticated visitors | Discover events, venues, providers, marketing, SEO, legal and accessible conversion paths. |
| Customer | Attendee, ticket buyer, guest, private event planner | Consumer **top navigation**; no back-office sidebar. Discovery, ticket wallet and booking/purchase experiences. |
| Organiser / Event Operator | Event owner, manager, planning, finance, marketing, gate staff | Operational sidebar, event lifecycle and inventory/sales/people/finance. Owns event records. |
| Venue Operator | Venue business, location/space manager | Provider/venue mode or dedicated venue shell. Owns venue inventory, enquiries, holds, event occupancy and venue commerce. |
| Solo Supplier | One-person service business | Provider/service mode, enquiries, quotes, commitments, calendar, delivery and earnings. |
| Agency Supplier | Multi-member supplier business | Services plus member roles, staffing, assignments, capacity, approvals and split/pooled finances. |
| Affiliate / Partner | Referral partner, promoter | Independent tracking/earnings/links and campaign attribution; does not inherit event or provider record access. |
| Platform Admin | Superadmin, operations, finance, support, trust/safety | Dedicated high-density controlled admin shell; privileges segmented and audited. |
| Invited portals | Client, guest, staff, volunteer, artist, exhibitor, sponsor, supplier, promoter | Narrow, invite/token-scoped record surfaces, not a general business workspace. |

Allow a human to hold multiple roles/workspaces. Verify switching, invitations, pending memberships, account deletion/transfer, last-active workspace, impersonation controls (if implemented), and no tenant data carried into another workspace through cache, URL, RLS or agent context. Distinguish **workspace membership, workspace business mode, event-level assignment and portal capability**. Never infer authorisation from a route prefix or role label in the browser.

## GD-01. Mandatory inventory and defect accounting, separately for every workspace

Generate an actual crawl/inventory: **Workspace → Shell → Module → Route → Dynamic detail route → Tab → Drawer/modal/wizard → Control → State transition → API/Edge Function → DB/RLS/storage/queue → External dependency → Downstream consumer → Evidence**.

For every workspace, create **independent** files/register entries; do not blend them into a cross-product pass:

- `WORKSPACE_ROUTE_MATRIX`: actual route, alias, role, parent shell, breadcrumb, query parameters, linked reference, screen type, deep-link test, availability, permission and responsive risk.
- `WORKSPACE_UI_INTERACTION_CENSUS`: every button, icon button, dropdown option, context menu, row menu, search, filter, sort, pagination, tab, accordion, drag handle, keyboard shortcut, tooltip action, copy/share/download, upload, drawer, modal, wizard step, board card and calendar action; record outcome.
- `WORKSPACE_FUNCTIONAL_DEPTH`: intention, actor, preconditions, validations, backend invocation, required postconditions, notifications, compensations, logs, negative cases and tested result.
- `WORKSPACE_DESIGN_FIDELITY`: reference ID, screenshot, baseline viewport/zoom, overlay/diff, token and geometry defects, corrected overlay, reviewer status.
- `WORKSPACE_BACKEND_GAP`: missing schema, RPC/Edge Function, service, webhook, realtime subscription, queue worker, auth, RLS, storage, integration or migration; fix owner and cross-workspace dependency.
- `WORKSPACE_E2E_EVIDENCE`: fixture IDs, steps, browser/API assertions, screenshots, sanitised logs, test run/commit, result and reproducible link/path.

Classification per item: `MISSING`, `STUB / FAKE`, `PARTIAL`, `BROKEN`, `VISUALLY NONCONFORMING`, `SECURITY DEFECT`, `WORKING BUT UNVERIFIED`, `VERIFIED`, `NOT APPLICABLE`, `BLOCKED EXTERNAL`. Record severity P0–P3, blast radius, reproducibility, affected roles, owner, change and retest. **A rendered page is never an implicit `VERIFIED` state**. Derived summary metrics must use audited numerator/denominator: routes, controls, journeys, design references, backend contracts, RLS policies, webhook cases and cross-role transitions.

On every important route test: happy path; required fields; invalid/hostile inputs; permission denial; concurrency; refresh/deep link; empty/partial/error/loading/offline; browser back/forward; cancel/retry; mobile; screen reader/keyboard; external webhook arriving twice/out of order; account/workspace switch; plan and entitlement limits.

### GD-01.1 The real-data trace required before closing an issue

For each core action, show:

`UI gesture → client validation → authenticated request → server validation/authz → canonical record mutation or read → transaction/idempotency → async event/outbox → permitted subscriptions/views → notification/inbox/email → audit trail → browser-observed result`.

Capture the actual function name, route, tables/columns and test assertion. Where the action is intentionally read-only, prove the source of truth and freshness. Prevent false completion by validating **authoritative state**, not only toast messages, mocked responses or redirects. Identify null handlers, placeholder links, hardcoded arrays, incomplete forms, `TODO`, inert cards, optimistic updates without rollback, fake percentages and simulated agent results. Remove or replace only after migration and compatibility analysis.

## GD-02. PUBLIC MARKETING & MARKETPLACE — separate audit programme

Audit each existing marketing route and subpage, not just the homepage: landing-page multi-section experience; how-it-works; customer, organiser, venue and supplier solutions; ticketing; event promotion; pricing; affiliate/partner information; help/contact; trust/protection; policies; signup and conversion; public event discovery; event detail/tickets; venue profiles/hire; supplier profiles and packages; organiser profiles; search; maps; calendars; featured collections; category/location landing pages and legal pages. Routes are discovered, not invented from this list.

Required end-to-end journeys: visitor discovers an event → filters/opens full profile → sees legitimate live ticket tiers/availability → joins/watches/shares/saves (if supported) → authenticates or checks out → receives verified ticket/order; visitor finds venue → views accurate spaces, capacities, restrictions, dates, prices and photos → requests quote, holds date or books under the product's actual rules; visitor discovers supplier → compares verified service packages → availability enquiry/quote → permitted communication → booking/payment.

Check structured data and metadata, sitemaps/canonicals, private-content leaks, image optimisation, consent-gated analytics, cookie controls, search ranking/empty states, geo/map search, image permissions, international currency/date displays, conversion attribution and accessibility. Public pages may be visually distinctive and section-rich, but **not** repetitive hero clones, repeated four-item footer bars or generic dashboard compositions. Keep the specifically approved typography, custom SVG/code-reproducible visual stages, motion and generous whitespace. Do not render illustrations that cannot be reproduced from the allowed code/assets.

## GD-03. CUSTOMER / ATTENDEE / PRIVATE PLANNER — separate audit programme

**Shell:** premium consumer top bar, not business sidebar; clear Event discovery, Calendar/Maps, My Events, Tickets/Wallet, Saved, Messages, Bookings/Plans, Account/Help as appropriate to actual approved navigation. On tablet/phone honour the approved **five visible bottom-navigation options with the rightmost menu action opening a closable three-column bottom sheet**, where applicable; validate safe areas, scrolling, focus and orientation. No business finance or provider tools leak into this surface.

Audit independently:

1. Signup, verification, guest checkout where permitted, login/logout/reset, profile/preferences, address/contact and consent.
2. Event browse/search, date/location/category/price/accessibility filters, map/calendar interactions, recommendations, bookmarks, follows, recently viewed and history.
3. Rich event detail (lineup/schedule, hosts, location, map/accessibility, venue/room, live capacity, FAQs, restrictions, cancellation/refund/resale policy, seller identity, trusted media).
4. Ticket selection: tier, quantity limits, sales windows, eligibility, presale/promo/access codes, seat/section selection, real-time holds and expiry, explicit fees/taxes, currency, checkout authorization, SCA/3DS, order confirmation and failure recovery.
5. Ticket wallet: owned order/ticket, QR/barcode/token secrecy, transfer/resale if allowed, reissue/revocation, calendar download, attendee name and ID policies, offline ticket display where appropriate.
6. Attendance: scan/check-in state feedback, duplicate/refunded/transferred ticket denial, authorised transfer/companion delegation, receipts and notifications.
7. Event planning as consumer: private event brief, guest list/invitations/RSVPs, saved ideas, venue/supplier enquiry, proposal comparison, approved booking/deposit and simple plan/budget when supported.
8. Messaging with organiser, venue, supplier and support; notifications/privacy controls, blocking/reporting and transactional versus marketing preferences.
9. Booking/order management: reschedule/cancel/request refund/dispute under policy, status timeline, payment proof and complaint escalation.
10. Saved payment methods where supported, checkout security, downloads, data export/delete and help/tutorials.

Critical cross-role assertions: an organiser changes ticket inventory → customer availability updates; an order succeeds → tickets issue exactly once; refunds/chargebacks → ticket rights change; venue/supplier changes booking → correct customer notification; event cancellations → clearly enforce actual policy; a customer cannot enumerate another customer's ticket, chat or payment data.

## GD-04. ORGANISER / EVENT OPERATOR — separate audit programme

**Shell reference:** Home, Events, Calendar, Sales, Marketplace, Tickets & Promotion, Team, Money, Gala Agent, Settings, plus contextually approved Inbox/Tasks/Files/Automations accessible without duplication. Organiser operates events, **does not gain ownership over a venue operator's venue-wide inventory**. Its venue CRM may store preferred contacts, records, proposals, documents, holds and commercial terms scoped to its workspace/events.

### GD-04.1 Events and planning

- List/grid/calendar/board views only where meaningful; create/clone/template/import/archive; drafts, validation, approval, publication, rescheduling, cancellation, completion and post-event archive.
- Multi-step creation wizard: event category/type, online/hybrid/in-person, venue/room, multiple locations/venues/dates, timezone, ticketed/free/private, audience age rules, capacity, schedule, delivery requirements, legal/safety flags, media/SEO, owners/permissions, commercial settlement and preview/publish. Preserve steps on refresh; prevent invalid publication.
- Event details with URL-addressable **Overview, Plan, Sell & Promote, Operations, Money** tabs; live crosslinks, role-specific actions, related records, activity, empty/errors and contextual drawers.
- Planning deliverables: structured scope, goals, milestones, dependencies, tasks/subtasks, owner/collaborator, due dates, checklists, Gantt/timeline, run-of-show, setup/breakdown, crew call times, approvals, floor/site maps, stage/multi-room/multi-DJ or speaker schedules, rehearsals, logistics, transport, catering, accommodation, decor, equipment, contingency, emergency and incidents.
- Event-type adaptive fields/flows: weddings, birthdays/children, galas, parties/nightclubs, small/large performances, concerts/festivals, exhibitions/trade shows, corporate/conferences, fundraisers, classes, webinars/remote and hybrids. Only surface conditional modules relevant to the chosen event type; preserve conditional data across type changes with explicit validation.
- Proposals: create/send/receive, quotes, versions, alternatives, comparisons, negotiation, approval/rejection, conversion to event/booking, e-signature/document as integrated and owner-scoped audit; venue/supplier relationships persist.
- Planning finance: budget by category/line item and scenario, estimates vs committed vs paid, deposits, tax/fees, contingencies, margin/profitability, multiple venues/rooms, staff/acts/DJs, suppliers/decor/promotion/drinks/catering/AV, ticket tiers, sales forecasts, cash-flow, vendor settlements, split/partner revenue, reconciliation and exports. Ensure arithmetic and currency rounding are testable.

### GD-04.2 Sell, promote, admit

- Ticket product/tier configuration: access windows, allocations, prices/free tiers, per-order caps, tax, discounts, passes, packages, add-ons, bundles, waitlists, sales channels and dynamic inventory.
- Visual seating/floor-plan builder that **persists actual seat/section/row/zone structures**, supports permitted edit/publish versions, accessibility allocations, holds, adjacency constraints and concurrency. Frontend drag/drop alone is insufficient; hard-reload and dual-session tests must preserve and safely reconcile structures.
- Checkout/promo tracking, public event publishing, affiliate/promoter codes, campaigns, channel attribution, abandoned-checkout recovery only when consent/legal basis permits, email and social campaign configurations, true dashboards for impressions/clicks/conversions with provenance.
- Door/gate operations: role-specific scanner, offline/online handoff and reconciliation as designed, safe QR validation, duplicate scan denial, transfers/refunds/cancelled status, check-in reports and incident flags.
- Calendar, RSVP, invitation, reminders and attendee/guest segmentation, accessibility accommodations with privacy protection, check-in, name lists, refunds and support.

### GD-04.3 Operations and business controls

- Venue and supplier marketplace search, favourites, shortlist, quote request, availability checks, negotiation, packages, booking/hold/deposit, cancellation, contracts, supplier assignments and delivery completion.
- Team members, workspace/event permissions, invited staff/contractors, shifts, responsibilities, delegation, approvals, portals and access revocation.
- Operations: staffing, run sheets, task checklists, guest/team/vendor communications, emergencies, risk assessments, permits/insurance/document expiry, venue capacity, multi-venue movement and production issues.
- Sales: orders, channels, gross/net/fees/refunds/payouts, subscriptions/add-ons if sold, customer service handoff, verified analytics, exports and financial period boundaries.
- Organiser Gala Agent, mission oversight, budgets/credits/approvals, tools, schedules, rules, event triggers, audits, rollback where possible and measured outcomes.
- Settings: identity, branding, business/compliance profile, billing, payment connections, domains, notifications, integrations, workspace/team, role switching, data/privacy and support.

### GD-04.4 Representative journeys to execute

1. Create an event → add venue/spaces → configure capacity → schedule supplier/staff → budget → sell tickets → publish → purchase as Customer → scan as authorised operator → reconcile Money.
2. Propose a wedding → request venue and supplier quotes → compare revisions → approve deposits → update plan and cash-flow → cancellation scenario → release holds and issue eligible refunds.
3. Create a multi-room event → assign acts/DJs and stage timings → check room capacities and double booking → publish a coherent attendee programme.
4. Copy an event with new date: detect copied sensitive data/expired permits, reset invalid seats/holds and prevent inherited tickets or transactions.

## GD-05. VENUE OPERATOR / PROVIDER-VENUE MODE — separate audit programme

**Shell reference:** Provider Home, Opportunities, Bookings, Calendar, Listings, Team, Money, Gala Agent, Settings; when a dedicated venue shell is approved, map My Venues, Spaces, Enquiries, Availability, Packages and Marketplace Console beneath appropriate modules. Do not collapse Venue Operator into organiser venue CRM or solo supplier service-only logic.

Audit:

1. Business verification/onboarding, venue ownership/management rights, tax/legal/billing, locations, maps, accessibility, amenities, insurance and documents.
2. Venue listing CRUD and public/private visibility, media gallery/storage, rich descriptions, categories/types (pub, hall, hotel, club, mansion, studio, stadium, outdoors, community hall, restaurant, rooftop, retreat, conference space and more), geolocation and SEO.
3. Multi-location, multi-space and room relationships: capacity by layout/standing/seated, constraints, equipment, accessible access, licensed hours, blackout dates, minimum notice, cleaning/setup buffers and package/resource dependencies.
4. Availability and inventory: day/hour calendar, holds/soft holds, expiration, provisional/confirmed booking, recurring blocks, imported calendars if actually integrated, resource conflict rules and live remaining capacity.
5. Enquiries/opportunities, lead source, response SLA, qualification, proposals, versioned packages, quote and negotiation, customer/organiser messages, convert to booking.
6. Booking wizard: select real venue-space-package and dates, check capacity/age/licensing and collisions **on server**, create consistent commercial snapshot and calendar occupancy, collect deposit, receipt/confirmation and notifications; cancel/modify/rebook and release inventory under policy.
7. Venue-specific bar/food minimum spends, bar deposits, catering/drinks packages, room hires, staffing/service charges, cleaning, security and damage deposits where supported; apply contracts, capture/release/refund logic without fictitious funds.
8. Venue sales/finance, multiple payment recipients/commissions, invoices, payout reconciliation, disputes, chargebacks, tax, occupancy and profitability metrics.
9. Team/location permissions, shift rosters, operational instructions, supplier coordination, client portals and emergency incident handling.
10. Provider Gala Agent with venue tools: quote preparation, calendar triage, conflict detection, occupancy optimisation, availability response, package drafting and safe approval controls.

Race-test two organisers requesting the same space/time, a concurrent quote and booking, late payment after hold expiry, cancellation without inventory release, rescheduling across rooms and webhook replay. **No double booking through optimistic UI, stale calendar or missing database transaction.**

## GD-06. SOLO SUPPLIER / PROVIDER-SERVICES MODE — separate audit programme

**Shell reference:** Provider Home, Opportunities, Bookings, Calendar, Listings, Team (simplified or hidden where inapplicable), Money, Gala Agent, Settings. Audit solo-specific differences even if shared with agency/venue components.

Audit verified identity, service categories/subcategories and skills, operating location/travel radius, equipment, portfolio/gallery, price models (hourly, fixed, packages, add-ons), deposits/cancellation terms, lead times, capacity and date/time availability; enquiries, quotes/version comparison, proposal acceptance, booking contract, calendar holds, preparation tasks, attendee contact restrictions, fulfilment/evidence, invoices, payments/refunds/payouts, reviews, support and disputes.

Cross-role assertions: supplier listing appears in permitted public/organiser search; quote changes become visible to the proper organiser; booking occupies supplier capacity; rejected requests do not block capacity; completion supports review/settlement only under policy. Verify business hours, external calendar conflicts, multi-day travel, preparation/pack-down buffers and timezones. Test notification delivery and quote expiry.

Supplier Gala Agent must have **supplier-scoped tools**, not organiser’s ticket-inventory or unrelated venue-control tools: lead qualification, safe suggested replies, schedule checks, draft proposals, quote templates, route/travel considerations, inventory/equipment and follow-ups. Agent actions must respect price limits, budgets, approvals, contact consent and tenant isolation.

## GD-07. AGENCY SUPPLIER / PROVIDER-TEAM MODE — separate audit programme

An agency is not simply a solo supplier with a larger logo. Independently audit:

1. Agency verification, workspace owner/admin/manager/member/contractor roles, invites, acceptance, role changes, deactivation and access revocation.
2. Agency service catalogue and individual member specialities, skills, qualification/insurance expiry, location and equipment assignments.
3. Shared lead pool, lead assignment/reassignment, pooled quotation under agency identity, approval matrix and who may legally commit a quote.
4. Multiple simultaneous bookings, member and equipment capacity, shift/work order allocation, substitution, leave, travel buffers, overbooking warnings and conflict prevention.
5. Member calendar vs agency master calendar, assignment notifications, individual task/portal access and vendor/organiser communication boundaries.
6. Contract owner, client billing, internal payout allocations, commission splits, expenses/reimbursements, invoicing, refunds, profitability and ledger audit.
7. Agency reviews at correct business/member level, service quality, disputes/escalation, compliance records, reports and finance exports.
8. Agency Gala Agent permissions and tool scopes per role, no escalation from member to owner; approval-dependent quoting, staffing and spending.

Test member accepting agency invite, two managers trying to assign one freelancer to overlapping bookings, member departure while assigned, disputed cancellation, aggregated sales reconciliation and attempted data access between unrelated agencies. Remove redundant duplicate tables/services only after proven functional parity.

## GD-08. AFFILIATE / PROMOTER / PARTNER — separate audit programme

This surface must be fully operational even if not linked from the main provider or organiser dashboard. Discover roles and allowed partner types: SaaS subscriptions, event promotion/ticket sales, venue/supplier referral or hybrid **only if product rules define them**. Keep attribution types and ledgers separate.

Audit applications/onboarding/KYC or tax requirements if applicable, approval/suspension, tracking links and deep links, code/UTM campaigns, branded asset library, disclosure/compliance guidelines, click/lead/signup/qualified purchase events, session and consent rules, multi-touch/last-touch policy and attribution windows, unique versus total referrals, fraud/duplicate/self-referrals, refunds/chargebacks, recurring versus one-off commission policy, tiers/grades, pending/approved/held/reversed/payable/paid balances, minimum thresholds, payout destination, tax documents, statements, disputes, notifications, support and team/subaffiliate roles if enabled.

Add a separate **Affiliate Finance Conservation Test**: for a seeded sale, prove checkout value → eligible net revenue → commission rule/version → accrual → refund/reversal → locked payout → reconciliation. Confirm payout totals never exceed accrued eligible balances and no double credit on webhook replay. Show actual costs and margin definition; do not present an unverified 70–76% margin target as a Gala Dock financial fact.

Trace a click from affiliate link to customer/organiser sign-up, consent-controlled tracking, qualified transaction and eligible payout through real sandbox events. Verify blocked cross-account self-referral and profile data leakage. Compare dashboard counts with authoritative event/ledger records.

## GD-09. PLATFORM ADMIN — separate audit programme

**Shell reference:** Overview, Users, Workspaces, Events, Marketplace, Tickets, Commerce, Trust & Safety, Support, Partners, Agent & Integrations, Analytics, Settings, with any evidence-based additional operations/infrastructure screens. Admin can use a denser sidebar than public/customer. Do not give all staff superadmin access by default.

Independent full CRUD/view/action coverage for:

- Command centre, operational KPIs with lineage, service health, queues, pending approvals, incidents, alerts and deployment/maintenance context.
- Accounts, workspace verification/ownership, organiser/venue/supplier/agency/customer statuses, sanctions, legal holds, appeals, merges only with safe procedures, data-subject rights and audit.
- Events/listings/venues/suppliers: publish/unpublish, moderation evidence, take-down/suspension, reason codes, appeal/reinstatement, fraud pattern analysis and geospatial quality.
- Ticketing, seating, inventory anomalies, payments/orders/refunds/chargebacks, seller/connected accounts, transfer/reconciliation, commissions, affiliate fraud and payout hold/release.
- Customer support, case intake, assignment, SLA, dispute evidence, templates, appeal, linked entities, secure attachments and redaction.
- AI agent model/tool registries, tenant permissions, pricing/credits, soft/hard usage caps, approval levels, stuck jobs, retry/dead-letter, prompt/version logging, MCP connection approvals and security checks.
- Settings, entitlements/subscriptions/add-ons, config/feature flags, communications, taxonomy/venue/category/location registry, templates, webhook event health, integration connectors, audit/search/export controls.
- Abuse reports, safety, privacy requests, consent, retention and deletion, anomaly detection, runbook access, security incident and maintenance-mode controls.

**Private conversation access is a policy decision, not automatic:** if conversation safeguarding is required, propose/implement only the approved model, view-only, narrow authorised support roles, a justified case/reference, access logs, retention/notice and privacy review. Do not silently build universal message surveillance. All sensitive admin reads/writes require server-side permission, reason code where appropriate, dual control for selected financial actions, tamper-evident audit and denial tests.

Maintenance mode: admin action must set authoritative state, select affected surfaces (public, checkout, organisers, providers, staff) and exclusions, schedule start/end, show accurate banner, fail safely during writes/checkout, and verify recovery. Safe operational controls cannot be merely visual.

## GD-10. EXTERNAL PORTALS — separately scoped audits

Discover each actual portal and token/invite mechanism. Use independent matrices for **Client/Host**, **Guest/Attendee**, **Supplier Collaborator**, **Venue Client**, **Staff/Volunteer/Gate**, **Artist/Talent/Speaker**, **Sponsor/Exhibitor**, and **External Promoter/Partner** when present or specified. Each may have a compact portal shell distinct from business dashboards.

For each: invitation issuance/expiry/revocation, token exchange, MFA/OTP where required, identity/membership binding, least-privilege scoped records, read/comment/upload/approve actions, versioned documents, communication, deadlines, calendar items, task completion, access restrictions, notification preferences, error/loading/expired states, mobile access and logout. Check no token in logs, referrers or public caches; anti-enumeration, no cross-event data, one-time redemption as configured, disabled-account revocation and safe download links. Test people with **multiple invitations to different events and organisations**.

## GD-11. AUTH, ONBOARDING, SUBSCRIPTIONS, HELP & CROSS-WORKSPACE SHELLS

Explicitly inspect the unauthenticated/auth shells, signup, role-selection, user-to-workspace transition, email verification through Resend or current configured service, MFA/passkeys/OTP where implemented, password reset, social auth if enabled, invite acceptance, business verification, company/team invite, freelancer-to-agency or solo-to-agency migration if supported, role switch and account lifecycle.

Audit subscription trial and paid tiers, product entitlements, add-ons, AI credit packs, downgrades, paused/cancelled state, upgrade gating, invoice/tax treatment, failed payments/dunning, seat/workspace limits and self-service billing portal. Do not assume every workspace has the same plan. Enforce all limits on **server** and in background work, not just disabled buttons. Maintain coherent help centre, onboarding tours, contextual guidance, support ticket submission, searchable tutorials and feedback.

Each shell should own viewport/scroll/nav; detail pages must compose reused primitives/organisms. Check switching from customer → organiser → provider/venue → supplier/agency → affiliate without data bleed; prove entitlement-aware navigation and the absence of invalid role redirects.

## GD-12. EVENT-TYPE MATRIX — deep functional differences, not labels

Build a matrix of each event type against data fields, templates, required approvals, sellable inventory, operations, finance, staffing, locations, equipment, promotion, attendee behaviour, legal/safety and AI tools. Minimum scenarios:

| Event context | Special backend/UI behaviour to verify |
| --- | --- |
| Remote webinar / livestream / hybrid | Stream/link privacy, timezones, registration capacity, joining entitlements, replay/access windows, hosts, virtual rooms, refunds and notifications. |
| Small private event / birthday / children’s party | Guest privacy, RSVP, child data minimisation, packages, venue restrictions, safeguarding and limited public discovery. |
| Wedding / gala / fundraiser | Proposal stages, guest grouping, seating plans, supplier run-of-show, deposits, seating and multi-party approvals/donations if genuinely configured. |
| Nightclub / late event | Door scanning, age restrictions, timed capacity, DJs/sets, security staffing, venue alcohol/licence constraints and refund/no-show policies. |
| Concert / large show | Reserved/general-admission inventory, gates, acts, production rider, sound/light, crew, emergency plan and queues. |
| Festival / multi-day / multi-venue | Multiple stages/venues, passes, day allocations, camping/parking/access add-ons, shifts, suppliers, maps and capacity by zone. |
| Conference / corporate / exhibition | Sessions/rooms, speakers, exhibitors/sponsors, badges, delegate groups, lead capture permissions and packages. |
| Workshop / speaker / training event | Timed slots, instructors, joining/waitlists, attendance/completion and room/class capacity. |

Run boundary test: changing event type must validate incompatible data and linked ticket products; never silently drop paid bookings, tickets or supplier commitments. Effective date, locale, VAT/taxes, cancellation, transfers and event publication requirements follow actual jurisdiction/configuration.

## GD-13. SHARED BACKEND CONTRACTS — design the vertical transaction, not isolated CRUD

Discover existing Supabase schema and Edge Functions first. Map or implement **canonical ownership and invariants** without gratuitous schema duplication:

| Domain | Authoritative entities / consistency requirements to discover and complete |
| --- | --- |
| Identity & tenancy | `users/profiles`, `workspaces`, `memberships`, roles/capabilities, invites, portal grants, session/auth claims and subject-bound access. |
| Event life cycle | Events, sessions/venues, organiser relationships, publication/version history, schedules, assignments, metadata and media ownership. |
| Venue inventory | Venues, spaces/resources, date/time availability, holds, blackout dates, rate/package snapshots and bookings; collision exclusion/locking. |
| Supplier marketplace | Supplier/agency profiles, service listings/categories, packages, leads, quote versions, proposal decisions, bookings, fulfilment and reviews. |
| Ticket commerce | Tickets/tiers/allotments, seat-map revisions, seats/zones, holds/expiry, carts/orders, payment intents, entitlements, transfers, resale, check-ins and anti-replay. |
| Finance | Quotes, contracts, invoices, ledger, taxes/fees, deposits, payments, refunds, transfers, payouts, commission accruals/reversals, reconciliation and idempotency keys. |
| Collaboration | Tasks, timelines, files, messages, threads, events, notifications, read state, portals/invites, audit and presence/realtime. |
| AI/automation | Agent/tool scopes, credentials handles, policies, runs/steps, missions, schedules, triggers, watches, checkpoints, cost usage, approval requests and tool-result evidence. |
| Platform operations | Plans/entitlements, affiliate attribution, feature flags, support cases, moderation, maintenance, incidents, integration/webhook/outbox health and system audit. |

These names are **conceptual**, not instructions to blindly create matching tables. Inspect actual names, migrations and referential integrity; record schema mappings, propose minimal migrations and run compatibility tests. Where a feature relies on a secret, money, invitation, cross-workspace mutation, allocation or irreversible operation, execute validated, authenticated, authorised server-side commands with transaction/idempotency/locking as needed. Client-supplied `workspace_id`, `seller_id`, `event_id`, `payment_status` or roles must not be trusted in isolation.

### GD-13.1 Core domain invariants

- A seat, ticket or bookable venue-space/time resource cannot be simultaneously sold/confirmed to incompatible buyers beyond allocated capacity.
- Successful payment webhook is the authority for paid state, but a webhook alone must not mint duplicate entitlements. Replays, retries and out-of-order events converge.
- Ticket transfers/resales/reissues/revocations preserve a single valid ownership/use chain. Check-in is unique under allowed rules and auditable.
- Refunds and chargebacks update or restrict associated rights according to documented policy; ledger entries reconcile, not disappear.
- Quotes and commercial packages used by a booking are immutable snapshots/versioned after acceptance. Edits don't retroactively alter contracts.
- Portal users only access invited event and document scopes. Agency members don't inherit unrelated event or owner permissions.
- Search index, realtime subscriptions and caches cannot leak draft/private/unpublished/suppressed listings or tickets.
- Every booking transition has an allowed state machine (draft → requested → quoted/held → confirmed → delivered/cancelled/disputed), role-controlled transitions and audit; rejected/expired holds release resources.
- R2 media signing, antivirus/sanitisation as configured, MIME/size limits and owner-based object access are enforced from the server; no guessable public private paths.
- Money uses integer minor units or auditable decimal money rules and explicit currencies; never floating-point totals as sole source of truth.
- Queue deliveries and notifications are at-least-once safe; idempotency and dead-letter/retry observability are real.

### GD-13.2 Missing backend investigation protocol

For each UI feature, examine: component handler; route action; API client; network request; Edge Function/service; validation schema; auth claims/permissions; DB tables/constraints/functions/RLS; queue/cron; storage; realtime; webhooks; external provider; monitoring/logging and tests. Fill gaps **through to verified result**, not by making buttons superficially clickable. Track existing dead API endpoints, mismatched column names, missing migrations, disabled RLS, permission errors swallowed into success UI, never-invoked cron, Stripe sandbox/production configuration gaps, stale function names, missing email templates, unsupported provider events and webhook signature failures.

### GD-13.3 Infrastructure-specific boundaries

Prefer established stack where actually configured: Supabase Auth/Postgres/RLS/Realtime/Edge Functions, Cloudflare R2 for uploads, Stripe/Stripe Connect where used for commerce, Vercel frontend/deployment, configured AI provider(s), Resend for transactional email, authorised communications/video/maps/calendar services, and GitHub CI. Discover real deployment, secrets and free/paid allowances; don't invent connections or expose secrets. Client code never embeds service-role keys. Background tasks need durable queue/outbox/cron/worker design with retries and observability. Use test environments and provider sandboxes, never live customer charges or outbound campaigns as QA.

## GD-14. GALA AGENT — dedicated organiser and provider capability audits

Do not accept a chat widget marketed as a fully autonomous agent. Build a **tool/skill capability matrix** per organiser, venue, solo supplier, agency and admin-support context. Categorise safe tools as Basic, Medium, Advanced, Enterprise by actual authority, cost, duration and reversibility. Both organiser and provider can have rich runtime features, but **tool permissions, templates, memory and outputs differ**.

Mandatory execution modes to inspect and complete: one-time tasks; multi-step missions; scheduled routines; watches/condition monitoring; event-driven routines; long-running and multi-day missions; batch missions; approval-dependent runs; delegated controlled product subagents; failed/retry/resume runs; dry-run previews; human handoff. Cover natural-language and form-driven run creation where approved. Management UI: goal, plan, steps, tool calls, model/provider routing, input evidence, memory, run history, resource use, estimated/actual tokens and costs, approval inbox, pausing, cancel, resume, retry, schedules, triggers, webhook event subscriptions, success criteria and completed output links.

Settings: tenant/role-specific autonomy levels from “always ask” to bounded approved autonomy, per-tool permissions, restricted actions, approval thresholds, per-run/daily/monthly token and currency limits, credits/packs, soft/hard caps, rate/concurrency limits, subscription entitlements and emergency disable. Financial, communication, publishing, deletion, booking and sensitive contact actions require the configured human gates and attributable execution. Agent tool schemas use allowlists, parameter validation, least-privilege token-bound actions and outcome verification. Detect prompt injection in event descriptions, quotes, uploaded PDFs, messages and websites; no exfiltration or access escalation through MCP tools.

Target scenario examples: organiser asks Agent to plan a wedding budget and suppliers → receives sourced draft and approval prompts → authorised quote requests create correct records; venue Agent watches a date conflict and suggests an alternative → no automatic double booking; solo supplier Agent schedules follow-ups without spam → valid consent/limits; agency Agent optimises staffing with approved member capacity → no cross-member permissions; admin Agent investigates a failed webhook → produces evidence but cannot issue an unapproved refund.

Agent test spend: use fixture/mocks/sandbox and explicit budget alerts; cap any real provider QA spend according to current authorised cap (previous Gala Dock QA preference was **no more than £0.50 for provider Agent runs**, unless expressly changed). Do not pretend mocked model responses prove live-provider availability.

## GD-15. DESIGN-FIDELITY RECOVERY — approved images are the contract

### GD-15.1 Visual audit requirements

For **every approved page reference**, reproduce its exact viewport dimensions, DPR, zoom, font loading, content state, browser chrome inclusion/exclusion and stable data. Capture with Chrome MCP/Playwright or confirmed browser tooling. Use calibrated image overlay and difference heatmap; align crop/scale first to avoid false pixel errors. Record design reference ID, screenshot ID, viewport, text/rendering caveats and DOM geometry deltas. The historically requested **≤5% visual difference** is an aspirational deterministic-image threshold, not a blanket test guarantee: report meaningful perceptual/region metrics alongside pixel differences, focus on structural/branding fidelity, and never hide large geometry drift behind antialiasing noise.

Measure: shell widths, nav placement, top-bar height, sidebar density, active indicators, typography metrics, hero/display headings, cards, alignments, section sequence, borders/radii/shadows, inputs/controls, icons, charts, maps, grids, imagery aspect/crop, visual weighting, spacing scale, gradients, microinteraction destinations and modal layouts. Fix global tokens and shared components first, then page compositions, then state/edge cases. Avoid **generic flat white cards** and default dashboard layouts; preserve premium distinctive editorial/event brand styling. Where design is approved, do **not** redesign it under the pretext of premium improvement without logging explicit agreed deviations.

### GD-15.2 Canonical shell fidelity

- Customer/public: top bar, marketplace-like discovery, richer cards/events/tickets/booking flows, accessible animations; never forced into business shell.
- Organiser: compact operational sidebar, contextual top bar/global search, event lifecycle, visually coherent detail tabs and finance.
- Provider venue/services: approved shared shell and mode-specific navigation/availability/listings with no duplicated route clones.
- Affiliate: independent restrained reporting/earnings shell, campaign assets and financial table fidelity.
- Admin: evidence-dense operational shell, appropriately permissioned action bars, filters, tables, drawers and audit history.
- Portals: minimal role-appropriate chrome and focused tasks; avoid exposing regular workspace menus.

For marketing, check every section's **unique component anatomy** and narrative role; the invitation/CTA closing seal and other SVG/code-native effects must actually be built with DOM/SVG/CSS/Motion, not rasterized fakes. Avoid the repeated four-stat/bar section-footer treatment previously rejected.

### GD-15.3 Premium motion & accessibility

Implement Motion/Framer Motion selectively: navigation transitions, shared-element context, staggered appearances, overlays, drawers, wizards, hover/focus, list reordering, booking/seat selection, inline success/error and subtle data transitions. Target polished motion, not gratuitous animation or jank. Respect `prefers-reduced-motion`, focus restoration, keyboard operation, ARIA/state announcements and WCAG 2.2 AA where applicable. Verify full-screen capture and animated states deterministically by disabling or settling motion in screenshot runs; separately test the motion itself.

### GD-15.4 Responsive contract

Apply the Universal Baseline's entire desktop/laptop/tablet/phone/portrait/landscape/zoom matrix to **each workspace**. The prior Gala Dock PWA decision takes priority: **do not presume a native iOS/Android app**. Native-app testing is conditional on discovering a real maintained native app. Web PWA mobile/browser orientation, installability, safe-area, offline/reconnect, on-screen keyboard and deep link behaviour are mandatory. Verify the precise five-item mobile navigation/bottom-sheet pattern where approved. For difficult surfaces (seat builder, event map, Gantt, calendars, finance tables, quote comparison, admin evidence viewers), use designed responsive transformations with clear affordances; retain horizontal scroll *within the component* when semantically appropriate, never page-wide overflow. Test common zooms 50–200% plus 400% critical accessibility reflow and browser text scaling without clipped controls.

## GD-16. MANDATORY MULTI-PARTY END-TO-END SCENARIOS

These require synthetic fixtures and real backend/sandbox effects; mark each PASS/FAIL/BLOCKED with evidence. Expand each into normal, edge, denial and recovery paths:

| ID | Scenario | Verified chain |
| --- | --- | --- |
| X01 | Organiser publishes paid event | Draft → validated configuration → published discovery → accurate detail and inventory. |
| X02 | Customer buys a ticket | Tier/seat hold → Stripe sandbox payment → single order/ticket → wallet/receipt → finance reconciliation. |
| X03 | Simultaneous last-seat purchasers | Exactly one valid allocation, correct losing path, no oversell or duplicate charge. |
| X04 | Ticket transfer/resale | Original rights revoked or updated, new ownership, price/policy, scanner behaviour and notifications. |
| X05 | Refund/chargeback | Policy/ledger webhook → customer/seller state → revoked ticket rights as appropriate. |
| X06 | Door check-in | Authorised staff scan → single check-in → live count → duplicate/offline conflict handling. |
| X07 | Venue enquiry and quote | Customer/organiser request → venue inbox → quote/version → acceptance → accurate booking. |
| X08 | Same-slot venue competition | Concurrent organiser requests → protected hold expiry → single confirmed space/time booking. |
| X09 | Venue deposits/packages | Package snapshot → payment → calendar/commercial state → refund/cancel boundaries. |
| X10 | Solo supplier booking | Listing → lead → quote → organiser acceptance → calendar occupancy → delivery → payout/review. |
| X11 | Agency staffing | Agency offer → member assignment → conflict check → member portal → delivery/reconciliation. |
| X12 | Multi-space/multi-day festival | Stages/tickets/schedules/vendors, capacity/entry by zone and financial reporting align. |
| X13 | Private wedding proposal | Proposal revisions → venue/supplier negotiations → budget/contract and approvals → execution. |
| X14 | Remote webinar | Registration/pass → link entitlement/notifications → host/check-in → refunds and replay window. |
| X15 | Affiliate conversion | Track link → attributed eligible purchase → commission ledger → refund reversal/payout statement. |
| X16 | Portal invitation | Role-bound invite → scoped view/upload/approval → revoke/expire → denied old access. |
| X17 | Role/workspace switch | Same user changes customer/organiser/provider → no stale cache or cross-tenant data. |
| X18 | Organiser Agent mission | Draft → tool scope/approval → authorised writes → verified outcome → credits/audit. |
| X19 | Venue/Provider Agent mission | Availability/quotes/calendar controls cannot exceed approved scope or spending. |
| X20 | Failed/replayed webhooks | Reorder/replay/provider outage → one correct terminal commerce state and replayable repair. |
| X21 | Admin support escalation | Case-scoped evidence, audit and least privilege; no unauthorised conversation read. |
| X22 | Maintenance mode | Admin control → affected-page banners → protected checkout/writes → recovery test. |
| X23 | Marketplace moderation | Listing takedown → absent from search/public page → owner appeal → reinstatement. |
| X24 | Subscription downgrade | Server-side rights/limits update, long-running agent and pending actions obey updated entitlements. |
| X25 | Cancel/reschedule event | Customers, venue, suppliers, tickets, schedules and refunds align, with preserved audit. |
| X26 | Customer/organiser dispute | Evidence → seller response → resolution state → ledger/ticket/notifications consistent. |
| X27 | Media/AV sanitation | Malformed file or forbidden type → denied, logged; permitted upload → signed scoped access. |
| X28 | Recovery drill | Backup restoration in isolated environment → constraints/records/access tested → runbook and RPO/RTO recorded. |

Do not fake external systems. Use Stripe/provider test mode and controlled webhook fixtures; record what cannot be live-tested without production authority. Cover failures at every boundary: offline, timeout, reconnect, duplicate submission, partially completed job, permission revocation, expired user session, stale hold and provider incident.

## GD-17. WORKSPACE-SPECIFIC CHROME MCP TESTING

For each workspace, log in as at least: owner/admin; standard member; constrained viewer/finance/operations role where applicable; unauthorised user; expired invite. Discover all actual dynamic routes using safe seeded records. Traverse **every displayed actionable control**, including hover menus, overflow actions, tab-pane controls, drawers, multi-step wizards, top navigation, mobile navigation, keyboard, empty states and error resolutions. Categorise irreversible controls and test them only with synthetic fixtures/sandbox, preserving production approvals.

Instrumentation must capture browser console, failed network calls, relevant server/Edge logs, mutation effect, screenshot and assertion. A `200` response with a silent RLS denial or a `success` toast with no persisted record is a failure. Test same record open in two browser contexts to verify realtime/optimistic state. Check accessible name, role, focus, keyboard and touch target. Maintain a **control-click denominator and coverage percent per workspace**, including justified `NOT SAFE TO EXECUTE`/`BLOCKED` counts; report all omissions, never claim 100% by excluding hard controls.

For critical flows, execute at least desktop 1440/1491-class reference width, laptop/compact, tablet portrait+landscape, phone portrait+landscape, min/max supported zoom, long text, empty/error/loading and multiple locale/timezone cases. Pairwise optimise less-critical permutations rather than attempting an infeasible full Cartesian product; all high-risk boundary combinations remain mandatory. Preserve screenshots and logs locally in controlled QA artifacts; sanitise personal/payment data.

## GD-18. BACKEND, INTEGRATION AND SECURITY AUDIT DEPTH

Apply contract and adversarial tests to Supabase schema migrations, grants/RLS and storage policies, API/Edge auth, signed URLs, queue workers, cron, realtime channels, payment webhooks, consumer/organiser/provider/affiliate/admin permissions, race conditions, event cancellation, notification delivery, payout reconciliation and backups. Include negative cases for IDOR/BOLA, SQL/storage path injection, XSS, CSRF where relevant, unsafe HTML/event descriptions, uploaded files, webhooks without signature, SSRF/tool prompts, rate-limit abuse, session switching and horizontal/vertical role escalation.

External dependencies to discover/test where configured: Stripe/Connect, Resend, R2, maps/geocoding, calendars, social/ad platforms, analytics, AI/LLM providers, MCP connectors and call/video services. Verify connection, consent, scopes, token rotation/revocation, outages, dedupe, rate limits, backfills, audit and safe fallback. No blanket production broadcast, marketing email or live payment execution. UK data protection/PECR/cookies/consumer/ticket resale/online safety applicability requires evidence-backed technical enforcement and a legal-review register, not blanket legal claims.

## GD-19. RELEASE EXECUTION SEQUENCE AND WORK PACKETS

Run dependency-aware and **vertical-slice** phases while respecting a design-first baseline:

1. **Preflight & checkpoint:** branch/status/deploy/environment; configs/secrets by presence only; tool validation; fixture planning; release blockers; backups/rollback awareness.
2. **Design inventory & as-found overlays:** reference-to-route mapping for all 8+ surfaces and key states; capture scores and severe drift before changing code.
3. **Canonical product inventory:** workspace/portal route/control hierarchy; backend trace, domain ownership, permission and cross-workspace contract maps.
4. **Foundational fixes:** tokens/shell primitives; auth/tenant/access; missing migrations/constraints/RLS; state machines; canonical contracts; test fixtures; queues/idempotency.
5. **Customer + public discovery/checkout slice:** implement against reference, wire backend, test and prove ticket purchase, wallet, event profile and venue/supplier enquiries.
6. **Organiser slice:** event creation/planning, tickets/seating/sales, marketplace/venues/suppliers, finance, operations, team, Agent; full event lifecycle tests.
7. **Venue Operator slice:** multi-space inventory, holds, packages, proposals, deposits/bookings, team and finance; concurrency tests.
8. **Solo Supplier slice:** listings/leads/quotes/availability/bookings/fulfilment/finance/Agent; organiser handoffs.
9. **Agency Supplier slice:** shared leads, team permissions, capacity/staff allocation, pooled contracts, split finance/Agent; staffing race tests.
10. **Affiliate slice:** tracking/attribution/commissions/finance/payouts; anti-fraud and refund reversal.
11. **Admin slice:** permissions, moderation, commerce, support, reporting, AI, maintenance, incidents and operational observability.
12. **Portals + auth/onboarding/settings slice:** invite/revocation, scoped tasks, help/billing and workspace switching.
13. **Event-type and multi-party integration:** complete all GD-12 / GD-16 scenarios and cross-workspace reconciliation.
14. **Design-final & responsive:** repeat 1:1 overlays after functional changes, tablet/phone/zoom/orientation, motion/accessibility and no-warp checks.
15. **Reliability/security/load/recovery:** incident drills, backlog worker recovery, restoration, adversarial auth/payment tests, performance and release provenance.
16. **Defect closure & release candidate:** fix/retest; CI gates; doc updates; redacted evidence; remaining blockers and decision.

Within each workspace slice, obey **Discover → compare references → trace controls → write failing test → fix UI/backend → run E2E + RLS tests → overlay → responsive → regression → evidence**. Fix severe shared backend defects as soon as discovered, even when they affect a later workspace. Do not wait for a giant audit to finish before repairing clear issues, but keep baseline metrics and avoid disrupting unrelated work. Only one development agent; use task batching, checkpoints and cost-aware test selection.

## GD-20. REQUIRED OUTPUT ARTIFACTS & GATES

Use a durable `/docs/release-audit/galadock/` (or existing canonical docs home) with an indexed master report. Create or update, at minimum:

1. `README.md`: reproducible audit environment, application/commit, tool and reference source inventory, limits, commands, evidence index.
2. `WORKSPACE_MASTER_MATRIX.md` and **one full audit per** Public, Customer, Organiser, Venue Operator, Solo Supplier, Agency Supplier, Affiliate, Admin and every active Portal.
3. `ROUTE_COMPONENT_ACTION_REGISTER.csv` and `WORKSPACE_ACTION_TO_BACKEND_TRACE.csv` with actual statuses and owners.
4. `DESIGN_REFERENCE_MANIFEST.md`, `DESIGN_OVERLAY_FINDINGS.md`, per-workspace before/after reference-aligned screenshot paths and reproducible diff procedure.
5. `BACKEND_GAP_REGISTER.md`, `DATABASE_RLS_MATRIX.md`, `API_EDGE_FUNCTION_CONTRACTS.md`, `WEBHOOK_IDEMPOTENCY_LEDGER.md`, `INTEGRATION_HEALTH_REGISTER.md`.
6. `CROSS_WORKSPACE_E2E_RESULTS.md`, `EVENT_TYPE_MATRIX.md`, `RESPONSIVE_ZOOM_ORIENTATION_RESULTS.md`, `A11Y_RESULTS.md`, `AGENT_EVAL_RESULTS.md`, `SECURITY_TEST_RESULTS.md`.
7. `DEFECT_REGISTER.md` with real severity, evidence, fixed commit, retest and residual risk; `EXECUTION_CHECKPOINT.md` with next smallest valid work packet.
8. `SCHEMA_AND_MIGRATION_CHANGELOG.md`, `INTEGRATION_SETUP_RUNBOOKS.md`, `OPERATIONS_INCIDENT_AND_RESTORE_RUNBOOK.md`, `RELEASE_CANDIDATE_VERDICT.md`.
9. Persistent CI workflows for type/lint/unit/integration/RLS/E2E/visual regression, change-impact selection, and relevant high-risk suites.

**Release gates** must separately show `PASS / FAIL / BLOCKED / NOT APPLICABLE` for each workspace's (a) design fidelity, (b) functional control coverage, (c) backend state integrity, (d) permissions, (e) critical cross-role journeys, (f) responsive/accessibility, (g) operational/security readiness. Do not average away failed payment, ticket inventory, venue collision, tenant isolation, data loss or broken core journeys. P0 and release-blocking P1 defects => **NOT READY**, regardless of beauty score. External dependencies can yield **CONDITIONALLY READY** only when they cannot invalidate critical flows; otherwise **NOT READY**.

Output interim status after every work packet: exactly what passed, what changed, current blocker, test evidence and the next concrete action. Never stop at a recommendations document if implementation is feasible. Do not fabricate tooling, design assets, integrations, test results or deployment status. **Begin by examining the real repository and the current design references immediately.**

---

# ANNEX U — UNIVERSAL ENTERPRISE SAAS QA BASELINE, ADAPTED TO GALA DOCK

Apply all applicable checks in the following exhaustive baseline as well as the Gala Dock-specific mandates above. In particular, the original phase order is subordinated to GD-19's workspace-by-workspace vertical delivery order, while keeping its test coverage. Native-app checks apply only if a native app is discovered; the PWA matrix is mandatory. The product-specific continuation prompts appear after this annex.

# 1. CRITICAL OPERATING PRINCIPLES

## 1.1 Development agent limit

**Maximum Claude Code development agents: one.**

Prefer the primary Claude Code session without spawned subagents.

Minimise:

- Rate-limit consumption.
- Unnecessary model calls.
- Redundant tool calls.
- Repeated repository scans.
- Duplicated test execution.
- Excessive context loading.
- Unnecessary files.
- Needless architectural abstraction.

This restriction applies to the engineering session.

The SaaS product's actual AI runtime must still support controlled parallel executions and sub-agent delegation.

## 1.2 Autonomous execution

Claude Code must:

1. Discover the current implementation.
2. Determine intended behaviour.
3. Inspect actual code and runtime behaviour.
4. Identify problems and missing functionality.
5. Create implementation tasks.
6. Perform the changes.
7. Run automated tests.
8. Correct failures.
9. Rerun relevant tests.
10. Produce evidence.
11. Update documentation.
12. Continue through the remaining tasks.

Do not stop after an audit or produce recommendations instead of fixing achievable issues.

## 1.3 Persistent checkpointing

Maintain a durable task and execution register.

It must record:

- Current phase.
- Active task.
- Completed tasks.
- Pending tasks.
- Blocked tasks.
- Known defects.
- Relevant file paths.
- Changes implemented.
- Tests executed.
- Test results.
- Evidence.
- Remaining dependencies.
- Next action.

The programme must be resumable across Claude Code sessions.

Do not reperform completed work unnecessarily.

## 1.4 Product scope

Classify requirements as:

- Specified.
- Implemented and verified.
- Partially implemented.
- Defective.
- Missing.
- Not applicable.
- Blocked.

Do not assume a feature exists because its page exists.

Do not remove previously agreed functionality merely because implementation is difficult.

## 1.5 No unnecessary bloat

Prefer:

- Shared primitives.
- Shared services.
- Reusable components.
- Cohesive modules.
- Unified messaging.
- Unified notifications.
- Unified permissions.
- Shared AI orchestration.
- Reusable test infrastructure.

Do not create unnecessary standalone pages, microservices or database tables.

## 1.6 Safety and authorisation

Use authorised test environments, synthetic users and provider sandboxes for potentially destructive or financial testing.

Do not perform unauthorised production deployments, customer communications, data deletion or live financial movements.

Automate routine QA without requiring manual testing sign-off.

Preserve legitimate approvals for irreversible production operations, sensitive business actions and external regulatory requirements.

---

# 2. COMPLETE PRODUCT AND ROUTE DISCOVERY

Before conducting broad tests, construct the canonical product inventory.

Use the hierarchy:

**Product → Workspace → Shell → Section → Subsection → Route → Screen → Internal View → Component → Action → State Transition.**

Discover routes from:

- Application router configuration.
- Navigation components.
- Menus.
- Sidebar or top navigation.
- Route manifests.
- Dynamic route definitions.
- Deep links.
- Admin interfaces.
- Portal interfaces.
- Onboarding.
- Settings.
- Billing.
- Support.
- AI interfaces.
- Actual rendered application navigation.

Do not rely on the visible main navigation alone.

Include hidden but legitimate contextual routes.

## 2.1 Route inventory

For every route record:

- Unique route ID.
- Actual route path.
- Workspace.
- User roles.
- Page purpose.
- Associated reference design.
- Desktop availability.
- Tablet availability.
- Mobile availability.
- Native-app equivalent where applicable.
- Tabs.
- Subtabs.
- Drawers.
- Modals.
- Popovers.
- Wizards.
- Forms.
- Buttons.
- Links.
- Menus.
- Tables.
- Filters.
- Search.
- Uploads.
- Download actions.
- API dependencies.
- Database dependencies.
- External integration dependencies.
- Expected states.
- Existing test coverage.

## 2.2 Dynamic route coverage

For routes containing identifiers, test representative valid and invalid records.

Include:

- Owned record.
- Shared record.
- Organisation record.
- Unauthorised record.
- Deleted record.
- Archived record.
- Missing record.
- Expired record.
- Draft record.
- Completed record.
- Restricted record.

Do not mistakenly count one successful dynamic route instance as coverage for all its states.

---

# 3. MANDATORY FIRST SUBSTANTIVE PHASE — DESIGN FIDELITY

**Before the general functionality audit and implementation programme, perform the complete design inspection.**

A short preflight to locate the repository and tools is permitted.

## 3.1 Design discovery

Inspect all available:

- Approved mockups.
- Screenshots.
- Design files.
- Brand guidelines.
- Design documentation.
- Typography.
- Colour systems.
- Icons.
- Responsive references.
- Mobile references.
- Tablet references.
- Workspace shells.
- Component specifications.
- Motion and interaction specifications.

Map each approved design to the implemented route and UI state.

Create a Design Coverage Register.

## 3.2 Mandatory overlay tooling

Explicitly discover and verify the availability of a design overlay tool.

Use the overlay tool for reference-versus-implementation comparison where available.

If unavailable, use an accurately aligned screenshot-diff and visual-regression alternative.

Do not falsely claim overlay testing occurred.

Check:

- Pixel alignment.
- Geometry.
- Margins.
- Padding.
- Gaps.
- Container width.
- Component height.
- Typography.
- Font weight.
- Line height.
- Icons.
- Buttons.
- Borders.
- Shadows.
- Radii.
- Colours.
- Navigation placement.
- Table density.
- Chart layout.
- Empty states.
- Loading states.
- Error states.
- Hover states.
- Focus states.
- Disabled states.
- Selected states.
- Motion.
- Responsive transformations.

Save before-and-after evidence for meaningful corrections.

## 3.3 Premium design evaluation

Where browsing is available, examine relevant premium references from sources such as Dribbble, Mobbin and established SaaS design systems.

Critically grade the real product out of 10 for:

- Premium appearance.
- Enterprise credibility.
- Brand quality.
- Typography.
- Visual hierarchy.
- Component quality.
- Whitespace.
- Information density.
- Navigation.
- Interaction design.
- Accessibility.
- Desktop experience.
- Mobile experience.
- Tablet experience.
- Overall polish.

Create a grade per workspace, major section and important component.

Do not merely praise the existing design.

Explain visual weaknesses and justified improvements.

## 3.4 Primitive and component engineering

Create appropriate architecture layers:

1. Design tokens.
2. Foundational primitives.
3. Atomic controls.
4. Composed controls.
5. Feature modules.
6. Page sections.
7. Templates.
8. Workspace shells.

Register each reusable component with:

- Name.
- Purpose.
- Source path.
- Props.
- Variants.
- States.
- Responsive behaviour.
- Typography tokens.
- Spacing tokens.
- Accessibility requirements.
- Consuming pages.

Extract duplicated implementations where it improves maintainability.

Do not split every trivial element into a separate file without a clear benefit.

## 3.5 Premium remediation

Create design improvement tasks.

Implement justified upgrades.

Verify against the approved baseline.

Where an intentional improvement changes the design, document the design decision and updated baseline.

---

# 4. RESPONSIVE ENGINEERING — COMPLETE VIEWPORT INVENTORY

**This section is mandatory and must receive exceptional testing depth.**

The objective is to ensure the SaaS renders and functions correctly across realistic combinations of:

- Device classes.
- Screen dimensions.
- CSS viewport dimensions.
- Orientation.
- Browser zoom.
- Operating-system display scaling.
- Device pixel ratio.
- Font scaling.
- Input type.
- Browser.
- Application state.

It is not technically meaningful to enumerate every possible physical display or viewport dimension because dimensions form a continuous and changing space.

Instead, Claude Code must create an extensive, evidence-backed testing matrix covering common resolutions, unusual form factors, layout breakpoints and boundary values.

The matrix must be expandable when new devices or designs are introduced.

## 4.1 Understand the different measurements

Do not confuse:

**Physical screen resolution:** Hardware pixels of the display.

**CSS viewport size:** Browser layout dimensions in CSS pixels.

**Device pixel ratio (DPR):** Relationship between CSS pixels and device pixels.

**Operating-system display scale:** Desktop or mobile display scaling applied by the OS.

**Browser zoom:** User-controlled page zoom where supported.

**Text scaling:** User accessibility preference affecting text sizing.

**Visual viewport:** Currently visible portion of the page, which can change with mobile keyboards and pinch zoom.

**Component scale:** Actual rendered dimensions and typography determined by CSS and design tokens.

A 4K monitor does not necessarily expose a 3840px CSS viewport.

A phone with a high-density display does not necessarily have a large CSS viewport.

Derive expected behaviour from actual measured browser values, not assumptions based only on physical screen resolution.

---

# 5. DESKTOP VIEWPORT MATRIX

Build an extensive desktop test matrix.

Include the following representative dimensions.

| Desktop category | Viewport / resolution target |
|---|---|
| Compact desktop | 1280 × 720 |
| Compact desktop | 1280 × 800 |
| Standard desktop | 1366 × 768 |
| Standard desktop | 1440 × 900 |
| Standard desktop | 1600 × 900 |
| Full HD | 1920 × 1080 |
| WUXGA | 1920 × 1200 |
| Large display | 2048 × 1152 |
| QHD | 2560 × 1440 |
| High-density desktop | 2560 × 1600 |
| High-density desktop | 2880 × 1800 |
| Ultrawide | 2560 × 1080 |
| Ultrawide | 3440 × 1440 |
| Ultrawide | 3840 × 1600 |
| 4K | 3840 × 2160 |
| 5K | 5120 × 2880 |
| 8K reference | 7680 × 4320 |

Treat these as a reference matrix of viewport and display scenarios, not an assertion that every physical monitor exposes those exact CSS dimensions.

For large displays, specifically test:

- Maximum content width.
- Excessive whitespace.
- Grid expansion.
- Dashboard balance.
- Table width.
- Chart proportions.
- Navigation placement.
- Modal sizing.
- Large data views.
- Ultrawide layouts.
- Centred content.
- Fixed-position controls.

The interface must not become absurdly stretched merely because a monitor is very wide.

Use appropriate max-width containers and responsive layout rules.

### Desktop portrait orientation

Also test rotated monitors, including representative portrait scenarios:

- 720 × 1280.
- 900 × 1440.
- 1080 × 1920.
- 1200 × 1920.
- 1440 × 2560.
- 2160 × 3840.

Ensure the layout responds to actual available CSS width rather than assuming that desktop hardware is always landscape.

---

# 6. LAPTOP VIEWPORT MATRIX

Include compact, standard, high-density and convertible laptops.

| Laptop category | Viewport / resolution target |
|---|---|
| Small laptop | 1024 × 600 |
| Small laptop | 1024 × 768 |
| Compact laptop | 1152 × 720 |
| HD laptop | 1280 × 720 |
| Standard laptop | 1280 × 800 |
| Standard laptop | 1366 × 768 |
| Compact high-density | 1440 × 900 |
| High-density scaled | 1512 × 982 |
| High-density scaled | 1536 × 864 |
| Large laptop | 1600 × 900 |
| Large laptop | 1680 × 1050 |
| Full HD laptop | 1920 × 1080 |
| Large professional laptop | 1920 × 1200 |
| High-resolution laptop | 2560 × 1600 |
| High-resolution laptop | 2880 × 1800 |

Include browser window configurations where the browser is not maximised.

For example:

- Half-screen window.
- Two-thirds-width window.
- Narrow snapped window.
- Short browser window.
- Browser with developer tools docked.
- Window with bookmarks or toolbar space.
- Operating-system display scaling.

### Convertible laptop orientation

For convertible devices, also test portrait equivalents where meaningful.

Verify touch input and keyboard input where supported.

### Compact laptop checks

Pay particular attention to:

- Vertical height.
- Dashboard density.
- Navigation overlap.
- Sticky headers.
- Scroll containers.
- Modals taller than viewport.
- Forms with long content.
- Table headers.
- Fixed bottom controls.

Do not assume a laptop always has enough vertical space for desktop-sized dashboards.

---

# 7. TABLET VIEWPORT MATRIX

Tablet testing must cover portrait and landscape orientations.

## 7.1 Portrait tablet targets

Test representative sizes:

- 600 × 960.
- 720 × 1280.
- 744 × 1133.
- 768 × 1024.
- 800 × 1280.
- 820 × 1180.
- 834 × 1112.
- 834 × 1194.
- 853 × 1280.
- 900 × 1440.
- 1024 × 1366.
- 1080 × 1920.

## 7.2 Landscape tablet targets

Test corresponding landscape scenarios:

- 960 × 600.
- 1280 × 720.
- 1133 × 744.
- 1024 × 768.
- 1280 × 800.
- 1180 × 820.
- 1112 × 834.
- 1194 × 834.
- 1280 × 853.
- 1440 × 900.
- 1366 × 1024.
- 1920 × 1080.

Where a scenario overlaps laptop sizes, test the tablet interaction characteristics separately.

## 7.3 Tablet-specific checks

Check:

- Touch navigation.
- Tablet menu behaviour.
- Workspace switchers.
- Responsive dashboard grids.
- Split navigation.
- Search drawers.
- Forms.
- Full-screen dialogs.
- Popovers.
- Dropdown anchoring.
- Tables.
- Charts.
- Landscape transitions.
- Portrait transitions.
- Keyboard appearance.
- External keyboard behaviour.
- Stylus interaction where relevant.
- Split-screen multitasking.
- Resizable application windows.

## 7.4 Tablet density

Avoid merely displaying a stretched phone interface.

Where the design calls for a tablet experience, use the extra space productively.

At the same time, do not force a desktop layout into a tablet viewport when controls become cramped.

---

# 8. PHONE VIEWPORT MATRIX

Phone testing must cover small, medium, large and foldable screens.

## 8.1 Portrait phone targets

Include:

| Phone category | CSS viewport target |
|---|---|
| Very small | 280 × 653 |
| Legacy compact | 320 × 568 |
| Compact | 320 × 640 |
| Compact modern | 344 × 756 |
| Small Android | 360 × 640 |
| Small Android | 360 × 780 |
| Standard compact | 375 × 667 |
| Standard modern | 375 × 812 |
| Standard modern | 390 × 844 |
| Standard modern | 393 × 852 |
| Intermediate modern | 402 × 874 |
| Large Android | 412 × 915 |
| Large phone | 414 × 896 |
| Large modern | 428 × 926 |
| Large modern | 430 × 932 |
| Wider phone | 480 × 800 |
| Large/foldable outer | 540 × 960 |

Some sizes represent stress-test targets rather than specific current devices.

## 8.2 Landscape phone targets

Include:

- 568 × 320.
- 640 × 320.
- 640 × 360.
- 667 × 375.
- 756 × 344.
- 780 × 360.
- 812 × 375.
- 844 × 390.
- 852 × 393.
- 874 × 402.
- 896 × 414.
- 915 × 412.
- 926 × 428.
- 932 × 430.
- 960 × 540.

## 8.3 Mobile landscape rules

Landscape phone views are especially vulnerable to limited vertical space.

Test:

- Navigation.
- Bottom tabs.
- Sticky elements.
- Full-screen search.
- Modals.
- Forms.
- Calendar.
- Charts.
- Messaging.
- Live calls.
- Video interviews.
- Upload dialogs.
- Onboarding.
- Authentication.
- Payment forms.
- AI panels.

Ensure fixed elements do not consume most of the usable viewport.

## 8.4 Mobile safe areas

Test:

- Notches.
- Dynamic Island-type cutouts.
- Status bars.
- Home indicators.
- Navigation bars.
- Rounded screen corners.
- Keyboard appearance.
- Safe-area insets.
- Orientation changes.
- Browser toolbar changes.

## 8.5 Foldable devices

Where relevant, include:

- Narrow outer screen.
- Large unfolded screen.
- Fold-state changes.
- Display continuity.
- Dual-pane layouts.
- Hinge and display-feature constraints.
- Multiwindow behaviour.
- State preservation during resize.

Do not assume a foldable is always either a phone or tablet.

---

# 9. BREAKPOINT BOUNDARY TESTING

Predefined device widths alone are insufficient.

Claude Code must inspect actual CSS media queries, container queries and layout breakpoints used by the application.

For each important breakpoint, test:

- One pixel below.
- Exactly at the breakpoint.
- One pixel above.
- A nearby intermediate width.

For example, if a breakpoint occurs at 768px, test:

- 767px.
- 768px.
- 769px.

Apply this to actual application breakpoints rather than blindly hardcoding a single breakpoint scheme.

Also test content-driven breakpoints.

If navigation starts colliding at 1190px, that is a meaningful boundary even if the CSS framework has no predefined breakpoint there.

## 9.1 Width transitions

Inspect transitions such as:

- Desktop navigation to compact navigation.
- Multi-column to single-column.
- Full table to responsive table.
- Sidebar to drawer.
- Two-column form to stacked form.
- Large cards to compact cards.
- Toolbar to overflow menu.
- Desktop chat to mobile inbox.
- Dashboard grid changes.

## 9.2 Height boundaries

Test short and tall viewports.

Include representative usable heights of:

- 300px.
- 360px.
- 480px.
- 568px.
- 600px.
- 667px.
- 720px.
- 768px.
- 900px.
- 1080px.
- 1200px.

Test whether important controls remain reachable when the viewport is short.

Use scrolling correctly.

Avoid fixed controls trapping users.

---

# 10. BROWSER ZOOM AND COMPONENT-SCALE ENGINEERING

This section must be treated as a separate testing programme.

## 10.1 Required zoom levels

For desktop browsers, include:

| Browser zoom | Testing purpose |
|---|---|
| 67% | Extreme compact-density check |
| 75% | Reduced zoom and dense layout |
| 80% | Common reduced zoom |
| 90% | Mandatory everyday zoom |
| 100% | **Primary design baseline** |
| 110% | **Mandatory everyday zoom** |
| 125% | Common enlarged zoom |
| 150% | Accessibility and responsive reflow |
| 175% | Intermediate enlargement |
| 200% | Strong enlargement and reflow |
| 250% | High enlargement |
| 300% | High enlargement |
| 400% | Accessibility reflow stress test |

The primary premium visual assessment must occur at 100%.

However, the application must remain functional at increased zoom levels.

Do not override user preferences to force 100%.

## 10.2 Zoom versus component sizing

Investigate:

- CSS pixel behaviour.
- Root font size.
- Rem and em usage.
- Relative spacing tokens.
- Fixed pixel dimensions.
- Maximum widths.
- Minimum widths.
- Component transforms.
- Browser zoom.
- OS scaling.
- Device pixel ratio.
- Typography metrics.

Do not attempt to compensate for browser zoom by globally shrinking the page with CSS transforms.

The correct objective is consistent visual proportions and responsive reflow.

## 10.3 Component-to-viewport ratios

For each significant component family, document:

- Reference viewport.
- Reference rendered width.
- Reference rendered height.
- Reference font size.
- Reference padding.
- Reference icon size.
- Expected responsive behaviour.
- Measured rendered dimensions.
- Actual proportional change.
- Alignment.
- Overflow.
- Minimum usable size.
- Maximum usable size.

Examples include:

- Buttons.
- Input fields.
- Dropdowns.
- Navigation controls.
- Search boxes.
- Cards.
- Tables.
- Charts.
- Dialogs.
- Drawers.
- Tabs.
- Badges.
- Icons.
- Avatars.
- Floating chat panels.
- AI execution panels.
- Calendar controls.

Do not enforce one universal scaling ratio across all component types.

Use design tokens, flexible sizing, appropriate minimums and maximums, and reflow rules.

## 10.4 Typography scaling

Audit:

- Font family.
- Font loading.
- Font fallback.
- Font size.
- Font weight.
- Line height.
- Letter spacing.
- Text container width.
- Responsive typography.
- Heading hierarchy.
- Body text.
- Table text.
- Labels.
- Buttons.
- Tooltips.
- Mobile typography.
- Native app typography.

Test both zoom and text enlargement.

## 10.5 Text scaling scenarios

Test:

- Normal text.
- Enlarged text.
- Long labels.
- Long usernames.
- Long company names.
- Long email addresses.
- Long URLs.
- Large numeric values.
- Long currency values.
- Translated labels.
- Validation messages.
- Multiple-line errors.
- Empty-state descriptions.
- Notification text.

Support increased text size without critical loss of content or functionality.

Where relevant, test text-only enlargement separately from full-page zoom.

---

# 11. TEXT WRAPPING, OVERFLOW AND WARPING ELIMINATION

**Perform a product-wide layout integrity audit.**

The goal is not to prevent all text wrapping.

Natural text wrapping is necessary and desirable in responsive interfaces.

The goal is to eliminate **unintended wrapping, clipping, overlap and deformation**.

## 11.1 Text defects

Detect:

- Text overlapping neighbouring elements.
- Labels cut off.
- Buttons with unreadable labels.
- Navigation items colliding.
- Breadcrumb wrapping failures.
- Unexpected word breaks.
- Text overflowing cards.
- Text hidden underneath fixed elements.
- Tooltips outside viewport.
- Validation messages covering controls.
- Inaccessible truncated content.
- Broken RTL text where supported.
- Long unbroken strings destroying layouts.

## 11.2 Layout defects

Detect:

- Negative overflow.
- Horizontal page scrolling where not intended.
- Broken grids.
- Cards escaping containers.
- Tables extending beyond the available area without usable scrolling.
- Dialogs taller than the screen with unreachable controls.
- Fixed headers covering content.
- Bottom navigation covering buttons.
- Sidebars overlapping main content.
- Popovers opening offscreen.
- Tooltips clipped by ancestors.
- Floating panels covering essential actions.
- Charts squashed beyond readability.
- Images stretched or distorted.
- Icons misaligned.
- Inconsistent padding.
- Collapsed whitespace.

## 11.3 Appropriate remediation

Prefer:

- Correct Flexbox behaviour.
- Correct CSS Grid behaviour.
- Proper min-width and max-width.
- `min-width: 0` where needed.
- Content-driven sizing.
- Responsive container queries.
- Intentional wrapping.
- Appropriate overflow handling.
- Accessible text truncation for secondary content.
- Responsive table patterns.
- Correct line-height.
- Consistent spacing tokens.
- Aspect-ratio preservation.
- Correct image object fitting.

Do not conceal defects by indiscriminately adding `overflow: hidden`.

Do not shrink all text until it fits.

Do not globally disable wrapping.

## 11.4 Automated layout assertions

Implement automated checks for:

- Unexpected horizontal document overflow.
- Elements extending beyond viewport.
- Critical elements overlapping.
- Unreachable action buttons.
- Hidden focused elements.
- Broken modal boundaries.
- Images with incorrect aspect ratios.
- Content inaccessible at zoom.
- Responsive navigation collisions.

Combine DOM measurements, computed styles and screenshot-based checks.

Use visual judgement for cases where automated geometry alone cannot establish correctness.

---

# 12. COLOUR, WHITESPACE AND ORIENTATION AUDIT

Inspect the complete SaaS at the level of actual design tokens and rendered styles.

## 12.1 Colour correctness

Verify:

- Primary colours.
- Secondary colours.
- Accent colours.
- Neutral palette.
- Backgrounds.
- Borders.
- Status colours.
- Warning colours.
- Error colours.
- Success colours.
- Hover states.
- Selected states.
- Focus rings.
- Disabled states.
- Chart palettes.

Check contrast and consistency.

Do not assume premium means excessive gradients or bright colours.

## 12.2 Whitespace

Inspect:

- Page margins.
- Section spacing.
- Card padding.
- Table padding.
- Form spacing.
- Toolbar spacing.
- Navigation gaps.
- Heading separation.
- Responsive whitespace.
- Modal spacing.
- Dashboard density.

Ensure whitespace is deliberate and consistent.

Avoid both excessive empty space and cramped layouts.

## 12.3 Orientation changes

For mobile and tablet, test orientation changes while:

- A form is partially completed.
- A modal is open.
- A wizard is active.
- A message is being typed.
- A call is active.
- A calendar event is selected.
- An upload is in progress.
- An AI execution is running.
- A table is filtered.

State should remain correct.

Orientation changes must not duplicate requests, lose form data or reset the user journey unexpectedly.

---

# 13. EXTENSIVE CHROME MCP BROWSER VERIFICATION

**Chrome MCP must be treated as the primary interactive inspection and browser-verification tool where available.**

Explicitly discover which Chrome or browser MCP tools are actually installed.

Verify their capabilities before assuming support for navigation, screenshots, overlays, device emulation or browser-zoom control.

If a required capability is unavailable, use an appropriate supported fallback such as browser automation through Playwright or Chrome DevTools Protocol.

Do not claim a browser action occurred unless it was actually executed.

## 13.1 Route-by-route browser inspection

For every application route:

1. Navigate directly.
2. Confirm the expected page.
3. Record authentication context.
4. Capture initial state.
5. Inspect the DOM or accessibility tree.
6. Identify every actionable control.
7. Record visible and hidden conditional controls.
8. Check layout.
9. Check typography.
10. Check responsiveness.
11. Check console errors.
12. Check relevant network failures.
13. Verify loading behaviour.
14. Verify empty states.
15. Verify error states.
16. Verify permission handling.
17. Compare with approved design.
18. Run relevant user actions.
19. Verify actual backend outcomes.
20. Record evidence.

## 13.2 Every button and actionable component

Create an Interaction Register for every route.

Include all relevant:

- Buttons.
- Links.
- Tabs.
- Subtabs.
- Menu items.
- Dropdown options.
- Context menus.
- Search controls.
- Filter controls.
- Sort controls.
- Pagination.
- Toggles.
- Checkboxes.
- Radio controls.
- Date pickers.
- Upload controls.
- Download actions.
- Modal triggers.
- Drawer triggers.
- Wizard navigation.
- Form submissions.
- Save actions.
- Edit actions.
- Delete actions.
- Cancel actions.
- Confirmations.
- Retry buttons.
- Notification controls.
- AI actions.
- Billing actions.
- Invite actions.
- Chat controls.
- Calling controls.
- Calendar actions.
- Admin actions.

Each interaction must have:

- Control ID.
- Route.
- Workspace.
- Role.
- Preconditions.
- Expected action.
- Expected UI effect.
- Expected backend effect.
- Actual result.
- Evidence.
- Test status.

## 13.3 Genuine click-through testing

Use real browser interaction APIs to exercise controls.

Avoid declaring controls working simply because event handlers exist in source code.

Verify navigation, state changes and backend effects.

For destructive or financially sensitive controls, use safe fixtures, sandbox environments or appropriately mocked boundaries.

Do not click production controls indiscriminately.

## 13.4 Full menu traversal

For each workspace:

- Open every top-level navigation item.
- Open every nested menu.
- Test every dropdown option.
- Test active-state highlighting.
- Test keyboard navigation.
- Test mobile menu equivalents.
- Test menu closure.
- Test outside clicks.
- Test Escape handling.
- Test focus return.
- Test role-based visibility.

## 13.5 Modals, drawers and wizards

For every applicable overlay or multi-step interface:

- Open.
- Close.
- Submit.
- Cancel.
- Validate.
- Test error states.
- Navigate backwards.
- Navigate forwards.
- Change tabs.
- Scroll.
- Resize.
- Test keyboard focus.
- Test mobile orientation.
- Test browser zoom.
- Test permissions.
- Verify resulting data changes.

## 13.6 Forms

Test:

- Required fields.
- Optional fields.
- Conditional fields.
- Input masks.
- Data types.
- Validation.
- Maximum lengths.
- Long values.
- Empty submission.
- Invalid submission.
- Valid submission.
- Duplicate submission.
- Server errors.
- Partial save.
- Autosave where used.
- Submission loading.
- Success.
- Retry.
- Session expiry.

## 13.7 Browser state combinations

For important routes, test:

- First visit.
- Returning visit.
- Empty data.
- Minimal data.
- Typical data.
- Large dataset.
- Loading.
- Error.
- Restricted access.
- Expired session.
- Network interruption.
- Partial completion.

## 13.8 Role-based browser tests

Test each applicable user role and workspace.

Verify both:

- Controls a user should see.
- Controls a user must not access.

Attempt direct navigation to restricted routes.

Test backend authorisation independently of UI visibility.

## 13.9 Console and network audit

Capture relevant:

- JavaScript errors.
- Framework warnings.
- Failed HTTP requests.
- Unexpected redirects.
- Hydration issues.
- Missing assets.
- Broken fonts.
- Realtime failures.
- API errors.
- Unhandled promises.
- Performance anomalies.

Resolve relevant defects.

## 13.10 Coverage accounting

Track:

- Discovered routes.
- Tested routes.
- Discovered interactive controls.
- Executed controls.
- Verified controls.
- Blocked controls.
- Failed controls.
- Untested controls.

Do not claim complete interaction coverage unless the register supports it.

---

# 14. VIEWPORT × ZOOM × ROLE × INTERACTION TEST MATRIX

Combine the browser inspection programme with the responsive matrix.

However, avoid blindly multiplying every device width, zoom level, role and application state into millions of redundant tests.

Use risk-based, combinatorial and boundary testing while preserving complete route and control inventory coverage.

## 14.1 Mandatory baseline passes

For every applicable route:

- Desktop at 100%.
- Mobile portrait at representative width.
- Tablet portrait.
- Tablet landscape.
- Relevant user role.
- Primary page state.

For release-critical routes, also include:

- Mobile landscape.
- Small laptop.
- Large desktop.
- 90%, 100% and 110% browser zoom.
- Important breakpoint boundaries.
- High zoom accessibility.
- Error and loading states.

## 14.2 Critical-control combinations

Every discovered critical control should be executed in the appropriate base configuration.

Additional viewport and zoom combinations must be applied where the control changes structure, visibility, position or behaviour.

For example:

- Desktop navigation becomes mobile menu.
- A table becomes a card list.
- A filter sidebar becomes a drawer.
- A modal becomes full-screen.
- A multi-column form becomes stacked.
- A floating panel becomes a dedicated route.

Each structural transformation requires separate testing.

## 14.3 Risk-based prioritisation

Prioritise comprehensive combinations for:

- Authentication.
- Onboarding.
- Payments.
- Subscription management.
- Account recovery.
- Admin functions.
- AI agent controls.
- Chat.
- Calls.
- Interviews.
- Calendar.
- Search.
- Uploads.
- Data export.
- Permission-sensitive portals.
- Critical commercial workflows.

## 14.4 Boundary and pairwise coverage

Use combinations that cover interactions among:

- Device class.
- Orientation.
- Zoom.
- Browser.
- Input method.
- User role.
- Application state.

Always include explicit tests at actual layout breakpoints.

Pairwise coverage is a supplement, not a replacement for mandatory critical-route tests.

---

# 15. NATIVE MOBILE APP — INDEPENDENT TESTING PROGRAMME

If the SaaS has a native or cross-platform phone application, create a separate testing programme.

Do not assume Chrome MCP alone can verify native application behaviour.

If the mobile app uses Flutter, inspect the actual Flutter widget tree, platform implementation and testing infrastructure.

Use supported Flutter integration tests, widget tests, device emulators and appropriate native automation.

## 15.1 Device coverage

Test representative:

- Small phones.
- Standard phones.
- Large phones.
- Tablets.
- Foldables where supported.
- iOS.
- Android.
- Portrait.
- Landscape.
- Light mode.
- Dark mode where supported.
- Text scaling.
- Display scaling.

## 15.2 Native layout

Inspect:

- Safe areas.
- Status bars.
- Navigation bars.
- Gesture regions.
- App bars.
- Bottom navigation.
- Floating controls.
- Keyboard handling.
- Scroll views.
- Platform dialogs.
- App lifecycle.
- Orientation changes.
- Deep links.
- Push notification routes.

## 15.3 Flutter-specific checks where applicable

Inspect:

- Render overflow errors.
- Constraint violations.
- Flexible and Expanded usage.
- SafeArea usage.
- LayoutBuilder and MediaQuery behaviour.
- Text scaling.
- Nested scrolling.
- Keyboard inset handling.
- Theme tokens.
- Widget rebuild behaviour.
- State restoration.
- Image loading.
- Accessibility semantics.

Do not simply suppress Flutter overflow warnings.

Fix the underlying layout constraints.

## 15.4 Mobile lifecycle

Test:

- Fresh install.
- Returning session.
- Background.
- Foreground.
- App restart.
- Process termination.
- Network reconnection.
- Authentication expiration.
- Deep-link opening.
- Push notification navigation.
- Permission denial.
- Device rotation.
- Keyboard activation.
- Interrupted uploads.
- Active call handling.

## 15.5 Native visual verification

Capture and compare screenshots for relevant screen sizes and text scales.

Use native visual regression and widget geometry checks.

Maintain a shared design-token philosophy between web and native applications where appropriate, without forcing identical platform interaction patterns.

---

# 16. INTERNATIONALISATION AND CONTENT STRESS TESTING

Responsive correctness is affected by content, not only screen width.

Test realistic and extreme content.

## 16.1 Text length

Include:

- Short labels.
- Long labels.
- Very long names.
- Long addresses.
- Long URLs.
- Long company names.
- Multi-line descriptions.
- Long notifications.
- Long error messages.
- Large financial values.

## 16.2 Localisation

Where supported, test:

- Multiple languages.
- Currency formatting.
- Date formats.
- Timezones.
- Decimal separators.
- Large translations.
- Right-to-left layout.
- Locale-specific calendars.

## 16.3 Dynamic data

Test:

- Empty dashboards.
- Hundreds of records.
- Thousands of records where realistic.
- Complex tables.
- Large charts.
- Long filenames.
- File previews.
- Many notifications.
- Many chat messages.
- Large filter selections.
- Large search results.

Verify rendering, responsiveness and performance.

---

# 17. VISUAL REGRESSION AND FINAL OVERLAY PROGRAMME

Create a permanent visual-regression system.

## 17.1 Screenshot baseline

For each important route and layout state, record:

- Route.
- Workspace.
- Role.
- State.
- Viewport.
- Orientation.
- Zoom.
- Browser.
- DPR where relevant.
- Build/commit reference.
- Screenshot.
- Reference design.
- Expected result.

## 17.2 Stable capture

Ensure visual comparisons use stable conditions:

- Fonts loaded.
- Images loaded.
- Consistent test data.
- Known animation state.
- Controlled time-dependent content.
- Stable viewport.
- Consistent browser version.
- Controlled network conditions.

Do not hide genuine defects by masking entire problematic regions.

## 17.3 Comparison tolerances

Use sensible tolerances for:

- Alignment.
- Spacing.
- Typography geometry.
- Icon placement.
- Image crop.
- Component proportions.
- Visual hierarchy.

Account for legitimate font antialiasing and platform rendering differences.

Do not enforce pixel-identical rendering across different operating systems where that would be technically inappropriate.

## 17.4 Final overlay checks

After completing design upgrades and responsive fixes:

1. Reopen every relevant route.
2. Capture the approved test states.
3. Compare against the design baseline.
4. Investigate unexpected differences.
5. Correct defects.
6. Rerun targeted interaction tests.
7. Update screenshots.
8. Verify there are no new regressions.
9. Record unresolved deviations.
10. Complete the final visual acceptance report.

---

# 18. MCP TOOLING — COMPLETE ENTERPRISE VERIFICATION

Inspect all actual MCP clients, servers, adapters and registries.

Verify:

- Tool discovery.
- Resource discovery.
- Schema validation.
- Authentication.
- Authorisation.
- Permissions.
- Server availability.
- Connection lifecycle.
- Reconnection.
- Tool invocation.
- Tool results.
- Error handling.
- Cancellation.
- Rate limits.
- Audit logging.
- Tenant isolation.
- Prompt injection protection.
- Credential revocation.

Where users can connect MCP servers, verify the appropriate connection, permissions, tools, health and disconnect interfaces.

Do not grant privileged tool access merely because a tool has been discovered.

Create a complete MCP Tool Coverage Register.

---

# 19. ENTERPRISE AI AGENT RUNTIME

The SaaS agent must be a durable, secure execution system.

Assess and implement all applicable capabilities:

1. Multi-hour execution.
2. Multi-day workflows.
3. Scheduled runs.
4. Recurring objectives.
5. Event-driven triggers.
6. Cross-app actions.
7. Tool discovery.
8. Tool execution.
9. Persistent memory.
10. Task decomposition.
11. Parallel execution.
12. Sub-agent delegation.
13. Execution checkpoints.
14. Failure recovery.
15. Intelligent retries.
16. Approval checkpoints.
17. Permission inheritance.
18. Spending limits.
19. Model routing.
20. Execution histories.
21. Browser tools.
22. Document generation.
23. Spreadsheet generation.
24. Report generation.
25. Customer communications.
26. Financial preparation.
27. Workflow construction.
28. Monitoring agents.
29. Human handoffs.
30. Outcome verification.

## 19.1 Durable architecture

Verify suitable persistent orchestration, task graphs, queues, workers, schedules, triggers, memory, budgets, approvals, audit logging and checkpoints.

Do not rely on a browser session or single serverless request remaining open for multi-day work.

## 19.2 Delegation

Allow product agents to delegate controlled subtasks with restricted permissions and budgets.

Limit concurrency and delegation depth.

Prevent recursive agent proliferation.

## 19.3 Model routing

Use appropriate quality, capability, latency, privacy and cost criteria.

Track provider usage and enforce subscription limits.

## 19.4 Agent security

Test:

- Prompt injection.
- Tool abuse.
- Malicious retrieved content.
- Unauthorised action attempts.
- Memory leakage.
- Budget bypass.
- False completion.
- Unsafe browser operations.
- Cross-tenant access.
- Workflow loops.

## 19.5 Outcome verification

Confirm authoritative postconditions after actions.

A successful API call alone is not proof of the intended business outcome.

## 19.6 Agent UI

Use the product's premium design system for appropriate interfaces such as objectives, active runs, schedules, triggers, tools, approvals, budgets, history, monitoring, generated files and recovery.

---

# 20. COMMUNICATIONS, CHAT, INBOX, CALLS AND INTERVIEWS

Where applicable, test the full communication platform.

Include:

- Direct messages.
- Group chat.
- Contact search.
- Conversation search.
- New conversations.
- Message attachments.
- Realtime status.
- Typing indicators.
- Read states.
- Delivery states.
- Archive.
- Muting.
- Blocking.
- Reporting.
- Conversation assignments.
- Floating chat.
- Docked chat.
- Full inbox.
- Audio calls.
- Video calls.
- Call invitations.
- Device permissions.
- Call reconnection.
- Screen sharing where supported.
- Interview scheduling.
- Interview rooms.
- Waiting rooms.
- Interview notes.
- Scorecards.
- Calendar links.
- Reminders.

Test desktop, tablet, mobile web and native mobile equivalents.

Verify session lifecycle, permissions, networking and privacy.

---

# 21. SETTINGS, TOKENS AND CREDENTIALS

Inventory all user, workspace, organisation and administrator settings.

Test:

- Profile.
- Authentication.
- Password.
- MFA where used.
- Sessions.
- Privacy.
- Notifications.
- Appearance.
- Language.
- Timezone.
- Billing.
- Subscriptions.
- AI.
- Integrations.
- API keys.
- OAuth.
- Webhooks.
- Demo data.
- Storage.
- Support.

Differentiate API keys, OAuth tokens, refresh tokens, session tokens, invitation tokens and AI usage units.

Verify creation, scoping, encryption or hashing, rotation, expiry, revocation, audit logs and permission enforcement.

Never expose credentials in reports.

---

# 22. ADVERTISING INFRASTRUCTURE

Where applicable, audit:

- Campaign creation.
- Advertiser accounts.
- Ad account connections.
- Campaign objectives.
- Creative assets.
- Placements.
- Budgets.
- Scheduling.
- Targeting.
- Attribution.
- Conversion tracking.
- Impressions.
- Clicks.
- Reporting.
- Fraud.
- Billing.
- Campaign approval.
- Provider API integrations.

Test budget exhaustion, API failures, invalid targeting, duplicate conversions, consent restrictions and reporting accuracy.

Separate sponsored content from organic discovery.

---

# 23. SEARCH, FILTERS AND RECOMMENDATIONS

Inspect all searchable entity types.

Verify:

- Search index.
- Full-text search.
- Synonyms.
- Autocomplete.
- Semantic search where appropriate.
- Hybrid ranking.
- Structured filters.
- Sorting.
- Pagination.
- Map search where applicable.
- Saved searches.
- Search history.
- Zero-result suggestions.
- Search permissions.
- Cache invalidation.
- Result relevance.

Test all filter combinations relevant to each entity.

Do not expose private records through search suggestions, facet counts or semantic retrieval.

For recommendations, assess:

- Eligibility.
- Relevance.
- Quality.
- Personalisation.
- Cold-start fairness.
- Diversity.
- Dismissal.
- Feedback.
- Ranking explanations.
- Fraud resistance.
- Conversion and outcome quality.

---

# 24. FREE AND LOW-COST INTEGRATIONS

Identify the product's essential provider integrations.

Compare existing integrations with suitable alternatives on:

- Commercial permissions.
- Free-tier limits.
- Paid usage thresholds.
- API quotas.
- Reliability.
- Security.
- Maintenance.
- Required infrastructure.
- Data access.
- Integration complexity.

Do not assume an open-source SDK implies free production infrastructure.

Test each actual integration end to end.

Generate a structured integration ownership workbook without secrets.

---

# 25. CUSTOMER SUPPORT AND HELP CENTRE

Verify:

- Knowledge-base coverage.
- Actual annotated screenshots.
- Contextual help.
- Search.
- Contact forms.
- Support tickets.
- Triage.
- Assignment.
- Priority.
- SLA timers.
- Internal notes.
- Replies.
- Escalation.
- Closure.
- Reopening.
- Satisfaction feedback.
- Support analytics.
- AI support where implemented.

Create and verify guided tutorials covering relevant workspace sections.

Tutorial callouts and arrows must be checked at desktop, tablet, mobile and relevant zoom levels.

---

# 26. MAINTENANCE MODE

Verify operational controls for:

- Global maintenance.
- Workspace maintenance.
- Feature maintenance.
- Read-only mode.
- Scheduled maintenance.
- Emergency maintenance.
- Status messages.
- Admin access.
- Queue handling.
- Webhooks.
- Payments.
- AI runs.
- Recovery.
- Audit logs.

Test existing sessions, active operations, new visitors and background jobs.

Do not abruptly interrupt critical financial operations where graceful draining is required.

---

# 27. USER PROFILES AND BUSINESS IDENTITIES

Audit:

- User profile.
- Public profile.
- Private data.
- Business profile.
- Organisations.
- Skills.
- Qualifications.
- Work history.
- Portfolio.
- Verification.
- Credentials.
- Availability.
- Location.
- Contact settings.
- Profile visibility.
- Profile completeness.
- Search indexing.
- Recommendation effects.

Test long names, complex profiles, large portfolios, expired credentials and permission controls.

Ensure mobile profile screens remain usable with enlarged text.

---

# 28. REVIEWS, TRUST AND DISPUTES

Verify:

- Review eligibility.
- Verified interaction.
- Ratings.
- Written feedback.
- Provider responses.
- Review reports.
- Moderation.
- Fake review detection.
- Duplicate reviews.
- Review manipulation.
- Evidence.
- Dispute submission.
- Appeal.
- Decision history.
- Reputation calculations.

Protect genuine negative reviews from arbitrary deletion while providing fair processes for malicious or fraudulent reviews.

Test all review and dispute states.

---

# 29. CALENDAR AND AVAILABILITY

Assess:

- Day view.
- Week view.
- Month view.
- Agenda.
- Personal calendar.
- Organisation calendar.
- Team calendar.
- Appointments.
- Meetings.
- Interviews.
- Reminders.
- Recurrence.
- Availability.
- Working hours.
- Time off.
- Conflict detection.
- Double booking.
- Buffers.
- Timezones.
- External calendar sync.
- AI scheduling actions.

Test responsive calendar layouts, short screens, landscape views, timezone transitions and keyboard interaction.

---

# 30. NOTIFICATIONS

Create a complete notification event matrix.

Verify:

- In-app notifications.
- Email.
- Push.
- SMS.
- WhatsApp where applicable.
- Realtime badges.
- Notification preferences.
- Quiet hours.
- Templates.
- Delivery tracking.
- Retries.
- Deduplication.
- Read state.
- Deep links.
- Aggregation.
- Role and permission restrictions.

Test relevant events from messages, tasks, bookings, payments, AI runs, reviews, support, affiliates and maintenance.

---

# 31. AFFILIATE WORKSPACES AND PROFITABILITY

Where applicable, verify:

- Affiliate onboarding.
- Affiliate roles.
- Dashboards.
- Tracking links.
- Deep links.
- Attribution.
- Campaign resources.
- Approved marketing assets.
- Click tracking.
- Conversion tracking.
- Commissions.
- Commission grades.
- Refund reversals.
- Fraud controls.
- Earnings.
- Payouts.
- Reporting.
- Affiliate support.

## 31.1 Gala Dock margin verification

Validate actual gross/contribution margin from known revenue and variable costs; separate ticket, subscription, supplier/venue and affiliate economics. Do not presume a numerical target without an approved business model.

---

# 32. ADMIN WORKSPACES AND EXTERNAL PORTALS

## 32.1 Admin

Test all actual administrator modules, including appropriate:

- Command centre.
- Accounts.
- Organisations.
- Subscriptions.
- Payments.
- Affiliate programmes.
- AI administration.
- MCP permissions.
- Support.
- Trust and safety.
- Moderation.
- Disputes.
- Analytics.
- Infrastructure.
- Maintenance.
- Feature flags.
- Audit logs.
- Security monitoring.

Enforce least privilege.

Test every administrator role and sensitive action.

## 32.2 Portals

Identify actual:

- Customer portals.
- Client portals.
- Provider portals.
- Supplier portals.
- Partner portals.
- Guest portals.
- Other product-specific portals.

Test onboarding, invitations, authentication, permissions, navigation, records, files, communications, notifications and mobile layouts.

Ensure portals access only the intended data.

---

# 33. GITHUB AND ENGINEERING GOVERNANCE

Inspect:

- Repository structure.
- Package organisation.
- Branch rules.
- Pull requests.
- GitHub Actions.
- Required checks.
- Security scanning.
- Secret scanning.
- Dependency scanning.
- Lockfiles.
- Licence obligations.
- Code ownership.
- Release tags.
- Versioning.
- Change logs.
- Build reproducibility.
- Software Bill of Materials.
- Build provenance.
- Deployment permissions.

Implement appropriate CI/CD quality gates.

Separate fast pull-request checks from deeper pre-release and scheduled suites.

Do not make privileged secrets available to untrusted pull-request code.

---

# 34. INFRASTRUCTURE, CLOUD AND RELIABILITY

Map and audit actual:

- Hosting.
- Compute.
- Databases.
- Supabase.
- Realtime.
- Storage.
- CDN.
- DNS.
- TLS.
- Queues.
- Workers.
- Schedulers.
- Edge functions.
- AI providers.
- Payment providers.
- Monitoring.
- Backups.
- Deployments.

Verify:

- Environment separation.
- Secrets.
- Permissions.
- Connection limits.
- Capacity.
- Scaling.
- Background processing.
- Error handling.
- Observability.
- Disaster recovery.
- Backup restoration.
- Rollback.
- Cost efficiency.

Define appropriate reliability objectives.

Do not claim backups are verified until restore tests have been performed.

---

# 35. SUPABASE AND DATABASE ENGINEERING

Where applicable, inspect:

- Tables.
- Schemas.
- Relationships.
- Indexes.
- Constraints.
- Views.
- Functions.
- Triggers.
- Migrations.
- RLS.
- Auth.
- Realtime.
- Storage.
- Edge Functions.
- Cron.
- Queues.
- Backups.

Identify redundant or inconsistent structures.

Test every relevant role and CRUD operation.

Verify cross-tenant isolation.

Check transactions, concurrency, idempotency, retention and migration safety.

---

# 36. PAYMENTS, STRIPE CONNECT AND SUBSCRIPTIONS

Test applicable:

- Checkout.
- Payment intents.
- Authorisation.
- Capture.
- Declines.
- Payment authentication.
- Refunds.
- Partial refunds.
- Chargebacks.
- Disputes.
- Reconciliation.
- Connected account onboarding.
- Application fees.
- Commissions.
- Transfers.
- Payouts.
- Reversals.
- Subscription trials.
- Upgrades.
- Downgrades.
- Renewals.
- Cancellation.
- Add-ons.
- Feature gating.
- AI quotas.
- Usage metering.
- Overage limits.

Enforce entitlements server-side.

Verify actual provider state through sandbox events and authoritative backend records.

Do not rely exclusively on successful UI redirects.

---

# 37. LEGAL, PRIVACY AND COMPLIANCE READINESS

Determine legal applicability based on the actual product and operating markets.

Assess relevant:

- UK GDPR.
- EU GDPR.
- Data Protection Act 2018 and applicable amendments.
- Data (Use and Access) Act 2025 provisions in force.
- PECR.
- Cookie consent.
- Electronic marketing.
- Consumer protection.
- Online Safety Act.
- Accessibility obligations.
- Intellectual property.
- FCA requirements where applicable.
- Payment and financial services rules.
- Sector-specific obligations.
- International data transfers.

Test applicable data subject rights:

- Access.
- Rectification.
- Erasure.
- Restriction.
- Objection.
- Portability.
- Consent withdrawal.

Verify identity controls, deadlines, secure exports, exemptions and audit trails.

Automate technical compliance checks while accurately reporting matters requiring legal judgement.

---

# 38. ONBOARDING, AUTHENTICATION AND DEMO DATA

Test all actual onboarding types.

Verify:

- Registration.
- Login.
- Email verification.
- Password reset.
- Account recovery.
- Invitations.
- Workspace creation.
- Organisation creation.
- Roles.
- Required fields.
- Conditional fields.
- Interrupted onboarding.
- Session expiry.
- Account deletion.

Create realistic synthetic demo datasets for relevant sections.

Allow insertion during onboarding or through Settings.

Default demo data retention: **30 days**, unless the user explicitly chooses retention.

Provide manual deletion.

Ensure cleanup never removes genuine business data.

---

# 39. SECURITY EXERCISES — RED, BLUE, BLACK, WHITE AND PURPLE

Create a complete exercise register.

## Red Team

Test authorised adversarial scenarios involving authentication, authorisation, RLS, APIs, business logic, payments, reviews, referrals, integrations, MCP, AI agents and data access.

## Blue Team

Verify detection, alerts, investigation, containment, recovery and security logging.

## Black Team

Conduct authorised black-box testing from an external-user perspective.

## White Team

Control scope, rules of engagement, evidence quality, stop conditions and acceptance criteria.

## Purple Team

Reproduce findings, implement fixes, improve detection and rerun scenarios.

For each exercise record:

- Test ID.
- Target.
- Scenario.
- Preconditions.
- Allowed environment.
- Expected result.
- Actual result.
- Evidence.
- Severity.
- Root cause.
- Remediation.
- Retest.
- Status.

Use safe and authorised environments.

---

# 40. PERFORMANCE, ACCESSIBILITY AND FAULT-INJECTION TESTING

Run appropriate:

- Unit tests.
- Component tests.
- Integration tests.
- API tests.
- Contract tests.
- Browser E2E.
- Native app tests.
- Visual regression.
- Accessibility.
- Load testing.
- Stress testing.
- Soak testing.
- Concurrency testing.
- Property-based tests.
- State-machine tests.
- Mutation testing where useful.
- Fuzz testing.
- Fault injection.
- Controlled chaos exercises.
- Backup restoration.
- AI evaluations.

Test failure scenarios including:

- Worker crash.
- Database disconnection.
- API timeout.
- Queue backlog.
- AI provider outage.
- Webhook delay.
- Storage outage.
- Credential expiry.
- Partial deployment.
- Network degradation.

Define relevant WCAG 2.2 AA accessibility acceptance criteria.

---

# 41. AUTOMATED REMEDIATION AND TEST EVIDENCE

Maintain an Issue and Remediation Register.

Use:

**P0 — Critical:** Serious security exposure, data loss, dangerous financial defect, tenant isolation failure or equivalent release blocker.

**P1 — Major:** Broken critical journey, significant authorisation issue, unsafe agent action, major payment defect or serious operational failure.

**P2 — Moderate:** Important usability, design, performance or functional problem.

**P3 — Minor:** Small refinements and noncritical polish.

For each defect:

1. Reproduce.
2. Analyse root cause.
3. Implement fix.
4. Run targeted test.
5. Run relevant regression.
6. Capture evidence.
7. Update documentation.
8. Mark complete only after verification.

Use exact test statuses:

- PASS.
- FAIL.
- BLOCKED.
- NOT RUN.
- NOT APPLICABLE.

Do not convert unexecuted tests into passing results.

---

# 42. REQUIRED RESPONSIVE AND CHROME MCP DELIVERABLES

In addition to the broader release documentation, require:

1. **Complete Viewport Matrix** — devices, CSS widths, heights and orientation classes.

2. **Viewport Boundary Register** — each actual breakpoint and its below/exactly/above tests.

3. **Browser Zoom Matrix** — tested zoom levels, component behaviour and issues.

4. **Typography Scaling Report** — font metrics, text enlargement, wrapping and accessibility.

5. **Component Dimension Register** — baseline and measured responsive sizing for major primitives.

6. **Chrome MCP Tool Availability Report** — verified browser tooling and limitations.

7. **Complete Route Inspection Register** — every discovered route, role and state.

8. **Interaction Coverage Register** — every discovered button and actionable control.

9. **Responsive Defect Register** — overflow, clipping, collisions and warping.

10. **Design Overlay Report** — approved design comparisons and evidence.

11. **Mobile Orientation Report** — phone/tablet orientation and state-preservation results.

12. **Native Mobile App Test Report** — Flutter or other native framework where applicable.

13. **Cross-Browser Compatibility Report** — relevant Chrome, Edge, Firefox and Safari coverage using available tooling.

14. **Visual Regression Evidence Index** — screenshots, baselines and diffs.

15. **Final Responsive Acceptance Report** — executed combinations, results, defects and remaining limitations.

16. **Responsive Test Automation Suite** — permanent tests runnable through project CI.

Use structured CSV, JSON, Markdown, XLSX or test report formats as appropriate.

Every report must reference actual executed tests.

---

# 43. COMPLETE RELEASE-READINESS DOCUMENTATION

Create a maintained documentation structure such as:

`docs/release-readiness/`

Include relevant:

- Product Architecture Register.
- Workspace and Route Inventory.
- Design Fidelity Report.
- Premium Design Audit.
- Primitive Registry.
- Viewport and Zoom Registers.
- Browser Interaction Coverage.
- Native Mobile QA.
- Functional Journey Catalogue.
- MCP Tool Register.
- AI Agent Architecture.
- AI Evaluation Report.
- Communications and Calling Audit.
- Settings and Credentials Audit.
- Search and Recommendations Report.
- Advertising Infrastructure Report.
- Support and Help Coverage.
- Maintenance Mode Report.
- Profile and Trust Audit.
- Reviews and Disputes Report.
- Calendar and Notifications Report.
- Affiliate Programme Report.
- Affiliate Unit Economics Workbook.
- Admin and Portal Audit.
- GitHub and CI/CD Audit.
- Infrastructure and Disaster Recovery Report.
- Database and RLS Report.
- Payment Verification Report.
- Privacy and Compliance Matrix.
- Onboarding and Demo Data Report.
- Red Team Report.
- Blue Team Report.
- Black-Box Report.
- White Team Evidence Report.
- Purple Team Retest Report.
- Security Remediation Register.
- Complete Test Matrix.
- Final Regression Report.
- Residual Risk Register.
- Final Release-Readiness Assessment.

Consolidate overlapping reports when helpful.

Avoid empty documents and duplication.

---

# 44. FINAL RESPONSIVE ACCEPTANCE GATE

Before declaring the interface ready, verify:

- All known routes included in the route register.
- All required workspace shells tested.
- Every critical responsive layout transformation tested.
- Relevant desktop widths tested.
- Relevant laptop widths tested.
- Relevant tablet widths tested.
- Relevant phone widths tested.
- Portrait and landscape tested where supported.
- 90%, 100% and 110% zoom tested for critical desktop routes.
- Higher accessibility zoom tested.
- Actual breakpoint boundaries tested.
- Browser resizing tested.
- Mobile keyboard behaviour tested.
- Safe-area handling tested.
- Unintended wrapping resolved.
- Critical overlap resolved.
- Inaccessible clipping resolved.
- Image distortion resolved.
- Essential controls remain reachable.
- Navigation remains usable.
- Required tables and charts remain accessible.
- Modal and drawer behaviour verified.
- Chrome MCP interaction tests executed.
- Visual overlays or equivalent comparisons completed.
- Native app layouts independently verified where applicable.
- No unresolved P0/P1 responsive defects.
- Test evidence recorded.

Do not claim every imaginable device has been tested.

Report the actual tested matrix and the extent of coverage.

---

# 45. FINAL ENTERPRISE RELEASE ACCEPTANCE GATES

The product must satisfy applicable measurable gates for:

## Design

Premium styling, reference fidelity, correct layout, responsive behaviour, typography and accessibility.

## Functionality

Critical user journeys, correct backend state, permissions, error handling and recovery.

## AI

Durable execution, schedules, recurrence, parallelism, delegation, tools, memory, budgets, approvals and verified outcomes.

## MCP

Tool discovery, invocation, authorisation, isolation, reliability and auditability.

## Communications

Inbox, chat, calling, interviews, attachments and realtime behaviour.

## Settings

Permissions, credentials, API keys, subscription controls and usage accounting.

## Discovery

Search, filters, ranking, recommendations and privacy.

## Commerce

Payments, subscriptions, entitlements, commissions and reconciliation.

## Affiliates

Tracking, attribution, fraud controls, payouts, commission grades and verified unit economics.

## Administration

Admin permissions, support operations, trust and safety, maintenance and audit logging.

## Portals

Role-specific access, data isolation, navigation and workflows.

## GitHub

CI/CD, dependency health, release traceability and source security.

## Infrastructure

Resilience, backups, restoration, monitoring, scaling and rollback.

## Security

Authorised adversarial coverage, detection, remediation and retesting.

## Legal implementation

Applicable technical privacy and data governance controls.

## Documentation

Accurate user help, technical documentation, screenshots, tutorials and test evidence.

No unresolved P0 or release-blocking P1 issue may be silently disregarded.

---

# 46. MANDATORY CLAUDE CODE EXECUTION ORDER

Use a dependency-aware sequence while retaining the design-first requirement.

**Phase 0 — Preflight**

Discover repository, tools, environments, reference designs, Chrome MCP capabilities and available test infrastructure.

**Phase 1 — Design reference mapping**

Map all approved designs to routes, pages, workspaces and states.

**Phase 2 — Initial Chrome MCP design inspection**

Open actual pages, capture screenshots, inspect geometry and perform initial overlay comparisons.

**Phase 3 — Premium design upgrades**

Improve design tokens, primitives, shared components, layouts and visual consistency.

**Phase 4 — Complete viewport matrix**

Build desktop, laptop, tablet, phone, portrait, landscape and unusual-form-factor test definitions.

**Phase 5 — Zoom and typography**

Verify component scaling, font behaviour, CSS layout and accessibility zoom.

**Phase 6 — Responsive remediation**

Correct clipping, wrapping, warping, spacing, alignment, orientation and overflow defects.

**Phase 7 — Chrome MCP interaction census**

Inventory every route and interactive control, including hidden states, menus, drawers and wizards.

**Phase 8 — Complete browser interaction testing**

Execute authorised clicks, forms, navigation, state transitions and user journeys.

**Phase 9 — Native mobile application QA**

Run separate framework-appropriate mobile tests where applicable.

**Phase 10 — Final first-pass design overlay**

Reconcile the visual improvements with approved designs before proceeding.

**Phase 11 — Product and architecture inventory**

Complete functional, data, permissions and integration registers.

**Phase 12 — GitHub and engineering systems**

Audit repository, code quality, CI/CD, security scanning and release engineering.

**Phase 13 — Infrastructure foundations**

Audit hosting, database, queues, storage, environment separation and operational resilience.

**Phase 14 — MCP and enterprise AI**

Complete tool architecture, durable agent runtime, memory, scheduling, delegation, budgets and outcome verification.

**Phase 15 — Communications**

Test inbox, chat, calling, interviews and realtime infrastructure.

**Phase 16 — Settings and identity**

Complete credentials, authentication, tokens, permissions and account settings.

**Phase 17 — Search, ads and recommendations**

Verify discovery, ranking, filtering, personalisation and advertising systems.

**Phase 18 — Profiles, reviews and calendars**

Complete profile, identity, trust, disputes, scheduling and availability workflows.

**Phase 19 — Notifications, support and help**

Verify messaging delivery, case management, knowledge base and guided tutorials.

**Phase 20 — Affiliates and unit economics**

Test referral links, attribution, commissions, payouts and the 70–76% margin target.

**Phase 21 — Administration, portals and maintenance**

Verify administrator operations, external portals and operational maintenance controls.

**Phase 22 — Core functional test suite**

Execute all detailed numbered product journeys.

**Phase 23 — Database, Supabase and storage**

Complete schema, RLS, access and integrity testing.

**Phase 24 — Payments and external integrations**

Verify payment sandboxes, Connect, subscriptions, MCP, APIs and webhooks.

**Phase 25 — Legal and privacy implementation**

Test applicable data protection controls and rights workflows.

**Phase 26 — Red Team**

Execute authorised adversarial scenarios.

**Phase 27 — Blue Team**

Verify prevention, detection and response.

**Phase 28 — Black-Box Team**

Test externally observable behaviour.

**Phase 29 — White Team**

Reconcile exercise evidence and acceptance criteria.

**Phase 30 — Purple Team**

Implement and retest security remediations.

**Phase 31 — Performance and resilience**

Run load, fault injection, backup restoration and recovery tests.

**Phase 32 — Complete AI evaluations**

Test long-running workflows, delegated agents, model routing, budgets, memory and verified outcomes.

**Phase 33 — Cross-workspace regression**

Run comprehensive browser, database, API, payment, agent and mobile regression.

**Phase 34 — Final viewport and overlay verification**

Repeat the visual, zoom, orientation and responsive suite against the final implementation.

**Phase 35 — Final defect closure**

Resolve remaining feasible release-blocking issues and retest.

**Phase 36 — Release candidate**

Verify the exact commit, build, migrations, environment, monitoring, rollback and quality gates.

**Phase 37 — Evidence and release assessment**

Generate final reports, reconcile blockers and issue the evidence-based release recommendation.

Do not compromise urgent security remediation merely to follow nominal phase order.

---

# 47. PERMANENT QUALITY AUTOMATION

The programme must not disappear after launch.

Create permanent automated quality infrastructure.

## 47.1 On pull requests

Run relevant:

- Formatting.
- Linting.
- Type checking.
- Unit tests.
- Component tests.
- Build validation.
- Changed-feature regression.
- Static security checks.

## 47.2 On significant UI changes

Run affected:

- Visual regression.
- Viewport checks.
- Zoom checks.
- Accessibility tests.
- Responsive layout assertions.
- Chrome/browser interaction tests.

## 47.3 On backend changes

Run affected:

- API tests.
- Database tests.
- RLS tests.
- Integration tests.
- Permission tests.
- Contract tests.

## 47.4 On AI changes

Run affected:

- Agent evaluations.
- Tool tests.
- Memory isolation.
- Approval tests.
- Budget enforcement.
- Recovery tests.
- Outcome verification.

## 47.5 On release candidates

Run the full applicable release suite.

Avoid unnecessarily executing expensive full-system tests for every trivial change.

Use change impact analysis and scheduled deep tests.

---

# 48. FINAL RELEASE STATUS

Classify the actual verified result as:

**READY**

All applicable critical acceptance gates passed, with acceptable documented residual risk.

**CONDITIONALLY READY**

Technical verification substantially passed, but explicitly identified noncritical or external dependencies remain.

**NOT READY**

Critical defects, unacceptable risks, broken core functions or major unverified release requirements remain.

A subjective quality score must never override failed critical release gates.

---

# 49. CONTINUATION MODE

The product-specific continuation prompts are provided in Section B. When one is invoked, execute its concrete engineering task in the repository and update the common checkpoint. Do not generate another set of prompts instead of working.


---

# SECTION B — GALA DOCK SPECIALIST CONTINUATION PROMPTS

Use any of these **after** launching the master execution prompt. Each runs **one engineering agent**, resumes existing checkpoints and implements/remediates issues rather than merely reporting them. The commands deliberately avoid assuming any specific tool or route exists. Replace environment/reference paths from repository discovery, never with invented ones.

## 01 — Resume from checkpoint

> Resume Gala Dock's master enterprise completion programme at `/docs/release-audit/galadock/EXECUTION_CHECKPOINT.md` (or the actual established checkpoint). Verify working tree/current commit and the evidence register, preserve user changes, reconcile the last verified task, select the next dependency-unblocked work packet, implement, run the focused test and cross-workspace regression, update the checkpoint and defect register. Use one engineering agent and no false PASS status.

## 02 — Complete design overlay and 1:1 fidelity recovery

> Resume the Gala Dock design reference manifest. Compare every mapped public, customer, organiser, venue, solo supplier, agency supplier, affiliate, admin and portal reference against a deterministic current screenshot at its target viewport/zoom/data state. Use actual overlay/diff tooling; capture geometry/typography/tokens/spacing/imagery/motion changes, fix shared shell/component defects first, then page-specific differences, preserve approved composition, verify reduced motion and update before/after evidence. Report honest per-route progress toward 1:1, never an invented score.

## 03 — Full viewport, orientation and zoom regression

> Run the Gala Dock desktop/laptop/tablet/phone PWA viewport and zoom matrix from the master QA baseline, separately by workspace and on risk-heavy seat maps, calendar, multi-step booking, finance, supplier quotes, event maps and admin tables. Include landscape, safe areas, keyboard overlay, five-item mobile nav/bottom-sheet where approved, text scaling, 200–400% accessibility reflow and focus/keyboard. Fix actual wraps, clipping, dead zones and warping, then recapture reference overlays and update coverage.

## 04 — Every-route, every-control Chrome MCP audit

> Using validated Chrome MCP and a safe seeded Gala Dock environment, discover every route, subtab, drawer, modal, wizard and actionable control for each workspace. Click and assert the backend outcome for all safe cases; classify irreversibles as sandbox-only or blocked. Record per-workspace action denominator, console/network/Edge errors, route coverage and authoritative postconditions. Repair broken handlers/services/RLS and retest, including dual-session and denial paths.

## 05 — Customer/mobile PWA commerce regression

> Audit Gala Dock's customer top-bar PWA, event discovery/profile, maps/calendar, ticket tier/seat selection, checkout, wallet, QR check-in, transfers/resale/refunds and venue/supplier enquiries. Exercise phone portrait/landscape, installed PWA, offline/reconnect, safe area, deep links and five-item menu behaviour. Stripe must run in test mode, and check ticket/seat/ledger outcomes in backend. If no native app exists, mark native-app tests N/A rather than fabricating them.

## 06 — Organiser / Operator full functional slice

> Execute the dedicated Organiser audit: Home, Events (Overview, Plan, Sell & Promote, Operations, Money), Calendar, Sales, Marketplace, Tickets & Promotion, Team, Money, Gala Agent, Settings, Inbox and contextual tasks/files/automations. Verify event-type-adaptive wizards, budget and proposal conversion, venue/supplier handoffs, seating and tickets, team, event-day ops, cancellation and finance. Trace every action through database/RLS/outbox/webhooks, fix missing backend, complete visual overlays and cross-role E2E before marking passed.

## 07 — Venue Operator deep availability and booking slice

> Execute Venue Operator's standalone Gala Dock audit: properties, spaces, layouts/capacity, listing/media, price/package/bar-deposit rules, enquiries/quotes, holds/expiry, booking wizard, calendars/conflicts, financial settlement, team and provider Agent. Probe two simultaneous bookings for the same date/space, stale holds and late payments; enforce transactional exclusivity and accurate RLS. Compare all venue-mode designs and verify downstream organiser/customer state.

## 08 — Solo Supplier full capability slice

> Complete the Solo Supplier Gala Dock audit: business onboarding, service taxonomy/listings/packages, travel/availability, enquiries, quote versions, booking/contract/deposit, fulfilment, reviews, invoices/payouts, settings, messaging and dedicated provider Agent. Test through to organiser visibility, calendar occupancy, payment and notifications. Fix dead buttons, backend gaps, isolation and visual drift with reproducible evidence.

## 09 — Agency Supplier team/capacity slice

> Audit Agency Supplier separately from solo: agency identity, membership/permissions, shared leads, pooled proposals, member/equipment capacity, shifts, assignments, fulfilment, internal split finance and agency Agent. Test invite/revoke, overlapping assignments, member exit, role escalation and concurrency. Reuse valid shared services, not duplicate route implementations; update the design/functional/backend matrices for agency only and close with tests.

## 10 — Affiliate attribution, commissions and profitability

> Complete Gala Dock's affiliate workspace end-to-end, not as an admin subsection: onboarding, tracking links/campaigns, consent-compatible attribution, qualified conversion, refund reversal, commission tiers/accrual/pending/payable/paid, fraud, payouts, statements, support and dashboard analytics. Use test referrals and sandbox purchases to prove ledger conservation and idempotency. Report true contribution economics without inventing margin targets, fix discrepancies and run responsive/design QA.

## 11 — Admin, moderation, support and maintenance

> Audit Platform Admin by distinct permission tier: overview, users/workspaces, events/venues/suppliers, tickets/orders/finance, disputes/moderation, affiliates, AI/MCP, integrations, analytics, settings, support and maintenance. Every sensitive action needs reason/authorisation/audit. Inspect the safeguarding conversation-access policy; do not silently add blanket message-read privileges. Perform controlled maintenance banner, read/write gates and recovery tests. Correct backend and UI against the approved denser admin shell.

## 12 — Portal invitations and workspace boundary security

> Test Gala Dock's Client, Guest, Supplier Collaborator, Venue Client, Staff/Gate, Artist/Speaker, Sponsor/Exhibitor and Promoter portals where specified/implemented. Enumerate magic links/invites, expiry, revocation, scoped document access, upload/approval/tasks, notification and mobile behaviour. Exercise cross-event and cross-workspace IDOR, multiple invitations and revoked membership. Fix RLS, signed URLs, UI dead actions and portal-specific design, then retest.

## 13 — Gala Agent, MCP and automation evaluation

> Evaluate the Organiser, Venue, Solo Supplier, Agency and Admin Gala Agent capability matrices independently: tool CRUD, one-time, multistep, scheduled, watched, event-driven, long-running, batch and approval runs; credit packs, model routing, soft/hard budgets, autonomous scopes, memory isolation, resume/cancel and token-bound tool actions. Include malicious event description/quote prompt injection, cross-tenant denials and authoritative completion checks. Keep live model QA within previously authorised £0.50 provider-run budget unless superseded; use mocks for wider permutations and record actual provider testing separately.

## 14 — GitHub, integration and infrastructure health

> Audit Gala Dock's repository CI, Vercel/Supabase/Stripe/Resend/R2 configured environments, migrations/RLS/functions, webhook signatures and replay, storage sanitisation, queue/crons, rate limits, secrets by presence, logging/alerting and backup/restore readiness. Repair safely, add provider sandbox integration tests, document failures/blockers and avoid changing production secrets or deployments without authority. Update operational runbooks and evidence.

## 15 — Red/Blue/Black/White/Purple security exercise

> Run authorised Gala Dock security exercises against local/test fixtures: horizontal and vertical tenant access, event/venue/seat booking races, financial webhook forgery/replay, scoped portal invites, image/file paths, chat and AI tools, public data leaks, admin privileges and denial-of-service rate handling. Blue team verifies detection; White coordinates evidence; Purple fixes and retests. No destructive live attacks or real payment/email side effects. Block release on exploitable P0/P1.

## 16 — Cross-workspace checkout, Stripe Connect and reconciliation

> Focus on Gala Dock's payment state machine across Customer, Organiser, Venue, Supplier, Affiliate and Admin. Prove correct seat/space holds, capture, orders, refunds, payout application fees, connected accounts, affiliate accrual/reversal, ledger conservation and subscriptions. Exercise decline, timeout, 3DS, duplication, out-of-order/replayed webhooks, partial refund and chargeback. Use test mode; fix through migrations/services/UI and produce linked evidence for all roles.

## 17 — Onboarding, subscriptions, support and content

> Audit all Gala Dock signup/verification/role choice/upgrade/invitation routes, onboarding wizards for organiser/venue/solo/agency/affiliate, plan tiers, credits/add-ons, token controls, workspace switching, settings, help centre, ticket cases, tutorials and Resend transactional email. Test actual persistence and role-gating; inspect confusing/inert controls; align each design and mobile shell. Use no live marketing sends.

## 18 — Multi-party operational event rehearsal

> Using only synthetic records, execute one complete Gala Dock wedding, one ticketed concert/festival, one private venue booking and one webinar event journey. Involve public discovery, organiser planning/budgets, supplier quotes, venue inventory, customer purchase and wallet, staff scan, portal invited user, affiliate attribution, refunds/cancellations, Admin support and finance. Verify cross-role consistency, logs and deterministic browser/API assertions. Fix broken handoffs, retest and update the scenario matrix.

## 19 — Incident restore and payment/booking consistency rehearsal

> Carry out Gala Dock's isolated recovery rehearsal: safe backup restoration, schema/asset/object reconciliation, missing/out-of-order webhooks, queued notifications, stale holds, ticket entitlements, venue bookings and financial ledger. Measure actual RPO/RTO from tests, verify RLS on restored data and draft actionable incident communications/runbooks. Do not change production databases or destroy existing backups.

## 20 — Final pre-production release verification

> Pin the candidate Gala Dock commit/environment. Run all release-gating unit/integration/RLS/E2E/API/browser/visual/responsive/a11y/performance/agent/security/restore suites, including every critical workspace and GD-16 multi-party scenario. Confirm immutable migration/rollback plan, service monitoring and secrets posture. Produce `RELEASE_CANDIDATE_VERDICT.md` with PASS/FAIL/BLOCKED per gate and READY/CONDITIONALLY READY/NOT READY. Any unresolved payment, oversell, double booking, tenant leak, broken core workflow or P0/P1 blocks READY. Do not claim test coverage beyond evidence.
