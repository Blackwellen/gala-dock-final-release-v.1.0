"use client";
import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { requestEmailChange } from "@/lib/actions/account-security";

export function EmailChangeForm({ current, needsPassword, pending: hasPending }: { current: string; needsPassword: boolean; pending: boolean }) {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const { run, pending } = useAction();
  const same = email.trim().toLowerCase() === current.toLowerCase();
  return <>
    <button type="button" className="k-btn outline" onClick={() => setOpen(true)}><Mail size={15} />{hasPending ? "Send new links or use another address" : "Change email"}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Change sign-in email" sub="We'll send a confirmation link to your current and your new address. Nothing changes until both are confirmed.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => requestEmailChange({ email, password })); if (r.ok) { setOpen(false); setPassword(""); setEmail(""); } }}>
        <label className="k-field"><span>New email address</span><input className="k-input" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
        {needsPassword ? <label className="k-field"><span>Current password</span><input className="k-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
          : <p className="k-small">Your account signs in without a password, so we check that you signed in within the last 10 minutes. If it has been longer, sign out and back in first.</p>}
        {same && <p className="k-small k-red">That&apos;s already your sign-in email.</p>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="k-btn primary" disabled={pending || !email || same || (needsPassword && !password)}>{pending && <Loader2 size={15} className="k-spin" />}Send confirmation links</button></div>
      </form>
    </Dialog>
  </>;
}
