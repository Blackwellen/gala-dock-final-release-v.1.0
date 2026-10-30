# Gala Dock — execution checkpoint

Programme: `GalaDock_Enterprise_Completion_Master_Prompt_v6.md`. One engineering agent (plus at most one Sonnet helper, per owner).
Status words follow GD-01: nothing here is VERIFIED unless the evidence column says how.

## Sign-off blockers that MUST be undone before release

| # | Temporary change | Why | How to restore | Status |
|---|---|---|---|---|
| T1 | Supabase Auth captcha disabled (`security_captcha_enabled=false`, provider/secret kept) on the shared project | Owner instruction 2026-10-26 "turn it off until the end": Turnstile blocks every automated QA browser | Management API `PATCH /v1/projects/{ref}/config/auth {"security_captcha_enabled": true}`, then confirm a login without a token is refused | OPEN — production logins/sign-ups have no server-side bot check meanwhile |
| T2 | `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` blank in `.env.local` (local only; Vercel untouched) | Same | Delete the line (and its comment) from `.env.local`, restart dev | OPEN |

## Work packets — 2026-10-26 session

| Packet | Change | Evidence | Status |
|---|---|---|---|
| Display scale | `src/styles/density.css`: zoom fits the 1536px reference width (1366→.9, 1536→1, 1920→1.25); no height-based shrink; single definition (removed duplicate from `kit.css`) | tsc clean; browser capture pending (`scripts/design/capture-matrix.mjs`) | WORKING BUT UNVERIFIED |
| Customer shell | `src/styles/customer.css` top bar rebuilt to reference geometry, nav right-aligned, real wordmark logo; `.c-main` full width (no 1600px centred cap) | pending capture | WORKING BUT UNVERIFIED |
| ClamAV ownership | Scanner moved to `blackwellen-operations` (`services/av-scan-gateway`, 30 unit tests pass there); removed `ops/av-scanner` and ClamAV from `ops/oracle`; health check → `/healthz` | `tests/release/production-readiness.spec.ts` 8/8 pass | VERIFIED (code); deployment BLOCKED EXTERNAL |
| AI profitability | Migration `202610280039_ai_profitability_assurance.sql`: metered run cost, pack margin guard, overage receivable, provider-invoice reconciliation, `ai_profitability_report()`; runtime no longer writes a guessed cost; organiser Settings shows credits not £ | tsc clean; migration not yet applied | PARTIAL |

## Browser evidence (2026-10-26, `scripts/design/capture-matrix.mjs`, customer demo account)

- Shell geometry at 1536×730: top bar 68px; nav ends 1248 and icons start 1271, matching the Account reference. No horizontal overflow at 1366×700, 1536×730 or 1920×960; zoom .9 / 1 / 1.25.
- Content gutter is 44px at 1536 on /home, /discover, /plan, /account, /account/events, /account/tickets, /account/saved and /account/inbox.
- Fixed after capture, not yet re-captured: `kit.css` forced the customer logo into a 44px square (wordmark rendered about 70px wide); Account page had an extra 17px left margin.
- /account/reviews returned 500 because the disk was full (Turbopack could not write its cache), not because of an app error. Needs a re-capture.

## Environment blockers

- **C: drive full** (0.09 GB free at 20:05; 0.7 GB after clearing this session's caches, and still falling). Large Temp writers at that time: `bwrelverify-*`, `bw-wrangler`, `cb`, `wr` (another session). Dev server and captures fail until space is freed.
- **Next.js 16.4.0** reports a known security vulnerability on `next dev` (`next upgrade --agent=security`); `npm audit` reports 1 high and 1 critical. Needs an upgrade before release.

## Findings raised this session

- **P1 commercial:** no subscription billing exists — plans, credit packs and overage are configured but nothing charges for them (flag `plan_revenue_not_billed`).
- **P1 commercial:** all three proposed credit packs miss the 75% target once Stripe card fees (1.5% + 20p) are included (S 72.5%, M 73.25%, L 73.4%). Packs are inactive; the new guard refuses activation until finance reprices or lowers the target.
- **P2:** model price book is still `estimate`; credits may under-charge real Azure cost until contract prices are entered.
- **P2:** customer (no-workspace) Gala Agent asks are platform-absorbed cost — now reported, not billed.
- **Fixed:** organiser Settings showed a fabricated £ "spend" (tokens × flat $0.06/1k) to customers.

## Next smallest valid work packet

1. Capture customer routes at 1366×700 / 1536×730 / 1920×960 and compare against `Designs/customer & Organizer workspace` (CU-001…CU-013).
2. Apply `202610280039` and add a DB test for the pack guard, overage accrual and report.
3. Advert placements and rotation audit (`promotion_boosts`, `boost_delivery`).
4. Seeding depth, component and backend test inventory; per-workspace audit files (GD-20).
