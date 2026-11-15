import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { csvCell as csv } from "@/lib/provider/csv";
import { londonStamp, londonYmd } from "../../_b/format";
import { EV_COLS, evStatus, loadEventMetrics, readiness, type Ev, type EvMetric } from "../../_a/events";

type Row = Ev & { metrics: EvMetric | null };
type Page = { rows: Row[]; next: Record<string, unknown> | null };
const SORTS = ["featured", "newest", "starts", "name"];

/** CSV of events (selected rows, or every event matching the page's tab, search, filters and sort) with ticketing totals.
 *  No attendee personal data. Q51: the header Export used to ignore the tab and filters (only a name/city/venue `q` match). */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("events");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams, now = requestTime();
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500);
  let pick: { e: Ev; m?: EvMetric }[];
  if (ids.length) {
    const [all, metrics] = await Promise.all([rows<Ev>(db.from("events").select(EV_COLS).in("id", ids).order("created_at", { ascending: false })), loadEventMetrics(db, 30)]);
    pick = all.map(e => ({ e, m: metrics.get(e.id) }));
  } else {
    // Same filters and SQL paging as the Events page (admin_events_page), up to 5,000 rows.
    const tab = ["public", "ticketed", "live", "flagged"].includes(sp.get("filter") ?? "") ? sp.get("filter")! : "all";
    const filters: Record<string, string> = { tab };
    const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 80);
    if (q) filters.q = q;
    for (const k of ["type", "status", "when", "vis", "tix", "owner", "city"]) { const v = sp.get(k); if (v) filters[k] = v; }
    const sort = SORTS.includes(sp.get("sort") ?? "") ? sp.get("sort")! : "featured";
    pick = [];
    let after: Record<string, unknown> | null = null;
    do {
      const { data, error } = await db.rpc("admin_events_page", { p_filters: filters, p_sort: sort, p_limit: 200, p_after: after });
      if (error) return new NextResponse("Export failed", { status: 500 });
      const page = data as Page;
      for (const r of page.rows) pick.push({ e: r, m: r.metrics ? { ...r.metrics, gross: Number(r.metrics.gross), capacity: Number(r.metrics.capacity), sold: Number(r.metrics.sold) } : undefined });
      after = page.next;
    } while (after && pick.length < 5000);
  }
  const head = ["Event ID", "Reference", "Name", "Type", "Status", "Visibility", "Starts (London)", "City", "Capacity", "Sold", "Gross (GBP)", "Providers", "Readiness %", "Open flags"];
  const body = pick.map(({ e, m }) => [e.id, e.settings?.reference ?? "", e.name, e.event_type, evStatus(e, now).label, e.visibility, e.starts_at ? londonStamp(e.starts_at) : "", e.city,
    m?.capacity ?? 0, m?.sold ?? 0, (m?.gross ?? 0).toFixed(2), m?.providers ?? 0, readiness(e, m), m?.flags ?? 0].map(csv).join(","));
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="events-${londonYmd()}.csv"`, "Cache-Control": "private, no-store" } });
}
