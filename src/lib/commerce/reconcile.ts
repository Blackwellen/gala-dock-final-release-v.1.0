import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripe } from "@/lib/stripe";

type Session = { id: string; payment_status: string; livemode: boolean; client_reference_id: string | null; metadata?: Record<string, string>;
  payment_intent: null | string | { id: string; status: string; amount_received: number; latest_charge: string | null; metadata?: Record<string, string> } };

/**
 * Return-path reconciliation for a payment order (§43): when the payer lands back from Stripe Checkout we ask Stripe
 * directly — never trusting the redirect — and, if the PaymentIntent has succeeded, apply it through the same idempotent
 * payment_order_succeeded RPC the webhook uses. This confirms bookings without waiting for the webhook (and locally, where
 * Stripe can't reach the machine). A later webhook delivery is a no-op ('already_applied').
 */
export async function reconcilePaymentOrder(reference: string, payerId: string): Promise<"applied" | "already" | "pending" | "skipped"> {
  if (!/^PO-[A-Z0-9]{8}$/.test(reference)) return "skipped";
  const db = untyped(createAdminClient() as never);
  const { data: po } = await db.from("payment_orders").select("reference,status,payer_id,amount_minor,stripe_checkout_session").eq("reference", reference).maybeSingle();
  // Only the payer's own return visit triggers a check, and only for orders still waiting on Stripe.
  if (!po || po.payer_id !== payerId || !po.stripe_checkout_session) return "skipped";
  if (!["amount_due", "payment_pending"].includes(po.status)) return "already";
  let s: Session;
  try { s = await stripe<Session>(`checkout/sessions/${encodeURIComponent(po.stripe_checkout_session)}?expand[]=payment_intent`); } catch { return "pending"; }
  const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
  // The session must belong to this order, and Stripe must report the money as captured.
  const ref = s.client_reference_id ?? s.metadata?.payment_order;
  if (ref !== reference || s.payment_status !== "paid" || !pi || pi.status !== "succeeded") return "pending";
  if (pi.metadata?.payment_order && pi.metadata.payment_order !== reference) return "skipped";
  const { data, error } = await db.rpc("payment_order_succeeded", { p_ref: reference, p_pi: pi.id, p_charge: String(pi.latest_charge ?? ""), p_amount_minor: Number(pi.amount_received ?? 0), p_livemode: !!s.livemode });
  if (error) return "pending";
  return data === "already_applied" ? "already" : "applied";
}
