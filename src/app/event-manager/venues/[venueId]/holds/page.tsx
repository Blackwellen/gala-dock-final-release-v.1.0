import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatGBP } from "../../lib";
import { AddHoldForm } from "./AddHoldForm";
import { CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

function holdBadge(status: string): string {
  if (status === "confirmed") return "confirmed";
  if (status === "expired" || status === "declined") return "cancelled";
  if (status === "released") return "closed";
  return "pending";
}

export default async function VenueHoldsTabPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: holds } = await supabase
    .from("venue_holds")
    .select("id, hold_type, status, start_at, end_at, expiry_date, fee_cents, deposit_cents, notes")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const rows = holds ?? [];

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-6">
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={CalendarClock} title="No holds yet" description="Provisional and confirmed dates held against this venue will appear here." compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Hold Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Expiry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((h) => (
                  <tr key={h.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-surface-800 capitalize">{h.hold_type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={holdBadge(h.status) as never} /></td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">
                      {h.start_at ? `${formatDate(h.start_at)}${h.end_at ? ` – ${formatDate(h.end_at)}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{h.expiry_date ? formatDate(h.expiry_date) : "—"}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell">{formatGBP(h.deposit_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Create Hold">
          <AddHoldForm venueId={venueId} />
        </InsightCard>
      </div>
    </div>
  );
}
