import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { decide, maintenanceState } from "@/lib/maintenance";
import { RETURN_PATH_HEADER, returnPathOf } from "@/lib/redirects";
import { partnerReferral, partnerCookieOptions, PARTNER_COOKIE } from "@/lib/partners/referral";
import { buildCsp, cspHeaderName, cspMode, makeNonce, NONCE_HEADER, PERMISSIONS_POLICY, REPORTING_ENDPOINTS } from "@/lib/security/csp";

// Q34 (domain 215 Tracing): every request carries one correlation id from the edge to route handlers, server actions, audit,
// outbox and jobs. A well-formed inbound id (uptime monitor, Vercel) is kept; anything else is replaced. Echoed on the response.
const CORRELATION = "x-correlation-id";
const correlationOf = (h: Headers) => {
  for (const k of [CORRELATION, "x-request-id", "x-vercel-id"]) { const v = h.get(k)?.trim(); if (v && /^[\w.:-]{6,120}$/.test(v)) return v; }
  return `cor_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
};

export async function proxy(request: NextRequest) {
  const cid = correlationOf(request.headers);
  request.headers.set(CORRELATION, cid);
  // H-02 nonce CSP (src/lib/security/csp.ts): fresh nonce per request, put on the request so Next nonces its own scripts and the
  // root layout can read x-nonce for ours, and on the response. Report-Only unless CSP_ENFORCE=1.
  const mode = cspMode(), nonce = makeNonce();
  const csp = mode === "off" ? null : { name: cspHeaderName(mode), value: buildCsp({ nonce, mode, dev: process.env.NODE_ENV === "development", path: request.nextUrl.pathname }) };
  if (csp) { request.headers.set(NONCE_HEADER, nonce); request.headers.set(csp.name, csp.value); }
  else request.headers.delete(NONCE_HEADER); // never trust an inbound x-nonce
  const res = await route(request);
  try { res.headers.set(CORRELATION, cid); } catch { /* immutable redirect headers: id still reached the handler */ }
  try { hardenHeaders(res.headers); } catch { /* immutable headers */ }
  try { if (csp && !res.headers.has(csp.name)) { res.headers.set(csp.name, csp.value); res.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS); } } catch { /* immutable headers */ }
  return res;
}

// Q45 security sign-off: response headers next.config.ts does not set (added here so the shared dev server hot-reloads instead of
// restarting). Never overrides a value a route already chose. COOP keeps popups we open (Stripe, Google) working.
const EXTRA_HEADERS: [string, string][] = [["Cross-Origin-Opener-Policy", "same-origin-allow-popups"], ["X-Permitted-Cross-Domain-Policies", "none"], ["Origin-Agent-Cluster", "?1"]];
// H-01: the extended Permissions-Policy (usb/serial/hid/midi/display-capture/browsing-topics off; payment for Stripe's iframe).
// next.config.ts sets the original value for every route; this replaces only that value, never a route's own choice.
const BASE_PERMISSIONS = "camera=(self), microphone=(), geolocation=(self), payment=(self)";
function hardenHeaders(h: Headers) {
  for (const [k, v] of EXTRA_HEADERS) if (!h.has(k)) h.set(k, v);
  const pp = h.get("Permissions-Policy");
  if (!pp || pp === BASE_PERMISSIONS) h.set("Permissions-Policy", PERMISSIONS_POLICY);
}

async function route(request: NextRequest) {
  // Maintenance levels (release spec §9): refuse writes / show the maintenance page before any session work.
  const d = decide(await maintenanceState(), request.nextUrl.pathname, request.method);
  if (d.action !== "allow") {
    const headers = { "Cache-Control": "no-store", "Retry-After": "300", "X-Maintenance-Level": `M${d.window.level}` };
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (write || request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: d.window.message || d.window.title, maintenance: { level: d.window.level, module: d.action === "deny" ? d.module : null, status_url: d.window.status_url, reference: d.window.reference } }, { status: 503, headers });
    }
    const url = request.nextUrl.clone(); url.pathname = "/maintenance"; url.search = `?w=${d.window.id}`;
    return NextResponse.rewrite(url, { status: 503, headers });
  }
  // Platform Admin idle timeout (release spec §6): 30 minutes without an admin request ends the admin session on this device.
  const path = request.nextUrl.pathname;
  // W01/W10: server layouts can't see the URL; requireUser() uses this to keep the sign-in return path. Never trusted from the client.
  request.headers.set(RETURN_PATH_HEADER, returnPathOf(request.nextUrl));
  if (path.startsWith("/admin")) {
    if (path.startsWith("/admin/login")) { const res = await updateSession(request); res.cookies.delete(ADMIN_SEEN); return res; }
    const last = Number(request.cookies.get(ADMIN_SEEN)?.value ?? 0);
    if (last && Date.now() - last > ADMIN_IDLE_MS) {
      const res = NextResponse.redirect(new URL("/admin/login?reason=idle", request.url), 303);
      for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
      res.cookies.delete(ADMIN_SEEN);
      return res;
    }
    const res = await updateSession(request);
    res.cookies.set(ADMIN_SEEN, String(Date.now()), { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 8 * 3600 });
    return res;
  }
  // Q27 platform-affiliate links (?ref=<partner code> on landing/sign-up pages): consent first, then a first-party cookie.
  const ref = await partnerReferral(request);
  if (ref && "redirect" in ref) return ref.redirect;
  const res = await updateSession(request);
  if (ref && "cookie" in ref) res.cookies.set(PARTNER_COOKIE, ref.cookie, partnerCookieOptions(request.nextUrl.protocol === "https:"));
  // D4/B2 door scanner for outside staff: never cached, never indexed, no Referer (same policy as token links in next.config).
  if (path.startsWith("/door/")) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Referrer-Policy", "no-referrer");
  }
  return res;
}
const ADMIN_SEEN = "gd_admin_seen", ADMIN_IDLE_MS = 30 * 60_000;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
