"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, ExternalLink, Loader2 } from "lucide-react";
import { fetchConversationsForPanel, fetchConversationForPanel } from "@/lib/messaging/client-queries";
import { createClient } from "@/lib/supabase/client";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { ConversationThread } from "@/components/inbox/ConversationThread";
import type { ConversationDetail, ConversationSummary, MessageSummary } from "@/lib/messaging/types";

type PanelView = "list" | "thread";

/** The Gala Copilot panel's Inbox tab — reads/writes the exact same
 * conversations/messages the full Inbox uses via the client-queries and
 * actions server functions, so nothing here maintains its own copy of the
 * data. */
export function CopilotInboxPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<PanelView>("list");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConversationsForPanel("all", search || undefined).then((res) => {
      if (cancelled) return;
      setConversations(res.conversations);
      setTotalCount(res.metrics.totalConversations);
      setWorkspaceId(res.workspaceId);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [search]);

  // Keep the panel's "All chats" list live once we know which workspace to
  // scope the subscription to — same tables the full Inbox subscribes to.
  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`copilot-inbox-list:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          fetchConversationsForPanel("all", search || undefined).then((res) => {
            setConversations(res.conversations);
            setTotalCount(res.metrics.totalConversations);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function openConversation(id: string) {
    setSelectedId(id);
    setView("thread");
    setThreadLoading(true);
    fetchConversationForPanel(id).then((res) => {
      if (!res) return;
      setConversation(res.conversation);
      setMessages(res.messages);
      setThreadLoading(false);
      // Reflect the read state in the list without a full refetch.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    });
  }

  function backToList() {
    setView("list");
    setSelectedId(null);
  }

  function openFullInbox() {
    onClose();
    router.push(selectedId ? `/event-manager/inbox?conversation=${selectedId}` : "/event-manager/inbox");
  }

  if (view === "thread" && selectedId) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 pt-2 shrink-0">
          <button onClick={backToList} className="text-xs font-medium text-surface-500 hover:text-surface-700">
            ← All chats
          </button>
          <button onClick={openFullInbox} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            Open full conversation <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {threadLoading || !conversation ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
            </div>
          ) : (
            <ConversationThread workspaceId={workspaceId!} conversation={conversation} messages={messages} compact />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-surface-900">All chats</h3>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
            {totalCount}
          </span>
        </div>
        <Link href="/event-manager/inbox" onClick={onClose} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          View all
        </Link>
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 border border-surface-200 rounded-lg bg-white">
          <Search className="w-3.5 h-3.5 text-surface-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="text-xs text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
          />
        </div>
        <button className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center text-surface-400 shrink-0" aria-label="Filters">
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-center text-sm text-surface-400 py-10 px-4">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-surface-100">
            {conversations.map((c) => (
              <ConversationListItem key={c.id} conversation={c} active={c.id === selectedId} onClick={() => openConversation(c.id)} compact />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-surface-200 px-4 py-3">
        <Link
          href="/event-manager/inbox"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="w-4 h-4" />
          Open full inbox
        </Link>
      </div>
    </div>
  );
}
