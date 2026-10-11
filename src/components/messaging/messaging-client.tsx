"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, startConversation, markRead } from "@/lib/messaging/actions";

/** Live updates: Supabase Realtime (RLS-filtered) with a slow polling fallback; marks the thread read while open. */
export function LiveThread({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useEffect(() => {
    void markRead(conversationId);
    const sb = createClient();
    const ch = sb.channel(`conv:${conversationId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_messages", filter: `conversation_id=eq.${conversationId}` },
      () => { void markRead(conversationId); router.refresh(); }).subscribe();
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30_000);
    return () => { void sb.removeChannel(ch); clearInterval(t); };
  }, [conversationId, router]);
  return null;
}

/** Scrolls the thread to the newest message on load and when new messages arrive. */
export function ScrollToEnd({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "end" }); }, [count]);
  return <div ref={ref} />;
}

async function upload(file: File) {
  const fd = new FormData(); fd.set("file", file); fd.set("purpose", "document");
  const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Upload failed.");
  return { path: j.path as string, name: (j.name as string) ?? file.name };
}

export function Composer({ conversationId, asWorkspace }: { conversationId: string; asWorkspace?: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [body, setBody] = useState(""), [files, setFiles] = useState<{ path: string; name: string }[]>([]), [error, setError] = useState(""), [up, setUp] = useState(false);
  const send = () => start(async () => { setError(""); const r = await sendMessage(conversationId, body, files, asWorkspace); if (!r.ok) setError(r.error); else { setBody(""); setFiles([]); router.refresh(); } });
  return <form className="ms-compose" onSubmit={e => { e.preventDefault(); send(); }}>
    {files.length > 0 && <ul className="ms-files">{files.map(f => <li key={f.path}>{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(x => x.filter(y => y.path !== f.path))}><X size={12} /></button></li>)}</ul>}
    <div className="ms-row">
      <label className="ms-attach" aria-label="Attach a file">{up ? <Loader2 size={16} className="mk-spin" /> : <Paperclip size={16} />}
        <input type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" disabled={up || files.length >= 10}
          onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setUp(true); try { const u = await upload(f); setFiles(x => [...x, u]); } catch (err) { setError((err as Error).message); } finally { setUp(false); } }} /></label>
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={8000} placeholder="Write a message…" aria-label="Message"
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && (body.trim() || files.length)) { e.preventDefault(); send(); } }} />
      <button className="mk-btn primary" disabled={pending || up || (!body.trim() && !files.length)} aria-label="Send">{pending ? <Loader2 size={15} className="mk-spin" /> : <Send size={15} />}</button>
    </div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export type Contact = { kind: "user" | "workspace"; id: string; label: string; context: string };
export function NewConversation({ contacts, asWorkspace, base }: { contacts: Contact[]; asWorkspace?: string | null; base: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const [q, setQ] = useState(""), [to, setTo] = useState<Contact | null>(null);
  if (!open) return <button type="button" className="mk-btn primary" onClick={() => setOpen(true)}>New message</button>;
  const list = contacts.filter(c => `${c.label} ${c.context}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return <form className="mk-form ms-new" aria-label="New message" action={f => start(async () => {
    if (!to) { setError("Choose who to message."); return; }
    const r = await startConversation({ toType: to.kind, to: to.id, subject: String(f.get("subject") ?? ""), body: String(f.get("body") ?? ""), asWorkspace });
    if (!r.ok) setError(r.error); else { setOpen(false); router.push(`${base}?c=${r.data}`); }
  })}>
    {to ? <p className="mk-line wide"><span className="mk-tag blue">{to.label}</span><span className="mk-note">{to.context}</span><button type="button" className="mk-btn ghost" onClick={() => setTo(null)}>Change</button></p> : <>
      <label className="mk-field wide"><span>To</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your suppliers, clients, team and promoters" autoFocus /></label>
      <ul className="ms-pick wide">{list.length ? list.map(c => <li key={`${c.kind}:${c.id}:${c.context}`}><button type="button" onClick={() => setTo(c)}><b>{c.label}</b><small>{c.context}</small></button></li>)
        : <li className="mk-note">No matching contacts. You can message suppliers, clients, teammates and promoters you work with.</li>}</ul></>}
    <label className="mk-field wide"><span>Subject (optional)</span><input name="subject" maxLength={140} /></label>
    <label className="mk-field wide"><span>Message</span><textarea name="body" rows={3} required maxLength={8000} /></label>
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="mk-btn primary" disabled={pending || !to}>Send</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

/** "Message" button for listing pages, bookings and team rows: opens (or reuses) a conversation with that party. */
export function MessageButton({ toType, to, label = "Message", subject = "", kind = "direct", listingId, eventId, itemId, asWorkspace, inbox = "/account/inbox" }: {
  toType: "user" | "workspace"; to: string; label?: string; subject?: string; kind?: string; listingId?: string; eventId?: string; itemId?: string; asWorkspace?: string | null; inbox?: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [body, setBody] = useState(""); const [pending, start] = useTransition(); const [error, setError] = useState("");
  if (!open) return <button type="button" className="mk-btn ghost" onClick={() => setOpen(true)}>{label}</button>;
  return <form className="mk-form" aria-label={label} onSubmit={e => { e.preventDefault(); start(async () => {
    const r = await startConversation({ toType, to, subject, body, kind, listingId, eventId, itemId, asWorkspace });
    if (!r.ok) setError(r.error); else router.push(`${inbox}?c=${r.data}`);
  }); }}>
    <label className="mk-field wide"><span>Message</span><textarea rows={3} value={body} onChange={e => setBody(e.target.value)} required maxLength={8000} autoFocus /></label>
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="mk-btn primary" disabled={pending || !body.trim()}>Send</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}
