# Legal v2 sign-off checklist: Gala Dock (playbook §4, 2026-11-11)

**Flow:** draft → review against the engine → fix → zero placeholders and zero draft markers → **director sign-off** → publish.

Nothing below has been published; the owner publishes. Publish from a clean worktree, with the version bumped in `src/lib/legal.ts` (`LEGAL.version`) and in `dec107_settings.payment_terms_version` / `dispute_rules_version`.

## A. Texts ready for director sign-off

| # | Document | File | Engine review | Placeholders |
|---|---|---|---|---|
| A1 | Payment Terms gd-pt-1.0-2026-11-11 (replaces Payment Protection Terms 2026-10) | `docs/legal/payment-terms-v2-draft.md` | done, 1 gap (P2B notice mechanism) | 0 |
| A2 | Disputes Policy gd-dr-1.0-2026-11-11 | `docs/legal/disputes-policy-v2-draft.md` | done: the engine now matches (24 h window + 8.3 filing + 8.4 lapse, migration 202611116007) | 0 |
| A3 | Accessibility Statement | `src/app/(legal)/accessibility/page.tsx` (draft banner) | claims limited to the 12 Oct axe audit | 0 |

## B. Published texts that now contradict the engine: **PRIORITY (factual errors)**

B1, B4 and B5 are false statements on live pages today. Exact replacement texts: `docs/legal/live-text-corrections-v2-draft.md` (P1–P3). Publish them first, even before A1/A2.

| # | Where | Says | Must say |
|---|---|---|---|
| B1 | `/terms` §9 (`src/app/(legal)/terms/page.tsx:76`) | "we may decide how the funds we hold are released or refunded" | "Gala Dock may recommend but does not decide; money moves only as set out in the Payment Terms (party agreement, settlement, independent award, or the default rule)" |
| B2 | `docs/legal/payment-protection-terms.md` §1–2 (published 2026-10) | Gala Dock is merchant of record, holds money on its platform balance, transfers it, 48 h release | Replace with A1: the seller is the merchant, money stays in the seller's balance, payouts happen on triggers |
| B3 | `docs/legal/cancellation-refund-policy.md` | 48-hour dispute window | 24 hours (or change the engine; owner) |
| B4 | `/privacy` (`privacy/page.tsx:58`) | lists Anthropic as a processor | remove; AI is Azure OpenAI only (owner decision 2026-10-28) |
| B5 | `/privacy` §8 + `/data-retention` | no backup retention statement | add: "Deleted data leaves our backups within 65 days (Supabase daily backups 7 days; our encrypted copies up to 63 days); erasures are re-applied after any restore" (UK GDPR retention decision, cross-brand notes §5) |
| B6 | `/terms` §3 fees | ticket seller fee wording | confirm it matches `commerce.ticket_fee` (5% seller + £1 buyer) and the DEC-107 seller-fee cap (8%) |

## C. Express terms: recorded with version, user and time, at the point they matter

| Term | Where it is ticked | Code | Status |
|---|---|---|---|
| Payment Terms (seller) | payout set-up, before Stripe opens | `/api/payouts` 409 → `PaymentTermsTick`, `accept_payment_terms('seller')` | built |
| Payment Terms (customer) | first payment: tickets, bookings, merch, pay links | `customerTermsGate`, `CustomerTermsTick`; pay links record an audit entry for payers without an account | built (browser check pending) |
| Dispute rules (both sides) | first commercial step | `accept_dispute_rules` RPC exists; **no UI tick yet** | gap: harmless while `dispute_rules_in_force_from` is NULL, because no deadline rule runs; needed before A2 is in force |
| Chargeback undertaking (business clients) | — | not built | deferred (Gigvora business-only) |

Demo/QA users are exempt from the customer tick (`exempt_demo_qa`, default on).

## D. Consumer-law items that block publication

| Item | Status | Evidence / action |
|---|---|---|
| Trader status question (default "As a business: sole trader, freelancer, partnership or company") and a non-trader warning to consumers | **BUILT 2026-11-11** | Migration 202611116008. Question asked before payout set-up (`TraderQuestion`), recorded with version, user and time (`seller_trader_declarations`); demo/QA count as business. Warning shown at ticket checkout (`NonTraderNotice`). Public event and listing pages: the public lane renders it via `event_seller_non_trader` / `listing_seller_non_trader` |
| Pre-contract information | built | Quotes show price, deposit, balance, due dates and the cancellation policy; checkout shows the total incl. VAT and fees before payment |
| Two ticks (start within 14 days; loss of the right) | not applicable to date-specific leisure services (CCR 2013 reg 28(1)(b)) | **Owner/legal confirm.** Services that are not date-specific (if ever sold) would need the ticks |
| Confirmation email with the model cancellation form | not built | Needed only if a statutory cancellation right applies (see above); legal confirm |
| A "cancel" action | built | `requestCancellation` on bookings; event cancellation refunds tickets in full |
| VAT-inclusive prices for consumers | built | `commerce.vat.consumer_fees_inclusive = true`; admin and booking fees labelled "incl. VAT" |
| Admin fee refunded on a valid cancellation | built | provider, organiser or platform cancellation refunds the admin fee (`feeBack` / `dec107FeeRefund`), proven in the sandbox (fr 3,150 incl. admin fee) |
| IP assignment click-to-sign | not applicable | no IP assignment flow in Gala Dock |

## E. Business users (P2B)

UK P2B rules require 15 days' notice to business users of term changes. Set the A1/A2 effective date to **publication + 15 days** and email existing organisers and providers at publication. No in-app notice mechanism exists yet: send by email (Resend) plus an in-app notification.

## F. Director sign-off list

1. A1 Payment Terms text (incl. 90-day hold limit, 58-day funding lead and early release at the hold limit, reserves, payout-pause grounds).
2. A2 Disputes Policy text, and the publish date that becomes `dispute_rules_in_force_from`.
3. A3 Accessibility Statement.
4. B1–B6 corrections to the published texts.
5. D1 trader-status build (blocker), D3/D4 applicability.
6. The owner decisions in `docs/backend/payments/dec107-gala-dock.md` §8.

## G. Deferred legal items (roadmap; never placeholders in the texts)

- **EU GDPR Art. 27 representative** if EU buyers are accepted.
- **EU non-Union OSS registration**: apply by the 10th of the month after the first EU consumer sale of Gala Dock's own products.
- **Independent WCAG 2.2 AA audit.**
- **Resale GB v1 legal text review** (`resale_policies` `needs_review`).
- **Covered-liability ledger** (30-day challenge, recovery steps).
- **Chargeback undertaking** for business clients.
