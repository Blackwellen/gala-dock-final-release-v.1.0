import type { Metadata } from "next";

/**
 * Public website contract (Designs/Public Pages/public/Gala_Dock_Public_Pages_Blueprint.docx §1.1, §9.1).
 * One place for the seven top-level routes, the header/footer link sets and the conversion destinations, so pages, header,
 * footer, sitemap and specs never drift apart.
 */
export const SITE_PAGES = [
  { href: "/organisers", label: "Organisers", key: "organisers" },
  { href: "/providers", label: "Providers", key: "providers" },
  { href: "/build-an-event", label: "Build an Event", key: "build-an-event" },
  { href: "/developers", label: "Developers", key: "developers" },
  { href: "/about", label: "About Us", key: "about" },
  { href: "/pricing", label: "Pricing", key: "pricing" },
] as const;
export const SITE_ROUTES = ["/", ...SITE_PAGES.map(p => p.href)] as const;

/** Conversion destinations (existing sign-up and onboarding flows). */
export const HREF = {
  signIn: "/login",
  getStarted: "/register",
  startBuilding: "/register?next=/plan",
  startOrganising: "/register?next=/onboarding/organizer?step=1",
  joinProvider: "/register?next=/onboarding/provider?step=1",
  browseVenues: "/discover?tab=venues&results=1",
  browseSuppliers: "/discover?tab=services&results=1",
  events: "/events",
  docs: "/help/developers-api",
  openapi: "/api/v1/openapi.json",
  apiKeys: "/organizer/settings?tab=developers",
  contact: "/help#contact",
  help: "/help",
  paymentProtection: "/help/payment-protection",
  fees: "/terms#fees",
} as const;

/** Footer (blueprint §9.1): compact navigation and trust surface, only routes that exist. */
export const FOOTER_COLUMNS: { title: string; links: [href: string, label: string][] }[] = [
  { title: "Platform", links: [["/organisers", "Organisers"], ["/providers", "Providers"], ["/build-an-event", "Build an Event"], ["/pricing", "Pricing"]] },
  { title: "Discover", links: [["/events", "Events"], [HREF.browseVenues, "Venues"], [HREF.browseSuppliers, "Suppliers"], ["/events/calendar", "Event calendar"]] },
  { title: "Developers", links: [["/developers#interfaces", "API"], ["/developers#mcp", "MCP"], ["/developers#webhooks", "Webhooks"], [HREF.docs, "Documentation"]] },
  { title: "Company", links: [["/about", "About"], [HREF.contact, "Contact"], [HREF.help, "Help Centre"]] },
  { title: "Legal", links: [["/terms", "Terms"], ["/privacy", "Privacy"], ["/cookies", "Cookies"], ["/ticket-terms", "Ticket terms"], ["/accessibility", "Accessibility"]] },
];

/** Per-page metadata: unique title + description, canonical, Open Graph and Twitter (blueprint §1.6). The social image is the
 *  route's generated opengraph-image (file convention), so it is not repeated here. */
export function pageMetadata({ path, title, description, absolute = false }: { path: string; title: string; description: string; absolute?: boolean }): Metadata {
  const full = absolute ? title : `${title} · Gala Dock`;
  return {
    title: { absolute: full },
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, siteName: "Gala Dock", type: "website", locale: "en_GB" },
    twitter: { card: "summary_large_image", title: full, description },
    robots: { index: true, follow: true },
  };
}
