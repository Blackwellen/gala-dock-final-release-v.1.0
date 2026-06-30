// Gala Dock — Event-type config backbone (EB-B). The seeded event_types live in Supabase
// (admin-extendable); this module provides the default budget/revenue/risk category sets per
// event CATEGORY that the type-aware tabs, budgeting, profitability and risk engines consume.
// Defaults can be overridden per workspace via event_type_templates. Pure data.

export type EventCategory = "nightlife" | "public" | "private" | "corporate" | "remote" | "hybrid" | "structure" | "other";

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  nightlife: "Nightlife",
  public: "Public / Ticketed",
  private: "Private",
  corporate: "Corporate",
  remote: "Remote",
  hybrid: "Hybrid",
  structure: "Multi / International",
  other: "Other",
};

const COMMON_BUDGET = [
  "Venue hire", "Venue deposit", "Staff", "Security", "Insurance", "Permits / licensing",
  "Marketing / ads", "Photography", "Contingency", "Payment processing fees",
];

const COMMON_REVENUE = ["Ticket sales", "Add-ons / upsells", "Fixed management fee", "Percentage management fee"];

/** Default budget categories by event category (extends the common set). */
export const BUDGET_CATEGORIES: Record<EventCategory, string[]> = {
  nightlife: [...COMMON_BUDGET, "Bar deposit", "Minimum spend", "Door staff", "Bar staff", "DJs", "Artists", "Hosts / MCs", "Sound", "Lighting", "Decor", "Drink tokens", "VIP packages"],
  public: [...COMMON_BUDGET, "Stage", "Sound", "Lighting", "AV", "Production staff", "First aid / medical", "Toilets / infrastructure", "Fencing / barriers", "Waste management", "Transport / shuttles", "Artists", "Sponsorship fulfilment"],
  private: [...COMMON_BUDGET, "Catering", "Drinks packages", "Decor", "Florals", "Furniture", "Theme design", "Entertainment", "Children's entertainment", "Cake / extras"],
  corporate: [...COMMON_BUDGET, "AV", "Streaming", "Catering", "Branding / signage", "Speakers", "Hosts / MCs", "Travel", "Accommodation", "Delegate packs"],
  remote: ["Streaming / webinar platform", "Remote event tooling", "Production staff", "AV", "Speakers", "Hosts / MCs", "Marketing / ads", "Email / SMS campaigns", "Payment processing fees", "Contingency"],
  hybrid: [...COMMON_BUDGET, "Streaming / webinar platform", "AV", "Production staff", "Catering", "Speakers", "Travel", "Accommodation"],
  structure: [...COMMON_BUDGET, "Multi-venue logistics", "Travel", "Accommodation", "Localization", "Currency / VAT handling"],
  other: COMMON_BUDGET,
};

/** Default revenue categories by event category. */
export const REVENUE_CATEGORIES: Record<EventCategory, string[]> = {
  nightlife: [...COMMON_REVENUE, "VIP tables", "Table packages", "Group packages", "Bar revenue share", "Early bird tiers", "Guest list"],
  public: [...COMMON_REVENUE, "Early bird tiers", "VIP tiers", "Sponsorship", "Vendor / stall revenue", "Merchandise", "Food revenue share"],
  private: ["Client fee", "Fixed management fee", "Percentage management fee", "Add-ons / upsells", "Deposits collected"],
  corporate: ["Delegate tickets", "Corporate packages", "Sponsorship", "Streaming / remote access", "Fixed management fee", "Add-ons / upsells"],
  remote: ["Registration tickets", "Streaming / remote access", "Sponsorship", "Add-ons / upsells", "Corporate packages"],
  hybrid: [...COMMON_REVENUE, "Streaming / remote access", "VIP tiers", "Sponsorship"],
  structure: [...COMMON_REVENUE, "Multi-venue packages", "Sponsorship", "VIP tiers"],
  other: COMMON_REVENUE,
};

/** Default risk template items by event category. */
export const RISK_ITEMS: Record<EventCategory, string[]> = {
  nightlife: ["Crowd / capacity", "Security plan", "Fire exits", "Alcohol / licensing", "Noise", "First aid", "Drug / welfare policy"],
  public: ["Crowd / capacity", "Fire exits", "Security plan", "First aid / medical", "Weather (outdoor)", "Noise", "Permits / licensing", "Supplier compliance"],
  private: ["Capacity", "Allergens / food safety", "Alcohol", "Child safeguarding", "First aid", "Supplier compliance"],
  corporate: ["Capacity", "AV / technical", "Data / privacy", "Speaker / guest safety", "Catering / allergens", "Travel risk"],
  remote: ["Technical / streaming failure", "Data / privacy", "Platform capacity", "Speaker connectivity"],
  hybrid: ["Technical / streaming", "Crowd / capacity", "Data / privacy", "AV", "First aid"],
  structure: ["Multi-venue coordination", "Travel risk", "International compliance", "Currency / tax", "Crowd / capacity"],
  other: ["Capacity", "Health & safety", "Insurance", "Permits"],
};

// ── Layout / admission mode ───────────────────────────────────────────────
// seated = reserved seats/tables · standing = general admission · hybrid = seats + standing
// capacity = headcount only (festivals, remote). Drives capacity engine, ticketing, floor plans.
export type LayoutMode = "seated" | "standing" | "hybrid" | "capacity";

export const LAYOUT_MODE_LABEL: Record<LayoutMode, string> = {
  seated: "Seated",
  standing: "Standing",
  hybrid: "Hybrid (seated + standing)",
  capacity: "Capacity only",
};

/** Default layout mode per seeded event type (a per-event override may be stored on events.layout_mode). */
export const LAYOUT_MODE_BY_TYPE: Record<string, LayoutMode> = {
  nightclub: "hybrid",
  festival: "capacity",
  gig: "standing",
  theatre: "seated",
  show_large: "standing",
  show_small: "standing",
  wedding: "seated",
  birthday: "hybrid",
  childrens_party: "capacity",
  private_party: "hybrid",
  corporate: "seated",
  conference: "seated",
  speaker: "seated",
  webinar: "capacity",
  remote: "capacity",
  hybrid: "hybrid",
  multi_room: "hybrid",
  multi_venue: "hybrid",
  international: "hybrid",
  custom: "capacity",
};

export function layoutModeFor(typeKey: string): LayoutMode {
  return LAYOUT_MODE_BY_TYPE[typeKey] ?? "capacity";
}

/** Config mirror of the seeded event types (key → name + category) for UI without a DB round-trip. */
export const TYPE_META: Record<string, { name: string; category: EventCategory }> = {
  nightclub: { name: "Nightclub Event", category: "nightlife" },
  festival: { name: "Festival", category: "public" },
  gig: { name: "Gig", category: "public" },
  theatre: { name: "Theatre / Show", category: "public" },
  show_large: { name: "Large Show", category: "public" },
  show_small: { name: "Small Show", category: "public" },
  wedding: { name: "Wedding", category: "private" },
  birthday: { name: "Birthday", category: "private" },
  childrens_party: { name: "Children's Party", category: "private" },
  private_party: { name: "Private Party", category: "private" },
  corporate: { name: "Corporate Event", category: "corporate" },
  conference: { name: "Conference", category: "corporate" },
  speaker: { name: "Speaker Event", category: "corporate" },
  webinar: { name: "Webinar", category: "remote" },
  remote: { name: "Remote Event", category: "remote" },
  hybrid: { name: "Hybrid Event", category: "hybrid" },
  multi_room: { name: "Multi-room Event", category: "structure" },
  multi_venue: { name: "Multi-venue Event", category: "structure" },
  international: { name: "International Event", category: "structure" },
  custom: { name: "Custom Event", category: "other" },
};

export function typeMeta(key: string | null | undefined): { name: string; category: EventCategory } | null {
  return (key && TYPE_META[key]) || null;
}

export function budgetCategoriesFor(category: string): string[] {
  return BUDGET_CATEGORIES[(category as EventCategory)] ?? BUDGET_CATEGORIES.other;
}
export function revenueCategoriesFor(category: string): string[] {
  return REVENUE_CATEGORIES[(category as EventCategory)] ?? REVENUE_CATEGORIES.other;
}
export function riskItemsFor(category: string): string[] {
  return RISK_ITEMS[(category as EventCategory)] ?? RISK_ITEMS.other;
}
