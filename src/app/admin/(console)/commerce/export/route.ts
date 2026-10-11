import { getAdmin } from "@/lib/admin/context";
import { loadLedger, PERIODS, periodOf, gmv, platformRevenue, bySource, typeOf, statusOf } from "../data";

/** CSV export of the Commerce ledger (or a period summary). Same RLS-scoped read as the dashboard; denied without the commerce permission. */
export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("commerce")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const period = periodOf(url.searchParams.get("period")), days = PERIODS[period]!.days;
  const { cur } = await loadLedger(ctx.db, days);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  let body: string;
  if (url.searchParams.get("kind") === "summary") {
    body = [["metric", "value_gbp"], ["period", period], ["total_gmv", gmv(cur).toFixed(2)], ["platform_revenue", platformRevenue(cur).toFixed(2)],
      ["ticket_revenue", bySource(cur, "ticketing").toFixed(2)], ["marketplace_revenue", bySource(cur, "marketplace").toFixed(2)], ["subscription_revenue", bySource(cur, "subscription").toFixed(2)],
      ["transactions", String(cur.length)]].map(r => r.map(esc).join(",")).join("\n");
  } else {
    body = [["occurred_at", "type", "description", "counterparty", "amount", "fees", "net", "status", "source", "reference"].join(","),
      ...cur.map(t => [t.occurred_at, typeOf(t), t.description, t.counterparty, t.amount.toFixed(2), t.fee_amount.toFixed(2), t.net_amount?.toFixed(2) ?? "", statusOf(t).label, t.source, t.stripe_ref ?? ""].map(esc).join(","))].join("\n");
  }
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gala-dock-commerce-${period}.csv"`, "Cache-Control": "private, no-store" } });
}
