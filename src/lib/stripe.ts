import "server-only";

/** Minimal Stripe REST client. Never falls back to a live key implicitly. */
export function stripeKey() {
  return process.env.STRIPE_CONNECT_SECRET_KEY || (process.env.NODE_ENV !== "production" ? process.env.STRIPE_SECRET_KEY_SANDBOX : undefined);
}

export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, string>) {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.code ?? "stripe_error");
  return data as T;
}

type Account = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; requirements?: { disabled_reason?: string | null } };
export function payoutStatus(account: Account) {
  if (account.payouts_enabled && account.charges_enabled) return "active";
  if (account.requirements?.disabled_reason?.startsWith("rejected")) return "restricted";
  if (account.details_submitted) return "pending";
  return "incomplete";
}
