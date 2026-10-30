"use client";
import { useState } from "react";
import { Leaf, Plus, Car, AlertTriangle, Info } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Stat, Bar } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { num, dateShort } from "@/lib/format";
import { recordSustainabilityEntry, estimateTravel } from "@/lib/actions/composition-ui";

export type Factor = { key: string; version: number; kind: string; unit: string; kg_co2e_per_unit: number; source: string; active: boolean };
export type EntryRow = { id: string; kind: string; factor_key: string | null; factor_version: number | null; quantity: number | null; unit: string | null; method: string; supplier_listing_id: string | null; note: string | null; created_at: string };
export type SusReport = { attendees: number; kg_co2e_total: number; kg_co2e_per_attendee: number | null; by_kind: Record<string, { kg_co2e: number; entries: number; estimated: boolean }>; waste_kg: number; recycling_rate: number | null;
  suppliers: { listing_id: string; name: string; kg_co2e: number; entries: number }[]; notes: { note: string; at: string }[]; provenance: { factor: string; version: number; source: string }[] };

const KIND: Record<string, string> = { waste: "Waste", energy: "Energy", water: "Water", travel: "Travel", supplier: "Supplier", note: "Note" };
const FACTOR: Record<string, string> = { waste_general: "General waste (landfill)", waste_recycled: "Recycled waste", waste_food_compost: "Food waste composted", electricity_grid: "Grid electricity", diesel_generator: "Generator diesel", water_supply: "Mains water",
  travel_car: "Car travel", travel_rail: "Rail travel", travel_bus: "Bus travel", travel_van: "Van / delivery travel" };
const kg = (n: number | null | undefined) => n == null ? "—" : n >= 1000 ? `${(n / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t` : `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;

export function SustainabilityClient({ eventId, factors, entries, report, suppliers, canWrite }: { eventId: string; factors: Factor[]; entries: EntryRow[]; report: SusReport | null; suppliers: { id: string; name: string }[]; canWrite: boolean }) {
  const { run, pending } = useAction();
  const [add, setAdd] = useState<{ kind: string; factor: string; quantity: string; method: string; supplier: string; note: string } | null>(null);
  const [tr, setTr] = useState<{ km: string; car: string; rail: string; bus: string } | null>(null);
  const fByKey = new Map(factors.map(f => [f.key, f])); const supName = new Map(suppliers.map(s => [s.id, s.name]));
  const kinds = report ? Object.entries(report.by_kind) : [];
  const travelEst = entries.filter(x => x.note === "attendee_travel_estimate");
  const sumSplit = tr ? (Number(tr.car) || 0) + (Number(tr.rail) || 0) + (Number(tr.bus) || 0) : 0;
  const fa = add ? fByKey.get(add.factor) : undefined;
  return <div className="oc">
    <div className="k-notice amber"><AlertTriangle size={16} aria-hidden /><span><b>Indicative — not for public claims.</b> Figures use indicative UK emission factors that haven&apos;t been confirmed yet. Use them for internal planning only; don&apos;t publish them or use them in marketing.</span></div>
    <div className="oc-kpis">
      <Stat label="Estimated footprint" value={kg(report?.kg_co2e_total)} sub="CO₂e, indicative" />
      <Stat label="Per attendee" value={report?.kg_co2e_per_attendee != null ? kg(report.kg_co2e_per_attendee) : "—"} sub={`${num(report?.attendees ?? 0)} valid tickets`} />
      <Stat label="Waste" value={kg(report?.waste_kg ?? 0)} sub={report?.recycling_rate != null ? `${Math.round(report.recycling_rate * 100)}% recycled or composted` : "no waste recorded"} />
      <Stat label="Entries" value={num(entries.length)} sub={`${entries.filter(x => x.method === "estimated").length} estimated`} />
    </div>
    <div className="oc-split">
      <Card><CardHead title="Breakdown" sub="By source, from your measurements and estimates.">{canWrite && <span className="k-row" style={{ gap: 6 }}><Btn size="sm" variant="outline" icon={Car} onClick={() => setTr({ km: "15", car: "50", rail: "35", bus: "15" })}>Estimate attendee travel</Btn><Btn size="sm" icon={Plus} onClick={() => setAdd({ kind: "waste", factor: "waste_general", quantity: "", method: "measured", supplier: "", note: "" })}>Record measurement</Btn></span>}</CardHead>
        {kinds.length ? <ul className="oc-list">{kinds.map(([k, v]) => <li key={k} className="oc-li static"><span className="k-grow"><b>{KIND[k] ?? k}</b><small>{v.entries} entr{v.entries === 1 ? "y" : "ies"}{v.estimated ? " · includes estimates" : ""}</small>
          <Bar thin value={report && report.kg_co2e_total > 0 ? Math.round((100 * v.kg_co2e) / report.kg_co2e_total) : 0} tone="green" label={`${KIND[k] ?? k} share`} /></span><b className="k-tnum">{kg(v.kg_co2e)}</b></li>)}</ul>
          : <Empty icon={Leaf} title="Nothing recorded yet" text="Record waste, energy and water readings, or estimate attendee travel from tickets sold." action={canWrite ? <Btn size="sm" icon={Plus} onClick={() => setAdd({ kind: "waste", factor: "waste_general", quantity: "", method: "measured", supplier: "", note: "" })}>Record the first measurement</Btn> : undefined} />}
        {report && report.suppliers.length > 0 && <><h3 className="oc-h3" style={{ marginTop: 12 }}>Suppliers</h3><ul className="oc-ul">{report.suppliers.map(s => <li key={s.listing_id}>{s.name}: {kg(s.kg_co2e)} ({s.entries})</li>)}</ul></>}
        {travelEst.length > 0 && <p className="k-xs k-muted" style={{ marginTop: 8 }}>Attendee travel is an estimate from tickets × assumed travel mix × round-trip distance; re-running it replaces the previous estimate.</p>}
        {!canWrite && <p className="k-xs k-muted">Read only — event edit permission is needed to record measurements.</p>}
      </Card>
      <Card><CardHead title="Factor sources" sub="Every figure is traceable to a versioned factor." />
        {report && report.provenance.length ? <ul className="oc-ul">{report.provenance.map(p => <li key={`${p.factor}-${p.version}`}><b>{FACTOR[p.factor] ?? p.factor}</b> v{p.version} · {p.source}</li>)}</ul>
          : <ul className="oc-ul">{factors.map(f => <li key={f.key}>{FACTOR[f.key] ?? f.key}: {f.kg_co2e_per_unit} kg CO₂e per {f.unit} · {f.source}</li>)}</ul>}
      </Card>
    </div>
    <Card><CardHead title="Entries" sub="Newest first." />
      {entries.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Recorded</th><th>Source</th><th className="num">Quantity</th><th>Method</th><th className="num">kg CO₂e</th><th>Supplier / note</th></tr></thead><tbody>
        {entries.map(x => { const f = x.factor_key ? fByKey.get(x.factor_key) : undefined; return <tr key={x.id}><td>{dateShort(x.created_at)}</td><td>{KIND[x.kind]}{x.factor_key ? ` · ${FACTOR[x.factor_key] ?? x.factor_key}` : ""}</td><td className="num">{x.quantity != null ? `${num(x.quantity)} ${x.unit ?? ""}` : "—"}</td>
          <td><Chip tone={x.method === "estimated" ? "amber" : "green"}>{x.method}</Chip></td><td className="num">{f && x.quantity != null ? kg(x.quantity * f.kg_co2e_per_unit) : "—"}</td><td className="k-small oc-ellipsis">{x.supplier_listing_id ? supName.get(x.supplier_listing_id) ?? "Supplier" : x.note === "attendee_travel_estimate" ? "Attendee travel estimate" : x.note ?? "—"}</td></tr>; })}</tbody></table></div>
        : <p className="k-small k-muted">No entries yet.</p>}
    </Card>
    <Dialog open={!!add} onClose={() => setAdd(null)} title="Record a measurement" sub="Indicative factors — for internal planning, not public claims."
      footer={<><Btn variant="ghost" onClick={() => setAdd(null)}>Cancel</Btn><Btn disabled={pending || !add || (add.kind === "note" ? add.note.trim().length < 2 : add.quantity === "")} onClick={async () => { if (!add) return;
        const res = await run(() => recordSustainabilityEntry(eventId, add.kind === "note" ? { kind: "note", method: "measured", note: add.note } : { kind: add.kind, factor_key: add.factor || undefined, quantity: Number(add.quantity), unit: fa?.unit, method: add.method, ...(add.supplier ? { supplier_listing_id: add.supplier } : {}), ...(add.note ? { note: add.note } : {}) })); if (res.ok) setAdd(null); }}>Record</Btn></>}>
      {add && <div className="oc-form">
        <label className="k-field"><span>Type</span><select className="k-select" value={add.kind} onChange={e => { const k = e.target.value; setAdd({ ...add, kind: k, factor: factors.find(f => f.kind === (k === "supplier" ? "travel" : k))?.key ?? "" }); }}>{["waste", "energy", "water", "travel", "supplier", "note"].map(k => <option key={k} value={k}>{KIND[k]}</option>)}</select></label>
        {add.kind !== "note" && <label className="k-field"><span>Factor</span><select className="k-select" value={add.factor} onChange={e => setAdd({ ...add, factor: e.target.value })}>{factors.filter(f => add.kind === "supplier" || f.kind === add.kind).map(f => <option key={f.key} value={f.key}>{FACTOR[f.key] ?? f.key} ({f.unit})</option>)}</select></label>}
        {add.kind !== "note" && <label className="k-field"><span>Quantity{fa ? ` (${fa.unit})` : ""}</span><input className="k-input" inputMode="decimal" value={add.quantity} onChange={e => setAdd({ ...add, quantity: e.target.value.replace(/[^\d.]/g, "") })} /></label>}
        {add.kind !== "note" && <label className="k-field"><span>Method</span><select className="k-select" value={add.method} onChange={e => setAdd({ ...add, method: e.target.value })}><option value="measured">Measured (meter, weighbridge, invoice)</option><option value="estimated">Estimated</option></select></label>}
        {add.kind === "supplier" && <label className="k-field oc-span2"><span>Supplier</span><select className="k-select" value={add.supplier} onChange={e => setAdd({ ...add, supplier: e.target.value })}><option value="">Not linked</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <label className="k-field oc-span2"><span>{add.kind === "note" ? "Note" : "Note (optional)"}</span><input className="k-input" maxLength={2000} value={add.note} onChange={e => setAdd({ ...add, note: e.target.value })} /></label>
        {fa && add.quantity && <p className="k-xs k-muted oc-span2">≈ {kg(Number(add.quantity) * fa.kg_co2e_per_unit)} CO₂e at {fa.kg_co2e_per_unit} kg per {fa.unit} (indicative).</p>}
      </div>}
    </Dialog>
    <Dialog open={!!tr} onClose={() => setTr(null)} title="Estimate attendee travel" sub="Valid tickets × your assumed travel mix × round-trip distance. Replaces any previous estimate."
      footer={<><Btn variant="ghost" onClick={() => setTr(null)}>Cancel</Btn><Btn disabled={pending || !tr || Math.round(sumSplit) !== 100 || !Number(tr.km)} onClick={async () => { if (!tr) return; const res = await run(() => estimateTravel(eventId, Number(tr.km), { car: Number(tr.car) || 0, rail: Number(tr.rail) || 0, bus: Number(tr.bus) || 0 })); if (res.ok) setTr(null); }}>Update estimate</Btn></>}>
      {tr && <div className="oc-form">
        <label className="k-field oc-span2"><span>Average one-way distance (km)</span><input className="k-input" inputMode="decimal" value={tr.km} onChange={e => setTr({ ...tr, km: e.target.value.replace(/[^\d.]/g, "") })} /></label>
        {(["car", "rail", "bus"] as const).map(k => <label key={k} className="k-field"><span>{k === "car" ? "Car" : k === "rail" ? "Rail" : "Bus"} (%)</span><input className="k-input" inputMode="numeric" value={tr[k]} onChange={e => setTr({ ...tr, [k]: e.target.value.replace(/\D/g, "") })} /></label>)}
        <p className={`k-small oc-span2 ${Math.round(sumSplit) === 100 ? "k-muted" : "k-red"}`}><Info size={12} aria-hidden /> Shares add up to {sumSplit}% (must be 100%).</p>
      </div>}
    </Dialog>
  </div>;
}
