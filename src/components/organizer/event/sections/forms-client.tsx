"use client";
import { useState } from "react";
import { ClipboardList, FileSignature, Plus, Trash2, ArrowUp, ArrowDown, CheckCircle2, Lock, Baby, ShieldCheck, Archive } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Stat } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { num, dateShort } from "@/lib/format";
import { saveEventFormVersion, decideFormResponse, saveWaiverDraft, publishWaiverVersion, attachWaiver, retireWaiverDraft } from "@/lib/actions/composition-ui";

type Field = { key: string; label: string; type: string; required: boolean; options?: string[]; max_length?: number };
export type FormRow = { id: string; family_id: string; version: number; audience: string; kind: string; title: string; fields: Field[]; status: string; published_at: string | null; created_at: string };
export type ResponseRow = { id: string; form_id: string; form_version: number; respondent_kind: string; answers: Record<string, unknown>; status: string; created_at: string; decided_at: string | null };
export type WaiverRow = { id: string; family_id: string; version: number; title: string; body: string; body_sha256: string | null; minors_allowed: boolean; adult_age: number; status: string; published_at: string | null; created_at: string };
export type SignatureRow = { id: string; waiver_template_id: string; template_version: number; signer_name: string; is_minor: boolean; guardian_name: string | null; guardian_relationship: string | null; signed_at: string; status: string; ticket_id: string | null };
export type WaiverStatus = { template_id: string; title: string; version: number; status: string; required_tickets: number; signed_tickets: number; minor_signatures: number };

const TYPES: [string, string][] = [["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["email", "Email"], ["phone", "Phone"], ["date", "Date"], ["select", "Choice"], ["multiselect", "Multiple choice"], ["checkbox", "Checkbox"], ["consent", "Consent"], ["signature", "Signature"]];
const AUD: Record<string, string> = { guest: "Guests (ticket holders)", provider: "Suppliers", client: "Client", staff: "Staff", custom: "Anyone with access" };
const ST: Record<string, [string, "gray" | "green" | "blue" | "red"]> = { draft: ["Draft", "gray"], published: ["Published", "green"], retired: ["Retired", "gray"], submitted: ["Submitted", "blue"], accepted: ["Accepted", "green"], rejected: ["Rejected", "red"], withdrawn: ["Withdrawn", "gray"] };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40) || "field";

function families<T extends { family_id: string; version: number }>(rows: T[]) { const m = new Map<string, T[]>(); rows.forEach(r => m.set(r.family_id, [...(m.get(r.family_id) ?? []), r])); return [...m.values()].map(v => v.sort((a, b) => b.version - a.version)); }

export function FormsClient(p: { eventId: string; forms: FormRow[]; responses: ResponseRow[]; waivers: WaiverRow[]; attached: { waiver_template_id: string; tier_ids: string[] | null; status: string }[]; status: WaiverStatus[];
  signatures: SignatureRow[] | null; tiers: { id: string; name: string }[]; canWrite: boolean; canWaivers: boolean }) {
  const [tab, setTab] = useState<"forms" | "waivers">("forms");
  const fams = families(p.forms);
  const signedTotal = p.status.reduce((a, s) => a + Number(s.signed_tickets), 0), requiredTotal = p.status.filter(s => s.status === "active").reduce((a, s) => a + Number(s.required_tickets), 0);
  return <div className="oc">
    <div className="oc-kpis">
      <Stat label="Forms" value={num(fams.length)} sub={`${fams.filter(f => f.some(v => v.status === "published")).length} published`} />
      <Stat label="Responses" value={num(p.responses.length)} sub={`${p.responses.filter(r => r.status === "submitted").length} to review`} />
      <Stat label="Waivers required" value={num(p.status.filter(s => s.status === "active").length)} />
      <Stat label="Signed" value={`${num(signedTotal)} / ${num(requiredTotal)}`} sub="valid tickets with a signature" tone={requiredTotal && signedTotal >= requiredTotal ? "green" : undefined} />
    </div>
    <div className="k-seg oc-tabs" role="tablist" aria-label="Forms and waivers"><button type="button" role="tab" aria-selected={tab === "forms"} className={tab === "forms" ? "on" : ""} onClick={() => setTab("forms")}><ClipboardList size={14} aria-hidden />Forms</button>
      <button type="button" role="tab" aria-selected={tab === "waivers"} className={tab === "waivers" ? "on" : ""} onClick={() => setTab("waivers")}><FileSignature size={14} aria-hidden />Waivers</button></div>
    {tab === "forms" ? <FormsPanel {...p} fams={fams} /> : <WaiversPanel {...p} />}
  </div>;
}

function FormsPanel({ eventId, fams, responses, canWrite }: { eventId: string; fams: FormRow[][]; responses: ResponseRow[]; canWrite: boolean }) {
  const [sel, setSel] = useState<string | null>(fams[0]?.[0]?.family_id ?? null); const [builder, setBuilder] = useState<{ family: string | null; base: FormRow | null } | null>(null);
  const fam = fams.find(f => f[0]!.family_id === sel) ?? null; const live = fam?.find(v => v.status === "published") ?? null; const draft = fam?.find(v => v.status === "draft") ?? null;
  return <div className="oc-split">
    <Card><CardHead title="Event forms" sub="Collect guest details, supplier info or consents. Published versions never change; edits become a new version.">{canWrite && <Btn size="sm" icon={Plus} onClick={() => setBuilder({ family: null, base: null })}>New form</Btn>}</CardHead>
      {fams.length ? <ul className="oc-list">{fams.map(f => { const top = f[0]!; const pub = f.find(v => v.status === "published"); return <li key={top.family_id}><button type="button" aria-pressed={top.family_id === sel} className={`oc-li ${top.family_id === sel ? "on" : ""}`} onClick={() => setSel(top.family_id)}>
        <span className="k-grow"><b>{top.title}</b><small>{AUD[top.audience]} · {top.kind} · v{top.version} · {responses.filter(r => f.some(v => v.id === r.form_id)).length} response(s)</small></span><Chip tone={pub ? "green" : "gray"}>{pub ? `Live v${pub.version}` : "Draft"}</Chip></button></li>; })}</ul>
        : <Empty icon={ClipboardList} title="No forms yet" text="Build a form with typed fields, publish it, and review responses here." action={canWrite ? <Btn size="sm" icon={Plus} onClick={() => setBuilder({ family: null, base: null })}>Create a form</Btn> : undefined} />}
    </Card>
    {fam ? <Card>
      <div className="k-between oc-wrap"><div><h2 className="oc-h">{fam[0]!.title}</h2><p className="k-small k-muted">{AUD[fam[0]!.audience]} · {fam.length} version(s){live ? ` · live v${live.version} since ${dateShort(live.published_at)}` : " · not published"}</p></div>
        {canWrite && <Btn size="sm" variant="outline" onClick={() => setBuilder({ family: fam[0]!.family_id, base: draft ?? live ?? fam[0]! })}>{draft ? `Edit draft v${draft.version}` : "New version"}</Btn>}</div>
      <h3 className="oc-h3" style={{ marginTop: 10 }}>Fields {live ? `(v${live.version})` : `(draft v${fam[0]!.version})`}</h3>
      <ul className="oc-ul">{(live ?? fam[0]!).fields.map(f => <li key={f.key}><code>{f.key}</code> · {f.label} · {TYPES.find(t => t[0] === f.type)?.[1]}{f.required ? " · required" : ""}{f.options?.length ? ` · ${f.options.join(" / ")}` : ""}</li>)}</ul>
      <h3 className="oc-h3" style={{ marginTop: 12 }}>Responses</h3>
      <Responses eventId={eventId} rows={responses.filter(r => fam.some(v => v.id === r.form_id))} fields={(live ?? fam[0]!).fields} canWrite={canWrite} />
    </Card> : <Card><Empty title="Select a form" text="Its fields and responses appear here." /></Card>}
    {builder && <FormBuilder key={builder.family ?? "new"} eventId={eventId} family={builder.family} base={builder.base} onClose={() => setBuilder(null)} />}
  </div>;
}

function Responses({ eventId, rows, fields, canWrite }: { eventId: string; rows: ResponseRow[]; fields: Field[]; canWrite: boolean }) {
  const { run, pending } = useAction();
  if (!rows.length) return <p className="k-small k-muted">No responses yet. Respondents fill in the published version from their ticket, booking or staff page.</p>;
  const show = fields.slice(0, 3);
  const fmt = (v: unknown) => v == null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Received</th><th>From</th>{show.map(f => <th key={f.key}>{f.label}</th>)}<th>Status</th><th /></tr></thead><tbody>
    {rows.map(r => <tr key={r.id}><td>{dateShort(r.created_at)}<br /><small className="k-muted">v{r.form_version}</small></td><td>{r.respondent_kind}</td>{show.map(f => <td key={f.key} className="oc-ellipsis">{fmt(r.answers[f.key])}</td>)}
      <td><Chip tone={ST[r.status]?.[1]}>{ST[r.status]?.[0] ?? r.status}</Chip></td>
      <td>{canWrite && r.status === "submitted" && <span className="k-row" style={{ gap: 4 }}><Btn size="sm" variant="outline" disabled={pending} onClick={() => void run(() => decideFormResponse(eventId, r.id, "accepted"))}>Accept</Btn><Btn size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => decideFormResponse(eventId, r.id, "rejected"))}>Reject</Btn></span>}</td></tr>)}</tbody></table></div>;
}

function FormBuilder({ eventId, family, base, onClose }: { eventId: string; family: string | null; base: FormRow | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState(base?.title ?? ""); const [audience, setAudience] = useState(base?.audience ?? "guest"); const [kind, setKind] = useState(base?.kind ?? "form");
  const [fields, setFields] = useState<(Field & { opts: string })[]>((base?.fields ?? []).map(f => ({ ...f, opts: (f.options ?? []).join(", ") })));
  const upd = (i: number, patch: Partial<Field & { opts: string }>) => setFields(s => s.map((f, j) => j === i ? { ...f, ...patch } : f));
  const move = (i: number, d: number) => setFields(s => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const out = () => ({ title, audience, kind, fields: fields.map(({ opts, ...f }) => ({ key: f.key, label: f.label, type: f.type, required: f.required, ...(["select", "multiselect"].includes(f.type) ? { options: opts.split(",").map(s => s.trim()).filter(Boolean) } : {}) })) });
  const save = async (publish: boolean) => { const r = await run(() => saveEventFormVersion(eventId, family, out(), publish)); if (r.ok) onClose(); };
  return <Dialog open onClose={onClose} wide title={family ? (base?.status === "draft" ? `Edit draft · v${base.version}` : "New version") : "New form"} sub={base?.status === "published" ? "The published version stays live until you publish this one." : "Save a draft, or publish to make it live."}
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="outline" disabled={pending || title.trim().length < 2} onClick={() => void save(false)}>Save draft</Btn><Btn disabled={pending || title.trim().length < 2 || !fields.length} onClick={() => void save(true)}>Publish</Btn></>}>
    <div className="oc-form">
      <label className="k-field oc-span2"><span>Title</span><input className="k-input" maxLength={140} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dietary & access needs" /></label>
      <label className="k-field"><span>Who fills it in</span><select className="k-select" value={audience} onChange={e => setAudience(e.target.value)}>{Object.entries(AUD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="k-field"><span>Kind</span><select className="k-select" value={kind} onChange={e => setKind(e.target.value)}><option value="form">Form</option><option value="consent">Consent</option></select></label>
    </div>
    <h3 className="oc-h3" style={{ marginTop: 12 }}>Fields</h3>
    {fields.length ? <ol className="oc-fields">{fields.map((f, i) => <li key={i}>
      <label className="k-field"><span>Label</span><input className="k-input" maxLength={200} value={f.label} onChange={e => upd(i, { label: e.target.value, ...(f.key === slug(f.label) || !f.key ? { key: slug(e.target.value) } : {}) })} /></label>
      <label className="k-field"><span>Key</span><input className="k-input" maxLength={40} value={f.key} onChange={e => upd(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></label>
      <label className="k-field"><span>Type</span><select className="k-select" value={f.type} onChange={e => upd(i, { type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {["select", "multiselect"].includes(f.type) ? <label className="k-field"><span>Options (comma separated)</span><input className="k-input" value={f.opts} onChange={e => upd(i, { opts: e.target.value })} /></label> : <span />}
      <label className="k-row" style={{ gap: 6, alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.required} onChange={e => upd(i, { required: e.target.checked })} />Required</label>
      <span className="k-row" style={{ gap: 2, alignSelf: "end", paddingBottom: 4 }}><button type="button" className="k-icon-btn" aria-label={`Move ${f.label || "field"} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
        <button type="button" className="k-icon-btn" aria-label={`Move ${f.label || "field"} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
        <button type="button" className="k-icon-btn" aria-label={`Remove ${f.label || "field"}`} onClick={() => setFields(s => s.filter((_, j) => j !== i))}><Trash2 size={13} /></button></span>
    </li>)}</ol> : <p className="k-small k-muted">No fields yet.</p>}
    <Btn size="sm" variant="outline" icon={Plus} onClick={() => setFields(s => [...s, { key: `field_${s.length + 1}`, label: "", type: "text", required: false, opts: "" }])} disabled={fields.length >= 80}>Add field</Btn>
  </Dialog>;
}

function WaiversPanel({ eventId, waivers, attached, status, signatures, tiers, canWaivers }: { eventId: string; waivers: WaiverRow[]; attached: { waiver_template_id: string; tier_ids: string[] | null; status: string }[]; status: WaiverStatus[]; signatures: SignatureRow[] | null; tiers: { id: string; name: string }[]; canWaivers: boolean }) {
  const { run, pending } = useAction(); const fams = families(waivers);
  const [edit, setEdit] = useState<{ family: string | null; base: WaiverRow | null } | null>(null); const [attach, setAttach] = useState<{ id: string; tiers: string[] } | null>(null);
  const [retire, setRetire] = useState<{ draft: WaiverRow; reason: string } | null>(null);
  return <>
    {!canWaivers && <p className="k-xs k-muted">Owners and managers manage waiver templates and see who signed; your team sees counts.</p>}
    <div className="oc-split">
      <Card><CardHead title="Waiver templates" sub="Shared across your workspace. One published version per waiver; each signature records the exact version and text hash.">{canWaivers && <Btn size="sm" icon={Plus} onClick={() => setEdit({ family: null, base: null })}>New waiver</Btn>}</CardHead>
        {fams.length ? <ul className="oc-list">{fams.map(f => { const pub = f.find(v => v.status === "published"); const draft = f.find(v => v.status === "draft"); const att = pub && attached.find(a => a.waiver_template_id === pub.id);
          return <li key={f[0]!.family_id} className="oc-li static"><span className="k-grow"><b>{f[0]!.title}</b>
            <small>{pub ? `Published v${pub.version} · ${dateShort(pub.published_at)}` : draft ? "Not published" : "Retired — never published"}{draft ? ` · draft v${draft.version}` : ""} · {(pub ?? f[0]!).minors_allowed ? `under-${(pub ?? f[0]!).adult_age}s with guardian consent` : `adults ${(pub ?? f[0]!).adult_age}+ only`}</small>
            {att && <small className={att.status === "active" ? "k-green" : "k-muted"}>{att.status === "active" ? `Required for ${att.tier_ids?.length ? `${att.tier_ids.length} ticket type(s)` : "all tickets"}` : "Attached but not required"}</small>}</span>
            {canWaivers && <span className="k-row oc-wrap" style={{ gap: 6 }}>
              <Btn size="sm" variant="outline" onClick={() => setEdit({ family: f[0]!.family_id, base: draft ?? pub ?? f[0]! })}>{draft ? "Edit draft" : "New version"}</Btn>
              {draft && <Btn size="sm" disabled={pending} onClick={() => void run(() => publishWaiverVersion(eventId, draft.id))}>Publish v{draft.version}</Btn>}
              {draft && <Btn size="sm" variant="ghost" icon={Archive} disabled={pending} onClick={() => setRetire({ draft, reason: "" })}>Retire draft</Btn>}
              {pub && (att?.status === "active" ? <Btn size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => attachWaiver(eventId, pub.id, att.tier_ids, false))}>Stop requiring</Btn>
                : <Btn size="sm" variant="outline" icon={ShieldCheck} onClick={() => setAttach({ id: pub.id, tiers: att?.tier_ids ?? [] })}>Require for this event</Btn>)}</span>}
          </li>; })}</ul>
          : <Empty icon={FileSignature} title="No waivers yet" text="Write a waiver, publish it, then require it for this event or specific ticket types." action={canWaivers ? <Btn size="sm" icon={Plus} onClick={() => setEdit({ family: null, base: null })}>Create a waiver</Btn> : undefined} />}
      </Card>
      <Card><CardHead title="Signatures" sub="Counts cover valid tickets the waiver applies to." />
        {status.length ? <ul className="oc-list">{status.map(s => <li key={s.template_id} className="oc-li static"><span className="k-grow"><b>{s.title} v{s.version}</b><small>{num(s.signed_tickets)} of {num(s.required_tickets)} tickets signed · {num(s.minor_signatures)} under-age with guardian{s.status !== "active" ? " · not required now" : ""}</small></span>
          <Chip tone={s.required_tickets && s.signed_tickets >= s.required_tickets ? "green" : "amber"}>{s.required_tickets ? Math.round((100 * s.signed_tickets) / s.required_tickets) : 0}%</Chip></li>)}</ul> : <p className="k-small k-muted">No waiver is attached to this event.</p>}
        {signatures ? (signatures.length ? <div className="k-table-wrap" style={{ marginTop: 10 }}><table className="k-table"><thead><tr><th>Signer</th><th>Version</th><th>Minor</th><th>Signed</th><th>Status</th></tr></thead><tbody>
          {signatures.map(s => <tr key={s.id}><td>{s.signer_name}</td><td>v{s.template_version}</td><td>{s.is_minor ? <span title={`Guardian: ${s.guardian_name} (${s.guardian_relationship})`}><Baby size={13} aria-hidden /> {s.guardian_name} ({s.guardian_relationship})</span> : "—"}</td><td>{dateShort(s.signed_at)}</td><td><Chip tone={s.status === "valid" ? "green" : "gray"}>{s.status}</Chip></td></tr>)}</tbody></table></div>
          : <p className="k-small k-muted" style={{ marginTop: 8 }}>No one has signed yet. Ticket holders sign from their ticket before arrival.</p>)
          : <p className="k-xs k-muted" style={{ marginTop: 8 }}><Lock size={12} aria-hidden /> Signer names are visible to owners and managers only.</p>}
      </Card>
    </div>
    {edit && <WaiverEditor key={edit.family ?? "new"} eventId={eventId} family={edit.family} base={edit.base} onClose={() => setEdit(null)} />}
    <Dialog open={!!retire} onClose={() => setRetire(null)} title={`Retire draft v${retire?.draft.version ?? ""}?`} sub={`“${retire?.draft.title ?? ""}” draft is retired without being published. The published version (if any) and every signature stay as they are; you can start a new draft later.`}
      footer={<><Btn variant="ghost" onClick={() => setRetire(null)}>Keep draft</Btn><Btn variant="danger" disabled={pending} onClick={async () => { if (!retire) return; const r = await run(() => retireWaiverDraft(eventId, retire.draft.id, retire.reason)); if (r.ok) setRetire(null); }}>Retire draft</Btn></>}>
      {retire && <label className="k-field"><span>Reason (optional, kept in the audit log)</span><input className="k-input" maxLength={500} value={retire.reason} onChange={e => setRetire({ ...retire, reason: e.target.value })} /></label>}
    </Dialog>
    <Dialog open={!!attach} onClose={() => setAttach(null)} title="Require this waiver" sub="Leave every ticket type unticked to require it for all tickets."
      footer={<><Btn variant="ghost" onClick={() => setAttach(null)}>Cancel</Btn><Btn disabled={pending} onClick={async () => { if (!attach) return; const r = await run(() => attachWaiver(eventId, attach.id, attach.tiers.length ? attach.tiers : null, true)); if (r.ok) setAttach(null); }}>Require waiver</Btn></>}>
      {attach && (tiers.length ? <div className="oc-badges">{tiers.map(t => <label key={t.id} className={`oc-pick ${attach.tiers.includes(t.id) ? "on" : ""}`}><input type="checkbox" checked={attach.tiers.includes(t.id)} onChange={e => setAttach({ ...attach, tiers: e.target.checked ? [...attach.tiers, t.id] : attach.tiers.filter(x => x !== t.id) })} />{t.name}</label>)}</div> : <p className="k-small k-muted">Applies to all tickets.</p>)}
    </Dialog>
  </>;
}

function WaiverEditor({ eventId, family, base, onClose }: { eventId: string; family: string | null; base: WaiverRow | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ title: base?.title ?? "", body: base?.body ?? "", minors: base?.minors_allowed ?? false, age: String(base?.adult_age ?? 18) });
  return <Dialog open onClose={onClose} wide title={base?.status === "draft" ? `Edit draft v${base.version}` : family ? "New waiver version" : "New waiver"} sub="Saved as a draft. Publishing retires the previous version; existing signatures keep the version they signed."
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={pending || f.title.trim().length < 2 || f.body.trim().length < 20} onClick={async () => { const r = await run(() => saveWaiverDraft(eventId, family, { title: f.title, body: f.body, minors_allowed: f.minors, adult_age: Number(f.age) || 18 })); if (r.ok) onClose(); }}>Save draft</Btn></>}>
    <div className="oc-form">
      <label className="k-field oc-span2"><span>Title</span><input className="k-input" maxLength={140} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label className="k-field oc-span2"><span>Waiver text (at least 20 characters)</span><textarea className="k-input" rows={10} style={{ height: "auto" }} maxLength={40000} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
      <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={f.minors} onChange={e => setF({ ...f, minors: e.target.checked })} /> Under-age signers allowed with a parent or guardian&apos;s consent</label>
      <label className="k-field"><span>Adult age</span><select className="k-select" value={f.age} onChange={e => setF({ ...f, age: e.target.value })}>{[16, 17, 18, 19, 20, 21].map(a => <option key={a}>{a}</option>)}</select></label>
    </div>
    {base?.body_sha256 && <p className="k-xs k-muted"><CheckCircle2 size={12} aria-hidden /> Current text hash {base.body_sha256.slice(0, 12)}…</p>}
  </Dialog>;
}
