/**
 * Direct-charge reconciliation rules (card 128). Compares an internal payment record with what Stripe reports in the
 * connected-account context and returns the variances to record. Pure; the job in reconcile-job.ts does the I/O.
 */

export type InternalPayment = { sourceType: "payment_order" | "checkout_order" | "invoice_card_payment" | "merch_order"; ref: string; strategy: string; status: string;
  account: string | null; sessionId: string | null; paymentIntent: string | null; grossMinor: number; applicationFeeMinor: number | null; currency: string; refundedMinor?: number };
export type StripeView = { found: boolean; account: string | null; paid: boolean; amountMinor: number; currency: string; applicationFeeMinor: number | null;
  paymentIntent: string | null; amountRefundedMinor?: number; transferIds?: string[] } | null;
export type Variance = { variance: string; severity: "critical" | "warning" | "info"; expected?: unknown; actual?: unknown };

const PAID = new Set(["paid", "collected", "issued", "payment_succeeded", "protected_pending_delivery", "partially_refunded", "refunded", "disputed", "succeeded"]);

export function detectVariances(i: InternalPayment, s: StripeView): Variance[] {
  const out: Variance[] = [];
  const internalPaid = PAID.has(i.status);
  if (i.strategy !== "direct") {
    // Only Gala Dock's own sales may be platform charges; any other non-direct marketplace record created after the switch is an anomaly.
    if (i.sourceType !== "payment_order" || !["platform"].includes(i.strategy)) out.push({ variance: "legacy_platform_collection", severity: "warning", expected: "DIRECT_CONNECTED_ACCOUNT", actual: i.strategy });
    return out;
  }
  if (!i.account) out.push({ variance: "missing_seller_connected_account", severity: "critical" });
  if (!s || !s.found) {
    if (internalPaid) out.push({ variance: "booking_paid_without_charge", severity: "critical" });
    return out;
  }
  if (s.account !== i.account) out.push({ variance: "wrong_account_context", severity: "critical", expected: i.account, actual: s.account });
  if (s.paid && !internalPaid) out.push({ variance: "charge_without_booking_update", severity: "critical", actual: s.paymentIntent });
  if (!s.paid && internalPaid) out.push({ variance: "booking_paid_without_charge", severity: "critical" });
  if (s.paid && s.amountMinor !== i.grossMinor) out.push({ variance: "amount_mismatch", severity: "critical", expected: i.grossMinor, actual: s.amountMinor });
  if (s.currency.toUpperCase() !== i.currency.toUpperCase()) out.push({ variance: "currency_mismatch", severity: "critical", expected: i.currency, actual: s.currency });
  if (s.paid && (s.applicationFeeMinor ?? 0) !== (i.applicationFeeMinor ?? 0)) {
    out.push({ variance: s.applicationFeeMinor == null || s.applicationFeeMinor === 0 ? "missing_application_fee" : "application_fee_mismatch", severity: "critical",
      expected: i.applicationFeeMinor, actual: s.applicationFeeMinor });
  }
  if (i.paymentIntent && s.paymentIntent && i.paymentIntent !== s.paymentIntent) out.push({ variance: "payment_intent_mismatch", severity: "warning", expected: i.paymentIntent, actual: s.paymentIntent });
  if (s.amountRefundedMinor !== undefined && i.refundedMinor !== undefined && s.amountRefundedMinor !== i.refundedMinor)
    out.push({ variance: "refund_mismatch", severity: "warning", expected: i.refundedMinor, actual: s.amountRefundedMinor });
  if (s.transferIds?.length) out.push({ variance: "unexpected_transfer", severity: "critical", actual: s.transferIds });
  return out;
}

/** Duplicate charge detection: more than one succeeded payment for the same internal reference. */
export function duplicateCharges(paid: { ref: string; paymentIntent: string }[]) {
  const by = new Map<string, Set<string>>();
  for (const p of paid) by.set(p.ref, (by.get(p.ref) ?? new Set()).add(p.paymentIntent));
  return [...by].filter(([, s]) => s.size > 1).map(([ref, s]) => ({ ref, paymentIntents: [...s] }));
}
