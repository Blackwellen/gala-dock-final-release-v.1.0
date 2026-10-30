# Search, cache & indexing (Q06)

## Index — `public.search_documents` (service-only)

One row per event, venue, service, organiser, provider: title/subtitle/body, city, category, tags, image, link, lat/lng, starts_at, price_from, rating, `is_public`, `tsv` (english + simple, title weight A), quality flags. GIN tsvector and trigram indexes and a GiST earthdistance index (cube + earthdistance; PostGIS is not installed) — all partial on `is_public`.

Public predicates mirror the anon RLS policies: events `visibility='public' and status in (published, on_sale, live)`; listings `published and paused_at is null`; providers/organisers only when they have a public listing/event.

Initial build: 424 documents, 49 public (10 events, 16 venues, 19 services, 3 providers, 1 organiser); quality flags: 23 thin descriptions, 2 duplicate titles.

## Pipeline

- Row triggers on events, listings, workspaces re-index synchronously (a record made private leaves search in the same transaction); a failure queues the row in `search_index_queue` instead of blocking the write.
- `search.drain` (db, every 5 min when the queue is non-empty); `search.reconcile` (db, 02:50 daily) = full rebuild from source, removes orphans, records indexed/removed/drift and the data-quality baseline in `search_index_runs`.
- Manual: `select public.search_rebuild('rebuild')`.

## Query

`public_search(q, types, lat, lng, radius_km, limit, offset)`: prefix tsquery with synonym (`search_synonyms`) and Q02 master-data (taxonomy_spellings → labels) expansion, plus trigram similarity; geo via earth_box/earth_distance; rank = ts_rank + similarity + upcoming bonus − quality penalty. **Defence in depth:** every row is re-checked against the live source predicate, so a stale or corrupted index row cannot leak. `public_autocomplete(prefix)`: public titles + category labels. In-app (signed-in) search stays `global_search` (RLS / `can_access_event` based).

## Public API (signed out; backend for lane B's public pages)

`GET /api/public/search?q=&type=event,venue,service,organizer,provider&lat=&lng=&radius_km=&limit=&offset=` → `{ query, results[], organic_only: true, cache }`; `GET /api/public/autocomplete?q=`. Rate-limited per hashed IP; `Cache-Control: no-store`. Sponsored placements come only from Q23 `serve_ad_slots` and are never mixed into organic ranking.

## Cache

`VersionedCache` (`src/lib/cache/versioned.ts`): entries keyed by `scope@version:key`; `cache_versions` is bumped by the database whenever a public document changes (`cache_bump('search:public')`). The search service re-reads the version on every request; if the version source fails, the cache is bypassed.
