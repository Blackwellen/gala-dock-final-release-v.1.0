"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Archive, Wand2 } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { timezones } from "@/lib/master-data";
import { createEventFromTemplate, archiveTemplate } from "@/lib/actions/templates";

const ZONES = timezones().map(z => z.tz);
const guessZone = () => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return ZONES.includes(z) ? z : "Europe/London"; } catch { return "Europe/London"; } };
/** Default start: 60 days out at 18:00 local (the date is required; the organiser always confirms it). */
const defaultStart = () => { const d = new Date(Date.now() + 60 * 864e5); d.setHours(18, 0, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`; };

/**
 * Template card actions (Q14 templates): create a private draft event straight from the template at a chosen start date and
 * timezone (`create_event_from_template` — programme, tasks and ticket windows keep their offsets), open it in the full wizard,
 * or archive a workspace template (every version; events already made from it are untouched).
 */
export function TemplateActions({ id, name, canWrite, canArchive }: { id: string; name: string; canWrite: boolean; canArchive: boolean }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false); const [archive, setArchive] = useState(false); const [rid, setRid] = useState("");
  const [v, setV] = useState(() => ({ name: name.replace(/^Gala Dock · /, ""), starts_at: defaultStart(), timezone: guessZone() }));
  return <div className="tpl-actions">
    <button className="k-btn primary" disabled={!canWrite} title={canWrite ? undefined : "Your role can view templates but not create events"} onClick={() => { setRid(crypto.randomUUID()); setOpen(true); }}><CalendarPlus size={15} />Create event</button>
    {canWrite && <Link className="k-btn outline" href={`/organizer/events/new?step=1&template=${id}`}><Wand2 size={15} />Use in wizard</Link>}
    {canArchive && <button className="k-icon-btn" aria-label={`Archive template ${name}`} title="Archive template (all versions)" onClick={() => setArchive(true)}><Archive size={15} /></button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={`New event from “${name}”`} sub="Creates a private draft. Programme, tasks and ticket release windows are placed relative to the start you choose; guests, money and bookings are never copied.">
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const r = await run(() => createEventFromTemplate({ template_id: id, ...v, ...(rid ? { request_id: rid } : {}) })); if (r.ok) setOpen(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Event name <b>*</b></span><input className="k-input" required minLength={2} maxLength={120} value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} /></label>
        <label className="k-field"><span>Starts (local time) <b>*</b></span><input className="k-input" type="datetime-local" required value={v.starts_at} onChange={e => setV(p => ({ ...p, starts_at: e.target.value }))} /><small>Required — every date in the plan is set from this.</small></label>
        <label className="k-field"><span>Timezone <b>*</b></span><select className="k-select" required value={v.timezone} onChange={e => setV(p => ({ ...p, timezone: e.target.value }))}>{ZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending || !v.starts_at || v.name.trim().length < 2}>Create draft event</button></div>
      </form>
    </Dialog>
    <Dialog open={archive} onClose={() => setArchive(false)} title={`Archive “${name}”?`} sub="Every version of this template is archived, including earlier versions, so it disappears from the library and the create-event wizard. Events already created from it are not changed."
      footer={<><button className="k-btn ghost" onClick={() => setArchive(false)}>Keep template</button><button className="k-btn danger" disabled={pending} onClick={async () => { const r = await run(() => archiveTemplate(id)); if (r.ok) setArchive(false); }}>Archive template</button></>}><span /></Dialog>
  </div>;
}
