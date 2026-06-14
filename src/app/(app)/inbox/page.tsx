import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { loadMessages } from "./data";
import { buildThreadSummaries } from "./inbox-utils";
import { InboxClient, type InboxMetrics } from "./InboxClient";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const messages = await loadMessages(supabase, workspaceId);
  const threads = buildThreadSummaries(messages);

  // Event options for the compose modal (link a new conversation to an event).
  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const metrics: InboxMetrics = {
    conversations: threads.length,
    unread: messages.filter((m) => !m.isRead).length,
    clientThreads: threads.filter((t) => t.category === "client").length,
    internalThreads: threads.filter((t) => t.category === "internal").length,
  };

  return (
    <InboxClient
      threads={threads}
      metrics={metrics}
      events={(events ?? []).map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
