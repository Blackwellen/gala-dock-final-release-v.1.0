// Webhook event subscriptions per endpoint — the single list used by scripts/stripe-webhooks.mjs (registration) and
// scripts/stripe/live-preflight.mjs (read-only check that each endpoint's enabled_events is a superset).
// Every type routeEvent() (src/lib/payments/webhook-core.ts) handles must be subscribed on the endpoint that receives it. Direct charges
// (Q07) live on the connected account, so their checkout/payment/refund/dispute events arrive ONLY on the Connect endpoint (2026-10-29:
// the Connect endpoint had account + payout events only, so ticket/merch/invoice payments would never have been confirmed).
export const PAYMENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded", "charge.refund.updated", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"];
export const PLATFORM = [...PAYMENTS, "transfer.created", "transfer.reversed", "application_fee.created", "application_fee.refunded", "application_fee.refund.updated",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed",
  "invoice.paid", "invoice.payment_failed", "invoice.finalized", "invoice.payment_action_required", "invoice.voided", "invoice.marked_uncollectible"];
export const CONNECT = [...PAYMENTS, "account.updated", "account.application.deauthorized", "capability.updated", "account.external_account.created", "account.external_account.updated", "account.external_account.deleted",
  "payout.created", "payout.updated", "payout.paid", "payout.failed", "payout.canceled"];
export const WEBHOOK_URL = "https://www.galadock.com/api/stripe/webhook";
