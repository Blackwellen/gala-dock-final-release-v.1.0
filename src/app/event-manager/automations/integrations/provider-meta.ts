// Shared provider display metadata for the Integrations screen. No external
// brand logo assets are fetched — every provider renders as a coloured
// initials badge, which is honest and avoids hotlinking third-party marks.

export interface ProviderMeta {
  label: string;
  description: string;
  initials: string;
  bg: string;
  text: string;
  category: "accounting" | "payments" | "comms" | "calendar" | "automation" | "custom";
}

export const KNOWN_PROVIDERS: Record<string, ProviderMeta> = {
  slack: {
    label: "Slack",
    description: "Send automation activity and alerts into a connected Slack channel.",
    initials: "SL",
    bg: "bg-violet-100",
    text: "text-violet-700",
    category: "comms",
  },
  stripe: {
    label: "Stripe",
    description: "React to payment and payout events for finance-linked automations.",
    initials: "ST",
    bg: "bg-brand-100",
    text: "text-brand-700",
    category: "payments",
  },
  email_provider: {
    label: "Email (SendGrid)",
    description: "Deliver automation-generated draft emails and notices through a transactional email provider.",
    initials: "EM",
    bg: "bg-info-100",
    text: "text-info-700",
    category: "comms",
  },
  twilio: {
    label: "Twilio",
    description: "Send SMS/WhatsApp reminders and alerts triggered by automations.",
    initials: "TW",
    bg: "bg-danger-100",
    text: "text-danger-700",
    category: "comms",
  },
  google_calendar: {
    label: "Google Calendar",
    description: "Create calendar reminders and hold events from automation actions.",
    initials: "GC",
    bg: "bg-success-100",
    text: "text-success-700",
    category: "calendar",
  },
  zapier: {
    label: "Zapier",
    description: "Trigger and receive events from Zaps connected to this workspace.",
    initials: "ZP",
    bg: "bg-warning-100",
    text: "text-warning-700",
    category: "automation",
  },
  custom_webhook: {
    label: "Custom Webhook",
    description: "Send outgoing automation events to your own HTTPS endpoint.",
    initials: "CW",
    bg: "bg-surface-200",
    text: "text-surface-700",
    category: "custom",
  },
  rest_api: {
    label: "REST API",
    description: "Programmatic access for external systems reading/writing Gala Dock automation data.",
    initials: "RA",
    bg: "bg-surface-200",
    text: "text-surface-700",
    category: "custom",
  },
};

const FALLBACK_COLORS: { bg: string; text: string }[] = [
  { bg: "bg-brand-100", text: "text-brand-700" },
  { bg: "bg-info-100", text: "text-info-700" },
  { bg: "bg-success-100", text: "text-success-700" },
  { bg: "bg-warning-100", text: "text-warning-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-danger-100", text: "text-danger-700" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getProviderMeta(provider: string): ProviderMeta {
  const known = KNOWN_PROVIDERS[provider];
  if (known) return known;
  const color = FALLBACK_COLORS[hashString(provider) % FALLBACK_COLORS.length];
  const initials = provider
    .split(/[_\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "??";
  return {
    label: provider
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
    description: "Custom integration connected to this workspace.",
    initials,
    bg: color.bg,
    text: color.text,
    category: "custom",
  };
}

/** Providers offered in the "New integration" flow that aren't already connected. */
export const CONNECTABLE_PROVIDERS: { value: string; connectType: "oauth" | "api_key" }[] = [
  { value: "slack", connectType: "oauth" },
  { value: "stripe", connectType: "oauth" },
  { value: "email_provider", connectType: "api_key" },
  { value: "twilio", connectType: "api_key" },
  { value: "google_calendar", connectType: "oauth" },
  { value: "zapier", connectType: "api_key" },
  { value: "custom_webhook", connectType: "api_key" },
  { value: "rest_api", connectType: "api_key" },
];
