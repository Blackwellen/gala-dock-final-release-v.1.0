import { notFound } from "next/navigation";
import { requireVenueAccount } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VenueWorkspaceClient } from "./VenueWorkspaceClient";
import type {
  SpaceRow,
  BookingRow,
  FbPackageRow,
  StaffRow,
} from "./VenueWorkspaceClient";
import { formatGBP } from "../lib";

export const dynamic = "force-dynamic";

export default async function VenueManagePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireVenueAccount();
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name, city, region, status")
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venue) notFound();

  const [
    { data: spaces },
    { data: bookings },
    { data: packages },
    { data: staff },
  ] = await Promise.all([
    supabase
      .from("venue_spaces")
      .select(
        "id, name, description, capacity_seated, capacity_standing, area_sqm, hire_fee_cents, sort_order"
      )
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("venue_bookings")
      .select(
        "id, space_id, client_name, client_email, status, start_at, end_at, headcount, total_cents"
      )
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true }),
    supabase
      .from("venue_fb_packages")
      .select("id, name, description, per_head_cents, min_headcount, sort_order")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("venue_staff_assignments")
      .select("id, booking_id, staff_name, role, shift_start, shift_end, notes")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("shift_start", { ascending: true }),
  ]);

  const spaceNameById = new Map((spaces ?? []).map((s) => [s.id, s.name]));

  const spaceRows: SpaceRow[] = (spaces ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    capacitySeated: s.capacity_seated,
    capacityStanding: s.capacity_standing,
    areaSqm: s.area_sqm,
    hireFeeCents: s.hire_fee_cents,
    hireFeeLabel: formatGBP(s.hire_fee_cents),
    sortOrder: s.sort_order,
  }));

  const bookingRows: BookingRow[] = (bookings ?? []).map((b) => ({
    id: b.id,
    spaceId: b.space_id,
    spaceName: b.space_id ? spaceNameById.get(b.space_id) ?? "—" : "—",
    clientName: b.client_name,
    clientEmail: b.client_email,
    status: b.status,
    startAt: b.start_at,
    endAt: b.end_at,
    headcount: b.headcount,
    totalCents: b.total_cents,
    totalLabel: formatGBP(b.total_cents),
  }));

  const packageRows: FbPackageRow[] = (packages ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    perHeadCents: p.per_head_cents,
    perHeadLabel: formatGBP(p.per_head_cents),
    minHeadcount: p.min_headcount,
    sortOrder: p.sort_order,
  }));

  const staffRows: StaffRow[] = (staff ?? []).map((s) => ({
    id: s.id,
    bookingId: s.booking_id,
    bookingClient: s.booking_id
      ? bookingRows.find((b) => b.id === s.booking_id)?.clientName ?? null
      : null,
    staffName: s.staff_name,
    role: s.role,
    shiftStart: s.shift_start,
    shiftEnd: s.shift_end,
    notes: s.notes,
  }));

  return (
    <VenueWorkspaceClient
      venueId={venue.id}
      venueName={venue.name}
      venueLocation={[venue.city, venue.region].filter(Boolean).join(", ") || "—"}
      venueStatus={venue.status}
      spaces={spaceRows}
      bookings={bookingRows}
      packages={packageRows}
      staff={staffRows}
    />
  );
}
