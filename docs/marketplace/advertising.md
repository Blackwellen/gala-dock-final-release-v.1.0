# Owned advertising: placements, rotation and integrity (Q23)

**Status:** live (migration 202610291014, 2026-10-28; Q56 fixes 202611148761, 2026-11-14). Domains 140–145; backend §13.17 (sponsored is labelled and never contaminates organic ranking or reliability).

## Placements (`ad_placements`)

| Key | Surface | Format / size | Capacity | Subjects | Bought by products with placement | CPM floor | Freq cap/day |
|---|---|---|---|---|---|---|---|
| discover_hero | Discover | hero 1200×400 | 1 | event | discover, homepage | 700p | 3 |
| discover_feed | Discover | card 360×240, after organic #4 and #8 | 2 | event | discover | 400p | 4 |
| category_top | Category | card | 1 | event | category | 400p | 4 |
| search_results | Search | row | 2 | event | search | 500p | 4 |
| event_related | Event page | card | 2 | event | event_page, discover | 300p | 4 |
| marketplace_top | Organizer marketplace | tile | 2 | listing | marketplace | 500p | 4 |

A boost buys an impression goal = paid amount (ex VAT) × 1000 / lowest CPM floor of the placements it can serve (advertiser-favourable). There is **no auction**: products are fixed-price, prepaid (price + 20% VAT, `trg_payment_order_vat`); competition between boosts is the weighted rotation below. The `homepage_hero_3d` product ("Discover Hero") is served in the Discover hero — there is no homepage slot (Q56).

## Selection (`serve_ad_slots`, service-only, called by `src/lib/ads/serve.ts`)

1. **Eligible:** status active and not admin-paused, inside starts_at–ends_at, advertiser not suspended, product placement allowed for the slot, public on-sale future event or published unpaused listing without a trust hold, not demo-hidden, not already within the organic slot window on the page, goal not exhausted.
   **Matching (Q56):** page context only (city, category, search query — the query is matched, never stored). Explicit targets are normalised and match either way round ("food drink" ~ chip "food"); untargeted boosts match only on the subject's own city / event type, tags / listing category (the organic rule). The search row needs the query in the subject's name, venue, location or description (or a category target).
2. **Pacing:** allowed = goal × (elapsed share of flight + 1 hour); ahead of pace → held back.
3. **Frequency cap** per viewer per London day per boost (served tokens).
4. **Rotation:** weight = daily budget × pacing deficit (bounded 0.1–3); weighted sampling with a seeded draw (deterministic for tests; rotates per viewer per minute); at most one campaign per advertiser per response; capacity limit.
5. **Viewer:** sha-256 of user id, or HMAC(day + IP + user agent) for anonymous visitors. No advertising cookie, no profile. Bots get no slots; 300 serves per viewer per hour.

## Integrity

- Each served slot gets a single-use token. Impressions count only from the visibility beacon (50% visible for 1 s → `POST /api/ads/view`): same viewer, once per token, within 30 min, one per viewer × boost × placement per 30 min (serialised with an advisory lock), 240/h, only while the boost is active, unpaused and inside its flight. The advertiser's own team (owner / active members) is shown its ads but never counted (no self-impressions, self-clicks or self-attribution).
- Clicks: `GET /api/ads/click?t=` — once per token, same viewer, within 24 h, 60/h; destination from the database only (no open redirect).
- Legacy `record_boost_event` (anon; still used by the deployed page): once per viewer per hour, ≤600/min per boost; touches only legacy counters, never `delivered_*` or billing.
- Q75: nothing in the working tree calls `record_boost_event` / `active_boosts` any more; `/api/boosts/[id]/click` is a plain same-site redirect that records nothing. The anon/authenticated grants are revoked post-deploy by `supabase/pending/q75_retire_legacy_boost_rpcs.sql` (update the two tenant-security allowlist entries and the legacy assertions in boost-delivery / ad-inventory specs in the same change). Boost spend/delivery (`promotion_boosts`, `ad_attributions`) is readable by owner / manager / finance only (202611147501). Platform-charge refunds now reverse the VAT share in `tax_payable`.

## Labelling and organic separation

- Every sponsored render uses `SponsoredLabel` ("Sponsored") and `rel="sponsored nofollow"`; slots are a separate layer (`interleave()` inserts after fixed organic positions, never reorders or re-ranks organic items).
- Organic search/marketplace scoring ignores sponsorship (the +0.3 sponsored weight in `provider-search.ts` was removed). Reliability/ranking functions do not read promotion tables. Discover no longer re-sorts organic results to put sponsored events first.

## Attribution, reporting, credit

- Last sponsored click on the event by the buyer within 7 days before a paid/issued ticket order (`ad_attributions`, one per order); reversed on refund. Ticket face value, excluding booking fee. Logged-in buyers only for now.
- `boost_report(boost)` (advertiser workspace members): served, viewed, verified impressions/clicks, CTR, delivered vs pacing target, conversions, attributed revenue, reconciliation against checkout_orders (mismatch list), provenance per metric.
- `ad_settle_boosts()` every 15 min: ended flights record the undelivered share once (`ad_credit_ledger`); impression rows kept 90 days.
- **Undelivered spend is refunded to the card** (Q56; it used to be a "credit" nothing could spend): the payments cron (`processBoostRefunds`) refunds that share of what was charged, VAT included, on the original platform charge (`ad_credit_refunds_due` → Stripe refund, idempotent per ledger row, an existing Stripe refund is recorded instead of repeated → `ad_credit_refund_result`; failures back off, 5 attempts, then `promotion.boost_refund_failed` audit). The settled boost keeps status `ended`; `admin_vat_summary` counts only the unrefunded share of a boost's gross and VAT (202611148762).
- **Flights (Q56):** start = a London day (today = now, later = 00:00 London); the flight ends with the event if sooner; a late payment starts the full flight at payment time; an ended event can't be paid (`boost_expired`); retries reuse the open pending boost.
- **Checkout (Q56):** net and VAT are separate lines and Stripe issues an invoice with Gala Dock's VAT number (guest customer, so it is never treated as a plan invoice).

## Surfaces

Discover (hero / category top, search row, feed cards after positions 4 and 8), public event page ("Sponsored events" after Related), organizer marketplace ("Sponsored" row), organizer promotion page (verified delivery, CTR, orders, attributed revenue, credit). Files: `src/lib/ads/{core,serve}.ts`, `src/components/ads/{sponsored,beacon}.tsx`, `src/styles/sponsored.css`, `src/app/api/ads/{view,click}/route.ts`.

## Admin (Q56)

`/admin/commerce/advertising` (commerce permission; RPCs need aal2 + a reason, all audited): placements on/off, kill switch (`adm_ad_placement_set('*', false, …)`), pause / resume a boost (`adm_boost_pause`; the advertiser is notified; paused time is refunded at the end), delivery and refund status. The creative is the event or listing itself, so policy enforcement is a pause.

## Disclosure (Q56)

Every sponsored render carries the "Sponsored" label (tooltip explains the paid relationship) and sponsored rows / in-feed cards carry a "Why am I seeing this?" disclosure (`AdWhy`, outside the ad link). Organic cards never show "Sponsored" (the legacy `listings.sponsored` flag is not a paid placement).

## Open items

Provider buy flow for listing boosts (`marketplace_spotlight_7d` inactive); anonymous-to-logged-in attribution; partial ticket refunds do not reverse attribution; legacy anon `record_boost_event` / `active_boosts` are unused by the app and could be retired; legal review of the cookie-less HMAC(IP + user agent) viewer key under PECR reg. 6 (ICO fingerprinting guidance) and of 20% UK VAT on boosts sold to non-UK advertisers; domains 136–139 and 146–149.
