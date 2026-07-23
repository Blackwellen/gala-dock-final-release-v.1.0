// Gala Dock — Stripe (REST, no SDK). Server-only. Uses STRIPE_SECRET_KEY. Powers ticket checkout
// (V1.5 15-4). Webhook-driven fulfilment lands when STRIPE_WEBHOOK_SECRET is configured; until then
// fulfilment is confirmed on the success return by retrieving the session.

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface CheckoutParams {
  productName: string;
  unitAmountCents: number;
  currency: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(p: CheckoutParams): Promise<{ id: string; url: string } | null> {
  return createMultiLineCheckoutSession({
    lineItems: [{ name: p.productName, unitAmountCents: p.unitAmountCents, quantity: p.quantity }],
    currency: p.currency,
    successUrl: p.successUrl,
    cancelUrl: p.cancelUrl,
    customerEmail: p.customerEmail,
    metadata: p.metadata,
  });
}

export interface MultiLineCheckoutParams {
  lineItems: Array<{ name: string; unitAmountCents: number; quantity: number }>;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  expiresAtUnix?: number;
  metadata?: Record<string, string>;
}

/** Multi-item Stripe Checkout session — one basket with several ticket tiers/fees as separate lines. */
export async function createMultiLineCheckoutSession(
  p: MultiLineCheckoutParams
): Promise<{ id: string; url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!p.lineItems.length) return null;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", p.successUrl);
  body.set("cancel_url", p.cancelUrl);
  if (p.customerEmail) body.set("customer_email", p.customerEmail);
  if (p.expiresAtUnix) body.set("expires_at", String(p.expiresAtUnix));
  p.lineItems.forEach((li, i) => {
    body.set(`line_items[${i}][quantity]`, String(Math.max(1, li.quantity)));
    body.set(`line_items[${i}][price_data][currency]`, p.currency.toLowerCase());
    body.set(`line_items[${i}][price_data][unit_amount]`, String(Math.max(0, Math.round(li.unitAmountCents))));
    body.set(`line_items[${i}][price_data][product_data][name]`, li.name);
  });
  for (const [k, v] of Object.entries(p.metadata ?? {})) body.set(`metadata[${k}]`, v);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url ? { id: json.id, url: json.url } : null;
}

export async function retrieveSession(
  id: string
): Promise<{ paymentStatus: string; metadata: Record<string, string>; amountTotal: number } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    paymentStatus: json.payment_status ?? "unpaid",
    metadata: json.metadata ?? {},
    amountTotal: json.amount_total ?? 0,
  };
}

// ── Stripe Connect (marketplace payouts to venue/supplier workspaces) ─────────────────────────────
// Gated by the "stripeConnect" feature flag (envSwitch STRIPE_CONNECT_ENABLED) independently of
// stripeConfigured() above — a workspace can have neither, either, or both of billing/payouts live.

export function stripeConnectConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && process.env.STRIPE_CONNECT_ENABLED === "true";
}

/** Create a new Stripe Connect Express account for a venue/supplier workspace. */
export async function createConnectAccount(params: {
  email?: string;
  country?: string;
}): Promise<{ id: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("type", "express");
  body.set("country", params.country ?? "GB");
  if (params.email) body.set("email", params.email);
  body.set("capabilities[card_payments][requested]", "true");
  body.set("capabilities[transfers][requested]", "true");

  const res = await fetch(`${STRIPE_API}/accounts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.id ? { id: json.id } : null;
}

/** Create a hosted onboarding link for a Connect Express account (embed as a "Connect payouts" CTA). */
export async function createConnectAccountLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("account", params.accountId);
  body.set("refresh_url", params.refreshUrl);
  body.set("return_url", params.returnUrl);
  body.set("type", "account_onboarding");

  const res = await fetch(`${STRIPE_API}/account_links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url ? { url: json.url } : null;
}

/** Fetch current onboarding/capability state for a Connect account — poll after the return_url redirect. */
export async function retrieveConnectAccount(accountId: string): Promise<{
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
} | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`${STRIPE_API}/accounts/${encodeURIComponent(accountId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    chargesEnabled: Boolean(json.charges_enabled),
    detailsSubmitted: Boolean(json.details_submitted),
    payoutsEnabled: Boolean(json.payouts_enabled),
  };
}

/**
 * Destination charge: buyer pays the full marketplace_bookings.buyer_total_cents, Stripe routes
 * price_cents - commission straight to the supplier/venue's connected account, and the platform
 * keeps application_fee_amount_cents (commission + buyer admin fee) automatically — no manual
 * transfer/reconciliation step required.
 */
/**
 * Separate charges and transfers: for a multi-vendor cart (one checkout, several suppliers), the
 * buyer pays a single Checkout Session into the platform account, then one Transfer per supplier
 * moves their payout (price minus commission) to their connected account. Used by the "build my
 * event" board checkout instead of createConnectCheckoutSession (which only supports a single
 * destination account per session).
 */
export async function createTransfer(p: {
  amountCents: number;
  currency: string;
  destinationAccountId: string;
  sourceTransactionId?: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("amount", String(p.amountCents));
  body.set("currency", p.currency.toLowerCase());
  body.set("destination", p.destinationAccountId);
  if (p.sourceTransactionId) body.set("source_transaction", p.sourceTransactionId);
  for (const [k, v] of Object.entries(p.metadata ?? {})) body.set(`metadata[${k}]`, v);

  const res = await fetch(`${STRIPE_API}/transfers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.id ? { id: json.id } : null;
}

export async function createConnectCheckoutSession(p: {
  productName: string;
  buyerTotalCents: number;
  applicationFeeCents: number;
  currency: string;
  destinationAccountId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", p.successUrl);
  body.set("cancel_url", p.cancelUrl);
  if (p.customerEmail) body.set("customer_email", p.customerEmail);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", p.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(p.buyerTotalCents));
  body.set("line_items[0][price_data][product_data][name]", p.productName);
  body.set("payment_intent_data[application_fee_amount]", String(p.applicationFeeCents));
  body.set("payment_intent_data[transfer_data][destination]", p.destinationAccountId);
  for (const [k, v] of Object.entries(p.metadata ?? {})) body.set(`metadata[${k}]`, v);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url ? { id: json.id, url: json.url } : null;
}
