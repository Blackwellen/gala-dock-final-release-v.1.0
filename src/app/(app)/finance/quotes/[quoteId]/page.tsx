"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Send,
  Copy,
  Archive,
  Paperclip,
  Upload,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { formatCurrency } from "@/lib/utils";

const TABS = [
  { id: "details", label: "Quote Details" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" },
];

const QUOTE = {
  ref: "QT-2026-001",
  supplier: "Noble Kitchen Co.",
  event: "The Carter Wedding",
  status: "sent" as const,
  dateSent: "28 May 2026",
  expiry: "11 Jun 2026",
  currency: "GBP",
  notes: "Please confirm availability for the full weekend. Dietary requirements attached. All items include standard setup and teardown.",
};

const LINE_ITEMS = [
  { description: "Catering — Wedding Breakfast", qty: 120, unitPrice: 35, tax: 20 },
  { description: "Catering — Evening Buffet",   qty: 80,  unitPrice: 22, tax: 20 },
  { description: "Service Staff",               qty: 8,   unitPrice: 180, tax: 20 },
];

const FILES = [
  { name: "quote_brief.pdf", size: "142 KB", uploaded: "28 May 2026", type: "PDF" },
];

const ACTIVITY = [
  { icon: CheckCircle2, color: "text-brand-600",   bg: "bg-brand-50",   label: "Quote created",             time: "28 May 2026 · 09:14" },
  { icon: Send,          color: "text-success-600", bg: "bg-success-50", label: "Quote sent to supplier",    time: "28 May 2026 · 09:22" },
  { icon: Clock,         color: "text-warning-600", bg: "bg-warning-50", label: "Reminder sent",             time: "4 Jun 2026 · 10:00" },
];

export default function QuoteDetailPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("details");

  const subtotal = LINE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const taxTotal = LINE_ITEMS.reduce((sum, item) => sum + (item.qty * item.unitPrice * item.tax) / 100, 0);
  const total = subtotal + taxTotal;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={QUOTE.ref}
        description={`${QUOTE.supplier} · ${QUOTE.event}`}
        actions={
          <>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <StatusBadge status={QUOTE.status} />
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              <Send className="w-4 h-4" />
              Send to Supplier
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </>
        }
        tabs={<TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />}
      />

      <div className="flex-1 p-6 space-y-6 max-w-5xl">

        {/* ── QUOTE DETAILS ── */}
        {activeTab === "details" && (
          <>
            {/* Info card */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h3 className="text-sm font-semibold text-surface-900 mb-4">Quote Information</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                {[
                  { label: "Quote Ref",    value: QUOTE.ref },
                  { label: "Event",        value: QUOTE.event },
                  { label: "Supplier",     value: QUOTE.supplier },
                  { label: "Date Sent",    value: QUOTE.dateSent },
                  { label: "Expiry Date",  value: QUOTE.expiry },
                  { label: "Currency",     value: QUOTE.currency },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-surface-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Line items */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200">
                <h3 className="text-sm font-semibold text-surface-900">Line Items</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Qty</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Unit Price</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Tax %</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {LINE_ITEMS.map((item, i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="px-6 py-3 text-surface-900">{item.description}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-surface-600">{item.qty}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-surface-600">{item.tax}%</td>
                        <td className="px-6 py-3 text-right tabular-nums font-medium text-surface-900">{formatCurrency(item.qty * item.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-50 border-t border-surface-200">
                    <tr className="border-t border-surface-100">
                      <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Subtotal</td>
                      <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(subtotal)}</td>
                    </tr>
                    <tr className="border-t border-surface-100">
                      <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Tax (20%)</td>
                      <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(taxTotal)}</td>
                    </tr>
                    <tr className="border-t-2 border-surface-200">
                      <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Total</td>
                      <td className="px-6 py-3 text-right tabular-nums text-lg font-bold text-surface-900">{formatCurrency(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Notes</h3>
              <p className="text-sm text-surface-600 leading-relaxed">{QUOTE.notes}</p>
            </div>
          </>
        )}

        {/* ── FILES ── */}
        {activeTab === "files" && (
          <div className="space-y-4">
            {/* Upload area */}
            <label className="flex flex-col items-center justify-center gap-3 w-full border-2 border-dashed border-surface-200 rounded-xl p-10 bg-white hover:border-brand-400 hover:bg-brand-50/30 transition-colors cursor-pointer">
              <input type="file" className="hidden" multiple />
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
                <Upload className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-surface-700">Upload files</p>
                <p className="text-xs text-surface-400 mt-1">PDF, DOCX, XLSX, PNG, JPG up to 50 MB</p>
              </div>
            </label>

            {/* File list */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200">
                <h3 className="text-sm font-semibold text-surface-900">Uploaded Files</h3>
              </div>
              {FILES.map((file, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-0">
                  <div className="w-10 h-10 rounded-lg bg-danger-50 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-danger-600" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{file.name}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{file.type} · {file.size} · Uploaded {file.uploaded}</p>
                  </div>
                  <button className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0">Download</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {activeTab === "activity" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-900 mb-6">Activity Timeline</h3>
            <ol className="relative border-l border-surface-200 space-y-6 ml-3">
              {ACTIVITY.map((entry, i) => (
                <li key={i} className="ml-6">
                  <span className={`absolute -left-4 flex h-8 w-8 items-center justify-center rounded-full ${entry.bg}`}>
                    <entry.icon className={`w-4 h-4 ${entry.color}`} strokeWidth={1.8} />
                  </span>
                  <div className="ml-2">
                    <p className="text-sm font-medium text-surface-900">{entry.label}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{entry.time}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

      </div>
    </div>
  );
}
