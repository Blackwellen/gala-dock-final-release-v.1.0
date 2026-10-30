# Direct-charge reconciliation (Q07, domain 128)

Proves internal payment records agree with Stripe in the connected-account context. Stripe is authoritative.

## Schedule

pg_cron `payments-reconcile` (04:20 UTC daily) enqueues `payments.reconcile` on `job_queue` (dedupe key = date, payload `{days: 3}`). The app worker (`/api/cron/jobs`, handler in `src/lib/foundation/handlers.ts` → `src/lib/payments/reconcile-job.ts`) runs it with retries/dead-letter per the Q03 job foundation. Event-driven checks also happen in the webhook and on the payer's return visit (same idempotent RPCs). Jobs wait in the queue until this code is deployed.

## What is checked (`src/lib/payments/reconcile-core.ts` → `detectVariances`)

For every `payment_orders` / `checkout_orders` / `invoice_card_payments` row updated in the window, the Checkout Session + PaymentIntent are read with `Stripe-Account: <seller>`:

| variance | severity |
|---|---|
| wrong_account_context, missing_seller_connected_account | critical |
| charge_without_booking_update, booking_paid_without_charge | critical |
| amount_mismatch, currency_mismatch | critical |
| missing_application_fee, application_fee_mismatch | critical |
| unexpected_transfer (any platform transfer tied to a direct order) | critical |
| payment_intent_mismatch, refund_mismatch | warning |
| legacy_platform_collection (pre-Q07 marketplace/ticket row) | warning |

Duplicate charges per reference: `duplicateCharges()`.

## Records

`reconciliation_runs` (status running → clean | variances | failed, counts) and immutable `reconciliation_items` (source, account, Stripe object, variance, severity, expected/actual). Read: commerce admins only (RLS).

## Webhook-time guards

`payment_order_succeeded_direct` / `checkout_order_direct_paid` / `invoice_card_payment_succeeded` refuse a charge from a different account (`payment.account_mismatch` audit) and record `payment.application_fee_mismatch`. Webhooks are deduped per account + event id (`webhook_events.stripe_account`, `endpoint`).

## Not yet verified

Live Stripe test-mode run is blocked pending owner approval. Alerting on critical variances (notifications/admin view) is a follow-up.
