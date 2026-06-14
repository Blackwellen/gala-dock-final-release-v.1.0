import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Users, UserCheck, UserPlus, QrCode } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EventGuest } from "@/lib/supabase/types";
import { CheckInClient, type CheckInGuestRow } from "./CheckInClient";
import { generateTokens } from "./actions";

export const metadata: Metadata = { title: "Guest Check-In" };
export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: guestData } = await supabase
    .from("event_guests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const guests = (guestData ?? []) as EventGuest[];

  const totalGuests = guests.length;
  const expected = guests.filter((g) => g.rsvp_status === "confirmed").length;
  const arrived = guests.filter((g) => g.checked_in_at).length;
  const arrivalPct = expected > 0 ? Math.round((arrived / expected) * 100) : 0;

  const rows: CheckInGuestRow[] = guests.map((g) => ({
    id: g.id,
    name: `${g.first_name} ${g.last_name}`.trim() || "Unnamed guest",
    email: g.email,
    table_number: g.table_number,
    guest_type: g.guest_type,
    checked_in_at: g.checked_in_at,
    check_in_token: g.check_in_token,
  }));

  const generateAction = generateTokens.bind(null, eventId);

  return (
    <div className="min-h-full bg-surface-50 animate-fade-in">
      <PageHeader
        title="Guest Check-In"
        description={event.name}
        actions={
          <Link
            href={`/events/${eventId}`}
            className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            Back to event
          </Link>
        }
      />

      <div className="space-y-6 p-6">
        <KPIGrid className="lg:grid-cols-4 xl:grid-cols-4">
          <MetricCard label="Total Guests" value={totalGuests} icon={Users} />
          <MetricCard
            label="Expected"
            value={expected}
            icon={UserPlus}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="Checked In"
            value={arrived}
            icon={UserCheck}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Arrival Rate"
            value={`${arrivalPct}%`}
            icon={UserCheck}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
        </KPIGrid>

        {totalGuests === 0 ? (
          <div className="rounded-xl border border-surface-200 bg-white">
            <EmptyState
              icon={QrCode}
              title="No guests to check in"
              description="Add guests to this event first, then return here to manage arrivals and share check-in links."
              action={
                <Link
                  href={`/events/${eventId}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Go to event
                </Link>
              }
            />
          </div>
        ) : guests.every((g) => !g.check_in_token) ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-surface-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-surface-900">
                Shareable check-in links
              </h2>
              <p className="mt-1 max-w-prose text-sm text-surface-500">
                Generate a unique check-in link for each guest. Share the link (or print
                it for a name badge) — guests open it on their phone to self-check-in, or
                staff can check guests in manually below.
              </p>
              <form action={generateAction} className="mt-4">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <QrCode className="h-4 w-4" strokeWidth={1.8} />
                  Generate check-in links
                </button>
              </form>
            </div>
            <CheckInClient eventId={eventId} guests={rows} />
          </div>
        ) : (
          <CheckInClient eventId={eventId} guests={rows} />
        )}
      </div>
    </div>
  );
}
