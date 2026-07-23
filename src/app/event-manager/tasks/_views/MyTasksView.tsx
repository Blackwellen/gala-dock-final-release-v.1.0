"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, AlertCircle, CheckCircle2, Truck, Search, MoreHorizontal } from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { STATUS_OPTIONS, PRIORITY_META, statusToBadge, formatDate, relativeDueLabel } from "../task-utils";
import { PriorityBadge, AssigneeAvatar, InsightCard, Donut, BarList, Sparkline } from "../_shared";
import type { TaskRow } from "../TasksWorkspaceClient";

export function MyTasksView({ rows }: { rows: TaskRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [eventFilter, setEventFilter] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const mine = useMemo(() => rows.filter((r) => r.isMine), [rows]);

  const eventOptions = useMemo(
    () => Array.from(new Set(mine.map((r) => r.eventName).filter(Boolean))) as string[],
    [mine]
  );

  const filtered = useMemo(() => {
    let list = mine;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (eventFilter !== "all") list = list.filter((t) => t.eventName === eventFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.eventName ?? "").toLowerCase().includes(q));
    return list;
  }, [mine, statusFilter, priorityFilter, eventFilter, search]);

  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all" || eventFilter !== "all" || search.trim() !== "";
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const metrics = {
    dueToday: mine.filter((t) => t.dueAt && t.status !== "done" && t.status !== "cancelled" && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday).length,
    overdue: mine.filter((t) => t.overdue).length,
    completedThisWeek: mine.filter((t) => t.status === "done" && t.dueAt && new Date(t.dueAt) >= weekAgo).length,
    supplierPending: mine.filter((t) => t.supplierId && t.status !== "done" && t.status !== "cancelled").length,
  };

  // My Focus donut: To Do | In Progress | Review | Done
  const focus = {
    todo: mine.filter((t) => t.status === "todo" || t.status === "backlog").length,
    inProgress: mine.filter((t) => t.status === "in_progress").length,
    review: mine.filter((t) => t.status === "review").length,
    done: mine.filter((t) => t.status === "done").length,
  };

  const deadlines = {
    today: mine.filter((t) => t.dueAt && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday).length,
    tomorrow: mine.filter((t) => {
      if (!t.dueAt) return false;
      const d = new Date(t.dueAt);
      return d >= endOfToday && d < new Date(endOfToday.getTime() + 86400000);
    }).length,
    thisWeek: mine.filter((t) => t.dueAt && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < new Date(startOfToday.getTime() + 7 * 86400000)).length,
    nextWeek: mine.filter((t) => {
      if (!t.dueAt) return false;
      const d = new Date(t.dueAt);
      return d >= new Date(startOfToday.getTime() + 7 * 86400000) && d < new Date(startOfToday.getTime() + 14 * 86400000);
    }).length,
  };

  const workloadByEvent = Array.from(
    mine.reduce((map, t) => {
      const key = t.eventName ?? "Other";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  // Simple 5-point completion trend from checklist-agnostic done tasks.
  const trend = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    for (const t of mine) {
      if (t.status !== "done" || !t.dueAt) continue;
      const days = Math.floor((now.getTime() - new Date(t.dueAt).getTime()) / (7 * 86400000));
      if (days >= 0 && days < 5) buckets[4 - days] += 1;
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is a per-render snapshot, intentionally excluded
  }, [mine]);

  return (
    <div className="space-y-6">
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
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search my tasks..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TaskStatus | "all"); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Status: All</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TaskPriority | "all"); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Priority: All</option>
              {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>
            <select value={eventFilter} onChange={(e) => { setEventFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Event: All</option>
              {eventOptions.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            {hasActiveFilters && (
              <button onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); setEventFilter("all"); setPage(1); }} className="text-sm font-medium text-brand-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState icon={CheckSquare} title="No tasks match" description="Try a different filter." compact />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Task</th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Event</th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-surface-700">Assignee</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((task) => (
                      <tr key={task.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></td>
                        <td className="px-4 py-3">
                          <Link href={`/event-manager/tasks/${task.id}`} className="font-medium text-surface-900 hover:text-brand-600">{task.title}</Link>
                          {task.description && <p className="text-xs text-surface-400 mt-0.5 truncate max-w-xs">{task.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {task.eventId ? (
                            <Link href={`/event-manager/events/${task.eventId}`} className="text-brand-600 hover:underline">{task.eventName}</Link>
                          ) : <span className="text-surface-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className={cn(task.overdue ? "text-danger-600 font-medium" : "text-surface-700")}>{relativeDueLabel(task.dueAt)}</div>
                          <div className="text-xs text-surface-400">{formatDate(task.dueAt)}</div>
                        </td>
                        <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                        <td className="px-4 py-3"><StatusBadge status={statusToBadge(task.status)} /></td>
                        <td className="px-4 py-3">
                          {task.assignees[0] ? <AssigneeAvatar name={task.assignees[0].name} /> : <span className="text-surface-400 text-xs">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3"><MoreHorizontal className="w-4 h-4 text-surface-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
                <span className="text-xs text-surface-500">Showing {paged.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} tasks</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded-lg text-xs font-medium", p === page ? "bg-brand-600 text-white" : "text-surface-600 hover:bg-surface-100")}>{p}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-80 shrink-0 space-y-4 hidden xl:block">
          <InsightCard title="My Focus">
            <Donut
              centerLabel="My Tasks"
              centerValue={mine.length}
              segments={[
                { label: "To Do", value: focus.todo, color: "#a855f7" },
                { label: "In Progress", value: focus.inProgress, color: "#4f46e5" },
                { label: "Review", value: focus.review, color: "#f59e0b" },
                { label: "Done", value: focus.done, color: "#22c55e" },
              ]}
            />
          </InsightCard>
          <InsightCard title="Upcoming Deadlines">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-surface-600">Today</span><span className="font-semibold">{deadlines.today}</span></li>
              <li className="flex justify-between"><span className="text-surface-600">Tomorrow</span><span className="font-semibold">{deadlines.tomorrow}</span></li>
              <li className="flex justify-between"><span className="text-surface-600">This Week</span><span className="font-semibold">{deadlines.thisWeek}</span></li>
              <li className="flex justify-between"><span className="text-surface-600">Next Week</span><span className="font-semibold">{deadlines.nextWeek}</span></li>
            </ul>
          </InsightCard>
          <InsightCard title="Workload by Event">
            <BarList items={workloadByEvent} />
          </InsightCard>
          <InsightCard title="Completion Trend">
            <Sparkline points={trend} />
          </InsightCard>
        </div>
      </div>
    </div>
  );
}
