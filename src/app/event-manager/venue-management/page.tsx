import Link from "next/link";
import { Building2, CalendarRange, TrendingUp, Layers } from "lucide-react";
import { requireVenueAccount } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatGBP, isUpcoming } from "./lib";
import { VenueManagementDashboard, type DashboardBooking, type DashboardVenue } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function VenueManagementPage() {
  const { workspaceId } = await requireVenueAccount();
  const supabase = await createClient();

  const [{ data: venues }, { data: spaces }, { data: bookings }] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name, city, region, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("venue_spaces")
      .select("id, venue_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("venue_bookings")
      .select(
        "id, venue_id, space_id, client_name, status, start_at, end_at, headcount, total_cents"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true }),
  ]);

  const venueList = venues ?? [];
  const spaceList = spaces ?? [];
  const bookingList = bookings ?? [];

  // Per-venue space counts
  const spaceCountByVenue = new Map<string, number>();
  for (const s of spaceList) {
    spaceCountByVenue.set(s.venue_id, (spaceCountByVenue.get(s.venue_id) ?? 0) + 1);
  }

  const venueNameById = new Map(venueList.map((v) => [v.id, v.name]));

  const dashboardVenues: DashboardVenue[] = venueList.map((v) => {
    const venueBookings = bookingList.filter((b) => b.venue_id === v.id);
    const upcoming = venueBookings.filter((b) => isUpcoming(b.status, b.start_at)).length;
    const revenue = venueBookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((sum, b) => sum + (b.total_cents ?? 0), 0);
    return {
      id: v.id,
      name: v.name,
      location: [v.city, v.region].filter(Boolean).join(", ") || "—",
      status: v.status,
      spaceCount: spaceCountByVenue.get(v.id) ?? 0,
      upcomingCount: upcoming,
      revenueLabel: formatGBP(revenue),
    };
  });

  const dashboardBookings: DashboardBooking[] = bookingList.map((b) => ({
    id: b.id,
    venueName: venueNameById.get(b.venue_id) ?? "Unknown venue",
    clientName: b.client_name,
    status: b.status,
    startAt: b.start_at,
    headcount: b.headcount,
    totalLabel: formatGBP(b.total_cents),
  }));

  // KPIs across all venues
  const upcomingTotal = bookingList.filter((b) => isUpcoming(b.status, b.start_at)).length;
  const confirmedRevenue = bookingList
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + (b.total_cents ?? 0), 0);
  const occupancyDenom = bookingList.length;
  const occupancyNum = bookingList.filter(
    (b) => b.status === "confirmed" || b.status === "completed"
  ).length;
  const occupancyRate =
    occupancyDenom > 0 ? Math.round((occupancyNum / occupancyDenom) * 100) : 0;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Venue Management"
        description="Multi-venue overview — spaces, bookings pipeline and revenue across every venue."
      />

      <div className="flex-1 px-6 py-6 space-y-6">
        <KPIGrid>
          <MetricCard label="Venues" value={venueList.length} icon={Building2} />
          <MetricCard label="Spaces" value={spaceList.length} icon={Layers} />
          <MetricCard
            label="Upcoming Bookings"
            value={upcomingTotal}
            icon={CalendarRange}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="Confirmed Revenue"
            value={formatGBP(confirmedRevenue)}
            icon={TrendingUp}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Occupancy"
            value={`${occupancyRate}%`}
            icon={TrendingUp}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
        </KPIGrid>

        {venueList.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Building2}
              title="No venues yet"
              description="Add a venue from the Venues section to start managing spaces, bookings and F&B packages here."
              action={
                <Link
                  href="/event-manager/venues/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Add a venue
                </Link>
              }
            />
          </div>
        ) : (
          <VenueManagementDashboard venues={dashboardVenues} bookings={dashboardBookings} />
        )}
      </div>
    </div>
  );
}
