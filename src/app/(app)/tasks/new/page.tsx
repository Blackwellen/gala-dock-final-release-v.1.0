"use client";

import { useState } from "react";
import { X, CheckSquare, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ── Seed data ──────────────────────────────────────────────────────────────────

const EVENTS = [
  { id: "ev1", label: "The Carter Wedding — 14 Jun 2026" },
  { id: "ev2", label: "Thornbury Gala Dinner — 5 Jul 2026" },
  { id: "ev3", label: "Meridian Tech Summit — 19 Jun 2026" },
  { id: "ev4", label: "Bloom Garden Party — 18 Jul 2026" },
  { id: "ev5", label: "Harrington Wedding — 14 Aug 2026" },
];

const SUPPLIERS = [
  { id: "s1", label: "Noble Kitchen Co. — Catering" },
  { id: "s2", label: "Petal & Bloom Florists — Floristry" },
  { id: "s3", label: "Prestige AV Ltd — Audio/Visual" },
  { id: "s4", label: "Marquee Masters — Venue Hire" },
];

const ASSIGNEES = [
  { id: "u1", label: "Sophie Clarke" },
  { id: "u2", label: "Marcus Webb" },
  { id: "u3", label: "Tom Reid" },
  { id: "u4", label: "Emma Harrison" },
];

// ── Priority options ───────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high" | "urgent";
type TaskType = "internal" | "supplier" | "client";

interface PriorityOption {
  value: Priority;
  label: string;
  description: string;
  dotClass: string;
  activeClass: string;
  ringClass: string;
}

const PRIORITIES: PriorityOption[] = [
  {
    value: "low",
    label: "Low",
    description: "No immediate deadline",
    dotClass: "bg-surface-400",
    activeClass: "border-surface-400 bg-surface-50 text-surface-700",
    ringClass: "ring-surface-300",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Complete within the week",
    dotClass: "bg-warning-500",
    activeClass: "border-warning-400 bg-warning-50 text-warning-700",
    ringClass: "ring-warning-400",
  },
  {
    value: "high",
    label: "High",
    description: "Complete within 48 hours",
    dotClass: "bg-danger-500",
    activeClass: "border-danger-400 bg-danger-50 text-danger-700",
    ringClass: "ring-danger-400",
  },
  {
    value: "urgent",
    label: "Urgent",
    description: "Requires immediate attention",
    dotClass: "bg-danger-700",
    activeClass: "border-danger-600 bg-danger-100 text-danger-800",
    ringClass: "ring-danger-600",
  },
];

const TASK_TYPES: { value: TaskType; label: string; desc: string }[] = [
  { value: "internal", label: "Internal",  desc: "Team task"      },
  { value: "supplier", label: "Supplier",  desc: "Supplier task"  },
  { value: "client",   label: "Client",    desc: "Client-facing"  },
];

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  eventId: string;
  supplierId: string;
  assigneeId: string;
  dueDate: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewTaskPage() {
  const router = useRouter();
  const [priority, setPriority] = useState<Priority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("internal");
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    eventId: "",
    supplierId: "",
    assigneeId: "",
    dueDate: "",
  });

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCreate() {
    if (!form.title.trim()) return;
    router.push("/tasks");
  }

  const isValid = form.title.trim().length > 0;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/tasks"
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
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={1.8} />
            Save Draft
          </button>
          <Link
            href="/tasks"
            className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>

      {/* ── Form body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="space-y-5">

          {/* Task title */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">
              Task Title <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g. Confirm catering arrangements with Noble Kitchen Co."
              className="w-full px-4 py-3 rounded-xl border border-surface-300 text-base text-surface-900 font-medium placeholder:text-surface-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={4}
              placeholder="Provide additional context, instructions, or notes for this task…"
              className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          {/* Links + scheduling */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Links & Scheduling</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Linked Event */}
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">
                  Linked Event
                </label>
                <select
                  value={form.eventId}
                  onChange={(e) => handleChange("eventId", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">Select an event…</option>
                  {EVENTS.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.label}</option>
                  ))}
                </select>
              </div>

              {/* Linked Supplier */}
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">
                  Linked Supplier
                </label>
                <select
                  value={form.supplierId}
                  onChange={(e) => handleChange("supplierId", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">Select a supplier…</option>
                  {SUPPLIERS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">
                  Assignee
                </label>
                <select
                  value={form.assigneeId}
                  onChange={(e) => handleChange("assigneeId", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors"
                >
                  <option value="">Select a team member…</option>
                  {ASSIGNEES.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => handleChange("dueDate", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Priority */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Priority</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRIORITIES.map((p) => (
                <label key={p.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    value={p.value}
                    checked={priority === p.value}
                    onChange={() => setPriority(p.value)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 px-4 py-3.5 rounded-xl border-2 transition-all",
                      priority === p.value
                        ? cn(p.activeClass, "ring-2 ring-offset-1", p.ringClass)
                        : "border-surface-200 text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", p.dotClass)} />
                      <span className="text-sm font-semibold">{p.label}</span>
                    </div>
                    <p className="text-xs opacity-70 leading-snug">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Task type */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Task Type</h3>
            <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1 gap-1">
              {TASK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTaskType(t.value)}
                  className={cn(
                    "flex flex-col items-center px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                    taskType === t.value
                      ? "bg-white text-brand-700 shadow-sm border border-surface-200"
                      : "text-surface-500 hover:text-surface-700"
                  )}
                >
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-[10px] opacity-70 mt-0.5">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Create button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/tasks"
              className="px-5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!isValid}
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm transition-colors"
            >
              Create Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
