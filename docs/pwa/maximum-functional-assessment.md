# PWA maximum implementation assessment

Recorded 13 October 2026. All **154 mapped route/state targets have source implementations**, covering the 95 canonical appendix entries and 61 mapped design references. Media Studio and Event Map Studio are included. This establishes page coverage; it does not certify every capability, modal permutation or original release gate.

The user's later instructions relaxed exact 1:1 matching. No approved 5% visual fidelity pass is claimed. Historical raw comparisons remain 15.94% for ORG-001 and 11.42% for CU-013, with inferred viewports. The manifest keeps formal completion incomplete where the full original gates remain unverified, and separately records implementation presence.

## Implemented and integrated

- Customer date changes use a real impact/confirmation dialog and an authenticated native transaction. Other users, ticket commitments and provider booking commitments cannot bypass date locks through direct writes. London local times and event duration are preserved across DST.
- Requests save scoped drafts, retain selected listings, reorder recipients, record hours/holds and create real requests. Reference allocation no longer depends on an RLS-filtered sequence. Availability uses the existing privacy-preserving RPC; estimates do not claim invented provider confidence or Agent analysis.
- Request and event files use the canonical upload sanitation pipeline, owner-scoped verification and exact storage-object binding. Download authorization checks the actual request/event and current object before issuing short-lived links. Delete/replacement and cross-event path reuse cannot inherit prior verification.
- Customer booking reflects actual quote/deposit states, distinguishes unavailable card retrieval, and offers conditional holds without fictional card authorization. London booking windows use native timezone conversion; stale availability responses cannot overwrite newer selections.
- Shared error/loading states, keyboard scrolling, mobile layout, control sizing, contrast and heading fixes cover the role shells and sampled internal tabs. Mobile/tablet navigation retains exactly five options and the three-column Menu sheet.
- Both studios retain their existing domain integrations. Media Studio offline drafts, explicit PWA updates, map navigation, canonical ticket stages and revoked Agent permissions have executable regression coverage. Resale refunds follow the user's original-payment-method policy; the earlier real £42 Stripe test refund succeeded without replaying another refund.

Migrations `202610280031` through `202610280037` were applied to the configured linked Supabase project. No application deployment or live-money transaction was performed.

Legacy event-file objects were bound to their current storage identities without certifying their historical bytes. Existing uploader access and explicit same-event legacy paths remain supported. Previously unverified canonical private files shared with other members may require a secure reupload. A malware scanner is not configured; MIME checks, sanitation and active-PDF checks still run.

## Verification and evidence

| Check | Evidence and limits |
|---|---|
| Final production build | Latest **build 22 passed**, including TypeScript, `artifacts/pwa/continuation-production-build-22.log`. Build 21 caught a typing error in the extended ledger test; corrected before build 22. Prior build 19 also passed; initial build/type failures are retained. Isolated `.next-pwa-maximum` preview on port 3120. |
| Source lint | `artifacts/pwa/maximum-source-lint-accepted.log`; 0 errors, 395 warnings. Existing warnings remain. |
| Route and internal-tab audit | 320/320 observed cases clean across the base sweep and targeted corrected rechecks, at 390×844 DPR2. `artifacts/pwa/maximum-subviews-merged.json` records per-observation source evidence. This is not a single-build full sweep. Axe excludes incidental noninteractive poster artwork; library controls and text remain included. |
| Admin responsive audit | 72/72 checks across 320×844, 390×844, 820×360 and 1180×820; axe at 390px, no page errors. `artifacts/pwa/maximum-admin-complete.log` and `artifacts/visual/ws-layout/admin-mobile.json`. |
| Final workflow and lifecycle checks | Build 17: **all 16 scoped cases passed across the initial run and targeted rerun**: 12/14 in `maximum-final-ui.json`, the remaining **2/2** in `maximum-final-ui-recheck.json`, and lifecycle **2/2** in `maximum-final-lifecycle.json`. Initial Chrome launch and OTP rate-limit failures are retained. Cases cover date dialog/DST/native guards, request drafts/uploads/order, booking holds/quote states, request/event-file ownership and object replacement, mobile/tablet studios, offline drafts, menu keyboard access, account persistence and canonical ticket stages. This is not one uninterrupted suite result. |
| Final payment/ticket checks | Follow-up on build 17: **40/40 passed**, `signoff-payment-retry.json`, including the previously rate-limited cases and 15 concurrent holds against five tickets. Earlier rate-limit/CAPTCHA failures remain preserved. These are processor-boundary regressions, not live payment certification. |
| Final RLS and Agent checks | **29/29 passed**, `artifacts/pwa/maximum-final-security.json`: actual linked Supabase permission checks and Agent tool/credit/run guards. Disposable OTP fixtures do not certify password/CAPTCHA behavior. |
| Prior broader samples | Exact navigation/Menu: 27/27 cases; Provider: 120/120 route/geometry cases; native browser zoom: 24/24 representative samples; scoped Chromium, Firefox and WebKit checks. Earlier evidence is retained in `release-readiness.md`. |

The tree is shared and dirty. Build-specific results are retained rather than represented as one immutable production candidate. `checkpoint-source.json` records the current source fingerprint; traces and browser credentials remain ignored.

Final focused lint of booking and workflow/editor checks passed with zero errors and ten warnings (`maximum-final-focused-lint.log`). The payment rerun subsequently passed; earlier non-passing files remain excluded from successful-suite metadata.

## Follow-up configuration and security work

The reported payment rerun blocker is resolved. Seven additional event-cancellation/upload checks passed (`signoff-cancellation-upload.json`), including native cancellation restrictions, buyer refund queues, organiser/force-majeure fee decisions, reviewer permissions, the cancellation dialog, metadata removal and active-PDF refusal. Both rollback-only financial integrity fixtures passed (`signoff-financial-database.log`). These do not certify every chargeback or historical reconciliation case.

Readiness now checks the actual `STRIPE_CONNECT_SECRET_KEY` used by the payment client, classifies test/mismatched key modes, and treats malware scanning as a critical integration. The environment-push script no longer silently substitutes the sandbox key. Scanner checks require an explicit boolean scan verdict and a healthy engine; partial configuration fails closed. Eight isolated boundary tests passed (`signoff-readiness-boundaries.json`). No environment variables were pushed or deployment performed.

The read-only configuration inventory (`signoff-production-config.json`) distinguishes **local** from **deployed metadata**: the local Connect secret and both scanner variables are missing; the local publishable key is live. Linked Vercel has production entries for the Connect secret, publishable key and webhook secret, but their values/modes were not decrypted or verified. Both scanner variables are absent from the production target. Therefore the earlier blanket assertion that the production Connect entry was absent was too broad; live payment configuration still needs verification.

Build 19 production upload and readiness boundary checks passed **9/9** (`signoff-upload-production.json`). Focused lint passed with zero errors or warnings (`signoff-config-lint-final.log`). Actual production HTTP checks passed **3/3** (`signoff-health-readiness.json`): public and incorrect-bearer responses expose no integration/worker/backlog details and are not cached; the correctly authenticated response reports the actual local payment and scanner blockers. The initial HTTP fixture required an exact cache-control string; it was corrected to accept middleware's stronger `private, no-store, max-age=0` header. The failed assertion log is retained separately.

## Studio, map and webhook continuation

The additional Media Studio domain suite passed **8/8** (`continuation-media-domains.json`): workspace isolation, autosave, version conflicts/restoration, private template stripping, Agent authority, brand kit roles, font ownership/licence requirements and comment ownership/notifications. Mobile PNG and PDF exports passed **1/1** (`continuation-studio-export-retry.json`), checking actual PNG dimensions and a parseable PDF. Its first fixture used an overly strict label selector and timed out before attempting export; the corrected selector uses the format combobox's accessible name.

Event Map Studio passed **3/3** (`continuation-map-final.json`): mobile JSON import, draft save/reload, publication to six native seats, JSON/SVG download contents, unrelated-user denial, six concurrent buyers competing for one seat, held-seat removal protection, tier-count restoration, and twelve concurrent draft saves. The initial concurrency test exposed `23505` collisions on `(event_id, version)`. Applied migration **`202610280038_event_plan_version_lock.sql`** serializes the existing RPC's history allocation by event and rechecks authorization after acquiring the lock. Every successful draft retains a distinct history version. This preserves history rather than merging simultaneous edits; full collaborative editing is not certified. The original collision evidence is retained in `continuation-map-workflows-retry.json`.

The webhook/payment extension passed **12/12** (`continuation-webhook-finance-final.json`): invalid signatures, delivery replay, Connect state, server-calculated totals/fees/VAT, balanced ledgers, refund deltas, chargeback funds movements, release/dispute guards and accepted-cancellation refund queues. The first run passed 9/12 because three legacy fixtures supplied amounts inconsistent with immutable checkout totals or asserted old ledger description strings. Fixtures now include the actual booking fee, isolate checkout orders per test, and assert real cumulative refund increments. Production amount validation remains enforced. These are signed simulated provider events and isolated native database checks, not a live funds certification.

The deployed payment-value verification was attempted through Vercel's [documented read-only environment endpoint](https://vercel.com/docs/rest-api/projects/retrieve-the-decrypted-value-of-an-environment-variable-of-a-project-by-id). All three production payment entries are stored as `sensitive`; values were unavailable to that API (`continuation-deployed-payments.json`). No secrets were logged or written, no remote configuration was changed and no live transaction was attempted. Verification of those values remains externally blocked rather than assumed correct.

The continuation adds **24 passing scoped checks** (8 Media Studio, 1 mobile export, 3 map workflow, 12 webhook/payment), observed across the stated builds with the native version-lock migration applied. Build **22 passed**, including the extended test sources. Focused continuation lint passed with zero errors or warnings (`continuation-all-focused-lint.log`). Earlier failure logs remain available. Route-level Studio/map gates now reference the new workflow evidence while retaining incomplete status for the full original specification.

## Production release assessment

**Production release is not certified (NO-GO).** Page implementations and the checks above are delivered; production sign-off still requires:

- Verification of the deployed Connect/public/webhook values and a configured production malware scanner endpoint/token. Vercel payment entries exist, but their mode/validity is unverified; scanner entries are absent. The local sandbox key does not substitute for a production Connect key.
- An immutable candidate and complete release validation, including physical installed devices, manual assistive-technology checks, full capability/state permutations and production password/CAPTCHA flows.
- Complete historical financial reconciliation, remaining resale/cancellation-chain scenarios and live payment certification. The scoped cancellation, chargeback, refund-delta and replay regressions above have passed.
- Approved visual comparison conditions if the original quantified 5% gate is retained.

These remaining checks must not be interpreted as missing implementations for the 154 mapped targets, or as proof that every possible PWA state has passed. The route manifest preserves the distinction.
