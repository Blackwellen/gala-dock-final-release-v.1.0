"use client";
import { track } from "@/lib/analytics/client";

/**
 * Blueprint §1.9 analytics vocabulary, sent through the existing consent-aware capture (/api/analytics/capture honours gd_consent,
 * Do Not Track and Global Privacy Control). Each name travels as `feature.used` with props { feature, surface, variant } — the
 * props the analytics_event_definitions row allows — so no new tracker, cookie or event definition is introduced.
 * `variant` is a short slug (never a URL, e-mail or free text; the server strips those anyway).
 */
export type PublicEvent =
  | "public_nav_click" | "hero_primary_cta" | "hero_secondary_cta" | "section_interaction" | "persona_route_select"
  | "build_event_start" | "organizer_start" | "provider_join" | "developer_docs_open" | "pricing_plan_select"
  | "pricing_billing_toggle" | "faq_expand" | "footer_nav_click";

export const slug = (s: string) => s.toLowerCase().replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "home";

export function trackPublic(feature: PublicEvent, surface: string, variant?: string) {
  track({ name: "feature.used", props: { feature, surface: slug(surface), ...(variant ? { variant: slug(variant) } : {}) } });
}

/** Infers the conversion event a destination represents, so CTAs need no extra wiring. */
export function conversionFor(href: string): PublicEvent | null {
  if (href.includes("/onboarding/organizer")) return "organizer_start";
  if (href.includes("/onboarding/provider")) return "provider_join";
  if (href.includes("next=/plan")) return "build_event_start";
  if (href.startsWith("/help/developers") || href.startsWith("/api/v1/openapi")) return "developer_docs_open";
  return null;
}
