"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, CalendarDays, ChevronDown, Clock3, Coins, House, ListChecks, MapPin, Navigation, ShieldCheck, Sparkles, UsersRound, Zap } from "lucide-react";
import { cx, DemoTag, ph, vars } from "../ui";
import { Scope } from "../motion";
import { trackPublic } from "../track";

/** 3.3 Source With Context — a request summary, three venue candidates compared on fit, availability, capacity, reliability, quote
 *  and response time, re-ranked with a layout animation; a conditional hold is a state, never a payment. Then the supplier shortlist. */
type V = { key: string; name: string; area: string; tags: string[]; fit: number; fitLabel: string; avail: "ok" | "wait"; cap: string; capNote: string; rel: number; quote: number; reply: string; replyH: number; km: number; img: string; more: [string, string][] };
const VENUES: V[] = [
  { key: "riverside", name: "Riverside Hall", area: "Southwark", tags: ["Indoor", "Bar area"], fit: 96, fitLabel: "Excellent fit", avail: "ok", cap: "50 – 250", capNote: "Ideal for your event", rel: 98, quote: 1200, reply: "Replies within 1 hour", replyH: 1, km: 3.2, img: "v-grand-hall.webp", more: [["Includes", "Tables, chairs, PA, in-house bar team"], ["Access", "From 16:00 · step-free · lift"]] },
  { key: "loft", name: "The Loft", area: "Brixton", tags: ["Indoor", "Rooftop"], fit: 88, fitLabel: "Great fit", avail: "ok", cap: "60 – 300", capNote: "Good match", rel: 95, quote: 1450, reply: "Replies within 2 hours", replyH: 2, km: 7.8, img: "v-loft-sm.webp", more: [["Includes", "Rooftop terrace, sound system"], ["Access", "From 17:00 · stairs to terrace"]] },
  { key: "garden", name: "Garden Rooms", area: "Kensington", tags: ["Indoor", "Garden"], fit: 82, fitLabel: "Good fit", avail: "wait", cap: "40 – 200", capNote: "Suitable", rel: 99, quote: 950, reply: "Replies within 3 hours", replyH: 3, km: 6.1, img: "v-oakwood.webp", more: [["Includes", "Garden marquee option"], ["Access", "From 15:00 · step-free"]] },
];
const SORTS = [["fit", "Best fit", Sparkles], ["cost", "Lowest cost", Coins], ["rel", "Highest reliability", ShieldCheck], ["near", "Nearest", Navigation]] as const;
type S = typeof SORTS[number][0];
const SUPPLIERS: [string, string, "Primary" | "Backup" | "Emergency", string, string][] = [
  ["DJ SoundWave", "Professional DJ", "Primary", "£650", "s-dj-marcus.webp"], ["Gourmet Kitchen", "Catering", "Backup", "£28 pp", "s-gourmet.webp"],
  ["Lens & Light", "Photographer", "Primary", "£450", "s-snapshot.webp"], ["Secure Events", "Security", "Backup", "£300", "s-elite-security.webp"], ["The Mobile Bar Co.", "Mobile bar", "Emergency", "£500", "bc-riverside-bars.webp"],
];

export function Procurement() {
  const [sort, setSort] = useState<S>("fit");
  const [open, setOpen] = useState<string | null>("riverside");
  const [held, setHeld] = useState<Record<string, boolean>>({});
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const list = useMemo(() => [...VENUES].sort((a, b) => sort === "cost" ? a.quote - b.quote : sort === "rel" ? b.rel - a.rel : sort === "near" ? a.km - b.km : b.fit - a.fit), [sort]);
  const label = SORTS.find(s => s[0] === sort)![1];
  return <Scope className="gpo-proc" amount={0.1}>
    <div className="gpo-req gp-card" data-rv="fade">
      <img src={"/assets/preferences-party.webp"} alt="" width={96} height={64} loading="lazy" />
      <div><b>Maya’s 30th Birthday</b>
        <p>{[[CalendarDays, "24 Jul"], [MapPin, "London"], [UsersRound, "120 guests"], [House, "Indoor"], [Clock3, "18:00 – 01:00"], [ListChecks, "Venue, DJ, Catering, Photographer, Security"]].map(([I, t]) => { const Icon = I as typeof House; return <span key={t as string}><Icon size={16} aria-hidden="true" />{t as string}</span>; })}</p></div>
      <DemoTag />
    </div>
    <div className="gpo-cmp gp-panel" data-rv="rise" style={vars({ "--d": 120 })}>
      <div className="gpo-cmp-h">
        <div><h3>Venue comparison</h3><p>Compare the strongest venues for this event on fit, availability, capacity and more.</p></div>
        <div className="gp-pills" role="group" aria-label="Rank venues by">
          {SORTS.map(([k, l, I]) => <button key={k} type="button" className="gp-pill" aria-pressed={sort === k} onClick={() => { setSort(k); trackPublic("section_interaction", "organisers", `procure_${k}`); }}><I size={16} aria-hidden="true" />{l}</button>)}
        </div>
      </div>
      <p className="gp-sr" aria-live="polite">Ranked by {label.toLowerCase()}: {list.map(v => v.name).join(", ")}.</p>
      <table className="gpo-table">
        <thead><tr><th scope="col">Venue</th><th scope="col">Fit</th><th scope="col">Availability</th><th scope="col">Capacity</th><th scope="col">Reliability</th><th scope="col">Quote (from)</th><th scope="col">Response</th><th scope="col"><span className="gp-sr">Actions</span></th></tr></thead>
        <tbody>{list.map((v, n) => <Fragment key={v.key}>
          <motion.tr layout="position" transition={{ type: "spring", stiffness: 360, damping: 34 }} className={cx("gpo-tr", open === v.key && "is-open", n === 0 && "is-top")}>
            <th scope="row"><button type="button" className="gpo-vname" aria-expanded={open === v.key} onClick={() => setOpen(open === v.key ? null : v.key)}>
              <img src={ph(v.img)} alt="" width={96} height={64} loading="lazy" />
              <span><b>{v.name}{n === 0 && <span className="gp-chip is-info">{label}</span>}</b><small><MapPin size={13} aria-hidden="true" />{v.area}, London</small><span className="gpo-vtags">{v.tags.map(t => <em key={t}>{t}</em>)}</span></span>
              <ChevronDown size={16} className="gpo-chev" aria-hidden="true" />
            </button></th>
            <td><span className="gpo-fit"><span className={cx("gp-ring", v.fit > 85 && "is-ok")} style={vars({ "--p": v.fit, "--s": "50px" })}><b>{v.fit}%</b></span><span><b>{v.fitLabel}</b><small>Matches the brief</small></span></span></td>
            <td><span className={`gp-state is-${v.avail}`}><BadgeCheck size={15} aria-hidden="true" />{v.avail === "ok" ? "Available" : "Limited"}</span><small className="gpo-sub">24 Jul</small></td>
            <td><b className="gpo-num">{v.cap}</b><small className="gpo-sub">{v.capNote}</small></td>
            <td><span className="gp-state is-ok"><ShieldCheck size={15} aria-hidden="true" />Verified venue</span><small className="gpo-sub">{v.rel}% on-time record</small></td>
            <td><b className="gpo-num">£{v.quote.toLocaleString("en-GB")}</b><small className="gpo-sub">From</small></td>
            <td><span className="gpo-reply"><Zap size={16} aria-hidden="true" />{v.reply}</span></td>
            <td className="gpo-acts">
              <button type="button" className={cx("gp-btn gp-btn--xs", asked[v.key] ? "gp-btn--ghost" : "gp-btn--primary")} aria-pressed={!!asked[v.key]} onClick={() => setAsked(a => ({ ...a, [v.key]: !a[v.key] }))}><Zap size={14} aria-hidden="true" />{asked[v.key] ? "Quote requested" : "Request quote"}</button>
              <button type="button" className={cx("gp-btn gp-btn--xs gp-btn--ghost", held[v.key] && "is-held")} aria-pressed={!!held[v.key]} onClick={() => setHeld(h => ({ ...h, [v.key]: !h[v.key] }))}><CalendarClock size={14} aria-hidden="true" />{held[v.key] ? "Held until Fri 17:00" : "Conditional hold"}</button>
            </td>
          </motion.tr>
          {open === v.key && <tr className="gpo-more"><td colSpan={8}><dl>{v.more.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}<div><dt>Hold</dt><dd>{held[v.key] ? "Held for this date — nothing is charged; the hold expires automatically." : "A conditional hold reserves the date while dependencies settle. It is a state, not a payment."}</dd></div></dl></td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>
    <div className="gpo-short" data-rv="rise" style={vars({ "--d": 240 })}>
      <div className="gpo-short-h"><div><h3>Supplier shortlist</h3><p>Selected and recommended suppliers, with backups to keep the event protected.</p></div></div>
      <ul>{SUPPLIERS.map(([n, c, role, price, img]) => <li key={n} className="gp-card">
        <span className={`gp-chip ${role === "Primary" ? "is-ok" : role === "Backup" ? "is-info" : "is-crit"}`}>{role}</span>
        <span className="gpo-short-id"><img src={ph(img)} alt="" width={64} height={56} loading="lazy" /><span><b>{n}</b><small>{c}</small></span></span>
        <span className="gpo-short-f"><span className="gp-state is-ok"><BadgeCheck size={14} aria-hidden="true" />Available 24 Jul</span><span><b>{price}</b><small>From</small></span></span>
      </li>)}</ul>
    </div>
  </Scope>;
}
