"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the event mood board.
 *
 * Schema notes (verified against database.types.ts — these differ from the plan):
 *  - `event_mood_boards`: (id, workspace_id, event_id, title, notes, created_by, ...)
 *    NO `colour_palette`, NO `share_token`, NO per-event UNIQUE enforced in types.
 *  - `mood_board_items`: (id, workspace_id, mood_board_id, storage_key, color_hex,
 *    caption, sort_order, created_at). NO item_type / text_content / width_units /
 *    created_by columns. Colour swatches are stored as a row with color_hex set and
 *    storage_key null; images store storage_key with color_hex null.
 */

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Ensure the event belongs to this workspace. Returns event id or null. */
async function assertEvent(eventId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return { ok: Boolean(event), workspaceId, user, supabase };
}

/** Create a new mood board for an event. */
export async function createBoard(eventId: string, formData: FormData) {
  const { ok, workspaceId, user, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const title = str(formData.get("title")) ?? "Mood Board";

  const { error } = await supabase.from("event_mood_boards").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    title: title.slice(0, 200),
    notes: str(formData.get("notes")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Update a board's title / notes. */
export async function updateBoard(eventId: string, boardId: string, formData: FormData) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const title = str(formData.get("title"));
  const { error } = await supabase
    .from("event_mood_boards")
    .update({
      title: (title ?? "Mood Board").slice(0, 200),
      notes: str(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", boardId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Delete a board (cascade removes its items). Best-effort storage cleanup. */
export async function deleteBoard(eventId: string, boardId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  // Clean up any uploaded images for this board first.
  const { data: items } = await supabase
    .from("mood_board_items")
    .select("storage_key")
    .eq("mood_board_id", boardId)
    .eq("workspace_id", workspaceId);
  const keys = (items ?? [])
    .map((i) => i.storage_key)
    .filter((k): k is string => Boolean(k));
  if (keys.length > 0) {
    await supabase.storage.from("event-files").remove(keys);
  }

  const { error } = await supabase
    .from("event_mood_boards")
    .delete()
    .eq("id", boardId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Upload one or more images to a board (upload-only, to the event-files bucket). */
export async function addImageItems(eventId: string, boardId: string, formData: FormData) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  // Confirm the board belongs to this workspace + event.
  const { data: board } = await supabase
    .from("event_mood_boards")
    .select("id")
    .eq("id", boardId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!board) throw new Error("Mood board not found");

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Please choose at least one image");

  const caption = str(formData.get("caption"));

  // Determine the current max sort_order so new items append to the end.
  const { data: maxRow } = await supabase
    .from("mood_board_items")
    .select("sort_order")
    .eq("mood_board_id", boardId)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (maxRow?.sort_order ?? -1) + 1;

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `mood-boards/${workspaceId}/${boardId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("event-files")
      .upload(storageKey, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { error: insertError } = await supabase.from("mood_board_items").insert({
      workspace_id: workspaceId,
      mood_board_id: boardId,
      storage_key: storageKey,
      caption: caption,
      sort_order: nextOrder,
    });
    if (insertError) {
      await supabase.storage.from("event-files").remove([storageKey]);
      throw new Error(insertError.message);
    }
    nextOrder += 1;
  }

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Add a colour-swatch item to a board. */
export async function addColourItem(eventId: string, boardId: string, formData: FormData) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { data: board } = await supabase
    .from("event_mood_boards")
    .select("id")
    .eq("id", boardId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!board) throw new Error("Mood board not found");

  const hex = (str(formData.get("color_hex")) ?? "").toLowerCase();
  if (!HEX_RE.test(hex)) throw new Error("Enter a valid hex colour, e.g. #4F46E5");

  const { data: maxRow } = await supabase
    .from("mood_board_items")
    .select("sort_order")
    .eq("mood_board_id", boardId)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("mood_board_items").insert({
    workspace_id: workspaceId,
    mood_board_id: boardId,
    color_hex: hex,
    caption: str(formData.get("caption")),
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Update an item's caption. */
export async function updateItemCaption(
  eventId: string,
  itemId: string,
  caption: string | null
) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const trimmed = (caption ?? "").trim();
  const { error } = await supabase
    .from("mood_board_items")
    .update({ caption: trimmed === "" ? null : trimmed })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Delete a single item (and its storage object if it is an image). */
export async function deleteItem(eventId: string, itemId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { data: item } = await supabase
    .from("mood_board_items")
    .select("id, storage_key")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!item) throw new Error("Item not found");

  if (item.storage_key) {
    await supabase.storage.from("event-files").remove([item.storage_key]);
  }

  const { error } = await supabase
    .from("mood_board_items")
    .delete()
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/mood-board`);
}

/** Persist a new ordering after a drag-and-drop reorder. */
export async function reorderItems(eventId: string, orderedIds: string[]) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("mood_board_items")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/events/${eventId}/mood-board`);
}
