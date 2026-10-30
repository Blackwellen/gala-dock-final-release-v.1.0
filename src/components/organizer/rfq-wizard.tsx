"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Star, MapPin, CalendarDays, List, Map as MapIcon, SlidersHorizontal, Info, Sparkles, RefreshCw, Mail, Phone, X, ArrowUpDown, Zap, Check, Building2, UtensilsCrossed, Music, AudioLines, Users, MoreHorizontal, Clock, Pencil, Send, type LucideIcon } from "lucide-react";
import { useAction, useKitToast, Toggle } from "@/components/kit/client";
import { RequestAttachments } from "@/components/shared/request-attachments";
import { sendRequest } from "@/lib/actions/marketplace";
import { buildCategoryOf, labelOf } from "@/lib/master-data";

/* ORG-W04 four-step request: 1 Requirement · 2 Specifications · 3 Suppliers · 4 Review & send.
   The draft (requirement + specifications) and the supplier strategy autosave on this device per workspace/user, so a reload
   resumes where the organizer left off. Nothing is sent until the explicit "Send request" on step 4. */
export type Candidate = { id: string; name: string; image: string; rating: number; reviews: number; category: string; badge: string | null; fit: number; avail: string; availLabel: string; priceGuide: string; priceBasis: string; distance: string; response: number; emergency: boolean; reliability: string; events: number };
type Draft = { event_id: string; category: string; title: string; scope: string; budget_min: string; budget_max: string; budget_type: string; date: string; time: string; setup: string; location: string; capacity: string; capacity_range: string; credentials: string; deadline: string; respond_by: string; checklist: string[]; checklist_other: string; questions: string; documents: string[]; site_notes: string; attachments?: { path: string; name: string }[] };
type Strategy = { sel: Record<string, "primary" | "backup">; order: string[]; hours: number; hold: boolean; holdH: number; backups: boolean; emergency: boolean };
type EventLite = { id: string; name: string; starts_at: string | null; location: string; capacity: number | null; cover_image?: string; guest_count?: number | null };

const KEY = "gd-rfq-draft";
const draftKey = (scope: string) => `${KEY}:${scope}`;
const store = { get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? sessionStorage.getItem(k) ?? "null") as T | null; } catch { return null; } }, set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: the wizard still works within the page */ } }, del(k: string) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } } };
const NO_INITIAL: Partial<Draft> = {};
const EMPTY: Draft = { event_id: "", category: "production", title: "", scope: "", budget_min: "", budget_max: "", budget_type: "Total project budget", date: "", time: "", setup: "", location: "", capacity: "", capacity_range: "Exact capacity", credentials: "", deadline: "8", respond_by: "", checklist: [], checklist_other: "", questions: "", documents: ["quote"], site_notes: "" };

export const CAT_LABEL: Record<string, string> = { venue: "Venue", production: "Production & AV", catering: "Catering", drinks: "Drinks & bars", security: "Security", entertainment: "Entertainment / DJ", decor: "Decor & styling", photography: "Photography & video", staffing: "Staffing", marquees: "Marquees & structures", furniture: "Furniture & equipment hire", transport: "Transport", accommodation: "Accommodation", planning: "Planning & coordination", other: "Other service" };
/** Any other supplier category (e.g. ?category=dj from a listing) keeps its canonical label rather than its raw key. */
const catLabel = (c: string) => CAT_LABEL[c] ?? labelOf("service_category", c, c);
const TILES: [string, string, string, LucideIcon, string[]][] = [
  ["venue", "Venue", "Event spaces, stadiums, halls, outdoor areas", Building2, ["venue"]],
  ["catering", "Catering", "Food, drinks, bars, menus", UtensilsCrossed, ["catering", "drinks"]],
  ["entertainment", "Entertainment", "DJs, live bands, performers", Music, ["entertainment"]],
  ["production", "Production", "Sound, lighting, staging, AV", AudioLines, ["production"]],
  ["staff", "Event Staff", "Security, crowd control, bar staff", Users, ["security", "staffing"]],
  ["other", "Other Services", "Decor, transport, hire, more", MoreHorizontal, ["decor", "photography", "marquees", "furniture", "transport", "accommodation", "planning", "other"]],
];
// A category outside the tiles (dj, live_music, florist…) lands on the tile for the build category it fills, not on Production.
const TILE_BY_BUILD: Record<string, string> = { venue: "venue", food: "catering", drinks: "catering", entertainment: "entertainment", production: "production", staff: "staff" };
const tileOf = (cat: string) => TILES.find(t => t[4].includes(cat)) ?? TILES.find(t => t[0] === (TILE_BY_BUILD[buildCategoryOf(cat === "venue" ? "venue" : "service", cat)] ?? "other"))!;
const CHECKS = [["licensed", "Licensed (alcohol)"], ["liability", "Public liability insurance"], ["hs", "Health & safety certification"], ["access", "Accessibility compliant"], ["green", "Sustainability / green credentials"], ["council", "Local authority approval"], ["other", "Other (specify)"]] as const;
const DOCS = [["quote", "Itemised quote"], ["insurance", "Insurance certificate"], ["risk", "Risk assessment / method statement"], ["portfolio", "Portfolio or sample menu"], ["availability", "Written availability confirmation"]] as const;
const label = (list: readonly (readonly [string, string])[], keys: string[]) => keys.map(k => list.find(x => x[0] === k)?.[1] ?? k);
const fmtDate = (d: string) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";
const gbpN = (v: string) => v ? `£${Number(v).toLocaleString("en-GB")}` : "";

/** Loads the device draft for this workspace/user once, then autosaves every change. */
function useDraft(scope: string, initial: Partial<Draft>, preferInitial = false) {
  const [d, setD] = useState<Draft>({ ...EMPTY, ...initial }); const [ready, setReady] = useState(false); const loaded = useRef(false);
  useEffect(() => { queueMicrotask(() => { const saved = store.get<Draft>(draftKey(scope)); if (saved && (!preferInitial || !initial.event_id || saved.event_id === initial.event_id)) setD(x => ({ ...x, ...saved, ...(preferInitial && initial.event_id ? { event_id: initial.event_id } : {}) })); loaded.current = true; setReady(true); }); }, [scope, initial, preferInitial]);
  useEffect(() => { if (loaded.current) store.set(draftKey(scope), d); }, [d, scope]);
  return [d, setD, ready] as const;
}
const stepHref = (n: number, d: Pick<Draft, "event_id" | "category">, flags: URLSearchParams, listing?: string) => { const p = new URLSearchParams({ step: String(n), event: d.event_id, category: d.category }); if (listing) p.set("listing", listing); for (const k of ["hold", "emergency"]) if (flags.get(k) === "1") p.set(k, "1"); return `/organizer/marketplace/requests/new?${p}`; };
const step1Problems = (d: Draft) => [!d.event_id && "Choose the event", d.title.trim().length < 3 && "Add a title (3+ characters)", !d.scope.trim() && "Describe the service scope", !d.date && "Set the date", !d.location.trim() && "Set the location", !d.capacity.trim() && "Add the expected attendance", d.budget_min && d.budget_max && Number(d.budget_max) < Number(d.budget_min) && "Budget maximum must be above the minimum", d.checklist.includes("other") && !d.checklist_other.trim() && "Specify the other requirement"].filter(Boolean) as string[];

function DraftMissing({ flags }: { flags: URLSearchParams }) {
  return <section className="k-card"><div className="k-notice amber"><Info size={15} className="k-amber" /><span className="k-small">Start with the requirement first — this request has no saved details on this device yet. <Link className="k-link" href={`/organizer/marketplace/requests/new?step=1${flags.get("event") ? `&event=${flags.get("event")}` : ""}`}>Go to step 1</Link></span></div></section>;
}

/** Step 1 — Requirement (Create Marketplace Request design): linked event, category tiles, brief, when/where, capacity and budget,
 *  plus the additional-requirements checklist, attachments and response deadline. */
export function RfqRequirement({ events, initial, draftScope, initialListing }: { events: EventLite[]; initial: Partial<Draft>; draftScope: string; initialListing?: string }) {
  const router = useRouter(); const flags = useSearchParams();
  const [d, setD] = useDraft(draftScope, initial, !!flags.get("event") || !!initialListing);
  const [uploading, setUploading] = useState(false); const [tried, setTried] = useState(false); const [changing, setChanging] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => { const n = { ...x, [k]: v }; if (k === "event_id") { const e = events.find(e => e.id === v); if (e) { n.date = e.starts_at?.slice(0, 10) ?? ""; n.location = e.location; n.capacity = String(e.capacity ?? e.guest_count ?? ""); } } return n; });
  const ev = events.find(e => e.id === d.event_id); const tile = tileOf(d.category); const problems = step1Problems(d);
  return <form className="wz-grid" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (problems.length) return; store.set(draftKey(draftScope), d); router.push(stepHref(2, d, flags, initialListing)); }}>
    {(flags.get("hold") === "1" || flags.get("emergency") === "1") && <div className={`k-notice ${flags.get("emergency") === "1" ? "red" : "blue"}`} style={{ gridColumn: "1 / -1" }}>{flags.get("emergency") === "1" ? <Zap size={15} /> : <Info size={15} className="k-blue" />}
      <span className="k-small">{flags.get("emergency") === "1" ? <><b>Emergency request.</b> Only providers offering emergency supply are contacted, and they’re notified as urgent.</> : <><b>Conditional hold requested.</b> Providers who are free can hold your date while you decide. You can change this on the Suppliers step.</>}</span></div>}
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card rq-linked"><h2 className="wz-h">Linked event</h2><p className="k-small">This request is linked to the selected event. Event details prefill the requirements.</p>
        {ev && !changing ? <div className="rq-ev">{/* eslint-disable-next-line @next/next/no-img-element */}{ev.cover_image ? <img src={ev.cover_image} alt="" /> : <span className="rq-ev-ph"><CalendarDays size={22} /></span>}
          <div className="k-grow"><b>{ev.name}</b><span className="rq-ev-facts"><span><CalendarDays size={14} />{ev.starts_at ? fmtDate(ev.starts_at.slice(0, 10)) : "Date TBC"}</span><span><MapPin size={14} />{ev.location || "Location TBC"}</span><span><Users size={14} />{ev.capacity ?? ev.guest_count ?? "—"} expected</span></span></div>
          <button type="button" className="k-btn outline sm" onClick={() => setChanging(true)}>Change event</button></div>
          : <label className="k-field" style={{ marginTop: 10 }}><span>Event <b>*</b></span><select className="k-select" value={d.event_id} onChange={e => { set("event_id", e.target.value); setChanging(false); }} aria-invalid={tried && !d.event_id}><option value="" disabled>Choose event…</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}</section>
      <section className="k-card"><h2 className="wz-h">1. What do you need?</h2><p className="k-small">Select the type of venue or service you&apos;re looking for.</p>
        <div className="rq-tiles" role="radiogroup" aria-label="What do you need?">{TILES.map(([k, l, sub, I, cats]) => { const on = tile[0] === k; return <button key={k} type="button" role="radio" aria-checked={on} data-on={on || undefined} className="rq-tile" onClick={() => set("category", cats[0]!)}><I size={24} aria-hidden /><b>{l}</b><small>{sub}</small>{on && <i className="rq-tick"><Check size={12} strokeWidth={3} /></i>}</button>; })}</div>
        <label className="k-field" style={{ marginTop: 12 }}><span>Specific service / requirement</span><select className="k-select" value={d.category} onChange={e => set("category", e.target.value)}>{(tile[4].includes(d.category) ? tile[4] : [d.category, ...tile[4]]).map(c => <option key={c} value={c}>{catLabel(c)}</option>)}</select></label></section>
      <section className="k-card"><h2 className="wz-h">2. Tell us about your requirement</h2><p className="k-small" style={{ marginBottom: 10 }}>Give a clear description of what you need. The more detail you provide, the better responses you&apos;ll receive.</p>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Title <b>*</b></span><input className="k-input" value={d.title} maxLength={100} onChange={e => set("title", e.target.value)} placeholder="e.g. Main Stage Production & AV" aria-invalid={tried && d.title.trim().length < 3} /><small>{d.title.length}/100</small></label>
          <label className="k-field"><span>Service scope <b>*</b></span><textarea className="k-textarea" value={d.scope} maxLength={1000} onChange={e => set("scope", e.target.value)} placeholder="Describe your requirements, key features, and what you're looking for…" aria-invalid={tried && !d.scope.trim()} /><small>{d.scope.length}/1000</small></label>
        </div></section>
      <section className="k-card"><h2 className="wz-h">3. When and where?</h2><p className="k-small" style={{ marginBottom: 10 }}>Set your dates, times and location requirements.</p>
        <div className="k-grid k-g4 rq-g4">
          <label className="k-field"><span>Date <b>*</b></span><input className="k-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} aria-invalid={tried && !d.date} /></label>
          <label className="k-field"><span>Time (each day)</span><div className="k-input-icon"><Clock size={15} /><input className="k-input" value={d.time} maxLength={40} onChange={e => set("time", e.target.value)} placeholder="14:00 – 23:00" /></div></label>
          <label className="k-field"><span>Location <b>*</b></span><div className="k-input-icon"><MapPin size={15} /><input className="k-input" value={d.location} maxLength={160} onChange={e => set("location", e.target.value)} aria-invalid={tried && !d.location.trim()} /></div></label>
          <label className="k-field"><span>Setup / breakdown</span><input className="k-input" value={d.setup} maxLength={120} onChange={e => set("setup", e.target.value)} placeholder="Add setup / breakdown (optional)" /></label>
        </div></section>
      <section className="k-card"><h2 className="wz-h">4. Capacity and budget</h2><p className="k-small" style={{ marginBottom: 10 }}>Let suppliers know the scale and your budget range.</p>
        <div className="k-grid k-g4 rq-g4">
          <label className="k-field"><span>Expected attendance <b>*</b></span><div className="k-input-icon"><Users size={15} /><input className="k-input" inputMode="numeric" value={d.capacity} onChange={e => set("capacity", e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={tried && !d.capacity.trim()} /></div></label>
          <label className="k-field"><span>Capacity range</span><select className="k-select" value={d.capacity_range} onChange={e => set("capacity_range", e.target.value)}>{["Exact capacity", "Up to 10% more", "Up to 25% more", "Flexible"].map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="k-field"><span>Budget / price range (£)</span><span className="rq-budget"><input className="k-input" type="number" min={0} value={d.budget_min} onChange={e => set("budget_min", e.target.value)} aria-label="Budget min (£)" /><i>to</i><input className="k-input" type="number" min={0} value={d.budget_max} onChange={e => set("budget_max", e.target.value)} aria-label="Budget max (£)" /></span></label>
          <label className="k-field"><span>Budget type</span><select className="k-select" value={d.budget_type} onChange={e => set("budget_type", e.target.value)}>{["Total project budget", "Per day", "Per person", "Per hour"].map(x => <option key={x}>{x}</option>)}</select></label>
        </div></section>
      {tried && problems.length > 0 && <div className="k-notice red" role="alert"><Info size={15} /><span className="k-small"><b>Before you continue:</b> {problems.join(" · ")}.</span></div>}
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><h2 className="wz-h">Additional requirements</h2><p className="k-small" style={{ marginBottom: 8 }}>Set any specific requirements or credentials.</p>
        <div className="rq-checks">{CHECKS.map(([k, l]) => <label key={k} className="k-check"><input type="checkbox" checked={d.checklist.includes(k)} onChange={e => set("checklist", e.target.checked ? [...d.checklist, k] : d.checklist.filter(x => x !== k))} /><span>{l}</span></label>)}</div>
        {d.checklist.includes("other") && <input className="k-input" style={{ marginTop: 8 }} value={d.checklist_other} maxLength={120} onChange={e => set("checklist_other", e.target.value)} placeholder="Other requirement" aria-label="Other requirement" aria-invalid={tried && !d.checklist_other.trim()} />}</section>
      <section className="k-card"><h2 className="wz-h">Attachments (optional)</h2><p className="k-small" style={{ marginBottom: 8 }}>Add documents, images or reference materials.</p><RequestAttachments files={d.attachments ?? []} onChange={files => setD(value => ({ ...value, attachments: files }))} onBusy={setUploading} /></section>
      <section className="k-card"><h2 className="wz-h">Response deadline</h2><p className="k-small" style={{ marginBottom: 8 }}>When do you need responses by?</p><input className="k-input" type="date" aria-label="Respond by" min={new Date().toISOString().slice(0, 10)} max={d.date || undefined} value={d.respond_by} onChange={e => set("respond_by", e.target.value)} /><small className="k-xs k-muted">Each supplier also gets a response window on the Suppliers step.</small></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href="/organizer/marketplace">Cancel</Link><button className="k-btn primary lg" disabled={uploading}>Continue to specifications <ArrowRight size={15} /></button></div>
  </form>;
}

/** Step 2 — Specifications: questions for suppliers, documents to include with quotes, site/access notes and credentials. */
export function RfqSpecs({ draftScope, events }: { draftScope: string; events: EventLite[] }) {
  const router = useRouter(); const flags = useSearchParams(); const [d, setD, ready] = useDraft(draftScope, NO_INITIAL);
  if (ready && step1Problems(d).length) return <DraftMissing flags={flags} />;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const ev = events.find(e => e.id === d.event_id);
  return <form className="wz-grid" onSubmit={e => { e.preventDefault(); store.set(draftKey(draftScope), d); router.push(stepHref(3, d, flags, flags.get("listing") ?? undefined)); }}>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><h2 className="wz-h">Questions for suppliers</h2><p className="k-small" style={{ marginBottom: 8 }}>Anything each supplier should answer in their quote. One per line.</p>
        <textarea className="k-textarea" value={d.questions} maxLength={300} onChange={e => set("questions", e.target.value)} placeholder={"e.g. Can you supply a backup generator?\nWhat is your load-in time?"} aria-label="Questions for suppliers" /><small className="k-xs k-muted">{d.questions.length}/300</small></section>
      <section className="k-card"><h2 className="wz-h">Include with quotes</h2><p className="k-small" style={{ marginBottom: 8 }}>Documents suppliers should attach to their response.</p>
        <div className="rq-checks">{DOCS.map(([k, l]) => <label key={k} className="k-check"><input type="checkbox" checked={d.documents.includes(k)} onChange={e => set("documents", e.target.checked ? [...d.documents, k] : d.documents.filter(x => x !== k))} /><span>{l}</span></label>)}</div></section>
      <section className="k-card"><h2 className="wz-h">Site &amp; access</h2><div className="k-grid k-g2">
        <label className="k-field"><span>Site and access notes</span><textarea className="k-textarea" value={d.site_notes} maxLength={300} onChange={e => set("site_notes", e.target.value)} placeholder="Load-in, power, parking, noise curfew…" /></label>
        <label className="k-field"><span>Required credentials</span><textarea className="k-textarea" value={d.credentials} maxLength={300} onChange={e => set("credentials", e.target.value)} placeholder="e.g. Public liability £5m, SIA licence" /></label></div></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Your requirement</h2><Link className="k-link k-small" href={stepHref(1, d, flags)}><Pencil size={12} /> Edit</Link></div>
        <dl className="ov-dl rq-dl">{[["Event", ev?.name ?? "—"], ["Service", catLabel(d.category)], ["Title", d.title], ["Date", `${fmtDate(d.date)}${d.time ? ` · ${d.time}` : ""}`], ["Location", d.location], ["Attendance", d.capacity], ["Budget", d.budget_min || d.budget_max ? `${gbpN(d.budget_min) || "—"} – ${gbpN(d.budget_max) || "—"} (${d.budget_type.toLowerCase()})` : "Not given"], ["Requirements", label(CHECKS, d.checklist.filter(c => c !== "other")).concat(d.checklist.includes("other") ? [d.checklist_other] : []).join(", ") || "None"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}</dl></section>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 8 }}>How it works</h2><ul className="pl-agent-list"><li><Check size={15} className="k-green" />Providers have a fixed response window (server clock)</li><li><Check size={15} className="k-green" />No reply ≠ unavailable — requests expire as &ldquo;no response&rdquo;</li><li><Check size={15} className="k-green" />Quotes are compared side by side before you commit</li><li><Check size={15} className="k-green" />Nothing is booked or paid until you confirm</li></ul></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={stepHref(1, d, flags)}><ArrowLeft size={15} />Back</Link><button className="k-btn primary lg">Continue to suppliers <ArrowRight size={15} /></button></div>
  </form>;
}

const DEFAULT_STRATEGY = (preselect: string[], initialHold?: boolean, initialEmergency = false): Strategy => ({ sel: Object.fromEntries(preselect.map((id, i) => [id, i < 2 ? "primary" : "backup"])), order: [], hours: 8, hold: initialHold ?? true, holdH: 24, backups: true, emergency: initialEmergency });
/** Restores the saved strategy (only for candidates still on offer) and autosaves changes. */
function useStrategy(key: string, candidates: Candidate[], fallback: Strategy, initialHold?: boolean, initialEmergency = false) {
  const [st, setSt] = useState<Strategy>(fallback); const loaded = useRef(false);
  useEffect(() => { queueMicrotask(() => { const s = store.get<Partial<Strategy>>(`${key}:strategy`); if (s) { const ids = new Set(candidates.map(c => c.id)); setSt(x => ({ ...x,
    ...(s.sel && typeof s.sel === "object" ? { sel: Object.fromEntries(Object.entries(s.sel).filter(([id, role]) => ids.has(id) && (role === "primary" || role === "backup"))) as Strategy["sel"] } : {}),
    ...(Array.isArray(s.order) ? { order: s.order.filter(id => typeof id === "string" && ids.has(id)) } : {}),
    ...([2, 4, 8, 12].includes(Number(s.hours)) ? { hours: Number(s.hours) } : {}), ...([12, 24, 48, 72].includes(Number(s.holdH)) ? { holdH: Number(s.holdH) } : {}),
    ...(typeof s.hold === "boolean" && initialHold === undefined ? { hold: s.hold } : {}), ...(typeof s.backups === "boolean" ? { backups: s.backups } : {}), ...(typeof s.emergency === "boolean" && !initialEmergency ? { emergency: s.emergency } : {}) })); }
    loaded.current = true; }); }, [key, candidates, initialHold, initialEmergency]);
  useEffect(() => { if (loaded.current) store.set(`${key}:strategy`, st); }, [st, key]);
  return [st, setSt] as const;
}
const chosenOf = (candidates: Candidate[], st: Strategy) => candidates.filter(c => st.sel[c.id]).sort((a, b) => (st.sel[a.id] === st.sel[b.id] ? (st.order.includes(a.id) ? st.order.indexOf(a.id) : 999) - (st.order.includes(b.id) ? st.order.indexOf(b.id) : 999) || b.fit - a.fit : st.sel[a.id] === "primary" ? -1 : 1));

/** Step 3 — Suppliers (Neon Nights Supplier Marketplace design): recommended suppliers, recipients, response & hold strategy. */
export function RfqSuppliers({ candidates, eventId, preselect, eventDate, draftScope, initialHold, initialEmergency = false }: { candidates: Candidate[]; eventId: string; preselect: string[]; eventDate: string; draftScope: string; initialHold?: boolean; initialEmergency?: boolean }) {
  const router = useRouter(); const flags = useSearchParams(); const toast = useKitToast();
  const key = draftKey(draftScope);
  const [draft, , ready] = useDraft(draftScope, NO_INITIAL);
  const fallback = useMemo(() => DEFAULT_STRATEGY(preselect, initialHold, initialEmergency), [preselect, initialHold, initialEmergency]);
  const [st, setSt] = useStrategy(key, candidates, fallback, initialHold, initialEmergency);
  const [reordering, setReordering] = useState(false);
  const { sel, hours, hold, holdH, backups, emergency } = st;
  const setSel = (f: (s: Strategy["sel"]) => Strategy["sel"]) => setSt(x => ({ ...x, sel: f(x.sel) }));
  const chosen = useMemo(() => chosenOf(candidates, st), [candidates, st]);
  if (ready && step1Problems(draft).length) return <DraftMissing flags={flags} />;
  const move = (id: string, direction: -1 | 1) => { const ids = chosen.map(c => c.id), at = ids.indexOf(id), other = at + direction; if (other < 0 || other >= ids.length || sel[id] !== sel[ids[other]!]) return; [ids[at], ids[other]] = [ids[other]!, ids[at]!]; setSt(x => ({ ...x, order: ids })); };
  const toggle = (id: string) => setSel(s => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = Object.values(n).filter(v => v === "primary").length < 2 ? "primary" : "backup"; return n; });
  const canGo = chosen.some(c => backups || sel[c.id] === "primary") && !(emergency && chosen.some(c => !c.emergency));
  const ring = (v: number) => <span className="rf-ring" style={{ ["--v" as string]: v, ["--c" as string]: v >= 85 ? "#16a34a" : v >= 75 ? "#f59e0b" : "#ef4444" }}><b>{v}%</b></span>;
  return <div className="wz-grid rf-grid">
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Recommended suppliers</h2><p className="k-small">Based on your event, requirements and availability. Select who to send this request to.</p></div><div className="k-row" style={{ gap: 8 }}><div className="k-seg"><span aria-current="page"><List size={14} />List view</span><Link href={`/organizer/marketplace?view=map&event=${eventId}`}><MapIcon size={14} />Map view</Link></div><Link className="k-btn ghost" href={`/organizer/marketplace?event=${eventId}`}><SlidersHorizontal size={14} />Filters</Link></div></div>
        <div className="k-table-wrap"><table className="k-table rf-table"><thead><tr><th scope="col" style={{ width: 30 }}><span style={{ position: "absolute", width: 1, height: 1, padding: 0, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>Select provider</span></th><th>Supplier</th><th>Match</th><th>Availability</th><th>Reliability</th><th>Price guide</th><th>Location</th><th>Actions</th></tr></thead>
          <tbody>{candidates.map(c => { const on = !!sel[c.id]; return <tr key={c.id} className={on ? "rf-on" : ""}><td><input type="checkbox" checked={on} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} /></td>
            <td><span className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.image} alt="" className="rf-img" /><span><span className="k-row" style={{ gap: 6 }}><b className="k-strong">{c.name}</b>{c.badge && <span className="k-chip purple">{c.badge}</span>}</span><span className="k-row k-xs" style={{ gap: 4 }}><Star size={11} fill="#f59e0b" color="#f59e0b" /><b>{c.rating.toFixed(1)}</b><span className="k-muted">({c.reviews})</span></span><span className="k-xs k-muted">{c.category}{c.emergency ? " · Emergency" : ""}</span></span></span></td>
            <td>{ring(c.fit)}</td>
            <td><span className="k-row k-xs" style={{ gap: 5 }}><i className={`k-dot ${c.avail === "unavailable" ? "tone-dot-red" : c.avail === "pending" ? "tone-dot-amber" : "tone-dot-green"}`} /><b style={{ fontWeight: 550 }}>{c.availLabel}</b></span><span className="k-xs k-muted">{eventDate}</span><Link className="k-xs k-link" href={`/organizer/marketplace/${c.category === "Venue" ? "venue" : "service"}/${c.id}?tab=availability`}><CalendarDays size={10} />View calendar</Link></td>
            <td><span className="k-row k-xs" style={{ gap: 5 }}><i className="k-dot tone-dot-green" /><b style={{ fontWeight: 550 }}>{({ new: "New", excellent: "Excellent", good: "Good", developing: "Developing", at_risk: "At risk" } as Record<string, string>)[c.reliability] ?? "Not available"}</b></span><span className="k-xs k-muted">{c.events} completed bookings with this workspace</span><span className="k-xs k-muted">{c.response}h response</span></td>
            <td><b className="k-small" style={{ fontWeight: 550 }}>{c.priceGuide}</b><div className="k-xs k-muted">{c.priceBasis}</div></td>
            <td><span className="k-row k-xs" style={{ gap: 4 }}><MapPin size={12} className="k-blue" />{c.distance}</span></td>
            <td>{on ? <select className="k-select rf-role" value={sel[c.id]} onChange={e => setSel(s => ({ ...s, [c.id]: e.target.value as "primary" | "backup" }))} aria-label="Role"><option value="primary">Primary</option><option value="backup">Backup</option></select> : <button className="k-btn ghost sm" onClick={() => toggle(c.id)}>Add</button>}</td></tr>; })}</tbody></table></div>
        {!candidates.length && <p className="k-small">No matching providers on the marketplace for this category.</p>}</section>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 8 }}><div><h2 className="wz-h">Selected recipients ({chosen.length})</h2><p className="k-small">Selected suppliers receive the request together. Primary and backup roles remain recorded.</p></div><button className="k-btn ghost sm" onClick={() => setReordering(v => !v)}><ArrowUpDown size={13} />{reordering ? "Done reordering" : "Reorder"}</button></div>
        <ul className="k-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>{chosen.map((c, i) => <li key={c.id} className="k-li"><span className="rf-n">{i + 1}</span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.image} alt="" className="k-thumb sm" /><b className="k-small k-strong" style={{ width: 150 }}>{c.name}</b><span className={`k-chip ${sel[c.id] === "primary" ? "green" : "amber"}`}>{sel[c.id] === "primary" ? "Primary" : "Backup"}</span><span className="k-xs k-muted k-row" style={{ gap: 4, marginLeft: 20 }}><Mail size={12} className="k-blue" />Via Gala Dock messages</span><span className="k-xs k-muted k-row" style={{ gap: 4, marginLeft: "auto" }}><Phone size={12} className="k-blue" />{c.response}h SLA</span><span className="k-row" style={{ gap: 4, flexWrap: "wrap" }}>{reordering && <><button className="k-icon-btn" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Move ${c.name} up`} disabled={i === 0 || sel[chosen[i - 1]!.id] !== sel[c.id]} onClick={() => move(c.id, -1)}><ArrowUp size={16} /></button><button className="k-icon-btn" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Move ${c.name} down`} disabled={i === chosen.length - 1 || sel[chosen[i + 1]!.id] !== sel[c.id]} onClick={() => move(c.id, 1)}><ArrowDown size={16} /></button></>}</span><button className="k-icon-btn plain" aria-label={`Remove ${c.name}`} onClick={() => toggle(c.id)}><X size={14} /></button></li>)}{!chosen.length && <li className="k-small k-muted">No recipients yet.</li>}</ul></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Response &amp; hold strategy</h2><Info size={15} className="k-blue" /></div>
        <div className="k-field" style={{ marginTop: 10 }}><span>Response window <b>*</b></span><small>How long do suppliers have to respond?</small><div className="k-grid k-g4 rf-hours">{[2, 4, 8, 12].map(h => <button key={h} type="button" aria-pressed={hours === h} disabled={emergency && h > 4} onClick={() => setSt(x => ({ ...x, hours: h }))}>{h} hours</button>)}</div></div>
        <div className="k-between" style={{ marginTop: 14 }}><span><b className="k-small">Conditional hold</b><div className="k-xs k-muted">Temporarily hold the date while suppliers respond.</div></span><Toggle checked={hold} onChange={v => setSt(x => ({ ...x, hold: v }))} label="Conditional hold" /></div>
        {hold && <div className="k-grid k-g2" style={{ marginTop: 10 }}><label className="k-field"><span>Hold duration</span><select className="k-select" value={holdH} onChange={e => setSt(x => ({ ...x, holdH: Number(e.target.value) }))}>{[12, 24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}</select></label><div className="k-field"><span>Hold expiry</span><small>Agreed holds expire automatically at their recorded deadline.</small></div></div>}
        {hold && <div className="k-notice" style={{ marginTop: 10 }}><Info size={14} className="k-blue" /><span className="k-xs">Providers can agree a date-specific hold on {eventDate} for up to {holdH} hours. Sending this request does not reserve capacity.</span></div>}</section>
      <section className="k-card"><h2 className="wz-h">Backup and emergency</h2><p className="k-small" style={{ marginBottom: 10 }}>Add backup suppliers in case your primary choices decline.</p>
        <div className="k-between"><span className="k-small" style={{ color: "var(--k-ink)" }}>Include backup suppliers</span><Toggle checked={backups} onChange={v => setSt(x => ({ ...x, backups: v }))} label="Include backup suppliers" /></div>
        <div className="k-between" style={{ marginTop: 10 }}><span><b className="k-small" style={{ color: "var(--k-ink)" }}><Zap size={12} /> Emergency request</b><div className="k-xs k-muted">Mark as urgent and notify eligible suppliers immediately (2–4h).</div></span><Toggle checked={emergency} onChange={v => setSt(x => ({ ...x, emergency: v, hours: v ? Math.min(x.hours, 4) : x.hours }))} label="Emergency request" /></div>
        {emergency && chosen.some(c => !c.emergency) && <p className="k-xs k-red" role="alert" style={{ marginTop: 8 }}>Remove providers that don&apos;t offer emergency supply.</p>}</section>
      <section className="k-agent"><div className="k-agent-head"><Sparkles size={17} className="k-spark" /><h3>Event match suggestions</h3></div><p>These suggestions use the published listing and your event requirements. Calendar availability still requires provider confirmation.</p>
        <button className="k-btn ghost sm" style={{ marginTop: 8 }} onClick={() => setSt(x => ({ ...x, sel: Object.fromEntries(candidates.slice(0, 3).map((c, i) => [c.id, i < 2 ? "primary" : "backup"])) }))}><RefreshCw size={13} />Use top 3</button>
        <ol className="k-col" style={{ gap: 8, listStyle: "none", padding: 0, margin: "10px 0 0" }}>{candidates.slice(0, 3).map((c, i) => <li key={c.id} className="k-li"><span className="rf-n">{i + 1}</span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.image} alt="" className="k-thumb sm" /><span className="k-grow"><b className="k-xs k-strong">{c.name}</b><div className="k-xs k-muted">{c.fit}% match</div></span><button className="k-btn ghost sm" disabled={!!sel[c.id]} onClick={() => toggle(c.id)}>{sel[c.id] ? "Added" : "Add"}</button></li>)}</ol></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={stepHref(2, draft, flags, flags.get("listing") ?? undefined)}><ArrowLeft size={15} />Back</Link><div className="k-row" style={{ gap: 10 }}><button className="k-btn outline lg" onClick={() => { store.set(`${key}:strategy`, st); toast("Draft saved on this device"); }}>Save as draft</button><button className="k-btn primary lg" disabled={!canGo} onClick={() => { store.set(`${key}:strategy`, st); router.push(stepHref(4, draft, flags, flags.get("listing") ?? undefined)); }}>Continue to review <ArrowRight size={15} /></button></div></div>
  </div>;
}

/** Step 4 — Review & send: everything from steps 1–3 in one place; "Send request" is the only action that contacts suppliers. */
export function RfqReview({ candidates, eventId, eventName, eventDate, draftScope, preselect, initialHold, initialEmergency = false }: { candidates: Candidate[]; eventId: string; eventName: string; eventDate: string; draftScope: string; preselect: string[]; initialHold?: boolean; initialEmergency?: boolean }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const flags = useSearchParams();
  const key = draftKey(draftScope);
  const [d, , ready] = useDraft(draftScope, NO_INITIAL);
  const fallback = useMemo(() => DEFAULT_STRATEGY(preselect, initialHold, initialEmergency), [preselect, initialHold, initialEmergency]);
  const [st] = useStrategy(key, candidates, fallback, initialHold, initialEmergency);
  const chosen = useMemo(() => chosenOf(candidates, st), [candidates, st]);
  if (ready && step1Problems(d).length) return <DraftMissing flags={flags} />;
  const recipients = chosen.filter(c => st.backups || st.sel[c.id] === "primary");
  const reqs = label(CHECKS, d.checklist.filter(c => c !== "other")).concat(d.checklist.includes("other") && d.checklist_other ? [d.checklist_other] : []);
  const send = async () => {
    if (!recipients.length) { toast("Choose at least one supplier on the Suppliers step.", "error"); return; }
    if (st.emergency && recipients.some(c => !c.emergency)) { toast("Remove providers that don't offer emergency supply.", "error"); return; }
    const cut = (v: string) => v.slice(0, 300);
    const requirements = Object.fromEntries(Object.entries({ date: d.date, time: d.time, setup: d.setup, location: d.location, capacity: d.capacity, capacity_range: d.capacity_range, budget_type: d.budget_type, credentials: d.credentials, checklist: reqs.join(", "), respond_by: d.respond_by, questions: d.questions, documents: label(DOCS, d.documents).join(", "), site_notes: d.site_notes }).filter(([, v]) => v).map(([k, v]) => [k, cut(v)]));
    const r = await run(() => sendRequest({ event_id: eventId || d.event_id, category: d.category, title: d.title, scope: d.scope, budget_min: d.budget_min || undefined, budget_max: d.budget_max || undefined, attachments: d.attachments ?? [], requirements, response_hours: st.emergency ? Math.min(st.hours, 4) : st.hours, hold: st.hold, hold_hours: st.holdH, emergency: st.emergency, include_backups: st.backups, recipients: recipients.map(c => ({ listing_id: c.id, role: st.sel[c.id]! })) }));
    if (r.ok) { store.del(key); store.del(`${key}:strategy`); }
  };
  const edit = (n: number) => <Link className="k-link k-small" href={stepHref(n, d, flags, flags.get("listing") ?? undefined)}><Pencil size={12} /> Edit</Link>;
  return <div className="wz-grid">
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Requirement</h2>{edit(1)}</div>
        <h3 className="rq-title">{d.title}</h3><p className="k-small" style={{ whiteSpace: "pre-line" }}>{d.scope}</p>
        <dl className="ov-dl rq-dl">{[["Event", eventName], ["Service", catLabel(d.category)], ["When", `${fmtDate(d.date)}${d.time ? ` · ${d.time}` : ""}${d.setup ? ` · setup ${d.setup}` : ""}`], ["Where", d.location], ["Attendance", `${d.capacity}${d.capacity_range !== "Exact capacity" ? ` (${d.capacity_range.toLowerCase()})` : ""}`], ["Budget", d.budget_min || d.budget_max ? `${gbpN(d.budget_min) || "—"} – ${gbpN(d.budget_max) || "—"} · ${d.budget_type}` : "Not given"], ["Requirements", reqs.join(", ") || "None"], ["Responses by", d.respond_by ? fmtDate(d.respond_by) : "Response window only"], ["Attachments", (d.attachments ?? []).map(a => a.name).join(", ") || "None"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}</dl></section>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Specifications</h2>{edit(2)}</div>
        <dl className="ov-dl rq-dl">{[["Questions", d.questions || "None"], ["Include with quotes", label(DOCS, d.documents).join(", ") || "Nothing extra"], ["Site & access", d.site_notes || "None"], ["Credentials", d.credentials || "None"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd style={{ whiteSpace: "pre-line" }}>{v}</dd></div>)}</dl></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Recipients ({recipients.length})</h2>{edit(3)}</div>
        <ul className="k-list" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>{recipients.map((c, i) => <li key={c.id} className="k-li"><span className="rf-n">{i + 1}</span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.image} alt="" className="k-thumb sm" /><b className="k-small k-strong k-grow">{c.name}</b><span className={`k-chip ${st.sel[c.id] === "primary" ? "green" : "amber"}`}>{st.sel[c.id] === "primary" ? "Primary" : "Backup"}</span></li>)}{!recipients.length && <li className="k-small k-muted">No suppliers selected yet.</li>}</ul></section>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 8 }}>Strategy</h2>
        <dl className="ov-dl rq-dl">{[["Response window", `${st.emergency ? Math.min(st.hours, 4) : st.hours} hours`], ["Conditional hold", st.hold ? `${st.holdH} hours on ${eventDate}` : "Off"], ["Backups", st.backups ? "Included" : "Primary suppliers only"], ["Emergency", st.emergency ? "Yes — urgent" : "No"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="k-notice" style={{ marginTop: 10 }}><Info size={14} className="k-blue" /><span className="k-xs">Sending contacts these suppliers through Gala Dock messages. Nothing is booked or paid until you accept a quote.</span></div></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={stepHref(3, d, flags, flags.get("listing") ?? undefined)}><ArrowLeft size={15} />Back</Link><button className="k-btn primary lg" disabled={pending || !recipients.length} onClick={() => void send()}><Send size={15} />Send request</button></div>
  </div>;
}
