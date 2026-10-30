// Q45 H-01 / H-02: Permissions-Policy and the nonce-based Content-Security-Policy, built per request by src/proxy.ts.
// Pattern: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md — the proxy puts the policy on the *request*
// (Next reads the nonce from `content-security-policy` or `content-security-policy-report-only` and applies it to its own
// framework scripts) and on the response; the root layout reads `x-nonce` for our one inline script (display-scale fit).
//
// Modes (env, read per request):
//   CSP_ENFORCE=1        → Content-Security-Policy (enforced). Only after a clean Report-Only run (coordinator close-out).
//   CSP_REPORT_ONLY=0    → no nonce policy at all (escape hatch).
//   otherwise (default)  → Content-Security-Policy-Report-Only: nothing is blocked, violations go to /api/csp-report.
//
// style-src keeps 'unsafe-inline' and carries no nonce: React `style={…}` attributes are used throughout the app (layer editors,
// charts, layouts) and a nonce in style-src would make browsers ignore 'unsafe-inline'. Script injection is the risk CSP
// addresses here; style attributes cannot run script.

export type CspMode = "enforce" | "report-only" | "off";
export const cspMode = (env: Record<string, string | undefined> = process.env): CspMode =>
  env.CSP_ENFORCE === "1" ? "enforce" : env.CSP_REPORT_ONLY === "0" ? "off" : "report-only";
export const cspHeaderName = (mode: Exclude<CspMode, "off">) => mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
export const NONCE_HEADER = "x-nonce";
export const CSP_REPORT_PATH = "/api/csp-report";

/** 128-bit random nonce, base64 (CSP nonce-source grammar). */
export function makeNonce() {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

const STRIPE_JS = "https://js.stripe.com https://*.js.stripe.com";
const SUPABASE = "https://*.supabase.co";
const R2 = "https://*.r2.cloudflarestorage.com";
const MAPTILER = "https://api.maptiler.com";
const VIDEO = "https://www.youtube-nocookie.com https://player.vimeo.com";

/**
 * The policy for one response. `framePath` decides frame-ancestors (public event pages may be framed by this origin for the
 * organiser page-editor preview, everything else by nobody) — only emitted when enforced, because browsers ignore
 * frame-ancestors in a report-only policy and warn about it; next.config.ts already enforces it.
 */
export function buildCsp({ nonce, mode, dev, path = "/" }: { nonce: string; mode: Exclude<CspMode, "off">; dev: boolean; path?: string }) {
  const d = [
    "default-src 'self'",
    // 'strict-dynamic': Next's nonced bundles may load chunks and the scripts they create (Stripe.js, Turnstile); host entries are the
    // CSP2 fallback. 'unsafe-eval' only in development (React dev error stacks), per the Next guide.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${STRIPE_JS} https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Uploads are served same-origin (/api/media/asset) or as presigned R2 / Supabase storage URLs; map tiles via /api/maps/tile
    // (MapTiler, OSM fallback redirect); Stripe card brand images; Google profile avatars from Google sign-in.
    `img-src 'self' data: blob: ${SUPABASE} ${R2} ${MAPTILER} https://tile.openstreetmap.org https://*.stripe.com https://*.googleusercontent.com`,
    `media-src 'self' blob: data: ${SUPABASE} ${R2}`,
    // Same-origin covers the analytics route (/api/analytics) and the dev HMR socket; Supabase REST/auth/realtime; Stripe API;
    // MapTiler / Nominatim geocoding; presigned R2 uploads; Google Fonts CSS + files fetched by the Studio exporter.
    `connect-src 'self' ${SUPABASE} wss://*.supabase.co https://api.stripe.com ${MAPTILER} https://nominatim.openstreetmap.org ${R2} https://fonts.googleapis.com https://fonts.gstatic.com`,
    // Video embeds (owner decision 2026-10-29): privacy-mode hosts only — youtube-nocookie and player.vimeo.com (dnt=1). Pages load
    // them on click (src/components/public/video-embed.tsx), with an embed URL built from a strictly parsed id, never the raw link.
    `frame-src 'self' ${STRIPE_JS} https://hooks.stripe.com https://connect.stripe.com https://challenges.cloudflare.com https://www.openstreetmap.org ${VIDEO}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${SUPABASE} https://connect.stripe.com https://checkout.stripe.com`,
  ];
  if (mode === "enforce") {
    d.push(`frame-ancestors ${path === "/events" || path.startsWith("/events/") ? "'self'" : "'none'"}`);
    if (!dev) d.push("upgrade-insecure-requests");
  }
  d.push(`report-uri ${CSP_REPORT_PATH}`, "report-to csp");
  return d.join("; ");
}
/** Reporting API endpoint named by `report-to csp` (Chromium uses it; others use report-uri). */
export const REPORTING_ENDPOINTS = `csp="${CSP_REPORT_PATH}"`;

/**
 * H-01. Powerful features this product never uses are off for every origin; camera/geolocation stay same-origin (door scanner,
 * venue search); payment is allowed for Stripe's iframe so Payment Request / wallets work inside js.stripe.com.
 */
export const PERMISSIONS_POLICY = [
  "camera=(self)", "microphone=()", "geolocation=(self)", `payment=(self "https://js.stripe.com")`,
  "usb=()", "serial=()", "hid=()", "midi=()", "display-capture=()", "browsing-topics=()",
].join(", ");
