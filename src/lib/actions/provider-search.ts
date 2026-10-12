"use server";
import { z } from "zod";
import { getCustomer } from "@/lib/data/context";
import { buildCategoryOf } from "@/lib/build-categories";
import { listingHref } from "@/lib/links";

// Provider search for "Add to your event": the marketplace filtered by category and by what this event needs —
// availability on the event date, capacity for the guest count, price, rating, location and booking options.
export type ProviderFilters = { q?: string; sort?: "recommended" | "rating" | "price_low" | "price_high" | "reviews" | "response"; maxPrice?: number | null; minRating?: number | null;
  verified?: boolean; instantBook?: boolean; fitsGuests?: boolean; availableOnly?: boolean; nearEvent?: boolean; page?: number };
export type ProviderHit = { id: string; name: string; kind: string; category: string; image: string; city: string; location: string; rating: number; review_count: number;
  price_from: number | null; price_unit: string; capacity_min: number | null; capacity_max: number | null; response_hours: number | null; verified: boolean; instant_book: boolean;
  badge: string | null; tags: string[]; href: string; availability: "available" | "limited" | "unavailable" | "unknown"; added: boolean; estimate: number | null; tooSmall: boolean };
export type ProviderSearch = { hits: ProviderHit[]; total: number; event: { date: string | null; guests: number; city: string }; more: boolean };

const PAGE = 12;
const COLS = "id,name,kind,category,city,location,image,price_from,price_unit,capacity_min,capacity_max,rating,review_count,response_hours,verified,instant_book,badge,tags,slug,sponsored,paused_at";
type Row = Omit<ProviderHit, "href" | "availability" | "added" | "estimate" | "tooSmall"> & { slug: string | null; sponsored: boolean; paused_at: string | null };

export async function searchProviders(eventId: string, category: string, f: ProviderFilters = {}): Promise<{ ok: true; data: ProviderSearch } | { ok: false; error: string }> {
  const id = z.string().uuid().safeParse(eventId); if (!id.success) return { ok: false, error: "Event not found." };
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,starts_at,ends_at,guest_count,city").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const term = String(f.q ?? "").replace(/[%_,()]/g, " ").trim().slice(0, 60);
  let q = ctx.supabase.from("listings").select(COLS).eq("published", true).is("paused_at", null).limit(300);
  q = category === "venue" ? q.eq("kind", "venue") : q.neq("kind", "venue");
  if (term) q = q.or(`name.ilike.%${term}%,category.ilike.%${term}%,location.ilike.%${term}%,city.ilike.%${term}%,description.ilike.%${term}%`);
  if (f.maxPrice) q = q.lte("price_from", f.maxPrice);
  if (f.minRating) q = q.gte("rating", f.minRating);
  if (f.verified) q = q.eq("verified", true);
  if (f.instantBook) q = q.eq("instant_book", true);
  if (f.nearEvent && e.city) q = q.ilike("city", `%${e.city}%`);
  const { data, error } = await q;
  if (error) return { ok: false, error: "Couldn’t load providers — try again." };
  const guests = Math.max(0, Number(e.guest_count ?? 0));
  let rows = ((data ?? []) as unknown as Row[]).filter(l => category === "venue" || buildCategoryOf(l.kind, l.category) === category);
  if (f.fitsGuests && guests && category === "venue") rows = rows.filter(l => !l.capacity_max || l.capacity_max >= guests);
  const { data: inBuild } = await ctx.supabase.from("build_items").select("listing_id").eq("event_id", e.id).not("status", "in", "(cancelled,declined,expired)");
  const added = new Set((inBuild ?? []).map(b => b.listing_id));
  const per = (l: Row) => /guest|person/.test(l.price_unit ?? "");
  const estimate = (l: Row) => (l.price_from == null ? null : per(l) ? Number(l.price_from) * Math.max(1, guests) : Number(l.price_from));
  const score = (l: Row) => (l.sponsored ? 0.3 : 0) + Number(l.rating ?? 0) + Math.log10(1 + Number(l.review_count ?? 0)) + (l.verified ? 0.4 : 0) + (l.instant_book ? 0.2 : 0)
    + (e.city && (l.city ?? "").toLowerCase().includes(String(e.city).toLowerCase()) ? 0.6 : 0);
  const sorters: Record<string, (a: Row, b: Row) => number> = {
    recommended: (a, b) => score(b) - score(a), rating: (a, b) => Number(b.rating) - Number(a.rating) || b.review_count - a.review_count, reviews: (a, b) => b.review_count - a.review_count,
    price_low: (a, b) => (estimate(a) ?? Infinity) - (estimate(b) ?? Infinity), price_high: (a, b) => (estimate(b) ?? -1) - (estimate(a) ?? -1),
    response: (a, b) => (a.response_hours ?? 999) - (b.response_hours ?? 999) };
  rows.sort(sorters[f.sort ?? "recommended"] ?? sorters.recommended);
  // Availability on the event date (the provider's calendar, holds and blocks). Checked for what's shown; "available only" checks more.
  const start = e.starts_at, end = e.ends_at ?? (e.starts_at ? new Date(new Date(e.starts_at).getTime() + 6 * 3600_000).toISOString() : null);
  const avail = async (l: Row) => !start || !end ? "unknown" : ((await ctx.supabase.rpc("listing_availability" as never, { p_listing: l.id, p_start: start, p_end: end } as never)).data as ProviderHit["availability"] | null) ?? "unknown";
  const page = Math.max(0, Math.min(20, f.page ?? 0));
  let pool = rows, statuses: ProviderHit["availability"][];
  if (f.availableOnly && start) {
    const all = await Promise.all(rows.slice(0, 120).map(avail));
    pool = rows.slice(0, 120).filter((_, i) => all[i] !== "unavailable"); statuses = all.filter(s => s !== "unavailable");
  } else statuses = [];
  const slice = pool.slice(0, (page + 1) * PAGE);
  const st = statuses.length ? statuses.slice(0, slice.length) : await Promise.all(slice.map(avail));
  return { ok: true, data: { total: pool.length, more: pool.length > slice.length, event: { date: start, guests, city: e.city ?? "" },
    hits: slice.map((l, i) => ({ id: l.id, name: l.name, kind: l.kind, category: l.category, image: l.image, city: l.city, location: l.location, rating: Number(l.rating ?? 0), review_count: l.review_count ?? 0,
      price_from: l.price_from == null ? null : Number(l.price_from), price_unit: l.price_unit ?? "", capacity_min: l.capacity_min, capacity_max: l.capacity_max, response_hours: l.response_hours,
      verified: !!l.verified, instant_book: !!l.instant_book, badge: l.badge, tags: (l.tags ?? []).slice(0, 3), href: listingHref(l.kind, l.slug, l.id), availability: st[i] ?? "unknown",
      added: added.has(l.id), estimate: estimate(l), tooSmall: l.kind === "venue" && !!l.capacity_max && guests > l.capacity_max })) } };
}
