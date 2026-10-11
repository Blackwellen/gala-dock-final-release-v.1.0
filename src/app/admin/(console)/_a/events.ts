import "server-only";
import { rows, type Db } from "@/lib/workspace/db";
import { rpc } from "./lib";

export type Ev = { id: string; name: string; slug: string | null; event_type: string; status: string; visibility: string; management: string; starts_at: string | null; ends_at: string | null;
  venue_name: string; city: string; location: string; cover_image: string; description: string; workspace_id: string | null; owner_id: string; venue_listing_id: string | null; capacity: number | null;
  created_at: string; settings: { reference?: string; featured?: boolean; admin_restriction?: { reason?: string } } | null };
export type EvMetric = { event_id: string; capacity: number; sold: number; gross: number; sold_window: number; gross_window: number; orders: number; used: number; refunded: number;
  tier_status: string | null; providers: number; providers_confirmed: number; flags: number; max_risk: number | null; scans: number; scan_anomalies: number };
export const EV_COLS = "id,name,slug,event_type,status,visibility,management,starts_at,ends_at,venue_name,city,location,cover_image,description,workspace_id,owner_id,venue_listing_id,capacity,created_at,settings";

export async function loadEventMetrics(db: Db, days = 30) {
  const list = await rpc<EvMetric[]>(db, "admin_event_metrics", { p_days: days });
  return new Map(list.map(m => [m.event_id, { ...m, gross: Number(m.gross), capacity: Number(m.capacity), sold: Number(m.sold) }]));
}
export async function loadWorkspaceNames(db: Db) {
  const list = await rows<{ id: string; name: string; cover_image: string; settings: { reference?: string } | null }>(db.from("workspaces").select("id,name,cover_image,settings"));
  return new Map(list.map(w => [w.id, w]));
}

/** Lifecycle label. "ready" is an organizer's finished, upcoming event; "suspended" is an admin restriction. */
export function evStatus(e: Pick<Ev, "status" | "starts_at" | "ends_at">, now: number) {
  const s = e.status, start = e.starts_at ? new Date(e.starts_at).getTime() : 0, end = e.ends_at ? new Date(e.ends_at).getTime() : start;
  if (s === "suspended") return { key: "restricted", label: "Restricted" };
  if (s === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (s === "live" || (["on_sale", "published", "ready"].includes(s) && start && start <= now && end >= now)) return { key: "live", label: "Live" };
  if (s === "completed" || s === "closed" || s === "archived") return { key: "completed", label: "Completed" };
  if (s === "draft") return { key: "draft", label: "Draft" };
  if (s === "planning") return { key: "draft", label: "Planning" };
  if (s === "on_sale") return { key: "on_sale", label: "On sale" };
  if (s === "published") return { key: "published", label: "Published" };
  if (s === "postponed") return { key: "pending", label: "Postponed" };
  return { key: "upcoming", label: "Upcoming" };
}

/** Readiness = share of launch checks that pass, from the event's real data. */
export function readiness(e: Ev, m?: EvMetric) {
  const checks = [!!e.cover_image, !!(e.venue_name || e.location), !!e.starts_at, e.description.trim().length >= 20];
  if (e.visibility === "public") checks.push((m?.capacity ?? 0) > 0);
  if ((m?.providers ?? 0) > 0) checks.push(m!.providers_confirmed >= m!.providers);
  if (e.status === "cancelled" || e.status === "suspended") return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const TYPE_TONE: Record<string, string> = { corporate: "", conference: "", festival: "pink", concert: "purple", music: "purple", nightlife: "purple", family: "purple", wedding: "amber", community: "teal",
  comedy: "", gala: "pink", party: "purple", birthday: "amber", food_drink: "amber", awards: "pink", production: "grey", private_dinner: "grey" };
export const typeTone = (t: string) => TYPE_TONE[t] ?? "grey";
export const typeLabel = (t: string) => ({ food_drink: "Food & Drink", private_dinner: "Private dinner" } as Record<string, string>)[t] ?? t.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase());
