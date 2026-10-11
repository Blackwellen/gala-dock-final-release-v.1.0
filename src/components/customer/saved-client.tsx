"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Ticket, Bell, BellRing, CalendarPlus, Share2, FileText, Loader2, X, Star } from "lucide-react";
import { Dialog, Menu, useAction, useKitToast } from "@/components/kit/client";
import { addAndRequest } from "@/lib/actions/build-extra";
import { checkAvailability, type Availability } from "@/lib/actions/booking";

export function SavedSort({ value }: { value: string }) {
  return <label className="sv-sort"><span>Sort by</span><select name="sort" defaultValue={value} onChange={e => e.currentTarget.form?.requestSubmit()}><option value="recent">Recently saved</option><option value="name">Name (A–Z)</option><option value="rating">Highest rated</option><option value="price">Lowest price</option><option value="date">Event date</option></select></label>;
}

async function toggleKey(key: string, saved: boolean) {
  const r = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, saved }) }).catch(() => null);
  return !!r?.ok;
}

export function SavedEventActions({ event: e }: { event: { id: string; name: string; slug: string | null; comingSoon: boolean; soldOut: boolean; notify: boolean } }) {
  const [notify, setNotify] = useState(e.notify); const toast = useKitToast(); const router = useRouter();
  const share = async () => { const url = e.slug ? `${location.origin}/events/${e.slug}` : location.href; try { if (navigator.share) await navigator.share({ title: e.name, url }); else { await navigator.clipboard.writeText(url); toast("Link copied"); } } catch { /* cancelled */ } };
  return <div className="sv-acts">
    <Link className="sv-btn soft" href={e.slug ? `/events/${e.slug}` : "#"}>View event</Link>
    {e.comingSoon ? <button className="sv-btn soft" aria-pressed={notify} onClick={async () => { const ok = await toggleKey(`notify:event:${e.id}`, !notify); if (ok) { setNotify(!notify); toast(!notify ? "We'll let you know when tickets go on sale" : "Notification turned off"); router.refresh(); } else toast("Could not update notifications", "error"); }}>{notify ? <BellRing size={15} /> : <Bell size={15} />}{notify ? "Notifying" : "Notify me"}</button>
      : <Link className="sv-btn soft" href={e.slug ? `/events/${e.slug}#tickets` : "#"} aria-disabled={e.soldOut || undefined}><Ticket size={15} />{e.soldOut ? "Join waitlist" : "Get tickets"}</Link>}
    <Menu label={`More for ${e.name}`} width={220} trigger={({ toggle, open, id }) => <button className="sv-btn drop" onClick={toggle} aria-expanded={open} aria-controls={id}>More <ChevronDown size={15} /></button>}>{close => <>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); void share(); }}><Share2 size={14} />Share event</button>
      {e.slug && <Link role="menuitem" className="k-menu-item" href={`/events/${e.slug}`} onClick={close}><CalendarPlus size={14} />Event details</Link>}
      <button role="menuitem" className="k-menu-item k-red" onClick={async () => { close(); if (await toggleKey(`event:${e.id}`, false)) { toast("Removed from saved"); router.refresh(); } }}><X size={14} />Remove from saved</button></>}</Menu>
  </div>;
}

type Ev = { id: string; name: string };
export function SavedListingActions({ listing: l, events }: { listing: { id: string; name: string; kind: string; href: string; category: string }; events: Ev[] }) {
  const { run, pending } = useAction(); const toast = useKitToast();
  const [avail, setAvail] = useState(false); const [date, setDate] = useState(""); const [res, setRes] = useState<Availability | null>(null); const [busy, setBusy] = useState(false);
  const pickEvent = (mode: "add" | "quote") => ({ toggle, open, id }: { toggle: () => void; open: boolean; id: string }) => <button className={`sv-btn ${mode === "add" ? "drop" : "soft"}`} onClick={toggle} aria-expanded={open} aria-controls={id} disabled={pending}>{mode === "add" ? <>Add to event <ChevronDown size={15} /></> : <><FileText size={15} />Get a quote</>}</button>;
  const menu = (mode: "add" | "quote") => (close: () => void) => <>{events.map(ev => <button key={ev.id} role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => addAndRequest(ev.id, l.id, l.category, mode)); }}>{ev.name}</button>)}
    {!events.length && <span className="k-menu-item" style={{ opacity: .7 }}>No events in planning yet</span>}<div className="k-menu-sep" /><Link role="menuitem" className="k-menu-item" href="/plan" onClick={close}>Plan a new event</Link></>;
  return <div className="sv-acts">
    <Link className="sv-btn soft" href={l.href}>{l.kind === "venue" ? "View venue" : "View profile"}</Link>
    {l.kind === "venue" ? <button className="sv-btn soft" onClick={() => setAvail(true)}>Check availability</button> : <Menu label={`Get a quote from ${l.name}`} width={240} trigger={pickEvent("quote")}>{menu("quote")}</Menu>}
    <Menu label={`Add ${l.name} to an event`} width={240} trigger={pickEvent("add")}>{menu("add")}</Menu>
    <Dialog open={avail} onClose={() => { setAvail(false); setRes(null); }} title={`Check ${l.name}`} sub="See if your date is free. The venue confirms final availability when you request a booking.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); if (!date) return; setBusy(true); const r = await checkAvailability(l.id, date, "18:00", "23:00"); setBusy(false); if (r.ok) setRes(r.data ?? "unknown"); else toast(r.error ?? "Couldn't check", "error"); }}>
        <label className="k-field"><span>Event date</span><input className="k-input" type="date" required min={new Date().toISOString().slice(0, 10)} value={date} onChange={e => { setDate(e.target.value); setRes(null); }} /></label>
        {res && <div className={`k-notice ${res === "available" ? "green" : res === "unavailable" ? "red" : "amber"}`}>{res === "available" ? "Looks available that evening." : res === "limited" ? "Limited — another booking is provisionally held." : res === "unavailable" ? "Not available that evening. Try another date." : "The venue will confirm availability when you ask."}</div>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}>{res && res !== "unavailable" && events.length > 0 && <button type="button" className="k-btn outline" onClick={() => void run(() => addAndRequest(events[0]!.id, l.id, l.category, "quote"))}>Request booking for {events[0]!.name}</button>}<button className="k-btn primary" disabled={busy || !date}>{busy && <Loader2 size={15} className="k-spin" />}Check date</button></div>
      </form>
    </Dialog>
  </div>;
}

type Row = { id: string; name: string; href: string; rating: number; reviews: number; price: number | null; unit: string; capacity: number | null; location: string; category: string };
export function CompareSaved({ kind, rows }: { kind: "venues" | "services"; rows: Row[] }) {
  return <section className="ce-card sv-compare"><div className="k-between"><b>Compare saved {kind}</b><Link className="k-link" href={`/account/saved?tab=${kind}`}>Close</Link></div>
    {rows.length < 2 ? <p className="k-small">Save at least two {kind} to compare them.</p> : <div className="k-table-wrap"><table className="k-table"><thead><tr><th scope="col">&nbsp;</th>{rows.slice(0, 5).map(r => <th key={r.id} scope="col"><Link href={r.href}>{r.name}</Link></th>)}</tr></thead><tbody>
      <tr><th scope="row">Rating</th>{rows.slice(0, 5).map(r => <td key={r.id}><Star size={12} fill="#f59e0b" color="#f59e0b" /> {r.rating.toFixed(1)} ({r.reviews})</td>)}</tr>
      <tr><th scope="row">From</th>{rows.slice(0, 5).map(r => <td key={r.id}>{r.price != null ? `£${r.price.toLocaleString("en-GB")} ${r.unit}` : "On request"}</td>)}</tr>
      {kind === "venues" ? <tr><th scope="row">Capacity</th>{rows.slice(0, 5).map(r => <td key={r.id}>{r.capacity ? `Up to ${r.capacity}` : "—"}</td>)}</tr> : <tr><th scope="row">Category</th>{rows.slice(0, 5).map(r => <td key={r.id}>{r.category}</td>)}</tr>}
      <tr><th scope="row">Location</th>{rows.slice(0, 5).map(r => <td key={r.id}>{r.location}</td>)}</tr></tbody></table></div>}
  </section>;
}
