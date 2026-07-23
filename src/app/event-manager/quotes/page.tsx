import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { requireSupplierAccount } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Marketplace quote requests a buyer sent this supplier, and the supplier's latest
// quote against each. Distinct from the internal CRM `quotes` table (organizer-side).
// See supabase/migrations/20260717_marketplace_workflow.sql.

const REQUEST_STATUS_META: Record<string, { label: string; classes: string }> = {
  pending: { label: "Awaiting your quote", classes: "bg-warning-50 text-warning-600 border-warning-200" },
  quoted: { label: "Quoted", classes: "bg-info-50 text-info-600 border-info-200" },
  accepted: { label: "Won", classes: "bg-success-50 text-success-700 border-success-200" },
  declined: { label: "Declined", classes: "bg-danger-50 text-danger-600 border-danger-200" },
  expired: { label: "Expired", classes: "bg-surface-100 text-surface-600 border-surface-200" },
};

function formatGBP(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SupplierQuotesPage() {
  const { workspaceId } = await requireSupplierAccount();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("marketplace_quote_requests")
    .select(
      "id, listing_id, buyer_workspace_id, event_date, requirements, status, created_at, marketplace_quotes(id, total_cents, status, created_at)"
    )
    .eq("supplier_workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const buyerIds = Array.from(new Set((requests ?? []).map((r) => r.buyer_workspace_id)));
  const { data: buyers } = buyerIds.length
    ? await supabase.from("workspaces").select("id, name").in("id", buyerIds)
    : { data: [] as { id: string; name: string }[] };
  const buyerNameById = new Map((buyers ?? []).map((b) => [b.id, b.name]));

  const rows = (requests ?? []).map((r) => {
    const quotes = (r.marketplace_quotes ?? []) as Array<{
      id: string;
      total_cents: number;
      status: string;
      created_at: string;
    }>;
    const latestQuote = quotes.length
      ? quotes.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
      : null;
    return {
      id: r.id,
      buyerName: buyerNameById.get(r.buyer_workspace_id) ?? "Unknown organizer",
      eventDate: r.event_date,
      requirements: r.requirements,
      status: r.status,
      quoteTotalLabel: latestQuote ? formatGBP(latestQuote.total_cents) : null,
    };
  });

  const won = rows.filter((r) => r.status === "accepted").length;
  const outstanding = rows.filter((r) => r.status === "pending" || r.status === "quoted").length;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Quotes"
        description="Quote requests from organizers and the status of your submitted quotes."
      />

      <div className="flex-1 px-6 py-6 space-y-4">
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={FileSpreadsheet}
              title="No quote requests yet"
              description="When an organizer requests a quote from one of your marketplace listings, it will appear here for you to respond to and track through to win or loss."
            />
          </div>
        ) : (
          <>
            <div className="flex gap-4 text-sm text-surface-600">
              <span>
                <span className="font-semibold text-surface-900">{outstanding}</span> outstanding
              </span>
              <span>
                <span className="font-semibold text-surface-900">{won}</span> won
              </span>
              <span>
                <span className="font-semibold text-surface-900">{rows.length}</span> total
              </span>
            </div>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-xs font-semibold uppercase tracking-wider text-surface-400">
                    <th className="px-4 py-3">Organizer</th>
                    <th className="px-4 py-3">Event date</th>
                    <th className="px-4 py-3">Requirements</th>
                    <th className="px-4 py-3">Your quote</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = REQUEST_STATUS_META[r.status] ?? REQUEST_STATUS_META.pending;
                    return (
                      <tr key={r.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50">
                        <td className="px-4 py-3 font-medium text-surface-900">{r.buyerName}</td>
                        <td className="px-4 py-3 text-surface-600">{formatDate(r.eventDate)}</td>
                        <td className="px-4 py-3 text-surface-600 max-w-xs truncate">{r.requirements ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-surface-900 tabular-nums">
                          {r.quoteTotalLabel ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                              meta.classes
                            )}
                          >
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-surface-400">
          Quote requests come in against your{" "}
          <Link href="/event-manager/marketplace/listings" className="text-brand-600 hover:underline">
            marketplace listings
          </Link>
          . For direct enquiries from organizers you already work with, see{" "}
          <Link href="/event-manager/rfqs" className="text-brand-600 hover:underline">
            RFQs
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
