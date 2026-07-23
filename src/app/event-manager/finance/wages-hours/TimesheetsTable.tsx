"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Clock3, Check, X as XIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { timesheetBadgeStatus } from "../_lib/finance";
import { approveTimesheet, rejectTimesheet } from "./actions";

export interface TimesheetRow {
  id: string;
  code: string;
  teamMemberName: string;
  role: string | null;
  eventName: string | null;
  department: string;
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  hourlyRateCents: number;
  overtimeRateCents: number;
  costCents: number;
  currency: string;
  approvalStatus: string;
  payPeriodStart: string;
  payPeriodEnd: string;
}

type SortKey = "period_desc" | "period_asc" | "cost_desc" | "hours_desc" | "name_asc";

const DEPARTMENT_LABELS: Record<string, string> = {
  production: "Production",
  operations: "Operations",
  front_of_house: "Front of House",
  security: "Security",
  other: "Other",
};

function badgeStatus(status: string) {
  return timesheetBadgeStatus(status);
}

export function TimesheetsTable({ timesheets }: { timesheets: TimesheetRow[] }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [event, setEvent] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [sort, setSort] = useState<SortKey>("period_desc");
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const events = useMemo(
    () => Array.from(new Set(timesheets.map((t) => t.eventName).filter((v): v is string => !!v))).sort(),
    [timesheets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = timesheets.filter((t) => {
      if (q) {
        const haystack = `${t.teamMemberName} ${t.role ?? ""} ${t.eventName ?? ""} ${t.code}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (department !== "all" && t.department !== department) return false;
      if (event !== "all" && t.eventName !== event) return false;
      if (status !== "all" && t.approvalStatus !== status) return false;
      if (periodStart && t.payPeriodEnd < periodStart) return false;
      if (periodEnd && t.payPeriodStart > periodEnd) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "period_asc":
          return a.payPeriodStart.localeCompare(b.payPeriodStart);
        case "period_desc":
          return b.payPeriodStart.localeCompare(a.payPeriodStart);
        case "cost_desc":
          return b.costCents - a.costCents;
        case "hours_desc":
          return b.actualHours - a.actualHours;
        case "name_asc":
          return a.teamMemberName.localeCompare(b.teamMemberName);
        default:
          return 0;
      }
    });

    return rows;
  }, [timesheets, query, department, event, status, periodStart, periodEnd, sort]);

  function handleApprove(id: string) {
    setRowError(null);
    setActingId(id);
    startTransition(async () => {
      try {
        await approveTimesheet(id);
      } catch (e) {
        setRowError({ id, message: e instanceof Error ? e.message : "Failed to approve" });
      } finally {
        setActingId(null);
      }
    });
  }

  function handleReject(id: string) {
    setRowError(null);
    setActingId(id);
    startTransition(async () => {
      try {
        await rejectTimesheet(id);
      } catch (e) {
        setRowError({ id, message: e instanceof Error ? e.message : "Failed to reject" });
      } finally {
        setActingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team member, role or event…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All departments</option>
          {Object.entries(DEPARTMENT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All events</option>
          {events.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="exported">Exported</option>
          <option value="paid">Paid</option>
        </select>
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          title="Pay period from"
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <input
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          title="Pay period to"
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="period_desc">Pay period (newest)</option>
          <option value="period_asc">Pay period (oldest)</option>
          <option value="cost_desc">Cost (high–low)</option>
          <option value="hours_desc">Actual hours (high–low)</option>
          <option value="name_asc">Team member (A–Z)</option>
        </select>
        <span className="text-xs text-surface-400 whitespace-nowrap">
          {filtered.length} {filtered.length === 1 ? "timesheet" : "timesheets"}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title={timesheets.length === 0 ? "No timesheets yet" : "No timesheets match your filters"}
            description={
              timesheets.length === 0
                ? "Add a timesheet to start tracking staffing hours and wage cost."
                : "Try clearing search or filters to see more results."
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-surface-100">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Timesheet</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Team Member</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Scheduled</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Overtime</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Hourly Rate</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((t) => {
                  const canReview = t.approvalStatus === "submitted" || t.approvalStatus === "pending";
                  const isActing = pending && actingId === t.id;
                  return (
                    <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">
                        <span className="flex items-center gap-2">
                          <Clock3 className="w-3.5 h-3.5 text-surface-300" />
                          {t.code}
                        </span>
                        <span className="block text-[10px] text-surface-400 mt-0.5">
                          {formatDate(t.payPeriodStart)} – {formatDate(t.payPeriodEnd)}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-medium text-surface-900">{t.teamMemberName}</td>
                      <td className="px-6 py-3 text-surface-600">{t.role ?? "—"}</td>
                      <td className="px-6 py-3 text-surface-600">{t.eventName ?? "—"}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{t.scheduledHours.toFixed(1)}h</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-900 font-medium">{t.actualHours.toFixed(1)}h</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                        {t.overtimeHours > 0 ? `${t.overtimeHours.toFixed(1)}h` : "—"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                        {formatCurrency(t.hourlyRateCents / 100, t.currency)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">
                        {formatCurrency(t.costCents / 100, t.currency)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={badgeStatus(t.approvalStatus)} />
                        {rowError?.id === t.id && (
                          <span className="block text-[10px] text-danger-600 mt-1 max-w-[140px]">{rowError.message}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {canReview ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApprove(t.id)}
                              disabled={isActing}
                              title="Approve timesheet"
                              className="p-1.5 rounded-md hover:bg-success-50 text-success-600 disabled:opacity-40 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(t.id)}
                              disabled={isActing}
                              title="Reject timesheet"
                              className="p-1.5 rounded-md hover:bg-danger-50 text-danger-600 disabled:opacity-40 transition-colors"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-surface-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
