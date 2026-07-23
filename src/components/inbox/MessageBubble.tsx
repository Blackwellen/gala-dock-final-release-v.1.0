"use client";

import { useState, useTransition } from "react";
import { Smile, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/messaging/format";
import { toggleReaction } from "@/lib/messaging/actions";
import { AttachmentChip } from "./AttachmentChip";
import type { MessageSummary } from "@/lib/messaging/types";

const QUICK_EMOJI = ["👍", "🎉", "❤️", "😂", "👀"];

export function MessageBubble({
  message,
  workspaceId,
  showSeenBy,
}: {
  message: MessageSummary;
  workspaceId: string;
  showSeenBy: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (message.status === "withdrawn") {
    return (
      <div className={cn("flex", message.isSelf ? "justify-end" : "justify-start")}>
        <p className="text-xs italic text-surface-400 px-3 py-2">Message withdrawn</p>
      </div>
    );
  }

  const isInternalNote = message.visibility === "internal_note";

  function react(emoji: string) {
    setPickerOpen(false);
    startTransition(() => {
      void toggleReaction(message.id, emoji);
    });
  }

  return (
    <div className={cn("group flex flex-col gap-1", message.isSelf ? "items-end" : "items-start")}>
      {!message.isSelf && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-semibold text-surface-800">{message.senderName}</span>
          <span className="text-xs text-surface-400">{formatTime(message.createdAt)}</span>
        </div>
      )}
      {message.isSelf && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-surface-400">You</span>
          <span className="text-xs text-surface-400">·</span>
          <span className="text-xs text-surface-400">Gala Dock</span>
          <span className="text-xs text-surface-400">{formatTime(message.createdAt)}</span>
        </div>
      )}

      <div className="relative max-w-lg">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isInternalNote
              ? "bg-amber-50 border border-amber-200 text-surface-800"
              : message.isSelf
              ? "bg-brand-50 border border-brand-100 text-surface-800"
              : "bg-surface-100 text-surface-800",
          )}
        >
          {isInternalNote && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">Internal note</p>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          {message.editedAt && <span className="text-[10px] text-surface-400 italic ml-1">(edited)</span>}
        </div>

        {message.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                workspaceId={workspaceId}
                fileName={a.fileName}
                mimeType={a.mimeType}
                sizeBytes={a.sizeBytes}
                r2Key={a.r2Key}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Add reaction"
            className="w-6 h-6 rounded-full flex items-center justify-center text-surface-400 hover:bg-surface-100"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
        </div>

        {pickerOpen && (
          <div className="absolute z-10 -top-9 left-0 flex items-center gap-1 bg-white border border-surface-200 rounded-full shadow-md px-2 py-1">
            {QUICK_EMOJI.map((e) => (
              <button key={e} onClick={() => react(e)} disabled={isPending} className="text-base hover:scale-110 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {message.reactions.length > 0 && (
        <div className="flex items-center gap-1 px-1">
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => react(r.emoji)}
              className={cn(
                "inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border",
                r.reactedBySelf ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-surface-50 border-surface-200 text-surface-600",
              )}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {message.isSelf && showSeenBy && (
        <div className="flex items-center gap-1 px-1 text-[11px] text-surface-400">
          {message.seenByCount > 1 ? (
            <span>Seen by {message.seenByCount - 1} ✓✓</span>
          ) : (
            <CheckCheck className="w-3 h-3" />
          )}
        </div>
      )}
    </div>
  );
}
