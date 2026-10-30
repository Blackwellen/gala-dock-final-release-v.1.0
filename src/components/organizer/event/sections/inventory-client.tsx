"use client";
import { useState } from "react";
import { Plus, PenLine, KeyRound, RefreshCw } from "lucide-react";
import { Card, Chip } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { saveAllocation, setAllocationStatus, deleteAllocation, createAccessCode, setAccessCodeStatus, syncPromoterAllocations, type SyncRow } from "@/lib/events/inventory-actions";
import { ActionButton, toIso, intOrNull } from "./s2-shared";

export type Alloc = { id: string; kind: string; label: string; promoter_id: string | null; quantity: number; used: number; status: string };
type TierOpt = { id: string; name: string; quantity: number };
type Promoter = { id: string; name: string; status: string; allocation: number; sold: number };
const KINDS = [["comp", "Comps"], ["guest", "Guest list"], ["vip", "VIP"], ["accessible", "Accessible"], ["partner", "Partner"], ["promoter", "Promoter"], ["hold", "Hold"]] as const;

export function AllocationButton({ eventId, tiers, promoters, tierId, alloc }: { eventId: string; tiers: TierOpt[]; promoters: Promoter[]; tierId?: string; alloc?: Alloc & { tier_id: string } }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const init = () => ({ tier: alloc?.tier_id ?? tierId ?? tiers[0]?.id ?? "", kind: alloc?.kind ?? "comp", label: alloc?.label ?? "", qty: alloc ? String(alloc.quantity) : "", promoter: alloc?.promoter_id ?? "" });
  const [f, setF] = useState(init);
  const save = async () => {
    const r = await run(() => saveAllocation(eventId, { tier_id: f.tier, kind: f.kind, label: f.label, quantity: intOrNull(f.qty) ?? 0, promoter_id: f.kind === "promoter" ? f.promoter || null : null }, alloc?.id));
    if (r.ok) setOpen(false);
  };
  const tier = tiers.find(t => t.id === f.tier);
  return <>
    {alloc ? <button type="button" className="k-icon-btn" aria-label={`Edit allocation ${alloc.label || alloc.kind}`} title="Edit allocation" onClick={() => { setF(init()); setOpen(true); }}><PenLine size={14} /></button>
      : <button type="button" className={`k-btn ${tierId ? "ghost" : "primary"} sm`} aria-label={tierId ? `Reserve tickets on ${tiers.find(t => t.id === tierId)?.name ?? "this tier"}` : "New allocation"} onClick={() => { setF(init()); setOpen(true); }}><Plus size={14} />{tierId ? "Reserve" : "New allocation"}</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={alloc ? "Edit allocation" : "Reserve tickets"} sub="Reserved tickets leave public sale and are sold only through linked access codes."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.tier || !intOrNull(f.qty) || (f.kind === "promoter" && !f.promoter)} onClick={() => void save()}>Save allocation</button></>}>
      <div className="k-grid k-g2">
        <label className="k-field"><span>Ticket tier <b>*</b></span><select className="k-select" value={f.tier} disabled={!!alloc && alloc.used > 0} onChange={e => setF({ ...f, tier: e.target.value })}>{tiers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.quantity})</option>)}</select></label>
        <label className="k-field"><span>Purpose</span><select className="k-select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {f.kind === "promoter" && <label className="k-field"><span>Promoter <b>*</b></span><select className="k-select" value={f.promoter} onChange={e => setF({ ...f, promoter: e.target.value })}><option value="">Choose…</option>{promoters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{!promoters.length && <small>Add promoters in Sell › Promoters first.</small>}</label>}
        <label className="k-field"><span>Tickets <b>*</b></span><input className="k-input" inputMode="numeric" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value.replace(/\D/g, "").slice(0, 7) })} />{tier && <small>Tier holds {tier.quantity}; all allocations on it together can&apos;t exceed that.</small>}{alloc && alloc.used > 0 && <small>{alloc.used} already used — can&apos;t go lower.</small>}</label>
        <label className="k-field"><span>Label</span><input className="k-input" value={f.label} maxLength={80} placeholder="e.g. Sponsor guests" onChange={e => setF({ ...f, label: e.target.value })} /></label>
      </div>
    </Dialog>
  </>;
}

export function AllocationActions({ eventId, alloc, synced, tiers, promoters }: { eventId: string; alloc: Alloc & { tier_id: string }; synced: boolean; tiers: TierOpt[]; promoters: Promoter[] }) {
  const name = alloc.label || alloc.kind;
  return <span className="ax-actions">
    {!synced && alloc.status === "active" && <AllocationButton eventId={eventId} tiers={tiers} promoters={promoters} alloc={alloc} />}
    {alloc.status === "active" ? <ActionButton label={`Release ${name}`} className="k-btn ghost sm" run={() => setAllocationStatus(eventId, alloc.id, "released")} confirm={{ title: `Release ${name}?`, text: `${Math.max(0, alloc.quantity - alloc.used)} unused tickets go back on public sale. Linked codes stop drawing from it.${synced ? " Syncing promoters again will recreate it." : ""}`, cta: "Release" }}>Release</ActionButton>
      : <ActionButton label={`Reactivate ${name}`} className="k-btn ghost sm" run={() => setAllocationStatus(eventId, alloc.id, "active")}>Reactivate</ActionButton>}
    {alloc.used === 0 && !synced && <ActionButton label={`Delete ${name}`} className="k-btn ghost sm" run={() => deleteAllocation(eventId, alloc.id)} confirm={{ title: `Delete ${name}?`, text: "Nothing was issued from it. Linked access codes stay but no longer draw reserved tickets.", cta: "Delete", danger: true }}>Delete</ActionButton>}
  </span>;
}

export function AccessCodeButton({ eventId, allocationId, label }: { eventId: string; allocationId: string; label: string }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const blank = { code: "", max: "", per: "", from: "", until: "" };
  const [f, setF] = useState(blank);
  const suggest = () => setF(x => ({ ...x, code: `${label.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "ACCESS"}-${Math.random().toString(36).slice(2, 7).toUpperCase()}` }));
  const save = async () => { const r = await run(() => createAccessCode(eventId, allocationId, { code: f.code, max_uses: intOrNull(f.max), per_customer_limit: intOrNull(f.per), valid_from: toIso(f.from), valid_until: toIso(f.until) })); if (r.ok) { setOpen(false); setF(blank); } };
  return <>
    <button type="button" className="k-btn ghost sm" aria-label={`Add access code for ${label}`} onClick={() => setOpen(true)}><KeyRound size={13} />Code</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="New access code" sub={`Unlocks the reserved tickets in “${label}”. No discount is applied.`}
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !/^[A-Za-z0-9_-]{4,32}$/.test(f.code)} onClick={() => void save()}>Create code</button></>}>
      <div className="k-grid k-g2">
        <label className="k-field"><span>Code <b>*</b></span><input className="k-input" value={f.code} maxLength={32} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} /><small><button type="button" className="k-link" onClick={suggest}>Suggest a code</button></small></label>
        <label className="k-field"><span>Total uses</span><input className="k-input" inputMode="numeric" value={f.max} placeholder="Up to the allocation" onChange={e => setF({ ...f, max: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="k-field"><span>Per customer</span><input className="k-input" inputMode="numeric" value={f.per} placeholder="No limit" onChange={e => setF({ ...f, per: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></label>
        <span />
        <label className="k-field"><span>Valid from</span><input className="k-input" type="datetime-local" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
        <label className="k-field"><span>Valid until</span><input className="k-input" type="datetime-local" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} /></label>
      </div>
    </Dialog>
  </>;
}

export function CodeToggle({ eventId, code }: { eventId: string; code: { id: string; code: string; status: string } }) {
  return code.status === "disabled"
    ? <ActionButton label={`Enable ${code.code}`} className="k-btn ghost sm" run={() => setAccessCodeStatus(eventId, code.id, "active")}>Enable</ActionButton>
    : <ActionButton label={`Disable ${code.code}`} className="k-btn ghost sm" run={() => setAccessCodeStatus(eventId, code.id, "disabled")} confirm={{ title: `Disable ${code.code}?`, text: "Buyers can no longer apply it. Orders already placed keep their tickets.", cta: "Disable", danger: true }}>Disable</ActionButton>;
}

export function PromoterSync({ eventId, canWrite, tiers, promoters }: { eventId: string; canWrite: boolean; tiers: TierOpt[]; promoters: (Promoter & { mirror: (Alloc & { tier_id: string }) | null })[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [tier, setTier] = useState(""); const [result, setResult] = useState<SyncRow[] | null>(null);
  const withQuota = promoters.filter(p => p.allocation > 0), synced = promoters.filter(p => p.mirror).length;
  const go = async () => { const r = await run(() => syncPromoterAllocations(eventId, tier || null)); if (r.ok) { setResult((r.data as SyncRow[] | undefined) ?? []); setOpen(false); } };
  return <Card>
    <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15 }}>Promoter allocations</h2><p className="k-xs k-muted">Mirror each promoter&apos;s ticket allocation into a reserved promoter allocation.</p></div>
      {synced > 0 && <Chip tone="purple">{synced} synced</Chip>}</div>
    {promoters.length ? <div className="k-list">{promoters.map(p => <div key={p.id} className="k-li ax-li">
      <div className="k-grow" style={{ minWidth: 0 }}><b className="k-small k-strong k-ellipsis">{p.name}</b>
        <div className="k-xs k-muted">{p.allocation ? `${p.allocation} allocated · ${p.sold} sold` : "No ticket allocation"}{p.status !== "active" ? ` · ${p.status}` : ""}</div></div>
      {p.mirror ? <span className="k-xs k-strong">{p.mirror.quantity - p.mirror.used} reserved</span> : <span className="k-xs k-muted">Not synced</span>}
    </div>)}</div> : <p className="k-small">No promoters on this event yet.</p>}
    {result && <div className="k-notice" style={{ marginTop: 10 }} role="status"><span>{result.filter(r => r.capped).length ? `${result.filter(r => r.capped).map(r => r.name).join(", ")} limited by the tier's free stock.` : "All promoter allocations fit."}{result.some(r => r.reason === "no_tier") ? " Some promoters were skipped — this event has no sellable tier." : ""}</span></div>}
    {canWrite && withQuota.length > 0 && <>
      <button type="button" className="k-btn outline block sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><RefreshCw size={14} />Sync promoter allocations</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sync promoter allocations" sub="Reserves what each promoter still has to sell (allocation minus tickets they've sold)."
        footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending} onClick={() => void go()}>Sync now</button></>}>
        <div className="k-col" style={{ gap: 10 }}>
          <label className="k-field"><span>Tier for new promoter allocations</span><select className="k-select" value={tier} onChange={e => setTier(e.target.value)}><option value="">Automatic (general admission first)</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><small>Already-synced promoters keep their tier.</small></label>
          <p className="k-small" style={{ margin: 0 }}>Reserved tickets leave public sale. Nothing beyond the tier&apos;s free stock is reserved, and an allocation never drops below what has been used. After this, changing a promoter&apos;s allocation or pausing them updates their reservation automatically.</p>
        </div>
      </Dialog>
    </>}
  </Card>;
}
