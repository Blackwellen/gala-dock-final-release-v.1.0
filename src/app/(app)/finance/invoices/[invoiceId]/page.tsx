import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceLineItem, InvoicePayment } from "@/lib/supabase/types";
import { invoiceBadgeStatus } from "../../_lib/finance";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", invoiceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!invoice) notFound();

  const [{ data: lineData }, { data: paymentData }] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoiceId)
      .order("position", { ascending: true }),
    supabase
      .from("invoice_payments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false }),
  ]);

  const lines = (lineData ?? []) as InvoiceLineItem[];
  const payments = (paymentData ?? []) as InvoicePayment[];
  const currency = invoice.currency;
  const balance = invoice.total_cents - invoice.paid_cents;
  const paidPct =
    invoice.total_cents > 0
      ? Math.min(100, Math.round((invoice.paid_cents / invoice.total_cents) * 100))
      : 0;

  const info: { label: string; value: string }[] = [
    { label: "Invoice No", value: invoice.invoice_number },
    { label: "Client", value: invoice.client_name ?? "—" },
    { label: "Issued Date", value: invoice.issued_on ? formatDate(invoice.issued_on) : "—" },
    { label: "Due Date", value: invoice.due_on ? formatDate(invoice.due_on) : "—" },
    { label: "Currency", value: currency },
    { label: "Reference", value: invoice.reference ?? "—" },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={invoice.invoice_number}
        description={invoice.client_name ?? "Invoice"}
        actions={
          <>
            <Link
              href="/finance/invoices"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <StatusBadge status={invoiceBadgeStatus(invoice.status)} />
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6 max-w-5xl">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Invoice Information</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
            {info.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-surface-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900">Line Items</h3>
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No line items" description="This invoice has no line items yet." compact />
          ) : (
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
                  {lines.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-50">
                      <td className="px-6 py-3 text-surface-900">{item.description}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{item.quantity}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(item.unit_cost_cents / 100, currency)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{(item.tax_rate_bps / 100).toFixed(0)}%</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-surface-900">{formatCurrency((item.unit_cost_cents * item.quantity) / 100, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-surface-50 border-t border-surface-200">
                  <tr className="border-t border-surface-100">
                    <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Subtotal</td>
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(invoice.subtotal_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t border-surface-100">
                    <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Tax</td>
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(invoice.tax_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t-2 border-surface-200">
                    <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Total</td>
                    <td className="px-6 py-3 text-right tabular-nums text-lg font-bold text-surface-900">{formatCurrency(invoice.total_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t border-surface-100">
                    <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-success-600 uppercase tracking-wider">Amount Paid</td>
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-success-700">− {formatCurrency(invoice.paid_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t border-surface-100 bg-warning-50/50">
                    <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Balance Due</td>
                    <td className="px-6 py-3 text-right tabular-nums text-lg font-bold text-warning-700">{formatCurrency(balance / 100, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-900">Payment Progress</h3>
            <span className="text-sm font-semibold text-surface-900">{paidPct}% paid</span>
          </div>
          <div className="w-full bg-surface-100 rounded-full h-3 overflow-hidden">
            <div className="h-3 rounded-full bg-success-500 transition-all duration-500" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-surface-400">
            <span>{formatCurrency(invoice.paid_cents / 100, currency)} paid</span>
            <span>{formatCurrency(balance / 100, currency)} remaining</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900">Payment History</h3>
          </div>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded" description="Payments against this invoice will appear here." compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-surface-50">
                      <td className="px-6 py-3 text-surface-600">{formatDate(pay.paid_at ?? pay.created_at)}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-success-700">{formatCurrency(pay.amount_cents / 100, pay.currency)}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                          {pay.method ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-surface-500 capitalize">{pay.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {invoice.notes && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Notes</h3>
            <p className="text-sm text-surface-600 leading-relaxed whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
