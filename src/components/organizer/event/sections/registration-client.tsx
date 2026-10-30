"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, Search } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { useAction, useKitToast } from "@/components/kit/client";
import { saveRegistrationDraft, publishRegistrationDraft, discardRegistrationDraft, sensitiveAnswers } from "@/lib/events/access-actions";
import { decideRegistration } from "@/lib/guests/access";
import { ActionButton, toIso, toLocal, intOrNull } from "./s2-shared";

export type Field = { key: string; label: string; type: string; required?: boolean; sensitive?: boolean; options?: string[]; help?: string };
export type FormRow = { id: string; family_id: string; version: number; status: string; title: string; fields: Field[]; capacity: number | null; per_email_limit: number; approval_required: boolean; waitlist: boolean;
  opens_at: string | null; closes_at: string | null; published_at: string | null; created_at: string };
export type RegRow = { id: string; form_id: string; form_version: number; name: string; email: string; status: string; answers: Record<string, unknown>; decided_at: string | null; decision_reason: string; guest_id: string | null; created_at: string };

const TYPES = [["text", "Short text"], ["textarea", "Paragraph"], ["email", "Email"], ["phone", "Phone"], ["number", "Number"], ["date", "Date"], ["select", "Single choice"], ["multiselect", "Multiple choice"], ["checkbox", "Yes / no"]] as const;
const STATUS: Record<string, [string, "green" | "amber" | "red" | "gray" | "blue" | "purple"]> = { submitted: ["Submitted", "blue"], pending_approval: ["Awaiting approval", "amber"], approved: ["Approved", "green"], waitlisted: ["Waiting list", "purple"], rejected: ["Rejected", "red"], cancelled: ["Cancelled", "gray"] };
const NEXT: Record<string, ("approved" | "rejected" | "waitlisted" | "cancelled")[]> = { submitted: ["approved", "waitlisted", "rejected", "cancelled"], pending_approval: ["approved", "waitlisted", "rejected", "cancelled"], waitlisted: ["approved", "rejected", "cancelled"], approved: ["cancelled"] };
const VERB = { approved: "Approve", rejected: "Reject", waitlisted: "Waitlist", cancelled: "Cancel" } as const;
const keyOf = (label: string, taken: string[]) => { const b = (label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "q_$1") || "question").slice(0, 36); let k = b, i = 2; while (taken.includes(k)) k = `${b}_${i++}`; return k; };
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? ""));

type Draft = { title: string; capacity: string; perEmail: string; approval: boolean; waitlist: boolean; opens: string; closes: string; fields: (Field & { optionsText: string; fresh?: boolean })[] };
const fromForm = (f: FormRow | null): Draft => ({ title: f?.title ?? "Registration", capacity: f?.capacity ? String(f.capacity) : "", perEmail: String(f?.per_email_limit ?? 1), approval: f?.approval_required ?? false, waitlist: f?.waitlist ?? true,
  opens: toLocal(f?.opens_at), closes: toLocal(f?.closes_at), fields: (f?.fields ?? []).map(x => ({ ...x, optionsText: (x.options ?? []).join(", ") })) });

export function FormEditor({ eventId, draft, live }: { eventId: string; draft: FormRow | null; live: FormRow | null }) {
  const { run, pending } = useAction();
  const [f, setF] = useState<Draft>(() => fromForm(draft ?? live));
  const [dirty, setDirty] = useState(false);
  const up = (p: Partial<Draft>) => { setF(x => ({ ...x, ...p })); setDirty(true); };
  // New questions take their key from the label until saved; published keys never change (answers are stored by key).
  const setField = (i: number, p: Partial<Draft["fields"][number]>) => up({ fields: f.fields.map((x, j) => (j !== i ? x : { ...x, ...p, ...(x.fresh && p.label !== undefined ? { key: keyOf(p.label || `question ${i + 1}`, f.fields.filter((_, k) => k !== i).map(y => y.key)) } : {}) })) });
  const move = (i: number, d: -1 | 1) => { const a = [...f.fields]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; up({ fields: a }); };
  const payload = () => ({ title: f.title, capacity: intOrNull(f.capacity), per_email_limit: Math.min(20, Math.max(1, Number(f.perEmail) || 1)), approval_required: f.approval, waitlist: f.waitlist, opens_at: toIso(f.opens), closes_at: toIso(f.closes),
    fields: f.fields.map(x => ({ key: x.key, label: x.label, type: x.type, required: !!x.required, sensitive: !!x.sensitive, ...(["select", "multiselect"].includes(x.type) ? { options: x.optionsText.split(",").map(s => s.trim()).filter(Boolean) } : {}), ...(x.help ? { help: x.help } : {}) })) });
  const save = async () => { const r = await run(() => saveRegistrationDraft(eventId, payload())); if (r.ok) { setDirty(false); setF(x => ({ ...x, fields: x.fields.map(y => ({ ...y, fresh: false })) })); } return r.ok; };
  const publish = async () => { if (dirty || !draft) { if (!(await save())) return; } await run(() => publishRegistrationDraft(eventId)); setDirty(false); };
  return <Card>
    <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15 }}>{draft ? "Draft" : live ? `Next version (v${live.version + 1})` : "New form"}</h2>
      <p className="k-xs k-muted">Drafts are private. Publishing makes this the live form; the previous version is kept for its registrations.</p></div>
      {dirty && <Chip tone="amber">Unsaved</Chip>}</div>
    <div className="k-col" style={{ gap: 10 }}>
      <label className="k-field"><span>Form title</span><input className="k-input" value={f.title} maxLength={120} onChange={e => up({ title: e.target.value })} /></label>
      <div className="k-grid k-g2">
        <label className="k-field"><span>Capacity</span><input className="k-input" inputMode="numeric" value={f.capacity} placeholder="No limit" onChange={e => up({ capacity: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="k-field"><span>Per email</span><input className="k-input" inputMode="numeric" value={f.perEmail} onChange={e => up({ perEmail: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></label>
        <label className="k-field"><span>Opens</span><input className="k-input" type="datetime-local" value={f.opens} onChange={e => up({ opens: e.target.value })} /></label>
        <label className="k-field"><span>Closes</span><input className="k-input" type="datetime-local" value={f.closes} onChange={e => up({ closes: e.target.value })} /></label>
      </div>
      <label className="k-check"><input type="checkbox" checked={f.approval} onChange={e => up({ approval: e.target.checked })} />Approve each registration manually</label>
      <label className="k-check"><input type="checkbox" checked={f.waitlist} onChange={e => up({ waitlist: e.target.checked })} />Waiting list when full</label>
      <div>
        <b className="k-small k-strong">Questions</b> <span className="k-xs k-muted">Name and email are always asked.</span>
        {f.fields.map((x, i) => <div key={i} className="ax-field-row">
          <input className="k-input" aria-label={`Question ${i + 1} label`} value={x.label} maxLength={160} placeholder="Question" onChange={e => setField(i, { label: e.target.value })} />
          <select className="k-select" aria-label={`Question ${i + 1} type`} value={x.type} onChange={e => setField(i, { type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {["select", "multiselect"].includes(x.type) ? <input className="k-input" aria-label={`Question ${i + 1} options`} value={x.optionsText} placeholder="Options, comma separated" onChange={e => setField(i, { optionsText: e.target.value })} /> : <span className="k-xs k-muted ax-code">{x.key}</span>}
          <label className="k-check"><input type="checkbox" checked={!!x.required} onChange={e => setField(i, { required: e.target.checked })} />Required</label>
          <label className="k-check" title="Stored separately; only owners and managers can read it"><input type="checkbox" checked={!!x.sensitive} onChange={e => setField(i, { sensitive: e.target.checked })} />Sensitive</label>
          <span className="ax-actions"><button type="button" className="k-icon-btn" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="k-icon-btn" aria-label={`Move question ${i + 1} down`} disabled={i === f.fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <button type="button" className="k-icon-btn" aria-label={`Remove question ${i + 1}`} onClick={() => up({ fields: f.fields.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></span>
        </div>)}
        <button type="button" className="k-btn outline sm" style={{ marginTop: 8 }} disabled={f.fields.length >= 40} onClick={() => up({ fields: [...f.fields, { key: keyOf(`question ${f.fields.length + 1}`, f.fields.map(x => x.key)), label: "", type: "text", required: false, sensitive: false, optionsText: "", fresh: true }] })}><Plus size={14} />Add question</button>
        <p className="k-xs k-muted" style={{ margin: "6px 0 0" }}>Mark access needs, dietary or medical questions as sensitive — answers are kept apart and shown only to owners and managers.</p>
      </div>
      <div className="k-row k-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
        {draft && <ActionButton label="Discard draft" className="k-btn ghost sm" run={() => discardRegistrationDraft(eventId)} confirm={{ title: "Discard this draft?", text: "The live form (if any) is not affected.", cta: "Discard", danger: true }} />}
        <button type="button" className="k-btn outline sm" disabled={pending || !f.title.trim()} onClick={() => void save()}>Save draft</button>
        <button type="button" className="k-btn primary sm" disabled={pending || !f.title.trim()} onClick={() => void publish()}>Publish v{(live?.version ?? 0) + 1}</button>
      </div>
    </div>
  </Card>;
}

export function RegistrationQueue({ rows, canWrite, canSensitive, hasSensitive, labels }: { rows: RegRow[]; canWrite: boolean; canSensitive: boolean; hasSensitive: boolean; labels: Record<string, string> }) {
  const [status, setStatus] = useState("open"); const [q, setQ] = useState("");
  const counts = useMemo(() => rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}), [rows]);
  const list = rows.filter(r => (status === "all" || (status === "open" ? ["submitted", "pending_approval"].includes(r.status) : r.status === status)) && (!q.trim() || `${r.name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const filters: [string, string, number][] = [["open", "Awaiting", (counts.submitted ?? 0) + (counts.pending_approval ?? 0)], ["waitlisted", "Waiting list", counts.waitlisted ?? 0], ["approved", "Approved", counts.approved ?? 0], ["rejected", "Rejected", counts.rejected ?? 0], ["cancelled", "Cancelled", counts.cancelled ?? 0], ["all", "All", rows.length]];
  if (!rows.length) return <Empty icon={Search} title="No registrations yet" text="Registrations appear here as people submit the public form." />;
  return <>
    <div className="k-row k-wrap" style={{ gap: 8, marginBottom: 10, justifyContent: "space-between" }}>
      <div className="ax-seg" role="group" aria-label="Filter registrations">{filters.map(([k, l, n]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{l} <span className="k-xs k-muted">{n}</span></button>)}</div>
      <label className="k-input-icon" style={{ width: 220, maxWidth: "100%" }}><Search size={14} aria-hidden /><input className="k-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search registrations" /></label>
    </div>
    {list.length ? <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Registrant</th><th>Answers</th><th>Status</th><th>Submitted</th><th /></tr></thead>
      <tbody>{list.map(r => <tr key={r.id}>
        <td data-label="Registrant"><b className="k-strong">{r.name}</b><div className="k-xs k-muted">{r.email} · form v{r.form_version}</div></td>
        <td data-label="Answers"><div className="ax-answers">{Object.entries(r.answers ?? {}).slice(0, 4).map(([k, v]) => <span key={k}><b>{labels[k] ?? k}:</b> {show(v)}</span>)}{!Object.keys(r.answers ?? {}).length && <span className="k-muted">—</span>}
          {hasSensitive && canSensitive && <SensitiveReveal id={r.id} labels={labels} />}</div></td>
        <td data-label="Status"><Chip tone={STATUS[r.status]?.[1] ?? "gray"}>{STATUS[r.status]?.[0] ?? r.status}</Chip>{r.decision_reason && <div className="k-xs k-muted">{r.decision_reason}</div>}</td>
        <td data-label="Submitted" className="k-xs">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        <td className="ax-actions">{canWrite && (NEXT[r.status] ?? []).map(to => <ActionButton key={to} label={`${VERB[to]} ${r.name}`} className={`k-btn ${to === "approved" ? "primary" : "ghost"} sm`} run={reason => decideRegistration(r.id, to, reason)}
          confirm={to === "approved" ? undefined : { title: `${VERB[to]} ${r.name}?`, text: to === "rejected" ? "They won't get a place. The reason is kept with the decision." : to === "waitlisted" ? "They move to the waiting list and can be approved later." : "Their registration is cancelled and any guest-list entry declined.", cta: VERB[to], danger: to !== "waitlisted" }}
          reason={to === "approved" ? undefined : { label: "Reason (kept on record)", required: to === "rejected" }}>{VERB[to]}</ActionButton>)}</td>
      </tr>)}</tbody></table></div>
      : <p className="k-small" style={{ padding: 10 }}>Nothing in this view.</p>}
    {hasSensitive && !canSensitive && <p className="k-xs k-muted" style={{ marginTop: 8 }}>Sensitive answers are hidden — only owners and managers can view them.</p>}
  </>;
}

function SensitiveReveal({ id, labels }: { id: string; labels: Record<string, string> }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null); const [busy, setBusy] = useState(false); const toast = useKitToast();
  if (data) return <>{Object.entries(data).map(([k, v]) => <span key={k}><b>{labels[k] ?? k}:</b> {show(v)} <Chip tone="purple">Sensitive</Chip></span>)}{!Object.keys(data).length && <span className="k-muted">No sensitive answers.</span>}</>;
  return <button type="button" className="k-link" style={{ justifySelf: "start", fontSize: 11.5 }} disabled={busy} onClick={async () => { setBusy(true); const r = await sensitiveAnswers(id).catch(() => ({ ok: false as const, error: "Network error." })); setBusy(false); if (r.ok) setData(r.data ?? {}); else toast(r.error ?? "Could not load.", "error"); }}><Eye size={12} /> Show sensitive answers</button>;
}
