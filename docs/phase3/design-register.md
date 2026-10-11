# Phase 3 design register — Provider workspace & Platform Admin

Each design file maps to exactly one screen (or one tab/step of a screen). The **canonical** reference is the one used for
the visual gate (`scripts/ws-visual.mjs`). "Alt" files are alternate compositions of the same screen. They inform content,
but they are not measured.

Viewport: 1536×1024 unless noted. Provider and Admin are two separate products: different guards, shells, navigation,
sign-in entry points (`/login` → Provider; `/admin/login` → staff + MFA), and data permissions.

## Provider workspace (`/provider`, guard: active Provider workspace membership)

| ID | Route | Canonical design | Alt / tab designs | Group |
|---|---|---|---|---|
| PROV-001 Home | `/provider` | Gala·Dock Venue Command Center (1448×1086) | provider shell(1), Modern SaaS Event Operations Dashboard (both 1448×1086) | A |
| PROV-002 Opportunities | `/provider/opportunities` | Gala Dock Opportunities Dashboard | — | A |
| PROV-003 Opportunity | `/provider/opportunities/[id]` | Gala·Dock Wedding Opportunity Dashboard | — | A |
| PROV-004 Quote | `/provider/quotes/[id]` | Gala·Dock Wedding Quote Dashboard | — | A |
| PROV-W05 s1 Quote scope & price | `/provider/opportunities/[id]/quote?step=1` | SaaS Quote Builder Dashboard | — | A |
| PROV-W05 s2 Review & send | `/provider/opportunities/[id]/quote?step=2` | Gala·Dock Quote Review Dashboard | — | A |
| PROV-005 Bookings | `/provider/bookings` | Gala·Dock Bookings Dashboard | — | B |
| PROV-006 Booking / Job | `/provider/bookings/[id]` | Gala·Dock Wedding Booking Dashboard | — | B |
| PROV-007 Calendar | `/provider/calendar` | Gala Dock Calendar Dashboard | — | B |
| PROV-W06 s1 Event & Client | `/provider/bookings/new?step=1` | Create Venue Booking Dashboard | — | B |
| PROV-W06 s2 Space & Package | `/provider/bookings/new?step=2` | Gala·Dock Venue Booking Dashboard(1) | — | B |
| PROV-W06 s3 Pricing & Terms (+ confirm) | `/provider/bookings/new?step=3` | GalaDock Venue Booking Dashboard | Stepper shows a 4th “Review & Create” label; the design’s step-3 action is “Confirm booking”, which creates the booking and lands on PROV-006. | B |
| PROV-008 Listings | `/provider/listings` (+ `/listings/{venues,spaces,services,packages}`) | Gala·Dock Listings Dashboard | — | C |
| PROV-009 Venue | `/provider/venues/[id]` | Riverside Arena Venue Dashboard | Gala Dock Venue Spaces Dashboard (Spaces & Map tab) | C |
| PROV-010 Space | `/provider/venues/[venue]/spaces/[id]` | Main Hall Venue Dashboard | Gala Dock Space Availability Dashboard (Availability & Rules tab) | C |
| PROV-W01 s1–s4 Add venue | `/provider/venues/new?step=1..4` | Riverside Arena Venue Setup Dashboard, Modern Venue Setup Dashboard, Gala Dock Venue Setup Dashboard(1) (step 3) | design shows a 6-step stepper; see note | C |
| PROV-W02 s1–s2 Add space | `/provider/venues/[id]/spaces/new?step=1..2` | Gala·Dock Add Space Dashboard | — | C |
| PROV-011 Service | `/provider/services/[id]` | Gala Dock DJ Service Dashboard | Gala Dock Pricing Dashboard (if Pricing tab) | D |
| PROV-012 Package | `/provider/packages/[id]` | Gala·Dock Wedding Package Dashboard | — | D |
| PROV-W03 s1–s3 Add service | `/provider/services/new?step=1..3` | Gala Dock Service Setup Dashboard, Gala Dock Pricing Dashboard, Gala·Dock Service Publishing Dashboard | — | D |
| PROV-W04 s1–s2 Create package | `/provider/packages/new?step=1..2` | Gala Dock Package Creation Dashboard, Create Package Dashboard UI | — | D |
| PROV-013 Team | `/provider/team` | Gala Dock Team Dashboard(1) | — | E |
| PROV-014 Team member | `/provider/team/[id]` | Priya Shah Team Dashboard Overview | — | E |
| PROV-015 Money | `/provider/money` | Gala·Dock Financial Dashboard | — | E |
| PROV-016 Gala Agent (AG-001..005 provider surface) | `/provider/agent` (+ `/agent/runs/[id]`, `/agent/routines`, `/agent/approvals`, `/agent/history`) | Gala Agent SaaS Dashboard | — | E |
| PROV-017 Settings | `/provider/settings` | Gala Dock Workspace Settings Dashboard(1) | — | E |

**Wizard step-count note:** the venue-setup design shows six stepper labels (Identity & Location, Spaces & Map, Commercial
& Booking Rules, Operations, Media & Details, Review & Publish), while the spec names four steps. The stepper follows
the design, using the design's labels and order. `?step=1..6` is supported, and the spec's four route states map onto
steps 1, 2, 3 and 4–6.

## Platform Admin (`/admin`, guard: platform_admins row + aal2 MFA + per-area permission)

| ID | Route | Canonical design | Permission | Group |
|---|---|---|---|---|
| AD-001 Overview | `/admin` | platform shell/platform admin shell (1448×1086) | any admin | F |
| AD-002 Users | `/admin/users` | Gala·Dock User Management Dashboard | users | F |
| AD-003 User profile | `/admin/users/[id]` | Gala Dock User Profile Dashboard | users | F |
| AD-004 Workspaces | `/admin/workspaces` | Gala Dock Workspace Management Dashboard | workspaces | F |
| AD-005 Workspace profile | `/admin/workspaces/[id]` | Gala Dock Workspace Dashboard | workspaces | F |
| AD-006 Events | `/admin/events` | GalaDock Events Admin Dashboard | events | F |
| AD-007 Marketplace | `/admin/marketplace` | Gala Dock Marketplace Dashboard | marketplace | G |
| AD-008 Listing review | `/admin/marketplace/listings/[id]` | Riverside Arena Marketplace Review Dashboard | marketplace | G |
| AD-009 Tickets | `/admin/tickets` | Gala·Dock Ticketing Dashboard | tickets | G |
| AD-010 Commerce (+ Payouts nav → `?tab=payouts` view at `/admin/commerce/payouts`) | `/admin/commerce` | Commerce Operations Dashboard | commerce | G |
| AD-011 Transaction | `/admin/commerce/transactions/[id]` | Gala Dock Transaction Overview Dashboard | commerce | G |
| AD-012 Trust & Safety (+ Disputes nav → `/admin/trust/disputes`) | `/admin/trust` | Gala·Dock Trust & Safety Dashboard | trust | G |
| AD-013 Support | `/admin/support` | Gala Dock Support Dashboard | support | H |
| AD-014 Case | `/admin/support/[id]` | Support Case Refund Dashboard | support | H |
| AD-015 Partners | `/admin/partners` | Gala Dock Partners Dashboard | partners | H |
| AD-016 Agent & Integrations | `/admin/agent-integrations` | Gala·Dock Agent Integrations Dashboard | agent_ops | H |
| AD-017 Analytics | `/admin/analytics` | Gala·Dock Analytics Dashboard | Gala Dock Admin Analytics Dashboard (alt tab) | analytics | H |
| AD-018 Platform settings | `/admin/settings` | Gala Dock Platform Settings Dashboard | settings | H |

## Not in this pass (tracked)

Public pages (PUB-001..006), portals (PORT-001, PROM-001, PART-001), checkout and resale (BUY-W01/W02), and the customer
and organizer Agent surfaces. See the phase report for status.
