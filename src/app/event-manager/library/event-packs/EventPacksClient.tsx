"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package, Sparkles, Plus, Search, MoreHorizontal, Download, Share2, Link2, Copy, Archive,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Check, Layers, FileText,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";
import { InsightCard, Donut, OwnerAvatar, ViewSwitcher } from "../_shared";
import { formatBytes, formatLibDate, formatLibDateTime, formatRelative, kindLabel, type LibraryKind } from "../library-utils";
import {
  AUDIENCE_OPTIONS, VISIBILITY_OPTIONS, ASSET_VISIBILITY_OPTIONS,
  audienceLabel, visibilityLabel,
  type PackAudience, type PackVisibility,
} from "./pack-filter";
import {
  createEventPack, createSmartPack, duplicateEventPack, archiveEventPack,
  getPackDownloadUrls, sharePackExternally, copyPackLink,
} from "./actions";

export interface EventPackRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
  ownerName: string;
  eventId: string | null;
  eventName: string | null;
  fileCount: number;
  totalSizeBytes: number;
  smart: boolean;
  audience: PackAudience;
  visibility: PackVisibility;
  downloads: number;
  shares: number;
  lastDownloadAt: string | null;
  lastSharedAt: string | null;
  coverStoragePath: string | null;
  memberKinds: string[];
}

export interface PickableAsset {
  id: string;
  title: string;
  kind: string;
  mime: string | null;
  sizeBytes: number;
  tags: string[];
  visibility: string;
  eventId: string | null;
}

interface Kpis {
  totalPacks: number;
  sharedExternally: number;
  sharedPct: number;
  packDownloads: number;
  recentlyUpdated: number;
  createdThisMonth: number;
  totalShares: number;
  storageBytes: number;
}

const VISIBILITY_STYLE: Record<PackVisibility, string> = {
  public: "bg-success-50 text-success-700 border-success-100",
  shared: "bg-info-50 text-info-600 border-info-200",
  internal: "bg-surface-100 text-surface-600 border-surface-200",
};

const AUDIENCE_STYLE: Record<string, string> = {
  guests: "bg-violet-50 text-violet-700 border-violet-100",
  staff: "bg-info-50 text-info-600 border-info-200",
  suppliers: "bg-warning-50 text-warning-700 border-warning-100",
  speakers: "bg-brand-50 text-brand-700 border-brand-100",
  sponsors: "bg-success-50 text-success-700 border-success-100",
  vips: "bg-danger-50 text-danger-700 border-danger-100",
  press: "bg-surface-200 text-surface-700 border-surface-300",
  exhibitors: "bg-brand-50 text-brand-700 border-brand-100",
  internal: "bg-surface-100 text-surface-600 border-surface-200",
  all: "bg-surface-100 text-surface-600 border-surface-200",
};

const COVER_GRADIENTS = [
  "from-brand-700 to-brand-950",
  "from-warning-700 to-warning-950",
  "from-success-700 to-success-950",
  "from-violet-700 to-violet-950",
  "from-danger-700 to-danger-950",
  "from-info-600 to-info-900",
  "from-surface-700 to-surface-900",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

type SortKey = "updated" | "name" | "files" | "downloads";

export function EventPacksClient({
  packs, events, assets, view, kpis,
}: {
  packs: EventPackRow[];
  events: { id: string; name: string }[];
  assets: PickableAsset[];
  view: "grid" | "list";
  kpis: Kpis;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "smart" | "manual">("all");
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [createOpen, setCreateOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of packs) if (p.ownerId) map.set(p.ownerId, p.ownerName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [packs]);

  const filtered = useMemo(() => {
    let list = packs;
    if (audienceFilter !== "all") list = list.filter((p) => p.audience === audienceFilter);
    if (visibilityFilter !== "all") list = list.filter((p) => p.visibility === visibilityFilter);
    if (ownerFilter !== "all") list = list.filter((p) => p.ownerId === ownerFilter);
    if (eventFilter !== "all") list = list.filter((p) => p.eventId === eventFilter);
    if (kindFilter === "smart") list = list.filter((p) => p.smart);
    if (kindFilter === "manual") list = list.filter((p) => !p.smart);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.eventName ?? "").toLowerCase().includes(q) ||
          audienceLabel(p.audience).toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === "updated") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "files") sorted.sort((a, b) => b.fileCount - a.fileCount);
    else if (sortBy === "downloads") sorted.sort((a, b) => b.downloads - a.downloads);
    return sorted;
  }, [packs, audienceFilter, visibilityFilter, ownerFilter, eventFilter, kindFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);

  function resetToFirstPage() {
    setPage(1);
  }

  // ── Right rail data (all derived from real pack rows) ─────────────────────
  const topPerforming = [...packs].sort((a, b) => b.downloads - a.downloads).slice(0, 5);

  const recentActivity = [...packs]
    .flatMap((p) => {
      const entries: { label: string; who: string; when: string }[] = [];
      entries.push({ label: `${p.ownerName} created`, who: p.name, when: p.createdAt });
      if (p.updatedAt !== p.createdAt) {
        entries.push({ label: `${p.ownerName} updated`, who: p.name, when: p.updatedAt });
      }
      return entries;
    })
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 6);

  const downloadsByAudience = Object.values(
    packs.reduce<Record<string, { label: string; value: number }>>((acc, p) => {
      const key = p.audience;
      acc[key] = acc[key] ?? { label: audienceLabel(key), value: 0 };
      acc[key].value += p.downloads;
      return acc;
    }, {})
  ).filter((d) => d.value > 0);

  const recentlyShared = [...packs]
    .filter((p) => p.lastSharedAt)
    .sort((a, b) => (b.lastSharedAt ?? "").localeCompare(a.lastSharedAt ?? ""))
    .slice(0, 5);

  function handleDuplicate(id: string) {
    setMenuOpenId(null);
    startTransition(async () => {
      try {
        const newId = await duplicateEventPack(id);
        notify("Pack duplicated");
        router.push(`/event-manager/library/event-packs/${newId}`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to duplicate pack");
      }
    });
  }

  function handleArchive(id: string, name: string) {
    setMenuOpenId(null);
    if (!confirm(`Archive "${name}"? It will be removed from Event Packs but its files are kept.`)) return;
    startTransition(async () => {
      try {
        await archiveEventPack(id);
        notify("Pack archived");
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to archive pack");
      }
    });
  }

  function handleDownload(id: string) {
    setMenuOpenId(null);
    startTransition(async () => {
      try {
        const files = await getPackDownloadUrls(id);
        if (files.length === 0) {
          notify("This pack has no files yet");
          return;
        }
        const ready = files.filter((f) => f.url);
        if (ready.length === 0) {
          notify("Storage is not configured — downloads are unavailable in this environment");
          return;
        }
        ready.forEach((f) => window.open(f.url!, "_blank", "noopener,noreferrer"));
        notify(`Downloading ${ready.length} file${ready.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Download failed");
      }
    });
  }

  function handleShare(id: string) {
    setMenuOpenId(null);
    startTransition(async () => {
      try {
        const res = await sharePackExternally(id);
        notify(`Shared ${res.linksCreated} file${res.linksCreated === 1 ? "" : "s"} externally`);
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to share pack");
      }
    });
  }

  function handleCopyLink(id: string) {
    setMenuOpenId(null);
    startTransition(async () => {
      try {
        const token = await copyPackLink(id);
        const url = `${window.location.origin}/share/${token}`;
        await navigator.clipboard.writeText(url);
        notify("Link copied to clipboard");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to create link");
      }
    });
  }

  const isEmpty = packs.length === 0;
  const hasNoResults = !isEmpty && filtered.length === 0;

  return (
    <div className="flex-1 p-6 flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <KPIGrid>
          <MetricCard
            label="Total Packs"
            value={kpis.totalPacks}
            icon={Package}
            iconBg="bg-brand-50"
            iconColor="text-brand-600"
            delta={kpis.createdThisMonth > 0 ? { value: `${kpis.createdThisMonth} this month`, positive: true } : undefined}
          />
          <MetricCard
            label="Shared Externally"
            value={kpis.sharedExternally}
            icon={Share2}
            iconBg="bg-info-50"
            iconColor="text-info-600"
            delta={{ value: `${kpis.sharedPct}% of total packs`, positive: true }}
          />
          <MetricCard
            label="Pack Downloads"
            value={kpis.packDownloads}
            icon={Download}
            iconBg="bg-success-50"
            iconColor="text-success-600"
          />
          <MetricCard
            label="Recently Updated"
            value={kpis.recentlyUpdated}
            icon={Sparkles}
            iconBg="bg-warning-50"
            iconColor="text-warning-600"
            delta={{ value: "in the last 7 days", positive: true }}
          />
        </KPIGrid>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetToFirstPage(); }}
                placeholder="Search packs by name, audience or event..."
                className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
              />
            </div>
            <select
              value={audienceFilter}
              onChange={(e) => { setAudienceFilter(e.target.value); resetToFirstPage(); }}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
            >
              <option value="all">Audience: All</option>
              {AUDIENCE_OPTIONS.filter((a) => a.value !== "all").map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              value={eventFilter}
              onChange={(e) => { setEventFilter(e.target.value); resetToFirstPage(); }}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
            >
              <option value="all">Event: All</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={visibilityFilter}
              onChange={(e) => { setVisibilityFilter(e.target.value); resetToFirstPage(); }}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
            >
              <option value="all">Visibility: All</option>
              {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <select
              value={ownerFilter}
              onChange={(e) => { setOwnerFilter(e.target.value); resetToFirstPage(); }}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
            >
              <option value="all">Owner: All</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="inline-flex items-center rounded-lg border border-surface-200 bg-white p-0.5">
              {(["all", "smart", "manual"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setKindFilter(k); resetToFirstPage(); }}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-xs font-medium capitalize transition-colors",
                    kindFilter === k ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:text-surface-700"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
            >
              <option value="updated">Sort by: Recently updated</option>
              <option value="name">Sort by: Name A–Z</option>
              <option value="files">Sort by: Most files</option>
              <option value="downloads">Sort by: Most downloads</option>
            </select>
            <ViewSwitcher basePath="/event-manager/library/event-packs" />
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              onClick={() => setSmartOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-brand-600" />
              New Smart Pack
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Pack
            </button>
          </div>
        </div>

        {isEmpty ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Package}
              title="No event packs yet"
              description="Bundle files into curated packs for guests, staff, suppliers, speakers and sponsors."
              action={
                <button
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Pack
                </button>
              }
            />
          </div>
        ) : hasNoResults ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState icon={Search} title="No packs match your filters" description="Try clearing search or filters." compact />
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {pageItems.map((p) => (
              <PackCard
                key={p.id}
                pack={p}
                menuOpen={menuOpenId === p.id}
                onToggleMenu={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)}
                onDownload={() => handleDownload(p.id)}
                onShare={() => handleShare(p.id)}
                onCopyLink={() => handleCopyLink(p.id)}
                onDuplicate={() => handleDuplicate(p.id)}
                onArchive={() => handleArchive(p.id, p.name)}
              />
            ))}
          </div>
        ) : (
          <PackTable
            packs={pageItems}
            menuOpenId={menuOpenId}
            onToggleMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
            onDownload={handleDownload}
            onShare={handleShare}
            onCopyLink={handleCopyLink}
            onDuplicate={handleDuplicate}
            onArchive={(id, name) => handleArchive(id, name)}
          />
        )}

        {!isEmpty && !hasNoResults && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-surface-500">
              Showing {pageStart + 1} to {Math.min(pageStart + perPage, filtered.length)} of {filtered.length} packs
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={clampedPage === 1} className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => Math.abs(n - clampedPage) <= 2 || n === 1 || n === totalPages)
                  .reduce<number[]>((acc, n) => {
                    if (acc.length > 0 && n - acc[acc.length - 1] > 1) acc.push(-1);
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    n === -1 ? (
                      <span key={`gap-${i}`} className="px-1 text-xs text-surface-400">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
                          n === clampedPage ? "bg-brand-600 text-white" : "border border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                        )}
                      >
                        {n}
                      </button>
                    )
                  )}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage === totalPages} className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={clampedPage === totalPages} className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); resetToFirstPage(); }}
                className="px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white text-xs text-surface-700"
              >
                <option value={12}>12 per page</option>
                <option value={24}>24 per page</option>
                <option value={48}>48 per page</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden xl:block">
        <InsightCard title="Top Performing Packs">
          <ul className="space-y-3">
            {topPerforming.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br shrink-0 flex items-center justify-center", gradientFor(p.id))}>
                  <Package className="w-4 h-4 text-white/90" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/event-manager/library/event-packs/${p.id}`} className="text-xs font-semibold text-surface-800 hover:text-brand-600 truncate block">{p.name}</Link>
                  <p className="text-[11px] text-surface-400">{p.downloads} downloads</p>
                </div>
              </li>
            ))}
            {topPerforming.length === 0 && <li className="text-xs text-surface-400">No downloads yet.</li>}
          </ul>
        </InsightCard>

        <InsightCard title="Recent Activity">
          <ul className="space-y-2.5">
            {recentActivity.map((a, i) => (
              <li key={i} className="text-xs">
                <p className="text-surface-700"><span className="font-medium">{a.label}</span> <span className="font-semibold text-surface-900">{a.who}</span></p>
                <p className="text-surface-400">{formatRelative(a.when)}</p>
              </li>
            ))}
            {recentActivity.length === 0 && <li className="text-xs text-surface-400">No activity yet.</li>}
          </ul>
        </InsightCard>

        <InsightCard title="Download Stats">
          <Donut centerLabel="Total downloads" centerValue={kpis.packDownloads} segments={downloadsByAudience} />
        </InsightCard>

        <InsightCard title="Recently Shared Packs">
          <ul className="space-y-2">
            {recentlyShared.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs gap-2">
                <Link href={`/event-manager/library/event-packs/${p.id}`} className="text-surface-700 hover:text-brand-600 truncate">{p.name}</Link>
                <span className="text-surface-400 shrink-0">{formatRelative(p.lastSharedAt!)}</span>
              </li>
            ))}
            {recentlyShared.length === 0 && <li className="text-xs text-surface-400">No packs shared yet.</li>}
          </ul>
        </InsightCard>
      </div>

      {createOpen && (
        <CreatePackModal events={events} assets={assets} onClose={() => setCreateOpen(false)} />
      )}
      {smartOpen && (
        <SmartPackModal events={events} assets={assets} onClose={() => setSmartOpen(false)} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function PackCoverArt({ pack }: { pack: EventPackRow }) {
  return (
    <div className={cn("relative h-32 flex flex-col justify-end p-4 bg-gradient-to-br overflow-hidden", gradientFor(pack.id))}>
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-2xl bg-white/10 rotate-12" />
      <div className="absolute right-4 top-4 flex -space-x-3">
        {(pack.memberKinds.length > 0 ? pack.memberKinds : ["document"]).slice(0, 3).map((k, i) => (
          <div key={k} className="w-9 h-11 rounded-md bg-white/15 border border-white/25 shadow-sm" style={{ transform: `rotate(${(i - 1) * 8}deg)` }} />
        ))}
      </div>
      <p className="relative text-white text-sm font-bold leading-tight truncate">{pack.name}</p>
      {pack.eventName && <p className="relative text-white/70 text-[11px] truncate">{pack.eventName}</p>}
    </div>
  );
}

function PackMenu({
  packId, packName, onClose, onDownload, onShare, onCopyLink, onDuplicate, onArchive,
}: {
  packId: string; packName: string; onClose: () => void;
  onDownload: () => void; onShare: () => void; onCopyLink: () => void; onDuplicate: () => void; onArchive: () => void;
}) {
  return (
    <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1" onClick={(e) => e.stopPropagation()}>
      <Link href={`/event-manager/library/event-packs/${packId}`} className="flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <FileText className="w-3.5 h-3.5" /> Open / Edit
      </Link>
      <button onClick={onDownload} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Download className="w-3.5 h-3.5" /> Download</button>
      <button onClick={onShare} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Share2 className="w-3.5 h-3.5" /> Share externally</button>
      <button onClick={onCopyLink} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Link2 className="w-3.5 h-3.5" /> Copy link</button>
      <button onClick={onDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
      <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
    </div>
  );
}

function PackCard({
  pack, menuOpen, onToggleMenu, onDownload, onShare, onCopyLink, onDuplicate, onArchive,
}: {
  pack: EventPackRow;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onDownload: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      <Link href={`/event-manager/library/event-packs/${pack.id}`} className="block">
        <PackCoverArt pack={pack} />
      </Link>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link href={`/event-manager/library/event-packs/${pack.id}`} className="text-sm font-semibold text-surface-900 hover:text-brand-600 truncate">
            {pack.name}
          </Link>
          <div className="relative shrink-0">
            <button onClick={onToggleMenu} className="p-1 rounded-lg hover:bg-surface-100 text-surface-400">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <PackMenu
                packId={pack.id} packName={pack.name} onClose={onToggleMenu}
                onDownload={onDownload} onShare={onShare} onCopyLink={onCopyLink} onDuplicate={onDuplicate} onArchive={onArchive}
              />
            )}
          </div>
        </div>
        {pack.eventName && <p className="text-xs text-surface-400 truncate mb-2">{pack.eventName}</p>}

        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border", AUDIENCE_STYLE[pack.audience] ?? AUDIENCE_STYLE.all)}>
            {audienceLabel(pack.audience)}
          </span>
          {pack.smart && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-brand-50 text-brand-700 border-brand-100">
              <Sparkles className="w-3 h-3" /> Smart pack
            </span>
          )}
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border", VISIBILITY_STYLE[pack.visibility])}>
            {visibilityLabel(pack.visibility)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-surface-500 mb-3">
          <span>{pack.fileCount} file{pack.fileCount === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-1.5">
            <OwnerAvatar name={pack.ownerName} size="xs" />
            <span className="truncate max-w-[90px]">{pack.ownerName}</span>
          </div>
        </div>

        <p className="text-[11px] text-surface-400 mb-3">Updated {formatLibDate(pack.updatedAt)}</p>

        <div className="mt-auto flex items-center gap-1.5 pt-3 border-t border-surface-100">
          <button onClick={onShare} title="Share externally" className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Share2 className="w-4 h-4" /></button>
          <button onClick={onDownload} title="Download pack" className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Download className="w-4 h-4" /></button>
          <button onClick={onCopyLink} title="Copy link" className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Link2 className="w-4 h-4" /></button>
          <span className="ml-auto text-[11px] text-surface-400">{pack.downloads} downloads</span>
        </div>
      </div>
    </div>
  );
}

function PackTable({
  packs, menuOpenId, onToggleMenu, onDownload, onShare, onCopyLink, onDuplicate, onArchive,
}: {
  packs: EventPackRow[];
  menuOpenId: string | null;
  onToggleMenu: (id: string) => void;
  onDownload: (id: string) => void;
  onShare: (id: string) => void;
  onCopyLink: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string, name: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    setSelected(selected.size === packs.length ? new Set() : new Set(packs.map((p) => p.id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      {selected.size > 0 && (
        <div className="px-4 py-2.5 bg-brand-50 border-b border-brand-100 flex items-center justify-between text-xs">
          <span className="font-medium text-brand-700">{selected.size} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={() => selected.forEach((id) => onDownload(id))} className="text-brand-700 font-medium hover:underline">Download</button>
            <button onClick={() => { selected.forEach((id) => onShare(id)); }} className="text-brand-700 font-medium hover:underline">Share</button>
            <button onClick={() => setSelected(new Set())} className="text-surface-500 hover:underline">Clear</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm divide-y divide-surface-100">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 text-left w-8">
                <input type="checkbox" checked={selected.size === packs.length && packs.length > 0} onChange={toggleAll} className="rounded border-surface-300" />
              </th>
              <th className="px-2 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Pack Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Related Event</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Audience</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Files</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Visibility</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Downloads</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Last Updated</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {packs.map((p) => (
              <tr key={p.id} className="group hover:bg-surface-50 transition-colors">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded border-surface-300" />
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br shrink-0 flex items-center justify-center", gradientFor(p.id))}>
                      <Package className="w-4 h-4 text-white/90" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/event-manager/library/event-packs/${p.id}`} className="font-medium text-surface-900 hover:text-brand-600 truncate block">{p.name}</Link>
                      {p.smart && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-brand-600 font-medium">
                          <Sparkles className="w-3 h-3" /> Smart pack
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-surface-600 truncate max-w-[160px]">{p.eventName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", AUDIENCE_STYLE[p.audience] ?? AUDIENCE_STYLE.all)}>
                    {audienceLabel(p.audience)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-surface-600">{p.fileCount}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <OwnerAvatar name={p.ownerName} />
                    <span className="text-surface-700 truncate max-w-[110px]">{p.ownerName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", VISIBILITY_STYLE[p.visibility])}>
                    {visibilityLabel(p.visibility)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-surface-600">{p.downloads}</td>
                <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{formatLibDateTime(p.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="relative inline-block">
                    <button onClick={() => onToggleMenu(p.id)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpenId === p.id && (
                      <PackMenu
                        packId={p.id} packName={p.name} onClose={() => onToggleMenu(p.id)}
                        onDownload={() => onDownload(p.id)} onShare={() => onShare(p.id)} onCopyLink={() => onCopyLink(p.id)}
                        onDuplicate={() => onDuplicate(p.id)} onArchive={() => onArchive(p.id, p.name)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Create Pack (manual) ─────────────────────────────────────────────────────

function AssetPicker({
  assets, eventFilter, selected, onToggle, search, onSearch,
}: {
  assets: PickableAsset[];
  eventFilter: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = assets.filter((a) => {
    if (eventFilter && eventFilter !== "" && a.eventId !== eventFilter) return false;
    if (!search.trim()) return true;
    return a.title.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white mb-2">
        <Search className="w-4 h-4 text-surface-400 shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search files..."
          className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
        />
      </div>
      <div className="max-h-56 overflow-y-auto border border-surface-200 rounded-lg divide-y divide-surface-100">
        {filtered.length === 0 && <p className="text-xs text-surface-400 p-3">No files found.</p>}
        {filtered.slice(0, 100).map((a) => (
          <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 cursor-pointer">
            <input type="checkbox" name="asset_ids" value={a.id} checked={selected.has(a.id)} onChange={() => onToggle(a.id)} className="rounded border-surface-300" />
            <FileText className="w-3.5 h-3.5 text-surface-400 shrink-0" />
            <span className="text-sm text-surface-700 truncate flex-1">{a.title}</span>
            <span className="text-[11px] text-surface-400 shrink-0">{kindLabel(a.kind)} · {formatBytes(a.sizeBytes)}</span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-surface-400 mt-1.5">{selected.size} file{selected.size === 1 ? "" : "s"} selected</p>
    </div>
  );
}

function CreatePackModal({
  events, assets, onClose,
}: { events: { id: string; name: string }[]; assets: PickableAsset[]; onClose: () => void }) {
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assetSearch, setAssetSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createEventPack(formData);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create pack";
        if (!msg.includes("NEXT_REDIRECT")) setError(msg);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form action={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-surface-900">Create Pack</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 text-surface-400"><X className="w-4 h-4" /></button>
        </div>

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Pack Name</label>
        <input name="name" required placeholder="e.g. Guest Welcome Pack" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3" />

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Description</label>
        <textarea name="description" rows={2} placeholder="What is this pack for?" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3 resize-none" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Audience</label>
            <select name="audience" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              {AUDIENCE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Visibility</label>
            <select name="visibility" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Related Event (optional)</label>
        <select name="event_id" value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-4">
          <option value="">No event</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Add Files</label>
        <AssetPicker assets={assets} eventFilter={eventId} selected={selected} onToggle={toggle} search={assetSearch} onSearch={setAssetSearch} />

        {error && <p className="text-xs text-danger-600 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
          <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {pending ? "Creating…" : "Create Pack"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Smart Pack ────────────────────────────────────────────────────────────

function SmartPackModal({
  events, assets, onClose,
}: { events: { id: string; name: string }[]; assets: PickableAsset[]; onClose: () => void }) {
  const [eventId, setEventId] = useState("");
  const [kind, setKind] = useState<string>("");
  const [tag, setTag] = useState("");
  const [assetVisibility, setAssetVisibility] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewCount = assets.filter((a) => {
    if (eventId && a.eventId !== eventId) return false;
    if (kind && a.kind !== kind) return false;
    if (tag.trim() && !a.tags.some((t) => t.toLowerCase() === tag.trim().toLowerCase())) return false;
    if (assetVisibility && a.visibility !== assetVisibility) return false;
    return true;
  }).length;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createSmartPack(formData);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create smart pack";
        if (!msg.includes("NEXT_REDIRECT")) setError(msg);
      }
    });
  }

  const kinds: LibraryKind[] = ["document", "image", "video", "template", "checklist", "presentation", "contract"];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form action={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-brand-600" />
          <h3 className="text-base font-semibold text-surface-900">New Smart Pack</h3>
        </div>
        <p className="text-xs text-surface-500 mb-4">
          Smart packs auto-populate with files matching the rules below, and can be re-run any time a matching file is added.
        </p>

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Pack Name</label>
        <input name="name" required placeholder="e.g. Sponsor Media Pack" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3" />

        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Description</label>
        <textarea name="description" rows={2} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3 resize-none" />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Audience</label>
            <select name="audience" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              {AUDIENCE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Visibility</label>
            <select name="visibility" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-surface-50 border border-surface-200 rounded-lg p-3 space-y-3 mb-3">
          <p className="text-xs font-semibold text-surface-700">Matching rules</p>
          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">Event</label>
            <select name="event_id" value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white">
              <option value="">Any event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">File kind</label>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white">
                <option value="">Any kind</option>
                {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Tag</label>
              <input name="tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. sponsor" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">File visibility</label>
            <select name="asset_visibility" value={assetVisibility} onChange={(e) => setAssetVisibility(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white">
              <option value="">Any visibility</option>
              {ASSET_VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-surface-500 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand-500" />
            ~{previewCount} file{previewCount === 1 ? "" : "s"} match these rules right now
            {assets.length >= 300 && " (based on the most recent 300 files)"}
          </p>
        </div>

        {error && <p className="text-xs text-danger-600 mb-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            <Check className="w-4 h-4" />
            {pending ? "Creating…" : "Create Smart Pack"}
          </button>
        </div>
      </form>
    </div>
  );
}
