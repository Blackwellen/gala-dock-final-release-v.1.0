"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, AlertCircle, CheckCircle2, Truck, Search, Plus, Calendar, GripVertical } from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { STATUS_OPTIONS, PRIORITY_META, formatDate, statusToAllBoardColumn, type AllBoardColumnId } from "../task-utils";
import { PriorityBadge, AssigneeAvatar, InsightCard, Donut, BarList } from "../_shared";
import { updateTaskStatus } from "../actions";
import type { TaskRow } from "../TasksWorkspaceClient";

const COLUMNS: { id: AllBoardColumnId; label: string; toStatus: TaskStatus; accent: string; badgeClass: string }[] = [
  { id: "todo", label: "To Do", toStatus: "todo", accent: "border-surface-300", badgeClass: "bg-surface-200 text-surface-600" },
  { id: "inprogress", label: "In Progress", toStatus: "in_progress", accent: "border-brand-400", badgeClass: "bg-brand-100 text-brand-700" },
  { id: "review", label: "Review", toStatus: "review", accent: "border-warning-400", badgeClass: "bg-warning-100 text-warning-700" },
  { id: "done", label: "Done", toStatus: "done", accent: "border-success-400", badgeClass: "bg-success-100 text-success-700" },
];

export function AllTasksView({
  rows, view,
}: { rows: TaskRow[]; view: "list" | "kanban" }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [localRows, setLocalRows] = useState(rows);
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = localRows;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.eventName ?? "").toLowerCase().includes(q));
    return list;
  }, [localRows, statusFilter, priorityFilter, search]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const metrics = {
    dueToday: localRows.filter((t) => t.dueAt && t.status !== "done" && t.status !== "cancelled" && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday).length,
    overdue: localRows.filter((t) => t.overdue).length,
    completedThisWeek: localRows.filter((t) => t.status === "done" && t.dueAt && new Date(t.dueAt) >= weekAgo).length,
    supplierPending: localRows.filter((t) => t.supplierId && t.status !== "done" && t.status !== "cancelled").length,
  };

  function moveTask(taskId: string, columnId: AllBoardColumnId) {
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

  const priorityBreakdown = {
    urgent: localRows.filter((t) => t.priority === "p1").length,
    high: localRows.filter((t) => t.priority === "p2").length,
    medium: localRows.filter((t) => t.priority === "p3").length,
    low: localRows.filter((t) => t.priority === "p4").length,
  };
  const byEvent = Array.from(
    localRows.reduce((m, t) => {
      if (!t.eventName) return m;
      m.set(t.eventName, (m.get(t.eventName) ?? 0) + 1);
      return m;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const overdueByEvent = Array.from(
    localRows.filter((t) => t.overdue).reduce((m, t) => {
      const key = t.eventName ?? "Unlinked";
      m.set(key, (m.get(key) ?? 0) + 1);
      return m;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value, danger: true }));

  const columnCounts = {
    todo: localRows.filter((t) => statusToAllBoardColumn(t.status) === "todo").length,
    inprogress: localRows.filter((t) => statusToAllBoardColumn(t.status) === "inprogress").length,
    review: localRows.filter((t) => statusToAllBoardColumn(t.status) === "review").length,
    done: localRows.filter((t) => statusToAllBoardColumn(t.status) === "done").length,
  };

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
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Status: All</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Priority: All</option>
              {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState icon={CheckSquare} title="No tasks found" description="Try a different filter or create a new task." compact />
            </div>
          ) : view === "list" ? (
            <ListTable tasks={filtered} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {COLUMNS.map((col) => {
                const colTasks = filtered.filter((t) => statusToAllBoardColumn(t.status) === col.id);
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dragId && moveTask(dragId, col.id)}
                    className={cn("flex flex-col bg-surface-100/60 rounded-xl border-t-4 overflow-hidden", col.accent)}
                  >
                    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
                      <span className="font-semibold text-surface-800 text-sm">{col.label}</span>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.badgeClass)}>{columnCounts[col.id]}</span>
                    </div>
                    <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[600px]">
                      {colTasks.map((task) => (
                        <Card key={task.id} task={task} onDragStart={() => setDragId(task.id)} onDragEnd={() => setDragId(null)} onMove={(cid) => moveTask(task.id, cid)} />
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
          <InsightCard title="Total Tasks">
            <Donut
              centerLabel="Total Tasks"
              centerValue={localRows.length}
              segments={[
                { label: "To Do", value: columnCounts.todo, color: "#a855f7" },
                { label: "In Progress", value: columnCounts.inprogress, color: "#4f46e5" },
                { label: "Review", value: columnCounts.review, color: "#f59e0b" },
                { label: "Done", value: columnCounts.done, color: "#22c55e" },
              ]}
            />
          </InsightCard>
          <InsightCard title="Priority Breakdown">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-danger-600">Urgent</span><span className="font-semibold">{priorityBreakdown.urgent}</span></li>
              <li className="flex justify-between"><span className="text-danger-500">High</span><span className="font-semibold">{priorityBreakdown.high}</span></li>
              <li className="flex justify-between"><span className="text-warning-600">Medium</span><span className="font-semibold">{priorityBreakdown.medium}</span></li>
              <li className="flex justify-between"><span className="text-surface-500">Low</span><span className="font-semibold">{priorityBreakdown.low}</span></li>
            </ul>
          </InsightCard>
          <InsightCard title="Tasks by Event">
            <BarList items={byEvent} />
          </InsightCard>
          <InsightCard title="Overdue by Event">
            <BarList items={overdueByEvent} />
          </InsightCard>
        </div>
      </div>
    </div>
  );
}

function Card({
  task, onDragStart, onDragEnd, onMove,
}: { task: TaskRow; onDragStart: () => void; onDragEnd: () => void; onMove: (c: AllBoardColumnId) => void }) {
  const primary = task.assignees[0];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="bg-white rounded-xl border border-surface-200 shadow-card p-3.5 hover:shadow-md hover:border-brand-200 transition-all cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <GripVertical className="w-3.5 h-3.5 text-surface-300 shrink-0 mt-0.5" />
        <Link href={`/event-manager/tasks/${task.id}`} className="flex-1 text-sm font-medium text-surface-900 line-clamp-2 leading-snug hover:text-brand-600">
          {task.title}
        </Link>
      </div>
      <p className="text-xs text-surface-500 mb-3 pl-5">{task.eventName ?? task.supplierName ?? "—"}</p>
      <div className="flex items-center justify-between gap-2 pl-5">
        <PriorityBadge priority={task.priority} />
        <div className="flex items-center gap-1.5 text-xs text-surface-500">
          <Calendar className="w-3 h-3" />
          {task.dueAt ? formatDate(task.dueAt) : "No date"}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between pl-5">
        {primary ? <AssigneeAvatar name={primary.name} size="xs" /> : <span className="text-xs text-surface-400">Unassigned</span>}
        {task.overdue && <span className="text-xs text-danger-600 font-medium flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Overdue</span>}
      </div>
      <div className="mt-2 pl-5 flex gap-1">
        {(["todo", "inprogress", "review", "done"] as AllBoardColumnId[]).map((c) => (
          <button
            key={c}
            onClick={() => onMove(c)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-surface-200 text-surface-400 hover:text-brand-600 hover:border-brand-300"
            aria-label={`Move to ${c}`}
          >
            {c === "todo" ? "To Do" : c === "inprogress" ? "In Progress" : c === "review" ? "Review" : "Done"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListTable({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Task</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Linked To</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Assignee</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {tasks.map((t) => (
              <tr key={t.id} className="hover:bg-surface-50">
                <td className="px-4 py-3"><Link href={`/event-manager/tasks/${t.id}`} className="font-medium text-surface-900 hover:text-brand-600">{t.title}</Link></td>
                <td className="px-4 py-3 text-surface-600">{t.eventName ?? t.supplierName ?? "—"}</td>
                <td className="px-4 py-3">{t.assignees[0]?.name ?? <span className="text-surface-400">Unassigned</span>}</td>
                <td className="px-4 py-3">{formatDate(t.dueAt)}</td>
                <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                <td className="px-4 py-3 text-surface-600">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
