import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { QuoteLine } from "@/lib/supabase/types";
import { quoteBadgeStatus, addDays } from "../../_lib/finance";

export const metadata = { title: "Quote" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", quoteId)
    .is("archived_at", null)
    .maybeSingle();

  if (!quote) notFound();

  const { data: lineData } = await supabase
    .from("quote_lines")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });

  const lines = (lineData ?? []) as QuoteLine[];
  const currency = quote.currency;
  const expiry = quote.deadline ?? addDays(quote.sent_at ?? quote.created_at, quote.valid_days);

  const info: { label: string; value: string }[] = [
    { label: "Quote Ref", value: quote.code },
    { label: "Title", value: quote.title ?? "—" },
    { label: "Date Sent", value: quote.sent_at ? formatDate(quote.sent_at) : "—" },
    { label: "Expiry Date", value: expiry ? formatDate(expiry) : "—" },
    { label: "Currency", value: currency },
    { label: "Created", value: formatDate(quote.created_at) },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={quote.code}
        description={quote.title ?? "Quote"}
        actions={
          <>
            <Link
              href="/finance/quotes"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <StatusBadge status={quoteBadgeStatus(quote.status)} />
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6 max-w-5xl">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Quote Information</h3>
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
            <EmptyState title="No line items" description="This quote has no line items yet." compact />
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
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{item.qty_x100 / 100}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{formatCurrency(item.unit_price_cents / 100, currency)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{(item.tax_pct_x100 / 100).toFixed(0)}%</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-surface-900">{formatCurrency(item.line_total_cents / 100, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-surface-50 border-t border-surface-200">
                  <tr className="border-t border-surface-100">
                    <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Subtotal</td>
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(quote.subtotal_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t border-surface-100">
                    <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Tax</td>
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-surface-900">{formatCurrency(quote.tax_cents / 100, currency)}</td>
                  </tr>
                  <tr className="border-t-2 border-surface-200">
                    <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Total</td>
                    <td className="px-6 py-3 text-right tabular-nums text-lg font-bold text-surface-900">{formatCurrency(quote.total_cents / 100, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {(quote.scope || quote.notes) && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
            {quote.scope && (
              <div>
                <h3 className="text-sm font-semibold text-surface-900 mb-2">Scope</h3>
                <p className="text-sm text-surface-600 leading-relaxed whitespace-pre-line">{quote.scope}</p>
              </div>
            )}
            {quote.notes && (
              <div>
                <h3 className="text-sm font-semibold text-surface-900 mb-2">Notes</h3>
                <p className="text-sm text-surface-600 leading-relaxed whitespace-pre-line">{quote.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
