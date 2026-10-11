/** Plan-an-Event (CU-W01) planning model: occasions, categories, benchmarks and budget allocation. Pure functions, no I/O. */
export const OCCASIONS = [
  { key: "wedding", label: "Wedding", img: "type-wedding" }, { key: "birthday", label: "Birthday", img: "type-birthday" },
  { key: "corporate", label: "Corporate", img: "type-corporate" }, { key: "party", label: "Party", img: "type-party" },
  { key: "festival", label: "Festival", img: "type-festival" }, { key: "nightlife", label: "Nightclub", img: "type-nightclub" },
  { key: "private_dinner", label: "Private Dinner", img: "type-private_dinner" }, { key: "childrens_party", label: "Children's Party", img: "type-childrens_party" },
] as const;
export const MORE_OCCASIONS = [{ key: "conference", label: "Conference" }, { key: "awards", label: "Awards" }, { key: "community", label: "Community" }, { key: "food_drink", label: "Food & Drink" }, { key: "comedy", label: "Comedy" }, { key: "custom", label: "Something else" }] as const;
export const MUST_HAVES = [
  { key: "venue", label: "Venue" }, { key: "food", label: "Catering" }, { key: "drinks", label: "Drinks / Bar" },
  { key: "entertainment", label: "Entertainment" }, { key: "media", label: "Photography" }, { key: "styling", label: "Decor & Styling" },
] as const;
export const OPTIONALS = [
  { key: "transport", label: "Transportation" }, { key: "accommodation", label: "Accommodation" }, { key: "security", label: "Security" },
  { key: "staff", label: "Staff" }, { key: "invitations", label: "Invitations" }, { key: "activities", label: "Activities" },
] as const;
export const STYLES = [{ key: "classic", label: "Classic & Elegant" }, { key: "modern", label: "Modern & Minimal" }, { key: "fun", label: "Fun & Colourful" }, { key: "luxury", label: "Luxury / High-End" }, { key: "rustic", label: "Rustic / Outdoors" }, { key: "custom", label: "Custom / Other" }] as const;
export const ACCESS = [{ key: "wheelchair", label: "Wheelchair accessible" }, { key: "hearing", label: "Hearing assistance" }, { key: "dietary", label: "Dietary requirements" }, { key: "quiet", label: "Quiet space" }, { key: "other", label: "Other requirements" }] as const;

/** Per-guest spend benchmarks (GBP, London market) used for the "similar events" range. */
const PER_HEAD: Record<string, [number, number]> = { wedding: [80, 150], birthday: [25, 60], corporate: [45, 110], party: [30, 70], festival: [20, 60], nightlife: [20, 50], private_dinner: [60, 140], childrens_party: [15, 35], conference: [50, 120], awards: [70, 140] };
export function benchmark(type: string, guests: number) {
  const [lo, hi] = PER_HEAD[type] ?? [35, 90]; const g = Math.max(1, guests);
  const r = (n: number) => Math.round(n / 500) * 500;
  return { min: r(lo * g), max: r(hi * g), tier: "Mid-range" };
}
/** Default share of budget per category by occasion; normalised over the chosen categories. */
const SHARE: Record<string, Record<string, number>> = {
  wedding: { venue: 35, food: 25, drinks: 15, entertainment: 10, styling: 8, media: 7 },
  corporate: { venue: 40, food: 30, drinks: 10, production: 12, media: 8 },
  festival: { venue: 25, entertainment: 35, production: 20, staff: 10, food: 10 },
  childrens_party: { venue: 30, entertainment: 35, food: 25, extras: 10 },
};
const BASE: Record<string, number> = { venue: 35, food: 25, drinks: 12, entertainment: 12, media: 7, styling: 7, transport: 4, accommodation: 6, security: 4, staff: 5, invitations: 2, activities: 4 };
export function allocate(type: string, budget: number, cats: string[]) {
  const table = { ...BASE, ...(SHARE[type] ?? {}) };
  const chosen = cats.length ? cats : ["venue", "food", "drinks", "entertainment"];
  const weights = chosen.map(c => table[c] ?? 4); const total = weights.reduce((a, b) => a + b, 0);
  const rows = chosen.map((c, i) => { const pct = Math.round((weights[i]! / total) * 100); const mid = budget * pct / 100; return { key: c, pct, amount: Math.round(mid / 50) * 50, min: Math.round(mid * 0.8 / 100) * 100, max: Math.round(mid * 1.25 / 100) * 100 }; });
  const drift = 100 - rows.reduce((a, r) => a + r.pct, 0); if (rows[0]) rows[0].pct += drift;
  return rows;
}
export const labelOf = (k: string) => [...MUST_HAVES, ...OPTIONALS].find(c => c.key === k)?.label ?? k;
/** Build category used when the plan creates build items (accommodation/invitations/activities live under transport/extras). */
export const buildCat = (k: string) => ({ accommodation: "transport", security: "staff", invitations: "extras", activities: "extras" } as Record<string, string>)[k] ?? k;
export const occasionLabel = (k: string) => [...OCCASIONS, ...MORE_OCCASIONS].find(o => o.key === k)?.label ?? "Event";
export const occasionPitch: Record<string, string> = {
  wedding: "We'll help you find the perfect venue, suppliers and create a timeline — from ceremony to celebration.",
  birthday: "From the venue to the cake, we'll line up everything for a birthday to remember.",
  corporate: "Venues, catering and AV that fit your brief, your headcount and your budget.",
  party: "Find the right space, sound and drinks, and keep everything in one place.",
  festival: "Plan sites, line-ups, production and staffing — and sell tickets when you're ready.",
  nightlife: "Book the club night essentials: venue, DJs, sound, security and guest list.",
  private_dinner: "An intimate dinner with the right room, menu and atmosphere.",
  childrens_party: "Safe, fun and stress-free — age-suitable entertainers, food and supervision.",
};
/** Accepts category keys or their labels (older events store labels) and returns known keys. */
export function normaliseCats(list: string[] | null | undefined) {
  const all = [...MUST_HAVES, ...OPTIONALS];
  return [...new Set((list ?? []).map(v => all.find(c => c.key === v || c.label.toLowerCase() === v.toLowerCase() || c.label.toLowerCase().startsWith(v.toLowerCase().split(/[ /&]/)[0]!))?.key).filter((k): k is NonNullable<typeof k> => !!k))];
}
/** Neighbourhood from a free-text address: skips street lines (leading numbers), postcodes and the city itself. */
export function areaOf(location: string, city: string) {
  const parts = location.split(",").map(p => p.trim()).filter(Boolean);
  return parts.find(p => !/^\d/.test(p) && !/^[A-Z]{1,2}\d/.test(p) && p.toLowerCase() !== city.toLowerCase() && !/^(uk|united kingdom|england)$/i.test(p)) ?? "";
}
