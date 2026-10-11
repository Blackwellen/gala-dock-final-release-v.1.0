"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { MessageSquare, FilePenLine, MoreHorizontal, ChevronDown, CircleCheck, Users, Upload, CircleAlert, X, Zap } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";
import { transitionBooking, requestChange, raiseIssue } from "../actions";
import { recordBookingFile } from "./actions";

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="ws-dialog-backdrop" onClick={onClose}><div className="ws-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
    <div className="ws-dialog-head"><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button></div>{children}</div></div>;
}
function useRun() {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<ActionResult>, after?: () => void) => start(async () => { setError(""); const r = await fn(); if (!r.ok) { setError(r.error); return; } toast(r.message ?? "Done"); after?.(); router.refresh(); });
  return { pending, error, run, setError };
}

function FormDialog({ kind, jobId, onClose }: { kind: "change" | "issue"; jobId: string; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return <Dialog title={kind === "change" ? "Request a change" : "Raise an issue"} onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => kind === "change" ? requestChange(jobId, f) : raiseIssue(jobId, f), onClose); }}>
      {kind === "change" ? <label className="ws-field"><span>What needs to change? *</span><textarea name="change" rows={4} required minLength={5} placeholder="e.g. Client wants to add 20 guests to the evening reception" /><small>Accepted commercial terms stay locked until the client agrees a revision.</small></label>
        : <><label className="ws-field"><span>Issue *</span><input name="title" required minLength={3} placeholder="e.g. Fire door alarm fault" /></label><label className="ws-field"><span>Details</span><textarea name="detail" rows={3} /></label></>}
      {error && <p className="ws-form-error" role="alert">{error}</p>}
      <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={onClose}>Cancel</button><button className="ws-btn primary" disabled={pending}>{kind === "change" ? "Record request" : "Log issue"}</button></div>
    </form></Dialog>;
}

export function BookingHeaderActions({ jobId, threadId, next }: { jobId: string; threadId: string | null; next: { to: string; label: string } | null }) {
  const [dialog, setDialog] = useState<null | "change" | "issue" | "status">(null);
  const [more, setMore] = useState(false);
  const { pending, error, run } = useRun();
  return <div className="pk-actions">
    {threadId ? <Link href={`/provider/messages/${threadId}`} className="ws-btn outline"><MessageSquare aria-hidden="true" />Message client</Link> : null}
    <button type="button" className="ws-btn outline" onClick={() => setDialog("change")}><FilePenLine aria-hidden="true" />Request change</button>
    <div className="pv-menu"><button type="button" className="ws-btn outline" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)}><MoreHorizontal aria-hidden="true" />More</button>
      {more && <div className="pv-menu-panel" role="menu"><button type="button" role="menuitem" onClick={() => { setMore(false); setDialog("issue"); }}>Raise an issue</button>
        <Link role="menuitem" href={`/provider/bookings/${jobId}?tab=files`} onClick={() => setMore(false)}>Upload files</Link>
        <Link role="menuitem" href={`/provider/bookings/${jobId}?tab=commercial#cancel`} className="danger" onClick={() => setMore(false)}>Cancel booking…</Link></div>}</div>
    {next && <button type="button" className="ws-btn primary pk-primary" disabled={pending} onClick={() => setDialog("status")}>{next.label}<ChevronDown aria-hidden="true" /></button>}
    {(dialog === "change" || dialog === "issue") && <FormDialog kind={dialog} jobId={jobId} onClose={() => setDialog(null)} />}
    {dialog === "status" && next && <Dialog title={next.label} onClose={() => setDialog(null)}>
      <p>{next.to === "completed" ? "Mark the event as delivered. Payment status won’t change — it updates only when payments clear." : next.to === "active" ? "Record that your team has arrived and the event is underway." : "Confirm this held booking."}</p>
      {error && <p className="ws-form-error" role="alert">{error}</p>}
      <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setDialog(null)}>Cancel</button>
        <button type="button" className="ws-btn primary" disabled={pending} onClick={() => run(() => transitionBooking(jobId, next.to, ""), () => setDialog(null))}>{next.label}</button></div></Dialog>}
  </div>;
}

export function QuickActions({ jobId, canCancel }: { jobId: string; canCancel: boolean }) {
  const [dialog, setDialog] = useState<null | "change" | "issue">(null);
  return <section className="ws-panel pk-quick"><h2><Zap aria-hidden="true" />Quick actions</h2><ul>
    <li><Link href={`/provider/bookings/${jobId}?tab=delivery`}><CircleCheck aria-hidden="true" className="green" /><span><b>Update delivery status</b><small>Mark arrival, start or complete</small></span></Link></li>
    <li><Link href={`/provider/bookings/${jobId}?tab=team`}><Users aria-hidden="true" className="purple" /><span><b>Assign or update team</b><small>Manage staff and resources</small></span></Link></li>
    <li><button type="button" onClick={() => setDialog("change")}><FilePenLine aria-hidden="true" className="orange" /><span><b>Request a change</b><small>Ask client for additional information</small></span></button></li>
    <li><Link href={`/provider/bookings/${jobId}?tab=files`}><Upload aria-hidden="true" className="blue" /><span><b>Upload files or evidence</b><small>Contracts, run sheets, photos and more</small></span></Link></li>
    <li><button type="button" onClick={() => setDialog("issue")}><CircleAlert aria-hidden="true" className="red" /><span><b>Raise an issue</b><small>Report a problem or get support</small></span></button></li>
  </ul>{!canCancel && <small className="ws-muted">This booking is closed; changes are read-only.</small>}
    {dialog && <FormDialog kind={dialog} jobId={jobId} onClose={() => setDialog(null)} />}</section>;
}

export function FileUpload({ jobId }: { jobId: string }) {
  const { pending, error, run, setError } = useRun();
  const [kind, setKind] = useState("evidence");
  return <div className="pk-upload">
    <label className="ws-field"><span>File type</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="evidence">Delivery evidence</option><option value="contract">Contract</option><option value="run_sheet">Run sheet</option><option value="photo">Photo</option><option value="document">Other document</option></select></label>
    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" id="pk-file" onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      run(async () => {
        const body = new FormData(); body.set("file", file); body.set("purpose", "document");
        const res = await fetch("/api/uploads", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: json.error ?? "Upload failed." };
        return recordBookingFile(jobId, json.path, json.name ?? file.name, kind);
      });
      e.target.value = "";
    }} />
    <label htmlFor="pk-file" className="ws-btn outline" onClick={() => setError("")}><Upload aria-hidden="true" />{pending ? "Uploading…" : "Upload file"}</label>
    <small className="ws-muted">PDF, PNG or JPG up to 10MB. Files are stored privately.</small>
    {error && <p className="ws-form-error" role="alert">{error}</p>}
  </div>;
}
