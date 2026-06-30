"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft, CheckCircle2, RotateCcw, MessageSquare,
  Calendar, Link2, Send, Clock, User, AlertCircle, Plus,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import {
  PRIORITY_META, STATUS_LABEL, statusToBadge, formatDate, formatDateTime, initials,
} from "../task-utils";
import { completeTask, reopenTask, addTaskComment } from "../actions";

export interface TaskAssignee {
  userId: string;
  name: string;
}

export interface TaskComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  createdByName: string;
  eventId: string | null;
  eventName: string | null;
  supplierId: string | null;
  supplierName: string | null;
}

export function TaskDetailClient({
  task, assignees, comments,
}: {
  task: TaskDetail;
  assignees: TaskAssignee[];
  comments: TaskComment[];
}) {
  const [activeTab, setActiveTab] = useState("details");
  const [pending, startTransition] = useTransition();

  const TABS = [
    { id: "details", label: "Details" },
    { id: "comments", label: "Comments", count: comments.length },
    { id: "activity", label: "Activity" },
  ];

  const pMeta = PRIORITY_META[task.priority];
  const isDone = task.status === "done";
  const overdue =
    !!task.dueAt && !isDone && task.status !== "cancelled" && new Date(task.dueAt).getTime() < Date.now();
  const primaryAssignee = assignees[0];

  function toggleComplete() {
    startTransition(async () => {
      if (isDone) await reopenTask(task.id);
      else await completeTask(task.id);
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      {/* Header bar */}
      <div className="bg-white border-b border-surface-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <Link
              href="/event-manager/tasks"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All Tasks
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleComplete}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50",
                  isDone ? "bg-surface-500 hover:bg-surface-600" : "bg-success-600 hover:bg-success-700"
                )}
              >
                {isDone ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
                    Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                    Mark Complete
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 min-w-0 mb-3">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
              {primaryAssignee ? initials(primaryAssignee.name) : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={cn("text-xl font-bold text-surface-900 leading-tight", isDone && "line-through text-surface-400")}>
                {task.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium", pMeta.classes)}>
                  {pMeta.label} Priority
                </span>
                <StatusBadge status={statusToBadge(task.status)} />
                <span className={cn("text-xs", overdue ? "text-danger-600 font-medium" : "text-surface-400")}>
                  Due {formatDate(task.dueAt)}{overdue ? " — Overdue" : ""}
                </span>
                <span className="text-xs text-surface-400 hidden sm:inline">
                  · Created {formatDate(task.createdAt)} by {task.createdByName}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6">
          <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full" key={activeTab}>
        {activeTab === "details" && (
          <DetailsTab task={task} assignees={assignees} overdue={overdue} />
        )}
        {activeTab === "comments" && <CommentsTab taskId={task.id} comments={comments} />}
        {activeTab === "activity" && <ActivityTab task={task} />}
      </div>
    </div>
  );
}

// ── Details ────────────────────────────────────────────────────────────────

function DetailsTab({
  task, assignees, overdue,
}: {
  task: TaskDetail;
  assignees: TaskAssignee[];
  overdue: boolean;
}) {
  const pMeta = PRIORITY_META[task.priority];
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-800">Description</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
            {task.description || <span className="text-surface-400 italic">No description added.</span>}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-800">Task Information</h3>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <MetaRow label="Due Date">
            {task.dueAt ? (
              <div className={cn("flex items-center gap-1.5 text-sm", overdue ? "text-danger-600 font-medium" : "text-surface-800")}>
                {overdue && <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />}
                {formatDate(task.dueAt)}{overdue ? " — Overdue" : ""}
              </div>
            ) : (
              <span className="text-sm text-surface-400">No due date</span>
            )}
          </MetaRow>

          <MetaRow label="Status">
            <StatusBadge status={statusToBadge(task.status)} />
            <span className="ml-2 text-xs text-surface-400">{STATUS_LABEL[task.status]}</span>
          </MetaRow>

          <MetaRow label="Assignees">
            {assignees.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {assignees.map((a) => (
                  <div key={a.userId} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center">
                      {initials(a.name)}
                    </div>
                    <span className="text-sm text-surface-800">{a.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-surface-400">Unassigned</span>
            )}
          </MetaRow>

          <MetaRow label="Priority">
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", pMeta.classes)}>
              {pMeta.label}
            </span>
          </MetaRow>

          {task.eventId && (
            <MetaRow label="Linked Event">
              <Link
                href={`/event-manager/events/${task.eventId}`}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
              >
                <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
                {task.eventName ?? "View event"}
              </Link>
            </MetaRow>
          )}

          {task.supplierId && (
            <MetaRow label="Linked Supplier">
              <Link
                href={`/event-manager/suppliers/${task.supplierId}`}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
              >
                <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
                {task.supplierName ?? "View supplier"}
              </Link>
            </MetaRow>
          )}

          <MetaRow label="Created By">
            <span className="text-sm text-surface-800">{task.createdByName}</span>
          </MetaRow>

          <MetaRow label="Created At">
            <div className="flex items-center gap-1.5 text-sm text-surface-800">
              <Calendar className="w-3.5 h-3.5 text-surface-400" strokeWidth={1.8} />
              {formatDate(task.createdAt)}
            </div>
          </MetaRow>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}

// ── Comments ───────────────────────────────────────────────────────────────

function CommentsTab({ taskId, comments }: { taskId: string; comments: TaskComment[] }) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function post() {
    const text = draft.trim();
    if (!text) return;
    const fd = new FormData();
    fd.set("body_md", text);
    startTransition(async () => {
      await addTaskComment(taskId, fd);
      setDraft("");
    });
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description="Start the conversation below." compact />
      ) : (
        <div className="divide-y divide-surface-100">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                {initials(c.author)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-surface-900">{c.author}</span>
                  <span className="text-xs text-surface-400">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-surface-200 bg-surface-50/50">
        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
              }}
              rows={3}
              placeholder="Write a comment…"
              className="w-full px-3 py-2.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-surface-400 resize-none transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-surface-400">Ctrl/⌘ + Enter to submit</span>
              <button
                onClick={post}
                disabled={!draft.trim() || pending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={2} />
                Post Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

function ActivityTab({ task }: { task: TaskDetail }) {
  const items: { id: string; icon: typeof Plus; color: string; text: string; time: string }[] = [
    {
      id: "created",
      icon: Plus,
      color: "text-brand-600 bg-brand-50",
      text: `Task created by ${task.createdByName}`,
      time: formatDateTime(task.createdAt),
    },
  ];
  if (task.completedAt) {
    items.push({
      id: "completed",
      icon: CheckCircle2,
      color: "text-success-600 bg-success-50",
      text: "Task marked complete",
      time: formatDateTime(task.completedAt),
    });
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card px-5 py-5">
      <h3 className="text-sm font-semibold text-surface-800 mb-5 flex items-center gap-2">
        <Clock className="w-4 h-4 text-surface-400" /> Activity Log
      </h3>
      <ol className="relative space-y-5">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", item.color)}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                </div>
                {i < items.length - 1 && <div className="w-px flex-1 bg-surface-200 mt-1.5 min-h-[20px]" />}
              </div>
              <div className="pt-1.5">
                <p className="text-sm text-surface-800">{item.text}</p>
                <p className="text-xs text-surface-400 mt-0.5">{item.time}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
