# Phase 2 design → route map

Source: `Designs/customer & Organizer workspace/` (85 images). Status: ✅ built · 🔨 in progress · ⬜ not built.

## Customer (top bar shell)
| Screen | Design(s) | Route | Status |
|---|---|---|---|
| Home (signed-in) | 9EC8147F…jpeg (+ (1)) | /account | ⬜ |
| CU-001 Discover | Gala Dock Event Discovery Dashboard | /discover | ✅ |
| Public event page | image-gen-3 | /events/[slug] | ⬜ |
| Listing detail (venue/service) | image-gen-1, image-gen-2 (customer variant) | /discover/[kind]/[id] | ⬜ |
| CU-002 My Events | Modern My Events Dashboard | /account/events | ✅ |
| CU-003 Event profile | Gala·Dock Wedding Event Dashboard, GalaDock Wedding Planning Dashboard | /account/events/[id] | ✅ |
| CU-004 Build canvas | GalaDock Wedding Event Planner Dashboard | /account/events/[id]/build | ✅ |
| CU-005 Plan | Gala·Dock Wedding Planning Dashboard (1)(2), Gala Dock Wedding Planning Dashboard | /account/events/[id]/plan | ✅ |
| CU-006 Guests & Tickets | Gala·Dock Guest Management Dashboard | …/guests-tickets | ✅ |
| CU-007 Money | Gala·Dock Wedding Money Dashboard | …/money | ✅ |
| CU-008 Messages | Gala·Dock Wedding Messaging Dashboard | …/messages | ✅ |
| CU-009 My Tickets | Gala·Dock Ticket Dashboard | /account/tickets | ⬜ |
| CU-010 Ticket detail | Neon Nights Festival Ticket Dashboard | /account/tickets/[id] | ⬜ |
| CU-011 Saved | Gala·Dock Saved Events Dashboard | /account/saved | ⬜ |
| CU-012 Reviews | Gala·Dock Reviews Dashboard | /account/reviews | ⬜ |
| CU-013 Account | GalaDock Account Dashboard | /account/settings | ⬜ |
| CU-W01 Plan an Event (4) | GalaDock Event Planning Wizard · GalaDock Event Planning Dashboard · Gala Dock Event Planning Dashboard · GalaDock Wedding Event Planner Dashboard(1) | /plan?step=1..4 | ⬜ |
| CU-W02 Booking request (2 + confirmation) | Gala Dock Venue Booking Dashboard / Gala·Dock Venue Booking Dashboard · Gala Dock Wedding Booking Request | /account/events/[id]/book?item=&step=1..3 | 🔨 |
| CU-W03 Ticket setup (3) | Gala·Dock Wedding Ticket Setup Dashboard · Ticket Setup Dashboard_ Sales & Rules · Gala·Dock Ticket Setup Review | /account/events/[id]/tickets/setup?step=1..3 | ⬜ |

## Organizer (sidebar shell)
| Screen | Design(s) | Route | Status |
|---|---|---|---|
| ORG-001 Command Centre | Gala·Dock Event Command Centre | /organizer | ✅ |
| ORG-002 Events | Gala·Dock Event Portfolio, Modern Event Management | /organizer/events | ✅ |
| ORG-003 Event (overview/plan/sell/ops/money) | Neon Nights Festival Dashboard (+1), Gala·Dock Event Planning, Neon Finance, Neon Operations | /organizer/events/[id] | ✅ |
| ORG-006 Calendar | Gala·Dock Event Calendar, April 2025 Event Calendar | /organizer/calendar | ✅ |
| ORG-007 Sales | Gala Dock Sales Dashboard, Festival Sales, Festival Proposal | /organizer/sales… | ✅ |
| ORG-008 Marketplace | Services/Venues Marketplace (×5), image-gen-1/2, Marketplace UI cards | /organizer/marketplace… | ✅ |
| ORG-009 Request / quote comparison | Gala Dock Marketplace Quote Comparison | /organizer/marketplace/requests/[id] | ✅ |
| ORG-011 Tickets & Promotion hub | Gala Dock Event Promotion Dashboard | /organizer/tickets | ⬜ |
| ORG-012 Public page editor | Neon Nights Festival Page Editor | /organizer/events/[id]/page | ⬜ |
| ORG-013 Venue map builder | Neon Nights Festival Venue Map Builder | /organizer/events/[id]/map | ⬜ |
| ORG-014 Promotion | Neon Nights Promotion Dashboard | /organizer/events/[id]/promotion | ⬜ |
| ORG-015 Poster / media builder | Neon Nights Festival Poster Builder | /organizer/events/[id]/media | ⬜ |
| ORG-016 Team | Gala Dock Team Dashboard | /organizer/team | ⬜ |
| ORG-017 Team profile | Gala·Dock Team Profile Dashboard | /organizer/team/[id] | ⬜ |
| ORG-018 Money | Gala Dock Event Finance Dashboard | /organizer/money | ⬜ |
| ORG-019 Invoice | Gala Dock Invoice Dashboard | /organizer/money/invoices/[id] | ⬜ |
| ORG-020 Gala Agent | Gala Agent Event Operations Dashboard | /organizer/agent | ⬜ |
| ORG-021 Settings | Gala Dock Workspace Settings Dashboard | /organizer/settings | ⬜ |
| W01 Create event (4) | Modern Event Creation Wizard · GalaDock Event Creation · Gala Dock Event Economics · Gala·Dock Event Setup | /organizer/events/new?step=1..4 | ⬜ |
| W02 Proposal (3) | Gala Dock Proposal · SaaS Proposal Builder · Proposal Review | /organizer/proposals/new | ✅ |
| W03 Ticket setup (3) | GalaDock/Neon Ticket Setup (tiers) · Gala·Dock Ticket Setup (venue & capacity) · Gala Dock Ticket Setup / Neon (1) (rules & publish) | /organizer/events/[id]/tickets/setup | ⬜ |
| W04 Marketplace request (2) | Create Marketplace Request (×2), Neon Supplier Marketplace (×2) | /organizer/marketplace/requests/new | ✅ |
| W05 Promotion (3) | Neon Nights Promotion Dashboard2 · Neon Nights Festival Promotion · Gala Dock Promotion Review | /organizer/promotions/new | ⬜ |
| W06 Invoice (2) | Gala·Dock Invoice Creation · Gala·Dock Invoice Scheduling | /organizer/money/invoices/new | ⬜ |
| W07 Template (2) | Save Event as Template · Gala-Dock Festival Template | /organizer/events/[id]/template | ⬜ |
