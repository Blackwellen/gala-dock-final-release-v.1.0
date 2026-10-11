"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageSquare, ChevronDown, MoreHorizontal, Pencil, UserCog, CalendarPlus, Clock, Send, CalendarDays, Ban, Plus, Loader2, CheckCircle2, Eye, MoreVertical } from "lucide-react";
import { Dialog, Menu, useAction } from "@/components/kit/client";
import { savePerson, setPersonStatus, addNote, setShiftStatus } from "@/lib/actions/team";
import { AssignDialog, RequestAvailabilityButton } from "./team-client";

type Ev = { id: string; name: string; starts_at: string | null; ends_at: string | null };

export function ProfileHeaderActions({ crew, name, email, events }: { crew: string; name: string; email: string; events: Ev[] }) {
  const [assign, setAssign] = useState(false);
  return <div className="k-row tp-acts" style={{ gap: 10 }}>
    {email ? <a className="k-btn outline" href={`mailto:${email}`}><MessageSquare size={16} />Message</a> : <span className="k-btn outline" aria-disabled title="No email on file"><MessageSquare size={16} />Message</span>}
    <RequestAvailabilityButton crew={crew} />
    <span className="tm-split"><button className="k-btn primary" onClick={() => setAssign(true)}>Assign to event</button><Menu label="Assign options" width={200} trigger={({ toggle, open, id }) => <button className="k-btn primary tm-caret" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Assign options"><ChevronDown size={15} /></button>}>{close => <>{events.slice(0, 6).map(e => <button key={e.id} role="menuitem" className="k-menu-item" onClick={() => { close(); setAssign(true); }}>{e.name}</button>)}</>}</Menu></span>
    <Link className="k-icon-btn tp-more" href={`/organizer/team/${crew}?tab=activity`} aria-label={`More for ${name}`}><MoreHorizontal size={17} /></Link>
    <AssignDialog open={assign} onClose={() => setAssign(false)} events={events} people={[]} crew={crew} />
  </div>;
}

export function QuickActionsCard({ crew, name, status, events, profile }: { crew: string; name: string; status: string; events: Ev[]; profile: { role: string; location: string; phone: string; bio: string; skills: string[] } }) {
  const { run, pending } = useAction(); const [edit, setEdit] = useState(false); const [assign, setAssign] = useState(false); const [role, setRole] = useState(false);
  const [v, setV] = useState({ name, role: profile.role, location: profile.location, phone: profile.phone, bio: profile.bio, skills: profile.skills.join(", ") });
  return <section className="k-card tp-quick"><h2>Quick actions</h2><ul>
    <li><button onClick={() => setEdit(true)}><Pencil size={16} />Edit profile</button></li>
    <li><button onClick={() => setRole(true)}><UserCog size={16} />Change role / permissions</button></li>
    <li><button onClick={() => setAssign(true)}><CalendarPlus size={16} />Assign to event</button></li>
    <li><RequestAvailabilityButton crew={crew} className="tp-ql" /></li>
    <li><Link href={`/organizer/team/${crew}?tab=activity`}><Send size={16} />Send message</Link></li>
    <li><Link href={`/organizer/calendar?crew=${crew}`}><CalendarDays size={16} />View in calendar</Link></li>
    <li><button className="k-red" disabled={pending || status === "deactivated"} onClick={() => { if (confirm(`Revoke ${name}'s access?`)) void run(() => setPersonStatus(crew, "deactivated")); }}><Ban size={16} />Deactivate / revoke access</button></li></ul>
    <AssignDialog open={assign} onClose={() => setAssign(false)} events={events} people={[]} crew={crew} />
    <Dialog open={edit} onClose={() => setEdit(false)} title="Edit profile"><form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => savePerson(crew, { name: v.name, role: v.role, phone: v.phone, location: v.location, skills: v.skills.split(",").map(s => s.trim()).filter(Boolean), bio: v.bio })); if (r.ok) setEdit(false); }}>
      <label className="k-field"><span>Name</span><input className="k-input" value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} /></label><label className="k-field"><span>Role</span><input className="k-input" value={v.role} onChange={e => setV(p => ({ ...p, role: e.target.value }))} /></label>
      <label className="k-field"><span>Location</span><input className="k-input" value={v.location} onChange={e => setV(p => ({ ...p, location: e.target.value }))} /></label><label className="k-field"><span>Skills (comma separated)</span><input className="k-input" value={v.skills} onChange={e => setV(p => ({ ...p, skills: e.target.value }))} /></label>
      <label className="k-field"><span>Bio</span><textarea className="k-textarea" maxLength={600} value={v.bio} onChange={e => setV(p => ({ ...p, bio: e.target.value }))} /></label>
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setEdit(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Save</button></div></form></Dialog>
    <Dialog open={role} onClose={() => setRole(false)} title="Role & permissions" sub="Workspace permissions are managed in Settings → Team & roles."><div className="k-row" style={{ justifyContent: "flex-end" }}><Link className="k-btn primary" href="/organizer/settings?tab=team">Open settings</Link></div></Dialog>
  </section>;
}

export function NoteForm({ crew }: { crew: string }) {
  const [open, setOpen] = useState(false); const [t, setT] = useState(""); const { run, pending } = useAction();
  return open ? <form className="tp-note" onSubmit={async e => { e.preventDefault(); const r = await run(() => addNote(crew, t)); if (r.ok) { setT(""); setOpen(false); } }}><textarea className="k-textarea" autoFocus maxLength={1000} value={t} onChange={e => setT(e.target.value)} placeholder="Add a private note…" /><div className="k-row" style={{ justifyContent: "flex-end", gap: 8 }}><button type="button" className="k-btn ghost sm" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary sm" disabled={pending || t.trim().length < 2}>{pending && <Loader2 size={13} className="k-spin" />}Save note</button></div></form>
    : <button className="k-btn outline sm tp-addnote" onClick={() => setOpen(true)}><Plus size={14} />Add note</button>;
}

export function ProfileShiftMenu({ id, status, eventId }: { id: string; status: string; eventId: string | null }) {
  const { run } = useAction();
  return <Menu label="Assignment options" width={200} trigger={({ toggle, open, id: m }) => <button className="k-icon-btn tm-dots" onClick={toggle} aria-expanded={open} aria-controls={m} aria-label="Assignment options"><MoreVertical size={15} /></button>}>{close => <>
    {status !== "confirmed" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setShiftStatus(id, "confirmed")); }}><CheckCircle2 size={14} />Confirm</button>}
    {status !== "pending" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setShiftStatus(id, "pending")); }}><Clock size={14} />Mark pending</button>}
    {eventId && <Link role="menuitem" className="k-menu-item" href={`/organizer/events/${eventId}?tab=ops`} onClick={close}><Eye size={14} />Open event</Link>}</>}</Menu>;
}
