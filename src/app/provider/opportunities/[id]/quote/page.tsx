import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CalendarDays, MapPin, Wallet, Clock4, Sparkles, CircleCheck, CircleAlert, CalendarCheck } from "lucide-react";
import "@/styles/provider-quote.css";
import { Thumb } from "@/components/workspace/kit";
import { money, day, time, relative, countdown, requestTime } from "@/lib/workspace/format";
import { startOfDay } from "@/lib/provider/queries";
import { quoteContext } from "./data";
import { QuoteBuilder } from "./builder";
import { QuoteReview } from "./review";
import { labelOf } from "@/lib/master-data";

export const metadata: Metadata = { title: "Respond with quote" };
const fmtTime = (iso?: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default async function QuoteWizard(props: PageProps<"/provider/opportunities/[id]/quote">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const step = sp.step === "2" ? 2 : 1;
  const q = await quoteContext(id, typeof sp.quote === "string" ? sp.quote : undefined, typeof sp.from === "string" ? sp.from : undefined);
  // Step 2 reviews a saved draft; without one, start at step 1.
  if (step === 2 && !q.draft) redirect(`/provider/opportunities/${id}/quote?step=1`);
  const now = requestTime();
  const e = q.item.event, r = q.item.request;
  const cd = countdown(q.item.response_deadline, now);

  const top = <section className="ws-panel qw-opp">
    <Thumb src={e?.cover_image || q.item.image} w={126} h={72} />
    <div><h2>{e?.name}</h2>
      <p className="qw-meta"><span>{labelOf("event_type", e?.event_type, "Event")}</span><span>{q.guests} guests</span><span>{day(e?.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><span>{fmtTime(e?.starts_at)} – {fmtTime(e?.ends_at)}</span></p>
      <p className="qw-meta icons"><span><MapPin aria-hidden="true" />{e?.location}</span><span><Wallet aria-hidden="true" />Budget: {r?.budget_max ? `${money(r.budget_min ?? 0)} – ${money(r.budget_max)}` : "Not disclosed"}</span><span><Clock4 aria-hidden="true" />Enquiry received {relative(q.item.created_at, now)}</span></p></div>
    <Link href={`/provider/opportunities/${id}`} className="ws-btn outline">View full opportunity <ArrowRight aria-hidden="true" /></Link>
  </section>;

  const cap = q.space ? Math.max(q.space.capacity_seated ?? 0, q.space.capacity_standing ?? 0) : 0;
  const suggestions = [
    q.space && { ok: true, text: `Use ${q.space.name} (${cap} capacity)` },
    r?.budget_max && { ok: true, text: `Client budget range: ${money(r.budget_min ?? 0)} – ${money(r.budget_max)}` },
    { ok: !q.fit.hard, text: q.fit.hard ? "Calendar conflict detected — resolve before sending" : "No calendar conflicts detected" },
    ...q.fit.checks.filter(c => c.key === "capacity" || c.key === "lead_time").map(c => ({ ok: c.state === "ok", text: c.detail })),
    q.standbyFee !== null && { ok: true, text: `Standby is enabled${q.standbyFee ? ` (fee ${money(q.standbyFee)})` : ""}` },
  ].filter(Boolean) as { ok: boolean; text: string }[];
  const agent = <section className="ws-panel qw-agent">
    <h2><span className="qw-agent-icon"><Sparkles aria-hidden="true" /></span>Gala Agent <i>Online</i></h2>
    <div className="qw-agent-body"><p>{step === 1 ? "Here’s what I checked against your calendar, spaces and this request:" : "I’ve reviewed your quote against this request:"}</p>
      <ul>{suggestions.map(s => <li key={s.text}>{s.ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}{s.text}</li>)}</ul></div>
  </section>;

  const steps = ["Scope & Price", "Review & Send", "Confirmation"];
  const header = <>
    <Link href={`/provider/opportunities/${id}`} className="ws-back qw-back"><ArrowLeft aria-hidden="true" />Back to Opportunity</Link>
    <header className="qw-head"><h1>Respond with Quote</h1><p>{step === 1 ? "Build your response with scope, dates and pricing." : "Review your quote and send to the customer."}</p></header>
    <ol className="qw-steps">{steps.map((s, i) => <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}><span>{i + 1 < step ? <Check aria-hidden="true" /> : i + 1}</span>{s}</li>)}</ol>
  </>;

  if (step === 1) {
    const dayStart = e?.starts_at ? new Date(e.starts_at) : null;
    // Timeline runs 12:00 → 24:00 London time on the event day.
    const noon = dayStart ? startOfDay(0, dayStart.getTime()) + 12 * 36e5 : 0;
    const pos = (iso: string) => Math.min(100, Math.max(0, ((new Date(iso).getTime() - noon) / 36e5 / 12) * 100));
    const availability = <section className="ws-panel qw-avail"><h2>{q.listing?.kind === "venue" ? "Venue availability" : "Availability"}</h2>
      <div className="qw-avail-head"><b>{q.space?.name ?? q.listing?.name}</b>{q.fit.hard ? <span className="qw-pill red">Conflict</span> : <span className="qw-pill green"><Check aria-hidden="true" />Available</span>}</div>
      <div className="qw-avail-card"><CalendarDays aria-hidden="true" /><span><b>{day(e?.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b><small>{fmtTime(e?.starts_at)} – {fmtTime(e?.ends_at)}</small></span><em>{q.hours} hrs</em></div>
      <div className="qw-bar" aria-hidden="true"><div className="qw-scale"><span>12:00</span><span>16:00</span><span>20:00</span><span>00:00</span></div>
        <div className="qw-track"><i className="free" />
          {q.dayJobs.map(j => <i key={j.id} className="booked" style={{ left: `${pos(j.starts_at)}%`, width: `${Math.max(2, pos(j.ends_at) - pos(j.starts_at))}%` }} />)}
          {e?.starts_at && e?.ends_at && <i className="mine" style={{ left: `${pos(e.starts_at)}%`, width: `${Math.max(2, pos(e.ends_at) - pos(e.starts_at))}%` }} />}</div>
        <p className="qw-legend"><span className="free">Available</span><span className="mine">This request</span><span className="booked">Booked</span></p></div>
      <p className="sr-only">{q.dayJobs.length ? `${q.dayJobs.length} existing booking(s) on this day` : "No other bookings on this day"}</p>
    </section>;
    const words = (e?.event_type ?? "").split("_");
    const suggested = [q.space ? `space:${q.space.id}` : "", ...q.catalog.filter(c => c.kind === "package" && words.some(w => w && c.label.toLowerCase().includes(w))).map(c => c.key)].filter(Boolean);
    return <div className="qw-page">{header}
      <QuoteBuilder itemId={id} quoteId={q.draft?.id ?? null} initial={q.starting} catalog={q.catalog.map(c => ({ ...c, qty: q.qtyFor(c) }))} suggested={suggested}
        taxBps={q.taxBps} taxLabel={q.taxLabel} depositPct={q.depositPct} standbyAvailable={q.standbyFee !== null} hours={q.hours} guests={q.guests}
        event={{ date: day(e?.starts_at, { day: "numeric", month: "short", year: "numeric" }), start: fmtTime(e?.starts_at), end: fmtTime(e?.ends_at) }}
        hard={q.fit.hard} hardReason={q.fit.checks.find(c => c.state === "fail")?.detail ?? ""}
        terms={(q.draft ?? q.source)?.terms ?? {}} message={(q.draft ?? q.source)?.message ?? ""} top={top} rail={<>{agent}{availability}</>} />
    </div>;
  }

  const d = q.draft!;
  const extras = d.items.filter(i => ["travel", "setup", "other"].includes(i.kind));
  const main = d.items.filter(i => !["travel", "setup", "other"].includes(i.kind));
  const sub = main.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const deposit = Math.round(Number(d.total) * d.deposit_pct) / 100;
  const balanceDays = 14;
  const summary = <div className="qw-summary">
    <section className="ws-panel qw-items"><h2>Quote summary</h2><p className="qb-sub">Here’s a summary of what you’re offering. You can go back to make changes.</p>
      <ul>{main.map((i, n) => <li key={n}>{i.image ? <Thumb src={i.image} w={48} h={36} /> : <span className="qb-noimg" />}
        <span><b>{i.label}</b><small>{i.detail || i.unit}</small></span><em>{i.qty}</em><strong>{money(i.qty * i.unit_price)}</strong></li>)}</ul></section>
    <section className="ws-panel qw-totals"><Link href={`/provider/opportunities/${id}/quote?step=1&quote=${d.id}`} className="ws-btn soft sm">Edit quote</Link>
      <dl>{main.map((i, n) => <div key={n}><dt>{i.label}{i.qty > 1 ? ` (${i.qty})` : ""}</dt><dd>{money(i.qty * i.unit_price)}</dd></div>)}
        <div className="sub"><dt>Subtotal</dt><dd>{money(sub)}</dd></div>
        {extras.map((i, n) => <div key={`x${n}`}><dt>{i.label}</dt><dd>{money(i.qty * i.unit_price)}</dd></div>)}
        {Number(d.tax) > 0 && <div><dt>{q.taxLabel}</dt><dd>{money(d.tax, "GBP", { cents: true })}</dd></div>}
        <div className="total"><dt>Total price (GBP)</dt><dd>{money(d.total, "GBP", { cents: Number(d.total) % 1 !== 0 })}</dd></div>
        <div><dt>Deposit ({d.deposit_pct}%)</dt><dd>{money(deposit)}</dd></div>
        <div className="muted"><dt>Remaining balance due {balanceDays} days before the event</dt><dd>{money(Number(d.total) - deposit)}</dd></div></dl></section>
  </div>;
  const answered = q.item.status !== "sent" && q.item.status !== "awaiting";
  const responseState = <section className="ws-panel qw-state"><h2>Response state</h2>
    <div className="qw-state-row"><CalendarCheck aria-hidden="true" /><span><b>Respond before deadline</b><small>Customer expects a response within {r?.response_hours ?? "—"} hours</small></span>
      {!cd.overdue && !answered && <em><b>{cd.label}</b>remaining</em>}</div>
    <ol className="qw-mini-steps"><li className="on"><i />Received<small>{time(q.item.created_at)}</small></li><li className={answered ? "on" : "now"}><i />Responded</li><li><i />Customer review</li><li><i />Accepted / Declined</li></ol>
  </section>;
  const firstName = (e?.client_name ?? "").split(" ")[0];
  const inclusionsDefault = [...main.map(i => i.label), ...extras.map(i => i.label)];
  return <div className="qw-page">{header}
    <QuoteReview itemId={id} quoteId={d.id} lines={d.items as never} depositPct={d.deposit_pct} terms={d.terms} message={d.message} validDays={Number(d.terms.valid_days ?? 14)}
      defaults={{ inclusions: inclusionsDefault, exclusions: ["Food and drinks unless listed", "Additional decor and styling", "Extended hours beyond the booked time", "Parking costs for guests"], cancellation: q.cancellation, holdHours: q.holdHours, standbyAvailable: q.standbyFee !== null }}
      clientFirst={firstName} eventName={e?.name ?? "your event"} workspace={q.ctx.workspace.name} hard={q.fit.hard} hardReason={q.fit.checks.find(c => c.state === "fail")?.detail ?? ""}
      top={<>{top}{summary}</>} rail={<>{agent}{responseState}</>} />
  </div>;
}
