"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Plus, ChevronDown, CalendarDays, Building2, Store, Ticket, Megaphone, Users, Wallet, Calendar, Loader2, ExternalLink } from "lucide-react";
import { Dialog, Menu, Toggle, useAction } from "@/components/kit/client";
import { startRun, decideApproval, toggleRoutine, createRoutine } from "@/lib/actions/agent";

const SCOPES = [["event", CalendarDays, "Event"], ["workspace", Building2, "Workspace"], ["provider", Store, "Provider"], ["ticketing", Ticket, "Ticketing"], ["promotion", Megaphone, "Promotion"], ["team", Users, "Team"], ["money", Wallet, "Money"], ["calendar", Calendar, "Calendar"]] as const;
type Ev = { id: string; name: string };

export type ComposerSkill = { id: string; title: string; description: string; available: boolean; locked: string | null; steps: string[] };
export function AgentComposer({ events, preset, skills = [], presetSkill = "", presetEvent = "" }: { events: Ev[]; preset: string; skills?: ComposerSkill[]; presetSkill?: string; presetEvent?: string }) {
  const [goal, setGoal] = useState(preset); const [scope, setScope] = useState<string[]>([]); const [ev, setEv] = useState(events.some(x => x.id === presetEvent) ? presetEvent : ""); const { run, pending } = useAction();
  const [skill, setSkill] = useState(skills.some(k => k.id === presetSkill && k.available) ? presetSkill : "");
  const chosen = skills.find(k => k.id === skill) ?? null;
  const submit = async () => { const r = await run(() => startRun({ goal, scope, event_id: ev || null, mission: skill || null })); if (r.ok) setGoal(""); };
  return <form className="ag-comp" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ag-box"><textarea value={goal} maxLength={1500} onChange={e => setGoal(e.target.value)} placeholder="e.g. Plan and launch the Neon Nights Festival, create a promotion plan, assign the team, check venue requirements and track ticket sales..." aria-label="Goal" />
      <div className="ag-boxbar">{skills.length > 0 && <select value={skill} onChange={e => setSkill(e.target.value)} aria-label="Skill" aria-describedby="ag-skill-help"><option value="">Any skill (Gala Agent chooses)</option>{skills.map(k => <option key={k.id} value={k.id} disabled={!k.available}>{k.title}{k.locked ? ` — ${k.locked}` : ""}</option>)}</select>}<select value={ev} onChange={e => setEv(e.target.value)} aria-label="Event"><option value="">Any event</option>{events.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="k-btn primary ag-send" disabled={pending || goal.trim().length < 8} aria-label="Start run">{pending ? <Loader2 size={18} className="k-spin" /> : <ArrowRight size={18} />}</button></div></div>
    {skills.length > 0 && <p id="ag-skill-help" className="ag-skill-help">{chosen ? <><b>{chosen.title}:</b> {chosen.description}{chosen.steps.length > 0 && <span className="ag-skill-steps">{chosen.steps.map((s, i) => <span key={`${s}-${i}`}>{i > 0 && <ArrowRight size={11} aria-hidden />}{s}</span>)}</span>}</> : skills.some(k => !k.available) ? "Pick a skill to give Gala Agent a set plan. Skills marked “Needs Pro” carry out approved actions and need the Pro plan." : "Pick a skill to give Gala Agent a set plan, or leave it to choose."}</p>}
    <div className="ag-scopes">{SCOPES.map(([k, I, l]) => <button type="button" key={k} aria-pressed={scope.includes(k)} onClick={() => setScope(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])}><I size={14} />{l}</button>)}</div>
  </form>;
}

export function NewRunSplit({ events }: { events: Ev[] }) {
  return <span className="tm-split"><Link className="k-btn primary" href="/organizer/agent#compose"><Plus size={16} />New run</Link><Menu label="Run templates" width={250} trigger={({ toggle, open, id }) => <button className="k-btn primary tm-caret" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Run templates"><ChevronDown size={15} /></button>}>{close => <>{events.slice(0, 5).map(e => <Link key={e.id} role="menuitem" className="k-menu-item" href={`/organizer/agent?goal=${encodeURIComponent(`Create a full event plan for ${e.name}`)}`} onClick={close}>Plan {e.name}</Link>)}<Link role="menuitem" className="k-menu-item" href="/organizer/agent?goal=Analyse%20ticket%20sales%20across%20my%20events" onClick={close}><ExternalLink size={14} />Analyse ticket sales</Link></>}</Menu></span>;
}

export function ApprovalButtons({ id }: { id: string }) {
  const { run, pending } = useAction();
  return <span className="k-row" style={{ gap: 8 }}><button className="k-btn outline sm ag-rej" disabled={pending} onClick={() => void run(() => decideApproval(id, false))}>Reject</button><button className="k-btn primary sm" disabled={pending} onClick={() => void run(() => decideApproval(id, true))}>Approve</button></span>;
}

export function RoutineToggle({ id, enabled, title }: { id: string; enabled: boolean; title: string }) {
  const [on, setOn] = useState(enabled); const { run } = useAction();
  return <Toggle checked={on} label={title} onChange={async v => { setOn(v); const r = await run(() => toggleRoutine(id, v), { refresh: false }); if (!r.ok) setOn(!v); }} />;
}

export function NewRoutineButton() {
  const [open, setOpen] = useState(false); const [v, setV] = useState({ title: "", schedule: "Every Monday at 09:00", detail: "" }); const { run, pending } = useAction();
  return <><button className="k-btn primary sm" onClick={() => setOpen(true)}><Plus size={14} />New routine</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="New routine" sub="Routines suggest and draft. Anything with impact still asks for approval.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => createRoutine(v)); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Name</span><input className="k-input" required minLength={3} value={v.title} onChange={e => setV(p => ({ ...p, title: e.target.value }))} /></label>
        <label className="k-field"><span>Schedule</span><select className="k-input" value={v.schedule} onChange={e => setV(p => ({ ...p, schedule: e.target.value }))}>{["Every day at 10:00", "Every Monday at 09:00", "7 days before event", "1st of month at 09:00"].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="k-field"><span>What should it do?</span><textarea className="k-textarea" maxLength={300} value={v.detail} onChange={e => setV(p => ({ ...p, detail: e.target.value }))} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Create</button></div></form></Dialog></>;
}
