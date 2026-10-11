"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { GripVertical, X, Plus, Building2, Wrench, Speaker, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import type { PkgItem } from "../actions";

type Opt = { kind: PkgItem["kind"]; ref?: string; name: string; sub: string; image?: string };
const KIND: Record<PkgItem["kind"], { label: string; icon: typeof Building2; chip: string }> = {
  space: { label: "Venue spaces", icon: Building2, chip: "Venue space" }, service: { label: "Services", icon: Wrench, chip: "Service" }, equipment: { label: "Equipment", icon: Speaker, chip: "Equipment" }, staff: { label: "Staff", icon: UserRound, chip: "Staff" },
};

/** Package inclusions: pick spaces/services from the workspace, plus equipment and staff lines. Serialised into a hidden `items` field. */
export function InclusionsEditor({ initial, options }: { initial: PkgItem[]; options: Opt[] }) {
  const [items, setItems] = useState<(PkgItem & { image?: string })[]>(initial.map(i => ({ ...i, image: options.find(o => o.ref && o.ref === i.ref)?.image })));
  const [tab, setTab] = useState<PkgItem["kind"]>("space");
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState({ name: "", sub: "" });
  const count = (k: PkgItem["kind"]) => items.filter(i => i.kind === k).length;
  const avail = options.filter(o => o.kind === tab && !items.some(i => i.ref && i.ref === o.ref));
  const move = (i: number, d: number) => setItems(l => { const n = [...l], j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return <div className="pkw-inc">
    <input type="hidden" name="items" value={JSON.stringify(items.map(({ image: _i, ...x }) => { void _i; return x; }))} />
    <nav className="pkw-tabs">{(Object.keys(KIND) as PkgItem["kind"][]).map(k => { const I = KIND[k].icon; return <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => { setTab(k); setAdding(false); }}><I aria-hidden="true" />{KIND[k].label} ({count(k)})</button>; })}</nav>
    <ul>{items.map((it, i) => <li key={`${it.kind}-${it.name}-${i}`}>
      <span className="pkw-grip"><button type="button" aria-label="Move up" onClick={() => move(i, -1)}><GripVertical aria-hidden="true" /></button></span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {it.image ? <img src={it.image} alt="" /> : <span className={`pkw-ic ${it.kind}`}>{(() => { const I = KIND[it.kind].icon; return <I aria-hidden="true" />; })()}</span>}
      <span><b>{it.name}</b><small>{it.sub}</small></span><em className={it.kind}>{KIND[it.kind].chip}</em>
      <button type="button" className="pkw-x" aria-label={`Remove ${it.name}`} onClick={() => setItems(l => l.filter((_, j) => j !== i))}><X aria-hidden="true" /></button></li>)}
      {!items.length && <li className="pkw-empty">No inclusions yet — add the spaces, services and extras this package includes.</li>}</ul>
    {adding ? <div className="pkw-add">
      {avail.length > 0 && <div className="pkw-opts">{avail.map(o => <button key={o.ref ?? o.name} type="button" onClick={() => { setItems(l => [...l, { kind: o.kind, ref: o.ref ?? null, name: o.name, sub: o.sub, image: o.image }]); setAdding(false); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
          {o.image ? <img src={o.image} alt="" /> : <Plus aria-hidden="true" />}<span><b>{o.name}</b><small>{o.sub}</small></span></button>)}</div>}
      <div className="pkw-custom"><input placeholder={`Add ${KIND[tab].chip.toLowerCase()} name`} value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} aria-label="Inclusion name" />
        <input placeholder="Detail (e.g. 2 staff, 6 hours)" value={custom.sub} onChange={e => setCustom({ ...custom, sub: e.target.value })} aria-label="Inclusion detail" />
        <button type="button" className="ws-btn primary sm" disabled={!custom.name.trim()} onClick={() => { setItems(l => [...l, { kind: tab, ref: null, name: custom.name.trim(), sub: custom.sub.trim() }]); setCustom({ name: "", sub: "" }); setAdding(false); }}>Add</button>
        <button type="button" className="ws-btn ghost sm" onClick={() => setAdding(false)}>Cancel</button></div></div>
      : <button type="button" className="ws-btn outline sm pkw-addbtn" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add inclusion</button>}
  </div>;
}

export type DayState = "available" | "partial" | "unavailable" | "blocked";
/** Month calendar of package availability. Editable mode toggles date-specific blocks (serialised into `blocked`). */
export function AvailabilityCalendar({ days, blocked: initial, editable = false, months = 1 }: { days: Record<string, DayState>; blocked: string[]; editable?: boolean; months?: number }) {
  const [blocked, setBlocked] = useState<string[]>(initial);
  const [offset, setOffset] = useState(0);
  const first = useMemo(() => { const k = Object.keys(days).sort()[0] ?? "2026-10-01"; return new Date(`${k.slice(0, 7)}-01T12:00:00Z`); }, [days]);
  const month = (o: number) => { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + o); return d; };
  const grid = (m: Date) => { const y = m.getUTCFullYear(), mo = m.getUTCMonth(), lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7, len = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)]; };
  return <div className="pkw-cal">
    {editable && <input type="hidden" name="blocked" value={blocked.join(",")} />}
    {Array.from({ length: months }, (_, mi) => { const m = month(offset + mi); return <div key={mi} className="pkw-month">
      <header><b>{m.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</b>{mi === 0 && <span><button type="button" aria-label="Previous month" onClick={() => setOffset(o => Math.max(0, o - 1))}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" aria-label="Next month" onClick={() => setOffset(o => Math.min(11, o + 1))}><ChevronRight aria-hidden="true" /></button></span>}</header>
      <div className="pkw-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <i key={d}>{d}</i>)}
        {grid(m).map((d, i) => { if (!d) return <span key={`e${i}`} />; const st: DayState = blocked.includes(d) ? "blocked" : days[d] ?? "available";
          return <button key={d} type="button" className={`d ${st}`} disabled={!editable || st === "unavailable"} aria-pressed={blocked.includes(d)} title={st === "unavailable" ? "Booked" : st}
            onClick={() => setBlocked(b => b.includes(d) ? b.filter(x => x !== d) : [...b, d])}>{Number(d.slice(8))}<em /></button>; })}</div></div>; })}
    <ul className="pkw-legend"><li className="available">Available</li><li className="partial">Partially booked</li><li className="unavailable">Unavailable</li><li className="blocked">Blocked</li></ul>
    {editable && <small className="pkw-hint">Click dates to block or unblock them for this package. Booked dates can’t be changed here.</small>}
  </div>;
}

/** Package published ⇄ paused (pausing never affects existing bookings). */
export function PackageLiveToggle({ id, live, run }: { id: string; live: boolean; run: (id: string, live: boolean) => Promise<{ ok: boolean; message?: string; error?: string }> }) {
  const [pending, setPending] = useState(false);
  const [on, setOn] = useState(live);
  const toast = useToast(), router = useRouter();
  return <div className="pv-live">
    <button type="button" role="switch" aria-checked={on} aria-label={on ? "Pause package" : "Publish package"} className={`pv-switch${on ? " on" : ""}`} disabled={pending}
      onClick={async () => { if (on && !window.confirm("Pause this package? Existing bookings are unaffected.")) return; setPending(true); const r = await run(id, !on); setPending(false); toast(r.ok ? (r.message ?? "Updated") : (r.error ?? "Couldn’t update")); if (r.ok) { setOn(!on); router.refresh(); } }}><i /></button>
    <span><b className={on ? "ok" : ""}>{on ? "Published" : "Not live"}</b><small>{on ? "Live on marketplace" : "Hidden from the marketplace"}</small></span>
  </div>;
}
