"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Minus, Plus, Lock, ShieldCheck, Clock3, Ticket, Armchair, CircleAlert, CreditCard, RefreshCw, Check, Repeat, Gift } from "lucide-react";
import { SeatPicker } from "@/components/venue-plan/seat-picker";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";
import type { Summary } from "@/lib/checkout";
import { reserve, reserveResale, releaseHold, claimOffer } from "./actions";
import { WaitingRoom } from "./waiting-room";

type Tier = { id: string; name: string; description: string; price: number; remaining: number; limit: number; seated: boolean; color: string; onSale: boolean; note: string | null; badge: string | null };
type Seat = { key: string; tier_id: string | null; accessible: boolean; status: "available" | "held" | "sold" | "blocked" };
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const when = (s: string | null, e: string | null) => { if (!s) return "Date to be announced"; const d = new Date(s), f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { timeZone: "Europe/London", ...o });
  return `${f({ weekday: "short", day: "numeric", month: "long", year: "numeric" })} · ${f({ hour: "2-digit", minute: "2-digit" })}${e ? ` – ${new Date(e).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}` : ""}`; };

export function CheckoutClient({ event, tiers, seats, overlay, base, fee, user, preset, existing, cancelled, resale, startResale, launch, offerId }: {
  event: { id: string; name: string; slug: string; startsAt: string | null; endsAt: string | null; venue: string; city: string; cover: string };
  tiers: Tier[]; seats: Seat[]; overlay: MapEl[]; base: MapEl[]; fee: { fixed: number; pct_bps: number }; user: { email: string } | null;
  preset: { tier: string; qty: number } | null; existing: Summary | null; cancelled: boolean;
  resale: { id: string; tier: string; tier_id: string; seat: string | null; price: number }[]; startResale: boolean;
  /** event_launch_state (§50) */ launch: string; /** ?waitlist_offer= from the waitlist notification (§52) */ offerId: string | null;
}) {
  const [mode, setMode] = useState<"new" | "resale">(startResale && resale.length ? "resale" : "new");
  const [rsel, setRsel] = useState<string[]>([]);
  const ga = tiers.filter(t => !t.seated), seated = tiers.filter(t => t.seated), hasMap = seats.length > 0 && overlay.length > 0;
  const [qty, setQty] = useState<Record<string, number>>(() => {
    if (existing) return Object.fromEntries(existing.lines.filter(l => !l.seats.length).map(l => [l.tier_id, l.qty]));
    const t = preset && ga.find(x => x.id === preset.tier && x.onSale); return t ? { [t.id]: Math.min(preset!.qty, t.limit, t.remaining) } : {};
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(existing);
  const [step, setStep] = useState<1 | 2>(existing ? 2 : 1);
  const [err, setErr] = useState<string | null>(cancelled ? "Payment was cancelled — your tickets are still reserved for a few minutes." : null);
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { if (step !== 2) return; const tick = () => setNow(Date.now()); const t = setInterval(tick, 1000); const f = setTimeout(tick, 0); return () => { clearInterval(t); clearTimeout(f); }; }, [step]);
  const left = summary?.expiresAt ? (now === null ? 10 * 60_000 : Math.max(0, new Date(summary.expiresAt).getTime() - now)) : 0;
  const expired = step === 2 && !!summary && left === 0;
  const tierById = useMemo(() => new Map(tiers.map(t => [t.id, t])), [tiers]);
  const seatTier = useMemo(() => new Map(seats.map(s => [s.key, s.tier_id])), [seats]);
  // Estimate before reserving; the server-priced summary replaces it after.
  const est = useMemo(() => {
    const lines = [...Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ t: tierById.get(id)!, q })),
      ...[...picked.reduce((m, k) => { const id = seatTier.get(k); if (id) m.set(id, (m.get(id) ?? 0) + 1); return m; }, new Map<string, number>())].map(([id, q]) => ({ t: tierById.get(id)!, q }))].filter(l => l.t);
    if (mode === "resale") { const rl = resale.filter(r => rsel.includes(r.id)); const sub = rl.reduce((a, r) => a + r.price, 0), f = rl.reduce((a, r) => a + (r.price > 0 ? fee.fixed + (r.price * fee.pct_bps) / 10000 : 0), 0);
      return { lines: rl.map(r => ({ t: { ...tierById.get(r.tier_id)!, name: `${r.tier} (resale)`, price: r.price }, q: 1 })).filter(l => l.t.id), sub, fee: Math.round(f * 100) / 100, total: Math.round((sub + f) * 100) / 100, count: rl.length }; }
    const sub = lines.reduce((a, l) => a + l.t.price * l.q, 0), f = lines.reduce((a, l) => a + (l.t.price > 0 ? l.q * (fee.fixed + (l.t.price * fee.pct_bps) / 10000) : 0), 0);
    return { lines, sub, fee: Math.round(f * 100) / 100, total: Math.round((sub + f) * 100) / 100, count: lines.reduce((a, l) => a + l.q, 0) };
  }, [qty, picked, tierById, seatTier, fee, mode, resale, rsel]);
  const go = () => start(async () => {
    setErr(null);
    const r = mode === "resale" ? await reserveResale(event.id, rsel) : await reserve(event.id, Object.entries(qty).filter(([, q]) => q > 0).map(([tier, q]) => ({ tier, qty: q })), picked);
    if (!r.ok) { if ("login" in r && r.login) { router.push(`/login?next=${encodeURIComponent(`/checkout/${event.slug}?resale=1`)}`); return; } setErr(r.error); return; }
    setSummary(r.summary); setStep(2); setNow(null);
  });
  const pay = async () => {
    setErr(null); setPaying(true);
    const res = await fetch("/api/checkout/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: event.id }) });
    const j = await res.json().catch(() => ({})) as { url?: string; error?: string; login?: boolean; expired?: boolean; queue?: boolean };
    if (j.url) { window.location.assign(j.url); return; }
    setPaying(false);
    if (j.login) { router.push(`/login?next=${encodeURIComponent(`/checkout/${event.slug}`)}`); return; }
    if (j.expired || j.queue) { setStep(1); setSummary(null); }
    setErr(j.error ?? "Something went wrong. Please try again.");
  };
  const change = () => start(async () => { await releaseHold(event.id); setSummary(null); setStep(1); });
  const [inQueue, setInQueue] = useState(false);
  const buyable = ["presale", "on_sale", "final_release", "low_availability"].includes(launch);
  const LAUNCH_MSG: Record<string, string> = { coming_soon: "Tickets aren’t on sale yet.", countdown: "Tickets go on sale soon.", sold_out: "This event is sold out.", waitlist: "This event is sold out. Join the waitlist on the event page and we’ll hold tickets for you if any come back.",
    postponed: "This event has been postponed. Ticket sales are paused.", cancelled: "This event has been cancelled.", ended: "This event has ended.", draft: "Tickets aren’t available." };
  const useOffer = () => start(async () => { setErr(null); const r = await claimOffer(event.id, offerId!);
    if (!r.ok) { if ("login" in r && r.login) { router.push(`/login?next=${encodeURIComponent(`/checkout/${event.slug}?waitlist_offer=${offerId}`)}`); return; } setErr(r.error); return; }
    setSummary(r.summary); setStep(2); setNow(null); });
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  const shown = step === 2 && summary ? { lines: summary.lines.map(l => ({ name: l.name, q: l.qty, unit: l.unit, seats: l.seats, color: tierById.get(l.tier_id)?.color })), sub: summary.subtotal, fee: summary.fee, total: summary.total }
    : { lines: est.lines.map(l => ({ name: l.t.name, q: l.q, unit: l.t.price, seats: [] as string[], color: l.t.color })), sub: est.sub, fee: est.fee, total: est.total };

  return <div className="co">
    <header className="co-top"><Link href="/" className="co-logo" aria-label="Gala Dock home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/gala-dock-logo.png" alt="Gala Dock" /></Link>
      <ol className="co-steps"><li className={step === 1 ? "on" : "done"}><span>{step > 1 ? <Check aria-hidden="true" /> : 1}</span>Tickets</li><li className={step === 2 ? "on" : ""}><span>2</span>Review</li><li><span>3</span>Payment</li></ol>
      <span className="co-secure"><Lock aria-hidden="true" />Secure checkout</span></header>
    <div className="co-body">
      <main className="co-main">
        <Link href={`/events/${event.slug}`} className="co-back"><ArrowLeft aria-hidden="true" />Back to event</Link>
        <section className="co-event">{/* eslint-disable-next-line @next/next/no-img-element */}
          {event.cover ? <img src={event.cover} alt="" /> : <span className="co-noimg" />}
          <div><h1>{event.name}</h1><p><CalendarDays aria-hidden="true" />{when(event.startsAt, event.endsAt)}</p><p><MapPin aria-hidden="true" />{[event.venue, event.city].filter(Boolean).join(", ")}</p></div></section>
        {err && <p className="co-err" role="alert"><CircleAlert aria-hidden="true" />{err}</p>}

        {step === 1 && offerId && <section className="co-card co-offer"><div className="co-h"><h2><Gift aria-hidden="true" />Tickets reserved for you</h2></div>
          <p>Tickets came back for an event you were waiting for, and we’re holding them for you for a limited time.</p>
          <button type="button" className="co-cta" disabled={pending} onClick={useOffer}>{pending ? "Getting your tickets…" : "Use my reserved tickets"}</button></section>}
        {step === 1 && !offerId && !buyable && <p className="co-err" role="status"><CircleAlert aria-hidden="true" />{LAUNCH_MSG[launch] ?? "Tickets aren’t available right now."}{launch === "waitlist" && <> <Link className="co-link" href={`/events/${event.slug}`}>Go to event</Link></>}</p>}
        {step === 1 && !offerId && (buyable || launch === "countdown") && <WaitingRoom eventId={event.id} onWaiting={setInQueue} />}
        {step === 1 && resale.length > 0 && <nav className="co-mode" aria-label="Ticket source"><button type="button" className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}><Ticket aria-hidden="true" />New tickets</button>
          <button type="button" className={mode === "resale" ? "on" : ""} onClick={() => setMode("resale")}><Repeat aria-hidden="true" />Fan resale <em>{resale.length}</em></button></nav>}
        {step === 1 && mode === "resale" && <section className="co-card"><div className="co-h"><h2><Repeat aria-hidden="true" />Fan-to-fan resale</h2><small>Face value or less · fresh ticket issued to you</small></div>
          <ul className="co-tiers co-resale">{resale.map(r => { const on = rsel.includes(r.id), t = tierById.get(r.tier_id); return <li key={r.id} className={on ? "sel" : ""}><i style={{ background: t?.color }} /><div><b>{r.tier}</b><small>{r.seat ?? "General admission"}</small></div><strong>{gbp(r.price)}</strong>
            <button type="button" className={`co-pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => setRsel(v => on ? v.filter(x => x !== r.id) : v.length >= 10 ? v : [...v, r.id])}>{on ? <><Check aria-hidden="true" />Selected</> : "Select"}</button></li>; })}</ul></section>}
        {step === 1 && mode === "new" && <>
          {hasMap && <section className="co-card"><div className="co-h"><h2><Armchair aria-hidden="true" />Choose your seats</h2><small>Tap seats to select · up to 10 per order</small></div>
            <SeatPicker elements={overlay} base={base} seats={seats} tiers={seated.map(t => ({ id: t.id, name: t.name, price: t.price, color: t.color }))} max={10} selected={picked} onChange={setPicked} height={480} /></section>}
          {ga.length > 0 && <section className="co-card"><div className="co-h"><h2><Ticket aria-hidden="true" />{hasMap ? "Standing & general admission" : "Choose your tickets"}</h2></div>
            <ul className="co-tiers">{ga.map(t => { const q = qty[t.id] ?? 0, max = Math.min(t.limit, t.remaining); return <li key={t.id} className={!t.onSale || !t.remaining ? "off" : ""}>
              <i style={{ background: t.color }} /><div><b>{t.name}{t.badge && <em>{t.badge}</em>}</b>{t.description && <small>{t.description}</small>}
                <small className="co-left">{!t.onSale ? t.note : t.remaining === 0 ? "Sold out" : t.remaining <= 20 ? `Only ${t.remaining} left` : `${t.remaining.toLocaleString("en-GB")} available`}</small></div>
              <strong>{t.price ? gbp(t.price) : "Free"}</strong>
              <span className="co-qty"><button type="button" aria-label={`Fewer ${t.name}`} disabled={q === 0} onClick={() => setQty(s => ({ ...s, [t.id]: Math.max(0, q - 1) }))}><Minus aria-hidden="true" /></button>
                <output aria-live="polite">{q}</output><button type="button" aria-label={`More ${t.name}`} disabled={!t.onSale || q >= max} onClick={() => setQty(s => ({ ...s, [t.id]: q + 1 }))}><Plus aria-hidden="true" /></button></span></li>; })}</ul></section>}
          {!hasMap && !ga.length && <section className="co-card"><p>Tickets aren’t available right now.</p></section>}
        </>}

        {step === 2 && summary && <section className="co-card co-review"><div className="co-h"><h2>Review your order</h2><button type="button" className="co-link" onClick={change} disabled={pending}><RefreshCw aria-hidden="true" />Change tickets</button></div>
          {expired ? <p className="co-timer warn"><Clock3 aria-hidden="true" />Your reservation expired and the tickets were released. <button type="button" className="co-link" onClick={change}>Choose again</button></p>
            : <p className={`co-timer${left < 120_000 ? " warn" : ""}`}><Clock3 aria-hidden="true" />Tickets reserved for <b>{mm}:{String(ss).padStart(2, "0")}</b></p>}
          <ul className="co-lines">{summary.lines.map(l => <li key={l.tier_id}><i style={{ background: tierById.get(l.tier_id)?.color }} /><span><b>{l.qty} × {l.name}</b>{l.seats.length > 0 && <small>{l.seats.join(" · ")}</small>}</span><strong>{gbp(l.unit * l.qty)}</strong></li>)}</ul>
          <div className="co-who">{user ? <p>Tickets will be sent to <b>{user.email}</b> and appear in your Gala Dock account.</p>
            : <p>You’ll sign in or create an account before paying, so your tickets are saved securely to you. <Link href={`/login?next=${encodeURIComponent(`/checkout/${event.slug}`)}`}>Sign in now</Link></p>}</div>
          <p className="co-terms">By paying you agree to the event’s terms. Tickets can be transferred or resold from your account where the organiser allows it.</p></section>}
      </main>

      <aside className="co-side"><section className="co-card co-sum"><h2>Order summary</h2>
        {shown.lines.length ? <ul>{shown.lines.map((l, i) => <li key={i}><i style={{ background: l.color }} /><span>{l.q} × {l.name}</span><b>{gbp(l.unit * l.q)}</b></li>)}</ul> : <p className="co-empty">No tickets selected yet.</p>}
        <dl><div><dt>Subtotal</dt><dd>{gbp(shown.sub)}</dd></div><div><dt>Booking fee</dt><dd>{gbp(shown.fee)}</dd></div><div className="tot"><dt>Total</dt><dd>{gbp(shown.total)}</dd></div></dl>
        {step === 1 ? <button type="button" className="co-cta" disabled={pending || est.count === 0 || inQueue || !buyable} onClick={go}>{pending ? "Reserving…" : est.count ? `Reserve ${est.count} ticket${est.count === 1 ? "" : "s"}` : "Choose tickets"}</button>
          : <button type="button" className="co-cta" disabled={paying || left === 0} onClick={pay}><CreditCard aria-hidden="true" />{paying ? "Opening secure payment…" : shown.total ? `Pay ${gbp(shown.total)}` : "Get tickets"}</button>}
        <p className="co-trust"><ShieldCheck aria-hidden="true" />Payments by Stripe. Gala Dock never sees your card details.</p></section></aside>
    </div>
  </div>;
}
