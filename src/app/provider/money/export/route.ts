import { NextResponse, type NextRequest } from "next/server";
import { loadMoney, periodRange, inRange, net } from "../data";

// Neutralise spreadsheet formulas (=, +, -, @) and quote fields that need it.
const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of the workspace's transactions for a period. RLS-scoped; no card or bank details are included. */
export async function GET(request: NextRequest) {
  const { txs } = await loadMoney();
  const sp = request.nextUrl.searchParams, r = periodRange(sp.get("period") ?? "month"), type = sp.get("type") ?? "";
  const pick = txs.filter(t => inRange(t, r.from, r.to) && (!type || t.kind === type));
  const head = ["Date", "Description", "Type", "Category", "Counterparty", "Reference", "Gross", "Fees", "Net", "Currency", "Status"];
  const body = pick.map(t => [t.occurred_at.slice(0, 10), t.description, t.kind, t.category, t.counterparty, t.stripe_ref ?? "", t.amount.toFixed(2), (-t.fee_amount).toFixed(2), net(t).toFixed(2), t.currency || "GBP", t.status].map(csv).join(","));
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="transactions-${r.key}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
