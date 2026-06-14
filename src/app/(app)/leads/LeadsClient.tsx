"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Megaphone,
  TrendingUp,
  CalendarPlus,
  GitBranch,
  Table as TableIcon,
  Columns3,
  MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import {
  LEAD_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  SOURCE_LABELS,
  formatBudget,
  formatEventDate,
  sourceLabel,
  type LeadStage,
} from "./lib";
import { updateLeadStage } from "./actions";

export interface LeadRow {
  id: string;
  title: string;
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  budgetCents: number | null;
  stage: string;
  source: string | null;
  assignedTo: string | null;
  createdAt: string;
}

export interface LeadsKpis {
  total: number;
  thisMonth: number;
  inPipeline: number;
  conversionRate: string;
}

const ALL_SOURCES = Object.keys(SOURCE_LABELS);

export function LeadsClient({
  leads,
  kpis,
}: {
  leads: LeadRow[];
  kpis: LeadsKpis;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [view, setView] = useState<"table" | "kanban">("table");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Local copy so kanban drag updates feel optimistic.
  const [items, setItems] = useState<LeadRow[]>(leads);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((l) => {
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (q) {
        return (
          l.title.toLowerCase().includes(q) ||
          l.clientName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, query, stageFilter, sourceFilter]);

  function handleMove(leadId: string, toColumn: string) {
    const previous = items;
    // Optimistic update.
    setItems((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: toColumn } : l))
    );
    startTransition(async () => {
      try {
        await updateLeadStage(leadId, toColumn);
        router.refresh();
      } catch {
        setItems(previous); // revert on error
      }
    });
  }

  const columns = LEAD_STAGES.map((stage) => ({
    id: stage,
    label: STAGE_LABELS[stage],
    color: STAGE_COLORS[stage],
  }));

  const selectCls =
    "px-3 py-2 text-sm text-surface-700 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads"
        description="Track every enquiry from first contact to won or lost"
        actions={
          <>
            <div className="flex items-center rounded-lg border border-surface-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setView("table")}
                aria-pressed={view === "table"}
                className={
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors " +
                  (view === "table"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:text-surface-800")
                }
              >
                <TableIcon className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                aria-pressed={view === "kanban"}
                className={
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors " +
                  (view === "kanban"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:text-surface-800")
                }
              >
                <Columns3 className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>
            <Link
              href="/leads/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Lead
            </Link>
          </>
        }
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        {/* KPIs */}
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Leads"
            value={String(kpis.total)}
            icon={Megaphone}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="This Month"
            value={String(kpis.thisMonth)}
            icon={CalendarPlus}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="In Pipeline"
            value={String(kpis.inPipeline)}
            icon={GitBranch}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
          <MetricCard
            label="Conversion Rate"
            value={kpis.conversionRate}
            icon={TrendingUp}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
        </KPIGrid>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or client…"
              className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by stage"
          >
            <option value="all">All Stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by source"
          >
            <option value="all">All Sources</option>
            {ALL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        {view === "table" ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No leads found"
                description={
                  items.length === 0
                    ? "Capture your first enquiry to start building your pipeline."
                    : "Try a different filter or search term."
                }
                action={
                  <Link
                    href="/leads/new"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2.5} />
                    New Lead
                  </Link>
                }
                compact
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <Th>Lead</Th>
                    <Th className="hidden md:table-cell">Event Type</Th>
                    <Th className="hidden lg:table-cell">Event Date</Th>
                    <Th className="hidden md:table-cell">Budget</Th>
                    <Th>Stage</Th>
                    <Th className="hidden lg:table-cell">Source</Th>
                    <Th className="hidden xl:table-cell">Assigned</Th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filtered.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className="hover:bg-surface-50 transition-colors group cursor-pointer"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                          {l.title}
                        </p>
                        <p className="text-xs text-surface-400 mt-0.5">{l.clientName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">
                        {l.eventType ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell whitespace-nowrap">
                        {formatEventDate(l.eventDate)}
                      </td>
                      <td className="px-4 py-3.5 text-surface-700 hidden md:table-cell tabular-nums whitespace-nowrap">
                        {formatBudget(l.budgetCents)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={l.stage as LeadStage} />
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">
                        {sourceLabel(l.source)}
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell">
                        {l.assignedTo ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <MoreHorizontal
                          className="w-4 h-4 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          strokeWidth={1.8}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <KanbanBoard<LeadRow>
            columns={columns}
            items={filtered}
            getItemId={(l) => l.id}
            getItemColumnId={(l) => l.stage}
            onMoveItem={handleMove}
            emptyColumnLabel="No leads in this stage"
            renderCard={(l) => (
              <Link href={`/leads/${l.id}`} className="block">
                <p className="font-semibold text-sm text-surface-900 leading-snug">
                  {l.title}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">{l.clientName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-surface-500">
                  {l.eventType && <span>{l.eventType}</span>}
                  {l.eventDate && (
                    <>
                      <span className="text-surface-300">·</span>
                      <span>{formatEventDate(l.eventDate)}</span>
                    </>
                  )}
                </div>
                {l.budgetCents !== null && (
                  <p className="mt-1.5 text-sm font-semibold text-surface-800 tabular-nums">
                    {formatBudget(l.budgetCents)}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={l.stage as LeadStage} />
                  {l.source && (
                    <span className="text-[11px] text-surface-400">
                      {sourceLabel(l.source)}
                    </span>
                  )}
                </div>
              </Link>
            )}
          />
        )}

        <p className="text-xs text-surface-400">
          Showing {filtered.length} of {items.length} leads
        </p>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
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
