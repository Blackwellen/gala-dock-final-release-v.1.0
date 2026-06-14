import { Mail, Phone, StickyNote, MessageCircle, MessagesSquare, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CommType, CommDirection } from "@/lib/supabase/types";

/** A communications row reduced to the fields the UI needs. */
export interface MessageRow {
  id: string;
  threadId: string;
  subject: string | null;
  body: string;
  commType: CommType;
  direction: CommDirection;
  participantName: string | null;
  participantEmail: string | null;
  participantPhone: string | null;
  eventId: string | null;
  eventName: string | null;
  leadId: string | null;
  isRead: boolean;
  attachments: { name: string; size: number }[];
  createdAt: string;
  createdByName: string | null;
}

/** A thread is a chronological group of messages sharing a thread_id. */
export interface ThreadSummary {
  threadId: string;
  participantName: string;
  subject: string | null;
  eventId: string | null;
  eventName: string | null;
  category: ThreadCategory;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageType: CommType;
  messageCount: number;
  unreadCount: number;
}

export type ThreadCategory = "client" | "supplier" | "internal";

export const COMM_TYPE_META: Record<CommType, { label: string; icon: LucideIcon }> = {
  email: { label: "Email", icon: Mail },
  call: { label: "Call", icon: Phone },
  note: { label: "Note", icon: StickyNote },
  meeting: { label: "Meeting", icon: CalendarClock },
  sms: { label: "SMS", icon: MessageCircle },
  whatsapp: { label: "WhatsApp", icon: MessagesSquare },
};

/** Comm types a planner can actually log in V1. SMS/WhatsApp are future add-ons. */
export const LOGGABLE_TYPES: CommType[] = ["email", "call", "note", "meeting"];
export const LOCKED_TYPES: CommType[] = ["sms", "whatsapp"];

/**
 * Categorise a thread for the inbox filter tabs. Internal notes (no outside
 * participant) are "internal"; everything else is treated as a client/supplier
 * conversation. We can't know supplier vs client without a join, so any thread
 * with an external participant is "client" unless every message is internal.
 */
export function categoriseThread(messages: MessageRow[]): ThreadCategory {
  const allInternal = messages.every((m) => m.direction === "internal");
  if (allInternal) return "internal";
  return "client";
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Group an ordered (newest-first) list of messages into thread summaries.
 * Messages without a thread_id are treated as their own single-message thread
 * keyed by their id.
 */
export function buildThreadSummaries(messages: MessageRow[]): ThreadSummary[] {
  const byThread = new Map<string, MessageRow[]>();
  for (const m of messages) {
    const key = m.threadId;
    const list = byThread.get(key) ?? [];
    list.push(m);
    byThread.set(key, list);
  }

  const summaries: ThreadSummary[] = [];
  for (const [threadId, msgs] of byThread) {
    // Sort ascending to find first/last reliably.
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const last = sorted[sorted.length - 1];
    const firstNamed = sorted.find((m) => m.participantName) ?? sorted[0];
    const firstSubject = sorted.find((m) => m.subject)?.subject ?? null;
    const eventMsg = sorted.find((m) => m.eventName);

    summaries.push({
      threadId,
      participantName: firstNamed.participantName ?? "Internal note",
      subject: firstSubject,
      eventId: eventMsg?.eventId ?? null,
      eventName: eventMsg?.eventName ?? null,
      category: categoriseThread(sorted),
      lastMessageAt: last.createdAt,
      lastMessagePreview: last.body.slice(0, 120),
      lastMessageType: last.commType,
      messageCount: sorted.length,
      unreadCount: sorted.filter((m) => !m.isRead).length,
    });
  }

  // Newest activity first.
  return summaries.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}
