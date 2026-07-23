// Shared mapping helpers for the Tasks module.
// Maps the live `task_status` / `task_priority` enums to the premium UI labels & badges.

import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";

// ── Priority ─────────────────────────────────────────────────────────────────
// Real enum: p1 | p2 | p3 | p4  (p1 = most urgent)
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  p1: 0,
  p2: 1,
  p3: 2,
  p4: 3,
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; classes: string; dotColor: string }
> = {
  p1: { label: "Urgent", classes: "bg-danger-100 text-danger-700 border border-danger-300", dotColor: "bg-danger-600" },
  p2: { label: "High", classes: "bg-danger-50 text-danger-600 border border-danger-200", dotColor: "bg-danger-500" },
  p3: { label: "Medium", classes: "bg-warning-50 text-warning-600 border border-warning-200", dotColor: "bg-warning-500" },
  p4: { label: "Low", classes: "bg-surface-100 text-surface-500 border border-surface-200", dotColor: "bg-surface-400" },
};

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string; description: string }[] = [
  { value: "p1", label: "Urgent", description: "Requires immediate attention" },
  { value: "p2", label: "High", description: "Complete within 48 hours" },
  { value: "p3", label: "Medium", description: "Complete within the week" },
  { value: "p4", label: "Low", description: "No immediate deadline" },
];

// ── Status ───────────────────────────────────────────────────────────────────
// Real enum: backlog | todo | in_progress | blocked | done | cancelled | review
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
  review: "Review",
};

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = (
  ["backlog", "todo", "in_progress", "review", "blocked", "done", "cancelled"] as TaskStatus[]
).map((value) => ({ value, label: STATUS_LABEL[value] }));

// StatusBadge supported variants: in-progress | pending | completed | cancelled.
// Map: done -> completed, todo/backlog -> pending, in_progress/review -> in-progress,
// blocked -> overdue (closest danger variant), cancelled -> cancelled.
type BadgeStatus = "in-progress" | "pending" | "completed" | "cancelled" | "overdue";

export function statusToBadge(status: TaskStatus): BadgeStatus {
  switch (status) {
    case "done":
      return "completed";
    case "in_progress":
    case "review":
      return "in-progress";
    case "cancelled":
      return "cancelled";
    case "blocked":
      return "overdue";
    case "todo":
    case "backlog":
    default:
      return "pending";
  }
}

// All Tasks Kanban columns (4): To Do | In Progress | Review | Done
export type AllBoardColumnId = "todo" | "inprogress" | "review" | "done";

export function statusToAllBoardColumn(status: TaskStatus): AllBoardColumnId {
  if (status === "done" || status === "cancelled") return "done";
  if (status === "review") return "review";
  if (status === "in_progress") return "inprogress";
  return "todo";
}

// Overdue Kanban columns (3): To Do | In Progress | Awaiting Resolution
export type OverdueBoardColumnId = "todo" | "inprogress" | "awaiting";

export function statusToOverdueColumn(status: TaskStatus): OverdueBoardColumnId {
  if (status === "review" || status === "blocked") return "awaiting";
  if (status === "in_progress") return "inprogress";
  return "todo";
}

// Board columns derived from status (legacy 3-col board, still used by task-utils consumers).
export type BoardColumnId = "todo" | "inprogress" | "done";

export function statusToColumn(status: TaskStatus): BoardColumnId {
  if (status === "done") return "done";
  if (status === "in_progress" || status === "review") return "inprogress";
  return "todo";
}

// ── Category ─────────────────────────────────────────────────────────────────
export const CATEGORY_LABEL: Record<string, string> = {
  production: "Production",
  operations: "Operations",
  marketing: "Marketing",
  logistics: "Logistics",
  talent: "Talent",
  access: "Access",
  planning: "Planning",
  compliance: "Compliance",
  onboarding: "Onboarding",
  procurement: "Procurement",
  finance: "Finance",
  "follow-up": "Follow-up",
  general: "General",
};

export function categoryLabel(category: string | null): string {
  if (!category) return "General";
  return CATEGORY_LABEL[category] ?? category;
}

// ── Days overdue / relative due formatting ────────────────────────────────────
export function daysOverdue(dueAt: string | null): number {
  if (!dueAt) return 0;
  const ms = Date.now() - new Date(dueAt).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function relativeDueLabel(dueAt: string | null): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  return `In ${diffDays}d`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDate(value: string | null): string {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isOverdue(task: { due_at: string | null; status: TaskStatus }): boolean {
  if (!task.due_at) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_at).getTime() < Date.now();
}
