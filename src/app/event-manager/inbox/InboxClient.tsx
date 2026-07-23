"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Plus, Search, Inbox as InboxIcon, MailOpen, Users, StickyNote,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { ConversationThread } from "@/components/inbox/ConversationThread";
import { useConversationListRealtime } from "@/lib/messaging/realtime";
import { NewMessageDialog, type EventOption } from "./NewMessageDialog";
import type { ConversationDetail, ConversationSummary, InboxMetrics, InboxTab, MessageSummary } from "@/lib/messaging/types";

const TAB_LABELS: Record<InboxTab, string> = {
  all: "All",
  unread: "Unread",
  conversations: "Conversations",
  internal: "Internal",
};

export function InboxClient({
  workspaceId,
  tab,
  conversations,
  metrics,
  selectedConversation,
  messages,
  events,
}: {
  workspaceId: string;
  tab: InboxTab;
  conversations: ConversationSummary[];
  metrics: InboxMetrics;
  selectedConversation: ConversationDetail | null;
  messages: MessageSummary[];
  events: EventOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const liveConversations = useConversationListRealtime(workspaceId, tab, undefined, conversations);

  const TABS = (["all", "unread", "conversations", "internal"] as InboxTab[]).map((id) => ({
    id,
    label: TAB_LABELS[id],
    count:
      id === "all"
        ? metrics.totalConversations
        : id === "unread"
        ? metrics.unreadConversations
        : id === "conversations"
        ? metrics.clientSupplierConversations
        : metrics.internalNoteConversations,
    badge: id === "unread" ? ("danger" as const) : undefined,
  }));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveConversations;
    return liveConversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(q) ||
        (c.externalOrgName ?? "").toLowerCase().includes(q) ||
        c.participants.some((p) => p.displayName.toLowerCase().includes(q)),
    );
  }, [liveConversations, search]);

  function changeTab(nextTab: string) {
    router.push(`/event-manager/inbox?tab=${nextTab}`);
  }

  function selectConversation(id: string) {
    router.push(`/event-manager/inbox?tab=${tab}&conversation=${id}`);
  }

  function clearConversation() {
    router.push(`/event-manager/inbox?tab=${tab}`);
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Inbox"
        description="Manage client, supplier and internal conversations in one connected workspace."
        actions={
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Message
          </button>
        }
        tabs={<TabNav tabs={TABS} active={tab} onChange={changeTab} />}
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Conversations" value={metrics.totalConversations} icon={MessageSquare} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Unread" value={metrics.unreadConversations} icon={MailOpen} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Client / Supplier" value={metrics.clientSupplierConversations} icon={Users} iconBg="bg-info-50" iconColor="text-info-600" />
          <MetricCard label="Internal Notes" value={metrics.internalNoteConversations} icon={StickyNote} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-19rem)] min-h-[520px]">
          <div
            className={cn(
              "lg:col-span-1 bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden flex-col",
              selectedConversation ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="p-3 border-b border-surface-200">
              <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white">
                <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === "all" || tab === "conversations" ? "Search conversations…" : `Search ${tab} conversations…`
                  }
                  className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={metrics.totalConversations === 0 ? InboxIcon : tab === "unread" ? MailOpen : Search}
                title={
                  metrics.totalConversations === 0
                    ? "No conversations yet"
                    : search
                    ? "No matches"
                    : tab === "unread"
                    ? "You're all caught up"
                    : `No ${TAB_LABELS[tab].toLowerCase()} conversations`
                }
                description={
                  metrics.totalConversations === 0
                    ? "Start a new conversation to begin messaging clients, suppliers or your team."
                    : search
                    ? "Try a different search term."
                    : tab === "unread"
                    ? "Nothing needs your attention right now."
                    : "Conversations you start or receive here will show up in this tab."
                }
                action={
                  metrics.totalConversations === 0 ? (
                    <button
                      onClick={() => setComposeOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      New Message
                    </button>
                  ) : undefined
                }
                compact
              />
            ) : (
              <ul className="divide-y divide-surface-100 overflow-y-auto flex-1">
                {visible.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conversation={c}
                    active={c.id === selectedConversation?.id}
                    onClick={() => selectConversation(c.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div
            className={cn(
              "lg:col-span-2 bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden",
              selectedConversation ? "flex" : "hidden lg:flex",
            )}
          >
            {selectedConversation ? (
              <ConversationThread
                workspaceId={workspaceId}
                conversation={selectedConversation}
                messages={messages}
                onBack={clearConversation}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  icon={MessageSquare}
                  title="Select a conversation"
                  description="Choose a conversation from the list to view its full message history and reply."
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <NewMessageDialog open={composeOpen} onClose={() => setComposeOpen(false)} events={events} />
    </div>
  );
}
