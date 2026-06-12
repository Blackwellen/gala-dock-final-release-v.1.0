# Gala Dock — V1/V1.5 Build Plan

## Product
Event Delivery OS for planners, agencies, venues and event teams.
Brand: #4F46E5 indigo — white-first — premium enterprise design.

---

## Phase Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Foundation — design tokens, routing, shells, nav | ✅ DONE |
| 2 | Events — register + detail (all 8 tabs) | ⏳ Next |
| 3 | Suppliers — register + detail (all 6 tabs) | ⬜ |
| 4 | Tasks — all views + detail | ⬜ |
| 5 | Finance — quotes, invoices, payments, profit | ⬜ |
| 6 | Library — files, templates, event packs | ⬜ |
| 7 | Settings — all 18 sections | ⬜ |
| 8 | Auth — login, signup, OTP, MFA, onboarding | ⬜ |
| 9 | Admin dashboard — all 14 sections | ⬜ |
| 10 | Public website — landing, features, pricing, legal | ⬜ |
| 11 | Gala Copilot bubble + Inbox | ⬜ |
| 12 | Client portal + Supplier portal | ⬜ |
| 13 | Smart Rules engine UI | ⬜ |
| 14 | Stripe billing + subscription gates | ⬜ |
| 15 | Supabase/RLS wiring | ⬜ |
| 16 | UI polish pass (Level 8) | ⬜ |
| 17 | Tests + release scorecard (Level 9) | ⬜ |

---

## Route Registry

### App Routes (`/app/*`)
- `/app/home` — Home dashboard
- `/app/events` — Events register
- `/app/events/new` — New event wizard
- `/app/events/:eventId` — Event detail
- `/app/events/:eventId/edit` — Edit event
- `/app/events/:eventId/event-day` — Event day mode
- `/app/events/:eventId/export` — Export event pack
- `/app/suppliers` — Suppliers register
- `/app/suppliers/new` — Add supplier
- `/app/suppliers/:supplierId` — Supplier detail
- `/app/suppliers/:supplierId/edit` — Edit supplier
- `/app/tasks` — Tasks register
- `/app/tasks/new` — New task
- `/app/tasks/:taskId` — Task detail
- `/app/tasks/calendar` — Task calendar
- `/app/tasks/templates` — Task templates
- `/app/finance` — Finance overview
- `/app/finance/quotes` — Quotes list
- `/app/finance/quotes/new` — New quote
- `/app/finance/quotes/:quoteId` — Quote detail
- `/app/finance/invoices` — Invoices list
- `/app/finance/invoices/new` — New invoice
- `/app/finance/invoices/:invoiceId` — Invoice detail
- `/app/finance/payments` — Payments
- `/app/finance/profit` — Profit analysis
- `/app/library` — Library overview
- `/app/library/files` — Files
- `/app/library/files/:fileId` — File detail
- `/app/library/templates` — Templates
- `/app/library/templates/new` — New template
- `/app/library/templates/:templateId` — Template detail
- `/app/library/event-packs` — Event packs
- `/app/library/brand-assets` — Brand assets
- `/app/library/supplier-docs` — Supplier docs
- `/app/settings/account` — Account settings
- `/app/settings/security` — Security
- `/app/settings/preferences` — Preferences
- `/app/settings/workspace` — Workspace
- `/app/settings/branding` — Branding
- `/app/settings/team` — Team management
- `/app/settings/roles` — Roles & permissions
- `/app/settings/billing` — Billing
- `/app/settings/usage` — Usage
- `/app/settings/supplier-defaults` — Supplier defaults
- `/app/settings/event-defaults` — Event defaults
- `/app/settings/finance-defaults` — Finance defaults
- `/app/settings/smart-rules` — Smart Rules
- `/app/settings/ai` — AI settings
- `/app/settings/affiliate` — Affiliate
- `/app/settings/notifications` — Notifications
- `/app/settings/data-export` — Data export
- `/app/settings/audit` — Audit log

### Admin Routes (`/admin/*`)
- `/admin` — Admin overview
- `/admin/users` — Users list
- `/admin/users/:userId` — User detail
- `/admin/workspaces` — Workspaces
- `/admin/workspaces/:workspaceId` — Workspace detail
- `/admin/subscriptions` — Subscriptions
- `/admin/subscriptions/:subscriptionId` — Subscription detail
- `/admin/affiliates` — Affiliates
- `/admin/affiliates/:affiliateId` — Affiliate detail
- `/admin/support` — Support tickets
- `/admin/support/:ticketId` — Ticket detail
- `/admin/audit` — Audit logs
- `/admin/feature-flags` — Feature flags
- `/admin/system-health` — System health
- `/admin/email-logs` — Email logs
- `/admin/ai-usage` — AI usage
- `/admin/automation-runs` — Automation runs
- `/admin/storage-usage` — Storage usage
- `/admin/security` — Security

### Auth Routes
- `/login` — Login (email/password + OTP option)
- `/signup` — Sign up
- `/forgot-password` — Forgot password
- `/reset-password` — Reset password
- `/verify-email` — Email verification
- `/otp` — OTP code entry
- `/mfa` — MFA challenge
- `/accept-invite` — Accept workspace invite

### Onboarding Routes
- `/onboarding/account` — Account profile
- `/onboarding/workspace` — Create workspace
- `/onboarding/role` — Select role
- `/onboarding/plan` — Choose plan/trial
- `/onboarding/demo-data` — Demo data
- `/onboarding/first-event` — First event
- `/onboarding/invite-team` — Invite team
- `/onboarding/complete` — Completion

### Marketing Routes
- `/` — Landing page
- `/product` — Product overview
- `/features` — Features
- `/pricing` — Pricing
- `/security` — Security page
- `/contact` — Contact
- `/book-demo` — Book a demo
- `/waitlist` — Waitlist
- `/demo` — Live demo
- `/help` — Help centre
- `/status` — System status
- `/affiliate` — Affiliate programme
- `/use-cases/event-planners`
- `/use-cases/venues`
- `/use-cases/agencies`
- `/use-cases/corporate-events`
- `/use-cases/weddings`
- `/use-cases/suppliers`
- `/legal/privacy`
- `/legal/terms`
- `/legal/cookies`
- `/legal/acceptable-use`
- `/legal/refund-policy`
- `/legal/affiliate-terms`
- `/legal/data-processing`
- `/legal/subprocessors`

---

## Sidebar Registry

### App Sidebar (7 items — fixed)
1. Home → `/app/home`
2. Events → `/app/events`
3. Suppliers → `/app/suppliers`
4. Tasks → `/app/tasks`
5. Finance → `/app/finance`
6. Library → `/app/library`
7. Settings → `/app/settings/account`

### Admin Sidebar (14 items)
1. Admin Overview → `/admin`
2. Users → `/admin/users`
3. Workspaces → `/admin/workspaces`
4. Subscriptions → `/admin/subscriptions`
5. Affiliates → `/admin/affiliates`
6. Support → `/admin/support`
7. Audit Logs → `/admin/audit`
8. Feature Flags → `/admin/feature-flags`
9. System Health → `/admin/system-health`
10. Email Logs → `/admin/email-logs`
11. AI Usage → `/admin/ai-usage`
12. Automation Runs → `/admin/automation-runs`
13. Storage Usage → `/admin/storage-usage`
14. Security → `/admin/security`

---

## Design Token Register

| Token | Value | Usage |
|-------|-------|-------|
| `brand-600` | `#4F46E5` | Primary CTA, active nav, links |
| `brand-700` | `#4338CA` | Hover state |
| `brand-50` | `#EEF2FF` | Icon backgrounds, hover bg |
| `sidebar` | `#0E0C27` | Sidebar background |
| `sidebar-active` | `#2D2B6B` | Active nav item bg |
| `surface-50` | `#F8F9FB` | Page background |
| `surface-200` | `#E4E7EF` | Border default |
| `surface-900` | `#141828` | Text primary |
| `success-600` | `#16A34A` | Confirmed/paid states |
| `warning-600` | `#D97706` | Pending/at-risk states |
| `danger-600` | `#DC2626` | Overdue/error states |

---

## Level 1–9 Build Depth Target

Every section must reach:
- **Level 8** visually before release
- **Level 9** for test/release evidence

Current levels after Phase 1:
- Home: Level 4 (real layout, seed data, buttons linked)
- Events register: Level 4
- All other pages: Level 1 (route + shell)
- Login: Level 5 (full form UI, all states)

---

## Phase 1 Deliverables (COMPLETE)

- [x] Design tokens (globals.css — full brand palette, sidebar, surface, semantic)
- [x] Root layout + metadata + favicon
- [x] `lib/utils.ts` (cn, formatCurrency, formatDate, formatRelative, initials)
- [x] `AppSidebar` — 7-item dark indigo sidebar, active state, workspace strip
- [x] `TopNav` — breadcrumb, search, Quick Create, Copilot, notifications, user menu
- [x] `AdminSidebar` — 14-item admin nav + back-to-app link
- [x] `(app)/layout.tsx` — app shell with mobile sidebar overlay
- [x] `admin/layout.tsx` — admin shell with admin mode badge
- [x] `(auth)/layout.tsx` — clean white auth shell
- [x] `(marketing)/layout.tsx` — marketing shell with nav + footer
- [x] `onboarding/layout.tsx` — onboarding shell
- [x] `MarketingNav` — sticky nav with mobile menu
- [x] `MarketingFooter` — full 4-column footer
- [x] `PageHeader` — reusable title + actions + tabs bar
- [x] `MetricCard` + `KPIGrid` — KPI card primitives
- [x] `StatusBadge` — 24 status variants
- [x] `EmptyState` + `LoadingSkeleton` — placeholder components
- [x] `SectionShell` — Level-1 stub page wrapper
- [x] Login page — premium split-panel, email/password + OTP option
- [x] Home page — KPIs, upcoming events, overdue tasks, AI briefing, quick actions
- [x] Events register — table view, tabs, status badges, toolbar
- [x] 112 route stubs — all routes created at Level 1

---

## Phase 2 Plan — Events Deep Build

Priority: Event register (all tabs) + Event detail (all 8 tabs) + New Event wizard

Files to build:
- `events/page.tsx` — full register with all 9 tabs, filter, saved views, card/calendar views
- `events/new/page.tsx` — 8-step wizard with AI brief generation step
- `events/[eventId]/page.tsx` — Overview tab (full command centre)
- `events/[eventId]/page.tsx` (Brief tab) — rich brief editor
- `events/[eventId]/page.tsx` (Suppliers tab) — quote comparison, RFQ flow
- `events/[eventId]/page.tsx` (Tasks tab) — event task board
- `events/[eventId]/page.tsx` (Run Sheet tab) — timeline editor
- `events/[eventId]/page.tsx` (Finance tab) — budget vs actual
- `events/[eventId]/page.tsx` (Files tab) — upload-only file grid
- `events/[eventId]/page.tsx` (Activity tab) — audit timeline

Target depth: Level 5–6 (functional buttons, Supabase-ready, role gates mocked)
