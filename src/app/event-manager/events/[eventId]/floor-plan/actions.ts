"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { parseCanvasJson, presetElements, type PresetId } from "./lib";

const CANVAS_W = 900;
const CANVAS_H = 600;

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

async function assertEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  eventId: string,
) {
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Event not found");
}

/** Create a new floor plan layout for an event, optionally from a preset. */
export async function createFloorPlan(eventId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await assertEvent(supabase, workspaceId, eventId);

  const name = str(formData.get("name")) ?? "Floor Plan";
  const preset = (str(formData.get("preset")) ?? "blank") as PresetId;

  // First plan for the event becomes primary by default.
  const { count } = await supabase
    .from("event_floor_plans")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId);

  const isPrimary = (count ?? 0) === 0;
  const elements = preset === "blank" ? [] : presetElements(preset);

  const { error } = await supabase.from("event_floor_plans").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    created_by: user.id,
    name,
    canvas_width: CANVAS_W,
    canvas_height: CANVAS_H,
    canvas_json: elements as unknown as Json,
    is_primary: isPrimary,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}

/** Persist the canvas element array (explicit/debounced Save from the editor). */
export async function saveFloorPlan(
  eventId: string,
  planId: string,
  elements: unknown,
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Re-validate the JSON shape server-side before writing.
  const clean = parseCanvasJson(elements);

  const { error } = await supabase
    .from("event_floor_plans")
    .update({
      canvas_json: clean as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}

/** Rename a layout. */
export async function renameFloorPlan(eventId: string, planId: string, name: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  const { error } = await supabase
    .from("event_floor_plans")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}

/** Mark one layout as primary, clearing the flag on all others for the event. */
export async function setPrimaryFloorPlan(eventId: string, planId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Clear existing primary flags for this event.
  await supabase
    .from("event_floor_plans")
    .update({ is_primary: false })
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  const { error } = await supabase
    .from("event_floor_plans")
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}

/** Duplicate a layout (copies the full canvas_json into a new, non-primary row). */
export async function duplicateFloorPlan(eventId: string, planId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("event_floor_plans")
    .select("name, canvas_json, canvas_width, canvas_height")
    .eq("id", planId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!source) throw new Error("Layout not found");

  const { error } = await supabase.from("event_floor_plans").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    created_by: user.id,
    name: `${source.name} (Copy)`,
    canvas_width: source.canvas_width,
    canvas_height: source.canvas_height,
    canvas_json: source.canvas_json,
    is_primary: false,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}

/** Delete a layout. */
export async function deleteFloorPlan(eventId: string, planId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_floor_plans")
    .delete()
    .eq("id", planId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/floor-plan`);
}
