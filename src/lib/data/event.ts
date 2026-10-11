import "server-only";
import { notFound } from "next/navigation";
import type { OrganizerCtx } from "./context";

export type ProEvent = Awaited<ReturnType<typeof getProEvent>>;
type Check = { key: string; label: string; ok: boolean; severity: string };

/** Professional event header data. 404s unless the event belongs to the active workspace (RLS also enforces). */
export async function getProEvent(ctx: OrganizerCtx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: e } = await ctx.supabase.from("events").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) notFound();
  const { data: r } = await ctx.supabase.rpc("event_readiness", { p_event: id });
  const readiness = (r ?? { score: 0, checks: [] }) as { score: number; checks: Check[] };
  const settings = (e.settings ?? {}) as Record<string, unknown>;
  return { ...e, settings, readiness };
}

/** Everything the five tabs need, loaded in parallel (each tab reads what it uses). */
export async function loadEventData(ctx: OrganizerCtx, eventId: string) {
  const sb = ctx.supabase;
  const [tiers, items, programme, tasks, guests, shifts, payments, txs, incidents, promos, promoters, media, metrics, series, checkins, crew, invoices, codes, requests] = await Promise.all([
    sb.from("ticket_tiers").select("*").eq("event_id", eventId).order("sort"),
    sb.from("build_items").select("*").eq("event_id", eventId).order("sort"),
    sb.from("programme_items").select("*").eq("event_id", eventId).order("starts_at"),
    sb.from("tasks").select("*").eq("event_id", eventId).order("due_at", { ascending: true, nullsFirst: false }),
    sb.from("guests").select("id,name,email,status,plus_one,tickets,group_name,dietary,invited_at,checked_in_at").eq("event_id", eventId).order("name"),
    sb.from("shifts").select("*").eq("event_id", eventId).order("starts_at"),
    ctx.canMoney ? sb.from("payments").select("*").eq("event_id", eventId).order("due_at") : Promise.resolve({ data: [] }),
    ctx.canMoney ? sb.from("transactions").select("*").eq("event_id", eventId).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [] }),
    sb.from("incidents").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    sb.from("promotions").select("*").eq("event_id", eventId).order("scheduled_at"),
    sb.from("promoters").select("*").eq("event_id", eventId).order("tickets_sold", { ascending: false }),
    sb.from("media_assets").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    sb.from("event_metrics_daily").select("*").eq("event_id", eventId).order("day"),
    sb.rpc("ticket_sales_series", { p_event: eventId, p_days: 30 }),
    sb.from("check_ins").select("result,created_at").eq("event_id", eventId),
    sb.from("crew_members").select("id,name,role,avatar,status,member_type").eq("workspace_id", ctx.workspace.id),
    ctx.canMoney ? sb.from("invoices").select("id,number,client_name,total,amount_paid,status,due_date").eq("event_id", eventId) : Promise.resolve({ data: [] }),
    sb.from("discount_codes").select("*").eq("event_id", eventId),
    sb.from("provider_requests").select("id,reference,title,category,status,response_deadline,created_at").eq("event_id", eventId).order("created_at", { ascending: false }),
  ]);
  const { data: activity } = await sb.rpc("event_activity", { p_event: eventId, p_limit: 12 });
  const { data: vmap } = await sb.from("venue_maps").select("id,version,status,structure,overlay,created_at").eq("event_id", eventId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { count: validTickets } = await sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["valid", "used"]).is("replaced_by", null);
  const { count: usedTickets } = await sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "used");
  const T = tiers.data ?? [];
  const paidTiers = T.filter(t => t.kind !== "comp");
  const sold = paidTiers.reduce((s, t) => s + t.sold, 0), cap = paidTiers.reduce((s, t) => s + t.quantity, 0);
  const ticketRevenue = paidTiers.reduce((s, t) => s + t.sold * Number(t.price), 0);
  const potential = paidTiers.reduce((s, t) => s + t.quantity * Number(t.price), 0);
  const B = (items.data ?? []);
  const primary = B.filter(b => b.role === "primary" && !["cancelled", "declined"].includes(b.status));
  const committed = B.filter(b => ["confirmed", "held", "fulfilled"].includes(b.status)).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const estimated = primary.reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const paidOut = (payments.data ?? []).filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const costsActual = (txs.data ?? []).filter(t => Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0) + paidOut;
  const otherIncome = (txs.data ?? []).filter(t => Number(t.amount) > 0 && t.category !== "Ticket sales").reduce((s, t) => s + Number(t.amount), 0);
  const crewMap = new Map((crew.data ?? []).map(c => [c.id, c]));
  const S = shifts.data ?? [];
  const assigned = new Set(S.filter(s => s.crew_id && ["confirmed", "pending"].includes(s.status)).map(s => s.crew_id)).size;
  const crewNeeded = Math.max(assigned, S.reduce((s, x) => s + (x.headcount ?? 1), 0));
  return {
    tiers: T, items: B, primary, programme: programme.data ?? [], tasks: tasks.data ?? [], guests: guests.data ?? [], shifts: S, crewMap,
    payments: payments.data ?? [], txs: txs.data ?? [], incidents: incidents.data ?? [], promos: promos.data ?? [], promoters: promoters.data ?? [],
    media: media.data ?? [], metrics: metrics.data ?? [], series: (series.data ?? []) as { day: string; tickets: number; gross: number }[],
    checkins: checkins.data ?? [], invoices: invoices.data ?? [], codes: codes.data ?? [], requests: requests.data ?? [],
    sold, cap, ticketRevenue, potential, committed, estimated, costsActual, otherIncome, assigned, crewNeeded,
    vmap: vmap ?? null, activity: (activity ?? []) as { id: number; event: string; text: string; actor: string; created_at: string }[],
    validTickets: validTickets ?? 0, usedTickets: usedTickets ?? 0,
  };
}
export type EventData = Awaited<ReturnType<typeof loadEventData>>;
