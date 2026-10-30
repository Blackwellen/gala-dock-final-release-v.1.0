import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * E-signature provider boundary (domain 56.6, Q16). Third-party signing (DocuSign, Dropbox Sign, Adobe Sign …) plugs in
 * behind this interface; React components and server actions never call a provider SDK directly.
 *
 * Status today: no provider is configured → BLOCKED_EXTERNAL. Contracts use the internal method instead: the signer types
 * their full name and email against an exact version; the database stores version, document SHA-256, time and hashed
 * IP / user agent append-only (contract_signatures) and audits it. That is a simple electronic signature, adequate for
 * ordinary event-service contracts; anything needing an advanced/qualified signature waits for a configured provider.
 *
 * Env contract (names only, values are never returned):
 *   SIGNATURE_PROVIDER          docusign | dropbox_sign | adobe_sign   (unset = internal typed-name signatures only)
 *   SIGNATURE_PROVIDER_API_KEY  provider API credential
 *   SIGNATURE_WEBHOOK_SECRET    HMAC secret for provider status callbacks
 */
export const SIGNATURE_PROVIDERS = ["docusign", "dropbox_sign", "adobe_sign"] as const;
export type SignatureProviderName = typeof SIGNATURE_PROVIDERS[number];

export type EnvelopeRequest = { contractId: string; version: number; title: string; body: string; documentHash: string; signers: { partyId: string; name: string; email: string; order: number }[]; returnUrl: string };
export type EnvelopeStatus = { envelopeId: string; state: "sent" | "delivered" | "completed" | "declined" | "voided" | "unknown"; signed: { partyId: string; at: string; ref: string }[] };
export interface SignatureProvider {
  readonly name: SignatureProviderName;
  createEnvelope(req: EnvelopeRequest): Promise<{ envelopeId: string; signingUrls: Record<string, string> }>;
  getStatus(envelopeId: string): Promise<EnvelopeStatus>;
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;
}

export type SignatureHealth = { status: "configured" | "partial" | "not_configured"; state: "ok" | "BLOCKED_EXTERNAL" | "misconfigured"; provider: SignatureProviderName | null; missing: string[]; issues: string[]; fallback: "typed_name" };

/** Validates the env contract without touching the network. */
export function signatureHealth(env: Record<string, string | undefined> = process.env): SignatureHealth {
  const raw = (env.SIGNATURE_PROVIDER ?? "").trim().toLowerCase();
  const provider = (SIGNATURE_PROVIDERS as readonly string[]).includes(raw) ? (raw as SignatureProviderName) : null;
  const issues: string[] = [];
  if (raw && !provider) issues.push(`SIGNATURE_PROVIDER must be one of ${SIGNATURE_PROVIDERS.join(", ")}`);
  const missing = ["SIGNATURE_PROVIDER", "SIGNATURE_PROVIDER_API_KEY", "SIGNATURE_WEBHOOK_SECRET"].filter(n => !env[n]);
  if (env.SIGNATURE_WEBHOOK_SECRET && env.SIGNATURE_WEBHOOK_SECRET.length < 24) issues.push("SIGNATURE_WEBHOOK_SECRET is too short (min 24 characters)");
  const status = missing.length === 3 ? "not_configured" : missing.length || issues.length ? "partial" : "configured";
  return { status, state: status === "configured" ? "ok" : status === "not_configured" ? "BLOCKED_EXTERNAL" : "misconfigured", provider, missing, issues, fallback: "typed_name" };
}

/** Returns the configured adapter, or null when contracts must use the internal typed-name method. No adapter ships yet. */
export function signatureProvider(env: Record<string, string | undefined> = process.env): SignatureProvider | null {
  const h = signatureHealth(env);
  if (h.state !== "ok") return null;
  // Adapters are added per provider once credentials and a sandbox account exist (BLOCKED_EXTERNAL until then).
  return null;
}

/** Constant-time HMAC-SHA256 check for provider callbacks (hex signature). */
export function verifySignatureWebhook(rawBody: string, signature: string | null, secret = process.env.SIGNATURE_WEBHOOK_SECRET): boolean {
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Same hash the database stores (contract_hash): SHA-256 of the UTF-8 body. */
export const documentHash = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
/** Signer IP / user agent are stored hashed or truncated, never raw. */
export const hashIp = (ip: string) => createHash("sha256").update(`gd-contract:${ip}`).digest("hex");
