"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ProfileShell } from "../_components/ProfileShell";
import { cn } from "@/lib/utils";
import type { MemberDetail } from "../_data/member";
import type { TeamAssignmentRow, TeamAvailabilityRow } from "../../../_data/queries";
import {
  buildWeekDays,
  formatWeekRangeLabel,
  getWeekStart,
  assignmentSpansDay,
  assignmentHoursOnDay,
  formatCallTime,
  blockSpansDay,
  STANDARD_WEEKLY_HOURS,
} from "../../../_lib/workload";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-success-50 border-success-200 text-success-800",
  pending: "bg-warning-50 border-warning-300 text-warning-800",
};

export function ScheduleClient({ member, assignments, availability }: { member: MemberDetail; assignments: TeamAssignmentRow[]; availability: TeamAvailabilityRow[] }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const days = useMemo(() => buildWeekDays(weekStart, 7), [weekStart]);
  const weekRangeLabel = formatWeekRangeLabel(days);

  const perDay = days.map((d) => ({
    ...d,
    assignments: assignments.filter((a) => assignmentSpansDay(a, d.iso)),
    blocks: availability.filter((b) => blockSpansDay(b, d.iso)),
  }));

  const scheduledHours = perDay.reduce((sum, d) => sum + d.assignments.reduce((s, a) => s + assignmentHoursOnDay(a), 0), 0);
  const tentativeHours = perDay.reduce((sum, d) => sum + d.assignments.filter((a) => a.status === "pending").reduce((s, a) => s + assignmentHoursOnDay(a), 0), 0);
  const unavailableHours = perDay.filter((d) => d.blocks.length > 0).length * 8;

  return (
    <ProfileShell
      member={{ userId: member.userId, name: member.name, role: member.role, memberCode: member.memberCode, location: member.location, status: "active" }}
      activeTab="schedule"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">Schedule</h2>
          <p className="text-sm text-surface-500">Manage {member.name.split(" ")[0]}&rsquo;s availability, assignments, and capacity</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
            <Plus className="w-4 h-4" /> Add Availability
          </button>
          <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-brand">
            <Plus className="w-4 h-4" /> Assign Shift
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5">
            <button type="button" onClick={() => setWeekStart(getWeekStart(new Date(weekStart.getTime() - 7 * 86400000)))} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Previous week">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-surface-700 px-1">{weekRangeLabel}</span>
            <button type="button" onClick={() => setWeekStart(getWeekStart(new Date(weekStart.getTime() + 7 * 86400000)))} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Next week">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <MiniKpi label="Total Capacity" value={`${member.standardWeeklyHours}h`} />
            <MiniKpi label="Scheduled" value={`${Math.round(scheduledHours)}h (${Math.round((scheduledHours / member.standardWeeklyHours) * 100)}%)`} />
            <MiniKpi label="Tentative" value={`${Math.round(tentativeHours)}h`} />
            <MiniKpi label="Unavailable" value={`${unavailableHours}h`} />
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    {perDay.map((d) => (
                      <th key={d.iso} className={cn("px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[160px]", d.isToday ? "text-brand-700 bg-brand-50/60" : "text-surface-500")}>
                        {d.dow} {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="align-top">
                    {perDay.map((d) => (
                      <td key={d.iso} className="px-2 py-3 align-top border-r border-surface-100 last:border-r-0">
                        <div className="space-y-1.5 min-h-[120px]">
                          {d.blocks.map((b) => (
                            <div key={b.id} className="rounded-md border border-surface-200 bg-surface-100 px-2 py-1.5 text-[11px] text-surface-500">
                              {b.blockType === "holiday" ? "Out of Office" : b.reason ?? b.blockType}
                            </div>
                          ))}
                          {d.assignments.map((a) => (
                            <div key={a.id} className={cn("rounded-md border px-2 py-1.5 text-[11px] leading-tight", STATUS_STYLES[a.status] ?? STATUS_STYLES.pending)}>
                              <div className="font-medium truncate">{a.eventName}</div>
                              <div className="opacity-80">{formatCallTime(a.callTime) ?? ""}{formatCallTime(a.endTime) ? `–${formatCallTime(a.endTime)}` : ""}</div>
                              {a.venueName && <div className="opacity-70 truncate">{a.venueName}</div>}
                              <div className="opacity-70 truncate">{a.role ?? "Staff"}</div>
                            </div>
                          ))}
                          {d.assignments.length === 0 && d.blocks.length === 0 && (
                            <p className="text-[11px] text-surface-300 text-center pt-4">—</p>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-surface-200 bg-surface-50 text-xs text-surface-400">
              All times shown in local time
            </div>
          </div>
        </div>

        <aside className="w-full xl:w-[280px] shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Weekly Capacity</h3>
            <p className="text-2xl font-bold text-surface-900 tabular-nums">{Math.round(scheduledHours)}h</p>
            <p className="text-xs text-surface-400">of {member.standardWeeklyHours}h capacity</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Upcoming Events</h3>
            {assignments.filter((a) => a.startAt && new Date(a.startAt).getTime() >= Date.now()).length === 0 ? (
              <p className="text-xs text-surface-400">No upcoming events.</p>
            ) : (
              <ul className="space-y-2">
                {assignments
                  .filter((a) => a.startAt && new Date(a.startAt).getTime() >= Date.now())
                  .slice(0, 4)
                  .map((a) => (
                    <li key={a.id} className="text-xs">
                      <p className="text-surface-800">{a.eventName}</p>
                      <p className="text-surface-400">{a.startAt ? new Date(a.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "TBC"}</p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </ProfileShell>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-3">
      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-surface-900 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
