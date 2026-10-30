import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripe } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { getDirectPaymentStatus } from "@/lib/payments/service";

export const CHECKOUT_COOKIE = (eventId: string) => `gd_co_${eventId.replace(/-/g, "").slice(0, 12)}`;
/** `unit` is the price paid per ticket after any code discount (what Stripe charges); `listUnit` is the tier's face price. */
export type Line = { tier_id: string; name: string; unit: number; qty: number; seats: string[]; listUnit?: number; discountUnit?: number };
export type AppliedCode = { code: string; purpose: "discount" | "access"; kind: "percent" | "amount"; amount: number };
export type Summary = { kind: "primary" | "resale"; lines: Line[]; subtotal: number; fee: number; commission: number; total: number; expiresAt: string | null; currency: string;
  discount?: number; codes?: AppliedCode[] };
type Quote = { kind: "primary" | "resale"; currency: string; expires_at: string | null; subtotal_minor: number; discount_minor: number; fee_minor: number; commission_minor: number; total_minor: number;
  lines: { tier_id: string; name: string; unit_minor: number; discount_minor: number; net_unit_minor: number; qty: number; seats: string[] }[]; codes: AppliedCode[] };
const pounds = (minor: number) => Number(minor) / 100;

/**
 * Prices an order from what the database actually holds for this token (never from client input). The pence quote comes from
 * `checkout_quote` (Q20: lines, code discounts, booking fee, VAT rules, commission) — the same function the order insert is
 * checked against, so the order amount can't drift from it. Always read with the service client (token-gated; the `db`
 * argument is kept for call-site compatibility).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so existing call sites (which pass their own client) stay valid
export async function summarise(eventId: string, token: string, _db?: Db): Promise<Summary> {
  const db = untyped(createAdminClient() as never);
  const { data, error } = await db.rpc("checkout_quote", { p_event: eventId, p_token: token });
  if (error || !data) throw new Error("Could not price this order.");
  const q = data as Quote;
  const lines: Line[] = q.lines.map(l => ({ tier_id: l.tier_id, name: l.name, unit: pounds(l.net_unit_minor), qty: l.qty, seats: l.seats ?? [],
    ...(l.discount_minor > 0 ? { listUnit: pounds(l.unit_minor), discountUnit: pounds(l.discount_minor) } : {}) }));
  return { kind: q.kind, lines, subtotal: pounds(q.subtotal_minor), fee: pounds(q.fee_minor), commission: pounds(q.commission_minor), total: pounds(q.total_minor),
    expiresAt: q.expires_at, currency: q.currency, discount: pounds(q.discount_minor), codes: (q.codes ?? []).map(({ code, purpose, kind, amount }) => ({ code, purpose, kind, amount: Number(amount) })) };
}

/** Issues tickets for a paid (or free) order exactly once. Safe to call from both the redirect and the webhook. */
export async function finalise(orderRef: string) {
  const db = untyped(createAdminClient() as never);
  const { data: o } = await db.from("checkout_orders").select("*").eq("order_ref", orderRef).maybeSingle();
  if (!o) return { ok: false as const, error: "order_not_found" };
  if (o.status === "refunded" || o.refund_status === "refunded") return { ok: false as const, error: "hold_expired_refunded" };
  if (["due", "processing", "failed"].includes(o.refund_status)) return { ok: false as const, error: "hold_expired_refund_pending" };
  if (o.status === "issued") return { ok: true as const, order: o };
  if (o.amount > 0) {
    if (!o.stripe_session) return { ok: false as const, error: "not_paid" };
    if (o.strategy === "direct") {
      // Direct charge (Q07): ask Stripe in the seller's account context; the RPC verifies account + amount and posts the memo ledger once.
      const deps = paymentDeps(db);
      if (!deps) return { ok: false as const, error: "not_paid" };
      const st = await getDirectPaymentStatus(deps, o.connected_account_id, o.stripe_session);
      if (!st.paid || st.reference !== orderRef || !st.paymentIntent) return { ok: false as const, error: "not_paid" };
      const { data: applied, error: pe } = await db.rpc("checkout_order_direct_paid", { p_ref: orderRef, p_pi: st.paymentIntent, p_charge: st.charge ?? "", p_amount_minor: st.amountMinor, p_account: o.connected_account_id, p_application_fee: null });
      if (pe || applied !== "applied") return { ok: false as const, error: "not_paid" };
    } else {
    const s = await stripe<{ payment_status: string; amount_total: number; metadata: Record<string, string> }>(`checkout/sessions/${o.stripe_session}`);
    if (s.payment_status !== "paid" || s.metadata.order_ref !== orderRef || s.amount_total !== Math.round((Number(o.amount) + Number(o.fee)) * 100)) return { ok: false as const, error: "not_paid" };
    await db.from("checkout_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("order_ref", orderRef).eq("status", "pending");
    }
  }
  const { data: prof } = await db.from("profiles").select("full_name").eq("id", o.buyer_id).maybeSingle();
  const { error } = await db.rpc(o.kind === "resale" ? "issue_resale" : "issue_checkout", { p_token: o.token, p_order_ref: orderRef, p_attendee: prof?.full_name ?? "", p_holder: o.buyer_id });
  if (error) {
    // Paid but the hold had lapsed: refund automatically rather than keep money without tickets.
    if (o.amount > 0 && /hold_expired|seat_unavailable|original_payment_required/.test(error.message)) {
      // Durable queue first. A failed or pending Stripe request must never look like a completed refund.
      // The existing worker owns retries and the stable per-order idempotency key.
      const queued = await db.from("checkout_orders").update({ refund_status: "due", refund_reason: "hold_expired", updated_at: new Date().toISOString() }).eq("order_ref", orderRef).eq("refund_status", "none");
      if (queued.error) throw new Error("Could not queue the expired reservation refund.");
      return { ok: false as const, error: "hold_expired_refund_pending" };
    }
    await db.from("checkout_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("order_ref", orderRef);
    return { ok: false as const, error: error.message };
  }
  await db.rpc("attribute_referral", { p_order_ref: orderRef }); // promoter credit (no-op without a valid referral)
  // A claimed waitlist offer becomes "purchased" once its order is issued (§52).
  await db.from("ticket_waitlist").update({ status: "purchased" }).eq("event_id", o.event_id).eq("user_id", o.buyer_id).eq("status", "converted");
  return { ok: true as const, order: { ...o, status: "issued" } };
}
