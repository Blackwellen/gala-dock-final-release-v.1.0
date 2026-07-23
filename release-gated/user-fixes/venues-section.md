# Venues Section — Manual / Follow-up Actions Required

In priority order. None of these were completed automatically this session — either they need a human
decision, credentials/tooling this agent doesn't have, or they were out of scope for the time available.

## 1. ~~Fix the `admin_action_log` trigger bug on `venue_categories`~~ — FIXED

**Was:** any `INSERT`/`UPDATE`/`DELETE` on `public.venue_categories` failed with `relation
"public.admin_action_log" does not exist` because `audit_venue_category()` hard-failed on that insert.

**Root cause found:** `public.admin_action_log` was never created, and two different triggers write to it
with *incompatible* column shapes — `audit_venue_category()` expects `(workspace_id, actor_id, action,
entity, entity_id, metadata)`, while `_venue_attachments_audit()` (on venue attachments) expects
`(workspace_id, actor_user_id, action, entity_type, entity_id, before, after)`. Because they disagree,
creating one table couldn't cleanly satisfy both. `_venue_attachments_audit()` already survives this via a
`BEGIN ... EXCEPTION WHEN OTHERS THEN NULL END` swallow around its insert — `audit_venue_category()` was
just missing that same guard.

**Fix applied:** `supabase/migrations/20260713_fix_audit_venue_category_trigger.sql` — re-defines
`audit_venue_category()` with the identical defensive exception-swallow already proven in
`_venue_attachments_audit()`. Applied live, verified with a real insert+delete test against
`venue_categories` (succeeded with no error), and confirmed the migration re-runs idempotently
(`CREATE OR REPLACE FUNCTION`). The demo seed now creates its three categories (Historic Venue, Waterside
Venue, Warehouse) directly again instead of the earlier NULL-category workaround.

**Still open, lower priority:** `public.admin_action_log` itself still doesn't exist, so venue-category and
venue-attachment admin actions are silently *not* audited anywhere (previously they were silently failing;
now they're silently no-ops). If admin-level audit trail for these two entities is actually wanted, create
`public.admin_action_log` with a schema both triggers can agree on (or update both triggers to use the new
`venue_activity_log` table this rebuild added, which does work and is queried by the venue Activity tab).

## 2. Chrome MCP visual + functional QA — not run this session

The Chrome DevTools MCP connection dropped/reconnected multiple times during this session and was not
stable enough to complete the spec's required browser-based QA:
- Side-by-side pixel comparison of all 10 routes against the reference images at 1440/1280/1024/tablet/
  mobile/PWA widths.
- Click-through functional QA of every button/filter/tab/action across all 10 screens.
- `docs/qa/venue-section-visual-qa.md` and the functional-QA equivalent described in the spec were **not**
  created, because no real QA pass was run — creating them without real testing would be fabricated evidence.

**Action needed:** run `/qa` or drive Chrome DevTools MCP manually against `/event-manager/venues` and the
`Grand Hall London` venue profile (seeded by `supabase/seed/venue_management_demo.sql`) at each required
viewport, and record actual pass/fail per screen.

## 3. Gallery & Spaces / Site Maps upload UI not built

The R2 presign endpoint (`/api/r2/presign`) now accepts `venue-gallery` and `venue-site-map` kinds, and
`addVenueMedia()` / `venue_media` / `venue_site_maps` exist and are queried on the Gallery & Spaces and Maps
& Access pages — but there is no upload widget wired up yet (no "Upload Photos" button that calls presign →
PUT → `addVenueMedia`). The Documents tab's upload form is fully wired (Supabase Storage, existing pattern);
gallery/site-map uploads need the same treatment, ideally migrated to the R2 flow.

## 4. `venue_commercial_terms` create/edit UI missing

Commercials & Records currently only **displays** commercial terms (rates, deposits, cancellation bands,
contract status) and lets you add ad-hoc transactions — there's no form to create/edit the
`venue_commercial_terms` row itself. Until one is added, seeding or a direct SQL/Supabase Studio edit is the
only way to populate hire rates, deposit rules, contract dates, etc. for a real (non-demo) venue.

## 5. Cross-module wiring not completed

Per the original spec, still outstanding:
- **Proposals**: no venue shortlist/comparison UI inside proposal creation yet.
- **Calendar**: venue hold expiries, room-block release dates and rate-review dates don't appear on the
  Calendar module yet (the underlying dates exist in `venue_holds`/`venue_room_blocks`/
  `venue_commercial_terms` — just needs a query added to whatever powers the Calendar feed).
- **Tasks**: no "create task from hold expiry / document expiry / rate review" action yet.
- **Inbox**: no message-to-venue-contact linking yet.
- **Automations**: none of the venue-related triggers (`hold expires soon`, `document expires`, `preferred
  status changed`, etc.) are wired into the automations engine.
- **Finance**: `venue_commercial_transactions` isn't surfaced inside the Finance module's own views yet
  (it's real data, just not cross-linked there).

## 6. `venue_categories` — no create-category UI

Now that item 1 is fixed, categories can be inserted again — but there's still no "Add category" control
anywhere in the venues UI, so they can only be created via seed/direct SQL. Low priority, but note it if
category management becomes a customer-facing need.

## 7. List-page filters are not URL/query-param-backed

The All Venues / Preferred Venues tab and the search box are client `useState`, not synced to the URL —
refresh loses the selected tab/search, and there's no shareable filtered link. The spec calls for
URL-backed filters (`?view=preferred`, saved views, etc.). This should be a relatively small follow-up
(read `searchParams` in `page.tsx`, push router state on tab/search change) but wasn't done this pass to
keep scope manageable.

## 8. Automated test suite

No unit/integration/RLS tests were added for the venues domain this pass — the wider codebase doesn't yet
have an established Zod/test-fixture convention for server actions (confirmed via audit: no `zod` imports
anywhere in `src/app`), so adding one just for venues would be inconsistent with the rest of the app. If/when
a testing convention is adopted repo-wide, venues should get the same coverage as other sections
(`test/**/*.test.ts` per `package.json`'s `test` script).

## 9. `next build` stalls indefinitely (pre-existing, blocks production builds app-wide)

`npm run build` hangs at the "Running TypeScript" step (observed 17+ minutes, zero progress, had to be
killed). Standalone `npm run typecheck` completes in a few minutes and reports 247 errors, several of which
are `TS2589: Type instantiation is excessively deep and possibly infinite` in `src/lib/customer.ts` and
`src/app/event-manager/marketplace/**` — these are known to sometimes cause the TypeScript compiler to churn
near-indefinitely rather than fail fast, which is consistent with what was observed. This is **pre-existing
and unrelated to the venues rebuild** (confirmed: zero errors in any venue file), but it means **the app
currently cannot produce a production build at all**. Recommended fix, in order:
1. Resolve the root-cause type errors in `src/lib/customer.ts` and the marketplace pages (likely stale/
   missing `customers`, `marketplace_listings`, `marketplace_events`, `event_favourites` table types —
   regenerate `database.types.ts` against the actual current schema and see if those tables still exist;
   if they were dropped/renamed, update the referencing code).
2. Once those are fixed, re-run `npm run build` end-to-end to confirm it completes and to run the venues
   pages through Next's production optimizer/static analysis for the first time.
3. If a quick unblock is needed before that root-cause work happens, consider adding `typescript: {
   ignoreBuildErrors: true }` to `next.config.ts` as a temporary, clearly-flagged stopgap — not a real fix,
   and should be removed once item 1 is done.

## 10. Map provider

Maps & Access currently embeds a plain OpenStreetMap iframe (real, live, no API key required) rather than
the branded MapTiler integration the env already has a key for (`NEXT_PUBLIC_MAPTILER_KEY`). Swapping to
MapTiler (already used elsewhere per `src/components/maps/VenueMap.tsx`) would give a more premium, on-brand
map experience with custom markers for entrances/parking/loading bay etc., matching the reference image's
marker legend more closely.
