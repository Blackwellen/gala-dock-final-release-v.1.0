import { notFound } from "next/navigation";
import { requireVenueAccount } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { BookingDetailClient } from "./BookingDetailClient";
import type {
  BookingDetail,
  FbSelectionRow,
  PackageOption,
  StaffMemberRow,
} from "./BookingDetailClient";
import { formatGBP } from "../../lib";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const { workspaceId } = await requireVenueAccount();
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("venue_bookings")
    .select(
      "id, venue_id, space_id, client_name, client_email, status, start_at, end_at, headcount, total_cents, notes"
    )
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!booking) notFound();

  const [
    { data: venue },
    { data: selections },
    { data: packages },
    { data: staff },
  ] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name")
      .eq("id", booking.venue_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_booking_fb_selections")
      .select("id, package_id, quantity")
      .eq("booking_id", bookingId)
      .eq("workspace_id", workspaceId),
    supabase
      .from("venue_fb_packages")
      .select("id, name, per_head_cents, min_headcount")
      .eq("venue_id", booking.venue_id)
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true }),
    supabase
      .from("venue_staff_assignments")
      .select("id, staff_name, role, shift_start, shift_end, notes")
      .eq("booking_id", bookingId)
      .eq("workspace_id", workspaceId)
      .order("shift_start", { ascending: true }),
  ]);

  // Space is optional — fetch it only when the booking has one.
  let space: { id: string; name: string; hire_fee_cents: number | null } | null = null;
  if (booking.space_id) {
    const { data } = await supabase
      .from("venue_spaces")
      .select("id, name, hire_fee_cents")
      .eq("id", booking.space_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    space = data;
  }

  const packageById = new Map(
    (packages ?? []).map((p) => [p.id, p])
  );

  const headcount = booking.headcount ?? 0;

  // Catering total: per_head_cents * quantity (quantity is the number of covers
  // for this selection; when 1 it falls back to the booking headcount).
  let cateringTotalCents = 0;
  const selectionRows: FbSelectionRow[] = (selections ?? []).map((sel) => {
    const pkg = packageById.get(sel.package_id);
    const perHead = pkg?.per_head_cents ?? 0;
    const covers = sel.quantity && sel.quantity > 1 ? sel.quantity : headcount || sel.quantity || 0;
    const lineTotal = perHead * covers;
    cateringTotalCents += lineTotal;
    return {
      id: sel.id,
      packageId: sel.package_id,
      packageName: pkg?.name ?? "Unknown package",
      perHeadLabel: formatGBP(perHead),
      quantity: sel.quantity,
      covers,
      lineTotalLabel: formatGBP(lineTotal),
    };
  });

  const hireFeeCents = space?.hire_fee_cents ?? 0;
  const grandTotalCents = (booking.total_cents ?? 0) + cateringTotalCents;

  const detail: BookingDetail = {
    id: booking.id,
    venueId: booking.venue_id,
    venueName: venue?.name ?? "Unknown venue",
    spaceId: booking.space_id,
    spaceName: space?.name ?? null,
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    status: booking.status,
    startAt: booking.start_at,
    endAt: booking.end_at,
    headcount: booking.headcount,
    bookingValueCents: booking.total_cents ?? 0,
    bookingValueLabel: formatGBP(booking.total_cents),
    hireFeeLabel: formatGBP(hireFeeCents),
    cateringTotalLabel: formatGBP(cateringTotalCents),
    grandTotalLabel: formatGBP(grandTotalCents),
    notes: booking.notes,
  };

  const packageOptions: PackageOption[] = (packages ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    perHeadLabel: formatGBP(p.per_head_cents),
    minHeadcount: p.min_headcount,
  }));

  const staffRows: StaffMemberRow[] = (staff ?? []).map((s) => ({
    id: s.id,
    staffName: s.staff_name,
    role: s.role,
    shiftStart: s.shift_start,
    shiftEnd: s.shift_end,
    notes: s.notes,
  }));

  return (
    <BookingDetailClient
      booking={detail}
      selections={selectionRows}
      packageOptions={packageOptions}
      staff={staffRows}
    />
  );
}
