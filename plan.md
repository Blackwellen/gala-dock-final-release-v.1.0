# Gala Dock — Consolidated Product, Modularisation & Delivery Plan

**Status:** Canonical planning document — updated 23 July 2026
**Replaces:** the former root `plan.md` build checklist.

> **Shell routing decision (current):** The structural workspace shells use only `/organizer/*`, `/venue/*`, and `/supplier/*` as their canonical namespaces. Agency, corporate, solo, team, and performer experiences are subtype-specific workspaces within these three routes. No legacy redirect layer is retained for the new shell architecture.
**Companions:** `docs/MASTER-PLAN.md`, `docs/specs/README.md`, `docs/plans/FEATURE_BUILD_PLAN.md`, and `docs/audits/*` remain evidence and detailed implementation references. Where prior documents disagree, this document uses the live route tree and `src/lib/nav/app-nav.ts` as the current-state source of truth.

## 1. Product decision and planning rules

Gala Dock is an **Event Delivery OS**. It starts with a production-grade organizer workspace, then adds buyer/ticketing capabilities, and finally completes the multi-sided venue and supplier marketplace. New functionality must extend the shared event model, not create disconnected “event type” applications.

| Rule | Decision |
|---|---|
| URL namespace | Workspace routes use `/event-manager/*`; legacy URLs redirect. Public, portal, auth, and `/admin/*` retain their own namespaces. |
| Personas | Organizer, Venue Operator, Supplier, Consumer/Buyer, Affiliate, Platform Admin. |
| Navigation | 8–12 visible side-nav items per workspace persona. A business area has one home. View modes are switchers, never tabs. |
| Tabs | First tab is always **Overview**. Tabs represent genuine sub-domains; nested tabs appear only on detail/profile pages. |
| Modules | Shared core + optional vertical packs. A pack is a set of schema extensions, policies, UI tabs, workflows, tests, and gates—not a fork of Events. |
| Entitlements | Every module is independently controlled by release stage, workspace type, plan/add-on, role, and feature flag. Server/API enforcement is mandatory. |
| Delivery quality | No module is “done” until its migration, RLS, API/action validation, responsive UI, end-to-end journey, release evidence, and 100/100 release audit are complete. |
| Commercial boundary | Gala Dock owns event delivery and event-specific campaigns. Caption Fox owns wider campaign ideation/creation; integrations exchange approved campaign assets and outcomes only. |

### Versions and gates

| Release | Scope | Typical gate |
|---|---|---|
| V1 | Organizer Event Delivery OS: events, delivery, sales, finance, portals, calendar, PWA, core reporting | Starter/Growth; AI and automations Scale |
| V1.5 | Consumer accounts, public event pages, ticketing, seating, ticket scanning | Ticket selling Scale; buyer account free |
| V2 | Venue/supplier workspaces, marketplace, payouts, trust, public directory | Workspace type + marketplace flags; transaction terms |
| Enterprise packs | Corporate programmes, advanced controls, SSO, GL, white-label, country packs | Agency/Pro or Enterprise + named flags |

## 2. Honest baseline and full progress tracker

`BUILD_COMPLETION_STATUS.md` records that the original 15-level build, live data wiring, and 29 additive tables were delivered. This is a **build baseline**, not blanket release certification: the audits and release contract still require current browser, security, RLS, integration, performance, and evidence verification. “Verify” below means no release claim may be made until evidence exists.

| ID | Workstream | Current baseline | Required next outcome | Gate / target | Status |
|---|---|---|---|---|---|
| F1 | Workspace types, stages, flags | Persona nav and flag resolver present | Audit all server-route/API gates and direct URL denial | V1 foundation | Verify |
| F2 | Entitlements and limits | Plan concepts and flags present | One typed entitlement service; consistent 402/paywall paths and tests | V1 | Verify |
| F3 | Persona shells and navigation | Organizer, venue and supplier nav source exists | Implement target IA below; reconcile Library/Sales/RFQ paths | V1 | In progress |
| F4 | Release/security harness | Existing RLS baseline reported | CI suites: isolation, IDOR, roles, flags, plan, portal, webhooks | V1 | Not evidenced |
| C1 | Events core and event command centre | Live event routes and extensive detail routes exist | Normalize event tabs, templates and state transitions | V1 | Verify |
| C2 | Sales: leads, proposals, forms | Routes and delivered tables reported | Consolidate under Sales; prove lead-to-event-to-proposal journey | Growth | Verify |
| C3 | Suppliers and sourcing | Directory, RFQs, rate cards, scoring reported | Consolidate sourcing tabs; supplier portal and compliance proof | Growth | Verify |
| C4 | Venues and booking operations | CRM and venue-management routes exist | Separate planner CRM from venue-operator operations | V1.5/V2 | Verify |
| C5 | Tasks, staffing, calendar | Routes and staffing tables reported | Cross-event availability/conflict and offline event-day verification | Growth/Scale | Verify |
| C6 | Finance | Quotes, invoices, payments, schedules, expenses reported | Payments, tax, payout and reconciliation controls; Stripe only when configured | Growth+ | Verify |
| C7 | Library and documents | Secure storage flows reported | Make Assets a Settings sub-tab for organizer; verify signed paths/audit | All | Verify |
| C8 | Portals | Client and venue token routes exist | Mint/invite workflows, supplier portal, scoped uploads and audit | Growth | In progress |
| C9 | AI and automations | Catalogues/UI exist; real scope varies | Approval-first execution, metering, audit, injection/loop/idempotency tests | Scale | Verify |
| C10 | Notifications and integrations | In-app/log-only baseline; optional providers | Provider configuration, preference enforcement, retry/observability | Add-on | Planned |
| C11 | Buyer/ticketing | Public event, checkout and buyer account routes exist | Inventory, payment, order/refund/transfer, QR and fraud verification | V1.5/Scale | Verify |
| C12 | Venue/supplier marketplace | Listing and marketplace routes exist | Search/listing/booking/payout/review trust lifecycle | V2 | Planned |
| E1 | Hybrid and virtual delivery pack | No dedicated complete pack evidenced | Virtual rooms, agenda, production controls, recordings and accessibility | Scale + `hybridEvents` | Planned |
| E2 | Corporate programmes pack | No dedicated complete pack evidenced | Portfolios, approvals, cost centres, confidential/VIP workflows | Enterprise + `corporateProgrammes` | Planned |
| E3 | Hospitality, gala and fundraising pack | Core finance/guests/floor plan exist | Seating, F&B, auction, donations, Gift Aid and stewardship | Growth/Scale + flags | Planned |
| E4 | Weddings and private celebrations pack | Generic event foundation exists | Household, couple portal, related-event and day-of workflows | Growth + `celebrations` | Planned |
| E5 | Conference/exhibition pack | Core event foundation exists | Sessions, speakers, exhibitors, sponsor and lead-capture operations | Scale + `conferenceOps` | Planned |
| E6 | Festival/live entertainment pack | Core scheduling/suppliers exist | Artist production, crowd/safety, settlements and concessions | Scale + `liveEntertainment` | Planned |
| E7 | Sports/participation pack | No dedicated pack evidenced | Registration, fixtures/results, route/checkpoints and waivers | Scale + `sportsEvents` | Planned |
| E8 | Travel/destination pack | No dedicated pack evidenced | Room blocks, manifests, transport and international timezones | Enterprise + `travelOps` | Planned |
| E9 | Catering/hospitality operations pack | Venue F&B foundations reported | Covers, kitchen/service plans, bar stock and food safety | Growth/Scale + `cateringOps` | Planned |
| E10 | Attendee experience/accessibility pack | Guests/check-in foundations reported | Accessibility profile, pass, preferences, wayfinding, help desk | All/Scale by feature | Planned |
| E11 | Risk, safety and event control pack | Some document/supplier foundations reported | Risk, incident, permit, control-room and compliance workflows | Scale + `eventControl` | Planned |
| E12 | Marketing and audience growth pack | Public pages and ticket routes exist | Campaign execution, referral/waitlist/ambassador and Caption Fox handoff | Scale + `eventMarketing` | Planned |
| Q1 | QA, accessibility, performance | Build/type checks reported historically | Route-by-route 100/100 release evidence at desktop/tablet/mobile/PWA | Every released surface | Not evidenced |

## 3. Modular architecture plan

### 3.1 Shared core (never duplicate)

All vertical packs extend these canonical aggregates: `workspace`, `event`, `event_template`, `venue`, `supplier`, `contact/guest`, `booking`, `task`, `schedule_item`, `document`, `money_document`, `ticket/order`, `activity/audit`, and `portal_link`.

| Layer | Responsibility | Examples |
|---|---|---|
| Core domain | IDs, workspace scope, lifecycle/status, shared audit/activity | Event, guest, supplier, venue, task, documents |
| Capability modules | Reusable cross-event functions | Scheduling, seating, ticketing, finance, CRM, documents, communications, analytics |
| Vertical packs | Event-type-specific fields, workflows, templates, rules, dashboards | Wedding, conference, festival, sports, hybrid, gala |
| Experience surfaces | Persona-appropriate navigation and portals | Organizer, venue, supplier, buyer, client portal, admin |
| Platform services | Entitlements, RLS, storage, notifications, automation, integration, observability | No vertical pack may bypass these services |

### 3.2 Pack contract

Every new pack must supply the following before it can be enabled.

| Contract item | Required implementation |
|---|---|
| Registry | `packKey`, supported event types, min release stage, workspace types, plan/add-on, dependencies, feature flags, upgrade copy |
| Data | Additive migration; `workspace_id` and `event_id` where applicable; FK/index/unique rules; no generic unbounded JSON for core reporting fields |
| Security | RLS CRUD policies plus negative tests for wrong workspace, role, event parent, plan, flag, portal token and direct API call |
| UI | Event-detail tab(s) and optional section tab; shared primitives; empty/loading/error/no-access/upgrade states |
| Workflow | Explicit status state machine, idempotent commands, audit/activity events, notifications and automation hooks |
| Portals | Only expose a minimum DTO; token expiry/revocation, scoped upload/download and consent where relevant |
| Operations | Import/export schema, retention/PII notes, rate limit, structured errors, metric/alert instrumentation |
| Release | Unit, integration, RLS, E2E, visual, responsive and performance evidence in `release-gated/docs/<pack>.md` |

### 3.3 Build order

1. Stabilise F1–F4 and the target information architecture.
2. Finish the shared capability prerequisites: ticketing, seating, guests/accessibility, schedule/rooms, finance, documents, notifications and risk controls.
3. Deliver vertical packs in this order: Corporate + Hybrid, Gala/Hospitality + Weddings, Conference/Exhibition, Catering/Travel, Festival, Sports, Fundraising, Marketing/Portfolio.
4. Promote packs only after their feature flag and full release audit pass; do not surface a partial pack in navigation.

## 4. Event catalogue and vertical packs

### 4.1 Canonical event type catalogue

| Family | Event types |
|---|---|
| Digital | Virtual event, hybrid event, webinar |
| Corporate | Conference, convention, corporate offsite, board meeting, AGM, training/educational event, product launch, sales kickoff, recruitment/graduate event, shareholder event, networking event, roadshow, multi-city corporate tour |
| Hospitality and celebration | Awards ceremony, gala dinner, charity ball, fundraiser, banquet, wedding, private celebration, birthday, engagement, anniversary, baby shower, gender reveal, christening, graduation party, funeral/wake, family reunion |
| Culture and entertainment | Festival, concert, nightclub event, theatre/live performance, fashion show, food and drink event, market/fair, pop-up activation, brand activation |
| Exhibition and commerce | Exhibition, trade show |
| Participation | Sports event, esports tournament, race/marathon, charity walk, golf day, fitness competition, school/community sports event |
| Community | Community event, religious or cultural event, retreat |

Event type selects a **template and suggested packs**; it never removes access to the shared event command centre.

### 4.2 Required modular upgrades

| Pack | Core capabilities | Primary UI home | Key integrations / controls |
|---|---|---|---|
| Hybrid & virtual | Virtual/physical/hybrid mode; streaming provider; concurrent rooms; green rooms; device checks; prerecorded/live/simulive/on-demand; screen share; chat/polls/Q&A/reactions; booths/networking; captions/transcripts/translations; timezone agenda; replay/recording consent; technical rehearsal/support suppliers | Event: `Virtual delivery` tab; public attendee session experience | Streaming adapters, signed media, consent, moderator roles, engagement telemetry |
| Corporate programmes | Company templates; programme/series; departments/cost centres; PO and approvals; delegate groups; confidential events; executive/VIP; travel; sponsorship; objectives/ROI; lead capture; CPD certificates; supplier/venue frameworks | Sales/Events programme views; Event: `Corporate` tab | Approval chain, budget policy, confidential role/RLS fields, SSO later |
| Gala, banquet & hospitality | Table plans, household/party seating, dietary/meal/drink selections, service timing, kitchen/FOH, sponsorship tables, auction/pledge/raffle, awards/judging/trophies, entertainment cues, valet/cloakroom | Event: `Guests & seating`, `Hospitality`, `Fundraising` tabs | Seating engine, payment/donation provider, tax/Gift Aid validation, accessibility |
| Weddings & private celebrations | Couple portal; wedding party; ceremony/reception; households/plus-ones; registry; mood boards; tasting; attire; shot list; music; accommodation/transport; rehearsal; day-of; linked occasions | Event: `Celebration` tab; Couple portal | Privacy-by-default portal, household RSVP, linked-event graph |
| Conference & exhibition | Abstracts/submissions/review; speakers/travel/expenses; multi-track agenda/rooms; exhibitor stands/maps; sponsor packages/deliverables; badges/accreditation; hosted buyers; appointments/matchmaking; lead scans; attendance/CE credits | Event: `Programme`, `Speakers`, `Exhibitors & sponsors`, `Networking` tabs | Badge/scan APIs, calendar, streaming, lead consent |
| Festival & live entertainment | Artist offers/contracts/riders; stage plots/input/backline; sound checks/rehearsals; artist logistics; zones/capacity/noise/curfew/weather; entrances/wristbands; cashless/F&B/merch; settlements/royalties | Event: `Production`, `Artists`, `Site & crowd`, `Settlements` tabs | Weather, payment/settlement, security/control-room, rights accounting |
| Sports & participation | Registrations; teams/divisions; fixtures/heats/results; timing; waivers/medical; officials/equipment; spectators; awards/rankings; routes/checkpoints/water/medical | Event: `Competition`, `Participants`, `Route & safety`, `Results` tabs | Timing adapter, waiver consent, medical restricted data, public results policy |
| Fundraising | Target/thermometer; donations; peer-to-peer pages; sponsors; auctions/pledges; donor recognition; Gift Aid; charity partners; volunteers; impact reports | Event: `Fundraising` tab; donor public view | Payment provider, Gift Aid evidence, charity permissions, finance reconciliation |
| Travel & destination | Room blocks; accommodation allocations; flights/trains; transfers/shuttles; visa documents; destination guide; manifests; arrival/departure; excursions; emergency contacts; currencies/timezones | Event: `Travel & accommodation` tab | Travel data minimisation, restricted PII, timezone/currency services |
| Catering & bar | Caterer/tasting/menu; dietaries; covers/portions; kitchen timeline; service plan; bar inventory/package; cashless/cash bar; minimum spend/corkage; concessions/food trucks; waste/equipment/permissions | Event: `Hospitality` tab; Venue: `F&B` tab | Food safety document checks, stock/audit, POS/cashless optional adapter |
| Attendee experience & accessibility | Accessibility profile; mobility/sensory/interpreter/caption; quiet/prayer/childcare; companion tickets; accessible transport/seating; language; agenda/pass; indoor navigation; lost property/help desk/live support | Event: `Attendee experience` tab; attendee portal | Sensitive-data consent, least privilege, accessibility QA, offline pass |
| Risk, safety & control | Risk assessments/method statements; incidents/emergency/evacuation; first aid/medical/security; safeguarding; capacity/weather; insurance/permits/fire/food/alcohol/noise; control-room comms | Event: `Risk & control` tab; Event-day control mode | Restricted roles, immutable incident/audit log, escalation/notification, offline contingency |
| Programmes, portfolio & growth | Series/annual programme/tours/franchise/venue groups; master templates/shared suppliers/budgets; portfolio reporting/calendar/benchmarks; clone/localise; event websites/registration; discount/referral/ambassador/waitlist/reminder/abandonment/press/highlights | Events: `Programmes` tab; Sales/Marketing surfaces | Caption Fox handoff, analytics/consent, public SEO, campaign approvals |

## 5. Target workspace side menus

Routes shown below are the target canonical paths. Items marked `flag` are omitted everywhere—navigation, direct route, search, APIs, automations, notifications, reporting—when disabled.

### 5.0 Current navigation audit and the required management model

The live workspace sidebar is correctly centralized in `src/lib/nav/app-nav.ts` and rendered by `AppSidebar`; it filters items by `workspace_type`, flag map, and supplier agency status. That is the right foundation. However, the current organization needs tidy-up before more modules are added:

| Current surface | What is currently shown | Issue | Required plan change |
|---|---|---|---|
| Organizer sidebar | Unnamed Home/Calendar group; **Delivery** contains Sales, Events, Suppliers, Venues, Marketplace and Tasks; Revenue contains Finance; Workspace contains Inbox, Automations, Team, Library and Settings | Sales is not delivery; Marketplace is a buyer activity but its supplier flag is named as though it were a seller function; Library duplicates Assets inside Settings; labels do not explain the user journey | Use group order **Overview → Sales → Delivery → Revenue → Workspace**; place marketplace under a clearly named Sourcing/Marketplace capability only for organizer buyers; move Library into Settings > Assets |
| Venue sidebar | Home, My Venues, Bookings, Availability; **Listings** contains Marketplace, My Listings, Suppliers; Workspace items | “Marketplace” and “My Listings” are two overlapping seller concepts; venue operational data must not be mixed with planner CRM | Rename seller area **Marketplace Console**; make the top page a console Overview and put Listings/Enquiries/Reviews/Payouts in its tabs; keep supplier directory as a sourcing relationship only |
| Supplier sidebar | Home, Jobs, RFQs, Quotes, Availability; **Listings** contains Marketplace and My Listings; Workspace items | Same duplicate seller label; RFQs and quotes should retain their distinct operational meaning but need clear task flow | One **Marketplace Console** item with tabs; retain Jobs, RFQs and Quotes as core delivery/revenue pipeline items |
| Admin sidebar | Flat 14-item array in `AdminSidebar` | No category headers; customer, financial, ops and security tools blend together; dangerous controls do not express privilege tier | Group into Overview, Customers, Revenue & Growth, Operations, Governance & Security; implement server-side admin permissions—not visual grouping alone |
| Settings nested menu | Central `SettingsShell` already groups Account, Workspace and Billing | This is the preferred nested-navigation pattern, but long Workspace menu needs category subgroups and mobile selector rather than horizontal overflow | Retain exactly three scopes; introduce subgroups below and gate Workspace/Billing server-side |
| Event detail tabs | `events/[eventId]/layout.tsx` currently registers 21 equal-weight tabs | Twenty-one tabs are too dense; module tabs will make it worse. Some are operationally related and should be grouped in overflow/secondary navigation, not deleted | Use the three-level event model in §5.6: Core tabs, Delivery tabs, and controlled More menu; vertical packs add only to their named group |

#### Navigation ownership and implementation rules

| Concern | Required implementation |
|---|---|
| One registry | Extend `app-nav.ts` into a typed navigation registry that carries `id`, persona, group, route, flag, entitlement, required permission, order, active-route aliases, mobile label and analytics key. Do not define competing sidebar arrays in page components. |
| One tab registry per domain | Place tab metadata next to the domain layout—e.g. Event, Settings, Supplier, Venue, Finance—not scattered across child pages. A tab holds route, visibility predicate, badge query key, mobile label and test ID. |
| Server enforcement | Layout resolves persona/flags/entitlements once, but every page/action/RPC independently enforces them. Hiding a menu item is never authorization. |
| Active state | Every detail route maps to its parent menu plus exact primary/secondary tab. Add route aliases for legacy URLs so the wrong top-level item cannot become active. |
| Badges | A badge is live, permission-aware and query-scoped. Only show actionable counts: unread, pending approval, expiring document, failed automation—not vanity totals. |
| Mobile | Desktop sidebar → drawer/icon rail; primary section tabs → horizontally scrollable segmented control only where short; dense/event/settings tabs → labelled select/sheet. Never leave 20 tabs in a horizontal row. |
| Feature flags | A disabled item disappears from sidebar, breadcrumbs, command palette, quick-create, search result, dashboard card, notification CTA and direct path. The same registry feeds all of these surfaces. |
| Naming | Buyer-facing marketplace is **Marketplace**. Seller-facing surfaces are **Marketplace Console** or **My Listings**, never both as peer menu items. Use **Sales** for leads/proposals/forms, not Pipeline and Sales interchangeably. |

### 5.0.1 Target organizer sidebar — exact hierarchy

| Order | Group | Menu item | Canonical entry route | Why it belongs here | Visibility |
|---:|---|---|---|---|---|
| 1 | Overview | Home | `/event-manager/home` | Cross-workspace operational snapshot | All organizer members |
| 2 | Overview | Calendar | `/event-manager/calendar` | Cross-domain date view, not an Event view | `calendarHub` + permitted role |
| 3 | Sales | Sales | `/event-manager/leads` | A single client-acquisition lifecycle: lead → proposal → form → event | Sales permission |
| 4 | Delivery | Events | `/event-manager/events` | The command centre and event portfolio | Event permission |
| 5 | Delivery | Suppliers | `/event-manager/suppliers` | Source, assess, invite and manage supplier relationships/RFQs | Supplier permission |
| 6 | Delivery | Venues | `/event-manager/venues` | Planner-side venue CRM, not venue-operator operations | Venue permission |
| 7 | Delivery | Marketplace | `/event-manager/marketplace` | Buy/search venues and services where V2 marketplace is enabled | `marketplaceBuyer` (new, organizer-only) |
| 8 | Delivery | Tasks | `/event-manager/tasks` | Cross-event work execution | Task permission |
| 9 | Revenue | Finance | `/event-manager/finance` | Quotes, invoices, costs, payments, profitability | Finance permission |
| 10 | Workspace | Inbox | `/event-manager/inbox` | Shared communication record | Inbox permission |
| 11 | Workspace | Automations | `/event-manager/automations` | Controlled workspace automation | `automationsBuilder` + Scale |
| 12 | Workspace | Team | `/event-manager/team` | People/staffing across events | Team permission |
| 13 | Workspace | Settings | `/event-manager/settings` | Account, workspace governance, assets and billing | All members see Account; scoped items per role |

**Organizer count:** 10 always-on (subject to permission) plus Calendar, Marketplace and Automations when their gates pass. This preserves the 8–12 target in normal use; Marketplace can be tucked under Suppliers as **Source Marketplace** if all three flags are enabled and the workspace reaches 13 visible items.

### 5.0.2 Target venue and supplier sidebar — exact hierarchy

| Persona | Group | Menu item | Canonical entry route | Main purpose | Visibility |
|---|---|---|---|---|---|
| Venue | Overview | Home | `/event-manager/home` | Occupancy, booking and revenue snapshot | Venue members |
| Venue | Operations | My Venues | `/event-manager/venue-management` | Venue profile, spaces, rules and operating configuration | Venue management permission |
| Venue | Operations | Bookings | `/event-manager/venue-management/bookings` | Enquiries through delivery/close-out | Booking permission |
| Venue | Operations | Availability | `/event-manager/calendar` | Space/blockout schedule | `calendarHub` |
| Venue | Marketplace Console | Marketplace Console | `/event-manager/marketplace/listings` | Seller listings, enquiries, reviews and payouts | `marketplaceVenue` |
| Venue | Relationships | Suppliers | `/event-manager/suppliers` | Preferred suppliers and compliance—not marketplace browsing | Supplier permission |
| Venue | Revenue | Finance | `/event-manager/finance` | Venue receivables, deposits, payouts and performance | Finance permission |
| Venue | Workspace | Team | `/event-manager/team` | Venue staff and rota | Team permission |
| Venue | Workspace | Inbox | `/event-manager/inbox` | Booking/client/supplier messages | Inbox permission |
| Venue | Workspace | Settings | `/event-manager/settings` | Account, venue workspace, billing/security | Scoped role |
| Supplier | Overview | Home | `/event-manager/home` | Job, quote and earnings snapshot | Supplier members |
| Supplier | Delivery | Jobs | `/event-manager/jobs` | Awarded work and fulfilment | Job permission |
| Supplier | Delivery | RFQs | `/event-manager/rfqs` | Opportunities and responses | RFQ permission |
| Supplier | Revenue | Quotes | `/event-manager/quotes` | Quote pipeline and acceptance | Quote permission |
| Supplier | Operations | Availability | `/event-manager/calendar` | Working/blocked dates | `calendarHub` |
| Supplier | Marketplace Console | Marketplace Console | `/event-manager/marketplace/listings` | Listings, enquiries, reviews and payouts | `marketplaceSupplier` |
| Supplier | Revenue | Earnings | `/event-manager/finance` | Receivables, payouts, expenses | Finance permission |
| Supplier | Workspace | Team | `/event-manager/team` | Agency roster only | Agency + team permission |
| Supplier | Workspace | Inbox | `/event-manager/inbox` | Client/organizer communication | Inbox permission |
| Supplier | Workspace | Settings | `/event-manager/settings` | Account, business profile, docs, payouts, security | Scoped role |

### 5.0.2a Complete persona and workspace navigation coverage

This is the definitive coverage list. **Only the first three entries are `workspace_type` values in the live flag registry** (`organizer | venue | supplier`). The remaining surfaces use a separate identity or control-plane namespace; they are listed here so the overall product navigation has no missing persona.

| Persona / surface | Data model / namespace | Navigation type | Complete side or top navigation plan | Current route reality | Required navigation work |
|---|---|---|---|---|---|
| Event Organizer | `workspace_type=organizer`; `/event-manager/*` | Workspace sidebar | Home; Calendar; Sales; Events; Suppliers; Venues; Marketplace; Tasks; Finance; Inbox; Automations; Team; Settings | Sidebar exists but Sales is under Delivery, Library is separate and Marketplace uses current V2 flags | Adopt §5.0.1, source it from registry, migrate aliases and tests |
| Venue Operator | `workspace_type=venue`; `/event-manager/*` | Workspace sidebar | Home; My Venues; Bookings; Availability; Marketplace Console; Suppliers; Finance; Team; Inbox; Settings | Sidebar exists but displays Marketplace and My Listings as separate peers | Merge to one Marketplace Console and apply venue-only operational boundaries |
| Supplier / Vendor | `workspace_type=supplier`; `/event-manager/*` | Workspace sidebar | Home; Jobs; RFQs; Quotes; Availability; Marketplace Console; Earnings; Team (agency only); Inbox; Settings | Sidebar exists but displays Marketplace and My Listings as separate peers | Merge seller console; retain Jobs/RFQs/Quotes as distinct work pipeline |
| Consumer / Buyer | Buyer account, not a workspace; `/account/*` and public routes | Account top nav / compact mobile nav | Discover; My Tickets; Orders; Saved & Following; Account | Routes include `/discover`, `/account`, `/account/events`, `/account/tickets` | Add Saved/Following route and buyer nav shell; never load workspace sidebar |
| Affiliate | Affiliate account, not a workspace; `/affiliate/*` | Affiliate portal sidebar or compact top nav | Dashboard; Links; Campaigns & Assets; Clicks & Conversions; Payouts; Tax & Profile; Support | `/affiliate/dashboard`, apply and login routes exist; full sub-navigation is not yet evidenced | Build a distinct affiliate shell; do not place affiliate functions in organizer Settings except programme configuration |
| Platform Admin | Platform-admin identity; `/admin/*` | Admin control-plane sidebar | Admin Overview; Users; Workspaces; Subscriptions; Affiliates; Support; Audit Logs; Feature Flags; System Health; Email Logs; AI Usage; Automation Runs; Storage Usage; Security; Trust & Safety (V2 flag) | Current flat 14-item sidebar exists; Trust & Safety is planned | Group and permission-harden per §8; never reuse organizer app sidebar |
| Client portal user | Token-scoped portal identity; `/portal/[token]` | Portal local navigation | Event Home; Timeline; Approvals; Documents; Invoices/Payments; Messages; Guests/RSVP where shared | Token portal route exists | Navigation is generated from portal permissions; no global/sidebar access |
| Venue client portal user | Token-scoped booking identity; `/venue-portal/[token]` | Portal local navigation | Booking Home; BEO; Schedule; F&B Choices; Documents; Invoices; Messages | Token portal route exists | Generate only shared booking tabs; enforce booking scope |
| Supplier portal user | Token-scoped supplier identity; target `/supplier-portal/[token]` | Portal local navigation | Job/RFQ; Quote; Schedule; Evidence; Documents/Insurance; Messages; Payment status | Planned | Build as a dedicated portal—not the supplier workspace shell |

### 5.0.3 Main-page tab registry — organizer

The following is the required **first-level tab structure**. A register may have an Overview tab and a single set of data views; view modes remain controls within the tab.

| Main menu item | Primary tabs, in order | View switchers (not tabs) | Required rules |
|---|---|---|---|
| Home | Overview | — | Widgets are role/flag-aware and link to the owning section. |
| Calendar | Overview | Agenda, Day, Week, Month | Filters persist per user/workspace; sources never become tabs. |
| Sales | Overview, Leads, Proposals, Forms, Analytics | Table, Board, Pipeline | Each tab has its own permission, saved filters and count badge; a lead/proposal detail does not appear in global sidebar. |
| Events | Overview, Programmes `flag`, Templates | Table, Card, Calendar, Board | Default is Overview; type, status, owner, date, venue and pack filters; template/programme permissions separate. |
| Suppliers | Overview, Directory, RFQs, Scorecards, Documents, Contracts, Availability | Table, Card, Map | RFQs are never a second organizer side-menu item; supplier detail handles record-specific tabs. |
| Venues | Overview, Directory, Holds, Documents | Table, Card, Map | Planner relationship data only; venue operations belongs to venue persona. |
| Marketplace | Overview, Venues, Services, Requests, Saved | List, Card, Map | Buyer-only; do not show seller listings/payouts on this surface. |
| Tasks | Overview, Templates | List, Board, Calendar, Gantt | “My work” is a saved filter, not a top-level tab. |
| Finance | Overview, Quotes, Invoices, Payments, Supplier Payments, Deposits, Expenses, Profit, Cashflow, Ticket Sales `flag` | Table, Period/Chart | Finance sub-tabs are separately permission gated; all monetary actions use finance role checks. |
| Inbox | Overview, Unread, Assigned, All | Split list/detail | Unread/assigned are saved operational filters, rendered as tabs only if counts justify it. |
| Automations | Overview, My Automations, Recipes, Runs, Approvals, Errors, Integrations, Usage, AI Builder `flag` | List, Builder canvas | Builder and AI Builder require distinct rollout/approval gates. |
| Team | Overview, Members, Workload, Availability, Staffing Requests, Find | Table, Calendar | Rota/scheduling appears in member and event detail, not a duplicate global feature. |
| Settings | Account, Workspace, Billing scopes—see §5.0.5 | — | Use the scope navigation rather than adding dozens of top-level sidebar items. |

### 5.0.4 Main-page tab registry — venue and supplier

| Persona / main page | Primary tabs, in order | View switchers | Required boundary |
|---|---|---|---|
| Venue — My Venues | Overview, Spaces, Availability, Bookings, F&B, Documents, Pricing, Reviews, Staff, Settings | Calendar/List for availability/bookings | Venue configuration stays in this one section; no duplicate “Venue Ops” item. |
| Venue — Bookings | Overview, Enquiries, Holds, Tentative, Confirmed, Delivered, Closed | Calendar, List, Board | Status filters can render as tabs only where each state has operational value; they remain one booking register. |
| Venue — Marketplace Console | Overview, Listings, Enquiries, Reviews, Payouts, Verification | Table, Card | No buyer search tab; no duplicate Marketplace item. |
| Venue — Suppliers | Overview, Preferred, Documents, RFQs | Table, Card | Relationship/compliance only; global supplier marketplace is not shown. |
| Supplier — Jobs | Overview, Assigned, In Progress, Evidence, Completed | List, Board, Calendar | Status workflow and evidence are action-driven and supplier scoped. |
| Supplier — RFQs | Overview, Invited, Draft Responses, Submitted, Awarded, Closed | Table, Board | RFQ detail holds comparison/message files, not the sidebar. |
| Supplier — Quotes | Overview, Draft, Sent, Accepted, Declined, Expired | Table, Card | A response may generate a quote without creating duplicate quote records. |
| Supplier — Marketplace Console | Overview, Listings, Enquiries, Reviews, Payouts, Verification | Table, Card | Seller-only; listing verification is platform-admin controlled. |
| Supplier — Earnings | Overview, Receivables, Payouts, Expenses, Tax Export | Table, Period/Chart | Separate own earnings from organizer finance and platform payouts. |

### 5.0.5 Settings navigation — exactly three scopes, properly categorized

The existing three-scope `SettingsShell` is retained. The plan must not turn Settings into a fourth sidebar. Every link below needs a role/entitlement predicate and a mobile select/sheet.

| Scope | Category | Tabs/pages | Access |
|---|---|---|---|
| Account | Identity & profile | Account, Preferences | Every authenticated member; own record only |
| Account | Security | Security, Sessions/MFA | Every authenticated member; own record only |
| Account | Communication | Notifications | Every authenticated member; own preferences only |
| Workspace | Organisation | General, Branding, Team, Roles | Owner/Admin/Manager according to capability |
| Workspace | Delivery defaults | Event Defaults, Supplier Defaults, Finance Defaults | Workspace manager; finance defaults require finance permission |
| Workspace | Operations | Payouts, Smart Rules, AI, Affiliate | Role + plan/add-on/flag; payouts restricted to finance/owner |
| Workspace | Data & governance | Assets (Files, Templates, Brand Assets, Supplier Docs, Event Packs), Data Export, Audit Log | Asset-specific permission; exports/audit restricted and logged |
| Billing | Commercial | Plan & Billing, Usage | Owner/authorised billing manager |

### 5.0.6 Detail/profile page tab registry

Detail pages use a page-local secondary navigation. They never add a sidebar entry. A top-level record page must have one Overview and no more than seven directly visible desktop tabs; lesser-used controls go in a labelled **More** menu and become a mobile selector.

| Record | Detail-page tabs, in order | More menu / nested views | Required access rules |
|---|---|---|---|
| Lead | Overview, Details, Activity, Notes, Communications, Proposals, Conversion | Files, history, archive | Lead-assignment visibility; only authorized users can convert or export |
| Proposal | Overview, Scope, Pricing, Approvals, Signature, Activity | Files, version history, conversion | Financial/approval actions role-gated; public signature remains token-scoped |
| Form | Overview, Builder, Submissions, Settings | Versions, share/embed, activity | Builder/editor rights distinct from submission/export access |
| Supplier | Overview, Services & Rate Cards, RFQs & Quotes, Jobs/Events, Documents & Insurance, Availability, Scorecard | Contacts, contracts, activity, archive | Sensitive documents and payout terms require supplier/finance permissions |
| Venue (planner CRM) | Overview, Spaces & Gallery, Events, Holds, Commercials, Documents, Notes | Maps/access, activity, archive | Planner-side record only; no venue-operator booking administration leakage |
| Venue (operator) | Overview, Spaces, Availability, Bookings, F&B, Staff, Documents | Pricing, reviews, finance, settings | Venue-member and assigned-venue restriction; booking financial fields are role limited |
| Booking | Overview, Client/Event, Spaces & Holds, BEO, F&B, Schedule, Documents, Finance | Activity, messages, cancellation | Availability transition must be transactional; client portal sees only explicitly shared sections |
| RFQ | Overview, Requirements, Recipients/Responses, Comparison, Messages, Activity | Attachments, award history | Organizer sees all responses; supplier sees only its own invitation/response |
| Supplier Job | Overview, Brief, Schedule, Deliverables, Evidence, Payment | Messages, activity, issue log | Supplier token/member sees only own job and approved payment metadata |
| Quote | Overview, Line Items, Attachments, Acceptance, Activity | Version history, linked RFQ/invoice | Issued snapshots immutable; conversion is idempotent |
| Invoice | Overview, Line Items, Payment Schedule, Payments, Activity | Files, delivery/reminders, credit/refund | Finance role for issue/void/refund; clients see only shared invoice portal DTO |
| Ticket order | Overview, Purchaser, Tickets, Payment, Transfer/Refund, Activity | Fraud/support notes (admin only) | Buyer owns own order only; scan/refund operations separately permissioned |
| Task | Overview, Checklist, Dependencies, Files, Activity | Time entries, automation history, archive | Assignment and parent-event scope enforced |
| Team member | Overview, Schedule, Roles & Skills, Availability | Workload, assignments, activity | Self vs manager visibility; sensitive employment data restricted |
| Marketplace listing | Overview, Offer/Pricing, Media, Availability, Enquiries, Reviews | Verification, payouts, activity | Seller access is listing/workspace scoped; platform approval distinct |

### 5.0.7 Navigation migration checklist

| Order | Change | Current source / affected surfaces | Done criteria |
|---:|---|---|---|
| 1 | Make groups first-class in the app nav registry | `src/lib/nav/app-nav.ts`, AppSidebar, command palette, breadcrumbs | Organizer has Overview/Sales/Delivery/Revenue/Workspace in the same order across all entry points |
| 2 | Add a separate organizer-buyer marketplace flag | Existing organizer item uses `marketplaceSupplier` | `marketplaceBuyer` is resolved server-side; buyer marketplace cannot appear for venue/supplier seller persona by mistake |
| 3 | Merge seller Marketplace + My Listings | Venue/supplier sidebar currently holds both entries | One `Marketplace Console` entry points to listings console; tabs own listings/enquiries/reviews/payouts |
| 4 | Move Library into Settings > Assets | AppSidebar plus Library routes, breadcrumbs, quick create, saved links | `/library/*` redirects/preserves history or is mounted within Settings; no duplicate primary navigation concept |
| 5 | Make Sales a real section shell | Leads, proposals, forms currently sibling routes | Sales shell supplies tabs, counts, breadcrumbs and direct-link compatibility; old routes redirect/retain active Sales state |
| 6 | Make Suppliers the sourcing shell | Suppliers and RFQs routes | RFQs accessible as Suppliers tab and legacy `/rfqs/*` routes map to the active Suppliers/RFQs context |
| 7 | Group Event Profile tabs | Current 21-tab `BASE_TABS` registry | Core/Delivery/More grouping below, with flag/pack predicates, mobile selector and deep-link support |
| 8 | Categorize AdminSidebar | `src/components/layout/AdminSidebar.tsx` flat array | Group headers/permissions/route metadata; all admin routes server-guarded and test-covered |
| 9 | Update shared navigation tests | Unit, E2E, visual tests | Persona × plan × flag × role matrix proves visible, hidden, active and direct-route behavior |

### 5.1 Organizer / Event Manager

| Group | Side-menu item | Main route | Main-section sub-tabs | Detail/profile pages and nested tabs | Creation wizards |
|---|---|---|---|---|---|
| Overview | Home | `/event-manager/home` | Overview, activity, alerts (widgets, not route tabs) | — | Quick Create routes to approved wizards |
| Overview | Calendar `flag: calendarHub` | `/event-manager/calendar` | Overview; view switcher: agenda/day/week/month | Event/task/booking drawer | New event/task/availability |
| Sales | Sales | `/event-manager/leads` | Overview, Leads, Proposals, Forms, Pipeline (view) | Lead: Overview, activity, notes, proposals, communications, conversion; Proposal: Overview, scope, pricing, approvals, signature, activity; Form: builder, submissions, settings | New lead; proposal; form builder |
| Delivery | Events | `/event-manager/events` | Overview, Programmes `flag`, Templates; Table/Card/Calendar/Board as views | See event command centre in §6 | New Event (type/template-aware); clone/localise; programme/series |
| Delivery | Suppliers | `/event-manager/suppliers` | Overview, Directory, RFQs, Scorecards, Documents, Contracts, Availability | Supplier: Overview, services/rate cards, quotes/RFQs, events/jobs, documents/insurance, availability, scorecard, contacts, activity | New supplier; RFQ; supplier invite |
| Delivery | Venues | `/event-manager/venues` | Overview, Directory, Documents, Holds | Venue: Overview, rooms/spaces, gallery, maps/access, events, holds, commercial records, documents, notes, activity | New venue; venue hold/request |
| Delivery | Tasks | `/event-manager/tasks` | Overview, Templates; List/Board/Calendar/Gantt as views | Task: Overview, checklist, dependencies, files, activity | New task; template |
| Revenue | Finance | `/event-manager/finance` | Overview, Quotes, Invoices, Payments, Supplier payments, Deposits, Expenses, Profit, Cashflow, Ticket sales `flag` | Quote: Overview, line items, approvals, activity; Invoice: Overview, line items, payment schedule, payments, activity; Deposit/payment: record, allocation, audit | Quote; invoice; deposit; supplier payment; wage/hours; ticket tier |
| Revenue | Tickets `flag: ticketing` | `/event-manager/finance/ticket-sales` | Overview, inventory, orders, attendees, promos, refunds/transfers | Ticket/order: purchaser, tickets, payment, transfer/refund, activity | Ticket setup; tier; promotion |
| Workspace | Inbox | `/event-manager/inbox` | Overview, Assigned, Unread; views only | Thread: messages, files, linked records, activity | New draft/communication |
| Workspace | Automations `flag: automationsBuilder` | `/event-manager/automations` | Overview, My automations, Recipes, Runs, Approvals, Errors, Integrations, Usage, AI Builder | Automation: builder, triggers, conditions, actions, permissions, run history, audit | Recipe install; automation builder; webhook endpoint |
| Workspace | Team | `/event-manager/team` | Overview, Members, Workload, Availability, Staffing requests, Find | Member: Overview, schedule, roles & skills; event staffing is an Event tab | Invite member; staffing request |
| Workspace | Settings | `/event-manager/settings` | Account, Workspace, Branding, Billing, Payouts, Team, Roles, Security, Preferences, Notifications, AI, Smart Rules, Event defaults, Supplier defaults, Finance defaults, **Assets** (Library), Data export, Audit, Usage, Affiliate | Asset: file detail; Template: edit/version/usage; Event pack: overview/content/version | Workspace setup; invite; asset upload; template/event-pack |

**Organizer menu clean-up requirement:** do not retain separate top-level Leads, Proposals, RFQs, Library, Venue Management, Forms, Reports, Quotes, or Tickets items. They are respectively Sales, Suppliers, Settings/Assets, venue-persona, Sales, Finance, and feature-gated Finance/Tickets concerns. Reports are an Overview/Finance/Events capability until a proven standalone reporting frequency justifies a top-level item.

### 5.2 Venue Operator

| Group | Side-menu item | Main route | Main-section sub-tabs | Detail/profile pages and nested tabs | Creation wizards |
|---|---|---|---|---|---|
| Overview | Home | `/event-manager/home` | Overview, operations alerts | — | Quick create venue/booking |
| Operations | My Venues | `/event-manager/venue-management` | Overview, Spaces, Availability, Bookings, F&B, Documents, Pricing, Reviews, Staff | Venue: Overview, spaces, availability, bookings, BEO, F&B, staff, documents, finance, settings | Venue onboarding; space; F&B package |
| Operations | Bookings | `/event-manager/venue-management/bookings` | Overview; calendar/list/board views | Booking: Overview, client/event, spaces/holds, BEO, F&B, schedule, documents, invoices, activity | New booking; hold; BEO |
| Operations | Availability `flag: calendarHub` | `/event-manager/calendar` | Overview; calendar views | Space/booking drawer | Blockout; availability rule |
| Listings | My Listings `flag: marketplaceVenue` | `/event-manager/marketplace/listings` | Overview, Listings, Enquiries, Reviews, Payouts | Listing: Overview, media, pricing, availability, policies, enquiries, reviews, payout/activity | Listing creation |
| Listings | Suppliers | `/event-manager/suppliers` | Overview, preferred suppliers, documents, RFQs | Supplier relationship: overview, compliance, jobs, activity | Preferred supplier / RFQ |
| Workspace | Finance | `/event-manager/finance` | Overview, invoices, payments, deposits, payouts, profit | Invoice/payout detail | Invoice; deposit |
| Workspace | Team | `/event-manager/team` | Overview, Members, Rota, Availability | Member: profile, schedule, skills | Invite / rota |
| Workspace | Inbox | `/event-manager/inbox` | Overview, assigned, unread | Thread detail | Compose |
| Workspace | Settings | `/event-manager/settings` | Same shared settings, scoped to venue permissions | — | Venue workspace configuration |

### 5.3 Supplier / Vendor

| Group | Side-menu item | Main route | Main-section sub-tabs | Detail/profile pages and nested tabs | Creation wizards |
|---|---|---|---|---|---|
| Overview | Home | `/event-manager/home` | Overview, pipeline/alerts | — | Quick create quote/listing |
| Delivery | Jobs | `/event-manager/jobs` | Overview, Assigned, Completed, Evidence | Job: Overview, brief, schedule, deliverables, evidence, payment, activity | Job acceptance/fulfilment |
| Delivery | RFQs | `/event-manager/rfqs` | Overview, Invited, Responded, Won/Lost | RFQ: Overview, requirements, response, comparison, messages, activity | RFQ response / quote |
| Delivery | Quotes | `/event-manager/quotes` | Overview, Draft, Sent, Accepted, Declined | Quote: Overview, line items, attachments, acceptance, activity | New quote |
| Operations | Availability `flag: calendarHub` | `/event-manager/calendar` | Overview; calendar views | Availability drawer | Blockout/availability rule |
| Listings | My Listings `flag: marketplaceSupplier` | `/event-manager/marketplace/listings` | Overview, Listings, Enquiries, Reviews, Payouts | Listing: Overview, service packages, media, availability, reviews, payout/activity | Listing creation |
| Workspace | Earnings | `/event-manager/finance` | Overview, receivables, payouts, expenses, tax export | Payment/payout detail | Expense / payout request |
| Workspace | Team `agency only` | `/event-manager/team` | Overview, Members, Rota, Availability | Member profile | Invite / rota |
| Workspace | Inbox | `/event-manager/inbox` | Overview, assigned, unread | Thread detail | Compose |
| Workspace | Settings | `/event-manager/settings` | Account, business profile, branding, payouts, docs/insurance, notifications, security, usage | Supplier profile/document detail | Supplier onboarding/configuration |

### 5.4 Consumer / Buyer account (not a workspace)

| Top navigation | Route | Sub-tabs / detail views | Wizards / actions |
|---|---|---|---|
| Discover | `/discover` | Search, calendar, map, categories, saved; event public page `/e/[slug]` | Search/filter; save/follow |
| My Tickets | `/account/tickets` | Wallet, QR pass, transfer/refund eligibility, accessibility companion | Transfer/refund request |
| Orders | `/account/events` | Order detail: payment, tickets, receipts, support | Checkout `/e/[slug]/checkout` |
| Saved & Following | `/account` | Saved events/organizers, notification preferences | Follow/manage preferences |
| Account | `/account` | Profile, security, payment methods, accessibility preferences | Buyer onboarding `/onboarding/customer/*` |

## 6. Event command centre: mandatory detail tabs

The event record is the operational centre. Existing separate routes are retained but displayed as a coherent tab system. Tabs are feature-gated and collapse into a mobile selector; views inside each tab do not become nested navigation.

### 6.1 Event tab hierarchy and current-route mapping

The current event layout registers 21 tabs at the same level. Keep all supported capabilities, but change the presentation and registry to the following hierarchy. **Core** and **Delivery** are the only always-visible desktop groups; **Experience**, **Operations**, **Growth**, and pack tabs sit in an accessible More menu until their flag/type makes them primary. A direct link always opens the same route and highlights its group.

| Group | Direct tabs / routes | Current-state mapping | Visibility and management rule |
|---|---|---|---|
| Core | Overview `/overview`; Brief `/brief`; Schedule `/schedule`; Tasks `/tasks`; Finance `/finance` | All currently exist | Always visible subject to record permission; Overview is default |
| Delivery | Suppliers `/suppliers`; Staffing `/staffing`; Logistics `/logistics`; Documents & Media `/documents-media`; Comms `/comms` | All currently exist | Always visible for delivery roles; Finance/Docs can be narrower than general event access |
| Experience | Tickets `/tickets`; Guests `/guests`; Floor Plan & Seating `/floor-plan`; Event Map `/event-map`; Check-in `/check-in`; Mood Board `/mood-board` | All currently exist | Show only when ticketing/guest/seating/check-in/creative feature applies; a non-ticketed event need not show Tickets |
| Operations | Expenses `/expenses`; Event Order/BEO `/beo`; Event Day `/event-day`; Risk & Control `new`; Hospitality `new`; Production/Virtual `new` | Existing first four plus pack routes | Event Day can appear as a header action when live; Risk/Control and Production are permission/pack restricted |
| Growth & reporting | Publish `/publish`; Insights `/insights`; Marketing `new`; Fundraising `new`; Activity `/activity`; Export `/export` | Existing Publish, Insights, Activity, Export; new pack routes | Activity is viewable to permitted roles; exports must be action-gated and may be a More action rather than a persistent tab |
| Pack extensions | Corporate; Conference; Exhibitors & Sponsors; Celebration; Competition; Travel & Accommodation | New routes under the event ID | A pack may add one primary tab plus in-tab segmented controls; never add five peer tabs to the global row |

#### Event detail route rules

| Rule | Requirement |
|---|---|
| Core route | `/event-manager/events/[eventId]` redirects to `/overview`; no duplicate content route. |
| Pack route pattern | `/event-manager/events/[eventId]/<pack-key>`; child paths are only for an actual record/action, e.g. `/conference/sessions/[sessionId]`, never for a view switcher. |
| Tab predicate | The event tab registry evaluates workspace type, event format/type, assigned pack, plan, role and feature flag. A direct request to a hidden tab returns safe 403/upgrade/not-found according to policy. |
| Tab badges | Tasks = outstanding permitted tasks; Guests = RSVP/action count; Tickets = sales/scan issue count; Risk = open incidents; Comms = unread relevant threads. Never query unrestricted counts. |
| Header actions | Edit, duplicate, change status, share portal, event-day mode and More actions are permission/flag-gated independently of tab visibility. |
| Mobile/PWA | Replace groups + tab row with one labelled `Event section` selector; preserve the direct URL and group label; Event Day gets a large dedicated launch action. |
| Audit | Every navigation-affecting status/pack change emits activity; every sensitive export, publish and portal share emits immutable audit. |

| Tab | Canonical route | Required nested areas / modular extensions |
|---|---|---|
| Overview | `/event-manager/events/[eventId]/overview` | KPI, event health, next actions, linked records, activity snapshot |
| Brief | `/brief` | Goals, audience, event type/template, stakeholders, accessibility, version/approval |
| Programme & schedule | `/schedule` | Run sheet, sessions/tracks/rooms, cues, rehearsal, timezone; virtual rooms when enabled |
| Suppliers | `/suppliers` | Requirements, RFQs, assignments, contracts, documents, scorecard |
| Tasks | `/tasks` | Board/list/calendar, dependencies, assignments, automation history |
| Finance | `/finance` | Budget/actual, quotes/invoices, cost centres/PO, payments, expenses, funding/settlements |
| Tickets & registration | `/tickets` | Inventory, pricing, orders, attendee/participant registration, promos, check-in |
| Guests & attendees | `/guests` | RSVP, households/plus-ones, dietary/accessibility, badges, seating/participants |
| Seating & event map | `/floor-plan` and `/event-map` | Table plan, seat assignment, venue/site map, stands, zones, route checkpoints |
| Staffing | `/staffing` | Crew, shifts, availability, suppliers, officials/volunteers |
| Logistics | `/logistics` | Travel, accommodation, transport, deliveries, equipment, site access |
| Hospitality | new `hospitality` pack route | Menus, covers, service plan, bar/concessions, kitchen/FOH |
| Production / virtual delivery | new `production` / `virtual-delivery` pack routes | Artist/speaker production, technical specs, stream rooms, recordings, moderator controls |
| Risk & control | new `risk-control` pack route | RA/MS, permits, incidents, capacity, emergency plan, event control feed |
| Fundraising | new `fundraising` pack route | Targets, donations, auctions, pledges, Gift Aid, impact |
| Marketing & publish | `/publish` | Event website, registration campaign, referral/waitlist, social/press, Caption Fox handoff |
| Documents & media | `/documents-media` | Secure assets, supplier docs, permissions, expiring documents |
| Communications | `/comms` | Client/supplier/attendee threads, announcements, consent-aware history |
| Insights | `/insights` | ROI, attendance, engagement, revenue, carbon/impact when enabled |
| Event day | `/event-day` | Role-aware live operating mode, check-in, incidents, control-room modules |
| Activity | `/activity` | Immutable user-visible audit/activity timeline |
| Export / BEO | `/beo`, `/export` | Print/PDF/event pack, permission-scoped export |

## 7. Portal inventory and required upgrades

| Portal type | Entry / route | Main sections | Detail/sub-tabs | Multi-step flows | Mandatory security and upgrade work |
|---|---|---|---|---|---|
| Client portal | `/portal/[token]` | Event home, timeline, documents, approvals, invoices/payments, messages, guest response | Document preview, approval detail, invoice/payment, upload status | Planner invite/mint → client access → acknowledge/approve/upload | Hashed, expiring, revocable token; minimum event DTO; invite creation UI; upload scope; audit; branded domain only behind flag |
| Venue client portal | `/venue-portal/[token]` | Booking overview, BEO, schedule, F&B choices, documents, invoices, messages | Booking, room/space, menu, invoice, document | Venue invite → client choices/approval → confirmation | Same token controls; booking/venue scope; no cross-booking data |
| Supplier portal | target `/supplier-portal/[token]` | Job/RFQ, quote response, availability, documents/insurance, evidence, messages, payment status | Job, quote, document, compliance, activity | Organizer invite → accept/decline → quote/upload → fulfilment | Supplier-only data scope; signed uploads; document expiry; audit; idempotent acceptance |
| Attendee/event portal | public event `/e/[slug]`, registration/ticket routes | Agenda, speaker/session, virtual room, ticket/pass, accessibility, networking | Ticket, session booking, Q&A/poll, replay | Discover → registration/checkout → pass → check-in → feedback | Consent/privacy, anti-bot/rate limit, order ownership, session capacity, accessibility |
| Buyer account | `/account/*` | Discover, tickets, orders, saved, account | QR wallet, order/payment/refund/transfer | Customer onboarding → checkout → manage ticket | Buyer ownership policy, payment webhooks, refund/transfer audit |
| Affiliate portal | `/affiliate/*` | Dashboard, links, assets, conversions, payouts/tax | Link analytics, payout/tax detail | Apply → approve → link → payout request | Affiliate role/approval, anti-fraud, financial audit |

## 8. Platform Admin side menu

| Group | Admin side-menu item | Route | Main-section sub-tabs | Detail/profile tabs | Wizards / required controls |
|---|---|---|---|---|---|
| Overview | Dashboard | `/admin` | KPIs, rollout, incidents | — | No privileged action without step-up MFA |
| Customers | Users | `/admin/users` | Overview, search, status, access | User: profile, identities, memberships, sessions/MFA, tickets/orders, support, audit | Invite/support recovery only, audit logged |
| Customers | Workspaces | `/admin/workspaces` | Overview, organizer/venue/supplier, plan, risk | Workspace: profile, members/roles, subscriptions, flags, usage, integrations, audit, support | Create/support switch only with reason and audit |
| Revenue | Subscriptions | `/admin/subscriptions` | Overview, plan, status, payment risk | Subscription: entitlement, invoices, events/webhooks, audit | Plan override/refund requires approval/audit |
| Growth | Affiliates | `/admin/affiliates` | Overview, applications, active, payouts, tax | Affiliate: profile, links, conversions, payouts, tax, audit | Approve/suspend/payout review |
| Support | Support | `/admin/support` | New, assigned, waiting, resolved, SLA | Ticket: conversation, linked workspace/user, attachments, audit | Create/escalate/resolve |
| Governance | Audit logs | `/admin/audit` | Search, security, data, financial, export | Audit event: immutable detail/redacted payload | Export restricted and logged |
| Governance | Feature flags | `/admin/feature-flags` | Registry, rollout, overrides, exposure | Flag: rules, workspaces, changes, audit | Create/change/rollback flag; expiry required |
| Operations | System health | `/admin/system-health` | Services, queues, jobs, incidents, SLO | Incident: timeline, affected tenants, remediation | Incident workflow |
| Operations | Email logs | `/admin/email-logs` | Delivery, bounce, suppression, template | Delivery detail/redacted payload | Retry only with guard/audit |
| Operations | AI usage | `/admin/ai-usage` | Spend, budgets, model/provider, safety | Workspace/user execution detail | Budget adjustment/audit |
| Operations | Automation runs | `/admin/automation-runs` | Runs, failures, approvals, webhooks | Run: DAG/node logs, retries, audit | Retry/cancel guarded and idempotent |
| Operations | Storage usage | `/admin/storage-usage` | Buckets, workspaces, retention, failed scans | File metadata/access audit | Retention/purge policy, never broad delete |
| Security | Security | `/admin/security` | Admin sessions, MFA, access events, RLS/API alerts, abuse | Security incident/user/workspace detail | Force sign-out/suspend with reason, audit, approval |
| V2 Trust | Moderation & verification `flag` | target `/admin/trust-safety` | Listings, reviews, verification, disputes, sanctions | Case: evidence, decision, appeals, audit | Review/approve/reject/escalate |

Admin hardening is a release blocker: separate admin authentication, mandatory fresh MFA for sensitive actions, service-role access only server-side, reason capture, immutable audit log, break-glass workflow, and no customer-content leakage in diagnostics.

## 9. Public top navigation and public journeys

| Public menu / surface | Routes | Required content and actions |
|---|---|---|
| Product | `/product`, `/features`, `/use-cases/*` | Persona and vertical-pack pages; accurate gate/availability claims |
| Pricing | `/pricing` | SaaS plans, add-ons, ticket/marketplace fees, upgrade CTA; no unavailable feature claims |
| Discover | `/discover`, `/e/[slug]` | Searchable public events, category/date/location filters, accessible public event page, structured data/OG |
| Ticketing | `/e/[slug]/tickets`, `/checkout`, `/success` | Inventory, price/fees, checkout, receipt, order recovery, consent/refund terms |
| Marketplace | target public directory plus listing pages | Venue/supplier discovery, map/search, profiles, availability/RFQ/booking; V2 flag only |
| Build / enquire | `/build`, `/build/[eventId]`, `/contact`, `/book-demo`, `/waitlist`, `/demo` | Lead capture, proposal/event creation handoff, transparent consent |
| Help & status | `/help`, `/status` | Support, service health, incident updates |
| Affiliate | `/affiliate`, `/affiliate/apply`, `/affiliate/login` | Programme information and secure partner access |
| Legal | `/legal/*` | Privacy, terms, cookies, data processing, refund, acceptable use, affiliate, subprocessors; country packs later |
| Authentication | `/login`, `/signup`, password/OTP/MFA/invite routes | Single identity resolver dispatches user to their permitted surface |

## 10. Cross-cutting implementation requirements

| Area | Non-negotiable work |
|---|---|
| Data & migrations | One migration per bounded change, reproducible from fresh DB; constraints/indexes/status transitions; a migration ledger and rollback/manual notes. |
| RLS / permissions | `workspace_id` + parent record scope; role, plan, add-on and flag enforced in policy/action/route; portal/buyer ownership policies; negative test suite. |
| Integrations | Adapter interface per provider; OAuth/API keys owned by customer; encrypted server-side credentials; webhook signature/replay protection; retries/idempotency; provider is off until configured. |
| Files | Private workspace/record paths, allowlisted mime/size, malware/unsupported handling, signed URLs, download/export audit, retention policy. |
| Automations | Review-first by default, trigger dedupe, loop prevention, approval for money/legal/AI, rate limits, run logs and safe replay. |
| AI | Permission-grounded context only, no secret/hidden data, explicit approval for mutations, budgets/meters, prompt-injection and data-leakage tests. |
| Accessibility | WCAG 2.2 AA: keyboard, focus, ARIA, contrast, semantic tables/forms, captions/transcripts, accessible seating and companion workflows. |
| Responsive/PWA | QA at 1440, 1280, 1024, tablet, mobile and installed PWA. Desktop tabs become tablet segmented navigation and mobile selector; no clipped actions/horizontal scroll. |
| Observability | Correlated request/audit IDs, redacted frontend/backend/edge errors, slow query/API metrics, webhook/job failure alerts, privacy-safe support diagnostics. |
| Performance | Query budgets, index/explain evidence, pagination, no N+1, server aggregation, virtualised large lists, rate limited exports/uploads/AI. |

## 11. Delivery and release tracker template

Use this tracker for each main section, detail tab, portal, admin surface, and pack. A parent cannot be marked Ready while any required child is below 100/100.

| Area / route | Owner | Data + RLS | UI + responsive | Actions / integrations | Tests / evidence | Score | Release decision |
|---|---|---|---|---|---|---:|---|
| Example: Hybrid & virtual `/events/[id]/virtual-delivery` | TBD | ⬜ | ⬜ | ⬜ | ⬜ | 0 | Not started |

### Required evidence checklist

For every tracker row, create `release-gated/docs/<section-name>.md`, plus `release-gated/user-fixes/<section-name>.md` only for exact manual actions that cannot be automated. Evidence must cover: routes and navigation; every control and wizard; data sources/tables/migrations; policies/RLS and API/edge functions; storage and integrations; desktop/tablet/mobile/PWA screenshots; unit/integration/E2E/RLS/security/visual/stress tests; performance/observability findings; bugs/fixes; manual steps; final score and one allowed decision: **ready for release**, **ready behind feature flag**, **ready for admin-only beta**, **blocked pending manual fix**, or **removed/merged due to bloat**.

## 12. Immediate execution backlog

| Priority | Deliverable | Completion definition |
|---|---|---|
| P0 | Freeze and test F1–F4 | Flag/plan/role/RLS checks pass at route, action, API and DB layers; admin step-up flow proven. |
| P0 | Reconcile current nav to §5 | Implement Sales, Suppliers/RFQ, Assets and persona separation; redirect old routes; update breadcrumbs, command palette and tests. |
| P0 | Make portal invites real | Planner/venue/supplier can securely mint, revoke and audit scoped portal links. |
| P0 | Release evidence baseline | Audit Home, Events, Event Detail, Finance, Settings, each portal and Admin using the required matrix; fix until 100/100. |
| P1 | Shared capability prerequisites | Finish robust tickets, seating, accessibility/guest profile, schedule/rooms, notification and risk primitives. |
| P1 | Corporate + Hybrid packs | Build to §4.2 contract; ship behind flags after full E2E journeys. |
| P1 | Hospitality/Gala + Weddings | Extend guests, seating, F&B, finance, portal and linked-event domains without duplication. |
| P2 | Conference, Festival, Sports, Travel/Catering | Sequence by customer demand; each remains a separately gated vertical pack. |
| P2 | Fundraising and Marketing/Portfolio | Build payment/consent/analytics compliant flows and Caption Fox adapter. |
| P3 | V2 marketplace/trust/payouts | Complete only after money, disputes, verification, marketplace RLS and support operations are release-certified. |

## 13. Definition of complete

This plan is complete only when the tracker contains every listed workspace, portal, admin, public surface, detail tab and enabled vertical pack; each has a 100/100 evidence document; and no unavailable capability leaks through navigation, URLs, APIs, search, reports, notifications, Copilot, automations, exports, or portal tokens.

## 14. Detailed domain model and migration roadmap

The following is the implementation boundary for new work. Names are proposed canonical names; before a migration is written, reconcile them against the generated Supabase types and reuse an existing table when it already owns the concept. Every table includes `id`, `workspace_id`, `created_at`, `updated_at`, actor/audit metadata where appropriate, RLS, foreign keys, and indexes for its common workspace/event lookup.

| Module | Proposed tables / extensions | Important relationships and constraints | Sensitive fields / controls |
|---|---|---|---|
| Event templates and packs | `event_templates`, `event_template_versions`, `event_pack_assignments`, `event_programmes`, `programme_events` | Template version is immutable after publish; an event stores applied version and pack set; programme can own many events | Template visibility is workspace-scoped; shared templates require explicit sharing policy |
| Hybrid / virtual | `virtual_event_settings`, `virtual_rooms`, `virtual_room_hosts`, `virtual_sessions`, `virtual_session_assets`, `virtual_session_engagement`, `event_recordings`, `recording_consents`, `technical_rehearsals` | Room belongs to one event; session references room; provider external ID unique per provider; recording access follows event/session policy | Recording consent, transcript access, chat moderation, IP/provider tokens server-side only |
| Corporate | `corporate_accounts`, `corporate_departments`, `cost_centres`, `purchase_orders`, `approval_policies`, `approval_requests`, `delegate_groups`, `event_objectives`, `event_roi_snapshots`, `corporate_frameworks` | PO/cost centre must belong to corporate account/workspace; approval request has a controlled state machine and subject pointer | Confidential events/fields require explicit restricted role; executive/VIP data is need-to-know |
| Guests, seating and accessibility | Extend guests; `guest_households`, `guest_party_members`, `guest_dietary_requirements`, `guest_accessibility_requirements`, `guest_seat_assignments`, `event_tables`, `accessibility_services`, `companion_tickets` | One active seat per guest/layout; capacity cannot be exceeded; companion ticket requires an eligible primary ticket | Dietary, disability and medical-adjacent information has restricted access, retention and consent |
| Gala / fundraising | `auction_lots`, `auction_bids`, `auction_bidder_registrations`, `pledges`, `donations`, `donor_recognition`, `raffle_entries`, `award_categories`, `award_nominees`, `award_judges`, `award_results`, `gift_aid_declarations` | Bid ordering/concurrency and reserve rules enforced in DB/service; winning bids/pledges are immutable financial records | Donor data, Gift Aid declarations, payment data; auditable corrections only |
| Weddings / celebration | `celebrations`, `celebration_people`, `celebration_events`, `wedding_party_roles`, `gift_registry_links`, `menu_tastings`, `attire_items`, `shot_list_items`, `music_cues`, `accommodation_blocks` | A celebration groups related events; participant/contact consent is separate from guest RSVP | Family/relationship data and private media default to portal-private |
| Conference / exhibition | `conference_tracks`, `conference_sessions`, `speaker_profiles`, `speaker_submissions`, `abstract_reviews`, `session_rooms`, `exhibitors`, `exhibition_stands`, `sponsor_packages`, `sponsor_deliverables`, `lead_scans`, `appointments`, `ce_credits` | Session room/time collisions blocked; conflict-of-interest abstract review; one stand assignment per layout; lead scan is consent-aware | Speaker personal/travel data; attendee lead-capture opt-in and export audit |
| Festival / live entertainment | `artists`, `artist_offers`, `artist_contracts`, `artist_riders`, `stage_plots`, `technical_inputs`, `backline_requirements`, `performance_slots`, `site_zones`, `crowd_capacity_readings`, `concessions`, `merchandise_sales`, `artist_settlements`, `royalty_records` | Performance slot prevents stage/time clashes; settlement is calculated from approved source entries | Artist bank/tax documents, security-zone access, settlement approval segregation |
| Sports / participation | `participant_profiles`, `teams`, `team_members`, `divisions`, `fixtures`, `heats`, `results`, `timing_events`, `waivers`, `medical_declarations`, `official_assignments`, `routes`, `checkpoints`, `aid_stations` | Result revisions have version/audit history; entrant cannot be duplicated in a division; checkpoint ordering is fixed | Medical data is highly restricted; public results are an explicit publishing projection |
| Travel / destination | `travel_itineraries`, `travel_segments`, `room_blocks`, `room_allocations`, `transfers`, `transport_manifests`, `arrival_departures`, `visa_documents`, `emergency_contacts`, `excursions` | Traveller is a contact/guest/delegate; room allocation respects room-block inventory; manifest access is role limited | Passport/visa/emergency data: encrypted/short retention, no broad exports, break-glass audit |
| Catering / bar | `menus`, `menu_items`, `menu_selections`, `service_plans`, `kitchen_timelines`, `bar_packages`, `bar_inventory`, `stock_movements`, `concessions`, `food_safety_checks`, `waste_records` | Covers, selection and dietary aggregates derived from guests; stock movements immutable; reconciliation needs approver | Food allergy controls, alcohol permissions, cash/stock reconciliation separation of duties |
| Risk / control | `risk_assessments`, `risk_controls`, `method_statements`, `permits`, `emergency_plans`, `incident_reports`, `incident_updates`, `medical_deployments`, `security_deployments`, `capacity_rules`, `weather_alerts`, `safeguarding_cases` | Incidents append updates rather than overwrite; closure/review requires authorized roles; capacity alert cannot be silently dismissed | Safeguarding and medical/security incidents have restricted case permissions and immutable audit |
| Marketing / growth | `event_websites`, `registration_campaigns`, `discount_codes`, `referral_links`, `ambassadors`, `waitlist_entries`, `campaign_sequences`, `announcement_posts`, `press_accreditations`, `campaign_attribution` | Codes/referrals have validity, limits, attribution and anti-abuse checks; waitlist promotion is idempotent | Marketing consent, unsubscribe/suppression, public copy approval, tracking minimisation |

### 14.1 Migration sequencing

| Wave | Migrations | Why it precedes later work | Exit criteria |
|---|---|---|---|
| M0 | Entitlement, pack registry, event-template versioning, audit/outbox additions | Gives every pack a stable switch and activity path | Resolver and server guards deny a disabled pack in all paths |
| M1 | Guest/attendee, seating, rooms/schedule, documents and consent extensions | Shared capabilities used by gala, weddings, conference, hybrid and accessibility | Capacity/seat/session constraints and consent RLS covered by tests |
| M2 | Corporate approvals/cost centres plus risk/control | Required for enterprise and safe public delivery | Approval and incident state machines tested, with role segregation |
| M3 | Hybrid and conference/exhibition | Reuses sessions, rooms, attendees and documents | Provider adapter mocked/real test passes; scheduling collisions blocked |
| M4 | Hospitality, gala, wedding and fundraising | Reuses seats, guests, finance and portals | Financial/contribution state integrity and portal journeys pass |
| M5 | Festival, sports, travel and catering | Higher operational and sensitive-data complexity | Restricted-field and offline/field-operation scenarios pass |
| M6 | Marketing/portfolio/public directory expansion | Depends on a safe publish, ticketing and consent base | SEO/public exposure/anti-abuse tests pass |

## 15. Event lifecycle, status machines and automations

No pack may invent a free-text status that controls a material operation. Use an explicit enum/state machine, transition command, authorization check, audit event and idempotency key.

| Domain | States | Allowed transition examples | Required automation / audit events |
|---|---|---|---|
| Event | Draft → Planning → Confirmed → Live → Completed → Archived / Cancelled | Confirm needs required venue/date/owner; Live requires event-day authorization; cancelled cannot silently become live | `event.created`, `event.confirmed`, `event.live`, `event.completed`, `event.cancelled` |
| Proposal | Draft → Sent → Viewed → Accepted / Declined / Expired → Converted | Accept requires public token/typed signature evidence; conversion is once-only | `proposal.sent`, `proposal.accepted`, `proposal.converted` |
| Booking | Enquiry → Hold → Tentative → Confirmed → Delivered → Closed / Cancelled | Confirm validates availability and approvals; hold auto-expires safely | `booking.held`, `booking.confirmed`, `booking.cancelled` |
| Ticket/order | Draft → Pending payment → Paid → Issued → Checked in / Refunded / Cancelled / Transferred | Webhook is the payment source of truth; scan is idempotent | `order.paid`, `ticket.issued`, `ticket.checked_in`, `ticket.refunded` |
| RFQ / supplier job | Draft → Invited → Responded → Awarded → Accepted → In progress → Evidence submitted → Complete | Award creates one assignment; job acceptance and evidence are supplier-scoped | `rfq.sent`, `rfq.awarded`, `supplier.job.accepted`, `supplier.evidence.uploaded` |
| Approval | Draft → Submitted → Approved / Rejected / Returned → Executed / Expired | Executor verifies still-approved state and subject version | `approval.requested`, `approval.approved`, `approval.executed` |
| Incident | Open → Triaged → Mitigating → Resolved → Reviewed / Reopened | Only authorised controller can resolve; update log remains append-only | `incident.opened`, `incident.escalated`, `incident.resolved` |
| Auction / pledge | Draft → Open → Closed → Settled / Cancelled | Close uses transaction/locking; settlement is approval gated | `auction.opened`, `bid.accepted`, `auction.closed`, `pledge.received` |

### 15.1 Automation guardrails

| Automation type | May auto-run | Must require approval | Hard block |
|---|---|---|---|
| Operational | Reminders, task creation, document-expiry checks, internal notifications | Supplier assignment or schedule change when conflict exists | None where recipient has opted out or pack/flag is off |
| Communications | Draft an email/message, create internal notification | Send external communication, publish announcement | SMS/WhatsApp/email without consent/provider configuration |
| Finance | Create a draft invoice, flag overdue risk | Charge, refund, payout, donation/Gift Aid reconciliation, settlement | Unapproved money movement or duplicate payment action |
| AI | Summarise, classify, draft, risk-signal | Any mutation or external message | Secret access, sensitive health/safeguarding inference, unapproved action |
| Safety | Create a risk-review task, notify control room | Change capacity/security deployment/incident closure | Automatic removal of incident/audit evidence |

## 16. Detailed wizard catalogue

Every wizard saves a resumable draft, validates server-side at each material transition, preserves only authorized parent context, shows an accessible stepper, and prevents duplicate submission with an idempotency key.

| Wizard | Users | Steps | Completion / handoff |
|---|---|---|---|
| New Event | Organizer / permitted venue | 1 Type and template; 2 basics/date/timezone; 3 venue or format; 4 audience/capacity/accessibility; 5 budget/owner; 6 packs and suppliers; 7 publish/privacy; 8 review/create | Creates draft event + task skeleton + audit; navigates to Overview |
| Clone / localise event | Organizer | 1 source/version; 2 fields to copy; 3 target dates/timezone/currency; 4 invite/team mapping; 5 review | Never copies portal tokens, payments, sensitive guests or incidents |
| Programme / series | Organizer / corporate | 1 programme identity; 2 events/locations; 3 shared templates/suppliers; 4 budget/cost centres; 5 governance | Creates portfolio with event links and reporting baseline |
| Venue booking | Venue operator | 1 client/event; 2 spaces/date/hold; 3 rates/packages; 4 deposit/terms; 5 BEO/requirements; 6 confirm | Atomic availability validation; booking/invoice/portal hooks |
| Supplier onboarding | Organizer / supplier | 1 business and contact; 2 services/rates; 3 availability; 4 documents/insurance; 5 portal/invite; 6 review | Creates supplier/profile; uploads secure documents; does not activate until compliance passes |
| RFQ | Organizer | 1 event/requirement; 2 scope/budget/dates; 3 recipients; 4 attachments/terms; 5 send | Recipient-scoped RFQ and activity; notifications obey preferences |
| Proposal | Organizer | 1 client/lead; 2 scope/template; 3 pricing/tax; 4 terms/approval; 5 preview/send | Public signing link minted only on send; acceptance can convert once |
| Quote / invoice | Authorized finance role | 1 party; 2 linked event/PO; 3 line items/tax; 4 schedule/payment; 5 review/issue | Immutable issued snapshot, audit, payment provider only when configured |
| Ticket setup | Organizer | 1 event/public settings; 2 tiers/inventory; 3 fees/tax; 4 access/companion/discounts; 5 sales window; 6 review/publish | Capacity and sales rules validated; public pages enabled only after publish gate |
| Client portal invite | Organizer | 1 event/recipient; 2 permitted sections; 3 expiry/branding; 4 review/send | Hashed token and portal_link; revoke/resend activity; no token is logged |
| Hybrid event setup | Organizer / producer | 1 delivery mode/provider; 2 rooms/sessions; 3 speaker checks; 4 moderation/accessibility; 5 recording/replay; 6 rehearsal | Provider credentials remain server-side; rehearsal and consent checks required before Live |
| Conference setup | Organizer | 1 tracks/rooms; 2 submission rules; 3 speakers/reviewers; 4 exhibitors/sponsors; 5 delegates/badges; 6 publish | Conflict checks, reviewer conflicts, sponsor deliverables and consent set |
| Wedding / celebration setup | Planner / couple role | 1 couple/celebration; 2 related events; 3 household/guest model; 4 ceremony/reception; 5 portal/mood board; 6 review | Couples receive restricted portal; related events share planned data, not automatic access |
| Fundraiser setup | Organizer / charity role | 1 charity/cause; 2 target; 3 donation/auction; 4 recognition/Gift Aid; 5 volunteer/comms; 6 publish | Charity verification and finance configuration required before accepting donations |
| Risk assessment | Event safety lead | 1 scope; 2 hazards; 3 impact/likelihood; 4 controls/owners; 5 approvals; 6 publish/review cadence | Approved version immutable; change creates new version and audit trail |
| Marketplace listing | Venue / supplier | 1 identity/service/space; 2 pricing/availability; 3 media/docs; 4 policies; 5 payout/review; 6 submit | Remains draft pending verification; no public listing/payout before approval |

## 17. Full release tracker by surface

The summary tracker in §2 is portfolio-level. This tracker is the minimum set of granular evidence rows. Populate the owner, evidence link, score and decision as work is audited; `—` means the route/feature must be built or merged before audit.

| Surface | Route / identifier | Scope | Status now | Required decision before release |
|---|---|---|---|---|
| Organizer shell | `/event-manager/*` | Workspace switching, sidebar, top nav, breadcrumbs, flags | Verify | 100/100 evidence |
| Home | `/event-manager/home` | Dashboard, KPIs, actions, activity | Verify | Ready or fix |
| Calendar | `/event-manager/calendar` | Events/tasks/bookings, timezone, iCal | Verify | Flagged if incomplete |
| Sales | `/event-manager/leads`, `/proposals`, `/forms` | Pipeline, conversion, signature/forms | Verify | Ready or flag subfeature |
| Events register | `/event-manager/events` | Views, filters, templates/programmes | Verify | Ready or fix |
| Event detail | `/event-manager/events/[eventId]/*` | Every tab in §6 | Verify | Per-tab score and parent score |
| Event creation | `/event-manager/events/new` | Type/template and pack selection | Verify | Ready only with idempotent persistence |
| Suppliers | `/event-manager/suppliers`, `/rfqs` | Directory, sourcing, documents, portal | Verify | Ready or flag portal |
| Venues | `/event-manager/venues` | Planner-side CRM | Verify | Ready or fix |
| Venue operations | `/event-manager/venue-management/*` | Venue persona booking/F&B/availability | Verify | V2 flag until complete |
| Tasks | `/event-manager/tasks/*` | Work management, templates, actions | Verify | Ready or fix |
| Finance | `/event-manager/finance/*` | Quotes/invoices/payment/profit/exports | Verify | Stripe/payment paths feature flagged |
| Ticketing | public + `/finance/ticket-sales` | Inventory, checkout, orders, scans | Verify | V1.5/Scale flag |
| Team | `/event-manager/team/*` | Members, roles, availability, staffing | Verify | Ready or fix |
| Inbox | `/event-manager/inbox/*` | Threads, communication permissions | Verify | Provider send stays gated |
| Automations | `/event-manager/automations/*` | Recipes, builder, runs, integrations | Verify | Scale + safety sign-off |
| Settings / Assets | `/event-manager/settings/*`, `/library/*` | Configuration, storage, billing, exports | Verify | Navigation merge and sensitive actions audit |
| Client portal | `/portal/[token]` | Event collaboration | In progress | Portal minting, expiry and RLS evidence |
| Venue portal | `/venue-portal/[token]` | Booking collaboration | In progress | Booking scope/RLS evidence |
| Supplier portal | target `/supplier-portal/[token]` | RFQ/job/doc collaboration | Planned | Build behind flag |
| Buyer surface | `/discover`, `/account/*`, `/e/[slug]/*` | Discovery, ticket wallet, checkout | Verify | Payment and buyer ownership evidence |
| Affiliate surface | `/affiliate/*` | Application, links, conversion, payout | Verify | Financial/audit evidence |
| Admin shell | `/admin/*` | Platform governance | Verify | Step-up MFA and audit evidence |
| Admin customers/revenue | `/admin/users|workspaces|subscriptions|affiliates/*` | Cross-tenant operations | Verify | Least privilege / reason capture |
| Admin operations/security | `/admin/system-health|security|audit|*usage` | Diagnostics and controls | Verify | Redaction, alerting, safe operations |
| Public marketing | `/`, `/product`, `/pricing`, `/features`, `/use-cases/*` | Accurate positioning and conversion | Verify | Claims/legal/consent review |
| Vertical packs | §4 pack routes | Gated extensions | Planned | Per-pack 100/100 prior to enablement |

## 18. Per-route QA matrix to attach to every evidence document

| Test class | Minimum cases |
|---|---|
| Route/navigation | Direct deep link, hard refresh, back/forward, redirect/legacy URL, correct active item/breadcrumb/title, workspace switch, flag off, plan off, no access, unauthenticated |
| Data | Empty/loading/error, one record, large data, filter/search/sort/pagination, UK date/currency/timezone, cache refresh/realtime, import/export parity |
| Actions | Every button/menu/row/bulk action; double click; validation failure; optimistic rollback; confirmation; audit activity; connected-section refresh |
| Authorization | Owner, Admin, Manager, Team Member, Read-only, Accountant, Portal User, Platform Admin; correct UI and direct action/API/RPC behavior |
| Storage/integration | Invalid/oversize/malicious file; signed URL expiry; provider unavailable; webhook signature/replay; retry/idempotency; no customer credentials in logs |
| Accessibility/responsive | 1440, 1280, 1024, tablet, mobile, PWA; keyboard traversal; visible focus; screen-reader labels; contrast; touch target; safe area; no layout shift/overlap |
| Performance/security | Query plan/index confirmation, no N+1, concurrency, rate limit, IDOR/RLS negative path, CSRF/origin where applicable, injection/prompt injection, PII/log redaction |
| E2E stories | Organizer creates and delivers event; client approves; supplier responds; venue books; buyer buys/checks in; admin diagnoses; each relevant pack's primary journey |

## 19. Shell implementation note — 23 July 2026

The canonical Gala Dock workspace shell is now route-rooted by workspace type, with **no generic `/app` namespace and no legacy redirects**. The live development shell roots are `/organizer/*`, `/venue/*`, and `/supplier/*`. The type root is therefore both the workspace identity and the first URL segment for every menu page, nested tab, item/profile page and creation wizard.

| Requirement | Implemented shell contract | Route convention | Delivery status |
|---|---|---|---|
| Every workspace side menu | Unique Organizer, Venue and Supplier navigation registries; subtype rules remove Team for Supplier Solo | `/{workspace-type}/{section}` | Shell implemented |
| Every main-section sub-tab | Each navigation child has a path-backed route and active-state behaviour | `/{workspace-type}/{section}/{tab}` | Shell implemented |
| Every item / profile detail page | Generic dynamic shell accepts the entity identifier and detail tab without returning to a generic app root | `/{workspace-type}/{section}/{itemId}/{tab}` | Shell route implemented; entity data is a separate vertical delivery task |
| Every creation wizard | Create CTA routes into its persona's type-rooted create path; the wizard catalogue in §16 defines all mandatory flows | `/{workspace-type}/{section}/new` | Wizard shell route implemented; persistence work remains tracked by §16 completion criteria |
| Workspace switching | Seven Supabase memberships are seeded for the named account. The switch action verifies membership, updates `profiles.active_workspace_id`, revalidates all three typed shells, and redirects to the selected typed root. | `/{workspace-type}/home?workspace={id}` | Implemented and seed-verified |
| Portal, buyer and admin shells | Their plans remain separately catalogued in §§5–8 and the tracker. They do not share the workspace-type root because they are distinct surfaces. | `/portal/*`, `/venue-portal/*`, `/supplier-portal/*`, `/account/*`, `/admin/*` | Tracked by surface |

### 19.1 Required typed shell inventory

| Workspace type | Side-menu sections | Required nested tabs / item shells / wizard roots |
|---|---|---|
| Organizer | Home, Calendar, Sales, Events, Suppliers, Venues, Marketplace, Tasks, Finance, Inbox, Automations, Team, Settings | Sales: Overview/Leads/Proposals/Forms/Analytics; Events: Overview/Programmes/Templates and event item tabs in §6; Suppliers: Overview/Directory/RFQs/Scorecards/Documents/Contracts/Availability; Venues: Overview/Directory/Holds/Documents; Marketplace: Overview/Venues/Services/Requests/Saved; Tasks: Overview/Templates; Finance: Overview/Quotes/Invoices/Payments/Supplier Payments/Deposits/Expenses/Profit/Cashflow/Ticket Sales; Automations, Team and Settings tabs as defined in §5.0.3. Detail convention `/{section}/{id}/{tab}`; creation roots include `events/new`, `suppliers/new`, `rfqs/new`, `venues/new`, `tasks/new`, `finance/{document}/new`. |
| Venue | Home, My Venues, Bookings, Availability, Marketplace Console, Suppliers, Finance, Team, Inbox, Settings | My Venues: Overview/Spaces/Availability/Bookings/F&B/Documents/Pricing/Reviews/Staff; Bookings: Overview/Enquiries/Holds/Tentative/Confirmed/Delivered/Closed; Marketplace Console: Overview/Listings/Enquiries/Reviews/Payouts/Verification; Suppliers: Overview/Preferred/Documents/RFQs; Settings: Account/Workspace/Billing/Assets/Security/Audit. Detail convention `/{section}/{id}/{tab}`; wizard roots include `my-venues/new`, `my-venues/{id}/spaces/new`, `bookings/new`, `marketplace-console/listings/new`. |
| Supplier | Home, Jobs, RFQs, Quotes, Availability, Marketplace Console, Earnings, Team (agency/performer only), Inbox, Settings | Jobs: Overview/Assigned/In Progress/Evidence/Completed; RFQs: Overview/Invited/Draft Responses/Submitted/Awarded/Closed; Quotes: Overview/Draft/Sent/Accepted/Declined/Expired; Marketplace Console: Overview/Listings/Enquiries/Reviews/Payouts/Verification; Earnings: Overview/Receivables/Payouts/Expenses/Tax Export; Settings: Account/Business Profile/Documents/Payouts/Billing/Security. Detail convention `/{section}/{id}/{tab}`; wizard roots include `jobs/new`, `rfqs/{id}/respond`, `quotes/new`, `marketplace-console/listings/new`, `team/invite`. |

**Implementation comment:** a shell is deliberately not a claim that every domain workflow is production-ready. Route, sidebar, nested-tab, detail-route and wizard-route coverage is in place. Each data mutation, provider integration, RLS policy, state machine and release test must still meet the explicit completion criteria in §§14–18 before a surface is marked release-ready.
