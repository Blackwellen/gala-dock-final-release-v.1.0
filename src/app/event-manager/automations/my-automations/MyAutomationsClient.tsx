"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Search,
  MoreHorizontal,
  Play,
  PauseCircle,
  Archive as ArchiveIcon,
  Copy,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { cn, formatRelative } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/ui/FinanceCharts";
import type { AutomationRow, AutomationStatus } from "@/lib/automations/data";
import { pauseAutomation, activateAutomation, archiveAutomation, duplicateAutomation } from "../actions";
import { bulkPauseAutomations, bulkActivateAutomations, bulkArchiveAutomations } from "./actions";

export interface AutomationTableRow extends AutomationRow {
  successRate: number | null;
  lastRunAt: string | null;
  runCount: number;
  ownerName: string;
}

type BadgeStatus =
  | "draft" | "active" | "paused" | "archived" | "approved" | "published" | "invalid"
  | "review-requested" | "inactive";

function automationStatusBadge(status: AutomationStatus): BadgeStatus {
  switch (status) {
    case "review_requested":
      return "review-requested";
    case "disabled":
      return "inactive";
    default:
      return status;
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "review_requested", label: "Review requested" },
];

export function MyAutomationsClient({
  rows,
  modules,
  status,
  moduleFilter,
  search,
  page,
  totalPages,
  total,
  recentlyEdited,
  draftsNeedingReview,
  topPerforming,
}: {
  rows: AutomationTableRow[];
  modules: string[];
  status: string;
  moduleFilter: string;
  search: string;
  page: number;
  totalPages: number;
  total: number;
  recentlyEdited: AutomationRow[];
  draftsNeedingReview: AutomationRow[];
  topPerforming: (AutomationRow & { successRate: number | null })[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      if (key !== "page") params.delete("page");
      router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => setParam("search", searchInput), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  const hasActiveFilters = status !== "all" || moduleFilter !== "all" || Boolean(search);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function runBulk(action: (ids: string[]) => Promise<{ ok: boolean; error?: string }>) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      const res = await action(ids);
      if (!res.ok) {
        alert(res.error ?? "Bulk action failed");
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function exportRows(list: AutomationTableRow[], filename: string) {
    const data = list.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      module: r.module,
      trigger: r.triggerLabel,
      action: r.actionLabel,
      enabled: r.enabled,
      fireCount: r.fireCount,
      successRate: r.successRate,
      lastRunAt: r.lastRunAt,
      updatedAt: r.updatedAt,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search automations…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
            className="px-3 py-2 text-sm border border-surface-200 rounded-lg text-surface-700 bg-white"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={moduleFilter}
            onChange={(e) => setParam("module", e.target.value)}
            className="px-3 py-2 text-sm border border-surface-200 rounded-lg text-surface-700 bg-white capitalize"
          >
            <option value="all">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m} className="capitalize">{m}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                router.push(pathname);
              }}
              className="px-3 py-2 text-sm font-medium text-surface-500 hover:text-surface-700"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-brand-700">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button disabled={bulkPending} onClick={() => runBulk(bulkActivateAutomations)} className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60">
                Activate
              </button>
              <button disabled={bulkPending} onClick={() => runBulk(bulkPauseAutomations)} className="px-3 py-1.5 text-xs font-semibold text-surface-700 border border-surface-200 bg-white rounded-lg hover:bg-surface-50 disabled:opacity-60">
                Pause
              </button>
              <button
                disabled={bulkPending}
                onClick={() => {
                  if (confirm(`Archive ${selected.size} automation(s)?`)) runBulk(bulkArchiveAutomations);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-danger-600 border border-danger-200 bg-white rounded-lg hover:bg-danger-50 disabled:opacity-60"
              >
                Archive
              </button>
              <button
                onClick={() => exportRows(rows.filter((r) => selected.has(r.id)), `automations-export-${new Date().toISOString().slice(0, 10)}.json`)}
                className="px-3 py-1.5 text-xs font-semibold text-surface-700 border border-surface-200 bg-white rounded-lg hover:bg-surface-50 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No automations match your filters"
              description="Try clearing filters or search, or create a new automation from a recipe."
              compact
              action={
                <Link href="/event-manager/automations/recipes" className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                  Browse recipes
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-surface-300" aria-label="Select all automations" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Automation</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Module</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Trigger</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Last run</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Success rate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Next run</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Last edited by</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="rounded border-surface-300" aria-label={`Select ${r.name}`} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/event-manager/automations/builder/${r.id}`} className="font-semibold text-surface-900 hover:text-brand-600">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs px-2 py-0.5 rounded-full bg-surface-100 text-surface-600">{r.module}</span>
                      </td>
                      <td className="px-4 py-3 text-surface-600 text-xs">{r.triggerLabel}</td>
                      <td className="px-4 py-3"><StatusBadge status={automationStatusBadge(r.status)} /></td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{r.lastRunAt ? formatRelative(r.lastRunAt) : "Never run"}</td>
                      <td className="px-4 py-3 text-xs font-medium tabular-nums">{r.successRate !== null ? `${r.successRate}%` : "—"}</td>
                      <td className="px-4 py-3 text-surface-400 text-xs">—</td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{r.ownerName}</td>
                      <td className="px-4 py-3"><RowActions automation={r} onExport={() => exportRows([r], `${r.name.replace(/\s+/g, "-").toLowerCase()}.json`)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-surface-500">Page {page} of {totalPages} · {total} automations</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="p-1.5 rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="p-1.5 rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right rail */}
      <aside className="w-full xl:w-[320px] shrink-0 space-y-4">
        <InsightCard title="Recently edited">
          {recentlyEdited.length === 0 ? (
            <p className="text-xs text-surface-400">Nothing edited yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentlyEdited.map((a) => (
                <li key={a.id}>
                  <Link href={`/event-manager/automations/builder/${a.id}`} className="flex items-center justify-between gap-2 group">
                    <span className="text-xs font-medium text-surface-700 group-hover:text-brand-600 truncate">{a.name}</span>
                    <span className="text-[10px] text-surface-400 shrink-0">{formatRelative(a.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard title="Drafts needing review">
          {draftsNeedingReview.length === 0 ? (
            <p className="text-xs text-surface-400">No drafts waiting on review.</p>
          ) : (
            <ul className="space-y-2.5">
              {draftsNeedingReview.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-surface-700 truncate">{a.name}</span>
                  <Link href={`/event-manager/automations/builder/${a.id}`} className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 shrink-0 px-2 py-1 rounded-md bg-brand-50">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard title="Top performing automations">
          {topPerforming.length === 0 ? (
            <p className="text-xs text-surface-400">No run history yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {topPerforming.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <Link href={`/event-manager/automations/builder/${a.id}`} className="text-xs font-medium text-surface-700 hover:text-brand-600 truncate">{a.name}</Link>
                  <span className={cn("text-[10px] font-semibold tabular-nums shrink-0", (a.successRate ?? 0) >= 90 ? "text-success-600" : (a.successRate ?? 0) >= 70 ? "text-warning-600" : "text-danger-600")}>
                    {a.successRate}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>
      </aside>
    </div>
  );
}

function RowActions({ automation, onExport }: { automation: AutomationTableRow; onExport: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setOpen(false);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        alert(res.error ?? "Action failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        aria-label={`More actions for ${automation.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-8 z-40 w-52 bg-white border border-surface-200 rounded-lg shadow-lg py-1">
            <Link
              href={`/event-manager/automations/builder/${automation.id}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => run(() => duplicateAutomation(automation.id))}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
            {automation.status === "active" ? (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(() => pauseAutomation(automation.id))}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
              >
                <PauseCircle className="w-3.5 h-3.5" /> Pause
              </button>
            ) : automation.status !== "archived" ? (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(() => activateAutomation(automation.id))}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> Activate
              </button>
            ) : null}
            {automation.status !== "archived" && (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  if (confirm(`Archive "${automation.name}"?`)) run(() => archiveAutomation(automation.id));
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-50"
              >
                <ArchiveIcon className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50"
            >
              <Download className="w-3.5 h-3.5" /> Export definition
            </button>
            <Link
              href={`/event-manager/automations/runs?automationId=${automation.id}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50"
            >
              <TrendingUp className="w-3.5 h-3.5" /> View runs
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
