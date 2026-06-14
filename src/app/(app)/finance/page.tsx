import Link from "next/link";
import { Banknote, Clock, AlertCircle, TrendingUp, Plus, FileText, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Invoice, Quote } from "@/lib/supabase/types";
import { invoiceBadgeStatus, quoteBadgeStatus } from "./_lib/finance";

export const metadata = { title: "Finance" };

const FINANCE_TABS = [
  { href: "/finance", label: "Overview", active: true },
  { href: "/finance/quotes", label: "Quotes" },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/payments", label: "Payments" },
  { href: "/finance/profit", label: "Profit" },
];

export default async function FinancePage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: invData }, { data: recentInvData }, { data: recentQuoteData }] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_cents, paid_cents, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, status, total_cents, currency, due_on, created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("quotes")
      .select("id, code, title, status, total_cents, currency, created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const allInvoices = (invData ?? []) as Pick<Invoice, "total_cents" | "paid_cents" | "status">[];
  const totalInvoiced = allInvoices.reduce((s, i) => s + i.total_cents, 0);
  const totalPaid = allInvoices.reduce((s, i) => s + i.paid_cents, 0);
  const outstanding = allInvoices.reduce((s, i) => s + (i.total_cents - i.paid_cents), 0);
  const overdue = allInvoices
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + (i.total_cents - i.paid_cents), 0);

  const recentInvoices = (recentInvData ?? []) as Pick<
    Invoice,
    "id" | "invoice_number" | "client_name" | "status" | "total_cents" | "currency" | "due_on" | "created_at"
  >[];
  const recentQuotes = (recentQuoteData ?? []) as Pick<
    Quote,
    "id" | "code" | "title" | "status" | "total_cents" | "currency" | "created_at"
  >[];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Finance"
        description="Quotes, invoices, payments and profit analysis"
        actions={
          <>
            <Link
              href="/finance/quotes/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Quote
            </Link>
            <Link
              href="/finance/invoices/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              New Invoice
            </Link>
          </>
        }
        tabs={
          <div className="flex gap-0 overflow-x-auto">
            {FINANCE_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-150 " +
                  (tab.active
                    ? "text-brand-600 border-brand-600 bg-brand-50/40"
                    : "text-surface-500 border-transparent hover:text-surface-800 hover:border-surface-300")
                }
              >
                {tab.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Invoiced" value={formatCurrency(totalInvoiced / 100)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Total Paid" value={formatCurrency(totalPaid / 100)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Outstanding" value={formatCurrency(outstanding / 100)} icon={Clock} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Overdue" value={formatCurrency(overdue / 100)} icon={AlertCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
        </KPIGrid>

        {/* Recent invoices */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
            <h2 className="text-sm font-semibold text-surface-900">Recent Invoices</h2>
            <Link href="/finance/invoices" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet" description="Create your first invoice to start billing clients." compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">
                        <Link href={`/finance/invoices/${inv.id}`} className="block">{inv.invoice_number}</Link>
                      </td>
                      <td className="px-6 py-3 font-medium text-surface-900">
                        <Link href={`/finance/invoices/${inv.id}`} className="block">{inv.client_name ?? "—"}</Link>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(inv.total_cents / 100, inv.currency)}</td>
                      <td className="px-6 py-3"><StatusBadge status={invoiceBadgeStatus(inv.status)} /></td>
                      <td className="px-6 py-3 text-surface-500">{inv.due_on ? formatDate(inv.due_on) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent quotes */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
            <h2 className="text-sm font-semibold text-surface-900">Recent Quotes</h2>
            <Link href="/finance/quotes" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
          </div>
          {recentQuotes.length === 0 ? (
            <EmptyState icon={FileText} title="No quotes yet" description="Create your first quote to start tracking supplier pricing." compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Quote Ref</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {recentQuotes.map((q) => (
                    <tr key={q.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">
                        <Link href={`/finance/quotes/${q.id}`} className="block">{q.code}</Link>
                      </td>
                      <td className="px-6 py-3 font-medium text-surface-900">
                        <Link href={`/finance/quotes/${q.id}`} className="block">{q.title ?? "Untitled quote"}</Link>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(q.total_cents / 100, q.currency)}</td>
                      <td className="px-6 py-3"><StatusBadge status={quoteBadgeStatus(q.status)} /></td>
                      <td className="px-6 py-3 text-surface-500">{formatDate(q.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
