"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Truck, AlertCircle, CheckCircle2, ShieldCheck, Search } from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { STATUS_OPTIONS, PRIORITY_META, statusToBadge, formatDate, categoryLabel } from "../task-utils";
import { PriorityBadge, InsightCard, Donut } from "../_shared";
import type { TaskRow } from "../TasksWorkspaceClient";

export function SupplierTasksView({ rows, suppliers }: { rows: TaskRow[]; suppliers: { id: string; name: string }[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const supplierRows = useMemo(() => rows.filter((r) => r.supplierId), [rows]);
  const categoryOptions = useMemo(() => Array.from(new Set(supplierRows.map((r) => r.category).filter(Boolean))) as string[], [supplierRows]);

  const filtered = useMemo(() => {
    let list = supplierRows;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.supplierName ?? "").toLowerCase().includes(q));
    return list;
  }, [supplierRows, statusFilter, categoryFilter, priorityFilter, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const in7Days = new Date(now.getTime() + 7 * 86400000);
  const complianceTasks = supplierRows.filter((t) => t.category === "compliance" && t.status !== "done" && t.status !== "cancelled");
  const metrics = {
    pending: supplierRows.filter((t) => t.status !== "done" && t.status !== "cancelled").length,
    overdue: supplierRows.filter((t) => t.overdue).length,
    completedThisWeek: supplierRows.filter((t) => t.status === "done" && t.dueAt && new Date(t.dueAt) >= weekAgo).length,
    complianceFollowups: complianceTasks.length,
  };

  const timing = {
    overdue: supplierRows.filter((t) => t.overdue).length,
    dueToday: supplierRows.filter((t) => {
      if (!t.dueAt || t.status === "done") return false;
      const d = new Date(t.dueAt);
      return d.toDateString() === now.toDateString();
    }).length,
    dueThisWeek: supplierRows.filter((t) => t.dueAt && !t.overdue && new Date(t.dueAt) <= in7Days && t.status !== "done").length,
    later: 0,
  };
  timing.later = Math.max(0, supplierRows.length - timing.overdue - timing.dueToday - timing.dueThisWeek);

  const onboardingTasks = supplierRows.filter((t) => t.category === "onboarding");
  const onboarding = {
    completed: onboardingTasks.filter((t) => t.status === "done").length,
    inProgress: onboardingTasks.filter((t) => t.status === "in_progress" || t.status === "review").length,
    notStarted: onboardingTasks.filter((t) => t.status === "todo" || t.status === "backlog").length,
  };
  const onboardingTotal = Math.max(1, onboardingTasks.length);

  const recentSuppliers = Array.from(
    new Map(
      supplierRows
        .filter((t) => t.supplierId)
        .sort((a, b) => (b.dueAt ?? "").localeCompare(a.dueAt ?? ""))
        .map((t) => [t.supplierId, { id: t.supplierId!, name: t.supplierName ?? "Supplier", dueAt: t.dueAt }])
    ).values()
  ).slice(0, 4);

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <KPIGrid>
          <MetricCard label="Supplier Tasks Pending" value={metrics.pending} icon={Truck} iconBg="bg-info-50" iconColor="text-info-600" />
          <MetricCard label="Overdue" value={metrics.overdue} icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Completed This Week" value={metrics.completedThisWeek} icon={CheckCircle2} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Compliance Follow-ups" value={metrics.complianceFollowups} icon={ShieldCheck} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search supplier tasks..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TaskStatus | "all"); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Status: All</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => <option key={c} value={c!}>{categoryLabel(c)}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TaskPriority | "all"); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Priority: All</option>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={Truck} title="No supplier tasks found" description={suppliers.length === 0 ? "Add suppliers to start tracking supplier tasks." : "Try a different filter."} compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Task</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Supplier</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Linked Event</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Due Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-surface-700">Next Step</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {paged.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-50">
                      <td className="px-4 py-3"><input type="checkbox" className="rounded border-surface-300" /></td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/tasks/${t.id}`} className="font-medium text-surface-900 hover:text-brand-600">{t.title}</Link>
                        {t.description && <p className="text-xs text-surface-400 mt-0.5 truncate max-w-xs">{t.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/suppliers/${t.supplierId}`} className="text-brand-600 hover:underline">{t.supplierName}</Link>
                      </td>
                      <td className="px-4 py-3 text-surface-600">{t.eventName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600">{categoryLabel(t.category)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={cn(t.overdue ? "text-danger-600 font-medium" : "text-surface-700")}>{formatDate(t.dueAt)}</div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={statusToBadge(t.status)} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/tasks/${t.id}`} className="text-brand-600 hover:underline text-xs font-medium">{t.nextAction ?? "Review"}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
              <span className="text-xs text-surface-500">Showing {paged.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} results</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border border-surface-200 text-surface-500 disabled:opacity-40">←</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded-lg text-xs font-medium", p === page ? "bg-brand-600 text-white" : "text-surface-600 hover:bg-surface-100")}>{p}</button>
                ))}
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border border-surface-200 text-surface-500 disabled:opacity-40">→</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden xl:block">
        <InsightCard title="Supplier Task Timing">
          <Donut
            centerLabel="Supplier Tasks"
            centerValue={supplierRows.length}
            segments={[
              { label: "Overdue", value: timing.overdue, color: "#ef4444" },
              { label: "Due Today", value: timing.dueToday, color: "#f59e0b" },
              { label: "Due This Week", value: timing.dueThisWeek, color: "#4f46e5" },
              { label: "Later", value: timing.later, color: "#94a3b8" },
            ]}
          />
        </InsightCard>
        <InsightCard title="Compliance Follow-ups">
          <p className="text-2xl font-bold text-surface-900">{metrics.complianceFollowups}</p>
          <p className="text-xs text-surface-500 mt-1">
            {complianceTasks.filter((t) => !t.overdue).length} due within 7 days · {complianceTasks.filter((t) => t.overdue).length} overdue
          </p>
        </InsightCard>
        <InsightCard title="Onboarding Progress">
          <div className="h-2 rounded-full bg-surface-100 overflow-hidden flex mb-2">
            <div className="h-full bg-success-500" style={{ width: `${(onboarding.completed / onboardingTotal) * 100}%` }} />
            <div className="h-full bg-brand-500" style={{ width: `${(onboarding.inProgress / onboardingTotal) * 100}%` }} />
          </div>
          <ul className="text-xs space-y-1">
            <li className="flex justify-between"><span className="text-surface-600">Completed</span><span className="font-semibold">{onboarding.completed}</span></li>
            <li className="flex justify-between"><span className="text-surface-600">In Progress</span><span className="font-semibold">{onboarding.inProgress}</span></li>
            <li className="flex justify-between"><span className="text-surface-600">Not Started</span><span className="font-semibold">{onboarding.notStarted}</span></li>
          </ul>
        </InsightCard>
        <InsightCard title="Recently Updated Suppliers">
          <ul className="space-y-2">
            {recentSuppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <Link href={`/event-manager/suppliers/${s.id}`} className="text-brand-600 hover:underline truncate">{s.name}</Link>
                <span className="text-xs text-surface-400 shrink-0">{formatDate(s.dueAt)}</span>
              </li>
            ))}
            {recentSuppliers.length === 0 && <p className="text-xs text-surface-400">No supplier activity yet.</p>}
          </ul>
          <Link href="/event-manager/suppliers" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            View all suppliers →
          </Link>
        </InsightCard>
      </div>
    </div>
  );
}
