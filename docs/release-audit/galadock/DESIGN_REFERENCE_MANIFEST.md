# Design reference manifest (W00, 2026-10-28)

Every image under `Designs/**` (236 on disk) plus the 6 `Designs/Public Pages/*.png` files deleted from disk but still in `HEAD` (sizes via `git show`). Mappings reuse `src/lib/workspace/design-map.ts`, `docs/phase3/design-register.md`, `docs/p2-design-map.md`, `docs/pwa/design-reference-map.md` and `src/lib/routes.ts`; images inspected where those disagreed. Duplicates by perceptual hash (dHash, ≤40 bits). "Route exists" checked against `baseline/ROUTES.csv`.

| Folder | Images |
|---|---|
| customer & Organizer workspace (COW) | 85 |
| PWA | 61 |
| Provider Workspace (PROV) | 35 |
| Admin Workspace (ADM) | 18 |
| auth & onboarding (AUTH) | 18 |
| Public Pages/Landing Page (LAND) | 7 (new, untracked) |
| Public Pages (PUB) | 6 (missing from disk, HEAD only) |
| ticket checkout (CHK) | 5 |
| platform shell (SHELL) | 4 |
| Portals (PORT) | 3 |
| **Total** | **242** |

Exact duplicates: `9EC8147F…jpeg` = `9EC8147F…(1).jpeg` = `platform shell/customer shell.png`; `Create Marketplace Request Dashboard (1)` = `Create Marketplace Request Dashboard`; `Neon Nights Supplier Marketplace Dashboard (1)` = `Neon Nights Supplier Marketplace Dashboard`; `platform shell/provider shell` = `Provider Workspace/provider shell(1)`. Near-duplicate: `GalaDock Event Planning Dashboard` / `Gala·Dock Event Planning Dashboard`.

## Manifest

| # | Dir | File | px | Route | State / ID | Conf | Dup / note | Route exists |
|---|---|---|---|---|---|---|---|---|
| 1 | ADM | Commerce Operations Dashboard | 1536×1024 | /admin/commerce | AD-010 (+/payouts) | high |  | yes |
| 2 | ADM | Gala Dock Admin Analytics Dashboard | 1536×1024 | /admin/analytics | AD-017 alt tab | high | alt of AD-017 | yes |
| 3 | ADM | Gala Dock Marketplace Dashboard | 1536×1024 | /admin/marketplace | AD-007 | high |  | yes |
| 4 | ADM | Gala Dock Partners Dashboard | 1536×1024 | /admin/partners | AD-015 | high |  | yes |
| 5 | ADM | Gala Dock Platform Settings Dashboard | 1536×1024 | /admin/settings | AD-018 | high |  | yes |
| 6 | ADM | Gala Dock Support Dashboard | 1536×1024 | /admin/support | AD-013 | high |  | yes |
| 7 | ADM | Gala Dock Transaction Overview Dashboard | 1536×1024 | /admin/commerce/transactions/[id] | AD-011 | high |  | yes |
| 8 | ADM | Gala Dock User Profile Dashboard | 1536×1024 | /admin/users/[id] | AD-003 | high |  | yes |
| 9 | ADM | Gala Dock Workspace Dashboard | 1536×1024 | /admin/workspaces/[id] | AD-005 | high |  | yes |
| 10 | ADM | Gala Dock Workspace Management Dashboard | 1536×1024 | /admin/workspaces | AD-004 | high |  | yes |
| 11 | ADM | GalaDock Events Admin Dashboard | 1536×1024 | /admin/events | AD-006 | high |  | yes |
| 12 | ADM | Gala·Dock Agent Integrations Dashboard | 1536×1024 | /admin/agent-integrations | AD-016 | high |  | yes |
| 13 | ADM | Gala·Dock Analytics Dashboard | 1536×1024 | /admin/analytics | AD-017 | high |  | yes |
| 14 | ADM | Gala·Dock Ticketing Dashboard | 1536×1024 | /admin/tickets | AD-009 | high |  | yes |
| 15 | ADM | Gala·Dock Trust & Safety Dashboard | 1536×1024 | /admin/trust | AD-012 | high |  | yes |
| 16 | ADM | Gala·Dock User Management Dashboard | 1536×1024 | /admin/users | AD-002 | high |  | yes |
| 17 | ADM | Riverside Arena Marketplace Review Dashboard | 1536×1024 | /admin/marketplace/listings/[id] | AD-008 | high |  | yes |
| 18 | ADM | Support Case Refund Dashboard | 1536×1024 | /admin/support/[id] | AD-014 refund case | high |  | yes |
| 19 | AUTH | Gala Dock Event Onboarding Dashboard | 1536×1024 | /onboarding | ONB-001 choose experience | high |  | yes |
| 20 | AUTH | Gala Dock Event Setup Dashboard | 1536×1024 | /onboarding/organizer?step=2 | ONB-ORG-02 | high |  | yes |
| 21 | AUTH | Gala Dock Organizer Workspace Setup | 1536×1024 | /onboarding/organizer?step=1 | ONB-ORG-01 | high |  | yes |
| 22 | AUTH | Gala Dock Preferences Setup | 1536×1024 | /onboarding/customer?step=1 | ONB-CU-01 | high |  | yes |
| 23 | AUTH | Gala Dock Provider Setup Dashboard(1) | 1536×1024 | /onboarding/provider?step=4 | ONB-PROV-04 | high |  | yes |
| 24 | AUTH | Gala Dock Provider Setup Dashboard | 1536×1024 | /onboarding/provider?step=1 | ONB-PROV-01 | high |  | yes |
| 25 | AUTH | Gala Dock Venue Setup Dashboard | 1536×1024 | /onboarding/provider?step=2 | ONB-PROV-02 | high |  | yes |
| 26 | AUTH | Gala-Dock Provider Setup Dashboard | 1536×1024 | /onboarding/provider?step=3 | ONB-PROV-03 | high |  | yes |
| 27 | AUTH | GalaDock Organizer Setup Dashboard | 1536×1024 | /onboarding/organizer?step=4 | ONB-ORG-04 | high |  | yes |
| 28 | AUTH | Gala·Dock Organizer Setup Dashboard | 1536×1024 | /onboarding/organizer?step=3 | ONB-ORG-03 | high |  | yes |
| 29 | AUTH | image-gen-1(10) | 1448×1086 | /login | AUTH-001 | high | same auth template family | yes |
| 30 | AUTH | image-gen-2(10) | 1448×1086 | /register | AUTH-002 | high | same auth template family | yes |
| 31 | AUTH | image-gen-3(10) | 1448×1086 | /verify-email | AUTH-003 | high | same auth template family | yes |
| 32 | AUTH | image-gen-4(10) | 1448×1086 | /forgot-password | AUTH-004 | high | same auth template family | yes |
| 33 | AUTH | image-gen-5(10) | 1448×1086 | /reset-password | AUTH-005 | high | same auth template family | yes |
| 34 | AUTH | image-gen-6(10) | 1448×1086 | /mfa | AUTH-006 | high | same auth template family | yes |
| 35 | AUTH | image-gen-7(9) | 1448×1086 | /invite/[token] | AUTH-007 | high | same auth template family | yes |
| 36 | AUTH | image-gen-8(7) | 1448×1086 | /access | AUTH-008 | high | same auth template family | yes |
| 37 | COW | 9EC8147F-95F6-48FB-8011-A6A3C9D3D0B9(1).jpg | 1448×1086 | /home | customer home | high | exact dup of 9EC8147F…jpeg and platform shell/customer shell.png | yes |
| 38 | COW | 9EC8147F-95F6-48FB-8011-A6A3C9D3D0B9.jpg | 1448×1086 | /home | customer home | high | = customer shell.png | yes |
| 39 | COW | Create Marketplace Request Dashboard (1) | 1536×1024 | /organizer/marketplace/requests/new | ORG-W04-01 | high | exact dup | yes |
| 40 | COW | Create Marketplace Request Dashboard | 1536×1024 | /organizer/marketplace/requests/new | ORG-W04-01 | high |  | yes |
| 41 | COW | Gala Agent Event Operations Dashboard | 1536×1024 | /organizer/agent | ORG-020 (desktop) | high |  | yes |
| 42 | COW | Gala Dock Event Discovery Dashboard | 1536×1024 | /discover | CU-001 | high |  | yes |
| 43 | COW | Gala Dock Event Economics Dashboard | 1536×1024 | /organizer/events/new?step=3 | ORG-W01-03 | med |  | yes |
| 44 | COW | Gala Dock Event Finance Dashboard | 1536×1024 | /organizer/money | ORG-018 | high |  | yes |
| 45 | COW | Gala Dock Event Planning Dashboard | 1536×1024 | /plan?step=3 | CU-W01-03 budget & priorities | high |  | yes |
| 46 | COW | Gala Dock Event Promotion Dashboard | 1536×1024 | /organizer/tickets | ORG-011 hub | high |  | yes |
| 47 | COW | Gala Dock Festival Proposal Dashboard | 1536×1024 | /organizer/sales/proposals/[id] | ORG-007 | med |  | yes |
| 48 | COW | Gala Dock Festival Sales Dashboard | 1536×1024 | /organizer/sales | ORG-005 alt | med | variant of Sales Dashboard | yes |
| 49 | COW | Gala Dock Invoice Dashboard | 1536×1024 | /organizer/money/invoices/[id] | ORG-019 | high |  | yes |
| 50 | COW | Gala Dock Marketplace Quote Comparison | 1536×1024 | /organizer/marketplace/requests/[id] | ORG-009/010 quote comparison | high |  | yes |
| 51 | COW | Gala Dock Promotion Review Dashboard | 1536×1024 | /organizer/promotions/new | ORG-W05-03 review | high |  | yes |
| 52 | COW | Gala Dock Proposal Dashboard | 1536×1024 | /organizer/proposals/new | ORG-W02-01 | high |  | yes |
| 53 | COW | Gala Dock Proposal Review Dashboard | 1536×1024 | /organizer/proposals/new | ORG-W02-03 | high |  | yes |
| 54 | COW | Gala Dock Sales Dashboard | 1536×1024 | /organizer/sales | ORG-005 | high |  | yes |
| 55 | COW | Gala Dock Services Marketplace Dashboard | 1536×1024 | /organizer/marketplace | ORG-008 services tab | med | variant family (5 marketplace boards) | yes |
| 56 | COW | Gala Dock Team Dashboard | 1536×1024 | /organizer/team | ORG-016 | high |  | yes |
| 57 | COW | Gala Dock Ticket Setup Dashboard | 1536×1024 | /organizer/events/[id]/tickets/setup | ORG-W03 rules & publish | med |  | yes |
| 58 | COW | Gala Dock Venue Booking Dashboard | 1536×1024 | /account/events/[id]/book | CU-W02-01 | high |  | yes |
| 59 | COW | Gala Dock Wedding Booking Request | 1536×1024 | /account/events/[id]/book | CU-W02 confirmation | high |  | yes |
| 60 | COW | Gala Dock Wedding Planning Dashboard | 1536×1024 | /account/events/[id]/plan | CU-005 alt | med |  | yes |
| 61 | COW | Gala Dock Workspace Settings Dashboard | 1536×1024 | /organizer/settings | ORG-021 | high |  | yes |
| 62 | COW | Gala-Dock Festival Template Dashboard | 1536×1024 | /organizer/events/[id]/template | ORG-W07-02 | high |  | yes |
| 63 | COW | GalaDock Event Creation Dashboard | 1536×1024 | /organizer/events/new?step=2 | ORG-W01-02 | med |  | yes |
| 64 | COW | GalaDock Event Planning Dashboard | 1536×1024 | /plan?step=2 | CU-W01-02 date & location | high | near-dup of Gala·Dock Event Planning Dashboard | yes |
| 65 | COW | GalaDock Event Planning Wizard | 1536×1024 | /plan?step=1 | CU-W01-01 occasion & goal | high |  | yes |
| 66 | COW | GalaDock Ticket Setup Dashboard | 1536×1024 | /organizer/events/[id]/tickets/setup | ORG-W03 tiers | med |  | yes |
| 67 | COW | GalaDock Wedding Event Planner Dashboard(1) | 1536×1024 | /plan?step=4 | CU-W01-04 Recommended Build (review your plan) | high | NOT a dup of the non-(1) file | yes |
| 68 | COW | GalaDock Wedding Event Planner Dashboard | 1536×1024 | /account/events/[id]/build | CU-004 build canvas | high |  | yes |
| 69 | COW | Gala·Dock Account Dashboard | 1536×1024 | /account | CU-013 | high |  | yes |
| 70 | COW | Gala·Dock April 2025 Event Calendar | 1536×1024 | /organizer/calendar | ORG-004 month | high |  | yes |
| 71 | COW | Gala·Dock Event Calendar Dashboard | 1536×1024 | /organizer/calendar | ORG-004 | high |  | yes |
| 72 | COW | Gala·Dock Event Command Centre | 1448×1086 | /organizer | ORG-001 | high |  | yes |
| 73 | COW | Gala·Dock Event Planning Dashboard | 1536×1024 | /plan?step=2 | CU-W01-02 | high | near-dup of GalaDock Event Planning Dashboard | yes |
| 74 | COW | Gala·Dock Event Portfolio Dashboard | 1536×1024 | /organizer/events | ORG-002 | high |  | yes |
| 75 | COW | Gala·Dock Event Setup Dashboard | 1536×1024 | /organizer/events/new?step=4 | ORG-W01-04 | med |  | yes |
| 76 | COW | Gala·Dock Guest Management Dashboard | 1536×1024 | /account/events/[id]/guests-tickets | CU-006 | high |  | yes |
| 77 | COW | Gala·Dock Invoice Creation Dashboard | 1536×1024 | /organizer/money/invoices/new | ORG-W06-01 | high |  | yes |
| 78 | COW | Gala·Dock Invoice Scheduling Dashboard | 1536×1024 | /organizer/money/invoices/new | ORG-W06-02 | high |  | yes |
| 79 | COW | Gala·Dock Reviews Dashboard | 1536×1024 | /account/reviews | CU-012 | high |  | yes |
| 80 | COW | Gala·Dock Saved Events Dashboard | 1536×1024 | /account/saved | CU-011 | high |  | yes |
| 81 | COW | Gala·Dock Services Marketplace Dashboard | 1536×1024 | /organizer/marketplace | ORG-008 services | med | variant family | yes |
| 82 | COW | Gala·Dock Team Profile Dashboard | 1536×1024 | /organizer/team/[id] | ORG-017 | high |  | yes |
| 83 | COW | Gala·Dock Ticket Dashboard | 1536×1024 | /account/tickets | CU-009 | high |  | yes |
| 84 | COW | Gala·Dock Ticket Setup Dashboard | 1536×1024 | /organizer/events/[id]/tickets/setup | ORG-W03 venue & capacity | med |  | yes |
| 85 | COW | Gala·Dock Ticket Setup Review | 1536×1024 | /account/events/[id]/tickets/setup | CU-W03-03 | high |  | yes |
| 86 | COW | Gala·Dock Venue Booking Dashboard | 1536×1024 | /account/events/[id]/book | CU-W02-02 | high |  | yes |
| 87 | COW | Gala·Dock Venue Marketplace Dashboard | 1536×1024 | /organizer/marketplace | ORG-008 venues | med | variant family | yes |
| 88 | COW | Gala·Dock Venues Marketplace Dashboard | 1536×1024 | /organizer/marketplace | ORG-008 venues | med | variant family | yes |
| 89 | COW | Gala·Dock Wedding Event Dashboard | 1536×1024 | /account/events/[id] | CU-003 | high |  | yes |
| 90 | COW | Gala·Dock Wedding Messaging Dashboard | 1536×1024 | /account/events/[id]/messages | CU-008 | high |  | yes |
| 91 | COW | Gala·Dock Wedding Money Dashboard | 1536×1024 | /account/events/[id]/money | CU-007 | high |  | yes |
| 92 | COW | Gala·Dock Wedding Planning Dashboard(1) | 1536×1024 | /account/events/[id]/plan | CU-005 | high | variant | yes |
| 93 | COW | Gala·Dock Wedding Planning Dashboard(2) | 1536×1024 | /account/events/[id]/plan | CU-005 | high | variant | yes |
| 94 | COW | Gala·Dock Wedding Planning Dashboard | 1536×1024 | /account/events/[id]/plan | CU-005 | high |  | yes |
| 95 | COW | Gala·Dock Wedding Ticket Setup Dashboard | 1536×1024 | /account/events/[id]/tickets/setup | CU-W03-01 | high |  | yes |
| 96 | COW | Marketplace Events UI Dashboard Mockup | 1536×1024 | /organizer/marketplace | ORG-008 card/list | low | component study | yes |
| 97 | COW | Marketplace UI Card and List Dashboard | 1536×1024 | /organizer/marketplace | ORG-008 card/list | low | component study | yes |
| 98 | COW | Modern Event Creation Wizard Dashboard | 1536×1024 | /organizer/events/new?step=1 | ORG-W01-01 | high |  | yes |
| 99 | COW | Modern Event Management Dashboard | 1536×1024 | /organizer/events | ORG-002 alt | med |  | yes |
| 100 | COW | Modern My Events Dashboard | 1536×1024 | /account/events | CU-002 | high |  | yes |
| 101 | COW | Neon Nights Festival Dashboard(1) | 1536×1024 | /organizer/events/[id] | ORG-003 alt tab | high | variant | yes |
| 102 | COW | Neon Nights Festival Dashboard | 1536×1024 | /organizer/events/[id] | ORG-003 | high |  | yes |
| 103 | COW | Neon Nights Festival Finance Dashboard | 1536×1024 | /organizer/events/[id] | ORG-003 money tab | high |  | yes |
| 104 | COW | Neon Nights Festival Operations Dashboard | 1536×1024 | /organizer/events/[id] | ORG-003 ops tab | high |  | yes |
| 105 | COW | Neon Nights Festival Page Editor | 1536×1024 | /organizer/events/[id]/page | ORG-012 | high |  | yes |
| 106 | COW | Neon Nights Festival Poster Builder | 1536×1024 | /organizer/events/[id]/media | ORG-015 | high |  | yes |
| 107 | COW | Neon Nights Festival Promotion Dashboard | 1536×1024 | /organizer/promotions/new | ORG-W05-02 | high |  | yes |
| 108 | COW | Neon Nights Festival Ticket Dashboard | 1222×1287 | /account/tickets/[id] | CU-010 | high |  | yes |
| 109 | COW | Neon Nights Festival Venue Map Builder | 1536×1024 | /organizer/events/[id]/map | ORG-013 | high |  | yes |
| 110 | COW | Neon Nights Promotion Dashboard | 1536×1024 | /organizer/events/[id]/promotion | ORG-014 | high |  | yes |
| 111 | COW | Neon Nights Promotion Dashboard2 | 1536×1024 | /organizer/promotions/new | ORG-W05-01 | high |  | yes |
| 112 | COW | Neon Nights Supplier Marketplace Dashboard (1) | 1536×1024 | /organizer/marketplace/requests/new | ORG-W04-02 | high | exact dup | yes |
| 113 | COW | Neon Nights Supplier Marketplace Dashboard | 1536×1024 | /organizer/marketplace/requests/new | ORG-W04-02 | high |  | yes |
| 114 | COW | Neon Nights Ticket Setup Dashboard(1) | 1536×1024 | /organizer/events/[id]/tickets/setup | ORG-W03 rules | med | variant | yes |
| 115 | COW | Neon Nights Ticket Setup Dashboard | 1536×1024 | /organizer/events/[id]/tickets/setup | ORG-W03 tiers | med |  | yes |
| 116 | COW | SaaS Proposal Builder_ Offer & Pricing | 1536×1024 | /organizer/proposals/new | ORG-W02-02 | high |  | yes |
| 117 | COW | Save Event as Template Dashboard | 1536×1024 | /organizer/events/[id]/template | ORG-W07-01 | high |  | yes |
| 118 | COW | Ticket Setup Dashboard_ Sales & Rules | 1536×1024 | /account/events/[id]/tickets/setup | CU-W03-02 | high |  | yes |
| 119 | COW | image-gen-1(20261009-171511) | 1448×1086 | /venues/[slug] | public venue profile | high |  | yes |
| 120 | COW | image-gen-2(20261009-171514) | 1448×1086 | /services/[slug] | public service profile | high |  | yes |
| 121 | COW | image-gen-3(20261009-171518) | 1448×1086 | /events/[slug] | public event page | high |  | yes |
| 122 | SHELL | customer shell | 1448×1086 | /home | customer shell | high | = 9EC8147F…jpeg | yes |
| 123 | SHELL | organizer team shell | 1448×1086 | /organizer/team | organizer shell | med | shell study | yes |
| 124 | SHELL | platform admin shell | 1448×1086 | /admin | AD-001 | high |  | yes |
| 125 | SHELL | provider shell | 1448×1086 | /provider | provider shell | high | exact dup of Provider Workspace/provider shell(1) | yes |
| 126 | PORT | Gala Dock Partner Performance Dashboard | 1536×1024 | /partner | PART-001 partner performance | med |  | yes |
| 127 | PORT | Neon Nights Festival Dashboard | 1536×1024 | /portal/[token] | PORT-001 event portal | low |  | yes |
| 128 | PORT | Neon Nights Promoter Dashboard | 1536×1024 | /promoter/[promoterId] | PROM-001 | med |  | yes |
| 129 | PROV | Create Package Dashboard UI | 1536×1024 | /provider/packages/new | PROV-W04 offer | high |  | yes |
| 130 | PROV | Create Venue Booking Dashboard | 1536×1024 | /provider/bookings/new?step=1 | PROV-W06-01 | high |  | yes |
| 131 | PROV | Gala Agent SaaS Dashboard | 1536×1024 | /provider/agent | PROV-016 | high |  | yes |
| 132 | PROV | Gala Dock Calendar Dashboard | 1536×1024 | /provider/calendar | PROV-007 | high |  | yes |
| 133 | PROV | Gala Dock DJ Service Dashboard | 1536×1024 | /provider/services/[id] | PROV-011 | high |  | yes |
| 134 | PROV | Gala Dock Opportunities Dashboard | 1536×1024 | /provider/opportunities | PROV-002 | high |  | yes |
| 135 | PROV | Gala Dock Package Creation Dashboard | 1536×1024 | /provider/packages/new?step=2 | PROV-W04 pricing & rules | high |  | yes |
| 136 | PROV | Gala Dock Pricing Dashboard | 1536×1024 | /provider/services/new?step=2 | PROV-W03-02 | high |  | yes |
| 137 | PROV | Gala Dock Service Setup Dashboard | 1536×1024 | /provider/services/new | PROV-W03-01 | high |  | yes |
| 138 | PROV | Gala Dock Space Availability Dashboard | 1536×1024 | /provider/venues/[id]/spaces/[spaceId]?tab=availability | PROV-010 availability | high |  | yes |
| 139 | PROV | Gala Dock Team Dashboard(1) | 1536×1024 | /provider/team | PROV-013 | high |  | yes |
| 140 | PROV | Gala Dock Venue Setup Dashboard(1) | 1536×1024 | /provider/venues/new?step=3 | PROV-W01-03 | high |  | yes |
| 141 | PROV | Gala Dock Venue Spaces Dashboard | 1536×1024 | /provider/venues/new?step=2 | PROV-W01-02 / PROV-009 spaces tab | high |  | yes |
| 142 | PROV | Gala Dock Workspace Settings Dashboard(1) | 1536×1024 | /provider/settings | PROV-017 | high |  | yes |
| 143 | PROV | GalaDock Venue Booking Dashboard | 1536×1024 | /provider/bookings/new?step=3 | PROV-W06-03 | high |  | yes |
| 144 | PROV | Gala·Dock Add Space Dashboard | 1536×1024 | /provider/venues/[id]/spaces/new | PROV-W02 | high |  | yes |
| 145 | PROV | Gala·Dock Bookings Dashboard | 1536×1024 | /provider/bookings | PROV-005 | high |  | yes |
| 146 | PROV | Gala·Dock Financial Dashboard | 1536×1024 | /provider/money | PROV-015 | high |  | yes |
| 147 | PROV | Gala·Dock Listings Dashboard | 1536×1024 | /provider/listings/[[...type]] | PROV-008 | high |  | yes |
| 148 | PROV | Gala·Dock Quote Review Dashboard | 1536×1024 | /provider/opportunities/[id]/quote?step=2 | PROV-W05-02 | high |  | yes |
| 149 | PROV | Gala·Dock Service Publishing Dashboard | 1536×1024 | /provider/services/new?step=3 | PROV-W03-03 | high |  | yes |
| 150 | PROV | Gala·Dock Venue Booking Dashboard(1) | 1536×1024 | /provider/bookings/new?step=2 | PROV-W06-02 | high |  | yes |
| 151 | PROV | Gala·Dock Venue Command Center | 1448×1086 | /provider | PROV-001 | high |  | yes |
| 152 | PROV | Gala·Dock Wedding Booking Dashboard | 1536×1024 | /provider/bookings/[id] | PROV-006 | high |  | yes |
| 153 | PROV | Gala·Dock Wedding Opportunity Dashboard | 1536×1024 | /provider/opportunities/[id] | PROV-003 | high |  | yes |
| 154 | PROV | Gala·Dock Wedding Package Dashboard | 1536×1024 | /provider/packages/[id] | PROV-012 | high |  | yes |
| 155 | PROV | Gala·Dock Wedding Quote Dashboard | 1536×1024 | /provider/quotes/[id] | PROV-004 | high |  | yes |
| 156 | PROV | Main Hall Venue Dashboard | 1536×1024 | /provider/venues/[id]/spaces/[spaceId] | PROV-010 | high |  | yes |
| 157 | PROV | Modern SaaS Event Operations Dashboard | 1448×1086 | /provider | PROV-001 alt | med | alt | yes |
| 158 | PROV | Modern Venue Setup Dashboard | 1536×1024 | /provider/venues/new?step=1 | PROV-W01-01 | high |  | yes |
| 159 | PROV | Priya Shah Team Dashboard Overview | 1536×1024 | /provider/team/[id] | PROV-014 | high |  | yes |
| 160 | PROV | Riverside Arena Venue Dashboard | 1536×1024 | /provider/venues/[id] | PROV-009 | high |  | yes |
| 161 | PROV | Riverside Arena Venue Setup Dashboard | 1536×1024 | /provider/venues/new?step=4 | PROV-W01-04 | high |  | yes |
| 162 | PROV | SaaS Quote Builder Dashboard | 1536×1024 | /provider/opportunities/[id]/quote?step=1 | PROV-W05-01 | high |  | yes |
| 163 | PROV | provider shell(1) | 1448×1086 | /provider | PROV-001 alt shell | med | alt | yes |
| 164 | LAND | Gala Agent Event Planning Dashboard | 1672×941 | / | PUB-001 §6 Gala Agent (owner: no AI on public, not built) | high | 1672×941 section slice | yes |
| 165 | LAND | Gala Dock Connected Event Platform | 1672×941 | / | PUB-001 §1 hero | high | 1672×941 section slice | yes |
| 166 | LAND | Gala Dock Event Marketplace Preview | 1672×941 | / | PUB-001 §5 connected marketplace | high | 1672×941 section slice | yes |
| 167 | LAND | Gala Dock Event Planning Dashboard (1) | 1672×941 | / | PUB-001 §4 for professionals | high | 1672×941 section slice | yes |
| 168 | LAND | Gala Dock Event Planning Dashboard | 1672×941 | / | PUB-001 §3 how it works | high | 1672×941 section slice | yes |
| 169 | LAND | Gala Dock Event Platform Landing Page | 1672×941 | / | PUB-001 §7 final CTA + footer | high | 1672×941 section slice | yes |
| 170 | LAND | Gala Dock_ Event Planning for Everyone | 1672×941 | / | PUB-001 §2 roles | high | 1672×941 section slice | yes |
| 171 | PWA | Bookings Dashboard Overview | 850×1850 | /provider/bookings | PROV-005 phone | high |  | yes |
| 172 | PWA | Emma’s Birthday Budget Overview | 794×1981 | /account/events/[id]/money | CU-007 phone | high |  | yes |
| 173 | PWA | Emma’s Birthday Event Builder | 794×1981 | /account/events/[id]/build | CU-004 phone | high |  | yes |
| 174 | PWA | Emma’s Birthday Party Messages | 794×1981 | /account/events/[id]/messages | CU-008 phone | high |  | yes |
| 175 | PWA | Emma’s Birthday Party Timeline | 794×1981 | /account/events/[id]/plan | CU-005 phone | high |  | yes |
| 176 | PWA | Emma’s Garden Party Dashboard | 794×1981 | /account/events/[id] | CU-003 phone | high |  | yes |
| 177 | PWA | Event Lead CRM Dashboard | 850×1850 | /organizer/sales/leads/[id] | ORG-006 phone | high |  | yes |
| 178 | PWA | Event Management Dashboard Mockup | 850×1850 | /organizer/events | ORG-002 phone | high |  | yes |
| 179 | PWA | Event Messages Dashboard Mockup | 794×1981 | /account/events/[id]/messages | CU-008 phone | med | alternate/montage | yes |
| 180 | PWA | Event Quote Comparison Dashboard | 850×1850 | /organizer/marketplace/requests/[id] | ORG-010 phone | high |  | yes |
| 181 | PWA | Event Ticketing and Promotion Dashboard | 850×1850 | /organizer/tickets-promotion | ORG-011 phone | high |  | yes |
| 182 | PWA | Event Venue Map Editor UI | 850×1850 | /organizer/events/[id]/map | ORG-013 phone | high |  | yes |
| 183 | PWA | Gala Agent Event Management Dashboard | 850×1850 | /organizer/agent | ORG-020 phone | high |  | yes |
| 184 | PWA | Gala Agent Mobile Dashboard | 850×1850 | /provider/agent | PROV-016 phone | high |  | yes |
| 185 | PWA | Gala Dock Event Command Center | 794×1981 | /organizer | ORG-001 phone | med | alternate/montage | yes |
| 186 | PWA | Gala Dock Event Discovery App | 850×1851 | /discover | CU-001 phone | med | alternate/montage | yes |
| 187 | PWA | Gala Dock Organizer Settings Dashboard | 850×1850 | /organizer/settings | ORG-021 phone | med | alternate/montage | yes |
| 188 | PWA | Gala·Dock Event Discovery App | 851×1848 | /discover | CU-001 phone | med | alternate/montage | yes |
| 189 | PWA | Grand Ballroom Venue Dashboard | 850×1850 | /provider/venues/[venue]/spaces/[id] | PROV-010 phone | high |  | yes |
| 190 | PWA | Guests & Tickets Event Dashboard | 794×1981 | /account/events/[id]/guests-tickets | CU-006 phone | high |  | yes |
| 191 | PWA | London Event Marketplace Discovery | 850×1850 | /organizer/marketplace | ORG-008 phone | high |  | yes |
| 192 | PWA | Maya Patel Crew Profile Dashboard | 850×1850 | /organizer/team/[id] | ORG-017 phone | high |  | yes |
| 193 | PWA | Mobile Event Reviews Dashboard | 794×1981 | /account/reviews | CU-012 phone | med | alternate/montage | yes |
| 194 | PWA | Mobile Finance Dashboard Overview | 850×1850 | /provider/money | PROV-015 phone | high |  | yes |
| 195 | PWA | Modern DJ Night Ticket Details UI | 794×1981 | /account/tickets/[id] | CU-010 phone | high |  | yes |
| 196 | PWA | Modern Event App Account Dashboard | 794×1981 | /account | CU-013 phone | high |  | yes |
| 197 | PWA | Modern Event Reviews App Interface | 1025×1535 | /account/reviews | CU-012 phone | high |  | yes |
| 198 | PWA | Modern Events Finance Dashboard | 850×1850 | /organizer/money | ORG-018 phone | high |  | yes |
| 199 | PWA | Modern My Tickets App Interface | 794×1981 | /account/tickets | CU-009 phone | high |  | yes |
| 200 | PWA | My Events Co Team Dashboard | 850×1850 | /organizer/team | ORG-016 phone | high |  | yes |
| 201 | PWA | My Events Planning Dashboard | 794×1981 | /account/events | CU-002 phone | high |  | yes |
| 202 | PWA | Organizer Command Centre Dashboard | 850×1850 | /organizer | ORG-001 phone | high |  | yes |
| 203 | PWA | Organizer Dashboard Overview | 794×1981 | /organizer | ORG-001 phone | med | alternate/montage | yes |
| 204 | PWA | Organizer Workspace Settings Dashboard(1) | 850×1850 | /organizer/settings | ORG-021 phone | med | alternate/montage | yes |
| 205 | PWA | Organizer Workspace Settings Dashboard | 850×1850 | /organizer/settings | ORG-021 phone | high |  | yes |
| 206 | PWA | Paid Invoice Dashboard for Summer Garden Party | 850×1850 | /organizer/money/invoices/[id] | ORG-019 phone | high |  | yes |
| 207 | PWA | Pastel Week Calendar Dashboard | 850×1850 | /organizer/calendar?view=week | ORG-004 phone | high |  | yes |
| 208 | PWA | Premium Event Discovery App Mockup | 794×1981 | /discover | CU-001 phone | high |  | yes |
| 209 | PWA | Promotion & Distribution Dashboard | 850×1850 | /organizer/events/[id]/promotion | ORG-014 phone | high |  | yes |
| 210 | PWA | Provider Calendar Week View | 850×1850 | /provider/calendar?view=week | PROV-007 phone | high |  | yes |
| 211 | PWA | Provider Command Centre Dashboard | 850×1850 | /provider | PROV-001 phone | high |  | yes |
| 212 | PWA | Riverside Venue Listings Dashboard | 850×1850 | /provider/listings | PROV-008 phone | high |  | NO |
| 213 | PWA | Riverside Venue Management Dashboard | 850×1850 | /provider/venues/[id] | PROV-009 phone | high |  | yes |
| 214 | PWA | Riverside Venue Opportunities Dashboard | 850×1850 | /provider/opportunities | PROV-002 phone | high |  | yes |
| 215 | PWA | Riverside Venue Provider Dashboard | 850×1850 | /provider | PROV-001 phone | med | alternate/montage | yes |
| 216 | PWA | Riverside Venue Quote Dashboard | 850×1850 | /provider/quotes/[id] | PROV-004 phone | high |  | yes |
| 217 | PWA | Riverside Venue Settings Dashboard | 850×1850 | /provider/settings | PROV-017 phone | high |  | yes |
| 218 | PWA | Riverside Venue Team Dashboard | 850×1850 | /provider/team | PROV-013 phone | high |  | yes |
| 219 | PWA | Riverside Wedding Booking Dashboard | 850×1850 | /provider/bookings/[id] | PROV-006 phone | high |  | yes |
| 220 | PWA | Riverside Wedding Venue Booking App | 850×1850 | /provider/opportunities/[id] | PROV-003 phone | high |  | yes |
| 221 | PWA | Sales Pipeline Dashboard Mockup | 850×1850 | /organizer/sales | ORG-005 phone | high |  | yes |
| 222 | PWA | Sarah Mitchell Team Profile Dashboard | 850×1850 | /provider/team/[id] | PROV-014 phone | high |  | yes |
| 223 | PWA | Saved Events, Venues & Services | 794×1981 | /account/saved | CU-011 phone | high |  | yes |
| 224 | PWA | Summer Garden Party CRM Overview | 850×1850 | /organizer/sales/leads/[id] | ORG-006 phone | med | alternate/montage | yes |
| 225 | PWA | Summer Garden Party Creator Dashboard | 850×1850 | /organizer/events/[id]/media | ORG-015 phone | high |  | yes |
| 226 | PWA | Summer Garden Party Dashboard | 850×1850 | /organizer/events/[id] | ORG-003 phone | high |  | yes |
| 227 | PWA | Summer Garden Party Event Editor | 850×1850 | /organizer/events/[id]/page | ORG-012 phone | high |  | yes |
| 228 | PWA | Summer Garden Party Proposal Dashboard | 850×1850 | /organizer/sales/proposals/[id] | ORG-007 phone | high |  | yes |
| 229 | PWA | The Garden Rooms Venue Listing | 850×1850 | /organizer/marketplace/venue/[id] | ORG-009 phone | high |  | yes |
| 230 | PWA | Wedding DJ Provider Dashboard | 850×1850 | /provider/services/[id] | PROV-011 phone | high |  | yes |
| 231 | PWA | Wedding Package Management Dashboard | 850×1850 | /provider/packages/[id] | PROV-012 phone | high |  | yes |
| 232 | CHK | Event Checkout Attendee Details | 1536×1024 | /checkout/[event] | BUY-W01-02 attendee | high |  | yes |
| 233 | CHK | Gala Dock Ticket Resale Review | 1536×1024 | /account/tickets/[id]/resale?step=2 | BUY-W02-02 | high |  | yes |
| 234 | CHK | Gala·Dock After Party Checkout | 1536×1024 | /checkout/[event] | BUY-W01-01 tickets | med |  | yes |
| 235 | CHK | Gala·Dock Pay & Confirm Checkout | 1536×1024 | /checkout/[event] | BUY-W01-03 pay | high |  | yes |
| 236 | CHK | Gala·Dock Ticket Resale Dashboard | 1536×1024 | /account/tickets/[id]/resale?step=1 | BUY-W02-01 | high |  | yes |
| 237 | PUB | Gala Dock Event Marketplace Homepage | 724×2172 | / | PUB-001 old homepage (superseded by Landing Page/) | high | MISSING FROM DISK (in HEAD only) | yes |
| 238 | PUB | Gala·Dock Elite Sound Events Page | 809×1944 | /services/[slug] | PUB service profile | high | MISSING FROM DISK (in HEAD only) | yes |
| 239 | PUB | Gala·Dock Neon Nights Festival 2026 | 809×1942 | /events/[slug] | PUB event page | high | MISSING FROM DISK (in HEAD only) | yes |
| 240 | PUB | Gala·Dock Riverside Arena Venue Page | 809×1944 | /venues/[slug] | PUB venue page | high | MISSING FROM DISK (in HEAD only) | yes |
| 241 | PUB | London Events Discovery Marketplace | 809×1944 | /events/london | PUB location discovery | high | MISSING FROM DISK (in HEAD only) | NO (no public location page) |
| 242 | PUB | Neon Events Organizer Profile | 809×1944 | /organizers/[slug] | PUB organizer profile | high | MISSING FROM DISK (in HEAD only) | yes |

COUNTS Counter({'COW': 85, 'PWA': 61, 'PROV': 35, 'ADM': 18, 'AUTH': 18, 'LAND': 7, 'PUB': 6, 'CHK': 5, 'SHELL': 4, 'PORT': 3}) total 242
UNMAPPED []
BLOCKED
admin 14 /admin/agent-integrations/credits, /admin/commerce/payouts, /admin/commerce/vat, /admin/conversations, /admin/conversations/[grant], /admin/conversations/request, /admin/disputes, /admin/health, /admin/login, /admin/maintenance, /admin/support/privacy, /admin/tickets/force-majeure, /admin/trust/[id], /admin/trust/disputes
affiliate 1 /promoter
customer 12 /account/disputes/[id], /account/events/[id]/bookings/[item], /account/events/[id]/bookings/[item]/catering, /account/events/[id]/scan, /account/help, /account/help/[slug], /account/inbox, /account/tickets/[id]/print, /checkout/[event]/confirmation, /messages/[id], /studio/[id], /tickets/accept/[token]
organizer 16 /organizer/agent/[section], /organizer/agent/policy, /organizer/agent/runs/[id], /organizer/disputes/[id], /organizer/events/[id]/live, /organizer/events/[id]/promotion/new, /organizer/events/[id]/scan, /organizer/events/[id]/virtual, /organizer/help, /organizer/help/[slug], /organizer/inbox, /organizer/marketplace/bookings/[id], /organizer/marketplace/bookings/[id]/catering, /organizer/marketplace/emergency, /organizer/marketplace/emergency/[id], /organizer/media
portal 4 /pay/[token], /payments/[ref], /proposal/[token], /r/[code]/consent
provider 17 /provider/agent/[section], /provider/agent/policy, /provider/agent/runs/[id], /provider/beo/[id], /provider/disputes/[id], /provider/emergency, /provider/emergency/[id], /provider/help, /provider/help/[slug], /provider/inbox, /provider/media, /provider/menus, /provider/menus/[id], /provider/messages/[id], /provider/money/statement, /provider/quotes/[id]/print, /provider/search
public 9 /[...slug], /cookies, /data-retention, /help, /help/[slug], /maintenance, /privacy, /terms, /ticket-terms

## Reference-blocked routes (73 of 180 page routes have no image)

- **admin (14):** /admin/agent-integrations/credits, /admin/commerce/payouts, /admin/commerce/vat, /admin/conversations, /admin/conversations/[grant], /admin/conversations/request, /admin/disputes, /admin/health, /admin/login, /admin/maintenance, /admin/support/privacy, /admin/tickets/force-majeure, /admin/trust/[id], /admin/trust/disputes (payouts and trust/disputes inherit AD-010 / AD-012 per the register).
- **affiliate (1):** /promoter.
- **customer (12):** /account/disputes/[id], /account/events/[id]/bookings/[item], …/bookings/[item]/catering, /account/events/[id]/scan, /account/help, /account/help/[slug], /account/inbox, /account/tickets/[id]/print, /checkout/[event]/confirmation, /messages/[id], /studio/[id], /tickets/accept/[token].
- **organizer (16):** /organizer/agent/[section], /organizer/agent/policy, /organizer/agent/runs/[id], /organizer/disputes/[id], /organizer/events/[id]/live, …/promotion/new, …/scan, …/virtual, /organizer/help, /organizer/help/[slug], /organizer/inbox, /organizer/marketplace/bookings/[id], …/catering, /organizer/marketplace/emergency, …/emergency/[id], /organizer/media.
- **portal (4):** /pay/[token], /payments/[ref], /proposal/[token], /r/[code]/consent.
- **provider (17):** /provider/agent/[section], /provider/agent/policy, /provider/agent/runs/[id], /provider/beo/[id], /provider/disputes/[id], /provider/emergency, /provider/emergency/[id], /provider/help, /provider/help/[slug], /provider/inbox, /provider/media, /provider/menus, /provider/menus/[id], /provider/messages/[id], /provider/money/statement, /provider/quotes/[id]/print, /provider/search.
- **public (9):** /help, /help/[slug], /terms, /privacy, /cookies, /ticket-terms, /data-retention, /maintenance, /[...slug].

## References with no route

- #241 London Events Discovery Marketplace (`/events/london`): no public signed-out discovery/location page.
- Landing navigation: Solutions and Pricing now anchor on `/`; Developers → `/help/developers-api`; About, Careers, Blog, Status have no pages; newsletter has no backend; social links have no URLs.
- #164 Gala Agent landing section: not built (no AI on public pages).
- The six old `Public Pages/*.png` were deleted from disk but `src/lib/routes.ts` publicRoutes still points to them. Treated as superseded by `Landing Page/` for `/`, still the reference for the profile pages.

## Plan wizard step 4

Mapping is correct: `GalaDock Wedding Event Planner Dashboard(1).png` (#67) is wizard step 4 "Recommended Build"; the file without "(1)" (#68) is the build canvas CU-004. Open conflict: #65 shows 5 steps (Occasion, Date & Location, Guests & Size, Services & Extras, Review & Create) and #67 shows 6 (adds Budget & Priorities, Recommended Build) — owner decision needed.
