"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload, FolderPlus, Search, SlidersHorizontal, Star, Share2, Download, MoreHorizontal,
  Archive, Trash2, X, Loader2, CheckCircle2, AlertCircle, FileText, Image as ImageIcon, Film,
  Music, Table2, MonitorPlay, File as FileIcon, Files as FilesIcon, HardDrive, Clock3, Copy,
  ExternalLink, ChevronLeft, ChevronRight, Folder,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";
import { OwnerAvatar, ViewSwitcher, InsightCard } from "../_shared";
import { fileTypeBucket, type FileTypeBucket } from "../library-utils";
import { finalizeLibraryUpload, toggleFavourite, archiveAssets, createShareLink, createFolder } from "./actions";

export interface FileRow {
  id: string;
  title: string;
  kind: string;
  mime: string | null;
  sizeBytes: number;
  sizeLabel: string;
  tags: string[];
  ownerId: string | null;
  ownerName: string;
  eventId: string | null;
  eventName: string | null;
  visibility: "workspace" | "restricted" | "link" | "public_token";
  pinned: boolean;
  useCount: number;
  storagePath: string | null;
  sharedExternally: boolean;
  createdAt: string;
  updatedAt: string;
  dateLabel: string;
  updatedLabel: string;
  updatedRelative: string;
}

interface Kpis {
  totalFiles: number;
  newThisMonth: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  sharedExternallyCount: number;
  recentlyUpdatedCount: number;
}

function fmtGb(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const BUCKET_STYLE: Record<FileTypeBucket, { icon: LucideIcon; tint: string; iconColor: string; badgeBg: string; badgeText: string }> = {
  pdf: { icon: FileText, tint: "bg-danger-50", iconColor: "text-danger-500", badgeBg: "bg-danger-600", badgeText: "text-white" },
  image: { icon: ImageIcon, tint: "bg-brand-50", iconColor: "text-brand-500", badgeBg: "bg-brand-600", badgeText: "text-white" },
  video: { icon: Film, tint: "bg-violet-50", iconColor: "text-violet-500", badgeBg: "bg-violet-600", badgeText: "text-white" },
  audio: { icon: Music, tint: "bg-pink-50", iconColor: "text-pink-500", badgeBg: "bg-pink-600", badgeText: "text-white" },
  archive: { icon: Archive, tint: "bg-warning-50", iconColor: "text-warning-500", badgeBg: "bg-warning-600", badgeText: "text-white" },
  presentation: { icon: MonitorPlay, tint: "bg-info-50", iconColor: "text-info-500", badgeBg: "bg-info-600", badgeText: "text-white" },
  spreadsheet: { icon: Table2, tint: "bg-success-50", iconColor: "text-success-500", badgeBg: "bg-success-600", badgeText: "text-white" },
  document: { icon: FileText, tint: "bg-surface-100", iconColor: "text-surface-400", badgeBg: "bg-surface-600", badgeText: "text-white" },
};

function mimeBadge(mime: string | null, kind: string): string {
  const sub = (mime ?? "").split("/")[1] ?? "";
  if (sub.includes("pdf")) return "PDF";
  if (sub.includes("zip")) return "ZIP";
  if (sub.includes("png")) return "PNG";
  if (sub.includes("jpeg") || sub.includes("jpg")) return "JPG";
  if (sub.includes("gif")) return "GIF";
  if (sub.includes("webp")) return "WEBP";
  if (sub.includes("svg")) return "SVG";
  if (sub.includes("mp4")) return "MP4";
  if (sub.includes("webm")) return "WEBM";
  if (sub.includes("quicktime")) return "MOV";
  if (sub.includes("mpeg") || sub.includes("mp3")) return "MP3";
  if (sub.includes("wav")) return "WAV";
  if (sub.includes("presentation")) return "PPT";
  if (sub.includes("sheet") || sub.includes("excel")) return "XLS";
  if (sub.includes("word")) return "DOC";
  if (sub.includes("csv")) return "CSV";
  if (sub.includes("plain")) return "TXT";
  const guess = sub.split(/[.+]/).pop();
  return guess ? guess.toUpperCase().slice(0, 4) : kind.slice(0, 3).toUpperCase();
}

function visibilityLabel(row: FileRow): "Shared" | "Internal" {
  return row.sharedExternally ? "Shared" : "Internal";
}

const DATE_RANGES = [
  { value: "all", label: "Date: Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
] as const;
type DateRange = (typeof DATE_RANGES)[number]["value"];

const SORT_OPTIONS = [
  { value: "updated_desc", label: "Sort by: Recently updated" },
  { value: "created_desc", label: "Sort by: Recently uploaded" },
  { value: "name_asc", label: "Sort by: Name (A–Z)" },
  { value: "size_desc", label: "Sort by: Largest size" },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const PAGE_SIZES_GRID = [12, 24, 48];
const PAGE_SIZES_LIST = [10, 20, 50];

const BUCKET_LABEL: Record<FileTypeBucket, string> = {
  pdf: "PDFs",
  presentation: "Presentations",
  spreadsheet: "Spreadsheets",
  image: "Images",
  video: "Video",
  audio: "Audio",
  archive: "Archives",
  document: "Documents",
};

export function FilesClient({
  files, events, view, storageQuotaBytes, kpis, workspaceId,
}: {
  files: FileRow[];
  events: { id: string; name: string }[];
  view: "grid" | "list";
  storageQuotaBytes: number;
  kpis: Kpis;
  workspaceId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<FileTypeBucket>>(new Set());
  const [activeEvents, setActiveEvents] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "shared" | "internal">("all");
  const [sortBy, setSortBy] = useState<SortValue>("updated_desc");
  const [showFilters, setShowFilters] = useState(true);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(view === "list" ? 10 : 12);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sharePopoverId, setSharePopoverId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "archive" | "delete"; ids: string[] } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) if (f.ownerId) map.set(f.ownerId, f.ownerName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [files]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) for (const t of f.tags) set.add(t);
    return Array.from(set).sort();
  }, [files]);

  const typeCounts = useMemo(() => {
    const map = new Map<FileTypeBucket, number>();
    for (const f of files) {
      const b = fileTypeBucket(f.kind, f.mime);
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return map;
  }, [files]);

  const eventCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) if (f.eventId) map.set(f.eventId, (map.get(f.eventId) ?? 0) + 1);
    return map;
  }, [files]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  }

  function toggleType(bucket: FileTypeBucket) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
    setPage(1);
  }

  function toggleEvent(id: string) {
    setActiveEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  }

  function clearAll() {
    setSearch("");
    setActiveTypes(new Set());
    setActiveEvents(new Set());
    setOwnerFilter("all");
    setDateFilter("all");
    setTagFilter("all");
    setVisibilityFilter("all");
    setPage(1);
  }

  const filtersActive =
    search.trim() !== "" ||
    activeTypes.size > 0 ||
    activeEvents.size > 0 ||
    ownerFilter !== "all" ||
    dateFilter !== "all" ||
    tagFilter !== "all" ||
    visibilityFilter !== "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date().getTime();
    const list = files.filter((f) => {
      if (q) {
        const hay = `${f.title} ${f.tags.join(" ")} ${f.eventName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeTypes.size > 0 && !activeTypes.has(fileTypeBucket(f.kind, f.mime))) return false;
      if (activeEvents.size > 0 && (!f.eventId || !activeEvents.has(f.eventId))) return false;
      if (ownerFilter !== "all" && f.ownerId !== ownerFilter) return false;
      if (tagFilter !== "all" && !f.tags.includes(tagFilter)) return false;
      if (visibilityFilter !== "all") {
        const label = visibilityLabel(f);
        if (visibilityFilter === "shared" && label !== "Shared") return false;
        if (visibilityFilter === "internal" && label !== "Internal") return false;
      }
      if (dateFilter !== "all") {
        const created = new Date(f.createdAt).getTime();
        if (dateFilter === "7d" && now - created > 7 * 86400000) return false;
        if (dateFilter === "30d" && now - created > 30 * 86400000) return false;
        if (dateFilter === "year" && new Date(f.createdAt).getFullYear() !== new Date().getFullYear()) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "updated_desc") return b.updatedAt.localeCompare(a.updatedAt);
      if (sortBy === "created_desc") return b.createdAt.localeCompare(a.createdAt);
      if (sortBy === "name_asc") return a.title.localeCompare(b.title);
      if (sortBy === "size_desc") return b.sizeBytes - a.sizeBytes;
      return 0;
    });
  }, [files, search, activeTypes, activeEvents, ownerFilter, tagFilter, visibilityFilter, dateFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const recentActivity = useMemo(
    () => [...files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [files]
  );
  const mostUsed = useMemo(() => [...files].sort((a, b) => b.useCount - a.useCount).slice(0, 5), [files]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((f) => next.has(f.id));
      for (const f of pageItems) {
        if (allSelected) next.delete(f.id);
        else next.add(f.id);
      }
      return next;
    });
  }

  async function handleDownload(row: FileRow) {
    if (!row.storagePath) {
      showToast("This file has no stored object to download.");
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch("/api/r2/presign-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, objectKey: row.storagePath }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Download failed");
      const { downloadUrl } = await res.json();
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not generate download link");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkDownload(ids: string[]) {
    for (const id of ids) {
      const row = files.find((f) => f.id === id);
      if (row) await handleDownload(row);
    }
  }

  function handleToggleFavourite(row: FileRow) {
    setBusyId(row.id);
    startTransition(async () => {
      try {
        await toggleFavourite(row.id, !row.pinned);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not update favourite");
      } finally {
        setBusyId(null);
      }
    });
  }

  async function handleShare(row: FileRow) {
    setBusyId(row.id);
    try {
      const { token } = await createShareLink(row.id);
      const url = `${window.location.origin}/event-manager/library/files/${row.id}?share=${token}`;
      setShareLink(url);
      setSharePopoverId(row.id);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create share link");
    } finally {
      setBusyId(null);
    }
  }

  function copyShareLink() {
    if (!shareLink) return;
    navigator.clipboard?.writeText(shareLink).then(() => showToast("Share link copied"));
  }

  function runConfirmedAction() {
    if (!confirmAction) return;
    const { ids, type } = confirmAction;
    startTransition(async () => {
      try {
        await archiveAssets(ids);
        setSelected(new Set());
        showToast(type === "delete" ? "Files deleted" : "Files archived");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Action failed");
      } finally {
        setConfirmAction(null);
      }
    });
  }

  const storagePct = storageQuotaBytes > 0 ? Math.min(100, (kpis.storageUsedBytes / storageQuotaBytes) * 100) : 0;

  return (
    <div className="flex-1 p-6 space-y-5">
      {/* Header actions */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <button
          onClick={() => setFolderOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          New folder
        </button>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload files
        </button>
      </div>

      {/* KPI row */}
      <KPIGrid className="xl:grid-cols-4">
        <MetricCard
          label="Total Files"
          value={kpis.totalFiles}
          delta={kpis.newThisMonth > 0 ? { value: `${kpis.newThisMonth} this month`, positive: true } : undefined}
          icon={FilesIcon}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
        />
        <div className="bg-white rounded-xl border border-surface-200 px-5 py-4 shadow-card">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-info-50 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5 text-info-600" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Storage Used</p>
              <p className="mt-0.5 text-2xl font-bold text-surface-900 tabular-nums">{fmtGb(kpis.storageUsedBytes)}</p>
              <p className="mt-1 text-xs text-surface-500">of {fmtGb(storageQuotaBytes)} ({storagePct.toFixed(1)}%)</p>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div className="h-full rounded-full bg-success-500" style={{ width: `${Math.max(2, storagePct)}%` }} />
          </div>
        </div>
        <MetricCard
          label="Shared Externally"
          value={kpis.sharedExternallyCount}
          delta={
            kpis.totalFiles > 0
              ? { value: `${((kpis.sharedExternallyCount / kpis.totalFiles) * 100).toFixed(1)}% of total files`, positive: true }
              : undefined
          }
          icon={Share2}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <MetricCard
          label="Recently Updated"
          value={kpis.recentlyUpdatedCount}
          delta={{ value: "in the last 7 days", positive: true }}
          icon={Clock3}
          iconBg="bg-warning-50"
          iconColor="text-warning-600"
        />
      </KPIGrid>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {showFilters ? "Hide filters" : "Show filters"}
        </button>

        <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[180px] max-w-xs">
          <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search files by name, tag, event..."
            className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
          />
        </div>

        <select
          value={activeTypes.size === 1 ? Array.from(activeTypes)[0] : "all"}
          onChange={(e) => { setActiveTypes(e.target.value === "all" ? new Set() : new Set([e.target.value as FileTypeBucket])); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          <option value="all">File type: All</option>
          {Array.from(typeCounts.keys()).map((bucket) => (
            <option key={bucket} value={bucket}>{BUCKET_LABEL[bucket]}</option>
          ))}
        </select>

        <select
          value={activeEvents.size === 1 ? Array.from(activeEvents)[0] : "all"}
          onChange={(e) => { setActiveEvents(e.target.value === "all" ? new Set() : new Set([e.target.value])); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          <option value="all">Event: All</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          <option value="all">Uploader: All</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>

        <select
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value as DateRange); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          {DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          <option value="all">Tags: All</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={visibilityFilter}
          onChange={(e) => { setVisibilityFilter(e.target.value as typeof visibilityFilter); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
        >
          <option value="all">Visibility: All</option>
          <option value="shared">Shared</option>
          <option value="internal">Internal</option>
        </select>

        {filtersActive && (
          <button onClick={clearAll} className="text-sm font-medium text-brand-600 hover:underline shrink-0">Clear all</button>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortValue)}
            className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700"
          >
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <ViewSwitcher basePath="/event-manager/library/files" />
          {view === "list" && selected.size > 0 && (
            <span className="text-xs font-medium text-surface-500 px-2">{selected.size} selected</span>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left filter panel */}
        {showFilters && (
          <aside className="w-56 shrink-0 space-y-5 hidden lg:block">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Filters</h3>
                {filtersActive && <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:underline">Clear all</button>}
              </div>

              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">File type</p>
              <ul className="space-y-1.5 mb-4">
                <li>
                  <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                    <input type="checkbox" checked={activeTypes.size === 0} onChange={() => setActiveTypes(new Set())} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                    All files
                    <span className="ml-auto text-xs text-surface-400 tabular-nums">{files.length}</span>
                  </label>
                </li>
                {Array.from(typeCounts.entries()).map(([bucket, count]) => (
                  <li key={bucket}>
                    <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                      <input type="checkbox" checked={activeTypes.has(bucket)} onChange={() => toggleType(bucket)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                      {BUCKET_LABEL[bucket]}
                      <span className="ml-auto text-xs text-surface-400 tabular-nums">{count}</span>
                    </label>
                  </li>
                ))}
              </ul>

              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Event</p>
              <ul className="space-y-1.5">
                <li>
                  <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                    <input type="checkbox" checked={activeEvents.size === 0} onChange={() => setActiveEvents(new Set())} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                    All events
                    <span className="ml-auto text-xs text-surface-400 tabular-nums">{files.length}</span>
                  </label>
                </li>
                {events.slice(0, showAllEvents ? undefined : 5).map((ev) => (
                  <li key={ev.id}>
                    <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                      <input type="checkbox" checked={activeEvents.has(ev.id)} onChange={() => toggleEvent(ev.id)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                      <span className="truncate">{ev.name}</span>
                      <span className="ml-auto text-xs text-surface-400 tabular-nums shrink-0">{eventCounts.get(ev.id) ?? 0}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {events.length > 5 && (
                <button onClick={() => setShowAllEvents((s) => !s)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
                  {showAllEvents ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {view === "list" && selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-brand-50 border border-brand-100">
              <span className="text-sm font-medium text-brand-700">{selected.size} file{selected.size === 1 ? "" : "s"} selected</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => handleBulkDownload(Array.from(selected))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-surface-200 text-surface-700 text-xs font-semibold hover:bg-surface-50">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button onClick={() => setConfirmAction({ type: "archive", ids: Array.from(selected) })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-surface-200 text-surface-700 text-xs font-semibold hover:bg-surface-50">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
                <button onClick={() => setConfirmAction({ type: "delete", ids: Array.from(selected) })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs font-semibold hover:bg-danger-100">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg text-surface-400 hover:bg-white"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState
                icon={FilesIcon}
                title={files.length === 0 ? "No files yet" : "No files match your filters"}
                description={
                  files.length === 0
                    ? "Upload menus, flyers, posters, PDFs and other event assets to build your library."
                    : "Try clearing filters or searching a different term."
                }
                action={
                  files.length === 0 ? (
                    <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors">
                      <Upload className="w-4 h-4" /> Upload Files
                    </button>
                  ) : (
                    <button onClick={clearAll} className="text-sm font-medium text-brand-600 hover:underline">Clear all filters</button>
                  )
                }
                compact
              />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {pageItems.map((file) => {
                const bucket = fileTypeBucket(file.kind, file.mime);
                const style = BUCKET_STYLE[bucket];
                const Icon = style.icon;
                const label = visibilityLabel(file);
                return (
                  <div key={file.id} className="group relative bg-white rounded-xl border border-surface-200 shadow-card hover:border-brand-200 hover:shadow-md transition-all overflow-hidden">
                    <Link href={`/event-manager/library/files/${file.id}`} className="block">
                      <div className={cn("h-28 flex items-center justify-center relative", style.tint)}>
                        <span className={cn("absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide", style.badgeBg, style.badgeText)}>
                          {mimeBadge(file.mime, file.kind)}
                        </span>
                        <Icon className={cn("w-8 h-8", style.iconColor)} strokeWidth={1.5} />
                      </div>
                    </Link>
                    <div className="p-3">
                      <Link href={`/event-manager/library/files/${file.id}`} className="block">
                        <p className="text-sm font-semibold text-surface-900 truncate leading-tight hover:text-brand-600">{file.title}</p>
                      </Link>
                      <p className="text-xs text-surface-400 truncate mt-0.5">{file.eventName ?? "No event"}</p>
                      <div className="flex items-center gap-1.5 mt-2 min-w-0">
                        <OwnerAvatar name={file.ownerName} size="xs" />
                        <span className="text-xs text-surface-500 truncate">{file.ownerName}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[11px] text-surface-400">
                        <span>{file.dateLabel}</span>
                        <span>{file.sizeLabel}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleToggleFavourite(file)}
                            disabled={busyId === file.id}
                            aria-label={file.pinned ? "Remove favourite" : "Mark as favourite"}
                            className="p-1 rounded hover:bg-surface-100"
                          >
                            <Star className={cn("w-3.5 h-3.5", file.pinned ? "fill-warning-400 text-warning-500" : "text-surface-400")} />
                          </button>
                          <div className="relative">
                            <button onClick={() => handleShare(file)} disabled={busyId === file.id} aria-label="Share file" className="p-1 rounded hover:bg-surface-100">
                              <Share2 className="w-3.5 h-3.5 text-surface-400" />
                            </button>
                            {sharePopoverId === file.id && shareLink && (
                              <SharePopover link={shareLink} onCopy={copyShareLink} onClose={() => setSharePopoverId(null)} />
                            )}
                          </div>
                          <button onClick={() => handleDownload(file)} disabled={busyId === file.id} aria-label="Download file" className="p-1 rounded hover:bg-surface-100">
                            <Download className="w-3.5 h-3.5 text-surface-400" />
                          </button>
                          <div className="relative">
                            <button onClick={() => setMenuOpenId(menuOpenId === file.id ? null : file.id)} aria-label="More actions" className="p-1 rounded hover:bg-surface-100">
                              <MoreHorizontal className="w-3.5 h-3.5 text-surface-400" />
                            </button>
                            {menuOpenId === file.id && (
                              <OverflowMenu
                                file={file}
                                onArchive={() => { setConfirmAction({ type: "archive", ids: [file.id] }); setMenuOpenId(null); }}
                                onClose={() => setMenuOpenId(null)}
                              />
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                          label === "Shared" ? "bg-brand-50 text-brand-700" : "bg-surface-100 text-surface-500"
                        )}>
                          {label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && pageItems.every((f) => selected.has(f.id))}
                          onChange={toggleSelectAllOnPage}
                          className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">File Name</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Tags</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Size</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Last Updated</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Visibility</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="w-10 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {pageItems.map((file) => {
                      const bucket = fileTypeBucket(file.kind, file.mime);
                      const style = BUCKET_STYLE[bucket];
                      const Icon = style.icon;
                      const label = visibilityLabel(file);
                      return (
                        <tr key={file.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleSelect(file.id)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", style.tint)}>
                                <Icon className={cn("w-4 h-4", style.iconColor)} strokeWidth={1.8} />
                              </div>
                              <div className="min-w-0">
                                <Link href={`/event-manager/library/files/${file.id}`} className="text-sm font-semibold text-surface-900 hover:text-brand-600 truncate block">
                                  {file.title}
                                </Link>
                                <p className="text-xs text-surface-400 truncate">{file.eventName ?? "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-surface-600 whitespace-nowrap">{BUCKET_LABEL[bucket]}</td>
                          <td className="px-3 py-3 text-surface-600 truncate max-w-[140px]">{file.eventName ?? "—"}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <OwnerAvatar name={file.ownerName} size="xs" />
                              <span className="text-surface-700 truncate">{file.ownerName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                              {file.tags.slice(0, 2).map((t) => (
                                <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-600">{t}</span>
                              ))}
                              {file.tags.length > 2 && <span className="text-[10px] text-surface-400">+{file.tags.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-surface-600 whitespace-nowrap">{file.sizeLabel}</td>
                          <td className="px-3 py-3 text-surface-500 whitespace-nowrap">{file.updatedLabel}</td>
                          <td className="px-3 py-3">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              label === "Shared" ? "bg-brand-50 text-brand-700" : "bg-surface-100 text-surface-600"
                            )}>
                              {label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-700">
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          </td>
                          <td className="px-3 py-3 relative">
                            <button onClick={() => setMenuOpenId(menuOpenId === file.id ? null : file.id)} aria-label="More actions" className="p-1.5 rounded hover:bg-surface-100 text-surface-400">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuOpenId === file.id && (
                              <OverflowMenu
                                file={file}
                                onArchive={() => { setConfirmAction({ type: "archive", ids: [file.id] }); setMenuOpenId(null); }}
                                onClose={() => setMenuOpenId(null)}
                                align="right"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-1 pt-1">
              <p className="text-xs text-surface-500">
                Showing {(safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} files
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-surface-600 px-2">Page {safePage} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-500 disabled:opacity-40 hover:bg-surface-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1.5 rounded-lg border border-surface-200 bg-white text-xs text-surface-600"
                >
                  {(view === "list" ? PAGE_SIZES_LIST : PAGE_SIZES_GRID).map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Right insights rail */}
        <aside className="w-80 shrink-0 space-y-4 hidden xl:block">
          <InsightCard title="Recent activity">
            <ul className="space-y-3">
              {recentActivity.map((f) => {
                const isNew = f.createdAt === f.updatedAt;
                return (
                  <li key={f.id} className="flex items-start gap-2.5">
                    <OwnerAvatar name={f.ownerName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-surface-500">
                        <span className="font-medium text-surface-800">{f.ownerName}</span> {isNew ? "uploaded" : "updated"}
                      </p>
                      <Link href={`/event-manager/library/files/${f.id}`} className="text-sm font-semibold text-surface-900 hover:text-brand-600 truncate block">
                        {f.title}
                      </Link>
                      <p className="text-[11px] text-surface-400">{f.updatedRelative}</p>
                    </div>
                  </li>
                );
              })}
              {recentActivity.length === 0 && <li className="text-xs text-surface-400">No activity yet.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Most-used assets">
            <ul className="space-y-2">
              {mostUsed.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <Link href={`/event-manager/library/files/${f.id}`} className="text-sm text-surface-700 hover:text-brand-600 truncate min-w-0">
                    {f.title}
                  </Link>
                  <span className="text-xs text-surface-400 shrink-0 tabular-nums">{f.useCount} use{f.useCount === 1 ? "" : "s"}</span>
                </li>
              ))}
              {mostUsed.length === 0 && <li className="text-xs text-surface-400">No usage data yet.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Storage">
            <p className="text-sm text-surface-600">{fmtGb(kpis.storageUsedBytes)} of {fmtGb(storageQuotaBytes)} used</p>
            <div className="mt-2 h-2 rounded-full bg-surface-100 overflow-hidden">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, storagePct)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-surface-400">{fmtGb(Math.max(0, storageQuotaBytes - kpis.storageUsedBytes))} free</p>
          </InsightCard>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-surface-900 text-white text-sm shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning-400" />
          {toast}
        </div>
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === "delete" ? "Delete files" : "Archive files"}
          description={
            confirmAction.type === "delete"
              ? `${confirmAction.ids.length} file${confirmAction.ids.length === 1 ? "" : "s"} will be moved out of the active library. This can be restored by an admin from Supabase if needed.`
              : `${confirmAction.ids.length} file${confirmAction.ids.length === 1 ? "" : "s"} will be archived and hidden from Files.`
          }
          confirmLabel={confirmAction.type === "delete" ? "Delete" : "Archive"}
          danger={confirmAction.type === "delete"}
          onConfirm={runConfirmedAction}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {uploadOpen && (
        <UploadModal
          workspaceId={workspaceId}
          events={events}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); router.refresh(); }}
        />
      )}

      {folderOpen && (
        <NewFolderModal
          onClose={() => setFolderOpen(false)}
          onDone={() => { setFolderOpen(false); router.refresh(); showToast("Folder created"); }}
        />
      )}
    </div>
  );
}

function SharePopover({ link, onCopy, onClose }: { link: string; onCopy: () => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-7 z-20 w-64 bg-white rounded-xl border border-surface-200 shadow-lg p-3">
      <p className="text-xs font-semibold text-surface-700 mb-1.5">Share link</p>
      <div className="flex items-center gap-1.5">
        <input readOnly value={link} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg border border-surface-200 bg-surface-50 text-surface-600" />
        <button onClick={onCopy} className="p-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 text-surface-500 shrink-0"><Copy className="w-3.5 h-3.5" /></button>
      </div>
      <button onClick={onClose} className="mt-2 text-xs font-medium text-surface-500 hover:underline">Close</button>
    </div>
  );
}

function OverflowMenu({
  file, onArchive, onClose, align = "left",
}: { file: FileRow; onArchive: () => void; onClose: () => void; align?: "left" | "right" }) {
  return (
    <div className={cn("absolute top-8 z-20 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1", align === "right" ? "right-0" : "left-0")}>
      <Link href={`/event-manager/library/files/${file.id}`} onClick={onClose} className="flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <ExternalLink className="w-3.5 h-3.5" /> Open
      </Link>
      <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left">
        <Archive className="w-3.5 h-3.5" /> Archive
      </button>
    </div>
  );
}

function ConfirmModal({
  title, description, confirmLabel, danger, onConfirm, onClose,
}: { title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-surface-900 mb-1.5">{title}</h3>
        <p className="text-sm text-surface-500 mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50">Cancel</button>
          <button
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 rounded-lg text-white text-sm font-medium",
              danger ? "bg-danger-600 hover:bg-danger-700" : "bg-brand-600 hover:bg-brand-700"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewFolderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) { setError("Folder name is required"); return; }
    startTransition(async () => {
      try {
        await createFolder(name.trim());
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create folder");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center"><Folder className="w-4 h-4 text-brand-600" /></div>
          <h3 className="text-base font-semibold text-surface-900">New folder</h3>
        </div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Folder name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="e.g. Sponsor Assets"
          className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-1.5"
        />
        {error && <p className="text-xs text-danger-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50">Cancel</button>
          <button onClick={submit} disabled={pending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
            Create folder
          </button>
        </div>
      </div>
    </div>
  );
}

type UploadFileState = {
  file: File;
  title: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function mimeToKind(mime: string): "image" | "video" | "audio" | "archive" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("zip")) return "archive";
  return "document";
}

function UploadModal({
  workspaceId, events, onClose, onDone,
}: { workspaceId: string; events: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<UploadFileState[]>([]);
  const [eventId, setEventId] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).slice(0, Math.max(0, 20 - items.length));
    setItems((prev) => [
      ...prev,
      ...picked.map((file) => ({
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        status: "pending" as const,
      })),
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function renameItem(idx: number, title: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, title } : it)));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  async function uploadOne(item: UploadFileState, idx: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "uploading" } : it)));
    try {
      const contentType = item.file.type || "application/octet-stream";
      const presignRes = await fetch("/api/r2/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, kind: "library-asset", filename: item.file.name, contentType }),
      });
      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not prepare upload");
      }
      const { objectKey, uploadUrl } = await presignRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: item.file });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await finalizeLibraryUpload({
        title: item.title.trim() || item.file.name,
        kind: mimeToKind(contentType),
        mime: contentType,
        sizeBytes: item.file.size,
        storagePath: objectKey,
        eventId: eventId || null,
        tags,
      });

      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "done" } : it)));
    } catch (err) {
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "error", error: err instanceof Error ? err.message : "Upload failed" } : it)));
    }
  }

  function handleSubmit() {
    if (items.length === 0) { setGlobalError("Please select at least one file."); return; }
    setGlobalError(null);
    startTransition(async () => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].status === "done") continue;
        await uploadOne(items[i], i);
      }
      setAllDone(true);
    });
  }

  const anyError = items.some((it) => it.status === "error");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-surface-900">Upload Files</h2>
            <p className="text-xs text-surface-500">Up to 20 files · Max 100 MB each</p>
          </div>
          <button onClick={onClose} disabled={isPending} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Related event (optional)</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={isPending} className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900">
                <option value="">No event</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Tags (comma separated)</label>
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} disabled={isPending} placeholder="Marketing, Poster" className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900" />
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => !isPending && inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-8 gap-2"
          >
            <Upload className="h-7 w-7 text-surface-400" />
            <p className="text-sm text-surface-600 font-medium">Drop files here or <span className="text-brand-600">browse</span></p>
            <p className="text-xs text-surface-400">PDF, images, video, audio, docs and archives</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
              className="hidden"
              disabled={isPending}
            />
          </div>

          {items.length > 0 && (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-center gap-2.5 rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                  {it.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 text-brand-500 animate-spin shrink-0" />
                  ) : it.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0" />
                  ) : it.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-danger-600 shrink-0" />
                  ) : (
                    <FileIcon className="h-4 w-4 text-surface-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <input
                      value={it.title}
                      onChange={(e) => renameItem(idx, e.target.value)}
                      disabled={isPending}
                      className="w-full bg-transparent text-xs font-medium text-surface-900 focus:outline-none focus:bg-white rounded px-1 -mx-1"
                    />
                    <p className="text-[11px] text-surface-400">
                      {(it.file.size / 1024).toFixed(0)} KB{it.status === "error" && it.error ? ` · ${it.error}` : ""}
                    </p>
                  </div>
                  {it.status !== "uploading" && it.status !== "done" && (
                    <button type="button" onClick={() => removeItem(idx)} disabled={isPending} className="text-surface-400 hover:text-danger-600 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {globalError && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700 whitespace-pre-line">{globalError}</p>
            </div>
          )}
          {allDone && !anyError && (
            <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-success-600" />
              <p className="text-xs text-success-700 font-medium">All files uploaded successfully!</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-surface-100 bg-surface-50 shrink-0">
          <button onClick={onClose} disabled={isPending} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100">
            {allDone && !anyError ? "Close" : "Cancel"}
          </button>
          {!(allDone && !anyError) && (
            <button
              onClick={handleSubmit}
              disabled={isPending || items.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>) : (<><Upload className="h-4 w-4" /> Upload {items.length > 0 ? `${items.length} file${items.length !== 1 ? "s" : ""}` : ""}</>)}
            </button>
          )}
          {allDone && !anyError && (
            <button onClick={onDone} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
