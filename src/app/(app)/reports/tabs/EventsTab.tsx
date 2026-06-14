import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import { ReportCard, money } from "../components";
import type { EventsData } from "../data";

export function EventsTab({ data }: { data: EventsData }) {
  if (!data.hasData) {
    return (
      <EmptyState
        title="No events yet"
        description="Event delivery analytics will populate once events are created."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportCard title="Events by Status">
          <CSSBarChart
            orientation="horizontal"
            data={data.statusDistribution.map((s) => ({
              label: s.label,
              value: s.value,
              valueLabel: String(s.value),
            }))}
          />
        </ReportCard>

        <ReportCard title="Events by Type">
          {data.byType.length > 0 ? (
            <CSSBarChart
              data={data.byType.map((t) => ({ label: t.label, value: t.value, valueLabel: String(t.value) }))}
              height={200}
            />
          ) : (
            <EmptyState compact title="No event types recorded" />
          )}
        </ReportCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex flex-col justify-center">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">Avg Gross Margin</p>
          <p className="mt-1 text-4xl font-bold text-surface-900 tabular-nums">
            {data.avgMarginPct !== null ? `${data.avgMarginPct}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-surface-500">
            {data.avgMarginPct !== null
              ? `Across ${data.deliveredCount} delivered event${data.deliveredCount === 1 ? "" : "s"}`
              : "Add budgets and paid invoices to compute margin"}
          </p>
        </div>

        <ReportCard title="Upcoming Events" className="lg:col-span-2">
          {data.upcoming.length > 0 ? (
            <ul className="divide-y divide-surface-100 -my-2">
              {data.upcoming.map((e, i) => (
                <li key={`${e.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{e.name}</p>
                    <p className="text-xs text-surface-500">{e.date ? formatDate(e.date) : "Date TBC"}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={e.status as never} dot={false} />
                    {e.daysUntil !== null && (
                      <span className="text-xs font-medium text-surface-500 tabular-nums w-16 text-right">
                        in {e.daysUntil}d
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No upcoming events" />
          )}
        </ReportCard>
      </div>

      <ReportCard title="Event Delivery">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                <th className="pb-2 pr-4">Event</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Guests</th>
                <th className="pb-2 pr-4 text-right">Revenue</th>
                <th className="pb-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.delivery.map((e, i) => (
                <tr key={`${e.name}-${i}`} className="border-b border-surface-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-surface-900">{e.name}</td>
                  <td className="py-2.5 pr-4 text-surface-600">{e.date ? formatDate(e.date) : "—"}</td>
                  <td className="py-2.5 pr-4 text-surface-600">{e.type ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={e.status as never} dot={false} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{e.guests || "—"}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">
                    {e.revenue > 0 ? money(e.revenue) : "—"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-surface-700">
                    {e.marginPct !== null ? `${e.marginPct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>
    </div>
  );
}
