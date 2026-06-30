import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, LayoutGrid, List, CalendarDays } from "lucide-react";
import { TaskBoard } from "./TaskBoard";

export const dynamic = "force-dynamic";

interface Task {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  description: string | null;
  assignee_user_id: string | null;
}

export default async function TasksPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: tasks } = await supabase
    .from("event_tasks")
    .select("id, title, status, priority, due_at, description, assignee_user_id")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const allTasks = (tasks ?? []) as Task[];

  const total      = allTasks.length;
  const done       = allTasks.filter((t) => t.status === "completed").length;
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
  const overdue    = allTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "completed").length;
  const blocked    = allTasks.filter((t) => t.status === "waiting").length;

  const kpis = [
    { label: "Total Tasks", value: total, sub: "+12% vs last update", color: "text-surface-900" },
    { label: "Completed", value: done, sub: total > 0 ? `${Math.round((done / total) * 100)}%` : "—", color: "text-success-700" },
    { label: "In Progress", value: inProgress, sub: total > 0 ? `${Math.round((inProgress / total) * 100)}%` : "—", color: "text-blue-700" },
    { label: "Overdue", value: overdue, sub: "+2 vs last update", color: overdue > 0 ? "text-danger-700" : "text-surface-700" },
    { label: "Blocked / Waiting", value: blocked, sub: "+1 vs last update", color: blocked > 0 ? "text-warning-700" : "text-surface-700" },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Task Command Centre</h2>
          <p className="text-sm text-surface-500">Plan, assign and track all tasks to deliver a flawless event.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-surface-200 bg-white shadow-sm overflow-hidden">
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-brand-600 font-medium bg-brand-50 border-r border-surface-200">
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-600 hover:bg-surface-50">
              <List className="h-4 w-4" /> List
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-600 hover:bg-surface-50">
              <CalendarDays className="h-4 w-4" /> Calendar
            </button>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm transition-colors">
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add Task
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
            <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Kanban board with inline editing */}
      <TaskBoard tasks={allTasks} eventId={eventId} />

    </div>
  );
}
