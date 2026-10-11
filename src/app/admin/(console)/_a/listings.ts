import "server-only";
import type { Db } from "@/lib/workspace/db";
import { rpc } from "./lib";

export type Listing = { id: string; name: string; kind: "venue" | "service"; category: string; city: string; location: string; image: string; gallery: string[] | null; verified: boolean; review_status: string;
  booking_mode: string; sponsored: boolean; published: boolean; response_hours: number | null; rating: number | null; review_count: number; workspace_id: string; created_at: string; updated_at: string;
  details: Record<string, unknown> | null; capacity_min: number | null; capacity_max: number | null; price_from: number | null; price_unit: string | null; tags: string[] | null; paused_at: string | null;
  instant_book: boolean; badge: string | null; description: string; slug: string | null };
export type LMetric = { listing_id: string; requests: number; requests_prev: number; confirmed: number; cancelled: number; decided: number; revenue: number; responded: number; open_flags: number };
export const L_COLS = "id,name,kind,category,city,location,image,gallery,verified,review_status,booking_mode,sponsored,published,response_hours,rating,review_count,workspace_id,created_at,updated_at,details,capacity_min,capacity_max,price_from,price_unit,tags,paused_at,instant_book,badge,description,slug";

export async function loadListingMetrics(db: Db, days = 30) {
  const list = await rpc<LMetric[]>(db, "admin_listing_metrics", { p_days: days });
  return new Map(list.map(m => [m.listing_id, { ...m, revenue: Number(m.revenue) }]));
}
export const cancelRate = (m?: LMetric) => (m?.decided ? (100 * m.cancelled) / m.decided : 0);
export const responseRate = (m?: LMetric) => (m?.requests ? Math.round((100 * Math.min(m.responded, m.requests)) / m.requests) : null);

/** Listing health from live signals: admin review state, pause, response speed, cancellations and open trust cases. */
export function lHealth(l: Pick<Listing, "review_status" | "paused_at" | "response_hours">, m?: LMetric) {
  if (l.review_status === "suspended") return { key: "suspended", label: "Suspended" };
  if (l.review_status === "restricted") return { key: "restricted", label: "Restricted" };
  if ((l.response_hours ?? 0) > 24 || cancelRate(m) > 5 || (m?.open_flags ?? 0) > 0) return { key: "at_risk", label: "At risk" };
  if (l.paused_at) return { key: "paused", label: "Paused" };
  if (l.review_status !== "approved") return { key: "review", label: "Review" };
  return { key: "healthy", label: "Healthy" };
}
export const modeTone = (m: string) => (m === "instant" ? "green" : m === "request" ? "amber" : "grey");
export const fmtHours = (h: number | null | undefined) => (h === null || h === undefined ? "—" : `${h < 10 ? h.toFixed(1) : Math.round(h)}h`);
