"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createTimesheet } from "./actions";

interface EventOption {
  id: string;
  name: string;
}

interface AssignmentOption {
  id: string;
  event_id: string;
  staff_name: string | null;
  role: string | null;
}

const DEPARTMENTS: { value: string; label: string }[] = [
  { value: "production", label: "Production" },
  { value: "operations", label: "Operations" },
  { value: "front_of_house", label: "Front of House" },
  { value: "security", label: "Security" },
  { value: "other", label: "Other" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimesheetForm({ events, assignments }: { events: EventOption[]; assignments: AssignmentOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    eventId: events[0]?.id ?? "",
    staffAssignmentId: "",
    teamMemberName: "",
    role: "",
    department: "production",
    payPeriodStart: todayISO(),
    payPeriodEnd: todayISO(),
    scheduledHours: "",
    actualHours: "",
    overtimeHours: "0",
    hourlyRate: "",
    overtimeRate: "",
    currency: "GBP",
    notes: "",
  });

  const assignmentsForEvent = useMemo(
    () => assignments.filter((a) => a.event_id === form.eventId),
    [assignments, form.eventId]
  );

  function selectAssignment(assignmentId: string) {
    const assignment = assignmentsForEvent.find((a) => a.id === assignmentId);
    setForm((prev) => ({
      ...prev,
      staffAssignmentId: assignmentId,
      teamMemberName: assignment?.staff_name ?? prev.teamMemberName,
      role: assignment?.role ?? prev.role,
    }));
  }

  function submit() {
    setError(null);
    if (!form.eventId) {
      setError("Please select an event.");
      return;
    }
    if (!form.teamMemberName.trim()) {
      setError("Please enter the team member's name.");
      return;
    }
    const scheduledHours = Number(form.scheduledHours) || 0;
    const actualHours = Number(form.actualHours) || 0;
    const overtimeHours = Number(form.overtimeHours) || 0;
    if (overtimeHours > actualHours) {
      setError("Overtime hours cannot exceed actual hours.");
      return;
    }
    startTransition(async () => {
      try {
        await createTimesheet({
          eventId: form.eventId,
          staffAssignmentId: form.staffAssignmentId || null,
          teamMemberName: form.teamMemberName,
          role: form.role,
          department: form.department,
          payPeriodStart: form.payPeriodStart,
          payPeriodEnd: form.payPeriodEnd,
          scheduledHours,
          actualHours,
          overtimeHours,
          hourlyRate: Number(form.hourlyRate) || 0,
          overtimeRate: Number(form.overtimeRate) || 0,
          currency: form.currency,
          notes: form.notes,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create timesheet");
      }
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-surface-900">Add Timesheet</h1>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl space-y-6">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-surface-900">Assignment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Event</label>
              <select
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value, staffAssignmentId: "" })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {events.length === 0 && <option value="">No events available</option>}
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Staff Assignment (optional)</label>
              <select
                value={form.staffAssignmentId}
                onChange={(e) => selectAssignment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">None — enter details manually</option>
                {assignmentsForEvent.map((a) => (
                  <option key={a.id} value={a.id}>{a.staff_name ?? "Unnamed"} {a.role ? `— ${a.role}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Team Member Name</label>
              <input
                type="text"
                value={form.teamMemberName}
                onChange={(e) => setForm({ ...form, teamMemberName: e.target.value })}
                placeholder="e.g. Jordan Reeves"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Role</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="e.g. Floor Supervisor"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Department</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="GBP">GBP — British Pound</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-surface-900">Pay Period & Hours</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Pay Period Start</label>
              <input
                type="date"
                value={form.payPeriodStart}
                onChange={(e) => setForm({ ...form, payPeriodStart: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Pay Period End</label>
              <input
                type="date"
                value={form.payPeriodEnd}
                onChange={(e) => setForm({ ...form, payPeriodEnd: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Scheduled Hours</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.scheduledHours}
                onChange={(e) => setForm({ ...form, scheduledHours: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Actual Hours (total incl. overtime)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.actualHours}
                onChange={(e) => setForm({ ...form, actualHours: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Overtime Hours (portion of actual hours)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.overtimeHours}
                onChange={(e) => setForm({ ...form, overtimeHours: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Hourly Rate</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Overtime Rate</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.overtimeRate}
                onChange={(e) => setForm({ ...form, overtimeRate: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">Notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Any additional notes about this timesheet…"
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || events.length === 0}
            className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Timesheet"}
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
