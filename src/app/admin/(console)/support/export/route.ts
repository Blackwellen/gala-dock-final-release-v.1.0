import { getAdmin } from "@/lib/admin/context";
import { loadCases, typeLabel } from "../data";

/** CSV export of support cases (RLS: support permission). */
export async function GET() {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("support")) return new Response("Forbidden", { status: 403 });
  const list = await loadCases(ctx.db);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const body = [["reference", "subject", "type", "priority", "status", "requester", "assignee", "sla_due_at", "created_at", "resolved_at"].join(","),
    ...list.map(c => [c.reference, c.subject, typeLabel(c), c.priority, c.status, c.requester_name, c.assignee_name, c.sla_due_at, c.created_at, c.resolved_at].map(esc).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gala-dock-support-cases.csv"', "Cache-Control": "private, no-store" } });
}
