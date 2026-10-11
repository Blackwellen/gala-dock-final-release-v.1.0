import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { EV_COLS, evStatus, loadEventMetrics, readiness, type Ev } from "../../_a/events";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of events (selected rows or current search) with ticketing totals. No attendee personal data. */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("events");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams, now = requestTime();
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500), q = (sp.get("q") ?? "").toLowerCase();
  let query = db.from("events").select(EV_COLS).order("created_at", { ascending: false }).limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Ev>(query), loadEventMetrics(db, 30)]);
  const pick = all.filter(e => !q || `${e.name} ${e.city} ${e.venue_name}`.toLowerCase().includes(q));
  const head = ["Event ID", "Reference", "Name", "Type", "Status", "Visibility", "Starts", "City", "Capacity", "Sold", "Gross (GBP)", "Providers", "Readiness %", "Open flags"];
  const body = pick.map(e => { const m = metrics.get(e.id); return [e.id, e.settings?.reference ?? "", e.name, e.event_type, evStatus(e, now).label, e.visibility, e.starts_at ?? "", e.city,
    m?.capacity ?? 0, m?.sold ?? 0, (m?.gross ?? 0).toFixed(2), m?.providers ?? 0, readiness(e, m), m?.flags ?? 0].map(csv).join(","); });
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="events-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
