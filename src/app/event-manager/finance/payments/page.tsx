import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { InvoicePayment } from "@/lib/supabase/types";

export const metadata = { title: "Payments" };

type PaymentRow = Pick<
  InvoicePayment,
  "id" | "amount_cents" | "currency" | "method" | "paid_at" | "status" | "created_at" | "invoice_id"
> & {
  invoices: { id: string; invoice_number: string; client_name: string | null } | null;
};

export default async function PaymentsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoice_payments")
    .select(
      "id, amount_cents, currency, method, paid_at, status, created_at, invoice_id, invoices(id, invoice_number, client_name)"
    )
    .eq("workspace_id", workspaceId)
    .order("paid_at", { ascending: false });

  const payments = (data ?? []) as unknown as PaymentRow[];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader title="Payments" description="All recorded invoice payments" />

      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center">
          <span className="ml-auto text-xs text-surface-400">
            {payments.length} {payments.length === 1 ? "payment" : "payments"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments yet"
              description="Payments recorded against invoices will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">
                        {pay.invoices ? (
                          <Link href={`/event-manager/finance/invoices/${pay.invoices.id}`} className="hover:text-brand-600">
                            {pay.invoices.invoice_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3 text-surface-600">{pay.invoices?.client_name ?? "—"}</td>
                      <td className="px-6 py-3 text-right font-semibold text-success-700 tabular-nums">
                        {formatCurrency(pay.amount_cents / 100, pay.currency)}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                          {pay.method ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-surface-500 capitalize">{pay.status}</td>
                      <td className="px-6 py-3 text-surface-500">{formatDate(pay.paid_at ?? pay.created_at)}</td>
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
