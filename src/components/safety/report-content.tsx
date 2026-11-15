"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Flag, Loader2 } from "lucide-react";
import { Dialog } from "@/components/kit/client";
import { reportContent, reportContentPublic } from "@/lib/actions/reports";
import { Turnstile } from "@/components/turnstile";
import { reportReasons, SUBJECT_LABEL, type ReportSubject } from "@/lib/safety/content-reports";
import "@/styles/report-content.css";

/**
 * Q74 (D8, Online Safety Act s.20): "Report" on a listing, event, review or business profile. Signed-out visitors are sent to sign
 * in (or can email support). The person reported is never told who reported them; the reporter hears the outcome in notifications.
 * Q75: signed-out visitors can report too (bot check + optional email); signing in remains offered so they hear the outcome.
 */
export function ReportContentButton({ subject, id, name, signedIn, next, compact = false }: { subject: ReportSubject; id: string; name: string; signedIn: boolean; next: string; compact?: boolean }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [note, setNote] = useState("");
  const [pending, start] = useTransition(), [error, setError] = useState(""), [done, setDone] = useState(false);
  const [email, setEmail] = useState(""), [captcha, setCaptcha] = useState(""), [captchaReset, setCaptchaReset] = useState(0);
  const onToken = useCallback((t: string) => setCaptcha(t), []);
  const label = SUBJECT_LABEL[subject];
  const submit = () => start(async () => {
    setError("");
    const r = signedIn ? await reportContent(subject, id, reason, note) : await reportContentPublic(subject, id, reason, note, email, captcha);
    if (!signedIn) setCaptchaReset(n => n + 1);   // Turnstile tokens are single-use
    if (!r.ok) setError(r.error); else setDone(true);
  });
  const trigger = <><Flag size={compact ? 12 : 14} aria-hidden="true" />{compact ? <span className="rc-sr">Report this {label}</span> : `Report this ${label}`}</>;
  return <>
    <button type="button" className={compact ? "rc-trigger compact" : "rc-trigger"} onClick={() => { setOpen(true); setDone(false); setError(""); }} aria-label={`Report this ${label}: ${name}`} title={`Report this ${label}`}>{trigger}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Report this ${label}`} sub="Our Trust & Safety team reviews every report. The person or business you report isn’t told who reported them.">
      {done ? <div className="rc-body"><p role="status">Thanks — we’ve received your report.{signedIn ? " We’ll tell you the outcome in your notifications." : email ? " We may email you if we need more detail." : ""}</p>
        <div className="rc-actions"><button type="button" className="k-btn primary" onClick={() => setOpen(false)}>Close</button></div></div>
      : <form className="rc-body" onSubmit={e => { e.preventDefault(); if (reason) submit(); }}>
        <fieldset><legend>What’s wrong with it?</legend>{reportReasons(subject).map(r => <label key={r.code} className="rc-radio"><input type="radio" name="reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} />{r.label}</label>)}</fieldset>
        <label className="rc-note"><span>Anything else we should know? {reason === "other_policy" ? "(required)" : "(optional)"}</span>
          <textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        {!signedIn && <>
          <label className="rc-note"><span>Your email (optional — only if we may contact you about this)</span>
            <input type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <p className="rc-help"><Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link> instead to hear the outcome in your notifications.</p>
          <Turnstile onToken={onToken} resetKey={captchaReset} /></>}
        <p className="rc-help">If someone is in immediate danger, call 999. Report crimes to the police as well. Never pay a seller outside Gala Dock to “secure” a booking.</p>
        {error && <p className="k-error" role="alert">{error}</p>}
        <div className="rc-actions"><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="k-btn primary" disabled={pending || !reason}>{pending ? <Loader2 size={15} className="rc-spin" /> : <Flag size={15} />}Send report</button></div>
      </form>}
    </Dialog>
  </>;
}
