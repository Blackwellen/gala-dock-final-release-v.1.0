"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Wine, AlertTriangle, Users, ArrowRight } from "lucide-react";
import { setFinalNumbers, saveBarSelection, type HospitalityBooking } from "@/lib/venue/hospitality";
import { money } from "@/lib/format";

export type BarPackage = { id: string; name: string; model: string; description: string; per_person: number | null; price: number | null; min_age: number | null };
const DIET = [["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["gluten_free", "Gluten free"], ["halal", "Halal"], ["kosher", "Kosher"], ["dairy_free", "Dairy free"], ["nut_free", "Nut free"], ["pescatarian", "Pescatarian"]] as const;
const MODEL: Record<string, string> = { cash_bar: "Cash bar", hosted_bar: "Hosted bar", open_bar: "Open bar", drink_tokens: "Drink tokens", prepaid_package: "Drinks package", minimum_spend: "Minimum spend", consumption_tab: "Bar tab", dry_hire: "Dry hire", mobile_bar: "Mobile bar", bartenders_only: "Bartenders only" };

/**
 * Q13 customer food & drink for one booking line: what the caterer/bar has priced (read back from `hospitality_booking`, never
 * computed here), final numbers with dietary counts before the cut-off, and the bar package choice. The menu itself is chosen on
 * the catering page. Allergens shown are the 14 UK FIC allergens declared by the provider.
 */
export function HospitalityPanel({ itemId, eventId, kind, booking, guests, bars, now }: { itemId: string; eventId: string; kind: "food" | "drinks"; booking: (HospitalityBooking & { exists: boolean }) | null; guests: number; bars: BarPackage[]; now: number }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [n, setN] = useState(booking?.guests ?? guests); const [diet, setDiet] = useState<Record<string, number>>({});
  const [bar, setBar] = useState(bars[0]?.id ?? ""); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cutoffPassed = !!booking?.cutoff_at && Date.parse(booking.cutoff_at) < now;
  const done = (r: { ok: boolean; error?: string }, ok: string) => { setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Could not save." }); if (r.ok) router.refresh(); };
  const saveNumbers = () => start(async () => { const d = Object.fromEntries(Object.entries(diet).filter(([, v]) => v > 0)); done(await setFinalNumbers(itemId, n, Object.keys(d).length ? d : undefined, booking?.version), "Final numbers saved."); });
  const saveBar = () => start(async () => { done(await saveBarSelection(itemId, { bar_package_id: bar, guests: n, submit: true }, booking?.version), "Bar choice sent to the provider."); });
  return <section className="ce-card hp" aria-labelledby="hp-h">
    <div className="k-between"><h2 id="hp-h" className="ce-h2 sm k-row" style={{ gap: 8, margin: 0 }}>{kind === "food" ? <UtensilsCrossed size={17} aria-hidden /> : <Wine size={17} aria-hidden />}{kind === "food" ? "Food & catering" : "Drinks & bar"}</h2>
      {kind === "food" && <Link className="k-link" href={`/account/events/${eventId}/bookings/${itemId}/catering`}>Choose menu <ArrowRight size={13} aria-hidden /></Link>}</div>
    {booking?.exists ? <dl className="hp-sum">
      <div><dt>Status</dt><dd>{booking.status === "confirmed" ? "Confirmed" : booking.status === "submitted" ? "Sent to provider" : booking.status === "cancelled" ? "Cancelled" : "Draft"}</dd></div>
      {booking.catering_minor > 0 && <div><dt>Catering</dt><dd>{money(booking.catering_minor / 100)}</dd></div>}
      {booking.bar_minor > 0 && <div><dt>Bar</dt><dd>{money(booking.bar_minor / 100)}</dd></div>}
      {booking.contingent_minor > 0 && <div><dt>Depends on consumption</dt><dd>up to {money(booking.contingent_minor / 100)}</dd></div>}
      <div className="tot"><dt>Food &amp; drink total</dt><dd>{money(booking.total_minor / 100)}</dd></div>
    </dl> : <p className="k-small">{kind === "food" ? "No menu chosen yet. Pick a menu from this caterer to see prices and allergens." : "No bar package chosen yet."}</p>}
    {booking?.exists && booking.allergens.length > 0 && <p className="hp-allergens"><AlertTriangle size={14} aria-hidden />Contains: {booking.allergens.join(", ")}{booking.may_contain.length ? ` · May contain: ${booking.may_contain.join(", ")}` : ""}</p>}
    {booking?.warnings?.map(w => <p key={w.code} className="hp-warn"><AlertTriangle size={13} aria-hidden />{w.text}</p>)}

    <fieldset className="hp-set" disabled={pending || cutoffPassed}><legend><Users size={14} aria-hidden />Final numbers{booking?.cutoff_at ? <small> · due {new Date(booking.cutoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small> : null}</legend>
      {cutoffPassed ? <p className="k-small">The final-numbers deadline has passed — message the provider to change it.</p> : <>
        <label className="k-field"><span>Guests</span><input className="k-input" type="number" min={1} max={100000} value={n} onChange={e => setN(Math.max(1, Number(e.target.value) || 1))} /></label>
        <div className="hp-diet">{DIET.map(([k, l]) => <label key={k} className="k-field"><span>{l}</span><input className="k-input" type="number" min={0} max={n} value={diet[k] ?? 0} onChange={e => setDiet(d => ({ ...d, [k]: Math.max(0, Number(e.target.value) || 0) }))} /></label>)}</div>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn outline" onClick={saveNumbers}>Save final numbers</button></div></>}
    </fieldset>

    {kind === "drinks" && <fieldset className="hp-set" disabled={pending}><legend><Wine size={14} aria-hidden />Bar package</legend>
      {bars.length ? <><div className="hp-bars" role="radiogroup" aria-label="Bar packages">{bars.map(b => <label key={b.id} className={bar === b.id ? "on" : ""}><input type="radio" name="bar" value={b.id} checked={bar === b.id} onChange={() => setBar(b.id)} />
          <span><b>{b.name}</b><small>{MODEL[b.model] ?? b.model}{b.per_person != null ? ` · ${money(Number(b.per_person))} per person` : b.price != null ? ` · ${money(Number(b.price))}` : ""}{b.min_age ? ` · ${b.min_age}+` : ""}</small>{b.description && <small>{b.description}</small>}</span></label>)}</div>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn primary" disabled={!bar} onClick={saveBar}>Send bar choice</button></div></>
        : <p className="k-small">This provider hasn&apos;t published bar packages yet. Message them to agree the bar.</p>}
    </fieldset>}
    <p className={`hp-msg ${msg ? (msg.ok ? "ok" : "bad") : ""}`} role="status">{msg?.text ?? ""}</p>
  </section>;
}
