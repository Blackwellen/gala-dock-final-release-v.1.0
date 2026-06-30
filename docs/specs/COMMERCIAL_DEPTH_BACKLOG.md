# Gala Dock — Commercial-Depth Backlog (shell, marketplace, affiliates, automations, marketing)

Captured from the product brief. Each is a real build phase; sequence + sizing below.

## 1. Workspace shell top bar (high value, mostly small)
- **Quick "New" create menu** — exists in TopNav ✅ (make persona-aware).
- **Global search** — wire the search button to a real command/search palette (cross-section, RLS-scoped).
- **Notifications** — wire the bell to `notifications` table (unread count, dropdown, mark-read, link to record).
- **Copilot button** — open the Gala Copilot panel from the top bar.
- **Workspace switcher** — sidebar strip → real switcher (list user's workspaces, switch active, create new).

## 2. Settings model (3 types only)
- **Account** (everyone) → lives in the **avatar dropdown**. (profile, security, notifications, prefs)
- **Workspace** (admin/manager only) → sidebar Settings.
- **Billing** (admin/manager only) → sidebar Settings.
- Remove the sprawling 18-item settings list from the avatar dropdown.

### 2a. Settings gate — follow-up
- Hard-gated server pages: billing, workspace, team, branding → `requireWorkspaceManager()` ✅
- Account-tier pages pass real `canManageWorkspace` so non-managers don't see admin nav groups ✅
- **TODO**: 9 admin pages are client components (usage, roles, audit, data-export, affiliate,
  smart-rules, event/supplier/finance-defaults) — wrap each in a server gate (`requireWorkspaceManager`)
  for hard URL protection. Writes are already RLS-protected; this is defence-in-depth + nav polish.
- **TODO**: `security` page is client + account-tier — convert to server so it can pass `canManageWorkspace`.

## 3. Affiliates — 2-tier + direct-to-customer
- **Tier-1 affiliate** signs up → earns on referred customer sales.
- **Tier-2 (sub-affiliate)**: an affiliate recruits other affiliates → earns an **override** on their sub-affiliates' sales.
- **Direct-to-customer affiliate**: affiliate refers buyers directly (ticket/marketplace purchases).
- Schema: `affiliate_accounts.parent_affiliate_id`, override-rate, multi-level commission ledger.
- Surface an **Affiliate panel in every dashboard/workspace** (referral link, earnings, sub-affiliates).

## 4. Marketplaces (kept SEPARATE per persona) — Airbnb-grade
Premium enterprise surfaces (16:9 cards, Airbnb-style search):
- **Discovery**: search (by supplier/service/product/venue), **search types**, **filters**, **map search**, **favourites**, premium **16:9 listing cards**.
- **Listing/profile pages**: item pages · services pages · seller/supplier profile pages · review pages · ratings.
- **Booking + purchase**: booking pages · purchase pages · **checkout** · **escrow** · receipts.
- **Post-sale**: after-booking/purchase info page · **after-booking management** · **delivery tracking** · order management.
- **Disputes**: staged dispute system (open→evidence→resolution) tied to escrow.
- **Seller console**: listing management · profile management · order management · payouts.
- Ties to: V2-1 Stripe Connect, V2-5 escrow, V2-6 disputes, 15-4 checkout (done).

## 5. Automations — full canvas (V1-3 / AUTOMATIONS_ARCHITECTURE.md)
- **Drag-drop DAG canvas builder** (needs a flow lib, e.g. @xyflow/react).
- **50–150 nodes** (registry has 70+ ✅ — expand) and **50–150 templates/recipes** (have ~14 ✅ — expand).
- **Webhooks** (inbound/outbound) + **integrations** (Stripe/Resend/Xero/calendar/maps) wired.
- Runs/logs, approvals, queue/cron workers.

## 6. Onboarding — persona-aware (PA-1)
Upgrade for the new workspace-type setup: choose persona (organizer/venue/supplier) → tailored steps →
demo data → first-value → invite team → activation tracking.

## 7. Tabbing systems — full depth pass
Apply the `SectionTabs` pattern (Overview-first; view-types as switchers) to **every** section
(Finance, Tasks, Team, Library, Admin) + premium design upgrade. See WORKSPACE_NAV_AUDIT.md.

## 8. Marketing / landing pages — enterprise premium
Full-depth upgrade: hero imagery/screenshots, animated stats, feature grids, comparison tables,
testimonials, logo wall, premium pricing, use-case pages.

## Sizing
S = shell items (1,2 top bar/settings); M = onboarding, tabbing, affiliate schema; L/XL = marketplace
surfaces, automations canvas, marketing overhaul. Sequence: shell → settings → affiliates → tabbing →
onboarding → marketplace → automations canvas → marketing.
