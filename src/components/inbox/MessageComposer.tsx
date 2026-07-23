"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Send, Smile, AtSign, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/lib/messaging/actions";
import { uploadMessageAttachment, type PresignedUpload } from "@/lib/messaging/attachments-client";
import { formatFileSize } from "@/lib/messaging/format";
import type { ConversationParticipantSummary } from "@/lib/messaging/types";

const QUICK_EMOJI = ["😀", "😂", "👍", "🎉", "❤️", "🙏", "👀", "✅"];

export function MessageComposer({
  workspaceId,
  conversationId,
  internalNoteMode,
  participants,
  onSent,
}: {
  workspaceId: string;
  conversationId: string;
  internalNoteMode?: boolean;
  participants: ConversationParticipantSummary[];
  onSent?: () => void;
}) {
  const [body, setBody] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PresignedUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const internalParticipants = participants.filter((p) => p.kind === "internal" && !p.isSelf);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploads = await Promise.all(
        Array.from(files).map((f) => uploadMessageAttachment(workspaceId, conversationId, f)),
      );
      setPendingUploads((prev) => [...prev, ...uploads]);
    } catch (err) {
      // Non-fatal: leave the composer usable, just skip the failed file.
      console.error("[MessageComposer] upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  function insertMention(p: ConversationParticipantSummary) {
    setBody((prev) => `${prev}${prev.endsWith(" ") || prev === "" ? "" : " "}@[${p.displayName}](${p.userId}) `);
    setMentionOpen(false);
  }

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed && pendingUploads.length === 0) return;

    startTransition(async () => {
      await sendMessage({
        conversationId,
        body: trimmed || "(attachment)",
        visibility: internalNoteMode ? "internal_note" : "standard",
        attachments: pendingUploads,
      });
      setBody("");
      setPendingUploads([]);
      onSent?.();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={cn("border-t px-4 py-3", internalNoteMode ? "border-amber-200 bg-amber-50/40" : "border-surface-200 bg-white")}>
      {pendingUploads.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingUploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-surface-100 rounded-full pl-2.5 pr-1 py-1">
              <span className="truncate max-w-[140px]">{u.fileName}</span>
              <span className="text-surface-400">{formatFileSize(u.sizeBytes)}</span>
              <button
                onClick={() => setPendingUploads((prev) => prev.filter((_, idx) => idx !== i))}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-surface-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={internalNoteMode ? "Write an internal message…" : "Write a message…"}
        className="w-full resize-none text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none max-h-32"
      />

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 relative">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            Attach
          </button>

          {internalParticipants.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMentionOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700"
              >
                <AtSign className="w-4 h-4" />
                Mention
              </button>
              {mentionOpen && (
                <div className="absolute bottom-7 left-0 z-10 bg-white border border-surface-200 rounded-lg shadow-lg py-1 w-48 max-h-56 overflow-y-auto">
                  {internalParticipants.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => insertMention(p)}
                      className="w-full text-left px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-50"
                    >
                      {p.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="Insert emoji"
              className="text-surface-400 hover:text-surface-600"
            >
              <Smile className="w-4 h-4" />
            </button>
            {emojiOpen && (
              <div className="absolute bottom-7 left-0 z-10 flex items-center gap-1 bg-white border border-surface-200 rounded-full shadow-lg px-2 py-1">
                {QUICK_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setBody((prev) => prev + e);
                      setEmojiOpen(false);
                    }}
                    className="text-base hover:scale-110 transition-transform"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={isPending || (!body.trim() && pendingUploads.length === 0)}
          aria-label="Send message"
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors shrink-0",
            internalNoteMode ? "bg-amber-500 hover:bg-amber-600" : "bg-brand-600 hover:bg-brand-700",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
