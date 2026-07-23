"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Download, Share2, Link2, Copy, Archive, Sparkles, Plus, X, Trash2,
  Search, FileText, RefreshCw, Save,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { formatBytes, formatLibDate, kindLabel } from "../../library-utils";
import {
  AUDIENCE_OPTIONS, VISIBILITY_OPTIONS,
  type PackAudience, type PackVisibility, type PackSmartRules,
} from "../pack-filter";
import {
  updateEventPack, materializeSmartPack, addAssetToPack, removeAssetFromPack,
  duplicateEventPack, archiveEventPack, getPackDownloadUrls, sharePackExternally, copyPackLink,
} from "../actions";
import type { PickableAsset } from "../EventPacksClient";

export interface PackDetailData {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  ownerName: string;
  eventId: string | null;
  eventName: string | null;
  smart: boolean;
  audience: PackAudience;
  visibility: PackVisibility;
  rules: PackSmartRules | null;
  downloads: number;
  shares: number;
  lastDownloadAt: string | null;
  lastSharedAt: string | null;
}

export interface PackMemberAsset {
  id: string;
  title: string;
  kind: string;
  mime: string | null;
  sizeBytes: number;
  visibility: string;
  tags: string[];
}

export function PackDetailClient({
  pack, members, events, assets,
}: {
  pack: PackDetailData;
  members: PackMemberAsset[];
  events: { id: string; name: string }[];
  assets: PickableAsset[];
}) {
  const router = useRouter();
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? "");
  const [audience, setAudience] = useState(pack.audience);
  const [visibility, setVisibility] = useState(pack.visibility);
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function markDirty() {
    setDirty(true);
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("audience", audience);
    fd.set("visibility", visibility);
    startTransition(async () => {
      try {
        await updateEventPack(pack.id, fd);
        setDirty(false);
        notify("Pack saved");
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function handleRerunSmart() {
    startTransition(async () => {
      try {
        const res = await materializeSmartPack(pack.id);
        notify(`${res.matched} file${res.matched === 1 ? "" : "s"} match (${res.added} added, ${res.removed} removed)`);
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to re-run smart filter");
      }
    });
  }

  function handleRemove(assetId: string) {
    startTransition(async () => {
      try {
        await removeAssetFromPack(pack.id, assetId);
        notify("File removed from pack");
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to remove file");
      }
    });
  }

  function handleAdd(assetId: string) {
    startTransition(async () => {
      try {
        await addAssetToPack(pack.id, assetId);
        notify("File added to pack");
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to add file");
      }
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      try {
        const newId = await duplicateEventPack(pack.id);
        router.push(`/event-manager/library/event-packs/${newId}`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to duplicate pack");
      }
    });
  }

  function handleArchive() {
    if (!confirm(`Archive "${pack.name}"? It will be removed from Event Packs but its files are kept.`)) return;
    startTransition(async () => {
      try {
        await archiveEventPack(pack.id);
        router.push("/event-manager/library/event-packs");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to archive pack");
      }
    });
  }

  function handleDownload() {
    startTransition(async () => {
      try {
        const files = await getPackDownloadUrls(pack.id);
        const ready = files.filter((f) => f.url);
        if (ready.length === 0) {
          notify(files.length === 0 ? "This pack has no files yet" : "Storage is not configured — downloads are unavailable in this environment");
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

  function handleShare() {
    startTransition(async () => {
      try {
        const res = await sharePackExternally(pack.id);
        notify(`Shared ${res.linksCreated} file${res.linksCreated === 1 ? "" : "s"} externally`);
        router.refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to share pack");
      }
    });
  }

  function handleCopyLink() {
    startTransition(async () => {
      try {
        const token = await copyPackLink(pack.id);
        await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
        notify("Link copied to clipboard");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to create link");
      }
    });
  }

  const memberIds = new Set(members.map((m) => m.id));
  const totalSize = members.reduce((s, m) => s + m.sizeBytes, 0);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={name}
        description={pack.eventName ? `${pack.eventName} · ${members.length} files` : `${members.length} files`}
        actions={
          <>
            <Link
              href="/event-manager/library/event-packs"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <button onClick={handleShare} disabled={pending} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors disabled:opacity-50">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button onClick={handleCopyLink} disabled={pending} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors disabled:opacity-50">
              <Link2 className="w-4 h-4" /> Copy Link
            </button>
            <button onClick={handleDownload} disabled={pending} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
              <Download className="w-4 h-4" /> Download
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-5xl space-y-6">
        {/* Pack details */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-900">Pack Details</h2>
            {pack.smart && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-brand-50 text-brand-700 border-brand-100">
                <Sparkles className="w-3.5 h-3.5" /> Smart pack
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Pack Name</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); markDirty(); }}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Audience</label>
              <select
                value={audience}
                onChange={(e) => { setAudience(e.target.value as PackAudience); markDirty(); }}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm"
              >
                {AUDIENCE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => { setVisibility(e.target.value as PackVisibility); markDirty(); }}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm"
              >
                {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-surface-100">
            <div className="flex items-center gap-4 text-xs text-surface-500">
              <span>Owner {pack.ownerName}</span>
              <span>Created {formatLibDate(pack.createdAt)}</span>
              <span>Updated {formatLibDate(pack.updatedAt)}</span>
              <span>{formatBytes(totalSize)} total</span>
              <span>{pack.downloads} downloads</span>
              <span>{pack.shares} shares</span>
            </div>
            {dirty && (
              <button onClick={handleSave} disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {pending ? "Saving…" : "Save Changes"}
              </button>
            )}
          </div>
        </div>

        {/* Smart pack rules */}
        {pack.smart && pack.rules && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-surface-900">Smart Pack Rules</h2>
              <button onClick={handleRerunSmart} disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-xs font-semibold disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> Re-run Smart Filter
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <RuleChip label="Event" value={pack.rules.eventId ? events.find((e) => e.id === pack.rules?.eventId)?.name ?? pack.rules.eventId : "Any"} />
              <RuleChip label="Kind" value={pack.rules.kind ? kindLabel(pack.rules.kind) : "Any"} />
              <RuleChip label="Tag" value={pack.rules.tag ?? "Any"} />
              <RuleChip label="Visibility" value={pack.rules.assetVisibility ?? "Any"} />
            </div>
          </div>
        )}

        {/* Files */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-900">Files ({members.length})</h2>
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">
              <Plus className="w-3.5 h-3.5" /> Add Files
            </button>
          </div>
          {members.length === 0 ? (
            <EmptyState icon={FileText} title="No files in this pack yet" description="Add files to start building this pack." compact />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
              {members.map((m) => (
                <div key={m.id} className="group relative bg-surface-50 border border-surface-200 rounded-lg p-3">
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={pending}
                    title="Remove from pack"
                    className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white border border-surface-200 text-surface-400 opacity-0 group-hover:opacity-100 hover:text-danger-600 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <FileText className="w-6 h-6 text-surface-400 mb-2" strokeWidth={1.6} />
                  <p className="text-xs font-medium text-surface-900 truncate">{m.title}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5">{kindLabel(m.kind)} · {formatBytes(m.sizeBytes)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-surface-900">Pack Actions</h2>
            <p className="text-xs text-surface-500 mt-0.5">Duplicate this pack as a new draft, or archive it.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDuplicate} disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-sm font-medium disabled:opacity-50">
              <Copy className="w-4 h-4" /> Duplicate
            </button>
            <button onClick={handleArchive} disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50 text-sm font-medium disabled:opacity-50">
              <Archive className="w-4 h-4" /> Archive
            </button>
          </div>
        </div>
      </div>

      {addOpen && (
        <AddFilesModal
          assets={assets}
          memberIds={memberIds}
          search={assetSearch}
          onSearch={setAssetSearch}
          onAdd={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function RuleChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-50 border border-surface-200 text-surface-700">
      <span className="font-semibold text-surface-500">{label}:</span> {value}
    </span>
  );
}

function AddFilesModal({
  assets, memberIds, search, onSearch, onAdd, onClose,
}: {
  assets: PickableAsset[];
  memberIds: Set<string>;
  search: string;
  onSearch: (v: string) => void;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const filtered = assets.filter((a) => {
    if (!search.trim()) return true;
    return a.title.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-surface-900">Add Files to Pack</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 text-surface-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white mb-3">
          <Search className="w-4 h-4 text-surface-400 shrink-0" />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search files..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
        </div>
        <div className="divide-y divide-surface-100 border border-surface-200 rounded-lg max-h-96 overflow-y-auto">
          {filtered.length === 0 && <p className="text-xs text-surface-400 p-3">No files found.</p>}
          {filtered.slice(0, 150).map((a) => {
            const added = memberIds.has(a.id);
            return (
              <div key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                <FileText className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                <span className="text-sm text-surface-700 truncate flex-1">{a.title}</span>
                <span className="text-[11px] text-surface-400 shrink-0">{kindLabel(a.kind)} · {formatBytes(a.sizeBytes)}</span>
                <button
                  onClick={() => onAdd(a.id)}
                  disabled={added}
                  className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-lg shrink-0",
                    added ? "text-surface-400 bg-surface-100" : "text-brand-700 bg-brand-50 hover:bg-brand-100"
                  )}
                >
                  {added ? "Added" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
