"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { decideApproval, postComment } from "./actions";

export function ApprovalButtons({ token, id, title, viewHref }: { token: string; id: string; title: string; viewHref?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const run = (decision: "approved" | "rejected") => start(async () => {
    setError("");
    const r = await decideApproval(token, id, decision, decision === "rejected" ? note : "");
    if (r.ok) { setMode("idle"); router.refresh(); } else setError(r.error);
  });
  if (mode === "reject") return <form className="pc-reject" onSubmit={e => { e.preventDefault(); run("rejected"); }}>
    <label className="pt-sr" htmlFor={`rj-${id}`}>Reason for rejecting {title}</label>
    <input id={`rj-${id}`} value={note} onChange={e => setNote(e.target.value)} placeholder="What should change?" maxLength={1000} required minLength={3} autoFocus />
    <button type="submit" className="pt-btn danger" disabled={pending}>{pending ? "Sending…" : "Reject"}</button>
    <button type="button" className="pt-btn outline" onClick={() => { setMode("idle"); setError(""); }} disabled={pending}>Cancel</button>
    {error && <p className="pc-err" role="alert">{error}</p>}
  </form>;
  return <div className="pc-decide">
    {viewHref && <a className="pt-btn outline" href={viewHref}>View</a>}
    <button type="button" className="pt-btn primary" disabled={pending} onClick={() => { if (window.confirm(`Approve "${title}"? The organiser will be notified and can proceed.`)) run("approved"); }}>{pending ? "Saving…" : "Approve"}</button>
    <button type="button" className="pt-btn danger" disabled={pending} onClick={() => setMode("reject")}>Reject</button>
    {error && <p className="pc-err" role="alert">{error}</p>}
  </div>;
}

export function MessageComposer({ token, placeholder = "Write a message to your organiser…", initial = "" }: { token: string; placeholder?: string; initial?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(initial);
  const [state, setState] = useState<{ error?: string; sent?: boolean }>({});
  return <form className="pc-compose" id="compose" onSubmit={e => { e.preventDefault(); start(async () => {
    const r = await postComment(token, body);
    if (r.ok) { setBody(""); setState({ sent: true }); router.refresh(); } else setState({ error: r.error });
  }); }}>
    <label className="pt-sr" htmlFor="pc-msg">Message</label>
    <textarea id="pc-msg" value={body} onChange={e => { setBody(e.target.value); setState({}); }} placeholder={placeholder} maxLength={2000} rows={3} required />
    <div><small>{state.error ? <span className="pc-err" role="alert">{state.error}</span> : state.sent ? "Sent — your organiser has been notified." : `${body.length}/2000`}</small>
      <button type="submit" className="pt-btn primary" disabled={pending || !body.trim()}><Send aria-hidden="true" />{pending ? "Sending…" : "Send"}</button></div>
  </form>;
}

/** Asks the organiser for a secure payment link for an issued invoice (no payment is taken or recorded here). */
export function RequestPayment({ token, number, amount }: { token: string; number: string; amount: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return <button type="button" className="pt-btn outline pc-pay" disabled={pending || done} title="Ask your organiser for a secure payment link"
    onClick={() => start(async () => { const r = await postComment(token, `Please send me a secure payment link for ${number} (${amount}).`); if (r.ok) { setDone(true); router.refresh(); } else window.alert(r.error); })}>
    {done ? "Requested" : pending ? "Sending…" : "Request link"}</button>;
}
