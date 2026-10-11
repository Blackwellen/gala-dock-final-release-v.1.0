import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { delta } from "@/lib/workspace/format";
import {
  workspaceItems, workspaceJobs, workspaceListings, workspaceSpaces, workspaceCrew, itemState, isEmergency, isQuoteRequested,
  reliability, eligibility, dailySeries, startOfDay, startOfMonth, OPEN, type Item,
} from "@/lib/provider/queries";

export type Range = "today" | "7d" | "30d";
const rangeDays: Record<Range, number> = { today: 1, "7d": 7, "30d": 30 };

export type GlanceKind = "enquiry" | "quote" | "hold" | "standby" | "emergency";
export type GlanceRow = { item: Item; kind: GlanceKind; title: string; client: string; place: string; at: string | null; due: string | null };

function glanceKind(i: Item): GlanceKind {
  if (i.status === "held") return "hold";
  if (isEmergency(i)) return i.role === "primary" ? "emergency" : "standby";
  if (i.role !== "primary") return "standby";
  if (isQuoteRequested(i)) return "quote";
  return "enquiry";
}
const typeLabel = (t?: string) => t ? t.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase()) : "Event";
const kindTitle: Record<GlanceKind, string> = { enquiry: "Enquiry", quote: "Quote Request", hold: "Conditional Hold Expiring", standby: "Standby Request", emergency: "Emergency Request" };

export async function homeData(range: Range) {
  const ctx = await getProvider();
  const [items, jobs, listings, spaces, crew] = await Promise.all([workspaceItems(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceCrew()]);
  const now = Date.now();
  const days = rangeDays[range];
  const from = range === "today" ? startOfDay(0, now) : now - days * 864e5;
  const prevFrom = range === "today" ? startOfDay(-1, now) : from - days * 864e5;
  const inWin = (t: string | null | undefined, a: number, b: number) => !!t && new Date(t).getTime() >= a && new Date(t).getTime() < b;

  // KPIs (period vs previous period of equal length)
  const enquiries = items.filter(i => inWin(i.created_at, from, now)).length;
  const enquiriesPrev = items.filter(i => inWin(i.created_at, prevFrom, from)).length;
  const pending = items.filter(i => OPEN.includes(i.status) && itemState(i, now) !== "expired");
  const confirmed = jobs.filter(j => ["confirmed", "active"].includes(j.status) && inWin(j.created_at, now - 7 * 864e5, now)).length;
  const confirmedPrev = jobs.filter(j => ["confirmed", "active"].includes(j.status) && inWin(j.created_at, now - 14 * 864e5, now - 7 * 864e5)).length;
  // Month-to-date vs the same span of last month (London calendar).
  const monthStart = new Date(startOfMonth(0, now)), prevMonthStart = new Date(startOfMonth(-1, now));
  const prevMonthSameDay = new Date(Math.min(prevMonthStart.getTime() + (now - monthStart.getTime()), monthStart.getTime()));
  const tx = await rows<{ amount: number; occurred_at: string; kind: string; status: string }>(
    ctx.db.from("transactions").select("amount,occurred_at,kind,status").eq("workspace_id", ctx.workspace.id).eq("kind", "income").eq("status", "completed")
      .gte("occurred_at", new Date(prevMonthStart).toISOString()));
  const revenue = tx.filter(t => new Date(t.occurred_at) >= monthStart).reduce((a, t) => a + Number(t.amount), 0);
  const revenuePrev = tx.filter(t => new Date(t.occurred_at) >= prevMonthStart && new Date(t.occurred_at) < prevMonthSameDay).reduce((a, t) => a + Number(t.amount), 0);

  // Today at a glance
  const glance = (list: Item[]): GlanceRow[] => list.map(i => {
    const kind = glanceKind(i);
    const space = (i.request?.requirements?.space as string | undefined) ?? i.package;
    return {
      item: i, kind,
      title: kind === "enquiry" ? `${typeLabel(i.event?.event_type)} Enquiry` : kind === "quote" ? `${typeLabel(i.event?.event_type)} Event Request` : kindTitle[kind],
      client: kind === "hold" ? i.event?.name ?? "" : i.event?.client_name ?? "",
      place: kind === "hold" ? `${space} · ${i.event?.starts_at ? new Date(i.event.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}` : `${space} · ${i.event?.guest_count ?? 0} guests`,
      at: i.created_at, due: kind === "hold" ? i.hold_expires_at : i.response_deadline,
    };
  });
  const open = items.filter(i => (OPEN.includes(i.status) && itemState(i, now) !== "expired") || i.status === "held");
  const due = (r: GlanceRow) => (r.due ? new Date(r.due).getTime() : Infinity);
  const all = glance(open).sort((a, b) => due(a) - due(b));
  const views = {
    today: all.filter(r => due(r) - now < 24 * 36e5),
    upcoming: all.filter(r => due(r) - now >= 24 * 36e5),
    overdue: glance(items.filter(i => itemState(i, now) === "expired" && now - new Date(i.response_deadline ?? 0).getTime() < 14 * 864e5)),
    attention: all.filter(r => r.kind === "emergency" || (r.kind === "hold" && due(r) - now < 12 * 36e5) || (r.kind === "standby")),
  };

  // Schedule: today's calendar entries plus bookings that start today
  const dayStart = startOfDay(0, now), dayEnd = startOfDay(1, now);
  const entries = await rows<{ id: string; title: string; detail: string; starts_at: string; layer: string }>(
    ctx.db.from("calendar_entries").select("id,title,detail,starts_at,layer").eq("workspace_id", ctx.workspace.id)
      .gte("starts_at", new Date(dayStart).toISOString()).lt("starts_at", new Date(dayEnd).toISOString()).order("starts_at"));
  const todaysJobs = jobs.filter(j => inWin(j.starts_at, dayStart, dayEnd) && j.status !== "cancelled");
  const schedule = [
    ...entries.map(e => ({ id: e.id, at: e.starts_at, title: e.title, lines: e.detail.split(" · "), href: `/provider/calendar?date=${e.starts_at.slice(0, 10)}&view=day` })),
    ...todaysJobs.map(j => ({ id: j.id, at: j.starts_at, title: j.event_name, lines: [spaces.find(s => s.id === j.space_id)?.name ?? j.location, `${j.client_name}${j.guests ? ` (${j.guests} ppl)` : ""}`], href: `/provider/bookings/${j.id}` })),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5);

  // Reliability & eligibility
  const rel = reliability(items, jobs, now);
  const relPrev = reliability(items.filter(i => new Date(i.created_at).getTime() < now - 30 * 864e5), jobs.filter(j => new Date(j.created_at).getTime() < now - 30 * 864e5), now - 30 * 864e5);
  const elig = eligibility(rel, listings, ctx.workspace.verification_status === "verified");

  // Venue & service performance (last 30 days of bookings by start date)
  const thirty = now - 30 * 864e5;
  const venueJobs = jobs.filter(j => j.mode === "venue" && j.status !== "cancelled");
  const serviceJobs = jobs.filter(j => j.mode === "service" && j.status !== "cancelled");
  const recentVenue = venueJobs.filter(j => inWin(j.created_at, thirty, now) || inWin(j.starts_at, thirty, now + 30 * 864e5));
  const prevVenue = venueJobs.filter(j => inWin(j.starts_at, thirty - 30 * 864e5, thirty)).length;
  const recentService = serviceJobs.filter(j => inWin(j.created_at, thirty, now) || inWin(j.starts_at, thirty, now + 30 * 864e5));
  const prevService = serviceJobs.filter(j => inWin(j.starts_at, thirty - 30 * 864e5, thirty)).length;
  // Occupancy: booked space-hours over the next 30 days ÷ bookable space-hours (12 h/day per published space).
  const bookable = spaces.filter(s => s.status === "published").length * 30 * 12;
  const booked = venueJobs.filter(j => j.space_id && inWin(j.starts_at, now, now + 30 * 864e5))
    .reduce((a, j) => a + Math.min(12, (new Date(j.ends_at).getTime() - new Date(j.starts_at).getTime()) / 36e5), 0);
  const occupancy = bookable ? Math.round((100 * booked) / bookable) : 0;
  const serviceRevenue = recentService.reduce((a, j) => a + Number(j.value), 0);
  const performance = {
    venue: { listing: listings.find(l => l.kind === "venue"), bookings: recentVenue.length, delta: delta(recentVenue.length, prevVenue), occupancy, series: dailySeries(venueJobs, j => j.starts_at, () => 1, 21, now + 21 * 864e5) },
    service: { listing: listings.find(l => l.kind === "service"), bookings: recentService.length, delta: delta(recentService.length, prevService), revenue: serviceRevenue, series: dailySeries(serviceJobs, j => j.starts_at, j => Number(j.value), 21, now + 21 * 864e5) },
  };

  const upcoming = jobs.filter(j => ["confirmed", "held"].includes(j.status) && new Date(j.starts_at).getTime() > now).slice(0, 4)
    .map(j => ({ ...j, spaceName: spaces.find(s => s.id === j.space_id)?.name ?? listings.find(l => l.id === j.listing_id)?.name ?? "" }));

  // Team availability with upcoming assignment counts
  const shifts = await rows<{ crew_id: string; starts_at: string; status: string }>(
    ctx.db.from("shifts").select("crew_id,starts_at,status").eq("workspace_id", ctx.workspace.id).gte("ends_at", new Date(now).toISOString()));
  const team = crew.filter(c => c.member_type === "member").slice(0, 4).map(c => ({ ...c, bookings: shifts.filter(s => s.crew_id === c.id && s.status !== "unavailable").length }));

  // Agent insights, each derived from the records above
  const lowDates = Array.from({ length: 14 }, (_, d) => startOfDay(d + 1, now)).filter(d => !venueJobs.some(j => inWin(j.starts_at, d, d + 864e5))).length;
  const reviewable = jobs.filter(j => j.status === "completed" && inWin(j.ends_at, now - 30 * 864e5, now)).length;
  const topPackage = await rows<{ id: string; name: string; details: Record<string, number> }>(
    ctx.db.from("packages").select("id,name,details").eq("workspace_id", ctx.workspace.id).eq("status", "published"));
  const best = topPackage.sort((a, b) => (b.details?.bookings ?? 0) - (a.details?.bookings ?? 0))[0];

  return {
    now, user: ctx.userName.split(" ")[0], workspace: ctx.workspace.name, range,
    kpis: {
      enquiries, enquiriesDelta: delta(enquiries, enquiriesPrev), enquirySeries: dailySeries(items, i => i.created_at, () => 1, 14, now),
      pending: pending.length, pendingDueToday: pending.filter(i => i.response_deadline && new Date(i.response_deadline).getTime() < dayEnd).length,
      pendingSeries: dailySeries(pending, i => i.response_deadline, () => 1, 14, now + 7 * 864e5),
      confirmed, confirmedDelta: delta(confirmed, confirmedPrev), confirmedSeries: dailySeries(jobs.filter(j => j.status !== "cancelled"), j => j.created_at, () => 1, 14, now),
      revenue, revenueDelta: delta(revenue, revenuePrev), revenueSeries: dailySeries(tx, t => t.occurred_at, t => Number(t.amount), 30, now),
    },
    views, schedule, rel, relPrev, elig, performance, upcoming, team,
    insights: { pending: pending.length, lowDates, best, reviewable },
  };
}
