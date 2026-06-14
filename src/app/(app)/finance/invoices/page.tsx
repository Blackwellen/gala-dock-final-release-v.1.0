import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/supabase/types";
import { invoiceBadgeStatus } from "../_lib/finance";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, client_name, status, total_cents, paid_cents, currency, due_on, issued_on, created_at"
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const invoices = (data ?? []) as Pick<
    Invoice,
    | "id"
    | "invoice_number"
    | "client_name"
    | "status"
    | "total_cents"
    | "paid_cents"
    | "currency"
    | "due_on"
    | "issued_on"
    | "created_at"
  >[];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Invoices"
        description="Issue and track client invoices"
        actions={
          <Link
            href="/finance/invoices/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </Link>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center">
          <span className="ml-auto text-xs text-surface-400">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Create your first invoice to start billing clients."
              action={
                <Link
                  href="/finance/invoices/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Invoice
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Outstanding</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-surface-500">
                        <Link href={`/finance/invoices/${inv.id}`} className="block">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-6 py-3 font-medium text-surface-900">
                        <Link href={`/finance/invoices/${inv.id}`} className="block">
                          {inv.client_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                        {formatCurrency(inv.total_cents / 100, inv.currency)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                        {formatCurrency((inv.total_cents - inv.paid_cents) / 100, inv.currency)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={invoiceBadgeStatus(inv.status)} />
                      </td>
                      <td className="px-6 py-3 text-surface-500">
                        {inv.due_on ? formatDate(inv.due_on) : "—"}
                      </td>
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
