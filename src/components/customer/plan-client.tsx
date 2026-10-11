"use client";
import { useState } from "react";
import { Plus, Share2 } from "lucide-react";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { addCustomerTask, addDayPlanItem } from "@/lib/actions/plan";

export function AddTaskBtn({ eventId, categories }: { eventId: string; categories: string[] }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-btn outline sm" onClick={() => setOpen(true)}><Plus size={14} />Add task</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add a task">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => addCustomerTask(eventId, f)); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Task</span><input className="k-input" name="title" required minLength={2} /></label>
        <div className="k-grid k-g2"><label className="k-field"><span>Section</span><select className="k-select" name="category">{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="k-field"><span>Due</span><input className="k-input" type="date" name="due_at" /></label></div>
        <label className="k-field"><span>Who</span><input className="k-input" name="assignee_name" defaultValue="You" /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add task</button></div>
      </form>
    </Dialog></>;
}
export function AddDayItem({ eventId }: { eventId: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-link" onClick={() => setOpen(true)}><Plus size={12} />Add to day plan</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add to your day plan">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => addDayPlanItem(eventId, f)); if (r.ok) setOpen(false); }}>
        <div className="k-grid k-g2"><label className="k-field"><span>Time</span><input className="k-input" type="time" name="time" required /></label><label className="k-field"><span>What</span><input className="k-input" name="title" required /></label></div>
        <label className="k-field"><span>Who / where</span><input className="k-input" name="detail" /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add</button></div>
      </form>
    </Dialog></>;
}
export function SharePlan({ eventId }: { eventId: string }) {
  const toast = useKitToast();
  return <button className="k-btn outline" onClick={async () => { const url = `${location.origin}/account/events/${eventId}/plan?tab=day`; try { await navigator.clipboard.writeText(url); toast("Plan link copied — shared viewers must have access to the event"); } catch { toast(url); } }}><Share2 size={14} />Share plan</button>;
}
