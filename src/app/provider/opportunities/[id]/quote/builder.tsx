"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { GripVertical, X, Plus, Package, LayoutGrid, Wrench, Boxes, Sparkles, FileStack, PenLine, CalendarDays, Clock, Info, Save, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui";
import { saveQuoteDraft, type QuotePayload } from "./actions";
import type { Line, Catalog } from "./data";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export function QuoteBuilder(props: {
  itemId: string; quoteId: string | null; initial: Line[]; catalog: (Catalog[number] & { qty: number })[]; suggested: string[];
  taxBps: number; taxLabel: string; depositPct: number; standbyAvailable: boolean; hours: number; guests: number;
  event: { date: string; start: string; end: string }; hard: boolean; hardReason: string;
  terms: Record<string, unknown>; message: string; top: ReactNode; rail: ReactNode;
}) {
  const router = useRouter(), toast = useToast();
  const base = props.initial.filter(l => !["travel", "setup", "other"].includes(l.kind));
  const extra = (k: string) => props.initial.find(l => l.kind === k)?.unit_price ?? 0;
  const [lines, setLines] = useState<Line[]>(base);
  const [mode, setMode] = useState<"package" | "custom">("custom");
  const [picker, setPicker] = useState<null | "package" | "space" | "service" | "all">(null);
  const [travel, setTravel] = useState(extra("travel"));
  const [setupCost, setSetupCost] = useState(extra("setup"));
  const [other, setOther] = useState(extra("other"));
  const [notes, setNotes] = useState(String(props.terms.additional_notes ?? ""));
  const [setupHours, setSetupHours] = useState(Number(props.terms.setup_hours ?? 2));
  const [breakdownHours, setBreakdownHours] = useState(Number(props.terms.breakdown_hours ?? 1));
  const [depositPct, setDepositPct] = useState(props.depositPct);
  const [standby, setStandby] = useState(Boolean(props.terms.standby ?? false));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const allLines = useMemo(() => [...lines,
    ...(travel > 0 ? [{ label: "Travel / delivery", detail: "", qty: 1, unit: "fixed", unit_price: travel, kind: "travel" }] : []),
    ...(setupCost > 0 ? [{ label: "Setup / breakdown", detail: `${setupHours}h setup · ${breakdownHours}h breakdown`, qty: 1, unit: "fixed", unit_price: setupCost, kind: "setup" }] : []),
    ...(other > 0 ? [{ label: "Other costs", detail: notes.slice(0, 80), qty: 1, unit: "fixed", unit_price: other, kind: "other" }] : []),
  ], [lines, travel, setupCost, other, setupHours, breakdownHours, notes]);
  const subtotal = allLines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const tax = Math.round(subtotal * props.taxBps) / 10000;
  const total = subtotal + tax;
  const deposit = Math.round(total * depositPct) / 100;

  const update = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const add = (c: Catalog[number] & { qty: number }) => { setLines(ls => [...ls, { label: c.label, detail: c.detail, qty: c.qty, unit: c.unit, unit_price: c.unit_price, kind: c.kind, ref: c.key, image: c.image }]); setPicker(null); };
  const payload = (): QuotePayload => ({ items: allLines, depositPct, validDays: Number(props.terms.valid_days ?? 14), message: props.message,
    terms: { ...props.terms, setup_hours: setupHours, breakdown_hours: breakdownHours, additional_notes: notes, standby } });
  const save = (next?: "step1" | "step2") => start(async () => {
    setError("");
    if (!lines.length) { setError("Add at least one item to the quote."); return; }
    const r = await saveQuoteDraft(props.itemId, props.quoteId, payload(), next ?? "step1");
    if (!r.ok) { setError(r.error); return; }
    if (!next) toast("Draft saved");
    if (r.redirect) router.push(r.redirect);
  });
  const pickerItems = props.catalog.filter(c => picker === "all" || (picker === "package" ? c.kind === "package" : picker === "space" ? c.kind === "space" : picker === "service" ? c.kind === "service" : false));

  const related = props.catalog.filter(c => c.kind !== "space" && !lines.some(l => l.ref === c.key)).slice(0, 4);
  return <><div className="qw"><div className="qw-main">{props.top}<div className="qb">
    <div className="qb-grid">
      <div className="qb-col">
      <section className="ws-panel qb-scope">
        <h2>1. Define scope</h2><p className="qb-sub">Select what you are offering for this event.</p>
        <div className="qb-modes" role="tablist" aria-label="Scope source">
          <button type="button" role="tab" aria-selected={mode === "package"} className={mode === "package" ? "on" : ""} onClick={() => { setMode("package"); setPicker("package"); }}><FileStack aria-hidden="true" />Use existing package</button>
          <button type="button" role="tab" aria-selected={mode === "custom"} className={mode === "custom" ? "on" : ""} onClick={() => setMode("custom")}><PenLine aria-hidden="true" />Custom quote</button>
          <button type="button" className="qb-agent" onClick={() => { const add = props.catalog.filter(c => props.suggested.includes(c.key) && !lines.some(l => l.ref === c.key)); if (!add.length) { toast("No further suggestions for this request"); return; }
            setLines(ls => [...ls, ...add.map(c => ({ label: c.label, detail: c.detail, qty: c.qty, unit: c.unit, unit_price: c.unit_price, kind: c.kind, ref: c.key, image: c.image }))]); toast(`Added ${add.length} suggested item${add.length > 1 ? "s" : ""}`); }}><Sparkles aria-hidden="true" />Suggest with Gala Agent</button>
        </div>
        <h3>Include in this quote</h3>
        <ul className="qb-lines">{lines.map((l, i) => <li key={i}>
          <GripVertical aria-hidden="true" className="qb-grip" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {l.image ? <img src={l.image} alt="" /> : <span className="qb-noimg" />}
          <div className="qb-line-text"><input aria-label="Item name" value={l.label} onChange={e => update(i, { label: e.target.value })} /><small>{l.detail || `${l.unit}`}</small></div>
          <label className="sr-only" htmlFor={`qty-${i}`}>Quantity</label>
          <input id={`qty-${i}`} className="qb-qty" type="number" min={1} step={1} value={l.qty} onChange={e => update(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
          <span className="qb-price"><span>£</span><label className="sr-only" htmlFor={`price-${i}`}>Unit price</label><input id={`price-${i}`} type="number" min={0} step="0.01" value={l.unit_price} onChange={e => update(i, { unit_price: Math.max(0, Number(e.target.value) || 0) })} /></span>
          <button type="button" className="qb-x" aria-label={`Remove ${l.label}`} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X aria-hidden="true" /></button>
        </li>)}</ul>
        {!lines.length && <p className="qb-empty">No items yet — add a space, package or service.</p>}
        <button type="button" className="ws-btn outline qb-add" onClick={() => setLines(ls => [...ls, { label: "Custom item", detail: "", qty: 1, unit: "item", unit_price: 0, kind: "custom" }])}><Plus aria-hidden="true" />Add item</button>
        <div className="qb-adders">
          <button type="button" className="ws-btn outline sm" onClick={() => setPicker("package")}><Package aria-hidden="true" />Add from package</button>
          <button type="button" className="ws-btn outline sm" onClick={() => setPicker("space")}><LayoutGrid aria-hidden="true" />Add venue space</button>
          <button type="button" className="ws-btn outline sm" onClick={() => setPicker("service")}><Wrench aria-hidden="true" />Add service</button>
          <button type="button" className="ws-btn outline sm" onClick={() => setPicker("all")}><Boxes aria-hidden="true" />Add equipment</button>
        </div>
        {picker && <div className="qb-picker" role="listbox" aria-label="Add from catalogue">
          <div className="qb-picker-head"><b>{picker === "all" ? "Catalogue" : picker === "package" ? "Packages" : picker === "space" ? "Venue spaces" : "Services"}</b><button type="button" aria-label="Close" onClick={() => setPicker(null)}><X aria-hidden="true" /></button></div>
          {pickerItems.length ? pickerItems.map(c => <button type="button" role="option" aria-selected={false} key={c.key} onClick={() => add(c)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.image ? <img src={c.image} alt="" /> : <span className="qb-noimg" />}<span><b>{c.label}</b><small>{c.detail}</small></span><em>{gbp(c.unit_price)}{c.unit !== "package" && c.unit !== "service" ? ` / ${c.unit.replace(/s$/, "")}` : ""}</em></button>)
            : <p className="qb-empty">Nothing published in this category yet.</p>}
        </div>}
      </section>
      <section className="ws-panel qb-date">
        <h2>2. Date &amp; time</h2><p className="qb-sub">Confirm the event dates, times and any setup/breakdown requirements.</p>
        <div className="qb-row3">
          <label className="ws-field"><span>Event date</span><span className="qb-ro"><CalendarDays aria-hidden="true" />{props.event.date}</span></label>
          <label className="ws-field"><span>Start time</span><span className="qb-ro"><Clock aria-hidden="true" />{props.event.start}</span></label>
          <label className="ws-field"><span>End time</span><span className="qb-ro"><Clock aria-hidden="true" />{props.event.end}</span></label>
        </div>
        <div className="qb-row2">
          <label className="ws-field"><span>Setup time (hours before)</span><input type="number" min={0} max={24} value={setupHours} onChange={e => setSetupHours(Math.max(0, Number(e.target.value) || 0))} /></label>
          <label className="ws-field"><span>Breakdown time (hours after)</span><input type="number" min={0} max={24} value={breakdownHours} onChange={e => setBreakdownHours(Math.max(0, Number(e.target.value) || 0))} /></label>
        </div>
        <p className="qb-hint"><Info aria-hidden="true" />Event dates come from the client’s request. Ask a clarification if they need to change.</p>
      </section>
      </div>
      <div className="qb-col">
      <section className="ws-panel qb-costs">
        <h2>3. Additional costs</h2><p className="qb-sub">Add travel, setup, or other costs.</p>
        {([["Travel / delivery", travel, setTravel], ["Setup / breakdown", setupCost, setSetupCost], ["Other costs (optional)", other, setOther]] as const).map(([label, value, set]) =>
          <div className="qb-cost" key={label}><span>{label}</span><span className="qb-money"><span>£</span><input type="number" min={0} step="0.01" aria-label={label} value={value} onChange={e => set(Math.max(0, Number(e.target.value) || 0))} /></span><span className="qb-fixed">Fixed</span></div>)}
        <label className="qb-notes"><span>Notes on additional costs</span><textarea rows={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Includes travel from London and full setup/breakdown." /><small>{notes.length}/500</small></label>
      </section>
      <section className="ws-panel qb-pricing">
        <h2>4. Pricing &amp; payment terms</h2><p className="qb-sub">Set your deposit and optional standby.</p>
        <div className="qb-cost"><span>Total price (GBP)</span><span className="qb-total">{gbp(total)}</span></div>
        <div className="qb-cost"><span>Deposit required</span><span className="qb-money pct"><input type="number" min={0} max={100} aria-label="Deposit percent" value={depositPct} onChange={e => setDepositPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /><span>%</span></span><span className="qb-dep">{gbp(deposit)}</span></div>
        <label className={`qb-toggle ${props.standbyAvailable ? "" : "off"}`}><input type="checkbox" checked={standby} disabled={!props.standbyAvailable} onChange={e => setStandby(e.target.checked)} /><i />
          <span><b>Offer a standby option</b><small>{props.standbyAvailable ? "Be shown if the primary booking falls through." : "Enable standby in your venue’s commercial settings first."}</small></span></label>
        <div className="qb-breakdown"><b>Price breakdown</b>
          <div className="qb-bd-head"><span>Item</span><span>Amount</span></div>
          {allLines.map((l, i) => <div key={i}><span>{l.label}{l.qty > 1 ? ` (${l.qty} ${l.unit})` : ""}</span><span>{gbp(l.qty * l.unit_price)}</span></div>)}
          {props.taxBps > 0 && <div><span>{props.taxLabel}</span><span>{gbp(tax)}</span></div>}
          <div className="qb-bd-total"><span>Total (GBP)</span><span>{gbp(total)}</span></div>
        </div>
      </section>
      </div>



    </div>
    {props.hard && <p className="qb-error" role="alert">Hard conflict: {props.hardReason}. You can save a draft, but resolve the conflict before sending.</p>}
    {error && <p className="qb-error" role="alert">{error}</p>}
  </div></div>
    <aside className="qw-rail">{props.rail}
      <section className="ws-panel qw-related"><h2>Related items</h2>
        {related.length ? <ul>{related.map(c => <li key={c.key}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.image ? <img src={c.image} alt="" /> : <span className="qb-noimg" />}<span><b>{c.label}</b><small>{c.detail}</small></span><em>{gbp(c.unit_price)}</em>
          <button type="button" className="qw-plus" aria-label={`Add ${c.label}`} onClick={() => add(c)}><Plus aria-hidden="true" /></button></li>)}</ul>
          : <p className="qb-empty">Everything in your catalogue is already in this quote.</p>}
      </section>
    </aside></div>
    <footer className="qb-foot">
      <button type="button" className="ws-btn outline" disabled={pending} onClick={() => save()}><Save aria-hidden="true" />Save as draft</button>
      <button type="button" className="ws-btn primary" disabled={pending || !lines.length} onClick={() => save("step2")}>Continue to review &amp; send <ArrowRight aria-hidden="true" /></button>
    </footer></>;
}
