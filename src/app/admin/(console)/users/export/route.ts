import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/context";
import { isUuid } from "@/lib/workspace/db";

// Neutralise spreadsheet formulas and quote fields that need it.
const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
type Row = { id: string; email: string; full_name: string | null; account_type: string; identity_verified: boolean; status: string; workspaces: number; events: number; tickets: number; created_at: string; last_active_at: string | null };

/** CSV of the user directory (current search/filter, or the selected rows). Identity fields only — no credentials or payment data. */
export async function GET(request: NextRequest) {
  const { db, allowed } = await requireAdminPermission("users");
  if (!allowed) return new NextResponse("Not permitted", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const ids = sp.getAll("id").filter(isUuid).slice(0, 200);
  const filter = ["restricted", "verified"].includes(sp.get("filter") ?? "") ? sp.get("filter")! : "all";
  const out: Row[] = [];
  if (ids.length) {
    for (const id of ids) {
      const { data, error } = await db.rpc("admin_user_directory", { p_search: id, p_filter: "all", p_limit: 1, p_offset: 0 });
      if (error) return new NextResponse("Export failed", { status: 500 });
      out.push(...((data ?? []) as Row[]));
    }
  } else {
    for (let offset = 0; offset < 10000; offset += 100) {
      const { data, error } = await db.rpc("admin_user_directory", { p_search: (sp.get("q") ?? "").slice(0, 80), p_filter: filter, p_limit: 100, p_offset: offset });
      if (error) return new NextResponse("Export failed", { status: 500 });
      out.push(...((data ?? []) as Row[]));
      if (!data || data.length < 100) break;
    }
  }
  const head = ["User ID", "Name", "Email", "Type", "Identity verified", "Status", "Workspaces", "Events", "Tickets", "Joined", "Last active"];
  const body = out.map(u => [u.id, u.full_name ?? "", u.email, u.account_type, u.identity_verified ? "yes" : "no", u.status, u.workspaces, u.events, u.tickets, u.created_at.slice(0, 10), u.last_active_at?.slice(0, 10) ?? ""].map(csv).join(","));
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
