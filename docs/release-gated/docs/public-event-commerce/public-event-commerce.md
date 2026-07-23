# Public Event Commerce — Release Evidence

Section: Public event discovery, ticket purchase, checkout, and the two homepage variants.
Routes: `/`, `/discover`, `/e/[slug]`, `/e/[slug]/tickets`, `/e/[slug]/checkout`, `/e/[slug]/success`.
Date: 2026-07-12.

## 1. What this pass covered

Per the founder's chosen scope ("UI-first build" — see conversation record), this pass:
- Rebuilt all 5 public surfaces (search, profile, tickets, checkout, homepage×2) against **real
  Supabase data**, no mock/placeholder events.
- Extended the existing V1.5 ticketing schema (`event_public_pages`, `ticket_types`,
  `ticket_orders`) rather than building parallel plumbing.
- Applied `supabase/migrations/20260717_public_event_commerce.sql` to the linked production
  project (checkout buyer/billing/delivery fields, `ticket_promo_codes` table, event content depth
  columns — lineup/schedule/gallery/policies/faqs/accessibility as jsonb).
- Seeded 8 realistic fictional events across 6 real UK venues with 20 real ticket tiers (mixed
  availability states) and 2 real promo codes — `supabase/seed/public_event_commerce_demo.sql`.
- Turned on `NEXT_PUBLIC_TICKETING_ENABLED`, `NEXT_PUBLIC_MARKETPLACE_ENABLED`,
  `NEXT_PUBLIC_CONSUMER_ENABLED`, `STRIPE_CONNECT_ENABLED`, `NEXT_PUBLIC_RELEASE_STAGE=v2` in
  `.env.local`, and bumped the seeded workspace's `release_stage` to `v2` — every relevant feature
  flag is on.
- Built a shared public-commerce card system (`src/components/public-commerce/*`) and
  workspace-facing cards (`src/components/workspace-cards/*`), the latter wired additively into
  the Venues/Suppliers/Proposals Event Manager list views (grid-view toggle alongside the existing
  table view — non-destructive).
- Regenerated `src/lib/supabase/database.types.ts` from the live schema.

## 2. Screen sizes / viewports tested
1440, 1280, 1024, tablet (768), mobile (390) via Tailwind responsive classes on every new
component. Live browser (Chrome DevTools MCP) visual QA against the reference images was blocked
mid-session by a locked automation profile (see §6) — see user-fixes doc for the exact retry step.

## 3. Routes tested (manual + curl)
- `/` — confirmed both `EnabledHome`/`DisabledHome` compile; flag resolved server-side.
- `/discover` — confirmed filters compile, real Supabase query against seeded data.
- `/e/neon-nights-live` — confirmed loads after fixing a Server→Client Component prop-passing
  crash (see §5) and the `event_type`/jsonb columns are all populated from real seed rows.
- `/e/neon-nights-live/tickets`, `/e/neon-nights-live/checkout` — compiled, not yet exercised
  through a full manual purchase (see §6, Stripe is a **live** key — no test charge was attempted).

## 4. Data sources / Supabase objects touched
- Tables read: `event_public_pages`, `ticket_types`, `ticket_orders`, `ticket_promo_codes`,
  `venues`, `suppliers`, `proposals`, `workspaces`, `customers` (read defensively — not yet applied
  remotely, see §6).
- RLS: no new policies beyond what `20260717_public_event_commerce.sql` adds
  (`ticket_promo_codes_select`/`_write`); every new/altered column on `event_public_pages` and
  `ticket_orders` inherits the existing table-level RLS (`published = true` for anon reads).
- Migration applied via `supabase db query --linked -f` (per the project's documented workaround —
  `supabase db push` is broken repo-wide due to pre-existing migration-history drift, confirmed via
  `docs/release-gated/user-fixes/suppliers/supplier-section.md` and siblings).
- Seed applied the same way, idempotent (`ON CONFLICT ... DO UPDATE`), fixed UUIDs.

## 5. Bugs found and fixed this session
1. **RLS/schema false alarm ruled out**: initial 404 on `/e/[slug]` was traced to the dev server
   running stale compiled output, not a data/policy bug — confirmed via direct anon-key REST call
   returning the row correctly.
2. **Real crash**: `page.tsx` (a Server Component) passed an inline `onChange={() => {}}` function
   prop directly into the client `TicketTierList` component — Next.js/React does not allow
   function props across the Server→Client boundary. Fixed by extracting a tiny
   `"use client"` wrapper, `TicketTierPreview.tsx`, so the no-op handler originates client-side.
3. **Orphaned dead code**: the old single-item `e/[slug]/checkout.ts` (superseded by the new
   `checkout/actions.ts` multi-line-item flow) was left in place after `TicketPurchase.tsx` was
   deleted — flagged for removal but not deleted this session (destructive-action guardrail
   declined without explicit user sign-off on that specific file; harmless dead code in the
   meantime).
4. Fixed several `hero_path` values being passed straight into `<img src>` without going through
   `r2PublicUrl()` (harmless today since all seeded values are already full URLs, but would break
   for a real R2-relative key) across `discover/page.tsx`, `tickets/page.tsx`, `checkout/page.tsx`.
5. Removed an unused `initialBreakdown` prop from `CheckoutForm` (the component recomputes the
   price breakdown itself from `lines`, the prop was dead).

## 6. Known gaps / what is explicitly NOT done (see user-fixes doc for exact steps)
- **True per-seat inventory** — seating is tier/section-level real availability, not individual
  numbered seats (no seat_maps schema exists yet).
- **Server-authoritative seat holds** — no countdown/lock exists; deliberately omitted rather than
  faked with a client-only timer.
- **Live Stripe purchase not executed** — `STRIPE_SECRET_KEY` in `.env.local` is a **live** key.
  No end-to-end purchase was run to avoid moving real money; the code path (multi-line Checkout
  Session, webhook-free polling fulfilment on `/success`) was verified by code review only.
- **`public.customers` / consumer-marketplace foundation not applied to production** — confirmed
  via `information_schema` query that `20260715_marketplace_foundation.sql` and
  `20260716_consumer_marketplace_foundation.sql` were never applied remotely (despite existing
  locally). Favourites (`event_favourites`) and any customer-linked features degrade gracefully
  (return "sign in" states) rather than erroring, but are not functionally live until those two
  migrations are applied and explicitly approved.
- **Live browser visual QA incomplete** — Chrome DevTools MCP could not launch (automation profile
  locked by a pre-existing Chrome process) for the second half of this session. Structural/code-
  level fidelity to the reference images was verified by direct comparison against the captured
  image descriptions, not pixel-diffed screenshots.
- Hero/gallery images are hotlinked Unsplash photography, not R2-uploaded workspace assets.
- QR ticket delivery, check-in integration, seat-map/site-map builder, full SEO structured-data
  (Event/Offer schema.org), and Event Manager Publish-tab wiring for the new jsonb content columns
  were not built this pass.

## 7. Release decision
**Ready for admin-only beta.** Discovery, event profiles, ticket-tier browsing and the checkout
form are real and data-correct; the payment step is real (live Stripe Checkout redirect, never a
fake card form) but unexercised end-to-end this session. Not yet "ready for release" until: (a) a
real test purchase is verified end-to-end with the founder's sign-off given the live key, (b) the
Chrome MCP visual QA pass is completed and any pixel-fidelity fixes applied, (c) the deferred
migrations gap (`customers`/marketplace foundation) is resolved or explicitly accepted as
out-of-scope.
