import type { NextConfig } from "next";

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // No Content-Security-Policy here (R6b): on Vercel a config CSP reached the render request ahead of the proxy's nonce policy, so
  // Next found no nonce and left every framework <script> un-nonced (all blocked once enforced). The nonce policy in src/proxy.ts
  // (src/lib/security/csp.ts) carries frame-ancestors / base-uri / form-action / object-src; X-Frame-Options covers framing meanwhile.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];
// Authentication, onboarding and private API responses must never be stored by shared caches.
const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];
// W09: token links (client portal, guest page, proposal, contract, invoice payment, ticket transfer) — never cached, never indexed,
// and the token never leaves in a Referer header.
const tokenPaths = ["/portal/:path*", "/guest/:path*", "/proposal/:path*", "/contract/:path*", "/pay/:path*", "/tickets/accept/:path*", "/invite/:path*", "/rsvp/:path*",
  // Q29: virtual join / replay routes redirect to provider meeting and replay URLs — the provider must never see our URL as Referer.
  "/tickets/:id/join", "/virtual/:path*"];
const tokenHeaders = [...noStore, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Referrer-Policy", value: "no-referrer" }];
const privatePaths = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/mfa", "/access", "/invite/:path*", "/onboarding/:path*", "/onboarding", "/continue", "/auth/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  // Isolated release verification leaves the shared development server's cache intact.
  distDir: process.env.GALA_PWA_BUILD === "maximum" ? ".next-pwa-maximum" : process.env.GALA_PWA_BUILD === "1" ? ".next-pwa-release" : ".next",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: security },
      // Public event pages may be framed by this origin only (organizer page-editor live preview).
      { source: "/events/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      ...privatePaths.map(source => ({ source, headers: noStore })),
      ...tokenPaths.map(source => ({ source, headers: tokenHeaders })),
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
  // Public website (blueprint §10.6: redirect behaviour for renamed routes). /pricing is now a real page; these are aliases.
  async redirects() {
    return [
      { source: "/about-us", destination: "/about", permanent: true },
      { source: "/customers", destination: "/build-an-event", permanent: true },
      { source: "/build", destination: "/build-an-event", permanent: true },
      { source: "/developer", destination: "/developers", permanent: true },
      // Q75: there is no /venues or /services index page (only /venues/<slug>, /services/<slug>); send them to the public
      // directory (HREF.browseVenues / HREF.browseSuppliers in src/lib/public/site.ts). permanent → 308.
      { source: "/venues", destination: "/discover?tab=venues&results=1", permanent: true },
      { source: "/services", destination: "/discover?tab=services&results=1", permanent: true },
    ];
  },
};

export default nextConfig;
