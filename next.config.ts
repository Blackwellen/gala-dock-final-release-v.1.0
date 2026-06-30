import type { NextConfig } from "next";

// App (organizer) routes moved from the bare root to the /event-manager segment.
// These redirects keep old links / bookmarks working (non-permanent so we can revisit).
const APP_SEGMENTS = [
  "home", "events", "finance", "forms", "inbox", "leads", "library", "proposals",
  "reports", "rfqs", "settings", "suppliers", "tasks", "team", "venues", "venue-management",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.unsplash.com" },
      { protocol: "https", hostname: "pub-*.r2.dev" },
      { protocol: "https", hostname: "*.cloudflare.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    const segmentRedirects = APP_SEGMENTS.flatMap((s) => [
      { source: `/${s}`, destination: `/event-manager/${s}`, permanent: false },
      { source: `/${s}/:path*`, destination: `/event-manager/${s}/:path*`, permanent: false },
    ]);
    return [
      { source: "/event-manager", destination: "/event-manager/home", permanent: false },
      ...segmentRedirects,
    ];
  },
};

export default nextConfig;
