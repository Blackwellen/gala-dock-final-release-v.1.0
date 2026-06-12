"use client";

import { useState } from "react";
import {
  CheckSquare, Plus, Filter, LayoutList, LayoutGrid, FileText,
  MoreHorizontal, Clock, AlertCircle, CheckCircle2, Truck,
  GripVertical, User, Calendar, ChevronDown, Trash2, Edit2,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { cn } from "@/lib/utils";

// ── Seed data ────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
type TaskStatus = "pending" | "overdue" | "completed";
type TaskType = "internal" | "supplier" | "client";

interface Task {
  id: string;
  title: string;
  event: string;
  eventId: string;
  assignee: string;
  assigneeInitials: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  type: TaskType;
  column: "todo" | "inprogress" | "done";
}

const TASKS: Task[] = [
  { id: "t1",  title: "Confirm floral arrangements with supplier",  event: "Harrington Wedding",    eventId: "ev1", assignee: "Sophie Clarke",  assigneeInitials: "SC", dueDate: "2026-06-10", priority: "high",   status: "overdue",   type: "supplier", column: "todo" },
  { id: "t2",  title: "Send venue layout to AV team",              event: "TechConf 2026",         eventId: "ev2", assignee: "Marcus Webb",    assigneeInitials: "MW", dueDate: "2026-06-11", priority: "high",   status: "pending",   type: "internal", column: "inprogress" },
  { id: "t3",  title: "Collect signed contract from client",       event: "Harrington Wedding",    eventId: "ev1", assignee: "Sophie Clarke",  assigneeInitials: "SC", dueDate: "2026-06-08", priority: "high",   status: "overdue",   type: "client",   column: "todo" },
  { id: "t4",  title: "Book shuttle buses for guest transfers",    event: "Ellis Gala Dinner",     eventId: "ev3", assignee: "Tom Reid",       assigneeInitials: "TR", dueDate: "2026-06-12", priority: "medium", status: "pending",   type: "supplier", column: "todo" },
  { id: "t5",  title: "Create run-of-show document",              event: "TechConf 2026",         eventId: "ev2", assignee: "Marcus Webb",    assigneeInitials: "MW", dueDate: "2026-06-10", priority: "medium", status: "overdue",   type: "internal", column: "inprogress" },
  { id: "t6",  title: "Chase catering invoice payment",           event: "Bloom Garden Party",    eventId: "ev4", assignee: "Sophie Clarke",  assigneeInitials: "SC", dueDate: "2026-06-07", priority: "high",   status: "overdue",   type: "supplier", column: "todo" },
  { id: "t7",  title: "Upload photos to client portal",           event: "Harrington Wedding",    eventId: "ev1", assignee: "Tom Reid",       assigneeInitials: "TR", dueDate: "2026-06-05", priority: "low",    status: "completed", type: "client",   column: "done" },
  { id: "t8",  title: "Finalise menu tasting notes",              event: "Ellis Gala Dinner",     eventId: "ev3", assignee: "Sophie Clarke",  assigneeInitials: "SC", dueDate: "2026-06-06", priority: "medium", status: "completed", type: "internal", column: "done" },
  { id: "t9",  title: "Order branded signage and banners",        event: "TechConf 2026",         eventId: "ev2", assignee: "Marcus Webb",    assigneeInitials: "MW", dueDate: "2026-06-13", priority: "medium", status: "pending",   type: "supplier", column: "inprogress" },
  { id: "t10", title: "Prepare post-event survey",                event: "Bloom Garden Party",    eventId: "ev4", assignee: "Tom Reid",       assigneeInitials: "TR", dueDate: "2026-06-14", priority: "low",    status: "pending",   type: "internal", column: "todo" },
  { id: "t11", title: "Confirm dietary requirements with venue",  event: "Ellis Gala Dinner",     eventId: "ev3", assignee: "Sophie Clarke",  assigneeInitials: "SC", dueDate: "2026-06-05", priority: "high",   status: "completed", type: "client",   column: "done" },
  { id: "t12", title: "Send thank-you emails to all suppliers",   event: "Bloom Garden Party",    eventId: "ev4", assignee: "Marcus Webb",    assigneeInitials: "MW", dueDate: "2026-06-09", priority: "low",    status: "overdue",   type: "supplier", column: "todo" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; classes: string; dotColor: string }> = {
  high:   { label: "High",   classes: "bg-danger-50 text-danger-600 border border-danger-200",   dotColor: "bg-danger-500" },
  medium: { label: "Medium", classes: "bg-warning-50 text-warning-600 border border-warning-200", dotColor: "bg-warning-500" },
  low:    { label: "Low",    classes: "bg-surface-100 text-surface-500 border border-surface-200", dotColor: "bg-surface-400" },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", cfg.classes)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotColor)} />
      {cfg.label}
    </span>
  );
}

function AssigneeAvatar({ initials, name }: { initials: string; name: string }) {
  return (
    <div
      title={name}
      className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0"
    >
      {initials}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "my",       label: "My Tasks",          count: 5 },
  { id: "all",      label: "All Tasks",          count: 12 },
  { id: "event",    label: "Event Tasks",        count: 8 },
  { id: "supplier", label: "Supplier Tasks",     count: 5, badge: "warning" as const },
  { id: "overdue",  label: "Overdue",            count: 7, badge: "danger" as const },
  { id: "calendar", label: "Calendar" },
  { id: "templates",label: "Templates" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [activeTab, setActiveTab]     = useState("all");
  const [view, setView]               = useState<"list" | "board">("list");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu]       = useState<string | null>(null);

  function handleTabChange(id: string) {
    if (id === "calendar")  { window.location.href = "/tasks/calendar";  return; }
    if (id === "templates") { window.location.href = "/tasks/templates"; return; }
    setActiveTab(id);
  }

  function filteredTasks(): Task[] {
    switch (activeTab) {
      case "my":       return TASKS.filter(t => t.assignee === "Sophie Clarke");
      case "event":    return TASKS.filter(t => t.type !== "supplier");
      case "supplier": return TASKS.filter(t => t.type === "supplier");
      case "overdue":  return TASKS.filter(t => t.status === "overdue");
      default:         return TASKS;
    }
  }

  const tasks = filteredTasks();

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === tasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tasks.map(t => t.id)));
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Tasks"
        description="Track and manage all event tasks, supplier actions, and team assignments."
        actions={
          <>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              <FileText className="w-4 h-4" />
              Apply Template
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
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
        tabs={
          <TabNav
            tabs={TABS}
            active={activeTab}
            onChange={handleTabChange}
          />
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Strip */}
        <KPIGrid>
          <MetricCard label="Due Today"              value={4}  icon={Clock}         iconBg="bg-warning-50"  iconColor="text-warning-600" />
          <MetricCard label="Overdue"                value={7}  icon={AlertCircle}   iconBg="bg-danger-50"   iconColor="text-danger-600" />
          <MetricCard label="Completed This Week"    value={12} icon={CheckCircle2}  iconBg="bg-success-50"  iconColor="text-success-600" />
          <MetricCard label="Supplier Tasks Pending" value={5}  icon={Truck}         iconBg="bg-info-50"     iconColor="text-info-600" />
        </KPIGrid>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-sm text-brand-700 font-medium">
            <span>{selected.size} task{selected.size > 1 ? "s" : ""} selected</span>
            <div className="flex gap-2 ml-auto">
              <button className="px-3 py-1 rounded-lg bg-white border border-brand-200 text-brand-600 hover:bg-brand-50 text-xs font-medium transition-colors">
                Mark Complete
              </button>
              <button className="px-3 py-1 rounded-lg bg-white border border-danger-200 text-danger-600 hover:bg-danger-50 text-xs font-medium transition-colors">
                Delete
              </button>
              <button onClick={() => setSelected(new Set())} className="px-3 py-1 rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-50 text-xs font-medium transition-colors">
                Clear
              </button>
            </div>
          </div>
        )}

        {view === "list" ? (
          <ListViewTable
            tasks={tasks}
            selected={selected}
            onToggle={toggleSelect}
            onToggleAll={toggleAll}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
          />
        ) : (
          <BoardView tasks={tasks} />
        )}
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListViewTable({
  tasks, selected, onToggle, onToggleAll, openMenu, setOpenMenu,
}: {
  tasks: Task[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === tasks.length && tasks.length > 0}
                  onChange={onToggleAll}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Task Title</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Event</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Assignee</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
              <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {tasks.map(task => (
              <ListRow
                key={task.id}
                task={task}
                isSelected={selected.has(task.id)}
                onToggle={() => onToggle(task.id)}
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
  task, isSelected, onToggle, menuOpen, onMenuToggle,
}: {
  task: Task;
  isSelected: boolean;
  onToggle: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const isOverdue = task.status === "overdue";
  const isDone    = task.status === "completed";

  return (
    <tr className={cn("group hover:bg-surface-50 transition-colors", isSelected && "bg-brand-50/40")}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
        />
      </td>
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
      <td className="px-4 py-3 text-surface-600">{task.event}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <AssigneeAvatar initials={task.assigneeInitials} name={task.assignee} />
          <span className="text-surface-700">{task.assignee}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-surface-700", isOverdue && "text-danger-600 font-medium")}>
          {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={task.status} />
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
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <User className="w-3.5 h-3.5" /> Reassign
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
            </button>
            <hr className="my-1 border-surface-100" />
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Board view ────────────────────────────────────────────────────────────────

const BOARD_COLS: { id: "todo" | "inprogress" | "done"; label: string; color: string; badgeClass: string }[] = [
  { id: "todo",       label: "To Do",       color: "border-surface-300",   badgeClass: "bg-surface-200 text-surface-600" },
  { id: "inprogress", label: "In Progress", color: "border-brand-400",     badgeClass: "bg-brand-100 text-brand-700" },
  { id: "done",       label: "Done",        color: "border-success-400",   badgeClass: "bg-success-100 text-success-700" },
];

function BoardView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {BOARD_COLS.map(col => {
        const colTasks = tasks.filter(t => t.column === col.id);
        return (
          <div key={col.id} className={cn("flex flex-col bg-surface-100/60 rounded-xl border-t-4 overflow-hidden", col.color)}>
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
              <span className="font-semibold text-surface-800 text-sm">{col.label}</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.badgeClass)}>
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[500px]">
              {colTasks.map(task => (
                <BoardCard key={task.id} task={task} />
              ))}
            </div>

            {/* Add task */}
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

function BoardCard({ task }: { task: Task }) {
  return (
    <Link href={`/tasks/${task.id}`} className="block group">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3.5 hover:shadow-md hover:border-brand-200 transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <GripVertical className="w-3.5 h-3.5 text-surface-400 cursor-grab" />
          </div>
          <p className="flex-1 text-sm font-medium text-surface-900 line-clamp-2 leading-snug">{task.title}</p>
        </div>
        <p className="text-xs text-surface-500 mb-3">{task.event}</p>
        <div className="flex items-center justify-between gap-2">
          <PriorityBadge priority={task.priority} />
          <div className="flex items-center gap-1.5 text-xs text-surface-500">
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <AssigneeAvatar initials={task.assigneeInitials} name={task.assignee} />
          {task.status === "overdue" && (
            <span className="text-xs text-danger-600 font-medium flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> Overdue
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
