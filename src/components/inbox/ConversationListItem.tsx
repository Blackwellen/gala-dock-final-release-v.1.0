"use client";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/messaging/format";
import { ConversationAvatar } from "./ConversationAvatar";
import { ConversationBadge } from "./ConversationBadge";
import type { ConversationSummary } from "@/lib/messaging/types";

export function ConversationListItem({
  conversation,
  active,
  onClick,
  compact,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const unread = conversation.unreadCount > 0;

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-start gap-3 text-left px-4 py-3 hover:bg-surface-50 transition-colors",
          active && "bg-brand-50/60",
          compact && "px-3 py-2.5",
        )}
      >
        <ConversationAvatar initials={conversation.avatarInitials} seed={conversation.id} size={compact ? "sm" : "md"} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm truncate", unread ? "font-semibold text-surface-900" : "font-medium text-surface-700")}>
              {conversation.title}
            </p>
            <ConversationBadge kind={conversation.badge} />
            <span className="ml-auto text-xs text-surface-400 shrink-0">{formatRelative(conversation.lastMessageAt)}</span>
          </div>
          <p className={cn("text-xs truncate mt-0.5", unread ? "text-surface-700 font-medium" : "text-surface-500")}>
            {conversation.lastMessageSenderName === "You" ? "You: " : ""}
            {conversation.lastMessagePreview ?? "No messages yet"}
          </p>
          {conversation.participantCount > 2 && !compact && (
            <p className="text-[11px] text-surface-400 mt-1">{conversation.participantCount} participants</p>
          )}
        </div>
        {unread ? (
          conversation.unreadCount > 1 ? (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-semibold shrink-0 mt-1">
              {conversation.unreadCount}
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5" />
          )
        ) : (
          <span className="w-2 h-2 shrink-0 mt-1.5" />
        )}
      </button>
    </li>
  );
}
