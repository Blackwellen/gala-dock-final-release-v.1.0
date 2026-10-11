import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { workspaceListings, workspaceJobs } from "@/lib/provider/queries";
import type { MapEl } from "../../_components/venue-map";

export type Hours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string] | null>>;
export type SpaceDetails = {
  dimensions?: { length?: number; width?: number; ceiling?: number }; gallery?: string[]; use_cases?: string[]; layout_features?: string[]; default_layout?: string;
  layout_notes?: Record<string, string>; min_capacity?: number; space_type?: string; access?: string; toilets?: string; bar?: string; catering?: string; accessibility?: string;
  av?: string[]; parking?: string; curfew?: string; setup_minutes?: number; cleardown_minutes?: number; hours?: { inherit?: boolean; week?: Hours }; pricing_mode?: string;
  short_notice?: boolean; booking_type?: "marketplace" | "operational"; response_hours?: number | null; cancellation?: { window: string; refund: number }[] | null; quote_custom?: boolean; description?: string;
};
export type SpaceRow = { id: string; venue_id: string; name: string; status: string; indoor: boolean; area_sqm: number | null; capacity_standing: number | null; capacity_seated: number | null;
  layouts: Record<string, number>; amenities: string[]; turnaround_minutes: number; min_hours: number; rate_hourly: number | null; image: string; details: SpaceDetails; created_at: string };
const SELECT = "id,venue_id,name,status,indoor,area_sqm,capacity_standing,capacity_seated,layouts,amenities,turnaround_minutes,min_hours,rate_hourly,image,details,created_at";

/** Everything the space profile and Add Space wizard need for one venue (and optionally one space), RLS-scoped to the provider. */
export async function loadSpaceContext(venueId: string, spaceId: string | null) {
  if (!isUuid(venueId) || (spaceId !== null && !isUuid(spaceId))) return null; // spaceId is interpolated into a PostgREST filter below
  const [ctx, listings, jobs] = await Promise.all([getProvider(), workspaceListings(), workspaceJobs()]);
  const venue = listings.find(l => l.id === venueId && l.kind === "venue") ?? null;
  if (!venue) return null;
  const [spaces, structure, links] = await Promise.all([
    rows<SpaceRow>(ctx.db.from("spaces").select(SELECT).eq("venue_id", venueId).order("created_at", { ascending: false })),
    one<{ version: number; elements: MapEl[] }>(ctx.db.from("venue_structures").select("version,elements").eq("venue_id", venueId).eq("status", "published").maybeSingle()),
    spaceId ? rows<{ space_a: string; space_b: string; kind: string }>(ctx.db.from("space_links").select("space_a,space_b,kind").or(`space_a.eq.${spaceId},space_b.eq.${spaceId}`)) : Promise.resolve([]),
  ]);
  const space = spaceId ? spaces.find(s => s.id === spaceId) ?? null : null;
  const other = (l: { space_a: string; space_b: string }) => (l.space_a === spaceId ? l.space_b : l.space_a);
  return {
    ctx, venue, spaces, space, structure, jobs,
    linked: links.filter(l => l.kind === "linked").map(other), exclusive: links.filter(l => l.kind === "exclusive").map(other),
    venueHours: ((venue.details as { hours?: Hours }).hours ?? {}) as Hours,
    venueCommercial: ((venue.details as { commercial?: { rate_from?: number; cancellation?: { window: string; refund: number }[] } }).commercial ?? {}),
  };
}
