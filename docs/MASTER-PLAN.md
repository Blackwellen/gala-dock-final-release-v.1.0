# Gala Dock — Master Build Plan (V1 · V1.5 · V2)

Authoritative product + architecture + versioning + pricing plan.
Companion to `docs/COMMERCIAL-AUDIT-2026-06.md` (gap analysis & Propvora benchmark).

**Model in one line:** SaaS-led platform. Subscriptions are the primary revenue; the marketplace
(V2) monetizes via take-rate. Operators (venues) join the marketplace free; revenue comes from
ticket + supplier + booking commissions.

---

## 1. Participant / user types

| Type | Account model | Workspace? | Appears in version |
|------|---------------|-----------|--------------------|
| **Consumer / Customer** | Lightweight **buyer account** (email + payment methods + tickets). No workspace. | No | V1.5 |
| **Event Organizer / Planner** | Workspace `type=organizer` — today's `(app)`. The core SaaS customer. | Yes | V1 |
| **Venue Operator** | Workspace `type=venue` — manages venues, availability, bookings, payouts. | Yes | V2 (mgmt tools partly V1.5) |
| **Supplier / Vendor** (DJ, decorator, promoter, designer, caterer, act) | Workspace `type=supplier` — lists services, takes RFQs/bookings, payouts. | Yes | V2 (portal in V1) |
| **Platform Admin** | Existing admin console (`/admin`). | n/a | V1 |

**Portal vs workspace rule:** a **portal** (token link) is for an external party touching *one* event
(a client viewing their event, a supplier confirming one job). A **workspace** is for a business
managing *its own* inventory and money. Suppliers/venues start as portal guests in V1 and graduate to
full workspaces in V2. Consumers are never workspaces.

---

## 2. Version strategy

### V1 — Event Delivery OS (B2B SaaS, organizer-only) — *harden what exists*
The current product, polished to enterprise bar. **One workspace type (organizer).** No consumer, no
marketplace, no Stripe Connect. Goal: a sellable, secure, deep single-tenant SaaS.

Scope: close the OS gaps from the audit —
- **Calendar hub** (cross-section + iCal)
- **AI Copilot v1** (chat + tools + metering; RAG optional in V1.5)
- **Automations** (Smart Rules → recipe/builder/run-log)
- **Productized portals** (client + supplier, **token-based**)
- **PWA / event-day offline mode**
- **Security/billing test harness** (RLS/IDOR/entitlement suites) + release sign-off
- Depth polish: event-detail finance, supplier scorecards, proposal builder, staffing

### V1.5 — Ticketing & consumer layer + platform foundation — *single-sided, low cold-start risk*
Introduces the **consumer** and the money-out rails, but **not** a two-sided marketplace. Organizers
sell tickets to *their own* audience.

Scope:
- **Consumer buyer accounts** (browse, buy, **manage multiple tickets**, transfers, refunds, QR wallet)
- **Ticketing**: public event pages, ticket types/tiers, Stripe checkout, QR check-in (builds on `event_guests`)
- **Floor plan / seating** deepened (capacity + guest/seat assignment)
- **`workspace_type` architecture scaffolding** (column + resolver; venue/supplier flagged off)
- **Stripe Connect (lite)** for organizer payouts on ticket sales — the spine V2 will extend
- **Public event page per organizer** (their events only — not yet an aggregated directory)
- Revenue: **2.5% ticket fee + 1% seller admin fee + processor fees**

### V2 — Multi-sided marketplace — *the platform flywheel*
Venue + supplier workspaces go live; three marketplaces open on top of the Connect spine.

Scope:
- **Venue Operator + Supplier workspaces** (full management surfaces)
- **Marketplaces**: venue, supplier, and **public events directory** (cross-organizer consumer discovery)
- **Stripe Connect (full)**: connected accounts, separate charges & transfers, take-rate application fees
- **Escrow** (milestone-delayed transfers; release on completion/check-in/approval)
- **Disputes centre** (buyer↔organizer; organizer↔venue/supplier) with evidence + resolution states
- **Trust & safety**: reviews/ratings, ID + supplier verification, moderation
- **Multi-party accounting**: per-workspace P&L, payout statements, **light GL + Xero/QuickBooks export**
- **Featured listings / promotion** (ad revenue)
- Revenue: **5.5% supplier commission**, venue booking take-rate (recommend 3–5%), operators free to join, plus all V1.5 ticket fees

---

## 3. Master feature → version → gate matrix

Legend: ✅ in version · ➕ extended · 🚩 flagged off (scaffolded) · — n/a

| Feature area | V1 | V1.5 | V2 | Plan gate (SaaS) |
|---|----|----|----|---|
| Events / suppliers / tasks / library | ✅ | ➕ | ➕ | Starter+ |
| Finance (quotes/invoices/payments/profit) | ✅ | ➕ | ➕ GL/export | Growth+ |
| Calendar hub | ✅ | ➕ | ➕ | Growth+ |
| AI Copilot | ✅ chat+tools | ➕ RAG/memory | ➕ | **Scale+** |
| Automations | ✅ Smart Rules | ➕ builder/recipes | ➕ webhooks | Scale+ |
| Portals (client/supplier, token) | ✅ | ➕ | ➕→workspaces | Growth+ |
| PWA / event-day offline | ✅ | ➕ | ➕ | all |
| Consumer buyer accounts | — | ✅ | ➕ | n/a (free) |
| Ticketing (public pages, checkout, QR) | 🚩 | ✅ | ➕ | Scale+ to sell |
| Floor plan / seating | 🚩 shell | ✅ | ➕ | Growth+ |
| `workspace_type` (venue/supplier) | 🚩 | 🚩 scaffold | ✅ | n/a |
| Stripe Connect | — | ✅ lite (payouts) | ✅ full | n/a |
| Venue marketplace | — | — | ✅ | take-rate |
| Supplier marketplace | — | — | ✅ | 5.5% |
| Public events directory | — | — | ✅ | n/a |
| Escrow / disputes | — | — | ✅ | n/a |
| Reviews / verification / trust&safety | — | — | ✅ | n/a |
| Multi-party accounting / GL | — | — | ✅ | Enterprise |

---

## 4. Feature-flag architecture (V1 / V1.5 / V2 gating)

You already have the **DB primitives**: `feature_flags` table, `has_plan`/`has_addon`/`has_role`/
`get_plan_limit` RPCs, `billing_plans`, `founder_entitlements`, and an admin `/admin/feature-flags`
surface. What's missing is a **TS resolver layer** and two new dimensions: **release stage (version)**
and **workspace type**. Build this:

### 4.1 New dimensions
- **`workspaces.workspace_type`** — `organizer | venue | supplier` (new column; default `organizer`).
- **`workspaces.release_stage`** (or platform-global `RELEASE_STAGE` env) — `v1 | v1_5 | v2`. Per-workspace
  allows early-access/beta cohorts; global env is the default rollout.

### 4.2 Flag registry (`src/lib/flags/registry.ts` — NEW)
Each feature declares its gates declaratively:
```ts
// shape, not final code
export const FLAGS = {
  ticketing:        { minVersion: 'v1_5', workspaceTypes: ['organizer'], planGate: 'scale',  default: 'off' },
  marketplaceVenue: { minVersion: 'v2',   workspaceTypes: ['organizer','venue'], default: 'off' },
  marketplaceSupplier:{ minVersion:'v2',  workspaceTypes: ['organizer','supplier'], default: 'off' },
  aiCopilot:        { minVersion: 'v1',   workspaceTypes: ['organizer'], planGate: 'scale',  default: 'on'  },
  automationsBuilder:{minVersion: 'v1_5', planGate: 'scale', default: 'off' },
  escrow:           { minVersion: 'v2',   default: 'off' },
  // …
} as const
```

### 4.3 Resolver (`src/lib/flags/resolve.ts` — NEW)
```
resolveFlags({ workspaceType, plan, releaseStage, overrides }) →
  1. start from registry defaults
  2. drop any flag whose minVersion > current releaseStage          // version gate
  3. drop any flag whose workspaceTypes ∌ workspaceType             // persona gate
  4. apply planGate via has_plan() (entitlement)                    // tier gate
  5. apply per-workspace overrides from `feature_flags` table       // beta / kill-switch
  → final boolean map, resolved once in the layout, passed via context
```
Mirror Propvora's pattern: resolve **once at the layout level**, gate centrally, so sub-routes can't
leak a hidden tab.

### 4.4 Env master switches (big-surface kill switches)
`NEXT_PUBLIC_TICKETING_ENABLED`, `NEXT_PUBLIC_MARKETPLACE_ENABLED`, `NEXT_PUBLIC_CONSUMER_ENABLED`,
`STRIPE_CONNECT_ENABLED`, `ESCROW_ENABLED` — default **off**; flip per environment. This lets V1.5/V2
code ship dark into production and be enabled when ready (Propvora's approach).

### 4.5 Rollout discipline
- Ship V1.5/V2 code behind flags **off**, into the same prod deploy — no long-lived branches.
- Enable per-workspace for beta cohorts before global flip.
- Every gate enforced **server-side** (resolver runs in server components / RPCs), never trusted from client.

---

## 5. Pricing & revenue model

### 5.1 SaaS subscriptions (primary revenue — organizer workspaces)
| Tier | £/mo | Seats | Gates |
|------|------|-------|-------|
| Starter | £39 | 2 | Events, suppliers, tasks, basic finance, 1 client portal. No AI/automations. |
| Growth | £119 | 5 | + Full finance, supplier portal, proposals, calendar hub, floor plans, basic Smart Rules. |
| **Scale** | £249 | 10 | + **AI Copilot**, **automations builder**, **ticketing (sell)**, branded portals. |
| Agency/Pro | £449 | 20 | + Multi-workspace, advanced staffing, white-label, priority support. |
| Enterprise | Custom | ∞ | + SSO/SAML, BYOK AI, SLA, GL + accounting export, dedicated onboarding. |

**Venue & supplier workspaces:** **free to join** the platform/marketplace (monetized by take-rate).
Optional paid upgrades later (premium listing, analytics, multi-venue) — not V2 launch.

### 5.2 Marketplace / transaction fees (V1.5 tickets, V2 marketplace)
| Stream | Fee | Who pays | Version |
|--------|-----|----------|---------|
| **Ticket sales** | **2.5%** platform + **1%** seller admin fee | buyer (platform %) + seller (admin %) | V1.5 |
| **Supplier bookings** | **5.5%** commission | supplier (deducted from payout) | V2 |
| **Venue bookings** | take-rate **3–5%** (recommend; confirm) | venue operator (from payout) | V2 |
| **Payment processing** | **passed through** (Stripe fees) | as configured | V1.5+ |
| **Featured / promoted listings** | flat or CPC | seller | V2 |

> Add-ons (all versions): AI credit packs (£20–£29), extra seats/storage/workspaces.

### 5.3 Worked example (ticket, V1.5)
£50 ticket → platform 2.5% (£1.25) + seller admin 1% (£0.50) + Stripe (~1.5%+20p ≈ £0.95 passthrough).
Organizer nets ≈ £47.25; platform earns ≈ £1.75 + margin. Multiply by volume = usage revenue that
scales with customer success.

---

## 6. Marketplace mechanics (high level)

### 6.1 Stripe Connect spine
- Connected account per money-receiving workspace (organizer/venue/supplier); KYC handled by Stripe.
- **Separate charges & transfers** (or destination charges) so the platform can hold + split funds.
- **Application fee** = the take-rate above, collected automatically.
- Schema already hints: `set_workspace_stripe_connect_account`, `stripe_reconciliation_runs`, `dunning_events`.

### 6.2 Escrow (high level)
- **Not** custodial fund-holding (avoids money-transmission/safeguarding licensing). Implemented as
  **delayed Connect transfers**: charge buyer → funds held on platform balance → **transfer to seller on
  trigger** (event completion / check-in confirmed / approval / dispute-window elapsed).
- States: `held → released → refunded → disputed`. Configurable hold window per marketplace.
- **⚠️ Get a short legal/compliance check** before enabling `ESCROW_ENABLED` in production.

### 6.3 Disputes centre (high level)
- Two dispute axes: **buyer ↔ organizer** (tickets) and **organizer ↔ venue/supplier** (services).
- Evidence upload (reuse `quote_files`/evidence patterns), threaded messages, resolution states
  (`open → evidence → resolved → refunded/upheld`), admin arbitration, Stripe chargeback linkage.
- Escrow release is **blocked while a dispute is open**.

---

## 7. Build sequence (waves)

**V1 (harden):** Calendar hub → AI Copilot v1 → Automations builder → productized portals → PWA/event-day
→ security/billing test harness + release sign-off.

**V1.5 (consumer + ticketing + foundation):** `workspace_type` scaffold + flag resolver → consumer buyer
accounts → ticketing (event pages, types, checkout, QR) → Stripe Connect lite (organizer payouts) →
floor-plan/seating depth → AI RAG/memory.

**V2 (marketplace):** Stripe Connect full → venue workspace + venue marketplace → supplier workspace +
supplier marketplace → escrow → disputes centre → reviews/verification/trust&safety → public events
directory → multi-party accounting/GL + Xero/QuickBooks export → featured listings.

---

## 8. Immediate next steps (proposed)
1. Add `workspace_type` + `release_stage` columns and build `src/lib/flags/{registry,resolve}.ts` (unblocks everything; safe to do in V1).
2. Spec the **first V1 build** in detail (recommend **Calendar hub** — lowest risk, universally expected) as schema + routes + components.
3. In parallel, spec **AI Copilot v1** (flagship) so it can start once the flag layer lands.

> Each wave item becomes its own detailed spec doc under `docs/specs/` when picked up.
