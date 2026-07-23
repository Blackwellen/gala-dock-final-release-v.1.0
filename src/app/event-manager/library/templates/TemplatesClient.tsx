"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Search, MoreHorizontal, Star, Share2, Copy, Lock, Unlock, Archive, Eye,
  FileText, Image as ImageIcon, Presentation, UtensilsCrossed, Megaphone,
  SignpostBig, CalendarClock, Users, ChevronLeft, ChevronRight, Sparkles,
  Clock, FolderOpen,
} from "lucide-react";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { InsightCard, Donut, BarList, OwnerAvatar, ViewSwitcher } from "../_shared";
import { formatBytes, formatLibDate } from "../library-utils";
import { TEMPLATE_CATEGORIES } from "./actions";
import {
  templateStatus, visibilityLabel, relativeTime, STATUS_TONE_CLASSES,
} from "./template-helpers";
import {
  duplicateTemplate, archiveTemplate, toggleTemplateLock, toggleTemplateFavourite, useTemplate,
} from "./actions";

export interface TemplateRow {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  category: string;
  eventType: string | null;
  variables: string[];
  status: "draft" | "in_review" | "approved";
  mime: string | null;
  sizeBytes: number;
  storagePath: string | null;
  coverUrl: string | null;
  format: string;
  version: number;
  ownerId: string | null;
  ownerName: string;
  visibility: string;
  sharedTeam: string | null;
  useCount: number;
  lastUsedAt: string | null;
  lockedAt: string | null;
  favouritedBy: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
}

export interface EventOption {
  id: string;
  name: string;
  startAt: string | null;
}

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  Flyers: Megaphone,
  Menus: UtensilsCrossed,
  Posters: ImageIcon,
  Decks: Presentation,
  Signage: SignpostBig,
  Schedules: CalendarClock,
  Social: Share2,
  "Guest Packs": Users,
  Documents: FileText,
};

const CATEGORY_BG: Record<string, string> = {
  Flyers: "from-violet-600 to-violet-900",
  Menus: "from-amber-600 to-amber-900",
  Posters: "from-rose-600 to-rose-900",
  Decks: "from-brand-600 to-brand-900",
  Signage: "from-emerald-600 to-emerald-900",
  Schedules: "from-slate-600 to-slate-900",
  Social: "from-sky-600 to-sky-900",
  "Guest Packs": "from-fuchsia-600 to-fuchsia-900",
  Documents: "from-surface-500 to-surface-800",
};

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name (A–Z)" },
  { value: "used", label: "Most used" },
  { value: "oldest", label: "Oldest first" },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const STATUS_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "locked", label: "Locked" },
];

const PAGE_SIZE = 20;

export function TemplatesClient({
  templates, events, currentUserId, view,
}: {
  templates: TemplateRow[];
  events: EventOption[];
  currentUserId: string;
  view: "grid" | "list";
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All categories");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sort, setSort] = useState<SortValue>("updated");
  const [page, setPage] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null);
  const [, startTransition] = useTransition();

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const metrics = useMemo(() => {
    const total = templates.length;
    const inUse = templates.filter((t) => t.useCount > 0).length;
    const recentlyUpdated = templates.filter((t) => new Date(t.updatedAt).getTime() >= sevenDaysAgo).length;
    const teamShared = templates.filter((t) => t.visibility === "workspace").length;
    const brandTemplates = templates.filter((t) => Boolean(t.lockedAt)).length;
    return { total, inUse, recentlyUpdated, teamShared, brandTemplates };
  }, [templates, sevenDaysAgo]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of templates) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [templates]);

  const eventTypeOptions = useMemo(
    () => Array.from(new Set(templates.map((t) => t.eventType).filter((v): v is string => Boolean(v)))).sort(),
    [templates]
  );
  const formatOptions = useMemo(
    () => Array.from(new Set(templates.map((t) => t.format))).sort(),
    [templates]
  );
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) if (t.ownerId) map.set(t.ownerId, t.ownerName);
    return Array.from(map.entries());
  }, [templates]);

  const filtered = useMemo(() => {
    let list = templates;
    if (category !== "All categories") list = list.filter((t) => t.category === category);
    if (eventTypeFilter !== "all") list = list.filter((t) => t.eventType === eventTypeFilter);
    if (formatFilter !== "all") list = list.filter((t) => t.format === formatFilter);
    if (statusFilter !== "all") {
      list = list.filter((t) => {
        const s = templateStatus(t.lockedAt, { status: t.status });
        return s.tone === statusFilter || (statusFilter === "locked" && Boolean(t.lockedAt));
      });
    }
    if (ownerFilter !== "all") list = list.filter((t) => t.ownerId === ownerFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.eventType ?? "").toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sort === "updated") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sort === "oldest") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sort === "used") sorted.sort((a, b) => b.useCount - a.useCount);
    else if (sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [templates, category, eventTypeFilter, formatFilter, statusFilter, ownerFilter, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedList = view === "list" ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : filtered;

  const topTemplates = useMemo(
    () => [...templates].sort((a, b) => b.useCount - a.useCount).slice(0, 5),
    [templates]
  );
  const recentActivity = useMemo(
    () => [...templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [templates]
  );
  const totalUsage = templates.reduce((sum, t) => sum + t.useCount, 0);
  const categoryDonutSegments = useMemo(
    () =>
      TEMPLATE_CATEGORIES.map((c) => ({ label: c, value: categoryCounts.get(c) ?? 0 })).filter(
        (s) => s.value > 0
      ),
    [categoryCounts]
  );

  function handleDuplicate(id: string) {
    startTransition(async () => { await duplicateTemplate(id); });
    setMenuOpenId(null);
  }
  function handleArchive(id: string) {
    if (!confirm("Archive this template? It will be removed from the library.")) return;
    startTransition(async () => { await archiveTemplate(id); });
    setMenuOpenId(null);
  }
  function handleLockToggle(id: string) {
    startTransition(async () => { await toggleTemplateLock(id); });
    setMenuOpenId(null);
  }
  function handleFavourite(id: string) {
    startTransition(async () => { await toggleTemplateFavourite(id); });
  }

  return (
    <div className="flex-1 p-6">
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          <KPIGrid className="lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Total Templates" value={metrics.total} icon={FolderOpen} iconBg="bg-brand-50" iconColor="text-brand-600" />
            <MetricCard label="In Use" value={metrics.inUse} icon={Clock} iconBg="bg-info-50" iconColor="text-info-600"
              delta={{ value: `${metrics.total > 0 ? Math.round((metrics.inUse / metrics.total) * 100) : 0}% of templates`, positive: true }} />
            <MetricCard label="Recently Updated" value={metrics.recentlyUpdated} icon={Sparkles} iconBg="bg-warning-50" iconColor="text-warning-600"
              delta={{ value: "in the last 7 days", positive: true }} />
            <MetricCard label="Team Shared" value={metrics.teamShared} icon={Users} iconBg="bg-success-50" iconColor="text-success-600"
              delta={{ value: `${metrics.total > 0 ? Math.round((metrics.teamShared / metrics.total) * 100) : 0}% of templates`, positive: true }} />
            <MetricCard label="Brand Templates" value={metrics.brandTemplates} icon={Lock} iconBg="bg-surface-100" iconColor="text-surface-600" />
          </KPIGrid>

          {/* Search + filter dropdowns + view switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates by name, category, event type…"
                className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
              />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option>All categories</option>
              {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Event type: All</option>
              {eventTypeOptions.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Format: All</option>
              {formatOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Status: All</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Owner: All</option>
              {ownerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortValue)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
            <ViewSwitcher basePath="/event-manager/library/templates" />
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setCategory("All categories")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                category === "All categories" ? "bg-brand-600 text-white border-brand-600" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
              )}
            >
              All categories
            </button>
            {TEMPLATE_CATEGORIES.map((c) => {
              const count = categoryCounts.get(c) ?? 0;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  disabled={count === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    category === c
                      ? "bg-brand-600 text-white border-brand-600"
                      : count === 0
                        ? "bg-surface-50 text-surface-300 border-surface-100 cursor-not-allowed"
                        : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
                  )}
                >
                  {c} {count > 0 && <span className="opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState
                icon={FolderOpen}
                title={templates.length === 0 ? "No templates yet" : "No templates match your filters"}
                description={
                  templates.length === 0
                    ? "Create or import a reusable design template for menus, flyers, posters, decks and more."
                    : "Try clearing filters or search to see more templates."
                }
                action={
                  templates.length === 0 ? (
                    <Link href="/event-manager/library/templates/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors">
                      Create template
                    </Link>
                  ) : undefined
                }
                compact
              />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {pagedList.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  currentUserId={currentUserId}
                  menuOpen={menuOpenId === tpl.id}
                  onMenuToggle={() => setMenuOpenId(menuOpenId === tpl.id ? null : tpl.id)}
                  onUse={() => setApplyTarget(tpl)}
                  onDuplicate={() => handleDuplicate(tpl.id)}
                  onArchive={() => handleArchive(tpl.id)}
                  onLockToggle={() => handleLockToggle(tpl.id)}
                  onFavourite={() => handleFavourite(tpl.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Template</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Usage</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Format</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Last updated</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Team visibility</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {pagedList.map((tpl) => {
                      const status = templateStatus(tpl.lockedAt, { status: tpl.status });
                      const Icon = CATEGORY_ICONS[tpl.category] ?? FileText;
                      return (
                        <tr key={tpl.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-[200px]">
                              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br", CATEGORY_BG[tpl.category])}>
                                <Icon className="w-4 h-4 text-white" strokeWidth={1.8} />
                              </div>
                              <div className="min-w-0">
                                <Link href={`/event-manager/library/templates/${tpl.id}`} className="font-medium text-surface-900 hover:text-brand-600 truncate block">
                                  {tpl.title}
                                </Link>
                                <p className="text-xs text-surface-400">v{tpl.version}.0</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-surface-600">{tpl.category}</td>
                          <td className="px-4 py-3 text-surface-600">{tpl.eventType ?? "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <OwnerAvatar name={tpl.ownerName} />
                              <span className="text-surface-700 truncate">{tpl.ownerName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-surface-700">{tpl.useCount}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-100 text-surface-600 border border-surface-200">{tpl.format}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", STATUS_TONE_CLASSES[status.tone])}>
                              {status.tone === "locked" && <Lock className="w-3 h-3" />}
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{formatLibDate(tpl.updatedAt)}</td>
                          <td className="px-4 py-3 text-surface-600">{visibilityLabel(tpl.visibility, { shared_team: tpl.sharedTeam ?? undefined })}</td>
                          <td className="px-4 py-3 text-right">
                            <RowActions
                              tpl={tpl}
                              open={menuOpenId === tpl.id}
                              onToggle={() => setMenuOpenId(menuOpenId === tpl.id ? null : tpl.id)}
                              onUse={() => setApplyTarget(tpl)}
                              onDuplicate={() => handleDuplicate(tpl.id)}
                              onArchive={() => handleArchive(tpl.id)}
                              onLockToggle={() => handleLockToggle(tpl.id)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100">
                  <p className="text-xs text-surface-500">
                    Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} templates
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-surface-200 disabled:opacity-40">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-surface-600 px-2">Page {page} of {pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="p-1.5 rounded-lg border border-surface-200 disabled:opacity-40">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right insights rail */}
        <div className="w-80 shrink-0 space-y-4 hidden xl:block">
          <InsightCard title="Recent Activity">
            <ul className="space-y-3">
              {recentActivity.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5">
                  <OwnerAvatar name={t.ownerName} size="xs" />
                  <div className="min-w-0">
                    <p className="text-xs text-surface-700 truncate">
                      <span className="font-medium">{t.ownerName}</span> updated <span className="font-medium">{t.title}</span>
                    </p>
                    <p className="text-[11px] text-surface-400">{relativeTime(t.updatedAt)}</p>
                  </div>
                </li>
              ))}
              {recentActivity.length === 0 && <li className="text-xs text-surface-400">No activity yet.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Top Templates">
            <ul className="space-y-2">
              {topTemplates.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-surface-400 w-4 shrink-0">{i + 1}</span>
                    <Link href={`/event-manager/library/templates/${t.id}`} className="text-surface-700 hover:text-brand-600 truncate">{t.title}</Link>
                  </span>
                  <span className="text-xs font-semibold text-surface-500 shrink-0">{t.useCount} uses</span>
                </li>
              ))}
              {topTemplates.length === 0 && <li className="text-xs text-surface-400">No usage yet.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Usage Analytics">
            <Donut centerLabel="Total uses" centerValue={totalUsage} segments={categoryDonutSegments} />
          </InsightCard>

          <InsightCard title="Recently Updated">
            <BarList items={recentActivity.map((t) => ({ label: t.title, value: t.useCount }))} />
          </InsightCard>
        </div>
      </div>

      {applyTarget && (
        <UseTemplateModal template={applyTarget} events={events} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  );
}

function TemplateCard({
  tpl, currentUserId, menuOpen, onMenuToggle, onUse, onDuplicate, onArchive, onLockToggle, onFavourite,
}: {
  tpl: TemplateRow;
  currentUserId: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onUse: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onLockToggle: () => void;
  onFavourite: () => void;
}) {
  const status = templateStatus(tpl.lockedAt, { status: tpl.status });
  const Icon = CATEGORY_ICONS[tpl.category] ?? FileText;
  const isFavourite = tpl.favouritedBy.includes(currentUserId);
  const isTeamShared = tpl.visibility === "workspace";

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <Link href={`/event-manager/library/templates/${tpl.id}`} className="relative block h-36 shrink-0">
        {tpl.coverUrl ? (
          <img src={tpl.coverUrl} alt={tpl.title} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br", CATEGORY_BG[tpl.category])}>
            <Icon className="w-8 h-8 text-white/90" strokeWidth={1.5} />
            <span className="text-[11px] font-medium text-white/70">{tpl.category}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {isTeamShared && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/40 text-white backdrop-blur-sm">
              <Users className="w-2.5 h-2.5" /> Team
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", STATUS_TONE_CLASSES[status.tone])}>
            {status.tone === "locked" && <Lock className="w-2.5 h-2.5" />}
            {status.label}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onFavourite(); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center backdrop-blur-sm"
        >
          <Star className={cn("w-3.5 h-3.5", isFavourite ? "fill-warning-400 text-warning-400" : "text-white")} />
        </button>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/event-manager/library/templates/${tpl.id}`} className="text-sm font-semibold text-surface-900 hover:text-brand-600 truncate block">
              {tpl.title}
            </Link>
            <p className="text-xs text-surface-500 truncate">{tpl.category}{tpl.eventType ? ` · ${tpl.eventType}` : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 text-xs text-surface-500">
          <OwnerAvatar name={tpl.ownerName} size="xs" />
          <span className="truncate">{tpl.ownerName}</span>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-surface-400">
          <span>Updated {formatLibDate(tpl.updatedAt)}</span>
          <span>Used {tpl.useCount} time{tpl.useCount === 1 ? "" : "s"}</span>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-600 border border-surface-200">{tpl.format}</span>
          <span className="text-[10px] text-surface-400">v{tpl.version}.0 · {formatBytes(tpl.sizeBytes)}</span>
        </div>

        <div className="mt-auto pt-3 flex items-center gap-2">
          <button onClick={onUse} className="flex-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition-colors">
            Use template
          </button>
          <div className="relative">
            <button onClick={onMenuToggle} className="p-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 text-surface-500">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-9 z-10 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
                <Link href={`/event-manager/library/templates/${tpl.id}`} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Eye className="w-3.5 h-3.5" /> Preview</Link>
                <button onClick={onDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
                <button onClick={onLockToggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left">
                  {tpl.lockedAt ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock as brand template</>}
                </button>
                <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActions({
  tpl, open, onToggle, onUse, onDuplicate, onArchive, onLockToggle,
}: {
  tpl: TemplateRow;
  open: boolean;
  onToggle: () => void;
  onUse: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onLockToggle: () => void;
}) {
  return (
    <div className="relative inline-block text-left">
      <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1 text-left">
          <button onClick={onUse} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Sparkles className="w-3.5 h-3.5" /> Use template</button>
          <Link href={`/event-manager/library/templates/${tpl.id}`} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"><Eye className="w-3.5 h-3.5" /> Preview / Edit</Link>
          <button onClick={onDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
          <button onClick={onLockToggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left">
            {tpl.lockedAt ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
          </button>
          <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
        </div>
      )}
    </div>
  );
}

function UseTemplateModal({
  template, events, onClose,
}: { template: TemplateRow; events: EventOption[]; onClose: () => void }) {
  const [eventId, setEventId] = useState("");
  const [outputName, setOutputName] = useState(`${template.title} — Event Copy`);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!eventId) { setError("Please choose a target event"); return; }
    setError(null);
    startTransition(async () => {
      try {
        const res = await useTemplate(template.id, { eventId, outputName });
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not apply template");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-success-700">Created a new copy of &ldquo;{template.title}&rdquo; for this event.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href={`/event-manager/library/templates/${result.id}`} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
                View file
              </Link>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Close</button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-base font-semibold text-surface-900 mb-1">Use &ldquo;{template.title}&rdquo;</h3>
            <p className="text-sm text-surface-500 mb-4">Creates a new file for the selected event, referencing this template.</p>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Target event</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3">
              <option value="">Select an event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Output name</label>
            <input value={outputName} onChange={(e) => setOutputName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3" />
            {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
              <button onClick={submit} disabled={pending} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
                {pending ? "Applying…" : "Use Template"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
