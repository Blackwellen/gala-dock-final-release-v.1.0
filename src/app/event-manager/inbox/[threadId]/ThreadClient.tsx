"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Paperclip, MessageSquarePlus, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import {
  COMM_TYPE_META, formatTimestamp, formatBytes, type MessageRow,
} from "../inbox-utils";
import { ComposeDialog } from "../ComposeDialog";
import { markThreadRead } from "../actions";

export function ThreadClient({
  threadId,
  messages,
}: {
  threadId: string;
  messages: MessageRow[];
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [markingPending, startMarking] = useTransition();

  // Derive a thread header from the messages.
  const named = messages.find((m) => m.participantName);
  const participant = named?.participantName ?? "Internal note";
  const subject = messages.find((m) => m.subject)?.subject ?? null;
  const eventMsg = messages.find((m) => m.eventName);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={participant}
        description={subject ?? undefined}
        actions={
          <>
            <Link
              href="/event-manager/inbox"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Inbox
            </Link>
            <button
              onClick={() => startMarking(() => markThreadRead(threadId))}
              disabled={markingPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-60 transition-colors"
              title="Mark every message in this thread as read"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all as read
            </button>
            <button
              onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
              Reply / Log
            </button>
          </>
        }
      />

      <div className="flex-1 p-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {eventMsg?.eventName && (
            <Link
              href={`/event-manager/events/${eventMsg.eventId}`}
              className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg"
            >
              <CalendarDays className="w-4 h-4" />
              {eventMsg.eventName}
            </Link>
          )}

          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>

          {/* Inline reply prompt */}
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-surface-300 bg-white text-sm text-surface-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Write a message or note…
          </button>
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        threadId={threadId}
        lockedEventId={eventMsg?.eventId ?? undefined}
        lockedEventName={eventMsg?.eventName ?? undefined}
        title="Reply in thread"
      />
    </div>
  );
}

function MessageBubble({ message }: { message: MessageRow }) {
  const meta = COMM_TYPE_META[message.commType];
  const Icon = meta.icon;
  const isInternal = message.direction === "internal";
  const isOutbound = message.direction === "outbound";

  if (isInternal) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="w-3.5 h-3.5 text-warning-600" />
          <span className="text-xs font-semibold text-warning-700 uppercase tracking-wide">
            Internal Note
          </span>
          <span className="ml-auto text-xs text-surface-400">{formatTimestamp(message.createdAt)}</span>
        </div>
        <p className="text-sm text-surface-800 whitespace-pre-wrap">{message.body}</p>
        {message.createdByName && (
          <p className="mt-1.5 text-xs text-surface-500">— {message.createdByName}</p>
        )}
        <Attachments items={message.attachments} tone="warning" />
      </div>
    );
  }

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%]", isOutbound ? "items-end" : "items-start")}>
        <div className="flex items-center gap-1.5 mb-1 text-xs text-surface-500">
          <Icon className="w-3 h-3" />
          <span className="font-medium">
            {isOutbound ? message.createdByName ?? "You" : message.participantName ?? "Contact"}
          </span>
          <span className="text-surface-300">·</span>
          <span>{meta.label}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
            isOutbound
              ? "bg-brand-600 text-white rounded-br-sm"
              : "bg-white border border-surface-200 text-surface-800 rounded-bl-sm"
          )}
        >
          {message.subject && (
            <p className={cn("font-semibold mb-1", isOutbound ? "text-white" : "text-surface-900")}>
              {message.subject}
            </p>
          )}
          {message.body}
          <Attachments items={message.attachments} tone={isOutbound ? "brand" : "surface"} />
        </div>
        <p className={cn("mt-1 text-xs text-surface-400", isOutbound ? "text-right" : "text-left")}>
          {formatTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function Attachments({
  items,
  tone,
}: {
  items: { name: string; size: number }[];
  tone: "brand" | "surface" | "warning";
}) {
  if (items.length === 0) return null;
  const cls =
    tone === "brand"
      ? "bg-brand-500/40 text-white"
      : tone === "warning"
      ? "bg-white text-warning-700 border border-warning-200"
      : "bg-surface-100 text-surface-600";
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {items.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs", cls)}
        >
          <Paperclip className="w-3 h-3" />
          {a.name}
          {a.size > 0 && <span className="opacity-70">({formatBytes(a.size)})</span>}
        </li>
      ))}
    </ul>
  );
}
