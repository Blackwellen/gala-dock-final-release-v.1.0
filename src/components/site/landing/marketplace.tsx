"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Accessibility, BadgeCheck, CalendarDays, Camera, Car, House, ListChecks, MapPin, Music2, Navigation, ShieldCheck, Sparkles, Star, Trees, UsersRound, UtensilsCrossed, Zap } from "lucide-react";
import { Scope } from "../motion";
import { cx, DemoTag, ph, vars } from "../ui";
import { trackPublic } from "../track";

/** 2.5 Marketplace with event context: a pale vector map + a ranked list that reorders by Best fit / Nearest / Reliability.
 *  A static, illustrative demonstration — it never queries or implies live availability. */
type Venue = { key: string; name: string; area: string; km: number; fit: number; rel: number; cap: string; feat: [typeof House, string][]; avail: "ok" | "wait"; reply: string; img: string; pin: [number, number]; from: string };
const VENUES: Venue[] = [
  { key: "riverside", name: "Riverside Hall", area: "Southwark", km: 3.2, fit: 96, rel: 98, cap: "50–250", feat: [[House, "Indoor"], [Car, "Parking"], [Accessibility, "Step-free"]], avail: "ok", reply: "Replies within 1 hour", img: "v-grand-hall.webp", pin: [52, 58], from: "£1,200" },
  { key: "skyline", name: "Skyline Venue", area: "Shoreditch", km: 3.4, fit: 91, rel: 95, cap: "80–400", feat: [[House, "Indoor"], [Sparkles, "Rooftop"], [Accessibility, "Step-free"]], avail: "ok", reply: "Replies within 2 hours", img: "v-skyline-rooftop.webp", pin: [64, 36], from: "£1,800" },
  { key: "garden", name: "Garden Rooms", area: "Kensington", km: 6.1, fit: 88, rel: 99, cap: "40–200", feat: [[House, "Indoor"], [Trees, "Garden"], [Accessibility, "Step-free"]], avail: "wait", reply: "Replies within 3 hours", img: "v-oakwood.webp", pin: [26, 64], from: "£950" },
  { key: "loft", name: "The Loft", area: "Brixton", km: 7.8, fit: 84, rel: 93, cap: "60–300", feat: [[House, "Indoor"], [Car, "Parking"], [Accessibility, "Step-free"]], avail: "ok", reply: "Replies within 1 hour", img: "v-loft-sm.webp", pin: [56, 84], from: "£1,450" },
];
const SORTS = [["fit", "Best fit", Sparkles], ["near", "Nearest", Navigation], ["rel", "Reliability", ShieldCheck]] as const;
type SortKey = typeof SORTS[number][0];

export function Marketplace() {
  const [sort, setSort] = useState<SortKey>("fit");
  const [sel, setSel] = useState("riverside");
  const list = useMemo(() => [...VENUES].sort((a, b) => sort === "near" ? a.km - b.km : sort === "rel" ? b.rel - a.rel : b.fit - a.fit), [sort]);
  const order = list.map(v => v.name).join(", ");
  return <Scope className="gpl-mkt gp-panel" amount={0.15}>
    <header className="gpl-mkt-context" data-rv="fade">
      <img src={"/assets/preferences-party.webp"} alt="" width={96} height={64} loading="lazy" />
      <div><b>Birthday Party</b>
        <p><span><MapPin size={15} aria-hidden="true" />London</span><span><CalendarDays size={15} aria-hidden="true" />24 Jul</span><span><UsersRound size={15} aria-hidden="true" />120 guests</span><span><ListChecks size={15} aria-hidden="true" />Venue, DJ, Catering, Photographer, Security</span></p>
      </div>
      <DemoTag />
    </header>
    <div className="gpl-mkt-grid">
      <div className="gpl-mkt-map" data-rv="fade" style={vars({ "--d": 150 })}>
        <p className="gpl-mkt-cats" aria-hidden="true">{[[House, "Venues"], [UtensilsCrossed, "Catering"], [Music2, "Entertainment"], [Camera, "Photo & Video"], [UsersRound, "Staffing"], [Star, "Extras"]].map(([I, l], i) => { const Icon = I as typeof House; return <span key={l as string} className={cx(i === 0 && "is-on")}><Icon size={16} />{l as string}</span>; })}</p>
        <div className="gpl-map" aria-hidden="true">
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
            <rect width="400" height="300" fill="#f3f6f9" />
            {[[40, 40, 80, 50], [150, 20, 70, 60], [270, 30, 90, 48], [30, 150, 70, 60], [300, 150, 80, 70], [120, 230, 90, 50], [250, 240, 100, 45]].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="10" fill="#e9eef3" />)}
            <path d="M0 210 C 60 190, 90 160, 150 170 S 240 210, 290 170 S 360 110, 400 120" fill="none" stroke="#cfe0f5" strokeWidth="16" strokeLinecap="round" />
            {["M0 90 H400", "M0 250 H400", "M110 0 V300", "M230 0 V300", "M330 0 V300", "M0 30 L400 280"].map(d => <path key={d} d={d} stroke="#fff" strokeWidth="5" />)}
            <circle cx="208" cy="168" r="78" fill="rgba(36,87,230,.06)" stroke="rgba(36,87,230,.35)" strokeDasharray="4 5" />
            {[["CAMDEN", 120, 62], ["ISLINGTON", 222, 46], ["HACKNEY", 318, 60], ["NOTTING HILL", 52, 140], ["KENSINGTON", 70, 196], ["CITY", 236, 150], ["BRIXTON", 210, 272], ["GREENWICH", 340, 214]].map(([t, x, y]) => <text key={t as string} x={x as number} y={y as number} fontSize="9" letterSpacing="1.5" fill="#7b8598" fontWeight="600">{t}</text>)}
          </svg>
          {VENUES.map(v => <span key={v.key} className={cx("gpl-pin", sel === v.key && "is-on")} style={{ left: `${v.pin[0]}%`, top: `${v.pin[1]}%` }}><MapPin size={26} /><b>{v.name}<small>From {v.from} · {v.km} km</small></b></span>)}
          <p className="gpl-map-legend"><span><i className="is-on" />Selected</span><span><i />Other options</span><span><i className="is-area" />Event area</span></p>
        </div>
        <ul className="gpl-mkt-chips" aria-hidden="true">{list.map(v => <li key={v.key} className={cx(sel === v.key && "is-on")}><MapPin size={14} />{v.area} · {v.km} km</li>)}</ul>
      </div>
      <div className="gpl-mkt-list" data-rv="fade" style={vars({ "--d": 250 })}>
        <div className="gpl-mkt-list-h"><h3>Recommended venues</h3><small>Matched to this event</small></div>
        <div className="gp-pills" role="group" aria-label="Rank venues by">
          {SORTS.map(([k, l, I]) => <button key={k} type="button" className="gp-pill" aria-pressed={sort === k} onClick={() => { setSort(k); trackPublic("section_interaction", "landing", `market_sort_${k}`); }}><I size={16} aria-hidden="true" />{l}</button>)}
        </div>
        <p className="gp-sr" aria-live="polite">Ranked by {SORTS.find(s => s[0] === sort)![1].toLowerCase()}: {order}.</p>
        <ul className="gpl-mkt-rows">
          {list.map((v, n) => <motion.li layout transition={{ type: "spring", stiffness: 380, damping: 36 }} key={v.key} className={cx("gpl-mkt-row", sel === v.key && "is-on")}>
            <button type="button" aria-pressed={sel === v.key} onClick={() => setSel(v.key)}>
              <img src={ph(v.img)} alt="" width={104} height={72} loading="lazy" />
              <span className="gpl-mkt-main"><b>{v.name}{n === 0 && <span className="gp-chip is-info">{SORTS.find(s => s[0] === sort)![1]}</span>}</b>
                <small><MapPin size={13} aria-hidden="true" />{v.area}, London · {v.km} km from the event</small>
                <span className="gpl-mkt-feat"><span><UsersRound size={14} aria-hidden="true" />{v.cap}</span>{v.feat.map(([I, t]) => <span key={t}><I size={14} aria-hidden="true" />{t}</span>)}</span>
              </span>
              <span className="gpl-mkt-side">
                <span className={`gp-state is-${v.avail}`}><BadgeCheck size={14} aria-hidden="true" />{v.avail === "ok" ? "Available on 24 Jul" : "Limited availability"}</span>
                <span className="gp-state is-plain"><Zap size={14} aria-hidden="true" />{v.reply}</span>
                <span className="gpl-mkt-scores"><em>{v.fit}% fit</em><em>{v.rel}% reliable</em></span>
              </span>
            </button>
          </motion.li>)}
        </ul>
      </div>
    </div>
  </Scope>;
}
