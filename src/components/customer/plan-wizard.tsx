"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ArrowRight, ArrowLeft, Save, Lock, Globe, Info, Sparkles, MoreHorizontal, CalendarDays, Clock, MapPin, X, LocateFixed, Users, BarChart3, ChevronLeft, ChevronRight, Lightbulb, Pencil, SlidersHorizontal, RefreshCw, Music2, Trees, Wallet, Gem, Loader2, Bookmark, Star, Palette, Trash2 } from "lucide-react";
import { VSteps } from "@/components/kit";
import { Toggle, NumberStepper, SaveHeart, AgentAsk, MapView, useAction, useKitToast, Menu, type MapPin as Pin } from "@/components/kit/client";
import { savePlanStep, createFromPlan, discardPlan, type PlanStep1, type PlanStep2, type PlanStep3 } from "@/lib/actions/plan-wizard";
import { OCCASIONS, MORE_OCCASIONS, MUST_HAVES, OPTIONALS, STYLES, ACCESS, occasionPitch, labelOf, occasionLabel } from "@/lib/plan-model";

type Alloc = { key: string; pct: number; amount: number; min: number; max: number };
export type PlanData = {
  event: (PlanStep1 & PlanStep2 & PlanStep3 & { id: string; status: string }) | null;
  insights: { city: string; areas: string[]; priceLow: number | null; priceHigh: number | null; venues: number; open: number; checked: number; pins: Pin[] };
  bench: { min: number; max: number; tier: string }; budget: number; alloc: Alloc[];
  venues: { id: string; name: string; image: string; location: string; price_from: number | null; price_hi: number | null; cap: (number | null)[]; rating: number; reviews: number; href: string; saved: boolean }[];
  mapKey: string; occasionTitle: string;
};
const gbp = (n: number | null | undefined) => n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`;
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const fmt = (d: string) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";
const short = (d: string) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const COLORS = ["#2563eb", "#c99a2e", "#ef4444", "#e11d48", "#f59e0b", "#94a3b8", "#10b981", "#8b5cf6", "#06b6d4", "#f97316", "#64748b", "#a855f7"];
const STEP_TITLES = ["Occasion & Goal", "Date & Location", "Budget & Priorities", "Recommended Build"];

export function PlanWizard({ step, base, data }: { step: 1 | 2 | 3 | 4; base: string; data: PlanData }) {
  const router = useRouter(); const toast = useKitToast(); const { run, pending } = useAction();
  const ev = data.event;
  const [s1, setS1] = useState<PlanStep1>({ event_type: ev?.event_type ?? "", name: ev?.name && !/^My /.test(ev.name) ? ev.name : "", visibility: ev?.visibility ?? "private", agent_help: ev?.agent_help ?? true, description: ev?.description ?? "" });
  const [s2, setS2] = useState<PlanStep2>({ date_mode: ev?.date_mode ?? "single", date: ev?.date ?? "", flex_to: ev?.flex_to ?? "", start: ev?.start ?? "18:00", end: ev?.end ?? "23:00", flexible_window: ev?.flexible_window ?? false, location: ev?.location || "London, UK", radius: ev?.radius ?? 10, guests: ev?.guests ?? 100, adults: ev?.adults ?? 0, children: ev?.children ?? 0, infants: ev?.infants ?? 0 });
  const [s3, setS3] = useState<PlanStep3>({ budget_mode: ev?.budget_mode ?? "total", budget: ev?.budget || data.budget, budget_min: ev?.budget_min || data.bench.min, budget_max: ev?.budget_max || data.bench.max, must: ev?.must?.length ? ev.must : ["venue", "food", "drinks", "entertainment", "media", "styling"], optional: ev?.optional ?? [], style: ev?.style ?? "classic", access: ev?.access ?? [] });
  const [moreTypes, setMoreTypes] = useState(false);
  const typeKey = s1.event_type || ev?.event_type || "wedding";
  const occ = OCCASIONS.find(o => o.key === typeKey);

  const go = async (n: 1 | 2 | 3, payload: unknown, next: number | "exit") => {
    const r = await run(() => savePlanStep(n, payload, ev?.id ?? null), { refresh: false });
    if (!r.ok || !r.data) return;
    router.push(next === "exit" ? "/account/events" : `/plan?event=${r.data.id}&step=${next}`);
  };
  const saveExit = () => step === 1 ? (s1.event_type ? go(1, s1, "exit") : router.push("/account/events")) : step === 2 ? go(2, s2, "exit") : step === 3 ? go(3, s3, "exit") : router.push("/account/events");

  const subFor = (n: number) => !ev ? undefined : n === 1 ? `${occasionLabel(ev.event_type)} · ${ev.visibility === "public" ? "Public" : "Private"} event` : n === 2 && ev.date ? `${short(ev.date)} · ${ev.location.split(",")[0]}\n${ev.guests} guests` : n === 3 && ev.must.length ? `${gbp(ev.budget)} · ${ev.must.length} must-haves` : undefined;
  const steps = STEP_TITLES.map((t, i) => ({ title: t, sub: i + 1 === step ? ["Tell us what you're planning", "When and where", "Set your budget and must-haves", "Review your plan"][i] : subFor(i + 1) ?? ["Tell us what you're planning", "When and where", "Budget and must-haves", "Review and create"][i] }));
  const reach = !ev ? 1 : !ev.date ? 2 : !ev.must.length ? 3 : 4;

  const railAgent = step === 1 ? { text: "I can help you plan your event from start to finish. Tell me what you're thinking and I'll suggest the best options.", btn: "Help me plan this event", icon: Sparkles, act: () => document.querySelector<HTMLInputElement>(".pw-side .k-agent-ask input, .pw-side input")?.focus() }
    : step === 2 ? { text: "I can help you find the best dates and locations based on availability, pricing and your guest count.", btn: "Suggest dates for me", icon: CalendarDays, act: () => { const d = new Date(); d.setMonth(d.getMonth() + 4); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); setS2(p => ({ ...p, date: d.toISOString().slice(0, 10) })); toast(`Suggested ${fmt(d.toISOString().slice(0, 10))} — Saturdays 4+ months out have the widest choice`); } }
    : step === 3 ? { text: "I can help you set a realistic budget, suggest priorities and show you what's possible in your area.", btn: "Optimise my budget", icon: Sparkles, act: () => { setS3(p => ({ ...p, budget_mode: "total", budget: Math.round((data.bench.min + data.bench.max) / 2 / 500) * 500 })); toast("Budget set to the midpoint for similar events"); } }
    : { text: "I've created a recommended plan based on your details. You can refine it, try different options, or continue to create your event.", btn: "Regenerate plan", icon: RefreshCw, act: () => router.refresh() };

  return <div className="pw-grid">
    <aside className="pw-rail">
      <VSteps steps={steps} current={step} hrefFor={n => ev && n <= reach && n !== step ? `/plan?event=${ev.id}&step=${n}` : ""} />
      <section className="pw-agent"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="pw-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div><p>{railAgent.text}</p>
        <button className="pw-agent-btn" onClick={railAgent.act}><railAgent.icon size={16} />{railAgent.btn}</button></section>
      {ev?.status === "draft" && <button className="pw-discard" onClick={() => void run(() => discardPlan(ev.id))}><Trash2 size={13} />Discard draft</button>}
    </aside>

    <div className="pw-main">
      {step < 4 && <button className="k-btn outline pw-save" onClick={() => void saveExit()} disabled={pending}><Save size={17} />Save and exit</button>}
      {step === 1 && <section className="ce-card pw-card">
        <small className="pw-step">Step 1 of 4</small><h2 className="pw-h">What are you planning?</h2><p className="pw-sub">Start with the occasion and your goal. We&apos;ll tailor everything to your event.</p>
        <h3 className="pw-label">Event type / occasion <span className="k-red">*</span></h3>
        <div className="pw-types" role="radiogroup" aria-label="Event type">
          {OCCASIONS.map((o, i) => <button key={o.key} role="radio" aria-checked={s1.event_type === o.key} className={`pw-type ${i < 4 ? "lg" : ""}`} data-on={s1.event_type === o.key || undefined} onClick={() => setS1(p => ({ ...p, event_type: o.key }))}>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/gd/plan/${o.img}.webp`} alt="" /><span>{o.label}</span>{s1.event_type === o.key && <i className="pw-tick"><Check size={13} strokeWidth={3} /></i>}</button>)}
          <Menu label="More event types" width={220} trigger={({ toggle, open, id }) => <button className="pw-type more" data-on={MORE_OCCASIONS.some(m => m.key === s1.event_type) || undefined} onClick={toggle} aria-expanded={open} aria-controls={id}><MoreHorizontal size={22} /><span>{MORE_OCCASIONS.find(m => m.key === s1.event_type)?.label ?? "More types"}</span></button>}>
            {close => <>{MORE_OCCASIONS.map(m => <button key={m.key} role="menuitem" className="k-menu-item" onClick={() => { setS1(p => ({ ...p, event_type: m.key })); close(); setMoreTypes(!moreTypes); }}>{m.label}{s1.event_type === m.key && <Check size={14} className="k-blue" style={{ marginLeft: "auto" }} />}</button>)}</>}
          </Menu>
        </div>
        <label className="pw-label" htmlFor="pw-name">Event title (optional)</label>
        <input id="pw-name" className="pw-input" value={s1.name} maxLength={120} onChange={e => setS1(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Sarah & James Wedding, 30th Birthday, Summer Party" />
        <h3 className="pw-label">Event intent <span title="Private events are invitation-only. Public events get a public page and can sell tickets."><Info size={14} /></span></h3>
        <div className="pw-intent" role="radiogroup" aria-label="Event intent">
          {([["private", Lock, "Private event", "By invitation only"], ["public", Globe, "Public event", "Open to the public / sell tickets"]] as const).map(([k, I, t, sub]) => <button key={k} role="radio" aria-checked={s1.visibility === k} className="pw-intent-opt" data-on={s1.visibility === k || undefined} onClick={() => setS1(p => ({ ...p, visibility: k }))}><span className={`pw-radio ${s1.visibility === k ? "on" : ""}`}>{s1.visibility === k && <Check size={12} strokeWidth={3} />}</span><I size={22} /><span><b>{t}</b><small>{sub}</small></span></button>)}
        </div>
        <div className="pw-help"><Sparkles size={22} className="pw-spark2" /><span className="k-grow"><b>Help me plan everything with Gala Agent</b><small>Get personalised recommendations, checklists and a full plan based on your event.</small></span><Toggle checked={s1.agent_help} onChange={v => setS1(p => ({ ...p, agent_help: v }))} label="Help me plan everything with Gala Agent" /></div>
        <label className="pw-label" htmlFor="pw-desc">Short description</label>
        <span className="pw-ta"><textarea id="pw-desc" value={s1.description} maxLength={500} onChange={e => setS1(p => ({ ...p, description: e.target.value }))} placeholder="Tell us a bit about your event, your vision or any special requirements..." /><small>{s1.description.length}/500</small></span>
        <div className="pw-foot end"><button className="k-btn primary pw-next" disabled={pending || !s1.event_type} onClick={() => void go(1, s1, 2)}>{pending && <Loader2 size={16} className="k-spin" />}Continue to Date &amp; Location <ArrowRight size={17} /></button></div>
      </section>}

      {step === 2 && <>
        <section className="ce-card pw-card pw-when">
          <div className="k-between" style={{ alignItems: "flex-start" }}><div><h2 className="pw-h2">1. When is your event?</h2><p className="pw-sub">Choose a date or a flexible range to see the best availability.</p></div>
            <div className="pw-seg" role="radiogroup" aria-label="Date type">{([["single", "Single date"], ["flexible", "Flexible dates"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={s2.date_mode === k} data-on={s2.date_mode === k || undefined} onClick={() => setS2(p => ({ ...p, date_mode: k }))}><CalendarDays size={17} />{l}</button>)}</div></div>
          <div className="pw-when-grid">
            <MonthPicker value={s2.date} to={s2.date_mode === "flexible" ? s2.flex_to : ""} onPick={d => setS2(p => p.date_mode === "flexible" && p.date && !p.flex_to && d > p.date ? { ...p, flex_to: d } : { ...p, date: d, flex_to: "" })} />
            <div className="pw-when-f">
              <label className="pw-flabel">{s2.date_mode === "flexible" ? "Date range" : "Event date"}</label>
              <div className="pw-in"><CalendarDays size={18} /><span>{s2.date ? (s2.date_mode === "flexible" && s2.flex_to ? `${short(s2.date)} – ${short(s2.flex_to)}` : fmt(s2.date)) : "Pick a date on the calendar"}</span></div>
              <label className="pw-flabel">Start and end time</label>
              <div className="pw-times"><span className="pw-in"><Clock size={18} /><select value={s2.start} onChange={e => setS2(p => ({ ...p, start: e.target.value }))} aria-label="Start time">{TIMES.map(t => <option key={t}>{t}</option>)}</select></span><b>–</b><span className="pw-in"><Clock size={18} /><select value={s2.end} onChange={e => setS2(p => ({ ...p, end: e.target.value }))} aria-label="End time">{TIMES.map(t => <option key={t}>{t}</option>)}</select></span></div>
              <label className="pw-check"><input type="checkbox" checked={s2.flexible_window} onChange={e => setS2(p => ({ ...p, flexible_window: e.target.checked }))} />This is a flexible time window <span title="Providers can suggest times that suit them better."><Info size={15} /></span></label>
            </div>
          </div>
        </section>
        <section className="ce-card pw-card pw-where">
          <div><h2 className="pw-h2">2. Where will your event be?</h2><p className="pw-sub">Search by city, postcode or area. We&apos;ll show venues and suppliers near you.</p>
            <div className="k-row" style={{ gap: 12, marginTop: 16 }}><span className="pw-in k-grow"><MapPin size={18} /><input value={s2.location} onChange={e => setS2(p => ({ ...p, location: e.target.value }))} aria-label="Location" placeholder="City, postcode or area" />{s2.location && <button onClick={() => setS2(p => ({ ...p, location: "" }))} aria-label="Clear location"><X size={16} /></button>}</span>
              <button className="k-btn outline pw-loc" onClick={() => { if (!navigator.geolocation) { toast("Location isn't available in this browser", "error"); return; } navigator.geolocation.getCurrentPosition(() => { setS2(p => ({ ...p, location: `${data.insights.city}, UK` })); toast("Using venues near you"); }, () => toast("Location permission was denied", "error")); }}><LocateFixed size={17} />Use my location</button></div>
            {data.insights.areas.length > 0 && <><small className="pw-pop">Popular areas:</small><div className="pw-chips">{data.insights.areas.slice(0, 4).map(a => <button key={a} data-on={s2.location.startsWith(a) || undefined} onClick={() => setS2(p => ({ ...p, location: `${a}, ${data.insights.city}` }))}>{a}</button>)}{data.insights.areas.length > 4 && <Menu label="More areas" width={200} trigger={({ toggle, open, id }) => <button onClick={toggle} aria-expanded={open} aria-controls={id}>More ⌄</button>}>{close => <>{data.insights.areas.slice(4).map(a => <button key={a} role="menuitem" className="k-menu-item" onClick={() => { setS2(p => ({ ...p, location: `${a}, ${data.insights.city}` })); close(); }}>{a}</button>)}</>}</Menu>}</div></>}
          </div>
          <div className="pw-map"><label className="pw-radius"><input type="checkbox" checked readOnly />Search within<select value={s2.radius} onChange={e => setS2(p => ({ ...p, radius: Number(e.target.value) }))} aria-label="Search radius">{[5, 10, 25, 50].map(r => <option key={r} value={r}>{r} miles</option>)}</select></label>
            <MapView pins={data.insights.pins} zoom={s2.radius <= 5 ? 12 : s2.radius <= 10 ? 11 : s2.radius <= 25 ? 10 : 9} height={200} mapKey={data.mapKey} ariaLabel={`Venues near ${s2.location || data.insights.city}`} /></div>
        </section>
        <section className="ce-card pw-card">
          <h2 className="pw-h2">3. How many guests are you expecting?</h2><p className="pw-sub">This helps us show you the right venues and services.</p>
          <div className="pw-guests"><div><label className="pw-flabel">Total guests</label><span className="pw-in pw-step"><Users size={18} /><NumberStepper value={s2.guests} min={1} onChange={v => setS2(p => ({ ...p, guests: v }))} label="Total guests" /></span></div>
            <div className="pw-break"><label className="pw-flabel">Guest breakdown (optional) <span title="Helps venues plan seating, menus and safety."><Info size={14} /></span></label>
              <div className="pw-break-row">{([["adults", "Adults"], ["children", "Children (under 16)"], ["infants", "Infants (under 2)"]] as const).map(([k, l]) => <label key={k}><small>{l}</small><NumberStepper value={s2[k]} onChange={v => setS2(p => ({ ...p, [k]: v }))} label={l} /></label>)}</div></div></div>
          {s2.adults + s2.children + s2.infants > 0 && s2.adults + s2.children + s2.infants !== s2.guests && <div className="pw-note warn"><Info size={15} />Your breakdown adds up to {s2.adults + s2.children + s2.infants} — <button className="k-link" onClick={() => setS2(p => ({ ...p, guests: p.adults + p.children + p.infants }))}>use that as the total</button>.</div>}
          <div className="pw-note"><Info size={15} />Larger guest counts may open up different venue options and supplier packages.</div>
          <div className="pw-foot"><Link className="k-btn outline" href={`${base}&step=1`}><ArrowLeft size={16} />Back to Occasion &amp; Goal</Link><button className="k-btn primary pw-next" disabled={pending || !s2.date} onClick={() => void go(2, s2, 3)}>{pending && <Loader2 size={16} className="k-spin" />}Continue to Budget &amp; Priorities <ArrowRight size={17} /></button></div>
        </section>
      </>}

      {step === 3 && <section className="ce-card pw-card pw-budget">
        <h2 className="pw-h2">1. What&apos;s your budget?</h2><p className="pw-sub">Set a total budget or a range. You can also let Gala Agent suggest a realistic budget based on your event.</p>
        <div className="pw-modes" role="radiogroup" aria-label="Budget type">{([["total", "Set a total budget", "I have a fixed amount in mind"], ["range", "Set a budget range", "I'm flexible between two amounts"], ["suggest", "Get a suggestion", "Let Gala Agent recommend"]] as const).map(([k, t, sub]) => <button key={k} role="radio" aria-checked={s3.budget_mode === k} data-on={s3.budget_mode === k || undefined} className="pw-mode" onClick={() => setS3(p => ({ ...p, budget_mode: k, ...(k === "suggest" ? { budget: Math.round((data.bench.min + data.bench.max) / 2 / 500) * 500 } : {}) }))}><span className={`pw-radio ${s3.budget_mode === k ? "on" : ""}`}>{s3.budget_mode === k && <Check size={12} strokeWidth={3} />}</span><span><b>{t}</b><small>{sub}</small></span></button>)}</div>
        <div className="pw-amount">
          {s3.budget_mode === "range" ? <div className="pw-range"><span className="pw-money"><i>£</i><input inputMode="numeric" value={s3.budget_min ? s3.budget_min.toLocaleString("en-GB") : ""} onChange={e => setS3(p => ({ ...p, budget_min: Number(e.target.value.replace(/\D/g, "")) || 0 }))} aria-label="Minimum budget" /></span><b>–</b><span className="pw-money"><i>£</i><input inputMode="numeric" value={s3.budget_max ? s3.budget_max.toLocaleString("en-GB") : ""} onChange={e => setS3(p => ({ ...p, budget_max: Number(e.target.value.replace(/\D/g, "")) || 0 }))} aria-label="Maximum budget" /></span></div>
            : <span className="pw-money"><i>£</i><input inputMode="numeric" value={s3.budget ? s3.budget.toLocaleString("en-GB") : ""} readOnly={s3.budget_mode === "suggest"} onChange={e => setS3(p => ({ ...p, budget: Number(e.target.value.replace(/\D/g, "")) || 0 }))} aria-label="Total budget" /></span>}
          <div className="pw-bench"><BarChart3 size={24} /><span><small>Based on similar events in {data.insights.city}</small><b>{gbp(data.bench.min)} – {gbp(data.bench.max)}</b><small>For {ev?.guests ?? 100} guests · {data.occasionTitle} · {data.bench.tier} <span title="Benchmarked from typical per-guest spend for this occasion in your area."><Info size={13} /></span></small></span></div>
        </div>
        <h2 className="pw-h2 mt">2. What are your must-have categories?</h2><p className="pw-sub">Select the essential elements for your event. These will be prioritised in recommendations.</p>
        <div className="pw-tiles">{MUST_HAVES.map(c => { const on = s3.must.includes(c.key); return <button key={c.key} className="pw-tile" aria-pressed={on} data-on={on || undefined} onClick={() => setS3(p => ({ ...p, must: on ? p.must.filter(x => x !== c.key) : [...p.must, c.key], optional: p.optional.filter(x => x !== c.key) }))}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/gd/plan/cat-${c.key}.webp`} alt="" /><span>{c.label}</span><i className={`pw-box ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</i></button>; })}</div>
        <h2 className="pw-h2 mt">3. Any optional categories?</h2><p className="pw-sub">Add anything else you might like. We&apos;ll include them if they fit within your budget.</p>
        <div className="pw-tiles">{OPTIONALS.map(c => { const on = s3.optional.includes(c.key); return <button key={c.key} className="pw-tile" aria-pressed={on} data-on={on || undefined} onClick={() => setS3(p => ({ ...p, optional: on ? p.optional.filter(x => x !== c.key) : [...p.optional, c.key] }))}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/gd/plan/cat-${c.key}.webp`} alt="" /><span>{c.label}</span><i className={`pw-box ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</i></button>; })}</div>
        <h2 className="pw-h2 mt">4. What style or experience are you looking for?</h2><p className="pw-sub">This helps us match venues and suppliers to your vision.</p>
        <div className="pw-styles" role="radiogroup" aria-label="Style">{STYLES.map(st => <button key={st.key} role="radio" aria-checked={s3.style === st.key} className="pw-style" data-on={s3.style === st.key || undefined} onClick={() => setS3(p => ({ ...p, style: st.key }))}>{st.key === "custom" ? <span className="pw-style-ic"><Palette size={26} /></span> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/assets/gd/plan/style-${st.key}.webp`} alt="" />}<span className="pw-style-l"><span className={`pw-radio sm ${s3.style === st.key ? "on" : ""}`}>{s3.style === st.key && <Check size={10} strokeWidth={3} />}</span>{st.label}</span></button>)}</div>
        <h2 className="pw-h2 mt">5. Any accessibility or special requirements?</h2><p className="pw-sub">Let us know if you have any specific needs so we can recommend suitable venues and suppliers.</p>
        <div className="pw-access">{ACCESS.map(a => <label key={a.key} className="pw-check"><input type="checkbox" checked={s3.access.includes(a.key)} onChange={e => setS3(p => ({ ...p, access: e.target.checked ? [...p.access, a.key] : p.access.filter(x => x !== a.key) }))} />{a.label}</label>)}</div>
        <div className="pw-foot"><Link className="k-btn outline" href={`${base}&step=2`}><ArrowLeft size={16} />Back to Date &amp; Location</Link><button className="k-btn primary pw-next" disabled={pending || !s3.must.length} onClick={() => void go(3, s3, 4)}>{pending && <Loader2 size={16} className="k-spin" />}Continue to Recommended Build <ArrowRight size={17} /></button></div>
      </section>}

      {step === 4 && ev && <Review data={data} ev={ev} base={base} />}
    </div>

    <aside className="pw-side">
      {step === 1 && <>
        <section className="ce-card pw-pitch">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={typeKey === "wedding" ? "/assets/gd/plan/side-wedding.webp" : `/assets/gd/plan/${occ?.img ?? "type-party"}.webp`} alt="" />
          <div><h3>Planning a{/^[aeiou]/i.test(occasionLabel(typeKey)) ? "n" : ""} {occasionLabel(typeKey).toLowerCase()}?</h3><p>{occasionPitch[typeKey] ?? "We'll help you find the right venue and suppliers and keep everything on track."}</p>
            <ul>{["Personalised recommendations", "Suggested checklist and timeline", "Trusted venues and suppliers", "Budget guidance", s1.visibility === "public" ? "Ticketing and a public event page" : "Option to keep it private or public"].map(t => <li key={t}><CheckCircle2 size={18} />{t}</li>)}</ul></div></section>
        <section className="ce-card pw-chat"><div className="k-row" style={{ gap: 8, marginBottom: 10 }}><Sparkles size={20} className="pw-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div>
          <AgentAsk scope="customer" placeholder="Type your message..." suggestions={["I'm planning a wedding for 100 people in London next summer", "Help me plan a 30th birthday party with a DJ and catering", "I need a corporate event for 50 people with a presentation and dinner"]} /></section>
      </>}
      {step === 2 && <>
        <section className="ce-card pw-insight">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/gd/plan/side-insights.webp" alt="" />
          <div><h3>{data.insights.city} event insights</h3><dl>
            <div><dt><CalendarDays size={18} /></dt><dd><b>Your date</b><small>{s2.date ? fmt(s2.date) : "Not chosen yet"}</small></dd>{data.insights.checked > 0 && <span className={`pw-avail ${data.insights.open / data.insights.checked >= .6 ? "" : data.insights.open ? "amber" : "red"}`}>{data.insights.open / data.insights.checked >= .6 ? "Good availability" : data.insights.open ? "Limited availability" : "Very limited"}</span>}</div>
            <div><dt><MapPin size={18} /></dt><dd><b>Popular areas</b><small>{data.insights.areas.slice(0, 3).join(", ") || data.insights.city}</small></dd></div>
            <div><dt><BarChart3 size={18} /></dt><dd><b>Typical venue price</b><small>{data.insights.priceLow ? `${gbp(data.insights.priceLow)} – ${gbp(data.insights.priceHigh)}` : "Prices on request"} <span title={`Middle half of ${data.insights.venues} venues listed in ${data.insights.city}.`}><Info size={13} /></span></small></dd></div></dl></div></section>
        <section className="ce-card pw-tips"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="pw-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div><p>Based on your guest count and event type, here are some suggestions:</p>
          {[[CalendarDays, "Be flexible with dates", data.insights.checked ? `${data.insights.open} of ${data.insights.checked} suitable venues are free on your date. Flexible dates widen your choice.` : "Flexible dates usually unlock more venues and better prices."], [MapPin, "Consider nearby areas", data.insights.areas.length ? `${data.insights.areas.slice(0, 2).join(" and ")} have the most venues listed.` : `Widen your search radius beyond ${s2.radius} miles for more options.`], [Users, "Adjust guest count", s2.guests >= 100 ? "Some top venues have minimum spend for 100+ guests." : "Smaller groups open up private dining rooms and intimate spaces."]].map(([I, t, d]) => { const Ic = I as typeof Users; return <div key={t as string} className="pw-tip"><Ic size={22} /><span><b>{t as string}</b><small>{d as string}</small></span></div>; })}
          <Link className="k-btn outline block pw-show" href={`/discover?tab=venues&results=1&guests=${s2.guests}${s2.date ? `&date=${s2.date}` : ""}`}>Show me available venues <ArrowRight size={16} /></Link></section>
      </>}
      {step === 3 && <BudgetSide data={data} s3={s3} ev={ev} s2={s2} />}
      {step === 4 && ev && <PlanSide data={data} ev={ev} base={base} pending={pending} create={async () => { await run(() => createFromPlan(ev.id, data.venues[0]?.id ?? null)); }} />}
    </aside>
  </div>;
}

function MonthPicker({ value, to, onPick }: { value: string; to: string; onPick: (d: string) => void }) {
  const init = value ? new Date(`${value}T12:00:00Z`) : new Date(); const [m, setM] = useState({ y: init.getUTCFullYear(), m: init.getUTCMonth() });
  const today = new Date().toISOString().slice(0, 10);
  const first = new Date(Date.UTC(m.y, m.m, 1)); const lead = (first.getUTCDay() + 6) % 7; const days = new Date(Date.UTC(m.y, m.m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(Date.UTC(m.y, m.m, i - lead + 1)); return { iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), out: i < lead || i >= lead + days, wk: d.getUTCDay() === 0 || d.getUTCDay() === 6 }; });
  const rows = cells.slice(35).every(c => c.out) ? cells.slice(0, 35) : cells;
  const shift = (n: number) => setM(p => { const d = new Date(Date.UTC(p.y, p.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  return <div className="pw-cal"><div className="k-between"><b>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</b><span className="k-row" style={{ gap: 6 }}><button onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button><button onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button></span></div>
    <div className="pw-cal-g" role="grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d} className="pw-cal-h">{d}</span>)}
      {rows.map(c => { const past = c.iso < today; const sel = c.iso === value || c.iso === to; const inR = value && to && c.iso > value && c.iso < to; return <button key={c.iso} role="gridcell" aria-selected={sel} disabled={past} className={`pw-day ${c.out ? "out" : ""} ${sel ? "sel" : ""} ${inR ? "range" : ""} ${c.wk ? "wk" : ""}`} onClick={() => onPick(c.iso)} aria-label={new Date(`${c.iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>{c.day}</button>; })}</div></div>;
}

function Donut({ rows, total }: { rows: Alloc[]; total: number }) {
  let acc = 0; const stops = rows.map((r, i) => { const a = acc; acc += r.pct; return `${COLORS[i % COLORS.length]} ${a}% ${acc}%`; }).join(", ");
  return <div className="pw-donut" style={{ background: `conic-gradient(${stops})` }}><span><b>{gbp(total)}</b><small>Total budget</small></span></div>;
}

function BudgetSide({ data, s3, ev, s2 }: { data: PlanData; s3: PlanStep3; ev: PlanData["event"]; s2: PlanStep2 }) {
  const total = s3.budget_mode === "range" ? Math.round((s3.budget_min + s3.budget_max) / 2) : s3.budget;
  const rows = useMemo(() => { const cats = [...s3.must, ...s3.optional]; const weights: Record<string, number> = { venue: 35, food: 25, drinks: 15, entertainment: 10, styling: 8, media: 7, transport: 4, accommodation: 6, security: 4, staff: 5, invitations: 2, activities: 4 }; const sum = cats.reduce((a, c) => a + (weights[c] ?? 4), 0) || 1; return cats.map(c => ({ key: c, pct: Math.round(((weights[c] ?? 4) / sum) * 100), amount: Math.round(total * (weights[c] ?? 4) / sum / 50) * 50, min: 0, max: 0 })); }, [s3.must, s3.optional, total]);
  const fixPct = rows.length ? 100 - rows.reduce((a, r) => a + r.pct, 0) : 0; if (rows[0]) rows[0].pct += fixPct;
  const over = total && total < data.bench.min; const under = total > data.bench.max * 1.5;
  return <>
    <section className="ce-card pw-bud"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="pw-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div>
      <p>Here&apos;s a suggested budget breakdown based on similar {data.occasionTitle.toLowerCase()}s in {data.insights.city} for {ev?.guests ?? 100} guests. You can adjust this based on what matters most to you.</p>
      <div className="pw-bud-row"><Donut rows={rows} total={total} /><ul>{rows.map((r, i) => <li key={r.key}><i style={{ background: COLORS[i % COLORS.length] }} /><span>{labelOf(r.key)}</span><b>{r.pct}%</b><em>{gbp(r.amount)}</em></li>)}</ul></div>
      {over ? <div className="pw-note warn"><Info size={15} />This is below the typical {gbp(data.bench.min)} for similar events — consider fewer categories or guests.</div> : under ? <div className="pw-note"><Info size={15} />Comfortably above typical spend — room for premium options.</div> : null}
    </section>
    <section className="ce-card pw-btips"><div className="k-row" style={{ gap: 10 }}><Lightbulb size={22} className="pw-bulb" /><b>Budget tips</b></div>
      <ul>{["Venue and catering usually take up 50–70% of the budget.", "Being flexible with dates can save 20–30%.", "Consider off-peak times for better availability.", "Gala Agent can help you find the best value options."].map(t => <li key={t}><CheckCircle2 size={16} />{t}</li>)}</ul></section>
    <section className="ce-card pw-current"><div className="k-between"><b>Your current plan</b>{ev && <Link className="k-link" href={`/plan?event=${ev.id}&step=1`}>Edit</Link>}</div>
      <dl>{([["Occasion", ev ? `${occasionLabel(ev.event_type)} (${ev.visibility === "public" ? "Public" : "Private"})` : "—"], ["Date", s2.date ? `${short(s2.date)}, ${s2.start} – ${s2.end}` : "—"], ["Location", s2.location || "—"], ["Guests", `${s2.guests}${s2.adults || s2.children ? ` (${s2.adults} adults, ${s2.children} children)` : ""}`], ["Budget", s3.budget_mode === "range" ? `${gbp(s3.budget_min)} – ${gbp(s3.budget_max)}` : gbp(total)], ["Must-haves", s3.must.map(labelOf).join(", ") || "—"], ["Style", STYLES.find(x => x.key === s3.style)?.label ?? "—"], ["Accessibility", s3.access.map(a => ACCESS.find(x => x.key === a)?.label).join(", ") || "None"]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  </>;
}

function Review({ data, ev, base }: { data: PlanData; ev: NonNullable<PlanData["event"]>; base: string }) {
  const within = ev.budget >= data.bench.min * 0.85;
  const ready = Math.round(100 * ([!!ev.date, !!ev.location, ev.guests > 0, ev.budget > 0, data.venues.length > 0, ev.must.length >= 3, data.insights.checked === 0 || data.insights.open > 0].filter(Boolean).length) / 7 / 10) * 10;
  const occ = OCCASIONS.find(o => o.key === ev.event_type);
  const ICONS: Record<string, typeof Wallet> = { venue: Gem, food: Wallet, drinks: Wallet, entertainment: Music2, styling: Palette, media: Star };
  return <>
    <div className={`pw-banner ${within ? "" : "amber"}`} role="status"><CheckCircle2 size={20} />{within ? "Looks great! This plan matches your goals and should be achievable within your budget." : `Your budget is below the typical ${gbp(data.bench.min)} for similar events — we've favoured value options.`}</div>
    <section className="ce-card pw-card pw-sum">
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={data.venues[0]?.image || `/assets/gd/plan/${occ?.img ?? "type-party"}.webp`} alt="" />
      <div className="k-grow"><div className="k-between" style={{ alignItems: "flex-start" }}><div><span className="pw-chip">{occasionLabel(ev.event_type)} ({ev.visibility === "public" ? "Public" : "Private"})</span><h2 className="pw-name">{ev.name}</h2></div><Link className="k-btn outline pw-edit" href={`${base}&step=1`}><Pencil size={15} />Edit details</Link></div>
        <div className="pw-facts"><span><CalendarDays size={19} /><span><b>{fmt(ev.date)}</b><small>{ev.start} – {ev.end}</small></span></span><span><MapPin size={19} /><span><b>{ev.location || data.insights.city}</b><small>{data.insights.areas[0] ? `Suggested area: ${data.insights.areas[0]}` : `Within ${ev.radius} miles`}</small></span></span><span><Users size={19} /><span><b>{ev.guests} guests</b><small>{ev.adults || ev.children ? `${ev.adults} adults, ${ev.children} children` : "Breakdown not set"}</small></span></span></div>
        <p className="pw-desc">{ev.description || `A ${STYLES.find(s => s.key === ev.style)?.label.toLowerCase() ?? ""} ${occasionLabel(ev.event_type).toLowerCase()} with ${ev.must.slice(0, 3).map(labelOf).join(", ").toLowerCase()} in ${ev.location.split(",")[0] || data.insights.city}.`}</p></div>
      <div className="pw-kpis">
        <div><span className="pw-kpi-ic"><Wallet size={20} /></span><span><small>Estimated range</small><b>{gbp(data.bench.min)} – {gbp(data.bench.max)}</b><em>Based on similar events in {data.insights.city}</em></span></div>
        <div><span className="pw-kpi-ic"><CalendarDays size={20} /></span><span><small>Planning window status</small><b className={data.insights.checked && data.insights.open / data.insights.checked < .4 ? "k-amber" : "k-green"}>{!data.insights.checked ? "Check with providers" : data.insights.open / data.insights.checked >= .6 ? "Good availability" : data.insights.open ? "Limited availability" : "Very limited"}</b><em>{data.insights.checked ? `${data.insights.open} of ${data.insights.checked} suitable venues free` : "Venues and suppliers available"}</em></span></div>
        <div><span className="pw-ring" style={{ ["--v" as string]: ready }}><b>{ready}%</b></span><span><small>Readiness baseline</small><b>{ready >= 70 ? "Most key elements available" : "Some gaps to fill"}</b><em>Ready to start building</em></span></div>
      </div>
    </section>
    <section className="ce-card pw-card">
      <div className="k-between"><div><h2 className="pw-h2">Recommended category plan</h2><p className="pw-sub">Based on your budget and priorities, here&apos;s a suggested allocation.</p></div><Link className="k-btn outline pw-adjust" href={`${base}&step=3`}><SlidersHorizontal size={16} />Adjust budget &amp; priorities</Link></div>
      <div className="pw-alloc">{data.alloc.slice(0, 6).map((a, i) => { const I = ICONS[a.key] ?? Wallet; return <div key={a.key}><span className="pw-alloc-ic" style={{ color: COLORS[i % COLORS.length], background: `color-mix(in srgb, ${COLORS[i % COLORS.length]} 12%, #fff)` }}><I size={18} /></span><b className="pw-pct">{a.pct}%</b><b>{labelOf(a.key)}</b><small>{gbp(a.min)} – {gbp(a.max)}</small></div>; })}</div>
      <div className="k-between" style={{ marginTop: 18 }}><h2 className="pw-h2">Suggested venues</h2><Link className="k-link" href={`/discover?tab=venues&results=1&guests=${ev.guests}`}>View all venues <ArrowRight size={14} /></Link></div>
      <div className="pw-venues">{data.venues.map(v => <article key={v.id} className="pw-venue"><div className="pw-venue-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.image} alt="" /><SaveHeart itemKey={`listing:${v.id}`} saved={v.saved} className="pw-heart" size={18} label={`Save ${v.name}`} /></div>
        <Link href={v.href} className="pw-venue-b"><span className="k-between"><b>{v.name}</b><ChevronRight size={16} /></span><small><MapPin size={13} />{v.location}</small><span className="pw-venue-p">{v.price_from ? `${gbp(v.price_from)} – ${gbp(v.price_hi)}` : "Price on request"}</span><span className="k-between"><small><Users size={13} />{v.cap[0] ?? 1} – {v.cap[1] ?? "—"} guests</small><small className="pw-rate"><Star size={13} fill="#f59e0b" color="#f59e0b" />{v.rating.toFixed(1)} ({v.reviews})</small></span></Link></article>)}{!data.venues.length && <p className="k-small">No venues match {ev.guests} guests yet — try a wider area or adjust your guest count.</p>}</div>
    </section>
  </>;
}

function PlanSide({ data, ev, base, pending, create }: { data: PlanData; ev: NonNullable<PlanData["event"]>; base: string; pending: boolean; create: () => Promise<void> }) {
  const created = ev.status !== "draft";
  const sections = [["Event details & settings", true], ["Venue shortlist", data.venues.length > 0], ...ev.must.filter(m => m !== "venue").map(m => [`${labelOf(m)} options`, true] as [string, boolean]), ...ev.optional.map(m => [`${labelOf(m)} (optional)`, true] as [string, boolean]), ["Timeline & checklist", true], ["Invitations (optional)", ev.optional.includes("invitations")]] as [string, boolean][];
  return <>
    <section className="ce-card pw-refine"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="pw-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div>
      <p>Here&apos;s your recommended plan based on similar {data.occasionTitle.toLowerCase()}s in {data.insights.city}. Want to try a different option?</p>
      {([["budget", Wallet, "Make it more budget friendly"], ["unique", MapPin, "Suggest unique venues"], ["band", Music2, "Include live band options"], ["outdoor", Trees, "Show outdoor venues"]] as const).map(([k, I, t]) => <Link key={k} className="pw-ref" href={k === "band" ? `/discover?tab=services&results=1&q=live%20band` : `${base}&step=4&tweak=${k}`}><I size={17} />{t}</Link>)}
      <Link className="pw-ref strong" href={`${base}&step=3#style`}><RefreshCw size={17} />Try a different style...</Link></section>
    <section className="ce-card pw-check4"><b>Plan checklist</b><p>{created ? "Add these recommendations to your event." : "We'll create these sections in your event."}</p>
      <ul>{sections.slice(0, 10).map(([t, ok]) => <li key={t}>{ok ? <CheckCircle2 size={18} className="ok" /> : <span className="pw-empty" />}{t}</li>)}</ul>
      <button className="k-btn primary pw-create" disabled={pending} onClick={() => void create()}>{pending && <Loader2 size={16} className="k-spin" />}{created ? "Add suggestions to Build" : "Create Event & Continue to Build"} <ArrowRight size={17} /></button>
      <Link className="k-btn outline pw-later" href="/account/events"><Bookmark size={16} />{created ? "Back to My Events" : "Save plan for later"}</Link></section>
  </>;
}
