"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { CommType, CommDirection } from "@/lib/supabase/types";

const VALID_TYPES: CommType[] = ["email", "call", "note", "sms", "whatsapp", "meeting"];
const VALID_DIRECTIONS: CommDirection[] = ["inbound", "outbound", "internal"];

/** Comm types that are future paid add-ons and cannot be logged in V1. */
const LOCKED_TYPES: CommType[] = ["sms", "whatsapp"];

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function coerceType(raw: FormDataEntryValue | null): CommType {
  const value = String(raw ?? "note");
  return (VALID_TYPES as string[]).includes(value) ? (value as CommType) : "note";
}

function coerceDirection(raw: FormDataEntryValue | null): CommDirection {
  const value = String(raw ?? "outbound");
  return (VALID_DIRECTIONS as string[]).includes(value) ? (value as CommDirection) : "outbound";
}

/**
 * Parse the uploaded attachment list. Attachments are upload-only file
 * references (name + size). We never accept arbitrary URL fields. The actual
 * upload to storage is a V1.5 enhancement — for now we record filename metadata
 * so the thread view can show a file pill.
 */
function parseAttachments(formData: FormData): { name: string; size: number }[] {
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  return files.map((f) => ({ name: f.name, size: f.size }));
}

/**
 * Log a communication. Inserts a single `communications` row. This is an in-app
 * activity LOG — it does not send a real email/SMS. SMS and WhatsApp are locked
 * future add-ons and are rejected here as a safety net.
 *
 * If `thread_id` is supplied the message joins that thread; otherwise a new
 * thread is started (a fresh uuid).
 */
export async function logCommunication(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const body = str(formData.get("body"));
  if (!body) throw new Error("Message body is required");

  const commType = coerceType(formData.get("comm_type"));
  if (LOCKED_TYPES.includes(commType)) {
    throw new Error("SMS and WhatsApp messaging is coming in a future release.");
  }

  const direction = coerceDirection(formData.get("direction"));
  // Internal notes are always direction=internal regardless of submitted value.
  const resolvedDirection: CommDirection = commType === "note" ? "internal" : direction;

  const threadId = str(formData.get("thread_id")) ?? randomUUID();
  const isNewThread = !str(formData.get("thread_id"));

  const { error } = await supabase.from("communications").insert({
    workspace_id: workspaceId,
    created_by: user.id,
    thread_id: threadId,
    body,
    comm_type: commType,
    direction: resolvedDirection,
    subject: str(formData.get("subject")),
    participant_name: str(formData.get("participant_name")),
    participant_email: str(formData.get("participant_email")),
    participant_phone: str(formData.get("participant_phone")),
    event_id: str(formData.get("event_id")),
    lead_id: str(formData.get("lead_id")),
    // New threads from the inbox are outbound/internal and authored by the
    // current user, so they are read by definition.
    is_read: true,
    attachments: parseAttachments(formData),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${threadId}`);

  if (isNewThread) {
    redirect(`/inbox/${threadId}`);
  }
}

/** Mark every message in a thread as read. Fired when a thread is opened. */
export async function markThreadRead(threadId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("communications")
    .update({ is_read: true })
    .eq("workspace_id", workspaceId)
    .eq("thread_id", threadId)
    .eq("is_read", false);

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${threadId}`);
}
