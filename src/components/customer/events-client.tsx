"use client";
import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal, ChevronDown, Copy, XCircle, Archive, Eye, Briefcase, AlertTriangle, ArrowRight, Check } from "lucide-react";
import { Menu, Dialog, useAction } from "@/components/kit/client";
import { duplicateMyEvent } from "@/lib/actions/events";
import { cancellationImpact, cancelMyEvent, archiveMyEvent, upgradeToOrganizer, toggleMyTask, type CancelImpact } from "@/lib/actions/my-events";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
export function EventMenu({ id, name, status }: { id: string; name: string; status: string }) {
  const { run, pending } = useAction(); const [cancel, setCancel] = useState(false); const [impact, setImpact] = useState<CancelImpact | null>(null); const [typed, setTyped] = useState("");
  const openCancel = async () => { setCancel(true); setImpact(null); const r = await cancellationImpact(id); if (r.ok && r.data) setImpact(r.data); };
  return <>
    <Menu label={`Actions for ${name}`} width={210} trigger={({ toggle, open, id: mid }) => <button className="k-icon-btn plain" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label={`Actions for ${name}`}><MoreHorizontal size={18} /></button>}>
      {close => <><Link role="menuitem" className="k-menu-item" href={`/account/events/${id}`} onClick={close}><Eye size={15} />View details</Link>
        <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => duplicateMyEvent(id)); }}><Copy size={15} />Duplicate</button>
        {["draft", "completed", "cancelled"].includes(status) && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => archiveMyEvent(id)); }}><Archive size={15} />Archive</button>}
        {!["completed", "cancelled"].includes(status) && <><div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" onClick={() => { close(); void openCancel(); }}><XCircle size={15} />Cancel event</button></>}</>}
    </Menu>
    <Dialog open={cancel} onClose={() => setCancel(false)} title={`Cancel ${name}?`} sub="Here's exactly what happens before you confirm.">
      {!impact ? <p className="k-small">Checking bookings and payments…</p> : <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g3" style={{ gap: 8 }}><div className="k-kpi"><div><div className="lbl">Non-refundable paid</div><div className="val k-red" style={{ fontSize: 17 }}>{gbp(impact.paidNonRefundable)}</div></div></div><div className="k-kpi"><div><div className="lbl">Possibly refundable</div><div className="val" style={{ fontSize: 17 }}>{gbp(impact.paidRefundable)}</div><div className="sub">per supplier terms</div></div></div><div className="k-kpi"><div><div className="lbl">Future payments</div><div className="val" style={{ fontSize: 17 }}>{gbp(impact.scheduled)}</div><div className="sub">won&apos;t be charged</div></div></div></div>
        {impact.bookings.length > 0 && <div><b className="k-small">Bookings affected</b><ul className="k-list" style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>{impact.bookings.map(b => <li key={b.title} className="k-between k-small"><span>{b.title}</span><span className="k-muted">{b.status === "confirmed" ? "Confirmed — cancellation terms apply" : "Request / hold released"}</span></li>)}</ul></div>}
        {(impact.tickets > 0 || impact.guests > 0) && <div className="k-notice amber"><AlertTriangle size={15} className="k-amber" /><span>{impact.tickets ? `${impact.tickets} ticket holders must be refunded first. ` : ""}{impact.guests ? `${impact.guests} guests will be told the event is cancelled.` : ""}</span></div>}
        <label className="k-field"><span>Type <b>{name}</b> to confirm</span><input className="k-input" value={typed} onChange={e => setTyped(e.target.value)} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setCancel(false)}>Keep event</button><button className="k-btn danger" disabled={pending || typed.trim() !== name} onClick={async () => { const r = await run(() => cancelMyEvent(id, typed)); if (r.ok) setCancel(false); }}>Cancel event</button></div>
      </div>}
    </Dialog>
  </>;
}
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = { planning: ["Planning", "#f59e0b"], draft: ["Draft", "#475569"], ready: ["Confirmed", "#10b981"], published: ["Confirmed", "#10b981"], on_sale: ["On sale", "#10b981"], completed: ["Completed", "#64748b"], cancelled: ["Cancelled", "#ef4444"], live: ["Live", "#10b981"] };
  const [l, c] = map[status] ?? [status, "#64748b"];
  return <span className="me-status" style={{ ["--c" as string]: c }}><i />{l}{status === "planning" && <ChevronDown size={13} />}</span>;
}
export function UpgradeButton({ eventId, workspaces }: { eventId: string; workspaces: { id: string; name: string }[] }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false); const [ws, setWs] = useState(workspaces[0]?.id ?? "");
  if (!workspaces.length) return <Link className="k-btn outline" href="/onboarding/organizer?step=1">Switch to Organizer Mode <ArrowRight size={14} /></Link>;
  return <><button className="k-btn outline" onClick={() => setOpen(true)}>Switch to Organizer Mode <ArrowRight size={14} /></button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Move this event to Organizer" sub="The event keeps its identity. Bookings, payments, guests, tickets and messages move with it.">
      <div className="k-col" style={{ gap: 12 }}><label className="k-field"><span>Organizer workspace</span><select className="k-select" value={ws} onChange={e => setWs(e.target.value)}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <ul className="pl-agent-list"><li><Check size={15} className="k-green" />Same event — nothing is copied</li><li><Check size={15} className="k-green" />Workspace team can collaborate</li><li><Check size={15} className="k-green" />Advanced planning, ticketing and money tools</li></ul>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending || !ws} onClick={() => void run(() => upgradeToOrganizer(eventId, ws))}><Briefcase size={15} />Move to Organizer</button></div></div>
    </Dialog></>;
}
export function TaskCircle({ id, done, label }: { id: string; done: boolean; label: string }) {
  const { run } = useAction(); const [v, setV] = useState(done);
  return <button className={`me-circle ${v ? "on" : ""}`} aria-pressed={v} aria-label={`Mark "${label}" ${v ? "not done" : "done"}`} onClick={async () => { setV(!v); const r = await run(() => toggleMyTask(id, !v)); if (!r.ok) setV(v); }}>{v && <Check size={12} />}</button>;
}
