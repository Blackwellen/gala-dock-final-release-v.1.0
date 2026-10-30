import "server-only";
import { httpStripeClient, type StripeClient } from "@/lib/payments/stripe-client";
import { platformMode, platformSecretKey, publishableKeyFor, type StripeModeState } from "@/lib/payments/stripe-mode";

/** Platform secret key. Never falls back to a live key implicitly. */
export function stripeKey() {
  return platformSecretKey(process.env);
}

/**
 * The platform's Stripe mode, derived from the configured key's prefix (sk_live_/rk_live_ → "live"). Server-only; it never
 * returns or logs the key. This is the single source of truth for every mode decision (webhooks, connected accounts, customer
 * ids, dashboard filters, and the x-gala-stripe-mode header the admin client sends to the database).
 */
export function stripeMode(): StripeModeState {
  return platformMode(process.env);
}
export const stripeLive = () => stripeMode() === "live";

/** The publishable key whose mode matches the platform key (null when none matches). */
export function stripePublishableKey() {
  return publishableKeyFor(stripeMode(), process.env);
}

/** The process-wide Stripe client (null when Stripe is not configured). Tests construct their own fake instead. */
export function stripeClient(): StripeClient | null {
  const key = stripeKey();
  return key ? httpStripeClient(key) : null;
}

/**
 * Minimal Stripe REST call. `stripeAccount` runs the call in a connected account's context (direct charges, refunds and
 * reads of seller-owned objects). New marketplace code should use the adapters in `@/lib/payments/stripe-client` instead.
 */
export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, string>, opts: { idempotencyKey?: string; stripeAccount?: string } = {}) {
  const client = stripeClient();
  if (!client) throw new Error("stripe_not_configured");
  return client.request<T>({ method: params ? "POST" : "GET", path, params, idempotencyKey: opts.idempotencyKey, stripeAccount: opts.stripeAccount });
}

type Account = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; requirements?: { disabled_reason?: string | null } };
export function payoutStatus(account: Account) {
  if (account.payouts_enabled && account.charges_enabled) return "active";
  if (account.requirements?.disabled_reason?.startsWith("rejected")) return "restricted";
  if (account.details_submitted) return "pending";
  return "incomplete";
}
