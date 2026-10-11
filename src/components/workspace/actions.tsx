"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
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
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  function run(extra: unknown[] = []) {
    setError("");
    start(async () => {
      const result = await (action as (...a: unknown[]) => Promise<ActionResult>)(...args, ...extra);
      if (!result.ok) { setError(result.error); if (!open) toast(result.error); return; }
      setOpen(false);
      if (result.message) toast(result.message);
      if (result.redirect) router.push(result.redirect); else router.refresh();
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
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <form className={className} aria-busy={pending} onSubmit={e => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    setError("");
    start(async () => {
      const result = await action(data);
      if (!result.ok) { setError(result.error); return; }
      if (resetOnSuccess) form.reset();
      if (result.message) toast(result.message);
      if (result.redirect) router.push(result.redirect); else router.refresh();
    });
  }}>
    {children}
    {error && <p className="ws-form-error" role="alert">{error}</p>}
  </form>;
}
