import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { health, loadMetrics, WS_COLS, type Ws } from "../../_a/workspaces";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of workspaces (selected rows, or the current type filter) with 30-day metrics. No payout or bank details. */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("workspaces");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500), filter = sp.get("filter") ?? "", q = (sp.get("q") ?? "").toLowerCase();
  let query = db.from("workspaces").select(WS_COLS).order("created_at").limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Ws>(query), loadMetrics(db, 30)]);
  const pick = all.filter(w => (ids.length || !filter || (filter === "suspended" ? w.status === "suspended" : w.kind === filter)) && (!q || w.name.toLowerCase().includes(q)));
  const head = ["Workspace ID", "Reference", "Name", "Type", "Plan", "Status", "Verification", "Commission %", "GMV 30d (GBP)", "Tickets 30d", "Events", "Members", "Health", "Created"];
  const body = pick.map(w => { const m = metrics.get(w.id); return [w.id, w.settings?.reference ?? "", w.name, w.kind, w.plan, w.status, w.verification_status, w.commission_bps / 100,
    (m?.gmv ?? 0).toFixed(2), m?.tickets ?? 0, m?.events ?? 0, m?.members ?? 0, health(w, m).label, w.created_at.slice(0, 10)].map(csv).join(","); });
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="workspaces-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
