"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Clock,
  BarChart2,
  Plus,
  FileText,
  Download,
  Eye,
  Send,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "profit", label: "Profit" },
];

// --- OVERVIEW DATA ---
const OVERVIEW_INVOICES = [
  { ref: "INV-2026-008", event: "Hartley Wedding",      client: "Emma Hartley",    amount: 18500, status: "paid"    as const, due: "10 Jun 2026" },
  { ref: "INV-2026-007", event: "TechSummit 2026",      client: "Apex Corp",       amount: 34200, status: "unpaid"  as const, due: "5 Jun 2026"  },
  { ref: "INV-2026-006", event: "Spring Gala",           client: "Riviera Hotels",  amount: 12400, status: "overdue" as const, due: "1 May 2026"  },
  { ref: "INV-2026-005", event: "Clarke Conference",     client: "Clarke & Sons",   amount: 15600, status: "sent"    as const, due: "20 Jun 2026" },
  { ref: "INV-2026-004", event: "Patel Anniversary",    client: "Priya Patel",     amount: 9800,  status: "paid"    as const, due: "15 Apr 2026" },
];

// --- QUOTES DATA ---
const QUOTES_DATA = [
  { ref: "QT-2026-006", event: "Hartley Wedding",   supplier: "Noble Kitchen Co.",   amount: 8400,  status: "approved" as const, dateSent: "2 Jun 2026"  },
  { ref: "QT-2026-005", event: "TechSummit 2026",   supplier: "AV Pro Solutions",    amount: 14200, status: "sent"     as const, dateSent: "28 May 2026" },
  { ref: "QT-2026-004", event: "Gala Fundraiser",   supplier: "Bloom Floral Studio", amount: 4800,  status: "pending"  as const, dateSent: "25 May 2026" },
  { ref: "QT-2026-003", event: "Miller Birthday",   supplier: "Starlight Events",    amount: 3200,  status: "rejected" as const, dateSent: "20 May 2026" },
  { ref: "QT-2026-002", event: "Clarke Conference", supplier: "Prestige Catering",   amount: 11600, status: "approved" as const, dateSent: "15 May 2026" },
];

// --- INVOICES DATA ---
const INVOICES_DATA = [
  { ref: "INV-2026-008", event: "Hartley Wedding",      client: "Emma Hartley",   amount: 18500, status: "paid"    as const, due: "10 Jun 2026" },
  { ref: "INV-2026-007", event: "TechSummit 2026",      client: "Apex Corp",      amount: 34200, status: "unpaid"  as const, due: "5 Jun 2026"  },
  { ref: "INV-2026-006", event: "Spring Gala",           client: "Riviera Hotels", amount: 12400, status: "overdue" as const, due: "1 May 2026"  },
  { ref: "INV-2026-005", event: "Clarke Conference",    client: "Clarke & Sons",  amount: 15600, status: "sent"    as const, due: "20 Jun 2026" },
  { ref: "INV-2026-004", event: "Patel Anniversary",   client: "Priya Patel",    amount: 9800,  status: "paid"    as const, due: "15 Apr 2026" },
  { ref: "INV-2026-003", event: "Thompson Charity Ball",client: "Thompson Trust", amount: 31000, status: "draft"   as const, due: "30 Jun 2026" },
];

// --- PAYMENTS DATA ---
const PAYMENTS_DATA = [
  { ref: "PAY-2026-005", invoiceRef: "INV-2026-008", event: "Hartley Wedding",      amount: 18500, method: "Bank Transfer", date: "8 Jun 2026"  },
  { ref: "PAY-2026-004", invoiceRef: "INV-2026-004", event: "Patel Anniversary",    amount: 9800,  method: "Card",          date: "14 Apr 2026" },
  { ref: "PAY-2026-003", invoiceRef: "INV-2026-001", event: "Carter Wedding",       amount: 4200,  method: "BACS",          date: "1 Jun 2026"  },
  { ref: "PAY-2026-002", invoiceRef: "INV-2026-002", event: "Spring Gala",          amount: 6200,  method: "Bank Transfer", date: "20 Mar 2026" },
  { ref: "PAY-2026-001", invoiceRef: "INV-2026-000", event: "Thompson Charity Ball",amount: 15500, method: "BACS",          date: "10 Feb 2026" },
];

// --- PROFIT DATA ---
const PROFIT_DATA = [
  { event: "Hartley Wedding",       revenue: 28500, costs: 18200, profit: 10300, margin: 36.1 },
  { event: "TechSummit 2026",       revenue: 42000, costs: 29400, profit: 12600, margin: 30.0 },
  { event: "Spring Gala",           revenue: 18000, costs: 13500, profit: 4500,  margin: 25.0 },
  { event: "Clarke Conference",     revenue: 22000, costs: 18700, profit: 3300,  margin: 15.0 },
  { event: "Patel Anniversary",     revenue: 12000, costs: 10400, profit: 1600,  margin: 13.3 },
];

function marginColor(margin: number) {
  if (margin >= 30) return "text-success-700 bg-success-50 border-success-200";
  if (margin >= 15) return "text-warning-700 bg-warning-50 border-warning-200";
  return "text-danger-700 bg-danger-50 border-danger-200";
}

export default function FinancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Finance"
        description="Quotes, invoices, payments and profit analysis"
        actions={
          <>
            <button
              onClick={() => router.push("/finance/quotes/new")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Quote
            </button>
            <button
              onClick={() => router.push("/finance/invoices/new")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              New Invoice
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </>
        }
        tabs={
          <TabNav
            tabs={TABS}
            active={activeTab}
            onChange={setActiveTab}
          />
        }
      />

      <div className="flex-1 p-6 space-y-6">

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <>
            <KPIGrid className="grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total Revenue YTD"  value={formatCurrency(142500)} icon={Banknote}     iconColor="text-brand-600"   iconBg="bg-brand-50"   />
              <MetricCard label="Outstanding"         value={formatCurrency(18200)}  icon={Clock}        iconColor="text-warning-600" iconBg="bg-warning-50" />
              <MetricCard label="Overdue"             value={formatCurrency(3400)}   icon={AlertCircle}  iconColor="text-danger-600"  iconBg="bg-danger-50"  />
              <MetricCard label="Avg Event Value"     value={formatCurrency(11875)}  icon={TrendingUp}   iconColor="text-success-600" iconBg="bg-success-50" />
            </KPIGrid>

            {/* Revenue chart placeholder */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card min-h-52 flex flex-col items-center justify-center gap-3 p-8">
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
              </div>
              <p className="text-sm font-semibold text-surface-700">Revenue chart — coming in V1.5</p>
              <p className="text-xs text-surface-400">Monthly revenue trends will appear here</p>
            </div>

            {/* Recent invoices */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Recent Invoices</h2>
                <button onClick={() => setActiveTab("invoices")} className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {OVERVIEW_INVOICES.map((inv, i) => (
                      <tr key={i} className="hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => router.push(`/finance/invoices/${i + 1}`)}>
                        <td className="px-6 py-3 font-mono text-xs text-surface-500">{inv.ref}</td>
                        <td className="px-6 py-3 font-medium text-surface-900">{inv.event}</td>
                        <td className="px-6 py-3 text-surface-600">{inv.client}</td>
                        <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(inv.amount)}</td>
                        <td className="px-6 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-6 py-3 text-surface-500">{inv.due}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── QUOTES ── */}
        {activeTab === "quotes" && (
          <>
            <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
              <MetricCard label="Quotes Sent"      value="24"  icon={Send}        iconColor="text-brand-600"   iconBg="bg-brand-50"   />
              <MetricCard label="Accepted"         value="18"  icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
              <MetricCard label="Pending"          value="4"   icon={Clock}        iconColor="text-warning-600" iconBg="bg-warning-50" />
              <MetricCard label="Rejected"         value="2"   icon={AlertCircle}  iconColor="text-danger-600"  iconBg="bg-danger-50"  />
              <MetricCard label="Conversion Rate"  value="75%" icon={TrendingUp}   iconColor="text-success-600" iconBg="bg-success-50" />
            </KPIGrid>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Quotes</h2>
                <button onClick={() => router.push("/finance/quotes/new")} className="inline-flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700 font-medium">
                  <Plus className="w-3.5 h-3.5" /> New Quote
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Quote Ref</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {QUOTES_DATA.map((q, i) => (
                      <tr key={i} className="hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => router.push(`/finance/quotes/${i + 1}`)}>
                        <td className="px-6 py-3 font-mono text-xs text-surface-500">{q.ref}</td>
                        <td className="px-6 py-3 font-medium text-surface-900">{q.event}</td>
                        <td className="px-6 py-3 text-surface-600">{q.supplier}</td>
                        <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(q.amount)}</td>
                        <td className="px-6 py-3"><StatusBadge status={q.status} /></td>
                        <td className="px-6 py-3 text-surface-500">{q.dateSent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── INVOICES ── */}
        {activeTab === "invoices" && (
          <>
            <KPIGrid className="grid-cols-2 sm:grid-cols-4">
              <MetricCard label="Draft"   value="3"  icon={FileText}    iconColor="text-surface-500"  iconBg="bg-surface-100"  />
              <MetricCard label="Sent"    value="8"  icon={Send}        iconColor="text-brand-600"   iconBg="bg-brand-50"   />
              <MetricCard label="Paid"    value="12" icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
              <MetricCard label="Overdue" value="2"  icon={AlertCircle}  iconColor="text-danger-600"  iconBg="bg-danger-50"  />
            </KPIGrid>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Invoices</h2>
                <button onClick={() => router.push("/finance/invoices/new")} className="inline-flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700 font-medium">
                  <Plus className="w-3.5 h-3.5" /> New Invoice
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {INVOICES_DATA.map((inv, i) => (
                      <tr key={i} className="group hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => router.push(`/finance/invoices/${i + 1}`)}>
                        <td className="px-6 py-3 font-mono text-xs text-surface-500">{inv.ref}</td>
                        <td className="px-6 py-3 font-medium text-surface-900">{inv.event}</td>
                        <td className="px-6 py-3 text-surface-600">{inv.client}</td>
                        <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(inv.amount)}</td>
                        <td className="px-6 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-6 py-3 text-surface-500">{inv.due}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors" title="View">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors" title="Download">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── PAYMENTS ── */}
        {activeTab === "payments" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200">
              <h2 className="text-sm font-semibold text-surface-900">Payment Records</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {PAYMENTS_DATA.map((pay, i) => (
                    <tr key={i} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">{pay.ref}</td>
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">{pay.invoiceRef}</td>
                      <td className="px-6 py-3 font-medium text-surface-900">{pay.event}</td>
                      <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(pay.amount)}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                          {pay.method}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-surface-500">{pay.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PROFIT ── */}
        {activeTab === "profit" && (
          <>
            <KPIGrid className="grid-cols-2 sm:grid-cols-4">
              <MetricCard label="Gross Revenue" value={formatCurrency(142500)} icon={Banknote}    iconColor="text-brand-600"   iconBg="bg-brand-50"   />
              <MetricCard label="Total Costs"   value={formatCurrency(87300)}  icon={TrendingDown} iconColor="text-danger-600"  iconBg="bg-danger-50"  />
              <MetricCard label="Gross Profit"  value={formatCurrency(55200)}  icon={TrendingUp}  iconColor="text-success-600" iconBg="bg-success-50" />
              <MetricCard label="Margin"        value="38.7%"                  icon={BarChart2}    iconColor="text-success-600" iconBg="bg-success-50" />
            </KPIGrid>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Profit by Event</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Revenue</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Costs</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Profit</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {PROFIT_DATA.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-surface-900">{row.event}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-surface-900">{formatCurrency(row.revenue)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(row.costs)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(row.profit)}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", marginColor(row.margin))}>
                            {row.margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
