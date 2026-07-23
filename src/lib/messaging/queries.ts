import { createClient } from "@/lib/supabase/server";
import {
  badgeForConversationType,
  isInternalType,
  type ConversationDetail,
  type ConversationParticipantSummary,
  type ConversationSummary,
  type ConversationType,
  type InboxMetrics,
  type InboxTab,
  type MessageSummary,
} from "./types";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

type ConversationRow = {
  id: string;
  type: string;
  title: string | null;
  external_org_name: string | null;
  event_id: string | null;
  last_message_at: string | null;
};

async function resolveDisplayNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
): Promise<Map<string, string>> {
  const nameByUser = new Map<string, string>();
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return nameByUser;
  const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
  for (const p of data ?? []) nameByUser.set(p.user_id, p.display_name ?? "Team member");
  return nameByUser;
}

/** Build ConversationSummary rows for a list of conversation ids, resolving
 * participants, unread counts, event names and last-message previews in bulk
 * queries (no per-row round trips). Shared by every Inbox tab and the
 * Copilot panel's Inbox mode — this is the one place conversation list rows
 * are assembled. */
async function hydrateConversations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
  conversations: ConversationRow[],
): Promise<ConversationSummary[]> {
  if (conversations.length === 0) return [];
  const conversationIds = conversations.map((c) => c.id);

  const [{ data: participantRows }, { data: lastMessages }, { data: events }, { data: myParticipation }] =
    await Promise.all([
      supabase
        .from("conversation_participants")
        .select("id, conversation_id, user_id, external_contact_name, participant_kind, role")
        .in("conversation_id", conversationIds)
        .is("left_at", null)
        .is("removed_at", null),
      supabase
        .from("messages")
        .select("conversation_id, body, sender_name, sender_user_id, created_at, visibility")
        .in("conversation_id", conversationIds)
        .eq("status", "sent")
        .order("created_at", { ascending: false }),
      supabase.from("events").select("id, name").in(
        "id",
        conversations.map((c) => c.event_id).filter((id): id is string => Boolean(id)),
      ),
      supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, pinned_at, muted_until, archived_at")
        .in("conversation_id", conversationIds)
        .eq("user_id", userId),
    ]);

  const eventNameById = new Map((events ?? []).map((e) => [e.id, e.name as string]));
  const myStateByConv = new Map((myParticipation ?? []).map((p) => [p.conversation_id, p]));

  const participantsByConv = new Map<string, ConversationParticipantSummary[]>();
  const internalUserIds: string[] = [];
  for (const row of participantRows ?? []) {
    if (row.user_id) internalUserIds.push(row.user_id);
  }
  const nameByUser = await resolveDisplayNames(supabase, internalUserIds);

  for (const row of participantRows ?? []) {
    const list = participantsByConv.get(row.conversation_id) ?? [];
    const displayName = row.user_id
      ? (nameByUser.get(row.user_id) ?? "Team member")
      : (row.external_contact_name ?? "Guest");
    list.push({
      id: row.id,
      userId: row.user_id,
      displayName,
      externalOrgName: null,
      kind: row.participant_kind as ConversationParticipantSummary["kind"],
      role: row.role as ConversationParticipantSummary["role"],
      isSelf: row.user_id === userId,
    });
    participantsByConv.set(row.conversation_id, list);
  }

  const lastMessageByConv = new Map<string, (typeof lastMessages extends (infer R)[] | null ? R : never)>();
  for (const m of lastMessages ?? []) {
    if (!lastMessageByConv.has(m.conversation_id)) lastMessageByConv.set(m.conversation_id, m);
  }

  // Unread counts: messages after my last_read_at, not authored by me, not withdrawn,
  // and (if internal_note) only counted if I'm an internal participant — the RLS
  // policy already prevents me from ever selecting a note I can't see, so a
  // plain count against the messages the query returns is correct here.
  const unreadCounts = new Map<string, number>();
  for (const conv of conversations) {
    const myState = myStateByConv.get(conv.id);
    const lastReadAt = myState?.last_read_at ?? null;
    const count = (lastMessages ?? []).filter((m) => {
      if (m.conversation_id !== conv.id) return false;
      if (m.sender_user_id === userId) return false;
      if (!lastReadAt) return true;
      return new Date(m.created_at).getTime() > new Date(lastReadAt).getTime();
    }).length;
    unreadCounts.set(conv.id, count);
  }

  return conversations.map((conv) => {
    const type = conv.type as ConversationType;
    const participants = participantsByConv.get(conv.id) ?? [];
    const otherParticipants = participants.filter((p) => !p.isSelf);
    const lastMessage = lastMessageByConv.get(conv.id);
    const myState = myStateByConv.get(conv.id);
    const derivedTitle =
      conv.title ??
      (otherParticipants.length > 0 ? otherParticipants.map((p) => p.displayName).join(", ") : "Conversation");

    return {
      id: conv.id,
      type,
      badge: badgeForConversationType(type),
      title: derivedTitle,
      externalOrgName: conv.external_org_name,
      eventId: conv.event_id,
      eventName: conv.event_id ? (eventNameById.get(conv.event_id) ?? null) : null,
      participants,
      participantCount: participants.length,
      lastMessageAt: conv.last_message_at,
      lastMessagePreview: lastMessage ? truncate(lastMessage.body) : null,
      lastMessageSenderName: lastMessage
        ? (lastMessage.sender_user_id === userId ? "You" : lastMessage.sender_name)
        : null,
      unreadCount: unreadCounts.get(conv.id) ?? 0,
      isPinned: Boolean(myState?.pinned_at),
      isMuted: Boolean(myState?.muted_until && new Date(myState.muted_until).getTime() > Date.now()),
      isArchived: Boolean(myState?.archived_at),
      // Avatar initials always reflect who you're talking to, not the
      // conversation subject line — e.g. "SC" for Sarah Chandler even when
      // the title is "Production schedule & load-in update".
      avatarInitials: initialsFor(
        otherParticipants.length > 0 ? otherParticipants[0].displayName : derivedTitle,
      ),
    };
  });
}

export interface ListConversationsOptions {
  tab: InboxTab;
  search?: string;
  eventId?: string;
}

/** List conversations visible to the current user for a given Inbox tab.
 * Shared by the full Inbox page and the Copilot panel's compact list — pass
 * the same tab semantics from both callers. */
export async function listConversations(
  workspaceId: string,
  userId: string,
  opts: ListConversationsOptions,
): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  // RLS already restricts to conversations I participate in; we additionally
  // filter to non-archived unless explicitly viewing archived (not yet a tab).
  let query = supabase
    .from("conversations")
    .select("id, type, title, external_org_name, event_id, last_message_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (opts.eventId) query = query.eq("event_id", opts.eventId);
  if (opts.tab === "internal") {
    query = query.in("type", [
      "direct_internal",
      "group_internal",
      "event_internal",
      "internal_note_thread",
    ]);
  } else if (opts.tab === "conversations") {
    query = query.in("type", [
      "client_direct",
      "client_group",
      "supplier_direct",
      "supplier_group",
      "mixed_external",
      "event_client",
      "event_supplier",
    ]);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  let summaries = await hydrateConversations(supabase, workspaceId, userId, rows ?? []);

  if (opts.tab === "unread") {
    summaries = summaries.filter((c) => c.unreadCount > 0);
  }

  if (opts.search && opts.search.trim().length > 0) {
    const q = opts.search.trim().toLowerCase();
    summaries = summaries.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(q) ||
        (c.externalOrgName ?? "").toLowerCase().includes(q) ||
        c.participants.some((p) => p.displayName.toLowerCase().includes(q)),
    );
  }

  // Sort: pinned first, then most recent unread activity, then most recent activity.
  summaries.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (opts.tab === "unread" && a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  return summaries;
}

export async function getInboxMetrics(workspaceId: string, userId: string): Promise<InboxMetrics> {
  const all = await listConversations(workspaceId, userId, { tab: "all" });
  return {
    totalConversations: all.length,
    unreadConversations: all.filter((c) => c.unreadCount > 0).length,
    clientSupplierConversations: all.filter((c) => c.badge !== "Internal").length,
    internalNoteConversations: all.filter((c) => c.type === "internal_note_thread" || isInternalType(c.type)).length,
  };
}

export async function getConversationDetail(
  workspaceId: string,
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("conversations")
    .select("id, type, title, external_org_name, event_id, last_message_at, visibility")
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .maybeSingle();

  if (!row) return null;
  const [summary] = await hydrateConversations(supabase, workspaceId, userId, [row]);
  if (!summary) return null;
  return { ...summary, visibility: row.visibility as "internal" | "external" };
}

export interface ListMessagesOptions {
  cursor?: string;
  limit?: number;
}

/** Cursor-paginated message list, oldest→newest within the returned page.
 * Pass `cursor` (an ISO timestamp) to page further into history. */
export async function listMessages(
  workspaceId: string,
  userId: string,
  conversationId: string,
  opts: ListMessagesOptions = {},
): Promise<MessageSummary[]> {
  const supabase = await createClient();
  const limit = opts.limit ?? 50;

  let query = supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_user_id, sender_name, sender_type, body, visibility, status, reply_to_message_id, created_at, edited_at, withdrawn_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.cursor) query = query.lt("created_at", opts.cursor);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const messages = (rows ?? []).slice().reverse();

  if (messages.length === 0) return [];
  const messageIds = messages.map((m) => m.id);

  const [{ data: attachments }, { data: reactions }, { data: participants }] = await Promise.all([
    supabase
      .from("message_attachments")
      .select("id, message_id, original_file_name, mime_type, size_bytes, r2_key")
      .in("message_id", messageIds)
      .is("archived_at", null),
    supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", messageIds),
    supabase
      .from("conversation_participants")
      .select("user_id, last_read_message_id, last_read_at")
      .eq("conversation_id", conversationId)
      .is("left_at", null)
      .is("removed_at", null),
  ]);

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const a of attachments ?? []) {
    const list = attachmentsByMessage.get(a.message_id) ?? [];
    list.push(a);
    attachmentsByMessage.set(a.message_id, list);
  }

  const reactionsByMessage = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions ?? []) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    reactionsByMessage.set(r.message_id, list);
  }

  return messages.map((m) => {
    const msgAttachments = (attachmentsByMessage.get(m.id) ?? []).map((a) => ({
      id: a.id,
      fileName: a.original_file_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      r2Key: a.r2_key,
    }));

    const rawReactions = reactionsByMessage.get(m.id) ?? [];
    const byEmoji = new Map<string, string[]>();
    for (const r of rawReactions) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId]);
    const reactionSummaries = Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      reactedBySelf: userIds.includes(userId),
      userIds,
    }));

    const seenByCount = (participants ?? []).filter((p) => {
      if (!p.last_read_at) return false;
      return new Date(p.last_read_at).getTime() >= new Date(m.created_at).getTime();
    }).length;

    const myParticipant = (participants ?? []).find((p) => p.user_id === userId);
    const readBySelf = myParticipant?.last_read_at
      ? new Date(myParticipant.last_read_at).getTime() >= new Date(m.created_at).getTime()
      : false;

    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderUserId: m.sender_user_id,
      senderName: m.sender_user_id === userId ? "You" : m.sender_name ?? "Unknown",
      senderType: m.sender_type as MessageSummary["senderType"],
      isSelf: m.sender_user_id === userId,
      body: m.body,
      visibility: m.visibility as MessageSummary["visibility"],
      status: m.status as MessageSummary["status"],
      replyToMessageId: m.reply_to_message_id,
      createdAt: m.created_at,
      editedAt: m.edited_at,
      withdrawnAt: m.withdrawn_at,
      readBySelf,
      seenByCount,
      attachments: msgAttachments,
      reactions: reactionSummaries,
    };
  });
}
