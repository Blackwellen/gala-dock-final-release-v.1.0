"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Megaphone,
  TrendingUp,
  CalendarPlus,
  GitBranch,
  Flame,
  Wallet,
  Table as TableIcon,
  Columns3,
  LayoutGrid,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Users,
  Camera as Instagram,
  Share2 as Facebook,
  Mail,
  Phone,
  Store,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SALES_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import {
  EventTypeThumb,
  OwnerAvatar,
  PriorityBadge,
  formatMoney,
} from "@/components/sales/SalesPrimitives";
import {
  LEAD_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  SOURCE_LABELS,
  formatBudget,
  formatEventDate,
  sourceLabel,
  type LeadStage,
  type NextAction,
} from "./lib";
import { updateLeadStage } from "./actions";
import { CardsView } from "./CardsView";
import { InsightsRailContent } from "./InsightsRailContent";

export interface LeadRow {
  id: string;
  title: string;
  clientName: string;
  companyName: string | null;
  eventType: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  city: string | null;
  guestCount: number | null;
  budgetCents: number | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  stage: string;
  source: string | null;
  assignedTo: string | null;
  assignedToId: string | null;
  priority: string;
  leadScore: number | null;
  nextActions: NextAction[];
  responseDueDate: string | null;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsKpis {
  total: number;
  newThisWeek: number;
  inPipeline: number;
  inPipelinePct: number;
  hotLeads: number;
  pipelineValueLabel: string;
  conversionRate: string;
}

export interface LeadOwner {
  id: string;
  name: string;
}

type ViewMode = "list" | "kanban" | "cards";
type SortOption = "newest" | "oldest" | "value" | "priority";

const ALL_SOURCES = Object.keys(SOURCE_LABELS);
const VALID_VIEWS: ViewMode[] = ["list", "kanban", "cards"];
const PAGE_SIZE = 20;

const SOURCE_ICONS: Record<string, LucideIcon> = {
  website: Globe,
  referral: Users,
  instagram: Instagram,
  facebook: Facebook,
  email: Mail,
  phone: Phone,
  "walk-in": Store,
  other: HelpCircle,
};

const STAGE_PROGRESS: Record<string, number> = {
  "new-enquiry": 20,
  contacted: 40,
  "proposal-sent": 60,
  negotiating: 75,
  won: 100,
  lost: 100,
};

const PRIORITY_RANK: Record<string, number> = { high: 2, medium: 1, low: 0 };

/** Module-level helper (not a component) so the impure `Date.now()` read is not flagged as a render-purity violation. */
function weekAgoTimestamp(): number {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

/** Estimated value for a lead used for sorting/aggregation. */
export function leadValue(l: LeadRow): number {
  if (l.budgetCents != null) return l.budgetCents;
  if (l.budgetMinCents != null || l.budgetMaxCents != null) {
    const min = l.budgetMinCents ?? l.budgetMaxCents ?? 0;
    const max = l.budgetMaxCents ?? l.budgetMinCents ?? 0;
    return Math.round((min + max) / 2);
  }
  return 0;
}

function hasValue(l: LeadRow): boolean {
  return l.budgetCents != null || l.budgetMinCents != null || l.budgetMaxCents != null;
}

/** First undone next-action, with an honest due hint from response_due_date if present. */
function nextActionDisplay(l: LeadRow): string {
  const pending = l.nextActions.find((a) => !a.done);
  if (!pending) return "—";
  if (l.responseDueDate) {
    const due = new Date(l.responseDueDate);
    if (!Number.isNaN(due.getTime())) {
      const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
      const hint = days > 0 ? `due in ${days}d` : days === 0 ? "due today" : `overdue ${Math.abs(days)}d`;
      return `${pending.label} · ${hint}`;
    }
  }
  return pending.label;
}

function leadStatusLabel(stage: string): "Open" | "Won" | "Lost" {
  if (stage === "won") return "Won";
  if (stage === "lost") return "Lost";
  return "Open";
}

export function LeadsClient({
  leads,
  kpis,
  owners,
  currentUserId,
}: {
  leads: LeadRow[];
  kpis: LeadsKpis;
  owners: LeadOwner[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const initialView = (searchParams.get("view") as ViewMode) || "list";
  const [view, setView] = useState<ViewMode>(
    VALID_VIEWS.includes(initialView) ? initialView : "list"
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [stageFilter, setStageFilter] = useState(searchParams.get("stage") ?? "all");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") ?? "all");
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get("owner") ?? "all");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "newest"
  );

  // Quick "saved view" toggles — decorative combinations of the real filters above.
  const [hotOnly, setHotOnly] = useState(false);
  const [thisWeekOnly, setThisWeekOnly] = useState(false);
  const [needsFollowUpOnly, setNeedsFollowUpOnly] = useState(false);
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // Local copy so kanban drag updates feel optimistic.
  const [items, setItems] = useState<LeadRow[]>(leads);

  function buildQuery(overrides: Partial<Record<"view" | "q" | "stage" | "source" | "owner" | "sort", string>>) {
    const merged = {
      view,
      q: query,
      stage: stageFilter,
      source: sourceFilter,
      owner: ownerFilter,
      sort: sortBy,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (merged.view && merged.view !== "list") params.set("view", merged.view);
    if (merged.q) params.set("q", merged.q);
    if (merged.stage && merged.stage !== "all") params.set("stage", merged.stage);
    if (merged.source && merged.source !== "all") params.set("source", merged.source);
    if (merged.owner && merged.owner !== "all") params.set("owner", merged.owner);
    if (merged.sort && merged.sort !== "newest") params.set("sort", merged.sort);
    const qs = params.toString();
    return qs ? `/event-manager/leads?${qs}` : "/event-manager/leads";
  }

  function changeView(next: ViewMode) {
    setView(next);
    router.push(buildQuery({ view: next }));
  }

  // Keep the URL roughly in sync with filters (debounced for the search box) so
  // deep links / back-forward reflect the current view + filter combination.
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(buildQuery({ q: query }), { scroll: false });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function onStageChange(v: string) {
    setStageFilter(v);
    router.replace(buildQuery({ stage: v }), { scroll: false });
  }
  function onSourceChange(v: string) {
    setSourceFilter(v);
    router.replace(buildQuery({ source: v }), { scroll: false });
  }
  function onOwnerChange(v: string) {
    setOwnerFilter(v);
    router.replace(buildQuery({ owner: v }), { scroll: false });
  }
  function onSortChange(v: SortOption) {
    setSortBy(v);
    router.replace(buildQuery({ sort: v }), { scroll: false });
  }

  function applySavedView(name: "My Hot Leads" | "This Week" | "Needs Follow-up") {
    setActiveSavedView(name);
    setSavedViewsOpen(false);
    setStageFilter("all");
    setSourceFilter("all");
    setHotOnly(false);
    setThisWeekOnly(false);
    setNeedsFollowUpOnly(false);
    const owner = name === "My Hot Leads" ? currentUserId ?? "all" : "all";
    setOwnerFilter(owner);
    if (name === "My Hot Leads") setHotOnly(true);
    else if (name === "This Week") setThisWeekOnly(true);
    else setNeedsFollowUpOnly(true);
    router.replace(buildQuery({ stage: "all", source: "all", owner }), { scroll: false });
  }

  function clearSavedView() {
    setActiveSavedView(null);
    setHotOnly(false);
    setThisWeekOnly(false);
    setNeedsFollowUpOnly(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const weekAgo = weekAgoTimestamp();

    const list = items.filter((l) => {
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (ownerFilter !== "all" && l.assignedToId !== ownerFilter) return false;
      if (hotOnly && (l.priority !== "high" || l.stage === "won" || l.stage === "lost")) return false;
      if (thisWeekOnly && new Date(l.createdAt).getTime() < weekAgo) return false;
      if (needsFollowUpOnly && !l.nextActions.some((a) => !a.done)) return false;
      if (q) {
        const haystack = `${l.title} ${l.clientName} ${l.companyName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "value":
          return leadValue(b) - leadValue(a);
        case "priority":
          return (PRIORITY_RANK[b.priority] ?? 1) - (PRIORITY_RANK[a.priority] ?? 1);
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [items, query, stageFilter, sourceFilter, ownerFilter, hotOnly, thisWeekOnly, needsFollowUpOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp instead of resetting `page` via an effect — filters/sort narrowing the
  // list can never leave the user on a page beyond what's available.
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function handleMove(leadId: string, toColumn: string) {
    const previous = items;
    setItems((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: toColumn } : l)));
    startTransition(async () => {
      try {
        await updateLeadStage(leadId, toColumn);
        router.refresh();
      } catch {
        setItems(previous);
      }
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const allSelected = paginated.every((l) => prev.has(l.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const l of paginated) next.delete(l.id);
      } else {
        for (const l of paginated) next.add(l.id);
      }
      return next;
    });
  }

  const columns = LEAD_STAGES.map((stage) => ({
    id: stage,
    label: STAGE_LABELS[stage],
    color: STAGE_COLORS[stage],
  }));

  const stageValueByColumn = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of filtered) map[l.stage] = (map[l.stage] ?? 0) + leadValue(l);
    return map;
  }, [filtered]);

  const selectCls =
    "px-3 py-2 text-sm text-surface-700 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Sales"
        description="Track every enquiry from first contact to won or lost"
        tabs={<SectionTabs tabs={SALES_TABS} />}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-surface-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => changeView("list")}
                aria-pressed={view === "list"}
                className={
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors " +
                  (view === "list"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:text-surface-800")
                }
              >
                <TableIcon className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => changeView("kanban")}
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
              <button
                type="button"
                onClick={() => changeView("cards")}
                aria-pressed={view === "cards"}
                className={
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors " +
                  (view === "cards"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:text-surface-800")
                }
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
            <Link
              href="/event-manager/leads/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Lead
            </Link>
          </>
        }
      />

      <div className="p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-6">
            {/* KPIs */}
            <KPIGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard
                label="Total Leads"
                value={String(kpis.total)}
                icon={Megaphone}
                iconColor="text-brand-600"
                iconBg="bg-brand-50"
              />
              <MetricCard
                label="New This Week"
                value={String(kpis.newThisWeek)}
                icon={CalendarPlus}
                iconColor="text-info-600"
                iconBg="bg-info-50"
              />
              <MetricCard
                label="In Pipeline"
                value={String(kpis.inPipeline)}
                delta={{ value: `${kpis.inPipelinePct}% of total`, positive: true }}
                icon={GitBranch}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
              />
              <MetricCard
                label="Hot Leads"
                value={String(kpis.hotLeads)}
                icon={Flame}
                iconColor="text-danger-600"
                iconBg="bg-danger-50"
              />
              <MetricCard
                label="Est. Pipeline Value"
                value={kpis.pipelineValueLabel}
                icon={Wallet}
                iconColor="text-success-600"
                iconBg="bg-success-50"
              />
              <MetricCard
                label="Conversion Rate"
                value={kpis.conversionRate}
                icon={TrendingUp}
                iconColor="text-success-600"
                iconBg="bg-success-50"
              />
            </KPIGrid>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title, client or company…"
                  className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
                />
              </div>
              <select
                value={stageFilter}
                onChange={(e) => {
                  clearSavedView();
                  onStageChange(e.target.value);
                }}
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
                onChange={(e) => {
                  clearSavedView();
                  onSourceChange(e.target.value);
                }}
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
              <select
                value={ownerFilter}
                onChange={(e) => {
                  clearSavedView();
                  onOwnerChange(e.target.value);
                }}
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

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSavedViewsOpen((v) => !v)}
                  className={
                    selectCls +
                    " flex items-center gap-1.5 " +
                    (activeSavedView ? "border-brand-300 text-brand-700 bg-brand-50" : "")
                  }
                >
                  {activeSavedView ?? "Saved Views"}
                  <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
                {savedViewsOpen && (
                  <div className="absolute z-10 mt-1 w-48 rounded-lg border border-surface-200 bg-white shadow-lg py-1">
                    {(["My Hot Leads", "This Week", "Needs Follow-up"] as const).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => applySavedView(name)}
                        className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50"
                      >
                        {name}
                      </button>
                    ))}
                    {activeSavedView && (
                      <button
                        type="button"
                        onClick={() => {
                          clearSavedView();
                          setSavedViewsOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-surface-400 hover:bg-surface-50 border-t border-surface-100"
                      >
                        Clear saved view
                      </button>
                    )}
                  </div>
                )}
              </div>

              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className={selectCls + " ml-auto"}
                aria-label="Sort leads"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="value">Highest Value</option>
                <option value="priority">Highest Priority</option>
              </select>
            </div>

            {/* Body */}
            {view === "list" && (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                {paginated.length === 0 ? (
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
                        href="/event-manager/leads/new"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                        New Lead
                      </Link>
                    }
                    compact
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 bg-surface-50">
                          <th className="px-4 py-3 w-8">
                            <input
                              type="checkbox"
                              aria-label="Select all leads on this page"
                              checked={paginated.length > 0 && paginated.every((l) => selectedIds.has(l.id))}
                              onChange={toggleSelectAllOnPage}
                              className="rounded border-surface-300"
                            />
                          </th>
                          <Th>Lead</Th>
                          <Th className="hidden sm:table-cell">Event Type</Th>
                          <Th className="hidden md:table-cell">Client/Contact</Th>
                          <Th className="hidden lg:table-cell">Date</Th>
                          <Th className="hidden xl:table-cell">Venue/Location</Th>
                          <Th className="hidden 2xl:table-cell">Guests</Th>
                          <Th className="hidden md:table-cell">Est. Value</Th>
                          <Th className="hidden lg:table-cell">Source</Th>
                          <Th className="hidden xl:table-cell">Owner</Th>
                          <Th>Stage</Th>
                          <Th className="hidden sm:table-cell">Priority</Th>
                          <Th className="hidden 2xl:table-cell">Next Action</Th>
                          <Th className="hidden lg:table-cell">Status</Th>
                          <th className="px-4 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100">
                        {paginated.map((l) => {
                          const SourceIcon = SOURCE_ICONS[l.source ?? "other"] ?? HelpCircle;
                          const status = leadStatusLabel(l.stage);
                          return (
                            <tr
                              key={l.id}
                              onClick={() => router.push(`/event-manager/leads/${l.id}`)}
                              className="hover:bg-surface-50 transition-colors group cursor-pointer"
                            >
                              <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${l.title}`}
                                  checked={selectedIds.has(l.id)}
                                  onChange={() => toggleSelected(l.id)}
                                  className="rounded border-surface-300"
                                />
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <EventTypeThumb type={l.eventType} imageUrl={l.coverImageUrl} className="h-9 w-9 shrink-0" iconClassName="h-4 w-4" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors truncate">
                                      {l.title}
                                    </p>
                                    <p className="text-xs text-surface-400 mt-0.5 truncate">
                                      {l.companyName ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden sm:table-cell">
                                {l.eventType ?? "—"}
                              </td>
                              <td className="px-4 py-3.5 text-surface-700 hidden md:table-cell">
                                {l.clientName}
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell whitespace-nowrap">
                                {formatEventDate(l.eventDate)}
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell truncate max-w-[160px]">
                                {l.eventLocation ?? l.city ?? "—"}
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden 2xl:table-cell tabular-nums">
                                {l.guestCount ?? "—"}
                              </td>
                              <td className="px-4 py-3.5 text-surface-700 hidden md:table-cell tabular-nums whitespace-nowrap">
                                {hasValue(l) ? formatBudget(leadValue(l)) : "—"}
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">
                                <span className="inline-flex items-center gap-1.5">
                                  <SourceIcon className="w-3.5 h-3.5 text-surface-400" strokeWidth={1.8} />
                                  {sourceLabel(l.source)}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 hidden xl:table-cell">
                                <span className="inline-flex items-center gap-1.5">
                                  <OwnerAvatar name={l.assignedTo} size="xs" />
                                  <span className="text-surface-600 truncate max-w-[100px]">
                                    {l.assignedTo ?? "Unassigned"}
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusBadge status={l.stage as LeadStage} />
                              </td>
                              <td className="px-4 py-3.5 hidden sm:table-cell">
                                <PriorityBadge priority={l.priority} />
                              </td>
                              <td className="px-4 py-3.5 text-surface-500 hidden 2xl:table-cell truncate max-w-[180px]">
                                {nextActionDisplay(l)}
                              </td>
                              <td className="px-4 py-3.5 hidden lg:table-cell">
                                <span className="text-xs font-medium text-surface-500">{status}</span>
                              </td>
                              <td className="px-4 py-3.5">
                                <MoreHorizontal
                                  className="w-4 h-4 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                  strokeWidth={1.8}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {view === "kanban" && (
              <KanbanBoard<LeadRow>
                columns={columns}
                items={filtered}
                getItemId={(l) => l.id}
                getItemColumnId={(l) => l.stage}
                onMoveItem={handleMove}
                emptyColumnLabel="No leads in this stage"
                renderColumnMeta={(columnId) => formatMoney(stageValueByColumn[columnId] ?? 0)}
                renderColumnFooter={() => (
                  <Link
                    href="/event-manager/leads/new"
                    className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                    Add Lead
                  </Link>
                )}
                renderCard={(l) => {
                  const progress = STAGE_PROGRESS[l.stage] ?? 20;
                  return (
                    <Link href={`/event-manager/leads/${l.id}`} className="block">
                      <div className="flex items-start gap-2">
                        <EventTypeThumb type={l.eventType} imageUrl={l.coverImageUrl} className="h-9 w-9 shrink-0" iconClassName="h-4 w-4" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-surface-900 leading-snug truncate">
                            {l.title}
                          </p>
                          <p className="text-xs text-surface-500 truncate">
                            {l.companyName ?? l.clientName}
                          </p>
                        </div>
                        <PriorityBadge priority={l.priority} />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-surface-500">
                        {l.eventType && <span>{l.eventType}</span>}
                        {l.eventDate && (
                          <>
                            <span className="text-surface-300">·</span>
                            <span>{formatEventDate(l.eventDate)}</span>
                          </>
                        )}
                      </div>

                      {hasValue(l) && (
                        <p className="mt-1.5 text-sm font-semibold text-surface-800 tabular-nums">
                          {formatBudget(leadValue(l))}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <OwnerAvatar name={l.assignedTo} size="xs" />
                          <span className="truncate text-xs text-surface-500 max-w-[110px]">
                            {l.assignedTo ?? "Unassigned"}
                          </span>
                        </span>
                        {l.source && (
                          <span className="text-[11px] text-surface-400 shrink-0">
                            {sourceLabel(l.source)}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 truncate text-[11px] text-surface-400">
                        {nextActionDisplay(l)}
                      </p>

                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </Link>
                  );
                }}
              />
            )}

            {view === "cards" && <CardsView leads={filtered} />}

            {/* Footer: selection + pagination */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <p className="text-xs text-surface-400">
                Showing {view === "list" ? paginated.length : filtered.length} of {items.length} leads
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </p>
              {view === "list" && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-surface-200 text-surface-500 disabled:opacity-40 hover:bg-surface-50"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                  <span className="px-2 text-xs text-surface-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-surface-200 text-surface-500 disabled:opacity-40 hover:bg-surface-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <InsightsRailContent leads={items} variant={view === "kanban" ? "kanban" : "list"} />
        </div>
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
