# Gala Dock — App Nav Restructure + `/event-manager` Route Move

## 1. Route rename
The organizer workspace is the **Event Manager**. Its routes move from the bare root
(`/home`, `/events`, …) to a namespaced segment **`/event-manager/*`** (mirrors Propvora's
`/property-manager`). Mechanism:
- `src/app/(app)/` (route group, no URL segment) → `src/app/event-manager/` (real segment).
- All internal path literals `/<seg>` → `/event-manager/<seg>` (script-rewritten, 385 refs / 110 files).
- `next.config.ts` `redirects()` maps every old path → new (permanent: false) so bookmarks/old links keep working, plus `/event-manager` → `/event-manager/home`.
- `proxy.ts` post-login target → `/event-manager/home`; app routes stay non-public (auth-protected).

Auth/public/admin/marketing routes are **unchanged**: `/login`, `/signup`, `/onboarding`, `/admin/*`,
`/p`, `/f`, `/portal`, `/check-in`, `/venue-portal`, marketing + legal.

## 2. Nav merge & tidy (organizer)
Before: 14 flat items (Home, Leads, Events, Venues, Venue Ops, Suppliers, RFQs, Tasks, Team, Finance,
Inbox, Library, Settings) — too long, ungrouped, and mixing personas.

Changes:
- **Remove "Venue Ops"** from the organizer nav — `venue-management` is the **venue-operator** persona's
  surface, not the organizer's. (Stays available to `workspace_type = venue`.)
- **Merge "RFQs" under Suppliers** — RFQs are a supplier-sourcing flow; surface as a Suppliers sub-tab
  rather than a top-level item.
- **Group "Leads + Proposals" into a "Pipeline"** section (sales pipeline lives together).
- **Group the nav into labelled sections** instead of one flat list:
  - **Overview**: Home, Calendar*
  - **Pipeline**: Leads, Proposals
  - **Delivery**: Events, Suppliers (RFQs nested), Venues, Tasks
  - **Revenue**: Finance, Ticketing*
  - **Workspace**: Inbox, Team, Library, Settings
  - (*flag-gated: calendarHub, ticketing)
- Persona nav (venue / supplier) keep their focused sets.

Result: organizer top-level items drop from 14 → ~11 in 5 labelled groups; clearer hierarchy, no
persona bleed, sourcing consolidated under Suppliers.

## 3. Follow-ups
- Detail/section sub-tab routes (e.g. `/event-manager/suppliers/[id]/rfqs`) added with the DD specs.
- After the move, F3 final wiring converts the moved layout to a server component that resolves
  persona + flags and passes them to the client shell + sidebar.
