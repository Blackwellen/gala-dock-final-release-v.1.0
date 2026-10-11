import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceItems, workspaceJobs, workspaceListings, workspaceSpaces, workspaceCrew, startOfDay } from "@/lib/provider/queries";
import { workspaceBlocks } from "@/lib/provider/commercial";

export type Layer = "availability" | "bookings" | "holds" | "standby" | "team" | "resources" | "emergency";
export const LAYERS: { key: Layer; label: string }[] = [
  { key: "availability", label: "Availability" }, { key: "bookings", label: "Bookings" }, { key: "holds", label: "Holds" }, { key: "standby", label: "Standby" },
  { key: "team", label: "Team" }, { key: "resources", label: "Spaces/Resources" }, { key: "emergency", label: "Emergency" },
];
export type Entry = {
  id: string; kind: "booking" | "hold" | "standby" | "block" | "emergency" | "shift"; title: string; sub: string; start: number; end: number;
  tone: "blue" | "purple" | "pink" | "orange" | "green" | "red" | "grey"; status: string; href?: string; rowKey: string; expires?: number; holdItemId?: string;
};
export type Row = { key: string; group: "spaces" | "team"; title: string; sub: string; image: string; spaceId?: string; listingId?: string; crewId?: string };

const toneFor = (type: string): Entry["tone"] => /wedding|engagement|anniversary/.test(type) ? "pink" : /corporate|conference|gala/.test(type) ? "blue" : /birthday|party|private/.test(type) ? "orange" : /production|concert|launch/.test(type) ? "purple" : "green";

/** All calendar layers for the active workspace, from canonical records (jobs, held build items, blocks, shifts). */
export async function calendarData(from: number, to: number) {
  const ctx = await getProvider();
  const [items, jobs, listings, spaces, crew, blocks] = await Promise.all([workspaceItems(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceCrew(), workspaceBlocks()]);
  const shifts = await rows<{ id: string; crew_id: string; job_id: string | null; title: string; role: string; starts_at: string; ends_at: string; status: string }>(
    ctx.db.from("shifts").select("id,crew_id,job_id,title,role,starts_at,ends_at,status").eq("workspace_id", ctx.workspace.id).lt("starts_at", new Date(to).toISOString()).gt("ends_at", new Date(from).toISOString()));
  const inRange = (a: number, b: number) => a < to && b > from;
  const venueRows: Row[] = spaces.map(s => ({ key: `space:${s.id}`, group: "spaces", title: s.name, sub: `(${Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0)} capacity)`, image: s.image, spaceId: s.id, listingId: s.venue_id }));
  const serviceRows: Row[] = listings.filter(l => l.kind === "service").map(l => ({ key: `listing:${l.id}`, group: "spaces", title: l.name, sub: l.category || "Service", image: l.image, listingId: l.id }));
  const teamRows: Row[] = crew.map(c => ({ key: `crew:${c.id}`, group: "team", title: c.name, sub: c.role, image: c.avatar, crewId: c.id }));
  const rowFor = (spaceId: string | null, listingId: string | null) => spaceId ? `space:${spaceId}` : listingId && serviceRows.some(r => r.listingId === listingId) ? `listing:${listingId}` : null;

  const entries: Entry[] = [];
  for (const j of jobs) {
    const a = new Date(j.starts_at).getTime(), b = new Date(j.ends_at).getTime();
    const key = rowFor(j.space_id, j.listing_id);
    if (!key || !inRange(a, b) || j.status === "cancelled") continue;
    entries.push({ id: j.id, kind: j.role === "standby" || j.source === "standby" ? "standby" : "booking", title: j.event_name, sub: "", start: a, end: b, tone: toneFor(j.event_type),
      status: j.status === "held" ? "Held" : j.status === "active" ? "In progress" : j.status === "completed" ? "Completed" : "Confirmed", href: `/provider/bookings/${j.id}`, rowKey: key });
  }
  for (const i of items) {
    if (!["held", "standby"].includes(i.status) || !i.event?.starts_at) continue;
    const a = new Date(i.event.starts_at).getTime(), b = new Date(i.event.ends_at ?? i.event.starts_at).getTime() || a + 4 * 36e5;
    const key = rowFor((i.request?.requirements?.space_id as string) ?? null, i.listing_id);
    if (!key || !inRange(a, b)) continue;
    entries.push({ id: i.id, kind: i.status === "held" ? "hold" : "standby", title: i.event.name, sub: "", start: a, end: b, tone: toneFor(i.event.event_type),
      status: i.status === "held" ? "Hold" : "Standby", href: `/provider/opportunities/${i.id}`, rowKey: key, expires: i.hold_expires_at ? new Date(i.hold_expires_at).getTime() : undefined, holdItemId: i.id });
  }
  for (const bl of blocks) {
    const a = new Date(bl.starts_at).getTime(), b = new Date(bl.ends_at).getTime();
    if (!inRange(a, b)) continue;
    const keys = bl.crew_id ? [`crew:${bl.crew_id}`] : bl.space_id ? [`space:${bl.space_id}`] : bl.listing_id ? venueRows.filter(r => r.listingId === bl.listing_id).map(r => r.key).concat(serviceRows.filter(r => r.listingId === bl.listing_id).map(r => r.key)) : [];
    for (const key of keys) entries.push({ id: `${bl.id}:${key}`, kind: bl.kind === "emergency_window" ? "emergency" : "block", title: bl.kind === "emergency_window" ? "Emergency window" : bl.kind === "maintenance" ? "Maintenance" : bl.kind === "open" ? "Open availability" : "Blocked",
      sub: bl.note, start: a, end: b, tone: bl.kind === "emergency_window" ? "red" : bl.kind === "open" ? "green" : "grey", status: bl.kind === "emergency_window" ? "Emergency" : bl.kind === "open" ? "Bookable" : "Unavailable", rowKey: key });
  }
  for (const s of shifts) {
    const a = new Date(s.starts_at).getTime(), b = new Date(s.ends_at).getTime();
    const job = jobs.find(j => j.id === s.job_id);
    entries.push({ id: s.id, kind: "shift", title: s.title || job?.event_name || "Shift", sub: s.role, start: a, end: b, tone: job ? toneFor(job.event_type) : "blue", status: s.status === "confirmed" ? "On site" : "Pending",
      href: s.job_id ? `/provider/bookings/${s.job_id}?tab=team` : undefined, rowKey: `crew:${s.crew_id}` });
  }

  // KPIs over the visible period
  const confirmed = entries.filter(e => e.kind === "booking").length;
  const holds = items.filter(i => i.status === "held");
  const standby = entries.filter(e => e.kind === "standby").length + items.filter(i => i.status === "standby").length;
  const emergency = blocks.filter(b => b.kind === "emergency_window" && new Date(b.ends_at).getTime() > Date.now());
  // Available time: share of space-hours (12 h/day) in the period not taken by bookings, holds or blocks.
  const days = Math.max(1, Math.round((to - from) / 864e5));
  const capacityHours = venueRows.length * days * 12;
  const used = entries.filter(e => ["booking", "hold", "block"].includes(e.kind) && e.rowKey.startsWith("space:") && e.status !== "Bookable")
    .reduce((acc, e) => acc + Math.min(12 * days, (Math.min(e.end, to) - Math.max(e.start, from)) / 36e5), 0);
  const available = capacityHours ? Math.max(0, Math.round(100 - (100 * used) / capacityHours)) : 0;

  const now = Date.now();
  const upcoming = jobs.filter(j => ["confirmed", "held", "active"].includes(j.status) && new Date(j.starts_at).getTime() > now - 6 * 36e5 && new Date(j.starts_at).getTime() < now + 7 * 864e5).slice(0, 3)
    .map(j => ({ ...j, spaceName: spaces.find(s => s.id === j.space_id)?.name ?? listings.find(l => l.id === j.listing_id)?.name ?? "" }));
  const atRisk = holds.filter(i => i.hold_expires_at && new Date(i.hold_expires_at).getTime() - now < 48 * 36e5).map(i => ({ ...i, spaceName: (i.request?.requirements?.space as string) ?? "" }));
  const unassigned = crew.filter(c => c.member_type === "member" && c.status !== "unavailable" && !shifts.some(s => s.crew_id === c.id)).length;
  const busiestDay = (() => { const counts = new Map<number, number>(); for (const e of entries.filter(x => x.kind === "booking")) { const d = startOfDay(0, e.start); counts.set(d, (counts.get(d) ?? 0) + 1); } return [...counts].sort((a, b) => b[1] - a[1])[0]; })();
  return { rows: { venue: [...venueRows, ...serviceRows], team: teamRows }, entries, spaces, listings, crew,
    kpi: { confirmed, holds: holds.length, standby, available, emergency: emergency.length }, upcoming, atRisk, unassigned, busiestDay, holdsList: holds };
}
