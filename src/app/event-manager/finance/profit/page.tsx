import Link from "next/link";
import { Banknote, TrendingDown, TrendingUp, Percent, Award, BarChart2, Download, GitCompare } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  AreaLineChart,
  DonutChart,
  DonutLegend,
  ChartCard,
  InsightsRail,
  InsightCard,
  GroupedBarChart,
  WaterfallChart,
  ProgressBar,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";

export const metadata = { title: "Finance — Profit" };
export const dynamic = "force-dynamic";

/**
 * Cost basis for this page (kept deliberately simple + auditable — do not
 * silently mix sources):
 *
 * - Revenue        = `invoices.total_cents` for non-draft/non-void invoices.
 * - Supplier Costs = SUM(`event_expenses.amount_cents`) per event. This is
 *   the Accounts Payable / supplier-bill ledger and is used as the *sole*
 *   supplier-cost figure. `quotes.status = 'accepted'` is intentionally NOT
 *   also summed here to avoid double-counting the same supplier spend once
 *   a quote has been converted into a real bill.
 * - Wage Costs     = SUM(actual_hours * hourly_rate_cents + overtime_hours *
 *   overtime_rate_cents) per event, from `timesheets`.
 * - Other Costs    = 0 for every event. There is currently no ledger of
 *   non-supplier, non-wage event costs distinct from `event_expenses`, so
 *   this column is shown (rather than hidden) purely for schema/UI parity
 *   with the reference design and is honestly zeroed rather than estimated.
 */

function marginColor(margin: number) {
  if (margin >= 30) return "text-success-700 bg-success-50 border-success-200";
  if (margin >= 15) return "text-warning-700 bg-warning-50 border-warning-200";
  return "text-danger-700 bg-danger-50 border-danger-200";
}

// An event counts as "high margin" above this threshold. Chosen as a round,
// clearly-communicated number rather than derived from a benchmark dataset.
const HIGH_MARGIN_THRESHOLD = 50;

interface EventRollup {
  eventId: string;
  name: string;
  revenueCents: number;
  supplierCostCents: number;
  wageCostCents: number;
  otherCostCents: number;
}

interface EventProfitRow extends EventRollup {
  totalCostCents: number;
  profitCents: number;
  margin: number;
}

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ compare?: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { compare } = await searchParams;
  const supabase = await createClient();

  const [{ data: invData }, { data: expenseData }, { data: timesheetData }, { data: eventData }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("event_id, total_cents, status, issued_on, created_at")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .not("status", "in", "(draft,void)"),
      supabase
        .from("event_expenses")
        .select("event_id, amount_cents, category, expense_date, created_at")
        .eq("workspace_id", workspaceId),
      supabase
        .from("timesheets")
        .select("event_id, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, pay_period_start")
        .eq("workspace_id", workspaceId),
      supabase
        .from("events")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
    ]);

  const invoices = (invData ?? []) as {
    event_id: string | null;
    total_cents: number;
    issued_on: string | null;
    created_at: string;
  }[];
  const expenses = (expenseData ?? []) as {
    event_id: string;
    amount_cents: number;
    category: string | null;
    expense_date: string | null;
    created_at: string;
  }[];
  const timesheets = (timesheetData ?? []) as {
    event_id: string;
    actual_hours: number;
    overtime_hours: number;
    hourly_rate_cents: number;
    overtime_rate_cents: number;
    pay_period_start: string;
  }[];
  const eventNames = new Map<string, string>(
    ((eventData ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name])
  );

  const wageCostFor = (t: (typeof timesheets)[number]) =>
    t.actual_hours * t.hourly_rate_cents + t.overtime_hours * t.overtime_rate_cents;

  // ── Per-event rollups ──────────────────────────────────────────────────
  const rollups = new Map<string, EventRollup>();
  const getRow = (eventId: string) => {
    let row = rollups.get(eventId);
    if (!row) {
      row = {
        eventId,
        name: eventNames.get(eventId) ?? "Unknown event",
        revenueCents: 0,
        supplierCostCents: 0,
        wageCostCents: 0,
        otherCostCents: 0,
      };
      rollups.set(eventId, row);
    }
    return row;
  };

  for (const inv of invoices) {
    if (!inv.event_id) continue;
    getRow(inv.event_id).revenueCents += inv.total_cents;
  }
  for (const e of expenses) {
    getRow(e.event_id).supplierCostCents += e.amount_cents;
  }
  for (const t of timesheets) {
    getRow(t.event_id).wageCostCents += wageCostFor(t);
  }

  const rows: EventProfitRow[] = Array.from(rollups.values())
    .map((r) => {
      const totalCostCents = r.supplierCostCents + r.wageCostCents + r.otherCostCents;
      const profitCents = r.revenueCents - totalCostCents;
      const margin = r.revenueCents > 0 ? (profitCents / r.revenueCents) * 100 : 0;
      return { ...r, totalCostCents, profitCents, margin };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // Gross Revenue / Supplier Costs / Gross Profit / Margin headline KPIs (and
  // the Profit Bridge waterfall below) must be matched to the SAME set of
  // events: costs for events that have not yet been invoiced are real and
  // still shown per-event in "Profit by Event" / "Revenue vs Cost by Event",
  // but folding their cost into a revenue total that doesn't include them
  // would produce a nonsensical negative "profit" for the whole workspace.
  const eventsWithRevenue = rows.filter((r) => r.revenueCents > 0);
  const grossRevenue = eventsWithRevenue.reduce((s, r) => s + r.revenueCents, 0);
  const supplierCosts = eventsWithRevenue.reduce((s, r) => s + r.supplierCostCents, 0);
  const wageCosts = eventsWithRevenue.reduce((s, r) => s + r.wageCostCents, 0);
  const otherCosts = eventsWithRevenue.reduce((s, r) => s + r.otherCostCents, 0);
  const grossProfit = grossRevenue - supplierCosts - wageCosts - otherCosts;
  const overallMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
  const averageEventMargin =
    eventsWithRevenue.length > 0
      ? eventsWithRevenue.reduce((s, r) => s + r.margin, 0) / eventsWithRevenue.length
      : 0;
  const highMarginEventCount = eventsWithRevenue.filter((r) => r.margin > HIGH_MARGIN_THRESHOLD).length;

  // ── Margin Trend — last 8 months, computed from invoice + cost dates ───
  const months = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (7 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }) };
  });
  const marginTrend = months.map((m) => {
    const revenue = invoices
      .filter((i) => {
        const d = new Date(i.issued_on ?? i.created_at);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      })
      .reduce((s, i) => s + i.total_cents, 0);
    const supplierCost = expenses
      .filter((e) => {
        const d = new Date(e.expense_date ?? e.created_at);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      })
      .reduce((s, e) => s + e.amount_cents, 0);
    const wageCost = timesheets
      .filter((t) => {
        const d = new Date(t.pay_period_start);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      })
      .reduce((s, t) => s + wageCostFor(t), 0);
    const cost = supplierCost + wageCost;
    const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
    return { label: m.label, margin };
  });
  const avgMonthlyMargin =
    marginTrend.length > 0 ? marginTrend.reduce((s, m) => s + m.margin, 0) / marginTrend.length : 0;
  const marginTrendData = marginTrend.map((m) => ({ label: m.label, margin: m.margin, average: avgMonthlyMargin }));

  // ── Revenue vs Cost by Event — top 8 by revenue ────────────────────────
  const revenueVsCostByEvent = rows.slice(0, 8).map((r) => ({
    label: r.name,
    bars: [
      { key: "revenue", value: r.revenueCents / 100, color: C.brand },
      { key: "cost", value: r.totalCostCents / 100, color: C.danger },
    ],
  }));

  // ── Profit Bridge (waterfall) ───────────────────────────────────────────
  const profitBridge = [
    { label: "Revenue", value: grossRevenue / 100, isTotal: true, color: C.brand },
    { label: "Less Supplier Costs", value: -supplierCosts / 100, color: C.danger },
    { label: "Less Wage Costs", value: -wageCosts / 100, color: C.warning },
    { label: "Less Other Costs", value: -otherCosts / 100, color: C.slate },
    { label: "Gross Profit", value: grossProfit / 100, isTotal: true, color: C.success },
  ];

  // ── Right rail: ranking, cost composition, lowest-margin alerts ────────
  const marginRanking = eventsWithRevenue.slice().sort((a, b) => b.margin - a.margin).slice(0, 5);
  const costComposition = [
    { label: "Supplier", value: supplierCosts, color: C.danger },
    { label: "Wage", value: wageCosts, color: C.warning },
    { label: "Other", value: otherCosts, color: C.slate },
  ].filter((c) => c.value > 0);
  const totalCostForComposition = supplierCosts + wageCosts + otherCosts;
  // Simplification: true margin-erosion requires a trailing-period baseline
  // per event, which isn't reliably derivable from current data volumes.
  // Shown honestly as "Lowest Margin Events" rather than a fabricated trend delta.
  const lowestMarginEvents = eventsWithRevenue.slice().sort((a, b) => a.margin - b.margin).slice(0, 5);

  // ── Top/low margin split lists ──────────────────────────────────────────
  const topProfitable = eventsWithRevenue.slice().sort((a, b) => b.margin - a.margin).slice(0, 5);
  const lowMargin = eventsWithRevenue.slice().sort((a, b) => a.margin - b.margin).slice(0, 5);

  // ── Compare Events (optional ?compare=idA,idB) ──────────────────────────
  const compareIds = compare ? compare.split(",").filter(Boolean).slice(0, 2) : [];
  const compareRows = compareIds.map((id) => rows.find((r) => r.eventId === id)).filter((r): r is EventProfitRow => !!r);
  const defaultCompareHref =
    rows.length >= 2 ? `/event-manager/finance/profit?compare=${rows[0].eventId},${rows[1].eventId}` : null;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Profit"
        description="Revenue vs supplier costs by event"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <span
              title="Export is not yet wired to a report generator"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed"
              aria-disabled="true"
            >
              <Download className="w-4 h-4" />
              Export Report
            </span>
            {defaultCompareHref ? (
              <Link
                href={defaultCompareHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              >
                <GitCompare className="w-4 h-4" />
                Compare Events
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed">
                <GitCompare className="w-4 h-4" />
                Compare Events
              </span>
            )}
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Gross Revenue" value={formatCentsCompact(grossRevenue)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Supplier Costs" value={formatCentsCompact(supplierCosts)} icon={TrendingDown} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Gross Profit" value={formatCentsCompact(grossProfit)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Margin" value={`${overallMargin.toFixed(1)}%`} icon={Percent} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard label="Average Event Margin" value={`${averageEventMargin.toFixed(1)}%`} icon={BarChart2} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="High Margin Events" value={String(highMarginEventCount)} icon={Award} iconColor="text-success-600" iconBg="bg-success-50" />
        </KPIGrid>

        {compareRows.length === 2 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-900">Compare Events</h2>
              <Link href="/event-manager/finance/profit" className="text-xs text-brand-600 hover:text-brand-700 font-medium">Clear comparison</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Metric</th>
                    {compareRows.map((r) => (
                      <th key={r.eventId} className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">{r.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  <tr>
                    <td className="px-6 py-3 text-surface-600">Revenue</td>
                    {compareRows.map((r) => <td key={r.eventId} className="px-6 py-3 text-right tabular-nums font-medium text-surface-900">{formatCurrency(r.revenueCents / 100)}</td>)}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-surface-600">Supplier Costs</td>
                    {compareRows.map((r) => <td key={r.eventId} className="px-6 py-3 text-right tabular-nums text-surface-700">{formatCurrency(r.supplierCostCents / 100)}</td>)}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-surface-600">Wage Costs</td>
                    {compareRows.map((r) => <td key={r.eventId} className="px-6 py-3 text-right tabular-nums text-surface-700">{formatCurrency(r.wageCostCents / 100)}</td>)}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-surface-600">Gross Profit</td>
                    {compareRows.map((r) => <td key={r.eventId} className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(r.profitCents / 100)}</td>)}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-surface-600">Margin</td>
                    {compareRows.map((r) => (
                      <td key={r.eventId} className="px-6 py-3 text-right">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", marginColor(r.margin))}>{r.margin.toFixed(1)}%</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Margin Trend">
                {grossRevenue === 0 ? (
                  <p className="text-xs text-surface-400">No revenue yet to trend margin against.</p>
                ) : (
                  <AreaLineChart
                    data={marginTrendData}
                    series={[
                      { key: "margin", color: C.brand, label: "Margin %", area: true },
                      { key: "average", color: C.slate, label: "8-month average" },
                    ]}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                  />
                )}
              </ChartCard>
              <ChartCard title="Revenue vs Cost by Event">
                {revenueVsCostByEvent.length === 0 ? (
                  <p className="text-xs text-surface-400">No events with revenue or costs yet.</p>
                ) : (
                  <GroupedBarChart groups={revenueVsCostByEvent} formatValue={(v) => formatCurrency(v)} />
                )}
              </ChartCard>
            </div>

            <ChartCard title="Profit Bridge">
              <WaterfallChart steps={profitBridge} formatValue={(v) => formatCurrency(v)} />
            </ChartCard>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Profit by Event</h2>
              </div>
              {rows.length === 0 ? (
                <EmptyState
                  icon={BarChart2}
                  title="No profit data yet"
                  description="Profit is calculated from issued invoices (revenue), supplier bills (event_expenses) and staff timesheets (wage costs)."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Revenue</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier Costs</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Wage Costs</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Other Costs</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Gross Profit</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {rows.map((row) => (
                        <tr key={row.eventId} className="hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-3 font-medium text-surface-900">{row.name}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-surface-900">{formatCurrency(row.revenueCents / 100)}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(row.supplierCostCents / 100)}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(row.wageCostCents / 100)}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(row.otherCostCents / 100)}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(row.profitCents / 100)}</td>
                          <td className="px-6 py-3 text-right">
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", marginColor(row.margin))}>
                              {row.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-50 border-t border-surface-200">
                      <tr>
                        <td className="px-6 py-3 font-semibold text-surface-900">Total</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(grossRevenue / 100)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(supplierCosts / 100)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(wageCosts / 100)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(otherCosts / 100)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(grossProfit / 100)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{overallMargin.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Top Profitable Events">
                {topProfitable.length === 0 ? (
                  <p className="text-xs text-surface-400">No events with revenue yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {topProfitable.map((r) => (
                      <li key={r.eventId} className="flex items-center justify-between text-xs">
                        <span className="text-surface-700 truncate">{r.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums text-surface-900">{formatCurrency(r.profitCents / 100)}</span>
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", marginColor(r.margin))}>
                            {r.margin.toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
              <ChartCard title="Low Margin Events">
                {lowMargin.length === 0 ? (
                  <p className="text-xs text-surface-400">No events with revenue yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {lowMargin.map((r) => (
                      <li key={r.eventId} className="flex items-center justify-between text-xs">
                        <span className="text-surface-700 truncate">{r.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums text-surface-900">{formatCurrency(r.profitCents / 100)}</span>
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", marginColor(r.margin))}>
                            {r.margin.toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            </div>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Event Margin Ranking">
              {marginRanking.length === 0 ? (
                <p className="text-xs text-surface-400">No events with revenue yet.</p>
              ) : (
                <ul className="space-y-3">
                  {marginRanking.map((r) => (
                    <li key={r.eventId}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-surface-600 truncate">{r.name}</span>
                        <span className="font-semibold text-surface-800 tabular-nums">{r.margin.toFixed(1)}%</span>
                      </div>
                      <ProgressBar pct={Math.max(0, Math.min(100, r.margin))} color={r.margin >= 30 ? "bg-success-500" : r.margin >= 15 ? "bg-warning-500" : "bg-danger-500"} />
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Cost Composition">
              {totalCostForComposition === 0 ? (
                <p className="text-xs text-surface-400">No costs recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <DonutChart data={costComposition} centerValue={formatCentsCompact(totalCostForComposition)} centerLabel="Total Costs" size={140} thickness={20} />
                  </div>
                  <DonutLegend data={costComposition} formatValue={(v) => formatCentsCompact(v)} />
                </div>
              )}
            </InsightCard>

            <InsightCard title="Lowest Margin Events">
              <p className="text-[11px] text-surface-400 mb-2">
                Simplified view: shows events with the lowest current margin. A true trailing-period erosion trend
                needs more run-rate history than is currently available.
              </p>
              {lowestMarginEvents.length === 0 ? (
                <p className="text-xs text-surface-400">No events with revenue yet.</p>
              ) : (
                <ul className="space-y-2">
                  {lowestMarginEvents.map((r) => (
                    <li key={r.eventId} className="flex items-center justify-between text-xs">
                      <span className="text-surface-600 truncate">{r.name}</span>
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", marginColor(r.margin))}>
                        {r.margin.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
