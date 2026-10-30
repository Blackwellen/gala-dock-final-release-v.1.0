# Promotion, campaigns and media (Q23 remainder, domains 136–139, 146–149)

Migrations 202610291039–1041 (lane A, 2026-10-29). Builds on owned advertising (`docs/marketplace/advertising.md`, domains 140–145). Tests: `tests/marketplace/promotion-media.spec.ts` (9). TS: `src/lib/promotion/actions.ts`, route `/r/c/[code]`.

## Distribution (136)
`event_distribution` — one row per event: listed | unlisted | withdrawn, reason, surfaces (directory, search, sitemap, related, city, category, calendar, organizer, venue). A trigger on every events write (and listings.published) recomputes it in the same transaction: public + published/on_sale/live + type listable + not restricted + not ended. Outbox `promotion.distribution_listed` / `_withdrawn`. Daily sweep (01:20) withdraws ended events. Reads (SECURITY INVOKER, anon RLS applies): `directory_events(scope all|city|category|venue|organizer|series, key, from, to, limit, offset)` — chronological organic list + separate `featured` rows; `directory_related` (why reasons); `directory_facets`. Ranking reasons never public; sponsored never re-ranks organic. Live backfill: 21 listed, 196 unlisted not public, 6 unlisted not published, 28 withdrawn completed, 1 withdrawn postponed.

## Featured
`directory_featured` (editorial | sponsored; paid always labelled "Sponsored"; sponsored needs an active/scheduled boost on the same event and can't outlive it). Curated by commerce admins (`set_directory_featured`).

## Calendar (137)
`calendar_window(today | weekend [Fri 17:00 → Mon 00:00 local] | month, tz, anchor)`, `calendar_events(range, tz, scope, key)` grouped by local day. Organiser `promotion_calendar(workspace, from, to)`: events, campaigns, sends, boosts, blackouts with tentative/confirmed and conflicts. `save_promotion_blackout`.

## Following (138)
`follows` (event, venue, organizer, category, city, series; alerts flag). Own rows only; organisers see counts. Job `promotion.follow_alerts` on first listing only → `notify(follow_alert)`, deduped, in-app (category `follow_alerts`, email default off).

## Campaigns (139)
`promotion_campaigns` (machine `promotion_campaign`: draft → scheduled → active ⇄ paused → completed; cancelled), 5-step `save_campaign_setup` (idempotent request_id, optimistic version, blockers), `campaign_transition`, `campaign_tick` (5 min). `campaign_channels` (ads budget needs `finance.write`); `promotion_boosts.campaign_id`.
Marketing: `audience_consents` per organiser (service-only), `audience_unsubscribe(token)`, global `email_suppressions`. `campaign_dispatch_message` records `campaign_deliveries` with transport = 'fixture' — **no real sends** (owner decision pending).
Links: `campaign_link_create` → `/r/c/<code>` → `record_campaign_touch` (service-only, rate-limited) → internal destination + UTM (no open redirect).
Attribution on checkout_orders: order already attributed to a campaign boost → channel ads; else last campaign touch by the buyer within 7 days; reversed on refund; never blocks an order. `campaign_report`: spend vs budget, per channel, deliveries, touches, orders, revenue, reconciliation vs checkout_orders, aggregates only (no ids/emails; providers no access).

## Media library (148), Studio (146), posters (147), brand (149)
`media_assets`: alt_text, licence, licence_holder/expiry, credit, usage_scope, subject. `media_public_problems()` gates public use: alt text, usable licence, approved, Q04 file decision ok (external/unscanned refused). `media_asset_publish`, galleries, `media_usages`, `previous_media`.
Posters: `poster_presets`, `poster_data(event, kind)` (QR only for listed events to the canonical URL; sold-out only when sold out; schedule in local time).
Exports: `request_design_export` → `complete_design_export` (service) → `design_export_download` (re-checks access + 7-day expiry) → `media.exports_sweep` (object deletion app job open).
Brand kits: versioned + rules; `brand_check_design`. Link/public templates scrubbed of emails/phones/tokens; active content refused; community templates post-moderated.
Landing pages: `promo_landing_pages` (events must be listed, hero public), `landing_page(slug)` public read with labelled sponsored slots.

## Share cards
`event_share_card(event)`: listed public events only; image without query strings; canonical URL. Private events: no preview.

## Open
UI wiring for all of the above (city/category/calendar/series pages, follow buttons, campaign wizard, media library, `/p/[slug]`, brand rules panel); real email (owner) and SMS (no provider); anonymous → login attribution; expired export object deletion; agent tools / API scopes (Q41–Q43, Q30).

## Where assets appear
- Event page banner strip (under the section tabs): event `media_assets` with usage_scope 'public', status approved/published and kind 'banner' or format 'banner'/'wide' (Media Studio banner exports), plus published `promo_landing_pages` that feature the event and have a public hero asset (links to /p/[slug]). Max two.
- Event page Photos: cover, `settings.gallery`, then items of public + published `media_galleries` for the event (alt text and credits kept; private/event-scope assets never shown, even in a member preview).
- Venue/service pages: public + published listing galleries and a public banner asset on the listing.
- Draft, event-scope or private assets never appear publicly.

- Merch: organisers add an external store link (Ops › Merch & stock → "Merch store link", `settings.merch_url`); the event page shows "Shop merch" (new tab, `noopener noreferrer nofollow`) plus on-sale items. No Gala Dock merch checkout.
- Video: the page editor's hero video (YouTube or Vimeo) embeds in About with privacy mode (youtube-nocookie / Vimeo `dnt=1`), click-to-load behind our own poster (no third-party request before the click), sandboxed iframe; hero "Watch video" jumps to it.
