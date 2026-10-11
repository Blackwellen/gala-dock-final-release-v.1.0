"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CircleCheck, Ban, CircleHelp, FileText, LockKeyhole, Users, Share2, Bookmark, X, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";
import { respondToRequest } from "../actions";
import { offerOption, askClarification, toggleSaved } from "./actions";

type Mode = "available" | "unavailable" | "clarify" | "hold" | "standby";

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="ws-dialog-backdrop" onClick={onClose}><div className="ws-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
    <div className="ws-dialog-head"><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button></div>{children}</div></div>;
}

/** Quick response rail. Hard conflicts disable the options that would commit the date. */
export function QuickResponse({ itemId, open, hard, hardReason, expired }: { itemId: string; open: boolean; hard: boolean; hardReason: string; expired: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter(), toast = useToast();
  const run = (fn: () => Promise<ActionResult>) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    setMode(null); toast(r.message ?? "Done"); router.refresh();
  });
  const blocked = !open || expired;
  const options: { key: Mode | "quote"; icon: LucideIcon; tone: string; title: string; text: string; disabled?: boolean; why?: string }[] = [
    { key: "available", icon: CircleCheck, tone: "green", title: "I’m available", text: "Confirm availability for these dates", disabled: blocked || hard, why: hard ? hardReason : undefined },
    { key: "unavailable", icon: Ban, tone: "red", title: "I’m unavailable", text: "Decline this request", disabled: blocked },
    { key: "clarify", icon: CircleHelp, tone: "blue", title: "Need clarification", text: "Ask a question", disabled: blocked },
    { key: "quote", icon: FileText, tone: "blue", title: "Send a quote", text: "Create and send a custom quote", disabled: expired },
    { key: "hold", icon: LockKeyhole, tone: "red", title: "Offer conditional hold", text: "Hold the dates while finalising details", disabled: blocked || hard, why: hard ? hardReason : undefined },
    { key: "standby", icon: Users, tone: "blue", title: "Offer as standby", text: "Be considered if primary is unavailable", disabled: blocked },
  ];
  return <>
    <ul className="pq-list">{options.map(o => <li key={o.key}>
      {o.key === "quote" && !o.disabled ? <Link href={`/provider/opportunities/${itemId}/quote?step=1`} className={`pq-opt ${o.tone}`}><o.icon aria-hidden="true" /><span><b>{o.title}</b><small>{o.text}</small></span></Link>
        : <button type="button" className={`pq-opt ${o.tone}`} disabled={o.disabled || pending} title={o.why} onClick={() => setMode(o.key as Mode)}>
          <o.icon aria-hidden="true" /><span><b>{o.title}</b><small>{o.why && o.disabled ? o.why : o.text}</small></span></button>}
    </li>)}</ul>
    {expired && <p className="pq-note">The response deadline passed, so this request is <b>Expired / No response</b>. A new request is needed to respond.</p>}
    {mode === "available" && <Dialog title="Confirm availability" onClose={() => setMode(null)}>
      <p>The requester will see that you’re available for these dates. This doesn’t create a booking or a hold.</p>
      <form onSubmit={e => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get("note") ?? ""); run(() => respondToRequest(itemId, "available", note)); }}>
        <label className="ws-field"><span>Message (optional)</span><textarea name="note" rows={3} placeholder="Add anything the requester should know" /></label>
        {error && <p className="ws-form-error" role="alert">{error}</p>}
        <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setMode(null)}>Cancel</button><button className="ws-btn primary" disabled={pending}>Confirm available</button></div>
      </form></Dialog>}
    {mode === "unavailable" && <Dialog title="Mark unavailable" onClose={() => setMode(null)}>
      <p>The requester will be told you can’t take this request.</p>
      {error && <p className="ws-form-error" role="alert">{error}</p>}
      <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setMode(null)}>Cancel</button><button type="button" className="ws-btn danger" disabled={pending} onClick={() => run(() => respondToRequest(itemId, "unavailable", ""))}>Mark unavailable</button></div></Dialog>}
    {mode === "clarify" && <Dialog title="Ask a question" onClose={() => setMode(null)}>
      <form onSubmit={e => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get("q") ?? ""); run(() => askClarification(itemId, q)); }}>
        <label className="ws-field"><span>Your question *</span><textarea name="q" rows={4} required minLength={5} placeholder="e.g. Can you confirm the final guest count?" /></label>
        {error && <p className="ws-form-error" role="alert">{error}</p>}
        <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setMode(null)}>Cancel</button><button className="ws-btn primary" disabled={pending}>Send question</button></div>
      </form></Dialog>}
    {(mode === "hold" || mode === "standby") && <Dialog title={mode === "hold" ? "Offer a conditional hold" : "Offer as standby"} onClose={() => setMode(null)}>
      <p>{mode === "hold" ? "This confirms you’re available and offers to hold the date. The hold starts when the requester places it, and expires automatically." : "This confirms you’re available as a backup if the primary provider can’t deliver."}</p>
      <form onSubmit={e => { e.preventDefault(); const h = String(new FormData(e.currentTarget).get("hours") ?? "48"); run(() => offerOption(itemId, mode, h)); }}>
        {mode === "hold" && <label className="ws-field"><span>Hold length</span><select name="hours" defaultValue="48"><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option></select></label>}
        {error && <p className="ws-form-error" role="alert">{error}</p>}
        <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setMode(null)}>Cancel</button><button className="ws-btn primary" disabled={pending}>{mode === "hold" ? "Offer hold" : "Offer standby"}</button></div>
      </form></Dialog>}
  </>;
}

export function HeaderActions({ itemId, saved }: { itemId: string; saved: boolean }) {
  const toast = useToast(), router = useRouter();
  const [pending, start] = useTransition();
  return <>
    <button type="button" className="ws-btn outline" onClick={async () => {
      const url = window.location.href.split("?")[0];
      try { await navigator.clipboard.writeText(url); toast("Link copied — only your team can open it"); } catch { toast(url); }
    }}><Share2 aria-hidden="true" />Share</button>
    <button type="button" className="ws-btn outline" aria-pressed={saved} disabled={pending} onClick={() => start(async () => { const r = await toggleSaved(itemId, saved); toast(r.ok ? r.message ?? "" : r.error); router.refresh(); })}>
      <Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button>
  </>;
}
