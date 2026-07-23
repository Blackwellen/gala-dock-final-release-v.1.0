import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getInboxMetrics, listConversations, getConversationDetail, listMessages } from "@/lib/messaging/queries";
import type { InboxTab } from "@/lib/messaging/types";
import { InboxClient } from "./InboxClient";

export const metadata = { title: "Inbox" };

const VALID_TABS: InboxTab[] = ["all", "unread", "conversations", "internal"];

interface InboxPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const sp = await searchParams;
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const rawTab = typeof sp.tab === "string" ? sp.tab : "all";
  const tab: InboxTab = (VALID_TABS as string[]).includes(rawTab) ? (rawTab as InboxTab) : "all";
  const conversationId = typeof sp.conversation === "string" ? sp.conversation : undefined;

  const [conversations, metrics, { data: events }] = await Promise.all([
    listConversations(workspaceId, user.id, { tab }),
    getInboxMetrics(workspaceId, user.id),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
  ]);

  let selected = null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (conversationId) {
    selected = await getConversationDetail(workspaceId, user.id, conversationId);
    if (selected) messages = await listMessages(workspaceId, user.id, conversationId);
  }

  return (
    <InboxClient
      workspaceId={workspaceId}
      tab={tab}
      conversations={conversations}
      metrics={metrics}
      selectedConversation={selected}
      messages={messages}
      events={(events ?? []).map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
