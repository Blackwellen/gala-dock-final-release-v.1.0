import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, TrendingUp, TrendingDown, Wallet, Download, Receipt, CreditCard, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function gbp(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

const CATEGORY_COLORS: string[] = [
  "bg-violet-500", "bg-blue-500", "bg-amber-500", "bg-green-500",
  "bg-red-500", "bg-pink-500", "bg-teal-500",
];

interface Expense {
  id: string;
  description: string;
  category: string | null;
  amount_cents: number;
  expense_date: string | null;
  status: string;
}

interface PurchaseOrder {
  id: string;
  reference: string | null;
  amount_cents: number;
  status: string;
  delivery_window: string | null;
  notes: string | null;
}

const TX_STATUS: Record<string, string> = {
  overdue:   "bg-danger-100 text-danger-700 border-danger-200",
  due_soon:  "bg-warning-100 text-warning-700 border-warning-200",
  paid:      "bg-success-100 text-success-700 border-success-200",
  pending:   "bg-surface-100 text-surface-600 border-surface-200",
  open:      "bg-blue-100 text-blue-700 border-blue-200",
};

export default async function FinancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, budget_cents")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // Awaited individually (not as one Promise.all tuple) to keep TS type
  // instantiation shallow — the combined generic tuple trips "excessively deep".
  const { data: expenses } = await supabase
    .from("event_expenses").select("amount_cents, category")
    .eq("workspace_id", workspaceId).eq("event_id", eventId);
  const { data: txData } = await supabase
    .from("event_expenses")
    .select("id, description, category, amount_cents, expense_date, status")
    .eq("workspace_id", workspaceId).eq("event_id", eventId)
    .order("expense_date", { ascending: false }).limit(20);
  const { data: invoices } = await supabase
    .from("event_purchase_orders")
    .select("id, reference, amount_cents, status, delivery_window, notes")
    .eq("workspace_id", workspaceId).eq("event_id", eventId)
    .is("deleted_at", null)
    .neq("status", "completed").order("created_at", { ascending: false }).limit(6);

  const totalActual = (expenses ?? []).reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const budget = event.budget_cents ?? 0;
  const budgetPct = budget > 0 ? Math.round((totalActual / budget) * 100) : 0;

  // Category breakdown
  const catMap = new Map<string, number>();
  for (const e of (expenses ?? [])) {
    const c = e.category ?? "Other";
    catMap.set(c, (catMap.get(c) ?? 0) + (e.amount_cents ?? 0));
  }
  const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

  const txs = (txData ?? []) as Expense[];
  const pendingPOs = (invoices ?? []) as PurchaseOrder[];
  const outstandingTotal = pendingPOs.reduce((s, po) => s + (po.amount_cents ?? 0), 0);

  const kpis = [
    { label: "Total Budget",       value: gbp(budget),      sub: "100% of budget",              icon: Wallet,      color: "text-brand-600",   bg: "bg-brand-50" },
    { label: "Total Actual",       value: gbp(totalActual), sub: `${budgetPct}% of budget`,      icon: CreditCard,  color: "text-surface-600", bg: "bg-surface-50" },
    { label: "Outstanding POs",    value: gbp(outstandingTotal), sub: `${pendingPOs.length} purchase orders`, icon: Receipt, color: "text-warning-600", bg: "bg-warning-50" },
    { label: "Projected Margin",   value: budget > 0 && totalActual < budget ? `${Math.round(((budget - totalActual) / budget) * 100)}%` : "0%", sub: gbp(budget - totalActual), icon: TrendingUp, color: "text-success-600", bg: "bg-success-50" },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Finance</h2>
          <p className="text-sm text-surface-500">Budget, actuals, invoices and cash flow for this event.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Plus className="h-4 w-4" />
            New Transaction
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
                <p className="mt-1.5 text-2xl font-bold text-surface-900 tracking-tight">{value}</p>
                <p className="mt-0.5 text-xs text-surface-400">{sub}</p>
              </div>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} strokeWidth={1.8} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* Budget progress */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Budget vs Actual</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-surface-500 mb-1">
                <span>Actual Spend</span>
                <span>{pct(totalActual, budget)} of budget</span>
              </div>
              <div className="h-3 rounded-full bg-surface-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct > 90 ? "bg-danger-500" : budgetPct > 75 ? "bg-warning-500" : "bg-success-500"}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Budget</span>
              <span className="font-semibold text-surface-900">{gbp(budget)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Actual</span>
              <span className={`font-semibold ${budgetPct > 90 ? "text-danger-700" : "text-surface-900"}`}>{gbp(totalActual)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Remaining</span>
              <span className="font-semibold text-success-700">{gbp(Math.max(0, budget - totalActual))}</span>
            </div>
          </div>
        </div>

        {/* Expenses by category */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Expenses by Category</h3>
          {categories.length === 0 ? (
            <p className="text-xs text-surface-400">No expenses recorded.</p>
          ) : (
            <div className="space-y-2.5">
              {categories.slice(0, 6).map(([cat, amount], i) => (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />
                      <span className="text-surface-700 font-medium truncate max-w-[130px]">{cat}</span>
                    </div>
                    <span className="text-surface-500 shrink-0">{gbp(amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
                      style={{ width: `${totalActual > 0 ? Math.round((amount / totalActual) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outstanding purchase orders */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900">Pending Orders</h3>
            {outstandingTotal > 0 && (
              <span className="text-xs font-semibold text-danger-700">{gbp(outstandingTotal)}</span>
            )}
          </div>
          {pendingPOs.length === 0 ? (
            <p className="px-5 py-4 text-xs text-surface-400">No pending purchase orders.</p>
          ) : (
            <ul className="divide-y divide-surface-100">
              {pendingPOs.map((po) => {
                const st = TX_STATUS[(po.status ?? "pending").toLowerCase()] ?? TX_STATUS.pending;
                return (
                  <li key={po.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-surface-900 truncate">{po.notes ?? po.reference ?? "—"}</p>
                      <p className="text-[11px] text-surface-400">{po.reference ?? po.delivery_window ?? "PO"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-surface-900">{gbp(po.amount_cents)}</p>
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${st}`}>
                        {(po.status ?? "pending").replace("_", " ")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Expenses table */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">Expenses</h3>
          <span className="text-xs text-surface-400">{txs.length} records</span>
        </div>
        {txs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-surface-400 text-center">No expenses recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Date</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Description</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Category</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Amount</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {txs.map((tx) => {
                const st = TX_STATUS[(tx.status ?? "pending").toLowerCase()] ?? TX_STATUS.pending;
                return (
                  <tr key={tx.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 text-xs text-surface-500 whitespace-nowrap">
                      {tx.expense_date ? new Date(tx.expense_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-surface-900 max-w-[240px] truncate">{tx.description ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-surface-500">{tx.category ?? "—"}</td>
                    <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-surface-900">
                      {gbp(tx.amount_cents)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${st}`}>
                        {(tx.status ?? "pending").replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
