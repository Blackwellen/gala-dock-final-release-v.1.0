// Canonical master data (backend spec domains 25 Configuration and 264 Master Data; queue packet Q02).
//
// ONE definition for event types, venue types, the supplier/service taxonomy, build and planning categories, amenities,
// countries/regions, currencies and timezones. UI and server import it through `@/lib/master-data`; the database mirror
// (`taxonomy_terms`, `ref_countries`, `ref_currencies`, `ref_timezones`) is generated from this file by
// `scripts/gen-master-data-sql.mjs`, and `tests/foundation/master-data.spec.ts` fails if the two drift.
//
// Rules:
// - Keys are stable identifiers stored in the database. Never rename a key; add an alias and deprecate instead.
// - `aliases` lists every legacy spelling found in stored data or older UI (labels, plural labels, free-text categories),
//   so `resolveTerm()` / `taxonomy_resolve()` map historical rows to a canonical key without rewriting them.
// - Surface lists (which options a given screen shows, in which order, with which wording) live in SURFACES below, so a
//   screen can keep its designed wording while still pointing at canonical keys.
// Pure data: no I/O, safe for client components.

export const MASTER_DATA_VERSION = 1;

export type Term = {
  key: string;
  label: string;
  plural?: string;
  parent?: string;
  aliases?: readonly string[];
  /** Taxonomy-specific attributes (e.g. the build category a service fills, a plan tile image). */
  meta?: Readonly<Record<string, string | number | boolean>>;
  /** Kept resolvable for stored data but no longer offered for new records. */
  deprecated?: boolean;
};
export type Taxonomy = { label: string; description: string; terms: readonly Term[] };

const t = (key: string, label: string, extra: Omit<Term, "key" | "label"> = {}): Term => ({ key, label, ...extra });

export const TAXONOMIES = {
  event_type: {
    label: "Event types", description: "What kind of event an event, listing, package or template is for (events.event_type).",
    terms: [
      t("wedding", "Wedding", { plural: "Weddings", meta: { img: "type-wedding" } }),
      t("birthday", "Birthday", { plural: "Birthdays", meta: { img: "type-birthday" } }),
      t("corporate", "Corporate Event", { plural: "Corporate Events", aliases: ["Corporate", "Corporate & private hire"], meta: { img: "type-corporate" } }),
      t("party", "Party", { plural: "Parties", aliases: ["Parties"], meta: { img: "type-party" } }),
      t("private_party", "Private Party", { plural: "Private Parties", aliases: ["Private Events", "Private party"] }),
      t("festival", "Festival", { plural: "Festivals", meta: { img: "type-festival" } }),
      t("nightlife", "Nightclub", { plural: "Nightclubs", aliases: ["nightclub", "Club night", "Nightclub / DJ Event", "Clubs & Nightlife"], meta: { img: "type-nightclub" } }),
      t("concert", "Concert / Live Show", { plural: "Concerts & Live Shows", aliases: ["Concert", "Concert / gig", "Live Shows", "Live Show", "Concerts"] }),
      t("private_dinner", "Private Dinner", { plural: "Private Dinners", meta: { img: "type-private_dinner" } }),
      t("childrens_party", "Children's Party", { plural: "Children's Parties", aliases: ["Children’s Party", "Children’s Parties", "Children’s party"], meta: { img: "type-childrens_party" } }),
      t("conference", "Conference", { plural: "Conferences" }),
      t("exhibition", "Exhibition", { plural: "Exhibitions" }),
      t("product_launch", "Product Launch", { plural: "Product Launches" }),
      t("awards", "Awards", { plural: "Awards" }),
      t("gala", "Gala", { plural: "Galas" }),
      t("community", "Community", { plural: "Community Events", aliases: ["Community / Sport"] }),
      t("food_drink", "Food & Drink", { plural: "Food & Drink" }),
      t("comedy", "Comedy", { plural: "Comedy" }),
      t("webinar", "Webinar / Virtual", { plural: "Remote / Hybrid", aliases: ["Webinar / online", "Webinar", "Virtual", "Hybrid"] }),
      t("networking", "Networking", { plural: "Networking" }),
      t("theatre", "Theatre", { plural: "Theatre" }),
      t("sports", "Sports", { plural: "Sports" }),
      t("charity", "Charity / Fundraiser", { plural: "Charity / Fundraisers" }),
      t("arts", "Art & Culture", { plural: "Arts & Culture" }),
      t("religious", "Faith & Cultural", { plural: "Faith & Cultural" }),
      t("graduation", "Graduation / Prom", { plural: "Graduations" }),
      t("seasonal", "Seasonal / Holiday", { plural: "Seasonal / Holiday" }),
      t("family", "Family", { plural: "Family & Kids" }),
      t("production", "Production", { plural: "Productions" }),
      t("custom", "Something else", { plural: "Mixed / Custom", aliases: ["Other", "Custom"] }),
    ],
  },
  venue_type: {
    label: "Venue types", description: "What kind of venue a venue listing is (listings.category for kind = venue; details.type).",
    terms: [
      t("event_hall", "Event hall", { plural: "Event halls", aliases: ["Event Hall", "Event Space", "Event venue", "Event Space / Multi-Purpose", "Ballroom", "venue"] }),
      t("hotel", "Hotel", { plural: "Hotels", aliases: ["Hotel or conference centre"] }),
      t("conference_centre", "Conference centre", { plural: "Conference centres", aliases: ["Conference Centre", "Conference"] }),
      t("outdoor", "Outdoor venue", { plural: "Outdoor venues", aliases: ["Outdoor", "Outdoor / Garden", "Garden"] }),
      t("bar_nightclub", "Bar or nightclub", { plural: "Bars & nightclubs", aliases: ["Nightclub", "Bar", "Bar / Lounge"] }),
      t("restaurant", "Restaurant", { plural: "Restaurants", aliases: ["Restaurant / Bar", "Private Dining"] }),
      t("unique_space", "Unique space", { plural: "Unique spaces", aliases: ["Historic / Unique", "Rooftop", "Estate", "Industrial"] }),
      t("arena_stadium", "Arena or stadium", { plural: "Arenas & stadiums", aliases: ["Arena", "Stadium"] }),
      t("studio", "Studio", { plural: "Studios" }),
      t("other", "Other", { plural: "Other venues" }),
    ],
  },
  /** Supplier / service taxonomy. Top-level groups have no parent; `meta.build` is the build category the service fills. */
  service_category: {
    label: "Service categories", description: "What a supplier offers (listings.category for kind = service). Nested values like 'Entertainment > DJ' resolve by their most specific part.",
    terms: [
      t("catering", "Catering", { meta: { build: "food" }, aliases: ["food", "Food & catering"] }),
      t("catering_full", "Full service", { parent: "catering", meta: { build: "food" }, aliases: ["Catering > Full service"] }),
      t("street_food", "Street food", { parent: "catering", meta: { build: "food" }, aliases: ["Catering > Street food"] }),
      t("private_chef", "Private chef", { parent: "catering", meta: { build: "food" }, aliases: ["private dining"] }),
      t("drinks", "Drinks & bar", { meta: { build: "drinks" }, aliases: ["bar", "Drinks / Bar", "Bar & drinks", "Catering & Bar"] }),
      t("mobile_bar", "Mobile bar", { parent: "drinks", meta: { build: "drinks" } }),
      t("entertainment", "Entertainment", { meta: { build: "entertainment" }, aliases: ["Live Entertainment", "music", "Entertainers", "Entertainment (Acts/DJs)", "Entertainment / DJ"] }),
      t("dj", "DJ", { parent: "entertainment", meta: { build: "entertainment" }, aliases: ["DJs & Music", "DJ & Sound", "Entertainment > DJ"] }),
      t("live_music", "Live music", { parent: "entertainment", meta: { build: "entertainment" }, aliases: ["band", "Live Music", "Entertainment > Live music"] }),
      t("performers", "Performers", { parent: "entertainment", meta: { build: "entertainment" }, aliases: ["Entertainment > Performers", "Kids’ entertainment"] }),
      t("media", "Photography & video", { meta: { build: "media" }, aliases: ["Photography & Video", "video"] }),
      t("photography", "Photography", { parent: "media", meta: { build: "media" }, aliases: ["photographer"] }),
      t("videography", "Videography", { parent: "media", meta: { build: "media" }, aliases: ["videographer"] }),
      t("photo_booth", "Photo booth", { parent: "media", meta: { build: "media" } }),
      t("live_streaming", "Live streaming", { parent: "media", meta: { build: "media" } }),
      t("styling", "Décor & florals", { meta: { build: "styling" }, aliases: ["Décor & Florals", "Decor & styling", "Decor & Styling", "Décor & styling"] }),
      t("decor", "Décor", { parent: "styling", meta: { build: "styling" }, aliases: ["Decor"] }),
      t("florist", "Florist", { parent: "styling", meta: { build: "styling" }, aliases: ["flowers"] }),
      t("production", "AV & production", { meta: { build: "production" }, aliases: ["AV & Production", "Production & AV", "Lighting & AV"] }),
      t("av_lighting", "AV & lighting", { parent: "production", meta: { build: "production" }, aliases: ["lighting", "sound & lighting", "av", "AV & sound", "Production > AV & lighting"] }),
      t("staging", "Staging", { parent: "production", meta: { build: "production" }, aliases: ["Production > Staging"] }),
      t("hire", "Furniture & hire", { meta: { build: "hire" }, aliases: ["Furniture & marquees", "equipment"] }),
      t("marquees", "Marquees", { parent: "hire", meta: { build: "hire" } }),
      t("furniture", "Furniture", { parent: "hire", meta: { build: "hire" } }),
      t("equipment_hire", "Equipment hire", { parent: "hire", meta: { build: "hire" }, aliases: ["generator", "Generator & power"] }),
      t("staff", "Staffing", { meta: { build: "staff" }, aliases: ["staffing", "Event staff", "Staff & Crew", "Staffing & security", "Security & staffing"] }),
      t("security", "Security", { meta: { build: "staff" } }),
      t("transport", "Transport", { meta: { build: "transport" }, aliases: ["transportation"] }),
      t("accommodation", "Accommodation", { meta: { build: "transport" } }),
      t("planning", "Planning & coordination", { meta: { build: "extras" }, aliases: ["Planning & Coordination", "Planner / coordinator"] }),
      t("other", "Other", { meta: { build: "extras" } }),
    ],
  },
  /** The customer/organiser event-build line categories (build_items.category). */
  build_category: {
    label: "Build categories", description: "What a build line fills in an event plan (build_items.category).",
    terms: [
      t("venue", "Venue"), t("food", "Food & catering", { aliases: ["catering"] }), t("drinks", "Drinks & bar"), t("entertainment", "Entertainment", { aliases: ["dj"] }),
      t("media", "Photography & video"), t("styling", "Decor & styling"), t("staff", "Staff & security", { aliases: ["security"] }),
      t("production", "Production & AV", { aliases: ["staging"] }), t("hire", "Furniture & hire"), t("transport", "Transport & accommodation"), t("extras", "Extras"),
    ],
  },
  /** What a customer says the plan needs (Plan-an-Event). `meta.build` is the build category it becomes. */
  plan_need: {
    label: "Planning needs", description: "Customer Plan-an-Event must-haves and optional extras.",
    terms: [
      t("venue", "Venue", { meta: { build: "venue" } }), t("food", "Catering", { meta: { build: "food" } }), t("drinks", "Drinks / Bar", { meta: { build: "drinks" } }),
      t("entertainment", "Entertainment", { meta: { build: "entertainment" } }), t("media", "Photography", { meta: { build: "media" } }), t("styling", "Decor & Styling", { meta: { build: "styling" } }),
      t("transport", "Transportation", { meta: { build: "transport" } }), t("accommodation", "Accommodation", { meta: { build: "transport" } }), t("security", "Security", { meta: { build: "staff" } }),
      t("staff", "Staff", { meta: { build: "staff" } }), t("invitations", "Invitations", { meta: { build: "extras" } }), t("activities", "Activities", { meta: { build: "extras" } }),
    ],
  },
  amenity: {
    label: "Venue amenities", description: "Venue-level amenities captured at onboarding (listings.details.amenities).",
    terms: [
      t("step_free", "Step-free access"), t("parking", "On-site parking"), t("in_house_catering", "In-house catering"), t("av_equipment", "AV equipment"),
      t("outdoor_space", "Outdoor space"), t("licensed_bar", "Licensed bar"), t("accommodation", "Accommodation"), t("wifi", "Wi-Fi"),
    ],
  },
} as const satisfies Record<string, Taxonomy>;
export type TaxonomyName = keyof typeof TAXONOMIES;

/** Ordered option lists per screen. An item is a key, or [key, wording] when the screen's design uses different wording. */
export type SurfaceItem = string | readonly [string, string];
export type Surface = { taxonomy: TaxonomyName; form?: "label" | "plural"; items: readonly SurfaceItem[] };

export const SURFACES = {
  /** Customer Plan-an-Event: tiles and the "More event types" menu (src/lib/plan-model.ts). */
  "plan.occasions": { taxonomy: "event_type", items: ["wedding", "birthday", ["corporate", "Corporate"], "party", "festival", ["nightlife", "Nightclub"], "private_dinner", "childrens_party"] },
  "plan.more_occasions": { taxonomy: "event_type", items: ["conference", ["gala", "Gala"], ["charity", "Charity"], ["webinar", "Webinar (online)"], "awards", "community", "food_drink", "comedy", "custom"] },
  "plan.must_haves": { taxonomy: "plan_need", items: ["venue", "food", "drinks", "entertainment", "media", "styling"] },
  "plan.optionals": { taxonomy: "plan_need", items: ["transport", "accommodation", "security", "staff", "invitations", "activities"] },
  /** Organizer create-event wizard tiles (key-valued; events.event_type). */
  "organizer.create_event": { taxonomy: "event_type", items: ["festival", "concert", ["nightlife", "Nightclub / DJ Event"], "corporate", "wedding", ["birthday", "Birthday / Private Party"], "childrens_party", "webinar", ["community", "Community / Sport"]] },
  /** Organizer onboarding "event types you run" (label-valued, stored in workspace settings). */
  "onboarding.organizer_event_types": { taxonomy: "event_type", form: "plural", items: ["wedding", "corporate", "festival", "conference", ["private_party", "Private Events"], "nightlife", "concert", "webinar", "community", "custom",
    // Behind "More event types": the designed ten above stay first.
    "birthday", "party", "private_dinner", "childrens_party", "exhibition", "product_launch", "awards", "gala", "food_drink", "comedy", "networking", "theatre", "sports", "charity", "arts", "religious", "graduation", "seasonal", "family", "production"] },
  /** Provider onboarding first offer: event types the listing suits (label-valued). Onboarding lists offer every term; the designed items lead. */
  "onboarding.listing_event_types": { taxonomy: "event_type", form: "plural", items: ["wedding", "corporate", "private_party", "conference", "exhibition", ["custom", "Other"],
    "birthday", "party", "festival", "nightlife", "concert", "private_dinner", "childrens_party", "product_launch", "awards", "gala", "community", "food_drink", "comedy", ["webinar", "Webinar / Virtual"], "networking", "theatre", "sports", "charity", "arts", "religious", "graduation", "seasonal", "family", "production"] },
  "onboarding.service_categories": { taxonomy: "service_category", items: [["catering", "Catering"], ["media", "Photography & Video"], ["dj", "DJs & Music"], ["entertainment", "Live Entertainment"], ["styling", "Décor & Florals"], "staff", "security", ["production", "AV & Production"], "transport", ["planning", "Planning & Coordination"],
    ["catering_full", "Catering > Full service"], "street_food", "private_chef", "drinks", "mobile_bar", "live_music", "performers", "photography", "videography", "photo_booth", "live_streaming", "decor", "florist", "av_lighting", "staging", "hire", "marquees", "furniture", "equipment_hire", "accommodation", "other"] },
  "onboarding.venue_types": { taxonomy: "venue_type", items: ["event_hall", ["hotel", "Hotel or conference centre"], "outdoor", "bar_nightclub", "restaurant", "unique_space", "arena_stadium", "conference_centre", "studio", "other"] },
  "onboarding.amenities": { taxonomy: "amenity", items: ["step_free", "parking", "in_house_catering", "av_equipment", "outdoor_space", "licensed_bar", "accommodation", "wifi"] },
  /** Provider workspace wizards (label-valued today). Each offers every venue type / event type; only the order and wording are designed. */
  "provider.venue_types": { taxonomy: "venue_type", items: [["event_hall", "Event Space / Multi-Purpose"], ["arena_stadium", "Arena"], ["conference_centre", "Conference Centre"], "hotel", ["restaurant", "Restaurant / Bar"], ["outdoor", "Outdoor / Garden"], "bar_nightclub", "studio", ["unique_space", "Historic / Unique"], "other"] },
  "provider.service_event_types": { taxonomy: "event_type", form: "plural", items: ["wedding", "corporate", "private_party", ["nightlife", "Nightclub"], "festival", "birthday", ["childrens_party", "Children’s Parties"], "conference", "exhibition", "product_launch", ["concert", "Live Shows"],
    "party", "private_dinner", "awards", "gala", "community", "food_drink", "comedy", ["webinar", "Webinar / Virtual"], "networking", "theatre", "sports", "charity", "arts", "religious", "graduation", "seasonal", "family", "production", ["custom", "Other"]] },
  "provider.service_categories": { taxonomy: "service_category", items: [["dj", "Entertainment > DJ"], ["live_music", "Entertainment > Live music"], ["performers", "Entertainment > Performers"], ["catering_full", "Catering > Full service"], ["street_food", "Catering > Street food"], ["av_lighting", "Production > AV & lighting"], ["staging", "Production > Staging"], ["media", "Photography & video"], ["styling", "Decor & styling"], "hire", ["staff", "Staffing & security"], "transport", "other"] },
  "provider.package_event_types": { taxonomy: "event_type", form: "plural", items: ["private_party", "wedding", "corporate", "birthday", "conference", "festival", "product_launch",
    "party", "nightlife", "concert", "private_dinner", "childrens_party", "exhibition", "awards", "gala", "community", "food_drink", "comedy", ["webinar", "Webinar / Virtual"], "networking", "theatre", "sports", "charity", "arts", "religious", "graduation", "seasonal", "family", "production", ["custom", "Other"]] },
  "provider.booking_event_types": { taxonomy: "event_type", items: ["corporate", "wedding", "birthday", "conference", "product_launch", "private_dinner", "party", "gala", "production", ["concert", "Concert"],
    "private_party", "festival", "nightlife", "childrens_party", "exhibition", "awards", "community", "food_drink", "comedy", "webinar", "networking", "theatre", "sports", "charity", "arts", "religious", "graduation", "seasonal", "family", ["custom", "Other"]] },
} as const satisfies Record<string, Surface>;
export type SurfaceName = keyof typeof SURFACES;

// ── Locations, currencies, timezones ─────────────────────────────────────────────────────────────────────────────

export type Currency = { code: string; name: string; symbol: string; minor: number; /** Can be charged, invoiced and stored on events/workspaces. */ transactional: boolean };
export const CURRENCIES: readonly Currency[] = [
  { code: "GBP", name: "British Pound", symbol: "£", minor: 2, transactional: true },
  { code: "EUR", name: "Euro", symbol: "€", minor: 2, transactional: true },
  { code: "USD", name: "US Dollar", symbol: "$", minor: 2, transactional: true },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", minor: 2, transactional: false },
  { code: "AED", name: "UAE Dirham", symbol: "AED", minor: 2, transactional: false },
  { code: "ZAR", name: "South African Rand", symbol: "R", minor: 2, transactional: false },
  { code: "AUD", name: "Australian Dollar", symbol: "$", minor: 2, transactional: false },
];

export type Timezone = { tz: string; label: string; country: string };
export type Country = { code: string; name: string; region: "uk" | "eu" | "na" | "mea" | "apac"; currency: string; tax: readonly string[]; /** Offered for business onboarding (locale, tax, payouts). */ business: boolean };
export const COUNTRIES: readonly Country[] = [
  { code: "GB", name: "United Kingdom", region: "uk", currency: "GBP", business: true, tax: ["UK VAT 20% (standard rate)", "UK VAT 5% (reduced rate)", "Not VAT registered"] },
  { code: "IE", name: "Ireland", region: "eu", currency: "EUR", business: true, tax: ["Irish VAT 23%", "Irish VAT 13.5%", "Not VAT registered"] },
  { code: "US", name: "United States", region: "na", currency: "USD", business: true, tax: ["Sales tax by state (set per event location)", "Tax exempt organisation"] },
  { code: "CA", name: "Canada", region: "na", currency: "CAD", business: true, tax: ["GST/HST by province", "Not registered (small supplier)"] },
  { code: "DE", name: "Germany", region: "eu", currency: "EUR", business: true, tax: ["Umsatzsteuer 19%", "Kleinunternehmer (no VAT charged)"] },
  { code: "FR", name: "France", region: "eu", currency: "EUR", business: true, tax: ["TVA 20%", "Franchise en base (no VAT charged)"] },
  { code: "AE", name: "United Arab Emirates", region: "mea", currency: "AED", business: true, tax: ["UAE VAT 5%", "Not VAT registered"] },
  { code: "ZA", name: "South Africa", region: "mea", currency: "ZAR", business: true, tax: ["South African VAT 15%", "Not VAT registered"] },
  { code: "AU", name: "Australia", region: "apac", currency: "AUD", business: true, tax: ["GST 10%", "Not GST registered"] },
  // Customer home countries (profile only; not yet offered for business onboarding).
  { code: "ES", name: "Spain", region: "eu", currency: "EUR", business: false, tax: [] },
  { code: "IT", name: "Italy", region: "eu", currency: "EUR", business: false, tax: [] },
  { code: "NL", name: "Netherlands", region: "eu", currency: "EUR", business: false, tax: [] },
  { code: "PT", name: "Portugal", region: "eu", currency: "EUR", business: false, tax: [] },
];
/** IANA zones offered in pickers, in country order. Labels show the standard/daylight offsets. */
export const TIMEZONES: readonly Timezone[] = [
  { tz: "Europe/London", label: "(GMT+0/+1) London", country: "GB" },
  { tz: "Europe/Dublin", label: "(GMT+0/+1) Dublin", country: "IE" },
  { tz: "America/New_York", label: "(GMT−5/−4) New York", country: "US" },
  { tz: "America/Chicago", label: "(GMT−6/−5) Chicago", country: "US" },
  { tz: "America/Denver", label: "(GMT−7/−6) Denver", country: "US" },
  { tz: "America/Los_Angeles", label: "(GMT−8/−7) Los Angeles", country: "US" },
  { tz: "America/Toronto", label: "(GMT−5/−4) Toronto", country: "CA" },
  { tz: "America/Vancouver", label: "(GMT−8/−7) Vancouver", country: "CA" },
  { tz: "Europe/Berlin", label: "(GMT+1/+2) Berlin", country: "DE" },
  { tz: "Europe/Paris", label: "(GMT+1/+2) Paris", country: "FR" },
  { tz: "Asia/Dubai", label: "(GMT+4) Dubai", country: "AE" },
  { tz: "Africa/Johannesburg", label: "(GMT+2) Johannesburg", country: "ZA" },
  { tz: "Australia/Sydney", label: "(GMT+10/+11) Sydney", country: "AU" },
  { tz: "Australia/Perth", label: "(GMT+8) Perth", country: "AU" },
  { tz: "Europe/Madrid", label: "(GMT+1/+2) Madrid", country: "ES" },
  { tz: "Europe/Rome", label: "(GMT+1/+2) Rome", country: "IT" },
  { tz: "Europe/Amsterdam", label: "(GMT+1/+2) Amsterdam", country: "NL" },
  { tz: "Europe/Lisbon", label: "(GMT+0/+1) Lisbon", country: "PT" },
];

// ── Resolution (shared by the TS accessor and the SQL generator) ─────────────────────────────────────────────────

/** Case/spacing/punctuation-insensitive comparison form (mirrors public.taxonomy_norm in SQL). */
export const normTerm = (s: string) => s.normalize("NFKC").replace(/[’‘`]/g, "'").toLowerCase().replace(/[\s_-]+/g, " ").trim();

const surfaceAliases = (() => {
  const out: Partial<Record<TaxonomyName, [string, string][]>> = {};
  for (const s of Object.values(SURFACES)) for (const item of s.items) if (typeof item !== "string") (out[s.taxonomy] ??= []).push([item[0], item[1]]);
  return out;
})();

/** Every spelling that resolves to each term of a taxonomy: key, label, plural, aliases and surface wordings. */
export function spellings(taxonomy: TaxonomyName): Map<string, string> {
  const map = new Map<string, string>();
  const add = (value: string, key: string) => { const n = normTerm(value); if (n && !map.has(n)) map.set(n, key); };
  const terms = TAXONOMIES[taxonomy].terms as readonly Term[];
  for (const term of terms) add(term.key, term.key);
  for (const term of terms) { add(term.label, term.key); if (term.plural) add(term.plural, term.key); for (const a of term.aliases ?? []) add(a, term.key); }
  for (const [key, label] of surfaceAliases[taxonomy] ?? []) add(label, key);
  return map;
}

/** Internal consistency of the catalog itself (asserted by tests/foundation/master-data.spec.ts). Empty means healthy. */
export function catalogIssues(): string[] {
  const issues: string[] = [];
  for (const name of Object.keys(TAXONOMIES) as TaxonomyName[]) {
    const list = TAXONOMIES[name].terms as readonly Term[], keys = new Set<string>(), seen = new Map<string, string>();
    for (const x of list) {
      if (!/^[a-z][a-z0-9_]*$/.test(x.key)) issues.push(`${name}.${x.key}: key must be snake_case`);
      if (keys.has(x.key)) issues.push(`${name}.${x.key}: duplicate key`); keys.add(x.key);
    }
    for (const x of list) {
      if (x.parent && !keys.has(x.parent)) issues.push(`${name}.${x.key}: unknown parent ${x.parent}`);
      if (x.meta?.build && !(TAXONOMIES.build_category.terms as readonly Term[]).some(b => b.key === x.meta!.build)) issues.push(`${name}.${x.key}: unknown build category ${x.meta.build}`);
      for (const s of [x.key, x.label, x.plural, ...(x.aliases ?? [])]) {
        if (!s) continue; const n = normTerm(s), prev = seen.get(n);
        if (prev && prev !== x.key) issues.push(`${name}: "${s}" is ambiguous (${prev} and ${x.key})`); else seen.set(n, x.key);
      }
    }
  }
  for (const [surface, s] of Object.entries(SURFACES) as [string, { taxonomy: TaxonomyName; items: readonly (string | readonly [string, string])[] }][]) {
    const list = TAXONOMIES[s.taxonomy].terms as readonly Term[];
    for (const item of s.items) {
      const [key, wording] = typeof item === "string" ? [item, null] : item;
      if (!list.some(x => x.key === key)) issues.push(`surface ${surface}: unknown ${s.taxonomy} key ${key}`);
      if (wording) { const other = list.find(x => x.key !== key && [x.key, x.label, x.plural, ...(x.aliases ?? [])].some(v => v && normTerm(v) === normTerm(wording))); if (other) issues.push(`surface ${surface}: wording "${wording}" belongs to ${other.key}, not ${key}`); }
    }
  }
  for (const c of COUNTRIES) if (!CURRENCIES.some(x => x.code === c.currency)) issues.push(`country ${c.code}: unknown currency ${c.currency}`);
  for (const z of TIMEZONES) if (!COUNTRIES.some(c => c.code === z.country)) issues.push(`timezone ${z.tz}: unknown country ${z.country}`);
  for (const c of COUNTRIES) if (c.business && !TIMEZONES.some(z => z.country === c.code)) issues.push(`country ${c.code}: no timezone`);
  return issues;
}
