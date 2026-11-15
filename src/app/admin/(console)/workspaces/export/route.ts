import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { health, loadMetrics, loadOwners, workspaceMatches, WS_COLS, type Ws } from "../../_a/workspaces";
import { requestTime } from "@/lib/workspace/format";
import { londonYmd } from "../../_b/format";   // Q51: London dates, not UTC slices

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of workspaces (selected rows, or the current type filter) with 30-day metrics. No payout or bank details. */
export async function GET(request: NextRequest) {
  const { db, allowed, permissions } = await requireAdminPermission("workspaces");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const ids = sp.getAll("id").filter(isUuid).slice(0, 500), now = requestTime();
  let query = db.from("workspaces").select(WS_COLS).order("created_at").limit(5000);
  if (ids.length) query = query.in("id", ids);
  const [all, metrics] = await Promise.all([rows<Ws>(query), loadMetrics(db, 30)]);
  const owners = ids.length ? new Map() : await loadOwners(db, all.map(w => w.owner_id), permissions.has("users") || permissions.has("support"));
  // Q51: same filter as the page (selected rows bypass it).
  const pick = ids.length ? all : all.filter(w => workspaceMatches(w, metrics.get(w.id), k => sp.get(k) ?? "", owners.get(w.owner_id)?.full_name, now));
  const head = ["Workspace ID", "Reference", "Name", "Type", "Plan", "Status", "Verification", "Commission %", "GMV 30d (GBP)", "Tickets 30d", "Events", "Members", "Health", "Created"];
  const body = pick.map(w => { const m = metrics.get(w.id); return [w.id, w.settings?.reference ?? "", w.name, w.kind, w.plan, w.status, w.verification_status, w.commission_bps / 100,
    (m?.gmv ?? 0).toFixed(2), m?.tickets ?? 0, m?.events ?? 0, m?.members ?? 0, health(w, m).label, londonYmd(w.created_at)].map(csv).join(","); });
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="workspaces-${londonYmd()}.csv"`, "Cache-Control": "private, no-store" } });
}
