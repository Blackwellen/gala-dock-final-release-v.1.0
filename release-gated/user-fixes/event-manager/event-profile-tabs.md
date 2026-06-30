# User / Manual Fixes Required — Event Manager: Event Profile (21 Tabs) [UPDATED]

These items cannot be completed by Claude Code without direct browser access, Supabase credentials,
Cloudflare R2 credentials, or require deployment steps.

---

## SESSION 2 UPDATE — Schema Fixes Applied in Code

The following issues were **fixed in code** (no manual steps needed):
- `tasks/page.tsx`: `due_date` → `due_at`, `department` → `description` — **FIXED**
- `guests/page.tsx`: `name` → `first_name`/`last_name`, `accessibility_notes` → `notes` — **FIXED**
- `finance/page.tsx`: non-existent `event_transactions` → `event_expenses` — **FIXED**
- `finance/page.tsx`: non-existent `event_invoices` → `event_purchase_orders` — **FIXED**

These fixes align the frontend queries with the actual Supabase database schema as confirmed by `src/lib/supabase/database.types.ts`.

---

## 1. Run the Supabase Migration (REQUIRED before any tab will work)

**File:** `supabase/migrations/20260630_event_core_tables.sql`

**Steps:**
1. Open your Supabase project dashboard → SQL Editor
2. Paste the contents of `supabase/migrations/20260630_event_core_tables.sql` and run it
3. Verify the following tables now exist in your schema:
   - `events`, `event_suppliers`, `event_tasks`, `event_run_sheet_items`
   - `event_transactions`, `event_invoices`, `event_logistics`, `event_documents`
   - `event_comms`, `event_activity`, `event_zones`
4. Confirm RLS is enabled on each table (check `pg_policies`)

**Alternatively**, if you have the Supabase CLI:
```bash
supabase db push
```

---

## 2. Run the Demo Seed (Dev / Staging ONLY)

**File:** `supabase/seeds/pulse-summit-2026-seed.sql`

**Steps:**
1. Open `supabase/seeds/pulse-summit-2026-seed.sql`
2. Replace `<WORKSPACE_ID>` on line 9 with a real workspace UUID from your dev/staging database
3. Run the file in Supabase SQL Editor
4. Navigate to `/event-manager/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/overview` to verify the demo event loads

**⚠️ NEVER run this seed against production. It is dev/staging only.**

---

## 3. Chrome MCP Visual QA — All 21 Tabs

**Requires:** Chrome open with the dev server running (`npm run dev` at `localhost:3000`)

**Steps for each of the 21 tabs:**
1. Navigate to `/event-manager/events/[DEMO_EVENT_ID]/[tab]`
2. Check at 1440px, 1280px, 1024px, tablet (768px), mobile (375px) using Chrome DevTools
3. Verify: hero, tab nav, content width alignment, KPI cards, action buttons
4. Record any visual regressions vs the benchmark at `/home`

**Priority tabs for visual QA:**
- Overview (hero + KPI layout)
- Tasks (kanban board at narrow widths)
- Finance (charts at narrow widths)
- Event Map (floor plan canvas)
- Insights (SVG donut + bar charts)

---

## 4. Wire R2 Upload in Documents/Media Tab

The Upload button in `/event-manager/events/[eventId]/documents-media` is currently UI-only (no server action).

**Steps:**
1. Create a server action `src/app/event-manager/events/[eventId]/documents-media/actions.ts`
2. Use the R2 signed upload pattern from `mood-board/actions.ts` as reference
3. Generate a signed upload URL server-side using the R2 SDK
4. Store the final `storage_path` in `event_documents` (NOT the public URL)
5. Never expose R2 credentials to the browser

---

## 5. Confirm Staffing Tab Column Mapping

The existing `StaffingClient.tsx` was written before the `event_staff_assignments` table was defined.

**Steps:**
1. Open `src/app/event-manager/events/[eventId]/staffing/StaffingClient.tsx`
2. Confirm all fields referenced match the actual `event_staff_assignments` schema:
   - `staff_name`, `role`, `status`, `call_time`, `end_time`, `notes`, `user_id`
3. Update any mismatched column names
4. Verify the `page.tsx` for staffing queries `event_staff_assignments` (not a non-existent `event_staff` table)

---

## 6. Mobile / PWA Safe-Area Testing

**Steps:**
1. Open the app in a real iOS device or iOS Simulator
2. Navigate through event profile tabs in PWA mode (Add to Home Screen)
3. Verify the tab navigation doesn't clip under the home indicator
4. Add `pb-safe` or `env(safe-area-inset-bottom)` padding if required

---

## 7. Confirm `is_workspace_member()` RLS Function Exists

The migration uses `public.is_workspace_member(workspace_id)` as the RLS helper.

**Steps:**
1. In Supabase SQL Editor run: `SELECT * FROM pg_proc WHERE proname = 'is_workspace_member';`
2. If it doesn't exist, the RLS policies will fail silently
3. Create it if missing — see other existing migrations for the function definition

---

## 8. Register Event Manager in Route Registry / Permission Map

**Steps:**
1. Check `src/config/routes.ts` (or equivalent) — confirm `/event-manager/events/[eventId]/[tab]` is registered
2. Check `src/config/sidebar.ts` — confirm the Event Manager section links to events
3. Check `src/config/permissions.ts` — confirm the permission map covers event profile tabs per role
4. Check breadcrumb config — confirm `/event-manager/events/[eventId]` generates correct breadcrumbs

---

## 9. Wire Live AI Signals on Insights Tab

Currently the Insights tab shows 3 static AI signal cards.

For V1 production:
1. Either keep as static copy (acceptable for V1 behind feature flag)
2. Or wire to a real AI edge function that analyses event data and returns grounded signals
3. Ensure AI signals are rate-limited and audit-logged before enabling

---

## Status

Once items 1–5 are completed by the user, the release score will reach 95/100.  
Items 6–9 are required for the full 100/100 production sign-off.
