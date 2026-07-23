# Gala Dock — Application Shell Implementation Tracker

**Phase:** structural shell-out. This tracker intentionally records navigation and UI shells separately from production readiness. Existing data-backed Gala Dock surfaces are retained; new vertical-pack and portal surfaces may use development-only placeholders until their own release plans are implemented.

**Planning authority:** root [`plan.md`](../plan.md), especially §§ 5–9 and 14–18.  
**Source registry:** `src/lib/nav/app-nav.ts`; existing section tabs: `src/components/ui/SectionTabs.tsx`; event profile: `src/app/event-manager/events/[eventId]/layout.tsx`.

## Status key

| Status | Meaning |
|---|---|
| Not Started | No route or structural shell yet. |
| Shell Created | Route and meaningful page shell exist. |
| Navigation Connected | Reachable from the correct persona/portal/admin navigation. |
| Responsive Checked | Desktop/tablet/mobile navigation and page structure checked. |
| Complete | Shell, navigation and responsive check complete; this is **not** production-functionality certification. |

## Workspace and control-plane coverage

**Seed verification:** `jamahlthomas1996@gmail.com` now owns seven persisted development workspaces: Jamahl Event Management, Jamahl Event Agency, Jamahl Corporate Events, Jamahl Venue Group, Jamahl Supplier Studio, Jamahl Supplier Collective, and Jamahl Live Entertainment. The typed shell switcher lists all seven memberships. The idempotent source-of-record seed is [`supabase/seeds/gala-shell-workspaces.sql`](../supabase/seeds/gala-shell-workspaces.sql); it was run and checked against the linked Supabase project on 23 July 2026.

**Canonical shell URLs:** all workspace UI uses `/{workspace-type}/{section}/{optional-tab-or-item-path}`. The three allowed workspace roots are `/organizer`, `/venue`, and `/supplier`; no new workspace link may use `/app` or a legacy redirect. A catch-all typed route supplies structural shells for all registered menu pages, nested tabs, profile/detail URLs and `new`/wizard URLs. Functional persistence for each business wizard remains individually release-gated in the master plan.

| Workspace / persona | User role context | Main sidebar or top navigation | Settings shell | Onboarding / create flow | Shell status | Navigation | Responsive | Plan source |
|---|---|---|---|---|---|---|---|---|
| Event Organizer | Owner, Admin, Manager, Team, Read-only, Accountant | Home; Calendar; Sales; Events; Suppliers; Venues; Marketplace; Tasks; Finance; Inbox; Automations; Team; Settings | Account; Workspace; Billing | Workspace onboarding; New Event; programme; supplier; venue | Complete | Navigation Connected | Shell responsive layout | §5.0.1, §5.0.3 |
| Venue Operator | Owner, Venue Manager, Booking, Finance, Team, Read-only | Home; My Venues; Bookings; Availability; Marketplace Console; Suppliers; Finance; Team; Inbox; Settings | Account; Venue workspace; Billing | Venue workspace; venue; space; booking; listing | Complete | Navigation Connected | Shell responsive layout | §5.0.2, §5.0.4 |
| Supplier Solo | Owner, Finance, Collaborator | Home; Jobs; RFQs; Quotes; Availability; Marketplace Console; Earnings; Inbox; Settings | Account; Supplier profile; Billing | Supplier workspace/profile; quote; listing | Complete | Navigation Connected | Shell responsive layout | §5.0.2, §5.0.4 |
| Supplier Agency | Owner, Manager, Member, Finance | Supplier Solo menu plus Team | Account; Agency workspace; Billing | Supplier workspace/profile; invite; roster | Complete | Navigation Connected | Shell responsive layout | §5.0.2a |
| Consumer / Buyer | Buyer, ticket holder | Discover; My Tickets; Orders; Saved & Following; Account | Buyer account | Customer onboarding; checkout | Shell Created / gap for Saved | Partial | Verify | §5.0.2a, §5.4 |
| Affiliate | Applicant, approved affiliate, finance reviewer | Dashboard; Links; Campaigns & Assets; Clicks & Conversions; Payouts; Tax & Profile; Support | Affiliate profile/tax | Affiliate apply/onboarding | Partial | Partial | Verify | §5.0.2a |
| Platform Admin | Platform Admin, Support, Finance, Trust & Safety | Admin overview; customer, revenue, operations and governance groups | Platform settings | Hardened admin login | Shell Created | Navigation Connected (grouping pending) | Verify | §8 |
| Client portal | Invited client | Event Home; Timeline; Approvals; Documents; Invoices; Messages | Portal preferences | Planner portal invite | Shell Created | Partial | Verify | §5.0.2a, §7 |
| Venue client portal | Invited booking client | Booking Home; BEO; Schedule; F&B; Documents; Invoices; Messages | Portal preferences | Venue portal invite | Shell Created | Partial | Verify | §5.0.2a, §7 |
| Supplier portal | Invited supplier | Job/RFQ; Quote; Schedule; Evidence; Documents; Messages; Payment | Portal profile | Supplier portal invite | Not Started | Not Started | — | §5.0.2a, §7 |

## Organizer section and tab coverage

| Section | Route | Required first-level tabs | Detail/profile shell | Wizard | Shell status | Navigation | Plan source |
|---|---|---|---|---|---|---|---|
| Home | `/event-manager/home` | Overview | — | Quick create | Shell Created | Navigation Connected | §5.0.3 |
| Calendar | `/event-manager/calendar` | Overview; agenda/day/week/month views | Context drawer | Availability/task/event | Shell Created | Navigation Connected | §5.0.3 |
| Sales | `/event-manager/leads` | Overview; Leads; Proposals; Forms; Analytics | Lead, Proposal, Form | Lead; Proposal; Form | Shell Created | Forms tab connected; Sales shell migration remains | §5.0.3, §5.0.6 |
| Events | `/event-manager/events` | Overview; Programmes; Templates | Event command centre | Event; clone/localise; programme | Shell Created | Navigation Connected | §5.0.3, §6 |
| Suppliers | `/event-manager/suppliers` | Overview; Directory; RFQs; Scorecards; Documents; Contracts; Availability | Supplier | Supplier; RFQ; supplier invite | Shell Created | Partial—RFQ migration | §5.0.3, §5.0.6 |
| Venues | `/event-manager/venues` | Overview; Directory; Holds; Documents | Planner venue | Venue; hold/request | Shell Created | Navigation Connected | §5.0.3, §5.0.6 |
| Marketplace buyer | `/event-manager/marketplace` | Overview; Venues; Services; Requests; Saved | Listing/service/venue | Request quote/checkout | Shell Created | Partial—buyer flag | §5.0.3 |
| Tasks | `/event-manager/tasks` | Overview; Templates | Task | Task; template | Shell Created | Navigation Connected | §5.0.3, §5.0.6 |
| Finance | `/event-manager/finance` | Overview; Quotes; Invoices; Payments; Supplier Payments; Deposits; Expenses; Profit; Cashflow; Ticket Sales | Quote; Invoice; Deposit; Payment | Quote; Invoice; Deposit; Payment | Shell Created | Navigation Connected | §5.0.3, §5.0.6 |
| Inbox | `/event-manager/inbox` | Overview; Unread; Assigned; All | Thread | Compose | Shell Created | Navigation Connected | §5.0.3 |
| Automations | `/event-manager/automations` | Overview; My Automations; Recipes; Runs; Approvals; Errors; Integrations; Usage; AI Builder | Automation | Recipe; Builder; webhook | Shell Created | Navigation Connected | §5.0.3 |
| Team | `/event-manager/team` | Overview; Members; Workload; Availability; Staffing Requests; Find | Member | Invite; staffing request | Shell Created | Navigation Connected | §5.0.3, §5.0.6 |
| Settings | `/event-manager/settings` | Account; Workspace; Billing scope groups | Asset/template/event pack detail | Workspace; invite; asset; template | Shell Created | Navigation Connected | §5.0.5 |

## Event command-centre and pack coverage

| Event area | Route | Sub-tabs / expected contents | Shell status | Navigation | Plan source |
|---|---|---|---|---|---|
| Core | `/events/[eventId]/overview`, `/brief`, `/schedule`, `/tasks`, `/finance` | Overview, brief, run-sheet, tasks, finance | Shell Created | Navigation Connected | §6.1 |
| Delivery | `/suppliers`, `/staffing`, `/logistics`, `/documents-media`, `/comms` | Supplier delivery, crew, travel/logistics, files, communications | Shell Created | Navigation Connected | §6.1 |
| Experience | `/tickets`, `/guests`, `/floor-plan`, `/event-map`, `/check-in`, `/mood-board` | Tickets, attendee, seating, map, check-in, creative | Shell Created | Navigation Connected | §6.1 |
| Operations | `/expenses`, `/beo`, `/event-day`, `/risk-control`, `/hospitality`, `/production` | Expenses, BEO, live mode, safety, catering, virtual/production | Shell Created | Extensions directory connected | §6.1 |
| Growth | `/publish`, `/insights`, `/marketing`, `/fundraising`, `/activity`, `/export` | Public publishing, insights, campaigns, fundraising, activity, export | Shell Created | Extensions directory connected | §6.1 |
| Corporate pack | `/corporate` | Cost centres; POs; approvals; delegates; VIP; ROI | Shell Created | Extensions directory connected | §4.2 |
| Conference pack | `/conference` | Programme; sessions; speakers; exhibitors; sponsors; networking | Shell Created | Extensions directory connected | §4.2 |
| Celebration pack | `/celebration` | Couple; households; ceremony/reception; portal; related events | Shell Created | Extensions directory connected | §4.2 |
| Competition pack | `/competition` | Participants; teams; fixtures; results; route & safety | Shell Created | Extensions directory connected | §4.2 |
| Travel pack | `/travel-accommodation` | Travel, rooms, transfers, manifests, emergencies | Shell Created | Extensions directory connected | §4.2 |

## Portal, public and admin coverage

| Surface | Route | Required areas | Shell status | Navigation | Plan source |
|---|---|---|---|---|---|
| Client portal | `/portal/[token]` | Event, timeline, docs, approvals, invoices, messages | Shell Created | Partial | §7 |
| Venue portal | `/venue-portal/[token]` | Booking, BEO, F&B, documents, invoices, messages | Shell Created | Partial | §7 |
| Supplier portal | `/supplier-portal/[token]` | RFQ/job, quote, evidence, docs, messages, payment | Shell Created | Route-backed portal local navigation | §7 |
| Public discovery | `/discover`, `/e/[slug]/*` | Search, event detail, tickets, checkout, success | Shell Created | Navigation Connected | §9 |
| Buyer account | `/account/*` | Tickets, orders, saved, profile | Partial | Partial | §5.4 |
| Affiliate | `/affiliate/*` | Dashboard, links, conversion, payouts, tax | Partial | Partial | §5.0.2a |
| Admin | `/admin/*` | Customer, revenue, support, governance, operations, security | Shell Created | Navigation Connected | §8 |

## Shell completion backlog

| Priority | Item | Definition of shell complete | Status |
|---|---|---|---|
| P0 | Typed navigation registry migration | One registry feeds sidebar, breadcrumbs, tabs, quick-create and route smoke test | Not Started |
| P0 | Admin group shell | Current flat admin list becomes labeled groups with route metadata | Not Started |
| P0 | Sales and Suppliers section shells | Registered Overview-first sub-tabs and old-route active-state mapping | Not Started |
| P0 | Event pack shell routes | Every §4.2 pack has a route-backed visible event location and meaningful placeholder structure | Shell Created |
| P0 | Supplier portal shell | Dedicated portal layout and full local navigation with denied/expired states | Shell Created (access states pending) |
| P1 | Buyer and affiliate navigation shells | All planned primary areas visible with deterministic development fixtures | Not Started |
| P1 | Route smoke test | Every registry item and route-backed tab resolves; no duplicate identifiers | Not Started |
| P1 | Responsive shell QA | Desktop, tablet and mobile navigation checks for all persona/portal shells | Not Started |
