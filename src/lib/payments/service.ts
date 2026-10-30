/**
 * Marketplace payment orchestration service (card 123.G). The one place that turns a DB-priced order into a Stripe Connect
 * DIRECT charge on the seller's connected account with Gala Dock's commission as `application_fee_amount`.
 *   validate seller account + capabilities → DB-derived amount and fee snapshot → merchant/terms snapshot → idempotent
 *   Checkout Session in the seller's account context → persisted ids.
 * Dependencies are injected (Stripe client + data layer), so tests run it with a fake Stripe and an in-memory store.
 * Pure module: no `server-only`, no Supabase import.
 */
import { connectedMerchantStripe, platformSalesStripe, PaymentRouteError, type CheckoutSession, type PlatformPurpose, type StripeClient } from "./stripe-client";
import { assertFeeInvariants, feePolicyFor, refundApplicationFee, sellerReadiness, NOT_READY_COPY, type FeePolicy, type RefundReason, type SellerAccount } from "./rules";

export type MarketplaceOrder = {
  reference: string; kind: string; status: string; amount_minor: number; customer_fee_minor: number; platform_fee_minor: number;
  application_fee_minor: number | null; currency: string; description: string; payee_workspace_id: string | null;
  stripe_checkout_session: string | null; payee_connected_account_id: string | null; strategy: string; commission?: unknown;
};

export interface PaymentData {
  sellerAccount(workspaceId: string): Promise<SellerAccount | null>;
  /** payment_order_direct_prepare: binds the order to the seller's account, snapshots merchant/terms, fixes the application fee. */
  prepareMarketplaceOrder(ref: string, account: string, merchant: Record<string, unknown>, terms: Record<string, unknown>, group?: string | null): Promise<MarketplaceOrder>;
  markMarketplacePending(ref: string, sessionId: string): Promise<void>;
  /** checkout_order_direct_prepare. */
  prepareTicketOrder(ref: string, seller: string, account: string, feeMinor: number, merchant: Record<string, unknown>, feeRule: Record<string, unknown>): Promise<void>;
  setTicketSession(ref: string, sessionId: string): Promise<void>;
}

export type PaymentDeps = { stripe: StripeClient; data: PaymentData; now?: () => number };
export type CheckoutResult = { ok: true; url: string; sessionId: string; account: string; reused: boolean }
  | { ok: false; code: "seller_not_ready" | "stripe_unavailable" | "invalid_order"; message: string };

const merchantSnapshot = (s: SellerAccount) => ({ merchant: "seller_connected_account", workspace_id: s.workspace_id, name: s.name ?? null, country: s.country ?? null,
  payment_route: "DIRECT_CONNECTED_ACCOUNT", platform_role: "marketplace_operator_application_fee_only" });
const hourBucket = (now: number) => Math.floor(now / 3_600_000);

/** Deposits, balances, standby fees and emergency bookings — each a separate direct charge to the payee (123.2–123.4). */
export async function createDirectMerchantCheckout(deps: PaymentDeps, input: {
  order: MarketplaceOrder; customerEmail: string; successUrl: string; cancelUrl: string; terms?: Record<string, unknown>; group?: string | null;
}): Promise<CheckoutResult> {
  const now = deps.now?.() ?? Date.now();
  const o = input.order;
  if (!o.payee_workspace_id) return { ok: false, code: "invalid_order", message: "This booking has no payee." };
  const seller = await deps.data.sellerAccount(o.payee_workspace_id);
  const ready = sellerReadiness(seller);
  if (!ready.ready) return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY[ready.reason] };
  let po: MarketplaceOrder;
  try { po = await deps.data.prepareMarketplaceOrder(o.reference, ready.account, merchantSnapshot(seller!), input.terms ?? {}, input.group ?? null); }
  catch (e) {
    const m = (e as Error).message;
    if (/seller_not_ready|merchant_changed/.test(m)) return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY.charges_disabled };
    return { ok: false, code: "invalid_order", message: "This booking can’t be paid right now." };
  }
  const gross = po.amount_minor + po.customer_fee_minor, fee = Number(po.application_fee_minor);
  assertFeeInvariants(gross, fee);
  const stripe = connectedMerchantStripe(deps.stripe);
  try {
    if (po.stripe_checkout_session) {
      const s = await stripe.retrieveCheckout(ready.account, po.stripe_checkout_session);
      if (s.status === "open" && s.url) return { ok: true, url: s.url, sessionId: s.id, account: ready.account, reused: true };
    }
    const cur = po.currency.toLowerCase();
    const p: Record<string, string> = {
      mode: "payment", customer_email: input.customerEmail, client_reference_id: po.reference,
      success_url: input.successUrl, cancel_url: input.cancelUrl, expires_at: String(Math.floor(now / 1000) + 3600),
      "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": cur, "line_items[0][price_data][unit_amount]": String(po.amount_minor),
      "line_items[0][price_data][product_data][name]": po.description.slice(0, 200),
      ...(po.customer_fee_minor ? { "line_items[1][quantity]": "1", "line_items[1][price_data][currency]": cur,
        "line_items[1][price_data][unit_amount]": String(po.customer_fee_minor), "line_items[1][price_data][product_data][name]": "Gala Dock booking admin fee (incl. VAT)" } : {}),
      "payment_intent_data[application_fee_amount]": String(fee),
      "metadata[payment_order]": po.reference, "payment_intent_data[metadata][payment_order]": po.reference,
      "payment_intent_data[description]": `${po.reference} · ${po.description}`.slice(0, 300),
      ...(input.group ? { "metadata[order_group]": input.group } : {}),
    };
    const s = await stripe.createCheckout(ready.account, p, `${po.reference}:direct:${ready.account}:${hourBucket(now)}`);
    await deps.data.markMarketplacePending(po.reference, s.id);
    return { ok: true, url: s.url ?? "", sessionId: s.id, account: ready.account, reused: false };
  } catch {
    return { ok: false, code: "stripe_unavailable", message: "Couldn’t reach the payment provider. You haven’t been charged — please try again." };
  }
}

/**
 * Multi-vendor cart (123.C): one direct charge per seller, each with its own application fee. Results are independent —
 * a failure for one seller never undoes another seller's session; the caller shows per-merchant recovery.
 */
export async function createOrderGroupCheckouts(deps: PaymentDeps, group: string, orders: { order: MarketplaceOrder; successUrl: string; cancelUrl: string }[], customerEmail: string) {
  const results: { reference: string; result: CheckoutResult }[] = [];
  for (const o of orders) results.push({ reference: o.order.reference, result: await createDirectMerchantCheckout(deps, { ...o, customerEmail, group }) });
  const ok = results.filter(r => r.result.ok).length;
  return { group, results, state: ok === results.length ? "all_ready" : ok === 0 ? "none_ready" : "partial" as "all_ready" | "none_ready" | "partial" };
}

export type TicketCheckoutInput = {
  orderRef: string; eventId: string; eventName: string; sellerWorkspaceId: string; currency: string; customerEmail: string;
  lines: { name: string; unitMinor: number; qty: number; description?: string }[];
  bookingFeeMinor: number; commissionMinor: number; feeRule: Record<string, unknown>;
  successUrl: string; cancelUrl: string; expiresAtSec: number;
};

/** Ticket sale or official resale: a direct charge on the organiser's (or reseller's) connected account. */
export async function createTicketDirectCheckout(deps: PaymentDeps, t: TicketCheckoutInput): Promise<CheckoutResult> {
  const seller = await deps.data.sellerAccount(t.sellerWorkspaceId);
  const ready = sellerReadiness(seller);
  if (!ready.ready) return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY[ready.reason] };
  const subtotal = t.lines.reduce((a, l) => a + l.unitMinor * l.qty, 0), gross = subtotal + t.bookingFeeMinor;
  const fee = t.bookingFeeMinor + t.commissionMinor;
  if (t.lines.some(l => !Number.isSafeInteger(l.unitMinor) || l.unitMinor < 0 || !Number.isInteger(l.qty) || l.qty <= 0)) return { ok: false, code: "invalid_order", message: "Invalid order." };
  assertFeeInvariants(gross, fee);
  try { await deps.data.prepareTicketOrder(t.orderRef, t.sellerWorkspaceId, ready.account, fee, merchantSnapshot(seller!), t.feeRule); }
  catch { return { ok: false, code: "seller_not_ready", message: NOT_READY_COPY.charges_disabled }; }
  const cur = t.currency.toLowerCase();
  const p: Record<string, string> = {
    mode: "payment", customer_email: t.customerEmail, client_reference_id: t.orderRef, success_url: t.successUrl, cancel_url: t.cancelUrl,
    expires_at: String(t.expiresAtSec), "metadata[order_ref]": t.orderRef, "metadata[event_id]": t.eventId,
    "payment_intent_data[metadata][order_ref]": t.orderRef, "payment_intent_data[application_fee_amount]": String(fee),
  };
  t.lines.forEach((l, i) => {
    p[`line_items[${i}][quantity]`] = String(l.qty); p[`line_items[${i}][price_data][currency]`] = cur; p[`line_items[${i}][price_data][unit_amount]`] = String(l.unitMinor);
    p[`line_items[${i}][price_data][product_data][name]`] = `${t.eventName} — ${l.name}`.slice(0, 200);
    if (l.description) p[`line_items[${i}][price_data][product_data][description]`] = l.description.slice(0, 400);
  });
  if (t.bookingFeeMinor > 0) { const i = t.lines.length; p[`line_items[${i}][quantity]`] = "1"; p[`line_items[${i}][price_data][currency]`] = cur; p[`line_items[${i}][price_data][unit_amount]`] = String(t.bookingFeeMinor); p[`line_items[${i}][price_data][product_data][name]`] = "Gala Dock booking fee (incl. VAT)"; }
  try {
    const s = await connectedMerchantStripe(deps.stripe).createCheckout(ready.account, p, `${t.orderRef}:direct:${ready.account}`);
    await deps.data.setTicketSession(t.orderRef, s.id);
    return { ok: true, url: s.url ?? "", sessionId: s.id, account: ready.account, reused: false };
  } catch { return { ok: false, code: "stripe_unavailable", message: "Couldn’t start the payment. Please try again." }; }
}

export type DirectPaymentStatus = { paid: boolean; sessionId: string; paymentIntent: string | null; charge: string | null; amountMinor: number; applicationFeeMinor: number | null; reference: string | null; livemode: boolean };

/** Asks Stripe (in the seller's account context) whether a session is paid. Browser redirects are never payment authority. */
export async function getDirectPaymentStatus(deps: PaymentDeps, account: string, sessionId: string): Promise<DirectPaymentStatus> {
  const s: CheckoutSession = await connectedMerchantStripe(deps.stripe).retrieveCheckout(account, sessionId, true);
  const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
  return { paid: s.payment_status === "paid" && (!pi || pi.status === "succeeded"), sessionId: s.id, paymentIntent: pi?.id ?? (typeof s.payment_intent === "string" ? s.payment_intent : null),
    charge: pi?.latest_charge ?? null, amountMinor: pi?.amount_received ?? s.amount_total, applicationFeeMinor: pi?.application_fee_amount ?? null,
    reference: s.client_reference_id ?? s.metadata?.payment_order ?? s.metadata?.order_ref ?? null, livemode: !!s.livemode };
}

/** Refund against the original connected-account charge, applying the disclosed application-fee policy (130, 125.D). */
export async function refundMerchantCharge(deps: PaymentDeps, r: { account: string; paymentIntent: string; amountMinor?: number; reason: RefundReason; idempotencyKey: string; metadata?: Record<string, string>;
  /** Go-live (A2): the payment row's livemode and the platform's. When both are given and differ, nothing is sent to Stripe. */
  mode?: { rowLivemode: boolean | null | undefined; platformLive: boolean } }) {
  if (r.mode && (r.mode.rowLivemode === true) !== r.mode.platformLive) throw new PaymentRouteError("wrong_stripe_mode");
  const policy: FeePolicy = feePolicyFor(r.reason);
  if (r.amountMinor !== undefined && (!Number.isSafeInteger(r.amountMinor) || r.amountMinor <= 0)) throw new Error("invalid_refund_amount");
  const refund = await connectedMerchantStripe(deps.stripe).refund(r.account, {
    paymentIntent: r.paymentIntent, amountMinor: r.amountMinor, refundApplicationFee: refundApplicationFee(policy),
    metadata: { ...(r.metadata ?? {}), reason: r.reason, fee_policy: policy },
  }, r.idempotencyKey);
  return { refund, policy };
}

/** Gala Dock's own sales stay platform charges (124.2, 124.6). */
export function createPlatformCheckout(deps: PaymentDeps, purpose: PlatformPurpose, params: Record<string, string>, idempotencyKey: string) {
  return platformSalesStripe(deps.stripe).createCheckout(purpose, params, idempotencyKey);
}
