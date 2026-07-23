import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatGBP } from "../../lib";
import { AddTransactionForm } from "./AddTransactionForm";
import { Banknote } from "lucide-react";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <h3 className="text-sm font-semibold text-surface-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="text-surface-800 font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

function transactionBadge(status: string): string {
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  return "open";
}

export default async function VenueCommercialsPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: terms }, { data: transactions }] = await Promise.all([
    supabase
      .from("venue_commercial_terms")
      .select("*")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_commercial_transactions")
      .select("id, transaction_type, amount_cents, due_date, paid_status, notes, created_at")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("due_date", { ascending: false, nullsFirst: false }),
  ]);

  const txRows = transactions ?? [];
  const outstanding = txRows.filter((t) => t.paid_status !== "paid");
  const outstandingTotal = outstanding.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0);

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Deposits Outstanding</p>
            <p className="text-2xl font-bold text-surface-900">{formatGBP(outstandingTotal)}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Open Items</p>
            <p className="text-2xl font-bold text-surface-900">{outstanding.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Contract Status</p>
            <p className="text-lg font-bold text-surface-900 capitalize">{terms?.contract_status?.replace(/_/g, " ") ?? "Not contracted"}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Next Review</p>
            <p className="text-lg font-bold text-surface-900">{terms?.next_review_date ? formatDate(terms.next_review_date) : "—"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Hire Rates">
            <Row label="Hire Rate (From)" value={formatGBP(terms?.hire_rate_from_cents)} />
            <Row label="Day Rate" value={formatGBP(terms?.day_rate_cents)} />
            <Row label="Half Day Rate" value={formatGBP(terms?.half_day_rate_cents)} />
            <Row label="Minimum Hire" value={terms?.min_hire_hours ? `${terms.min_hire_hours} hours` : "—"} />
          </Card>
          <Card title="Minimum Spend">
            <Row label="Weekday" value={formatGBP(terms?.min_spend_weekday_cents)} />
            <Row label="Weekend" value={formatGBP(terms?.min_spend_weekend_cents)} />
            <Row label="F&B Minimum" value={formatGBP(terms?.fb_minimum_cents)} />
          </Card>
          <Card title="Deposit Rules">
            <Row label="Standard Deposit" value={terms?.standard_deposit_pct != null ? `${terms.standard_deposit_pct}%` : "—"} />
            <Row label="Security Deposit" value={formatGBP(terms?.security_deposit_cents)} />
            <Row label="Refundable" value={terms?.deposit_refundable ? "Yes" : "No"} />
          </Card>
          <Card title="Payment Terms">
            <Row label="Payment Terms" value={terms?.payment_terms_days ? `${terms.payment_terms_days} days` : "—"} />
            <Row label="Final Balance" value={terms?.final_balance_days ? `${terms.final_balance_days} days prior` : "—"} />
            <Row label="Currency" value={terms?.currency ?? "GBP"} />
          </Card>
          <Card title="Bar Deposit / F&B Minimum">
            <Row label="Bar Deposit" value={formatGBP(terms?.bar_deposit_cents)} />
            <Row label="Service Charge" value={terms?.service_charge_pct != null ? `${terms.service_charge_pct}%` : "—"} />
            <Row label="Corkage" value={terms?.corkage_policy} />
          </Card>
          <Card title="Contract Status">
            <Row label="Status" value={<StatusBadge status={(terms?.contract_status === "contracted" ? "confirmed" : "pending") as never} />} />
            <Row label="Signed" value={terms?.contract_signed_date ? formatDate(terms.contract_signed_date) : "—"} />
            <Row label="Expiry" value={terms?.contract_expiry_date ? formatDate(terms.contract_expiry_date) : "—"} />
            <Row label="Auto Renewal" value={terms?.auto_renewal ? "Yes" : "No"} />
          </Card>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Deposits & Commercial Transactions</h3>
          {txRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState icon={Banknote} title="No commercial transactions recorded" description="Deposits, bar minimums and rate reviews will appear here." compact />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {txRows.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-surface-800 capitalize">{t.transaction_type.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3.5 text-surface-700 tabular-nums">{formatGBP(t.amount_cents)}</td>
                      <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{t.due_date ? formatDate(t.due_date) : "—"}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={transactionBadge(t.paid_status) as never} /></td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell truncate max-w-[200px]">{t.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <InsightCard title="Negotiation Notes">
          <p className="text-sm text-surface-600 whitespace-pre-line">{terms?.negotiation_notes || "No negotiation notes recorded."}</p>
        </InsightCard>
        <InsightCard title="Add Transaction">
          <AddTransactionForm venueId={venueId} />
        </InsightCard>
      </div>
    </div>
  );
}
