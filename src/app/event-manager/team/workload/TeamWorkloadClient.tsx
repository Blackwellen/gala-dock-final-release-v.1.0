"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users2,
  CalendarDays,
  AlertTriangle,
  CalendarOff,
  Clock,
  UserX,
  ChevronLeft,
  ChevronRight,
  Search,
  ListFilter,
  Bookmark,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { SectionTabs, TEAM_TABS } from "@/components/ui/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightsRail, RailCard } from "@/app/event-manager/suppliers/_components/SupplierInsightsRail";
import { MiniDonut } from "@/app/event-manager/suppliers/_components/MiniDonut";
import { cn } from "@/lib/utils";
import type { TeamWorkspaceData } from "../_data/queries";
import {
  buildWeekDays,
  formatWeekRangeLabel,
  getWeekStart,
  assignmentSpansDay,
  assignmentHoursOnDay,
  formatCallTime,
  blockSpansDay,
  classifyWorkload,
  STANDARD_WEEKLY_HOURS,
  WORKLOAD_STYLES,
  type WorkloadStatus,
} from "../_lib/workload";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_BLOCK_STYLES: Record<string, string> = {
  confirmed: "bg-success-50 border-success-200 text-success-800",
  pending: "bg-warning-50 border-warning-300 text-warning-800",
};

export function TeamWorkloadClient({ members, assignments, availability }: TeamWorkspaceData) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [range, setRange] = useState<"week" | "2weeks" | "month">("week");
  const [search, setSearch] = useState("");

  const dayCount = range === "week" ? 7 : range === "2weeks" ? 14 : 28;
  const days = useMemo(() => buildWeekDays(weekStart, dayCount), [weekStart, dayCount]);

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== "declined"),
    [assignments],
  );

  const filteredMembers = useMemo(
    () =>
      search.trim()
        ? members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
        : members,
    [members, search],
  );

  const perMember = useMemo(() => {
    return filteredMembers.map((m) => {
      const mine = activeAssignments.filter((a) => a.userId === m.userId);
      const myBlocks = availability.filter((b) => b.userId === m.userId);

      let scheduledHours = 0;
      for (const day of days) {
        const dayAssignments = mine.filter((a) => assignmentSpansDay(a, day.iso));
        const dayHours = dayAssignments.reduce((sum, a) => sum + assignmentHoursOnDay(a), 0);
        scheduledHours += Math.min(dayHours, 24);
      }

      const weeklyBlocked = myBlocks.some((b) => days.every((d) => blockSpansDay(b, d.iso)));
      const status = classifyWorkload(scheduledHours, weeklyBlocked);

      return { member: m, assignments: mine, blocks: myBlocks, scheduledHours, status };
    });
  }, [filteredMembers, activeAssignments, availability, days]);

  const kpis = useMemo(() => {
    const eventsStaffed = new Set(activeAssignments.map((a) => a.eventId)).size;
    const overloaded = perMember.filter((p) => p.status === "overloaded").length;
    const now = Date.now();
    const activeOOO = new Set(
      availability
        .filter((b) => new Date(b.endAt).getTime() >= now && new Date(b.startAt).getTime() <= now)
        .map((b) => b.userId),
    ).size;
    const totalHours = perMember.reduce((sum, p) => sum + p.scheduledHours, 0);
    return { eventsStaffed, overloaded, activeOOO, totalHours };
  }, [activeAssignments, perMember, availability]);

  const balanceSegments = useMemo(() => {
    const counts: Record<WorkloadStatus, number> = {
      light: 0,
      balanced: 0,
      high: 0,
      overloaded: 0,
      unavailable: 0,
    };
    for (const p of perMember) counts[p.status]++;
    const colorFor: Record<WorkloadStatus, string> = {
      light: "bg-info-500",
      balanced: "bg-success-500",
      high: "bg-warning-500",
      overloaded: "bg-danger-500",
      unavailable: "bg-surface-400",
    };
    return (Object.keys(counts) as WorkloadStatus[])
      .filter((k) => counts[k] > 0)
      .map((k) => ({ label: WORKLOAD_STYLES[k].label, value: counts[k], color: colorFor[k] }));
  }, [perMember]);

  const weekRangeLabel = formatWeekRangeLabel(days);

  function shiftWeek(delta: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * (range === "month" ? 28 : range === "2weeks" ? 14 : 7));
    setWeekStart(getWeekStart(next));
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Team & Staffing"
        description="Workload across the team, who is available, and who is out of office"
        actions={
          <Link
            href="/event-manager/team/availability"
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            Add Availability
          </Link>
        }
        tabs={<SectionTabs tabs={TEAM_TABS} />}
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Team Members" value={String(members.length)} icon={Users2} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Events Staffed" value={String(kpis.eventsStaffed)} icon={CalendarDays} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Overloaded" value={String(kpis.overloaded)} icon={AlertTriangle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Active Out-of-Office" value={String(kpis.activeOOO)} icon={CalendarOff} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Total Hours This Week" value={`${Math.round(kpis.totalHours)}h`} icon={Clock} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Open Role Gaps" value="—" icon={UserX} iconColor="text-brand-600" iconBg="bg-brand-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5">
              <button type="button" onClick={() => shiftWeek(-1)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Previous range">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-surface-700 whitespace-nowrap px-1">{weekRangeLabel}</span>
              <button type="button" onClick={() => shiftWeek(1)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Next range">
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center rounded-lg border border-surface-200 overflow-hidden ml-1">
                {(["week", "2weeks", "month"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-medium transition-colors",
                      range === r ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-50",
                    )}
                  >
                    {r === "week" ? "Week" : r === "2weeks" ? "2 Weeks" : "Month"}
                  </button>
                ))}
              </div>

              <div className="relative ml-auto flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team members…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <ListFilter className="w-3.5 h-3.5" /> More filters
              </button>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <Bookmark className="w-3.5 h-3.5" /> Saved views
              </button>
            </div>

            {/* Gantt */}
            {perMember.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState
                  icon={Users2}
                  title="No team members yet"
                  description="Invite teammates from Settings to start tracking workload and assignments."
                  compact
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="sticky left-0 z-10 bg-surface-50 px-4 py-2.5 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider w-56">
                          Team Member
                        </th>
                        {days.map((d) => (
                          <th
                            key={d.iso}
                            className={cn(
                              "px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[150px]",
                              d.isToday ? "text-brand-700 bg-brand-50/60" : "text-surface-500",
                            )}
                          >
                            <div>{d.dow} {d.label}</div>
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {perMember.map(({ member, assignments: mine, blocks, scheduledHours, status }) => {
                        const style = WORKLOAD_STYLES[status];
                        return (
                          <tr key={member.userId} className="align-top">
                            <td className="sticky left-0 z-10 bg-white px-4 py-3 w-56">
                              <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                                  {initials(member.name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-medium text-surface-900 truncate text-sm">{member.name}</p>
                                  <p className="text-xs text-surface-400 truncate">{member.role ?? "Team member"}</p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border", style.bg, style.text, style.border)}>
                                  <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
                                  {style.label}
                                </span>
                                <span className="text-[11px] text-surface-400 tabular-nums">
                                  {Math.round(scheduledHours)}h / {STANDARD_WEEKLY_HOURS}h
                                </span>
                              </div>
                            </td>
                            {days.map((d) => {
                              const dayAssignments = mine.filter((a) => assignmentSpansDay(a, d.iso));
                              const dayBlocks = blocks.filter((b) => blockSpansDay(b, d.iso));
                              return (
                                <td key={d.iso} className={cn("px-2 py-2 align-top", d.isToday && "bg-brand-50/30")}>
                                  <div className="space-y-1">
                                    {dayBlocks.map((b) => (
                                      <div key={b.id} className="rounded-md border border-surface-200 bg-surface-100 px-2 py-1 text-[11px] text-surface-500">
                                        {b.blockType === "holiday" ? "Out of Office" : b.reason ?? b.blockType}
                                      </div>
                                    ))}
                                    {dayAssignments.map((a) => (
                                      <div
                                        key={a.id}
                                        className={cn(
                                          "rounded-md border px-2 py-1 text-[11px] leading-tight",
                                          STATUS_BLOCK_STYLES[a.status] ?? STATUS_BLOCK_STYLES.pending,
                                        )}
                                        title={`${a.eventName} · ${a.role ?? "Staff"}`}
                                      >
                                        <div className="font-medium truncate">{a.eventName}</div>
                                        <div className="truncate opacity-80">
                                          {formatCallTime(a.callTime) && formatCallTime(a.endTime)
                                            ? `${formatCallTime(a.callTime)}–${formatCallTime(a.endTime)}`
                                            : a.role ?? "Assigned"}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right text-sm font-semibold text-surface-700 tabular-nums">
                              {Math.round(scheduledHours)}h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-surface-200 bg-surface-50 text-xs text-surface-500">
                  <div className="flex items-center gap-4 flex-wrap">
                    <LegendDot className="bg-success-500" label="Confirmed" />
                    <LegendDot className="bg-warning-500" label="Tentative / Hold" />
                    <LegendDot className="bg-surface-400" label="Unavailable" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span>All times shown in local time</span>
                    <button type="button" className="p-1 rounded hover:bg-surface-200" aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
                    <span className="tabular-nums">100%</span>
                    <button type="button" className="p-1 rounded hover:bg-surface-200" aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <InsightsRail>
            <RailCard title="Workload Balance">
              <MiniDonut segments={balanceSegments} centerLabel={String(members.length)} centerSubLabel="Members" />
            </RailCard>
            <RailCard title="Understaffed Shifts" viewAllHref="/event-manager/team/staffing-requests">
              <p className="text-xs text-surface-400">
                Open-role tracking will appear here once staffing requests are wired to events.
              </p>
            </RailCard>
            <RailCard title="Team Availability Mix" viewAllHref="/event-manager/team/availability">
              <p className="text-xs text-surface-500">
                {perMember.filter((p) => p.status !== "unavailable").length} of {members.length} members have capacity this range.
              </p>
            </RailCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", className)} />
      {label}
    </span>
  );
}
