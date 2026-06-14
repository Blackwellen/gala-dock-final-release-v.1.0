import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportCard } from "../components";
import type { SuppliersData } from "../data";

export function SuppliersTab({ data }: { data: SuppliersData }) {
  if (!data.hasData) {
    return (
      <EmptyState
        title="No suppliers yet"
        description="Supplier performance analytics will populate once suppliers and bookings are recorded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <ReportCard title="Suppliers by Booking Count" subtitle="Events each supplier is engaged on">
        {data.byBookings.length > 0 ? (
          <CSSBarChart
            orientation="horizontal"
            data={data.byBookings.map((s) => ({ label: s.label, value: s.value, valueLabel: String(s.value) }))}
          />
        ) : (
          <EmptyState compact title="No supplier bookings yet" description="Assign suppliers to events to see usage." />
        )}
      </ReportCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportCard title="Supplier Document Health">
          <div className="grid grid-cols-2 gap-3">
            <HealthStat label="Verified" value={data.docHealth.verified} tone="text-success-600" bg="bg-success-50" />
            <HealthStat label="Expiring (30d)" value={data.docHealth.expiringSoon} tone="text-warning-600" bg="bg-warning-50" />
            <HealthStat label="Expired" value={data.docHealth.expired} tone="text-danger-600" bg="bg-danger-50" />
            <HealthStat label="Total Suppliers" value={data.docHealth.total} tone="text-surface-900" bg="bg-surface-100" />
          </div>
        </ReportCard>

        <ReportCard title="Quote Acceptance">
          <div className="grid grid-cols-2 gap-3">
            <HealthStat label="Quotes Sent" value={data.quotes.sent} tone="text-surface-900" bg="bg-surface-100" />
            <HealthStat label="Accepted" value={data.quotes.accepted} tone="text-success-600" bg="bg-success-50" />
            <HealthStat label="Declined" value={data.quotes.declined} tone="text-danger-600" bg="bg-danger-50" />
            <HealthStat label="Pending" value={data.quotes.pending} tone="text-warning-600" bg="bg-warning-50" />
          </div>
          <div className="mt-4 pt-4 border-t border-surface-100">
            <p className="text-xs font-medium text-surface-500">Acceptance Rate</p>
            <p className="mt-1 text-2xl font-bold text-surface-900 tabular-nums">
              {data.quotes.acceptanceRate !== null ? `${data.quotes.acceptanceRate}%` : "—"}
            </p>
          </div>
        </ReportCard>
      </div>

      <ReportCard title="Top Suppliers by Usage">
        {data.topSuppliers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                  <th className="pb-2 pr-4">Supplier</th>
                  <th className="pb-2 pr-4 text-right">Event Bookings</th>
                  <th className="pb-2 pr-4 text-right">Quotes</th>
                  <th className="pb-2 text-right">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {data.topSuppliers.map((s, i) => (
                  <tr key={`${s.name}-${i}`} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-surface-900">{s.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">{s.bookings}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{s.quotes}</td>
                    <td className="py-2.5 text-right tabular-nums text-success-600">{s.accepted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No supplier data yet" />
        )}
      </ReportCard>
    </div>
  );
}

function HealthStat({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} px-4 py-3`}>
      <p className="text-xs font-medium text-surface-600">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
