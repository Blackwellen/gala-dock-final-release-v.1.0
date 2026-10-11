"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Cross-portal messaging (user addition, §89). Contact rules, membership and rate limits are enforced in the database.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG: [RegExp, string][] = [[/not_allowed/, "You can only message people you work with on Gala Dock."], [/not_authorized|42501/, "You don’t have access to this conversation."],
  [/rate_limited|54000/, "You’re sending messages too quickly — wait a moment."], [/empty_message/, "Write a message first."], [/invalid_attachment/, "Attach PDFs or images you’ve uploaded."]];
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

export async function markRead(conversationId: string): Promise<void> {
  if (!UUID.test(conversationId)) return;
  const sb = await createClient();
  await sb.rpc("mark_conversation_read" as never, { p_conv: conversationId } as never);
}
