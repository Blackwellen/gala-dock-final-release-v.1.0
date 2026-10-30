/**
 * Stripe client boundary (domain card 124). Every Stripe call in Gala Dock goes through a `StripeClient`, so tests inject a
 * fake and the two adapters below keep marketplace money on the connected-account rail:
 *  - `connectedMerchantStripe`: seller (marketplace, ticket, resale, invoice) charges, refunds and reads. Requires an explicit
 *    `acct_…` and sends it as the `Stripe-Account` header (direct charge). Rejects transfer/destination parameters.
 *  - `platformSalesStripe`: Gala Dock's own sales only (boosts, subscriptions, AI credits). Rejects marketplace purposes.
 * Pure module (no `server-only`), so unit tests can import it.
 */

export type StripeRequest = { method: "GET" | "POST" | "DELETE"; path: string; params?: Record<string, string>; idempotencyKey?: string; stripeAccount?: string };
export interface StripeClient { request<T>(r: StripeRequest): Promise<T> }

export class StripeApiError extends Error {
  constructor(public code: string, public status: number, public requestId: string | null) { super(code); }
}

/** Live HTTP implementation. The key is passed in; it is never read implicitly here. */
export function httpStripeClient(key: string, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): StripeClient {
  return {
    async request<T>(r: StripeRequest): Promise<T> {
      const res = await fetchImpl(`https://api.stripe.com/v1/${r.path}`, {
        method: r.method,
        headers: {
          Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded",
          ...(r.idempotencyKey ? { "Idempotency-Key": r.idempotencyKey } : {}),
          ...(r.stripeAccount ? { "Stripe-Account": r.stripeAccount } : {}),
        },
        body: r.method === "POST" && r.params ? new URLSearchParams(r.params) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new StripeApiError(data?.error?.code ?? data?.error?.type ?? "stripe_error", res.status, res.headers.get("request-id"));
      return data as T;
    },
  };
}

export const ACCOUNT_RE = /^acct_[A-Za-z0-9_]+$/;
/** Parameters that would turn a direct charge into a destination charge or separate charge & transfer (card 123.B.7). */
const FORBIDDEN_PARAM = /(^|\[)(transfer_data|transfer_group|on_behalf_of|destination|source_transaction)(\]|$)/;

export class PaymentRouteError extends Error {}

export function assertDirectChargeParams(params: Record<string, string> = {}) {
  const bad = Object.keys(params).find(k => FORBIDDEN_PARAM.test(k));
  if (bad) throw new PaymentRouteError(`forbidden_param:${bad}`);
}

export type MarketplacePurpose = "deposit" | "balance_payment" | "standby_fee" | "emergency_service" | "ticket_order" | "ticket_resale" | "invoice";
export type PlatformPurpose = "platform_boost" | "subscription" | "ai_credits";
const PLATFORM_PURPOSES = new Set<string>(["platform_boost", "subscription", "ai_credits"]);

export type CheckoutSession = { id: string; url: string | null; status: string; payment_status: string; amount_total: number; currency: string;
  client_reference_id: string | null; metadata?: Record<string, string>; livemode?: boolean;
  payment_intent: null | string | { id: string; status: string; amount_received: number; latest_charge: string | null; application_fee_amount?: number | null; metadata?: Record<string, string> } };
export type Refund = { id: string; status: string; amount: number; currency: string; payment_intent: string; metadata?: Record<string, string> };

export function connectedMerchantStripe(client: StripeClient) {
  const ctx = (account: string) => {
    if (!ACCOUNT_RE.test(account ?? "")) throw new PaymentRouteError("connected_account_required");
    return account;
  };
  return {
    /** Checkout Session in the seller's account context, with Gala Dock's commission as application_fee_amount. */
    createCheckout(account: string, params: Record<string, string>, idempotencyKey: string) {
      assertDirectChargeParams(params);
      if (params.mode !== "payment") throw new PaymentRouteError("payment_mode_required");
      const fee = params["payment_intent_data[application_fee_amount]"];
      if (fee === undefined || !/^\d+$/.test(fee)) throw new PaymentRouteError("application_fee_required");
      return client.request<CheckoutSession>({ method: "POST", path: "checkout/sessions", params, idempotencyKey, stripeAccount: ctx(account) });
    },
    retrieveCheckout(account: string, id: string, expandIntent = false) {
      return client.request<CheckoutSession>({ method: "GET", path: `checkout/sessions/${encodeURIComponent(id)}${expandIntent ? "?expand[]=payment_intent" : ""}`, stripeAccount: ctx(account) });
    },
    expireCheckout(account: string, id: string) {
      return client.request<CheckoutSession>({ method: "POST", path: `checkout/sessions/${encodeURIComponent(id)}/expire`, params: {}, stripeAccount: ctx(account) });
    },
    /** Refund on the original connected-account charge; the application fee is refunded only when the policy says so. */
    refund(account: string, p: { paymentIntent: string; amountMinor?: number; refundApplicationFee: boolean; metadata: Record<string, string> }, idempotencyKey: string) {
      const params: Record<string, string> = { payment_intent: p.paymentIntent, reason: "requested_by_customer", refund_application_fee: String(p.refundApplicationFee) };
      if (p.amountMinor !== undefined) params.amount = String(p.amountMinor);
      for (const [k, v] of Object.entries(p.metadata)) params[`metadata[${k}]`] = v;
      return client.request<Refund>({ method: "POST", path: "refunds", params, idempotencyKey, stripeAccount: ctx(account) });
    },
    retrieve<T>(account: string, path: string) {
      if (/^(transfers|payouts\/[^/]+\/cancel)/.test(path)) throw new PaymentRouteError("forbidden_path");
      return client.request<T>({ method: "GET", path, stripeAccount: ctx(account) });
    },
    /** Saved cards (card 124.C): clone a platform PaymentMethod onto the connected account for one direct charge. */
    clonePaymentMethod(account: string, p: { customer: string; paymentMethod: string }, idempotencyKey: string) {
      return client.request<{ id: string }>({ method: "POST", path: "payment_methods", params: { customer: p.customer, payment_method: p.paymentMethod }, idempotencyKey, stripeAccount: ctx(account) });
    },
  };
}

export function platformSalesStripe(client: StripeClient) {
  return {
    /** Gala Dock's own revenue only. A marketplace purpose here is an architecture violation (card 124.B). */
    createCheckout(purpose: PlatformPurpose, params: Record<string, string>, idempotencyKey: string) {
      if (!PLATFORM_PURPOSES.has(purpose)) throw new PaymentRouteError("marketplace_charge_on_platform");
      assertDirectChargeParams(params);
      if (Object.keys(params).some(k => k.includes("application_fee"))) throw new PaymentRouteError("application_fee_on_platform_sale");
      return client.request<CheckoutSession>({ method: "POST", path: "checkout/sessions", params, idempotencyKey });
    },
    retrieveCheckout(id: string, expandIntent = false) {
      return client.request<CheckoutSession>({ method: "GET", path: `checkout/sessions/${encodeURIComponent(id)}${expandIntent ? "?expand[]=payment_intent" : ""}` });
    },
  };
}

/** Stripe objects used by platform subscription billing (Q28). Only the fields Gala Dock reads. */
export type StripeCustomer = { id: string; livemode?: boolean };
export type StripeSubscription = { id: string; status: string; customer: string; cancel_at_period_end: boolean; livemode?: boolean; metadata?: Record<string, string>;
  current_period_end?: number; items: { data: { id: string; price: { id: string }; current_period_end?: number }[] } };
export type StripeInvoiceItem = { id: string; amount: number; currency: string; livemode?: boolean };

/**
 * Gala Dock's own subscription billing (plans, AI credit packs, overage) on the PLATFORM account (card 124.B: platform sales).
 * Never sends `Stripe-Account`, never carries transfer/destination or application-fee parameters, so it cannot touch seller money.
 */
export function platformBillingStripe(client: StripeClient) {
  const guard = (params: Record<string, string>) => {
    assertDirectChargeParams(params);
    if (Object.keys(params).some(k => k.includes("application_fee"))) throw new PaymentRouteError("application_fee_on_platform_sale");
    return params;
  };
  const sales = platformSalesStripe(client);
  return {
    createCustomer(params: Record<string, string>, idempotencyKey: string) {
      return client.request<StripeCustomer>({ method: "POST", path: "customers", params: guard(params), idempotencyKey });
    },
    /** mode=subscription (plan) or mode=payment (credit pack). */
    createCheckout(purpose: "subscription" | "ai_credits", params: Record<string, string>, idempotencyKey: string) {
      if (purpose === "subscription" && params.mode !== "subscription") throw new PaymentRouteError("subscription_mode_required");
      if (purpose === "ai_credits" && params.mode !== "payment") throw new PaymentRouteError("payment_mode_required");
      return sales.createCheckout(purpose, params, idempotencyKey);
    },
    retrieveSubscription(id: string) {
      if (!/^sub_[A-Za-z0-9_]+$/.test(id)) throw new PaymentRouteError("invalid_subscription");
      return client.request<StripeSubscription>({ method: "GET", path: `subscriptions/${id}` });
    },
    updateSubscription(id: string, params: Record<string, string>, idempotencyKey: string) {
      if (!/^sub_[A-Za-z0-9_]+$/.test(id)) throw new PaymentRouteError("invalid_subscription");
      return client.request<StripeSubscription>({ method: "POST", path: `subscriptions/${id}`, params: guard(params), idempotencyKey });
    },
    /** Gala Dock's own account tax ids (read-only; used to put the VAT number on platform own-sales invoices). */
    listAccountTaxIds() {
      return client.request<{ data: { id: string; type: string; value: string }[] }>({ method: "GET", path: "tax_ids?limit=10" });
    },
    createInvoiceItem(params: Record<string, string>, idempotencyKey: string) {
      if (!/^cus_[A-Za-z0-9]+$/.test(params.customer ?? "")) throw new PaymentRouteError("customer_required");
      return client.request<StripeInvoiceItem>({ method: "POST", path: "invoiceitems", params: guard(params), idempotencyKey });
    },
  };
}
