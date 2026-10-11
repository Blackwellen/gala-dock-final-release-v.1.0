"use client";
import { useState } from "react";
import { Link2, Loader2, MoreVertical, Copy } from "lucide-react";
import { Dialog, Menu, useAction, useKitToast } from "@/components/kit/client";
import { setDistribution, createPromoter, setPromotionStatus } from "@/lib/actions/promotion";

export function DistToggle({ eventId, k, on, disabled, label }: { eventId: string; k: string; on: boolean; disabled?: boolean; label: string }) {
  const [v, setV] = useState(on); const { run } = useAction();
  return <input type="checkbox" className="pr-cb" checked={v} disabled={disabled} aria-label={`List on ${label}`} onChange={async x => { const n = x.target.checked; setV(n); const r = await run(() => setDistribution({ event_id: eventId, key: k, on: n }), { refresh: false }); if (!r.ok) setV(!n); }} />;
}

export function PromoterButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState({ name: "", pct: "10" }); const [code, setCode] = useState(""); const { run, pending } = useAction(); const toast = useKitToast();
  return <><button className="k-btn primary sm" onClick={() => { setOpen(true); setCode(""); }}><Link2 size={14} />Create promoter link</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Create promoter link" sub="Promoters get a tracked link; their ticket sales and commission are recorded automatically.">
      {code ? <div className="k-col" style={{ gap: 10 }}><div className="ac-feed"><code>{`${location.origin}/r/${code}`}</code><button className="k-icon-btn" aria-label="Copy link" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/r/${code}`); toast("Link copied"); } catch { toast("Couldn't copy", "error"); } }}><Copy size={14} /></button></div><button className="k-btn primary" onClick={() => setOpen(false)}>Done</button></div>
        : <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => createPromoter({ event_id: eventId, name: v.name, commission_pct: Number(v.pct) })); if (r.ok && r.data) setCode((r.data as { code: string }).code); }}>
          <label className="k-field"><span>Promoter name</span><input className="k-input" required minLength={2} value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} /></label>
          <label className="k-field"><span>Commission %</span><input className="k-input" inputMode="decimal" value={v.pct} onChange={e => setV(p => ({ ...p, pct: e.target.value.replace(/[^0-9.]/g, "") }))} /></label>
          <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}Create link</button></div></form>}
    </Dialog></>;
}

export function PromoMenu({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  return <Menu label="Campaign options" width={180} trigger={({ toggle, open, id: m }) => <button className="k-icon-btn mn-dots" onClick={toggle} aria-expanded={open} aria-controls={m} aria-label="Campaign options"><MoreVertical size={15} /></button>}>{close => <>
    {status === "draft" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setPromotionStatus(id, "scheduled")); }}>Schedule</button>}
    {status === "scheduled" && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setPromotionStatus(id, "draft")); }}>Move back to draft</button>}
    {!["completed", "requires_approval"].includes(status) && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setPromotionStatus(id, "completed")); }}>Mark completed</button>}</>}</Menu>;
}
