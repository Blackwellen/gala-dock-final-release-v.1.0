# User / Manual Actions — Events Pipeline

> These items cannot be completed by Claude Code automatically.
> Follow each step exactly. Mark complete as you go.

---

## 1. Apply pending migrations via Supabase PAT

Run the following migrations **in order** against your Supabase project.
Use the Supabase Dashboard → SQL Editor, or the CLI with your PAT.

### Migration A — Core event tables
File: `supabase/migrations/20260630_event_core_tables.sql`

```bash
# Via CLI (set SUPABASE_DB_URL from your environment, never paste here)
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260630_event_core_tables.sql
```

### Migration B — Pipeline extra columns
File: `supabase/migrations/20260630_events_pipeline_columns.sql`

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260630_events_pipeline_columns.sql
```

### Migration C — Expenses, budget lines, guest column fix
File: `supabase/migrations/20260630_event_expenses_budget_guests_fix.sql`

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260630_event_expenses_budget_guests_fix.sql
```

**Verification:** After each migration, check in Supabase Dashboard → Table Editor that these tables exist:
- `events` (columns include `cover_image_url`, `quote_value_cents`, `readiness_score`)
- `event_tasks`, `event_run_sheet_items`, `event_suppliers`
- `event_budget_lines`, `event_expenses`
- `event_guests` (columns include `first_name`, `last_name`, `full_name`, `segment`, `attendance_mode`, `check_in_status`)
- `event_activity`

---

## 2. Run the demo seed

File: `supabase/seeds/demo-events-full-seed.sql`

### Step 1 — Find your workspace ID
In Supabase Dashboard → Table Editor → `workspaces` table, copy the `id` of your workspace.

### Step 2 — Replace the placeholder
Open `supabase/seeds/demo-events-full-seed.sql` and replace **every** occurrence of:
```
<WORKSPACE_ID>
```
with your actual workspace UUID (e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

> **Do not commit the modified file.** After running the seed, revert it or keep a local copy.

### Step 3 — Run the seed
```bash
psql "$SUPABASE_DB_URL" -f supabase/seeds/demo-events-full-seed.sql
```

### Step 4 — Verify in the app
Navigate to `/event-manager/events` — you should see 6 events with cover images:
1. Pulse Summit 2026 (confirmed, corporate conference photo)
2. Theatre Gala Night (confirmed, theatre photo)
3. Riverside Food Festival (in_delivery, festival photo)
4. Hartwell Wedding (awaiting_approval, wedding photo)
5. After Dark Club Night (quoting, nightlife/DJ photo)
6. Grannit Gala Dinner (in_delivery, formal gala photo)

---

## 3. Wire up event detail sub-pages (404 fix)

The following routes 404 because their `page.tsx` files don't exist yet.
Create a placeholder for each until the full feature is built:

```
/event-manager/events/[eventId]/tasks
/event-manager/events/[eventId]/suppliers
/event-manager/events/[eventId]/guests
/event-manager/events/[eventId]/budget
/event-manager/events/[eventId]/run-sheet
/event-manager/events/[eventId]/activity
/event-manager/events/[eventId]/beo
/event-manager/events/[eventId]/check-in
/event-manager/events/[eventId]/expenses
/event-manager/events/[eventId]/export
/event-manager/events/[eventId]/floor-plan
/event-manager/events/[eventId]/event-day
/event-manager/events/[eventId]/edit
```

For each missing page, create the file at the corresponding path with:
```tsx
export default function ComingSoonPage() {
  return <div className="p-8 text-muted-foreground">Coming soon</div>;
}
```

This unblocks navigation without exposing broken pages.

---

## 4. Calendar — add `cover_image_url` to RPC (V2 enhancement)

The `getCalendarRange` RPC currently doesn't return `cover_image_url`.
To show event photos on calendar cards:

1. Edit the RPC in Supabase SQL Editor to add `e.cover_image_url` to the SELECT
2. Update `src/app/event-manager/calendar/data.ts` → `CalendarItem` interface to include `coverImageUrl?: string`
3. Update the calendar card component to render the image

This is a V2 enhancement — not required for initial release.

---

## 5. Chrome MCP visual QA

After seed data is live, run visual QA at these screen sizes:
- 1440px (wide desktop)
- 1280px (standard desktop)
- 1024px (compact/laptop)
- 768px (tablet)
- 375px (mobile)
- PWA mode (iOS/Android safe areas)

Check:
- [ ] Events pipeline loads with all 6 seed events
- [ ] Cover images render (Unsplash URLs display correctly)
- [ ] List, Cards, Board (Kanban) views all work
- [ ] Pipeline stage columns correct (All / New Enquiry / Briefing / etc.)
- [ ] Event detail overview page loads without 404
- [ ] Calendar shows seed events in correct months

---

## 6. Delete orphaned component files

These files are no longer imported anywhere and should be deleted:
- `src/components/events/EventsListView.tsx`
- `src/components/events/EventCard.tsx`

```bash
rm src/components/events/EventsListView.tsx
rm src/components/events/EventCard.tsx
```

Confirm no TypeScript errors after deletion:
```bash
npx tsc --noEmit
```

---

## 7. RLS — confirm seed user can read events

After seeding, log in as the workspace owner and verify:
- Events list loads (RLS `is_workspace_member` passes)
- Event detail loads for a seed event ID
- Task/guest/supplier sub-tables load (all use same RLS pattern)

If you see empty data, check that `owner_user_id` in the seed matches a real `auth.users.id` in your Supabase project. The seed uses `(SELECT id FROM auth.users LIMIT 1)` as a fallback — this must match your actual user.
