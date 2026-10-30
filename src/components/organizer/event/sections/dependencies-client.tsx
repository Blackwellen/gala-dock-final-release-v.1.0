"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Check, X, Save } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { addDependency, removeDependency, decideApproval, setTaskDependencies } from "@/lib/events/plan";

type Opt = { id: string; label: string };
export type DepOptions = { tasks: (Opt & { milestone: boolean; done: boolean })[]; tiers: Opt[]; bookings: Opt[]; shifts: Opt[] };
const DEPENDENT = [["task", "Task"], ["milestone", "Milestone"], ["ticket_tier", "Ticket release"], ["booking", "Supplier booking"]] as const;
const PREREQ = [["task", "Task done"], ["milestone", "Milestone reached"], ["ticket_tier", "Ticket release on sale"], ["booking", "Booking confirmed"], ["payment", "Booking paid"], ["team", "Shift filled"], ["venue", "Venue confirmed"], ["compliance", "Provider compliance clear"], ["approval", "Sign-off (approval)"]] as const;
type DK = typeof DEPENDENT[number][0]; type PK = typeof PREREQ[number][0];
const LEAF = new Set<PK>(["venue", "compliance", "approval"]);

function itemsFor(o: DepOptions, k: DK | PK): Opt[] {
  switch (k) {
    case "task": return o.tasks; case "milestone": return o.tasks.filter(t => t.milestone);
    case "ticket_tier": return o.tiers; case "booking": case "payment": return o.bookings; case "team": return o.shifts;
    default: return [];
  }
}

/** Add-dependency dialog: what waits (task / milestone / ticket release / booking) for what (incl. payment, team, venue, compliance, sign-off). */
export function AddDependencyButton({ eventId, options, variant = "primary" }: { eventId: string; options: DepOptions; variant?: "primary" | "outline" }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const [dk, setDk] = useState<DK>("task"); const [di, setDi] = useState(""); const [pk, setPk] = useState<PK>("task"); const [pi, setPi] = useState("");
  const [hard, setHard] = useState(true); const [lagN, setLagN] = useState(0); const [unit, setUnit] = useState<1 | 60 | 1440>(60); const [note, setNote] = useState(""); const [exp, setExp] = useState("");
  const dItems = useMemo(() => itemsFor(options, dk), [options, dk]);
  const pItems = useMemo(() => itemsFor(options, pk).filter(x => !(x.id === di && (pk === dk || (["task", "milestone"].includes(pk) && ["task", "milestone"].includes(dk))))), [options, pk, di, dk]);
  const needsPre = !LEAF.has(pk);
  const ok = !!di && (!needsPre || !!pi) && lagN >= 0 && lagN * unit <= 525600;
  const reset = () => { setDi(""); setPi(""); setNote(""); setExp(""); setLagN(0); setHard(true); };
  return <><button className={`k-btn ${variant} sm`} onClick={() => setOpen(true)}><Plus size={14} />Add dependency</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add a dependency" sub="The first item waits until the second is done. Circular chains are refused." wide>
      <form className="k-grid k-g2 dp-form" onSubmit={async ev => { ev.preventDefault(); if (!ok) return;
        const r = await run(() => addDependency({ event_id: eventId, dependent_kind: dk, dependent_id: di, prerequisite_kind: pk, prerequisite_id: needsPre ? pi : null, hard, lag_minutes: lagN * unit, note: note.trim(), approval_expires_at: pk === "approval" && exp ? new Date(exp).toISOString() : null }));
        if (r.ok) { setOpen(false); reset(); } }}>
        <fieldset className="dp-fs"><legend>What waits</legend>
          <label className="k-field"><span>Kind</span><select className="k-select" value={dk} onChange={x => { setDk(x.target.value as DK); setDi(""); }}>{DEPENDENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Item <b>*</b></span><select className="k-select" required value={di} onChange={x => setDi(x.target.value)} disabled={!dItems.length}><option value="">{dItems.length ? "Choose…" : "None on this event yet"}</option>{dItems.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        </fieldset>
        <fieldset className="dp-fs"><legend>Waits for</legend>
          <label className="k-field"><span>Prerequisite</span><select className="k-select" value={pk} onChange={x => { setPk(x.target.value as PK); setPi(""); }}>{PREREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {needsPre ? <label className="k-field"><span>Item <b>*</b></span><select className="k-select" required value={pi} onChange={x => setPi(x.target.value)} disabled={!pItems.length}><option value="">{pItems.length ? "Choose…" : "None on this event yet"}</option>{pItems.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            : <p className="k-xs k-muted" style={{ margin: 0 }}>{pk === "venue" ? "Met when the venue booking is confirmed or an off-platform venue is recorded." : pk === "compliance" ? "Met when no held or confirmed provider has a blocking compliance gap." : "Creates a sign-off request on this dependency; an owner or manager approves or rejects it."}</p>}
        </fieldset>
        <label className="k-field"><span>Type</span><select className="k-select" value={hard ? "hard" : "soft"} onChange={x => setHard(x.target.value === "hard")}><option value="hard">Hard — blocks until met</option><option value="soft">Soft — warns only</option></select></label>
        <div className="k-field"><span id="dp-lag">Lag after the prerequisite</span><div className="k-row" style={{ gap: 6 }}><input className="k-input" type="number" min={0} max={525600} value={lagN} aria-labelledby="dp-lag" onChange={x => setLagN(Math.max(0, Number(x.target.value) || 0))} style={{ width: 90 }} /><select className="k-select" aria-label="Lag unit" value={unit} onChange={x => setUnit(Number(x.target.value) as 1 | 60 | 1440)}><option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option></select></div></div>
        {pk === "approval" && <label className="k-field"><span>Sign-off expires (optional)</span><input className="k-input" type="datetime-local" value={exp} onChange={x => setExp(x.target.value)} /></label>}
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Note</span><input className="k-input" maxLength={500} value={note} onChange={x => setNote(x.target.value)} placeholder="e.g. Deposit must clear before the stage build starts" /></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending || !ok}>Add dependency</button></div>
      </form>
    </Dialog></>;
}

export function RemoveDependencyButton({ id, label }: { id: string; label: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-icon-btn" aria-label={`Remove dependency ${label}`} title="Remove dependency" onClick={() => setOpen(true)}><Trash2 size={14} /></button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Remove this dependency?" sub={`${label}. The item stops waiting for it; this is recorded in the event history.`}
      footer={<><button className="k-btn ghost" onClick={() => setOpen(false)}>Keep</button><button className="k-btn danger" disabled={pending} onClick={async () => { const r = await run(() => removeDependency(id)); if (r.ok) setOpen(false); }}>Remove</button></>}><span /></Dialog></>;
}

/** Owner / manager sign-off on an approval prerequisite, with a reason (kept in the audit history). */
export function ApprovalDecision({ id, label }: { id: string; label: string }) {
  const { run, pending } = useAction(); const [mode, setMode] = useState<"approve" | "reject" | null>(null); const [reason, setReason] = useState("");
  return <><span className="k-row" style={{ gap: 6 }}><button className="k-btn outline sm" onClick={() => setMode("reject")}><X size={13} />Reject</button><button className="k-btn primary sm" onClick={() => setMode("approve")}><Check size={13} />Approve</button></span>
    <Dialog open={!!mode} onClose={() => setMode(null)} title={mode === "approve" ? "Approve this sign-off?" : "Reject this sign-off?"} sub={`For: ${label}.`}
      footer={<><button className="k-btn ghost" onClick={() => setMode(null)}>Cancel</button><button className={`k-btn ${mode === "approve" ? "primary" : "danger"}`} disabled={pending || (mode === "reject" && reason.trim().length < 3)} onClick={async () => { const r = await run(() => decideApproval(id, mode === "approve", reason.trim())); if (r.ok) { setMode(null); setReason(""); } }}>{mode === "approve" ? "Approve" : "Reject"}</button></>}>
      <label className="k-field"><span>Reason {mode === "reject" ? <b>*</b> : "(optional)"}</span><textarea className="k-textarea" maxLength={500} value={reason} onChange={x => setReason(x.target.value)} placeholder={mode === "reject" ? "What needs to change before this can be approved?" : "Anything the team should know"} /></label>
    </Dialog></>;
}

/** Task "depends on" list (set_task_dependencies replaces the task's task prerequisites in one call). */
export function TaskDependencyEditor({ tasks, current }: { tasks: { id: string; label: string; done: boolean }[]; current: Record<string, string[]> }) {
  const { run, pending } = useAction(); const [task, setTask] = useState(tasks[0]?.id ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set(current[tasks[0]?.id ?? ""] ?? []));
  const pick = (id: string) => { setTask(id); setSel(new Set(current[id] ?? [])); };
  const others = tasks.filter(t => t.id !== task);
  const dirty = [...sel].sort().join() !== [...(current[task] ?? [])].sort().join();
  return <div className="k-col" style={{ gap: 10 }}>
    <label className="k-field"><span>Task</span><select className="k-select" value={task} onChange={x => pick(x.target.value)}>{tasks.map(t => <option key={t.id} value={t.id}>{t.label}{current[t.id]?.length ? ` (${current[t.id]!.length})` : ""}</option>)}</select></label>
    <fieldset className="dp-checks"><legend className="k-xs k-muted">Depends on</legend>{others.map(t => <label key={t.id} className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={sel.has(t.id)} onChange={x => setSel(s => { const n = new Set(s); if (x.target.checked) n.add(t.id); else n.delete(t.id); return n; })} /><span className="k-small" style={{ textDecoration: t.done ? "line-through" : undefined }}>{t.label}</span></label>)}</fieldset>
    <button className="k-btn primary sm" disabled={pending || !task || !dirty || sel.size > 50} onClick={() => void run(() => setTaskDependencies(task, [...sel]))}><Save size={13} />Save task dependencies</button>
  </div>;
}
