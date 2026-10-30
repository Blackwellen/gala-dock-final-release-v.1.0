import Link from "next/link";
import { Sparkles, Lightbulb, CircleCheck, CircleAlert, Info, ArrowLeft, ArrowRight, Save, MapPin, CalendarDays, Mail, HelpCircle, Truck, UtensilsCrossed, FileText, Users2,
  Accessibility, ClipboardList, Wand2, MoreVertical, Building2, UsersRound, LayoutGrid, FileCheck2, Tags, Landmark, Search, PoundSterling, Clock3, Percent, Ban, PauseCircle, Siren, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm, ActionButton } from "@/components/workspace/actions";
import { money } from "@/lib/workspace/format";
import type { Listing } from "@/lib/provider/queries";
import { saveIdentity, saveCommercialStep, saveOperations } from "./actions";
import { PhotoManager } from "../_components/photo-manager";
import { publishListing } from "../../listings/actions";
import { VenuePreview, RunCheck, Counted } from "./preview";
import { optionsFor, resolveTerm } from "@/lib/master-data";

type D = Record<string, unknown> & {
  type?: string; timezone?: string; address?: { line1?: string; line2?: string; city?: string; postcode?: string; country?: string }; geo?: { lat: number; lng: number } | null;
  contact?: { person?: string; email?: string; phone?: string };
  commercial?: { pricing?: string; rate_from?: number | null; rate_to?: number | null; variable_rates?: boolean; minimum_spend?: number; deposit_mode?: string; deposit_pct?: number | null; deposit_fixed?: number | null;
    balance_days?: number; security_deposit?: number; lead_days?: number; short_notice?: boolean; cancellation?: { window: string; refund: number }[];
    holds?: { enabled: boolean; hours: number }; standby?: { enabled: boolean; fee: number }; emergency?: { enabled: boolean; multiplier: number } };
  operations?: Record<string, string | boolean>; fnb?: Record<string, string | boolean>; suppliers?: Record<string, string>; access?: Record<string, string | boolean>;
  compliance?: { name: string; reference?: string; expires?: string; file?: string | null }[];
};
const TYPES = optionsFor("provider.venue_types");
/** The type option for a stored value (details.type, else the listing category — older venues only have the category), matched by canonical key
 *  so any spelling selects the right option; an unrecognised value is kept as its own option rather than silently replaced. */
const typeOf = (v: string) => TYPES.find(o => o.key === resolveTerm("venue_type", v))?.label ?? v;
const Toggle = ({ name, label, sub, on }: { name: string; label: string; sub?: string; on?: boolean }) =>
  <label className="vw-switch"><input type="checkbox" name={name} defaultChecked={!!on} /><i aria-hidden="true" /><span><b>{label}</b>{sub && <small>{sub}</small>}</span></label>;
const Foot = ({ back, next, step }: { back?: string; next: string; step: number }) => <div className="vw-foot">
  {back ? <Link href={back} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link> : <button type="submit" name="_draft" value="1" className="ws-btn outline"><Save aria-hidden="true" />Save draft</button>}
  <span className="ws-spacer" /><span className="vw-stepof">Step {step} of 6</span>
  <button type="submit" className="ws-btn primary">{next}<ArrowRight aria-hidden="true" /></button></div>;

export function StepIdentity({ venue, next }: { venue: Listing | null; next: string }) {
  const d = (venue?.details ?? {}) as D, a = d.address ?? {}, c = d.contact ?? {};
  const photos = venue ? [venue.image, ...(venue.gallery ?? [])].filter(Boolean) : [];
  const geo = d.geo ?? (venue?.lat != null && venue?.lng != null ? { lat: Number(venue.lat), lng: Number(venue.lng) } : null);
  const type = typeOf(d.type || venue?.category || "") || TYPES[0].label;
  const goal = (g: string) => `/provider/agent?goal=${encodeURIComponent(`${g}${venue ? ` for ${venue.name}` : ""}`)}`;
  return <div className="vw vw-s1">
    <ActionForm action={saveIdentity.bind(null, venue?.id ?? null, next)} className="vw-s1-form">
      <section className="ws-panel vw-identity"><h2>Venue identity</h2><p>Give your venue a clear name, type and summary to get started.</p>
        <div className="vw-grid2">
          <label>Venue name <i>*</i><input name="name" defaultValue={venue?.name ?? ""} required minLength={2} maxLength={100} /></label>
          <label>Timezone <i>*</i><select name="timezone" className="ws-select" defaultValue={d.timezone ?? "Europe/London"}><option value="Europe/London">Europe/London (UK)</option><option value="Europe/Dublin">Europe/Dublin (IE)</option></select></label>
          <label>Venue type <i>*</i><select name="type" className="ws-select" defaultValue={type}>
            {!TYPES.some(o => o.label === type) && <option>{type}</option>}{TYPES.map(o => <option key={o.key}>{o.label}</option>)}</select></label>
          <label>Contact person <i>*</i><input name="person" defaultValue={c.person ?? ""} required maxLength={80} /></label>
          <label className="vw-summary">Short summary <i>*</i><textarea name="summary" defaultValue={venue?.description ?? ""} required minLength={40} maxLength={500} rows={5} /></label>
          <div className="vw-stack">
            <label>Contact email <i>*</i><input name="email" type="email" defaultValue={c.email ?? ""} required maxLength={120} /></label>
            <label>Contact phone <i>*</i><span className="vw-phone"><em>🇬🇧</em><input name="phone" inputMode="tel" defaultValue={c.phone ?? ""} required maxLength={40} /></span></label>
          </div>
        </div></section>
      <section className="ws-panel vw-location"><div className="vw-loc-form"><h2>Location</h2><p>Set the address and find your venue on the map.</p>
        <label>Address line 1 <i>*</i><input name="line1" defaultValue={a.line1 ?? ""} required maxLength={120} /></label>
        <label>Address line 2<input name="line2" defaultValue={a.line2 ?? ""} placeholder="Suite, building, floor (optional)" maxLength={120} /></label>
        <div className="vw-grid2"><label>City <i>*</i><input name="city" defaultValue={a.city ?? venue?.city ?? ""} required maxLength={80} /></label>
          <label>Postcode <i>*</i><input name="postcode" defaultValue={a.postcode ?? ""} required maxLength={12} /></label></div>
        <label>Country <i>*</i><select name="country" className="ws-select" defaultValue={a.country ?? "United Kingdom"}><option>United Kingdom</option><option>Ireland</option></select></label></div>
        <div className="vw-map">
          <div className="vw-map-search"><MapPin aria-hidden="true" /><span>{[a.line1, a.city, a.postcode].filter(Boolean).join(", ") || "Enter the address to place your venue"}</span><Search aria-hidden="true" /></div>
          {geo ? <iframe title="Venue location" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${geo.lng - 0.008},${geo.lat - 0.004},${geo.lng + 0.008},${geo.lat + 0.004}&layer=mapnik&marker=${geo.lat},${geo.lng}`} />
            : <div className="vw-map-empty"><MapPin aria-hidden="true" />Save the address to place your venue on the map</div>}
          <p className={geo ? "ok" : ""}>{geo ? <><CircleCheck aria-hidden="true" />Location found</> : <><Info aria-hidden="true" />Not located yet</>}<a href={geo ? `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=17/${geo.lat}/${geo.lng}` : "#"} target="_blank" rel="noreferrer">{geo ? "Open in map" : ""}</a></p>
        </div></section>
      <Foot next="Next: Spaces & Map" step={1} />
    </ActionForm>
    <PhotoManager venueId={venue?.id ?? null} initial={photos} compact badge={venue?.published ? "Live" : "Draft (not visible)"} />
    <aside className="vw-side">
      <section className="ws-panel vw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
        <p className="vw-agent-msg">I can help you create a compelling venue listing. Would you like me to:</p>
        <ul>{([[Wand2, "Generate a venue description"], [Tags, "Suggest venue type and tags"], [Landmark, "Find nearby landmarks & transport"], [Search, "Optimise for marketplace search"]] as const).map(([I, l]) =>
          <li key={l}><Link href={goal(l)}><I aria-hidden="true" />{l}</Link></li>)}</ul></section>
      <section className="ws-panel vw-tips"><h3><Lightbulb aria-hidden="true" />Tips for a great venue listing</h3>
        <ul>{["Use a clear, memorable name", "Add high-quality photos", "Highlight unique features and capacity", "Include nearby transport and landmarks", "Keep your description concise and engaging"].map(t => <li key={t}><CircleCheck aria-hidden="true" />{t}</li>)}</ul></section>
    </aside>
  </div>;
}

export function StepCommercial({ venue, back, next }: { venue: Listing; back: string; next: string }) {
  const c = ((venue.details as D).commercial ?? {}) as NonNullable<D["commercial"]>;
  const pricing = c.pricing ?? "hourly", canc = c.cancellation ?? [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }];
  const depMode = c.deposit_mode ?? "percent";
  const summary: [typeof PoundSterling, string, string][] = [
    [PoundSterling, "Pricing mode", pricing === "quote" ? "Quote only" : `${pricing === "daily" ? "Day rate" : pricing === "package" ? "Package based" : pricing === "minimum" ? "Minimum spend" : "Hourly rate"}${c.rate_from ? ` (${money(c.rate_from)}${c.rate_to ? `–${money(c.rate_to)}` : ""})` : ""}`],
    [Percent, "Minimum spend", c.minimum_spend ? money(c.minimum_spend) : "None"], [Percent, "Deposit", depMode === "fixed" ? money(c.deposit_fixed ?? 0) : `${c.deposit_pct ?? 30}%`],
    [CalendarDays, "Balance due", `${c.balance_days ?? 14} days before event`], [Mail, "Booking mode", venue.booking_mode === "instant" ? "Instant booking" : venue.booking_mode === "enquiry" ? "Enquiry only" : "Request to book"],
    [Clock3, "Response commitment", `Within ${venue.response_hours} hours`], [CalendarDays, "Minimum lead time", `${c.lead_days ?? 0} days${c.short_notice ? " (short notice allowed)" : ""}`],
    [Ban, "Cancellation policy", canc.map(x => `${x.window}: ${x.refund}%`).join(" | ")], [PauseCircle, "Conditional holds", c.holds?.enabled ? `Enabled (${c.holds.hours} hours)` : "Off"],
    [Repeat, "Standby option", c.standby?.enabled ? `Enabled (${money(c.standby.fee)})` : "Off"], [Siren, "Emergency bookings", c.emergency?.enabled ? `Enabled (${c.emergency.multiplier}× rate)` : "Off"],
  ];
  return <ActionForm action={saveCommercialStep.bind(null, venue.id, next)} className="vw vw-s3">
    <section className="ws-panel vw-pricing"><h2>Pricing configuration</h2><p>Choose how you price this venue and set your base rates.</p>
      <div className="vw-seg">{[["hourly", "Hourly rate"], ["daily", "Day rate"], ["package", "Package based"], ["minimum", "Minimum spend"], ["quote", "Quote only"]].map(([k, l]) =>
        <label key={k}><input type="radio" name="pricing" value={k} defaultChecked={pricing === k} /><span>{l}</span></label>)}</div>
      <div className="vw-grid3"><label>Rate (from) <i>*</i><span className="vw-money"><em>£</em><input name="rate_from" type="number" min={0} defaultValue={c.rate_from ?? venue.price_from ?? ""} /></span></label>
        <label>Rate (to)<span className="vw-money"><em>£</em><input name="rate_to" type="number" min={0} defaultValue={c.rate_to ?? ""} /></span></label>
        <label>Currency<select className="ws-select" disabled defaultValue="GBP"><option value="GBP">GBP (£)</option></select></label></div>
      <div className="vw-boxrow"><Toggle name="variable_rates" label="Different rates by day/time" sub="Set custom rates for weekdays, weekends or seasonal periods." on={c.variable_rates} /></div>
      <div className="vw-pair"><div className="vw-minspend"><CalendarDays aria-hidden="true" /><span><b>Minimum spend <small>(optional)</small></b><small>Set a minimum total spend for bookings at this venue.</small></span>
        <span className="vw-money sm"><em>£</em><input name="minimum_spend" type="number" min={0} defaultValue={c.minimum_spend ?? ""} aria-label="Minimum spend" /></span></div>
        <p className="vw-info"><Info aria-hidden="true" />Use minimum spend for high-demand dates, weddings or exclusive hire.</p></div></section>
    <section className="ws-panel vw-deposits"><h2>Deposits &amp; payments</h2><p>Configure deposits and payment schedule.</p>
      <label>Deposit amount <i>*</i><span className="vw-dual"><select name="deposit_mode" className="ws-select" defaultValue={depMode}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select>
        <span className="vw-money"><input name="deposit" type="number" min={0} defaultValue={depMode === "fixed" ? c.deposit_fixed ?? "" : c.deposit_pct ?? 30} /><em className="r">{depMode === "fixed" ? "£" : "%"}</em></span></span></label>
      <small className="vw-hint"><Info aria-hidden="true" />Deposit required to confirm the booking</small>
      <label>Balance due<span className="vw-dual"><select className="ws-select" disabled defaultValue="before"><option value="before">Before event date</option></select>
        <span className="vw-money"><input name="balance_days" type="number" min={0} defaultValue={c.balance_days ?? 14} /><em className="r">days</em></span></span></label>
      <label>Security / damage deposit <small>(optional)</small><span className="vw-money"><em>£</em><input name="security_deposit" type="number" min={0} defaultValue={c.security_deposit ?? ""} /></span></label>
      <small className="vw-hint">Held securely and released after the event (see terms).</small></section>
    <aside className="vw-side">
      <section className="ws-panel vw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
        <div className="sb-agent-box"><p>Common practice for UK event venues:</p><ul className="vw-dots"><li>25–30% deposit to confirm</li><li>7–14 day cancellation window</li><li>2–4 hour response commitment</li><li>Higher rates on weekends</li></ul>
          <small>Guidance only — your terms are your own.</small></div></section>
      <section className="ws-panel vw-summary-card"><h2>Rules summary</h2><p>Review your commercial and booking rules.</p>
        <ul>{summary.map(([I, l, v]) => <li key={l}><I aria-hidden="true" /><b>{l}</b><span>{v}</span></li>)}</ul></section>
    </aside>
    <section className="ws-panel vw-mode"><h2>Booking mode</h2><p>Choose how customers can book this venue.</p>
      <div className="vw-radios">{([["instant", CalendarDays, "Instant booking", "Customers can book instantly if the date is available."], ["request", Mail, "Request to book", "Customers send a booking request that you must approve."],
        ["enquiry", HelpCircle, "Enquiry only", "Customers can only send an enquiry."]] as const).map(([k, I, l, sub]) =>
        <label key={k}><I aria-hidden="true" /><span><b>{l}</b><small>{sub}</small></span><input type="radio" name="booking_mode" value={k} defaultChecked={venue.booking_mode === k} /></label>)}</div>
      <small className="vw-hint">Instant booking needs a published rate.</small></section>
    <section className="ws-panel vw-response"><h2>Response &amp; lead time</h2><p>Set how quickly you respond and minimum lead time.</p>
      <div className="vw-pair"><label>Response commitment <i>*</i><select name="response_hours" className="ws-select" defaultValue={venue.response_hours}>{[2, 4, 8, 12, 24].map(h => <option key={h} value={h}>Within {h} hours</option>)}</select></label>
        <p className="vw-info"><Info aria-hidden="true" />You’ll be notified and the SLA is tracked on every request.</p></div>
      <div className="vw-pair"><label>Minimum lead time <i>*</i><span className="vw-money"><input name="lead_days" type="number" min={0} defaultValue={c.lead_days ?? 7} /><em className="r">days</em></span></label>
        <p className="vw-chip">Minimum notice required for new bookings.</p></div>
      <Toggle name="short_notice" label="Allow short-notice bookings" sub="Accept bookings with less than the lead time (subject to approval)." on={c.short_notice ?? true} /></section>
    <section className="ws-panel vw-cancel"><h2>Cancellation policy</h2><p>Set your cancellation terms and refund rules.</p>
      <div className="vw-cancel-grid"><div className="vw-cancel-rows"><div className="vw-cancel-h"><span>Cancellation period</span><span>Refund amount</span></div>
        {[0, 1, 2].map(i => <div key={i}><input name={`c_window_${i}`} defaultValue={canc[i]?.window ?? ""} placeholder={["7+ days", "3–7 days", "<3 days"][i]} aria-label={`Window ${i + 1}`} />
          <span className="vw-money"><input name={`c_refund_${i}`} type="number" min={0} max={100} defaultValue={canc[i]?.refund ?? ""} aria-label={`Refund ${i + 1}`} /><em className="r">% refund</em></span></div>)}</div>
        <p className="vw-info col"><Info aria-hidden="true" />These terms are shown to customers during booking and included in your terms. Accepted bookings keep the terms they were agreed on.</p></div></section>
    <section className="ws-panel vw-holds"><h2>Holds, standby &amp; emergency</h2><p>Configure availability holds and fallback options.</p>
      <div className="vw-hold"><Toggle name="holds" label="Allow conditional holds" sub="Temporarily hold dates while discussing with a customer." on={c.holds?.enabled ?? true} />
        <label>Hold duration<select name="hold_hours" className="ws-select" defaultValue={c.holds?.hours ?? 48}>{[24, 48, 72, 168].map(h => <option key={h} value={h}>{h} hours</option>)}</select></label></div>
      <div className="vw-hold"><Toggle name="standby" label="Offer standby option" sub="Allow customers to book a standby date if unavailable." on={c.standby?.enabled} />
        <label>Standby fee <small>(optional)</small><span className="vw-money"><em>£</em><input name="standby_fee" type="number" min={0} defaultValue={c.standby?.fee ?? ""} /></span></label></div>
      <div className="vw-hold"><Toggle name="emergency" label="Emergency bookings" sub="Allow last-minute bookings at premium rate." on={c.emergency?.enabled} />
        <label>Emergency rate multiplier<select name="emergency_multiplier" className="ws-select" defaultValue={c.emergency?.multiplier ?? 1.5}>{[1.25, 1.5, 2].map(x => <option key={x} value={x}>{x}× ({Math.round((x - 1) * 100)}% extra)</option>)}</select></label></div></section>
    <Foot back={back} next="Next: Operations" step={3} />
  </ActionForm>;
}

const fmtDate = (iso?: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";
export const COMPLIANCE_DOCS = ["Premises licence", "Public liability insurance", "Fire safety certificate", "Food hygiene rating"];

export function StepOperations({ venue, back, next, photosHref, readiness, photos, spaces, standing }: {
  venue: Listing; back: string; next: string; photosHref: string; readiness: [string, boolean][]; photos: string[]; spaces: number; standing: number;
}) {
  const d = venue.details as D, o = d.operations ?? {}, f = d.fnb ?? {}, s = d.suppliers ?? {}, a = d.access ?? {};
  const comp = d.compliance ?? [], others = comp.filter(c => !COMPLIANCE_DOCS.includes(c.name));
  const sel = (name: string, val: string | boolean | undefined, opts: string[]) => <select name={name} className="ws-select" defaultValue={String(val ?? opts[0])}>{opts.map(x => <option key={x}>{x}</option>)}</select>;
  const ready = readiness.every(([, ok]) => ok);
  const checks: [string, boolean, ReactNode?][] = [...readiness.map(([l, ok]): [string, boolean, ReactNode?] =>
    l.startsWith("Payout") && !ok ? [l, ok, <Link key="c" href="/provider/money" className="ws-btn outline vw-connect">Connect</Link>]
      : l.startsWith("Photos") ? [l, ok, <em key="n" className={`vw-photos ${ok ? "ok" : ""}`}>{photos.length}/3{ok && <CircleCheck aria-hidden="true" />}</em>] : [l, ok]), ["Ready to publish", ready]];
  const ad = d.address ?? {}, district = (ad.postcode ?? "").split(" ")[0];
  const chips = [{ icon: <Building2 aria-hidden="true" />, label: "Venue" }, { icon: <MapPin aria-hidden="true" />, label: [ad.city ?? venue.city, district].filter(Boolean).join(", ") || "Location not set" },
    ...(standing ? [{ icon: <UsersRound aria-hidden="true" />, label: `${standing.toLocaleString("en-GB")} standing` }] : []), { icon: <LayoutGrid aria-hidden="true" />, label: `${spaces} space${spaces === 1 ? "" : "s"}` }];
  return <ActionForm action={saveOperations.bind(null, venue.id, next)} className="vw vw-s4">
    <section className="ws-panel vw-ops"><div className="vw-sec-h"><span className="vw-ic"><Truck aria-hidden="true" /></span><div><h2>Access &amp; setup</h2><p>Define how suppliers and guests access, load in and set up at your venue.</p></div></div>
      <div className="vw-ops-grid"><div className="vw-ops-fields">
        <label>Access type{sel("access_type", o.access_type, ["Street access + loading bay", "Street access only", "Loading dock", "Restricted access"])}</label>
        <div className="vw-grid2"><label>Load in time (from){sel("load_in", o.load_in, ["2 hours before", "1 hour before", "3 hours before", "Morning of event"])}</label>
          <label>Load out time (by){sel("load_out", o.load_out, ["2 hours after", "1 hour after", "Next morning"])}</label></div>
        <label>Access notes<Counted name="access_notes" rows={4} max={500} defaultValue={String(o.access_notes ?? "")} /></label></div>
        <div className="vw-toggles"><Toggle name="f_parking" label="On-site parking" on={o.parking as boolean} /><Toggle name="f_loading" label="Loading bay" on={o.loading_bay as boolean} /><Toggle name="f_lift" label="Lift access" on={o.lift as boolean} />
          <Toggle name="f_stairs" label="Stair access" on={o.stairs as boolean} /><Toggle name="f_247" label="24/7 access" on={o.always_open as boolean} /></div></div></section>
    <section className="ws-panel vw-fnb"><div className="vw-sec-h"><span className="vw-ic"><UtensilsCrossed aria-hidden="true" /></span><div><h2>Food &amp; beverage / bar</h2><p>Set your catering, bar and beverage options.</p></div></div>
      <div className="vw-grid2"><label>In-house catering{sel("catering", f.catering, ["Available", "Not available", "Preferred partner"])}</label><label>Bar facilities{sel("bar", f.bar, ["Full bar (licensed)", "Beer & wine", "No bar"])}</label>
        <label>External catering permitted{sel("external_catering", f.external_catering, ["Allowed with approval", "Allowed", "Not permitted"])}</label><label>Corkage policy{sel("corkage", f.corkage, ["Not permitted", "Permitted (fee)", "Permitted (free)"])}</label></div>
      <div className="vw-grid2 vw-tg"><Toggle name="cash_bar" label="Cash bar" on={f.cash_bar as boolean} /><Toggle name="drink_packages" label="Pre-paid drink packages" on={f.drink_packages as boolean} /></div>
      <label>F&amp;B notes<Counted name="fnb_notes" rows={2} max={500} defaultValue={String(f.notes ?? "")} /></label></section>
    <aside className="vw-side">
      <VenuePreview photos={photos} name={venue.name} chips={chips} editHref={photosHref} publicHref={venue.published && venue.slug ? `/venues/${venue.slug}` : null} />
      <section className="ws-panel vw-ready"><div className="vw-ready-h"><h2><Sparkles aria-hidden="true" />Gala Agent readiness check</h2><RunCheck /></div>
        <ul>{checks.map(([l, ok, extra]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span>{extra}</li>)}</ul>
        {ready ? <p className="vw-ready-ok"><CircleCheck aria-hidden="true" /><span><b>Ready to publish</b><small>Your venue meets all marketplace requirements and is ready to be published.</small></span></p>
          : <p className="vw-ready-no"><CircleAlert aria-hidden="true" /><span><b>Not ready yet</b><small>Finish the items above — publishing re-runs these checks.</small></span></p>}
        {venue.published ? <Link href={`/provider/venues/${venue.id}`} className="ws-btn primary vw-publish">Live on marketplace<ArrowRight aria-hidden="true" /></Link>
          : <ActionButton variant="primary" className="vw-publish" action={publishListing} args={[venue.id]}>Publish venue<ArrowRight aria-hidden="true" /></ActionButton>}
        <button type="submit" name="_draft" value="1" className="ws-btn outline vw-draft"><Save aria-hidden="true" />Save as draft</button></section>
    </aside>
    <section className="ws-panel vw-docs"><div className="vw-sec-h"><span className="vw-ic"><FileText aria-hidden="true" /></span><div><h2>Licences &amp; compliance</h2><p>Add required licences, safety certificates and compliance details.</p></div></div>
      <ul>{COMPLIANCE_DOCS.map((n, i) => { const x = comp.find(c => c.name === n), st = x?.file ? "up" : x?.reference || x?.expires ? "added" : "";
        return <li key={n}><details><summary><span className={`vw-doc-ic ${st}`}><FileCheck2 aria-hidden="true" /></span><b>{n}</b>
          <span className={`vw-doc ${st}`}>{x?.file ? "Uploaded" : st ? "Added" : "Missing"}</span>
          <span className="vw-doc-exp">{x?.expires ? `Expires ${fmtDate(x.expires)}` : x?.reference || "Not recorded"}</span>
          <span className="vw-doc-more" aria-label={`Edit ${n}`}><MoreVertical aria-hidden="true" /></span></summary>
          <div className="vw-doc-edit"><input name={`doc_ref_${i}`} placeholder={n === "Food hygiene rating" ? "Rating, e.g. 5 (Very Good)" : "Reference"} defaultValue={x?.reference ?? ""} aria-label={`${n} reference`} maxLength={60} />
            <input name={`doc_exp_${i}`} type="date" defaultValue={x?.expires ?? ""} aria-label={`${n} expiry`} /></div></details></li>; })}
        <li><details className="vw-other"><summary><span className="vw-doc-ic"><FileText aria-hidden="true" /></span><b>Other certificates</b><span className="vw-doc added">{others.length} document{others.length === 1 ? "" : "s"}</span>
          <span className="ws-btn outline vw-manage">Manage documents</span></summary>
          <div className="vw-doc-others">{[...others, { name: "", reference: "", expires: "" }].map((x, k) => <div key={k}>
            <input name={`other_name_${k}`} placeholder="Certificate name" defaultValue={x.name} maxLength={60} aria-label={`Other certificate ${k + 1} name`} />
            <input name={`other_ref_${k}`} placeholder="Reference" defaultValue={x.reference ?? ""} maxLength={60} aria-label={`Other certificate ${k + 1} reference`} />
            <input name={`other_exp_${k}`} type="date" defaultValue={x.expires ?? ""} aria-label={`Other certificate ${k + 1} expiry`} /></div>)}
            <small>Clear a name to remove that certificate, then save.</small></div></details></li></ul></section>
    <section className="ws-panel vw-sup"><div className="vw-sec-h"><span className="vw-ic"><Users2 aria-hidden="true" /></span><div><h2>Supplier rules</h2><p>Set rules for external suppliers, equipment and services.</p></div></div>
      <div className="vw-grid2"><label>Preferred supplier list{sel("preferred", s.preferred, ["Recommended only", "Mandatory", "None"])}</label><label>External suppliers{sel("external", s.external, ["Allowed with approval", "Allowed", "Not permitted"])}</label>
        <label>Equipment hire{sel("equipment", s.equipment, ["Allowed", "Approved suppliers only", "Not permitted"])}</label><label>Noise restrictions{sel("noise", s.noise, ["Standard (11pm cut-off)", "Strict (10pm cut-off)", "None"])}</label></div>
      <label>Supplier notes<Counted name="supplier_notes" rows={2} max={500} defaultValue={s.notes ?? ""} /></label></section>
    <section className="ws-panel vw-acc"><div className="vw-sec-h"><span className="vw-ic"><Accessibility aria-hidden="true" /></span><div><h2>Accessibility &amp; inclusion</h2><p>Provide accessibility information for guests and staff.</p></div></div>
      <div className="vw-acc-grid"><div className="vw-grid2 vw-tg"><Toggle name="a_stepfree" label="Step-free access" on={a.step_free as boolean} /><Toggle name="a_loop" label="Hearing loop" on={a.hearing_loop as boolean} />
        <Toggle name="a_toilets" label="Accessible toilets" on={a.toilets as boolean} /><Toggle name="a_parking" label="Accessible parking" on={a.parking as boolean} /><Toggle name="a_lift" label="Lift access" on={a.lift as boolean} /><Toggle name="a_assist" label="Assistance available" on={a.assistance as boolean} /></div>
        <label>Accessibility notes<Counted name="a_notes" rows={4} max={500} defaultValue={String(a.notes ?? "")} /></label></div></section>
    <section className="ws-panel vw-notes"><div className="vw-sec-h"><span className="vw-ic"><ClipboardList aria-hidden="true" /></span><div><h2>Operational notes</h2><p>Add any additional operational information.</p></div></div>
      <Counted name="ops_notes" rows={3} max={500} defaultValue={String(o.notes ?? "")} placeholder="Setup time, turnaround requirements, waste management, security requirements and any other operational details." label="Operational notes" /></section>
    <Foot back={back} next="Next: Media & Details" step={4} />
  </ActionForm>;
}
