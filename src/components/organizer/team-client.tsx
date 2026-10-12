"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronDown, Plus, MoreVertical, UserPlus, CalendarPlus, Download, Loader2, CheckCircle2, Ban, Eye, Clock } from "lucide-react";
import { Dialog, Menu, useAction } from "@/components/kit/client";
import { savePerson, setPersonStatus, assignShift, setShiftStatus, requestAvailability } from "@/lib/actions/team";
import { confirmDialog } from "@/lib/ui/dialogs";

type Ev = { id: string; name: string; starts_at: string | null; ends_at: string | null };
type P = { id: string; name: string };
const local = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ name: "", email: "", role: "", member_type: "member" as "member" | "crew", phone: "", location: "", day_rate: "" });
  return <Dialog open={open} onClose={onClose} title="Invite people" sub="Members get workspace access. External crew can be scheduled without an account.">
    <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => savePerson(null, { ...v, day_rate: v.day_rate ? Number(v.day_rate) : null, skills: [], bio: "" })); if (r.ok) onClose(); }}>
      <div className="k-grid k-g2" style={{ gap: 12 }}><label className="k-field"><span>Full name</span><input className="k-input" required minLength={2} value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} /></label><label className="k-field"><span>Email</span><input className="k-input" type="email" value={v.email} onChange={e => setV(p => ({ ...p, email: e.target.value }))} /></label>
        <label className="k-field"><span>Role</span><input className="k-input" value={v.role} placeholder="e.g. Stage Technician" onChange={e => setV(p => ({ ...p, role: e.target.value }))} /></label><label className="k-field"><span>Type</span><select className="k-input" value={v.member_type} onChange={e => setV(p => ({ ...p, member_type: e.target.value as "member" | "crew" }))}><option value="member">Workspace member</option><option value="crew">External crew</option></select></label>
        <label className="k-field"><span>Phone (optional)</span><input className="k-input" value={v.phone} onChange={e => setV(p => ({ ...p, phone: e.target.value }))} /></label><label className="k-field"><span>Day rate £ (optional)</span><input className="k-input" inputMode="decimal" value={v.day_rate} onChange={e => setV(p => ({ ...p, day_rate: e.target.value.replace(/[^0-9.]/g, "") }))} /></label></div>
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={onClose}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={15} className="k-spin" />}Add to team</button></div>
    </form></Dialog>;
}

export function AssignDialog({ open, onClose, events, people, crew }: { open: boolean; onClose: () => void; events: Ev[]; people: P[]; crew?: string }) {
  const { run, pending } = useAction(); const [err, setErr] = useState("");
  const [v, setV] = useState({ crew: crew ?? people[0]?.id ?? "", event: events[0]?.id ?? "", role: "", starts_at: local(events[0]?.starts_at ?? null), ends_at: local(events[0]?.ends_at ?? null) });
  const submit = async (force: boolean) => { setErr(""); const r = await run(() => assignShift({ ...v, starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString() }, force), { refresh: true }); if (r.ok) onClose(); else setErr(r.error ?? ""); };
  return <Dialog open={open} onClose={onClose} title="Assign to event" sub="Creates a pending shift. We check for double bookings and unavailability first.">
    <form className="k-col" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); void submit(false); }}>
      {!crew && <label className="k-field"><span>Person</span><select className="k-input" value={v.crew} onChange={e => setV(p => ({ ...p, crew: e.target.value }))}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <label className="k-field"><span>Event</span><select className="k-input" value={v.event} onChange={e => { const ev = events.find(x => x.id === e.target.value); setV(p => ({ ...p, event: e.target.value, starts_at: local(ev?.starts_at ?? null), ends_at: local(ev?.ends_at ?? null) })); }}>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label className="k-field"><span>Role on the day</span><input className="k-input" required minLength={2} value={v.role} placeholder="e.g. Stage Crew" onChange={e => setV(p => ({ ...p, role: e.target.value }))} /></label>
      <div className="k-grid k-g2" style={{ gap: 12 }}><label className="k-field"><span>Starts</span><input className="k-input" type="datetime-local" required value={v.starts_at} onChange={e => setV(p => ({ ...p, starts_at: e.target.value }))} /></label><label className="k-field"><span>Ends</span><input className="k-input" type="datetime-local" required value={v.ends_at} onChange={e => setV(p => ({ ...p, ends_at: e.target.value }))} /></label></div>
      {err && <div className="k-notice amber">{err} {/Double|unavailable/i.test(err) && <button type="button" className="k-link" onClick={() => void submit(true)}>Assign anyway</button>}</div>}
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={onClose}>Cancel</button><button className="k-btn primary" disabled={pending || !events.length}>{pending && <Loader2 size={15} className="k-spin" />}Assign</button></div>
    </form></Dialog>;
}

export function TeamHeaderActions({ events, people, compact }: { events: Ev[]; people: P[]; compact?: boolean }) {
  const [invite, setInvite] = useState(false); const [assign, setAssign] = useState(false);
  if (compact) return <><button className="tm-invite" onClick={() => setInvite(true)}><Plus size={15} />Invite people</button><InviteDialog open={invite} onClose={() => setInvite(false)} /></>;
  return <div className="k-row tm-actions" style={{ gap: 10 }}>
    <Link className="k-btn outline" href="/organizer/calendar"><CalendarDays size={16} />View calendar</Link>
    <Menu label="More actions" width={220} trigger={({ toggle, open, id }) => <button className="k-btn outline" onClick={toggle} aria-expanded={open} aria-controls={id}>More actions <ChevronDown size={15} /></button>}>{close => <>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); setAssign(true); }}><CalendarPlus size={14} />Assign to event</button>
      <a role="menuitem" className="k-menu-item" href="/api/export/team" download onClick={close}><Download size={14} />Export team (CSV)</a></>}</Menu>
    <span className="tm-split"><button className="k-btn primary" onClick={() => setInvite(true)}><Plus size={16} />Invite people</button><Menu label="Add options" width={210} trigger={({ toggle, open, id }) => <button className="k-btn primary tm-caret" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="More add options"><ChevronDown size={15} /></button>}>{close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); setInvite(true); }}><UserPlus size={14} />Invite person</button><button role="menuitem" className="k-menu-item" onClick={() => { close(); setAssign(true); }}><CalendarPlus size={14} />Assign shift</button></>}</Menu></span>
    <InviteDialog open={invite} onClose={() => setInvite(false)} />
    <AssignDialog open={assign} onClose={() => setAssign(false)} events={events} people={people} />
  </div>;
}

export function PersonRowMenu({ id, name, status }: { id: string; name: string; status: string }) {
  const { run } = useAction();
  return <Menu label={`Options for ${name}`} width={210} trigger={({ toggle, open, id: m }) => <button className="k-icon-btn tm-dots" onClick={toggle} aria-expanded={open} aria-controls={m} aria-label={`Options for ${name}`}><MoreVertical size={15} /></button>}>{close => <>
    <Link role="menuitem" className="k-menu-item" href={`/organizer/team/${id}`} onClick={close}><Eye size={14} />View profile</Link>
    {status !== "available" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setPersonStatus(id, "available")); }}><CheckCircle2 size={14} />Mark available</button>}
    {status !== "unavailable" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setPersonStatus(id, "unavailable")); }}><Ban size={14} />Mark unavailable</button>}
    <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" onClick={async () => { close(); if ((await confirmDialog({ title: `Revoke ${name}'s access? Their history is kept.`, confirmLabel: "Revoke", danger: true }))) void run(() => setPersonStatus(id, "deactivated")); }}>Deactivate / revoke access</button></>}</Menu>;
}

export function ShiftMenu({ id, status, eventId }: { id: string; status: string; eventId: string | null }) {
  const { run } = useAction();
  return <Menu label="Shift options" width={200} trigger={({ toggle, open, id: m }) => <button className="k-icon-btn tm-dots" onClick={toggle} aria-expanded={open} aria-controls={m} aria-label="Shift options"><MoreVertical size={15} /></button>}>{close => <>
    {status !== "confirmed" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setShiftStatus(id, "confirmed")); }}><CheckCircle2 size={14} />Confirm</button>}
    {status !== "pending" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setShiftStatus(id, "pending")); }}><Clock size={14} />Mark pending</button>}
    {eventId && <Link role="menuitem" className="k-menu-item" href={`/organizer/events/${eventId}?tab=ops`} onClick={close}><Eye size={14} />Open event ops</Link>}</>}</Menu>;
}

export function ResolveButton({ href, label }: { href: string; label: string }) { return <Link className="tm-resolve" href={href}>{label}</Link>; }

export function RequestAvailabilityButton({ crew, className = "k-btn outline", label = "Request availability" }: { crew: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const [v, setV] = useState({ from: "", to: "", note: "" });
  return <><button className={className} onClick={() => setOpen(true)}><Clock size={16} />{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Request availability" sub="They'll be asked to confirm. Nothing is assumed until they reply.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => requestAvailability(crew, new Date(v.from).toISOString(), new Date(v.to).toISOString(), v.note)); if (r.ok) setOpen(false); }}>
        <div className="k-grid k-g2" style={{ gap: 12 }}><label className="k-field"><span>From</span><input className="k-input" type="date" required value={v.from} onChange={e => setV(p => ({ ...p, from: e.target.value }))} /></label><label className="k-field"><span>To</span><input className="k-input" type="date" required value={v.to} onChange={e => setV(p => ({ ...p, to: e.target.value }))} /></label></div>
        <label className="k-field"><span>Note (optional)</span><textarea className="k-textarea" maxLength={400} value={v.note} onChange={e => setV(p => ({ ...p, note: e.target.value }))} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Send request</button></div></form></Dialog></>;
}
