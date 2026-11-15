import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, rowsIn, isUuid } from "@/lib/workspace/db";
import { L_COLS, loadListingMetrics, listingMatches, lHealth, cancelRate, type Listing } from "../../_a/listings";
import { londonYmd } from "../../_b/format";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of marketplace listings (selected rows, or the current tab) with 30-day reliability. */
export async function GET(request: NextRequest) {
  const { db, allowed, permissions } = await requireAdminPermission("marketplace");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500), tab = ["services", "requests", "reliability"].includes(sp.get("tab") ?? "") ? sp.get("tab")! : "venues";
  let query = db.from("listings").select(L_COLS).order("created_at").limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Listing>(query), loadListingMetrics(db, 30)]);
  // Q51: same filter as the page, including owner names in search (selected rows bypass it).
  let ownerText: (l: Listing) => string = () => "";
  if (!ids.length) {
    const ws = await rowsIn<{ id: string; name: string; owner_id: string }>(all.map(l => l.workspace_id), batch => db.from("workspaces").select("id,name,owner_id").in("id", batch));
    const people = permissions.has("users") || permissions.has("support") ? new Map((await rowsIn<{ id: string; full_name: string }>(ws.map(w => w.owner_id), batch => db.from("profiles").select("id,full_name").in("id", batch))).map(p => [p.id, p.full_name])) : new Map<string, string>();
    const wsMap = new Map(ws.map(w => [w.id, w]));
    ownerText = l => { const w = wsMap.get(l.workspace_id); return `${w?.name ?? ""} ${w ? people.get(w.owner_id) ?? "" : ""}`; };
  }
  const f = (k: string) => sp.get(k) ?? "";
  const pick = ids.length ? all : all.filter(l => listingMatches(l, metrics.get(l.id), tab, f, ownerText(l)));
  const head = ["Listing ID", "Name", "Type", "Category", "City", "Verified", "Review status", "Booking mode", "Published", "Requests 30d", "Response hours", "Cancel rate %", "Health", "Rating"];
  const body = pick.map(l => { const m = metrics.get(l.id); return [l.id, l.name, l.kind, l.category, l.city, l.verified ? "yes" : "no", l.review_status, l.booking_mode, l.published ? "yes" : "no",
    m?.requests ?? 0, l.response_hours ?? "", cancelRate(m).toFixed(1), lHealth(l, m).label, l.rating ?? ""].map(csv).join(","); });
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="listings-${londonYmd()}.csv"`, "Cache-Control": "private, no-store" } });
}
