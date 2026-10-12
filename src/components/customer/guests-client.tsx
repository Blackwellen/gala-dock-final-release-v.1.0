"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Send, UserPlus, MoreHorizontal, Plus, ScanLine, UserCheck, Paperclip, Image as ImageIcon, FileText, Smile, SendHorizontal, Check, CheckCheck } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { addGuest, importGuests, sendInvites, setGuestStatus, removeGuest, createTier } from "@/lib/actions/guests";
import { sendMessage, markThreadRead } from "@/lib/actions/messages";
import { CheckInScanner } from "@/components/shared/checkin-scanner";

export function GuestToolbar({ eventId, rows }: { eventId: string; rows: Record<string, string>[] }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const [add, setAdd] = useState(false); const [imp, setImp] = useState(false);
  const exportCsv = () => { const head = Object.keys(rows[0] ?? { name: "" }); const esc = (v: string) => `"${String(v).replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`; const csv = [head.join(","), ...rows.map(r => head.map(h => esc(r[h] ?? "")).join(","))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "guest-list.csv"; a.click(); toast(`Exported ${rows.length} guests`); };
  return <div className="k-row" style={{ gap: 10 }}>
    <button className="k-btn ghost gt-btn" onClick={exportCsv}><Download size={16} />Export</button>
    <button className="k-btn ghost gt-btn" disabled={pending} onClick={() => void run(() => sendInvites(eventId))}><Send size={16} />Send invites</button>
    <button className="k-btn ghost gt-btn" onClick={() => setAdd(true)}><UserPlus size={16} />Add guest</button>
    <Dialog open={add} onClose={() => setAdd(false)} title="Add a guest" sub="Dietary and accessibility notes are only visible to you and your caterer.">
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => addGuest(eventId, { ...f, plus_one: f.plus_one === "on" })); if (r.ok) setAdd(false); }}>
        <label className="k-field"><span>Name *</span><input className="k-input" name="name" required minLength={2} /></label>
        <label className="k-field"><span>Email</span><input className="k-input" name="email" type="email" /></label>
        <label className="k-field"><span>Phone</span><input className="k-input" name="phone" type="tel" /></label>
        <label className="k-field"><span>Group</span><input className="k-input" name="group_name" placeholder="e.g. Family" /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Dietary / access</span><input className="k-input" name="dietary" /></label>
        <label className="k-check"><input type="checkbox" name="plus_one" />Plus one</label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "space-between" }}><button type="button" className="k-link" onClick={() => { setAdd(false); setImp(true); }}>Import a CSV instead</button><span className="k-row" style={{ gap: 8 }}><button type="button" className="k-btn ghost" onClick={() => setAdd(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add guest</button></span></div>
      </form>
    </Dialog>
    <Dialog open={imp} onClose={() => setImp(false)} title="Import guests" sub="CSV with a header row: name, email, phone, plus_one (yes/no), group_name, dietary.">
      <input className="k-input" type="file" accept=".csv,text/csv" style={{ paddingTop: 6 }} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const text = await f.text(); const [h, ...lines] = text.split(/\r?\n/).filter(Boolean); const keys = (h ?? "").split(",").map(k => k.trim().toLowerCase()); const rows = lines.map(l => { const v = l.split(","); return Object.fromEntries(keys.map((k, i) => [k, k === "plus_one" ? /^y|true|1/i.test(v[i] ?? "") : (v[i] ?? "").trim()])); }); const r = await run(() => importGuests(eventId, rows)); if (r.ok) setImp(false); }} />
    </Dialog>
  </div>;
}
export function GuestRowMenu({ eventId, id, name }: { eventId: string; id: string; name: string }) {
  const { run } = useAction();
  return <Menu label={`Actions for ${name}`} width={190} trigger={({ toggle, open, id: m }) => <button className="k-icon-btn plain" onClick={toggle} aria-expanded={open} aria-controls={m} aria-label={`Actions for ${name}`}><MoreHorizontal size={16} /></button>}>
    {close => <>{(["confirmed", "pending", "declined"] as const).map(s => <button key={s} role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setGuestStatus(eventId, id, s)); }}>Mark {s}</button>)}<button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => sendInvites(eventId, [id])); }}>Send invite</button><div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" onClick={() => { close(); void run(() => removeGuest(eventId, id)); }}>Remove</button></>}
  </Menu>;
}
export function NewTierButton({ eventId }: { eventId: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="gt-newtier" onClick={() => setOpen(true)}><Plus size={17} />Create new ticket tier</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="New ticket tier">
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const r = await run(() => createTier(eventId, Object.fromEntries(new FormData(e.currentTarget)))); if (r.ok) setOpen(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Name</span><input className="k-input" name="name" required placeholder="e.g. Evening guest" /></label>
        <label className="k-field"><span>Price (£, 0 = free)</span><input className="k-input" name="price" type="number" min={0} step={1} defaultValue={0} /></label>
        <label className="k-field"><span>Quantity</span><input className="k-input" name="quantity" type="number" min={1} defaultValue={50} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Sales end (optional)</span><input className="k-input" name="sale_end" type="date" /></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Create tier</button></div>
      </form>
    </Dialog></>;
}
export function CheckInButtons({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState<"scan" | "manual" | null>(null);
  return <><div className="gt-ck-btns"><Link className="k-btn primary lg" href={`/account/events/${eventId}/scan`}><ScanLine size={17} />Open QR Scanner</Link><button className="k-btn outline lg" onClick={() => setOpen("manual")}><UserCheck size={17} />Manual Check-in</button></div>
    <Dialog open={!!open} onClose={() => setOpen(null)} title="Manual check-in" wide><CheckInScanner eventId={eventId} compact /></Dialog></>;
}

type Msg = { id: string; body: string; sender_name: string; from_provider: boolean; created_at: string; read_at: string | null; attachments: { name: string; type: string; size: string; thumb?: string }[] };
export function Conversation({ threadId, title, messages, myName, avatar }: { threadId: string; title: string; messages: Msg[]; myName: string; avatar: string }) {
  const { run, pending } = useAction(); const router = useRouter(); const [t, setT] = useState(""); const [tab, setTab] = useState<"msg" | "tpl">("msg"); const end = useRef<HTMLDivElement>(null); const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); void markThreadRead(threadId); }, [threadId, messages.length]);
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  const send = async () => { if (!t.trim()) { box.current?.focus(); return; } const v = t; setT(""); const r = await run(() => sendMessage(threadId, v)); if (!r.ok) setT(v); else router.refresh(); };
  const tpls = ["Could you confirm the final access time for suppliers?", "Please send over your updated quote.", "Thanks — we'd like to go ahead. What are the next steps?"];
  return <>
    <div className="cm-msgs" tabIndex={0} role="region" aria-label="Conversation messages" aria-live="polite">{messages.map(m => m.from_provider ? <div key={m.id} className="cm-in">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={avatar} alt="" className="cm-av" /><div><div className="cm-who"><b>{m.sender_name}</b><span>{fmt(m.created_at)}</span></div><div className="cm-bub">{m.body}</div>{m.attachments.length > 0 && <div className="cm-atts">{m.attachments.map(a => <div key={a.name} className="cm-att"><span className="cm-att-thumb">{a.thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumb} alt="" /> : <FileText size={18} />}</span><span><b>{a.name}</b><small>{a.type} • {a.size}</small></span><Download size={16} className="k-blue" /></div>)}</div>}</div></div>
      : <div key={m.id} className="cm-out"><span className="cm-time">{fmt(m.created_at)}</span><div className="cm-bub me">{m.body}<span className="cm-tick">{m.read_at ? <CheckCheck size={14} /> : <Check size={14} />}</span></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/gd/av-james-carter.webp" alt="" className="cm-av" /></div>)}<div ref={end} /></div>
    <div className="cm-compose"><div className="cm-ctabs"><button type="button" aria-pressed={tab === "msg"} onClick={() => setTab("msg")}>Message</button><button type="button" aria-pressed={tab === "tpl"} onClick={() => setTab("tpl")}>Templates</button></div>
      {tab === "tpl" ? <div className="cm-tpls">{tpls.map(x => <button key={x} onClick={() => { setT(x); setTab("msg"); }}>{x}</button>)}</div> : <textarea ref={box} value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={`Type a message to ${title}...`} aria-label="Message" maxLength={5000} />}
      <div className="k-between"><div className="k-row" style={{ gap: 14 }}><button className="k-icon-btn plain" aria-label="Attach file" title="Attachments open with the file service"><Paperclip size={18} /></button><button className="k-icon-btn plain" aria-label="Attach image"><ImageIcon size={18} /></button><button className="k-icon-btn plain" aria-label="Attach document"><FileText size={18} /></button><span className="cm-ref">Booking reference</span></div><div className="k-row" style={{ gap: 12 }}><Smile size={20} className="k-muted" /><button className="k-btn primary cm-send" disabled={pending} onClick={() => void send()}><SendHorizontal size={16} />Send</button></div></div></div>
  </>;
}
