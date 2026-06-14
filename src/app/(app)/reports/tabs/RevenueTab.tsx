import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportCard, StackedBar, money } from "../components";
import type { RevenueData } from "../data";

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-success-500",
  partial: "bg-info-500",
  sent: "bg-brand-500",
  overdue: "bg-danger-500",
  draft: "bg-surface-400",
  void: "bg-surface-300",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  sent: "Sent",
  overdue: "Overdue",
  draft: "Draft",
  void: "Void",
};

export function RevenueTab({ data }: { data: RevenueData }) {
  if (!data.hasData) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Revenue analytics will populate once invoices are raised in the Finance section."
      />
    );
  }

  const segments = data.statusDistribution.map((s) => ({
    label: STATUS_LABELS[s.status] ?? s.status,
    pct: s.pct,
    color: STATUS_COLORS[s.status] ?? "bg-surface-400",
  }));

  return (
    <div className="space-y-6">
      <ReportCard title="Invoiced vs Paid — Last 12 Months">
        <div className="flex items-center gap-4 mb-4">
          <Legend color="bg-brand-500" label="Invoiced" />
          <Legend color="bg-success-500" label="Paid" />
        </div>
        <div className="flex items-end gap-3" style={{ height: 240 }}>
          {data.monthlyRevenue.map((m, i) => {
            const max = Math.max(1, ...data.monthlyRevenue.map((x) => x.invoiced));
            const invH = Math.round((m.invoiced / max) * 100);
            const paidH = Math.round((m.paid / max) * 100);
            return (
              <div key={`${m.label}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                <div className="flex items-end gap-0.5 w-full justify-center h-full">
                  <div
                    className="w-1/2 max-w-[16px] rounded-t-md bg-brand-500 min-h-[2px] transition-all"
                    style={{ height: `${invH}%` }}
                    title={`Invoiced: ${money(m.invoiced)}`}
                  />
                  <div
                    className="w-1/2 max-w-[16px] rounded-t-md bg-success-500 min-h-[2px] transition-all"
                    style={{ height: `${paidH}%` }}
                    title={`Paid: ${money(m.paid)}`}
                  />
                </div>
                <span className="text-[10px] font-medium text-surface-400">{m.label}</span>
              </div>
            );
          })}
        </div>
      </ReportCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportCard title="Revenue by Event Type" subtitle="Paid revenue grouped by event type">
          {data.byEventType.length > 0 ? (
            <CSSBarChart
              orientation="horizontal"
              data={data.byEventType.map((r) => ({
                label: r.label,
                value: r.value,
                valueLabel: money(r.value),
              }))}
            />
          ) : (
            <EmptyState compact title="No paid revenue to break down yet" />
          )}
        </ReportCard>

        <div className="space-y-6">
          <ReportCard title="Outstanding Summary">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Outstanding" value={money(data.outstanding)} tone="text-warning-600" />
              <Stat label="Overdue" value={money(data.overdue)} tone="text-danger-600" />
              <Stat label="Due This Month" value={money(data.dueThisMonth)} tone="text-surface-900" />
            </div>
            <div className="mt-4 pt-4 border-t border-surface-100 grid grid-cols-2 gap-3">
              <Stat label="Total Invoiced" value={money(data.totalInvoiced)} tone="text-surface-900" />
              <Stat label="Total Paid" value={money(data.totalPaid)} tone="text-success-600" />
            </div>
          </ReportCard>

          <ReportCard title="Invoice Status Distribution">
            {segments.length > 0 ? (
              <StackedBar segments={segments} />
            ) : (
              <EmptyState compact title="No invoices to distribute" />
            )}
          </ReportCard>
        </div>
      </div>

      <ReportCard title="Top 5 Clients by Revenue">
        {data.topClients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4 text-right">Events</th>
                  <th className="pb-2 pr-4 text-right">Billed</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.topClients.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-surface-900">{c.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{c.events}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">{money(c.billed)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-success-600">{money(c.paid)}</td>
                    <td className="py-2.5 text-right tabular-nums text-warning-600">{money(c.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No client revenue yet" />
        )}
      </ReportCard>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-surface-600">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
