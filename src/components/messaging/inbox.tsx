import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { LiveThread, Composer, NewConversation, ScrollToEnd, ProfileButton, type Contact } from "./messaging-client";
import { Avatar } from "./avatar";
import { personalise } from "@/lib/messaging/tokens";
import "@/styles/marketplace.css";
import "@/styles/messaging.css";

type Conv = { id: string; kind: string; subject: string; last_message_at: string; last_message_preview: string; unread: boolean; counterpart: string | null;
  counterpart_type: "user" | "workspace" | null; counterpart_id: string | null; counterpart_avatar: string | null };
type Msg = { id: string; sender_id: string | null; sender_workspace_id: string | null; sender_name: string; body: string; attachments: { path: string; name: string }[]; created_at: string };
const when = (iso: string) => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const KIND: Record<string, string> = { direct: "Direct", enquiry: "Enquiry", event: "Event", booking: "Booking", team: "Team", support: "Support" };
const IMG = /\.(png|jpe?g|webp)$/i;

/**
 * Unified inbox for every portal (user addition): a personal seat, or a workspace seat (organizer/provider) where the whole team
 * shares the workspace's conversations. Same component, same data rules — RLS decides what each person sees.
 */
export async function Inbox({ seat, base, selected, title = "Messages" }: { seat: string | null; base: string; selected?: string; title?: string }) {
  const sb = await createClient();
  const db = untyped(sb as never);
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: convs }, { data: contacts }, { data: prof }, { data: ws }] = await Promise.all([
    sb.rpc("my_conversations" as never, { p_workspace: seat, p_limit: 100 } as never),
    sb.rpc("my_contacts" as never, { p_workspace: seat } as never),
    db.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle(),
    seat ? db.from("workspaces").select("name").eq("id", seat).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const C = (convs ?? []) as Conv[];
  const active = selected && /^[0-9a-f-]{36}$/i.test(selected) ? selected : C[0]?.id;
  const [{ data: conv }, { data: msgs }] = active ? await Promise.all([
    db.from("conversations").select("id,kind,subject,event_id").eq("id", active).maybeSingle(),
    db.from("conversation_messages").select("id,sender_id,sender_workspace_id,sender_name,body,attachments,created_at").eq("conversation_id", active).is("deleted_at", null).order("created_at").limit(300),
  ]) : [{ data: null }, { data: [] }];
  const cur = C.find(c => c.id === active);
  const mine = (m: Msg) => (seat ? m.sender_workspace_id === seat : m.sender_id === user?.id && !m.sender_workspace_id);
  const seen = new Set<string>();
  const rank = (c: Contact) => (c.context === "Saved contact" ? 0 : c.context === "Conversation" ? 1 : 2);
  const contactList = ((contacts ?? []) as Contact[]).sort((a, z) => rank(a) - rank(z) || a.label.localeCompare(z.label)).filter(c => { const k = `${c.kind}:${c.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const me = { me: (prof as { full_name?: string } | null)?.full_name || user?.email?.split("@")[0] || "", business: (ws as { name?: string } | null)?.name ?? "" };
  const them = cur?.counterpart || "Conversation";
  const file = (p: string) => `/api/messages/${active}/files?path=${encodeURIComponent(p)}`;
  return <div className="ms">
    <aside className="ms-list" aria-label="Conversations">
      <div className="ms-list-head"><h1>{title}</h1><NewConversation contacts={contactList} asWorkspace={seat} base={base} me={me} /></div>
      {!C.length ? <p className="mk-empty">No conversations yet.</p> : <ul>{C.map(c => <li key={c.id}><Link href={`${base}?c=${c.id}`} className={`${c.id === active ? "on" : ""} ${c.unread ? "unread" : ""}`} aria-current={c.id === active ? "true" : undefined}>
        <Avatar name={c.counterpart || "?"} src={c.counterpart_avatar} size={40} />
        <span className="ms-li">
          <span className="ms-top"><b>{c.counterpart || "Conversation"}</b><time>{when(c.last_message_at)}</time></span>
          {c.subject && <span className="ms-subj">{personalise(c.subject, { them: c.counterpart ?? "" })}</span>}
          <span className="ms-sub">{c.last_message_preview}</span>
          <span className="ms-kind">{KIND[c.kind] ?? c.kind}{c.unread && <i aria-label="Unread" />}</span></span></Link></li>)}</ul>}
    </aside>
    <section className="ms-thread" aria-label="Conversation">
      {!conv ? <p className="mk-empty">Select a conversation, or start a new one.</p> : <>
        <header className="ms-thread-head">
          {cur?.counterpart_type && cur.counterpart_id
            ? <ProfileButton type={cur.counterpart_type} id={cur.counterpart_id} name={them} avatar={cur.counterpart_avatar} seat={seat}>{conv.subject && <small>{personalise(conv.subject, { them })}</small>}</ProfileButton>
            : <div className="ms-who"><Avatar name={them} size={40} /><span><b>{them}</b>{conv.subject && <small>{personalise(conv.subject, { them })}</small>}</span></div>}
          <span className="mk-tag grey">{KIND[conv.kind] ?? conv.kind}</span></header>
        <ol className="ms-msgs">{((msgs ?? []) as Msg[]).map((m, i, all) => {
          const own = mine(m), first = i === 0 || mine(all[i - 1]!) !== own || all[i - 1]!.sender_name !== m.sender_name;
          const imgs = (m.attachments ?? []).filter(a => IMG.test(a.path)), docs = (m.attachments ?? []).filter(a => !IMG.test(a.path));
          return <li key={m.id} className={`${own ? "me" : "them"} ${first ? "first" : ""}`}>
            {!own && (first ? <Avatar name={m.sender_name || them} src={cur?.counterpart_avatar} size={30} /> : <span className="ms-av-gap" />)}
            <div className="ms-bubble">{!own && first && <b className="ms-from">{m.sender_name}</b>}{m.body && <p>{m.body}</p>}
              {imgs.length > 0 && <div className="ms-imgs">{imgs.map(a => <a key={a.path} href={file(a.path)} target="_blank" rel="noopener noreferrer" title={a.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${file(a.path)}&view=1`} alt={a.name} loading="lazy" /></a>)}</div>}
              {docs.length > 0 && <div className="ms-att">{docs.map(a => <a key={a.path} href={file(a.path)} target="_blank" rel="noopener noreferrer"><FileText size={14} aria-hidden="true" />{a.name}</a>)}</div>}
              <time dateTime={m.created_at}>{when(m.created_at)}</time></div></li>;
        })}</ol>
        <ScrollToEnd count={(msgs ?? []).length} />
        <Composer conversationId={conv.id} asWorkspace={seat} values={{ ...me, them }} />
        <LiveThread conversationId={conv.id} />
      </>}
    </section>
  </div>;
}
