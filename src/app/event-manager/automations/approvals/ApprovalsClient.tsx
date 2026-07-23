"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  MoreHorizontal,
  Download,
  ChevronDown,
  X,
  Clock,
  AlertTriangle,
  Inbox,
  Paperclip,
  History,
  Send,
  UserPlus,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { DonutChart, DonutLegend, InsightCard, ProgressBar } from "@/components/ui/FinanceCharts";
import { cn, formatDate, formatRelative } from "@/lib/utils";
import { decideApproval, assignApprovalReviewer, addApprovalComment } from "../actions";

export interface FullApprovalRow {
  id: string;
  automationId: string | null;
  automationName: string;
  requestType: string;
  module: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "changes_requested" | "escalated";
  reason: string | null;
  triggerContext: Record<string, unknown>;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  submittedBy: string | null;
  submittedByName: string;
  submittedAt: string;
  reviewerId: string | null;
  reviewerName: string | null;
  dueAt: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
}

export interface CommentRow {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface MemberOption {
  id: string;
  name: string;
}

interface Filters {
  q: string;
  module: string;
  reviewer: string;
  workflow: string;
  priority: string;
  status: string[];
  due: string;
  sort: string;
}

interface Kpis {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  escalatedCount: number;
  avgReviewTime: string;
  slaMetPct: number | null;
}

interface ApprovalsClientProps {
  currentUserId: string;
  kpis: Kpis;
  statusDonut: { label: string; value: number; color: string }[];
  moduleBreakdown: { module: string; count: number }[];
  slaDonut: { label: string; value: number; color: string }[] | null;
  slaMetPct: number | null;
  moduleOptions: string[];
  workflowOptions: string[];
  memberOptions: MemberOption[];
  filters: Filters;
  pageRows: FullApprovalRow[];
  exportRows: FullApprovalRow[];
  totalFiltered: number;
  totalAll: number;
  page: number;
  totalPages: number;
  hasFilters: boolean;
  selectedApproval: FullApprovalRow | null;
  selectedApprovalTriggerEntries: { label: string; value: string }[];
  comments: CommentRow[];
}

const STATUS_OPTIONS: { value: FullApprovalRow["status"]; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "escalated", label: "Escalated" },
];

const PRIORITY_STYLES: Record<FullApprovalRow["priority"], string> = {
  high: "bg-danger-50 text-danger-600 border-danger-200",
  medium: "bg-warning-50 text-warning-600 border-warning-200",
  low: "bg-surface-100 text-surface-600 border-surface-200",
};

function PriorityPill({ priority }: { priority: FullApprovalRow["priority"] }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize", PRIORITY_STYLES[priority])}>
      {priority}
    </span>
  );
}

function statusBadgeKey(status: FullApprovalRow["status"]): "pending" | "approved" | "rejected" | "changes-requested" | "escalated" {
  return status === "changes_requested" ? "changes-requested" : status;
}

function BASE(): string {
  return "/event-manager/automations/approvals";
}

function toQuery(filters: Filters, page: number, approvalId?: string): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.module) p.set("module", filters.module);
  if (filters.reviewer) p.set("reviewer", filters.reviewer);
  if (filters.workflow) p.set("workflow", filters.workflow);
  if (filters.priority) p.set("priority", filters.priority);
  if (filters.due) p.set("due", filters.due);
  if (filters.sort && filters.sort !== "due_asc") p.set("sort", filters.sort);
  p.set("f", "1");
  for (const s of filters.status) p.append("status", s);
  if (page > 1) p.set("page", String(page));
  if (approvalId) p.set("approval", approvalId);
  const qs = p.toString();
  return qs ? `${BASE()}?${qs}` : BASE();
}

function downloadDataUrl(filename: string, mime: string, content: string) {
  const el = document.createElement("a");
  el.href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

function toCsv(rows: FullApprovalRow[]): string {
  const headers = ["Automation", "Request Type", "Module", "Priority", "Status", "Submitted By", "Submitted At", "Reviewer", "Due At", "Decided By", "Decided At"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells = [
      r.automationName,
      r.requestType,
      r.module,
      r.priority,
      r.status,
      r.submittedByName,
      r.submittedAt,
      r.reviewerName ?? "",
      r.dueAt ?? "",
      r.decidedByName ?? "",
      r.decidedAt ?? "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function ApprovalsClient({
  currentUserId,
  kpis,
  statusDonut,
  moduleBreakdown,
  slaDonut,
  slaMetPct,
  moduleOptions,
  workflowOptions,
  memberOptions,
  filters,
  pageRows,
  exportRows,
  totalFiltered,
  totalAll,
  page,
  totalPages,
  hasFilters,
  selectedApproval,
  selectedApprovalTriggerEntries,
  comments,
}: ApprovalsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "before_after" | "attachments" | "comments" | "audit">("overview");
  const [commentBody, setCommentBody] = useState("");
  const [reviewerPick, setReviewerPick] = useState(selectedApproval?.reviewerId ?? "");
  const [actionError, setActionError] = useState<string | null>(null);

  const moduleMax = Math.max(1, ...moduleBreakdown.map((m) => m.count));

  const runDecision = (id: string, decision: "approved" | "rejected" | "changes_requested") => {
    setPendingId(id);
    setActionError(null);
    startTransition(async () => {
      const res = await decideApproval(id, decision);
      setPendingId(null);
      setMenuOpenId(null);
      if (!res.ok) setActionError(res.error ?? "Couldn't update this approval.");
      else router.refresh();
    });
  };

  const runAssign = (id: string, reviewerId: string) => {
    if (!reviewerId) return;
    setPendingId(id);
    setActionError(null);
    startTransition(async () => {
      const res = await assignApprovalReviewer(id, reviewerId);
      setPendingId(null);
      setMenuOpenId(null);
      if (!res.ok) setActionError(res.error ?? "Couldn't assign a reviewer.");
      else router.refresh();
    });
  };

  const submitComment = () => {
    if (!selectedApproval || !commentBody.trim()) return;
    startTransition(async () => {
      const res = await addApprovalComment(selectedApproval.id, commentBody);
      if (res.ok) {
        setCommentBody("");
        router.refresh();
      } else {
        setActionError(res.error ?? "Couldn't post that comment.");
      }
    });
  };

  const exportFilename = (ext: string) => `approvals-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

  return (
    <div className="p-6 max-w-[1600px] space-y-6">
      {/* KPI row */}
      <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Pending Approvals" value={kpis.pendingApprovals} icon={Clock} iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Approved Today" value={kpis.approvedToday} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Rejected Today" value={kpis.rejectedToday} icon={XCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
        <MetricCard label="Avg Review Time" value={kpis.avgReviewTime} icon={History} iconColor="text-brand-600" iconBg="bg-brand-50" />
        <MetricCard label="Escalated Requests" value={kpis.escalatedCount} icon={AlertTriangle} iconColor="text-danger-700" iconBg="bg-danger-50" />
        <MetricCard label="Review SLA Met" value={slaMetPct !== null ? `${slaMetPct}%` : "—"} icon={CheckCircle2} iconColor="text-violet-600" iconBg="bg-violet-50" />
      </KPIGrid>

      {actionError && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-2.5 text-sm text-danger-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-danger-500 hover:text-danger-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filter bar */}
          <form method="get" className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="f" value="1" />
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-surface-500 mb-1">Search</label>
              <input
                type="text"
                name="q"
                defaultValue={filters.q}
                placeholder="Automation or request type"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Module</label>
              <select name="module" defaultValue={filters.module} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All modules</option>
                {moduleOptions.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Workflow</label>
              <select name="workflow" defaultValue={filters.workflow} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All workflows</option>
                {workflowOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Reviewer</label>
              <select name="reviewer" defaultValue={filters.reviewer} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All reviewers</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Priority</label>
              <select name="priority" defaultValue={filters.priority} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Due</label>
              <select name="due" defaultValue={filters.due} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Any due date</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="week">Due this week</option>
                <option value="none">No due date</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Sort</label>
              <select name="sort" defaultValue={filters.sort} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="due_asc">Due date: soonest first</option>
                <option value="due_desc">Due date: latest first</option>
                <option value="submitted_desc">Newest submitted</option>
                <option value="submitted_asc">Oldest submitted</option>
                <option value="priority_desc">Priority: high to low</option>
              </select>
            </div>
            <fieldset className="flex flex-col">
              <legend className="block text-xs font-medium text-surface-500 mb-1">Status</legend>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <label
                    key={s.value}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-200 text-xs font-medium text-surface-600 hover:bg-surface-50 cursor-pointer has-[:checked]:bg-brand-50 has-[:checked]:border-brand-300 has-[:checked]:text-brand-700"
                  >
                    <input type="checkbox" name="status" value={s.value} defaultChecked={filters.status.includes(s.value)} className="accent-brand-600" />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-2">
              <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                Apply
              </button>
              {hasFilters && (
                <Link href={BASE()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-500 text-sm hover:bg-surface-50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                  Clear
                </Link>
              )}
            </div>
          </form>

          {/* Approval queue table */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
              <h2 className="text-sm font-semibold text-surface-900">
                {totalFiltered} {totalFiltered === 1 ? "approval" : "approvals"}
              </h2>
              <div className="flex items-center gap-3">
                {hasFilters && <span className="text-xs text-surface-400">Filtered from {totalAll} total</span>}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportOpen((v) => !v)}
                    disabled={exportRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {exportOpen && (
                    <div className="absolute right-0 mt-1 w-36 rounded-lg border border-surface-200 bg-white shadow-lg z-20 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          downloadDataUrl(exportFilename("csv"), "text/csv", toCsv(exportRows));
                          setExportOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50"
                      >
                        Export as CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          downloadDataUrl(exportFilename("json"), "application/json", JSON.stringify(exportRows, null, 2));
                          setExportOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50"
                      >
                        Export as JSON
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {pageRows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={totalAll === 0 ? "No approvals yet" : "No approvals match these filters"}
                description={
                  totalAll === 0
                    ? "Approvals appear here when an automation requires human sign-off before running a sensitive action."
                    : "Try clearing or adjusting the filters above."
                }
                compact
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Automation</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Request</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Reviewer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {pageRows.map((a) => {
                      const isOverdue = a.dueAt && a.status === "pending" && new Date(a.dueAt) < new Date();
                      const rowPending = isPending && pendingId === a.id;
                      return (
                        <tr key={a.id} className={cn("hover:bg-surface-50 transition-colors", selectedApproval?.id === a.id && "bg-brand-50/40")}>
                          <td className="px-4 py-3">
                            <Link href={toQuery(filters, page, a.id)} className="text-surface-400 hover:text-brand-600">
                              <ChevronDown className={cn("w-4 h-4 transition-transform", selectedApproval?.id === a.id && "-rotate-90")} />
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={toQuery(filters, page, a.id)} className="font-medium text-surface-900 hover:text-brand-600">
                              {a.automationName}
                            </Link>
                            <div className="mt-0.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 capitalize">{a.module}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-surface-600">
                            <div>{a.requestType}</div>
                            {a.reason && <div className="text-xs text-surface-400 truncate max-w-[220px]">{a.reason}</div>}
                          </td>
                          <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                            <div>{a.submittedByName}</div>
                            <div className="text-xs text-surface-400">{formatRelative(a.submittedAt)}</div>
                          </td>
                          <td className="px-4 py-3 text-surface-600 whitespace-nowrap">{a.reviewerName ?? "—"}</td>
                          <td className={cn("px-4 py-3 whitespace-nowrap", isOverdue ? "text-danger-600 font-medium" : "text-surface-500")}>
                            {a.dueAt ? formatRelative(a.dueAt) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <PriorityPill priority={a.priority} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={statusBadgeKey(a.status)} />
                          </td>
                          <td className="px-4 py-3 text-right relative">
                            <button
                              type="button"
                              onClick={() => setMenuOpenId(menuOpenId === a.id ? null : a.id)}
                              disabled={rowPending}
                              className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 disabled:opacity-40"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuOpenId === a.id && (
                              <div className="absolute right-4 top-10 w-48 rounded-lg border border-surface-200 bg-white shadow-lg z-20 py-1 text-left">
                                <button
                                  type="button"
                                  disabled={a.status !== "pending" && a.status !== "escalated"}
                                  onClick={() => runDecision(a.id, "approved")}
                                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-success-600" /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={a.status !== "pending" && a.status !== "escalated"}
                                  onClick={() => runDecision(a.id, "rejected")}
                                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <XCircle className="w-3.5 h-3.5 text-danger-600" /> Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={a.status !== "pending" && a.status !== "escalated"}
                                  onClick={() => runDecision(a.id, "changes_requested")}
                                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <MessageSquareWarning className="w-3.5 h-3.5 text-warning-600" /> Request Changes
                                </button>
                                <div className="border-t border-surface-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => runAssign(a.id, currentUserId)}
                                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-50"
                                >
                                  <UserPlus className="w-3.5 h-3.5 text-brand-600" /> Assign to me
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 flex items-center justify-between border-t border-surface-200 text-xs text-surface-500">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={toQuery(filters, Math.max(1, page - 1))}
                    aria-disabled={page <= 1}
                    className={cn("px-3 py-1.5 rounded-lg border border-surface-200", page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-50")}
                  >
                    Previous
                  </Link>
                  <Link
                    href={toQuery(filters, Math.min(totalPages, page + 1))}
                    aria-disabled={page >= totalPages}
                    className={cn("px-3 py-1.5 rounded-lg border border-surface-200", page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-50")}
                  >
                    Next
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Approval details panel */}
          {selectedApproval && (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-surface-900">{selectedApproval.automationName}</h3>
                    <StatusBadge status={statusBadgeKey(selectedApproval.status)} />
                  </div>
                  <p className="text-xs text-surface-500 mt-1">{selectedApproval.requestType}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={isPending || (selectedApproval.status !== "pending" && selectedApproval.status !== "escalated")}
                    onClick={() => runDecision(selectedApproval.id, "approved")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-600 text-white text-xs font-medium hover:bg-success-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={isPending || (selectedApproval.status !== "pending" && selectedApproval.status !== "escalated")}
                    onClick={() => runDecision(selectedApproval.id, "rejected")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-600 text-white text-xs font-medium hover:bg-danger-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={isPending || (selectedApproval.status !== "pending" && selectedApproval.status !== "escalated")}
                    onClick={() => runDecision(selectedApproval.id, "changes_requested")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <MessageSquareWarning className="w-3.5 h-3.5" /> Request Changes
                  </button>
                  <Link href={toQuery(filters, page)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500">
                    <X className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="px-6 pt-3 flex items-center gap-1 border-b border-surface-200 overflow-x-auto">
                {(
                  [
                    { key: "overview", label: "Overview" },
                    { key: "details", label: "Details" },
                    ...(selectedApproval.beforeState || selectedApproval.afterState ? [{ key: "before_after", label: "Before / After" }] : []),
                    { key: "attachments", label: "Attachments" },
                    { key: "comments", label: `Comments${comments.length > 0 ? ` (${comments.length})` : ""}` },
                    { key: "audit", label: "Audit Trail" },
                  ] as { key: typeof activeTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                      activeTab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-700"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === "overview" && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Request Type</dt>
                      <dd className="mt-0.5 text-surface-900">{selectedApproval.requestType}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Module / Workflow</dt>
                      <dd className="mt-0.5 text-surface-900 capitalize">{selectedApproval.module}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Priority</dt>
                      <dd className="mt-0.5">
                        <PriorityPill priority={selectedApproval.priority} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Status</dt>
                      <dd className="mt-0.5">
                        <StatusBadge status={statusBadgeKey(selectedApproval.status)} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Submitted By</dt>
                      <dd className="mt-0.5 text-surface-900">
                        {selectedApproval.submittedByName} · {formatDate(selectedApproval.submittedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Due By</dt>
                      <dd className="mt-0.5 text-surface-900">{selectedApproval.dueAt ? formatDate(selectedApproval.dueAt) : "No due date"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Reviewer</dt>
                      <dd className="mt-0.5 flex items-center gap-2 flex-wrap">
                        <select
                          value={reviewerPick}
                          onChange={(e) => setReviewerPick(e.target.value)}
                          className="px-2 py-1 rounded-lg border border-surface-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">Unassigned</option>
                          {memberOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!reviewerPick || isPending}
                          onClick={() => runAssign(selectedApproval.id, reviewerPick)}
                          className="px-2.5 py-1 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAssign(selectedApproval.id, currentUserId)}
                          className="px-2.5 py-1 rounded-lg border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-40"
                        >
                          Assign to me
                        </button>
                      </dd>
                    </div>
                    {selectedApproval.reason && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">Reason</dt>
                        <dd className="mt-0.5 text-surface-700">{selectedApproval.reason}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {activeTab === "details" && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Trigger Context</h4>
                    {selectedApprovalTriggerEntries.length === 0 ? (
                      <p className="text-sm text-surface-400">No trigger context recorded for this request.</p>
                    ) : (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        {selectedApprovalTriggerEntries.map((e) => (
                          <div key={e.label}>
                            <dt className="text-xs font-medium text-surface-500">{e.label}</dt>
                            <dd className="mt-0.5 text-surface-900 break-words">{e.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}

                {activeTab === "before_after" && (selectedApproval.beforeState || selectedApproval.afterState) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Before</h4>
                      <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
                        {Object.entries(selectedApproval.beforeState ?? {}).map(([k, v]) => (
                          <div key={k} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                            <span className="text-surface-500">{k}</span>
                            <span className="text-surface-900 font-medium text-right">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">After</h4>
                      <div className="rounded-lg border border-brand-200 bg-brand-50/30 divide-y divide-brand-100">
                        {Object.entries(selectedApproval.afterState ?? {}).map(([k, v]) => (
                          <div key={k} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                            <span className="text-surface-500">{k}</span>
                            <span className="text-brand-800 font-semibold text-right">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "attachments" && (
                  <EmptyState icon={Paperclip} title="No attachments" description="This approval request has no files attached." compact />
                )}

                {activeTab === "comments" && (
                  <div className="space-y-4">
                    {comments.length === 0 ? (
                      <p className="text-sm text-surface-400">No comments yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {comments.map((c) => (
                          <li key={c.id} className="rounded-lg border border-surface-200 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-surface-800">{c.authorName}</span>
                              <span className="text-xs text-surface-400">{formatRelative(c.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-sm text-surface-700">{c.body}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-start gap-2 pt-2">
                      <textarea
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Add a comment…"
                        rows={2}
                        className="flex-1 px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                      />
                      <button
                        type="button"
                        disabled={!commentBody.trim() || isPending}
                        onClick={submitComment}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" /> Post
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "audit" && (
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                      <div className="text-sm">
                        <p className="text-surface-800">
                          Submitted by <span className="font-medium">{selectedApproval.submittedByName}</span>
                        </p>
                        <p className="text-xs text-surface-400">{formatDate(selectedApproval.submittedAt, { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </li>
                    {selectedApproval.reviewerId && (
                      <li className="flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full bg-surface-400 mt-1.5 shrink-0" />
                        <div className="text-sm">
                          <p className="text-surface-800">
                            Assigned to <span className="font-medium">{selectedApproval.reviewerName}</span>
                          </p>
                        </div>
                      </li>
                    )}
                    {selectedApproval.decidedAt && (
                      <li className="flex items-start gap-3">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full mt-1.5 shrink-0",
                            selectedApproval.status === "approved" ? "bg-success-500" : selectedApproval.status === "rejected" ? "bg-danger-500" : "bg-warning-500"
                          )}
                        />
                        <div className="text-sm">
                          <p className="text-surface-800">
                            {selectedApproval.status === "approved" ? "Approved" : selectedApproval.status === "rejected" ? "Rejected" : "Changes requested"} by{" "}
                            <span className="font-medium">{selectedApproval.decidedByName}</span>
                          </p>
                          <p className="text-xs text-surface-400">{formatDate(selectedApproval.decidedAt, { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </li>
                    )}
                    {!selectedApproval.decidedAt && (
                      <li className="flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full bg-surface-300 mt-1.5 shrink-0" />
                        <p className="text-sm text-surface-500">Awaiting a decision.</p>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right insights */}
        <aside className="w-full xl:w-[320px] shrink-0 space-y-4">
          <InsightCard title="Approvals Overview">
            {statusDonut.length === 0 ? (
              <p className="text-xs text-surface-400">No approval requests yet.</p>
            ) : (
              <div className="flex items-center gap-4">
                <DonutChart data={statusDonut} centerValue={String(statusDonut.reduce((s, d) => s + d.value, 0))} centerLabel="Total" size={140} thickness={20} />
                <div className="flex-1 min-w-0">
                  <DonutLegend data={statusDonut} />
                </div>
              </div>
            )}
          </InsightCard>

          <InsightCard title="By Module">
            {moduleBreakdown.length === 0 ? (
              <p className="text-xs text-surface-400">No approvals to break down yet.</p>
            ) : (
              <ul className="space-y-3">
                {moduleBreakdown.map((m) => (
                  <li key={m.module}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-surface-600 capitalize">{m.module}</span>
                      <span className="font-semibold text-surface-800">{m.count}</span>
                    </div>
                    <ProgressBar pct={(m.count / moduleMax) * 100} color="bg-brand-500" />
                  </li>
                ))}
              </ul>
            )}
          </InsightCard>

          <InsightCard title="SLA Performance">
            {slaDonut ? (
              <div className="flex items-center gap-4">
                <DonutChart data={slaDonut} centerValue={`${slaMetPct}%`} centerLabel="Met SLA" size={140} thickness={20} />
                <div className="flex-1 min-w-0">
                  <DonutLegend data={slaDonut} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-400">No decided approvals with a due date yet — SLA performance will appear here once reviews are completed.</p>
            )}
          </InsightCard>
        </aside>
      </div>
    </div>
  );
}
