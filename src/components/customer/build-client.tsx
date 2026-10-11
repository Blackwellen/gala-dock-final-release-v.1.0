"use client";
import Link from "next/link";
import { replaceWith } from "@/lib/actions/build-extra";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, ExternalLink, CalendarCog, Copy, XCircle, Plus, Search, Trash2, Clock, Star, ArrowRight, AlertTriangle, Check, Repeat, Shield } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { addToBuild, removeFromBuild, requestQuote, holdItem, setItemRole, dateChangeImpact, changeEventDate, type DateImpact } from "@/lib/actions/build";
import { duplicateMyEvent } from "@/lib/actions/events";

export function HeaderMenu({ id, name }: { id: string; name: string }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const [dateOpen, setDateOpen] = useState(false); const [d, setD] = useState(""); const [impact, setImpact] = useState<DateImpact | null>(null);
  return <>
    <button className="k-btn primary ce-btn" onClick={async () => { const url = `${location.origin}/account/events/${id}`; try { if (navigator.share) await navigator.share({ title: name, url }); else { await navigator.clipboard.writeText(url); toast("Link copied — only people you invite can open it"); } } catch { /* cancelled */ } }}>Share Event <ExternalLink size={15} /></button>
    <Menu label="More" width={220} trigger={({ toggle, open, id: mid }) => <button className="k-icon-btn ce-more" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label="More actions"><MoreHorizontal size={18} /></button>}>
      {close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); setDateOpen(true); setImpact(null); }}><CalendarCog size={15} />Change date</button>
        <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => duplicateMyEvent(id)); }}><Copy size={15} />Duplicate</button>
        <Link role="menuitem" className="k-menu-item k-red" href="/account/events" onClick={close}><XCircle size={15} />Cancel from My Events</Link></>}
    </Menu>
    <Dialog open={dateOpen} onClose={() => setDateOpen(false)} title="Change event date" sub="We'll check what this affects before anything changes.">
      <div className="k-col" style={{ gap: 12 }}>
        <label className="k-field"><span>New date</span><input className="k-input" type="date" value={d} onChange={async e => { setD(e.target.value); setImpact(null); if (e.target.value) { const r = await dateChangeImpact(id, e.target.value); if (r.ok) setImpact(r.data ?? []); } }} /></label>
        {impact && (impact.length ? <div className="k-notice amber"><AlertTriangle size={15} className="k-amber" /><ul style={{ margin: 0, paddingLeft: 16 }}>{impact.map(i => <li key={i.title} className="k-small"><b>{i.title}</b> — {i.note}</li>)}</ul></div> : <div className="k-notice green"><Check size={15} className="k-green" />No bookings are affected.</div>)}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setDateOpen(false)}>Cancel</button><button className="k-btn primary" disabled={!d || !impact || pending} onClick={async () => { const r = await run(() => changeEventDate(id, d)); if (r.ok) setDateOpen(false); }}>Change date</button></div>
      </div>
    </Dialog>
  </>;
}

type Item = { id: string; title: string; status: string; role: string; listing_id: string | null; category?: string };
export function ItemCta({ eventId, it, label, variant = "soft" }: { eventId: string; it: Item; label: string; variant?: "soft" | "primary" }) {
  const { run, pending } = useAction(); const router = useRouter(); const [note, setNote] = useState(""); const [open, setOpen] = useState(false);
  const act = () => {
    if (["suggested", "draft", "expired", "declined"].includes(it.status)) { setOpen(true); return; }
    if (["quoted", "available", "held"].includes(it.status)) { router.push(`/account/events/${eventId}/book?step=2&item=${it.id}`); return; }
    router.push(`/account/events/${eventId}/messages?listing=${it.listing_id ?? ""}`);
  };
  return <><button className={`k-btn ${variant} cb-cta`} disabled={pending} onClick={act}>{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Request a quote from ${it.title}`} sub="This sends an enquiry — nothing is booked or charged. They have 48 hours to respond.">
      <div className="k-col" style={{ gap: 12 }}><label className="k-field"><span>Anything they should know? (optional)</span><textarea className="k-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={1500} placeholder="Dietary needs, style, timings…" /></label>
        <div className="k-row" style={{ justifyContent: "space-between" }}><Link className="k-link" href={`/account/events/${eventId}/book?step=1&item=${it.id}`}>Add full requirements, hold or standby <ArrowRight size={12} /></Link><span className="k-row" style={{ gap: 8 }}><button className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending} onClick={async () => { const r = await run(() => requestQuote(eventId, it.id, note)); if (r.ok) setOpen(false); }}>Send request</button></span></div></div>
    </Dialog></>;
}
export function ItemMenu({ eventId, it, href }: { eventId: string; it: Item; href?: string }) {
  const { run, pending } = useAction(); const [hold, setHold] = useState(false);
  const committed = ["confirmed", "held", "fulfilled"].includes(it.status);
  return <>
    <Menu label={`Options for ${it.title}`} width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn cb-dots" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Options for ${it.title}`}><MoreHorizontal size={16} /></button>}>
      {close => <>
        {href && <Link role="menuitem" className="k-menu-item" href={href} onClick={close}>View provider</Link>}
        <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/messages?listing=${it.listing_id ?? ""}`} onClick={close}>Message provider</Link>
        {["suggested", "draft", "expired", "declined"].includes(it.status) && <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => requestQuote(eventId, it.id)); }}>Request quote</button>}
        {["quoted", "available"].includes(it.status) && <button role="menuitem" className="k-menu-item" onClick={() => { close(); setHold(true); }}><Clock size={14} />Hold while I decide</button>}
        {["quoted", "available", "held"].includes(it.status) && <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/book?step=2&item=${it.id}`} onClick={close}><Check size={14} />Book</Link>}
        <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/build?cat=${it.category ?? ""}&replace=${it.id}`} onClick={close}><Repeat size={14} />Find a replacement</Link>
        {!committed && it.role !== "backup" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setItemRole(eventId, it.id, "backup")); }}><Shield size={14} />Keep as backup</button>}
        {it.role !== "primary" && !committed && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setItemRole(eventId, it.id, "primary")); }}>Make main choice</button>}
        <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" disabled={committed} title={committed ? "Cancel confirmed bookings from Manage booking" : ""} onClick={() => { close(); void run(() => removeFromBuild(eventId, it.id)); }}><Trash2 size={14} />{committed ? "Booked — use Manage booking" : "Remove option"}</button></>}
    </Menu>
    <Dialog open={hold} onClose={() => setHold(false)} title={`Hold ${it.title}`} sub="A conditional hold reserves them briefly. It expires automatically if you don't book.">
      <div className="k-grid k-g4" style={{ gap: 8 }}>{[12, 24, 48, 72].map(h => <button key={h} className="k-btn outline" disabled={pending} onClick={async () => { const r = await run(() => holdItem(eventId, it.id, h)); if (r.ok) setHold(false); }}>{h} hours</button>)}</div>
    </Dialog>
  </>;
}

type L = { id: string; name: string; image: string; rating: number; review_count: number; price_from: number | null; price_unit: string; location: string; category: string };
export function AddProviderDialog({ eventId, category, label, listings, trigger, replaceId, initialOpen = false }: { eventId: string; category: string; label: string; listings: L[]; trigger: "button" | "tile" | "link"; replaceId?: string; initialOpen?: boolean }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(initialOpen); const [q, setQ] = useState("");
  const shown = listings.filter(l => !q || `${l.name} ${l.category} ${l.location}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return <>
    {trigger === "button" ? <button className="k-btn outline lg" onClick={() => setOpen(true)}><Plus size={16} />{label}</button> : trigger === "tile" ? <button className="cb-add-tile" onClick={() => setOpen(true)}><Plus size={16} /></button> : <button className="k-link" onClick={() => setOpen(true)}>{label}</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={label} sub={replaceId ? "Your current option is kept as a backup. Nothing is booked until you confirm." : "Add options to compare. Nothing is booked until you confirm."} wide>
      <div className="k-input-icon" style={{ marginBottom: 12 }}><Search size={15} /><input className="k-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search providers…" aria-label="Search providers" /></div>
      <div className="cb-pick">{shown.map(l => <div key={l.id} className="cb-pick-row">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image || "/assets/gd/covers/summer-sessions.webp"} alt="" /><div className="k-grow"><b>{l.name}</b><div className="k-xs k-muted"><Star size={10} fill="#f59e0b" color="#f59e0b" /> {l.rating.toFixed(1)} ({l.review_count}) · {l.category} · {l.location}</div></div><b className="k-small">{l.price_from != null ? `From £${Number(l.price_from).toLocaleString()}` : "On request"}<div className="k-xs k-muted" style={{ fontWeight: 400 }}>{l.price_unit}</div></b><button className="k-btn primary sm" disabled={pending} onClick={async () => { const r = await run(() => replaceId ? replaceWith(eventId, replaceId, l.id, category) : addToBuild(eventId, l.id, category)); if (r.ok) setOpen(false); }}>{replaceId ? "Choose" : "Add"}</button></div>)}{!shown.length && <p className="k-small">No providers match.</p>}</div>
      <Link className="k-link" href={`/discover?tab=${category === "venue" ? "venues" : "services"}&results=1`} style={{ marginTop: 10 }}>Browse all on Discover <ArrowRight size={12} /></Link>
    </Dialog>
  </>;
}
