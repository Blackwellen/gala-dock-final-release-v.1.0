"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { ArrowRight, CalendarDays, Camera, House, Lightbulb, MapPin, Music2, Plus, Sparkles, UsersRound, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { TLink } from "../tracked-link";
import { Count, Scope } from "../motion";
import { cx, DemoTag, ph, pounds, vars, type Tone } from "../ui";
import { HREF } from "@/lib/public/site";
import { trackPublic } from "../track";

/** 2.3 EventBuildCanvas: a birthday plan with its pieces; choosing a category highlights its items and the summary interpolates. */
type Cat = "venue" | "food" | "ent" | "photo" | "staff" | "extras";
const CATS: [Cat, string, LucideIcon][] = [["venue", "Venue", House], ["food", "Food & Drink", UtensilsCrossed], ["ent", "Entertainment", Music2], ["photo", "Photo & Video", Camera], ["staff", "Staffing", UsersRound], ["extras", "Extras", Sparkles]];
type Item = { key: string; cat: Cat; name: string; state: string; tone: Tone; price: number; img: string; slot: string };
const ITEMS: Item[] = [
  { key: "hall", cat: "venue", name: "Grand Hall", state: "Confirmed", tone: "ok", price: 1800, img: "v-grand-hall.webp", slot: "root" },
  { key: "dj", cat: "ent", name: "DJ", state: "Confirmed", tone: "ok", price: 650, img: "s-dj-marcus.webp", slot: "a" },
  { key: "bar", cat: "food", name: "Mobile Bar", state: "Awaiting", tone: "wait", price: 750, img: "bc-riverside-bars.webp", slot: "b" },
  { key: "photo", cat: "photo", name: "Photographer", state: "Confirmed", tone: "ok", price: 450, img: "s-snapshot.webp", slot: "c" },
  { key: "security", cat: "staff", name: "Security", state: "Pending", tone: "plain", price: 400, img: "s-elite-security.webp", slot: "d" },
];
const BUDGET = 5000;
const confirmed = ITEMS.filter(i => i.tone === "ok").reduce((n, i) => n + i.price, 0);
const awaiting = ITEMS.filter(i => i.tone !== "ok").reduce((n, i) => n + i.price, 0);

export function BuildCanvas() {
  const [cat, setCat] = useState<Cat | null>(null);
  const picked = cat ? ITEMS.filter(i => i.cat === cat) : ITEMS;
  const total = picked.reduce((n, i) => n + i.price, 0);
  const label = cat ? CATS.find(c => c[0] === cat)![1] : "Whole plan";
  const ready = Math.round(ITEMS.filter(i => i.tone === "ok").length / ITEMS.length * 100);
  const choose = (c: Cat) => { const next = cat === c ? null : c; setCat(next); trackPublic("section_interaction", "landing", `build_${next ?? "all"}`); };

  return <Scope className="gpl-build" amount={0.2}>
    <div className="gpl-build-canvas gp-panel" data-rv="rise">
      <header className="gpl-build-head">
        <span className="gpl-build-ic"><CalendarDays size={22} aria-hidden="true" /></span>
        <div><h3>Maya’s 30th Birthday</h3><p><span><MapPin size={14} aria-hidden="true" />London</span><span><CalendarDays size={14} aria-hidden="true" />24 Jul</span><span><UsersRound size={14} aria-hidden="true" />~120 guests</span></p></div>
        <span className="gpl-build-views" aria-hidden="true"><b>Plan</b><span>Suppliers</span><span>Guests</span><span>Timeline</span></span>
      </header>
      <div className="gpl-build-body">
        <div className="gpl-build-cats" role="group" aria-label="Highlight a category">
          {CATS.map(([k, l, I]) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => choose(k)} className={cx("gpl-build-cat", cat === k && "is-on")}><span><I size={19} aria-hidden="true" /></span>{l}</button>)}
        </div>
        <div className="gpl-build-tree" aria-label="Items in this plan">
          <svg className="gpl-build-lines" viewBox="0 0 600 340" preserveAspectRatio="none" aria-hidden="true">
            <path className="gp-draw" pathLength={1} d="M300 96 V120 M300 120 H150 V142 M300 120 H450 V142" style={vars({ "--d": 500 })} />
            <path className="gp-draw" pathLength={1} d="M150 210 V236 M150 236 H150 V256 M450 210 V236 H450 V256" style={vars({ "--d": 800 })} />
          </svg>
          <ul>
            {ITEMS.map((it, i) => <li key={it.key} className={cx("gpl-bitem", `is-${it.slot}`, cat && (it.cat === cat ? "is-hit" : "is-dim"))} data-rv="pop" style={vars({ "--d": 200 + i * 140 })}>
              <img src={ph(it.img)} alt="" width={72} height={56} loading="lazy" />
              <span><b>{it.name}</b><span className={`gp-state is-${it.tone}`}>{it.state}</span><em>{pounds(it.price)}</em></span>
            </li>)}
            <li className="gpl-bitem is-add" aria-hidden="true"><Plus size={20} /><small>Add item</small></li>
          </ul>
        </div>
      </div>
      <div className="gpl-build-next">
        <span className="gpl-build-next-h"><Lightbulb size={20} aria-hidden="true" /><span><b>Recommended next</b><small>Based on your event and date</small></span></span>
        <ul>{[["Catering", "s-taste-catering.webp"], ["Decor & styling", "s-elegant-decor.webp"], ["Event staff", "s-sax-groove.webp"]].map(([n, img]) => <li key={n}><img src={ph(img)} alt="" width={44} height={36} loading="lazy" /><b>{n}</b></li>)}</ul>
      </div>
      <DemoTag className="gpl-build-tag" />
    </div>
    <aside className="gpl-build-rail gp-card" data-rv="right" style={vars({ "--d": 260 })} aria-label="Budget and readiness">
      <div className="gpl-build-rail-h"><b>Budget &amp; readiness</b><em>{ready}% ready</em></div>
      <span className="gp-bar gp-grow"><i style={{ width: `${ready}%`, ...vars({ "--d": 700 }) }} /></span>
      <dl>
        <div><dt><i className="is-ok" />Confirmed</dt><dd>{pounds(confirmed)}</dd></div>
        <div><dt><i className="is-wait" />Awaiting confirmation</dt><dd>{pounds(awaiting)}</dd></div>
        <div><dt><i />Remaining</dt><dd>{pounds(BUDGET - confirmed - awaiting)}</dd></div>
      </dl>
      <div className="gpl-build-total" aria-live="polite">
        <small>{cat ? `${label} in this plan` : `Planned of ${pounds(BUDGET)} budget`}</small>
        <strong><Count value={total} format={pounds} /></strong>
      </div>
      <TLink href={HREF.startBuilding} surface="landing" variant="build_canvas_cta" className="gp-btn gp-btn--primary gpl-build-cta">Build an Event<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
      <p className="gp-note"><CalendarDays size={18} aria-hidden="true" />Some pieces depend on the venue being confirmed. Gala Dock shows you the right order to book.</p>
    </aside>
  </Scope>;
}
