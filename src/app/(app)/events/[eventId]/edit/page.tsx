import { notFound } from "next/navigation";
import { EditEventForm, type EditEventInitial } from "@/components/events/EditEventForm";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { toUiStatus } from "../../_lib";

export const dynamic = "force-dynamic";

/** Convert an ISO timestamp into a yyyy-mm-dd value for a date input. */
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  const initial: EditEventInitial = {
    id: event.id,
    name: event.name,
    eventType: event.event_type ?? "",
    status: toUiStatus(event.status),
    description: event.description ?? "",
    startDate: isoToDateInput(event.start_at),
    endDate: isoToDateInput(event.end_at),
    venueName: event.venue_name_snapshot ?? "",
    location: event.location ?? "",
    clientName: event.client_name ?? "",
    clientEmail: event.client_email ?? "",
    clientPhone: event.client_phone ?? "",
    clientCompany: event.client_company ?? "",
    budget: event.budget_cents ? String(event.budget_cents / 100) : "",
    dayGuests: String(event.guest_count_day ?? 0),
    eveningGuests: String(event.guest_count_evening ?? 0),
  };

  return <EditEventForm initial={initial} />;
}
