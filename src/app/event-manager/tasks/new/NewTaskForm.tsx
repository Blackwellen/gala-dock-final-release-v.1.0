"use client";

import { useState, useTransition } from "react";
import { X, CheckSquare } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../task-utils";
import { createTask } from "../actions";

export interface SelectOption {
  value: string;
  label: string;
}

const PRIORITY_STYLE: Record<TaskPriority, { dotClass: string; activeClass: string; ringClass: string }> = {
  p1: { dotClass: "bg-danger-700", activeClass: "border-danger-600 bg-danger-100 text-danger-800", ringClass: "ring-danger-600" },
  p2: { dotClass: "bg-danger-500", activeClass: "border-danger-400 bg-danger-50 text-danger-700", ringClass: "ring-danger-400" },
  p3: { dotClass: "bg-warning-500", activeClass: "border-warning-400 bg-warning-50 text-warning-700", ringClass: "ring-warning-400" },
  p4: { dotClass: "bg-surface-400", activeClass: "border-surface-400 bg-surface-50 text-surface-700", ringClass: "ring-surface-300" },
};

export function NewTaskForm({
  events, suppliers, assignees,
}: {
  events: SelectOption[];
  suppliers: SelectOption[];
  assignees: SelectOption[];
}) {
  const [priority, setPriority] = useState<TaskPriority>("p3");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isValid = title.trim().length > 0;

  function handleSubmit(formData: FormData) {
    if (!isValid) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTask(formData);
      } catch (e) {
        // redirect() throws internally; surface only genuine errors.
        const msg = e instanceof Error ? e.message : "Failed to create task";
        if (!msg.includes("NEXT_REDIRECT")) setError(msg);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col min-h-full bg-surface-50">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/event-manager/tasks"
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <CheckSquare className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-lg font-bold text-surface-900 leading-none">New Task</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/event-manager/tasks"
            className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!isValid || pending}
            className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm transition-colors"
          >
            {pending ? "Creating…" : "Create Task"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-sm text-danger-700">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">
              Task Title <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Confirm catering arrangements with Noble Kitchen Co."
              className="w-full px-4 py-3 rounded-xl border border-surface-300 text-base text-surface-900 font-medium placeholder:text-surface-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Description</label>
            <textarea
              name="description"
              rows={4}
              placeholder="Provide additional context, instructions, or notes for this task…"
              className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          {/* Links + scheduling */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Links &amp; Scheduling</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Linked Event</label>
                <select
                  name="event_id"
                  defaultValue=""
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">No linked event</option>
                  {events.map((ev) => (
                    <option key={ev.value} value={ev.value}>{ev.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Linked Supplier</label>
                <select
                  name="supplier_id"
                  defaultValue=""
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">No linked supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Assignee</label>
                <select
                  name="assignee_id"
                  defaultValue=""
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Due Date</label>
                <input
                  type="date"
                  name="due_date"
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Category</label>
                <select
                  name="category"
                  defaultValue=""
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">General</option>
                  <option value="production">Production</option>
                  <option value="operations">Operations</option>
                  <option value="marketing">Marketing</option>
                  <option value="logistics">Logistics</option>
                  <option value="talent">Talent</option>
                  <option value="access">Access</option>
                  <option value="planning">Planning</option>
                  <option value="compliance">Compliance</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="procurement">Procurement</option>
                  <option value="finance">Finance</option>
                  <option value="follow-up">Follow-up</option>
                </select>
              </div>
            </div>
          </div>

          {/* Priority */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Priority</h3>
            <input type="hidden" name="priority" value={priority} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRIORITY_OPTIONS.map((p) => {
                const style = PRIORITY_STYLE[p.value];
                const active = priority === p.value;
                return (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      "flex flex-col gap-1.5 px-4 py-3.5 rounded-xl border-2 text-left transition-all",
                      active
                        ? cn(style.activeClass, "ring-2 ring-offset-1", style.ringClass)
                        : "border-surface-200 text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", style.dotClass)} />
                      <span className="text-sm font-semibold">{p.label}</span>
                    </div>
                    <p className="text-xs opacity-70 leading-snug">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Status</h3>
            <input type="hidden" name="status" value={status} />
            <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1 gap-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    status === s.value
                      ? "bg-white text-brand-700 shadow-sm border border-surface-200"
                      : "text-surface-500 hover:text-surface-700"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer create button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/event-manager/tasks"
              className="px-5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!isValid || pending}
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm transition-colors"
            >
              {pending ? "Creating…" : "Create Task"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
