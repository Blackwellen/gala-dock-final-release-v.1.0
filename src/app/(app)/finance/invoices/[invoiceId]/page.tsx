"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Send,
  CheckCircle2,
  Download,
  Archive,
  Clock,
  FileText,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "details", label: "Invoice Details" },
  { id: "payments", label: "Payments" },
  { id: "activity", label: "Activity" },
];

const INVOICE = {
  ref: "INV-2026-001",
  event: "The Carter Wedding",
  client: "Sarah & James Carter",
  status: "pending" as const,
  issued: "28 May 2026",
  due: "11 Jun 2026",
  currency: "GBP",
  total: 8400,
  paid: 4200,
  notes: "50% deposit received. Balance due before event date. Please reference invoice number when making payment.",
};

const LINE_ITEMS = [
  { description: "Catering — Wedding Breakfast", qty: 120, unitPrice: 35, tax: 20 },
  { description: "Catering — Evening Buffet",   qty: 80,  unitPrice: 22, tax: 20 },
  { description: "Service Staff",               qty: 8,   unitPrice: 180, tax: 20 },
];

const PAYMENT_HISTORY = [
  { date: "1 Jun 2026", amount: 4200, method: "Bank Transfer", ref: "PAY-2026-001" },
];

const ACTIVITY = [
  { icon: CheckCircle2, color: "text-brand-600",   bg: "bg-brand-50",   label: "Invoice created",           time: "28 May 2026 · 09:14" },
  { icon: Send,          color: "text-success-600", bg: "bg-success-50", label: "Invoice sent to client",    time: "28 May 2026 · 09:30" },
  { icon: Clock,         color: "text-warning-600", bg: "bg-warning-50", label: "Partial payment received — £4,200", time: "1 Jun 2026 · 14:22" },
];

export default function InvoiceDetailPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("details");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: "", method: "Bank Transfer", ref: "" });

  const subtotal = LINE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const taxTotal = LINE_ITEMS.reduce((sum, item) => sum + (item.qty * item.unitPrice * item.tax) / 100, 0);
  const total = subtotal + taxTotal;
  const balance = INVOICE.total - INVOICE.paid;
  const paidPct = Math.round((INVOICE.paid / INVOICE.total) * 100);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={INVOICE.ref}
        description={`${INVOICE.client} · ${INVOICE.event}`}
        actions={
          <>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <StatusBadge status={INVOICE.status} />
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Send className="w-4 h-4" />
              Send to Client
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success-600 text-white text-sm font-medium hover:bg-success-700 transition-colors">
              <CheckCircle2 className="w-4 h-4" />
              Mark as Paid
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Download PDF
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

        {/* ── INVOICE DETAILS ── */}
        {activeTab === "details" && (
          <>
            {/* Info card */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h3 className="text-sm font-semibold text-surface-900 mb-4">Invoice Information</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                {[
                  { label: "Invoice No",   value: INVOICE.ref },
                  { label: "Event",        value: INVOICE.event },
                  { label: "Client",       value: INVOICE.client },
                  { label: "Issued Date",  value: INVOICE.issued },
                  { label: "Due Date",     value: INVOICE.due },
                  { label: "Currency",     value: INVOICE.currency },
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
                    <tr className="border-t border-surface-100">
                      <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-success-600 uppercase tracking-wider">Amount Paid</td>
                      <td className="px-6 py-2 text-right tabular-nums font-medium text-success-700">− {formatCurrency(INVOICE.paid)}</td>
                    </tr>
                    <tr className="border-t border-surface-100 bg-warning-50/50">
                      <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Balance Due</td>
                      <td className="px-6 py-3 text-right tabular-nums text-lg font-bold text-warning-700">{formatCurrency(balance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Payment progress */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-surface-900">Payment Progress</h3>
                <span className="text-sm font-semibold text-surface-900">{paidPct}% paid</span>
              </div>
              <div className="w-full bg-surface-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-success-500 transition-all duration-500"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-surface-400">
                <span>{formatCurrency(INVOICE.paid)} paid</span>
                <span>{formatCurrency(balance)} remaining</span>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Notes</h3>
              <p className="text-sm text-surface-600 leading-relaxed">{INVOICE.notes}</p>
            </div>
          </>
        )}

        {/* ── PAYMENTS ── */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h3 className="text-sm font-semibold text-surface-900">Payment History</h3>
                <button
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Record Payment
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {PAYMENT_HISTORY.map((pay, i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="px-6 py-3 text-surface-600">{pay.date}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-success-700">{formatCurrency(pay.amount)}</td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                            {pay.method}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-surface-400">{pay.ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Record payment inline form */}
            {showPaymentForm && (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
                <h3 className="text-sm font-semibold text-surface-900 mb-4">Record Payment</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-surface-700 mb-1.5">Amount (£)</label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-surface-700 mb-1.5">Date</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-surface-700 mb-1.5">Method</label>
                    <select
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    >
                      <option>Bank Transfer</option>
                      <option>Card</option>
                      <option>BACS</option>
                      <option>Cash</option>
                      <option>Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-surface-700 mb-1.5">Reference</label>
                    <input
                      type="text"
                      value={paymentForm.ref}
                      onChange={(e) => setPaymentForm({ ...paymentForm, ref: e.target.value })}
                      placeholder="e.g. PAY-2026-002"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <button className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                    Save Payment
                  </button>
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
