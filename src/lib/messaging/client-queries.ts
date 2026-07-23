"use server";

// Server Action wrappers around the read-only query layer so client
// components (the Gala Copilot panel, which is mounted globally and cannot
// use Server Components) can fetch canonical conversation/message data
// without a dedicated API route per query.

import { requireWorkspace } from "@/lib/workspace";
import { getConversationDetail, getInboxMetrics, listConversations, listMessages } from "./queries";
import type { InboxTab } from "./types";

export async function fetchConversationsForPanel(tab: InboxTab, search?: string) {
  const { workspaceId, user } = await requireWorkspace();
  const [conversations, metrics] = await Promise.all([
    listConversations(workspaceId, user.id, { tab, search }),
    getInboxMetrics(workspaceId, user.id),
  ]);
  return { conversations, metrics, workspaceId };
}

export async function fetchConversationForPanel(conversationId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const conversation = await getConversationDetail(workspaceId, user.id, conversationId);
  if (!conversation) return null;
  const messages = await listMessages(workspaceId, user.id, conversationId);
  return { conversation, messages, workspaceId };
}
