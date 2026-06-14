import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Quote } from "@/lib/supabase/types";
import { quoteBadgeStatus, addDays } from "../_lib/finance";

export const metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("quotes")
    .select(
      "id, code, title, status, total_cents, currency, sent_at, deadline, valid_days, created_at"
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const quotes = (data ?? []) as Pick<
    Quote,
    | "id"
    | "code"
    | "title"
    | "status"
    | "total_cents"
    | "currency"
    | "sent_at"
    | "deadline"
    | "valid_days"
    | "created_at"
  >[];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Quotes"
        description="Create and manage event quotes"
        actions={
          <Link
            href="/finance/quotes/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Quote
          </Link>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="ml-auto text-xs text-surface-400">
            {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {quotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotes yet"
              description="Create your first quote to start tracking supplier pricing."
              action={
                <Link
                  href="/finance/quotes/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Quote
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date Sent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {quotes.map((q) => {
                    const expiry =
                      q.deadline ?? addDays(q.sent_at ?? q.created_at, q.valid_days);
                    return (
                      <tr key={q.id} className="group hover:bg-surface-50 transition-colors">
                        <td className="px-6 py-3 font-mono text-xs text-surface-500">
                          <Link href={`/finance/quotes/${q.id}`} className="block">
                            {q.code}
                          </Link>
                        </td>
                        <td className="px-6 py-3 font-medium text-surface-900">
                          <Link href={`/finance/quotes/${q.id}`} className="block">
                            {q.title ?? "Untitled quote"}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                          {formatCurrency(q.total_cents / 100, q.currency)}
                        </td>
                        <td className="px-6 py-3 text-surface-500">
                          {q.sent_at ? formatDate(q.sent_at) : "—"}
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={quoteBadgeStatus(q.status)} />
                        </td>
                        <td className="px-6 py-3 text-surface-500">
                          {expiry ? formatDate(expiry) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
