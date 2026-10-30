import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Outbound webhook signatures (Q30, domain 191). Header:
 *   Gala-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>[,v1=<hex with the previous secret>]
 * During a secret rotation both the new and the previous secret sign (24 h), so receivers can roll without downtime.
 * Receivers must: recompute over the RAW body, compare in constant time, reject when |now − t| > 300 s (replay window), and
 * dedupe on Gala-Event-Id (stable across retries). Pure: no I/O, safe to import in tests and receivers.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(body: string, secrets: string[], t = Math.floor(Date.now() / 1000)) {
  const v1 = secrets.filter(Boolean).map(s => createHmac("sha256", s).update(`${t}.${body}`).digest("hex"));
  return { t, header: [`t=${t}`, ...v1.map(s => `v1=${s}`)].join(",") };
}

export type VerifyResult = { ok: true; t: number } | { ok: false; reason: "malformed" | "expired" | "mismatch" };

export function verifySignature(header: string | null | undefined, body: string, secret: string, now = Math.floor(Date.now() / 1000), tolerance = SIGNATURE_TOLERANCE_SECONDS): VerifyResult {
  const parts = String(header ?? "").split(",").map(p => p.trim());
  const t = Number(parts.find(p => p.startsWith("t="))?.slice(2));
  const sigs = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3)).filter(s => /^[0-9a-f]{64}$/.test(s));
  if (!Number.isInteger(t) || !sigs.length) return { ok: false, reason: "malformed" };
  if (Math.abs(now - t) > tolerance) return { ok: false, reason: "expired" };
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return sigs.some(s => { const b = Buffer.from(s); return b.length === want.length && timingSafeEqual(b, want); }) ? { ok: true, t } : { ok: false, reason: "mismatch" };
}
