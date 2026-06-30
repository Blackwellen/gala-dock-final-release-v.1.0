"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, LayoutList, Calendar as CalendarIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { PRIORITY_META, STATUS_LABEL } from "../task-utils";

export interface CalendarTask {
  id: string;
  title: string;
  dueAt: string;
  status: TaskStatus;
  priority: TaskPriority;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function TaskCalendarClient({ tasks }: { tasks: CalendarTask[] }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const t of tasks) {
      const d = new Date(t.dueAt);
      const key = dayKey(d);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  // Build a 6-week grid starting on Monday.
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    // JS getDay: 0=Sun..6=Sat. Convert to Mon=0.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return out;
  }, [cursor]);

  const today = new Date();
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Task Calendar"
        description="All tasks plotted by their due date."
        actions={
          <>
            <Link
              href="/event-manager/tasks"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              <LayoutList className="w-4 h-4" />
              List View
            </Link>
            <Link
              href="/event-manager/tasks/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Task
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="p-2 rounded-lg border border-surface-200 bg-white text-surface-500 hover:text-surface-800 hover:bg-surface-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="p-2 rounded-lg border border-surface-200 bg-white text-surface-500 hover:text-surface-800 hover:bg-surface-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={CalendarIcon}
              title="No scheduled tasks"
              description="Tasks with a due date will appear on the calendar."
              action={
                <Link
                  href="/event-manager/tasks/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </Link>
              }
              compact
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-surface-200 bg-surface-50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-3 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wider text-center">
                  {d}
                </div>
              ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const inMonth = date.getMonth() === cursor.getMonth();
                const isToday =
                  date.getFullYear() === today.getFullYear() &&
                  date.getMonth() === today.getMonth() &&
                  date.getDate() === today.getDate();
                const dayTasks = tasksByDay.get(dayKey(date)) ?? [];
                return (
                  <div
                    key={i}
                    className={cn(
                      "min-h-[110px] border-b border-r border-surface-100 p-1.5 flex flex-col gap-1",
                      !inMonth && "bg-surface-50/60",
                      i % 7 === 6 && "border-r-0"
                    )}
                  >
                    <div className="flex justify-end">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full",
                          isToday ? "bg-brand-600 text-white" : inMonth ? "text-surface-700" : "text-surface-300"
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayTasks.slice(0, 3).map((t) => {
                        const meta = PRIORITY_META[t.priority];
                        const done = t.status === "done" || t.status === "cancelled";
                        return (
                          <Link
                            key={t.id}
                            href={`/event-manager/tasks/${t.id}`}
                            title={`${t.title} · ${STATUS_LABEL[t.status]}`}
                            className={cn(
                              "flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-medium truncate hover:opacity-80 transition-opacity",
                              meta.classes,
                              done && "opacity-60 line-through"
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dotColor)} />
                            <span className="truncate">{t.title}</span>
                          </Link>
                        );
                      })}
                      {dayTasks.length > 3 && (
                        <span className="text-[10px] text-surface-400 px-1.5">+{dayTasks.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
