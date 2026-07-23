import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatGBP } from "../../lib";
import { AddRoomBlockForm } from "./AddRoomBlockForm";
import { BedDouble } from "lucide-react";

export const dynamic = "force-dynamic";

function roomBlockBadge(status: string): string {
  if (status === "confirmed") return "confirmed";
  if (status === "released" || status === "cancelled") return "closed";
  return "pending";
}

export default async function VenueRoomsTabPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: blocks } = await supabase
    .from("venue_room_blocks")
    .select("id, room_type, num_rooms, nightly_rate_cents, start_date, end_date, release_date, status, booking_code, notes")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const rows = blocks ?? [];
  const totalRooms = rows.reduce((sum, r) => sum + (r.num_rooms ?? 0), 0);

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-6">
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Total Room Blocks</p>
              <p className="text-2xl font-bold text-surface-900">{rows.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Total Rooms Held</p>
              <p className="text-2xl font-bold text-surface-900">{totalRooms}</p>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={BedDouble} title="No room blocks yet" description="Accommodation room blocks held against this venue will appear here." compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Room Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Rooms</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Release Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Nightly Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-surface-800">{r.room_type ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-700 tabular-nums">{r.num_rooms}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">
                      {r.start_date ? `${formatDate(r.start_date)} – ${r.end_date ? formatDate(r.end_date) : "—"}` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{r.release_date ? formatDate(r.release_date) : "—"}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={roomBlockBadge(r.status) as never} /></td>
                    <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell">{formatGBP(r.nightly_rate_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Create Room Block">
          <AddRoomBlockForm venueId={venueId} />
        </InsightCard>
      </div>
    </div>
  );
}
