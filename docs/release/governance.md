# Release, supply chain and migration governance (Q39) — 2026-10-29

Tests: `tests/release/migration-governance.spec.ts` (5/5).

## Migrations (live database, additive only)
One tool: `scripts/db/migrate.mjs` (`npm run db:migrate -- <cmd>`); per-lane `scripts/testing/apply-*-migration.mjs` are superseded.
1. Write the file in your lane range; `migrate lint <file>` (`scripts/db/lint.mjs`: errors = drop table/column, rename, type change, truncate, set not null, drop function without re-create, unbounded delete; warnings = bulk update/delete, permission narrowing, NOT NULL without default, constraint/policy/trigger not re-created).
2. `migrate dry-run <file> --exercise=<sql>` — rolled back; the exercise calls every new/changed function and raises EXERCISE_OK.
3. `migrate review <file> --lane=X --reviewer=… [--exercise=…] [--waive=rule] [--rollback="…"]` → `supabase/migration-manifest.json` (sha256).
4. `migrate apply <file>` (or `next`): refuses unreviewed / changed / lint-failing / recorded files, re-runs the dry run, applies and records in one transaction, stops on failure. `verify <file>` compares recorded statements. `record-only --i-verified` only for out-of-band applies.
5. `npm run db:parity`: schema_migrations (pending, unknown, out of order, drifted), state machines vs `src/lib/domain/state-machines.ts`, role permissions vs `permissions.ts` (`seedSafeToApply`).

State 2026-10-29: 264 files, 0 pending, 0 unknown (0026–0038 recorded after verification); drift: `202610294007` (edited after apply); 38/38 machines, 0 missing transitions; role permissions 73/73 (`checkin.scan` added to `permissions.ts`). Lint: 6 historical (already applied) files fail; state seed needs a waiver (delete + re-insert by design). DB types regenerated (`src/types/database.ts`).

## Rollback notes by family
- New tables/functions/views: roll forward; disable by revoking execute or turning off the calling job/flag; drop only after code no longer references them (owner approval).
- Function changes: re-apply the previous body from the prior migration (history rows hold the full text).
- Guards/triggers/constraint supersets: drop the new trigger or restore the previous constraint list.
- Jobs/cron: `cron.unschedule(name)`; job_kinds rows are inert without enqueues.
- Data backfills: idempotent rebuild (`analytics_build_range`) or the seed's reset; never bulk-rewrite production rows.
- Payments/ledger: never roll back postings; compensate with new balanced postings.

## Supply chain
`npm run release:supply-chain` → `artifacts/release/{supply-chain.json, sbom.cdx.json, licences.json}`: lockfile integrity, pinning report, licences (deny AGPL/SSPL/GPL; LGPL libvips flagged), CycloneDX 1.5 SBOM, npm audit mapping.
2026-10-29: 479 packages, integrity clean, 0 denied licences, 14 LGPL (sharp/libvips) for review. **Audit: 1 critical — next 16.4.0 (remote code execution in image optimisation with SVG; Server Actions DoS; fixed in 16.4.3); 1 high — zod 4.6.5 (fixed 4.6.6).** Upgrade needs owner approval.
Policy: security patches within 72 h; minor/major only with a report + full tsc + regression; framework pins exact.
2026-10-29 (lane D, scanner fallback): added `@zxing/library` **0.23.0** (exact pin; published 2026-04-29), licence **Apache-2.0**; one transitive dependency `ts-custom-error` 3.3.1 (MIT). Pure-JS QR + Code 128 decoder used only when `BarcodeDetector` is missing or lacks the formats (iOS Safari, Firefox, most desktop Chrome); loaded by dynamic `import()` from `src/lib/tickets/frame-decoder.ts`, so it is a separate chunk fetched only when a scanner starts the camera. Decodes on the device; no frames leave it. `@zxing/browser` (MIT) was not added — the scanners own their camera handling. `npm audit` after install: 0 vulnerabilities.

## Release checklist
1. `npm run release:check` (lint, tsc, supply chain, db parity) green.
2. All lane specs green; tenant-security 12/12; no BLOCKED item without an owner step.
3. `db:status` 0 pending/unknown; every applied file reviewed in the manifest.
4. Captcha restored (T1/T2), Stripe live keys/webhooks (owner), ClamAV gateway deployed.
5. Kill switches ready: feature `emergency_off`, `experiments.emergency_off`, maintenance M1–M3.
6. Change record: what, risk, approver, window, rollback owner.

## Not done
CI provider pipeline (commands are CI-ready), signed builds/provenance (needs CI with OIDC), staging (owner: none), load/chaos (Q45), browser/responsive/accessibility (W12/W13/Q44).

## Q39 remainder (lane C, 2026-10-29)
- Security patch (owner-approved, applied by the coordinator): next 16.4.3, eslint-config-next 16.4.3, zod 4.6.7 → npm audit 0 (was 1 critical, 1 high). Dev server restarted on 16.4.3.
- Lifecycle bypass closed (202610293032): a service-role / system write (no user token) that moves an event INTO ready/published/on_sale past its blockers is refused (`lifecycle_override_required`, blockers in DETAIL). Use `service_set_event_status` (publishes: sets visibility public), `service_insert_event(p_row, p_reason)` / `service_update_events(p_ids, p_patch, p_reason)` (visibility untouched), or `event_transition`. Spec helpers: `insertEventFixture` / `updateEventFixture` (`tests/phase1/helpers.ts`). Every use is logged in `event_lifecycle_overrides` (`source=override`, request role) plus `event.service_insert` / `event.service_update` audit rows. Exempt by construction: `complete_ended_events` (→ completed), admin reinstate (from suspended). Migrations that insert selling events must call `event_lifecycle_override_begin(reason)` in the same transaction. 35 call sites in 24 specs migrated; live `service_direct` writes since: 0.
- Drift: `migrate status` compares line-ending-normalised text; 202610294007 was CRLF-only (statements identical). Drift 0.
- Trigger grants (the 4031 class): `npm run db:migrate -- trigger-grants` (also in `parity`, so release:check fails on a hit) lists functions called from SECURITY INVOKER triggers on client-writable tables that `authenticated` can't execute, following invoker callees to depth 4. `--simulate-revoke=public.fn()` replays a revoke in a rolled-back transaction. Live: 0 hits.
- Dry-run rule: exercises live in `scripts/db/exercises/<file>` and must include a client-role write whenever a trigger used by client writes is touched.
- Purge spec: customer-write smoke test (build_items insert/update/delete as authenticated).
- `release:check` 2026-10-29: exit 0 — lint 0 errors, tsc 0, supply chain 479 packages / audit 0, parity clean (270/270 recorded, 38/38 machines, 73/73 permissions, trigger grants 0).

## Incident 2026-10-29 — a migration's own COMMIT escaped the dry run
`migrate.mjs` wraps every dry run in `begin … rollback`. Migration 202610294062 (policy role scope) contained its own top-level `begin;`/`commit;`, so its inner COMMIT ended the tool's transaction and made the migration live during the dry run, before its exercise had passed. Impact: none found — the change was the intended one (83 `TO public` policies rescoped to `authenticated`, anon read branches re-granted); it was then made idempotent, re-run through the full process (exercise EXERCISE_OK, review, apply, verify, parity clean) and recorded. 4060 and 4061 also contained begin/commit; their exercise changes were confirmed rolled back and both are recorded with matching statements. 115 earlier files use the same style.
**Fix:** `withoutTxnControl` (`scripts/db/lint.mjs`) strips top-level BEGIN/START TRANSACTION/COMMIT/ROLLBACK/END outside `$tag$` bodies before both the dry run and the apply (the tool owns the transaction); the reviewed text is still what is hashed and recorded. Regression test in `tests/release/migration-governance.spec.ts` (8/8).
