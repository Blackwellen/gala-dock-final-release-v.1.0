import "server-only";
import { stripeLive } from "@/lib/stripe";
import type { OrganizerCtx } from "./context";
import { money, dateShort, dayMonth } from "@/lib/format";

type Sb = OrganizerCtx["supabase"];
export type EventRow = { id: string; name: string; event_type: string; status: string; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; city: string; capacity: number | null; guest_count: number; budget_total: number | null; target_profit: number | null; revenue_goal: number | null; cover_image: string; client_name: string; tags: string[]; visibility: string; settings: Record<string, unknown>; slug: string | null; owner_id: string; created_at: string };
export type EventStats = EventRow & { sold: number; ticketCap: number; ticketRevenue: number; readiness: number; checks: { key: string; label: string; ok: boolean; severity: string }[]; nextTask?: { title: string; due_at: string | null } | null; providersConfirmed: number; providersTotal: number; committed: number };

const EVENT_COLS = "id,name,event_type,status,starts_at,ends_at,venue_name,location,city,capacity,guest_count,budget_total,target_profit,revenue_goal,cover_image,client_name,tags,visibility,settings,slug,owner_id,created_at";

export async function listWorkspaceEvents(sb: Sb, workspaceId: string) {
  const { data } = await sb.from("events").select(EVENT_COLS).eq("workspace_id", workspaceId).order("starts_at", { ascending: true });
  return (data ?? []) as unknown as EventRow[];
}

/** Enrich events with ticket, readiness, provider and next-task stats from canonical records. */
export async function withStats(sb: Sb, events: EventRow[]): Promise<EventStats[]> {
  if (!events.length) return [];
  const ids = events.map(e => e.id);
  const [{ data: tiers }, { data: items }, { data: tasks }, readiness] = await Promise.all([
    sb.from("ticket_tiers").select("event_id,quantity,sold,price,kind").in("event_id", ids),
    sb.from("build_items").select("event_id,status,role,amount").in("event_id", ids),
    sb.from("tasks").select("event_id,title,due_at,status").in("event_id", ids).neq("status", "done").order("due_at", { ascending: true }),
    Promise.all(ids.map(id => sb.rpc("event_readiness", { p_event: id }).then(r => [id, r.data] as const))),
  ]);
  const rmap = new Map(readiness);
  return events.map(e => {
    const t = (tiers ?? []).filter(x => x.event_id === e.id && x.kind !== "comp");
    const b = (items ?? []).filter(x => x.event_id === e.id && x.role === "primary" && !["cancelled", "declined"].includes(x.status));
    const r = rmap.get(e.id) as { score: number; checks: EventStats["checks"] } | null;
    return {
      ...e,
      sold: t.reduce((s, x) => s + x.sold, 0), ticketCap: t.reduce((s, x) => s + x.quantity, 0) || (e.capacity ?? 0),
      ticketRevenue: t.reduce((s, x) => s + x.sold * Number(x.price), 0),
      readiness: r?.score ?? 0, checks: r?.checks ?? [],
      nextTask: (tasks ?? []).find(x => x.event_id === e.id) ?? null,
      providersConfirmed: b.filter(x => ["confirmed", "fulfilled"].includes(x.status)).length, providersTotal: b.length,
      committed: b.filter(x => ["confirmed", "fulfilled", "held"].includes(x.status)).reduce((s, x) => s + Number(x.amount ?? 0), 0),
    };
  });
}

export type Attention = { id: string; severity: "critical" | "high" | "action"; due: string | null; title: string; detail: string; image: string; cta: string; href: string; dueLabel: string };
const hoursUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 36e5;
const dueLabel = (iso: string | null) => { if (!iso) return "Action needed"; const h = hoursUntil(iso); if (h < 0) return "Overdue"; if (h < 24) return `${Math.max(1, Math.round(h))}h left`; return `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"} left`; };

/** Urgency-ranked attention queue: severity first, then deadline. */
export async function attentionQueue(sb: Sb, workspaceId: string, events: EventStats[]): Promise<Attention[]> {
  const ids = events.map(e => e.id); if (!ids.length) return [];
  const byId = new Map(events.map(e => [e.id, e]));
  const soon = new Date(Date.now() + 14 * 864e5).toISOString();
  const [{ data: holds }, { data: awaiting }, { data: pays }, { data: invoices }, { data: approvals }] = await Promise.all([
    sb.from("build_items").select("id,event_id,title,hold_expires_at,image,category").in("event_id", ids).eq("status", "held").order("hold_expires_at"),
    sb.from("build_items").select("id,event_id,title,response_deadline,image,category").in("event_id", ids).in("status", ["sent", "awaiting"]).order("response_deadline"),
    sb.from("payments").select("id,event_id,payee,kind,amount,due_at,status").in("event_id", ids).in("status", ["due", "overdue"]).order("due_at"),
    sb.from("invoices").select("id,number,client_name,total,amount_paid,due_date,status,event_id").eq("workspace_id", workspaceId).eq("status", "overdue"),
    sb.from("agent_approvals").select("id,title,detail,event_id,created_at").eq("workspace_id", workspaceId).eq("status", "pending"),
  ]);
  const out: Attention[] = [];
  for (const h of holds ?? []) { const e = byId.get(h.event_id); out.push({ id: `hold-${h.id}`, severity: h.hold_expires_at && hoursUntil(h.hold_expires_at) < 24 ? "critical" : "high", due: h.hold_expires_at, title: h.category === "venue" ? "Venue decision required" : "Hold decision required", detail: `${h.title} hold expires ${h.hold_expires_at ? dateShort(h.hold_expires_at) : "soon"}`, image: e?.cover_image ?? h.image, cta: "Review options", href: `/organizer/events/${h.event_id}?tab=plan&section=suppliers`, dueLabel: dueLabel(h.hold_expires_at) }); }
  for (const a of awaiting ?? []) { if (a.response_deadline && a.response_deadline > soon) continue; const e = byId.get(a.event_id); out.push({ id: `await-${a.id}`, severity: "action", due: a.response_deadline, title: "Supplier response overdue", detail: `${a.title} — awaiting your supplier's response`, image: a.image || e?.cover_image || "", cta: "View request", href: `/organizer/events/${a.event_id}?tab=plan&section=suppliers`, dueLabel: a.response_deadline && hoursUntil(a.response_deadline) < 0 ? "Overdue" : "Action needed" }); }
  for (const p of pays ?? []) { const e = byId.get(p.event_id); out.push({ id: `pay-${p.id}`, severity: p.status === "overdue" ? "critical" : "high", due: p.due_at, title: `Unpaid ${p.kind}`, detail: `${money(p.amount)} ${p.kind} due for ${p.payee}`, image: e?.cover_image ?? "", cta: "View payment", href: `/organizer/events/${p.event_id}?tab=money&section=payables`, dueLabel: dueLabel(p.due_at) }); }
  for (const i of invoices ?? []) out.push({ id: `inv-${i.id}`, severity: "high", due: i.due_date ? `${i.due_date}T17:00:00Z` : null, title: "Invoice overdue", detail: `${i.number} · ${money(Number(i.total) - Number(i.amount_paid))} from ${i.client_name}`, image: (i.event_id && byId.get(i.event_id)?.cover_image) || "", cta: "View invoice", href: `/organizer/money/invoices/${i.id}`, dueLabel: "Overdue" });
  for (const e of events) {
    if (!e.starts_at || !e.ticketCap || !["on_sale", "published"].includes(e.status)) continue;
    const daysOut = (new Date(e.starts_at).getTime() - Date.now()) / 864e5; if (daysOut < 0 || daysOut > 120) continue;
    const created = new Date(e.created_at).getTime(), span = Math.max(1, new Date(e.starts_at).getTime() - created);
    const expected = Math.min(1, (Date.now() - created) / span), actual = e.sold / e.ticketCap;
    if (actual + 0.1 < expected) out.push({ id: `pace-${e.id}`, severity: "high", due: e.starts_at, title: "Ticket sales behind pace", detail: `${e.name} — ${Math.round((1 - actual / Math.max(expected, .01)) * 100)}% below target pace`, image: e.cover_image, cta: "Boost promotion", href: `/organizer/events/${e.id}/promotion`, dueLabel: dueLabel(e.starts_at) });
  }
  for (const a of approvals ?? []) out.push({ id: `appr-${a.id}`, severity: "action", due: null, title: a.title, detail: a.detail, image: (a.event_id && byId.get(a.event_id)?.cover_image) || "", cta: "Review approval", href: "/organizer/agent?tab=approvals", dueLabel: "Approval needed" });
  const rank = { critical: 0, high: 1, action: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

/** Monthly series (last n months) of ledger income/costs for sparklines. */
export async function ledgerSeries(sb: Sb, workspaceId: string, months = 7) {
  const since = new Date(); since.setMonth(since.getMonth() - months + 1, 1); since.setHours(0, 0, 0, 0);
  const { data } = await sb.from("transactions").select("amount,kind,occurred_at,category,status").eq("workspace_id", workspaceId).eq("livemode", stripeLive()).gte("occurred_at", since.toISOString());
  const keys = Array.from({ length: months }, (_, i) => { const d = new Date(since); d.setMonth(since.getMonth() + i); return d.toISOString().slice(0, 7); });
  const income = keys.map(k => (data ?? []).filter(t => t.occurred_at.startsWith(k) && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0));
  const costs = keys.map(k => (data ?? []).filter(t => t.occurred_at.startsWith(k) && Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0));
  const labels = keys.map(k => new Date(`${k}-01T12:00:00Z`).toLocaleString("en-GB", { month: "short" }));
  return { labels, income, costs, rows: data ?? [] };
}

/** Overlapping shifts per crew member = scheduling conflicts. */
export function shiftConflicts<T extends { id: string; crew_id: string | null; starts_at: string; ends_at: string; status: string }>(shifts: T[]) {
  const out: [T, T][] = [];
  const real = shifts.filter(s => s.crew_id && !["unavailable", "travel"].includes(s.status));
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i]!, b = real[j]!;
    if (a.crew_id === b.crew_id && a.starts_at < b.ends_at && b.starts_at < a.ends_at) out.push([a, b]);
  }
  return out;
}
export const eventDateLabel = (e: { starts_at: string | null }) => (e.starts_at ? dayMonth(e.starts_at) : "TBC");
