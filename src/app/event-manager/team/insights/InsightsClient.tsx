"use client";

import { useMemo } from "react";
import { Clock, TrendingUp, AlarmClock, DollarSign, ShieldCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { SectionTabs, TEAM_TABS } from "@/components/ui/SectionTabs";
import { MiniDonut } from "@/app/event-manager/suppliers/_components/MiniDonut";
import { cn } from "@/lib/utils";
import type { TeamDirectoryMember, TeamAssignmentRow } from "../_data/queries";
import { assignmentSpansDay, assignmentHoursOnDay, buildWeekDays, getWeekStart, STANDARD_WEEKLY_HOURS } from "../_lib/workload";

function formatMoney(cents: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function InsightsClient({ directory, assignments }: { directory: TeamDirectoryMember[]; assignments: TeamAssignmentRow[] }) {
  const days = useMemo(() => buildWeekDays(getWeekStart(new Date()), 7), []);
  const active = useMemo(() => assignments.filter((a) => a.status !== "declined"), [assignments]);

  const perMember = useMemo(() => {
    return directory.map((m) => {
      const mine = active.filter((a) => a.userId === m.userId);
      let scheduledHours = 0;
      for (const day of days) {
        const dayAssignments = mine.filter((a) => assignmentSpansDay(a, day.iso));
        scheduledHours += Math.min(dayAssignments.reduce((sum, a) => sum + assignmentHoursOnDay(a), 0), 24);
      }
      const overtime = Math.max(0, scheduledHours - STANDARD_WEEKLY_HOURS);
      const cost = m.hourRateCents ? Math.round(scheduledHours * m.hourRateCents) : 0;
      return { member: m, scheduledHours, overtime, cost };
    });
  }, [directory, active, days]);

  const totalScheduledHours = perMember.reduce((sum, p) => sum + p.scheduledHours, 0);
  const totalOvertime = perMember.reduce((sum, p) => sum + p.overtime, 0);
  const totalCost = perMember.reduce((sum, p) => sum + p.cost, 0);
  const utilisationRate = directory.length ? Math.round((totalScheduledHours / (directory.length * STANDARD_WEEKLY_HOURS)) * 100) : 0;
  const eventsStaffed = new Set(active.map((a) => a.eventId)).size;

  const deptHours = useMemo(() => {
    const map = new Map<string, { hours: number; count: number }>();
    for (const p of perMember) {
      const key = p.member.department ?? "Other";
      const cur = map.get(key) ?? { hours: 0, count: 0 };
      map.set(key, { hours: cur.hours + p.scheduledHours, count: cur.count + 1 });
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, utilisation: v.count ? Math.round((v.hours / (v.count * STANDARD_WEEKLY_HOURS)) * 100) : 0, hours: v.hours }))
      .sort((a, b) => b.utilisation - a.utilisation);
  }, [perMember]);

  const workloadDonut = useMemo(() => {
    const palette = ["bg-brand-500", "bg-info-500", "bg-success-500", "bg-warning-500", "bg-danger-500", "bg-violet-500"];
    const map = new Map<string, number>();
    for (const p of perMember) {
      const key = p.member.department ?? "Other";
      map.set(key, (map.get(key) ?? 0) + Math.round(p.scheduledHours));
    }
    return Array.from(map.entries()).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  }, [perMember]);

  const complianceCounts = useMemo(() => {
    const compliant = directory.filter((m) => m.complianceStatus === "compliant").length;
    const expiring = directory.filter((m) => m.complianceStatus === "expiring_soon").length;
    const expired = directory.filter((m) => m.complianceStatus === "expired").length;
    return { compliant, expiring, expired };
  }, [directory]);

  const topPerformers = useMemo(
    () => [...directory].filter((m) => m.rating !== null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5),
    [directory],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Team Insights"
        description="Real-time capacity, performance, and staffing insights across your organization"
        tabs={<SectionTabs tabs={TEAM_TABS} />}
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Scheduled Hours" value={`${Math.round(totalScheduledHours)}h`} icon={Clock} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Utilisation Rate" value={`${utilisationRate}%`} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Overtime Hours" value={`${Math.round(totalOvertime)}h`} icon={AlarmClock} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Cost This Period" value={formatMoney(totalCost)} icon={DollarSign} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Events Staffed" value={String(eventsStaffed)} icon={ShieldCheck} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Compliance Gaps" value={String(complianceCounts.expiring + complianceCounts.expired)} icon={UserX} iconColor="text-danger-600" iconBg="bg-danger-50" />
        </KPIGrid>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Utilisation by Department</h3>
            {deptHours.length === 0 ? <p className="text-xs text-surface-400">No data yet.</p> : (
              <ul className="space-y-2.5">
                {deptHours.map((d) => (
                  <li key={d.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-surface-700">{d.label}</span>
                      <span className="text-surface-500 tabular-nums">{d.utilisation}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, d.utilisation)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Workload Distribution</h3>
            <MiniDonut segments={workloadDonut} centerLabel={`${Math.round(totalScheduledHours)}h`} centerSubLabel="Total Hours" />
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Compliance Mix</h3>
            <MiniDonut
              segments={[
                { label: "Compliant", value: complianceCounts.compliant, color: "bg-success-500" },
                { label: "Expiring Soon", value: complianceCounts.expiring, color: "bg-warning-500" },
                { label: "Expired", value: complianceCounts.expired, color: "bg-danger-500" },
              ]}
              centerLabel={String(directory.length)}
              centerSubLabel="Members"
            />
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Recommended Actions</h3>
            <ul className="space-y-2 text-xs text-surface-600">
              {complianceCounts.expired > 0 && <li>• Renew {complianceCounts.expired} expired certification{complianceCounts.expired === 1 ? "" : "s"}.</li>}
              {totalOvertime > 0 && <li>• Redistribute {Math.round(totalOvertime)}h of overtime across the team.</li>}
              {complianceCounts.expired === 0 && totalOvertime === 0 && <li className="text-surface-400">No urgent actions right now.</li>}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Top Performers</h3>
            {topPerformers.length === 0 ? (
              <p className="text-xs text-surface-400">No performance ratings recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-400">
                    <th className="pb-2 font-medium">Team Member</th>
                    <th className="pb-2 font-medium text-right">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {topPerformers.map((m) => (
                    <tr key={m.userId}>
                      <td className="py-2 text-surface-800">{m.name}</td>
                      <td className="py-2 text-right text-surface-600 tabular-nums">{m.rating?.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Insights Summary</h3>
            <p className="text-xs text-surface-500 leading-relaxed">
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 mr-1.5 align-middle">AI-generated</span>
              Utilisation is running at {utilisationRate}% across {directory.length} team members this week, with{" "}
              {complianceCounts.expired + complianceCounts.expiring > 0
                ? `${complianceCounts.expired + complianceCounts.expiring} compliance item${complianceCounts.expired + complianceCounts.expiring === 1 ? "" : "s"} needing attention`
                : "no outstanding compliance issues"}
              . This narrative is derived directly from the metrics above — no data is invented.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
