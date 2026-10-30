import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Hashed client IP for abuse limits (never stored raw). */
export function ipHash(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? "gd"}:${ip}`).digest("hex");
}
export const newToken = () => randomBytes(24).toString("base64url");
export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Turnstile is wired but OFF while captcha is disabled for QA (release blockers T1/T2). Enable with CONTACT_TURNSTILE=on once
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY are restored; until then this returns true without a network call.
 */
export async function turnstileOk(token: unknown, request: Request) {
  if (!/^(1|on|true)$/i.test(process.env.CONTACT_TURNSTILE ?? "") || !process.env.TURNSTILE_SECRET_KEY) return true;
  if (typeof token !== "string" || !token) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = await r?.json().catch(() => null) as { success?: boolean } | null;
  return j?.success === true;
}
