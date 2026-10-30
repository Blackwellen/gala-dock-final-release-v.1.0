"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileUp, GitMerge, RefreshCw, Ruler, Save } from "lucide-react";
import { useToast } from "@/components/ui";
import { PlanBuilder, type PlanApi } from "@/components/venue-plan/plan-builder";
import { mergeElements } from "@/lib/maps/merge";
import type { MapEl, MapSpace } from "./venue-map";
import { loadStructure, saveStructure, type StructureMeta } from "../[id]/actions";

type Conflict = { current: number; mine: MapEl[]; publish: boolean };
const RULE_PACKS: [string, string][] = [["uk_default", "UK default (v1)"]];

/**
 * Venue structural map (Q19): version-checked saves through `venue_structure_save`. A `stale_version` refusal opens the
 * reload-merge prompt (reload theirs · merge by element · keep mine on top), never a silent overwrite. Calibration (scale,
 * rotation, origin, drawing underlay), safety rule pack and venue capacity travel with the version as structure meta.
 */
export function StructureEditor({ venueId, initial, spaces, version, latestVersion, geo, meta, height = 460 }: {
  venueId: string; initial: MapEl[]; spaces: MapSpace[]; version: number; latestVersion: number; geo: { lat: number; lng: number } | null; meta: StructureMeta; height?: number;
}) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [base, setBase] = useState({ version: latestVersion, elements: initial });
  const [seed, setSeed] = useState({ key: 0, elements: initial });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cal, setCal] = useState<StructureMeta>({ capacity_max: meta.capacity_max ?? null, rule_pack: meta.rule_pack ?? "uk_default", calibration: { units_per_m: 10, rotation_deg: 0, ...(meta.calibration ?? {}) } });
  const [calOpen, setCalOpen] = useState(false);
  const [calDirty, setCalDirty] = useState(false);
  const api = useRef<PlanApi | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const doSave = async (els: MapEl[], publish: boolean, baseVersion = base.version) => {
    const r = await saveStructure(venueId, els, publish, baseVersion, cal);
    if (r.ok && r.version) { setBase({ version: r.version, elements: els }); setCalDirty(false); router.refresh(); }
    if (!r.ok && r.conflict !== undefined) { setConflict({ current: r.conflict, mine: els, publish }); return { ok: false, error: "Not saved — choose how to combine your changes with the newer version." }; }
    return r;
  };
  const resolve = (how: "reload" | "merge" | "mine") => start(async () => {
    if (!conflict) return;
    const theirs = await loadStructure(venueId, conflict.current);
    if (!theirs.ok) { toast(theirs.error); return; }
    if (how === "reload") {
      setBase({ version: theirs.version, elements: theirs.elements }); setSeed(s => ({ key: s.key + 1, elements: theirs.elements })); setConflict(null);
      toast(`Loaded version ${theirs.version}. Your unsaved changes were discarded.`); return;
    }
    const next = how === "merge" ? mergeElements(base.elements, conflict.mine, theirs.elements) : { elements: conflict.mine, conflicts: [] as string[] };
    const r = await saveStructure(venueId, next.elements, conflict.publish, theirs.version, cal);
    if (!r.ok) { if (r.conflict !== undefined) setConflict({ ...conflict, current: r.conflict }); toast(r.error ?? "Couldn’t save"); return; }
    setBase({ version: r.version!, elements: next.elements }); setSeed(s => ({ key: s.key + 1, elements: next.elements })); setConflict(null); router.refresh();
    toast(how === "merge" ? `Merged into version ${r.version}${next.conflicts.length ? ` — ${next.conflicts.length} element${next.conflicts.length === 1 ? "" : "s"} edited on both sides kept your version: ${next.conflicts.slice(0, 3).join(", ")}` : ""}` : `Saved your map as version ${r.version} on top of version ${theirs.version}`);
  });
  const setCalib = (patch: Partial<NonNullable<StructureMeta["calibration"]>>) => { setCal(c => ({ ...c, calibration: { ...c.calibration, ...patch } })); setCalDirty(true); };
  const importCal = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as Record<string, unknown>;
      const c = (j.calibration ?? j) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
      const origin = Array.isArray(c.origin) && c.origin.length === 2 && c.origin.every(x => typeof x === "number") ? c.origin as [number, number] : undefined;
      const u = c.underlay as { file_ref?: unknown; kind?: unknown; opacity?: unknown } | undefined;
      const next = { units_per_m: num(c.units_per_m), rotation_deg: num(c.rotation_deg), origin,
        underlay: u && typeof u === "object" ? { file_ref: typeof u.file_ref === "string" ? u.file_ref.slice(0, 300) : undefined, kind: u.kind === "pdf" ? "pdf" as const : "image" as const, opacity: num(u.opacity) } : undefined };
      if (next.units_per_m === undefined && next.rotation_deg === undefined && !origin) throw new Error("no calibration");
      setCalib(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)));
      if (num(j.capacity_max) !== undefined) setCal(c2 => ({ ...c2, capacity_max: num(j.capacity_max)! }));
      setCalOpen(true); toast("Calibration imported — save the map to keep it with a new version");
    } catch { toast("That file has no calibration (units_per_m, rotation_deg, origin)."); }
  };
  const c = cal.calibration ?? {};

  return <div className="se-struct">
    <div className="se-struct-bar">
      <span className="se-struct-ver">{base.version ? `Editing on top of v${base.version}` : "First version"}{version ? ` · v${version} live` : " · not published"}</span>
      <button type="button" className="ws-btn outline sm" aria-expanded={calOpen} onClick={() => setCalOpen(o => !o)}><Ruler aria-hidden="true" />Calibration &amp; safety</button>
      <button type="button" className="ws-btn outline sm" onClick={() => importRef.current?.click()}><FileUp aria-hidden="true" />Import calibration</button>
      {calDirty && <button type="button" className="ws-btn primary sm" disabled={pending} onClick={() => start(async () => { const r = await doSave(api.current?.elements() ?? base.elements, false); toast(r.ok ? "Calibration saved with a new draft version" : (r.error ?? "Couldn’t save")); })}><Save aria-hidden="true" />Save calibration</button>}
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importCal(f); e.target.value = ""; }} />
    </div>
    {calOpen && <fieldset className="se-cal" aria-label="Calibration and safety">
      <label>Units per metre<input type="number" min={1} max={1000} step={0.1} value={c.units_per_m ?? 10} onChange={e => setCalib({ units_per_m: Number(e.target.value) })} /></label>
      <label>Rotation (°)<input type="number" min={-360} max={360} step={0.5} value={c.rotation_deg ?? 0} onChange={e => setCalib({ rotation_deg: Number(e.target.value) })} /></label>
      <label>Origin x<input type="number" step={1} value={c.origin?.[0] ?? 0} onChange={e => setCalib({ origin: [Number(e.target.value), c.origin?.[1] ?? 0] })} /></label>
      <label>Origin y<input type="number" step={1} value={c.origin?.[1] ?? 0} onChange={e => setCalib({ origin: [c.origin?.[0] ?? 0, Number(e.target.value)] })} /></label>
      <label>Venue capacity (max)<input type="number" min={0} step={10} value={cal.capacity_max ?? ""} placeholder="Licensed maximum" onChange={e => { setCal(x => ({ ...x, capacity_max: e.target.value === "" ? null : Number(e.target.value) })); setCalDirty(true); }} /></label>
      <label>Safety rule pack<select className="ws-select" value={cal.rule_pack} onChange={e => { setCal(x => ({ ...x, rule_pack: e.target.value })); setCalDirty(true); }}>{RULE_PACKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {c.underlay?.file_ref && <p className="se-cal-note">Drawing underlay: {c.underlay.kind === "pdf" ? "PDF" : "image"} · opacity {Math.round((c.underlay.opacity ?? 1) * 100)}%</p>}
      <p className="se-cal-note">Organisers’ layouts are checked against this capacity and rule pack (exits, aisles, density, accessible spaces) before they can publish.</p>
    </fieldset>}
    <PlanBuilder key={seed.key} initial={seed.elements} spaces={spaces} version={version} draftVersion={base.version > version ? base.version : 0} geo={geo} height={height} apiRef={api}
      onSave={(els, publish) => doSave(els, publish)} />
    {conflict && <div className="se-conflict" role="alertdialog" aria-modal="true" aria-labelledby="se-conflict-h">
      <div className="se-conflict-box"><h3 id="se-conflict-h"><AlertTriangle aria-hidden="true" />This map changed while you were editing</h3>
        <p>Version {conflict.current} was saved by someone else after you opened version {base.version}. Nothing has been overwritten. Choose how to continue:</p>
        <div className="se-conflict-acts">
          <button type="button" className="ws-btn primary sm" disabled={pending} onClick={() => resolve("merge")}><GitMerge aria-hidden="true" />Merge and save</button>
          <button type="button" className="ws-btn outline sm" disabled={pending} onClick={() => resolve("reload")}><RefreshCw aria-hidden="true" />Reload their version</button>
          <button type="button" className="ws-btn outline sm" disabled={pending} onClick={() => resolve("mine")}>Keep mine on top</button>
          <button type="button" className="ws-btn ghost sm" disabled={pending} onClick={() => setConflict(null)}>Cancel</button></div>
        <small>Merge keeps both sides’ additions and takes each element from whoever changed it; where you both changed the same element, yours is kept and listed.</small></div></div>}
    <style>{`.se-struct{display:grid;gap:10px}.se-struct-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.se-struct-ver{font-size:12px;color:#3f4596;margin-right:auto}
.se-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;border:1px solid #e3eaf6;border-radius:10px;padding:12px;margin:0;background:#fbfcff}
.se-cal label{display:grid;gap:4px;font-size:11.5px;color:#1d2068}.se-cal input{height:32px;border:1px solid #d9e2f1;border-radius:7px;padding:0 8px;font:inherit;min-width:0}.se-cal-note{grid-column:1/-1;font-size:11.5px;color:#5157a4;margin:0}
.se-conflict{position:fixed;inset:0;background:rgba(2,3,46,.35);display:grid;place-items:center;z-index:80;padding:16px}.se-conflict-box{background:#fff;border-radius:14px;max-width:520px;width:100%;padding:20px;display:grid;gap:10px;box-shadow:0 20px 60px rgba(2,3,46,.25)}
.se-conflict-box h3{display:flex;gap:8px;align-items:center;font-size:16px;color:#02032e;margin:0}.se-conflict-box h3 svg{width:18px;height:18px;color:#e08a00}.se-conflict-box p,.se-conflict-box small{font-size:12.5px;color:#3f4596;margin:0}.se-conflict-acts{display:flex;gap:8px;flex-wrap:wrap}`}</style>
  </div>;
}
