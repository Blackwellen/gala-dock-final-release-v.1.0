import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarCheck, MapPin, Users2 } from "lucide-react";
import {
  BOOKING_STATUS_META,
  coerceBookingStatus,
  formatDate,
  formatDateTime,
  formatGBP,
} from "../../event-manager/venue-management/lib";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PortalBooking {
  clientName: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  headcount: number | null;
  totalLabel: string;
  spaceName: string | null;
  venueName: string;
  venueLocation: string;
}

/**
 * Resolve a venue-portal token defensively.
 *
 * There is no dedicated venue-portal token table in the schema, so the token is
 * treated as the booking id. We validate it is a UUID, then read ONLY the single
 * booking it points to (plus its space + venue name) via the service-role client.
 * No lists, no cross-workspace data — a token resolves to exactly one booking or
 * to a clean invalid state. Soft-deleted and cancelled bookings do not resolve.
 */
async function resolveBooking(token: string): Promise<PortalBooking | null> {
  if (!token || !UUID_RE.test(token)) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data: booking } = await admin
    .from("venue_bookings")
    .select(
      "id, venue_id, space_id, client_name, status, start_at, end_at, headcount, total_cents, deleted_at"
    )
    .eq("id", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!booking || booking.status === "cancelled") return null;

  const { data: venue } = await admin
    .from("venues")
    .select("name, city, region")
    .eq("id", booking.venue_id)
    .maybeSingle();

  let spaceName: string | null = null;
  if (booking.space_id) {
    const { data: space } = await admin
      .from("venue_spaces")
      .select("name")
      .eq("id", booking.space_id)
      .maybeSingle();
    spaceName = space?.name ?? null;
  }

  return {
    clientName: booking.client_name,
    status: booking.status,
    startAt: booking.start_at,
    endAt: booking.end_at,
    headcount: booking.headcount,
    totalLabel: formatGBP(booking.total_cents),
    spaceName,
    venueName: venue?.name ?? "Your venue",
    venueLocation: venue ? [venue.city, venue.region].filter(Boolean).join(", ") : "",
  };
}

export default async function VenuePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const booking = await resolveBooking(token);

  if (!booking) {
    return (
      <main className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-surface-200 shadow-card p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <CalendarCheck className="w-6 h-6 text-surface-400" />
          </div>
          <h1 className="text-lg font-semibold text-surface-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-surface-500">
            This booking link is invalid or has expired. Please contact the venue for an
            up-to-date confirmation.
          </p>
        </div>
      </main>
    );
  }

  const meta = BOOKING_STATUS_META[coerceBookingStatus(booking.status)];

  return (
    <main className="min-h-screen bg-surface-50 py-10 px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Booking Confirmation
          </p>
          <h1 className="mt-2 text-2xl font-bold text-surface-900">{booking.venueName}</h1>
          {booking.venueLocation && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-surface-500">
              <MapPin className="w-4 h-4" /> {booking.venueLocation}
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-surface-400">Booked for</p>
              <p className="text-base font-semibold text-surface-900">{booking.clientName}</p>
            </div>
            <span
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border " +
                meta.classes
              }
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {meta.label}
            </span>
          </div>

          <dl className="divide-y divide-surface-100">
            <PortalRow label="Space" value={booking.spaceName ?? "—"} />
            <PortalRow label="Event date" value={formatDate(booking.startAt)} />
            <PortalRow label="Starts" value={formatDateTime(booking.startAt)} />
            <PortalRow label="Ends" value={formatDateTime(booking.endAt)} />
            <PortalRow
              label="Guests"
              value={booking.headcount != null ? String(booking.headcount) : "—"}
              icon={<Users2 className="w-4 h-4 text-surface-300" />}
            />
            <PortalRow label="Total" value={booking.totalLabel} emphasis />
          </dl>
        </div>

        <p className="text-center text-xs text-surface-400">
          This is a read-only confirmation. For changes, please contact the venue directly.
        </p>
      </div>
    </main>
  );
}

function PortalRow({
  label,
  value,
  emphasis,
  icon,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3.5 flex items-center justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-sm text-surface-500">
        {icon}
        {label}
      </dt>
      <dd
        className={
          "text-right " +
          (emphasis
            ? "text-base font-bold text-surface-900 tabular-nums"
            : "text-sm font-medium text-surface-800")
        }
      >
        {value}
      </dd>
    </div>
  );
}
