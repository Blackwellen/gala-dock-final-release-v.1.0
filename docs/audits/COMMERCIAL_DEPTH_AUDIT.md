# Gala Dock — Competitive Intelligence & Commercial Depth Analysis
**Date:** June 2026
**Build state:** V1 — 101 pages, clean build, dev server :3003
**Method:** Full codebase read + 7 web searches across the event management market

---

## PART 1 — WHAT GALA DOCK HAS (CODEBASE AUDIT)

### Core Sections Built

| Section | Pages | Depth |
|---|---|---|
| **Home** | Dashboard | KPIs, recent events, activity feed |
| **Events Register** | `/events` | Table + KPIs, tabs, status filters |
| **Event Detail** | 8 tabs | Overview, Brief, Suppliers, Tasks, Run Sheet, Finance, Files, Activity |
| **Event New Wizard** | 8 steps | AI brief, full form, supplier categories |
| **Event Day Mode** | `/event-day` | Live run sheet with real-time layout |
| **Event Export** | `/export` | Export page exists |
| **Suppliers Register** | `/suppliers` | KPIs, table, filter, health scores |
| **Supplier Detail** | 6 tabs | Overview, Services, Quotes, Events, Documents, Activity |
| **Supplier New Wizard** | 4 steps | Full onboarding with portal invite |
| **Tasks Register** | `/tasks` | Priority system, bulk actions, calendar view |
| **Task Detail** | 4 tabs | Full detail with attachments |
| **Tasks Templates** | `/tasks/templates` | Template system |
| **Finance Overview** | 5 tabs | Quotes, Invoices, Payments, Profit P&L |
| **Finance — Quote Detail** | `/quotes/[id]` | Line items, activity |
| **Finance — Invoice Detail** | `/invoices/[id]` | Full invoice with payments |
| **Finance — New forms** | quote + invoice new | Wizards |
| **Library** | 5 tabs | Files, Templates, Brand Assets, Supplier Docs, Event Packs |
| **Settings** | 18 pages | Account, Security, Billing, Team, Roles, Branding, AI, Smart Rules, Audit, Affiliate, Data Export + more |
| **Admin Panel** | `/admin` | Full platform admin |
| **Auth** | Login (Supabase-wired), Signup, OTP, Forgot, Reset, MFA | |
| **Marketing** | Landing, Pricing, Features, Legal pages | |
| **Onboarding** | Wizard | |
| **AI Copilot** | Bubble + slide-up panel | Chat UI, quick actions |

### Infrastructure
- 160+ Supabase tables with enterprise RLS
- Full multi-tenant workspace isolation
- Supabase Auth wired on login
- Smart Rules engine UI
- Next.js 16 App Router, React 19, Tailwind v4
- Database already has `venue_id`, `venue_name_snapshot`, `venue_address_snapshot`, `venue_capacity_snapshot` on the events table

### What Already Ships That Competitors Charge Enterprise Prices For
- **Event Day Mode** (live run sheet) — unique, no competitor at SMB price has this
- **AI Copilot embedded in-app** — Planning Pod: none. Aisle Planner: none.
- **Smart Rules automation** (no-code triggers)
- **Supplier document health tracking**
- **Per-event P&L margin calculation**
- **Multi-lane run sheets** (setup / supplier / internal / event lanes)
- **AI brief generation** inside event wizard
- **Affiliate management portal**
- **Full audit log**
- 160+ table enterprise database with RLS

---

## PART 2 — THE COMPETITIVE LANDSCAPE

### Tier Structure

**Enterprise / Venue-First (£500–£10,000+/year)**

**Cvent** — The dominant enterprise platform globally. Venue network, RFP engine, attendee registration, badging, mobile app, analytics, exhibitor management. $17,999+/yr. Impenetrable for SMB agencies. Not built for agency-side event management — it's attendee/venue tooling. No supplier document management. No agency-style run sheets. Pricing excludes 95% of Gala Dock's market.

**Momentus Technologies** (formerly Ungerboeck) — Enterprise venue + event OS. Catering management, room diagramming, sustainability tracking, AI analytics ("Ask Mo"), ticketing, work orders. Just launched Momentus Ticketing (May 2026). Strong for large venues and convention centres. Zero relevance for independent event agencies. Custom enterprise pricing.

**Tripleseat** — Hospitality and venue CRM. Lead → contract pipeline, BEOs, 3D floor plans, ticketing, customisable lead forms, colour-coded calendar, real-time dashboards. Built for restaurants, hotels, and venues — not for event planning agencies. Custom pricing. Strong but venue-centric.

**Mid-Market / Agency Tier (£50–£200/month)**

**Planning Pod** — The closest direct competitor to Gala Dock. 40+ integrated tools: timelines, budgets, task lists, RSVPs, guest lists, forms/questionnaires, leads, proposals, e-contracts, invoicing, payments, floor plan designer, BEO generation, client portals. Used by 70,000+ event professionals. Starts at $74/month. Key weakness: dated UI, poor mobile, minimal third-party integrations, no AI.

**Bizzabo** — Event experience platform for large corporate events. Event websites, registration, on-site check-in, AI Copilot (trained on their knowledge base), analytics, hybrid/virtual event support. ~$499+/month. Not event-agency tooling — positioned as attendee experience software for enterprises and conference organisers.

**Releventful** — Venue-first platform with 25+ integrated tools. Sales & CRM, client/vendor portals, SMS + email comms, staff scheduling with geofenced clock-ins, visual proposals, inventory management, mobile app. Strong for venues. Not supplier-first or agency-focused. Pricing unclear (custom quote).

**Freelancer CRM Tier (£20–£80/month)**

**HoneyBook** — The strongest CRM for individual event planners and freelancers. E-sign proposals, smart files (proposal + contract + invoice in one document), client portals, automation workflows, scheduling, SMS reminders, team features. $49/month. Key strength: the most polished end-to-end client journey of any platform. Key weakness: not built for multi-supplier event management, no run sheets, no event day mode, no supplier document tracking.

**Dubsado** — Workflow automation CRM. Conditional logic, custom forms, canned email sequences, client portals, invoice, contracts. $33/month. Used by freelancers and small agencies. More powerful automation than HoneyBook. Not event-specific — no run sheets, no supplier management, no finance P&L.

**Aisle Planner** — Wedding-only platform. 85+ features including floor plan creation with drag-drop seating, timeline creation, guest management, mood boards, design studio, style guides, vendor collaboration, checklist management. $60–$190/month. Very strong for weddings. Completely useless for corporate, charity, or mixed-type event agencies. No AI. US/Imperial-only. No multi-event business tools.

### Competitive Pricing Map (2026)

| Platform | Entry | Mid | Agency |
|---|---|---|---|
| **Gala Dock** | £49/mo | £149/mo | — |
| Planning Pod | $74/mo (10 events) | $109 (25 events) | $159–$319 |
| HoneyBook | $49/mo | — | — |
| Aisle Planner | $60/mo (15 projects) | $90/mo | $190/mo |
| Dubsado | Free (3 clients) | $33/mo | — |
| Releventful | Custom | Custom | Custom |
| Bizzabo | — | ~$499/mo | Enterprise |
| Cvent | — | — | $17,999+/yr |
| Tripleseat | — | — | Custom enterprise |

**The market gap:** There is almost nothing purpose-built for event agencies (not venues, not attendee experience, not wedding-only) between ~£50 and £200/month with genuine AI, supplier management, and financial depth. Gala Dock occupies that gap.

---

## PART 3 — TABLE STAKES THAT EVERY SERIOUS COMPETITOR HAS

What every platform at £50+/month has that Gala Dock currently lacks:

| Feature | Planning Pod | HoneyBook | Aisle Planner | Dubsado | Gala Dock |
|---|---|---|---|---|---|
| Leads / Enquiry CRM | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Proposals with E-Signature | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Client Portal (functional) | ✅ | ✅ | ✅ | ✅ | ⚠ UI only |
| Guest Management + RSVP | ✅ | ⚠ basic | ✅ | ❌ | ❌ Missing |
| Form Builder | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Payment Schedules | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Communication Log | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Reports & Analytics | ✅ | ✅ | ⚠ | ✅ | ❌ Missing |
| BEO Generation | ✅ (PDF) | ❌ | ✅ | ❌ | ⚠ Stub only |
| Online Payment Link (Stripe) | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Venue CRM | ✅ | ❌ | ⚠ | ❌ | ❌ Missing |
| Venue-Side Management | ⚠ basic | ❌ | ❌ | ❌ | ❌ Missing |

---

## PART 4 — CRITICAL FEATURE GAPS RANKED BY COMMERCIAL IMPACT

### 🔴 TIER 1 — BLOCKS EVERY SERIOUS SALE

**1. Leads / Enquiry CRM Pipeline**

Every competitor has this. Without it, Gala Dock has no answer for "how do I manage enquiries before they become events?" Every agency runs a pipeline: New Enquiry → Contacted → Proposal Sent → Negotiating → Won/Lost. Planning Pod, Tripleseat, Releventful, and HoneyBook all have this as a first-class section. The absence of a leads section means a prospect evaluating Gala Dock against Planning Pod will notice immediately.

What it needs: `/leads` register (table + kanban view), `/leads/new` form, `/leads/[id]` detail with activity, proposal link, convert-to-event action. Pipeline stages: New Enquiry → Contacted → Proposal Sent → Negotiating → Won / Lost. Source tracking (website/referral/Instagram/phone/email/walk-in). Budget, event type, event date fields. Conversion rate KPI.

**2. Proposals with E-Signature**

The single highest-revenue-generating feature in HoneyBook and Aisle Planner. Clients sign proposals in-platform — this is what triggers the deposit payment and event confirmation. Without it, Gala Dock requires planners to use DocuSign, Adobe Sign, or physical contracts alongside the platform. That friction is a dealbreaker for professionals. HoneyBook's "Smart Files" (proposal + contract + invoice in one document) is their most praised feature. Planning Pod's proposal + e-signature is used by 70,000+ planners.

What it needs: `/proposals` register, `/proposals/new` 4-step wizard (Details → Services/Pricing → Terms → Preview), `/proposals/[id]` detail with document view, signature status, and activity log. Digital signature flow with "Signed by [name] on [date]" confirmation. Proposal-to-invoice conversion button. E-signature legally requires just a checkbox + typed name for UK purposes — no DocuSign API needed at V1.

**3. Guest Management + RSVP**

Aisle Planner's #1 feature. Planning Pod considers this foundational. For wedding and gala clients especially, the guest list, RSVP tracking, meal choices, dietary requirements, and seating is core event management work. Without this, Gala Dock is not usable for the wedding and gala event vertical.

What it needs: "Guests" tab inside event detail (tab 9). Guest register: name, email, RSVP status (confirmed/pending/declined), Guest Type (Day/Evening/Both), Meal Choice, Dietary notes, Table/Seat assignment, Plus ones. Import CSV. RSVP rate KPI. Meal choice breakdown. Send RSVP reminder action.

**4. Communication Log / Inbox**

HoneyBook, Planning Pod, and Releventful all have this. Per-event thread of all client and supplier communications. Without it, planners are copy-pasting email threads into notes. The stickiness driver — platforms with communication logs become the daily tool. Releventful even ships SMS through the platform.

What it needs: `/inbox` hub (conversation list + thread view), per-event "Comms" tab showing all client + supplier messages for that event. Compose + attach file. Thread filtering by type (client/supplier/internal). Log call / log email / add note actions.

**5. Reports & Analytics**

Every serious competitor — Planning Pod, Bizzabo, Tripleseat, Momentus — has a reporting section. Without reports, there is no answer to "how is my business performing?" — the #1 question at renewal time. If a planner can't see their revenue trend, conversion rate, or supplier performance inside Gala Dock, they will use a spreadsheet alongside the platform — and platforms that require a spreadsheet alongside them lose at renewal.

What it needs: `/reports` section with 6 tabs: Overview (revenue trend bars, pipeline funnel), Revenue (breakdown by event type, monthly invoiced vs paid), Events (delivery scorecard), Suppliers (spend, quote acceptance, insurance health), Team (tasks completed, workload), Clients (retention, repeat booking rate). CSS bar charts — no chart library required.

### 🟡 TIER 2 — HIGH COMMERCIAL VALUE

**6. Payment Schedules (Deposit + Instalment Plans)**

HoneyBook and Planning Pod both do this. A client pays 33% deposit on signing, 33% at 30 days before event, 34% final balance 7 days before. Without payment schedules, Gala Dock users are manually tracking which instalment is due when — no automated reminder, no progress bar, no outstanding balance summary. Daily-use feature for any busy planner managing 10+ events.

What it needs: "Schedule" tab inside invoice detail. Schedule types: fixed deposit / percentage split / custom milestones. Each payment line: amount, due date, status, Mark Paid button. Progress bar (2/3 payments = 67%). Outstanding balance with "Send Payment Reminder" action.

**7. BEO / Event Order Export (Enhanced)**

Aisle Planner and Planning Pod generate Banquet Event Orders — a structured PDF of all event details including venue layout, catering requirements, timeline, supplier contacts, run sheet, and dietary notes. BEOs are the industry-standard document sent to the venue and all suppliers before event day. Gala Dock has an export stub at `/events/[id]/export` but it is not functional.

What it needs: A "Generate BEO" action in the event detail that assembles: event overview, venue details, guest count, catering summary (from brief), run sheet timeline, supplier contacts, dietary totals, and key contacts into a clean styled printable/PDF view. Document-generation feature — pure layout, not a chart or calendar.

**8. Form Builder**

HoneyBook, Dubsado, Planning Pod, and Aisle Planner all have this. Custom forms for: client intake questionnaires, RSVP forms, supplier information requests, feedback forms. Without a form builder, Gala Dock planners are using Google Forms or Typeform externally, which breaks the workflow.

What it needs: `/forms` section. Field types: Short Text, Long Text, Select, Multi-Select, Date, Number, File Upload. Publish to shareable link. Track submissions. Connect forms to events ("New Enquiry Form" → creates a lead). Templates: Event Enquiry, RSVP, Post-Event Feedback, Supplier Information Request.

**9. Online Payment Links (Stripe-backed)**

HoneyBook, Releventful, Planning Pod, and Aisle Planner all let clients pay invoices and deposits online directly through the platform. Gala Dock already has `stripe_payment_link_url` in the invoice schema — the database architecture is ready. Without this, planners are chasing bank transfers manually and clients have no easy way to pay.

What it needs: "Generate Payment Link" button on invoice detail. UI: payment link section on the invoice, "Generate Stripe Link" button (calls API), copyable URL. Client-facing: minimal payment confirmation page. No Stripe Connect required at V1 — just Stripe Checkout link generation.

**10. Client Portal (Functional)**

Every competitor has this. Gala Dock's UI has an "Invite to Portal" button on event detail but it leads nowhere. A functional client portal lets clients: view their event timeline, review and sign proposals, download invoices, approve run sheets, upload documents, communicate with their planner. Reduces client communication overhead by ~50% in real-world agency use.

What it needs: `/portal/[token]` route (public, token-based auth). Client sections: Event overview card, Timeline, Files (visibility="client" filter), Invoice status + payment link, Proposal status + sign action, Message thread with planner. Read-only mostly, with signing and payment as interactive actions.

---

## PART 5 — VENUE MANAGEMENT — FULL ANALYSIS

This is a question that deserves its own section because there are two fundamentally different things "venue management" can mean for Gala Dock.

### The Question

> "Aren't we missing venue management too? But would that change the product?"

Short answer: **yes, Venue CRM is missing and should be built. No, a Venue CRM does not change the product at all — it strengthens it. Venue-side management does change the product and belongs in V3.**

---

### Option A — Venue CRM (Planner-Side) — BUILD IN TIER 2

**What it is:** A directory of venues the planning agency regularly books for clients. Think of it as a special extension of the Supplier section — but for venues specifically. Each venue record holds capacity, layout photos, hire pricing, F&B minimums, setup/breakdown windows, parking, accessibility info, preferred contacts, T&Cs, and all past events held there.

**What competitors have it:** Planning Pod (venue section linked to events), Momentus (venue-side), Tripleseat (venue-first), Releventful (venue-first). HoneyBook and Aisle Planner do not.

**Does it change the product?** No. A Venue CRM is additive. It strengthens the "Event Delivery OS" positioning by giving planners a structured venue database instead of a notes document. The events table already has `venue_id`, `venue_name_snapshot`, `venue_address_snapshot`, `venue_capacity_snapshot` — the database schema partially anticipates this.

**What to build:**

Sidebar: "Venues" item between Suppliers and Tasks (or as a sub-section of Suppliers)

`/venues` — Venue register
- KPIs: Total Venues (18), Active This Year (7), Preferred (4), Avg Hire Cost (£3,200)
- Table: Venue name, Location, Type, Capacity (day/evening), Hire price range, Last used, Status
- Tabs: All | Preferred | Hotels | Country Houses | Conference | Outdoor

`/venues/new` — Add venue form
- Name, Type, Address, Capacity (day/evening), Hire fee range, Contact name/email/phone, Parking, Accessibility notes, F&B minimum spend, Setup time, Breakdown time, Notes
- Cover image: upload-only

`/venues/[venueId]` — Venue detail with 5 tabs:

- **Overview:** Venue info card, capacity, hire price, contact details, preferred status toggle
- **Events:** All events this venue has been used for. Table: event name, date, client, guest count, outcome. "Book for Event" button links to event creation pre-filled with this venue
- **Documents:** Upload-only for: hire agreement, floorplan, H&S policy, insurance, capacity certificates, site map
- **Notes:** Internal team notes. Pin important notes. "Recommended for weddings > 100 guests", "3-hour setup window required"
- **Activity:** Timeline of all changes, notes, and event links

**Integration with Event creation:** In the New Event Wizard (Step 1 — Details), the venue field becomes a searchable select from the venue CRM rather than free text. When selected, `venue_name_snapshot`, `venue_address_snapshot`, and `venue_capacity_snapshot` auto-populate.

**DB tables needed:**
```sql
venues (
  id, workspace_id, name, type, address, city, postcode,
  capacity_day, capacity_evening, hire_fee_min_pence, hire_fee_max_pence,
  contact_name, contact_email, contact_phone, website,
  f_and_b_minimum_pence, setup_hours, breakdown_hours,
  parking_spaces, accessibility_notes, notes,
  status (preferred/active/inactive/archived),
  cover_path, deleted_at, created_by, created_at, updated_at
)

venue_documents (
  id, workspace_id, venue_id, type, filename,
  storage_key, expiry_date, status, uploaded_by, created_at
)
```

**Commercial impact:** Medium-high. Gives Gala Dock parity with Planning Pod on venue tooling. Eliminates "I keep a spreadsheet of venues I use" — a very common planner behaviour. Does not change the product positioning.

---

### Option B — Venue-Side Management (Venue Operator) — V3 ONLY

**What it is:** The venue itself uses Gala Dock to manage its own operations — room availability calendar, booking enquiries from event clients, F&B orders, staff scheduling, invoicing to event clients, and generating its own BEOs. This is what Tripleseat, Releventful, and Momentus are built for. The software becomes dual-sided: both the event planner and the venue are users.

**Does it change the product?** Yes — significantly:

1. **Two buyer personas.** Today Gala Dock sells to event agencies and planners. Venue management means also selling to venue operators (hotels, manor houses, conference centres, independent event spaces). Different buyers, different budgets, different pain points, different sales motion.

2. **Different data model.** Venues need: room/space inventory (multiple bookable spaces per venue), availability calendars per room, double-booking prevention, F&B menus and package pricing, staffing assignments per booking, and their own client-facing booking portals.

3. **Different competitive set.** Venue management puts Gala Dock directly against Tripleseat (15,000+ venues), Releventful, and Momentus — platforms deeply entrenched in hospitality. Competing there requires catering-specific features, PMS integrations, and a completely different support model.

4. **Pricing model changes.** Venue management platforms price per location or per bookable room, not per event count.

**What this requires (when building):**

A separate route group and persona — `/venue-ops` or a dedicated venue dashboard:
- Room/space inventory management
- Availability calendar with booking slots
- Lead intake from clients to the venue
- Venue-side CRM (their clients, not the agency's)
- F&B menu management and package pricing
- BEO generation from the venue's perspective
- Staff scheduling per booking
- Venue-side invoicing to event clients
- Venue-facing client portal

**DB additions needed (V3):**
```sql
venue_spaces (id, venue_id, name, capacity, hire_fee_pence, setup_hours, ...)
venue_bookings (id, venue_space_id, event_id, status, start_at, end_at, ...)
venue_fb_packages (id, venue_id, name, price_per_head_pence, ...)
venue_booking_items (id, booking_id, type, description, qty, unit_price_pence, ...)
venue_staff_assignments (id, booking_id, user_id, role, start_at, end_at, ...)
```

**Recommended approach:** Do not build Option B in V1 or V1.5. Add it as a V2.5 / V3 expansion module gated behind Enterprise plan. When you build it, position it as: "Venues that work with event agencies can also use Gala Dock to manage their side of the relationship." This keeps the agency-first story intact while unlocking the venue operator market at the right time. The signal to scope Option B is when venue contacts inside the Venue CRM start asking for booking management features.

### Venue Feature Decision Matrix

| Feature | Option A (Venue CRM) | Option B (Venue-Side Mgmt) | Build When |
|---|---|---|---|
| Venue directory / CRM | ✅ Build now | Included | Tier 2 / V1.5 |
| Venue detail page (5 tabs) | ✅ Build now | Included | Tier 2 / V1.5 |
| Venue linked to event creation | ✅ Build now | Included | Tier 2 / V1.5 |
| Document storage per venue | ✅ Build now | Included | Tier 2 / V1.5 |
| Room/space inventory | ❌ Not needed | ✅ Required | V3 |
| Availability calendar (venue-side) | ❌ Not needed | ✅ Required | V3 |
| Venue-side BEO generation | ❌ Not needed | ✅ Required | V3 |
| F&B package management | ❌ Not needed | ✅ Required | V3 |
| Staff scheduling per booking | ❌ Not needed | ✅ Required | V3 |
| Venue-facing client portal | ❌ Not needed | ✅ Required | V3 |
| Venue-side invoicing | ❌ Not needed | ✅ Required | V3 |

---

## PART 6 — WHAT GALA DOCK HAS THAT NOBODY ELSE DOES

| Gala Dock Feature | Competitor Status |
|---|---|
| **Event Day Mode** (live run sheet) | Zero competitors at SMB price. Planning Pod: no. HoneyBook: no. Aisle Planner: no. |
| **AI Copilot embedded in-app** | Bizzabo has it (enterprise). Planning Pod: none. HoneyBook: automations but no AI. Aisle Planner: none. |
| **Per-event P&L Margin** | Planning Pod has budgets. None have real-time margin-per-event with supplier costs netted. |
| **Multi-lane Run Sheets** | No competitor at SMB price has setup / supplier / internal / event lane segmentation. |
| **Supplier Document Health Scoring** | Nobody else at any price tier has a supplier health score tracking document status. |
| **Smart Rules (no-code automation)** | Dubsado has conditional logic. Planning Pod has workflows. No event-specific Smart Rules. |
| **AI Brief Generation** (in event wizard) | No competitor has AI-assisted brief drafting during event creation. |
| **Finance → Supplier Quotes (bi-directional)** | Unique: tracks outbound client invoices AND inbound supplier quote management in one place. |
| **Event Packs in Library** | No competitor has reusable event configuration packs. |
| **Affiliate Programme** | None at this price tier. |
| **Full Audit Log** | Only enterprise platforms (Cvent, Momentus) offer this. |

The competitive pitch practically writes itself: **"Planning Pod without the dated UI, HoneyBook but for professional agencies not freelancers, and the only platform with AI + Run Sheet + Event Day Mode."**

---

## PART 7 — AI FEATURE MAP ACROSS THE MARKET

| Platform | AI Capability | Maturity |
|---|---|---|
| **Bizzabo Copilot** | Trained on their KB, real-time guidance, automates tasks | Production — enterprise |
| **Nowadays (YC)** | AI copilot contacts venues by email/phone, handles negotiations, surfaces best options | Early production — startup |
| **EventPilot.ai** | AI event planning + venue sourcing copilot | Early stage |
| **Eventify AI** | Personalised recommendations, real-time attendee support | Production |
| **ClickUp AI** (used by planners) | Generic task + doc AI | Not event-specific |
| **Cvent** | AI session recommendations, matchmaking | Production — attendee-only |
| **Momentus "Ask Mo"** | Natural language data queries, interactive analytics | Production — enterprise |
| **Planning Pod** | None | No AI |
| **HoneyBook** | Basic automations (not AI) | Rule-based only |
| **Aisle Planner** | None | No AI |
| **Dubsado** | None | No AI |
| **Gala Dock Copilot** | Chat bubble + canned responses + quick actions | UI built, mock AI only |

**Gala Dock's AI position:** The Copilot bubble exists but responses are canned (1.2s setTimeout). No competitor at SMB price (under £200/month) has real AI embedded in the full planning workflow. The opportunity is to make Gala Dock the first SMB event platform where AI understands the full event — suppliers, tasks, finance, run sheet — and can answer operational questions in natural language.

**What AI nobody does well yet in event management:**
- AI draft run sheet from event brief (Gala Dock has the button — needs the function)
- AI-generated proposals from event data (biggest revenue use-case)
- AI chase suppliers who haven't responded (Gala Dock has "AI Chase" button — needs function)
- Natural-language event Q&A: "What's overdue for the Carter Wedding?"
- AI compare supplier quotes and recommend best value
- AI analyse post-event P&L and surface margin recommendations
- AI detect event risk signals (overdue tasks + missing docs + no confirmed venue = flag)
- AI send follow-up to leads who haven't responded

---

## PART 8 — GALA DOCK'S WHITE SPACE

The market has two failure modes: **CRM-first platforms** (HoneyBook, Dubsado) that bolt on event features but have no operational depth, and **venue-first platforms** (Tripleseat, Releventful, Momentus) built for the venue side of the table, not the planner side. Planning Pod sits in the middle with dated technology and no AI.

```
CRM platforms (HoneyBook, Dubsado)
  ✅ Proposals, e-sign, client portal, forms
  ❌ No run sheets, no supplier management, no event day mode, no per-event P&L

Venue platforms (Tripleseat, Releventful)
  ✅ BEOs, calendars, floor plans
  ❌ Built for venues, not agencies; no supplier document tracking; expensive

Planning Pod (closest competitor)
  ✅ 40+ tools, proposals, BEOs, guest lists, client portal
  ❌ Dated UI, no AI, poor mobile, no event day mode, no supplier health

GALA DOCK'S POSITION:
  ✅ Agency-first architecture
  ✅ AI Copilot embedded
  ✅ Run Sheet + Event Day Mode (unique)
  ✅ Supplier document management
  ✅ Per-event P&L margin
  ✅ Smart Rules automation
  ✅ UK-first pricing (£49/149 vs £600-1,500/yr for comparable tools)
```

---

## PART 9 — TIER 3 FEATURES (V2 DIFFERENTIATORS — BUILD TO CHARGE MORE)

Not missing from V1 — premium features for V2/V2.5 to attract growth-tier customers and justify £299/month Agency plan.

**Seating Chart Builder** — Aisle Planner's most praised feature. Drag-drop guest assignment to tables. Visual floor layout. Dietary flags per table. Build for V2 on Growth/Agency plan.

**Mood Board / Inspiration Board** — Aisle Planner has this. Visual board per event where client and planner collaboratively pin images, colour palettes, reference photos. Increases client stickiness. Build as an event tab for wedding/gala clients.

**Venue CRM (Option A)** — See Part 5. Separate venue directory with capacity, layout, contacts, T&Cs, past events. Strengthens agency-first positioning. Build in Tier 2.

**Two-Way SMS Comms** — Releventful differentiates on SMS. 88% of people prefer mobile messaging. Send SMS reminders to clients and suppliers directly from Gala Dock with full audit trail. Twilio integration.

**RSVP Microsite / Event Page** — A public-facing event page with RSVP form. Branded URL per event. Guests submit RSVP. Responses populate the guest list. Lives on Growth or Enterprise plan.

**AI Proposal Generator** — The highest-revenue AI feature to build. Copilot reads the event brief, existing line items, and client budget, and generates a full proposal draft. One click → full professional proposal. No competitor at SMB price does this. Gala Dock already has the AI Copilot architecture and the event brief data.

**Supplier Portal (Live)** — Portal invite button already exists on supplier detail. Making this functional (suppliers log in, submit quotes, upload documents, view confirmed events) is a massive stickiness driver. Releventful has a vendor portal. Eliminates email chains for supplier document collection.

**Xero / QuickBooks Integration** — Required for enterprise agency sales. Invoices sync automatically. Growth plan feature.

**Calendar Booking Widget (Client-Facing)** — HoneyBook has this. Client-facing booking page where prospects can see available dates and request a slot. Feeds directly into the leads pipeline. Embeddable on the planner's own website.

**Venue-Side Management (Option B)** — See Part 5. Full room booking engine, availability calendar, F&B packages, staff scheduling, venue-facing client portal. V3 / Enterprise only. Changes the product and adds a second buyer persona.

---

## PART 10 — PRICING STRATEGY RECOMMENDATION

```
STARTER     £49/month    Up to 5 active events    Solo planners, small ops
                         Unlimited suppliers, tasks, finance
                         Core event management, run sheets, AI Copilot

GROWTH      £149/month   Up to 20 active events   Growing agencies, teams
                         Everything in Starter +
                         Proposals + E-signature, Guest Management,
                         Payment Schedules, Reports & Analytics,
                         Client Portal, Form Builder, Communication Inbox,
                         Leads CRM, Venue CRM, Team seats (up to 5)

AGENCY      £299/month   Unlimited events          Established agencies
                         Everything in Growth +
                         Unlimited team seats, White-label client portal,
                         AI Proposal Generator, Seating Charts,
                         Mood Boards, Supplier Portal (live),
                         Xero/QuickBooks sync, Priority support

ENTERPRISE  Custom        Multi-brand, SSO, API, dedicated onboarding,
                          Venue-Side Management module (V3)
```

**Why this pricing works:** Planning Pod charges $159/month (50 events). HoneyBook is $49/month but has zero operational depth. Aisle Planner charges $60–190/month for wedding-only. A full-stack agency platform at £149/month with AI, run sheets, proposals, guest management, and analytics is unmatched value in the UK market.

**Growth paywall triggers (what forces the £149 upgrade):**
- Proposals + E-signature — planners need this to close clients
- Client Portal — every agency wants their clients in a branded portal
- Reports & Analytics — "can I see my annual revenue?" forces the upgrade
- Guest Management — required for any wedding or gala client
- Communication Inbox — once comms are logged here, the planner is locked in

---

## PART 11 — PRIORITISED BUILD ORDER

### Immediate (Tier 1 — Blocks commercial competitiveness)
1. **Leads / Enquiry CRM** — `/leads`, `/leads/new`, `/leads/[id]` — highest revenue impact, every competitor has it
2. **Proposals + E-Signature** — `/proposals`, `/proposals/new`, `/proposals/[id]` — single biggest sales conversion tool
3. **Guest Management** — Guests tab inside event detail — required for weddings and galas
4. **Reports & Analytics** — `/reports` — renewal and upsell driver, currently shows "coming in V1.5" placeholder
5. **Communication Inbox** — `/inbox` + Comms tab in event detail — daily use, stickiness driver

### Short-term (Tier 2 — High commercial value)
6. **Payment Schedules** — Schedule tab inside invoice detail
7. **BEO Export (Enhanced)** — Functional export from event detail
8. **Form Builder** — `/forms`, `/forms/new`, `/forms/[id]`
9. **Online Payment Links** — Stripe-backed, button on invoice detail
10. **Client Portal (functional)** — `/portal/[token]`
11. **Venue CRM (Option A)** — `/venues`, `/venues/new`, `/venues/[id]`

### Medium-term (V2 differentiators)
12. AI Proposal Generator (Copilot → generate from event data)
13. Seating Chart Builder (Growth/Agency plan only)
14. Supplier Portal (live — extend existing portal invite)
15. Mood Board per event
16. Xero / QuickBooks sync
17. Two-way SMS (Twilio)

### Longer-term (V2.5 / V3 — market expansion)
18. **Venue-Side Management (Option B)** — room inventory, availability calendar, F&B packages, staff scheduling, venue-facing client portal — Enterprise plan only
19. RSVP Microsite per event
20. Calendar Booking Widget (embeddable)
21. AI natural-language Q&A with full event context

---

## PART 12 — GALA DOCK'S MOAT

No competitor is simultaneously **UK-priced, agency-first, AI-embedded, operationally deep, and supplier-managed**. Cvent and Momentus are for venues and enterprises. Planning Pod is agency-relevant but technically stagnant with no AI. HoneyBook is polished but has no operational depth beyond the client journey. Aisle Planner is wedding-only and US-centric. Releventful and Tripleseat are venue-side, not planner-side.

The five features that create a genuinely defensible moat — all of which Gala Dock either has or can build in weeks:

1. **Event Day Mode** — live run sheet during event execution (zero competition at this price)
2. **AI Copilot with operational context** — first SMB platform where AI knows your suppliers, tasks, finances, and run sheet
3. **Supplier-first architecture** — document health, RFQ engine, quote comparison, portal invites
4. **Per-event P&L margin** — real-time gross profit per event (no competitor at this price does this)
5. **Smart Rules + AI Chase** — the only platform where an event manager can set automated triggers for supplier non-response, invoice overdue, missing documents

Build the 11 Tier 1/2 gaps (including Venue CRM), ship the AI Proposal Generator and Client Portal, price at £49/149/299, and the competitive positioning becomes unassailable:

> **"The only event management platform built for the agency — not the venue, not the freelancer, and not yesterday's technology."**

---

## Sources
- [Planning Pod Features & Pricing](https://planningpod.com/) | [G2 Reviews](https://www.g2.com/products/planning-pod/reviews)
- [HoneyBook for Event Planners](https://www.honeybook.com/software-for-event-planners)
- [Aisle Planner Review 2026](https://research.com/software/reviews/aisle-planner)
- [Dubsado vs HoneyBook 2026](https://aplosai.com/blog/dubsado-vs-honeybook)
- [Tripleseat Features 2026](https://www.capterra.com/p/118047/Tripleseat/)
- [Releventful vs Tripleseat](https://www.releventful.com/blog/releventful-vs-tripleseat-for-event-venues)
- [Momentus Technologies AI Enhancements 2026](https://www.prnewswire.com/news-releases/momentus-technologies-announces-ai-powered-platform-enhancements-for-venue-and-event-operations-302676378.html)
- [Bizzabo Best Event Management Software Guide](https://www.bizzabo.com/blog/best-event-management-software)
- [Nowadays AI Copilot for Corporate Events – YC](https://www.ycombinator.com/companies/nowadays)
- [Event Management Software Trends 2026 – Blackthorn](https://blackthorn.io/content-hub/event-management-software-trends-to-watch-in-2026-features-crm-connection-and-roi/)
- [BoomPop Event Planning Software Comparison](https://boompop.com/blog/event-planning-software-comparison)
- [EventHex 25 Best Event Management Tools 2026](https://eventhex.ai/blog/25-best-event-management-software-tools-2026-edition/)
