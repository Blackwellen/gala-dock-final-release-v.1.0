import { Banknote, TrendingDown, TrendingUp, BarChart2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profit" };

function marginColor(margin: number) {
  if (margin >= 30) return "text-success-700 bg-success-50 border-success-200";
  if (margin >= 15) return "text-warning-700 bg-warning-50 border-warning-200";
  return "text-danger-700 bg-danger-50 border-danger-200";
}

interface EventRollup {
  eventId: string | null;
  name: string;
  revenueCents: number;
  costCents: number;
}

export default async function ProfitPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Revenue = invoiced amounts (exclude void/draft). Supplier costs = accepted quotes.
  const [{ data: invData }, { data: quoteData }, { data: eventData }] = await Promise.all([
    supabase
      .from("invoices")
      .select("event_id, total_cents, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .not("status", "in", "(draft,void)"),
    supabase
      .from("quotes")
      .select("event_id, total_cents, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .eq("status", "accepted"),
    supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
  ]);

  const invoices = (invData ?? []) as { event_id: string | null; total_cents: number }[];
  const quotes = (quoteData ?? []) as { event_id: string | null; total_cents: number }[];
  const eventNames = new Map<string, string>(
    ((eventData ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name])
  );

  const rollups = new Map<string, EventRollup>();
  const keyFor = (id: string | null) => id ?? "__unassigned__";

  for (const inv of invoices) {
    const k = keyFor(inv.event_id);
    const row = rollups.get(k) ?? {
      eventId: inv.event_id,
      name: inv.event_id ? eventNames.get(inv.event_id) ?? "Unknown event" : "Unassigned",
      revenueCents: 0,
      costCents: 0,
    };
    row.revenueCents += inv.total_cents;
    rollups.set(k, row);
  }
  for (const q of quotes) {
    const k = keyFor(q.event_id);
    const row = rollups.get(k) ?? {
      eventId: q.event_id,
      name: q.event_id ? eventNames.get(q.event_id) ?? "Unknown event" : "Unassigned",
      revenueCents: 0,
      costCents: 0,
    };
    row.costCents += q.total_cents;
    rollups.set(k, row);
  }

  const rows = Array.from(rollups.values())
    .map((r) => {
      const profit = r.revenueCents - r.costCents;
      const margin = r.revenueCents > 0 ? (profit / r.revenueCents) * 100 : 0;
      return { ...r, profitCents: profit, margin };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const grossRevenue = rows.reduce((s, r) => s + r.revenueCents, 0);
  const totalCosts = rows.reduce((s, r) => s + r.costCents, 0);
  const grossProfit = grossRevenue - totalCosts;
  const overallMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader title="Profit" description="Revenue vs supplier costs by event" />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-4">
          <MetricCard label="Gross Revenue" value={formatCurrency(grossRevenue / 100)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Supplier Costs" value={formatCurrency(totalCosts / 100)} icon={TrendingDown} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Gross Profit" value={formatCurrency(grossProfit / 100)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Margin" value={`${overallMargin.toFixed(1)}%`} icon={BarChart2} iconColor="text-success-600" iconBg="bg-success-50" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-sm font-semibold text-surface-900">Profit by Event</h2>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              title="No profit data yet"
              description="Profit is calculated from issued invoices (revenue) and accepted quotes (supplier costs)."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Revenue</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Costs</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Profit</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {rows.map((row) => (
                    <tr key={row.eventId ?? "unassigned"} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-surface-900">{row.name}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-900">{formatCurrency(row.revenueCents / 100)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(row.costCents / 100)}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(row.profitCents / 100)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", marginColor(row.margin))}>
                          {row.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
