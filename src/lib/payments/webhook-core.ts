/**
 * Stripe webhook primitives (cards 123.H, 124.4, 258.3): signature verification against the platform and Connect endpoint
 * secrets, account-scoped dedupe keys, and the event-to-handler routing table. Pure (node:crypto only) for unit tests.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type StripeEvent = { id: string; type: string; created?: number; livemode?: boolean; account?: string;
  data: { object: Record<string, unknown> & { id: string; metadata?: Record<string, string> } } };
export type EndpointSecret = { secret: string; endpoint: "platform" | "connect" };

/** v1 HMAC-SHA256 over `${t}.${payload}` with a tolerance window (default 5 minutes). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSec = Date.now() / 1000, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map(p => p.trim());
  const t = Number(parts.find(p => p.startsWith("t="))?.slice(2));
  if (!Number.isFinite(t) || !t || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  return parts.filter(p => p.startsWith("v1=")).some(p => { const got = Buffer.from(p.slice(3)); return got.length === expected.length && timingSafeEqual(got, expected); });
}

/** Which endpoint signed this delivery (platform vs Connect), or null when no secret matches. */
export function matchEndpoint(payload: string, header: string | null, secrets: EndpointSecret[], nowSec?: number) {
  return secrets.find(s => verifyStripeSignature(payload, header, s.secret, nowSec))?.endpoint ?? null;
}

/** Test/fixture helper: builds a valid Stripe-Signature header. */
export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

/**
 * Dedupe by event id + account context (123.H). Platform events keep their bare id, so keys already recorded in
 * webhook_events before Q07 still deduplicate.
 */
export const webhookDedupeKey = (e: Pick<StripeEvent, "id" | "account">) => (e.account ? `${e.account}:${e.id}` : e.id);

/**
 * A Connect-endpoint event must carry its account; a platform-endpoint event must not. Anything else is rejected so a
 * connected-account object can never be processed as if it were a platform charge (and vice versa).
 */
export function contextIsConsistent(e: StripeEvent, endpoint: "platform" | "connect") {
  return endpoint === "connect" ? typeof e.account === "string" && /^acct_[A-Za-z0-9_]+$/.test(e.account) : !e.account;
}

export type Handler = "checkout_completed" | "checkout_expired" | "payment_succeeded" | "payment_failed" | "charge_refunded" | "account_updated"
  | "dispute" | "payout" | "application_fee" | "subscription" | "invoice" | "external_account" | "ignored";

export function routeEvent(e: StripeEvent): Handler {
  const t = e.type;
  if (t === "checkout.session.completed" || t === "checkout.session.async_payment_succeeded") return "checkout_completed";
  if (t === "checkout.session.expired" || t === "checkout.session.async_payment_failed") return "checkout_expired";
  if (t === "payment_intent.succeeded") return "payment_succeeded";
  if (t === "payment_intent.payment_failed") return "payment_failed";
  if (t === "charge.refunded" || t === "charge.refund.updated") return "charge_refunded";
  if (t === "account.updated" || t.startsWith("capability.")) return "account_updated";
  if (t.startsWith("charge.dispute.")) return "dispute";
  // Q33: a seller's payout destination changed — one input to the account-takeover signal (never blocks anything itself).
  if (t.startsWith("account.external_account.")) return e.account ? "external_account" : "ignored";
  if (t.startsWith("payout.")) return e.account ? "payout" : "ignored";   // platform payouts are Gala Dock's own, not mirrored here
  if (t === "application_fee.created" || t === "application_fee.refunded" || t === "application_fee.refund.updated") return "application_fee";
  // Q28 platform subscription billing: Gala Dock's own customers, never a connected account.
  if (t.startsWith("customer.subscription.")) return e.account ? "ignored" : "subscription";
  if (t === "invoice.paid" || t === "invoice.payment_failed" || t === "invoice.finalized" || t === "invoice.payment_action_required" || t === "invoice.voided" || t === "invoice.marked_uncollectible") return e.account ? "ignored" : "invoice";
  return "ignored";
}

/** Order tolerance for state mirrors: apply only if this event is not older than the last one applied. */
export const isNewer = (lastAppliedCreated: number | null | undefined, eventCreated: number | undefined) => !lastAppliedCreated || (eventCreated ?? 0) >= lastAppliedCreated;
