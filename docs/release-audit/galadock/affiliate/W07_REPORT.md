# W07 — Affiliate / promoter / partner

Run 2026-10-28 · lane B · identities `partner.demo@example.com` (affiliate, 9%, grade 4) and `promoter.demo@example.com` (Neon Nights, code JORDAN, 15%); spec uses disposable users/events/promoters/partner, all removed. Evidence `artifacts/visual/w07/`. Spec `tests/affiliate/w07-affiliate-finance.spec.ts` (16: 11 pass, 5 expected-fail). Run with `--trace=off --output=<scratch>`.

## Fidelity

| Ref | Route | Status | Remaining drift |
|---|---|---|---|
| PART-001 | /partner | matched | earnings stop ~14 Oct (seed) |
| PROM-001 | /promoter/[id] | matched after F2/F3 | no event video (data); "Message organizer" missing (no channel) |
| — | /promoter | reference-blocked | same view as default campaign |

## Fixes

| # | File | Change |
|---|---|---|
| F1 | `src/styles/portal-partner.css:62-63,155` | earnings rate/next-grade text indent and wrapping |
| F2 | `src/styles/portal-promoter.css:55` | important-dates labels overlapping |
| F3 | `src/app/promoter/_view.tsx:82-85,158-159` | phase label shortened; "View timeline" only for public events (was 404) |
| F4 | `src/styles/portal-shell.css:157-159` | portal top bar overflowed 235px at 820 wide |

## Control census

399 controls / 11 states (105 unique); 79 links all 200; 0 broken; no console errors. Partial: "Customise" (no link/UTM builder), Messages/Notifications (no partner inbox), payout-method choice is a label.

## Conservation test (GD-08)

| Step | Result |
|---|---|
| Checkout value → eligible net | works (face value × rate; booking fee excluded); VAT/discount treatment undefined |
| Accrual | works (one row; replay adds nothing; later rate change doesn't rewrite) |
| Fraud rules | self-referral (same account), wrong event code, paused promoter → £0 |
| Refund → reversal | **missing** (`test.fail`) |
| Rule/version on accrual | **missing** (`test.fail`) |
| Locked payout | **missing** (`test.fail`): no payout run, `payout_id` never set, no FK/lock |
| Q27 exit gate (separate ledgers) | **missing** (`test.fail`): no ledger postings for promoter/affiliate commission |
| Partner click → signup → purchase | **missing** (`test.fail`): nothing reads `?ref=`; partner rows seed-only |

Passing: RLS isolation, promoter can't change own rate/status/counters or insert sales, payout method own-only + audited, leaderboard scoping, `/r` consent-first + HttpOnly `gd_ref` on yes + dedupe clicks + safe fallback, payouts ≤ approved accruals, statements = assigned earnings.

## Findings

Cross-account self-referral not checked; every sale recorded with channel `link` (per-channel stats always 0); no promoter→organizer messaging; no partner application/approval/KYC/tax flow. Backend: Q27 (+Q07 ledger, Q05 messaging). Seed (Q38): partner earnings stop ~14 Oct; no Neon video.

## Browser block 2026-10-29 (lane A)
F5 Customise link builder (`src/components/portal/link-builder.tsx`); F6 dead partner resource link fixed; F7 portal icon-link accessible names + top-bar overflow at 768 (`portal/shell.tsx:52-54`, `portal-shell.css:163`). PART-001 6.4% matched; PROM-001 6.8% matched — drift: Customise is a collapsible builder; "Message organizer" replaced by "Share campaign" (no messaging channel, Q05). Partner/promoter 5 views × 6 each; census clean.
