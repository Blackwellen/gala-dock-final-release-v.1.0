# Gala Dock — Workspace Navigation Audit (event-manager + venue + supplier + customer)

Goal: **8–12 side-nav items per persona**, no duplication, correct merges, and a clean sub-tab model.

## Core principles
1. **View types are filters, not sub-tabs.** Table / Card / Board / Calendar / Map are a **view switcher**
   inside one page — never separate sub-tabs. (e.g. Events must not have "List" and "Board" sub-tabs.)
2. **Every section's first sub-tab is "Overview."** Then real sub-sections (records/relationships), not views.
3. **Top-level nav = top-level business areas.** Sub-areas live as sub-tabs of their parent, not as
   their own sidebar item.
4. **One home for each concept.** No concept appears in two sidebar items.

---

## A. Event Manager (organizer) — target 11 items

**Before (14):** Home · Calendar · Leads · Proposals · Events · Suppliers · Venues · Venue Ops · RFQs · Tickets · Tasks · Team · Finance · Inbox · Automations · Library · Settings.

**Merges / fixes:**
- **Leads + Proposals → "Sales"** (one item; sub-tabs: Overview · Leads · Proposals · Pipeline-board-as-view).
- **RFQs → into Suppliers** (sub-tab), not top-level. (already partly done)
- **Venue Ops removed** from organizer (venue persona only). ✅ done
- **Tickets → into Finance? No** — Tickets is its own revenue area when ticketing is on; keep as flagged item.
- **Library → keep** (assets) but could fold into a "Docs" area later.
- **Team → keep** (people ops is frequent) — not buried in Settings.

**After (grouped, 11 + 2 flagged):**
- **Overview:** Home · Calendar*(calendarHub)
- **Sales:** Sales (Leads + Proposals as sub-tabs)
- **Delivery:** Events · Suppliers (RFQs sub-tab) · Venues · Tasks
- **Revenue:** Finance · Tickets*(ticketing)
- **Workspace:** Inbox · Automations*(automationsBuilder) · Team · Settings (Library folded under Settings → "Assets")

Always-on count = 10 (Home, Sales, Events, Suppliers, Venues, Tasks, Finance, Inbox, Team, Settings) + Calendar/Tickets/Automations when flagged → **10–13**. Trim Library to a Settings sub-tab to stay ≤12.

### Per-section sub-tab model (organizer)
| Section | Sub-tabs (Overview first; views are a switcher, not tabs) |
|---|---|
| **Events** | Overview · (event detail tabs handled separately) — list page uses a **view switcher** (Table/Card/Calendar/Board), NOT sub-tabs |
| **Sales** | Overview · Leads · Proposals |
| **Suppliers** | Overview · Directory · RFQs · Scorecards · Documents |
| **Venues** | Overview · Directory · Documents |
| **Tasks** | Overview · (Board/List/Calendar/Gantt = view switcher) · Templates |
| **Finance** | Overview · Quotes · Invoices · Payments · Profit · Tickets(sales) |
| **Team** | Overview · Members · Roles · Availability · Time |
| **Settings** | Account · Workspace · Branding · Billing · Roles · AI · Smart Rules · Notifications · Assets(Library) · Audit · Data export |

### Event **detail** tabs (the command centre — DD-1)
Overview · Brief · Schedule/Run-sheet · Suppliers · Tasks · **Finance** · **Tickets** · Guests ·
Floor-plan/Seating · Mood-board · Staffing · Logistics · Documents · Comms · Risks · Capacity ·
Activity · **Publish**. (Views inside a tab are switchers, not nested tabs.)

---

> **Marketplace vs Listings:** venues/suppliers are the SUPPLY side — they never browse/book the
> marketplace. Their nav item is a **seller console ("My Listings")**: manage listings, availability,
> pricing, inbound booking requests/RFQs, reviews, payouts. The *buyer* marketplace browse is the
> organizer's surface; the consumer-facing one is the public `/discover` directory. Do NOT label a
> seller console "Marketplace".

## B. Venue Operator — target 9 items
**Nav:** Home · My Venues · Availability(calendar) · Bookings · **My Listings***(seller console) · Suppliers · Finance · Inbox · Team · Settings.
- "My Venues" sub-tabs: Overview · Spaces · Documents · Pricing · Reviews.
- "Bookings" uses a view switcher (calendar/list), not sub-tabs.
- Remove any organizer-only items (Leads/Proposals/Events register) — venues take bookings, not run delivery.

## C. Supplier — target 9 items
**Nav:** Home · Jobs · RFQs · Calendar(availability) · **My Listings***(seller console) · Quotes · Finance(Earnings) · Inbox · Settings.
- "Jobs" sub-tabs: Overview · Assigned · Completed · Evidence.
- "Quotes" = their submitted quotes (separate from organizer's quotes).

## D. Customer / Consumer (buyer account — V1.5, NOT a workspace) — target 5 items
A lightweight buyer surface (separate auth), not the app shell:
**Nav:** Discover · My Tickets · Orders · Saved/Following · Account.
- "My Tickets" = QR wallet + transfers/refunds. "Orders" = purchase history.

---

## Implementation order
1. **app-nav.ts** — apply the persona top-level changes above (merge Leads+Proposals → Sales; fold Library → Settings/Assets; tidy venue/supplier).
2. **Per-section sub-tabs** — replace any view-type sub-tabs with a view switcher; ensure each section opens on "Overview"; nest RFQs under Suppliers, Proposals+Leads under Sales.
3. **Customer nav** — defined for the V1.5 consumer surface.
