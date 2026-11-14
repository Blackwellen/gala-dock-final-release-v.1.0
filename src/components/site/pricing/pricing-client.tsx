"use client";
import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, ChevronDown, Minus, OctagonX, Plus, ShieldCheck, Sparkles } from "lucide-react";
import type { CreditPack, Kind, PricingPlan } from "@/lib/public/pricing";
import { HREF } from "@/lib/public/site";
import { TLink } from "../tracked-link";
import { Count } from "../motion";
import { Pressed } from "../controls";
import { cx, gbp } from "../ui";
import { trackPublic } from "../track";

const S = "pricing";
const START: Record<Kind, string> = { organizer: HREF.startOrganising, provider: HREF.joinProvider };
const BEST: Record<Kind, Record<string, string>> = {
  organizer: { starter: "Trying Gala Dock on your first events", pro: "Independent organisers running events every month", business: "Teams and agencies with a full portfolio", enterprise: "Large operations with custom needs" },
  provider: { starter: "Listing a venue or service and taking first bookings", pro: "Growing providers with a small team", business: "Multi-space venues and larger supplier teams", enterprise: "Groups and high-volume providers" },
};
const ROWS: [string, (p: PricingPlan) => string | boolean, Kind | "both"][] = [
  ["Active events", p => p.caps.events === null ? "Unlimited" : p.caps.events.toLocaleString("en-GB"), "organizer"],
  ["Listings", p => p.caps.listings === null ? "Unlimited" : p.caps.listings.toLocaleString("en-GB"), "provider"],
  ["Platform fee on bookings", p => `${((p.caps.commissionBps ?? 0) / 100).toLocaleString("en-GB")}% + VAT`, "provider"],
  ["Team members", p => p.caps.team === null ? "Unlimited" : p.caps.team.toLocaleString("en-GB"), "both"],
  ["Storage", p => `${p.caps.storage.toLocaleString("en-GB")} GB`, "both"],
  ["Gala Agent credits a month", p => p.caps.credits.toLocaleString("en-GB"), "both"],
  ["Gala Agent missions", p => p.caps.agentActions, "both"],
  ["Deep analysis", p => p.caps.agentDeep, "both"],
  ["Advanced reporting", p => p.caps.reporting, "organizer"],
  ["API, webhooks and MCP", p => p.caps.api, "both"],
];

function Price({ p, yearly, vat = true }: { p: PricingPlan; yearly: boolean; vat?: boolean }) {
  const price = yearly && p.year !== null ? p.year : p.month; const plus = vat ? " + VAT" : "";
  return <p className="lp-plan-price">
    {p.contact ? <><b>{p.month ? `From ${gbp(p.month)}` : "Custom"}</b>{p.month ? <small>a month{plus}</small> : null}</>
      : p.month === 0 ? <><b>Free</b><small>to start</small></>
      : <><b>{gbp(price ?? 0)}</b><small>{yearly && p.year !== null ? "a year" : "a month"}{plus}</small></>}
  </p>;
}

/** 8.1 controls + 8.2 plan rail and comparison drawer. Audience and billing are toggle buttons (aria-pressed). */
/** Q67: `vatAdded` follows BILLING_AUTOMATIC_TAX (plan checkout adds VAT only when Stripe Tax is on), so the copy is true either way. */
export function PlanExplorer({ plans, vatAdded = true }: { plans: PricingPlan[]; vatAdded?: boolean }) {
  const [kind, setKind] = useState<Kind>("organizer");
  const [yearly, setYearly] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const list = plans.filter(p => p.kind === kind);
  const rows = ROWS.filter(r => r[2] === "both" || r[2] === kind);
  const onKind = (k: Kind) => { setKind(k); setSel(null); trackPublic("section_interaction", S, `audience_${k}`); };
  const onBill = (k: "month" | "year") => { setYearly(k === "year"); trackPublic("pricing_billing_toggle", S, k); };
  return <>
    <div className="gp-wrap gpr-controls-band"><div className="gpr-controls">
      <Pressed idBase="gpr-aud" label="Who is it for" value={kind} onChange={onKind} items={[{ key: "organizer", label: "Organisers" }, { key: "provider", label: "Providers" }]} />
      <Pressed idBase="gpr-bill" label="Billing period" value={yearly ? "year" : "month"} onChange={onBill} items={[{ key: "month", label: "Monthly" }, { key: "year", label: "Annual" }]} />
    </div>
    <p className="gpr-summary" aria-live="polite">{kind === "organizer" ? "Organiser plans scale with your event portfolio: active events, team, Gala Agent credits and integrations." : "Providers start free and pay a platform fee on bookings; higher plans lower the fee and add team and integration tools."}</p></div>
    <section className="gp-sec gpr-plans-sec" id="plans" aria-labelledby="gpr-plans-h"><div className="gp-wrap">
      <h2 id="gpr-plans-h" className="gp-h2 gpr-plans-title">{kind === "organizer" ? <>Choose the operating level that matches <span className="gp-blue">your event portfolio.</span></> : <>Choose the plan that matches <span className="gp-blue">how your business works.</span></>}</h2>
      <ul className="gpr-rail" aria-label={`${kind === "organizer" ? "Organiser" : "Provider"} plans`}>
        {list.map(p => {
          const saving = p.month && p.year ? Math.round((1 - p.year / (p.month * 12)) * 100) : 0;
          const head = `plan-${p.kind}-${p.plan}`;
          return <motion.li layout key={`${p.kind}-${p.plan}`} className={cx("lp-plan", sel === p.plan && "is-sel", p.contact && "is-ent")} aria-labelledby={head} transition={{ type: "spring", stiffness: 360, damping: 36 }}>
            <header><h3 id={head}>{p.name}</h3>{p.contact && <span className="gpr-ent-tag">Talk to sales</span>}</header>
            <Price p={p} yearly={yearly} vat={vatAdded} />
            {yearly && saving > 0 && !p.contact && <p className="lp-plan-save">Save {saving}% with annual billing</p>}
            <p className="gpr-best">{BEST[kind][p.plan]}</p>
            <ul className="gpr-keys">{p.features.slice(0, kind === "organizer" ? 3 : 4).concat(p.caps.credits ? [`${p.caps.credits.toLocaleString("en-GB")} Agent credits / month`] : []).map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
            {p.contact ? <TLink href={HREF.contact} event="pricing_plan_select" surface={S} variant={`${p.kind}_${p.plan}`} className="gp-btn gp-btn--ghost gp-btn--sm gpr-cta">Talk to Sales</TLink>
              : <TLink href={START[p.kind]} event="pricing_plan_select" surface={S} variant={`${p.kind}_${p.plan}`} className={cx("gp-btn gp-btn--sm gpr-cta", p.month === 0 ? "gp-btn--primary" : "gp-btn--ghost")}>{p.month === 0 ? "Start Free" : `Choose ${p.name}`}</TLink>}
            <button type="button" className="gpr-compare" aria-pressed={sel === p.plan} aria-controls={sel ? "gpr-drawer" : undefined} onClick={() => { setSel(sel === p.plan ? null : p.plan); trackPublic("section_interaction", S, `compare_${p.kind}_${p.plan}`); }}>
              {sel === p.plan ? "Hide comparison" : "Compare plans"}<ChevronDown size={15} aria-hidden="true" />
            </button>
          </motion.li>;
        })}
      </ul>
      <AnimatePresence initial={false}>{sel && <motion.div id="gpr-drawer" className="gpr-drawer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .3, ease: [0.2, 0.7, 0.2, 1] }}>
        <div className="gpr-drawer-in">
          <table className="gpr-cmp">
            <caption className="gp-sr">{kind === "organizer" ? "Organiser" : "Provider"} plan comparison</caption>
            <thead><tr><th scope="col"><span className="gp-sr">Capability</span></th>{list.map(p => <th key={p.plan} scope="col" className={cx(sel === p.plan && "is-sel")}>{p.name}</th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{list.map(p => { const v = f(p); return <td key={p.plan} className={cx(sel === p.plan && "is-sel")}>{typeof v === "boolean" ? (v ? <><Check size={16} aria-hidden="true" /><span className="gp-sr">Included</span></> : <><Minus size={16} aria-hidden="true" className="gpr-no" /><span className="gp-sr">Not included</span></>) : v}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      </motion.div>}</AnimatePresence>
      <p className="gpr-vat">{vatAdded ? "Prices exclude VAT, which is added at checkout." : "Plan prices are what you pay; VAT isn’t added to plan invoices at the moment."} Annual prices are billed once a year. Upgrades take effect straight away (prorated); downgrades take effect at the end of the billing period.</p>
    </div></section>
  </>;
}

/** 8.3 TransactionExample + UpgradePath. Fee rates come from plan_entitlements (commission.rate_bps); VAT rate from LEGAL. */
export function ProviderEconomics({ plans, vatPct, bookingAdmin }: { plans: PricingPlan[]; vatPct: number; bookingAdmin: string }) {
  const tiers = plans.filter(p => p.kind === "provider" && !p.contact && p.caps.commissionBps !== null);
  const [i, setI] = useState(0);
  const t = tiers[i];
  if (!t) return null;
  const BOOKING = 1000;
  const fee = BOOKING * (t.caps.commissionBps! / 10000), vat = fee * vatPct / 100, net = BOOKING - fee - vat;
  const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rate = (t.caps.commissionBps! / 100).toLocaleString("en-GB");
  return <div className="gpr-econ">
    <div className="gpr-eq gp-panel">
      <p className="gpr-eq-label">Example: one £1,000 booking on <b>{t.name}</b></p>
      <div className="gpr-eq-row" aria-hidden="true">
        <span className="gpr-eq-term"><small>Booking</small><b>{money(BOOKING)}</b></span><span className="gpr-op">−</span>
        <span className="gpr-eq-term"><small>Platform fee ({rate}%)</small><b><Count value={fee} format={money} /></b></span><span className="gpr-op">−</span>
        <span className="gpr-eq-term"><small>VAT on the fee ({vatPct}%)</small><b><Count value={vat} format={money} /></b></span><span className="gpr-op">=</span>
        <span className="gpr-eq-term is-net"><small>Your booking value</small><b><Count value={net} format={money} /></b></span>
      </div>
      <p className="gp-sr" aria-live="polite">On the {t.name} plan, a £1,000 booking carries a {rate}% platform fee of {money(fee)} plus {money(vat)} VAT on that fee, leaving {money(net)}.</p>
      <p className="gpr-eq-note">Figures exclude card-processing costs. Customers also pay a booking admin fee of {bookingAdmin}, shown as its own line at checkout — it doesn’t come out of your booking value.</p>
    </div>
    <div className="gpr-stairs" role="group" aria-label="Provider plan">
      {tiers.map((p, n) => <button key={p.plan} type="button" aria-pressed={i === n} onClick={() => { setI(n); trackPublic("section_interaction", S, `econ_${p.plan}`); }} className={cx("gpr-step", i === n && "is-on")} style={{ marginTop: `${(tiers.length - 1 - n) * 22}px` }}>
        <b>{p.name}</b><span>{p.month ? `${gbp(p.month)} a month + VAT` : "Free"}</span><em>{((p.caps.commissionBps ?? 0) / 100).toLocaleString("en-GB")}% platform fee</em>
        <small>{n === 0 ? "List free, pay only on bookings" : p.caps.agentDeep ? "Lowest fee, bigger teams, deep Agent analysis" : "Lower fee, team tools, API and integrations"}</small>
      </button>)}
    </div>
  </div>;
}

/** 8.4 CreditMeter: included credits per plan (live), illustrative effort bands (no per-task credit numbers), budget controls. */
const EFFORT: [string, string, number][] = [["Quick question", "A short answer about one event", 8], ["Supplier search mission", "Search, compare and shortlist", 30], ["Full event readiness mission", "Checks every part of an event", 62]];
const POLICY: [string, string, typeof Bell, string][] = [
  ["alert", "Alert only", Bell, "Owners are alerted as usage passes 70%, 85% and 95% of the month’s credits."],
  ["stop", "Stop at the limit", OctagonX, "A hard cap: Gala Agent pauses when the month’s credits are used, until credits are added."],
  ["overage", "Approved overage", ShieldCheck, "An owner approves extra usage up to a limit they set."],
];
export function Credits({ plans, packs }: { plans: PricingPlan[]; packs: CreditPack[] }) {
  const org = plans.filter(p => p.kind === "organizer");
  const [pi, setPi] = useState(Math.min(1, org.length - 1));
  const [ef, setEf] = useState(1);
  const [pol, setPol] = useState("alert");
  const plan = org[pi];
  return <div className="gpr-credits">
    <div className="gpr-meter gp-card">
      <label className="gpr-select"><span>Plan</span><select value={pi} onChange={e => setPi(Number(e.target.value))}>{org.map((p, n) => <option key={p.plan} value={n}>{p.name}</option>)}</select></label>
      <p className="gpr-meter-n"><b><Count value={plan?.caps.credits ?? 0} /></b><span>credits included each month</span></p>
      <div className="gpr-meter-bar" aria-hidden="true"><motion.i className="gpr-meter-use" initial={false} animate={{ width: `${EFFORT[ef]![2]}%` }} transition={{ type: "spring", stiffness: 160, damping: 26 }} /><span className="gpr-cap" style={{ left: "95%" }} /></div>
      <p className="gpr-meter-cap"><Sparkles size={15} aria-hidden="true" />Illustrative share for the selected task · cap marker shown at 95%</p>
    </div>
    <ul className="gpr-effort" aria-label="Example tasks">
      {EFFORT.map(([t, d, w], n) => <li key={t}><button type="button" aria-pressed={ef === n} onClick={() => setEf(n)} className={cx("gpr-eff", ef === n && "is-on")}>
        <b>{t}</b><small>{d}</small><span className="gpr-band" aria-hidden="true"><i style={{ width: `${w}%` }} /></span><em>{n === 0 ? "Light" : n === 1 ? "Moderate" : "Heavy"} use</em>
      </button></li>)}
      <li className="gpr-effort-note">Indicative only — actual usage depends on the task. You never see raw model tokens.</li>
    </ul>
    <div className="gpr-policy gp-card">
      <p className="gpr-policy-h">Budget controls</p>
      <div role="radiogroup" aria-label="Budget control">{POLICY.map(([k, l, I]) => <button key={k} type="button" role="radio" aria-checked={pol === k} tabIndex={pol === k ? 0 : -1} onClick={() => setPol(k)}
        onKeyDown={e => { const n = POLICY.findIndex(x => x[0] === pol); if (["ArrowDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); setPol(POLICY[(n + 1) % 3]![0]); } if (["ArrowUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); setPol(POLICY[(n + 2) % 3]![0]); } }}
        className={cx("gpr-pol", pol === k && "is-on")}><I size={17} aria-hidden="true" />{l}</button>)}</div>
      <p className="gpr-policy-d" aria-live="polite">{POLICY.find(x => x[0] === pol)![3]}</p>
      {packs.length > 0 && <><p className="gpr-policy-h">Credit packs</p><ul className="gpr-packs">{packs.map(k => <li key={k.name}><span>{k.credits.toLocaleString("en-GB")} credits</span><b>{gbp(k.priceMinor)} + VAT</b></li>)}</ul></>}
    </div>
  </div>;
}

export type Faq = { q: string; a: string };
/** 8.6 Native button accordion (aria-expanded + labelled regions). */
export function PricingFaq({ items }: { items: Faq[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return <div className="gpr-faq">{items.map((it, i) => { const on = open === i, b = `${base}-b${i}`, r = `${base}-r${i}`; return <div key={it.q} className={cx("gpr-faq-item", on && "is-open")}>
    <h3><button id={b} type="button" aria-expanded={on} aria-controls={r} onClick={() => { setOpen(on ? null : i); if (!on) trackPublic("faq_expand", S, `faq_${i + 1}`); }}><span>{it.q}</span>{on ? <Minus size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</button></h3>
    <div id={r} role="region" aria-labelledby={b} hidden={!on} className="gpr-faq-a"><p>{it.a}</p></div>
  </div>; })}</div>;
}

