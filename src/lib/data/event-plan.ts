import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { untyped } from "@/lib/workspace/db";
import type { MapEl, MapSpace } from "@/app/provider/venues/_components/venue-map";

/** v2 plan elements (planner format) vs the earlier zone overlay. */
export const isPlanV2 = (o: unknown): o is MapEl[] => Array.isArray(o) && o.every(x => typeof x === "object" && x !== null && "type" in x && !("shape" in x));

export type EventPlan = {
  base: MapEl[]; overlay: MapEl[]; venueId: string | null; venueName: string | null; structureVersion: number | null;
  latest: { version: number; status: string } | null; publishedVersion: number; legacy: boolean;
  geo: { lat: number; lng: number } | null; spaces: MapSpace[];
};

/** One loader for the event's real layout: the venue's published structure (locked base) plus the latest saved event overlay.
 *  Used by the layout editor and every preview, so what organisers see in Sell/Operations is exactly what the editor opens. */
export async function loadEventPlan(client: SupabaseClient | unknown, e: { id: string; venue_listing_id?: string | null }): Promise<EventPlan> {
  const sb = untyped(client as never);
  const [{ data: vmap }, { data: pub }, { data: venueItem }] = await Promise.all([
    sb.from("venue_maps").select("version,status,overlay").eq("event_id", e.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    sb.from("venue_maps").select("version").eq("event_id", e.id).eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle(),
    sb.from("build_items").select("listing_id").eq("event_id", e.id).eq("category", "venue").in("status", ["confirmed", "fulfilled"]).not("listing_id", "is", null).limit(1).maybeSingle(),
  ]);
  const venueId = (e.venue_listing_id ?? null) || (venueItem?.listing_id as string | undefined) || null;
  const [{ data: structure }, { data: venue }, { data: spaces }] = venueId ? await Promise.all([
    sb.from("venue_structures").select("version,elements").eq("venue_id", venueId).eq("status", "published").maybeSingle(),
    sb.from("listings").select("name,lat,lng,details").eq("id", venueId).maybeSingle(),
    sb.from("spaces").select("id,name,capacity_standing,capacity_seated,indoor").eq("venue_id", venueId),
  ]) : [{ data: null }, { data: null }, { data: null }];
  const det = (venue?.details ?? null) as { geo?: { lat: number; lng: number } } | null;
  return {
    base: ((structure?.elements ?? []) as MapEl[]).map(x => ({ ...x, locked: true })),
    overlay: vmap && isPlanV2(vmap.overlay) ? vmap.overlay : [],
    venueId, venueName: (venue?.name as string | undefined) ?? null, structureVersion: (structure?.version as number | undefined) ?? null,
    latest: vmap ? { version: vmap.version as number, status: vmap.status as string } : null,
    publishedVersion: (pub?.version as number | undefined) ?? 0,
    legacy: !!vmap && !isPlanV2(vmap.overlay),
    geo: det?.geo ?? (venue?.lat != null && venue?.lng != null ? { lat: Number(venue.lat), lng: Number(venue.lng) } : null),
    spaces: ((spaces ?? []) as { id: string; name: string; capacity_standing: number | null; capacity_seated: number | null; indoor: boolean }[])
      .map(s => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0), indoor: s.indoor })),
  };
}
