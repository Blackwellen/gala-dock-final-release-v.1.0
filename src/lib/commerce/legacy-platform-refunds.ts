import "server-only";
import type { StripeClient } from "@/lib/payments/stripe-client";

/**
 * DATA-COMPATIBILITY ONLY (Q07). Refunds for payment orders collected BEFORE the direct-charge switch
 * (strategy 'separate_transfer'): those charges live on the platform account, so the refund must be issued there, and any
 * provider transfer made from them is reversed pro rata. New orders never reach this path (strategy 'direct').
 * It creates no new transfers. Remove once no legacy order remains refundable (see docs/payments/ledger.md).
 */
export async function refundLegacyPlatformOrder(client: StripeClient,
  po: { reference: string; amount_minor: number; platform_fee_minor: number; stripe_payment_intent: string | null; stripe_transfer: string | null; transferred_minor: number; strategy: string },
  amountMinor: number, cancellationId: string) {
  if (po.strategy === "direct") throw new Error("direct_order_on_legacy_path");
  if (!po.stripe_payment_intent) throw new Error("no_payment_intent");
  await client.request({ method: "POST", path: "refunds", idempotencyKey: `refund:${cancellationId}:${po.reference}`,
    params: { payment_intent: po.stripe_payment_intent, amount: String(amountMinor), reason: "requested_by_customer", "metadata[payment_order]": po.reference, "metadata[cancellation]": cancellationId } });
  if (po.stripe_transfer && po.transferred_minor > 0) {
    const back = Math.min(po.transferred_minor, Math.round(Math.min(amountMinor, po.amount_minor) * (po.amount_minor - po.platform_fee_minor) / po.amount_minor));
    if (back > 0) await client.request({ method: "POST", path: `transfers/${po.stripe_transfer}/reversals`, idempotencyKey: `reversal:${cancellationId}:${po.reference}`,
      params: { amount: String(back), "metadata[cancellation]": cancellationId } });
  }
}
