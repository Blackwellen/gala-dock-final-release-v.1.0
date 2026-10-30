import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Public marketing and marketplace pages are crawlable; signed-in workspaces, tokens, checkout and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/events", "/events/", "/series/", "/p/", "/venues/", "/services/", "/organizers/", "/help", "/terms", "/privacy", "/cookies", "/ticket-terms", "/data-retention"],
      disallow: ["/api/", "/account", "/admin", "/organizer$", "/organizer/", "/provider", "/partner", "/promoter", "/checkout", "/plan", "/discover", "/home", "/messages", "/studio",
        "/invite/", "/portal/", "/proposal/", "/pay/", "/payments/", "/r/", "/tickets/", "/virtual/", "/guest/", "/rsvp/", "/contract/", "/ref/", "/onboarding", "/continue", "/auth/", "/preview/", "/designs", "/*?preview=1"],
    }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
