import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { LiveThread, Composer, NewConversation, ScrollToEnd, type Contact } from "./messaging-client";
import "@/styles/marketplace.css";
import "@/styles/messaging.css";

type Conv = { id: string; kind: string; subject: string; last_message_at: string; last_message_preview: string; unread: boolean; counterpart: string | null };
type Msg = { id: string; sender_id: string | null; sender_workspace_id: string | null; sender_name: string; body: string; attachments: { path: string; name: string }[]; created_at: string };
const when = (iso: string) => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const KIND: Record<string, string> = { direct: "Direct", enquiry: "Enquiry", event: "Event", booking: "Booking", team: "Team", support: "Support" };

/**
 * Unified inbox for every portal (user addition): a personal seat, or a workspace seat (organizer/provider) where the whole team
 * shares the workspace's conversations. Same component, same data rules — RLS decides what each person sees.
 */
export async function Inbox({ seat, base, selected, title = "Messages" }: { seat: string | null; base: string; selected?: string; title?: string }) {
  const sb = await createClient();
  const db = untyped(sb as never);
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: convs }, { data: contacts }] = await Promise.all([
    sb.rpc("my_conversations" as never, { p_workspace: seat, p_limit: 100 } as never),
    sb.rpc("my_contacts" as never, { p_workspace: seat } as never),
  ]);
  const C = (convs ?? []) as Conv[];
  const active = selected && /^[0-9a-f-]{36}$/i.test(selected) ? selected : C[0]?.id;
  const [{ data: conv }, { data: msgs }, { data: parts }] = active ? await Promise.all([
    db.from("conversations").select("id,kind,subject,event_id").eq("id", active).maybeSingle(),
    db.from("conversation_messages").select("id,sender_id,sender_workspace_id,sender_name,body,attachments,created_at").eq("conversation_id", active).is("deleted_at", null).order("created_at").limit(300),
    db.from("conversation_participants").select("label,user_id,workspace_id").eq("conversation_id", active),
  ]) : [{ data: null }, { data: [] }, { data: [] }];
  const mine = (m: Msg) => (seat ? m.sender_workspace_id === seat : m.sender_id === user?.id && !m.sender_workspace_id);
  const seen = new Set<string>();
  const contactList = ((contacts ?? []) as Contact[]).filter(c => { const k = `${c.kind}:${c.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return <div className="ms">
    <aside className="ms-list" aria-label="Conversations">
      <div className="ms-list-head"><h1>{title}</h1><NewConversation contacts={contactList} asWorkspace={seat} base={base} /></div>
      {!C.length ? <p className="mk-empty">No conversations yet.</p> : <ul>{C.map(c => <li key={c.id}><Link href={`${base}?c=${c.id}`} className={`${c.id === active ? "on" : ""} ${c.unread ? "unread" : ""}`} aria-current={c.id === active ? "true" : undefined}>
        <span className="ms-top"><b>{c.counterpart || "Conversation"}</b><time>{when(c.last_message_at)}</time></span>
        <span className="ms-sub">{c.subject ? `${c.subject} · ` : ""}{c.last_message_preview}</span>
        <span className="ms-kind">{KIND[c.kind] ?? c.kind}{c.unread && <i aria-label="Unread" />}</span></Link></li>)}</ul>}
    </aside>
    <section className="ms-thread" aria-label="Conversation">
      {!conv ? <p className="mk-empty">Select a conversation, or start a new one.</p> : <>
        <header className="ms-thread-head"><div><h2>{((parts ?? []) as { label: string; user_id: string | null; workspace_id: string | null }[]).filter(p => (seat ? p.workspace_id !== seat : p.user_id !== user?.id)).map(p => p.label).join(", ") || "Conversation"}</h2>
          {conv.subject && <p>{conv.subject}</p>}</div>
          {conv.event_id && <span className="mk-tag grey">{KIND[conv.kind]}</span>}</header>
        <ol className="ms-msgs">{((msgs ?? []) as Msg[]).map(m => <li key={m.id} className={mine(m) ? "me" : ""}>
          <div className="ms-bubble">{!mine(m) && <b>{m.sender_name}</b>}{m.body && <p>{m.body}</p>}
            {m.attachments?.length > 0 && <div className="ms-att">{m.attachments.map(a => <a key={a.path} href={`/api/messages/${conv.id}/files?path=${encodeURIComponent(a.path)}`} target="_blank" rel="noopener noreferrer"><FileText size={13} aria-hidden="true" />{a.name}</a>)}</div>}
            <time dateTime={m.created_at}>{when(m.created_at)}</time></div></li>)}</ol>
        <ScrollToEnd count={(msgs ?? []).length} />
        <Composer conversationId={conv.id} asWorkspace={seat} />
        <LiveThread conversationId={conv.id} />
      </>}
    </section>
  </div>;
}
