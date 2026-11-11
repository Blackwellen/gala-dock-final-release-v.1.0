import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Public marketing and marketplace pages are crawlable; signed-in workspaces, tokens, checkout and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      // "/provider" is anchored ($ and /) so the public /providers page is not caught by the provider-workspace prefix.
      allow: ["/", "/organisers", "/providers", "/build-an-event", "/developers", "/about", "/pricing", "/events", "/events/", "/series/", "/p/", "/venues/", "/services/", "/organizers/", "/help", "/terms", "/privacy", "/cookies", "/ticket-terms", "/data-retention", "/accessibility"],
      disallow: ["/api/", "/account", "/admin", "/organizer$", "/organizer/", "/provider$", "/provider/", "/partner", "/promoter", "/checkout", "/plan", "/discover", "/home", "/messages", "/studio",
        "/invite/", "/portal/", "/proposal/", "/pay/", "/payments/", "/r/", "/tickets/", "/virtual/", "/guest/", "/rsvp/", "/contract/", "/ref/", "/onboarding", "/continue", "/auth/", "/preview/", "/designs", "/*?preview=1"],
    }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
