// Shared onboarding definitions and validation. Imported by client forms and the server route,
// so both sides enforce the same rules. The server is authoritative.

export type Flow = "customer" | "organizer" | "provider";
export type Values = Record<string, unknown>;
export type Errors = Record<string, string>;

export const flowSteps = {
  customer: [{ key: "preferences", label: "Your preferences" }],
  organizer: [
    { key: "organisation", label: "Organisation" },
    { key: "operating", label: "Operating Model" },
    { key: "brand", label: "Brand, Payments & Communications" },
    { key: "team", label: "Team & Launch" },
  ],
  provider: [
    { key: "business", label: "Business & Capabilities" },
    { key: "offer", label: "First Offer" },
    { key: "rules", label: "Booking Rules & Response" },
    { key: "trust", label: "Trust, Team & Publish" },
  ],
} as const;

export type Country = { code: string; name: string; timezones: { value: string; label: string }[]; currency: string; tax: string[] };
export const countries: Country[] = [
  { code: "GB", name: "United Kingdom", timezones: [{ value: "Europe/London", label: "(GMT+0/+1) London" }], currency: "GBP", tax: ["UK VAT 20% (standard rate)", "UK VAT 5% (reduced rate)", "Not VAT registered"] },
  { code: "IE", name: "Ireland", timezones: [{ value: "Europe/Dublin", label: "(GMT+0/+1) Dublin" }], currency: "EUR", tax: ["Irish VAT 23%", "Irish VAT 13.5%", "Not VAT registered"] },
  { code: "US", name: "United States", timezones: [
    { value: "America/New_York", label: "(GMT−5/−4) New York" }, { value: "America/Chicago", label: "(GMT−6/−5) Chicago" },
    { value: "America/Denver", label: "(GMT−7/−6) Denver" }, { value: "America/Los_Angeles", label: "(GMT−8/−7) Los Angeles" }],
    currency: "USD", tax: ["Sales tax by state (set per event location)", "Tax exempt organisation"] },
  { code: "CA", name: "Canada", timezones: [{ value: "America/Toronto", label: "(GMT−5/−4) Toronto" }, { value: "America/Vancouver", label: "(GMT−8/−7) Vancouver" }], currency: "CAD", tax: ["GST/HST by province", "Not registered (small supplier)"] },
  { code: "DE", name: "Germany", timezones: [{ value: "Europe/Berlin", label: "(GMT+1/+2) Berlin" }], currency: "EUR", tax: ["Umsatzsteuer 19%", "Kleinunternehmer (no VAT charged)"] },
  { code: "FR", name: "France", timezones: [{ value: "Europe/Paris", label: "(GMT+1/+2) Paris" }], currency: "EUR", tax: ["TVA 20%", "Franchise en base (no VAT charged)"] },
  { code: "AE", name: "United Arab Emirates", timezones: [{ value: "Asia/Dubai", label: "(GMT+4) Dubai" }], currency: "AED", tax: ["UAE VAT 5%", "Not VAT registered"] },
  { code: "ZA", name: "South Africa", timezones: [{ value: "Africa/Johannesburg", label: "(GMT+2) Johannesburg" }], currency: "ZAR", tax: ["South African VAT 15%", "Not VAT registered"] },
  { code: "AU", name: "Australia", timezones: [{ value: "Australia/Sydney", label: "(GMT+10/+11) Sydney" }, { value: "Australia/Perth", label: "(GMT+8) Perth" }], currency: "AUD", tax: ["GST 10%", "Not GST registered"] },
];
export const currencies = [
  { value: "GBP", label: "GBP (£) – British Pound" }, { value: "EUR", label: "EUR (€) – Euro" },
  { value: "USD", label: "USD ($) – US Dollar" }, { value: "CAD", label: "CAD ($) – Canadian Dollar" },
  { value: "AED", label: "AED – UAE Dirham" }, { value: "ZAR", label: "ZAR (R) – South African Rand" },
  { value: "AUD", label: "AUD ($) – Australian Dollar" },
];
export const countryByName = (name: unknown) => countries.find(c => c.name === name) ?? countries[0];

export const customerInterests = ["Music & Concerts", "Food & Drink", "Nightlife", "Arts & Culture", "Sports", "Business & Networking", "Weddings", "Family & Kids", "Festivals", "Other"];
export const organizerBusinessTypes = ["Event Management Company", "Event Agency", "Promoter", "Wedding Planner", "Corporate Events Team", "Venue Operator", "Community Organisation", "Independent Organiser"];
export const organizerEventTypes = ["Weddings", "Corporate Events", "Festivals", "Conferences", "Private Events", "Nightclubs", "Concerts & Live Shows", "Remote / Hybrid", "Community Events", "Mixed / Custom"];
export const capacityBands = ["1–50", "51–250", "251–1,000", "1,000+"];
export const serviceCategories = ["Catering", "Photography & Video", "DJs & Music", "Live Entertainment", "Décor & Florals", "Staffing", "Security", "AV & Production", "Transport", "Planning & Coordination"];
export const venueTypes = ["Event hall", "Hotel or conference centre", "Outdoor venue", "Bar or nightclub", "Restaurant", "Unique space", "Arena or stadium"];
export const amenities = ["Step-free access", "On-site parking", "In-house catering", "AV equipment", "Outdoor space", "Licensed bar", "Accommodation", "Wi-Fi"];
export const bookingModes = ["Instant Book", "Request to Book", "Enquiry Only"];
export const responseTimes = ["Within 2 hours", "Within 4 hours", "Within 8 hours", "Within 12 hours", "Up to 24 hours"];
export const leadTimes = ["Same day", "At least 24 hours", "At least 7 days", "At least 30 days"];
export const cancellationPolicies = ["Flexible – full refund up to 7 days before", "Standard – 50% refund up to 14 days before", "Strict – no refund within 30 days"];
export const holdDurations = ["24 hours", "48 hours", "72 hours"];
export const memberRoles = [{ value: "manager", label: "Event Manager" }, { value: "member", label: "Team Member" }, { value: "finance", label: "Finance & Payments" }];

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).filter((x): x is string => typeof x === "string" && allowed.includes(x)).slice(0, 20);
const oneOf = (v: unknown, allowed: readonly string[], fallback: string) => (typeof v === "string" && allowed.includes(v) ? v : fallback);
const bool = (v: unknown) => v === true || v === "on" || v === "true";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const storagePath = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i.test(v) ? v : "");
const paths = (v: unknown) => (Array.isArray(v) ? v.map(storagePath).filter(Boolean).slice(0, 12) : []);

function locale(values: Values, errors: Errors) {
  const country = countries.find(c => c.name === values.country);
  if (!country) errors.country = "Choose your country.";
  const c = country ?? countries[0];
  const timezone = oneOf(values.timezone, c.timezones.map(t => t.value), "");
  if (!timezone) errors.timezone = "Choose a timezone for this country.";
  const currency = oneOf(values.currency, currencies.map(x => x.value), "");
  if (!currency) errors.currency = "Choose a default currency.";
  return { country: c.name, timezone, currency };
}

export function teamMembers(v: unknown) {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap(item => {
    const email = text((item as Values)?.email, 254).toLowerCase();
    const role = oneOf((item as Values)?.role, memberRoles.map(r => r.value), "member");
    if (!emailPattern.test(email) || seen.has(email)) return [];
    seen.add(email);
    return [{ email, role }];
  }).slice(0, 25);
}

/** Validates one step and returns the normalised values that may be stored. */
export function validateStep(flow: Flow, step: string, values: Values, context: { capabilities?: string[]; ownerEmail?: string } = {}) {
  const errors: Errors = {};
  let clean: Values = {};
  if (flow === "customer") {
    const full_name = text(values.full_name, 100);
    if (full_name.length < 2) errors.full_name = "Enter the name you’d like to use.";
    clean = { full_name, home_area: text(values.home_area, 150), currency: oneOf(values.currency, currencies.map(c => c.value), "GBP"),
      interests: list(values.interests, customerInterests), notifications: list(values.notifications, ["recommendations", "offers", "updates"]) };
  } else if (flow === "organizer" && step === "organisation") {
    const name = text(values.name, 80);
    if (name.length < 2) errors.name = "Enter a workspace name of at least 2 characters.";
    const website = text(values.website, 200);
    if (website && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(website)) errors.website = "Enter a full website address starting with https://";
    clean = { name, legal_name: text(values.legal_name, 120), business_type: oneOf(values.business_type, organizerBusinessTypes, organizerBusinessTypes[0]), website, ...locale(values, errors) };
  } else if (flow === "organizer" && step === "operating") {
    const event_types = list(values.event_types, organizerEventTypes);
    if (!event_types.length) errors.event_types = "Select at least one event type, or Mixed / Custom.";
    clean = { event_types, event_access: oneOf(values.event_access, ["Public", "Private", "Both"], "Both"), ticketing: bool(values.ticketing),
      client_work: bool(values.client_work), multi_venue: bool(values.multi_venue), capacity: oneOf(values.capacity, capacityBands, "51–250"),
      procurement: oneOf(values.procurement, ["Marketplace suppliers", "My own suppliers", "Both"], "Both") };
  } else if (flow === "organizer" && step === "brand") {
    const support_email = text(values.support_email, 254).toLowerCase();
    if (!emailPattern.test(support_email)) errors.support_email = "Enter a valid support email address.";
    const invoice_prefix = text(values.invoice_prefix, 8).toUpperCase();
    if (!/^[A-Z0-9-]{2,8}$/.test(invoice_prefix)) errors.invoice_prefix = "Use 2–8 letters, numbers or hyphens.";
    const brand_color = typeof values.brand_color === "string" && /^#[0-9a-f]{6}$/i.test(values.brand_color) ? values.brand_color : "#2563EB";
    clean = { logo: storagePath(values.logo), brand_color, support_email, invoice_prefix, tax_setting: text(values.tax_setting, 80),
      payment_terms: oneOf(values.payment_terms, ["Due on receipt", "7 days", "14 days", "30 days"], "14 days") };
  } else if (flow === "organizer" && step === "team") {
    const members = teamMembers(values.members).filter(m => m.email !== context.ownerEmail);
    clean = { members, default_owner: "owner", notifications: list(values.notifications, ["enquiries", "payments", "team"]),
      first_event_template: oneOf(values.first_event_template, ["Wedding", "Corporate Event", "Festival / Concert", "Private Party", ""], "") };
  } else if (flow === "provider" && step === "business") {
    const name = text(values.name, 80);
    if (name.length < 2) errors.name = "Enter your business display name.";
    const capabilities = list(values.capabilities, ["venue", "service"]);
    if (!capabilities.length) errors.capabilities = "Choose Venues, Services or both.";
    const location = text(values.location, 150);
    if (!location) errors.location = "Enter your primary business location.";
    clean = { name, legal_name: text(values.legal_name, 120), ...locale(values, errors), location, capabilities,
      coverage: oneOf(values.coverage, ["Venue location only", "Within 25 miles", "Within 50 miles", "Within 100 miles", "Nationwide", "International"], "Within 50 miles"),
      service_categories: list(values.service_categories, serviceCategories) };
    if (capabilities.includes("service") && !(clean.service_categories as string[]).length) errors.service_categories = "Pick at least one service category.";
  } else if (flow === "provider" && step === "offer") {
    const caps = context.capabilities ?? [];
    const kind = oneOf(values.kind, caps.length ? caps : ["venue"], caps[0] ?? "venue");
    const listing_name = text(values.listing_name, 100);
    if (listing_name.length < 3) errors.listing_name = `Enter a name for your ${kind}.`;
    const description = text(values.description, 1500);
    if (description.length < 40) errors.description = "Write at least 40 characters so organisers understand your offer.";
    const location = text(values.location, 150);
    if (!location) errors.location = kind === "venue" ? "Enter the venue location." : "Enter where you’re based.";
    clean = { kind, listing_name, description, location, photos: paths(values.photos), event_types: list(values.event_types, organizerEventTypes) };
    if (kind === "venue") {
      const capacity = Number(values.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) errors.capacity = "Enter an indicative capacity between 1 and 100,000.";
      const min = values.min_capacity === "" || values.min_capacity == null ? null : Number(values.min_capacity);
      if (min !== null && (!Number.isInteger(min) || min < 1 || (Number.isInteger(capacity) && min > capacity))) errors.min_capacity = "Minimum capacity must be between 1 and the maximum.";
      Object.assign(clean, { venue_type: oneOf(values.venue_type, venueTypes, venueTypes[0]), capacity: Number.isFinite(capacity) ? capacity : null, min_capacity: min, address: text(values.address, 200), amenities: list(values.amenities, amenities) });
    } else {
      const category = oneOf(values.category, serviceCategories, "");
      if (!category) errors.category = "Choose a service category.";
      Object.assign(clean, { category, subcategory: text(values.subcategory, 80),
        delivery_mode: oneOf(values.delivery_mode, ["On-site at the event", "Remote / digital", "Both"], "On-site at the event"),
        coverage: oneOf(values.coverage, ["Within 25 miles", "Within 50 miles", "Within 100 miles", "Nationwide", "International"], "Within 50 miles"),
        pricing_mode: oneOf(values.pricing_mode, ["Fixed price", "Per hour", "Per person", "Quote on request"], "Quote on request") });
    }
  } else if (flow === "provider" && step === "rules") {
    clean = {
      booking_mode: oneOf(values.booking_mode, bookingModes, "Request to Book"),
      response_time: oneOf(values.response_time, responseTimes, "Within 4 hours"),
      lead_time: oneOf(values.lead_time, leadTimes, "At least 7 days"),
      cancellation_policy: oneOf(values.cancellation_policy, cancellationPolicies, cancellationPolicies[1]),
      conditional_holds: bool(values.conditional_holds), hold_duration: oneOf(values.hold_duration, holdDurations, "48 hours"),
      standby: bool(values.standby), emergency: bool(values.emergency),
      response_notifications: list(values.response_notifications, ["email", "push"]),
      payout_currency: oneOf(values.payout_currency, currencies.map(c => c.value), "GBP"),
    };
    for (const issue of ruleIssues(clean, context.capabilities ?? [])) if (issue.severity === "error") errors[issue.field] = issue.message;
  } else if (flow === "provider" && step === "trust") {
    const documents: Values = {};
    if (values.documents && typeof values.documents === "object") for (const [k, v] of Object.entries(values.documents as Values)) if (/^[a-z_]{2,40}$/.test(k) && storagePath(v)) documents[k] = storagePath(v);
    clean = { documents, members: teamMembers(values.members).filter(m => m.email !== context.ownerEmail) };
  } else {
    errors.step = "Unknown setup step.";
  }
  return { values: clean, errors };
}

export type RuleIssue = { severity: "error" | "warning"; field: string; message: string; fix?: { field: string; value: unknown; label: string } };

/** Deterministic compatibility checks for provider booking rules. */
export function ruleIssues(rules: Values, capabilities: string[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const response = responseTimes.indexOf(String(rules.response_time));
  if (rules.response_time === "Up to 24 hours" && !capabilities.includes("venue"))
    issues.push({ severity: "error", field: "response_time", message: "A 24-hour commitment is only available for complex venue requests. Choose 12 hours or faster.", fix: { field: "response_time", value: "Within 12 hours", label: "Use 12 hours" } });
  if (rules.emergency && response > 1)
    issues.push({ severity: "error", field: "emergency", message: "Emergency requests need a response commitment of 4 hours or less.", fix: { field: "response_time", value: "Within 2 hours", label: "Respond within 2 hours" } });
  if (rules.emergency && (rules.lead_time === "At least 7 days" || rules.lead_time === "At least 30 days"))
    issues.push({ severity: "error", field: "lead_time", message: "Emergency availability conflicts with a minimum lead time of 7+ days.", fix: { field: "lead_time", value: "Same day", label: "Allow same-day requests" } });
  if (rules.standby && rules.booking_mode === "Enquiry Only")
    issues.push({ severity: "warning", field: "standby", message: "Standby availability works best with Request to Book so organisers can confirm quickly." , fix: { field: "booking_mode", value: "Request to Book", label: "Switch to Request to Book" } });
  if (rules.booking_mode === "Instant Book")
    issues.push({ severity: "warning", field: "booking_mode", message: "Instant Book needs a connected availability calendar and verification. Until both are confirmed, requests will be handled as Request to Book." });
  if (rules.conditional_holds && rules.booking_mode === "Instant Book")
    issues.push({ severity: "warning", field: "conditional_holds", message: "Conditional holds are not used with Instant Book; bookings confirm immediately." });
  if (rules.lead_time === "Same day" && !rules.emergency && rules.booking_mode === "Instant Book")
    issues.push({ severity: "warning", field: "lead_time", message: "Same-day Instant Book leaves no preparation time. Consider at least 24 hours.", fix: { field: "lead_time", value: "At least 24 hours", label: "Require 24 hours" } });
  return issues;
}

export type Requirement = { key: string; label: string; detail: string; required: boolean; kind: "document" | "platform" };

/** Trust requirements adapt to capability, service category, country and booking mode. */
export function trustRequirements(input: { country?: string; capabilities: string[]; categories: string[]; bookingMode?: string }): Requirement[] {
  const uk = input.country === "United Kingdom";
  const reqs: Requirement[] = [
    { key: "identity", label: "Business identity verification", detail: "Reviewed by Gala Dock Trust & Safety. Uploading documents does not verify your business on its own.", required: true, kind: "platform" },
    { key: "payouts", label: "Payout account", detail: "Provider-hosted Stripe onboarding. Required before you can take bookings or publish.", required: true, kind: "platform" },
  ];
  const liability = input.capabilities.includes("venue") || input.categories.some(c => ["DJs & Music", "Live Entertainment", "AV & Production", "Catering", "Décor & Florals", "Security", "Staffing"].includes(c));
  reqs.push({ key: "public_liability", label: "Public liability insurance", detail: liability ? "Required for venues and on-site services." : "Recommended for all providers.", required: liability, kind: "document" });
  if (input.capabilities.includes("venue")) reqs.push({ key: "premises_licence", label: uk ? "Premises licence" : "Venue licences & permits", detail: uk ? "Needed if you sell alcohol or host regulated entertainment." : "Local operating permits for events at your venue.", required: uk, kind: "document" });
  if (input.capabilities.includes("venue")) reqs.push({ key: "health_safety", label: "Health & safety / certificates", detail: uk ? "Fire risk assessment and safety certificates." : "Safety certificates for your venue.", required: false, kind: "document" });
  if (input.categories.includes("Catering")) reqs.push({ key: "food_hygiene", label: uk ? "Food hygiene rating / registration" : "Food safety certification", detail: "Required for catering services.", required: true, kind: "document" });
  if (input.categories.includes("Security")) reqs.push({ key: "security_licence", label: uk ? "SIA licences" : "Security licences", detail: "Required for door supervision and event security staff.", required: true, kind: "document" });
  if (uk && input.categories.some(c => ["DJs & Music", "AV & Production", "Live Entertainment"].includes(c))) reqs.push({ key: "pat_testing", label: "PAT testing certificate", detail: "Commonly requested by UK venues for electrical equipment.", required: false, kind: "document" });
  return reqs;
}
