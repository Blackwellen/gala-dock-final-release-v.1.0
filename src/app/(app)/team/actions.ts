"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const BLOCK_TYPES = [
  "holiday",
  "sick",
  "training",
  "personal",
  "external-event",
  "other",
] as const;
type BlockType = (typeof BLOCK_TYPES)[number];

function coerceBlockType(raw: FormDataEntryValue | null): BlockType {
  const v = String(raw ?? "holiday");
  return (BLOCK_TYPES as readonly string[]).includes(v) ? (v as BlockType) : "other";
}

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** Convert a date-only input (yyyy-mm-dd) to an ISO timestamp at start/end of day. */
function dateToIso(value: FormDataEntryValue | null, endOfDay = false): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Add an availability / out-of-office block for a team member.
 * The acting user can only create blocks for themselves unless they pass a
 * user_id that belongs to the same workspace (validated below).
 */
export async function addAvailabilityBlock(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const requestedUserId = str(formData.get("user_id"));
  let userId = user.id;

  if (requestedUserId && requestedUserId !== user.id) {
    // Only allow assigning to a confirmed member of this workspace.
    const { data: member } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", requestedUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (member) userId = requestedUserId;
  }

  const startAt = dateToIso(formData.get("start_date"));
  const endAt = dateToIso(formData.get("end_date"), true);
  if (!startAt || !endAt) throw new Error("Start and end dates are required");
  if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
    throw new Error("End date must be on or after the start date");
  }

  const { error } = await supabase.from("team_availability_blocks").insert({
    workspace_id: workspaceId,
    user_id: userId,
    start_at: startAt,
    end_at: endAt,
    block_type: coerceBlockType(formData.get("block_type")),
    reason: str(formData.get("reason")),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/team");
}

/** Remove an availability block (scoped to the workspace). */
export async function removeAvailabilityBlock(blockId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("team_availability_blocks")
    .delete()
    .eq("id", blockId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/team");
}
