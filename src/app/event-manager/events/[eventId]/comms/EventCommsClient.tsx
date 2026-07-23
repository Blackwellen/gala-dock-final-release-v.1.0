"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare, Send } from "lucide-react";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { NewMessageDialog } from "@/app/event-manager/inbox/NewMessageDialog";
import type { ConversationSummary } from "@/lib/messaging/types";

export function EventCommsClient({
  eventId,
  eventName,
  conversations,
}: {
  eventId: string;
  eventName: string;
  conversations: ConversationSummary[];
}) {
  const router = useRouter();
  const [composeOpen, setComposeOpen] = useState(false);

  const totalMessages = conversations.length;
  const unread = conversations.filter((c) => c.unreadCount > 0).length;
  const client = conversations.filter((c) => c.badge === "Client").length;
  const supplier = conversations.filter((c) => c.badge === "Supplier").length;
  const internal = conversations.filter((c) => c.badge === "Internal").length;

  const kpis = [
    { label: "Conversations", value: totalMessages, sub: "All channels", color: "text-surface-900" },
    { label: "Unread", value: unread, sub: "Needing attention", color: "text-danger-700" },
    { label: "Client", value: client, sub: "Client threads", color: "text-emerald-700" },
    { label: "Supplier", value: supplier, sub: "Supplier threads", color: "text-blue-700" },
    { label: "Internal", value: internal, sub: "Team threads", color: "text-amber-700" },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Communications</h2>
          <p className="text-sm text-surface-500">Client, supplier and internal conversations for this event.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm"
          >
            <Mail className="h-4 w-4" />
            Draft Message
          </button>
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm"
          >
            <Send className="h-4 w-4" />
            New Message
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
            <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
          </div>
        ))}
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No conversations yet</p>
          <p className="text-xs text-surface-400 mt-1">Message guests, suppliers or your team about this event.</p>
          <button
            onClick={() => setComposeOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Send className="h-4 w-4" />
            Start a Conversation
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
          {conversations.map((c) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              active={false}
              onClick={() => router.push(`/event-manager/inbox?conversation=${c.id}`)}
            />
          ))}
        </ul>
      )}

      <NewMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        events={[]}
        lockedEventId={eventId}
        lockedEventName={eventName}
        onCreated={(conversationId) => router.push(`/event-manager/inbox?conversation=${conversationId}`)}
      />
    </div>
  );
}
