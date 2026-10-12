import "server-only";
import type { OrganizerCtx } from "./context";
import { money } from "@/lib/format";

export const LAYERS = [
  { key: "events", label: "Events", color: "#2563eb" }, { key: "tasks", label: "Tasks", color: "#7c3aed" },
  { key: "venue", label: "Venue bookings", color: "#059669" }, { key: "holds", label: "Supplier holds", color: "#f97316" },
  { key: "shifts", label: "Crew shifts", color: "#db2777" }, { key: "tickets", label: "Tickets", color: "#f59e0b" },
  { key: "promotion", label: "Promotion", color: "#9333ea" }, { key: "emails", label: "Emails", color: "#0d9488" },
  { key: "payments", label: "Payments", color: "#dc2626" }, { key: "meetings", label: "Meetings", color: "#2563eb" },
  { key: "external", label: "External", color: "#64748b" },
] as const;
export type LayerKey = typeof LAYERS[number]["key"];
export type CalEntry = { id: string; layer: LayerKey; title: string; sub?: string; start: string; end: string | null; href: string; image?: string; eventId?: string | null; draggable?: boolean; sourceId: string };

/** Aggregates calendar layers from canonical sources within [from, to). Nothing here is a copy of business data. */
export async function calendarEntries(ctx: OrganizerCtx, from: string, to: string): Promise<CalEntry[]> {
  const sb = ctx.supabase, ws = ctx.workspace.id;
  const { data: events } = await sb.from("events").select("id,name,starts_at,ends_at,venue_name,cover_image,status").eq("workspace_id", ws).neq("status", "archived");
  const ids = (events ?? []).map(e => e.id); const ev = new Map((events ?? []).map(e => [e.id, e]));
  const inRange = (c: string | null | undefined) => !!c && c >= from && c < to;
  const [tasks, items, shifts, tiers, promos, pays, invoices, entries, crew, busy] = await Promise.all([
    sb.from("tasks").select("id,title,due_at,event_id,status,assignee_name").eq("workspace_id", ws).gte("due_at", from).lt("due_at", to),
    ids.length ? sb.from("build_items").select("id,title,category,status,event_id,hold_expires_at").in("event_id", ids) : Promise.resolve({ data: [] }),
    sb.from("shifts").select("id,title,role,starts_at,ends_at,event_id,crew_id,status").eq("workspace_id", ws).lt("starts_at", to).gte("ends_at", from),
    ids.length ? sb.from("ticket_tiers").select("id,name,sale_start,event_id").in("event_id", ids).gte("sale_start", from).lt("sale_start", to) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("promotions").select("id,channel,title,scheduled_at,event_id,status").in("event_id", ids).gte("scheduled_at", from).lt("scheduled_at", to) : Promise.resolve({ data: [] }),
    ctx.canMoney && ids.length ? sb.from("payments").select("id,payee,kind,amount,due_at,event_id,status").in("event_id", ids).gte("due_at", from).lt("due_at", to) : Promise.resolve({ data: [] }),
    ctx.canMoney ? sb.from("invoices").select("id,number,client_name,total,due_date,status").eq("workspace_id", ws).gte("due_date", from.slice(0, 10)).lt("due_date", to.slice(0, 10)) : Promise.resolve({ data: [] }),
    sb.from("calendar_entries").select("id,title,detail,starts_at,ends_at,layer,event_id").eq("workspace_id", ws).gte("starts_at", from).lt("starts_at", to),
    sb.from("crew_members").select("id,name").eq("workspace_id", ws),
    // Busy times pulled from the user's connected Google / Microsoft calendar (owner-only under RLS; times only, no details).
    sb.from("calendar_busy_blocks").select("id,starts_at,ends_at").eq("user_id", ctx.user.id).lt("starts_at", to).gte("ends_at", from).limit(500),
  ]);
  const crewName = new Map((crew.data ?? []).map(c => [c.id, c.name]));
  const out: CalEntry[] = [];
  for (const e of events ?? []) if (e.starts_at && e.starts_at < to && (e.ends_at ?? e.starts_at) >= from) out.push({ id: `ev-${e.id}`, sourceId: e.id, layer: "events", title: e.name, sub: e.venue_name, start: e.starts_at, end: e.ends_at, href: `/organizer/events/${e.id}`, image: e.cover_image, eventId: e.id });
  for (const t of tasks.data ?? []) out.push({ id: `t-${t.id}`, sourceId: t.id, layer: "tasks", title: t.title, sub: t.assignee_name, start: t.due_at!, end: null, href: t.event_id ? `/organizer/events/${t.event_id}?tab=plan&section=tasks` : "/organizer/team?tab=assignments", eventId: t.event_id, draggable: t.status !== "done" });
  for (const b of items.data ?? []) {
    const e = ev.get(b.event_id);
    if (b.category === "venue" && ["confirmed", "held"].includes(b.status) && e?.starts_at && inRange(e.starts_at)) out.push({ id: `vb-${b.id}`, sourceId: b.id, layer: "venue", title: b.title, sub: `Venue booking · ${e.name}`, start: e.starts_at, end: e.ends_at, href: `/organizer/events/${b.event_id}?tab=plan&section=venue`, eventId: b.event_id });
    if (b.status === "held" && inRange(b.hold_expires_at)) out.push({ id: `h-${b.id}`, sourceId: b.id, layer: "holds", title: `Hold expires: ${b.title}`, sub: e?.name, start: b.hold_expires_at!, end: null, href: `/organizer/events/${b.event_id}?tab=plan&section=suppliers`, eventId: b.event_id });
  }
  for (const s of shifts.data ?? []) out.push({ id: `s-${s.id}`, sourceId: s.id, layer: "shifts", title: s.title || s.role, sub: `${s.crew_id ? crewName.get(s.crew_id) ?? "" : "Unfilled"} · ${s.role}`, start: s.starts_at, end: s.ends_at, href: s.crew_id ? `/organizer/team/${s.crew_id}` : "/organizer/team?tab=shifts", eventId: s.event_id });
  for (const t of tiers.data ?? []) out.push({ id: `tk-${t.id}`, sourceId: t.id, layer: "tickets", title: `Release: ${t.name}`, sub: ev.get(t.event_id)?.name, start: t.sale_start!, end: null, href: `/organizer/events/${t.event_id}?tab=sell`, eventId: t.event_id });
  for (const p of promos.data ?? []) out.push({ id: `p-${p.id}`, sourceId: p.id, layer: /email/i.test(p.channel) ? "emails" : "promotion", title: p.channel, sub: ev.get(p.event_id)?.name, start: p.scheduled_at!, end: null, href: `/organizer/events/${p.event_id}/promotion`, eventId: p.event_id });
  for (const p of pays.data ?? []) out.push({ id: `pay-${p.id}`, sourceId: p.id, layer: "payments", title: `Payment due: ${p.payee}`, sub: `${money(p.amount)} ${p.kind}`, start: p.due_at!, end: null, href: `/organizer/events/${p.event_id}?tab=money&section=payables`, eventId: p.event_id });
  for (const i of invoices.data ?? []) out.push({ id: `inv-${i.id}`, sourceId: i.id, layer: "payments", title: `Invoice due: ${i.number}`, sub: `${i.client_name} · ${money(i.total)}`, start: `${i.due_date}T09:00:00Z`, end: null, href: `/organizer/money/invoices/${i.id}` });
  for (const c of entries.data ?? []) out.push({ id: `c-${c.id}`, sourceId: c.id, layer: (c.layer === "external" ? "external" : "meetings") as LayerKey, title: c.title, sub: c.detail, start: c.starts_at, end: c.ends_at, href: c.event_id ? `/organizer/events/${c.event_id}` : "/organizer/calendar", eventId: c.event_id, draggable: c.layer !== "external" });
  for (const b of busy.data ?? []) out.push({ id: `busy-${b.id}`, sourceId: String(b.id), layer: "external", title: "Busy", sub: "From your connected calendar", start: b.starts_at, end: b.ends_at, href: "/organizer/calendar" });
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
