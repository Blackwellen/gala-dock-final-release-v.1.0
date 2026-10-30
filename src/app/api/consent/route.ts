import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit, sameOrigin } from "@/lib/security";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, consentCookieOptions, mergeConsent } from "@/lib/consent/cookie";

/**
 * Cookie banner choice (W01). Anonymous visitors: stored only in the first-party `gd_consent` cookie (`analytics:yes|no`,
 * merged with any other recorded choices such as `referral:*`), which `cookieConsent()` reads for Q35 analytics.
 * Signed-in visitors: also appended to consent_records through the existing `record_consent` RPC (purpose `cookies_analytics`).
 * No anonymous SQL function: the database is only written for an authenticated user, under their own session.
 */
const Body = z.object({ analytics: z.boolean() }).strict();
const VERSION = "cookie-banner-2026-10";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "Cross-site request refused." }, { status: 403 });
  if (!(await rateLimit(`consent:${clientIp(request)}`, 30, 3600))) return NextResponse.json({ ok: false, error: "Too many requests — try again later." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid choice." }, { status: 400 });
  const yes = parsed.data.analytics;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let recorded = false;
  if (user) {
    const { error } = await supabase.rpc("record_consent", { p_purpose: "cookies_analytics", p_granted: yes, p_version: VERSION, p_source: "cookie_banner" });
    if (error) return NextResponse.json({ ok: false, error: "Couldn’t save your choice — try again." }, { status: 400 });
    recorded = true;
  }
  const jar = await cookies();
  const value = mergeConsent(jar.get(CONSENT_COOKIE)?.value, "analytics", yes);
  const res = NextResponse.json({ ok: true, analytics: yes, recorded });
  const secure = new URL(request.url).protocol === "https:";
  res.cookies.set(CONSENT_COOKIE, value, consentCookieOptions(secure));
  // Readable marker (no data) so the banner knows a choice exists without exposing gd_consent to scripts.
  res.cookies.set("gd_cc", "1", { httpOnly: false, sameSite: "lax", secure, maxAge: CONSENT_MAX_AGE, path: "/" });
  return res;
}
