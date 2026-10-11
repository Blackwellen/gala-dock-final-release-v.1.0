import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { EV_COLS, loadEventMetrics, type Ev } from "../../_a/events";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV: ticketed events with sales totals, or (tab=orders&event=…) one event's orders. Buyer emails are excluded. */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("tickets");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams, date = new Date().toISOString().slice(0, 10);
  const headers = (name: string) => ({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${date}.csv"`, "Cache-Control": "private, no-store" });
  const event = sp.get("event");
  if (sp.get("tab") === "orders" && isUuid(event)) {
    const t = await rows<{ order_ref: string; attendee_name: string; status: string; price_paid: number; created_at: string }>(
      db.from("tickets").select("order_ref,attendee_name,status,price_paid,created_at").eq("event_id", event).order("created_at", { ascending: false }).limit(20000));
    const orders = new Map<string, { buyer: string; n: number; total: number; at: string; refunded: number }>();
    for (const x of t) { const o = orders.get(x.order_ref) ?? { buyer: x.attendee_name, n: 0, total: 0, at: x.created_at, refunded: 0 }; o.n++; o.total += Number(x.price_paid); if (x.status === "refunded") o.refunded++; orders.set(x.order_ref, o); }
    const body = [...orders].map(([ref, o]) => [ref, o.buyer, o.n, o.total.toFixed(2), o.refunded, o.at.slice(0, 16)].map(csv).join(","));
    return new NextResponse([["Order", "Buyer", "Tickets", "Total (GBP)", "Refunded tickets", "Placed"].join(","), ...body].join("\n"), { headers: headers("orders") });
  }
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500);
  let query = db.from("events").select(EV_COLS).order("created_at", { ascending: false }).limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Ev>(query), loadEventMetrics(db, 30)]);
  const body = all.filter(e => (metrics.get(e.id)?.capacity ?? 0) > 0).map(e => { const m = metrics.get(e.id)!; return [e.id, e.settings?.reference ?? "", e.name, e.starts_at ?? "", e.venue_name, e.city,
    m.sold, m.capacity, m.gross.toFixed(2), m.orders, m.used, m.refunded, m.tier_status ?? "", m.scan_anomalies].map(csv).join(","); });
  return new NextResponse([["Event ID", "Reference", "Event", "Starts", "Venue", "City", "Sold", "Capacity", "Gross (GBP)", "Orders", "Scanned", "Refunded", "Sales status", "Scan anomalies"].join(","), ...body].join("\n"), { headers: headers("ticketed-events") });
}
