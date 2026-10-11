"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { saveRateCard, deleteRateCard, quoteVenue } from "@/lib/venue/actions";
import "@/styles/marketplace.css";

export type RateCard = { id: string; space_id: string | null; name: string; model: string; amount: number; per_person: number | null; min_hours: number | null; min_spend: number | null;
  bar_min: number | null; catering_min: number | null; days_of_week: number[]; time_from: string | null; time_to: string | null; season_from: string | null; season_to: string | null;
  peak: boolean; active: boolean; fees: Record<string, number | boolean> };
const MODELS: [string, string][] = [["hourly", "Hourly"], ["half_day", "Half day"], ["full_day", "Full day"], ["evening", "Evening"], ["flat", "Flat event fee"], ["per_person", "Per person"],
  ["package", "Package price"], ["min_spend", "Minimum spend"], ["hybrid", "Hybrid (hire + minimums)"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const gbp = (n: unknown) => n == null || n === "" ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n));

/** Venue commercial engine (§60): any mix of pricing models per venue or space, with a live quote + conflict check against real bookings. */
export function RateCards({ workspaceId, venueId, spaces, cards, canManage }: { workspaceId: string; venueId: string; spaces: { id: string; name: string }[]; cards: RateCard[]; canManage: boolean }) {
  const [editing, setEditing] = useState<RateCard | "new" | null>(null);
  return <div className="mk-page" style={{ maxWidth: "none" }}>
    <section className="mk-card" aria-labelledby="rc-h">
      <div className="mk-page-head"><div><h2 id="rc-h">Rate cards</h2><p className="mk-note">Hourly, day, evening, per-person, minimum-spend or hybrid — per space or venue-wide, with peak, day-of-week and seasonal rates. The most specific matching card prices each slot.</p></div>
        {canManage && <button type="button" className="mk-btn primary" onClick={() => setEditing("new")}><Plus size={14} aria-hidden="true" />Add rate card</button>}</div>
      {!cards.length && editing !== "new" ? <p className="mk-empty">No rate cards yet. Without one, quotes use each space’s hourly rate.</p> :
      <ul className="mk-list">{cards.map(c => <li key={c.id}>
        <div className="mk-main"><b>{c.name}{!c.active && " (inactive)"}</b>
          <small>{MODELS.find(([k]) => k === c.model)?.[1]} · {c.space_id ? spaces.find(s => s.id === c.space_id)?.name : "All spaces"} · {c.days_of_week.length === 7 ? "Every day" : c.days_of_week.map(d => DAYS[d]).join(", ")}
            {c.time_from ? ` · from ${c.time_from.slice(0, 5)}` : ""}{c.season_from ? ` · ${c.season_from}→${c.season_to}` : ""}{c.peak ? " · Peak" : ""}</small>
          <small>{c.amount ? gbp(c.amount) : ""}{c.per_person ? ` + ${gbp(c.per_person)}/person` : ""}{c.min_spend ? ` · min spend ${gbp(c.min_spend)}` : ""}{c.fees.damage_deposit ? ` · damage deposit ${gbp(c.fees.damage_deposit)}` : ""}</small></div>
        {canManage && <span className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => setEditing(c)}>Edit</button><DeleteCard id={c.id} /></span>}
      </li>)}</ul>}
      {editing && <CardForm key={editing === "new" ? "new" : editing.id} card={editing === "new" ? null : editing} workspaceId={workspaceId} venueId={venueId} spaces={spaces} onDone={() => setEditing(null)} />}
    </section>
    <QuotePreview spaces={spaces} />
  </div>;
}

function DeleteCard({ id }: { id: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  return <button type="button" className="mk-btn danger" aria-label="Delete rate card" disabled={pending} onClick={() => start(async () => { const r = await deleteRateCard(id); if (r.ok) router.refresh(); })}><Trash2 size={14} aria-hidden="true" /></button>;
}

function CardForm({ card, workspaceId, venueId, spaces, onDone }: { card: RateCard | null; workspaceId: string; venueId: string; spaces: { id: string; name: string }[]; onDone: () => void }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const f = card?.fees ?? {}, s = (v: unknown) => (v == null ? "" : String(v));
  return <form className="mk-form" aria-label={card ? `Edit ${card.name}` : "New rate card"} action={fd => start(async () => {
    const g = (k: string) => String(fd.get(k) ?? "");
    const r = await saveRateCard({ id: card?.id, workspaceId, venueId, spaceId: g("space"), name: g("name"), model: g("model"), amount: g("amount"), perPerson: g("per_person"), minHours: g("min_hours"),
      minSpend: g("min_spend"), barMin: g("bar_min"), cateringMin: g("catering_min"), days: fd.getAll("days").map(Number), timeFrom: g("time_from"), timeTo: g("time_to"), seasonFrom: g("season_from"),
      seasonTo: g("season_to"), peak: fd.get("peak") === "on", setup: g("setup"), cleanup: g("cleanup"), overtime: g("overtime"), securityFee: g("security_fee"),
      securityRequired: fd.get("security_required") === "on", damageDeposit: g("damage_deposit"), depositPct: g("deposit_pct"), active: fd.get("active") === "on" });
    if (!r.ok) setError(r.error); else { onDone(); router.refresh(); }
  })}>
    <label className="mk-field"><span>Name</span><input name="name" required minLength={2} maxLength={80} defaultValue={card?.name} placeholder="e.g. Saturday evening" /></label>
    <label className="mk-field"><span>Applies to</span><select name="space" defaultValue={card?.space_id ?? ""}><option value="">All spaces</option>{spaces.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className="mk-field"><span>Pricing model</span><select name="model" defaultValue={card?.model ?? "hourly"}>{MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className="mk-field"><span>Hire amount (£)</span><input name="amount" type="number" min={0} step="0.01" defaultValue={s(card?.amount)} /></label>
    <label className="mk-field"><span>Per person (£)</span><input name="per_person" type="number" min={0} step="0.01" defaultValue={s(card?.per_person)} /></label>
    <label className="mk-field"><span>Minimum hours</span><input name="min_hours" type="number" min={0} step="0.5" defaultValue={s(card?.min_hours)} /></label>
    <label className="mk-field"><span>Minimum spend (£)</span><input name="min_spend" type="number" min={0} step="1" defaultValue={s(card?.min_spend)} /></label>
    <label className="mk-field"><span>Bar minimum (£)</span><input name="bar_min" type="number" min={0} step="1" defaultValue={s(card?.bar_min)} /></label>
    <label className="mk-field"><span>Catering minimum (£)</span><input name="catering_min" type="number" min={0} step="1" defaultValue={s(card?.catering_min)} /></label>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Days</legend><div className="mk-cats">{DAYS.map((d, i) => <label key={d}><input type="checkbox" name="days" value={i} defaultChecked={card ? card.days_of_week.includes(i) : true} />{d}</label>)}</div></fieldset>
    <label className="mk-field"><span>Starts from (time)</span><input name="time_from" type="time" defaultValue={card?.time_from?.slice(0, 5) ?? ""} /></label>
    <label className="mk-field"><span>Until (time)</span><input name="time_to" type="time" defaultValue={card?.time_to?.slice(0, 5) ?? ""} /></label>
    <label className="mk-field"><span>Season from (MM-DD)</span><input name="season_from" pattern="\d{2}-\d{2}" placeholder="06-01" defaultValue={card?.season_from ?? ""} /></label>
    <label className="mk-field"><span>Season to (MM-DD)</span><input name="season_to" pattern="\d{2}-\d{2}" placeholder="09-30" defaultValue={card?.season_to ?? ""} /></label>
    <label className="mk-field"><span>Setup fee (£)</span><input name="setup" type="number" min={0} step="1" defaultValue={s(f.setup)} /></label>
    <label className="mk-field"><span>Cleanup fee (£)</span><input name="cleanup" type="number" min={0} step="1" defaultValue={s(f.cleanup)} /></label>
    <label className="mk-field"><span>Overtime per hour (£)</span><input name="overtime" type="number" min={0} step="1" defaultValue={s(f.overtime_hourly)} /></label>
    <label className="mk-field"><span>Security fee (£)</span><input name="security_fee" type="number" min={0} step="1" defaultValue={s(f.security_fee)} /></label>
    <label className="mk-field"><span>Damage deposit (£)</span><input name="damage_deposit" type="number" min={0} step="1" defaultValue={s(f.damage_deposit)} /></label>
    <label className="mk-field"><span>Booking deposit (%)</span><input name="deposit_pct" type="number" min={0} max={100} step="1" defaultValue={s(f.booking_deposit_pct ?? 30)} /></label>
    <label className="mk-switch"><input type="checkbox" name="security_required" defaultChecked={!!f.security_required} />Security required</label>
    <label className="mk-switch"><input type="checkbox" name="peak" defaultChecked={card?.peak ?? false} />Peak rate</label>
    <label className="mk-switch"><input type="checkbox" name="active" defaultChecked={card?.active ?? true} />Active</label>
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={onDone}>Cancel</button><button className="mk-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Save rate card</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

/** Live quote for a slot using the same server pricing customers receive, plus the conflict engine's verdict. */
function QuotePreview({ spaces }: { spaces: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ quote: Record<string, unknown>; conflicts: { level: string; reason: string }[] } | null>(null);
  const [error, setError] = useState("");
  if (!spaces.length) return null;
  return <section className="mk-card" aria-labelledby="qp-h"><h2 id="qp-h">Quote &amp; availability check</h2>
    <form className="mk-form" action={fd => start(async () => { setError(""); const r = await quoteVenue(String(fd.get("space")), String(fd.get("starts")), String(fd.get("ends")), Number(fd.get("guests"))); if (r.ok && r.data) setRes(r.data); else if (!r.ok) setError(r.error); })}>
      <label className="mk-field"><span>Space</span><select name="space">{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="mk-field"><span>Guests</span><input name="guests" type="number" min={0} defaultValue={80} /></label>
      <label className="mk-field"><span>Starts</span><input name="starts" type="datetime-local" required /></label>
      <label className="mk-field"><span>Ends</span><input name="ends" type="datetime-local" required /></label>
      <div className="mk-row wide"><button className="mk-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Check</button></div>
      {error && <p className="mk-error" role="alert">{error}</p>}
    </form>
    {res && <div className="mk-quote" aria-live="polite">
      {res.conflicts.length ? res.conflicts.map((c, i) => <p key={i} className={c.level === "hard" ? "mk-error" : "mk-note warn"}>{c.level === "hard" ? "Unavailable" : "Check"}: {c.reason}</p>) : <p className="mk-note">No conflicts — available, including setup and cleardown buffers.</p>}
      {res.quote.available === false ? <p className="mk-note">{String(res.quote.reason)}</p> : <>
        <dl className="mk-dl">{(res.quote.lines as { label: string; amount: number }[]).map(l => <div key={l.label}><dt>{l.label}</dt><dd>{gbp(l.amount)}</dd></div>)}</dl>
        <dl className="mk-dl"><div><dt>Total</dt><dd>{gbp(res.quote.total)}</dd></div><div><dt>Deposit</dt><dd>{gbp(res.quote.deposit)}</dd></div><div><dt>Damage deposit</dt><dd>{gbp(res.quote.damage_deposit)}</dd></div></dl>
      </>}
    </div>}
  </section>;
}
