import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isSealed, keyringStatus, open as openField, seal as sealField } from "@/lib/crypto/field-encryption";

/** Google / Microsoft 365 calendar OAuth config. A provider is offered only when its client id + secret are configured;
 *  otherwise the UI falls back to the private ICS subscription link. */
export type Provider = "google" | "microsoft";
export type Tokens = { access_token: string; refresh_token: string; expires_at: number };

const CFG = {
  google: {
    id: () => process.env.GOOGLE_CALENDAR_CLIENT_ID, secret: () => process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    // app.created: only calendars this app creates (our "Gala Dock" calendar); freebusy: busy times, no event details.
    scope: "openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.freebusy",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } as Record<string, string>,
  },
  microsoft: {
    id: () => process.env.MICROSOFT_CALENDAR_CLIENT_ID, secret: () => process.env.MICROSOFT_CALENDAR_CLIENT_SECRET,
    auth: `https://login.microsoftonline.com/${process.env.MICROSOFT_CALENDAR_TENANT || "common"}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${process.env.MICROSOFT_CALENDAR_TENANT || "common"}/oauth2/v2.0/token`,
    scope: "openid email offline_access User.Read Calendars.ReadWrite",
    extra: { prompt: "select_account" } as Record<string, string>,
  },
} as const;

export const isProvider = (p: string): p is Provider => p === "google" || p === "microsoft";
export const providerEnabled = (p: Provider) => !!(CFG[p].id() && CFG[p].secret());
export const enabledProviders = (): Provider[] => (["google", "microsoft"] as const).filter(providerEnabled);

export function siteOrigin(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return env || new URL(req.url).origin;
}
export const redirectUri = (origin: string, p: Provider) => `${origin}/api/calendar/oauth/${p}/callback`;

export function authorizeUrl(p: Provider, origin: string, state: string) {
  const c = CFG[p];
  const q = new URLSearchParams({ client_id: c.id()!, redirect_uri: redirectUri(origin, p), response_type: "code", scope: c.scope, state, ...c.extra });
  return `${c.auth}?${q}`;
}

async function tokenCall(p: Provider, body: Record<string, string>): Promise<Tokens & { id_token?: string }> {
  const c = CFG[p];
  const res = await fetch(c.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.id()!, client_secret: c.secret()!, ...body }), cache: "no-store" });
  const j = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error || `token_${res.status}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token ?? "", expires_at: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000, id_token: j.id_token };
}
export const exchangeCode = (p: Provider, code: string, origin: string) => tokenCall(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, p) });
export const refreshTokens = (p: Provider, t: Tokens) => tokenCall(p, { grant_type: "refresh_token", refresh_token: t.refresh_token });

/** Email claim from the OIDC id_token returned by the token endpoint (already authenticated over TLS from the issuer). */
export function idTokenEmail(idToken?: string): string | null {
  try { const p = JSON.parse(Buffer.from(idToken!.split(".")[1]!, "base64url").toString()) as { email?: string; preferred_username?: string }; return p.email ?? p.preferred_username ?? null; } catch { return null; }
}

// Token encryption at rest. CALENDAR_TOKEN_KEY (32 bytes, base64 or hex) is preferred; otherwise a key derived from the service role key.
function key() {
  const k = process.env.CALENDAR_TOKEN_KEY;
  if (k) { const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64"); if (b.length === 32) return b; }
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!s) throw new Error("no_token_key");
  return createHash("sha256").update(`gala-dock/calendar-tokens/${s}`).digest();
}
export function sealTokens(t: Tokens) {
  // Shared field-encryption key ring when configured (rotatable, context-bound); legacy v1 key otherwise.
  if (keyringStatus().status === "ready") return sealField(JSON.stringify(t), "calendar_tokens");
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(t), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function openTokens(s: string): Tokens {
  if (isSealed(s)) return JSON.parse(openField(s, "calendar_tokens")) as Tokens;
  const [v, iv, tag, data] = s.split("."); if (v !== "v1" || !iv || !tag || !data) throw new Error("bad_token_blob");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url")); d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8")) as Tokens;
}
