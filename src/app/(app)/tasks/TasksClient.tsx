"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare, Plus, LayoutList, LayoutGrid, FileText,
  MoreHorizontal, Clock, AlertCircle, CheckCircle2, Truck,
  GripVertical, Calendar, Search, Edit2,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import {
  PRIORITY_META, STATUS_OPTIONS, STATUS_LABEL, statusToBadge, statusToColumn,
  formatDate, initials, type BoardColumnId,
} from "./task-utils";

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  eventId: string | null;
  eventName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  assignees: { userId: string; name: string }[];
  isMine: boolean;
  overdue: boolean;
}

export interface TaskMetrics {
  dueToday: number;
  overdue: number;
  completedThisWeek: number;
  supplierPending: number;
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_META[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", cfg.classes)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotColor)} />
      {cfg.label}
    </span>
  );
}

function AssigneeAvatar({ name }: { name: string }) {
  return (
    <div
      title={name}
      className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0"
    >
      {initials(name)}
    </div>
  );
}

export function TasksClient({ rows, metrics }: { rows: TaskRow[]; metrics: TaskMetrics }) {
  const [activeTab, setActiveTab] = useState("all");
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const counts = useMemo(() => ({
    my: rows.filter((r) => r.isMine).length,
    all: rows.length,
    event: rows.filter((r) => r.eventId).length,
    supplier: rows.filter((r) => r.supplierId).length,
    overdue: rows.filter((r) => r.overdue).length,
  }), [rows]);

  const TABS = [
    { id: "my", label: "My Tasks", count: counts.my },
    { id: "all", label: "All Tasks", count: counts.all },
    { id: "event", label: "Event Tasks", count: counts.event },
    { id: "supplier", label: "Supplier Tasks", count: counts.supplier, badge: "warning" as const },
    { id: "overdue", label: "Overdue", count: counts.overdue, badge: "danger" as const },
    { id: "calendar", label: "Calendar" },
    { id: "templates", label: "Templates" },
  ];

  function handleTabChange(id: string) {
    if (id === "calendar") { window.location.href = "/tasks/calendar"; return; }
    if (id === "templates") { window.location.href = "/tasks/templates"; return; }
    setActiveTab(id);
  }

  const tasks = useMemo(() => {
    let list = rows;
    switch (activeTab) {
      case "my": list = list.filter((t) => t.isMine); break;
      case "event": list = list.filter((t) => t.eventId); break;
      case "supplier": list = list.filter((t) => t.supplierId); break;
      case "overdue": list = list.filter((t) => t.overdue); break;
      default: break;
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.eventName ?? "").toLowerCase().includes(q) ||
          (t.supplierName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, activeTab, statusFilter, priorityFilter, search]);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Tasks"
        description="Track and manage all event tasks, supplier actions, and team assignments."
        actions={
          <>
            <Link
              href="/tasks/templates"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Templates
            </Link>
            <div className="flex rounded-lg border border-surface-200 bg-white overflow-hidden">
              <button
                onClick={() => setView("list")}
                className={cn("p-2 transition-colors", view === "list" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:text-surface-700")}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("board")}
                className={cn("p-2 transition-colors", view === "board" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:text-surface-700")}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <Link
              href="/tasks/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Task
            </Link>
          </>
        }
        tabs={<TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Strip */}
        <KPIGrid>
          <MetricCard label="Due Today" value={metrics.dueToday} icon={Clock} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="Overdue" value={metrics.overdue} icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Completed This Week" value={metrics.completedThisWeek} icon={CheckCircle2} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Supplier Tasks Pending" value={metrics.supplierPending} icon={Truck} iconBg="bg-info-50" iconColor="text-info-600" />
        </KPIGrid>

        {/* Filter toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
            className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")}
            className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All priorities</option>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_META[p].label}</option>
            ))}
          </select>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={CheckSquare}
              title="No tasks found"
              description="Try a different filter or create a new task to get started."
              action={
                <Link
                  href="/tasks/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </Link>
              }
              compact
            />
          </div>
        ) : view === "list" ? (
          <ListViewTable tasks={tasks} openMenu={openMenu} setOpenMenu={setOpenMenu} />
        ) : (
          <BoardView tasks={tasks} />
        )}
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListViewTable({
  tasks, openMenu, setOpenMenu,
}: {
  tasks: TaskRow[];
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Task Title</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Linked To</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Assignee</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {tasks.map((task) => (
              <ListRow
                key={task.id}
                task={task}
                menuOpen={openMenu === task.id}
                onMenuToggle={() => setOpenMenu(openMenu === task.id ? null : task.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListRow({
  task, menuOpen, onMenuToggle,
}: {
  task: TaskRow;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const isDone = task.status === "done";
  const primaryAssignee = task.assignees[0];

  return (
    <tr className="group hover:bg-surface-50 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/tasks/${task.id}`}
          className={cn(
            "font-medium text-surface-900 hover:text-brand-600 transition-colors",
            isDone && "line-through text-surface-400"
          )}
        >
          {task.title}
        </Link>
      </td>
      <td className="px-4 py-3 text-surface-600">
        {task.eventName ?? task.supplierName ?? <span className="text-surface-400">—</span>}
      </td>
      <td className="px-4 py-3">
        {primaryAssignee ? (
          <div className="flex items-center gap-2">
            <AssigneeAvatar name={primaryAssignee.name} />
            <span className="text-surface-700">{primaryAssignee.name}</span>
            {task.assignees.length > 1 && (
              <span className="text-xs text-surface-400">+{task.assignees.length - 1}</span>
            )}
          </div>
        ) : (
          <span className="text-surface-400">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-surface-700", task.overdue && "text-danger-600 font-medium")}>
          {formatDate(task.dueAt)}
        </span>
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={statusToBadge(task.status)} />
      </td>
      <td className="px-4 py-3 relative">
        <button
          onClick={onMenuToggle}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-all"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-10 z-10 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
            <Link href={`/tasks/${task.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <Edit2 className="w-3.5 h-3.5" /> View / Edit
            </Link>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Board view ────────────────────────────────────────────────────────────────

const BOARD_COLS: { id: BoardColumnId; label: string; color: string; badgeClass: string }[] = [
  { id: "todo", label: "To Do", color: "border-surface-300", badgeClass: "bg-surface-200 text-surface-600" },
  { id: "inprogress", label: "In Progress", color: "border-brand-400", badgeClass: "bg-brand-100 text-brand-700" },
  { id: "done", label: "Done", color: "border-success-400", badgeClass: "bg-success-100 text-success-700" },
];

function BoardView({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {BOARD_COLS.map((col) => {
        const colTasks = tasks.filter((t) => statusToColumn(t.status) === col.id);
        return (
          <div key={col.id} className={cn("flex flex-col bg-surface-100/60 rounded-xl border-t-4 overflow-hidden", col.color)}>
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
              <span className="font-semibold text-surface-800 text-sm">{col.label}</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.badgeClass)}>
                {colTasks.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[500px]">
              {colTasks.map((task) => (
                <BoardCard key={task.id} task={task} />
              ))}
            </div>
            <div className="p-3 border-t border-surface-200 bg-white">
              <Link
                href="/tasks/new"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dashed border-surface-300 text-surface-500 hover:border-brand-400 hover:text-brand-600 text-sm font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ task }: { task: TaskRow }) {
  const primaryAssignee = task.assignees[0];
  return (
    <Link href={`/tasks/${task.id}`} className="block group">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3.5 hover:shadow-md hover:border-brand-200 transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <GripVertical className="w-3.5 h-3.5 text-surface-400 cursor-grab" />
          </div>
          <p className="flex-1 text-sm font-medium text-surface-900 line-clamp-2 leading-snug">{task.title}</p>
        </div>
        <p className="text-xs text-surface-500 mb-3">
          {task.eventName ?? task.supplierName ?? STATUS_LABEL[task.status]}
        </p>
        <div className="flex items-center justify-between gap-2">
          <PriorityBadge priority={task.priority} />
          <div className="flex items-center gap-1.5 text-xs text-surface-500">
            <Calendar className="w-3 h-3" />
            {task.dueAt ? formatDate(task.dueAt) : "No date"}
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          {primaryAssignee ? <AssigneeAvatar name={primaryAssignee.name} /> : <span className="text-xs text-surface-400">Unassigned</span>}
          {task.overdue && (
            <span className="text-xs text-danger-600 font-medium flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> Overdue
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
