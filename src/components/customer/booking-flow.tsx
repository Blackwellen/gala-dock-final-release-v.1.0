"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Users, MapPin, Star, Info, Truck, CheckCircle2, AlertTriangle, XCircle, Sparkles, Wand2, CalendarSearch, Lightbulb, Lock, ShieldCheck, FileText, CreditCard, ArrowRight, ArrowLeft, Check, Home, UtensilsCrossed, ChevronRight, Save, Loader2, Building2, MoreHorizontal, X, LifeBuoy, Search } from "lucide-react";
import { VSteps } from "@/components/kit";
import { NumberStepper, SaveHeart, useAction, useKitToast, Menu } from "@/components/kit/client";
import { saveBookingDraft, submitBooking, acceptQuote, checkAvailability, type Availability, type BookingRequirements } from "@/lib/actions/booking";
import type { BookingQuestion } from "@/lib/booking-questions";
import { RequestAttachments } from "@/components/shared/request-attachments";
import { bookingAdminFee, gbpPence, BOOKING_ADMIN_FEE } from "@/lib/fees";
import { labelOf } from "@/lib/master-data";

type QuoteItem = { label?: string; description?: string; name?: string; qty?: number; unit_price?: number };
export type BookingData = {
  event: { id: string; name: string; date: string; start: string; end: string; guests: number; adults: number | null; children: number | null; location: string };
  item: { id: string; title: string; status: string; category: string; amount: number | null; deposit: number; package: string; image: string; quote: { deposit_pct?: number; items?: QuoteItem[]; total?: number; valid_until?: string; reference?: string; terms?: Record<string, string> }; hold_expires_at: string | null; response_deadline: string | null };
  listing: { id: string; name: string; kind: string; category: string; location: string; image: string; gallery: string[]; rating: number; reviews: number; capacity: number | null; price_from: number | null; price_unit: string; response_hours: number; description: string; setting: string; tags: string[]; href: string } | null;
  pkg: { name: string; description: string; price: number; image: string } | null;
  reviews: { rating: number; body: string }[];
  questions: BookingQuestion[];
  saved: BookingRequirements;
  savedOption: "request" | "hold" | "standby" | null;
  submitted: boolean;
  card: { brand: string; last4: string; exp: string; test: boolean } | null;
  cardUnavailable?:boolean;
};
type Opt = "accept" | "request" | "hold" | "standby";
const gbp = (n: number | null | undefined) => n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`;
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
/** Listing category (supplier taxonomy) or, without a listing, the build line category — never the raw key ("catering_full", "food"). */
const catLabel = (L: BookingData["listing"], buildCat: string) => L?.category ? labelOf("service_category", L.category) : labelOf("build_category", buildCat, "Provider");
const fmtDate = (d: string) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed";

export function BookingFlow({ step, base, data, steps }: { step: 1 | 2; base: string; data: BookingData; steps: { title: string; sub?: string }[] }) {
  const router = useRouter(); const toast = useKitToast(); const { run, pending } = useAction();
  const [r, setR] = useState<BookingRequirements>(data.saved);const [attachmentUploading,setAttachmentUploading]=useState(false);
  const [errs, setErrs] = useState<Record<string, boolean>>({});
  const [avail, setAvail] = useState<Availability | null>(null); const [checking, setChecking] = useState(false);
  const availabilityGeneration=useRef(0);
  const quoted = ["quoted", "available", "held", "quote_received", "quote_revised", "customer_reviewing"].includes(data.item.status) && data.item.amount != null;
  const [opt, setOpt] = useState<Opt>(quoted ? "accept" : data.savedOption ?? "request");
  useEffect(()=>{if(quoted&&opt==="request")queueMicrotask(()=>setOpt("accept"));},[quoted,opt]);
  useEffect(()=>()=>{availabilityGeneration.current++;},[]);
  const [agree, setAgree] = useState(false); const [tip, setTip] = useState<string | null>(null);
  const set = <K extends keyof BookingRequirements>(k: K, v: BookingRequirements[K]) => {if(["date","start","end"].includes(k)){availabilityGeneration.current++;setAvail(null);setChecking(false);}setR(p => ({ ...p, [k]: v }));};
  const L = data.listing; const isVenue = (L?.kind ?? data.item.category) === "venue" || data.item.category === "venue";
  const kind = isVenue ? "venue" : "provider";

  const check = async (silent = false) => {
    if (!L || !r.date) { if (!silent) toast("Add a date to check availability"); return; }
    const generation=++availabilityGeneration.current;setChecking(true);setAvail(null);
    try{const res=await checkAvailability(L.id,r.date,r.start,r.end);if(generation!==availabilityGeneration.current)return;
      if(res.ok){setAvail(res.data??"unknown");if(!silent)toast(res.data==="available"?"This date looks available":res.data==="limited"?"Limited availability — the provider will confirm":res.data==="unavailable"?"Not available on this date":"Availability will be confirmed by the provider");}
      else if(!silent)toast(res.error??"Could not check availability.","error");
    }catch{if(generation===availabilityGeneration.current&&!silent)toast("Could not check availability. Try again when connected.","error");}
    finally{if(generation===availabilityGeneration.current)setChecking(false);}
  };
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; void check(true); return; } const t = setTimeout(() => void check(true), 450); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.date, r.start, r.end]);

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!r.date) e.date = true; if (!r.guests) e.guests = true;
    for (const q of data.questions) if (q.required && !r.answers[q.id]) e[`q_${q.id}`] = true;
    setErrs(e); if (Object.keys(e).length) { toast("Please complete the required details"); document.querySelector(".bk-err")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    return !Object.keys(e).length;
  };
  const save = async (then: "next" | "exit") => {
    if(attachmentUploading)return;
    if (then === "next" && !validate()) return;
    const res = await run(() => saveBookingDraft(data.event.id, data.item.id, r, opt === "accept" ? "request" : opt));
    if (res.ok) router.push(then === "next" ? `${base}&step=2` : `/account/events/${data.event.id}/build`);
  };
  const submit = async () => {
    if (!agree) { toast("Please agree to the terms to continue"); return; }
    if (opt === "accept") {
      // Deposit is taken on Stripe Checkout; the booking confirms when the payment does (webhook), then Stripe returns here.
      const res = await run(() => acceptQuote(data.event.id, data.item.id, agree), { refresh: false });
      if (res.ok && typeof res.data === "string") window.location.assign(res.data);
      return;
    }
    const res = await run(() => submitBooking(data.event.id, data.item.id, opt, agree));
    if (res.ok) router.push(`${base}&step=3`);
  };

  const fillFromEvent = () => { if(r.date!==data.event.date||r.start!==data.event.start||r.end!==data.event.end){availabilityGeneration.current++;setAvail(null);setChecking(false);}setR(p => ({ ...p, date: data.event.date, start: data.event.start, end: data.event.end, guests: data.event.guests, adults: data.event.adults ?? undefined, children: data.event.children ?? undefined })); toast("Filled in from your event"); };
  const tips = useMemo(() => {
    const t: string[] = [];
    if (Number(r.start.slice(0, 2)) >= 18) t.push(`Consider a slightly earlier start time — evening slots at popular ${kind}s book fast.`);
    if (L?.capacity && r.guests > L.capacity * 0.9) t.push(`Your guest count is close to the ${L.capacity}-guest capacity. Ask about comfortable numbers for your layout.`);
    t.push("You may need to confirm your final guest count 2 weeks before the event.");
    if (isVenue && r.answers.catering === "bar") t.push("Ask about extending the bar service if you want a late finish.");
    if (!r.flexible_dates) t.push("Marking your dates as flexible can unlock better availability and pricing.");
    return t.slice(0, 3);
  }, [r, L, isVenue, kind]);

  const listingCard = L && <section className="ce-card bk-list">
    <div className="bk-list-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={L.image || data.item.image} alt="" /><SaveHeart itemKey={`listing:${L.id}`} saved={false} className="bk-heart" size={17} label={`Save ${L.name}`} /></div>
    <div className="bk-list-body"><b className="bk-list-name">{L.name}</b>
      <div className="k-between bk-list-loc"><span><MapPin size={14} />{L.location}</span><span><Star size={14} fill="#f59e0b" color="#f59e0b" />{L.rating.toFixed(1)} <span className="k-muted">({L.reviews} reviews)</span></span></div>
      <div className="bk-list-facts">{L.capacity && <span><Users size={13} />Up to {L.capacity} guests</span>}{L.setting && <span><Home size={13} />{L.setting}</span>}{L.tags[0] && <span><UtensilsCrossed size={13} />{L.tags[0]}</span>}</div></div>
    <ListingTabs data={data} />
  </section>;

  return <div className="bk-grid">
    <aside className="bk-rail">
      <VSteps steps={steps} current={step} hrefFor={n => n === 1 ? `${base}&step=1` : n === 2 && step > 1 ? `${base}&step=2` : ""} />
      <section className="bk-agent-card"><div className="k-row" style={{ gap: 8 }}><LifeBuoy size={20} className="bk-spark" /><b>Booking help</b></div>
        <p>{step === 1 ? "Fill this request from your event details, check the date, or look at alternatives." : "Compare request, hold and standby, and see what each one costs."}</p>
        {step === 1 ? <>
          <button className="bk-agent-btn" onClick={fillFromEvent}><Wand2 size={16} />Fill in from my event</button>
          <button className="bk-agent-btn" onClick={() => void check()} disabled={checking}>{checking ? <Loader2 size={16} className="k-spin" /> : <CalendarSearch size={16} />}Check availability</button>
          <Link className="bk-agent-btn" href={`/account/events/${data.event.id}/build?cat=${data.item.category}`}><Search size={16} />See alternatives</Link>
        </> : <>
          <button className="bk-agent-btn" onClick={() => setTip(tip === "best" ? null : "best")} aria-expanded={tip === "best"}><Sparkles size={16} />Which option is best?</button>
          <button className="bk-agent-btn" onClick={() => setTip(tip === "costs" ? null : "costs")} aria-expanded={tip === "costs"}><Sparkles size={16} />Explain the costs</button>
          <button className="bk-agent-btn" onClick={() => void check()} disabled={checking}><Sparkles size={16} />Compare availability</button>
          {tip && <div className="bk-agent-ans" role="status">{tip === "best" ? (quoted ? `You already have a quote of ${gbp(data.item.amount)}. If you're ready, accepting books it now. If you're still comparing, a conditional hold can be requested, subject to provider confirmation.` : avail === "limited" || avail === "unavailable" ? "Availability is tight on your date. A conditional hold or standby gives you the best chance without committing." : "A booking request is free and gets you a formal quote within 48 hours — the best first step for most events.") : `${quoted ? `The quote total is ${gbp(data.item.amount)}. Booking charges a ${gbp(depositOf(data))} deposit now; the balance of ${gbp((data.item.amount ?? 0) - depositOf(data))} is scheduled before your event.` : `The estimate is ${gbp(estimateOf(data))}. Nothing is charged for a request. A conditional hold request does not charge or authorize your card. The provider must confirm it.`}`}</div>}
        </>}
      </section>
    </aside>

    {step === 1 ? <div className="bk-main">
      <section className="ce-card bk-sec">
        <h2 className="bk-h">1. Selected listing &amp; package</h2>
        <div className="bk-sel">
          <div className="bk-gal">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="bk-gal-main" src={L?.image || data.item.image || "/assets/gd/oe-neon.webp"} alt="" />
            <div className="bk-gal-row">{(L?.gallery ?? []).slice(0, 4).map((g, i) => <span key={g + i} className="bk-gal-th">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={g} alt="" />{i === 3 && (L?.gallery.length ?? 0) > 4 && <b>+{(L?.gallery.length ?? 0) - 3}</b>}</span>)}</div></div>
          <div className="bk-sel-body">
            <div className="k-between" style={{ alignItems: "flex-start" }}><div><span className="bk-kind">{isVenue ? "VENUE" : catLabel(L, data.item.category).toUpperCase()}</span><h3 className="bk-name">{L?.name ?? data.item.title}</h3></div>{L && <Link className="k-link" href={L.href}>More details</Link>}</div>
            {L && <div className="bk-loc"><span><MapPin size={14} />{L.location}</span><span><Star size={14} fill="#f59e0b" color="#f59e0b" />{L.rating.toFixed(1)} ({L.reviews} reviews)</span></div>}
            <div className="bk-pills">{L?.setting && <span>{L.setting}</span>}{L?.capacity && <span>Up to {L.capacity} guests</span>}{L?.tags.slice(0, 1).map(t => <span key={t}>{t}</span>)}</div>
            <div className="bk-pkg">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={data.pkg?.image || data.item.image || L?.image || ""} alt="" /><div className="k-grow"><b>{data.pkg?.name ?? data.item.package ?? "Standard package"}</b><small>{data.pkg?.description || data.item.quote.items?.map(i => i.label ?? i.description ?? i.name).filter(Boolean).slice(0, 3).join(", ") || L?.description?.slice(0, 110)}</small></div><div className="bk-pkg-price"><b>{gbp(data.item.amount ?? data.pkg?.price ?? L?.price_from)}</b><small>{quoted ? "Quoted" : "Starting from"}</small></div></div>
          </div>
        </div>
      </section>

      <section className="ce-card bk-sec">
        <h2 className="bk-h">2. Date, time &amp; guests</h2><p className="bk-sub">These details are prefilled from your event. You can adjust them if needed.</p>
        <div className="bk-row3">
          <div className={`bk-f ${errs.date ? "bk-err" : ""}`}><label htmlFor="bk-date">Event date</label><div className="bk-date"><span className="bk-in bk-in-ic bk-datebox"><CalendarDays size={17} /><span className="bk-date-label">{r.date ? fmtDate(r.date) : "Choose a date"}</span><input id="bk-date" type="date" value={r.date} min={new Date().toISOString().slice(0, 10)} onChange={e => set("date", e.target.value)} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch { /* unsupported */ } }} /></span><label className="bk-check"><input type="checkbox" checked={r.flexible_dates} onChange={e => set("flexible_dates", e.target.checked)} />Flexible dates<span title="The provider can suggest nearby dates if yours isn't available."><Info size={14} /></span></label></div></div>
          <div className="bk-f"><label htmlFor="bk-start">Start time</label><span className="bk-in bk-in-ic bk-times"><Clock size={17} /><select id="bk-start" value={r.start} onChange={e => set("start", e.target.value)} aria-label="Start time">{TIMES.map(t => <option key={t}>{t}</option>)}</select><span className="bk-to">to</span><select value={r.end} onChange={e => set("end", e.target.value)} aria-label="End time">{TIMES.map(t => <option key={t}>{t}</option>)}</select></span></div>
          <div className={`bk-f ${errs.guests ? "bk-err" : ""}`}><label>Total guests</label><span className="bk-in bk-in-ic bk-guests"><Users size={17} /><NumberStepper value={r.guests} min={1} max={L?.capacity ? Math.max(L.capacity * 2, 10) : 100000} onChange={v => set("guests", v)} label="Total guests" /></span></div>
        </div>
        {isVenue && <div className="bk-split"><span>Guest breakdown (optional)</span><label>Adults<NumberStepper value={r.adults ?? 0} onChange={v => set("adults", v)} label="Adults" /></label><label>Children (under 16)<NumberStepper value={r.children ?? 0} onChange={v => set("children", v)} label="Children" /></label></div>}
        {L?.capacity && r.guests > L.capacity && <div className="bk-avail red"><XCircle size={20} /><div><b>Over capacity</b><small>{L.name} holds up to {L.capacity} guests. Reduce your numbers or choose another {kind}.</small></div></div>}
        <AvailNotice avail={avail} checking={checking} />
      </section>

      <section className="ce-card bk-sec">
        <h2 className="bk-h">3. Setup, access &amp; logistical requirements</h2><p className="bk-sub">Let the provider know about setup, access and any specific requirements.</p>
        <div className="bk-row3 even">
          <div className="bk-f"><label htmlFor="bk-setup">Setup time (optional)</label><span className="bk-in bk-in-ic"><Clock size={17} /><span className="bk-pre">From</span><select id="bk-setup" value={r.setup} onChange={e => set("setup", e.target.value)}><option value="">Not needed</option>{TIMES.map(t => <option key={t}>{t}</option>)}</select></span></div>
          <div className="bk-f"><label htmlFor="bk-access">Access information <span title="How suppliers and equipment reach the space."><Info size={14} /></span></label><span className="bk-in bk-in-ic"><Truck size={17} /><select id="bk-access" value={r.access} onChange={e => set("access", e.target.value as BookingRequirements["access"])}><option value="standard">Standard access</option><option value="step_free">Step-free access needed</option><option value="loading_bay">Loading bay / vehicle access</option><option value="restricted">Restricted / timed access</option></select></span></div>
          <div className="bk-f"><label htmlFor="bk-break">Breakdown time (optional)</label><span className="bk-in bk-in-ic"><Clock size={17} /><span className="bk-pre">By</span><select id="bk-break" value={r.breakdown} onChange={e => set("breakdown", e.target.value)}><option value="">Not needed</option>{TIMES.map(t => <option key={t}>{t}</option>)}</select></span></div>
        </div>
        <div className="bk-f" style={{ marginTop: 14 }}><label htmlFor="bk-notes">Additional logistics or notes (optional)</label><span className="bk-ta"><textarea id="bk-notes" value={r.notes} maxLength={500} onChange={e => set("notes", e.target.value)} placeholder="e.g. parking, lift access, deliveries, noise restrictions..." /><small>{r.notes.length}/500</small></span></div>
      </section>

      <section className="ce-card bk-sec">
        <h2 className="bk-h">4. Provider questions</h2><p className="bk-sub">The provider has some specific questions to help them prepare the best quote for you.</p>
        {data.questions.map(q => <fieldset key={q.id} className={`bk-q ${errs[`q_${q.id}`] ? "bk-err" : ""}`}><legend>{q.label}{q.required && <span className="k-red"> *</span>}</legend>
          <div className="bk-opts">{q.options.map(o => <label key={o.value} className="bk-opt" data-on={r.answers[q.id] === o.value || undefined}><input type="radio" name={q.id} checked={r.answers[q.id] === o.value} onChange={() => set("answers", { ...r.answers, [q.id]: o.value })} /><span className="bk-radio">{r.answers[q.id] === o.value && <Check size={12} strokeWidth={3} />}</span><span><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span></label>)}</div></fieldset>)}
      </section>
    </div> : <Step2 data={data} r={r} opt={opt} setOpt={setOpt} quoted={quoted} base={base} isVenue={isVenue} agree={agree} setAgree={setAgree} />}

    <aside className="bk-side">
      {step === 1 && <button className="k-btn outline bk-save" onClick={() => void save("exit")} disabled={pending}><Save size={16} />Save and exit</button>}
      {listingCard}
      {step === 1 ? <>
        <section className="ce-card bk-standby"><b>Backup / standby options</b><p>If your preferred date isn&apos;t available, would you like the provider to suggest alternative dates or standby options?</p>
          <label className="bk-check"><input type="checkbox" checked={r.alt_dates} onChange={e => set("alt_dates", e.target.checked)} />Yes, I&apos;m interested in alternative dates</label>
          <label className="bk-check"><input type="checkbox" checked={r.standby_interest} onChange={e => set("standby_interest", e.target.checked)} />Yes, I&apos;m interested in a standby option</label>
          <div className="bk-note"><Info size={14} />Standby options can help secure a {kind} if your preferred date becomes available due to cancellations.</div></section>
        <section className="ce-card bk-tips"><div className="k-row" style={{ gap: 8 }}><Lightbulb size={20} className="bk-spark" /><b>Tips</b></div><p>Based on your event and this {kind}, here are a few tips:</p>
          <ul>{tips.map(t => <li key={t}><Lightbulb size={18} />{t}</li>)}</ul></section>
        <RequestAttachments files={r.attachments??[]} onChange={files=>set("attachments",files)} onBusy={setAttachmentUploading}/>
        <button className="k-btn primary bk-continue" onClick={() => void save("next")} disabled={pending||attachmentUploading}>{pending ? <Loader2 size={16} className="k-spin" /> : null}Continue to Review &amp; Quote <ArrowRight size={17} /></button>
      </> : <>
        <section className="ce-card bk-key"><b>Key information</b><dl>
          <div><dt><Clock size={15} />Response time</dt><dd>Within {L?.response_hours ?? 48} hours</dd></div>
          <div><dt><Lock size={15} />Hold period</dt><dd>Provider-confirmed deadline</dd></div>
          <div><dt><Clock size={15} />Cancellation</dt><dd>{data.item.quote.terms?.cancellation ?? "Free until you approve a quote"}</dd></div>
          <div><dt><CreditCard size={15} />Payment</dt><dd>{quoted ? `${gbp(depositOf(data))} deposit + ${gbpPence(bookingAdminFee(depositOf(data)))} admin fee on booking` : "No payment for a request or conditional hold"}</dd></div>
          <div><dt><FileText size={15} />Full terms</dt><dd>{L ? <Link className="k-link" href={`${L.href}#terms`}>View {kind} terms <ArrowRight size={13} /></Link> : "Shared with your quote"}</dd></div></dl></section>
        <section className="ce-card bk-tips"><div className="k-row" style={{ gap: 8 }}><Lightbulb size={20} className="bk-spark" /><b>Tips</b></div><p>Here&apos;s what will happen when you submit:</p>
          <ol className="bk-steps4">{whatHappens(opt, data).map((t, i) => <li key={t}><span>{i + 1}</span>{t}</li>)}</ol></section>
      </>}
    </aside>

    {step === 2 && <div className="bk-bar">
      <Link className="k-btn outline" href={`${base}&step=1`}><ArrowLeft size={16} />Back to Requirements</Link>
      <label className="bk-check bk-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />I agree to the {kind}&apos;s {L ? <Link href={`${L.href}#terms`} className="k-underline">terms and conditions</Link> : "terms and conditions"}<span className="k-red">*</span></label>
      <button className="k-btn primary bk-submit" onClick={() => void submit()} disabled={pending}>{pending && <Loader2 size={16} className="k-spin" />}{opt === "accept" ? `Book & pay ${gbpPence(depositOf(data) + bookingAdminFee(depositOf(data)))}` : opt === "hold" ? "Request Hold" : opt === "standby" ? "Join Standby List" : data.submitted ? "Update Booking Request" : "Submit Booking Request"}<ArrowRight size={17} /></button>
    </div>}
  </div>;
}

const depositOf = (d: BookingData) => Math.min(d.item.amount ?? 0, d.item.deposit || Math.round((d.item.amount ?? 0) * Number(d.item.quote.deposit_pct ?? 30)) / 100);
const estimateOf = (d: BookingData) => d.item.amount ?? d.pkg?.price ?? d.listing?.price_from ?? null;
function whatHappens(opt: Opt, d: BookingData) {
  const who = d.listing?.kind === "venue" ? "venue" : "provider";
  if (opt === "accept") return [`We'll charge your ${gbp(depositOf(d))} deposit plus a ${gbpPence(bookingAdminFee(depositOf(d)))} booking admin fee`, `Your booking with ${d.item.title} confirms after successful payment`, "The balance is scheduled in Money", "You can message the provider any time"];
  if (opt === "hold") return [`We'll ask the ${who} for a conditional hold`, "No card authorization or charge", "The provider must confirm the hold and its deadline", "Review the quote before approving any payment"];
  if (opt === "standby") return [`We'll add you to the ${who}'s standby list`, "You'll be alerted if your date opens up", "There's no charge and no commitment", "You can request a quote at any time"];
  return [`We'll send your booking request to the ${who}`, `They'll respond within ${d.listing?.response_hours ?? 48} hours`, "You'll receive a formal quote to review", "No payment is taken unless you approve the quote"];
}

function AvailNotice({ avail, checking }: { avail: Availability | null; checking: boolean }) {
  if (checking && !avail) return <div className="bk-avail gray"><Loader2 size={20} className="k-spin" /><div><b>Checking availability…</b></div></div>;
  if (!avail) return null;
  const m = { available: ["green", CheckCircle2, "This date is available for this listing", "The provider will confirm final availability when they respond to your request."], limited: ["amber", AlertTriangle, "Limited availability on this date", "Another booking is provisionally held. A conditional hold or standby improves your chances."], unavailable: ["red", XCircle, "Not available on this date", "Try flexible dates, pick another date, or join the standby list in the next step."], unknown: ["gray", Info, "Availability will be confirmed by the provider", "They'll check their calendar when they respond."] } as const;
  const [tone, Icon, t, s] = m[avail];
  return <div className={`bk-avail ${tone}`} role="status"><Icon size={20} /><div><b>{t}</b><small>{s}</small></div></div>;
}

function ListingTabs({ data }: { data: BookingData }) {
  const [tab, setTab] = useState<"about" | "amenities" | "location" | "reviews">("about"); const L = data.listing!;
  return <div className="bk-tabs">
    <div role="tablist" className="bk-tablist">{(["about", "amenities", "location", "reviews"] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === "about" ? (data.listing?.kind === "venue" ? "About" : "Overview") : t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
    <div role="tabpanel" className="bk-tabpanel">
      {tab === "about" && <><p>{L.description || "Details are shared in the provider's profile."}</p>{L.gallery.length > 0 && <div className="bk-strip">{L.gallery.slice(0, 4).map((g, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={g + i} src={g} alt="" />)}<Link href={L.href} aria-label="More photos"><ChevronRight size={18} /></Link></div>}</>}
      {tab === "amenities" && <ul className="bk-amen">{[L.setting, L.capacity ? `Up to ${L.capacity} guests` : "", ...L.tags].filter(Boolean).slice(0, 8).map(t => <li key={t}><Check size={13} />{t}</li>)}</ul>}
      {tab === "location" && <p className="k-row" style={{ gap: 6 }}><MapPin size={14} />{L.location}</p>}
      {tab === "reviews" && (data.reviews.length ? <ul className="bk-revs">{data.reviews.map((rv, i) => <li key={i}><span>{"★".repeat(rv.rating)}<span className="k-muted">{"★".repeat(5 - rv.rating)}</span></span><p>{rv.body}</p></li>)}</ul> : <p>{L.reviews ? `Rated ${L.rating.toFixed(1)} from ${L.reviews} reviews.` : "No reviews yet."}</p>)}
    </div>
  </div>;
}

function Step2({ data, r, opt, setOpt, quoted, base, isVenue, agree, setAgree }: { data: BookingData; r: BookingRequirements; opt: Opt; setOpt: (o: Opt) => void; quoted: boolean; base: string; isVenue: boolean; agree: boolean; setAgree: (v: boolean) => void }) {
  void agree; void setAgree;
  const L = data.listing; const held = data.item.status === "held";
  const items = (data.item.quote.items ?? []).map(i => ({ label: i.label ?? i.description ?? i.name ?? "Item", total: Number(i.qty ?? 1) * Number(i.unit_price ?? 0) }));
  const est = estimateOf(data);
  const lines = items.length ? items : est != null ? [{ label: data.pkg?.name ?? (data.item.package || "Package estimate"), total: est }] : [];
  const options: { k: Opt; title: string; badge?: string; tone?: string; icon: typeof Lock; text: string; bullets: string[]; disabled?: string }[] = [
    quoted ? { k: "accept", title: "Accept quote & book", badge: "RECOMMENDED", tone: "green", icon: CheckCircle2, text: `Approve the ${gbp(data.item.amount)} quote${data.item.quote.reference ? ` (${data.item.quote.reference})` : ""} and confirm your booking now.`, bullets: [`${gbp(depositOf(data))} deposit charged now`, `Balance ${gbp((data.item.amount ?? 0) - depositOf(data))} scheduled`, "Booking confirms after successful payment"], disabled: undefined }
      : { k: "request", title: "Send a booking request", badge: "RECOMMENDED", tone: "green", icon: CalendarDays, text: "Send your requirements to the provider. They'll confirm availability and send a formal quote.", bullets: ["No payment taken now", `Response within ${L?.response_hours ?? 48} hours`, "Option to upgrade to a hold"] },
    { k: "hold", title: "Request a conditional hold", badge: "MOST POPULAR", tone: "purple", icon: Lock, text: `Secure a provisional hold while the provider reviews your request.`, bullets: ["No card authorization or charge", "Provider confirmation required", "Agreed hold expires at its recorded deadline"], disabled: held ? "Already held" : undefined },
    { k: "standby", title: "Add to standby list", icon: ShieldCheck, text: "If your dates aren't available, we'll ask the provider to consider alternative dates and add you to their standby list.", bullets: ["No standby fee", "Get alerted if availability opens", "No commitment to book"] },
  ];
  return <div className="bk-main">
    <section className="ce-card bk-sec">
      <div className="k-between"><h2 className="bk-h">1. Selected {isVenue ? "venue" : "provider"} &amp; dates</h2></div>
      <div className="bk-sum">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={L?.image || data.item.image} alt="" />
        <div className="k-grow"><div className="k-between" style={{ alignItems: "flex-start" }}><div><span className="bk-kind">{isVenue ? "VENUE" : catLabel(L, data.item.category).toUpperCase()}</span><h3 className="bk-name">{L?.name ?? data.item.title}</h3></div><Link className="k-btn outline bk-change" href={`${base}&step=1`}><CalendarDays size={15} />Change details</Link></div>
          {L && <div className="bk-loc"><span><MapPin size={14} />{L.location}</span><span><Star size={14} fill="#f59e0b" color="#f59e0b" />{L.rating.toFixed(1)} ({L.reviews} reviews)</span></div>}
          <div className="bk-facts"><span><CalendarDays size={19} /><span><b>{fmtDate(r.date)}</b><small>{r.start} – {r.end}{r.flexible_dates ? " · flexible" : ""}</small></span></span><span><Users size={19} /><span><b>{r.guests} guests</b><small>{r.adults || r.children ? `${r.adults ?? 0} adults, ${r.children ?? 0} children` : "Breakdown not set"}</small></span></span><span><Building2 size={19} /><span><b>{data.pkg?.name ?? data.item.package ?? "Standard"}</b><small>{r.answers.layout ? `${data.questions.find(q => q.id === "layout")?.options.find(o => o.value === r.answers.layout)?.label ?? ""}` : isVenue ? "Layout to confirm" : catLabel(L, data.item.category)}</small></span></span></div></div></div>
    </section>

    <section className="ce-card bk-sec">
      <h2 className="bk-h">2. Choose your booking option</h2><p className="bk-sub">Select how you&apos;d like to proceed. You can always discuss, adjust or upgrade later.</p>
      <div className="bk-cards" role="radiogroup" aria-label="Booking option">{options.map(o => <button key={o.k} role="radio" aria-checked={opt === o.k} className="bk-card" data-on={opt === o.k || undefined} disabled={!!o.disabled} title={o.disabled} onClick={() => setOpt(o.k)}>
        {opt === o.k && <span className="bk-card-tick"><Check size={13} strokeWidth={3} /></span>}
        <span className="bk-card-head"><span className="bk-card-ic"><o.icon size={22} /></span><span><b>{o.title}</b>{o.badge && <i className={`bk-badge ${o.tone}`}>{o.badge}</i>}</span></span>
        <span className="bk-card-text">{o.text}</span>
        <ul>{o.bullets.map(b => <li key={b}><CheckCircle2 size={16} />{b}</li>)}</ul>
        {o.disabled && <small className="bk-card-dis">{o.disabled}</small>}</button>)}</div>
    </section>

    <section className="ce-card bk-sec">
      <h2 className="bk-h">3. Pricing, hold and payment details</h2><p className="bk-sub">{quoted ? "Based on the provider's quote." : "This is an estimate based on the selected package. The final quote may vary depending on your requirements."}</p>
      <div className="bk-price">
        <div className="bk-price-est"><small>{quoted ? "Quoted price" : "Estimated price"}</small><b>{gbp(quoted ? data.item.amount : est)}</b><span>{data.pkg?.name ?? data.item.package}</span></div>
        <dl className="bk-price-lines">{lines.slice(0, 5).map(l => <div key={l.label}><dt>{l.label}</dt><dd>{gbp(l.total)}</dd></div>)}{!lines.length && <div><dt>Quote to follow</dt><dd>—</dd></div>}</dl>
        <div className="bk-price-dep"><div className="k-between"><b>{opt === "accept" ? "Deposit (today)" : "Payment on submission"}</b><span className={`bk-refund ${opt === "accept" ? "blue" : ""}`}>{opt === "accept" ? "Secures booking" : "No charge"}</span></div><strong>{gbp(opt === "accept" ? depositOf(data) : 0)}</strong><small>{opt === "accept" ? `Plus a ${gbpPence(bookingAdminFee(depositOf(data)))} Gala Dock booking admin fee (${BOOKING_ADMIN_FEE.pct}%, min £${BOOKING_ADMIN_FEE.minimum}): ${gbpPence(depositOf(data) + bookingAdminFee(depositOf(data)))} today. Balance of ${gbp((data.item.amount ?? 0) - depositOf(data))} (plus its admin fee) scheduled before your event.` : opt === "hold" ? "No card authorization or charge. A hold needs provider confirmation." : "Nothing is charged for a request or standby."}</small></div>
      </div>
      <div className="bk-info3">
        <div><Clock size={22} /><span><small>Response deadline</small><b>{data.item.response_deadline && ["sent", "awaiting"].includes(data.item.status) ? new Date(data.item.response_deadline).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : `${L?.response_hours ?? 48} hours`}</b><em>You&apos;ll be notified by email and in your event.</em></span></div>
        <div><Lock size={22} /><span><small>Hold period (if selected)</small><b>{held && data.item.hold_expires_at ? `Until ${new Date(data.item.hold_expires_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "Subject to provider confirmation"}</b><em>A request does not reserve your date.</em></span></div>
        <div><FileText size={22} /><span><small>Cancellation terms (summary)</small>{L ? <Link className="k-link" href={`${L.href}#terms`}>See full terms</Link> : <b>With your quote</b>}<em>{data.item.quote.terms?.cancellation ?? "Requests and holds can be cancelled free of charge."}</em></span></div>
      </div>
    </section>

    <section className="ce-card bk-sec">
      <h2 className="bk-h">4. Payment method</h2><p className="bk-sub">Requests, holds and standby do not need a saved card. Quote payments are confirmed in secure checkout, where you can add a payment method.</p>
      <div className="bk-pay">
        {data.card ? <label className="bk-card-row" data-on><input type="radio" name="pm" defaultChecked /><span className="bk-radio on"><Check size={11} strokeWidth={3} /></span><CreditCard size={24} aria-hidden="true"/><b>{data.card.brand.toUpperCase()} ending {data.card.last4}</b><small>Expires {data.card.exp}</small><span className="bk-default">{data.card.test ? "Test mode" : "Default"}</span></label>
          : <div className="bk-card-row empty"><CreditCard size={18} /><span>{data.cardUnavailable ? "Saved payment methods couldn't load. Requests, holds and standby still work." : "No card on file. Add a payment method in secure checkout when accepting a quote."}</span></div>}
        <Link className="bk-card-row add" href="/account?tab=payments"><span className="bk-radio" /><CreditCard size={18} /><b>Add a new card</b></Link>
        <Menu label="Payment options" width={220} trigger={({ toggle, open, id }) => <button className="k-icon-btn bk-pay-more" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Payment options"><MoreHorizontal size={16} /></button>}>{close => <><Link role="menuitem" className="k-menu-item" href="/account/settings?tab=payments" onClick={close}><CreditCard size={14} />Manage payment methods</Link><button role="menuitem" className="k-menu-item" onClick={close}><X size={14} />Close</button></>}</Menu>
      </div>
    </section>
  </div>;
}

