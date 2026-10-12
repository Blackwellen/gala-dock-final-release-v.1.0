import "server-only";
import { personalise } from "./tokens";

export type RecentConversation = { id: string; name: string; avatar: string | null; subject: string; preview: string; at: string; unread: boolean; href: string };
type Row = { id: string; subject: string; last_message_at: string; last_message_preview: string; unread: boolean; counterpart: string | null; counterpart_avatar: string | null };

/** Latest conversations for a top-bar dropdown — who it's with, their picture, and a link straight into the inbox. */
export async function recentConversations(supabase: { rpc: (fn: never, args: never) => PromiseLike<{ data: unknown }> }, seat: string | null, inbox: string, limit = 6) {
  const { data } = await supabase.rpc("my_conversations" as never, { p_workspace: seat, p_limit: limit } as never);
  return ((data ?? []) as Row[]).map((c): RecentConversation => ({ id: c.id, name: c.counterpart || "Conversation", avatar: c.counterpart_avatar, subject: personalise(c.subject, { them: c.counterpart ?? "" }),
    preview: c.last_message_preview, at: c.last_message_at, unread: c.unread, href: `${inbox}?c=${c.id}` }));
}
