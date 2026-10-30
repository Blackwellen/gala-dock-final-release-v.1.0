"use client";
import { AddProvider } from "./add-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, ExternalLink, CalendarCog, Copy, XCircle, Trash2, Clock, ArrowRight, AlertTriangle, Check, Repeat, Shield } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { removeFromBuild, requestQuote, setItemRole } from "@/lib/actions/build";
import { requestBuildHold } from "@/lib/actions/build-engine";
import { EventDateDialog } from "./event-date-change";
import { useMyDuplicateDialog } from "./duplicate-dialog";
import { createGuestLink } from "@/lib/actions/event-guest-links";

export function HeaderMenu({ id, name }: { id: string; name: string }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const [dateOpen, setDateOpen] = useState(false);
  const dup = useMyDuplicateDialog();
  return <>
    <button className="k-btn primary ce-btn" disabled={pending} onClick={async () => { const r = await run(() => createGuestLink(id), { refresh: false }); const path = (r as { data?: { path: string } }).data?.path; if (!r.ok || !path) return; const url = `${location.origin}${path}`; try { if (navigator.share) await navigator.share({ title: name, url }); else { await navigator.clipboard.writeText(url); toast("Private guest link copied — it expires and you can revoke it"); } } catch { /* cancelled */ } }}>Share Event <ExternalLink size={15} /></button>
    <Menu label="More" width={220} trigger={({ toggle, open, id: mid }) => <button className="k-icon-btn ce-more" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label="More actions"><MoreHorizontal size={18} /></button>}>
      {close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); setDateOpen(true); }}><CalendarCog size={15} />Change date</button>
        <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); dup.open({ id, name }); }}><Copy size={15} />Duplicate</button>
        <Link role="menuitem" className="k-menu-item k-red" href="/account/events" onClick={close}><XCircle size={15} />Cancel from My Events</Link></>}
    </Menu>
    {dup.dialog}
    <EventDateDialog eventId={id} open={dateOpen} onClose={() => setDateOpen(false)} />
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
export function ItemMenu({ eventId, it, href, manage = false }: { eventId: string; it: Item; href?: string; manage?: boolean }) {
  const { run, pending } = useAction(); const [hold, setHold] = useState(false);
  const committed = ["confirmed", "held", "fulfilled"].includes(it.status);
  return <>
    <Menu label={`Options for ${it.title}`} width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn cb-dots" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Options for ${it.title}`}><MoreHorizontal size={16} /></button>}>
      {close => <>
        {manage && <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/bookings/${it.id}`} onClick={close}><CalendarCog size={14} />Manage booking</Link>}
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
    <Dialog open={hold} onClose={() => setHold(false)} title={`Hold ${it.title}`} sub="A hold reserves them briefly and expires automatically if you don't book. The venue comes first: a supplier hold stays conditional until your venue is confirmed.">
      <div className="k-grid k-g4" style={{ gap: 8 }}>{[12, 24, 48, 72].map(h => <button key={h} className="k-btn outline" disabled={pending} onClick={async () => { const r = await run(() => requestBuildHold(eventId, it.id, h)); if (r.ok) setHold(false); }}>{h} hours</button>)}</div>
    </Dialog>
  </>;
}

type L = { id: string; name: string; image: string; rating: number; review_count: number; price_from: number | null; price_unit: string; location: string; category: string };
/** Add (or replace) a provider for one build category. Searches the live marketplace with event-aware filters (see AddProvider);
 *  `listings` is no longer needed and is kept only so existing callers keep compiling. */
export function AddProviderDialog({ eventId, category, label, trigger, replaceId, initialOpen = false }: { eventId: string; category: string; label: string; listings?: L[]; trigger: "button" | "tile" | "link"; replaceId?: string; initialOpen?: boolean }) {
  return <AddProvider eventId={eventId} category={category} label={label} trigger={trigger} replaceId={replaceId} initialOpen={initialOpen} />;
}
