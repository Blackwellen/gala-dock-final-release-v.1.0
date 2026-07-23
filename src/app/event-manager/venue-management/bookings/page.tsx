import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { requireVenueAccount } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingStatusBadge } from "../BookingStatusBadge";
import { formatDateTime, formatGBP } from "../lib";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { key: "all", label: "All", statuses: null },
  { key: "enquiries", label: "Enquiries", statuses: ["enquiry", "held"] },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
] as const;

export default async function VenueBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const { workspaceId } = await requireVenueAccount();
  const supabase = await createClient();

  const [{ data: bookings }, { data: venues }] = await Promise.all([
    supabase
      .from("venue_bookings")
      .select("id, venue_id, client_name, status, start_at, end_at, headcount, total_cents")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true }),
    supabase.from("venues").select("id, name").eq("workspace_id", workspaceId).is("deleted_at", null),
  ]);

  const venueNameById = new Map((venues ?? []).map((v) => [v.id, v.name]));
  const bookingList = bookings ?? [];

  const active = STATUS_FILTERS.find((f) => f.key === statusParam) ?? STATUS_FILTERS[0];
  const filtered = active.statuses
    ? bookingList.filter((b) => (active.statuses as readonly string[]).includes(b.status))
    : bookingList;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Bookings"
        description="Every enquiry and confirmed booking across your venues, in one pipeline."
        tabs={
          <nav className="flex gap-1 overflow-x-auto">
            {STATUS_FILTERS.map((f) => {
              const count = f.statuses
                ? bookingList.filter((b) => (f.statuses as readonly string[]).includes(b.status)).length
                : bookingList.length;
              const isActive = f.key === active.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/event-manager/venue-management/bookings" : `/event-manager/venue-management/bookings?status=${f.key}`}
                  className={
                    "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px " +
                    (isActive
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-surface-500 hover:text-surface-700")
                  }
                >
                  {f.label} <span className="text-xs text-surface-400">({count})</span>
                </Link>
              );
            })}
          </nav>
        }
      />

      <div className="flex-1 px-6 py-6">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={CalendarCheck2}
              title="No bookings here yet"
              description="Enquiries and confirmed bookings for your venues will appear here as they come in."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-xs font-semibold uppercase tracking-wider text-surface-400">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Headcount</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/event-manager/venue-management/bookings/${b.id}`}
                        className="font-medium text-surface-900 hover:text-brand-600"
                      >
                        {b.client_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-surface-600">
                      {venueNameById.get(b.venue_id) ?? "Unknown venue"}
                    </td>
                    <td className="px-4 py-3 text-surface-600">{formatDateTime(b.start_at)}</td>
                    <td className="px-4 py-3 text-surface-600 tabular-nums">{b.headcount ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-surface-900 tabular-nums">
                      {formatGBP(b.total_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
