import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSb, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Platform-affiliate (partner) attribution, Q27. A partner link is any landing/sign-up URL with ?ref=<partner code>[&c=<channel>].
 * PECR: the attribution cookie (gd_partner) is not strictly necessary, so it is set only once the visitor has said yes (gd_consent
 * "referral:yes", the same choice the promoter /r/<code> flow records). Undecided visitors are asked first on /ref/<code>.
 * The click is counted with a SHA-256 visitor hash (ip | user agent | salt); the raw IP is never stored.
 * Event pages (/events/...) keep ?ref= for promoter codes and are not handled here.
 */
export const PARTNER_COOKIE = "gd_partner";
export const PARTNER_CHANNELS = ["link", "qr", "instagram", "tiktok", "facebook", "x", "linkedin", "whatsapp", "email", "other"] as const;
const CODE = /^[A-Za-z0-9_-]{2,32}$/;
const LANDING = /^\/($|signup(\/|$)|pricing(\/|$)|for-[a-z-]+(\/|$)|features(\/|$)|partners?(\/|$)|organizers?(\/|$)|providers?(\/|$)|venues?(\/|$)|suppliers?(\/|$))/;

export const channelOf = (c: string | null) => ((PARTNER_CHANNELS as readonly string[]).includes(c ?? "") ? c! : c ? "other" : "link");
export const visitorHash = (ip: string, ua: string) => createHash("sha256").update(`${ip}|${ua}|gd-partner`).digest("hex");
export const consentOf = (cookieHeader: string | null) => {
  const raw = decodeURIComponent(cookieHeader?.match(/(?:^|;\s*)gd_consent=([^;]+)/)?.[1] ?? "");
  return /referral:yes/.test(raw) ? "yes" : /referral:no/.test(raw) ? "no" : null;
};
export const ipOf = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";

function anonClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createSb(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Counts the click (rate-limited, de-duplicated per visitor in the database) and returns the canonical code, or null if unknown. */
export async function trackPartnerClick(code: string, channel: string, visitor: string, landing: string): Promise<string | null> {
  try {
    const { data } = await anonClient().rpc("partner_track_click" as never, { p_code: code, p_visitor: visitor, p_channel: channel, p_landing: landing.slice(0, 120) } as never);
    return ((data as { code: string }[] | null)?.[0]?.code) ?? null;
  } catch { return null; }   // attribution must never break the landing page
}

/**
 * Proxy step for GET landing pages with ?ref=. Returns a redirect (ask for consent) or a cookie to set on the normal response,
 * or null when the request is not a partner link.
 */
export async function partnerReferral(request: NextRequest): Promise<{ redirect: NextResponse } | { cookie: string } | null> {
  const url = request.nextUrl, code = url.searchParams.get("ref");
  if (request.method !== "GET" || !code || !CODE.test(code) || !LANDING.test(url.pathname) || request.headers.get("rsc")) return null;
  const consent = consentOf(request.headers.get("cookie"));
  if (consent === "no") return null;
  const channel = channelOf(url.searchParams.get("c"));
  const canonical = await trackPartnerClick(code, channel, visitorHash(ipOf(request), request.headers.get("user-agent") ?? ""), url.pathname);
  if (!canonical) return null;
  if (consent === "yes") return { cookie: `${canonical}:${channel}` };
  const ask = new URL(`/ref/${encodeURIComponent(canonical)}`, url);
  ask.searchParams.set("next", url.pathname);
  ask.searchParams.set("c", channel);
  const r = NextResponse.redirect(ask, 307);
  r.headers.set("Cache-Control", "private, no-store"); r.headers.set("Referrer-Policy", "no-referrer");
  return { redirect: r };
}

export const partnerCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, maxAge: 30 * 86400, path: "/" });

/**
 * After sign-in / email confirmation: attributes a NEW account (created in the last 30 days, once) to the consented partner, then
 * clears the cookie. Fraud checks run in partner_attribute_signup. Never throws.
 */
export async function attributePartnerSignup(sb: SupabaseClient, cookieValue: string | undefined, request: Request): Promise<void> {
  if (!cookieValue) return;
  const [code, channel] = cookieValue.split(":");
  if (!code || !CODE.test(code)) return;
  try {
    await sb.rpc("partner_attribute_signup" as never, { p_code: code, p_channel: channelOf(channel ?? null), p_visitor: visitorHash(ipOf(request), request.headers.get("user-agent") ?? "") } as never);
  } catch { /* attribution never blocks sign-in */ }
}
