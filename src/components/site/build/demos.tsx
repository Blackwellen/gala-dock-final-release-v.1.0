"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useCallback, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  ArrowDown, ArrowRight, BadgeCheck, Baby, Briefcase, Cake, Camera, CircleCheck, Clock3, Heart, House, Lock, Mic2,
  Music2, PartyPopper, Plus, RotateCcw, ShieldCheck, Sparkles, Theater, Trash2, UsersRound, UtensilsCrossed, Zap, type LucideIcon, CalendarDays, Hourglass,
} from "lucide-react";
import { HREF } from "@/lib/public/site";
import { TLink } from "../tracked-link";
import { Count, Scope, useActivated } from "../motion";
import { Pressed, Sheet } from "../controls";
import { cx, DemoTag, ph, pounds, vars } from "../ui";
import { trackPublic } from "../track";

const S = "build_an_event";

/* ── 5.1 EventBuildPreview ─────────────────────────────────────────────────────────────────────────────────────────────── */
const PREVIEW: [string, string, string, string][] = [["Hall", "Grand Hall", "v-grand-hall.webp", "Confirmed"], ["DJ", "SoundWave", "s-dj-marcus.webp", "Held"], ["Catering", "Taste & Co", "s-gourmet.webp", "Confirmed"], ["Photographer", "Lens & Light", "s-snapshot.webp", "Requested"], ["Mobile bar", "Riverside Bars", "bc-riverside-bars.webp", "Requested"]];
export function BuildPreview() {
  return <Scope className="gpb-preview" amount={0.2}>
    <svg className="gpb-preview-lines" viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true">
      {["M250 200 C 220 170, 180 120, 150 82", "M350 200 C 380 170, 420 120, 452 82", "M232 240 C 190 250, 170 300, 150 322", "M368 240 C 410 250, 430 300, 450 322", "M300 290 C 300 340, 300 370, 300 404"].map((d, i) => <path key={d} d={d} className="gp-draw" pathLength={1} style={vars({ "--d": 500 + i * 220 })} />)}
    </svg>
    <div className="gpb-preview-core" data-rv="pop">
      <span className="gpb-preview-ic"><Cake size={26} aria-hidden="true" /></span>
      <b>Maya’s 30th Birthday</b><small>Sat 24 Jul · Shoreditch · 80 guests</small>
    </div>
    <ul aria-label="Example plan">{PREVIEW.map(([k, n, img, s], i) => <li key={k} className={`gpb-pc is-${i}`} data-rv="spring" style={vars({ "--d": 650 + i * 220 })}>
      <img src={ph(img)} alt="" width={96} height={64} loading="lazy" /><span><small>{k}</small><b>{n}</b><span className={`gp-state is-${s === "Confirmed" ? "ok" : s === "Held" ? "wait" : "info"}`}>{s}</span></span>
    </li>)}</ul>
    <p className="gpb-preview-sum" data-rv="fade" style={vars({ "--d": 1900 })}><span><b>5 of 7</b> essentials covered</span><span className="gp-bar is-ok"><i style={{ width: "71%" }} /></span><span><b>£3,950</b> of £5,000 budget</span></p>
    <DemoTag className="gpb-preview-tag" />
  </Scope>;
}

/* ── 5.2 Event type mosaic ─────────────────────────────────────────────────────────────────────────────────────────────── */
type ET = { key: string; label: string; icon: LucideIcon; img?: string; size: "xl" | "l" | "m" | "s"; chain: string[] };
const TYPES: ET[] = [
  { key: "wedding", label: "Wedding", icon: Heart, img: "type-wedding.webp", size: "xl", chain: ["Venue", "Catering", "Photography", "Flowers", "Entertainment"] },
  { key: "birthday", label: "Birthday", icon: Cake, img: "type-birthday.webp", size: "l", chain: ["Venue", "Food & drink", "DJ", "Cake", "Decor"] },
  { key: "children", label: "Children’s party", icon: Baby, img: "type-childrens-party.webp", size: "m", chain: ["Venue", "Entertainer", "Activity", "Food", "Cake"] },
  { key: "private", label: "Private party", icon: PartyPopper, img: "type-party.webp", size: "m", chain: ["Venue", "Bar", "DJ", "Security", "Photography"] },
  { key: "corporate", label: "Corporate", icon: Briefcase, img: "type-corporate.webp", size: "l", chain: ["Venue", "AV & production", "Catering", "Staffing", "Photography"] },
  { key: "celebration", label: "Celebration", icon: Sparkles, img: "type-private-dinner.webp", size: "s", chain: ["Venue", "Catering", "Music", "Decor"] },
  { key: "conference", label: "Conference", icon: Mic2, size: "s", chain: ["Venue", "AV & production", "Registration", "Catering", "Staffing"] },
  { key: "show", label: "Show", icon: Theater, img: "type-nightclub.webp", size: "m", chain: ["Venue", "Sound & lighting", "Tickets", "Security", "Promotion"] },
  { key: "custom", label: "Something else", icon: Plus, size: "s", chain: ["Venue", "Add what the event needs"] },
];
export function EventTypes() {
  const [sel, setSel] = useState("wedding");
  const t = TYPES.find(x => x.key === sel)!;
  return <Scope className="gpb-types" amount={0.15}>
    <div className="gpb-mosaic" role="group" aria-label="What are you planning?">
      {TYPES.map((x, i) => { const I = x.icon; return <motion.button layout key={x.key} type="button" aria-pressed={sel === x.key} onClick={() => { setSel(x.key); trackPublic("section_interaction", S, `type_${x.key}`); }}
        className={cx("gpb-type", `is-${x.size}`, sel === x.key && "is-on", !x.img && "is-plain")} data-rv="pop" style={vars({ "--d": i * 60 })} transition={{ type: "spring", stiffness: 340, damping: 30 }}>
        {x.img && <img src={ph(x.img)} alt="" width={240} height={160} loading="lazy" />}
        <span className="gpb-type-l"><span className="gpb-type-ic"><I size={18} aria-hidden="true" /></span>{x.label}</span>
      </motion.button>; })}
    </div>
    <aside className="gpb-chain gp-card" aria-live="polite">
      <small>A {t.label.toLowerCase()} usually needs</small>
      <LayoutGroup id="gpb-chain"><ol>{t.chain.map((c, i) => <motion.li layout key={`${t.key}-${c}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .07 }}><span>{i + 1}</span>{c}</motion.li>)}</ol></LayoutGroup>
      <p>Gala Dock suggests these in order and adapts the plan as you add or remove pieces.</p>
      <TLink href={HREF.startBuilding} surface={S} variant={`type_start_${t.key}`} className="gp-btn gp-btn--primary gp-btn--sm">Start a {t.label.toLowerCase()} plan<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink>
    </aside>
  </Scope>;
}

/* ── 5.3 The event build canvas (signature) ────────────────────────────────────────────────────────────────────────────── */
type Cat = "venue" | "food" | "ent" | "photo" | "staff" | "extras";
type Lib = { key: string; cat: Cat; name: string; price: number; img: string };
const CATS: [Cat, string, LucideIcon][] = [["venue", "Venue", House], ["food", "Food & Drink", UtensilsCrossed], ["ent", "Entertainment", Music2], ["photo", "Photo & Video", Camera], ["staff", "Staffing", UsersRound], ["extras", "Extras", Sparkles]];
const LIBRARY: Lib[] = [
  { key: "hall", cat: "venue", name: "Grand Hall", price: 1800, img: "v-grand-hall.webp" }, { key: "rooftop", cat: "venue", name: "Skyline Rooftop", price: 2200, img: "v-skyline-rooftop.webp" },
  { key: "catering", cat: "food", name: "Catering · 80 guests", price: 1050, img: "s-gourmet.webp" }, { key: "bar", cat: "food", name: "Mobile bar", price: 500, img: "bc-riverside-bars.webp" },
  { key: "dj", cat: "ent", name: "DJ", price: 650, img: "s-dj-marcus.webp" }, { key: "band", cat: "ent", name: "Live sax", price: 420, img: "s-sax-groove.webp" },
  { key: "photo", cat: "photo", name: "Photographer", price: 450, img: "s-snapshot.webp" }, { key: "booth", cat: "photo", name: "Photo booth", price: 300, img: "s-sound-lighting.webp" },
  { key: "security", cat: "staff", name: "Security (2)", price: 360, img: "s-elite-security.webp" }, { key: "decor", cat: "extras", name: "Decor & styling", price: 320, img: "s-elegant-decor.webp" },
];
type Placed = { key: string; status: "confirmed" | "pending" };
const INITIAL: Placed[] = [{ key: "hall", status: "confirmed" }, { key: "catering", status: "confirmed" }, { key: "photo", status: "pending" }, { key: "bar", status: "pending" }];
const REQUIRED: Cat[] = ["venue", "food", "ent", "photo"];
const BUDGET = 5000;

export function BuildCanvasSignature() {
  const [plan, setPlan] = useState<Placed[]>(INITIAL);
  const [cat, setCat] = useState<Cat>("ent");
  const [msg, setMsg] = useState("");
  const [sheet, setSheet] = useState(false);
  const [over, setOver] = useState(false);
  const drop = useRef<HTMLDivElement>(null);
  const item = (k: string) => LIBRARY.find(l => l.key === k)!;
  const confirmed = plan.filter(p => p.status === "confirmed").reduce((n, p) => n + item(p.key).price, 0);
  const pending = plan.filter(p => p.status === "pending").reduce((n, p) => n + item(p.key).price, 0);
  const covered = REQUIRED.filter(c => plan.some(p => item(p.key).cat === c)).length;
  const ready = Math.round(covered / REQUIRED.length * 100);
  const add = useCallback((k: string) => {
    setPlan(p => p.some(x => x.key === k) ? p : [...p, { key: k, status: "pending" }]);
    const it = LIBRARY.find(l => l.key === k)!;
    setMsg(`${it.name} added as requested. ${pounds(it.price)} pending.`);
    trackPublic("section_interaction", S, `canvas_add_${k}`);
  }, []);
  const remove = (k: string) => { setPlan(p => p.filter(x => x.key !== k)); setMsg(`${item(k).name} removed from the plan.`); };
  // Hit-test with the pointer's viewport position (independent of page scroll and of the display-scale zoom).
  const inDrop = (e: MouseEvent | TouchEvent | PointerEvent) => { const p = "changedTouches" in e ? e.changedTouches[0] : e; return !!p && document.elementsFromPoint(p.clientX, p.clientY).some(el => drop.current?.contains(el)); };
  const lib = LIBRARY.filter(l => l.cat === cat);
  const library = (drag: boolean) => <>
    <div className="gpb-lib-cats" role="group" aria-label="Category">{CATS.map(([k, l, I]) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={cx("gpb-lib-cat", cat === k && "is-on")}><I size={17} aria-hidden="true" />{l}</button>)}</div>
    <ul className="gpb-lib-items">{lib.map(l => { const placed = plan.some(p => p.key === l.key); return <li key={l.key}>
      <motion.div className={cx("gpb-lib-card", placed && "is-placed")} drag={drag && !placed} dragSnapToOrigin dragMomentum={false} whileDrag={{ scale: 1.04, zIndex: 20, boxShadow: "0 20px 40px -16px rgba(20,40,110,.4)" }}
        onDrag={e => setOver(inDrop(e))}
        onDragEnd={e => { setOver(false); if (inDrop(e)) add(l.key); }}>
        <img src={ph(l.img)} alt="" width={56} height={44} loading="lazy" draggable={false} /><span><b>{l.name}</b><small>{pounds(l.price)}</small></span>
      </motion.div>
      <button type="button" className="gpb-lib-add" disabled={placed} onClick={() => { add(l.key); setSheet(false); }} aria-label={placed ? `${l.name} is in the plan` : `Add ${l.name} to the plan`}>{placed ? <CircleCheck size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</button>
    </li>; })}</ul>
  </>;
  return <div className="gpb-canvas-wrap">
    <aside className="gpb-lib gp-card" aria-label="Category library"><p className="gpb-lib-h">Add to the event</p><p className="gpb-lib-hint">Drag onto the plan, or use +</p>{library(true)}</aside>
    <section ref={drop} className={cx("gpb-canvas gp-panel", over && "is-over")} aria-label="Event plan canvas">
      <header><div><b>Maya’s 30th Birthday</b><small>Sat 24 Jul · 80 guests</small></div><DemoTag /></header>
      <LayoutGroup id="gpb-plan"><ul className="gpb-plan">
        <AnimatePresence initial={false}>{plan.map(p => { const it = item(p.key); const CI = CATS.find(c => c[0] === it.cat)![2]; return <motion.li layout key={p.key} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} className={cx("gpb-plan-card", p.status === "confirmed" && "is-ok")}>
          <img src={ph(it.img)} alt="" width={72} height={56} loading="lazy" />
          <span><small><CI size={13} aria-hidden="true" />{CATS.find(c => c[0] === it.cat)![1]}</small><b>{it.name}</b><span className={`gp-state is-${p.status === "confirmed" ? "ok" : "wait"}`}>{p.status === "confirmed" ? <CircleCheck size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}{p.status === "confirmed" ? "Confirmed" : "Requested"}</span></span>
          <em>{pounds(it.price)}</em>
          {p.status === "pending" && <button type="button" className="gpb-plan-rm" onClick={() => remove(p.key)} aria-label={`Remove ${it.name}`}><Trash2 size={16} aria-hidden="true" /></button>}
        </motion.li>; })}</AnimatePresence>
        <li className="gpb-drop" aria-hidden="true"><Plus size={20} />Drop here to add</li>
      </ul></LayoutGroup>
      <button type="button" className="gp-btn gp-btn--primary gpb-sheet-btn" onClick={() => setSheet(true)} aria-haspopup="dialog"><Plus size={18} aria-hidden="true" />Add to the plan</button>
      <p className="gp-sr" role="status" aria-live="polite">{msg}</p>
    </section>
    <aside className="gpb-rail gp-card" aria-label="Budget and readiness">
      <div className="gpb-rail-ready"><span className="gp-ring is-ok" style={vars({ "--p": ready, "--s": "92px" })}><b><Count value={ready} format={n => `${Math.round(n)}%`} /></b></span><span><b>Readiness</b><small>{covered} of {REQUIRED.length} essentials covered</small></span></div>
      <dl>
        <div><dt>Budget</dt><dd>{pounds(BUDGET)}</dd></div>
        <div className="is-ok"><dt><i />Confirmed</dt><dd><Count value={confirmed} format={pounds} /></dd></div>
        <div className="is-wait"><dt><i />Pending</dt><dd><Count value={pending} format={pounds} /></dd></div>
        <div className={cx("is-total", BUDGET - confirmed - pending < 0 && "is-over")}><dt>Remaining</dt><dd><Count value={BUDGET - confirmed - pending} format={n => (n < 0 ? "−" : "") + pounds(Math.abs(n))} /></dd></div>
      </dl>
      <button type="button" className="gp-link gpb-reset" onClick={() => { setPlan(INITIAL); setMsg("Example reset."); }}><RotateCcw size={15} aria-hidden="true" />Reset example</button>
      <TLink href={HREF.startBuilding} surface={S} variant="canvas_start" className="gp-btn gp-btn--primary gp-btn--sm">Start with this kind of plan<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink>
    </aside>
    <Sheet open={sheet} onClose={() => setSheet(false)} label="Add to the plan" className="gpb-lib-sheet"><p className="gpb-lib-h">Add to the event</p>{library(false)}</Sheet>
  </div>;
}

/* ── 5.4 Dependencies ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const DEP_STEPS = ["Venue requested; DJ and caterer provisionally held", "Venue confirmed — the booking window opens", "DJ and caterer confirmed"] as const;
export function Dependencies() {
  const [step, setStep] = useState(0);
  const st = (n: "venue" | "dj" | "cat") => n === "venue" ? (step === 0 ? "requested" : "confirmed") : step === 0 ? "held" : step === 1 ? "ready" : "confirmed";
  const L: Record<string, [string, string]> = { requested: ["Requested", "info"], held: ["Held · 48 h", "wait"], ready: ["Ready to confirm", "info"], confirmed: ["Confirmed", "ok"] };
  const node = (k: "venue" | "dj" | "cat", title: string, I: LucideIcon) => { const s = st(k); return <div className={cx("gpb-dep-node", `is-${s}`)}>
    <span className="gpb-dep-ic"><I size={22} aria-hidden="true" /></span><b>{title}</b><span className={`gp-chip is-${L[s]![1]}`}>{s === "held" ? <Lock size={12} aria-hidden="true" /> : null}{L[s]![0]}</span></div>; };
  return <Scope className="gpb-dep" amount={0.25}>
    <div className="gpb-dep-diagram gp-panel">
      <svg viewBox="0 0 900 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M180 150 C 260 150, 300 150, 360 150" className="gp-draw" pathLength={1} style={vars({ "--d": 200 })} />
        <path d="M540 150 C 600 150, 640 80, 720 80" className={cx("gp-draw", step > 0 && "is-live")} pathLength={1} style={vars({ "--d": 600 })} />
        <path d="M540 150 C 600 150, 640 220, 720 220" className={cx("gp-draw", step > 0 && "is-live")} pathLength={1} style={vars({ "--d": 750 })} />
      </svg>
      <div className="gpb-dep-col is-a" data-rv="fade">{node("venue", "Venue", House)}</div>
      <div className="gpb-dep-col is-b" data-rv="fade" style={vars({ "--d": 300 })}><div className={cx("gpb-dep-gate", step > 0 && "is-open")}><ShieldCheck size={22} aria-hidden="true" /><b>Venue confirms</b><small>{step > 0 ? "Booking window open" : "Checkpoint"}</small></div></div>
      <div className="gpb-dep-col is-c" data-rv="fade" style={vars({ "--d": 500 })}>{node("dj", "DJ", Music2)}{node("cat", "Caterer", UtensilsCrossed)}</div>
    </div>
    <div className="gpb-dep-ctl">
      <ol className="gpb-dep-seq" aria-label="Booking order">{DEP_STEPS.map((s, i) => <li key={s} className={cx(i < step && "is-done", i === step && "is-on")}><span>{i + 1}</span>{s}</li>)}</ol>
      <p className="gp-sr" aria-live="polite">{DEP_STEPS[step]}</p>
      <div className="gpb-dep-btns">
        {step < 2 ? <button type="button" className="gp-btn gp-btn--primary gp-btn--sm" onClick={() => { setStep(step + 1); trackPublic("section_interaction", S, `deps_${step + 1}`); }}>{step === 0 ? "Confirm the venue" : "Confirm the held suppliers"}<ArrowRight size={17} aria-hidden="true" /></button>
          : <button type="button" className="gp-btn gp-btn--ghost gp-btn--sm" onClick={() => setStep(0)}><RotateCcw size={16} aria-hidden="true" />Replay</button>}
      </div>
      <p className="gpb-dep-legend"><span><i className="is-info" />Requested</span><span><i className="is-wait" />Held</span><span><i className="is-ok" />Confirmed</span></p>
    </div>
  </Scope>;
}

/* ── 5.5 Emergency availability ────────────────────────────────────────────────────────────────────────────────────────── */
const EMERGENCY: Record<string, { n: number; cards: [string, string, string, string][]; fallback: string }> = {
  DJ: { n: 7, cards: [["Pulse Sound", "DJ · 4 miles away", "s-dj-marcus.webp", "Responds within 30 min"], ["Night Shift DJs", "DJ & sound · 6 miles", "s-sound-lighting.webp", "Responds within 45 min"], ["Groove Collective", "DJ · 9 miles", "s-sax-groove.webp", "Responds within 1 hour"]], fallback: "Short on DJs? Sound & lighting hire with a playlist works too." },
  Photographer: { n: 5, cards: [["Lens & Light", "Photographer · 3 miles", "s-snapshot.webp", "Responds within 30 min"], ["Frame Studio", "Photo & video · 7 miles", "s-elegant-decor.webp", "Responds within 1 hour"], ["Moments Co.", "Photographer · 11 miles", "s-sound-lighting.webp", "Responds within 1 hour"]], fallback: "No photographer free? A photo booth covers the party." },
  Security: { n: 4, cards: [["Secure Events", "Door supervisors · 2 miles", "s-elite-security.webp", "Responds within 20 min"], ["Gatekeepers", "Security team · 8 miles", "s-elite-security.webp", "Responds within 45 min"], ["Shield Crew", "Event security · 10 miles", "s-elite-security.webp", "Responds within 1 hour"]], fallback: "Smaller event? Two stewards may be enough." },
};
export function Emergency() {
  const [what, setWhat] = useState("DJ"), [where, setWhere] = useState("Birmingham"), [when, setWhen] = useState("Tomorrow");
  const [done, setDone] = useState<null | { what: string; where: string; when: string }>(null);
  const submit = (e: FormEvent) => { e.preventDefault(); setDone({ what, where, when }); trackPublic("section_interaction", S, `emergency_${what}`); };
  const r = done ? EMERGENCY[done.what]! : null;
  return <div className="gpb-emg">
    <form className={cx("gpb-emg-form gp-panel", done && "is-done")} onSubmit={submit} aria-label="Find providers who can respond quickly (example)">
      <p className="gpb-emg-h"><Zap size={20} aria-hidden="true" />Need it fast?</p>
      <label><span>What do you need?</span><select value={what} onChange={e => setWhat(e.target.value)}>{Object.keys(EMERGENCY).map(k => <option key={k}>{k}</option>)}</select></label>
      <label><span>Where?</span><select value={where} onChange={e => setWhere(e.target.value)}>{["Birmingham", "London", "Manchester", "Leeds"].map(k => <option key={k}>{k}</option>)}</select></label>
      <label><span>When?</span><select value={when} onChange={e => setWhen(e.target.value)}>{["Tomorrow", "This weekend", "Tonight"].map(k => <option key={k}>{k}</option>)}</select></label>
      <button type="submit" className="gp-btn gp-btn--primary">Show example results<ArrowRight size={18} aria-hidden="true" /></button>
      <p className="gpb-emg-note">An illustration — nothing is searched or booked from this page.</p>
    </form>
    <div className="gpb-emg-res" aria-live="polite">
      {r && done ? <>
        <p className="gpb-emg-count"><b>Example:</b> {r.n} {done.what.toLowerCase()}s marked available at short notice near {done.where}, {done.when.toLowerCase()}.</p>
        <ul>{r.cards.map(([n, s, img, t], i) => <motion.li key={`${done.what}-${n}`} className="gp-card" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .06, type: "spring", stiffness: 420, damping: 32 }}>
          <img src={ph(img)} alt="" width={72} height={56} loading="lazy" /><span><b>{n}</b><small>{s}</small><span className="gpb-emg-tags"><span className="gp-state is-ok"><CircleCheck size={14} aria-hidden="true" />Available</span><span className="gp-state is-wait"><Zap size={14} aria-hidden="true" />{t}</span><span className="gp-state is-info"><BadgeCheck size={14} aria-hidden="true" />Verified</span></span></span>
        </motion.li>)}</ul>
        <p className="gpb-emg-fall"><Sparkles size={16} aria-hidden="true" />{r.fallback}</p>
      </> : <div className="gpb-emg-empty"><Hourglass size={26} aria-hidden="true" /><p>Choose what you need and press <b>Show example results</b>.</p></div>}
    </div>
  </div>;
}

/* ── 5.7 Payments and backups ──────────────────────────────────────────────────────────────────────────────────────────── */
type Phase = "before" | "after";
const BOOKINGS: { key: string; title: string; who: string; img: string; state: Record<Phase, [string, "ok" | "wait" | "info" | "plain"]>; pay: Record<Phase, string> }[] = [
  { key: "venue", title: "Venue", who: "Grand Hall", img: "v-grand-hall.webp", state: { before: ["Confirmed", "ok"], after: ["Completed", "ok"] }, pay: { before: "Deposit paid · balance due before the event", after: "Paid · payout released after the event" } },
  { key: "dj", title: "DJ", who: "SoundWave", img: "s-dj-marcus.webp", state: { before: ["Confirmed", "ok"], after: ["Completed", "ok"] }, pay: { before: "Due when the booking is charged", after: "Paid · payout released after the event" } },
  { key: "photo", title: "Photographer", who: "Lens & Light · backup: Frame Studio", img: "s-snapshot.webp", state: { before: ["Primary + backup", "info"], after: ["Replacement used", "wait"] }, pay: { before: "Backup on standby · nothing charged", after: "Backup booked · refund eligible for the primary" } },
  { key: "catering", title: "Catering", who: "Taste & Co", img: "s-gourmet.webp", state: { before: ["Awaiting confirmation", "wait"], after: ["Completed", "ok"] }, pay: { before: "Nothing charged until confirmed", after: "Paid · payout released after the event" } },
];
export function Backups() {
  const [phase, setPhase] = useState<Phase>("before");
  const [ref, on] = useActivated<HTMLDivElement>(0.3);
  return <div ref={ref} className="gpb-backups">
    <Pressed idBase="gpb-phase" label="Show booking states" value={phase} onChange={k => { setPhase(k); trackPublic("section_interaction", S, `backups_${k}`); }} items={[{ key: "before", label: "Before the event" }, { key: "after", label: "After the event" }]} className="gpb-phase" />
    <ul className="gpb-bk">{BOOKINGS.map((b, i) => { const [label, tone] = b.state[phase]; return <li key={b.key} className={cx("gpb-bk-card gp-card", `is-${b.key}`, `is-${tone}`)} style={vars({ "--d": i * 120 })}>
      <img src={ph(b.img)} alt="" width={64} height={56} loading="lazy" />
      <span className="gpb-bk-t"><small>{b.title}</small><b>{b.who}</b></span>
      <AnimatePresence mode="wait" initial={false}><motion.span key={phase} className="gpb-bk-s" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
        <span className={`gp-state is-${tone}`}>{tone === "ok" ? <CircleCheck size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}{label}</span><small>{b.pay[phase]}</small>
      </motion.span></AnimatePresence>
    </li>; })}</ul>
    <svg className={cx("gpb-bk-link", on && "is-on")} viewBox="0 0 40 120" aria-hidden="true"><path d="M20 0 C 36 30, 36 90, 20 120" pathLength={1} /></svg>
  </div>;
}

/* ── 5.8 Build → event-day plan ────────────────────────────────────────────────────────────────────────────────────────── */
const DAY: [string, string, string, string][] = [["venue", "17:00", "Venue access", "v-grand-hall.webp"], ["catering", "18:00", "Catering", "s-gourmet.webp"], ["guests", "19:00", "Guests arrive", "ev-neon-c.webp"], ["dj", "20:00", "DJ", "s-dj-marcus.webp"], ["photo", "20:30", "Photographer", "s-snapshot.webp"]];
export function BuildToPlan() {
  const [ref, on] = useActivated<HTMLDivElement>(0.45);
  const [manual, setManual] = useState<boolean | null>(null);
  const planned = manual ?? on;
  const card = (k: string, t: string, img: string) => <motion.span layoutId={`gpb-m-${k}`} className="gpb-m-card" transition={{ type: "spring", stiffness: 260, damping: 30 }}><img src={ph(img)} alt="" width={48} height={40} loading="lazy" /><b>{t}</b></motion.span>;
  return <div ref={ref} className="gpb-morph">
    <LayoutGroup id="gpb-morph">
      <div className="gpb-m-stage gp-panel" aria-label="What you chose">
        <p className="gpb-m-h"><Sparkles size={18} aria-hidden="true" />Your build</p>
        <ul className="gpb-m-build">{DAY.filter(d => d[0] !== "guests").map(([k, , t, img]) => <li key={k}>{!planned ? card(k, t, img) : <span className="gpb-m-ghost">{t}</span>}</li>)}</ul>
      </div>
      <div className="gpb-m-arrow" aria-hidden="true"><svg viewBox="0 0 120 40"><path d="M4 20 C 40 4, 80 36, 112 20" className={cx(planned && "is-on")} pathLength={1} /></svg><ArrowRight size={22} className="gpb-m-arrow-r" /><ArrowDown size={22} className="gpb-m-arrow-d" /></div>
      <div className="gpb-m-stage gp-panel" aria-label="Event-day timeline">
        <p className="gpb-m-h"><CalendarDays size={18} aria-hidden="true" />Sat 24 Jul · event day</p>
        <ol className="gpb-m-day">{DAY.map(([k, time, t, img]) => <li key={k}><time>{time}</time>{k === "guests" ? <span className="gpb-m-card is-static"><UsersRound size={18} aria-hidden="true" /><b>{t}</b></span> : planned ? card(k, t, img) : <span className="gpb-m-slot">{t}</span>}</li>)}</ol>
      </div>
    </LayoutGroup>
    <button type="button" className="gp-link gpb-m-toggle" onClick={() => setManual(!planned)}>{planned ? "Show the build again" : "Turn the build into the plan"}</button>
  </div>;
}

