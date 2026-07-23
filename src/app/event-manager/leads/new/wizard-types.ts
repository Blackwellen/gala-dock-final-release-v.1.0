/** Shared types + small helpers for the /leads/new 3-step wizard. */

export interface MemberOption {
  id: string;
  name: string;
}

export interface ReferenceLink {
  url: string;
  label: string;
}

export interface NextActionItem {
  id: string;
  label: string;
  done: boolean;
}

export type WizardStep = "contact" | "event-details" | "qualification";

export const WIZARD_STEPS: WizardStep[] = ["contact", "event-details", "qualification"];

export function isWizardStep(value: string | null): value is WizardStep {
  return value === "contact" || value === "event-details" || value === "qualification";
}

export interface WizardState {
  // Step 1 — Contact & Source
  lead_title: string;
  client_name: string;
  company_name: string;
  job_title: string;
  client_email: string;
  country_code: string;
  phone_local: string;
  alt_email: string;
  alt_phone: string;
  sources: string[];
  preferred_contact_method: string;
  enquiry_channel: string;
  assigned_to: string;

  // Step 2 — Event Details
  event_type: string;
  event_format: string;
  event_date: string;
  date_flexibility: string;
  event_location: string;
  city: string;
  contact_timezone: string;
  guest_count_estimate: string;
  currency: string;
  budget_min: string;
  budget_max: string;
  event_purpose: string;
  ticketing_type: string;
  venue_types: string[];
  additional_requirements: string;
  tags: string[];
  accessibility_needed: boolean;
  accessibility_notes: string;
  is_international: boolean;
  multi_room: boolean;
  alcohol_bar: boolean;
  minors_present: boolean;
  licensing_notes: string;
  reference_links: ReferenceLink[];

  // Step 3 — Qualification & Review
  stage: string;
  priority: string;
  probability_pct: string;
  response_due_date: string;
  follow_up_cadence: string;
  qualification: Record<string, boolean>;
  notes: string;
  internal_comments: string;
  next_actions: NextActionItem[];
  decision_maker: boolean;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  lead_title: "",
  client_name: "",
  company_name: "",
  job_title: "",
  client_email: "",
  country_code: "+44",
  phone_local: "",
  alt_email: "",
  alt_phone: "",
  sources: [],
  preferred_contact_method: "",
  enquiry_channel: "",
  assigned_to: "",

  event_type: "",
  event_format: "in-person",
  event_date: "",
  date_flexibility: "",
  event_location: "",
  city: "",
  contact_timezone: "",
  guest_count_estimate: "",
  currency: "GBP",
  budget_min: "",
  budget_max: "",
  event_purpose: "",
  ticketing_type: "",
  venue_types: [],
  additional_requirements: "",
  tags: [],
  accessibility_needed: false,
  accessibility_notes: "",
  is_international: false,
  multi_room: false,
  alcohol_bar: false,
  minors_present: false,
  licensing_notes: "",
  reference_links: [],

  stage: "new-enquiry",
  priority: "medium",
  probability_pct: "",
  response_due_date: "",
  follow_up_cadence: "",
  qualification: {},
  notes: "",
  internal_comments: "",
  next_actions: [],
  decision_maker: false,
};

export const COUNTRY_CODES = [
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+1", label: "🇺🇸 +1" },
  { code: "+353", label: "🇮🇪 +353" },
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+61", label: "🇦🇺 +61" },
];

export const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

/** Build the combined `client_phone` value from a country code + local number. */
export function combinePhone(countryCode: string, local: string): string {
  const trimmed = local.trim();
  if (!trimmed) return "";
  return `${countryCode} ${trimmed}`;
}

export const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all disabled:bg-surface-50 disabled:text-surface-400";

/** Serialise step-1 wizard state into FormData for createLeadDraft/autosaveLeadStep. */
export function buildContactFormData(state: WizardState): FormData {
  const fd = new FormData();
  fd.set("lead_title", state.lead_title);
  fd.set("client_name", state.client_name);
  fd.set("title", state.client_name ? `${state.client_name} Enquiry` : "");
  fd.set("company_name", state.company_name);
  fd.set("job_title", state.job_title);
  fd.set("client_email", state.client_email);
  fd.set("client_phone", combinePhone(state.country_code, state.phone_local));
  fd.set("alt_email", state.alt_email);
  fd.set("alt_phone", state.alt_phone);
  fd.set("source", state.sources.join(", "));
  fd.set("preferred_contact_method", state.preferred_contact_method);
  fd.set("enquiry_channel", state.enquiry_channel);
  fd.set("assigned_to", state.assigned_to);
  return fd;
}

/** Serialise step-2 wizard state into FormData for autosaveLeadStep. */
export function buildEventDetailsFormData(state: WizardState): FormData {
  const fd = new FormData();
  fd.set("event_type", state.event_type);
  fd.set("event_format", state.event_format);
  fd.set("event_date", state.event_date);
  fd.set("date_flexibility", state.date_flexibility);
  fd.set("event_location", state.event_location);
  fd.set("city", state.city);
  fd.set("contact_timezone", state.contact_timezone);
  fd.set("guest_count_estimate", state.guest_count_estimate);
  fd.set("currency", state.currency);
  fd.set("budget_min", state.budget_min);
  fd.set("budget_max", state.budget_max);
  fd.set("event_purpose", state.event_purpose);
  fd.set("ticketing_type", state.ticketing_type);
  fd.set("venue_types", JSON.stringify(state.venue_types));
  fd.set("additional_requirements", state.additional_requirements);
  fd.set("tags", JSON.stringify(state.tags));
  fd.set("accessibility_notes", state.accessibility_needed ? state.accessibility_notes : "");
  fd.set("is_international", String(state.is_international));
  fd.set("multi_room", String(state.multi_room));
  fd.set("alcohol_bar", String(state.alcohol_bar));
  fd.set("minors_present", String(state.minors_present));
  fd.set("licensing_notes", state.licensing_notes);
  fd.set("reference_links", JSON.stringify(state.reference_links));
  return fd;
}

/** Serialise step-3 wizard state into FormData for autosaveLeadStep/completeLeadWizard. */
export function buildQualificationFormData(state: WizardState): FormData {
  const fd = new FormData();
  fd.set("stage", state.stage);
  fd.set("priority", state.priority);
  fd.set("probability_pct", state.probability_pct);
  fd.set("response_due_date", state.response_due_date);
  fd.set("assigned_to", state.assigned_to);
  fd.set("follow_up_cadence", state.follow_up_cadence);
  fd.set("qualification", JSON.stringify(state.qualification));
  fd.set("notes", state.notes);
  fd.set("internal_comments", state.internal_comments);
  fd.set("next_actions", JSON.stringify(state.next_actions));
  fd.set("decision_maker", String(state.decision_maker));
  return fd;
}

/** Extra scoring-context fields appended only on final submit (completeLeadWizard). */
export function appendScoringContext(fd: FormData, state: WizardState): FormData {
  const budgetMax = Number(state.budget_max.replace(/[£,\s]/g, ""));
  const budgetMin = Number(state.budget_min.replace(/[£,\s]/g, ""));
  const budgetCents = Number.isFinite(budgetMax) && budgetMax > 0
    ? Math.round(budgetMax * 100)
    : Number.isFinite(budgetMin) && budgetMin > 0
      ? Math.round(budgetMin * 100)
      : 0;
  fd.set("has_company", String(!!state.company_name.trim()));
  fd.set("has_budget", String(!!(state.budget_min.trim() || state.budget_max.trim())));
  fd.set("budget_cents_for_score", String(budgetCents));
  fd.set("has_event_date", String(!!state.event_date.trim()));
  fd.set("has_venue", String(!!state.event_location.trim()));
  fd.set("guest_count_estimate", state.guest_count_estimate);
  return fd;
}

export function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}
