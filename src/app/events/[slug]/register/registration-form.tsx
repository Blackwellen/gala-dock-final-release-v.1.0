"use client";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { submitRegistration } from "@/lib/guests/access";

export type Field = { key: string; label?: string; type?: "text" | "textarea" | "email" | "number" | "select" | "multiselect" | "checkbox" | "date" | "phone"; required?: boolean; options?: string[]; sensitive?: boolean; max?: number; help?: string };

/** Renders a published registration form version. The server re-validates everything; this only shapes the answers' types. */
export function RegistrationForm({ formId, fields, defaults }: { formId: string; fields: Field[]; defaults: { email: string } }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(defaults.email);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<{ status: string; text: string } | null>(null); const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const requestId = useMemo(() => crypto.randomUUID(), []);   // idempotent retries of the same submission
  const set = (k: string, v: unknown) => setAnswers(a => ({ ...a, [k]: v }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); setErr("");
    start(async () => { const r = await submitRegistration(formId, { name, email, answers, request_id: requestId });
      if (r.ok) setDone({ status: r.data?.status ?? "submitted", text: r.message ?? "Thanks — you're registered." }); else setErr(r.error ?? "Could not submit the registration."); }); };
  if (done) return <div className="gf-done" role="status"><CheckCircle2 size={28} aria-hidden /><div><b>{done.text}</b><p>{done.status === "approved" ? "A confirmation is on its way to your email." : done.status === "waitlisted" ? "We'll email you if a place opens up." : "You'll get an email once the organiser decides."}</p></div></div>;
  return <form className="gf-form" onSubmit={submit}>
    <div className="gf-two"><label className="k-field"><span>Full name <i aria-hidden>*</i></span><input className="k-input" required value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
      <label className="k-field"><span>Email <i aria-hidden>*</i></span><input className="k-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></label></div>
    {fields.filter(f => f && typeof f.key === "string").map(f => { const id = `rf-${f.key}`; const label = <>{f.label || f.key}{f.required && <i aria-hidden> *</i>}{f.sensitive && <small className="gf-priv"><Lock size={11} aria-hidden />private</small>}</>;
      const v = answers[f.key];
      if (f.type === "checkbox") return <label key={f.key} className="k-check gf-cb"><input id={id} type="checkbox" required={f.required} checked={v === true} onChange={e => set(f.key, e.target.checked)} />{label}</label>;
      if (f.type === "select") return <label key={f.key} className="k-field" htmlFor={id}><span>{label}</span><select id={id} className="k-select" required={f.required} value={typeof v === "string" ? v : ""} onChange={e => set(f.key, e.target.value || null)}><option value="">Choose…</option>{(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select>{f.help && <small>{f.help}</small>}</label>;
      if (f.type === "multiselect") return <fieldset key={f.key} className="gf-set"><legend>{label}</legend><div className="gf-multi">{(f.options ?? []).map(o => { const arr = Array.isArray(v) ? v as string[] : []; return <label key={o} className="k-check"><input type="checkbox" checked={arr.includes(o)} onChange={e => set(f.key, e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} />{o}</label>; })}</div></fieldset>;
      if (f.type === "textarea") return <label key={f.key} className="k-field" htmlFor={id}><span>{label}</span><textarea id={id} className="k-textarea" rows={3} required={f.required} maxLength={f.max ?? 1000} value={typeof v === "string" ? v : ""} onChange={e => set(f.key, e.target.value)} />{f.help && <small>{f.help}</small>}</label>;
      return <label key={f.key} className="k-field" htmlFor={id}><span>{label}</span><input id={id} className="k-input" required={f.required} maxLength={f.max ?? 1000}
        type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "phone" ? "tel" : "text"}
        value={v == null ? "" : String(v)} onChange={e => set(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />{f.help && <small>{f.help}</small>}</label>; })}
    <div className="gf-actions"><button className="k-btn primary" type="submit" disabled={pending}>{pending ? "Submitting…" : "Register"}</button></div>
    <p className={`gf-msg ${err ? "bad" : ""}`} role="alert" aria-live="assertive">{err}</p>
  </form>;
}
