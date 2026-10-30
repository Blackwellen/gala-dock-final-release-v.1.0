/**
 * Stripe test/live mode (go-live safety, lane A2). Pure: no `server-only`, no I/O, so unit tests import it directly.
 *
 * The platform's mode is DERIVED from the configured platform secret key's prefix — never configured separately:
 *   sk_live_ / rk_live_ → "live"; sk_test_ / rk_test_ → "test"; anything else (or no key) → "unconfigured".
 * Everything mode-dependent (which webhook secrets are accepted, which connected account / customer id is used, which rows
 * dashboards count) reads this one value, so the key is the single source of truth. Key values are never returned or logged.
 */

export type StripeMode = "live" | "test";
export type StripeModeState = StripeMode | "unconfigured";

const LIVE_SECRET = /^(sk|rk)_live_[A-Za-z0-9]/;
const TEST_SECRET = /^(sk|rk)_test_[A-Za-z0-9]/;

/** Mode of a secret (or restricted) key, from its prefix only. */
export function modeOfSecretKey(key: string | null | undefined): StripeModeState {
  if (!key) return "unconfigured";
  if (LIVE_SECRET.test(key)) return "live";
  if (TEST_SECRET.test(key)) return "test";
  return "unconfigured";
}

/** Mode of a publishable key, from its prefix only. */
export function modeOfPublishableKey(key: string | null | undefined): StripeModeState {
  if (!key) return "unconfigured";
  if (/^pk_live_[A-Za-z0-9]/.test(key)) return "live";
  if (/^pk_test_[A-Za-z0-9]/.test(key)) return "test";
  return "unconfigured";
}

type Env = Record<string, string | undefined>;

/**
 * The platform secret key, exactly as src/lib/stripe.ts resolves it: STRIPE_CONNECT_SECRET_KEY, or (outside production only)
 * STRIPE_SECRET_KEY_SANDBOX. Never falls back to a live key implicitly (STRIPE_SECRET_KEY is never read for the platform).
 */
export function platformSecretKey(env: Env): string | undefined {
  return env.STRIPE_CONNECT_SECRET_KEY || (env.NODE_ENV !== "production" ? env.STRIPE_SECRET_KEY_SANDBOX : undefined);
}

export const platformMode = (env: Env): StripeModeState => modeOfSecretKey(platformSecretKey(env));

/**
 * The publishable key matching the platform mode. Live → STRIPE_PUBLIC_KEY; test → STRIPE_PUBLIC_KEY_SANDBOX, or
 * STRIPE_PUBLIC_KEY when that one is itself a test key. A publishable key of the other mode is never returned (a pk_live with an
 * sk_test platform would create objects the browser cannot see, and vice versa).
 */
export function publishableKeyFor(mode: StripeModeState, env: Env): string | null {
  if (mode === "unconfigured") return null;
  const candidates = mode === "live" ? [env.STRIPE_PUBLIC_KEY] : [env.STRIPE_PUBLIC_KEY_SANDBOX, env.STRIPE_PUBLIC_KEY];
  return candidates.find(k => modeOfPublishableKey(k) === mode) ?? null;
}

export type WebhookEndpointKind = "platform" | "connect";
export type ModeSecret = { secret: string; endpoint: WebhookEndpointKind; mode: StripeMode };

/**
 * Every configured webhook signing secret, tagged with the mode of the endpoint it belongs to. Unsuffixed names are the LIVE
 * endpoints (scripts/stripe-webhooks.mjs registers them with the live key); `_SANDBOX` names are the test endpoints.
 */
export function webhookSecrets(env: Env): ModeSecret[] {
  const all: [string | undefined, WebhookEndpointKind, StripeMode][] = [
    [env.STRIPE_WEBHOOK_SECRET, "platform", "live"], [env.STRIPE_WEBHOOK_SECRET_CONNECT, "connect", "live"],
    [env.STRIPE_WEBHOOK_SECRET_SANDBOX, "platform", "test"], [env.STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT, "connect", "test"],
  ];
  return all.filter(([s]) => !!s).map(([secret, endpoint, mode]) => ({ secret: secret!, endpoint, mode }));
}

/** Webhook endpoint ids the code expects per mode (env names only; used by the preflight). */
export const WEBHOOK_ENDPOINT_ENV: Record<StripeMode, Record<WebhookEndpointKind, { id: string; secret: string }>> = {
  live: { platform: { id: "STRIPE_WEBHOOK_ENDPOINT_ID", secret: "STRIPE_WEBHOOK_SECRET" }, connect: { id: "STRIPE_WEBHOOK_ENDPOINT_ID_CONNECT", secret: "STRIPE_WEBHOOK_SECRET_CONNECT" } },
  test: { platform: { id: "STRIPE_WEBHOOK_ENDPOINT_ID_SANDBOX", secret: "STRIPE_WEBHOOK_SECRET_SANDBOX" }, connect: { id: "STRIPE_WEBHOOK_ENDPOINT_ID_SANDBOX_CONNECT", secret: "STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT" } },
};

export type ModeDecision = { accept: true } | { accept: false; reason: "platform_unconfigured" | "secret_mode_mismatch" | "event_mode_mismatch" };

/**
 * A signed delivery is processed only when the platform is configured, the secret that verified it belongs to an endpoint of the
 * platform's mode, and the event's own `livemode` equals that mode. Anything else is acknowledged (200) and ignored, so a test
 * event can never touch live state (or the reverse) and Stripe does not retry it forever.
 */
export function webhookModeDecision(platform: StripeModeState, secretMode: StripeMode, eventLivemode: unknown): ModeDecision {
  if (platform === "unconfigured") return { accept: false, reason: "platform_unconfigured" };
  if (secretMode !== platform) return { accept: false, reason: "secret_mode_mismatch" };
  if ((eventLivemode === true) !== (platform === "live")) return { accept: false, reason: "event_mode_mismatch" };
  return { accept: true };
}

/** Stripe object id for the current mode from a per-mode pair (test column is the historic one). */
export function idForMode<T extends string | null | undefined>(mode: StripeModeState, ids: { test: T; live: T }): T | null {
  return mode === "live" ? ids.live ?? null : mode === "test" ? ids.test ?? null : null;
}

/** The column holding a per-mode id. `base` is the historic (test) column name, e.g. stripe_account_id → stripe_account_id_live. */
export const columnForMode = (mode: StripeMode, base: string) => (mode === "live" ? `${base}_live` : base);

/** PostgREST request header that tells the database which mode a service-role request runs in (see public.stripe_livemode()). */
export const DB_MODE_HEADER = "x-gala-stripe-mode";

/**
 * A stored connected-account id that the current key cannot see: the account was created under another platform/sandbox
 * (Stripe answers 403 `account_invalid`) or no longer exists (404 `resource_missing`). Such a link is treated as "not set up".
 */
export function isStaleAccountError(e: unknown): boolean {
  const err = e as { code?: string; status?: number } | null;
  return !!err && (err.code === "account_invalid" || err.code === "resource_missing") && (err.status === 403 || err.status === 404);
}
