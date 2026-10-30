"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Share2, MoreHorizontal, Pencil, Copy, Trash2, Radio, LayoutTemplate, Archive, Check, Plus, X, Loader2, AlertTriangle, Lock } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { setEventStatus, updateEventBasics, addProgrammeItem, deleteProgrammeItem, addTask, toggleTask, reportIncident, resolveIncident, setRunSheetStatus, transitionItem, confirmVenueOffPlatform, savePublicPageSettings } from "@/lib/actions/event-profile";
import { archiveEvent, cancelEvent } from "@/lib/actions/events";
import { createGuestLink } from "@/lib/actions/event-guest-links";
import { useDuplicateDialog } from "./duplicate-dialog";
import { eventStatusOptions, type StatusOptions } from "@/lib/actions/event-lifecycle";

const LABEL: Record<string, string> = { draft: "Draft", planning: "Planning", ready: "Ready", published: "Published", on_sale: "On sale", live: "Live", completed: "Completed", closed: "Closed", archived: "Archived", cancelled: "Cancelled", postponed: "Postponed", suspended: "Suspended" };
type Blocker = { key: string; label: string; fix?: string };

export function StatusMenu({ id, status }: { id: string; status: string }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const router = useRouter(); const [confirm, setConfirm] = useState<string | null>(null); const [reason, setReason] = useState(""); const [cause, setCause] = useState<"organiser" | "force_majeure">("organiser"); const [fm, setFm] = useState("");
  // Options come from the server on open: state machine + role rule + live event_lifecycle_blockers preview (W11).
  const [opts, setOpts] = useState<StatusOptions | null>(null); const [loading, setLoading] = useState(false); const [loadErr, setLoadErr] = useState(""); const [blocked, setBlocked] = useState<{ to: string; blockers: Blocker[] } | null>(null); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setLoadErr(""); const r = await eventStatusOptions(id); setLoading(false); if (r.ok && r.data) setOpts(r.data); else setLoadErr(r.error ?? "Couldn’t load the status options."); };
  const move = async (to: string) => {
    setBusy(true); const r = await setEventStatus(id, to); setBusy(false);
    const b = (r.data as { blockers?: Blocker[] } | undefined)?.blockers;
    if (!r.ok && b?.length) { setBlocked({ to, blockers: b }); return; }
    if (!r.ok) { toast(r.error ?? "Could not update the event status.", "error"); return; }
    toast(r.message ?? "Status updated."); setOpts(null); router.refresh();
  };
  const tone = ["live", "on_sale", "published", "ready", "completed"].includes(status) ? "green" : ["cancelled", "suspended"].includes(status) ? "red" : status === "draft" ? "gray" : "blue";
  const current = opts?.status === status ? opts : null;
  return <>
    <Menu label="Change event status" width={280} trigger={({ toggle, open, id: mid }) => <div className={`eh-status ${tone}`}><span>{LABEL[status] ?? status}</span><button onClick={() => { toggle(); if (!open && !current && !loading) void load(); }} aria-expanded={open} aria-controls={mid} aria-label="Change status"><ChevronDown size={16} /></button></div>}>
      {close => <><div className="k-xs k-muted" style={{ padding: "6px 10px" }}>Move event to…</div>
        {loading || (!current && !loadErr) ? <p className="k-small" style={{ padding: 10 }} role="status"><Loader2 size={13} className="k-spin" /> Checking what this event can move to…</p>
          : loadErr ? <p className="k-small" style={{ padding: 10 }} role="alert">{loadErr} <button className="k-link" onClick={() => void load()}>Try again</button></p>
          : !current!.canWrite ? <p className="k-small" style={{ padding: 10 }}>{current!.options[0]?.reason ?? `Your role (${current!.role}) can view this event but can't change its status.`}</p>
          : current!.options.length ? current!.options.map(o => <button key={o.to} role="menuitem" className={`k-menu-item ev-status-opt ${["cancelled", "suspended"].includes(o.to) ? "k-red" : ""}`} disabled={pending || busy || (!o.allowed && !o.blockers.length)} title={o.reason ?? undefined} aria-describedby={o.reason ? `st-${o.to}` : undefined}
              onClick={() => { close(); if (!o.allowed && o.blockers.length) setBlocked({ to: o.to, blockers: o.blockers }); else if (["cancelled", "suspended", "postponed", "completed"].includes(o.to)) setConfirm(o.to); else void move(o.to); }}>
              <span className="k-grow">{LABEL[o.to] ?? o.to}</span>{o.reason && <small id={`st-${o.to}`} className={o.blockers.length ? "k-amber" : "k-muted"}>{o.blockers.length ? <AlertTriangle size={12} aria-hidden /> : <Lock size={12} aria-hidden />}{o.reason}</small>}</button>)
          : <p className="k-small" style={{ padding: 10 }}>No further status changes.</p>}</>}
    </Menu>
    <Dialog open={!!blocked} onClose={() => setBlocked(null)} title={`Before moving to ${blocked ? LABEL[blocked.to]?.toLowerCase() ?? blocked.to : ""}`} sub="Gala Dock checks these before an event can move on. Fix each one, then try again."
      footer={<><button className="k-btn ghost" onClick={() => setBlocked(null)}>Close</button><button className="k-btn primary" disabled={busy} onClick={() => { setBlocked(null); setOpts(null); void load(); }}>Check again</button></>}>
      <ul className="ev-blockers">{blocked?.blockers.map((b, i) => <li key={`${b.key}-${i}`}><AlertTriangle size={15} className="k-amber" aria-hidden /><span className="k-grow">{b.label}</span>{b.fix && b.fix.startsWith("/") && <Link className="k-link" href={b.fix} onClick={() => setBlocked(null)}>Fix</Link>}</li>)}</ul>
    </Dialog>
    <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={`Mark event as ${confirm ? LABEL[confirm]?.toLowerCase() : ""}?`} sub={confirm === "cancelled" ? "Cancellation is permanent. Every ticket is voided and each buyer is refunded in full, including fees, automatically. Confirmed supplier bookings keep their own cancellation terms." : confirm === "completed" ? "Completing closes check-in and opens settlement." : "Ticket holders and suppliers will see the updated status."}
      footer={<><button className="k-btn ghost" onClick={() => setConfirm(null)}>Keep current status</button><button className={`k-btn ${confirm === "completed" ? "primary" : "danger"}`} disabled={pending || (confirm === "cancelled" && (reason.trim().length < 10 || (cause === "force_majeure" && fm.trim().length < 30)))} onClick={async () => { const r = await run(() => confirm === "cancelled" ? cancelEvent(id, reason, cause, fm) : setEventStatus(id, confirm!), { refresh: true }); if (r.ok) { setConfirm(null); setReason(""); } }}>Confirm</button></>}>
      {confirm === "cancelled" ? <div className="k-col" style={{ gap: 12 }}>
        <label className="k-col" style={{ gap: 6 }}><span className="k-small">Message to attendees: why the event is cancelled</span><textarea className="k-input" rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} style={{ height: "auto" }} aria-describedby="cx-reason-hint" />
          <small id="cx-reason-hint" className="k-muted" aria-live="polite">At least 10 characters · {reason.trim().length}/10{reason.trim().length >= 10 ? " ✓" : ""}</small></label>
        <fieldset className="k-col" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}><legend className="k-small" style={{ marginBottom: 6 }}>Why can’t it go ahead?</legend>
          <label className="k-row" style={{ gap: 8, alignItems: "flex-start" }}><input type="radio" name="cancel-cause" checked={cause === "organiser"} onChange={() => setCause("organiser")} /><span><b>Our decision</b> — for example low sales, a change of plans or a lineup change.<br /><small className="k-muted">Platform fees on tickets already sold (5% commission plus VAT, and the £1 booking fees we refund to buyers) remain payable.</small></span></label>
          <label className="k-row" style={{ gap: 8, alignItems: "flex-start" }}><input type="radio" name="cancel-cause" checked={cause === "force_majeure"} onChange={() => setCause("force_majeure")} /><span><b>Force majeure</b> — it can’t lawfully or safely go ahead for reasons outside our control, such as a government order, the venue being closed by fire or flood, or a severe weather warning.<br /><small className="k-muted">Platform fees are put on hold while Gala Dock reviews your evidence, and waived in full if accepted.</small></span></label>
        </fieldset>
        {cause === "force_majeure" && <label className="k-col" style={{ gap: 6 }}><span className="k-small">What happened, and how it stops the event? Include links to evidence (official notice, venue letter, weather warning). Only your team and Gala Dock see this.</span><textarea className="k-input" rows={4} maxLength={4000} value={fm} onChange={e => setFm(e.target.value)} style={{ height: "auto" }} aria-describedby="cx-fm-hint" />
          <small id="cx-fm-hint" className="k-muted" aria-live="polite">At least 30 characters · {fm.trim().length}/30{fm.trim().length >= 30 ? " ✓" : ""}</small></label>}
        <p className="k-small k-muted" style={{ margin: 0 }}>Whatever the reason, every buyer gets a full refund, including the booking fee.</p>
      </div> : <span />}
    </Dialog>
  </>;
}

export function HeroActions({ id, name, slug, isPublic }: { id: string; name: string; slug: string | null; isPublic: boolean }) {
  const toast = useKitToast(); const { run, pending } = useAction(); const dup = useDuplicateDialog();
  const url = slug ? `${typeof window === "undefined" ? "" : window.location.origin}/events/${slug}` : "";
  return <div className="k-row" style={{ gap: 8 }}>
    {isPublic && slug ? <Link href={`/events/${slug}`} target="_blank" className="k-btn ghost"><ExternalLink size={15} />View public page</Link> : <span className="k-btn ghost" title="Publish the event to enable its public page" aria-disabled style={{ opacity: .75 }}><ExternalLink size={15} />Page not published</span>}
    <button className="k-btn ghost" disabled={pending} title={isPublic && slug ? "Copy the public event link" : "Copy a private guest link (expires; revocable)"} onClick={async () => {
      if (isPublic && slug) { try { await navigator.clipboard.writeText(url); toast("Public link copied"); } catch { toast(url); } return; }
      const r = await run(() => createGuestLink(id), { refresh: false }); const path = (r as { data?: { path: string } }).data?.path; if (!r.ok || !path) return;
      const link = `${window.location.origin}${path}`; try { await navigator.clipboard.writeText(link); toast("Private guest link copied"); } catch { toast(link); } }}><Share2 size={15} />Share</button>
    <Menu label={`More actions for ${name}`} width={220} trigger={({ toggle, open, id: mid }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label="More actions"><MoreHorizontal size={17} /></button>}>
      {close => <><button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); dup.open({ id, name }); }}><Copy size={15} />Duplicate event</button>
        <Link role="menuitem" className="k-menu-item" href={`/organizer/events/${id}/template?step=1`} onClick={close}><LayoutTemplate size={15} />Save as template</Link>
        <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" disabled={pending} onClick={() => { close(); void run(() => archiveEvent(id)); }}><Archive size={15} />Archive event</button></>}
    </Menu>
    {dup.dialog}
  </div>;
}

type Basic = { name: string; description: string; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; capacity: number | null; client_name: string; tags: string[] };
const local = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 16); };
export function TabActions({ id, name, status, basics }: { id: string; name: string; status: string; basics: Basic }) {
  const { run, pending } = useAction(); const [edit, setEdit] = useState(false); const [close, setClose] = useState(false); const dup = useDuplicateDialog();
  return <div className="k-row eh-tabactions" style={{ gap: 8 }}>
    <button className="k-btn outline" onClick={() => setEdit(true)}><Pencil size={15} />Edit event</button>
    <button className="k-btn outline" disabled={pending} onClick={() => dup.open({ id, name })}><Copy size={15} />Duplicate</button>{dup.dialog}
    <button className="k-btn outline" onClick={() => setClose(true)} disabled={!["live", "on_sale", "completed"].includes(status)} title={["live", "on_sale", "completed"].includes(status) ? "" : "Only live, on-sale or completed events can be closed"}><Trash2 size={15} />Close event</button>
    <Link href={`/organizer/events/${id}?tab=operations&section=live`} className="k-btn primary"><Radio size={15} />Live Mode</Link>
    <Dialog open={edit} onClose={() => setEdit(false)} title="Edit event" sub={name} wide>
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => updateEventBasics(id, { ...f, capacity: f.capacity ? Number(f.capacity) : null })); if (r.ok) setEdit(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Event name <b>*</b></span><input className="k-input" name="name" defaultValue={basics.name} required maxLength={120} /></label>
        <label className="k-field"><span>Starts</span><input className="k-input" type="datetime-local" name="starts_at" defaultValue={local(basics.starts_at)} /></label>
        <label className="k-field"><span>Ends</span><input className="k-input" type="datetime-local" name="ends_at" defaultValue={local(basics.ends_at)} /></label>
        <label className="k-field"><span>Venue</span><input className="k-input" name="venue_name" defaultValue={basics.venue_name} /></label>
        <label className="k-field"><span>Location</span><input className="k-input" name="location" defaultValue={basics.location} /></label>
        <label className="k-field"><span>Capacity</span><input className="k-input" name="capacity" type="number" min={0} defaultValue={basics.capacity ?? ""} /></label>
        <label className="k-field"><span>Client</span><input className="k-input" name="client_name" defaultValue={basics.client_name} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Tags (comma separated)</span><input className="k-input" name="tags" defaultValue={basics.tags.join(", ")} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Description</span><textarea className="k-textarea" name="description" defaultValue={basics.description} maxLength={4000} /></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setEdit(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Save changes</button></div>
      </form>
    </Dialog>
    <Dialog open={close} onClose={() => setClose(false)} title="Close this event?" sub="Closing ends check-in and ticket sales and moves the event to settlement. Financial records are kept." footer={<><button className="k-btn ghost" onClick={() => setClose(false)}>Cancel</button><button className="k-btn danger" disabled={pending} onClick={async () => { const r = await run(() => setEventStatus(id, status === "completed" ? "closed" : "completed")); if (r.ok) setClose(false); }}>Close event</button></>}><span /></Dialog>
  </div>;
}

// ── Small reusable islands ──────────────────────────────────────────────────
export function AddProgrammeButton({ eventId, kind, defaultDate, label = "Add act" }: { eventId: string; kind: "programme" | "run_sheet"; defaultDate: string | null; label?: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-btn primary sm" onClick={() => setOpen(true)}><Plus size={14} />{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={kind === "run_sheet" ? "Add run sheet item" : "Add programme item"}>
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => addProgrammeItem(eventId, { ...f, kind })); if (r.ok) setOpen(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Title <b>*</b></span><input className="k-input" name="title" required /></label>
        <label className="k-field"><span>Start <b>*</b></span><input className="k-input" type="datetime-local" name="starts_at" required defaultValue={local(defaultDate)} /></label>
        <label className="k-field"><span>Duration (minutes)</span><input className="k-input" type="number" name="duration_minutes" defaultValue={60} min={5} max={1440} /></label>
        <label className="k-field"><span>{kind === "run_sheet" ? "Area" : "Stage / area"}</span><input className="k-input" name="area" placeholder="Main Stage" /></label>
        <label className="k-field"><span>{kind === "run_sheet" ? "Owner" : "Detail"}</span><input className="k-input" name={kind === "run_sheet" ? "owner_name" : "detail"} /></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add</button></div>
      </form>
    </Dialog></>;
}
export function ProgrammeItemMenu({ eventId, itemId, title }: { eventId: string; itemId: string; title: string }) {
  const { run, pending } = useAction();
  return <Menu label={`Actions for ${title}`} width={180} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Actions for ${title}`}><MoreHorizontal size={15} /></button>}>
    {close => <button role="menuitem" className="k-menu-item k-red" disabled={pending} onClick={() => { close(); void run(() => deleteProgrammeItem(eventId, itemId)); }}><Trash2 size={14} />Remove</button>}
  </Menu>;
}
export function RunSheetStatus({ eventId, itemId, status }: { eventId: string; itemId: string; status: string }) {
  const { run, pending } = useAction();
  return <Menu label="Set status" width={160} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Set status"><MoreHorizontal size={15} /></button>}>
    {close => (["upcoming", "in_progress", "done"] as const).map(s => <button key={s} role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => setRunSheetStatus(eventId, itemId, s)); }}>{s === status && <Check size={14} />}{s === "in_progress" ? "In progress" : s[0]!.toUpperCase() + s.slice(1)}</button>)}
  </Menu>;
}
export function TaskCheck({ eventId, taskId, done, title }: { eventId: string; taskId: string; done: boolean; title: string }) {
  const { run, pending } = useAction(); const [v, setV] = useState(done);
  return <input type="checkbox" className="eh-check" checked={v} disabled={pending} aria-label={`Mark "${title}" ${v ? "not done" : "done"}`} onChange={async e => { setV(e.target.checked); const r = await run(() => toggleTask(eventId, taskId, e.target.checked), { refresh: true }); if (!r.ok) setV(!e.target.checked); }} />;
}
export function AddTaskButton({ eventId, category, label = "Add task", variant = "outline" }: { eventId: string; category?: string; label?: string; variant?: "outline" | "primary" | "soft" }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className={`k-btn ${variant} sm`} onClick={() => setOpen(true)}><Plus size={14} />{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={label}>
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => addTask(eventId, { ...f, category: category ?? f.category })); if (r.ok) setOpen(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Task <b>*</b></span><input className="k-input" name="title" required /></label>
        <label className="k-field"><span>Due</span><input className="k-input" type="date" name="due_at" /></label>
        <label className="k-field"><span>Priority</span><select className="k-select" name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="k-field"><span>Assignee</span><input className="k-input" name="assignee_name" /></label>
        {!category && <label className="k-field"><span>Category</span><select className="k-select" name="category"><option value="general">General</option><option value="operations">Operations</option><option value="hospitality">Hospitality</option><option value="logistics">Logistics</option><option value="risk">Risk</option><option value="marketing">Marketing</option></select></label>}
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add task</button></div>
      </form>
    </Dialog></>;
}
export function IncidentButton({ eventId, label = "Report incident" }: { eventId: string; label?: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-btn danger sm" onClick={() => setOpen(true)}><Plus size={14} />{label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Report an incident" sub="High and critical incidents notify the event team immediately.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => reportIncident(eventId, f)); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>What happened? <b>*</b></span><input className="k-input" name="title" required minLength={2} /></label>
        <label className="k-field"><span>Severity</span><select className="k-select" name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="k-field"><span>Details</span><textarea className="k-textarea" name="detail" maxLength={1000} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn danger" disabled={pending}>Record incident</button></div>
      </form>
    </Dialog></>;
}
export function ResolveIncident({ eventId, incidentId }: { eventId: string; incidentId: string }) {
  const { run, pending } = useAction();
  return <button className="k-btn ghost sm" disabled={pending} onClick={() => void run(() => resolveIncident(eventId, incidentId))}><Check size={13} />Resolve</button>;
}
export function ItemActions({ eventId, itemId, status, title, canConfirm }: { eventId: string; itemId: string; status: string; title: string; canConfirm: boolean }) {
  const { run, pending } = useAction(); const [hold, setHold] = useState(false); const [confirm, setConfirm] = useState(false);
  const can = { sent: ["suggested", "draft", "expired", "declined"].includes(status), held: ["available", "quoted"].includes(status), confirmed: ["available", "quoted", "held"].includes(status), standby: ["suggested", "available", "quoted"].includes(status), cancelled: !["fulfilled", "cancelled"].includes(status) };
  return <>
    <Menu label={`Actions for ${title}`} width={220} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Actions for ${title}`}><MoreHorizontal size={15} /></button>}>
      {close => <>
        {can.sent && <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => transitionItem(eventId, itemId, "sent")); }}>Send request</button>}
        {can.held && <button role="menuitem" className="k-menu-item" onClick={() => { close(); setHold(true); }}>Place conditional hold</button>}
        {can.confirmed && <button role="menuitem" className="k-menu-item" disabled={!canConfirm} title={canConfirm ? "" : "Owners and managers confirm bookings"} onClick={() => { close(); setConfirm(true); }}>Confirm booking</button>}
        {can.standby && <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => transitionItem(eventId, itemId, "standby")); }}>Make standby / backup</button>}
        {/* Confirmed/held bookings cancel through the cancellation engine (policy refund, provider notice, standby prompt). */}
        {can.cancelled && <><div className="k-menu-sep" />{["confirmed", "held"].includes(status) ? <Link role="menuitem" className="k-menu-item k-red" href={`/organizer/marketplace/bookings/${itemId}#cancel`} onClick={close}>Cancel booking…</Link> : <button role="menuitem" className="k-menu-item k-red" disabled={pending} onClick={() => { close(); void run(() => transitionItem(eventId, itemId, "cancelled")); }}>Remove option</button>}</>}
      </>}
    </Menu>
    <Dialog open={hold} onClose={() => setHold(false)} title={`Hold ${title}`} sub="A conditional hold reserves the provider for a limited time. It expires automatically if you don't confirm.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const h = Number(new FormData(e.currentTarget).get("hours")); const r = await run(() => transitionItem(eventId, itemId, "held", h)); if (r.ok) setHold(false); }}>
        <label className="k-field"><span>Hold length</span><select className="k-select" name="hours" defaultValue="24">{[2, 4, 8, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}</select></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setHold(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Place hold</button></div>
      </form>
    </Dialog>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Confirm ${title}?`} sub="This creates a binding booking at the quoted price and terms. Deposits are collected through the provider's payment terms." footer={<><button className="k-btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="k-btn primary" disabled={pending} onClick={async () => { const r = await run(() => transitionItem(eventId, itemId, "confirmed")); if (r.ok) setConfirm(false); }}>Confirm booking</button></>}><span /></Dialog>
  </>;
}
export function VenueConfirm({ eventId, venueName }: { eventId: string; venueName: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-btn outline sm" onClick={() => setOpen(true)}>Record off-platform venue</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Record a confirmed venue" sub="Use this when the venue was booked outside Gala Dock. It counts towards readiness and is recorded in the audit history.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => confirmVenueOffPlatform(eventId, String(new FormData(e.currentTarget).get("venue")))); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Venue name</span><input className="k-input" name="venue" defaultValue={venueName} required /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Record venue</button></div>
      </form>
    </Dialog></>;
}
export function PublicPageToggles({ eventId, initial }: { eventId: string; initial: Record<string, boolean> }) {
  const { run } = useAction(); const [v, setV] = useState(initial);
  const rows: [string, string][] = [["details", "Event details"], ["tickets", "Ticket selection"], ["map", "Venue map"], ["faqs", "FAQs"], ["lineup", "Artist lineup"], ["terms", "Terms & policies"]];
  return <div className="k-col" style={{ gap: 6 }}>{rows.map(([k, l]) => <label key={k} className="k-between k-small" style={{ color: "var(--k-ink-2)" }}>{l}<button type="button" role="switch" aria-checked={!!v[k]} aria-label={l} className="k-toggle" onClick={async () => { const next = { ...v, [k]: !v[k] }; setV(next); const r = await run(() => savePublicPageSettings(eventId, next), { refresh: false }); if (!r.ok) setV(v); }} /></label>)}</div>;
}
export function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const toast = useKitToast();
  return <button className="k-link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + path); toast("Link copied"); } catch { toast(window.location.origin + path); } }}>{label}</button>;
}
export const CloseX = X;

export function StatusButton({ eventId, to, children, className = "k-btn primary block lg", disabled, title }: { eventId: string; to: string; children: React.ReactNode; className?: string; disabled?: boolean; title?: string }) {
  const { run, pending } = useAction();
  return <button className={className} disabled={pending || disabled} title={title} onClick={() => void run(() => setEventStatus(eventId, to))}>{children}</button>;
}
