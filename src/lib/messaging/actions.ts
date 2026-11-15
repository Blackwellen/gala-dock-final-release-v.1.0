"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REPORT_REASONS } from "./safety";

// Cross-portal messaging (user addition, §89). Contact rules, membership and rate limits are enforced in the database.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG: [RegExp, string][] = [[/not_allowed/, "You can only message people you work with on Gala Dock."], [/not_authorized|42501/, "You don’t have access to this conversation."],
  [/rate_limited|54000/, "You’re sending messages too quickly — wait a moment."], [/empty_message/, "Write a message first."], [/invalid_attachment/, "Attach PDFs or images you’ve uploaded."],
  [/blocked_by_you/, "You’ve blocked this contact. Unblock them to send a message."], [/blocked/, "You can’t message this contact."]];
const fail = (m: string): R<never> => ({ ok: false, error: MSG.find(([re]) => re.test(m))?.[1] ?? "Couldn’t send — try again." });
const INBOXES = ["/organizer/inbox", "/provider/inbox", "/account/inbox"];

export async function startConversation(i: { toType: "user" | "workspace"; to: string; subject: string; body: string; asWorkspace?: string | null; kind?: string; eventId?: string | null; listingId?: string | null; itemId?: string | null }): Promise<R<string>> {
  if (!UUID.test(i.to) || (i.asWorkspace && !UUID.test(i.asWorkspace))) return { ok: false, error: "Choose who to message." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("start_conversation" as never, { p_kind: i.kind ?? "direct", p_subject: i.subject.slice(0, 140), p_to_type: i.toType, p_to: i.to, p_body: i.body.slice(0, 8000),
    p_as_workspace: i.asWorkspace ?? null, p_event: i.eventId ?? null, p_listing: i.listingId ?? null, p_item: i.itemId ?? null } as never);
  if (error) return fail(error.message);
  for (const p of INBOXES) revalidatePath(p, "page");
  return { ok: true, data: data as unknown as string };
}

export async function sendMessage(conversationId: string, body: string, attachments: { path: string; name: string }[], asWorkspace?: string | null): Promise<R> {
  if (!UUID.test(conversationId)) return { ok: false, error: "Conversation not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("post_message" as never, { p_conv: conversationId, p_body: body.slice(0, 8000), p_attachments: attachments.slice(0, 10).map(a => ({ path: a.path, name: a.name.slice(0, 120) })), p_as_workspace: asWorkspace ?? null } as never);
  if (error) return fail(error.message);
  for (const p of INBOXES) revalidatePath(p, "page");
  return { ok: true };
}

/** Marks the conversation read for the caller's seats and clears its bell alert (DB, Q52). */
export async function markRead(conversationId: string): Promise<void> {
  if (!UUID.test(conversationId)) return;
  const sb = await createClient();
  await sb.rpc("mark_conversation_read" as never, { p_conv: conversationId } as never);
}

/** Q52 Online Safety Act: report a message (reason code from the moderation catalogue). Optionally blocks the sender too. */
export async function reportMessage(messageId: string, reason: string, note: string, block: boolean, seat?: string | null): Promise<R> {
  if (!UUID.test(messageId) || (seat && !UUID.test(seat)) || !REPORT_REASONS.some(([k]) => k === reason)) return { ok: false, error: "Choose a reason." };
  if (reason === "other_policy" && note.trim().length < 5) return { ok: false, error: "Tell us what’s wrong (a few words is enough)." };
  const sb = await createClient();
  const { error } = await sb.rpc("report_message" as never, { p_message: messageId, p_reason_code: reason, p_note: note.slice(0, 1000), p_source: "conversation", p_block: block, p_seat: seat ?? null } as never);
  if (error) return { ok: false, error: /already_reported|23505/.test(error.message) ? "You’ve already reported this message — our team is looking at it."
    : /cannot_report_own/.test(error.message) ? "You can’t report your own messages." : /rate_limited/.test(error.message) ? "You’ve sent a lot of reports — try again later." : "Couldn’t send the report — try again." };
  for (const p of INBOXES) revalidatePath(p, "page");
  return { ok: true };
}

/** Blocks (or unblocks) a contact for this seat: neither side can send in your shared conversations while blocked. */
export async function setBlocked(type: "user" | "workspace", id: string, block: boolean, seat?: string | null): Promise<R> {
  if (!UUID.test(id) || (seat && !UUID.test(seat)) || (type !== "user" && type !== "workspace")) return { ok: false, error: "Contact not found." };
  const sb = await createClient();
  const { error } = await sb.rpc((block ? "block_contact" : "unblock_contact") as never, { p_type: type, p_id: id, p_seat: seat ?? null } as never);
  if (error) return { ok: false, error: /cannot_block_self/.test(error.message) ? "You can’t block your own account or workspace." : /rate_limited/.test(error.message) ? "Too many changes — try again later." : "Couldn’t update — try again." };
  for (const p of INBOXES) revalidatePath(p, "page");
  return { ok: true };
}

export type ContactProfile = { type: "user" | "workspace"; id: string; name: string; avatar: string | null; about: string; since: string; saved: boolean;
  kind?: string; cover?: string | null; location?: string; verified?: boolean; roles?: string[];
  listings?: { id: string; name: string; kind: string; slug: string | null }[]; events?: { id: string; name: string; slug: string | null; starts_at: string }[] };

/** Profile card for someone you're allowed to message (the database checks the relationship). */
export async function contactProfile(type: "user" | "workspace", id: string, seat?: string | null): Promise<ContactProfile | null> {
  if (!UUID.test(id) || (seat && !UUID.test(seat)) || (type !== "user" && type !== "workspace")) return null;
  const sb = await createClient();
  const { data } = await sb.rpc("contact_profile" as never, { p_type: type, p_id: id, p_seat: seat ?? null } as never);
  return (data as ContactProfile | null) ?? null;
}

/** Saves someone to the seat's contacts (personal, or the workspace's shared list), or removes them. */
export async function setSavedContact(type: "user" | "workspace", id: string, label: string, save: boolean, seat?: string | null): Promise<R> {
  if (!UUID.test(id) || (seat && !UUID.test(seat)) || (type !== "user" && type !== "workspace")) return { ok: false, error: "Contact not found." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const t = sb.from("saved_contacts" as never);
  const owner = seat ? { owner_workspace: seat } : { owner_user: user.id };
  const { error } = save
    ? await t.insert({ ...owner, target_type: type, target_id: id, label: label.slice(0, 120) } as never)
    : await t.delete().match({ ...owner, target_type: type, target_id: id } as never);
  if (error && !/duplicate|23505/.test(error.message)) return { ok: false, error: "Couldn’t update your contacts — try again." };
  for (const p of INBOXES) revalidatePath(p, "page");
  return { ok: true };
}
