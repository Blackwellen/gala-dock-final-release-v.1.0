# Q45 performance evidence (lane C, 2026-10-29) — local dev against the live DB; no production load testing

## Hot paths, database time (30 runs each, rolled back, real roles)
| Path | p50 ms | p95 ms | max |
|---|---|---|---|
| marketplace_search (organiser) | 22.7 | 34.3 | 56 |
| calendar_events (anon, month) | 17.2 | 20.2 | 49 |
| event_readiness | 4.1 | 16.1 | 101 |
| event_ops_readiness | 2.3 | 8.7 | 11 |
| scan_ticket admission | 3.9 | 6.0 | 13 |
| hold_tickets (anon) | 1.1 | 2.4 | 11 |
| checkout_quote | 1.0 | 2.0 | 10 |
| booking request insert (RLS) | 0.8 | 1.3 | 9 |
| organiser event page reads | 0.6 | 0.9 | 5 |
| public_event_plan | 0.4 | 0.5 | 6 |

## HTTP through the dev server (15 runs, dev-mode rendering)
| Path | p50 ms | p95 ms |
|---|---|---|
| / | 728 | 928 |
| /discover | 439 | 1,863 |
| /events | 1,400 | 1,700 |
| /events/neon-nights | 1,116 | 1,482 |
| /events/calendar | 593 | 855 |
| /api/public/search | 171 | 462 |
| /api/public/marketplace | 274 | 354 |
| /api/public/discover | 152 | 344 |
| /api/health | 168 | 315 |

Dev-mode numbers are inflated; production p50/p95 come from Q34 synthetic probes / Vercel analytics after deploy.

## pg_stat_statements analysis (read-only, top 40 by mean)
- `attribute_referral` mean 1,358 ms (max 7 s): lock waiting under deliberately serialised concurrent referral tests; warm uncontended 19 ms. No index helps.
- `calendar_events` (anon) 83 ms mean: `calendar_window` validates timezone against `pg_timezone_names` (170 ms first call, ~15 ms after). Fix: check against `ref_timezones` or `at time zone` in an exception block.
- Sequential scans on tickets (12.7 M rows read) and check_ins (12.5 M) → migration 202610293035 indexes (order_ref lookup 67 → 0.05 ms). Plain CREATE INDEX (tables < 20k rows; DB 124 MB).

## Concurrency — 18/18
Q20 load (24 buyers / 3 GA → 3 holds; 24 / 3 seats → 1 per seat; never > 3 held; code max_uses holds) 10/10; 12-buyer promoter-pass rush never oversold 4/4; concurrent duplicate scans → one admission 4/4.

## Connection budget
max_connections 60, ~24 in use. The app has no direct Postgres client; every serverless route goes through PostgREST's pool.

## Bundle size
Production per-route sizes BLOCKED to CI (no `next build` here). Dev-chunk estimate: most pages 6.0–6.4 MB unminified; **/checkout/[event] 10.9 MB** — ~4.6 MB extra (likely map/seat libraries); check imports in CI.

## Close-out (lane C, 2026-10-29)
- **calendar_window timezone — FIXED (202610293037).** `public.timezone_valid` (ref_timezones → AT TIME ZONE probe → snapshot → live catalogue for newly added names); same accepted set. Warm 15–25 ms → 0.03–0.19 ms per call; cold 26–188 → 2–36 ms. calendar_events anon month p50 17.2 → 3.6–6.2 ms, p95 20.2 → 4.0–6.8 ms.
- **/checkout bundle — FIXED for general-admission events.** Extra weight was the full Lucide icon set reached via SeatPicker → venue-map → design elements. SeatPicker now `next/dynamic` (SSR'd, 480 px placeholder). /checkout/neon-nights 11.22 → 6.38 MB dev chunks. Seated checkouts still 11.24 MB (needs lazy Lucide in shared design views — design-lane decision).
