// Stripe TEST-MODE helpers shared by the Q38 demo seed (scripts/seed-q38-demo.mjs) and the Q07 test-mode journey spec
// (tests/payments/stripe-test-mode.spec.ts). Hard rule: test mode only. Every call asserts a test key first; a live key is never
// read (only STRIPE_SECRET_KEY_SANDBOX / STRIPE_PUBLIC_KEY_SANDBOX), and key values are never printed.
import { createHmac } from "node:crypto";
import { createServerClient } from "@supabase/ssr";

const TEST_SECRET = /^(sk|rk)_test_/;
const TEST_PUBLISHABLE = /^pk_test_/;

/** The sandbox secret key, or null. Throws if the configured value is not a test key. */
export function testSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
  if (!key) return null;
  if (!TEST_SECRET.test(key)) throw new Error("refusing: STRIPE_SECRET_KEY_SANDBOX is not a test-mode key");
  return key;
}
export const hasTestKey = () => { try { return !!testSecretKey(); } catch { return false; } };

export class StripeTestError extends Error {
  /** @param {string} message @param {number} status @param {unknown} body */
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

/**
 * One Stripe REST call in test mode.
 * @param {"GET"|"POST"|"DELETE"} method @param {string} path @param {Record<string, string>} [params]
 * @param {{ account?: string, idempotencyKey?: string, publishable?: boolean }} [opts]
 * @returns {Promise<any>}
 */
export async function stripeTest(method, path, params = {}, opts = {}) {
  let key;
  if (opts.publishable) {
    key = process.env.STRIPE_PUBLIC_KEY_SANDBOX ?? "";
    if (!TEST_PUBLISHABLE.test(key)) throw new Error("refusing: STRIPE_PUBLIC_KEY_SANDBOX is not a test-mode key");
  } else {
    key = testSecretKey();
    if (!key) throw new Error("stripe test key not configured");
  }
  const body = new URLSearchParams(opts.publishable ? { key, ...params } : params);
  const qs = method === "GET" && [...body].length ? `?${body}` : "";
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: {
      ...(opts.publishable ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/x-www-form-urlencoded",
      ...(opts.account ? { "Stripe-Account": opts.account } : {}), ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (data && data.livemode === true) throw new Error("refusing: Stripe returned a live-mode object");
  if (!res.ok) throw new StripeTestError(data?.error?.message ?? `stripe_${res.status}`, res.status, data?.error ?? null);
  return data;
}

/** Every connected account on the test platform (paginated). */
export async function listTestAccounts() {
  const out = [];
  let after = "";
  for (let i = 0; i < 50; i++) {
    const page = await stripeTest("GET", "accounts", { limit: "100", ...(after ? { starting_after: after } : {}) });
    out.push(...page.data);
    if (!page.has_more) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

/** Seller can take a direct card charge (same rule as sellerReadiness in src/lib/payments/rules.ts). */
export const accountReady = a => !!a && a.charges_enabled === true && a.capabilities?.card_payments === "active" && !a.requirements?.disabled_reason && !(a.requirements?.past_due ?? []).length;

/**
 * Completes a TEST-MODE Checkout Session server-side, the way Stripe's hosted page does after the buyer enters a card:
 * init the payment page, create a PaymentMethod from a Stripe test token in the same account context, confirm.
 * `token` is a Stripe test token: tok_visa (succeeds), tok_createDispute (charge succeeds, then a dispute opens), …
 * @param {string} sessionId @param {string|null} account @param {string} [token]
 */
export async function payCheckoutSessionTestMode(sessionId, account, token = "tok_visa") {
  if (!/^cs_test_/.test(sessionId)) throw new Error("refusing: not a test-mode Checkout Session");
  const opts = { publishable: true, ...(account ? { account } : {}) };
  const init = await stripeTest("POST", `payment_pages/${sessionId}/init`, { browser_locale: "en-GB", eid: "NA" }, opts);
  const amount = init.line_item_group?.total ?? init.total_summary?.total;
  if (!Number.isInteger(amount)) throw new Error("checkout_amount_unknown");
  const email = init.customer_email ?? "buyer@example.com";
  const pm = await stripeTest("POST", "payment_methods", { type: "card", "card[token]": token, "billing_details[name]": "Test Buyer", "billing_details[email]": email,
    "billing_details[address][country]": "GB", "billing_details[address][postal_code]": "EC1A 1BB" }, account ? { account } : {});
  const done = await stripeTest("POST", `payment_pages/${sessionId}/confirm`, { eid: "NA", payment_method: pm.id, expected_amount: String(amount),
    expected_payment_method_type: "card", init_checksum: init.init_checksum ?? "", ...(init.customer_email ? {} : { email }) }, opts);
  const pi = typeof done.payment_intent === "object" && done.payment_intent ? done.payment_intent : null;
  return { amount, paymentMethod: pm.id, status: done.status, paymentStatus: done.payment_status, paymentIntent: pi?.id ?? done.payment_intent ?? null, paymentIntentStatus: pi?.status ?? null };
}

/** Stripe-Signature header for a payload (same scheme as src/lib/payments/webhook-core.ts). */
export function signPayload(payload, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

/** Local webhook signing secrets (sandbox endpoints only). */
export function sandboxWebhookSecrets() {
  return { platform: process.env.STRIPE_WEBHOOK_SECRET_SANDBOX ?? "", connect: process.env.STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT ?? "" };
}

/**
 * Delivers a Stripe event to the app's webhook route, signed with the sandbox secret for its endpoint.
 * @param {string} base @param {Record<string, any>} event @param {"platform"|"connect"} endpoint
 */
export async function deliverWebhook(base, event, endpoint) {
  const secret = sandboxWebhookSecrets()[endpoint];
  if (!/^whsec_/.test(secret)) throw new Error(`sandbox ${endpoint} webhook secret not configured`);
  if (event.livemode === true) throw new Error("refusing: live-mode event");
  const body = JSON.stringify(event);
  const res = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": signPayload(body, secret), "content-type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/**
 * Replays the REAL test-mode events Stripe recorded for a connected account (or the platform) since `sinceSec`, oldest first.
 * Connected-account events are delivered as the Connect endpoint would (with `account`).
 * @param {string} base @param {{ account?: string, sinceSec: number, types?: string[] }} o
 */
export async function replayTestEvents(base, o) {
  const events = [];
  let after = "";
  for (let i = 0; i < 10; i++) {
    const page = await stripeTest("GET", "events", { limit: "100", "created[gte]": String(o.sinceSec), ...(after ? { starting_after: after } : {}) }, o.account ? { account: o.account } : {});
    events.push(...page.data);
    if (!page.has_more) break;
    after = page.data[page.data.length - 1].id;
  }
  const wanted = events.filter(e => !o.types || o.types.some(t => t.endsWith("*") ? e.type.startsWith(t.slice(0, -1)) : e.type === t)).sort((a, b) => a.created - b.created);
  const results = [];
  for (const e of wanted) {
    const ev = o.account ? { ...e, account: o.account } : e;
    results.push({ id: e.id, type: e.type, ...(await deliverWebhook(base, ev, o.account ? "connect" : "platform")) });
  }
  return results;
}

/**
 * Supabase SSR auth cookies for a password sign-in (the same cookies the browser holds), for API calls to the dev server.
 * @param {string} email @param {string} password @returns {Promise<{ cookie: string, userId: string, accessToken: string }>}
 */
export async function sessionCookies(email, password) {
  const jar = new Map();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => { for (const c of values) jar.set(c.name, c.value); } },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message ?? "no session"}`);
  return { cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; "), userId: data.user.id, accessToken: data.session.access_token };
}

/**
 * Buys tickets through the app exactly as the checkout page does: hold (hold_tickets RPC as the buyer, under a checkout-token
 * cookie) → POST /api/checkout/session (DB-priced direct charge on the seller account) → pay the test Checkout Session →
 * GET /api/checkout/complete (server verifies with Stripe in the seller context and issues tickets).
 * @param {{ base: string, cookie: string, userClient: any, eventId: string, items: { tier: string, qty: number }[], token?: string, card?: string }} o
 */
export async function buyTicketsTestMode(o) {
  const token = (await import("node:crypto")).randomBytes(24).toString("base64url");
  const held = await o.userClient.rpc("hold_tickets", { p_event: o.eventId, p_items: o.items, p_token: token });
  if (held.error) throw new Error(`hold_tickets: ${held.error.message}`);
  const cookie = `${o.cookie}; gd_co_${o.eventId.replace(/-/g, "").slice(0, 12)}=${token}`;
  const res = await fetch(`${o.base}/api/checkout/session`, { method: "POST", headers: { cookie, origin: o.base, "content-type": "application/json" }, body: JSON.stringify({ event: o.eventId }), signal: AbortSignal.timeout(90_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) return { ok: false, status: res.status, error: body.error ?? "checkout_failed", sellerNotReady: !!body.sellerNotReady };
  const sessionId = /\/(cs_test_[A-Za-z0-9]+)/.exec(String(body.url))?.[1] ?? /(cs_test_[A-Za-z0-9]+)/.exec(String(body.url))?.[1];
  if (!sessionId) return { ok: false, status: 0, error: "no_test_session_in_url" };
  return { ok: true, sessionId, token, cookie };
}

/** Second half of a ticket purchase: pay the session in the seller context, then hit the success URL like the browser would. */
export async function completeTicketPurchase(base, cookie, sessionId, account, card = "tok_visa") {
  const paid = await payCheckoutSessionTestMode(sessionId, account, card);
  const res = await fetch(`${base}/api/checkout/complete?session_id=${sessionId}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
  return { paid, redirect: res.headers.get("location") ?? "" };
}
