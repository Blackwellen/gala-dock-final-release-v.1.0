"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, AlertTriangle, RefreshCw, GitCompare, Save } from "lucide-react";
import { Dialog, useKitToast } from "@/components/kit/client";
import { saveBrief, getBriefLatest } from "@/lib/events/plan";

export type BriefDoc = Record<string, unknown>;
type Form = { goals: string; scope: string; client_needs: string; size: string; profile: string; ages: string; budget_min: string; budget_max: string; location_needs: string; must_haves: string; constraints: string; success_measures: string; access_notes: string; style_notes: string; internal_notes: string };
const lines = (v: unknown) => (Array.isArray(v) ? v : []).map(x => typeof x === "string" ? x : String((x as { text?: string })?.text ?? "")).filter(Boolean).join("\n");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown) => (v == null ? "" : String(v));
function toForm(b: BriefDoc | null): Form {
  const a = obj(b?.audience);
  return { goals: lines(b?.goals), scope: str(b?.scope), client_needs: str(b?.client_needs), size: str(a.size), profile: str(a.profile), ages: str(a.ages), budget_min: str(b?.budget_min), budget_max: str(b?.budget_max),
    location_needs: str(b?.location_needs), must_haves: lines(b?.must_haves), constraints: lines(b?.constraints), success_measures: lines(b?.success_measures), access_notes: str(obj(b?.accessibility).notes), style_notes: str(obj(b?.style).notes), internal_notes: str(b?.internal_notes) };
}
const list = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean).map(x => x.slice(0, 300));
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
/** Form → save_event_brief payload. Keys this editor doesn't show (venue / supplier needs, other style or access keys) are kept from the base version. */
function toBrief(f: Form, base: BriefDoc | null) {
  const a = obj(base?.audience);
  return {
    goals: list(f.goals), scope: f.scope, client_needs: f.client_needs,
    audience: { ...Object.fromEntries(Object.entries(a).filter(([k]) => ["adults", "children"].includes(k))), ...(num(f.size) != null ? { size: Math.round(num(f.size)!) } : {}), ...(f.profile.trim() ? { profile: f.profile.trim() } : {}), ...(f.ages.trim() ? { ages: f.ages.trim().slice(0, 60) } : {}) },
    budget_min: num(f.budget_min) ?? null, budget_max: num(f.budget_max) ?? null, ...(base?.currency ? { currency: String(base.currency) } : {}),
    location_needs: f.location_needs, venue_needs: obj(base?.venue_needs), supplier_needs: obj(base?.supplier_needs),
    style: { ...obj(base?.style), notes: f.style_notes.slice(0, 500) }, must_haves: list(f.must_haves), constraints: list(f.constraints),
    accessibility: { ...obj(base?.accessibility), notes: f.access_notes.slice(0, 1000) }, success_measures: list(f.success_measures), internal_notes: f.internal_notes,
  };
}
const LABEL: Record<keyof Form, string> = { goals: "Goals", scope: "Scope", client_needs: "Client needs", size: "Audience size", profile: "Audience profile", ages: "Ages", budget_min: "Budget from", budget_max: "Budget to", location_needs: "Location needs", must_haves: "Must-haves", constraints: "Constraints", success_measures: "Success measures", access_notes: "Accessibility", style_notes: "Style", internal_notes: "Internal notes" };

/**
 * "Edit brief" (Q14, domain 39): saves a new version through save_event_brief with the version you started from. If someone saved
 * in the meantime the database refuses (no overwrite) and this shows who saved which version, a field-by-field compare, and the
 * choice to load theirs or deliberately save yours on top as the next version.
 */
export function BriefEditor({ eventId, brief, version, canEdit, reason }: { eventId: string; brief: BriefDoc | null; version: number; canEdit: boolean; reason?: string }) {
  const router = useRouter(); const toast = useKitToast();
  const [open, setOpen] = useState(false); const [f, setF] = useState<Form>(() => toForm(brief)); const [base, setBase] = useState<{ doc: BriefDoc | null; version: number }>({ doc: brief, version });
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [conflict, setConflict] = useState<{ version: number; author: string; doc: BriefDoc | null } | null>(null); const [compare, setCompare] = useState(false);
  const start = () => { setF(toForm(brief)); setBase({ doc: brief, version }); setConflict(null); setCompare(false); setErr(""); setNote(""); setOpen(true); };
  const save = async (expected: number) => {
    setBusy(true); setErr("");
    const r = await saveBrief(eventId, toBrief(f, base.doc), expected, note.trim());
    if (r.ok) { setBusy(false); setOpen(false); toast(r.message ?? "Brief saved."); router.refresh(); return; }
    if (r.data?.conflict) {
      const l = await getBriefLatest(eventId); setBusy(false);
      setConflict({ version: Number(l.data?.brief?.version ?? r.data.version), author: l.data?.author || "a teammate", doc: l.data?.brief ?? null }); return;
    }
    setBusy(false); setErr(r.error ?? "Could not save the brief.");
  };
  const theirs = conflict ? toForm(conflict.doc) : null;
  const diff = theirs ? (Object.keys(LABEL) as (keyof Form)[]).filter(k => theirs[k].trim() !== f[k].trim()) : [];
  const field = (k: keyof Form, opts: { area?: boolean; type?: string; hint?: string; full?: boolean } = {}) => <label className="k-field" style={opts.full || opts.area ? { gridColumn: "1/-1" } : undefined}><span>{LABEL[k]}</span>
    {opts.area ? <textarea className="k-textarea" rows={3} maxLength={4000} value={f[k]} onChange={x => setF(p => ({ ...p, [k]: x.target.value }))} /> : <input className="k-input" type={opts.type ?? "text"} min={opts.type === "number" ? 0 : undefined} value={f[k]} onChange={x => setF(p => ({ ...p, [k]: x.target.value }))} />}{opts.hint && <small>{opts.hint}</small>}</label>;
  return <>
    {canEdit ? <button className="k-link" onClick={start}><PenLine size={14} />Edit brief</button> : <span className="k-xs k-muted" title={reason}>{reason ?? "View only"}</span>}
    <Dialog open={open} onClose={() => setOpen(false)} title={version ? `Edit brief (from version ${base.version})` : "Write the brief"} sub="Every save is a new version; earlier versions stay in the history. Names and contact details don’t belong here." wide>
      {conflict && <div className="k-notice amber bf-conflict" role="alert"><AlertTriangle size={16} className="k-amber" /><div className="k-grow"><b>Someone saved a newer version (v{conflict.version} by {conflict.author}).</b> Your changes are not saved yet. Compare them, load the newer version, or save yours on top as v{conflict.version + 1}.
        <div className="k-row k-wrap" style={{ gap: 8, marginTop: 8 }}><button type="button" className="k-btn outline sm" onClick={() => setCompare(c => !c)} aria-expanded={compare}><GitCompare size={13} />{compare ? "Hide compare" : `Compare (${diff.length} field${diff.length === 1 ? "" : "s"} differ)`}</button>
          <button type="button" className="k-btn outline sm" onClick={() => { setF(toForm(conflict.doc)); setBase({ doc: conflict.doc, version: conflict.version }); setConflict(null); setCompare(false); }}><RefreshCw size={13} />Load v{conflict.version}</button>
          <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => { const v = conflict.version; setBase(b => ({ ...b, version: v })); setConflict(null); void save(v); }}><Save size={13} />Save mine as v{conflict.version + 1}</button></div>
        {compare && <div className="k-table-wrap" style={{ marginTop: 10 }}><table className="k-table bf-diff"><thead><tr><th>Field</th><th>Yours</th><th>v{conflict.version}</th></tr></thead><tbody>{diff.map(k => <tr key={k}><td>{LABEL[k]}</td><td className="bf-mine">{f[k] || "—"}</td><td>{theirs![k] || "—"}</td></tr>)}{!diff.length && <tr><td colSpan={3}>No differences in the fields shown here.</td></tr>}</tbody></table></div>}</div></div>}
      <form className="k-grid k-g2 bf-form" onSubmit={ev => { ev.preventDefault(); void save(base.version); }}>
        {field("goals", { area: true, hint: "One per line (up to 20)." })}
        {field("scope", { area: true })}{field("client_needs", { area: true })}
        {field("size", { type: "number" })}{field("ages", { hint: "e.g. 18+, mixed, 5–10" })}
        {field("profile", { full: true })}
        {field("budget_min", { type: "number" })}{field("budget_max", { type: "number" })}
        {field("location_needs", { area: true })}
        {field("must_haves", { area: true, hint: "One per line." })}{field("constraints", { area: true, hint: "One per line." })}{field("success_measures", { area: true, hint: "One per line." })}
        {field("access_notes", { area: true })}{field("style_notes", { full: true })}
        {field("internal_notes", { area: true, hint: "Team only — never shared with suppliers." })}
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>What changed? (optional)</span><input className="k-input" maxLength={300} value={note} onChange={x => setNote(x.target.value)} placeholder="e.g. Budget agreed with the client" /></label>
        {err && <p className="k-small k-red" role="alert" style={{ gridColumn: "1/-1", margin: 0 }}>{err}</p>}
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={busy || !!conflict}>Save as version {base.version + 1}</button></div>
      </form>
    </Dialog>
  </>;
}
