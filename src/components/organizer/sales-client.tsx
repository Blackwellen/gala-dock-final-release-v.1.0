"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, ChevronDown, FileText, CalendarClock, UserRound, MoreHorizontal, Trophy, XCircle, GripVertical, MessageSquarePlus, CircleDot, CheckCircle2, Clock, Diamond, Ban } from "lucide-react";
import { Menu, Dialog, useAction } from "@/components/kit/client";
import { createLead, moveLead, loseLead, scheduleFollowUp, assignLead, addLeadNote, convertLead } from "@/lib/actions/sales";

export type BoardLead = { id: string; name: string; client_name: string; value: number; event_type: string; owner_name: string; image: string; avatar: string | null; stage: string };
const COLS = [
  { key: "new", label: "New", icon: CircleDot, cls: "new" }, { key: "qualified", label: "Qualified", icon: CheckCircle2, cls: "qualified" }, { key: "proposal", label: "Proposal", icon: Clock, cls: "proposal" },
  { key: "negotiating", label: "Negotiating", icon: Diamond, cls: "negotiating" }, { key: "won", label: "Won", icon: CheckCircle2, cls: "won" }, { key: "lost", label: "Lost", icon: Ban, cls: "lost" },
];
const TONE: Record<string, string> = { Festival: "pink", Corporate: "blue", Wedding: "green", Conference: "amber", Party: "amber", "Gala Dinner": "amber", Networking: "blue", "Food & Drink": "green", "Music Festival": "pink" };
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

export function PipelineBoard({ leads }: { leads: BoardLead[] }) {
  const { run } = useAction(); const router = useRouter(); const [items, setItems] = useState(leads); const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  useEffect(() => setItems(leads), [leads]);
  async function drop(stage: string) {
    const id = drag; setDrag(null); setOver(null); if (!id) return; const lead = items.find(l => l.id === id); if (!lead || lead.stage === stage) return;
    if (stage === "won" || stage === "lost") { router.push(`/organizer/sales/leads/${id}?action=${stage === "won" ? "convert" : "lose"}`); return; }
    setItems(xs => xs.map(l => (l.id === id ? { ...l, stage } : l)));
    const r = await run(() => moveLead(id, stage)); if (!r.ok) setItems(leads);
  }
  return <div className="sa-board">{COLS.map(c => { const col = items.filter(l => l.stage === c.key); const total = col.reduce((s, l) => s + l.value, 0); return <section key={c.key} className={`sa-col ${c.cls} ${over === c.key ? "over" : ""}`} aria-label={`${c.label} column`} onDragOver={e => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); void drop(c.key); }}>
    <header><div className="k-between"><span className="k-row" style={{ gap: 6 }}><c.icon size={14} /><b>{c.label}</b><span className="sa-n">{col.length}</span></span><AddLeadButton stage={c.key} compact /></div><div className="sa-total">{gbp(total)}</div></header>
    <div className="sa-cards">{col.map(l => <article key={l.id} className="sa-card" draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}>
      <Link href={`/organizer/sales/leads/${l.id}`} className="k-row" style={{ gap: 8, alignItems: "flex-start" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" className="sa-img" /><span className="k-grow" style={{ minWidth: 0 }}><b className="k-ellipsis" style={{ display: "block" }}>{l.name}</b><small className="k-ellipsis" style={{ display: "block" }}>{l.client_name}</small></span><GripVertical size={13} className="k-muted" aria-hidden /></Link>
      <b className="sa-val">{gbp(l.value)}</b>
      <div className="k-between"><span className={`k-chip ${TONE[l.event_type] ?? "gray"}`}>{l.event_type}</span>{/* eslint-disable-next-line @next/next/no-img-element */}{l.avatar ? <img src={l.avatar} alt={l.owner_name} className="k-avatar sm" /> : <span className="k-avatar sm">{l.owner_name.split(" ").map(s => s[0]).join("")}</span>}</div>
    </article>)}</div>
    <AddLeadButton stage={c.key} />
  </section>; })}</div>;
}

export function AddLeadButton({ stage = "new", compact, primary }: { stage?: string; compact?: boolean; primary?: boolean }) {
  const { run, pending } = useAction(); const params = useSearchParams(); const [open, setOpen] = useState(false);
  useEffect(() => { if (primary && params.get("new") === "lead") setOpen(true); }, [params, primary]);
  return <>
    {primary ? <Menu label="Add" width={220} trigger={({ toggle, open: o, id }) => <div className="k-split"><button className="k-btn primary lg" onClick={() => setOpen(true)}><Plus size={16} />Add lead</button><button className="k-btn primary lg" onClick={toggle} aria-expanded={o} aria-controls={id} aria-label="More"><ChevronDown size={15} /></button></div>}>{close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); setOpen(true); }}>New lead</button><Link role="menuitem" className="k-menu-item" href="/organizer/proposals/new?step=1" onClick={close}>New proposal</Link></>}</Menu>
      : compact ? <button className="k-icon-btn plain" style={{ width: 22, height: 22 }} aria-label={`Add lead to ${stage}`} onClick={() => setOpen(true)}><Plus size={14} /></button>
      : <button className="sa-add" onClick={() => setOpen(true)}><Plus size={14} />Add lead</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Add lead" sub="Capture an enquiry. You can qualify, propose and convert it later." wide>
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => createLead({ ...f, stage })); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Lead / event name <b>*</b></span><input className="k-input" name="name" required minLength={2} placeholder="e.g. Riverside Music Festival" /></label>
        <label className="k-field"><span>Client <b>*</b></span><input className="k-input" name="client_name" required /></label>
        <label className="k-field"><span>Contact name</span><input className="k-input" name="contact_name" /></label>
        <label className="k-field"><span>Contact email</span><input className="k-input" name="contact_email" type="email" /></label>
        <label className="k-field"><span>Event type</span><select className="k-select" name="event_type">{["Festival", "Corporate", "Wedding", "Conference", "Party", "Gala Dinner", "Networking", "Food & Drink"].map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="k-field"><span>Estimated value (£)</span><input className="k-input" name="value" type="number" min={0} step={100} /></label>
        <label className="k-field"><span>Expected date</span><input className="k-input" name="expected_date" type="date" /></label>
        <label className="k-field"><span>Location</span><input className="k-input" name="location" /></label>
        <label className="k-field"><span>Guests</span><input className="k-input" name="guests" placeholder="e.g. 200 – 300" /></label>
        <label className="k-field"><span>Source</span><select className="k-select" name="source">{["Website enquiry", "Referral", "Repeat client", "Marketplace", "Event", "Other"].map(t => <option key={t}>{t}</option>)}</select></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Create lead</button></div>
      </form>
    </Dialog>
  </>;
}

export function LeadActions({ id, stage, owners, events, proposalHref }: { id: string; stage: string; owners: string[]; events: { id: string; name: string }[]; proposalHref: string }) {
  const { run, pending } = useAction(); const params = useSearchParams();
  const [dlg, setDlg] = useState<"follow" | "convert" | "lose" | null>(null); const [mode, setMode] = useState<"create" | "link">("create");
  useEffect(() => { const a = params.get("action"); if (a === "convert") setDlg("convert"); if (a === "lose") setDlg("lose"); }, [params]);
  const closed = ["won", "lost"].includes(stage);
  return <div className="k-row k-wrap" style={{ gap: 8 }}>
    <button className="k-btn primary lg" disabled={pending || stage !== "new"} title={stage !== "new" ? "Already qualified" : ""} onClick={() => void run(() => moveLead(id, "qualified"))} style={{ minWidth: 100 }}>Qualify</button>
    <Link className="k-btn ghost lg" href={proposalHref}><FileText size={16} />Create proposal</Link>
    <button className="k-btn ghost lg" onClick={() => setDlg("follow")}><CalendarClock size={16} />Schedule follow-up</button>
    <Menu label="Assign" width={200} trigger={({ toggle, open, id: mid }) => <button className="k-btn ghost lg" onClick={toggle} aria-expanded={open} aria-controls={mid}><UserRound size={16} />Assign</button>}>{close => owners.map(o => <button key={o} role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => assignLead(id, o)); }}>{o}</button>)}</Menu>
    <Menu label="More" width={210} trigger={({ toggle, open, id: mid }) => <button className="k-btn ghost lg" onClick={toggle} aria-expanded={open} aria-controls={mid}>More<ChevronDown size={15} /></button>}>{close => <>
      <button role="menuitem" className="k-menu-item" disabled={closed} onClick={() => { close(); setDlg("convert"); }}><Trophy size={15} />Mark won &amp; convert</button>
      {["qualified", "proposal", "negotiating"].filter(s => s !== stage).map(s => <button key={s} role="menuitem" className="k-menu-item" disabled={closed} onClick={() => { close(); void run(() => moveLead(id, s)); }}>Move to {s}</button>)}
      <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" disabled={closed} onClick={() => { close(); setDlg("lose"); }}><XCircle size={15} />Mark as lost</button></>}</Menu>
    <Dialog open={dlg === "follow"} onClose={() => setDlg(null)} title="Schedule follow-up">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => scheduleFollowUp(id, new Date(String(f.get("at"))).toISOString(), String(f.get("note")))); if (r.ok) setDlg(null); }}>
        <label className="k-field"><span>When</span><input className="k-input" type="datetime-local" name="at" required /></label>
        <label className="k-field"><span>What</span><input className="k-input" name="note" defaultValue="Follow up call" /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="k-btn primary" disabled={pending}>Schedule</button></div>
      </form>
    </Dialog>
    <Dialog open={dlg === "convert"} onClose={() => setDlg(null)} title="Win and convert this lead" sub="Winning creates or links exactly one canonical event. Accepted proposal terms carry over.">
      <div className="k-col" style={{ gap: 10 }}>
        <label className="k-choice" aria-checked={mode === "create"}><input type="radio" name="mode" checked={mode === "create"} onChange={() => setMode("create")} /><span><b>Create a new event</b><small>A draft event is created from the lead&apos;s brief, date and client.</small></span></label>
        <label className="k-choice" aria-checked={mode === "link"}><input type="radio" name="mode" checked={mode === "link"} onChange={() => setMode("link")} /><span><b>Link an existing event</b><small>Use when the event already exists in this workspace.</small></span></label>
        {mode === "link" && <select className="k-select" id="link-ev" defaultValue="">{<option value="" disabled>Choose event…</option>}{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="k-btn primary" disabled={pending} onClick={async () => { const evId = mode === "link" ? (document.getElementById("link-ev") as HTMLSelectElement | null)?.value : undefined; const r = await run(() => convertLead(id, mode, evId || undefined)); if (r.ok) setDlg(null); }}><Trophy size={15} />Win lead</button></div>
      </div>
    </Dialog>
    <Dialog open={dlg === "lose"} onClose={() => setDlg(null)} title="Mark as lost">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => loseLead(id, String(new FormData(e.currentTarget).get("reason")))); if (r.ok) setDlg(null); }}>
        <label className="k-field"><span>Reason</span><select className="k-select" name="reason">{["Budget", "Chose another organizer", "Date unavailable", "Event cancelled by client", "No response", "Other"].map(r => <option key={r}>{r}</option>)}</select></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="k-btn danger" disabled={pending}>Mark lost</button></div>
      </form>
    </Dialog>
  </div>;
}

export function ActivityComposer({ id }: { id: string }) {
  const { run, pending } = useAction(); const [kind, setKind] = useState<"note" | "call" | "email" | "meeting">("note");
  return <form className="k-col" style={{ gap: 8 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => addLeadNote(id, kind, String(f.get("title")), String(f.get("detail")))); if (r.ok) e.currentTarget.reset(); }}>
    <div className="k-seg" role="tablist">{(["note", "call", "email", "meeting"] as const).map(k => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{k[0]!.toUpperCase() + k.slice(1)}</button>)}</div>
    <input className="k-input" name="title" placeholder="Summary" required maxLength={200} />
    <textarea className="k-textarea" name="detail" placeholder="Details (optional)" maxLength={2000} />
    <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn primary" disabled={pending}><MessageSquarePlus size={15} />Log activity</button></div>
  </form>;
}
export const MoreIcon = MoreHorizontal;
