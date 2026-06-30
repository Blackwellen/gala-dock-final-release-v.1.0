# Gala Dock — Commercial Depth & Gap Audit (2026-06-29)

Benchmarked against **Propvora** (sister product, same owner/stack — the "what "done" looks like" reference).

> **ADDENDUM (2026-06-29): Platform / multi-sided marketplace vision** — see §7. The owner has
> expanded scope from a B2B Event Delivery OS to a multi-sided platform: consumer ticketing +
> three marketplaces (events, venues, suppliers) + escrow/disputes/accounting. §7 captures the
> account/workspace-type architecture, payments model, revenue model, and a cold-start-safe sequence.

---

## 0. Executive verdict

Gala Dock is **a genuinely deep V1**, not a prototype: 315 table/function/view definitions in the
live schema, ~94 pages reading from Supabase, RLS helper functions (`is_workspace_member`,
`has_role`, `is_platform_admin`), a real billing spine (`billing_plans`, `billing_subscriptions`,
`stripe_webhook_events`, `dunning_events`, `stripe_reconciliation_runs`), AI metering
(`ai_budgets`, `ai_usage_ledger`), a **Smart Rules** automation primitive, chat, email infra, and
token-based share portals.

It sits **roughly one maturity tier below Propvora**. Propvora's edge is in five specific places:
1. A full **AI Copilot brain** (RAG/embeddings + tool-calling with approval + memory threads), vs Gala Dock's metering-only AI skeleton.
2. A **visual automation canvas** (node registry, recipes, webhooks), vs Gala Dock's rules-only Smart Rules.
3. **Four productized portals** (tenant/landlord/supplier/recipient with profiles, sessions, uploads), vs Gala Dock's token share-links.
4. A **multi-view calendar hub** aggregating every section, vs Gala Dock's single task calendar.
5. A **10-suite security/billing test harness + release sign-off gate**, vs Gala Dock's lighter QA.

**Strategic takeaway:** Don't rebuild breadth — Gala Dock already has it. Invest in **depth on the
five gaps above**, plus the event-industry-specific revenue surfaces (public ticketing) that
Propvora doesn't need. That is the path to "world-class enterprise."

---

## 1. Answers to the direct questions

| # | Question | Verdict | Why |
|---|----------|---------|-----|
| 1 | Supplier portal? | **YES — productize it** | Token infra exists (`supplier_portal_tokens`). Suppliers confirming jobs/quotes/docs is core to event delivery. Build it into a real portal like Propvora's. |
| 2 | Separate Venue Manager portal? | **YES, but as a role/workspace-type, not a separate app** | You already have `venue-management` + `venue-portal/[token]`. Make "Venue Manager" a workspace persona with a tailored nav, not a second codebase. |
| 3 | Main workspace = Event Manager portal? | **YES** | The `(app)` shell already *is* the event manager OS. Keep one app; differentiate by role (Event Manager / Venue Manager / Supplier / Client) via entitlements + nav, not separate builds. |
| 4 | More commercial depth / sub-tabs / detail pages / wizards? | **SELECTIVELY** | Breadth is already strong. Add depth where money/decisions happen: event detail finance, supplier scorecards, proposal builder. Stop adding net-new top-level sections. |
| 5 | Add automations? | **YES — upgrade Smart Rules → visual automations** | You have the engine primitive (`smart_rules`, `smart_rule_runs`). Add a recipe library + trigger/condition/action builder + run log UI. High commercial value, gates Scale+ tier. |
| 6 | Calendar & scheduling (missing)? | **YES — build a calendar hub** | Today only `/tasks/calendar`. Build a cross-section calendar (events, tasks, run sheets, supplier bookings, invoice due dates) with month/week/day/agenda + iCal feed. `calendar_share_tokens` already exists. |
| 7 | Financing? | **CLARIFY — two meanings** | (a) **Finance module** = already strong (quotes/invoices/payments/profit/tax). (b) **Customer financing / BNPL / deposit schedules** = net-new; `invoice_payment_schedules` exists, so deposit/instalment plans are a quick win. Pay-by-link/financing is a later add. |
| 8 | Ticketing? | **YES — but as a distinct product surface** | This is your biggest *new revenue* lever and a clear differentiator vs Propvora. Needs: public event pages, ticket types, checkout (Stripe), QR check-in (you already have `event_guests` + check-in route). Scope as its own module. |
| 9 | Floor planning / seating? | **YES — deepen what exists** | `event_floor_plans` table + `/events/[id]/floor-plan` route exist as shells. Make it a real drag-drop seating/layout tool with capacity + guest assignment. Differentiator. |
| 10 | Advertising events + public ticket purchase on your calendar? | **YES — this is a platform play** | A public events directory + ticket purchase turns Gala Dock from B2B SaaS into a B2B2C marketplace. High ambition; sequence *after* core ticketing. |
| 11 | PWA full setup? | **YES — but it's small** | Only `manifest.ts` today (no service worker). Add SW + offline shell + install prompt. Highest value for **event-day mobile** (run sheets, check-in offline). Medium effort, big field-ops payoff. |
| 12 | Accounting? | **PARTIAL — add light GL later** | You have invoices/payments/tax/profit. A double-entry **General Ledger** (like Propvora's flagged `accountingGl`) is a V2 Enterprise feature, not V1. Add export-to-Xero/QuickBooks first — cheaper, higher demand. |
| 13 | Supplier sourcing / procurement / jobs (DJs, decorators, promoters, flyer designers)? | **YES — marketplace + RFQ depth** | You have `suppliers`, `rfqs`, `service_catalog`, `supplier_categories`. Build a **sourcing marketplace** (find/book acts & services) + RFQ-to-award flow. Strong differentiator and network effect. |
| 14 | Full team management? | **MOSTLY DONE — polish it** | Deep already: `team_invite_*`, `team_member_*`, `team_seat_*`, `team_transfer_ownership`, `user_roles`, `mfa_policies`. Add staffing/shift scheduling for event crews (`event_staff_assignments`, `team_availability_blocks` exist). |
| 15 | Proper commercial depth | **See §3** | You're 70% there. The depth gap is concentrated, not broad. |
| 16 | Full Copilot like Propvora's | **YES — biggest single uplift** | See §2. This is the flagship gap. |

---

## 2. AI Copilot — the flagship gap

**Propvora has** (live): `src/lib/ai/` with multi-provider GDPR-safe routing, credit metering (4 credit
classes), a **7-level permission/approval engine**, a **tool registry** (permission→credit→execute→audit),
**pgvector RAG** (bge-m3 embeddings, hybrid retrieval), **memory** (thread/workspace/user), document
generation to PDF, form-assist, and ~10 `/api/ai/*` endpoints. Plan-gated to Scale+.

**Gala Dock has**: the *metering* skeleton (`ai_budgets`, `ai_usage_ledger`, `ai_budget_reserve/reconcile/refund`,
`ai_drafts`, `ai_prompts`, `ai_audit`) and a `components/copilot` bubble — but **not** the conversational
brain, tool execution, RAG, or memory.

**To close it (in order):**
1. Conversational chat endpoint with workspace context injection + streaming (reuse `ai_budget_reserve` for metering).
2. Tool registry + approval card (create event/task/quote, draft email) — you already have `ai_drafts` + `apply_*` RPCs to execute safely.
3. RAG over events/suppliers/briefs (pgvector) so it answers grounded questions.
4. Memory threads + pinning to entities.
5. Plan-gate to Scale+; meter to GBP; show usage. (Propvora's model: Scale 750 msg/mo → Enterprise unlimited.)

This is the difference between "an events database" and "an events **OS with an operator**."

---

## 3. Commercial depth analysis

**Where Gala Dock is already enterprise-grade:** multi-tenant workspaces + RLS, billing/Stripe spine
with dunning + reconciliation, role/permission model + MFA, audit logging, email infra with
suppression/domains, affiliate program, admin console (users/workspaces/subscriptions/support/
feature-flags/system-health), Smart Rules engine, token share-portals, demo-seed system.

**Where depth is thin vs a "world-class" bar:**
- **AI Copilot brain** (§2) — biggest.
- **Automations UX** — engine exists; needs builder + recipes + run-log surface.
- **Calendar hub** — single view today; needs cross-section aggregation + iCal.
- **Portals** — token links today; needs productized supplier/client/venue portal experiences (profiles, sessions, uploads, branded).
- **Event-day mobile / PWA** — manifest only; needs offline SW for run sheets + check-in.
- **Testing/release gating** — Propvora runs 10 security/billing suites + a sign-off doc; Gala Dock should adopt the same RLS/IDOR/entitlement test harness before selling enterprise.
- **Event-industry revenue surfaces** — ticketing, public event directory, sourcing marketplace (net-new, high differentiation).

---

## 4. Pricing analysis

**Current Gala Dock pricing (homepage):** Starter £49 · Growth £149 · Enterprise (custom). Only 3 tiers —
too few to capture willingness-to-pay or to gate AI/automations cleanly.

**Propvora's model (5 tiers):** Starter £29 · Operator £99 · Scale £169 · Pro/Agency £329 · Enterprise (custom),
with AI + full automations gated at **Scale+**, plus credit add-ons (AI Pro £29/mo; intelligence/action packs).

**Recommended Gala Dock structure (4 paid tiers + enterprise):**

| Tier | Price (mo) | Seats | Gates |
|------|-----------|-------|-------|
| **Starter** | £39 | 2 | Events, suppliers, tasks, basic finance, 1 client portal. No AI, no automations. |
| **Growth** | £119 | 5 | + Full finance, supplier portal, proposals, calendar hub, **basic Smart Rules**. |
| **Scale** | £249 | 10 | + **AI Copilot** (metered), **full automations** (builder/recipes/webhooks), branded portals, **ticketing**. |
| **Agency/Pro** | £449 | 20 | + Multi-workspace, sourcing marketplace, advanced staffing, white-label, priority support. |
| **Enterprise** | Custom | ∞ | + SSO/SAML, BYOK AI, SLA, GL/accounting export, dedicated onboarding. |

**Add-ons (margin + expansion revenue):**
- AI credit packs (mirror Propvora: £20–£29 for ~1k–15k credits) — keeps AI gross margin ~10–30×.
- Ticketing: per-ticket fee or % (e.g. 1–2% + £0.20) on public ticket sales — usage revenue independent of subscription.
- Extra seats, extra storage, extra workspaces.

**Rationale:** AI + automations are the value-perception anchors — gate them at **Scale** to drive
upgrades. Ticketing as usage-priced revenue scales with customer success (aligned incentives).

---

## 5. Recommended roadmap (sequenced by value ÷ effort)

**Wave A — Close the OS gaps (highest ROI):**
1. **Calendar hub** (cross-section + iCal) — medium effort, expected by every buyer.
2. **AI Copilot v1** (chat + tools + metering) — high effort, flagship differentiator.
3. **Automations builder** (Smart Rules → recipes + trigger/condition/action + run log) — medium.
4. **Productized Supplier + Client portals** — medium; you have the token infra.

**Wave B — Event-industry revenue surfaces (differentiation):**
5. **Ticketing module** (public event page, ticket types, Stripe checkout, QR check-in) — high; new revenue.
6. **Floor plan / seating** deepening — medium; sticky differentiator.
7. **Sourcing marketplace / RFQ-to-award** (DJs, decorators, promoters, designers) — high; network effects.

**Wave C — Enterprise hardening:**
8. **PWA + offline event-day mode** — medium; field-ops wow.
9. **Security/billing test harness** (RLS/IDOR/entitlement suites) + release sign-off — required before enterprise sales.
10. **Accounting export (Xero/QuickBooks)**, then GL — low→high; Enterprise.
11. **Public events directory + customer ticket purchases** — high; platform/marketplace play, after ticketing.

---

## 6. Evidence appendix (file pointers)

- Gala Dock schema: `src/lib/supabase/database.types.ts` (315 defs)
- Smart Rules engine: tables `smart_rules`, `smart_rule_runs`, `smart_rule_actions_log`, `smart_rule_cap`; UI `src/app/(app)/settings/smart-rules`
- AI metering: `ai_budgets`, `ai_usage_ledger`, `ai_drafts`; UI `src/components/copilot`, `src/app/(app)/settings/ai`
- Billing spine: `billing_plans`, `billing_subscriptions`, `stripe_webhook_events`, `dunning_events`
- Portals: `portal_tokens`, `supplier_portal_tokens`, `invoice_portal_tokens`, `src/app/(app)/venue-portal/[token]`
- Event depth shells: `events/[eventId]/{floor-plan,mood-board,staffing,check-in,beo,expenses}`
- Propvora reference (clone, not committed): full `src/lib/ai/`, `src/features/automations/`, `src/app/(portal)/`, 69 migrations, 10-suite `npm run test:security`

---

## 7. Platform vision — multi-sided marketplace (ADDENDUM)

The expanded scope: Gala Dock becomes a **platform with four participant types and three
marketplaces**, where the existing OS *generates the supply* that seeds the marketplaces.

### 7.1 Account & workspace types
Introduce a `workspace_type` (drives nav, onboarding, entitlements, and which marketplace surfaces show).
**One codebase, type/role-driven** — not separate apps.

| Participant | Account model | What they do |
|---|---|---|
| **Customer / Consumer** | Lightweight **buyer account** (not a workspace) | Browse public events calendar, buy tickets, manage **multiple tickets/orders**, transfers, refunds, QR wallet |
| **Event Organizer / Planner** | Workspace (`type=organizer`) — the current `(app)` | Run events, **sell tickets**, source venues + suppliers, deliver |
| **Venue Operator** | Workspace (`type=venue`) | List venues, manage availability/pricing/bookings, accept/decline, get paid |
| **Supplier / Vendor** (DJ, decorator, promoter, designer, caterer) | Workspace (`type=supplier`) | List services, receive RFQs/bookings, quote, fulfil, get paid |
| **Platform Admin** | Existing admin console | Moderation, verification, disputes, payouts, take-rate config |

**Portals stay** for lightweight external collaborators (a client viewing one event; a supplier
confirming one job). **Full workspaces** are for businesses that *actively manage* their own
inventory/finances. A supplier can start as a portal guest and "upgrade" to a workspace.

### 7.2 The three marketplaces + consumer layer
| Marketplace | Sides | Existing schema to build on |
|---|---|---|
| **Ticketing (B2B2C)** | Organizer → Consumer | `event_guests`, check-in route, `events_with_stats` |
| **Venue marketplace (B2B)** | Organizer ↔ Venue operator | `venues`, `venue_spaces`, `venue_bookings`, `venue_fb_packages` (richest model you have) |
| **Supplier marketplace (B2B)** | Organizer ↔ Supplier | `suppliers`, `rfqs`, `service_catalog`, `supplier_categories`, `supplier_rate_cards` |
| **Public events directory** | Consumers discover across all organizers | aggregates ticketed events; network-effect layer (do last) |

### 7.3 Payments, escrow & disputes — Stripe Connect
This is the core new infrastructure.
- **Stripe Connect** connected accounts for everyone who *receives* money (organizers, venues, suppliers).
  Schema already hints at this: `set_workspace_stripe_connect_account`, `stripe_reconciliation_runs`.
- **"Escrow" = milestone-delayed transfers**, not literally holding client money. Use separate
  charges & transfers (or destination charges + `transfer_data`) and release on completion / check-in /
  approval. **⚠️ Legal note:** literally custodian-holding funds can trigger money-transmission /
  safeguarding rules — implement as delayed Connect payouts and get a quick legal check before launch.
- **Platform application fee** = your take-rate per transaction.
- **Disputes centre**: buyer↔organizer (tickets), organizer↔venue/supplier (services); evidence upload
  (reuse `quote_files`/evidence patterns), resolution states, refund/partial-refund flows, chargeback handling.
- **Payouts & tax**: payout schedules, statements, `affiliate_tax_forms` pattern extends to 1099/marketplace tax.

### 7.4 Accounting — now genuinely multi-party
Each workspace type needs its own financial view: organizer **P&L**, venue **revenue + payouts**,
supplier **earnings**. With money moving between parties, a light **General Ledger** is now justified
(was V2-optional in §1). Sequence: per-workspace statements + payout reports + **Xero/QuickBooks export**
first; double-entry GL for Enterprise after.

### 7.5 Revenue model (multi-stream — much larger TAM)
1. **SaaS subscriptions** per workspace type (organizer / venue / supplier tiers).
2. **Ticketing fees** — % + fixed per ticket (consumer-facing usage revenue).
3. **Marketplace take-rate** on venue + supplier bookings (e.g. 5–15%).
4. **Payment processing margin**.
5. **Promotion / featured listings** — boost a venue, event, or supplier (ads).
6. **Add-ons** — AI, automations, extra seats/storage.

### 7.6 The hard parts (honest counsel)
1. **Cold-start** — a marketplace is worthless empty. **Wedge:** your OS already holds organizers'
   real venues/suppliers/events as private records. Let them **opt-in to list publicly** — the product
   *manufactures its own initial supply*. Lead with this; it's your unfair advantage vs Eventbrite.
2. **Don't launch all four at once.** Recommended sequence below solves cold-start by starting
   single-sided.
3. **Payments = regulated + chargebacks + fraud.** Stripe Connect handles KYC/payouts, but consumer
   ticketing brings refund/chargeback/support volume — a different operational muscle than B2B SaaS.
4. **Trust & safety** — verification (mirror Propvora admin: `id-verification`, `supplier-verification`),
   reviews/ratings (`supplier_ratings` exists), moderation, dispute resolution.

### 7.7 Recommended platform sequence (cold-start-safe)
- **P1 — Ticketing (single-sided, lowest risk):** organizer sells to *their own* audience. No two-sided
  cold start (organizer brings demand). Immediate revenue; you control both ends. Includes consumer
  buyer account + multi-ticket management + QR check-in (build on `event_guests`).
- **P2 — Venue marketplace:** richest existing data model; organizers already need venues. Add
  Connect payments + request-to-book + deposit/escrow-on-completion.
- **P3 — Supplier marketplace:** RFQ-to-award + booking + milestone payments.
- **P4 — Public events directory:** cross-organizer consumer discovery — only valuable once ticket
  supply exists. This is the network-effect flywheel.
- **Throughout:** Stripe Connect spine, disputes centre, payout/accounting, verification/trust — built
  incrementally as each marketplace needs it (not all upfront).
