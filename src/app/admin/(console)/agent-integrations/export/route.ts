import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { csvCell } from "@/lib/provider/csv";

/** CSV run-health report for the selected window (RLS: agent_ops permission). */
export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("agent_ops")) return new Response("Forbidden", { status: 403 });
  const days = { "24h": 1, "7d": 7, "30d": 30 }[new URL(request.url).searchParams.get("range") ?? "24h"] ?? 1;
  const list = await rows<Record<string, unknown>>(ctx.db.from("agent_runs").select("reference,agent_name,run_type,surface,status,retries,created_at,finished_at,errors")
    .gte("created_at", new Date(Date.now() - days * 864e5).toISOString()).order("created_at", { ascending: false }).limit(10000));
  // Q51: csvCell neutralises spreadsheet formulas (=, +, -, @) — run errors and names can carry user text (CSV injection).
  const esc = (v: unknown) => csvCell(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
  const cols = ["reference", "agent_name", "run_type", "surface", "status", "retries", "created_at", "finished_at", "errors"];
  const body = [cols.join(","), ...list.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gala-dock-agent-runs.csv"', "Cache-Control": "private, no-store" } });
}
