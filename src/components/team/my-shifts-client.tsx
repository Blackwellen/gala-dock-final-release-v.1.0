"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, LogIn, LogOut, CalendarOff } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { respondShift, checkShift, requestMyLeave, cancelMyLeave } from "@/lib/actions/my-shifts";

export function ShiftButtons({ id, status, attendance }: { id: string; status: string; attendance: string }) {
  const { run, pending } = useAction();
  return <div className="k-row k-wrap" style={{ gap: 6 }}>
    {status === "pending" && <><button className="k-btn green sm" disabled={pending} onClick={() => void run(() => respondShift(id, true))}><CheckCircle2 size={13} />Confirm</button><button className="k-btn ghost sm" disabled={pending} onClick={() => void run(() => respondShift(id, false))}><XCircle size={13} />Decline</button></>}
    {["pending", "confirmed"].includes(status) && attendance === "not_arrived" && <button className="k-btn outline sm" disabled={pending} onClick={() => void run(() => checkShift(id, "in"))}><LogIn size={13} />Check in</button>}
    {attendance === "checked_in" && <button className="k-btn outline sm" disabled={pending} onClick={() => void run(() => checkShift(id, "out"))}><LogOut size={13} />Check out</button>}
  </div>;
}

export function LeaveRequestButton({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  if (!workspaces.length) return null;
  return <>
    <button className="k-btn outline" onClick={() => setOpen(true)}><CalendarOff size={15} />Request leave</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Request leave" sub="Approved leave blocks new shifts for those dates.">
      <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => requestMyLeave({ workspace: f.get("workspace"), from: f.get("from"), to: f.get("to"), kind: f.get("kind"), note: f.get("note") })); if (r.ok) setOpen(false); }}>
        {workspaces.length > 1 && <label className="k-field"><span>Team</span><select className="k-select" name="workspace">{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
        {workspaces.length === 1 && <input type="hidden" name="workspace" value={workspaces[0]!.id} />}
        <div className="k-grid k-g2"><label className="k-field"><span>From</span><input className="k-input" type="datetime-local" name="from" required /></label><label className="k-field"><span>To</span><input className="k-input" type="datetime-local" name="to" required /></label></div>
        <label className="k-field"><span>Type</span><select className="k-select" name="kind" defaultValue="annual"><option value="annual">Annual leave</option><option value="sick">Sick</option><option value="unpaid">Unpaid</option><option value="other">Other</option></select></label>
        <label className="k-field"><span>Note</span><textarea className="k-textarea" name="note" maxLength={500} /></label>
        <button className="k-btn primary" disabled={pending}>Send request</button>
      </form>
    </Dialog>
  </>;
}

export function CancelLeave({ id }: { id: string }) {
  const { run, pending } = useAction();
  return <button className="k-btn ghost sm" disabled={pending} onClick={() => void run(() => cancelMyLeave(id))}>Cancel</button>;
}
