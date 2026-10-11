"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock, Paperclip, Users, Building2, KeyRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { REASONS } from "./perm";
import { requestAccess, decideAccess, openConversation, touchConversation, closeAccess, type Opened } from "./actions";

const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** Request form, launched from a support/trust case. High-risk reasons go to a second administrator for approval. */
export function RequestForm({ caseType, caseId, conversations, approvers }: { caseType: "support" | "trust"; caseId: string; approvers: number; conversations: { id: string; subject: string; kind: string; messages: number; last_message_at: string }[] }) {
  const router = useRouter();
  const [reason, setReason] = useState(""), [why, setWhy] = useState(""), [mins, setMins] = useState(120), [sel, setSel] = useState<string[]>([]), [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const high = !!REASONS.find(r => r[0] === reason)?.[2] && approvers > 0;
  return <form className="adb-panel acv-gate" onSubmit={e => { e.preventDefault(); setErr(""); start(async () => {
    const r = await requestAccess({ caseType, caseId, reason, justification: why, conversations: sel, minutes: mins });
    if (r.ok && r.data) router.push(`/admin/conversations/${r.data.id}`); else if (!r.ok) setErr(r.error); }); }}>
    <h2>Request conversation access</h2>
    <p>Only conversations involving the people on this case can be requested. Access is read-only, time-limited and every conversation you open is logged individually.</p>
    <fieldset className="acv-pick"><legend>Conversations</legend>
      {conversations.length ? conversations.map(c => <label key={c.id}><input type="checkbox" checked={sel.includes(c.id)} onChange={e => setSel(s => e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id))} />
        <span><b>{c.subject || "Untitled conversation"}</b><small>{c.kind} · {c.messages} messages · last {stamp(c.last_message_at)}</small></span></label>)
        : <p className="adb-none">No conversations involve this case’s people.</p>}</fieldset>
    <label>Reason<select className="adb-select" required value={reason} onChange={e => setReason(e.target.value)}><option value="">Choose a reason…</option>{REASONS.map(([k, l, h]) => <option key={k} value={k}>{l}{h && approvers > 0 ? " (needs approval)" : ""}</option>)}</select></label>
    <label>Justification <small>(20+ characters; what you need to establish and why)</small><textarea rows={3} maxLength={2000} required value={why} onChange={e => setWhy(e.target.value)} /></label>
    <label>Access window<select className="adb-select" value={mins} onChange={e => setMins(Number(e.target.value))}>{[30, 60, 120, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}</select></label>
    {high && <p className="acv-note"><ShieldAlert aria-hidden="true" />This reason is high-risk: another administrator with break-glass permission must approve before you can read anything.</p>}
    {err && <p className="acv-err" role="alert">{err}</p>}
    <button type="submit" className="adb-btn primary" disabled={pending || !reason || why.trim().length < 20 || !sel.length}>{pending ? "Submitting…" : high ? "Submit for approval" : "Request access"}</button>
  </form>;
}

export function DecideForm({ grant }: { grant: string }) {
  const router = useRouter(); const [note, setNote] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  const go = (approve: boolean) => start(async () => { const r = await decideAccess(grant, approve, note); if (r.ok) router.refresh(); else setErr(r.error); });
  return <div className="acv-decide"><label>Decision note<input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Why you approve or reject" /></label>
    {err && <p className="acv-err" role="alert">{err}</p>}
    <div><button type="button" className="adb-btn primary" disabled={pending || note.trim().length < 5} onClick={() => go(true)}>Approve</button>
      <button type="button" className="adb-btn" disabled={pending || note.trim().length < 5} onClick={() => go(false)}>Reject</button></div></div>;
}

/** Step-up: re-verify the admin's TOTP factor (refreshes the session's amr timestamp the server checks). */
function StepUp({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  return <form className="acv-stepup" onSubmit={e => { e.preventDefault(); setErr(""); start(async () => {
    const sb = createClient(); const { data } = await sb.auth.mfa.listFactors(); const f = data?.totp?.find(x => x.status === "verified");
    if (!f) { setErr("No authenticator app is set up on this account."); return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
    if (error) setErr("That code didn’t work — try the latest one."); else onDone(); }); }}>
    <KeyRound aria-hidden="true" /><div><b>Verify it’s you</b><small>Enter the 6-digit code from your authenticator app. Required within 10 minutes of reading break-glass conversations.</small></div>
    <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Authenticator code" autoFocus />
    <button type="submit" className="adb-btn primary" disabled={pending || code.length !== 6}>{pending ? "Verifying…" : "Verify"}</button>
    <button type="button" className="adb-btn" onClick={onCancel}>Cancel</button>
    {err && <p className="acv-err" role="alert">{err}</p>}
  </form>;
}

/** Reader for one in-scope conversation. Heartbeat keeps the access log's duration accurate; closing (or leaving) ends the log entry. */
export function Reader({ grant, conversation, subject }: { grant: string; conversation: string; subject: string }) {
  const [data, setData] = useState<Opened | null>(null), [err, setErr] = useState(""), [stepUp, setStepUp] = useState(false); const [pending, start] = useTransition();
  const log = useRef<string | null>(null);
  const open = () => start(async () => { setErr(""); const r = await openConversation(grant, conversation); if (r.ok && r.data) { setData(r.data); log.current = r.data.log_id; setStepUp(false); } else if (!r.ok) { if (r.stepUp) setStepUp(true); else setErr(r.error); } });
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => { if (log.current) void touchConversation(log.current); }, 60_000);
    return () => { clearInterval(t); if (log.current) void touchConversation(log.current, true); };
  }, [data]);
  if (!data) return <div className="acv-open">
    {stepUp ? <StepUp onDone={open} onCancel={() => setStepUp(false)} />
      : <button type="button" className="adb-btn primary" disabled={pending} onClick={open}><Lock aria-hidden="true" />{pending ? "Opening…" : `Open “${subject || "Untitled conversation"}”`}</button>}
    {err && <p className="acv-err" role="alert">{err}</p>}</div>;
  return <section className="acv-thread" aria-label="Conversation transcript">
    <header><div><h3>{data.conversation.subject || "Untitled conversation"}</h3><small>{data.conversation.kind} · started {stamp(data.conversation.created_at)}</small></div>
      <span className="acv-ro"><Lock aria-hidden="true" />Read-only · this view is logged</span>
      <button type="button" className="adb-btn" onClick={() => { if (log.current) void touchConversation(log.current, true); log.current = null; setData(null); }}><X aria-hidden="true" />Close</button></header>
    <ul className="acv-parts">{data.participants.map((p, i) => <li key={i} className={p.left ? "left" : ""}>{p.type === "workspace" ? <Building2 aria-hidden="true" /> : <Users aria-hidden="true" />}{p.name}{p.left && <small>left</small>}</li>)}</ul>
    <ol className="acv-msgs">{data.messages.length ? data.messages.map(m => <li key={m.id}><div><b>{m.sender}</b><time dateTime={m.created_at}>{stamp(m.created_at)}</time>{m.edited && <small>edited</small>}</div>
      {m.deleted ? <p className="acv-del">Message deleted by sender</p> : <p>{m.body}</p>}{m.attachments > 0 && <small className="acv-att"><Paperclip aria-hidden="true" />{m.attachments} attachment{m.attachments > 1 ? "s" : ""}</small>}</li>)
      : <li className="acv-none">No messages.</li>}</ol>
  </section>;
}

export function CloseForm({ grant }: { grant: string }) {
  const router = useRouter(); const [notify, setNotify] = useState(true), [why, setWhy] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  return <form className="acv-close" onSubmit={e => { e.preventDefault(); setErr(""); start(async () => { const r = await closeAccess(grant, notify, why); if (r.ok) router.refresh(); else setErr(r.error); }); }}>
    <h3>Close access</h3>
    <label className="acv-check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />Notify affected users that authorised staff reviewed their messages</label>
    {!notify && <label>Why notification is withheld <small>(e.g. would prejudice a fraud, safety or legal investigation)</small><input value={why} maxLength={300} onChange={e => setWhy(e.target.value)} /></label>}
    {err && <p className="acv-err" role="alert">{err}</p>}
    <button type="submit" className="adb-btn" disabled={pending || (!notify && why.trim().length < 10)}>{pending ? "Closing…" : "Close access now"}</button>
  </form>;
}
