"use client";
import { useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { cancelOwnershipTransfer, requestOwnershipTransfer, respondOwnershipTransfer } from "@/lib/actions/ownership";

export function TransferRequestForm({ workspaceId, workspaceName, managers, needsPassword, blocked }: { workspaceId: string; workspaceName: string; managers: { id: string; name: string }[]; needsPassword: boolean; blocked: boolean }) {
  const [open, setOpen] = useState(false); const [to, setTo] = useState(managers[0]?.id ?? ""); const [confirm, setConfirm] = useState(""); const [password, setPassword] = useState(""); const { run, pending } = useAction();
  const matches = confirm.trim().toLowerCase() === workspaceName.trim().toLowerCase();
  if (!managers.length) return <p className="k-small k-muted">Make someone a manager first — ownership can only move to an active manager.</p>;
  return <>
    <button type="button" className="k-btn outline" disabled={blocked} onClick={() => setOpen(true)}><Crown size={15} />Transfer ownership</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Transfer ownership" sub="The new owner must accept. You'll become a manager, and the Gala Dock plan billing contact moves to them.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => requestOwnershipTransfer(workspaceId, to, { confirm, password })); if (r.ok) { setOpen(false); setConfirm(""); setPassword(""); } }}>
        <label className="k-field"><span>New owner (active managers)</span><select className="k-input" value={to} onChange={e => setTo(e.target.value)}>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="k-field"><span>Type <b>{workspaceName}</b> to confirm</span><input className="k-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></label>
        {needsPassword ? <label className="k-field"><span>Your password</span><input className="k-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
          : <p className="k-small">Your account signs in without a password, so you must have signed in within the last 10 minutes.</p>}
        <p className="k-small k-muted">If two-step verification is on you&apos;ll be asked to verify first. The request expires after 7 days.</p>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="k-btn danger" disabled={pending || !to || !matches || (needsPassword && !password)}>{pending && <Loader2 size={15} className="k-spin" />}Send transfer request</button></div>
      </form>
    </Dialog>
  </>;
}

export function TransferCancel({ transferId }: { transferId: string }) {
  const { run, pending } = useAction();
  return <button type="button" className="k-btn ghost sm" disabled={pending} onClick={() => void run(() => cancelOwnershipTransfer(transferId))}>{pending && <Loader2 size={13} className="k-spin" />}Cancel request</button>;
}

export function TransferRespond({ transferId, workspaceName, needsPassword }: { transferId: string; workspaceName: string; needsPassword: boolean }) {
  const [open, setOpen] = useState(false); const [password, setPassword] = useState(""); const { run, pending } = useAction();
  return <div className="k-row" style={{ gap: 8, flexWrap: "wrap" }}>
    <button type="button" className="k-btn primary sm" onClick={() => setOpen(true)}><Crown size={14} />Accept ownership</button>
    <button type="button" className="k-btn ghost sm" disabled={pending} onClick={() => void run(() => respondOwnershipTransfer(transferId, false))}>Decline</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Become the owner of ${workspaceName}?`} sub="You'll control billing, roles and payouts setup. The current owner becomes a manager.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => respondOwnershipTransfer(transferId, true, { password })); if (r.ok) setOpen(false); }}>
        {needsPassword ? <label className="k-field"><span>Your password</span><input className="k-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
          : <p className="k-small">Your account signs in without a password, so you must have signed in within the last 10 minutes.</p>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Not now</button>
          <button className="k-btn primary" disabled={pending || (needsPassword && !password)}>{pending && <Loader2 size={15} className="k-spin" />}Accept ownership</button></div>
      </form>
    </Dialog>
  </div>;
}
