import "server-only";
import { cache } from "react";
import { rows } from "@/lib/workspace/db";
import { getProvider } from "./context";

export type Listing = {
  id: string; name: string; kind: "venue" | "service"; slug: string | null; image: string; gallery: string[]; category: string; city: string; location: string;
  published: boolean; paused_at: string | null; review_status: string; booking_mode: string; response_hours: number; price_from: number | null;
  price_unit: string; capacity_max: number | null; rating: number; review_count: number; views: number; enquiry_count: number;
  verified: boolean; instant_book: boolean; emergency_supply: boolean; details: Record<string, unknown>; created_at: string;
};
export type Item = {
  id: string; status: string; role: string; listing_id: string; package: string; scope: string; image: string; amount: number | null; deposit: number;
  response_deadline: string | null; hold_expires_at: string | null; created_at: string; updated_at: string; notes: string;
  quote: Record<string, unknown>; terms_snapshot: Record<string, unknown> | null;
  event: { id: string; name: string; event_type: string; starts_at: string | null; ends_at: string | null; guest_count: number; location: string; city: string; venue_name: string; description: string; client_name: string; cover_image: string; settings: Record<string, unknown> } | null;
  request: { id: string; reference: string; title: string; scope: string; requirements: Record<string, unknown>; budget_min: number | null; budget_max: number | null; emergency: boolean; response_hours: number } | null;
};
export type Job = {
  id: string; reference: string; build_item_id: string | null; listing_id: string | null; space_id: string | null; package_id: string | null; mode: "venue" | "service";
  client_name: string; client_org: string; client_email: string; event_name: string; event_type: string; starts_at: string; ends_at: string; guests: number | null; location: string; layout: string;
  status: string; role: string; value: number; platform_fee: number; net_payout: number; paid_amount: number; payment_status: string; source: string;
  next_action: string; next_action_due: string | null; image: string; created_at: string; details: Record<string, unknown>; commercial_snapshot: Record<string, unknown>;
};
export type Space = { id: string; venue_id: string; name: string; status: string; indoor: boolean; capacity_seated: number | null; capacity_standing: number | null; image: string; rate_hourly: number | null };
export type Crew = { id: string; name: string; role: string; member_type: string; status: string; avatar: string; skills: string[]; day_rate: number | null; location: string };

const ITEM_SELECT = "id,status,role,listing_id,package,scope,image,amount,deposit,response_deadline,hold_expires_at,created_at,updated_at,notes,quote,terms_snapshot," +
  "event:events(id,name,event_type,starts_at,ends_at,guest_count,location,city,venue_name,description,client_name,cover_image,settings)," +
  "request:provider_requests(id,reference,title,scope,requirements,budget_min,budget_max,emergency,response_hours)";

/** Everything below is scoped to the active workspace; RLS additionally limits rows to the caller's memberships. */
export const workspaceListings = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Listing>(db.from("listings").select("*").eq("workspace_id", workspace.id).order("created_at"));
});
export const workspaceSpaces = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Space>(db.from("spaces").select("id,venue_id,name,status,indoor,capacity_seated,capacity_standing,image,rate_hourly").eq("workspace_id", workspace.id).order("created_at"));
});
export const workspaceItems = cache(async () => {
  const { db } = await getProvider();
  const ids = (await workspaceListings()).map(l => l.id);
  if (!ids.length) return [] as Item[];
  // Expiry is server-authoritative; run the sweep opportunistically is a service-role job, so here we only read.
  return rows<Item>(db.from("build_items").select(ITEM_SELECT).in("listing_id", ids).not("status", "in", "(suggested,draft)").order("response_deadline", { ascending: true, nullsFirst: false }));
});
export const workspaceJobs = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Job>(db.from("provider_jobs").select("*").eq("workspace_id", workspace.id).order("starts_at"));
});
export const workspaceCrew = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Crew>(db.from("crew_members").select("id,name,role,member_type,status,avatar,skills,day_rate,location").eq("workspace_id", workspace.id).neq("status", "deactivated").order("created_at"));
});

export const OPEN = ["sent", "awaiting", "clarification"];
/** Display state of a request. A missed deadline is "Expired / No response" — never "Declined". */
export function itemState(i: Item, now = Date.now()) {
  if (OPEN.includes(i.status) && i.response_deadline && new Date(i.response_deadline).getTime() < now) return "expired";
  return i.status;
}
export const isEmergency = (i: Item) => !!i.request?.emergency;
export const isQuoteRequested = (i: Item) => !!i.request?.requirements?.quote_requested;

/**
 * Reliability metrics from canonical records.
 * response rate = requests answered ÷ requests that reached an answer or expired
 * cancellation rate = provider cancellations ÷ all provider jobs (last 180 days)
 * on-time delivery = completed ÷ (completed + no-show)
 */
export function reliability(items: Item[], jobs: Job[], now = Date.now()) {
  const answered = items.filter(i => !OPEN.includes(i.status) && i.status !== "expired").length;
  const expired = items.filter(i => itemState(i, now) === "expired").length;
  const since = now - 180 * 864e5;
  const recent = jobs.filter(j => new Date(j.created_at).getTime() > since);
  const cancelled = recent.filter(j => j.status === "cancelled").length;
  const completed = jobs.filter(j => j.status === "completed").length, noShow = jobs.filter(j => j.status === "no_show").length;
  const responseRate = answered + expired ? Math.round((100 * answered) / (answered + expired)) : 100;
  const cancellationRate = recent.length ? +((100 * cancelled) / recent.length).toFixed(1) : 0;
  const onTime = completed + noShow ? Math.round((100 * completed) / (completed + noShow)) : 100;
  return { responseRate, cancellationRate, onTime, answered, expired, cancelled, jobs: recent.length };
}

/** Marketplace eligibility thresholds (platform policy defaults, mirrored from platform_settings.marketplace). */
export const POLICY = { instantMinResponse: 90, instantMaxCancel: 2, emergencyMinResponse: 90, standbyMaxCancel: 3 };
export function eligibility(r: ReturnType<typeof reliability>, listings: Listing[], verified: boolean) {
  return {
    instant: verified && r.responseRate >= POLICY.instantMinResponse && r.cancellationRate <= POLICY.instantMaxCancel,
    emergency: verified && r.responseRate >= POLICY.emergencyMinResponse && listings.some(l => l.emergency_supply),
    standby: verified && r.cancellationRate <= POLICY.standbyMaxCancel,
  };
}

/** Daily totals for sparklines/bars: `days` buckets ending today (Europe/London calendar days approximated in UTC). */
export function dailySeries<T>(list: T[], at: (x: T) => string | null | undefined, value: (x: T) => number = () => 1, days = 30, now = Date.now()) {
  const out = Array<number>(days).fill(0);
  const end = new Date(now); end.setUTCHours(23, 59, 59, 999);
  for (const x of list) {
    const t = at(x); if (!t) continue;
    const idx = days - 1 - Math.floor((end.getTime() - new Date(t).getTime()) / 864e5);
    if (idx >= 0 && idx < days) out[idx] += value(x);
  }
  return out;
}
const londonYMD = (ms: number) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(new Date(ms)).map(x => [x.type, x.value])) as { year: string; month: string; day: string };
/** UTC instant of London midnight for a given London calendar date. */
function londonMidnight(y: number, m: number, d: number) {
  const utc = Date.UTC(y, m, d);
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(utc)).find(x => x.type === "timeZoneName")?.value ?? "GMT";
  return utc - Number(tz.match(/GMT([+-]\d+)/)?.[1] ?? 0) * 36e5;
}
/** Start of a Europe/London calendar day — business days are London days regardless of server time zone. */
export function startOfDay(offsetDays = 0, now = Date.now()) {
  const p = londonYMD(now + offsetDays * 864e5);
  return londonMidnight(+p.year, +p.month - 1, +p.day);
}
/** Start of the London calendar month `offsetMonths` from the current one. */
export function startOfMonth(offsetMonths = 0, now = Date.now()) {
  const p = londonYMD(now);
  return londonMidnight(+p.year, +p.month - 1 + offsetMonths, 1);
}

