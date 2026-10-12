"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Download, MoreVertical, Eye, Send, Bell, FileX, Wallet, Link2, Loader2 } from "lucide-react";
import { Dialog, Menu, useAction, useKitToast } from "@/components/kit/client";
import { issueInvoice, remindInvoice, creditInvoice, recordPayment, paymentLink } from "@/lib/actions/money";
import { confirmDialog } from "@/lib/ui/dialogs";

export function MoneyFilters({ from, to, event, events, exportHref }: { from: string; to: string; event: string; events: { id: string; name: string }[]; exportHref: string }) {
  const router = useRouter(); const sp = useSearchParams();
  const set = (p: Record<string, string>) => { const u = new URLSearchParams(sp.toString()); for (const [k, v] of Object.entries(p)) v ? u.set(k, v) : u.delete(k); router.push(`/organizer/money${u.size ? `?${u}` : ""}`); };
  return <div className="mn-filters"><label className="mn-range"><CalendarDays size={16} /><input type="date" value={from} max={to} onChange={e => set({ from: e.target.value })} aria-label="From" /><span>–</span><input type="date" value={to} min={from} onChange={e => set({ to: e.target.value })} aria-label="To" /></label>
    <select className="mn-ev" value={event} onChange={e => set({ event: e.target.value })} aria-label="Event"><option value="">All events</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
    <a className="k-btn primary" href={exportHref}><Download size={16} />Export report</a></div>;
}

export function PaymentDialog({ open, onClose, id, due }: { open: boolean; onClose: () => void; id: string; due: number }) {
  const { run, pending } = useAction(); const [v, setV] = useState({ amount: due ? due.toFixed(2) : "", method: "Bank transfer", ref: "" });
  return <Dialog open={open} onClose={onClose} title="Record a payment" sub="For money received outside Gala Dock (e.g. bank transfer). Card payments via the pay link are recorded automatically.">
    <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => recordPayment(id, Number(v.amount), v.method, v.ref)); if (r.ok) onClose(); }}>
      <div className="k-grid k-g2" style={{ gap: 12 }}><label className="k-field"><span>Amount (£)</span><input className="k-input" inputMode="decimal" required value={v.amount} onChange={e => setV(p => ({ ...p, amount: e.target.value.replace(/[^0-9.]/g, "") }))} /></label><label className="k-field"><span>Method</span><select className="k-input" value={v.method} onChange={e => setV(p => ({ ...p, method: e.target.value }))}><option>Bank transfer</option><option>Card (terminal)</option><option>Cash</option><option>Cheque</option></select></label></div>
      <label className="k-field"><span>Reference (optional)</span><input className="k-input" value={v.ref} maxLength={120} onChange={e => setV(p => ({ ...p, ref: e.target.value }))} /></label>
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={onClose}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}Record payment</button></div></form></Dialog>;
}

export function InvoiceRowMenu({ id, status }: { id: string; status: string }) {
  const { run } = useAction(); const toast = useKitToast(); const [pay, setPay] = useState(false);
  const open = ["sent", "viewed", "partial", "overdue"].includes(status);
  return <><Menu label="Invoice options" width={210} trigger={({ toggle, open: o, id: m }) => <button className="k-icon-btn mn-dots" onClick={toggle} aria-expanded={o} aria-controls={m} aria-label="Invoice options"><MoreVertical size={15} /></button>}>{close => <>
    <Link role="menuitem" className="k-menu-item" href={`/organizer/money/invoices/${id}`} onClick={close}><Eye size={14} />View invoice</Link>
    {status === "draft" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => issueInvoice(id)); }}><Send size={14} />Send invoice</button>}
    {open && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => remindInvoice(id)); }}><Bell size={14} />Send reminder</button>}
    {open && <button role="menuitem" className="k-menu-item" onClick={() => { close(); setPay(true); }}><Wallet size={14} />Record payment</button>}
    {open && <button role="menuitem" className="k-menu-item" onClick={async () => { close(); const r = await run(() => paymentLink(id), { refresh: false }); if (r.ok && r.data) { try { await navigator.clipboard.writeText(`${location.origin}${(r.data as { url: string }).url}`); toast("Payment link copied"); } catch { toast("Couldn't copy the link", "error"); } } }}><Link2 size={14} />Copy payment link</button>}
    {open && <button role="menuitem" className="k-menu-item k-red" onClick={async () => { close(); if ((await confirmDialog({ title: "Issue a credit note for this invoice?", confirmLabel: "Issue credit note" }))) void run(() => creditInvoice(id)); }}><FileX size={14} />Create credit note</button>}</>}</Menu>
    {open && <PaymentDialog open={pay} onClose={() => setPay(false)} id={id} due={0} />}</>;
}
