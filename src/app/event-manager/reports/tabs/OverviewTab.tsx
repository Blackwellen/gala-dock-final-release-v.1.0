import { Banknote, CalendarCheck, Activity, UserPlus, TrendingUp } from "lucide-react";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportCard, money } from "../components";
import type { OverviewData } from "../data";

export function OverviewTab({ data }: { data: OverviewData }) {
  const hasRevenue = data.monthlyRevenue.some((m) => m.paid > 0);
  const hasPipeline = data.pipeline.some((p) => p.count > 0);

  return (
    <div className="space-y-6">
      <KPIGrid>
        <MetricCard
          label="Revenue YTD"
          value={money(data.revenueYtd)}
          icon={Banknote}
          iconColor="text-success-600"
          iconBg="bg-success-50"
        />
        <MetricCard
          label="Events Delivered YTD"
          value={data.eventsDeliveredYtd}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Active Events"
          value={data.activeEvents}
          icon={Activity}
          iconColor="text-info-600"
          iconBg="bg-info-50"
        />
        <MetricCard
          label="New Leads (Month)"
          value={data.newLeadsThisMonth}
          icon={UserPlus}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
        />
        <MetricCard
          label="Pipeline Value"
          value={money(data.pipelineValue)}
          icon={TrendingUp}
          iconColor="text-brand-600"
          iconBg="bg-brand-50"
        />
      </KPIGrid>

      <ReportCard title="Revenue — Last 12 Months" subtitle="Paid invoices by month">
        {hasRevenue ? (
          <CSSBarChart
            data={data.monthlyRevenue.map((m) => ({
              label: m.label,
              value: Math.round(m.paid),
              valueLabel: money(m.paid),
            }))}
            height={240}
          />
        ) : (
          <EmptyState compact title="No revenue recorded yet" description="Paid invoices will appear here as a monthly trend." />
        )}
      </ReportCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportCard title="Lead Pipeline" subtitle="Leads by stage">
          {hasPipeline ? (
            <CSSBarChart
              orientation="horizontal"
              data={data.pipeline.map((p) => ({
                label: p.label,
                value: p.count,
                color: STAGE_COLORS[p.stage] ?? "bg-brand-500",
                valueLabel: String(p.count),
              }))}
            />
          ) : (
            <EmptyState compact title="No leads yet" description="Pipeline stages populate once leads are created." />
          )}
        </ReportCard>

        <div className="grid grid-cols-1 gap-4 content-start">
          <Insight
            label="Avg lead → event conversion"
            value={data.insights.avgLeadToEventDays !== null ? `${data.insights.avgLeadToEventDays} days` : "No conversions yet"}
          />
          <Insight
            label="Most booked event type"
            value={
              data.insights.topEventType
                ? `${data.insights.topEventType.type} (${data.insights.topEventType.count})`
                : "No events yet"
            }
          />
          <Insight
            label="Top supplier by events"
            value={
              data.insights.topSupplier
                ? `${data.insights.topSupplier.name} (${data.insights.topSupplier.count})`
                : "No supplier bookings yet"
            }
          />
        </div>
      </div>
    </div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  "new-enquiry": "bg-info-500",
  contacted: "bg-violet-500",
  "proposal-sent": "bg-brand-500",
  negotiating: "bg-warning-500",
  won: "bg-success-500",
  lost: "bg-surface-400",
};

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card px-5 py-4">
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className="mt-1 text-base font-bold text-surface-900">{value}</p>
    </div>
  );
}
