"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import * as A from "@/lib/marketplace/actions";
import type { ActionResult, CancellationQuote } from "@/lib/marketplace/actions";
import { bookingAdminFee, gbpPence, BOOKING_ADMIN_FEE } from "@/lib/fees";

const gbp = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n));

/** Live response countdown (§34). Ticks every 30s; tone escalates as the deadline nears. */
export function Countdown({ deadline, sentAt, status, serverNow }: { deadline: string | null; sentAt: string | null; status: string | null; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (status === "responded") return <span className="mk-count ok"><Clock size={13} aria-hidden="true" />Responded</span>;
  if (status === "expired") return <span className="mk-count off"><Clock size={13} aria-hidden="true" />No response — expired</span>;
  if (!deadline) return null;
  const left = Date.parse(deadline) - now, total = sentAt ? Date.parse(deadline) - Date.parse(sentAt) : 864e5;
  if (left <= 0) return <span className="mk-count off" role="status"><Clock size={13} aria-hidden="true" />Deadline passed</span>;
  const h = Math.floor(left / 36e5), m = Math.floor((left % 36e5) / 6e4);
  const tone = left < Math.min(36e5, total / 4) ? "urgent" : left < total / 2 ? "warn" : "ok";
  return <span className={`mk-count ${tone}`} role="timer" aria-live="off"><Clock size={13} aria-hidden="true" />{h >= 48 ? `${Math.floor(h / 24)} days` : h ? `${h}h ${m}m` : `${m}m`} left to respond</span>;
}

/** Runs a server action, shows its error, refreshes on success. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: (r: ActionResult<unknown>) => void) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) setError(r.error); else { after?.(r); router.refresh(); }
  });
  return { pending, error, run };
}
const Err = ({ e }: { e: string }) => e ? <p className="mk-error" role="alert">{e}</p> : null;
const Btn = ({ children, pending, tone = "primary", ...p }: { children: ReactNode; pending?: boolean; tone?: "primary" | "ghost" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button className={`mk-btn ${tone}`} disabled={pending || p.disabled} {...p}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}{children}</button>;

/** One-click action with optional reason prompt (inline, no browser dialogs). */
export function ActButton({ label, action, args, tone = "ghost", reason, confirm }: {
  label: string; action: "releaseHold" | "acceptStandby" | "activateStandby" | "releaseStandby" | "declineStandby" | "acceptDisputeResolution" | "acceptCancellation" | "rejectCancellation";
  args: string; tone?: "primary" | "ghost" | "danger"; reason?: string; confirm?: string;
}) {
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const go = () => run(() => {
    switch (action) {
      case "releaseHold": return A.releaseHold(args, text);
      case "acceptStandby": return A.acceptStandby(args);
      case "activateStandby": return A.activateStandby(args, text);
      case "releaseStandby": return A.releaseStandby(args);
      case "declineStandby": return A.declineStandby(args, text);
      case "acceptDisputeResolution": return A.acceptDisputeResolution(args);
      case "acceptCancellation": return A.decideCancellation(args, true, text);
      case "rejectCancellation": return A.decideCancellation(args, false, text);
    }
  }, () => setOpen(false));
  if (!reason && !confirm) return <><Btn tone={tone} pending={pending} onClick={go} type="button">{label}</Btn><Err e={error} /></>;
  if (!open) return <Btn tone={tone} type="button" onClick={() => setOpen(true)}>{label}</Btn>;
  return <div className="mk-inline" role="group" aria-label={label}>
    {confirm && <p className="mk-note">{confirm}</p>}
    {reason && <label className="mk-field"><span>{reason}</span><input value={text} onChange={e => setText(e.target.value)} maxLength={500} autoFocus /></label>}
    <div className="mk-row"><Btn tone="ghost" type="button" onClick={() => setOpen(false)}>Back</Btn><Btn tone={tone === "ghost" ? "primary" : tone} pending={pending} type="button" onClick={go} disabled={!!reason && text.trim().length < 3}>{label}</Btn></div>
    <Err e={error} />
  </div>;
}

/** Organizer: ask the provider to hold capacity, optionally dependent on another booking (§35). */
export function HoldRequestForm({ itemId, siblings }: { itemId: string; siblings: { id: string; title: string }[] }) {
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  if (!open) return <Btn tone="ghost" type="button" onClick={() => setOpen(true)}>Request a hold</Btn>;
  return <form className="mk-form" action={f => run(() => A.requestHold(itemId, Number(f.get("hours")), String(f.get("depends") || "") || null, String(f.get("conditions") ?? "")))}>
    <label className="mk-field"><span>Hold for</span><select name="hours" defaultValue="72">{[[24, "24 hours"], [48, "48 hours"], [72, "3 days"], [168, "7 days"], [336, "14 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="mk-field"><span>Depends on (optional)</span><select name="depends" defaultValue=""><option value="">Nothing — hold outright</option>{siblings.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <label className="mk-field wide"><span>Conditions</span><input name="conditions" maxLength={1000} placeholder="e.g. Only if the venue confirms by Friday" /></label>
    <p className="mk-note wide">A hold reserves the provider’s date. It isn’t a card authorisation, and nothing is charged until you confirm.</p>
    <div className="mk-row wide"><Btn tone="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Btn><Btn pending={pending}>Send hold request</Btn></div>
    <Err e={error} />
  </form>;
}

/** Provider: accept (optionally shorter) or decline a hold request. */
export function HoldRespondForm({ holdId, requestedHours }: { holdId: string; requestedHours: number }) {
  const { pending, error, run } = useAct();
  const [mode, setMode] = useState<"" | "accept" | "decline">("");
  if (!mode) return <div className="mk-row"><Btn type="button" onClick={() => setMode("accept")}>Hold the date</Btn><Btn tone="ghost" type="button" onClick={() => setMode("decline")}>Can’t hold</Btn></div>;
  return <form className="mk-form" action={f => run(() => A.respondHold(holdId, mode === "accept", mode === "accept" ? Number(f.get("hours")) : null, String(f.get("note") ?? "")))}>
    {mode === "accept" && <label className="mk-field"><span>Hold for (max {requestedHours}h)</span><input name="hours" type="number" min={2} max={requestedHours} defaultValue={requestedHours} required /></label>}
    <label className="mk-field wide"><span>Note to organiser</span><input name="note" maxLength={1000} placeholder={mode === "accept" ? "Optional" : "Optional — your quote still stands"} /></label>
    <div className="mk-row wide"><Btn tone="ghost" type="button" onClick={() => setMode("")}>Back</Btn><Btn pending={pending} tone={mode === "accept" ? "primary" : "danger"}>{mode === "accept" ? "Confirm hold" : "Decline hold"}</Btn></div>
    <Err e={error} />
  </form>;
}

/** Organizer: ask a provider to be on paid standby for a primary booking (§36). */
export function StandbyRequestForm({ itemId, siblings, eventStart }: { itemId: string; siblings: { id: string; title: string }[]; eventStart: string | null }) {
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  const local = (iso: string | null, offsetH: number) => iso ? new Date(Date.parse(iso) + offsetH * 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
  if (!open) return <Btn tone="ghost" type="button" onClick={() => setOpen(true)}>Request paid standby</Btn>;
  return <form className="mk-form" action={f => run(() => A.requestStandby(itemId, String(f.get("primary") || "") || null, String(f.get("start")), String(f.get("end")), String(f.get("note") ?? "")))}>
    <label className="mk-field wide"><span>Cover for</span><select name="primary" defaultValue=""><option value="">No specific booking</option>{siblings.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <label className="mk-field"><span>Window starts</span><input name="start" type="datetime-local" required defaultValue={local(eventStart, -48)} /></label>
    <label className="mk-field"><span>Window ends</span><input name="end" type="datetime-local" required defaultValue={local(eventStart, 12)} /></label>
    <label className="mk-field wide"><span>Note</span><input name="note" maxLength={1000} placeholder="What cover you need" /></label>
    <p className="mk-note wide">The provider sets a standby fee and an activation price. Nothing is binding until you accept their offer.</p>
    <div className="mk-row wide"><Btn tone="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Btn><Btn pending={pending}>Send standby request</Btn></div>
    <Err e={error} />
  </form>;
}

/** Provider: price a standby request. */
export function StandbyOfferForm({ standbyId }: { standbyId: string }) {
  const { pending, error, run } = useAct();
  return <form className="mk-form" action={f => run(() => A.offerStandby(standbyId, Number(f.get("fee")), Number(f.get("activation")), Number(f.get("valid")), String(f.get("terms") ?? "")))}>
    <label className="mk-field"><span>Standby fee (£)</span><input name="fee" type="number" min={0} step="0.01" required inputMode="decimal" /></label>
    <label className="mk-field"><span>Activation price (£)</span><input name="activation" type="number" min={1} step="0.01" required inputMode="decimal" /></label>
    <label className="mk-field"><span>Offer valid for</span><select name="valid" defaultValue="48">{[[24, "24 hours"], [48, "48 hours"], [72, "3 days"], [168, "7 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="mk-field wide"><span>Standby terms</span><textarea name="terms" rows={3} minLength={10} maxLength={2000} required placeholder="e.g. Standby fee is non-refundable once accepted. Activation within the window confirms the booking at the activation price." /></label>
    <div className="mk-row wide"><ActButton label="Decline" action="declineStandby" args={standbyId} reason="Reason (optional, shared with the organiser)" /><Btn pending={pending}>Send offer</Btn></div>
    <Err e={error} />
  </form>;
}

/** Cancellation with a live, policy-driven preview before anything is committed (§45). */
export function CancelForm({ itemId, party }: { itemId: string; party: "customer" | "provider" }) {
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("full");
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [qErr, setQErr] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    A.quoteCancellation(itemId, party, kind).then(r => { if (!live) return; if (r.ok) { setQuote(r.data ?? null); setQErr(""); } else setQErr(r.error); });
    return () => { live = false; };
  }, [open, kind, itemId, party]);
  if (!open) return <Btn tone="danger" type="button" onClick={() => setOpen(true)}>{party === "provider" ? "Cancel this booking" : "Cancel or reschedule"}</Btn>;
  return <form className="mk-form" action={() => run(() => A.requestCancellation(itemId, party, kind, reason), () => setOpen(false))}>
    <fieldset className="mk-field wide mk-seg"><legend>What do you need?</legend>
      {[["full", "Cancel"], ["reschedule", "Reschedule"], ["partial", "Reduce scope"], ["force_majeure", "Force majeure"]].map(([v, l]) =>
        <label key={v}><input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} />{l}</label>)}
    </fieldset>
    <div className="mk-quote wide" aria-live="polite">
      {qErr ? <p className="mk-error">{qErr}</p> : !quote ? <p className="mk-note"><Loader2 size={13} className="mk-spin" aria-hidden="true" /> Calculating…</p> : <>
        <dl>
          <div><dt>Paid so far</dt><dd>{gbp(quote.paid)}</dd></div>
          <div><dt>Refund</dt><dd>{quote.refund_amount == null ? "Decided on review" : `${gbp(quote.refund_amount)}${quote.refund_pct != null ? ` (${quote.refund_pct}%)` : ""}`}</dd></div>
          <div><dt>Provider keeps</dt><dd>{quote.provider_retains == null ? "Decided on review" : gbp(quote.provider_retains)}</dd></div>
        </dl>
        {quote.notes.map(n => <p key={n} className="mk-note">{n}</p>)}
        {party === "provider" && kind === "full" && <p className="mk-note warn">Cancelling affects your reliability score, and the organiser will be offered standby or emergency cover.</p>}
      </>}
    </div>
    <label className="mk-field wide"><span>Reason</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={2000} required /></label>
    <div className="mk-row wide"><Btn tone="ghost" type="button" onClick={() => setOpen(false)}>Back</Btn><Btn tone="danger" pending={pending} disabled={!quote || reason.trim().length < 5}>{kind === "full" && !quote?.requires_review ? "Confirm cancellation" : "Send request"}</Btn></div>
    <Err e={error} />
  </form>;
}

/** Open a Gala Dock booking dispute (§44). Card chargebacks are handled separately through Stripe. */
export function DisputeOpenForm({ itemId, reasons, base }: { itemId: string; reasons: [string, string][]; base: string }) {
  const router = useRouter();
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  if (!open) return <Btn tone="ghost" type="button" onClick={() => setOpen(true)}>Report a problem</Btn>;
  return <form className="mk-form" action={f => run(() => A.openDispute(itemId, String(f.get("reason")), String(f.get("summary") ?? ""), Number(f.get("amount")) || null), r => { if (r.ok && r.data) router.push(`${base}/${r.data}`); })}>
    <label className="mk-field"><span>What went wrong?</span><select name="reason" required defaultValue="">{[["", "Choose…"], ...reasons].map(([v, l]) => <option key={v} value={v} disabled={!v}>{l}</option>)}</select></label>
    <label className="mk-field"><span>Amount in question (£, optional)</span><input name="amount" type="number" min={0} step="0.01" inputMode="decimal" /></label>
    <label className="mk-field wide"><span>Describe what happened</span><textarea name="summary" rows={3} minLength={10} maxLength={4000} required /></label>
    <p className="mk-note wide">Both sides can add evidence. If you can’t agree, Gala Dock reviews the booking terms, messages and payment history and proposes a resolution.</p>
    <div className="mk-row wide"><Btn tone="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Btn><Btn pending={pending}>Open dispute</Btn></div>
    <Err e={error} />
  </form>;
}

/** Starts an orchestrated payment (payment order → Stripe Checkout). Money is only marked paid when Stripe confirms. */
/** `amount` (pounds, before the admin fee) lets the button show the exact booking admin fee; otherwise the rate is shown. */
export function PayButton({ kind, itemId, standbyId, label, returnPath, note, amount }: { kind: "deposit" | "balance_payment" | "standby_fee" | "emergency_service"; itemId?: string; standbyId?: string; label: string; returnPath: string; note?: string; amount?: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const go = () => start(async () => {
    setError("");
    const r = await A.payBooking(kind, { itemId, standbyId }, returnPath);
    if (!r.ok) setError(r.error); else if (r.data) window.location.assign(r.data);
  });
  const fee = amount != null ? bookingAdminFee(amount) : null;
  return <div className="mk-pay">{note && <p className="mk-note">{note}</p>}
    <p className="mk-note">{fee != null ? `Plus a ${gbpPence(fee)} Gala Dock booking admin fee (${BOOKING_ADMIN_FEE.pct}%, min £${BOOKING_ADMIN_FEE.minimum}): ${gbpPence((amount ?? 0) + fee)} in total.` : `Plus a Gala Dock booking admin fee of ${BOOKING_ADMIN_FEE.pct}% (min £${BOOKING_ADMIN_FEE.minimum}), shown before you pay.`}</p><Btn tone="primary" type="button" pending={pending} onClick={go}>{label}</Btn><Err e={error} /></div>;
}
