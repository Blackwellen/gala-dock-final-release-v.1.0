import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import "@/styles/provider-misc.css";
import { Avatar, Thumb, Chip } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { day, time } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { one, isUuid } from "@/lib/workspace/db";
import { sendThreadMessage } from "../actions";

export const metadata: Metadata = { title: "Messages" };

export default async function ThreadPage(props: PageProps<"/provider/messages/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { db } = await getProvider();
  // RLS limits threads to listings in workspaces the user belongs to.
  const thread = await one<{ id: string; title: string; subtitle: string; image: string; build_item_id: string | null; response_due_at: string | null;
    messages: { id: string; sender_name: string; body: string; from_provider: boolean; created_at: string; read_at: string | null }[] }>(
    db.from("threads").select("id,title,subtitle,image,build_item_id,response_due_at,messages(id,sender_name,body,from_provider,created_at,read_at)").eq("id", id).maybeSingle());
  if (!thread) notFound();
  if (thread.messages.some(m => !m.from_provider && !m.read_at)) await db.rpc("provider_mark_thread_read", { p_thread: id });
  const messages = [...thread.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return <div className="pm">
    <Link href={thread.build_item_id ? `/provider/opportunities/${thread.build_item_id}` : "/provider/opportunities"} className="ws-back"><ArrowLeft aria-hidden="true" />Back to opportunity</Link>
    <header className="pm-head"><Thumb src={thread.image} w={48} h={48} /><div><h1>{thread.title}</h1><p>{thread.subtitle}</p></div>
      {thread.response_due_at && <Chip tone="amber">Reply due {day(thread.response_due_at, { weekday: "short", day: "numeric", month: "short" })} {time(thread.response_due_at)}</Chip>}</header>
    <section className="ws-panel pm-thread" aria-label="Conversation">
      <ol>{messages.map(m => <li key={m.id} className={m.from_provider ? "mine" : ""}><Avatar name={m.sender_name} size={30} />
        <div><b>{m.sender_name}</b><p>{m.body}</p><time>{day(m.created_at, { day: "numeric", month: "short" })} · {time(m.created_at)}</time></div></li>)}</ol>
      <ActionForm action={sendThreadMessage.bind(null, id)} className="pm-compose" resetOnSuccess>
        <label className="sr-only" htmlFor="pm-body">Reply</label>
        <textarea id="pm-body" name="body" rows={3} placeholder="Write a reply…" required />
        <button className="ws-btn primary"><Send aria-hidden="true" />Send</button>
      </ActionForm>
    </section>
  </div>;
}
