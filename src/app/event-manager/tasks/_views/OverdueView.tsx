"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Clock, TrendingUp, Search, Plus } from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { PRIORITY_META, formatDate, daysOverdue, statusToOverdueColumn, type OverdueBoardColumnId } from "../task-utils";
import { PriorityBadge, AssigneeAvatar, InsightCard, BarList } from "../_shared";
import { updateTaskStatus } from "../actions";
import type { TaskRow } from "../TasksWorkspaceClient";

const COLUMNS: { id: OverdueBoardColumnId; label: string; toStatus: TaskStatus }[] = [
  { id: "todo", label: "To Do", toStatus: "todo" },
  { id: "inprogress", label: "In Progress", toStatus: "in_progress" },
  { id: "awaiting", label: "Awaiting Resolution", toStatus: "review" },
];

export function OverdueView({ rows }: { rows: TaskRow[] }) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [localRows, setLocalRows] = useState(rows);
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const overdue = useMemo(() => localRows.filter((r) => r.overdue), [localRows]);

  const filtered = useMemo(() => {
    let list = overdue;
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    return list;
  }, [overdue, priorityFilter, search]);

  function moveTask(taskId: string, columnId: OverdueBoardColumnId) {
    const target = COLUMNS.find((c) => c.id === columnId)!;
    const prev = localRows;
    setLocalRows((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: target.toStatus } : t)));
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, target.toStatus);
      } catch {
        setLocalRows(prev);
      }
    });
  }

  const critical = overdue.filter((t) => t.priority === "p1" || t.priority === "p2");
  const over7 = overdue.filter((t) => daysOverdue(t.dueAt) > 7);
  const avgDays = overdue.length > 0 ? overdue.reduce((s, t) => s + daysOverdue(t.dueAt), 0) / overdue.length : 0;
  const now = new Date();
  const atRisk = localRows.filter((t) => {
    if (!t.dueAt || t.overdue || t.status === "done" || t.status === "cancelled") return false;
    const hours = (new Date(t.dueAt).getTime() - now.getTime()) / 3600000;
    return hours >= 0 && hours <= 48;
  }).length;

  const byEvent = Array.from(overdue.reduce((m, t) => {
    const key = t.eventName ?? "Unlinked";
    m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map<string, number>())).map(([label, value]) => ({ label, value, danger: true }));

  const byOwner = Array.from(overdue.reduce((m, t) => {
    const key = t.assignees[0]?.name ?? "Unassigned";
    m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map<string, number>())).map(([label, value]) => ({ label, value }));

  const resolvedTasks = localRows.filter((t) => t.status === "done");
  const resolvedOnTime = resolvedTasks.filter((t) => !t.overdue).length;
  const resolvedTotal = Math.max(1, resolvedTasks.length);
  const resolutionPct = Math.round((resolvedOnTime / resolvedTotal) * 100);

  const criticalUrgent = overdue.filter((t) => t.priority === "p1" && daysOverdue(t.dueAt) > 7).length;
  const criticalHigh = overdue.filter((t) => t.priority === "p2" && daysOverdue(t.dueAt) > 3).length;

  const columnCounts = {
    todo: overdue.filter((t) => statusToOverdueColumn(t.status) === "todo").length,
    inprogress: overdue.filter((t) => statusToOverdueColumn(t.status) === "inprogress").length,
    awaiting: overdue.filter((t) => statusToOverdueColumn(t.status) === "awaiting").length,
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <KPIGrid>
          <MetricCard label="Overdue Tasks" value={overdue.length} icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Critical & High Priority" value={critical.length} icon={AlertTriangle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard
            label="Overdue > 7 Days"
            value={over7.length}
            delta={overdue.length > 0 ? { value: `${Math.round((over7.length / overdue.length) * 100)}% of overdue`, positive: false } : undefined}
            icon={Clock}
            iconBg="bg-danger-50"
            iconColor="text-danger-600"
            className="border-danger-300"
          />
          <MetricCard label="Avg Overdue Time" value={`${avgDays.toFixed(1)}d`} icon={TrendingUp} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="At Risk / Due Soon" value={atRisk} icon={Clock} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search overdue tasks..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
          </div>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Priority: All</option>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={AlertCircle} title="Nothing overdue" description="Great work — every task is on schedule." compact />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = filtered.filter((t) => statusToOverdueColumn(t.status) === col.id);
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragId && moveTask(dragId, col.id)}
                  className="flex flex-col bg-danger-50/30 rounded-xl border-t-4 border-danger-400 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
                    <span className="font-semibold text-surface-800 text-sm">{col.label}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger-100 text-danger-700">{columnCounts[col.id]}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[600px]">
                    {colTasks.map((task) => (
                      <OverdueCard key={task.id} task={task} onDragStart={() => setDragId(task.id)} onDragEnd={() => setDragId(null)} onMove={(c) => moveTask(task.id, c)} />
                    ))}
                  </div>
                  <div className="p-3 border-t border-surface-200 bg-white">
                    <Link href="/event-manager/tasks/new" className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dashed border-surface-300 text-surface-500 hover:border-brand-400 hover:text-brand-600 text-sm font-medium transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden xl:block">
        <InsightCard title="Overdue by Event"><BarList items={byEvent} /></InsightCard>
        <InsightCard title="Overdue by Owner"><BarList items={byOwner} colorClass="bg-surface-400" /></InsightCard>
        <InsightCard title="Resolution Rate">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 100 100" className="w-20 h-20 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#fecaca" strokeWidth="12" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="12"
                  strokeDasharray={`${(resolutionPct / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-surface-900">{resolutionPct}%</div>
            </div>
            <div className="text-xs space-y-1">
              <p className="text-surface-600">Resolved on time: <span className="font-semibold text-success-600">{resolutionPct}%</span></p>
              <p className="text-surface-600">Resolved late: <span className="font-semibold text-danger-600">{100 - resolutionPct}%</span></p>
              <p className="text-surface-400 mt-2">Based on completed tasks</p>
            </div>
          </div>
        </InsightCard>
        <InsightCard title="Critical Tasks">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between px-3 py-2 rounded-lg bg-danger-50">
              <span className="text-danger-700">Urgent & overdue &gt; 7 days</span>
              <span className="font-bold text-danger-700">{criticalUrgent}</span>
            </li>
            <li className="flex items-center justify-between px-3 py-2 rounded-lg bg-warning-50">
              <span className="text-warning-700">High priority & overdue &gt; 3 days</span>
              <span className="font-bold text-warning-700">{criticalHigh}</span>
            </li>
          </ul>
        </InsightCard>
      </div>
    </div>
  );
}

function OverdueCard({
  task, onDragStart, onDragEnd, onMove,
}: { task: TaskRow; onDragStart: () => void; onDragEnd: () => void; onMove: (c: OverdueBoardColumnId) => void }) {
  const primary = task.assignees[0];
  const days = daysOverdue(task.dueAt);
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="bg-white rounded-xl border border-danger-200 shadow-card p-3.5 hover:shadow-md transition-all cursor-grab active:cursor-grabbing">
      <Link href={`/event-manager/tasks/${task.id}`} className="text-sm font-medium text-surface-900 line-clamp-2 leading-snug hover:text-brand-600">{task.title}</Link>
      <p className="text-xs text-surface-500 mt-1 mb-2">{task.eventName ?? task.supplierName ?? "—"}</p>
      <div className="flex items-center gap-1.5 text-xs text-danger-600 font-medium mb-2">
        <AlertCircle className="w-3 h-3" /> Due {formatDate(task.dueAt)} ({days}d ago)
      </div>
      <div className="flex items-center justify-between">
        <PriorityBadge priority={task.priority} />
        {primary ? <AssigneeAvatar name={primary.name} size="xs" /> : <span className="text-xs text-surface-400">Unassigned</span>}
      </div>
      <div className="mt-2 flex gap-1">
        {(["todo", "inprogress", "awaiting"] as OverdueBoardColumnId[]).map((c) => (
          <button key={c} onClick={() => onMove(c)} className={cn("text-[10px] px-1.5 py-0.5 rounded border border-surface-200 text-surface-400 hover:text-brand-600 hover:border-brand-300")}>
            {c === "todo" ? "To Do" : c === "inprogress" ? "In Progress" : "Resolve"}
          </button>
        ))}
      </div>
    </div>
  );
}
