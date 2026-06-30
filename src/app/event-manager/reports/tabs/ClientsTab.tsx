import Link from "next/link";
import { Users, Repeat, CalendarRange, Banknote } from "lucide-react";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { ReportCard, money } from "../components";
import type { ClientsData } from "../data";

export function ClientsTab({ data }: { data: ClientsData }) {
  if (!data.hasData) {
    return (
      <EmptyState
        title="No clients yet"
        description="Client retention analytics populate once clients and their events are recorded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <KPIGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <MetricCard label="Total Clients" value={data.totalClients} icon={Users} />
        <MetricCard
          label="Repeat Clients"
          value={data.repeatPct !== null ? `${data.repeatClients} (${data.repeatPct}%)` : String(data.repeatClients)}
          icon={Repeat}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
        />
        <MetricCard
          label="Avg Events / Client"
          value={data.avgEventsPerClient !== null ? data.avgEventsPerClient.toFixed(1) : "—"}
          icon={CalendarRange}
          iconColor="text-info-600"
          iconBg="bg-info-50"
        />
        <MetricCard
          label="Avg Client Value"
          value={money(data.avgClientValue)}
          icon={Banknote}
          iconColor="text-success-600"
          iconBg="bg-success-50"
        />
      </KPIGrid>

      <ReportCard title="Clients" subtitle="Top clients by total revenue">
        {data.clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4 text-right">Events</th>
                  <th className="pb-2 pr-4">First Event</th>
                  <th className="pb-2 pr-4">Last Event</th>
                  <th className="pb-2 pr-4 text-right">Total Spent</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-surface-900">{c.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{c.events}</td>
                    <td className="py-2.5 pr-4 text-surface-600">{c.firstEvent ? formatDate(c.firstEvent) : "—"}</td>
                    <td className="py-2.5 pr-4 text-surface-600">{c.lastEvent ? formatDate(c.lastEvent) : "—"}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">{money(c.totalSpent)}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={
                          c.active
                            ? "text-xs font-medium text-success-600"
                            : "text-xs font-medium text-surface-400"
                        }
                      >
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No clients recorded yet" />
        )}
      </ReportCard>

      <ReportCard
        title="Due for Re-engagement"
        subtitle="Clients whose last event was 9–12 months ago"
      >
        {data.renewals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Last Event</th>
                  <th className="pb-2 pr-4 text-right">Events</th>
                  <th className="pb-2 pr-4 text-right">Total Spent</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.renewals.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-surface-900">{c.name}</td>
                    <td className="py-2.5 pr-4 text-surface-600">{c.lastEvent ? formatDate(c.lastEvent) : "—"}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{c.events}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">{money(c.totalSpent)}</td>
                    <td className="py-2.5 text-right">
                      <Link
                        href="/event-manager/leads/new"
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        Create Lead
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No clients due for re-engagement" description="Clients with events 9–12 months old will appear here." />
        )}
      </ReportCard>
    </div>
  );
}
