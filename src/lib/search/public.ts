import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { VersionedCache } from "@/lib/cache/versioned";

/**
 * Public search service (Q06). Calls the service-only `public_search` / `public_autocomplete` functions (organic results only,
 * live public predicate re-checked in SQL) through a versioned cache invalidated by `cache_versions('search:public')`.
 * Sponsored placements are a separate concern (Q23 `serve_ad_slots`) and are never merged into these results.
 */
const db = () => untyped(createAdminClient() as never);
const cache = new VersionedCache(async scope => {
  const { data, error } = await db().rpc("cache_version", { p_scope: scope });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}, { ttlMs: 60_000, versionTtlMs: 0, max: 400 });   // version re-read on every request: a record made private is never served from cache

export const SEARCH_TYPES = ["event", "venue", "service", "organizer", "provider"] as const;
export type SearchParams = { q: string; types: string[] | null; lat: number | null; lng: number | null; radiusKm: number | null; limit: number; offset: number };

export function parseSearchParams(u: URL): SearchParams | { error: string } {
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
  const types = (u.searchParams.get("type") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (types.some(t => !(SEARCH_TYPES as readonly string[]).includes(t))) return { error: "Unknown type." };
  const num = (k: string, min: number, max: number) => { const v = u.searchParams.get(k); if (v === null || v === "") return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : NaN; };
  const lat = num("lat", -90, 90), lng = num("lng", -180, 180), radiusKm = num("radius_km", 1, 500);
  if ([lat, lng, radiusKm].some(n => Number.isNaN(n))) return { error: "Invalid location filter." };
  if ((lat === null) !== (lng === null)) return { error: "lat and lng go together." };
  const limit = Math.min(50, Math.max(1, Number(u.searchParams.get("limit") ?? 20) || 20)), offset = Math.min(1000, Math.max(0, Number(u.searchParams.get("offset") ?? 0) || 0));
  return { q, types: types.length ? types : null, lat, lng, radiusKm: radiusKm === null ? null : Math.round(radiusKm), limit, offset };
}

export async function publicSearch(p: SearchParams) {
  const key = JSON.stringify(p);
  return cache.get("search:public", `s:${key}`, async () => {
    const { data, error } = await db().rpc("public_search", { p_q: p.q, p_types: p.types, p_lat: p.lat, p_lng: p.lng, p_radius_km: p.radiusKm, p_limit: p.limit, p_offset: p.offset });
    if (error) throw new Error(error.message);
    return (data ?? []) as { doc_type: string; doc_id: string; title: string; subtitle: string; link: string; image: string | null; city: string | null; category: string | null;
      starts_at: string | null; price_from: number | null; distance_km: number | null; score: number }[];
  });
}

export async function publicAutocomplete(prefix: string) {
  const p = prefix.trim().toLowerCase().slice(0, 60);
  return cache.get("search:public", `a:${p}`, async () => {
    const { data, error } = await db().rpc("public_autocomplete", { p_prefix: p, p_limit: 8 });
    if (error) throw new Error(error.message);
    return (data ?? []) as { label: string; kind: string; link: string | null }[];
  });
}

// ── Q09 marketplace search (organic ranking; reasons are internal only) and Q09/W01 category/location discovery ─────────────────
/** One ranking reason: feature value 0–1, model weight and its share of the 0–100 score. Sponsorship is never a feature. */
export type RankingReason = { feature: "text" | "distance" | "availability" | "reliability" | "rating" | "response" | "budget"; value: number; weight: number; contribution: number; text: string };
export type MarketplaceHit = { listing_id: string; kind: "venue" | "service"; name: string; category: string; build_category: string | null; city: string; location: string; image: string;
  slug: string | null; price_from: number | null; price_unit: string; estimate_minor: number | null; capacity_max: number | null; verified: boolean; instant_book: boolean;
  rating: number; review_count: number; response_hours: number | null; distance_km: number | null; availability: "available" | "limited" | "unavailable" | "unknown";
  reliability_band: string; packages: { package_id: string; name: string; price_basis: string; price_minor: number; min_guests: number | null; max_guests: number | null }[];
};
/** Internal explainability only (organizer/provider workspace with marketplace access, or platform admin): never public/customer. */
export type ExplainedMarketplaceHit = MarketplaceHit & { score: number; model_version: number; ranking_reasons: RankingReason[] };
/** Public/customer shape: ordered organic results without scores, reasons, model version or feature values. */
export type MarketplaceResult = { total: number; limit: number; offset: number; results: MarketplaceHit[]; organic_only: true; filters: Record<string, unknown> };
export type ExplainedMarketplaceResult = Omit<MarketplaceResult, "results"> & { model_version: number; results: ExplainedMarketplaceHit[]; excluded_inputs: string[]; explained: true };
export type MarketplaceParams = Record<string, string | number | boolean | null>;

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
export function parseMarketplaceParams(u: URL): MarketplaceParams | { error: string } {
  const s = (k: string, max = 80) => { const v = (u.searchParams.get(k) ?? "").trim(); return v ? v.slice(0, max) : null; };
  const n = (k: string, min: number, max: number) => { const v = u.searchParams.get(k); if (v === null || v === "") return null; const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : NaN; };
  const b = (k: string) => ["1", "true", "yes"].includes((u.searchParams.get(k) ?? "").toLowerCase()) || null;
  const kind = s("kind"); if (kind && !["venue", "service"].includes(kind)) return { error: "kind must be venue or service." };
  const availability = s("availability") ?? "rank"; if (!["rank", "exclude"].includes(availability)) return { error: "availability must be rank or exclude." };
  const date = s("date"); let starts = s("starts_at"), ends = s("ends_at");
  if (date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "date must be YYYY-MM-DD." }; starts ??= `${date}T09:00:00Z`; ends ??= `${date}T23:00:00Z`; }
  if ((starts && !ISO.test(starts)) || (ends && !ISO.test(ends))) return { error: "Invalid date window." };
  const nums = { lat: n("lat", -90, 90), lng: n("lng", -180, 180), radius_km: n("radius_km", 1, 500), guests: n("guests", 1, 100000), min_price: n("min_price", 0, 1e8), max_price: n("max_price", 0, 1e8), budget: n("budget", 0, 1e8), limit: n("limit", 1, 50), offset: n("offset", 0, 1000) };
  if (Object.values(nums).some(x => Number.isNaN(x))) return { error: "Invalid numeric filter." };
  if ((nums.lat === null) !== (nums.lng === null)) return { error: "lat and lng go together." };
  return { q: s("q", 120), kind, category: s("category", 40), city: s("city", 60), starts_at: starts, ends_at: ends, availability, verified: b("verified"), instant_book: b("instant"), has_package: b("package"), ...nums };
}

/** Organic marketplace ranking, lean public shape (not cached: availability changes with every booking). */
export async function marketplaceSearch(p: MarketplaceParams): Promise<MarketplaceResult> {
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
  const { data, error } = await db().rpc("marketplace_search", { p: clean });
  if (error) throw new Error(error.message);
  // Defence in depth: the database already returns the lean shape; never pass internal ranking fields through.
  const { model_version: _m, excluded_inputs: _x, ...rest } = data as MarketplaceResult & { model_version?: unknown; excluded_inputs?: unknown };
  void _m; void _x;
  return { ...rest, results: (rest.results ?? []).map(h => { const { score: _s, ranking_reasons: _r, model_version: _v, ...hit } = h as ExplainedMarketplaceHit; void _s; void _r; void _v; return hit; }) };
}

export type DiscoverResult = { city: string | null; category: string | null; total: number; organic_only: true;
  results: { doc_type: string; doc_id: string; title: string; subtitle: string; link: string; image: string | null; city: string | null; category: string | null; starts_at: string | null; price_from: number | null; rating: number | null }[];
  facets: { doc_type: string; category: string; count: number }[] };
/** Public category/location discovery (e.g. /events/london, /events/london/music) through the versioned search cache. */
export async function publicDiscover(p: { city: string | null; category: string | null; types: string[] | null; from: string | null; to: string | null; limit: number; offset: number }) {
  return cache.get("search:public", `d:${JSON.stringify(p)}`, async () => {
    const { data, error } = await db().rpc("public_discover", { p_city: p.city, p_category: p.category, p_types: p.types, p_from: p.from, p_to: p.to, p_limit: p.limit, p_offset: p.offset });
    if (error) throw new Error(error.message);
    return data as DiscoverResult;
  });
}
