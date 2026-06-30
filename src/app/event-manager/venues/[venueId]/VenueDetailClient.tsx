"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2, Edit2, Archive, MapPin, Globe, Mail, Phone, Users,
  Upload, FileText, Download, Trash2, Plus, Pin, PinOff, CalendarDays,
  CheckCircle2, AlertTriangle, XCircle, Clock, StickyNote,
} from "lucide-react";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABEL, formatBytes } from "../lib";
import {
  archiveVenue,
  uploadVenueDocument,
  deleteVenueDocument,
  getVenueDocumentUrl,
  addVenueNote,
  toggleVenueNotePin,
  deleteVenueNote,
} from "../actions";

export interface VenueDetail {
  id: string;
  name: string;
  status: string;
  category: string | null;
  website: string | null;
  capacity: number | null;
  notes: string | null;
  location: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface VenueDocRow {
  id: string;
  docType: string;
  filename: string;
  sizeBytes: number | null;
  expiry: string;
  health: "active" | "expiring-soon" | "expired";
  created: string;
}

export interface VenueNoteRow {
  id: string;
  body: string;
  isPinned: boolean;
  created: string;
}

export interface LinkedEvent {
  id: string;
  name: string;
  client: string;
  date: string;
  guests: number | null;
  status: string;
}

/** Events store status with underscores; StatusBadge uses hyphens. */
function eventBadgeStatus(status: string): string {
  return status.replace(/_/g, "-");
}

function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
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

const DOC_HEALTH_BADGE: Record<
  VenueDocRow["health"],
  { label: string; classes: string; icon: typeof CheckCircle2 }
> = {
  active: { label: "Active", classes: "bg-success-50 text-success-700 border-success-200", icon: CheckCircle2 },
  "expiring-soon": { label: "Expiring Soon", classes: "bg-warning-50 text-warning-600 border-warning-200", icon: AlertTriangle },
  expired: { label: "Expired", classes: "bg-danger-50 text-danger-600 border-danger-200", icon: XCircle },
};

function DocHealthBadge({ health }: { health: VenueDocRow["health"] }) {
  const { label, classes, icon: Icon } = DOC_HEALTH_BADGE[health];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border", classes)}>
      <Icon className="w-3 h-3" strokeWidth={2} />
      {label}
    </span>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function VenueHero({ venue }: { venue: VenueDetail }) {
  const [pending, startTransition] = useTransition();

  function handleArchive() {
    if (!confirm(`Archive ${venue.name}? It will be hidden from the active directory.`)) return;
    startTransition(async () => {
      try {
        await archiveVenue(venue.id);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
      }
    });
  }

  return (
    <div className="bg-white border-b border-surface-200">
      <div className="h-32 bg-gradient-to-br from-brand-100 via-brand-50 to-violet-50 flex items-center justify-center">
        <Building2 className="w-10 h-10 text-brand-300" strokeWidth={1.5} />
      </div>
      <div className="px-6 py-5">
        <div className="flex items-start gap-4 justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-surface-900 tracking-tight">{venue.name}</h1>
              <StatusBadge status={venue.status as never} />
              {venue.category && (
                <span className="px-2 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 rounded-full">
                  {venue.category}
                </span>
              )}
            </div>
            <p className="flex items-center gap-1.5 mt-1.5 text-sm text-surface-500">
              <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              {venue.location}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleArchive}
              disabled={pending || venue.status === "archived"}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">{venue.status === "archived" ? "Archived" : "Archive"}</span>
            </button>
            <Link
              href={`/event-manager/venues/${venue.id}/edit`}
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

// ── Overview tab ───────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-surface-100 last:border-0">
      <span className="text-xs text-surface-400">{label}</span>
      <span className="text-sm text-surface-800 text-right">{children}</span>
    </div>
  );
}

function OverviewTab({
  venue,
  eventCount,
  docCount,
}: {
  venue: VenueDetail;
  eventCount: number;
  docCount: number;
}) {
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Capacity"      value={venue.capacity != null ? String(venue.capacity) : "—"} icon={Users}       iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Times Used"    value={String(eventCount)}                                     icon={CalendarDays} iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Documents"     value={String(docCount)}                                       icon={FileText}    iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Status"        value={venue.status === "preferred" ? "Preferred" : venue.status.charAt(0).toUpperCase() + venue.status.slice(1)} icon={Building2} iconColor="text-violet-600" iconBg="bg-violet-50" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Address</h3>
            <InfoRow label="Line 1">{venue.addressLine1 || <span className="text-surface-300">—</span>}</InfoRow>
            <InfoRow label="Line 2">{venue.addressLine2 || <span className="text-surface-300">—</span>}</InfoRow>
            <InfoRow label="City">{venue.city || <span className="text-surface-300">—</span>}</InfoRow>
            <InfoRow label="County / Region">{venue.region || <span className="text-surface-300">—</span>}</InfoRow>
            <InfoRow label="Postcode">{venue.postalCode || <span className="text-surface-300">—</span>}</InfoRow>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Notes</h3>
            <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
              {venue.notes || <span className="text-surface-400">No notes recorded.</span>}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Contact</h3>
            <div className="space-y-2.5">
              {venue.contactEmail ? (
                <a href={`mailto:${venue.contactEmail}`} className="flex items-center gap-2 text-xs text-brand-600 hover:underline">
                  <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {venue.contactEmail}
                </a>
              ) : (
                <p className="flex items-center gap-2 text-xs text-surface-400"><Mail className="w-3.5 h-3.5" strokeWidth={1.8} />No email</p>
              )}
              {venue.contactPhone ? (
                <a href={`tel:${venue.contactPhone}`} className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                  <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {venue.contactPhone}
                </a>
              ) : (
                <p className="flex items-center gap-2 text-xs text-surface-400"><Phone className="w-3.5 h-3.5" strokeWidth={1.8} />No phone</p>
              )}
              {venue.website && (
                <a href={venue.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                  <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {venue.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Quick Stats</h3>
            <InfoRow label="Times Used">{eventCount}</InfoRow>
            <InfoRow label="Added">{venue.createdAt}</InfoRow>
          </div>

          <Link
            href="/event-manager/events/new"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            <CalendarDays className="w-4 h-4" strokeWidth={2} />
            Book for Event
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Events tab ─────────────────────────────────────────────────────────────────

function EventsTab({ events }: { events: LinkedEvent[] }) {
  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      <div className="flex items-center gap-2">
        <Link
          href="/event-manager/events/new"
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Book for New Event
        </Link>
      </div>
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No linked events" description="No events have used this venue yet." compact />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Guests</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link href={`/event-manager/events/${ev.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                      {ev.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell whitespace-nowrap">{ev.date}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{ev.client}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">{ev.guests ?? "—"}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={eventBadgeStatus(ev.status) as never} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Documents tab ──────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({ value, label }));

function DocumentsTab({ venueId, documents }: { venueId: string; documents: VenueDocRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState("hire-agreement");
  const [expiry, setExpiry] = useState("");

  function handleFile(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("doc_type", docType);
    fd.set("expiry_date", expiry);
    startTransition(async () => {
      try {
        await uploadVenueDocument(venueId, fd);
        setExpiry("");
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  function handleDownload(docId: string) {
    startTransition(async () => {
      try {
        const url = await getVenueDocumentUrl(venueId, docId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Could not open document");
      }
    });
  }

  function handleDelete(docId: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteVenueDocument(venueId, docId);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      {error && (
        <div className="p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Document Type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Expiry Date (optional)</label>
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg transition-colors shadow-brand cursor-pointer shrink-0",
          pending ? "opacity-60 pointer-events-none" : "hover:bg-brand-700"
        )}>
          <Upload className="w-4 h-4" strokeWidth={2} />
          {pending ? "Uploading…" : "Upload Document"}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded" description="Upload hire agreements, floor plans, insurance and certificates here." compact />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Filename</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Expiry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Uploaded</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 text-xs truncate">{doc.filename}</p>
                        <p className="text-[10px] text-surface-400">{formatBytes(doc.sizeBytes)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{DOC_TYPE_LABEL[doc.docType] ?? doc.docType}</td>
                  <td className="px-4 py-3.5 text-surface-400 text-xs hidden lg:table-cell whitespace-nowrap">{doc.expiry}</td>
                  <td className="px-4 py-3.5"><DocHealthBadge health={doc.health} /></td>
                  <td className="px-4 py-3.5 text-surface-400 text-xs hidden xl:table-cell whitespace-nowrap">{doc.created}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(doc.id)}
                        disabled={pending}
                        className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors disabled:opacity-50"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        disabled={pending}
                        className="p-1.5 rounded-lg text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-surface-400">
        Documents are upload-only and stored securely. No external URL fields are permitted.
      </p>
    </div>
  );
}

// ── Notes tab ──────────────────────────────────────────────────────────────────

function NotesTab({ venueId, notes }: { venueId: string; notes: VenueNoteRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);

  const pinned = notes.filter((n) => n.isPinned);
  const rest = notes.filter((n) => !n.isPinned);

  function handleAdd() {
    if (body.trim() === "") return;
    setError(null);
    const fd = new FormData();
    fd.set("body", body);
    if (pin) fd.set("is_pinned", "on");
    startTransition(async () => {
      try {
        await addVenueNote(venueId, fd);
        setBody("");
        setPin(false);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Failed to add note");
      }
    });
  }

  function handleTogglePin(noteId: string, current: boolean) {
    startTransition(async () => {
      try {
        await toggleVenueNotePin(venueId, noteId, !current);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("Delete this note?")) return;
    startTransition(async () => {
      try {
        await deleteVenueNote(venueId, noteId);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
      }
    });
  }

  function NoteCard({ note }: { note: VenueNoteRow }) {
    return (
      <div className={cn(
        "bg-white rounded-xl border shadow-card p-4",
        note.isPinned ? "border-brand-200 ring-1 ring-brand-100" : "border-surface-200"
      )}>
        <p className="text-sm text-surface-800 leading-relaxed whitespace-pre-wrap">{note.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-surface-400">{note.created}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleTogglePin(note.id, note.isPinned)}
              disabled={pending}
              className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-brand-600 transition-colors disabled:opacity-50"
              title={note.isPinned ? "Unpin" : "Pin"}
            >
              {note.isPinned ? <PinOff className="w-3.5 h-3.5" strokeWidth={1.8} /> : <Pin className="w-3.5 h-3.5" strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(note.id)}
              disabled={pending}
              className="p-1.5 rounded-lg text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-[900px]">
      {error && (
        <div className="p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 space-y-3">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note about this venue…"
          className="w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
            Pin this note
          </label>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || body.trim() === ""}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-brand"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add Note
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" description="Capture useful detail about this venue — access, contacts, quirks." compact />
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider">
                <Pin className="w-3 h-3" strokeWidth={2} /> Pinned
              </p>
              {pinned.map((n) => <NoteCard key={n.id} note={n} />)}
            </div>
          )}
          {rest.length > 0 && (
            <div className="space-y-3">
              {pinned.length > 0 && (
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">All Notes</p>
              )}
              {rest.map((n) => <NoteCard key={n.id} note={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Activity tab ───────────────────────────────────────────────────────────────

function ActivityTab({
  venue,
  documents,
  notes,
  events,
}: {
  venue: VenueDetail;
  documents: VenueDocRow[];
  notes: VenueNoteRow[];
  events: LinkedEvent[];
}) {
  // Compose a lightweight, deterministic activity feed from existing records.
  const items: { icon: typeof Clock; label: string; meta: string }[] = [
    { icon: Building2, label: `Venue "${venue.name}" added to the directory`, meta: venue.createdAt },
    ...documents.map((d) => ({
      icon: FileText,
      label: `Document uploaded — ${DOC_TYPE_LABEL[d.docType] ?? d.docType}`,
      meta: d.created,
    })),
    ...notes.map((n) => ({
      icon: StickyNote,
      label: `Note added${n.isPinned ? " (pinned)" : ""}`,
      meta: n.created,
    })),
    ...events.map((e) => ({
      icon: CalendarDays,
      label: `Linked to event — ${e.name}`,
      meta: e.date,
    })),
  ];

  return (
    <div className="p-6 max-w-[800px]">
      {items.length === 0 ? (
        <EmptyState icon={Clock} title="No activity yet" description="Activity will appear here as documents, notes and events are added." compact />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
          <ol className="space-y-4">
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-800">{item.label}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{item.meta}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Main client ────────────────────────────────────────────────────────────────

export function VenueDetailClient({
  venue,
  documents,
  notes,
  events,
}: {
  venue: VenueDetail;
  documents: VenueDocRow[];
  notes: VenueNoteRow[];
  events: LinkedEvent[];
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "events", label: "Events", count: events.length },
    { id: "documents", label: "Documents", count: documents.length },
    { id: "notes", label: "Notes", count: notes.length },
    { id: "activity", label: "Activity" },
  ];

  const tabContent: Record<string, React.ReactNode> = {
    overview: <OverviewTab venue={venue} eventCount={events.length} docCount={documents.length} />,
    events: <EventsTab events={events} />,
    documents: <DocumentsTab venueId={venue.id} documents={documents} />,
    notes: <NotesTab venueId={venue.id} notes={notes} />,
    activity: <ActivityTab venue={venue} documents={documents} notes={notes} events={events} />,
  };

  return (
    <div className="animate-fade-in">
      <VenueHero venue={venue} />
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
