"use client";
import Link from "next/link";
import { useState } from "react";
import { Send, Tag, CalendarPlus, Wallet, MoreHorizontal, Repeat, ChevronRight, Download, Copy, CircleHelp, Loader2 } from "lucide-react";
import { Dialog, Menu, useAction, useKitToast } from "@/components/kit/client";
import { resaleTicket, updateAttendee } from "@/lib/actions/tickets";
import { TransferDialog, ResaleDialog } from "./tickets-client";

export function ManageTicket({ ticket: t }: { ticket: { id: string; code: string; status: string; qr: string; name: string; transfers: boolean } }) {
  const [transfer, setTransfer] = useState(false); const [resale, setResale] = useState(false); const [wallet, setWallet] = useState(false);
  const { run, pending } = useAction(); const toast = useKitToast();
  const valid = t.status === "valid"; const listed = t.status === "resale_listed";
  return <section className="ce-card td-manage">
    <div className="k-between" style={{ alignItems: "flex-start" }}><div><h2>Manage this ticket</h2><p>{valid ? "Transfer to a friend or securely resell through our official resale." : listed ? "Listed on official resale at face value." : "This ticket can no longer be transferred or resold."}</p></div>
      <Menu label="Ticket options" width={220} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Ticket options"><MoreHorizontal size={18} /></button>}>{close => <>
        <button role="menuitem" className="k-menu-item" onClick={async () => { close(); try { await navigator.clipboard.writeText(t.code); toast("Ticket code copied"); } catch { toast("Couldn't copy the code", "error"); } }}><Copy size={14} />Copy ticket code</button>
        <a role="menuitem" className="k-menu-item" href={t.qr} download={`${t.code}.png`} onClick={close}><Download size={14} />Download QR image</a>
        <Link role="menuitem" className="k-menu-item" href="/help?topic=tickets" onClick={close}><CircleHelp size={14} />Report a problem</Link></>}</Menu></div>
    <div className="td-mgrid">
      <button className="k-btn primary td-mbig" disabled={!valid || !t.transfers} title={!t.transfers ? "Transfers are turned off for this event" : undefined} onClick={() => setTransfer(true)}><Send size={18} />Transfer ticket</button>
      {listed ? <button className="k-btn outline td-mbig" disabled={pending} onClick={() => void run(() => resaleTicket(t.id, true))}><Repeat size={18} />Cancel resale</button> : <button className="k-btn outline td-mbig" disabled={!valid} onClick={() => setResale(true)}><Tag size={18} />Official resale</button>}
      <a className="k-btn outline td-msm" href={`/api/tickets/${t.id}/ics`}><CalendarPlus size={16} />Add to calendar</a>
      <button className="k-btn outline td-msm" onClick={() => setWallet(true)}><Wallet size={16} />Add to wallet</button>
    </div>
    <TransferDialog open={transfer} onClose={() => setTransfer(false)} ticketId={t.id} name={t.name} />
    <ResaleDialog open={resale} onClose={() => setResale(false)} ticketId={t.id} name={t.name} />
    <Dialog open={wallet} onClose={() => setWallet(false)} title="Save your ticket" sub="Wallet passes aren't switched on for this event yet. Your QR code works from this page — or save it to your phone.">
      <div className="k-col" style={{ gap: 10 }}><a className="k-btn primary" href={t.qr} download={`${t.code}.png`}><Download size={15} />Download QR image</a><a className="k-btn outline" href={`/api/tickets/${t.id}/ics`}><CalendarPlus size={15} />Add event to calendar</a></div>
    </Dialog>
  </section>;
}

export function AttendeeCard({ ticket: t }: { ticket: { id: string; status: string; name: string; email: string; phone: string; checked: boolean } }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState({ name: t.name, email: t.email }); const { run, pending } = useAction();
  const editable = t.status === "valid" && !t.checked;
  return <section className="ce-card td-att">
    <div className="k-between"><h2>Attendee details</h2>{editable && <button className="k-link" onClick={() => setOpen(true)}>Edit</button>}</div>
    <dl>{([["Name", t.name], ["Email", t.email], ["Phone", t.phone || "Not provided"], ["Entry method", "QR Code (this device)"]] as const).map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd><ChevronRight size={15} /></div>)}</dl>
    <Dialog open={open} onClose={() => setOpen(false)} title="Edit attendee details" sub="The name should match the attendee's photo ID. A fresh QR code is issued when you save.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => updateAttendee(t.id, v.name, v.email)); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Full name</span><input className="k-input" required minLength={2} maxLength={120} value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} autoComplete="name" /></label>
        <label className="k-field"><span>Email</span><input className="k-input" type="email" required maxLength={200} value={v.email} onChange={e => setV(p => ({ ...p, email: e.target.value }))} autoComplete="email" /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={15} className="k-spin" />}Save details</button></div>
      </form>
    </Dialog>
  </section>;
}
