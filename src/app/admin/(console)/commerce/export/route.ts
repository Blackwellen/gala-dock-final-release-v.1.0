import { getAdmin } from "@/lib/admin/context";
import { loadLedger, ledgerRows, PERIODS, periodOf, typeOf, statusOf, type MoneyKey } from "../data";
import { requestTime } from "@/lib/workspace/format";
import { csvCell } from "@/lib/provider/csv";

/** CSV export of the Commerce ledger (or a period summary). Same RLS-scoped read as the dashboard; denied without the commerce permission. */
export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("commerce")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const period = periodOf(url.searchParams.get("period")), days = PERIODS[period]!.days;
  const esc = csvCell;   // Q51: neutralises spreadsheet formulas (=, +, -, @) in user-supplied text (CSV injection)
  let body: string;
  if (url.searchParams.get("kind") === "summary") {
    // Q75: summary figures from the SQL aggregate, so a busy 90-day period is not cut off at the row cap.
    // Q75 (i18n C12): one row per metric per currency — amounts in different currencies are never added together.
    const { totals: T } = await loadLedger(ctx.db, days);
    const metrics: [string, MoneyKey][] = [["total_gmv", "gmv"], ["platform_revenue", "platform"], ["ticket_revenue", "ticketing"], ["marketplace_revenue", "marketplace"], ["subscription_revenue", "subscription"]];
    body = [["metric", "currency", "value"], ["period", "", period],
      ...metrics.flatMap(([name, k]) => { const l = T.list(k); return (l.length ? l : [{ currency: T.main, total: 0 }]).map(c => [name, c.currency, c.total.toFixed(2)]); }),
      ["transactions", "", String(T.cur.n)]].map(r => r.map(esc).join(",")).join("\n");
  } else {
    const now = requestTime(), cur = await ledgerRows(ctx.db, now - days * 864e5, now, 200_000);
    body = [["occurred_at", "type", "description", "counterparty", "currency", "amount", "fees", "net", "status", "source", "reference"].join(","),
      ...cur.map(t => [t.occurred_at, typeOf(t), t.description, t.counterparty, (t.currency ?? "GBP").toUpperCase(), Number(t.amount).toFixed(2), Number(t.fee_amount).toFixed(2), t.net_amount == null ? "" : Number(t.net_amount).toFixed(2), statusOf(t).label, t.source, t.stripe_ref ?? ""].map(esc).join(","))].join("\n");
  }
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gala-dock-commerce-${period}.csv"`, "Cache-Control": "private, no-store" } });
}
