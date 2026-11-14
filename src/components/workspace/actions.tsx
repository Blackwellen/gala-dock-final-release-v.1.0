"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { useToast } from "@/components/ui";

export type ActionResult = { ok: true; message?: string; redirect?: string } | { ok: false; error: string };

/**
 * Runs a server action. Consequential actions can require confirmation and/or a typed reason
 * (Admin actions always pass `reason`), which is sent to the server and written to the audit log.
 */
export function ActionButton({ action, args = [], children, variant = "outline", className = "", confirm, reason, reasonOptions, outcome, disabled, title }: {
  action: (...args: never[]) => Promise<ActionResult>;
  args?: unknown[];
  children: ReactNode;
  variant?: "primary" | "outline" | "soft" | "danger" | "ghost";
  className?: string;
  confirm?: { title: string; body: string; cta?: string };
  reason?: boolean;
  reasonOptions?: string[];
  outcome?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, start] = useTransition();
  // Q49: the redirect runs in its own transition so the button stays disabled until the destination renders (a router.push after
  // the await is not part of the first transition, so the button used to re-enable while the next page loaded and a second click
  // re-ran the action). `busy` closes the gap between the click and React's first pending render.
  const [navigating, startNav] = useTransition(); const pending = running || navigating; const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  function run(extra: unknown[] = []) {
    if (busy.current || pending) return;
    busy.current = true;
    setError("");
    start(async () => {
      try {
        const result = await (action as (...a: unknown[]) => Promise<ActionResult>)(...args, ...extra);
        if (!result) return; // a server-side redirect() (e.g. expired session) is already navigating
        if (!result.ok) { setError(result.error); if (!open) toast(result.error); return; }
        setOpen(false);
        if (result.message) toast(result.message);
        const to = result.redirect;
        if (to) startNav(() => router.push(to)); else router.refresh();
      } catch { const msg = "Network error — your change was not saved."; setError(msg); if (!open) toast(msg); } finally { busy.current = false; }
    });
  }

  const needsDialog = !!(confirm || reason || outcome);
  return <>
    <button type="button" className={`ws-btn ${variant} ${className}`} disabled={disabled || pending} aria-busy={pending} title={title}
      onClick={() => needsDialog ? setOpen(true) : run()}>{children}</button>
    {open && <div className="ws-dialog-backdrop" onClick={() => !pending && setOpen(false)}>
      <form className="ws-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onClick={e => e.stopPropagation()}
        onSubmit={e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const extra: unknown[] = [];
          if (reason) extra.push(String(f.get("reason") ?? "").trim());
          if (outcome) extra.push(String(f.get("outcome") ?? "").trim());
          run(extra);
        }}>
        <div className="ws-dialog-head"><h2 id={`${id}-t`}>{confirm?.title ?? "Confirm action"}</h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></div>
        {confirm?.body && <p>{confirm.body}</p>}
        {outcome && <label className="ws-field"><span>Documented outcome *</span><textarea name="outcome" required minLength={3} rows={3} placeholder="What was the resolution?" /></label>}
        {reason && <label className="ws-field"><span>Reason (recorded in audit log) *</span>
          {reasonOptions ? <select name="reason" required defaultValue=""><option value="" disabled>Select a reason…</option>{reasonOptions.map(r => <option key={r}>{r}</option>)}</select>
            : <textarea name="reason" required minLength={5} rows={3} placeholder="Explain why this action is necessary" />}</label>}
        {error && <p className="ws-form-error" role="alert">{error}</p>}
        <div className="ws-dialog-actions">
          <button type="button" className="ws-btn outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
          <button type="submit" className={`ws-btn ${variant === "danger" ? "danger" : "primary"}`} disabled={pending}>{pending ? "Working…" : confirm?.cta ?? "Confirm"}</button>
        </div>
      </form>
    </div>}
  </>;
}

/** Plain form wrapper for server actions that take FormData (wizards, settings, composers). */
export function ActionForm({ action, children, className = "", resetOnSuccess = false }: {
  action: (data: FormData) => Promise<ActionResult>; children: ReactNode; className?: string; resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, start] = useTransition();
  // Q49: submit buttons were never disabled and a second Enter/click while the action ran (or while its redirect loaded) re-ran
  // it — duplicate venues, services, packages, bookings and quotes from the provider wizards. One submit at a time, pending until
  // the destination renders (see ActionButton).
  const [navigating, startNav] = useTransition(); const pending = running || navigating; const busy = useRef(false);
  const [error, setError] = useState("");
  return <form className={className} aria-busy={pending} data-pending={pending ? "" : undefined} onSubmit={e => {
    e.preventDefault();
    if (busy.current || pending) return;
    busy.current = true;
    const form = e.currentTarget;
    const data = new FormData(form);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    setError("");
    start(async () => {
      try {
        const result = await action(data);
        if (!result) return; // a server-side redirect() is already navigating
        if (!result.ok) { setError(result.error); return; }
        if (resetOnSuccess) form.reset();
        if (result.message) toast(result.message);
        const to = result.redirect;
        if (to) startNav(() => router.push(to)); else router.refresh();
      } catch { setError("Network error — your change was not saved."); } finally { busy.current = false; }
    });
  }}>
    {children}
    {error && <p className="ws-form-error" role="alert">{error}</p>}
  </form>;
}
