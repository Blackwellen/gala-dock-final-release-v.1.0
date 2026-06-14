# Gala Dock — Build Completion Status

**Date:** 14 June 2026
**Outcome:** The full FEATURE_BUILD_PLAN (15 levels, 102 steps) is built and every surface — existing and new — is wired to the **live Supabase database** with workspace-scoped queries on top of the project's existing RLS.

---

## Correction to the original repo audit

`BUILD_GRADE_REPO_AUDIT.md` concluded the product was "UI-only" with "no migrations or RLS." That was based on **repo files only**. The **live Supabase project is fully built**: 150+ tables, RLS enabled on every core table, helper functions (`has_workspace_role`, `is_workspace_member`, `current_workspace_id`), views (`events_with_stats`, `workspace_finance_summary`, `supplier_health`), and real seed data. The actual gap was that the UI rendered hardcoded arrays instead of querying the live tables. That gap is now closed.

---

## What was delivered

### Foundation
- **29 new tables** created with RLS matching the live pattern: 12 commercial-depth (leads, lead_activities, proposals, proposal_line_items, event_guests, communications, invoice_payment_schedules, forms, form_fields, form_submissions, venue_documents, venue_notes) + 17 for Levels 11–15 (supplier_rate_cards, supplier_blocked_dates, supplier_ratings, rfqs, rfq_recipients, supplier_contracts, event_staff_assignments, team_availability_blocks, event_floor_plans, venue_spaces, venue_bookings, venue_fb_packages, venue_booking_fb_selections, venue_staff_assignments, event_mood_boards, mood_board_items, event_expenses). Migrations in `supabase/migrations/`.
- **Accurate types** regenerated from the live schema (`database.types.ts`); `types.ts` derives schema-correct aliases. This corrected stale assumptions (real `task_status`/`task_priority`/`supplier_status` enums, `workspace_role` incl. `manager`, `*_cents` money columns, richer `events`).
- **Workspace data layer** (`src/lib/workspace.ts`: `requireWorkspace`, `getActiveWorkspaceId`).
- **Primitives**: `KanbanBoard`, `CSSBarChart`; expanded `StatusBadge`.
- **Navigation fixed**: routes are bare paths (the `(app)` route group adds no prefix); 64 broken `/app/*` links corrected app-wide; sidebar expanded.

### Existing modules wired to Supabase
Home, Events (list/detail/new/edit/event-day/export/BEO), Suppliers, Tasks, Finance (quotes/invoices/payments/profit), Settings, Library — all refactored to server components with live, workspace-scoped queries and real CRUD via server actions.

### New feature levels (all on live data)
- **L2 Leads CRM** — pipeline table+kanban, convert-to-event, activity log
- **L3 Proposals + e-sign** — wizard, state machine, public `/p/[token]` sign page, convert-to-invoice
- **L4 Guest Management** — guests tab, RSVP, CSV import/export, meal summary
- **L5 Reports** — 6 tabs, CSS charts, live aggregates
- **L6 Inbox** — thread hub + composer (SMS/WhatsApp as future add-ons)
- **L7 Finance enhancements** — payment schedules, Stripe link stub, printable BEO
- **L8 Forms + Client Portal** — builder, public `/f/[token]`, SHA-256 portal token resolution
- **L9 Venue CRM** — register/detail/docs/notes
- **L11 Supplier depth** — RFQ engine + comparison matrix, rate cards, availability, ratings, contracts
- **L12 Team & staffing** — workload dashboard, per-event staffing
- **L13 Floor plan builder** — SVG canvas, multi-layout, guest seating, print
- **L14 Venue-side ops** — multi-venue dashboard, bookings lifecycle, F&B, public `/venue-portal/[token]`
- **L15 Final layer** — mood board, expenses, guest QR check-in (+ public `/check-in/[token]`), PWA manifest

### Auth
Signup, password reset, OTP, resend, accept-invite (RPC), **real TOTP MFA**, and onboarding workspace creation are wired to real Supabase auth. Email/password + OTP only — no OAuth.

---

## Constraints honored
- Zero new mandatory paid APIs; Stripe/SMS/WhatsApp are optional, clearly-gated stubs.
- All media upload-only (`<input type=file hidden>`) to private Storage buckets with signed-URL access — no URL fields.
- Service-role key server-only (public token pages use `createAdminClient()` server-side).
- Tailwind v4 CSS-only `@theme` tokens; no `tailwind.config`. No new npm dependencies.
- Clean `tsc --noEmit` and `next build` at every wave.

---

## Honest caveats / follow-ups
- **Stripe payment links** are a UI stub gated on config — no live charging until Stripe keys/flow are added (intentional, optional addon).
- **Client/venue portals** render securely but need a planner-side "invite" flow to *mint* the `portal_links`/`portal_tokens` rows; until then they show the invalid-link state.
- **Email/SMS/WhatsApp sending** is logged in-app only (no transactional provider wired) — per the zero-paid-API constraint.
- A few plan sub-features were deferred where no backing column exists (mood-board share token, milestone countdown, white-label portal — branding settings already cover most of the latter).
- The supplier management page is reachable at `/suppliers/manage/[supplierId]` (linked via sidebar RFQs/contextually); a direct button from the supplier detail page is a nice-to-add.
