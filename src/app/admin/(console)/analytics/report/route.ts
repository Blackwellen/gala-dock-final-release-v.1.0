import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin/context";
import { platformReport, range, reconcile } from "@/lib/analytics/server";

/**
 * Q35 platform reporting (Admin → Analytics). GET ?from=&to=[&demo=1][&format=csv] → every active metric from the warehouse facts
 * (demo/test workspaces excluded unless demo=1), supply gaps and the reconciliation of facts against the ledger/orders/check-ins/meter.
 */
export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("analytics")) return new Response("Forbidden", { status: 403 });
  const q = new URL(request.url).searchParams;
  const span = range(q.get("from"), q.get("to"));
  if (!span) return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  const [report, rec] = await Promise.all([platformReport(span.from, span.to, q.get("demo") === "1"), reconcile(span.from, span.to)]);
  if (!report.ok) return NextResponse.json({ error: report.error }, { status: report.status });
  if (q.get("format") === "csv") {
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
    const body = ["metric,version,domain,unit,value,numerator,denominator", ...report.data.metrics.map(m =>
      [m.key, m.version, m.domain, m.unit, m.value, m.numerator, m.denominator].map(esc).join(","))].join("\n");
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gala-dock-kpis-${span.from}-${span.to}.csv"`, "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ ...span, ...report.data, reconciliation: rec.ok ? rec.data : { error: rec.error } }, { headers: { "Cache-Control": "private, no-store" } });
}
