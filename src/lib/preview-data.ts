// Deterministic fixtures for design QA at /preview/... (disabled in production).
// Preview pages never write data: every submit/upload/agent call shows a "preview only" message.
import type { AuthProps } from "@/components/auth";
import type { Flow, OnboardingProps } from "@/components/onboarding";
import type { AuthScreen } from "./routes";
import type { Values } from "./onboarding-schema";

export const previewsEnabled = () => process.env.NODE_ENV !== "production" || process.env.GALA_ENABLE_PREVIEWS === "1";

const checkout = { kind: "checkout", title: "Returning to checkout", detail: "Complete your Neon Nights Festival tickets", href: "/checkout?event=neon-nights" };

export function previewAuthProps(screen: AuthScreen, search: Record<string, string | string[] | undefined>): AuthProps {
  const state = typeof search.state === "string" ? search.state : undefined;
  const base: AuthProps = { screen, preview: true, next: "/checkout?event=neon-nights", intent: checkout, providers: ["google", "azure"], signedInEmail: null };
  switch (screen) {
    case "verify-email": return { ...base, state: state ?? "waiting", email: "you@company.com", maskedEmail: "you@company.com" };
    case "reset-password": return { ...base, intent: null, state: state ?? "valid" };
    case "mfa": return { ...base, state: "challenge", factors: [{ id: "preview", name: "Authenticator app" }] };
    case "invite": return { ...base, intent: null, next: "/invite/preview", token: "preview", state: state ?? "valid", invite: {
      workspace_name: "Neon Nights Festival", workspace_kind: "organizer", role: "manager", invited_by_name: "Sarah Chen",
      expires_at: "2025-04-28T12:00:00Z", days_remaining: 6, state: state ?? "valid" } };
    case "access": return { ...base, intent: null, state: state ?? "denied", signedInEmail: "you@company.com", workspaces: [{ id: "a", name: "Thomas Events", kind: "organizer" }, { id: "b", name: "Riverside Events", kind: "provider" }] };
    default: return base;
  }
}

const sample: Record<string, Values> = {
  "customer-1": { full_name: "Jamie Thomas", home_area: "London, UK", currency: "GBP", interests: ["Music & Concerts"], notifications: ["recommendations", "offers", "updates"] },
  "organizer-1": { name: "Thomas Events", legal_name: "Thomas Events Ltd", business_type: "Event Management Company", website: "https://www.thomasevents.co.uk", country: "United Kingdom", timezone: "Europe/London", currency: "GBP" },
  "organizer-2": { event_types: ["Mixed / Custom"], event_access: "Public", ticketing: true, client_work: true, multi_venue: false, capacity: "51–250", procurement: "Both" },
  "organizer-3": { logo: "", brand_color: "#2563EB", support_email: "events@thomasevents.co.uk", invoice_prefix: "INV", tax_setting: "UK VAT 20% (standard rate)", payment_terms: "14 days" },
  "organizer-4": { members: [{ email: "sophie@thomasevents.co.uk", role: "manager" }, { email: "marcus@thomasevents.co.uk", role: "finance" }, { email: "priya@thomasevents.co.uk", role: "member" }], notifications: ["enquiries", "payments", "team"], first_event_template: "Wedding" },
  "provider-1": { name: "Riverside Events", legal_name: "Riverside Events Ltd", country: "United Kingdom", timezone: "Europe/London", currency: "GBP", location: "London, UK", coverage: "Within 50 miles", capabilities: ["venue"], service_categories: [] },
  "provider-2": { kind: "venue", listing_name: "Riverside Events Venue", venue_type: "Event hall", description: "Stunning riverside event space with panoramic views, ideal for weddings, corporate events and private parties.", location: "London, UK", capacity: "500", min_capacity: "50", address: "Riverside Road, London, SE1 7PB", amenities: ["Outdoor space", "On-site parking", "In-house catering"], event_types: ["Weddings", "Corporate Events", "Private Events"], photos: [] },
  "provider-3": { booking_mode: "Request to Book", response_time: "Within 2 hours", lead_time: "At least 24 hours", cancellation_policy: "Standard – 50% refund up to 14 days before", conditional_holds: true, hold_duration: "48 hours", standby: true, emergency: false, response_notifications: ["email", "push"], payout_currency: "GBP" },
  "provider-4": { documents: {}, members: [{ email: "sophie@riverside-events.co.uk", role: "manager" }] },
};

export function previewOnboardingProps(flow: Flow, step: number): OnboardingProps {
  const user = { name: "Jamie Thomas", initials: "JD", email: "jamie@thomasevents.co.uk" };
  return {
    flow, step, preview: true, user, initial: sample[`${flow}-${step}`] ?? {},
    context: {
      capabilities: flow === "provider" && step === 2 ? ["venue", "service"] : ["venue"], categories: [], country: "United Kingdom", currency: "GBP", bookingMode: "Request to Book",
      payoutStatus: "not_connected", verificationStatus: "unverified", workspaceName: flow === "provider" ? "Riverside Events" : "Thomas Events",
      listing: step >= 2 && flow === "provider" ? { name: "Riverside Events Venue", kind: "venue", location: "London, UK", description: "", detail: "Up to 500 guests", photoUrl: null } : undefined,
      readiness: { eligible: false, missing: ["listing_photo", "verification", "payouts"] }, existing: [], invites: [],
      summary: { name: "Thomas Events", businessType: "Event Management Company", location: "United Kingdom ((GMT+0/+1) London)", currency: "GBP (£)" },
    },
  };
}
