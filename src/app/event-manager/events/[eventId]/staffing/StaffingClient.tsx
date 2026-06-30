"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  UsersRound,
  CheckCircle2,
  Clock,
  UserCheck,
  Pencil,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  assignStaff,
  updateAssignment,
  setAssignmentStatus,
  removeAssignment,
} from "./actions";

export interface AssignmentRow {
  id: string;
  userId: string | null;
  name: string;
  isTeamMember: boolean;
  role: string | null;
  callTime: string | null;
  endTime: string | null;
  status: string;
  notes: string | null;
}

export interface StaffingKpis {
  assigned: number;
  confirmed: number;
  pending: number;
  teamMembers: number;
}

const ROLES = [
  "lead-event-manager",
  "on-site-support",
  "coordinator",
  "finance-lead",
  "creative-lead",
  "logistics",
  "team-member",
] as const;

const ROLE_LABELS: Record<string, string> = {
  "lead-event-manager": "Lead Event Manager",
  "on-site-support": "On-Site Support",
  coordinator: "Coordinator",
  "finance-lead": "Finance Lead",
  "creative-lead": "Creative Lead",
  logistics: "Logistics",
  "team-member": "Team Member",
};

const STATUS_OPTIONS = ["pending", "confirmed", "declined"] as const;

function roleLabel(role: string | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

function safeStatus(status: string): "pending" | "confirmed" | "declined" {
  return status === "confirmed" || status === "declined" ? status : "pending";
}

function fmtTime(t: string | null): string {
  if (!t) return "—";
  // call_time / end_time stored as time strings (HH:MM[:SS]) — trim seconds.
  return t.length >= 5 ? t.slice(0, 5) : t;
}

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-800 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";
const labelCls = "block text-xs font-medium text-surface-600 mb-1.5";

export function StaffingClient({
  eventId,
  eventName,
  assignments,
  memberOptions,
  kpis,
}: {
  eventId: string;
  eventName: string;
  assignments: AssignmentRow[];
  memberOptions: { userId: string; name: string }[];
  kpis: StaffingKpis;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);

  function quickStatus(id: string, status: string) {
    startTransition(async () => {
      await setAssignmentStatus(eventId, id, status);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeAssignment(eventId, id);
      router.refresh();
    });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Event Staffing"
        description={eventName}
        actions={
          <>
            <Link
              href={`/event-manager/events/${eventId}`}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Back to Event</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Assign Staff
            </button>
          </>
        }
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Assigned"
            value={String(kpis.assigned)}
            icon={UsersRound}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="Confirmed"
            value={String(kpis.confirmed)}
            icon={CheckCircle2}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Pending"
            value={String(kpis.pending)}
            icon={Clock}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard
            label="Team Members"
            value={String(kpis.teamMembers)}
            icon={UserCheck}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {assignments.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No staff assigned yet"
              description="Assign team members or named staff with their role and call times for this event."
              action={
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Assign Staff
                </button>
              }
              compact
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <Th>Staff</Th>
                  <Th className="hidden md:table-cell">Role</Th>
                  <Th className="hidden lg:table-cell">Call Time</Th>
                  <Th className="hidden lg:table-cell">End Time</Th>
                  <Th>Status</Th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                          {initials(a.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-surface-900 truncate">{a.name}</p>
                          <p className="text-xs text-surface-400">
                            {a.isTeamMember ? "Team member" : "External staff"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell">
                      {roleLabel(a.role)}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">
                      {fmtTime(a.callTime)}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">
                      {fmtTime(a.endTime)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={safeStatus(a.status)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {a.status !== "confirmed" && (
                          <button
                            type="button"
                            onClick={() => quickStatus(a.id, "confirmed")}
                            disabled={pending}
                            title="Mark confirmed"
                            className="p-1.5 rounded-lg text-surface-400 hover:text-success-600 hover:bg-success-50 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" strokeWidth={1.8} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          disabled={pending}
                          title="Remove"
                          className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <AssignDialog
          eventId={eventId}
          memberOptions={memberOptions}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <EditDialog
          eventId={eventId}
          assignment={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AssignDialog({
  eventId,
  memberOptions,
  onClose,
}: {
  eventId: string;
  memberOptions: { userId: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"member" | "named">(
    memberOptions.length > 0 ? "member" : "named",
  );

  function onSubmit(formData: FormData) {
    setError(null);
    if (mode === "named") formData.delete("user_id");
    else formData.delete("staff_name");
    startTransition(async () => {
      try {
        await assignStaff(eventId, formData);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to assign staff");
      }
    });
  }

  return (
    <Dialog title="Assign Staff" onClose={onClose}>
      <form action={onSubmit} className="p-5 space-y-4">
        <div className="flex items-center rounded-lg border border-surface-200 bg-surface-50 p-0.5">
          <ModeBtn active={mode === "member"} onClick={() => setMode("member")}>
            Team Member
          </ModeBtn>
          <ModeBtn active={mode === "named"} onClick={() => setMode("named")}>
            Named Staff
          </ModeBtn>
        </div>

        {mode === "member" ? (
          <div>
            <label className={labelCls} htmlFor="user_id">
              Team Member
            </label>
            {memberOptions.length === 0 ? (
              <p className="text-sm text-surface-400">
                All team members are already assigned. Use Named Staff instead.
              </p>
            ) : (
              <select id="user_id" name="user_id" className={inputCls} defaultValue="">
                <option value="" disabled>
                  Select a member…
                </option>
                {memberOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div>
            <label className={labelCls} htmlFor="staff_name">
              Staff Name
            </label>
            <input
              id="staff_name"
              name="staff_name"
              type="text"
              placeholder="e.g. Agency waiter"
              className={inputCls}
            />
          </div>
        )}

        <RoleStatusTimeFields />

        {error && <p className="text-sm text-danger-600">{error}</p>}
        <DialogActions pending={pending} onClose={onClose} submitLabel="Assign" />
      </form>
    </Dialog>
  );
}

function EditDialog({
  eventId,
  assignment,
  onClose,
}: {
  eventId: string;
  assignment: AssignmentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateAssignment(eventId, assignment.id, formData);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update assignment");
      }
    });
  }

  return (
    <Dialog title={`Edit — ${assignment.name}`} onClose={onClose}>
      <form action={onSubmit} className="p-5 space-y-4">
        <RoleStatusTimeFields
          role={assignment.role}
          status={assignment.status}
          callTime={assignment.callTime}
          endTime={assignment.endTime}
          notes={assignment.notes}
        />
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <DialogActions pending={pending} onClose={onClose} submitLabel="Save Changes" />
      </form>
    </Dialog>
  );
}

function RoleStatusTimeFields({
  role,
  status,
  callTime,
  endTime,
  notes,
}: {
  role?: string | null;
  status?: string;
  callTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}) {
  return (
    <>
      <div>
        <label className={labelCls} htmlFor="role">
          Role
        </label>
        <select id="role" name="role" className={inputCls} defaultValue={role ?? "team-member"}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="call_time">
            Call Time
          </label>
          <input
            id="call_time"
            name="call_time"
            type="time"
            defaultValue={callTime ? callTime.slice(0, 5) : ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="end_time">
            End Time
          </label>
          <input
            id="end_time"
            name="end_time"
            type="time"
            defaultValue={endTime ? endTime.slice(0, 5) : ""}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="status">
          Status
        </label>
        <select id="status" name="status" className={inputCls} defaultValue={status ?? "pending"}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="notes">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={notes ?? ""}
          className={inputCls}
        />
      </div>
    </>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900 truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  pending,
  onClose,
  submitLabel,
}: {
  pending: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-2 text-sm font-medium text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors " +
        (active ? "bg-white text-brand-700 shadow-sm" : "text-surface-500 hover:text-surface-800")
      }
    >
      {children}
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider " +
        (className ?? "")
      }
    >
      {children}
    </th>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
