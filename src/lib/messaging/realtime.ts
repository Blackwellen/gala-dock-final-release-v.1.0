"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchConversationForPanel, fetchConversationsForPanel } from "./client-queries";
import type { ConversationSummary, InboxTab, MessageSummary } from "./types";

/** Debounce helper: coalesces bursts of Realtime events (e.g. a message plus
 * its attachment rows arriving in quick succession) into one refetch. */
function useDebouncedCallback(fn: () => void, delayMs: number) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(fn, delayMs);
  };
}

/** Keeps a single open conversation's message list live: any insert/update
 * to messages, message_reactions or conversation_participants (read state)
 * scoped to this conversation triggers a re-fetch of the full hydrated
 * message list (attachments, reactions, seen-by included). All inserts are
 * persisted server-side before this fires — Realtime here is a refresh
 * signal, never the source of truth. */
export function useConversationRealtime(conversationId: string, initialMessages: MessageSummary[]) {
  const [messages, setMessages] = useState(initialMessages);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const refetch = useDebouncedCallback(() => {
    fetchConversationForPanel(conversationId).then((res) => {
      if (res) setMessages(res.messages);
    });
  }, 250);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        refetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        refetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${conversationId}` },
        refetch,
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return { messages, connected, refetch };
}

/** Keeps a conversation list (full Inbox tab or Copilot panel "All chats")
 * live: any new message anywhere in the workspace triggers a debounced
 * re-fetch of the current tab/search view, so unread counts and last-message
 * previews stay current without a manual refresh. */
export function useConversationListRealtime(
  workspaceId: string,
  tab: InboxTab,
  search: string | undefined,
  initialConversations: ConversationSummary[],
) {
  const [conversations, setConversations] = useState(initialConversations);

  useEffect(() => {
    setConversations(initialConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search]);

  const refetch = useDebouncedCallback(() => {
    fetchConversationsForPanel(tab, search).then((res) => setConversations(res.conversations));
  }, 300);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-list:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` },
        refetch,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `workspace_id=eq.${workspaceId}` },
        refetch,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, tab, search]);

  return conversations;
}
