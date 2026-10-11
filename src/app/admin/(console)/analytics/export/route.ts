import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";

/** CSV of the daily analytics rollups for the selected window (RLS: analytics permission). */
export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("analytics")) return new Response("Forbidden", { status: 403 });
  const days = { "7d": 7, "30d": 30, "90d": 90 }[new URL(request.url).searchParams.get("period") ?? "30d"] ?? 30;
  const list = await rows<{ day: string; metric: string; dim: string; value: number }>(ctx.db.from("analytics_daily").select("day,metric,dim,value")
    .gte("day", new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)).order("day").limit(50000));
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const body = ["day,metric,dimension,value", ...list.map(r => [r.day, r.metric, r.dim, r.value].map(esc).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gala-dock-analytics-${days}d.csv"`, "Cache-Control": "private, no-store" } });
}
