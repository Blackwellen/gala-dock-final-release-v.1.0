import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Gala Dock's own "Sign in with Google" (OAuth 2.0 authorization code + PKCE). Google redirects back to www.galadock.com, so the
 * consent screen shows our domain rather than the Supabase project URL; the ID token Google returns is then exchanged for a Supabase
 * session with signInWithIdToken (Supabase checks the signature, audience and nonce). Needs GOOGLE_OAUTH_CLIENT_ID and
 * GOOGLE_OAUTH_CLIENT_SECRET, and the Google provider enabled in Supabase with the same client ID (scripts/auth-config.mjs).
 */
export const GOOGLE_COOKIE = "gd_google";
export const googleConfigured = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
export const callbackUrl = (origin: string) => `${origin}/api/auth/google/callback`;
const b64url = (b: Buffer) => b.toString("base64url");

export function startGoogle(origin: string) {
  const state = b64url(randomBytes(24)), nonce = b64url(randomBytes(24)), verifier = b64url(randomBytes(48));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: callbackUrl(origin), response_type: "code", scope: "openid email profile",
    state, nonce: createHash("sha256").update(nonce).digest("hex"),          // Supabase compares sha256(raw nonce) with the token's nonce
    code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, nonce, verifier };
}

export async function exchangeGoogleCode(origin: string, code: string, verifier: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: callbackUrl(origin), grant_type: "authorization_code" }) });
  const j = await r.json().catch(() => ({})) as { id_token?: string; error?: string };
  if (!r.ok || !j.id_token) throw new Error(`google_token:${j.error ?? r.status}`);
  return j.id_token;
}
