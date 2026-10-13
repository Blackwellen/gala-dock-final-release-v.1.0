"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Braces, CalendarDays, ExternalLink, FileText, Loader2, MapPin, MessageSquare, Paperclip, Send, Smile, Star, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/kit/client";
import { sendMessage, startConversation, markRead, contactProfile, setSavedContact, type ContactProfile } from "@/lib/messaging/actions";
import { personalise, hasTokens, TOKENS, type TokenValues } from "@/lib/messaging/tokens";
import { loadEmoji, type EmojiMeta } from "@/lib/design-kit/assets";
import { listingHref } from "@/lib/links";
import { Avatar } from "./avatar";
import "@/styles/messaging.css";

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

type Att = { path: string; name: string };
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
async function upload(file: File): Promise<Att> {
  const fd = new FormData(); fd.set("file", file); fd.set("purpose", "document");
  const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Upload failed.");
  return { path: j.path as string, name: (j.name as string) ?? file.name };
}

/** Inserts text at the caret of a textarea/input and keeps focus there. */
function insertAt(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, text: string, set: (v: string) => void) {
  if (!el) { set(value + text); return; }
  const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
  const pad = s > 0 && !/\s$/.test(value.slice(0, s)) && text.startsWith("[") ? " " : "";
  set(value.slice(0, s) + pad + text + value.slice(e));
  requestAnimationFrame(() => { el.focus(); const c = s + pad.length + text.length; el.setSelectionRange(c, c); });
}

/** Small anchored popover; closes on outside click or Escape. */
function Pop({ label, icon, children, className = "" }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className={`ms-popwrap ${className}`} ref={ref}>
    <button type="button" className="ms-tool" aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(o => !o)}>{icon}</button>
    {open && <div className="ms-pop" role="dialog" aria-label={label} data-popover>{children(() => setOpen(false))}</div>}
  </div>;
}

const GROUPS: [string, string][] = [["smileys & emotion", "😀"], ["people & body", "👋"], ["animals & nature", "🐶"], ["food & drink", "🍕"], ["travel & places", "✈️"], ["activities", "🎉"], ["objects", "💡"], ["symbols", "❤️"], ["flags", "🏳️"]];
const RECENT_KEY = "gd-emoji-recent";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };

/** Emoji picker: full Unicode set (lazy-loaded), search, categories and recently used. */
export function EmojiButton({ onPick }: { onPick: (e: string) => void }) {
  return <Pop label="Add emoji" icon={<Smile size={18} />} className="ms-emoji">{close => <EmojiPanel onPick={e => { onPick(e); close(); }} />}</Pop>;
}
function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const [all, setAll] = useState<EmojiMeta[] | null>(null), [q, setQ] = useState(""), [recent, setRecent] = useState<string[]>(readRecent), [g, setG] = useState(() => (recent.length ? "recent" : GROUPS[0]![0]));
  useEffect(() => { void loadEmoji().then(setAll).catch(() => setAll([])); }, []);
  const term = q.trim().toLowerCase();
  const shown = !all ? [] : term ? [...all.filter(e => e.n.includes(term)), ...all.filter(e => !e.n.includes(term) && e.t.some(t => t.startsWith(term)))].slice(0, 240) : g === "recent" ? recent.map(e => ({ e, n: e, g: "", t: [] })) : all.filter(e => e.g === g);
  const pick = (e: string) => { const r = [e, ...recent.filter(x => x !== e)].slice(0, 32); setRecent(r); try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* private mode */ } onPick(e); };
  return <div className="ms-emo">
    <input className="ms-emo-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search emoji" aria-label="Search emoji" autoFocus />
    {!term && <div className="ms-emo-tabs" role="tablist" aria-label="Emoji categories">
      {recent.length > 0 && <button type="button" role="tab" aria-selected={g === "recent"} className={g === "recent" ? "on" : ""} onClick={() => setG("recent")} title="Recently used">🕘</button>}
      {GROUPS.map(([id, e]) => <button key={id} type="button" role="tab" aria-selected={g === id} className={g === id ? "on" : ""} onClick={() => setG(id)} title={id}>{e}</button>)}</div>}
    <div className="ms-emo-grid">{!all ? <Loader2 size={18} className="mk-spin" /> : shown.map(e => <button key={e.e} type="button" title={e.n} aria-label={e.n} onClick={() => pick(e.e)}>{e.e}</button>)}
      {all && !shown.length && <p>No emoji match “{q}”.</p>}</div>
  </div>;
}

/** "Personalise" menu: inserts [Their name], [My name]… which are filled in when the message is sent. */
export function PersonaliseButton({ onPick, values }: { onPick: (tag: string) => void; values: TokenValues }) {
  return <Pop label="Insert personal detail" icon={<Braces size={17} />} className="ms-pers">{close => <div className="ms-pers-menu" role="menu">
    <b>Insert a detail</b><small>Filled in automatically when you send.</small>
    {TOKENS.map(t => <button key={t.key} type="button" role="menuitem" onClick={() => { onPick(t.tag); close(); }}>
      <span className="ms-tag">{t.tag}</span><small>{personalise(t.tag, values) || t.hint}</small></button>)}
  </div>}</Pop>;
}

/** Files: picker, drag-and-drop and paste. PDFs and images up to 10MB, max 10 per message. */
function useAttachments(setError: (e: string) => void) {
  const [files, setFiles] = useState<Att[]>([]), [up, setUp] = useState(0);
  const add = async (list: FileList | File[]) => {
    const fs = [...list].slice(0, 10 - files.length); if (!fs.length) return;
    setUp(n => n + fs.length);
    await Promise.all(fs.map(async f => { try { const u = await upload(f); setFiles(x => [...x, u]); } catch (err) { setError((err as Error).message); } finally { setUp(n => n - 1); } }));
  };
  return { files, setFiles, up: up > 0, add };
}
function AttachButton({ add, disabled }: { add: (f: FileList) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return <><button type="button" className="ms-tool" aria-label="Attach files" title="Attach files (PDF, PNG, JPG, WebP)" disabled={disabled} onClick={() => ref.current?.click()}><Paperclip size={18} /></button>
    <input ref={ref} type="file" hidden multiple accept={ACCEPT} aria-label="Choose files to attach" onChange={e => { const f = e.target.files; if (f?.length) add(f); e.target.value = ""; }} /></>;
}
function FileChips({ files, remove }: { files: Att[]; remove: (p: string) => void }) {
  return files.length > 0 ? <ul className="ms-files">{files.map(f => <li key={f.path}><FileText size={13} aria-hidden="true" />{f.name}
    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => remove(f.path)}><X size={12} /></button></li>)}</ul> : null;
}

export function Composer({ conversationId, asWorkspace, values }: { conversationId: string; asWorkspace?: string | null; values: TokenValues }) {
  const router = useRouter(); const [pending, start] = useTransition(); const ta = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(""), [error, setError] = useState(""), [drag, setDrag] = useState(false);
  const { files, setFiles, up, add } = useAttachments(setError);
  const send = () => start(async () => { setError(""); const r = await sendMessage(conversationId, personalise(body, values), files, asWorkspace); if (!r.ok) setError(r.error); else { setBody(""); setFiles([]); router.refresh(); } });
  const can = !pending && !up && (body.trim() || files.length);
  return <form className={`ms-compose ${drag ? "drag" : ""}`} onSubmit={e => { e.preventDefault(); if (can) send(); }}
    onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
    onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); } }}>
    <FileChips files={files} remove={p => setFiles(x => x.filter(y => y.path !== p))} />
    <div className="ms-box">
      <textarea ref={ta} value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={8000} placeholder="Write a message…" aria-label="Message"
        onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); void add(e.clipboardData.files); } }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && can) { e.preventDefault(); send(); } }} />
      <div className="ms-tools">
        <AttachButton add={f => void add(f)} disabled={up || files.length >= 10} />
        <EmojiButton onPick={e => insertAt(ta.current, body, e, setBody)} />
        <PersonaliseButton values={values} onPick={t => insertAt(ta.current, body, t, setBody)} />
        {up && <span className="ms-up"><Loader2 size={14} className="mk-spin" />Uploading…</span>}
        <span className="ms-grow" />
        <small className="ms-hint">Enter to send · Shift+Enter for a new line</small>
        <button className="ms-send" disabled={!can} aria-label="Send">{pending ? <Loader2 size={16} className="mk-spin" /> : <Send size={16} />}<span>Send</span></button>
      </div>
    </div>
    {hasTokens(body) && <p className="ms-preview"><b>They’ll see:</b> {personalise(body, values)}</p>}
    {drag && <div className="ms-dropzone">Drop files to attach</div>}
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export type Contact = { kind: "user" | "workspace"; id: string; label: string; context: string };
export function NewConversation({ contacts, asWorkspace, base, me }: { contacts: Contact[]; asWorkspace?: string | null; base: string; me: TokenValues }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const [q, setQ] = useState(""), [to, setTo] = useState<Contact | null>(null), [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const subRef = useRef<HTMLInputElement>(null), bodyRef = useRef<HTMLTextAreaElement>(null);
  const { files, setFiles, up, add } = useAttachments(setError);
  if (!open) return <button type="button" className="mk-btn primary" onClick={() => setOpen(true)}>New message</button>;
  const values: TokenValues = { ...me, them: to?.label };
  const saved = contacts.filter(c => c.context === "Saved contact");
  const list = contacts.filter(c => `${c.label} ${c.context}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const submit = () => start(async () => {
    if (!to) { setError("Choose who to message."); return; }
    const r = await startConversation({ toType: to.kind, to: to.id, subject: personalise(subject, values), body: personalise(body, values) || `📎 ${files.map(f => f.name).join(", ")}`, asWorkspace });
    if (!r.ok) { setError(r.error); return; }
    if (files.length) await sendMessage(r.data!, "", files, asWorkspace);
    setOpen(false); router.push(`${base}?c=${r.data}`);
  });
  return <form className="mk-form ms-new" aria-label="New message" onSubmit={e => { e.preventDefault(); submit(); }}>
    {to ? <div className="ms-to"><Avatar name={to.label} size={30} /><span><b>{to.label}</b><small>{to.context}</small></span><button type="button" className="mk-btn ghost" onClick={() => setTo(null)}>Change</button></div> : <>
      <label className="mk-field wide"><span>To</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contacts, suppliers, clients, team and promoters" autoFocus /></label>
      {!q && saved.length > 0 && <p className="ms-pick-head"><Star size={12} aria-hidden="true" />Saved contacts</p>}
      <ul className="ms-pick wide">{list.length ? list.map(c => <li key={`${c.kind}:${c.id}:${c.context}`}><button type="button" onClick={() => setTo(c)}><Avatar name={c.label} size={30} /><span><b>{c.label}</b><small>{c.context}</small></span></button></li>)
        : <li className="mk-note">No matching contacts. You can message suppliers, clients, teammates and promoters you work with, and anyone you’ve talked to before.</li>}</ul></>}
    <label className="mk-field wide"><span>Subject (optional)</span>
      <span className="ms-inline"><input ref={subRef} value={subject} onChange={e => setSubject(e.target.value)} maxLength={140} placeholder="e.g. Quick question about [Their name]’s availability" />
        <PersonaliseButton values={values} onPick={t => insertAt(subRef.current, subject, t, setSubject)} /></span></label>
    <div className="mk-field wide"><span>Message</span>
      <div className="ms-box"><textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={8000} aria-label="Message" placeholder="Hi [Their first name], …"
        onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); void add(e.clipboardData.files); } }} />
        <div className="ms-tools"><AttachButton add={f => void add(f)} disabled={up || files.length >= 10} />
          <EmojiButton onPick={e => insertAt(bodyRef.current, body, e, setBody)} />
          <PersonaliseButton values={values} onPick={t => insertAt(bodyRef.current, body, t, setBody)} />
          {up && <span className="ms-up"><Loader2 size={14} className="mk-spin" />Uploading…</span>}</div></div></div>
    <FileChips files={files} remove={p => setFiles(x => x.filter(y => y.path !== p))} />
    {to && (hasTokens(subject) || hasTokens(body)) && <p className="ms-preview wide"><b>They’ll see:</b> {personalise(subject, values) && <>“{personalise(subject, values)}” — </>}{personalise(body, values)}</p>}
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="mk-btn primary" disabled={pending || up || !to || (!body.trim() && !files.length)}>Send</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

/** Name in the thread header: opens a profile card with their details, links and Save contact. */
export function ProfileButton({ type, id, name, avatar, seat, children }: { type: "user" | "workspace"; id: string; name: string; avatar: string | null; seat?: string | null; children?: ReactNode }) {
  const [open, setOpen] = useState(false), [p, setP] = useState<ContactProfile | null | undefined>(undefined), [pending, start] = useTransition(), [msg, setMsg] = useState("");
  const router = useRouter();
  useEffect(() => { if (open && p === undefined) void contactProfile(type, id, seat).then(setP); }, [open, p, type, id, seat]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  const toggleSave = () => p && start(async () => { const r = await setSavedContact(type, id, p.name, !p.saved, seat); if (!r.ok) setMsg(r.error); else { setP({ ...p, saved: !p.saved }); setMsg(p.saved ? "Removed from contacts." : "Saved to contacts."); router.refresh(); } });
  return <>
    <button type="button" className="ms-who" onClick={() => setOpen(true)} aria-label={`View ${name}’s profile`}><Avatar name={name} src={avatar} size={40} /><span><b>{name}</b>{children}</span></button>
    {open && <div className="ms-prof-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="ms-prof" role="dialog" aria-modal="true" aria-label={`${name} — profile`}>
        <button type="button" className="ms-prof-x" aria-label="Close profile" onClick={() => setOpen(false)}><X size={18} /></button>
        {p === undefined ? <p className="ms-prof-load"><Loader2 size={18} className="mk-spin" />Loading profile…</p> : p === null ? <p className="ms-prof-load">This profile isn’t available.</p> : <>
          {p.cover && <div className="ms-prof-cover" style={{ backgroundImage: `url(${p.cover})` }} />}
          <div className="ms-prof-id"><Avatar name={p.name} src={p.avatar} size={72} />
            <h2>{p.name}{p.verified && <BadgeCheck size={18} className="ms-verified" aria-label="Verified" />}</h2>
            <p>{p.type === "workspace" ? (p.kind === "provider" ? "Venue & supplier business" : p.kind === "organizer" ? "Event organiser" : "Business") : "Person"}{p.since && ` · On Gala Dock since ${p.since}`}</p>
            {p.location && <p><MapPin size={13} aria-hidden="true" />{p.location}</p>}</div>
          <div className="ms-prof-actions">
            <button type="button" className={`mk-btn ${p.saved ? "ghost" : "primary"}`} disabled={pending} onClick={toggleSave}>{p.saved ? <><Star size={15} fill="currentColor" />Saved contact</> : <><UserPlus size={15} />Save contact</>}</button>
            {p.type === "workspace" && p.kind === "organizer" && <Link className="mk-btn ghost" href={`/organizers/${p.id}`} target="_blank"><ExternalLink size={14} />Public page</Link>}
          </div>
          {msg && <p className="ms-prof-msg" role="status">{msg}</p>}
          {p.about && <section><h3>About</h3><p>{p.about}</p></section>}
          {!!p.roles?.length && <section><h3>Works with</h3><p>{p.roles.join(", ")}</p></section>}
          {!!p.listings?.length && <section><h3>Listings</h3><ul>{p.listings.map(l => <li key={l.id}><Link href={listingHref(l.kind, l.slug, l.id)} target="_blank">{l.name}<ExternalLink size={12} aria-hidden="true" /></Link></li>)}</ul></section>}
          {!!p.events?.length && <section><h3>Upcoming events</h3><ul>{p.events.map(e => <li key={e.id}><Link href={`/events/${e.slug ?? e.id}`} target="_blank"><CalendarDays size={13} aria-hidden="true" />{e.name}<small>{new Date(e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></Link></li>)}</ul></section>}
          <p className="ms-prof-note"><MessageSquare size={13} aria-hidden="true" />Saved contacts appear at the top of New message, and you can always message anyone you’ve talked to before.</p>
        </>}
      </aside></div>}
  </>;
}

/** "Message" button for listing pages, bookings and team rows: opens a dialog, then starts (or reuses) the conversation and
 *  opens it in the inbox. */
export function MessageButton({ toType, to, label = "Message", subject = "", kind = "direct", listingId, eventId, itemId, asWorkspace, inbox = "/account/inbox", className = "k-btn ghost", toName, values = {} }: {
  toType: "user" | "workspace"; to: string; label?: string; subject?: string; kind?: string; listingId?: string; eventId?: string; itemId?: string; asWorkspace?: string | null; inbox?: string;
  className?: string; toName?: string; values?: TokenValues }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [body, setBody] = useState(""); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const v: TokenValues = { ...values, them: toName ?? values.them };
  const send = () => start(async () => {
    setError("");
    const r = await startConversation({ toType, to, subject: personalise(subject, v), body: personalise(body, v), kind, listingId, eventId, itemId, asWorkspace });
    if (!r.ok) setError(r.error); else { setOpen(false); setBody(""); router.push(`${inbox}?c=${r.data}`); }
  });
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}><MessageSquare size={14} aria-hidden="true" />{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={toName ? `Message ${toName}` : label} sub="Your message opens a conversation in your inbox. They’ll be notified and can reply there.">
      <form className="ms-dialog" onSubmit={e => { e.preventDefault(); if (body.trim()) send(); }}>
        {subject && <p className="ms-dialog-subj"><span>Subject</span>{personalise(subject, v)}</p>}
        <div className="ms-box"><textarea ref={ta} rows={5} value={body} onChange={e => setBody(e.target.value)} maxLength={8000} autoFocus aria-label="Message" placeholder="Hi, we’re planning… could you let us know about availability and pricing?" />
          <div className="ms-tools"><EmojiButton onPick={e => insertAt(ta.current, body, e, setBody)} /><PersonaliseButton values={v} onPick={t => insertAt(ta.current, body, t, setBody)} /></div></div>
        {error && <p className="k-error" role="alert">{error}</p>}
        <div className="k-row" style={{ justifyContent: "flex-end", gap: 8 }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="k-btn primary" disabled={pending || !body.trim()}>{pending ? <Loader2 size={15} className="mk-spin" /> : <Send size={15} />}Send message</button></div>
      </form>
    </Dialog>
  </>;
}
