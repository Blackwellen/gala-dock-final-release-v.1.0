import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { loadMessages } from "../data";
import { ThreadClient } from "./ThreadClient";

export const metadata = { title: "Conversation" };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const messages = await loadMessages(supabase, workspaceId, { threadId });
  if (messages.length === 0) notFound();

  // Mark the thread read on open (only touches rows that are currently unread).
  // Done inline rather than via the action helper to avoid revalidatePath
  // during render.
  if (messages.some((m) => !m.isRead)) {
    await supabase
      .from("communications")
      .update({ is_read: true })
      .eq("workspace_id", workspaceId)
      .eq("thread_id", threadId)
      .eq("is_read", false);
    for (const m of messages) m.isRead = true;
  }

  // Chronological order (oldest first) for the message timeline.
  const ordered = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return <ThreadClient threadId={threadId} messages={ordered} />;
}
