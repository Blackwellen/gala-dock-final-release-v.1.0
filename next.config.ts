import type { NextConfig } from "next";

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.supabase.co https://connect.stripe.com; object-src 'none'" },
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
      { source: "/events/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://*.supabase.co https://connect.stripe.com; object-src 'none'" }] },
      ...privatePaths.map(source => ({ source, headers: noStore })),
      ...tokenPaths.map(source => ({ source, headers: tokenHeaders })),
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
