# Payments — orchestration, Connect strategy and money states

Master spec §38–43. Code: `src/lib/commerce/orchestrator.ts`, migration `202610180001_payments.sql`, webhook `src/app/api/stripe/webhook/route.ts`.

## One path for marketplace money

Every marketplace charge is a **payment order** (`payment_orders`), created by `create_payment_order()`:

| Kind | Amount source (database only) |
|---|---|
| `deposit` | `build_items.deposit`, else the quote's deposit % (default 30%) of the quoted amount |
| `balance_payment` | quoted amount − everything already paid (net of refunds) |
| `emergency_service` | full accepted emergency quote |
| `standby_fee` | the provider's accepted standby fee |

The client only says *which* booking and *what kind*. Orders are idempotent (one open order per kind/booking/amount), so retrying never creates a second charge. Stripe calls carry Idempotency-Keys (`<ref>:checkout:<hour>`, `transfer:<ref>`, `refund:<cancellation>:<ref>`).

## States (§43) — Stripe is authoritative

`amount_due → payment_pending → protected_pending_delivery → eligible_for_provider_transfer → transfer_created → (payout_pending → paid_out)`, with `partially_refunded`, `refunded`, `disputed`, `failed`, `cancelled`. Enforced by the `payment` state machine.

- **Paid** only when `payment_intent.succeeded` arrives with a matching amount. The return page (`/payments/[ref]`) shows the recorded state and polls; a redirect never marks anything paid. Amount mismatches fail the order and are audited.
- **Release** (`payment_release_scan`, every 5 minutes): delivery evidenced (`fulfilled`/`completed`, or 48h after the event ends while still `confirmed`/`active`) **and** no open booking dispute, chargeback or pending cancellation.
- **Transfer** only to providers with `payout_eligible()` (Stripe payouts enabled, transfers active, nothing past due). Otherwise the money stays protected and the provider sees "complete payout setup".
- **Refunds** from accepted cancellations queue (`booking_cancellations.refund_status = 'due'`) and are executed newest-payment-first; if funds were already transferred, the provider's share is reversed pro rata.

## Ledger (§42)

Immutable, double-entry (`ledger_transactions` / `ledger_entries`). Payment: `cash_stripe +gross`, `platform_fee −commission`, `provider_payable −net`. Transfer: `provider_payable +x`, `cash_stripe −x`. Refunds and dispute funds movements are posted from webhooks, keyed for exactly-once.

## Commission (§41)

`resolve_commission(workspace, category, country, promotion)`: the most specific active `commission_rules` row wins (workspace-negotiated > promotion > category+country > category > plan), else the workspace's admin-managed `commission_bps`. The resolved rule is **snapshotted** onto the payment order and the booking's `terms_snapshot`, so later plan changes never rewrite historic economics.

## Connect strategy (§40) and the assumptions behind it

**Default: separate charges and transfers** (`strategy = 'separate_transfer'`). The platform account creates the charge (Checkout, `transfer_group = <order ref>`), holds funds while delivery is pending, then creates a transfer to the provider's Express account with `source_transaction = <charge>`.

Why: bookings are paid weeks before delivery, and the product promises payment protection until delivery. Destination charges transfer at charge time and would not support that release step; direct charges would make the provider the merchant of record, which doesn't match the marketplace relationship.

Assumptions (to be confirmed with Stripe and counsel before live volume — §40 requires validating current Stripe Connect docs and the agreed legal model):

| Topic | Assumption |
|---|---|
| Merchant of record | Gala Dock (platform account) for marketplace bookings |
| Stripe fees | Borne by the platform; not separately deducted from the provider transfer |
| Refund liability | Platform refunds the customer; any provider share already transferred is reversed |
| Dispute liability | Platform bears the chargeback; Gala Dock may recover from the provider under provider terms (operational dispute flow, §44) |
| Tax | Prices are treated as provider-quoted totals; VAT on the platform commission is accounted for by the platform. Not tax advice. |
| Transfer timing | After release (delivery + 48h safety window), subject to Stripe's settlement of the source charge |
| Platform fee | Commission retained by not transferring it (it is never a separate charge to the provider) |
| Funds holding | Stripe's platform balance; Stripe limits how long funds can be held before transfer — monitor long-lead bookings |

## Language (§39)

Gala Dock does **not** describe itself as escrow. UI copy uses "Paid · protected until delivery", "Provider payout pending", "Released to provider". `PAYMENT_STATE` in the orchestrator is the single wording source.

## Background work

`pg_cron` → `pg_net` → app workers with `CRON_SECRET` (read from Supabase Vault secrets `cron_secret` / `app_url`, never committed):
`marketplace-sweep` (SQL, 5 min), `payments-worker` → `/api/cron/payments` (5 min), `agent-worker` → `/api/agent/worker` (1 min).

## Known gaps

- Ticket orders still use the original checkout path (`/api/checkout/session`), recorded in the ledger by `payment_intent.succeeded`; folding them into payment orders is part of Phase 7.
- Stripe key mode: production currently resolves `STRIPE_CONNECT_SECRET_KEY` (sandbox) for charges. Switch to live keys only after Connect onboarding is validated end to end in live mode.
