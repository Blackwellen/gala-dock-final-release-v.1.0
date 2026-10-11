import "server-only";
import { rows, count } from "@/lib/workspace/db";
import type { ProviderContext } from "./context";

/** Live counts and widget contents for the Provider shell. All reads are RLS-scoped. */
export async function providerShellData(ctx: ProviderContext) {
  const { db, workspace, userId } = ctx;
  const listings = await rows<{ id: string }>(db.from("listings").select("id").eq("workspace_id", workspace.id));
  const ids = listings.map(l => l.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [opportunities, bookings, threads, notes, unreadNotes] = await Promise.all([
    count(db.from("build_items").select("id", { count: "exact", head: true }).in("listing_id", ids.length ? ids : none).in("status", ["sent", "awaiting", "clarification"])),
    count(db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["held", "confirmed"]).gte("starts_at", new Date().toISOString())),
    rows<{ id: string; title: string; subtitle: string; messages: { body: string; read_at: string | null; from_provider: boolean; created_at: string }[] }>(
      db.from("threads").select("id,title,subtitle,messages(body,read_at,from_provider,created_at)").in("listing_id", ids.length ? ids : none).order("updated_at", { ascending: false }).limit(6)),
    rows<{ id: string; title: string; body: string; link: string; read_at: string | null }>(db.from("notifications").select("id,title,body,link,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6)),
    count(db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)),
  ]);
  let unreadMessages = 0;
  const messages = threads.map(t => {
    const inbound = (t.messages ?? []).filter(m => !m.from_provider);
    const unread = inbound.filter(m => !m.read_at).length;
    unreadMessages += unread;
    const last = [...(t.messages ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return { id: t.id, title: t.title, body: last?.body.slice(0, 90) ?? t.subtitle, href: `/provider/messages/${t.id}`, unread: unread > 0 };
  });
  return {
    counts: { opportunities, bookings, messages: unreadMessages, notifications: unreadNotes },
    messages,
    notifications: notes.map(n => ({ id: n.id, title: n.title, body: n.body, href: n.link || "/provider", unread: !n.read_at })),
  };
}
