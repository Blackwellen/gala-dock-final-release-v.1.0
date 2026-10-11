"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CircleCheck, CircleMinus, FileText, CalendarDays, ShieldCheck, ArrowLeft, Save, Send, Plus, X, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { saveQuoteDraft, sendQuote, type QuotePayload } from "./actions";
import type { Line } from "./data";

type Tier = { window: string; refund: number };

function EditableList({ title, sub, icon: Icon, tone, items, setItems }: { title: string; sub: string; icon: typeof CircleCheck; tone: "green" | "red"; items: string[]; setItems: (v: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  return <section className="ws-panel qr-list">
    <h3><Icon aria-hidden="true" className={tone} /><span><b>{title}</b><small>{sub}</small></span></h3>
    <ul>{items.map((t, i) => <li key={i}>{tone === "green" ? <CircleCheck aria-hidden="true" className="green" /> : <X aria-hidden="true" className="red" />}
      {editing ? <><input aria-label={`${title} ${i + 1}`} value={t} onChange={e => setItems(items.map((x, j) => j === i ? e.target.value : x))} />
        <button type="button" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}><X aria-hidden="true" /></button></> : <span>{t}</span>}</li>)}</ul>
    {editing && <button type="button" className="qr-addline" onClick={() => setItems([...items, ""])}><Plus aria-hidden="true" />Add line</button>}
    <button type="button" className="ws-btn outline sm" onClick={() => { setItems(items.filter(x => x.trim())); setEditing(!editing); }}>{editing ? "Done" : `Edit ${title.toLowerCase()}`}</button>
  </section>;
}

export function QuoteReview(props: {
  itemId: string; quoteId: string; lines: Line[]; depositPct: number; terms: Record<string, unknown>; message: string; validDays: number;
  defaults: { inclusions: string[]; exclusions: string[]; cancellation: Tier[]; holdHours: number; standbyAvailable: boolean }; clientFirst: string; eventName: string; workspace: string;
  hard: boolean; hardReason: string; top: ReactNode; rail: ReactNode;
}) {
  const router = useRouter(), toast = useToast();
  const [inclusions, setInclusions] = useState<string[]>((props.terms.inclusions as string[]) ?? props.defaults.inclusions);
  const [exclusions, setExclusions] = useState<string[]>((props.terms.exclusions as string[]) ?? props.defaults.exclusions);
  const [tiers, setTiers] = useState<Tier[]>((props.terms.cancellation as Tier[]) ?? props.defaults.cancellation);
  const [editPolicy, setEditPolicy] = useState(false);
  const [validDays, setValidDays] = useState(props.validDays);
  const [hold, setHold] = useState(Boolean(props.terms.hold_offer ?? props.defaults.holdHours > 0));
  const [holdHours, setHoldHours] = useState(Number(props.terms.hold_hours ?? (props.defaults.holdHours || 24)));
  const template = `Hi ${props.clientFirst || "there"},\n\nThanks for your enquiry. Please find our detailed quote for ${props.eventName}. We’d love to host you and are confident we can deliver an amazing event.\n\nLet me know if you have any questions or would like to make changes.\n\n${props.workspace}`;
  const [message, setMessage] = useState(props.message || template);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const payload = (): QuotePayload => ({ items: props.lines, depositPct: props.depositPct, validDays, message,
    terms: { ...props.terms, inclusions: inclusions.filter(x => x.trim()), exclusions: exclusions.filter(x => x.trim()), cancellation: tiers, hold_offer: hold, hold_hours: hold ? holdHours : null, valid_days: validDays } });
  const run = (send: boolean) => start(async () => {
    setError("");
    if (message.trim().length < 10) { setError("Write a short message to the customer."); return; }
    const r = send ? await sendQuote(props.itemId, props.quoteId, payload()) : await saveQuoteDraft(props.itemId, props.quoteId, payload());
    if (!r.ok) { setError(r.error); return; }
    toast(r.message ?? "Draft saved");
    if (r.redirect && send) router.push(r.redirect); else router.refresh();
  });

  return <><div className="qw"><div className="qw-main">{props.top}<div className="qr">
    <div className="qr-three">
      <EditableList title="Inclusions" sub="What’s included in this quote." icon={CircleCheck} tone="green" items={inclusions} setItems={setInclusions} />
      <EditableList title="Exclusions" sub="What’s not included." icon={CircleMinus} tone="red" items={exclusions} setItems={setExclusions} />
      <section className="ws-panel qr-list">
        <h3><FileText aria-hidden="true" className="blue" /><span><b>Cancellation policy</b><small>Customer-facing cancellation terms.</small></span></h3>
        <table className="qr-policy"><tbody>{tiers.map((t, i) => <tr key={i}>
          <td>{editPolicy ? <input aria-label="Notice window" value={t.window} onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, window: e.target.value } : x))} /> : t.window}</td>
          <td>{editPolicy ? <><input type="number" min={0} max={100} aria-label="Refund percent" value={t.refund} onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, refund: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x))} />%</> : t.refund ? `${t.refund}% refund` : "No refund"}</td>
        </tr>)}</tbody></table>
        <button type="button" className="ws-btn outline sm" onClick={() => setEditPolicy(!editPolicy)}>{editPolicy ? "Done" : "Edit policy"}</button>
      </section>
    </div>
    <div className="qr-three">
      <section className="ws-panel qr-opt"><CalendarDays aria-hidden="true" className="blue" /><div><b>Validity &amp; terms</b><small>How long this quote is valid for.</small>
        <label>Quote valid for <input type="number" min={1} max={90} value={validDays} onChange={e => setValidDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))} /> days</label></div></section>
      <section className="ws-panel qr-opt"><ShieldCheck aria-hidden="true" className="blue" /><div><b>Hold / standby option</b><small>Offer to hold availability while the customer reviews.</small>
        <label className="qr-switch"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} disabled={props.hard} /><i />Offer a conditional hold
          <select aria-label="Hold length" value={holdHours} onChange={e => setHoldHours(Number(e.target.value))} disabled={!hold}><option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option></select></label>
        <small>The hold starts when the customer places it, and converts to a booking on acceptance.</small></div></section>
    </div>
    {props.hard && <p className="qb-error" role="alert">Hard conflict: {props.hardReason}. Resolve it before sending.</p>}
    {error && <p className="qb-error" role="alert">{error}</p>}
  </div></div>
    <aside className="qw-rail">{props.rail}
      <section className="ws-panel qr-message"><b>Message to customer *</b>
        <div className="qr-msg-tools"><button type="button" className="ws-btn outline sm" onClick={() => setMessage(template)}>Use template</button>
          <Link className="ws-btn outline sm" href={`/provider/agent?goal=${encodeURIComponent(`Draft a quote message for ${props.eventName}`)}`}><Wand2 aria-hidden="true" />Draft with Gala Agent</Link></div>
        <textarea aria-label="Message to customer" rows={7} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} /><small>{message.length}/1000</small></section>
    </aside></div>
    <footer className="qb-foot">
      <Link className="ws-btn outline" href={`/provider/opportunities/${props.itemId}/quote?step=1&quote=${props.quoteId}`}><ArrowLeft aria-hidden="true" />Back</Link>
      <span className="ws-spacer" />
      <button type="button" className="ws-btn outline" disabled={pending} onClick={() => run(false)}><Save aria-hidden="true" />Save as draft</button>
      <button type="button" className="ws-btn primary" disabled={pending || props.hard} onClick={() => run(true)}><Send aria-hidden="true" />Send quote to customer</button>
    </footer></>;
}
