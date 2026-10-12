import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_COOKIE, exchangeGoogleCode } from "@/lib/google-auth";

/**
 * Google returns here (https://www.galadock.com/api/auth/google/callback). Checks state, exchanges the code (PKCE + client secret),
 * then creates the Supabase session from Google's ID token. Users with two-step verification continue to /mfa via /continue.
 */
export async function GET(request: NextRequest) {
  const fail = (code = "oauth_failed", next = "/continue") => {
    const r = NextResponse.redirect(new URL(`/login?error=${code}&next=${encodeURIComponent(next)}`, request.url));
    r.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
    return r;
  };
  let saved: { s: string; n: string; v: string; next: string; c: string };
  try { saved = JSON.parse(request.cookies.get(GOOGLE_COOKIE)?.value ?? ""); } catch { return fail("link_expired"); }
  const p = request.nextUrl.searchParams, state = p.get("state") ?? "", code = p.get("code");
  if (p.get("error") === "access_denied") return fail("oauth_cancelled", saved.next);
  const a = Buffer.from(state), b = Buffer.from(saved.s ?? "");
  if (!code || a.length !== b.length || !timingSafeEqual(a, b)) return fail("oauth_failed", saved.next);
  try {
    const idToken = await exchangeGoogleCode(request.nextUrl.origin, code, saved.v);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: saved.n, options: saved.c ? { captchaToken: saved.c } : undefined });
    if (error || !data.session) return fail("oauth_failed", saved.next);
    await supabase.rpc("log_auth_event", { p_event: "auth.login_google" });
    const r = NextResponse.redirect(new URL(saved.next.startsWith("/continue") ? saved.next : `/continue?next=${encodeURIComponent(saved.next)}`, request.url));
    r.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
    return r;
  } catch {
    return fail("oauth_failed", saved.next);
  }
}
