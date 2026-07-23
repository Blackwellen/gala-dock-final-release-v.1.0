"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Upload, Sparkles, Search, Filter, Star, Download, Eye, Share2, MoreHorizontal,
  Lock, Unlock, CheckCircle2, XCircle, Clock, ImageIcon, Palette, Type, Film,
  FileText, Package, Users as UsersIcon, LayoutTemplate, Camera, X, Loader2,
  Archive, FolderPlus, Send,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";
import { formatBytes } from "../library-utils";
import { InsightCard, Donut, BarList, OwnerAvatar, ViewSwitcher } from "../_shared";
import {
  ASSET_TYPE_LABELS, APPROVAL_LABELS, APPROVAL_BADGE_CLASSES, BRAND_ASSET_TYPES,
  APPROVAL_STATUSES, COMPLETENESS_CATEGORIES, visibilityLabel, visibilityBadgeClass,
  relativeTime, type BrandAssetType, type ApprovalStatus,
} from "./brand-assets-utils";
import {
  uploadBrandAsset, createBrandKit, setApprovalStatus, setLocked, toggleStar,
  recordAssetUsage, getBrandAssetSignedUrl, archiveBrandAsset,
} from "./actions";

export interface BrandAssetRow {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  mime: string | null;
  sizeBytes: number;
  storagePath: string | null;
  coverStoragePath: string | null;
  previewUrl: string | null;
  tags: string[];
  ownerId: string | null;
  ownerName: string;
  eventId: string | null;
  eventName: string | null;
  brandLabel: string;
  visibility: string;
  lockedAt: string | null;
  lockedByUserId: string | null;
  useCount: number;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
  assetType: BrandAssetType;
  approvalStatus: ApprovalStatus;
  hexColors: string[];
  fontNames: string[];
  starred: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
}

const TYPE_ICONS: Record<BrandAssetType, typeof ImageIcon> = {
  logo: ImageIcon,
  brand_kit: Package,
  colour_palette: Palette,
  typography: Type,
  social_artwork: LayoutTemplate,
  sponsor_asset: UsersIcon,
  template: FileText,
  photography: Camera,
  video: Film,
  other: FileText,
};

const TYPE_TILE_BG: Record<BrandAssetType, string> = {
  logo: "bg-brand-50",
  brand_kit: "bg-violet-50",
  colour_palette: "bg-warning-50",
  typography: "bg-info-50",
  social_artwork: "bg-success-50",
  sponsor_asset: "bg-amber-50",
  template: "bg-surface-100",
  photography: "bg-rose-50",
  video: "bg-indigo-50",
  other: "bg-surface-100",
};

const TYPE_TILE_TEXT: Record<BrandAssetType, string> = {
  logo: "text-brand-600",
  brand_kit: "text-violet-600",
  colour_palette: "text-warning-700",
  typography: "text-info-600",
  social_artwork: "text-success-700",
  sponsor_asset: "text-amber-700",
  template: "text-surface-500",
  photography: "text-rose-600",
  video: "text-indigo-600",
  other: "text-surface-500",
};

function formatLabel(mime: string | null, storagePath: string | null): string {
  const fromPath = storagePath?.split(".").pop()?.toUpperCase().slice(0, 5);
  if (mime) {
    const sub = mime.split("/")[1];
    if (sub) {
      if (sub.includes("presentation")) return "PPTX";
      if (sub.includes("word")) return "DOCX";
      if (sub.includes("spreadsheet") || sub.includes("excel")) return "XLSX";
      if (sub.includes("zip")) return "ZIP";
      if (sub === "octet-stream" && fromPath) return fromPath;
      return sub.split(/[.+]/).pop()!.toUpperCase().slice(0, 5);
    }
  }
  return fromPath || "FILE";
}

export function BrandAssetsClient({
  rows,
  owners,
  brands,
  events,
  workspaceName,
  view,
}: {
  rows: BrandAssetRow[];
  owners: { id: string; name: string }[];
  brands: string[];
  events: { id: string; name: string }[];
  workspaceName: string;
  view: "grid" | "list";
}) {
  const [search, setSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<Set<BrandAssetType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<ApprovalStatus>>(new Set());
  const [brandFilter, setBrandFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [sort, setSort] = useState<"updated" | "name" | "usage">("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleAssetType(t: BrandAssetType) {
    setAssetTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }
  function toggleStatus(s: ApprovalStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }
  function clearAll() {
    setAssetTypeFilter(new Set());
    setStatusFilter(new Set());
    setBrandFilter("all");
    setOwnerFilter("all");
    setSearch("");
  }

  const filtered = useMemo(() => {
    let list = rows;
    if (assetTypeFilter.size > 0) list = list.filter((r) => assetTypeFilter.has(r.assetType));
    if (statusFilter.size > 0) list = list.filter((r) => statusFilter.has(r.lockedAt ? "locked" : r.approvalStatus));
    if (brandFilter !== "all") list = list.filter((r) => r.brandLabel === brandFilter);
    if (ownerFilter !== "all") list = list.filter((r) => (r.ownerId ?? "unassigned") === ownerFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.brandLabel.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          ASSET_TYPE_LABELS[r.assetType].toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === "updated") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => b.useCount - a.useCount);
    return sorted;
  }, [rows, assetTypeFilter, statusFilter, brandFilter, ownerFilter, search, sort]);

  // KPIs reflect the whole library, not just the current filter — matching
  // the reference screens where the KPI strip is a workspace-wide summary.
  const kpi = useMemo(() => {
    const approved = rows.filter((r) => r.approvalStatus === "approved").length;
    const pending = rows.filter((r) => r.approvalStatus === "pending_review").length;
    const locked = rows.filter((r) => !!r.lockedAt).length;
    const shared = rows.filter((r) => r.visibility !== "workspace").length;
    return { total: rows.length, approved, pending, locked, shared };
  }, [rows]);

  const typeDistribution = useMemo(() => {
    const counts = new Map<BrandAssetType, number>();
    for (const r of rows) counts.set(r.assetType, (counts.get(r.assetType) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label: ASSET_TYPE_LABELS[label], value }));
  }, [rows]);

  const approvalQueue = useMemo(
    () =>
      [...rows]
        .filter((r) => r.approvalStatus !== "approved" && r.approvalStatus !== "archived")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [rows]
  );

  const recentUpdates = useMemo(() => [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [rows]);

  const completeness = useMemo(() => {
    const present = COMPLETENESS_CATEGORIES.filter((cat) => rows.some((r) => r.assetType === cat));
    const pct = Math.round((present.length / COMPLETENESS_CATEGORIES.length) * 100);
    const detail = COMPLETENESS_CATEGORIES.map((cat) => ({
      label: ASSET_TYPE_LABELS[cat],
      count: rows.filter((r) => r.assetType === cat).length,
    }));
    return { pct, detail };
  }, [rows]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function runApprove(id: string) {
    startTransition(async () => { await setApprovalStatus(id, "approved"); });
    setMenuOpenId(null);
  }
  function runReject(id: string) {
    const reason = window.prompt("Reason for requesting changes:", "Changes requested") ?? undefined;
    startTransition(async () => { await setApprovalStatus(id, "rejected", reason); });
    setMenuOpenId(null);
  }
  function runSubmitForReview(id: string) {
    startTransition(async () => { await setApprovalStatus(id, "pending_review"); });
    setMenuOpenId(null);
  }
  function runToggleLock(id: string, locked: boolean) {
    startTransition(async () => { await setLocked(id, !locked); });
    setMenuOpenId(null);
  }
  function runToggleStar(id: string, starred: boolean) {
    startTransition(async () => { await toggleStar(id, !starred); });
  }
  function runArchive(id: string) {
    if (!window.confirm("Archive this brand asset? It will be removed from the library.")) return;
    startTransition(async () => { await archiveBrandAsset(id); });
    setMenuOpenId(null);
  }
  async function runDownload(row: BrandAssetRow) {
    if (!row.storagePath) return;
    const result = await getBrandAssetSignedUrl(row.storagePath);
    if (result.ok) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      startTransition(async () => { await recordAssetUsage(row.id); });
    }
    setMenuOpenId(null);
  }
  function bulkApprove() {
    const ids = Array.from(selected);
    startTransition(async () => { await Promise.all(ids.map((id) => setApprovalStatus(id, "approved"))); });
    setSelected(new Set());
  }
  function bulkArchive() {
    if (!window.confirm(`Archive ${selected.size} selected asset(s)?`)) return;
    const ids = Array.from(selected);
    startTransition(async () => { await Promise.all(ids.map((id) => archiveBrandAsset(id))); });
    setSelected(new Set());
  }

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
        >
          <Upload className="w-4 h-4" /> Upload Assets
        </button>
        <button
          onClick={() => setKitOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Create Brand Kit
        </button>
      </div>

      <KPIGrid>
        <MetricCard label="Total Assets" value={kpi.total} icon={Package} iconBg="bg-brand-50" iconColor="text-brand-600" />
        <MetricCard label="Approved Assets" value={kpi.approved} icon={CheckCircle2} iconBg="bg-success-50" iconColor="text-success-600" />
        <MetricCard label="Pending Review" value={kpi.pending} icon={Clock} iconBg="bg-warning-50" iconColor="text-warning-700" />
        <MetricCard label="Locked Assets" value={kpi.locked} icon={Lock} iconBg="bg-info-50" iconColor="text-info-600" />
        <MetricCard label="Shared Assets" value={kpi.shared} icon={Share2} iconBg="bg-violet-50" iconColor="text-violet-600" />
      </KPIGrid>

      <div className="flex gap-6">
        {/* Left filter panel */}
        {showFilters && (
          <aside className="w-56 shrink-0 hidden lg:block space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Filters</h3>
              <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:underline">Clear all</button>
            </div>
            <div>
              <p className="text-xs font-semibold text-surface-700 mb-2">Asset Type</p>
              <ul className="space-y-1.5">
                {BRAND_ASSET_TYPES.map((t) => {
                  const count = rows.filter((r) => r.assetType === t).length;
                  return (
                    <li key={t}>
                      <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer">
                        <input type="checkbox" checked={assetTypeFilter.has(t)} onChange={() => toggleAssetType(t)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                        <span className="flex-1">{ASSET_TYPE_LABELS[t]}</span>
                        <span className="text-surface-400">{count}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-surface-700 mb-2">Status</p>
              <ul className="space-y-1.5">
                {APPROVAL_STATUSES.filter((s) => s !== "archived").map((s) => {
                  const count = s === "locked" ? rows.filter((r) => !!r.lockedAt).length : rows.filter((r) => r.approvalStatus === s && !r.lockedAt).length;
                  return (
                    <li key={s}>
                      <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer">
                        <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                        <span className="flex-1">{APPROVAL_LABELS[s]}</span>
                        <span className="text-surface-400">{count}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-xs font-medium text-surface-600 hover:bg-surface-50"
            >
              <Filter className="w-3.5 h-3.5" /> {showFilters ? "Hide filters" : "Show filters"}
            </button>
            <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[180px] max-w-sm">
              <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets by name, brand, type…"
                className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
              />
            </div>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Brand: All</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="all">Owner: All</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
              <option value="updated">Sort: Recently updated</option>
              <option value="name">Sort: Name</option>
              <option value="usage">Sort: Most used</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-surface-400">{filtered.length} of {rows.length}</span>
              <ViewSwitcher basePath="/event-manager/library/brand-assets" />
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-brand-50 border border-brand-100">
              <span className="text-xs font-semibold text-brand-800">{selected.size} selected</span>
              <button onClick={bulkApprove} className="text-xs font-medium text-success-700 hover:underline">Approve</button>
              <button onClick={bulkArchive} className="text-xs font-medium text-danger-600 hover:underline">Archive</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-surface-500 hover:underline">Clear selection</button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState
                icon={Package}
                title={rows.length === 0 ? "No brand assets yet" : "No assets match your filters"}
                description={
                  rows.length === 0
                    ? "Upload logos, colour palettes, typography kits, social artwork and sponsor assets to build your brand library."
                    : "Try clearing filters or searching a different term."
                }
                action={
                  rows.length === 0 ? (
                    <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
                      <Upload className="w-4 h-4" /> Upload Assets
                    </button>
                  ) : undefined
                }
                compact
              />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {filtered.map((row) => (
                <AssetCard
                  key={row.id}
                  row={row}
                  menuOpen={menuOpenId === row.id}
                  onMenuToggle={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                  onApprove={() => runApprove(row.id)}
                  onReject={() => runReject(row.id)}
                  onSubmitForReview={() => runSubmitForReview(row.id)}
                  onToggleLock={() => runToggleLock(row.id, !!row.lockedAt)}
                  onToggleStar={() => runToggleStar(row.id, row.starred)}
                  onArchive={() => runArchive(row.id)}
                  onDownload={() => runDownload(row)}
                />
              ))}
            </div>
          ) : (
            <AssetTable
              rows={filtered}
              selected={selected}
              onToggleSelected={toggleSelected}
              menuOpenId={menuOpenId}
              onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
              onApprove={runApprove}
              onReject={runReject}
              onSubmitForReview={runSubmitForReview}
              onToggleLock={runToggleLock}
              onArchive={runArchive}
              onDownload={runDownload}
            />
          )}
        </div>

        {/* Right insights rail */}
        <div className="w-80 shrink-0 space-y-4 hidden xl:block">
          <InsightCard title="Usage Analytics">
            <Donut centerLabel="Total assets" centerValue={kpi.total} segments={typeDistribution} />
          </InsightCard>
          <InsightCard title="Approval Workflow" action={<span className="text-xs text-surface-400">{approvalQueue.length} pending</span>}>
            {approvalQueue.length === 0 ? (
              <p className="text-xs text-surface-400">Everything is approved. Nothing waiting on review.</p>
            ) : (
              <ul className="space-y-3">
                {approvalQueue.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", TYPE_TILE_BG[r.assetType])}>
                      {(() => { const Icon = TYPE_ICONS[r.assetType]; return <Icon className={cn("w-3.5 h-3.5", TYPE_TILE_TEXT[r.assetType])} strokeWidth={1.8} />; })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-surface-800 truncate">{r.title}</p>
                      <p className="text-[11px] text-surface-400">
                        {r.approvalStatus === "rejected" ? `Changes requested · ${r.ownerName}` : `Requested by ${r.ownerName}`} · {relativeTime(r.updatedAt)}
                      </p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", APPROVAL_BADGE_CLASSES[r.approvalStatus])}>
                      {APPROVAL_LABELS[r.approvalStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </InsightCard>
          <InsightCard title="Recent Brand Updates">
            <ul className="space-y-2.5">
              {recentUpdates.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", TYPE_TILE_BG[r.assetType])}>
                    {(() => { const Icon = TYPE_ICONS[r.assetType]; return <Icon className={cn("w-3.5 h-3.5", TYPE_TILE_TEXT[r.assetType])} strokeWidth={1.8} />; })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-surface-800 truncate">{r.title}</p>
                    <p className="text-[11px] text-surface-400">Updated {relativeTime(r.updatedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </InsightCard>
          <InsightCard title="Brand Kit Completeness">
            <div className="flex items-center gap-4 mb-3">
              <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none" stroke="#4f46e5" strokeWidth="4"
                    strokeDasharray={`${(completeness.pct / 100) * 97.4} 97.4`} strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-surface-900">{completeness.pct}%</div>
              </div>
              <p className="text-xs text-surface-500">
                {completeness.pct === 100 ? "All core brand categories covered." : "Fill in the missing categories below to complete your kit."}
              </p>
            </div>
            <BarList items={completeness.detail.map((d) => ({ label: d.label, value: d.count }))} colorClass="bg-brand-500" />
          </InsightCard>
        </div>
      </div>

      {uploadOpen && (
        <UploadAssetModal brands={brands} events={events} workspaceName={workspaceName} onClose={() => setUploadOpen(false)} />
      )}
      {kitOpen && <CreateBrandKitModal brands={brands} workspaceName={workspaceName} onClose={() => setKitOpen(false)} />}
    </div>
  );
}

// ── Grid card ────────────────────────────────────────────────────────────

function AssetCard({
  row, menuOpen, onMenuToggle, onApprove, onReject, onSubmitForReview, onToggleLock, onToggleStar, onArchive, onDownload,
}: {
  row: BrandAssetRow;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSubmitForReview: () => void;
  onToggleLock: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDownload: () => void;
}) {
  const Icon = TYPE_ICONS[row.assetType];
  const format = formatLabel(row.mime, row.storagePath);
  const status: ApprovalStatus = row.lockedAt ? "locked" : row.approvalStatus;

  return (
    <div className="group bg-white rounded-xl border border-surface-200 shadow-card hover:border-brand-200 hover:shadow-md transition-all overflow-hidden flex flex-col">
      <Link href={`/event-manager/library/files/${row.id}`} className="relative block h-32 overflow-hidden">
        {row.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.previewUrl} alt={row.title} className="w-full h-full object-cover" />
        ) : row.assetType === "colour_palette" && row.hexColors.length > 0 ? (
          <div className="w-full h-full flex">
            {row.hexColors.slice(0, 6).map((hex, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: hex }} />
            ))}
          </div>
        ) : row.assetType === "typography" ? (
          <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", TYPE_TILE_BG[row.assetType])}>
            <span className="text-3xl font-serif text-surface-800">Aa</span>
            <span className="text-[10px] text-surface-500">{row.fontNames[0] ?? "Custom typeface"}</span>
          </div>
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", TYPE_TILE_BG[row.assetType])}>
            <Icon className={cn("w-8 h-8", TYPE_TILE_TEXT[row.assetType])} strokeWidth={1.5} />
          </div>
        )}
        <span className="absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white">{format}</span>
        <span className={cn("absolute top-2 right-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold", APPROVAL_BADGE_CLASSES[status])}>
          {APPROVAL_LABELS[status]}
        </span>
      </Link>

      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/event-manager/library/files/${row.id}`} className="min-w-0">
            <p className="text-sm font-semibold text-surface-900 truncate">{row.title}</p>
          </Link>
          <button onClick={onToggleStar} aria-label={row.starred ? "Unstar" : "Star"} className="shrink-0 text-surface-300 hover:text-warning-500">
            <Star className={cn("w-4 h-4", row.starred && "fill-warning-400 text-warning-500")} strokeWidth={1.8} />
          </button>
        </div>
        <p className="text-xs text-surface-400 truncate mt-0.5">{row.brandLabel}{row.eventName ? ` · ${row.eventName}` : ""}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-500">{ASSET_TYPE_LABELS[row.assetType]}</span>
          {row.versionCount > 1 && <span className="text-[10px] text-surface-400">v{row.versionCount}</span>}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <OwnerAvatar name={row.ownerName} size="xs" />
            <span className="text-[11px] text-surface-500 truncate">Updated {relativeTime(row.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onDownload} aria-label="Download" className="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-700"><Download className="w-3.5 h-3.5" /></button>
            <Link href={`/event-manager/library/files/${row.id}`} aria-label="Preview" className="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-700"><Eye className="w-3.5 h-3.5" /></Link>
            <div className="relative">
              <button onClick={onMenuToggle} aria-label="More actions" className="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-700"><MoreHorizontal className="w-3.5 h-3.5" /></button>
              {menuOpen && (
                <RowActionMenu
                  row={row}
                  onApprove={onApprove}
                  onReject={onReject}
                  onSubmitForReview={onSubmitForReview}
                  onToggleLock={onToggleLock}
                  onArchive={onArchive}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActionMenu({
  row, onApprove, onReject, onSubmitForReview, onToggleLock, onArchive,
}: {
  row: BrandAssetRow;
  onApprove: () => void;
  onReject: () => void;
  onSubmitForReview: () => void;
  onToggleLock: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="absolute right-0 top-7 z-20 w-48 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
      {row.approvalStatus !== "approved" && (
        <button onClick={onApprove} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success-700 hover:bg-success-50 text-left"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
      )}
      {row.approvalStatus !== "rejected" && (
        <button onClick={onReject} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><XCircle className="w-3.5 h-3.5" /> Request changes</button>
      )}
      {row.approvalStatus === "draft" && (
        <button onClick={onSubmitForReview} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Send className="w-3.5 h-3.5" /> Submit for review</button>
      )}
      <button onClick={onToggleLock} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left">
        {row.lockedAt ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} {row.lockedAt ? "Unlock" : "Lock"}
      </button>
      <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
    </div>
  );
}

// ── List / table view ────────────────────────────────────────────────────

function AssetTable({
  rows, selected, onToggleSelected, menuOpenId, onMenuToggle, onApprove, onReject, onSubmitForReview, onToggleLock, onArchive, onDownload,
}: {
  rows: BrandAssetRow[];
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  menuOpenId: string | null;
  onMenuToggle: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSubmitForReview: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  onArchive: (id: string) => void;
  onDownload: (row: BrandAssetRow) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-x-auto">
      <table className="w-full text-sm min-w-[920px]">
        <thead>
          <tr className="border-b border-surface-100 text-[11px] uppercase tracking-wider text-surface-400">
            <th className="w-8 py-2.5 pl-4"></th>
            <th className="text-left py-2.5 pr-3">Asset</th>
            <th className="text-left py-2.5 pr-3">Brand</th>
            <th className="text-left py-2.5 pr-3">Type</th>
            <th className="text-left py-2.5 pr-3">Format</th>
            <th className="text-left py-2.5 pr-3">Owner</th>
            <th className="text-left py-2.5 pr-3">Status</th>
            <th className="text-left py-2.5 pr-3">Usage</th>
            <th className="text-left py-2.5 pr-3">Updated</th>
            <th className="text-left py-2.5 pr-3">Visibility</th>
            <th className="w-8 py-2.5 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = TYPE_ICONS[row.assetType];
            const status: ApprovalStatus = row.lockedAt ? "locked" : row.approvalStatus;
            return (
              <tr key={row.id} className="border-b border-surface-50 last:border-0 hover:bg-surface-50/60">
                <td className="pl-4 py-2.5">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => onToggleSelected(row.id)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                </td>
                <td className="py-2.5 pr-3">
                  <Link href={`/event-manager/library/files/${row.id}`} className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden", TYPE_TILE_BG[row.assetType])}>
                      {row.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.previewUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon className={cn("w-4 h-4", TYPE_TILE_TEXT[row.assetType])} strokeWidth={1.8} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-surface-900 truncate">{row.title}</p>
                      <p className="text-[11px] text-surface-400">v{row.versionCount}.0</p>
                    </div>
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-surface-600 truncate max-w-[140px]">{row.brandLabel}</td>
                <td className="py-2.5 pr-3 text-surface-600">{ASSET_TYPE_LABELS[row.assetType]}</td>
                <td className="py-2.5 pr-3 text-surface-500">{formatLabel(row.mime, row.storagePath)}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    <OwnerAvatar name={row.ownerName} size="xs" />
                    <span className="text-surface-700 truncate max-w-[100px]">{row.ownerName}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", APPROVAL_BADGE_CLASSES[status])}>
                    {status === "locked" && <Lock className="w-2.5 h-2.5" />}
                    {status === "approved" && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {status === "pending_review" && <Clock className="w-2.5 h-2.5" />}
                    {APPROVAL_LABELS[status]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-surface-500">{row.useCount} {row.useCount === 1 ? "use" : "uses"}</td>
                <td className="py-2.5 pr-3 text-surface-500 whitespace-nowrap">{relativeTime(row.updatedAt)}</td>
                <td className="py-2.5 pr-3">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", visibilityBadgeClass(row.visibility))}>
                    {visibilityLabel(row.visibility)}
                  </span>
                </td>
                <td className="pr-4 py-2.5 relative">
                  <button onClick={() => onMenuToggle(row.id)} aria-label="More actions" className="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-700"><MoreHorizontal className="w-4 h-4" /></button>
                  {menuOpenId === row.id && (
                    <div className="absolute right-4 top-9 z-20 w-48 bg-white rounded-xl border border-surface-200 shadow-lg py-1 text-left">
                      {row.approvalStatus !== "approved" && (
                        <button onClick={() => onApprove(row.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success-700 hover:bg-success-50 text-left"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                      )}
                      {row.approvalStatus !== "rejected" && (
                        <button onClick={() => onReject(row.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><XCircle className="w-3.5 h-3.5" /> Request changes</button>
                      )}
                      {row.approvalStatus === "draft" && (
                        <button onClick={() => onSubmitForReview(row.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Send className="w-3.5 h-3.5" /> Submit for review</button>
                      )}
                      <button onClick={() => onToggleLock(row.id, !!row.lockedAt)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left">
                        {row.lockedAt ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} {row.lockedAt ? "Unlock" : "Lock"}
                      </button>
                      <button onClick={() => onDownload(row)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Download className="w-3.5 h-3.5" /> Download</button>
                      <button onClick={() => onArchive(row.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Upload modal ─────────────────────────────────────────────────────────

function UploadAssetModal({
  brands, events, workspaceName, onClose,
}: { brands: string[]; events: { id: string; name: string }[]; workspaceName: string; onClose: () => void }) {
  const [assetType, setAssetType] = useState<BrandAssetType>("logo");
  const [brandName, setBrandName] = useState(workspaceName);
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hexColors, setHexColors] = useState("");
  const [fontNames, setFontNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!file) { setError("Please choose a file to upload."); return; }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("title", title || file.name.replace(/\.[^.]+$/, ""));
    fd.set("assetType", assetType);
    fd.set("brandName", brandName);
    if (eventId) fd.set("eventId", eventId);
    if (hexColors) fd.set("hexColors", hexColors);
    if (fontNames) fd.set("fontNames", fontNames);
    startTransition(async () => {
      try {
        await uploadBrandAsset(fd);
        setSuccess(true);
        setTimeout(onClose, 900);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Upload Brand Asset</h2>
          <button onClick={onClose} disabled={pending} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Asset type</label>
            <select value={assetType} onChange={(e) => setAssetType(e.target.value as BrandAssetType)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
              {BRAND_ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Asset name</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer Gala Master Logo" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Brand</label>
              <input list="brand-options" value={brandName} onChange={(e) => setBrandName(e.target.value)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              <datalist id="brand-options">
                {brands.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Linked event (optional)</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
                <option value="">No event</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          {assetType === "colour_palette" && (
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Hex colours (comma separated)</label>
              <input value={hexColors} onChange={(e) => setHexColors(e.target.value)} placeholder="#4f46e5, #0ea5e9, #f59e0b" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
            </div>
          )}
          {assetType === "typography" && (
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Font names (comma separated)</label>
              <input value={fontNames} onChange={(e) => setFontNames(e.target.value)} placeholder="Playfair Display, Inter" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
            </div>
          )}
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-8 gap-2"
          >
            <Upload className="h-6 w-6 text-surface-400" />
            {file ? (
              <p className="text-sm text-surface-700 font-medium">{file.name} · {formatBytes(file.size)}</p>
            ) : (
              <p className="text-sm text-surface-600">Drop a file here or <span className="text-brand-600">browse</span></p>
            )}
            <input ref={inputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          </div>
          {error && <div className="px-3 py-2 rounded-lg bg-danger-50 border border-danger-200 text-xs text-danger-700">{error}</div>}
          {success && <div className="px-3 py-2 rounded-lg bg-success-50 border border-success-200 text-xs text-success-700 font-medium">Asset uploaded — pending review.</div>}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-surface-100 bg-surface-50">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100">Cancel</button>
          <button onClick={submit} disabled={pending || success} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : "Upload Asset"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create brand kit modal ───────────────────────────────────────────────

function CreateBrandKitModal({ brands, workspaceName, onClose }: { brands: string[]; workspaceName: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [brandName, setBrandName] = useState(workspaceName);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!title.trim()) { setError("Brand kit name is required."); return; }
    setError(null);
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("brandName", brandName);
    if (description) fd.set("description", description);
    if (file) fd.set("file", file);
    startTransition(async () => {
      try {
        await createBrandKit(fd);
        setSuccess(true);
        setTimeout(onClose, 900);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create brand kit");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Create Brand Kit</h2>
          <button onClick={onClose} disabled={pending} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Kit name</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer Gala Brand Kit" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Brand</label>
            <input list="kit-brand-options" value={brandName} onChange={(e) => setBrandName(e.target.value)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
            <datalist id="kit-brand-options">
              {brands.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
          </div>
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-6 gap-1.5"
          >
            <FolderPlus className="h-6 w-6 text-surface-400" />
            {file ? (
              <p className="text-sm text-surface-700 font-medium">{file.name}</p>
            ) : (
              <p className="text-xs text-surface-500">Optionally attach a packaged kit file (ZIP) — or create an empty kit and add assets later.</p>
            )}
            <input ref={inputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          </div>
          {error && <div className="px-3 py-2 rounded-lg bg-danger-50 border border-danger-200 text-xs text-danger-700">{error}</div>}
          {success && <div className="px-3 py-2 rounded-lg bg-success-50 border border-success-200 text-xs text-success-700 font-medium">Brand kit created as a draft.</div>}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-surface-100 bg-surface-50">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100">Cancel</button>
          <button onClick={submit} disabled={pending || success} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create Brand Kit"}
          </button>
        </div>
      </div>
    </div>
  );
}
