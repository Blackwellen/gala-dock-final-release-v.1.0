"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Plus, Search, Inbox as InboxIcon, MailOpen, Users, StickyNote,
  ChevronRight, CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { ComposeDialog, type EventOption } from "./ComposeDialog";
import { COMM_TYPE_META, formatRelative, type ThreadSummary } from "./inbox-utils";

export interface InboxMetrics {
  conversations: number;
  unread: number;
  clientThreads: number;
  internalThreads: number;
}

type FilterTab = "all" | "unread" | "client" | "internal";

export function InboxClient({
  threads,
  metrics,
  events,
}: {
  threads: ThreadSummary[];
  metrics: InboxMetrics;
  events: EventOption[];
}) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  const counts = useMemo(
    () => ({
      all: threads.length,
      unread: threads.filter((t) => t.unreadCount > 0).length,
      client: threads.filter((t) => t.category === "client").length,
      internal: threads.filter((t) => t.category === "internal").length,
    }),
    [threads]
  );

  const TABS = [
    { id: "all", label: "All", count: counts.all },
    { id: "unread", label: "Unread", count: counts.unread, badge: "danger" as const },
    { id: "client", label: "Conversations", count: counts.client },
    { id: "internal", label: "Internal", count: counts.internal },
  ];

  const visible = useMemo(() => {
    let list = threads;
    if (tab === "unread") list = list.filter((t) => t.unreadCount > 0);
    else if (tab === "client") list = list.filter((t) => t.category === "client");
    else if (tab === "internal") list = list.filter((t) => t.category === "internal");

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.participantName.toLowerCase().includes(q) ||
          (t.subject ?? "").toLowerCase().includes(q) ||
          (t.eventName ?? "").toLowerCase().includes(q) ||
          t.lastMessagePreview.toLowerCase().includes(q)
      );
    }
    return list;
  }, [threads, tab, search]);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Inbox"
        description="An in-app log of every client, supplier, and internal communication. Logging records activity — it does not send live messages in V1."
        actions={
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Message
          </button>
        }
        tabs={<TabNav tabs={TABS} active={tab} onChange={(id) => setTab(id as FilterTab)} />}
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid>
          <MetricCard label="Conversations" value={metrics.conversations} icon={MessageSquare} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Unread" value={metrics.unread} icon={MailOpen} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Client / Supplier" value={metrics.clientThreads} icon={Users} iconBg="bg-info-50" iconColor="text-info-600" />
          <MetricCard label="Internal Notes" value={metrics.internalThreads} icon={StickyNote} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — conversation list */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-surface-200">
              <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white">
                <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={InboxIcon}
                title="No conversations"
                description={
                  threads.length === 0
                    ? "Log your first communication to start building the activity history."
                    : "No conversations match this filter."
                }
                action={
                  threads.length === 0 ? (
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
              <ul className="divide-y divide-surface-100 overflow-y-auto">
                {visible.map((t) => (
                  <ThreadListItem key={t.threadId} thread={t} />
                ))}
              </ul>
            )}
          </div>

          {/* Right — default placeholder (thread opens on its own route) */}
          <div className="hidden lg:flex lg:col-span-2 bg-white rounded-xl border border-surface-200 shadow-card items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a conversation from the list to view its full message history and reply."
            />
          </div>
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        events={events}
      />
    </div>
  );
}

function ThreadListItem({ thread }: { thread: ThreadSummary }) {
  const TypeIcon = COMM_TYPE_META[thread.lastMessageType].icon;
  const unread = thread.unreadCount > 0;

  return (
    <li>
      <Link
        href={`/event-manager/inbox/${thread.threadId}`}
        className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-50 transition-colors group"
      >
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            thread.category === "internal"
              ? "bg-warning-50 text-warning-600"
              : "bg-brand-50 text-brand-600"
          )}
        >
          <TypeIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm truncate", unread ? "font-semibold text-surface-900" : "font-medium text-surface-700")}>
              {thread.participantName}
            </p>
            {unread && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
            <span className="ml-auto text-xs text-surface-400 shrink-0">{formatRelative(thread.lastMessageAt)}</span>
          </div>
          {thread.subject && (
            <p className="text-xs font-medium text-surface-600 truncate mt-0.5">{thread.subject}</p>
          )}
          <p className="text-xs text-surface-500 truncate mt-0.5">{thread.lastMessagePreview}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {thread.eventName && (
              <span className="inline-flex items-center gap-1 text-[11px] text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">
                <CalendarDays className="w-3 h-3" />
                {thread.eventName}
              </span>
            )}
            <span className="text-[11px] text-surface-400">{thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-surface-500 self-center shrink-0" />
      </Link>
    </li>
  );
}
