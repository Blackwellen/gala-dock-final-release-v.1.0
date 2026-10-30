# Privacy, retention, legal hold (Q32, domains 201–205, 269–270, 288) — 2026-10-29

Migrations 202610294020–4022. Tests: `tests/release/privacy-retention.spec.ts` (5/5), `tests/release/test-fixture-purge.spec.ts` (3/3).
**Legal text and every retention period below are drafts for legal review. Nothing here claims compliance.**

## Existing (kept)
privacy_requests (one-month deadline, extension with reason), deletion_blockers, 14-day grace + `/api/cron/privacy`, RLS-scoped `/api/account/export`, Q04 file retention + legal_hold flag.

## DSAR
`/api/account/export` adds `privacy_subject_records` (`privacy_subject_export()`): guest records (matched by account email), guest_care, registrations (+ private answers), passes, admissions, transfers, resale listings, waiting rooms, personal-event briefs, risk reviews (kind/status only), holds, security events, consents.

## Erasure
`erase_user_data`: refuses under legal hold (cron defers silently, audit `privacy.erasure_deferred`); anonymises guest records, deletes guest_care, anonymises registrations / passes / received transfers, deletes waiting-room, review-provenance and security events. Retained, pseudonymous (opaque id only): orders, payment orders, invoices, ledger (never deleted), disputes, resale payouts, consent and audit history, fraud-prevention records.

## Retention schedule (`data_retention_rules`, job `privacy.retention_sweep` daily 04:05, runs in `retention_runs`)
Enabled: rate_limits 2 d, read notifications 180 d, recently_viewed 365 d, launch_queue 30 d after event, account_security_events 180 d, review_provenance 365 d.
Disabled pending legal review: guest_care 90 d after event, guests 730 d, registrations 730 d, access_passes 365 d, check_ins device 365 d, closed transfers 365 d, cleared risk evidence 730 d.
Retain: finance, audit, consent, privacy requests (≥ 6 years, draft). Every handler skips data under an active legal hold. Admin: `privacy_retention_preview()`, `data_retention_rule_set(...)` (enabling a legal-review rule needs `p_legal_reviewed`).

## Legal holds
`legal_hold_place(matter, reason, subjects[{type: user|workspace|event, id}])`, `legal_hold_release(hold, reason)` — `privacy` admin permission (falls back to `audit`), MFA, reason, audited. Blocks erasure, retention purge and fixture purge; pins the subject's files (unpins only those it pinned). Machine `legal_hold`.

## Consent
`consent_records` append-only; `record_consent(purpose, granted, version, source)`, `my_consents()`. Profile marketing opt-in changes recorded automatically; baseline imported. Anonymous cookie consent would need an anon function (coordinator decision pending).

## Classification and audit
`data_classifications` (41 entries; rest listed as unclassified), `privacy_audit_report()` (recorded in `privacy_audit_runs`; states it does not certify compliance).

## Guest dietary data (Q18 finding)
Legacy `guests.dietary` is scrubbed after every write (value lives in `guest_care`, owner + managers only). A column revoke would have broken deployed queries. Readers moved to guest_care (customer guests page, organizer event data). **Until this code is deployed, the live site's dietary column shows blank** (data safe in guest_care).

## Test fixture purge (owner decision)
`admin_purge_test_workspaces(ids, reason, dry_run = true)` — `workspaces` admin + MFA. Eligible only if flagged `is_test_fixture` (service role only; test helpers set it) or owned by a disposable test identity (`p1-…-<8hex>@gala-dock.test`), with all members test identities; refuses legal hold, ledger postings, live-mode Stripe objects, real connected accounts. Append-only triggers allow deletes only inside a purge transaction with a matching record (`gala.fixture_purge`); no trigger disabling. Records `fixture_purges` / `fixture_purge_counts` are append-only and never purged. Script `scripts/testing/purge-test-fixtures.mjs` (dry run unless `--execute`; removes listed test auth users via the Auth admin API after re-checking each).
