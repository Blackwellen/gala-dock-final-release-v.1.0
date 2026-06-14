# Gala Dock Build-Grade Repo Audit

**Date:** 13 June 2026  
**Product:** Gala Dock  
**Company:** Blackwellen  
**Repo:** `gala-dock-final-release-v.1.0`  
**Stack observed:** Next.js 16.2.9, React 19.2.4, Supabase client packages, Tailwind CSS v4, Vercel config

---

## A) Executive Summary

Gala Dock is currently a broad, premium-looking SaaS product shell for event planners, agencies, venues, and event teams. It has a large route surface, polished layouts, marketing pages, admin screens, onboarding, auth screens, events, suppliers, tasks, finance, library, settings, and an AI Copilot UI.

The launch-readiness reality is different from the visual depth: most core product workflows are UI-only or local-state demos. Supabase auth is partly wired for login/session protection, but business data is not wired end-to-end to Supabase tables, API routes, RLS-backed mutations, Stripe, transactional email, exports, file storage, or real AI.

### What The Product Can Do Today

- Present a convincing marketing website with product, features, pricing, demo, use-case, security, status, help, affiliate, and legal pages.
- Show a full app shell with home dashboard, events, suppliers, tasks, finance, library, and settings.
- Render detailed event, supplier, task, quote, invoice, admin, and settings pages using hardcoded data.
- Authenticate an existing user through Supabase email/password login.
- Gate app routes with a Next.js 16 `proxy.ts` session check.
- Show onboarding, signup, reset, OTP, MFA, and invite flows visually.
- Show AI/Copilot interactions in mock mode.
- Provide Supabase TypeScript domain types for a multi-tenant event-management data model.

### Who It Is Suitable For Today

Today it is suitable for:

- Founder demos.
- Investor/product walkthroughs.
- Sales discovery demos where the viewer understands workflows are not fully wired.
- Design validation and commercial positioning work.
- As a frontend scaffold for a real build.

It is not suitable yet for:

- Paying customers.
- Production event delivery.
- Real client/supplier data.
- Compliance-sensitive document handling.
- Multi-tenant SaaS launch.
- Stripe billing launch.

### Biggest Launch Risks

1. Business data is not persisted for the core modules.
2. Supabase migrations, RLS policies, and storage policies are not present in the repo.
3. Signup, onboarding, reset, OTP, MFA, and invite flows simulate success instead of completing real auth/account setup.
4. Stripe billing is not implemented despite billing/subscription UI and schema fields.
5. File upload/export/document workflows are mostly UI-only.
6. AI features are mock-only.
7. Lint fails with release-blocking errors.
8. No automated test suite was found.
9. Tenant isolation cannot be verified from repo artifacts.
10. Admin pages show sensitive platform concepts but are backed by static sample data and no real authorization checks.

### Estimated Effort Bands

| Goal | Effort |
|---|---:|
| Fix lint/build blockers only | S |
| Make one core workflow real end-to-end, e.g. login plus event creation/list/detail | M |
| Launch-ready MVP with auth, workspace, events, suppliers, tasks, files, finance basics, RLS | L |
| Commercially competitive release with billing, proposals, client portal, guest management, inbox, reports, AI | XL |

---

## B) Architecture Map

### Frontend Structure

The app uses the Next.js App Router with route groups:

- `src/app/(marketing)` - public marketing website.
- `src/app/(auth)` - login, signup, password reset, OTP, MFA, invites.
- `src/app/(app)` - authenticated SaaS app shell.
- `src/app/admin` - platform admin shell.
- `src/app/onboarding` - onboarding wizard.

Key app routes include:

- `/app/home`
- `/app/events`
- `/app/events/new`
- `/app/events/[eventId]`
- `/app/events/[eventId]/edit`
- `/app/events/[eventId]/event-day`
- `/app/events/[eventId]/export`
- `/app/suppliers`
- `/app/tasks`
- `/app/finance`
- `/app/library`
- `/app/settings/*`
- `/admin/*`

Important shell/components:

- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/TopNav.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/components/layout/MarketingNav.tsx`
- `src/components/copilot/GalaCopilot.tsx`
- `src/components/ui/*`
- `src/components/events/*`

### Backend Structure

Observed backend code is minimal:

- `src/lib/supabase/client.ts` - browser Supabase client.
- `src/lib/supabase/server.ts` - server Supabase client using async `cookies()`, compatible with modern Next.
- `src/lib/supabase/admin.ts` - service-role Supabase client helper.
- `src/lib/supabase/types.ts` - hand-authored or generated-looking database type definitions.
- `src/proxy.ts` - Next.js 16 request proxy for auth session refresh and route gating.

Not found:

- `src/app/api/**/route.ts` API route handlers.
- Supabase migration files.
- Supabase RLS policy SQL files.
- Supabase Edge Functions.
- Storage bucket definitions/policies.
- Stripe webhook routes.
- Email provider routes.
- Background jobs or queues.

### Auth & Tenancy Model

Auth is partially implemented:

- Login calls `supabase.auth.signInWithPassword`.
- `proxy.ts` calls `supabase.auth.getUser()` and redirects unauthenticated users away from non-public routes.
- Auth route redirects logged-in users from `/login` and `/signup` to `/home`.

Tenancy is implied but not proven:

- Core types include `workspace_id` on almost all business entities.
- `workspaces`, `workspace_members`, and `profiles` exist in TypeScript types.
- No verified SQL migrations or RLS policies were found.
- No app-level workspace resolver was found in the core page modules.

Risk: tenant isolation cannot be accepted as production-ready until database policies and route-level authorization are implemented and tested.

### Billing Model

Billing is implied by types and UI:

- `billing_subscriptions` exists in TypeScript types.
- `workspaces` has Stripe Connect fields.
- `invoices` has `stripe_payment_link_url`.
- Admin subscription pages show sample Stripe IDs.

Billing is not implemented:

- No `stripe` dependency in `package.json`.
- No checkout route.
- No billing portal route.
- No webhook route.
- No subscription status enforcement.
- No plan usage gates.
- No invoice/payment-link route.

---

## C) Feature Inventory

| Feature / Module | Current Status | Where In Code | Data Tables Involved | Known Issues |
|---|---|---|---|---|
| Marketing website | Partially working | `src/app/(marketing)/*` | None | Mostly static. Contact/book-demo forms simulate submission. |
| Legal pages | UI/static | `src/app/(marketing)/legal/*` | None | Needs legal review and jurisdiction-specific terms. |
| Login | Partially working | `src/app/(auth)/login/login-form.tsx` | Supabase Auth | Existing users can sign in if Supabase env is valid. |
| Signup | UI only | `src/app/(auth)/signup/signup-form.tsx` | Supabase Auth, profiles, workspaces | Simulates success and routes to onboarding. No real account creation. |
| Forgot/reset password | UI only / partial | `src/app/(auth)/forgot-password/*`, `reset-password/*` | Supabase Auth | Simulates send/reset states. |
| OTP/MFA | UI only | `src/app/(auth)/otp/*`, `mfa/*` | Supabase Auth factors | Simulates flows. |
| Accept invite | UI only | `src/app/(auth)/accept-invite/*` | workspace_members, invites | No real invite token handling found. |
| Route protection | Partially working | `src/proxy.ts` | Supabase Auth | App routes protected, but `/api` is public by prefix. Needs review before APIs are added. |
| Onboarding | UI only | `src/app/onboarding/*` | profiles, workspaces, workspace_members | Simulated saves and redirects. |
| Home dashboard | UI only | `src/app/(app)/home/page.tsx` | events, tasks, invoices, suppliers | Hardcoded KPI arrays. |
| Events register | UI only | `src/app/(app)/events/page.tsx` | events | Hardcoded `EVENTS`. Filters/tabs do not query data. |
| New event wizard | UI only | `src/app/(app)/events/new/page.tsx` | events, event_tasks, event_suppliers, files | Simulated save/create. No insert. |
| Event detail | UI only | `src/app/(app)/events/[eventId]/page.tsx` | events and related tables | Uses one hardcoded event regardless of `eventId`. |
| Event edit | UI only | `src/app/(app)/events/[eventId]/edit/page.tsx` | events | Simulated save. |
| Event day mode | UI/local state | `src/app/(app)/events/[eventId]/event-day/page.tsx` | event_run_sheet_items | Local interactions only. |
| Event export | Stub | `src/app/(app)/events/[eventId]/export/page.tsx` | many | No real document generation found. |
| Suppliers register/detail | UI only | `src/app/(app)/suppliers/*` | suppliers, event_suppliers, files | Hardcoded suppliers and tabs. |
| New supplier | UI only | `src/app/(app)/suppliers/new/page.tsx` | suppliers | Simulated create. |
| Tasks | UI/local state | `src/app/(app)/tasks/*` | tasks | Static/task local actions. |
| Finance overview | UI only | `src/app/(app)/finance/page.tsx` | quotes, invoices, payments | Static arrays. Some route pushes miss `/app`. |
| Quotes | UI only | `src/app/(app)/finance/quotes/*` | quotes, quote_lines | Static lists/forms. |
| Invoices | UI only | `src/app/(app)/finance/invoices/*` | invoices, invoice_line_items | Static lists/forms. No payment handling. |
| Payments | Stub | `src/app/(app)/finance/payments/page.tsx` | invoices/payments | Placeholder route. |
| Profit analysis | Stub/UI | `src/app/(app)/finance/profit/page.tsx` | quotes, invoices, expenses | No real calculations from DB. |
| Library/files | UI only | `src/app/(app)/library/*` | library_assets, storage | File upload controls exist, but no storage upload flow. |
| Settings | UI only | `src/app/(app)/settings/*` | profiles, workspaces, members, settings | Most settings save through local state only. |
| Team/roles | UI only | `src/app/(app)/settings/team`, `roles` | workspace_members | No invite/role enforcement. |
| Billing settings | UI only | `src/app/(app)/settings/billing` | billing_subscriptions | No Stripe integration. |
| Audit settings | UI only | `src/app/(app)/settings/audit` | audit logs | Static logs. No audit table in current types. |
| Smart rules | UI only | `src/app/(app)/settings/smart-rules` | smart_rules | No automation execution. |
| Admin panel | UI only | `src/app/admin/*` | all platform tables | Static sample data, no admin authz checks found. |
| Copilot | Mock only | `src/components/copilot/GalaCopilot.tsx` | would need workspace/event context | Canned response after timeout. |
| AI brief generation | Mock only | `src/app/(app)/events/new/page.tsx` | event brief data | Template generation only, no model call. |

---

## D) Build-Stage Plan

## Stage 1: Initial Build Completeness

### Objective

Make one coherent product slice real end-to-end: auth, workspace, events, suppliers, tasks, and files with tenant isolation.

### Checklist

- Add Supabase migrations for current `types.ts` entities.
- Add RLS policies for every tenant-owned table.
- Implement workspace bootstrap after signup.
- Replace hardcoded home/events/suppliers/tasks data with Supabase queries.
- Implement create/edit/delete/archive for events.
- Implement supplier creation and linking suppliers to events.
- Implement event task creation/completion.
- Implement file upload to Supabase Storage with signed URLs.

### Top Tasks

1. Create migration for `workspaces`, `profiles`, `workspace_members`.
2. Create migration for `events`, `event_tasks`, `event_suppliers`, `event_files`, `event_run_sheet_items`.
3. Create migration for `suppliers`, `tasks`, `quotes`, `quote_lines`, `invoices`, `invoice_line_items`, `library_assets`.
4. Add RLS policies using membership checks.
5. Wire signup to `supabase.auth.signUp`.
6. Wire onboarding workspace creation.
7. Wire `/app/events` list query.
8. Wire `/app/events/new` insert flow.
9. Wire `/app/events/[eventId]` query by route param and workspace membership.
10. Add basic error/loading/empty states around real data.

### Dependencies

- Supabase project and env vars.
- Database migration strategy.
- Seed/demo data strategy.

### Done Criteria

When a new user can sign up, create a workspace, create an event, see it in `/app/events`, open `/app/events/[eventId]`, add suppliers/tasks/files, sign out, sign back in, and see the same persisted data.

### Evidence

- PR link.
- Supabase migration files.
- Loom showing new signup through event creation.
- Screenshot of Supabase tables populated.
- Passing `npm run lint`, `npx tsc --noEmit`, `npm run build`.

---

## Stage 2: Upgrade Depth Build

### Objective

Turn the existing product surface into actual workflows instead of static pages.

### Checklist

- Event edit persists.
- Event day run sheet persists item completion/status.
- Supplier detail tabs query real related data.
- Task detail comments/attachments persist.
- Finance quote/invoice create/detail/list persist.
- Settings save to profile/workspace settings.
- Admin reads real platform data.
- Data export creates a real downloadable export.

### Top Tasks

1. Build shared workspace-aware data access helpers.
2. Add server actions or route handlers for core mutations.
3. Add optimistic updates only after real persistence exists.
4. Implement event edit form.
5. Implement run sheet CRUD.
6. Implement supplier document upload and status tracking.
7. Implement task comments and attachments.
8. Implement quote and invoice line-item persistence.
9. Implement workspace settings persistence.
10. Add basic audit logging around create/update/delete.

### Dependencies

- Stage 1 schema/RLS.
- Storage policy.
- Audit log design.

### Done Criteria

When all primary sidebar sections can create, read, update, and archive their core objects from real database rows, with workspace isolation verified.

### Evidence

- PR link.
- E2E smoke tests.
- Database rows and audit rows created during test.

---

## Stage 3: UI Design Upgrade

### Objective

Keep the current premium design but remove dead controls, broken paths, accessibility issues, and layout risk.

### Checklist

- Fix all lint errors and high-signal warnings.
- Fix route pushes that omit `/app`.
- Replace dead buttons with implemented actions or disabled/coming-soon states.
- Add proper alt text to images.
- Fix React compiler static component warnings.
- Fix unescaped entity lint errors.
- Normalize URL paths in sidebar/top-nav/actions.
- Add loading skeletons for real data queries.
- Add destructive action confirmations.

### Top Tasks

1. Fix `react/no-unescaped-entities` errors.
2. Move nested pricing `Cell` component outside render.
3. Remove sync setState effect in onboarding workspace slug generation.
4. Replace `Date.now()` render-purity issue in Copilot.
5. Remove forbidden `require()` usage in `MetricCard`.
6. Fix missing image alt attributes.
7. Fix unused imports/variables.
8. Fix wrong route pushes like `/finance/...` instead of `/app/finance/...`.
9. Add form-level validation and error messages.
10. Add mobile checks for core workflows.

### Dependencies

- None, can start immediately.

### Done Criteria

When `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass cleanly and primary pages have no obvious dead CTAs.

### Evidence

- Passing terminal output.
- Screenshots of core pages on desktop and mobile.

---

## Stage 4: Commercial Depth & Gap Analysis

### Objective

Add the missing workflows that make Gala Dock sellable against Planning Pod, HoneyBook, Aisle Planner, Dubsado, and venue-first platforms.

### Priority Commercial Gaps

1. Leads / enquiry CRM.
2. Proposals with e-signature.
3. Guest management and RSVP.
4. Communication inbox/log.
5. Reports and analytics.
6. Payment schedules.
7. BEO/event order export.
8. Form builder.
9. Online payment links.
10. Functional client portal.
11. Venue CRM.

### Top Tasks

1. Add `/app/leads` pipeline.
2. Add lead-to-event conversion.
3. Add proposal builder and public signature route.
4. Add event guests tab with CSV import.
5. Add inbox/conversation model.
6. Add reports section under finance or first-class route.
7. Add invoice payment schedules.
8. Add event export/BEO generation.
9. Add form builder and public form route.
10. Add tokenized client portal.

### Dependencies

- Stage 1 and Stage 2 persistence.
- Legal text for e-signature and client portal.
- Public token security design.

### Done Criteria

When a founder can demo lead intake to proposal signature to event creation to supplier/task/run-sheet/finance execution without leaving Gala Dock.

### Evidence

- End-to-end demo video.
- Public proposal signing URL.
- Public portal URL.
- Sample report/export PDF.

---

## Stage 5: Security / Compliance & Backend Hardening

### Objective

Make the product defensible for real customer data.

### Checklist

- RLS enabled on every tenant-owned table.
- Role-based authorization for owner/admin/member/viewer.
- Admin routes limited to platform admins.
- Storage buckets private by default.
- Signed URLs scoped and expiring.
- Audit logs for sensitive events.
- Data export and deletion workflows.
- Backup and recovery plan.
- Security headers and CSP review.
- Rate limits for public/token routes.

### Top Tasks

1. Write RLS policy tests.
2. Add workspace role helper functions.
3. Add audit log table and server-side logging helper.
4. Add storage bucket policies.
5. Add public token hashing/expiry model for portal/proposal/form routes.
6. Add admin route guard.
7. Add Stripe webhook signature validation once billing is implemented.
8. Add PII data inventory.
9. Add backup/restore runbook.
10. Add legal/compliance register.

### Dependencies

- Real DB schema.
- Hosting/deployment target.
- Legal/compliance assumptions.

### Done Criteria

When a user from Workspace A cannot read/write Workspace B data via UI, direct URL, browser client, API route, or Supabase client calls, and this is covered by tests.

### Evidence

- RLS test output.
- Security checklist.
- Audit log screenshots.
- Policy SQL in repo.

---

## Stage 6: Final Release Readiness

### Objective

Prepare the product for a controlled beta or paid launch.

### Checklist

- Clean production build.
- CI pipeline.
- Seed/demo tenant.
- Error monitoring.
- Usage analytics.
- Support inbox/process.
- Pricing and billing enabled.
- Legal pages reviewed.
- Beta onboarding guide.
- Backup/export/deletion process documented.

### Top Tasks

1. Add CI for lint/typecheck/build/tests.
2. Add Playwright smoke tests.
3. Add Supabase seed data.
4. Add monitoring/logging.
5. Add status/error pages.
6. Add support contact flow.
7. Add Stripe checkout and portal.
8. Add launch demo script.
9. Add beta cohort tracker.
10. Add release checklist.

### Dependencies

- Stages 1-5.

### Done Criteria

When a beta customer can pay or start a trial, onboard, create real work, receive support, export/delete data, and trust tenant isolation.

### Evidence

- CI passing.
- Production URL.
- Stripe test checkout.
- Beta onboarding Loom.
- Release checklist signed off.

---

## E) Security & Compliance Review

### RLS Posture

Current repo posture: not verifiable.

The TypeScript model strongly implies RLS-ready multi-tenancy because most tables carry `workspace_id`, but no migration or policy files were found. RLS must be treated as missing until SQL policies exist and are tested.

Required RLS pattern:

- Enable RLS on every tenant-owned table.
- Read/write only when `auth.uid()` is a member of the row workspace.
- Enforce role-based write permissions.
- Prevent client-side writes to admin-only fields.
- Soft-delete filtering should be consistent.

### File Upload / Storage Concerns

Current posture: UI exists, storage implementation not found.

Required:

- Private Supabase buckets.
- Upload path includes workspace ID.
- Server-side MIME/size validation.
- Signed URL generation only after membership check.
- Antivirus or malware-scanning decision before enterprise launch.
- File deletion/export policy.

### PII Handling

PII appears in intended data model:

- Client names/emails/phones.
- Supplier contacts.
- Team member data.
- Event guest data.
- Invoice/payment details.
- Uploaded documents.

Required:

- Privacy policy aligned with actual processors.
- DPA.
- Data export.
- Data deletion.
- Retention rules.
- Audit logs for access/change events.

### Audit Logging Gaps

Audit pages exist, but audit persistence was not verified.

Required events:

- Login/security events.
- Workspace/member/role changes.
- Billing/subscription changes.
- Event/supplier/task/invoice/proposal changes.
- File upload/download/delete.
- Public token access and signature events.
- Admin access and impersonation, if implemented.

### Backups + Disaster Recovery

Not found in repo.

Required:

- Supabase backup plan.
- Restore test cadence.
- Export process for customer-owned data.
- Incident response runbook.
- Recovery time objective and recovery point objective.

### Required Legal Pages / Policies

Some legal pages already exist, but need product-specific review:

- Privacy policy.
- Terms of service.
- Cookie policy.
- Acceptable use policy.
- Refund policy.
- Data processing agreement.
- Subprocessors.
- Affiliate terms.
- AI disclaimer.
- E-signature terms.
- Payment processing disclaimer.
- Event planning limitation of liability.
- Supplier/client portal acceptable-use language.

---

## F) QA & Release Readiness

### Current Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Failed |
| `npm run build` | Timed out after 120 seconds |
| Automated tests | Not found |

### Lint Blockers Observed

`npm run lint` reported 11 errors and 33 warnings. Key blockers:

- Unescaped entity errors in settings/data-export and pricing.
- React compiler error for nested `Cell` component in pricing.
- Synchronous `setState` inside effect in onboarding workspace page.
- `Date.now()` purity error in Copilot.
- Forbidden `require()` import in `MetricCard`.
- Several unused imports.
- Missing image alt attributes.

### Browser / Device Matrix Risks

Not verified in this audit. Given the large route surface, minimum matrix should be:

- Chrome desktop.
- Safari desktop.
- Edge desktop.
- iPhone Safari.
- Android Chrome.
- Tablet width for event-day mode.

### Performance Risks

- Many pages are client components with large hardcoded arrays.
- Real data loading patterns are not established.
- No pagination strategy verified.
- No caching/revalidation strategy verified.
- No bundle analysis.

### Error Handling / Observability Gaps

Not found:

- Error monitoring.
- Structured logging.
- Route-level error boundaries across core app routes.
- API error handling conventions.
- User-facing retry states.

### Deployment Pipeline Assumptions

Repo has:

- `vercel.json`
- `.env.example`
- `.vercel` directory

Missing/unclear:

- CI.
- Production env checklist.
- Supabase migration deploy process.
- Preview deployment checks.
- Stripe webhook environment setup.
- Monitoring setup.

---

## G) Data Model Summary

The TypeScript types define these core entities:

- Workspace and membership: `workspaces`, `profiles`, `workspace_members`.
- Event delivery: `events`, `event_tasks`, `event_suppliers`, `event_files`, `event_run_sheet_items`.
- Suppliers: `suppliers`.
- Tasks: `tasks`.
- Finance: `quotes`, `quote_lines`, `invoices`, `invoice_line_items`.
- Library: `library_assets`.
- Automation: `smart_rules`, `notifications`.
- Billing: `billing_subscriptions`.

Main relationships:

- A workspace has many members, events, suppliers, tasks, quotes, invoices, assets, smart rules, notifications, and subscriptions.
- An event belongs to a workspace and has tasks, suppliers, files, run-sheet items, quotes, and invoices.
- A supplier belongs to a workspace and can be linked to events.
- Quotes and invoices can link to events and suppliers.
- Library assets can link to workspace, owner, and optional entity references.

Important caveat: this is a type-level model. It does not prove the database schema has been migrated or protected in the deployed Supabase project.

---

## H) Commercial Positioning Snapshot

### One-Sentence Positioning

Gala Dock is an event delivery OS for agencies and professional planners that centralizes events, suppliers, run sheets, finance, files, and AI-assisted operations so teams can deliver complex events without spreadsheet chaos.

### Target Segments

- Event planning agencies.
- Wedding and gala planners.
- Corporate event teams.
- Venues that collaborate with planners, initially as planner-side venue CRM users.
- Roles: founder/planner, operations manager, event producer, finance/admin lead, supplier coordinator.

### Top Painful Problems

1. Event teams run delivery across fragmented spreadsheets, docs, inboxes, and supplier threads.
2. Supplier readiness, documents, quotes, and event-day logistics are hard to track centrally.
3. Finance, margin, invoice status, and event profitability are disconnected from delivery workflows.

### Why Gala Dock Can Win

- Agency-first, not venue-first.
- Better UI than dated planning tools.
- Event Day Mode and run-sheet depth.
- Supplier document/quote/readiness workflows.
- Per-event P&L positioning.
- AI/Copilot opportunity, once wired to real workspace context.

### First 10-Minute Value Workflow

The highest-value first demo should be:

1. Create event.
2. Generate/edit brief.
3. Add supplier categories.
4. Create supplier tasks/RFQs.
5. Build run sheet.
6. Show event-day mode.
7. Show finance margin.
8. Export event pack/BEO.

Today, this can be demonstrated visually, but not with real persistence or automation.

---

## I) Notion-Ready Project And Task Seed

### Project: Initial Build

| Task Name | Area | Priority | Complexity | Done Criteria | Evidence Link Type | Blocker? | Notes |
|---|---|---|---|---|---|---|---|
| Add Supabase migrations for current core schema | Supabase | Critical | L | All core tables from `types.ts` exist in migration files and can be applied cleanly | PR | Y | Required before real data wiring |
| Add workspace RLS policies | RLS | Critical | L | User can only read/write rows for workspaces where they are a member | PR | Y | Include tests |
| Wire signup to Supabase Auth | Backend | Critical | M | New user can create auth account and profile | Loom | N | Replace simulated signup |
| Wire workspace onboarding | Backend | Critical | M | User can create workspace and become owner | Loom | Y | Depends auth |
| Wire events list to Supabase | Frontend | Critical | M | `/app/events` renders database events for active workspace | Screenshot | Y | Replace hardcoded `EVENTS` |
| Wire new event creation | Backend | Critical | M | Wizard inserts an event and redirects to real detail page | Loom | Y | Core first workflow |
| Wire event detail by route param | Frontend | Critical | M | `/app/events/[eventId]` loads the matching event or 404s | Screenshot | Y | Current page ignores ID |
| Add supplier creation persistence | Backend | High | M | New supplier form creates supplier row | Loom | N | |
| Add task creation/completion persistence | Backend | High | M | Task can be created and completed across reloads | Loom | N | |
| Add file upload to Supabase Storage | Supabase | High | L | File uploads to private bucket and appears in event/library | Loom | Y | Needs storage policy |

### Project: UI Design Upgrade

| Task Name | Area | Priority | Complexity | Done Criteria | Evidence Link Type | Blocker? | Notes |
|---|---|---|---|---|---|---|---|
| Fix lint errors | QA | Critical | M | `npm run lint` exits 0 | PR | N | 11 errors observed |
| Fix production build timeout/failure | QA | Critical | M | `npm run build` completes successfully | PR | N | Build timed out in audit |
| Fix wrong `/app` route pushes | Frontend | High | S | All app navigation stays under `/app/*` | PR | N | Several `router.push("/finance/...")` patterns found |
| Add alt text for images | UI | Medium | XS | No image alt lint warnings remain | PR | N | |
| Replace dead CTAs with real/disabled states | UI | High | M | Primary buttons either work or show explicit unavailable state | Screenshot | N | |

### Project: Security Hardening

| Task Name | Area | Priority | Complexity | Done Criteria | Evidence Link Type | Blocker? | Notes |
|---|---|---|---|---|---|---|---|
| Add admin authorization guard | Backend | Critical | M | Non-admin users cannot access `/admin` routes | PR | Y | |
| Add audit log table and helper | Backend | High | M | Sensitive create/update/delete events write audit rows | PR | N | |
| Add storage policies | Supabase | Critical | M | Users can access only workspace-owned files | PR | Y | |
| Add public token security model | Security | High | M | Portal/proposal/form tokens are hashed, scoped, expiring where needed | PR | Y | Needed before public routes |
| Add tenant isolation tests | QA | Critical | L | Automated tests prove cross-workspace access fails | PR | Y | |

### Project: Commercial Depth

| Task Name | Area | Priority | Complexity | Done Criteria | Evidence Link Type | Blocker? | Notes |
|---|---|---|---|---|---|---|---|
| Build Leads CRM | Frontend/Backend | Critical | L | Lead can be created, moved through pipeline, converted to event | Loom | N | Top commercial gap |
| Build Proposals + e-signature | Frontend/Backend/Legal | Critical | L | Proposal can be sent to public URL and signed | Loom | Y | Needs legal copy |
| Build Guest Management | Frontend/Backend | High | L | Guests can be imported, edited, RSVP tracked | Loom | N | |
| Build Communication Inbox | Email | High | L | Event/lead comms are logged and visible in inbox | Loom | Y | Email sending can be later |
| Build Reports | Frontend/Backend | High | M | Revenue, events, suppliers, team reports use real data | Screenshot | N | |
| Build Stripe payment links | Stripe | High | M | Invoice can generate a Stripe payment link and save it | Loom | Y | Needs Stripe dependency/env |
| Build Client Portal | Frontend/Backend/Security | High | L | Tokenized client can view event, files, invoices, proposal | Loom | Y | Needs public token security |

---

## J) Weekly Founder Questions

Use these every week until launch:

1. What is the next single workflow that must work end-to-end?
2. What is the biggest commercial gap that prevents someone paying?
3. What is the biggest security/compliance gap that creates liability?
4. What is the one thing that improves demo quality the most this week?
5. What are the top 3 blockers stopping launch readiness?

Current answers:

1. Signup -> workspace -> create event -> event detail -> add supplier/task/file.
2. No real persistence/billing/client proposal flow.
3. RLS and tenant isolation are not verifiable.
4. Make the existing event workflow real with demo seed data.
5. Missing migrations/RLS, mocked workflows, failing lint/build.

