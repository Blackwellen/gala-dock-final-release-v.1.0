"use client";
import { useState } from "react";
import { PenLine, UserPlus, Loader2, Search } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { updateRequest, inviteToRequest } from "@/lib/actions/request-edit";
import { isoToWall, wallToIso } from "@/lib/events/wall-time";

type Brief = { id: string; title: string; scope: string; budget_min: number | null; budget_max: number | null; response_deadline: string | null };

/** Q57: edit this request in place (it used to open the new-request wizard and create a second RFQ). */
export function RequestEdit({ r, disabled }: { r: Brief; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const [v, setV] = useState({ title: r.title, scope: r.scope ?? "", min: r.budget_min == null ? "" : String(r.budget_min), max: r.budget_max == null ? "" : String(r.budget_max), due: isoToWall(r.response_deadline) });
  return <>
    <button type="button" className="k-btn primary lg" disabled={disabled} title={disabled ? "Reopen or create a new request to edit it" : undefined} onClick={() => setOpen(true)}><PenLine size={15} />Edit request</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Edit request" sub="Providers who are still quoting get a message that the brief changed.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault();
        const res = await run(() => updateRequest(r.id, { title: v.title, scope: v.scope, budget_min: v.min === "" ? null : Number(v.min), budget_max: v.max === "" ? null : Number(v.max), response_deadline: v.due ? wallToIso(v.due) : null }), { refresh: true });
        if (res.ok) setOpen(false); }}>
        <label className="k-field"><span>Title</span><input className="k-input" required minLength={3} maxLength={160} value={v.title} onChange={e => setV(p => ({ ...p, title: e.target.value }))} /></label>
        <label className="k-field"><span>Scope and requirements</span><textarea className="k-input" rows={5} maxLength={3000} value={v.scope} onChange={e => setV(p => ({ ...p, scope: e.target.value }))} /></label>
        <div className="k-grid k-g2" style={{ gap: 10 }}>
          <label className="k-field"><span>Budget from (£)</span><input className="k-input" type="number" min={0} step="1" inputMode="numeric" value={v.min} onChange={e => setV(p => ({ ...p, min: e.target.value }))} /></label>
          <label className="k-field"><span>Budget to (£)</span><input className="k-input" type="number" min={0} step="1" inputMode="numeric" value={v.max} onChange={e => setV(p => ({ ...p, max: e.target.value }))} /></label>
        </div>
        <label className="k-field"><span>Responses due (UK time)</span><input className="k-input" type="datetime-local" value={v.due} onChange={e => setV(p => ({ ...p, due: e.target.value }))} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={15} className="k-spin" />}Save changes</button></div>
      </form>
    </Dialog>
  </>;
}

type Cand = { id: string; name: string; category: string; city: string; rating: number };
/** Q57: add providers to this request (same reference and deadline) instead of starting a new one. */
export function RequestInvite({ requestId, candidates, disabled }: { requestId: string; candidates: Cand[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [sel, setSel] = useState<string[]>([]); const { run, pending } = useAction();
  const shown = candidates.filter(c => !q.trim() || `${c.name} ${c.category} ${c.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <>
    <button type="button" className="k-btn ghost lg" disabled={disabled} title={disabled ? "Reopen the request to invite more providers" : undefined} onClick={() => setOpen(true)}><UserPlus size={15} />Invite providers</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Invite providers" sub="They receive this request with the same brief and deadline.">
      <div className="k-col" style={{ gap: 10 }}>
        <label className="k-field"><span className="k-sr-only">Search providers</span><span className="k-row" style={{ gap: 6 }}><Search size={15} aria-hidden /><input className="k-input k-grow" placeholder="Search by name, category or city" value={q} onChange={e => setQ(e.target.value)} /></span></label>
        {shown.length ? <ul className="k-list" style={{ maxHeight: 320, overflow: "auto" }}>{shown.map(c => { const on = sel.includes(c.id); return <li key={c.id}><label className="k-row" style={{ gap: 10, minHeight: 44 }}><input type="checkbox" checked={on} onChange={() => setSel(s => on ? s.filter(x => x !== c.id) : s.length >= 12 ? s : [...s, c.id])} /><span className="k-grow"><b>{c.name}</b><small className="k-muted"> · {c.category}{c.city ? ` · ${c.city}` : ""} · {c.rating.toFixed(1)}★</small></span></label></li>; })}</ul>
          : <p className="k-small">No other matching providers on the marketplace.</p>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="k-btn primary" disabled={pending || !sel.length} onClick={async () => { const res = await run(() => inviteToRequest(requestId, sel), { refresh: true }); if (res.ok) { setSel([]); setOpen(false); } }}>{pending && <Loader2 size={15} className="k-spin" />}Invite {sel.length || ""}</button></div>
      </div>
    </Dialog>
  </>;
}
