# Experiments and experiment safety (Q36, domains 229–230) — 2026-10-29

Migration 202610293030. Tests: `tests/release/experiments.spec.ts` (5/5). Builds on Q01 flags (`platform_settings 'flags'`, `feature_enabled()`).

## Model
`experiments` (key, kind feature|ranking|checkout|promotion|onboarding|pricing, unit user|workspace, layer, flag_key, traffic_pct, holdout_pct, targeting, guardrails, primary_metric, version, status) · `experiment_variants` (one control, weights) · `experiment_versions` (immutable per started version) · `experiment_assignments` / `experiment_exposures` (service only) · `experiment_holdouts` · `experiment_guardrail_checks`. Machine `experiment`: draft → (pending_approval → approved) → running ⇄ paused → stopped | completed; archived. Running definitions frozen.

## Assignment (deterministic, sticky)
`experiment_assign(key, user, workspace)` (server only; TS `getVariant` / `variantFor` in `src/lib/experiments/server.ts`). Bucket = HMAC(salt:unit) mod 10000; variant from an independent bucket; first assignment persisted. Control served when killed, not running, ended, opted out (consent `experiments` = false), flag off, not targeted, demo/test identity, layer holdout/conflict, outside traffic. Exposure logged once per unit (counter increments).

## Safety
- Config denylist (all kinds, nested): price, fee, amount, cost, commission, vat, tax, refund, payout, capacity, quantity, inventory, stock, limit, currency, discount, charge, terms, legal, policy, consent, privacy, verification, safety, age, waiver, threshold, insurance, licence. Per-kind allow-lists.
- Pricing tests: only `price_book_ref` to existing active plan_prices rows; need a commerce admin other than the creator. Legal-text surfaces need approval.
- Payment, ticket and safety code never reads experiment config.
- Kill switches: global `flags.experiments.emergency_off`; per experiment stop.
- Guardrails: Q35 metric or event rate per variant (min units, direction, threshold); job `experiments.guardrails` every 30 min stops on breach.

## Admin
`admin_experiment_save` / `admin_experiment_transition` / `admin_experiment_holdout` / `admin_experiments_overview` / `experiment_evaluate` — settings permission + MFA + reason, audited. Data route `/admin/settings/experiments`; **UI page pending (W08)**.
