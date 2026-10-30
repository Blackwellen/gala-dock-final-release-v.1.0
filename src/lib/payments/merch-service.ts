/**
 * Q40 → Q07 · Merchandise payments. A merch order (Q40 `merch_reserve`) is paid by a Stripe Connect DIRECT charge on the
 * organiser's connected account with Gala Dock's commission as `application_fee_amount`; card refunds go back on the same
 * connected-account charge through `refundMerchantCharge`. Pure module (injected Stripe + data layer) so the specs run it with a
 * fake Stripe and an in-memory store; `merch.ts` binds it to Supabase.
 */
import { connectedMerchantStripe, type StripeClient } from "./stripe-client";
import { assertFeeInvariants, NOT_READY_COPY, sellerReadiness, type RefundReason, type SellerAccount } from "./rules";
import { refundMerchantCharge } from "./service";

export type MerchOrder = { order_ref: string; workspace_id: string; status: string; total_minor: number; currency: string; expires_at: string;
  connected_account_id: string | null; application_fee_minor: number | null; stripe_checkout_session: string | null; event_id: string | null };
export type MerchLine = { name: string; qty: number; unit_minor: number };

export interface MerchPaymentData {
  sellerAccount(workspaceId: string): Promise<SellerAccount | null>;
  /** merch_direct_prepare: binds the order to the seller's account and snapshots the application fee (never recalculated). */
  prepareMerchOrder(ref: string, account: string, merchant: Record<string, unknown>): Promise<MerchOrder>;
  setMerchSession(ref: string, sessionId: string): Promise<void>;
  /** merch_card_refund_claim → null when nothing to do (already done / in flight / exhausted). */
  claimCardRefund(id: string): Promise<{ id: string; order_ref: string; account: string; payment_intent: string; amount_minor: number; reason: RefundReason; idempotency_key: string } | null>;
  cardRefundResult(id: string, stripeRefund: string | null, status: "pending" | "succeeded" | "failed", error?: string | null): Promise<void>;
}
export type MerchDeps = { stripe: StripeClient; data: MerchPaymentData; now?: () => number };
export type MerchCheckoutResult = { ok: true; url: string; sessionId: string; account: string; reused: boolean }
  | { ok: false; code: "seller_not_ready" | "stripe_unavailable" | "invalid_order" | "expired"; message: string };

/** Starts (or reuses) the Checkout Session for a pending merch order, in the organiser's connected-account context. */
export async function createMerchDirectCheckout(deps: MerchDeps, input: {
  order: MerchOrder; lines: MerchLine[]; eventName: string; customerEmail: string; successUrl: string; cancelUrl: string;
}): Promise<MerchCheckoutResult> {
  const now = deps.now?.() ?? Date.now();
  const o = input.order;
  if (o.status !== "pending") return { ok: false, code: "invalid_order", message: "This order can’t be paid." };
  const expiresMs = Date.parse(o.expires_at);
  if (!Number.isFinite(expiresMs) || expiresMs < now + 60_000) return { ok: false, code: "expired", message: "Your reservation has expired — please choose your items again." };
  const lineTotal = input.lines.reduce((a, l) => a + l.unit_minor * l.qty, 0);
  if (!input.lines.length || lineTotal !== o.total_minor || input.lines.some(l => !Number.isSafeInteger(l.unit_minor) || l.unit_minor < 0 || !Number.isInteger(l.qty) || l.qty <= 0))
    return { ok: false, code: "invalid_order", message: "This order can’t be paid." };
  const seller = await deps.data.sellerAccount(o.workspace_id);
  const ready = sellerReadiness(seller);
  if (!ready.ready) return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY[ready.reason] };
  let po: MerchOrder;
  try { po = await deps.data.prepareMerchOrder(o.order_ref, ready.account, { merchant: "seller_connected_account", workspace_id: seller!.workspace_id, name: seller!.name ?? null,
    payment_route: "DIRECT_CONNECTED_ACCOUNT", platform_role: "marketplace_operator_application_fee_only" }); }
  catch (e) {
    const m = (e as Error).message;
    if (/reservation_expired|not_pending/.test(m)) return { ok: false, code: "expired", message: "Your reservation has expired — please choose your items again." };
    return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY.charges_disabled };
  }
  const fee = Number(po.application_fee_minor);
  assertFeeInvariants(po.total_minor, fee);
  const stripe = connectedMerchantStripe(deps.stripe);
  try {
    if (po.stripe_checkout_session) {
      const s = await stripe.retrieveCheckout(ready.account, po.stripe_checkout_session);
      if (s.status === "open" && s.url) return { ok: true, url: s.url, sessionId: s.id, account: ready.account, reused: true };
    }
    const cur = po.currency.toLowerCase();
    // Stripe needs ≥ 30 min; merch_direct_prepare extended the reservation to cover it. A payment that still lands after the
    // reservation expired is refunded in full by the webhook (merch_order_direct_paid → 'hold_expired').
    const p: Record<string, string> = {
      mode: "payment", customer_email: input.customerEmail, client_reference_id: po.order_ref, success_url: input.successUrl, cancel_url: input.cancelUrl,
      expires_at: String(Math.floor(now / 1000) + 1800),
      "metadata[merch_order]": po.order_ref, "payment_intent_data[metadata][merch_order]": po.order_ref, "payment_intent_data[application_fee_amount]": String(fee),
      "payment_intent_data[description]": `${po.order_ref} · ${input.eventName} merchandise`.slice(0, 300),
    };
    input.lines.forEach((l, i) => {
      p[`line_items[${i}][quantity]`] = String(l.qty); p[`line_items[${i}][price_data][currency]`] = cur; p[`line_items[${i}][price_data][unit_amount]`] = String(l.unit_minor);
      p[`line_items[${i}][price_data][product_data][name]`] = `${input.eventName} — ${l.name}`.slice(0, 200);
    });
    const s = await stripe.createCheckout(ready.account, p, `${po.order_ref}:merch:${ready.account}`);
    await deps.data.setMerchSession(po.order_ref, s.id);
    return { ok: true, url: s.url ?? "", sessionId: s.id, account: ready.account, reused: false };
  } catch {
    return { ok: false, code: "stripe_unavailable", message: "Couldn’t reach the payment provider. You haven’t been charged — please try again." };
  }
}

/**
 * Executes one queued card refund (merch_card_refunds) on the organiser's connected account. Idempotent: the Stripe idempotency
 * key is the row's key, the claim refuses rows that are done or in flight, and the ledger posting comes from the
 * `charge.refunded` webhook (cumulative delta), so a retry can never refund or post twice.
 */
export async function executeMerchCardRefund(deps: MerchDeps, id: string) {
  const c = await deps.data.claimCardRefund(id);
  if (!c) return { id, result: "skipped" as const };
  try {
    const { refund, policy } = await refundMerchantCharge({ stripe: deps.stripe, data: null as never }, { account: c.account, paymentIntent: c.payment_intent, amountMinor: c.amount_minor,
      reason: c.reason, idempotencyKey: c.idempotency_key, metadata: { merch_order: c.order_ref, merch_refund: c.id } });
    const status = refund.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(refund.status) ? "failed" : "pending";
    await deps.data.cardRefundResult(c.id, refund.id, status, status === "failed" ? `stripe_refund_${refund.status}` : null);
    return { id, result: status, refund: refund.id, policy };
  } catch (e) {
    await deps.data.cardRefundResult(c.id, null, "failed", (e as Error).message.slice(0, 200));
    return { id, result: "failed" as const, error: (e as Error).message };
  }
}
