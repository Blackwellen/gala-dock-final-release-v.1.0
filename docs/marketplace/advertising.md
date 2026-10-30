# Owned advertising: placements, rotation and integrity (Q23)

**Status:** live (migration 202610291014, 2026-10-28). Domains 140–145; backend §13.17 (sponsored is labelled and never contaminates organic ranking or reliability).

## Placements (`ad_placements`)

| Key | Surface | Format / size | Capacity | Subjects | Bought by products with placement | CPM floor | Freq cap/day |
|---|---|---|---|---|---|---|---|
| discover_hero | Discover | hero 1200×400 | 1 | event | discover, homepage | 700p | 3 |
| discover_feed | Discover | card 360×240, after organic #4 and #8 | 2 | event | discover | 400p | 4 |
| category_top | Category | card | 1 | event | category | 400p | 4 |
| search_results | Search | row | 2 | event | search | 500p | 4 |
| event_related | Event page | card | 2 | event | event_page, discover | 300p | 4 |
| marketplace_top | Organizer marketplace | tile | 2 | listing | marketplace | 500p | 4 |

A boost buys an impression goal = paid amount × 1000 / lowest CPM floor of the placements it can serve (advertiser-favourable).

## Selection (`serve_ad_slots`, service-only, called by `src/lib/ads/serve.ts`)

1. **Eligible:** status active, inside starts_at–ends_at, product placement allowed for the slot, public on-sale future event or published unpaused listing, targeting (cities/categories) matched against page context only, not already shown organically on the page, goal not exhausted.
2. **Pacing:** allowed = goal × (elapsed share of flight + 1 hour); ahead of pace → held back.
3. **Frequency cap** per viewer per day per boost.
4. **Rotation:** weight = daily budget × pacing deficit (bounded 0.1–3); weighted sampling with a seeded draw (deterministic for tests; rotates per viewer per minute); at most one campaign per advertiser per response; capacity limit.
5. **Viewer:** sha-256 of user id, or HMAC(day + IP + user agent) for anonymous visitors. No advertising cookie, no profile. Bots get no slots; 300 serves per viewer per hour.

## Integrity

- Each served slot gets a single-use token. Impressions count only from the visibility beacon (50% visible for 1 s → `POST /api/ads/view`): same viewer, once per token, within 30 min, one per viewer × boost × placement per 30 min, 240/h.
- Clicks: `GET /api/ads/click?t=` — once per token, same viewer, within 24 h, 60/h; destination from the database only (no open redirect).
- Legacy `record_boost_event` (anon; still used by the deployed page): once per viewer per hour, ≤600/min per boost; touches only legacy counters, never `delivered_*` or billing.

## Labelling and organic separation

- Every sponsored render uses `SponsoredLabel` ("Sponsored") and `rel="sponsored nofollow"`; slots are a separate layer (`interleave()` inserts after fixed organic positions, never reorders or re-ranks organic items).
- Organic search/marketplace scoring ignores sponsorship (the +0.3 sponsored weight in `provider-search.ts` was removed). Reliability/ranking functions do not read promotion tables. Discover no longer re-sorts organic results to put sponsored events first.

## Attribution, reporting, credit

- Last sponsored click on the event by the buyer within 7 days before a paid/issued ticket order (`ad_attributions`, one per order); reversed on refund. Ticket face value, excluding booking fee. Logged-in buyers only for now.
- `boost_report(boost)` (advertiser workspace members): served, viewed, verified impressions/clicks, CTR, delivered vs pacing target, conversions, attributed revenue, reconciliation against checkout_orders (mismatch list), provenance per metric.
- `ad_settle_boosts()` every 15 min: ended flights credit the undelivered share once (`ad_credit_ledger`); impression rows kept 90 days.

## Surfaces

Discover (hero / category top, search row, feed cards after positions 4 and 8), public event page ("Sponsored events" after Related), organizer marketplace ("Sponsored" row), organizer promotion page (verified delivery, CTR, orders, attributed revenue, credit). Files: `src/lib/ads/{core,serve}.ts`, `src/components/ads/{sponsored,beacon}.tsx`, `src/styles/sponsored.css`, `src/app/api/ads/{view,click}/route.ts`.

## Open items

Provider buy flow for listing boosts (`marketplace_spotlight_7d` inactive); applying advertiser credit to a new boost; anonymous-to-logged-in attribution; domains 136–139 and 146–149.
