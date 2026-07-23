"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Edit2, Send, Users2, Archive, Mail, Phone, Globe,
  Plus, Upload, FileText, Download,
  Sparkles, Award, CalendarDays, Eye, MoreHorizontal,
} from "lucide-react";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { recordSupplierDocumentUpload } from "../actions";

export interface SupplierDetail {
  id: string;
  name: string;
  status: string;
  category: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  rating: number | null;
}

export interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface FileRow {
  id: string;
  name: string;
  kind: string;
  expiry: string;
  archived: boolean;
}

export interface LinkedEvent {
  id: string;
  name: string;
  date: string;
  role: string;
  status: string;
}

function badgeStatus(status: string): string {
  if (status === "suspended_by_admin") return "suspended";
  if (status === "paused") return "inactive";
  return status;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Supplier Hero ──────────────────────────────────────────────────────────

function SupplierHero({ supplier }: { supplier: SupplierDetail }) {
  return (
    <div className="bg-white border-b border-surface-200">
      <div className="px-6 py-5">
        <div className="flex items-start gap-4 justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
              <span className="text-brand-700 text-lg font-bold">{initials(supplier.name)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-surface-900 tracking-tight">{supplier.name}</h1>
                <StatusBadge status={badgeStatus(supplier.status) as never} />
                <span className="px-2 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 rounded-full">
                  {supplier.category}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-surface-500">
                {supplier.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {supplier.email}
                  </span>
                )}
                {supplier.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {supplier.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Archive</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Users2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Invite to Portal</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Send RFQ</span>
            </button>
            <Link
              href={`/event-manager/suppliers/${supplier.id}/edit`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
              Edit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({
  supplier,
  contacts,
  files,
  eventCount,
}: {
  supplier: SupplierDetail;
  contacts: ContactRow[];
  files: FileRow[];
  eventCount: number;
}) {
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Events Worked"        value={String(eventCount)}                              icon={CalendarDays} iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Documents"            value={String(files.length)}                            icon={FileText}     iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Contacts"             value={String(contacts.length)}                         icon={Users2}       iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Internal Rating"      value={supplier.rating ? `${supplier.rating}/5` : "—"}  icon={Award}        iconColor="text-brand-600"   iconBg="bg-brand-50" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Contact card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">Primary Contact</h3>
            {primary ? (
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <span className="text-brand-700 text-sm font-bold">{initials(primary.name)}</span>
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{primary.name}</p>
                    {primary.role && <p className="text-xs text-surface-400">{primary.role}</p>}
                  </div>
                  <div className="space-y-1.5">
                    {primary.email && (
                      <a href={`mailto:${primary.email}`} className="flex items-center gap-2 text-xs text-brand-600 hover:underline">
                        <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                        {primary.email}
                      </a>
                    )}
                    {primary.phone && (
                      <a href={`tel:${primary.phone}`} className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                        <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                        {primary.phone}
                      </a>
                    )}
                    {supplier.website && (
                      <a href={supplier.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                        <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                        {supplier.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-surface-400">No contacts on file.</p>
            )}
          </div>

          {/* Notes card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Notes</h3>
            <p className="text-sm text-surface-700 leading-relaxed">
              {supplier.notes || <span className="text-surface-400">No notes recorded.</span>}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Doc status */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Documents</h3>
            </div>
            {files.length === 0 ? (
              <p className="px-4 py-4 text-sm text-surface-400">No documents uploaded.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {files.slice(0, 4).map((d) => (
                  <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <p className="text-xs text-surface-600 truncate">{d.kind}</p>
                    <span className="text-xs text-surface-400">{d.expiry}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI summary card */}
          <div className="bg-gradient-to-br from-brand-900 to-brand-800 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">AI Summary</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed mb-3">
              {supplier.name} has {eventCount} linked event{eventCount === 1 ? "" : "s"} and {files.length} document{files.length === 1 ? "" : "s"} on file.
            </p>
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium rounded-lg transition-colors">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
              Generate Supplier Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Contacts ──────────────────────────────────────────────────────────

function ContactsTab({ contacts }: { contacts: ContactRow[] }) {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Contact
        </button>
      </div>
      {contacts.length === 0 ? (
        <EmptyState icon={Users2} title="No contacts yet" description="Add a primary contact for this supplier." compact />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contacts.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                    <span className="text-brand-700 text-xs font-bold">{initials(c.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-900">{c.name}</p>
                    {c.role && <p className="text-xs text-surface-400">{c.role}</p>}
                  </div>
                </div>
                {c.isPrimary && <StatusBadge status="active" dot={false} />}
              </div>
              <div className="space-y-1.5 mt-3">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-brand-600 hover:underline">
                    <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                    <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {c.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Events ────────────────────────────────────────────────────────────

function EventsTab({ events }: { events: LinkedEvent[] }) {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Link to Event
        </button>
      </div>
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No linked events" description="This supplier is not assigned to any events yet." compact />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3.5">
                    <Link href={`/event-manager/events/${ev.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                      {ev.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell whitespace-nowrap">{ev.date}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{ev.role}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={ev.status as never} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/event-manager/events/${ev.id}`} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </Link>
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                        <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Documents ─────────────────────────────────────────────────────────

function DocumentsTab({
  supplierId,
  workspaceId,
  r2Ready,
  files,
}: {
  supplierId: string;
  workspaceId: string;
  r2Ready: boolean;
  files: FileRow[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!r2Ready) {
      setError("Document storage is not configured for this environment.");
      return;
    }

    const documentType = window.prompt("Document type (e.g. Public Liability Insurance)", "");
    if (!documentType || !documentType.trim()) return;

    startTransition(async () => {
      try {
        const presignRes = await fetch("/api/r2/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            recordId: supplierId,
            kind: "supplier-document",
            filename: file.name,
            contentType: file.type || "application/pdf",
          }),
        });
        const presignData = await presignRes.json();
        if (!presignRes.ok) throw new Error(presignData.error ?? "Could not get an upload URL");

        const putRes = await fetch(presignData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload to storage failed");

        const result = await recordSupplierDocumentUpload(
          supplierId,
          documentType.trim(),
          presignData.objectKey,
          file.name,
          file.type || "application/pdf",
          file.size
        );
        if (result.error) throw new Error(result.error);

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand cursor-pointer aria-disabled:opacity-60">
          <Upload className="w-4 h-4" strokeWidth={2} />
          {pending ? "Uploading…" : "Upload Document"}
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            disabled={pending}
            onChange={handleFilePicked}
          />
        </label>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Send className="w-4 h-4" strokeWidth={1.8} />
          Request Document
        </button>
      </div>
      {!r2Ready && (
        <p className="text-xs text-warning-600 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
          Document storage is not configured for this environment — uploads are disabled.
        </p>
      )}
      {error && <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">{error}</p>}

      {files.length === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded" description="Upload insurance, contracts and certificates here." compact />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Document Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Expiry</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {files.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                      <span className="font-medium text-surface-900 text-xs">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{doc.kind}</td>
                  <td className="px-4 py-3.5 text-surface-400 text-xs hidden lg:table-cell">{doc.expiry}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" title="Download">
                        <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" title="Archive">
                        <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-surface-400">All documents are upload-only. No external URL fields are permitted.</p>
    </div>
  );
}

// ── Main client ────────────────────────────────────────────────────────────

export function SupplierDetailClient({
  supplier,
  contacts,
  files,
  events,
  workspaceId,
  r2Ready,
}: {
  supplier: SupplierDetail;
  contacts: ContactRow[];
  files: FileRow[];
  events: LinkedEvent[];
  workspaceId: string;
  r2Ready: boolean;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contacts", label: "Contacts", count: contacts.length },
    { id: "events", label: "Events", count: events.length },
    { id: "documents", label: "Documents", count: files.length },
  ];

  const tabContent: Record<string, React.ReactNode> = {
    overview: <OverviewTab supplier={supplier} contacts={contacts} files={files} eventCount={events.length} />,
    contacts: <ContactsTab contacts={contacts} />,
    events: <EventsTab events={events} />,
    documents: <DocumentsTab supplierId={supplier.id} workspaceId={workspaceId} r2Ready={r2Ready} files={files} />,
  };

  return (
    <div className="animate-fade-in">
      <SupplierHero supplier={supplier} />
      <div className="bg-white border-b border-surface-200 sticky top-14 z-20">
        <div className="px-6">
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      <div key={activeTab} className="animate-fade-in">
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
