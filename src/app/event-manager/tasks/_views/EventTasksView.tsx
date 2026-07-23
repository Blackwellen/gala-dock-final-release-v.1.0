"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, AlertCircle, CheckCircle2, Truck, Search } from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { STATUS_OPTIONS, PRIORITY_META, statusToBadge, formatDate, relativeDueLabel, categoryLabel } from "../task-utils";
import { PriorityBadge, InsightCard, Donut, BarList } from "../_shared";
import type { TaskRow } from "../TasksWorkspaceClient";

export function EventTasksView({ rows }: { rows: TaskRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [eventFilter, setEventFilter] = useState<string | "all">("all");

  const eventRows = useMemo(() => rows.filter((r) => r.eventId), [rows]);
  const eventOptions = useMemo(() => Array.from(new Set(eventRows.map((r) => r.eventName).filter(Boolean))) as string[], [eventRows]);

  const filtered = useMemo(() => {
    let list = eventRows;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (eventFilter !== "all") list = list.filter((t) => t.eventName === eventFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    return list;
  }, [eventRows, statusFilter, priorityFilter, eventFilter, search]);

  const hasFilters = statusFilter !== "all" || priorityFilter !== "all" || eventFilter !== "all" || search.trim() !== "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const metrics = {
    dueToday: eventRows.filter((t) => t.dueAt && t.status !== "done" && t.status !== "cancelled" && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday).length,
    overdue: eventRows.filter((t) => t.overdue).length,
    completedThisWeek: eventRows.filter((t) => t.status === "done" && t.dueAt && new Date(t.dueAt) >= weekAgo).length,
    supplierPending: rows.filter((t) => t.supplierId && t.status !== "done" && t.status !== "cancelled").length,
  };

  const byEvent = Array.from(eventRows.reduce((m, t) => {
    const key = t.eventName ?? "Unlinked";
    m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map<string, number>())).map(([label, value]) => ({ label, value }));

  const overdueByEvent = Array.from(eventRows.filter((t) => t.overdue).reduce((m, t) => {
    const key = t.eventName ?? "Unlinked";
    m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map<string, number>())).map(([label, value]) => ({ label, value, danger: true }));

  const milestones = eventRows
    .filter((t) => t.isMilestone && t.dueAt && new Date(t.dueAt) >= now)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 5);

  const progress = {
    notStarted: eventRows.filter((t) => t.status === "todo" || t.status === "backlog").length,
    inProgress: eventRows.filter((t) => t.status === "in_progress" || t.status === "review").length,
    done: eventRows.filter((t) => t.status === "done").length,
    overdue: eventRows.filter((t) => t.overdue).length,
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <KPIGrid>
          <MetricCard label="Due Today" value={metrics.dueToday} icon={Clock} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="Overdue" value={metrics.overdue} icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Completed This Week" value={metrics.completedThisWeek} icon={CheckCircle2} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Supplier Tasks Pending" value={metrics.supplierPending} icon={Truck} iconBg="bg-info-50" iconColor="text-info-600" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event tasks..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Status: All</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Priority: All</option>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Event: All</option>
            {eventOptions.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); setEventFilter("all"); }} className="text-sm font-medium text-brand-600 hover:underline">
              Clear All
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={CalendarDays} title="No event tasks found" description="Tasks linked to an event will appear here." compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200">
              <h3 className="text-sm font-semibold text-surface-800">Event Tasks <span className="text-surface-400 font-normal">{filtered.length}</span></h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Task</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Event</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Phase / Stage</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Next Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-50">
                      <td className="px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/tasks/${t.id}`} className="font-medium text-surface-900 hover:text-brand-600">{t.title}</Link>
                        {t.description && <p className="text-xs text-surface-400 mt-0.5 truncate max-w-xs">{t.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/events/${t.eventId}`} className="text-brand-600 hover:underline">{t.eventName}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-surface-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                          {t.phase ?? categoryLabel(t.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-700">{t.assignees[0]?.name ?? <span className="text-surface-400">Unassigned</span>}</td>
                      <td className="px-4 py-3">
                        <div className={cn(t.overdue ? "text-danger-600 font-medium" : "text-surface-700")}>{formatDate(t.dueAt)}</div>
                        <div className={cn("text-xs", t.overdue ? "text-danger-500" : "text-surface-400")}>{relativeDueLabel(t.dueAt)}{t.overdue ? " — Overdue" : ""}</div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={statusToBadge(t.status)} /></td>
                      <td className="px-4 py-3 text-surface-600">{t.nextAction ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden xl:block">
        <InsightCard title="Tasks by Event"><BarList items={byEvent} /></InsightCard>
        <InsightCard title="Upcoming Milestones">
          {milestones.length === 0 ? (
            <p className="text-xs text-surface-400">No upcoming milestones.</p>
          ) : (
            <ul className="space-y-3">
              {milestones.map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-surface-800">{formatDate(m.dueAt)}</span>
                    <span className="text-xs text-brand-600 font-medium">{relativeDueLabel(m.dueAt)}</span>
                  </div>
                  <p className="text-surface-700">{m.milestoneLabel ?? m.title}</p>
                  <p className="text-xs text-surface-400">{m.eventName}</p>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>
        <InsightCard title="Overdue by Event"><BarList items={overdueByEvent} /></InsightCard>
        <InsightCard title="Progress Summary">
          <Donut
            centerLabel="Total Tasks"
            centerValue={eventRows.length}
            segments={[
              { label: "Not Started", value: progress.notStarted, color: "#94a3b8" },
              { label: "In Progress", value: progress.inProgress, color: "#4f46e5" },
              { label: "Done", value: progress.done, color: "#22c55e" },
              { label: "Overdue", value: progress.overdue, color: "#ef4444" },
            ]}
          />
        </InsightCard>
      </div>
    </div>
  );
}
