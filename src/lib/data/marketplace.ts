import "server-only";
import type { OrganizerCtx } from "./context";

export type Listing = { id: string; name: string; kind: string; category: string; city: string; location: string; image: string; gallery: string[]; price_from: number | null; price_unit: string; capacity_min: number | null; capacity_max: number | null; rating: number; review_count: number; response_hours: number; verified: boolean; instant_book: boolean; emergency_supply: boolean; badge: string | null; tags: string[]; lat: number | null; lng: number | null; slug: string | null; sponsored: boolean; description: string; details: Record<string, unknown>; workspace_id: string };
export const LISTING_COLS = "id,name,kind,category,city,location,image,gallery,price_from,price_unit,capacity_min,capacity_max,rating,review_count,response_hours,verified,instant_book,emergency_supply,badge,tags,lat,lng,slug,sponsored,description,details,workspace_id";
export type EventCtx = { id: string; name: string; starts_at: string | null; ends_at: string | null; city: string; location: string; capacity: number | null; guest_count: number; budget_total: number | null; cover_image: string; event_type: string };

/** Explainable fit of a listing for an event (0–100) with reasons. Not used to rank sponsored placements organically. */
export function fitFor(l: Listing, e: EventCtx | null) {
  if (!e) return { score: Math.round(60 + l.rating * 6), reasons: [`${l.rating.toFixed(1)}★ from ${l.review_count} reviews`] };
  const reasons: string[] = []; let score = 40;
  const need = e.capacity || e.guest_count;
  if (l.kind === "venue" && need && l.capacity_max) { if (l.capacity_max >= need) { score += 22; reasons.push(`Fits ${need.toLocaleString()} guests`); } else { score -= 20; reasons.push(`Holds ${l.capacity_max.toLocaleString()} (needs ${need.toLocaleString()})`); } }
  if (e.city && (l.city.toLowerCase() === e.city.toLowerCase() || l.location.toLowerCase().includes(e.city.toLowerCase()))) { score += 14; reasons.push(`In ${e.city}`); }
  score += Math.round((l.rating - 4) * 18); if (l.rating >= 4.7) reasons.push(`${l.rating.toFixed(1)}★ rated`);
  if (l.response_hours <= 4) { score += 8; reasons.push(`Responds in ${l.response_hours}h`); }
  if (l.verified) { score += 4; }
  if (e.budget_total && l.price_from && l.kind === "venue" && l.price_from <= e.budget_total * 0.35) { score += 6; reasons.push("Within venue budget"); }
  return { score: Math.max(5, Math.min(99, score)), reasons };
}

/** Availability confidence from canonical commitments on the event date (never invented). */
export async function availabilityFor(ctx: OrganizerCtx, listingIds: string[], e: EventCtx | null) {
  const out = new Map<string, { state: "available" | "likely" | "pending" | "unavailable" | "unknown"; label: string }>();
  for (const id of listingIds) out.set(id, { state: "unknown", label: "Check availability" });
  if (!e?.starts_at || !listingIds.length) return out;
  const { data: items, error } = await ctx.supabase.from("build_items").select("listing_id,status").eq("event_id", e.id).in("listing_id", listingIds);
  if (error) return out;
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime()+6*36e5).toISOString();
  // The privacy-preserving RPC sees canonical cross-workspace commitments. A caller's RLS view
  // cannot establish availability by failing to see another customer's booking.
  for (let offset=0;offset<listingIds.length;offset+=10) await Promise.all(listingIds.slice(offset,offset+10).map(async id=>{
    const thisEvent=items?.find(i=>i.listing_id===id);
    if(thisEvent&&["confirmed","fulfilled"].includes(thisEvent.status)){out.set(id,{state:"available",label:"Booked for this event"});return;}
    if(thisEvent?.status==="held"){out.set(id,{state:"available",label:"On hold for you"});return;}
    if(thisEvent&&["sent","awaiting"].includes(thisEvent.status)){out.set(id,{state:"pending",label:"Awaiting confirmation"});return;}
    const result=await ctx.supabase.rpc("listing_availability",{p_listing:id,p_start:e.starts_at!,p_end:end});
    if(result.error)return;
    if(result.data==="unavailable")out.set(id,{state:"unavailable",label:"Unavailable in this time window"});
    else if(result.data==="limited")out.set(id,{state:"likely",label:"Limited availability; confirm with provider"});
    else if(result.data==="available")out.set(id,{state:"available",label:"Calendar open; provider confirmation required"});
  }));
  return out;
}

/**
 * Q09 organic ranking for the organizer marketplace (migration 202610291031): versioned, explainable scores with
 * `ranking_reasons` per listing and availability for the event window (Q10–Q12 commitments). Additive to `fitFor` /
 * `availabilityFor` (unchanged). Sponsorship is never an input. Returns an empty map if ranking is unavailable.
 */
export type RankedListing = { score: number; model_version: number; availability: "available" | "limited" | "unavailable" | "unknown"; reliability_band: string;
  estimate_minor: number | null; packages: { package_id: string; name: string; price_minor: number }[];
  ranking_reasons: { feature: string; value: number; weight: number; contribution: number; text: string }[] };
export async function rankedFor(ctx: OrganizerCtx, kind: "venue" | "service", e: EventCtx | null, opts: { q?: string; category?: string; city?: string; limit?: number; availability?: "rank" | "exclude" } = {}) {
  const out = new Map<string, RankedListing>();
  const p: Record<string, unknown> = { kind, limit: Math.min(50, opts.limit ?? 50), availability: opts.availability ?? "rank" };
  if (opts.q) p.q = opts.q; if (opts.category) p.category = opts.category;
  const city = opts.city ?? e?.city; if (city) p.city = city;
  if (e?.starts_at) { p.starts_at = e.starts_at; p.ends_at = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 6 * 36e5).toISOString(); }
  const guests = e ? (e.capacity || e.guest_count) : null; if (guests) p.guests = guests;
  if (e?.budget_total && kind === "venue") p.budget = Math.round(Number(e.budget_total) * 0.35);
  const { data, error } = await (ctx.supabase as unknown as { rpc(fn: string, a: unknown): PromiseLike<{ data: unknown; error: unknown }> }).rpc("marketplace_search_explained", { p, p_workspace: ctx.workspace.id }); // internal explainability: organizer workspace with marketplace.request
  if (error || !data) return out;
  for (const r of (data as { results: (RankedListing & { listing_id: string })[] }).results ?? []) out.set(r.listing_id, r);
  return out;
}
