import { notFound } from "next/navigation";
import { EventDayBoard, type EventDayItem } from "@/components/events/EventDayBoard";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatEventDate, formatTimeOfDay, venueLabel } from "../../_lib";

export const dynamic = "force-dynamic";

export default async function EventDayPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, start_at, location, venue_name_snapshot")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  const { data: runSheet } = await supabase
    .from("event_run_sheet_items")
    .select("id, title, lane, starts_at, position")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  const items: EventDayItem[] = (runSheet ?? []).map((r) => ({
    id: r.id,
    time: formatTimeOfDay(r.starts_at, "TBC"),
    title: r.title,
    lane: r.lane ?? "other",
  }));

  const venue = venueLabel(event);
  const dateLabel = [formatEventDate(event.start_at), venue].filter(Boolean).join(" · ");

  return (
    <EventDayBoard
      eventId={event.id}
      eventName={event.name}
      dateLabel={dateLabel}
      items={items}
    />
  );
}
