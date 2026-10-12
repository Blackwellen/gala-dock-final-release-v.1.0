import "server-only";
import { rows, count } from "@/lib/workspace/db";
import type { ProviderContext } from "./context";
import { recentConversations } from "@/lib/messaging/recent";

/** Live counts and widget contents for the Provider shell. All reads are RLS-scoped. */
export async function providerShellData(ctx: ProviderContext) {
  const { db, workspace, userId } = ctx;
  const listings = await rows<{ id: string }>(db.from("listings").select("id").eq("workspace_id", workspace.id));
  const ids = listings.map(l => l.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [opportunities, bookings, messages, notes, unreadNotes] = await Promise.all([
    count(db.from("build_items").select("id", { count: "exact", head: true }).in("listing_id", ids.length ? ids : none).in("status", ["sent", "awaiting", "clarification"])),
    count(db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["held", "confirmed"]).gte("starts_at", new Date().toISOString())),
    recentConversations(db as never, workspace.id, "/provider/inbox"),
    rows<{ id: string; title: string; body: string; link: string; read_at: string | null }>(db.from("notifications").select("id,title,body,link,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6)),
    count(db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)),
  ]);
  return {
    counts: { opportunities, bookings, messages: messages.filter(m => m.unread).length, notifications: unreadNotes },
    messages,
    notifications: notes.map(n => ({ id: n.id, title: n.title, body: n.body, href: n.link || "/provider", unread: !n.read_at })),
  };
}
