import Link from "next/link";
import { Sparkles, Lightbulb, CircleCheck, CircleAlert, Info, ArrowLeft, ArrowRight, Save, House, Monitor, Users, CalendarClock, ShieldCheck, FileText, ShieldAlert, CalendarDays, Clock3,
  Percent, Ban, Boxes, Wrench, Calendar, MessageSquare, Plus, MoreVertical, FileCheck2 } from "lucide-react";
import { ActionForm } from "@/components/workspace/actions";
import { money } from "@/lib/workspace/format";
import type { Listing } from "@/lib/provider/queries";
import { CoverageMap, UK_PLACES } from "@/components/workspace/coverage-map";
import { saveServiceBasics, saveServicePricing, saveServiceAvailability } from "../actions";
import { PhotoManager } from "../../venues/_components/photo-manager";
import { RowMenu } from "../../_components/row-menu";
import { Counted } from "../../venues/new/preview";

export type Svc = {
  delivery?: string; coverage?: { mode?: string; radius_miles?: number; base?: string; areas?: string }; event_types?: string[]; credentials?: { name: string; reference?: string; expires?: string; required?: boolean }[];
  pricing?: { model?: string; show_price?: boolean }; addons?: { name: string; desc: string; price: number; unit: string }[]; questions?: { label: string; type: string; required: boolean }[];
  setup?: { setup_minutes?: number; packdown_minutes?: number; space?: string; power?: boolean; covered?: boolean; parking?: boolean; dressing?: boolean }; lead?: { min_days?: number; max_days?: number | null };
  cancellation?: { window: string; refund: number }[]; availability?: { week?: Record<string, [string, string] | null> }; capacity?: { per_day?: number; per_week?: number | null; multi_same_day?: boolean; travel_buffer_minutes?: number };
  holds?: { enabled?: boolean; hours?: number }; standby?: { enabled?: boolean }; emergency?: { enabled?: boolean }; included?: string[]; excluded?: string[]; service_type?: string; durations?: string; team?: string; equipment?: string; travel?: string; docs?: string;
};
export type Pkg = { id: string; name: string; description: string; base_price: number; image: string; duration_hours: number | null; status: string };
const EVENT_TYPES = ["Weddings", "Corporate Events", "Private Parties", "Nightclub", "Festivals", "Birthdays", "Children’s Parties", "Conferences", "Exhibitions", "Product Launches", "Live Shows", "Other"];
const CATEGORIES = ["Entertainment > DJ", "Entertainment > Live music", "Entertainment > Performers", "Catering > Full service", "Catering > Street food", "Production > AV & lighting", "Production > Staging",
  "Photography & video", "Decor & styling", "Furniture & hire", "Staffing & security", "Transport", "Other"];
const Toggle = ({ name, label, sub, on }: { name: string; label: string; sub?: string; on?: boolean }) =>
  <label className="vw-switch"><input type="checkbox" name={name} defaultChecked={!!on} /><i aria-hidden="true" /><span><b>{label}</b>{sub && <small>{sub}</small>}</span></label>;
const Foot = ({ back, next, step, draftName = "_draft" }: { back?: string; next: string; step: number; draftName?: string }) => <div className="vw-foot">
  {back ? <Link href={back} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link> : null}
  {!next.startsWith("Save") && <button type="submit" name={draftName} value="1" className="ws-btn outline"><Save aria-hidden="true" />Save as draft</button>}
  <span className="ws-spacer" />{!next.startsWith("Save") && <span className="vw-stepof">Step {step} of 5</span>}<button type="submit" className="ws-btn primary">{next}<ArrowRight aria-hidden="true" /></button></div>;
const Agent = ({ items, title = "Based on your selection, I suggest:", goal, cta = "Ask Gala Agent" }: { items: (string | [string, boolean])[]; title?: string; goal: string; cta?: string }) =>
  <section className="ws-panel vw-agent svw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
    <div className="sb-agent-box"><span className="svw-agent-av" aria-hidden="true"><Sparkles /></span><p>{title}</p>
      <ul>{items.map(i => { const [l, ok] = typeof i === "string" ? [i, true] : i; return <li key={l} className={ok ? "" : "todo"}>{ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{l}</li>; })}</ul>
      <Link href={`/provider/agent?goal=${encodeURIComponent(goal)}`} className="ws-btn outline block sm">{cta}</Link></div></section>;

const fmtDay = (iso?: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";
const DELIVERY: Record<string, string> = { onsite: "On-site", remote: "Remote/Online", hybrid: "Hybrid" };

export function SvcStep1({ s, svc, next }: { s: Listing | null; svc: Svc; next: string }) {
  const cov = svc.coverage ?? {}, base = cov.base ?? s?.city ?? "London", photos = s ? [s.image, ...(s.gallery ?? [])].filter(Boolean) : [];
  const creds = ["Public liability insurance", "PAT testing (equipment)", "DBS check (if required)", "Other certifications"];
  const types = svc.event_types ?? [];
  const pl = (svc.credentials ?? []).some(c => c.name.startsWith("Public liability") && (c.reference || c.expires));
  const covText = (cov.mode ?? "local") === "local" ? `${cov.radius_miles ?? 50} miles from ${base}` : cov.mode === "areas" ? (cov.areas || "Specific areas — none listed yet") : cov.mode === "national" ? "National" : "International";
  const suggestions: [string, boolean][] = [[`Category: ${s?.category?.replace(" > ", " & ") || "choose the most specific one"}`, !!s?.category],
    [types.length ? `Event types: ${types.slice(0, 4).join(", ")}${types.length > 4 ? ` +${types.length - 4}` : ""}` : "Pick 3–6 event types you’re best at", types.length >= 3 && types.length <= 6],
    [`Delivery mode: ${DELIVERY[svc.delivery ?? "onsite"]}`, true], [`Coverage: ${covText}`, (cov.mode ?? "local") !== "areas" || !!cov.areas],
    ["Include equipment options and add-on packages", (svc.addons ?? []).length > 0], [pl ? "Public liability insurance added" : "Add public liability insurance", pl]];
  return <div className="vw svw-s1">
    <ActionForm action={saveServiceBasics.bind(null, s?.id ?? null, next)} className="vw-contents">
      <section className="ws-panel svw-basic"><h2>Basic information</h2><p>Tell us what service you provide and how it can be used.</p>
        <div className="vw-grid2"><label>Service name <i>*</i><input name="name" defaultValue={s?.name ?? ""} required minLength={2} maxLength={100} /></label>
          <label>Category <i>*</i><select name="category" className="ws-select" defaultValue={s?.category && CATEGORIES.includes(s.category) ? s.category : CATEGORIES[0]}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <label className="svw-desc">Short description <i>*</i><Counted name="description" rows={4} max={500} defaultValue={s?.description ?? ""} label="Short description" /></label></section>
      <section className="ws-panel svw-delivery"><h2>Delivery mode</h2><p>How is your service delivered?</p>
        <div className="svw-modes">{([["onsite", House, "On-site", "I travel to the event"], ["remote", Monitor, "Remote/Online", "Delivered virtually"], ["hybrid", Users, "Hybrid", "Both on-site and online"]] as const).map(([k, I, l, sub]) =>
          <label key={k}><input type="radio" name="delivery" value={k} defaultChecked={(svc.delivery ?? "onsite") === k} /><I aria-hidden="true" /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
        <div className="svw-cov"><div><h2 className="svw-h2b">Coverage &amp; travel area</h2><p>Where do you operate?</p>
          <div className="svw-covmodes">{([["local", "Local area", "Set a service radius from your base location"], ["areas", "Specific areas", "Choose cities, regions or postcodes"], ["national", "National", "Available across the country"], ["international", "International", "Available worldwide"]] as const).map(([k, l, sub]) =>
            <label key={k}><input type="radio" name="coverage" value={k} defaultChecked={(cov.mode ?? "local") === k} /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
          <label className="svw-areas">Specific areas<input name="areas" defaultValue={cov.areas ?? ""} placeholder="e.g. Surrey, Kent, SE1, Oxford" maxLength={300} /></label></div>
          <div className="svw-covmap"><div className="svw-radius"><label>Radius (miles)<input name="radius" type="number" min={1} max={500} defaultValue={cov.radius_miles ?? 50} /></label>
            <label>Base<select name="base" className="ws-select" defaultValue={base}>{Object.keys(UK_PLACES).map(p => <option key={p}>{p}</option>)}</select></label></div>
            <CoverageMap base={base} radiusMiles={cov.radius_miles ?? 50} width={206} height={204} /></div></div></section>
      <section className="ws-panel svw-types"><h2>Event types</h2><p>Select the types of events this service is suitable for.</p>
        <div className="svw-checks">{EVENT_TYPES.map(t => <label key={t}><input type="checkbox" name="event_types" value={t} defaultChecked={types.includes(t)} />{t}</label>)}</div></section>
      <section className="ws-panel vw-docs svw-creds"><h2>Credentials &amp; trust</h2><p>Add relevant qualifications, insurance and certifications.</p>
        <ul>{creds.map((c, i) => { const x = (svc.credentials ?? []).find(y => y.name === c), st = x?.reference || x?.expires ? "added" : "";
          return <li key={c}><details><summary><span className={`vw-doc-ic ${st || (i === 2 ? "" : "")}`}>{i === 3 ? <FileText aria-hidden="true" /> : i === 2 ? <ShieldCheck aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}</span><b>{c}</b>
            <span className={`vw-doc ${st}`}>{st ? "Added" : i === 2 ? "Not required" : "Missing"}</span>
            <span className="vw-doc-exp">{x?.expires ? `Expires ${fmtDay(x.expires)}` : x?.reference || ""}</span>
            <span className="vw-doc-more" aria-label={`Edit ${c}`}><MoreVertical aria-hidden="true" /></span></summary>
            <div className="vw-doc-edit"><input name={`cred_ref_${i}`} defaultValue={x?.reference ?? ""} placeholder={i === 0 ? "Cover amount or policy number" : "Reference"} aria-label={`${c} reference`} maxLength={60} />
              <input name={`cred_exp_${i}`} type="date" defaultValue={x?.expires ?? ""} aria-label={`${c} expiry`} /></div></details></li>; })}</ul></section>
      <Foot next="Next: Pricing & Packages" step={1} />
    </ActionForm>
    <aside className="vw-side svw-side1">
      <Agent goal={`Help me set up ${s?.name ?? "my new service"}`} items={suggestions} cta="Review with Gala Agent" />
      <section className="ws-panel vw-tips svw-tips"><h3><Lightbulb aria-hidden="true" />Tips</h3><ul>{["Choose the most specific category for better visibility.", "Add clear photos and a short video.", "Include any required certifications for your category.", "Set an accurate coverage area to receive relevant opportunities."].map(t => <li key={t}>{t}</li>)}</ul></section>
    </aside>
    <div className="svw-media">{s ? <PhotoManager venueId={s.id} initial={photos} strip /> : <section className="ws-panel vw-strip"><h2>Service images &amp; video</h2><p>Save the basics first, then add photos that show your work.</p></section>}</div>
  </div>;
}

export function SvcStep2({ s, svc, pkgs, back, next, label }: { s: Listing; svc: Svc; pkgs: Pkg[]; back?: string; next: string; label?: string }) {
  const model = svc.pricing?.model ?? (pkgs.length ? "package" : "from"), addons = svc.addons ?? [], qs = svc.questions ?? [{ label: "Event date", type: "date", required: true }, { label: "Event type", type: "dropdown", required: true }, { label: "Guest count (approx.)", type: "number", required: true }, { label: "Special requests", type: "long_text", required: false }];
  const canc = svc.cancellation ?? [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }], st = svc.setup ?? {};
  const prices = pkgs.map(p => Number(p.base_price));
  const summary: [typeof Percent, string, string][] = [[Percent, "Pricing model", ({ fixed: "Fixed price", from: "From price", quote: "Quote only", hourly: "Hourly rate", daily: "Daily rate", package: "Package based" } as Record<string, string>)[model] ?? model],
    [Boxes, "Packages", pkgs.length ? `${pkgs.length} package${pkgs.length === 1 ? "" : "s"} (${money(Math.min(...prices))} – ${money(Math.max(...prices))})` : "None yet"], [Plus, "Add-ons", `${addons.length} add-on${addons.length === 1 ? "" : "s"}`],
    [Wrench, "Setup time", `${(st.setup_minutes ?? 60) / 60} hour${(st.setup_minutes ?? 60) === 60 ? "" : "s"}`], [Wrench, "Pack down time", `${(st.packdown_minutes ?? 60) / 60} hour${(st.packdown_minutes ?? 60) === 60 ? "" : "s"}`],
    [CalendarClock, "Minimum lead time", `${svc.lead?.min_days ?? 7} days`], [Ban, "Cancellation policy", canc.map(c => `${c.window}: ${c.refund}%`).join(" / ")]];
  return <div className="vw svw-s2">
    <ActionForm action={saveServicePricing.bind(null, s.id, next)} className="vw-contents">
      <section className="ws-panel svw-model"><h2>Pricing model</h2><p>Choose how this service is purchased on the marketplace.</p>
        <div className="svw-models">{([["fixed", "Fixed price", "Set a clear price for standard bookings."], ["from", "From price", "Show a starting price range."], ["quote", "Quote only", "No public price; customers request a quote."], ["hourly", "Hourly rate", "Charge by the hour."], ["daily", "Daily rate", "Charge per day."], ["package", "Package based", "Offer multiple packages."]] as const).map(([k, l, sub]) =>
          <label key={k}><input type="radio" name="model" value={k} defaultChecked={model === k} /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
        <div className="vw-pair"><label>Starting price <i>*</i><span className="vw-money"><em>£</em><input name="price_from" type="number" min={0} defaultValue={s.price_from ?? (prices.length ? Math.min(...prices) : "")} /></span></label>
          <div className="svw-showprice"><b>Price display on marketplace</b><Toggle name="show_price" label="Show price publicly" sub="You can still require a quote for complex events." on={svc.pricing?.show_price ?? true} /></div></div></section>
      <section className="ws-panel svw-addons"><div className="svw-h"><div><h2>Add-ons <small>(optional)</small></h2><p>Offer extra services or upgrades.</p></div></div>
        <ul>{[0, 1, 2, 3].map(i => { const a = addons[i]; return <li key={i}><input name={`addon_name_${i}`} defaultValue={a?.name ?? ""} placeholder={i === 0 ? "e.g. Uplighting" : "Add-on name"} aria-label={`Add-on ${i + 1} name`} />
          <input name={`addon_desc_${i}`} defaultValue={a?.desc ?? ""} placeholder="Short description" aria-label={`Add-on ${i + 1} description`} />
          <span className="vw-money"><em>£</em><input name={`addon_price_${i}`} type="number" min={0} defaultValue={a?.price ?? ""} aria-label={`Add-on ${i + 1} price`} /></span>
          <select name={`addon_unit_${i}`} className="ws-select" defaultValue={a?.unit ?? "per event"} aria-label={`Add-on ${i + 1} unit`}><option>per event</option><option>per hour</option><option>per guest</option></select></li>; })}</ul></section>
      <section className="ws-panel svw-qs"><div className="svw-h"><div><h2>Customer questions</h2><p>Collect key information when customers book or request a quote.</p></div></div>
        <ul>{[0, 1, 2, 3, 4, 5].map(i => { const q = qs[i]; return <li key={i}><input name={`q_label_${i}`} defaultValue={q?.label ?? ""} placeholder="Question" aria-label={`Question ${i + 1}`} />
          <select name={`q_type_${i}`} className="ws-select" defaultValue={q?.type ?? "text"} aria-label={`Question ${i + 1} type`}><option value="text">Short text</option><option value="long_text">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option></select>
          <Toggle name={`q_req_${i}`} label="Required" on={q?.required} /></li>; })}</ul></section>
      <section className="ws-panel svw-setup"><h2>Setup &amp; requirements</h2><p>Define what’s needed to deliver this service.</p>
        <div className="vw-grid2"><label>Setup time<span className="vw-money"><input name="setup_h" type="number" min={0} step={0.5} defaultValue={(st.setup_minutes ?? 60) / 60} /><em className="r">hours</em></span></label>
          <label>Pack down time<span className="vw-money"><input name="packdown_h" type="number" min={0} step={0.5} defaultValue={(st.packdown_minutes ?? 60) / 60} /><em className="r">hours</em></span></label></div>
        <label>Space requirements <small>(optional)</small><textarea name="space" rows={2} maxLength={500} defaultValue={st.space ?? ""} /></label>
        <div className="vw-grid2 vw-tg"><Toggle name="r_power" label="Requires power (electricity)" on={st.power} /><Toggle name="r_covered" label="Requires covered area" on={st.covered} /><Toggle name="r_parking" label="Requires secure parking" on={st.parking} /><Toggle name="r_dressing" label="Requires dressing room" on={st.dressing} /></div></section>
      <section className="ws-panel svw-lead"><h2>Lead time &amp; cancellation</h2><p>Control how far in advance customers can book and your cancellation terms.</p>
        <div className="vw-grid2"><label>Minimum lead time<span className="vw-money"><input name="lead_min" type="number" min={0} defaultValue={svc.lead?.min_days ?? 7} /><em className="r">days</em></span></label>
          <label>Maximum lead time <small>(optional)</small><span className="vw-money"><input name="lead_max" type="number" min={0} defaultValue={svc.lead?.max_days ?? 365} /><em className="r">days</em></span></label></div>
        <div className="vw-cancel-rows">{[0, 1, 2].map(i => <div key={i}><input name={`c_window_${i}`} defaultValue={canc[i]?.window ?? ""} aria-label={`Cancellation window ${i + 1}`} /><span className="vw-money"><input name={`c_refund_${i}`} type="number" min={0} max={100} defaultValue={canc[i]?.refund ?? ""} aria-label={`Refund ${i + 1}`} /><em className="r">% refund</em></span></div>)}</div></section>
      <Foot back={back} next={label ?? "Next: Availability & Requirements"} step={2} />
    </ActionForm>
    <section className="ws-panel svw-rates"><div className="svw-h"><div><h2>Rates &amp; packages</h2><p>Standard packages customers can book. Each is a live package listing.</p></div>
      <Link className="ws-btn outline sm" href={`/provider/packages/new?step=1&listing=${s.id}`}><Plus aria-hidden="true" />Add package</Link></div>
      {pkgs.length ? <ul>{pkgs.map(p => <li key={p.id}>{/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt="" /> : <span className="qb-noimg" />}<span><b>{p.name}</b><small>{[p.duration_hours ? `${p.duration_hours} hours` : null, p.description].filter(Boolean).join(" • ")}</small></span>
        <em>{money(p.base_price)}</em><RowMenu label={`Actions for ${p.name}`} entries={[{ kind: "link", label: "Edit package", href: `/provider/packages/${p.id}` }]} /></li>)}</ul>
        : <p className="pv-none">No packages yet — add your standard offers so customers can book instantly or request them.</p>}</section>
    <aside className="vw-side svw-side2"><Agent goal={`Review pricing for ${s.name}`} title="Things to check before you continue:" items={["Packages cover your common booking lengths", "Add-ons for frequent upgrades", "Travel fee for events beyond your radius", "Deposit and cancellation terms are clear"]} />
      <section className="ws-panel vw-summary-card"><h2>Pricing summary</h2><ul>{summary.map(([I, l, v]) => <li key={l}><I aria-hidden="true" /><b>{l}</b><span>{v}</span></li>)}</ul></section></aside>
  </div>;
}

export function SvcStep3({ s, svc, back, next, verify, label }: { s: Listing; svc: Svc; back?: string; next: string; verify: [string, string, boolean][]; label?: string }) {
  const week = svc.availability?.week ?? { mon: ["09:00", "23:00"], tue: ["09:00", "23:00"], wed: ["09:00", "23:00"], thu: ["09:00", "23:00"], fri: ["09:00", "02:00"], sat: ["09:00", "02:00"], sun: null };
  const cap = svc.capacity ?? {}, photos = [s.image, ...(s.gallery ?? [])].filter(Boolean);
  const checks: [string, boolean][] = [["Availability schedule configured", !!svc.availability], ["Response commitment meets marketplace requirements", s.response_hours <= 8], ["Pricing and packages configured", !!s.price_from || svc.pricing?.model === "quote"],
    ["Required credentials added", (svc.credentials ?? []).some(c => c.reference)], ["Consider enabling emergency bookings", !!svc.emergency?.enabled], ["Add at least 3 photos to improve conversion", photos.length >= 3]];
  return <ActionForm action={saveServiceAvailability.bind(null, s.id, next)} className="vw svw-s3">
    <section className="ws-panel svw-avail"><div className="vw-sec-h"><span className="vw-ic"><Calendar aria-hidden="true" /></span><div><h2>Availability</h2><p>Set when you are available to deliver this service.</p></div></div>
      <ul className="svw-week">{(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(d => <li key={d}><span>{({ mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" })[d]}</span>
        <label className="vw-switch"><input type="checkbox" name={`on_${d}`} defaultChecked={!!week[d]} /><i aria-label={`${d} available`} /></label>
        <input type="time" name={`from_${d}`} defaultValue={week[d]?.[0] ?? "09:00"} aria-label={`${d} from`} /><ArrowRight aria-hidden="true" /><input type="time" name={`to_${d}`} defaultValue={week[d]?.[1] ?? "23:00"} aria-label={`${d} to`} /></li>)}</ul></section>
    <section className="ws-panel svw-cap"><div className="vw-sec-h"><span className="vw-ic"><Users aria-hidden="true" /></span><div><h2>Capacity &amp; limits</h2><p>Set how many bookings you can take and any limits.</p></div></div>
      <div className="vw-grid2"><label>Max bookings per day<input name="per_day" type="number" min={1} defaultValue={cap.per_day ?? 1} /></label><label>Max bookings per week<input name="per_week" type="number" min={1} defaultValue={cap.per_week ?? ""} /></label></div>
      <Toggle name="multi" label="Allow multiple bookings on the same day" on={cap.multi_same_day} />
      <div className="svw-buffer"><Toggle name="buffer" label="Block travel time between bookings" on={!!cap.travel_buffer_minutes} /><select name="buffer_h" className="ws-select" defaultValue={(cap.travel_buffer_minutes ?? 60) / 60} aria-label="Travel buffer"><option value={0.5}>30 minutes</option><option value={1}>1 hour</option><option value={2}>2 hours</option></select></div></section>
    <section className="ws-panel svw-resp"><div className="vw-sec-h"><span className="vw-ic"><MessageSquare aria-hidden="true" /></span><div><h2>Response &amp; booking mode</h2><p>Choose how customers can book and how quickly you respond.</p></div></div>
      <div className="svw-bmodes">{([["instant", "Instant book", "Customers can book and pay immediately."], ["request", "Request to book", "Customers send a request, you approve."], ["enquiry", "Enquiry only", "Customers send an enquiry, no booking."]] as const).map(([k, l, sub]) =>
        <label key={k}><input type="radio" name="booking_mode" value={k} defaultChecked={s.booking_mode === k} /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
      <label>Response commitment<select name="response_hours" className="ws-select" defaultValue={s.response_hours}>{[2, 4, 8, 12, 24].map(h => <option key={h} value={h}>Respond within {h} hours</option>)}</select></label>
      <small className="vw-hint"><Info aria-hidden="true" />You must respond within this time or the request expires (shown as “Expired / No response”).</small></section>
    <section className="ws-panel svw-holds"><div className="vw-sec-h"><span className="vw-ic"><ShieldAlert aria-hidden="true" /></span><div><h2>Holds, standby &amp; emergency</h2><p>Manage holds, standby options and emergency bookings.</p></div></div>
      <div className="svw-buffer"><Toggle name="holds" label="Allow conditional holds" sub="Temporarily hold your slot while the customer confirms." on={svc.holds?.enabled ?? true} /><select name="hold_hours" className="ws-select" defaultValue={svc.holds?.hours ?? 24} aria-label="Hold length">{[24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}</select></div>
      <Toggle name="standby" label="Offer standby option" sub="Be shown for last-minute or backup bookings." on={svc.standby?.enabled} />
      <Toggle name="emergency" label="Allow emergency bookings" sub="Appear in emergency search (within 48 hours)." on={svc.emergency?.enabled} />
      <p className="vw-info"><Info aria-hidden="true" /><span><b>Emergency eligibility</b><br />Emergency results need a verified profile, completed trust requirements and at least a 95% response rate.</span></p></section>
    <section className="ws-panel svw-sync"><div className="vw-sec-h"><span className="vw-ic"><CalendarDays aria-hidden="true" /></span><div><h2>Calendar sync &amp; integrations</h2><p>Keep your availability in sync with external calendars.</p></div></div>
      <ul>{["Google Calendar", "Outlook Calendar", "Apple Calendar"].map(c => <li key={c}><b>{c}</b><span className="vw-doc">Not connected</span><span className="ws-btn outline sm" aria-disabled="true" title="Calendar connections arrive with integrations — bookings already block your Gala Dock calendar">Connect</span></li>)}</ul>
      <p className="vw-info"><Info aria-hidden="true" /><span><b>Avoid double bookings</b><br />Confirmed bookings and holds always block your Gala Dock calendar, including setup and travel buffers.</span></p></section>
    <section className="ws-panel svw-ready"><h2><Sparkles aria-hidden="true" />Gala Agent readiness check</h2>
      <ul>{checks.map(([l, ok]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}{l}</li>)}</ul></section>
    <section className="ws-panel svw-verify"><h2><ShieldCheck aria-hidden="true" />Verification &amp; publish requirements</h2><p>Complete the following to publish on the marketplace.</p>
      <ul>{verify.map(([l, v, ok]) => <li key={l}><FileText aria-hidden="true" /><b>{l}</b><span className={`vw-doc ${ok ? "up" : ""}`}>{v}</span></li>)}</ul></section>
    <aside className="vw-side svw-side3"><PhotoManager venueId={s.id} initial={photos} compact title="Service preview" />
      <section className="ws-panel svw-pcard"><b>{s.name}</b><p>{s.description}</p><ul><li><Clock3 aria-hidden="true" />Responds within {s.response_hours} hours</li><li><CalendarDays aria-hidden="true" />{s.price_from ? `From ${money(s.price_from)}` : "Quote only"}</li></ul></section></aside>
    <Foot back={back} next={label ?? "Next: Media & Details"} step={3} />
  </ActionForm>;
}
