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
const privatePaths = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/mfa", "/access", "/invite/:path*", "/onboarding/:path*", "/onboarding", "/continue", "/auth/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: security },
      // Public event pages may be framed by this origin only (organizer page-editor live preview).
      { source: "/events/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://*.supabase.co https://connect.stripe.com; object-src 'none'" }] },
      ...privatePaths.map(source => ({ source, headers: noStore })),
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
