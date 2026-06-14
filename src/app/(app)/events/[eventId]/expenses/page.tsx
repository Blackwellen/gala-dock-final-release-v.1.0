import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Wallet, TrendingDown, Layers, Coins } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { CSSBarChart, type CSSBarDatum } from "@/components/ui/CSSBarChart";
import type { EventExpense } from "@/lib/supabase/types";
import { ExpensesClient, type ExpenseRow, type SupplierOption } from "./ExpensesClient";

export const metadata: Metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
function gbp(cents: number) {
  return GBP.format((cents ?? 0) / 100);
}

const CATEGORY_LABELS: Record<string, string> = {
  "venue-hire": "Venue Hire",
  catering: "Catering",
  "av-tech": "AV & Tech",
  photography: "Photography",
  floristry: "Floristry",
  entertainment: "Entertainment",
  staffing: "Staffing",
  transport: "Transport",
  stationery: "Stationery",
  accommodation: "Accommodation",
  insurance: "Insurance",
  licences: "Licences",
  miscellaneous: "Miscellaneous",
};
function categoryLabel(c: string | null) {
  if (!c) return "Uncategorised";
  return CATEGORY_LABELS[c] ?? c;
}

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
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

  const [{ data: expenseData }, { data: budgetLines }, { data: supplierData }] =
    await Promise.all([
      supabase
        .from("event_expenses")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("event_id", eventId)
        .order("expense_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("event_budget_lines")
        .select("category, quantity, unit_cost_cents")
        .eq("workspace_id", workspaceId)
        .eq("event_id", eventId),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

  const expenses = (expenseData ?? []) as EventExpense[];
  const suppliers: SupplierOption[] = (supplierData ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? "Unnamed supplier",
  }));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalSpentCents = expenses.reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);

  // Budget: prefer event_budget_lines, fall back to events.budget_cents.
  const budgetByCategory = new Map<string, number>();
  let budgetLineTotal = 0;
  for (const line of budgetLines ?? []) {
    const cents = (line.quantity ?? 1) * (line.unit_cost_cents ?? 0);
    budgetLineTotal += cents;
    const key = line.category ?? "miscellaneous";
    budgetByCategory.set(key, (budgetByCategory.get(key) ?? 0) + cents);
  }
  const hasBudgetLines = (budgetLines ?? []).length > 0;
  const totalBudgetCents = hasBudgetLines ? budgetLineTotal : event.budget_cents ?? 0;

  // ── Spend by category ───────────────────────────────────────────────────────
  const spentByCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category ?? "miscellaneous";
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + (e.amount_cents ?? 0));
  }

  const breakdown: CSSBarDatum[] = [...spentByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, cents]) => ({
      label: categoryLabel(cat),
      value: cents,
      valueLabel: gbp(cents),
    }));

  // Budget vs actual rows (union of categories that have a budget or spend).
  const allCats = new Set<string>([
    ...budgetByCategory.keys(),
    ...spentByCategory.keys(),
  ]);
  const budgetVsActual = [...allCats]
    .map((cat) => {
      const spent = spentByCategory.get(cat) ?? 0;
      const budget = budgetByCategory.get(cat) ?? 0;
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : null;
      return { cat, spent, budget, pct };
    })
    .sort((a, b) => b.spent - a.spent);

  const remainingCents = totalBudgetCents - totalSpentCents;

  return (
    <div className="min-h-full bg-surface-50 animate-fade-in">
      <PageHeader
        title="Expenses"
        description={event.name}
        actions={
          <Link
            href={`/events/${eventId}`}
            className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            Back to event
          </Link>
        }
      />

      <div className="space-y-6 p-6">
        {/* KPIs */}
        <KPIGrid className="lg:grid-cols-4 xl:grid-cols-4">
          <MetricCard
            label="Total Spent"
            value={gbp(totalSpentCents)}
            icon={Wallet}
          />
          <MetricCard
            label={hasBudgetLines ? "Budget" : "Event Budget"}
            value={totalBudgetCents > 0 ? gbp(totalBudgetCents) : "—"}
            icon={Coins}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="Remaining"
            value={totalBudgetCents > 0 ? gbp(remainingCents) : "—"}
            icon={TrendingDown}
            iconColor={remainingCents < 0 ? "text-danger-600" : "text-success-600"}
            iconBg={remainingCents < 0 ? "bg-danger-50" : "bg-success-50"}
          />
          <MetricCard
            label="Line Items"
            value={expenses.length}
            icon={Layers}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </KPIGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Budget vs actual */}
          <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
            <h2 className="mb-4 text-sm font-semibold text-surface-900">Budget vs actual</h2>
            {budgetVsActual.length === 0 ? (
              <p className="text-sm text-surface-400">
                No budget or spend recorded yet.
              </p>
            ) : (
              <div className="space-y-3.5">
                {budgetVsActual.map(({ cat, spent, budget, pct }) => {
                  const width = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : spent > 0 ? 100 : 0;
                  const barColor =
                    pct == null
                      ? "bg-surface-400"
                      : pct >= 100
                      ? "bg-danger-500"
                      : pct >= 85
                      ? "bg-warning-500"
                      : "bg-brand-500";
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-surface-700">
                          {categoryLabel(cat)}
                        </span>
                        <span className="tabular-nums text-surface-500">
                          {gbp(spent)}
                          {budget > 0 && <> / {gbp(budget)}{pct != null && ` (${pct}%)`}</>}
                          {pct != null && pct >= 85 && pct < 100 && (
                            <span className="ml-1 text-warning-600">Near limit</span>
                          )}
                          {pct != null && pct >= 100 && (
                            <span className="ml-1 text-danger-600">Over</span>
                          )}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-100">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
            <h2 className="mb-4 text-sm font-semibold text-surface-900">
              Spend by category
            </h2>
            {breakdown.length === 0 ? (
              <p className="text-sm text-surface-400">No expenses to break down yet.</p>
            ) : (
              <CSSBarChart data={breakdown} orientation="horizontal" />
            )}
          </div>
        </div>

        {/* Expense table + add/edit */}
        <ExpensesClient
          eventId={eventId}
          suppliers={suppliers}
          expenses={expenses.map<ExpenseRow>((e) => ({
            id: e.id,
            category: e.category,
            description: e.description,
            amount_cents: e.amount_cents,
            expense_date: e.expense_date,
            supplier_id: e.supplier_id,
            supplier_name: e.supplier_id ? supplierName.get(e.supplier_id) ?? null : null,
            receipt_storage_key: e.receipt_storage_key,
            status: e.status,
          }))}
        />
      </div>
    </div>
  );
}
