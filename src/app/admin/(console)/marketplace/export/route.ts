import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { L_COLS, loadListingMetrics, lHealth, cancelRate, type Listing } from "../../_a/listings";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of marketplace listings (selected rows, or the current tab) with 30-day reliability. */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("marketplace");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500), tab = sp.get("tab") ?? "", q = (sp.get("q") ?? "").toLowerCase();
  let query = db.from("listings").select(L_COLS).order("created_at").limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Listing>(query), loadListingMetrics(db, 30)]);
  const pick = all.filter(l => (ids.length || (tab === "services" ? l.kind === "service" : tab === "reliability" ? true : l.kind === "venue")) && (!q || `${l.name} ${l.city}`.toLowerCase().includes(q)));
  const head = ["Listing ID", "Name", "Type", "Category", "City", "Verified", "Review status", "Booking mode", "Published", "Requests 30d", "Response hours", "Cancel rate %", "Health", "Rating"];
  const body = pick.map(l => { const m = metrics.get(l.id); return [l.id, l.name, l.kind, l.category, l.city, l.verified ? "yes" : "no", l.review_status, l.booking_mode, l.published ? "yes" : "no",
    m?.requests ?? 0, l.response_hours ?? "", cancelRate(m).toFixed(1), lHealth(l, m).label, l.rating ?? ""].map(csv).join(","); });
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="listings-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
