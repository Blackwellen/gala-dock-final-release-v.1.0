"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { ConversationType, MessageVisibility, ParticipantKind } from "./types";
import type { TablesUpdate } from "@/lib/supabase/types";

function revalidateInbox(conversationId?: string) {
  revalidatePath("/event-manager/inbox");
  if (conversationId) revalidatePath(`/event-manager/inbox/${conversationId}`);
}

/** Notify other internal participants of a new message via the shared
 * notifications table (same one the bell icon / NotificationsMenu reads).
 * Muted participants and the sender are skipped. Mentioned users get a
 * distinct, higher-signal notification. Never notifies external
 * client/supplier participants — they have no user_id/notification target. */
async function notifyNewMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  conversationId: string,
  senderUserId: string,
  messageId: string,
  mentionedUserIds: string[],
): Promise<void> {
  const [{ data: conversation }, { data: participants }] = await Promise.all([
    supabase.from("conversations").select("title").eq("id", conversationId).maybeSingle(),
    supabase
      .from("conversation_participants")
      .select("user_id, muted_until")
      .eq("conversation_id", conversationId)
      .not("user_id", "is", null)
      .is("left_at", null)
      .is("removed_at", null),
  ]);

  const title = conversation?.title ?? "Inbox";
  const link = `/event-manager/inbox?conversation=${conversationId}`;
  const mentionedSet = new Set(mentionedUserIds);
  const now = Date.now();

  const rows = (participants ?? [])
    .filter((p) => p.user_id && p.user_id !== senderUserId)
    .filter((p) => !p.muted_until || new Date(p.muted_until).getTime() < now)
    .map((p) => {
      const isMentioned = mentionedSet.has(p.user_id!);
      return {
        workspace_id: workspaceId,
        user_id: p.user_id!,
        title: isMentioned ? `You were mentioned in ${title}` : `New message in ${title}`,
        body: null,
        link,
        severity: "info",
        category: isMentioned ? "inbox_mention" : "inbox_message",
        metadata: { conversationId, messageId },
      };
    });

  if (rows.length > 0) await supabase.from("notifications").insert(rows);
}

export interface NewParticipantInput {
  userId?: string;
  externalContactName?: string;
  externalContactEmail?: string;
  kind: ParticipantKind;
  role?: "owner" | "admin" | "member" | "guest";
}

export interface CreateConversationInput {
  type: ConversationType;
  title?: string;
  externalOrgName?: string;
  eventId?: string;
  leadId?: string;
  supplierId?: string;
  participants: NewParticipantInput[];
  initialMessage: string;
}

/** Create a conversation (direct or group, internal or external) and its
 * first message in one transaction-equivalent sequence: conversation row →
 * participant rows (creator + given participants) → first message. Used by
 * the New Message / New Group dialog on both the full Inbox and the Copilot
 * panel. */
export async function createConversation(input: CreateConversationInput): Promise<{ conversationId: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const visibility = input.type === "direct_internal" || input.type === "group_internal" || input.type === "internal_note_thread" || input.type === "event_internal"
    ? "internal"
    : "external";

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      type: input.type,
      title: input.title ?? null,
      visibility,
      external_org_name: input.externalOrgName ?? null,
      event_id: input.eventId ?? null,
      lead_id: input.leadId ?? null,
      supplier_id: input.supplierId ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (convError || !conversation) throw new Error(convError?.message ?? "Could not create conversation");

  const participantRows = [
    {
      workspace_id: workspaceId,
      conversation_id: conversation.id,
      user_id: user.id,
      participant_kind: "internal" as const,
      role: "owner" as const,
      added_by: user.id,
    },
    ...input.participants.map((p) => ({
      workspace_id: workspaceId,
      conversation_id: conversation.id,
      user_id: p.userId ?? null,
      external_contact_name: p.externalContactName ?? null,
      external_contact_email: p.externalContactEmail ?? null,
      participant_kind: p.kind,
      role: p.role ?? "member",
      added_by: user.id,
    })),
  ];

  const { error: participantsError } = await supabase.from("conversation_participants").insert(participantRows);
  if (participantsError) throw new Error(participantsError.message);

  const { data: firstMessage, error: messageError } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversation.id,
      sender_user_id: user.id,
      sender_name: "You",
      sender_type: "internal",
      body: input.initialMessage,
      visibility: "standard" as MessageVisibility,
    })
    .select("id")
    .single();
  if (messageError || !firstMessage) throw new Error(messageError?.message ?? "Could not send opening message");

  // First-party sender has implicitly seen their own message.
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id);

  await notifyNewMessage(supabase, workspaceId, conversation.id, user.id, firstMessage.id, []);

  revalidateInbox(conversation.id);
  return { conversationId: conversation.id };
}

export interface SendMessageInput {
  conversationId: string;
  body: string;
  visibility?: MessageVisibility;
  replyToMessageId?: string;
  attachments?: { fileName: string; mimeType: string; sizeBytes: number; r2Key: string }[];
}

/** Persist a message before any Realtime broadcast is considered successful.
 * Attachment rows (already uploaded to R2 via presigned PUT) are linked here. */
export async function sendMessage(input: SendMessageInput): Promise<{ messageId: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const body = input.body.trim();
  if (!body) throw new Error("Message body is required");
  if (body.length > 8000) throw new Error("Message is too long");

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: input.conversationId,
      sender_user_id: user.id,
      sender_name: "You",
      sender_type: "internal",
      body,
      visibility: input.visibility ?? "standard",
      reply_to_message_id: input.replyToMessageId ?? null,
    })
    .select("id")
    .single();

  if (error || !message) throw new Error(error?.message ?? "Could not send message");

  if (input.attachments && input.attachments.length > 0) {
    const { error: attachError } = await supabase.from("message_attachments").insert(
      input.attachments.map((a) => ({
        workspace_id: workspaceId,
        conversation_id: input.conversationId,
        message_id: message.id,
        uploaded_by: user.id,
        original_file_name: a.fileName,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
        r2_key: a.r2Key,
      })),
    );
    if (attachError) throw new Error(attachError.message);
  }

  // Parse @mentions of the form @[Display Name](userId) inserted by the composer's mention picker.
  const mentionMatches = Array.from(body.matchAll(/@\[[^\]]+\]\(([0-9a-f-]{36})\)/g));
  const mentionedUserIds = Array.from(new Set(mentionMatches.map((m) => m[1])));
  if (mentionedUserIds.length > 0) {
    await supabase.from("message_mentions").insert(
      mentionedUserIds.map((mentionedUserId) => ({
        workspace_id: workspaceId,
        message_id: message.id,
        mentioned_user_id: mentionedUserId,
      })),
    );
  }

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString(), last_read_message_id: message.id })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", user.id);

  await notifyNewMessage(supabase, workspaceId, input.conversationId, user.id, message.id, mentionedUserIds);

  revalidateInbox(input.conversationId);
  return { messageId: message.id };
}

export async function editMessage(messageId: string, body: string): Promise<void> {
  const { user } = await requireWorkspace();
  const supabase = await createClient();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message body is required");

  const { data: existing } = await supabase
    .from("messages")
    .select("conversation_id, sender_user_id, withdrawn_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing || existing.sender_user_id !== user.id) throw new Error("Forbidden");
  if (existing.withdrawn_at) throw new Error("Cannot edit a withdrawn message");

  const { error } = await supabase
    .from("messages")
    .update({ body: trimmed, status: "edited", edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw new Error(error.message);

  revalidateInbox(existing.conversation_id);
}

export async function withdrawMessage(messageId: string): Promise<void> {
  const { user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("messages")
    .select("conversation_id, sender_user_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing || existing.sender_user_id !== user.id) throw new Error("Forbidden");

  const { error } = await supabase
    .from("messages")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw new Error(error.message);

  revalidateInbox(existing.conversation_id);
}

export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("message_reactions")
      .insert({ workspace_id: workspaceId, message_id: messageId, user_id: user.id, emoji });
    if (error) throw new Error(error.message);
  }

  const { data: message } = await supabase.from("messages").select("conversation_id").eq("id", messageId).maybeSingle();
  revalidateInbox(message?.conversation_id);
}

/** Mark a conversation read up to now for the current user. Uses a single
 * last-read pointer rather than one row per message, so this scales to long
 * conversation history. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateInbox(conversationId);
}

export async function markAllConversationsRead(): Promise<void> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateInbox();
}

async function setMyParticipantField(conversationId: string, fields: TablesUpdate<"conversation_participants">): Promise<void> {
  const { user } = await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_participants")
    .update(fields)
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateInbox(conversationId);
}

export async function pinConversation(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { pinned_at: new Date().toISOString() });
}

export async function unpinConversation(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { pinned_at: null });
}

export async function muteConversation(conversationId: string, untilIso?: string): Promise<void> {
  const until = untilIso ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
  await setMyParticipantField(conversationId, { muted_until: until });
}

export async function unmuteConversation(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { muted_until: null });
}

export async function archiveConversationForSelf(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { archived_at: new Date().toISOString() });
}

export async function unarchiveConversationForSelf(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { archived_at: null });
}

export async function addParticipant(conversationId: string, participant: {
  userId?: string;
  externalContactName?: string;
  externalContactEmail?: string;
  kind: ParticipantKind;
}): Promise<void> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.from("conversation_participants").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    user_id: participant.userId ?? null,
    external_contact_name: participant.externalContactName ?? null,
    external_contact_email: participant.externalContactEmail ?? null,
    participant_kind: participant.kind,
    role: "member",
    added_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidateInbox(conversationId);
}

export async function removeParticipant(conversationId: string, participantId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_participants")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("conversation_id", conversationId);
  if (error) throw new Error(error.message);
  revalidateInbox(conversationId);
}

export async function leaveConversation(conversationId: string): Promise<void> {
  await setMyParticipantField(conversationId, { left_at: new Date().toISOString() });
}
