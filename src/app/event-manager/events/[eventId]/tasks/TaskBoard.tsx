"use client";

import { useState, useCallback } from "react";
import { Plus, Clock, Pencil, X, Check, Loader2 } from "lucide-react";
import { updateTaskField } from "./actions";

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-danger-100 text-danger-700 border-danger-200",
  medium: "bg-warning-100 text-warning-700 border-warning-200",
  low:    "bg-blue-100 text-blue-700 border-blue-200",
};

const STATUS_LANES = [
  { id: "not_started", label: "Not Started", emptyMsg: "No tasks here." },
  { id: "in_progress", label: "In Progress", emptyMsg: "Nothing in progress." },
  { id: "waiting",     label: "Waiting",     emptyMsg: "Nothing waiting." },
  { id: "approved",    label: "Approved",    emptyMsg: "Nothing approved yet." },
  { id: "completed",   label: "Done",        emptyMsg: "No completed tasks." },
];

const LANE_HEADER_COLORS: Record<string, string> = {
  not_started: "bg-surface-100 text-surface-600",
  in_progress: "bg-blue-100 text-blue-700",
  waiting:     "bg-amber-100 text-amber-700",
  approved:    "bg-violet-100 text-violet-700",
  completed:   "bg-success-100 text-success-700",
};

interface Task {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  description: string | null;
  assignee_user_id: string | null;
}

interface EditState {
  title: string;
  priority: string;
  due_at: string;
  description: string;
}

function TaskCard({ task, eventId }: { task: Task; eventId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditState>({
    title:       task.title ?? "",
    priority:    task.priority ?? "medium",
    due_at:      task.due_at ? String(task.due_at).slice(0, 16) : "",
    description: task.description ?? "",
  });

  const startEdit = useCallback(() => {
    setDraft({
      title:       task.title ?? "",
      priority:    task.priority ?? "medium",
      due_at:      task.due_at ? String(task.due_at).slice(0, 16) : "",
      description: task.description ?? "",
    });
    setError(null);
    setEditing(true);
  }, [task]);

  const cancel = useCallback(() => { setEditing(false); setError(null); }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const fields: Array<[string, string]> = [
      ["title",       draft.title],
      ["priority",    draft.priority],
      ["due_at",      draft.due_at],
      ["description", draft.description],
    ];
    for (const [field, value] of fields) {
      const result = await updateTaskField(eventId, task.id, field, value);
      if (result?.error) { setError(result.error); setSaving(false); return; }
    }
    setEditing(false);
    setSaving(false);
  }, [draft, eventId, task.id]);

  if (editing) {
    return (
      <div className="rounded-lg border border-brand-400 bg-white p-3 shadow-sm">
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={draft.title}
            placeholder="Task title…"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <select
            className="w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
          >
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={draft.due_at}
            onChange={(e) => setDraft((d) => ({ ...d, due_at: e.target.value }))}
          />
          <textarea
            className="w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={draft.description}
            rows={2}
            placeholder="Description / category…"
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
          {error && <p className="text-[11px] text-danger-600">{error}</p>}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-2.5 py-1 text-[11px] text-surface-600 hover:bg-surface-50 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-xs font-medium text-surface-900 leading-snug flex-1 min-w-0">{task.title ?? "Untitled task"}</p>
        <button
          onClick={startEdit}
          aria-label="Edit task"
          className="opacity-0 group-hover:opacity-100 transition-opacity flex h-5 w-5 items-center justify-center rounded hover:bg-surface-100 text-surface-400 hover:text-brand-600 shrink-0"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.8} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {task.priority && (
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[(task.priority ?? "low").toLowerCase()] ?? PRIORITY_STYLES.low}`}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
        )}
        {task.description && (
          <span className="text-[10px] text-surface-400 truncate max-w-[100px]">{task.description}</span>
        )}
      </div>
      {task.due_at && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-surface-400">
          <Clock className="h-3 w-3" />
          {new Date(task.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </div>
      )}
    </div>
  );
}

interface TaskBoardProps {
  tasks: Task[];
  eventId: string;
}

export function TaskBoard({ tasks, eventId }: TaskBoardProps) {
  const byStatus = new Map<string, Task[]>();
  for (const lane of STATUS_LANES) byStatus.set(lane.id, []);
  for (const t of tasks) {
    const key = t.status ?? "not_started";
    if (!byStatus.has(key)) byStatus.set(key, []);
    byStatus.get(key)!.push(t);
  }

  return (
    <div className="grid grid-cols-5 gap-3 items-start">
      {STATUS_LANES.map((lane) => {
        const laneTasks = byStatus.get(lane.id) ?? [];
        const headerCls = LANE_HEADER_COLORS[lane.id] ?? "bg-surface-100 text-surface-600";
        return (
          <div key={lane.id} className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
            <div className={`px-3 py-2.5 flex items-center justify-between ${headerCls}`}>
              <span className="text-xs font-semibold">{lane.label}</span>
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-surface-700">
                {laneTasks.length}
              </span>
            </div>
            <div className="p-2 space-y-2 min-h-[200px]">
              {laneTasks.length === 0 ? (
                <p className="text-center text-xs text-surface-400 py-4">{lane.emptyMsg}</p>
              ) : laneTasks.map((task) => (
                <TaskCard key={task.id} task={task} eventId={eventId} />
              ))}
              <button className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
