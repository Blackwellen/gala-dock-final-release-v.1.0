import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, sameOrigin } from "@/lib/security";
import { safeNext } from "@/lib/redirects";
import { GOOGLE_COOKIE, googleConfigured, startGoogle } from "@/lib/google-auth";

/**
 * Starts Gala Dock's own Google sign-in. Called with fetch (POST) from the sign-in screen so the Turnstile token never appears in a URL;
 * returns the Google URL to open. state / nonce / PKCE verifier / bot-check token live in a short-lived, httpOnly cookie.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!googleConfigured()) return NextResponse.json({ error: "Google sign-in isn’t available right now." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`google-start:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { next?: string; captcha?: string };
  const g = startGoogle(request.nextUrl.origin);
  const res = NextResponse.json({ url: g.url }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(GOOGLE_COOKIE, JSON.stringify({ s: g.state, n: g.nonce, v: g.verifier, next: safeNext(body.next), c: String(body.captcha ?? "").slice(0, 4096) }), {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/auth/google", maxAge: 600,
  });
  return res;
}
