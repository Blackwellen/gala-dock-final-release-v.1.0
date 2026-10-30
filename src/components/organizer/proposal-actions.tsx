"use client";
import Link from "next/link";
import { useState } from "react";
import { PenLine, Eye, Send, Copy, ChevronDown, Link2, Download, Trash2, RotateCcw, Trophy, Ban, RefreshCw } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { reviseProposal, withdrawProposal, duplicateProposal, convertProposal, toggleProposalOption, revokeProposalLink } from "@/lib/actions/proposals";

export function ProposalHeaderActions({ id, status, shareUrl, linkRevoked = false }: { id: string; status: string; shareUrl: string; linkRevoked?: boolean }) {
  const { run, pending } = useAction();
  const draft = status === "draft";
  return <div className="k-row k-wrap" style={{ gap: 8 }}>
    {draft ? <Link className="k-btn primary lg" href={`/organizer/proposals/new?step=2&id=${id}`}><PenLine size={15} />Edit draft</Link> : <button className="k-btn primary lg" disabled={pending || ["accepted", "converted"].includes(status)} onClick={() => void run(() => reviseProposal(id))}><RotateCcw size={15} />Revise</button>}
    <a className="k-btn ghost lg" href={draft ? `/organizer/proposals/new?step=5&id=${id}` : shareUrl} target={draft ? undefined : "_blank"}><Eye size={15} />Preview</a>
    <Link className="k-btn ghost lg" href={`/organizer/proposals/new?step=5&id=${id}`} aria-disabled={!draft} style={!draft ? { pointerEvents: "none", opacity: .5 } : undefined}><Send size={15} />Send</Link>
    <button className="k-btn ghost lg" disabled={pending} onClick={() => void run(() => duplicateProposal(id))}><Copy size={15} />Duplicate</button>
    <Menu label="More" width={210} trigger={({ toggle, open, id: mid }) => <button className="k-btn ghost lg" onClick={toggle} aria-expanded={open} aria-controls={mid}>More<ChevronDown size={15} /></button>}>{close => <>
      <button role="menuitem" className="k-menu-item" disabled={status !== "accepted"} onClick={() => { close(); void run(() => convertProposal(id)); }}><Trophy size={15} />Convert to event</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); window.print(); }}><Download size={15} />Download PDF</button>
      {!draft && (linkRevoked ? <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => revokeProposalLink(id, true)); }}><RefreshCw size={15} />Issue a new client link</button>
        : <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); void run(() => revokeProposalLink(id)); }}><Ban size={15} />Revoke client link</button>)}
      <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" disabled={!["sent", "viewed"].includes(status)} onClick={() => { close(); void run(() => withdrawProposal(id)); }}><Trash2 size={15} />Withdraw</button></>}</Menu>
  </div>;
}
export function ProposalStatusActions({ id, status, shareUrl }: { id: string; status: string; shareUrl: string }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const [confirm, setConfirm] = useState(false);
  const open = ["sent", "viewed"].includes(status);
  return <div className="k-col" style={{ gap: 8, marginTop: 12 }}>
    {status === "draft" ? <Link className="k-btn primary block lg" href={`/organizer/proposals/new?step=5&id=${id}`}><Send size={15} />Send proposal</Link> : status === "accepted" ? <button className="k-btn primary block lg" disabled={pending} onClick={() => void run(() => convertProposal(id))}><Trophy size={15} />Convert to event</button> : null}
    <button className="k-btn outline block" disabled={status === "draft"} title={status === "draft" ? "Send the proposal to create a client link" : ""} onClick={async () => { try { await navigator.clipboard.writeText(location.origin + shareUrl); toast("Client link copied"); } catch { toast(location.origin + shareUrl); } }}><Link2 size={15} />Share link</button>
    <button className="k-btn outline block" onClick={() => window.print()}><Download size={15} />Download PDF</button>
    <button className="k-btn danger block" disabled={!open} onClick={() => setConfirm(true)}><Trash2 size={15} />Withdraw proposal</button>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Withdraw this proposal?" sub="The client link will stop accepting. The issued version stays in the history." footer={<><button className="k-btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="k-btn danger" disabled={pending} onClick={async () => { const r = await run(() => withdrawProposal(id)); if (r.ok) setConfirm(false); }}>Withdraw</button></>}><span /></Dialog>
  </div>;
}
export function OptionToggle({ id, index, on, locked }: { id: string; index: number; on: boolean; locked: boolean }) {
  const { run } = useAction(); const [v, setV] = useState(on);
  return <button type="button" role="switch" aria-checked={v} aria-label="Include option" className="k-toggle" disabled={locked} title={locked ? "Issued proposals are locked" : ""} onClick={async () => { setV(!v); const r = await run(() => toggleProposalOption(id, index, !v)); if (!r.ok) setV(v); }} />;
}
