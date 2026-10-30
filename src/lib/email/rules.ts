import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure email/communications rules (Q05). No I/O, no `server-only`: tests import it directly.
 */

/** Reserved test domains (RFC 2606 / 6761) can never receive mail: the outbox suppresses them before any provider call. */
const RESERVED = /(^|\.)(test|example|invalid|localhost)$|(^|\.)example\.(com|org|net)$/;
export function isReservedRecipient(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return !domain || RESERVED.test(domain);
}

export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;
export const normaliseEmail = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * Resend webhooks are signed with Svix: `svix-id`, `svix-timestamp`, `svix-signature: v1,<base64 HMAC-SHA256>` over
 * `${id}.${timestamp}.${body}` with the base64 secret after `whsec_`. Timestamps older/newer than 5 minutes are refused (replay).
 */
export function verifySvix(o: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; nowSeconds?: number; toleranceSeconds?: number }) {
  if (!o.secret.startsWith("whsec_") || !o.id || !o.timestamp || !o.signature) return false;
  const ts = Number(o.timestamp), now = o.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (o.toleranceSeconds ?? 300)) return false;
  const expected = createHmac("sha256", Buffer.from(o.secret.slice(6), "base64")).update(`${o.id}.${o.timestamp}.${o.body}`).digest();
  return o.signature.split(" ").some(part => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
export function signSvix(secret: string, id: string, timestamp: number, body: string) {
  return `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

/** Resend event payload → the fields we keep (no message content). */
export function mapResendEvent(id: string, payload: unknown) {
  const p = (payload ?? {}) as { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; message?: string }; reason?: string } };
  const to = Array.isArray(p.data?.to) ? p.data!.to[0] : p.data?.to;
  const bounceType = p.data?.bounce?.type?.toLowerCase();
  // Only hard (permanent) bounces suppress; soft/transient bounces are recorded but the address stays deliverable.
  const type = p.type === "email.bounced" && bounceType && !/perm|hard/.test(bounceType) ? "email.bounced_soft" : String(p.type ?? "unknown");
  return { id, type, email: typeof to === "string" ? normaliseEmail(to) : null, providerId: p.data?.email_id ?? null,
    detail: (p.data?.bounce?.message ?? p.data?.reason ?? "").slice(0, 300) || null };
}

/** Transactional vs marketing (PECR): marketing needs a confirmed double opt-in, transactional honours per-category preferences. */
export const MARKETING_TOPICS = ["newsletter", "product_updates"] as const;
export type MarketingTopic = typeof MARKETING_TOPICS[number];
export const CONSENT_VERSION = "2026-10-28";
export const CONTACT_TOPICS = ["general", "sales", "support", "partnerships", "press", "privacy"] as const;

/**
 * Mailbox integrations contract (Gmail API sync, IMAP sync, SMTP send). Env names only; values are never returned.
 * Status: configured (all required names present) · partial (some present → misconfiguration) · not_configured.
 */
const MAILBOX_ENV = {
  gmail: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  imap: ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD"],
  smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"],
  resend_webhook: ["RESEND_WEBHOOK_SECRET"],
} as const;
export type MailboxKind = keyof typeof MAILBOX_ENV;
export function mailboxStatus(env: Record<string, string | undefined>) {
  const out = {} as Record<MailboxKind, { status: "configured" | "partial" | "not_configured"; missing: string[]; issues: string[] }>;
  for (const [k, names] of Object.entries(MAILBOX_ENV) as [MailboxKind, readonly string[]][]) {
    const missing = names.filter(n => !env[n]);
    const issues: string[] = [];
    const port = env[`${k.toUpperCase()}_PORT`];
    if (port && !/^\d{2,5}$/.test(port)) issues.push(`${k.toUpperCase()}_PORT is not a port number`);
    if (k === "resend_webhook" && env.RESEND_WEBHOOK_SECRET && !env.RESEND_WEBHOOK_SECRET.startsWith("whsec_")) issues.push("RESEND_WEBHOOK_SECRET must start with whsec_");
    out[k] = { status: missing.length === 0 ? (issues.length ? "partial" : "configured") : missing.length === names.length ? "not_configured" : "partial", missing, issues };
  }
  return out;
}
