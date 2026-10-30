# Marketplace ranking, matching and discovery (Q09)

> **Owner rule (2026-10-29), DONE:** ranking reasons, scores, model versions and feature values are internal explainability only — never shown to customers or the public (migrations 202610291033–1034).

Migrations 202610291031–1034. Tests: `tests/marketplace/marketplace-ranking.spec.ts` (9).

## Search
- `marketplace_search(p jsonb)`: authenticated users, and the public API through the service role. Lean shape `{total, limit, offset, results[], organic_only, filters}` — organic order with listing facts (price, estimate, packages, availability, reliability band, rating). No `score`, `ranking_reasons`, `model_version` or `excluded_inputs`.
- `marketplace_search_explained(p, p_workspace)`: internal explain path, full shape + `explained: true`. Allowed for platform admins (`marketplace` or `support` permission) and members of `p_workspace` with `marketplace.request` (organizer) or `listings.manage` (provider); otherwise `not_authorized`. Used by the organizer loader `rankedFor()`.
- `marketplace_search_ranked(p)`: SERVICE-ONLY engine (unchanged Q09 logic).
- TS defence in depth: `src/lib/search/public.ts` lean types + strip; `/api/public/marketplace` sponsored items carry no reasons.
Hard filters first: published and unpaused, no open trust hold, kind, category, city or radius, query, capacity, price, verified, instant book, has package, availability when `availability=exclude`.

## Ranking model (`ranking_models`, versioned, immutable)
v1 weights: text 0.20, distance 0.15, availability 0.20, reliability 0.15, rating 0.15, response 0.10, budget 0.05. Features without input are omitted and weights renormalise. Score = 100 × Σ(value×weight)/Σweight. The explain path returns `ranking_reasons[]` {feature, value, weight, contribution, text}; contributions sum to the score.
**Never inputs:** `listings.sponsored`, promotion_boosts, ad tables (listed in `excluded_inputs` on the explain path).

## Matching and recommendations
- `marketplace_match(event, category, limit)` → lean results for customers; explained only when the caller may explain for the event's workspace. Runs persist features to `marketplace_match_runs`, readable only by the event team with `marketplace.request` / `listings.manage`, or admins — customers can't read them even for their own event.
- `marketplace_recommendations(mode, id)` → `event` | `backup` | `similar`, lean, `source: 'ranking_model'`.

## Public APIs (signed out, rate-limited, no-store)
- `GET /api/public/marketplace?...` → lean organic results + `sponsored[]` (label "Sponsored", `rel="sponsored nofollow"`, separate array, never re-ranks organic).
- `GET /api/public/discover?...` → `public_discover` (service-only; no scores or reasons).

## Seed gaps (Q38)
Most providers lack reliability snapshots; 0 verified listings; some listings lack lat/lng; few multi-space venues; no package-based demo lines or match runs.
