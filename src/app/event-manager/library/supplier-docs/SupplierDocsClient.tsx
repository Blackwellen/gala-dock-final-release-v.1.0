"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, BadgeCheck, Download, Eye, FileSignature, FileText, FileWarning,
  Mail, MoreHorizontal, Pencil, Scale, ShieldCheck, Trash2, UtensilsCrossed, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard, BarList, OwnerAvatar, ViewSwitcher } from "../_shared";
import { formatBytes, formatLibDate } from "../library-utils";
import { VerificationBadge, VisibilityBadge, RiskBadge } from "./Badges";
import { expiryDisplay, expiryDetail } from "./doc-utils";
import { archiveDocument, getSupplierDocumentDownloadUrl, rejectDocument, requestSupplierDocument, updateDocumentMetadata, verifyDocument } from "./actions";
import type {
  ComplianceAlertRow, DocRow, ExpiringDocRow, FilterOption, RecentActivityRow,
  RiskLevel, SupplierCompletionRow, SupplierDocsKpis, VerificationStatus,
} from "./types";

const VERIFICATION_FILTER_OPTIONS: { value: VerificationStatus | "all"; label: string }[] = [
  { value: "all", label: "Verification: All" },
  { value: "verified", label: "Verified" },
  { value: "pending_review", label: "Pending Review" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "missing", label: "Missing" },
];

const EXPIRY_FILTER_OPTIONS = [
  { value: "all", label: "Expiry: Any time" },
  { value: "overdue", label: "Already expired" },
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "none", label: "No expiry set" },
];

function docIcon(documentType: string) {
  const t = documentType.toLowerCase();
  if (t.includes("insur")) return ShieldCheck;
  if (t.includes("menu")) return UtensilsCrossed;
  if (t.includes("contract") || t.includes("agreement")) return FileSignature;
  if (t.includes("rams") || t.includes("risk")) return AlertTriangle;
  if (t.includes("nda") || t.includes("legal") || t.includes("terms")) return Scale;
  if (t.includes("licence") || t.includes("license") || t.includes("cover") || t.includes("sia")) return BadgeCheck;
  return FileText;
}

const THEME_COLORS = [
  "from-brand-600 to-brand-800", "from-violet-600 to-violet-800", "from-info-600 to-info-800",
  "from-success-600 to-success-800", "from-warning-600 to-warning-800", "from-surface-700 to-surface-900",
];
function themeFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h += key.charCodeAt(i);
  return THEME_COLORS[h % THEME_COLORS.length];
}

function fileExtLabel(mime: string | null, isSynthetic: boolean): string {
  if (isSynthetic) return "—";
  if (!mime) return "FILE";
  const sub = mime.split("/")[1] ?? "";
  if (sub.includes("pdf")) return "PDF";
  if (sub.includes("word") || sub === "msword") return "DOCX";
  if (sub.includes("sheet") || sub === "vnd.ms-excel") return "XLSX";
  if (sub.startsWith("png") || sub.startsWith("jpeg") || sub.startsWith("jpg") || sub.startsWith("webp")) return "IMG";
  return sub.split(/[.+]/).pop()?.toUpperCase().slice(0, 4) || "FILE";
}

interface Props {
  rows: DocRow[];
  kpis: SupplierDocsKpis;
  expiringDocuments: ExpiringDocRow[];
  complianceAlerts: ComplianceAlertRow[];
  supplierCompletion: SupplierCompletionRow[];
  recentActivity: RecentActivityRow[];
  supplierOptions: FilterOption[];
  documentTypeOptions: FilterOption[];
  categoryOptions: FilterOption[];
  eventOptions: FilterOption[];
  ownerOptions: FilterOption[];
  canManage: boolean;
  workspaceId: string;
  currentUserId: string;
  view: "grid" | "list";
}

export function SupplierDocsClient({
  rows, kpis, expiringDocuments, complianceAlerts, supplierCompletion, recentActivity,
  supplierOptions, documentTypeOptions, categoryOptions, eventOptions, ownerOptions,
  canManage, view,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [documentType, setDocumentType] = useState("all");
  const [category, setCategory] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [verification, setVerification] = useState<VerificationStatus | "all">("all");
  const [eventId, setEventId] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [owner, setOwner] = useState("all");
  const [risk, setRisk] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"expiry" | "name" | "updated">("expiry");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DocRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DocRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.title.toLowerCase().includes(q) || (r.supplierName ?? "").toLowerCase().includes(q) || r.documentType.toLowerCase().includes(q)
      );
    }
    if (supplierId !== "all") list = list.filter((r) => r.supplierId === supplierId);
    if (documentType !== "all") list = list.filter((r) => r.documentType === documentType);
    if (category !== "all") list = list.filter((r) => r.category === category);
    if (verification !== "all") list = list.filter((r) => r.status === verification);
    if (eventId !== "all") list = list.filter((r) => r.relatedEventId === eventId);
    if (visibility !== "all") list = list.filter((r) => r.visibility === visibility);
    if (owner !== "all") list = list.filter((r) => r.ownerName === owner);
    if (risk !== "all") list = list.filter((r) => r.riskLevel === risk);
    if (expiryFilter !== "all") {
      const now = Date.now();
      list = list.filter((r) => {
        if (expiryFilter === "none") return !r.expiryDate;
        if (!r.expiryDate) return false;
        const d = Math.round((new Date(`${r.expiryDate}T00:00:00`).getTime() - now) / 86400000);
        if (expiryFilter === "overdue") return d < 0;
        return d >= 0 && d <= Number(expiryFilter);
      });
    }
    const sorted = [...list];
    if (sortBy === "expiry") {
      sorted.sort((a, b) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return sorted;
  }, [rows, search, supplierId, documentType, category, verification, eventId, visibility, owner, risk, expiryFilter, sortBy]);

  function clearFilters() {
    setSearch(""); setSupplierId("all"); setDocumentType("all"); setCategory("all");
    setExpiryFilter("all"); setVerification("all"); setEventId("all"); setVisibility("all");
    setOwner("all"); setRisk("all");
  }
  const hasActiveFilters =
    search || supplierId !== "all" || documentType !== "all" || category !== "all" || expiryFilter !== "all" ||
    verification !== "all" || eventId !== "all" || visibility !== "all" || owner !== "all" || risk !== "all";

  async function handlePreview(row: DocRow) {
    setMenuOpenId(null);
    if (row.isSynthetic || !row.storagePath) return;
    const result = await getSupplierDocumentDownloadUrl(row.id);
    if ("error" in result) { setActionError(result.error); return; }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function handleVerify(row: DocRow) {
    setMenuOpenId(null);
    startTransition(async () => {
      const result = await verifyDocument(row.id);
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    });
  }

  function handleReject(reason: string) {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    startTransition(async () => {
      const result = await rejectDocument(target.id, reason);
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    });
  }

  function handleArchive(row: DocRow) {
    setMenuOpenId(null);
    if (row.isSynthetic) return;
    if (!confirm(`Archive "${row.title}"? It will be removed from Supplier Documents.`)) return;
    startTransition(async () => {
      const result = await archiveDocument(row.id);
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    });
  }

  function handleRequestReplacement(row: DocRow) {
    setMenuOpenId(null);
    if (!row.supplierId) return;
    startTransition(async () => {
      const result = await requestSupplierDocument({ supplierId: row.supplierId as string, documentType: row.documentType });
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  }
  function handleBulkArchive() {
    const targets = filtered.filter((r) => selectedIds.includes(r.id) && !r.isSynthetic);
    if (targets.length === 0) return;
    if (!confirm(`Archive ${targets.length} selected document${targets.length !== 1 ? "s" : ""}?`)) return;
    startTransition(async () => {
      const results = await Promise.all(targets.map((t) => archiveDocument(t.id)));
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) setActionError(failed.error);
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <div className="flex-1 p-6">
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <KPIGrid>
            <MetricCard label="Total Documents" value={kpis.total} icon={FileText} iconBg="bg-brand-50" iconColor="text-brand-600" />
            <MetricCard label="Verified" value={kpis.verified} icon={ShieldCheck} iconBg="bg-success-50" iconColor="text-success-600" />
            <MetricCard label="Expiring Soon" value={kpis.expiringSoon} icon={AlertTriangle} iconBg="bg-warning-50" iconColor="text-warning-600" />
            <MetricCard label="Pending Review" value={kpis.pendingReview} icon={FileWarning} iconBg="bg-warning-50" iconColor="text-warning-600" />
            <MetricCard label="Missing" value={kpis.missing} icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
          </KPIGrid>

          {actionError && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700 flex-1">{actionError}</p>
              <button onClick={() => setActionError(null)} className="text-danger-400 hover:text-danger-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-xs">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
              </div>
              <FilterSelect value={supplierId} onChange={setSupplierId} placeholder="Supplier: All" options={supplierOptions} />
              <FilterSelect value={documentType} onChange={setDocumentType} placeholder="Document type: All" options={documentTypeOptions} />
              <FilterSelect value={category} onChange={setCategory} placeholder="Compliance: All" options={categoryOptions} />
              <FilterSelect value={expiryFilter} onChange={setExpiryFilter} placeholder="Expiry date" options={EXPIRY_FILTER_OPTIONS.filter((o) => o.value !== "all")} showAllOption="Expiry: Any time" />
              <FilterSelect
                value={verification}
                onChange={(v) => setVerification(v as VerificationStatus | "all")}
                placeholder="Verified status"
                options={VERIFICATION_FILTER_OPTIONS.filter((o) => o.value !== "all") as { value: string; label: string }[]}
                showAllOption="Verification: All"
              />
              <button onClick={() => setMoreOpen((v) => !v)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-600 hover:bg-surface-50">
                More filters
              </button>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="px-3 py-2 rounded-lg text-sm text-brand-600 hover:underline">Clear all</button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-2.5 py-2 rounded-lg border border-surface-200 bg-white text-xs text-surface-600">
                  <option value="expiry">Sort: Expiry date</option>
                  <option value="name">Sort: Name</option>
                  <option value="updated">Sort: Last updated</option>
                </select>
                <ViewSwitcher basePath="/event-manager/library/supplier-docs" />
              </div>
            </div>
            {moreOpen && (
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-surface-100">
                <FilterSelect value={eventId} onChange={setEventId} placeholder="Event: All" options={eventOptions} />
                <FilterSelect
                  value={visibility}
                  onChange={setVisibility}
                  placeholder="Visibility: All"
                  options={[
                    { value: "workspace", label: "Internal" },
                    { value: "restricted", label: "Restricted" },
                    { value: "link", label: "Shared" },
                    { value: "public_token", label: "Public" },
                  ]}
                />
                <FilterSelect value={owner} onChange={setOwner} placeholder="Owner: All" options={ownerOptions} />
                <FilterSelect
                  value={risk}
                  onChange={setRisk}
                  placeholder="Risk: All"
                  options={[
                    { value: "critical", label: "Critical" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-surface-400">{filtered.length} of {rows.length} documents</p>
            {view === "list" && selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-500">{selectedIds.length} selected</span>
                <button onClick={handleBulkArchive} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50 text-xs font-medium">
                  <Trash2 className="w-3.5 h-3.5" /> Archive selected
                </button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState icon={FileText} title="No supplier documents match your filters" description="Try clearing filters, or upload a new supplier document." />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {filtered.map((row) => (
                <DocCard
                  key={row.id}
                  row={row}
                  canManage={canManage}
                  menuOpen={menuOpenId === row.id}
                  onToggleMenu={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                  onPreview={() => handlePreview(row)}
                  onVerify={() => handleVerify(row)}
                  onReject={() => setRejectTarget(row)}
                  onEdit={() => setEditTarget(row)}
                  onArchive={() => handleArchive(row)}
                  onRequestReplacement={() => handleRequestReplacement(row)}
                />
              ))}
            </div>
          ) : (
            <ListTable
              rows={filtered}
              canManage={canManage}
              menuOpenId={menuOpenId}
              onToggleMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
              onPreview={handlePreview}
              onVerify={handleVerify}
              onReject={(r) => setRejectTarget(r)}
              onEdit={(r) => setEditTarget(r)}
              onArchive={handleArchive}
              onRequestReplacement={handleRequestReplacement}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleSelectAll={toggleSelectAll}
            />
          )}
        </div>

        <div className="w-80 shrink-0 space-y-4 hidden xl:block">
          <InsightCard title="Expiring Documents">
            <ul className="space-y-3">
              {expiringDocuments.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-surface-800 font-medium truncate">{d.title}</p>
                    <p className="text-xs text-surface-400 truncate">{d.supplierName ?? "Company Wide"} · {expiryDisplay(d.expiryDate)}</p>
                  </div>
                  <span className={cn("text-xs font-semibold shrink-0", d.daysUntil < 0 ? "text-danger-600" : d.daysUntil <= 7 ? "text-danger-600" : "text-warning-600")}>
                    {expiryDetail(d.expiryDate)}
                  </span>
                </li>
              ))}
              {expiringDocuments.length === 0 && <li className="text-xs text-surface-400">Nothing expiring soon.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Compliance Alerts">
            <BarList items={complianceAlerts.map((a) => ({ label: a.label, value: a.value, danger: true }))} />
          </InsightCard>

          <InsightCard title="Supplier Document Completion">
            <ul className="space-y-3">
              {supplierCompletion.map((s) => (
                <li key={s.supplierId}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 text-surface-700 truncate"><OwnerAvatar name={s.supplierName} size="xs" />{s.supplierName}</span>
                    <span className="font-semibold text-surface-800 tabular-nums shrink-0">{s.completionPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", s.completionPct >= 90 ? "bg-success-500" : s.completionPct >= 60 ? "bg-warning-500" : "bg-danger-500")}
                      style={{ width: `${Math.max(4, s.completionPct)}%` }}
                    />
                  </div>
                </li>
              ))}
              {supplierCompletion.length === 0 && <li className="text-xs text-surface-400">No compliance requirements configured yet.</li>}
            </ul>
          </InsightCard>

          <InsightCard title="Recent Compliance Activity">
            <ul className="space-y-2.5">
              {recentActivity.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-surface-800 truncate"><span className="font-medium">{a.title}</span></p>
                  <p className={cn("text-xs", a.action === "rejected" ? "text-danger-600" : "text-success-600")}>
                    {a.action === "rejected" ? "Rejected" : "Verified"} by {a.actorName}
                  </p>
                </li>
              ))}
              {recentActivity.length === 0 && <li className="text-xs text-surface-400">No verification activity yet.</li>}
            </ul>
          </InsightCard>
        </div>
      </div>

      {editTarget && (
        <EditMetadataModal
          row={editTarget}
          supplierOptions={supplierOptions}
          eventOptions={eventOptions}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); router.refresh(); }}
        />
      )}
      {rejectTarget && (
        <RejectModal row={rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={handleReject} />
      )}
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options, showAllOption,
}: { value: string; onChange: (v: string) => void; placeholder: string; options: { value: string; label: string }[]; showAllOption?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 max-w-[160px]">
      <option value="all">{showAllOption ?? placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

interface RowActionsProps {
  row: DocRow;
  canManage: boolean;
  onPreview: () => void;
  onVerify: () => void;
  onReject: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRequestReplacement: () => void;
}

function ActionMenu({ row, canManage, onPreview, onVerify, onReject, onEdit, onArchive, onRequestReplacement, open, onToggle }: RowActionsProps & { open: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400" aria-label="More actions">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-52 bg-white rounded-xl border border-surface-200 shadow-lg py-1 text-left">
          {row.isSynthetic ? (
            <button onClick={onRequestReplacement} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 text-left">
              <Mail className="w-3.5 h-3.5" /> Request document
            </button>
          ) : (
            <>
              <button onClick={onPreview} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Eye className="w-3.5 h-3.5" /> Preview</button>
              <button onClick={onPreview} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Download className="w-3.5 h-3.5" /> Download</button>
              {canManage && row.status !== "verified" && (
                <button onClick={onVerify} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success-700 hover:bg-success-50 text-left"><ShieldCheck className="w-3.5 h-3.5" /> Verify</button>
              )}
              {canManage && row.status !== "rejected" && (
                <button onClick={onReject} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-700 hover:bg-danger-50 text-left"><FileWarning className="w-3.5 h-3.5" /> Reject</button>
              )}
              {row.supplierId && (row.status === "expired" || row.status === "rejected") && (
                <button onClick={onRequestReplacement} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Mail className="w-3.5 h-3.5" /> Request replacement</button>
              )}
              <button onClick={onEdit} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Pencil className="w-3.5 h-3.5" /> Edit metadata</button>
              <button onClick={onArchive} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Trash2 className="w-3.5 h-3.5" /> Archive</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DocCard({
  row, canManage, menuOpen, onToggleMenu, onPreview, onVerify, onReject, onEdit, onArchive, onRequestReplacement,
}: { row: DocRow; canManage: boolean; menuOpen: boolean; onToggleMenu: () => void } & Omit<RowActionsProps, "row" | "canManage">) {
  const Icon = docIcon(row.documentType);
  return (
    <div className={cn("bg-white rounded-xl border shadow-card hover:shadow-md transition-all overflow-hidden flex flex-col", row.isSynthetic ? "border-danger-200 border-dashed" : "border-surface-200")}>
      <div className={cn("h-24 flex items-center justify-center relative bg-gradient-to-br", row.isSynthetic ? "from-surface-200 to-surface-300" : themeFor(row.documentType))}>
        {!row.isSynthetic && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/90 text-surface-700">{fileExtLabel(row.mime, row.isSynthetic)}</span>
        )}
        <Icon className={cn("w-9 h-9", row.isSynthetic ? "text-surface-500" : "text-white/90")} strokeWidth={1.5} />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-surface-900 leading-snug line-clamp-2 flex-1">{row.title}</h3>
          <ActionMenu row={row} canManage={canManage} onPreview={onPreview} onVerify={onVerify} onReject={onReject} onEdit={onEdit} onArchive={onArchive} onRequestReplacement={onRequestReplacement} open={menuOpen} onToggle={onToggleMenu} />
        </div>
        {row.supplierName && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <OwnerAvatar name={row.supplierName} size="xs" />
            <span className="text-xs text-surface-500 truncate">{row.supplierName}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs mt-3">
          <div><p className="text-surface-400">Type</p><p className="font-medium text-surface-800 truncate">{row.documentType}</p></div>
          <div><p className="text-surface-400">Expires</p><p className="font-medium text-surface-800">{expiryDisplay(row.expiryDate)}</p></div>
          <div><p className="text-surface-400">Category</p><p className="font-medium text-surface-800 truncate">{row.category}</p></div>
          <div><p className="text-surface-400">Owner</p><p className="font-medium text-surface-800 truncate">{row.ownerName}</p></div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100 gap-2 flex-wrap">
          <VerificationBadge status={row.status} />
          <div className="flex items-center gap-1.5">
            {row.riskLevel && <RiskBadge risk={row.riskLevel} />}
            <VisibilityBadge visibility={row.visibility} />
          </div>
        </div>
        {!row.isSynthetic && (
          <div className="flex items-center gap-1 mt-3">
            <button onClick={onPreview} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 text-xs font-medium"><Eye className="w-3.5 h-3.5" /> Preview</button>
            <button onClick={onPreview} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 text-xs font-medium"><Download className="w-3.5 h-3.5" /> Download</button>
          </div>
        )}
        {row.isSynthetic && (
          <button onClick={onRequestReplacement} className="mt-3 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">
            <Mail className="w-3.5 h-3.5" /> Request document
          </button>
        )}
      </div>
    </div>
  );
}

function ListTable({
  rows, canManage, menuOpenId, onToggleMenu, onPreview, onVerify, onReject, onEdit, onArchive, onRequestReplacement,
  selectedIds, onToggleSelected, onToggleSelectAll,
}: {
  rows: DocRow[]; canManage: boolean; menuOpenId: string | null; onToggleMenu: (id: string) => void;
  onPreview: (r: DocRow) => void; onVerify: (r: DocRow) => void; onReject: (r: DocRow) => void;
  onEdit: (r: DocRow) => void; onArchive: (r: DocRow) => void; onRequestReplacement: (r: DocRow) => void;
  selectedIds: string[]; onToggleSelected: (id: string) => void; onToggleSelectAll: (ids: string[]) => void;
}) {
  const selectableIds = rows.filter((r) => !r.isSynthetic).map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={() => onToggleSelectAll(selectableIds)} className="rounded border-surface-300" aria-label="Select all documents" />
              </th>
              {["Document", "Supplier", "Type", "Related Event / Category", "Expiry", "Verification", "Risk", "Owner", "Last Updated", "Visibility", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rows.map((row) => {
              const Icon = docIcon(row.documentType);
              return (
                <tr key={row.id} className={cn("hover:bg-surface-50 transition-colors", row.isSynthetic && "bg-danger-50/30")}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      disabled={row.isSynthetic}
                      checked={selectedIds.includes(row.id)}
                      onChange={() => onToggleSelected(row.id)}
                      className="rounded border-surface-300 disabled:opacity-30"
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br", row.isSynthetic ? "from-surface-200 to-surface-300" : themeFor(row.documentType))}>
                        <Icon className={cn("w-4 h-4", row.isSynthetic ? "text-surface-500" : "text-white/90")} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 truncate max-w-[220px]">{row.title}</p>
                        {!row.isSynthetic && <p className="text-xs text-surface-400">{formatBytes(row.sizeBytes)}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-600 whitespace-nowrap">{row.supplierName ?? "Company Wide"}</td>
                  <td className="px-4 py-3 text-surface-600 whitespace-nowrap">{row.documentType}</td>
                  <td className="px-4 py-3 text-surface-600 whitespace-nowrap">
                    <p>{row.relatedEventName ?? "—"}</p>
                    <p className="text-xs text-surface-400">{row.category}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-surface-700">{expiryDisplay(row.expiryDate)}</p>
                    {row.expiryDate && <p className={cn("text-xs", row.status === "expired" ? "text-danger-600" : row.status === "expiring_soon" ? "text-warning-600" : "text-surface-400")}>{expiryDetail(row.expiryDate)}</p>}
                  </td>
                  <td className="px-4 py-3"><VerificationBadge status={row.status} /></td>
                  <td className="px-4 py-3"><RiskBadge risk={row.riskLevel} /></td>
                  <td className="px-4 py-3 text-surface-600 whitespace-nowrap">{row.ownerName}</td>
                  <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{row.isSynthetic ? "—" : formatLibDate(row.updatedAt)}</td>
                  <td className="px-4 py-3"><VisibilityBadge visibility={row.visibility} /></td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      row={row} canManage={canManage}
                      onPreview={() => onPreview(row)} onVerify={() => onVerify(row)} onReject={() => onReject(row)}
                      onEdit={() => onEdit(row)} onArchive={() => onArchive(row)} onRequestReplacement={() => onRequestReplacement(row)}
                      open={menuOpenId === row.id} onToggle={() => onToggleMenu(row.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditMetadataModal({
  row, supplierOptions, eventOptions, onClose, onSaved,
}: { row: DocRow; supplierOptions: FilterOption[]; eventOptions: FilterOption[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(row.title);
  const [documentType, setDocumentType] = useState(row.documentType);
  const [category, setCategory] = useState(row.category);
  const [expiryDate, setExpiryDate] = useState(row.expiryDate ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel | "">(row.riskLevel ?? "");
  const [relatedEventId, setRelatedEventId] = useState(row.relatedEventId ?? "");
  const [supplierId, setSupplierId] = useState(row.supplierId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const result = await updateDocumentMetadata(row.id, {
        title,
        documentType,
        category,
        expiryDate: expiryDate || null,
        riskLevel: (riskLevel || null) as RiskLevel | null,
        relatedEventId: relatedEventId || null,
        supplierId: supplierId || null,
      });
      if (!result.ok) { setError(result.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 shrink-0">
          <h2 className="text-base font-semibold text-surface-900">Edit document</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Name</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Document type</label>
              <input value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Expiry date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Risk level</label>
              <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel | "")} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
                <option value="">No rating</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Linked supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              <option value="">No supplier — company-wide</option>
              {supplierOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Linked event</label>
            <select value={relatedEventId} onChange={(e) => setRelatedEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
              <option value="">No linked event</option>
              {eventOptions.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-danger-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-surface-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
          <button onClick={submit} disabled={pending} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ row, onClose, onConfirm }: { row: DocRow; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-surface-900">Reject &ldquo;{row.title}&rdquo;</h2>
          <p className="text-xs text-surface-500">This flags the document as rejected and notifies the supplier record's compliance status.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for rejection…"
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm resize-none"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
            <button onClick={() => onConfirm(reason)} className="px-4 py-2 rounded-lg bg-danger-600 hover:bg-danger-700 text-white text-sm font-medium">Reject</button>
          </div>
        </div>
      </div>
    </div>
  );
}
