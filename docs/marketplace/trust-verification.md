# Trust, verification & provider documents (Q08, domains 116–122)

Migrations 202610293001–3007. Tests: `tests/trust/trust-verification.spec.ts` (API, disposable identities), `tests/release/tenant-security.spec.ts` (service-only registry).

## Model

- `verification_checks` — one row per subject (workspace|user) + kind (identity|business|stripe_connect). Status = `verification` machine (enforce): unverified → submitted → pending_review → verified / action_required / rejected / suspended; verified → expired | pending_review (refresh). Business details (legal/trading name, company number, address, beneficial owners) are private. History: `verification_records` (business/identity steps) + `verification.state_changed` outbox + `provider.verification_changed` audit.
- Stripe: `syncConnectAccount` (account.updated webhook data only) → `trust_sync_stripe_check` walks the machine step by step. No Stripe API calls.
- `credential_types` (insurance, licence, certificate, food_hygiene, security, equipment, risk_assessment, company, accessibility) and `credential_requirements` (capability, category + aliases, country, required/recommended, `gates_marketplace`, `min_cover_minor` — public liability ≥ £1,000,000, owner/legal may change) are data.
- `provider_documents` — evidence with expiry, policy number, issuer, cover amount/currency, `renewal_of` / `superseded_by`.

## Privacy

Documents are `sensitive` files in `workspace-files` (owner-folder storage RLS; re-classed on submission → quarantined until ClamAV clean). Rows readable only by the workspace's settings/listings managers and Trust & Safety. Download: `/api/trust/documents/[id]` → `provider_document_access()` → Q04 gate → 60-second signed URL for that one object; access audited. Outsiders see only the derived badge and its scope text.

## Computed state (never stored-and-stale)

`trust_credential_eval` is time-aware (past expiry = expired before the job runs; a pending renewal never hides a valid document; cover below minimum = `insufficient_cover`). `workspace_credential_status`, `trust_summary`, `listing_trust` read it. `listings.verified` and `workspaces.verification_status` are derived caches recomputed by BEFORE triggers on every write; evidence, check and enforcement changes refresh them; the daily job refreshes time-based lapses.

Listing badge = listing approved AND identity verified (Stripe or Gala Dock review) AND all required credentials for that listing verified and current AND no active enforcement.

**Live effect of migration 3003 (2026-10-28):** listings marked Verified 33 → 0 (no provider has verified, current documents); workspaces verified 11 → 27 (27 have a verified Stripe Connect mirror; 11 seeded flags without evidence removed). Q38 must seed real evidence to restore demo badges.

## Eligibility

| Situation | Publish | Accept new marketplace work | Visibility |
|---|---|---|---|
| Gating credential missing / submitted / rejected | blocked (`credentials`) | allowed (grandfathered; `trust_policy.missing_blocks_acceptance` off — owner decision) | unchanged |
| Gating credential expired / cover below minimum | blocked | blocked (`trust_ineligible: <reason>`) | listing held (unpublished) until renewed evidence is verified |
| Workspace suspended / booking block | blocked (`trust_hold`) | blocked | suspended: all listings held |
| Listing hidden | blocked | blocked for that listing | held |

Signed-in provider/customer actions are gated (quote send, marketplace job creation); webhook/service paths are not (money may already be taken). Direct bookings are not gated.

## Jobs

- `trust.expiry_daily` (02:15): expire documents/checks, reminders at 30/14/7/1 days via `notify()` (deduplicated), expire time-boxed enforcement.
- `trust.reliability_daily` (02:45): versioned reliability snapshots.

## Reliability

`reliability_formulas` (append-only versions; v1 weights response rate .20, response time .10, completion .20, cancellations .20, disputes .10, arrival .05, review score .15; minimum samples; review prior 4.0 × 5). `reliability_snapshots` keeps numerator/denominator/value/weight per component and exclusions. Never inputs: sponsored listings, boosts, ads. Reviews count only when published, linked to a booking, not by the provider's own team and not under enforcement. Public: `reliability_band` (coarse). Members/Trust: `reliability_explain`.

## Reviews & moderation

`submit_review`: event owner, completed booking (or legacy confirmed booking after the event ended), one per booking, no self/team reviews, validated rating dimensions. `respond_to_review` for provider owner/manager. `report_review`: reason code, one per user, opens a Fraud/Abuse case, no auto-hide. `moderation_reason_codes` (15) → `trust_enforce` (warning, listing_hidden, workspace_suspended, booking_block, review_removed/hidden, content_removed) with note, evidence, optional end date and 14-day appeal deadline → `trust_appeal` (affected party, once) → `trust_decide_appeal` (overturn reverses the effect), `trust_lift_enforcement`. Everything audited (`trust.*`, `review.*` → outbox) and notified.

## Open

ClamAV gateway (documents cannot clear the scan → BLOCKED_EXTERNAL); admin review UI for documents/checks/enforcement (RPCs exist); customer identity checks (schema only; Stripe Identity needs API); message/media/template moderation effects (`content_removed` records only); `profiles.identity_verified` still a seeded boolean on admin user pages; event readiness compliance check (Q14) should use `trust_credential_rows` — sent to lane D.
