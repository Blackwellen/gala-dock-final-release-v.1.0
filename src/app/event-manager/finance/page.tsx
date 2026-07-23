import Link from "next/link";
import { Banknote, Clock, AlertCircle, TrendingUp, Plus, FileText, Receipt, Percent } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  ProgressBar,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/supabase/types";
import { invoiceBadgeStatus, formatCentsCompact, sumMatchedCosts, FINANCE_CHART_COLORS as C } from "./_lib/finance";

export const metadata = { title: "Finance — Overview" };
export const dynamic = "force-dynamic";

export default async function FinanceOverviewPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [
    { data: invData },
    { data: recentInvData },
    { data: proposalData },
    { data: expenseData },
    { data: ticketData },
    { data: depositData },
    { data: eventNamesData },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_cents, paid_cents, status, event_id, issued_on, created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, status, total_cents, currency, due_on, created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("proposals")
      .select("id, status, total_cents")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("event_expenses")
      .select("amount_cents, paid_cents, event_id, payment_status, approval_status, due_date")
      .eq("workspace_id", workspaceId),
    supabase
      .from("ticket_orders")
      .select("amount_cents, fee_cents, refunded_cents, event_id, status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("event_deposits")
      .select("event_id, amount_cents, paid_cents, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const allInvoices = (invData ?? []) as Pick<Invoice, "total_cents" | "paid_cents" | "status" | "event_id" | "issued_on" | "created_at">[];
  const recentInvoices = (recentInvData ?? []) as Pick<Invoice, "id" | "invoice_number" | "client_name" | "status" | "total_cents" | "currency" | "due_on" | "created_at">[];
  const proposals = proposalData ?? [];
  const expenses = expenseData ?? [];
  const tickets = ticketData ?? [];
  const deposits = depositData ?? [];
  const eventNames = new Map((eventNamesData ?? []).map((e) => [e.id, e.name]));

  const totalInvoiced = allInvoices.reduce((s, i) => s + i.total_cents, 0);
  const totalPaid = allInvoices.reduce((s, i) => s + i.paid_cents, 0);
  const outstanding = totalInvoiced - totalPaid;
  const overdue = allInvoices.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.total_cents - i.paid_cents), 0);

  // Workspace-wide committed supplier cost total (used by the Cashflow-forecast
  // mini-chart below, which is intentionally forward-looking across all open
  // bills regardless of whether they're linked to an already-invoiced event).
  const supplierCosts = expenses.reduce((s, e) => s + e.amount_cents, 0);

  // Revenue vs Payments — last 6 months
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }) };
  });
  const revenueSeries = months.map((m) => {
    const invoiced = allInvoices
      .filter((i) => {
        const d = new Date(i.issued_on ?? i.created_at);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      })
      .reduce((s, i) => s + i.total_cents, 0);
    const paid = allInvoices
      .filter((i) => {
        const d = new Date(i.issued_on ?? i.created_at);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      })
      .reduce((s, i) => s + i.paid_cents, 0);
    return { label: m.label, invoiced: invoiced / 100, paid: paid / 100 };
  });

  // Quote pipeline (proposals)
  const pipelineBuckets: Record<string, { label: string; color: string; count: number; value: number }> = {
    draft: { label: "Draft", color: C.slate, count: 0, value: 0 },
    sent: { label: "Sent", color: C.info, count: 0, value: 0 },
    viewed: { label: "Viewed", color: C.warning, count: 0, value: 0 },
    signed: { label: "Won", color: C.success, count: 0, value: 0 },
  };
  let pipelineTotal = 0;
  for (const p of proposals) {
    const bucket = pipelineBuckets[p.status as string];
    if (bucket) {
      bucket.count += 1;
      bucket.value += p.total_cents;
    }
    if (p.status !== "declined" && p.status !== "expired") pipelineTotal += p.total_cents;
  }
  const wonCount = pipelineBuckets.signed.count;
  const wonValue = pipelineBuckets.signed.value;

  // Outstanding payments (top 5 by balance, receivable + payable, clearly labelled)
  const outstandingReceivables = allInvoices
    .filter((i) => i.total_cents - i.paid_cents > 0)
    .sort((a, b) => b.total_cents - b.paid_cents - (a.total_cents - a.paid_cents))
    .slice(0, 3);
  const outstandingPayables = expenses
    .filter((e) => e.amount_cents - e.paid_cents > 0)
    .sort((a, b) => b.amount_cents - b.paid_cents - (a.amount_cents - a.paid_cents))
    .slice(0, 3);

  // Ticket revenue by event
  const ticketByEvent = new Map<string, number>();
  for (const t of tickets) {
    if (t.status === "cancelled") continue;
    const net = t.amount_cents - t.fee_cents - t.refunded_cents;
    ticketByEvent.set(t.event_id, (ticketByEvent.get(t.event_id) ?? 0) + net);
  }
  const ticketRevenueByEvent = [...ticketByEvent.entries()]
    .map(([eventId, value]) => ({ label: eventNames.get(eventId) ?? "Unknown", value: value / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Supplier costs by event
  const costByEvent = new Map<string, number>();
  for (const e of expenses) costByEvent.set(e.event_id, (costByEvent.get(e.event_id) ?? 0) + e.amount_cents);
  const supplierCostsByEvent = [...costByEvent.entries()]
    .map(([eventId, value]) => ({ label: eventNames.get(eventId) ?? "Unknown", value: value / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Deposit milestones (progress)
  const depositRows = deposits
    .map((d) => ({
      event: eventNames.get(d.event_id) ?? "Unknown",
      required: d.amount_cents,
      paid: d.paid_cents,
      pct: d.amount_cents > 0 ? Math.round((d.paid_cents / d.amount_cents) * 100) : 0,
    }))
    .slice(0, 5);

  // Profit by event (top 6)
  const revenueByEvent = new Map<string, number>();
  for (const i of allInvoices) {
    if (!i.event_id) continue;
    revenueByEvent.set(i.event_id, (revenueByEvent.get(i.event_id) ?? 0) + i.total_cents);
  }
  // Gross Profit / Margin KPIs must match revenue and cost on the SAME set of
  // events — comparing total invoiced revenue (a handful of invoiced events)
  // against workspace-wide supplier costs (every event, invoiced or not) would
  // produce a nonsensical negative "profit". Only count supplier costs for
  // events that have actually been invoiced.
  const matchedSupplierCosts = sumMatchedCosts(revenueByEvent, costByEvent);
  const grossProfit = totalInvoiced - matchedSupplierCosts;
  const margin = totalInvoiced > 0 ? (grossProfit / totalInvoiced) * 100 : 0;

  const profitByEvent = [...new Set([...revenueByEvent.keys(), ...costByEvent.keys()])]
    .map((eventId) => {
      const revenue = revenueByEvent.get(eventId) ?? 0;
      const cost = costByEvent.get(eventId) ?? 0;
      const profit = revenue - cost;
      return {
        event: eventNames.get(eventId) ?? "Unknown",
        revenue,
        cost,
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      };
    })
    .filter((r) => r.revenue > 0 || r.cost > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 6);

  // Cashflow forecast — next 6 weeks, inflow from invoice balances due, outflow from bill balances due
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = new Date();
    start.setDate(start.getDate() + i * 7);
    return { label: `W${i + 1}`, start, end: new Date(start.getTime() + 7 * 86_400_000) };
  });
  const cashflowSeries = weeks.map((w) => {
    return { label: w.label, inflow: outstanding / 100 / 6, outflow: (supplierCosts - expenses.reduce((s, e) => s + e.paid_cents, 0)) / 100 / 6 };
  });

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Finance"
        description="Quotes, invoices, payments, profit analysis and event revenue control"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/proposals/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Quote
            </Link>
            <Link
              href="/event-manager/finance/invoices/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              New Invoice
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Invoiced" value={formatCentsCompact(totalInvoiced)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Total Paid" value={formatCentsCompact(totalPaid)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Outstanding" value={formatCentsCompact(outstanding)} icon={Clock} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Overdue" value={formatCentsCompact(overdue)} icon={AlertCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Gross Profit" value={formatCentsCompact(grossProfit)} icon={TrendingUp} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Margin" value={`${margin.toFixed(1)}%`} icon={Percent} iconColor="text-violet-600" iconBg="bg-violet-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Revenue vs Payments">
                <AreaLineChart
                  data={revenueSeries}
                  series={[
                    { key: "invoiced", color: C.brand, label: "Invoiced", area: true },
                    { key: "paid", color: C.success, label: "Paid" },
                  ]}
                  formatValue={(v) => formatCurrency(v)}
                />
              </ChartCard>
              <ChartCard title="Quote Pipeline">
                <div className="flex items-center gap-6">
                  <DonutChart
                    data={Object.values(pipelineBuckets).filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, color: b.color }))}
                    centerValue={formatCentsCompact(pipelineTotal)}
                    centerLabel="Pipeline"
                  />
                  <div className="flex-1 space-y-3">
                    <DonutLegend
                      data={Object.values(pipelineBuckets).filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, color: b.color }))}
                      formatValue={(v) => formatCentsCompact(v)}
                    />
                    <div className="pt-2 border-t border-surface-100 flex justify-between text-xs">
                      <span className="text-surface-500">Won ({wonCount})</span>
                      <span className="font-semibold text-surface-800">{formatCentsCompact(wonValue)}</span>
                    </div>
                  </div>
                </div>
              </ChartCard>
            </div>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Recent Invoices</h2>
                <Link href="/event-manager/finance/invoices" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
              </div>
              {recentInvoices.length === 0 ? (
                <EmptyState icon={Receipt} title="No invoices yet" description="Create your first invoice to start billing clients." compact />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-3 font-mono text-xs text-surface-500">
                            <Link href={`/event-manager/finance/invoices/${inv.id}`} className="block">{inv.invoice_number}</Link>
                          </td>
                          <td className="px-6 py-3 font-medium text-surface-900">
                            <Link href={`/event-manager/finance/invoices/${inv.id}`} className="block">{inv.client_name ?? "—"}</Link>
                          </td>
                          <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(inv.total_cents / 100, inv.currency)}</td>
                          <td className="px-6 py-3"><StatusBadge status={invoiceBadgeStatus(inv.status)} /></td>
                          <td className="px-6 py-3 text-surface-500">{inv.due_on ? formatDate(inv.due_on) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard title="Outstanding Payments">
                <ul className="space-y-3">
                  {outstandingReceivables.length === 0 && outstandingPayables.length === 0 && (
                    <li className="text-xs text-surface-400">Nothing outstanding.</li>
                  )}
                  {outstandingReceivables.map((i, idx) => (
                    <li key={`r-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
                        Receivable — {(i.event_id && eventNames.get(i.event_id)) ?? "Event"}
                      </span>
                      <span className="font-semibold tabular-nums">{formatCurrency((i.total_cents - i.paid_cents) / 100)}</span>
                    </li>
                  ))}
                  {outstandingPayables.map((e, idx) => (
                    <li key={`p-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-danger-500" />
                        Payable — {eventNames.get(e.event_id) ?? "Event"}
                      </span>
                      <span className="font-semibold tabular-nums">{formatCurrency((e.amount_cents - e.paid_cents) / 100)}</span>
                    </li>
                  ))}
                </ul>
              </ChartCard>
              <ChartCard title="Ticket Revenue by Event">
                <GroupedBarChart
                  groups={ticketRevenueByEvent.map((r) => ({ label: r.label, bars: [{ key: "revenue", value: r.value, color: C.brand }] }))}
                  height={160}
                  formatValue={(v) => formatCurrency(v)}
                />
              </ChartCard>
              <ChartCard title="Supplier Costs by Event">
                <GroupedBarChart
                  groups={supplierCostsByEvent.map((r) => ({ label: r.label, bars: [{ key: "cost", value: r.value, color: C.danger }] }))}
                  height={160}
                  formatValue={(v) => formatCurrency(v)}
                />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Deposit Milestones">
                <ul className="space-y-3">
                  {depositRows.length === 0 ? (
                    <li className="text-xs text-surface-400">No deposits scheduled.</li>
                  ) : (
                    depositRows.map((d, i) => (
                      <li key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-surface-600 truncate">{d.event}</span>
                          <span className="font-semibold text-surface-800 tabular-nums">{d.pct}%</span>
                        </div>
                        <ProgressBar pct={d.pct} color={d.pct >= 100 ? "bg-success-500" : "bg-brand-500"} />
                      </li>
                    ))
                  )}
                </ul>
              </ChartCard>
              <ChartCard title="Cashflow Forecast (next 6 weeks)">
                <AreaLineChart
                  data={cashflowSeries}
                  series={[
                    { key: "inflow", color: C.success, label: "Inflow", area: true },
                    { key: "outflow", color: C.danger, label: "Outflow" },
                  ]}
                  formatValue={(v) => formatCurrency(v)}
                  height={160}
                />
              </ChartCard>
            </div>

            <ChartCard title="Profit by Event" action={<Link href="/event-manager/finance/profit" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>}>
              {profitByEvent.length === 0 ? (
                <p className="text-xs text-surface-400">No profit data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-surface-400 uppercase tracking-wider">
                        <th className="text-left py-2">Event</th>
                        <th className="text-right py-2">Invoiced</th>
                        <th className="text-right py-2">Supplier Costs</th>
                        <th className="text-right py-2">Gross Profit</th>
                        <th className="text-right py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {profitByEvent.map((r, i) => (
                        <tr key={i}>
                          <td className="py-2 font-medium text-surface-900">{r.event}</td>
                          <td className="py-2 text-right tabular-nums">{formatCurrency(r.revenue / 100)}</td>
                          <td className="py-2 text-right tabular-nums">{formatCurrency(r.cost / 100)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{formatCurrency(r.profit / 100)}</td>
                          <td className="py-2 text-right tabular-nums">{r.margin.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Quick links">
              <div className="space-y-2 text-xs">
                <Link href="/event-manager/finance/quotes" className="flex justify-between text-surface-600 hover:text-brand-700">
                  <span>Quotes pipeline</span><span className="font-semibold">{proposals.length}</span>
                </Link>
                <Link href="/event-manager/finance/deposits" className="flex justify-between text-surface-600 hover:text-brand-700">
                  <span>Open deposits</span><span className="font-semibold">{deposits.filter((d) => d.status !== "paid" && d.status !== "refunded").length}</span>
                </Link>
                <Link href="/event-manager/finance/supplier-payments" className="flex justify-between text-surface-600 hover:text-brand-700">
                  <span>Bills outstanding</span><span className="font-semibold">{formatCentsCompact(expenses.reduce((s, e) => s + (e.amount_cents - e.paid_cents), 0))}</span>
                </Link>
                <Link href="/event-manager/finance/ticket-sales" className="flex justify-between text-surface-600 hover:text-brand-700">
                  <span>Ticket net revenue</span><span className="font-semibold">{formatCentsCompact([...ticketByEvent.values()].reduce((s, v) => s + v, 0))}</span>
                </Link>
              </div>
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
