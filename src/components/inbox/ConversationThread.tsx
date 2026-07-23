"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Star, MoreVertical, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayDivider } from "@/lib/messaging/format";
import { markConversationRead, pinConversation, unpinConversation } from "@/lib/messaging/actions";
import { useConversationRealtime } from "@/lib/messaging/realtime";
import { ConversationAvatar } from "./ConversationAvatar";
import { ConversationBadge } from "./ConversationBadge";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import type { ConversationDetail, MessageSummary } from "@/lib/messaging/types";

export function ConversationThread({
  workspaceId,
  conversation,
  messages,
  compact,
  onOpenDetails,
  onBack,
}: {
  workspaceId: string;
  conversation: ConversationDetail;
  messages: MessageSummary[];
  compact?: boolean;
  onOpenDetails?: () => void;
  /** Shown as a mobile-only back control (full Inbox on narrow viewports has
   * no split-pane — the thread replaces the list, so it needs its own way
   * back). Not used by the Copilot panel, which has its own "← All chats". */
  onBack?: () => void;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGroup = conversation.participantCount > 2;
  const isInternal = conversation.badge === "Internal";
  const { messages: liveMessages, refetch } = useConversationRealtime(conversation.id, messages);

  useEffect(() => {
    void markConversationRead(conversation.id);
  }, [conversation.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [liveMessages.length]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: MessageSummary[] }[] = [];
    for (const m of liveMessages) {
      const day = formatDayDivider(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [liveMessages]);

  function handleSent() {
    refetch();
  }

  function togglePin() {
    void (conversation.isPinned ? unpinConversation(conversation.id) : pinConversation(conversation.id)).then(() =>
      router.refresh(),
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className={cn("flex items-center gap-3 border-b border-surface-200", compact ? "px-4 py-3" : "px-5 py-4")}>
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <ConversationAvatar initials={conversation.avatarInitials} seed={conversation.id} size={compact ? "md" : "lg"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className={cn("font-semibold text-surface-900 truncate", compact ? "text-sm" : "text-base")}>{conversation.title}</h2>
            <ConversationBadge kind={conversation.badge} />
            {conversation.isPinned && <span className="text-[11px] font-medium text-rose-600">Pinned</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-surface-500 mt-0.5">
            {conversation.externalOrgName && <span>{conversation.externalOrgName}</span>}
            {conversation.externalOrgName && <span>|</span>}
            {isGroup ? (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {conversation.participantCount} participants
              </span>
            ) : null}
            <button onClick={onOpenDetails} className="text-brand-600 hover:underline font-medium">
              {isInternal || isGroup ? "View details" : "View contact"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={togglePin}
            aria-label={conversation.isPinned ? "Unpin conversation" : "Pin conversation"}
            className={cn("w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100", conversation.isPinned ? "text-amber-500" : "text-surface-400")}
          >
            <Star className="w-4 h-4" fill={conversation.isPinned ? "currentColor" : "none"} />
          </button>
          <button aria-label="More actions" className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:bg-surface-100">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {grouped.map((group) => (
          <div key={group.day} className="space-y-4">
            <div className="flex justify-center">
              <span className="text-[11px] font-medium text-surface-400 bg-surface-100 rounded-full px-2.5 py-0.5">{group.day}</span>
            </div>
            {group.items.map((m) => (
              <MessageBubble key={m.id} message={m} workspaceId={workspaceId} showSeenBy={isGroup} />
            ))}
          </div>
        ))}
        {liveMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-surface-400">No messages yet — say hello.</div>
        )}
      </div>

      <MessageComposer
        workspaceId={workspaceId}
        conversationId={conversation.id}
        internalNoteMode={false}
        participants={conversation.participants}
        onSent={handleSent}
      />
    </div>
  );
}
