import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { csvCell } from "@/lib/provider/csv";

/** CSV export of Trust & Safety cases (RLS: trust permission). */
export async function GET() {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("trust")) return new Response("Forbidden", { status: 403 });
  const list = await rows<Record<string, unknown>>(ctx.db.from("trust_cases").select("reference,queue,category,subject_type,subject_name,risk_score,status,assignee_name,created_at,updated_at,decision").order("updated_at", { ascending: false }).limit(5000));
  const cols = ["reference", "queue", "category", "subject_type", "subject_name", "risk_score", "status", "assignee_name", "created_at", "updated_at", "decision"];
  // Q59: csvCell also neutralises spreadsheet formulas (=, +, -, @) in user-supplied names (CSV injection).
  const body = [cols.join(","), ...list.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gala-dock-trust-cases.csv"', "Cache-Control": "private, no-store" } });
}
