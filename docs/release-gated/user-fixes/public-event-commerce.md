# Public Event Commerce — manual follow-ups

Things Claude Code could not or should not complete autonomously this session, with exact steps.

## 1. Retry the Chrome DevTools visual QA pass
Chrome DevTools MCP could not launch because a Chrome instance was already holding the automation
profile lock (`C:\Users\PC\.cache\chrome-devtools-mcp\chrome-profile`). To finish pixel-fidelity
QA against the 7 reference images:
1. Close any Chrome windows you have open (or at minimum ones that might be using that profile).
2. Ask me to retry — I'll navigate to `/`, `/discover`, `/e/neon-nights-live`,
   `/e/neon-nights-live/tickets`, `/e/neon-nights-live/checkout` at 1440/1024/mobile widths,
   screenshot each, and diff against
   `working_imagesS_public_marketplace_pages/ChatGPT Image Jul 12, 2026, 08_26_0*.png`.

## 2. Verify a real end-to-end Stripe purchase, deliberately, once
`STRIPE_SECRET_KEY` in `.env.local` is a **live** key (`sk_live_...`), not a test key. I did not
run a real purchase through `/e/[slug]/checkout` to avoid moving real money without your explicit
say-so. To verify the flow works end to end:
1. Either swap in a Stripe **test**-mode secret key temporarily (`sk_test_...`) and use a Stripe
   test card (4242 4242 4242 4242), or accept a real ~£1 test charge on a real card via the live
   key.
2. Go to `/e/neon-nights-live/tickets` → pick a ticket → Continue to review → fill in checkout
   details → Continue to secure payment.
3. Confirm you land on Stripe's hosted Checkout page (not a Gala Dock-hosted card form).
4. Complete payment, confirm redirect to `/e/neon-nights-live/success` shows "You're in!", and
   confirm in Supabase that the corresponding `ticket_orders` rows flipped to `status = 'paid'` and
   `ticket_types.sold` incremented.
5. If using the live key for this test, refund the charge in the Stripe dashboard afterward.

## 3. Decide on the `public.customers` / consumer-marketplace foundation gap
`supabase/migrations/20260715_marketplace_foundation.sql` and
`20260716_consumer_marketplace_foundation.sql` exist locally but were **never applied** to the
linked production database (confirmed via `information_schema.tables` — `customers`,
`marketplace_events`, `marketplace_event_items`, `marketplace_listings` all absent remotely). This
blocks: buyer favourites (`event_favourites`, deferred out of this migration), logged-in customer
order history, and the wider V2 marketplace-listing layer.
- If you want favourites/customer accounts live: review those two migration files yourself (they
  predate this session, I have not audited them), then run:
  ```
  supabase db query --linked -f supabase/migrations/20260715_marketplace_foundation.sql
  supabase db query --linked -f supabase/migrations/20260716_consumer_marketplace_foundation.sql
  ```
  then re-run `supabase/migrations/20260717_public_event_commerce.sql`'s favourites section (I
  removed it from the applied file — see git history / ask me to re-add and re-apply).
- If not needed yet, no action required; the app degrades gracefully (favourite button shows a
  "sign in" state instead of erroring).

## 4. Delete the orphaned old checkout file
`src/app/(marketing)/e/[slug]/checkout.ts` (the old single-ticket-type checkout action) is now
unused — its only caller, `TicketPurchase.tsx`, was deleted and replaced by the new
`e/[slug]/checkout/` route + `checkout/actions.ts`. I left it in place rather than delete a
pre-existing tracked file without your sign-off. To clean up:
```
git rm "src/app/(marketing)/e/[slug]/checkout.ts"
```
(Verify first with `grep -rn "e/\[slug\]/checkout\"" src` that nothing still imports it.)

## 5. Reconnect Stripe/Cloudflare MCP if you want me to manage them going forward
The Stripe and Cloudflare MCP connectors were unauthenticated this session (I used the app's own
`STRIPE_SECRET_KEY`/`R2_*` env vars directly instead, which is how the app already worked). If you
want me to manage Stripe products/webhooks or R2 buckets via MCP tooling directly in future
sessions, authorize those connectors via `claude mcp` / `/mcp`.

## 6. Production `.env` parity
I added the ticketing/marketplace/release-stage env vars to **`.env.local`** only (local dev). Per
project memory, this app deploys via `vercel --prod` (git auto-deploy is broken) — Vercel's own
environment variables are managed separately in the Vercel dashboard. If you want these flags on
in the deployed environment too, add the same 5 vars there:
```
NEXT_PUBLIC_RELEASE_STAGE=v2
RELEASE_STAGE=v2
NEXT_PUBLIC_TICKETING_ENABLED=true
NEXT_PUBLIC_MARKETPLACE_ENABLED=true
NEXT_PUBLIC_CONSUMER_ENABLED=true
STRIPE_CONNECT_ENABLED=true
```

## 7. Follow-up feature work not built this pass
Tracked here so it isn't lost, not because it's blocking:
- True per-seat seating plans (seat_maps/seat_map_versions schema + interactive picker).
- Server-authoritative seat holds with expiry countdown.
- QR ticket generation + check-in integration.
- Venue/site-map builder (facilities layer) beyond the current OSM address embed.
- Event Manager "Publish" tab UI for editing the new `event_public_pages` jsonb columns
  (lineup/schedule/gallery/policies/faqs/accessibility) — currently only seedable via SQL.
- Structured data (schema.org Event/Offer) for SEO.
- Replace hotlinked Unsplash hero/gallery images with real R2-uploaded workspace media.
