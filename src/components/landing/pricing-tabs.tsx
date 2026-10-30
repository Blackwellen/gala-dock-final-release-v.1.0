"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";

export type PricingPlan = { kind: "organizer" | "provider"; plan: string; name: string; month: number | null; year: number | null; contact: boolean; features: string[] };

const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const START: Record<PricingPlan["kind"], string> = { organizer: "/register?next=/onboarding/organizer", provider: "/register?next=/onboarding/provider" };

/** Audience and billing-period switch for the public pricing cards. Prices come from the server (plan_prices). */
export function PricingTabs({ plans }: { plans: PricingPlan[] }) {
  const [kind, setKind] = useState<PricingPlan["kind"]>("organizer");
  const [yearly, setYearly] = useState(false);
  const list = plans.filter(p => p.kind === kind);
  return <div className="lp-plans">
    <div className="lp-plan-switches">
      <div className="lp-seg" role="group" aria-label="Who is it for">
        {(["organizer", "provider"] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "organizer" ? "Organizers" : "Venues & suppliers"}</button>)}
      </div>
      <div className="lp-seg" role="group" aria-label="Billing period">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly</button>
      </div>
    </div>
    <div className="lp-plan-grid">
      {list.map(p => {
        const price = yearly ? p.year : p.month;
        const saving = p.month && p.year ? Math.round((1 - p.year / (p.month * 12)) * 100) : 0;
        return <article key={p.plan} className={`lp-plan${p.plan === "pro" ? " is-featured" : ""}`} aria-labelledby={`plan-${p.kind}-${p.plan}`}>
          <header><h3 id={`plan-${p.kind}-${p.plan}`}>{p.name}</h3>{p.plan === "pro" && <span className="lp-plan-tag">Recommended</span>}</header>
          <p className="lp-plan-price">
            {p.contact ? <><b>{p.month ? `From ${gbp(p.month)}` : "Custom"}</b>{p.month ? <small>a month + VAT</small> : null}</>
              : p.month === 0 ? <><b>Free</b><small>to start</small></>
              : price !== null ? <><b>{gbp(price)}</b><small>{yearly ? "a year" : "a month"} + VAT</small></> : <><b>{gbp(p.month ?? 0)}</b><small>a month + VAT</small></>}
          </p>
          {yearly && saving > 0 && !p.contact && <p className="lp-plan-save">Save {saving}% with yearly billing</p>}
          <ul>{p.features.map(f => <li key={f}><Check size={16} aria-hidden="true" />{f}</li>)}</ul>
          {p.contact ? <Link className="lp-btn lp-btn-secondary" href="/help#contact">Talk to us</Link>
            : <Link className={`lp-btn ${p.plan === "pro" ? "lp-btn-primary" : "lp-btn-secondary"}`} href={START[p.kind]}>{p.month === 0 ? "Start free" : `Choose ${p.name}`}</Link>}
        </article>;
      })}
    </div>
  </div>;
}
