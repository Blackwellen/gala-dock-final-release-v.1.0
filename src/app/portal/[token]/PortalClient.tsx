"use client";

import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Users,
  FileText,
  Receipt,
  FileSignature,
  Download,
  ExternalLink,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface PortalData {
  workspaceName: string;
  event: {
    name: string;
    status: string;
    eventType: string | null;
    startAt: string | null;
    endAt: string | null;
    location: string | null;
    guestCountDay: number;
    guestCountEvening: number;
    clientName: string | null;
  };
  documents: {
    id: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number;
    createdAt: string;
  }[];
  invoice: {
    invoiceNumber: string;
    status: string;
    totalCents: number;
    paidCents: number;
    currency: string;
    dueOn: string | null;
    paymentLinkUrl: string | null;
    schedule: { label: string; amountCents: number; dueDate: string; status: string }[];
  } | null;
  proposal: {
    title: string;
    status: string;
    totalCents: number;
    currency: string;
    shareToken: string | null;
    signedByName: string | null;
    signedAt: string | null;
  } | null;
}

// StatusBadge keys use hyphens; events store underscores. Map known values and
// fall back gracefully for anything unmapped.
const EVENT_STATUS_MAP: Record<string, string> = {
  new_enquiry: "new-enquiry",
  briefing: "briefing",
  quoting: "quoting",
  awaiting_approval: "awaiting-approval",
  confirmed: "confirmed",
  in_delivery: "in-delivery",
  completed: "completed",
  cancelled: "cancelled",
};

type Tab = "overview" | "documents" | "invoice" | "proposal";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalClient({ data }: { data: PortalData }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { event, invoice, proposal } = data;

  const eventStatus = EVENT_STATUS_MAP[event.status] ?? "active";
  const guestTotal = (event.guestCountDay ?? 0) + (event.guestCountEvening ?? 0);

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "overview", label: "Overview", icon: CalendarDays },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "invoice", label: "Invoice", icon: Receipt },
    { id: "proposal", label: "Proposal", icon: FileSignature },
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top bar */}
      <header className="bg-white border-b border-surface-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-surface-900 truncate">
              {data.workspaceName}
            </p>
            <p className="text-xs text-surface-400 truncate">{event.name}</p>
          </div>
          <span className="text-xs text-surface-400 shrink-0">Powered by Gala Dock</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b border-surface-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 flex gap-0 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors " +
                  (active
                    ? "text-brand-600 border-brand-600"
                    : "text-surface-500 border-transparent hover:text-surface-800")
                }
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {tab === "overview" && (
          <>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-surface-900">{event.name}</h1>
                  {event.eventType && (
                    <p className="mt-1 text-sm text-surface-500">{event.eventType}</p>
                  )}
                </div>
                <StatusBadge status={eventStatus as never} />
              </div>

              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="flex items-start gap-3">
                  <CalendarDays className="w-5 h-5 text-surface-300 mt-0.5" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Date</dt>
                    <dd className="text-sm font-medium text-surface-900">
                      {event.startAt ? formatDate(event.startAt) : "To be confirmed"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-surface-300 mt-0.5" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Location</dt>
                    <dd className="text-sm font-medium text-surface-900">
                      {event.location ?? "To be confirmed"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-surface-300 mt-0.5" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Guests</dt>
                    <dd className="text-sm font-medium text-surface-900">
                      {guestTotal > 0 ? guestTotal : "—"}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h2 className="text-sm font-semibold text-surface-900">Welcome to your event portal</h2>
              <p className="mt-2 text-sm text-surface-500">
                Here you can review your shared documents, proposal and invoice for{" "}
                <span className="font-medium text-surface-700">{event.name}</span>. If anything
                looks incorrect, please contact {data.workspaceName} directly.
              </p>
            </div>
          </>
        )}

        {tab === "documents" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-900">Shared documents</h2>
            </div>
            {data.documents.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-surface-500">
                No documents have been shared with you yet.
              </div>
            ) : (
              <ul className="divide-y divide-surface-50">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                    <FileText className="w-5 h-5 text-surface-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-900 truncate">{d.filename}</p>
                      <p className="text-xs text-surface-400">
                        {fileSize(d.sizeBytes)} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs text-surface-400">
                      <Download className="w-4 h-4" /> Contact us to download
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "invoice" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            {!invoice ? (
              <p className="text-sm text-surface-500">No invoice is available yet.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-900">
                      Invoice {invoice.invoiceNumber}
                    </h2>
                    {invoice.dueOn && (
                      <p className="mt-1 text-sm text-surface-500">
                        Due {formatDate(invoice.dueOn)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={invoice.status as never} />
                </div>

                <dl className="mt-6 grid grid-cols-3 gap-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Total</dt>
                    <dd className="text-lg font-bold text-surface-900 tabular-nums">
                      {formatCurrency(invoice.totalCents / 100, invoice.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Paid</dt>
                    <dd className="text-lg font-bold text-success-600 tabular-nums">
                      {formatCurrency(invoice.paidCents / 100, invoice.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-surface-400">Outstanding</dt>
                    <dd className="text-lg font-bold text-surface-900 tabular-nums">
                      {formatCurrency(
                        Math.max(0, invoice.totalCents - invoice.paidCents) / 100,
                        invoice.currency
                      )}
                    </dd>
                  </div>
                </dl>

                {invoice.schedule.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-surface-100">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-3">
                      Payment schedule
                    </h3>
                    <ul className="space-y-2">
                      {invoice.schedule.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-surface-700">{s.label}</span>
                          <span className="flex items-center gap-3">
                            <span className="tabular-nums text-surface-900 font-medium">
                              {formatCurrency(s.amountCents / 100, invoice.currency)}
                            </span>
                            <StatusBadge status={s.status as never} dot={false} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {invoice.paymentLinkUrl && (
                  <a
                    href={invoice.paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
                  >
                    Pay online <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {tab === "proposal" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            {!proposal ? (
              <p className="text-sm text-surface-500">No proposal is available yet.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-900">{proposal.title}</h2>
                    <p className="mt-1 text-lg font-bold text-surface-900 tabular-nums">
                      {formatCurrency(proposal.totalCents / 100, proposal.currency)}
                    </p>
                  </div>
                  <StatusBadge status={proposal.status as never} />
                </div>

                {proposal.signedAt ? (
                  <p className="mt-5 text-sm text-success-700">
                    Signed{proposal.signedByName ? ` by ${proposal.signedByName}` : ""} on{" "}
                    {formatDate(proposal.signedAt)}.
                  </p>
                ) : proposal.shareToken ? (
                  <a
                    href={`/p/${proposal.shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
                  >
                    View &amp; Sign Proposal <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <p className="mt-5 text-sm text-surface-500">
                    Your proposal is being prepared and will appear here shortly.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
