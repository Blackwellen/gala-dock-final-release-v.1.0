import type {
  MissingDocumentEntry,
  OutreachStatus,
  RfqRecord,
  RfqStatus,
  RiskLevel,
  SupplierArchiveInfo,
  SupplierDocuments,
  SupplierPauseInfo,
  SupplierRecord,
  SupplierStatus,
  SupplierTier,
} from "./types";

/**
 * Deterministic UK events-industry demo dataset.
 *
 * No `Math.random()` / `Date.now()` — every value is derived from a fixed
 * anchor date and simple index/character-code arithmetic so the seed is
 * reproducible across renders and environments. Every KPI, tab count and
 * insight-rail number in the Suppliers/RFQs UI is computed live from these
 * two arrays (see kpis.ts) — screens never hardcode a duplicate total.
 *
 * The reference images this build matches (`working_imagesS_suppliers/`)
 * carry inconsistent totals between screens (e.g. 428/312 "active" on one
 * screen vs 248/186 on another). Per the build brief that inconsistency is
 * intentionally not reproduced — see docs/design-reference/supplier-section-image-map.md.
 */

// Anchor "today" so every relative date ("N days ago", "in N days") in the
// UI stays consistent with the workspace's demo calendar.
export const ANCHOR_DATE = new Date("2026-07-10T09:00:00Z");

function daysFromAnchor(offset: number): string {
  const d = new Date(ANCHOR_DATE);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return h;
}

function initials(name: string): string {
  const words = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "S";
  const second = words[1]?.[0] ?? words[0]?.[1] ?? "U";
  return (first + second).toUpperCase();
}

const LOGO_COLORS = [
  "bg-brand-500",
  "bg-violet-500",
  "bg-info-500",
  "bg-success-500",
  "bg-warning-500",
  "bg-danger-500",
  "bg-brand-700",
  "bg-violet-700",
];

const REGION_POOL = [
  "London",
  "South East",
  "South West",
  "Midlands",
  "North West",
  "North East",
  "Yorkshire",
  "Scotland",
  "Wales",
  "Nationwide",
];

const DOC_TYPES = [
  "Public Liability Insurance",
  "Risk Assessment",
  "PAT Testing Certificate",
  "DBS Check",
  "Food Hygiene Certificate",
  "Method Statement",
  "Employer's Liability Insurance",
  "Fire Safety Certificate",
];

const FIRST_NAMES = [
  "Olivia", "James", "Amelia", "Harry", "Isla", "George", "Freya", "Oscar",
  "Grace", "Leo", "Sofia", "Jack", "Ruby", "Noah", "Ella", "Charlie",
];
const LAST_NAMES = [
  "Bennett", "Carter", "Hughes", "Patel", "Morgan", "Whitfield", "Osei",
  "Novak", "Reid", "Fletcher", "Doyle", "Marsh", "Okafor", "Sinclair",
];

function contactFor(name: string, i: number): { name: string; email: string; phone: string } {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
  const domain = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14) || "supplier";
  return {
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}.co.uk`,
    phone: `07${String(700000000 + nameHash(name) * 37).slice(0, 9)}`,
  };
}

const EVENT_CATEGORY_POOL = [
  "Weddings", "Corporate", "Festivals", "Private Parties", "Conferences",
  "Product Launches", "Theatre & Live", "Nightlife",
];

interface SeedEntry {
  name: string;
  category: string;
  status: SupplierStatus;
  tier?: SupplierTier;
  regions?: string[];
  missingDocs?: boolean;
  recentlyUsed?: boolean;
}

const PAUSE_STORY: Record<string, { reason: string; detail: string; notes: string }> = {
  "360 Vision UK": { reason: "Compliance Hold", detail: "Insurance certificate expired, awaiting renewal", notes: "Chased 4 Jul — renewal document expected within the week." },
  "Pixel & Light Ltd": { reason: "Quality Issue", detail: "Below-standard delivery on last two bookings", notes: "Ops flagged colour-grading quality on June wedding job." },
  "Momentum Crew": { reason: "Capacity", detail: "At full booking capacity through peak season", notes: "Will reopen bookings after August bank holiday." },
  "Urban Storage Co.": { reason: "Pricing Review", detail: "Renegotiating rate card for next season", notes: "Awaiting revised quote from account manager." },
  "Move It Logistics": { reason: "Under Review", detail: "Flagged for review following client feedback", notes: "Two late-delivery complaints logged in June." },
  "Soundwave Events": { reason: "Seasonal", detail: "Supplier on seasonal downtime until spring", notes: "Owner confirmed return date of March next year." },
  "Green Screen FX": { reason: "Compliance Hold", detail: "PAT testing certificate lapsed", notes: "Requested updated certificate 28 Jun." },
  "ProTent Structures": { reason: "Capacity", detail: "Structure stock fully allocated for summer season", notes: "Next available slot confirmed for September." },
  "Cater+Co": { reason: "Quality Issue", detail: "Food hygiene rating dropped to 3 stars", notes: "Awaiting re-inspection result before reactivation." },
  "Aerial Capture UK": { reason: "Compliance Hold", detail: "Drone operator licence renewal in progress", notes: "CAA renewal submitted, pending approval." },
  "Loop Crew Solutions": { reason: "Under Review", detail: "Staffing shortfall reported on two recent jobs", notes: "Management call scheduled for next week." },
  "Festi Supply Co.": { reason: "Seasonal", detail: "Festival-season only supplier, off-season now", notes: "Auto-reactivates 1 April next year." },
};

const ARCHIVE_STORY: Record<string, { reason: string; detail: string; canBeRestored: boolean }> = {
  "Harborview Marquees": { reason: "Business Closed", detail: "Supplier ceased trading in May", canBeRestored: false },
  "Northside Staffing Solutions": { reason: "Underperformance", detail: "Consistently missed SLAs across three events", canBeRestored: true },
  "Farringdon Valet Parking": { reason: "No Longer Required", detail: "Category no longer used by this workspace", canBeRestored: true },
  "Thameside Transport": { reason: "Relationship Ended", detail: "Contract not renewed after annual review", canBeRestored: true },
  "Redwood Carpentry & Build": { reason: "Duplicate Record", detail: "Merged into Camden Stage & Rigging profile", canBeRestored: false },
  "Chalk Farm Florists": { reason: "Non-Compliance", detail: "Failed to provide required certification", canBeRestored: true },
  "Northern Lights Photobooths": { reason: "Business Closed", detail: "Company dissolved per Companies House filing", canBeRestored: false },
  "Elmwood Generator Hire": { reason: "Relationship Ended", detail: "Switched to a nationwide framework supplier", canBeRestored: true },
};

const SEED: SeedEntry[] = [
  { name: "Apex AV Productions", category: "AV & Production", status: "active", tier: "premium", recentlyUsed: true },
  { name: "Lux Lighting Design", category: "Lighting Design", status: "active", tier: "preferred", recentlyUsed: true },
  { name: "Secure Event Services", category: "Security", status: "active", tier: "verified" },
  { name: "Bloom Floral & Decor", category: "Floral & Decor", status: "active", tier: "preferred", recentlyUsed: true },
  { name: "Taste Collective Catering", category: "Catering", status: "active", tier: "premium", recentlyUsed: true },
  { name: "Moments Photography", category: "Photography", status: "active", tier: "verified", recentlyUsed: true },
  { name: "Vivid Videography", category: "Videography", status: "active", tier: "preferred" },
  { name: "Sonic DJ Collective", category: "DJ & Entertainment", status: "active", tier: "verified", recentlyUsed: true },
  { name: "StagePro Structures", category: "Structures & Staging", status: "active", tier: "premium" },
  { name: "Streamline AV", category: "AV & Production", status: "active", tier: "verified", recentlyUsed: true },

  { name: "360 Vision UK", category: "Videography", status: "paused" },
  { name: "Pixel & Light Ltd", category: "Photography", status: "paused" },
  { name: "Momentum Crew", category: "Staffing", status: "paused" },
  { name: "Urban Storage Co.", category: "Storage & Logistics", status: "paused" },
  { name: "Move It Logistics", category: "Transport", status: "paused" },
  { name: "Soundwave Events", category: "AV & Production", status: "paused" },
  { name: "Green Screen FX", category: "Videography", status: "paused" },
  { name: "ProTent Structures", category: "Marquees & Structures", status: "paused" },
  { name: "Cater+Co", category: "Catering", status: "paused" },
  { name: "Aerial Capture UK", category: "Photography", status: "paused" },
  { name: "Loop Crew Solutions", category: "Staffing", status: "paused" },
  { name: "Festi Supply Co.", category: "Structures & Staging", status: "paused" },

  { name: "Harborview Marquees", category: "Marquees & Structures", status: "archived" },
  { name: "Kingfisher Catering Co.", category: "Catering", status: "active", tier: "verified", missingDocs: true },
  { name: "Velvet Rope Security", category: "Security", status: "active", missingDocs: true },
  { name: "Northside Staffing Solutions", category: "Staffing", status: "archived" },
  { name: "Crestline Furniture Hire", category: "Furniture Hire", status: "active" },
  { name: "Willowmere Florals", category: "Floral & Decor", status: "active", tier: "verified" },
  { name: "Beacon Sound & Light", category: "AV & Production", status: "active", missingDocs: true, recentlyUsed: true },
  { name: "Cobalt Print & Signage", category: "Print & Signage", status: "active" },
  { name: "Farringdon Valet Parking", category: "Transport", status: "archived" },
  { name: "Silverline Cleaning Services", category: "Cleaning Services", status: "active" },
  { name: "Oakhurst Marquee Hire", category: "Marquees & Structures", status: "active", missingDocs: true },
  { name: "Thameside Transport", category: "Transport", status: "archived" },
  { name: "Meridian Event Staffing", category: "Staffing", status: "active", missingDocs: true, recentlyUsed: true },
  { name: "Aurora Ice Sculptures", category: "Styling & Design", status: "active" },
  { name: "Redwood Carpentry & Build", category: "Structures & Staging", status: "archived" },
  { name: "Highgate Chauffeur Cars", category: "Transport", status: "active" },
  { name: "Pemberton Bar Services", category: "Bar Services", status: "active", tier: "preferred", recentlyUsed: true },
  { name: "Chalk Farm Florists", category: "Floral & Decor", status: "archived" },
  { name: "Kensington Linen Hire", category: "Furniture Hire", status: "active", missingDocs: true },
  { name: "Granite Security Group", category: "Security", status: "active", missingDocs: true },
  { name: "Sable & Co. Catering", category: "Catering", status: "active", tier: "preferred", recentlyUsed: true },
  { name: "Northern Lights Photobooths", category: "Photobooths", status: "archived" },
  { name: "Ivyhouse Event Styling", category: "Styling & Design", status: "active", missingDocs: true },
  { name: "Camden Stage & Rigging", category: "Structures & Staging", status: "active", tier: "verified", recentlyUsed: true },
  { name: "Portland Waste & Recycling", category: "Cleaning Services", status: "active", missingDocs: true },
  { name: "Elmwood Generator Hire", category: "AV & Production", status: "archived" },
  { name: "Fenwick Ice & Beverage", category: "Bar Services", status: "active" },
  { name: "Solstice Fireworks & FX", category: "Pyrotechnics & FX", status: "active", tier: "premium", missingDocs: true },
];

function riskFor(i: number): RiskLevel {
  const m = i % 3;
  return m === 0 ? "high" : m === 1 ? "medium" : "low";
}

function outreachFor(i: number): OutreachStatus {
  const cycle: OutreachStatus[] = ["chaser-sent", "awaiting-response", "escalated", "not-contacted", "responded"];
  return cycle[i % cycle.length];
}

function documentsFor(i: number, missingDocs: boolean): SupplierDocuments {
  const required = 5;
  if (!missingDocs) return { required, approved: required, missingTypes: [] };
  const missingCount = 1 + (i % 3); // 1-3 missing
  const missingTypes = Array.from({ length: missingCount }, (_, k) => DOC_TYPES[(i + k) % DOC_TYPES.length]);
  return { required, approved: required - missingCount, missingTypes };
}

function missingDocEntriesFor(i: number, docs: SupplierDocuments): MissingDocumentEntry[] {
  return docs.missingTypes.map((type, k) => {
    const overdue = (i + k) % 2 === 0;
    const dueDate = overdue ? daysFromAnchor(-(4 + ((i + k) % 20))) : daysFromAnchor(3 + ((i + k) % 27));
    return { type, dueDate, overdue };
  });
}

function buildSupplier(entry: SeedEntry, i: number): SupplierRecord {
  const hash = nameHash(entry.name);
  const rating = Math.round((3.6 + (hash % 14) * 0.1) * 10) / 10;
  const regions = entry.regions ?? [
    REGION_POOL[hash % REGION_POOL.length],
    REGION_POOL[(hash + 3) % REGION_POOL.length],
  ];
  const status = entry.status;
  const missingDocs = !!entry.missingDocs;
  const documents = documentsFor(i, missingDocs);
  const insuranceOffset = missingDocs ? -(6 + (i % 25)) : 14 + (hash % 300);
  const insuranceExpiryDate = status === "archived" ? null : daysFromAnchor(insuranceOffset);
  const responseRatePct = 62 + (hash % 34); // 62-95
  const responseTrend = Array.from({ length: 8 }, (_, k) => {
    const v = responseRatePct - 12 + ((hash + k * 7) % 24);
    return Math.max(20, Math.min(100, v));
  });
  const onboardingPct = i % 11 === 3 ? 74 : i % 13 === 7 ? 88 : 100;
  const lastBookedOffset = -(3 + (hash % 220));
  const lastBookedDate = daysFromAnchor(lastBookedOffset);
  const recentlyUsedAt = entry.recentlyUsed && status === "active" ? daysFromAnchor(-(2 + (hash % 40))) : null;
  const complianceScore = missingDocs ? 40 + (hash % 35) : 78 + (hash % 22);
  const performanceScore = 60 + (hash % 39);
  const performanceLabel: SupplierRecord["performanceLabel"] =
    performanceScore >= 90 ? "Excellent" : performanceScore >= 78 ? "Very Good" : performanceScore >= 65 ? "Good" : "Fair";
  const upcomingBookingsCount = status === "active" ? hash % 6 : 0;
  const nextBookingDate = upcomingBookingsCount > 0 ? daysFromAnchor(4 + (hash % 60)) : null;
  const recentSpend90d = status === "archived" ? 0 : 800 + (hash % 42) * 215;
  const eventCategories = [
    EVENT_CATEGORY_POOL[hash % EVENT_CATEGORY_POOL.length],
    EVENT_CATEGORY_POOL[(hash + 2) % EVENT_CATEGORY_POOL.length],
  ];
  const lastEventUsed =
    status === "archived"
      ? null
      : {
          name: `${eventCategories[0]} — ${["The Grand Pavilion", "Old Billingsgate", "The Shard Vantage Point", "Kew Gardens", "Manchester Central", "The Roundhouse"][hash % 6]}`,
          location: regions[0],
          date: lastBookedDate,
          category: entry.category,
        };

  let pause: SupplierPauseInfo | null = null;
  if (status === "paused") {
    const story = PAUSE_STORY[entry.name];
    pause = {
      reason: story?.reason ?? "Under Review",
      reasonDetail: story?.detail ?? "Flagged for internal review",
      pausedAt: daysFromAnchor(-(10 + (hash % 90))),
      notes: story?.notes ?? "Under internal review by the supplier team.",
    };
  }

  let archive: SupplierArchiveInfo | null = null;
  if (status === "archived") {
    const story = ARCHIVE_STORY[entry.name];
    const archivedAt = daysFromAnchor(-(30 + (hash % 240)));
    archive = {
      reason: story?.reason ?? "Relationship Ended",
      reasonDetail: story?.detail ?? "Contract not renewed",
      archivedAt,
      archivedBy: { name: FIRST_NAMES[i % FIRST_NAMES.length] + " " + LAST_NAMES[(i + 5) % LAST_NAMES.length], role: i % 3 === 0 ? "Operations Manager" : i % 3 === 1 ? "Workspace Owner" : "Supplier Lead" },
      canBeRestored: story?.canBeRestored ?? true,
      retentionUntil: daysFromAnchor(365 * 6 - (hash % 900)),
      lastActivityAt: daysFromAnchor(-(45 + (hash % 260))),
    };
  }

  const atRiskContractValue = missingDocs ? 1800 + (hash % 60) * 145 : 0;

  return {
    id: `sup-${String(i + 1).padStart(3, "0")}`,
    name: entry.name,
    logoInitials: initials(entry.name),
    logoColor: LOGO_COLORS[i % LOGO_COLORS.length],
    rating: Math.min(4.9, rating),
    tier: entry.tier ?? null,
    primaryContact: contactFor(entry.name, i),
    category: entry.category,
    coverageRegions: regions,
    status,
    onboardingPct: status === "paused" || status === "active" ? onboardingPct : 100,
    documents,
    insuranceExpiryDate,
    responseRatePct,
    responseTrend,
    isStarred: hash % 7 === 0,
    lastBookedDate: status === "archived" ? archive?.lastActivityAt ?? null : lastBookedDate,
    recentlyUsedAt,
    pause,
    archive,
    complianceScore: Math.min(100, complianceScore),
    riskLevel: riskFor(i),
    missingDocuments: missingDocEntriesFor(i, documents),
    outreachStatus: missingDocs ? outreachFor(i) : "responded",
    lastContactAt: daysFromAnchor(-(1 + (hash % 30))),
    upcomingBookingsCount,
    nextBookingDate,
    recentSpend90d,
    performanceScore,
    performanceLabel,
    eventCategories,
    lastEventUsed,
    atRiskContractValue,
  };
}

export const SUPPLIERS: SupplierRecord[] = SEED.map(buildSupplier);

/* ─── RFQs ────────────────────────────────────────────────────────────── */

interface RfqSeedEntry {
  title: string;
  eventName: string;
  location: string;
  category: string;
  status: RfqStatus;
}

const RFQ_SEED: RfqSeedEntry[] = [
  { title: "AV & Staging Supply", eventName: "Elegant Garden Wedding", location: "Surrey", category: "AV & Production", status: "awarded" },
  { title: "Catering for 120 Guests", eventName: "Private Birthday Party", location: "London", category: "Catering", status: "responses-received" },
  { title: "Full Conference AV Package", eventName: "Annual Sales Conference", location: "Birmingham", category: "AV & Production", status: "under-review" },
  { title: "Livestream Production", eventName: "Product Launch Webinar", location: "Manchester", category: "Videography", status: "sent" },
  { title: "Security & Door Staff", eventName: "VIP Nightclub Event", location: "London", category: "Security", status: "awarded" },
  { title: "Stage & Structures Hire", eventName: "Summer Music Festival", location: "Leeds", category: "Structures & Staging", status: "responses-received" },
  { title: "Lighting Design Package", eventName: "West End Theatre Show", location: "London", category: "Lighting Design", status: "closed" },
  { title: "Sound Engineering", eventName: "Live Band Gig", location: "Bristol", category: "AV & Production", status: "sent" },
  { title: "Floral & Decor Installation", eventName: "Luxury Asian Wedding", location: "Hertfordshire", category: "Floral & Decor", status: "under-review" },
  { title: "Offsite Venue Catering", eventName: "Leadership Offsite", location: "Oxfordshire", category: "Catering", status: "draft" },
  { title: "Photography Cover", eventName: "Elegant Garden Wedding", location: "Surrey", category: "Photography", status: "awarded" },
  { title: "DJ & Entertainment", eventName: "Private Birthday Party", location: "London", category: "DJ & Entertainment", status: "responses-received" },
  { title: "Marquee & Furniture Hire", eventName: "Summer Music Festival", location: "Leeds", category: "Marquees & Structures", status: "sent" },
  { title: "Bar Service Package", eventName: "VIP Nightclub Event", location: "London", category: "Bar Services", status: "draft" },
  { title: "Transport & Logistics", eventName: "Annual Sales Conference", location: "Birmingham", category: "Transport", status: "closed" },
  { title: "Staffing — Front of House", eventName: "Product Launch Webinar", location: "Manchester", category: "Staffing", status: "under-review" },
  { title: "Cleaning & Turnaround Crew", eventName: "Summer Music Festival", location: "Leeds", category: "Cleaning Services", status: "sent" },
  { title: "Fireworks Finale", eventName: "Luxury Asian Wedding", location: "Hertfordshire", category: "Pyrotechnics & FX", status: "responses-received" },
];

function rfqBuild(entry: RfqSeedEntry, i: number): RfqRecord {
  const hash = nameHash(entry.title + entry.eventName);
  const suppliersInvited = 4 + (hash % 8);
  const respondedFraction = entry.status === "draft" ? 0 : entry.status === "sent" ? 0.2 + ((hash % 3) * 0.1) : 0.5 + ((hash % 4) * 0.12);
  const responses = Math.min(suppliersInvited, Math.round(suppliersInvited * respondedFraction));
  const quoteRangeLow = 900 + (hash % 30) * 180;
  const quoteRangeHigh = quoteRangeLow + 600 + (hash % 20) * 220;
  const dueOffset = entry.status === "closed" || entry.status === "awarded" ? -(4 + (hash % 40)) : 2 + (hash % 21) - 8;
  const dueDate = daysFromAnchor(dueOffset);
  const createdAt = daysFromAnchor(dueOffset - (14 + (hash % 20)));
  const awardedSupplierName =
    entry.status === "awarded"
      ? SUPPLIERS.filter((s) => s.category === entry.category && s.status === "active")[hash % 4]?.name ??
        SUPPLIERS[hash % SUPPLIERS.length].name
      : null;

  return {
    id: `rfq-${String(i + 1).padStart(3, "0")}`,
    code: `RFQ-2026-${String(14 + i).padStart(3, "0")}`,
    title: entry.title,
    event: { name: entry.eventName, date: daysFromAnchor(dueOffset + 10 + (hash % 30)), location: entry.location },
    category: entry.category,
    suppliersInvited,
    responses,
    quoteRangeLow,
    quoteRangeHigh,
    dueDate,
    status: entry.status,
    awardedSupplierName,
    createdAt,
  };
}

export const RFQS: RfqRecord[] = RFQ_SEED.map(rfqBuild);
