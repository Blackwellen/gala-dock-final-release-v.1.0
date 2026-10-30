import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

/** 256-bit single-use token. Only its SHA-256 hash is stored. */
export function createInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenFormat = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** Fixed-window limiter stored in Postgres so it holds across server instances. Fails closed. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  try {
    const { data, error } = await createAdminClient().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** W09: per-IP limit for token-link pages (portal, proposal, contract, pay). Slows token guessing; every bad token gets the same 404. */
export async function tokenPageAllowed(surface: string, requestHeaders: Headers, max = 300) {
  const ip = clientIp(new Request("http://local", { headers: requestHeaders }));
  return rateLimit(`${surface}:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`, max, 3600);
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
