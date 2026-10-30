# Backups, restore and disaster recovery (Q34)

## What is backed up
| Layer | How | Retention | Verified by |
|---|---|---|---|
| Database (logical) | pg_cron `db-backup` (every 10 min 02:00–03:50 UTC, no-op once complete) → Edge Function `db-backup` → R2 EU `db-backups/<date>/<schema>.<table>.ndjson.gz` + `manifest.json`; `db_backup_runs` / `db_backup_tables` | 35 daily + 1st of month × 12 | `ops_backup_status()`, alerts `backups.db_stale` / `db_failed`, restore drill |
| Database (physical) | Supabase WAL-G daily | 7 days | provider |
| PITR | **Not enabled** (owner decision 2026-10-12) | — | — |
| Storage | `/api/cron/storage-backup` every 15 min → R2 `storage/<bucket>/<name>`; deleted objects kept 35 days | 35 d after delete | `backups.storage_lag` |
| Schema / functions / RLS | `supabase/migrations` (git) | git | tenant-security suite |
| Config / secrets | Vercel env + Supabase Vault (`cron_secret`, `app_url`); password-manager record "Gala Dock production secrets" | — | manual |

Verified 2026-10-29: 18 nightly R2 runs (10-12 → 10-29) complete; R2 listing matches `db_backup_runs`; retention in policy.

## RPO / RTO
| Scenario | RPO | RTO |
|---|---|---|
| Bad deploy | 0 | 10 min (promote previous) |
| Data corruption | ≤ 24 h (minutes with PITR) | 4 h |
| Region outage | ≤ 24 h | provider-led; restore elsewhere after 12 h |
| Full logical restore into a fresh DB | ≤ 24 h | drill: 121 s load + verify (52,584 rows); production ≈ 1–2 h with project setup and migrations |

## Restore drill (scratch only — never over live)
1. `npm i --no-save @electric-sql/pglite@0.3.2` (or set `PGLITE_MODULE`).
2. `node --env-file=.env --env-file=.env.local scripts/ops/restore-drill.mjs latest --report <scratch>/drill.json`

Lists R2 and checks retention; reads live table definitions (read-only); loads every table into in-memory PGlite and applies NOT NULL / PK / unique / check / exclusion / FK constraints; checks every live record created before the backup exists; records `ops_restore_tests` (`target_kind local_scratch`, `target_is_live` constrained false) and marks the run verified.

Result 2026-10-29: **PASSED** (`ops_restore_tests` 0ae19369…). 321 tables, 52,584 / 52,584 rows; NOT NULL 2,865, PK 320, unique 104, check 1,022, exclusion 3, FK 756 OK, 0 failed (8 FKs skipped — tables newer than the backup); completeness 0 missing; retention 18/18.

**Known format limitation:** NDJSON writes jsonb JSON-null and SQL NULL the same way. The drill handles it; `scripts/db-backup-restore.mjs --target` still needs the same fix (`plan_entitlements.value`, 4 rows) — owner deploy (script or Edge Function).

Monthly: run the drill. Quarterly (owner, cost decision): Dashboard → Database → Backups → Restore to new project (temporary), `supabase db diff` against migrations, read-only smoke tests, record RTO, delete the project.

## Real recovery (incident commander + second admin)
1. Declare an incident (`admin_ops_incident_open`).
2. Maintenance M3 on affected modules (Admin → Maintenance) — never for drills.
3. Target: new Supabase project (preferred) or row-level copy-back.
4. Apply `supabase/migrations`, then `scripts/db-backup-restore.mjs <date> --target <new-ref>` (never the production ref without a deliberate dual-control decision).
5. Re-run tenant-security, ticket ledger, payments reconciliation.
6. Repoint env, end maintenance, monitor `/api/health`.
7. Postmortem within 5 working days.

## PITR options (documented, not changed)
Supabase PITR is a paid add-on (Pro or higher, minimum compute; 7/14/28-day windows) replacing daily physical backups; lowers RPO to seconds/minutes. Revisit when paid volume starts.
