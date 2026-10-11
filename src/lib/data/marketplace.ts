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
  const day = e.starts_at.slice(0, 10);
  const { data: items } = await ctx.supabase.from("build_items").select("listing_id,status,event_id,events(starts_at)").in("listing_id", listingIds);
  for (const id of listingIds) {
    const mine = (items ?? []).filter(i => i.listing_id === id);
    const thisEvent = mine.find(i => i.event_id === e.id);
    const clash = mine.some(i => i.event_id !== e.id && ["confirmed", "held"].includes(i.status) && (i.events as unknown as { starts_at: string | null } | null)?.starts_at?.slice(0, 10) === day);
    if (thisEvent && ["confirmed", "fulfilled"].includes(thisEvent.status)) out.set(id, { state: "available", label: "Booked for this event" });
    else if (thisEvent && ["sent", "awaiting"].includes(thisEvent.status)) out.set(id, { state: "pending", label: "Awaiting confirmation" });
    else if (thisEvent && ["available", "quoted", "held"].includes(thisEvent.status)) out.set(id, { state: "available", label: thisEvent.status === "held" ? "On hold for you" : "Available" });
    else if (clash) out.set(id, { state: "unavailable", label: "Booked that date" });
    else out.set(id, { state: "likely", label: "Likely available" });
  }
  return out;
}
