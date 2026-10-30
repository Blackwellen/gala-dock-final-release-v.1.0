# Payments ledger (Q07): accounting memo, not custody

The ledger (`ledger_transactions` / `ledger_entries`, immutable, balanced, idempotent by key) records Gala Dock economics. Marketplace and ticket money is charged as Stripe Connect **direct charges** on the seller's connected account; it never enters a Gala Dock balance. Entries are an accounting/analytics memo of seller-owned funds plus Gala Dock's fee revenue. They are not client-money accounts, and no internal balance can be withdrawn, spent or transferred.

## Reading a transaction

`ledger_transactions.basis`: `direct_charge_memo` (Q07 onward), `platform_own_sale`, or NULL = posted before Q07 (legacy platform-collection model: `cash_stripe` gross, `provider_payable` seller share).

## Accounts

| account | party | meaning |
|---|---|---|
| merchant_gmv | seller workspace | analytical gross sales of the seller (never platform revenue or cash) |
| seller_connected_balance | seller workspace | memo of funds settling in the seller's Stripe balance (not a Gala Dock liability) |
| seller_application_fees | seller workspace | application fee the seller's charge paid to Gala Dock |
| seller_refunds / seller_disputes / seller_payouts | seller workspace | memo movements on the connected account |
| cash_stripe | platform | Gala Dock's own Stripe balance: application fees and own sales only |
| platform_fee / platform_revenue / tax_payable | platform | fee revenue, own-sale revenue, VAT on fees |
| provider_payable, customer_payment, refunds, disputes, payouts | — | legacy only (pre-Q07) |

## Postings (`src/lib/payments/rules.ts` = SQL `direct_charge_lines` etc.)

- **Direct charge** (gross G, fee F, VAT V on fee): merchant_gmv −G · seller_connected_balance +(G−F) · seller_application_fees +F · cash_stripe +F · platform_fee −(F−V) · tax_payable −V. Key `stripe:pi:<pi>`.
- **Refund delta R** on the seller charge (`charge.refunded`, connected): seller_refunds +R · seller_connected_balance −R. Key `stripe:direct-refund:<charge>:<cumulative>`.
- **Application-fee refund D** (`application_fee.refunded`): platform_fee +(D−v) · tax_payable +v · cash_stripe −D · seller_application_fees −D · seller_connected_balance +D. Key `stripe:fee-refund:<fee>:<cumulative>`.
- **Connected dispute A:** withdrawn → seller_disputes +A · seller_connected_balance −A; reinstated reverses. The seller is merchant and liable. Key `stripe:dispute:<acct>:<dp>:withdrawn|reinstated`.
- **Connected payout P** (`payout.paid`): seller_payouts +P · seller_connected_balance −P; `payout.failed` after paid posts the reverse. Informational only.
- **Own sale** (boost/subscription/AI credits): cash_stripe +G · platform_revenue −(G−V) · tax_payable −V.

## Invariants (`tests/payments/direct-charges.spec.ts`)

Every posting sums to 0; a direct charge changes platform cash by exactly the application fee; refunds, disputes and payouts never change platform cash; 0 ≤ fee ≤ gross; fee snapshots (`payment_orders.commission`, `checkout_orders.fee_rule_snapshot`) are never recalculated; `funds_custodied_by_platform` is generated from `strategy` and is false for every direct order.

## Legacy data

Pre-Q07 `separate_transfer` orders and platform ticket orders keep their legacy postings. Their refunds use `refundLegacyPlatformOrder` (platform refund + pro-rata transfer reversal). No new transfers are created. Remaining legacy funds held on the platform (12 protected deposits, 7 issued ticket orders) need an owner/legal decision.
