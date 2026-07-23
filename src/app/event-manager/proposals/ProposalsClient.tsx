"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, FileText, Search, Table as TableIcon, LayoutGrid, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SALES_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Proposal, ProposalStatus } from "@/lib/supabase/types";
import { formatPence } from "./_lib/proposals";
import { ProposalsTable } from "./_components/ProposalsTable";
import { ProposalCardGrid } from "./_components/ProposalCardGrid";
import { ProposalsInsightsRail } from "./_components/ProposalsInsightsRail";
import {
  effectiveStatus,
  sortProposals,
  withinDateRange,
  isExpiringSoon,
  SORT_OPTIONS,
  DATE_RANGE_OPTIONS,
  SAVED_VIEWS,
  type SortOption,
  type DateRangePreset,
} from "./_components/proposalHelpers";

export interface ProposalsKpis {
  total: number;
  sentThisWeek: number;
  awaiting: number;
  conversionRate: number;
  totalValue: number;
  avgMarginPct: number | null;
}

export interface ProposalOwner {
  id: string;
  name: string;
}

const STATUS_FILTERS: { id: ProposalStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed" },
  { id: "signed", label: "Signed" },
  { id: "declined", label: "Declined" },
  { id: "converted", label: "Converted" },
  { id: "expired", label: "Expired" },
];

const selectCls =
  "rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function ProposalsClient({
  proposals,
  kpis,
  owners,
}: {
  proposals: Proposal[];
  kpis: ProposalsKpis;
  owners: ProposalOwner[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "cards" ? "cards" : "list";

  const ownerNameById = useMemo(() => new Map(owners.map((o) => [o.id, o.name])), [owners]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of proposals) if (p.event_type) set.add(p.event_type);
    return Array.from(set).sort();
  }, [proposals]);

  function setView(next: "list" | "cards") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "list") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function applySavedView(viewId: string) {
    const preset = SAVED_VIEWS.find((v) => v.id === viewId);
    setSavedViewsOpen(false);
    if (!preset) return;
    setStatusFilter(preset.apply.status ?? "all");
    setExpiringSoonOnly(Boolean(preset.apply.expiringSoon));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = proposals.filter((p) => {
      const eff = effectiveStatus(p);
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      if (typeFilter !== "all" && p.event_type !== typeFilter) return false;
      if (ownerFilter !== "all" && p.owner_id !== ownerFilter) return false;
      if (!withinDateRange(p, dateRange)) return false;
      if (expiringSoonOnly && !isExpiringSoon(p, 30)) return false;
      if (q && !p.title.toLowerCase().includes(q) && !p.client_name.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortProposals(rows, sort);
  }, [proposals, query, statusFilter, typeFilter, ownerFilter, dateRange, expiringSoonOnly, sort]);

  return (
    <div className="flex min-h-full flex-col bg-surface-50">
      <PageHeader
        title="Sales"
        description="Draft, send and track client proposals through to signature"
        tabs={<SectionTabs tabs={SALES_TABS} />}
        actions={
          <Link
            href="/event-manager/proposals/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New Proposal
          </Link>
        }
      />

      <div className="flex-1 space-y-5 p-6">
        <KPIGrid className="lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Proposals" value={kpis.total} icon={FileText} />
          <MetricCard
            label="Sent This Week"
            value={kpis.sentThisWeek}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            icon={FileText}
          />
          <MetricCard
            label="Awaiting Signature"
            value={kpis.awaiting}
            iconBg="bg-info-50"
            iconColor="text-info-600"
            icon={FileText}
          />
          <MetricCard
            label="Conversion Rate"
            value={`${kpis.conversionRate}%`}
            iconBg="bg-brand-50"
            iconColor="text-brand-600"
            icon={FileText}
          />
          <MetricCard
            label="Proposal Value"
            value={formatPence(kpis.totalValue)}
            iconBg="bg-success-50"
            iconColor="text-success-600"
            icon={FileText}
          />
          <MetricCard
            label="Avg. Target Margin"
            value={kpis.avgMarginPct !== null ? `${kpis.avgMarginPct}%` : "—"}
            iconBg="bg-warning-50"
            iconColor="text-warning-600"
            icon={FileText}
          />
        </KPIGrid>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-200 bg-white p-3 shadow-card">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or client"
              className="w-52 rounded-lg border border-surface-200 py-1.5 pl-8 pr-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProposalStatus | "all")}
            className={selectCls}
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by event type"
          >
            <option value="all">All Types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by owner"
          >
            <option value="all">All Owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
            className={selectCls}
            aria-label="Filter by date range"
          >
            {DATE_RANGE_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSavedViewsOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-50"
            >
              Saved Views
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {savedViewsOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-surface-200 bg-white py-1 shadow-lg">
                {SAVED_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => applySavedView(v.id)}
                    className="block w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className={selectCls}
            aria-label="Sort proposals"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center rounded-lg border border-surface-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (view === "list" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:text-surface-800")
              }
            >
              <TableIcon className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setView("cards")}
              aria-pressed={view === "cards"}
              className={
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (view === "cards" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:text-surface-800")
              }
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="min-w-0 flex-1">
            {proposals.length === 0 ? (
              <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-card">
                <EmptyState
                  icon={FileText}
                  title="No proposals yet"
                  description="Create your first proposal to send to a client and capture an e-signature."
                  action={
                    <Link
                      href="/event-manager/proposals/new"
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      <Plus className="h-4 w-4" />
                      New Proposal
                    </Link>
                  }
                />
              </div>
            ) : view === "list" ? (
              <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-card">
                <ProposalsTable proposals={filtered} ownerNameById={ownerNameById} />
              </div>
            ) : (
              <ProposalCardGrid proposals={filtered} ownerNameById={ownerNameById} />
            )}
          </div>

          <ProposalsInsightsRail proposals={proposals} />
        </div>
      </div>
    </div>
  );
}
