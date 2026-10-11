"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Send, Tag, ExternalLink, MoreHorizontal, CheckCircle2, Repeat, XCircle, Wallet, Download, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, Menu, useAction, useKitToast } from "@/components/kit/client";
import { transferTicket, resaleTicket } from "@/lib/actions/tickets";

/** Native select that applies the filter immediately (progressive: the form still submits without JS). */
export function FilterSelect({ name, value, label, options }: { name: string; value: string; label: string; options: [string, string][] }) {
  return <span className="tk-select"><select name={name} defaultValue={value} aria-label={label} onChange={e => e.currentTarget.form?.requestSubmit()}><option value="">{label}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></span>;
}

type Group = { key: string; when: "upcoming" | "past" | "resale"; firstId: string; ids: string[]; statuses: string[]; name: string; slug: string | null; transfers: boolean; n: number };
export function GroupActions({ group: g }: { group: Group }) {
  const [transfer, setTransfer] = useState(false); const [resale, setResale] = useState(false); const { run, pending } = useAction();
  const listed = g.statuses.includes("resale_listed"); const validIdx = g.statuses.findIndex(s => s === "valid"); const validId = validIdx >= 0 ? g.ids[validIdx]! : null;
  const offerTransfer = g.when === "upcoming" && !!validId && g.transfers && g.n === 1;
  const cal = <a className="k-btn outline tk-btn" href={`/api/tickets/${g.firstId}/ics`}><CalendarPlus size={17} />Add to calendar</a>;
  return <div className="tk-actions">
    <Link className="k-btn outline tk-btn tk-view" href={`/account/tickets/${g.firstId}`}>{g.when === "resale" || listed ? "View details" : g.n > 1 ? "View tickets" : "View ticket"}</Link>
    {listed ? <button className="k-btn outline tk-btn" disabled={pending} onClick={() => void run(() => resaleTicket(g.ids[g.statuses.indexOf("resale_listed")]!, true))}><Repeat size={16} />Cancel resale</button>
      : offerTransfer ? <><button className="k-btn outline tk-btn sm" onClick={() => setTransfer(true)}><Repeat size={16} />Transfer</button><button className="k-btn outline tk-btn sm" onClick={() => setResale(true)}><Tag size={15} />Official resale</button></>
      : g.when === "upcoming" ? cal : null}
    <Menu label={`More for ${g.name}`} width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn tk-more" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`More options for ${g.name}`}><MoreHorizontal size={18} /></button>}>
      {close => <>
        {g.when === "upcoming" && <a role="menuitem" className="k-menu-item" href={`/api/tickets/${g.firstId}/ics`} onClick={close}><CalendarPlus size={14} />Add to calendar</a>}
        {g.when === "upcoming" && validId && g.transfers && <button role="menuitem" className="k-menu-item" onClick={() => { close(); setTransfer(true); }}><Send size={14} />Transfer a ticket</button>}
        {g.when === "upcoming" && validId && <button role="menuitem" className="k-menu-item" onClick={() => { close(); setResale(true); }}><Tag size={14} />Sell on official resale</button>}
        {g.slug && <Link role="menuitem" className="k-menu-item" href={`/events/${g.slug}`} onClick={close}><ExternalLink size={14} />View event page</Link>}
        <Link role="menuitem" className="k-menu-item" href="/help?topic=tickets" onClick={close}>Get help with this order</Link></>}
    </Menu>
    {validId && <TransferDialog open={transfer} onClose={() => setTransfer(false)} ticketId={validId} name={g.name} />}
    {validId && <ResaleDialog open={resale} onClose={() => setResale(false)} ticketId={validId} name={g.name} />}
  </div>;
}

export function TransferDialog({ open, onClose, ticketId, name }: { open: boolean; onClose: () => void; ticketId: string; name: string }) {
  const { run, pending } = useAction(); const [to, setTo] = useState({ name: "", email: "" });
  return <Dialog open={open} onClose={onClose} title={`Transfer a ticket for ${name}`} sub="They'll get a brand-new ticket and QR code. Yours stops working immediately — this can't be undone.">
    <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => transferTicket(ticketId, to.name, to.email)); if (r.ok) onClose(); }}>
      <label className="k-field"><span>Recipient&apos;s full name</span><input className="k-input" required minLength={2} maxLength={120} value={to.name} onChange={e => setTo(p => ({ ...p, name: e.target.value }))} autoComplete="name" /></label>
      <label className="k-field"><span>Recipient&apos;s email</span><input className="k-input" type="email" required maxLength={200} value={to.email} onChange={e => setTo(p => ({ ...p, email: e.target.value }))} autoComplete="email" /></label>
      <div className="k-notice blue"><ShieldCheck size={15} className="k-blue" />Transfers are free and recorded against the ticket. Only transfer to people you know.</div>
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={onClose}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={15} className="k-spin" />}Transfer ticket</button></div>
    </form>
  </Dialog>;
}
export function ResaleDialog({ open, onClose, ticketId, name }: { open: boolean; onClose: () => void; ticketId: string; name: string }) {
  const { run, pending } = useAction();
  return <Dialog open={open} onClose={onClose} title={`Sell on official resale`} sub={`List your ${name} ticket at face value. Your QR code is paused while it's listed.`}>
    <ul className="tk-rules">{["Sold at face value — no mark-ups, no touting", "You're paid to your original payment method when it sells", "Cancel any time before it sells and get a fresh QR code", "If it doesn't sell, your ticket stays yours"].map(t => <li key={t}><CheckCircle2 size={16} />{t}</li>)}</ul>
    <div className="k-row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="k-btn ghost" onClick={onClose}>Not now</button><button className="k-btn primary" disabled={pending} onClick={async () => { const r = await run(() => resaleTicket(ticketId, false)); if (r.ok) onClose(); }}>{pending && <Loader2 size={15} className="k-spin" />}List for resale</button></div>
  </Dialog>;
}

type PanelTicket = { id: string; code: string; status: string; tier: string; sub: string; gate: string; seat: string; qr: string | null; attendee: string };
/** Selected event's tickets: per-ticket QR, wallet/save, transfer, resale, calendar and event page. */
export function TicketPanel({ tickets, when, slug, transfers }: { tickets: PanelTicket[]; when: string; slug: string | null; transfers: boolean }) {
  const [i, setI] = useState(0); const t = tickets[Math.min(i, tickets.length - 1)]!; const toast = useKitToast();
  const [transfer, setTransfer] = useState(false); const [resale, setResale] = useState(false); const [wallet, setWallet] = useState(false); const { run, pending } = useAction();
  const valid = t.status === "valid"; const listed = t.status === "resale_listed";
  const label: Record<string, [string, string]> = { valid: ["Valid for entry", "green"], used: ["Used — admitted", "gray"], resale_listed: ["Listed for resale", "amber"], transferred: ["Transferred", "blue"], resold: ["Resold", "gray"], refunded: ["Refunded", "gray"], cancelled: ["Cancelled", "red"] };
  const [sl, tone] = label[t.status] ?? [t.status, "gray"];
  return <div className="tk-pbody">
    {tickets.length > 1 && <div className="tk-seg" role="tablist">{tickets.map((x, k) => <button key={x.id} role="tab" aria-selected={k === i} onClick={() => setI(k)}>Ticket {k + 1} of {tickets.length}</button>)}</div>}
    <div className="tk-qrcard">
      <div className="k-between" style={{ alignItems: "flex-start" }}><span><b>{t.tier}</b><small>{t.seat ? `Seat ${t.seat}` : t.sub}</small></span><span className="tk-gate"><small>Entry gate</small><b>{t.gate}</b></span></div>
      <div className={`tk-qr ${valid ? "" : "dim"}`}>{t.qr && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={t.qr} alt={`QR code for ticket ${t.code}`} /><span className="tk-qr-logo" aria-hidden>G</span></>}{!valid && <span className="tk-qr-void">{listed ? "Paused while listed" : sl}</span>}</div>
      <b className="tk-code">{t.code}</b>
      <span className={`tk-valid ${tone}`}>{tone === "green" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{sl}</span>
      {when !== "resale" && <div className="tk-wallets"><button className="tk-wallet apple" onClick={() => setWallet(true)}><Wallet size={16} />Add to Apple Wallet</button><button className="tk-wallet" onClick={() => setWallet(true)}><Wallet size={16} />Add to Google Wallet</button></div>}
    </div>
    <div className="tk-acts">
      <button className="tk-act" disabled={!valid || !transfers} title={!transfers ? "Transfers are turned off for this event" : undefined} onClick={() => setTransfer(true)}><Send size={17} />Transfer ticket</button>
      {listed ? <button className="tk-act" disabled={pending} onClick={() => void run(() => resaleTicket(t.id, true))}><Repeat size={17} />Cancel resale</button> : <button className="tk-act" disabled={!valid} onClick={() => setResale(true)}><Tag size={17} />Official resale</button>}
      <a className="tk-act" href={`/api/tickets/${t.id}/ics`}><CalendarPlus size={17} />Add to calendar</a>
      {slug ? <Link className="tk-act" href={`/events/${slug}`}><ExternalLink size={17} />View event page</Link> : <Link className="tk-act" href={`/account/tickets/${t.id}`}><ExternalLink size={17} />Ticket details</Link>}
    </div>
    <TransferDialog open={transfer} onClose={() => setTransfer(false)} ticketId={t.id} name={t.tier} />
    <ResaleDialog open={resale} onClose={() => setResale(false)} ticketId={t.id} name={t.tier} />
    <Dialog open={wallet} onClose={() => setWallet(false)} title="Save your ticket" sub="Wallet passes aren't switched on for this event yet. Your QR code works from this page — or save it to your phone.">
      <div className="k-col" style={{ gap: 10 }}>{t.qr && <a className="k-btn primary" href={t.qr} download={`${t.code}.png`}><Download size={15} />Download QR image</a>}
        <button className="k-btn outline" onClick={async () => { try { await navigator.clipboard.writeText(t.code); toast("Ticket code copied"); } catch { toast("Couldn't copy the code", "error"); } }}><Copy size={15} />Copy ticket code</button>
        <a className="k-btn outline" href={`/api/tickets/${t.id}/ics`}><CalendarPlus size={15} />Add event to calendar</a></div>
    </Dialog>
  </div>;
}
