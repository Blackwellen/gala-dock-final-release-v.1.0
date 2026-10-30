import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { paymentDeps } from "@/lib/payments/server";
import { getDirectPaymentStatus } from "@/lib/payments/service";
import { platformSalesStripe } from "@/lib/payments/stripe-client";

/**
 * Return-path reconciliation for a payment order (§43): when the payer lands back from Stripe Checkout we ask Stripe
 * directly — never trusting the redirect — in the right account context (the seller's connected account for direct charges,
 * the platform for Gala Dock's own sales) and apply success through the same idempotent RPC the webhook uses.
 * A later webhook delivery is a no-op ('already_applied').
 */
export async function reconcilePaymentOrder(reference: string, payerId: string): Promise<"applied" | "already" | "pending" | "skipped"> {
  if (!/^PO-[A-Z0-9]{8}$/.test(reference)) return "skipped";
  const db = untyped(createAdminClient() as never);
  const { data: po } = await db.from("payment_orders").select("reference,status,payer_id,amount_minor,stripe_checkout_session,strategy,payee_connected_account_id").eq("reference", reference).maybeSingle();
  // Only the payer's own return visit triggers a check, and only for orders still waiting on Stripe.
  if (!po || po.payer_id !== payerId || !po.stripe_checkout_session) return "skipped";
  if (!["amount_due", "payment_pending"].includes(po.status)) return "already";
  const deps = paymentDeps();
  if (!deps) return "pending";
  try {
    if (po.strategy === "direct") {
      const s = await getDirectPaymentStatus(deps, po.payee_connected_account_id, po.stripe_checkout_session);
      if (!s.paid || s.reference !== reference || !s.paymentIntent) return "pending";
      const { data, error } = await db.rpc("payment_order_succeeded_direct", { p_ref: reference, p_pi: s.paymentIntent, p_charge: s.charge ?? "", p_amount_minor: s.amountMinor,
        p_livemode: s.livemode, p_account: po.payee_connected_account_id, p_application_fee: null, p_application_fee_minor: s.applicationFeeMinor });
      if (error) return "pending";
      return data === "already_applied" ? "already" : data === "applied" ? "applied" : "pending";
    }
    const s = await platformSalesStripe(deps.stripe).retrieveCheckout(po.stripe_checkout_session, true);
    const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
    const ref = s.client_reference_id ?? s.metadata?.payment_order;
    if (ref !== reference || s.payment_status !== "paid" || !pi || pi.status !== "succeeded") return "pending";
    if (pi.metadata?.payment_order && pi.metadata.payment_order !== reference) return "skipped";
    const { data, error } = await db.rpc("payment_order_succeeded", { p_ref: reference, p_pi: pi.id, p_charge: String(pi.latest_charge ?? ""), p_amount_minor: Number(pi.amount_received ?? 0), p_livemode: !!s.livemode });
    if (error) return "pending";
    return data === "already_applied" ? "already" : "applied";
  } catch { return "pending"; }
}
