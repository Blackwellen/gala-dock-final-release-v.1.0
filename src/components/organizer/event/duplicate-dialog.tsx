"use client";
import { useState, type ReactNode } from "react";
import { Dialog, useAction } from "@/components/kit/client";
import { TIMEZONES } from "@/lib/master-data";
import { duplicateEvent } from "@/lib/actions/events";

type Source = { id: string; name: string; timezone?: string | null };

/**
 * "Duplicate event" confirmation (Q14, W03 journey 4): asks for the new start date and timezone and states exactly what is and
 * isn't copied. The server (`duplicate_event`) shifts programme, tasks and ticket windows to the new date in one transaction.
 */
export function useDuplicateDialog(): { open: (source: Source) => void; dialog: ReactNode } {
  const { run, pending } = useAction();
  const [src, setSrc] = useState<Source | null>(null);
  const [starts, setStarts] = useState(""); const [tz, setTz] = useState("Europe/London"); const [name, setName] = useState("");
  const [ok, setOk] = useState(false); const [requestId, setRequestId] = useState("");
  const open = (s: Source) => { setSrc(s); setStarts(""); setTz(s.timezone && TIMEZONES.some(z => z.tz === s.timezone) ? s.timezone : "Europe/London"); setName(`${s.name} (copy)`.slice(0, 120)); setOk(false); setRequestId(crypto.randomUUID()); };
  const close = () => setSrc(null);
  const submit = async () => {
    if (!src) return;
    const r = await run(() => duplicateEvent(src.id, { starts_at: starts, timezone: tz, name, confirm: ok, request_id: requestId }));
    if (r.ok) close();
  };
  const dialog = <Dialog open={!!src} onClose={close} title="Duplicate event" sub={src?.name}
    footer={<><button className="k-btn ghost" onClick={close}>Cancel</button><button className="k-btn primary" disabled={pending || !starts || !ok || !name.trim()} onClick={() => void submit()}>Create draft copy</button></>}>
    <div className="k-col" style={{ gap: 12 }}>
      <label className="k-field"><span>Name of the copy <b>*</b></span><input className="k-input" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
      <div className="k-grid k-g2">
        <label className="k-field"><span>New start date and time <b>*</b></span><input className="k-input" type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} required /></label>
        <label className="k-field"><span>Timezone <b>*</b></span><select className="k-select" value={tz} onChange={e => setTz(e.target.value)}>{TIMEZONES.map(z => <option key={z.tz} value={z.tz}>{z.label}</option>)}</select></label>
      </div>
      <p className="k-small" style={{ margin: 0 }}><b>Copied and moved to the new date:</b> programme and run sheet times, task deadlines (tasks reopen, unassigned), ticket tiers as drafts with sale windows shifted, page layout and event settings.</p>
      <p className="k-small k-muted" style={{ margin: 0 }}><b>Not copied:</b> guests, tickets sold, orders and payments, supplier bookings and holds, seats, staff shifts, incidents, files, share links, venue confirmation, permits and insurance.</p>
      <label className="k-row" style={{ gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /><span className="k-small">I understand — create a private draft for the new date.</span></label>
    </div>
  </Dialog>;
  return { open, dialog };
}
