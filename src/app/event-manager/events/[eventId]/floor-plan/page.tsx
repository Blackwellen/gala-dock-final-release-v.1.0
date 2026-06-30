import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { EventFloorPlan, EventGuest } from "@/lib/supabase/types";
import { parseCanvasJson, type FloorPlanElement } from "./lib";
import { FloorPlanClient, type PlanData, type GuestOption } from "./FloorPlanClient";

export const dynamic = "force-dynamic";

export default async function FloorPlanPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, start_at")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  const [{ data: plans }, { data: guests }] = await Promise.all([
    supabase
      .from("event_floor_plans")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("event_guests")
      .select("id, first_name, last_name, rsvp_status, dietary_notes")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
  ]);

  const typedPlans = (plans ?? []) as EventFloorPlan[];

  const planData: PlanData[] = typedPlans.map((p) => ({
    id: p.id,
    name: p.name,
    isPrimary: p.is_primary,
    width: p.canvas_width,
    height: p.canvas_height,
    elements: parseCanvasJson(p.canvas_json) as FloorPlanElement[],
  }));

  const guestOptions: GuestOption[] = (
    (guests ?? []) as Pick<
      EventGuest,
      "id" | "first_name" | "last_name" | "rsvp_status" | "dietary_notes"
    >[]
  ).map((g) => ({
    id: g.id,
    name: `${g.first_name} ${g.last_name}`.trim(),
    rsvpStatus: g.rsvp_status,
    hasDietary: Boolean(g.dietary_notes && g.dietary_notes.trim() !== ""),
  }));

  return (
    <FloorPlanClient
      eventId={event.id}
      eventName={event.name}
      eventDate={event.start_at}
      plans={planData}
      guests={guestOptions}
    />
  );
}
