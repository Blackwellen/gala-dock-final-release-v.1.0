"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Pencil, Send, Download, ChevronDown, ChevronLeft, ChevronRight, Printer, Copy, ExternalLink, Bell, FileX, Wallet, Loader2, Link2 } from "lucide-react";
import { Menu, useAction, useKitToast } from "@/components/kit/client";
import { issueInvoice, remindInvoice, creditInvoice, paymentLink, saveInvoiceNotes } from "@/lib/actions/money";
import { PaymentDialog } from "./money-client";

export function InvoiceHeaderActions({ id, status, prev, next }: { id: string; status: string; prev: string | null; next: string | null }) {
  const { run, pending } = useAction();
  return <div className="k-row iv-acts" style={{ gap: 8 }}>
    {status === "draft" ? <Link className="k-btn outline" href={`/organizer/money/invoices/new?from=${id}`}><Pencil size={15} />Edit</Link> : <span className="k-btn outline" aria-disabled title="Issued invoices can't be edited — create a credit note instead"><Pencil size={15} />Edit</span>}
    <button className="k-btn outline" disabled={pending || status !== "draft"} title={status !== "draft" ? "Already sent" : undefined} onClick={() => void run(() => issueInvoice(id))}><Send size={15} />Send</button>
    <Menu label="Download" width={200} trigger={({ toggle, open, id: m }) => <button className="k-btn outline" onClick={toggle} aria-expanded={open} aria-controls={m}><Download size={15} />Download <ChevronDown size={14} /></button>}>{close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); window.print(); }}><Printer size={14} />Print / Save as PDF</button><a role="menuitem" className="k-menu-item" href="/api/export/invoices" download onClick={close}><Download size={14} />All invoices (CSV)</a></>}</Menu>
    <Menu label="More actions" width={210} trigger={({ toggle, open, id: m }) => <button className="k-btn outline" onClick={toggle} aria-expanded={open} aria-controls={m}>More actions <ChevronDown size={14} /></button>}>{close => <>
      <Link role="menuitem" className="k-menu-item" href={`/organizer/money/invoices/new?from=${id}&duplicate=1`} onClick={close}><Copy size={14} />Duplicate</Link>
      {["sent", "viewed", "partial", "overdue"].includes(status) && <button role="menuitem" className="k-menu-item k-red" onClick={() => { close(); if (confirm("Issue a credit note?")) void run(() => creditInvoice(id)); }}><FileX size={14} />Create credit note</button>}</>}</Menu>
    {prev ? <Link className="k-icon-btn iv-nav" href={`/organizer/money/invoices/${prev}`} aria-label="Previous invoice"><ChevronLeft size={17} /></Link> : <span className="k-icon-btn iv-nav" aria-disabled><ChevronLeft size={17} /></span>}
    {next ? <Link className="k-icon-btn iv-nav" href={`/organizer/money/invoices/${next}`} aria-label="Next invoice"><ChevronRight size={17} /></Link> : <span className="k-icon-btn iv-nav" aria-disabled><ChevronRight size={17} /></span>}
  </div>;
}

const noop = () => () => {};
export function PayLinkBox({ id, token, payable }: { id: string; token: string | null; payable: boolean }) {
  const [url, setUrl] = useState(token ? `/pay/${token}` : ""); const { run, pending } = useAction(); const toast = useKitToast();
  // Origin only after hydration (server snapshot is empty) so SSR and the first client render match.
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const full = url ? `${origin}${url}` : url;
  return <section className="k-card iv-c"><h2>Payment link</h2><p className="k-small">Share this secure link for online payment.</p>
    {url ? <div className="iv-link"><code>{full}</code><button className="k-icon-btn" aria-label="Copy payment link" onClick={async () => { try { await navigator.clipboard.writeText(full); toast("Payment link copied"); } catch { toast("Couldn't copy", "error"); } }}><Copy size={14} /></button><Link className="k-btn outline sm" href={url} target="_blank"><ExternalLink size={13} />View payment page</Link></div>
      : <button className="k-btn outline" disabled={!payable || pending} title={!payable ? "Send the invoice first" : undefined} onClick={async () => { const r = await run(() => paymentLink(id), { refresh: false }); if (r.ok && r.data) setUrl((r.data as { url: string }).url); }}><Link2 size={14} />Create payment link</button>}</section>;
}

export function InvoiceSideActions({ id, status, due }: { id: string; status: string; due: number }) {
  const { run, pending } = useAction(); const [pay, setPay] = useState(false);
  const open = ["sent", "viewed", "partial", "overdue"].includes(status);
  return <section className="k-card iv-c"><h2>Actions</h2><div className="iv-sacts">
    <button className="k-btn outline" disabled={!open || pending} onClick={() => void run(() => remindInvoice(id))}><Bell size={14} />Send reminder</button>
    <button className="k-btn outline" disabled={!open} onClick={() => setPay(true)}><Wallet size={14} />Record payment</button>
    <button className="k-btn outline iv-cancel" disabled={!open || pending} onClick={() => { if (confirm("Cancel this invoice with a credit note?")) void run(() => creditInvoice(id)); }}><FileX size={14} />Cancel invoice</button></div>
    {open && <PaymentDialog open={pay} onClose={() => setPay(false)} id={id} due={due} />}</section>;
}

export function NotesCard({ id, notes, editable }: { id: string; notes: string; editable: boolean }) {
  const [edit, setEdit] = useState(false); const [v, setV] = useState(notes); const { run, pending } = useAction();
  return <section className="k-card iv-c"><div className="k-between"><h2>Notes</h2>{editable && !edit && <button className="k-btn outline sm" onClick={() => setEdit(true)}>Edit</button>}</div>
    {edit ? <form className="k-col" style={{ gap: 8, marginTop: 8 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => saveInvoiceNotes(id, v)); if (r.ok) setEdit(false); }}><textarea className="k-textarea" maxLength={2000} value={v} onChange={e => setV(e.target.value)} /><div className="k-row" style={{ justifyContent: "flex-end", gap: 8 }}><button type="button" className="k-btn ghost sm" onClick={() => setEdit(false)}>Cancel</button><button className="k-btn primary sm" disabled={pending}>{pending && <Loader2 size={13} className="k-spin" />}Save</button></div></form>
      : <p className="iv-notes">{notes || "No notes."}</p>}</section>;
}
