"use client";

// Gantt view — operates on the same canonical `tasks` table as the Tasks
// module (no duplicate "Gantt tasks"). Groups tasks by event, plots them
// across a rolling date window, and links back to the canonical task detail.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight as ChevronRightIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  startsAt: string | null;
  isMilestone: boolean;
  overdue: boolean;
  dependsOnIds: string[];
}

export interface GanttGroup {
  eventId: string;
  eventName: string;
  eventStartAt: string | null;
  eventEndAt: string | null;
  tasks: GanttTask[];
}

const STATUS_COLOR: Record<string, string> = {
  todo: "bg-surface-400",
  backlog: "bg-surface-400",
  in_progress: "bg-brand-500",
  review: "bg-warning-500",
  blocked: "bg-danger-500",
  done: "bg-success-500",
  cancelled: "bg-surface-300",
};

export function GanttView({ groups, windowDays = 60 }: { groups: GanttGroup[]; windowDays?: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { start, days } = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return { start: s, days: windowDays };
  }, [windowDays]);

  const dayWidth = 28;
  const totalWidth = days * dayWidth;

  function dayOffset(iso: string | null): number | null {
    if (!iso) return null;
    const d = new Date(iso);
    const diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 86400000);
    return diff;
  }

  const todayOffset = dayOffset(new Date().toISOString());

  const dateHeaders = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    return { label: d.getDate(), isToday: i === todayOffset, isMonthStart: d.getDate() === 1, monthLabel: d.toLocaleDateString("en-GB", { month: "short" }) };
  });

  function toggle(eventId: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-surface-400">
        No tasks with due dates in this window.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="flex min-w-max">
        {/* Left rail: event / task names */}
        <div className="sticky left-0 z-10 w-72 shrink-0 bg-white border-r border-surface-200">
          <div className="h-12 border-b border-surface-200 flex items-center px-4 text-xs font-semibold text-surface-500 uppercase tracking-wider">
            Event / Task
          </div>
          {groups.map((g) => (
            <div key={g.eventId}>
              <button
                onClick={() => toggle(g.eventId)}
                className="w-full h-10 flex items-center gap-1.5 px-4 border-b border-surface-100 bg-surface-50 text-left"
              >
                {collapsed.has(g.eventId) ? <ChevronRightIcon className="w-3.5 h-3.5 text-surface-400" /> : <ChevronDown className="w-3.5 h-3.5 text-surface-400" />}
                <Link href={`/event-manager/events/${g.eventId}`} className="text-sm font-semibold text-surface-800 hover:text-brand-600 truncate" onClick={(e) => e.stopPropagation()}>
                  {g.eventName}
                </Link>
                <span className="ml-auto text-xs text-surface-400 shrink-0">{g.tasks.length}</span>
              </button>
              {!collapsed.has(g.eventId) && g.tasks.map((t) => (
                <div key={t.id} className="h-9 flex items-center gap-1.5 px-4 pl-9 border-b border-surface-50">
                  <Link href={`/event-manager/tasks/${t.id}`} className="text-xs text-surface-700 hover:text-brand-600 truncate">
                    {t.title}
                  </Link>
                  {t.overdue && <AlertCircle className="w-3 h-3 text-danger-500 shrink-0" />}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right: timeline */}
        <div className="relative" style={{ width: totalWidth }}>
          <div className="h-12 border-b border-surface-200 flex sticky top-0 bg-white z-[1]">
            {dateHeaders.map((d, i) => (
              <div
                key={i}
                className={cn("shrink-0 flex flex-col items-center justify-center text-[10px] border-r border-surface-100", d.isToday && "bg-brand-50")}
                style={{ width: dayWidth }}
              >
                {d.isMonthStart && <span className="text-surface-400">{d.monthLabel}</span>}
                <span className={cn(d.isToday ? "font-bold text-brand-700" : "text-surface-500")}>{d.label}</span>
              </div>
            ))}
          </div>

          {groups.map((g) => (
            <div key={g.eventId}>
              <div className="h-10 border-b border-surface-100 bg-surface-50 relative">
                {(() => {
                  const s = dayOffset(g.eventStartAt) ?? 0;
                  const e = dayOffset(g.eventEndAt) ?? s + 1;
                  if (s < 0 && e < 0) return null;
                  return (
                    <div
                      className="absolute top-3 h-4 rounded bg-surface-300/60"
                      style={{ left: Math.max(0, s) * dayWidth, width: Math.max(1, e - Math.max(0, s)) * dayWidth }}
                    />
                  );
                })()}
              </div>
              {!collapsed.has(g.eventId) && g.tasks.map((t) => {
                const offset = dayOffset(t.dueAt);
                if (offset === null) return <div key={t.id} className="h-9 border-b border-surface-50" />;
                const startOffset = dayOffset(t.startsAt) ?? offset;
                const left = Math.max(0, Math.min(startOffset, offset)) * dayWidth;
                const width = Math.max(1, Math.abs(offset - Math.min(startOffset, offset)) + 1) * dayWidth;
                return (
                  <div key={t.id} className="h-9 border-b border-surface-50 relative">
                    <Link
                      href={`/event-manager/tasks/${t.id}`}
                      title={t.title}
                      className={cn(
                        "absolute top-2 h-5 rounded-full flex items-center px-2 text-[10px] font-medium text-white truncate hover:opacity-90 transition-opacity",
                        t.isMilestone ? "rounded-full !w-4 !px-0 justify-center bg-brand-700" : STATUS_COLOR[t.status] ?? "bg-surface-400",
                        t.overdue && "ring-2 ring-danger-400"
                      )}
                      style={t.isMilestone ? { left: left } : { left, width }}
                    >
                      {!t.isMilestone && t.title}
                    </Link>
                  </div>
                );
              })}
            </div>
          ))}

          {todayOffset !== null && todayOffset >= 0 && todayOffset < days && (
            <div className="absolute top-0 bottom-0 w-px bg-brand-400 z-[1]" style={{ left: todayOffset * dayWidth + dayWidth / 2 }} />
          )}
        </div>
      </div>
    </div>
  );
}
